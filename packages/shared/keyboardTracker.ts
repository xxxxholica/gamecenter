// キーボード状態の共通トラッカー。
// 押下中 / 今フレームで押された / 今フレームで離されたキーの集合を保持する。
// ゲームごとの差分（既定動作を止めるキー、keydown/keyup/blur 時の追加処理）はオプションで渡す。

export interface KeyboardTrackerOptions {
  /** keydown 時に preventDefault するキー(KeyboardEvent.code)。スクロールやブラウザ既定動作の抑止用。 */
  preventDefaultKeys?: readonly string[];
  /** true なら pressed を記録する。記録した場合は毎フレーム endFrame() かクリアが必要。 */
  trackEdges?: boolean;
  /** true なら released を記録する（同上）。 */
  trackReleased?: boolean;
  /** keydown の最初に呼ばれる。 */
  onKeyDown?: (e: KeyboardEvent) => void;
  onKeyUp?: (e: KeyboardEvent) => void;
  /** blur で押下状態を捨てた後に呼ばれる。 */
  onBlur?: () => void;
}

/** スクロールを起こしやすい標準キー。 */
export const SCROLL_KEYS = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;

export class KeyboardTracker {
  /** 押下中のキー */
  readonly down = new Set<string>();
  /** 今フレームで新規に押されたキー（trackEdges 時のみ） */
  readonly pressed = new Set<string>();
  /** 今フレームで離されたキー（trackReleased 時のみ） */
  readonly released = new Set<string>();

  private readonly prevent: ReadonlySet<string>;
  private readonly handleKeyDown: (e: KeyboardEvent) => void;
  private readonly handleKeyUp: (e: KeyboardEvent) => void;
  private readonly handleBlur: () => void;

  constructor(opts: KeyboardTrackerOptions = {}) {
    this.prevent = new Set(opts.preventDefaultKeys ?? []);

    this.handleKeyDown = (e) => {
      opts.onKeyDown?.(e);
      if (opts.trackEdges && !this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
      if (this.prevent.has(e.code)) e.preventDefault();
    };
    this.handleKeyUp = (e) => {
      this.down.delete(e.code);
      if (opts.trackReleased) this.released.add(e.code);
      opts.onKeyUp?.(e);
    };
    // フォーカスが外れると keyup が届かず押しっぱなしになるので、押下状態を捨てる
    this.handleBlur = () => {
      this.down.clear();
      opts.onBlur?.();
    };

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** pressed / released を空にする（毎フレームの末尾で呼ぶ）。 */
  endFrame(): void {
    this.pressed.clear();
    this.released.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
  }
}
