import { untrackedRandom } from '../../../../shared/arcadeReplay';

/**
 * 稲光: ときどき光り(2回ほど瞬く)、すばやく減衰する。level(0〜1)を画面の明るさに使う。
 * レース中の背景(DriveScene)とメニューの背景(GarageScene)で共用する。
 */
export class Lightning {
  public level = 0;
  private timer: number;
  private pulses: number[] = [];

  /** firstDelay: 最初の稲光までの秒数 / minGap, maxGap: 次の稲光までの間隔(秒) */
  constructor(firstDelay: number, private readonly minGap = 10, private readonly maxGap = 24, private readonly decay = 9) {
    this.timer = firstDelay;
  }

  /** 進める。新しく光った瞬間だけ true(雷鳴を鳴らす合図)。spontaneous=false: ひとりでには光らない(strike の減衰だけ) */
  public update(dt: number, spontaneous = true): boolean {
    let struck = false;
    if (spontaneous) this.timer -= dt;
    if (spontaneous && this.timer <= 0) {
      this.timer = this.minGap + untrackedRandom() * (this.maxGap - this.minGap);
      this.level = 1;
      this.pulses = [0.12 + untrackedRandom() * 0.08, 0.3 + untrackedRandom() * 0.1];
      struck = true;
    }
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      this.pulses[i] -= dt;
      if (this.pulses[i] <= 0) { this.level = Math.max(this.level, 0.8); this.pulses.splice(i, 1); }
    }
    this.level *= Math.exp(-this.decay * dt);
    if (this.level < 0.01) this.level = 0;
    return struck;
  }

  /** いま落とす(ゴールの演出の落雷)。2回ほど瞬いて消える */
  public strike(): void {
    this.level = 0.45;
    this.pulses = [0.1, 0.24];
  }

  public reset(): void {
    this.level = 0;
    this.pulses = [];
  }
}
