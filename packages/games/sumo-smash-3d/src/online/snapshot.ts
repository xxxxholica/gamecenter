// オンライン対戦の純粋なロジック(three.js に依存しない): サーバーから届くスナップショットの補間バッファ、自分の操作の送信まとめ。
// 単体テストできるよう、描画や通信には触れない。
import type { FighterSnap, InputTuple, SnapMsgBody } from '../../../../shared/sumoProtocol.ts';

/** 受け取った状態を、この時間だけ遅らせて描く(通信の揺れを吸収する補間のための余裕)。 */
export const INTERP_DELAY_MS = 100;
/** 溜めておくスナップショットの上限(古いものから捨てる) */
const MAX_BUFFER = 40;
/** 到着の遅れの最小値を取る窓(サンプル数。20Hzで約5秒) */
const OFFSET_WINDOW = 100;

export interface Sample {
  a: SnapMsgBody;
  b: SnapMsgBody | null;
  /** a→b の補間位置(0〜1)。b が無い・補間しない時は 0 */
  t: number;
}

/**
 * サーバーから届いたスナップショットを時刻順に溜め、描画時刻の位置を補間して返す。
 * サーバーの時計(ts)と自分の時計は合っていないので、「到着時刻 - ts」の最小値(=もっとも遅れなかった到着)を
 * 時計のずれ+最小の通信時間とみなし、そこから INTERP_DELAY_MS だけ遅らせた時刻を描画時刻にする。
 */
export class SnapBuffer {
  private snaps: SnapMsgBody[] = [];
  private offsets: number[] = [];
  private firedN = -1;

  public get size(): number {
    return this.snaps.length;
  }

  public clear(): void {
    this.snaps = [];
    this.offsets = [];
    this.firedN = -1;
  }

  /** nowMs: 受け取った時の自分の時刻(Date.now()) */
  public push(s: SnapMsgBody, nowMs: number): void {
    const last = this.snaps[this.snaps.length - 1];
    if (last && s.n <= last.n) return;                       // 古い・重複は捨てる
    this.snaps.push(s);
    if (this.snaps.length > MAX_BUFFER) this.snaps.shift();
    this.offsets.push(nowMs - s.ts);
    if (this.offsets.length > OFFSET_WINDOW) this.offsets.shift();
  }

  /** サーバーの時刻に直した描画時刻。まだ何も届いていなければ null。 */
  public renderTime(nowMs: number): number | null {
    if (this.offsets.length === 0) return null;
    let base = Infinity;
    for (const o of this.offsets) if (o < base) base = o;
    return nowMs - base - INTERP_DELAY_MS;
  }

  /** 描画時刻の状態。最初のスナップショットより前なら最初のもの、最後より後なら最後のものを返す(外挿はしない)。 */
  public sample(nowMs: number): Sample | null {
    const rt = this.renderTime(nowMs);
    if (rt === null) return null;
    const list = this.snaps;
    let i = -1;
    for (let k = 0; k < list.length; k++) {
      if (list[k].ts <= rt) i = k;
      else break;
    }
    if (i < 0) return { a: list[0], b: null, t: 0 };
    const a = list[i];
    const b = list[i + 1] ?? null;
    if (!b || b.rc !== a.rc) return { a, b: null, t: 0 };    // 瞬間移動(リセット)をまたぐ補間はしない
    const span = b.ts - a.ts;
    return { a, b, t: span > 0 ? Math.min(1, Math.max(0, (rt - a.ts) / span)) : 0 };
  }

  /** 描画時刻に達したスナップショットの演出イベントを、まだ出していない分だけ取り出す。 */
  public drainEvents(nowMs: number): SnapMsgBody['e'] {
    const rt = this.renderTime(nowMs);
    if (rt === null) return [];
    const out: SnapMsgBody['e'] = [];
    for (const s of this.snaps) {
      if (s.n <= this.firedN) continue;
      if (s.ts > rt) break;
      this.firedN = s.n;
      out.push(...s.e);
    }
    return out;
  }
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

/** 力士の状態の補間。位置・速度・向き・タイマー類は補間し、状態・腕などの離散値は前の方を使う。 */
export function lerpFighter(a: FighterSnap, b: FighterSnap | null, t: number): FighterSnap {
  if (!b || t <= 0) return a;
  const sameState = a[7] === b[7];
  const out = a.slice() as FighterSnap;
  for (const i of [0, 1, 2, 3, 4, 5, 10, 11, 12, 13]) out[i] = lerp(a[i], b[i], t);
  out[6] = lerpAngle(a[6], b[6], t);
  if (sameState) for (const i of [8, 9, 15]) out[i] = lerp(a[i], b[i], t);
  return out;
}

/**
 * 自分の操作のまとめ役。毎フレームの入力を受け取り、押した瞬間・離した瞬間は送るまで保持して取りこぼさず、
 * 送る間隔を空ける(サーバーの毎秒60通の上限に収める)。送るべき時だけタプルを返す。
 *
 * (将来の先読みはここが起点: 送った入力に通し番号を付けて、自分の移動だけ先に動かすなど。)
 */
export class InputSender {
  private lastSentAt = -Infinity;
  private last: InputTuple | null = null;
  private pressed = 0;
  private released = 0;
  private grab = 0;

  /** 送信の最小間隔(ms)。変化があっても、これより短い間隔では送らない */
  private readonly minIntervalMs: number;
  /** 変化がなくても、この間隔で送る(サーバーが操作の途絶えを見分けるための生存通知) */
  private readonly keepAliveMs: number;

  constructor(minIntervalMs = 25, keepAliveMs = 200) {
    this.minIntervalMs = minIntervalMs;
    this.keepAliveMs = keepAliveMs;
  }

  public reset(): void {
    this.lastSentAt = -Infinity;
    this.last = null;
    this.pressed = this.released = this.grab = 0;
  }

  /** moveX/moveZ はワールド座標の移動方向。戻り値があれば送る。 */
  public update(nowMs: number, moveX: number, moveZ: number, isMoving: boolean, strikePressed: boolean, strike: boolean, strikeReleased: boolean, grabPressed: boolean): InputTuple | null {
    if (strikePressed) this.pressed = 1;
    if (strikeReleased) this.released = 1;
    if (grabPressed) this.grab = 1;
    const r = (v: number) => Math.round(v * 100) / 100;
    const cur: InputTuple = [r(moveX), r(moveZ), isMoving ? 1 : 0, this.pressed, strike ? 1 : 0, this.released, this.grab];
    const changed = !this.last || cur.some((v, i) => v !== this.last![i]);
    const due = changed ? nowMs - this.lastSentAt >= this.minIntervalMs : nowMs - this.lastSentAt >= this.keepAliveMs;
    if (!due) return null;
    this.lastSentAt = nowMs;
    this.pressed = this.released = this.grab = 0;            // 送ったので、押した瞬間・離した瞬間は消す
    // 次回の比較用には、瞬間の項目を除いた状態を持つ(同じ入力が続くだけなら、変化なしとみなす)
    this.last = [cur[0], cur[1], cur[2], 0, cur[4], 0, 0];
    return cur;
  }
}
