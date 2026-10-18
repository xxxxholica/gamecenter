// 全ゲーム共通: プレイ中に Backspace(アケコンは SELECT)で開くポーズ画面(再開 / やり直す / ゲームを終了)。
// 開いている間は、ゲーム側が isOpen を見て進行を止める。結果画面のメニューと同じ見た目・操作。
//   W S / レバー: 選ぶ    Enter / A: 決定    Backspace / B: 再開

import { PadEdge, startPadLoop } from './arcadePad';
import { applyResultMenuFocus, setupResultMenu, type ResultMenuItem } from './arcadeResultMenu';
import { returnToHub } from './homeReturn';
import { getArcadeGuideOptions, mountArcadeGuide, type ArcadeGuideOptions } from './arcadeGuide';
import { reportDeepAnalytics } from './arcadeAnalytics';

export interface ArcadePauseOptions {
  /** 見出しの下線と、「再開」の選択色 */
  accent: string;
  /** いまプレイ中か(これが true の間だけ Backspace でポーズを開く) */
  isPlaying: () => boolean;
  /** ポーズを開いた / 閉じた(再開・やり直し・終了のいずれでも閉じる)時。進行の停止・再開に使う */
  onOpen?: () => void;
  onClose?: () => void;
  /** やり直す。省略すると、ボタンは出すが選べない(グレーアウト。オンライン対戦など、やり直せない時) */
  onRestart?: () => void;
  /** ゲームを終了。省略するとホーム(ハブ)へ戻る */
  onExit?: () => void;
  /** 終了ボタンの文字。オンライン対戦では「退出」にする */
  exitLabel?: string;
  /** 見出し。既定は「ポーズ」 */
  title?: string;
}

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const st = document.createElement('style');
  st.textContent = `
    .ap-root { position: fixed; inset: 0; z-index: 2147482500; display: none; align-items: center; justify-content: center; flex-direction: column; gap: clamp(14px, 3vh, 26px);
      background: rgba(5, 7, 18, 0.78); color: #fff; font-family: Arial, 'Hiragino Kaku Gothic ProN', 'Yu Gothic', system-ui, sans-serif; user-select: none; }
    .ap-root.ap-open { display: flex; }
    .ap-root .rm-col > .rm-btn.ap-disabled, .ap-root .rm-col > .rm-btn.ap-disabled:hover { opacity: 0.35 !important; cursor: not-allowed; background: #2b2f38 !important; color: #c3c9d6 !important; border-color: #6b7385 !important; box-shadow: none !important; }
    .ap-title { font: 900 clamp(28px, 7vh, 60px)/1 Arial, 'Hiragino Kaku Gothic ProN', sans-serif; letter-spacing: 0.08em; }
    .ap-title::after { content: ''; display: block; width: 90px; height: 6px; margin: 12px auto 0; background: var(--ap-accent, #ffe600); transform: skewX(-20deg); }
  `;
  document.head.appendChild(st);
}

export class ArcadePause {
  private readonly root: HTMLDivElement;
  private readonly items: ResultMenuItem[] = [];
  private readonly actions: (() => void)[] = [];
  private readonly enabled: boolean[] = [];
  private open_ = false;
  private focus = 0;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  // ポーズを開く前のボタンガイド。閉じる時に戻す
  private prevGuide: ArcadeGuideOptions | null = null;

  constructor(private readonly opts: ArcadePauseOptions) {
    injectStyle();
    this.root = document.createElement('div');
    this.root.className = 'ap-root';
    this.root.style.setProperty('--ap-accent', opts.accent);
    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = opts.title ?? 'ポーズ';
    const menu = document.createElement('div');
    this.root.append(title, menu);
    document.body.append(this.root);

    const add = (label: string, color: string, run: (() => void) | null) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (run) button.addEventListener('click', (e) => { e.stopPropagation(); if (this.open_) run(); });
      else { button.classList.add('ap-disabled'); button.setAttribute('aria-disabled', 'true'); }
      menu.append(button);
      this.items.push({ button, color });
      this.actions.push(run ?? (() => {}));
      this.enabled.push(!!run);
    };
    add('再開', opts.accent, () => this.close());
    add('やり直す', '#7bdff2', opts.onRestart ? () => { this.close('restart'); opts.onRestart!(); } : null);
    add(opts.exitLabel ?? 'ゲームを終了', '#ff8fa3', () => { this.close('exit'); (opts.onExit ?? returnToHub)(); });
    setupResultMenu(menu, this.items);

    // 捕まえる側(capture)で受け、開いている間は、押す操作(keydown)だけをゲーム側に渡さない。
    // 離す操作(keyup)は渡す: 止めてしまうと、ポーズ中にキーを離した時、ゲームは「押したまま」と思い込んで、再開後に勝手に動き続ける
    window.addEventListener('keydown', (e) => this.onKey(e), true);
  }

  get isOpen(): boolean { return this.open_; }

  private onKey(e: KeyboardEvent): void {
    if (this.open_) {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (e.repeat) return;
      if (e.code === 'Backspace') this.close();
      else if (e.code === 'KeyW') this.move(-1);
      else if (e.code === 'KeyS') this.move(1);
      else if (e.code === 'Enter') this.actions[this.focus]();
      return;
    }
    if (e.code === 'Backspace' && !e.repeat && this.opts.isPlaying() && !isTyping(e)) {
      e.stopImmediatePropagation();
      e.preventDefault();
      this.show();
    }
  }

  private move(dir: number): void {
    // 選べない項目(グレーアウト)は飛ばす
    for (let k = 0; k < this.items.length; k++) {
      this.focus = (this.focus + dir + this.items.length) % this.items.length;
      if (this.enabled[this.focus]) break;
    }
    applyResultMenuFocus(this.items, this.focus);
  }

  /** ポーズを開く(ゲーム側から開きたい時にも使える) */
  show(): void {
    if (this.open_) return;
    this.open_ = true;
    this.focus = 0;
    applyResultMenuFocus(this.items, 0);
    this.root.classList.add('ap-open');
    // ボタンガイドをポーズ用(選ぶ / 決定 / 再開)に切り替える。位置は元のガイドに合わせる
    this.prevGuide = getArcadeGuideOptions();
    mountArcadeGuide({
      moveLabel: '選択',
      buttons: [{ indices: [0], label: '決定' }],
      showHomeHint: true,
      backLabel: '再開',
      position: this.prevGuide?.position,
    });
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (p.up) this.move(-1);
      else if (p.down) this.move(1);
      else if (p.any(0)) this.actions[this.focus]();
      else if (p.any(1)) this.close();
    });
    reportDeepAnalytics('pause', { action: 'open' });
    this.opts.onOpen?.();
  }

  /** ポーズを閉じる(再開)。action はアナリティクス用: どのボタンで閉じたか */
  close(action: 'resume' | 'restart' | 'exit' = 'resume'): void {
    if (!this.open_) return;
    reportDeepAnalytics('pause', { action });
    this.open_ = false;
    this.root.classList.remove('ap-open');
    this.stopPad?.();
    this.stopPad = null;
    if (this.prevGuide) mountArcadeGuide(this.prevGuide);
    this.prevGuide = null;
    this.opts.onClose?.();
  }
}

/** 文字を入力中の欄(名前入力など)では、Backspace を文字の削除に使うので、ポーズにしない */
function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

