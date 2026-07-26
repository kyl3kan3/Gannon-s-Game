/* =========================================================================
 * entities.js — game objects: Player, Fire, Ingredient, Bug, MovingPlatform,
 * Goal and Particle. The Player owns the platformer physics + tile collision.
 * ========================================================================= */

/* ----------------------------- Player -------------------------------- */
class Player {
  constructor(x, y) {
    this.spawnX = x;
    this.spawnY = y;
    this.w = 30;
    this.h = 34;
    this.reset();
  }

  reset() {
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = 0;
    this.vy = 0;
    this.face = 1;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.runT = 0;
    this.invuln = 0;
    this.dead = false;
    this.ridingPlatform = null;
    this.sx = 1; this.sy = 1;        // squash & stretch (cosmetic)
    this.justJumped = false;
    this.justLanded = false;
    this.blink = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  hurt() {
    if (this.invuln > 0) return false;
    this.invuln = CONFIG.INVULN_FRAMES;
    // knockback away from facing direction
    this.vy = -8;
    this.vx = -this.face * 6;
    return true;
  }

  update(level, platforms) {
    const C = CONFIG;
    this.justJumped = false;
    this.justLanded = false;

    // ---- horizontal input ----
    const accel = this.onGround ? C.MOVE_ACCEL : C.AIR_ACCEL;
    if (Input.left)  { this.vx -= accel; this.face = -1; }
    if (Input.right) { this.vx += accel; this.face = 1; }
    if (!Input.left && !Input.right) {
      this.vx *= this.onGround ? C.FRICTION : C.AIR_FRICTION;
      if (Math.abs(this.vx) < 0.05) this.vx = 0;
    }
    this.vx = Utils.clamp(this.vx, -C.MAX_RUN, C.MAX_RUN);

    // ---- jump (with coyote time + input buffering) ----
    if (Input.jumpPressed) this.jumpBuffer = C.JUMP_BUFFER;
    if (this.jumpBuffer > 0) this.jumpBuffer--;
    if (this.coyote > 0) this.coyote--;

    if (this.jumpBuffer > 0 && (this.onGround || this.coyote > 0)) {
      this.vy = -C.JUMP_VELOCITY;
      this.onGround = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.ridingPlatform = null;
      this.justJumped = true;
      Sound.jump();
    }
    // variable jump height: releasing early cuts the rise
    if (!Input.jump && this.vy < 0) this.vy *= C.JUMP_CUT;

    // ---- gravity ----
    this.vy = Math.min(this.vy + C.GRAVITY, C.MAX_FALL);

    // ---- move + collide against tiles, axis by axis ----
    const wasGround = this.onGround;
    this.onGround = false;

    this.x += this.vx;
    this._collideTilesX(level);

    this.y += this.vy;
    this._collideTilesY(level);

    // ---- moving platforms (one-way: land on top, ride along) ----
    this.ridingPlatform = null;
    for (const p of platforms) {
      // feet near platform top and falling onto it
      const feet = this.y + this.h;
      const prevFeet = feet - this.vy;
      const withinX = this.x + this.w > p.x + 3 && this.x < p.x + p.w - 3;
      if (withinX && this.vy >= 0 && prevFeet <= p.y + 8 && feet >= p.y - 2 && feet <= p.y + p.h * 0.6) {
        this.y = p.y - this.h;
        this.vy = 0;
        this.onGround = true;
        this.ridingPlatform = p;
      }
    }
    if (this.ridingPlatform) {
      this.x += this.ridingPlatform.dx;
      this.y += this.ridingPlatform.dy;
    }

    // coyote time bookkeeping
    if (this.onGround) this.coyote = C.COYOTE_FRAMES;
    else if (wasGround && this.coyote === C.COYOTE_FRAMES) { /* keep */ }

    // ---- landing + squash & stretch (cosmetic) ----
    if (this.onGround && !wasGround) this.justLanded = true;
    if (this.justLanded) { this.sx = 1.3; this.sy = 0.72; }
    else {
      const strength = Utils.clamp(Math.abs(this.vy) / 26, 0, 0.22);
      const tsx = this.onGround ? 1 : 1 - strength;
      const tsy = this.onGround ? 1 : 1 + strength;
      this.sx += (tsx - this.sx) * 0.3;
      this.sy += (tsy - this.sy) * 0.3;
    }
    if (this.blink > 0) this.blink--;
    else if (this.onGround && Math.abs(this.vx) < 0.5 && Math.random() < 0.012) this.blink = 8;

    // ---- animation + timers ----
    if (this.onGround && Math.abs(this.vx) > 0.4) this.runT += 0.3 + Math.abs(this.vx) * 0.05;
    else if (!this.onGround) this.runT = 0;
    if (this.invuln > 0) this.invuln--;

    // ---- pit death ----
    if (this.y > level.pixelHeight + 80) this.dead = true;
  }

  _solid(level, col, row) { return level.solidAt(col, row); }

  _collideTilesX(level) {
    const T = CONFIG.TILE;
    const top = Math.floor(this.y / T);
    const bottom = Math.floor((this.y + this.h - 1) / T);
    if (this.vx > 0) {
      const col = Math.floor((this.x + this.w) / T);
      for (let row = top; row <= bottom; row++) {
        if (this._solid(level, col, row)) { this.x = col * T - this.w; this.vx = 0; break; }
      }
    } else if (this.vx < 0) {
      const col = Math.floor(this.x / T);
      for (let row = top; row <= bottom; row++) {
        if (this._solid(level, col, row)) { this.x = (col + 1) * T; this.vx = 0; break; }
      }
    }
  }

  _collideTilesY(level) {
    const T = CONFIG.TILE;
    const left = Math.floor(this.x / T);
    const right = Math.floor((this.x + this.w - 1) / T);
    if (this.vy > 0) {
      const row = Math.floor((this.y + this.h) / T);
      for (let col = left; col <= right; col++) {
        if (this._solid(level, col, row)) {
          this.y = row * T - this.h; this.vy = 0; this.onGround = true; break;
        }
      }
    } else if (this.vy < 0) {
      const row = Math.floor(this.y / T);
      for (let col = left; col <= right; col++) {
        if (this._solid(level, col, row)) { this.y = (row + 1) * T; this.vy = 0; break; }
      }
    }
  }

  draw(ctx, chefHat) {
    // flicker while invulnerable
    if (this.invuln > 0 && Math.floor(this.invuln / 4) % 2 === 0) return;
    Sprites.drawRemy(ctx, this.x, this.y, this.w, this.h, this.face, this.runT,
                     !this.onGround, chefHat, this.sx, this.sy, this.blink > 0);
  }
}

/* --------------------- floating score / combo text ------------------- */
class FloatText {
  constructor(x, y, text, color, size = 16) {
    this.x = x; this.y = y; this.text = text; this.color = color; this.size = size;
    this.life = 52; this.maxLife = 52; this.vy = -1.3;
  }
  update() { this.y += this.vy; this.vy *= 0.93; this.life--; }
  get dead() { return this.life <= 0; }
  draw(ctx) {
    const a = Utils.clamp(this.life / this.maxLife, 0, 1);
    const pop = this.life > this.maxLife - 6 ? 1.25 : 1;   // little pop on spawn
    ctx.save();
    ctx.globalAlpha = a;
    ctx.font = `bold ${this.size * pop}px 'Trebuchet MS', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeText(this.text, this.x, this.y);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x, this.y);
    ctx.restore();
  }
}

/* ----------------------------- Fire hazard --------------------------- */
class Fire {
  constructor(x, y, jet = false) {
    this.x = x; this.y = y; this.w = CONFIG.TILE; this.h = CONFIG.TILE;
    this.jet = jet;          // jets pulse on and off
    this.t = Utils.rand(0, 100);
    this.on = true;
    this.height = this.h;
  }
  update() {
    this.t++;
    if (this.jet) {
      // 2.2s on, 1.3s off cycle
      const phase = this.t % 210;
      this.on = phase < 130;
      this.height = this.on ? this.h * Utils.clamp(phase / 25, 0.2, 1) : 0;
    }
  }
  get hitbox() {
    const hh = this.jet ? this.height : this.h * 0.85;
    return { x: this.x + 6, y: this.y + this.h - hh, w: this.w - 12, h: hh };
  }
  draw(ctx) {
    if (this.jet && !this.on) {
      // dormant vent
      ctx.fillStyle = '#3a3a3a';
      ctx.fillRect(this.x + 8, this.y + this.h - 6, this.w - 16, 6);
      return;
    }
    const h = this.jet ? this.height : this.h;
    Sprites.drawFire(ctx, this.x + 4, this.y + this.h - h, this.w - 8, h, this.t);
  }
}

/* ----------------------------- Ingredient ---------------------------- */
class Ingredient {
  constructor(x, y, kind) {
    this.x = x + 6; this.y = y + 6; this.w = CONFIG.TILE - 12; this.h = CONFIG.TILE - 12;
    this.kind = kind;
    this.collected = false;
    this.t = Utils.rand(0, 100);
  }
  update() { this.t++; }
  draw(ctx) {
    if (this.collected) return;
    Sprites.drawIngredient(ctx, this.x, this.y, this.w, this.h, this.kind, this.t);
  }
}

/* ----------------------------- Bug enemy ----------------------------- */
class Bug {
  constructor(x, y) {
    this.x = x + 4; this.y = y + 10; this.w = CONFIG.TILE - 8; this.h = CONFIG.TILE - 12;
    this.spawnX = this.x;
    this.range = CONFIG.TILE * 2;   // pace within ~2 tiles of spawn, predictable
    this.vx = 1.1;
    this.face = 1;
    this.t = Utils.rand(0, 100);
    this.dead = false;
    this.deadTimer = 0;
  }
  update(level) {
    this.t++;
    if (this.dead) { this.deadTimer++; return; }
    const T = CONFIG.TILE;
    this.x += this.vx;
    this.face = this.vx > 0 ? 1 : -1;
    // turn around at walls, ledges, or the edge of the patrol range
    const aheadCol = Math.floor((this.x + (this.vx > 0 ? this.w + 2 : -2)) / T);
    const footRow = Math.floor((this.y + this.h + 2) / T);
    const midRow = Math.floor((this.y + this.h / 2) / T);
    const past = (this.vx > 0 && this.x - this.spawnX > this.range) ||
                 (this.vx < 0 && this.spawnX - this.x > this.range);
    if (past || level.solidAt(aheadCol, midRow) || !level.solidAt(aheadCol, footRow)) {
      this.vx = -this.vx;
      this.x += this.vx * 2;
    }
  }
  draw(ctx) {
    if (this.dead && this.deadTimer > 30) return;
    Sprites.drawBug(ctx, this.x, this.y, this.w, this.h, this.face, this.t, this.dead);
  }
}

/* ------------------------- Moving platform --------------------------- */
class MovingPlatform {
  constructor(x, y, range, axis, speed) {
    this.x = x; this.y = y; this.w = CONFIG.TILE * 2; this.h = CONFIG.TILE * 0.5;
    this.ox = x; this.oy = y;
    this.range = range;        // pixels of travel
    this.axis = axis;          // 'h' or 'v'
    this.speed = speed;
    this.t = Utils.rand(0, Math.PI * 2);
    this.dx = 0; this.dy = 0;
  }
  update() {
    this.t += this.speed;
    const offset = Math.sin(this.t) * this.range;
    if (this.axis === 'h') {
      const nx = this.ox + offset; this.dx = nx - this.x; this.dy = 0; this.x = nx;
    } else {
      const ny = this.oy + offset; this.dy = ny - this.y; this.dx = 0; this.y = ny;
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.fillStyle = '#9a6a3a';
    Utils.roundRect(ctx, this.x, this.y, this.w, this.h, 5); ctx.fill();
    ctx.fillStyle = '#c79a5c';
    Utils.roundRect(ctx, this.x + 3, this.y + 3, this.w - 6, this.h * 0.4, 4); ctx.fill();
    ctx.restore();
  }
}

/* ----------------------------- Goal ---------------------------------- */
class Goal {
  constructor(x, y, isPot) {
    this.isPot = isPot;
    this.w = CONFIG.TILE * (isPot ? 2 : 1.4);
    this.h = CONFIG.TILE * (isPot ? 1.6 : 2);
    this.x = x;
    this.y = y + CONFIG.TILE - this.h; // sit on the ground tile
    this.t = 0;
    this.active = !isPot;   // exits always active; pot activates when ingredients done
    this.cooking = false;
  }
  update() { this.t++; }
  get hitbox() { return { x: this.x + 4, y: this.y, w: this.w - 8, h: this.h }; }
  draw(ctx) {
    if (this.isPot) Sprites.drawPot(ctx, this.x, this.y, this.w, this.h, this.t, this.active, this.cooking);
    else Sprites.drawDoor(ctx, this.x, this.y, this.w, this.h, this.t);
  }
}

/* ----------------------------- Particle ------------------------------ */
class Particle {
  constructor(x, y, vx, vy, life, color, size) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.life = life; this.maxLife = life; this.color = color; this.size = size;
    this.grav = 0.15;
  }
  update() {
    this.x += this.vx; this.y += this.vy;
    this.vy += this.grav; this.life--;
  }
  get dead() { return this.life <= 0; }
  draw(ctx) {
    const a = Utils.clamp(this.life / this.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}
