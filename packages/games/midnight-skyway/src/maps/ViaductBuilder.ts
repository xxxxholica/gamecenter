import * as THREE from 'three';
import { mulberry32 } from '../../../../shared/online/seededRandom';

/** Highway asphalt: solid edge lines and ONE dashed centre line (two lanes). */
export function makeHighwayTexture(roadWidth: number, repeatMetres: number): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4b4c50';
  g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  const rand = mulberry32(101);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const pxPerM = W / roadWidth;
  // wheel-track wear in each lane
  for (const f of [1 / 4, 3 / 4]) {
    const cx = W * f, grad = g.createLinearGradient(cx - 60, 0, cx + 60, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, 'rgba(15,15,18,0.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(cx - 60, 0, 120, H);
  }
  g.fillStyle = 'rgba(238,238,232,0.95)';
  const lw = 0.18 * pxPerM;
  g.fillRect(0.35 * pxPerM, 0, lw, H);                 // left edge line
  g.fillRect(W - 0.35 * pxPerM - lw, 0, lw, H);        // right edge line
  const pxPerMAlong = H / repeatMetres;
  const dash = 4 * pxPerMAlong;                        // 4 m dash, 4 m gap (repeat 16 m -> 2 dashes)
  for (let y = 0; y < H; y += dash * 2) g.fillRect(W / 2 - lw / 2, y, lw, dash);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}
