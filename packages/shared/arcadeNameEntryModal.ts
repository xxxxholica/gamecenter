// アーケード用 カタカナ5文字ネームエントリー バーチャルキーボード共通モーダルUI
// 洗練されたアーケードキャビネット・ソフトキーボード式ネームエントリー
// 見た目・配色・フォント・文言は各ゲームのテーマクラスで独自UI設計に完全準拠する（絵文字不使用）

import { playArcadeFanfare } from './arcadeFanfare';
import {
  MAX_NAME_LENGTH,
  KEYBOARD_GRID,
  ACTION_KEYS,
  ArcadeNameEntryCore,
  NameEntryState,
} from './arcadeNameEntryCore';
import { checkHighScore, escapeHtml } from './arcadeLeaderboard';
import { MenuNav } from './arcadeMenuNav';
import { PadEdge, startPadLoop } from './arcadePad';
import { setupResultMenu, applyResultMenuFocus } from './arcadeResultMenu';
import { randomArcadeName } from './arcadeRandomName';
import { setButtonSuffix, formatSeconds } from './arcadeAutoAction';
import { showInputShield } from './inputShield';
import { runEntryFlow } from './highScoreEntryFlowCore';

/** リザルトでスコアを見せてから登録画面を出すまでの待ち時間 */
export const NAME_ENTRY_AFTER_RESULT_MS = 2200;

export interface ArcadeNameEntryModalOptions {
  title: string;              // 見出し (例: "DRIVERS RECORD")
  scoreDisplay: string;       // 表示スコア (例: "68,500 pts")
  rankDisplay: string;        // 順位表示 (例: "1ST PLACE", "第1位")
  themeClass:                 // 各ゲームのテーマクラス
    | 'theme-street'          // ストリートビーボーイ (イエロー/シアン/Impact)
    | 'theme-ennichi'         // えんにち射的 (和風/朱赤/金色/木札調)
    | 'theme-extreme'         // 極限ギリギリ (漆黒/警告レッド/蛍光イエロー/無骨等幅)
    | 'theme-tani'            // 単位増殖ラン (黒板グリーン/チョーク白・黄/学籍証調)
    | 'theme-skyway'          // ミッドナイトスカイウェイ (サイバーシアン/マゼンタ/斜体italic)
    | 'theme-corridor';       // テンパレラン (放課後アンバー/ゴールド/掲示板調)
  initialName?: string;
  /** 表示までの待ち時間(ms)。リザルトのスコアを先に見せたいときに指定する。 */
  delayMs?: number;
  onComplete: (name: string) => Promise<unknown> | void;
}

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'arcade-name-entry-styles';
  style.textContent = `
    .ane-overlay {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at center, rgba(14, 16, 26, 0.94) 0%, rgba(4, 5, 10, 0.98) 100%);
      backdrop-filter: blur(10px);
      user-select: none;
      -webkit-user-select: none;
      animation: aneFadeIn 0.2s ease-out;
      box-sizing: border-box;
    }

    .ane-overlay * {
      box-sizing: border-box;
    }
    /* ランクインの確認は暗転させず、リザルト画面を見せたままカードを重ねる(入力画面に進むときだけ暗くする) */
    .ane-overlay.ane-light {
      background: rgba(0, 0, 0, 0.28);
      backdrop-filter: none;
    }
    .ane-overlay { transition: background 0.3s; }

    /* 最初の確認(名前を残すか)。確認・入力・登録完了の3画面で同じ大きさにするため、
       入力部品は消さずに隠して場所を残し、確認はカード全面に重ねる */
    .ane-stage-ask > *:not(.ane-ask):not(.ane-corner),
    .ane-stage-skip > *:not(.ane-completed-layer):not(.ane-corner) { visibility: hidden; }
    .ane-stage-input .ane-ask,
    .ane-stage-skip .ane-ask { display: none; }
    .ane-ask {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: clamp(8px, 2vh, 20px);
      padding: clamp(8px, 2vh, 20px);
    }
    .ane-ask .rm-col { width: min(80vw, 300px); }
    .ane-ask-score {
      font-size: clamp(14px, 2.6vh, 20px);
      font-weight: 800;
      letter-spacing: 2px;
      color: #fff;
    }
    .ane-ask-score span { color: #aab2c4; font-weight: 700; margin-right: 8px; }
    .ane-ask-trophy {
      width: clamp(48px, 11vh, 92px);
      height: auto;
      filter: drop-shadow(0 0 14px rgba(255, 214, 64, 0.85));
      animation: aneTrophyPop 0.7s cubic-bezier(0.2, 1.6, 0.4, 1) both, aneTrophyGlow 1.8s ease-in-out 0.7s infinite alternate;
    }
    @keyframes aneTrophyPop {
      from { transform: scale(0.2) rotate(-12deg); opacity: 0; }
      to { transform: scale(1) rotate(0); opacity: 1; }
    }
    @keyframes aneTrophyGlow {
      from { filter: drop-shadow(0 0 8px rgba(255, 214, 64, 0.6)); }
      to { filter: drop-shadow(0 0 22px rgba(255, 214, 64, 1)); }
    }
    .ane-ask-headline {
      font-size: clamp(20px, 4vh, 32px);
      font-weight: 900;
      letter-spacing: 3px;
      color: #ffd640;
      text-shadow: 0 0 14px rgba(255, 214, 64, 0.6);
      text-align: center;
    }
    .ane-ask-text {
      font-size: clamp(13px, 2.4vh, 18px) !important;
      font-weight: 700 !important;
      letter-spacing: 2px !important;
      color: #d6dbe6 !important;
    }

    /* 紙吹雪: 開いたときに降らせる(動きを減らす設定のときは出さない) */
    .ane-confetti {
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
      z-index: 5;
    }
    .ane-confetti i {
      position: absolute;
      top: -4vh;
      width: var(--w, 8px);
      height: var(--h, 14px);
      background: var(--c, #ffd640);
      opacity: 0;
      animation: aneConfettiFall var(--d, 3s) linear var(--delay, 0s) 1 both;
    }
    @keyframes aneConfettiFall {
      0% { opacity: 1; transform: translate3d(0, 0, 0) rotate(0deg) rotateX(0deg); }
      85% { opacity: 1; }
      100% { opacity: 0; transform: translate3d(var(--x, 0px), 112vh, 0) rotate(var(--r, 540deg)) rotateX(720deg); }
    }
    @media (prefers-reduced-motion: reduce) {
      .ane-confetti { display: none; }
    }

    @keyframes aneFadeIn {
      from { opacity: 0; transform: scale(0.96); }
      to { opacity: 1; transform: scale(1); }
    }

    .ane-card {
      position: relative;
      width: min(94vw, 860px);
      max-height: 94vh;
      padding: clamp(14px, 2.5vh, 26px) clamp(16px, 3vw, 32px);
      border-radius: clamp(12px, 1.8vw, 18px);
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      background: #0d0f17;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.1);
      overflow-y: auto;
      overflow-x: hidden;
    }

    /* コーナー装飾アクセント */
    .ane-corner {
      position: absolute;
      width: 14px;
      height: 14px;
      border-color: var(--ane-accent);
      pointer-events: none;
    }
    .ane-corner.tl { top: 8px; left: 8px; border-top: 2px solid; border-left: 2px solid; }
    .ane-corner.tr { top: 8px; right: 8px; border-top: 2px solid; border-right: 2px solid; }
    .ane-corner.bl { bottom: 8px; left: 8px; border-bottom: 2px solid; border-left: 2px solid; }
    .ane-corner.br { bottom: 8px; right: 8px; border-bottom: 2px solid; border-right: 2px solid; }

    /* タイトルセクション */
    .ane-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: clamp(6px, 1vh, 12px);
    }

    .ane-rank-badge {
      display: inline-block;
      font-size: clamp(0.75rem, 1.1vw, 0.92rem);
      font-weight: 900;
      letter-spacing: 0.14em;
      padding: clamp(2px, 0.4vh, 4px) clamp(10px, 1.5vw, 18px);
      border-radius: 4px;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .ane-title {
      font-size: clamp(1.4rem, 2.3vw, 2.1rem);
      font-weight: 900;
      letter-spacing: 0.08em;
      line-height: 1.2;
    }

    /* スコアパネル */
    .ane-score-panel {
      display: inline-flex;
      align-items: baseline;
      gap: 10px;
      padding: clamp(4px, 0.6vh, 6px) clamp(14px, 2vw, 26px);
      border-radius: 6px;
      background: rgba(0, 0, 0, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: clamp(8px, 1.2vh, 14px);
    }

    .ane-score-label {
      font-size: clamp(0.65rem, 0.9vw, 0.76rem);
      font-weight: 800;
      letter-spacing: 0.14em;
      opacity: 0.65;
    }

    .ane-score-val {
      font-size: clamp(1.35rem, 2.2vw, 1.95rem);
      font-weight: 900;
      letter-spacing: 0.05em;
    }

    /* 60秒プログレスタイマーバー */
    .ane-timer-wrap {
      width: 100%;
      max-width: 100%;
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: clamp(10px, 1.6vh, 18px);
    }

    .ane-timer-bar-track {
      flex: 1;
      height: clamp(4px, 0.6vh, 6px);
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
    }

    .ane-timer-bar-fill {
      height: 100%;
      background: var(--ane-accent);
      box-shadow: 0 0 8px var(--ane-accent);
      transition: width 1s linear, background-color 0.3s;
    }

    .ane-timer-bar-fill.urgent {
      background: #ff1a40 !important;
      box-shadow: 0 0 10px #ff1a40 !important;
      animation: aneUrgentPulse 0.4s infinite alternate;
    }

    @keyframes aneUrgentPulse {
      from { opacity: 0.6; }
      to { opacity: 1; }
    }

    .ane-timer-text {
      font-family: 'Impact', 'Arial Black', monospace;
      font-size: clamp(0.8rem, 1.1vw, 0.96rem);
      letter-spacing: 0.08em;
      color: #9292a8;
      min-width: 58px;
      text-align: right;
    }

    .ane-timer-text.urgent {
      color: #ff2b4d !important;
      font-weight: 900;
    }

    /* ========================================================
       ネームプレビュー表示領域 (5文字ボックス)
       ======================================================== */
    .ane-preview-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: clamp(10px, 1.8vh, 18px);
      width: 100%;
    }

    .ane-preview-label-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
      max-width: clamp(280px, 60%, 540px);
      padding: 0 4px;
      margin-bottom: 6px;
      font-size: clamp(0.68rem, 1vw, 0.82rem);
      font-weight: 800;
      letter-spacing: 0.1em;
      color: #8888a0;
    }

    .ane-char-counter {
      color: var(--ane-accent);
      font-family: monospace;
      font-weight: 900;
    }

    .ane-slots-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: clamp(8px, 1.8vw, 18px);
      width: 100%;
    }

    .ane-preview-box {
      width: clamp(52px, 8.5vw, 84px);
      height: clamp(58px, 8.8vh, 88px);
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.65);
      border: 2px solid rgba(255, 255, 255, 0.16);
      border-radius: clamp(8px, 1.2vw, 12px);
      position: relative;
      font-size: clamp(1.9rem, 3.8vw, 3rem);
      font-weight: 900;
      color: #ffffff;
      transition: all 0.15s ease;
    }

    .ane-preview-box.filled {
      border-color: rgba(255, 255, 255, 0.4);
      color: #ffffff;
    }

    .ane-preview-box.current {
      border-color: var(--ane-accent);
      background: rgba(0, 0, 0, 0.85);
      box-shadow: 0 0 16px var(--ane-glow), inset 0 0 10px var(--ane-glow);
    }

    /* 点滅アンダーバーキャレット */
    .ane-preview-box.current::after {
      content: '';
      position: absolute;
      bottom: clamp(6px, 1vh, 12px);
      width: clamp(24px, 4vw, 42px);
      height: clamp(3px, 0.5vh, 4px);
      background: var(--ane-accent);
      box-shadow: 0 0 8px var(--ane-accent);
      animation: aneCaretBlink 0.75s infinite alternate ease-in-out;
    }

    @keyframes aneCaretBlink {
      0% { opacity: 0.2; transform: scaleX(0.8); }
      100% { opacity: 1; transform: scaleX(1); }
    }

    /* ========================================================
       バーチャルキーボード グリッド
       ======================================================== */
    .ane-keyboard-container {
      display: flex;
      flex-direction: column;
      gap: clamp(4px, 0.8vh, 8px);
      width: 100%;
      max-width: 100%;
      margin-bottom: clamp(10px, 1.6vh, 18px);
      background: rgba(0, 0, 0, 0.4);
      padding: clamp(8px, 1.2vh, 14px) clamp(8px, 1.2vw, 14px);
      border-radius: clamp(8px, 1.2vw, 14px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .ane-kb-row {
      display: grid;
      grid-template-columns: repeat(10, 1fr);
      gap: clamp(4px, 0.7vw, 8px);
      width: 100%;
    }

    .ane-kb-row.ane-actions-row {
      grid-template-columns: repeat(5, 1fr);
      margin-top: clamp(2px, 0.4vh, 4px);
    }

    .ane-key {
      display: flex;
      align-items: center;
      justify-content: center;
      height: clamp(38px, 5.2vh, 56px);
      border-radius: clamp(5px, 0.8vw, 8px);
      border: 1.5px solid rgba(255, 255, 255, 0.14);
      background: rgba(255, 255, 255, 0.05);
      color: #d8d8ea;
      font-size: clamp(1.05rem, 1.8vw, 1.55rem);
      font-weight: 700;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      transition: all 0.12s cubic-bezier(0.2, 0.8, 0.2, 1);
      position: relative;
    }

    .ane-key:hover {
      background: rgba(255, 255, 255, 0.12);
      border-color: rgba(255, 255, 255, 0.35);
      transform: translateY(-1px);
    }

    .ane-key:active {
      transform: translateY(1px);
    }

    /* フォーカス中キー (レバー / 十字キー / ホバー選択) */
    .ane-key.active {
      border-color: var(--ane-accent) !important;
      background: var(--ane-accent) !important;
      color: #000000 !important;
      font-weight: 900;
      box-shadow: 0 0 16px var(--ane-glow), inset 0 0 8px rgba(255, 255, 255, 0.6);
      transform: scale(1.06);
      z-index: 2;
    }

    /* 機能キー（最下行） */
    .ane-act-key {
      height: clamp(42px, 5.8vh, 62px);
      flex-direction: column;
      gap: 2px;
      background: rgba(255, 255, 255, 0.08);
    }

    .ane-act-lbl {
      font-size: clamp(0.95rem, 1.7vw, 1.4rem);
      font-weight: 900;
      line-height: 1;
    }

    .ane-act-sub {
      font-size: clamp(0.58rem, 0.85vw, 0.78rem);
      font-weight: 800;
      letter-spacing: 0.06em;
      opacity: 0.75;
      line-height: 1;
    }

    /* 削除キー特有スタイル */
    .ane-act-backspace {
      color: #ff9999;
    }
    .ane-act-backspace.active {
      background: #ff3344 !important;
      border-color: #ff3344 !important;
      color: #ffffff !important;
      box-shadow: 0 0 18px rgba(255, 51, 68, 0.7) !important;
    }

    /* 決定キー特有スタイル */
    .ane-act-confirm {
      border-color: var(--ane-accent);
      background: rgba(255, 255, 255, 0.12);
      color: var(--ane-accent);
    }

    .ane-act-confirm.active {
      animation: aneConfirmKeyPulse 0.6s infinite alternate;
    }

    @keyframes aneConfirmKeyPulse {
      from { transform: scale(1.05); }
      to { transform: scale(1.10); }
    }

    /* ========================================================
       各ゲームテーマ (デザイン言語に完全準拠・絵文字不使用)
       ======================================================== */

    /* 1. ストリートビーボーイ */
    .ane-card.theme-street {
      --ane-accent: #ffe600;
      --ane-glow: rgba(255, 230, 0, 0.55);
      border: 2px solid #ffe600;
      font-family: 'Impact', 'Arial Black', sans-serif;
    }
    .theme-street .ane-rank-badge {
      background: #00f0ff;
      color: #000;
    }
    .theme-street .ane-title {
      color: #ffe600;
    }
    .theme-street .ane-score-val {
      color: #00f0ff;
    }

    /* 2. えんにち射的 (和風モダン・朱赤＆黄金) */
    .ane-card.theme-ennichi {
      --ane-accent: #ffcc00;
      --ane-glow: rgba(255, 204, 0, 0.5);
      border: 2px solid #ff3b30;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif;
    }
    .theme-ennichi .ane-rank-badge {
      background: #ff3b30;
      color: #fff;
    }
    .theme-ennichi .ane-title {
      font-weight: 900;
      color: #ffcc00;
    }
    .theme-ennichi .ane-score-val {
      color: #ffcc00;
    }

    /* 3. 極限ギリギリ選手権 (無骨ミリタリー・レッド＆イエロー) */
    .ane-card.theme-extreme {
      --ane-accent: #ff2b4d;
      --ane-glow: rgba(255, 43, 77, 0.6);
      border: 2px solid #ff2b4d;
      font-family: 'Impact', 'Arial Black', monospace;
    }
    .theme-extreme .ane-rank-badge {
      background: #ffff00;
      color: #000;
    }
    .theme-extreme .ane-title {
      color: #ff2b4d;
      letter-spacing: 0.12em;
    }
    .theme-extreme .ane-score-val {
      color: #ffff00;
    }

    /* 4. 単位増殖ラン (大学黒板・エメラルド＆チョークイエロー) */
    .ane-card.theme-tani {
      --ane-accent: #00e676;
      --ane-glow: rgba(0, 230, 118, 0.5);
      border: 2px solid #3d6a54;
      background: #0f1c15;
      font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif;
    }
    .theme-tani .ane-rank-badge {
      background: #3d6a54;
      color: #ffe600;
    }
    .theme-tani .ane-title {
      font-weight: 900;
      color: #ffe600;
    }
    .theme-tani .ane-score-val {
      color: #ffe600;
    }

    /* 5. ミッドナイト・スカイウェイ (サイバーシアン＆ネオンマゼンタ) */
    .ane-card.theme-skyway {
      --ane-accent: #00f0ff;
      --ane-glow: rgba(0, 240, 255, 0.55);
      border: 2px solid #00f0ff;
      font-family: 'Impact', 'Segoe UI', monospace;
      font-style: italic;
    }
    .theme-skyway .ane-rank-badge {
      background: #ff0055;
      color: #fff;
    }
    .theme-skyway .ane-title {
      color: #00f0ff;
    }
    .theme-skyway .ane-score-val {
      color: #ff0055;
    }

    /* 6. テンパレラン (放課後アンバーゴールド) */
    .ane-card.theme-corridor {
      --ane-accent: #ffb100;
      --ane-glow: rgba(255, 177, 0, 0.55);
      border: 2px solid #ffb100;
      font-family: 'Impact', system-ui, sans-serif;
    }
    .theme-corridor .ane-rank-badge {
      background: #ffb100;
      color: #000;
    }
    .theme-corridor .ane-title {
      color: #ffb100;
    }
    .theme-corridor .ane-score-val {
      color: #fff;
    }

    /* 登録完了演出レイヤー */
    .ane-completed-layer {
      position: absolute;
      inset: 0;
      background: rgba(8, 10, 18, 0.96);
      backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 100;
      border-radius: clamp(12px, 1.8vw, 18px);
      animation: aneCompleteFade 0.25s ease-out forwards;
      pointer-events: auto;
    }
    @keyframes aneCompleteFade {
      from { opacity: 0; transform: scale(0.95); }
      to { opacity: 1; transform: scale(1.0); }
    }
    .ane-complete-title {
      font-size: clamp(16px, 2.4vw, 24px);
      font-weight: 900;
      letter-spacing: clamp(4px, 0.8vw, 8px);
      color: var(--ane-accent, #00f0ff);
      text-shadow: 0 0 16px var(--ane-glow, rgba(0, 240, 255, 0.8));
      margin-bottom: clamp(10px, 1.8vh, 18px);
    }
    .ane-complete-name {
      font-size: clamp(38px, 6vw, 68px);
      font-weight: 900;
      letter-spacing: clamp(6px, 1.2vw, 14px);
      color: #ffffff;
      text-shadow: 0 0 24px rgba(255, 255, 255, 0.9);
    }
  `;
  document.head.appendChild(style);
}

/**
 * ネームエントリーを出す。delayMs を指定すると、その時間だけリザルト(スコアの数え上げ)を見せてから登録画面を出す。
 * 返す関数は、表示前なら予約の取り消し、表示後ならモーダルを閉じる。
 */
export function mountNameEntryModal(options: ArcadeNameEntryModalOptions): () => void {
  const delay = options.delayMs ?? 0;
  if (delay <= 0) return mountNow(options);
  let cancelNow: (() => void) | null = null;
  const timer = window.setTimeout(() => {
    cancelNow = mountNow(options);
  }, delay);
  return () => {
    window.clearTimeout(timer);
    cancelNow?.();
  };
}

/** 紙吹雪を降らせる。1回きり(約4秒)で、終わったら自分で消える。 */
function spawnConfetti(overlay: HTMLElement, accent: string): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ane-confetti';
  const colors = ['#ffd640', '#ffffff', '#ff5c8a', '#4de1ff', '#7dff9b', accent];
  const count = 80;
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('i');
    const w = 6 + Math.random() * 6;
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.setProperty('--w', `${w}px`);
    piece.style.setProperty('--h', `${w * (1.4 + Math.random())}px`);
    piece.style.setProperty('--c', colors[Math.floor(Math.random() * colors.length)]);
    piece.style.setProperty('--d', `${2.4 + Math.random() * 1.8}s`);
    piece.style.setProperty('--delay', `${Math.random() * 1.2}s`);
    piece.style.setProperty('--x', `${(Math.random() - 0.5) * 220}px`);
    piece.style.setProperty('--r', `${360 + Math.random() * 720}deg`);
    layer.appendChild(piece);
  }
  overlay.appendChild(layer);
  window.setTimeout(() => layer.remove(), 4800);
  return layer;
}

function mountNow(options: ArcadeNameEntryModalOptions): () => void {
  injectStyles();

  const overlay = document.createElement('div');
  overlay.className = 'ane-overlay ane-light';

  // キーボードグリッドHTMLの構築
  const keyboardHtml = `
    <div class="ane-keyboard-container">
      ${KEYBOARD_GRID.map((row, r) => `
        <div class="ane-kb-row">
          ${row.map((char, c) => `
            <div class="ane-key ane-char-key" data-row="${r}" data-col="${c}">${escapeHtml(char)}</div>
          `).join('')}
        </div>
      `).join('')}
      <div class="ane-kb-row ane-actions-row">
        ${ACTION_KEYS.map((act, c) => `
          <div class="ane-key ane-act-key ane-act-${act.id}" data-row="5" data-col="${c}">
            <span class="ane-act-lbl">${escapeHtml(act.label)}</span>
            <span class="ane-act-sub">${escapeHtml(act.subLabel)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // プレビューボックス（5文字）HTMLの構築
  const previewBoxesHtml = Array.from({ length: MAX_NAME_LENGTH }, (_, i) => `
    <div class="ane-preview-box" id="ane-pbox-${i}"></div>
  `).join('');

  overlay.innerHTML = `
    <div class="ane-card ${options.themeClass} ane-stage-ask">
      <div class="ane-corner tl"></div>
      <div class="ane-corner tr"></div>
      <div class="ane-corner bl"></div>
      <div class="ane-corner br"></div>

      <div class="ane-header">
        <span class="ane-rank-badge">${escapeHtml(options.rankDisplay)}</span>
        <div class="ane-title">${escapeHtml(options.title)}</div>
      </div>

      <div class="ane-score-panel">
        <span class="ane-score-label">最終スコア</span>
        <span class="ane-score-val">${escapeHtml(options.scoreDisplay)}</span>
      </div>

      <div class="ane-timer-wrap">
        <div class="ane-timer-bar-track">
          <div class="ane-timer-bar-fill" id="ane-timer-bar" style="width: 100%;"></div>
        </div>
        <div class="ane-timer-text" id="ane-timer-val">残り 60秒</div>
      </div>

      <div class="ane-preview-wrap">
        <div class="ane-preview-label-row">
          <span>登録名（5文字以内）</span>
          <span class="ane-char-counter" id="ane-counter">0 / 5 文字</span>
        </div>
        <div class="ane-slots-row">
          ${previewBoxesHtml}
        </div>
      </div>

      ${keyboardHtml}

      <div class="ane-ask">
        <svg class="ane-ask-trophy" viewBox="0 0 64 64" aria-hidden="true">
          <defs>
            <linearGradient id="aneTrophyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff2a8" />
              <stop offset="0.55" stop-color="#ffd640" />
              <stop offset="1" stop-color="#d9981c" />
            </linearGradient>
          </defs>
          <path d="M16 8h32v14c0 10-6.5 17-16 17S16 32 16 22z" fill="url(#aneTrophyGrad)" stroke="#8a5a0c" stroke-width="2" stroke-linejoin="round" />
          <path d="M16 12H8c0 9 3.5 14 10 15M48 12h8c0 9-3.5 14-10 15" fill="none" stroke="#e8b02a" stroke-width="4" stroke-linecap="round" />
          <path d="M28 39h8v8h-8z" fill="#e8b02a" stroke="#8a5a0c" stroke-width="2" stroke-linejoin="round" />
          <path d="M20 47h24l3 9H17z" fill="url(#aneTrophyGrad)" stroke="#8a5a0c" stroke-width="2" stroke-linejoin="round" />
          <path d="M22 13c0 8 2 13 6 16" fill="none" stroke="#fff" stroke-opacity="0.7" stroke-width="2.5" stroke-linecap="round" />
        </svg>
        <div class="ane-ask-headline">${escapeHtml(options.rankDisplay)}にランクイン</div>
        <div class="ane-ask-score"><span>最終スコア</span>${escapeHtml(options.scoreDisplay)}</div>
        <div class="ane-ask-text">記録に名前を残しますか？</div>
        <div class="ane-ask-menu">
          <button type="button" id="ane-ask-yes" tabindex="-1">名前を入力する</button>
          <button type="button" id="ane-ask-no" tabindex="-1">おまかせで登録</button>
        </div>
      </div>

      <div class="ane-completed-layer" id="ane-complete-layer" style="display: none;">
        <div class="ane-complete-title">登録完了</div>
        <div class="ane-complete-name" id="ane-complete-name-val"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const card = overlay.querySelector<HTMLElement>('.ane-card')!;
  const accent = getComputedStyle(card).getPropertyValue('--ane-accent').trim() || '#00f0ff';
  const confetti = spawnConfetti(overlay, accent);
  playArcadeFanfare();

  const timerBarEl = document.getElementById('ane-timer-bar');
  const timerTextEl = document.getElementById('ane-timer-val');
  const counterEl = document.getElementById('ane-counter');

  let prevActiveKeyEl: HTMLElement | null = null;

  const updateView = (state: NameEntryState) => {
    // 1. ネームプレビューボックスの更新
    const chars = Array.from(state.name);
    for (let i = 0; i < MAX_NAME_LENGTH; i++) {
      const box = document.getElementById(`ane-pbox-${i}`);
      if (!box) continue;
      const char = chars[i] ?? '';
      box.textContent = char;
      box.classList.toggle('filled', char.length > 0);
      // 入力待ちカーソル位置（文字数がi、もしくは満杯なら末尾の次）
      const isCurrent = (i === chars.length && chars.length < MAX_NAME_LENGTH) || (chars.length === MAX_NAME_LENGTH && i === MAX_NAME_LENGTH - 1);
      box.classList.toggle('current', isCurrent);
    }

    if (counterEl) {
      counterEl.textContent = `${chars.length} / ${MAX_NAME_LENGTH} 文字`;
    }

    // 2. キーボードのアクティブキー更新
    if (prevActiveKeyEl) {
      prevActiveKeyEl.classList.remove('active');
    }
    const currentKeyEl = overlay.querySelector<HTMLElement>(
      `.ane-key[data-row="${state.cursorRow}"][data-col="${state.cursorCol}"]`
    );
    if (currentKeyEl) {
      currentKeyEl.classList.add('active');
      prevActiveKeyEl = currentKeyEl;
    }

    // 3. タイマー更新 (60秒基準)
    if (timerBarEl) {
      const pct = Math.max(0, Math.min(100, (state.timeRemaining / 60) * 100));
      timerBarEl.style.width = `${pct}%`;
      timerBarEl.classList.toggle('urgent', state.timeRemaining <= 15);
    }
    if (timerTextEl) {
      timerTextEl.textContent = `残り ${state.timeRemaining}秒`;
      timerTextEl.classList.toggle('urgent', state.timeRemaining <= 15);
    }
  };

  let isFinishing = false;
  const finishAndSubmit = async (name: string) => {
    if (isFinishing) return;
    isFinishing = true;

    core?.destroy();

    const completeLayer = document.getElementById('ane-complete-layer');
    const completeTitleEl = completeLayer?.querySelector<HTMLElement>('.ane-complete-title');
    const completeNameEl = document.getElementById('ane-complete-name-val');
    if (completeLayer && completeNameEl) {
      completeNameEl.textContent = name;
      completeLayer.style.display = 'flex';
    }

    // 通信の完了と最低限のアニメーション表示(850ms)の両方を待つ。
    // 通信中に画面遷移(iframeの破棄)が起きてWebKit/Safari等でリクエストが強制切断されるのを防ぐ。
    const minWait = new Promise((resolve) => window.setTimeout(resolve, 850));
    try {
      const [, res] = await Promise.all([minWait, Promise.resolve(options.onComplete(name))]);
      // 同時に他のプレイヤーが登録して枠外に押し出された場合(rank <= 0)のフィードバック
      if (res && typeof res === 'object' && 'rank' in res && (res as { rank: number }).rank <= 0) {
        if (completeTitleEl) completeTitleEl.textContent = '枠外となりました';
        await new Promise((resolve) => window.setTimeout(resolve, 800));
      }
    } catch (e) {
      console.warn('Name entry onComplete error:', e);
    } finally {
      cleanup();
    }
  };

  let core: ArcadeNameEntryCore | null = null;

  // マウス/タッチ操作: 各キーをクリック/タップしたらそのキーを実行
  const allKeys = overlay.querySelectorAll<HTMLElement>('.ane-key');
  allKeys.forEach((keyEl) => {
    keyEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!core) return;
      const row = parseInt(keyEl.getAttribute('data-row') ?? '0', 10);
      const col = parseInt(keyEl.getAttribute('data-col') ?? '0', 10);
      core.setCursor(row, col);
      core.triggerKey(row, col);
    });
  });

  // --- 最初の確認: 名前を入力するか、おまかせ(ランダム名)にするか ---
  const askYes = document.getElementById('ane-ask-yes');
  const askNo = document.getElementById('ane-ask-no');
  const askItems = [
    { button: askYes, color: accent },
    { button: askNo, color: '#39ff88' },
  ];
  let askFocus = 0;
  let askOpen = true;
  const askArmTime = performance.now() + 500; // 直前まで連打していたボタンで決定しない
  const askArmed = () => performance.now() >= askArmTime;
  setupResultMenu(overlay.querySelector<HTMLElement>('.ane-ask-menu'), askItems);
  const refreshAsk = () => applyResultMenuFocus(askItems, askFocus);

  let stopAskPad: (() => void) | null = null;
  let askAutoTimer = 0;
  let inputStartTimer = 0;
  const closeAsk = () => {
    askOpen = false;
    window.removeEventListener('keydown', onAskKey, true);
    stopAskPad?.();
    stopAskPad = null;
    window.clearInterval(askAutoTimer);
  };

  const chooseInput = () => {
    if (!askOpen) return;
    closeAsk();
    // 決定に使ったキー/ボタンが、そのままキーボードの最初の文字に入らないよう少し待つ
    inputStartTimer = window.setTimeout(() => {
      card.classList.remove('ane-stage-ask');
      card.classList.add('ane-stage-input');
      overlay.classList.remove('ane-light');
      core = new ArcadeNameEntryCore(
        { onChange: (state) => updateView(state), onConfirm: (name) => finishAndSubmit(name) },
        { initialName: options.initialName, timeLimitSec: 60 },
      );
    }, 250);
  };
  const chooseRandom = () => {
    if (!askOpen) return;
    closeAsk();
    // おまかせのときはキーボードを出さず、そのまま登録完了を見せる
    card.classList.remove('ane-stage-ask');
    card.classList.add('ane-stage-skip');
    finishAndSubmit(randomArcadeName());
  };
  const confirmAsk = () => (askFocus === 0 ? chooseInput() : chooseRandom());
  const moveAsk = (dir: number) => {
    askFocus = (askFocus + dir + askItems.length) % askItems.length;
    refreshAsk();
  };

  function onAskKey(e: KeyboardEvent): void {
    if (!askOpen) return;
    const dir = MenuNav.keyDir(e.code);
    if (dir !== 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat) moveAsk(dir);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!e.repeat && askArmed()) confirmAsk();
    }
  }
  window.addEventListener('keydown', onAskKey, true);

  const askPadEdge = new PadEdge();
  stopAskPad = startPadLoop(askPadEdge, (p) => {
    if (!askOpen) return;
    if (p.up || p.left) moveAsk(-1);
    else if (p.down || p.right) moveAsk(1);
    else if (!askArmed()) return;
    else if (p.any(0)) confirmAsk();
    else if (p.any(1)) chooseRandom();
  });

  askItems.forEach(({ button }, i) => {
    button?.addEventListener('mouseenter', () => {
      if (askFocus === i) return;
      askFocus = i;
      refreshAsk();
    });
    button?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!askArmed()) return;
      askFocus = i;
      confirmAsk();
    });
  });
  refreshAsk();

  // 放置されたら、おまかせで登録する。残り時間はボタンに出す
  const ASK_AUTO_SEC = 20;
  const askOpenedAt = performance.now();
  const updateAskCountdown = () => {
    const remain = ASK_AUTO_SEC - (performance.now() - askOpenedAt) / 1000;
    if (remain <= 0) return chooseRandom();
    setButtonSuffix(askNo, formatSeconds(remain));
  };
  updateAskCountdown();
  askAutoTimer = window.setInterval(updateAskCountdown, 250);

  const cleanup = () => {
    closeAsk();
    window.clearTimeout(inputStartTimer);
    confetti.remove();
    core?.destroy();
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
  };

  return cleanup;
}

export interface HighScoreEntryFlowOptions {
  slug: string;
  score: number;
  variantId?: string;
  /** 名前入力の見出し・スコア表示・テーマ・待ち時間(順位と完了時の処理はこの関数が足す) */
  modal: Omit<ArcadeNameEntryModalOptions, 'rankDisplay' | 'onComplete'>;
  /** 順位の確認中と名前入力中は true、それ以外は false。結果画面の操作を止めるために使う */
  setBlocked: (blocked: boolean) => void;
  /** 名前が決まったとき(ランキングへの登録はここで行う)。Promise を返すと通信完了まで操作ブロックを維持する */
  onName: (name: string) => Promise<unknown> | void;
  /** 名前入力が閉じたあと(操作の受付を戻した後)。決定ボタンの誤爆防止の待ちなどに使う */
  onClosed?: () => void;
}

/**
 * 結果画面の「順位の確認 → 上位に入っていれば名前入力 → 登録」の流れ。
 * 順位の確認はサーバーへの問い合わせなので、終わるまでは結果画面の操作を止める(setBlocked)。
 * 上位に入らない・通信に失敗したときは、名前入力を出さずに操作を戻す。
 *
 * 止めている間(順位の確認中・名前入力が出るまでの待ち・名前入力中)は、見えないシールド(inputShield.ts)で画面全体を覆い、
 * マウスのクリックが結果画面のボタンへ届かないようにする。キーボード・パッドは setBlocked を見る各ゲームの処理で止める。
 * 返す関数で、この流れを取り消せる(結果画面を離れるとき用。予約した名前入力を出さず、止めていた操作とシールドを戻す)。
 */
export function runHighScoreEntryFlow(options: HighScoreEntryFlowOptions): () => void {
  const { slug, score, variantId, modal, setBlocked, onName, onClosed } = options;
  return runEntryFlow(
    {
      check: () => checkHighScore(slug, score, variantId),
      showShield: showInputShield,
      mountModal: ({ rank, onComplete }) => mountNameEntryModal({ ...modal, rankDisplay: `第${rank}位`, onComplete }),
    },
    { setBlocked, onName, onClosed },
  );
}
