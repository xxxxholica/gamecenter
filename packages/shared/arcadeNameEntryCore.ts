// アーケード用 カタカナ5文字ネームエントリー バーチャルキーボード・入力エンジン
// アケコンのレバー（2次元グリッド移動）＋ボタン操作、キーボード、マウス/タッチに完全対応

import { readPad } from './arcadePad';

export const MAX_NAME_LENGTH = 5;

// キーボードグリッド構造: 10列 × 7行
// 行0〜4: カタカナ五十音＋記号・空白 (10列)
// 行5: 機能キー (4キー: 濁点, 半濁点, 小文字, 一字削除)
// 行6: フッターの登録ボタン (1つ)。最初のカーソルはここ(何も入力しなければ匿名で登録される)
export const ACTION_ROW = 5;
export const FOOTER_ROW = 6;
export const KEYBOARD_GRID: string[][] = [
  ['ア', 'カ', 'サ', 'タ', 'ナ', 'ハ', 'マ', 'ヤ', 'ラ', 'ワ'],
  ['イ', 'キ', 'シ', 'チ', 'ニ', 'ヒ', 'ミ', '・', 'リ', 'ヲ'],
  ['ウ', 'ク', 'ス', 'ツ', 'ヌ', 'フ', 'ム', 'ユ', 'ル', 'ン'],
  ['エ', 'ケ', 'セ', 'テ', 'ネ', 'ヘ', 'メ', '！', 'レ', 'ー'],
  ['オ', 'コ', 'ソ', 'ト', 'ノ', 'ホ', 'モ', 'ヨ', 'ロ', '　'],
];

export interface ActionKeyDef {
  id: 'dakuten' | 'handakuten' | 'small' | 'backspace';
  label: string;
  subLabel: string;
}

export const ACTION_KEYS: ActionKeyDef[] = [
  { id: 'dakuten', label: '゛', subLabel: '濁点' },
  { id: 'handakuten', label: '゜', subLabel: '半濁点' },
  { id: 'small', label: '小', subLabel: '小文字' },
  { id: 'backspace', label: '⌫', subLabel: '１字消去' },
];

/** 行ごとの列数 */
const ROW_COLS = [10, 10, 10, 10, 10, ACTION_KEYS.length, 1];

// 濁点変換マップ (相互トグル)
const DAKUTEN_MAP: Record<string, string> = {
  'カ': 'ガ', 'ガ': 'カ',
  'キ': 'ギ', 'ギ': 'キ',
  'ク': 'グ', 'グ': 'ク',
  'ケ': 'ゲ', 'ゲ': 'ケ',
  'コ': 'ゴ', 'ゴ': 'コ',
  'サ': 'ザ', 'ザ': 'サ',
  'シ': 'ジ', 'ジ': 'シ',
  'ス': 'ズ', 'ズ': 'ス',
  'セ': 'ゼ', 'ゼ': 'セ',
  'ソ': 'ゾ', 'ゾ': 'ソ',
  'タ': 'ダ', 'ダ': 'タ',
  'チ': 'ヂ', 'ヂ': 'チ',
  'ツ': 'ヅ', 'ヅ': 'ツ',
  'テ': 'デ', 'デ': 'テ',
  'ト': 'ド', 'ド': 'ト',
  'ハ': 'バ', 'バ': 'ハ',
  'ヒ': 'ビ', 'ビ': 'ヒ',
  'フ': 'ブ', 'ブ': 'フ',
  'ヘ': 'ベ', 'ベ': 'ヘ',
  'ホ': 'ボ', 'ボ': 'ホ',
  'ウ': 'ヴ', 'ヴ': 'ウ',
};

// 半濁点変換マップ (相互トグル)
const HANDAKUTEN_MAP: Record<string, string> = {
  'ハ': 'パ', 'パ': 'ハ',
  'ヒ': 'ピ', 'ピ': 'ヒ',
  'フ': 'プ', 'プ': 'フ',
  'ヘ': 'ペ', 'ペ': 'ヘ',
  'ホ': 'ポ', 'ポ': 'ホ',
};

// 小文字変換マップ (相互トグル)
const SMALL_MAP: Record<string, string> = {
  'ア': 'ァ', 'ァ': 'ア',
  'イ': 'ィ', 'ィ': 'イ',
  'ウ': 'ゥ', 'ゥ': 'ウ',
  'エ': 'ェ', 'ェ': 'エ',
  'オ': 'ォ', 'ォ': 'オ',
  'ツ': 'ッ', 'ッ': 'ツ',
  'ヤ': 'ャ', 'ャ': 'ヤ',
  'ユ': 'ュ', 'ュ': 'ユ',
  'ヨ': 'ョ', 'ョ': 'ヨ',
  'ワ': 'ヮ', 'ヮ': 'ワ',
};

export interface NameEntryState {
  name: string;             // 現在入力された名前 (最大5文字)
  cursorRow: number;        // キーボード行 0〜6
  cursorCol: number;        // キーボード列 (行0〜4は0〜9, 行5は0〜3, 行6は0)
  timeRemaining: number;    // 残り時間 (秒)
  isConfirmed: boolean;
  maxLen: number;
}

export interface NameEntryCallbacks {
  onChange: (state: NameEntryState) => void;
  onConfirm: (name: string) => void;
}

export interface NameEntryOptions {
  initialName?: string;
  /** 放置の時間切れ(秒)。何も操作しないまま過ぎたら、入力済みの名前(なければ匿名)で確定する。操作のたびに数え直す */
  timeLimitSec?: number;
  /** 開いた直後の、キーボード・パッドの決定操作を受け付けない時間(ms)。直前まで連打していた操作で、文字が入る・キャンセルされるのを防ぐ */
  armDelayMs?: number;
}

export class ArcadeNameEntryCore {
  public state: NameEntryState;
  private callbacks: NameEntryCallbacks;
  private timerId: number | null = null;
  private rafId: number | null = null;
  private isDestroyed = false;
  private armedAt = 0;
  private timeLimitSec = 60;

  // アケコン・レバー入力リピート制御
  private holdDirection: 'up' | 'down' | 'left' | 'right' | null = null;
  private nextRepeatTime = 0;
  private prevButtonStates: boolean[] = [];

  constructor(callbacks: NameEntryCallbacks, options: NameEntryOptions = {}) {
    this.callbacks = callbacks;
    this.armedAt = performance.now() + (options.armDelayMs ?? 0);
    this.timeLimitSec = options.timeLimitSec ?? 60;

    // 初期ネーム
    const initName = (options.initialName ?? '').trim().slice(0, MAX_NAME_LENGTH);

    this.state = {
      name: initName,
      cursorRow: FOOTER_ROW,
      cursorCol: 0,
      timeRemaining: options.timeLimitSec ?? 60,
      isConfirmed: false,
      maxLen: MAX_NAME_LENGTH,
    };

    this.setupKeyboardListeners();
    this.startPadLoop();
    this.startCountdown();

    this.callbacks.onChange(this.state);
  }

  /** 入力された名前。空のまま確定したときは空文字(呼び出し側が、予約した匿名名に置き換える) */
  public getFormattedName(): string {
    return this.state.name.trim();
  }

  public confirm(): void {
    if (this.state.isConfirmed || this.isDestroyed) return;
    this.state.isConfirmed = true;
    const finalName = this.getFormattedName();
    this.destroy();
    this.callbacks.onConfirm(finalName);
  }

  // 1文字追加
  public appendChar(char: string): void {
    if (this.state.name.length >= MAX_NAME_LENGTH) return;
    this.state.name += char;
    // 5文字入力完了時は自動で「決定」ボタンへカーソルを案内
    if (this.state.name.length >= MAX_NAME_LENGTH) {
      this.state.cursorRow = FOOTER_ROW;
      this.state.cursorCol = 0;
    }
    this.callbacks.onChange(this.state);
  }

  // 末尾1文字削除
  public backspace(): void {
    this.touch();
    if (this.state.name.length > 0) {
      this.state.name = this.state.name.slice(0, -1);
      this.callbacks.onChange(this.state);
    }
  }

  // 濁点トグル
  public toggleDakuten(): void {
    if (this.state.name.length === 0) return;
    const lastChar = this.state.name.slice(-1);
    const converted = DAKUTEN_MAP[lastChar];
    if (converted) {
      this.state.name = this.state.name.slice(0, -1) + converted;
      this.callbacks.onChange(this.state);
    }
  }

  // 半濁点トグル
  public toggleHandakuten(): void {
    if (this.state.name.length === 0) return;
    const lastChar = this.state.name.slice(-1);
    const converted = HANDAKUTEN_MAP[lastChar];
    if (converted) {
      this.state.name = this.state.name.slice(0, -1) + converted;
      this.callbacks.onChange(this.state);
    }
  }

  // 小文字トグル
  public toggleSmall(): void {
    if (this.state.name.length === 0) return;
    const lastChar = this.state.name.slice(-1);
    const converted = SMALL_MAP[lastChar];
    if (converted) {
      this.state.name = this.state.name.slice(0, -1) + converted;
      this.callbacks.onChange(this.state);
    }
  }

  // 指定キーの実行（クリックや決定ボタン押下時）
  public triggerKey(row: number, col: number): void {
    if (this.state.isConfirmed || this.isDestroyed) return;
    this.touch();

    if (row < 5) {
      const char = KEYBOARD_GRID[row]?.[col];
      if (char) {
        this.appendChar(char);
      }
    } else if (row === FOOTER_ROW) {
      this.confirm();
    } else if (row === ACTION_ROW) {
      const action = ACTION_KEYS[col];
      if (!action) return;
      switch (action.id) {
        case 'dakuten':
          this.toggleDakuten();
          break;
        case 'handakuten':
          this.toggleHandakuten();
          break;
        case 'small':
          this.toggleSmall();
          break;
        case 'backspace':
          this.backspace();
          break;
      }
    }
  }

  // 現在カーソル位置のキーを実行
  public triggerCurrent(): void {
    this.triggerKey(this.state.cursorRow, this.state.cursorCol);
  }

  // レバー・方向キーによる移動（ラップアラウンド対応）。行ごとに列数が違うので、行をまたぐときは位置が近い列へ寄せる
  public moveCursor(dir: 'up' | 'down' | 'left' | 'right'): void {
    this.touch();
    let { cursorRow, cursorCol } = this.state;
    const rows = ROW_COLS.length;

    if (dir === 'up' || dir === 'down') {
      const nextRow = (cursorRow + (dir === 'up' ? -1 : 1) + rows) % rows;
      // 現在位置の中心(0〜1)を、移動先の列数に当てはめる
      const center = (cursorCol + 0.5) / ROW_COLS[cursorRow];
      cursorCol = Math.min(ROW_COLS[nextRow] - 1, Math.floor(center * ROW_COLS[nextRow]));
      cursorRow = nextRow;
    } else if (dir === 'left') {
      cursorCol = (cursorCol - 1 + ROW_COLS[cursorRow]) % ROW_COLS[cursorRow];
    } else {
      cursorCol = (cursorCol + 1) % ROW_COLS[cursorRow];
    }

    if (cursorRow !== this.state.cursorRow || cursorCol !== this.state.cursorCol) {
      this.state.cursorRow = cursorRow;
      this.state.cursorCol = cursorCol;
      this.callbacks.onChange(this.state);
    }
  }

  public setCursor(row: number, col: number): void {
    this.touch();
    if (this.state.cursorRow !== row || this.state.cursorCol !== col) {
      this.state.cursorRow = row;
      this.state.cursorCol = col;
      this.callbacks.onChange(this.state);
    }
  }

  private startCountdown(): void {
    this.timerId = window.setInterval(() => {
      if (this.isDestroyed || this.state.isConfirmed) return;
      this.state.timeRemaining = Math.max(0, this.state.timeRemaining - 1);
      this.callbacks.onChange(this.state);
      if (this.state.timeRemaining <= 0) {
        this.confirm();
      }
    }, 1000);
  }

  /** 操作があったら、放置の時間切れを数え直す */
  private touch(): void {
    this.state.timeRemaining = this.timeLimitSec;
  }

  private isArmed(): boolean {
    return performance.now() >= this.armedAt;
  }

  private handleKeyDown = (e: KeyboardEvent) => {
    if (this.isDestroyed || this.state.isConfirmed) return;

    if (e.code === 'KeyW') {
      e.preventDefault();
      this.moveCursor('up');
    } else if (e.code === 'KeyS') {
      e.preventDefault();
      this.moveCursor('down');
    } else if (e.code === 'KeyA') {
      e.preventDefault();
      this.moveCursor('left');
    } else if (e.code === 'KeyD') {
      e.preventDefault();
      this.moveCursor('right');
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!this.isArmed()) return;
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Enter: 即確定
        this.confirm();
      } else {
        this.triggerCurrent();
      }
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      this.backspace();
    }
  };

  private setupKeyboardListeners(): void {
    window.addEventListener('keydown', this.handleKeyDown);
  }

  private startPadLoop(): void {
    const loop = (now: number) => {
      if (this.isDestroyed || this.state.isConfirmed) return;

      const pad = readPad();

      // 方向入力
      let activeDir: 'up' | 'down' | 'left' | 'right' | null = null;
      if (pad.up) activeDir = 'up';
      else if (pad.down) activeDir = 'down';
      else if (pad.left) activeDir = 'left';
      else if (pad.right) activeDir = 'right';

      // ボタンエッジ検出
      // ボタン0 (A) または ボタン2 (X) または ボタン3 (Y): 現在キー実行
      // ボタン1 (B): 1文字削除ショートカット
      // ボタン9 (START): 即確定ショートカット
      const btn0 = !!pad.buttons[0];
      const btn1 = !!pad.buttons[1];
      const btn2 = !!pad.buttons[2];
      const btn3 = !!pad.buttons[3];
      const btn9 = !!pad.buttons[9];

      const prev0 = !!this.prevButtonStates[0];
      const prev1 = !!this.prevButtonStates[1];
      const prev2 = !!this.prevButtonStates[2];
      const prev3 = !!this.prevButtonStates[3];
      const prev9 = !!this.prevButtonStates[9];

      // A / X / Y ボタン押下（エッジ）
      if (((btn0 && !prev0) || (btn2 && !prev2) || (btn3 && !prev3)) && this.isArmed()) {
        this.triggerCurrent();
      }

      // B ボタン押下（エッジ）: 1文字消去
      if (btn1 && !prev1) {
        this.backspace();
      }

      // START ボタン押下（エッジ）: 決定
      if (btn9 && !prev9 && this.isArmed()) {
        this.confirm();
      }

      this.prevButtonStates = [...pad.buttons];

      // レバー方向の処理（チョン倒し ＋ 長倒しオートリピート）
      if (activeDir !== this.holdDirection) {
        this.holdDirection = activeDir;
        if (activeDir) {
          this.moveCursor(activeDir);
          // 初回リピートまでの待ち時間: 240ms
          this.nextRepeatTime = now + 240;
        }
      } else if (activeDir) {
        if (now >= this.nextRepeatTime) {
          this.moveCursor(activeDir);
          // リピート間隔: 110ms
          this.nextRepeatTime = now + 110;
        }
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    window.removeEventListener('keydown', this.handleKeyDown);
  }
}
