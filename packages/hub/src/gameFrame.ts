// 全画面のままゲームを遊ぶための、ハブの中のiframe表示。
// 別ページへ移動すると全画面が解除されるので、ゲームをハブ自身のiframeで開き、ハブのページを入れ替えずに保つ。
// ゲーム側の「ホームへ戻る」は ../../ への移動のままで、iframeの中にハブが読み込まれたら
// ハブ自身が親へ閉じるよう伝える(initFramedHub)。ゲームのコードは変えなくてよい。

import { FULLSCREEN_TOGGLE_MESSAGE, toggleFullscreen } from '../../shared/fullscreenKey';
import {
  GAME_ANALYTICS_MESSAGE,
  applyDeepAnalytics,
  attachGameInputSource,
  sendAnalyticsEvent,
  trackGameClose,
  trackGameLaunch,
} from '../../shared/arcadeAnalytics';
import { hideHubLoading, showHubLoading, waitNextPaint } from '../../shared/hubLoadingOverlay';

const CLOSE_MESSAGE = 'gamecenter:close-game';
/** 一瞬だけチラつくのを防ぐための「読み込み中」の最小表示時間(ms) */
const MIN_LOADING_MS = 250;
/** 万が一ゲーム側から phase 通知が来なかった場合のフォールバック(load 後の ms) */
const LOAD_FALLBACK_MS = 4000;

/** このページがゲームのiframeの中に読み込まれたハブか。 */
export const isFramedHub = window.self !== window.top;

/** iframeの中のハブは何も表示せず、親へゲームを閉じるよう伝える。 */
export function initFramedHub(): void {
  document.documentElement.style.visibility = 'hidden';
  window.parent.postMessage({ type: CLOSE_MESSAGE }, window.location.origin);
}

let frame: HTMLIFrameElement | null = null;
let onClosed: (() => void | Promise<void>) | null = null;
let activeGameId: string | undefined = undefined;
/** ハブが表示された(開いた・ゲームから戻った)時刻。ゲームを選ぶまでに何秒見ていたかに使う */
let hubShownAt = Date.now();
let gamesOpened = 0;

let opening = false;
let closing = false;
let revealed = false;
let frameSeq = 0;
let openedAt = 0;
let fallbackTimer: number | null = null;

function clearFallbackTimer(): void {
  if (fallbackTimer !== null) {
    window.clearTimeout(fallbackTimer);
    fallbackTimer = null;
  }
}

export function isGameFrameOpen(): boolean {
  return frame !== null || opening || closing;
}

/**
 * 常にiframeで開く。
 * 全画面状態をゲーム起動中・終了後も完全に維持し、ゲームから戻る際のリロードや遅延をなくす。
 */
export function shouldOpenInFrame(): boolean {
  return true;
}

/** ゲーム側の最初の画面(タイトル等)の準備ができたら「読み込み中」を閉じてゲームを見せる */
function revealGameFrame(seq: number): void {
  if (seq !== frameSeq || revealed || closing) return;
  revealed = true;
  clearFallbackTimer();
  const waitMs = Math.max(0, MIN_LOADING_MS - (performance.now() - openedAt));
  window.setTimeout(() => {
    void waitNextPaint().then(() => {
      if (seq !== frameSeq || closing) return;
      hideHubLoading();
      frame?.focus();
      frame?.contentWindow?.focus();
    });
  }, waitMs);
}

export function openGameFrame(url: string, closed: () => void | Promise<void>, gameId?: string): void {
  if (frame || opening || closing) return;
  opening = true;
  revealed = false;
  clearFallbackTimer();
  const seq = ++frameSeq;
  openedAt = performance.now();
  activeGameId = gameId;
  onClosed = closed;

  // 黒い画面を見せないよう、iframe を作る前に「読み込み中」を即座に出して1フレーム描かせる
  showHubLoading();

  if (gameId) {
    gamesOpened++;
    trackGameLaunch(gameId, undefined, undefined, false, { hubBrowseSec: Math.round((Date.now() - hubShownAt) / 100) / 10, nthGame: gamesOpened });
  }

  void waitNextPaint().then(() => {
    if (seq !== frameSeq || closing) return;
    const el = document.createElement('iframe');
    el.src = url;
    el.setAttribute('allow', 'fullscreen; gamepad; autoplay; keyboard-map');
    el.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483000;background:#000';
    // 読み込めたらフォーカスと入力計測をつなぎ、万が一 phase が届かない場合のフォールバックタイマーを置く
    el.addEventListener('load', () => {
      if (seq !== frameSeq) return;
      el.focus();
      el.contentWindow?.focus();
      // iframe内のキー・タッチ入力は親windowに届かないので、計測の対象に加える
      attachGameInputSource(el.contentWindow);
      clearFallbackTimer();
      fallbackTimer = window.setTimeout(() => revealGameFrame(seq), LOAD_FALLBACK_MS);
    });
    document.body.appendChild(el);
    frame = el;
    opening = false;
  });
}

export function closeGameFrame(): void {
  if ((!frame && !opening) || closing) return;
  closing = true;
  clearFallbackTimer();
  const seq = ++frameSeq;
  const closedAt = performance.now();

  // WebGL の破棄やハブの再描画で画面が止まる前に、「読み込み中」を先に出して1フレーム描かせる
  showHubLoading();

  void (async () => {
    await waitNextPaint();
    trackGameClose(activeGameId);
    activeGameId = undefined;
    frame?.remove();
    frame = null;
    opening = false;
    hubShownAt = Date.now();
    window.focus();
    const cb = onClosed;
    onClosed = null;
    try {
      await cb?.();
    } catch {
      /* 再描画の通信失敗などは無視して画面を戻す */
    }
    const remainMs = Math.max(0, MIN_LOADING_MS - (performance.now() - closedAt));
    if (remainMs > 0) {
      await new Promise<void>((r) => window.setTimeout(r, remainMs));
    }
    await waitNextPaint();
    closing = false;
    if (seq === frameSeq) {
      hideHubLoading();
    }
  })();
}

// ゲームを開いたままハブごとページを離れた場合も、終了(プレイ時間・FPSなど)を送る
// ハブの画面のままページを離れた場合は、ハブを最後に見てからの秒数と、開いたゲームの数を送る
window.addEventListener('pagehide', () => {
  if (frame) trackGameClose(activeGameId, { unload: true, reason: 'browser_close' });
  else if (!isFramedHub) void sendAnalyticsEvent('hub_leave', { beacon: true, data: { hubSec: Math.round((Date.now() - hubShownAt) / 100) / 10, gamesOpened } });
});

/** iframeのゲームからのメッセージ(閉じる・全画面切り替え・フェーズ遷移)を受ける。 */
export function listenGameFrameMessages(): void {
  const refocusGameFrame = () => {
    if (!frame || closing) return;
    frame.focus();
    frame.contentWindow?.focus();
  };
  document.addEventListener('fullscreenchange', refocusGameFrame);
  document.addEventListener('webkitfullscreenchange', refocusGameFrame);

  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin || !frame || e.source !== frame.contentWindow) return;
    const type = (e.data as { type?: string } | null)?.type;
    if (type === CLOSE_MESSAGE) closeGameFrame();
    else if (type === FULLSCREEN_TOGGLE_MESSAGE) toggleFullscreen();
    else if (type === GAME_ANALYTICS_MESSAGE) {
      const msg = e.data as { subType?: string; data?: Record<string, unknown> };
      if (msg.subType === 'phase') {
        revealGameFrame(frameSeq);
      }
      if (msg.subType) applyDeepAnalytics(msg.subType, msg.data, activeGameId);
    }
  });
}
