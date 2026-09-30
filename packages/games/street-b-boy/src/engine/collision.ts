import * as THREE from 'three';
import type { BoundingBox2D } from '../entities/player';

/**
 * 当たり判定の種類。ゲーム内の「触れるもの」はすべてこのどれかに属する。
 *  - solid   : 上に乗れる / 横は壁 / 下から頭突き (地面・ブロック・缶・消火栓本体・スピーカー)
 *  - oneWay  : 下からは通り抜け、上からだけ着地できる薄い足場板・ゴンドラ
 *  - trigger : 触れると効果が出るだけで体は止めない (カセット・蒸気・水柱・レール・ゴール)
 *  - hazard  : 触れるとミス (レーザー・敵・敵弾)
 * 背景の装飾は判定なし(このリストには載らない)。
 */
export type CollisionKind = 'solid' | 'oneWay' | 'trigger' | 'hazard';

export interface CollisionShape {
  kind: CollisionKind;
  box: BoundingBox2D;
}

/** デバッグ表示では、プレイヤー本体と攻撃の判定も別の色で描く */
export type DebugShapeKind = CollisionKind | 'player' | 'attack';

export interface DebugShape {
  kind: DebugShapeKind;
  box: BoundingBox2D;
}

/** oneWay 扱いにする足場板の最大の厚み。これ以下の板は下から通り抜けられる */
export const ONE_WAY_MAX_THICKNESS = 0.6;

const KIND_COLORS: Record<DebugShapeKind, number> = {
  solid: 0x00ff66,
  oneWay: 0x3399ff,
  trigger: 0xffee00,
  hazard: 0xff2244,
  player: 0xffffff,
  attack: 0xff00ff
};

const MAX_SHAPES = 512;

/** URL に ?debug=collision を付けたときだけ、全AABBを種類別の色で描画する開発用オーバーレイ */
export class CollisionDebugOverlay {
  public static isRequested(): boolean {
    try {
      return new URLSearchParams(window.location.search).get('debug') === 'collision';
    } catch {
      return false;
    }
  }

  private lines: THREE.LineSegments;
  private positions: Float32Array;
  private colors: Float32Array;

  constructor(scene: THREE.Scene) {
    // 1箱 = 12辺 = 24頂点
    this.positions = new Float32Array(MAX_SHAPES * 24 * 3);
    this.colors = new Float32Array(MAX_SHAPES * 24 * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, 0);
    const mat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 999;
    scene.add(this.lines);
  }

  public update(shapes: DebugShape[]): void {
    const c = new THREE.Color();
    let v = 0;
    const count = Math.min(shapes.length, MAX_SHAPES);
    for (let i = 0; i < count; i++) {
      const { kind, box } = shapes[i];
      if (box.w <= 0 || box.h <= 0) continue;
      c.setHex(KIND_COLORS[kind]);
      const x0 = box.x;
      const x1 = box.x + box.w;
      const y0 = box.y;
      const y1 = box.y + box.h;
      const z = 1.5;
      // 手前の矩形(4辺)だけ描けば2Dの判定として十分
      const edges = [
        [x0, y0, x1, y0],
        [x1, y0, x1, y1],
        [x1, y1, x0, y1],
        [x0, y1, x0, y0]
      ];
      for (const [ax, ay, bx, by] of edges) {
        this.positions.set([ax, ay, z, bx, by, z], v * 3);
        this.colors.set([c.r, c.g, c.b, c.r, c.g, c.b], v * 3);
        v += 2;
      }
    }
    const geo = this.lines.geometry;
    geo.setDrawRange(0, v);
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.lines);
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }
}
