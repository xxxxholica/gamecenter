// ゲームを開く時・閉じる時に出す「読み込み中」画面。
// 背景はホーム(ハブ)と同じ方眼メモ帳+落書きを使い、中央に白いボックスを置き、
// 画面下部には「広告」ラベルと /api/ads から取得した広告ロゴをランダムで表示する。

import { trackAdImpression } from './arcadeAnalytics';

const AD_FILENAME_RE = /^logo-[0-9]{2,3}(?:-[a-z0-9]+)*\.webp$/;

/** 「読み込み中」画面の最低表示時間(ms) */
export const MIN_HUB_LOADING_MS = 3000;
export const HUB_LOADING_HIDDEN_EVENT = 'gamecenter:loading-hidden';

/** 自ウィンドウまたは親ウィンドウ(ハブ)で「読み込み中」画面が表示中か */
export function isHubLoadingVisible(): boolean {
  if (typeof document === 'undefined') return false;
  if (document.querySelector('.hlo-overlay.is-visible')) return true;
  try {
    if (typeof window !== 'undefined' && window.top && window.top !== window) {
      if (window.top.document.querySelector('.hlo-overlay.is-visible')) return true;
    }
  } catch {
    /* 別オリジンの場合は無視 */
  }
  return false;
}

let overlayEl: HTMLDivElement | null = null;
let adWrapEl: HTMLDivElement | null = null;
let adImgEl: HTMLImageElement | null = null;

let adLogos: string[] = [];
let adFetchPromise: Promise<string[]> | null = null;
let lastPickedLogo = '';
let activeAdLogo = '';
let activeAdStartedAt = 0;
let pagehideHooked = false;
const preloadedImages = new Map<string, HTMLImageElement>();

/** 表示中の広告ロゴがあれば、表示していた秒数を計測して送信する */
function flushActiveAdImpression(beacon = false): void {
  if (!activeAdLogo || activeAdStartedAt <= 0) {
    activeAdLogo = '';
    activeAdStartedAt = 0;
    return;
  }
  const logo = activeAdLogo;
  const elapsedSec = (performance.now() - activeAdStartedAt) / 1000;
  activeAdLogo = '';
  activeAdStartedAt = 0;
  if (elapsedSec > 0) {
    trackAdImpression(logo, elapsedSec, beacon);
  }
}

/** リプレイ記録の乱数列を消費しない乱数 */
function nextRandom(): number {
  const untracked = (globalThis as { __gcUntrackedRandom?: () => number }).__gcUntrackedRandom;
  return typeof untracked === 'function' ? untracked() : Math.random();
}

/** サーバー(/api/ads)から有効なロゴ一覧を取得し、ブラウザキャッシュへ先行プリロードする */
export function preloadHubAdLogos(): Promise<string[]> {
  if (typeof window === 'undefined' || typeof fetch !== 'function') return Promise.resolve([]);
  if (adFetchPromise) return adFetchPromise;

  adFetchPromise = fetch('/api/ads', { cache: 'no-store' })
    .then(async (res) => {
      if (!res.ok) return [];
      const data = (await res.json()) as { enabled?: unknown; logos?: unknown };
      if (data?.enabled === false || !Array.isArray(data?.logos)) {
        adLogos = [];
        lastPickedLogo = '';
        preloadedImages.clear();
        if (overlayEl?.classList.contains('is-visible')) {
          applyRandomAdLogo();
        }
        return [];
      }
      const valid = data.logos.filter(
        (item): item is string => typeof item === 'string' && AD_FILENAME_RE.test(item),
      );
      adLogos = valid;
      for (const name of valid) {
        if (!preloadedImages.has(name) && typeof Image !== 'undefined') {
          const img = new Image();
          img.decoding = 'async';
          img.src = `/api/ads/${encodeURIComponent(name)}`;
          preloadedImages.set(name, img);
        }
      }
      // ローディング画面が表示中なら、最新のON/OFF状態を即座に反映する
      if (overlayEl?.classList.contains('is-visible')) {
        if (valid.length === 0 || adWrapEl?.classList.contains('is-empty')) {
          applyRandomAdLogo();
        }
      }
      return valid;
    })
    .catch(() => {
      return [];
    })
    .finally(() => {
      adFetchPromise = null;
    });

  return adFetchPromise;
}

function applyRandomAdLogo(): void {
  if (!adWrapEl || !adImgEl) return;
  flushActiveAdImpression(false);
  if (adLogos.length === 0) {
    adWrapEl.classList.add('is-empty');
    adImgEl.removeAttribute('src');
    return;
  }

  let candidates = adLogos;
  if (adLogos.length > 1 && lastPickedLogo) {
    const others = adLogos.filter((name) => name !== lastPickedLogo);
    if (others.length > 0) candidates = others;
  }
  const idx = Math.floor(nextRandom() * candidates.length) % candidates.length;
  const chosen = candidates[idx];
  lastPickedLogo = chosen;

  adImgEl.src = `/api/ads/${encodeURIComponent(chosen)}`;
  adWrapEl.classList.remove('is-empty');
  if (overlayEl?.classList.contains('is-visible')) {
    activeAdLogo = chosen;
    activeAdStartedAt = performance.now();
  }
}

function ensureOverlay(): HTMLDivElement {
  if (overlayEl && overlayEl.isConnected) return overlayEl;

  if (!document.getElementById('hub-loading-overlay-style')) {
    const style = document.createElement('style');
    style.id = 'hub-loading-overlay-style';
    style.textContent = `
      .hlo-overlay {
        position: fixed;
        inset: 0;
        z-index: 2147483001;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #faf9f6;
        background-image:
          url('/doodles.svg'),
          linear-gradient(to right, rgba(148, 163, 184, 0.28) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(148, 163, 184, 0.28) 1px, transparent 1px);
        background-repeat: repeat, repeat, repeat;
        background-size: 800px 800px, 24px 24px, 24px 24px;
        opacity: 0;
        pointer-events: none;
        user-select: none;
        transition: opacity 0.2s ease;
      }
      .hlo-overlay.is-visible {
        opacity: 1;
        pointer-events: auto;
        transition: none;
      }
      body.pad-mode .hlo-overlay,
      body.pad-mode .hlo-overlay * {
        cursor: none;
      }
      .hlo-box {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 16px;
        padding: 26px 44px;
        background: #ffffff;
        border: 2px solid #cbd5e1;
        border-radius: 16px;
        box-shadow:
          0 10px 25px -3px rgba(15, 23, 42, 0.12),
          0 4px 10px -2px rgba(15, 23, 42, 0.08),
          0 1px 3px 0 rgba(15, 23, 42, 0.06);
        font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
        font-weight: 900;
        font-size: 1.35rem;
        letter-spacing: 0.08em;
        color: #0f172a;
      }
      .hlo-spinner {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3.5px solid #e2e8f0;
        border-top-color: #0f172a;
        animation: hloSpin 0.75s linear infinite;
        flex-shrink: 0;
      }
      @keyframes hloSpin {
        to { transform: rotate(360deg); }
      }
      .hlo-ad {
        position: absolute;
        left: 50%;
        bottom: clamp(20px, 4.5vh, 44px);
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        max-width: calc(100vw - 32px);
      }
      .hlo-ad.is-empty {
        display: none;
      }
      .hlo-ad-label {
        font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.12em;
        line-height: 1;
        color: #64748b;
      }
      .hlo-ad-card {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 12px 24px;
        background: #ffffff;
        border: 1.5px solid #cbd5e1;
        border-radius: 14px;
        box-shadow:
          0 8px 20px -4px rgba(15, 23, 42, 0.1),
          0 2px 6px -1px rgba(15, 23, 42, 0.06);
      }
      .hlo-ad-img {
        display: block;
        width: auto;
        height: auto;
        max-width: min(320px, 76vw);
        max-height: min(116px, 16vh);
        object-fit: contain;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  overlayEl = document.createElement('div');
  overlayEl.className = 'hlo-overlay';
  overlayEl.setAttribute('role', 'status');
  overlayEl.setAttribute('aria-live', 'polite');
  overlayEl.innerHTML = `
    <div class="hlo-box">
      <span class="hlo-spinner" aria-hidden="true"></span>
      <span>読み込み中</span>
    </div>
    <div class="hlo-ad is-empty">
      <span class="hlo-ad-label">広告</span>
      <div class="hlo-ad-card">
        <img class="hlo-ad-img" alt="広告" decoding="async" />
      </div>
    </div>
  `;
  adWrapEl = overlayEl.querySelector<HTMLDivElement>('.hlo-ad');
  adImgEl = overlayEl.querySelector<HTMLImageElement>('.hlo-ad-img');
  adImgEl?.addEventListener('error', () => {
    activeAdLogo = '';
    activeAdStartedAt = 0;
    adWrapEl?.classList.add('is-empty');
  });
  if (!pagehideHooked && typeof window !== 'undefined') {
    pagehideHooked = true;
    window.addEventListener('pagehide', () => {
      flushActiveAdImpression(true);
    });
  }

  document.body.appendChild(overlayEl);
  return overlayEl;
}

/** 「読み込み中」画面を即座に表示する */
export function showHubLoading(): void {
  const el = ensureOverlay();
  const wasVisible = el.classList.contains('is-visible');
  el.classList.add('is-visible');
  void preloadHubAdLogos();
  if (!wasVisible) {
    applyRandomAdLogo();
  }
}

/** 「読み込み中」画面をフェードアウトして閉じる */
export function hideHubLoading(): void {
  flushActiveAdImpression(false);
  if (!overlayEl) return;
  overlayEl.classList.remove('is-visible');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(HUB_LOADING_HIDDEN_EVENT));
  }
}

/** 画面に1フレーム描画されるのを待つ(裏タブでも止まらないようタイムアウト付き) */
export function waitNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    window.setTimeout(finish, 60);
  });
}
