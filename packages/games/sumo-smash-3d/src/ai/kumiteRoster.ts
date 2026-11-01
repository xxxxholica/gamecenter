// 百人組手（100体勝ち抜き戦）の敵力士100体の定義。
// 1体目〜100体目まで、すべて漢数字（一〜百）に由来する固有の四股名を持ち、体格・質量・速さ・まわし色・思考速度が変化する。

export const KUMITE_TOTAL = 100;

export type KumiteArchetype = 'normal' | 'agile' | 'heavy' | 'boss';

export interface KumiteEnemySpec {
  /** 1〜100 の通し番号 */
  number: number;
  /** 番付・漢数字表記 (例: "一番", "百番") */
  rankLabel: string;
  /** 数字由来の四股名 (一〜百) */
  name: string;
  /** タイプ */
  archetype: KumiteArchetype;
  /** 見た目・当たり判定のスケール (1.0 = 標準) */
  scale: number;
  /** 物理の質量 (100 = 標準) */
  mass: number;
  /** 移動・突進速度の倍率 (1.0 = 標準) */
  speedMult: number;
  /** 被ノックバック倍率 (小さいほど吹き飛びにくい) */
  knockbackTakenMult: number;
  /** 与えるダメージ・ノックバック倍率 (中ボス・重量級で >1) */
  attackMult: number;
  /** AIの思考間隔(秒。小さいほど素早く反応する) */
  thinkInterval: number;
  /** 肌色 */
  skinColor: number;
  /** まわし色 */
  mawashiColor: number;
  /** 髪色 */
  hairColor: number;
  /** UI表示色 */
  css: string;
}

/** 1〜100 の漢数字変換 */
export function toKanjiNumber(n: number): string {
  const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (n <= 0) return '零';
  if (n === 100) return '百';
  if (n < 10) return digits[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const tenPart = (tens === 1 ? '' : digits[tens]) + '十';
  return tenPart + digits[ones];
}

/**
 * 一〜百までの数字に由来する100体の四股名リスト（インデックス 0 = 1体目、99 = 100体目）
 */
export const KUMITE_SHIKONA_LIST: readonly string[] = [
  // 1〜10
  '一番富士', '二双山', '三日月丸', '四海浪', '五輪嶽',
  '六甲嵐', '七星龍', '八方山', '九頭龍', '十文字',
  // 11〜20
  '十一面', '十二神将', '十三夜丸', '十四松風', '十五夜富士',
  '十六夜山', '十七条嶽', '十八番海', '十九里浜', '二十重山',
  // 21〜30
  '二十一嵐', '二十二富士', '二十三電', '二十四節気', '二十五弦',
  '二十六夜', '二十七宿', '二十八星', '二十九日丸', '三十路嶽',
  // 31〜40
  '三十一文字', '三十二相', '三十三間', '三十四海', '三十五峰',
  '三十六計', '三十七道', '三十八度線', '三十九嵐', '四十雀丸',
  // 41〜50
  '四十一風', '四十二浪', '四十三嶽', '四十四山', '四十五里',
  '四十六時', '四十七士', '四十八手', '四十九院', '五十鈴川',
  // 51〜60
  '五十一嵐', '五十二富士', '五十三次', '五十四郡', '五十五峰',
  '五十六億', '五十七風', '五十八浪', '五十九嶽', '六十路山',
  // 61〜70
  '六十一華', '六十二風', '六十三峰', '六十四卦', '六十五里',
  '六十六州', '六十七嵐', '六十八海', '六十九宿', '七十路嶽',
  // 71〜80
  '七十一風', '七十二候', '七十三浪', '七十四峰', '七十五里',
  '七十六海', '七十七喜', '七十八嵐', '七十九嶽', '八十路山',
  // 81〜90
  '八十一盤', '八十二風', '八十三浪', '八十四峰', '八十五里',
  '八十六海', '八十七嵐', '八十八夜', '八十九嶽', '九十路富士',
  // 91〜100
  '九十一風', '九十二浪', '九十三峰', '九十四海', '九十五里',
  '九十六嵐', '九十七嶽', '九十八山', '九十九里', '百獣王',
];

const SKIN_PALETTE = [
  0xefc49b, // 標準
  0xf5d6b8, // 色白
  0xe2a778, // 浅黒
  0xd48e5c, // 日焼け・赤銅色
  0xead0b3, // 柔和
];

const MAWASHI_PALETTE = [
  { hex: 0x8b1e0f, css: '#e63946' }, // 紅
  { hex: 0x2d6a4f, css: '#3fc77a' }, // 深緑
  { hex: 0x5a189a, css: '#b565f2' }, // 紫
  { hex: 0xb5651d, css: '#f29f4b' }, // 琥珀
  { hex: 0x1d3557, css: '#4ea8de' }, // 紺青
  { hex: 0x6d597a, css: '#b5838d' }, // 古代紫
  { hex: 0x386641, css: '#6a994e' }, // 松葉
  { hex: 0x9b2226, css: '#ee6055' }, // 茜
];

const BOSS_MAWASHI = { hex: 0xc9a227, css: '#ffd166' }; // 黄金まわし
const FINAL_BOSS_MAWASHI = { hex: 0x7209b7, css: '#ff4d6d' }; // 百獣王・覇王色

// 2体同時降下ラッシュは廃止し、1体ずつ順番に出現させる
const DOUBLE_TRIGGERS = new Set<number>([]);

/**
 * 1〜100 の通し番号(1始まり)から敵力士のスペックを返す。
 * simultaneousCount >= 2（または同時降下ウェーブ対象番号）の場合は中ボス（巨漢・重量級）にせず、
 * 少し弱め（軽くて吹き飛びやすく、動きと反応も穏やか）の通常力士にする。
 */
export function getKumiteEnemySpec(num: number, simultaneousCount = 1): KumiteEnemySpec {
  const n = Math.max(1, Math.min(KUMITE_TOTAL, Math.floor(num)));
  const name = KUMITE_SHIKONA_LIST[n - 1] ?? `${toKanjiNumber(n)}番山`;
  const rankLabel = `${toKanjiNumber(n)}番`;
  const progress = (n - 1) / (KUMITE_TOTAL - 1); // 0.0 〜 1.0

  // 10体ごとの節目（10, 20, ..., 100）は巨漢ボス（単独登場時のみ）
  if (n % 10 === 0 && simultaneousCount <= 1) {
    const isFinal = n === 100;
    const scale = isFinal ? 1.5 : 1.32 + Math.min(0.14, (n / 100) * 0.14);
    const mass = isFinal ? 195 : Math.round(145 + (n / 100) * 35);
    const mawashi = isFinal ? FINAL_BOSS_MAWASHI : BOSS_MAWASHI;
    return {
      number: n,
      rankLabel,
      name,
      archetype: 'boss',
      scale,
      mass,
      speedMult: isFinal ? 1.12 : 0.96 + progress * 0.1,
      knockbackTakenMult: isFinal ? 0.62 : Math.max(0.68, 0.84 - progress * 0.14),
      attackMult: isFinal ? 1.45 : Number((1.25 + progress * 0.20).toFixed(2)),
      thinkInterval: Math.max(0.045, 0.08 - progress * 0.03),
      skinColor: isFinal ? 0xc87d4b : 0xd48e5c,
      mawashiColor: mawashi.hex,
      hairColor: 0x111111,
      css: mawashi.css,
    };
  }

  // 番号に応じて軽量スピード型・重量パワー型・標準型を織り交ぜる
  const mod = n % 7;
  if (mod === 3 || mod === 6) {
    // 軽量スピード型（小兵・素早い突っ張りと突進）
    const mawashi = MAWASHI_PALETTE[(n * 3) % MAWASHI_PALETTE.length];
    return {
      number: n,
      rankLabel,
      name,
      archetype: 'agile',
      scale: 0.84,
      mass: 80,
      speedMult: 1.24 + progress * 0.14,
      knockbackTakenMult: 1.15 - progress * 0.1,
      attackMult: 1.0,
      thinkInterval: Math.max(0.05, 0.095 - progress * 0.04),
      skinColor: SKIN_PALETTE[n % SKIN_PALETTE.length],
      mawashiColor: mawashi.hex,
      hairColor: 0x181412,
      css: mawashi.css,
    };
  }

  if (mod === 4 || mod === 0) {
    // 重量パワー型（太鼓腹の巨漢）
    const mawashi = MAWASHI_PALETTE[(n * 5) % MAWASHI_PALETTE.length];
    return {
      number: n,
      rankLabel,
      name,
      archetype: 'heavy',
      scale: 1.2 + Math.min(0.08, progress * 0.08),
      mass: Math.round(130 + progress * 20),
      speedMult: 0.88 + progress * 0.1,
      knockbackTakenMult: Math.max(0.76, 0.9 - progress * 0.12),
      attackMult: Number((1.15 + progress * 0.10).toFixed(2)),
      thinkInterval: Math.max(0.055, 0.11 - progress * 0.045),
      skinColor: SKIN_PALETTE[(n + 2) % SKIN_PALETTE.length],
      mawashiColor: mawashi.hex,
      hairColor: 0x111111,
      css: mawashi.css,
    };
  }

  // 標準型
  const mawashi = MAWASHI_PALETTE[n % MAWASHI_PALETTE.length];
  return {
    number: n,
    rankLabel,
    name,
    archetype: 'normal',
    scale: 0.96 + (n % 3) * 0.05,
    mass: 98 + (n % 3) * 5,
    speedMult: 0.98 + progress * 0.14,
    knockbackTakenMult: Math.max(0.85, 1.0 - progress * 0.12),
    attackMult: 1.0,
    thinkInterval: Math.max(0.05, 0.11 - progress * 0.05),
    skinColor: SKIN_PALETTE[n % SKIN_PALETTE.length],
    mawashiColor: mawashi.hex,
    hairColor: 0x111111,
    css: mawashi.css,
  };
}

/**
 * 次にスポーンする敵の通し番号 nextEnemyNumber (1〜100) に対し、
 * 空から同時に降らせる人数 (1〜2体) を決める。
 * - 定期的に2体が同時に空から降ってくるラッシュを発生させる
 * - 10体ごとのボス (10, 20, ..., 100) は必ず単独で登場させる
 */
export function pickSimultaneousDropCount(nextEnemyNumber: number, activeEnemiesOnRing: number, maxSlots = 3): number {
  const remainingToSpawn = KUMITE_TOTAL - nextEnemyNumber + 1;
  const freeSlots = Math.max(0, maxSlots - activeEnemiesOnRing);
  if (remainingToSpawn <= 0 || freeSlots <= 0) return 0;

  // 既に土俵上に敵がいる場合は補充しない(全滅するか、同時ウェーブの一括スポーン時のみ)
  if (activeEnemiesOnRing > 0) return 0;

  // 1体目、または10体ごとのボス(10, 20, ..., 100)は必ず1体で登場
  if (nextEnemyNumber === 1 || nextEnemyNumber % 10 === 0) return 1;

  const desired = DOUBLE_TRIGGERS.has(nextEnemyNumber) ? 2 : 1;

  // 10体ごとのボス(10, 20, ..., 100)が複数同時の中に巻き込まれないようにする
  const nextBossNumber = Math.ceil(nextEnemyNumber / 10) * 10;
  const maxBeforeBoss = Math.max(1, nextBossNumber - nextEnemyNumber);
  return Math.max(1, Math.min(desired, freeSlots, remainingToSpawn, maxBeforeBoss));
}

/** 敵の降下を予約してから、空から落ち始めるまでの間(秒) */
export const KUMITE_DROP_DELAY_SEC = 1.35;
/** 2体同時ウェーブで1体目と2体目が空から続けて落ちてくる間隔(秒) */
export const KUMITE_DROP_STAGGER_SEC = 0.55;
