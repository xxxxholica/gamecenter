// 全ゲーム共通: リザルト画面の縦並びメニュー(再挑戦 / タイトルに戻る / ゲームを終了)の見た目。
// 選択中・ホバー中のボタンだけ色を付け、Aボタンのガイドを出す。それ以外はグレー。
// 画面サイズに合わせて縮むので、半分サイズのウィンドウでもはみ出さない。

import { buttonIconHtml } from './arcadeGuide';

let styleInjected = false;

function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .rm-col {
      display: flex !important;
      flex-direction: column !important;
      align-items: stretch !important;
      justify-content: center;
      flex-wrap: nowrap !important;
      gap: clamp(5px, 1.4vh, 12px) !important;
      width: min(84vw, 340px);
      max-width: 100%;
      margin-left: auto !important;
      margin-right: auto !important;
      box-sizing: border-box;
    }
    .rm-col > .rm-btn {
      display: flex; /* インラインの display:none(オンライン時に隠すボタン)を邪魔しない */
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100% !important;
      min-width: 0 !important;
      margin: 0 !important;
      box-sizing: border-box;
      padding: clamp(6px, 1.5vh, 13px) clamp(10px, 3vw, 22px) !important;
      font-size: clamp(13px, 2.6vh, 20px) !important;
      line-height: 1.2 !important;
      white-space: nowrap;
      cursor: pointer;
      background: #2b2f38 !important;
      color: #c3c9d6 !important; /* グレー背景に対して約8:1。選択中との差は色とガイドで付ける */
      border: 2px solid #6b7385 !important;
      text-shadow: none !important;
      -webkit-text-stroke: 0 !important;
      box-shadow: none !important;
      outline: none !important;
      transform: none !important;
      opacity: 1 !important;
      filter: none !important;
      animation: none !important;
      letter-spacing: 2px !important;
      border-radius: 0;
      font-family: inherit;
      transition: background 0.1s, color 0.1s, border-color 0.1s;
    }
    .rm-col > .rm-btn.rm-active,
    .rm-col > .rm-btn:hover {
      background: var(--rm-color, #ffe600) !important;
      color: #000 !important;
      border-color: #fff !important;
      box-shadow: 0 0 18px var(--rm-color, #ffe600) !important;
      font-weight: 900 !important;
    }
    .rm-col > .rm-btn:not(.rm-active) > .rm-icon {
      display: none !important;
    }
    /* 画面が低いときは余白を削って収める */
    @media (max-height: 520px) {
      .rm-col { gap: 4px !important; }
      .rm-col > .rm-btn { padding: 4px 10px !important; font-size: 13px !important; }
    }
  `;
  document.head.appendChild(style);
}

if (typeof document !== 'undefined' && document.head) {
  injectStyle();
}

export interface ResultMenuItem {
  button: HTMLElement | null;
  /** 選択中に付ける色 */
  color: string;
}

/** ボタンを縦並びメニューとして整える(コンテナに rm-col、各ボタンに rm-btn)。 */
export function setupResultMenu(container: HTMLElement | null, items: ResultMenuItem[]): void {
  injectStyle();
  container?.classList.add('rm-col');
  for (const { button, color } of items) {
    if (!button) continue;
    button.classList.add('rm-btn');
    button.style.setProperty('--rm-color', color);
    button.setAttribute('tabindex', '-1');
    if (!button.querySelector(':scope > .rm-icon')) {
      const span = document.createElement('span');
      span.className = 'rm-icon';
      span.innerHTML = buttonIconHtml([0]);
      button.insertBefore(span, button.firstChild);
    }
  }
}

/** 選択中のボタンだけに色とAボタンのガイドを出す。先に setupResultMenu でボタンを整えておくこと。 */
export function applyResultMenuFocus(items: ResultMenuItem[], focusIndex: number): void {
  items.forEach(({ button }, i) => {
    if (!button) return;
    const focused = i === focusIndex;
    button.classList.toggle('rm-active', focused);
    if (focused && !button.querySelector(':scope > .rm-icon')) {
      const span = document.createElement('span');
      span.className = 'rm-icon';
      span.innerHTML = buttonIconHtml([0]);
      button.insertBefore(span, button.firstChild);
    }
  });
}
