/* =========================================================================
 * game.js — the engine: fixed-timestep loop, state machine, camera,
 * collisions, juice (dust / embers / hitstop / flash / combos / popups),
 * HUD and all the screens. This file ties everything together.
 * ========================================================================= */

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    canvas.width = CONFIG.WIDTH;
    canvas.height = CONFIG.HEIGHT;

    this.state = STATE.TITLE;
    this.levelIndex = 0;
    this.lives = CONFIG.START_LIVES;
    this.score = 0;
    this.collected = 0;
    this.cam = { x: 0, y: 0 };
    this.camLook = 0;
    this.particles = [];
    this.floats = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ff3b2e';
    this.freeze = 0;
    this.transition = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.levelFrames = 0;
    this.levelHits = 0;
    this.lastStars = 0;
    this.timer = 0;
    this.cookTimer = 0;
    this.bannerTimer = 0;
    this.titleT = 0;
    this._tap = false;

    this.highScore = parseInt(localStorage.getItem('rat_highscore') || '0', 10);

    const tap = () => { this._tap = true; Sound.init(); Sound.resume(); };
    canvas.addEventListener('mousedown', tap);
    canvas.addEventListener('touchstart', () => { tap(); }, { passive: true });

    this._loop = this._loop.bind(this);
  }

  start() {
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame(this._loop);
  }

  loadLevel(i) {
    this.levelIndex = i;
    this.level = new Level(RAW_LEVELS[i], i);
    this.player = this.level.player;
    this.collected = 0;
    this.cam.x = Utils.clamp(this.player.cx - CONFIG.WIDTH * 0.5, 0,
                             Math.max(0, this.level.pixelWidth - CONFIG.WIDTH));
    this.camLook = 0;
    this.particles = [];
    this.floats = [];
    this.combo = 0; this.comboTimer = 0;
    this.levelFrames = 0; this.levelHits = 0;
    this.freeze = 0; this.flash = 0;
    this.transition = 1;
    this.bannerTimer = 200;
    this.state = STATE.PLAYING;
    Sound.startMusic();
  }

  /* ----------------------------- main loop --------------------------- */
  _loop(now) {
    this.acc += now - this.last;
    this.last = now;
    if (this.acc > 200) this.acc = 200;
    while (this.acc >= CONFIG.STEP_MS) { this.update(); this.acc -= CONFIG.STEP_MS; }
    this.render();
    requestAnimationFrame(this._loop);
  }

  advancePressed() { return Input.enterPressed || Input.jumpPressed || this._tap; }

  /* ----------------------------- update ------------------------------ */
  update() {
    this.titleT++;
    if (Input.mutePressed) Sound.toggle();

    switch (this.state) {
      case STATE.TITLE:
        if (this.advancePressed()) { Sound.init(); Sound.resume(); this.state = STATE.STORY; }
        break;
      case STATE.STORY:
        if (this.advancePressed()) { this.score = 0; this.lives = CONFIG.START_LIVES; this.loadLevel(0); }
        break;
      case STATE.PLAYING:
        this._updatePlaying();
        break;
      case STATE.PAUSED:
        if (Input.pausePressed) this.state = STATE.PLAYING;
        break;
      case STATE.LEVEL_CLEAR:
        this.timer++;
        this._updateFx();
        if (this.timer > 40 && this.advancePressed()) this._nextLevel();
        break;
      case STATE.COOKING:
        this._updateCooking();
        break;
      case STATE.WIN:
        this._updateFx();
        if (this.advancePressed()) this.state = STATE.TITLE;
        break;
      case STATE.GAME_OVER:
        if (this.advancePressed()) { this.lives = CONFIG.START_LIVES; this.loadLevel(this.levelIndex); }
        break;
    }

    if (this.shake > 0) this.shake *= 0.86;
    if (this.flash > 0.001) this.flash *= 0.88; else this.flash = 0;
    if (this.transition > 0) this.transition = Math.max(0, this.transition - 0.05);
    Input.endFrame();
    this._tap = false;
  }

  _updatePlaying() {
    const lvl = this.level;
    if (Input.pausePressed) { this.state = STATE.PAUSED; return; }
    if (Input.restartPressed) { this.loadLevel(this.levelIndex); return; }

    // hit-stop: freeze the simulation for a few frames but keep effects lively
    if (this.freeze > 0) { this.freeze--; this._updateFx(); return; }

    this.levelFrames++;

    this.player.update(lvl, lvl.platforms);
    this._playerFx();

    lvl.fires.forEach(f => f.update());
    lvl.bugs.forEach(b => b.update(lvl));
    lvl.ingredients.forEach(o => o.update());
    lvl.platforms.forEach(p => p.update());
    lvl.goal.update();
    this._emitEmbers();

    this._collisions();

    if (this.comboTimer > 0) this.comboTimer--; else this.combo = 0;

    if (this.player.dead) { this.player.dead = false; this._loseLife(true); }

    this._updateFx();
    this._updateCamera();
    if (this.bannerTimer > 0) this.bannerTimer--;
  }

  _playerFx() {
    const p = this.player;
    const feet = p.y + p.h;
    if (p.justJumped) this._puff(p.cx, feet, 5);
    if (p.justLanded) { this._puff(p.cx, feet, 8); Sound.land(); }
    if (p.onGround && Math.abs(p.vx) > 3 && this.levelFrames % 8 === 0) {
      this.particles.push(new Particle(p.cx - p.face * 6, feet - 2,
        -p.face * Utils.rand(0.5, 1.5), -Utils.rand(0.3, 1), Utils.randInt(12, 20),
        'rgba(220,205,180,0.7)', Utils.rand(1.5, 3)));
      Sound.step();
    }
  }

  _emitEmbers() {
    const lvl = this.level;
    for (let i = 0; i < lvl.fires.length; i++) {
      const f = lvl.fires[i];
      if ((f.jet && !f.on) || (this.titleT + i * 3) % 9 !== 0) continue;
      const hb = f.hitbox;
      if (hb.x < this.cam.x - 60 || hb.x > this.cam.x + CONFIG.WIDTH + 60) continue;
      const e = new Particle(hb.x + hb.w / 2 + Utils.rand(-6, 6), hb.y + 4,
        Utils.rand(-0.6, 0.6), Utils.rand(-1.8, -0.8), Utils.randInt(24, 44),
        Utils.pick(['#ffcf6b', '#ff9d3a', '#ff6a2a']), Utils.rand(1.5, 3));
      e.grav = -0.02;   // embers drift upward
      this.particles.push(e);
    }
  }

  _collisions() {
    const p = this.player;
    const lvl = this.level;

    for (const f of lvl.fires) {
      const hb = f.hitbox;
      if (hb.h > 4 && Utils.overlap(p, hb)) { this._hitPlayer(hb.x + hb.w / 2); break; }
    }

    for (const b of lvl.bugs) {
      if (b.dead) continue;
      if (Utils.overlap(p, b)) {
        const stomping = p.vy > 1 && (p.y + p.h) < b.y + b.h * 0.6;
        if (stomping) {
          b.dead = true;
          p.vy = -CONFIG.STOMP_BOUNCE;
          this.combo++;
          this.comboTimer = CONFIG.COMBO_WINDOW;
          const pts = CONFIG.SCORE_STOMP * this.combo;
          this.score += pts;
          this.freeze = CONFIG.HITSTOP_STOMP;
          Sound.stomp(); Sound.combo(this.combo);
          this._puff(b.x + b.w / 2, b.y + b.h, 8);
          this._burst(b.x + b.w / 2, b.y, '#6b3f2a', 10);
          this.floats.push(new FloatText(b.x + b.w / 2, b.y - 6, '+' + pts, '#ffe27a', 16));
          if (this.combo >= 2)
            this.floats.push(new FloatText(b.x + b.w / 2, b.y - 26, 'COMBO x' + this.combo,
              this.level.theme.accent, 15));
        } else {
          this._hitPlayer(b.x + b.w / 2);
        }
      }
    }

    for (const o of lvl.ingredients) {
      if (o.collected) continue;
      if (Utils.overlap(p, o)) {
        o.collected = true;
        this.collected++;
        this.score += CONFIG.SCORE_INGREDIENT;
        Sound.coin();
        this._burst(o.x + o.w / 2, o.y + o.h / 2, '#ffe27a', 9);
        this.floats.push(new FloatText(o.x + o.w / 2, o.y, '+' + CONFIG.SCORE_INGREDIENT, '#fff3c4', 15));
      }
    }

    const g = lvl.goal;
    if (g.isPot) {
      g.active = this.collected >= lvl.totalIngredients;
      if (g.active && Utils.overlap(p, g.hitbox)) this._startCooking();
    } else {
      if (Utils.overlap(p, g.hitbox)) this._levelClear();
    }
  }

  _hitPlayer() {
    const p = this.player;
    if (p.invuln > 0) return;
    if (p.hurt()) {
      this.lives--;
      this.levelHits++;
      this.combo = 0;
      this.shake = 13;
      this.freeze = CONFIG.HITSTOP_HURT;
      this.flash = 0.6; this.flashColor = '#ff3b2e';
      Sound.hurt(); Sound.fire();
      this._burst(p.cx, p.cy, '#ff7a2e', 16);
      if (this.lives <= 0) this._gameOver();
    }
  }

  _loseLife(respawn) {
    this.lives--;
    this.levelHits++;
    this.shake = 11;
    this.flash = 0.5; this.flashColor = '#ff3b2e';
    Sound.hurt();
    if (this.lives <= 0) { this._gameOver(); return; }
    if (respawn) { this.player.reset(); this.player.invuln = 60; this.combo = 0; }
  }

  _computeStars() {
    const timeSec = this.levelFrames / 60;
    const allVeg = this.collected >= this.level.totalIngredients;
    const noHit = this.levelHits === 0;
    let stars = 1 + (allVeg ? 1 : 0) + (noHit ? 1 : 0);
    // score bonuses
    let bonus = CONFIG.SCORE_LEVEL_CLEAR + this.lives * 200;
    if (allVeg) bonus += 500;
    if (noHit) bonus += 750;
    bonus += Math.max(0, 2000 - Math.floor(timeSec) * 40);   // speed bonus
    this.score += bonus;
    this.lastStars = Math.min(3, stars);
    this.lastTime = timeSec;
    for (let i = 0; i < this.lastStars; i++) setTimeout(() => Sound.star(), i * 160);
  }

  _levelClear() {
    if (this.state !== STATE.PLAYING) return;
    this._computeStars();
    this.state = STATE.LEVEL_CLEAR;
    this.timer = 0;
    Sound.stopMusic();
    Sound.clear();
  }

  _nextLevel() {
    if (this.levelIndex + 1 < LEVEL_COUNT) this.loadLevel(this.levelIndex + 1);
    else this._win();
  }

  _startCooking() {
    this._computeStars();          // bank the finale's stars & bonuses
    this.state = STATE.COOKING;
    this.cookTimer = 0;
    this.level.goal.cooking = true;
    Sound.stopMusic();
  }

  _updateCooking() {
    this.cookTimer++;
    const g = this.level.goal;
    if (this.cookTimer % 18 === 0) Sound.cook();
    if (this.cookTimer % 5 === 0) {
      const cx = g.x + g.w / 2;
      this._burst(cx + Utils.rand(-20, 20), g.y - 10,
        Utils.pick(['#e23b2e', '#7a4fa3', '#e0b400', '#3fa64b']), 4, -2);
    }
    this._updateFx();
    if (this.cookTimer > 210) this._win();
  }

  _win() {
    this.state = STATE.WIN;
    this.titleT = 0;
    Sound.stopMusic();
    Sound.win();
    this._saveHigh();
  }

  _gameOver() {
    this.state = STATE.GAME_OVER;
    Sound.stopMusic();
    Sound.gameover();
    this._saveHigh();
  }

  _saveHigh() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('rat_highscore', String(this.highScore));
    }
  }

  /* --------------------------- effects ------------------------------- */
  _burst(x, y, color, n, vyBias = 0) {
    for (let i = 0; i < n; i++)
      this.particles.push(new Particle(x, y, Utils.rand(-2.5, 2.5),
        Utils.rand(-3.5, -0.5) + vyBias, Utils.randInt(20, 40), color, Utils.rand(2, 4.5)));
  }
  _puff(x, y, n) {
    for (let i = 0; i < n; i++) {
      const p = new Particle(x + Utils.rand(-6, 6), y, Utils.rand(-1.6, 1.6),
        Utils.rand(-1.4, -0.2), Utils.randInt(14, 26), 'rgba(225,210,185,0.75)', Utils.rand(2, 4));
      p.grav = 0.04;
      this.particles.push(p);
    }
  }
  _updateFx() {
    for (const pt of this.particles) pt.update();
    this.particles = this.particles.filter(pt => !pt.dead);
    for (const f of this.floats) f.update();
    this.floats = this.floats.filter(f => !f.dead);
  }

  /* ---------------------------- camera ------------------------------- */
  _updateCamera() {
    const look = this.player.face * CONFIG.LOOKAHEAD;
    this.camLook = Utils.lerp(this.camLook, look, 0.05);
    const target = this.player.cx - CONFIG.WIDTH * 0.5 + this.camLook;
    this.cam.x = Utils.lerp(this.cam.x, target, CONFIG.CAM_EASE);
    this.cam.x = Utils.clamp(this.cam.x, 0, Math.max(0, this.level.pixelWidth - CONFIG.WIDTH));
  }

  /* ============================ RENDER =============================== */
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);

    if (this.state === STATE.TITLE || this.state === STATE.STORY) {
      this._drawMenuBackground();
    } else {
      this._drawWorld();
      this._drawHUD();
    }

    switch (this.state) {
      case STATE.TITLE: this._drawTitle(); break;
      case STATE.STORY: this._drawStory(); break;
      case STATE.PAUSED: this._overlay('PAUSED', 'Press P to resume'); break;
      case STATE.LEVEL_CLEAR: this._drawLevelClear(); break;
      case STATE.COOKING: this._drawCooking(); break;
      case STATE.WIN: this._drawWin(); break;
      case STATE.GAME_OVER: this._drawGameOver(); break;
      default: if (this.bannerTimer > 0) this._drawBanner();
    }

    // screen flash (damage / feedback)
    if (this.flash > 0.01) {
      ctx.fillStyle = this.flashColor;
      ctx.globalAlpha = this.flash * 0.5;
      ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
      ctx.globalAlpha = 1;
    }
    // fade transition
    if (this.transition > 0.01) {
      ctx.fillStyle = '#160b05';
      ctx.globalAlpha = this.transition;
      ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
      ctx.globalAlpha = 1;
    }
  }

  _drawWorld() {
    const ctx = this.ctx;
    this._drawKitchenBackground();

    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.save();
    ctx.translate(-Math.round(this.cam.x) + sx, -Math.round(this.cam.y) + sy);

    this._drawTiles();
    this.level.platforms.forEach(p => p.draw(ctx));
    this.level.ingredients.forEach(o => o.draw(ctx));
    this.level.goal.draw(ctx);
    this.level.fires.forEach(f => f.draw(ctx));
    this.level.bugs.forEach(b => b.draw(ctx));

    // player + contact shadow cast down to the ground below
    const p = this.player;
    let gy = p.y + p.h, col = Math.floor(p.cx / CONFIG.TILE);
    for (let r = Math.floor((p.y + p.h) / CONFIG.TILE); r < this.level.height; r++) {
      if (this.level.solidAt(col, r)) { gy = r * CONFIG.TILE; break; }
    }
    const drop = Utils.clamp(1 - (gy - (p.y + p.h)) / 300, 0.25, 1);
    Sprites.softShadow(ctx, p.cx, gy - 2, p.w * 0.55 * drop, 0.28 * drop);
    p.draw(ctx, this.level.isFinal);

    this.particles.forEach(pt => pt.draw(ctx));
    this.floats.forEach(f => f.draw(ctx));

    ctx.restore();

    // soft vignette for depth
    const vg = ctx.createRadialGradient(CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, CONFIG.HEIGHT * 0.4,
      CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2, CONFIG.HEIGHT * 0.85);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
  }

  _drawKitchenBackground() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const th = this.level.theme;

    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, th.top);
    g.addColorStop(0.55, th.mid);
    g.addColorStop(1, th.bot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // warm window glow (slow parallax)
    const px = (-this.cam.x * 0.2) % (W + 400);
    const wg = ctx.createRadialGradient(180 + px, 120, 10, 180 + px, 120, 200);
    wg.addColorStop(0, th.warm);
    wg.addColorStop(1, 'rgba(255,245,200,0)');
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = wg;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;

    // background shelves with jars (parallax)
    const off = -(this.cam.x * 0.35);
    for (let s = 0; s < 2; s++) {
      const shelfY = 150 + s * 120;
      ctx.fillStyle = 'rgba(70,45,25,0.28)';
      ctx.fillRect(0, shelfY + 34, W, 8);
      for (let j = -1; j < 14; j++) {
        const jx = ((j * 90 + off * (s + 1) * 0.5) % (W + 180));
        const x = jx < -90 ? jx + (W + 180) : jx;
        ctx.fillStyle = ['rgba(150,100,65,0.32)', 'rgba(120,140,95,0.32)', 'rgba(140,110,150,0.32)'][(j + 3) % 3];
        Utils.roundRect(ctx, x, shelfY, 26, 34, 5); ctx.fill();
        ctx.fillStyle = 'rgba(70,45,25,0.32)';
        ctx.fillRect(x + 4, shelfY - 4, 18, 6);
      }
    }

    // faint wall tile lines
    ctx.strokeStyle = 'rgba(90,60,35,0.10)';
    ctx.lineWidth = 1;
    const gx = -(this.cam.x * 0.5) % 80;
    for (let x = gx; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  }

  _drawTiles() {
    const ctx = this.ctx;
    const T = CONFIG.TILE;
    const lvl = this.level;
    const th = lvl.theme;
    const startCol = Math.max(0, Math.floor(this.cam.x / T));
    const endCol = Math.min(lvl.width - 1, Math.ceil((this.cam.x + CONFIG.WIDTH) / T));

    for (let c = startCol; c <= endCol; c++) {
      for (let r = 0; r < lvl.height; r++) {
        const ch = lvl.grid[r][c];
        if (ch !== '#' && ch !== 'B') continue;
        const x = c * T, y = r * T;
        const topOpen = !lvl.solidAt(c, r - 1);
        if (ch === 'B') {
          ctx.fillStyle = '#9a6a3a';
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = '#85582e';
          for (let k = 0; k < 3; k++) ctx.fillRect(x, y + 6 + k * 12, T, 2);
          if (topOpen) { ctx.fillStyle = '#c79a5c'; ctx.fillRect(x, y, T, 6); }
        } else {
          ctx.fillStyle = topOpen ? th.floor : th.floor;
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(x, y, T, 2);
          ctx.fillRect(x, y, 2, T);
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
          if (topOpen) { ctx.fillStyle = th.floorTop; ctx.fillRect(x, y, T, 6); }
        }
      }
    }
  }

  /* ----------------------------- HUD --------------------------------- */
  _drawHUD() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    ctx.save();
    ctx.fillStyle = 'rgba(30,20,12,0.55)';
    ctx.fillRect(0, 0, W, 46);

    ctx.textBaseline = 'middle';
    ctx.font = "bold 18px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(`Kitchen ${this.levelIndex + 1}/${LEVEL_COUNT}  ·  ${this.level.name}`, 14, 22);

    // ingredients
    ctx.textAlign = 'center';
    Sprites.drawIngredient(ctx, W / 2 - 78, 8, 26, 26, 'tomato', this.titleT);
    ctx.fillStyle = this.collected >= this.level.totalIngredients ? '#a8f0a0' : '#ffe9c2';
    ctx.fillText(`${this.collected} / ${this.level.totalIngredients}`, W / 2 - 34, 22);

    // timer
    const secs = Math.floor(this.levelFrames / 60);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(`⏱ ${mm}:${ss}`, W / 2 + 60, 22);

    // score
    ctx.textAlign = 'right';
    ctx.fillText(`Score ${this.score}`, W - 150, 22);

    // lives
    for (let i = 0; i < this.lives; i++) this._heart(ctx, W - 128 + i * 26, 22, 9);

    // slim progress bar to the exit
    const goalX = this.level.goal.x;
    const prog = Utils.clamp(this.player.x / Math.max(1, goalX), 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(14, 40, W - 28, 4);
    ctx.fillStyle = this.level.theme.accent;
    ctx.fillRect(14, 40, (W - 28) * prog, 4);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(14 + (W - 28) * prog, 42, 4, 0, Math.PI * 2); ctx.fill();

    // combo meter
    if (this.combo >= 2) {
      const a = Utils.clamp(this.comboTimer / CONFIG.COMBO_WINDOW, 0, 1);
      ctx.globalAlpha = 0.5 + a * 0.5;
      ctx.textAlign = 'center';
      this._shadowText(`COMBO x${this.combo}`, W / 2, 74,
        "bold 26px 'Trebuchet MS', sans-serif", this.level.theme.accent);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _heart(ctx, x, y, s) {
    ctx.save();
    ctx.fillStyle = '#e0506a';
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.7);
    ctx.bezierCurveTo(x - s, y - s * 0.4, x - s * 0.2, y - s, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.2, y - s, x + s, y - s * 0.4, x, y + s * 0.7);
    ctx.fill();
    ctx.restore();
  }

  _star(ctx, x, y, r, filled) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    ctx.closePath();
    if (filled) { ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.strokeStyle = '#a9761b'; ctx.lineWidth = 2; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 2; ctx.stroke(); }
    ctx.restore();
  }

  _drawStars(cx, y, count) {
    const gap = 54;
    for (let i = 0; i < 3; i++) {
      const grow = this.timer > 20 + i * 12;   // pop in one by one on the clear screen
      this._star(this.ctx, cx - gap + i * gap, y, grow ? 22 : 18, i < count && grow);
    }
  }

  _drawBanner() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    // slide in / hold / slide out
    const t = this.bannerTimer;
    let slide = 0;
    if (t > 180) slide = (t - 180) / 20;          // entering (from top)
    else if (t < 30) slide = (30 - t) / 30;       // leaving
    const y = 70 - slide * 90;
    const a = 1 - Math.abs(slide);
    ctx.save();
    ctx.globalAlpha = Utils.clamp(a, 0, 1);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30,20,12,0.78)';
    Utils.roundRect(ctx, W / 2 - 300, y, 600, 66, 14); ctx.fill();
    ctx.fillStyle = this.level.theme.accent;
    ctx.fillRect(W / 2 - 300, y, 600, 4);
    this._shadowText(`KITCHEN ${this.levelIndex + 1}  ·  ${this.level.name}`, W / 2, y + 24,
      "bold 22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    ctx.fillStyle = '#ffd9a0';
    ctx.font = "italic 15px 'Trebuchet MS', sans-serif";
    ctx.fillText(this.level.subtitle, W / 2, y + 48);
    ctx.restore();
  }

  /* ----------------------------- menus ------------------------------- */
  _drawMenuBackground() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#7a2b1c');
    g.addColorStop(1, '#3a140d');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 34; i++) {
      const t = this.titleT * 0.5 + i * 60;
      const x = (i * 53 + Math.sin(t * 0.02) * 40) % W;
      const y = H - ((t * 1.2) % (H + 60));
      ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,0.7)`;
      ctx.beginPath(); ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2); ctx.fill();
    }
  }

  _shadowText(text, x, y, font, color, align = 'center') {
    const ctx = this.ctx;
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(text, x + 3, y + 3);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  _drawTitle() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    const bob = Math.sin(this.titleT * 0.05) * 8;
    Sprites.drawRemy(ctx, W / 2 - 50, 150 + bob, 100, 120, 1, this.titleT * 0.1, false, true);

    this._shadowText('RATATOUILLE', W / 2, 108, "bold 66px 'Trebuchet MS', sans-serif", '#ffcf6b');
    this._shadowText("Remy's Kitchen Run", W / 2, 165, "italic 26px 'Trebuchet MS', sans-serif", '#ffe9c2');

    if (Math.sin(this.titleT * 0.12) > -0.3)
      this._shadowText('Press ENTER / SPACE  ·  or TAP to start', W / 2, 372,
        "bold 24px 'Trebuchet MS', sans-serif", '#fff');

    this._shadowText('← →  move      SPACE / ↑  jump (hold = higher)      P  pause      M  mute',
      W / 2, 434, "16px 'Trebuchet MS', sans-serif", '#ffd9a0');
    this._shadowText(`High Score: ${this.highScore}`, W / 2, 470,
      "18px 'Trebuchet MS', sans-serif", '#ffe9c2');
  }

  _drawStory() {
    const W = CONFIG.WIDTH;
    this._shadowText('How to play', W / 2, 84, "bold 40px 'Trebuchet MS', sans-serif", '#ffcf6b');
    const lines = [
      'Remy the rat dreams of becoming a great chef.',
      'Dash across five kitchens, leaping over the FIRE on the floor.',
      'Grab the ingredients — tomato, eggplant, pepper, mushroom, cheese.',
      'Stomp the pesky kitchen bugs (chain them for COMBOS!) — never touch flames.',
      '',
      'Clear a kitchen fast, unhurt, and fully stocked for 3 ⭐.',
      'On the 5th — the Grand Kitchen — collect EVERY ingredient to light',
      'the pot and COOK THE RATATOUILLE. Bon appétit!',
    ];
    lines.forEach((l, i) =>
      this._shadowText(l, W / 2, 150 + i * 33, "20px 'Trebuchet MS', sans-serif", '#ffe9c2'));
    if (Math.sin(this.titleT * 0.12) > -0.3)
      this._shadowText('Press ENTER / SPACE  ·  or TAP to begin', W / 2, 474,
        "bold 22px 'Trebuchet MS', sans-serif", '#fff');
  }

  _overlay(title, sub) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    this._shadowText(title, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 - 20,
      "bold 52px 'Trebuchet MS', sans-serif", '#ffcf6b');
    if (sub) this._shadowText(sub, CONFIG.WIDTH / 2, CONFIG.HEIGHT / 2 + 36,
      "22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    ctx.restore();
  }

  _drawLevelClear() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, W, CONFIG.HEIGHT);
    this._shadowText('Kitchen Cleared!', W / 2, 130, "bold 50px 'Trebuchet MS', sans-serif", '#a8f0a0');
    this._drawStars(W / 2, 205, this.lastStars);
    this._shadowText(`Ingredients ${this.collected}/${this.level.totalIngredients}    ·    ` +
      `Time ${this.lastTime ? this.lastTime.toFixed(1) : '0.0'}s`, W / 2, 270,
      "20px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Score: ${this.score}`, W / 2, 306, "22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    if (Math.sin(this.titleT * 0.12) > -0.3)
      this._shadowText('Press ENTER / SPACE to continue', W / 2, 400,
        "bold 22px 'Trebuchet MS', sans-serif", '#fff');
  }

  _drawCooking() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, CONFIG.HEIGHT);
    this._shadowText('Cooking the Ratatouille…', W / 2, 90,
      "bold 40px 'Trebuchet MS', sans-serif", '#ffcf6b');
    const pct = Utils.clamp(this.cookTimer / 210, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    Utils.roundRect(ctx, W / 2 - 180, 130, 360, 22, 11); ctx.fill();
    ctx.fillStyle = '#e2462e';
    Utils.roundRect(ctx, W / 2 - 178, 132, 356 * pct, 18, 9); ctx.fill();
    ctx.restore();
  }

  _drawWin() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    ctx.fillStyle = 'rgba(20,8,4,0.72)';
    ctx.fillRect(0, 0, W, CONFIG.HEIGHT);
    const bob = Math.sin(this.titleT * 0.06) * 6;
    Sprites.drawRemy(ctx, W / 2 - 45, 120 + bob, 90, 108, 1, this.titleT * 0.12, false, true);
    this._drawDish(ctx, W / 2, 288, this.titleT);
    this._shadowText('Bon Appétit!', W / 2, 66, "bold 58px 'Trebuchet MS', sans-serif", '#ffcf6b');
    this._shadowText('You cooked the perfect ratatouille — Remy is a chef!',
      W / 2, 350, "italic 22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Final Score: ${this.score}    ·    High Score: ${this.highScore}`,
      W / 2, 398, "bold 24px 'Trebuchet MS', sans-serif", '#fff');
    if (Math.sin(this.titleT * 0.12) > -0.3)
      this._shadowText('Press ENTER / SPACE to play again', W / 2, 458,
        "20px 'Trebuchet MS', sans-serif", '#ffd9a0');
  }

  _drawDish(ctx, cx, cy, t) {
    ctx.save();
    ctx.fillStyle = '#f4f1ec';
    ctx.beginPath(); ctx.ellipse(cx, cy, 110, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6e0d6';
    ctx.beginPath(); ctx.ellipse(cx, cy, 84, 22, 0, 0, Math.PI * 2); ctx.fill();
    const cols = ['#e23b2e', '#7a4fa3', '#e0b400', '#3fa64b', '#c8552b'];
    for (let i = 0; i < 18; i++) {
      const ang = i * 0.9 + t * 0.01;
      const rad = 12 + i * 3.6;
      const x = cx + Math.cos(ang) * rad;
      const y = cy + Math.sin(ang) * rad * 0.28;
      ctx.fillStyle = cols[i % cols.length];
      ctx.beginPath(); ctx.ellipse(x, y, 9, 4.5, ang, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(x - 1, y - 1, 4, 2, ang, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  _drawGameOver() {
    const W = CONFIG.WIDTH;
    this.ctx.fillStyle = 'rgba(20,4,4,0.74)';
    this.ctx.fillRect(0, 0, W, CONFIG.HEIGHT);
    this._shadowText('Out of Lives!', W / 2, 200, "bold 56px 'Trebuchet MS', sans-serif", '#ff7a5a');
    this._shadowText(`You reached ${this.level.name}`, W / 2, 260,
      "italic 22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Score: ${this.score}`, W / 2, 300, "22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    if (Math.sin(this.titleT * 0.12) > -0.3)
      this._shadowText('Press ENTER / SPACE to retry this kitchen', W / 2, 380,
        "bold 22px 'Trebuchet MS', sans-serif", '#fff');
  }
}

/* ------------------------------ bootstrap ---------------------------- */
window.addEventListener('load', () => {
  const canvas = document.getElementById('game');
  Input.init();
  Sound.init();
  const game = new Game(canvas);
  game.start();

  const resize = () => {
    const scale = Math.min(window.innerWidth / CONFIG.WIDTH, window.innerHeight / CONFIG.HEIGHT);
    canvas.style.width = Math.floor(CONFIG.WIDTH * scale) + 'px';
    canvas.style.height = Math.floor(CONFIG.HEIGHT * scale) + 'px';
  };
  window.addEventListener('resize', resize);
  resize();
});
