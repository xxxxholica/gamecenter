import * as THREE from 'three';

/**
 * 光・煙・水の粒などの、円形のぼかしテクスチャを作る。stops は [位置(0〜1), 色] の列。
 * inner: 中心の塗りつぶしの半径(px)、glint: 十字のきらめき線の色(指定すると描く)。
 */
export function radialTexture(size: number, stops: ReadonlyArray<readonly [number, string]>, inner = 0, glint?: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const h = size / 2;
  const grad = g.createRadialGradient(h, h, inner, h, h, h - 1);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  if (glint) {
    g.strokeStyle = glint;
    g.lineWidth = size / 25;
    g.beginPath();
    g.moveTo(h, size * 0.125);
    g.lineTo(h, size * 0.875);
    g.moveTo(size * 0.125, h);
    g.lineTo(size * 0.875, h);
    g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
