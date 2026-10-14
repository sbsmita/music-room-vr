import * as THREE from 'three';
import { woodTexture, plasterTexture, rugTexture, leafTexture, flameTexture, duskTexture, brickTexture, watercolorTexture, softDotTexture, cymbalTexture, drumHeadTexture, weaveTexture, gradientStripTexture, stoneWallTexture, flagstoneTexture, leadedDuskTexture, sceneryTexture, tapestryTexture, cityDuskTexture, modernRugTexture, nightSkyTexture } from './textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export function createMaterials() {
  const oak = woodTexture({ size: 1024, planks: 16, light: [0.72, 0.52, 0.33], dark: [0.44, 0.28, 0.14], seed: 3, repeat: 3, grainScale: 1.6 });
  const walnut = woodTexture({ size: 512, light: [0.36, 0.21, 0.12], dark: [0.17, 0.09, 0.05], seed: 5, repeat: 2, grainScale: 2.4 });
  const maple = woodTexture({ size: 512, light: [0.88, 0.71, 0.48], dark: [0.72, 0.53, 0.32], seed: 9, repeat: 2, grainScale: 2.4 });
  const spruce = woodTexture({ size: 512, light: [0.94, 0.82, 0.60], dark: [0.82, 0.66, 0.44], seed: 11, repeat: 4, grainScale: 1.6 });
  const rosewood = woodTexture({ size: 512, light: [0.32, 0.16, 0.10], dark: [0.12, 0.05, 0.03], seed: 13, repeat: 2, grainScale: 2.4 });
  const plaster = plasterTexture({ color: [0.91, 0.86, 0.78] });
  const rug = rugTexture();
  const leaf = leafTexture();
  const leafDark = leafTexture({ light: '#5f9a4a', dark: '#1f4d24' });
  const flame = flameTexture();
  const brick = brickTexture();
  const cymbal = cymbalTexture();
  const head = drumHeadTexture();
  const weave = weaveTexture();
  const dot = softDotTexture();
  const lightOak = woodTexture({ size: 1024, planks: 10, light: [0.86, 0.72, 0.52], dark: [0.66, 0.52, 0.36], seed: 21, repeat: 2.5, grainScale: 1.8 });

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);

  return {
    floor: std({ map: oak.map, roughnessMap: oak.roughnessMap, roughness: 1, metalness: 0 }),
    wall: std({ map: plaster, roughness: 0.95 }),
    ceiling: std({ color: 0xf2eee6, roughness: 1 }),
    trim: std({ color: 0xf4f0e8, roughness: 0.6 }),
    rug: std({ map: rug, roughness: 1 }),
    panel: std({ color: 0x2e3a4a, roughness: 1 }),
    walnutGloss: phys({ map: walnut.map, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
    walnut: std({ map: walnut.map, roughnessMap: walnut.roughnessMap, roughness: 0.8 }),
    maple: phys({ map: maple.map, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    mapleMatte: std({ map: maple.map, roughnessMap: maple.roughnessMap, roughness: 0.9 }),
    spruce: phys({ map: spruce.map, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    rosewood: phys({ map: rosewood.map, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    chrome: std({ color: 0xd9dde2, metalness: 1, roughness: 0.16, envMapIntensity: 2.6 }),
    nickel: std({ color: 0xc9ccd0, metalness: 1, roughness: 0.3, envMapIntensity: 2.2 }),
    brass: std({ color: 0xcfa54e, metalness: 1, roughness: 0.3, envMapIntensity: 2.4 }),
    cymbal: std({ map: cymbal.map, roughnessMap: cymbal.roughnessMap, color: 0xffffff, metalness: 0.9, roughness: 1, envMapIntensity: 3.0 }),
    bronze: std({ color: 0xb48a52, metalness: 1, roughness: 0.42, envMapIntensity: 2.2 }),
    steel: std({ color: 0xd0d4da, metalness: 1, roughness: 0.3, envMapIntensity: 2.4 }),
    ebony: std({ color: 0x15110e, roughness: 0.45 }),
    ivory: std({ color: 0xf4efe3, roughness: 0.38 }),
    blackKey: std({ color: 0x0e0e10, roughness: 0.3 }),
    felt: std({ color: 0x9b1b1b, roughness: 1 }),
    drumHead: std({ map: head, color: 0xffffff, roughness: 0.85 }),
    drumHeadClear: std({ color: 0xc9c2b4, roughness: 0.6, transparent: true, opacity: 0.85 }),
    shell: phys({ color: 0x5b0f1f, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1 }),
    rubber: std({ color: 0x1a1a1a, roughness: 0.95 }),
    pearl: std({ color: 0xeae2cf, roughness: 0.3 }),
    harpString: std({ color: 0xf1e9d6, roughness: 0.5 }),
    harpStringC: std({ color: 0xc52323, roughness: 0.5 }),
    harpStringF: std({ color: 0x1f3fa6, roughness: 0.5 }),
    hole: std({ color: 0x0b0704, roughness: 1 }),
    glass: phys({ color: 0xffffff, roughness: 0, metalness: 0, transmission: 0.9, thickness: 0.01, transparent: true }),
    sky: new THREE.MeshBasicMaterial({ color: 0xdfe9f5 }),
    book: (hue) => std({ color: new THREE.Color().setHSL(hue, 0.45, 0.4), roughness: 0.8 }),
    fabric: std({ color: 0x3b3f4a, roughness: 1 }),
    lampShade: std({ color: 0xf7e6c8, roughness: 1, emissive: 0xffd9a0, emissiveIntensity: 0.35, side: THREE.DoubleSide }),
    // calm-room additions
    dusk: new THREE.MeshBasicMaterial({ map: duskTexture() }),
    brick: std({ map: brick, roughness: 0.95 }),
    stone: std({ color: 0x4a4542, roughness: 0.9 }),
    soot: std({ color: 0x0a0806, roughness: 1 }),
    log: std({ map: walnut.map, color: 0x6a4a34, roughness: 1 }),
    smoke: new THREE.PointsMaterial({ size: 0.28, map: dot, color: 0x9a9a9a, transparent: true, opacity: 0.14, depthWrite: false, sizeAttenuation: true }),
    charred: std({ color: 0x141010, roughness: 0.9, emissive: 0xff4a10, emissiveIntensity: 0.25 }),
    terracotta: std({ color: 0xb8623f, roughness: 0.85 }),
    soil: std({ color: 0x2b1d14, roughness: 1 }),
    stem: std({ color: 0x3f6b2f, roughness: 0.8 }),
    leaf: std({ map: leaf, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }),
    leafDark: std({ map: leafDark, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75 }),
    sofa: std({ color: 0x66795f, roughness: 1, bumpMap: weave, bumpScale: 0.4 }),
    sofaCushion: std({ color: 0x7a8c70, roughness: 1, bumpMap: weave, bumpScale: 0.4 }),
    pillow: std({ color: 0xc9a46a, roughness: 1, bumpMap: weave, bumpScale: 0.4 }),
    shadowBlob: new THREE.MeshBasicMaterial({ map: dot, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
    aoStrip: new THREE.MeshBasicMaterial({ map: gradientStripTexture(), transparent: true, depthWrite: false }),
    wax: std({ color: 0xf3e9d2, roughness: 0.6 }),
    frame: std({ color: 0x2b1f16, roughness: 0.5 }),
    print: (seed) => std({ map: watercolorTexture(seed), roughness: 0.9 }),
    // castle room
    // modern room
    lightOakFloor: std({ map: lightOak.map, roughnessMap: lightOak.roughnessMap, roughness: 1 }),
    wallWhite: std({ color: 0xe9e5de, roughness: 0.95 }),
    charcoal: std({ color: 0x2a2b2e, roughness: 0.9 }),
    slat: std({ map: lightOak.map, color: 0xc9a77a, roughness: 0.7 }),
    blackMetal: std({ color: 0x151517, metalness: 0.6, roughness: 0.45, envMapIntensity: 1.5 }),
    brushedSteel: std({ color: 0xb8bcc2, metalness: 0.9, roughness: 0.35, envMapIntensity: 2.2 }),
    cityGlass: new THREE.MeshBasicMaterial({ map: cityDuskTexture() }),
    led: std({ color: 0xfff6e8, emissive: 0xfff1dc, emissiveIntensity: 2.4, roughness: 0.6 }),
    ledWarm: std({ color: 0xffe0b8, emissive: 0xffd9a8, emissiveIntensity: 3.0, roughness: 0.6 }),
    greyFabric: std({ color: 0xb3afa8, roughness: 1, bumpMap: weave, bumpScale: 0.3 }),
    greyCushion: std({ color: 0xc4c0b8, roughness: 1, bumpMap: weave, bumpScale: 0.3 }),
    accentPillow: std({ color: 0xd9a65a, roughness: 1, bumpMap: weave, bumpScale: 0.3 }),
    pebble: std({ color: 0xe9e4da, roughness: 0.9 }),
    // Plain alpha glass (no transmission) so the flames and coals behind it stay visible.
    tintedGlass: phys({ color: 0xdfe6ee, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.22, envMapIntensity: 1.5, depthWrite: false }),
    rugModern: std({ map: modernRugTexture(), roughness: 1 }),
    thinFrame: std({ color: 0x111113, roughness: 0.5 }),
    matte: std({ color: 0xf4f1ea, roughness: 0.9 }),
    // night outside
    nightSky: new THREE.MeshBasicMaterial({ map: nightSkyTexture() }),
    nightGround: new THREE.MeshBasicMaterial({ color: 0x05070f }),
    windowGlass: phys({ color: 0xdfe6ee, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 1.2, depthWrite: false }),
    beam: std({ map: walnut.map, color: 0x5a3f2a, roughness: 0.85 }),
    iron: std({ color: 0x2b2a2c, metalness: 0.85, roughness: 0.55, envMapIntensity: 1.5 }),
    gilt: std({ color: 0xd4aa4e, metalness: 1, roughness: 0.32, envMapIntensity: 2.6 }),
    velvet: std({ color: 0x5c1a24, roughness: 1, bumpMap: weave, bumpScale: 0.3 }),
    velvetCushion: std({ color: 0x6e2430, roughness: 1, bumpMap: weave, bumpScale: 0.3 }),
    leadedDusk: new THREE.MeshBasicMaterial({ map: leadedDuskTexture() }),
    scenery: (seed) => std({ map: sceneryTexture(seed), roughness: 0.75 }),
    tapestry: (seed) => std({ map: tapestryTexture({ seed }), roughness: 1, side: THREE.DoubleSide }),
    flame: () => new THREE.SpriteMaterial({ map: flame, color: 0xffb060, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }),
    ember: new THREE.PointsMaterial({ size: 0.014, map: dot, color: 0xffa050, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }),
  };
}

// Convenience: a cylinder whose axis runs from a to b.
export function cylinderBetween(a, b, r, mat, segs = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(r, r, len, segs, 1);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

export function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

export function rbox(w, h, d, mat, x = 0, y = 0, z = 0, r = 0.01) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2)), mat);
  m.position.set(x, y, z);
  return m;
}
