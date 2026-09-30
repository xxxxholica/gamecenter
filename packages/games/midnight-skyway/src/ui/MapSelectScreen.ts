import { PadEdge, startPadLoop } from '../input/arcadePad';
import { StoredRecord } from '../core/TimeAttackManager';
import { courseOutlineSvg } from './courseOutline';
import { STAGES } from './stages';

export interface MapSelectEvents {
  onSelectMap: (mapId: string) => void;
  onStartRace: () => void;
  onBack: () => void;
}

/** Stage order on screen (left to right). */
const MAP_ORDER = STAGES.map((s) => s.id);

export class MapSelectScreen {
  private container: HTMLElement;
  private events: MapSelectEvents;
  private selectedMapId: string = STAGES[0].id;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private isVisible: boolean = false;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;

  constructor(container: HTMLElement, events: MapSelectEvents) {
    this.container = container;
    this.events = events;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="arcade-title-bar">
        <div class="arcade-title-main">コース選択</div>
      </div>

      <div class="map-cards-container-arcade">
        ${STAGES.map((st, i) => `
        <div class="map-card-arcade${i === 0 ? ' active' : ''}" data-map="${st.id}">
          <div class="map-num-badge">STAGE ${String(i + 1).padStart(2, '0')}</div>
          ${courseOutlineSvg(st.id)}
          <div class="map-card-title-arcade">${st.title}</div>
          <div class="map-card-sub-arcade">${st.sub}</div>

          <div class="map-meta-row">
            <span class="meta-tag">${st.length}</span>
            <span class="meta-tag stars">${st.stars}</span>
            <span class="meta-tag highlight">${st.tag}</span>
          </div>

          <div class="map-record-arcade">
            <div class="rec-label">自己ベスト記録</div>
            <div class="rec-time-digital" id="rec-time-${st.id}">--:--.---</div>
          </div>
        </div>`).join('')}
      </div>

      <!-- Action buttons -->
      <div class="arcade-action-bar">
        <button id="ms-btn-back" class="arcade-btn-back">マシン選択へ</button>
        <button id="ms-btn-start" class="arcade-btn-start glow">決定</button>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const cards = this.container.querySelectorAll<HTMLElement>('.map-card-arcade');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const mapId = card.dataset.map;
        if (mapId && mapId !== this.selectedMapId) {
          this.setSelectedMap(mapId);
        }
      });
    });

    this.container.querySelector('#ms-btn-back')?.addEventListener('click', () => this.events.onBack());
    this.container.querySelector('#ms-btn-start')?.addEventListener('click', () => this.events.onStartRace());
  }

  public setSelectedMap(mapId: string): void {
    this.selectedMapId = mapId;
    const cards = this.container.querySelectorAll<HTMLElement>('.map-card-arcade');
    cards.forEach((c) => {
      c.classList.toggle('active', c.dataset.map === mapId);
    });
    this.events.onSelectMap(mapId);
  }

  private stepMap(dir: number): void {
    const i = MAP_ORDER.indexOf(this.selectedMapId);
    this.setSelectedMap(MAP_ORDER[Math.min(MAP_ORDER.length - 1, Math.max(0, i + dir))]);
  }

  public getSelectedMap(): string {
    return this.selectedMapId;
  }

  public updateRecords(records: Record<string, StoredRecord | null>): void {
    const formatTime = (ms: number) => {
      const totalSec = Math.floor(ms / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      const millis = Math.floor(ms % 1000);
      return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
    };

    for (const id of MAP_ORDER) {
      const rec = records[id];
      const el = this.container.querySelector(`#rec-time-${id}`);
      if (el) el.textContent = rec ? formatTime(rec.bestTimeMs) : '--:--.---';
    }
  }

  public show(records?: Record<string, StoredRecord | null>): void {
    if (records) {
      this.updateRecords(records);
    }
    this.isVisible = true;
    this.container.style.display = 'flex';

    this.stopPad?.();
    // レバー左右: コース選択 / A・START: 決定(時間帯選択へ) / B: マシン選択へ戻る
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.isVisible) return;
      if (p.left) this.stepMap(-1);
      else if (p.right) this.stepMap(1);
      else if (p.any(0, 9)) this.events.onStartRace();
      else if (p.any(1)) this.events.onBack();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.events.onStartRace();
        } else if (e.code === 'Escape') {
          e.preventDefault();
          this.events.onBack();
        } else if (e.code === 'ArrowLeft') {
          this.stepMap(-1);
        } else if (e.code === 'ArrowRight') {
          this.stepMap(1);
        } else if (e.code.startsWith('Digit') && MAP_ORDER[Number(e.code.slice(5)) - 1]) {
          this.setSelectedMap(MAP_ORDER[Number(e.code.slice(5)) - 1]);
        }
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
