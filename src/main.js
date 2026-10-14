import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { LookControls } from './look.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AudioEngine } from './audio.js';
import { InputManager } from './input.js';
import { createMaterials } from './materials.js';
import { buildRoom } from './room.js';
import { Piano } from './instruments/piano.js';
import { Drums } from './instruments/drums.js';
import { Guitar, ChordBoard } from './instruments/guitar.js';
import { Harp } from './instruments/harp.js';
import { Recorder } from './recorder.js';
import { TapeDeck } from './tapedeck.js';
import { AmbiencePanel } from './switches.js';

const audio = new AudioEngine();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
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

const drums = new Drums(audio, mats);
drums.position.set(0.35, 0, 0.05);
drums.rotation.y = -Math.PI / 2;
scene.add(drums);

const guitar = new Guitar(audio, mats);
guitar.position.set(-0.8, 0.95, -0.35);
orient(guitar, new THREE.Vector3(-0.82, 0.57, 0), new THREE.Vector3(0.8, 0.05, 0.65));
scene.add(guitar);
addGuitarStand(guitar.position);

const board = new ChordBoard(guitar, mats);
board.position.set(-0.72, 0.7, -0.08);
board.rotation.y = 0.4;
scene.add(board);
addPole(board.position, 0.006);

const harp = new Harp(audio, mats);
harp.position.set(-0.62, 0, 0.6);
harp.rotation.y = THREE.MathUtils.degToRad(-62);
scene.add(harp);

// Session recorder on a side table to the player's left. Nothing is saved; the take lives in memory.
const recorder = new Recorder(audio);
for (const inst of [piano, drums, guitar, harp]) inst.recorder = recorder;
recorder.targets = {
  pianoOn: (e) => piano.playbackOn(e.midi, e.vel),
  pianoOff: (e) => piano.playbackOff(e.midi),
  drum: (e) => drums.playbackHit(e.kind, e.vel),
  guitar: (e) => guitar.playbackPluck(e.index, e.midi, e.vel),
  harp: (e) => harp.playbackPluck(e.i, e.vel),
  sustain: (e) => piano.setSustain(e.on),
  releaseAll: () => {
    piano.setSustain(false);
    piano.playbackReleaseAll();
  },
};
// Side table to the player's left holds the tape deck and the fire/wind switches.
const deckPos = new THREE.Vector3(-0.52, 0.6, 0.02);
const tableYaw = Math.atan2(0 - deckPos.x, 0.36 - deckPos.z);
const onTable = (dx, dz) => new THREE.Vector3(dx, 0, dz).applyAxisAngle(new THREE.Vector3(0, 1, 0), tableYaw).add(deckPos);
const deck = new TapeDeck(recorder, mats);
deck.position.copy(onTable(0.07, 0));
deck.rotation.y = tableYaw;
scene.add(deck);
addSideTable(deckPos);

const panel = new AmbiencePanel(audio, mats);
panel.position.copy(onTable(-0.16, 0.02));
panel.rotation.y = tableYaw + 0.12;
scene.add(panel);
decor.shadowBlob(scene, deckPos.x, deckPos.z, 0.55, 0.5, 0.4);
decor.shadowBlob(scene, drums.position.x + 0.5, drums.position.z + 0.1, 1.9, 1.6, 0.45);
decor.shadowBlob(scene, harp.position.x - 0.2, harp.position.z - 0.25, 1.1, 0.7, 0.45, 0, harp.rotation.y);
decor.shadowBlob(scene, guitar.position.x + 0.08, guitar.position.z - 0.15, 0.6, 0.6, 0.35);

// Bake every candle in the scene into shared meshes now that all parents are placed.
decor.finalize(scene);

const instruments = [piano, drums, guitar, board, harp, deck, panel];
scene.updateMatrixWorld(true);
const zones = instruments.map((inst) => new THREE.Box3().setFromObject(inst).expandByScalar(0.12));

const input = new InputManager(renderer, rig);
window.musicRoom = { THREE, audio, piano, drums, guitar, board, harp, deck, panel, recorder, camera, rig, renderer, scene, controls: look, decor };

// ---- helpers for placement ----
function orient(obj, xDir, zDir) {
  const z = zDir.clone().normalize();
  const x = xDir.clone().sub(z.clone().multiplyScalar(xDir.dot(z))).normalize();
  const y = new THREE.Vector3().crossVectors(z, x);
  obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
function addPole(top, r) {
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(r, r, top.y, 10), mats.chrome);
  pole.position.set(top.x, top.y / 2, top.z);
  scene.add(pole);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.02, 24), mats.rubber);
  foot.position.set(top.x, 0.01, top.z);
  scene.add(foot);
}
function addSideTable(top) {
  const t = new THREE.Group();

  t.position.set(top.x, 0, top.z);
  t.rotation.y = tableYaw;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.32), mats.walnutGloss);
  slab.position.y = top.y - 0.0125;
  slab.castShadow = slab.receiveShadow = true;
  t.add(slab);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, top.y - 0.025, 0.025), mats.walnutGloss);
    leg.position.set(sx * 0.225, (top.y - 0.025) / 2, sz * 0.135);
    leg.castShadow = true;
    t.add(leg);
  }
  scene.add(t);
}
function addGuitarStand(pos) {
  // Pole behind the guitar, a short arm reaching its back, and a padded cradle under the lower bout.
  const base = new THREE.Vector3(pos.x + 0.12, 0, pos.z - 0.22);
  addPole(new THREE.Vector3(base.x, pos.y - 0.05, base.z), 0.012);
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 8), mats.chrome);
  arm.position.set(pos.x + 0.06, pos.y - 0.06, pos.z - 0.11);
  arm.lookAt(base.x, pos.y - 0.05, base.z);
  arm.rotateX(Math.PI / 2);
  scene.add(arm);
  const cradle = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.014, 10, 24, Math.PI), mats.rubber);
  cradle.position.set(pos.x + 0.1, pos.y - 0.17, pos.z + 0.02);
  cradle.rotation.set(0, 0.9, Math.PI);
  scene.add(cradle);
}

// ---- overlay / audio start ----
const overlay = document.getElementById('overlay');
const hint = document.getElementById('hint');
const vrButton = VRButton.createButton(renderer, { optionalFeatures: ['hand-tracking'] });
document.body.appendChild(vrButton);
vrButton.addEventListener('click', startAudio);

function startAudio() {
  if (audio.started) return;
  audio.start().then(() => panel.sync());
  overlay.classList.add('hidden');
  hint.textContent = renderer.xr.isPresenting
    ? 'Pinch empty air and pull sideways to swivel your seat.'
    : 'Drag to look around, scroll to zoom. Click or drag across the keys; A S D F row plays piano, Z/X change octave, hold Space or click the right pedal for sustain. Click drums; drag across guitar or harp strings. Tape deck and fire/wind switches are on the side table.';
}
renderer.xr.addEventListener('sessionstart', () => {
  startAudio();
  hint.textContent = 'Pinch empty air and pull sideways to swivel your seat.';
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

renderer.domElement.addEventListener('pointerdown', (e) => {
  startAudio();
  if (renderer.xr.isPresenting) return;
  setRay(e);
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
  if (e.code === 'Space') {
    startAudio();
    piano.setSustain(true);
    e.preventDefault();
    return;
  }
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
  if (e.code === 'Space') {
    piano.setSustain(false);
    return;
  }
  const p = kbdPointers.get(e.code);
  const midi = kbdMidi.get(e.code);
  if (p && midi !== undefined) piano.releaseMidi(midi, p);
});
window.addEventListener('pointerup', () => {
  look.end();
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
  for (const z of zones) if (z.containsPoint(point)) return true;
  return false;
}
function snapTurn(rad) {
  camera.getWorldPosition(_head);
  rig.rotateY(rad);
  rig.updateMatrixWorld(true);
  camera.getWorldPosition(_v);
  rig.position.add(_head.sub(_v));
}
function updateSwivel() {
  if (!renderer.xr.isPresenting) return;
  for (const h of input.hands) {
    if (!h.connected) continue;
    const p = h.pointers[0];
    if (!swivel.hand && h.pinchStart && p.active && !nearInstrument(p.tip)) {
      swivel.hand = h;
      swivel.startX = headLocalX(p.tip);
    }
    if (swivel.hand !== h) continue;
    if (h.pinchEnd || !p.active) {
      swivel.hand = null;
      continue;
    }
    const dx = headLocalX(p.tip) - swivel.startX;
    if (Math.abs(dx) > 0.14) {
      snapTurn(dx > 0 ? Math.PI / 4 : -Math.PI / 4);
      swivel.startX = headLocalX(p.tip);
    }
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const timer = new THREE.Timer();
renderer.setAnimationLoop(() => {
  timer.update();
  const dt = Math.min(timer.getDelta(), 0.05);
  input.update(dt);
  for (const inst of instruments) inst.update(input.pointers, dt);
  recorder.update();
  decor.update(dt);
  updateSwivel();
  input.endFrame();
  if (!renderer.xr.isPresenting) look.update();
  renderer.render(scene, camera);
});
