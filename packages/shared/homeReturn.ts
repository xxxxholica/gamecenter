// 全ゲーム共通: ホーム(ハブ)へ戻る処理と、戻る操作(Backspace / アケコンの SELECT)の統一。
// 各ゲームのエントリで installHomeReturn() を1回呼ぶ。

import { mountFullscreenKey } from './fullscreenKey';
import { initGameMobileBlock } from './mobileBlock';
import { startStandaloneTracking } from './arcadeAnalytics';
import { readGamepads } from './gamepadFrame';

const SELECT_BUTTON = 8;
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

// 戻る操作は全ゲームで Backspace に統一する(アケコン/ゲームパッドの SELECT = button 8 は、Backspace を押したのと同じ扱い)。
//   タイトル: ホームへ / メニュー: 一つ前へ / プレイ中: ポーズ(arcadePause.ts)
// Escape は使わない(キーボードの Escape は、どのゲームにも届かないようにここで止める)。

/** SELECT を押した瞬間に、Backspace のキー操作を作ってゲームへ届ける(各ゲームは Backspace だけ見ればよい) */
function mapSelectToBackspace(): void {
  let prev = false;
  const tick = () => {
    const pads = readGamepads();
    let down = false;
    for (const pad of pads) {
      if (pad && pad.connected && pad.buttons[SELECT_BUTTON]?.pressed) down = true;
    }
    if (down && !prev) {
      const init = { code: 'Backspace', key: 'Backspace', bubbles: true, cancelable: true } as const;
      window.dispatchEvent(new KeyboardEvent('keydown', init));
      window.setTimeout(() => window.dispatchEvent(new KeyboardEvent('keyup', init)), 60);
    }
    prev = down;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function installHomeReturn(): void {
  // モバイル端末での直接アクセス時にゲーム画面をグレーアウトし警告を表示
  initGameMobileBlock();

  // ハブを経由せず直接開かれた場合の起動・終了を記録する(iframe内ではハブ側が記録するので何もしない)
  startStandaloneTracking();

  // 全ゲーム共通のホーム操作として、Fキーの全画面切り替えもここで入れる
  mountFullscreenKey();

  // Escape は無効(Backspace に統合)。各ゲームのキー処理より先に受けて、止める
  const blockEscape = (e: KeyboardEvent) => {
    if (e.code !== 'Escape') return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('keydown', blockEscape, true);
  window.addEventListener('keyup', blockEscape, true);

  mapSelectToBackspace();
}
