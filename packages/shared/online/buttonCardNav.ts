// オンライン待機画面などの「ボタンが並んだカード」を、アケコン・キーボードで操作する共通部品。
//   レバー/矢印/WASD: ボタンを選ぶ / A・Enter・Space・Z: 決定 / B・Esc・Backspace: 戻る
import { PadEdge, startPadLoop } from '../arcadePad';

/** props 付きで要素を作る小さな DOM ヘルパー。 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const { cls, ...rest } = props;
  const e = Object.assign(document.createElement(tag), rest);
  if (cls) e.className = cls;
  for (const c of children) e.append(c);
  return e;
}

export interface ButtonCardNavOptions {
  /** 操作対象のボタンを含むカード。 */
  getCard: () => HTMLElement | null;
  /** false の間は入力を無視する(非表示中・他の画面が操作を受け持つ間)。 */
  isActive: () => boolean;
  /** B・Esc・Backspace。 */
  onBack: () => void;
}

export class ButtonCardNav {
  private readonly padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private focus = 0;

  constructor(private readonly opts: ButtonCardNavOptions) {}

  /** 選択を先頭のボタンに戻す。 */
  public resetFocus(): void {
    this.focus = 0;
  }

  private buttons(): HTMLButtonElement[] {
    const card = this.opts.getCard();
    const b = card ? [...card.querySelectorAll<HTMLButtonElement>('button')] : [];
    // Tab ではなく本部品の操作で選ぶ(マウスで押したあとのフォーカス残りも避ける)
    b.forEach((x) => { x.tabIndex = -1; });
    return b;
  }

  /** 現在の選択をボタンの見た目に反映する(カードを作り直したら呼ぶ)。 */
  public apply(): void {
    const b = this.buttons();
    if (b.length === 0) return;
    this.focus = Math.min(Math.max(0, this.focus), b.length - 1);
    b.forEach((x, i) => x.classList.toggle('pad-focus', i === this.focus));
  }

  public start(): void {
    this.focus = 0;
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.opts.isActive()) return;
      const b = this.buttons();
      if (b.length === 0) return;
      if (p.left || p.up) { this.focus = (this.focus - 1 + b.length) % b.length; this.apply(); }
      else if (p.right || p.down) { this.focus = (this.focus + 1) % b.length; this.apply(); }
      else if (p.any(0)) b[this.focus]?.click();
      else if (p.any(1)) this.opts.onBack();
    });
    // キーボード: ←→↑↓・WASD でボタンを選ぶ / Enter・Space・Z で決定 / Esc・Backspace で戻る
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.opts.isActive()) return;
      const b = this.buttons();
      const move = (d: number) => {
        e.preventDefault();
        if (b.length === 0) return;
        this.focus = (this.focus + d + b.length) % b.length;
        this.apply();
      };
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') move(-1);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') move(1);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        // フォーカス中のボタンが標準動作でも反応して二重に押されないように
        (document.activeElement as HTMLElement | null)?.blur();
        b[this.focus]?.click();
      } else if (e.code === 'Backspace') {
        e.preventDefault();
        this.opts.onBack();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  public stop(): void {
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }
}
