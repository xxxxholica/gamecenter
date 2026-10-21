import { PadEdge, startPadLoop } from '../arcadePad';
import { buttonIconHtml } from '../arcadeGuide';
import { reportDeepAnalytics, reportPhase } from '../arcadeAnalytics';

export interface ModeItem {
  id: string;
  title: string;
  sub?: string;
  desc?: string;
  /** 説明を、行ごとにアイコンを付けて出す(desc の代わり)。icon はインラインSVGのHTML(呼び出し側が持つ固定の文字列だけを渡すこと) */
  points?: { icon: string; text: string }[];
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
  /** 表示先。省略すると画面全体(body)。ゲーム領域の中に出したい時に指定する(position は呼び出し側のCSSで調整する) */
  parent?: HTMLElement;
  /** arcade 版の見た目(左上に大きな見出し、斜めの角ばったカードとボタン)にする */
  arcade?: boolean;
  /** 戻る / 決定ボタンに、押すボタン・キーのガイドアイコンを付ける(結果・ポーズ画面と同じ) */
  buttonGuide?: boolean;
  /** 選択中の項目が変わった時(表示した時・矢印・クリック・項目の差し替えで位置が変わった時)に、その項目の id で呼ぶ */
  onFocus?: (id: string) => void;
}

// midnight-skyway のモード選択/コース選択と同じ見た目: 斜めの見出し帯、斜めのカード(選択中はアクセント色の枠と光)、斜めの 戻る/決定 ボタン。
const css = `
.msel { --msel-accent: #00f0ff; --msel-accent-end: color-mix(in srgb, var(--msel-accent) 65%, #0080ff); position: fixed; inset: 0; z-index: 9990; display: none; flex-direction: column; justify-content: space-between; align-items: center; box-sizing: border-box;
  font-size: clamp(9px, min(1.15vw, 2.1vh), 18px); padding: 1.8em 2.6em; color: #fff; user-select: none; pointer-events: none;
  font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
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
.msel-card .d .msel-pt { display: flex; align-items: center; gap: .4em; }
.msel-card .d .msel-pt span { word-break: keep-all; overflow-wrap: anywhere; }   /* 語の途中では折らない(折ってよい位置は、文にゼロ幅スペースを入れて示す) */
.msel-card .d .msel-pt svg { flex: none; width: 1.1em; height: 1.1em; color: var(--msel-accent); overflow: visible; }
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
/* arcade 版(arcade: true): 左上の見出し・斜めの角ばったカードとボタン。寸法は --u(画面の高さ/幅に比例。cyber-2d-fighter-3d の 0.8 倍)で決まり、親が --u を決めていればそれに従う */
.msel.msel-arcade { --u: min(0.074vh, 0.0625vw); padding: calc(40 * var(--u)) calc(48 * var(--u)); justify-content: space-between; align-items: stretch; gap: calc(30 * var(--u));
  font-size: calc(16 * var(--u)); font-family: inherit; background: none; animation: none; }
.msel.msel-arcade::before { content: ''; position: absolute; inset: 0; z-index: -1; animation: mselBgIn 0.7s ease-out both;
  background: linear-gradient(to bottom, #080b16d0 0%, #080b1600 24%, #080b1600 46%, #080b16dd 64%, #080b16f5 100%), radial-gradient(ellipse at 50% 42%, color-mix(in srgb, var(--msel-accent) 13%, transparent), transparent 64%); }
@keyframes mselBgIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes mselLabelIn { from { opacity: 0; transform: translateX(calc(-60 * var(--u))) skewX(-12deg); } to { opacity: 1; transform: none; } }
@keyframes mselCardsIn { from { opacity: 0; transform: translateX(calc(140 * var(--u))); } to { opacity: 1; transform: none; } }
@keyframes mselBarIn { from { opacity: 0; transform: translateY(calc(30 * var(--u))); } to { opacity: 1; transform: none; } }
.msel.msel-arcade .msel-title { align-self: flex-start; margin: 0; transform: none; animation: mselLabelIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) 0.08s both; }
.msel.msel-arcade .msel-title::before { content: 'GAME MODE'; display: block; color: #bbb9d6; font-size: max(11px, calc(19 * var(--u))); letter-spacing: 0.36em; }
.msel.msel-arcade .msel-title-main { font: 900 max(24px, calc(76 * var(--u)))/1 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif; letter-spacing: -0.03em;
  padding: calc(10 * var(--u)) 0 0; border: 0; background: none; box-shadow: none; text-shadow: none; color: #fff; }
.msel.msel-arcade .msel-title-main::after { content: ''; display: block; width: calc(130 * var(--u)); height: calc(7 * var(--u)); margin-top: calc(16 * var(--u)); background: var(--msel-accent); transform: skewX(-20deg); }
.msel.msel-arcade .msel-cards { flex-wrap: nowrap; gap: calc(22 * var(--u)); width: min(calc(1500 * var(--u)), 100%); align-self: center; margin: auto 0 0; justify-content: center;
  animation: mselCardsIn 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) 0.16s both; }
.msel.msel-arcade .msel-card { flex: 0 1 calc((1500 * var(--u) - 44 * var(--u)) / 3); width: auto; max-width: none; min-height: calc(480 * var(--u)); padding: calc(22 * var(--u)) calc(22 * var(--u)) calc(24 * var(--u));
  border: 3px solid #334466; border-radius: 0; background: linear-gradient(150deg, #222335, #10101a); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  transform: skewX(-3deg); transition: transform 0.15s, border-color 0.15s; }
.msel.msel-arcade .msel-card:hover { background: linear-gradient(150deg, #222335, #10101a); border-color: #ffcc00; transform: skewX(-3deg) translateY(-6px); box-shadow: 0 16px 36px rgba(0, 0, 0, 0.9), 0 0 20px rgba(255, 204, 0, 0.5); }
.msel.msel-arcade .msel-card.active { background: linear-gradient(150deg, color-mix(in srgb, var(--msel-accent) 16%, #12131c), color-mix(in srgb, var(--msel-accent) 7%, #0a0a10)); border-color: var(--msel-accent); transform: skewX(-3deg) translateY(-6px);
  box-shadow: 0 0 28px color-mix(in srgb, var(--msel-accent) 55%, transparent); }
.msel.msel-arcade .msel-card.disabled:hover { transform: skewX(-3deg); border-color: #334466; box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6); }
.msel.msel-arcade .msel-card .badge { font-weight: 900; font-size: max(11px, calc(22 * var(--u))); letter-spacing: 0.08em; color: #67687f; text-shadow: none; }
.msel.msel-arcade .msel-card.active .badge { color: var(--msel-accent); }
.msel.msel-arcade .msel-card .art { height: calc(150 * var(--u)); margin: calc(8 * var(--u)) 0 calc(14 * var(--u)); background: radial-gradient(circle, #ffffff12, transparent); border: 0; border-radius: 0; }
/* カードの文字は全ゲームで同じ大きさ(midnight-skyway のモード選択に合わせた。タイトル 36・サブ 24・特徴の行 25。単位は --u)。色は --msel-accent だけがゲームごとに変わる */
.msel.msel-arcade .msel-card .t { font: 900 max(15px, calc(36 * var(--u)))/1.15 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif; letter-spacing: -0.02em; margin: calc(4 * var(--u)) 0; color: #fff; }
.msel.msel-arcade .msel-card .s { font-size: max(11px, calc(24 * var(--u))); font-weight: 800; letter-spacing: 0.06em; line-height: 1.4; color: var(--msel-accent); min-height: 1.3em; margin-bottom: calc(12 * var(--u)); }
.msel.msel-arcade .msel-card .d { display: flex; flex-direction: column; gap: calc(14 * var(--u)); margin: calc(22 * var(--u)) 0 0; font-size: max(11px, calc(25 * var(--u))); font-weight: 900; font-style: italic;
  letter-spacing: 0.02em; line-height: 1.35; color: #fff; text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9), 0 0 12px rgba(255, 255, 255, 0.35); }
.msel.msel-arcade .msel-bar { align-self: center; justify-content: space-between; width: clamp(60%, calc(100% - 440px), calc(1500 * var(--u))); gap: calc(18 * var(--u)); max-width: none;
  animation: mselBarIn 0.5s ease-out 0.35s both; }
.msel.msel-arcade .msel-bar button { width: auto; min-width: calc(340 * var(--u)); height: auto; padding: calc(20 * var(--u)) calc(52 * var(--u));
  font: 900 max(14px, calc(24 * var(--u))) 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif; letter-spacing: 0.04em; transform: none; border-radius: 0; }
.msel.msel-arcade .msel-go { color: #111; background: var(--msel-accent); box-shadow: 6px 6px color-mix(in srgb, var(--msel-accent) 42%, #000); animation: none; border: 0; }
.msel.msel-arcade .msel-go:hover { transform: scale(1.04); }
.msel.msel-arcade .msel-back { color: #fff; background: #292738; border: 1px solid #69647c; box-shadow: 6px 6px #12101c; }
.msel.msel-arcade .msel-back:hover { background: #34324a; color: #fff; border-color: #8a85a3; }
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
 * A/D・レバー左右で選び、Enter/A/START で決定、Backspace/B で戻る。disabled の項目は選べない(グレーアウト)。
 */
export class ModeSelect {
  private readonly root: HTMLElement;
  private readonly cardsEl: HTMLElement;
  private readonly onSelect: (id: string) => void;
  private readonly onBack: () => void;
  private readonly screen: string;
  private readonly onFocus?: (id: string) => void;
  private focusedId: string | null = null;
  private items: ModeItem[] = [];
  private index = 0;
  private visible = false;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;


  constructor(opts: ModeSelectOptions, onSelect: (id: string) => void, onBack: () => void) {
    // アナリティクス: どの選択画面で、何を選んだか・戻ったか
    const screen = opts.title ?? 'mode';
    this.screen = screen;
    this.onSelect = (id) => { reportDeepAnalytics('menu_select', { screen, id }); onSelect(id); };
    this.onBack = () => { reportDeepAnalytics('menu_back', { screen }); onBack(); };
    this.onFocus = opts.onFocus;
    ensureModeSelectStyle();
    this.root = document.createElement('div');
    this.root.className = 'msel';
    applyModeSelectAccent(this.root, opts);
    if (opts.arcade) this.root.classList.add('msel-arcade');
    const setLabel = (btn: HTMLElement, text: string, indices: number[], key: string) => {
      if (!opts.buttonGuide) { btn.textContent = text; return; }
      btn.innerHTML = `<span class="msel-guide">${buttonIconHtml(indices, key)}</span>`;
      btn.append(Object.assign(document.createElement('span'), { textContent: text }));
    };
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
    setLabel(back, opts.backLabel ?? 'タイトルへ', [1], 'Backspace');
    back.onclick = () => this.onBack();
    const go = document.createElement('button');
    go.className = 'msel-go';
    setLabel(go, '決定', [0], 'Enter');
    go.onclick = () => this.confirm();
    bar.append(back, go);
    this.root.append(titleBar, this.cardsEl, bar);
    (opts.parent ?? document.body).append(this.root);
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
        const d = Object.assign(document.createElement('div'), { className: 'd', textContent: it.points ? '' : it.desc ?? '' });
        for (const pt of it.points ?? []) {
          const row = Object.assign(document.createElement('div'), { className: 'msel-pt', innerHTML: pt.icon });   // 呼び出し側の固定のSVG
          row.append(Object.assign(document.createElement('span'), { textContent: pt.text }));
          d.append(row);
        }
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
    const id = this.items[this.index]?.id ?? null;
    if (id && id !== this.focusedId) this.onFocus?.(id);
    this.focusedId = id;
  }

  public isVisible(): boolean {
    return this.visible;
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

  /** initialId: 最初に選んでおく項目(省略すると、選べる先頭の項目) */
  public show(items: ModeItem[], initialId?: string): void {
    reportPhase('menu', { screen: this.screen });
    this.items = items;
    const first = Math.max(0, items.findIndex((i) => !i.disabled));
    const wanted = initialId === undefined ? -1 : items.findIndex((i) => i.id === initialId && !i.disabled);
    this.index = wanted >= 0 ? wanted : first;
    this.focusedId = null;
    this.render();
    this.visible = true;
    const armAt = performance.now() + 150;
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
        if (!this.visible || performance.now() < armAt) return;
        if (e.code === 'KeyA' || e.code === 'KeyW') { e.preventDefault(); e.stopImmediatePropagation(); this.step(-1); }
        else if (e.code === 'KeyD' || e.code === 'KeyS') { e.preventDefault(); e.stopImmediatePropagation(); this.step(1); }
        else if (e.code === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); this.confirm(); }
        else if (e.code === 'Backspace' && !e.repeat) { e.preventDefault(); e.stopImmediatePropagation(); this.onBack(); }
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  /** 表示中に項目だけ差し替える(選んでいる位置は、同じ項目が選べる限り保つ)。開催状況の確認が終わってから反映する時などに使う。 */
  public update(items: ModeItem[]): void {
    if (!this.visible) return;
    const keep = this.items[this.index]?.id;
    this.items = items;
    const same = items.findIndex((i) => i.id === keep && !i.disabled);
    this.index = same >= 0 ? same : Math.max(0, items.findIndex((i) => !i.disabled));
    this.render();
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
