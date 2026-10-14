import * as THREE from 'three';

// All textures are generated procedurally so the project ships with zero third-party assets.

function hash(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
const lerp = (a, b, t) => a + (b - a) * t;

export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return lerp(
    lerp(hash(xi, yi), hash(xi + 1, yi), sx),
    lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), sx),
    sy
  );
}

function fbm(x, y, oct = 3) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f);
    n += a;
    a *= 0.5;
    f *= 2;
  }
  return s / n;
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Wood with grain running along the texture's V axis. `planks` > 0 adds staggered floorboards.
export function woodTexture({
  size = 512,
  light = [0.78, 0.56, 0.36],
  dark = [0.45, 0.27, 0.14],
  seed = 0,
  planks = 0,
  repeat = 1,
  grainScale = 1,
} = {}) {
  const c = makeCanvas(size, size);
  const r = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const rctx = r.getContext('2d');
  const img = ctx.createImageData(size, size);
  const rimg = rctx.createImageData(size, size);
  const pw = planks ? size / planks : size;
  const plankLen = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = x, py = y, tint = 0, seam = 0;
      if (planks) {
        const col = Math.floor(x / pw);
        const off = Math.floor(hash(col, seed) * plankLen);
        const row = Math.floor((y + off) / plankLen);
        const id = hash(col * 31 + row * 7, seed + 7);
        tint = (id - 0.5) * 0.22;
        px = x + id * 1000;
        py = y + off + row * 300;
        const ex = x - col * pw;
        const ey = (y + off) % plankLen;
        if (ex < 2 || ey < 2) seam = 1;
      }
      const gs = grainScale;
      // Broad tonal figure, gently wandering fine stripes, and fibre speckle.
      const figure = fbm(px * 0.004, py * 0.0015, 2);
      const warp = (fbm(px * 0.02 * gs, py * 0.004 * gs, 2) - 0.5) * 5;
      const stripe = 0.5 + 0.5 * Math.sin(px * 0.35 * gs + warp);
      const fine = vnoise(px * 1.8 * gs, py * 0.1 * gs);
      let t = 0.5 + (stripe - 0.5) * 0.32 + (fine - 0.5) * 0.28 + (figure - 0.5) * 0.6 + tint;
      t = Math.min(1, Math.max(0, t));
      let rr = lerp(dark[0], light[0], t);
      let gg = lerp(dark[1], light[1], t);
      let bb = lerp(dark[2], light[2], t);
      if (seam) {
        rr *= 0.35;
        gg *= 0.35;
        bb *= 0.35;
      }
      const i = (y * size + x) * 4;
      img.data[i] = rr * 255;
      img.data[i + 1] = gg * 255;
      img.data[i + 2] = bb * 255;
      img.data[i + 3] = 255;
      const rough = 0.5 + 0.35 * (1 - t) + (seam ? 0.2 : 0);
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = Math.min(255, rough * 255);
      rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { map: toTexture(c, { repeat }), roughnessMap: toTexture(r, { repeat, srgb: false }) };
}

export function plasterTexture({ size = 256, color = [0.93, 0.89, 0.82], repeat = 4 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = fbm(x * 0.12, y * 0.12, 3);
      const v = 0.92 + 0.08 * n;
      const i = (y * size + x) * 4;
      img.data[i] = color[0] * v * 255;
      img.data[i + 1] = color[1] * v * 255;
      img.data[i + 2] = color[2] * v * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat });
}

export function rugTexture({ size = 512 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5e1c26';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#c99a4b';
  ctx.lineWidth = 6;
  ctx.strokeRect(22, 22, size - 44, size - 44);
  ctx.lineWidth = 2;
  ctx.strokeRect(40, 40, size - 80, size - 80);
  ctx.fillStyle = '#7a2a34';
  const step = 48;
  for (let y = 60; y < size - 60; y += step) {
    for (let x = 60; x < size - 60; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + step / 2, y + 6);
      ctx.lineTo(x + step - 6, y + step / 2);
      ctx.lineTo(x + step / 2, y + step - 6);
      ctx.lineTo(x + 6, y + step / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4;
    const n = 0.85 + 0.15 * vnoise((p % size) * 0.9, Math.floor(p / size) * 0.9);
    img.data[i] *= n;
    img.data[i + 1] *= n;
    img.data[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: 1 });
}

export function labelTexture(text, { w = 256, h = 128, color = '#f3ead8', font = 'bold 80px system-ui, sans-serif' } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- calm-room additions ----

export function softDotTexture() {
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Teardrop flame: white-yellow core fading to orange, then transparent.
export function flameTexture() {
  const w = 128, h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = (x - w / 2) / (w / 2);
      const v = y / h; // 0 top, 1 bottom
      const width = 0.25 + 0.75 * Math.sin(Math.PI * Math.min(1, v * 1.15)) ; // narrow at top
      const d = Math.abs(u) / Math.max(width, 0.02);
      const core = Math.max(0, 1 - d);
      const tipFade = v < 0.08 ? v / 0.08 : 1;
      const a = Math.pow(core, 1.6) * tipFade * (v > 0.9 ? (1 - v) / 0.1 : 1);
      const heat = Math.pow(core, 3) * (1 - v * 0.5);
      const i = (y * w + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 120 + 135 * heat;
      img.data[i + 2] = 20 + 230 * Math.pow(heat, 2.5);
      img.data[i + 3] = Math.min(255, a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A leaf with a midrib and side veins; alpha outside the outline.
export function leafTexture({ w = 128, h = 256, light = '#7fb35a', dark = '#2f6a2e' } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 4);
  ctx.bezierCurveTo(4, h * 0.72, 4, h * 0.2, w / 2, 4);
  ctx.bezierCurveTo(w - 4, h * 0.2, w - 4, h * 0.72, w / 2, h - 4);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.clip();
  const rim = ctx.createRadialGradient(w / 2, h * 0.45, w * 0.1, w / 2, h * 0.45, w * 0.95);
  rim.addColorStop(0, 'rgba(255,255,220,0.18)');
  rim.addColorStop(0.7, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,20,0,0.35)');
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(235,245,200,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w / 2, h - 4);
  ctx.lineTo(w / 2, 10);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let i = 1; i < 14; i++) {
    const y = 16 + (i / 14) * (h - 32);
    ctx.beginPath();
    ctx.moveTo(w / 2, y);
    ctx.quadraticCurveTo(w * 0.3, y - 14, 10, y - 40);
    ctx.moveTo(w / 2, y);
    ctx.quadraticCurveTo(w * 0.7, y - 14, w - 10, y - 40);
    ctx.stroke();
  }
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3] === 0) continue;
    const p = i / 4;
    const n = 0.9 + 0.1 * vnoise((p % w) * 0.15, Math.floor(p / w) * 0.15);
    img.data[i] *= n;
    img.data[i + 1] *= n;
    img.data[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Evening sky seen through the window: deep blue above, warm band at the horizon, a few stars.
export function duskTexture({ size = 256 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#0d1738');
  g.addColorStop(0.45, '#2b2f66');
  g.addColorStop(0.72, '#6d4a78');
  g.addColorStop(0.9, '#d98a5c');
  g.addColorStop(1, '#f2b784');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 40; i++) {
    const x = hash(i, 3) * size, y = hash(i, 7) * size * 0.45;
    const r = 0.5 + hash(i, 11) * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Distant hills.
  ctx.fillStyle = '#1b1a2e';
  ctx.beginPath();
  ctx.moveTo(0, size);
  for (let x = 0; x <= size; x += 8) ctx.lineTo(x, size * 0.86 + Math.sin(x * 0.03) * 10 + vnoise(x * 0.05, 1) * 18);
  ctx.lineTo(size, size);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Running-bond brick with mortar lines and per-brick colour variation.
export function brickTexture({ size = 512, repeat = 2 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b9ada0';
  ctx.fillRect(0, 0, size, size);
  const bw = size / 6, bh = size / 16, m = 5;
  for (let row = 0; row < 16; row++) {
    const off = row % 2 ? bw / 2 : 0;
    for (let col = -1; col < 7; col++) {
      const t = hash(col * 13 + row * 7, 21);
      const r = 110 + t * 40, gch = 55 + t * 25, b = 45 + t * 18;
      ctx.fillStyle = `rgb(${r | 0},${gch | 0},${b | 0})`;
      ctx.fillRect(col * bw + off + m / 2, row * bh + m / 2, bw - m, bh - m);
    }
  }
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4;
    const n = 0.85 + 0.15 * vnoise((p % size) * 0.4, Math.floor(p / size) * 0.4);
    img.data[i] *= n;
    img.data[i + 1] *= n;
    img.data[i + 2] *= n;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat });
}

// Soft watercolour wash for framed prints.
export function watercolorTexture(seed = 1, { size = 256 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f3ecdf';
  ctx.fillRect(0, 0, size, size);
  const hues = [[214, 60, 72], [36, 70, 70], [120, 35, 62], [340, 45, 72]];
  for (let i = 0; i < 7; i++) {
    const [h, s, l] = hues[(seed + i) % hues.length];
    const x = hash(i, seed) * size, y = hash(i + 9, seed) * size, r = 40 + hash(i + 3, seed) * 90;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `hsla(${h},${s}%,${l}%,0.55)`);
    g.addColorStop(1, `hsla(${h},${s}%,${l}%,0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- realism pass ----

// Lathe grooves across a cymbal: fine concentric rings in brightness and roughness.
// LatheGeometry maps v along the profile (centre to edge), so the rings vary with v.
export function cymbalTexture({ size = 256 } = {}) {
  const c = makeCanvas(size, size), r = makeCanvas(size, size);
  const ctx = c.getContext('2d'), rctx = r.getContext('2d');
  const img = ctx.createImageData(size, size), rimg = rctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    const ring = 0.5 + 0.5 * Math.sin(y * 1.9) ;
    for (let x = 0; x < size; x++) {
      const n = vnoise(x * 0.3, y * 0.9);
      const b = 0.78 + 0.14 * ring + 0.08 * n;
      const i = (y * size + x) * 4;
      img.data[i] = 220 * b;
      img.data[i + 1] = 180 * b;
      img.data[i + 2] = 95 * b;
      img.data[i + 3] = 255;
      const rough = 0.22 + 0.2 * ring + 0.1 * n;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough * 255;
      rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { map: toTexture(c), roughnessMap: toTexture(r, { srgb: false }) };
}

// Coated drum head: fine white speckle.
export function drumHeadTexture({ size = 256 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const x = i % size, y = Math.floor(i / size);
    const n = 0.86 + 0.1 * vnoise(x * 0.8, y * 0.8) + 0.04 * hash(x, y);
    img.data[i * 4] = 242 * n;
    img.data[i * 4 + 1] = 238 * n;
    img.data[i * 4 + 2] = 228 * n;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: 2 });
}

// Fabric weave as a bump map.
export function weaveTexture({ size = 128, repeat = 8 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const w = 0.5 + 0.25 * Math.sin(x * 0.8) + 0.25 * Math.sin(y * 0.8) + 0.15 * (vnoise(x * 0.5, y * 0.5) - 0.5);
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = w * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat, srgb: false });
}

// Black with alpha fading from the top edge: an ambient-occlusion strip along wall bases.
export function gradientStripTexture({ size = 64 } = {}) {
  const c = makeCanvas(4, size);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.12)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// ---- castle room ----

// Ashlar stone wall: courses of varied-width blocks with mortar and a hint of bevel.
export function stoneWallTexture({ size = 512, repeat = 3, light = [0.72, 0.68, 0.6], dark = [0.5, 0.46, 0.4] } = {}) {
  const c = makeCanvas(size, size), r = makeCanvas(size, size);
  const ctx = c.getContext('2d'), rctx = r.getContext('2d');
  const img = ctx.createImageData(size, size), rimg = rctx.createImageData(size, size);
  const rows = 8, rh = size / rows, mortar = 4;
  // Precompute block boundaries per row.
  const rowsX = [];
  for (let row = 0; row < rows; row++) {
    const xs = [];
    let x = -Math.floor(hash(row, 5) * 120);
    while (x < size) {
      const w = 70 + Math.floor(hash(row * 17 + xs.length * 3, 9) * 90);
      xs.push([x, w]);
      x += w;
    }
    rowsX.push(xs);
  }
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rh);
    const ey = y - row * rh;
    for (let x = 0; x < size; x++) {
      let blockId = 0, ex = 0, bw = 1;
      for (let i = 0; i < rowsX[row].length; i++) {
        const [bx, w] = rowsX[row][i];
        if (x >= bx && x < bx + w) {
          blockId = row * 101 + i;
          ex = x - bx;
          bw = w;
          break;
        }
      }
      const inMortar = ey < mortar || ex < mortar;
      const tone = hash(blockId, 23);
      const n = fbm(x * 0.06, y * 0.06, 3);
      let t = 0.35 + 0.4 * tone + 0.3 * (n - 0.5);
      // bevel: lighter near top/left of block, darker near bottom/right
      const bevel = (ex < 10 || ey < 10 ? 0.08 : 0) - (ex > bw - 8 || ey > rh - 8 ? 0.08 : 0);
      t += bevel;
      t = Math.min(1, Math.max(0, t));
      let rr = lerp(dark[0], light[0], t), gg = lerp(dark[1], light[1], t), bb = lerp(dark[2], light[2], t);
      if (inMortar) {
        rr *= 0.55;
        gg *= 0.55;
        bb *= 0.55;
      }
      const i = (y * size + x) * 4;
      img.data[i] = rr * 255;
      img.data[i + 1] = gg * 255;
      img.data[i + 2] = bb * 255;
      img.data[i + 3] = 255;
      const rough = inMortar ? 1 : 0.8 + 0.15 * n;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough * 255;
      rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { map: toTexture(c, { repeat }), roughnessMap: toTexture(r, { repeat, srgb: false }) };
}

// Flagstone floor: a jittered grid of worn slabs with dark joints.
export function flagstoneTexture({ size = 1024, repeat = 2 } = {}) {
  const c = makeCanvas(size, size), r = makeCanvas(size, size);
  const ctx = c.getContext('2d'), rctx = r.getContext('2d');
  const img = ctx.createImageData(size, size), rimg = rctx.createImageData(size, size);
  const cells = 6, cs = size / cells;
  // Slab rectangles with jittered edges.
  const slabs = [];
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      const x0 = i * cs + hash(i, j) * 18, y0 = j * cs + hash(j, i + 50) * 18;
      const x1 = (i + 1) * cs - 10 - hash(i + 7, j) * 18, y1 = (j + 1) * cs - 10 - hash(j + 9, i) * 18;
      slabs.push({ x0, y0, x1, y1, tone: hash(i * 31 + j, 77) });
    }
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let s = null;
      for (const sl of slabs) if (x >= sl.x0 && x < sl.x1 && y >= sl.y0 && y < sl.y1) { s = sl; break; }
      const n = fbm(x * 0.03, y * 0.03, 3);
      const fine = vnoise(x * 0.5, y * 0.5);
      let t, joint = !s;
      if (s) {
        const edge = Math.min(x - s.x0, s.x1 - x, y - s.y0, s.y1 - y);
        t = 0.3 + 0.35 * s.tone + 0.25 * (n - 0.5) + 0.1 * (fine - 0.5) - (edge < 6 ? 0.08 : 0);
      } else t = 0.12 + 0.1 * n;
      t = Math.min(1, Math.max(0, t));
      const i = (y * size + x) * 4;
      img.data[i] = (0.3 + 0.45 * t) * 255;
      img.data[i + 1] = (0.28 + 0.42 * t) * 255;
      img.data[i + 2] = (0.25 + 0.38 * t) * 255;
      img.data[i + 3] = 255;
      const rough = joint ? 1 : 0.7 + 0.2 * fine;
      rimg.data[i] = rimg.data[i + 1] = rimg.data[i + 2] = rough * 255;
      rimg.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return { map: toTexture(c, { repeat }), roughnessMap: toTexture(r, { repeat, srgb: false }) };
}

// Dusk sky behind a diamond leaded lattice, for the castle windows.
export function leadedDuskTexture({ size = 512 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  const sky = duskTexture({ size }).image;
  ctx.drawImage(sky, 0, 0, size, size);
  ctx.strokeStyle = 'rgba(30,28,30,0.95)';
  ctx.lineWidth = 3;
  const step = size / 7;
  for (let k = -size; k < size * 2; k += step) {
    ctx.beginPath();
    ctx.moveTo(k, 0);
    ctx.lineTo(k + size, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(k + size, 0);
    ctx.lineTo(k, size);
    ctx.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// A painted landscape: sky, sun, layered hazy hills, water or meadow, trees, brushwork and vignette.
export function sceneryTexture(seed = 1, { w = 512, h = 384 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const kind = ['lake', 'hills', 'coast'][seed % 3];
  const palettes = [
    { top: '#2b3f6b', mid: '#8fa9c9', hor: '#f0c48a', sun: '#fff1c4', far: [150, 165, 190], near: [45, 80, 50] },
    { top: '#6f8fc0', mid: '#bcd0e6', hor: '#f4e2c0', sun: '#ffffff', far: [160, 170, 195], near: [60, 95, 55] },
    { top: '#3a2f5a', mid: '#c37a6a', hor: '#f7c48a', sun: '#ffe8b0', far: [120, 110, 140], near: [50, 60, 60] },
  ];
  const P = palettes[seed % palettes.length];
  const horizon = h * (kind === 'coast' ? 0.5 : 0.55);
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, P.top);
  sky.addColorStop(0.6, P.mid);
  sky.addColorStop(1, P.hor);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Sun.
  const sx = w * (0.3 + hash(seed, 3) * 0.4), sy = horizon * (0.55 + hash(seed, 4) * 0.3);
  const sun = ctx.createRadialGradient(sx, sy, 0, sx, sy, 90);
  sun.addColorStop(0, P.sun);
  sun.addColorStop(0.12, P.sun);
  sun.addColorStop(0.3, 'rgba(255,230,180,0.35)');
  sun.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, w, h);
  // Hills, far to near.
  const layers = 4;
  for (let k = 0; k < layers; k++) {
    const f = k / (layers - 1);
    const col = [0, 1, 2].map((i) => Math.round(lerp(P.far[i], P.near[i], f)));
    ctx.fillStyle = `rgb(${col.join(',')})`;
    ctx.beginPath();
    ctx.moveTo(0, h);
    const base = horizon - 10 + k * 22;
    const amp = kind === 'hills' ? 30 + k * 14 : 55 + k * 10;
    for (let x = 0; x <= w; x += 4) {
      const y = base - fbm(x * (0.004 + k * 0.002) + seed * 10 + k * 7, k, 3) * amp * 1.6 + (kind === 'coast' && k === layers - 1 ? 0 : 0);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
  }
  // Water or meadow in the foreground.
  const fy = h * 0.72;
  if (kind !== 'hills') {
    const water = ctx.createLinearGradient(0, fy, 0, h);
    water.addColorStop(0, P.hor);
    water.addColorStop(0.3, P.mid);
    water.addColorStop(1, P.top);
    ctx.fillStyle = water;
    ctx.fillRect(0, fy, w, h - fy);
    ctx.strokeStyle = 'rgba(255,240,210,0.35)';
    for (let i = 0; i < 40; i++) {
      const y = fy + hash(i, seed) * (h - fy);
      const x0 = hash(i + 3, seed) * w, len = 20 + hash(i + 9, seed) * 60;
      ctx.lineWidth = 1 + hash(i + 5, seed) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + len, y);
      ctx.stroke();
    }
  } else {
    const meadow = ctx.createLinearGradient(0, fy, 0, h);
    meadow.addColorStop(0, '#7d9a4e');
    meadow.addColorStop(1, '#3f5a2c');
    ctx.fillStyle = meadow;
    ctx.fillRect(0, fy - 10, w, h - fy + 10);
  }
  // Trees on the sides.
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? 1 : -1;
    const x = w / 2 + side * (w * 0.25 + hash(i, seed + 1) * w * 0.25);
    const y = fy + 6 + hash(i, seed + 2) * (h - fy) * 0.5;
    const s = 14 + hash(i, seed + 3) * 26;
    ctx.fillStyle = `rgb(${30 + hash(i, 4) * 20 | 0},${55 + hash(i, 5) * 25 | 0},${30 | 0})`;
    ctx.beginPath();
    ctx.ellipse(x, y - s, s * 0.6, s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(x - 2, y - s * 0.3, 4, s * 0.6);
  }
  // Brushwork and canvas weave.
  const img = ctx.getImageData(0, 0, w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const stroke = 0.94 + 0.06 * vnoise(x * 0.25, y * 0.9);
      const weave = 0.97 + 0.03 * (Math.sin(x * 1.6) * Math.sin(y * 1.6));
      const dx = x / w - 0.5, dy = y / h - 0.5;
      const vig = 1 - 0.35 * (dx * dx + dy * dy) * 2.2;
      const k = stroke * weave * vig;
      img.data[i] *= k;
      img.data[i + 1] *= k;
      img.data[i + 2] *= k;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Woven wall tapestry: deep red field, gold borders, a grid of fleur-like motifs and a chevron band.
export function tapestryTexture({ w = 512, h = 768, seed = 1 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = seed % 2 ? '#5a1620' : '#1f2e55';
  ctx.fillRect(0, 0, w, h);
  const gold = '#c9a24a';
  ctx.strokeStyle = gold;
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, w - 36, h - 36);
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 36, w - 72, h - 72);
  // Chevron bands top and bottom.
  ctx.fillStyle = gold;
  for (const by of [60, h - 100]) {
    for (let x = 50; x < w - 50; x += 28) {
      ctx.beginPath();
      ctx.moveTo(x, by + 30);
      ctx.lineTo(x + 14, by);
      ctx.lineTo(x + 28, by + 30);
      ctx.lineTo(x + 14, by + 20);
      ctx.closePath();
      ctx.fill();
    }
  }
  // Motif grid.
  const motif = (x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.6, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s * 0.6, y);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - s * 1.4, s * 0.25, 0, Math.PI * 2);
    ctx.arc(x, y + s * 1.4, s * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - s * 0.95, y, s * 0.22, 0, Math.PI * 2);
    ctx.arc(x + s * 0.95, y, s * 0.22, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let j = 0; j < 7; j++) for (let i = 0; i < 5; i++) motif(80 + i * 88 + (j % 2) * 44, 150 + j * 70, 16);
  // Weave.
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4, x = p % w, y = Math.floor(p / w);
    const k = 0.86 + 0.1 * vnoise(x * 0.7, y * 0.7) + 0.04 * Math.sin(y * 2.1);
    img.data[i] *= k;
    img.data[i + 1] *= k;
    img.data[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- modern room ----

// City skyline at dusk seen through a glass wall: sunset sky, far hills, towers with lit windows.
export function cityDuskTexture({ w = 2048, h = 1024 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1a2550');
  sky.addColorStop(0.4, '#4a3f7a');
  sky.addColorStop(0.68, '#c86a7a');
  sky.addColorStop(0.82, '#f0a070');
  sky.addColorStop(1, '#f7c58a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  // Stars high up and a low sun glow.
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (let i = 0; i < 90; i++) {
    ctx.beginPath();
    ctx.arc(hash(i, 1) * w, hash(i, 2) * h * 0.35, 0.6 + hash(i, 3) * 1.2, 0, Math.PI * 2);
    ctx.fill();
  }
  const sg = ctx.createRadialGradient(w * 0.62, h * 0.8, 0, w * 0.62, h * 0.8, h * 0.45);
  sg.addColorStop(0, 'rgba(255,220,170,0.55)');
  sg.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w, h);
  // Far hills.
  ctx.fillStyle = '#3a2f55';
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, h * 0.78 - fbm(x * 0.0015, 3, 3) * h * 0.12);
  ctx.lineTo(w, h);
  ctx.fill();
  // Buildings: two depth layers, lit windows on the near layer.
  const layer = (count, yBase, hMin, hMax, color, lit) => {
    let x = -20;
    let i = 0;
    while (x < w + 40) {
      const bw = 40 + hash(i, yBase) * 110;
      const bh = hMin + hash(i + 7, yBase) * (hMax - hMin);
      ctx.fillStyle = color;
      ctx.fillRect(x, yBase - bh, bw, bh + 10);
      if (hash(i + 3, yBase) > 0.6) ctx.fillRect(x + bw * 0.3, yBase - bh - 18, bw * 0.4, 18); // roof block
      if (lit) {
        const cols = Math.floor(bw / 12), rows = Math.floor(bh / 16);
        for (let r = 0; r < rows; r++) {
          for (let cc = 0; cc < cols; cc++) {
            const on = hash(i * 131 + r * 17 + cc * 3, 9) > 0.55;
            if (!on) continue;
            const warm = hash(i + r + cc, 4) > 0.3;
            ctx.fillStyle = warm ? 'rgba(255,214,140,0.95)' : 'rgba(190,225,255,0.9)';
            ctx.fillRect(x + 4 + cc * 12, yBase - bh + 6 + r * 16, 6, 8);
          }
        }
      }
      x += bw + 6 + hash(i + 11, yBase) * 30;
      i++;
    }
  };
  layer(40, h * 0.9, h * 0.08, h * 0.35, '#2a2440', false);
  layer(40, h, h * 0.1, h * 0.5, '#16131f', true);
  // Water band at the bottom with reflected lights.
  const wg = ctx.createLinearGradient(0, h * 0.96, 0, h);
  wg.addColorStop(0, 'rgba(40,40,70,0.8)');
  wg.addColorStop(1, 'rgba(20,20,40,1)');
  ctx.fillStyle = wg;
  ctx.fillRect(0, h * 0.96, w, h * 0.04);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}

// Modern rug: warm grey wool with faint diagonal weave and a tone-on-tone border.
export function modernRugTexture({ size = 512 } = {}) {
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b7b1a8';
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = '#a39d93';
  ctx.lineWidth = 14;
  ctx.strokeRect(28, 28, size - 56, size - 56);
  const img = ctx.getImageData(0, 0, size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const p = i / 4, x = p % size, y = Math.floor(p / size);
    const k = 0.9 + 0.06 * vnoise(x * 0.6, y * 0.6) + 0.04 * Math.sin((x + y) * 0.9);
    img.data[i] *= k;
    img.data[i + 1] *= k;
    img.data[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { repeat: 1 });
}

// ---- night outside ----

// Night sky: deep navy, many stars, a moon with a halo, thin cloud, dark hills with town lights.
export function nightSkyTexture({ w = 2048, h = 1024 } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#040814');
  sky.addColorStop(0.55, '#0b1430');
  sky.addColorStop(0.8, '#182448');
  sky.addColorStop(1, '#223058');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1100; i++) {
    const x = hash(i, 1) * w, y = hash(i, 2) * h * 0.78;
    const r = 0.8 + Math.pow(hash(i, 3), 3) * 3.2;
    const a = 0.6 + hash(i, 4) * 0.4;
    ctx.fillStyle = hash(i, 5) > 0.85 ? `rgba(200,220,255,${a})` : `rgba(255,250,235,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // Thin cloud band.
  const cimg = ctx.getImageData(0, 0, w, h);
  for (let y = Math.floor(h * 0.3); y < h * 0.6; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const n = fbm(x * 0.003, y * 0.012, 3);
      const band = Math.exp(-Math.pow((y - h * 0.45) / (h * 0.08), 2));
      const a = Math.max(0, n - 0.5) * band * 0.5;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      cimg.data[i] += (90 - cimg.data[i]) * a;
      cimg.data[i + 1] += (100 - cimg.data[i + 1]) * a;
      cimg.data[i + 2] += (140 - cimg.data[i + 2]) * a;
    }
  }
  ctx.putImageData(cimg, 0, 0);
  // Moon.
  const mx = w * 0.62, my = h * 0.42;
  const halo = ctx.createRadialGradient(mx, my, 20, mx, my, 160);
  halo.addColorStop(0, 'rgba(220,230,255,0.35)');
  halo.addColorStop(1, 'rgba(220,230,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#f2f3ea';
  ctx.beginPath();
  ctx.arc(mx, my, 26, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,185,175,0.5)';
  for (let i = 0; i < 6; i++) {
    ctx.beginPath();
    ctx.arc(mx - 12 + hash(i, 7) * 24, my - 12 + hash(i, 8) * 24, 2 + hash(i, 9) * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Hills, two layers, with a sprinkle of town lights on the near one.
  for (const [k, col, base, amp] of [[0, '#0d1226', 0.82, 0.09], [1, '#070a16', 0.9, 0.06]]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) ctx.lineTo(x, h * base - fbm(x * 0.0012 + k * 5, k, 3) * h * amp);
    ctx.lineTo(w, h);
    ctx.fill();
  }
  for (let i = 0; i < 160; i++) {
    const x = hash(i, 11) * w, y = h * (0.9 + hash(i, 12) * 0.08);
    ctx.fillStyle = hash(i, 13) > 0.3 ? 'rgba(255,205,130,0.9)' : 'rgba(200,225,255,0.8)';
    ctx.fillRect(x, y, 1.5 + hash(i, 14) * 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = 8;
  return t;
}
