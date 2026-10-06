// Fキーで全画面表示を切り替える共通処理。
// 全画面にできない環境(iOS Safariなど)では何もしない。
//
// 全画面は「ページ」単位で、別ページへ移動すると解除される。そこでハブは、全画面のままゲームを起動するとき
// ゲームを自分の中のiframeで開く(packages/hub/src/gameFrame.ts)。iframeの中のゲームでFキーが押されたときは、
// 全画面にする対象がハブのページなので、親(ハブ)へメッセージを送って切り替えてもらう。

export const FULLSCREEN_TOGGLE_MESSAGE = 'gamecenter:toggle-fullscreen';

export function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen().catch(() => {});
  } else if (document.fullscreenEnabled) {
    void document.documentElement.requestFullscreen().catch(() => {});
  }
}

/** Fキー(修飾キーなし・長押しの連続入力は無視)で全画面を切り替える。 */
export function mountFullscreenKey(): void {
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyF' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
    const target = e.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]')) return;
    if (window.parent !== window) {
      // ハブのiframeの中: 全画面にするのは親のページ
      window.parent.postMessage({ type: FULLSCREEN_TOGGLE_MESSAGE }, window.location.origin);
    } else {
      toggleFullscreen();
    }
  });
}
