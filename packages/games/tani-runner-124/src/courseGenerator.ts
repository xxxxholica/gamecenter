// ============================================================
// Course items: ゲートの間に置く障害物(課題)とアイテム(友達)、ボーナス飛行のリング
// ============================================================

import type { Rng } from './gateGenerator.ts';
import { LEVELS, pickRequirementFor } from './levels.ts';
import type { LevelId } from './levels.ts';

/** 隊列を減らす障害物。一部は左右に揺れる */
export interface ObstacleSpec {
  z: number;
  centerX: number;
  width: number;
  /** 左右に揺れる幅(0なら動かない) */
  sway: number;
  swaySpeed: number;
  phase: number;
}

/** 近くを通ると人数が増えるアイテム */
export interface PickupSpec {
  z: number;
  x: number;
  value: number;
}

export interface RingSpec {
  z: number;
  x: number;
}

export interface CourseItems {
  obstacles: ObstacleSpec[];
  pickups: PickupSpec[];
}

/** 卒業要件の抽選(レベルごとの候補から、重み付きで選ぶ) */
export function pickRequirement(level: LevelId = 'kosen', rng: Rng = Math.random): number {
  return pickRequirementFor(level, rng);
}

const TRACK_HALF = 5.0;

/**
 * 各ゲートの間(最後のゲートと壁の間を除く)に、障害物・アイテム・ボーナス列のどれかを置く。
 * 配分・障害物の幅・揺れやすさ・アイテムの量はレベルで変わる(levels.ts)。ボーナス列は最大2回。
 * 障害物は道幅(10)の一部だけを塞ぐので、必ず避けて通れる。
 */
export function generateCourseItems(gateZs: number[], level: LevelId = 'kosen', rng: Rng = Math.random): CourseItems {
  const cfg = LEVELS[level];
  const mixCut1 = cfg.mix.obstacleOnly;
  const mixCut2 = mixCut1 + cfg.mix.pickupOnly;
  const mixCut3 = mixCut2 + cfg.mix.both;
  const obstacles: ObstacleSpec[] = [];
  const pickups: PickupSpec[] = [];
  const boundaries = [0, ...gateZs];
  let bonusRows = 0;

  for (let i = 0; i < boundaries.length - 1; i++) {
    const zMid = (boundaries[i] + boundaries[i + 1]) / 2 + (rng() - 0.5) * 8;
    const roll = rng();
    const pickupValue = () => Math.max(4, Math.min(30, Math.round((6 + i * 1.6 + rng() * 6) * cfg.pickupScale)));

    const makeObstacle = (): ObstacleSpec => {
      const width = cfg.obstacle.widthMin + rng() * (cfg.obstacle.widthMax - cfg.obstacle.widthMin);
      const swaying = i >= cfg.obstacle.swayFromGap && rng() < cfg.obstacle.swayChance;
      const sway = swaying ? 1.4 + rng() * 0.8 : 0;
      const maxCenter = TRACK_HALF - width / 2 - sway - 0.3;
      return {
        z: zMid,
        centerX: (rng() * 2 - 1) * Math.max(0, maxCenter),
        width,
        sway,
        swaySpeed: 1.2 + rng() * 0.8,
        phase: rng() * Math.PI * 2
      };
    };

    if (roll < mixCut1) {
      obstacles.push(makeObstacle());
    } else if (roll < mixCut2) {
      pickups.push({ z: zMid, x: (rng() * 2 - 1) * 3.4, value: pickupValue() });
    } else if (roll < mixCut3) {
      const ob = makeObstacle();
      obstacles.push(ob);
      // 障害物の反対側に置く(避ける先で拾える)
      const side = ob.centerX >= 0 ? -1 : 1;
      pickups.push({ z: zMid - 4, x: side * (1.6 + rng() * 1.8), value: pickupValue() });
    } else if (bonusRows < 2) {
      bonusRows++;
      // ボーナス列: ジグザグに5個。左右に振って全部拾うほど得
      for (let k = 0; k < 5; k++) {
        pickups.push({ z: zMid + 8 - k * 4, x: (k % 2 === 0 ? -1 : 1) * (1.4 + rng() * 1.6), value: Math.max(4, Math.round(pickupValue() * 0.6)) });
      }
    } else {
      pickups.push({ z: zMid, x: (rng() * 2 - 1) * 3.4, value: pickupValue() });
    }
  }

  return { obstacles, pickups };
}

/** ボーナス飛行のリング(倍率ゾーンの上空)。通り抜けると取得単位が増える */
export function generateRings(wallZ: number, rng: Rng = Math.random): RingSpec[] {
  return [wallZ - 70, wallZ - 190, wallZ - 330].map((z) => ({ z, x: (rng() * 2 - 1) * 3.2 }));
}
