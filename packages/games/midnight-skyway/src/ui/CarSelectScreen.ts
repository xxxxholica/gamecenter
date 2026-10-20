import { buttonIconHtml } from '../../../../shared/arcadeGuide';
import { CarSpecs } from '../models/CarBase';
import { CAR_PALETTES, type CarType, type ColorPreset } from '../../../../shared/carPalette';
import { btnHtml, setBtnLabel } from './btnGuide';
import { PadEdge, startPadLoop, type PadPress } from '../../../../shared/arcadePad';

export interface CarSelectEvents {
  onSelectCar: (carType: CarType) => void;
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

interface GaugeData {
  label: string;
  value: number; // 0..5
  colorClass: 'cyan' | 'gold';
}

interface CarCardData {
  id: CarType;
  num: string;
  name: string;
  sub: string;
  gauges: GaugeData[];
  specMain: string;
}

const CAR_CARDS: CarCardData[] = [
  {
    id: 'dragon_a',
    num: 'MACHINE 01',
    name: 'Dragon Crimson',
    sub: '紅蓮の火竜 ハイパーカー',
    gauges: [
      { label: '最高速', value: 4, colorClass: 'gold' },
      { label: '旋回力', value: 4, colorClass: 'cyan' },
      { label: '耐久力', value: 3, colorClass: 'cyan' },
    ],
    specMain: '加速とコーナリングのバランス型',
  },
  {
    id: 'dragon_b',
    num: 'MACHINE 02',
    name: 'Dragon Azure',
    sub: '蒼雷の東洋龍 フォーミュラ',
    gauges: [
      { label: '最高速', value: 5, colorClass: 'gold' },
      { label: '旋回力', value: 5, colorClass: 'gold' },
      { label: '耐久力', value: 2, colorClass: 'cyan' },
    ],
    specMain: '軽量・最高速特化',
  },
  {
    id: 'dragon_c',
    num: 'MACHINE 03',
    name: 'Dragon Gold',
    sub: '黄金の重装竜 GTマッスル',
    gauges: [
      { label: '最高速', value: 3, colorClass: 'cyan' },
      { label: '旋回力', value: 2, colorClass: 'cyan' },
      { label: '耐久力', value: 5, colorClass: 'gold' },
    ],
    specMain: '重装甲・高耐久の突破力',
  },
];

export class CarSelectScreen {
  private container: HTMLElement;
  private events: CarSelectEvents;
  private currentCarType: CarType = 'dragon_a';
  private readonly carTypes: CarType[] = ['dragon_a', 'dragon_b', 'dragon_c'];

  private selectedColorIndex: Record<CarType, number> = {
    dragon_a: 0,
    dragon_b: 0,
    dragon_c: 0,
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

      <!-- Machine buttons: bottom centre, below the car -->
      <div class="car-select-bottom">
          <!-- Machine cards -->
          <div class="car-card-list-arcade">
            ${CAR_CARDS.map((c) => `
            <div class="car-card-arcade${c.id === this.currentCarType ? ' active' : ''}" data-car="${c.id}" tabindex="0">
              <img class="car-outline" src="./ui/car_card_${c.id}.webp" alt="" draggable="false">
              <div class="car-card-title-arcade">${c.name}</div>
              <div class="car-card-sub-arcade">${c.sub}</div>

              <div class="arcade-gauges">
                ${c.gauges.map((g) => `
                <div class="gauge-row">
                  <span class="g-lbl">${g.label}</span>
                  <div class="g-blocks">
                    ${Array.from({ length: 5 }, (_, i) => `<span class="${i < g.value ? `on ${g.colorClass}` : ''}"></span>`).join('')}
                  </div>
                </div>`).join('')}
              </div>

              <div class="car-spec-arcade">
                <div class="spec-header-row">
                  <span class="spec-badge">特性</span>
                </div>
                <div class="spec-main-digital">${c.specMain}</div>
              </div>
            </div>`).join('')}
          </div>
      </div>

      <!-- Action buttons -->
      <div class="arcade-action-bar">
        <button id="cs-btn-back" class="arcade-btn-back">${btnHtml('戻る', [1], 'Backspace')}</button>
        <button id="cs-btn-cycle-color" class="arcade-btn-back" type="button"><span class="btn-guide">${buttonIconHtml([2, 3, 4, 5], 'C')}</span><span class="btn-label-col"><span class="btn-label">カラー変更</span><span class="btn-current"><i class="color-chip-preview" id="cs-color-chip"></i><span id="cs-color-name"></span></span></span></button>
        <button id="cs-btn-next" class="arcade-btn-go glow">${btnHtml('決定', [0], 'Enter')}</button>
      </div>
    `;

    this.bindEvents();
    this.updateColorUI();
  }

  private bindEvents(): void {
    const cards = this.container.querySelectorAll<HTMLElement>('.car-card-arcade');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const carType = card.dataset.car as CarType;
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
    setBtnLabel(back, on ? '退出' : '戻る');
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

  public setCarType(carType: CarType): void {
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
    const armAt = performance.now() + 150;
    this.container.style.display = 'flex';
    this.applyCurrentColor();

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible || performance.now() < armAt) return;
        if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;     // 名前の入力中にマシン操作へ誤爆しない
        if (e.code === 'KeyS') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.selectNextCar();
        } else if (e.code === 'KeyW') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.selectPrevCar();
        } else if (e.code === 'KeyD') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.selectNextCar();
        } else if (e.code === 'KeyA') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.selectPrevCar();
        } else if (e.code === 'KeyC') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.cycleColor();
        } else if (e.code === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.events.onNext();
        } else if (e.code === 'Backspace' && !e.repeat) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.events.onBack();
        } else if (e.code === 'Digit1') {
          this.setCarType('dragon_a');
        } else if (e.code === 'Digit2') {
          this.setCarType('dragon_b');
        } else if (e.code === 'Digit3') {
          this.setCarType('dragon_c');
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

