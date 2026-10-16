import * as THREE from 'three';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';

export const TIPS = ['index-finger-tip', 'middle-finger-tip', 'ring-finger-tip', 'pinky-finger-tip', 'thumb-tip'];

// Every fingertip (and each controller's tip) becomes a "pointer" with position and velocity.
// Instruments only ever see pointers, so hands, controllers and the desktop mouse all play the same way.
export class InputManager {
  constructor(renderer, rig) {
    this.pointers = [];
    this.hands = [];
    const factory = new XRHandModelFactory();

    for (let i = 0; i < 2; i++) {
      const hand = renderer.xr.getHand(i);
      hand.add(factory.createHandModel(hand, 'mesh'));
      rig.add(hand);
      const h = this.makeHand(i, hand, 'hand');
      hand.addEventListener('connected', () => (h.connected = true));
      hand.addEventListener('disconnected', () => (h.connected = false));
      hand.addEventListener('pinchstart', () => this.setPinch(h, true));
      hand.addEventListener('pinchend', () => this.setPinch(h, false));
      for (const joint of TIPS) {
        const p = this.makePointer(`hand${i}-${joint}`, h);
        p.joint = joint;
        h.pointers.push(p);
      }

      const ctrl = renderer.xr.getController(i);
      rig.add(ctrl);
      const ch = this.makeHand(i, ctrl, 'controller');
      ctrl.addEventListener('connected', (e) => (ch.connected = !(e.data && e.data.hand)));
      ctrl.addEventListener('disconnected', () => (ch.connected = false));
      ctrl.addEventListener('selectstart', () => this.setPinch(ch, true));
      ctrl.addEventListener('selectend', () => this.setPinch(ch, false));
      const cp = this.makePointer(`ctrl${i}`, ch);
      ch.pointers.push(cp);
    }
  }

  makeHand(index, source, kind) {
    const h = { index, source, kind, connected: false, pinching: false, pinchStart: false, pinchEnd: false, pointers: [], pinchFor: 0, lastPlay: -Infinity };
    this.hands.push(h);
    return h;
  }

  makePointer(id, hand) {
    const p = {
      id,
      hand,
      joint: null,
      tip: new THREE.Vector3(),
      prev: new THREE.Vector3(),
      next: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      speed: 0,
      sampleDt: 0,
      sampleT: 0,
      active: false,
      wasActive: false,
      external: false,
      down: false,
      state: new Map(),
    };
    this.pointers.push(p);
    return p;
  }

  setPinch(h, on) {
    if (on && !h.pinching) h.pinchStart = true;
    if (!on && h.pinching) h.pinchEnd = true;
    h.pinching = on;
  }

  update(dt) {
    const now = performance.now() / 1000;
    for (const h of this.hands) h.pinchFor = h.pinching ? h.pinchFor + dt : 0;
    for (const p of this.pointers) {
      p.wasActive = p.active;
      p.prev.copy(p.tip);
      p.active = false;
      if (p.external) {
        if (!p.down) continue;
        p.tip.copy(p.next);
        p.active = true;
      } else {
        if (!p.hand.connected || p.hand.holding) continue;
        if (p.hand.kind === 'hand') {
          const j = p.hand.source.joints[p.joint];
          if (!j || j.visible === false) continue;
          j.getWorldPosition(p.tip);
        } else {
          p.tip.set(0, 0, -0.06);
          p.hand.source.localToWorld(p.tip);
        }
        p.active = true;
      }
      // Hand poses arrive at the tracker's own rate, which can be well below the frame rate. Speed
      // is measured over the learned interval between pose changes, so a hand that updates every
      // 40 ms does not read several times too fast on the frames where it moves and as still in
      // between. A long pause is a hand at rest, not a sample interval.
      if (p.wasActive && p.tip.distanceToSquared(p.prev) > 1e-10) {
        const gap = Math.max(now - p.sampleT, 0.004);
        if (gap < 0.2) p.sampleDt = p.sampleDt > 0 ? p.sampleDt + (gap - p.sampleDt) * 0.25 : gap;
        p.sampleT = now;
        p.vel.subVectors(p.tip, p.prev).divideScalar(Math.max(p.sampleDt || dt, 1e-3));
      } else {
        if (!p.wasActive) {
          p.sampleT = now;
          p.prev.copy(p.tip);
        }
        p.vel.set(0, 0, 0);
      }
      p.speed = p.vel.length();
    }
  }

  // World position of a hand's index tip (or a controller's tip) even while the hand is holding
  // something and its play pointers are muted. Returns false if it isn't tracked.
  indexTip(h, out) {
    if (!h.connected) return false;
    if (h.kind === 'hand') {
      const j = h.source.joints && h.source.joints['index-finger-tip'];
      if (!j || j.visible === false) return false;
      j.getWorldPosition(out);
      return true;
    }
    out.set(0, 0, -0.06);
    h.source.localToWorld(out);
    return true;
  }

  // After the player is teleported (snap turn, placement), every pointer's motion history is
  // stale: mark them inactive so the next update starts fresh with zero velocity.
  resetMotion() {
    for (const p of this.pointers) p.active = false;
  }

  // Heading of a hand (wrist joint) or controller around the vertical axis, in radians.
  handYaw(h) {
    const src = h.kind === 'hand' ? h.source.joints && h.source.joints['wrist'] : h.source;
    if (!src) return 0;
    _dir.set(0, 0, -1).applyQuaternion(src.getWorldQuaternion(_q));
    return Math.atan2(_dir.x, _dir.z);
  }

  endFrame() {
    for (const h of this.hands) {
      h.pinchStart = false;
      h.pinchEnd = false;
    }
  }
}
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();
