// ============================================================
// モバイル端末（スマホ・タブレット）アクセス制限モジュール
// PC（キーボード / アケコン）専用ゲームセンターのため、
// 非対応デバイスでのアクセス時は通常と同じ背景の全画面オーバーレイを中央表示する。
// ============================================================

/** モバイルデバイス（スマートフォン・タブレット・PC版サイト表示要求時も含む）か判定 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;

  // URLパラメータでテスト可能 (?mobile=1 で強制モバイル扱い、?mobile=0 で強制PC扱い)
  if (window.location.search.includes('mobile=1')) return true;
  if (window.location.search.includes('mobile=0')) return false;

  // 1. User Agent / Client Hints 判定
  const ua = navigator.userAgent || '';
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return true;
  if ((navigator as any).userAgentData?.mobile === true) return true;

  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

  // 2. iOS / iPadOS の「デスクトップ用Webサイトを表示」(UAがMacintoshに偽装されるがタッチ点数が複数ある)
  if (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)) return true;

  // 3. Android の「PC版サイト」(UAがX11; Linux x86_64に偽装されるが platform が Linux armv8l / aarch64 等)
  const platform = navigator.platform || '';
  if (hasTouch && /Linux armv|Linux aarch64|Android/i.test(platform)) return true;

  // 4. ポインタ・ホバー判定: 主入力がタッチ(coarse)かつホバー不可(none)の端末はPC版サイト表示でもモバイル/タブレット
  if (typeof window.matchMedia === 'function') {
    if (window.matchMedia('(any-pointer: coarse) and (any-hover: none)').matches) return true;
    if (window.matchMedia('(pointer: coarse) and (hover: none)').matches) return true;
  }

  // 5. タッチデバイスかつ画面幅(または端末本来の画面短辺)がスマホ・タブレットサイズ (<= 840px)
  const screenShortSide =
    typeof window.screen !== 'undefined' && window.screen.width && window.screen.height
      ? Math.min(window.screen.width, window.screen.height)
      : window.innerWidth;
  if (hasTouch && (window.innerWidth <= 840 || screenShortSide <= 840)) return true;

  return false;
}

let bannerStyleInjected = false;

function injectBannerStyles(): void {
  if (bannerStyleInjected) return;
  bannerStyleInjected = true;

  const style = document.createElement('style');
  style.id = 'mobile-warning-banner-styles';
  style.textContent = `
    /* ===== 非対応デバイス用 全画面中央表示 ===== */
    html:has(body.is-mobile-blocked),
    body.is-mobile-blocked {
      overflow: hidden !important;
      height: 100dvh !important;
      padding: 0 !important;
    }

    body.is-mobile-blocked > *:not(#mobile-warning-banner) {
      display: none !important;
      pointer-events: none !important;
      user-select: none !important;
    }

    .mobile-warning-banner {
      position: fixed;
      inset: 0;
      z-index: 2147483640;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 32px 24px;
      text-align: center;
      background-color: #faf9f6;
      background-image:
        url('/doodles.svg'),
        linear-gradient(to right, rgba(148, 163, 184, 0.28) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(148, 163, 184, 0.28) 1px, transparent 1px);
      background-repeat: repeat, repeat, repeat;
      background-size: 800px 800px, 24px 24px, 24px 24px;
      color: #1e293b;
      font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }

    .mobile-warning-container {
      max-width: 460px;
      width: 100%;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
    }

    .mobile-warning-icon {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #f59e0b;
      margin-bottom: 2px;
      filter: drop-shadow(0 3px 6px rgba(245, 158, 11, 0.22));
    }

    .mobile-warning-icon svg {
      width: 100%;
      height: 100%;
      display: block;
    }

    .mobile-warning-title {
      margin: 0;
      max-width: 100%;
      color: #0f172a;
      font-size: clamp(0.85rem, 4.8vw, 1.35rem);
      font-weight: 800;
      letter-spacing: 0.02em;
      line-height: 1.4;
      white-space: nowrap;
    }

    .mobile-warning-desc {
      margin: 0;
      color: #475569;
      font-size: 0.92rem;
      font-weight: 600;
      line-height: 1.7;
      text-align: center;
    }

    .mobile-warning-url {
      margin-top: 6px;
      padding: 6px 16px;
      background: #ffffff;
      border: 1.5px solid #cbd5e1;
      border-radius: 10px;
      color: #64748b;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.04em;
    }

    /* ===== モバイル表示時: ボタンガイド非表示 ===== */
    .agc-root,
    .agc-inline {
      display: none !important;
    }
  `;
  document.head.appendChild(style);
}

/** 非対応デバイス用の全画面案内を作成・マウントする */
function mountMobileWarningBanner(): HTMLElement | null {
  if (typeof document === 'undefined') return null;

  injectBannerStyles();

  let banner = document.getElementById('mobile-warning-banner');
  if (banner) return banner;

  banner = document.createElement('aside');
  banner.id = 'mobile-warning-banner';
  banner.className = 'mobile-warning-banner';
  banner.setAttribute('role', 'alert');
  banner.setAttribute('aria-live', 'assertive');

  banner.innerHTML = `
    <div class="mobile-warning-container">
      <div class="mobile-warning-icon" aria-hidden="true">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#fef3c7" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <line x1="12" y1="9" x2="12" y2="13.5" stroke="#d97706" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="12" cy="17" r="1.2" fill="#d97706"/>
        </svg>
      </div>
      <h1 class="mobile-warning-title">お使いの環境には対応しておりません</h1>
      <p class="mobile-warning-desc">各ゲームのプレイにはキーボードまたはアーケードコントローラが必要です。<br>Windows / macOSのGoogle Chromeをご利用ください。</p>
      <div class="mobile-warning-url">https://game.hinata.works</div>
    </div>
  `;

  document.body.appendChild(banner);
  return banner;
}

/**
 * ハブ（トップページ）用: モバイルアクセス制限を初期化
 */
export function initHubMobileBlock(): boolean {
  if (!isMobileDevice()) {
    return false;
  }

  mountMobileWarningBanner();
  document.body.classList.add('is-mobile-blocked');

  // 万一イベントが伝播した場合も操作を無効化
  document.addEventListener(
    'click',
    (e) => {
      e.preventDefault();
      e.stopPropagation();
    },
    true
  );

  return true;
}

/**
 * 各ゲーム直接アクセス用: モバイルアクセス制限を初期化
 */
export function initGameMobileBlock(): boolean {
  if (!isMobileDevice()) {
    return false;
  }

  mountMobileWarningBanner();
  document.body.classList.add('is-mobile-blocked');

  return true;
}
