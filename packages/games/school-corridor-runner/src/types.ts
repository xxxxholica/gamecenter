export type LaneIndex = 0 | 1 | 2;

export const LANE_COORDINATES: readonly [number, number, number] = [-3, 0, 3] as const;

export enum GameState {
  TITLE = 'TITLE',
  DEMO = 'DEMO',
  PLAYING = 'PLAYING',
  GAMEOVER = 'GAMEOVER',
  CLEARED = 'CLEARED',
}

export enum ObstacleType {
  DESK_CHAIR = 'DESK_CHAIR',           // 小型・机と椅子（単語帳・ボム両方で破壊可）
  LOCKER_VAULT = 'LOCKER_VAULT',       // 大型・ロッカー/跳び箱（ボム専用で破壊可）
  TEACHER = 'TEACHER',                 // 破壊不可・生活指導の先生（左右に避ける）
  HANGING_SIGN = 'HANGING_SIGN',       // 上部・看板（スライディングでくぐる）
  GIMMICK_JUMP = 'GIMMICK_JUMP',       // 全レーン封鎖・低障害物（ジャンプで跳び越える）
  GIMMICK_SLIDE = 'GIMMICK_SLIDE',     // 全レーン封鎖・低シャッター/横断幕（スライディングでくぐる）
  GIMMICK_BOMB = 'GIMMICK_BOMB',       // 全レーン封鎖・巨大段ボール壁/バリケード（ボムで爆破必須）
  CHARGING_CART = 'CHARGING_CART',     // 動的・暴走配膳台（正面突進・ボムで粉砕可）
  FALLING_LOCKER = 'FALLING_LOCKER',   // 動的・倒壊ロッカー（手前に倒壊・ジャンプで跳び越え可）
  BOUNCING_BALL = 'BOUNCING_BALL',     // 動的・バウンドボール（横断バウンド・シュリケンまたはスライド）
  SWEEPING_POLISHER = 'SWEEPING_POLISHER', // 動的・清掃ポリッシャー（左右往復・シュリケン/ボム可）
  FIRE = 'FIRE',                       // 破壊不可・業火/火災（飛び越え不能・左右移動で迂回必須）
}

export interface GameScore {
  score: number;
  combo: number;
  maxCombo: number;
  distance: number;
  destroyedCount: number;
  dodgedSignsCount: number;
  timeRemaining: number;
  grade: string;
}

export interface GameInputState {
  laneLeft: boolean;      // ワンショットトリガー
  laneRight: boolean;     // ワンショットトリガー
  jump: boolean;          // ワンショットトリガー（ジャンプ）
  slide: boolean;         // 押しっぱなし状態（スライディング）
  attack: boolean;        // 統合攻撃（Enter / ボタン1：手裏剣・辞書ランダム投擲）
  shootShuriken: boolean; // 後方互換
  throwBomb: boolean;     // 後方互換
  startOrRetry: boolean;  // スタート / リトライ
  anyKey: boolean;        // デモからの復帰など
}
