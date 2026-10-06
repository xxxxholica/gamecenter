import { setText, setWidth, setHeight } from '../../../../shared/hudDom';
import { buttonIconHtml } from '../../../../shared/arcadeGuide';
import callFontUrl from '../assets/fonts/NotoSerifJP-Black-subset.woff2?url';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../../shared/arcadeResultMenu';
export type GameMode = 'pve' | 'pvp';

/** 吹き飛び蓄積率の段階ごとの [文字色, 文字影] */
const DAMAGE_LEVELS: ReadonlyArray<readonly [string, string]> = [
  ['#f6efdc', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e8c15a', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e08a3c', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e0343a', '0 0 4px #000, 0 0 16px #b8272d, 2px 2px 4px #000'],
];

/**
 * 技名を1文字ずつ縦に積む。writing-mode の縦書きはフォントによって字送りがずれるため使わず、
 * 「ー」だけは回して縦棒にする。
 */
function verticalText(text: string): string {
  const chars = [...text].map((c) => `<span class="skill-char${c === 'ー' ? ' skill-choon' : ''}">${c}</span>`);
  return `<span class="skill-text">${chars.join('')}</span>`;
}

export class UIManager {
  private readonly damageLevels = new WeakMap<HTMLElement, number>();
  private readonly lastWins: [number, number] = [-1, -1];
  private p1BuchiFillEl!: HTMLElement;
  private p2BuchiFillEl!: HTMLElement;
  // バトルHUD要素
  private battleHudEl!: HTMLElement;
  private p1PercentEl!: HTMLElement;
  private p2PercentEl!: HTMLElement;
  private p1WinsEl!: HTMLElement;
  private p2WinsEl!: HTMLElement;
  private p1ChargeBar!: HTMLElement;
  private p2ChargeBar!: HTMLElement;
  private p1ArmorBadge!: HTMLElement;
  private p2ArmorBadge!: HTMLElement;
  private p1BuchiCdEl!: HTMLElement;
  private p2GrabCdEl!: HTMLElement;
  private p1GrabCdEl!: HTMLElement;
  private p1GrabFillEl!: HTMLElement;
  private p1HariteBox!: HTMLElement;
  private p2HariteBox!: HTMLElement;
  private p1HariteBar!: HTMLElement;
  private p2HariteBar!: HTMLElement;
  private p2GrabFillEl!: HTMLElement;
  private p2BuchiCdEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;

  // タイトル画面要素
  public currentMode: GameMode = 'pve';

  // 指南画面要素
  private howToPlayModalEl!: HTMLElement;

  // リザルト画面要素
  private resultModalEl!: HTMLElement;
  private resultWinnerTitleEl!: HTMLElement;
  private resultSubTextEl!: HTMLElement;
  private resultP1StarsEl!: HTMLElement;
  private resultP2StarsEl!: HTMLElement;
  private resultP2NameEl!: HTMLElement;
  private resultBtns: HTMLElement[] = [];
  public selectedResultIndex: number = 0;

  // バナータイマー
  private bannerTimer: any = null;

  // コールバック
  public onExit: (() => void) | null = null;
  public onHowToPlayClosed: (() => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onReturnTitle: (() => void) | null = null;

  constructor() {
    this.createUIElements();
  }

  private createUIElements() {
    const root = document.createElement('div');
    root.id = 'game-ui-layer';
    root.innerHTML = `
      <style>
        #game-ui-layer {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Meiryo', serif, sans-serif;
          user-select: none;
          overflow: hidden;
          word-break: keep-all;
          overflow-wrap: normal;
        }

        /* ===== 相撲指南（HOW TO PLAY）モーダル ===== */
        #how-to-play-modal {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.85);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s ease;
        }

        #how-to-play-modal.show {
          opacity: 1;
          pointer-events: auto;
        }

        .guide-modal-content {
          background: #191410;
          border: 3px solid #b89358;
          border-radius: 12px;
          width: 720px;
          max-width: 92%;
          padding: 30px 40px;
          box-shadow: 0 16px 40px rgba(0, 0, 0, 0.9), inset 0 0 20px rgba(184, 147, 88, 0.2);
          color: #e5ded5;
        }

        .guide-title {
          font-size: 28px;
          font-weight: 900;
          text-align: center;
          color: #ffd700;
          letter-spacing: 6px;
          margin-bottom: 20px;
          border-bottom: 2px solid #554433;
          padding-bottom: 10px;
          white-space: nowrap;
        }

        .guide-table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 24px;
          font-size: 14px;
        }

        .guide-table th, .guide-table td {
          padding: 10px 14px;
          border-bottom: 1px solid #3d3024;
          text-align: left;
        }

        .guide-table th {
          color: #ffd700;
          font-weight: bold;
          background: rgba(255, 215, 0, 0.08);
          white-space: nowrap;
        }

        .guide-table td {
          color: #eadfc9;
        }

        .guide-table td:nth-child(1),
        .guide-table td:nth-child(2) {
          white-space: nowrap;
        }

        .guide-table td:nth-child(3) {
          white-space: normal;
          word-break: normal;
          overflow-wrap: break-word;
          line-height: 1.5;
        }

        .guide-key-tag {
          display: inline-block;
          background: #33281e;
          border: 1px solid #775c3b;
          color: #fff;
          padding: 2px 8px;
          border-radius: 4px;
          font-weight: bold;
          font-size: 12px;
          margin-right: 4px;
          white-space: nowrap;
        }

        .guide-close-btn {
          display: block;
          margin: 0 auto;
          background: #8b2010;
          border: 2px solid #ff4422;
          color: #fff;
          font-size: 16px;
          font-weight: bold;
          padding: 10px 36px;
          border-radius: 6px;
          cursor: pointer;
          letter-spacing: 4px;
          transition: background 0.2s ease;
          white-space: nowrap;
        }

        .guide-close-btn:hover {
          background: #b52a15;
        }

        /* ===== 試合決着リザルト画面 ===== */
        #match-result-modal {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(10, 8, 6, 0.88);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 250;
          opacity: 0;
          visibility: hidden; /* 隠れている間は「画面に出ていない」扱いにする(無操作の自動タイトル復帰が数えない) */
          pointer-events: none;
          transition: opacity 0.4s ease;
        }

        #match-result-modal.show {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }

        .result-modal-content {
          background: linear-gradient(135deg, #1c1510 0%, #2b1d14 50%, #15100c 100%);
          border: 3px solid #d4af37;
          border-radius: 12px;
          width: 620px;
          max-width: 92%;
          padding: 28px 32px;
          box-sizing: border-box;
          text-align: center;
          box-shadow: 0 0 50px rgba(255, 215, 0, 0.35), 0 20px 40px rgba(0, 0, 0, 0.9);
          animation: resultPop 0.5s cubic-bezier(0.18, 0.89, 0.32, 1.28);
        }

        @keyframes resultPop {
          from { transform: scale(0.85); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }

        .result-badge {
          font-size: 12px;
          letter-spacing: 4px;
          color: #d4af37;
          font-weight: bold;
          margin-bottom: 6px;
          white-space: nowrap;
        }

        .result-title {
          font-family: 'SumoCall', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
          font-size: 36px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 0.12em;
          -webkit-text-stroke: 2px #000;
          paint-order: stroke fill;
          text-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
          margin: 0 0 6px 0;
          white-space: normal;
          line-height: 1.25;
        }

        .result-sub {
          font-size: 15px;
          color: #ffd700;
          letter-spacing: 2px;
          font-weight: bold;
          margin-bottom: 20px;
          white-space: nowrap;
        }

        .result-score-box {
          display: flex;
          align-items: center;
          justify-content: space-around;
          background: rgba(0, 0, 0, 0.5);
          border: 1px solid #554433;
          border-radius: 8px;
          padding: 14px 18px;
          margin-bottom: 22px;
        }

        .result-player-score {
          flex: 1;
        }

        .result-fighter-name {
          font-size: 17px;
          font-weight: bold;
          letter-spacing: 1.5px;
          margin-bottom: 4px;
          white-space: nowrap;
        }

        .result-stars {
          font-size: 24px;
          color: #ffd700;
          letter-spacing: 4px;
          white-space: nowrap;
        }

        .result-vs {
          font-size: 18px;
          font-weight: 900;
          color: #887766;
          padding: 0 12px;
          white-space: nowrap;
        }

        .result-buttons {
          margin-bottom: 4px;
        }

        /* ===== 洗練されたバトル中HUD ===== */
        #battle-hud {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.4s ease;
        }

        #battle-hud.active {
          opacity: 1;
        }

        /* 上部中央の文字が観客に埋もれないよう、ぼかした暗がりを敷く(枠ではない) */
        #battle-hud::before {
          content: '';
          position: absolute;
          top: 0;
          left: 50%;
          width: 760px;
          height: 200px;
          transform: translateX(-50%);
          background: radial-gradient(ellipse 380px 200px at 50% 0%, rgba(8, 6, 4, 0.88) 0%, rgba(8, 6, 4, 0.6) 45%, rgba(8, 6, 4, 0) 100%);
          pointer-events: none;
        }

        .hud-top {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          gap: 8px;
          padding: 14px 28px;
          position: relative;
        }

        /* 力士ステータスカード（和紙・墨・金の和テイスト） */
        .fighter-card {
          --accent: #2b5d8a;
          /* 枠や背景は付けず、文字の縁取りだけで読ませる(上部中央に両者を並べる) */
          width: auto;
          min-width: 200px;
          box-sizing: border-box;
          position: relative;
          white-space: nowrap;
        }

        /* 1P: 東方（藍） */
        .fighter-card.p1-card {
          --accent: #2b5d8a;
          text-align: center;
        }

        /* 2P/CPU: 西方（朱） */
        .fighter-card.p2-card {
          --accent: #b8272d;
          text-align: center;
        }

        /* 力士情報ヘッダー */
        .fighter-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 0;
          white-space: nowrap;
        }

        /* 2P/CPU は名前の右側に角印(1Pと左右対称) */
        .p2-card .fighter-header {
          flex-direction: row;
        }

        /* 1P / 2P は判子風の角印 */
        .player-badge {
          font-size: 12px;
          font-weight: 900;
          padding: 2px 6px;
          border-radius: 2px;
          letter-spacing: 1px;
          color: #fdf6e3;
          background: var(--accent);
          box-shadow: 0 0 0 1px rgba(253, 246, 227, 0.5) inset;
          white-space: nowrap;
        }

        .p1-badge,
        .p2-badge {
          background: var(--accent);
        }

        .fighter-name {
          font-size: 20px;
          font-weight: 900;
          letter-spacing: 3px;
          color: #f6efdc;
          text-shadow: 0 0 4px #000, 0 0 4px #000, 0 0 8px #000, 1px 1px 3px #000;
          white-space: nowrap;
        }

        .p1-color,
        .p2-color {
          color: #f6efdc;
        }

        /* 星取り（白星・黒星） */
        .stars-container {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 22px;
          line-height: 1;
          white-space: nowrap;
        }

        .p2-card .stars-container {
          flex-direction: row-reverse;
        }

        /* 中央の星取り: 名前の行の高さにそろえる */
        .hud-center-marks {
          display: flex;
          align-items: center;
          gap: 10px;
          height: 30px;
          min-width: 0;
          justify-content: center;
        }

        .marks-divider {
          width: 1px;
          height: 22px;
          background: rgba(216, 180, 90, 0.7);
        }

        .hud-center-marks .stars-container {
          min-width: 0;
        }

        .hud-center-marks .stars-container:first-child {
          justify-content: flex-end;
        }

        .mark-win {
          color: #ffffff;
          text-shadow: 0 0 4px #000, 0 0 8px rgba(255, 255, 255, 0.6);
        }

        .mark-pending {
          color: rgba(255, 255, 255, 0.55);
          text-shadow: 0 0 4px #000, 0 0 4px #000;
        }

        .star-win {
          color: #e0b84a;
          text-shadow: 0 0 8px rgba(224, 184, 74, 0.7);
          display: inline-block;
          animation: starGlow 1.5s infinite alternate ease-in-out;
          white-space: nowrap;
        }

        .star-loss {
          color: rgba(255, 255, 255, 0.22);
          display: inline-block;
          white-space: nowrap;
        }

        @keyframes starGlow {
          from { transform: scale(1); filter: drop-shadow(0 0 2px #ffd700); }
          to { transform: scale(1.1); filter: drop-shadow(0 0 6px #ffd700); }
        }

        /* ===== 主役！ダメージ蓄積（吹き飛び率）ヒーローセクション ===== */
        .knockback-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0;
          margin: 2px 0 0 0;
          white-space: nowrap;
        }

        .p2-card .knockback-wrap {
          align-items: center;
        }

        .knockback-label-box {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
          white-space: nowrap;
        }

        .p2-card .knockback-label-box {
          align-items: center;
        }

        .knockback-label {
          font-size: 13px;
          font-weight: bold;
          color: #e6d9b4;
          letter-spacing: 4px;
          text-shadow: 0 0 4px #000, 0 0 4px #000, 1px 1px 2px #000;
          white-space: nowrap;
        }

        .damage-number-box {
          color: #f6efdc;
          display: flex;
          align-items: flex-start;
          line-height: 0.95;
          white-space: nowrap;
        }

        /* 110%を超えたら、数字がゆっくり脈打つ */
        .damage-number-box.danger {
          animation: damageBeat 0.9s ease-in-out infinite;
          transform-origin: 50% 60%;
        }

        .p2-card .damage-number-box.danger {
          transform-origin: 50% 60%;
        }

        @keyframes damageBeat {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.14); }
        }

        .knockback-value {
          font-size: 76px;
          font-weight: 900;
          letter-spacing: 0;
          color: inherit;
          transition: color 0.15s ease, text-shadow 0.15s ease;
          display: inline-block;
          white-space: nowrap;
        }

        .knockback-unit {
          font-size: 26px;
          font-weight: 900;
          color: inherit;
          opacity: 0.75;
          margin-left: 2px;
          margin-top: 4px;
          white-space: nowrap;
        }

        /* 技: ステータスの下に縦に並べる。クールタイムが回復するにつれて枠の中が満ちていく */
        /* 技はカード(半透明の黒い枠)の外、すぐ下に置く。1つ1つが短冊型のボックス兼シークバー */
        .skill-stack {
          position: fixed;
          bottom: 14px;
          left: 28px;
          display: flex;
          gap: 8px;
        }

        .p2-card .skill-stack {
          left: auto;
          right: 28px;
          flex-direction: row-reverse;
        }

        .skill-box {
          position: relative;
          width: 60px;
          height: 180px;
          box-sizing: border-box;
          border: 1px solid #b8944a;
          border-radius: 2px;
          background: rgba(22, 17, 13, 0.88);
          overflow: hidden;
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(22, 17, 13, 0.88), inset 0 0 0 3px rgba(184, 148, 74, 0.4);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        /* 回復の進み具合(JSで height を更新)。回復した分だけ下から満ちる */
        .skill-fill {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 100%;
          /* クールタイム中は、くすんだ黄色が下から溜まっていく。満ちると明るい金色(下の .ready)になる */
          background: linear-gradient(0deg, rgba(150, 118, 40, 0.85), rgba(196, 160, 60, 0.85));
          transition: background 0.15s ease;
        }

        .skill-box.ready {
          border-color: #e0b84a;
          box-shadow: 0 0 10px rgba(224, 184, 74, 0.6), inset 0 0 0 2px rgba(22, 17, 13, 0.4);
        }

        .skill-box.ready .skill-fill {
          background: linear-gradient(0deg, rgba(176, 138, 52, 0.95), rgba(232, 193, 90, 0.95));
        }

        /* 張り手ゲージが満タン: 次の1発が強い。枠を脈打たせて知らせる */
        .skill-box.gauge-full {
          animation: hariteFullPulse 0.45s infinite alternate;
        }

        @keyframes hariteFullPulse {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.35); }
        }

        /* つかみは打撃(黄色)と系統が違うので、青で見せる */
        .skill-box.grab .skill-fill {
          background: linear-gradient(0deg, rgba(34, 82, 128, 0.85), rgba(70, 126, 178, 0.85));
        }

        .skill-box.grab.ready {
          border-color: #6fb6f0;
          box-shadow: 0 0 10px rgba(90, 170, 240, 0.65), inset 0 0 0 2px rgba(22, 17, 13, 0.4);
        }

        .skill-box.grab.ready .skill-fill {
          background: linear-gradient(0deg, rgba(48, 118, 188, 0.95), rgba(112, 184, 244, 0.95));
        }

        /* ボタンアイコンと技名(白い明朝体の縦書き)をボックスの中に重ねる */
        .skill-label {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          gap: 4px;
          padding-top: 6px;
        }

        /* LT / RT: 2つの丸を斜めにずらし、間に斜線を引く */
        /* ボタンの丸は X / B / LT / RT すべて同じ直径にそろえる */
        .skill-label .agc-btn {
          box-sizing: border-box;
          width: 30px;
          min-width: 30px;
          height: 30px;
          padding: 0;
          border-radius: 50% !important;
          font-size: 13px;
        }

        /* LT / RT: 同じ丸の中で LT と RT を交互に切り替える */
        .skill-label .agc-btn.skill-guard-loop {
          position: relative;
        }

        .skill-guard-loop .loop-lt,
        .skill-guard-loop .loop-rt {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: guardLoop 2s steps(1, end) infinite;
        }

        .skill-guard-loop .loop-rt {
          animation-delay: -1s;
        }

        @keyframes guardLoop {
          0% { opacity: 1; }
          50% { opacity: 0; }
          100% { opacity: 1; }
        }

        .skill-text {
          display: flex;
          flex-direction: column;
          align-items: center;
          font-size: 15px;
          font-weight: bold;
          line-height: 1.2;
          color: #ffffff;
          text-shadow: 0 0 3px #000, 1px 1px 2px #000;
        }

        /* ボタンの押し方(連打 / 長押し)。ボックスの下端に小さく */
        .skill-hint {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 5px;
          text-align: center;
          font-size: 12px;
          font-weight: bold;
          color: #ffe9a8;
          text-shadow: 0 0 3px #000, 1px 1px 2px #000;
          letter-spacing: 0;
        }

        .skill-char {
          display: block;
          width: 1em;
          height: 1.2em;
          text-align: center;
        }

        /* 「ー」は縦棒にする */
        .skill-choon {
          transform: rotate(90deg);
        }

        /* ガード耐久: 受けるたびに下から減っていく。残りが少ないと朱色で点滅 */
        .skill-fill.guard-fill {
          background: linear-gradient(0deg, rgba(43, 93, 138, 0.85), rgba(127, 176, 214, 0.85));
          transition: height 0.08s linear;
        }

        .skill-fill.guard-fill.warning {
          background: linear-gradient(0deg, #b8272d, #e08a3c);
          animation: guardWarningPulse 0.4s infinite alternate;
        }

        @keyframes guardWarningPulse {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.4); }
        }

        /* ぶちかましのタメ量: クールタイムの枠(黄)の上に、赤が下から満ちていく */
        .charge-fill {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 0%;
          background: linear-gradient(0deg, rgba(168, 28, 36, 0.92), rgba(226, 60, 52, 0.92));
          box-shadow: 0 0 10px rgba(226, 60, 52, 0.7);
          transition: height 0.05s linear;
        }

        /* 状態バッジ（アーマー・鉄壁・気絶） */
        .badge-status-wrap {
          display: flex;
          gap: 5px;
          margin-top: 6px;
          min-height: 18px;
          align-items: center;
          white-space: nowrap;
        }

        .p2-card .badge-status-wrap {
          justify-content: flex-end;
        }

        .armor-badge {
          display: inline-block;
          font-size: 10px;
          background: #d9a441;
          color: #1a1208;
          font-weight: 900;
          padding: 1px 6px;
          border-radius: 3px;
          opacity: 0;
          transform: translateY(2px);
          transition: opacity 0.15s ease, transform 0.15s ease;
          box-shadow: 0 0 8px rgba(255, 170, 0, 0.6);
          white-space: nowrap;
        }

        .armor-badge.active {
          opacity: 1;
          transform: translateY(0);
        }

        .guard-badge {
          display: inline-block;
          font-size: 10px;
          background: #2f6690;
          color: #fdf6e3;
          font-weight: 900;
          padding: 1px 6px;
          border-radius: 3px;
          opacity: 0;
          transform: translateY(2px);
          transition: opacity 0.15s ease, transform 0.15s ease;
          box-shadow: 0 0 8px rgba(0, 180, 216, 0.6);
          white-space: nowrap;
        }

        .guard-badge.active {
          opacity: 1;
          transform: translateY(0);
        }

        .stun-badge {
          display: inline-block;
          font-size: 10px;
          background: #b8272d;
          color: #fdf6e3;
          font-weight: 900;
          padding: 1px 7px;
          border-radius: 3px;
          opacity: 0;
          animation: stunPulse 0.35s infinite alternate;
          box-shadow: 0 0 12px #ff0054;
          white-space: nowrap;
        }

        .stun-badge.active {
          opacity: 1;
        }

        @keyframes stunPulse {
          0% { transform: scale(1); filter: brightness(1); }
          100% { transform: scale(1.08); filter: brightness(1.4); }
        }

        /* 中央の幕内タイトル & バナー */
        /* 掛け声(見合って・はっけよい・勝負あり)は、太い明朝体の縦書き。基調は白 */
        @font-face {
          font-family: 'SumoCall';
          src: url('${callFontUrl}') format('woff2');
          font-weight: 900;
          font-display: block;
        }

        .center-announcement {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, calc(-50% - 22px));
          display: flex;
          /* 縦書きでは block 方向が右から左。column で、主文の左に副文の列が並ぶ */
          flex-direction: column;
          align-items: flex-end; /* 副文の列は、主文の下端に揃える */
          gap: 0.5em;
          writing-mode: vertical-rl;
          text-orientation: upright;
          font-family: 'SumoCall', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', serif;
          font-weight: 900;
          pointer-events: none;
          opacity: 0;
          white-space: nowrap;
          transition: opacity 0.2s ease-out, transform 0.3s cubic-bezier(0.22, 0.9, 0.3, 1);
        }

        .center-announcement.show {
          opacity: 1;
          transform: translate(-50%, -50%);
        }

        .banner-main {
          font-size: clamp(44px, 9vh, 96px);
          line-height: 1.1;
          letter-spacing: 0.05em;
          color: #ffffff;
          -webkit-text-stroke: 3px #000;
          paint-order: stroke fill;
          text-shadow: 0 6px 22px rgba(0, 0, 0, 0.7);
        }

        .banner-sub {
          font-size: clamp(18px, 3.4vh, 32px);
          line-height: 1.2;
          letter-spacing: 0.1em;
          color: rgba(255, 255, 255, 0.85);
          -webkit-text-stroke: 2px #000;
          paint-order: stroke fill;
          text-shadow: 0 3px 12px rgba(0, 0, 0, 0.7);
          padding-bottom: 0.4em;
        }

        /* 副文がないときは、その行ごと詰める */
        .banner-sub:empty,
        .result-sub:empty {
          display: none;
        }

      </style>

      <!-- ===== 遊び方モーダル ===== -->
      <div id="how-to-play-modal">
        <div class="guide-modal-content">
          <div class="guide-title">遊 び 方</div>
          <table class="guide-table">
            <thead>
              <tr>
                <th>技</th>
                <th>操作</th>
                <th>説明</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>移動</strong></td>
                <td><span class="guide-key-tag">レバー</span> / <span class="guide-key-tag">WASD</span></td>
                <td>カメラの向きで8方向に動く。</td>
              </tr>
              <tr>
                <td><strong>張り手</strong></td>
                <td><span class="guide-key-tag">A / Xボタン</span> / <span class="guide-key-tag">J</span> を<strong>ちょん押し</strong></td>
                <td>連打できる小さな突き。タメている相手を止める。当て続けると、次の1発が強い。</td>
              </tr>
              <tr>
                <td><strong>ぶちかまし</strong></td>
                <td><span class="guide-key-tag">A / Xボタン</span> / <span class="guide-key-tag">J</span> を<strong>長押し</strong></td>
                <td>タメて、離すと突進。長いほど遠くへ飛ぶ。つかみを弾く。</td>
              </tr>
              <tr>
                <td><strong>つかみ</strong></td>
                <td><span class="guide-key-tag">B / Yボタン</span> / <span class="guide-key-tag">K</span></td>
                <td>近くの相手を投げる。張り手では止まらない。外すと隙が大きい。</td>
              </tr>
              <tr>
                <td><strong>勝負</strong></td>
                <td>-</td>
                <td>当たるほど吹き飛びやすい。土俵の外に出たら負け。二本先取。</td>
              </tr>
              <tr>
                <td><strong>反撃</strong></td>
                <td>ボタン連打</td>
                <td>連続で殴られたら、連打で押し返せる。</td>
              </tr>
            </tbody>
          </table>
          <button class="guide-close-btn" id="guide-close-btn">閉じる</button>
        </div>
      </div>

      <!-- ===== 試合決着リザルト画面 ===== -->
      <div id="match-result-modal">
        <div class="result-modal-content">
          <h2 class="result-title" id="result-winner-title">蒼天龍　優勝</h2>
          <div class="result-sub" id="result-sub-text"></div>
          
          <div class="result-score-box">
            <div class="result-player-score">
              <div class="result-fighter-name p1-color">蒼天龍</div>
              <div class="result-stars" id="result-p1-stars">★★</div>
            </div>
            <div class="result-vs">VS</div>
            <div class="result-player-score">
              <div class="result-fighter-name p2-color" id="result-p2-name">紅炎山</div>
              <div class="result-stars" id="result-p2-stars">☆</div>
            </div>
          </div>

          <div class="result-buttons" id="result-menu">
            <button id="result-btn-rematch">再挑戦</button>
            <button id="result-btn-title">タイトルに戻る</button>
            <button id="result-btn-exit">ゲームを終了</button>
          </div>
        </div>
      </div>

      <!-- ===== バトル中HUD ===== -->
      <div id="battle-hud">
        <div class="hud-top">
          <!-- プレイヤー1（東方 蒼天龍） -->
          <div class="fighter-card p1-card">
            <div class="fighter-header">
              <span class="player-badge p1-badge">1P</span>
              <span class="fighter-name p1-color">東方 蒼天龍</span>
            </div>

            <!-- 主役：ダメージ蓄積率（吹き飛び率） -->
            <div class="knockback-wrap">
              <div class="damage-number-box">
                <span class="knockback-value" id="p1-knockback">0</span>
                <span class="knockback-unit">%</span>
              </div>
            </div>

            <!-- 技: 回復に合わせて枠が満ちる -->
            <div class="skill-stack">
              <div class="skill-box ready" id="p1-harite-box">
                <div class="skill-fill"></div>
                <div class="charge-fill" id="p1-harite-bar"></div>
                <div class="skill-label">${buttonIconHtml([0])}${verticalText('張り手')}</div>
                <div class="skill-hint">連打</div>
              </div>
              <div class="skill-box ready" id="p1-buchi-cd">
                <div class="skill-fill" id="p1-buchi-fill"></div>
                <div class="charge-fill" id="p1-charge-bar"></div>
                <div class="skill-label">${buttonIconHtml([0])}${verticalText('ぶちかまし')}</div>
                <div class="skill-hint">長押し</div>
              </div>
              <div class="skill-box grab ready" id="p1-grab-cd">
                <div class="skill-fill" id="p1-grab-fill"></div>
                <div class="skill-label">${buttonIconHtml([1])}${verticalText('つかみ')}</div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="armor-badge" id="p1-armor-badge">突進中</span>
            </div>
          </div>


          <!-- プレイヤー2 / CPU（西方 紅炎山） -->
          <!-- 中央: 両者の星取り(白い丸=勝ち、薄い輪=これから) -->
          <div class="hud-center-marks">
            <div class="stars-container" id="p1-stars"></div>
            <span class="marks-divider"></span>
            <div class="stars-container" id="p2-stars"></div>
          </div>

          <div class="fighter-card p2-card">
            <div class="fighter-header">
              <span class="fighter-name p2-color">西方 紅炎山</span>
              <span class="player-badge p2-badge" id="p2-badge-tag">2P</span>
            </div>

            <!-- 主役：ダメージ蓄積率（吹き飛び率） -->
            <div class="knockback-wrap">
              <div class="damage-number-box">
                <span class="knockback-value" id="p2-knockback">0</span>
                <span class="knockback-unit">%</span>
              </div>
            </div>

            <!-- 技: 回復に合わせて枠が満ちる -->
            <div class="skill-stack">
              <div class="skill-box p2-side ready" id="p2-harite-box">
                <div class="skill-fill"></div>
                <div class="charge-fill" id="p2-harite-bar"></div>
                <div class="skill-label">${buttonIconHtml([0])}${verticalText('張り手')}</div>
                <div class="skill-hint">連打</div>
              </div>
              <div class="skill-box p2-side ready" id="p2-buchi-cd">
                <div class="skill-fill" id="p2-buchi-fill"></div>
                <div class="charge-fill" id="p2-charge-bar"></div>
                <div class="skill-label">${buttonIconHtml([0])}${verticalText('ぶちかまし')}</div>
                <div class="skill-hint">長押し</div>
              </div>
              <div class="skill-box p2-side grab ready" id="p2-grab-cd">
                <div class="skill-fill" id="p2-grab-fill"></div>
                <div class="skill-label">${buttonIconHtml([1])}${verticalText('つかみ')}</div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="armor-badge" id="p2-armor-badge">突進中</span>
            </div>
          </div>
        </div>

        <!-- 中央コール（はっけよい、のこった、勝負あり） -->
        <div class="center-announcement" id="center-announcement">
          <div class="banner-main" id="banner-main">はっけよい</div>
          <div class="banner-sub" id="banner-sub"></div>
        </div>

      </div>
    `;

    document.body.appendChild(root);

    // タイトル要素
    this.howToPlayModalEl = document.getElementById('how-to-play-modal')!;

    // バトルHUD要素
    this.battleHudEl = document.getElementById('battle-hud')!;
    this.p1PercentEl = document.getElementById('p1-knockback')!;
    this.p2PercentEl = document.getElementById('p2-knockback')!;
    this.p1WinsEl = document.getElementById('p1-stars')!;
    this.p2WinsEl = document.getElementById('p2-stars')!;
    this.p1ChargeBar = document.getElementById('p1-charge-bar')!;
    this.p2ChargeBar = document.getElementById('p2-charge-bar')!;
    this.p1ArmorBadge = document.getElementById('p1-armor-badge')!;
    this.p2ArmorBadge = document.getElementById('p2-armor-badge')!;
    this.p1HariteBox = document.getElementById('p1-harite-box')!;
    this.p2HariteBox = document.getElementById('p2-harite-box')!;
    this.p1HariteBar = document.getElementById('p1-harite-bar')!;
    this.p2HariteBar = document.getElementById('p2-harite-bar')!;
    this.p1GrabCdEl = document.getElementById('p1-grab-cd')!;
    this.p2GrabCdEl = document.getElementById('p2-grab-cd')!;
    this.p1GrabFillEl = document.getElementById('p1-grab-fill')!;
    this.p2GrabFillEl = document.getElementById('p2-grab-fill')!;
    this.p1BuchiCdEl = document.getElementById('p1-buchi-cd')!;
    this.p2BuchiCdEl = document.getElementById('p2-buchi-cd')!;
    this.p1BuchiFillEl = document.getElementById('p1-buchi-fill')!;
    this.p2BuchiFillEl = document.getElementById('p2-buchi-fill')!;
    this.bannerEl = document.getElementById('center-announcement')!;
    this.bannerSubEl = document.getElementById('banner-sub')!;

    // リザルト画面要素
    this.resultModalEl = document.getElementById('match-result-modal')!;
    this.resultWinnerTitleEl = document.getElementById('result-winner-title')!;
    this.resultSubTextEl = document.getElementById('result-sub-text')!;
    this.resultP1StarsEl = document.getElementById('result-p1-stars')!;
    this.resultP2StarsEl = document.getElementById('result-p2-stars')!;
    this.resultP2NameEl = document.getElementById('result-p2-name')!;
    this.resultBtns = [
      document.getElementById('result-btn-rematch')!,
      document.getElementById('result-btn-title')!,
      document.getElementById('result-btn-exit')!,
    ];

    document.getElementById('guide-close-btn')!.addEventListener('click', () => {
      this.closeHowToPlay();
    });

    this.setupResultControls();
  }

  private setupResultControls() {
    this.resultBtns.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        this.selectResultIndex(index);
        this.confirmCurrentResultSelection();
      });
    });
  }

  /** 再挑戦 / タイトルに戻る / ゲームを終了 (全ゲーム共通の縦並びメニュー) */
  private resultMenuItems(): ResultMenuItem[] {
    const colors = ['#ffe600', '#39ff88', '#00f0ff'];
    return this.resultBtns.map((button, i) => ({ button, color: colors[i] }));
  }

  public selectResultIndex(index: number) {
    this.selectedResultIndex = (index + this.resultBtns.length) % this.resultBtns.length;
    const items = this.resultMenuItems();
    setupResultMenu(document.getElementById('result-menu'), items);
    applyResultMenuFocus(items, this.selectedResultIndex);
  }

  /** dir: -1 = 上/左, +1 = 下/右 */
  public moveResultSelection(dir: number) {
    this.selectResultIndex(this.selectedResultIndex + dir);
  }

  public confirmCurrentResultSelection() {
    if (this.selectedResultIndex === 0) this.onRematch?.();
    else if (this.selectedResultIndex === 1) this.onReturnTitle?.();
    else this.onExit?.();
  }

  public showVictoryModal(winnerName: string, p1Wins: number, p2Wins: number, p2Name: string) {
    this.resultWinnerTitleEl.textContent = `${winnerName}　優勝`;
    this.resultSubTextEl.textContent = '';
    this.resultP1StarsEl.innerHTML = this.renderStars(p1Wins);
    this.resultP2StarsEl.innerHTML = this.renderStars(p2Wins);
    this.resultP2NameEl.textContent = p2Name;

    this.selectResultIndex(0);
    this.resultModalEl.classList.add('show');
  }

  public hideVictoryModal() {
    this.resultModalEl.classList.remove('show');
  }

  public isVictoryModalOpen(): boolean {
    return this.resultModalEl.classList.contains('show');
  }

  /** 対戦モードに合わせて西方(2P/CPU)の表示を切り替える */
  public setMode(mode: GameMode) {
    this.currentMode = mode;
    this.documentP2Label(mode === 'pvp' ? '2P' : 'CPU');
  }

  public documentP2Label(text: string) {
    const badge = document.getElementById('p2-badge-tag');
    if (badge) badge.textContent = text;
  }

  public openHowToPlay() {
    this.howToPlayModalEl.classList.add('show');
    // 画面が低いときは全体が収まるように縮める(アケコンではスクロールできないため)
    const content = this.howToPlayModalEl.querySelector<HTMLElement>('.guide-modal-content');
    if (content) {
      content.style.transform = '';
      const scale = Math.min(1, (window.innerHeight - 24) / content.offsetHeight);
      content.style.transform = scale < 1 ? `scale(${scale})` : '';
    }
  }

  public closeHowToPlay() {
    if (!this.isHowToPlayOpen()) return;
    this.howToPlayModalEl.classList.remove('show');
    this.onHowToPlayClosed?.();
  }

  public isHowToPlayOpen(): boolean {
    return this.howToPlayModalEl.classList.contains('show');
  }

  /** タイトル・モード選択中はバトルHUDを隠す(タイトル画面そのものは共通の ArcadeTitleScreen が出す) */
  public showTitleScreen() {
    this.battleHudEl.classList.remove('active');
    this.howToPlayModalEl.classList.remove('show');
  }

  public hideTitleScreen() {
    this.battleHudEl.classList.add('active');
  }

  public updateStats(
    p1Percent: number,
    p2Percent: number,
    p1Wins: number,
    p2Wins: number,
    p1Charge: number,
    p2Charge: number,
    p1SuperArmor: boolean,
    p2SuperArmor: boolean,
    p1BuchiCdRatio: number,
    p2BuchiCdRatio: number,
    p1GrabCdRatio: number,
    p2GrabCdRatio: number,
    p1HariteGauge: number,
    p2HariteGauge: number,
  ) {
    // 吹き飛び蓄積率（パーセント数値 ＆ ゲージ ＆ ダイナミックグロー）
    this.updateDamageStyle(this.p1PercentEl, p1Percent);
    this.updateDamageStyle(this.p2PercentEl, p2Percent);

    // 白星・黒星マーク（勝ち数が変わったときだけ描き直す）
    if (p1Wins !== this.lastWins[0]) {
      this.lastWins[0] = p1Wins;
      this.p1WinsEl.innerHTML = this.renderWinMarks(p1Wins);
    }
    if (p2Wins !== this.lastWins[1]) {
      this.lastWins[1] = p2Wins;
      this.p2WinsEl.innerHTML = this.renderWinMarks(p2Wins);
    }

    // チャージバー（ぶちかましタメ）
    setHeight(this.p1ChargeBar, `${Math.min(100, p1Charge * 100)}%`);
    setHeight(this.p2ChargeBar, `${Math.min(100, p2Charge * 100)}%`);

    // ぶちかまし突進中の表示
    this.p1ArmorBadge.classList.toggle('active', p1SuperArmor);
    this.p2ArmorBadge.classList.toggle('active', p2SuperArmor);

    // ぶちかましのクールタイム表示
    this.updateSkillBox(this.p1BuchiCdEl, this.p1BuchiFillEl, p1BuchiCdRatio);
    this.updateSkillBox(this.p2BuchiCdEl, this.p2BuchiFillEl, p2BuchiCdRatio);

    // 張り手ゲージ(当て続けると赤が溜まる。満タンの間は枠が脈打つ)
    setHeight(this.p1HariteBar, `${Math.min(100, p1HariteGauge * 100)}%`);
    setHeight(this.p2HariteBar, `${Math.min(100, p2HariteGauge * 100)}%`);
    this.p1HariteBox.classList.toggle('gauge-full', p1HariteGauge >= 1);
    this.p2HariteBox.classList.toggle('gauge-full', p2HariteGauge >= 1);

    // つかみのクールタイム表示
    this.updateSkillBox(this.p1GrabCdEl, this.p1GrabFillEl, p1GrabCdRatio);
    this.updateSkillBox(this.p2GrabCdEl, this.p2GrabFillEl, p2GrabCdRatio);

    // コントローラー接続インジケーター
  }

  /**
   * 吹き飛び蓄積率のスタイリング（スマブラ風ダイナミックカラー＆グロー）
   */
  private updateDamageStyle(el: HTMLElement, percent: number) {
    setText(el, Math.floor(percent).toString());

    // バーは使わず、蓄積率の数字そのものの色で危険度を表す
    const level = percent < 35 ? 0 : percent < 70 ? 1 : percent < 110 ? 2 : 3;
    if (this.damageLevels.get(el) === level) return;
    this.damageLevels.set(el, level);
    const [color, shadow] = DAMAGE_LEVELS[level];
    const box = el.parentElement!;
    box.style.color = color;
    box.style.textShadow = shadow;
    box.classList.toggle('danger', level === 3);
  }

  private updateSkillBox(boxEl: HTMLElement, fillEl: HTMLElement, remainingRatio: number) {
    const ready = remainingRatio <= 0.02;
    boxEl.classList.toggle('ready', ready);
    boxEl.classList.toggle('cooling', !ready);
    setHeight(fillEl, `${Math.round((1 - Math.min(1, Math.max(0, remainingRatio))) * 100)}%`);
  }

  /** 対戦中の星取り: 勝ちは白い丸、まだの取組は薄い輪 */
  private renderWinMarks(wins: number): string {
    let s = '';
    for (let i = 0; i < 2; i++) {
      s += i < wins ? '<span class="mark-win">●</span>' : '<span class="mark-pending">○</span>';
    }
    return s;
  }

  private renderStars(wins: number): string {
    let s = '';
    for (let i = 0; i < 2; i++) {
      if (i < wins) {
        s += '<span class="star-win">★</span>';
      } else {
        s += '<span class="star-loss">☆</span>';
      }
    }
    return s;
  }

  public showBanner(mainText: string, subText: string, durationMs: number = 1800) {
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }

    const main = document.getElementById('banner-main')!;
    main.textContent = mainText;
    this.bannerSubEl.textContent = subText;

    // アニメーション再トリガー（一旦showを消してreflow後に付与）
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth; // force DOM reflow
    this.bannerEl.classList.add('show');

    if (durationMs > 0) {
      this.bannerTimer = setTimeout(() => {
        this.bannerEl.classList.remove('show');
        this.bannerTimer = null;
      }, durationMs);
    }
  }

  public hideBanner() {
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    this.bannerEl.classList.remove('show');
  }
}
