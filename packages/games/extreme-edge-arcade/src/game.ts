import * as THREE from 'three';
import { Stage, StageResult } from './types';
import { InputManager } from './input';
import { EffectsManager } from './effects';
import { sound } from './audio';
import { buttonIconHtml, mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { Stage1Drink } from './stages/stage1_drink';
import { Stage3Phone } from './stages/stage3_phone';
import { Stage4Clock } from './stages/stage4_clock';
import { Stage5Yakisoba } from './stages/stage5_yakisoba';
import { TitleScene } from './title_scene';
import { DemoInputManager } from './demo_input';
import { RankingManager } from './ranking';

export type GameState =
  | 'TITLE'
  | 'STAGE_BRIEF'
  | 'STAGE_INTRO'
  | 'STAGE_PLAY'
  | 'STAGE_JUDGMENT'
  | 'STAGE_FADEOUT'
  | 'RESULT';

export interface StageRecord {
  stageNumber: string;
  stageTitle: string;
  success: boolean;
  scorePercent: number;
  judgmentText: string;
}

export class GameManager {
  private state: GameState = 'TITLE';
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private effects: EffectsManager;
  private input: InputManager;

  // 3D Background Showcase for Title
  private titleScene: TitleScene | null = null;
  private titleDemoInput = new DemoInputManager();
  private titleLoopTimer = 0.0;



  // Stages
  private stageFactories: ((effects: EffectsManager) => Stage)[] = [];
  private currentStageIndex = 0;
  private currentStage: Stage | null = null;
  private arcadeTitleScreen!: ArcadeTitleScreen;
  private stageRecords: StageRecord[] = [];

  // Timers
  private stateTimer = 0.0;
  private currentJudgment: StageResult | null = null;

  // 各種目は、失敗(大惨事・足りなすぎ)しても1回だけやり直せる。成績は、その種目の挑戦のうち最も良いもの
  private static readonly MAX_ATTEMPTS = 2;
  private attempt = 1;
  private attemptResults: StageResult[] = [];

  // HTML HUD Elements
  private titleOverlay!: HTMLElement;
  private hudOverlay!: HTMLElement;
  private centerBanner!: HTMLElement;
  private fadeOverlay!: HTMLElement;
  private resultOverlay!: HTMLElement;
  private briefOverlay!: HTMLElement;
  private briefTimer = 0.0;

  // Attract Overlays
  private demoBanner!: HTMLElement;
  private demoPrompt!: HTMLElement;
  private rankingOverlay!: HTMLElement;

  private hudRoundText!: HTMLElement;
  private hudStageText!: HTMLElement;
  private hudTimeText!: HTMLElement;
  private hudActionGuide!: HTMLElement;
  private hudSubInfo!: HTMLElement;

  // Danger vignette overlays
  private dangerVignette!: HTMLElement;
  private dangerFlash!: HTMLElement;
  private flashTimer = 0;

  // Arcade input status icons
  private stickDot!: HTMLElement;
  private btn0Indicator!: HTMLElement;
  private btn1Indicator!: HTMLElement;

  constructor(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    effects: EffectsManager,
    input: InputManager
  ) {
    this.scene = scene;
    this.camera = camera;
    this.effects = effects;
    this.input = input;

    this.stageFactories = [
      (fx) => new Stage1Drink(fx),
      (fx) => new Stage3Phone(fx),
      (fx) => new Stage4Clock(fx),
      (fx) => new Stage5Yakisoba(fx),
    ];

    this.bindDomElements();
    this.showTitle();
  }

  private bindDomElements() {
    this.titleOverlay = document.getElementById('title-overlay')!;
    this.hudOverlay = document.getElementById('hud-overlay')!;
    this.centerBanner = document.getElementById('center-banner')!;
    this.fadeOverlay = document.getElementById('fade-overlay')!;
    this.resultOverlay = document.getElementById('result-overlay')!;
    this.briefOverlay = document.getElementById('brief-overlay')!;
    this.briefOverlay.addEventListener('click', () => this.dismissBriefing());

    this.demoBanner = document.getElementById('demo-banner')!;
    this.demoPrompt = document.getElementById('demo-prompt')!;
    this.rankingOverlay = document.getElementById('ranking-overlay')!;

    this.hudRoundText = document.getElementById('hud-round')!;
    this.hudStageText = document.getElementById('hud-stage')!;
    this.hudTimeText = document.getElementById('hud-time')!;
    this.hudActionGuide = document.getElementById('hud-action-guide')!;
    this.hudSubInfo = document.getElementById('hud-sub-info')!;
    this.dangerVignette = document.getElementById('danger-vignette')!;
    this.dangerFlash = document.getElementById('danger-flash')!;

    this.stickDot = document.getElementById('stick-dot')!;
    this.btn0Indicator = document.getElementById('btn0-indicator')!;
    this.btn1Indicator = document.getElementById('btn1-indicator')!;

    // Start button on title
    const startBtn = document.getElementById('btn-start')!;
    startBtn.innerHTML = `${buttonIconHtml([0, 1, 2, 3])} ${startBtn.textContent}`;
    startBtn.addEventListener('click', () => {
      if (this.state === 'TITLE') {
        this.startGame();
      }
    });

    // Clicking anywhere on title or ranking screen can also start
    this.rankingOverlay.addEventListener('click', () => {
      this.startGame();
    });

    // Retry button on result
    const retryBtn = document.getElementById('btn-retry')!;
    retryBtn.innerHTML = `${buttonIconHtml([0, 1, 2, 3])} ${retryBtn.textContent}`;
    retryBtn.addEventListener('click', () => {
      if (this.state === 'RESULT') {
        this.startGame();
      }
    });
  }

  private showTitle() {
    this.state = 'TITLE';
    this.cleanupAttract();
    sound.stopBgm();
    sound.setMuted(true);

    mountArcadeGuide({
      buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }],
      showHomeHint: true,
    });

    this.titleOverlay.style.display = 'none';
    this.hudOverlay.style.display = 'none';
    this.centerBanner.style.display = 'none';
    this.briefOverlay.style.display = 'none';
    this.fadeOverlay.style.opacity = '0';
    this.resultOverlay.style.display = 'none';
    this.rankingOverlay.style.display = 'none';
    this.demoBanner.style.display = 'none';
    this.demoPrompt.style.display = 'none';
    if (this.hudSubInfo) this.hudSubInfo.style.display = 'none';
    if (this.dangerVignette) this.dangerVignette.style.opacity = '0';
    if (this.dangerFlash) this.dangerFlash.style.opacity = '0';

    // 実際のゲーム画面(目覚まし時計 Stage4Clock)をHUDなしで背景表示
    this.cleanupTitleScene();
    this.loadTitleStage();

    if (!this.arcadeTitleScreen) {
      this.arcadeTitleScreen = new ArcadeTitleScreen({
        slug: 'extreme-edge-arcade',
        accentColor: '#ff2b4d',
        tagline: '日常の「ギリギリ」連続チャレンジ',
        startButtonLabel: '開始',
        promptLabel: 'PRESS START / ボタンで開始',
        onStart: () => {
          this.startGame();
        },
      });
    }
    this.arcadeTitleScreen.show();
  }

  private loadTitleStage() {
    if (this.currentStage) {
      this.currentStage.cleanup(this.scene);
      this.currentStage = null;
    }
    this.effects.clear();

    // 看板ステージ Stage4Clock (目覚まし時計) をHUDなしの実ゲーム画面としてロード
    this.currentStage = new Stage4Clock(this.effects);
    this.currentStage.init(this.scene, this.camera);
    this.currentStage.start();
    this.titleDemoInput.setScenario(3);
    this.titleLoopTimer = 0.0;
  }

  private cleanupTitleScene() {
    if (this.titleScene) {
      this.titleScene.cleanup(this.scene);
      this.titleScene = null;
    }
  }

  private cleanupAttract() {
    this.demoBanner.style.display = 'none';
    this.demoPrompt.style.display = 'none';
    this.rankingOverlay.style.display = 'none';
    if (this.currentStage) {
      this.currentStage.cleanup(this.scene);
      this.currentStage = null;
    }
    this.effects.clear();
  }

  private startGame() {
    this.cleanupTitleScene();
    this.cleanupAttract();

    sound.setMuted(false);
    sound.init();
    sound.playStart();

    this.stageRecords = [];
    this.attempt = 1;
    this.attemptResults = [];
    this.currentStageIndex = 0;

    this.titleOverlay.style.display = 'none';
    this.resultOverlay.style.display = 'none';
    this.rankingOverlay.style.display = 'none';
    this.demoBanner.style.display = 'none';
    this.arcadeTitleScreen?.hide();
    this.demoPrompt.style.display = 'none';
    this.hudOverlay.style.display = 'block';

    this.loadStage(0);
  }





  private loadStage(index: number, isRetry: boolean = false) {
    if (this.currentStage) {
      this.currentStage.cleanup(this.scene);
      this.currentStage = null;
    }
    this.effects.clear();

    const factory = this.stageFactories[index];
    this.currentStage = factory(this.effects);
    this.currentStage.init(this.scene, this.camera);

    this.currentJudgment = null;

    // Set HUD stage text & persistent operational guide
    this.updateRoundText(index);
    this.hudStageText.textContent = this.currentStage.title;
    this.hudActionGuide.textContent = this.currentStage.instruction;
    this.hudTimeText.textContent = this.currentStage.getRemainingTime().toFixed(1);

    // Update global arcade guide card for each stage's controls (全種目「レバー上」操作に統一)
    const stageGuideOptions = [
      // Stage 1 (ドリンクバー)
      { moveLabel: '上: 長押しで注ぐ(離して確定)', showHomeHint: true },
      // Stage 2 (スマホ充電)
      { moveLabel: '上: ケーブル挿入', showHomeHint: true },
      // Stage 3 (目覚まし時計)
      { moveLabel: '上: 時計ストップ', showHomeHint: true },
      // Stage 4 (焼きそば湯切り)
      { moveLabel: '上: 傾けて湯切り', showHomeHint: true },
    ];
    if (stageGuideOptions[index]) {
      mountArcadeGuide(stageGuideOptions[index]);
    }

    if (isRetry) {
      // やり直しは説明カードを飛ばし、すぐ準備に入る
      this.state = 'STAGE_INTRO';
      this.stateTimer = 0.5;
      this.centerBanner.style.display = 'flex';
      this.centerBanner.innerHTML = `<div class="banner-title">もう一度！</div><div class="banner-action pulse-text">最後の挑戦</div>`;
    } else {
      // 種目の説明カードを出し、ボタンが押されるまで待つ(何をすればよいか分からないまま始まらないようにする)
      this.state = 'STAGE_BRIEF';
      this.briefTimer = 0.0;
      this.centerBanner.style.display = 'none';
      this.showBriefing(this.currentStage);
    }

    // Unfade screen
    this.fadeOverlay.style.opacity = '0';
    this.hudSubInfo.style.display = 'none';

    // Cinematic Intro Zoom from far distance into gameplay view
    this.effects.startIntroZoom(1.8);
  }

  private updateRoundText(index: number) {
    const base = `${index + 1}/${this.stageFactories.length}`;
    this.hudRoundText.textContent = `${base}  挑戦${this.attempt}/${GameManager.MAX_ATTEMPTS}`;
  }

  /** その種目の挑戦のうち、最も良い結果(成功のうち最高点。成功がなければ最後の結果) */
  private bestAttempt(): StageResult {
    const successes = this.attemptResults.filter((r) => r.success);
    if (successes.length > 0) {
      return successes.reduce((a, b) => (b.scorePercent > a.scorePercent ? b : a));
    }
    return this.attemptResults.reduce((a, b) => (b.scorePercent > a.scorePercent ? b : a));
  }

  /** 種目の説明カード。やること・操作・成功と大惨事の条件を、開始前に短く見せる */
  private showBriefing(stage: Stage) {
    const b = stage.briefing;
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    this.briefOverlay.innerHTML = `
      <div class="brief-card">
        <div class="brief-stage">${esc(stage.numberText)}　${esc(stage.title)}</div>
        <div class="brief-row"><span class="brief-key">${esc(b.key)}</span></div>
        <div class="brief-row ok"><span class="brief-mark">◎</span>${esc(b.ok)}</div>
        <div class="brief-row ng"><span class="brief-mark">×</span>${esc(b.ng)}</div>
        <button type="button" class="brief-start-btn blink-1s" id="brief-proceed-btn">
          ${buttonIconHtml([0, 1, 2, 3])} 決定して開始
        </button>
      </div>
    `;
    const proceedBtn = document.getElementById('brief-proceed-btn');
    proceedBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dismissBriefing();
    });
    this.briefOverlay.style.display = 'flex';
  }

  /** 説明カードを閉じて開始準備(READY)に入る */
  private dismissBriefing() {
    if (this.state !== 'STAGE_BRIEF' || this.briefTimer < 0.5) return;
    this.briefOverlay.style.display = 'none';
    this.state = 'STAGE_INTRO';
    this.stateTimer = 0.5;
    this.centerBanner.style.display = 'flex';
    this.centerBanner.innerHTML = `<div class="banner-action pulse-text">READY</div>`;
  }

  update(dt: number) {
    this.updateInputIndicators();

    switch (this.state) {
      case 'TITLE': {
        this.titleLoopTimer += dt;
        this.titleDemoInput.updateDemo(dt);
        const result = this.currentStage?.update(dt, this.titleDemoInput);

        // 針が7時直前に迫る緊張感ある実ゲーム画面を継続ループ(HUDは一切非表示)
        if (this.titleLoopTimer >= 5.6 || (result && this.titleLoopTimer >= 4.6)) {
          this.loadTitleStage();
        }

        if (this.input.anyPressed()) {
          this.startGame();
          return;
        }
        break;
      }



      case 'STAGE_BRIEF': {
        this.briefTimer += dt;
        // 直前の連打で誤って閉じないよう、表示から0.5秒は受け付けない
        if (this.briefTimer >= 0.5 && (this.input.wasButton0Pressed() || this.input.wasButton1Pressed() || this.input.wasLeverUpPressed())) {
          this.dismissBriefing();
        }
        // 放置されたらタイトルへ戻す
        if (this.briefTimer >= 60) {
          this.showTitle();
        }
        break;
      }

      case 'STAGE_INTRO': {
        this.stateTimer -= dt;
        // 説明を閉じたボタンを離してから始める(押しっぱなしのまま操作が始まらないように)。長くても1.5秒で開始
        const released = !this.input.isButton0() && !this.input.isLeverUp();
        if ((this.stateTimer <= 0 && released) || this.stateTimer <= -1.5) {
          // Intro finishes -> Start Active Play!
          this.state = 'STAGE_PLAY';
          this.centerBanner.style.display = 'none';
          this.currentStage?.start();
          sound.startBgm();
        }
        break;
      }

      case 'STAGE_PLAY': {
        if (!this.currentStage) break;

        const result = this.currentStage.update(dt, this.input);

        // Update time HUD
        const timeVal = this.currentStage.getRemainingTime().toFixed(1);
        this.hudTimeText.textContent = timeVal;

        // Update sub-metric (e.g. remaining water, battery percentage)
        const subInfo = this.currentStage.getSubInfo?.();
        if (subInfo) {
          this.hudSubInfo.style.display = 'block';
          this.hudSubInfo.textContent = subInfo;
        } else {
          this.hudSubInfo.style.display = 'none';
        }

        // Drive danger vignette & BGM intensity from limit value — no number shown to player
        const limitVal = this.currentStage.getLimitValue();
        this.updateDangerOverlay(limitVal, dt);
        sound.setBgmIntensity(limitVal / 100);

        if (result && result.completed) {
          this.currentJudgment = result;
          this.attemptResults.push(result);

          this.enterJudgment();
        }
        break;
      }

      case 'STAGE_JUDGMENT': {
        // Slow-motion physics update
        const slowDt = dt * 0.25;
        this.currentStage?.update(slowDt, this.input);

        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = 'STAGE_FADEOUT';
          this.stateTimer = 0.3; // 0.3s quick black fade
          this.fadeOverlay.style.opacity = '1';
        }
        break;
      }

      case 'STAGE_FADEOUT': {
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          const last = this.currentJudgment;
          if (last && !last.success && this.attempt < GameManager.MAX_ATTEMPTS) {
            // 失敗: 同じ種目をもう一度(説明カードは出さない)
            this.attempt++;
            this.loadStage(this.currentStageIndex, true);
            break;
          }

          // 種目の成績を確定(挑戦のうち最良のもの)
          const best = this.bestAttempt();
          if (this.currentStage) {
            this.stageRecords.push({
              stageNumber: this.currentStage.numberText,
              stageTitle: this.currentStage.title,
              success: best.success,
              scorePercent: best.scorePercent,
              judgmentText: best.judgmentText,
            });
          }
          this.attempt = 1;
          this.attemptResults = [];

          this.currentStageIndex++;
          if (this.currentStageIndex < this.stageFactories.length) {
            // Next stage
            this.loadStage(this.currentStageIndex);
          } else {
            // All stages completed -> Enter Overall Result
            this.enterResult();
          }
        }
        break;
      }

      case 'RESULT': {
        if (this.input.anyPressed()) {
          this.startGame();
          return;
        }
        break;
      }
    }
  }

  private enterJudgment() {
    this.state = 'STAGE_JUDGMENT';
    this.stateTimer = 1.0; // 1.0s judgment display
    sound.stopBgm();

    // Immediately clear danger overlays & sub info
    this.dangerVignette.style.opacity = '0';
    this.dangerFlash.style.opacity = '0';
    this.hudSubInfo.style.display = 'none';

    if (!this.currentJudgment) return;

    this.centerBanner.style.display = 'flex';

    if (this.currentJudgment.success) {
      this.centerBanner.innerHTML = `
        <div class="judgment-success">成功</div>
        <div class="judgment-score">${this.currentJudgment.scorePercent.toFixed(1)}%</div>
      `;
    } else {
      this.centerBanner.innerHTML = `
        <div class="judgment-fail">大惨事</div>
        <div class="judgment-score">0.0%</div>
        ${this.attempt < GameManager.MAX_ATTEMPTS ? '<div class="banner-title">もう一度挑戦できる</div>' : ''}
      `;
    }
  }

  private enterResult() {
    this.state = 'RESULT';
    sound.stopBgm();
    if (this.currentStage) {
      this.currentStage.cleanup(this.scene);
      this.currentStage = null;
    }
    this.effects.clear();

    mountArcadeGuide({
      buttons: [{ indices: [0, 1, 2, 3, 9], label: '再挑戦' }],
      showHomeHint: true,
    });

    this.hudOverlay.style.display = 'none';
    this.centerBanner.style.display = 'none';
    this.briefOverlay.style.display = 'none';
    this.fadeOverlay.style.opacity = '0';
    this.dangerVignette.style.opacity = '0';
    this.dangerFlash.style.opacity = '0';
    this.hudSubInfo.style.display = 'none';
    this.resultOverlay.style.display = 'flex';

    // Calculate Deviation & Grade
    let totalScore = 0;
    this.stageRecords.forEach((r) => {
      totalScore += r.scorePercent;
    });
    const avgScore = totalScore / this.stageRecords.length;

    // Bravery Deviation Formula: mean around 50, scales with average edge score
    let deviation = 50 + ((avgScore - 60) / 40) * 25;
    deviation = Math.min(88.0, Math.max(15.0, deviation));

    let rankText = '大惨事常習犯';
    let rankColor = '#ff1a1a';
    if (avgScore >= 95) {
      rankText = '神のギリギリ';
      rankColor = '#ffe600';
    } else if (avgScore >= 80) {
      rankText = '限界チャレンジャー';
      rankColor = '#00ff66';
    } else if (avgScore >= 60) {
      rankText = '安全第一';
      rankColor = '#ffffff';
    } else if (avgScore >= 30) {
      rankText = 'チキン野郎';
      rankColor = '#ff8800';
    }

    // Populate stage breakdown table
    const tbody = document.getElementById('result-tbody')!;
    tbody.innerHTML = '';
    this.stageRecords.forEach((rec) => {
      const row = document.createElement('tr');
      const scoreColor = rec.success ? '#00ff66' : '#ff1a1a';
      const statusText = rec.success ? `${rec.scorePercent.toFixed(1)}%` : '大惨事 (0%)';
      row.innerHTML = `
        <td>${rec.stageNumber}</td>
        <td>${rec.stageTitle}</td>
        <td style="color: ${scoreColor}; font-weight: bold;">${statusText}</td>
      `;
      tbody.appendChild(row);
    });

    const devEl = document.getElementById('deviation-val')!;
    devEl.textContent = deviation.toFixed(1);

    const rankEl = document.getElementById('rank-val')!;
    rankEl.textContent = rankText;
    rankEl.style.color = rankColor;

    // Register high score into local ranking Top 5
    RankingManager.addScore(deviation, rankText);
  }

  // --- Danger overlay: screen-edge vignette + flash, no numbers ---
  private updateDangerOverlay(limitVal: number, dt: number) {
    // Tiers:
    // 0–60: nothing
    // 60–80: faint vignette grows in (orange-red glow at edges)
    // 80–90: vignette bright, slow pulse
    // 90–100: vignette full + rapid white flash
    this.flashTimer -= dt;

    if (limitVal < 60) {
      this.dangerVignette.style.opacity = '0';
      this.dangerFlash.style.opacity = '0';

    } else if (limitVal < 80) {
      // Faint growing vignette
      const t = (limitVal - 60) / 20; // 0→1
      this.dangerVignette.style.opacity = (t * 0.45).toFixed(3);
      this.dangerFlash.style.opacity = '0';

    } else if (limitVal < 90) {
      // Bright vignette + slow pulse
      const t = (limitVal - 80) / 10; // 0→1
      const pulse = 0.55 + Math.sin(Date.now() * 0.006) * 0.15;
      this.dangerVignette.style.opacity = (0.45 + t * 0.35 * pulse).toFixed(3);
      this.dangerFlash.style.opacity = '0';

    } else {
      // CRITICAL: vignette full + rapid white-to-red frame flash
      const t = (limitVal - 90) / 10; // 0→1
      const pulse = 0.7 + Math.sin(Date.now() * 0.018) * 0.3;
      this.dangerVignette.style.opacity = (0.7 + t * 0.3 * pulse).toFixed(3);

      // Rapid flash at random intervals
      if (this.flashTimer <= 0) {
        const flashInterval = Math.max(0.04, 0.18 - t * 0.14);
        this.flashTimer = flashInterval;
        const currentFlash = parseFloat(this.dangerFlash.style.opacity || '0');
        this.dangerFlash.style.opacity = currentFlash > 0 ? '0' : '1';
      }

      // Camera micro-shudder at critical
      this.effects.addTrauma(0.018 * t);
    }
  }

  private updateInputIndicators() {
    // Stick indicator dot offset
    const tilt = this.input.getForwardTilt();
    const isDown = this.input.isLeverDown();
    let offsetY = 0;
    if (tilt > 0.1) offsetY = -tilt * 10;
    if (isDown) offsetY = 10;
    this.stickDot.style.transform = `translate(-50%, -50%) translateY(${offsetY}px)`;

    // Button 0
    if (this.input.isButton0()) {
      this.btn0Indicator.classList.add('active');
    } else {
      this.btn0Indicator.classList.remove('active');
    }

    // Button 1
    if (this.input.isButton1()) {
      this.btn1Indicator.classList.add('active');
    } else {
      this.btn1Indicator.classList.remove('active');
    }
  }
}
