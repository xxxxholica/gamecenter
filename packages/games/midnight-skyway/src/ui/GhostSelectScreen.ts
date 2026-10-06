import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import { escapeHtml, type LeaderboardEntry } from '../../../../shared/arcadeLeaderboard';

/** 選んだゴースト(ランキングのエントリ) */
export interface GhostPick {
  id: string;
  rank: number;
}

export interface GhostSelectEvents {
  onSelect: (pick: GhostPick) => void;
  onStart: () => void;
  onBack: () => void;
}

const SLOTS = 3;

/**
 * Step between the course and the time of day: pick which of the top-3 runs to race against.
 * Always three cards (1st / 2nd / 3rd); a rank without a recorded run is greyed out and cannot be picked.
 */
export class GhostSelectScreen {
  private slots: (LeaderboardEntry | null)[] = [];
  private selected = 0;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private isVisible = false;

  constructor(private readonly container: HTMLElement, private readonly events: GhostSelectEvents) {}

  /** ゴーストが保存されている(=選べる)順位か */
  private static pickable(e: LeaderboardEntry | null | undefined): e is LeaderboardEntry & { id: string } {
    return !!e && e.hasGhost === true && typeof e.id === 'string';
  }

  private card(rank: number, e: LeaderboardEntry | null): string {
    if (!GhostSelectScreen.pickable(e)) {
      return `
        <div class="map-card-arcade time-card ghost-card disabled" data-rank="${rank}">
          <div class="map-num-badge">${rank}位</div>
          <div class="time-card-art"><div class="ghost-rank-num">${rank}</div></div>
          <div class="map-card-title-arcade">記録なし</div>
          <div class="map-card-sub-arcade">---</div>
          <div class="time-card-desc">この順位のゴーストは<br>まだありません。</div>
        </div>`;
    }
    return `
      <div class="map-card-arcade time-card ghost-card" data-rank="${rank}">
        <div class="map-num-badge">${rank}位</div>
        <div class="time-card-art"><div class="ghost-rank-num">${rank}</div></div>
        <div class="map-card-title-arcade">${escapeHtml(e.name)}</div>
        <div class="map-card-sub-arcade">${escapeHtml(e.formattedScore)}</div>
        <div class="time-card-desc">${escapeHtml(e.extra ?? '')}<br>${escapeHtml(e.date)}</div>
      </div>`;
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="arcade-title-bar">
        <div class="arcade-title-main">ゴースト選択</div>
      </div>

      <div class="time-cards-container">
        ${this.slots.map((e, i) => this.card(i + 1, e)).join('')}
      </div>

      <div class="arcade-action-bar">
        <button id="gs-btn-back" class="arcade-btn-back">コース選択へ</button>
        <button id="gs-btn-start" class="arcade-btn-start glow">決定</button>
      </div>
    `;
    this.container.querySelectorAll<HTMLElement>('.ghost-card').forEach((card) => {
      card.addEventListener('click', () => this.setSelected(Number(card.dataset.rank) - 1));
    });
    this.container.querySelector('#gs-btn-back')?.addEventListener('click', () => this.events.onBack());
    this.container.querySelector('#gs-btn-start')?.addEventListener('click', () => this.events.onStart());
    this.paint();
  }

  private paint(): void {
    this.container.querySelectorAll<HTMLElement>('.ghost-card').forEach((c) => {
      c.classList.toggle('active', Number(c.dataset.rank) - 1 === this.selected);
    });
  }

  /** 選べる順位だけを選択する(記録のない順位は無視) */
  public setSelected(index: number): void {
    const e = this.slots[index];
    if (!GhostSelectScreen.pickable(e) || index === this.selected) return;
    this.selected = index;
    this.paint();
    this.events.onSelect({ id: e.id, rank: e.rank });
  }

  /** dir 方向へ、選べる次の順位に移る(記録のない順位は飛ばす。端では動かない) */
  private move(dir: -1 | 1): void {
    for (let i = this.selected + dir; i >= 0 && i < SLOTS; i += dir) {
      if (GhostSelectScreen.pickable(this.slots[i])) {
        this.setSelected(i);
        return;
      }
    }
  }

  /** この画面を出す価値があるか(選べるゴーストが1つ以上あるか) */
  public static hasChoices(entries: LeaderboardEntry[]): boolean {
    return entries.some((e) => GhostSelectScreen.pickable(e));
  }

  /** entries はそのコースのランキング(順位順)。selectedId は選択中のエントリ(なければいちばん上位が選ばれる) */
  public show(entries: LeaderboardEntry[], selectedId: string | null): void {
    this.slots = Array.from({ length: SLOTS }, (_, i) => entries.find((e) => e.rank === i + 1) ?? null);
    const byId = this.slots.findIndex((e) => GhostSelectScreen.pickable(e) && e.id === selectedId);
    this.selected = byId >= 0 ? byId : Math.max(0, this.slots.findIndex((e) => GhostSelectScreen.pickable(e)));
    this.render();
    this.isVisible = true;
    this.container.style.display = 'flex';

    this.stopPad?.();
    // レバー左右: 選択 / A: 決定 / B: コース選択へ戻る
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.isVisible) return;
      if (p.left) this.move(-1);
      else if (p.right) this.move(1);
      else if (p.any(0)) this.events.onStart();
      else if (p.any(1)) this.events.onBack();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); this.events.onStart(); }
        else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.events.onBack(); }
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.move(-1);
        else if (e.code === 'ArrowRight' || e.code === 'KeyD') this.move(1);
        else if (e.code === 'Digit1') this.setSelected(0);
        else if (e.code === 'Digit2') this.setSelected(1);
        else if (e.code === 'Digit3') this.setSelected(2);
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
