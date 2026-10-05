// 全ゲーム共通: ゲーム開始前の「3・2・1・GO!」カウントダウン。
// 画面中央に大きな数字を出し、短いビープを鳴らす。表示・音ともに自前で持つので、ゲーム側は
// 「カウントダウン中は操作を受け付けない状態を作り、onGo で本番を始める」だけでよい。

export interface ArcadeCountdownOptions {
  /** 数字の秒数。既定は3(3→2→1→GO!) */
  seconds?: number;
  /** 数字ごとに1秒間隔で表示する時の文字色。ゲームのテーマに合わせたい時に指定 */
  accentColor?: string;
  /** 数字を縦にずらす量(CSSの長さ。例: '20vh')。中央に別の文言を出している時に重ならないよう使う */
  offsetY?: string;
  /** GO! が出た瞬間に呼ばれる。ここで本番を始める */
  onGo: () => void;
  /** 数字(3,2,1)を出すたびに呼ばれる(任意) */
  onTick?: (remaining: number) => void;
}

export interface ArcadeCountdownHandle {
  /** 途中で止める(onGo は呼ばれない)。タイトルへ戻る時などに使う */
  cancel: () => void;
}

const STEP_MS = 800;
const GO_HOLD_MS = 600;

let styleInjected = false;
function injectStyle(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .acd-root {
      position: fixed;
      inset: 0;
      z-index: 2147482000;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif;
    }
    .acd-num {
      font-size: clamp(96px, 26vmin, 280px);
      font-weight: 900;
      line-height: 1;
      letter-spacing: 4px;
      margin-top: var(--acd-offset-y, 0);
      color: var(--acd-color, #ffffff);
      -webkit-text-stroke: clamp(3px, 0.8vmin, 8px) rgba(0, 0, 0, 0.85);
      paint-order: stroke fill;
      text-shadow: 0 0 40px var(--acd-color, #ffffff), 0 8px 24px rgba(0, 0, 0, 0.6);
      animation: acdPop ${STEP_MS}ms cubic-bezier(0.2, 0.9, 0.3, 1) both;
    }
    .acd-num.go {
      font-size: clamp(80px, 22vmin, 240px);
      color: #ffe600;
      --acd-color: #ffe600;
    }
    @keyframes acdPop {
      0% { transform: scale(2.2); opacity: 0; }
      25% { transform: scale(1); opacity: 1; }
      80% { transform: scale(0.96); opacity: 1; }
      100% { transform: scale(0.8); opacity: 0.25; }
    }
    @media (prefers-reduced-motion: reduce) {
      .acd-num { animation: none; }
    }
  `;
  document.head.appendChild(style);
}

let audioCtx: AudioContext | null = null;
function beep(freq: number, durationMs: number): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + durationMs / 1000);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + durationMs / 1000 + 0.02);
  } catch {
    // 音が出せない環境(自動再生の制限など)でも、表示だけで進行する
  }
}

export function startArcadeCountdown(options: ArcadeCountdownOptions): ArcadeCountdownHandle {
  injectStyle();
  const seconds = Math.max(1, Math.floor(options.seconds ?? 3));
  const root = document.createElement('div');
  root.className = 'acd-root';
  if (options.accentColor) root.style.setProperty('--acd-color', options.accentColor);
  if (options.offsetY) root.style.setProperty('--acd-offset-y', options.offsetY);
  document.body.appendChild(root);

  let timer = 0;
  let finished = false;

  const finish = (): void => {
    finished = true;
    window.clearTimeout(timer);
    root.remove();
  };

  const show = (text: string, go: boolean): void => {
    root.innerHTML = '';
    const el = document.createElement('div');
    el.className = go ? 'acd-num go' : 'acd-num';
    el.textContent = text;
    root.appendChild(el);
  };

  const step = (remaining: number): void => {
    if (finished) return;
    if (remaining > 0) {
      show(String(remaining), false);
      beep(660, 120);
      options.onTick?.(remaining);
      timer = window.setTimeout(() => step(remaining - 1), STEP_MS);
    } else {
      show('GO!', true);
      beep(1320, 380);
      options.onGo();
      timer = window.setTimeout(finish, GO_HOLD_MS);
    }
  };

  step(seconds);

  return {
    cancel: () => {
      if (!finished) finish();
    },
  };
}
