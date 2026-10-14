import * as THREE from 'three';
import { box, rbox } from '../materials.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _tip = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _dummy = new THREE.Object3D();
const _q = new THREE.Quaternion();

// 88-key upright. Keys hinge at the rear like real weighted keys: they travel ~10 mm at the front,
// the sound fires a few mm into the travel, and loudness and brightness follow strike speed.
export class Piano extends THREE.Group {
  constructor(audio, mats) {
    super();
    this.audio = audio;
    this.W = 0.0235; // white key pitch
    this.L = 0.15; // visible white key length
    this.H = 0.02;
    this.BW = 0.0137;
    this.BL = 0.095;
    this.BTOP = 0.012; // black key top above white top
    this.keys = [];
    this.whites = [];
    this.blacks = [];

    const W = this.W;
    this.x0 = -(52 * W) / 2;
    let white = 0;
    const blackOffset = { 1: -0.0028, 3: 0.0028, 6: -0.004, 8: 0, 10: 0.004 };
    for (let m = 21; m <= 108; m++) {
      const pc = m % 12;
      const isBlack = pc in blackOffset;
      const key = { midi: m, black: isBlack, x: 0, depth: 0, pressedBy: new Set(), voice: null, inst: 0 };
      if (isBlack) {
        key.x = this.x0 + white * W + blackOffset[pc];
        key.inst = this.blacks.length;
        this.blacks.push(key);
      } else {
        key.x = this.x0 + (white + 0.5) * W;
        key.inst = this.whites.length;
        this.whites.push(key);
        white++;
      }
      this.keys.push(key);
    }
    this.blacksNear = this.whites.map((w) => this.blacks.filter((b) => Math.abs(b.x - w.x) < W));
    this.byMidi = new Map(this.keys.map((k) => [k.midi, k]));
    this.recorder = null;

    const whiteGeo = new RoundedBoxGeometry(W - 0.0014, this.H, this.L, 2, 0.0022);
    whiteGeo.translate(0, -this.H / 2, this.L / 2);
    const blackGeo = new RoundedBoxGeometry(this.BW, 0.016, this.BL, 2, 0.0025);
    blackGeo.translate(0, this.BTOP - 0.008, this.BL / 2);
    this.whiteMesh = new THREE.InstancedMesh(whiteGeo, mats.ivory, this.whites.length);
    this.blackMesh = new THREE.InstancedMesh(blackGeo, mats.blackKey, this.blacks.length);
    this.whiteMesh.castShadow = this.blackMesh.castShadow = true;
    this.add(this.whiteMesh, this.blackMesh);
    for (const k of this.keys) this.writeKey(k);
    this.hitMeshes = [this.whiteMesh, this.blackMesh];

    this.buildCase(mats);
  }

  buildCase(mats) {
    const g = this.L;
    const caseW = 1.46;
    const floorY = -0.72;
    const wood = mats.walnutGloss;
    const add = (m) => {
      m.castShadow = true;
      m.receiveShadow = true;
      this.add(m);
      return m;
    };
    // Lower and upper case body behind the keys, with a recessed lower panel.
    add(rbox(caseW, 1.29, 0.58, wood, 0, floorY + 1.29 / 2, -0.17 - 0.29, 0.01));
    add(rbox(1.2, 0.5, 0.02, wood, 0, floorY + 0.33, -0.17 + 0.012, 0.006));
    add(box(1.26, 0.56, 0.004, mats.ebony, 0, floorY + 0.33, -0.17 + 0.004));
    // Keybed under the keys, black felt so key gaps read dark, cheek blocks, key slip.
    add(box(1.34, 0.03, 0.2, wood, 0, -0.035, -0.08));
    this.add(box(1.24, 0.004, 0.16, mats.soot, 0, -0.021, -0.075));
    add(rbox(0.055, 0.1, 0.2, wood, -0.6425 - 0.0275, 0.0, -0.08, 0.006));
    add(rbox(0.055, 0.1, 0.2, wood, 0.6425 + 0.0275, 0.0, -0.08, 0.006));
    add(rbox(1.34, 0.028, 0.012, wood, 0, -0.034, 0.007, 0.004));
    // Red felt behind the keys, under the fallboard lip.
    this.add(box(1.24, 0.008, 0.012, mats.felt, 0, 0.004, -g + 0.02));
    // Fallboard (open) leaning back over the rear of the keys.
    const fall = rbox(1.34, 0.11, 0.025, wood, 0, 0.085, -g + 0.035, 0.006);
    fall.rotation.x = -0.35;
    add(fall);
    // Music desk.
    const desk = rbox(0.72, 0.22, 0.012, wood, 0, 0.36, -0.17 + 0.03, 0.004);
    desk.rotation.x = -0.28;
    add(desk);
    add(box(0.74, 0.012, 0.05, wood, 0, 0.26, -0.17 + 0.04));
    // Top lid.
    add(rbox(caseW + 0.04, 0.03, 0.62, wood, 0, floorY + 1.29 + 0.015, -0.17 - 0.29, 0.008));
    // Brass hinge strip on the fallboard.
    this.add(box(1.3, 0.006, 0.012, mats.brass, 0, 0.142, -g + 0.052));
    // Toe blocks and pedals.
    add(box(0.1, 0.09, 0.14, wood, -0.6, floorY + 0.045, -0.12));
    add(box(0.1, 0.09, 0.14, wood, 0.6, floorY + 0.045, -0.12));
    // One pedal only: the sustain pedal, centred, on a narrow pedal block.
    add(box(0.12, 0.18, 0.06, wood, 0, floorY + 0.09, -0.19));
    const pedal = box(0.034, 0.012, 0.1, mats.brass, 0, floorY + 0.045, -0.13);
    pedal.rotation.x = 0.18;
    pedal.userData.pedal = 'sustain';
    this.add(pedal);
    this.pedals = [pedal];
    this.sustainPedal = pedal;
    this.hitMeshes.push(this.sustainPedal);
    this.sustain = false;
    this.sustained = new Set();
    this.lastPedal = -1;
    this.pedalFloorY = floorY;
  }

  writeKey(k) {
    const maxAngle = k.black ? 0.084 : 0.067;
    _dummy.position.set(k.x, 0, -this.L);
    _dummy.rotation.set(k.depth * maxAngle, 0, 0);
    _dummy.updateMatrix();
    (k.black ? this.blackMesh : this.whiteMesh).setMatrixAt(k.inst, _dummy.matrix);
  }

  keyAt(lx, lz) {
    const i = Math.floor((lx - this.x0) / this.W);
    if (i < 0 || i >= this.whites.length) return null;
    if (lz < -(this.L - this.BL)) {
      for (const b of this.blacksNear[i]) if (Math.abs(lx - b.x) < this.BW / 2 + 0.0015) return b;
    }
    return this.whites[i];
  }

  pressKey(key, p, vel) {
    key.pressedBy.add(p.id);
    p.state.set(this, key);
    if (key.voice) key.voice.release();
    this.sustained.delete(key);
    key.voice = this.audio.piano(key.midi, vel);
    if (this.recorder) this.recorder.add({ type: 'pianoOn', midi: key.midi, vel });
  }

  releaseKey(key, p) {
    key.pressedBy.delete(p.id);
    if (p.state.get(this) === key) p.state.set(this, null);
    if (!key.pressedBy.size && key.voice) {
      if (this.recorder) this.recorder.add({ type: 'pianoOff', midi: key.midi });
      if (this.sustain) {
        this.sustained.add(key);
      } else {
        key.voice.release();
        key.voice = null;
      }
    }
  }

  // Right pedal: sustain. Released notes keep ringing until the pedal comes up.
  setSustain(on) {
    if (this.sustain === on) return;
    this.sustain = on;
    this.sustainPedal.rotation.x = on ? 0.32 : 0.18;
    if (!on) {
      for (const key of this.sustained) {
        if (!key.pressedBy.size && key.voice) {
          key.voice.release();
          key.voice = null;
        }
      }
      this.sustained.clear();
    }
    if (this.recorder) this.recorder.add({ type: 'sustain', on });
  }

  togglePedal() {
    const now = performance.now();
    if (now - this.lastPedal < 300) return;
    this.lastPedal = now;
    this.setSustain(!this.sustain);
  }

  // Playback helpers: a ghost pointer holds keys down exactly as the player did.
  ghost = { id: 'playback', state: new Map() };
  playbackOn(midi, vel) {
    const key = this.byMidi.get(midi);
    if (key) this.pressKey(key, this.ghost, vel);
  }
  playbackOff(midi) {
    const key = this.byMidi.get(midi);
    if (key && key.pressedBy.has(this.ghost.id)) this.releaseKey(key, this.ghost);
  }
  playbackReleaseAll() {
    for (const key of this.keys) if (key.pressedBy.has(this.ghost.id)) this.releaseKey(key, this.ghost);
  }

  update(pointers, dt) {
    for (const p of pointers) {
      const held = p.state.get(this) || null;
      if (!p.active) {
        if (held) this.releaseKey(held, p);
        continue;
      }
      _tip.copy(p.tip);
      this.worldToLocal(_tip);
      _prev.copy(p.prev);
      this.worldToLocal(_prev);
      const inBoard =
        _tip.x > this.x0 - 0.01 && _tip.x < -this.x0 + 0.01 && _tip.z > -this.L - 0.01 && _tip.z < 0.025 && _tip.y > -0.06 && _tip.y < 0.1;
      const key = inBoard ? this.keyAt(_tip.x, _tip.z) : null;
      if (held && held !== key) this.releaseKey(held, p);
      if (!key) continue;
      const top = key.black ? this.BTOP : 0;
      if (!key.pressedBy.has(p.id)) {
        const trigger = top - 0.004;
        if (_prev.y > trigger && _tip.y <= trigger && _tip.y > top - 0.05) {
          const vy = (_prev.y - _tip.y) / Math.max(dt, 1e-3);
          const vel = clamp(Math.pow((vy - 0.03) / 1.3, 0.8), 0.12, 1);
          this.pressKey(key, p, vel);
        }
      } else if (_tip.y > top + 0.012) {
        this.releaseKey(key, p);
      }
    }
    // Tap the right pedal with a hand to toggle sustain.
    for (const p of pointers) {
      if (!p.active || !p.wasActive) continue;
      _tip.copy(p.tip);
      this.worldToLocal(_tip);
      const top = this.pedalFloorY + 0.055;
      if (Math.abs(_tip.x) > 0.035 || _tip.z < -0.19 || _tip.z > -0.07) continue;
      _prev.copy(p.prev);
      this.worldToLocal(_prev);
      if (_prev.y > top && _tip.y <= top && _tip.y > top - 0.04) this.togglePedal();
    }
    let wDirty = false, bDirty = false;
    for (const k of this.keys) {
      const target = k.pressedBy.size ? 1 : 0;
      if (k.depth === target) continue;
      // Weighted feel: quick to bottom, slower spring back.
      const step = target > k.depth ? dt / 0.045 : -dt / 0.09;
      k.depth = clamp(k.depth + step, 0, 1);
      if (Math.abs(k.depth - target) < 0.02) k.depth = target;
      this.writeKey(k);
      if (k.black) bDirty = true;
      else wDirty = true;
    }
    if (wDirty) this.whiteMesh.instanceMatrix.needsUpdate = true;
    if (bDirty) this.blackMesh.instanceMatrix.needsUpdate = true;
  }

  // Report the key each fingertip is hovering just above.
  hover(pointers, glow) {
    const HOVER = 0.05;
    for (const p of pointers) {
      if (!p.active) continue;
      _tip.copy(p.tip);
      this.worldToLocal(_tip);
      if (_tip.x < this.x0 || _tip.x > -this.x0 || _tip.z < -this.L || _tip.z > 0.01) continue;
      const key = this.keyAt(_tip.x, _tip.z);
      if (!key) continue;
      const top = key.black ? this.BTOP : 0;
      const h = _tip.y - top;
      if (h < -0.01 || h > HOVER) continue;
      const pos = new THREE.Vector3(key.x, top + 0.001, Math.max(-this.L + 0.03, Math.min(-0.012, _tip.z)));
      this.localToWorld(pos);
      const axis = new THREE.Vector3(0, 0, 1).applyQuaternion(this.getWorldQuaternion(_q));
      const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(_q);
      glow.add({ pos, length: 0.07, width: key.black ? 0.016 : 0.024, axis, normal, strength: 1 - Math.max(0, h) / HOVER });
    }
  }

  keyFromHit(hit) {
    if (hit.object === this.blackMesh) return this.blacks[hit.instanceId];
    if (hit.object === this.whiteMesh) return this.whites[hit.instanceId];
    return null;
  }

  desktopDown(hit, p) {
    if (hit.object.userData.pedal) {
      if (hit.object.userData.pedal === 'sustain') this.togglePedal();
      return;
    }
    const key = this.keyFromHit(hit);
    if (key) this.pressKey(key, p, 0.7);
  }

  // Dragging across the keys plays each one in turn: a glissando.
  desktopMove(hit, p) {
    if (hit.object.userData.pedal) return;
    const key = this.keyFromHit(hit);
    const held = p.state.get(this) || null;
    if (!key || key === held) return;
    if (held) this.releaseKey(held, p);
    this.pressKey(key, p, 0.6);
  }

  // Computer keyboard: one virtual pointer per physical key so chords hold.
  pressMidi(midi, p, vel = 0.75) {
    const key = this.byMidi.get(midi);
    if (key && !key.pressedBy.has(p.id)) this.pressKey(key, p, vel);
  }

  releaseMidi(midi, p) {
    const key = this.byMidi.get(midi);
    if (key && key.pressedBy.has(p.id)) this.releaseKey(key, p);
  }

  desktopUp(p) {
    const held = p.state.get(this);
    if (held) this.releaseKey(held, p);
  }
}
