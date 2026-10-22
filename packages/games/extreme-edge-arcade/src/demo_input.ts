import { InputManager } from './input';

export class DemoInputManager extends InputManager {
  private demoTime = 0;
  private stageId = 1;

  private simBtn0 = false;
  private simPrevBtn0 = false;
  private simBtn1 = false;
  private simPrevBtn1 = false;
  private simLeverY = 0;

  setScenario(stageId: number) {
    this.stageId = stageId;
    this.demoTime = 0;
    this.simBtn0 = false;
    this.simPrevBtn0 = false;
    this.simBtn1 = false;
    this.simPrevBtn1 = false;
    this.simLeverY = 0;
  }

  updateDemo(dt: number) {
    this.demoTime += dt;
    this.simPrevBtn0 = this.simBtn0;
    this.simPrevBtn1 = this.simBtn1;

    // Stage 1: Drink (自動で注がれる → 終盤で止める)
    if (this.stageId === 1) {
      this.simBtn0 = this.demoTime >= 4.0 && this.demoTime < 4.2;
    }

    // Stage 2 (id=2, Stage3Phone): Smartphone Charge
    else if (this.stageId === 2) {
      // Wait until near 0.015% (at ~4.1 seconds)
      if (this.demoTime >= 4.15 && this.demoTime < 4.35) {
        this.simBtn0 = true;
      } else {
        this.simBtn0 = false;
      }
    }

    // Stage 3 (id=3, Stage4Clock): Alarm Clock
    else if (this.stageId === 3) {
      // Virtual seconds advance at 2.0-2.5x. Stop at around 3.85s (approx 9.2-9.6s virtual)
      if (this.demoTime >= 3.85 && this.demoTime < 4.1) {
        this.simBtn0 = true;
      } else {
        this.simBtn0 = false;
      }
    }

    // Stage 4 (id=4, Stage5Balloon): 自動でふくらむ風船を、割れる寸前で止める
    // 風船は速さの幅(±10%)で 4.5〜5.6 秒で割れるので、4.2 秒で止める(大きさ 80〜94%)。これより遅いと、速い風船は先に割れる
    else if (this.stageId === 4) {
      this.simBtn0 = this.demoTime >= 4.2 && this.demoTime < 4.4;
    }
  }

  override isButton0(): boolean {
    return this.simBtn0;
  }

  override wasButton0Pressed(): boolean {
    return this.simBtn0 && !this.simPrevBtn0;
  }

  override wasButton0Released(): boolean {
    return !this.simBtn0 && this.simPrevBtn0;
  }

  override isButton1(): boolean {
    return this.simBtn1;
  }

  override wasButton1Pressed(): boolean {
    return this.simBtn1 && !this.simPrevBtn1;
  }

  override isLeverUp(): boolean {
    return this.simLeverY < -0.3;
  }

  override wasLeverUpPressed(): boolean {
    return this.simLeverY < -0.4;
  }

  override isLeverDown(): boolean {
    return this.simBtn1 || this.simLeverY > 0.3;
  }

  override wasLeverDownPressed(): boolean {
    return (this.simBtn1 && !this.simPrevBtn1) || this.simLeverY > 0.4;
  }

  override anyPressed(): boolean {
    return false; // don't self-interrupt
  }
}
