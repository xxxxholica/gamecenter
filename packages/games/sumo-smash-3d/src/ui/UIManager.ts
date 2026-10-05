import { setText, setWidth, setHeight } from '../../../../shared/hudDom';
import { buttonIconHtml } from '../../../../shared/arcadeGuide';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../../shared/arcadeResultMenu';
export type GameMode = 'pve' | 'pvp';

/** 吹き飛び蓄積率の段階ごとの [文字色, 文字影] */
const DAMAGE_LEVELS: ReadonlyArray<readonly [string, string]> = [
  ['#f6efdc', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e8c15a', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e08a3c', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e0343a', '0 0 4px #000, 0 0 16px #b8272d, 2px 2px 4px #000'],
];

/** ガードは LT / RT のどちらでも操作できる。左上の LT と右下の RT を斜線で区切って1つにまとめる */
const GUARD_ICON_HTML = `${buttonIconHtml([])}`.replace(
  '</span>',
  '<span class="agc-btn skill-guard-loop"><span class="loop-lt">LT</span><span class="loop-rt">RT</span></span></span>'
);

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
  private p1ShikoFillEl!: HTMLElement;
  private p2ShikoFillEl!: HTMLElement;
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
  private p1GuardBadge!: HTMLElement;
  private p2GuardBadge!: HTMLElement;
  private p1StunBadge!: HTMLElement;
  private p2StunBadge!: HTMLElement;
  private p1GuardBar!: HTMLElement;
  private p2GuardBar!: HTMLElement;
  private p1BuchiCdEl!: HTMLElement;
  private p2BuchiCdEl!: HTMLElement;
  private p1ShikoCdEl!: HTMLElement;
  private p2ShikoCdEl!: HTMLElement;
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
          font-size: 28px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 2px;
          text-shadow: 0 0 20px #ffd700, 2px 2px 4px #000;
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
          background: linear-gradient(0deg, rgba(43, 93, 138, 0.8), rgba(127, 176, 214, 0.8));
          transition: background 0.15s ease;
        }

        .skill-box.p2-side .skill-fill {
          background: linear-gradient(0deg, rgba(184, 39, 45, 0.8), rgba(224, 138, 60, 0.8));
        }

        .skill-box.ready {
          border-color: #e0b84a;
          box-shadow: 0 0 10px rgba(224, 184, 74, 0.6), inset 0 0 0 2px rgba(22, 17, 13, 0.4);
        }

        .skill-box.ready .skill-fill {
          background: linear-gradient(0deg, rgba(176, 138, 52, 0.95), rgba(232, 193, 90, 0.95));
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

        /* ぶちかましのタメ量(長押し中だけ伸びる細い縦線) */
        .charge-gauge-container {
          position: absolute;
          top: 0;
          bottom: 0;
          right: 0;
          width: 4px;
          background: rgba(0, 0, 0, 0.5);
        }

        .p2-card .charge-gauge-container {
          right: auto;
          left: 0;
        }

        .charge-gauge-fill {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          height: 0%;
          background: linear-gradient(0deg, #e0b84a, #c1272d);
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
        .center-announcement {
          position: absolute;
          top: 36%;
          left: 50%;
          transform: translate(-50%, -50%) scale(0.85);
          text-align: center;
          pointer-events: none;
          opacity: 0;
          white-space: nowrap;
          width: max-content;
          max-width: 85vw;
          transition: opacity 0.16s ease-out, transform 0.22s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        }

        .center-announcement.show {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.05);
        }

        .banner-main {
          font-size: 54px;
          font-weight: 900;
          letter-spacing: 6px;
          color: #fffdf0;
          text-shadow: 0 0 25px #ff2200, 0 0 55px #ff6600, 3px 3px 6px #000;
          filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.85));
          white-space: nowrap;
        }

        .banner-sub {
          font-size: 17px;
          font-weight: 900;
          color: #ffe066;
          letter-spacing: 1.5px;
          margin-top: 6px;
          text-shadow: 0 0 12px rgba(255, 180, 0, 0.85), 2px 2px 4px #000;
          white-space: nowrap;
        }

      </style>

      <!-- ===== 相撲指南モーダル ===== -->
      <div id="how-to-play-modal">
        <div class="guide-modal-content">
          <div class="guide-title">相 撲 指 南</div>
          <table class="guide-table">
            <thead>
              <tr>
                <th>操作・技名</th>
                <th>アケコン / キー</th>
                <th>効果・相撲システム</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>8方向移動</strong></td>
                <td><span class="guide-key-tag">レバー</span> / <span class="guide-key-tag">WASD</span></td>
                <td>カメラ基準の直感移動。相手の間合いを詰める。</td>
              </tr>
              <tr>
                <td><strong>すり足</strong></td>
                <td><span class="guide-key-tag">レバー2回</span> / <span class="guide-key-tag">RB</span> / <span class="guide-key-tag">Shift</span></td>
                <td>低姿勢で一気に踏み込む高速接近。</td>
              </tr>
              <tr>
                <td><strong>張り手</strong></td>
                <td><span class="guide-key-tag">Aボタン</span> / <span class="guide-key-tag">J</span></td>
                <td>発生最速の突っ張り連打。ノックバック倍率を細かく加算。</td>
              </tr>
              <tr>
                <td><strong>ぶちかまし</strong></td>
                <td><span class="guide-key-tag">Bボタン</span> / <span class="guide-key-tag">K</span></td>
                <td>長押しタメで威力・距離UP。大吹き飛ばし・CT 2.8秒。</td>
              </tr>
              <tr>
                <td><strong>四股</strong></td>
                <td><span class="guide-key-tag">Xボタン</span> / <span class="guide-key-tag">L</span></td>
                <td>一瞬の<strong>剛体アーマー</strong>＋相手に痛打を与え<strong>真上天高く打ち上げる</strong>衝撃波・CT 4.2秒。</td>
              </tr>
              <tr>
                <td><strong>つかみ</strong></td>
                <td><span class="guide-key-tag">Yボタン / LB</span> / <span class="guide-key-tag">E / U</span></td>
                <td>相手をがっぷり四つに掴む。<strong>防御貫通＋確定2秒拘束！</strong>レバーで<strong>寄り切り</strong>、追加入力で<strong>上手投げ</strong>へ派生。</td>
              </tr>
              <tr>
                <td><strong>鉄壁防御</strong></td>
                <td><span class="guide-key-tag">RT / LT / A+B</span> / <span class="guide-key-tag">Space</span></td>
                <td>相手の攻撃を受け止める。<strong>使いすぎ・耐久0で気絶！</strong></td>
              </tr>
            </tbody>
          </table>
          <button class="guide-close-btn" id="guide-close-btn">閉じる</button>
        </div>
      </div>

      <!-- ===== 試合決着リザルト画面 ===== -->
      <div id="match-result-modal">
        <div class="result-modal-content">
          <div class="result-badge">◆ 二本先取・本割決着 ◆</div>
          <h2 class="result-title" id="result-winner-title">東方 蒼天龍 全勝優勝！！</h2>
          <div class="result-sub" id="result-sub-text">幕内最高優勝・賜杯授与</div>
          
          <div class="result-score-box">
            <div class="result-player-score">
              <div class="result-fighter-name p1-color">東方 蒼天龍</div>
              <div class="result-stars" id="result-p1-stars">★★</div>
            </div>
            <div class="result-vs">VS</div>
            <div class="result-player-score">
              <div class="result-fighter-name p2-color" id="result-p2-name">西方 紅炎山</div>
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
              <div class="skill-box ready" id="p1-buchi-cd">
                <div class="skill-fill" id="p1-buchi-fill"></div>
                <div class="skill-label">${buttonIconHtml([1])}${verticalText('ぶちかまし')}</div>
                <div class="charge-gauge-container"><div class="charge-gauge-fill" id="p1-charge-bar"></div></div>
              </div>
              <div class="skill-box ready" id="p1-shiko-cd">
                <div class="skill-fill" id="p1-shiko-fill"></div>
                <div class="skill-label">${buttonIconHtml([2])}${verticalText('四股')}</div>
              </div>
              <div class="skill-box" id="p1-guard-box">
                <div class="skill-fill guard-fill" id="p1-guard-bar"></div>
                <div class="skill-label">${GUARD_ICON_HTML}${verticalText('防御')}</div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="armor-badge" id="p1-armor-badge">剛体アーマー</span>
              <span class="guard-badge" id="p1-guard-badge">鉄壁防御</span>
              <span class="stun-badge" id="p1-stun-badge">体勢崩壊</span>
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
              <div class="skill-box p2-side ready" id="p2-buchi-cd">
                <div class="skill-fill" id="p2-buchi-fill"></div>
                <div class="skill-label">${buttonIconHtml([1])}${verticalText('ぶちかまし')}</div>
                <div class="charge-gauge-container"><div class="charge-gauge-fill" id="p2-charge-bar"></div></div>
              </div>
              <div class="skill-box p2-side ready" id="p2-shiko-cd">
                <div class="skill-fill" id="p2-shiko-fill"></div>
                <div class="skill-label">${buttonIconHtml([2])}${verticalText('四股')}</div>
              </div>
              <div class="skill-box p2-side" id="p2-guard-box">
                <div class="skill-fill guard-fill" id="p2-guard-bar"></div>
                <div class="skill-label">${GUARD_ICON_HTML}${verticalText('防御')}</div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="stun-badge" id="p2-stun-badge">体勢崩壊</span>
              <span class="guard-badge" id="p2-guard-badge">鉄壁防御</span>
              <span class="armor-badge" id="p2-armor-badge">剛体アーマー</span>
            </div>
          </div>
        </div>

        <!-- 中央コール（はっけよい、のこった、勝負あり） -->
        <div class="center-announcement" id="center-announcement">
          <div class="banner-main" id="banner-main">はっけよい！</div>
          <div class="banner-sub" id="banner-sub">のこった！のこった！</div>
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
    this.p1GuardBadge = document.getElementById('p1-guard-badge')!;
    this.p2GuardBadge = document.getElementById('p2-guard-badge')!;
    this.p1StunBadge = document.getElementById('p1-stun-badge')!;
    this.p2StunBadge = document.getElementById('p2-stun-badge')!;
    this.p1GuardBar = document.getElementById('p1-guard-bar')!;
    this.p2GuardBar = document.getElementById('p2-guard-bar')!;
    this.p1BuchiCdEl = document.getElementById('p1-buchi-cd')!;
    this.p2BuchiCdEl = document.getElementById('p2-buchi-cd')!;
    this.p1ShikoCdEl = document.getElementById('p1-shiko-cd')!;
    this.p2ShikoCdEl = document.getElementById('p2-shiko-cd')!;
    this.p1BuchiFillEl = document.getElementById('p1-buchi-fill')!;
    this.p2BuchiFillEl = document.getElementById('p2-buchi-fill')!;
    this.p1ShikoFillEl = document.getElementById('p1-shiko-fill')!;
    this.p2ShikoFillEl = document.getElementById('p2-shiko-fill')!;
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
    this.resultWinnerTitleEl.textContent = `${winnerName} 優勝！！`;
    this.resultSubTextEl.textContent = '幕内最高優勝・賜杯授与';
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
    p1Guard: boolean,
    p2Guard: boolean,
    p1Stunned: boolean,
    p2Stunned: boolean,
    p1GuardGauge: number,
    p2GuardGauge: number,
    p1BuchiCdRatio: number,
    p2BuchiCdRatio: number,
    p1ShikoCdRatio: number,
    p2ShikoCdRatio: number,
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

    // ガード耐久ゲージ
    this.updateGuardGauge(this.p1GuardBar, p1GuardGauge);
    this.updateGuardGauge(this.p2GuardBar, p2GuardGauge);

    // スーパーアーマー / ガード中 / スタン（体勢崩壊）表示
    this.p1ArmorBadge.classList.toggle('active', p1SuperArmor);
    this.p2ArmorBadge.classList.toggle('active', p2SuperArmor);
    this.p1GuardBadge.classList.toggle('active', p1Guard);
    this.p2GuardBadge.classList.toggle('active', p2Guard);
    this.p1StunBadge.classList.toggle('active', p1Stunned);
    this.p2StunBadge.classList.toggle('active', p2Stunned);

    // ぶちかまし / 四股クールタイム表示
    this.updateSkillBox(this.p1BuchiCdEl, this.p1BuchiFillEl, p1BuchiCdRatio);
    this.updateSkillBox(this.p2BuchiCdEl, this.p2BuchiFillEl, p2BuchiCdRatio);
    this.updateSkillBox(this.p1ShikoCdEl, this.p1ShikoFillEl, p1ShikoCdRatio);
    this.updateSkillBox(this.p2ShikoCdEl, this.p2ShikoFillEl, p2ShikoCdRatio);

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

  private updateGuardGauge(bar: HTMLElement, gauge: number) {
    const g = Math.max(0, Math.min(100, gauge));
    setHeight(bar, `${g}%`);
    bar.classList.toggle('warning', g < 30);
  }

  private updateSkillBox(boxEl: HTMLElement, fillEl: HTMLElement, remainingRatio: number) {
    const ready = remainingRatio <= 0.02;
    const cls = `skill-box${boxEl.classList.contains('p2-side') ? ' p2-side' : ''} ${ready ? 'ready' : 'cooling'}`;
    if (boxEl.className !== cls) boxEl.className = cls;
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
