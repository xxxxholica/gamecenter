import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import type { PublicStatus } from '../../../../shared/netProtocol';

export type PlayMode = 'offline' | 'online';

export interface ModeSelectEvents {
  onSelect: (mode: PlayMode) => void;
  onBack: () => void;
}

const CAR = `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M14 52h92l-8-16c-2-4-6-6-10-6H44c-4 0-8 2-10 5L22 44l-8 3z" fill="#e8eef8"/><circle cx="36" cy="56" r="9" fill="#2a3446" stroke="#e8eef8" stroke-width="3"/><circle cx="86" cy="56" r="9" fill="#2a3446" stroke="#e8eef8" stroke-width="3"/><path d="M40 34l6-6h26l8 6z" fill="#7fb7ff"/></svg>`;
const VS = `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M6 60 28 20l22 40z" fill="#ffd54a"/><path d="M114 60 92 20 70 60z" fill="#00e5ff"/><text x="60" y="52" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="30" fill="#fff" stroke="#05070c" stroke-width="2" paint-order="stroke">VS</text></svg>`;

/** マシン選択の前に出る、遊び方の選択: オフライン走行 / オンライン対戦(開催中だけ出る)。 */
export class ModeSelectScreen {
  private readonly container: HTMLElement;
  private readonly events: ModeSelectEvents;
  private selected: PlayMode = 'offline';
  private online: PublicStatus | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private isVisible = false;

  constructor(container: HTMLElement, events: ModeSelectEvents) {
    this.container = container;
    this.events = events;
  }

  /** 満員: オンライン対戦のカードはグレーアウトして選べない。 */
  private get full(): boolean {
    return this.online !== null && this.online.players >= this.online.max;
  }

  private onlineSub(): string {
    const s = this.online;
    if (!s) return '';
    if (s.phase !== 'lobby') return 'レース中';
    if (this.full) return '満員';
    return `参加中 ${s.players}/${s.max}`;
  }

  private render(): void {
    const online = this.online !== null;
    this.container.innerHTML = `
      <div class="arcade-title-bar">
        <div class="arcade-title-main">モード選択</div>
      </div>

      <div class="time-cards-container">
        <div class="map-card-arcade time-card" data-mode="offline">
          <div class="map-num-badge">OFFLINE</div>
          <div class="time-card-art">${CAR}</div>
          <div class="map-card-title-arcade">オフライン走行</div>
          <div class="map-card-sub-arcade">ひとりでタイムアタック</div>
          <div class="time-card-desc">好きなコースと時間帯で、自己ベストを狙います。</div>
        </div>
        ${online ? `
        <div class="map-card-arcade time-card${this.full ? ' disabled' : ''}" data-mode="online"${this.full ? ' aria-disabled="true"' : ''}>
          <div class="map-num-badge">ONLINE</div>
          <div class="time-card-art">${VS}</div>
          <div class="map-card-title-arcade">オンライン対戦</div>
          <div class="map-card-sub-arcade" id="ms-online-sub"></div>
          <div class="time-card-desc">最大4人で同時スタート。待っている間にマシンとコースの希望を出せます。</div>
        </div>` : ''}
      </div>

      <div class="arcade-action-bar">
        <button id="mode-btn-back" class="arcade-btn-back">タイトルへ</button>
        <button id="mode-btn-start" class="arcade-btn-start glow">決定</button>
      </div>
    `;
    const sub = this.container.querySelector('#ms-online-sub');
    if (sub) sub.textContent = this.onlineSub();
    this.container.querySelectorAll<HTMLElement>('.time-card').forEach((card) => {
      card.addEventListener('click', () => {
        this.select(card.dataset.mode as PlayMode);
      });
      card.addEventListener('dblclick', () => {
        if (card.dataset.mode === this.selected) this.events.onSelect(this.selected);
      });
    });
    this.container.querySelector('#mode-btn-back')?.addEventListener('click', () => this.events.onBack());
    this.container.querySelector('#mode-btn-start')?.addEventListener('click', () => this.events.onSelect(this.selected));
    this.paint();
  }

  private paint(): void {
    this.container.querySelectorAll<HTMLElement>('.time-card').forEach((c) => c.classList.toggle('active', c.dataset.mode === this.selected));
  }

  private select(mode: PlayMode): void {
    if (mode === 'online' && (this.online === null || this.full)) return;     // 閉鎖中・満員は選べない
    this.selected = mode;
    this.paint();
  }

  private step(dir: number): void {
    const order: PlayMode[] = this.online && !this.full ? ['offline', 'online'] : ['offline'];
    this.select(order[Math.min(order.length - 1, Math.max(0, order.indexOf(this.selected) + dir))]);
  }

  /** online: 開催中ならその状況(null=閉鎖中。オンライン対戦のカードは出ない)。 */
  public show(online: PublicStatus | null): void {
    this.online = online;
    if (!online || online.players >= online.max) this.selected = 'offline';
    this.render();
    this.isVisible = true;
    this.container.style.display = 'flex';

    this.stopPad?.();
    // レバー左右: 選択 / A: 決定 / B: タイトルへ戻る
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.isVisible) return;
      if (p.left) this.step(-1);
      else if (p.right) this.step(1);
      else if (p.any(0)) this.events.onSelect(this.selected);
      else if (p.any(1)) this.events.onBack();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.events.onSelect(this.selected); }
        else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.events.onBack(); }
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA' || e.code === 'Digit1') this.step(-1);
        else if (e.code === 'ArrowRight' || e.code === 'KeyD' || e.code === 'Digit2') this.step(1);
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
