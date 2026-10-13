'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// ---- Skins ----
// Cada skin tiene su paleta (índice = tipo de pieza 1–7; el 0 es celda vacía)
// y su propia función para dibujar un bloque en (px, py) de lado `size`.
const SKINS = {
  retro: {
    // bloques cuadrados con colores planos
    colors: [null, '#4dd0e1', '#ffd54f', '#ba68c8', '#81c784', '#e57373', '#3949ab', '#2bd9a6'],
    drawBlock: drawRetroBlock,
  },
  neon: {
    // fondo negro y resplandor con shadowBlur
    colors: [null, '#00f0ff', '#fff200', '#ff3df5', '#39ff14', '#ff2d55', '#4d6bff', '#ff9f1a'],
    drawBlock: drawNeonBlock,
  },
  pastel: {
    // colores suaves y bordes redondeados
    colors: [null, '#a6e3f0', '#fbe7a1', '#d7b9f0', '#b5e3b5', '#f5b3b3', '#a9b9f2', '#b1ead6'],
    drawBlock: drawPastelBlock,
  },
  pixel: {
    // textura de píxeles dibujada sobre cada bloque
    colors: [null, '#29b6f6', '#fdd835', '#ab47bc', '#66bb6a', '#ef5350', '#3f51b5', '#26a69a'],
    drawBlock: drawPixelBlock,
  },
};
const SKIN_ORDER = Object.keys(SKINS);

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
const skinButtons = document.querySelectorAll('[data-skin-option]');
const THEME_KEY = 'tetris-theme';
const SKIN_KEY = 'tetris-skin';
const SCORES_KEY = 'tetris-highscores';
const STATS_KEY = 'tetris-stats';        // récords históricos { bestCombo, maxLines }
const PLAYER_NAME_KEY = 'tetris-player-name';
const MAX_SCORES = 5;
const MAX_NAME_LEN = 10;
const pauseMenu = document.getElementById('pause-menu');
const menuItems = [...pauseMenu.querySelectorAll('.menu-item')];
const pauseControls = document.getElementById('pause-controls');
const controlsBtn = pauseMenu.querySelector('[data-action="controls"]');
const startLevelEl = document.getElementById('start-level-value');
const levelStepButtons = pauseMenu.querySelectorAll('[data-level-step]');
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;

let skinName = 'retro'; // skin activa (clave de SKINS)
const spriteCache = new Map(); // bloques ya dibujados por skin/color/tamaño
let started = false; // false mientras se muestra la pantalla de inicio
let board, current, next, held, holdUsed, score, lines, level, combo, maxCombo, pendingScore, paused, gameOver, scoresOpen, pausedByScores, clearing, popups, lastTime, dropAccum, dropInterval, lockTimer, lockResets, lowestY, animId, menuOpen, menuIndex;
let startLevel = 1;
// Teclas pulsadas ahora mismo y las que se ignoran hasta soltarlas (al reanudar)
const heldKeys = new Set();
let ignoredKeys = new Set();

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
  // sube cada 10 líneas, pero nunca por debajo del nivel inicial elegido
  level = Math.max(level, Math.floor(lines / 10) + 1);
  dropInterval = dropIntervalFor(level);
  // combo: piezas consecutivas que borran al menos una línea
  combo++;
  maxCombo = Math.max(maxCombo, combo);
  updateHUD();
  clearing = { rows, elapsed: 0 };
  const midRow = (rows[0] + rows[rows.length - 1] + 1) / 2;
  const label = LINE_LABELS[rows.length] + (combo > 1 ? ` · COMBO x${combo}` : '');
  popups.push({ text: `+${points.toLocaleString()}`, label, y: midRow * BLOCK, elapsed: 0 });
}

function dropIntervalFor(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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

const SPRITE_PAD = 16; // margen del sprite para que quepa el resplandor neon

// Cada bloque se dibuja una sola vez por skin/color/tamaño en un canvas aparte
// y luego se copia con drawImage: el tablero se repinta en cada frame y
// shadowBlur o la textura pixel serían caros de recalcular.
function blockSprite(colorIndex, size) {
  const key = `${skinName}:${colorIndex}:${size}`;
  let sprite = spriteCache.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas');
    sprite.width = sprite.height = size + SPRITE_PAD * 2;
    const skin = SKINS[skinName];
    skin.drawBlock(sprite.getContext('2d'), SPRITE_PAD, SPRITE_PAD, size, skin.colors[colorIndex]);
    spriteCache.set(key, sprite);
  }
  return sprite;
}

// Punto de entrada común (tablero, ghost, previews, animación): usa la skin activa
function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  context.globalAlpha = alpha ?? 1;
  context.drawImage(blockSprite(colorIndex, size), x * size - SPRITE_PAD, y * size - SPRITE_PAD);
  context.globalAlpha = 1;
}

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  context.shadowColor = color;
  context.shadowBlur = size / 2.5;
  // relleno translúcido + contorno brillante
  context.globalAlpha = 0.3;
  context.fillStyle = color;
  context.fillRect(px + 3, py + 3, size - 6, size - 6);
  context.globalAlpha = 1;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + 4, py + 4, size - 8, size - 8);
  // núcleo claro sin resplandor
  context.shadowBlur = 0;
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fillRect(px + size / 2 - 2, py + size / 2 - 2, 4, 4);
}

function roundedRectPath(context, x, y, w, h, r) {
  context.beginPath();
  if (context.roundRect) {
    context.roundRect(x, y, w, h, r);
  } else {
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }
}

function drawPastelBlock(context, px, py, size, color) {
  const r = size * 0.25;
  roundedRectPath(context, px + 2, py + 2, size - 4, size - 4, r);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1;
  context.strokeStyle = 'rgba(0,0,0,0.2)'; // contorno: mantiene visibles el ghost y los tonos claros sobre blanco
  context.stroke();
  // brillo suave en la parte superior
  roundedRectPath(context, px + 5, py + 5, size - 10, size * 0.28, r / 2);
  context.fillStyle = 'rgba(255,255,255,0.45)';
  context.fill();
}

// Textura fija (sin aleatoriedad para que no parpadee): borde biselado de
// píxeles claros/oscuros y un tramado interior
function drawPixelBlock(context, px, py, size, color) {
  const n = 10;            // píxeles por lado
  const p = size / n;      // tamaño de cada píxel (3 px con BLOCK = 30)
  context.fillStyle = color;
  context.fillRect(px, py, size, size);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      let shade = null;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) shade = 'rgba(0,0,0,0.45)';      // contorno
      else if (i === 1 || j === 1) shade = 'rgba(255,255,255,0.45)';                         // luz arriba/izquierda
      else if (i === n - 2 || j === n - 2) shade = 'rgba(0,0,0,0.25)';                       // sombra abajo/derecha
      else if ((i + j * 2) % 5 === 0) shade = 'rgba(0,0,0,0.12)';                            // tramado
      else if (i === 2 && j === 2) shade = 'rgba(255,255,255,0.7)';                          // brillo
      if (!shade) continue;
      context.fillStyle = shade;
      context.fillRect(px + i * p, py + j * p, p, p);
    }
  }
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
  const stroke = css.getPropertyValue('--board-bg').trim();
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

function applySkin(name) {
  if (!Object.hasOwn(SKINS, name)) name = 'retro';
  skinName = name;
  document.documentElement.dataset.skin = name;
  try { localStorage.setItem(SKIN_KEY, name); } catch (e) { /* almacenamiento no disponible */ }
  skinButtons.forEach(btn => btn.setAttribute('aria-pressed', String(btn.dataset.skinOption === name)));
  // repintar aunque el bucle esté detenido (pausa / game over)
  // (también en la pantalla de inicio, con el tablero vacío)
  if (board) draw();
  if (current) { drawNext(); drawHold(); }
}

function cycleSkin() {
  const i = SKIN_ORDER.indexOf(skinName);
  applySkin(SKIN_ORDER[(i + 1) % SKIN_ORDER.length]);
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
    resumeGame();
  }
}

// Reanuda el bucle tras una pausa (menú o modal de puntajes)
function resumeGame() {
  paused = false;
  // una tecla que sigue pulsada (p. ej. Space para "Reanudar") no debe mover la pieza al volver
  ignoredKeys = new Set(heldKeys);
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
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

// ---- Menú de pausa (P / Esc) ----
function togglePause() {
  if (gameOver) return;
  menuOpen ? closePauseMenu() : openPauseMenu();
}

function openPauseMenu() {
  paused = true;
  menuOpen = true;
  cancelAnimationFrame(animId);
  menuIndex = 0;
  showControls(false);
  renderMenu();
  pauseMenu.classList.remove('hidden');
}

function closePauseMenu() {
  menuOpen = false;
  pauseMenu.classList.add('hidden');
  resumeGame();
}

function showControls(show) {
  pauseControls.classList.toggle('hidden', !show);
  controlsBtn.setAttribute('aria-expanded', String(show));
  controlsBtn.textContent = show ? 'Ocultar controles' : 'Ver controles';
}

function renderMenu() {
  menuItems.forEach((item, i) => item.classList.toggle('selected', i === menuIndex));
  startLevelEl.textContent = startLevel;
  levelStepButtons.forEach(btn => {
    btn.disabled = Number(btn.dataset.levelStep) < 0 ? startLevel <= 1 : startLevel >= MAX_START_LEVEL;
  });
}

function clampStartLevel(lvl) {
  return Math.min(MAX_START_LEVEL, Math.max(1, lvl || 1));
}

function setStartLevel(lvl) {
  startLevel = clampStartLevel(lvl);
  try { localStorage.setItem(START_LEVEL_KEY, String(startLevel)); } catch (e) { /* almacenamiento no disponible */ }
  renderMenu();
}

function activateMenuItem(i) {
  menuIndex = i;
  switch (menuItems[i].dataset.action) {
    case 'resume': closePauseMenu(); break;
    case 'restart': init(); break;
    case 'controls': showControls(pauseControls.classList.contains('hidden')); renderMenu(); break;
    case 'level': setStartLevel(startLevel >= MAX_START_LEVEL ? 1 : startLevel + 1); break; // Enter: avanza en ciclo
  }
}

// Navegación con teclado; el resto de teclas de juego se ignoran con el menú abierto
function handleMenuKey(e) {
  switch (e.code) {
    case 'ArrowUp':
    case 'ArrowDown':
      e.preventDefault();
      menuIndex = (menuIndex + (e.code === 'ArrowDown' ? 1 : -1) + menuItems.length) % menuItems.length;
      renderMenu();
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      if (menuItems[menuIndex].dataset.action === 'level') setStartLevel(startLevel + (e.code === 'ArrowRight' ? 1 : -1));
      break;
    case 'Enter':
    case 'NumpadEnter':
    case 'Space':
      e.preventDefault();
      if (!e.repeat) activateMenuItem(menuIndex);
      break;
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
  level = startLevel;
  combo = 0;
  maxCombo = 0;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalFor(level);
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
  menuOpen = false;
  pauseMenu.classList.add('hidden');
  ignoredKeys = new Set(heldKeys);
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  // escribiendo el nombre: las teclas no controlan el juego
  if (e.target instanceof HTMLInputElement) return;
  if (!e.metaKey) heldKeys.add(e.code); // con Cmd (macOS) el navegador no envía keyup
  if (!started) {
    // pantalla de inicio: solo empezar o cambiar el tema / la skin
    if (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space') {
      e.preventDefault();
      init();
    } else if (e.code === 'KeyT') {
      toggleTheme();
    } else if (e.code === 'KeyK' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      cycleSkin();
    }
    return;
  }
  if (e.code === 'KeyM') { scoresOpen ? closeScores() : openScores(); return; }
  // el modal de puntajes queda encima del menú de pausa: Esc lo cierra primero
  if (scoresOpen) {
    if (e.code === 'Escape') closeScores();
    return;
  }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (!e.repeat) togglePause(); return; }
  if (e.code === 'KeyT') { toggleTheme(); return; }
  if (e.code === 'KeyK') {
    if (!e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) cycleSkin(); // no robar Ctrl/Cmd+K
    return;
  }
  if (menuOpen) { handleMenuKey(e); return; }
  if (paused || gameOver || clearing) return;
  // solo se ignora la auto-repetición de una tecla mantenida desde la pausa; una pulsación nueva vale
  if (ignoredKeys.has(e.code)) {
    if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
    ignoredKeys.delete(e.code);
  }
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

document.addEventListener('keyup', e => {
  heldKeys.delete(e.code);
  ignoredKeys.delete(e.code);
});

// al perder el foco no llegan los keyup: olvidar las teclas pulsadas
// (ignoredKeys se conserva: solo bloquea repeticiones, nunca una pulsación nueva)
window.addEventListener('blur', () => heldKeys.clear());

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

menuItems.forEach((item, i) => {
  item.addEventListener('mouseenter', () => { menuIndex = i; renderMenu(); });
  if (item.tagName === 'BUTTON') item.addEventListener('click', () => {
    item.blur(); // evita que Space active el botón
    activateMenuItem(i);
  });
});

levelStepButtons.forEach(btn => btn.addEventListener('click', () => {
  setStartLevel(startLevel + Number(btn.dataset.levelStep));
  btn.blur(); // evita que Space active el botón
}));

scoresCloseBtn.addEventListener('click', () => {
  closeScores();
  scoresCloseBtn.blur(); // evita que Space active el botón
});

themeButtons.forEach(btn => btn.addEventListener('click', () => {
  applyTheme(btn.dataset.themeOption);
  btn.blur(); // evita que Space active el botón
}));

skinButtons.forEach(btn => btn.addEventListener('click', () => {
  applySkin(btn.dataset.skinOption);
  btn.blur(); // evita que Space active el botón
}));

// Fuera de init(): reiniciar la partida no cambia el tema ni la skin
let savedTheme = null, savedSkin = null;
try {
  savedTheme = localStorage.getItem(THEME_KEY);
  savedSkin = localStorage.getItem(SKIN_KEY);
} catch (e) { /* ignorar */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark');
// Pantalla de inicio: tablero vacío y sin bucle hasta pulsar "Jugar"
board = createBoard();
popups = [];
clearing = null;
applySkin(savedSkin);
renderRecords(startScores, startStats, -1);

// También fuera de init(): el nivel inicial elegido se mantiene entre partidas y recargas
try { startLevel = clampStartLevel(Number.parseInt(localStorage.getItem(START_LEVEL_KEY), 10)); } catch (e) { /* ignorar */ }
