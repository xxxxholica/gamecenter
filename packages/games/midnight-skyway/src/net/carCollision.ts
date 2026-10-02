/** 車2台(向き付きの長方形)の重なり判定。xz平面。向きは車の前方=(sin r, cos r)。 */
export const CAR_HALF_W = 0.85;
export const CAR_HALF_L = 1.75;

export interface Push {
  /** 自車を押し戻す向き(相手→自車、単位ベクトル) */
  nx: number;
  nz: number;
  /** めり込み量(m) */
  depth: number;
}

/** 自車Aが相手Bに重なっていれば、Aを押し戻す向きとめり込み量を返す(SAT)。 */
export function carOverlap(ax: number, az: number, ar: number, bx: number, bz: number, br: number): Push | null {
  const dx = ax - bx, dz = az - bz;
  if (dx * dx + dz * dz > 5 * 5) return null;
  const aF = [Math.sin(ar), Math.cos(ar)], aR = [Math.cos(ar), -Math.sin(ar)];
  const bF = [Math.sin(br), Math.cos(br)], bR = [Math.cos(br), -Math.sin(br)];
  const axes = [aF, aR, bF, bR];
  let best: Push | null = null;
  for (const [nx, nz] of axes) {
    const rA = CAR_HALF_W * Math.abs(nx * aR[0] + nz * aR[1]) + CAR_HALF_L * Math.abs(nx * aF[0] + nz * aF[1]);
    const rB = CAR_HALF_W * Math.abs(nx * bR[0] + nz * bR[1]) + CAR_HALF_L * Math.abs(nx * bF[0] + nz * bF[1]);
    const dist = dx * nx + dz * nz;
    const overlap = rA + rB - Math.abs(dist);
    if (overlap <= 0) return null;                 // 分離軸が見つかった=重なっていない
    if (!best || overlap < best.depth) {
      const sign = dist >= 0 ? 1 : -1;
      best = { nx: nx * sign, nz: nz * sign, depth: overlap };
    }
  }
  return best;
}
