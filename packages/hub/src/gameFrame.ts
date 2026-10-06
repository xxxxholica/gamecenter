// 全画面のままゲームを遊ぶための、ハブの中のiframe表示。
// 別ページへ移動すると全画面が解除されるので、ゲームをハブ自身のiframeで開き、ハブのページを入れ替えずに保つ。
// ゲーム側の「ホームへ戻る」は ../../ への移動のままで、iframeの中にハブが読み込まれたら
// ハブ自身が親へ閉じるよう伝える(initFramedHub)。ゲームのコードは変えなくてよい。

import { FULLSCREEN_TOGGLE_MESSAGE, toggleFullscreen } from '../../shared/fullscreenKey';

const CLOSE_MESSAGE = 'gamecenter:close-game';

/** このページがゲームのiframeの中に読み込まれたハブか。 */
export const isFramedHub = window.self !== window.top;

/** iframeの中のハブは何も表示せず、親へゲームを閉じるよう伝える。 */
export function initFramedHub(): void {
  document.documentElement.style.visibility = 'hidden';
  window.parent.postMessage({ type: CLOSE_MESSAGE }, window.location.origin);
}

let frame: HTMLIFrameElement | null = null;
let onClosed: (() => void) | null = null;

export function isGameFrameOpen(): boolean {
  return frame !== null;
}

/** 全画面中ならtrue。このときだけiframeで開く(通常は従来どおりページ移動)。 */
export function shouldOpenInFrame(): boolean {
  return !!document.fullscreenElement;
}

export function openGameFrame(url: string, closed: () => void): void {
  if (frame) return;
  onClosed = closed;
  const el = document.createElement('iframe');
  el.src = url;
  el.setAttribute('allow', 'fullscreen; gamepad; autoplay');
  el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#000';
  // 読み込めたらフォーカスを渡す(キー入力・ゲームパッドをゲーム側で受けるため)
  el.addEventListener('load', () => {
    el.focus();
    el.contentWindow?.focus();
  });
  document.body.appendChild(el);
  frame = el;
}

export function closeGameFrame(): void {
  if (!frame) return;
  frame.remove();
  frame = null;
  window.focus();
  const cb = onClosed;
  onClosed = null;
  cb?.();
}

/** iframeのゲームからのメッセージ(閉じる・全画面切り替え)を受ける。 */
export function listenGameFrameMessages(): void {
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || !frame || e.source !== frame.contentWindow) return;
    const type = (e.data as { type?: string } | null)?.type;
    if (type === CLOSE_MESSAGE) closeGameFrame();
    else if (type === FULLSCREEN_TOGGLE_MESSAGE) toggleFullscreen();
  });
}
