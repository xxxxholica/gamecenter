// ============================================================
// Gate generation: 毎回ランダムな8組のゲートを作る
//  - 良い側 vs 悪い側だけでなく、「かけ算 vs 足し算」「どちらも減る」組を混ぜて、人数に応じた判断を要求する
//  - 最善手を選び続けた場合に 124 を超えられる(150〜400)ことを検証してから採用する
// ============================================================

import type { GateInfo, MathOpType } from './textures.ts';
import { LEVELS } from './levels.ts';
import type { LevelId } from './levels.ts';

export interface GateConfig {
  z: number;
  left: GateInfo;
  right: GateInfo;
}

export type Rng = () => number;

/** ゲート1つを人数 count の隊列に適用した結果(生き残る人数と、消えた人数) */
export function gateResult(count: number, info: GateInfo): { survivors: number; eliminated: number } {
  if (count <= 0) {
    return { survivors: 0, eliminated: 0 };
  }

  if (info.isPositive) {
    let survivors = count;
    switch (info.type) {
      case 'integral_double':
      case 'tensor_prod':
      case 'eigen_boost':
        survivors = count * 2;
        break;
      case 'integral_triple':
        survivors = count * 3;
        break;
      case 'integral_add':
      case 'series_sum':
      case 'limit_inf':
        survivors = count + info.value;
        break;
      case 'affine':
        // ax + b (a は info.factor、b は info.value)
        survivors = Math.floor(count * (info.factor ?? 2) + info.value);
        break;
      case 'square':
        // x²。増えすぎないよう、人数の10倍を上限にする
        survivors = Math.min(count * count, count * 10);
        break;
      case 'percent_up':
        survivors = Math.floor(count * 1.5);
        break;
      default:
        survivors = count * (info.value || 1);
        break;
    }
    return { survivors, eliminated: 0 };
  }

  let survivors = 0;
  switch (info.type) {
    case 'diff_1st':
    case 'eigen_decay':
      survivors = Math.max(0, Math.floor(count / 2));
      break;
    case 'diff_2nd':
      survivors = Math.max(0, Math.floor(count / 3));
      break;
    case 'sqrt':
      survivors = Math.floor(Math.sqrt(count));
      break;
    case 'percent_down':
      // value は残る割合[%]
      survivors = Math.max(0, Math.floor((count * info.value) / 100));
      break;
    default:
      // diff_partial / kernel / coker / divergence: 固定数が抜ける
      survivors = Math.max(0, count - info.value);
      break;
  }
  return { survivors, eliminated: count - survivors };
}

// ---- ゲートの部品(レベルごとの語彙) ----
/** ゲートを作る道具一式。レベルごとに、出てくる数式の種類が違う */
interface GatePool {
  /** 人数を増やす掛け算系。pure は今の人数(x² は少人数のときだけ出す) */
  makeMultiplier(rng: Rng, pure: number): GateInfo;
  /** 足し算系。amount は増やしたい人数の目安、count は今の人数(中学生は「文字式」にするため、人数を見て係数と定数を決める) */
  makeAdder(amount: number, rng: Rng, count: number): GateInfo;
  /** 割り算系(人数が割合で減る) */
  makeDivision(rng: Rng): GateInfo;
  /** 引き算系。amount は減らしたい人数の目安、count は今の人数 */
  makeSubtractor(amount: number, rng: Rng, count: number): GateInfo;
}

function pick<T>(list: T[], rng: Rng): T {
  return list[Math.floor(rng() * list.length)];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// 高専生: 積分・微分・固有値・極限
const KOSEN_MULT: { type: MathOpType; label: string; factor: number }[] = [
  { type: 'integral_double', label: '∬', factor: 2 },
  { type: 'tensor_prod', label: '⊗2', factor: 2 },
  { type: 'eigen_boost', label: 'λ=2', factor: 2 },
  { type: 'integral_triple', label: '∭', factor: 3 }
];
const KOSEN_ADD: { type: MathOpType; symbol: string }[] = [
  { type: 'integral_add', symbol: '∫' },
  { type: 'series_sum', symbol: '∑' },
  { type: 'limit_inf', symbol: 'lim ∞' }
];
const KOSEN_DIV: { type: MathOpType; label: string }[] = [
  { type: 'diff_1st', label: 'd/dx' },
  { type: 'eigen_decay', label: 'λ=0.5' },
  { type: 'diff_2nd', label: 'd²/dx²' }
];
const KOSEN_SUB: { type: MathOpType; symbol: string }[] = [
  { type: 'diff_partial', symbol: '∂/∂x' },
  { type: 'kernel', symbol: 'ker' },
  { type: 'coker', symbol: 'coker' },
  { type: 'divergence', symbol: '∇・F' }
];

const KOSEN_POOL: GatePool = {
  makeMultiplier(rng) {
    // ×3 は強いので出にくくする
    const part = rng() < 0.22 ? KOSEN_MULT[3] : pick(KOSEN_MULT.slice(0, 3), rng);
    return { type: part.type, value: part.factor, label: part.label, isPositive: true };
  },
  makeAdder(amount, rng) {
    const part = pick(KOSEN_ADD, rng);
    return { type: part.type, value: amount, label: `${part.symbol} +${amount}`, isPositive: true };
  },
  makeDivision(rng) {
    const part = rng() < 0.75 ? pick(KOSEN_DIV.slice(0, 2), rng) : KOSEN_DIV[2];
    return { type: part.type, value: part.type === 'diff_2nd' ? 3 : 2, label: part.label, isPositive: false };
  },
  makeSubtractor(amount, rng) {
    const part = pick(KOSEN_SUB, rng);
    return { type: part.type, value: amount, label: `${part.symbol} −${amount}`, isPositive: false };
  }
};

// 小学生: たし算・ひき算・かけ算・わり算
const ELEMENTARY_POOL: GatePool = {
  makeMultiplier(rng) {
    return rng() < 0.2
      ? { type: 'integral_triple', value: 3, label: '×3', isPositive: true }
      : { type: 'integral_double', value: 2, label: '×2', isPositive: true };
  },
  makeAdder(amount) {
    return { type: 'integral_add', value: amount, label: `+${amount}`, isPositive: true };
  },
  makeDivision(rng) {
    return rng() < 0.75
      ? { type: 'diff_1st', value: 2, label: '÷2', isPositive: false }
      : { type: 'diff_2nd', value: 3, label: '÷3', isPositive: false };
  },
  makeSubtractor(amount) {
    return { type: 'kernel', value: amount, label: `−${amount}`, isPositive: false };
  }
};

// 中学生: 文字式・√・x²・割合。「x+120」のような四則演算にならないよう、足し算は一次式 ax+b に、引き算は割合(%)にする
const MIDDLE_POOL: GatePool = {
  makeMultiplier(rng, pure) {
    const r = rng();
    // x² は人数が少ないうちだけ(多いと増えすぎる)
    if (pure <= 12 && r < 0.2) return { type: 'square', value: 2, label: 'x²', isPositive: true };
    if (r < 0.45) return { type: 'tensor_prod', value: 2, label: '2x', isPositive: true };
    if (r < 0.65) {
      const b = 2 + Math.floor(rng() * 7);
      return { type: 'affine', value: b, factor: 2, label: `2x+${b}`, isPositive: true };
    }
    if (r < 0.85) return { type: 'percent_up', value: 1.5, label: '150%', isPositive: true };
    return { type: 'integral_triple', value: 3, label: '3x', isPositive: true };
  },
  makeAdder(amount, rng, count) {
    // 一次式 ax+b。増やしたい量 amount ≒ (a-1)x + b になるよう、b を人数から決める
    const a = rng() < 0.5 ? 1.5 : 2;
    const b = clamp(Math.round(amount - (a - 1) * count), 2, 40);
    return { type: 'affine', value: b, factor: a, label: `${a === 1.5 ? '1.5' : '2'}x+${b}`, isPositive: true };
  },
  makeDivision(rng) {
    const r = rng();
    if (r < 0.25) return { type: 'sqrt', value: 0, label: '√x', isPositive: false };
    return r < 0.75
      ? { type: 'diff_1st', value: 2, label: 'x÷2', isPositive: false }
      : { type: 'diff_2nd', value: 3, label: 'x÷3', isPositive: false };
  },
  makeSubtractor(amount, _rng, count) {
    // 減らしたい量 amount ÷ 人数 から、残る割合を 40〜80% の10刻みで決める
    const loss = clamp(amount / Math.max(1, count), 0.2, 0.6);
    const keep = clamp(Math.round((1 - loss) * 10) * 10, 40, 80);
    return { type: 'percent_down', value: keep, label: `${keep}%`, isPositive: false };
  }
};

const POOLS: Record<LevelId, GatePool> = {
  elementary: ELEMENTARY_POOL,
  middle: MIDDLE_POOL,
  kosen: KOSEN_POOL
};

/** そのゲートで、全員が通った場合の増え方(×何倍か) */
function multFactor(info: GateInfo): number {
  return gateResult(100, info).survivors / 100;
}

function makeBad(pool: GatePool, count: number, rng: Rng): GateInfo {
  if (rng() < 0.5) return pool.makeDivision(rng);
  return pool.makeSubtractor(clamp(Math.round(count * (0.3 + rng() * 0.3)), 3, 200), rng, count);
}

/**
 * 隊列を人数 m と (count - m) に分けて左右のゲートに通した場合の、最善の生き残り人数。
 * 足し算のゲートは「通った集団ごと」に加算されるので、少人数でも足し算側に通せば加算分を取れる(=分割の旨み)。
 */
export function bestSplitResult(count: number, left: GateInfo, right: GateInfo): number {
  let best = 0;
  for (let m = 0; m <= count; m++) {
    const total = gateResult(m, left).survivors + gateResult(count - m, right).survivors;
    if (total > best) best = total;
  }
  return best;
}

/**
 * 8組のゲートを作る。
 *  A: 良い側 vs 悪い側 (35%)          … 分かりやすい選択
 *  B: かけ算 vs 足し算 (30%)           … 足し算の量が今の人数に近く、どちらが得かは人数次第。分割して両取りもできる
 *  D: 足し算 vs 足し算 (20%)           … 二つの加算を両方取る「分割」が主役の組
 *  C: 悪い側 vs 悪い側 (15%)          … ましな方を選ぶ(最初と最後の組には出さない)
 * 各組の左右はランダム。
 * 採用の条件は2つ:
 *  - 全員で片側を選び続けても(分割しなくても)要件 requirement を超えられること
 *  - 分割を使い切った場合の最終人数が上限(requirement の4倍)を超えないこと
 */
export function generateGateConfigs(
  zs: number[],
  requirement: number = 124,
  level: LevelId = 'kosen',
  rng: Rng = Math.random,
  startCount: number = 4
): GateConfig[] {
  const pool = POOLS[level];
  // 全員が片側を選び続けても届く余裕。レベルが上がるほど余裕を小さくする
  const minPure = Math.round(requirement * LEVELS[level].margin);
  const maxSplit = requirement * 4;

  for (let attempt = 0; attempt < 4000; attempt++) {
    const configs: GateConfig[] = [];
    let pure = startCount; // 分割しない最善
    let split = startCount; // 分割も使う最善
    let valid = true;
    let badBadCount = 0;

    for (let i = 0; i < zs.length; i++) {
      const roll = rng();
      const isEdge = i === 0 || i === zs.length - 1;
      // 組の種類はレベルの配分で決める(最初と最後の「悪い vs 悪い」は避ける)
      const w = LEVELS[level].patterns;
      const cutGoodBad = w.goodBad;
      const cutMultAdd = cutGoodBad + w.multAdd;
      const cutAddAdd = cutMultAdd + w.addAdd;
      let a: GateInfo;
      let b: GateInfo;

      if (roll < cutGoodBad || (isEdge && roll >= cutAddAdd)) {
        // A: 良い vs 悪い。良い側は、序盤は足し算・終盤はかけ算が多い
        const goodIsMult = rng() < 0.25 + 0.6 * (i / (zs.length - 1));
        a = goodIsMult ? pool.makeMultiplier(rng, pure) : pool.makeAdder(clamp(Math.round(pure * (0.35 + rng() * 0.5)), 12, 90), rng, pure);
        b = makeBad(pool, pure, rng);
      } else if (roll < cutMultAdd) {
        // B: かけ算 vs 足し算。足し算は「今の人数の 0.7〜1.4 倍」なので、×2 と拮抗する
        a = pool.makeMultiplier(rng, pure);
        const factor = Math.max(0.5, multFactor(a) - 1);
        b = pool.makeAdder(clamp(Math.round(pure * factor * (0.7 + rng() * 0.7)), 15, 220), rng, pure);
      } else if (roll < cutAddAdd) {
        // D: 足し算 vs 足し算。金額を違えて、どちらか一方を選ぶより両方を取りたくなる
        const base = clamp(Math.round(pure * (0.4 + rng() * 0.5)), 12, 120);
        a = pool.makeAdder(base, rng, pure);
        b = pool.makeAdder(clamp(Math.round(base * (0.6 + rng() * 0.8)), 10, 140), rng, pure);
      } else {
        // C: 悪い vs 悪い。高専生では、割り算+引き算のほか、引き算同士・割り算同士も出る
        const variant = LEVELS[level].badPairVariants ? rng() : 0;
        if (variant < 0.5) {
          a = pool.makeDivision(rng);
          b = pool.makeSubtractor(clamp(Math.round(pure * (0.3 + rng() * 0.25)), 3, 150), rng, pure);
        } else if (variant < 0.8) {
          // 引き算同士: 減る量が違う二つ
          const base = clamp(Math.round(pure * (0.25 + rng() * 0.2)), 3, 120);
          a = pool.makeSubtractor(base, rng, pure);
          b = pool.makeSubtractor(clamp(Math.round(base * (1.3 + rng() * 0.8)), 4, 180), rng, pure);
        } else {
          // 割り算同士: ÷2 と ÷3 など、割る数が違う二つ
          a = pool.makeDivision(rng);
          b = pool.makeDivision(rng);
          if (a.type === b.type && a.label === b.label) b = { ...b, type: 'diff_2nd', value: 3, label: 'd²/dx²' };
        }
      }

      if (!a.isPositive && !b.isPositive) badBadCount++;
      const [left, right] = rng() < 0.5 ? [a, b] : [b, a];
      configs.push({ z: zs[i], left, right });

      pure = Math.max(gateResult(pure, left).survivors, gateResult(pure, right).survivors);
      split = bestSplitResult(split, left, right);
      if (pure < 3 || split > maxSplit * 2) {
        valid = false;
        break;
      }
    }

    if (valid && badBadCount >= LEVELS[level].minBadBad && pure >= minPure && pure <= requirement * LEVELS[level].maxPure && split <= maxSplit) {
      return configs;
    }
  }
  return fallbackGateConfigs(zs);
}

/** 生成に失敗したときの保険: 従来の固定コース */
function fallbackGateConfigs(zs: number[]): GateConfig[] {
  const T = true;
  const F = false;
  const g = (type: MathOpType, value: number, label: string, isPositive: boolean): GateInfo => ({ type, value, label, isPositive });
  const fixed: [GateInfo, GateInfo][] = [
    [g('integral_double', 2, '∬', T), g('diff_partial', 10, '∂/∂x −10', F)],
    [g('kernel', 15, 'ker −15', F), g('series_sum', 20, '∑ +20', T)],
    [g('integral_triple', 3, '∭', T), g('diff_1st', 2, 'd/dx', F)],
    [g('eigen_decay', 2, 'λ=0.5', F), g('integral_add', 30, '∫ +30', T)],
    [g('series_sum', 35, '∑ +35', T), g('coker', 25, 'coker −25', F)],
    [g('diff_2nd', 3, 'd²/dx²', F), g('tensor_prod', 2, '⊗2', T)],
    [g('eigen_boost', 2, 'λ=2', T), g('divergence', 30, '∇・F −30', F)],
    [g('limit_inf', 50, 'lim ∞ +50', T), g('integral_triple', 3, '∭', T)]
  ];
  return zs.map((z, i) => ({ z, left: fixed[i % fixed.length][0], right: fixed[i % fixed.length][1] }));
}

/** 最善手を選び続けた場合の最終人数(検証・デバッグ用) */
export function bestPathCount(configs: GateConfig[], startCount: number = 4): number {
  let count = startCount;
  for (const c of configs) {
    count = Math.max(gateResult(count, c.left).survivors, gateResult(count, c.right).survivors);
  }
  return count;
}
