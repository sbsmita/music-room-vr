import * as THREE from 'three';
import { box } from './materials.js';
import { Decor } from './decor.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The calm evening room: warm plaster walls, oak floor, a large maroon carpet, a brick fireplace
// with live flames behind the player, candles, a green loveseat, plants along the walls. The
// window on the right is a real opening onto a night sky with fireworks over distant hills.
export function buildRoom(mats) {
  const g = new THREE.Group();
  const decor = new Decor(mats);
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

  // Right wall built in four pieces around a real window opening.
  const wx = cx + W / 2;
  const winW = 1.8, winH = 1.7, winY = 1.55, winZ = cz - 0.3;
  const rightWall = (w, h, y, z) => wall(w, h, wx, y, z, -Math.PI / 2);
  rightWall(winZ - winW / 2 - zBack, H, H / 2, (zBack + winZ - winW / 2) / 2);
  rightWall(zFront - (winZ + winW / 2), H, H / 2, (zFront + winZ + winW / 2) / 2);
  rightWall(winW, H - (winY + winH / 2), (H + winY + winH / 2) / 2, winZ);
  rightWall(winW, winY - winH / 2, (winY - winH / 2) / 2, winZ);

  // Window frame, mullions, sill, thin glass, trailing ivy.
  const win = new THREE.Group();
  win.position.set(wx - 0.02, winY, winZ);
  win.rotation.y = -Math.PI / 2;
  for (const [w, h, x, y] of [[winW + 0.1, 0.07, 0, winH / 2 + 0.035], [winW + 0.1, 0.07, 0, -winH / 2 - 0.035], [0.07, winH + 0.14, winW / 2 + 0.035, 0], [0.07, winH + 0.14, -winW / 2 - 0.035, 0], [0.04, winH, 0, 0], [winW, 0.04, 0, winH * 0.12]]) {
    win.add(box(w, h, 0.08, mats.trim, x, y, 0));
  }
  win.add(box(winW + 0.3, 0.04, 0.2, mats.trim, 0, -winH / 2 - 0.09, 0.08));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(winW, winH), mats.windowGlass);
  glass.position.z = 0.0;
  win.add(glass);
  const ivy = decor.plant({ trailing: true, height: 0.5, stems: 9, spread: 0.16, leafScale: [0.05, 0.09], pot: 0.06, dark: true, leavesPerStem: 4 });
  ivy.position.set(0.65, -winH / 2 - 0.07, 0.12);
  win.add(ivy);
  g.add(win);

  // Outside: a big night sky far away, dark ground, and fireworks over the hills.
  // Sky plane sized and placed so the hills sit just above the sill and the moon is in view.
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(40, 11), mats.nightSky);
  sky.position.set(wx + 14, 4.5, winZ + 3);
  sky.rotation.y = -Math.PI / 2;
  g.add(sky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), mats.nightGround);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(wx + 20, -0.05, winZ);
  g.add(ground);

  // Large maroon carpet with a gold border under the instruments.
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.2), mats.rug);
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, 0.55);
  rug.receiveShadow = true;
  g.add(rug);

  // Piano bench at the origin.
  const bench = new THREE.Group();
  bench.position.set(0, 0, 0.36);
  bench.add(box(0.76, 0.05, 0.34, mats.walnutGloss, 0, 0.47, 0));
  bench.add(box(0.74, 0.03, 0.32, mats.fabric, 0, 0.5, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) bench.add(box(0.045, 0.45, 0.045, mats.walnutGloss, sx * 0.34, 0.225, sz * 0.14));
  bench.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  g.add(bench);

  // Bookshelf on the left wall with merged books and a fern on top.
  const shelf = new THREE.Group();
  shelf.position.set(cx - W / 2 + 0.18, 0, cz + 1.2);
  shelf.rotation.y = Math.PI / 2;
  shelf.add(box(1.1, 1.9, 0.02, mats.walnut, 0, 0.95, -0.15));
  for (const x of [-0.54, 0.54]) shelf.add(box(0.025, 1.9, 0.32, mats.walnut, x, 0.95, 0));
  const bookGeos = [];
  const tint = new THREE.Color();
  for (let i = 0; i < 5; i++) {
    const y = 0.08 + i * 0.44;
    shelf.add(box(1.08, 0.025, 0.32, mats.walnut, 0, y, 0));
    if (i === 4) continue;
    let x = -0.5, k = 0;
    while (x < 0.46) {
      const w = 0.025 + ((i * 7 + k * 3) % 5) * 0.006;
      const h = 0.22 + ((i * 3 + k * 5) % 6) * 0.03;
      const bg = new THREE.BoxGeometry(w, h, 0.22 + (k % 3) * 0.02);
      bg.translate(x + w / 2, y + 0.0125 + h / 2, -0.02);
      tint.setHSL(((i * 5 + k * 11) % 10) / 10, 0.45, 0.4);
      const n = bg.attributes.position.count;
      const colors = new Float32Array(n * 3);
      for (let v = 0; v < n; v++) colors.set([tint.r, tint.g, tint.b], v * 3);
      bg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      bookGeos.push(bg);
      x += w + 0.003;
      k++;
      if (k % 9 === 8) x += 0.05;
    }
  }
  shelf.add(new THREE.Mesh(mergeGeometries(bookGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 })));
  shelf.add(box(1.1, 0.03, 0.34, mats.walnut, 0, 1.91, 0));
  const fern = decor.plant({ height: 0.32, stems: 14, spread: 0.22, leafScale: [0.07, 0.12], droop: 0.55, pot: 0.075, dark: true, leavesPerStem: 4 });
  fern.position.set(0.2, 1.925, 0);
  shelf.add(fern);
  shelf.traverse((m) => {
    if (m.isMesh) m.castShadow = m.receiveShadow = true;
  });
  g.add(shelf);

  // Scenery paintings in warm gilt frames: either side of the piano and over the loveseat.
  const art1 = decor.painting(g, 0.8, 0.6, 1);
  art1.position.set(-1.7, 1.85, zBack + 0.04);
  const art2 = decor.painting(g, 0.8, 0.6, 2);
  art2.position.set(1.75, 1.85, zBack + 0.04);
  const art3 = decor.painting(g, 1.0, 0.7, 3);
  art3.position.set(1.95, 1.9, zFront - 0.04);
  art3.rotation.y = Math.PI;

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
  const bulb = new THREE.PointLight(0xffd6a0, 2.4, 5, 1.5);
  bulb.position.y = 1.6;
  lamp.add(bulb);
  g.add(lamp);

  // Pendant over the piano with the shadow-casting spot.
  const pendant = new THREE.Group();
  pendant.position.set(0.4, H, 0.6);
  pendant.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.7, 6), mats.ebony)).position.y = -0.35;
  const pshade = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.2, 24, 1, true), mats.lampShade);
  pshade.position.y = -0.78;
  pendant.add(pshade);
  const plight = new THREE.PointLight(0xffe2bd, 1.3, 6, 1.5);
  plight.position.y = -0.8;
  pendant.add(plight);
  const spot = new THREE.SpotLight(0xffe2bd, 14, 7, 1.2, 0.95, 1.6);
  spot.position.set(0, -0.82, 0);
  spot.target.position.set(-0.1, -H, -0.7);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.camera.near = 0.3;
  spot.shadow.camera.far = 6;
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  pendant.add(spot, spot.target);
  g.add(pendant);

  // Brick fireplace behind the player, green loveseat angled toward it, coffee table with a candle.
  const fx = 0.3;
  g.add(decor.fireplace(fx, zFront, -1, H, mats.brick));
  g.add(decor.sofa(fx + 1.35, zFront - 1.25, -0.85, 1.25));
  const table = new THREE.Group();
  table.position.set(fx + 0.55, 0, zFront - 0.95);
  const tableTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 32), mats.walnutGloss);
  tableTop.position.y = 0.42;
  tableTop.castShadow = tableTop.receiveShadow = true;
  table.add(tableTop);
  const tableLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.08, 0.41, 16), mats.walnutGloss);
  tableLeg.position.y = 0.205;
  table.add(tableLeg);
  decor.candle(table, 0.08, 0.435, 0.02, { r: 0.03, h: 0.07, light: true });
  g.add(table);
  for (const mx of [-0.55, -0.2, 0.3]) decor.candle(g, fx + mx, 1.27, zFront - 0.3, { r: 0.018, h: mx === -0.2 ? 0.14 : 0.1, light: mx === -0.2 });

  // Floor plants against the walls.
  const p1 = decor.plant({ height: 1.1, stems: 8, spread: 0.3, leafScale: [0.24, 0.38], droop: 0.25, pot: 0.14 });
  p1.position.set(fx - 1.35, 0, zFront - 0.32);
  g.add(p1);
  const p2 = decor.plant({ height: 0.95, stems: 7, spread: 0.28, leafScale: [0.22, 0.34], droop: 0.3, pot: 0.13, dark: true });
  p2.position.set(cx + W / 2 - 0.4, 0, zFront - 0.4);
  g.add(p2);
  const p3 = decor.plant({ height: 1.2, stems: 9, spread: 0.3, leafScale: [0.26, 0.4], droop: 0.2, pot: 0.15 });
  p3.position.set(wx - 0.38, 0, zBack + 0.42);
  g.add(p3);
  const p4 = decor.plant({ height: 0.7, stems: 10, spread: 0.24, leafScale: [0.14, 0.22], droop: 0.45, pot: 0.11, dark: true });
  p4.position.set(cx - W / 2 + 0.32, 0, cz + 0.4);
  g.add(p4);
  for (const pl of [p1, p2, p3, p4]) decor.shadowBlob(g, pl.position.x, pl.position.z, 0.6, 0.6, 0.45);

  // Contact shadows under furniture and a darkening strip along every wall base.
  decor.shadowBlob(g, 0, -0.65, 2.0, 1.0, 0.55);
  decor.shadowBlob(g, 0, 0.36, 1.0, 0.6, 0.4);
  decor.shadowBlob(g, fx + 1.35, zFront - 1.25, 1.7, 1.3, 0.5, 0, -0.85);
  decor.shadowBlob(g, fx + 0.55, zFront - 0.95, 0.8, 0.8, 0.4);
  decor.shadowBlob(g, fx, zFront - 0.3, 2.2, 0.9, 0.45);
  decor.shadowBlob(g, cx - W / 2 + 0.18, cz + 1.2, 0.6, 1.4, 0.5);
  decor.shadowBlob(g, cx - 2.4, zBack + 0.6, 0.5, 0.5, 0.35);
  decor.aoStrip(g, W, 0.55, cx, zBack + 0.275, 0);
  decor.aoStrip(g, W, 0.55, cx, zFront - 0.275, Math.PI);
  decor.aoStrip(g, D, 0.55, cx - W / 2 + 0.275, cz, Math.PI / 2);
  decor.aoStrip(g, D, 0.55, cx + W / 2 - 0.275, cz, -Math.PI / 2);

  // Lighting: night ambient, soft moonlight through the window, warm interior lights.
  const hemi = new THREE.HemisphereLight(0x4a5a8a, 0x3a2a20, 0.22);
  g.add(hemi);
  const moon = new THREE.DirectionalLight(0xa9bbff, 0.55);
  moon.position.set(wx + 2, 3.0, winZ + 1);
  moon.target.position.set(0.2, 0.6, 0.2);
  moon.castShadow = false;
  g.add(moon, moon.target);

  return { group: g, decor };
}
