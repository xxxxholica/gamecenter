// 「入った瞬間」だけ知らせるトリガー。重なっている間は毎フレーム true になる判定(水柱など)に、得点・コンボ・効果音を
// 1回の通過につき1回だけ出させるために使う。重なっている間の継続効果(打ち上げの速度など)は、呼び出し側が重なりを見て続ける。
export class EdgeTrigger {
  private inside = false;

  /** 毎フレーム、いま重なっているかを渡す。重なり始めたフレームだけ true を返す。 */
  public update(inside: boolean): boolean {
    const entered = inside && !this.inside;
    this.inside = inside;
    return entered;
  }

  public reset(): void {
    this.inside = false;
  }
}
