/* Headless test harness for Ratatouille: Remy's Kitchen Run.
 *
 * Stubs out the browser (canvas, audio, storage, rAF), loads every game
 * script into one shared scope, then:
 *   1. structurally validates each level (grounded start/goal, jumpable pits,
 *      no unjumpable fire walls, ingredients not buried in walls),
 *   2. auto-plays each level with a heuristic bot to prove it is winnable,
 *   3. exercises the full render path for every screen so nothing throws.
 *
 * Run with:  node test/headless.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FILES = ['config', 'utils', 'audio', 'input', 'sprites', 'entities', 'levels', 'game']
  .map(f => path.join(__dirname, '..', 'js', `${f}.js`));
const src = FILES.map(f => fs.readFileSync(f, 'utf8')).join('\n;\n');

const harness = `
const localStorage = { _d:{}, getItem(k){return this._d[k]||null;}, setItem(k,v){this._d[k]=String(v);} };
const performance = { now: () => Date.now() };
let __raf = null;
function requestAnimationFrame(cb){ __raf = cb; }
function makeCtx(){
  const grad = { addColorStop(){} };
  return new Proxy({ fillStyle:'', strokeStyle:'', lineWidth:1, font:'', textAlign:'', textBaseline:'', globalAlpha:1, lineCap:'' }, {
    get(t,p){
      if(p in t) return t[p];
      if(p==='canvas') return { width:960, height:560 };
      if(p==='createLinearGradient'||p==='createRadialGradient'||p==='createPattern') return ()=>grad;
      if(p==='measureText') return ()=>({width:10});
      return ()=>{};
    },
    set(t,p,v){ t[p]=v; return true; }
  });
}
const fakeCanvas = { width:960, height:560, style:{}, getContext:()=>makeCtx(), addEventListener(){}, };
const document = { getElementById:(id)=> id==='game'? fakeCanvas : { addEventListener(){} }, addEventListener(){} };
const window = { addEventListener(){}, innerWidth:1200, innerHeight:800, AudioContext:undefined, webkitAudioContext:undefined };

${src}

return { Game, Level, RAW_LEVELS, LEVEL_COUNT, Input, CONFIG, STATE, Fire, fakeCanvas };
`;

const api = new Function(harness)();
const { Game, Level, RAW_LEVELS, LEVEL_COUNT, Input, CONFIG, STATE, fakeCanvas } = api;

let failures = 0;
const fail = (msg) => { console.log('  ✗ ' + msg); failures++; };
const ok = (msg) => console.log('  ✓ ' + msg);

/* ----------------------- structural validation ---------------------- */
console.log('\n=== Structural validation ===');
for (let i = 0; i < LEVEL_COUNT; i++) {
  const lvl = new Level(RAW_LEVELS[i], i);
  const T = CONFIG.TILE;
  console.log(`\nLevel ${i + 1}: ${lvl.name}  (${lvl.width}x${lvl.height}, ${lvl.totalIngredients} ingredients)`);

  if (!lvl.player) fail('no player start'); else ok('player start present');
  if (!lvl.goal) fail('no goal'); else {
    const wantPot = i === LEVEL_COUNT - 1;
    if (lvl.goal.isPot !== wantPot) fail(`goal type wrong (isPot=${lvl.goal.isPot}, want ${wantPot})`);
    else ok(`goal is ${wantPot ? 'cooking pot' : 'exit door'}`);
  }

  // start & goal must have solid ground beneath them
  const pCol = Math.floor((lvl.player.x + lvl.player.w / 2) / T);
  const pRow = Math.floor((lvl.player.y + lvl.player.h) / T);
  if (!lvl.solidAt(pCol, pRow)) fail('player start has no ground below'); else ok('player start grounded');

  const gCol = Math.floor((lvl.goal.x + lvl.goal.w / 2) / T);
  const gBottomRow = Math.floor((lvl.goal.y + lvl.goal.h) / T);
  if (!lvl.solidAt(gCol, gBottomRow)) fail('goal has no ground below'); else ok('goal grounded');

  // floor pit widths (scan the bottom row) must be jumpable (<= 3 tiles)
  const floorRow = lvl.height - 1;
  let maxPit = 0, run = 0;
  for (let c = 0; c < lvl.width; c++) {
    if (!lvl.solidAt(c, floorRow)) { run++; maxPit = Math.max(maxPit, run); } else run = 0;
  }
  if (maxPit > 3) fail(`floor pit too wide (${maxPit} tiles, max 3)`); else ok(`max floor pit ${maxPit} tiles (jumpable)`);

  // no unjumpable wall of fire on the action row (row 12)
  const fireCols = new Set(lvl.fires.map(f => Math.floor(f.x / T)));
  let maxFire = 0; run = 0;
  for (let c = 0; c < lvl.width; c++) { if (fireCols.has(c)) { run++; maxFire = Math.max(maxFire, run); } else run = 0; }
  if (maxFire > 2) fail(`fire wall too wide (${maxFire} tiles, max 2)`); else ok(`widest fire run ${maxFire} tiles (clearable)`);

  // no solid tile may hang above a fire or a pit (it would cancel the jump)
  let ceilings = 0;
  const checkCeiling = (col) => {
    for (let dc = -1; dc <= 1; dc++) {
      for (let r = floorRow - 5; r < floorRow; r++) {
        if (lvl.solidAt(col + dc, r)) ceilings++;
      }
    }
  };
  lvl.fires.forEach(f => checkCeiling(Math.floor(f.x / T)));
  for (let c = 0; c < lvl.width; c++) if (!lvl.solidAt(c, floorRow)) checkCeiling(c);
  if (ceilings) fail(`${ceilings} solid tile(s) hang above a hazard/pit (would block jumps)`);
  else ok('no jump-blocking ceilings above hazards or pits');

  // ingredients must not be embedded inside solid tiles
  let buried = 0;
  for (const o of lvl.ingredients) {
    const c = Math.floor((o.x + o.w / 2) / T), r = Math.floor((o.y + o.h / 2) / T);
    if (lvl.solidAt(c, r)) buried++;
  }
  if (buried) fail(`${buried} ingredient(s) buried in walls`); else ok('all ingredients in open space');
}

/* --------------------------- bot autoplay --------------------------- */
console.log('\n=== Bot autoplay (proves each kitchen is winnable) ===');

function resetInput() { Input.left = Input.right = Input.jump = false; }

// Heuristic controller: run right, jump fires/pits/walls/bugs, wait out live jets.
function think(game) {
  const p = game.player, lvl = game.level, T = CONFIG.TILE;
  resetInput();
  Input.right = true;
  let needJump = false, hold = false, waitJet = false;

  const aheadX = p.x + p.w;
  const c1 = Math.floor((aheadX + 4) / T);
  const c2 = Math.floor((aheadX + 38) / T);
  const footRow = Math.floor((p.y + p.h + 4) / T);
  const bodyRow = Math.floor((p.y + p.h / 2) / T);
  const headRow = Math.floor((p.y + 2) / T);

  if (lvl.solidAt(c1, bodyRow) || lvl.solidAt(c1, headRow)) needJump = true;        // wall
  if (!lvl.solidAt(c1, footRow) && !lvl.solidAt(c2, footRow)) needJump = true;      // pit

  for (const f of lvl.fires) {
    const hb = f.hitbox;
    const dx = hb.x - (p.x + p.w);
    const sameLevel = Math.abs((hb.y + hb.h) - (p.y + p.h)) < 80;
    if (hb.h > 4 && sameLevel && dx > -hb.w && dx < 110) {
      if (f.jet && f.on && dx < 60) waitJet = true;       // stop and let the jet die down
      else needJump = true;
    }
  }
  for (const b of lvl.bugs) {
    if (b.dead) continue;
    const dx = b.x - (p.x + p.w);
    if (dx > -b.w && dx < 70 && Math.abs(b.y - p.y) < 60) needJump = true;
  }

  if (waitJet) { Input.right = false; return; }
  if (needJump && p.onGround) Input.jump = Input.jumpPressed = true;
  if (!p.onGround && p.vy < 0) Input.jump = true;          // keep rising for full height
  void hold;
}

function playLevel(i, maxFrames) {
  const game = new Game(fakeCanvas);
  game.lives = 99;                 // give the bot room to fumble jet timing
  game.loadLevel(i);
  let frames = 0, maxX = 0, stuck = 0, lastX = -1;
  while (frames < maxFrames) {
    think(game);
    game.update();
    game.render();                 // also exercises the render path every frame
    frames++;
    maxX = Math.max(maxX, game.player.x);
    if (Math.abs(game.player.x - lastX) < 0.3) { if (++stuck > 180) { /* nudge */ Input.jumpPressed = true; } }
    else stuck = 0;
    lastX = game.player.x;
    if (game.state === STATE.LEVEL_CLEAR || game.state === STATE.COOKING || game.state === STATE.WIN) {
      return { won: true, frames, maxX, pct: 1 };
    }
    if (game.state === STATE.GAME_OVER) return { won: false, frames, maxX, pct: maxX / game.level.pixelWidth };
  }
  return { won: false, frames, maxX, pct: maxX / game.level.pixelWidth, timeout: true };
}

for (let i = 0; i < LEVEL_COUNT - 1; i++) {  // doors levels: bot must reach the exit
  const r = playLevel(i, 6000);
  if (r.won) ok(`Level ${i + 1} completed by bot in ${r.frames} frames`);
  else fail(`Level ${i + 1} NOT completed (reached ${(r.pct * 100).toFixed(0)}% of the way, ${r.timeout ? 'timeout' : 'died'})`);
}

/* --------------- level 5: collection + cooking + win ---------------- */
console.log('\n=== Level 5 finale (collect-all → cook → win) ===');
{
  const game = new Game(fakeCanvas);
  game.lives = 99;
  game.loadLevel(LEVEL_COUNT - 1);

  // Bot run to verify the pot is reachable along the floor.
  let frames = 0, reachedPot = false;
  while (frames < 8000) {
    think(game);
    game.update();   // ingredients are all on the floor, so traversal collects them
    game.render();
    frames++;
    if (game.level.goal.active && Math.abs(game.player.cx - (game.level.goal.x + game.level.goal.w / 2)) < 120) reachedPot = true;
    if (game.state === STATE.COOKING || game.state === STATE.WIN) break;
  }
  if (game.collected >= game.level.totalIngredients) ok(`bot collected all ${game.level.totalIngredients} ingredients`);
  else fail(`bot only collected ${game.collected}/${game.level.totalIngredients} ingredients`);

  // Drive the cooking sequence to completion.
  let guard = 0;
  while (game.state === STATE.COOKING && guard < 1000) { game.update(); game.render(); guard++; }
  if (game.state === STATE.WIN) ok('cooking sequence completed → WIN'); else fail(`finale did not reach WIN (state=${game.state})`);
}

/* ------------- end-to-end playthrough (title → win) ----------------- */
console.log('\n=== End-to-end playthrough (full state machine) ===');
{
  const game = new Game(fakeCanvas);
  // menus: TITLE -> STORY -> level 1
  Input.enterPressed = true; game.update(); Input.endFrame();      // title -> story
  Input.enterPressed = true; game.update(); Input.endFrame();      // story -> playing
  game.lives = 30;                                                 // headroom across 5 kitchens
  let frames = 0, reachedWin = false, levelsSeen = new Set();
  while (frames < 60000) {
    if (game.state === STATE.PLAYING) { think(game); levelsSeen.add(game.levelIndex); }
    else { resetInput(); Input.enterPressed = true; }              // advance any interstitial screen
    game.update();
    frames++;
    if (game.state === STATE.WIN) { reachedWin = true; break; }
    if (game.state === STATE.GAME_OVER) break;
  }
  if (reachedWin) ok(`played all the way to WIN through ${levelsSeen.size} kitchens in ${frames} frames`);
  else fail(`did not reach WIN (state=${game.state}, levels seen=${levelsSeen.size})`);
}

/* --------------------- death / game-over path ----------------------- */
console.log('\n=== Death & game-over handling ===');
{
  const game = new Game(fakeCanvas);
  game.loadLevel(0);
  game.lives = 1;
  game.player.invuln = 0;
  game._hitPlayer(game.player.cx);     // single hit with one life left
  if (game.state === STATE.GAME_OVER) ok('losing the last life triggers GAME_OVER');
  else fail(`expected GAME_OVER, got ${game.state}`);
  // retry restores lives and reloads the same kitchen
  Input.enterPressed = true; game.update(); Input.endFrame();
  if (game.state === STATE.PLAYING && game.lives === CONFIG.START_LIVES) ok('retry reloads kitchen with full lives');
  else fail(`retry failed (state=${game.state}, lives=${game.lives})`);
}

/* --------------------- render every screen state -------------------- */
console.log('\n=== Render smoke test (all screens) ===');
{
  const game = new Game(fakeCanvas);
  const states = [STATE.TITLE, STATE.STORY];
  let threw = false;
  try {
    for (const s of states) { game.state = s; for (let k = 0; k < 5; k++) { game.titleT++; game.render(); } }
    game.loadLevel(0);
    for (const s of [STATE.PLAYING, STATE.PAUSED, STATE.LEVEL_CLEAR, STATE.COOKING, STATE.WIN, STATE.GAME_OVER]) {
      game.state = s; for (let k = 0; k < 5; k++) { game.titleT++; game.render(); }
    }
  } catch (e) { threw = true; fail('render threw: ' + e.message + '\n' + e.stack); }
  if (!threw) ok('all screens rendered without throwing');
}

console.log('\n=====================================');
if (failures === 0) { console.log('ALL CHECKS PASSED ✓'); process.exit(0); }
else { console.log(`${failures} CHECK(S) FAILED ✗`); process.exit(1); }
