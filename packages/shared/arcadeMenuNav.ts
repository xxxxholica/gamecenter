// 全ゲーム共通: メニューの選択移動(WASD / 矢印 / アケコンのスティック)を「押した瞬間」のイベントとして溜める。
// 毎フレームの押下状態を見る方式だと、フレームの合間に離した短い入力が消えたり、
// プレイ中から押しっぱなしのキーが効かなかったりするので、keydown と スティックの傾き始めを直接キューに積む。
// 向きは 上・左 = -1 / 下・右 = +1 (メニューは縦並びでも横並びでも同じ操作で動く)。

export class MenuNav {
  private queue: number[] = [];
  private padDir = 0;

  /** keydown から呼ぶ。移動キーならキューに積み、積んだら true を返す。連続入力(repeat)は無視する。 */
  public pushKey(e: KeyboardEvent): boolean {
    if (e.repeat) return false;
    const dir = MenuNav.keyDir(e.code);
    if (dir === 0) return false;
    this.queue.push(dir);
    return true;
  }

  /** スティック/十字キーの傾き(x: 右が正, y: 下が正)。傾き始めの瞬間だけ積む。毎フレーム呼ぶ。 */
  public updatePad(x: number, y: number): void {
    const dir = x < -0.5 || y < -0.5 ? -1 : x > 0.5 || y > 0.5 ? 1 : 0;
    if (dir !== 0 && dir !== this.padDir) this.queue.push(dir);
    this.padDir = dir;
  }

  /** 溜まった移動を取り出して空にする(1フレームに1回)。 */
  public take(): number[] {
    const out = this.queue;
    this.queue = [];
    return out;
  }

  public clear(): void {
    this.queue = [];
    this.padDir = 0;
  }

  public static keyDir(code: string): number {
    switch (code) {
      case 'ArrowLeft': case 'KeyA': case 'ArrowUp': case 'KeyW':
        return -1;
      case 'ArrowRight': case 'KeyD': case 'ArrowDown': case 'KeyS':
        return 1;
      default:
        return 0;
    }
  }
}
