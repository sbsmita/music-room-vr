import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _up = new THREE.Vector3();
const _side = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _grip = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const STICK_LEN = 0.4;
const GRIP_FROM_BUTT = 0.13;
const TILT = -0.42; // stick angled down from the hand's forward direction, radians

// A pair of drumsticks resting on the snare. Pinch near a grip to pick one up: it sits in the
// fist pointing forward and a little down, follows the hand, and its tip becomes a pointer the
// drums respond to. Releasing the pinch slides it back to the snare.
export class Sticks {
  constructor({ drums, input, scene, mats }) {
    this.drums = drums;
    this.input = input;
    this.scene = scene;
    this.sticks = [];
    const mat = new THREE.MeshStandardMaterial({ color: 0xd9b88a, roughness: 0.6 });
    const snare = drums.pieces.find((p) => p.kind === 'snare');
    for (let i = 0; i < 2; i++) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0075, STICK_LEN, 10), mat);
      shaft.position.y = STICK_LEN / 2;
      shaft.castShadow = true;
      g.add(shaft);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), mat);
      tip.position.y = STICK_LEN;
      g.add(tip);
      const tape = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 10), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 }));
      tape.position.y = 0.08;
      g.add(tape);
      // Rest pose: crossed on the snare head, in the drums' local frame.
      const rest = new THREE.Group();
      snare.group.add(rest);
      rest.position.set(i ? 0.07 : -0.07, 0.012, 0.1);
      rest.rotation.set(-Math.PI / 2 + 0.03, 0, i ? -0.55 : 0.55);
      rest.updateMatrixWorld(true);
      drums.add(g);
      const restPos = new THREE.Vector3(), restQuat = new THREE.Quaternion();
      rest.getWorldPosition(restPos);
      rest.getWorldQuaternion(restQuat);
      drums.worldToLocal(restPos);
      drums.getWorldQuaternion(_q);
      restQuat.premultiply(_q.invert());
      g.position.copy(restPos);
      g.quaternion.copy(restQuat);
      snare.group.remove(rest);
      const pointer = input.makePointer('stick' + i, { connected: true, kind: 'stick', pinching: false, pinchStart: false, pinchEnd: false, pointers: [] });
      pointer.external = true;
      pointer.stick = true;
      this.sticks.push({ group: g, pointer, hand: null, restPos, restQuat, settle: 1 });
    }
  }

  // World position of a resting stick's grip point, for grabbing and the hover glow.
  gripWorld(stick, out) {
    out.set(0, GRIP_FROM_BUTT, 0);
    return stick.group.localToWorld(out);
  }

  // Try to pick up a free stick with this hand; returns true if one was taken.
  tryGrab(h, tip) {
    if (h.holding) return false;
    for (const s of this.sticks) {
      if (s.hand) continue;
      if (this.gripWorld(s, _a).distanceTo(tip) > 0.09) continue;
      s.hand = h;
      h.holding = s;
      this.scene.attach(s.group);
      s.pointer.down = true;
      return true;
    }
    return false;
  }

  release(s) {
    if (!s.hand) return;
    s.hand.holding = null;
    s.hand = null;
    s.pointer.down = false;
    s.pointer.active = false;
    this.drums.attach(s.group);
    s.settle = 0;
  }

  // Pose of the hand as a grip: forward along the hand, up out of the back of the hand, palm centre.
  handGrip(h) {
    if (h.kind === 'hand') {
      const j = h.source.joints;
      const w = j && j['wrist'], m = j && j['middle-finger-metacarpal'], k = j && j['index-finger-phalanx-proximal'];
      if (!w || !m || !k || w.visible === false) return false;
      w.getWorldPosition(_a);
      k.getWorldPosition(_b);
      _fwd.subVectors(_b, _a).normalize();
      _up.set(0, 1, 0).applyQuaternion(w.getWorldQuaternion(_q));
      m.getWorldPosition(_grip);
    } else {
      h.source.getWorldQuaternion(_q);
      _fwd.set(0, 0, -1).applyQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      h.source.getWorldPosition(_grip).addScaledVector(_fwd, 0.03);
    }
    // Tilt the stick down from the hand's forward around the hand's side axis.
    _side.crossVectors(_up, _fwd).normalize();
    _axis.copy(_fwd).applyQuaternion(_qd.setFromAxisAngle(_side, TILT)).normalize();
    return true;
  }

  // Called before the input pass: held sticks follow their hands and feed their tips as pointers;
  // released sticks settle back onto the snare.
  updatePoses(dt) {
    for (const s of this.sticks) {
      if (s.hand) {
        if (!s.hand.connected) {
          this.release(s);
          continue;
        }
        if (this.handGrip(s.hand)) {
          s.group.position.copy(_grip).addScaledVector(_axis, -GRIP_FROM_BUTT);
          s.group.quaternion.setFromUnitVectors(UP, _axis);
        }
        s.pointer.next.set(0, STICK_LEN, 0);
        s.group.localToWorld(s.pointer.next);
        continue;
      }
      if (s.settle < 1) {
        s.settle = Math.min(1, s.settle + dt * 2.5);
        const k = 1 - Math.pow(1 - s.settle, 3);
        s.group.position.lerp(s.restPos, k);
        s.group.quaternion.slerp(s.restQuat, k);
      }
    }
  }

  // Called before the end of the frame, while pinch events are still visible.
  updateReleases() {
    for (const s of this.sticks) if (s.hand && s.hand.pinchEnd) this.release(s);
  }

  hover(pointers, glow) {
    for (const s of this.sticks) {
      if (s.hand) continue;
      this.gripWorld(s, _a);
      for (const p of pointers) {
        if (!p.active || p.stick) continue;
        const d = p.tip.distanceTo(_a);
        if (d > 0.12) continue;
        _b.set(0, 1, 0).applyQuaternion(s.group.getWorldQuaternion(_q));
        _up.set(0, 1, 0);
        glow.add({ pos: _a.clone(), length: 0.1, width: 0.03, axis: _b.clone(), normal: _up.clone(), strength: 1 - d / 0.12 });
      }
    }
  }
}
