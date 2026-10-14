import * as THREE from 'three';
import { softDotTexture } from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const _c = new THREE.Color();

// Fireworks in the night sky outside the window. Rockets rise from the hills and burst into
// sparks that arc down and fade. One Points mesh holds every particle; sparks fade by dimming
// their colour, which with additive blending reads as transparency.
export class Fireworks {
  constructor({ count = 1400, origin = new THREE.Vector3(), spread = [6, 6], height = [3.5, 6], light = null } = {}) {
    this.count = count;
    this.origin = origin;
    this.spread = spread;
    this.height = height;
    this.light = light;
    this.lightDecay = 0;
    this.nextLaunch = 1.5;
    this.time = 0;
    this.pos = new Float32Array(count * 3);
    this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count); // remaining seconds, <= 0 means free
    this.maxLife = new Float32Array(count);
    this.kind = new Uint8Array(count); // 0 spark, 1 rocket
    this.base = new Float32Array(count * 3); // spark colour
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.boundingSphere = new THREE.Sphere(origin.clone(), 40);
    const mat = new THREE.PointsMaterial({
      size: 0.34,
      map: softDotTexture(),
      vertexColors: true,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.free = [];
    for (let i = count - 1; i >= 0; i--) this.free.push(i);
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, kind) {
    if (!this.free.length) return -1;
    const i = this.free.pop();
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this.base.set([r, g, b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.kind[i] = kind;
    return i;
  }

  launch() {
    const o = this.origin;
    const x = o.x + rand(-this.spread[0], this.spread[0]);
    const z = o.z + rand(-this.spread[1], this.spread[1]);
    const h = rand(this.height[0], this.height[1]);
    // Reach apex at vy = 0 under gravity g: vy0 = sqrt(2 g h).
    const vy = Math.sqrt(2 * 3.2 * h);
    this.spawn(x, o.y, z, rand(-0.3, 0.3), vy, rand(-0.3, 0.3), vy / 3.2, 1.6, 1.3, 0.8, 1);
  }

  burst(i) {
    const x = this.pos[i * 3], y = this.pos[i * 3 + 1], z = this.pos[i * 3 + 2];
    const hue = Math.random();
    _c.setHSL(hue, 0.9, 0.6);
    const two = Math.random() < 0.4;
    const n = 110 + Math.floor(Math.random() * 60);
    const speed = rand(2.6, 3.8);
    const ring = Math.random() < 0.3;
    for (let k = 0; k < n; k++) {
      let dx, dy, dz;
      if (ring) {
        const a = (k / n) * Math.PI * 2;
        dx = Math.cos(a);
        dy = Math.sin(a) * 0.6 + rand(-0.1, 0.1);
        dz = rand(-0.15, 0.15);
      } else {
        const u = Math.random() * 2 - 1, phi = Math.random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        dx = s * Math.cos(phi);
        dy = u;
        dz = s * Math.sin(phi);
      }
      const v = speed * rand(0.7, 1.05);
      if (two && k % 2) _c.setHSL((hue + 0.5) % 1, 0.95, 0.66);
      else _c.setHSL(hue, 0.95, 0.62);
      this.spawn(x, y, z, dx * v, dy * v, dz * v, rand(1.6, 2.8), _c.r * 1.8, _c.g * 1.8, _c.b * 1.8, 0);
    }
    if (this.light) {
      this.light.color.setHSL(hue, 0.7, 0.6);
      this.light.intensity = 7;
      this.lightDecay = 1;
    }
  }

  update(dt) {
    this.time += dt;
    this.nextLaunch -= dt;
    if (this.nextLaunch <= 0) {
      this.launch();
      if (Math.random() < 0.35) this.launch();
      this.nextLaunch = rand(1.2, 3.2);
    }
    const pos = this.pos, vel = this.vel, col = this.col;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const i3 = i * 3;
      if (this.kind[i] === 1) {
        vel[i3 + 1] -= 3.2 * dt;
        pos[i3] += vel[i3] * dt;
        pos[i3 + 1] += vel[i3 + 1] * dt;
        pos[i3 + 2] += vel[i3 + 2] * dt;
        const flick = 0.6 + 0.4 * Math.sin(this.time * 40 + i);
        col[i3] = 1.0 * flick;
        col[i3 + 1] = 0.8 * flick;
        col[i3 + 2] = 0.5 * flick;
        if (this.life[i] <= 0 || vel[i3 + 1] <= 0.2) {
          this.burst(i);
          this.life[i] = 0;
          col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
          this.free.push(i);
        }
        continue;
      }
      vel[i3] *= 1 - 1.4 * dt;
      vel[i3 + 1] = vel[i3 + 1] * (1 - 1.4 * dt) - 2.2 * dt;
      vel[i3 + 2] *= 1 - 1.4 * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      const f = Math.max(0, this.life[i] / this.maxLife[i]);
      const twinkle = f < 0.5 ? 0.6 + 0.4 * Math.sin(this.time * 30 + i * 1.7) : 1;
      const k = Math.pow(f, 0.8) * twinkle;
      col[i3] = this.base[i3] * k;
      col[i3 + 1] = this.base[i3 + 1] * k;
      col[i3 + 2] = this.base[i3 + 2] * k;
      if (this.life[i] <= 0) {
        col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
        this.free.push(i);
      }
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
    if (this.light && this.lightDecay > 0) {
      this.lightDecay = Math.max(0, this.lightDecay - dt * 1.8);
      this.light.intensity = 7 * this.lightDecay;
    }
  }
}
