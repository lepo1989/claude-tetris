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
const resetBtn = document.getElementById('reset-btn');
const themeButtons = document.querySelectorAll('[data-theme-option]');
const THEME_KEY = 'tetris-theme';
const SCORES_KEY = 'tetris-highscores';
const MAX_SCORES = 5;
const STATS_KEY = 'tetris-stats';   // { bestCombo, maxLines } de todas las partidas
const PLAYER_KEY = 'tetris-player'; // último nombre usado
const DEFAULT_NAME = 'Jugador';

let board, current, next, held, holdUsed, score, lines, level, combo, maxCombo, savedEntryDate, paused, gameOver, scoresOpen, pausedByScores, clearing, popups, lastTime, dropAccum, dropInterval, lockTimer, lockResets, lowestY, animId;

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
  const label = LINE_LABELS[rows.length] + (combo > 1 ? ` · COMBO x${combo}` : '');
  lines += rows.length;
  score += points;
  level = Math.floor(lines / 10) + 1;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  updateHUD();
  clearing = { rows, elapsed: 0 };
  const midRow = (rows[0] + rows[rows.length - 1] + 1) / 2;
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

// Combo = piezas seguidas que completan alguna línea
function lockPiece() {
  merge();
  const rows = fullRows();
  if (rows.length) {
    combo++;
    maxCombo = Math.max(maxCombo, combo);
    clearLines(rows); // spawn() tras la animación
  } else {
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
  } else if (!gameOver) {
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
  if (current) { draw(); drawNext(); drawHold(); }
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light');
}

// ---- Récords (localStorage) ----
function store(key, value) {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch (e) { /* almacenamiento no disponible */ }
}

function loadScores() {
  try {
    const list = JSON.parse(localStorage.getItem(SCORES_KEY));
    return Array.isArray(list) ? list.filter(s => Number.isFinite(s?.score)) : [];
  } catch (e) {
    return [];
  }
}

function loadStats() {
  try {
    const s = JSON.parse(localStorage.getItem(STATS_KEY));
    return { bestCombo: Number(s?.bestCombo) || 0, maxLines: Number(s?.maxLines) || 0 };
  } catch (e) {
    return { bestCombo: 0, maxLines: 0 };
  }
}

function loadPlayerName() {
  try { return localStorage.getItem(PLAYER_KEY) || DEFAULT_NAME; } catch (e) { return DEFAULT_NAME; }
}

// Guarda la partida si entra en el top; devuelve su posición o -1
function saveScore() {
  if (score <= 0) return -1;
  const entry = { name: loadPlayerName(), score, lines, level, combo: maxCombo, date: Date.now() };
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  list.length = Math.min(list.length, MAX_SCORES);
  store(SCORES_KEY, list);
  const rank = list.indexOf(entry);
  savedEntryDate = rank >= 0 ? entry.date : null;
  return rank;
}

// Actualiza el mejor combo / líneas máximas; devuelve qué récords se han batido
function saveStats() {
  const stats = loadStats();
  const isNew = { combo: maxCombo > stats.bestCombo, lines: lines > stats.maxLines };
  if (isNew.combo) stats.bestCombo = maxCombo;
  if (isNew.lines) stats.maxLines = lines;
  if (isNew.combo || isNew.lines) store(STATS_KEY, stats);
  return isNew;
}

// El nombre se edita en el game over sobre la entrada ya guardada
function renameEntry() {
  const name = nameInput.value.trim() || DEFAULT_NAME;
  store(PLAYER_KEY, name);
  const list = loadScores();
  const i = list.findIndex(s => s.date === savedEntryDate);
  if (i < 0) return;
  list[i].name = name;
  store(SCORES_KEY, list);
  renderScores(overlayScores, i);
}

function resetRecords() {
  if (!confirm('¿Borrar todos los récords?')) return;
  try {
    localStorage.removeItem(SCORES_KEY);
    localStorage.removeItem(STATS_KEY);
  } catch (e) { /* almacenamiento no disponible */ }
  savedEntryDate = null;
  nameForm.hidden = true;
  overlayRecord.textContent = '';
  renderScores(overlayScores, -1);
  renderStats(overlayStats);
  renderScores(scoresList, -1);
  renderStats(scoresStats);
}

function renderScores(listEl, highlight) {
  const list = loadScores();
  listEl.replaceChildren();
  if (!list.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin récords todavía';
    listEl.append(li);
    return;
  }
  list.forEach((s, i) => {
    const li = document.createElement('li');
    if (i === highlight) li.className = 'highlight';
    const rank = document.createElement('span');
    rank.className = 'rank';
    rank.textContent = `${i + 1}.`;
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = s.name || '—';
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = s.score.toLocaleString();
    const meta = document.createElement('span');
    meta.className = 'meta';
    meta.textContent = `${s.lines} lín · niv ${s.level}` + (s.combo ? ` · combo x${s.combo}` : '');
    li.append(rank, name, pts, meta);
    listEl.append(li);
  });
}

function renderStats(el, isNew = {}) {
  const { bestCombo, maxLines } = loadStats();
  const item = (label, value, highlight) => {
    const div = document.createElement('div');
    div.className = highlight ? 'stat highlight' : 'stat';
    const l = document.createElement('span');
    l.className = 'label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'stat-value';
    v.textContent = value;
    div.append(l, v);
    return div;
  };
  el.replaceChildren(
    item('MEJOR COMBO', bestCombo ? `x${bestCombo}` : '—', isNew.combo),
    item('LÍNEAS MÁX.', maxLines || '—', isNew.lines),
  );
}

// Overlay compartido: 'start' (pantalla de inicio), 'pause' y 'gameover'
function showOverlay(mode) {
  const withRecords = mode !== 'pause';
  overlay.dataset.mode = mode;
  overlayScores.classList.toggle('hidden', !withRecords);
  overlayStats.hidden = !withRecords;
  resetBtn.hidden = mode !== 'start';
  nameForm.hidden = true;
  restartBtn.textContent = mode === 'start' ? 'Jugar' : 'Reiniciar';
  overlay.classList.remove('hidden');
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
  renderScores(scoresList, -1);
  renderStats(scoresStats);
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
  const rank = saveScore();
  const isNew = saveStats();
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlayRecord.textContent = rank === 0 ? '¡Nuevo récord!'
    : rank > 0 ? `¡Entras en el top ${MAX_SCORES}! Puesto ${rank + 1}` : '';
  renderScores(overlayScores, rank);
  renderStats(overlayStats, isNew);
  showOverlay('gameover');
  if (rank >= 0) {
    nameForm.hidden = false;
    nameInput.value = loadPlayerName();
    nameInput.focus();
    nameInput.select();
  }
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
    showOverlay('pause');
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

// Estado de una partida nueva, sin arrancar el bucle
function resetGame() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  combo = 0;
  maxCombo = 0;
  savedEntryDate = null;
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
  scoresOpen = false;
  pausedByScores = false;
  scoresModal.classList.add('hidden');
  cancelAnimationFrame(animId);
}

function init() {
  resetGame();
  overlay.classList.add('hidden');
  animId = requestAnimationFrame(loop);
}

// Pantalla de inicio: tablero vacío y récords. Sin partida en curso, así que
// se marca como gameOver (ignora teclas de juego y pausa) hasta pulsar Jugar.
function showStart() {
  resetGame();
  gameOver = true;
  draw();
  overlayTitle.textContent = 'RÉCORDS';
  overlayScore.textContent = '';
  overlayRecord.textContent = '';
  renderScores(overlayScores, -1);
  renderStats(overlayStats);
  showOverlay('start');
  restartBtn.focus();
}

document.addEventListener('keydown', e => {
  if (e.target === nameInput) return; // escribiendo el nombre
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
  restartBtn.blur(); // evita que Space active el botón
  init();
});

nameInput.addEventListener('input', renameEntry);
nameForm.addEventListener('submit', e => {
  e.preventDefault();
  restartBtn.focus(); // Enter guarda el nombre; otro Enter reinicia
});

[resetBtn, scoresResetBtn].forEach(btn => btn.addEventListener('click', () => {
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
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

showStart();
