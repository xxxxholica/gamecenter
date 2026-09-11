import { getPrizeSvg, getPrizeShortName } from './prize_icons';
import { PrizeBreakdownEntry } from './results_pile';

export interface HighScoreEntry {
  rank: number;
  score: number;
  name: string;
}

export class ArcadeHUD {
  private container: HTMLDivElement;

  // Corner HUD elements
  private scoreEl!: HTMLDivElement;
  private timerEl!: HTMLDivElement;
  private ammoEl!: HTMLDivElement;

  // New arcade elements: Combo & Explosive Gauge
  private comboEl!: HTMLDivElement;

  private crosshairEl!: HTMLDivElement;
  private flashMsgEl!: HTMLDivElement;

  // Title elements
  private titleOverlay!: HTMLDivElement;
  private titleLogoEl!: HTMLDivElement;
  private startBtnEl!: HTMLDivElement;

  // Attract / Demo elements
  private demoBannerEl!: HTMLDivElement;
  private rankingOverlay!: HTMLDivElement;

  // Results elements
  private resultsOverlay!: HTMLDivElement;

  // Bottom Center Consolidated Container (Combo + Flash)
  private bottomCenterEl!: HTMLDivElement;

  // Flash message timer
  private flashTimer: number = 0;

  // High scores list
  public highScores: HighScoreEntry[] = [
    { rank: 1, score: 9800, name: 'しゃてき名人' },
    { rank: 2, score: 7500, name: 'スナイパーたろう' },
    { rank: 3, score: 5400, name: 'お祭りボーイ' },
    { rank: 4, score: 3600, name: 'はやうち次郎' },
    { rank: 5, score: 2200, name: '見習いはなこ' },
  ];

  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'arcade-hud';
    document.body.appendChild(this.container);

    this.createElements();
  }

  private createElements() {
    // 1. Containerless Corner HUD
    // Top-Left: 重さ & 最高重量（統合表示）
    this.scoreEl = document.createElement('div');
    this.scoreEl.className = 'hud-text hud-tl';
    this.scoreEl.innerHTML = `
      <div class="hud-score-main">重さ <span class="num" id="hud-score-val">00000</span>g</div>
      <div class="hud-score-sub">最高 <span class="num-sub" id="hud-hiscore-val">09800</span>g</div>
    `;

    // Top-Right: 時間
    this.timerEl = document.createElement('div');
    this.timerEl.className = 'hud-text hud-tr';
    this.timerEl.innerHTML = '時間 <span class="num" id="hud-time-val">30.0</span>';

    // Bottom-Left: 爆発弾（単一ゲージにスリム化）
    this.ammoEl = document.createElement('div');
    this.ammoEl.className = 'hud-text hud-bl';
    this.ammoEl.innerHTML = `
      <div class="bomb-gauge-wrap" id="hud-bomb-wrap">
        <span class="bomb-gauge-label">爆発弾</span>
        <div class="bomb-gauge-bar"><div class="bomb-gauge-fill" id="hud-bomb-fill"></div></div>
        <span class="bomb-status" id="hud-bomb-status">装填中</span>
      </div>
    `;

    this.container.appendChild(this.scoreEl);
    this.container.appendChild(this.timerEl);
    this.container.appendChild(this.ammoEl);

    // 2. Bottom-Center Consolidated HUD (Combo + Flash / Restock Notification)
    this.bottomCenterEl = document.createElement('div');
    this.bottomCenterEl.className = 'bottom-center-hud';

    this.comboEl = document.createElement('div');
    this.comboEl.className = 'combo-hud';
    this.comboEl.innerHTML = `
      <span class="combo-num" id="hud-combo-val">0</span>
      <span class="combo-label">COMBO</span>
      <span class="combo-rate" id="hud-combo-rate">x1.0</span>
    `;
    this.comboEl.style.display = 'none';

    this.flashMsgEl = document.createElement('div');
    this.flashMsgEl.className = 'flash-msg';

    this.bottomCenterEl.appendChild(this.comboEl);
    this.bottomCenterEl.appendChild(this.flashMsgEl);
    this.container.appendChild(this.bottomCenterEl);

    // 3. Arcade Precision Crosshair
    this.crosshairEl = document.createElement('div');
    this.crosshairEl.className = 'crosshair';
    this.crosshairEl.innerHTML = `
      <div class="ch-circle"></div>
      <div class="ch-dot"></div>
      <div class="ch-line-h"></div>
      <div class="ch-line-v"></div>
    `;
    this.container.appendChild(this.crosshairEl);

    // 4. Dynamic 3D Title Screen Overlay
    this.titleOverlay = document.createElement('div');
    this.titleOverlay.className = 'title-overlay';

    this.titleLogoEl = document.createElement('div');
    this.titleLogoEl.className = 'title-logo';
    this.titleLogoEl.innerHTML = `
      <div class="title-sub">むげん連射の お祭りアクション</div>
      <div class="title-main">えんにち射的</div>
      <div class="title-tech">ARCADE CORK SHOOTER</div>
    `;

    this.startBtnEl = document.createElement('div');
    this.startBtnEl.className = 'start-prompt blink';
    this.startBtnEl.textContent = 'スタート';

    const titleGuidance = document.createElement('div');
    titleGuidance.className = 'title-controls-guide';
    titleGuidance.innerHTML = `
      <div class="guide-item">
        <span class="guide-label">通常弾</span>
        <span class="guide-key">左クリック / 決定 / ボタン0</span>
      </div>
      <div class="guide-sep"></div>
      <div class="guide-item">
        <span class="guide-label">バクダン弾</span>
        <span class="guide-key">右クリック / Xキー / ボタン1</span>
      </div>
      <div class="guide-sep"></div>
      <div class="guide-item">
        <span class="guide-label">ねらい</span>
        <span class="guide-key">マウス / レバー / 矢印キー</span>
      </div>
    `;

    this.titleOverlay.appendChild(this.titleLogoEl);
    this.titleOverlay.appendChild(this.startBtnEl);
    this.titleOverlay.appendChild(titleGuidance);
    this.container.appendChild(this.titleOverlay);

    // 5. Attract / Demo Mode Banner
    this.demoBannerEl = document.createElement('div');
    this.demoBannerEl.className = 'demo-banner';
    this.demoBannerEl.innerHTML = `
      <div class="demo-badge">デモプレイ</div>
      <div class="demo-sub">画面タップまたは操作でトップへ</div>
    `;
    this.demoBannerEl.style.display = 'none';
    this.container.appendChild(this.demoBannerEl);

    // 6. High Score Ranking Overlay
    this.rankingOverlay = document.createElement('div');
    this.rankingOverlay.className = 'ranking-overlay';
    this.rankingOverlay.style.display = 'none';
    this.container.appendChild(this.rankingOverlay);

    // 7. Results Screen Overlay
    this.resultsOverlay = document.createElement('div');
    this.resultsOverlay.className = 'results-overlay';
    this.resultsOverlay.style.display = 'none';
    this.container.appendChild(this.resultsOverlay);
  }

  // Update Crosshair on Screen
  public updateCrosshair(normX: number, normY: number, visible: boolean, isLocked = false) {
    if (!visible) {
      this.crosshairEl.style.display = 'none';
      return;
    }
    this.crosshairEl.style.display = 'block';
    const screenX = (normX + 1) * 0.5 * window.innerWidth;
    const screenY = (-normY + 1) * 0.5 * window.innerHeight;
    this.crosshairEl.style.transform = `translate(${screenX}px, ${screenY}px)`;

    if (isLocked) {
      this.crosshairEl.classList.add('locked');
    } else {
      this.crosshairEl.classList.remove('locked');
    }
  }

  // Flash big center message
  public showFlash(text: string, subText = '', durationSec = 1.2, isCritical = false) {
    this.flashMsgEl.innerHTML = `
      <div class="flash-main ${isCritical ? 'crit' : ''}">${text}</div>
      ${subText ? `<div class="flash-sub">${subText}</div>` : ''}
    `;
    this.flashMsgEl.classList.remove('active');
    void this.flashMsgEl.offsetWidth;
    this.flashMsgEl.classList.add('active');
    this.flashTimer = durationSec;
  }

  public updateFlash(dt: number) {
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
      if (this.flashTimer <= 0) {
        this.flashMsgEl.classList.remove('active');
      }
    }
  }

  // Update In-Game HUD elements
  public updateInGame(
    score: number,
    timeLeft: number,
    highScore: number,
    bombCooldownRatio: number,
    combo: number
  ) {
    const scoreVal = document.getElementById('hud-score-val');
    if (scoreVal) {
      scoreVal.textContent = String(score).padStart(5, '0');
    }

    const timeVal = document.getElementById('hud-time-val');
    if (timeVal) {
      const fixedTime = Math.max(0, timeLeft).toFixed(1);
      timeVal.textContent = fixedTime;
      if (timeLeft <= 5.0) {
        this.timerEl.classList.add('danger-blink');
      } else {
        this.timerEl.classList.remove('danger-blink');
      }
    }

    // Bomb gauge
    const fillEl = document.getElementById('hud-bomb-fill');
    const statusEl = document.getElementById('hud-bomb-status');
    const pct = Math.min(100, Math.max(0, bombCooldownRatio * 100));

    if (fillEl) {
      fillEl.style.width = `${pct}%`;
    }
    if (statusEl) {
      if (bombCooldownRatio >= 1.0) {
        statusEl.textContent = '発射可能';
        statusEl.classList.add('ready');
      } else {
        statusEl.textContent = '装填中';
        statusEl.classList.remove('ready');
      }
    }

    // Combo display
    if (combo >= 2) {
      this.comboEl.style.display = 'flex';
      const comboNum = document.getElementById('hud-combo-val');
      if (comboNum) comboNum.textContent = String(combo);
      const comboRate = document.getElementById('hud-combo-rate');
      if (comboRate) {
        const mult = 1.0 + Math.min(2.0, (combo - 1) * 0.2);
        comboRate.textContent = `x${mult.toFixed(1)}`;
      }
      this.comboEl.classList.add('pulse');
    } else {
      this.comboEl.style.display = 'none';
      this.comboEl.classList.remove('pulse');
    }

    const hiVal = document.getElementById('hud-hiscore-val');
    if (hiVal) {
      hiVal.textContent = String(highScore).padStart(5, '0');
    }
  }

  // Show / Hide HUD elements based on game state
  public setMode(mode: 'title' | 'playing' | 'demo' | 'ranking' | 'results') {
    this.titleOverlay.style.display = mode === 'title' ? 'flex' : 'none';
    this.demoBannerEl.style.display = mode === 'demo' ? 'flex' : 'none';
    this.rankingOverlay.style.display = mode === 'ranking' ? 'flex' : 'none';
    this.resultsOverlay.style.display = mode === 'results' ? 'flex' : 'none';

    document.body.classList.toggle('in-game', mode === 'playing');

    const showHud = mode === 'playing' || mode === 'demo';
    this.scoreEl.style.display = showHud ? 'flex' : 'none';
    this.timerEl.style.display = showHud ? 'flex' : 'none';
    this.ammoEl.style.display = showHud ? 'flex' : 'none';
    this.bottomCenterEl.style.display = showHud ? 'flex' : 'none';
    if (!showHud) {
      this.comboEl.style.display = 'none';
      this.flashMsgEl.classList.remove('active');
    }
  }

  // Render High Score Ranking Screen
  public renderRanking() {
    let listHtml = '';
    this.highScores.forEach((entry) => {
      const isTop = entry.rank === 1;
      listHtml += `
        <div class="rank-row ${isTop ? 'gold' : ''}">
          <span class="rank-pos">${entry.rank}位</span>
          <span class="rank-score"><span class="score-num">${String(entry.score).padStart(5, '0')}</span>g</span>
          <span class="rank-name">${entry.name}</span>
        </div>
      `;
    });

    this.rankingOverlay.innerHTML = `
      <div class="ranking-title">ハイスコアランキング</div>
      <div class="ranking-list">${listHtml}</div>
      <div class="ranking-prompt blink">画面タッチまたはボタンでスタート</div>
    `;
  }

  // Render Game Results Screen
  public renderResults(
    finalScore: number,
    totalDefeatedCount: number,
    isNewRecord: boolean,
    breakdown: PrizeBreakdownEntry[] = []
  ) {
    let rankTitle = '見習い';
    let rankColor = '#ffffff';

    if (finalScore >= 8000) {
      rankTitle = '伝説の射手';
      rankColor = '#ffd700';
    } else if (finalScore >= 5000) {
      rankTitle = '特級名人';
      rankColor = '#ffd700';
    } else if (finalScore >= 3000) {
      rankTitle = '凄腕射手';
      rankColor = '#ffffff';
    } else if (finalScore >= 1500) {
      rankTitle = '一人前';
      rankColor = '#ffffff';
    }

    let breakdownHtml = '';
    if (breakdown.length > 0) {
      breakdown.forEach((item) => {
        const shortName = getPrizeShortName(item.name, item.type);
        const svg = getPrizeSvg(item.type);
        breakdownHtml += `
          <div class="bd-card" title="${item.name} (${item.weight.toLocaleString()}g)">
            <div class="bd-pic">${svg}</div>
            <div class="bd-count-tag">×${item.count}</div>
            <div class="bd-label">${shortName}</div>
          </div>
        `;
      });
    } else {
      breakdownHtml = `
        <div class="bd-card bd-card-empty" title="参加賞：ラムネ (100g)">
          <div class="bd-pic">${getPrizeSvg('ramune')}</div>
          <div class="bd-count-tag">×1</div>
          <div class="bd-label">参加賞ラムネ</div>
        </div>
      `;
    }

    this.resultsOverlay.innerHTML = `
      <div class="results-card">
        <div class="results-header">
          <span class="results-title">獲得総重量</span>
          ${isNewRecord ? '<span class="new-record-badge">新記録</span>' : ''}
        </div>

        <div class="results-score-block">
          <span class="results-score-num">${finalScore.toLocaleString()}</span>
          <span class="results-score-unit">g</span>
        </div>

        <div class="results-stats-row">
          <div class="stat-item">
            <span class="stat-label">称号</span>
            <span class="stat-val" style="color: ${rankColor}">${rankTitle}</span>
          </div>
          <div class="stat-divider"></div>
          <div class="stat-item">
            <span class="stat-label">撃墜景品</span>
            <span class="stat-val">${totalDefeatedCount}<span class="stat-unit">個</span></span>
          </div>
        </div>

        <div class="results-breakdown-box">
          <div class="breakdown-header">獲得景品一覧</div>
          <div class="breakdown-grid">${breakdownHtml}</div>
        </div>

        <div class="results-action-block">
          <div class="retry-btn blink">トップ画面へ</div>
          <div class="retry-hint">画面タップまたはボタンでトップへ</div>
        </div>
      </div>
    `;
  }
}
