/** Мини-синтезатор: все звуки генерируются WebAudio, файлов нет. */
const RECIPES = {
  coin: [{ f: 1046, t: 0.06, d: 0.09 }, { f: 1568, t: 0.07, d: 0.12 }],
  gem: [{ f: 1318, t: 0.05, d: 0.1 }, { f: 1760, t: 0.05, d: 0.1 }, { f: 2093, t: 0.05, d: 0.18 }],
  jump: [{ f: 420, t: 0.12, d: 0.08, slide: 720, type: 'square' }],
  hit: [{ f: 200, t: 0.14, d: 0.16, slide: 80, type: 'sawtooth' }],
  bounce: [{ f: 300, t: 0.1, d: 0.16, slide: 900, type: 'sine' }],
  win: [{ f: 523, t: 0.1, d: 0.12 }, { f: 659, t: 0.1, d: 0.12 }, { f: 784, t: 0.12, d: 0.12 }, { f: 1046, t: 0.12, d: 0.34 }],
  lose: [{ f: 392, t: 0.16, d: 0.14 }, { f: 311, t: 0.16, d: 0.16 }, { f: 233, t: 0.18, d: 0.3 }],
  step: [{ f: 180, t: 0.04, d: 0.03, type: 'triangle' }],
  zap: [{ f: 880, t: 0.08, d: 0.1, slide: 220, type: 'square' }],
};

function readMuted() {
  try {
    return localStorage.getItem('tbx.muted') === '1';
  } catch {
    return false;
  }
}

export class AudioBus {
  constructor() {
    this.ctx = null;
    this.muted = readMuted();
  }

  ensure() {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = !!muted;
    try {
      localStorage.setItem('tbx.muted', this.muted ? '1' : '0');
    } catch {
      /* приватный режим */
    }
    if (this.muted && this.ctx) this.ctx.suspend().catch(() => {});
  }

  play(name) {
    const ctx = this.ensure();
    if (!ctx) return;
    const recipe = RECIPES[name] || RECIPES.coin;
    let at = ctx.currentTime;
    for (const note of recipe) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = note.type || 'sine';
      osc.frequency.setValueAtTime(note.f, at);
      if (note.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, note.slide), at + note.t);
      const peak = 0.11;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + note.d + 0.02);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + note.d + 0.05);
      at += note.t;
    }
  }
}

export const audio = new AudioBus();
