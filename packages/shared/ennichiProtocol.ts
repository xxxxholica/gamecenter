// えんにち射的 オンライン対戦のメッセージと、共有ルール(サーバーとクライアントの両方が同じ計算をする部分)。
// 最大4人。各自が自分の台を持ち、物理は各自が自分の台だけ計算する。他人の台は、照準・発砲・動いている景品のスナップショットを
// 受けて表示するだけ。共有の的(大UFO)だけは、全員が狙えて、最初に当てた人が得点(対戦)/みんなで合算で倒す(協力)。
// Nodeの型ストリップ(サーバー)でも読み込まれるため、ランタイム構文は使わない(enum等)。
import { mulberry32 } from './online/seededRandom.ts';
import type { BaseRoom, CoreClientMsg, CoreServerMsg } from './online/core.ts';

export const MAX_PLAYERS = 4;
/** 台(幅4.6m)の並びのピッチ(m)。スロット i の台は、列の座標 u = i × LANE_PITCH に置く。 */
export const LANE_PITCH = 4.9;
/** オンラインの制限時間(固定。オフラインの延長ルールは使わない: 全員が同時に終わるため) */
export const DURATION_MS = 45000;
/** go の at(カウントダウン開始)から、実際のスタート(GO)までのカウントダウン */
export const COUNTDOWN_MS = 3000;

export type Mode = 'versus' | 'coop';
export const MODES: Mode[] = ['versus', 'coop'];

/** [x, y, z, pitch, roll, flags]: 動いている景品のスナップショット(台のローカル座標)。slotId は先頭に付く。 */
export type PrizeSnap = [number, number, number, number, number, number, number];
/** 倒した景品の内訳(種類 → 個数)。リザルトの山の演出に使う。 */
export type Defeated = Record<string, number>;
/** 発砲: k=n(通常弾)/b(バクダン弾)、o=銃口(台のローカル座標)、d=向き */
export interface FireEvent {
  k: 'n' | 'b';
  o: [number, number, number];
  d: [number, number, number];
}

export interface PlayerInfo {
  id: number;
  name: string;
  /** 希望するモード(null=希望なし) */
  mode: Mode | null;
}

export type ClientMsg =
  | CoreClientMsg
  | { t: 'pref'; mode: Mode | null }
  | { t: 'aim'; a: [number, number] }
  | { t: 'fire'; f: FireEvent }
  | { t: 'snap'; p: PrizeSnap[] }
  /** 自分の累積得点(UFOの得点を除く)。約2Hz */
  | { t: 'score'; score: number; defeated: Defeated }
  /** 共有の的に当てた(最初の1件だけサーバーが採用) */
  | { t: 'ufoHit'; n: number }
  /** 終了時の最終結果 */
  | { t: 'result'; score: number; defeated: Defeated };

export interface EntryResult {
  id: number;
  name: string;
  slot: number;
  /** 合計(prizeScore + ufoPts) */
  score: number;
  prizeScore: number;
  ufoPts: number;
  defeated: Defeated;
}

export interface RoomMsg extends BaseRoom {
  players: PlayerInfo[];
  /** 主催者の設定: 'versus' / 'coop'=固定、'random'=参加者の希望で決める */
  modeSetting: string;
  votes: Record<string, number>;
}

export type ServerMsg =
  | CoreServerMsg
  | RoomMsg
  /** 全員がロードを始める合図。モード・共有シード(景品の並び・UFOの出現)・走る順(grid=参加者idの並び=スロット)が確定している */
  | { t: 'start'; seed: number; mode: Mode; grid: number[]; players: { id: number; name: string }[]; durationMs: number }
  /** 全員のロード完了。at(サーバー時刻ms)にカウントダウンを始め、at+COUNTDOWN_MS が実際のスタート。endAt が終了時刻 */
  | { t: 'go'; at: number; endAt: number }
  /** 他の人の動き(約20Hz、バッチ)。a=照準、f=発砲(前回以降)、p=動いている景品、sc=累積得点(UFO得点を含む合計) */
  | { t: 'sync'; a: Record<number, [number, number]>; f: [number, FireEvent][]; p: Record<number, PrizeSnap[]>; sc: Record<number, number> }
  /** 共有の的の結果。hp=残りHP(0で撃破)、by=当てた人、pts=その人に入る得点(対戦)、bonus=チームのボーナス(協力の撃破時) */
  | { t: 'ufo'; n: number; hp: number; by: number; pts: number; bonus: number }
  | { t: 'results'; mode: Mode; entries: EntryResult[]; teamScore: number; teamBonus: number; done: boolean };

// ---- 共有の的(大UFO) ----
export interface UfoSpec {
  n: number;
  /** 出現(GOからの経過ms)と、横切るのにかかる時間 */
  t0: number;
  dur: number;
  /** +1: 左(スロット0側)から右へ / -1: 逆 */
  dir: 1 | -1;
  kind: 'normal' | 'giant';
  /** 倒すのに必要な命中数(対戦=1、協力の巨大UFO=HP制) */
  hp: number;
  /** 対戦: 最初に当てた人に入る得点 */
  pts: number;
  /** 協力: 撃破でチームに入るボーナス */
  bonus: number;
}

export const UFO_POINTS_VERSUS = 2000;
export const UFO_GIANT_HP = 12;
export const UFO_GIANT_BONUS = 3000;

/** 共有シードとモードから、全員が同じUFOの出現スケジュールを計算する(メッセージ不要)。 */
export function ufoSchedule(seed: number, mode: Mode, durationMs: number = DURATION_MS): UfoSpec[] {
  const rand = mulberry32(seed ^ 0x9e3779b9);
  const out: UfoSpec[] = [];
  const coop = mode === 'coop';
  const k = durationMs / DURATION_MS;                      // 制限時間に比例させる(通常は1。テストで短縮する時だけ変わる)
  const first = (coop ? 6000 : 7000) * k;
  const gap = (coop ? 18000 : 13000) * k;
  const dur = (coop ? 12000 : 9000) * k;
  for (let t0 = first, n = 0; t0 + dur <= durationMs; t0 += gap, n++) {
    out.push({
      n,
      t0,
      dur,
      dir: rand() < 0.5 ? 1 : -1,
      kind: coop ? 'giant' : 'normal',
      hp: coop ? UFO_GIANT_HP : 1,
      pts: coop ? 0 : UFO_POINTS_VERSUS,
      bonus: coop ? UFO_GIANT_BONUS : 0,
    });
  }
  return out;
}

/** UFOの位置(列の座標 u、高さ y、奥行き z)。t はGOからの経過ms。出現中でなければ null。 */
export function ufoPose(spec: UfoSpec, tMs: number): { u: number; y: number; z: number } | null {
  const tau = (tMs - spec.t0) / spec.dur;
  if (tau < 0 || tau > 1) return null;
  const from = -1.0 * LANE_PITCH, to = (MAX_PLAYERS - 1 + 1.0) * LANE_PITCH;     // 列の両端の少し外から外へ
  const u = spec.dir > 0 ? from + (to - from) * tau : to - (to - from) * tau;
  return { u, y: 5.2 + Math.sin(tau * Math.PI * 3) * 0.4, z: -7.5 };
}
