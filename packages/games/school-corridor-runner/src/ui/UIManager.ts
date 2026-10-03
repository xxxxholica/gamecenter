import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import { GameScore, GameState } from '../types';

export class UIManager {
  private hudContainer: HTMLElement;
  private scoreEl: HTMLElement;
  private scoreMultiplierEl: HTMLElement;
  private timeEl: HTMLElement;
  private speedEl: HTMLElement;
  private bombSlotsContainer: HTMLElement;
  private bombReloadBar: HTMLElement;

  // フラッシュエフェクトオーバーレイ
  private flashOverlay: HTMLElement;

  // 無敵パワーアップ演出
  private invincibleVignette: HTMLElement;
  private invincibleBanner: HTMLElement;
  private invincibleTimerEl: HTMLElement;

  // カウントダウン前「追われる」導入演出
  private chaseVignette: HTMLElement;

  // タイトル画面
  private titleOverlay: HTMLElement;
  private titleCard: HTMLElement;
  private demoIndicator: HTMLElement;

  // カウントダウン演出
  private countdownOverlay: HTMLElement;
  private countdownText: HTMLElement;

  // リザルト画面
  private resultOverlay: HTMLElement;
  private resultScoreEl: HTMLElement;
  private resultDistanceEl: HTMLElement;
  private resultGradeEl: HTMLElement;
  private resultTitleEl: HTMLElement;


  constructor() {
    this.hudContainer = document.getElementById('hud')!;
    this.scoreEl = document.getElementById('hud-score')!;
    this.scoreMultiplierEl = document.getElementById('hud-score-multiplier')!;
    this.timeEl = document.getElementById('hud-time')!;
    this.speedEl = document.getElementById('hud-speed')!;
    this.bombSlotsContainer = document.getElementById('hud-bomb-slots')!;
    this.bombReloadBar = document.getElementById('hud-reload-fill')!;

    this.flashOverlay = document.getElementById('flash-overlay')!;

    this.invincibleVignette = document.getElementById('invincible-vignette')!;
    this.invincibleBanner = document.getElementById('invincible-banner')!;
    this.invincibleTimerEl = document.getElementById('invincible-timer')!;

    this.chaseVignette = document.getElementById('chase-vignette')!;

    this.titleOverlay = document.getElementById('title-overlay')!;
    this.titleCard = document.querySelector('.title-popup-card')!;
    this.demoIndicator = document.getElementById('demo-indicator')!;

    this.countdownOverlay = document.getElementById('countdown-overlay')!;
    this.countdownText = document.getElementById('countdown-text')!;

    this.resultOverlay = document.getElementById('result-overlay')!;
    this.resultScoreEl = document.getElementById('result-score')!;
    this.resultDistanceEl = document.getElementById('result-distance')!;
    this.resultGradeEl = document.getElementById('result-grade')!;
    this.resultTitleEl = document.getElementById('result-title')!;



    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF') {
        this.toggleFullscreen();
      }
      if (e.code === 'Escape') {
        this.navigateToHub();
      }
    });
  }

  // ホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
  private navigateToHub(): void {
    window.location.href = '../../';
  }

  public toggleFullscreen(): void {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  /**
   * ボム爆発用の白色フラッシュ
   */
  public triggerWhiteFlash(): void {
    this.flashOverlay.className = '';
    void this.flashOverlay.offsetWidth;
    this.flashOverlay.className = 'active';
  }

  /**
   * 激突即死用の赤色フラッシュ
   */
  public triggerRedFlash(): void {
    this.flashOverlay.className = '';
    void this.flashOverlay.offsetWidth;
    this.flashOverlay.className = 'red-flash';
  }

  /**
   * スコア獲得・連続撃破時のポップ演出
   */
  public triggerScorePop(): void {
    this.scoreEl.classList.remove('pop');
    void this.scoreEl.offsetWidth;
    this.scoreEl.classList.add('pop');
  }

  // HUDは毎フレーム呼ばれるため、値が変わったときだけDOMを書き換える(同じ値でも代入すると再レイアウト・再描画の対象になる)
  private setText(el: HTMLElement, text: string): void {
    if (el.textContent !== text) el.textContent = text;
  }

  private setClass(el: HTMLElement, className: string, on: boolean): void {
    if (el.classList.contains(className) !== on) el.classList.toggle(className, on);
  }

  public updateHUD(
    score: number,
    combo: number,
    timeRemaining: number,
    speedKmh: number,
    bombCount: number,
    bombReloadProgress: number
  ): void {
    this.setText(this.scoreEl, Math.floor(score).toString().padStart(7, '0'));

    // スコア枠へのコンボ倍率統合表示
    if (combo > 1) {
      const mult = (1.0 + Math.min(5.0, combo * 0.1)).toFixed(1);
      this.setText(this.scoreMultiplierEl, `×${mult}`);
      this.setClass(this.scoreMultiplierEl, 'hidden', false);
    } else {
      this.setClass(this.scoreMultiplierEl, 'hidden', true);
    }

    // 時間
    const totalSeconds = Math.max(0, timeRemaining);
    const secs = Math.floor(totalSeconds);
    const millis = Math.floor((totalSeconds - secs) * 10);
    this.setText(this.timeEl, `${secs.toString().padStart(2, '0')}.${millis}`);

    this.setClass(this.timeEl, 'danger', timeRemaining <= 15);

    // 速度
    this.setText(this.speedEl, `${speedKmh.toFixed(1)}km/h`);

    // 辞書残弾スロット（四角形ブロック3枠）
    const slots = this.bombSlotsContainer.children;
    for (let i = 0; i < 3; i++) {
      if (slots[i]) {
        const className = i < bombCount ? 'bomb-slot active' : 'bomb-slot';
        if (slots[i].className !== className) slots[i].className = className;
      }
    }

    // リロードプログレスバー
    const reloadWidth = bombCount < 3 ? `${Math.min(100, Math.floor(bombReloadProgress * 100))}%` : '100%';
    if (this.bombReloadBar.style.width !== reloadWidth) this.bombReloadBar.style.width = reloadWidth;
  }

  /**
   * 無敵パワーアップ獲得開始演出（青いバナー表示 ＆ 画面外周ビネット発光開始）
   */
  public triggerInvincibleStart(): void {
    this.invincibleBanner.classList.remove('hidden');
    this.invincibleVignette.classList.remove('hidden');
    this.invincibleVignette.classList.add('active');
  }

  /**
   * 無敵タイマー表示の毎フレーム更新（残り時間が少ないほど点滅を速く）
   */
  public updateInvincibleTimer(remaining: number): void {
    this.setText(this.invincibleTimerEl, Math.max(0, remaining).toFixed(1));
    if (remaining <= 3.0) {
      this.invincibleVignette.classList.add('ending');
      this.invincibleBanner.classList.add('ending');
    }
  }

  /**
   * 無敵状態の終了（バナー・ビネットを非表示に戻す）
   */
  public triggerInvincibleEnd(): void {
    this.invincibleBanner.classList.add('hidden');
    this.invincibleBanner.classList.remove('ending');
    this.invincibleVignette.classList.remove('active', 'ending');
    this.invincibleVignette.classList.add('hidden');
  }

  /**
   * カウントダウン前の追跡演出の開始表示（画面外周の点滅ビネット）
   */
  public triggerChaseWarning(): void {
    this.chaseVignette.classList.remove('hidden');
    this.chaseVignette.classList.add('active');
  }

  /**
   * 追跡演出の終了（ビネットを非表示に戻す）
   */
  public hideChaseWarning(): void {
    this.chaseVignette.classList.remove('active');
    this.chaseVignette.classList.add('hidden');
  }

  public triggerTitleShatter(): void {
    if (this.titleCard) {
      this.titleCard.classList.remove('shattering');
      void this.titleCard.offsetWidth;
      this.titleCard.classList.add('shattering');
    }
  }

  public resetTitle(): void {
    if (this.titleCard) {
      this.titleCard.classList.remove('shattering');
    }
  }

  public showCountdown(text: string): void {
    this.countdownOverlay.classList.remove('hidden');
    this.countdownText.textContent = text;
    if (text === '走れ！') {
      this.countdownText.className = 'countdown-num go';
    } else {
      this.countdownText.className = 'countdown-num';
    }
    void this.countdownText.offsetWidth;
  }

  public hideCountdown(): void {
    this.countdownOverlay.classList.add('hidden');
  }

  public setGameState(state: GameState, scoreData?: GameScore): void {
    this.triggerInvincibleEnd();
    this.hideChaseWarning();

    switch (state) {
      case GameState.TITLE:
        this.resetTitle();
        this.hideCountdown();
        this.titleOverlay.classList.remove('hidden');
        this.demoIndicator.classList.add('hidden');
        this.resultOverlay.classList.add('hidden');
        this.hudContainer.classList.add('hidden');
        break;

      case GameState.DEMO:
        this.resetTitle();
        this.hideCountdown();
        this.titleOverlay.classList.add('hidden');
        this.demoIndicator.classList.remove('hidden');
        this.resultOverlay.classList.add('hidden');
        this.hudContainer.classList.remove('hidden');
        break;

      case GameState.PLAYING:
        this.resetTitle();
        this.hideCountdown();
        this.titleOverlay.classList.add('hidden');
        this.demoIndicator.classList.add('hidden');
        this.resultOverlay.classList.add('hidden');
        this.hudContainer.classList.remove('hidden');
        break;

      case GameState.GAMEOVER:
      case GameState.CLEARED:
        this.resetTitle();
        this.hideCountdown();
        this.titleOverlay.classList.add('hidden');
        this.demoIndicator.classList.add('hidden');
        this.resultOverlay.classList.remove('hidden');
        this.hudContainer.classList.remove('hidden');

        if (state === GameState.CLEARED) {
          this.resultTitleEl.textContent = '校門突破';
          this.resultTitleEl.className = 'result-header cleared';
        } else {
          this.resultTitleEl.textContent = '補習決定';
          this.resultTitleEl.className = 'result-header gameover';
        }

        if (scoreData) {
          countUpText(this.resultScoreEl, Math.floor(scoreData.score).toLocaleString());
          countUpText(this.resultDistanceEl, `${Math.floor(scoreData.distance)} m`);
          this.resultGradeEl.textContent = scoreData.grade;
          this.resultGradeEl.className = `grade-badge grade-${scoreData.grade}`;
        }
        break;
    }
  }
}
