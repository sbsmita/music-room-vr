import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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

const audio = new AudioEngine();

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(1);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1612);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;

// The rig holds the camera and hands so the seat can swivel in VR.
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.02, 40);
camera.position.set(0, 1.2, 0.36);
rig.add(camera);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.0, -0.35);
controls.enablePan = false;
controls.minDistance = 0.05;
controls.maxDistance = 2.5;
controls.update();

const mats = createMaterials();
scene.add(buildRoom(mats));

const piano = new Piano(audio, mats);
piano.position.set(0, 0.72, -0.35);
scene.add(piano);

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
  releaseAll: () => piano.playbackReleaseAll(),
};
const deck = new TapeDeck(recorder, mats);
const deckPos = new THREE.Vector3(-0.5, 0.6, 0.02);
deck.position.copy(deckPos);
deck.rotation.y = Math.atan2(0 - deckPos.x, 0.36 - deckPos.z);
scene.add(deck);
addSideTable(deckPos);

const instruments = [piano, drums, guitar, board, harp, deck];
scene.updateMatrixWorld(true);
const zones = instruments.map((inst) => new THREE.Box3().setFromObject(inst).expandByScalar(0.12));

const input = new InputManager(renderer, rig);
window.musicRoom = { THREE, audio, piano, drums, guitar, board, harp, deck, recorder, camera, rig, renderer, scene, controls };

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
  t.rotation.y = deck.rotation.y;
  const slab = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.025, 0.3), mats.walnutGloss);
  slab.position.y = top.y - 0.0125;
  slab.castShadow = slab.receiveShadow = true;
  t.add(slab);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.025, top.y - 0.025, 0.025), mats.walnutGloss);
    leg.position.set(sx * 0.155, (top.y - 0.025) / 2, sz * 0.125);
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
  audio.start();
  overlay.classList.add('hidden');
  hint.textContent = renderer.xr.isPresenting
    ? 'Pinch empty air and pull sideways to swivel your seat.'
    : 'Click keys, drums and strings. Drag across the guitar or harp strings to strum. Drag empty space to look around. The tape deck on the left records your session.';
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
  if (!best) return;
  activeInst = best.inst;
  controls.enabled = false;
  mouseP.next.copy(best.hit.point);
  mouseP.tip.copy(best.hit.point);
  mouseP.prev.copy(best.hit.point);
  mouseP.active = false;
  mouseP.down = true;
  if (best.inst.desktopDown) best.inst.desktopDown(best.hit, mouseP);
});
window.addEventListener('pointermove', (e) => {
  if (!activeInst || !activeInst.dragMesh) return;
  setRay(e);
  const hits = raycaster.intersectObject(activeInst.dragMesh, false);
  if (hits.length) mouseP.next.copy(hits[0].point);
});
window.addEventListener('pointerup', () => {
  if (activeInst && activeInst.desktopUp) activeInst.desktopUp(mouseP);
  activeInst = null;
  mouseP.down = false;
  controls.enabled = true;
});

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
  updateSwivel();
  input.endFrame();
  if (!renderer.xr.isPresenting) controls.update();
  renderer.render(scene, camera);
});
