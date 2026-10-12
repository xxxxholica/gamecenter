// アーケード共通ランキングの純粋ロジック(型・ゲーム定義・名前の検証・順位の判定・挿入)。
// ブラウザ(arcadeLeaderboard.ts)とサーバー(packages/server)の両方から import する。DOM・fetch・localStorage には触れない。

export interface LeaderboardEntry {
  /** サーバーが付ける一意なid(ゴーストの取得に使う) */
  id?: string;
  /** ゴースト(走行の軌跡)が保存されているか */
  hasGhost?: boolean;
  rank: number;
  name: string;      // カタカナ最大5文字 (記録なしの場合は「記録なし」)
  score: number;     // 比較用スコア数値(タイムアタックはミリ秒)
  formattedScore: string; // 表示用文字列 (例: "0 pts", "0 単位", "00:00.000", "0 pt")
  date: string;      // YYYY/MM/DD
  extra?: string;    // 称号やマシン名など
  /** ステージを最後までクリアした記録か。ホームのランキングで、名前の右に ★ を付けて表示する */
  cleared?: boolean;
  /** 開発者の記録か。管理画面でだけ付けられ、ホームのランキングで、名前の右に印を付けて表示する */
  dev?: boolean;
  /** 管理画面で設定したロール (開発者 / テスター) */
  role?: AdminRole;
  /** 管理画面用: 元のプレイヤー名 */
  origName?: string;
}

export interface LeaderboardVariant {
  id: string;        // 例: "tokyo_skyway", "elementary"
  label: string;     // 表示名 例: "STAGE01", "小学生"
  /**
   * コース(ステージ)の版。コースを作り直して今までのタイム・ゴーストが無意味になったら、1つ上げる。
   * サーバーは、保存済みの版と違う枠を、起動時に破棄する(サーバーの再起動=デプロイで反映される)。
   */
  revision?: number;
  /** サーバーが受け付けるスコアの下限・上限(省略時は汎用の範囲)。コースの最短タイムを下回る申告などを弾く */
  minScore?: number;
  maxScore?: number;
}

export interface GameLeaderboardDef {
  slug: string;
  hasScore: boolean;
  scoreOrder: 'desc' | 'asc'; // desc: 高い方が上位, asc: 低い方(タイム等)が上位
  unit: string;
  formatScore: (score: number) => string;
  variants?: LeaderboardVariant[];
  /**
   * サーバーが受け付けるスコアの範囲(省略時は汎用の範囲。バリアントの minScore/maxScore があればそちらが優先)。
   * スコアはクライアントの申告なので、実プレイでありえない値を弾く「天井」。実測の最高値より十分に大きく置く
   * (小さすぎると正規の記録が捨てられる。管理画面のアナリティクスの bestScore で見直せる)。
   */
  minScore?: number;
  maxScore?: number;
  /** 起動(チケット発行)から申告までの最短時間(ms)。これより短い間に出せるスコアではない、という下限 */
  minRunMs?: number;
  /** 1秒あたりに稼げるスコアの上限(desc のみ)。申告スコアが 経過秒 × この値 を超えたら不正とみなす */
  maxScorePerSec?: number;
}

function padZero(n: number, len: number): string {
  return String(n).padStart(len, '0');
}

/** HTML特殊文字をエスケープして XSS (Cross-Site Scripting) を防止する */
export function escapeHtml(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// 簡易NGワード（公序良俗・卑猥・差別用語の主要パターン）
/** 開発者の記録の名前。管理画面で印を付けたときだけ使われ、プレイヤーは名前にできない(なりすまし防止) */
export const DEV_NAME = '開発者';

/** 管理者が設定できるロール */
export const ADMIN_ROLES = ['開発者', 'テスター'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/** 管理者が設定できる名前の文字: 漢字・カタカナ・ひらがな・英数 (半角および全角) */
const ADMIN_NAME_ALLOWED_CHARS = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-zA-Z0-9ａ-ｚＡ-Ｚ０-９ー々〆〇ヶ]+$/u;

/** 「好きな名前（ロール）」の形式を判定する正規表現 */
export const ADMIN_ROLE_NAME_REGEX = /^([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}a-zA-Z0-9ａ-ｚＡ-Ｚ０-９ー々〆〇ヶ]{1,10})（(開発者|テスター)）$/u;

/** 管理者による任意の名前の検証 (1〜10文字、漢字・カタカナ・ひらがな・英数) */
export function isValidAdminCustomName(rawName: unknown): rawName is string {
  if (typeof rawName !== 'string') return false;
  const trimmed = rawName.trim();
  const chars = Array.from(trimmed);
  if (chars.length < 1 || chars.length > 10) return false;
  return ADMIN_NAME_ALLOWED_CHARS.test(trimmed);
}

/** ロールの検証 (「開発者」「テスター」) */
export function isValidAdminRole(rawRole: unknown): rawRole is AdminRole {
  return rawRole === '開発者' || rawRole === 'テスター';
}

/** 「好きな名前（ロール）」の表示用文字列を生成 */
export function formatAdminRoleName(customName: string, role: AdminRole): string {
  return `${customName.trim()}（${role}）`;
}

/** 文字列が「好きな名前（ロール）」の正しい形式になっているか検証 */
export function isValidAdminRoleName(name: string, role?: AdminRole): boolean {
  const match = ADMIN_ROLE_NAME_REGEX.exec(name);
  if (!match) return false;
  if (role && match[2] !== role) return false;
  return true;
}

const NG_WORD_REGEX = /^(シネ|コロス|キチガイ|バカ|アホ|カス|シネヨ|レイプ|チンコ|マンコ|ペニス|セックス|オメコ)$/i;

/** 制御文字・危険記号（< > " ' & ` \ / など）・表示を乱す文字(ゼロ幅・双方向の制御) */
const UNSAFE_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF<>'"&`\\/]/g;

/**
 * 称号・マシン名などの補足文字列(extra / carName)の検証。名前と同じ危険な文字を除去し、最大 maxLen 文字に切る。
 * 空になる・文字列でないなら undefined。
 */
export function sanitizeLeaderboardExtra(raw: unknown, maxLen = 30): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = Array.from(raw.replace(UNSAFE_CHARS, '').trim()).slice(0, maxLen).join('');
  return cleaned || undefined;
}

/**
 * プレイヤー名を厳格に検証・サニタイズする (最大5文字)
 * 危険なHTML特殊文字、制御文字、表示を乱す文字(ゼロ幅・双方向の制御)、不正な型を除去し、安全な文字列に正規化する。
 */
export function sanitizeLeaderboardName(rawName: unknown): string {
  if (typeof rawName !== 'string') return 'ゲスト';
  // 制御文字・危険記号（< > " ' & ` \ / など）および改行を除去
  const stripped = rawName.replace(UNSAFE_CHARS, '').trim();
  if (
    !stripped ||
    stripped === DEV_NAME ||
    stripped === 'テスター' ||
    ADMIN_ROLE_NAME_REGEX.test(stripped) ||
    stripped.includes('（開発者）') ||
    stripped.includes('（テスター）') ||
    stripped.includes('(開発者)') ||
    stripped.includes('(テスター)') ||
    NG_WORD_REGEX.test(stripped)
  ) {
    return 'ゲスト';
  }
  const cleaned = Array.from(stripped).slice(0, 5).join('');   // コードポイント単位(絵文字などのサロゲートペアを分断しない)
  if (!cleaned || cleaned === DEV_NAME || cleaned === 'テスター' || NG_WORD_REGEX.test(cleaned)) {
    return 'ゲスト';
  }
  return cleaned;
}

export function formatTimeMs(ms: number): string {
  if (ms <= 0) return '00:00.000';
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  const millis = Math.floor(ms % 1000);
  return `${padZero(m, 2)}:${padZero(s, 2)}.${padZero(millis, 3)}`;
}

const DEFS: Record<string, GameLeaderboardDef> = {
  'street-b-boy': {
    slug: 'street-b-boy',
    hasScore: true,
    maxScore: 3_000_000,
    minRunMs: 15_000,
    maxScorePerSec: 3_000,
    scoreOrder: 'desc',
    unit: 'pts',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} pts` : '0 pts'),
  },
  'ennichi-shateki': {
    slug: 'ennichi-shateki',
    hasScore: true,
    maxScore: 200_000,                // サーバーの対戦側 MAX_SCORE と同じ
    minRunMs: 40_000,                 // 制限時間は45秒
    maxScorePerSec: 6_000,
    scoreOrder: 'desc',
    unit: 'g',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} g` : '0 g'),
  },
  'extreme-edge-arcade': {
    slug: 'extreme-edge-arcade',
    hasScore: true,
    minScore: 15,                     // 偏差値は 15〜88 に丸められる(game.ts)
    maxScore: 88,
    minRunMs: 15_000,
    scoreOrder: 'desc',
    unit: 'pt',
    formatScore: (score) => (score > 0 ? `${score.toFixed(1)} pt` : '0.0 pt'),
  },
  'tani-runner-124': {
    slug: 'tani-runner-124',
    hasScore: true,
    maxScore: 10_000_000,
    minRunMs: 10_000,
    scoreOrder: 'desc',
    unit: '単位',
    formatScore: (score) => (score > 0 ? `${Math.floor(score)} 単位` : '0 単位'),
    variants: [
      { id: 'elementary', label: '小学生レベル' },
      { id: 'middle', label: '中学生レベル' },
      { id: 'kosen', label: '高専生レベル' },
    ],
  },
  'midnight-skyway': {
    slug: 'midnight-skyway',
    hasScore: true,
    scoreOrder: 'asc',
    unit: '',
    formatScore: (score) => formatTimeMs(score),
    // minScore は shared/netProtocol.ts の MIN_FINISH_MS(コースごとの物理的な最短タイム)と同じ値
    variants: [
      { id: 'tokyo_skyway', label: '東京 丸の内スカイウェイ', revision: 2, minScore: 30000 },
      { id: 'helsinki_technical', label: 'ヘルシンキ ハーバーリッジ', revision: 2, minScore: 28000 },
      { id: 'tokyo_climb', label: '東京 スカイクライム', revision: 2, minScore: 58000 },
    ],
  },
  'school-corridor-runner': {
    slug: 'school-corridor-runner',
    hasScore: true,
    maxScore: 50_000_000,
    minRunMs: 10_000,
    maxScorePerSec: 40_000,
    scoreOrder: 'desc',
    unit: 'pts',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} pts` : '0 pts'),
  },
  'survivor-score-battle': {
    slug: 'survivor-score-battle',
    hasScore: true,
    maxScore: 20_000_000,
    minRunMs: 20_000,
    maxScorePerSec: 30_000,
    scoreOrder: 'desc',
    unit: 'pts',
    formatScore: (score) => (score > 0 ? `${Math.floor(score).toLocaleString()} pts` : '0 pts'),
  },
  'tower-stack': {
    slug: 'tower-stack',
    hasScore: true,
    maxScore: 100_000,                // 1000m(オンラインの MAX_HEIGHT は400m)
    minRunMs: 10_000,
    maxScorePerSec: 4_000,
    scoreOrder: 'desc',
    unit: 'm',
    // スコアは高さ(m)×100 の整数で持つ
    formatScore: (score) => `${(Math.floor(score) / 100).toFixed(1)} m`,
  },
};

export const GAME_LEADERBOARD_DEFS: Readonly<Record<string, GameLeaderboardDef>> = DEFS;

/** slug からゲーム定義を引く。外部入力の slug でも、Object.prototype の名前(__proto__ など)を拾わない */
export function getLeaderboardDef(slug: string): GameLeaderboardDef | undefined {
  return Object.hasOwn(DEFS, slug) ? DEFS[slug] : undefined;
}


/** 1枠(ゲーム、バリアントがあるゲームはバリアントごと)を指すキー。クライアントのキャッシュ・サーバーの保存で共通 */
export function leaderboardBoardKey(slug: string, variantId?: string): string {
  return variantId ? `${slug}:${variantId}` : slug;
}

/** leaderboardBoardKey の逆。'<slug>' → [slug, undefined]、'<slug>:<variant>' → [slug, variant] */
export function parseBoardKey(key: string): [string, string | undefined] {
  const i = key.indexOf(':');
  return i < 0 ? [key, undefined] : [key.slice(0, i), key.slice(i + 1)];
}

/** ランキングボード(ハブ)に出るのは上位5位まで。6位以下は記録も名前登録もしない。 */
export const LEADERBOARD_MAX_ENTRIES = 5;

/** a が b より良い記録か(ascなら小さい方、descなら大きい方) */
export function isBetterScore(def: GameLeaderboardDef, a: number, b: number): boolean {
  return def.scoreOrder === 'asc' ? a < b : a > b;
}

/** score が既存の list(順位順)に入ったときの順位(1始まり)。圏外なら -1。同点は先に記録した方が上位。 */
export function rankForScore(
  def: GameLeaderboardDef,
  list: readonly { score: number }[],
  score: number,
  maxEntries = LEADERBOARD_MAX_ENTRIES,
): number {
  if (!def.hasScore || !Number.isFinite(score) || score <= 0) return -1;
  let rank = list.length < maxEntries ? list.length + 1 : -1;
  for (let i = 0; i < list.length; i++) {
    if (isBetterScore(def, score, list[i].score)) {
      rank = i + 1;
      break;
    }
  }
  return rank > 0 && rank <= maxEntries ? rank : -1;
}

/** list に entry を挿入し、順位順に並べて上位 maxEntries 件に切り詰め、rank を振り直した新しい配列を返す。 */
export function insertScore<T extends { score: number; rank: number }>(
  def: GameLeaderboardDef,
  list: readonly T[],
  entry: T,
  maxEntries = LEADERBOARD_MAX_ENTRIES,
): T[] {
  const next = [...list, entry];
  next.sort((a, b) => (def.scoreOrder === 'asc' ? a.score - b.score : b.score - a.score));   // 安定ソート: 同点は先に記録した方が上
  return next.slice(0, maxEntries).map((item, idx) => ({ ...item, rank: idx + 1 }));
}

/** 「記録なし」の空き枠を、表示用に minCount 件まで補う */
export function padEmptyEntries(
  def: GameLeaderboardDef | undefined,
  entries: LeaderboardEntry[],
  minCount: number,
): LeaderboardEntry[] {
  const zeroFormatted = def ? def.formatScore(0) : '0 pt';
  const result = [...entries];
  for (let i = result.length; i < minCount; i++) {
    result.push({ rank: i + 1, name: '記録なし', score: 0, formattedScore: zeroFormatted, date: '' });
  }
  return result;
}
