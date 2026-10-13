/// <reference types="vite/client" />
import { buttonIconHtml } from './arcadeGuide';
import { returnToHub } from './homeReturn';

import cyberFighterLogo from './logos/cyber-2d-fighter-3d.webp';
import ennichiLogo from './logos/ennichi-shateki.webp';
import extremeEdgeLogo from './logos/extreme-edge-arcade.webp';
import midnightSkywayLogo from './logos/midnight-skyway.webp';
import schoolRunnerLogo from './logos/school-corridor-runner.webp';
import streetBBoyLogo from './logos/street-b-boy.webp';
import sumoSmashLogo from './logos/sumo-smash-3d.webp';
import taniRunnerLogo from './logos/tani-runner-124.webp';
import towerStackLogo from './logos/tower-stack.webp';
import { readGamepads } from './gamepadFrame';

export const GAME_LOGOS: Record<string, string> = {
  'cyber-2d-fighter-3d': cyberFighterLogo,
  'ennichi-shateki': ennichiLogo,
  'extreme-edge-arcade': extremeEdgeLogo,
  'midnight-skyway': midnightSkywayLogo,
  'school-corridor-runner': schoolRunnerLogo,
  'street-b-boy': streetBBoyLogo,
  'sumo-smash-3d': sumoSmashLogo,
  'tani-runner-124': taniRunnerLogo,
  'tower-stack': towerStackLogo,
};

export interface ArcadeTitleScreenOptions {
  slug: string;
  logoUrl?: string; // 省略時は slug から GAME_LOGOS を自動解決
  /** ロゴ画像がまだ無いゲーム用: 画像の代わりに出す固定のHTML(呼び出し側の定数。ユーザー入力は入れない) */
  logoHtml?: string;
  /** ロゴを縦にだけ引き伸ばす倍率(省略は1)。横長で上下に余白のある画像を、他のゲームのロゴと同じ高さに見せるとき用。幅は変えない */
  logoStretchY?: number;
  accentColor: string;
  tagline?: string;
  startButtonLabel?: string;
  promptLabel?: string;
  /** スタートに使うキー(KeyboardEvent.code)。省略時は Enter */
  startKeys?: string[];
  /** スタートボタンに出すキー表記(省略時は自動) */
  startKeyLabel?: string;
  customControlsHtml?: string;
  onCustomControlsReady?: (container: HTMLElement) => void;
  onStart: () => void;
}

let styleInjected = false;

function injectTitleScreenStyle(): void {
  if (styleInjected) return;
  styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .ats-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      align-items: center;
      padding: 36px 28px 24px;
      box-sizing: border-box;
      pointer-events: auto;
      user-select: none;
      /* 3Dグラフィック・主役を100%クリアに見せるため背景オーバーレイは完全透明 */
      background: transparent;
      font-family: 'Impact', 'Arial Black', system-ui, 'Hiragino Kaku Gothic ProN', sans-serif;
      color: #fff;
      opacity: 1;
      transition: opacity 0.28s ease, transform 0.28s ease;
    }

    .ats-overlay.ats-hidden {
      opacity: 0;
      pointer-events: none;
      transform: scale(1.02);
    }

    /* 上部: 浮遊する一体型ロゴ */
    .ats-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
      z-index: 10;
    }

    .ats-logo-img {
      width: min(440px, 82vw);
      scale: 1 var(--ats-logo-sy, 1);
      aspect-ratio: 16 / 9;
      object-fit: contain;
      display: block;
      filter: drop-shadow(0 8px 20px rgba(0, 0, 0, 0.85)) drop-shadow(0 0 24px color-mix(in srgb, var(--ats-accent, #ff2fd4) 45%, transparent));
      animation: ats-float 3.6s ease-in-out infinite alternate;
    }

    @keyframes ats-float {
      0% {
        transform: translateY(0px) rotate(0deg);
      }
      100% {
        transform: translateY(-8px) rotate(0.4deg);
      }
    }

    .ats-tagline {
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif;
      font-weight: 700;
      font-size: 0.82rem;
      letter-spacing: 0.12em;
      color: #ffffff;
      background: rgba(0, 0, 0, 0.72);
      border: 1px solid var(--ats-accent, #ff2fd4);
      padding: 4px 14px;
      border-radius: 999px;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      text-transform: uppercase;
    }

    /* 中央: 3D主役をクリアに見せる開放エリア */
    .ats-center-space {
      flex: 1;
      width: 100%;
      min-height: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .ats-custom-controls {
      pointer-events: auto;
      z-index: 15;
    }

    /* 下部: 操作・スタート誘導・ランキングエリア */
    .ats-footer-wrap {
      width: 100%;
      max-width: 960px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      z-index: 10;
    }

    .ats-action-row {
      width: 100%;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      position: relative;
      gap: 24px;
    }

    .ats-start-panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .ats-start-btn {
      appearance: none;
      border: none;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 14px 44px;
      border-radius: 36px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.18) 0%, rgba(20, 20, 30, 0.85) 100%), var(--ats-accent, #ff2fd4);
      color: #fff;
      font-family: 'Impact', 'Arial Black', system-ui, sans-serif;
      font-size: 1.35rem;
      letter-spacing: 0.08em;
      border: 2px solid #fff;
      box-shadow:
        0 6px 20px rgba(0, 0, 0, 0.6),
        0 0 28px color-mix(in srgb, var(--ats-accent, #ff2fd4) 65%, transparent);
      text-shadow: 0 2px 4px rgba(0, 0, 0, 0.7);
      transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
      animation: ats-pulse 1.8s ease-in-out infinite alternate;
    }

    .ats-start-btn:hover {
      transform: scale(1.05);
      box-shadow:
        0 8px 26px rgba(0, 0, 0, 0.7),
        0 0 36px var(--ats-accent, #ff2fd4);
      filter: brightness(1.12);
    }

    .ats-start-btn:active {
      transform: scale(0.97);
    }

    @keyframes ats-pulse {
      0% {
        box-shadow:
          0 4px 14px rgba(0, 0, 0, 0.6),
          0 0 16px color-mix(in srgb, var(--ats-accent, #ff2fd4) 40%, transparent);
      }
      100% {
        box-shadow:
          0 6px 24px rgba(0, 0, 0, 0.6),
          0 0 32px color-mix(in srgb, var(--ats-accent, #ff2fd4) 80%, transparent);
      }
    }

    /* レスポンシブ */
    @media (max-width: 720px) {
      .ats-action-row {
        flex-direction: column;
        align-items: center;
        gap: 16px;
      }
    }
  `;

  document.head.appendChild(style);
}

export class ArcadeTitleScreen {
  private overlay: HTMLDivElement;
  private options: ArcadeTitleScreenOptions;
  private isVisible: boolean = false;
  private isStarting: boolean = false;
  private animFrameId: number | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor(options: ArcadeTitleScreenOptions) {
    this.options = options;
    injectTitleScreenStyle();
    this.overlay = document.createElement('div');
    this.overlay.className = 'ats-overlay';
    this.overlay.style.setProperty('--ats-accent', options.accentColor);
    this.render();
    document.body.appendChild(this.overlay);
    this.bindEvents();
  }

  private render(): void {
    const {
      slug,
      logoUrl,
      logoHtml,
      logoStretchY = 1,
      tagline,
      startButtonLabel = 'スタート',
      customControlsHtml,
    } = this.options;

    const resolvedLogo = logoUrl || GAME_LOGOS[slug] || '';

    this.overlay.innerHTML = `
      <div class="ats-header">
        ${logoHtml && !resolvedLogo ? `<div class="ats-logo-html">${logoHtml}</div>` : `<img class="ats-logo-img" src="${resolvedLogo}" alt="Game Logo" style="--ats-logo-sy: ${Number(logoStretchY) || 1}" />`}
        ${tagline ? `<div class="ats-tagline">${tagline}</div>` : ''}
      </div>

      <div class="ats-center-space">
        ${customControlsHtml ? `<div class="ats-custom-controls">${customControlsHtml}</div>` : ''}
      </div>

      <div class="ats-footer-wrap">
        <div class="ats-action-row">
          <div class="ats-start-panel">
            <button class="ats-start-btn" type="button">
              ${buttonIconHtml([0, 1, 2, 3, 9], this.options.startKeyLabel)}
              <span>${startButtonLabel}</span>
            </button>
          </div>
        </div>
      </div>
    `;

    if (customControlsHtml && this.options.onCustomControlsReady) {
      const slot = this.overlay.querySelector<HTMLElement>('.ats-custom-controls');
      if (slot) this.options.onCustomControlsReady(slot);
    }
  }

  private bindEvents(): void {
    const startBtn = this.overlay.querySelector<HTMLButtonElement>('.ats-start-btn');
    if (startBtn) {
      startBtn.onclick = (e) => {
        e.stopPropagation();
        this.triggerStart();
      };
    }

    // 画面全体どこをクリックしてもスタート
    this.overlay.onclick = () => {
      this.triggerStart();
    };
  }

  private triggerStart(): void {
    if (!this.isVisible || this.isStarting) return;
    this.isStarting = true;

    // スタート時のホワイトフラッシュ / フェード演出
    this.overlay.classList.add('ats-hidden');

    setTimeout(() => {
      this.hide();
      this.options.onStart();
    }, 240);
  }

  public show(): void {
    this.isVisible = true;
    this.isStarting = false;
    this.overlay.classList.remove('ats-hidden');
    this.overlay.style.display = 'flex';

    // キーボードリスナー
    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible || this.isStarting) return;
        // Enter or any game key starts
        if ((this.options.startKeys ?? ['Enter']).includes(e.code)) {
          e.preventDefault();
          this.triggerStart();
        }
        // タイトルでの Backspace(アケコンは SELECT)は、ホーム(ハブ)へ戻る
        if (e.code === 'Backspace' && !e.repeat) {
          e.preventDefault();
          returnToHub();
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }

    // アケコン Gamepad ループ
    this.startPadLoop();
  }

  public hide(): void {
    this.isVisible = false;
    this.overlay.classList.add('ats-hidden');
    this.overlay.style.display = 'none';

    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  private startPadLoop(): void {
    if (this.animFrameId !== null) return;

    let prevPressed = true; // 初回誤爆防止

    const checkPad = () => {
      if (!this.isVisible) return;

      const pads = readGamepads();
      let anyAction = false;

      for (const pad of pads) {
        if (!pad || !pad.connected) continue;
        // 攻撃ボタン 0〜7 と START(9)
        for (let i = 0; i <= 9; i++) {
          if (pad.buttons[i]?.pressed) {
            anyAction = true;
            break;
          }
        }
        if (anyAction) break;
      }

      if (anyAction && !prevPressed) {
        this.triggerStart();
        return;
      }

      prevPressed = anyAction;
      this.animFrameId = requestAnimationFrame(checkPad);
    };

    this.animFrameId = requestAnimationFrame(checkPad);
  }

  public destroy(): void {
    this.hide();
    this.overlay.remove();
  }
}
