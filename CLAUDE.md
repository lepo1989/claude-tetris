/# CLAUDE.md

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

`index.html` provides the DOM: the board canvas, the HUD panel, the next-piece canvas and the pause/game-over overlay. All logic lives in `game.js`, a single non-module script with `'use strict'` that uses module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, …). `init()` resets this state and also serves as the restart handler.

Key conventions that span several functions:

- **Cell value = piece type = color index.** The shapes in `PIECES` store their type number (1–7) in each filled cell, rather than `1`. `merge()` copies those values into `board`, and `drawBlock()` looks them up in `COLORS`. If you add or reorder a piece, keep `PIECES`, `COLORS` and `randomPiece()` (which hardcodes `* 7`) in sync.
- **Collision is the single source of truth.** Movement, rotation wall kicks (`tryRotate` tries x offsets `0, -1, 1, -2, 2`), the ghost piece (`ghostY`), hard and soft drops, and game-over detection in `spawn()` all go through `collide(shape, x, y)`. Cells with `y < 0` are allowed, so pieces can extend above the board.
- **Piece lock pipeline:** `lockPiece()` → `merge()` → `clearLines()`, which updates score, lines, level and `dropInterval` → `spawn()`, which can trigger `endGame()`.
- **Game loop:** `loop()` uses `requestAnimationFrame` and accumulates `dt` into `dropAccum` to drive gravity. Pausing and game over stop the loop with `cancelAnimationFrame(animId)`. Resuming resets `lastTime` before it restarts the loop.
- **Rendering** redraws the whole board on every frame (`draw()`). The next-piece preview is redrawn only in `spawn()` (`drawNext()`), and the HUD only through `updateHUD()`.

## Gotchas

- Canvas sizes are hardcoded in `index.html`. The `#board` canvas must be `COLS*BLOCK × ROWS*BLOCK` (300×600). `#next-canvas` (120×120) assumes a 4×4 grid of 30px cells, set by `NB` in `drawNext()`.
- Scoring: line clears use `LINE_SCORES[n] * level`. A hard drop adds 2 points per cell and a soft drop adds 1 point per row. The level rises every 10 lines, and the drop interval is `max(100, 1000 - (level-1)*90)` ms.
