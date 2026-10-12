import * as THREE from 'three';
import { woodTexture, plasterTexture, rugTexture } from './textures.js';

export function createMaterials() {
  const oak = woodTexture({ size: 1024, planks: 16, light: [0.72, 0.52, 0.33], dark: [0.44, 0.28, 0.14], seed: 3, repeat: 3, grainScale: 1.6 });
  const walnut = woodTexture({ size: 512, light: [0.36, 0.21, 0.12], dark: [0.17, 0.09, 0.05], seed: 5, repeat: 2, grainScale: 2.4 });
  const maple = woodTexture({ size: 512, light: [0.88, 0.71, 0.48], dark: [0.72, 0.53, 0.32], seed: 9, repeat: 2, grainScale: 2.4 });
  const spruce = woodTexture({ size: 512, light: [0.94, 0.82, 0.60], dark: [0.82, 0.66, 0.44], seed: 11, repeat: 4, grainScale: 1.6 });
  const rosewood = woodTexture({ size: 512, light: [0.32, 0.16, 0.10], dark: [0.12, 0.05, 0.03], seed: 13, repeat: 2, grainScale: 2.4 });
  const plaster = plasterTexture({ color: [0.91, 0.86, 0.78] });
  const rug = rugTexture();

  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);

  return {
    floor: std({ map: oak.map, roughnessMap: oak.roughnessMap, roughness: 1, metalness: 0 }),
    wall: std({ map: plaster, roughness: 0.95 }),
    ceiling: std({ color: 0xf2eee6, roughness: 1 }),
    trim: std({ color: 0xf4f0e8, roughness: 0.6 }),
    rug: std({ map: rug, roughness: 1 }),
    panel: std({ color: 0x2e3a4a, roughness: 1 }),
    walnutGloss: phys({ map: walnut.map, roughness: 0.28, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
    walnut: std({ map: walnut.map, roughnessMap: walnut.roughnessMap, roughness: 0.8 }),
    maple: phys({ map: maple.map, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    mapleMatte: std({ map: maple.map, roughnessMap: maple.roughnessMap, roughness: 0.9 }),
    spruce: phys({ map: spruce.map, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    rosewood: phys({ map: rosewood.map, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15 }),
    chrome: std({ color: 0xd9dde2, metalness: 1, roughness: 0.16 }),
    nickel: std({ color: 0xc9ccd0, metalness: 1, roughness: 0.3 }),
    brass: std({ color: 0xcfa54e, metalness: 1, roughness: 0.3 }),
    bronze: std({ color: 0xb48a52, metalness: 1, roughness: 0.42 }),
    steel: std({ color: 0xd0d4da, metalness: 1, roughness: 0.3 }),
    ebony: std({ color: 0x15110e, roughness: 0.45 }),
    ivory: std({ color: 0xf4efe3, roughness: 0.38 }),
    blackKey: std({ color: 0x0e0e10, roughness: 0.3 }),
    felt: std({ color: 0x9b1b1b, roughness: 1 }),
    drumHead: std({ color: 0xf1ede3, roughness: 0.85 }),
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
