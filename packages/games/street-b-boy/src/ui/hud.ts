import { setText } from '../../../../shared/hudDom';
import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import {
  checkHighScore,
  saveLeaderboardScore,
  loadLeaderboard,
} from '../../../../shared/arcadeLeaderboard';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../../shared/arcadeNameEntryModal';

export interface RankingRecord {
  name: string;
  score: number;
}

export class HudManager {
  public isNameEntryOpen = false;
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
  private elHordeWarning: HTMLElement;

  private elCombo: HTMLElement;
  private elComboHits: HTMLElement;
  private elComboText: HTMLElement;
  private comboTimerId: number | null = null;

  constructor() {
    this.elScore = document.getElementById('val-score')!;
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
    this.elHordeWarning = document.getElementById('horde-warning')!;

    this.elCombo = document.getElementById('hud-combo')!;
    this.elComboHits = document.getElementById('val-combo-hits')!;
    this.elComboText = document.getElementById('val-combo-text')!;
  }

  public updateScore(score: number): void {
    const formatted = score.toString().padStart(6, '0');
    setText(this.elScore, formatted);
  }

  public updateTime(time: number): void {
    const ceilTime = Math.max(0, Math.ceil(time));
    setText(this.elTime, ceilTime.toString().padStart(3, '0'));
    this.elHudTimeWrap.classList.toggle('warning', ceilTime <= 15);
  }

  public updateLives(lives: number): void {
    setText(this.elLives, Math.max(0, lives).toString().padStart(2, '0'));
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

  /** 後ろから犬の大群が迫っているときの、画面の左の縁の赤い警告。intensity は 0(なし)〜1(すぐ後ろ) */
  public setHordeWarning(intensity: number): void {
    const v = Math.min(1, Math.max(0, intensity));
    this.elHordeWarning.style.opacity = v.toFixed(2);
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
    const display = visible ? 'flex' : 'none';
    const scoreEl = document.getElementById('hud-score');
    const timeEl = document.getElementById('hud-time');
    const livesEl = document.getElementById('hud-lives');
    if (scoreEl) scoreEl.style.display = display;
    if (timeEl) timeEl.style.display = display;
    if (livesEl) livesEl.style.display = display;
  }

  public showTitle(show: boolean): void {
    this.elTitleOverlay.style.display = show ? 'flex' : 'none';
  }

  public showDemoBanner(show: boolean): void {
    this.elDemoBanner.style.display = show ? 'block' : 'none';
  }

  public onNameEntryClosed?: () => void;

  public showResult(status: 'clear' | 'gameover', score: number): void {
    this.elResultOverlay.style.display = 'flex';
    if (status === 'clear') {
      this.elResultStatusTitle.textContent = 'ALL CLEAR!';
      this.elResultStatusTitle.style.color = '#00f0ff';
    } else {
      this.elResultStatusTitle.textContent = 'GAME OVER';
      this.elResultStatusTitle.style.color = '#ff1a1a';
    }
    countUpText(this.elResultTotalScore, score.toString().padStart(6, '0'));

    const check = checkHighScore('street-b-boy', score);
    if (check.isRankIn && score > 0) {
      this.isNameEntryOpen = true;
      mountNameEntryModal({
        title: 'ダンス記録',
        scoreDisplay: `${score.toLocaleString()} pts`,
        rankDisplay: `第${check.rank}位`,
        themeClass: 'theme-street',
        delayMs: NAME_ENTRY_AFTER_RESULT_MS,
        onComplete: (katakanaName) => {
          this.isNameEntryOpen = false;
          saveLeaderboardScore('street-b-boy', score, katakanaName, undefined, undefined, { cleared: status === 'clear' });
          this.onNameEntryClosed?.();
        },
      });
    }
  }

  public hideResult(): void {
    this.elResultOverlay.style.display = 'none';
  }

  public showRanking(show: boolean, highlightRank?: number): void {
    if (show) {
      this.renderRankings(highlightRank);
      this.elRankingOverlay.style.display = 'flex';
    } else {
      this.elRankingOverlay.style.display = 'none';
    }
  }

  public getRankings() {
    return loadLeaderboard('street-b-boy');
  }

  private renderRankings(highlightRank?: number): void {
    const list = loadLeaderboard('street-b-boy');
    this.elRankingList.innerHTML = '';
    list.forEach((rec, idx) => {
      const isCurrent = highlightRank === (idx + 1);
      const row = document.createElement('div');
      row.className = `ranking-row ${isCurrent ? 'highlight' : ''}`;
      if (isCurrent) {
        row.style.color = '#ffe600';
        row.style.fontWeight = 'bold';
      }

      const numSpan = document.createElement('span');
      numSpan.className = 'rank-num';
      numSpan.textContent = `#${idx + 1}`;

      const nameSpan = document.createElement('span');
      nameSpan.className = 'rank-name';
      nameSpan.textContent = rec.name;

      const scoreSpan = document.createElement('span');
      scoreSpan.className = 'rank-score';
      scoreSpan.textContent = rec.score.toString().padStart(6, '0');

      row.appendChild(numSpan);
      row.appendChild(nameSpan);
      row.appendChild(scoreSpan);

      this.elRankingList.appendChild(row);
    });
  }
}
