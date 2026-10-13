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

`index.html` provides the DOM: a left panel (hold canvas and controls), the board canvas, a right panel (HUD, next-piece canvas and theme switch) and the pause/game-over overlay. Both panels are 160px wide, so the board and the page-centered title line up. All logic lives in `game.js`, a single non-module script with `'use strict'` that uses module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, …). `init()` resets this state and also serves as the restart handler.

Key conventions that span several functions:

- **Cell value = piece type = color index.** The shapes in `PIECES` store their type number (1–7) in each filled cell, rather than `1`. `merge()` copies those values into `board`, and `drawBlock()` looks them up in the active skin's `colors`. If you add or reorder a piece, keep `PIECES`, every `SKINS[*].colors` and `randomPiece()` (which hardcodes `* 7`) in sync.
- **Collision is the single source of truth.** Movement, rotation wall kicks (`tryRotate` tries x offsets `0, -1, 1, -2, 2`), the ghost piece (`ghostY`), hard and soft drops, and game-over detection in `spawn()` all go through `collide(shape, x, y)`. Cells with `y < 0` are allowed, so pieces can extend above the board.
- **Lock delay:** gravity never locks directly. In `loop()`, a grounded piece (`collide` at `y+1`) accumulates `lockTimer` and locks after `LOCK_DELAY_MS`. Successful moves/rotations (`tryShift`/`tryRotate` → `onPieceMoved()`) reset the timer while grounded, at most `MAX_LOCK_RESETS` times; reaching a new lowest row (`stepDown()`) or a new piece (`spawn()`, hold swap → `resetLock()`) restores the resets. Soft drop on the ground does nothing; only hard drop locks instantly.
- **Piece lock pipeline:** `lockPiece()` → `merge()` → `fullRows()`.
  - With no full rows, it calls `spawn()` directly, which can trigger `endGame()`.
  - Otherwise `clearLines(rows)` scores right away (score, lines, level, `dropInterval`, HUD), pushes a floating score popup and sets `clearing`. While `clearing` is set, `loop()` suspends gravity, the keydown handler ignores gameplay keys and `draw()` runs `drawClearing()` instead of drawing the current piece. After `CLEAR_MS`, `finishClear()` removes the rows and calls `spawn()`.
  - Animation timers (`clearing.elapsed`, `popups[].elapsed`) advance by the loop's `dt`, so they freeze correctly while paused.
- **Game loop:** `loop()` uses `requestAnimationFrame` and accumulates `dt` into `dropAccum` to drive gravity. Pausing and game over stop the loop with `cancelAnimationFrame(animId)`. Because `endGame()` can run *inside* `loop()` (gravity → `lockPiece()` → `spawn()`), `loop()` re-schedules itself only `if (!gameOver)`; otherwise the cancel is undone and the game keeps running behind the overlay. `endGame()` is idempotent, and `draw()` skips the blocked piece on game over. Resuming resets `lastTime` before it restarts the loop.
- **Hold:** `held` stores a piece *type* (or `null`), and `holdUsed` blocks reuse until the next `spawn()`, which resets it. `holdPiece()` either calls `spawn()` (when the slot is empty) or swaps in `createPiece(held)`, which gives a fresh spawn position and rotation. A swap that collides calls `endGame()`. `drawHold()` toggles the `.locked` class on `#hold-canvas` for dimming. `init()` clears `held`.
- **High scores:** `loadScores()`/`saveScore()` keep the top `MAX_SCORES` entries (`{score, lines, level, date}`) in `localStorage` (`tetris-highscores`). `endGame()` saves the score and renders the list into `#overlay-scores`, highlighting the new entry. The `M` key opens `#scores-modal` (`openScores()`/`closeScores()`). If the game is running, it pauses through `pausedByScores`, so closing resumes only a pause that the modal itself caused. While the modal is open, the keydown handler ignores every key except `M`/`Esc`. `init()` closes the modal.
- **Rendering** redraws the whole board on every frame (`draw()`). The next/hold previews (`drawNext()`/`drawHold()`, both via `drawPreview()`) are redrawn only in `spawn()`/`holdPiece()`, and the HUD only through `updateHUD()`.

- **Theming:** colors live in CSS variables in `style.css` (`:root` = dark, `[data-theme="light"]` = light). `applyTheme(theme)` in `game.js` sets `document.documentElement.dataset.theme`, persists it in `localStorage` (`tetris-theme`) and repaints with `draw()`/`drawNext()` so it also works while paused or on game over. It is triggered by the `DARK / LIGHT` buttons (`[data-theme-option]`) in the side panel and by the `T` key (`toggleTheme()`), which is handled before the paused/game-over early return. It is called outside `init()` so restarting keeps the theme. `drawGrid()` reads `--grid` from CSS; any new canvas color should do the same.
- **Skins:** `SKINS` (`retro`, `neon`, `pastel`, `pixel`) each hold `themes.dark` / `themes.light` (a `colors` palette plus the drawing parameters for that theme) and a `draw(context, px, py, size, color, t)` function that receives the active theme's entry as `t`. `drawBlock()` delegates to `skin.draw` with `skinTheme` (the `skin.themes[theme]` cache), after setting `globalAlpha` for the ghost piece. Both `applyTheme()` and `applySkin()` refresh `skinTheme`, so any skin × theme combination works. Skins that touch `shadowBlur` or similar state must `save()`/`restore()`. `applySkin(name)` sets `document.documentElement.dataset.skin`, persists it in `localStorage` (`tetris-skin`) and calls `repaint()`. It is triggered by the `[data-skin-option]` buttons and the `K` key (`cycleSkin()`), handled like `T`. Canvas backgrounds per skin/theme live in CSS as `:root[data-skin="…"]` and `:root[data-skin="…"][data-theme="light"]` overrides of `--canvas-bg`/`--grid` (currently neon and pastel).

## Gotchas

- Canvas sizes are hardcoded in `index.html`. The `#board` canvas must be `COLS*BLOCK × ROWS*BLOCK` (300×600). `#next-canvas` and `#hold-canvas` (120×120) assume a 4×4 grid of `BLOCK`-px cells (`drawPreview()`). They need `align-self` in CSS, because otherwise flexbox stretches them to the panel width and the preview cells look bigger than the board cells.
- Scoring: line clears use `LINE_SCORES[n] * level`. A hard drop adds 2 points per cell and a soft drop adds 1 point per row. The level rises every 10 lines, and the drop interval is `max(100, 1000 - (level-1)*90)` ms.
