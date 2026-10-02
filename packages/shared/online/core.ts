// オンライン対戦の共通メッセージ(どのゲームでも同じ)。ゲーム固有のメッセージは、ゲームごとの型ファイルで定義する。
// Nodeの型ストリップ(サーバー)でも読み込まれるため、ランタイム構文は使わない(enum等)。

export type RoomPhase = 'lobby' | 'loading' | 'racing';

/** 公開ステータス(GET /online-status の games[<id>])。「オンライン対戦」を出すかの判定に使う。個人情報なし。 */
export interface PublicStatus {
  open: boolean;
  players: number;
  max: number;
  phase: RoomPhase;
}

export type CoreClientMsg =
  | { t: 'hello'; c: number }
  | { t: 'join' }
  | { t: 'leave' }
  | { t: 'loaded' };

export type CoreServerMsg =
  | { t: 'hello'; open: boolean; now: number; c: number }
  | { t: 'status'; open: boolean }
  | { t: 'error'; code: string; message?: string }
  /** レースが終わってルームが空に戻った(次に出るには、もう一度参加する) */
  | { t: 'left' };

/** 待機表示(room)の共通部分。ゲームごとに拡張する。 */
export interface BaseRoom {
  t: 'room';
  you: number;
  phase: RoomPhase;
  players: { id: number; name: string }[];
  /** 自動開始の時刻(サーバー時刻ms)。2人未満なら null */
  countdownEnd: number | null;
}

/** 自動開始までの秒数(表示用。サーバーの既定と同じ)。 */
export const AUTO_START_SEC = 30;
