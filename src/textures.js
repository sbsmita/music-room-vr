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
