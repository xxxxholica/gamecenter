import { btnHtml, setBtnLabel } from './btnGuide';
import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import { formatTimeMs } from '../../../../shared/arcadeLeaderboardCore';
import { StoredRecord } from '../core/TimeAttackManager';
import { courseOutlineSvg } from './courseOutline';
import { STAGES } from './stages';
import { PEOPLE_SOLID_SVG, TIMER_SOLID_SVG } from './icons';

export interface MapSelectEvents {
  onSelectMap: (mapId: string) => void;
  onStartRace: () => void;
  /** オンライン対戦: コース希望から待機画面へ進む。 */
  onStartOnline: () => void;
  onBack: () => void;
  /** オンライン対戦のコース希望: 選択済みのカードをもう一度押す(または Backspace キー)と、希望を取り消す。 */
  onClearPick?: () => void;
}

/** Stage order on screen (left to right). */
const COURSE_ORDER = STAGES.map((s) => s.id);

export class MapSelectScreen {
  private container: HTMLElement;
  private events: MapSelectEvents;
  private selectedMapId: string = STAGES[0].id;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private isVisible: boolean = false;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  /** オンライン対戦のコース希望: 決定ボタンは無く(時間で自動開始)、選んだ時点で希望として送られる。 */
  private onlineMode = false;
  /** 主催者がコースを固定している間は、希望は変えられない。 */
  private locked = false;

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
          <img class="map-photo" src="./ui/course_${st.id}.webp" alt="" draggable="false">

          <!-- タイトル・サブ・タグ・ベストタイムの右に、コース図を並べる -->
          <div class="map-info-row">
            <div class="map-info-text">
              <div class="map-card-title-arcade">${st.title}</div>
              <div class="map-card-sub-arcade">${st.sub}</div>

              <div class="map-meta-row">
                <span class="meta-tag">${st.length}</span>
                <span class="meta-tag stars">${st.stars}</span>
                <span class="meta-tag highlight">${st.tag}</span>
              </div>

              <div class="map-record-arcade">
                <div class="rec-label" aria-label="ベストタイム">${TIMER_SOLID_SVG}</div>
                <div class="rec-time-digital" id="rec-time-${st.id}">--:--.---</div>
              </div>
            </div>
            ${courseOutlineSvg(st.id)}
          </div>
        </div>`).join('')}
      </div>

      <!-- Action buttons -->
      <div class="arcade-action-bar">
        <button id="ms-btn-back" class="arcade-btn-back">${btnHtml('マシン選択へ', [1], 'Backspace')}</button>
        <button id="ms-btn-start" class="arcade-btn-start glow">${btnHtml('決定', [0], 'Enter')}</button>
      </div>
    `;

    this.bindEvents();
  }

  private bindEvents(): void {
    const cards = this.container.querySelectorAll<HTMLElement>('.map-card-arcade');
    cards.forEach((card) => {
      card.addEventListener('click', () => {
        const mapId = card.dataset.map;
        if (this.locked) return;
        if (this.onlineMode && mapId && mapId === this.selectedMapId) {   // 選択済みを押し直すと取り消し
          this.clearPick();
          return;
        }
        if (mapId && mapId !== this.selectedMapId) {
          this.setSelectedMap(mapId);
        }
      });
    });

    this.container.querySelector('#ms-btn-back')?.addEventListener('click', () => this.events.onBack());
    this.container.querySelector('#ms-btn-start')?.addEventListener('click', () => this.confirm());
  }

  public setSelectedMap(mapId: string): void {
    this.selectedMapId = mapId;
    const cards = this.container.querySelectorAll<HTMLElement>('.map-card-arcade');
    cards.forEach((c) => {
      c.classList.toggle('active', c.dataset.map === mapId);
    });
    this.events.onSelectMap(mapId);
  }

  private order(): string[] {
    return COURSE_ORDER;
  }

  private clearPick(): void {
    if (this.locked || !this.onlineMode) return;
    this.selectedMapId = '';
    this.container.querySelectorAll<HTMLElement>('.map-card-arcade').forEach((c) => c.classList.remove('active'));
    this.events.onClearPick?.();
  }

  private stepMap(dir: number): void {
    if (this.locked) return;
    const order = this.order();
    const i = order.indexOf(this.selectedMapId);
    this.setSelectedMap(order[Math.min(order.length - 1, Math.max(0, i + dir))]);
  }

  /** 決定: オフラインならレース開始。オンラインでは待機画面へ(希望は選んだ時点で送られている)。 */
  private confirm(): void {
    if (this.onlineMode) this.events.onStartOnline();
    else this.events.onStartRace();
  }

  /** オンライン対戦のコース希望の画面にする。 */
  public setOnlineMode(on: boolean): void {
    this.onlineMode = on;
    if (!on) this.locked = false;
    const q = <T extends HTMLElement>(sel: string) => this.container.querySelector<T>(sel);
    const title = q('.arcade-title-main');
    if (title) title.textContent = on ? 'コース希望' : 'コース選択';
    const back = q('#ms-btn-back');
    setBtnLabel(back, 'マシン選択へ');
    const start = q('#ms-btn-start');
    if (start && !on) setBtnLabel(start, '決定');
    this.container.querySelectorAll<HTMLElement>('.map-card-arcade:not(.any-card) .rec-label').forEach((l) => {
      l.innerHTML = on ? PEOPLE_SOLID_SVG : TIMER_SOLID_SVG;  // ベストタイム / 希望している人数
      l.setAttribute('aria-label', on ? '希望している人' : 'ベストタイム');
    });
    if (on) {
      this.selectedMapId = '';                               // オフラインで選んでいたコースの強調を消す(希望なしの状態)
      this.container.querySelectorAll<HTMLElement>('.map-card-arcade').forEach((c) => c.classList.remove('active'));
      COURSE_ORDER.forEach((id) => { const e = q(`#rec-time-${id}`); if (e) e.textContent = '0人'; });
    }
  }

  /**
   * 希望の集計と自分の希望を画面に反映する(希望は送らない)。
   * fixed: 主催者がコースを固定している時のコースid(その間は変えられない)。mine: 自分の希望(null=希望なし)。
   */
  public setOnlineState(votes: Record<string, number>, mine: string | null, fixed: string | null): void {
    this.locked = fixed !== null;
    for (const id of COURSE_ORDER) {
      const e = this.container.querySelector(`#rec-time-${id}`);
      if (e) e.textContent = `${votes[id] ?? 0}人`;
    }
    const active = fixed ?? mine ?? '';                      // 希望なし: どのカードも選ばれていない
    this.selectedMapId = active;
    this.container.querySelectorAll<HTMLElement>('.map-card-arcade').forEach((c) => c.classList.toggle('active', c.dataset.map === active));
  }

  public updateRecords(records: Record<string, StoredRecord | null>): void {
    for (const id of COURSE_ORDER) {
      const rec = records[id];
      const el = this.container.querySelector(`#rec-time-${id}`);
      if (el) el.textContent = rec ? formatTimeMs(rec.bestTimeMs) : '--:--.---';
    }
  }

  public show(records?: Record<string, StoredRecord | null>): void {
    if (records) {
      this.updateRecords(records);
    }
    this.isVisible = true;
    const armAt = performance.now() + 150;
    this.container.style.display = 'flex';

    this.stopPad?.();
    // レバー左右: コース選択 / A: 決定(レース開始) / B: マシン選択へ戻る
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.isVisible) return;
      if (p.left) this.stepMap(-1);
      else if (p.right) this.stepMap(1);
      else if (p.any(0)) this.confirm();
      else if (p.any(1)) this.events.onBack();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible || performance.now() < armAt) return;
        if (e.code === 'Enter') {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.confirm();
        } else if (e.code === 'Backspace' && !e.repeat && !(this.onlineMode && !this.locked && this.selectedMapId)) {
          // 戻る。オンラインでは、コースを希望している間は先に希望の取り消しになり(下)、希望がなければ戻る
          e.preventDefault();
          e.stopImmediatePropagation();
          this.events.onBack();
        } else if (e.code === 'KeyA') {
          e.stopImmediatePropagation();
          this.stepMap(-1);
        } else if (e.code === 'Backspace' && !e.repeat && this.onlineMode) {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.clearPick();
        } else if (e.code === 'KeyD') {
          e.stopImmediatePropagation();
          this.stepMap(1);
        } else if (e.code.startsWith('Digit') && !this.locked && this.order()[Number(e.code.slice(5)) - 1]) {
          this.setSelectedMap(this.order()[Number(e.code.slice(5)) - 1]);
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
