// サーバー側で受け取った、1人分の操作の保持。移動と押している間は最新の値、押した瞬間・離した瞬間は消費されるまで保持する
// (シミュレーションの1ステップで1回だけ立つ)。
import type { InputTuple } from '../sumoProtocol.ts';

export class RemoteInput {
  public moveX = 0;
  public moveZ = 0;
  public isMoving = false;
  public strike = false;
  /** 最後に操作を受け取った時刻(ms)。届かなくなったら、押しっぱなしを続けないために止める */
  public lastAt = 0;
  private pressed = false;
  private released = false;
  private grab = false;

  public apply(i: InputTuple, nowMs: number): void {
    // 斜めで長さが1を超える値は、歩行が速くならないよう丸める
    const len = Math.hypot(i[0], i[1]);
    const k = len > 1 ? 1 / len : 1;
    this.moveX = i[0] * k;
    this.moveZ = i[1] * k;
    this.isMoving = i[2] === 1;
    this.strike = i[4] === 1;
    if (i[3] === 1) this.pressed = true;
    if (i[5] === 1) this.released = true;
    if (i[6] === 1) this.grab = true;
    this.lastAt = nowMs;
  }

  /** 1ステップ分の操作を取り出し、押した瞬間・離した瞬間を消費する。 */
  public take(): { strikePressed: boolean; strike: boolean; strikeReleased: boolean; grabPressed: boolean } {
    const out = { strikePressed: this.pressed, strike: this.strike, strikeReleased: this.released, grabPressed: this.grab };
    this.pressed = this.released = this.grab = false;
    return out;
  }

  /** 仕切り中などに溜まった押した瞬間・離した瞬間を捨てる(立ち合いの前の操作を持ち越さない)。 */
  public clearEdges(): void {
    this.pressed = this.released = this.grab = false;
  }

  /** 何も押していない状態に戻す。 */
  public reset(): void {
    this.moveX = this.moveZ = 0;
    this.isMoving = this.strike = false;
    this.clearEdges();
  }
}
