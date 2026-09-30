import { CarSpecs } from '../models/CarBase';
import { PadEdge, startPadLoop, type PadPress } from '../../../../shared/arcadePad';

export interface CarSelectEvents {
  onSelectCar: (carType: 'trail_j' | 'cross_j' | 'truck_j') => void;
  onColorChange: (bodyColor: number, roofColor?: number) => void;
  onToggleLights?: (enabled: boolean) => void;
  onToggleTurntable?: (enabled: boolean) => void;
  onCameraViewChange?: (view: 'orbit' | 'front' | 'side' | 'cockpit') => void;
  onNext: () => void;
  onBack: () => void;
}

export interface ColorPreset {
  name: string;
  bodyColor: number;
  roofColor: number;
  bgGradient: string;
}

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

  private trailJColors: ColorPreset[] = [
    { name: 'キネティックイエロー', bodyColor: 0xded235, roofColor: 0x1a1c22, bgGradient: '#ded235' },
    { name: 'ジャングルグリーン', bodyColor: 0x243325, roofColor: 0x1a1c22, bgGradient: '#243325' },
    { name: 'ブリスクブルー', bodyColor: 0x1976d2, roofColor: 0x1a1c22, bgGradient: '#1976d2' },
    { name: 'ミディアムグレー', bodyColor: 0x4b5563, roofColor: 0x1a1c22, bgGradient: '#4b5563' },
    { name: 'シフォンアイボリー', bodyColor: 0xe6cf9e, roofColor: 0x1a1c22, bgGradient: '#e6cf9e' },
    { name: 'ピュアホワイト', bodyColor: 0xf5f6fa, roofColor: 0x1a1c22, bgGradient: '#f5f6fa' },
    { name: 'ブルーイッシュブラック', bodyColor: 0x11141a, roofColor: 0x11141a, bgGradient: '#11141a' },
  ];

  private crossJColors: ColorPreset[] = [
    { name: 'オレンジ×白', bodyColor: 0xe05615, roofColor: 0xf5f6fa, bgGradient: 'linear-gradient(135deg, #e05615 50%, #ffffff 50%)' },
    { name: 'デニムブルー×ガンメ', bodyColor: 0x2952a3, roofColor: 0x2d3436, bgGradient: 'linear-gradient(135deg, #2952a3 50%, #2d3436 50%)' },
    { name: 'フェニックスレッド×黒', bodyColor: 0xd63031, roofColor: 0x1a1c22, bgGradient: 'linear-gradient(135deg, #d63031 50%, #1a1c22 50%)' },
    { name: 'クールカーキ×白', bodyColor: 0x3d4d3d, roofColor: 0xf5f6fa, bgGradient: 'linear-gradient(135deg, #3d4d3d 50%, #ffffff 50%)' },
    { name: 'オフブルー×白', bodyColor: 0x54a0ff, roofColor: 0xf5f6fa, bgGradient: 'linear-gradient(135deg, #54a0ff 50%, #ffffff 50%)' },
    { name: 'ピュアホワイト×黒', bodyColor: 0xf5f6fa, roofColor: 0x1a1c22, bgGradient: 'linear-gradient(135deg, #f5f6fa 50%, #1a1c22 50%)' },
  ];

  private truckJColors: ColorPreset[] = [
    { name: 'ホワイト', bodyColor: 0xf5f6fa, roofColor: 0xf5f6fa, bgGradient: '#f5f6fa' },
    { name: 'シルバーメタリック', bodyColor: 0xc8d6e5, roofColor: 0xc8d6e5, bgGradient: '#c8d6e5' },
    { name: 'タフカーキ', bodyColor: 0x3b4a3f, roofColor: 0x3b4a3f, bgGradient: '#3b4a3f' },
    { name: 'サンドベージュ', bodyColor: 0xd2b58c, roofColor: 0xd2b58c, bgGradient: '#d2b58c' },
    { name: 'マットブラック', bodyColor: 0x22262e, roofColor: 0x22262e, bgGradient: '#22262e' },
    { name: 'レスキューオレンジ', bodyColor: 0xe67e22, roofColor: 0xe67e22, bgGradient: '#e67e22' },
  ];

  constructor(container: HTMLElement, events: CarSelectEvents) {
    this.container = container;
    this.events = events;
    this.render();
  }

  private getColorsForCar(carType: 'trail_j' | 'cross_j' | 'truck_j'): ColorPreset[] {
    if (carType === 'cross_j') return this.crossJColors;
    if (carType === 'truck_j') return this.truckJColors;
    return this.trailJColors;
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
    this.applyCurrentColor();
  }

  public cycleColor(): void {
    const colors = this.getColorsForCar(this.currentCarType);
    this.selectedColorIndex[this.currentCarType] =
      (this.selectedColorIndex[this.currentCarType] + 1) % colors.length;
    this.applyCurrentColor();
  }

  public setColorIndex(index: number): void {
    const colors = this.getColorsForCar(this.currentCarType);
    if (index >= 0 && index < colors.length) {
      this.selectedColorIndex[this.currentCarType] = index;
      this.applyCurrentColor();
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
    if (p.any(0, 9)) this.events.onNext();
    else if (p.any(1)) this.events.onBack();
  }

  public show(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';
    this.applyCurrentColor();

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
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

