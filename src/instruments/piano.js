import * as THREE from 'three';
import { box } from '../materials.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _tip = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _dummy = new THREE.Object3D();

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

    const whiteGeo = new THREE.BoxGeometry(W - 0.0012, this.H, this.L);
    whiteGeo.translate(0, -this.H / 2, this.L / 2);
    const blackGeo = new THREE.BoxGeometry(this.BW, 0.016, this.BL);
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
    // Lower and upper case body behind the keys.
    add(box(caseW, 1.29, 0.58, wood, 0, floorY + 1.29 / 2, -0.17 - 0.29));
    // Keybed under the keys, cheek blocks at each end, key slip in front.
    add(box(1.34, 0.03, 0.2, wood, 0, -0.035, -0.08));
    add(box(0.055, 0.1, 0.2, wood, -0.6425 - 0.0275, 0.0, -0.08));
    add(box(0.055, 0.1, 0.2, wood, 0.6425 + 0.0275, 0.0, -0.08));
    add(box(1.34, 0.028, 0.012, wood, 0, -0.034, 0.007));
    // Red felt behind the keys, under the fallboard lip.
    this.add(box(1.24, 0.008, 0.012, mats.felt, 0, 0.004, -g + 0.02));
    // Fallboard (open) leaning back over the rear of the keys.
    const fall = box(1.34, 0.11, 0.025, wood, 0, 0.085, -g + 0.035);
    fall.rotation.x = -0.35;
    add(fall);
    // Music desk.
    const desk = box(0.72, 0.22, 0.012, wood, 0, 0.36, -0.17 + 0.03);
    desk.rotation.x = -0.28;
    add(desk);
    add(box(0.74, 0.012, 0.05, wood, 0, 0.26, -0.17 + 0.04));
    // Top lid.
    add(box(caseW + 0.04, 0.03, 0.62, wood, 0, floorY + 1.29 + 0.015, -0.17 - 0.29));
    // Toe blocks and pedals.
    add(box(0.1, 0.09, 0.14, wood, -0.6, floorY + 0.045, -0.12));
    add(box(0.1, 0.09, 0.14, wood, 0.6, floorY + 0.045, -0.12));
    add(box(0.22, 0.18, 0.06, wood, 0, floorY + 0.09, -0.19));
    for (const x of [-0.085, 0, 0.085]) {
      const pedal = box(0.03, 0.012, 0.09, mats.brass, x, floorY + 0.045, -0.13);
      pedal.rotation.x = 0.18;
      this.add(pedal);
    }
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
    key.voice = this.audio.piano(key.midi, vel);
    if (this.recorder) this.recorder.add({ type: 'pianoOn', midi: key.midi, vel });
  }

  releaseKey(key, p) {
    key.pressedBy.delete(p.id);
    if (p.state.get(this) === key) p.state.set(this, null);
    if (!key.pressedBy.size && key.voice) {
      key.voice.release();
      key.voice = null;
      if (this.recorder) this.recorder.add({ type: 'pianoOff', midi: key.midi });
    }
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

  desktopDown(hit, p) {
    const key = hit.object === this.blackMesh ? this.blacks[hit.instanceId] : this.whites[hit.instanceId];
    if (key) this.pressKey(key, p, 0.7);
  }

  desktopUp(p) {
    const held = p.state.get(this);
    if (held) this.releaseKey(held, p);
  }
}
