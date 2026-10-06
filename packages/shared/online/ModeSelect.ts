import { PadEdge, startPadLoop } from '../arcadePad';

export interface ModeItem {
  id: string;
  title: string;
  sub?: string;
  desc?: string;
  /** カード上部の小さな見出し(例: OFFLINE / ONLINE) */
  badge?: string;
  /** カードの絵(インラインSVGのHTML。呼び出し側が持つ固定の文字列だけを渡すこと) */
  art?: string;
  /** 押せない(グレーアウト。満員など) */
  disabled?: boolean;
}

export interface ModeSelectOptions {
  title?: string;
  /** 強調色(選択中の枠・光・決定ボタン)。既定は midnight-skyway と同じシアン */
  accent?: string;
  /** 決定ボタンのグラデーション終点色 */
  accentEnd?: string;
  backLabel?: string;
}

// midnight-skyway のモード選択/コース選択と同じ見た目: 斜めの見出し帯、斜めのカード(選択中はアクセント色の枠と光)、斜めの 戻る/決定 ボタン。
const css = `
.msel { --msel-accent: #00f0ff; --msel-accent-end: color-mix(in srgb, var(--msel-accent) 65%, #0080ff); position: fixed; inset: 0; z-index: 9990; display: none; flex-direction: column; justify-content: space-between; align-items: center; box-sizing: border-box;
  font-size: clamp(9px, min(1.15vw, 2.1vh), 18px); padding: 1.8em 2.6em; color: #fff; user-select: none; pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, 'Hiragino Kaku Gothic ProN', 'Yu Gothic Bold', 'Segoe UI', Roboto, sans-serif;
  background: transparent; animation: mselFade .2s ease-out; }   /* 背景(屋台)を暗くしない: midnight-skyway の時間帯選択と同じ */
@keyframes mselFade { from { opacity: 0; transform: scale(.99); } to { opacity: 1; transform: scale(1); } }
.msel-title, .msel-cards, .msel-bar { pointer-events: auto; }
.msel-title { margin-top: 6px; transform: skewX(-12deg); }
.msel-title-main { font-size: 1.7em; font-weight: 900; letter-spacing: 4px; padding: .3em 1.6em; color: #fff; border-left: 6px solid var(--msel-accent);
  background: linear-gradient(90deg, color-mix(in srgb, var(--msel-accent) 30%, transparent) 0%, color-mix(in srgb, var(--msel-accent) 5%, transparent) 100%);
  text-shadow: 0 0 15px color-mix(in srgb, var(--msel-accent) 60%, transparent); box-shadow: 0 0 20px color-mix(in srgb, var(--msel-accent) 15%, transparent); }
.msel-cards { display: flex; gap: 1.4em; width: 100%; justify-content: center; margin: auto 0 1.2em 0; }
.msel-card { flex: 0 1 24em; width: 24em; max-width: 24em; min-height: 24em; min-width: 0; box-sizing: border-box; display: flex; flex-direction: column; padding: 1.1em 1.4em 1.3em;
  background: rgba(14, 18, 26, 0.92); border: 2px solid #2d3848; border-radius: 4px; cursor: pointer; transform: skewX(-6deg); transition: all .2s ease-out; }
.msel-card:hover { background: rgba(22, 28, 40, 0.96); border-color: #556c8c; transform: skewX(-6deg) translateY(-4px); }
.msel-card.active { background: rgba(24, 26, 34, 0.98); border-color: var(--msel-accent); box-shadow: 0 0 30px color-mix(in srgb, var(--msel-accent) 45%, transparent); transform: skewX(-6deg) translateY(-6px); }
.msel-card .badge { font-size: .85em; font-weight: 900; letter-spacing: 2px; color: #ff0055; text-shadow: 0 0 8px rgba(255, 0, 85, 0.6); }
.msel-card .art { height: 9em; display: flex; justify-content: center; align-items: center; margin: .3em 0 .6em; background: rgba(0, 0, 0, 0.35); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 3px; }
.msel-card .art svg { height: 82%; width: auto; }
.msel-card.active .art { border-color: color-mix(in srgb, var(--msel-accent) 45%, transparent); }
.msel-card .t { font-size: 1.7em; font-weight: 900; margin: 4px 0 2px; }
.msel-card .s { font-size: .95em; font-weight: 800; color: #ffcc00; margin-bottom: .5em; min-height: 1.3em; }
.msel-card .d { font-size: 1em; line-height: 1.7; color: #d8e2f0; margin-top: .4em; }
.msel-card.disabled { opacity: .38; filter: grayscale(1); cursor: not-allowed; }
.msel-card.disabled:hover { transform: skewX(-6deg); box-shadow: none; }
.msel-bar { display: flex; gap: 24px; width: 100%; max-width: 82em; justify-content: space-between; align-items: center; }
.msel-bar button { box-sizing: border-box; width: 13em; height: 3.4em; font: inherit; font-size: 1.3em; font-weight: 900; letter-spacing: 2px; display: flex; align-items: center; justify-content: center; white-space: nowrap;
  transform: skewX(-10deg); cursor: pointer; border-radius: 2px; transition: all .15s; }
.msel-back { background: rgba(25, 34, 48, 0.9); color: #a0aec0; border: 1px solid #4a5b73; }
.msel-back:hover { background: rgba(45, 56, 76, 1); color: #fff; border-color: #7b8eab; }
.msel-go { color: #05070c; border: none; background: linear-gradient(135deg, var(--msel-accent) 0%, var(--msel-accent-end) 100%); box-shadow: 0 0 30px color-mix(in srgb, var(--msel-accent) 60%, transparent); animation: mselPulse 1.4s infinite alternate; }
.msel-go:hover { transform: skewX(-10deg) scale(1.04); }
@keyframes mselPulse { from { filter: brightness(1); } to { filter: brightness(1.2); } }
`;

/** モード選択・希望選択で共通のアクセント色(CSS 変数)を root に設定する。 */
export function applyModeSelectAccent(root: HTMLElement, opts: ModeSelectOptions): void {
  if (opts.accent) {
    root.style.setProperty('--msel-accent', opts.accent);
    const end = opts.accentEnd ?? `color-mix(in srgb, ${opts.accent} 70%, #ff8c00)`;
    root.style.setProperty('--msel-accent-end', end);
  } else if (opts.accentEnd) {
    root.style.setProperty('--msel-accent-end', opts.accentEnd);
  }
}

/** モード選択・希望選択(WishSelect)で共通の見た目を、1回だけ追加する。 */
export function ensureModeSelectStyle(): void {
  if (document.getElementById('msel-style')) return;
  const st = document.createElement('style');
  st.id = 'msel-style';
  st.textContent = css;
  document.head.append(st);
}

/**
 * 遊び方の選択(オフライン / オンライン対戦 など)。ゲーム共通。
 * ←→・A/D・レバー左右で選び、Enter/Space/A/START で決定、Esc/B で戻る。disabled の項目は選べない(グレーアウト)。
 */
export class ModeSelect {
  private readonly root: HTMLElement;
  private readonly cardsEl: HTMLElement;
  private readonly onSelect: (id: string) => void;
  private readonly onBack: () => void;
  private items: ModeItem[] = [];
  private index = 0;
  private visible = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;

  constructor(opts: ModeSelectOptions, onSelect: (id: string) => void, onBack: () => void) {
    this.onSelect = onSelect;
    this.onBack = onBack;
    ensureModeSelectStyle();
    this.root = document.createElement('div');
    this.root.className = 'msel';
    applyModeSelectAccent(this.root, opts);
    const titleBar = document.createElement('div');
    titleBar.className = 'msel-title';
    const titleMain = document.createElement('div');
    titleMain.className = 'msel-title-main';
    titleMain.textContent = opts.title ?? 'モード選択';
    titleBar.append(titleMain);
    this.cardsEl = document.createElement('div');
    this.cardsEl.className = 'msel-cards';
    const bar = document.createElement('div');
    bar.className = 'msel-bar';
    const back = document.createElement('button');
    back.className = 'msel-back';
    back.textContent = opts.backLabel ?? 'タイトルへ';
    back.onclick = () => this.onBack();
    const go = document.createElement('button');
    go.className = 'msel-go';
    go.textContent = '決定';
    go.onclick = () => this.confirm();
    bar.append(back, go);
    this.root.append(titleBar, this.cardsEl, bar);
    document.body.append(this.root);
  }

  private confirm(): void {
    const it = this.items[this.index];
    if (it && !it.disabled) this.onSelect(it.id);
  }

  private render(): void {
    this.cardsEl.replaceChildren(
      ...this.items.map((it, i) => {
        const c = document.createElement('div');
        c.className = 'msel-card' + (i === this.index ? ' active' : '') + (it.disabled ? ' disabled' : '');
        const badge = Object.assign(document.createElement('div'), { className: 'badge', textContent: it.badge ?? '' });
        const art = document.createElement('div');
        art.className = 'art';
        if (it.art) art.innerHTML = it.art;                      // 呼び出し側の固定のSVG(ユーザー入力は入れない)
        const t = Object.assign(document.createElement('div'), { className: 't', textContent: it.title });
        const s = Object.assign(document.createElement('div'), { className: 's', textContent: it.sub ?? '' });
        const d = Object.assign(document.createElement('div'), { className: 'd', textContent: it.desc ?? '' });
        c.append(badge, art, t, s, d);
        c.onclick = () => {
          if (it.disabled) return;
          this.index = i;
          this.render();
        };
        c.ondblclick = () => this.confirm();
        return c;
      }),
    );
  }

  private step(dir: number): void {
    // 選べない項目は飛ばす
    for (let k = 1; k <= this.items.length; k++) {
      const i = (this.index + dir * k + this.items.length * 2) % this.items.length;
      if (!this.items[i].disabled) {
        this.index = i;
        break;
      }
    }
    this.render();
  }

  public show(items: ModeItem[]): void {
    this.items = items;
    this.index = Math.max(0, items.findIndex((i) => !i.disabled));
    this.render();
    this.visible = true;
    this.root.style.display = 'flex';
    this.stopPad?.();
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.visible) return;
      if (p.left || p.up) this.step(-1);
      else if (p.right || p.down) this.step(1);
      else if (p.any(0)) this.confirm();
      else if (p.any(1)) this.onBack();
    });
    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.visible) return;
        if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') { e.preventDefault(); this.step(-1); }
        else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') { e.preventDefault(); this.step(1); }
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') { e.preventDefault(); this.confirm(); }
        else if (e.code === 'Escape' || e.code === 'Backspace') { e.preventDefault(); this.onBack(); }
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  public hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }
}
