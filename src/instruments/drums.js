import * as THREE from 'three';
import { cylinderBetween } from '../materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _tip = new THREE.Vector3();
const _prev = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Five-piece kit with hi-hat, crash and ride. Each piece's group has its strike surface on the
// local y=0 plane, so a fingertip crossing that plane downward is a hit.
export class Drums extends THREE.Group {
  constructor(audio, mats) {
    super();
    this.audio = audio;
    this.mats = mats;
    this.pieces = [];
    this.hitMeshes = [];
    this.time = 0;
    this.recorder = null;

    this.addDrum('snare', 0.18, 0.14, [0, 0.74, -0.42], 0.1, mats.pearl);
    this.addDrum('tom1', 0.15, 0.2, [0.1, 0.92, -0.72], 0.4, mats.shell);
    this.addDrum('tom2', 0.165, 0.22, [0.43, 0.9, -0.66], 0.4, mats.shell);
    this.addDrum('floor', 0.2, 0.36, [0.55, 0.64, -0.26], 0.05, mats.shell);
    this.addKick(0.28, 0.4, [0.26, 0.29, -0.52]);
    this.addKickPad([-0.22, 0.6, -0.26]);
    this.addCymbal('hat', 0.17, [-0.35, 0.92, -0.5], 0.12, true);
    this.addCymbal('crash', 0.21, [-0.3, 1.32, -0.95], 0.35);
    this.addCymbal('ride', 0.26, [0.72, 1.18, -0.86], 0.3);
  }

  // Pole plus tripod legs, merged into a single chrome mesh.
  stand(top, legs = true) {
    const m = this.mats;
    const base = new THREE.Vector3(top.x, 0, top.z);
    const parts = [cylinderBetween(base, top, 0.011, m.chrome, 10)];
    if (legs) {
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + 0.4;
        const foot = new THREE.Vector3(top.x + Math.cos(a) * 0.3, 0.01, top.z + Math.sin(a) * 0.3);
        const hip = new THREE.Vector3(top.x, 0.32, top.z);
        parts.push(cylinderBetween(hip, foot, 0.007, m.chrome, 6));
      }
    }
    const geos = parts.map((p) => {
      p.updateMatrix();
      return p.geometry.applyMatrix4(p.matrix);
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), m.chrome);
    mesh.castShadow = true;
    this.add(mesh);
  }

  shellGroup(r, depth, shellMat, head) {
    const m = this.mats;
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, depth, 48, 1, true), shellMat);
    shell.position.y = -depth / 2;
    shell.castShadow = true;
    g.add(shell);
    const top = new THREE.Mesh(new THREE.CircleGeometry(r, 48), head);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.001;
    g.add(top);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(r, 48), m.drumHeadClear);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -depth - 0.001;
    g.add(bottom);
    const chromeGeos = [];
    for (const y of [0, -depth]) {
      const rim = new THREE.TorusGeometry(r + 0.006, 0.007, 10, 64);
      rim.rotateX(Math.PI / 2);
      rim.translate(0, y, 0);
      chromeGeos.push(rim);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const lug = new THREE.BoxGeometry(0.018, 0.05, 0.014);
      lug.rotateY(-a);
      lug.translate(Math.cos(a) * (r + 0.012), -depth / 2, Math.sin(a) * (r + 0.012));
      chromeGeos.push(lug);
    }
    g.add(new THREE.Mesh(mergeGeometries(chromeGeos), m.chrome));
    return { g, top };
  }

  addDrum(kind, r, depth, pos, tilt, shellMat) {
    const { g, top } = this.shellGroup(r, depth, shellMat, this.mats.drumHead);
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.x = tilt;
    this.add(g);
    top.userData.piece = this.registerPiece(kind, g, r, 'drum');
    this.hitMeshes.push(top);
    this.stand(new THREE.Vector3(pos[0], pos[1] - depth * 0.6, pos[2]));
  }

  // Hands can't reach a foot pedal, so the kick also lives on a pad at hand height beside the snare.
  addKickPad(pos) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.x = 0.25;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 32), m.rubber);
    pad.position.y = -0.015;
    pad.castShadow = true;
    g.add(pad);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.008, 8, 40), m.chrome);
    rim.rotation.x = Math.PI / 2;
    g.add(rim);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.095, 32), m.rubber);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.001;
    g.add(top);
    this.add(g);
    top.userData.piece = this.registerPiece('kick', g, 0.1, 'drum');
    top.userData.piece.pad = true;
    this.hitMeshes.push(top);
    this.stand(new THREE.Vector3(pos[0], pos[1] - 0.04, pos[2]));
  }

  addKick(r, depth, pos) {
    const { g, top } = this.shellGroup(r, depth, this.mats.shell, this.mats.drumHead);
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.x = Math.PI / 2; // batter head faces the player
    this.add(g);
    top.userData.piece = this.registerPiece('kick', g, r, 'drum');
    this.hitMeshes.push(top);
    // Spurs and a decorative pedal.
    for (const sx of [-1, 1]) {
      const a = new THREE.Vector3(pos[0] + sx * (r - 0.03), 0.06, pos[2] - depth * 0.5);
      const b = new THREE.Vector3(pos[0] + sx * (r + 0.12), 0.0, pos[2] - depth * 0.5 - 0.05);
      this.add(cylinderBetween(a, b, 0.008, this.mats.chrome, 6));
    }
    const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.012, 0.22), this.mats.chrome);
    pedal.position.set(pos[0], 0.02, pos[2] + 0.16);
    pedal.rotation.x = -0.25;
    this.add(pedal);
  }

  addCymbal(kind, r, pos, tilt, hihat = false) {
    const m = this.mats;
    const g = new THREE.Group();
    const profile = [
      new THREE.Vector2(0.004, 0.0),
      new THREE.Vector2(0.03, 0.016),
      new THREE.Vector2(0.06, 0.012),
      new THREE.Vector2(r * 0.6, 0.006),
      new THREE.Vector2(r, 0.0),
      new THREE.Vector2(r, -0.0015),
      new THREE.Vector2(0.004, -0.0015),
    ];
    const cym = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), m.cymbal);
    cym.castShadow = true;
    g.add(cym);
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.02, 12), m.chrome);
    nut.position.y = 0.022;
    g.add(nut);
    if (hihat) {
      const lower = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), m.cymbal);
      lower.rotation.x = Math.PI;
      lower.position.y = -0.02;
      g.add(lower);
    }
    g.position.set(pos[0], pos[1], pos[2]);
    g.rotation.x = tilt;
    this.add(g);
    const piece = this.registerPiece(kind, g, r, 'cymbal');
    piece.mesh = cym;
    cym.userData.piece = piece;
    this.hitMeshes.push(cym);
    this.stand(new THREE.Vector3(pos[0], pos[1] - 0.03, pos[2]));
  }

  registerPiece(kind, group, r, type) {
    const piece = { kind, group, r, type, flash: 0, wobble: 0, wobblePhase: 0, lastHit: -1 };
    this.pieces.push(piece);
    return piece;
  }

  hit(piece, vel, p = null) {
    const now = performance.now();
    // A short per-piece window collapses same-stroke duplicates; a longer one per pointer stops
    // one hand retriggering, while still letting the other hand or stick play a flam or a roll.
    if (now - piece.lastHit < 12) return;
    if (p) {
      const key = 'hit:' + piece.kind;
      const last = p.state.get(key) || -1;
      if (now - last < 45) return;
      p.state.set(key, now);
    }
    piece.lastHit = now;
    this.audio.drum(piece.kind, vel);
    if (this.recorder) this.recorder.add({ type: 'drum', kind: piece.kind, vel });
    piece.flash = 1;
    if (piece.type === 'cymbal') {
      piece.wobble = Math.min(1, piece.wobble + 0.5 + vel * 0.6);
      piece.wobblePhase = 0;
    }
  }

  update(pointers, dt) {
    this.time += dt;
    for (const piece of this.pieces) {
      for (const p of pointers) {
        if (!p.active || !p.wasActive) continue;
        // A stick's shoulder only strikes cymbals.
        if (p.shoulder && piece.type !== 'cymbal') continue;
        _tip.copy(p.tip);
        piece.group.worldToLocal(_tip);
        _prev.copy(p.prev);
        piece.group.worldToLocal(_prev);
        // Re-arm only once the pointer has risen clearly above the head, so jitter while parked
        // just below the surface cannot retrigger.
        const armKey = 'arm:' + piece.kind;
        if (_tip.y > 0.02 || _prev.y > 0.02) p.state.set(armKey, true);
        if (!(_prev.y > 0 && _tip.y <= 0) || _prev.y > 0.35) continue;
        if (p.state.get(armKey) === false) continue;
        // Test where the path crossed the head, not where it ended, so fast strokes count.
        const t = _prev.y / (_prev.y - _tip.y);
        const cx = _prev.x + (_tip.x - _prev.x) * t, cz = _prev.z + (_tip.z - _prev.z) * t;
        if (cx * cx + cz * cz > piece.r * piece.r) continue;
        const vy = (_prev.y - _tip.y) / Math.max(dt, 1e-3);
        // Sticks move faster than fingertips and need headroom: taps soft, full strokes loud.
        const v0 = p.stick ? 0.6 : 0.2;
        if (vy < v0) continue;
        const vel = p.stick ? clamp(Math.sqrt((vy - v0) / 6.4), 0.12, 1) : clamp((vy - v0) / 2.4, 0.15, 1);
        p.state.set(armKey, false);
        this.hit(piece, vel, p);
      }
      piece.flash = Math.max(0, piece.flash - dt * 6);
      if (piece.type === 'cymbal') {
        piece.wobblePhase += dt * 28;
        piece.wobble *= Math.exp(-dt * 1.6);
        const w = piece.wobble * 0.07;
        piece.mesh.rotation.set(Math.sin(piece.wobblePhase) * w, 0, Math.cos(piece.wobblePhase * 0.9) * w);
      } else {
        piece.group.scale.setScalar(1 + piece.flash * 0.015);
      }
    }
  }

  desktopDown(hit) {
    const piece = hit.object.userData.piece;
    if (piece) this.hit(piece, 0.75);
  }

  // Report a disc on the head or cymbal a fingertip is hovering above.
  hover(pointers, glow) {
    const HOVER = 0.1;
    for (const piece of this.pieces) {
      for (const p of pointers) {
        if (!p.active) continue;
        _tip.copy(p.tip);
        piece.group.worldToLocal(_tip);
        if (_tip.y < -0.005 || _tip.y > HOVER) continue;
        const rr = Math.hypot(_tip.x, _tip.z);
        if (rr > piece.r + 0.02) continue;
        const k = rr > piece.r - 0.03 ? (piece.r - 0.03) / rr : 1;
        const pos = new THREE.Vector3(_tip.x * k, 0.002, _tip.z * k);
        piece.group.localToWorld(pos);
        const normal = new THREE.Vector3(0, 1, 0).applyQuaternion(piece.group.getWorldQuaternion(_q));
        glow.add({ pos, length: 0.09, width: 0.09, axis: null, normal, strength: 1 - _tip.y / HOVER });
      }
    }
  }

  playbackHit(kind, vel) {
    const piece = this.pieces.find((x) => x.kind === kind);
    if (piece) this.hit(piece, vel);
  }
}
