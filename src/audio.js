const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// A note that may start a few ms late if its sample is still being rendered.
class Voice {
  constructor(engine) {
    this.engine = engine;
    this.src = null;
    this.gain = null;
    this.pendingRelease = null;
    this.onRelease = null;
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
    if (this.onRelease) {
      const cb = this.onRelease;
      this.onRelease = null;
      cb();
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
    this.master.connect(this.comp);

    this.reverb = c.createConvolver();
    this.reverb.buffer = this.makeRoomImpulse({ seconds: 2.0, preDelay: 0.014, fast: 0.32, slow: 0.62, lp: 0.11, early: 1 });
    this.reverbGain = c.createGain();
    this.reverbGain.gain.value = 0.26;
    this.reverb.connect(this.reverbGain).connect(this.master);
    // Short, brighter room for the drums so they sit in the space without washing out.
    this.drumRoom = c.createConvolver();
    this.drumRoom.buffer = this.makeRoomImpulse({ seconds: 0.45, preDelay: 0.004, fast: 0.3, slow: 0.45, lp: 0.3, early: 0.8 });
    this.drumRoomGain = c.createGain();
    this.drumRoomGain.gain.value = 0.3;
    this.drumRoom.connect(this.drumRoomGain).connect(this.spatial('drum:room'));
    // Soundboard and soundbox resonances: a few decaying modes the strings excite.
    this.pianoBoard = c.createConvolver();
    this.pianoBoard.buffer = this.makeBodyImpulse([95, 142, 187, 236, 298, 372, 450, 560], 0.28);
    this.pianoBoardGain = c.createGain();
    this.pianoBoardGain.gain.value = 0.22;
    this.pianoBoard.connect(this.pianoBoardGain).connect(this.spatial('piano-mid'));
    this.harpBox = c.createConvolver();
    this.harpBox.buffer = this.makeBodyImpulse([138, 205, 286, 377, 515, 690], 0.3);
    this.harpBoxGain = c.createGain();
    this.harpBoxGain.gain.value = 0.24;
    this.harpBox.connect(this.harpBoxGain).connect(this.spatial('harp'));
    // A touch of air on the master: head-related filtering softens the top end.
    this.air = c.createBiquadFilter();
    this.air.type = 'highshelf';
    this.air.frequency.value = 7500;
    this.air.gain.value = 1.5;

    this.comp.connect(this.air).connect(c.destination);
    this.noise = this.makeNoise();
    this.started = true;
    await c.resume();
    this.precompute();
  }

  // Room impulse: silence for the pre-delay, a handful of early reflections, then a diffuse tail
  // made of a fast-decaying full-band layer and a slower-decaying low-passed layer, so highs die
  // first the way they do in a furnished room. Channels are decorrelated for width.
  makeRoomImpulse({ seconds, preDelay, fast, slow, lp, early }) {
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = c.createBuffer(2, len, sr);
    const taps = [0.009, 0.014, 0.019, 0.027, 0.034, 0.045, 0.058];
    const gains = [0.7, 0.55, 0.45, 0.38, 0.3, 0.22, 0.15];
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      const pd = Math.floor(sr * preDelay);
      let low = 0;
      for (let i = pd; i < len; i++) {
        const t = (i - pd) / sr;
        const n = Math.random() * 2 - 1;
        low += lp * (n - low);
        const fadeIn = Math.min(1, t / 0.006);
        d[i] = fadeIn * (0.55 * n * Math.exp(-t / (seconds * fast)) + 1.5 * low * Math.exp(-t / (seconds * slow)));
      }
      for (let k = 0; k < taps.length; k++) {
        const at = pd + Math.floor(sr * (taps[k] + (ch ? 0.0011 * (k % 2 ? 1 : -1) : 0)));
        for (let j = 0; j < 3 && at + j < len; j++) d[at + j] += early * gains[k] * (1 - j * 0.3) * (Math.random() < 0.5 ? -1 : 1);
      }
    }
    return buf;
  }

  // Body impulse: decaying sines at the given mode frequencies, lightly randomised in phase.
  makeBodyImpulse(modes, seconds) {
    const c = this.ctx;
    const sr = c.sampleRate;
    const len = Math.floor(sr * seconds);
    const buf = c.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const phases = modes.map(() => Math.random() * Math.PI * 2);
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      let v = 0;
      for (let k = 0; k < modes.length; k++) v += Math.sin(2 * Math.PI * modes[k] * t + phases[k]) * Math.exp(-t / (seconds * (0.35 - k * 0.03))) / (1 + k * 0.5);
      d[i] = v;
    }
    let peak = 0;
    for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(d[i]));
    for (let i = 0; i < len; i++) d[i] /= peak * 6;
    return buf;
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
    air.connect(top).connect(this.spatial('guitar'));
    this.body = air;
    return air;
  }

  playBuffer(buf, { t, level, cutoff, send, voice, body = false, source = null, resonator = null, resonance = 0 }) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = buf;
    // No two notes identical: a few cents of pitch, a little tone and level, like a real touch.
    src.playbackRate.value = 1 + (Math.random() - 0.5) * 0.0032;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff * (1 + (Math.random() - 0.5) * 0.1);
    f.Q.value = 0.4;
    const g = c.createGain();
    g.gain.value = level * (1 + (Math.random() - 0.5) * 0.12);
    src.connect(f).connect(g).connect(body ? this.guitarBody() : source ? this.spatial(source) : this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    if (resonator && resonance > 0) {
      const b = c.createGain();
      b.gain.value = resonance;
      g.connect(b).connect(resonator);
    }
    src.start(Math.max(t, c.currentTime));
    voice.attach(src, g);
    return voice;
  }

  // ---- spatial audio: one HRTF panner per sound source, listener follows the head ----
  spatial(name) {
    if (!this.panners) this.panners = new Map();
    let p = this.panners.get(name);
    if (!p) {
      const c = this.ctx;
      p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 0.6;
      p.rolloffFactor = 1.1;
      p.maxDistance = 30;
      p.connect(this.master);
      this.panners.set(name, p);
    }
    return p;
  }

  // Sources only move when a rig is dragged, so positions are set directly rather than ramped.
  setSourcePosition(name, x, y, z) {
    if (!this.started) return;
    const p = this.spatial(name);
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
  }

  setListener(pos, fwd, up) {
    if (!this.started) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(pos.x, t, 0.02);
      l.positionY.setTargetAtTime(pos.y, t, 0.02);
      l.positionZ.setTargetAtTime(pos.z, t, 0.02);
      l.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      l.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      l.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      l.upX.setTargetAtTime(up.x, t, 0.02);
      l.upY.setTargetAtTime(up.y, t, 0.02);
      l.upZ.setTargetAtTime(up.z, t, 0.02);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
    }
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
    amb.fire.connect(this.spatial('fire'));
    const bed = c.createBufferSource();
    bed.buffer = this.noise;
    bed.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    const bg = c.createGain();
    bg.gain.value = 0.09;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.17;
    const lfoGain = c.createGain();
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain).connect(bg.gain);
    bed.connect(lp).connect(bg).connect(amb.fire);
    bed.start();
    lfo.start();
    amb.popTimer = setInterval(() => {
      if (!amb.fireOn || Math.random() > 0.65) return;
      const t = c.currentTime + Math.random() * 0.2;
      this.noiseVoice(t, { bp: 1600 + Math.random() * 3500, q: 2.5, peak: 0.05 + Math.random() * 0.1, decay: 0.012 + Math.random() * 0.03, dest: amb.fire });
    }, 110);

    // Wind: a deep rumble and a wandering whistle, both gusting slowly.
    amb.wind = c.createGain();
    amb.wind.gain.value = 0;
    amb.wind.connect(this.spatial('wind'));
    const rumbleSrc = c.createBufferSource();
    rumbleSrc.buffer = this.noise;
    rumbleSrc.loop = true;
    const rlp = c.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 260;
    const rg = c.createGain();
    rg.gain.value = 0.1;
    const gust = c.createOscillator();
    gust.frequency.value = 0.07;
    const gustGain = c.createGain();
    gustGain.gain.value = 0.06;
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
    wg.gain.value = 0.1;
    const wlfo = c.createOscillator();
    wlfo.frequency.value = 0.05;
    const wlfoGain = c.createGain();
    wlfoGain.gain.value = 0.07;
    wlfo.connect(wlfoGain).connect(wg.gain);
    whistleSrc.connect(bp).connect(wg).connect(amb.wind);
    rumbleSrc.start();
    whistleSrc.start();
    gust.start();
    sweep.start();
    wlfo.start();

    // Rain: a steady hiss that swells slowly, a low roof rumble, and random single drops.
    amb.rain = c.createGain();
    amb.rain.gain.value = 0;
    amb.rain.connect(this.spatial('rain'));
    const hissSrc = c.createBufferSource();
    hissSrc.buffer = this.noise;
    hissSrc.loop = true;
    const hbp = c.createBiquadFilter();
    hbp.type = 'bandpass';
    hbp.frequency.value = 3200;
    hbp.Q.value = 0.45;
    const hg = c.createGain();
    hg.gain.value = 0.12;
    const hlfo = c.createOscillator();
    hlfo.frequency.value = 0.09;
    const hlfoGain = c.createGain();
    hlfoGain.gain.value = 0.04;
    hlfo.connect(hlfoGain).connect(hg.gain);
    hissSrc.connect(hbp).connect(hg).connect(amb.rain);
    const roofSrc = c.createBufferSource();
    roofSrc.buffer = this.noise;
    roofSrc.loop = true;
    const rlp2 = c.createBiquadFilter();
    rlp2.type = 'lowpass';
    rlp2.frequency.value = 140;
    const rg2 = c.createGain();
    rg2.gain.value = 0.06;
    roofSrc.connect(rlp2).connect(rg2).connect(amb.rain);
    hissSrc.start();
    roofSrc.start();
    hlfo.start();
    amb.dropTimer = setInterval(() => {
      if (!amb.rainOn) return;
      const n = Math.random() < 0.5 ? 1 : 2;
      for (let i = 0; i < n; i++) {
        const t = c.currentTime + Math.random() * 0.05;
        this.noiseVoice(t, { bp: 3000 + Math.random() * 6000, q: 4, peak: 0.016 + Math.random() * 0.04, decay: 0.005 + Math.random() * 0.012, dest: amb.rain });
      }
    }, 55);
    this.amb = amb;
  }

  setRain(on) {
    this.ensureAmbience();
    if (!this.amb) return;
    this.amb.rainOn = on;
    this.amb.ramp(this.amb.rain, on ? 1 : 0);
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
      // Bass, middle and treble each have their own source across the keyboard's width.
      source: midi < 52 ? 'piano-lo' : midi < 76 ? 'piano-mid' : 'piano-hi',
    };
    opts.resonator = this.pianoBoard;
    opts.resonance = 0.6 + 0.4 * vel;
    // Hammer knock: the felt hitting the string, louder and harder with velocity.
    this.noiseVoice(t, { bp: clamp(f * 1.6 + 900, 600, 3200), q: 1.1, peak: 0.05 + 0.3 * vel * vel, decay: 0.007 + 0.004 * vel, dest: this.spatial(opts.source) });
    voice.onRelease = () => this.noiseVoice(this.now, { bp: 260, q: 0.8, peak: 0.028, decay: 0.03, dest: this.spatial(opts.source) });
    const b = this.getBuffer('piano', midi);
    if (b instanceof Promise) b.then((buf) => this.playBuffer(buf, { ...opts, t: this.now }));
    else this.playBuffer(b, opts);
    return voice;
  }

  // Sustain pedal going down or up: a soft mechanical thump under the piano.
  pedalNoise(down) {
    if (!this.started) return;
    const t = this.now;
    this.toneVoice(t, { f0: down ? 70 : 90, f1: 45, slide: 0.03, peak: down ? 0.12 : 0.07, decay: 0.07, dest: this.spatial('piano-mid') });
    this.noiseVoice(t, { lp: 900, peak: 0.03, decay: 0.03, dest: this.spatial('piano-mid') });
  }

  pluck(kind, midi, vel = 0.7, t = this.now) {
    if (!this.started) return null;
    vel = clamp(vel, 0.05, 1);
    const voice = new Voice(this);
    const guitar = kind === 'guitar';
    // Contact transient: pick click on the guitar, fingertip thud on the harp.
    if (guitar) this.noiseVoice(t, { bp: 3200, q: 2, peak: 0.04 + 0.1 * vel, decay: 0.005, dest: this.spatial('guitar') });
    else this.noiseVoice(t, { lp: 700, peak: 0.02 + 0.05 * vel, decay: 0.012, dest: this.spatial('harp') });
    return this.playBuffer(this.getBuffer(kind, midi), {
      t,
      level: (guitar ? 0.12 : 0.1) + 0.6 * vel,
      cutoff: guitar ? 1400 + vel * 8000 : 1000 + vel * 5000,
      send: guitar ? 0.16 : 0.34,
      voice,
      body: guitar,
      source: guitar ? null : 'harp',
      resonator: guitar ? null : this.harpBox,
      resonance: guitar ? 0 : 0.5 + 0.4 * vel,
    });
  }

  // ---- drums (live synthesis) ----

  env(g, peak, decay, t) {
    g.gain.setValueAtTime(Math.max(peak, 0.0005), t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  }

  noiseVoice(t, { hp = 0, lp = 20000, bp = 0, q = 1, peak, decay, send = 0, dest = null }) {
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
    node.connect(g).connect(dest || this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    src.start(t);
    src.stop(t + decay + 0.05);
  }

  toneVoice(t, { type = 'sine', f0, f1 = f0, slide = 0.05, peak, decay, send = 0, lp = 20000, dest = null }) {
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
    node.connect(g).connect(dest || this.master);
    if (send > 0) {
      const s = c.createGain();
      s.gain.value = send;
      g.connect(s).connect(this.reverb);
    }
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  // Six inharmonic square waves through band/high-pass filters: the classic cymbal/hat recipe.
  metalVoice(t, { ratio = 1, bp = 9500, hp = 6500, peak, decay, send = 0, dest = null }) {
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
    bpf.connect(hpf).connect(g).connect(dest || this.master);
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

  drumLevel = 1.7;
  drum(kind, vel = 0.8, t = this.now) {
    if (!this.started) return;
    vel = clamp(vel, 0.05, 1);
    const v2 = vel * vel;
    // Route every voice of this hit to the drum's own spatial source, with a short room send.
    const src = this.spatial('drum:' + kind);
    const dest = this.ctx.createGain();
    // The kit sits well above the other instruments, the way a live kit does in a room.
    dest.gain.value = this.drumLevel;
    dest.connect(src);
    const room = this.ctx.createGain();
    room.gain.value = kind === 'kick' ? 0.35 : kind === 'crash' || kind === 'ride' ? 0.2 : 0.5;
    dest.connect(room).connect(this.drumRoom);
    const tv = this.toneVoice, nv = this.noiseVoice, mv = this.metalVoice;
    this.toneVoice = (tt, o) => tv.call(this, tt, { ...o, dest });
    this.noiseVoice = (tt, o) => nv.call(this, tt, { ...o, dest });
    this.metalVoice = (tt, o) => mv.call(this, tt, { ...o, dest, bp: (o.bp || 9500) * (0.85 + 0.3 * vel) });
    try {
      this.drumVoices(kind, vel, v2, t);
    } finally {
      this.toneVoice = tv;
      this.noiseVoice = nv;
      this.metalVoice = mv;
    }
    // Snare wires rattle in sympathy when the kick and toms hit.
    if (kind === 'kick' || kind.startsWith('tom') || kind === 'floor') {
      this.noiseVoice(t + 0.004, { hp: 2800, lp: 9000, peak: 0.07 * vel, decay: 0.08, dest: this.spatial('drum:snare') });
    }
  }

  drumVoices(kind, vel, v2, t) {
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
        this.metalVoice(t, { bp: 8500, hp: 5000, peak: 1.3 * vel, decay: 0.08 + 0.03 * vel });
        this.noiseVoice(t, { hp: 7000, peak: 0.75 * vel, decay: 0.07 });
        break;
      case 'hatOpen':
        this.metalVoice(t, { bp: 8500, hp: 5000, peak: 1.05 * vel, decay: 0.42, send: 0.1 });
        this.noiseVoice(t, { hp: 7000, peak: 0.6 * vel, decay: 0.35 });
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
        this.noiseVoice(t, { bp: 5500, q: 0.4, hp: 2800, peak: 0.95 * vel, decay: 1.6 + 0.6 * vel, send: 0.25 });
        this.metalVoice(t, { ratio: 1.7, bp: 6000, hp: 3000, peak: 0.4 * vel, decay: 1.2, send: 0.2 });
        break;
      case 'ride':
        this.metalVoice(t, { ratio: 1.3, bp: 7000, hp: 4000, peak: 0.8 * vel, decay: 1.1, send: 0.15 });
        this.toneVoice(t, { f0: 2900, peak: 0.45 * vel, decay: 0.6 });
        this.noiseVoice(t, { hp: 6000, peak: 0.3 * vel, decay: 0.6 });
        break;
    }
  }
}
