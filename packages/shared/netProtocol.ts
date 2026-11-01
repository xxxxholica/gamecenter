// midnight-skyway オンライン対戦のメッセージ型。サーバー(packages/server)とクライアントの両方が相対importで共有する。
// 通信はすべてJSONテキスト。Nodeの型ストリップで直接実行されるため、enum等のランタイム構文は使わない。
//
// 対戦の場(ルーム)はサーバー全体で1つだけ。開放されている間は誰でも参加でき、最大4人。
// 流れ: 参加(lobby) → 2人目が入ると30秒で自動開始 → ロード(loading) → 走行(racing) → 結果 → ルームは空に戻る。

export const MAX_PLAYERS = 4;
export const STATE_HZ = 20;
/** 2人目が入ってから自動でレースが始まるまでの秒数。 */
export const AUTO_START_SEC = 30;
/** 選べるコース(サーバーもこの一覧で検証する)。 */
export const MAP_IDS = ['tsukikage_touge'];
/**
 * コースごとの最短完走タイム(ms)。これより短い finish はサーバーが不正として捨てる。
 * コース長 ÷ 最高速(約38m/s) のおよそ半分とした保守的な値(通常の走りでは到達できない)。
 */
export const MIN_FINISH_MS: Record<string, number> = {
  tsukikage_touge: 50000,
};
/** 主催者の設定値: コース/開放時間に「ランダム」を選べる。コースはレースごとに引き直される。 */
export const RANDOM = 'random';
/** 開放時間のランダムは、この中(分)から開放した時に1回だけ選ぶ。 */
export const RANDOM_MINUTES = [60, 120, 180, 360];

export interface CarSpec {
  type: string;
  body: number;
  roof: number;
}

/** 待機中の参加者。name は参加時にサーバーがランダムに付ける(走り屋の二つ名)。car が null=まだ選んでいない(開始時に自動で決まる)。course は希望するコース(null=おまかせ)。 */
export interface PlayerInfo {
  id: number;
  name: string;
  car: CarSpec | null;
  course: string | null;
}

/** 開始時に確定した参加者(マシンは全員決まっている)。 */
export interface RacerInfo {
  id: number;
  name: string;
  car: CarSpec;
}

/**
 * 20Hzで送る自車の姿勢。[x, y, z, rotY, speed, steer, roll, pitch, drift(0|1), progress, boost(0〜1)]
 * boost は後から足した項目で、無い(10個)状態も受け付ける(相手の炎を出すのに使う)。
 */
export type CarState = [number, number, number, number, number, number, number, number, number, number] | [number, number, number, number, number, number, number, number, number, number, number];

export interface FinishEntry {
  id: number;
  name: string;
  timeMs: number | null;
}

export type { RoomPhase, PublicStatus } from './online/core.ts';
import type { RoomPhase } from './online/core.ts';

export type ClientMsg =
  | { t: 'hello'; c: number }
  | { t: 'join' }
  /** 待機中の希望。マシン(種類+色)・コースのうち送ったものだけ更新する。色は他の参加者と被れない(被ると color_taken)。 */
  | { t: 'pref'; car?: CarSpec; course?: string | null }
  | { t: 'leave' }
  /** ts: 送信時のサーバー時刻(ms)。受け取った側が、通信の揺らぎに左右されず送信間隔どおりに補間するのに使う。 */
  | { t: 'state'; s: CarState; ts?: number }
  | { t: 'loaded' }
  | { t: 'finish'; timeMs: number };

export type ServerMsg =
  | { t: 'hello'; open: boolean; now: number; c: number }
  | { t: 'status'; open: boolean }
  | { t: 'error'; code: string; message?: string }
  | {
      t: 'room';
      you: number;
      phase: RoomPhase;
      players: PlayerInfo[];
      /** 主催者のコース設定: コースのid=固定(希望は無効)。'random'=参加者の希望の多いコース(なければ抽選)。 */
      mapMode: string;
      /** 希望の集計(コースid → 人数)。 */
      votes: Record<string, number>;
      /** 自動開始の時刻(サーバー時刻ms)。2人未満なら null。 */
      countdownEnd: number | null;
    }
  /** 全員がマップのロードを始める合図。コース・マシン(未選択は自動で決定済み)が確定している。grid は走行位置順の参加者id。 */
  | { t: 'start'; seed: number; map: string; grid: number[]; players: RacerInfo[] }
  /** 全員のロード完了。at(サーバー時刻ms)にカウントダウンを開始する。 */
  | { t: 'go'; at: number }
  /** ts: s の各車の、送信側が付けた送信時刻(サーバー時刻ms)。付いていない車は無い。 */
  | { t: 'states'; s: Record<number, CarState>; ts?: Record<number, number> }
  /** 走行中の順位(先頭が1位の参加者id)。サーバーが全員の進行率を同じ時刻に揃えて決めるので、全員の画面で同じになる。 */
  | { t: 'standings'; order: number[] }
  | { t: 'results'; entries: FinishEntry[]; done: boolean; endsInMs?: number }
  /** レースが終わってルームが空に戻った(次のレースに出るには、もう一度参加する)。 */
  | { t: 'left' };
