// ============================================================
// 難易度選択画面: 深夜首都高のコース選択と同じ構成(タイトルバー・カード・下部アクションバー)。
// レバー左右で選び、A/STARTで決定、Bで戻る。キーボードは ←→ / Enter / Esc / 数字。
// ============================================================

import { LEVELS, LEVEL_ORDER, LevelId } from './levels.ts';
import { PadEdge, startPadLoop } from '../../../shared/arcadePad.ts';
import { buttonIconHtml } from '../../../shared/arcadeGuide.ts';

interface LevelCardInfo {
  glyphs: string[];
  stars: string;
  tag: string;
}

const CARD_INFO: Record<LevelId, LevelCardInfo> = {
  elementary: { glyphs: ['＋', '－', '×', '÷'], stars: '★☆☆', tag: '初心者向け' },
  middle: { glyphs: ['x²', '√', '%'], stars: '★★☆', tag: '標準' },
  kosen: { glyphs: ['∫', '∂', 'λ'], stars: '★★★', tag: '選択を迫られる' },
};

export interface LevelSelectEvents {
  onSelect: (level: LevelId) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export class LevelSelectScreen {
  private selected: LevelId = 'middle';
  private visible = false;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(private readonly container: HTMLElement, private readonly events: LevelSelectEvents) {
    this.render();
  }

  private render(): void {
    const cards = LEVEL_ORDER.map((id, i) => {
      const lv = LEVELS[id];
      const info = CARD_INFO[id];
      const reqs = lv.requirements.map((r) => r.value);
      return `
        <div class="lv-card" data-level="${id}">
          <div class="lv-badge">LEVEL ${String(i + 1).padStart(2, '0')}</div>
          <div class="lv-art">${info.glyphs.map((g) => `<span>${g}</span>`).join('')}</div>
          <div class="lv-name">${lv.label}</div>
          <div class="lv-sub">${lv.description}</div>
          <div class="lv-meta">
            <span class="lv-tag">要件 ${Math.min(...reqs)}〜${Math.max(...reqs)}</span>
            <span class="lv-tag stars">${info.stars}</span>
            <span class="lv-tag highlight">${info.tag}</span>
          </div>
        </div>`;
    }).join('');

    this.container.innerHTML = `
      <div class="lv-title-bar"><div class="lv-title-main">難易度選択</div></div>
      <div class="lv-cards">${cards}</div>
      <div class="lv-action-bar">
        <button type="button" class="lv-btn-back">${buttonIconHtml([1], 'Backspace')} タイトルへ</button>
        <button type="button" class="lv-btn-start">${buttonIconHtml([0], 'Enter')} 決定</button>
      </div>
    `;

    this.container.querySelectorAll<HTMLElement>('.lv-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSelected(card.dataset.level as LevelId);
      });
    });
    this.container.querySelector('.lv-btn-back')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.events.onBack();
    });
    this.container.querySelector('.lv-btn-start')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.events.onConfirm();
    });
  }

  private paint(): void {
    this.container.querySelectorAll<HTMLElement>('.lv-card').forEach((c) => {
      c.classList.toggle('active', c.dataset.level === this.selected);
    });
  }

  public setSelected(level: LevelId): void {
    this.selected = level;
    this.paint();
    this.events.onSelect(level);
  }

  private step(dir: number): void {
    const i = LEVEL_ORDER.indexOf(this.selected);
    const next = Math.min(LEVEL_ORDER.length - 1, Math.max(0, i + dir));
    if (next !== i) this.setSelected(LEVEL_ORDER[next]);
  }

  public show(current: LevelId): void {
    this.selected = current;
    this.paint();
    this.visible = true;
    this.container.classList.remove('hidden');

    this.stopPad?.();
    // レバー左右: 選択 / A: 決定 / B: タイトルへ戻る
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.visible) return;
      if (p.left) this.step(-1);
      else if (p.right) this.step(1);
      else if (p.any(0)) this.events.onConfirm();
      else if (p.any(1)) this.events.onBack();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.visible) return;
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          this.events.onConfirm();
        } else if (e.code === 'Escape' || e.code === 'Backspace') {
          // Escapeはゲーム共通の「ホームへ戻る」より先に取り、ここではタイトルへ戻る
          e.preventDefault();
          e.stopImmediatePropagation();
          this.events.onBack();
        } else if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          this.step(-1);
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          this.step(1);
        } else if (e.code.startsWith('Digit') && LEVEL_ORDER[Number(e.code.slice(5)) - 1]) {
          this.setSelected(LEVEL_ORDER[Number(e.code.slice(5)) - 1]);
        }
      };
      window.addEventListener('keydown', this.keyHandler, true);
    }
  }

  public hide(): void {
    this.visible = false;
    this.container.classList.add('hidden');
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler, true);
      this.keyHandler = null;
    }
  }
}
