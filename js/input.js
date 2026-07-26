/* =========================================================================
 * input.js — keyboard + on-screen touch controls
 * Exposes a simple action state the rest of the game polls each frame.
 * ========================================================================= */

const Input = {
  // continuous action state
  left: false,
  right: false,
  jump: false,
  // edge-triggered presses, consumed once
  jumpPressed: false,
  pausePressed: false,
  anyPressed: false,     // used by menus ("press any key")

  _keys: {},

  init() {
    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    this._bindTouch();
  },

  _onKey(e, down) {
    const k = e.key.toLowerCase();
    // Prevent page scrolling on the controls.
    if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
      e.preventDefault();
    }

    if (down && !this._keys[k]) {
      // fresh press this frame
      this.anyPressed = true;
      if (k === ' ' || k === 'arrowup' || k === 'w') this.jumpPressed = true;
      if (k === 'p' || k === 'escape') this.pausePressed = true;
      if (k === 'enter') this.enterPressed = true;
      if (k === 'm') this.mutePressed = true;
      if (k === 'r') this.restartPressed = true;
    }
    this._keys[k] = down;

    this.left  = !!(this._keys['arrowleft'] || this._keys['a']);
    this.right = !!(this._keys['arrowright'] || this._keys['d']);
    this.jump  = !!(this._keys[' '] || this._keys['arrowup'] || this._keys['w']);
  },

  // Wire up the on-screen buttons (mobile / touch).
  _bindTouch() {
    const bind = (id, on, off) => {
      const el = document.getElementById(id);
      if (!el) return;
      const press = (e) => { e.preventDefault(); on(); };
      const release = (e) => { e.preventDefault(); off(); };
      el.addEventListener('touchstart', press, { passive: false });
      el.addEventListener('touchend', release, { passive: false });
      el.addEventListener('touchcancel', release, { passive: false });
      el.addEventListener('mousedown', press);
      el.addEventListener('mouseup', release);
      el.addEventListener('mouseleave', release);
    };

    bind('btn-left',  () => { this.left = true; this.anyPressed = true; },  () => { this.left = false; });
    bind('btn-right', () => { this.right = true; this.anyPressed = true; }, () => { this.right = false; });
    bind('btn-jump',
      () => { this.jump = true; this.jumpPressed = true; this.anyPressed = true; },
      () => { this.jump = false; });
  },

  // Call at the END of each frame to clear one-shot presses.
  endFrame() {
    this.jumpPressed = false;
    this.pausePressed = false;
    this.enterPressed = false;
    this.mutePressed = false;
    this.restartPressed = false;
    this.anyPressed = false;
  },
};
