/* =========================================================================
 * sprites.js — all artwork is drawn procedurally on the canvas, so the
 * game needs no external image files. Each function draws into a 2D context.
 * ========================================================================= */

const Sprites = {
  /* ---- Remy the rat ---------------------------------------------------
   * Drawn centred on (cx, feetY). `face` is +1 (right) or -1 (left).
   * `runT` advances the leg cycle; `airborne` tucks the legs.
   */
  drawRemy(ctx, x, y, w, h, face, runT, airborne, chefHat) {
    ctx.save();
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.translate(cx, cy);
    ctx.scale(face, 1);              // flip horizontally to face direction

    const s = h / 40;               // base unit scale
    const skin = '#5d6b86';         // Remy's blue-grey fur
    const skinDark = '#454f66';
    const belly = '#8a95ab';
    const pink = '#e79ab0';

    // Tail (behind body), sways with run cycle
    const tailWave = Math.sin(runT * 0.9) * 4 * s;
    ctx.strokeStyle = pink;
    ctx.lineWidth = 3 * s;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-7 * s, 6 * s);
    ctx.quadraticCurveTo(-18 * s, 4 * s + tailWave, -22 * s, -6 * s + tailWave);
    ctx.stroke();

    // Back leg + front leg animation
    const legSwing = airborne ? 3 * s : Math.sin(runT) * 6 * s;
    ctx.fillStyle = skinDark;
    this._leg(ctx, -3 * s, 12 * s, -legSwing, s);
    this._leg(ctx, 4 * s, 12 * s, legSwing, s);

    // Body
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(0, 6 * s, 9 * s, 8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Belly
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(2 * s, 8 * s, 5 * s, 5.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Arms
    ctx.fillStyle = skinDark;
    const armSwing = airborne ? -4 * s : Math.sin(runT + Math.PI) * 4 * s;
    this._leg(ctx, 6 * s, 4 * s, armSwing, s * 0.8);

    // Head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(7 * s, -6 * s, 8 * s, 7 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ears (big, round — Remy's signature)
    ctx.fillStyle = skinDark;
    ctx.beginPath();
    ctx.ellipse(3 * s, -13 * s, 4.5 * s, 4.5 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10 * s, -14 * s, 4 * s, 4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pink;
    ctx.beginPath();
    ctx.ellipse(3.5 * s, -13 * s, 2.4 * s, 2.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(10 * s, -14 * s, 2.1 * s, 2.1 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Snout
    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.ellipse(13 * s, -4 * s, 4 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    // Nose
    ctx.fillStyle = '#d36b86';
    ctx.beginPath();
    ctx.ellipse(16.5 * s, -4 * s, 1.6 * s, 1.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes (big and green like the film)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(9 * s, -8 * s, 2.6 * s, 3 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3c8c4a';
    ctx.beginPath();
    ctx.ellipse(9.8 * s, -8 * s, 1.5 * s, 1.8 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#10210f';
    ctx.beginPath();
    ctx.ellipse(10.2 * s, -8 * s, 0.8 * s, 1 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(9.4 * s, -9 * s, 0.6 * s, 0, Math.PI * 2);
    ctx.fill();

    // Whiskers
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 0.7 * s;
    ctx.beginPath();
    ctx.moveTo(14 * s, -3 * s); ctx.lineTo(20 * s, -4 * s);
    ctx.moveTo(14 * s, -2 * s); ctx.lineTo(20 * s, -1 * s);
    ctx.stroke();

    // Optional chef toque for the finale
    if (chefHat) {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.ellipse(7 * s, -16 * s, 6 * s, 3 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(3 * s, -19 * s, 3.4 * s, 0, Math.PI * 2);
      ctx.arc(7 * s, -21 * s, 3.8 * s, 0, Math.PI * 2);
      ctx.arc(11 * s, -19 * s, 3.4 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  },

  _leg(ctx, x, y, swing, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    Utils.roundRect(ctx, -2 * s + swing, 0, 4 * s, 8 * s, 2 * s);
    ctx.fill();
    ctx.restore();
  },

  /* ---- Animated fire --------------------------------------------------- */
  drawFire(ctx, x, y, w, h, t) {
    ctx.save();
    const cx = x + w / 2;
    const base = y + h;
    const flick = Math.sin(t * 0.3 + x) * 3;
    const flick2 = Math.cos(t * 0.41 + x) * 2;

    // outer flame
    const grd = ctx.createLinearGradient(0, y - 6, 0, base);
    grd.addColorStop(0, '#ffe27a');
    grd.addColorStop(0.4, '#ff9d2e');
    grd.addColorStop(1, '#e03a1a');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(x + 4, base);
    ctx.quadraticCurveTo(x - 2 + flick, y + h * 0.4, cx - 3 + flick2, y + h * 0.15);
    ctx.quadraticCurveTo(cx, y - 8 + flick, cx + 3 + flick, y + h * 0.18);
    ctx.quadraticCurveTo(x + w + 2 + flick2, y + h * 0.4, x + w - 4, base);
    ctx.closePath();
    ctx.fill();

    // inner flame
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(cx - 5, base);
    ctx.quadraticCurveTo(cx - 4 + flick2, y + h * 0.55, cx + flick, y + h * 0.4);
    ctx.quadraticCurveTo(cx + 5 + flick, y + h * 0.6, cx + 5, base);
    ctx.closePath();
    ctx.fill();

    // glowing embers at the base
    ctx.fillStyle = 'rgba(255,120,40,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx, base, w * 0.5, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  },

  /* ---- Ingredient collectibles ---------------------------------------- */
  drawIngredient(ctx, x, y, w, h, kind, t) {
    ctx.save();
    const cx = x + w / 2;
    const cy = y + h / 2 + Math.sin(t * 0.08 + x) * 3; // gentle bob
    ctx.translate(cx, cy);

    // soft glow
    ctx.fillStyle = 'rgba(255,240,150,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, w * 0.55, 0, Math.PI * 2);
    ctx.fill();

    const r = w * 0.32;
    switch (kind) {
      case 'tomato':
        ctx.fillStyle = '#e23b2e';
        ctx.beginPath(); ctx.arc(0, 1, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fa64b';
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          ctx.lineTo(Math.cos(a) * r * 0.5, -r * 0.7 + Math.sin(a) * r * 0.25);
        }
        ctx.fill();
        break;
      case 'cheese':
        ctx.fillStyle = '#f7c948';
        ctx.beginPath();
        ctx.moveTo(-r, r * 0.6); ctx.lineTo(r, r * 0.6); ctx.lineTo(0, -r); ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#e0a92e';
        ctx.beginPath(); ctx.arc(-r * 0.3, r * 0.2, r * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.3, r * 0.1, r * 0.14, 0, Math.PI * 2); ctx.fill();
        break;
      case 'mushroom':
        ctx.fillStyle = '#c8552b';
        ctx.beginPath(); ctx.ellipse(0, -r * 0.2, r, r * 0.7, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#f0e2c8';
        ctx.fillRect(-r * 0.4, -r * 0.2, r * 0.8, r * 0.9);
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(-r * 0.3, -r * 0.4, r * 0.12, 0, Math.PI * 2);
        ctx.arc(r * 0.3, -r * 0.5, r * 0.1, 0, Math.PI * 2); ctx.fill();
        break;
      case 'pepper':
        ctx.fillStyle = '#e0b400';
        ctx.beginPath();
        ctx.ellipse(0, 2, r * 0.8, r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fa64b';
        ctx.fillRect(-r * 0.12, -r, r * 0.24, r * 0.5);
        break;
      case 'eggplant':
      default:
        ctx.fillStyle = '#7a4fa3';
        ctx.beginPath(); ctx.ellipse(0, 2, r * 0.7, r, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#3fa64b';
        ctx.beginPath();
        ctx.moveTo(0, -r); ctx.lineTo(-r * 0.4, -r * 0.5);
        ctx.lineTo(r * 0.4, -r * 0.5); ctx.closePath(); ctx.fill();
        break;
    }
    // sparkle
    const sp = (Math.sin(t * 0.15 + x) + 1) * 0.5;
    ctx.fillStyle = `rgba(255,255,255,${0.4 + sp * 0.5})`;
    ctx.beginPath(); ctx.arc(-r * 0.4, -r * 0.5, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* ---- The pesky kitchen bug (stompable enemy) ------------------------ */
  drawBug(ctx, x, y, w, h, face, t, squashed) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    if (squashed) { ctx.scale(1, 0.3); }
    ctx.scale(face, 1);
    const r = w * 0.4;
    // body
    ctx.fillStyle = '#6b3f2a';
    ctx.beginPath(); ctx.ellipse(0, 2, r, r * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a2a18';
    ctx.beginPath(); ctx.ellipse(0, 2, r, r * 0.8, 0, Math.PI, 0); ctx.fill();
    // legs wiggle
    ctx.strokeStyle = '#2a160c';
    ctx.lineWidth = 1.6;
    const lw = Math.sin(t * 0.4) * 2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.5, r * 0.6);
      ctx.lineTo(i * r * 0.5 - 3, r * 0.9 + 4 + lw);
      ctx.moveTo(i * r * 0.5, r * 0.6);
      ctx.lineTo(i * r * 0.5 + 3, r * 0.9 + 4 - lw);
      ctx.stroke();
    }
    // antennae + eyes
    ctx.beginPath();
    ctx.moveTo(r * 0.4, -r * 0.4); ctx.lineTo(r * 0.9, -r);
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(r * 0.45, -r * 0.2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.arc(r * 0.5, -r * 0.2, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  },

  /* ---- Level exit (glowing doorway) ----------------------------------- */
  drawDoor(ctx, x, y, w, h, t) {
    ctx.save();
    const glow = (Math.sin(t * 0.1) + 1) * 0.5;
    ctx.fillStyle = `rgba(255,220,120,${0.25 + glow * 0.25})`;
    ctx.fillRect(x - 8, y - 8, w + 16, h + 16);
    // frame
    ctx.fillStyle = '#8a5a2b';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#caa15c';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    // sign
    ctx.fillStyle = '#3a2414';
    ctx.font = `bold ${Math.floor(h * 0.16)}px Trebuchet MS, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', x + w / 2, y + h * 0.5);
    ctx.fillText('KITCHEN', x + w / 2, y + h * 0.5 + h * 0.18);
    ctx.restore();
  },

  /* ---- The finale cooking pot ----------------------------------------- */
  drawPot(ctx, x, y, w, h, t, active, cooking) {
    ctx.save();
    if (active || cooking) {
      const glow = (Math.sin(t * 0.2) + 1) * 0.5;
      ctx.fillStyle = `rgba(120,230,150,${0.3 + glow * 0.3})`;
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, w * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    // stove flames under the pot when cooking
    if (cooking) {
      for (let i = 0; i < 4; i++) {
        this.drawFire(ctx, x + 6 + i * (w - 12) / 3, y + h - 6, 10, 16, t + i * 7);
      }
    }
    // pot body
    ctx.fillStyle = '#2b2b30';
    Utils.roundRect(ctx, x, y + h * 0.25, w, h * 0.7, 8); ctx.fill();
    ctx.fillStyle = '#3a3a42';
    Utils.roundRect(ctx, x + 4, y + h * 0.3, w - 8, h * 0.3, 6); ctx.fill();
    // rim
    ctx.fillStyle = '#1d1d22';
    Utils.roundRect(ctx, x - 4, y + h * 0.2, w + 8, h * 0.12, 6); ctx.fill();
    // handles
    ctx.strokeStyle = '#1d1d22';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, y + h * 0.4, 6, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(x + w, y + h * 0.4, 6, Math.PI * 1.5, Math.PI * 0.5);
    ctx.stroke();
    // soup / ratatouille
    const soup = cooking ? '#d23b2b' : (active ? '#c0512b' : '#5a3a22');
    ctx.fillStyle = soup;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.27, w * 0.46, h * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
    // steam when cooking
    if (cooking) {
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) {
        const ox = x + w * 0.3 + i * w * 0.2;
        ctx.beginPath();
        ctx.moveTo(ox, y + h * 0.2);
        ctx.quadraticCurveTo(ox + Math.sin(t * 0.1 + i) * 8, y - 10,
                             ox + Math.cos(t * 0.1 + i) * 6, y - 28);
        ctx.stroke();
      }
    }
    ctx.restore();
  },
};
