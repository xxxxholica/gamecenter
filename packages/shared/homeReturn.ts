// 全ゲーム共通: アケコン/ゲームパッドの SELECT(Back / Share。標準マッピングの button 8)、またはキーボードの Backspace を長押しするとホーム(ハブ)へ戻る。
// 短押しはゲームによって別用途(メニューの「戻る」・phaser-fighter の CPU 切替など)に使われているため、長押しで判定する。
// 各ゲームのエントリで installHomeReturn() を1回呼ぶ。キーボードの Escape は従来どおり各ゲーム側で処理する。

import { mountFullscreenKey } from './fullscreenKey';

const SELECT_BUTTON = 8;
const HOLD_MS = 1000;
// 短押しでゲージが一瞬ちらつかないよう、この時間を超えて押し続けたときだけ表示する
const SHOW_AFTER_MS = 150;
// games/<slug>/ 配下からルートへは2階層上
export const HUB_URL = '../../';
export const CLOSE_GAME_MESSAGE = 'gamecenter:close-game';

/**
 * ホーム(ハブ)へ戻る。
 * ハブのiframe内にいる場合は親へメッセージを送り、親側で即座にiframeを閉じる(リロード不要・全画面維持)。
 * 直接開かれている場合は通常どおりページ移動する。
 */
export function returnToHub(): void {
  if (window.parent !== window) {
    window.parent.postMessage({ type: CLOSE_GAME_MESSAGE }, window.location.origin);
  } else {
    window.location.href = HUB_URL;
  }
}

let backspaceHeld = false;

function isHomeHeld(): boolean {
  if (backspaceHeld) return true;
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (pad && pad.connected && pad.buttons[SELECT_BUTTON]?.pressed) return true;
  }
  return false;
}

function createOverlay(): { root: HTMLDivElement; fill: HTMLDivElement } {
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed',
    'top:24px',
    'left:50%',
    'transform:translateX(-50%)',
    'z-index:2147483647',
    'pointer-events:none',
    'display:none',
    'padding:10px 18px 12px',
    'border-radius:10px',
    'background:rgba(7,6,12,0.88)',
    'border:1px solid rgba(255,255,255,0.25)',
    'box-shadow:0 8px 24px rgba(0,0,0,0.5)',
    'color:#fff',
    "font:700 15px/1.4 system-ui,'Hiragino Kaku Gothic ProN',sans-serif",
    'letter-spacing:0.04em',
    'text-align:center',
  ].join(';');
  root.textContent = 'ホームへ戻る';

  const track = document.createElement('div');
  track.style.cssText = 'margin-top:8px;width:180px;height:6px;border-radius:3px;background:rgba(255,255,255,0.18);overflow:hidden';
  const fill = document.createElement('div');
  fill.style.cssText = 'width:0;height:100%;background:#fff';
  track.appendChild(fill);
  root.appendChild(track);

  document.body.appendChild(root);
  return { root, fill };
}

export function installHomeReturn(): void {
  // 全ゲーム共通のホーム操作として、Fキーの全画面切り替えもここで入れる
  mountFullscreenKey();

  // Backspace の押下状態。キーを離す・ウィンドウが外れる(keyup を取り逃す)と解除する
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backspace') backspaceHeld = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Backspace') backspaceHeld = false;
  });
  window.addEventListener('blur', () => {
    backspaceHeld = false;
  });

  let overlay: { root: HTMLDivElement; fill: HTMLDivElement } | null = null;
  let holdStart: number | null = null;
  let leaving = false;

  const tick = (now: number) => {
    if (leaving) return;

    if (isHomeHeld()) {
      holdStart ??= now;
      const elapsed = now - holdStart;
      if (elapsed >= SHOW_AFTER_MS) {
        overlay ??= createOverlay();
        overlay.root.style.display = 'block';
        overlay.fill.style.width = `${Math.min(1, elapsed / HOLD_MS) * 100}%`;
      }
      if (elapsed >= HOLD_MS) {
        leaving = true;
        returnToHub();
        return;
      }
    } else {
      holdStart = null;
      if (overlay) overlay.root.style.display = 'none';
    }

    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
