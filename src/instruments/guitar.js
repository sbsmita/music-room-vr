import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cylinderBetween, box } from '../materials.js';
import { labelTexture } from '../textures.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _tip = new THREE.Vector3();
const _prev = new THREE.Vector3();

export const CHORDS = [
  { name: 'G', notes: [43, 47, 50, 55, 59, 67] },
  { name: 'C', notes: [null, 48, 52, 55, 60, 64] },
  { name: 'D', notes: [null, null, 50, 57, 62, 66] },
  { name: 'Em', notes: [40, 47, 52, 55, 59, 64] },
  { name: 'Am', notes: [null, 45, 52, 57, 60, 64] },
  { name: 'E', notes: [40, 47, 56, 59, 64, 68] },
];

// Acoustic guitar. Local frame: +x runs along the strings toward the headstock, y spans across
// the strings (low E at +y), +z is the soundboard normal. Strum by sweeping a fingertip across
// the strings over the sound hole; pick the chord on the board next to it.
export class Guitar extends THREE.Group {
  constructor(audio, mats) {
    super();
    this.audio = audio;
    this.mats = mats;
    this.chord = CHORDS[0];
    this.recorder = null;
    this.strings = [];
    this.hitMeshes = [];
    this.stringZ = 0.063;
    this.strumX = [-0.11, 0.1];
    this.buildBody(mats);
    this.buildNeck(mats);
    this.buildStrings(mats);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
    plane.position.set(0, 0, this.stringZ);
    plane.userData.strum = true;
    this.add(plane);
    this.hitMeshes.push(plane);
    this.dragMesh = plane;
  }

  buildBody(mats) {
    const s = new THREE.Shape();
    s.moveTo(-0.25, 0);
    s.bezierCurveTo(-0.25, 0.15, -0.19, 0.2, -0.09, 0.2);
    s.bezierCurveTo(-0.01, 0.2, -0.02, 0.125, 0.03, 0.125);
    s.bezierCurveTo(0.09, 0.125, 0.11, 0.155, 0.17, 0.155);
    s.bezierCurveTo(0.24, 0.155, 0.25, 0.08, 0.25, 0);
    s.bezierCurveTo(0.25, -0.08, 0.24, -0.155, 0.17, -0.155);
    s.bezierCurveTo(0.11, -0.155, 0.09, -0.125, 0.03, -0.125);
    s.bezierCurveTo(-0.02, -0.125, -0.01, -0.2, -0.09, -0.2);
    s.bezierCurveTo(-0.19, -0.2, -0.25, -0.15, -0.25, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelSize: 0.005, bevelThickness: 0.005, bevelSegments: 2, curveSegments: 28 });
    geo.translate(0, 0, -0.05);
    const body = new THREE.Mesh(geo, [mats.spruce, mats.rosewood]);
    body.castShadow = true;
    this.add(body);

    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.048, 40), mats.hole);
    hole.position.set(-0.02, 0, 0.0556);
    this.add(hole);
    const rosette = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.062, 48), mats.ebony);
    rosette.position.set(-0.02, 0, 0.0557);
    this.add(rosette);
    const bridge = box(0.03, 0.15, 0.008, mats.ebony, -0.125, 0, 0.059);
    this.add(bridge);
    const saddle = box(0.003, 0.08, 0.006, mats.ivory, -0.118, 0, 0.064);
    this.add(saddle);
    for (let i = 0; i < 6; i++) {
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.006, 8), mats.ivory);
      pin.rotation.x = Math.PI / 2;
      pin.position.set(-0.133, (i - 2.5) * 0.011, 0.065);
      this.add(pin);
    }
  }

  buildNeck(mats) {
    const nutX = 0.528;
    const neck = box(0.33, 0.047, 0.024, mats.walnut, 0.2 + 0.165, 0, 0.051 - 0.012);
    neck.castShadow = true;
    this.add(neck);
    const fb = box(0.48, 0.047, 0.007, mats.ebony, 0.05 + 0.24, 0, 0.0545);
    this.add(fb);
    const nut = box(0.005, 0.047, 0.007, mats.ivory, nutX, 0, 0.0585);
    this.add(nut);
    const frets = [];
    const scale = 0.648;
    for (let n = 1; n <= 19; n++) {
      const x = nutX - scale * (1 - Math.pow(2, -n / 12));
      const g = new THREE.CylinderGeometry(0.0009, 0.0009, 0.047, 6, 1);
      g.translate(x, 0, 0.0585);
      frets.push(g);
    }
    const fretMesh = new THREE.Mesh(mergeGeometries(frets), mats.nickel);
    this.add(fretMesh);
    const dotGeos = [];
    const fretX = (n) => nutX - scale * (1 - Math.pow(2, -n / 12));
    for (const n of [3, 5, 7, 9, 15, 17]) {
      const g = new THREE.CircleGeometry(0.003, 12);
      g.translate((fretX(n) + fretX(n - 1)) / 2, 0, 0.0582);
      dotGeos.push(g);
    }
    for (const y of [-0.012, 0.012]) {
      const g = new THREE.CircleGeometry(0.003, 12);
      g.translate((fretX(12) + fretX(11)) / 2, y, 0.0582);
      dotGeos.push(g);
    }
    this.add(new THREE.Mesh(mergeGeometries(dotGeos), mats.pearl));
    // Headstock tilted back with six tuners.
    const head = new THREE.Group();
    head.position.set(nutX, 0, 0.05);
    head.rotation.y = 0.23;
    const plate = box(0.17, 0.075, 0.014, mats.walnut, 0.085, 0, 0);
    plate.castShadow = true;
    head.add(plate);
    const veneer = box(0.165, 0.07, 0.002, mats.ebony, 0.085, 0, 0.008);
    head.add(veneer);
    for (let i = 0; i < 6; i++) {
      const side = i < 3 ? 1 : -1;
      const x = 0.045 + (i % 3) * 0.045;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.016, 8), mats.chrome);
      post.rotation.x = Math.PI / 2;
      post.position.set(x, side * 0.02, 0.014);
      head.add(post);
      const button = box(0.012, 0.006, 0.02, mats.pearl, x, side * 0.046, 0.0);
      head.add(button);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.014, 6), mats.chrome);
      shaft.position.set(x, side * 0.0375, 0.0);
      head.add(shaft);
    }
    this.add(head);
  }

  buildStrings(mats) {
    const radii = [0.0011, 0.00095, 0.0008, 0.0006, 0.00048, 0.0004];
    for (let i = 0; i < 6; i++) {
      const yb = (i - 2.5) * 0.0112;
      const yn = (i - 2.5) * 0.0076;
      const a = new THREE.Vector3(-0.13, yb, this.stringZ);
      const b = new THREE.Vector3(0.53, yn, this.stringZ + 0.001);
      const m = cylinderBetween(a, b, radii[i], i < 3 ? mats.bronze : mats.steel, 6);
      this.add(m);
      this.strings.push({ index: i, yb, yn, mesh: m, lastPluck: -1, flash: 0 });
    }
  }

  stringY(s, x) {
    const t = (x + 0.13) / 0.66;
    return s.yb + (s.yn - s.yb) * t;
  }

  pluckString(s, vel) {
    const now = performance.now();
    if (now - s.lastPluck < 60) return;
    s.lastPluck = now;
    const midi = this.chord.notes[s.index];
    if (midi === null) return;
    this.audio.pluck('guitar', midi, vel);
    if (this.recorder) this.recorder.add({ type: 'guitar', index: s.index, midi, vel });
    s.flash = 1;
  }

  playbackPluck(index, midi, vel) {
    const s = this.strings[index];
    if (!s) return;
    s.lastPluck = performance.now();
    this.audio.pluck('guitar', midi, vel);
    s.flash = 1;
  }

  setChord(chord) {
    this.chord = chord;
    if (this.board) this.board.select(chord);
  }

  update(pointers, dt) {
    for (const p of pointers) {
      if (!p.active || !p.wasActive) continue;
      _tip.copy(p.tip);
      this.worldToLocal(_tip);
      if (_tip.x < this.strumX[0] || _tip.x > this.strumX[1]) continue;
      if (Math.abs(_tip.z - this.stringZ) > 0.035 || _tip.z < 0.03) continue;
      _prev.copy(p.prev);
      this.worldToLocal(_prev);
      const vy = Math.abs(_tip.y - _prev.y) / Math.max(dt, 1e-3);
      for (const s of this.strings) {
        const y = this.stringY(s, _tip.x);
        if ((_prev.y - y) * (_tip.y - y) < 0) this.pluckString(s, clamp((vy - 0.03) / 1.4, 0.2, 1));
      }
    }
    for (const s of this.strings) {
      if (s.flash <= 0) continue;
      s.flash = Math.max(0, s.flash - dt * 4);
      const w = 1 + s.flash * 2.5;
      s.mesh.scale.set(w, 1, w);
    }
  }

  desktopDown(hit, p) {
    _tip.copy(hit.point);
    this.worldToLocal(_tip);
    let best = null, bd = Infinity;
    for (const s of this.strings) {
      const d = Math.abs(this.stringY(s, _tip.x) - _tip.y);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    if (best && bd < 0.012) this.pluckString(best, 0.7);
  }
}

// Six wooden chord pegs on a small plate. Touching one from above (or clicking) selects the chord.
export class ChordBoard extends THREE.Group {
  constructor(guitar, mats) {
    super();
    this.guitar = guitar;
    guitar.board = this;
    this.buttons = [];
    this.hitMeshes = [];
    const plate = box(0.3, 0.012, 0.1, mats.walnutGloss);
    plate.castShadow = true;
    this.add(plate);
    const ring = new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9a3c, emissiveIntensity: 0.0, roughness: 0.6 });
    CHORDS.forEach((chord, i) => {
      const x = (i - 2.5) * 0.048;
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.021, 0.02, 24), mats.maple);
      peg.position.set(x, 0.016, 0);
      peg.castShadow = true;
      this.add(peg);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.022, 0.026, 32), ring.clone());
      halo.rotation.x = -Math.PI / 2;
      halo.position.set(x, 0.0065, 0);
      this.add(halo);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.036, 0.018),
        new THREE.MeshBasicMaterial({ map: labelTexture(chord.name, { color: '#2b1a0c' }), transparent: true })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(x, 0.0266, 0);
      this.add(label);
      const b = { chord, peg, halo, x, depth: 0, held: new Set() };
      peg.userData.button = b;
      this.buttons.push(b);
      this.hitMeshes.push(peg);
    });
    this.select(guitar.chord);
  }

  select(chord) {
    for (const b of this.buttons) b.halo.material.emissiveIntensity = b.chord === chord ? 1.2 : 0;
  }

  update(pointers, dt) {
    for (const b of this.buttons) {
      for (const p of pointers) {
        if (!p.active || !p.wasActive) continue;
        _tip.copy(p.tip);
        this.worldToLocal(_tip);
        const dx = _tip.x - b.x, dz = _tip.z;
        const inside = dx * dx + dz * dz < 0.023 * 0.023;
        if (inside && _tip.y < 0.03 && _tip.y > -0.01) {
          if (!b.held.has(p.id)) {
            b.held.add(p.id);
            this.guitar.setChord(b.chord);
          }
        } else b.held.delete(p.id);
      }
      const target = b.held.size ? 1 : 0;
      b.depth += (target - b.depth) * Math.min(1, dt * 18);
      b.peg.position.y = 0.016 - b.depth * 0.006;
    }
  }

  desktopDown(hit) {
    const b = hit.object.userData.button;
    if (b) this.guitar.setChord(b.chord);
  }
}
