// 剛体大相撲のUI(タイトル・HUD・結果など)の CSS。UIManager が DOM に差し込む <style> の中身。
// UIManager.ts から、文字列をそのまま移した(内容は変えていない)。
import callFontUrl from '../assets/fonts/NotoSerifJP-Black-subset.woff2?url';

export const UI_CSS = `
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
          width: 700px;
          max-width: 92%;
          padding: 32px 40px 28px;
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
          font-size: 68px;
          font-weight: 900;
          color: #ffffff;
          letter-spacing: 0.2em;
          -webkit-text-stroke: 3px #000;
          paint-order: stroke fill;
          text-shadow: 0 4px 16px rgba(0, 0, 0, 0.7);
          margin: 4px 0 32px 0;
          white-space: normal;
          line-height: 1.15;
        }

        .result-title.win { color: #ffe27a; text-shadow: 0 0 24px rgba(255, 215, 0, 0.55), 0 4px 16px rgba(0, 0, 0, 0.7); }
        .result-title.lose { color: #aeb6c8; }

        .result-subtitle {
          font-size: 20px;
          font-weight: 800;
          color: #d8cab2;
          letter-spacing: 3px;
          margin: -18px 0 28px 0;
          text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
        }
        .result-subtitle:empty {
          display: none;
        }







        .result-buttons {
          margin-bottom: 4px;
        }

        /* ===== 多人数(オンライン2〜4人)の表示 ===== */
        .multi-row { display: none; gap: 10px; align-items: flex-start; justify-content: center; }
        #battle-hud.multi .multi-row { display: flex; }
        /* 自分の技の箱(下部中央)だけを残し、1対1用のカード・中央の星取りは隠す */
        #battle-hud.multi .p2-card,
        #battle-hud.multi .hud-center-marks,
        #battle-hud.multi .p1-card { display: none; }
        #battle-hud.multi .hud-top { gap: 0; }
        .mcard {
          position: relative;
          min-width: 124px;
          padding: 4px 8px 6px;
          text-align: center;
          white-space: nowrap;
          border-bottom: 3px solid var(--mc, #fff);
          background: linear-gradient(180deg, rgba(8, 6, 4, 0.0) 0%, rgba(8, 6, 4, 0.55) 100%);
          transition: opacity 0.25s ease;
        }
        .mcard.out { opacity: 0.38; }
        .mcard.me { box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.85), 0 0 14px var(--mc, #fff); border-radius: 3px; }
        .mcard .fighter-header { margin-bottom: 0; }
        .mcard .player-badge { background: var(--mc, #666); }
        .mcard .fighter-name { font-size: 15px; letter-spacing: 1px; }
        .mcard .knockback-wrap { margin: 0; }
        .mcard .knockback-value { font-size: 42px; }
        .mcard .knockback-unit { font-size: 18px; margin-top: 2px; }
        .mcard .stars-container { justify-content: center; font-size: 18px; }

        /* 結果: 順位表(オンライン用。CPU百人組手では空にして隠す) */
        .result-list { margin-bottom: 28px; background: rgba(0, 0, 0, 0.5); border: 1px solid #554433; border-radius: 8px; padding: 12px 18px; }
        .result-list:empty { display: none; }
        .result-row { display: flex; align-items: center; gap: 14px; padding: 10px 6px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
        .result-row:last-child { border-bottom: none; }
        .result-row .rank { width: 2em; font-size: 28px; font-weight: 900; color: #d4af37; text-align: center; }
        .result-row .rname { flex: 1; text-align: left; font-size: 24px; font-weight: bold; letter-spacing: 2px; }
        .result-row .rme { display: inline-block; font-size: 15px; font-weight: 900; line-height: 1.4; color: #000; background: #ffd700; border-radius: 3px; padding: 5px 12px; margin-left: 12px; vertical-align: middle; letter-spacing: 1px; }
        .result-row .rstars { font-size: 30px; color: #ffd700; letter-spacing: 4px; }

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

        /* 百人組手の撃破数カウンター（スターは一切使わない） */
        .kumite-counter {
          display: none;
          align-items: baseline;
          gap: 5px;
          padding: 2px 12px;
          border-radius: 4px;
          background: rgba(20, 14, 10, 0.78);
          border: 1px solid rgba(212, 175, 55, 0.65);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.65);
          white-space: nowrap;
        }
        #battle-hud.kumite .hud-center-marks .stars-container,
        #battle-hud.kumite .hud-center-marks .marks-divider {
          display: none;
        }
        #battle-hud.kumite .kumite-counter {
          display: inline-flex;
        }
        .kumite-label {
          font-size: 13px;
          font-weight: 900;
          color: #e6d09c;
          letter-spacing: 2px;
          text-shadow: 0 0 4px #000;
        }
        .kumite-count {
          font-size: 24px;
          font-weight: 900;
          color: #ffd700;
          text-shadow: 0 0 6px #000, 0 0 10px rgba(255, 215, 0, 0.45);
        }
        .kumite-slash {
          font-size: 14px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.65);
        }
        .kumite-total {
          font-size: 16px;
          font-weight: 900;
          color: #f6efdc;
          text-shadow: 0 0 4px #000;
        }
        .result-row .rkills {
          font-size: 28px;
          font-weight: 900;
          color: #ffd700;
          letter-spacing: 2px;
          white-space: nowrap;
        }
        .result-row .rsub {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: #cbbba0;
          letter-spacing: 1px;
          margin-top: 2px;
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

        /* 技: 下部中央に1行で並べる。クールタイムが回復するにつれて枠の中が満ちていく */
        .skill-stack {
          position: fixed;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: center;
          gap: 16px;
        }

        .skill-box {
          position: relative;
          width: 248px;
          flex: 0 0 248px;
          height: 64px;
          padding: 0 18px;
          box-sizing: border-box;
          border: 2px solid #b8944a;
          border-radius: 4px;
          background: rgba(22, 17, 13, 0.88);
          overflow: hidden;
          box-shadow: 0 6px 14px rgba(0, 0, 0, 0.5), inset 0 0 0 2px rgba(22, 17, 13, 0.88), inset 0 0 0 3px rgba(184, 148, 74, 0.4);
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
        }

        /* 回復の進み具合(JSで width を更新)。回復した分だけ左から満ちる */
        .skill-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 100%;
          /* クールタイム中は、くすんだ黄色が左から溜まっていく。満ちると明るい金色(下の .ready)になる */
          background: linear-gradient(90deg, rgba(150, 118, 40, 0.85), rgba(196, 160, 60, 0.85));
          transition: background 0.15s ease;
        }

        .skill-box.ready {
          border-color: #e0b84a;
          box-shadow: 0 0 12px rgba(224, 184, 74, 0.65), inset 0 0 0 2px rgba(22, 17, 13, 0.4);
        }

        .skill-box.ready .skill-fill {
          background: linear-gradient(90deg, rgba(176, 138, 52, 0.95), rgba(232, 193, 90, 0.95));
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
          background: linear-gradient(90deg, rgba(34, 82, 128, 0.85), rgba(70, 126, 178, 0.85));
        }

        .skill-box.grab.ready {
          border-color: #6fb6f0;
          box-shadow: 0 0 12px rgba(90, 170, 240, 0.65), inset 0 0 0 2px rgba(22, 17, 13, 0.4);
        }

        .skill-box.grab.ready .skill-fill {
          background: linear-gradient(90deg, rgba(48, 118, 188, 0.95), rgba(112, 184, 244, 0.95));
        }

        /* ボタンアイコンと技名を1行でボックスの中に並べる(操作部分は左揃え、余った余白で技名を中央揃え) */
        .skill-label {
          position: relative;
          z-index: 1;
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: row;
          align-items: center;
          justify-content: flex-start;
          gap: 10px;
          white-space: nowrap;
        }

        .skill-input {
          flex: 0 0 auto;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          white-space: nowrap;
        }

        /* LT / RT: 2つの丸を斜めにずらし、間に斜線を引く */
        /* ボタンの丸は X / B / LT / RT すべて同じ直径にそろえる (アケコン時) */
        .skill-label .agc-pad-only .agc-btn {
          box-sizing: border-box;
          width: 36px;
          min-width: 36px;
          height: 36px;
          padding: 0;
          border-radius: 50% !important;
          font-size: 15px;
        }

        /* キーボード用のキートップ: スキルボックス内にきれいに収まるスタイル */
        .skill-label .agc-kbd-only .agc-btn.agc-key {
          box-sizing: border-box !important;
          width: auto !important;
          min-width: 28px !important;
          max-width: 72px !important;
          height: 30px !important;
          padding: 0 9px !important;
          border-radius: 5px !important;
          font-size: 14px !important;
          font-weight: 800 !important;
          letter-spacing: 0 !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }

        .skill-text {
          flex: 1;
          text-align: center;
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 1px;
          line-height: 1;
          color: #ffffff;
          text-shadow: 0 0 4px #000, 1px 1px 3px #000;
          white-space: nowrap;
        }

        /* ボタンの押し方(連打 / 長押し) */
        .skill-hint {
          font-size: 15px;
          font-weight: 800;
          line-height: 1;
          color: #ffe9a8;
          text-shadow: 0 0 3px #000, 1px 1px 2px #000;
          letter-spacing: 0;
          white-space: nowrap;
        }

        /* ぶちかましのタメ量: クールタイムの枠(黄)の上に、赤が左から満ちていく */
        .charge-fill {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 0%;
          background: linear-gradient(90deg, rgba(168, 28, 36, 0.92), rgba(226, 60, 52, 0.92));
          box-shadow: 0 0 10px rgba(226, 60, 52, 0.7);
          transition: width 0.05s linear;
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
        .banner-sub:empty {
          display: none;
        }

      `;
