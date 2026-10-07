// sumo-smash-3d オンライン対戦のメッセージ型。サーバー(packages/server)とクライアントの両方が相対importで共有する。
// 通信はすべてJSONテキスト。Nodeの型ストリップで直接実行されるため、enum等のランタイム構文は使わない。
//
// 2〜4人の乱戦。物理・当たり判定・ラウンド進行は「サーバー」が持つ(shared/sumoSim)。クライアントは表示と操作の送信だけ。
//   クライアント → サーバー : input(自分の操作)
//   サーバー → 全員         : snap(全力士の状態と、そのあいだに起きた演出イベント。約20Hz)
// 土俵から押し出されたら脱落。最後に残った人が1点。先に WINS_TO_MATCH 点取った人の勝ち。

export const MAX_PLAYERS = 4;
/** サーバーがスナップショットを送る間隔(ms)。20Hz。 */
export const SNAP_INTERVAL_MS = 50;
/** 二本先取。 */
export const WINS_TO_MATCH = 2;
/** 1ラウンドの最長(秒)。超えたら無得点で取り直し(全員が動かない・膠着の安全弁)。 */
export const ROUND_TIME_LIMIT_SEC = 90;
/** 1試合の最大時間(ms)。これを超えたらサーバーが打ち切る。 */
export const MAX_MATCH_MS = 15 * 60 * 1000;

/** FighterActionState の並び(スナップショットでは添字で送る)。 */
export const STATE_NAMES = [
  'idle', 'walk', 'strike_hold', 'harite', 'buchikamashi_charge', 'buchikamashi_rush',
  'grab_attempt', 'grab_holding', 'throw', 'grabbed', 'hit', 'fall',
];
/** ラウンド進行(スナップショットでは添字で送る)。 */
export const ROUND_NAMES = ['standby', 'active', 'finished', 'match_over'];

/**
 * 力士1人分の状態。
 * [x, y, z, vx, vy, vz, facing, state, stateTimer, chargeTimer, damage, buchiCd, grabCd, hariteGauge, hariteArm(0=right|1=left), grabHoldTimer, gone(0|1)]
 */
export type FighterSnap = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

/** 演出イベント [種類, ...引数]。種類は shared/sumoSim/fxTable.ts の FX の添字。 */
export type FxEvent = (number | string | boolean)[];

export interface SnapMsgBody {
  /** サーバーの時刻(ms)。クライアントは遅らせて補間する */
  ts: number;
  /** 通し番号(欠落・並べ替えの検出) */
  n: number;
  /** リセット回数。変わったら、位置が瞬間移動したので補間しない */
  rc: number;
  /** ラウンド進行(ROUND_NAMES の添字) */
  rs: number;
  /** 力士ごとの得点(1ラウンドに勝った回数)。並びは start の players と同じ */
  w: number[];
  /** 力士ごとの状態。並びは start の players と同じ */
  f: FighterSnap[];
  /** 前回の送信から今回までに起きた演出 */
  e: FxEvent[];
}

/** クライアント → サーバー。[moveX, moveZ, isMoving(0|1), strikePressed, strike, strikeReleased, grabPressed](ワールド座標の移動)。押した瞬間・離した瞬間は、次の送信まで保持して1回だけ立てる。 */
export type InputTuple = [number, number, number, number, number, number, number];

import type { RoomPhase } from './online/core.ts';

export interface PlayerInfo {
  id: number;
  name: string;
}

export type ClientMsg =
  | { t: 'hello'; c: number }
  | { t: 'join' }
  | { t: 'leave' }
  | { t: 'loaded' }
  | { t: 'input'; i: InputTuple };

export type ServerMsg =
  | { t: 'hello'; open: boolean; now: number; c: number }
  | { t: 'status'; open: boolean }
  | { t: 'error'; code: string; message?: string }
  | { t: 'room'; you: number; phase: RoomPhase; players: PlayerInfo[]; countdownEnd: number | null }
  /** 開始の合図。players の並びが力士の番号(1番目が東方 蒼天龍、2番目が西方 紅炎山 …)。 */
  | { t: 'start'; players: PlayerInfo[] }
  | { t: 'go' }
  | ({ t: 'snap' } & SnapMsgBody)
  /** 試合が終わった。w=勝った人の番号(誰もいなければ null)、s=得点 */
  | { t: 'results'; w: number | null; s: number[] }
  | { t: 'left' };

export type { RoomPhase, PublicStatus } from './online/core.ts';
