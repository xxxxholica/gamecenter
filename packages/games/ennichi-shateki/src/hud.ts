import { setText, setWidth, setDisplay } from '../../../shared/hudDom';
import { countUpText } from '../../../shared/arcadeScoreCountUp';
import { getPrizeSvg, getPrizeShortName } from './prize_icons';
import { PrizeBreakdownEntry } from './results_pile';

export class ArcadeHUD {
  private container: HTMLDivElement;

  // Corner HUD elements
  private scoreEl!: HTMLDivElement;
  private timerEl!: HTMLDivElement;
  private ammoEl!: HTMLDivElement;

  // New arcade elements: Combo & Explosive Gauge
  private comboEl!: HTMLDivElement;

  private crosshairEl!: HTMLDivElement;

  // Results elements
  private resultsOverlay!: HTMLDivElement;

  // 毎フレーム更新する要素(getElementById を毎回引かないよう生成時に保持)
  private scoreValEl!: HTMLElement;
  private timeValEl!: HTMLElement;
  private ammoPipsEl!: HTMLElement;
  private bombFillEl!: HTMLElement;
  private comboValEl!: HTMLElement;
  private comboRateEl!: HTMLElement;

  // Bottom Center Consolidated Container (Combo + Multiplier)
  private bottomCenterEl!: HTMLDivElement;

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
    `;

    // Top-Right: 時間
    this.timerEl = document.createElement('div');
    this.timerEl.className = 'hud-text hud-tr';
    this.timerEl.innerHTML = `時間 <span class="num" id="hud-time-val">30.0</span>`;

    // Bottom-Right: 爆発弾
    this.ammoEl = document.createElement('div');
    this.ammoEl.className = 'hud-text hud-br';
    this.ammoEl.innerHTML = `
      <div class="ammo-wrap"><span class="bomb-gauge-label">通常弾</span><span class="ammo-pips" id="hud-ammo-pips"></span></div>
      <div class="bomb-gauge-wrap" id="hud-bomb-wrap">
        <span class="bomb-gauge-label">爆発弾</span>
        <div class="bomb-gauge-bar"><div class="bomb-gauge-fill" id="hud-bomb-fill"></div></div>
      </div>
    `;

    this.container.appendChild(this.scoreEl);
    this.container.appendChild(this.timerEl);
    this.container.appendChild(this.ammoEl);

    // 2. Bottom-Center Consolidated HUD (Combo + Multiplier)
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

    this.bottomCenterEl.appendChild(this.comboEl);
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

    // 4. Results Screen Overlay
    this.resultsOverlay = document.createElement('div');
    this.resultsOverlay.className = 'results-overlay';
    this.resultsOverlay.style.display = 'none';
    this.container.appendChild(this.resultsOverlay);

    const byId = (id: string) => this.container.querySelector<HTMLElement>('#' + id)!;
    this.scoreValEl = byId('hud-score-val');
    this.timeValEl = byId('hud-time-val');
    this.ammoPipsEl = byId('hud-ammo-pips');
    this.bombFillEl = byId('hud-bomb-fill');
    this.comboValEl = byId('hud-combo-val');
    this.comboRateEl = byId('hud-combo-rate');
  }

  // Update Crosshair on Screen
  public updateCrosshair(normX: number, normY: number, visible: boolean, isLocked = false) {
    if (!visible) {
      setDisplay(this.crosshairEl, 'none');
      return;
    }
    setDisplay(this.crosshairEl, 'block');
    const screenX = (normX + 1) * 0.5 * window.innerWidth;
    const screenY = (-normY + 1) * 0.5 * window.innerHeight;
    this.crosshairEl.style.transform = `translate(${screenX}px, ${screenY}px)`;
    this.crosshairEl.classList.toggle('locked', isLocked);
  }

  // Update In-Game HUD elements
  private lastAmmoText: string = '';

  /** 通常弾の残数。0のときは再装填中の表示にする */
  public updateAmmo(ammo: number, max: number, reloading: boolean) {
    const text = reloading ? '装填中' : '●'.repeat(ammo) + '○'.repeat(Math.max(0, max - ammo));
    if (text === this.lastAmmoText) return;
    this.lastAmmoText = text;
    this.ammoPipsEl.textContent = text;
    this.ammoPipsEl.classList.toggle('reloading', reloading);
  }

  public updateInGame(
    score: number,
    timeLeft: number,
    bombCooldownRatio: number,
    combo: number,
    multiplier = 1.0
  ) {
    setText(this.scoreValEl, String(score).padStart(5, '0'));
    setText(this.timeValEl, Math.max(0, timeLeft).toFixed(1));
    this.timerEl.classList.toggle('danger-blink', timeLeft <= 5.0);

    // Bomb gauge
    const pct = Math.min(100, Math.max(0, bombCooldownRatio * 100));
    setWidth(this.bombFillEl, `${pct}%`);

    // Combo display
    if (combo >= 2) {
      setDisplay(this.comboEl, 'flex');
      setText(this.comboValEl, String(combo));
      setText(this.comboRateEl, `x${multiplier.toFixed(1)}`);
      this.comboEl.classList.add('pulse');
    } else {
      setDisplay(this.comboEl, 'none');
      this.comboEl.classList.remove('pulse');
    }

  }

  // Show / Hide HUD elements based on game state
  public setMode(mode: 'title' | 'playing' | 'results') {
    this.resultsOverlay.style.display = mode === 'results' ? 'flex' : 'none';

    document.body.classList.toggle('in-game', mode === 'playing');

    const showHud = mode === 'playing';
    this.scoreEl.style.display = showHud ? 'flex' : 'none';
    this.timerEl.style.display = showHud ? 'flex' : 'none';
    this.ammoEl.style.display = showHud ? 'flex' : 'none';
    this.bottomCenterEl.style.display = showHud ? 'flex' : 'none';
    if (!showHud) {
      this.comboEl.style.display = 'none';
    }
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
          <div class="bd-card" title="${item.name} ${item.weight.toLocaleString()}g">
            <div class="bd-pic">${svg}</div>
            <div class="bd-count-tag">×${item.count}</div>
            <div class="bd-label">${shortName}</div>
          </div>
        `;
      });
    } else {
      breakdownHtml = `
        <div class="bd-card bd-card-empty" title="参加賞：ラムネ 100g">
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

        <div class="results-action-block rm-col" style="margin-top: 14px;">
          <div id="res-btn-retry" class="retry-btn" tabindex="-1">再挑戦</div>
          <div id="res-btn-title" class="retry-btn" tabindex="-1">タイトルに戻る</div>
          <div id="res-btn-exit" class="retry-btn" tabindex="-1">ゲームを終了</div>
        </div>
      </div>
    `;
    const scoreNum = this.resultsOverlay.querySelector<HTMLElement>('.results-score-num');
    if (scoreNum) countUpText(scoreNum, finalScore.toLocaleString());
  }
}
