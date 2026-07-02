# 🐀 Ratatouille — Remy's Kitchen Run

A fully playable, Super-Mario-Bros-style platformer starring **Remy** the rat
from Disney·Pixar's *Ratatouille*. Dash across **five kitchens**, leap over the
**fire on the floor**, gather ingredients, stomp the pesky kitchen bugs — and on
the **fifth level** collect every ingredient to light the pot and **cook the
ratatouille**. Bon appétit!

It runs in any modern browser with **zero dependencies and zero build step** —
all the artwork is drawn on an HTML5 canvas and all the sound is synthesized
with the Web Audio API.

## ▶️ Play it

**Easiest:** double-click `index.html` to open it in your browser.

Or serve it locally (recommended so audio/storage behave exactly like the web):

```bash
# any one of these from the project root:
python3 -m http.server 8080      # then open http://localhost:8080
npx serve .                      # then open the printed URL
```

## 🎮 Controls

| Action | Keys | Touch |
| ------ | ---- | ----- |
| Move   | `←` `→` or `A` `D` | on-screen ◄ ► |
| Jump   | `Space` / `↑` / `W` (hold for a higher jump) | **JUMP** button |
| Pause  | `P` / `Esc` | — |
| Restart kitchen | `R` | — |
| Mute   | `M` | — |
| Start / advance menus | `Enter` / `Space` / tap | tap |

## 🍳 How to play

- **Never touch the flames.** Stationary fires (`F`) always burn; fire **jets**
  pulse on and off — wait for the lull, then dash through.
- **Mind the gaps** in the tile floor — a running jump clears them.
- **Stomp** kitchen bugs from above for points; touching one from the side hurts.
- **Collect ingredients** (tomato, eggplant, pepper, mushroom, cheese) for score.
- **Chain stomps** without landing to rack up **COMBOS** for escalating points.
- Reach the **glowing door** to clear kitchens 1–4.
- In **Gusteau's Grand Kitchen** (level 5) the pot only lights once you've
  collected **every** ingredient. Step up to the lit pot to cook and win.

Each kitchen is graded **1–3 ⭐** — clear it **fast**, **unhurt**, and **fully
stocked** for the full three stars, with score bonuses to match.

You have 3 lives. A hit costs a life and gives you a moment of invincibility;
fall in a pit and you respawn at the start of the kitchen. Out of lives? Retry
the same kitchen. Your high score is saved locally between runs.

**Game feel:** squash-&-stretch and dust puffs on every jump and landing, rising
fire embers, hit-stop and screen-flash on impact, floating score popups, a
camera that leads where you're heading, per-kitchen colour themes, a live
progress bar + timer, and a full procedural soundtrack with footsteps.

## 🗂️ Project structure

```
index.html         entry point (loads everything, in order)
css/style.css      page layout, canvas scaling, touch controls
js/config.js       tunable constants (physics, scoring, sizes)
js/utils.js        small math / geometry helpers
js/audio.js        procedural sound effects + background tune (Web Audio)
js/input.js        keyboard + on-screen touch input
js/sprites.js      all procedural artwork (Remy, fire, food, pot, bugs…)
js/entities.js     Player physics + tile collision, hazards, pickups, particles
js/levels.js       the five hand-tuned ASCII levels + parser
js/game.js         the engine: fixed-timestep loop, state machine, camera, HUD
test/headless.js   headless test harness (see below)
```

## ✅ Tests

The game is verified by a headless harness that stubs the browser, loads the
real game code, and:

1. **Structurally validates** every level (grounded start/goal, jumpable pits,
   no unjumpable fire walls, no jump-blocking ceilings, reachable ingredients).
2. **Auto-plays** each kitchen with a heuristic bot to prove it is winnable.
3. Drives the **level-5 finale** (collect-all → cook → win).
4. Runs a full **end-to-end playthrough** through the entire state machine.
5. Checks the **death / game-over / retry** path.
6. **Render smoke-tests** every screen so nothing throws.

```bash
npm test        # or: node test/headless.js
```

## 🎨 Credits

Built as an original tribute to *Ratatouille*. All code, art, and audio in this
repository are generated procedurally — no copyrighted assets are included.
