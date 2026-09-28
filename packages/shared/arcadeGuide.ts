// 全ゲーム共通: 画面左下にアケコンのボタンガイドを常設表示する。
// 全ゲームで同じ位置・同じ見た目にする(ゲームごとにデザインや配置を変えない)。
// レバーのイラスト + 使用するボタンの番号・用途を1枚のカードにまとめる「まとめてガイド」と、
// 個別のプロンプト(タイトル画面の「スタート」表示など)の横に置く小さいボタンアイコンの
// 両方をこのモジュールから提供する。見た目はどのゲームのテーマにも馴染むよう、
// 暗い半透明パネル+白文字のニュートラルな配色にしている。

export interface ArcadeGuideButton {
  // 実機で確認したGamepad APIのボタン番号。表示時はBUTTON_NAMESで名称に変換する。
  // 複数指定すると「いずれか」の意味(例: [1, 2, 7] = B/X/RTのどれでもよい)。
  indices: number[];
  label: string;
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

export interface ArcadeGuideOptions {
  // レバー(十字キー/左スティック)の用途。省略すると行自体を出さない。
  moveLabel?: string;
  buttons?: ArcadeGuideButton[];
  // SELECT長押しでホームへ戻る案内を出すか(ホーム画面自身では不要)。
  showHomeHint?: boolean;
}

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
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
    .agc-icon { flex-shrink: 0; display: flex; align-items: center; gap: 3px; }
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

const STICK_SVG = `
  <svg class="agc-stick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
    <circle cx="12" cy="12" r="9" stroke-opacity="0.5" />
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" stroke-opacity="0.85" stroke-linecap="round" />
  </svg>
`;

function buttonBadge(indices: number[], label: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'agc-row';
  const icon = document.createElement('span');
  icon.className = 'agc-icon';
  // 空配列は「どのボタンでもよい」の意味。名称なしの丸だけ出す(ハブの決定ボタンなど)
  icon.innerHTML = indices.length > 0
    ? indices.map((i) => `<span class="agc-btn">${buttonName(i)}</span>`).join('')
    : '<span class="agc-btn"></span>';
  const text = document.createElement('span');
  text.className = 'agc-label';
  text.textContent = label;
  row.append(icon, text);
  return row;
}

/**
 * 画面右下に常設のガイドカードを表示する。ホーム画面・各ゲームのタイトル/プレイ中で呼ぶ。
 * 呼び出しは1画面につき1回。すでにカードがあれば入れ替える(ゲームのシーン遷移で再度呼んでも重複しない)。
 */
export function mountArcadeGuide(options: ArcadeGuideOptions): HTMLDivElement {
  injectStyle();
  document.getElementById('agc-guide')?.remove();

  const root = document.createElement('div');
  root.id = 'agc-guide';
  root.className = 'agc-root';

  if (options.moveLabel) {
    const row = document.createElement('div');
    row.className = 'agc-row';
    const icon = document.createElement('span');
    icon.className = 'agc-icon';
    icon.innerHTML = STICK_SVG;
    const text = document.createElement('span');
    text.className = 'agc-label';
    text.textContent = options.moveLabel;
    row.append(icon, text);
    root.appendChild(row);
  }

  for (const b of options.buttons ?? []) {
    root.appendChild(buttonBadge(b.indices, b.label));
  }

  if (options.showHomeHint) {
    const row = buttonBadge([8], '長押しでホームへ');
    row.classList.add('agc-home');
    root.appendChild(row);
  }

  document.body.appendChild(root);
  return root;
}

/**
 * タイトル画面の「スタート」表示など、特定のプロンプトの隣に置く小さいボタンアイコン。
 * 返り値のHTML文字列をテキストの前後に差し込んで使う。
 */
export function buttonIconHtml(indices: number[]): string {
  injectStyle();
  return `<span class="agc-inline">${indices.map((i) => `<span class="agc-btn">${buttonName(i)}</span>`).join('')}</span>`;
}
