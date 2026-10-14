import * as THREE from 'three';
import { box } from './materials.js';
import { labelTexture } from './textures.js';

const _tip = new THREE.Vector3();
const _q = new THREE.Quaternion();

// Three brass toggle switches on a wooden plate: FIRE, WIND and RAIN ambience on/off.
export class AmbiencePanel extends THREE.Group {
  constructor(audio, mats) {
    super();
    this.audio = audio;
    this.toggles = [];
    this.hitMeshes = [];
    const plate = box(0.24, 0.012, 0.09, mats.walnutGloss);
    plate.castShadow = true;
    this.add(plate);
    this.onToggle = null;
    const defs = [
      { id: 'fire', label: 'FIRE', x: -0.075, on: false },
      { id: 'wind', label: 'WIND', x: 0, on: false },
      { id: 'rain', label: 'RAIN', x: 0.075, on: false },
    ];
    for (const d of defs) {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, 0.008, 20), mats.brass);
      base.position.set(d.x, 0.01, 0.0);
      this.add(base);
      const lever = new THREE.Group();
      lever.position.set(d.x, 0.014, 0.0);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, 0.03, 10), mats.brass);
      stick.position.y = 0.015;
      lever.add(stick);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.006, 12, 10), mats.brass);
      knob.position.y = 0.03;
      lever.add(knob);
      this.add(lever);
      const ledMat = new THREE.MeshStandardMaterial({ color: 0x331a0a, emissive: 0xff8a2a, emissiveIntensity: 0, roughness: 0.4 });
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), ledMat);
      led.position.set(d.x, 0.012, 0.03);
      this.add(led);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.04, 0.012),
        new THREE.MeshBasicMaterial({ map: labelTexture(d.label, { color: '#e8dcc4', font: 'bold 64px system-ui, sans-serif' }), transparent: true })
      );
      label.rotation.x = -Math.PI / 2;
      label.position.set(d.x, 0.0065, -0.03);
      this.add(label);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(d.x, 0.03, 0);
      this.add(hit);
      const t = { id: d.id, on: d.on, lever, ledMat, x: d.x, held: new Set(), hit };
      hit.userData.toggle = t;
      this.toggles.push(t);
      this.hitMeshes.push(hit);
      this.apply(t, false);
    }
  }

  get fire() {
    return this.toggles[0].on;
  }
  get wind() {
    return this.toggles[1].on;
  }
  get rain() {
    return this.toggles[2].on;
  }

  apply(t, sound = true) {
    t.lever.rotation.x = t.on ? -0.55 : 0.55;
    t.ledMat.emissiveIntensity = t.on ? 1.4 : 0;
    if (sound) {
      if (t.id === 'fire') this.audio.setFire(t.on);
      else if (t.id === 'wind') this.audio.setWind(t.on);
      else this.audio.setRain(t.on);
    }
    if (this.onToggle) this.onToggle(t.id, t.on);
  }

  // Push the audio engine to the panel's current state (used once audio has started).
  sync() {
    this.audio.setFire(this.fire);
    this.audio.setWind(this.wind);
    this.audio.setRain(this.rain);
  }

  flip(t) {
    t.on = !t.on;
    this.apply(t);
  }

  update(pointers) {
    for (const t of this.toggles) {
      for (const p of pointers) {
        if (!p.active || !p.wasActive) continue;
        _tip.copy(p.tip);
        this.worldToLocal(_tip);
        const dx = _tip.x - t.x, dz = _tip.z;
        const inside = dx * dx + dz * dz < 0.018 * 0.018 && _tip.y < 0.06 && _tip.y > 0.005;
        if (inside) {
          if (!t.held.has(p.id)) {
            t.held.add(p.id);
            this.flip(t);
          }
        } else t.held.delete(p.id);
      }
    }
  }

  desktopDown(hit) {
    const t = hit.object.userData.toggle;
    if (t) this.flip(t);
  }

  hover(pointers, glow) {
    for (const t of this.toggles) {
      for (const p of pointers) {
        if (!p.active) continue;
        _tip.copy(p.tip);
        this.worldToLocal(_tip);
        const h = _tip.y - 0.045;
        if (h < -0.02 || h > 0.06 || Math.hypot(_tip.x - t.x, _tip.z) > 0.025) continue;
        const pos = new THREE.Vector3(t.x, 0.046, 0);
        this.localToWorld(pos);
        glow.add({ pos, length: 0.045, width: 0.045, axis: null, normal: new THREE.Vector3(0, 1, 0).applyQuaternion(this.getWorldQuaternion(_q)), strength: 1 - Math.max(0, h) / 0.06 });
      }
    }
  }
}
