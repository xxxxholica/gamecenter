export interface RankingRecord {
  name: string;
  score: number;
}

export class HudManager {
  private elScore: HTMLElement;
  private elTime: HTMLElement;
  private elLives: HTMLElement;
  private elHudTimeWrap: HTMLElement;
  private elCenterBanner: HTMLElement;
  private elDemoBanner: HTMLElement;
  private elTitleOverlay: HTMLElement;
  private elRankingOverlay: HTMLElement;
  private elRankingList: HTMLElement;
  private elResultOverlay: HTMLElement;
  private elResultStatusTitle: HTMLElement;
  private elResultTotalScore: HTMLElement;
  private elInvincibleBorder: HTMLElement;

  private elStage: HTMLElement;
  private elCombo: HTMLElement;
  private elComboHits: HTMLElement;
  private elComboText: HTMLElement;
  private comboTimerId: number | null = null;

  private defaultRankings: RankingRecord[] = [
    { name: 'DJ KOOL', score: 68500 },
    { name: 'ROCK STEADY', score: 54200 },
    { name: 'B-BOY CRAZY', score: 43900 },
    { name: 'RED BEANIE', score: 32000 },
    { name: 'STREET MASTER', score: 21500 }
  ];

  constructor() {
    this.elScore = document.getElementById('val-score')!;
    this.elStage = document.getElementById('val-stage')!;
    this.elTime = document.getElementById('val-time')!;
    this.elLives = document.getElementById('val-lives')!;
    this.elHudTimeWrap = document.getElementById('hud-time')!;
    this.elCenterBanner = document.getElementById('center-banner')!;
    this.elDemoBanner = document.getElementById('demo-banner')!;
    this.elTitleOverlay = document.getElementById('title-overlay')!;
    this.elRankingOverlay = document.getElementById('ranking-overlay')!;
    this.elRankingList = document.getElementById('ranking-list')!;
    this.elResultOverlay = document.getElementById('result-overlay')!;
    this.elResultStatusTitle = document.getElementById('result-status-title')!;
    this.elResultTotalScore = document.getElementById('result-total-score')!;
    this.elInvincibleBorder = document.getElementById('invincible-border')!;

    this.elCombo = document.getElementById('hud-combo')!;
    this.elComboHits = document.getElementById('val-combo-hits')!;
    this.elComboText = document.getElementById('val-combo-text')!;

    this.loadRankings();
  }

  public updateScore(score: number): void {
    const formatted = score.toString().padStart(6, '0');
    this.elScore.textContent = formatted;
  }

  public updateStage(stage: number): void {
    this.elStage.textContent = stage.toString();
  }

  public updateTime(time: number): void {
    const ceilTime = Math.max(0, Math.ceil(time));
    this.elTime.textContent = ceilTime.toString().padStart(3, '0');
    if (ceilTime <= 15) {
      this.elHudTimeWrap.classList.add('warning');
    } else {
      this.elHudTimeWrap.classList.remove('warning');
    }
  }

  public updateLives(lives: number): void {
    this.elLives.textContent = Math.max(0, lives).toString().padStart(2, '0');
  }

  public setInvincibleBorder(active: boolean): void {
    this.elInvincibleBorder.style.opacity = active ? '0.85' : '0';
  }

  public showCombo(hits: number): void {
    if (hits < 2) return;
    this.elComboHits.textContent = hits.toString();

    let tag = 'CYPHER COMBO!';
    if (hits >= 6) {
      tag = 'B-BOY LEGEND!!';
    } else if (hits >= 4) {
      tag = 'GROOVE MASTER!';
    }
    this.elComboText.textContent = tag;

    this.elCombo.style.display = 'block';
    this.elCombo.style.animation = 'none';
    // Trigger reflow to restart animation
    void this.elCombo.offsetWidth;
    this.elCombo.style.animation = 'pop-bounce 0.2s ease-out';

    if (this.comboTimerId) {
      window.clearTimeout(this.comboTimerId);
    }
    this.comboTimerId = window.setTimeout(() => {
      this.hideCombo();
    }, 1500);
  }

  public hideCombo(): void {
    this.elCombo.style.display = 'none';
  }

  public showCenterBanner(type: 'ready' | 'clear' | 'dead' | 'timeup' | 'allclear', customText?: string): void {
    this.elCenterBanner.className = '';
    this.elCenterBanner.style.display = 'block';

    if (customText) {
      this.elCenterBanner.textContent = customText;
      this.elCenterBanner.className = 'flash-ready';
      return;
    }

    if (type === 'ready') {
      this.elCenterBanner.textContent = 'READY';
      this.elCenterBanner.className = 'flash-ready';
    } else if (type === 'clear') {
      this.elCenterBanner.textContent = 'CLEAR';
      this.elCenterBanner.className = 'flash-clear';
    } else if (type === 'allclear') {
      this.elCenterBanner.textContent = 'ALL CLEAR';
      this.elCenterBanner.className = 'flash-clear';
    } else if (type === 'dead') {
      this.elCenterBanner.textContent = 'MISS';
      this.elCenterBanner.className = 'flash-dead';
    } else if (type === 'timeup') {
      this.elCenterBanner.textContent = 'TIME UP';
      this.elCenterBanner.className = 'flash-timeup';
    }
  }

  public hideCenterBanner(): void {
    this.elCenterBanner.style.display = 'none';
  }

  public setGameplayHUDVisible(visible: boolean): void {
    const display = visible ? 'block' : 'none';
    const scoreEl = document.getElementById('hud-score');
    const stageEl = document.getElementById('hud-stage');
    const timeEl = document.getElementById('hud-time');
    const livesEl = document.getElementById('hud-lives');
    if (scoreEl) scoreEl.style.display = display;
    if (stageEl) stageEl.style.display = display;
    if (timeEl) timeEl.style.display = display;
    if (livesEl) livesEl.style.display = display;
  }

  public showTitle(show: boolean): void {
    this.elTitleOverlay.style.display = show ? 'flex' : 'none';
  }

  public showDemoBanner(show: boolean): void {
    this.elDemoBanner.style.display = show ? 'block' : 'none';
  }

  public showRanking(show: boolean): void {
    if (show) {
      this.renderRankings();
      this.elRankingOverlay.style.display = 'flex';
    } else {
      this.elRankingOverlay.style.display = 'none';
    }
  }

  public showResult(status: 'clear' | 'gameover', score: number): void {
    this.elResultOverlay.style.display = 'flex';
    if (status === 'clear') {
      this.elResultStatusTitle.textContent = 'CLEAR';
      this.elResultStatusTitle.style.color = '#00f0ff';
    } else {
      this.elResultStatusTitle.textContent = 'GAME OVER';
      this.elResultStatusTitle.style.color = '#ff1a1a';
    }
    this.elResultTotalScore.textContent = score.toString().padStart(6, '0');
    this.recordScore(score);
  }

  public hideResult(): void {
    this.elResultOverlay.style.display = 'none';
  }

  public getRankings(): RankingRecord[] {
    return this.loadRankings();
  }

  private loadRankings(): RankingRecord[] {
    try {
      const saved = localStorage.getItem('street_bboy_highscores');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    return this.defaultRankings;
  }

  private recordScore(score: number): void {
    if (score <= 0) return;
    const list = this.loadRankings();
    list.push({ name: 'YOU (PLAYER)', score });
    list.sort((a, b) => b.score - a.score);
    const top5 = list.slice(0, 5);
    try {
      localStorage.setItem('street_bboy_highscores', JSON.stringify(top5));
    } catch {
      // ignore
    }
  }

  private renderRankings(): void {
    const list = this.loadRankings();
    this.elRankingList.innerHTML = '';
    list.forEach((rec, idx) => {
      const row = document.createElement('div');
      row.className = 'ranking-row';
      row.innerHTML = `
        <span class="rank-num">#${idx + 1}</span>
        <span class="rank-name">${rec.name}</span>
        <span class="rank-score">${rec.score.toString().padStart(6, '0')}</span>
      `;
      this.elRankingList.appendChild(row);
    });
  }
}
