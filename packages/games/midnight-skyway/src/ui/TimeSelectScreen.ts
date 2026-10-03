import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import type { TimeOfDay } from '../core/TimeOfDay';

export interface TimeSelectEvents {
  onSelect: (t: TimeOfDay) => void;
  onStartRace: () => void;
  onBack: () => void;
}

const SUN = `<svg viewBox="0 0 120 80" aria-hidden="true"><circle cx="60" cy="40" r="17" fill="#ffd54a"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="60" y1="40" x2="${60 + 33 * Math.cos((a * Math.PI) / 180)}" y2="${40 + 33 * Math.sin((a * Math.PI) / 180)}" stroke="#ffd54a" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 22 12 100"/>`).join('')}</svg>`;
const MOON = `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M74 14a28 28 0 1 0 22 44A24 24 0 0 1 74 14z" fill="#f4f1de"/>${[[18, 16, 2], [34, 60, 1.5], [100, 20, 1.8], [22, 40, 1.2], [92, 66, 1.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('')}</svg>`;

/** Second step after the course: day or night. */
export class TimeSelectScreen {
  private selected: TimeOfDay = 'night';
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private isVisible = false;

  constructor(private readonly container: HTMLElement, private readonly events: TimeSelectEvents) {
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="arcade-title-bar">
        <div class="arcade-title-main">時間帯選択</div>
      </div>

      <div class="time-cards-container">
        <div class="map-card-arcade time-card day" data-time="day">
          <div class="map-num-badge">DAY</div>
          <div class="time-card-art">${SUN}</div>
          <div class="map-card-title-arcade">日中</div>
          <div class="map-card-sub-arcade">明るい空と雲</div>
          <div class="time-card-desc">街灯は消灯。街の細部まで見渡せます。</div>
        </div>
        <div class="map-card-arcade time-card night" data-time="night">
          <div class="map-num-badge">NIGHT</div>
          <div class="time-card-art">${MOON}</div>
          <div class="map-card-title-arcade">夜間</div>
          <div class="map-card-sub-arcade">星空と月明かり</div>
          <div class="time-card-desc">街とビルの明かり、街灯、ヘッドライトが点灯します。</div>
        </div>
      </div>

      <div class="arcade-action-bar">
        <button id="ts-btn-back" class="arcade-btn-back">コース選択へ</button>
        <button id="ts-btn-start" class="arcade-btn-start glow">レース開始</button>
      </div>
    `;
    this.container.querySelectorAll<HTMLElement>('.time-card').forEach((card) => {
      card.addEventListener('click', () => this.setSelected(card.dataset.time as TimeOfDay));
    });
    this.container.querySelector('#ts-btn-back')?.addEventListener('click', () => this.events.onBack());
    this.container.querySelector('#ts-btn-start')?.addEventListener('click', () => this.events.onStartRace());
    this.paint();
  }

  private paint(): void {
    this.container.querySelectorAll<HTMLElement>('.time-card').forEach((c) => c.classList.toggle('active', c.dataset.time === this.selected));
  }

  public setSelected(t: TimeOfDay): void {
    this.selected = t;
    this.paint();
    this.events.onSelect(t);
  }

  public getSelected(): TimeOfDay { return this.selected; }

  public show(current: TimeOfDay): void {
    this.selected = current;
    this.paint();
    this.isVisible = true;
    this.container.style.display = 'flex';

    this.stopPad?.();
    // レバー左右: 選択 / A: レース開始 / B: コース選択へ戻る
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.isVisible) return;
      if (p.left) this.setSelected('day');
      else if (p.right) this.setSelected('night');
      else if (p.any(0)) this.events.onStartRace();
      else if (p.any(1)) this.events.onBack();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.events.onStartRace(); }
        else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.events.onBack(); }
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Digit1') this.setSelected('day');
        else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Digit2') this.setSelected('night');
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
