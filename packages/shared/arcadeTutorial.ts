// 全ゲーム共通: ゲーム開始前(3・2・1・GO! カウントダウンの前)に、
// 時間や敵を止めた状態で実際に自機を動かして基本操作を1つずつ順番に覚えるアクティブラーニング・チュートリアル。
// プレイ中のHUDはそのまま表示し、中央に「四角ドット(外枠なし)＋ドット風操作ウィンドウ」、下部中央に「チュートリアルをスキップ」を表示する。

import { buttonIconHtml, initInputModeTracker } from './arcadeGuide';
import { refreshLeaderboardRunTicket } from './arcadeLeaderboard';
import { escapeHtml } from './arcadeLeaderboardCore';
import { readGamepads } from './gamepadFrame';

export interface ArcadeTutorialStep {
  /** 操作の動作名（例: '右に動く', 'しゃがむ', 'ジャンプ', 'スピン攻撃'） */
  label: string;
  /** Gamepad APIのボタン番号（12:↑, 13:↓, 14:←, 15:→, 0:A, 1:B, 2:X, 3:Y 等）。空配列ならボタン表記を出さない */
  indices: number[];
  /** キーボード時のキー表記（例: 'D', 'A', 'S', 'Space', 'X'） */
  keyLabel?: string;
  /** ボタンアイコンの直後に表示する接続語（省略時は 'を押すと'。例: 'を短く押して', 'を長く押して'） */
  midText?: string;
}

export interface ArcadeTutorialOptions {
  /** ゲームのテーマカラー（枠線やアクティブドットの強調に使用） */
  accentColor?: string;
  /** チュートリアル全体の制限時間（ミリ秒）。この時間内に完遂されない場合は自動でゲーム本編を開始する（既定は 45000ms） */
  timeoutMs?: number;
  /** ステップ一覧（先頭から1つずつ順番に出題される） */
  steps: ArcadeTutorialStep[];
  /** 全ステップ達成時、またはスキップ・タイムアウト時に呼ばれる */
  onComplete: (skipped: boolean) => void;
}

export interface ArcadeTutorialHandle {
  /** 先頭の「チュートリアルを開始」ステップを終えて操作ステップに入っているか */
  isStarted: () => boolean;
  /** 現在出題中のステップ番号（イントロ中や完了後は -1） */
  currentStepIndex: () => number;
  /** 現在のステップが入力・達成判定の受付可能状態か（ステップ開始直後のインターバル中・クリア演出中・ポーズ中は false） */
  isStepReady: () => boolean;
  /** 現在のステップを達成して次へ進める（expectedStepIndex 指定時は現在ステップと一致する時のみ進める） */
  advance: (expectedStepIndex?: number) => void;
  /** 一時停止（ポーズ画面を開いた時） */
  pause: () => void;
  /** 一時停止解除 */
  resume: () => void;
  /** 強制終了（onComplete は呼ばれない。タイトルへ戻る時などに使用） */
  cancel: () => void;
}

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    /* チュートリアル中は左下の常設ガイドを非表示にする */
    body.is-arcade-tutorial-active #agc-guide {
      display: none !important;
    }

    .atut-overlay {
      position: fixed;
      inset: 0;
      z-index: 2147482100;
      pointer-events: none;
      font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', monospace, sans-serif;
      color: #fff;
      user-select: none;
      -webkit-user-select: none;
    }

    /* 中央エリア: 外枠なしの四角ドット + カクカクしたドット風メインウィンドウ */
    .atut-center-wrap {
      position: absolute;
      top: var(--atut-card-top, 6vh);
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 28px;
    }

    /* 外枠なし・単体の四角ドット群 */
    .atut-dots {
      display: inline-flex;
      align-items: center;
      gap: 18px;
    }
    .atut-dot {
      width: 22px;
      height: 22px;
      border-radius: 0;
      background: #141824;
      border: 3px solid #fff;
      outline: 3px solid #000;
      box-shadow: 5px 5px 0 #000;
      box-sizing: border-box;
    }
    .atut-dot.is-current {
      background: var(--atut-accent, #ffea00);
      border-color: #fff;
      transform: scale(1.24);
      box-shadow: 5px 5px 0 #000, 0 0 14px var(--atut-accent, #ffea00);
    }
    .atut-dot.is-done {
      background: #39ff88;
      border-color: #fff;
    }

    /* カクカクしたドット風メインウィンドウ(ステップごとに横幅が変わらないよう固定幅) */
    .atut-stage {
      display: flex;
      justify-content: center;
    }
    .atut-card {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 20px;
      min-width: min(94vw, 760px);
      max-width: 96vw;
      padding: 28px 40px;
      box-sizing: border-box;
      border-radius: 0 !important;
      background: #0b0d17;
      border: 5px solid var(--atut-accent, #ffea00);
      outline: 5px solid #000;
      box-shadow:
        inset 0 0 0 4px #000,
        12px 12px 0 #000;
      image-rendering: pixelated;
      animation: atutPixelIn 0.08s steps(2, end) both;
    }
    /* 四隅のドット装飾 */
    .atut-card::before,
    .atut-card::after {
      content: '';
      position: absolute;
      left: 4px;
      right: 4px;
      height: 8px;
      background:
        linear-gradient(var(--atut-accent, #ffea00), var(--atut-accent, #ffea00)) left / 8px 8px no-repeat,
        linear-gradient(var(--atut-accent, #ffea00), var(--atut-accent, #ffea00)) right / 8px 8px no-repeat;
      pointer-events: none;
    }
    .atut-card::before {
      top: 4px;
    }
    .atut-card::after {
      bottom: 4px;
    }
    .atut-card.is-cleared {
      background: #0d2618;
      border-color: #39ff88;
      transform: translate(-2px, -2px);
      box-shadow:
        inset 0 0 0 4px #000,
        14px 14px 0 #000;
    }
    .atut-card.is-cleared::before,
    .atut-card.is-cleared::after {
      background:
        linear-gradient(#39ff88, #39ff88) left / 8px 8px no-repeat,
        linear-gradient(#39ff88, #39ff88) right / 8px 8px no-repeat;
    }
    @keyframes atutPixelIn {
      from { transform: translateY(8px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }

    /* ウィンドウ内のボタンアイコンも角丸なしのドットブロック調に統一 */
    .atut-card .agc-inline .agc-btn,
    .atut-card .agc-inline .agc-btn.agc-key {
      min-width: 58px !important;
      height: 58px !important;
      padding: 0 18px !important;
      border-radius: 0 !important;
      background: #181c2b !important;
      border: 4px solid #fff !important;
      border-bottom: 7px solid #94a3b8 !important;
      box-shadow: 5px 5px 0 #000 !important;
      font-size: 1.75rem !important;
      font-weight: 900 !important;
      color: #fff !important;
    }
    .atut-card.is-cleared .agc-inline .agc-btn,
    .atut-card.is-cleared .agc-inline .agc-btn.agc-key {
      background: #39ff88 !important;
      color: #000 !important;
      border-color: #fff !important;
      border-bottom-color: #15803d !important;
    }

    .atut-mid {
      font-size: clamp(1.1rem, 2vw, 1.55rem);
      font-weight: 800;
      letter-spacing: 0.04em;
      color: #cbd5e1;
      white-space: nowrap;
      flex-shrink: 0;
      text-shadow:
        -2px -2px 0 #000,
         2px -2px 0 #000,
        -2px  2px 0 #000,
         2px  2px 0 #000,
         4px  4px 0 #000;
    }
    .atut-label {
      font-size: clamp(1.35rem, 2.8vw, 2.25rem);
      font-weight: 900;
      letter-spacing: 0.05em;
      color: #fff;
      white-space: nowrap;
      text-shadow:
        -3px -3px 0 #000,
         3px -3px 0 #000,
        -3px  3px 0 #000,
         3px  3px 0 #000,
         6px  6px 0 #000;
    }
    .atut-card.is-cleared .atut-label {
      color: #39ff88;
    }

    /* 下部中央: 「[TAB] チュートリアルをスキップ」 */
    .atut-skip-btn {
      position: absolute;
      bottom: 32px;
      left: 50%;
      transform: translateX(-50%);
      pointer-events: auto;
      appearance: none;
      border-radius: 0 !important;
      background: #0b0d17;
      border: 4px solid #fff;
      outline: 4px solid #000;
      box-shadow: 8px 8px 0 #000;
      padding: 14px 32px;
      color: #fff;
      font-family: inherit;
      font-size: 1.3rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      white-space: nowrap;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 14px;
    }
    .atut-skip-btn .agc-inline .agc-btn,
    .atut-skip-btn .agc-inline .agc-btn.agc-key {
      border-radius: 0 !important;
      min-width: 42px !important;
      height: 36px !important;
      padding: 0 12px !important;
      border: 3px solid #fff !important;
      border-bottom: 5px solid #94a3b8 !important;
      background: #181c2b !important;
      font-size: 1.1rem !important;
    }
    .atut-skip-btn:hover {
      background: #1e2436;
      border-color: var(--atut-accent, #ffea00);
      color: var(--atut-accent, #ffea00);
      transform: translateX(-50%) translate(-1px, -1px);
      box-shadow: 7px 7px 0 #000;
    }
    .atut-skip-btn:active {
      transform: translateX(-50%) translate(2px, 2px);
      box-shadow: 3px 3px 0 #000;
    }
  `;
  document.head.appendChild(style);
}

let audioCtx: AudioContext | null = null;
function playTone(freq: number, durationMs: number, delayMs = 0): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime + delayMs / 1000;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.11, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.02);
  } catch {
    // 音が出せない環境でも進行は止めない
  }
}

function shouldBypassTutorial(): boolean {
  if (typeof location === 'undefined') return false;
  const q = location.search;
  return q.includes('bench') || q.includes('noHud') || q.includes('preview');
}

const STEP_READY_DELAY_MS = 550;
const PRE_HELD_EXTRA_DELAY_MS = 380;
const STEP_CLEAR_HOLD_MS = 850;
const TUTORIAL_DONE_HOLD_MS = 1050;

function getStepKeyboardCodes(step: ArcadeTutorialStep): string[] {
  const codes = new Set<string>();
  for (const idx of step.indices) {
    if (idx === 12) { codes.add('KeyW'); codes.add('ArrowUp'); }
    else if (idx === 13) { codes.add('KeyS'); codes.add('ArrowDown'); }
    else if (idx === 14) { codes.add('KeyA'); codes.add('ArrowLeft'); }
    else if (idx === 15) { codes.add('KeyD'); codes.add('ArrowRight'); }
    else if (idx === 0) { codes.add('Enter'); codes.add('Space'); codes.add('KeyZ'); codes.add('KeyJ'); }
    else if (idx === 1) { codes.add('KeyX'); codes.add('KeyK'); codes.add('ShiftLeft'); codes.add('ShiftRight'); }
    else if (idx === 2) { codes.add('KeyC'); codes.add('KeyU'); codes.add('KeyW'); codes.add('ArrowUp'); }
    else if (idx === 3) { codes.add('KeyV'); codes.add('KeyI'); codes.add('Space'); }
    else if (idx >= 4 && idx <= 7) { codes.add('Space'); codes.add('Enter'); codes.add('ShiftLeft'); codes.add('ShiftRight'); }
  }
  if (step.keyLabel) {
    const tokens = step.keyLabel.toUpperCase().split(/[\s/+]+/);
    for (const tok of tokens) {
      if (tok === 'D') { codes.add('KeyD'); codes.add('ArrowRight'); }
      else if (tok === 'A') { codes.add('KeyA'); codes.add('ArrowLeft'); }
      else if (tok === 'W') { codes.add('KeyW'); codes.add('ArrowUp'); }
      else if (tok === 'S') { codes.add('KeyS'); codes.add('ArrowDown'); }
      else if (tok === 'WASD') {
        codes.add('KeyW'); codes.add('ArrowUp');
        codes.add('KeyA'); codes.add('ArrowLeft');
        codes.add('KeyS'); codes.add('ArrowDown');
        codes.add('KeyD'); codes.add('ArrowRight');
      }
      else if (tok === 'Z') { codes.add('KeyZ'); codes.add('KeyJ'); }
      else if (tok === 'X') { codes.add('KeyX'); codes.add('KeyK'); }
      else if (tok === 'SPACE') { codes.add('Space'); }
      else if (tok === 'ENTER') { codes.add('Enter'); }
      else if (tok === 'SHIFT') { codes.add('ShiftLeft'); codes.add('ShiftRight'); }
    }
  }
  return Array.from(codes);
}

function isStepInputCurrentlyDown(step: ArcadeTutorialStep | undefined, heldCodes: ReadonlySet<string>): boolean {
  if (!step) return false;
  const stepCodes = getStepKeyboardCodes(step);
  for (const code of stepCodes) {
    if (heldCodes.has(code)) return true;
  }
  const pads = readGamepads();
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    for (const idx of step.indices) {
      if (pad.buttons[idx]?.pressed) return true;
      if (idx === 12 && (pad.axes[1] ?? 0) < -0.45) return true;
      if (idx === 13 && (pad.axes[1] ?? 0) > 0.45) return true;
      if (idx === 14 && (pad.axes[0] ?? 0) < -0.45) return true;
      if (idx === 15 && (pad.axes[0] ?? 0) > 0.45) return true;
    }
  }
  return false;
}

export function startArcadeTutorial(options: ArcadeTutorialOptions): ArcadeTutorialHandle {
  if (shouldBypassTutorial() || options.steps.length === 0) {
    options.onComplete(true);
    return {
      isStarted: () => true,
      currentStepIndex: () => -1,
      isStepReady: () => false,
      advance: () => {},
      pause: () => {},
      resume: () => {},
      cancel: () => {},
    };
  }

  injectStyle();
  initInputModeTracker();
  document.body?.classList.add('is-arcade-tutorial-active');

  const root = document.createElement('div');
  root.className = 'atut-overlay';
  if (options.accentColor) root.style.setProperty('--atut-accent', options.accentColor);

  const introStep: ArcadeTutorialStep = {
    indices: [0],
    keyLabel: 'Enter',
    label: 'チュートリアルを開始',
  };
  const allSteps: ArcadeTutorialStep[] = [introStep, ...options.steps];
  const total = allSteps.length;
  const maxTutorialMs = options.timeoutMs ?? 45000;
  let currentIdx = 0;
  let transitioning = false;
  let finished = false;
  let paused = false;
  let pausedAt = 0;
  let stepTimer = 0;
  let stepTimerEndAt = 0;
  let remainingStepTimerMs = 0;
  let stepTimerCallback: (() => void) | null = null;
  let rafId = 0;
  let activeElapsedMs = 0;
  let lastFrameAt = performance.now();
  const armAt = lastFrameAt + 260;
  let stepStartedAt = lastFrameAt;
  let stepReadyAt = lastFrameAt;
  let preHeld = false;
  let preHeldReadyAt = lastFrameAt;
  const heldCodes = new Set<string>();

  const dotsHtml = allSteps.map((_, i) => `<span class="atut-dot" data-idx="${i}"></span>`).join('');

  root.innerHTML = `
    <div class="atut-center-wrap">
      <div class="atut-dots">${dotsHtml}</div>
      <div class="atut-stage"></div>
    </div>
    <button type="button" class="atut-skip-btn">
      ${buttonIconHtml([9], 'Tab')}
      <span>チュートリアルをスキップ</span>
    </button>
  `;

  document.body.appendChild(root);

  const dotEls = Array.from(root.querySelectorAll<HTMLElement>('.atut-dot'));
  const stage = root.querySelector<HTMLElement>('.atut-stage')!;

  const isStepReady = (): boolean => {
    if (finished || paused || transitioning || currentIdx === 0) return false;
    const now = performance.now();
    if (now < stepReadyAt) return false;
    if (preHeld && now < preHeldReadyAt) return false;
    return true;
  };

  const scheduleStepTimer = (delayMs: number, cb: () => void): void => {
    window.clearTimeout(stepTimer);
    stepTimerCallback = cb;
    remainingStepTimerMs = delayMs;
    stepTimerEndAt = performance.now() + delayMs;
    stepTimer = window.setTimeout(() => {
      stepTimerCallback = null;
      remainingStepTimerMs = 0;
      cb();
    }, delayMs);
  };

  const renderCurrentStep = (cleared = false): void => {
    const step = allSteps[currentIdx];
    if (!step) return;

    dotEls.forEach((dot, idx) => {
      dot.classList.toggle('is-done', idx < currentIdx || (idx === currentIdx && cleared));
      dot.classList.toggle('is-current', idx === currentIdx && !cleared);
    });

    const hasButton = step.indices.length > 0 || !!step.keyLabel;
    const safeKeyLabel = step.keyLabel ? escapeHtml(step.keyLabel) : undefined;
    const badgeHtml =
      step.indices.length === 0 && safeKeyLabel
        ? `<span class="agc-inline"><span class="agc-btn agc-key">${safeKeyLabel}</span></span>`
        : buttonIconHtml(step.indices, safeKeyLabel);
    stage.innerHTML = `
      <div class="atut-card${cleared ? ' is-cleared' : ''}">
        ${hasButton ? `${badgeHtml}<span class="atut-mid">${escapeHtml(step.midText ?? 'を押すと')}</span>` : ''}
        <span class="atut-label">${escapeHtml(step.label)}</span>
      </div>
    `;
    if (!cleared) {
      const now = performance.now();
      stepStartedAt = now;
      if (currentIdx >= 1) {
        stepReadyAt = now + STEP_READY_DELAY_MS;
        preHeld = isStepInputCurrentlyDown(step, heldCodes);
        preHeldReadyAt = now + STEP_READY_DELAY_MS + PRE_HELD_EXTRA_DELAY_MS;
      } else {
        stepReadyAt = now;
        preHeld = false;
        preHeldReadyAt = now;
      }
    }
  };

  renderCurrentStep(false);

  const cleanup = (): void => {
    if (rafId) cancelAnimationFrame(rafId);
    window.clearTimeout(stepTimer);
    stepTimerCallback = null;
    remainingStepTimerMs = 0;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    heldCodes.clear();
    document.body?.classList.remove('is-arcade-tutorial-active');
    root.remove();
  };

  const finish = (skipped: boolean): void => {
    if (finished) return;
    finished = true;
    transitioning = true;
    if (rafId) cancelAnimationFrame(rafId);
    window.clearTimeout(stepTimer);
    stepTimerCallback = null;
    remainingStepTimerMs = 0;
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);

    if (skipped) {
      playTone(660, 60);
      cleanup();
      refreshLeaderboardRunTicket();
      options.onComplete(true);
    } else {
      dotEls.forEach((dot) => {
        dot.classList.add('is-done');
        dot.classList.remove('is-current');
      });
      stage.innerHTML = `
        <div class="atut-card is-cleared">
          <span class="atut-label">チュートリアルが完了</span>
        </div>
      `;
      playTone(1046.5, 90, 0);
      playTone(1318.5, 90, 90);
      playTone(1568.0, 220, 180);
      stepTimer = window.setTimeout(() => {
        cleanup();
        refreshLeaderboardRunTicket();
        options.onComplete(false);
      }, TUTORIAL_DONE_HOLD_MS);
    }
  };

  const completeCurrentStep = (force = false): void => {
    if (finished || paused || transitioning || currentIdx >= total) return;
    if (!force && currentIdx >= 1 && !isStepReady()) return;
    transitioning = true;
    renderCurrentStep(true);
    playTone(880, 95);

    scheduleStepTimer(STEP_CLEAR_HOLD_MS, () => {
      if (finished || paused) return;
      if (currentIdx + 1 >= total) {
        finish(false);
      } else {
        currentIdx++;
        transitioning = false;
        renderCurrentStep(false);
      }
    });
  };

  const skipBtn = root.querySelector<HTMLButtonElement>('.atut-skip-btn');
  if (skipBtn) {
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!paused) finish(true);
    });
  }

  const onKeyDown = (e: KeyboardEvent): void => {
    heldCodes.add(e.code);
    if (finished || paused || performance.now() < armAt) return;
    if (e.code === 'Tab' && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      finish(true);
      return;
    }
    if (currentIdx === 0 && !transitioning && e.code === 'Enter' && !e.repeat) {
      e.preventDefault();
      completeCurrentStep(true);
    }
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    heldCodes.delete(e.code);
  };
  const onBlur = (): void => {
    heldCodes.clear();
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', onBlur);

  // STARTボタン(9)でのスキップ監視 & 先頭ステップのAボタン(0)入力監視 & 制限時間監視
  let prevStartPressed = true;
  let prevConfirmPressed = true;
  const pollGamepadSkip = (): void => {
    if (finished) return;
    const now = performance.now();
    const dt = Math.min(200, Math.max(0, now - lastFrameAt));
    lastFrameAt = now;
    if (!paused) {
      activeElapsedMs += dt;
      if (maxTutorialMs > 0 && activeElapsedMs >= maxTutorialMs) {
        finish(true);
        return;
      }
      if (currentIdx >= 1 && !transitioning) {
        const step = allSteps[currentIdx];
        const currentlyDown = isStepInputCurrentlyDown(step, heldCodes);
        if (!currentlyDown) {
          preHeld = false;
        } else if (now < stepStartedAt + 180) {
          preHeld = true;
        }
      }
      if (now >= armAt) {
        const pads = readGamepads();
        let startDown = false;
        let confirmDown = false;
        for (const pad of pads) {
          if (!pad || !pad.connected) continue;
          if (pad.buttons[9]?.pressed) {
            startDown = true;
          }
          if (pad.buttons[0]?.pressed) {
            confirmDown = true;
          }
        }
        if (startDown && !prevStartPressed) {
          finish(true);
          return;
        }
        if (currentIdx === 0 && !transitioning && confirmDown && !prevConfirmPressed) {
          completeCurrentStep(true);
        }
        prevStartPressed = startDown;
        prevConfirmPressed = confirmDown;
      }
    }
    rafId = requestAnimationFrame(pollGamepadSkip);
  };
  rafId = requestAnimationFrame(pollGamepadSkip);

  return {
    isStarted: () => currentIdx >= 1,
    currentStepIndex: () => (finished || currentIdx === 0 ? -1 : currentIdx - 1),
    isStepReady,
    advance: (expectedStepIndex?: number) => {
      if (currentIdx < 1 || transitioning) return;
      if (expectedStepIndex !== undefined && expectedStepIndex + 1 !== currentIdx) return;
      completeCurrentStep();
    },
    pause: () => {
      if (paused || finished) return;
      paused = true;
      pausedAt = performance.now();
      if (stepTimerCallback) {
        window.clearTimeout(stepTimer);
        remainingStepTimerMs = Math.max(80, stepTimerEndAt - pausedAt);
      }
      root.style.display = 'none';
      document.body?.classList.remove('is-arcade-tutorial-active');
    },
    resume: () => {
      if (!paused) return;
      const now = performance.now();
      const pauseDur = Math.max(0, now - pausedAt);
      paused = false;
      lastFrameAt = now;
      stepStartedAt += pauseDur;
      stepReadyAt += pauseDur;
      preHeldReadyAt += pauseDur;
      prevStartPressed = true;
      prevConfirmPressed = true;
      if (!finished) {
        root.style.display = '';
        document.body?.classList.add('is-arcade-tutorial-active');
        if (stepTimerCallback && remainingStepTimerMs > 0) {
          scheduleStepTimer(remainingStepTimerMs, stepTimerCallback);
        }
      }
    },
    cancel: () => {
      if (!finished) {
        finished = true;
        cleanup();
      }
    },
  };
}
