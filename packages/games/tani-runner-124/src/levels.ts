// ============================================================
// Levels: 小学生 / 中学生 / 高専生
//  レベルごとに、ゲートに出る数式の種類(語彙)・卒業要件・障害物の厳しさを変える
// ============================================================

export type LevelId = 'elementary' | 'middle' | 'kosen';

export interface LevelConfig {
  id: LevelId;
  label: string;
  /** レベル選択に出す一言(どんな数式が出るか) */
  description: string;
  /** 卒業要件の候補と、抽選の重み */
  requirements: { value: number; weight: number }[];
  /** 全員が片側を選び続けた場合の最終人数が、要件の何倍以上になる並びだけを採用するか(小さいほど厳しい) */
  margin: number;
  /** 逆に、全員が片側を選び続けた最終人数が要件の何倍を超える並びは採用しない(楽すぎるコースを除く) */
  maxPure: number;
  /** ゲートの組の配分: 良い vs 悪い / かけ算 vs 足し算 / 足し算 vs 足し算 / 悪い vs 悪い(どちらを選んでも減る) */
  patterns: { goodBad: number; multAdd: number; addAdd: number; badBad: number };
  /** 「悪い vs 悪い」に、引き算同士・割り算同士の組も混ぜるか */
  badPairVariants: boolean;
  /** 1コースに最低いくつ「悪い vs 悪い」を入れるか(条件を満たすコースだけを採用する) */
  minBadBad: number;
  obstacle: {
    widthMin: number;
    widthMax: number;
    /** この番号の区間(0始まり)から、左右に揺れる障害物が出る */
    swayFromGap: number;
    swayChance: number;
  };
  /** 区間に置くものの配分(累積): 障害物のみ → アイテムのみ → 障害物+アイテム → ボーナス列、残りはアイテムのみ */
  mix: { obstacleOnly: number; pickupOnly: number; both: number; bonusRow: number };
  /** アイテムの加算量の倍率 */
  pickupScale: number;
  /** ボーナス飛行のリング成功に必要な、通過割合 */
  ringPassRatio: number;
  /** ボーナス飛行の加速回数 */
  maxBoosts: number;
}

export const LEVELS: Record<LevelId, LevelConfig> = {
  elementary: {
    id: 'elementary',
    label: '小学生',
    description: 'たし算・ひき算・かけ算・わり算',
    requirements: [
      { value: 70, weight: 0.3 },
      { value: 90, weight: 0.4 },
      { value: 110, weight: 0.3 }
    ],
    margin: 1.25,
    maxPure: 2.0,
    patterns: { goodBad: 0.35, multAdd: 0.3, addAdd: 0.2, badBad: 0.15 },
    badPairVariants: false,
    minBadBad: 0,
    obstacle: { widthMin: 2.4, widthMax: 3.4, swayFromGap: 99, swayChance: 0 },
    mix: { obstacleOnly: 0.25, pickupOnly: 0.3, both: 0.3, bonusRow: 0.15 },
    pickupScale: 0.8,
    ringPassRatio: 0.2,
    maxBoosts: 4
  },
  middle: {
    id: 'middle',
    label: '中学生',
    description: '一次式・√・x²・割合(%)',
    requirements: [
      { value: 115, weight: 0.25 },
      { value: 140, weight: 0.4 },
      { value: 165, weight: 0.35 }
    ],
    margin: 1.2,
    maxPure: 1.85,
    patterns: { goodBad: 0.35, multAdd: 0.3, addAdd: 0.2, badBad: 0.15 },
    badPairVariants: false,
    minBadBad: 0,
    obstacle: { widthMin: 3.0, widthMax: 4.4, swayFromGap: 3, swayChance: 0.4 },
    mix: { obstacleOnly: 0.4, pickupOnly: 0.3, both: 0.2, bonusRow: 0.1 },
    pickupScale: 1.0,
    ringPassRatio: 0.3,
    maxBoosts: 3
  },
  kosen: {
    id: 'kosen',
    label: '高専生',
    description: '積分・微分・固有値・極限',
    // 卒業要件はタイトルの124単位固定。最大でもギリギリ届く水準に調整
    requirements: [
      { value: 124, weight: 1.0 }
    ],
    margin: 1.00,
    maxPure: 1.06,
    // 高専生だけ、どちらを選んでも減る組を大幅に増やす(ましな方を選ぶ、分けて被害を抑える判断が増える)
    patterns: { goodBad: 0.25, multAdd: 0.2, addAdd: 0.1, badBad: 0.45 },
    badPairVariants: true,
    minBadBad: 2,
    obstacle: { widthMin: 3.4, widthMax: 4.8, swayFromGap: 2, swayChance: 0.55 },
    mix: { obstacleOnly: 0.65, pickupOnly: 0.15, both: 0.15, bonusRow: 0.05 },
    pickupScale: 0.2,
    ringPassRatio: 0.35,
    maxBoosts: 3
  }
};

export const LEVEL_ORDER: LevelId[] = ['elementary', 'middle', 'kosen'];
export const DEFAULT_LEVEL: LevelId = 'middle';

const LEVEL_STORAGE_KEY = 'tani_runner_level';

export function loadLevel(): LevelId {
  try {
    const raw = localStorage.getItem(LEVEL_STORAGE_KEY);
    if (raw === 'elementary' || raw === 'middle' || raw === 'kosen') return raw;
  } catch {
    // 保存できない環境では既定のレベル
  }
  return DEFAULT_LEVEL;
}

export function saveLevel(level: LevelId): void {
  try {
    localStorage.setItem(LEVEL_STORAGE_KEY, level);
  } catch {
    // 保存できなくても遊べる
  }
}

/** 卒業要件を、レベルの候補から重み付きで抽選する */
export function pickRequirementFor(level: LevelId, rng: () => number = Math.random): number {
  const list = LEVELS[level].requirements;
  const total = list.reduce((a, r) => a + r.weight, 0);
  let roll = rng() * total;
  for (const r of list) {
    roll -= r.weight;
    if (roll <= 0) return r.value;
  }
  return list[list.length - 1].value;
}
