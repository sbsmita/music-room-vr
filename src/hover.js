import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Fingertip affordance: soft glows that appear on the key, drum head, string or button a
// fingertip is about to touch, since hands can't feel a virtual surface. Instruments report
// hover targets each frame; this draws them from a small pool of additive planes.
export class HoverGlow {
  constructor(scene, size = 16) {
    this.pool = [];
    this.specs = [];
    const geo = new THREE.PlaneGeometry(1, 1);
    const tex = softDotTexture();
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xffc46a,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      m.renderOrder = 5;
      m.frustumCulled = false;
      scene.add(m);
      this.pool.push(m);
    }
    this.time = 0;
  }

  // spec: { pos: Vector3 (world), length, width, axis?: Vector3 (world), normal: Vector3 (world), strength: 0..1 }
  add(spec) {
    if (this.specs.length < this.pool.length) this.specs.push(spec);
  }

  update(dt) {
    this.time += dt;
    const pulse = 0.9 + 0.1 * Math.sin(this.time * 7);
    for (let i = 0; i < this.pool.length; i++) {
      const m = this.pool[i];
      const s = this.specs[i];
      if (!s) {
        m.visible = false;
        continue;
      }
      m.visible = true;
      m.position.copy(s.pos);
      _z.copy(s.normal).normalize();
      if (s.axis) _x.copy(s.axis).addScaledVector(_z, -s.axis.dot(_z)).normalize();
      else {
        _x.set(1, 0, 0);
        if (Math.abs(_x.dot(_z)) > 0.9) _x.set(0, 0, 1);
        _x.addScaledVector(_z, -_x.dot(_z)).normalize();
      }
      _y.crossVectors(_z, _x);
      _m.makeBasis(_x, _y, _z);
      m.quaternion.setFromRotationMatrix(_m);
      m.position.addScaledVector(_z, 0.002);
      m.scale.set(s.length, s.width, 1);
      m.material.opacity = (0.2 + 0.6 * Math.min(1, Math.max(0, s.strength))) * pulse;
    }
    this.specs.length = 0;
  }
}
