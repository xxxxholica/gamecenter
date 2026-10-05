// 留年・卒業画面のメニュー: 「再挑戦」「タイトルに戻る」「ゲームを終了」をアケコン/キーボードで選んで決定する。
// アケコン: 移動はスティック、確定はAボタン。
// キーボード: 移動はWASD/矢印キー、確定はEnter/Space。

import { PadEdge, startPadLoop } from '../../../shared/arcadePad.ts';
import { MenuNav } from '../../../shared/arcadeMenuNav.ts';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu.ts';

/** 再挑戦 / タイトルに戻る / ゲームを終了 の選択色 */
const FOCUS_COLORS = ['#ffea00', '#39ff88', '#00f0ff'];

/** 結果表示の直前まで連打していたボタンが、そのまま決定にならないよう、開いてしばらくは入力を無視する */
const ARM_DELAY_MS = 600;

export class ResultMenu {
  private buttons: HTMLElement[] = [];
  private focus = 0;
  private openedAt = 0;
  private isLocked = false;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private keyUpHandler: ((e: KeyboardEvent) => void) | null = null;
  /** 移動に使い済みのキー(離すまで連続入力では動かさない) */
  private navUsed = new Set<string>();
  private blockClickHandler: ((e: MouseEvent) => void) | null = null;

  public setLocked(locked: boolean): void {
    this.isLocked = locked;
    if (!locked) {
      this.openedAt = performance.now();
    }
  }

  public open(buttons: HTMLElement[]): void {
    this.close();
    this.buttons = buttons;
    this.openedAt = performance.now();
    this.isLocked = false;
    setupResultMenu(buttons[0]?.parentElement ?? null, this.menuItems());
    this.setFocus(0);

    // ネイティブのボタンフォーカスによる誤作動を排除
    (document.activeElement as HTMLElement)?.blur?.();
    this.buttons.forEach((btn, idx) => {
      btn.setAttribute('tabindex', '-1');
      btn.addEventListener('focus', () => btn.blur());
      btn.addEventListener('mouseenter', () => this.setFocus(idx));
    });

    // 画面表示直後の誤爆クリックをブロック
    this.blockClickHandler = (e: MouseEvent) => {
      // 名前登録モーダル上のクリックは止めない(止めるとマウスで登録できない)
      if ((e.target as Element | null)?.closest?.('.ane-overlay')) return;
      if (this.isLocked || performance.now() - this.openedAt < ARM_DELAY_MS) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    window.addEventListener('click', this.blockClickHandler, true);

    // アケコン操作: 移動はスティック、確定はAボタン(button 0)、戻るはBボタン(button 1)
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (this.isLocked) return;
      if (p.up || p.left) this.setFocus(this.focus - 1);
      else if (p.down || p.right) this.setFocus(this.focus + 1);
      else if (performance.now() - this.openedAt < ARM_DELAY_MS) return;
      else if (p.any(0)) this.buttons[this.focus]?.click();
      else if (p.any(1)) this.handleCancel();
    });

    // キーボード操作: 移動はWASD/矢印、確定はEnter/Space、戻るはEscape/Backspace
    // 移動は受付待ちの間も効かせる。確定・戻るだけ誤爆防止で待たせ、押し直しが必要。
    this.navUsed.clear();
    this.keyHandler = (e: KeyboardEvent) => {
      if (this.isLocked) return;
      const armed = performance.now() - this.openedAt >= ARM_DELAY_MS;
      const dir = MenuNav.keyDir(e.code);
      if (dir !== 0) {
        // 押した瞬間は受付待ちでも動かす。押しっぱなしで開いた場合は、受付開始後の最初の repeat で1回だけ動かす
        if (e.repeat && (!armed || this.navUsed.has(e.code))) return;
        this.navUsed.add(e.code);
        this.setFocus(this.focus + dir);
        return;
      }
      if (e.repeat || !armed) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        this.buttons[this.focus]?.click();
      } else if (e.code === 'Backspace' || e.code === 'Escape') {
        e.preventDefault();
        this.handleCancel();
      }
    };
    this.keyUpHandler = (e: KeyboardEvent) => this.navUsed.delete(e.code);
    window.addEventListener('keydown', this.keyHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('blur', this.clearNavUsed);
  }

  private clearNavUsed = (): void => {
    this.navUsed.clear();
  };

  private handleCancel(): void {
    const exitBtn = this.buttons[this.buttons.length - 1];
    exitBtn?.click();
  }

  public close(): void {
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    if (this.keyUpHandler) {
      window.removeEventListener('keyup', this.keyUpHandler);
      this.keyUpHandler = null;
    }
    window.removeEventListener('blur', this.clearNavUsed);
    if (this.blockClickHandler) {
      window.removeEventListener('click', this.blockClickHandler, true);
      this.blockClickHandler = null;
    }
    this.buttons.forEach((b) => b.classList.remove('pad-focus'));
    this.buttons = [];
  }

  private setFocus(index: number): void {
    if (this.buttons.length === 0) return;
    this.focus = (index + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, i) => b.classList.toggle('pad-focus', i === this.focus));
    applyResultMenuFocus(this.menuItems(), this.focus);
  }

  private menuItems(): ResultMenuItem[] {
    return this.buttons.map((button, i) => ({ button, color: FOCUS_COLORS[i] ?? FOCUS_COLORS[0] }));
  }
}
