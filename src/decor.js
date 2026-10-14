import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, rbox } from './materials.js';
import { makeFire, coalsMaterial, fireUniforms, clusterFlameMaterial, flamePlaneGeometries } from './fire.js';

const V = THREE.Vector3;
const rand = (a, b) => a + Math.random() * (b - a);
const _d = new THREE.Object3D();

// Animated set dressing for the calm room: swaying plants, a fireplace with live flames and
// embers, candles. Everything is procedural and cheap: one draw call per plant's leaves.
export class Decor {
  constructor(mats) {
    this.mats = mats;
    this.plants = [];
    this.flames = [];
    this.lights = [];
    this.embers = [];
    this.time = 0;
    this.candleSpecs = [];
  }

  // ---- plants ----
  plant({ height = 0.9, stems = 7, spread = 0.25, leafScale = [0.18, 0.3], droop = 0.35, trailing = false, pot = 0.11, dark = false, leavesPerStem = 3 } = {}) {
    const m = this.mats;
    const g = new THREE.Group();
    const potMesh = new THREE.Mesh(new THREE.CylinderGeometry(pot, pot * 0.72, pot * 1.5, 24, 1), m.terracotta);
    potMesh.position.y = pot * 0.75;
    potMesh.castShadow = potMesh.receiveShadow = true;
    g.add(potMesh);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(pot, pot * 0.07, 8, 32), m.terracotta);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = pot * 1.5;
    g.add(rim);
    const base = pot * 1.5 - 0.012;
    const soil = new THREE.Mesh(new THREE.CircleGeometry(pot * 0.94, 24), m.soil);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = base;
    g.add(soil);

    const stemGeos = [];
    const leaves = [];
    for (let i = 0; i < stems; i++) {
      const a = (i / stems) * Math.PI * 2 + rand(-0.35, 0.35);
      const r = spread * rand(0.55, 1);
      const h = height * rand(0.65, 1);
      const dx = Math.cos(a) * r, dz = Math.sin(a) * r;
      const pts = trailing
        ? [new V(0, base, 0), new V(dx * 0.5, base + 0.05, dz * 0.5), new V(dx, base - h * 0.45, dz), new V(dx * 1.15, base - h, dz * 1.15)]
        : [new V(0, base, 0), new V(dx * 0.35, base + h * 0.55, dz * 0.35), new V(dx, base + h, dz)];
      const curve = new THREE.CatmullRomCurve3(pts);
      stemGeos.push(new THREE.TubeGeometry(curve, 10, trailing ? 0.004 : 0.007, 6, false));
      const n = trailing ? leavesPerStem * 2 : leavesPerStem;
      for (let k = 0; k < n; k++) {
        const t = trailing ? 0.25 + 0.75 * (k / Math.max(1, n - 1)) : 0.5 + 0.5 * (k / Math.max(1, n - 1));
        const p = curve.getPoint(t);
        const yaw = Math.atan2(dx, dz) + rand(-0.7, 0.7);
        const pitch = (trailing ? -1.0 : -droop) + rand(-0.3, 0.3);
        const s = rand(leafScale[0], leafScale[1]) * (k === n - 1 ? 1 : 0.8);
        leaves.push({ p, yaw, pitch, roll: rand(-0.4, 0.4), s });
      }
    }
    const stemMesh = new THREE.Mesh(mergeGeometries(stemGeos), m.stem);
    stemMesh.castShadow = true;
    g.add(stemMesh);

    // Leaf plane curled along its length so it droops toward the tip and folds slightly along the midrib.
    const leafGeo = new THREE.PlaneGeometry(1, 1.8, 3, 8);
    leafGeo.translate(0, 0.9, 0);
    {
      const pos = leafGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i);
        const u = y / 1.8;
        pos.setZ(i, -0.45 * u * u + 0.12 * Math.abs(x));
      }
      leafGeo.computeVertexNormals();
    }
    const inst = new THREE.InstancedMesh(leafGeo, dark ? m.leafDark : m.leaf, leaves.length);
    leaves.forEach((l, i) => {
      _d.position.copy(l.p);
      _d.rotation.set(Math.PI / 2 - l.pitch, l.yaw, l.roll, 'YXZ');
      _d.scale.set(l.s, l.s, l.s);
      _d.updateMatrix();
      inst.setMatrixAt(i, _d.matrix);
    });
    inst.castShadow = true;
    g.add(inst);
    this.plants.push({ group: g, phase: Math.random() * 6.28, amp: 0.012 + Math.random() * 0.01 });
    return g;
  }

  // ---- fire ----
  flame(x, y, z, w, h, parent) {
    const s = new THREE.Sprite(this.mats.flame());
    s.position.set(x, y + h / 2, z);
    s.scale.set(w, h, 1);
    parent.add(s);
    this.flames.push({ sprite: s, baseY: y, w, h, phase: Math.random() * 6.28, rate: rand(7, 11) });
    return s;
  }

  flickerLight(color, intensity, distance, decay, parent, pos, amount = 0.25) {
    const l = new THREE.PointLight(color, intensity, distance, decay);
    l.position.copy(pos);
    parent.add(l);
    this.lights.push({ light: l, base: intensity, amount, phase: Math.random() * 6.28, walk: 0 });
    return l;
  }

  // Brick fireplace built against a wall. `facing` is the direction into the room (+1 or -1 on z).
  fireplace(x, zWall, facing, ceiling, surround = this.mats.brick) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, zWall);
    g.rotation.y = facing > 0 ? 0 : Math.PI; // local +z points into the room
    const add = (mesh) => {
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    const depth = 0.42;
    add(box(0.38, 1.2, depth, surround, -0.64, 0.6, depth / 2));
    add(box(0.38, 1.2, depth, surround, 0.64, 0.6, depth / 2));
    add(box(1.66, 0.42, depth, surround, 0, 0.99, depth / 2));
    add(box(1.66, ceiling - 1.26, 0.3, surround, 0, 1.26 + (ceiling - 1.26) / 2, 0.15));
    add(box(1.0, 0.8, 0.05, m.soot, 0, 0.4, 0.03)); // firebox back
    add(box(0.05, 0.8, depth - 0.06, m.soot, -0.47, 0.4, depth / 2)); // firebox sides
    add(box(0.05, 0.8, depth - 0.06, m.soot, 0.47, 0.4, depth / 2));
    add(box(1.9, 0.03, 0.75, m.stone, 0, 0.015, 0.36)); // hearth
    add(box(1.9, 0.07, 0.55, m.stone, 0, 1.235, 0.28)); // mantel
    // Logs.
    for (const [rx, ry, rz, ang] of [[-0.12, 0.085, 0.24, 0.35], [0.12, 0.085, 0.2, -0.3], [0, 0.17, 0.22, 0.05]]) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.52, 10), m.log);
      log.position.set(rx, ry, rz);
      log.rotation.set(0, ang, Math.PI / 2);
      log.castShadow = true;
      g.add(log);
    }
    const coals = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), coalsMaterial(1.7));
    coals.rotation.x = -Math.PI / 2;
    coals.position.set(0, 0.035, 0.22);
    g.add(coals);
    const glowMat = new THREE.SpriteMaterial({ map: this.mats.ember.map, color: 0xff5a14, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.4 });
    const cavityGlow = new THREE.Sprite(glowMat);
    cavityGlow.position.set(0, 0.34, 0.1);
    cavityGlow.scale.set(1.1, 0.9, 1);
    g.add(cavityGlow);
    this.flames.push({ sprite: cavityGlow, phase: 1.3, rate: 5, glow: true });
    const fire = makeFire({ w: 0.5, h: 0.72, planes: 3, seed: 2.0, intensity: 1.15 });
    fire.position.set(0.02, 0.07, 0.22);
    g.add(fire);
    const fire2 = makeFire({ w: 0.3, h: 0.46, planes: 3, seed: 7.0, intensity: 1.05 });
    fire2.position.set(-0.17, 0.09, 0.17);
    fire2.rotation.y = 0.5;
    g.add(fire2);
    const fire3 = makeFire({ w: 0.26, h: 0.38, planes: 2, seed: 11.0, intensity: 1.0 });
    fire3.position.set(0.18, 0.1, 0.26);
    fire3.rotation.y = -0.4;
    g.add(fire3);
    // Smoke drifting up into the flue behind the lintel.
    {
      const n = 36;
      const arr = new Float32Array(n * 3);
      const vel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        arr[i * 3] = rand(-0.2, 0.2);
        arr[i * 3 + 1] = rand(0.45, 0.95);
        arr[i * 3 + 2] = rand(0.14, 0.3);
        vel[i] = rand(0.18, 0.32);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      const pts = new THREE.Points(geo, m.smoke);
      g.add(pts);
      this.embers.push({ points: pts, vel, smoke: true });
    }
    // Embers.
    const n = 70;
    const arr = new Float32Array(n * 3);
    const vel = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = rand(-0.25, 0.25);
      arr[i * 3 + 1] = rand(0.1, 0.9);
      arr[i * 3 + 2] = rand(0.12, 0.3);
      vel[i] = rand(0.15, 0.4);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const pts = new THREE.Points(geo, m.ember);
    g.add(pts);
    this.embers.push({ points: pts, vel });
    // Light.
    this.flickerLight(0xff8f3c, 4.2, 6, 1.6, g, new V(0, 0.5, 0.45), 0.22);
    return g;
  }

  // A candle with a live flame. Bodies and flames of every candle are merged in finalize().
  candle(parent, x, y, z, { r = 0.022, h = 0.12, light = false } = {}) {
    this.candleSpecs.push({ parent, pos: new V(x, y, z), r, h, seed: Math.random() * 20 });
    if (light) this.flickerLight(0xffc070, 0.45, 1.8, 1.8, parent, new V(x, y + h + 0.08, z), 0.3);
  }

  // Merge meshes that share a material into one, baking each mesh's local transform.
  merged(parts, mat) {
    const geos = parts.map((m) => {
      m.updateMatrix();
      return m.geometry.clone().applyMatrix4(m.matrix);
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = mesh.receiveShadow = true;
    return mesh;
  }

  // Build all candles as four meshes in world space: holders, wax, wicks, flames.
  finalize(scene) {
    if (!this.candleSpecs.length) return;
    const m = this.mats;
    const holders = [], waxes = [], wicks = [], flames = [];
    const base = new THREE.Matrix4();
    for (const c of this.candleSpecs) {
      c.parent.updateWorldMatrix(true, false);
      base.makeTranslation(c.pos.x, c.pos.y, c.pos.z).premultiply(c.parent.matrixWorld);
      const hg = new THREE.CylinderGeometry(c.r * 1.8, c.r * 2.1, 0.008, 20);
      hg.translate(0, 0.004, 0);
      holders.push(hg.applyMatrix4(base));
      const wg = new THREE.CylinderGeometry(c.r, c.r, c.h, 16);
      wg.translate(0, 0.008 + c.h / 2, 0);
      waxes.push(wg.applyMatrix4(base));
      const kg = new THREE.CylinderGeometry(0.0015, 0.0015, 0.012, 5);
      kg.translate(0, 0.008 + c.h + 0.005, 0);
      wicks.push(kg.applyMatrix4(base));
      for (const fg of flamePlaneGeometries(0.028, 0.075, 2, c.seed)) {
        fg.translate(0, 0.008 + c.h + 0.002, 0);
        flames.push(fg.applyMatrix4(base));
      }
    }
    const holderMesh = new THREE.Mesh(mergeGeometries(holders), m.brass);
    const waxMesh = new THREE.Mesh(mergeGeometries(waxes), m.wax);
    waxMesh.castShadow = true;
    const wickMesh = new THREE.Mesh(mergeGeometries(wicks), m.soot);
    const flameMesh = new THREE.Mesh(mergeGeometries(flames), clusterFlameMaterial(1.8));
    flameMesh.frustumCulled = false;
    scene.add(holderMesh, waxMesh, wickMesh, flameMesh);
    this.candleSpecs = [];
  }

  sofa(x, z, yaw, width = 1.7, fabric = null, cushion = null) {
    const m = this.mats;
    const F = fabric || m.sofa, C = cushion || m.sofaCushion;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw; // local +z is the front
    const seats = width > 1.4 ? [-0.52, 0, 0.52] : [-0.3, 0.3];
    const inner = width - 0.4;
    const add = (mesh) => {
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    add(rbox(width, 0.3, 0.85, F, 0, 0.22, 0, 0.04));
    add(rbox(width, 0.5, 0.22, F, 0, 0.47, -0.32, 0.05));
    for (const sx of [-1, 1]) add(rbox(0.2, 0.5, 0.85, F, sx * (width / 2 - 0.1), 0.32, 0, 0.06));
    const cw = inner / seats.length - 0.03;
    for (const cx of seats) add(rbox(cw, 0.13, 0.6, C, cx, 0.43, 0.06, 0.05));
    for (const cx of seats) add(rbox(cw, 0.4, 0.14, C, cx, 0.58, -0.2, 0.06));
    const p1 = add(rbox(0.34, 0.34, 0.11, m.pillow, seats[0], 0.62, -0.1, 0.05));
    p1.rotation.set(-0.15, 0, 0.3);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.08, 10), m.walnut);
      leg.position.set(sx * (width / 2 - 0.07), 0.04, sz * 0.36);
      g.add(leg);
    }
    return g;
  }

  framedPrint(parent, w, h, seed) {
    const g = new THREE.Group();
    g.add(box(w + 0.06, h + 0.06, 0.03, this.mats.frame));
    const print = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mats.print(seed));
    print.position.z = 0.016;
    g.add(print);
    parent.add(g);
    return g;
  }

  // Gilt-framed landscape painting hung flat on a wall (local +z faces the room).
  painting(parent, w, h, seed) {
    const m = this.mats;
    const g = new THREE.Group();
    g.add(rbox(w + 0.12, h + 0.12, 0.05, m.gilt, 0, 0, 0, 0.012));
    g.add(box(w + 0.04, h + 0.04, 0.052, m.frame, 0, 0, 0.002));
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.scenery(seed));
    canvas.position.z = 0.03;
    g.add(canvas);
    parent.add(g);
    return g;
  }

  // Tapestry hanging from an iron rod.
  tapestry(parent, w, h, seed) {
    const m = this.mats;
    const g = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(w, h, 1, 8), m.tapestry(seed));
    const pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setZ(i, 0.015 * Math.sin(pos.getX(i) * 9) * (0.5 - pos.getY(i) / h));
    cloth.geometry.computeVertexNormals();
    cloth.position.set(0, -h / 2 - 0.03, 0.02);
    cloth.castShadow = true;
    g.add(cloth);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, w + 0.3, 10), m.iron);
    rod.rotation.z = Math.PI / 2;
    rod.position.z = 0.03;
    g.add(rod);
    for (const sx of [-1, 1]) {
      const fin = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 10), m.iron);
      fin.position.set(sx * (w / 2 + 0.15), 0, 0.03);
      g.add(fin);
    }
    parent.add(g);
    return g;
  }

  // Tall window with a stone surround, a round arch and leaded dusk glass. Hung in a wall group.
  archedWindow(parent, w, h) {
    const m = this.mats;
    const g = new THREE.Group();
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.leadedDusk);
    pane.position.set(0, 0, -0.01);
    g.add(pane);
    const arch = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 32, 0, Math.PI), m.leadedDusk);
    arch.position.set(0, h / 2, -0.01);
    g.add(arch);
    const jambD = 0.16;
    for (const sx of [-1, 1]) {
      const jamb = box(0.14, h, jambD, m.stoneBlock, sx * (w / 2 + 0.07), 0, jambD / 2);
      jamb.castShadow = true;
      g.add(jamb);
    }
    const ring = new THREE.Mesh(new THREE.TorusGeometry(w / 2 + 0.07, 0.07, 10, 40, Math.PI), m.stoneBlock);
    ring.position.set(0, h / 2, jambD / 2);
    ring.scale.z = jambD / 0.14;
    g.add(ring);
    const sill = box(w + 0.5, 0.08, 0.26, m.stoneBlock, 0, -h / 2 - 0.04, 0.12);
    sill.castShadow = true;
    g.add(sill);
    const mullion = box(0.05, h, 0.05, m.stoneBlock, 0, 0, 0.0);
    g.add(mullion);
    const transom = box(w, 0.05, 0.05, m.stoneBlock, 0, h * 0.1, 0.0);
    g.add(transom);
    parent.add(g);
    return g;
  }

  // Iron ring chandelier with candles, hung from chains.
  chandelier(parent, x, y, z, ceiling) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    const iron = [];
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.02, 10, 48), m.iron);
    ring.rotation.x = Math.PI / 2;
    iron.push(ring);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 32), m.iron);
    inner.rotation.x = Math.PI / 2;
    inner.position.y = 0.12;
    iron.push(inner);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 0.14, 12), m.iron);
    hub.position.y = 0.12;
    iron.push(hub);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const from = new V(Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      const to = new V(0, ceiling - y, 0);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, from.distanceTo(to), 6), m.iron);
      chain.position.copy(from).add(to).multiplyScalar(0.5);
      chain.quaternion.setFromUnitVectors(new V(0, 1, 0), to.clone().sub(from).normalize());
      iron.push(chain);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const cx = Math.cos(a) * 0.42, cz = Math.sin(a) * 0.42;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.03, 12), m.iron);
      cup.position.set(cx, 0.03, cz);
      iron.push(cup);
      this.candle(g, cx, 0.045, cz, { r: 0.014, h: 0.11 });
    }
    g.add(this.merged(iron, m.iron));
    this.flickerLight(0xffd39a, 3.2, 7, 1.5, g, new V(0, 0.2, 0), 0.1);
    parent.add(g);
    return g;
  }

  // Wall sconce: an iron bracket with a candle. yaw turns the bracket to face into the room.
  sconce(parent, x, y, z, yaw, light = false) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 8), m.iron);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, -0.04, 0.09);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, 0.03, 12), m.iron);
    cup.position.set(0, -0.025, 0.17);
    g.add(this.merged([box(0.08, 0.2, 0.02, m.iron, 0, 0, 0.01), arm, cup], m.iron));
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), m.brass);
    back.position.set(0, 0.06, 0.021);
    g.add(back);
    this.candle(g, 0, -0.01, 0.17, { r: 0.016, h: 0.12, light });
    parent.add(g);
    return g;
  }

  // Floor-standing iron candelabra with five candles.
  candelabra(parent, x, z) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.03, 20), m.iron);
    foot.position.y = 0.015;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 1.3, 10), m.iron);
    pole.position.y = 0.68;
    const arms = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.01, 8, 32), m.iron);
    arms.rotation.x = Math.PI / 2;
    arms.position.y = 1.3;
    g.add(this.merged([foot, pole, arms], m.iron));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.candle(g, Math.cos(a) * 0.2, 1.3, Math.sin(a) * 0.2, { r: 0.016, h: 0.14 });
    }
    this.candle(g, 0, 1.34, 0, { r: 0.018, h: 0.18 });
    this.flickerLight(0xffd0a0, 2.2, 5, 1.5, g, new V(0, 1.6, 0), 0.18);
    parent.add(g);
    return g;
  }

  // ---- modern pieces ----

  // Recessed ceiling downlight: a glowing disc in a trim ring, with a warm point light below it.
  downlight(parent, x, y, z, { intensity = 1.6, distance = 4.5, light = true } = {}) {
    const m = this.mats;
    const trim = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.07, 24), m.blackMetal);
    trim.rotation.x = Math.PI / 2;
    trim.position.set(x, y - 0.002, z);
    parent.add(trim);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), m.ledWarm);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, y - 0.003, z);
    parent.add(disc);
    if (light) {
      const l = new THREE.PointLight(0xffe4c4, intensity, distance, 1.6);
      l.position.set(x, y - 0.08, z);
      parent.add(l);
    }
  }

  // Vertical oak slats on a dark backing: a feature wall panel. Local +z faces the room.
  slatWall(parent, w, h, x, y, z, ry = 0) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    g.add(box(w, h, 0.03, m.charcoal, 0, 0, 0.015));
    const pitch = 0.08, sw = 0.04;
    const geos = [];
    for (let sx = -w / 2 + pitch / 2; sx < w / 2; sx += pitch) {
      const sg = new THREE.BoxGeometry(sw, h, 0.035);
      sg.translate(sx, 0, 0.05);
      geos.push(sg);
    }
    const slats = new THREE.Mesh(mergeGeometries(geos), m.slat);
    slats.castShadow = slats.receiveShadow = true;
    g.add(slats);
    parent.add(g);
    return g;
  }

  // Floor-to-ceiling glass wall with thin black mullions, showing the city at dusk behind it.
  glassWall(parent, w, h, panes = 3) {
    const m = this.mats;
    const g = new THREE.Group();
    const view = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m.cityGlass);
    view.position.z = -0.06;
    g.add(view);
    g.add(box(w + 0.1, 0.06, 0.08, m.blackMetal, 0, h / 2 + 0.03, 0));
    g.add(box(w + 0.1, 0.06, 0.08, m.blackMetal, 0, -h / 2 - 0.03, 0));
    for (let i = 0; i <= panes; i++) {
      const x = -w / 2 + (i / panes) * w;
      g.add(box(0.05, h, 0.08, m.blackMetal, x, 0, 0));
    }
    parent.add(g);
    return g;
  }

  // Linear gas fireplace set into a charcoal feature panel: pebble bed, a row of flames, glass front.
  modernFireplace(x, zWall, facing, ceiling) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, zWall);
    g.rotation.y = facing > 0 ? 0 : Math.PI;
    const panelW = 2.6, depth = 0.3;
    const add = (mesh) => {
      mesh.castShadow = mesh.receiveShadow = true;
      g.add(mesh);
      return mesh;
    };
    // Charcoal panel built in four pieces around the fire opening so the cavity is real.
    const ow = 1.5, oh = 0.42, oy = 0.55;
    const sideW = (panelW - ow) / 2 - 0.05;
    add(box(sideW, ceiling, depth, m.charcoal, -(ow / 2 + 0.05 + sideW / 2), ceiling / 2, depth / 2));
    add(box(sideW, ceiling, depth, m.charcoal, ow / 2 + 0.05 + sideW / 2, ceiling / 2, depth / 2));
    const topH = ceiling - (oy + oh / 2 + 0.03);
    add(box(ow + 0.1, topH, depth, m.charcoal, 0, oy + oh / 2 + 0.03 + topH / 2, depth / 2));
    const botH = oy - oh / 2 - 0.03;
    add(box(ow + 0.1, botH, depth, m.charcoal, 0, botH / 2, depth / 2));
    add(box(ow + 0.1, 0.03, depth, m.brushedSteel, 0, oy - oh / 2 - 0.015, depth / 2));
    add(box(ow + 0.1, 0.03, depth, m.brushedSteel, 0, oy + oh / 2 + 0.015, depth / 2));
    g.add(box(ow, oh, 0.02, m.soot, 0, oy, 0.02));
    g.add(box(0.02, oh, depth - 0.04, m.soot, -ow / 2, oy, depth / 2));
    g.add(box(0.02, oh, depth - 0.04, m.soot, ow / 2, oy, depth / 2));
    g.add(box(ow, 0.02, depth - 0.04, m.soot, 0, oy - oh / 2 + 0.01, depth / 2));
    // Pebble bed.
    const pebbles = [];
    for (let i = 0; i < 90; i++) {
      const pg = new THREE.SphereGeometry(0.012 + Math.random() * 0.012, 8, 6);
      pg.scale(1.3, 0.7, 1);
      pg.translate(-ow / 2 + 0.05 + Math.random() * (ow - 0.1), oy - oh / 2 + 0.025, 0.08 + Math.random() * (depth - 0.16));
      pebbles.push(pg);
    }
    g.add(new THREE.Mesh(mergeGeometries(pebbles), m.pebble));
    const coals = new THREE.Mesh(new THREE.PlaneGeometry(ow - 0.1, depth - 0.14), coalsMaterial(4.2));
    coals.rotation.x = -Math.PI / 2;
    coals.position.set(0, oy - oh / 2 + 0.018, depth / 2);
    g.add(coals);
    // Row of low flames.
    for (let i = 0; i < 6; i++) {
      const fx = -ow / 2 + 0.15 + (i / 5) * (ow - 0.3);
      const fire = makeFire({ w: 0.22, h: 0.3, planes: 2, seed: 3 + i * 2.1, intensity: 1.5 });
      fire.position.set(fx, oy - oh / 2 + 0.03, depth / 2);
      fire.rotation.y = (i % 2) * 0.6;
      g.add(fire);
    }
    // Glass front.
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(ow, oh), m.tintedGlass);
    glass.position.set(0, oy, depth - 0.02);
    g.add(glass);
    this.flickerLight(0xff9a48, 2.6, 5, 1.6, g, new V(0, oy + 0.1, depth + 0.2), 0.18);
    return g;
  }

  // Floating oak shelf with a row of books and a vase.
  floatingShelf(parent, x, y, z, w, ry = 0) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.y = ry;
    const shelf = box(w, 0.04, 0.24, m.slat, 0, 0, 0.12);
    shelf.castShadow = shelf.receiveShadow = true;
    g.add(shelf);
    const geos = [];
    const tint = new THREE.Color();
    let bx = -w / 2 + 0.06;
    let k = 0;
    while (bx < w * 0.25) {
      const bw = 0.022 + ((k * 7) % 5) * 0.005, bh = 0.2 + ((k * 3) % 5) * 0.03;
      const bg = new THREE.BoxGeometry(bw, bh, 0.16);
      bg.translate(bx + bw / 2, 0.02 + bh / 2, 0.12);
      tint.setHSL(((k * 37) % 10) / 10, 0.25, 0.45);
      const n = bg.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) colors.set([tint.r, tint.g, tint.b], v * 3);
      bg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geos.push(bg);
      bx += bw + 0.004;
      k++;
    }
    const books = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    books.castShadow = true;
    g.add(books);
    const vase = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.03, 0), new THREE.Vector2(0.06, 0.06), new THREE.Vector2(0.045, 0.16), new THREE.Vector2(0.035, 0.22)], 24), m.matte);
    vase.position.set(w * 0.35, 0.02, 0.12);
    vase.castShadow = true;
    g.add(vase);
    parent.add(g);
    return g;
  }

  // Arc floor lamp: heavy base, a curved steel arm, a dome shade with a warm light.
  arcLamp(parent, x, z, yaw = 0) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.04, 32), m.brushedSteel);
    base.position.y = 0.02;
    base.castShadow = true;
    g.add(base);
    const curve = new THREE.QuadraticBezierCurve3(new V(0, 0.04, 0), new V(0, 2.3, 0.2), new V(0, 1.9, 1.3));
    const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.014, 10, false), m.brushedSteel);
    arm.castShadow = true;
    g.add(arm);
    const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), m.brushedSteel);
    shade.position.set(0, 1.9, 1.3);
    shade.rotation.x = Math.PI;
    shade.castShadow = true;
    g.add(shade);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.17, 24), m.ledWarm);
    inner.rotation.x = Math.PI / 2;
    inner.position.set(0, 1.72, 1.3);
    g.add(inner);
    const l = new THREE.PointLight(0xffdcb0, 2.2, 5, 1.6);
    l.position.set(0, 1.65, 1.3);
    g.add(l);
    parent.add(g);
    return g;
  }

  // Large landscape in a thin black frame with a white mat.
  modernFrame(parent, w, h, seed) {
    const m = this.mats;
    const g = new THREE.Group();
    g.add(box(w + 0.08, h + 0.08, 0.03, m.thinFrame));
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.06, h + 0.06), m.matte);
    mat.position.z = 0.016;
    g.add(mat);
    const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.06, h - 0.06), m.scenery(seed));
    canvas.position.z = 0.018;
    g.add(canvas);
    parent.add(g);
    return g;
  }

  // Low glass coffee table on a black steel frame.
  coffeeTable(parent, x, z, yaw = 0) {
    const m = this.mats;
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.012, 0.55), m.tintedGlass);
    top.position.y = 0.4;
    g.add(top);
    const frameGeos = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.BoxGeometry(0.03, 0.39, 0.03);
      leg.translate(sx * 0.5, 0.195, sz * 0.23);
      frameGeos.push(leg);
    }
    for (const sz of [-1, 1]) {
      const rail = new THREE.BoxGeometry(1.03, 0.03, 0.03);
      rail.translate(0, 0.37, sz * 0.23);
      frameGeos.push(rail);
    }
    const frame = new THREE.Mesh(mergeGeometries(frameGeos), m.blackMetal);
    frame.castShadow = true;
    g.add(frame);
    parent.add(g);
    return g;
  }

  // Soft dark blob on the floor under a piece of furniture.
  shadowBlob(parent, x, z, w, d, opacity = 0.5, y = 0, rot = 0) {
    const mat = this.mats.shadowBlob.clone();
    mat.opacity = opacity;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, rot, 0);
    m.scale.set(w, d, 1);
    m.position.set(x, y + 0.005, z);
    m.renderOrder = 1;
    parent.add(m);
    return m;
  }

  // Darkening strip on the floor along a wall; `yaw` turns the dark edge toward the wall.
  aoStrip(parent, len, width, x, z, yaw) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, width), this.mats.aoStrip);
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, yaw, 0);
    m.position.set(x, 0.004, z);
    m.renderOrder = 1;
    parent.add(m);
    return m;
  }

  // RAIN switch: fade the streaks in or out and dim the sky a little while it rains.
  setRain(on) {
    if (this.rain) this.rain.target = on ? 1 : 0;
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    fireUniforms.uTime.value = t;
    if (this.rain) {
      const r = this.rain;
      r.level += (r.target - r.level) * Math.min(1, dt * 1.2);
      if (Math.abs(r.level - r.target) < 0.003) r.level = r.target;
      r.mat.uniforms.uTime.value = t;
      r.mat.uniforms.uIntensity.value = r.level;
      const k = 1 - 0.35 * r.level;
      r.sky.color.setRGB(k, k, k + 0.02 * r.level);
    }
    for (const p of this.plants) {
      p.group.rotation.z = Math.sin(t * 0.7 + p.phase) * p.amp;
      p.group.rotation.x = Math.sin(t * 0.5 + p.phase * 1.3) * p.amp * 0.7;
    }
    for (const f of this.flames) {
      if (f.glow) {
        f.sprite.material.opacity = 0.45 + 0.15 * Math.sin(t * f.rate + f.phase) + 0.08 * Math.sin(t * 13.1);
        continue;
      }
      const k = 0.82 + 0.2 * Math.sin(t * f.rate + f.phase) + 0.1 * Math.sin(t * f.rate * 2.3 + f.phase * 2);
      const hh = f.h * k;
      f.sprite.scale.set(f.w * (0.9 + 0.15 * Math.sin(t * f.rate * 1.7 + f.phase)), hh, 1);
      f.sprite.position.y = f.baseY + hh / 2;
      f.sprite.material.opacity = 0.6 + 0.3 * Math.sin(t * f.rate * 1.3 + f.phase * 3);
    }
    for (const l of this.lights) {
      l.walk += (Math.random() - 0.5) * 0.08;
      l.walk *= 0.92;
      const k = 1 + l.amount * (0.5 * Math.sin(t * 11 + l.phase) + 0.3 * Math.sin(t * 17.3 + l.phase * 2) + l.walk);
      l.light.intensity = l.base * k;
    }
    for (const e of this.embers) {
      const pos = e.points.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + e.vel[i] * dt;
        let x = pos.getX(i) + Math.sin(t * (e.smoke ? 0.8 : 3) + i) * (e.smoke ? 0.08 : 0.04) * dt;
        if (y > (e.smoke ? 0.98 : 1.0)) {
          y = e.smoke ? 0.45 : 0.12;
          x = rand(-0.2, 0.2);
        }
        pos.setY(i, y);
        pos.setX(i, x);
      }
      pos.needsUpdate = true;
    }
  }
}
