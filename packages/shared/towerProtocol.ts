// tower-stack(グラグラタワー)オンライン対戦のメッセージ型。サーバー(packages/server)とクライアントの両方が相対importで共有する。
// 通信はすべてJSONテキスト。Nodeの型ストリップで直接実行されるため、enum等のランタイム構文は使わない。
//
// 1on1(2人)で同時に、それぞれ自分のタワーを積む(物理は各自のブラウザ)。先にブロックを3個落とした方の負け。
//   クライアント → サーバー : state(自分のタワーの様子。落下中のブロックも含む。約10Hz) / attack(おじゃまを送る) / out(脱落)
//   サーバー → 全員         : states(全員のタワーの様子) / atk(誰が誰におじゃまを送ったか) / results
// おじゃまは、ブロックを ATTACK_EVERY 個置くたびに相手へ飛ぶ(サーバーの宛先決めは、人数が増えても動くよう「送った人以外で一番高い人」)。

/** 1on1 */
export const MAX_PLAYERS = 2;
/** go からスタートまでのカウントダウン(秒) */
export const COUNTDOWN_SEC = 3;
/** 1試合の最大時間(ms)。決着がつかなくても、これを超えたらサーバーが打ち切る(残っている人は最高到達の高い順) */
export const MAX_MATCH_MS = 15 * 60 * 1000;
/** クライアントが自分の様子を送る間隔・サーバーがまとめて配る間隔(ms) */
export const STATE_INTERVAL_MS = 100;
/** ブロックを何個置くごとにおじゃまを送るか */
export const ATTACK_EVERY = 5;
/** 同じ人がおじゃまを送れる最短の間隔(ms)。これより短い attack はサーバーが捨てる */
export const ATTACK_MIN_INTERVAL_MS = 3000;
/** 相手に送るタワーのブロック数の上限 */
export const MAX_SNAP_BLOCKS = 50; // 1回の送信がサーバーの上限(2KB)に収まる数
/** ピースの種類の数(クライアントの pieces.ts の PIECES の数と同じ) */
export const PIECE_COUNT = 20;
/** 送れるおじゃまの種類(クライアントの邪魔イベントと同じ名前) */
export const ATTACK_KINDS = ['wind', 'meteor', 'speed'];

/** 相手に見せるブロック1個 [ピース番号, x, y, 角度(rad)] */
export type BlockSnap = [number, number, number, number];

/** 1人分のタワーの様子 */
export interface TowerState {
  /** いまの高さ(m) */
  h: number;
  /** 最高到達(m) */
  b: number;
  /** 落としたブロックの数 */
  d: number;
  /** レベル */
  lv: number;
  /** タワーのブロック */
  k: BlockSnap[];
  /** 持っているアイテム(0=ツタ 1=セメント 2=バリア 3=回復。使う順) */
  it: number[];
  /** 次と、その次のピース(PIECES の添字) */
  n: number[];
  /** 構え中の状態(ビット: 1=ツタ準備OK / 2=バリア展開中) */
  f: number;
}

export interface PlayerInfo {
  id: number;
  name: string;
}

/** 結果の1行。順位順(生き残った人 → 脱落が遅かった順)に並ぶ */
export interface ResultEntry {
  id: number;
  name: string;
  best: number;
  /** 脱落したか(3個落とした) */
  out: boolean;
}

import type { RoomPhase } from './online/core.ts';

export type ClientMsg =
  | { t: 'hello'; c: number }
  | { t: 'join' }
  | { t: 'leave' }
  | { t: 'loaded' }
  | ({ t: 'state' } & TowerState)
  | { t: 'attack'; k: string }
  | { t: 'out'; b: number };

export type ServerMsg =
  | { t: 'hello'; open: boolean; now: number; c: number }
  | { t: 'status'; open: boolean }
  | { t: 'error'; code: string; message?: string }
  | { t: 'room'; you: number; phase: RoomPhase; players: PlayerInfo[]; countdownEnd: number | null }
  /** 開始の合図。players の並びが参加者の番号(色)になる */
  | { t: 'start'; players: PlayerInfo[] }
  /** 全員のロード完了。startAt(サーバー時刻ms)にスタートする */
  | { t: 'go'; startAt: number }
  /** 全員のタワーの様子(id → 様子)。out は脱落した人、gone は抜けた人 */
  | { t: 'states'; p: Record<number, TowerState & { out: boolean }>; gone: number[] }
  /** おじゃま。from が to に k を送った(to の人の画面でイベントが起きる) */
  | { t: 'atk'; k: string; from: number; to: number }
  | { t: 'results'; entries: ResultEntry[] }
  | { t: 'left' };

export type { RoomPhase, PublicStatus } from './online/core.ts';
