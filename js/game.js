/* =========================================================================
 * game.js — the engine: fixed-timestep loop, state machine, camera,
 * collisions, HUD and all the screens. This file ties everything together.
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
    this.particles = [];
    this.shake = 0;
    this.timer = 0;
    this.cookTimer = 0;
    this.bannerTimer = 0;
    this.titleT = 0;
    this._tap = false;

    this.highScore = parseInt(localStorage.getItem('rat_highscore') || '0', 10);

    // advance menus with a tap/click anywhere
    const tap = () => {
      this._tap = true;
      Sound.init(); Sound.resume();
    };
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
    this.cam.x = 0;
    this.particles = [];
    this.bannerTimer = 300;
    this.state = STATE.PLAYING;
    Sound.startMusic();
  }

  /* ----------------------------- main loop --------------------------- */
  _loop(now) {
    this.acc += now - this.last;
    this.last = now;
    if (this.acc > 200) this.acc = 200;        // avoid spiral of death
    while (this.acc >= CONFIG.STEP_MS) {
      this.update();
      this.acc -= CONFIG.STEP_MS;
    }
    this.render();
    requestAnimationFrame(this._loop);
  }

  advancePressed() {
    return Input.enterPressed || Input.jumpPressed || this._tap;
  }

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
        if (this.timer > 40 && this.advancePressed()) this._nextLevel();
        break;
      case STATE.COOKING:
        this._updateCooking();
        break;
      case STATE.WIN:
        this.titleT++;
        if (this.advancePressed()) { this.state = STATE.TITLE; }
        break;
      case STATE.GAME_OVER:
        if (this.advancePressed()) { this.lives = CONFIG.START_LIVES; this.loadLevel(this.levelIndex); }
        break;
    }

    if (this.shake > 0) this.shake *= 0.86;
    Input.endFrame();
    this._tap = false;
  }

  _updatePlaying() {
    const lvl = this.level;

    if (Input.pausePressed) { this.state = STATE.PAUSED; return; }
    if (Input.restartPressed) { this.loadLevel(this.levelIndex); return; }

    this.player.update(lvl, lvl.platforms);
    lvl.fires.forEach(f => f.update());
    lvl.bugs.forEach(b => b.update(lvl));
    lvl.ingredients.forEach(o => o.update());
    lvl.platforms.forEach(p => p.update());
    lvl.goal.update();

    this._collisions();

    // pit / fall death
    if (this.player.dead) {
      this.player.dead = false;
      this._loseLife(true);
    }

    this._updateParticles();
    this._updateCamera();
    if (this.bannerTimer > 0) this.bannerTimer--;
  }

  _collisions() {
    const p = this.player;
    const lvl = this.level;

    // ---- fire ----
    for (const f of lvl.fires) {
      const hb = f.hitbox;
      if (hb.h > 4 && Utils.overlap(p, hb)) { this._hitPlayer(hb.x + hb.w / 2); break; }
    }

    // ---- bugs ----
    for (const b of lvl.bugs) {
      if (b.dead) continue;
      if (Utils.overlap(p, b)) {
        const stomping = p.vy > 1 && (p.y + p.h) < b.y + b.h * 0.6;
        if (stomping) {
          b.dead = true;
          p.vy = -CONFIG.STOMP_BOUNCE;
          this.score += CONFIG.SCORE_STOMP;
          Sound.stomp();
          this._burst(b.x + b.w / 2, b.y, '#6b3f2a', 10);
        } else {
          this._hitPlayer(b.x + b.w / 2);
        }
      }
    }

    // ---- ingredients ----
    for (const o of lvl.ingredients) {
      if (o.collected) continue;
      if (Utils.overlap(p, o)) {
        o.collected = true;
        this.collected++;
        this.score += CONFIG.SCORE_INGREDIENT;
        Sound.coin();
        this._burst(o.x + o.w / 2, o.y + o.h / 2, '#ffe27a', 8);
      }
    }

    // ---- goal ----
    const g = lvl.goal;
    if (g.isPot) {
      g.active = this.collected >= lvl.totalIngredients;
      if (g.active && Utils.overlap(p, g.hitbox)) this._startCooking();
    } else {
      if (Utils.overlap(p, g.hitbox)) this._levelClear();
    }
  }

  _hitPlayer(sourceX) {
    const p = this.player;
    if (p.invuln > 0) return;
    if (p.hurt()) {
      this.lives--;
      this.shake = 12;
      Sound.hurt(); Sound.fire();
      this._burst(p.cx, p.cy, '#ff7a2e', 14);
      if (this.lives <= 0) this._gameOver();
    }
  }

  _loseLife(respawn) {
    this.lives--;
    this.shake = 10;
    Sound.hurt();
    if (this.lives <= 0) { this._gameOver(); return; }
    if (respawn) {
      this.player.reset();
      this.player.invuln = 60;
    }
  }

  _levelClear() {
    if (this.state !== STATE.PLAYING) return;
    this.score += CONFIG.SCORE_LEVEL_CLEAR + this.lives * 200;
    this.state = STATE.LEVEL_CLEAR;
    this.timer = 0;
    Sound.stopMusic();
    Sound.clear();
  }

  _nextLevel() {
    if (this.levelIndex + 1 < LEVEL_COUNT) {
      this.loadLevel(this.levelIndex + 1);
    } else {
      this._win();
    }
  }

  _startCooking() {
    this.state = STATE.COOKING;
    this.cookTimer = 0;
    this.level.goal.cooking = true;
    Sound.stopMusic();
  }

  _updateCooking() {
    this.cookTimer++;
    const g = this.level.goal;
    // periodic sizzle + ingredient particles tumbling into the pot
    if (this.cookTimer % 18 === 0) Sound.cook();
    if (this.cookTimer % 6 === 0) {
      const cx = g.x + g.w / 2;
      this._burst(cx + Utils.rand(-20, 20), g.y - 10,
        Utils.pick(['#e23b2e', '#7a4fa3', '#e0b400', '#3fa64b']), 4, -2);
    }
    this._updateParticles();
    if (this.cookTimer > 210) {
      this.score += CONFIG.SCORE_LEVEL_CLEAR + this.lives * 200;
      this._win();
    }
  }

  _win() {
    this.state = STATE.WIN;
    this.titleT = 0;
    Sound.stopMusic();
    Sound.win();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('rat_highscore', String(this.highScore));
    }
  }

  _gameOver() {
    this.state = STATE.GAME_OVER;
    Sound.stopMusic();
    Sound.gameover();
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('rat_highscore', String(this.highScore));
    }
  }

  /* --------------------------- particles ----------------------------- */
  _burst(x, y, color, n, vyBias = 0) {
    for (let i = 0; i < n; i++) {
      this.particles.push(new Particle(
        x, y,
        Utils.rand(-2.5, 2.5), Utils.rand(-3.5, -0.5) + vyBias,
        Utils.randInt(20, 40), color, Utils.rand(2, 4.5)));
    }
  }
  _updateParticles() {
    for (const pt of this.particles) pt.update();
    this.particles = this.particles.filter(pt => !pt.dead);
  }

  /* ---------------------------- camera ------------------------------- */
  _updateCamera() {
    const target = this.player.cx - CONFIG.WIDTH * 0.4;
    this.cam.x = Utils.lerp(this.cam.x, target, 0.12);
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
    this.particles.forEach(pt => pt.draw(ctx));
    this.player.draw(ctx, this.level.isFinal);

    ctx.restore();
  }

  _drawKitchenBackground() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH, H = CONFIG.HEIGHT;
    // warm wall gradient
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#f3e2c4');
    g.addColorStop(0.55, '#e7c79a');
    g.addColorStop(1, '#cf9f6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // sunny window glow upper-left (parallax)
    const px = (-this.cam.x * 0.2) % (W + 400);
    ctx.fillStyle = 'rgba(255,245,200,0.5)';
    ctx.beginPath();
    ctx.ellipse(180 + px, 120, 160, 120, 0, 0, Math.PI * 2);
    ctx.fill();

    // background shelves with jars (parallax)
    const off = -(this.cam.x * 0.35);
    for (let s = 0; s < 2; s++) {
      const shelfY = 150 + s * 120;
      ctx.fillStyle = 'rgba(120,80,45,0.35)';
      ctx.fillRect(0, shelfY + 34, W, 8);
      for (let j = -1; j < 14; j++) {
        const jx = ((j * 90 + off * (s + 1) * 0.5) % (W + 180)) - 90;
        const x = jx < -90 ? jx + (W + 180) : jx;
        ctx.fillStyle = ['rgba(180,120,80,0.4)', 'rgba(150,170,120,0.4)', 'rgba(170,140,170,0.4)'][(j + 3) % 3];
        Utils.roundRect(ctx, x, shelfY, 26, 34, 5); ctx.fill();
        ctx.fillStyle = 'rgba(90,60,35,0.4)';
        ctx.fillRect(x + 4, shelfY - 4, 18, 6);
      }
    }

    // faint wall tile grout lines
    ctx.strokeStyle = 'rgba(120,90,60,0.12)';
    ctx.lineWidth = 1;
    const gx = -(this.cam.x * 0.5) % 80;
    for (let x = gx; x < W; x += 80) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
  }

  _drawTiles() {
    const ctx = this.ctx;
    const T = CONFIG.TILE;
    const lvl = this.level;
    const startCol = Math.max(0, Math.floor(this.cam.x / T));
    const endCol = Math.min(lvl.width - 1, Math.ceil((this.cam.x + CONFIG.WIDTH) / T));

    for (let c = startCol; c <= endCol; c++) {
      for (let r = 0; r < lvl.height; r++) {
        const ch = lvl.grid[r][c];
        if (ch !== '#' && ch !== 'B') continue;
        const x = c * T, y = r * T;
        const topOpen = !lvl.solidAt(c, r - 1);
        if (ch === 'B') {
          // wooden counter
          ctx.fillStyle = '#9a6a3a';
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = '#85582e';
          for (let k = 0; k < 3; k++) ctx.fillRect(x, y + 6 + k * 12, T, 2);
          if (topOpen) { ctx.fillStyle = '#c79a5c'; ctx.fillRect(x, y, T, 6); }
        } else {
          // stone/tile floor
          ctx.fillStyle = topOpen ? '#7d8a99' : '#6c7886';
          ctx.fillRect(x, y, T, T);
          ctx.fillStyle = 'rgba(0,0,0,0.12)';
          ctx.fillRect(x, y, T, 2);
          ctx.fillRect(x, y, 2, T);
          ctx.fillStyle = 'rgba(255,255,255,0.06)';
          ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
          if (topOpen) {
            ctx.fillStyle = '#9aa6b3';
            ctx.fillRect(x, y, T, 5);
          }
        }
      }
    }
  }

  /* ----------------------------- HUD --------------------------------- */
  _drawHUD() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    ctx.save();
    // top bar
    ctx.fillStyle = 'rgba(30,20,12,0.55)';
    ctx.fillRect(0, 0, W, 44);

    ctx.textBaseline = 'middle';
    ctx.font = "bold 18px 'Trebuchet MS', Verdana, sans-serif";
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(`Level ${this.levelIndex + 1}/${LEVEL_COUNT}  ·  ${this.level.name}`, 14, 23);

    // ingredients collected
    ctx.textAlign = 'center';
    Sprites.drawIngredient(ctx, W / 2 - 70, 8, 26, 26, 'tomato', this.titleT);
    ctx.fillStyle = this.collected >= this.level.totalIngredients ? '#a8f0a0' : '#ffe9c2';
    ctx.fillText(`${this.collected} / ${this.level.totalIngredients}`, W / 2 - 24, 23);

    // score
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(`Score ${this.score}`, W - 150, 23);

    // lives as little hearts
    for (let i = 0; i < this.lives; i++) {
      this._heart(ctx, W - 130 + i * 26, 22, 9);
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

  _drawBanner() {
    const ctx = this.ctx;
    const a = Utils.clamp(this.bannerTimer / 60, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(30,20,12,0.7)';
    Utils.roundRect(ctx, CONFIG.WIDTH / 2 - 320, 70, 640, 56, 12); ctx.fill();
    ctx.fillStyle = '#ffe9c2';
    ctx.font = "italic 20px 'Trebuchet MS', sans-serif";
    ctx.fillText(this.level.subtitle, CONFIG.WIDTH / 2, 100);
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
    // floating embers
    for (let i = 0; i < 30; i++) {
      const t = this.titleT * 0.5 + i * 60;
      const x = (i * 53 + Math.sin(t * 0.02) * 40) % W;
      const y = H - ((t * 1.2) % (H + 60));
      ctx.fillStyle = `rgba(255,${120 + (i % 5) * 20},40,0.7)`;
      ctx.beginPath();
      ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
      ctx.fill();
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
    // big Remy
    const bob = Math.sin(this.titleT * 0.05) * 8;
    Sprites.drawRemy(ctx, W / 2 - 50, 150 + bob, 100, 120, 1, this.titleT * 0.1, false, true);

    this._shadowText('RATATOUILLE', W / 2, 110, "bold 64px 'Trebuchet MS', sans-serif", '#ffcf6b');
    this._shadowText("Remy's Kitchen Run", W / 2, 165, "italic 26px 'Trebuchet MS', sans-serif", '#ffe9c2');

    const blink = Math.sin(this.titleT * 0.12) > -0.3;
    if (blink) this._shadowText('Press ENTER / SPACE  ·  or TAP to start', W / 2, 360,
      "bold 24px 'Trebuchet MS', sans-serif", '#fff');

    this._shadowText('← →  move      SPACE / ↑  jump      P  pause      M  mute',
      W / 2, 430, "16px 'Trebuchet MS', sans-serif", '#ffd9a0');
    this._shadowText(`High Score: ${this.highScore}`, W / 2, 470,
      "18px 'Trebuchet MS', sans-serif", '#ffe9c2');
  }

  _drawStory() {
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    this._shadowText('How to play', W / 2, 90, "bold 40px 'Trebuchet MS', sans-serif", '#ffcf6b');
    const lines = [
      'Remy the rat dreams of becoming a great chef.',
      'Dash across five kitchens, leaping over the FIRE on the floor.',
      'Grab the ingredients — tomato, eggplant, pepper, mushroom, cheese.',
      'Stomp the pesky kitchen bugs, but NEVER touch the flames!',
      '',
      'Reach the door to clear each kitchen. On the 5th — the Grand',
      'Kitchen — collect EVERY ingredient to light the pot and',
      'COOK THE RATATOUILLE. Bon appétit!',
    ];
    ctx.textAlign = 'center';
    lines.forEach((l, i) => {
      this._shadowText(l, W / 2, 160 + i * 34, "20px 'Trebuchet MS', sans-serif", '#ffe9c2');
    });
    const blink = Math.sin(this.titleT * 0.12) > -0.3;
    if (blink) this._shadowText('Press ENTER / SPACE  ·  or TAP to begin', W / 2, 470,
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
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0, 0, CONFIG.WIDTH, CONFIG.HEIGHT);
    const W = CONFIG.WIDTH;
    this._shadowText('Kitchen Cleared!', W / 2, 160, "bold 50px 'Trebuchet MS', sans-serif", '#a8f0a0');
    this._shadowText(`${this.level.name}`, W / 2, 215, "italic 24px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Ingredients: ${this.collected} / ${this.level.totalIngredients}`, W / 2, 270,
      "22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Score: ${this.score}`, W / 2, 305, "22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    const blink = Math.sin(this.titleT * 0.12) > -0.3;
    if (blink) this._shadowText('Press ENTER / SPACE to continue', W / 2, 400,
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
    // progress bar
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
    // a finished plated dish
    this._drawDish(ctx, W / 2, 280, this.titleT);
    this._shadowText('Bon Appétit!', W / 2, 70, "bold 58px 'Trebuchet MS', sans-serif", '#ffcf6b');
    this._shadowText('You cooked the perfect ratatouille — Remy is a chef!',
      W / 2, 350, "italic 22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Final Score: ${this.score}    ·    High Score: ${this.highScore}`,
      W / 2, 400, "bold 24px 'Trebuchet MS', sans-serif", '#fff');
    const blink = Math.sin(this.titleT * 0.12) > -0.3;
    if (blink) this._shadowText('Press ENTER / SPACE to play again', W / 2, 460,
      "20px 'Trebuchet MS', sans-serif", '#ffd9a0');
  }

  _drawDish(ctx, cx, cy, t) {
    ctx.save();
    // plate
    ctx.fillStyle = '#f4f1ec';
    ctx.beginPath(); ctx.ellipse(cx, cy, 110, 30, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e6e0d6';
    ctx.beginPath(); ctx.ellipse(cx, cy, 84, 22, 0, 0, Math.PI * 2); ctx.fill();
    // ratatouille rings (spiral of veg slices)
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
    const ctx = this.ctx;
    const W = CONFIG.WIDTH;
    ctx.fillStyle = 'rgba(20,4,4,0.74)';
    ctx.fillRect(0, 0, W, CONFIG.HEIGHT);
    this._shadowText('Out of Lives!', W / 2, 200, "bold 56px 'Trebuchet MS', sans-serif", '#ff7a5a');
    this._shadowText(`You reached ${this.level.name}`, W / 2, 260,
      "italic 22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    this._shadowText(`Score: ${this.score}`, W / 2, 300, "22px 'Trebuchet MS', sans-serif", '#ffe9c2');
    const blink = Math.sin(this.titleT * 0.12) > -0.3;
    if (blink) this._shadowText('Press ENTER / SPACE to retry this kitchen', W / 2, 380,
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

  // keep the canvas crisp & centred; CSS handles the visual scaling
  const resize = () => {
    const scale = Math.min(window.innerWidth / CONFIG.WIDTH,
                           window.innerHeight / CONFIG.HEIGHT);
    canvas.style.width = Math.floor(CONFIG.WIDTH * scale) + 'px';
    canvas.style.height = Math.floor(CONFIG.HEIGHT * scale) + 'px';
  };
  window.addEventListener('resize', resize);
  resize();
});
