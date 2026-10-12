import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box } from './materials.js';
import { labelTexture } from './textures.js';

const _tip = new THREE.Vector3();

// A reel-to-reel deck with REC, PLAY and STOP buttons. Reels turn while recording or playing,
// and the lamp glows red while recording, green while playing.
export class TapeDeck extends THREE.Group {
  constructor(recorder, mats) {
    super();
    this.recorder = recorder;
    this.buttons = [];
    this.hitMeshes = [];
    this.reelAngle = 0;

    const body = box(0.26, 0.07, 0.2, mats.nickel, 0, 0.035, 0);
    body.castShadow = true;
    this.add(body);
    const top = box(0.25, 0.004, 0.19, mats.ebony, 0, 0.072, 0);
    this.add(top);
    for (const sx of [-1, 1]) this.add(box(0.01, 0.07, 0.2, mats.walnutGloss, sx * 0.135, 0.035, 0));

    this.reels = [];
    for (const x of [-0.065, 0.065]) {
      const reel = new THREE.Group();
      reel.position.set(x, 0.078, -0.035);
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.008, 40), mats.rubber);
      reel.add(tape);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.014, 20), mats.pearl);
      hub.position.y = 0.004;
      reel.add(hub);
      const spokes = [];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.BoxGeometry(0.1, 0.004, 0.008);
        g.rotateY((i / 3) * Math.PI);
        g.translate(0, 0.008, 0);
        spokes.push(g);
      }
      reel.add(new THREE.Mesh(mergeGeometries(spokes), mats.chrome));
      this.add(reel);
      this.reels.push(reel);
    }
    this.add(box(0.08, 0.006, 0.01, mats.chrome, 0, 0.076, -0.085));

    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x332222, emissive: 0x000000, emissiveIntensity: 1, roughness: 0.4 });
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.008, 16, 12), this.lampMat);
    lamp.position.set(0.1, 0.08, 0.055);
    this.add(lamp);

    const defs = [
      { id: 'rec', label: 'REC', color: 0xb31b1b, x: -0.07 },
      { id: 'play', label: 'PLAY', color: 0x2b8a3e, x: 0 },
      { id: 'stop', label: 'STOP', color: 0x2a2a2e, x: 0.07 },
    ];
    for (const d of defs) {
      const mat = new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.5 });
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.014, 24), mat);
      peg.position.set(d.x, 0.081, 0.055);
      peg.castShadow = true;
      this.add(peg);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.04, 0.012),
        new THREE.MeshBasicMaterial({ map: labelTexture(d.label, { color: '#e8e0d0', font: 'bold 64px system-ui, sans-serif' }), transparent: true })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(d.x, 0.0745, 0.082);
      this.add(label);
      const b = { id: d.id, peg, x: d.x, z: 0.055, depth: 0, held: new Set() };
      peg.userData.button = b;
      this.buttons.push(b);
      this.hitMeshes.push(peg);
    }
  }

  press(id) {
    const r = this.recorder;
    if (id === 'rec') r.record();
    else if (id === 'play') r.play();
    else r.stop();
  }

  update(pointers, dt) {
    for (const b of this.buttons) {
      for (const p of pointers) {
        if (!p.active || !p.wasActive) continue;
        _tip.copy(p.tip);
        this.worldToLocal(_tip);
        const dx = _tip.x - b.x, dz = _tip.z - b.z;
        const inside = dx * dx + dz * dz < 0.018 * 0.018 && _tip.y < 0.095 && _tip.y > 0.06;
        if (inside) {
          if (!b.held.has(p.id)) {
            b.held.add(p.id);
            this.press(b.id);
          }
        } else b.held.delete(p.id);
      }
      const latched = (b.id === 'rec' && this.recorder.state === 'recording') || (b.id === 'play' && this.recorder.state === 'playing');
      const target = b.held.size || latched ? 1 : 0;
      b.depth += (target - b.depth) * Math.min(1, dt * 18);
      b.peg.position.y = 0.081 - b.depth * 0.005;
    }
    const s = this.recorder.state;
    if (s !== 'idle') {
      this.reelAngle += dt * (s === 'recording' ? 3 : 4);
      for (const reel of this.reels) reel.rotation.y = this.reelAngle;
    }
    const glow = s === 'recording' ? 0xff2a2a : s === 'playing' ? 0x2aff5a : 0x000000;
    this.lampMat.emissive.setHex(glow);
    this.lampMat.color.setHex(s === 'idle' ? 0x332222 : glow);
  }

  desktopDown(hit) {
    const b = hit.object.userData.button;
    if (b) this.press(b.id);
  }
}
