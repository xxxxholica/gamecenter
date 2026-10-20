// ゲームを開く時・閉じる時に出す「読み込み中」画面。
// 背景はホーム(ハブ)と同じ方眼メモ帳+落書きを使い、中央に白いボックスだけを置いて黒い画面で待たせる時間をなくす。

let overlayEl: HTMLDivElement | null = null;

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
  `;
  document.body.appendChild(overlayEl);
  return overlayEl;
}

/** 「読み込み中」画面を即座に表示する */
export function showHubLoading(): void {
  const el = ensureOverlay();
  el.classList.add('is-visible');
}

/** 「読み込み中」画面をフェードアウトして閉じる */
export function hideHubLoading(): void {
  if (!overlayEl) return;
  overlayEl.classList.remove('is-visible');
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
