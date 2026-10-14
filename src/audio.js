const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// A note that may start a few ms late if its sample is still being rendered.
class Voice {
  constructor(engine) {
    this.engine = engine;
    this.src = null;
    this.gain = null;
    this.pendingRelease = null;
  }
  attach(src, gain) {
    this.src = src;
    this.gain = gain;
    if (this.pendingRelease !== null) this.release(this.pendingRelease);
  }
  release(t) {
    const c = this.engine.ctx;
    if (!this.gain) {
      this.pendingRelease = t ?? c.currentTime;
      return;
    }
    const tt = Math.max(t ?? c.currentTime, c.currentTime);
    const g = this.gain.gain;
    g.cancelScheduledValues(tt);
    g.setValueAtTime(g.value, tt);
    g.setTargetAtTime(0, tt, 0.06);
    try {
      this.src.stop(tt + 0.5);
    } catch (_) {}
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.started = false;
    this.buffers = new Map();
    this.pending = new Map();
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  async start() {
    if (this.started) return;
    const c = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    this.ctx = c;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.knee.value = 18;
    this.comp.ratio.value = 4;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;
    this.master.connect(this.comp).connect(c.destination);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeImpulse(1.7, 2.4);
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.28;
    this.reverb.connect(this.reverbGain).connect(this.master);

    this.noise = this.makeNoise();
    this.started = true;
    await c.resume();
    this.precompute();
  }

  // Render the piano's middle octaves on the audio thread so first presses are instant.
  precompute() {
    const order = [];
    for (let d = 0; d <= 44; d++) {
      if (60 + d <= 108) order.push(60 + d);
      if (d > 0 && 60 - d >= 21) order.push(60 - d);
    }
    let i = 0;
    const next = () => {
      if (i >= order.length) return;
      const m = order[i++];
      const b = this.getBuffer('piano', m);
      (b instanceof Promise ? b : Promise.resolve()).then(() => setTimeout(next, 5));
    };
    for (let lane = 0; lane < 3; lane++) next();
    setTimeout(() => {
      for (let m = 40; m <= 72; m++) this.getBuffer('guitar', m);
      for (let m = 48; m <= 84; m++) this.getBuffer('harp', m);
    }, 1500);
  }

  makeImpulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  toBuffer(data) {
    const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.copyToChannel(data, 0);
    return b;
  }

  normalize(d, peak = 0.9) {
    let m = 0;
    for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]));
    if (m > 0) for (let i = 0; i < d.length; i++) d[i] *= peak / m;
    const fade = Math.min(d.length, Math.floor(this.ctx.sampleRate * 0.05));
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }

  // Returns an AudioBuffer, or a Promise of one if it is still rendering.
  getBuffer(kind, midi) {
    const key = kind + ':' + midi;
    const b = this.buffers.get(key);
    if (b) return b;
    if (kind === 'piano') {
      if (!this.pending.has(key)) {
        const p = this.renderPiano(midi).then((buf) => {
          this.buffers.set(key, buf);
          this.pending.delete(key);
          return buf;
        });
        this.pending.set(key, p);
      }
      return this.pending.get(key);
    }
    const buf = this.toBuffer(this.karplus(kind, midi));
    this.buffers.set(key, buf);
    return buf;
  }

  // Karplus-Strong plucked string with fractional delay and pick-position comb filter.
  karplus(kind, midi) {
    const sr = this.ctx.sampleRate;
    const f = mtof(midi);
    const p =
      kind === 'guitar'
        ? { seconds: clamp(5.5 - (midi - 40) * 0.07, 1.2, 5.5), bright: clamp(0.42 + (midi - 40) * 0.014, 0.42, 0.85), pick: 0.13 }
        : { seconds: clamp(4.5 - (midi - 48) * 0.08, 0.7, 4.5), bright: clamp(0.3 + (midi - 48) * 0.009, 0.3, 0.62), pick: 0.32 };
    const n = Math.floor(sr * p.seconds);
    const out = new Float32Array(n);
    const D = sr / f - 0.5;
    const Ni = Math.floor(D);
    const frac = D - Ni;
    const L = Ni + 2;
    for (let i = 0; i < L; i++) out[i] = Math.random() * 2 - 1;
    const pp = Math.max(1, Math.round(L * p.pick));
    for (let i = L - 1; i >= pp; i--) out[i] -= out[i - pp] * 0.9;
    let lp = 0;
    for (let i = 0; i < L; i++) {
      lp += p.bright * (out[i] - lp);
      out[i] = lp;
    }
    const g = Math.pow(0.001, 1 / (p.seconds * f));
    for (let i = L; i < n; i++) {
      const a0 = out[i - Ni] + out[i - Ni - 1];
      const a1 = out[i - Ni - 1] + out[i - Ni - 2];
      out[i] = g * 0.5 * ((1 - frac) * a0 + frac * a1);
    }
    this.normalize(out, 0.8);
    return out;
  }

  // Additive piano: inharmonic partials, two detuned strings per note, hammer noise. Rendered offline.
  async renderPiano(midi) {
    const sr = this.ctx.sampleRate;
    const f = mtof(midi);
    const u = (midi - 21) / 87;
    const seconds = clamp(7 - u * 5.6, 1.1, 7);
    const off = new OfflineAudioContext(1, Math.floor(sr * seconds), sr);
    const out = off.createGain();
    out.gain.value = 0.5;
    out.connect(off.destination);
    const B = 0.00008 + 0.0007 * u * u;
    const nyq = Math.min(sr * 0.45, 15000);
    const detune = 1.2 + 2.5 * u; // cents between the unison strings
    for (let k = 1; k <= 12; k++) {
      const fk = f * k * Math.sqrt(1 + B * k * k);
      if (fk > nyq) break;
      const amp = Math.pow(k, -(0.9 + 0.75 * u)) * (k === 1 ? 1 : 0.9);
      const tau = (seconds / 2.9) / (1 + 0.5 * (k - 1));
      for (const cents of [-detune / 2, detune / 2]) {
        const o = off.createOscillator();
        o.type = 'sine';
        o.frequency.value = fk;
        o.detune.value = cents;
        const g = off.createGain();
        g.gain.setValueAtTime(0.0001, 0);
        g.gain.exponentialRampToValueAtTime(amp, 0.004);
        g.gain.exponentialRampToValueAtTime(amp * 0.45, 0.12);
        g.gain.exponentialRampToValueAtTime(Math.max(amp * 0.001, 1e-5), Math.min(seconds, 0.12 + tau * 5.5));
        o.connect(g).connect(out);
        o.start(0);
        o.stop(seconds);
      }
    }
    // Hammer thump.
    const nb = off.createBuffer(1, Math.floor(sr * 0.03), sr);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ns = off.createBufferSource();
    ns.buffer = nb;
    const nf = off.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = clamp(f * 2.5, 300, 4000);
    nf.Q.value = 0.8;
    const ng = off.createGain();
    ng.gain.setValueAtTime(0.5 - 0.3 * u, 0);
    ng.gain.exponentialRampToValueAtTime(0.001, 0.025);
    ns.connect(nf).connect(ng).connect(out);
    ns.start(0);
    const rendered = await off.startRendering();
    const d = rendered.getChannelData(0);
    this.normalize(d, 0.9);
    return rendered;
  }

  // Two gentle resonant peaks stand in for an acoustic guitar body (air and top-plate modes).
  guitarBody() {
    if (this.body) return this.body;
    const c = this.ctx;
    const air = c.createBiquadFilter();
    air.type = 'peaking';
    air.frequency.value = 105;
    air.Q.value = 2.5;
    air.gain.value = 6;
    const top = c.createBiquadFilter();
    top.type = 'peaking';
    top.frequency.value = 215;
    top.Q.value = 2;
    top.gain.value = 3.5;
    air.connect(top).connect(this.master);
    this.body = air;
    return air;
  }

  playBuffer(buf, { t, level, cutoff, send, voice, body = false }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    f.Q.value = 0.4;
    const g = c.createGain();
    g.gain.value = level;
    src.connect(f).connect(g).connect(body ? this.guitarBody() : this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    src.start(Math.max(t, c.currentTime));
    voice.attach(src, g);
    return voice;
  }

  // Ambience: fireplace crackle and wind, each on its own gain so they can be switched.
  ensureAmbience() {
    if (!this.started || this.amb) return;
    const c = this.ctx;
    const amb = { fireOn: false, windOn: false };
    const ramp = (g, v) => {
      g.gain.cancelScheduledValues(c.currentTime);
      g.gain.setTargetAtTime(v, c.currentTime, 0.4);
    };
    amb.ramp = ramp;

    // Fire: low noise bed with slow breathing, plus random pops from the timer below.
    amb.fire = c.createGain();
    amb.fire.gain.value = 0;
    amb.fire.connect(this.master);
    const bed = c.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const bg = c.createGain();
    bg.gain.value = 0.035;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.17;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.012;
    lfo.connect(lfoGain).connect(bg.gain);
    bed.connect(lp).connect(bg).connect(amb.fire);
    bed.start();
    lfo.start();
    amb.popTimer = setInterval(() => {
      if (!amb.fireOn || Math.random() > 0.65) return;
      const t = c.currentTime + Math.random() * 0.2;
      this.noiseVoice(t, { bp: 1600 + Math.random() * 3500, q: 2.5, peak: 0.02 + Math.random() * 0.05, decay: 0.012 + Math.random() * 0.03 });
    }, 110);

    // Wind: a deep rumble and a wandering whistle, both gusting slowly.
    amb.wind = c.createGain();
    amb.wind.gain.value = 0;
    amb.wind.connect(this.master);
    const rumbleSrc = c.createBufferSource();
    rumbleSrc.buffer = this.noise;
    rumbleSrc.loop = true;
    const rlp = c.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 260;
    const rg = c.createGain();
    rg.gain.value = 0.05;
    const gust = c.createOscillator();
    gust.frequency.value = 0.07;
    const gustGain = c.createGain();
    gustGain.gain.value = 0.03;
    gust.connect(gustGain).connect(rg.gain);
    rumbleSrc.connect(rlp).connect(rg).connect(amb.wind);
    const whistleSrc = c.createBufferSource();
    whistleSrc.buffer = this.noise;
    whistleSrc.loop = true;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 650;
    bp.Q.value = 6;
    const sweep = c.createOscillator();
    sweep.frequency.value = 0.11;
    const sweepGain = c.createGain();
    sweepGain.gain.value = 320;
    sweep.connect(sweepGain).connect(bp.frequency);
    const wg = c.createGain();
    wg.gain.value = 0.05;
    const wlfo = c.createOscillator();
    wlfo.frequency.value = 0.05;
    const wlfoGain = c.createGain();
    wlfoGain.gain.value = 0.035;
    wlfo.connect(wlfoGain).connect(wg.gain);
    whistleSrc.connect(bp).connect(wg).connect(amb.wind);
    rumbleSrc.start();
    whistleSrc.start();
    gust.start();
    sweep.start();
    wlfo.start();
    this.amb = amb;
  }

  setFire(on) {
    this.ensureAmbience();
    if (!this.amb) return;
    this.amb.fireOn = on;
    this.amb.ramp(this.amb.fire, on ? 1 : 0);
  }

  setWind(on) {
    this.ensureAmbience();
    if (!this.amb) return;
    this.amb.windOn = on;
    this.amb.ramp(this.amb.wind, on ? 1 : 0);
  }

  // ---- public instrument API ----

  piano(midi, vel = 0.7, t = this.now) {
    if (!this.started) return null;
    vel = clamp(vel, 0.05, 1);
    const voice = new Voice(this);
    const f = mtof(midi);
    const opts = {
      t,
      level: 0.08 + 0.8 * vel * vel,
      cutoff: clamp(f * 1.5 + 300 + Math.pow(vel, 1.6) * 11000, 500, 16000),
      send: 0.22,
      voice,
    };
    const b = this.getBuffer('piano', midi);
    if (b instanceof Promise) b.then((buf) => this.playBuffer(buf, { ...opts, t: this.now }));
    else this.playBuffer(b, opts);
    return voice;
  }

  pluck(kind, midi, vel = 0.7, t = this.now) {
    if (!this.started) return null;
    vel = clamp(vel, 0.05, 1);
    const voice = new Voice(this);
    const guitar = kind === 'guitar';
    return this.playBuffer(this.getBuffer(kind, midi), {
      t,
      level: (guitar ? 0.12 : 0.1) + 0.6 * vel,
      cutoff: guitar ? 1400 + vel * 8000 : 1000 + vel * 5000,
      send: guitar ? 0.16 : 0.34,
      voice,
      body: guitar,
    });
  }

  // ---- drums (live synthesis) ----

  env(g, peak, decay, t) {
    g.gain.setValueAtTime(Math.max(peak, 0.0005), t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  }

  noiseVoice(t, { hp = 0, lp = 20000, bp = 0, q = 1, peak, decay, send = 0 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    let node = src;
    if (bp) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = bp;
      f.Q.value = q;
      node.connect(f);
      node = f;
    }
    if (hp) {
      const f = c.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = hp;
      node.connect(f);
      node = f;
    }
    if (lp < 20000) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      node.connect(f);
      node = f;
    }
    const g = c.createGain();
    this.env(g, peak, decay, t);
    node.connect(g).connect(this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  toneVoice(t, { type = 'sine', f0, f1 = f0, slide = 0.05, peak, decay, send = 0, lp = 20000 }) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + slide);
    const g = c.createGain();
    this.env(g, peak, decay, t);
    let node = o;
    if (lp < 20000) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g).connect(this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  // Six inharmonic square waves through band/high-pass filters: the classic cymbal/hat recipe.
  metalVoice(t, { ratio = 1, bp = 9500, hp = 6500, peak, decay, send = 0 }) {
    const c = this.ctx;
    const bpf = c.createBiquadFilter();
    bpf.type = 'bandpass';
    bpf.frequency.value = bp;
    bpf.Q.value = 0.9;
    const hpf = c.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = hp;
    const g = c.createGain();
    this.env(g, peak, decay, t);
    bpf.connect(hpf).connect(g).connect(this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    for (const f of [263, 400, 421, 474, 587, 845]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = f * ratio;
      o.connect(bpf);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  drum(kind, vel = 0.8, t = this.now) {
    if (!this.started) return;
    vel = clamp(vel, 0.05, 1);
    const v2 = vel * vel;
    switch (kind) {
      case 'kick':
        this.toneVoice(t, { f0: 165, f1: 46, slide: 0.09, peak: 1.0 * vel, decay: 0.42 + 0.1 * vel, lp: 2500 });
        this.noiseVoice(t, { bp: 3200, q: 0.7, peak: 0.34 * v2, decay: 0.02 });
        break;
      case 'snare':
        this.toneVoice(t, { type: 'triangle', f0: 195, f1: 150, slide: 0.05, peak: 0.5 * vel, decay: 0.18 });
        this.toneVoice(t, { f0: 330, f1: 280, slide: 0.04, peak: 0.3 * vel, decay: 0.1 });
        this.noiseVoice(t, { hp: 1400, lp: 9000, peak: 0.66 * Math.pow(vel, 1.3), decay: 0.2 + 0.08 * vel, send: 0.3 });
        break;
      case 'hat':
        this.metalVoice(t, { peak: 0.62 * vel, decay: 0.08 + 0.03 * vel });
        this.noiseVoice(t, { hp: 9000, peak: 0.4 * vel, decay: 0.07 });
        break;
      case 'hatOpen':
        this.metalVoice(t, { peak: 0.52 * vel, decay: 0.42, send: 0.1 });
        this.noiseVoice(t, { hp: 8000, peak: 0.32 * vel, decay: 0.35 });
        break;
      case 'tom1':
        this.toneVoice(t, { f0: 210, f1: 140, slide: 0.12, peak: 0.9 * vel, decay: 0.62, send: 0.15 });
        this.noiseVoice(t, { bp: 2500, q: 0.6, peak: 0.26 * vel, decay: 0.03 });
        break;
      case 'tom2':
        this.toneVoice(t, { f0: 165, f1: 105, slide: 0.14, peak: 0.9 * vel, decay: 0.78, send: 0.15 });
        this.noiseVoice(t, { bp: 2200, q: 0.6, peak: 0.26 * vel, decay: 0.03 });
        break;
      case 'floor':
        this.toneVoice(t, { f0: 115, f1: 72, slide: 0.16, peak: 1.0 * vel, decay: 1.0, send: 0.15 });
        this.noiseVoice(t, { bp: 1800, q: 0.6, peak: 0.24 * vel, decay: 0.03 });
        break;
      case 'crash':
        this.noiseVoice(t, { bp: 5500, q: 0.4, hp: 2800, peak: 0.55 * vel, decay: 1.6 + 0.6 * vel, send: 0.25 });
        this.metalVoice(t, { ratio: 1.7, bp: 6000, hp: 3000, peak: 0.22 * vel, decay: 1.2, send: 0.2 });
        break;
      case 'ride':
        this.metalVoice(t, { ratio: 1.3, bp: 7000, hp: 4000, peak: 0.42 * vel, decay: 1.1, send: 0.15 });
        this.toneVoice(t, { f0: 2900, peak: 0.26 * vel, decay: 0.6 });
        this.noiseVoice(t, { hp: 6000, peak: 0.17 * vel, decay: 0.6 });
        break;
    }
  }
}
