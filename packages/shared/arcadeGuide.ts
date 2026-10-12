// 全ゲーム共通: 画面左下にアケコンのボタンガイドを常設表示する。
// 全ゲームで同じ位置・同じ見た目にする(ゲームごとにデザインや配置を変えない)。
// レバーのイラスト + 使用するボタンの番号・用途を1枚のカードにまとめる「まとめてガイド」と、
// 個別のプロンプト(タイトル画面の「スタート」表示など)の横に置く小さいボタンアイコンの
// 両方をこのモジュールから提供する。見た目はどのゲームのテーマにも馴染むよう、
// 暗い半透明パネル+白文字のニュートラルな配色にしている。

import { isMobileDevice } from './mobileBlock';
import { readGamepads } from './gamepadFrame';

export interface ArcadeGuideButton {
  // 実機で確認したGamepad APIのボタン番号。表示時はBUTTON_NAMESで名称に変換する。
  // 複数指定すると「いずれか」の意味(例: [1, 2, 7] = B/X/RTのどれでもよい)。
  indices: number[];
  label: string;
  // キーボード時のカスタム名称。省略時はindicesから自動推測
  keyLabel?: string;
}

// Windows + このアケコン(XInput, mapping=standard)で実機確認したボタン名称。
// バッジにはindex番号ではなくこの名称を表示する。
const BUTTON_NAMES: Record<number, string> = {
  0: 'A',
  1: 'B',
  2: 'X',
  3: 'Y',
  4: 'LB',
  5: 'RB',
  6: 'LT',
  7: 'RT',
  8: 'BACK',
  9: 'START',
  10: 'LSB',
  11: 'RSB',
  12: '↑',
  13: '↓',
  14: '←',
  15: '→',
  16: 'GUIDE',
};

function buttonName(index: number): string {
  return BUTTON_NAMES[index] ?? String(index);
}

export type InputMode = 'gamepad' | 'keyboard';

function keyboardKeyName(indices: number[], customLabel?: string): string {
  if (customLabel) return customLabel;
  if (indices.length === 0) return 'Enter';
  if (indices.length === 1) {
    const i = indices[0];
    if (i === 0) return 'Enter';
    if (i === 1) return 'Backspace';
    if (i === 2) return 'X';
    if (i === 3) return 'C';
    if (i === 8) return 'Backspace';
    if (i === 9) return 'Enter';
    return buttonName(i);
  }
  // スタート・決定など複数ボタンが割り当てられている場合の代表キー推測
  if (indices.length >= 4 && (indices.includes(0) || indices.includes(9))) return 'Enter / Space';
  if (indices.includes(0) && indices.includes(2)) return 'Enter / Space';
  if (indices.includes(1) && indices.includes(3)) return 'Backspace';
  if (indices.includes(9) || indices.includes(0)) return 'Enter';
  if (indices.includes(1) && indices.includes(2)) return 'X / C';
  return indices.map(buttonName).join('/');
}

export interface ArcadeGuideOptions {
  // レバー(十字キー/左スティック)の用途。省略すると行自体を出さない。
  moveLabel?: string;
  // キーボード時の移動案内 (省略時はmoveLabel)
  keyMoveLabel?: string;
  buttons?: ArcadeGuideButton[];
  // SELECT(キーボードは Backspace)の案内を出すか(ホーム画面自身では不要)。
  showHomeHint?: boolean;
  // その案内の文字。画面ごとの Backspace の役割に合わせる(タイトル=「ホームへ」、プレイ中=「ポーズ」、メニュー=「戻る」)。省略時は「戻る」。
  backLabel?: string;
  // 表示位置。省略すると左下。画面下に別のHUDを置くゲームだけ 'top-left' を指定する。
  position?: 'bottom-left' | 'top-left';
}

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* コントローラー/キーボードの表示切り替え */
    body[data-input-mode="keyboard"] .agc-pad-only {
      display: none !important;
    }
    body[data-input-mode="gamepad"] .agc-kbd-only {
      display: none !important;
    }
    body:not([data-input-mode="gamepad"]) .agc-pad-only {
      display: none !important;
    }
    /* アケコンのBボタンだけの行(キーボードでは、下の Backspace の行と同じキーになるので出さない) */
    body[data-input-mode="keyboard"] .agc-row-padonly,
    body:not([data-input-mode="gamepad"]) .agc-row-padonly {
      display: none !important;
    }

    /* スマホ・モバイル表示時はボタンガイドを非表示 */
    body.is-mobile-blocked .agc-root,
    body.is-game-mobile-blocked .agc-root,
    body.is-mobile-blocked .agc-inline,
    body.is-game-mobile-blocked .agc-inline {
      display: none !important;
    }
    @media (max-width: 840px), (hover: none) and (pointer: coarse) {
      .agc-root,
      .agc-inline {
        display: none !important;
      }
    }

    .agc-root.agc-top-left {
      bottom: auto;
      top: 14px;
    }
    .agc-root {
      position: fixed;
      bottom: 14px;
      left: 14px;
      z-index: 2147483000;
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 10px 14px;
      border-radius: 10px !important;
      background: rgba(8, 8, 14, 0.82);
      border: 1px solid rgba(255, 255, 255, 0.14);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif !important;
      color: #eee;
      pointer-events: none;
      -webkit-user-select: none;
      user-select: none;
    }
    .agc-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.74rem;
      line-height: 1.3;
      white-space: nowrap;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif !important;
    }
    .agc-icon { flex-shrink: 0; display: inline-flex; align-items: center; gap: 3px; }
    .agc-stick {
      width: 20px;
      height: 20px;
      display: block;
    }
    .agc-btn {
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px !important;
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.35);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.6rem;
      font-weight: 700;
      color: #fff;
      flex-shrink: 0;
      box-sizing: border-box;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif !important;
      letter-spacing: normal !important;
      text-shadow: none !important;
      -webkit-text-stroke: 0 !important;
    }
    /* キーボード用の角丸四角キートップスタイル (文字はみ出し防止 & 独立したキートップ形状) */
    .agc-btn.agc-key {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: auto !important;
      min-width: 19px !important;
      max-width: none !important;
      height: 19px !important;
      padding: 0 5px !important;
      border-radius: 4px !important;
      background: rgba(255, 255, 255, 0.18) !important;
      border: 1px solid rgba(255, 255, 255, 0.45) !important;
      border-bottom: 2px solid rgba(255, 255, 255, 0.75) !important;
      font-size: 0.65rem !important;
      font-weight: 700 !important;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace, sans-serif !important;
      line-height: 1 !important;
      letter-spacing: normal !important;
      box-sizing: border-box !important;
      white-space: nowrap !important;
      text-shadow: none !important;
      vertical-align: middle;
    }
    .agc-btn.agc-key.agc-key-medium {
      font-size: 0.61rem !important;
      padding: 0 5px !important;
    }
    .agc-btn.agc-key.agc-key-long {
      font-size: 0.55rem !important;
      padding: 0 4px !important;
    }

    /* キーボード用キー区切り文字 (/) */
    .agc-key-sep {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 0.65rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.55);
      margin: 0 2px;
      user-select: none;
      vertical-align: middle;
    }

    /* ボタン内・プロンプト脇のインラインアイコン: 背景が黄・緑・シアンなど明るくても暗くても読めるよう、
       暗い塗り+白文字+白縁にする(ガイドパネル内の半透明バッジとは別) */
    .agc-inline .agc-btn {
      min-width: 24px;
      height: 24px;
      padding: 0 7px;
      border-radius: 12px !important;
      background: #10131a;
      border: 2px solid #fff;
      color: #fff;
      font-size: 0.8rem;
      font-weight: 900;
      line-height: 1;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55);
    }
    .agc-inline .agc-btn.agc-key {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: auto !important;
      min-width: 22px !important;
      max-width: none !important;
      height: 22px !important;
      padding: 0 6px !important;
      border-radius: 4px !important;
      background: #10131a !important;
      border: 1.5px solid #ffffff !important;
      border-bottom: 2.5px solid #cbd5e1 !important;
      color: #ffffff !important;
      font-size: 0.7rem !important;
      font-weight: 800 !important;
      line-height: 1 !important;
      letter-spacing: normal !important;
      box-sizing: border-box !important;
      white-space: nowrap !important;
      box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.55) !important;
      vertical-align: middle;
    }
    .agc-inline .agc-btn.agc-key.agc-key-medium {
      font-size: 0.65rem !important;
      padding: 0 5px !important;
    }
    .agc-inline .agc-btn.agc-key.agc-key-long {
      font-size: 0.58rem !important;
      padding: 0 4px !important;
    }
    .agc-inline .agc-key-sep {
      color: rgba(255, 255, 255, 0.75);
      font-size: 0.75rem;
      margin: 0 2px;
    }
    .agc-label {
      color: #ddd;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif !important;
      letter-spacing: normal !important;
      text-shadow: none !important;
      -webkit-text-stroke: 0 !important;
    }
    .agc-home .agc-label { color: #aaa; }
    /* プロンプト脇に置く単体アイコン(現在押すべきボタンを示す) */
    .agc-inline {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      vertical-align: middle;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif !important;
    }
  `;
  document.head.appendChild(style);
}

let trackerInitialized = false;
let currentInputMode: InputMode = 'keyboard';
const modeListeners = new Set<(mode: InputMode) => void>();

function setMode(mode: InputMode): void {
  const changed = currentInputMode !== mode;
  currentInputMode = mode;
  if (typeof document !== 'undefined' && document.body) {
    if (document.body.dataset.inputMode !== mode) {
      document.body.dataset.inputMode = mode;
    }
  }
  if (changed) {
    for (const listener of modeListeners) {
      try {
        listener(mode);
      } catch (err) {
        console.error('Error in input mode listener:', err);
      }
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gamecenter:inputmode', { detail: { mode } }));
    }
  }
}

/**
 * 現在の入力モード（'gamepad' | 'keyboard'）を取得する
 */
export function getInputMode(): InputMode {
  initInputModeTracker();
  return currentInputMode;
}

/**
 * 入力モードの切り替えを購読する。
 * 登録解除関数を返す。登録時に即座に現在のモードで1回実行される。
 */
export function onInputModeChange(listener: (mode: InputMode) => void): () => void {
  initInputModeTracker();
  modeListeners.add(listener);
  try {
    listener(currentInputMode);
  } catch (err) {
    console.error('Error in initial input mode listener call:', err);
  }
  return () => {
    modeListeners.delete(listener);
  };
}

/**
 * ユーザーの直近の入力（キーボード vs コントローラー）を自動検出し、
 * body の data-input-mode 属性およびリスナーを更新する
 */
export function initInputModeTracker(): void {
  if (trackerInitialized || typeof window === 'undefined') return;
  trackerInitialized = true;

  // 初期値の判定 (接続済みゲームパッドがあるか)
  const pads = readGamepads();
  const hasConnectedPad = Array.from(pads).some((p) => p && p.connected);
  setMode(hasConnectedPad ? 'gamepad' : 'keyboard');

  // キーボード入力時
  window.addEventListener(
    'keydown',
    () => {
      setMode('keyboard');
    },
    { passive: true },
  );

  // マウス移動時 (PC操作とみなす)
  window.addEventListener(
    'mousemove',
    (e) => {
      if (e.movementX !== 0 || e.movementY !== 0) {
        setMode('keyboard');
      }
    },
    { passive: true },
  );

  // ゲームパッド操作の検知 (ポーリング)
  let lastCheck = 0;
  const checkGamepad = (now: number) => {
    if (now - lastCheck > 60) {
      lastCheck = now;
      const currentPads = readGamepads();
      for (const pad of currentPads) {
        if (!pad || !pad.connected) continue;
        const btn = pad.buttons.some((b) => b && b.pressed);
        const axis = pad.axes.some((a) => Math.abs(a) > 0.35);
        if (btn || axis) {
          setMode('gamepad');
          break;
        }
      }
    }
    requestAnimationFrame(checkGamepad);
  };
  requestAnimationFrame(checkGamepad);
}

const STICK_SVG = `
  <svg class="agc-stick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="12" cy="12" r="9" stroke-opacity="0.5" />
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke-opacity="0.85" stroke-linecap="round" />
  </svg>
`;

/**
 * キーボード用のキートップHTMLを生成する。
 * スラッシュ区切り（例: "Enter / Space" や "Shift / X"）がある場合は、
 * 各キーを独立したキートップバッジにし、区切り文字をキートップの外に置く。
 */
export function renderKeyboardKeysHtml(keyString: string, _isInline: boolean = false): string {
  const parts = keyString.split(/\s*\/\s*/);
  const badges = parts.map((part) => {
    const trimmed = part.trim();
    if (!trimmed) return '';
    const lenClass = trimmed.length >= 6 ? ' agc-key-long' : (trimmed.length >= 4 ? ' agc-key-medium' : '');
    return `<span class="agc-btn agc-key${lenClass}">${trimmed}</span>`;
  });
  return badges.filter(Boolean).join('<span class="agc-key-sep">/</span>');
}

function buttonBadge(b: ArcadeGuideButton): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'agc-row';

  // パッド用バッジ
  const padHtml = b.indices.length > 0
    ? b.indices.map((i) => `<span class="agc-btn">${buttonName(i)}</span>`).join('')
    : '<span class="agc-btn"></span>';

  // キーボード用バッジ (キーごとに独立したキートップ)
  const kbdKey = keyboardKeyName(b.indices, b.keyLabel);
  const kbdHtml = renderKeyboardKeysHtml(kbdKey, false);

  row.innerHTML = `
    <span class="agc-icon agc-pad-only">${padHtml}</span>
    <span class="agc-icon agc-kbd-only">${kbdHtml}</span>
    <span class="agc-label">${b.label}</span>
  `;
  return row;
}

/**
 * 画面右下に常設のガイドカードを表示する。ホーム画面・各ゲームのタイトル/プレイ中で呼ぶ。
 * 呼び出しは1画面につき1回。すでにカードがあれば入れ替える(ゲームのシーン遷移で再度呼んでも重複しない)。
 */
export function mountArcadeGuide(options: ArcadeGuideOptions): HTMLDivElement {
  if (typeof location !== 'undefined' && location.search.includes('noHud')) {
    return document.createElement('div');
  }
  if (isMobileDevice()) {
    return document.createElement('div');
  }
  injectStyle();
  initInputModeTracker();
  document.getElementById('agc-guide')?.remove();

  const root = document.createElement('div');
  root.id = 'agc-guide';
  root.className = 'agc-root';
  if (options.position === 'top-left') root.classList.add('agc-top-left');

  if (options.moveLabel) {
    const row = document.createElement('div');
    row.className = 'agc-row';
    const keyMoveText = options.keyMoveLabel ?? options.moveLabel;
    row.innerHTML = `
      <span class="agc-icon agc-pad-only">${STICK_SVG}</span>
      <span class="agc-icon agc-kbd-only">${renderKeyboardKeysHtml('WASD / 矢印', false)}</span>
      <span class="agc-label agc-pad-only">${options.moveLabel}</span>
      <span class="agc-label agc-kbd-only">${keyMoveText}</span>
    `;
    root.appendChild(row);
  }

  for (const b of options.buttons ?? []) {
    const row = buttonBadge(b);
    // 下に Backspace の行(showHomeHint)がある時、同じ Backspace になるボタンの行は、キーボードでは出さない(2つ並んで見えるのを避ける)
    if (options.showHomeHint && keyboardKeyName(b.indices, b.keyLabel).includes('Backspace')) row.classList.add('agc-row-padonly');
    root.appendChild(row);
  }

  if (options.showHomeHint) {
    const row = document.createElement('div');
    row.className = 'agc-row agc-home';
    row.innerHTML = `
      <span class="agc-icon agc-pad-only"><span class="agc-btn">BACK</span></span>
      <span class="agc-label agc-pad-only">${options.backLabel ?? '戻る'}</span>
      <span class="agc-icon agc-kbd-only">${renderKeyboardKeysHtml('Backspace', false)}</span>
      <span class="agc-label agc-kbd-only">${options.backLabel ?? '戻る'}</span>
    `;
    root.appendChild(row);
  }

  document.body.appendChild(root);
  return root;
}

/**
 * タイトル画面の「スタート」表示など、特定のプロンプトの隣に置く小さいボタンアイコン。
 * 返り値のHTML文字列をテキストの前後に差し込んで使う。
 * 入力デバイスに応じてコントローラー表示とキーボード表示が自動で切り替わる。
 */
export function buttonIconHtml(indices: number[], keyLabel?: string): string {
  injectStyle();
  initInputModeTracker();
  const padBadges = indices.map((i) => `<span class="agc-btn">${buttonName(i)}</span>`).join('');
  const kbdText = keyboardKeyName(indices, keyLabel);
  const kbdBadges = renderKeyboardKeysHtml(kbdText, true);
  return `
    <span class="agc-inline agc-pad-only">${padBadges}</span>
    <span class="agc-inline agc-kbd-only">${kbdBadges}</span>
  `;
}
