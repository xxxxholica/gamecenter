// 全画面のままゲームを遊ぶための、ハブの中のiframe表示。
// 別ページへ移動すると全画面が解除されるので、ゲームをハブ自身のiframeで開き、ハブのページを入れ替えずに保つ。
// ゲーム側の「ホームへ戻る」は ../../ への移動のままで、iframeの中にハブが読み込まれたら
// ハブ自身が親へ閉じるよう伝える(initFramedHub)。ゲームのコードは変えなくてよい。

import { FULLSCREEN_TOGGLE_MESSAGE, toggleFullscreen } from '../../shared/fullscreenKey';
import {
  GAME_ANALYTICS_MESSAGE,
  applyDeepAnalytics,
  attachGameInputSource,
  trackGameClose,
  trackGameLaunch,
} from '../../shared/arcadeAnalytics';

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
let activeGameId: string | undefined = undefined;

export function isGameFrameOpen(): boolean {
  return frame !== null;
}

/**
 * 常にiframeで開く。
 * 全画面状態をゲーム起動中・終了後も完全に維持し、ゲームから戻る際のリロードや遅延をなくす。
 */
export function shouldOpenInFrame(): boolean {
  return true;
}

export function openGameFrame(url: string, closed: () => void, gameId?: string): void {
  if (frame) return;
  activeGameId = gameId;
  onClosed = closed;
  if (gameId) {
    trackGameLaunch(gameId);
  }
  const el = document.createElement('iframe');
  el.src = url;
  el.setAttribute('allow', 'fullscreen; gamepad; autoplay; keyboard-map');
  el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#000';
  // 読み込めたらフォーカスを渡す(キー入力・ゲームパッドをゲーム側で受けるため)
  el.addEventListener('load', () => {
    el.focus();
    el.contentWindow?.focus();
    // iframe内のキー・タッチ入力は親windowに届かないので、計測の対象に加える
    attachGameInputSource(el.contentWindow);
  });
  document.body.appendChild(el);
  frame = el;
}

export function closeGameFrame(): void {
  if (!frame) return;
  trackGameClose(activeGameId);
  activeGameId = undefined;
  frame.remove();
  frame = null;
  window.focus();
  const cb = onClosed;
  onClosed = null;
  cb?.();
}

// ゲームを開いたままハブごとページを離れた場合も、終了(プレイ時間・FPSなど)を送る
window.addEventListener('pagehide', () => {
  if (frame) trackGameClose(activeGameId, { unload: true });
});

/** iframeのゲームからのメッセージ(閉じる・全画面切り替え)を受ける。 */
export function listenGameFrameMessages(): void {
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || !frame || e.source !== frame.contentWindow) return;
    const type = (e.data as { type?: string } | null)?.type;
    if (type === CLOSE_MESSAGE) closeGameFrame();
    else if (type === FULLSCREEN_TOGGLE_MESSAGE) toggleFullscreen();
    else if (type === GAME_ANALYTICS_MESSAGE) {
      const msg = e.data as { subType?: string; data?: Record<string, unknown> };
      if (msg.subType) applyDeepAnalytics(msg.subType, msg.data, activeGameId);
    }
  });
}
