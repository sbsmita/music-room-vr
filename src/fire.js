import * as THREE from 'three';

// Procedural fire: noise-driven flames on crossed planes, plus a bed of pulsing coals.
// All flame materials share one time uniform, updated once per frame by Decor.

const noiseGLSL = `
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
`;

const vert = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const flameFragFor = (seedDecl, seedExpr) => `
uniform float uTime; uniform float uIntensity; ${seedDecl}
varying vec2 vUv;
${noiseGLSL}
void main() {
  vec2 uv = vUv;
  float uSeed = ${seedExpr};
  float t = uTime * 0.9 + uSeed;
  float x = (uv.x - 0.5) * 2.0;
  float n = fbm(vec2(uv.x * 3.0 + uSeed, uv.y * 2.2 - t * 1.7));
  float n2 = fbm(vec2(uv.x * 7.0 - uSeed, uv.y * 4.0 - t * 2.6));
  float n3 = fbm(vec2(uv.x * 14.0 + uSeed * 2.0, uv.y * 9.0 - t * 4.0));
  float sway = (n - 0.5) * 0.9 * uv.y;
  // Several tongues: the envelope width wobbles across x so the flame splits into licks.
  float tongues = 0.75 + 0.35 * sin(uv.x * 9.0 + n2 * 6.0 - t * 2.0);
  float width = mix(0.95, 0.05, pow(uv.y, 0.7)) * tongues;
  float edge = abs(x + sway) / width;
  float body = 1.0 - smoothstep(0.45, 1.0, edge);
  float heat = body * (1.0 - uv.y * 0.9) + body * n2 * 0.5 + body * (n3 - 0.5) * 0.35;
  heat = clamp(heat, 0.0, 1.0);
  float alpha = smoothstep(0.14, 0.5, heat) * (1.0 - smoothstep(0.7, 1.0, uv.y)) * smoothstep(0.0, 0.07, uv.y);
  vec3 col = mix(vec3(0.45, 0.02, 0.0), vec3(0.95, 0.30, 0.02), smoothstep(0.1, 0.5, heat));
  col = mix(col, vec3(1.0, 0.72, 0.18), smoothstep(0.5, 0.8, heat));
  col = mix(col, vec3(1.0, 0.92, 0.6), smoothstep(0.85, 1.0, heat));
  gl_FragColor = vec4(col * uIntensity * alpha, alpha);
}
`;
const flameFrag = flameFragFor('uniform float uSeedU;', 'uSeedU');
const clusterFrag = flameFragFor('varying float vSeed;', 'vSeed');
const clusterVert = `
attribute float aSeed;
varying vec2 vUv; varying float vSeed;
void main() { vUv = uv; vSeed = aSeed; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const coalsFrag = `
uniform float uTime; uniform float uSeed;
varying vec2 vUv;
${noiseGLSL}
void main() {
  vec2 uv = vUv;
  float r = length((uv - 0.5) * 2.0);
  float mask = 1.0 - smoothstep(0.75, 1.0, r);
  float n = fbm(uv * 7.0 + uSeed);
  float cracks = smoothstep(0.42, 0.6, n);
  float pulse = 0.65 + 0.35 * sin(uTime * 1.6 + n * 14.0);
  vec3 col = mix(vec3(0.03, 0.015, 0.01), vec3(0.95, 0.3, 0.04), cracks * pulse);
  col += vec3(1.0, 0.65, 0.25) * smoothstep(0.6, 0.78, n) * pulse * 0.7;
  gl_FragColor = vec4(col, mask);
}
`;

export const fireUniforms = { uTime: { value: 0 } };

export function flameMaterial(seed = 0, intensity = 1.6) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fireUniforms.uTime, uSeedU: { value: seed }, uIntensity: { value: intensity } },
    vertexShader: vert,
    fragmentShader: flameFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

export function coalsMaterial(seed = 0) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fireUniforms.uTime, uSeed: { value: seed } },
    vertexShader: vert,
    fragmentShader: coalsFrag,
    transparent: true,
    depthWrite: false,
  });
}

// Flames on `planes` planes fanned around the y axis, base at the group origin.
export function makeFire({ w = 0.6, h = 0.7, planes = 3, seed = Math.random() * 10, intensity = 1.6 } = {}) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h);
  geo.translate(0, h / 2, 0);
  for (let i = 0; i < planes; i++) {
    const m = new THREE.Mesh(geo, flameMaterial(seed + i * 3.7, intensity));
    m.rotation.y = (i / planes) * Math.PI;
    m.frustumCulled = false;
    g.add(m);
  }
  return g;
}

// One material for many small flames: each plane carries its own seed in a vertex attribute.
export function clusterFlameMaterial(intensity = 1.8) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: fireUniforms.uTime, uIntensity: { value: intensity } },
    vertexShader: clusterVert,
    fragmentShader: clusterFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

// Plane geometries for a small flame (base at the origin), each tagged with a seed attribute.
export function flamePlaneGeometries(w, h, planes, seed) {
  const out = [];
  for (let i = 0; i < planes; i++) {
    const g = new THREE.PlaneGeometry(w, h);
    g.translate(0, h / 2, 0);
    g.rotateY((i / planes) * Math.PI);
    const n = g.attributes.position.count;
    g.setAttribute('aSeed', new THREE.Float32BufferAttribute(new Array(n).fill(seed + i * 3.7), 1));
    out.push(g);
  }
  return out;
}
