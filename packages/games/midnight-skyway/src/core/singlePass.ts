import * as THREE from 'three';

/**
 * 透明で両面の素材を、1回で描く設定(forceSinglePass)にする。
 * three.js はこの素材を、裏面 → 表面の2回に分けて描き、そのたびに material.needsUpdate = true にして、シェーダの照合(getParameters など)をやり直す。
 * ガラス・半透明の欄干・路面のエフェクトなどが視界に数個あるだけで、1フレームに十数回(計測: 5秒で約9,000回)。
 * 並べ替えの違いは、同じ色で薄く重なるだけの素材ではほとんど見えない。
 * @returns 設定を変えた素材の数
 */
export function forceSinglePassForTransparent(root: THREE.Object3D): number {
  let changed = 0;
  root.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      if (m.transparent && m.side === THREE.DoubleSide && !m.forceSinglePass) { m.forceSinglePass = true; changed++; }
    }
  });
  return changed;
}
