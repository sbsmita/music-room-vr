import * as THREE from 'three';
import { cylinderBetween, box } from '../materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _tip = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _d = new THREE.Vector2();
const _q = new THREE.Quaternion();
const SCALE = [0, 2, 4, 5, 7, 9, 11];

// 22-string lever harp in C major, C3 to C6. Strings lie in the local z=0 plane.
// A fingertip passing through the plane next to a string, or sweeping across it, plucks it.
export class Harp extends THREE.Group {
  constructor(audio, mats) {
    super();
    this.audio = audio;
    this.recorder = null;
    this.strings = [];
    this.hitMeshes = [];
    this.buildFrame(mats);
    this.buildStrings(mats);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    plane.position.set(-0.33, 0.72, 0);
    this.add(plane);
    this.hitMeshes.push(plane);
    this.dragMesh = plane;
  }

  // Soundboard runs from sb0 (bottom, near player) up to sb1; neck curves from the pillar top to sb1.
  buildFrame(mats) {
    // Bass strings are the longest and sit nearest the pillar, so the soundboard rises from the
    // pillar's foot up and away to where the neck meets it.
    this.sb0 = new THREE.Vector3(-0.55, 0.17, 0);
    this.sb1 = new THREE.Vector3(0.0, 1.1, 0);
    const neckPts = [
      new THREE.Vector3(-0.68, 1.3, 0),
      new THREE.Vector3(-0.5, 1.43, 0),
      new THREE.Vector3(-0.25, 1.39, 0),
      new THREE.Vector3(-0.06, 1.25, 0),
      new THREE.Vector3(0.0, 1.12, 0),
    ];
    this.neckCurve = new THREE.CatmullRomCurve3(neckPts);

    // Soundbox: tapered box along the soundboard line.
    const dir = new THREE.Vector3().subVectors(this.sb1, this.sb0);
    const len = dir.length();
    const boxGeo = new THREE.CylinderGeometry(0.055, 0.1, len, 5, 1).toNonIndexed();
    boxGeo.computeVertexNormals();
    const soundbox = new THREE.Mesh(boxGeo, mats.maple);
    soundbox.position.copy(this.sb0).addScaledVector(dir, 0.5);
    soundbox.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    soundbox.rotateY(Math.PI / 5);
    soundbox.position.z = -0.075;
    soundbox.castShadow = true;
    this.add(soundbox);
    // Soundboard strip (lighter spruce) with a string rib.
    const board = cylinderBetween(this.sb0.clone().add(new THREE.Vector3(0, -0.04, 0)), this.sb1.clone().add(new THREE.Vector3(0, 0.03, 0)), 0.02, mats.spruce, 8);
    board.scale.x = 4;
    this.add(board);
    const rib = cylinderBetween(this.sb0, this.sb1, 0.012, mats.walnut, 8);
    this.add(rib);

    // Pillar.
    const pillar = cylinderBetween(new THREE.Vector3(-0.7, 0.02, 0), new THREE.Vector3(-0.68, 1.3, 0), 0.035, mats.maple, 16);
    pillar.castShadow = true;
    this.add(pillar);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 20, 16), mats.maple);
    cap.position.set(-0.68, 1.31, 0);
    this.add(cap);
    // Neck.
    const neck = new THREE.Mesh(new THREE.TubeGeometry(this.neckCurve, 40, 0.04, 12, false), mats.maple);
    neck.castShadow = true;
    this.add(neck);
    // Base and feet.
    const base = box(0.95, 0.04, 0.22, mats.walnut, -0.33, 0.04, 0);
    base.castShadow = true;
    this.add(base);
    for (const x of [-0.72, 0.05]) {
      for (const z of [-0.09, 0.09]) this.add(box(0.06, 0.04, 0.04, mats.walnut, x, 0.02, z));
    }
  }

  buildStrings(mats) {
    const n = 22;
    const pinGeos = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const bottom = new THREE.Vector3().lerpVectors(this.sb0, this.sb1, t * 0.96);
      const top = this.neckCurve.getPoint(t * 0.97);
      bottom.z = top.z = 0;
      const octave = Math.floor(i / 7);
      const degree = i % 7;
      const midi = 48 + octave * 12 + SCALE[degree];
      const mat = degree === 0 ? mats.harpStringC : degree === 3 ? mats.harpStringF : mats.harpString;
      const mesh = cylinderBetween(bottom, top, 0.0014 - t * 0.0005, mat, 5);
      this.add(mesh);
      const pin = new THREE.CylinderGeometry(0.004, 0.004, 0.02, 8);
      pin.rotateX(Math.PI / 2);
      pin.translate(top.x, top.y, top.z + 0.03);
      pinGeos.push(pin);
      this.strings.push({ i, midi, a: bottom, b: top, mesh, lastPluck: -1, flash: 0 });
    }
    this.add(new THREE.Mesh(mergeGeometries(pinGeos), mats.brass));
  }

  // Signed side of the string line within the plane, and the parameter along it.
  side(s, x, y) {
    const ax = s.a.x, ay = s.a.y;
    const dx = s.b.x - ax, dy = s.b.y - ay;
    const len2 = dx * dx + dy * dy;
    const u = ((x - ax) * dx + (y - ay) * dy) / len2;
    const cross = dx * (y - ay) - dy * (x - ax);
    return { u, dist: cross / Math.sqrt(len2) };
  }

  pluck(s, vel) {
    const now = performance.now();
    if (now - s.lastPluck < 70) return;
    s.lastPluck = now;
    this.audio.pluck('harp', s.midi, vel);
    if (this.recorder) this.recorder.add({ type: 'harp', i: s.i, vel });
    s.flash = 1;
  }

  playbackPluck(i, vel) {
    const s = this.strings[i];
    if (s) this.pluck(s, vel);
  }

  update(pointers, dt) {
    for (const p of pointers) {
      if (!p.active || !p.wasActive) continue;
      _tip.copy(p.tip);
      this.worldToLocal(_tip);
      if (Math.abs(_tip.z) > 0.08 || _tip.y < 0.1 || _tip.y > 1.5 || _tip.x < -0.75 || _tip.x > 0.12) continue;
      _prev.copy(p.prev);
      this.worldToLocal(_prev);
      _d.set(_tip.x - _prev.x, _tip.y - _prev.y);
      const vIn = _d.length() / Math.max(dt, 1e-3);
      const vZ = Math.abs(_tip.z - _prev.z) / Math.max(dt, 1e-3);
      for (const s of this.strings) {
        const now = this.side(s, _tip.x, _tip.y);
        if (now.u < 0.02 || now.u > 0.98) continue;
        const before = this.side(s, _prev.x, _prev.y);
        // Through the plane right next to the string, or across the string within the plane.
        const through = _prev.z * _tip.z < 0 && Math.abs(now.dist) < 0.012;
        const across = Math.abs(_tip.z) < 0.03 && before.dist * now.dist < 0 && Math.abs(before.dist) < 0.1;
        if (through) this.pluck(s, clamp((vZ - 0.03) / 1.2, 0.2, 1));
        else if (across) this.pluck(s, clamp((vIn - 0.03) / 1.2, 0.2, 1));
      }
    }
    for (const s of this.strings) {
      if (s.flash <= 0) continue;
      s.flash = Math.max(0, s.flash - dt * 3);
      const w = 1 + s.flash * 3;
      s.mesh.scale.set(w, 1, w);
    }
  }

  // Report a capsule along the nearest string when a fingertip is close to the string plane.
  hover(pointers, glow) {
    for (const p of pointers) {
      if (!p.active) continue;
      _tip.copy(p.tip);
      this.worldToLocal(_tip);
      if (Math.abs(_tip.z) > 0.07 || _tip.y < 0.1 || _tip.y > 1.5 || _tip.x < -0.75 || _tip.x > 0.12) continue;
      let best = null, bd = 0.02, bu = 0;
      for (const s of this.strings) {
        const r = this.side(s, _tip.x, _tip.y);
        if (r.u < 0.02 || r.u > 0.98) continue;
        const d = Math.abs(r.dist);
        if (d < bd) {
          bd = d;
          best = s;
          bu = r.u;
        }
      }
      if (!best) continue;
      const pos = new THREE.Vector3().lerpVectors(best.a, best.b, bu);
      this.localToWorld(pos);
      this.getWorldQuaternion(_q);
      const axis = new THREE.Vector3().subVectors(best.b, best.a).normalize().applyQuaternion(_q);
      glow.add({ pos, length: 0.14, width: 0.014, axis, normal: new THREE.Vector3(0, 0, 1).applyQuaternion(_q), strength: 1 - Math.max(Math.abs(_tip.z) / 0.07, bd / 0.02) });
    }
  }

  desktopDown(hit) {
    _tip.copy(hit.point);
    this.worldToLocal(_tip);
    let best = null, bd = Infinity;
    for (const s of this.strings) {
      const r = this.side(s, _tip.x, _tip.y);
      if (r.u < 0 || r.u > 1) continue;
      const d = Math.abs(r.dist);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best && bd < 0.02) this.pluck(best, 0.7);
  }
}
