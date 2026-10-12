// Records what the player does in this session and plays it back. Nothing is persisted:
// the last take lives in memory until the next recording or a page reload.
export class Recorder {
  constructor(audio) {
    this.audio = audio;
    this.state = 'idle'; // idle | recording | playing
    this.events = [];
    this.take = null;
    this.duration = 0;
    this.t0 = 0;
    this.playStart = 0;
    this.playIndex = 0;
    this.targets = {};
    this.maxEvents = 20000;
    this.maxSeconds = 600;
  }

  get hasTake() {
    return !!(this.take && this.take.length);
  }

  add(ev) {
    if (this.state !== 'recording' || !this.audio.started) return;
    const t = this.audio.now - this.t0;
    if (this.events.length >= this.maxEvents || t > this.maxSeconds) {
      this.stop();
      return;
    }
    ev.t = t;
    this.events.push(ev);
  }

  record() {
    if (!this.audio.started) return;
    this.stop();
    this.events = [];
    this.t0 = this.audio.now;
    this.state = 'recording';
  }

  play() {
    if (this.state === 'recording') this.stop();
    if (!this.hasTake || !this.audio.started) return false;
    if (this.state === 'playing') this.releaseAll();
    this.state = 'playing';
    this.playStart = this.audio.now;
    this.playIndex = 0;
    return true;
  }

  stop() {
    if (this.state === 'recording') {
      this.take = this.events;
      this.duration = this.audio.now - this.t0;
    }
    if (this.state === 'playing') this.releaseAll();
    this.state = 'idle';
  }

  update() {
    if (this.state !== 'playing') return;
    const t = this.audio.now - this.playStart;
    while (this.playIndex < this.take.length && this.take[this.playIndex].t <= t) {
      const ev = this.take[this.playIndex++];
      const h = this.targets[ev.type];
      if (h) h(ev);
    }
    if (this.playIndex >= this.take.length && t >= this.duration) this.stop();
  }

  releaseAll() {
    if (this.targets.releaseAll) this.targets.releaseAll();
  }
}
