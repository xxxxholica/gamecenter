import * as THREE from 'three';
import type { CarBase } from '../models/CarBase';
import { DragonCarModel } from '../models/DragonCarModel';

/**
 * ブースト演出の車ごとの違い。炎・火花・衝撃波・光跡・風切りの筋・画面のフレアの色は、すべて主色(primary)から決める。
 * kind は色以外の演出の違い: fire=炎息(火の粉が舞う) / storm=雷(車の横を電撃が走る) / radiant=黄金の咆哮(4連ノズル・三重の衝撃波・金の粉)。
 */
export type BoostKind = 'default' | 'fire' | 'storm' | 'radiant';

export interface BoostTheme {
  kind: BoostKind;
  /** 主色(炎の外側・火花・衝撃波・光跡) */
  primary: THREE.Color;
  /** 風切りの筋・画面端の筋の色(主色を白に寄せたもの) */
  streak: THREE.Color;
  /** 車の下のアンダーグロー */
  glow: THREE.Color;
  /** アナモルフィックフレアの色味 */
  flare: THREE.Color;
  /** 排気口の炎: 1回に出す粒数 / 大きさ / 寿命 / 立ち上る速さ(m/s) / 濃さ。粒数×大きさ²×寿命×濃さが炎の明るさ(白飛びしないよう、既定の1.3倍程度に収める) */
  flame: { count: number; size: number; life: number; rise: number; alpha: number };
  /** 走行中の HUD の主色(暗い背景で読める明るさに調整した、主色の近似) */
  hud: string;
  /** ブーストに入った瞬間のパンチ: FOV / カメラ距離 / カメラの揺れ / 閃光 */
  punch: { fov: number; dist: number; trauma: number; flash: number };
}

const white = new THREE.Color(1, 1, 1);

function theme(kind: BoostKind, hud: string, primary: number[], glow: number[], flare: number[],
  flame: BoostTheme['flame'], punch: BoostTheme['punch']): BoostTheme {
  const p = new THREE.Color(primary[0], primary[1], primary[2]);
  return {
    kind,
    primary: p,
    streak: p.clone().lerp(white, 0.3),
    glow: new THREE.Color(glow[0], glow[1], glow[2]),
    flare: new THREE.Color(flare[0], flare[1], flare[2]),
    hud,
    flame,
    punch,
  };
}

export const BOOST_THEMES: Record<BoostKind, BoostTheme> = {
  // 既存の青白いブースト(ドラゴン・カー以外)
  default: theme('default', '#8ec9dc', [0.25, 0.6, 1], [0.55, 0.9, 1], [0.45, 0.72, 1],
    { count: 3, size: 1, life: 1, rise: 0.3, alpha: 0.95 }, { fov: 14, dist: 2.4, trauma: 0.45, flash: 1 }),
  // Crimson: 紅蓮。炎が大きく長く、上へ燃え立つ(白飛びしないよう明るさを抑える)
  fire: theme('fire', '#ff8a5c', [0.78, 0.16, 0.04], [0.55, 0.20, 0.04], [0.55, 0.25, 0.08],
    { count: 2, size: 0.85, life: 0.95, rise: 1.0, alpha: 0.35 }, { fov: 14, dist: 2.4, trauma: 0.5, flash: 0.55 }),
  // Azure: 蒼雷。炎は細く鋭く、FOV が大きく開く
  storm: theme('storm', '#52d9ff', [0.1, 0.8, 1], [0.2, 0.85, 1], [0.3, 0.85, 1],
    { count: 3, size: 0.8, life: 0.8, rise: 0.1, alpha: 1 }, { fov: 18, dist: 2.8, trauma: 0.35, flash: 1.25 }),
  // Gold: 黄金。重く厚い炎と、大きな揺れ(4連ノズルでも眩しくならないよう明るさを抑える)
  radiant: theme('radiant', '#ffc84a', [0.75, 0.56, 0.12], [0.52, 0.38, 0.10], [0.52, 0.40, 0.16],
    { count: 2, size: 0.68, life: 0.8, rise: 0.4, alpha: 0.35 }, { fov: 11, dist: 2.0, trauma: 0.72, flash: 0.5 }),
};

const VARIANT_KIND = { a: 'fire', b: 'storm', c: 'radiant' } as const;

export function boostThemeFor(car: CarBase | null | undefined): BoostTheme {
  return car instanceof DragonCarModel ? BOOST_THEMES[VARIANT_KIND[car.variant]] : BOOST_THEMES.default;
}
