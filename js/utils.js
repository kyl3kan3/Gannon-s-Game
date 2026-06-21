/* =========================================================================
 * utils.js — small shared helpers
 * ========================================================================= */

const Utils = {
  clamp(v, min, max) { return v < min ? min : (v > max ? max : v); },

  lerp(a, b, t) { return a + (b - a) * t; },

  rand(min, max) { return min + Math.random() * (max - min); },

  randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)); },

  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },

  // Axis-aligned bounding-box overlap test. Objects need x, y, w, h.
  overlap(a, b) {
    return a.x < b.x + b.w &&
           a.x + a.w > b.x &&
           a.y < b.y + b.h &&
           a.y + a.h > b.y;
  },

  // Rounded rectangle path helper for the 2D context.
  roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  },
};
