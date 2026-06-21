/* =========================================================================
 * audio.js — procedural sound effects + light background music
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
      this.musicGain.gain.value = 0.18;
      this.musicGain.connect(this.master);
    } catch (e) {
      this.ctx = null; // audio unsupported; game stays silent but playable
    }
  },

  // Browsers require a user gesture before audio can start.
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggle() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.55 : 0;
    return this.enabled;
  },

  // Core one-shot tone generator.
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

  noise(dur, vol = 0.3, filterFreq = 1200) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  },

  jump()  { this.tone(420, 0.16, 'square', 0.25, 720); },
  coin()  { this.tone(880, 0.08, 'square', 0.25); this.tone(1320, 0.12, 'square', 0.2); },
  stomp() { this.tone(300, 0.12, 'sawtooth', 0.3, 90); this.noise(0.1, 0.2, 800); },
  hurt()  { this.tone(380, 0.32, 'sawtooth', 0.32, 70); },
  fire()  { this.noise(0.18, 0.12, 600); },
  clear() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.18, 'square', 0.28), i * 110));
  },
  cook() {
    // bubbling/sizzle while the pot cooks
    this.noise(0.5, 0.12, 900);
    this.tone(220, 0.4, 'sine', 0.18, 330);
  },
  win() {
    const notes = [523, 659, 784, 1046, 784, 1046, 1318];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.22, 'square', 0.3), i * 140));
  },
  gameover() {
    const notes = [523, 415, 349, 261];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.3, 'triangle', 0.3, n * 0.85), i * 200));
  },

  // ---- simple looping background melody -------------------------------
  // A cheerful little bistro tune. Plays one note every 8th-note tick.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    // C major / A minor friendly loop (MIDI-ish frequencies)
    const mel = [
      523, 0, 659, 784, 523, 0, 659, 392,
      440, 0, 523, 659, 587, 0, 494, 392,
      523, 0, 659, 784, 880, 784, 659, 523,
      587, 659, 698, 659, 587, 523, 494, 440,
    ];
    const bass = [
      131, 131, 165, 165, 175, 175, 196, 196,
    ];
    this.step = 0;
    this.musicTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      const n = mel[this.step % mel.length];
      if (n > 0) this.tone(n, 0.16, 'triangle', 0.22, null, this.musicGain);
      const b = bass[Math.floor(this.step / 4) % bass.length];
      if (this.step % 4 === 0) this.tone(b, 0.4, 'sine', 0.3, null, this.musicGain);
      this.step++;
    }, 170);
  },

  stopMusic() {
    if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
  },
};
