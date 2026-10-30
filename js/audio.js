class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    this.noiseBuffer = null;
    this.muted = false;
    this.musicTimer = null;
    this.lastSfx = new Map();
    this.intensity = 0.4;
    this.started = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return false;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.2;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.52;
    this.sfxGain.connect(this.master);

    const len = Math.floor(this.ctx.sampleRate * 1.5);
    this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    if (!this.started) {
      this.started = true;
      this.startMusic();
    }
    return true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.72, this.ctx.currentTime, 0.08);
    }
  }

  tone(freq, dur, type = 'sine', vol = 0.2, when = 0, endFreq = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  noise(dur, vol = 0.2, when = 0, filterFreq = 1200, q = 0.8) {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    filter.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  sfx(name, volume = 1) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const last = this.lastSfx.get(name) || 0;
    const minGap = name === 'hit' ? 0.055 : name === 'arrow' ? 0.07 : name === 'death' ? 0.1 : 0.04;
    if (now - last < minGap) return;
    this.lastSfx.set(name, now);
    const v = Math.max(0.02, volume);
    switch (name) {
      case 'sword':
        this.noise(0.13, 0.22 * v, 0, 2600, 1.4);
        this.tone(180, 0.09, 'triangle', 0.12 * v, 0, 90);
        break;
      case 'bolt':
        this.tone(620, 0.18, 'sine', 0.13 * v, 0, 220);
        this.tone(930, 0.1, 'triangle', 0.05 * v, 0.02, 400);
        break;
      case 'arrow':
        this.noise(0.08, 0.09 * v, 0, 3800, 2);
        break;
      case 'hit':
        this.noise(0.09, 0.15 * v, 0, 900, 1.1);
        break;
      case 'death':
        this.tone(90, 0.34, 'sine', 0.16 * v, 0, 38);
        this.noise(0.22, 0.1 * v, 0, 420, 0.7);
        break;
      case 'harvest':
        this.noise(0.14, 0.12 * v, 0, 2200, 1.8);
        this.tone(420, 0.1, 'triangle', 0.06 * v, 0, 620);
        break;
      case 'deposit':
        this.tone(330, 0.12, 'triangle', 0.1 * v, 0, 440);
        this.tone(495, 0.18, 'sine', 0.09 * v, 0.06, 660);
        break;
      case 'build':
        this.noise(0.12, 0.2 * v, 0, 900, 0.7);
        this.tone(120, 0.2, 'triangle', 0.18 * v, 0, 70);
        break;
      case 'capture':
        [392, 494, 587, 784].forEach((f, i) => this.tone(f, 1.5, 'sine', 0.07 * v, i * 0.09));
        break;
      case 'level':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 1.1, 'triangle', 0.07 * v, i * 0.08));
        break;
      case 'ui':
        this.tone(760, 0.045, 'sine', 0.04 * v);
        break;
      case 'deny':
        this.tone(160, 0.13, 'square', 0.05 * v, 0, 110);
        break;
      case 'dash':
        this.noise(0.22, 0.12 * v, 0, 1700, 0.9);
        this.tone(300, 0.2, 'sine', 0.08 * v, 0, 760);
        break;
      case 'ability':
        this.tone(120, 0.6, 'sine', 0.22 * v, 0, 55);
        this.noise(0.7, 0.25 * v, 0, 700, 0.6);
        [220, 330, 440, 660].forEach((f, i) => this.tone(f, 0.8, 'sine', 0.06 * v, i * 0.05));
        break;
      case 'victory':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 2.2, 'triangle', 0.08 * v, i * 0.16));
        break;
      case 'defeat':
        [220, 196, 165, 131].forEach((f, i) => this.tone(f, 2.4, 'sine', 0.09 * v, i * 0.22));
        break;
      default:
        break;
    }
  }

  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const notes = [146.83, 174.61, 196.0, 220.0, 261.63, 196.0, 174.61, 146.83];
    let step = 0;
    const schedule = () => {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + 0.05;
      const n = notes[step % notes.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = step % 4 === 0 ? 'triangle' : 'sine';
      osc.frequency.value = n / 2;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.045 + this.intensity * 0.035, t + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      osc.connect(gain);
      gain.connect(this.musicGain);
      osc.start(t);
      osc.stop(t + 3.4);
      step++;
    };
    schedule();
    this.musicTimer = setInterval(schedule, 2600);
    const drone = this.ctx.createOscillator();
    const dg = this.ctx.createGain();
    drone.type = 'sine';
    drone.frequency.value = 73.42;
    dg.gain.value = 0.035;
    drone.connect(dg);
    dg.connect(this.musicGain);
    drone.start();
    this.drone = drone;
  }

  setIntensity(v) {
    this.intensity = Math.max(0, Math.min(1, v));
  }

  stopMusic() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    try {
      this.drone?.stop();
    } catch {}
  }
}

export const Audio = new AudioEngine();
