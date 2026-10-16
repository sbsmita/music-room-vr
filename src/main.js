import * as THREE from 'three';
import { setupXRButtons } from './xr.js';
import { ARMode } from './ar.js';
import { LookControls } from './look.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { createMaterials } from './materials.js';
import { buildRoom } from './room.js';
import { Piano } from './instruments/piano.js';
import { Drums } from './instruments/drums.js';
import { Harp } from './instruments/harp.js';
import { Recorder } from './recorder.js';
import { TapeDeck } from './tapedeck.js';
import { AmbiencePanel } from './switches.js';
import { HoverGlow } from './hover.js';
import { Sticks } from './sticks.js';

const audio = new AudioEngine();

// alpha so passthrough shows through in mixed reality
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070f);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.12;

// The rig holds the camera and hands so the seat can swivel in VR.
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 40);
camera.position.set(0, 1.2, 0.36);
rig.add(camera);
const look = new LookControls(camera);
look.lookAt(new THREE.Vector3(0, 0.95, -0.35));
look.update();

const mats = createMaterials();
const room = buildRoom(mats);
scene.add(room.group);
const decor = room.decor;

const piano = new Piano(audio, mats);
piano.position.set(0, 0.72, -0.35);
scene.add(piano);

for (const cx of [-0.52, 0.52]) decor.candle(piano, cx, 0.6, -0.5, { r: 0.02, h: 0.11, light: cx > 0 });

// The kit faces the player's right; its throne point lands just beside the seat, so one swivel
// puts every piece within reach while the hi-hat stays clear of the top keys.
const drums = new Drums(audio, mats);
drums.position.set(0.2, 0, 0.46);
drums.rotation.y = -Math.PI / 2;
scene.add(drums);

const harp = new Harp(audio, mats);
harp.position.set(-0.62, 0, 0.6);
harp.rotation.y = THREE.MathUtils.degToRad(-62);
scene.add(harp);

// Session recorder on a side table to the player's left. Nothing is saved; the take lives in memory.
const recorder = new Recorder(audio);
for (const inst of [piano, drums, harp]) inst.recorder = recorder;
recorder.targets = {
  pianoOn: (e) => piano.playbackOn(e.midi, e.vel),
  pianoOff: (e) => piano.playbackOff(e.midi),
  drum: (e) => drums.playbackHit(e.kind, e.vel),
  harp: (e) => harp.playbackPluck(e.i, e.vel),
  releaseAll: () => piano.playbackReleaseAll(),
};
// Side table to the player's left holds the tape deck and the fire/wind switches, as one movable rig.
const deckPos = new THREE.Vector3(-0.52, 0.6, 0.02);
const tableYaw = Math.atan2(0 - deckPos.x, 0.36 - deckPos.z);
const tableRig = new THREE.Group();
tableRig.position.set(deckPos.x, 0, deckPos.z);
tableRig.rotation.y = tableYaw;
scene.add(tableRig);
const deck = new TapeDeck(recorder, mats);
deck.position.set(0.07, deckPos.y, 0);
tableRig.add(deck);
addSideTable(tableRig, deckPos.y);

const panel = new AmbiencePanel(audio, mats);
panel.position.set(-0.19, deckPos.y, 0.02);
panel.rotation.y = 0.12;
panel.onToggle = (id, on) => {
  if (id === 'rain') decor.setRain(on);
};
tableRig.add(panel);
// Contact shadows live inside the rigs so they travel with them.
decor.shadowBlob(tableRig, 0, 0, 0.55, 0.5, 0.4);
{
  const v = new THREE.Vector3(drums.position.x + 0.5, 0, drums.position.z + 0.1);
  drums.worldToLocal(v);
  decor.shadowBlob(drums, v.x, v.z, 1.9, 1.6, 0.45);
  const h = new THREE.Vector3(harp.position.x - 0.2, 0, harp.position.z - 0.25);
  harp.worldToLocal(h);
  decor.shadowBlob(harp, h.x, h.z, 1.1, 0.7, 0.45);
}

// Bake every candle in the scene into shared meshes now that all parents are placed.
decor.finalize(scene);

const instruments = [piano, drums, harp, deck, panel];
// Movable rigs: pinch near one and drag to pull it closer. Each knows which instruments ride on it.
const rigs = [
  { group: drums, instruments: [drums], name: 'drums' },
  { group: harp, instruments: [harp], name: 'harp' },
  { group: tableRig, instruments: [deck, panel], name: 'table' },
];
const pianoRig = { group: piano, instruments: [piano], name: 'piano' };
let activeRigs = rigs;
const rigOfInst = (inst) => activeRigs.find((r) => r.instruments.includes(inst)) || null;
scene.updateMatrixWorld(true);
const pianoZone = new THREE.Box3().setFromObject(piano).expandByScalar(0.12);
for (const r of rigs) r.zone = new THREE.Box3().setFromObject(r.group).expandByScalar(0.12);
pianoRig.zone = pianoZone;
const hoverGlow = new HoverGlow(scene, 16);
const grabRing = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), new THREE.MeshBasicMaterial({ color: 0xffc46a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
grabRing.rotation.x = -Math.PI / 2;
grabRing.visible = false;
scene.add(grabRing);

const input = new InputManager(renderer, rig);
// Drumsticks need the input manager for their tip pointers, so they come after it.
const sticks = new Sticks({ drums, input, scene, mats });
window.musicRoom = { THREE, audio, piano, drums, harp, deck, panel, recorder, camera, rig, renderer, scene, controls: look, decor, input, rigs, hoverGlow };

// ---- helpers for placement ----
function orient(obj, xDir, zDir) {
  const z = zDir.clone().normalize();
  const x = xDir.clone().sub(z.clone().multiplyScalar(xDir.dot(z))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function addSideTable(parent, topY) {
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.025, 0.32), mats.walnutGloss);
  slab.position.y = topY - 0.0125;
  slab.castShadow = slab.receiveShadow = true;
  parent.add(slab);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, topY - 0.025, 0.025), mats.walnutGloss);
    leg.position.set(sx * 0.265, (topY - 0.025) / 2, sz * 0.135);
    leg.castShadow = true;
    parent.add(leg);
  }
}

// ---- overlay / audio start ----
const overlay = document.getElementById('overlay');
const hint = document.getElementById('hint');
// ---- mixed reality: the piano on a real surface ----
const pianoHome = { position: piano.position.clone(), rotation: piano.rotation.clone() };
const rigHomes = rigs.map((r) => ({ rig: r, position: r.group.position.clone(), rotation: r.group.rotation.clone() }));
// Where each rig sits relative to the piano in the VR room, so the same arrangement can be laid
// out around the piano wherever it is placed in the player's real room.
const pianoHomeXZ = new THREE.Vector3(pianoHome.position.x, 0, pianoHome.position.z);
function arrangeAroundPiano() {
  const yaw = piano.rotation.y;
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  for (const h of rigHomes) {
    const dx = h.position.x - pianoHomeXZ.x, dz = h.position.z - pianoHomeXZ.z;
    h.rig.group.position.set(piano.position.x + dx * c + dz * sn, h.position.y, piano.position.z - dx * sn + dz * c);
    h.rig.group.rotation.set(h.rotation.x, h.rotation.y + yaw, h.rotation.z);
    h.rig.group.visible = true;
    h.rig.group.updateMatrixWorld(true);
    h.rig.zone.setFromObject(h.rig.group).expandByScalar(0.12);
  }
}
const ar = new ARMode({
  renderer,
  scene,
  camera,
  piano,
  input,
  onPlaced: () => {
    input.resetMotion();
    pianoZone.setFromObject(piano).expandByScalar(0.12);
    arrangeAroundPiano();
    activeRigs = [pianoRig, ...rigs];
    syncAudioPositions();
    hint.textContent = 'Pinch the side or top of the piano, or any other instrument, to drag it; turn your wrist or twist with both hands to rotate. Pinch and hold with both hands in empty air to bring everything to you. Pinch empty air with one hand to place the piano again.';
  },
});
function enterAR(session) {
  startAudio();
  room.group.visible = false;
  decor.setCandles(false);
  for (const r of rigs) r.group.visible = false;
  activeRigs = [pianoRig];
  scene.background = null;
  rig.position.set(0, 0, 0);
  rig.rotation.set(0, 0, 0);
  panel.toggles.forEach((t) => {
    if (t.on) panel.flip(t);
  });
  ar.enter(session);
  hint.textContent = 'Point at a table or the floor and pinch to place the piano. Pinch its side or top to drag; pinch empty air to place again.';
  session.addEventListener('end', () => {
    room.group.visible = true;
    decor.setCandles(true);
    for (const h of rigHomes) {
      h.rig.group.visible = true;
      h.rig.group.position.copy(h.position);
      h.rig.group.rotation.copy(h.rotation);
      h.rig.group.updateMatrixWorld(true);
      h.rig.zone.setFromObject(h.rig.group).expandByScalar(0.12);
    }
    activeRigs = rigs;
    scene.background = new THREE.Color(0x05070f);
    piano.visible = true;
    piano.position.copy(pianoHome.position);
    piano.rotation.copy(pianoHome.rotation);
    piano.updateMatrixWorld(true);
    pianoZone.setFromObject(piano).expandByScalar(0.12);
    syncAudioPositions();
    hint.textContent = 'Drag to look around, scroll to zoom. Shift+drag an instrument to move it closer.';
  });
}
setupXRButtons(renderer, { onVR: () => startAudio(), onAR: enterAR });

function startAudio() {
  if (audio.started) return;
  audio.start().then(() => {
    panel.sync();
    syncAudioPositions();
  });
  overlay.classList.add('hidden');
  hint.textContent = renderer.xr.isPresenting
    ? 'Pinch empty air and pull sideways to swivel your seat.'
    : 'Drag to look around, scroll to zoom. Click or drag across the keys; A S D F row plays piano, Z/X change octave; sustain is automatic. Click drums; drag across the harp strings. Shift+drag an instrument to move it, Alt+drag to turn it. Fire, wind and rain switches sit on the side table.';
}
renderer.xr.addEventListener('sessionend', () => {
  endGrab();
  swivel.hand = null;
  sticks.releaseAll();
});
renderer.xr.addEventListener('sessionstart', () => {
  startAudio();
  if (!ar.active) hint.textContent = 'Pinch empty air and pull sideways to swivel your seat. Pinch and hold with both hands in empty air to bring everything to you.';
});

// ---- desktop mouse: becomes a pointer that lives on the surface it clicked ----
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const mouseP = input.makePointer('mouse', { connected: true, kind: 'mouse', pinching: false, pinchStart: false, pinchEnd: false, pointers: [] });
mouseP.external = true;
let activeInst = null;

function setRay(e) {
  ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const dragPoint = new THREE.Vector3();
renderer.domElement.addEventListener('pointerdown', (e) => {
  startAudio();
  if (renderer.xr.isPresenting) return;
  setRay(e);
  if (e.shiftKey || e.altKey) {
    // Shift+drag slides a movable rig across the floor; Alt+drag turns it.
    let pick = null, pd = Infinity;
    for (const r of rigs) {
      const meshes = r.instruments.flatMap((i) => i.hitMeshes);
      const hits = raycaster.intersectObjects(meshes, false);
      if (hits.length && hits[0].distance < pd) {
        pd = hits[0].distance;
        pick = { r, y: hits[0].point.y };
      }
    }
    if (pick) {
      dragPlane.constant = -pick.y;
      if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
        startGrab(pick.r, dragPoint, e.altKey ? 'mouse-rotate' : 'mouse');
        grab.mouseX0 = e.clientX;
      }
    }
    return;
  }
  let best = null;
  for (const inst of instruments) {
    const hits = raycaster.intersectObjects(inst.hitMeshes, false);
    if (hits.length && (!best || hits[0].distance < best.hit.distance)) best = { inst, hit: hits[0] };
  }
  if (!best) {
    look.begin(e);
    return;
  }
  activeInst = best.inst;
  mouseP.next.copy(best.hit.point);
  mouseP.tip.copy(best.hit.point);
  mouseP.prev.copy(best.hit.point);
  mouseP.active = false;
  mouseP.down = true;
  if (best.inst.desktopDown) best.inst.desktopDown(best.hit, mouseP);
});
window.addEventListener('pointermove', (e) => {
  look.move(e);
  if (grab.rig && grab.hand === 'mouse') {
    setRay(e);
    if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) moveGrab(dragPoint);
    return;
  }
  if (grab.rig && grab.hand === 'mouse-rotate') {
    grab.rig.group.rotation.y = grab.yaw0 + (e.clientX - grab.mouseX0) * 0.012;
    return;
  }
  if (!activeInst) return;
  setRay(e);
  if (activeInst.desktopMove) {
    const hits = raycaster.intersectObjects(activeInst.hitMeshes, false);
    if (hits.length) activeInst.desktopMove(hits[0], mouseP);
    return;
  }
  if (!activeInst.dragMesh) return;
  const hits = raycaster.intersectObject(activeInst.dragMesh, false);
  if (hits.length) mouseP.next.copy(hits[0].point);
});

// Computer keyboard plays the piano: A S D F G H J K L ; ' for naturals, W E T Y U O P for sharps,
// Z and X move an octave down or up. Each physical key is its own pointer, so chords hold.
const KEYMAP = { KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7, KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16, Quote: 17 };
let kbdBase = 60;
const kbdPointers = new Map();
const kbdMidi = new Map();
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (e.code === 'KeyZ') kbdBase = Math.max(24, kbdBase - 12);
  else if (e.code === 'KeyX') kbdBase = Math.min(96, kbdBase + 12);
  if (!(e.code in KEYMAP)) return;
  startAudio();
  let p = kbdPointers.get(e.code);
  if (!p) kbdPointers.set(e.code, (p = { id: 'kbd-' + e.code, state: new Map() }));
  const midi = kbdBase + KEYMAP[e.code];
  kbdMidi.set(e.code, midi);
  piano.pressMidi(midi, p, 0.75);
  e.preventDefault();
});
window.addEventListener('keyup', (e) => {
  const p = kbdPointers.get(e.code);
  const midi = kbdMidi.get(e.code);
  if (p && midi !== undefined) piano.releaseMidi(midi, p);
});
window.addEventListener('pointerup', () => {
  look.end();
  if (grab.rig && (grab.hand === 'mouse' || grab.hand === 'mouse-rotate')) endGrab();
  if (activeInst && activeInst.desktopUp) activeInst.desktopUp(mouseP);
  activeInst = null;
  mouseP.down = false;
});
renderer.domElement.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!renderer.xr.isPresenting) look.wheel(e);
}, { passive: false });

// ---- VR seat swivel: pinch in empty air and pull sideways for a 45 degree snap turn ----
const swivel = { hand: null, startX: 0 };
const _v = new THREE.Vector3();
const _head = new THREE.Vector3();
function headLocalX(worldPoint) {
  _v.copy(worldPoint);
  camera.worldToLocal(_v);
  return _v.x;
}
function nearInstrument(point) {
  if (pianoZone.containsPoint(point)) return true;
  for (const r of activeRigs) if (r.zone.containsPoint(point)) return true;
  return false;
}
function rigNear(point) {
  for (const r of activeRigs) if (r.zone.containsPoint(point)) return r;
  return null;
}

// ---- grab to move and turn ----
// One hand: pinch near a rig and drag; turning the wrist turns the rig. Two hands: pinch the
// same rig with both and twist for a full turn; the rig follows the midpoint.
const grab = { rig: null, hand: null, hand2: null, offset: new THREE.Vector3(), yaw0: 0, handYaw0: 0, pairAngle0: 0, pairYaw0: 0 };
const ROOM = { xMin: -2.8, xMax: 2.8, zMin: -0.8, zMax: 3.6 };
// A grabbed instrument can also be lifted or lowered, within this range of its home height.
const LIFT = { min: -0.45, max: 0.6, deadband: 0.03 };
const _mid = new THREE.Vector3();
function clampRoom(g) {
  if (ar.active) return;
  g.position.x = Math.min(ROOM.xMax, Math.max(ROOM.xMin, g.position.x));
  g.position.z = Math.min(ROOM.zMax, Math.max(ROOM.zMin, g.position.z));
}
function startGrab(rig, point, hand, handYaw = 0) {
  grab.rig = rig;
  grab.hand = hand;
  grab.hand2 = null;
  grab.offset.set(rig.group.position.x - point.x, rig.group.position.y - point.y, rig.group.position.z - point.z);
  grab.y0 = rig.group.position.y;
  grab.pointY0 = point.y;
  grab.lifting = false;
  if (grab.homeY === undefined) grab.homeY = new Map();
  if (!grab.homeY.has(rig)) grab.homeY.set(rig, rig.group.position.y);
  grab.yaw0 = rig.group.rotation.y;
  grab.handYaw0 = handYaw;
  rig.grabbed = true;
  grabRing.visible = true;
}
function moveGrab(point, handYaw = null) {
  const g = grab.rig.group;
  if (handYaw !== null) {
    // Turning the wrist turns the rig around its own centre; re-anchor the drag offset so the
    // rig pivots in place rather than swinging around the hand.
    let d = handYaw - grab.handYaw0;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    g.rotation.y = grab.yaw0 + d;
  }
  g.position.x = point.x + grab.offset.x;
  g.position.z = point.z + grab.offset.z;
  applyLift(point.y);
  clampRoom(g);
  grabRing.position.set(g.position.x, 0.006, g.position.z);
  refreshGrabZone();
}
// Vertical follow starts only once the hand has clearly moved up or down, so a level drag
// stays level; then the rig tracks the hand's height within a sensible range of its home.
function applyLift(pointY) {
  const g = grab.rig.group;
  if (!grab.lifting && Math.abs(pointY - grab.pointY0) > LIFT.deadband) grab.lifting = true;
  if (!grab.lifting) return;
  const home = grab.homeY.get(grab.rig);
  g.position.y = Math.min(home + LIFT.max, Math.max(home + LIFT.min, grab.y0 + (pointY - grab.pointY0)));
}
function startTwoHand(pA, pB) {
  const g = grab.rig.group;
  grab.pairAngle0 = Math.atan2(pB.x - pA.x, pB.z - pA.z);
  grab.pairYaw0 = g.rotation.y;
  _mid.addVectors(pA, pB).multiplyScalar(0.5);
  grab.offset.set(g.position.x - _mid.x, 0, g.position.z - _mid.z);
  grab.y0 = g.position.y;
  grab.pointY0 = _mid.y;
  grab.lifting = false;
}
function moveTwoHand(pA, pB) {
  const g = grab.rig.group;
  const a = Math.atan2(pB.x - pA.x, pB.z - pA.z);
  let d = a - grab.pairAngle0;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  g.rotation.y = grab.pairYaw0 + d;
  _mid.addVectors(pA, pB).multiplyScalar(0.5);
  g.position.x = _mid.x + grab.offset.x;
  g.position.z = _mid.z + grab.offset.z;
  applyLift(_mid.y);
  clampRoom(g);
  grabRing.position.set(g.position.x, 0.006, g.position.z);
  refreshGrabZone();
}
// The second hand lets go (or drops out): hand the rig back to the first hand cleanly.
function dropSecondHand() {
  if (!grab.rig || !grab.hand2) return;
  grab.hand2 = null;
  const a = grab.hand.pointers[0];
  grab.offset.set(grab.rig.group.position.x - a.tip.x, 0, grab.rig.group.position.z - a.tip.z);
  grab.yaw0 = grab.rig.group.rotation.y;
  grab.handYaw0 = input.handYaw(grab.hand);
  grab.y0 = grab.rig.group.position.y;
  grab.pointY0 = a.tip.y;
  grab.lifting = false;
}
// Keep the held rig's zone current so a second hand can join wherever the rig is now.
function refreshGrabZone() {
  const g = grab.rig.group;
  g.updateMatrixWorld(true);
  grab.rig.zone.setFromObject(g).expandByScalar(0.12);
}
function endGrab() {
  if (!grab.rig) return;
  // Contact shadows ride inside the rig; keep them on the floor when the rig is lifted.
  const g = grab.rig.group;
  const home = grab.homeY ? grab.homeY.get(grab.rig) : g.position.y;
  g.traverse((o) => {
    if (o.material === mats.shadowBlob || (o.material && o.material.map === mats.shadowBlob.map && o.material.color && o.material.color.getHex() === 0)) {
      if (o.userData.baseY === undefined) o.userData.baseY = o.position.y;
      o.position.y = o.userData.baseY - (g.position.y - home);
    }
  });
  grab.rig.group.updateMatrixWorld(true);
  grab.rig.zone.setFromObject(grab.rig.group).expandByScalar(0.12);
  syncAudioPositions();
  grab.rig.grabbed = false;
  grab.rig = null;
  grab.hand = null;
  grab.hand2 = null;
  grabRing.visible = false;
}
// ---- spatial audio: place every sound source in the room ----
const _sp = new THREE.Vector3();
function syncAudioPositions() {
  if (!audio.started) return;
  const put = (name, v) => audio.setSourcePosition(name, v.x, v.y, v.z);
  piano.localToWorld(_sp.set(-0.42, 0.05, -0.05)); put('piano-lo', _sp);
  piano.localToWorld(_sp.set(0, 0.05, -0.05)); put('piano-mid', _sp);
  piano.localToWorld(_sp.set(0.42, 0.05, -0.05)); put('piano-hi', _sp);
  harp.localToWorld(_sp.set(-0.33, 0.8, 0)); put('harp', _sp);
  for (const piece of drums.pieces) {
    if (piece.pad) continue;
    piece.group.getWorldPosition(_sp);
    put('drum:' + piece.kind, _sp);
  }
  put('fire', _sp.set(0.3, 0.5, 3.85));
  put('rain', _sp.set(3.1, 1.55, 1.18));
  put('wind', _sp.set(3.1, 1.9, 1.18));
}
const _lpos = new THREE.Vector3();
const _lfwd = new THREE.Vector3();
const _lup = new THREE.Vector3();
function updateListener() {
  if (!audio.started) return;
  camera.getWorldPosition(_lpos);
  camera.getWorldDirection(_lfwd);
  _lup.set(0, 1, 0).applyQuaternion(camera.getWorldQuaternion(_lq));
  audio.setListener(_lpos, _lfwd, _lup);
}
const _lq = new THREE.Quaternion();

window.musicRoom.grab = { startGrab, moveGrab, endGrab, startTwoHand, moveTwoHand, state: grab };
window.musicRoom.arrangeAroundPiano = arrangeAroundPiano;
window.musicRoom.sticks = sticks;
window.musicRoom.syncAudioPositions = syncAudioPositions;
window.musicRoom.ar = ar;
window.musicRoom.pianoHome = pianoHome;
// Fingers curl while playing, and the headset reads that as a pinch. A pinch counts as a grab only
// if the hand has not played for a moment, it is not over the keyboard, and it is held briefly.
const PLAY_GUARD_MS = 400;
const GRAB_DWELL = 0.1;
function isPlaying(h) {
  return performance.now() - h.lastPlay < PLAY_GUARD_MS;
}
function updateGrab() {
  // A grabbing hand that stops being tracked lets go of the rig; this runs even outside XR so
  // a grab in progress at session end is released.
  if (grab.rig && grab.hand && grab.hand !== 'mouse' && grab.hand !== 'mouse-rotate' && !grab.hand.connected) endGrab();
  if (grab.rig && grab.hand2 && !grab.hand2.connected) dropSecondHand();
  if (!renderer.xr.isPresenting) return;
  if (ar.active && (ar.placing || ar.placedThisFrame)) return;
  for (const h of input.hands) {
    if (!h.connected) continue;
    const p = h.pointers[0];
    // Sticks come first, for any free hand, whether or not a rig is held by the other hand: a
    // pinch or a closing fist near a stick picks it up (a fist only once the hand stopped playing).
    if ((h.pinchStart || (h.graspStart && !isPlaying(h))) && p.active && h !== grab.hand && h !== grab.hand2 && !h.holding) {
      const took = sticks.tryGrab(h, p.tip);
      if (took === 'grabbed' || took === 'near') {
        h.grabArmed = false;
        continue;
      }
    }
    if (h.pinchStart) h.grabArmed = !isPlaying(h);
    if (!h.pinching || isPlaying(h)) h.grabArmed = false;
    // A hand holding sticks has its play pointers muted but can still re-place the piano in AR.
    if (!grab.rig && h.grabArmed && h.pinchFor >= GRAB_DWELL && (p.active || (h.holding && input.indexTip(h, _tipPt)))) {
      h.grabArmed = false;
      const at = p.active ? p.tip : _tipPt;
      if (piano.inPlayZone(at)) continue;
      const rig = h.holding ? null : rigNear(at);
      if (rig) startGrab(rig, at, h, input.handYaw(h));
      else if (ar.active && !nearInstrument(at)) {
        ar.startPlacing();
        for (const r of rigs) r.group.visible = false;
        activeRigs = [pianoRig];
      }
      continue;
    }
    if (!grab.rig) continue;
    // A second hand pinching the same rig joins for a two-hand twist.
    if (h !== grab.hand && !grab.hand2 && h.pinchStart && p.active && !isPlaying(h) && grab.rig.zone.containsPoint(p.tip)) {
      grab.hand2 = h;
      startTwoHand(grab.hand.pointers[0].tip, p.tip);
      continue;
    }
    if (h === grab.hand2) {
      if (h.pinchEnd || !p.active) dropSecondHand();
      continue;
    }
    if (h !== grab.hand) continue;
    if (h.pinchEnd || !p.active) endGrab();
    else if (grab.hand2) moveTwoHand(p.tip, grab.hand2.pointers[0].tip);
    else moveGrab(p.tip, input.handYaw(h));
  }
}
function snapTurn(rad) {
  camera.getWorldPosition(_head);
  rig.rotateY(rad);
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(_v);
  rig.position.add(_head.sub(_v));
  // Hands just jumped with the rig: forget their motion so the jump can't read as a stroke.
  input.resetMotion();
}
const _tipPt = new THREE.Vector3();
// ---- bring everything to me: both hands pinched in empty air and held ----
// Lays the piano and every rig out around the player's current position and heading, in the
// same arrangement as around the bench in the VR room, so nothing is ever out of reach.
const SEAT = new THREE.Vector3(0, 0, 0.36);
const SUMMON_HOLD = 0.8;
const summon = { t: 0, done: false };
const _fwd2 = new THREE.Vector3();
function arrangeAroundPlayer(movePiano = true) {
  camera.getWorldPosition(_head);
  camera.getWorldDirection(_fwd2);
  const yaw = Math.atan2(-_fwd2.x, -_fwd2.z);
  const c = Math.cos(yaw), sn = Math.sin(yaw);
  const place = (group, home, rot) => {
    const dx = home.x - SEAT.x, dz = home.z - SEAT.z;
    group.position.set(_head.x + dx * c + dz * sn, home.y, _head.z - dx * sn + dz * c);
    group.rotation.set(rot.x, rot.y + yaw, rot.z);
    group.updateMatrixWorld(true);
  };
  if (movePiano) {
    const y = piano.position.y;
    place(piano, pianoHome.position, pianoHome.rotation);
    piano.position.y = y;
    piano.updateMatrixWorld(true);
    pianoZone.setFromObject(piano).expandByScalar(0.12);
    if (ar.active && ar.catcher.visible) {
      ar.catcher.position.set(piano.position.x, ar.catcher.position.y, piano.position.z);
      ar.catcher.rotation.set(-Math.PI / 2, 0, 0);
      ar.catcher.rotateZ(piano.rotation.y);
      ar.sun.target.position.copy(piano.position);
    }
  }
  for (const h of rigHomes) {
    place(h.rig.group, h.position, h.rotation);
    h.rig.group.visible = true;
    h.rig.zone.setFromObject(h.rig.group).expandByScalar(0.12);
  }
  if (grab.homeY) grab.homeY.clear();
  if (ar.active) activeRigs = [pianoRig, ...rigs];
  syncAudioPositions();
}
function updateSummon(dt) {
  if (!renderer.xr.isPresenting || grab.rig || (ar.active && (ar.placing || !piano.visible))) {
    summon.t = 0;
    return;
  }
  let both = 0;
  for (const h of input.hands) {
    if (!h.connected || !h.pinching || h.holding || isPlaying(h)) continue;
    if (!input.indexTip(h, _tipPt) || nearInstrument(_tipPt)) continue;
    both++;
  }
  if (both < 2) {
    summon.t = 0;
    summon.done = false;
    return;
  }
  summon.t += dt;
  if (summon.t >= SUMMON_HOLD && !summon.done) {
    summon.done = true;
    swivel.hand = null;
    arrangeAroundPlayer(true);
    input.resetMotion();
  }
}
window.musicRoom.arrangeAroundPlayer = arrangeAroundPlayer;
function updateSwivel() {
  if (!renderer.xr.isPresenting || ar.active) return;
  for (const h of input.hands) {
    if (!h.connected) continue;
    // Use the index tip directly so a hand holding sticks (play pointers muted) can still swivel.
    const tracked = input.indexTip(h, _tipPt);
    if (!swivel.hand && !grab.rig && h.pinchStart && tracked && !isPlaying(h) && !nearInstrument(_tipPt)) {
      swivel.hand = h;
      swivel.startX = headLocalX(_tipPt);
    }
    if (swivel.hand !== h) continue;
    if (h.pinchEnd || !tracked) {
      swivel.hand = null;
      continue;
    }
    const dx = headLocalX(_tipPt) - swivel.startX;
    if (Math.abs(dx) > 0.14) {
      snapTurn(dx > 0 ? Math.PI / 4 : -Math.PI / 4);
      swivel.startX = headLocalX(_tipPt);
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop((time, frame) => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  sticks.updatePoses(dt);
  input.update(dt);
  const handPointers = input.pointers.filter((p) => !p.stick);
  for (const inst of instruments) {
    if (ar.active && ar.placing) continue;
    const rig = rigOfInst(inst);
    if (rig && rig.grabbed) continue;
    const pts = inst === drums ? input.pointers : handPointers;
    inst.update(pts, dt);
    if (inst.hover) inst.hover(pts, hoverGlow);
  }
  if (!(ar.active && ar.placing)) sticks.hover(handPointers, hoverGlow);
  hoverGlow.update(dt);
  ar.update(frame);
  updateGrab();
  sticks.updateReleases(dt);
  updateListener();
  recorder.update();
  decor.update(dt);
  updateSwivel();
  updateSummon(dt);
  input.endFrame();
  if (!renderer.xr.isPresenting) look.update();
  renderer.render(scene, camera);
});
