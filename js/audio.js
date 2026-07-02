/* =========================================================================
 * audio.js — procedural sound effects + a light background soundtrack.
 * Uses the Web Audio API so the game ships with zero asset files.
 * ========================================================================= */

const Sound = {
  ctx: null,
  master: null,
  musicGain: null,
  enabled: true,
  musicTimer: null,
  step: 0,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    } catch (e) {
      this.ctx = null; // audio unsupported; game stays silent but playable
    }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.55 : 0;
    return this.enabled;
  },

  tone(freq, dur, type = 'square', vol = 0.3, slideTo = null, dest = null) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(dest || this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.3, filterFreq = 1200, hp = false) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = hp ? 'highpass' : 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  },

  // ---- one-shot effects -----------------------------------------------
  jump()  { this.tone(420, 0.16, 'square', 0.22, 720); },
  coin()  { this.tone(880, 0.07, 'square', 0.22); this.tone(1320, 0.12, 'square', 0.18); },
  stomp() { this.tone(300, 0.12, 'sawtooth', 0.28, 90); this.noise(0.1, 0.18, 800); },
  hurt()  { this.tone(380, 0.32, 'sawtooth', 0.3, 70); },
  fire()  { this.noise(0.18, 0.1, 600); },
  step()  { this.noise(0.03, 0.05, 2400, true); },        // soft footstep tick
  land()  { this.tone(150, 0.1, 'sine', 0.22, 80); this.noise(0.06, 0.1, 500); },
  combo(n) { this.tone(520 + n * 90, 0.1, 'square', 0.24); }, // pitch rises with combo
  star()  { this.tone(1046, 0.12, 'triangle', 0.26); this.tone(1568, 0.16, 'triangle', 0.2); },

  clear() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.18, 'square', 0.26), i * 110));
  },
  cook() { this.noise(0.5, 0.1, 900); this.tone(220, 0.4, 'sine', 0.16, 330); },
  win() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318, 1568];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.22, 'square', 0.28), i * 140));
  },
  gameover() {
    const notes = [523, 415, 349, 261];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.3, 'triangle', 0.28, n * 0.85), i * 200));
  },

  // ---- looping soundtrack --------------------------------------------
  // A cheerful bistro tune: melody + walking bass + off-beat hats.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const mel = [
      659, 0, 784, 880, 784, 0, 659, 587,
      523, 0, 659, 784, 659, 0, 523, 494,
      587, 0, 698, 880, 988, 880, 784, 659,
      784, 880, 988, 880, 784, 659, 587, 523,
    ];
    const bass = [131, 131, 165, 165, 196, 196, 175, 175];
    this.step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const g = this.musicGain;
      const n = mel[this.step % mel.length];
      if (n > 0) this.tone(n, 0.16, 'triangle', 0.2, null, g);
      if (this.step % 4 === 0) {
        const b = bass[Math.floor(this.step / 4) % bass.length];
        this.tone(b, 0.42, 'sine', 0.28, null, g);
        this.tone(b * 2, 0.2, 'triangle', 0.08, null, g);
      }
      if (this.step % 2 === 1) this.noise(0.03, 0.05, 3000, true); // hat
      this.step++;
    }, 165);
  },

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  },
};
