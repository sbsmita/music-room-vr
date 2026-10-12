import * as THREE from 'three';
import { box } from './materials.js';

// A small practice room: oak floor, plaster walls, a window on the right pouring afternoon light,
// bookshelf, rug, floor lamp, acoustic panels. The player sits on the piano bench at the origin.
export function buildRoom(mats) {
  const g = new THREE.Group();
  const W = 6.4, D = 5.2, H = 2.9;
  const zBack = -1.12, zFront = zBack + D;
  const cx = 0, cz = (zBack + zFront) / 2;
  const add = (m, shadow = true) => {
    m.receiveShadow = true;
    if (shadow) m.castShadow = true;
    g.add(m);
    return m;
  };

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.rotation.z = Math.PI / 2;
  floor.position.set(cx, 0, cz);
  floor.receiveShadow = true;
  g.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, D), mats.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(cx, H, cz);
  g.add(ceiling);

  const wall = (w, h, x, y, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mats.wall);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  wall(W, H, cx, H / 2, zBack, 0);
  wall(W, H, cx, H / 2, zFront, Math.PI);
  wall(D, H, cx - W / 2, H / 2, cz, Math.PI / 2);
  wall(D, H, cx + W / 2, H / 2, cz, -Math.PI / 2);

  // Baseboards and crown.
  const bb = (w, x, z, ry) => {
    for (const [y, h] of [[0.06, 0.12], [H - 0.04, 0.08]]) {
      const m = box(w, h, 0.02, mats.trim, x, y, z);
      m.rotation.y = ry;
      g.add(m);
    }
  };
  bb(W, cx, zBack + 0.01, 0);
  bb(W, cx, zFront - 0.01, 0);
  bb(D, cx - W / 2 + 0.01, cz, Math.PI / 2);
  bb(D, cx + W / 2 - 0.01, cz, Math.PI / 2);

  // Window on the right wall: frame, mullions, bright pane, sill.
  const wx = cx + W / 2 - 0.02;
  const win = new THREE.Group();
  win.position.set(wx, 1.6, cz - 0.3);
  win.rotation.y = -Math.PI / 2;
  const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), mats.sky);
  pane.position.z = -0.01;
  win.add(pane);
  for (const [w, h, x, y] of [[1.6, 0.06, 0, 0.78], [1.6, 0.06, 0, -0.78], [0.06, 1.6, 0.78, 0], [0.06, 1.6, -0.78, 0], [0.035, 1.5, 0, 0], [1.5, 0.035, 0, 0]]) {
    win.add(box(w, h, 0.05, mats.trim, x, y, 0.0));
  }
  win.add(box(1.75, 0.04, 0.16, mats.trim, 0, -0.83, 0.06));
  g.add(win);

  // Rug under the bench and piano stool area.
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.8), mats.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, 0.25);
  rug.receiveShadow = true;
  g.add(rug);

  // Piano bench at the origin.
  const bench = new THREE.Group();
  bench.position.set(0, 0, 0.36);
  const seat = box(0.76, 0.05, 0.34, mats.walnutGloss, 0, 0.47, 0);
  bench.add(seat);
  bench.add(box(0.74, 0.03, 0.32, mats.fabric, 0, 0.5, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bench.add(box(0.045, 0.45, 0.045, mats.walnutGloss, sx * 0.34, 0.225, sz * 0.14));
  bench.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  g.add(bench);

  // Bookshelf on the left wall.
  const shelf = new THREE.Group();
  shelf.position.set(cx - W / 2 + 0.18, 0, cz + 1.2);
  shelf.rotation.y = Math.PI / 2;
  shelf.add(box(1.1, 1.9, 0.02, mats.walnut, 0, 0.95, -0.15));
  for (const x of [-0.54, 0.54]) shelf.add(box(0.025, 1.9, 0.32, mats.walnut, x, 0.95, 0));
  for (let i = 0; i < 5; i++) {
    const y = 0.08 + i * 0.44;
    shelf.add(box(1.08, 0.025, 0.32, mats.walnut, 0, y, 0));
    let x = -0.5;
    let k = 0;
    while (x < 0.46) {
      const w = 0.025 + ((i * 7 + k * 3) % 5) * 0.006;
      const h = 0.22 + ((i * 3 + k * 5) % 6) * 0.03;
      const b = box(w, h, 0.22 + (k % 3) * 0.02, mats.book(((i * 5 + k * 11) % 10) / 10), x + w / 2, y + 0.0125 + h / 2, -0.02);
      shelf.add(b);
      x += w + 0.003;
      k++;
      if (k % 9 === 8) x += 0.05;
    }
  }
  shelf.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  g.add(shelf);

  // Acoustic panels on the back wall, either side of the piano.
  for (const x of [-1.9, -1.2, 1.4, 2.1]) add(box(0.6, 1.2, 0.05, mats.panel, x, 1.7, zBack + 0.03), false);

  // Floor lamp in the back-left corner.
  const lamp = new THREE.Group();
  lamp.position.set(cx - 2.4, 0, zBack + 0.6);
  lamp.add(box(0.3, 0.02, 0.3, mats.brass, 0, 0.01, 0));
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.6, 10), mats.brass);
  pole.position.y = 0.8;
  lamp.add(pole);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.3, 24, 1, true), mats.lampShade);
  shade.position.y = 1.65;
  lamp.add(shade);
  const bulb = new THREE.PointLight(0xffd6a0, 1.6, 5, 1.6);
  bulb.position.y = 1.6;
  lamp.add(bulb);
  g.add(lamp);

  // Pendant light in the ceiling.
  const pendant = new THREE.Group();
  pendant.position.set(0.4, H, 0.6);
  pendant.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 6), mats.ebony)).position.y = -0.35;
  const pshade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.2, 24, 1, true), mats.lampShade);
  pshade.position.y = -0.78;
  pendant.add(pshade);
  const plight = new THREE.PointLight(0xffe2bd, 2.2, 7, 1.4);
  plight.position.y = -0.8;
  pendant.add(plight);
  g.add(pendant);

  // Lighting: soft ambient from the room, warm sun through the window with shadows.
  const hemi = new THREE.HemisphereLight(0xfff4e6, 0x4a3a30, 0.36);
  g.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe7c4, 3.4);
  sun.position.set(wx - 0.1, 2.2, cz - 0.3);
  sun.target.position.set(0.2, 0.6, -0.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 9;
  sun.shadow.camera.left = -3;
  sun.shadow.camera.right = 3;
  sun.shadow.camera.top = 3;
  sun.shadow.camera.bottom = -3;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  g.add(sun, sun.target);

  return g;
}
