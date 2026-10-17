// ============================================================
// モバイル端末（スマホ・タブレット）アクセス制限モジュール
// PC（キーボード / アケコン）専用ゲームセンターのため、
// スマホでのアクセス時は画面上部に固定の警告バナーを表示し、
// 背景や一覧はそのまま見せつつゲームの起動をブロックする。
// ============================================================

function returnToHubFromBlocker(): void {
  if (typeof window !== 'undefined') {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'gamecenter:close-game' }, window.location.origin);
    } else {
      window.location.href = '../../';
    }
  }
}

/** モバイルデバイス（スマートフォン・タブレット・タッチ主体の小画面）か判定 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // URLパラメータでテスト可能 (?mobile=1 で強制モバイル扱い、?mobile=0 で強制PC扱い)
  if (window.location.search.includes('mobile=1')) return true;
  if (window.location.search.includes('mobile=0')) return false;

  // 1. User Agent 判定
  const ua = navigator.userAgent;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  if (isMobileUA) return true;

  // 2. iPadOS (デスクトップモード偽装)
  const isIPad = navigator.maxTouchPoints > 1 && /Macintosh/.test(ua);
  if (isIPad) return true;

  // 3. タッチデバイスかつ画面幅がスマホ・タブレットサイズ (<= 840px)
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isSmallScreen = window.innerWidth <= 840;
  if (hasTouch && isSmallScreen) return true;

  return false;
}

let bannerStyleInjected = false;

function injectBannerStyles(): void {
  if (bannerStyleInjected) return;
  bannerStyleInjected = true;

  const style = document.createElement('style');
  style.id = 'mobile-warning-banner-styles';
  style.textContent = `
    /* ===== 上部固定警告バナー ===== */
    .mobile-warning-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483640;
      background: rgba(18, 16, 24, 0.94);
      border-bottom: 2px solid #f59e0b;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), 0 0 16px rgba(245, 158, 11, 0.2);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
      color: #ffffff;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Hiragino Sans', sans-serif;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }

    .mobile-warning-container {
      max-width: 1200px;
      margin: 0 auto;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .mobile-warning-icon {
      font-size: 22px;
      line-height: 1;
      flex-shrink: 0;
      filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.4));
    }

    .mobile-warning-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }

    .mobile-warning-title {
      color: #fbbf24;
      font-size: 13.5px;
      font-weight: 700;
      letter-spacing: 0.02em;
      line-height: 1.3;
    }

    .mobile-warning-desc {
      color: #d1d5db;
      font-size: 12px;
      line-height: 1.4;
      word-break: break-word;
    }

    .mobile-warning-hub-btn {
      flex-shrink: 0;
      padding: 6px 14px;
      background: #f59e0b;
      color: #0b0b10;
      border: none;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease, transform 0.1s ease;
    }

    .mobile-warning-hub-btn:active {
      transform: scale(0.96);
      background: #d97706;
    }

    /* ===== モバイル表示時: ボタンガイド非表示 ===== */
    .agc-root,
    .agc-inline {
      display: none !important;
    }

    /* ===== ゲーム直接アクセス時 ===== */
    body.is-game-mobile-blocked > *:not(#mobile-warning-banner) {
      pointer-events: none !important;
      user-select: none !important;
    }
  `;
  document.head.appendChild(style);
}

/** 上部警告バナーを作成・マウントする */
export function mountMobileWarningBanner(options?: { isGame?: boolean }): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  injectBannerStyles();

  let banner = document.getElementById('mobile-warning-banner');
  if (banner) return banner;

  const isGame = options?.isGame ?? false;

  banner = document.createElement('aside');
  banner.id = 'mobile-warning-banner';
  banner.className = 'mobile-warning-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');

  banner.innerHTML = `
    <div class="mobile-warning-container">
      <div class="mobile-warning-icon">⚠️</div>
      <div class="mobile-warning-content">
        <strong class="mobile-warning-title">お使いの環境には対応しておりません</strong>
        <span class="mobile-warning-desc">各ゲームのプレイにはキーボードまたはアーケードコントローラーが必要です。</span>
      </div>
      ${
        isGame
          ? '<button type="button" class="mobile-warning-hub-btn">ハブへ戻る</button>'
          : ''
      }
    </div>
  `;

  if (isGame) {
    banner.querySelector('.mobile-warning-hub-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      returnToHubFromBlocker();
    });
  }

  document.body.appendChild(banner);

  // バナーの高さ分だけbody上部に余白を確保（重なり防止）
  const updatePadding = () => {
    if (banner) {
      const bannerHeight = banner.offsetHeight;
      document.body.style.paddingTop = `${bannerHeight}px`;
    }
  };

  updatePadding();
  window.addEventListener('resize', updatePadding);

  return banner;
}

/**
 * ハブ（トップページ）用: モバイルアクセス制限を初期化
 * - 画面上部に固定警告バナーを表示
 * - 背景・ゲームカードはそのまま綺麗に閲覧可能
 * - ゲームカードタップ時はゲームの起動のみを阻止（アニメーションなし）
 */
export function initHubMobileBlock(): boolean {
  if (!isMobileDevice()) {
    return false;
  }

  mountMobileWarningBanner({ isGame: false });
  document.body.classList.add('is-mobile-blocked');

  // カードをタップしたときに起動阻止（演出なしでそのままブロック）
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const card = target.closest('.card');
      if (card) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true
  );

  return true;
}

/**
 * 各ゲーム直接アクセス用: モバイルアクセス制限を初期化
 * - 画面上部に固定警告バナーを表示し「ハブへ戻る」ボタンを設置
 * - ゲーム本体の操作は無効化
 */
export function initGameMobileBlock(): boolean {
  if (!isMobileDevice()) {
    return false;
  }

  mountMobileWarningBanner({ isGame: true });
  document.body.classList.add('is-game-mobile-blocked');

  return true;
}
