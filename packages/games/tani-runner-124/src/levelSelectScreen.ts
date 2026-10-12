// ============================================================
// 難易度選択画面: オンライン対応ゲームのモード選択と同じ共通部品(ModeSelect の arcade 版)を使う。
// ←→/レバーで選び、Enter/A で決定、Esc/B でタイトルへ戻る。
// ============================================================

import { LEVELS, LEVEL_ORDER, LevelId } from './levels.ts';
import { ModeSelect, type ModeItem } from '../../../shared/online/ModeSelect.ts';

const ACCENT = '#00e676';

interface LevelCardInfo {
  glyphs: string[];
  stars: number;
  tag: string;
}

const CARD_INFO: Record<LevelId, LevelCardInfo> = {
  elementary: { glyphs: ['＋', '－', '×', '÷'], stars: 1, tag: '初心者向け' },
  middle: { glyphs: ['x²', '√', '%'], stars: 2, tag: '標準' },
  kosen: { glyphs: ['∫', '∂', 'λ'], stars: 3, tag: '選択を迫られる' },
};

/** カードの絵: 黒板のように、そのレベルで出る記号を光らせて並べる。星の数が難しさ */
function levelArt(info: LevelCardInfo): string {
  const n = info.glyphs.length;
  const gap = 200 / n;
  const w = Math.min(50, gap - 8);
  const glyphs = info.glyphs.map((g, i) => {
    const cx = 20 + gap * (i + 0.5);
    return `<g><rect x="${cx - w / 2}" y="24" width="${w}" height="${w}" rx="6" fill="#0b1812" stroke="${ACCENT}" stroke-opacity=".55" stroke-width="1.6"/>`
      + `<text x="${cx}" y="${24 + w * 0.72}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="${g.length > 1 ? w * 0.52 : w * 0.68}" font-weight="700" fill="${ACCENT}" style="filter:drop-shadow(0 0 5px ${ACCENT})">${g}</text></g>`;
  }).join('');
  const star = (x: number, on: boolean): string =>
    `<path d="M${x} 84l3 7 7.5.6-5.7 5 1.8 7.4-6.6-4-6.6 4 1.8-7.4-5.7-5 7.5-.6z" fill="${on ? '#ffcc00' : 'none'}" stroke="${on ? '#ffcc00' : '#4b6a5c'}" stroke-width="1.4" stroke-linejoin="round"${on ? ' style="filter:drop-shadow(0 0 3px #ffcc00)"' : ''}/>`;
  return `<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg">`
    + `<g stroke="${ACCENT}" stroke-width="1.5" fill="none" opacity=".55"><path d="M6 14V6H14M234 14V6H226M6 106V114H14M234 106V114H226"/></g>`
    + `<path d="M14 106H226" stroke="${ACCENT}" stroke-opacity=".45" stroke-width="1.5"/>`
    + glyphs
    + [0, 1, 2].map((i) => star(100 + i * 20, i < info.stars)).join('')
    + `</svg>`;
}

export interface LevelSelectEvents {
  onSelect: (level: LevelId) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export class LevelSelectScreen {
  private readonly select: ModeSelect;

  /** container は使わない(表示は ModeSelect が持つ)。旧画面の枠は、常に隠したままにする */
  constructor(container: HTMLElement, private readonly events: LevelSelectEvents) {
    container.classList.add('hidden');
    this.select = new ModeSelect(
      { title: '難易度選択', accent: ACCENT, accentEnd: '#00b0ff', backLabel: 'タイトルへ', arcade: true, onFocus: (id) => this.setSelected(id as LevelId) },
      () => this.events.onConfirm(),
      () => this.events.onBack(),
    );
  }

  public setSelected(level: LevelId): void {
    this.events.onSelect(level);
  }

  public show(current: LevelId): void {
    const items: ModeItem[] = LEVEL_ORDER.map((id) => {
      const lv = LEVELS[id];
      const info = CARD_INFO[id];
      const reqs = lv.requirements.map((r) => r.value);
      return {
        id,
        art: levelArt(info),
        title: lv.label,
        sub: info.tag,
        desc: `${lv.description}のゲートが出ます。卒業要件は ${Math.min(...reqs) === Math.max(...reqs) ? `${reqs[0]}` : `${Math.min(...reqs)}〜${Math.max(...reqs)}`} 単位です。`,
      };
    });
    this.select.show(items, current);
  }

  public hide(): void {
    this.select.hide();
  }
}
