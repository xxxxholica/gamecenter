// ファイナルステージの「後ろから大量のスケートボード犬が追ってくる」出現の計画。
// いつ・何匹出すかだけを決める(位置や犬そのものの生成は Stage が行う)。時間とともに間隔が詰まり、数が増える。

export interface HordeConfig {
  /** 開始(GO)から最初の犬が出るまでの猶予(秒) */
  startDelay: number;
  /** 出現の間隔(秒)。開始直後の値と、rampTime 経過後の値 */
  intervalStart: number;
  intervalEnd: number;
  /** 間隔が intervalEnd に達するまでの時間(秒) */
  rampTime: number;
  /** 1回に出す匹数。開始直後の値と、rampTime 経過後の値(間は線形) */
  batchStart: number;
  batchEnd: number;
  /** 画面にいる犬の上限(負荷を抑える) */
  maxAlive: number;
}

export const FINAL_HORDE: HordeConfig = {
  startDelay: 3,
  intervalStart: 1.8,
  intervalEnd: 0.55,
  rampTime: 45,
  batchStart: 1,
  batchEnd: 3,
  maxAlive: 26,
};

export class HordeSpawner {
  private elapsed = 0;
  private timer: number;
  private readonly cfg: HordeConfig;

  constructor(cfg: HordeConfig = FINAL_HORDE) {
    this.cfg = cfg;
    this.timer = cfg.startDelay;
  }

  /** 経過時間を進め、いま出す犬の数を返す(出さないときは 0)。alive は現在生きている犬の数。 */
  public update(dt: number, alive: number): number {
    this.elapsed += dt;
    this.timer -= dt;
    if (this.timer > 0) return 0;

    const k = Math.min(1, this.elapsed / this.cfg.rampTime);
    this.timer += this.cfg.intervalStart + (this.cfg.intervalEnd - this.cfg.intervalStart) * k;
    // 遅れて大量に溜まった分を一度に出さない(タブが止まっていたあとなど)
    if (this.timer < 0) this.timer = 0;

    const batch = Math.round(this.cfg.batchStart + (this.cfg.batchEnd - this.cfg.batchStart) * k);
    return Math.max(0, Math.min(batch, this.cfg.maxAlive - alive));
  }

  /** ミスして再開するとき: 猶予からやり直す(進行の度合い=増え方は保つ) */
  public restartGrace(graceSeconds: number): void {
    this.timer = graceSeconds;
  }
}
