'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#3949ab', // J - dark blue
  '#2bd9a6', // L - aquamarine
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const LINE_LABELS = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'];
const CLEAR_MS = 350;  // duración de la animación de borrado de líneas
const POPUP_MS = 1000; // duración del texto flotante con los puntos
const LOCK_DELAY_MS = 500;   // margen en el suelo antes de fijar la pieza (0 = sin margen)
const MAX_LOCK_RESETS = 15;  // movimientos/giros en el suelo que reinician ese margen

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdCtx = holdCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const overlayRecord = document.getElementById('overlay-record');
const overlayScores = document.getElementById('overlay-scores');
const restartBtn = document.getElementById('restart-btn');
const scoresModal = document.getElementById('scores-modal');
const scoresList = document.getElementById('scores-list');
const scoresCloseBtn = document.getElementById('scores-close-btn');
const scoresStats = document.getElementById('scores-stats');
const scoresResetBtn = document.getElementById('scores-reset-btn');
const overlayStats = document.getElementById('overlay-stats');
const nameForm = document.getElementById('name-form');
const nameInput = document.getElementById('name-input');
const nameSaveBtn = document.getElementById('name-save-btn');
const startScreen = document.getElementById('start-screen');
const startScores = document.getElementById('start-scores');
const startStats = document.getElementById('start-stats');
const startBtn = document.getElementById('start-btn');
const startResetBtn = document.getElementById('start-reset-btn');
const themeButtons = document.querySelectorAll('[data-theme-option]');
const THEME_KEY = 'tetris-theme';
const SCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';        // récords históricos { bestCombo, maxLines }
const PLAYER_NAME_KEY = 'tetris-player-name';
const MAX_SCORES = 5;
const MAX_NAME_LEN = 10;

let started = false; // false mientras se muestra la pantalla de inicio
let board, current, next, held, holdUsed, score, lines, level, combo, maxCombo, pendingScore, paused, gameOver, scoresOpen, pausedByScores, clearing, popups, lastTime, dropAccum, dropInterval, lockTimer, lockResets, lowestY, animId;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function createPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return createPiece(Math.floor(Math.random() * 7) + 1);
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      onPieceMoved();
      return;
    }
  }
}

function tryShift(dx) {
  if (collide(current.shape, current.x + dx, current.y)) return;
  current.x += dx;
  onPieceMoved();
}

// ---- Lock delay ----
// La pieza que toca el suelo espera LOCK_DELAY_MS antes de fijarse. Mover o
// rotar en el suelo reinicia la espera hasta MAX_LOCK_RESETS veces; bajar a
// una fila nueva devuelve todos los reinicios (evita bloquear el juego girando).
function resetLock() {
  lockTimer = 0;
  lockResets = 0;
  lowestY = current.y;
}

function onPieceMoved() {
  if (lockTimer > 0 && lockResets < MAX_LOCK_RESETS) {
    lockTimer = 0;
    lockResets++;
  }
}

function stepDown() {
  current.y++;
  if (current.y > lowestY) resetLock();
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function fullRows() {
  const rows = [];
  for (let r = 0; r < ROWS; r++)
    if (board[r].every(v => v !== 0)) rows.push(r);
  return rows;
}

// Puntúa las filas completas y arranca la animación; se eliminan en finishClear()
function clearLines(rows) {
  const points = (LINE_SCORES[rows.length] || 0) * level;
  lines += rows.length;
  score += points;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  // combo: piezas consecutivas que borran al menos una línea
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  updateHUD();
  clearing = { rows, elapsed: 0 };
  const midRow = (rows[0] + rows[rows.length - 1] + 1) / 2;
  const label = LINE_LABELS[rows.length] + (combo > 1 ? ` · COMBO x${combo}` : '');
  popups.push({ text: `+${points.toLocaleString()}`, label, y: midRow * BLOCK, elapsed: 0 });
}

function finishClear() {
  for (const r of clearing.rows) {
    board.splice(r, 1);
    board.unshift(new Array(COLS).fill(0));
  }
  clearing = null;
  dropAccum = 0;
  spawn();
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

// En el suelo no fija la pieza: eso lo hace el lock delay (o el hard drop)
function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    stepDown();
    dropAccum = 0;
    score += 1;
    updateHUD();
  }
}

function lockPiece() {
  merge();
  const rows = fullRows();
  if (rows.length) clearLines(rows); // spawn() tras la animación
  else {
    combo = 0;
    spawn();
  }
}

function spawn() {
  current = next;
  next = randomPiece();
  holdUsed = false;
  resetLock();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
  drawHold();
}

// Guarda la pieza actual en el hold (o la intercambia). Una vez por pieza.
function holdPiece() {
  if (holdUsed) return;
  const type = current.type;
  if (held) {
    current = createPiece(held);
    resetLock();
    if (collide(current.shape, current.x, current.y)) endGame();
  } else {
    spawn();
  }
  held = type;
  holdUsed = true;
  drawHold();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (clearing) {
    drawClearing();
  } else if (!gameOver && current) {
    drawPiece(); // en game over no se pinta la pieza que ya no cabe
  }
  drawPopups();
}

// Filas completas: destello blanco y las celdas desaparecen del centro hacia fuera
function drawClearing() {
  const p = Math.min(1, clearing.elapsed / CLEAR_MS);
  const gone = p * COLS / 2;
  for (const r of clearing.rows) {
    ctx.clearRect(0, r * BLOCK, COLS * BLOCK, BLOCK);
    for (let c = 0; c < COLS; c++)
      if (Math.abs(c + 0.5 - COLS / 2) > gone) drawBlock(ctx, c, r, board[r][c], BLOCK);
    ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
    ctx.fillRect(0, r * BLOCK, COLS * BLOCK, BLOCK);
  }
}

// Puntos ganados: suben y se desvanecen
function drawPopups() {
  const css = getComputedStyle(document.documentElement);
  const fill = css.getPropertyValue('--accent').trim();
  const stroke = css.getPropertyValue('--canvas-bg').trim();
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.fillStyle = fill;
  ctx.strokeStyle = stroke;
  for (const pop of popups) {
    const p = pop.elapsed / POPUP_MS;
    const y = pop.y - p * 40;
    ctx.globalAlpha = p < 0.7 ? 1 : (1 - p) / 0.3;
    ctx.lineWidth = 4;
    ctx.font = `800 ${24 + Math.min(1, p * 6) * 4}px system-ui, sans-serif`;
    ctx.strokeText(pop.text, COLS * BLOCK / 2, y);
    ctx.fillText(pop.text, COLS * BLOCK / 2, y);
    if (pop.label) {
      ctx.lineWidth = 3;
      ctx.font = '700 13px system-ui, sans-serif';
      ctx.strokeText(pop.label, COLS * BLOCK / 2, y - 24);
      ctx.fillText(pop.label, COLS * BLOCK / 2, y - 24);
    }
  }
  ctx.restore();
}

function drawPiece() {
  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

// Dibuja una pieza centrada en un canvas de vista previa 4×4 (next / hold),
// con celdas de BLOCK px para que coincidan con las del tablero
function drawPreview(context, shape) {
  const NB = BLOCK;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  if (!shape) return;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, offX + c, offY + r, shape[r][c], NB);
}

function drawNext() {
  drawPreview(nextCtx, next.shape);
}

function drawHold() {
  drawPreview(holdCtx, held ? PIECES[held] : null);
  holdCanvas.classList.toggle('locked', holdUsed);
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* almacenamiento no disponible */ }
  themeButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.themeOption === theme)));
  // repintar aunque el bucle esté detenido (pausa / game over)
  // (también en la pantalla de inicio, con el tablero vacío)
  if (board) draw();
  if (current) { drawNext(); drawHold(); }
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
}

// ---- Tabla de récords (localStorage) ----
// Entradas: { name, score, lines, level, maxCombo, date }. Las antiguas sin
// nombre ni combo se siguen mostrando ("---" y 0).
function loadScores() {
  try {
    const list = JSON.parse(localStorage.getItem(SCORES_KEY));
    return Array.isArray(list) ? list.filter(s => Number.isFinite(s?.score)) : [];
  } catch (e) {
    return [];
  }
}

// ¿Entra esta puntuación en el top MAX_SCORES?
function qualifies(pts) {
  if (pts <= 0) return false;
  const list = loadScores();
  return list.length < MAX_SCORES || pts > list[list.length - 1].score;
}

// Guarda la entrada si entra en el top; devuelve su posición o -1
function saveScore(entry) {
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_SCORES);
  try { localStorage.setItem(SCORES_KEY, JSON.stringify(list)); } catch (e) { /* almacenamiento no disponible */ }
  return list.indexOf(entry);
}

// Mejor combo y máximo de líneas de todas las partidas (entren o no en el top)
function loadStats() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(STATS_KEY)); } catch (e) { /* ignorar */ }
  const stats = {
    bestCombo: Number.isFinite(stored?.bestCombo) ? stored.bestCombo : 0,
    maxLines: Number.isFinite(stored?.maxLines) ? stored.maxLines : 0,
  };
  // compatibilidad: récords guardados antes de que existiera tetris-stats
  for (const s of loadScores()) {
    stats.bestCombo = Math.max(stats.bestCombo, Number(s.maxCombo) || 0);
    stats.maxLines = Math.max(stats.maxLines, Number(s.lines) || 0);
  }
  return stats;
}

function saveStats() {
  const stats = loadStats();
  stats.bestCombo = Math.max(stats.bestCombo, maxCombo);
  stats.maxLines = Math.max(stats.maxLines, lines);
  try { localStorage.setItem(STATS_KEY, JSON.stringify(stats)); } catch (e) { /* almacenamiento no disponible */ }
}

function loadPlayerName() {
  try { return localStorage.getItem(PLAYER_NAME_KEY) || ''; } catch (e) { return ''; }
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords? Esta acción no se puede deshacer.')) return;
  try {
    localStorage.removeItem(SCORES_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (e) { /* almacenamiento no disponible */ }
  renderRecords(startScores, startStats, -1);
  renderRecords(scoresList, scoresStats, -1);
  // Game Over detrás del modal: refrescar su tabla (la partida pendiente sigue entrando)
  if (gameOver) renderRecords(overlayScores, overlayStats, -1);
}

function renderScores(listEl, highlight) {
  const list = loadScores();
  listEl.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin puntajes todavía';
    listEl.append(li);
    return;
  }
  list.forEach((s, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'highlight';
    const n = Number(s.lines) || 0, c = Number(s.maxCombo) || 0;
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = (typeof s.name === 'string' && s.name.trim()) ? s.name : '---';
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = s.score.toLocaleString();
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `L${n} · C${c}`;
    meta.title = `Líneas: ${n} · Nivel: ${Number(s.level) || 1} · Mejor combo: ${c}`;
    li.append(rank, name, pts, meta);
    listEl.append(li);
  });
}

function renderStats(el) {
  const { bestCombo, maxLines } = loadStats();
  el.replaceChildren();
  for (const [label, value] of [['Mejor combo', `x${bestCombo}`], ['Máx. líneas', maxLines]]) {
    const item = document.createElement('span');
    const strong = document.createElement('strong');
    strong.textContent = value;
    item.append(`${label}: `, strong);
    el.append(item);
  }
}

function renderRecords(listEl, statsEl, highlight) {
  renderScores(listEl, highlight);
  renderStats(statsEl);
}

// Modal de puntajes (tecla M): pausa el juego mientras está abierto
function openScores() {
  if (scoresOpen) return;
  scoresOpen = true;
  if (!paused && !gameOver) {
    paused = true;
    pausedByScores = true;
    cancelAnimationFrame(animId);
  }
  renderRecords(scoresList, scoresStats, -1);
  scoresModal.classList.remove('hidden');
}

function closeScores() {
  if (!scoresOpen) return;
  scoresOpen = false;
  scoresModal.classList.add('hidden');
  if (pausedByScores) {
    pausedByScores = false;
    paused = false;
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  }
}

function endGame() {
  if (gameOver) return;
  gameOver = true;
  cancelAnimationFrame(animId);
  saveStats(); // récords históricos, aunque la partida no entre en el top
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()} · Líneas: ${lines} · Combo: x${maxCombo}`;
  if (qualifies(score)) {
    // entra en el top: pedir el nombre antes de guardarla
    pendingScore = { score, lines, level, maxCombo, date: Date.now() };
    const list = loadScores();
    overlayRecord.textContent = (!list.length || score > list[0].score) ? '¡Nuevo récord!' : `¡Entras en el top ${MAX_SCORES}!`;
    nameInput.value = loadPlayerName();
    nameForm.classList.remove('hidden');
  } else {
    pendingScore = null;
    overlayRecord.textContent = '';
    nameForm.classList.add('hidden');
  }
  renderRecords(overlayScores, overlayStats, -1);
  overlayScores.classList.remove('hidden');
  overlayStats.classList.remove('hidden');
  overlay.classList.remove('hidden');
  if (pendingScore) {
    nameInput.focus();
    nameInput.select();
  }
}

// Guarda la puntuación pendiente con el nombre escrito; devuelve su posición o -1
function commitPendingScore() {
  if (!pendingScore) return -1;
  const name = nameInput.value.trim().slice(0, MAX_NAME_LEN) || '---';
  if (name !== '---') {
    try { localStorage.setItem(PLAYER_NAME_KEY, name); } catch (e) { /* almacenamiento no disponible */ }
  }
  const rank = saveScore({ name, ...pendingScore });
  pendingScore = null;
  nameForm.classList.add('hidden');
  return rank;
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlayRecord.textContent = '';
    overlayScores.classList.add('hidden');
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  for (const pop of popups) pop.elapsed += dt;
  popups = popups.filter(pop => pop.elapsed < POPUP_MS);
  if (clearing) {
    // la gravedad se detiene mientras se borran las líneas
    clearing.elapsed += dt;
    if (clearing.elapsed >= CLEAR_MS) finishClear();
  } else if (collide(current.shape, current.x, current.y + 1)) {
    // en el suelo: margen para corregir la posición antes de fijarla
    dropAccum = 0;
    if ((lockTimer += dt) >= LOCK_DELAY_MS) lockPiece();
  } else if ((dropAccum += dt) >= dropInterval) {
    dropAccum = 0;
    stepDown();
  }
  draw();
  // endGame() puede haberse llamado en este frame: no volver a programar el bucle
  if (!gameOver) animId = requestAnimationFrame(loop);
}

function init() {
  commitPendingScore(); // reiniciar sin pulsar "Guardar" no pierde el récord
  started = true;
  startScreen.classList.add('hidden');
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  held = null;
  clearing = null;
  popups = [];
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  nameForm.classList.add('hidden');
  overlayStats.classList.add('hidden');
  scoresOpen = false;
  pausedByScores = false;
  scoresModal.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // escribiendo el nombre: las teclas no controlan el juego
  if (e.target instanceof HTMLInputElement) return;
  if (!started) {
    // pantalla de inicio: solo empezar o cambiar el tema
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      init();
    } else if (e.code === 'KeyT') {
      toggleTheme();
    }
    return;
  }
  if (e.code === 'KeyM') { scoresOpen ? closeScores() : openScores(); return; }
  if (scoresOpen) {
    if (e.code === 'Escape') closeScores();
    return;
  }
  if (e.code === 'KeyP') { togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (paused || gameOver || clearing) return;
  switch (e.code) {
    case 'ArrowLeft':
      tryShift(-1);
      break;
    case 'ArrowRight':
      tryShift(1);
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
    case 'KeyC':
    case 'ShiftLeft':
    case 'ShiftRight':
      holdPiece();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  init();
  restartBtn.blur();
});

startBtn.addEventListener('click', () => {
  startBtn.blur();
  if (!started) init();
});

nameForm.addEventListener('submit', e => {
  e.preventDefault();
  if (!pendingScore) return; // doble Enter / doble clic: ya guardada
  const rank = commitPendingScore();
  overlayRecord.textContent = rank === 0 ? '¡Nuevo récord!' : rank > 0 ? `¡Puesto ${rank + 1} del top ${MAX_SCORES}!` : '';
  renderRecords(overlayScores, overlayStats, rank);
  nameInput.blur();
  nameSaveBtn.blur();
});

[startResetBtn, scoresResetBtn].forEach(btn => btn.addEventListener('click', () => {
  btn.blur();
  resetRecords();
}));

scoresCloseBtn.addEventListener('click', () => {
  closeScores();
  scoresCloseBtn.blur(); // evita que Space active el botón
});

themeButtons.forEach(btn => btn.addEventListener('click', () => {
  applyTheme(btn.dataset.themeOption);
  btn.blur(); // evita que Space active el botón
}));

// Fuera de init(): reiniciar la partida no cambia el tema
let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
// Pantalla de inicio: tablero vacío y sin bucle hasta pulsar "Jugar"
board = createBoard();
popups = [];
clearing = null;
applyTheme(savedTheme === 'light' ? 'light' : 'dark');
renderRecords(startScores, startStats, -1);
