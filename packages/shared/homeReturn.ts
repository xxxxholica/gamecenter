// 全ゲーム共通: ホーム(ハブ)へ戻る処理と、戻る操作(Backspace / アケコンの SELECT)の統一。
// 各ゲームのエントリで installHomeReturn() を1回呼ぶ。

import { mountFullscreenKey } from './fullscreenKey';
import { initGameMobileBlock } from './mobileBlock';
import { getGamePhase, reportExit, startStandaloneTracking } from './arcadeAnalytics';
import { flushReplay, getReplayMode } from './arcadeReplay';
import { readGamepads } from './gamepadFrame';
import { installBench } from './arcadeBench';
import { isBenchEnabled } from './arcadeBenchCore';

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
  reportExit();
  flushReplay(true, true);   // 操作の記録を送り切る(このあとハブが iframe ごと閉じる)
  if (getReplayMode() === 'replay') return;   // 再生では、記録の終わり(戻った所)で止まったままにする
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
  // ?bench=1 のときだけ、フレーム時間・WebGL・GC の計測を有効にする(通常は何もしない)
  installBench();

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

  watchIdleReturn();
}

/** 遊んでいない画面(タイトル・メニュー・結果・ポーズ)で、この時間なにも操作がなければハブへ戻る */
const IDLE_RETURN_MS = 3 * 60 * 1000;

/**
 * 筐体でゲームが放置されたら、ハブへ戻す(次の人がハブから選び直せるように。操作の記録も、そこで区切られる)。
 * プレイ中・オンラインの待合・名前登録の間は数えない。
 * (操作の記録・再生で同じ時に戻るよう、記録している入力(キー・クリック・アケコン)とフレームの時計だけで判定する)
 */
function watchIdleReturn(): void {
  if (isBenchEnabled() || new URLSearchParams(location.search).has('preview')) return;
  const limitMs = (window as unknown as { __gcIdleReturnMs?: number }).__gcIdleReturnMs ?? IDLE_RETURN_MS;   // (確かめる時だけ短くする)
  let last = performance.now();
  const touch = (): void => { last = performance.now(); };
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup']) window.addEventListener(type, touch, { capture: true, passive: true });
  let prevPads = '';
  window.setInterval(() => {
    let pads = '';
    for (const p of readGamepads()) {
      if (!p) continue;
      for (const b of p.buttons) pads += b.pressed ? '1' : '0';
      for (const a of p.axes) pads += Math.abs(a) > 0.4 ? (a > 0 ? '+' : '-') : '0';
    }
    if (pads !== prevPads) { prevPads = pads; touch(); }
    const phase = getGamePhase();
    if (phase === 'playing' || phase === 'lobby' || phase === 'name_entry') { touch(); return; }
    if (performance.now() - last >= limitMs) {
      touch();
      returnToHub();
    }
  }, 1000);
}
