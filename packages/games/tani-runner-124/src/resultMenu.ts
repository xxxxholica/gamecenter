// ============================================================
// 留年・卒業画面のメニュー: 「再挑戦」「レベル選択」をアケコン/キーボードで選んで決定する。
// レバーでフォーカス移動 / A・STARTで決定 / Bでレベル選択。
// ============================================================

import { PadEdge, startPadLoop } from '../../../shared/arcadePad.ts';

/** 結果表示の直前まで連打していたボタンが、そのまま決定にならないよう、開いてしばらくは入力を無視する */
const ARM_DELAY_MS = 700;

export class ResultMenu {
  private buttons: HTMLElement[] = [];
  private focus = 0;
  private openedAt = 0;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** buttons[0] は再挑戦、buttons[1] はレベル選択 */
  public open(buttons: HTMLElement[]): void {
    this.close();
    this.buttons = buttons;
    this.openedAt = performance.now();
    this.setFocus(0);

    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (performance.now() - this.openedAt < ARM_DELAY_MS) return;
      if (p.up || p.left) this.setFocus(this.focus - 1);
      else if (p.down || p.right) this.setFocus(this.focus + 1);
      else if (p.any(0, 9)) this.buttons[this.focus]?.click();
      else if (p.any(1)) this.buttons[1]?.click();
    });

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.repeat || performance.now() - this.openedAt < ARM_DELAY_MS) return;
      if (e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'KeyW' || e.code === 'KeyA') {
        this.setFocus(this.focus - 1);
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowRight' || e.code === 'KeyS' || e.code === 'KeyD') {
        this.setFocus(this.focus + 1);
      } else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        this.buttons[this.focus]?.click();
      } else if (e.code === 'Backspace') {
        this.buttons[1]?.click();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  public close(): void {
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
    this.buttons.forEach((b) => b.classList.remove('pad-focus'));
    this.buttons = [];
  }

  private setFocus(index: number): void {
    if (this.buttons.length === 0) return;
    this.focus = (index + this.buttons.length) % this.buttons.length;
    this.buttons.forEach((b, i) => b.classList.toggle('pad-focus', i === this.focus));
  }
}
