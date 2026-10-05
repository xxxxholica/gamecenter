import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../../shared/arcadeResultMenu';
export type GameMode = 'pve' | 'pvp';

export class UIManager {
  // バトルHUD要素
  private battleHudEl!: HTMLElement;
  private p1PercentEl!: HTMLElement;
  private p2PercentEl!: HTMLElement;
  private p1KnockbackBar!: HTMLElement;
  private p2KnockbackBar!: HTMLElement;
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
  private p1GuardValEl!: HTMLElement;
  private p2GuardValEl!: HTMLElement;
  private p1BuchiCdEl!: HTMLElement;
  private p2BuchiCdEl!: HTMLElement;
  private p1ShikoCdEl!: HTMLElement;
  private p2ShikoCdEl!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;
  private controllerNoticeEl!: HTMLElement;

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

        .hud-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          padding: 12px 28px;
          position: relative;
        }

        /* 洗練された力士ステータスカード（和モダン・フロストガラス） */
        .fighter-card {
          background: linear-gradient(135deg, rgba(14, 18, 24, 0.85) 0%, rgba(8, 11, 16, 0.75) 100%);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
          border-radius: 10px;
          padding: 11px 16px 9px 16px;
          width: 360px;
          min-width: 360px;
          box-sizing: border-box;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.15);
          position: relative;
          transition: transform 0.2s ease;
          white-space: nowrap;
        }

        /* 1P: 東方 蒼天龍（シアン・ゴールド基調、左シャープライン） */
        .fighter-card.p1-card {
          border-left: 4px solid #00d2ff;
          border-top: 1px solid rgba(0, 210, 255, 0.35);
          border-right: 1px solid rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(0, 210, 255, 0.2);
        }

        /* 2P/CPU: 西方 紅炎山（クリムゾンレッド基調、右シャープライン、完全ミラー整列） */
        .fighter-card.p2-card {
          border-right: 4px solid #ff3366;
          border-top: 1px solid rgba(255, 51, 102, 0.35);
          border-left: 1px solid rgba(255, 255, 255, 0.08);
          border-bottom: 1px solid rgba(255, 51, 102, 0.2);
          text-align: right;
        }

        /* 力士情報ヘッダー */
        .fighter-header {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-bottom: 4px;
          white-space: nowrap;
        }

        .p2-card .fighter-header {
          flex-direction: row-reverse;
        }

        .player-badge {
          font-size: 11px;
          font-weight: 900;
          padding: 2px 7px;
          border-radius: 4px;
          letter-spacing: 1px;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .p1-badge {
          background: linear-gradient(135deg, #0072ff, #00d2ff);
          color: #ffffff;
          box-shadow: 0 0 8px rgba(0, 210, 255, 0.6);
        }

        .p2-badge {
          background: linear-gradient(135deg, #ff0844, #ff4e50);
          color: #ffffff;
          box-shadow: 0 0 8px rgba(255, 78, 80, 0.6);
        }

        .fighter-name {
          font-size: 19px;
          font-weight: 900;
          letter-spacing: 1.5px;
          color: #ffffff;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.8);
          white-space: nowrap;
        }

        .p1-color {
          color: #f0f9ff;
          text-shadow: 0 0 10px rgba(0, 210, 255, 0.4), 0 2px 6px #000;
        }

        .p2-color {
          color: #fff0f2;
          text-shadow: 0 0 10px rgba(255, 51, 102, 0.4), 0 2px 6px #000;
        }

        .fighter-rank {
          font-size: 10.5px;
          color: #d4af37;
          border: 1px solid rgba(212, 175, 55, 0.4);
          background: rgba(35, 28, 20, 0.6);
          padding: 1px 5px;
          border-radius: 3px;
          font-weight: bold;
          letter-spacing: 1px;
          white-space: nowrap;
        }

        /* 星取り（白星・黒星） */
        .stars-container {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 16px;
          margin-left: auto;
          white-space: nowrap;
        }

        .p2-card .stars-container {
          margin-left: 0;
          margin-right: auto;
          flex-direction: row-reverse;
        }

        .star-win {
          color: #ffd700;
          text-shadow: 0 0 10px rgba(255, 215, 0, 0.9), 0 0 18px rgba(255, 215, 0, 0.5);
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
          align-items: baseline;
          justify-content: space-between;
          margin: 1px 0 3px 0;
          white-space: nowrap;
        }

        .p2-card .knockback-wrap {
          flex-direction: row-reverse;
        }

        .knockback-label-box {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
          white-space: nowrap;
        }

        .p2-card .knockback-label-box {
          align-items: flex-end;
        }

        .knockback-sub {
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 2px;
          color: #7890a8;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .knockback-label {
          font-size: 12px;
          font-weight: bold;
          color: #e0d8cc;
          letter-spacing: 1px;
          white-space: nowrap;
        }

        .damage-number-box {
          display: flex;
          align-items: flex-start;
          font-family: 'Impact', 'Arial Black', -apple-system, sans-serif;
          font-style: italic;
          line-height: 0.92;
          white-space: nowrap;
        }

        .knockback-value {
          font-size: 48px;
          font-weight: 900;
          letter-spacing: -1px;
          color: #ffffff;
          transition: color 0.15s ease, text-shadow 0.15s ease;
          display: inline-block;
          white-space: nowrap;
        }

        .knockback-unit {
          font-size: 20px;
          font-weight: 900;
          color: #90a4ae;
          margin-left: 2px;
          margin-top: 4px;
          white-space: nowrap;
        }

        /* 吹き飛び蓄積ゲージ（スリム＆スタイリッシュバー） */
        .knockback-gauge-container {
          width: 100%;
          height: 6px;
          background: rgba(0, 0, 0, 0.65);
          border-radius: 3px;
          margin-top: 2px;
          margin-bottom: 7px;
          overflow: hidden;
          box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.8);
          position: relative;
        }

        .knockback-gauge-fill {
          height: 100%;
          width: 0%;
          border-radius: 3px;
          transition: width 0.12s cubic-bezier(0.1, 0.9, 0.2, 1), background 0.2s ease, box-shadow 0.2s ease;
        }

        .p2-card .knockback-gauge-fill {
          float: right;
        }

        .knockback-gauge-fill.level-low {
          background: linear-gradient(90deg, #00d2ff, #70e000);
          box-shadow: 0 0 8px rgba(112, 224, 0, 0.7);
        }

        .knockback-gauge-fill.level-mid {
          background: linear-gradient(90deg, #70e000, #ffea00, #ff9e00);
          box-shadow: 0 0 10px rgba(255, 158, 0, 0.8);
        }

        .knockback-gauge-fill.level-high {
          background: linear-gradient(90deg, #ff9e00, #ff4800, #ff0054);
          box-shadow: 0 0 12px rgba(255, 0, 84, 0.9);
        }

        .knockback-gauge-fill.level-danger {
          background: linear-gradient(90deg, #ff0054, #d00000, #9d4edd);
          box-shadow: 0 0 16px #ff0054;
          animation: dangerPulse 0.4s infinite alternate;
        }

        @keyframes dangerPulse {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.5); }
        }

        /* ガード耐久ゲージ（スマート一行レイアウト） */
        .guard-gauge-wrap {
          margin-bottom: 8px;
          white-space: nowrap;
        }

        .guard-gauge-label {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          color: #70b0d0;
          margin-bottom: 3px;
          font-weight: bold;
          letter-spacing: 0.5px;
          white-space: nowrap;
        }

        .p2-card .guard-gauge-label {
          flex-direction: row-reverse;
        }

        .guard-tag-name {
          display: flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }

        .guard-gauge-container {
          width: 100%;
          height: 4px;
          background: rgba(0, 0, 0, 0.6);
          border-radius: 2px;
          overflow: hidden;
        }

        .guard-gauge-fill {
          height: 100%;
          width: 100%;
          background: linear-gradient(90deg, #0077b6, #00d2ff);
          border-radius: 2px;
          transition: width 0.08s linear, background 0.2s ease;
        }

        .p2-card .guard-gauge-fill {
          float: right;
        }

        .guard-gauge-fill.warning {
          background: linear-gradient(90deg, #d90429, #f77f00);
          animation: guardWarningPulse 0.4s infinite alternate;
        }

        @keyframes guardWarningPulse {
          0% { filter: brightness(1); }
          100% { filter: brightness(1.4); }
        }

        /* スキルクールダウン（洗練されたコンパクトチップ） */
        .skills-cd-row {
          display: flex;
          gap: 6px;
          white-space: nowrap;
        }

        .p2-card .skills-cd-row {
          flex-direction: row-reverse;
        }

        .cd-badge {
          flex: 1;
          min-width: 0;
          background: rgba(20, 24, 30, 0.65);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 5px;
          padding: 4px 7px;
          font-size: 10.5px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #a0aab4;
          transition: all 0.2s ease;
          position: relative;
          overflow: hidden;
          white-space: nowrap;
          box-sizing: border-box;
        }

        .cd-badge.ready {
          border-color: rgba(46, 204, 113, 0.7);
          color: #2ecc71;
          background: rgba(46, 204, 113, 0.12);
          font-weight: bold;
          box-shadow: 0 0 10px rgba(46, 204, 113, 0.25);
        }

        .cd-badge.cooling {
          border-color: rgba(230, 126, 34, 0.5);
          color: #e67e22;
          background: rgba(230, 126, 34, 0.08);
        }

        .buchi-badge-wrap {
          flex-direction: column;
          align-items: stretch !important;
          padding: 3px 7px 4px 7px !important;
          white-space: nowrap;
        }

        .buchi-badge-text {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 10.5px;
          white-space: nowrap;
        }

        .buchi-badge-text span {
          white-space: nowrap;
        }

        .charge-gauge-container {
          width: 100%;
          height: 2.5px;
          background: rgba(255, 255, 255, 0.12);
          border-radius: 2px;
          margin-top: 3px;
          overflow: hidden;
        }

        .charge-gauge-fill {
          height: 100%;
          width: 0%;
          background: linear-gradient(90deg, #ffd700, #ff3d00);
          transition: width 0.05s linear;
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
          background: #ffaa00;
          color: #000;
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
          background: #00b4d8;
          color: #fff;
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
          background: #ff0054;
          color: #fff;
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

        /* 画面上部中央のスマートピルバー */
        .top-nav-bar {
          position: absolute;
          top: 12px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          gap: 8px;
          align-items: center;
          z-index: 10;
          white-space: nowrap;
          max-width: 500px;
        }

        .top-pill {
          font-size: 11px;
          letter-spacing: 0.5px;
          padding: 3px 10px;
          border-radius: 12px;
          background: rgba(12, 16, 22, 0.75);
          backdrop-filter: blur(8px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
          white-space: nowrap;
        }

        .controller-status {
          color: #55ff99;
          border: 1px solid rgba(85, 255, 153, 0.35);
          white-space: nowrap;
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
                <td><strong>すり足（ダッシュ）</strong></td>
                <td><span class="guide-key-tag">レバー2回</span> / <span class="guide-key-tag">RB</span> / <span class="guide-key-tag">Shift</span></td>
                <td>低姿勢で一気に踏み込む高速接近。</td>
              </tr>
              <tr>
                <td><strong>張り手（弱攻撃）</strong></td>
                <td><span class="guide-key-tag">Aボタン</span> / <span class="guide-key-tag">J</span></td>
                <td>発生最速の突っ張り連打。ノックバック倍率を細かく加算。</td>
              </tr>
              <tr>
                <td><strong>ぶちかまし（強攻撃）</strong></td>
                <td><span class="guide-key-tag">Bボタン</span> / <span class="guide-key-tag">K (長押し)</span></td>
                <td>長押しタメで威力・距離UP。大吹き飛ばし（CT 2.8秒）。</td>
              </tr>
              <tr>
                <td><strong>四股（特殊）</strong></td>
                <td><span class="guide-key-tag">Xボタン</span> / <span class="guide-key-tag">L</span></td>
                <td>一瞬の<strong>剛体アーマー</strong>＋相手に痛打を与え<strong>真上天高く打ち上げる</strong>衝撃波（CT 4.2秒）。</td>
              </tr>
              <tr>
                <td><strong>つかみ（組み手）</strong></td>
                <td><span class="guide-key-tag">Yボタン / LB</span> / <span class="guide-key-tag">E / U</span></td>
                <td>相手をがっぷり四つに掴む。<strong>ガード貫通＋確定2秒拘束！</strong>レバーで<strong>寄り切り</strong>、追加入力で<strong>上手投げ</strong>へ派生。</td>
              </tr>
              <tr>
                <td><strong>鉄壁ガード</strong></td>
                <td><span class="guide-key-tag">RT / LT / A+B</span> / <span class="guide-key-tag">Space</span></td>
                <td>相手の攻撃を受け止める。<strong>使いすぎ・耐久0で気絶！</strong></td>
              </tr>
            </tbody>
          </table>
          <div style="margin-top: 10px; margin-bottom: 18px; font-size: 11.5px; color: #d4af37; background: rgba(0,0,0,0.4); padding: 8px 12px; border-radius: 6px; border: 1px solid #554433; line-height: 1.6;">
            <strong>【二人対戦（1P vs 2P）の操作について】</strong><br>
            ・<strong>アケコン2台</strong>: 1台目＝1P、2台目＝2P に自動割り当てされます。<br>
            ・<strong>1Pアケコン ＋ 2Pキーボード</strong>: 2Pは [矢印キー移動] ＋ [テンキー または B/N/M/O/Pキー] で操作できます。<br>
            ・<strong>キーボード1台での2人対戦</strong>: 1P [WASD+JKL] と 2P [矢印キー+テンキー] で完全に分離されています。
          </div>
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
              <span class="fighter-rank">横綱</span>
              <div class="stars-container" id="p1-stars"></div>
            </div>

            <!-- 主役：ダメージ蓄積率（吹き飛び率） -->
            <div class="knockback-wrap">
              <div class="knockback-label-box">
                <span class="knockback-sub">DAMAGE</span>
                <span class="knockback-label">蓄積率</span>
              </div>
              <div class="damage-number-box">
                <span class="knockback-value" id="p1-knockback">0</span>
                <span class="knockback-unit">%</span>
              </div>
            </div>

            <!-- 吹き飛び蓄積ゲージ -->
            <div class="knockback-gauge-container">
              <div class="knockback-gauge-fill level-low" id="p1-knockback-bar"></div>
            </div>

            <!-- ガード耐久ゲージ -->
            <div class="guard-gauge-wrap">
              <div class="guard-gauge-label">
                <span class="guard-tag-name">🛡️ GUARD</span>
                <span id="p1-guard-val">100%</span>
              </div>
              <div class="guard-gauge-container">
                <div class="guard-gauge-fill" id="p1-guard-bar"></div>
              </div>
            </div>

            <!-- スキルクールダウン（洗練チップ） -->
            <div class="skills-cd-row">
              <div class="cd-badge buchi-badge-wrap ready" id="p1-buchi-cd">
                <div class="buchi-badge-text">
                  <span>[B] ぶちかまし</span>
                  <span id="p1-buchi-val">READY</span>
                </div>
                <div class="charge-gauge-container">
                  <div class="charge-gauge-fill" id="p1-charge-bar"></div>
                </div>
              </div>
              <div class="cd-badge ready" id="p1-shiko-cd">
                <span>[X] 四股</span>
                <span id="p1-shiko-val">READY</span>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="armor-badge" id="p1-armor-badge">剛体アーマー</span>
              <span class="guard-badge" id="p1-guard-badge">鉄壁防御</span>
              <span class="stun-badge" id="p1-stun-badge">⚡ 体勢崩壊 ⚡</span>
            </div>
          </div>

          <!-- 画面上部中央のスマートピルバー -->
          <div class="top-nav-bar">
            <div class="top-pill controller-status" id="controller-status">
              ⌨️ キーボード / 🎮 アケコン対応
            </div>
          </div>

          <!-- プレイヤー2 / CPU（西方 紅炎山） -->
          <div class="fighter-card p2-card">
            <div class="fighter-header">
              <div class="stars-container" id="p2-stars"></div>
              <span class="fighter-rank" id="p2-rank-label">大関 (CPU)</span>
              <span class="fighter-name p2-color">西方 紅炎山</span>
              <span class="player-badge p2-badge" id="p2-badge-tag">2P</span>
            </div>

            <!-- 主役：ダメージ蓄積率（吹き飛び率） -->
            <div class="knockback-wrap">
              <div class="damage-number-box">
                <span class="knockback-value" id="p2-knockback">0</span>
                <span class="knockback-unit">%</span>
              </div>
              <div class="knockback-label-box">
                <span class="knockback-sub">DAMAGE</span>
                <span class="knockback-label">蓄積率</span>
              </div>
            </div>

            <!-- 吹き飛び蓄積ゲージ -->
            <div class="knockback-gauge-container">
              <div class="knockback-gauge-fill level-low" id="p2-knockback-bar"></div>
            </div>

            <!-- ガード耐久ゲージ -->
            <div class="guard-gauge-wrap">
              <div class="guard-gauge-label">
                <span id="p2-guard-val">100%</span>
                <span class="guard-tag-name">GUARD 🛡️</span>
              </div>
              <div class="guard-gauge-container">
                <div class="guard-gauge-fill" id="p2-guard-bar"></div>
              </div>
            </div>

            <!-- スキルクールダウン（洗練チップ） -->
            <div class="skills-cd-row">
              <div class="cd-badge ready" id="p2-shiko-cd">
                <span>[X] 四股</span>
                <span id="p2-shiko-val">READY</span>
              </div>
              <div class="cd-badge buchi-badge-wrap ready" id="p2-buchi-cd">
                <div class="buchi-badge-text">
                  <span>[B] ぶちかまし</span>
                  <span id="p2-buchi-val">READY</span>
                </div>
                <div class="charge-gauge-container">
                  <div class="charge-gauge-fill" id="p2-charge-bar"></div>
                </div>
              </div>
            </div>

            <div class="badge-status-wrap">
              <span class="stun-badge" id="p2-stun-badge">⚡ 体勢崩壊 ⚡</span>
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
    this.p1KnockbackBar = document.getElementById('p1-knockback-bar')!;
    this.p2KnockbackBar = document.getElementById('p2-knockback-bar')!;
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
    this.p1GuardValEl = document.getElementById('p1-guard-val')!;
    this.p2GuardValEl = document.getElementById('p2-guard-val')!;
    this.p1BuchiCdEl = document.getElementById('p1-buchi-cd')!;
    this.p2BuchiCdEl = document.getElementById('p2-buchi-cd')!;
    this.p1ShikoCdEl = document.getElementById('p1-shiko-cd')!;
    this.p2ShikoCdEl = document.getElementById('p2-shiko-cd')!;
    this.bannerEl = document.getElementById('center-announcement')!;
    this.bannerSubEl = document.getElementById('banner-sub')!;
    this.controllerNoticeEl = document.getElementById('controller-status')!;

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
    this.resultSubTextEl.textContent = '幕内最高優勝・賜杯授与（二本先取達成）';
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
    this.documentP2Label(mode === 'pvp' ? '大関 (2P)' : '大関 (CPU)');
  }

  public documentP2Label(text: string) {
    const el = document.getElementById('p2-rank-label');
    if (el) el.textContent = text;
    const badge = document.getElementById('p2-badge-tag');
    if (badge) badge.textContent = text.includes('2P') ? '2P' : 'CPU';
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
    p1BuchiCd: number,
    p2BuchiCd: number,
    p1ShikoCd: number,
    p2ShikoCd: number,
    hasGamepad: boolean
  ) {
    // 吹き飛び蓄積率（パーセント数値 ＆ ゲージ ＆ ダイナミックグロー）
    this.updateDamageStyle(this.p1PercentEl, this.p1KnockbackBar, p1Percent);
    this.updateDamageStyle(this.p2PercentEl, this.p2KnockbackBar, p2Percent);

    // 白星・黒星マーク
    this.p1WinsEl.innerHTML = this.renderStars(p1Wins);
    this.p2WinsEl.innerHTML = this.renderStars(p2Wins);

    // チャージバー（ぶちかましタメ）
    this.p1ChargeBar.style.width = `${Math.min(100, p1Charge * 100)}%`;
    this.p2ChargeBar.style.width = `${Math.min(100, p2Charge * 100)}%`;

    // ガード耐久ゲージ
    const p1Gg = Math.max(0, Math.min(100, p1GuardGauge));
    this.p1GuardBar.style.width = `${p1Gg}%`;
    this.p1GuardValEl.textContent = `${Math.floor(p1Gg)}%`;
    if (p1Gg < 30) this.p1GuardBar.classList.add('warning');
    else this.p1GuardBar.classList.remove('warning');

    const p2Gg = Math.max(0, Math.min(100, p2GuardGauge));
    this.p2GuardBar.style.width = `${p2Gg}%`;
    this.p2GuardValEl.textContent = `${Math.floor(p2Gg)}%`;
    if (p2Gg < 30) this.p2GuardBar.classList.add('warning');
    else this.p2GuardBar.classList.remove('warning');

    // スーパーアーマー表示
    if (p1SuperArmor) this.p1ArmorBadge.classList.add('active');
    else this.p1ArmorBadge.classList.remove('active');

    if (p2SuperArmor) this.p2ArmorBadge.classList.add('active');
    else this.p2ArmorBadge.classList.remove('active');

    // ガード中表示
    if (p1Guard) this.p1GuardBadge.classList.add('active');
    else this.p1GuardBadge.classList.remove('active');

    if (p2Guard) this.p2GuardBadge.classList.add('active');
    else this.p2GuardBadge.classList.remove('active');

    // スタン（体勢崩壊）表示
    if (p1Stunned) this.p1StunBadge.classList.add('active');
    else this.p1StunBadge.classList.remove('active');

    if (p2Stunned) this.p2StunBadge.classList.add('active');
    else this.p2StunBadge.classList.remove('active');

    // ぶちかましクールタイム表示
    this.updateCdBadge(this.p1BuchiCdEl, 'p1-buchi-val', p1BuchiCd);
    this.updateCdBadge(this.p2BuchiCdEl, 'p2-buchi-val', p2BuchiCd);

    // 四股クールタイム表示
    this.updateCdBadge(this.p1ShikoCdEl, 'p1-shiko-val', p1ShikoCd);
    this.updateCdBadge(this.p2ShikoCdEl, 'p2-shiko-val', p2ShikoCd);

    // コントローラー接続インジケーター
    if (hasGamepad) {
      this.controllerNoticeEl.textContent = '🎮 アケコン接続中';
      this.controllerNoticeEl.style.color = '#55ff99';
      this.controllerNoticeEl.style.borderColor = 'rgba(85, 255, 153, 0.4)';
    } else {
      this.controllerNoticeEl.textContent = '⌨️ キーボード / 🎮 アケコン対応';
      this.controllerNoticeEl.style.color = '#e0c8a0';
      this.controllerNoticeEl.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    }
  }

  /**
   * 吹き飛び蓄積率のスタイリング（スマブラ風ダイナミックカラー＆グロー）
   */
  private updateDamageStyle(el: HTMLElement, bar: HTMLElement, percent: number) {
    el.textContent = Math.floor(percent).toString();
    const kbWidth = Math.min(100, (percent / 120.0) * 100);
    bar.style.width = `${kbWidth}%`;

    bar.classList.remove('level-low', 'level-mid', 'level-high', 'level-danger');
    if (percent < 35) {
      el.style.color = '#f5faff';
      el.style.textShadow = '0 0 10px rgba(0, 210, 255, 0.4), 2px 2px 4px #000';
      bar.classList.add('level-low');
    } else if (percent < 70) {
      el.style.color = '#ffe600';
      el.style.textShadow = '0 0 14px rgba(255, 230, 0, 0.7), 2px 2px 4px #000';
      bar.classList.add('level-mid');
    } else if (percent < 110) {
      el.style.color = '#ff8c00';
      el.style.textShadow = '0 0 18px rgba(255, 140, 0, 0.85), 2px 2px 4px #000';
      bar.classList.add('level-high');
    } else {
      el.style.color = '#ff1744';
      el.style.textShadow = '0 0 24px #ff1744, 0 0 38px #d50000, 2px 2px 4px #000';
      bar.classList.add('level-danger');
    }
  }

  private updateCdBadge(badgeEl: HTMLElement, valElId: string, cdSec: number) {
    const valEl = document.getElementById(valElId);
    if (!valEl) return;

    if (cdSec <= 0.05) {
      badgeEl.className = badgeEl.id.includes('buchi') ? 'cd-badge buchi-badge-wrap ready' : 'cd-badge ready';
      valEl.textContent = 'READY';
    } else {
      badgeEl.className = badgeEl.id.includes('buchi') ? 'cd-badge buchi-badge-wrap cooling' : 'cd-badge cooling';
      valEl.textContent = `${cdSec.toFixed(1)}s`;
    }
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
