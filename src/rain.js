import * as THREE from 'three';

// Rain streaks on window glass: two layers of drops sliding down with fading trails,
// plus a scatter of static droplets. uIntensity fades the whole effect in and out.
const vert = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const frag = `
uniform float uTime; uniform float uIntensity;
varying vec2 vUv;
float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main() {
  vec2 uv = vUv;
  float a = 0.0;
  for (int L = 0; L < 2; L++) {
    float layer = float(L);
    float cols = 26.0 + layer * 14.0;
    float sx = uv.x * cols;
    float col = floor(sx);
    float rnd = hash(vec2(col, layer));
    float speed = 0.22 + rnd * 0.35;
    float xoff = (hash(vec2(col, layer + 7.0)) - 0.5) * 0.5;
    float fx = fract(sx) - 0.5 - xoff;
    float dy = fract(uv.y + uTime * speed + rnd * 7.0);
    float head = smoothstep(0.035, 0.0, abs(dy - 0.1));
    float trail = smoothstep(0.42, 0.1, dy) * step(0.1, dy);
    float width = smoothstep(0.14, 0.0, abs(fx));
    float on = step(0.35, hash(vec2(col, layer + 3.0)));
    a += on * width * (head + trail * 0.35) * (0.5 + 0.5 * rnd);
  }
  vec2 g2 = uv * vec2(38.0, 56.0);
  vec2 c2 = floor(g2);
  vec2 f2 = fract(g2) - 0.5;
  vec2 off = (vec2(hash(c2 + 1.0), hash(c2 + 2.0)) - 0.5) * 0.6;
  float drop = smoothstep(0.13, 0.05, length(f2 - off)) * step(0.74, hash(c2 + 3.0));
  a += drop * 0.55;
  a *= uIntensity;
  gl_FragColor = vec4(vec3(0.82, 0.88, 1.0), clamp(a, 0.0, 0.85));
}
`;

export function rainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 0 } },
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}
