// SPIRE OF PERIL — sound, synthesized with the Web Audio API: effects and a bouncy little climbing tune.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.6; this.musicOn = true; }
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
    this.musicBus = this.ctx.createGain(); this.musicBus.gain.value = 0.35; this.musicBus.connect(this.master);
    const n = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, n, n); const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.music();
  }
  tone(t, f, dur, type = 'square', vol = 0.1, f2, dest) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  noise(t, dur, freq, vol = 0.2, type = 'lowpass', dest) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain(); s.buffer = this.noiseBuf; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(dest || this.master); s.start(t); s.stop(t + dur + 0.05);
  }
  play(name) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + 0.01;
    switch (name) {
      case 'jump': this.tone(t, 300, 0.14, 'square', 0.06, 620); break;
      case 'land': this.noise(t, 0.06, 500, 0.15); break;
      case 'pad': this.tone(t, 200, 0.4, 'sine', 0.16, 1200); this.tone(t, 400, 0.3, 'square', 0.04, 1600); break;
      case 'die': this.noise(t, 0.35, 1800, 0.3, 'bandpass'); this.tone(t, 500, 0.4, 'sawtooth', 0.1, 80); break;
      case 'win': [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(t + i * 0.1, f, 0.3, 'square', 0.07)); break;
      case 'coin': this.tone(t, 988, 0.08, 'square', 0.06); this.tone(t + 0.07, 1319, 0.2, 'square', 0.06); break;
      case 'tick': this.tone(t, 1200, 0.05, 'square', 0.05); break;
      case 'click': this.tone(t, 700, 0.05, 'square', 0.04); break;
      case 'fade': this.tone(t, 900, 0.25, 'triangle', 0.05, 300); break;
      case 'stage': [660, 880].forEach((f, i) => this.tone(t + i * 0.08, f, 0.18, 'triangle', 0.07)); break;
      case 'tower': [392, 523, 659, 523, 784].forEach((f, i) => this.tone(t + i * 0.12, f, 0.25, 'square', 0.06)); this.noise(t, 0.6, 400, 0.15); break;
    }
  }
  // a looping tune: bass, chords and a hopping lead
  music() {
    const ctx = this.ctx, bpm = 132, step = 60 / bpm / 2;
    const prog = [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], lead = [12, 7, 9, 7, 12, 14, 16, 14, 12, 9, 7, 9, 4, 7, 9, 11];
    let i = 0, next = ctx.currentTime + 0.1;
    const root = 261.6, f = (n) => root * Math.pow(2, n / 12);
    this.timer = setInterval(() => {
      if (!this.musicOn) { next = ctx.currentTime + 0.1; return; }
      while (next < ctx.currentTime + 0.25) {
        const bar = Math.floor(i / 8) % 4, ch = prog[bar];
        if (i % 2 === 0) this.tone(next, f(ch[0] - 24), step * 1.8, 'triangle', 0.12, null, this.musicBus);
        if (i % 4 === 2) ch.forEach((n) => this.tone(next, f(n), step * 1.5, 'square', 0.018, null, this.musicBus));
        if (i % 2 === 1 || Math.random() < 0.4) this.tone(next, f(lead[i % 16] + (bar === 3 ? -2 : 0)), step * 0.9, 'square', 0.03, null, this.musicBus);
        if (i % 4 === 0) this.noise(next, 0.05, 150, 0.2, 'lowpass', this.musicBus);
        if (i % 4 === 2) this.noise(next, 0.04, 6000, 0.05, 'highpass', this.musicBus);
        next += step; i++;
      }
    }, 60);
  }
  setMusic(on) { this.musicOn = on; if (this.musicBus) this.musicBus.gain.value = on ? 0.35 : 0; }
}
