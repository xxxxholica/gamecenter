// ミニマップの折れ線を、映る範囲の近くだけ描くための、純粋な関数(DriveHUD から切り出して、単体でテストできるようにしている)。

/** ミニマップのキャンバスの1辺(px)。DriveHUD の MAP_SIZE と同じ */
export const MINIMAP_SIZE = 270;

/** この距離(キャンバスの px。自車が原点)より遠い線分は、ミニマップの枠の外なので描かない。枠の一番遠い角までは MAP_SIZE 未満。 */
const MINIMAP_DRAW_RADIUS = MINIMAP_SIZE * 1.1;

/**
 * 折れ線を、ミニマップに映る範囲の近くだけ ctx のパスに足す(closed なら最後の点から最初の点への線分も)。
 * コース全体(数千点)を、影のぼかし付きで毎フレーム描くと、キャンバスの描画だけで1フレームの約0.7ms(Firefox)かかる。
 * 両端が範囲の外にある線分は、枠の中を通らない(枠より長い線分は、念のため描く)ので、見た目は変わらない。
 */
export function tracePolylineNear(
  ctx: Pick<CanvasRenderingContext2D, 'moveTo' | 'lineTo'>,
  pts: readonly { x: number; y: number }[],
  closed: boolean,
  toCanvas: (x: number, z: number) => [number, number],
): void {
  const n = pts.length;
  if (n === 0) return;
  const R2 = MINIMAP_DRAW_RADIUS * MINIMAP_DRAW_RADIUS;
  let px = 0, py = 0, pNear = false, pen = false;
  const segs = closed ? n + 1 : n;
  for (let i = 0; i < segs; i++) {
    const p = pts[i % n];
    const [cx, cy] = toCanvas(p.x, p.y);
    const near = cx * cx + cy * cy <= R2;
    if (i > 0) {
      const long = (cx - px) * (cx - px) + (cy - py) * (cy - py) > R2;
      if (near || pNear || long) {
        if (!pen) { ctx.moveTo(px, py); pen = true; }
        ctx.lineTo(cx, cy);
      } else {
        pen = false;
      }
    }
    px = cx; py = cy; pNear = near;
  }
}
