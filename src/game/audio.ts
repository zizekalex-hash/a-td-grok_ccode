type AC = AudioContext;

export class Sfx {
  ctx: AC | null = null;
  master: GainNode | null = null;
  muted = false;
  /** 0 to 1. */
  volume = 0.8;

  unlock() {
    const w = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctor = window.AudioContext || w.webkitAudioContext;
    if (!Ctor) return;
    if (!this.ctx) {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") void this.ctx.resume();
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    if (!this.ctx || !this.master || this.muted || this.ctx.state !== "running") return;
    gain *= this.volume;
    if (gain <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  fire() {
    this.blip(640 + Math.random() * 80, 0.06, "square", 0.05);
    this.blip(210, 0.07, "sine", 0.04);
  }

  hit() {
    this.blip(180 + Math.random() * 40, 0.05, "triangle", 0.05);
  }

  kill(big = false) {
    this.blip(big ? 320 : 520, 0.09, "square", big ? 0.07 : 0.05, big ? 180 : 240);
  }

  leak() {
    this.blip(120, 0.16, "sawtooth", 0.06, -70);
  }

  bless() {
    this.blip(440, 0.12, "sine", 0.06);
    this.blip(554, 0.14, "sine", 0.05);
    this.blip(659, 0.18, "triangle", 0.05);
  }

  ready() {
    this.blip(880, 0.1, "sine", 0.05, 220);
  }

  shield() {
    this.blip(700, 0.08, "triangle", 0.04);
  }

  over() {
    this.blip(220, 0.28, "sine", 0.06, -140);
  }
}

export const sfx = new Sfx();
