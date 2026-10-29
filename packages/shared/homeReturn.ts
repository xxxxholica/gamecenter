// 全ゲーム共通: ホーム(ハブ)へ戻る処理と、戻る操作(Backspace / アケコンの SELECT)の統一。
// 各ゲームのエントリで installHomeReturn() を1回呼ぶ。

import { mountFullscreenKey } from './fullscreenKey';
import { initGameMobileBlock } from './mobileBlock';
import { getGamePhase, reportExit, startStandaloneTracking } from './arcadeAnalytics';
import { flushReplay, getReplayMode } from './arcadeReplay';
import { readGamepads } from './gamepadFrame';
import { installBench } from './arcadeBench';
import { isBenchEnabled } from './arcadeBenchCore';
import { HUB_LOADING_HIDDEN_EVENT, isHubLoadingVisible, showHubLoading } from './hubLoadingOverlay';

interface TrackedAudioContext {
  ctx: AudioContext;
  nativeResume: () => Promise<void>;
  nativeSuspend: () => Promise<void>;
  wantResume: boolean;
}

let audioGateInstalled = false;
const trackedContexts: TrackedAudioContext[] = [];
const deferredAudios = new Map<HTMLAudioElement, Array<() => void>>();
let nativeMediaPlay: (() => Promise<void>) | null = null;
let unmuteWatchTimer: number | null = null;

function flushLoadingAudioGate(): void {
  if (isHubLoadingVisible()) return;
  if (unmuteWatchTimer !== null) {
    window.clearInterval(unmuteWatchTimer);
    unmuteWatchTimer = null;
  }
  for (const entry of trackedContexts) {
    if (entry.wantResume && (entry.ctx.state as string) !== 'closed') {
      void entry
        .nativeResume()
        .then(() => {
          try {
            entry.ctx.dispatchEvent(new Event('statechange'));
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
    }
  }
  if (nativeMediaPlay && deferredAudios.size > 0) {
    const playFn = nativeMediaPlay;
    const entries = Array.from(deferredAudios.entries());
    deferredAudios.clear();
    for (const [el, resolvers] of entries) {
      try {
        if (el.currentTime > 0 && el.currentTime < 5) {
          el.currentTime = 0;
        }
      } catch {
        /* ignore */
      }
      const p = playFn.call(el);
      if (p && typeof p.then === 'function') {
        void p.then(
          () => resolvers.forEach((r) => r()),
          () => resolvers.forEach((r) => r()),
        );
      } else {
        resolvers.forEach((r) => r());
      }
    }
  }
}

function ensureUnmuteWatcher(): void {
  if (typeof window === 'undefined' || unmuteWatchTimer !== null) return;
  unmuteWatchTimer = window.setInterval(() => {
    if (!isHubLoadingVisible()) {
      flushLoadingAudioGate();
    }
  }, 50);
}

function trackAudioContextInstance(ctx: AudioContext): void {
  if (trackedContexts.some((e) => e.ctx === ctx)) return;
  const nativeResume = ctx.resume.bind(ctx);
  const nativeSuspend = ctx.suspend.bind(ctx);
  const stateDesc =
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ctx), 'state') ??
    Object.getOwnPropertyDescriptor(AudioContext.prototype, 'state');
  const nativeStateGetter = stateDesc?.get;

  const entry: TrackedAudioContext = {
    ctx,
    nativeResume,
    nativeSuspend,
    wantResume: true,
  };
  trackedContexts.push(entry);

  if (nativeStateGetter) {
    try {
      Object.defineProperty(ctx, 'state', {
        configurable: true,
        enumerable: true,
        get(): AudioContextState {
          const real = nativeStateGetter.call(ctx) as AudioContextState;
          if (real === 'closed') return 'closed';
          if (isHubLoadingVisible()) return 'suspended';
          return real;
        },
      });
    } catch {
      /* 環境により定義できない場合はそのまま */
    }
  }

  ctx.resume = () => {
    entry.wantResume = true;
    if (isHubLoadingVisible()) {
      ensureUnmuteWatcher();
      return Promise.resolve();
    }
    return entry.nativeResume();
  };

  ctx.suspend = () => {
    entry.wantResume = false;
    return entry.nativeSuspend();
  };

  ctx.addEventListener('statechange', () => {
    if (isHubLoadingVisible()) {
      const realState = nativeStateGetter ? (nativeStateGetter.call(ctx) as AudioContextState) : ctx.state;
      if (realState === 'running') {
        void entry.nativeSuspend().catch(() => {});
      }
      ensureUnmuteWatcher();
    }
  });

  if (isHubLoadingVisible()) {
    void entry.nativeSuspend().catch(() => {});
    ensureUnmuteWatcher();
  }
}

/**
 * 読み込み画面(オーバーレイ)が表示されている間、ゲームのBGMや効果音が先行して鳴り出さないように待機させ、
 * 読み込み画面が閉じた瞬間に冒頭から再生を開始させる。
 */
export function installLoadingAudioGate(): void {
  if (audioGateInstalled || typeof window === 'undefined') return;
  audioGateInstalled = true;

  const win = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const NativeAC = win.AudioContext || win.webkitAudioContext;
  if (NativeAC) {
    const WrappedAudioContext = function (this: AudioContext, options?: AudioContextOptions): AudioContext {
      const ctx = options !== undefined ? new NativeAC(options) : new NativeAC();
      trackAudioContextInstance(ctx);
      return ctx;
    } as unknown as typeof AudioContext;
    WrappedAudioContext.prototype = NativeAC.prototype;
    Object.setPrototypeOf(WrappedAudioContext, NativeAC);
    if (win.AudioContext) win.AudioContext = WrappedAudioContext;
    if (win.webkitAudioContext) win.webkitAudioContext = WrappedAudioContext;
  }

  for (const NodeCtor of [
    typeof OscillatorNode !== 'undefined' ? OscillatorNode : undefined,
    typeof AudioBufferSourceNode !== 'undefined' ? AudioBufferSourceNode : undefined,
  ]) {
    if (NodeCtor?.prototype?.start) {
      const origStart = NodeCtor.prototype.start;
      NodeCtor.prototype.start = function (this: AudioScheduledSourceNode, ...args: [number?, number?, number?]): void {
        if (isHubLoadingVisible()) {
          try {
            this.disconnect();
          } catch {
            /* ignore */
          }
        }
        return origStart.apply(this, args as [number?]);
      };
    }
  }

  if (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype) {
    const origPlay = HTMLMediaElement.prototype.play;
    const origPause = HTMLMediaElement.prototype.pause;
    nativeMediaPlay = origPlay;

    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement): Promise<void> {
      const isAudio = typeof HTMLAudioElement !== 'undefined' && this instanceof HTMLAudioElement;
      if (isAudio && isHubLoadingVisible()) {
        ensureUnmuteWatcher();
        return new Promise<void>((resolve) => {
          const list = deferredAudios.get(this) ?? [];
          list.push(resolve);
          deferredAudios.set(this, list);
        });
      }
      if (isAudio) {
        deferredAudios.delete(this);
      }
      return origPlay.call(this);
    };

    HTMLMediaElement.prototype.pause = function (this: HTMLMediaElement): void {
      if (typeof HTMLAudioElement !== 'undefined' && this instanceof HTMLAudioElement) {
        const resolvers = deferredAudios.get(this);
        if (resolvers) {
          deferredAudios.delete(this);
          resolvers.forEach((r) => r());
        }
      }
      return origPause.call(this);
    };
  }

  window.addEventListener(HUB_LOADING_HIDDEN_EVENT, () => {
    flushLoadingAudioGate();
  });
  window.addEventListener('message', (e) => {
    if (e.origin !== window.location.origin) return;
    const type = (e.data as { type?: string } | null)?.type;
    if (type === HUB_LOADING_HIDDEN_EVENT) {
      flushLoadingAudioGate();
    }
  });
}

installLoadingAudioGate();

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
    showHubLoading();
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
  installLoadingAudioGate();

  // ?bench=1 のときだけ、フレーム時間・WebGL・GC の計測を有効にする(通常は何もしない)
  installBench();

  // モバイル端末での直接アクセス時にゲーム画面をグレーアウトし警告を表示
  initGameMobileBlock();

  // ハブを経由せず直接開かれた場合の起動・終了を記録する(iframe内ではハブ側が記録するので何もしない)
  startStandaloneTracking();

  // 全ゲーム共通のホーム操作として、Fキーの全画面切り替えもここで入れる
  mountFullscreenKey();

  // Escape は無効(Backspace に統合)。各ゲームのキー処理より先に受けて、止める。
  // また、入力欄以外での Backspace によるブラウザの履歴戻り(history.back)を全体で防ぐ
  const blockEscape = (e: KeyboardEvent) => {
    if (e.code === 'Backspace') {
      const t = e.target as HTMLElement | null;
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA' && !t.isContentEditable)) {
        e.preventDefault();
      }
      return;
    }
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
 * プレイ中・名前登録の間は数えない(オンラインの待合は相手が来ないまま放置されたら戻す)。
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
    if (phase === 'playing' || phase === 'name_entry') { touch(); return; }
    if (performance.now() - last >= limitMs) {
      touch();
      returnToHub();
    }
  }, 1000);
}
