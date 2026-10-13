# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris on HTML5 Canvas. It has no dependencies, no `package.json`, no build step, no linter and no test suite. The UI text and README are in Spanish.

## Running

```bash
open index.html                 # open directly (macOS)
python3 -m http.server 8000     # or serve statically → http://localhost:8000
```

To verify a change, load the page in a browser. There are no automated tests.

## Architecture

`index.html` provides the DOM: a left panel (hold canvas and controls), the board canvas, a right panel (HUD, next-piece canvas and theme switch) and the pause/game-over overlay. Both panels are 160px wide, so the board and the page-centered title line up. All logic lives in `game.js`, a single non-module script with `'use strict'` that uses module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, …). `resetGame()` resets this state; `init()` calls it and starts the loop, and it serves as both the start and the restart handler.

Key conventions that span several functions:

- **Cell value = piece type = color index.** The shapes in `PIECES` store their type number (1–7) in each filled cell, rather than `1`. `merge()` copies those values into `board`, and `drawBlock()` looks them up in `COLORS`. If you add or reorder a piece, keep `PIECES`, `COLORS` and `randomPiece()` (which hardcodes `* 7`) in sync.
- **Collision is the single source of truth.** Movement, rotation wall kicks (`tryRotate` tries x offsets `0, -1, 1, -2, 2`), the ghost piece (`ghostY`), hard and soft drops, and game-over detection in `spawn()` all go through `collide(shape, x, y)`. Cells with `y < 0` are allowed, so pieces can extend above the board.
- **Lock delay:** gravity never locks directly. In `loop()`, a grounded piece (`collide` at `y+1`) accumulates `lockTimer` and locks after `LOCK_DELAY_MS`. Successful moves/rotations (`tryShift`/`tryRotate` → `onPieceMoved()`) reset the timer while grounded, at most `MAX_LOCK_RESETS` times; reaching a new lowest row (`stepDown()`) or a new piece (`spawn()`, hold swap → `resetLock()`) restores the resets. Soft drop on the ground does nothing; only hard drop locks instantly.
- **Piece lock pipeline:** `lockPiece()` → `merge()` → `fullRows()`.
  - With no full rows, it calls `spawn()` directly, which can trigger `endGame()`.
  - Otherwise `clearLines(rows)` scores right away (score, lines, level, `dropInterval`, HUD), pushes a floating score popup and sets `clearing`. While `clearing` is set, `loop()` suspends gravity, the keydown handler ignores gameplay keys and `draw()` runs `drawClearing()` instead of drawing the current piece. After `CLEAR_MS`, `finishClear()` removes the rows and calls `spawn()`.
  - Animation timers (`clearing.elapsed`, `popups[].elapsed`) advance by the loop's `dt`, so they freeze correctly while paused.
- **Game loop:** `loop()` uses `requestAnimationFrame` and accumulates `dt` into `dropAccum` to drive gravity. Pausing and game over stop the loop with `cancelAnimationFrame(animId)`. Because `endGame()` can run *inside* `loop()` (gravity → `lockPiece()` → `spawn()`), `loop()` re-schedules itself only `if (!gameOver)`; otherwise the cancel is undone and the game keeps running behind the overlay. `endGame()` is idempotent, and `draw()` skips the blocked piece on game over. Resuming resets `lastTime` before it restarts the loop.
- **Pause menu:** `P`/`Esc` call `togglePause()` → `openPauseMenu()`/`closePauseMenu()` on `#pause-menu` (separate from `#overlay`, which is only used for the start screen and game over). It has two views (`#pause-main`, `#pause-controls`). `↑/↓` move focus across the visible `[data-nav]` items (`handlePauseMenuKey()`), `←/→` change the level on the `#start-level` spinbutton, and clicks are delegated through `data-action`. The controls view clones the left panel's `<ul>` at startup. All resumes go through `resumeLoop()`, which copies `keysDown` into `staleKeys`. Gameplay keys in `staleKeys` are ignored until their `keyup`, so a key held when the menu closes does not move the piece. `resetGame()` does the same.
- **Starting level:** `startLevel` (localStorage `tetris-start-level`, 1–`MAX_START_LEVEL`) is loaded outside `resetGame()` and copied into `gameStartLevel` there, so a change made mid-game takes effect only on the next game. The level is `gameStartLevel + floor(lines/10)`, and the speed comes from `dropIntervalFor(level)`.
- **Hold:** `held` stores a piece *type* (or `null`), and `holdUsed` blocks reuse until the next `spawn()`, which resets it. `holdPiece()` either calls `spawn()` (when the slot is empty) or swaps in `createPiece(held)`, which gives a fresh spawn position and rotation. A swap that collides calls `endGame()`. `drawHold()` toggles the `.locked` class on `#hold-canvas` for dimming. `resetGame()` clears `held`.
- **Combo:** `lockPiece()` increments `combo` when the piece clears rows and resets it to 0 otherwise; `maxCombo` is the game's best. `clearLines()` adds `COMBO xN` to the popup label when `combo > 1`.
- **High scores:** `loadScores()`/`saveScore()` keep the top `MAX_SCORES` entries (`{name, score, lines, level, combo, date}`) in `localStorage` (`tetris-highscores`); older entries may lack `name`/`combo`. `date` doubles as the entry id (`savedEntryDate`). All-time `{bestCombo, maxLines}` live separately in `tetris-stats` (`loadStats()`/`saveStats()`), so they count games outside the top 5. `endGame()` saves both, renders `#overlay-scores`/`#overlay-stats` highlighting what is new and, if the game made the top, shows `#name-form`: the entry is already saved under the last name (`tetris-player`), and each `input` event renames it (`renameEntry()`). The keydown handler ignores events from `#name-input`. `resetRecords()` (after `confirm()`) clears both keys.
- **Overlay modes:** `#overlay` is shared by the start screen and game over through `showOverlay(mode)` (`'start' | 'gameover'`), which sets `data-mode` and toggles the records, the stats, the reset button and the button label. On load, `showStart()` runs `resetGame()` and sets `gameOver = true` to mean "no game running", so gameplay keys, `P` and gravity stay off until **Jugar** calls `init()` (`resetGame()` plus starting the loop).
- **Records modal:** the `M` key opens `#scores-modal` (`openScores()`/`closeScores()`). If the game is running, it pauses through `pausedByScores`, so closing resumes only a pause that the modal itself caused. While the modal is open, the keydown handler ignores every key except `M`/`Esc`. `resetGame()` closes the modal.
- **Rendering** redraws the whole board on every frame (`draw()`). The next/hold previews (`drawNext()`/`drawHold()`, both via `drawPreview()`) are redrawn only in `spawn()`/`holdPiece()`, and the HUD only through `updateHUD()`.

- **Theming:** colors live in CSS variables in `style.css` (`:root` = dark, `[data-theme="light"]` = light). `applyTheme(theme)` in `game.js` sets `document.documentElement.dataset.theme`, persists it in `localStorage` (`tetris-theme`) and repaints with `draw()`/`drawNext()` so it also works while paused or on game over. It is triggered by the `DARK / LIGHT` buttons (`[data-theme-option]`) in the side panel and by the `T` key (`toggleTheme()`), which is handled before the paused/game-over early return. It is called outside `init()` so restarting keeps the theme. `drawGrid()` reads `--grid` from CSS; any new canvas color should do the same.

## Gotchas

- Canvas sizes are hardcoded in `index.html`. The `#board` canvas must be `COLS*BLOCK × ROWS*BLOCK` (300×600). `#next-canvas` and `#hold-canvas` (120×120) assume a 4×4 grid of `BLOCK`-px cells (`drawPreview()`). They need `align-self` in CSS, because otherwise flexbox stretches them to the panel width and the preview cells look bigger than the board cells.
- Scoring: line clears use `LINE_SCORES[n] * level`. A hard drop adds 2 points per cell and a soft drop adds 1 point per row. The level rises every 10 lines from the starting level, and the drop interval is `max(100, 1000 - (level-1)*90)` ms (`dropIntervalFor`).
