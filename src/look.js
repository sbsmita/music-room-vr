import * as THREE from 'three';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _p = new THREE.Vector3();

// Desktop first-person look: the camera stays on the bench and turns in place, like a 360 viewer.
// Drag grabs the room and pulls it; the wheel zooms the field of view.
export class LookControls {
  constructor(camera) {
    this.camera = camera;
    this.yaw = 0;
    this.pitch = -0.1;
    this.fov = camera.fov;
    this.sensitivity = 0.0028;
    this.dragging = false;
    this.lastX = 0;
    this.lastY = 0;
  }

  begin(e) {
    this.dragging = true;
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  move(e) {
    if (!this.dragging) return;
    const k = this.sensitivity * (this.fov / 55);
    this.yaw += (e.clientX - this.lastX) * k;
    this.pitch += (e.clientY - this.lastY) * k;
    this.pitch = clamp(this.pitch, -1.45, 1.45);
    this.lastX = e.clientX;
    this.lastY = e.clientY;
  }

  end() {
    this.dragging = false;
  }

  wheel(e) {
    this.fov = clamp(this.fov + e.deltaY * 0.04, 26, 90);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  lookAt(target) {
    this.camera.getWorldPosition(_p);
    const dx = target.x - _p.x, dy = target.y - _p.y, dz = target.z - _p.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = Math.atan2(dy, Math.hypot(dx, dz));
  }

  update() {
    _e.set(this.pitch, this.yaw, 0);
    this.camera.quaternion.setFromEuler(_e);
  }
}
