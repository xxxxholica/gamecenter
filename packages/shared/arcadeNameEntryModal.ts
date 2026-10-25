// アーケード用 カタカナ5文字ネームエントリー バーチャルキーボード共通モーダルUI
// 洗練されたアーケードキャビネット・ソフトキーボード式ネームエントリー
// 見た目・配色・フォント・文言は各ゲームのテーマクラスで独自UI設計に完全準拠する（絵文字不使用）

import { playArcadeFanfare } from './arcadeFanfare';
import {
  MAX_NAME_LENGTH,
  KEYBOARD_GRID,
  ACTION_KEYS,
  ACTION_ROW,
  FOOTER_ROW,
  ArcadeNameEntryCore,
  NameEntryState,
} from './arcadeNameEntryCore';
import { checkHighScore, escapeHtml, reserveAnonName, releaseAnonName } from './arcadeLeaderboard';
import { showInputShield } from './inputShield';
import { runEntryFlow } from './highScoreEntryFlowCore';
import { reportDeepAnalytics, reportPhase } from './arcadeAnalytics';
import { leaderboardSaveFeedback, type SaveLeaderboardResult } from './arcadeLeaderboardResult';

/** リザルトでスコアを見せてから登録画面を出すまでの待ち時間 */
export const NAME_ENTRY_AFTER_RESULT_MS = 2200;

/** 放置の時間切れ(秒)。登録ボタンに残り秒数を出す。何も操作しないまま過ぎたら、入力済みの名前(なければ匿名)で登録して閉じる。操作のたびに数え直す */
const NAME_ENTRY_TIME_LIMIT_SEC = 20;

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
  onComplete: (name: string) => Promise<SaveLeaderboardResult>;
  /** 保存結果を見せてウィンドウを閉じたあと、結果画面の操作を戻す。 */
  onClosed?: () => void;
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
      justify-content: center;
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
      grid-template-columns: repeat(4, 1fr);
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
      max-width: 90%;
      text-align: center;
      line-height: 1.5;
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
    .ane-complete-message {
      max-width: 90%;
      margin: 16px 12px 0;
      font-size: clamp(14px, 2vw, 18px);
      line-height: 1.6;
      color: #333;
      text-align: center;
    }

    /* ========================================================
       Windows 7(Aero)風。全ゲーム共通で、各テーマの色は使わずここで上書きする
       ======================================================== */
    .ane-overlay {
      --w-pop: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
      --w-btn: linear-gradient(#f2f2f2 0 49%, #ebebeb 50% 51%, #dddddd 52%, #cfcfcf);
      --w-btn-hover: linear-gradient(#eaf6fd 0 49%, #d9f0fc 50% 51%, #bee6fd 52%, #a7d9f5);
      --w-btn-sel: linear-gradient(#e5f4fc 0 49%, #c4e5f6 50% 51%, #98d1ef 52%, #68b3db);
      --w-blue-bar: linear-gradient(#5b9bd9, #1f5fa8);
      font-family: var(--w-pop);
    }
    .ane-overlay, .ane-overlay * { font-family: var(--w-pop) !important; font-weight: 700 !important; letter-spacing: 0.04em; }
    .ane-overlay { background: rgba(0, 0, 0, 0.4); backdrop-filter: none; }
    .ane-overlay.ane-light { background: rgba(0, 0, 0, 0.28); }

    /* ガラス風のウィンドウ枠(中身は白い領域を ::before で敷く) */
    .ane-overlay .ane-card.ane-card {
      --ane-accent: #1f5fa8;
      --ane-glow: rgba(51, 153, 255, 0.5);
      isolation: isolate;
      background: linear-gradient(135deg, rgba(196, 220, 245, 0.9), rgba(122, 168, 220, 0.88) 55%, rgba(176, 208, 240, 0.9));
      backdrop-filter: blur(10px);
      color: #111;
      border: 1px solid rgba(0, 0, 0, 0.72);
      border-radius: 8px;
      padding: 4px 20px 20px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6), 0 10px 32px rgba(0, 0, 0, 0.65);
    }
    .ane-overlay .ane-card::before {
      content: '';
      position: absolute;
      left: 8px; right: 8px; bottom: 8px; top: 34px;
      background: #f0f0f0;
      border: 1px solid #7d8fa8;
      box-shadow: inset 0 0 0 1px #fff;
      z-index: -1;
    }
    .ane-overlay .ane-corner { display: none; }
    /* 入力画面は、順位・タイトル・スコアの表示をやめる(案内は、タイトルバーに「名前を入力してください」と出す) */
    .ane-overlay .ane-header, .ane-overlay .ane-score-panel { display: none; }

    /* タイトルバー */
    .ane-titlebar {
      align-self: stretch;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      height: 30px;
      margin: 0 -20px 14px;
      padding: 6px 8px 0 12px;
      color: #000;
      font-size: 14px;
      text-shadow: 0 0 8px #fff, 0 0 8px #fff, 0 0 4px #fff;
      text-align: left;
    }
    .ane-titlebar-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ane-titlebar-close {
      flex: none;
      width: 44px;
      height: 19px;
      margin: -6px 0 0;
      display: flex; align-items: center; justify-content: center;
      background: linear-gradient(#e9a898 0 48%, #c64a3c 50%, #b01a14 52%, #d8573a);
      border: 1px solid #5d1a1a;
      border-top: 0;
      border-radius: 0 0 5px 5px;
      color: #fff;
      font-size: 13px;
      line-height: 1;
      text-shadow: 0 0 3px #400;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.45);
      pointer-events: none;
    }

    /* 入力画面の見出し・スコア */
    .ane-overlay .ane-rank-badge { background: linear-gradient(#5b9bd9, #1f5fa8) !important; color: #fff !important; border-radius: 3px; border: 0 !important; }
    .ane-overlay .ane-title { color: #1b3f73 !important; text-shadow: none !important; }
    .ane-overlay .ane-score-panel { background: #fff; border: 1px solid #b5bfcc; border-radius: 3px; }
    .ane-overlay .ane-score-label { color: #333; opacity: 1; }
    .ane-overlay .ane-score-val { color: #111 !important; text-shadow: none !important; }

    
    
    
    
    

    /* 名前の入力枠 */
    .ane-overlay .ane-preview-label-row { color: #222; }
    .ane-overlay .ane-char-counter { color: #1f5fa8; }
    .ane-overlay .ane-preview-box { background: #fff; color: #111; border: 1px solid #abadb3; border-top-color: #5e6a7d; border-radius: 3px; box-shadow: none; }
    .ane-overlay .ane-preview-box.filled { color: #111; border-color: #abadb3; border-top-color: #5e6a7d; }
    .ane-overlay .ane-preview-box.current { background: #fff; border-color: #3399ff; box-shadow: 0 0 6px rgba(51, 153, 255, 0.7); }
    .ane-overlay .ane-preview-box.current::after { background: #3399ff; box-shadow: none; }

    /* キーボード(光沢ボタン。カーソル位置は青) */
    .ane-overlay .ane-keyboard-container { background: transparent; border: 0; padding: 0; }
    .ane-overlay .ane-key {
      background: var(--w-btn); color: #111; border: 1px solid #707070; border-radius: 3px;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.75);
      transform: none; transition: none;
    }
    .ane-overlay .ane-key:hover { background: var(--w-btn-hover); border-color: #3c7fb1; transform: none; }
    .ane-overlay .ane-key:active { background: linear-gradient(#e5f4fc, #c4e5f6 50%, #98d1ef); border-color: #2c628b; transform: none; }
    .ane-overlay .ane-key.active {
      background: var(--w-btn-sel) !important; color: #000 !important; border-color: #2c628b !important;
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7), 0 0 8px rgba(51, 153, 255, 0.9) !important;
      transform: none; animation: none;
    }
    .ane-overlay .ane-act-key, .ane-overlay .ane-act-confirm { background: var(--w-btn); color: #111; border: 1px solid #707070; }
    .ane-overlay .ane-act-backspace { color: #111; }
    .ane-overlay .ane-act-backspace.active, .ane-overlay .ane-act-confirm.active { background: var(--w-btn-sel) !important; color: #000 !important; border-color: #2c628b !important; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7), 0 0 8px rgba(51, 153, 255, 0.9) !important; }
    .ane-overlay .ane-act-sub { opacity: 0.85; }

    /* 確認画面 */
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    

    
    
    
    

    /* 登録完了 */
    /* 白い面の中だけに出し、ウィンドウ枠・タイトルバーは残す */
    .ane-overlay .ane-completed-layer { inset: 34px 8px 8px 8px; background: #f0f0f0; backdrop-filter: none; border-radius: 0; border: 1px solid #7d8fa8; box-shadow: inset 0 0 0 1px #fff; }
    .ane-overlay .ane-complete-title { color: #1b3f73; text-shadow: none; }
    .ane-overlay .ane-complete-name { color: #111; text-shadow: none; }

    
    .ane-overlay .ane-complete-name { -webkit-text-stroke: 4px #fff; paint-order: stroke fill; text-shadow: 0 2px 3px rgba(0, 20, 60, 0.35); }
    
    
    
    
    
    
    /* 選択中の青いキー(黒い文字)は白縁のまま、タイトルバーは白い光を足す */
    .ane-overlay .ane-titlebar-text { text-shadow: 0 0 8px #fff, 0 0 8px #fff, 0 1px 2px rgba(0, 20, 60, 0.35); }
    .ane-overlay .ane-preview-box { -webkit-text-stroke: 0; text-shadow: none; }

    /* 文字の可読性: 縁取り(stroke を塗りの下に敷く)と影で、どの背景の上でも読めるようにする */
    .ane-overlay .ane-titlebar-text,
    .ane-overlay .ane-complete-title,
    .ane-overlay .ane-key,
    .ane-overlay .ane-act-lbl,
    .ane-overlay .ane-act-sub {
      -webkit-text-stroke: 3px #fff;
      paint-order: stroke fill;
      text-shadow: 0 1px 2px rgba(0, 20, 60, 0.35);
    }
    .ane-overlay .ane-preview-box { -webkit-text-stroke: 0; text-shadow: none; }

    
    
    
    
    

    /* フッター: キャンセル(赤)と決定(緑)を1行に並べる */
    .ane-overlay .ane-card.ane-card { width: min(94vw, 760px); }
    /* 名前の枠の左のメダル */
    .ane-overlay .ane-medal { flex: none; height: clamp(58px, 8.8vh, 88px); width: auto; margin-right: clamp(2px, 1vw, 12px); filter: drop-shadow(0 2px 3px rgba(0, 0, 0, 0.4)); }
    /* 何も入力していない間、枠に薄く見える匿名名 */
    .ane-overlay .ane-preview-box.ghost { color: #aab2c0; }
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    
    .ane-overlay .ane-footer { display: flex; gap: clamp(10px, 2.4vw, 22px); width: 100%; margin-top: clamp(8px, 1.6vh, 16px); }
    .ane-overlay .ane-foot-key { flex: 1 1 0; transition: background 0.15s; height: clamp(40px, 6.4vh, 58px); font-size: clamp(16px, 2.8vh, 22px); letter-spacing: 0.1em; }
    .ane-overlay .ane-foot-key.ane-foot-anon { background: linear-gradient(#e8786c 0 49%, #c4281c 50% 51%, #9c160c 52%, #bd2a1e); border-color: #5a0f0a; }
    .ane-overlay .ane-foot-key.ane-foot-confirm { background: linear-gradient(#6fcf66 0 49%, #23921e 50% 51%, #146a14 52%, #1f8a1c); border-color: #0e4614; }
    .ane-overlay .ane-foot-key.ane-foot-anon, .ane-overlay .ane-foot-key.ane-foot-confirm { color: #fff; -webkit-text-stroke: 0; text-shadow: 0 1px 0 #3a0905, 0 -1px 0 #3a0905, 1px 0 0 #3a0905, -1px 0 0 #3a0905, 0 2px 3px rgba(0, 0, 0, 0.6); filter: saturate(0.85) brightness(0.92); }
    .ane-overlay .ane-foot-key.ane-foot-confirm { text-shadow: 0 1px 0 #072a0a, 0 -1px 0 #072a0a, 1px 0 0 #072a0a, -1px 0 0 #072a0a, 0 2px 3px rgba(0, 0, 0, 0.6); }
    .ane-overlay .ane-foot-key.ane-foot-anon:hover { background: linear-gradient(#e8786c 0 49%, #c4281c 50% 51%, #9c160c 52%, #bd2a1e); border-color: #5a0f0a; }
    .ane-overlay .ane-foot-key.ane-foot-confirm:hover { background: linear-gradient(#6fcf66 0 49%, #23921e 50% 51%, #146a14 52%, #1f8a1c); border-color: #0e4614; }
    .ane-overlay .ane-foot-key.ane-foot-anon.active { background: linear-gradient(#e8786c 0 49%, #c4281c 50% 51%, #9c160c 52%, #bd2a1e) !important; color: #fff !important; filter: none; border-color: #ff6a5c !important; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85), 0 0 14px rgba(255, 70, 55, 0.95) !important; }
    .ane-overlay .ane-foot-key.ane-foot-confirm.active { background: linear-gradient(#6fcf66 0 49%, #23921e 50% 51%, #146a14 52%, #1f8a1c) !important; color: #fff !important; filter: none; border-color: #5ae04e !important; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.85), 0 0 14px rgba(70, 230, 60, 0.95) !important; }
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
  reportPhase('name_entry');
  const openedAt = performance.now();

  const overlay = document.createElement('div');
  overlay.className = 'ane-overlay';


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
          <div class="ane-key ane-act-key ane-act-${act.id}" data-row="${ACTION_ROW}" data-col="${c}">
            <span class="ane-act-lbl">${escapeHtml(act.label)}</span>
            <span class="ane-act-sub">${escapeHtml(act.subLabel)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // 名前の枠の左に置くメダル(順位で色が変わる: 1位=金、2位=銀、3位=銅、4位以降=鋼)
  const rankNum = parseInt(/\d+/.exec(options.rankDisplay)?.[0] ?? '', 10);
  const medalTones = rankNum === 1
    ? ['#fff4b0', '#f5b800', '#b87800', '#7a4e00']
    : rankNum === 2
      ? ['#ffffff', '#c3ccd9', '#8a96a8', '#4d5a6e']
      : rankNum === 3
        ? ['#ffd9b5', '#e0883a', '#a85a1c', '#6a3408']
        : ['#e6f0fb', '#8fb3dc', '#5683b6', '#2e5280'];
  const crownHtml = `
    <svg class="ane-medal ane-crown" viewBox="0 0 80 80" aria-hidden="true">
      <defs>
        <linearGradient id="aneCrownFace" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stop-color="#fff4b0" />
          <stop offset="0.5" stop-color="#f5b800" />
          <stop offset="1" stop-color="#b87800" />
        </linearGradient>
      </defs>
      <path d="M8 62L8 26L25 42L40 14L55 42L72 26L72 62Z" fill="url(#aneCrownFace)" stroke="#7a4e00" stroke-width="3" stroke-linejoin="round" />
      <rect x="8" y="56" width="64" height="12" rx="3" fill="#d99a00" stroke="#7a4e00" stroke-width="3" />
      <circle cx="8" cy="24" r="5" fill="#d8352a" stroke="#6e1610" stroke-width="2" />
      <circle cx="40" cy="12" r="6" fill="#2f6fd0" stroke="#12356e" stroke-width="2" />
      <circle cx="72" cy="24" r="5" fill="#d8352a" stroke="#6e1610" stroke-width="2" />
      <circle cx="26" cy="62" r="3" fill="#fff" fill-opacity="0.9" />
      <circle cx="40" cy="62" r="3.5" fill="#d8352a" stroke="#6e1610" stroke-width="1" />
      <circle cx="54" cy="62" r="3" fill="#fff" fill-opacity="0.9" />
      <path d="M16 34L22 46M34 30L38 22" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="3" stroke-linecap="round" />
    </svg>
  `;
  const medalHtml = `
    <svg class="ane-medal" viewBox="0 0 64 80" aria-hidden="true">
      <defs>
        <linearGradient id="aneMedalFace" x1="0.2" y1="0" x2="0.8" y2="1">
          <stop offset="0" stop-color="${medalTones[0]}" />
          <stop offset="0.5" stop-color="${medalTones[1]}" />
          <stop offset="1" stop-color="${medalTones[2]}" />
        </linearGradient>
      </defs>
      <path d="M14 2h14l10 30H24z" fill="#d8352a" stroke="#6e1610" stroke-width="2" stroke-linejoin="round" />
      <path d="M50 2H36L26 32h14z" fill="#2f6fd0" stroke="#12356e" stroke-width="2" stroke-linejoin="round" />
      <circle cx="32" cy="52" r="23" fill="url(#aneMedalFace)" stroke="${medalTones[3]}" stroke-width="3" />
      <circle cx="32" cy="52" r="17" fill="none" stroke="${medalTones[3]}" stroke-opacity="0.45" stroke-width="2" />
      <path d="M18 44c4-8 12-11 20-9" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="3" stroke-linecap="round" />
      ${Number.isFinite(rankNum) ? `<text x="32" y="62" text-anchor="middle" font-size="26" font-weight="900" fill="${medalTones[3]}" stroke="#fff" stroke-opacity="0.55" stroke-width="1" paint-order="stroke">${rankNum}</text>` : ''}
    </svg>
  `;

  // プレビューボックス（5文字）HTMLの構築
  const previewBoxesHtml = Array.from({ length: MAX_NAME_LENGTH }, (_, i) => `
    <div class="ane-preview-box" id="ane-pbox-${i}"></div>
  `).join('');

  overlay.innerHTML = `
    <div class="ane-card ${options.themeClass}">
      <div class="ane-titlebar" aria-hidden="true"><span class="ane-titlebar-text">ランキングに名前を残しましょう</span><span class="ane-titlebar-close">×</span></div>

      <div class="ane-preview-wrap">
        <div class="ane-slots-row">
          ${rankNum === 1 ? crownHtml : medalHtml}
          ${previewBoxesHtml}
        </div>
      </div>

      ${keyboardHtml}

      <div class="ane-footer">
        <div class="ane-key ane-foot-key ane-foot-anon" id="ane-foot-key" data-row="${FOOTER_ROW}" data-col="0">匿名 で登録</div>
      </div>

      <div class="ane-completed-layer" id="ane-complete-layer" style="display: none;">
        <div class="ane-complete-title" role="status">登録中…</div>
        <div class="ane-complete-name" id="ane-complete-name-val"></div>
        <div class="ane-complete-message" id="ane-complete-message"></div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const card = overlay.querySelector<HTMLElement>('.ane-card')!;
  const accent = getComputedStyle(card).getPropertyValue('--ane-accent').trim() || '#00f0ff';
  const confetti = spawnConfetti(overlay, accent);
  playArcadeFanfare();

  // 登録ウィンドウを出したときに匿名名を予約する。キャンセル・空のまま確定・時間切れのときは、予約した匿名名で登録する。
  // 使われないまま閉じた(予約の札が登録に使われなかった)ときは破棄する。
  let anon = null as { token: string; name: string } | null;
  let submitted = false;
  let cleaned = false;
  const anonReady = reserveAnonName().then((r) => {
    anon = r;
    if (r && cleaned) releaseAnonName(r.token);   // 予約が返る前に閉じられていた
    else if (r) updateView(core.state);           // 薄く見せる匿名名と、ボタン・バーの文言を更新する
    return r;
  });
  const onPageHide = () => { if (anon && !submitted) releaseAnonName(anon.token); };
  window.addEventListener('pagehide', onPageHide);

  const footKeyEl = document.getElementById('ane-foot-key');

  let prevActiveKeyEl: HTMLElement | null = null;

  const updateView = (state: NameEntryState) => {
    // 登録される名前: 入力があればそれ、なければ(薄く見せている)予約した匿名名
    const typed = state.name.trim();
    const anonName = (anon as { name: string } | null)?.name ?? '匿名';
    const registerName = typed || anonName;

    // 1. ネームプレビューボックスの更新(何も入力していない間は、匿名名を薄く見せる)
    const chars = Array.from(state.name);
    const ghost = typed ? [] : Array.from(anonName).slice(0, MAX_NAME_LENGTH);
    for (let i = 0; i < MAX_NAME_LENGTH; i++) {
      const box = document.getElementById(`ane-pbox-${i}`);
      if (!box) continue;
      const char = chars[i] ?? ghost[i] ?? '';
      box.textContent = char;
      box.classList.toggle('filled', (chars[i] ?? '').length > 0);
      box.classList.toggle('ghost', !typed && !!ghost[i]);
      // 入力待ちカーソル位置（文字数がi、もしくは満杯なら末尾の次）
      const isCurrent = (i === chars.length && chars.length < MAX_NAME_LENGTH) || (chars.length === MAX_NAME_LENGTH && i === MAX_NAME_LENGTH - 1);
      box.classList.toggle('current', isCurrent);
    }

    // 2. 登録ボタン: いつも「何で登録されるか」を書く(匿名=赤、入力した名前=緑)
    if (footKeyEl) {
      footKeyEl.textContent = `${registerName} で登録 (${state.timeRemaining}秒)`;
      footKeyEl.classList.toggle('ane-foot-anon', !typed);
      footKeyEl.classList.toggle('ane-foot-confirm', !!typed);
    }

    // 3. キーボード・フッターのアクティブキー更新
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
  };

  let isFinishing = false;
  const finishAndSubmit = async (name: string, isAnon = false) => {
    if (isFinishing) return;
    isFinishing = true;
    submitted = true;
    reportDeepAnalytics('name_entry_done', { anon: isAnon, sec: Math.round((performance.now() - openedAt) / 100) / 10 });

    core.destroy();

    const completeLayer = document.getElementById('ane-complete-layer');
    const completeTitleEl = completeLayer?.querySelector<HTMLElement>('.ane-complete-title');
    const completeNameEl = document.getElementById('ane-complete-name-val');
    const completeMessageEl = document.getElementById('ane-complete-message');
    if (isAnon) {
      // 匿名は完了表示を出さず、ウィンドウを消して登録だけ済ませる
      confetti.remove();
      overlay.style.display = 'none';
    } else if (completeLayer && completeNameEl) {
      completeNameEl.textContent = name;
      completeLayer.style.display = 'flex';
    }

    const showResult = async (result: SaveLeaderboardResult) => {
      if (cleaned || (isAnon && result.status === 'saved')) return;
      const feedback = leaderboardSaveFeedback(result);
      // 匿名登録でも、失敗したときは理由を見せる。
      overlay.style.display = '';
      if (completeLayer) completeLayer.style.display = 'flex';
      if (completeTitleEl) completeTitleEl.textContent = feedback.title;
      if (completeNameEl) completeNameEl.textContent = name;
      if (completeMessageEl) completeMessageEl.textContent = feedback.message;
      if (result.status !== 'saved') confetti.remove();
      await new Promise((resolve) => window.setTimeout(resolve, result.status === 'saved' ? 850 : 2500));
    };
    try {
      await showResult(await options.onComplete(name));
    } catch (e) {
      console.warn('Name entry onComplete error:', e);
      await showResult({ status: 'error', error: 'network_error', rank: -1, list: [] });
    } finally {
      cleanup();
    }
  };

  /** 薄く見せていた匿名名を濃くして(1文字ずつ)、少し見せてから、匿名で登録する */
  const fillAnonAndSubmit = async () => {
    const r = await anonReady;
    const name = r?.name ?? '';
    if (name) {
      const chars = Array.from(name).slice(0, MAX_NAME_LENGTH);
      for (let i = 0; i < chars.length; i++) {
        const box = document.getElementById(`ane-pbox-${i}`);
        if (box) { box.textContent = chars[i]; box.classList.remove('ghost'); box.classList.add('filled'); }
        await new Promise((resolve) => window.setTimeout(resolve, 45));
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    return finishAndSubmit(name, true);
  };

  // 名前を入力して確定。空のまま(時間切れ含む)なら匿名で登録する
  const confirmTyped = (typed: string) => (typed ? finishAndSubmit(typed) : fillAnonAndSubmit());

  // 開いた直後は少しだけ決定操作を受け付けない(直前の連打で、そのまま登録されないように)
  const core = new ArcadeNameEntryCore(
    { onChange: (state) => updateView(state), onConfirm: (name) => { void confirmTyped(name); } },
    { initialName: options.initialName, timeLimitSec: NAME_ENTRY_TIME_LIMIT_SEC, armDelayMs: 500 },
  );

  // マウス/タッチ操作: 各キー・ボタンをクリック/タップしたらそれを実行
  const allKeys = overlay.querySelectorAll<HTMLElement>('.ane-key');
  allKeys.forEach((keyEl) => {
    keyEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const row = parseInt(keyEl.getAttribute('data-row') ?? '0', 10);
      const col = parseInt(keyEl.getAttribute('data-col') ?? '0', 10);
      core.setCursor(row, col);
      core.triggerKey(row, col);
    });
  });

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.removeEventListener('pagehide', onPageHide);
    if (anon && !submitted) releaseAnonName(anon.token);
    confetti.remove();
    core.destroy();
    if (overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    options.onClosed?.();
  };

  return cleanup;
}

export interface HighScoreEntryFlowOptions {
  slug: string;
  score: number;
  variantId?: string;
  /** 名前入力の見出し・スコア表示・テーマ・待ち時間(順位と完了時の処理はこの関数が足す) */
  modal: Omit<ArcadeNameEntryModalOptions, 'rankDisplay' | 'onComplete' | 'onClosed'>;
  /** 順位の確認中と名前入力中は true、それ以外は false。結果画面の操作を止めるために使う */
  setBlocked: (blocked: boolean) => void;
  /** 名前が決まったとき(ランキングへの登録はここで行う)。Promise を返すと通信完了まで操作ブロックを維持する */
  onName: (name: string) => Promise<SaveLeaderboardResult>;
  /** 名前入力が閉じたあと(操作の受付を戻した後)。決定ボタンの誤爆防止の待ちなどに使う */
  onClosed?: () => void;
  /** 順位の確認が終わったとき(上位に入れば順位、入らない・失敗なら null) */
  onRank?: (rank: number | null) => void;
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
  const { slug, score, variantId, modal, setBlocked, onName, onClosed, onRank } = options;
  return runEntryFlow(
    {
      check: () => checkHighScore(slug, score, variantId),
      showShield: showInputShield,
      mountModal: ({ rank, onComplete, onClosed }) => mountNameEntryModal({ ...modal, rankDisplay: `第${rank}位`, onComplete, onClosed }),
    },
    { setBlocked, onName, onClosed, onRank },
  );
}
