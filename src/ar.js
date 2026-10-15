import * as THREE from 'three';
import { XREstimatedLight } from 'three/addons/webxr/XREstimatedLight.js';

const _pos = new THREE.Vector3();
const _head = new THREE.Vector3();
const _m = new THREE.Matrix4();

// Mixed-reality mode: passthrough on, the 88-key piano placed on a real surface.
// A reticle follows where the hand points across real surfaces (hit-test); a pinch drops the
// piano there facing the player. On a table the keybed rests on the tabletop and the pedal
// drops to the floor; on the floor the full upright appears.
export class ARMode {
  constructor({ renderer, scene, camera, piano, input, onPlaced }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.piano = piano;
    this.input = input;
    this.onPlaced = onPlaced;
    this.active = false;
    this.placing = false;
    this.session = null;
    this.viewerHit = null;
    this.handHits = new Map();
    this.hit = null;
    this.placedThisFrame = false;

    // Reticle: a ring plus the piano's footprint outline, both lying on the surface.
    this.reticle = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.06, 0.08, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    this.reticle.add(ring);
    const foot = new THREE.Mesh(
      new THREE.PlaneGeometry(1.46, 0.78),
      new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide })
    );
    foot.rotation.x = -Math.PI / 2;
    foot.position.z = -0.3;
    this.reticle.add(foot);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1.46, 0.78)),
      new THREE.LineBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.6 })
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.z = -0.3;
    this.reticle.add(edge);
    this.reticle.visible = false;
    scene.add(this.reticle);

    // Shadow catcher: an invisible plane that only shows the piano's shadow on the real surface.
    this.catcher = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.8), new THREE.ShadowMaterial({ opacity: 0.32 }));
    this.catcher.rotation.x = -Math.PI / 2;
    this.catcher.receiveShadow = true;
    this.catcher.visible = false;
    scene.add(this.catcher);

    // Default room-neutral lights, replaced by light estimation when the headset provides it.
    this.lights = new THREE.Group();
    this.lights.add(new THREE.HemisphereLight(0xffffff, 0x8a8a8a, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(0.6, 2.4, 1.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 0.2;
    sun.shadow.camera.far = 8;
    sun.shadow.camera.left = -1.5;
    sun.shadow.camera.right = 1.5;
    sun.shadow.camera.top = 1.5;
    sun.shadow.camera.bottom = -1.5;
    sun.shadow.bias = -0.0004;
    this.sun = sun;
    this.lights.add(sun, sun.target);
    this.lights.visible = false;
    scene.add(this.lights);

    this.estimated = null;
  }

  // Room light estimation, created on the first mixed-reality session so it never runs in VR.
  setupEstimatedLight() {
    if (this.estimated) return;
    try {
      this.estimated = new XREstimatedLight(this.renderer);
      this.estimated.addEventListener('estimationstart', () => {
        if (!this.active) return;
        this.scene.add(this.estimated);
        this.lights.visible = false;
        if (this.estimated.environment) this.scene.environment = this.estimated.environment;
      });
      this.estimated.addEventListener('estimationend', () => {
        this.scene.remove(this.estimated);
        if (this.active) this.lights.visible = true;
      });
    } catch (_) {
      this.estimated = null;
    }
  }

  async enter(session) {
    this.active = true;
    this.session = session;
    this.placing = true;
    this.setupEstimatedLight();
    this.piano.visible = false;
    this.lights.visible = true;
    this.catcher.visible = false;
    try {
      const viewer = await session.requestReferenceSpace('viewer');
      this.viewerHit = await session.requestHitTestSource({ space: viewer });
    } catch (e) {
      console.warn('hit-test unavailable', e);
    }
    const onSources = (e) => {
      for (const s of e.added || []) this.addSource(s);
      for (const s of e.removed || []) {
        const h = this.handHits.get(s);
        if (h) h.cancel();
        this.handHits.delete(s);
      }
    };
    session.addEventListener('inputsourceschange', onSources);
    for (const s of session.inputSources) this.addSource(s);
    session.addEventListener('end', () => this.exit());
  }

  addSource(s) {
    if (!s.targetRaySpace || this.handHits.has(s)) return;
    this.session
      .requestHitTestSource({ space: s.targetRaySpace })
      .then((h) => this.handHits.set(s, h))
      .catch(() => {});
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.placing = false;
    this.reticle.visible = false;
    this.catcher.visible = false;
    this.lights.visible = false;
    if (this.estimated && this.estimated.parent) this.scene.remove(this.estimated);
    for (const h of this.handHits.values()) h.cancel();
    this.handHits.clear();
    if (this.viewerHit) this.viewerHit.cancel();
    this.viewerHit = null;
    this.session = null;
    this.piano.resetSurface();
  }

  startPlacing() {
    this.placing = true;
  }

  // Pick the best hit this frame: a pointing hand first, otherwise where the head is looking.
  findHit(frame) {
    const ref = this.renderer.xr.getReferenceSpace();
    if (!ref) return null;
    const read = (h) => {
      try {
        const results = frame.getHitTestResults(h);
        return results.length ? results[0].getPose(ref) : null;
      } catch (_) {
        return null;
      }
    };
    for (const h of this.handHits.values()) {
      const pose = read(h);
      if (pose) return pose;
    }
    return this.viewerHit ? read(this.viewerHit) : null;
  }

  place() {
    if (!this.hit) return;
    const p = this.piano;
    this.camera.getWorldPosition(_head);
    const yaw = Math.atan2(_head.x - this.hit.x, _head.z - this.hit.z);
    const onTable = this.hit.y > 0.3;
    p.rotation.set(0, yaw, 0);
    p.setOnSurface(this.hit.y, onTable);
    p.position.set(this.hit.x, this.hit.y + (onTable ? 0.05 : 0.72), this.hit.z);
    // Keyboard front sits at the surface edge the player pointed at: push the case back a little.
    p.translateZ(-0.25);
    p.visible = true;
    p.updateMatrixWorld(true);
    this.catcher.position.set(p.position.x, this.hit.y + 0.002, p.position.z);
    this.catcher.rotation.set(-Math.PI / 2, 0, 0);
    this.catcher.rotateZ(yaw);
    this.catcher.visible = true;
    this.sun.target.position.copy(p.position);
    this.placing = false;
    this.placedThisFrame = true;
    this.reticle.visible = false;
    if (this.onPlaced) this.onPlaced();
  }

  update(frame) {
    this.placedThisFrame = false;
    if (!this.active || !frame) return;
    // Pinch in empty air: drop the piano while placing, or start placing again.
    let pinch = false;
    for (const h of this.input.hands) if (h.connected && h.pinchStart) pinch = true;
    if (this.placing) {
      const pose = this.findHit(frame);
      if (pose) {
        _m.fromArray(pose.transform.matrix);
        _pos.setFromMatrixPosition(_m);
        this.hit = _pos.clone();
        this.reticle.position.copy(_pos);
        this.camera.getWorldPosition(_head);
        this.reticle.rotation.set(0, Math.atan2(_head.x - _pos.x, _head.z - _pos.z), 0);
        this.reticle.visible = true;
      } else this.reticle.visible = false;
      if (pinch && this.hit) this.place();
    }
  }
}
