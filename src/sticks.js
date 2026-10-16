import * as THREE from 'three';

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
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
const SHOULDER_FROM_BUTT = STICK_LEN - 0.08;
const TILT = -0.22; // droop of the stick below the hand's forward line, radians (about 12 degrees)
const GRAB_RADIUS = 0.07; // from the pinch point to the nearest point on the shaft
const HOVER_RADIUS = 0.12;
const DEAD_ZONE = 0.18; // a pinch this close to a stick that misses does nothing, rather than grabbing the kit
const OPEN_DISTANCE = 0.05; // thumb tip to index tip: beyond this the hand is open
const OPEN_DWELL = 0.25; // seconds the hand must stay open before a stick is released
const LOST_GRACE = 1.5; // seconds of tracking loss before a held stick is dropped

// A pair of drumsticks resting across the snare. Pinch near a stick's shaft to pick it up: it
// sits in the fist at the pinch point, continues the line of the hand with a slight droop, and
// follows the hand. Its tip (and, for cymbals, its shoulder) becomes a pointer the drums respond
// to. It is released only after the hand has stayed open for a moment, so a relaxed drumming
// grip does not drop it, and it rides out brief tracking loss.
export class Sticks {
  constructor({ drums, input, scene, mats }) {
    this.drums = drums;
    this.input = input;
    this.scene = scene;
    this.sticks = [];
    this.lastPinchPoint = new THREE.Vector3();
    // Blend toward the tracked pose each frame (1 = snap). Snapping keeps the stick's motion in
    // step with the hand's tracking samples, which is what the drums measure speed against.
    this.smoothing = 1;
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
      // Rest pose: two chords laid across the snare head through its centre, butts just over the rim.
      const rest = new THREE.Group();
      snare.group.add(rest);
      rest.position.set(i ? 0.068 : -0.068, 0.009, 0.188);
      rest.rotation.set(-Math.PI / 2, 0, i ? 0.35 : -0.35);
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
      // Tip and shoulder belong to one owner, so a hit stamps its debounce window on both and a
      // stroke that crosses a cymbal with both counts once. Their arm states stay separate.
      const owner = { connected: true, kind: 'stick', pinching: false, pinchStart: false, pinchEnd: false, pointers: [] };
      const mk = (id) => {
        const p = input.makePointer(id, owner);
        p.external = true;
        p.stick = true;
        owner.pointers.push(p);
        return p;
      };
      const pointer = mk('stick' + i);
      const shoulder = mk('stick' + i + '-shoulder');
      shoulder.shoulder = true;
      this.sticks.push({ group: g, pointer, shoulder, hand: null, restPos, restQuat, settle: 1, openFor: 0, lostFor: 0, axis: new THREE.Vector3(), grip: new THREE.Vector3(), smoothed: false });
    }
  }

  // Distance from a world point to the nearest point on the stick's shaft (butt to tip).
  shaftDistance(stick, point) {
    stick.group.getWorldPosition(_a);
    _b.set(0, STICK_LEN, 0);
    stick.group.localToWorld(_b);
    _c.subVectors(_b, _a);
    const len2 = _c.lengthSq();
    let t = len2 > 0 ? _c.dot(_b.subVectors(point, _a)) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    _c.multiplyScalar(t).add(_a);
    return _c.distanceTo(point);
  }

  // World position of a resting stick's grip point, for the hover glow.
  gripWorld(stick, out) {
    out.set(0, GRIP_FROM_BUTT, 0);
    return stick.group.localToWorld(out);
  }

  // Where a hand pinches: midpoint of thumb tip and index tip, or the index tip pointer.
  pinchPoint(h, fallback, out) {
    if (h.kind === 'hand' && h.source.joints) {
      const tt = h.source.joints['thumb-tip'], it = h.source.joints['index-finger-tip'];
      if (tt && it && tt.visible !== false && it.visible !== false) {
        tt.getWorldPosition(_a);
        it.getWorldPosition(_b);
        return out.addVectors(_a, _b).multiplyScalar(0.5);
      }
    }
    return out.copy(fallback);
  }

  // Nearest free stick to a point, with its distance.
  nearestFree(point) {
    let best = null, bd = Infinity;
    for (const s of this.sticks) {
      if (s.hand) continue;
      const d = this.shaftDistance(s, point);
      if (d < bd) {
        bd = d;
        best = s;
      }
    }
    return { stick: best, distance: bd };
  }

  // Try to pick up a stick with this hand. Returns 'grabbed', 'near' (a miss close to a stick,
  // which should not fall through to grabbing the kit) or 'none'.
  tryGrab(h, tip) {
    if (h.holding) return 'none';
    const point = this.pinchPoint(h, tip, this.lastPinchPoint);
    const { stick, distance } = this.nearestFree(point);
    if (!stick) return 'none';
    if (distance > GRAB_RADIUS) return distance < DEAD_ZONE ? 'near' : 'none';
    stick.hand = h;
    h.holding = stick;
    this.scene.attach(stick.group);
    stick.openFor = 0;
    stick.lostFor = 0;
    stick.smoothed = false;
    stick.pointer.down = true;
    stick.shoulder.down = true;
    return 'grabbed';
  }

  release(s) {
    if (!s.hand) return;
    s.hand.holding = null;
    s.hand = null;
    for (const p of [s.pointer, s.shoulder]) {
      p.down = false;
      p.active = false;
    }
    this.drums.attach(s.group);
    s.settle = 0;
  }

  // Pose of the hand as a grip. Forward runs from the wrist to the pinch point, up is out of
  // the back of the hand, and the grip is the pinch point itself. Returns false if untracked.
  handGrip(h) {
    if (h.kind === 'hand') {
      const j = h.source.joints;
      const w = j && j['wrist'], tt = j && j['thumb-tip'], it = j && j['index-finger-tip'];
      if (!w || !tt || !it || w.visible === false || tt.visible === false || it.visible === false) return false;
      w.getWorldPosition(_a);
      tt.getWorldPosition(_b);
      it.getWorldPosition(_c);
      _grip.addVectors(_b, _c).multiplyScalar(0.5);
      _fwd.subVectors(_grip, _a).normalize();
      _up.set(0, 1, 0).applyQuaternion(w.getWorldQuaternion(_q));
    } else {
      h.source.getWorldQuaternion(_q);
      _fwd.set(0, 0, -1).applyQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      h.source.getWorldPosition(_grip).addScaledVector(_fwd, 0.03);
    }
    // Droop the stick toward the palm side: rotate forward about the hand's side axis.
    _side.crossVectors(_fwd, _up).normalize();
    _axis.copy(_fwd).applyQuaternion(_qd.setFromAxisAngle(_side, TILT)).normalize();
    return true;
  }

  // Called before the input pass: held sticks follow their hands and feed their tip and
  // shoulder as pointers; released sticks settle back onto the snare.
  updatePoses(dt) {
    for (const s of this.sticks) {
      if (s.hand) {
        const h = s.hand;
        // Tracking lost, either the input source is gone or its joints are untracked: freeze in
        // place, silence the pointers, snap (not blend) when tracking returns, and drop the
        // stick only after a grace period.
        const ok = h.connected && this.handGrip(h);
        if (!ok) {
          s.lostFor += dt;
          s.smoothed = false;
          s.pointer.down = s.shoulder.down = false;
          if (s.lostFor > LOST_GRACE) this.release(s);
          continue;
        }
        s.lostFor = 0;
        s.pointer.down = s.shoulder.down = true;
        // A little smoothing shaves tracking jitter off the tip without visible lag.
        if (s.smoothed && this.smoothing < 1) {
          s.axis.lerp(_axis, this.smoothing).normalize();
          s.grip.lerp(_grip, this.smoothing);
        } else {
          s.axis.copy(_axis);
          s.grip.copy(_grip);
          s.smoothed = true;
        }
        s.group.position.copy(s.grip).addScaledVector(s.axis, -GRIP_FROM_BUTT);
        s.group.quaternion.setFromUnitVectors(UP, s.axis);
        s.pointer.next.set(0, STICK_LEN, 0);
        s.group.localToWorld(s.pointer.next);
        s.shoulder.next.set(0, SHOULDER_FROM_BUTT, 0);
        s.group.localToWorld(s.shoulder.next);
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

  // Thumb tip to index tip distance for a tracked hand, or null.
  pinchGap(h) {
    if (h.kind !== 'hand' || !h.source.joints) return null;
    const tt = h.source.joints['thumb-tip'], it = h.source.joints['index-finger-tip'];
    if (!tt || !it || tt.visible === false || it.visible === false) return null;
    return tt.getWorldPosition(_a).distanceTo(it.getWorldPosition(_b));
  }

  // Called before the end of the frame. Hands release after staying open for a dwell;
  // controllers release when the select button is let go.
  updateReleases(dt) {
    for (const s of this.sticks) {
      const h = s.hand;
      if (!h || !h.connected) continue;
      if (h.kind !== 'hand') {
        if (h.pinchEnd) this.release(s);
        continue;
      }
      const gap = this.pinchGap(h);
      // Untracked joints say nothing about the grip: the tracking-loss grace handles that case.
      if (gap === null) continue;
      s.openFor = gap > OPEN_DISTANCE ? s.openFor + dt : 0;
      if (s.openFor > OPEN_DWELL) this.release(s);
    }
  }

  // Glow on the stick each fingertip would actually pick up: the nearest free one within reach.
  // Drop every held stick at once (session end).
  releaseAll() {
    for (const s of this.sticks) if (s.hand) this.release(s);
  }

  hover(pointers, glow) {
    if (!this.drums.visible) return;
    const best = new Map();
    for (const p of pointers) {
      if (!p.active || p.stick) continue;
      const { stick, distance } = this.nearestFree(p.tip);
      if (!stick || distance > HOVER_RADIUS) continue;
      if (!best.has(stick) || distance < best.get(stick)) best.set(stick, distance);
    }
    for (const [s, bd] of best) {
      this.gripWorld(s, _a);
      _b.set(0, 1, 0).applyQuaternion(s.group.getWorldQuaternion(_q));
      _up.set(0, 1, 0);
      _a.addScaledVector(_up, 0.014);
      glow.add({ pos: _a.clone(), length: 0.12, width: 0.035, axis: _b.clone(), normal: _up.clone(), strength: 1 - bd / HOVER_RADIUS });
    }
  }
}
