import { CarSpecs } from '../models/CarBase';
import { CAR_PALETTES, type CarType, type ColorPreset } from '../../../../shared/carPalette';
import { PadEdge, startPadLoop, type PadPress } from '../../../../shared/arcadePad';

export interface CarSelectEvents {
  onSelectCar: (carType: 'trail_j' | 'cross_j' | 'truck_j') => void;
  onColorChange: (bodyColor: number, roofColor?: number) => void;
  onToggleLights?: (enabled: boolean) => void;
  onToggleTurntable?: (enabled: boolean) => void;
  onCameraViewChange?: (view: 'orbit' | 'front' | 'side' | 'cockpit') => void;
  onNext: () => void;
  /** ユーザーがマシンか色を選んだ時(画面を開いただけの初期選択では呼ばれない)。オンライン対戦の希望送信に使う。 */
  onPick?: (carType: CarType, preset: ColorPreset) => void;
  onBack: () => void;
}

export type { ColorPreset };

export class CarSelectScreen {
  private container: HTMLElement;
  private events: CarSelectEvents;
  private currentCarType: 'trail_j' | 'cross_j' | 'truck_j' = 'trail_j';
  private readonly carTypes: ('trail_j' | 'cross_j' | 'truck_j')[] = ['trail_j', 'cross_j', 'truck_j'];

  private selectedColorIndex: Record<'trail_j' | 'cross_j' | 'truck_j', number> = {
    trail_j: 0,
    cross_j: 0,
    truck_j: 0,
  };

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private isVisible: boolean = false;
  /** オンライン対戦の待機中: 決定ボタンは無く(時間で自動開始)、色は他の参加者と被れない。 */
  private onlineMode = false;
  private takenBodies = new Set<number>();

  constructor(container: HTMLElement, events: CarSelectEvents) {
    this.container = container;
    this.events = events;
    this.render();
  }

  private getColorsForCar(carType: CarType): ColorPreset[] {
    return CAR_PALETTES[carType];
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="arcade-title-bar">
        <div class="arcade-title-main">マシン選択</div>
      </div>

      <div class="car-select-content-arcade">
        <!-- Center area: 100% open showcase for 3D car -->
        <div class="car-center-showcase-spacer"></div>
      </div>

      <!-- Machine buttons: bottom centre, below the car -->
      <div class="car-select-bottom">
          <!-- Machine cards -->
          <div class="car-card-list-arcade">
            <div class="car-card-arcade active" data-car="trail_j" tabindex="0">
              <div class="car-card-focus-bar"></div>
              <div class="car-card-inner">
                <div class="car-badge-arcade">本格4WD ターボ</div>
                <div class="car-name-arcade">Trail J</div>
                <div class="arcade-gauges">
                  <div class="gauge-row">
                    <span class="g-lbl">最高速</span>
                    <div class="g-blocks"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span></div>
                  </div>
                  <div class="gauge-row">
                    <span class="g-lbl">加速力</span>
                    <div class="g-blocks"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span></div>
                  </div>
                </div>
                <div class="car-chips"><span>パートタイム4WD</span><span>1,040 kg</span></div>
                <p class="car-desc-arcade">本格派の軽オフローダー。どっしりした車重が持ち味。</p>
              </div>
            </div>

            <div class="car-card-arcade" data-car="cross_j" tabindex="0">
              <div class="car-card-focus-bar"></div>
              <div class="car-card-inner">
                <div class="car-badge-arcade">スポーティFF ターボ</div>
                <div class="car-name-arcade">Cross J</div>
                <div class="arcade-gauges">
                  <div class="gauge-row">
                    <span class="g-lbl">最高速</span>
                    <div class="g-blocks"><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span><span></span></div>
                  </div>
                  <div class="gauge-row">
                    <span class="g-lbl">加速力</span>
                    <div class="g-blocks"><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span><span></span></div>
                  </div>
                </div>
                <div class="car-chips"><span>フルタイム4WD</span><span>870 kg</span></div>
                <p class="car-desc-arcade">街でも山道でも扱いやすい、軽クロスオーバー。</p>
              </div>
            </div>

            <div class="car-card-arcade" data-car="truck_j" tabindex="0">
              <div class="car-card-focus-bar"></div>
              <div class="car-card-inner">
                <div class="car-badge-arcade">超軽量FR ミッドシップ</div>
                <div class="car-name-arcade">Truck J</div>
                <div class="arcade-gauges">
                  <div class="gauge-row">
                    <span class="g-lbl">最高速</span>
                    <div class="g-blocks"><span class="on"></span><span class="on"></span><span class="on"></span><span></span><span></span></div>
                  </div>
                  <div class="gauge-row">
                    <span class="g-lbl">加速力</span>
                    <div class="g-blocks"><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span><span class="on gold"></span></div>
                  </div>
                </div>
                <div class="car-chips"><span>4WD / 5MT</span><span>790 kg</span></div>
                <p class="car-desc-arcade">3台で最も軽い、小回りの利く軽トラック。</p>
              </div>
            </div>
          </div>
      </div>

      <!-- Action buttons -->
      <div class="arcade-action-bar">
        <button id="cs-btn-back" class="arcade-btn-back">戻る</button>
        <button id="cs-btn-cycle-color" class="arcade-color-cycle-btn" type="button" title="カラー変更">
          <span class="color-chip-preview" id="cs-color-chip"></span>
          <div class="color-info-text">
            <span class="color-name-arcade" id="cs-color-name">キネティックイエロー</span>
            <span class="color-sub-hint">カラー変更</span>
          </div>
        </button>
        <button id="cs-btn-next" class="arcade-btn-go glow">決定</button>
      </div>
    `;

    this.bindEvents();
    this.updateColorUI();
  }

  private bindEvents(): void {
    const cards = this.container.querySelectorAll<HTMLElement>('.car-card-arcade');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const carType = card.dataset.car as 'trail_j' | 'cross_j' | 'truck_j';
        if (carType && carType !== this.currentCarType) {
          this.setCarType(carType);
        }
      });
    });

    const cycleColorBtn = this.container.querySelector('#cs-btn-cycle-color');
    cycleColorBtn?.addEventListener('click', () => {
      this.cycleColor();
    });

    this.container.querySelector('#cs-btn-back')?.addEventListener('click', () => this.events.onBack());
    this.container.querySelector('#cs-btn-next')?.addEventListener('click', () => this.events.onNext());
  }

  /** オンライン対戦の待機中の表示にする(決定ボタンを隠し、戻るは「退出」)。 */
  public setOnlineMode(on: boolean): void {
    this.onlineMode = on;
    const back = this.container.querySelector<HTMLElement>('#cs-btn-back');
    if (back) back.textContent = on ? '退出' : '戻る';
    if (!on) this.takenBodies = new Set();
  }

  /** 他の参加者が使っている色(body)。色の切り替えでは飛ばされる。 */
  public setTakenColors(bodies: Set<number>): void {
    this.takenBodies = bodies;
  }

  /** サーバーが確定させたマシン/色を選択に反映する(希望は送らない)。 */
  public setCar(type: CarType, body: number): void {
    this.currentCarType = type;
    this.container.querySelectorAll<HTMLElement>('.car-card-arcade').forEach((c) => c.classList.toggle('active', c.dataset.car === type));
    this.events.onSelectCar(type);
    const i = this.getColorsForCar(type).findIndex((c) => c.bodyColor === body);
    if (i >= 0) this.selectedColorIndex[type] = i;
    this.applyCurrentColor();
  }

  public selectNextCar(): void {
    const currentIdx = this.carTypes.indexOf(this.currentCarType);
    const nextIdx = (currentIdx + 1) % this.carTypes.length;
    this.setCarType(this.carTypes[nextIdx]);
  }

  public selectPrevCar(): void {
    const currentIdx = this.carTypes.indexOf(this.currentCarType);
    const prevIdx = (currentIdx - 1 + this.carTypes.length) % this.carTypes.length;
    this.setCarType(this.carTypes[prevIdx]);
  }

  public setCarType(carType: 'trail_j' | 'cross_j' | 'truck_j'): void {
    this.currentCarType = carType;
    const cards = this.container.querySelectorAll<HTMLElement>('.car-card-arcade');
    cards.forEach((c) => {
      c.classList.toggle('active', c.dataset.car === carType);
    });

    this.events.onSelectCar(carType);
    this.skipTakenColor(carType);
    this.applyCurrentColor();
    this.emitPick();
  }

  /** 選択中の色が他の参加者と被っていたら、空いている次の色へ進める。 */
  private skipTakenColor(carType: CarType): void {
    if (!this.onlineMode) return;
    const colors = this.getColorsForCar(carType);
    for (let k = 0; k < colors.length; k++) {
      if (!this.takenBodies.has(colors[this.selectedColorIndex[carType]].bodyColor)) return;
      this.selectedColorIndex[carType] = (this.selectedColorIndex[carType] + 1) % colors.length;
    }
  }

  private emitPick(): void {
    const preset = this.getColorsForCar(this.currentCarType)[this.selectedColorIndex[this.currentCarType]];
    if (preset) this.events.onPick?.(this.currentCarType, preset);
  }

  public cycleColor(): void {
    const colors = this.getColorsForCar(this.currentCarType);
    this.selectedColorIndex[this.currentCarType] =
      (this.selectedColorIndex[this.currentCarType] + 1) % colors.length;
    this.skipTakenColor(this.currentCarType);
    this.applyCurrentColor();
    this.emitPick();
  }

  public setColorIndex(index: number): void {
    const colors = this.getColorsForCar(this.currentCarType);
    if (index >= 0 && index < colors.length) {
      this.selectedColorIndex[this.currentCarType] = index;
      this.applyCurrentColor();
      this.emitPick();
    }
  }

  private applyCurrentColor(): void {
    const colors = this.getColorsForCar(this.currentCarType);
    const idx = this.selectedColorIndex[this.currentCarType];
    const preset = colors[idx];
    if (preset) {
      this.events.onColorChange(preset.bodyColor, preset.roofColor);
    }
    this.updateColorUI();
  }

  private updateColorUI(): void {
    const colors = this.getColorsForCar(this.currentCarType);
    const idx = this.selectedColorIndex[this.currentCarType];
    const preset = colors[idx] || colors[0];

    const chipEl = this.container.querySelector<HTMLElement>('#cs-color-chip');
    const nameEl = this.container.querySelector<HTMLElement>('#cs-color-name');

    if (chipEl) {
      chipEl.style.background = preset.bgGradient;
    }
    if (nameEl) {
      nameEl.textContent = preset.name;
    }
  }

  public updateSpecs(_specs: CarSpecs): void {
    // Preserved for compatibility
  }

  // ==========================================
  // Gamepad (レバー: マシン選択 / X・Y・LB・RB: 色変更 / A・START: 決定 / B: 戻る)
  // ==========================================
  private handlePad(p: PadPress): void {
    if (p.up || p.left) this.selectPrevCar();
    else if (p.down || p.right) this.selectNextCar();

    if (p.any(2, 3, 4, 5)) this.cycleColor();
    if (p.any(0)) this.events.onNext();
    else if (p.any(1)) this.events.onBack();
  }

  public show(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.applyCurrentColor();

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;     // 名前の入力中にマシン操作へ誤爆しない
        if (e.code === 'ArrowDown' || e.code === 'KeyS') {
          e.preventDefault();
          this.selectNextCar();
        } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          this.selectPrevCar();
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          this.selectNextCar();
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          this.selectPrevCar();
        } else if (e.code === 'KeyC' || e.code === 'KeyX' || e.code === 'Tab') {
          e.preventDefault();
          this.cycleColor();
        } else if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.events.onNext();
        } else if (e.code === 'Escape' || e.code === 'Backspace') {
          e.preventDefault();
          this.events.onBack();
        } else if (e.code === 'Digit1') {
          this.setCarType('trail_j');
        } else if (e.code === 'Digit2') {
          this.setCarType('cross_j');
        } else if (e.code === 'Digit3') {
          this.setCarType('truck_j');
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }

    this.stopPad?.();
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (this.isVisible) this.handlePad(p);
    });
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.stopPad?.();
    this.stopPad = null;
  }
}

