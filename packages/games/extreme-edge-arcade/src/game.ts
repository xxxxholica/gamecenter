import { setText, setDisplay } from '../../../shared/hudDom';
import { countUpText } from '../../../shared/arcadeScoreCountUp';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu';
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
import { Stage5Balloon } from './stages/stage5_balloon';
import { TitleScene } from './title_scene';
import { DemoInputManager } from './demo_input';
import { benchDone, benchMark, benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import { reportDeepAnalytics, reportPhase, reportRoundStart } from '../../../shared/arcadeAnalytics';
import { returnToHub } from '../../../shared/homeReturn';
import { RankingManager } from './ranking';
import { runHighScoreEntryFlow, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';
import { ArcadePause } from '../../../shared/arcadePause';

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
  /** ポーズ(Backspace / SELECT): 種目の最中に止めて、最初からやり直せる */
  private readonly pause = new ArcadePause({
    accent: '#ffcc00',
    isPlaying: () =>
      this.state === 'STAGE_BRIEF' ||
      this.state === 'STAGE_INTRO' ||
      this.state === 'STAGE_PLAY' ||
      this.state === 'STAGE_JUDGMENT' ||
      this.state === 'STAGE_FADEOUT',
    onRestart: () => this.startGame(),
  });
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private effects: EffectsManager;
  private input: InputManager;

  // 3D Background Showcase for Title
  private titleScene: TitleScene | null = null;
  private titleDemoInput = new DemoInputManager();

  // ベンチマーク(?bench=1&scene=stage&stage=0〜3&result=success|fail): 指定の種目だけを、成功する操作か無操作で1回遊ぶ
  private readonly benchScene = benchParam('scene');
  private benchInput: DemoInputManager | null = null;
  private benchSuccess = true;
  private titleLoopTimer = 0.0;



  // Stages
  private stageFactories: ((effects: EffectsManager) => Stage)[] = [];
  private currentStageIndex = 0;
  private currentStage: Stage | null = null;
  private arcadeTitleScreen!: ArcadeTitleScreen;
  private stageRecords: StageRecord[] = [];
  private runRetries = 0; // 分析用: 失敗してやり直した回数(1プレイ合計)

  // Timers
  private stateTimer = 0.0;
  private currentJudgment: StageResult | null = null;
  private isNameEntryOpen = false;
  // 判定表示は1画面に詰め込まず、ページ(html, 表示秒数)を順に切り替えて見せる
  private judgmentPages: { html: string; seconds: number }[] = [];
  private judgmentPageIndex = 0;

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
  private briefTimer = 0.0;
  private briefCount = -1;

  // Attract Overlays
  private demoBanner!: HTMLElement;
  private demoPrompt!: HTMLElement;
  private rankingOverlay!: HTMLElement;

  private hudRoundText!: HTMLElement;
  private hudActionGuide!: HTMLElement;
  private hudSubInfo!: HTMLElement;

  // Danger vignette overlays
  private dangerVignette!: HTMLElement;
  private dangerFlash!: HTMLElement;
  private flashTimer = 0;

  // Result navigation
  private resultFocus = 0; // 0: 再挑戦, 1: タイトルに戻る, 2: ゲームを終了
  private resultArmTime = 0;

  // Arcade input status icons

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
      (fx) => new Stage5Balloon(fx),
    ];

    this.bindDomElements();
    this.showTitle();
    if (GameManager.PREVIEW) this.setupPreview();

    declareBenchTargets([
      { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
      ...this.stageFactories.flatMap((_, i) => (['success', 'fail'] as const).map((result) => ({
        id: `stage${i + 1}-${result}`,
        label: `第${i + 1}種目 ${result === 'success' ? '成功する操作' : '無操作(失敗)'}`,
        kind: 'play',
        params: { scene: 'stage', stage: String(i), result },
        input: 'self' as const,
        seconds: 60,
      }))),
    ]);
    if (this.benchScene === 'stage') {
      const i = Number(benchParam('stage'));
      this.startGame(i >= 0 && i < this.stageFactories.length ? i : 0);
    } else if (this.benchScene === 'title') {
      benchReady('title');
    }
  }

  /** ホームのサムネイル・ホバー動画の収録用(?preview または ?noHud)。HUD・ガイド・文字を隠し、1種目目を自動で始める */
  private static readonly PREVIEW = typeof location !== 'undefined' && /[?&](preview|noHud)\b/.test(location.search);

  private setupPreview() {
    const style = document.createElement('style');
    style.textContent = `
      #hud-overlay, #center-banner, #result-overlay, #title-overlay, #ranking-overlay,
      #danger-vignette, #danger-flash, #demo-banner, #demo-prompt, #agc-guide { display: none !important; }
    `;
    document.head.appendChild(style);
    this.startGame();
  }

  private bindDomElements() {
    this.titleOverlay = document.getElementById('title-overlay')!;
    this.hudOverlay = document.getElementById('hud-overlay')!;
    this.centerBanner = document.getElementById('center-banner')!;
    this.fadeOverlay = document.getElementById('fade-overlay')!;
    this.resultOverlay = document.getElementById('result-overlay')!;

    this.demoBanner = document.getElementById('demo-banner')!;
    this.demoPrompt = document.getElementById('demo-prompt')!;
    this.rankingOverlay = document.getElementById('ranking-overlay')!;

    this.hudRoundText = document.getElementById('hud-round')!;
    this.hudActionGuide = document.getElementById('hud-action-guide')!;
    this.hudSubInfo = document.getElementById('hud-sub-info')!;
    this.dangerVignette = document.getElementById('danger-vignette')!;
    this.dangerFlash = document.getElementById('danger-flash')!;


    // Start button on title
    const startBtn = document.getElementById('btn-start')!;
    startBtn.insertAdjacentHTML('afterbegin', `${buttonIconHtml([0])} `);
    startBtn.addEventListener('click', () => {
      if (this.state === 'TITLE') {
        this.startGame();
      }
    });

    // Clicking anywhere on title or ranking screen can also start
    this.rankingOverlay.addEventListener('click', () => {
      this.startGame();
    });

    // Result screen button events
    const retryBtn = document.getElementById('btn-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', (e) => {
        if (this.isNameEntryOpen || performance.now() < this.resultArmTime) {
          e.preventDefault();
          return;
        }
        this.startGame();
      });
      retryBtn.addEventListener('mouseenter', () => {
        this.resultFocus = 0;
        this.updateResultFocus();
      });
      retryBtn.addEventListener('focus', () => retryBtn.blur());
    }

    const titleBtn = document.getElementById('btn-result-title');
    if (titleBtn) {
      titleBtn.addEventListener('click', (e) => {
        if (this.isNameEntryOpen || performance.now() < this.resultArmTime) {
          e.preventDefault();
          return;
        }
        this.showTitle();
      });
      titleBtn.addEventListener('mouseenter', () => {
        this.resultFocus = 1;
        this.updateResultFocus();
      });
      titleBtn.addEventListener('focus', () => titleBtn.blur());
    }

    const exitBtn = document.getElementById('btn-result-exit');
    if (exitBtn) {
      exitBtn.addEventListener('click', (e) => {
        if (this.isNameEntryOpen || performance.now() < this.resultArmTime) {
          e.preventDefault();
          return;
        }
        returnToHub();
      });
      exitBtn.addEventListener('mouseenter', () => {
        this.resultFocus = 2;
        this.updateResultFocus();
      });
      exitBtn.addEventListener('focus', () => exitBtn.blur());
    }
  }

  private showTitle() {
    this.state = 'TITLE';
    this.cleanupAttract();
    sound.stopBgm();
    sound.setMuted(true);

    mountArcadeGuide({
      buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }],
      showHomeHint: true,
      backLabel: 'ホームへ戻る',
    });

    this.titleOverlay.style.display = 'none';
    this.hudOverlay.style.display = 'none';
    this.centerBanner.style.display = 'none';
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
        tagline: 'ギリギリを攻める一発勝負ミニゲーム！',
        startButtonLabel: 'スタート',
        promptLabel: 'PRESS START / ボタンでスタート',
        onStart: () => {
          // ゲームループの「何か押したら開始」が先に始めていたら、二重に始めない(始め直すと、1種目目を読み直していた)
          if (this.state === 'TITLE') this.startGame();
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

  private startGame(startIndex = 0) {
    this.cleanupTitleScene();
    this.cleanupAttract();

    sound.setMuted(false);
    sound.init();
    sound.playStart();

    this.stageRecords = [];
    this.runRetries = 0;
    this.attempt = 1;
    this.attemptResults = [];
    this.currentStageIndex = startIndex;
    reportRoundStart({ stage: startIndex + 1 });

    this.titleOverlay.style.display = 'none';
    this.resultOverlay.style.display = 'none';
    this.rankingOverlay.style.display = 'none';
    this.demoBanner.style.display = 'none';
    this.arcadeTitleScreen?.hide();
    this.demoPrompt.style.display = 'none';
    this.hudOverlay.style.display = 'block';

    this.loadStage(startIndex);
  }





  private loadStage(index: number, _isRetry: boolean = false) {
    if (this.currentStage) {
      this.currentStage.cleanup(this.scene);
      this.currentStage = null;
    }
    this.effects.clear();

    const factory = this.stageFactories[index];
    this.currentStage = factory(this.effects);
    this.currentStage.init(this.scene, this.camera);
    reportPhase('playing', { stage: index + 1, title: this.currentStage.title, attempt: this.attempt });

    this.currentJudgment = null;
    this.hudActionGuide.classList.remove('danger');

    // Set HUD stage text & persistent operational guide
    this.updateRoundText(index);

    // Update global arcade guide card for each stage's controls (全種目 Enter / A ボタンで止める操作に統一)
    const stageGuideOptions = [
      // Stage 1 (ドリンクバー)
      { buttons: [{ indices: [0], label: 'ドリンクを止める' }], showHomeHint: true, backLabel: 'ポーズ' },
      // Stage 2 (スマホ充電)
      { buttons: [{ indices: [0], label: 'ケーブルを挿す' }], showHomeHint: true, backLabel: 'ポーズ' },
      // Stage 3 (目覚まし時計)
      { buttons: [{ indices: [0], label: '時計を止める' }], showHomeHint: true, backLabel: 'ポーズ' },
      // Stage 4 (風船ふくらまし)
      { buttons: [{ indices: [0], label: '風船を止める' }], showHomeHint: true, backLabel: 'ポーズ' },
    ];
    if (stageGuideOptions[index]) {
      mountArcadeGuide(stageGuideOptions[index]);
      // 中央下にも同じ操作を大きく出す
      const label = stageGuideOptions[index].buttons?.[0]?.label ?? '';
      this.hudActionGuide.innerHTML = `${buttonIconHtml([0])}<small>${label}</small>`;
    }

    // 見出し(溢れる前に止めろ など)と3・2・1を同時に大きく出し、自動的に始まる(やり直しも同じ)
    this.state = 'STAGE_BRIEF';
    this.briefTimer = 0.0;
    this.briefCount = -1;
    this.centerBanner.style.display = 'flex';
    document.body.style.setProperty('--dim', '1');
    this.centerBanner.innerHTML = this.introHtml(this.currentStage.briefing.headline, '3');

    // Unfade screen
    this.fadeOverlay.style.opacity = '0';
    this.hudSubInfo.style.display = 'none';

    // Cinematic Intro Zoom from far distance into gameplay view
    this.effects.startIntroZoom(1.8);
  }

  private updateRoundText(index: number) {
    this.hudRoundText.textContent = `${index + 1}/${this.stageFactories.length}`;
  }

  /** その種目の挑戦のうち、最も良い結果(成功のうち最高点。成功がなければ最後の結果) */
  private bestAttempt(): StageResult {
    const successes = this.attemptResults.filter((r) => r.success);
    if (successes.length > 0) {
      return successes.reduce((a, b) => (b.scorePercent > a.scorePercent ? b : a));
    }
    return this.attemptResults.reduce((a, b) => (b.scorePercent > a.scorePercent ? b : a));
  }

  private introHtml(headline: string, count: string): string {
    const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return `${headline ? `<div class="intro-headline">${esc(headline)}</div>` : ''}<div class="intro-count">${count}</div>`;
  }

  update(dt: number) {
    if (this.pause.isOpen) return;

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
        // 収録用: カウントダウンなしですぐ始める
        const t = GameManager.PREVIEW ? 3.3 : this.briefTimer;
        const count = t < 0 ? -1 : 3 - Math.floor(t);
        // 暗幕は、カウントダウンの経過に合わせて3秒かけて完全に透明にする(数字の入れ替えで演出がやり直しにならないよう、毎フレーム直接指定)
        document.body.style.setProperty('--dim', String(Math.max(0, 1 - Math.max(0, t) / 3)));
        if (count > 0 && count !== this.briefCount) {
          this.briefCount = count;
          this.centerBanner.innerHTML = this.introHtml(this.currentStage!.briefing.headline, String(count));
          sound.playTick(count === 1 ? 1500 : 1100);
        }
        if (t >= 3) {
          // 見出しとカウントダウンは同時に消す
          this.centerBanner.style.display = 'none';
          document.body.style.removeProperty('--dim');
          this.state = 'STAGE_INTRO';
          this.stateTimer = 0;
        }
        break;
      }

      case 'STAGE_INTRO': {
        this.stateTimer -= dt;
        // 説明を閉じたボタンを離してから始める(押しっぱなしのまま操作が始まらないように)。長くても1.5秒で開始
        const released = !this.input.isButton0();
        if ((this.stateTimer <= 0 && released) || this.stateTimer <= -1.5) {
          // Intro finishes -> Start Active Play!
          this.state = 'STAGE_PLAY';
          this.centerBanner.style.display = 'none';
          this.currentStage?.start();
          if (this.benchScene === 'stage') {
            this.benchInput = new DemoInputManager();
            this.benchInput.setScenario(this.currentStageIndex + 1);
            this.benchSuccess = benchParam('result') !== 'fail';
            benchReady('stage-start');
          }
          sound.startBgm();
        }
        break;
      }

      case 'STAGE_PLAY': {
        if (!this.currentStage) break;

        if (this.benchInput && this.benchSuccess) this.benchInput.updateDemo(dt);
        const result = this.currentStage.update(dt, this.benchInput ?? this.input);

        // Update sub-metric (e.g. remaining water, battery percentage)
        const subInfo = this.currentStage.getSubInfo?.();
        setDisplay(this.hudSubInfo, subInfo ? 'block' : 'none');
        if (subInfo) setText(this.hudSubInfo, subInfo);

        // 見逃されやすい重要な一言は、画面中央に出し続ける
        const centerHint = this.currentStage.getCenterHint?.();
        if (centerHint) {
          setDisplay(this.centerBanner, 'flex');
          // 改行区切り: 1行目を大きな主文、2行目以降を補足として表示
          const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
          const [mainLine, ...subLines] = centerHint.split('\n');
          const hintHtml =
            `<div class="banner-hint"><div class="banner-hint-main">${esc(mainLine)}</div>` +
            subLines.map((l) => `<div class="banner-hint-sub">${esc(l)}</div>`).join('') +
            `</div>`;
          // 毎フレーム書き換えるとアニメーションが止まるので、変わった時だけ更新
          if (this.centerBanner.dataset.hint !== centerHint) {
            this.centerBanner.dataset.hint = centerHint;
            this.centerBanner.innerHTML = hintHtml;
          }
        } else {
          delete this.centerBanner.dataset.hint;
          this.centerBanner.style.display = 'none';
        }

        // Drive danger vignette & BGM intensity from limit value — no number shown to player
        const limitVal = this.currentStage.getLimitValue();
        this.updateDangerOverlay(limitVal, dt);
        sound.setBgmIntensity(limitVal / 100);

        if (result && result.completed) {
          this.currentJudgment = result;
          this.attemptResults.push(result);
          reportDeepAnalytics('stage_attempt', { stage: this.currentStageIndex + 1, title: this.currentStage?.title, attempt: this.attempt, success: result.success, scorePercent: Math.round(result.scorePercent * 10) / 10 });

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
          this.judgmentPageIndex++;
          const next = this.judgmentPages[this.judgmentPageIndex];
          if (next) {
            // 次のページへ切り替え
            this.centerBanner.innerHTML = next.html;
            this.stateTimer = next.seconds;
            break;
          }
          this.state = 'STAGE_FADEOUT';
          if (this.benchScene === 'stage') benchDone('judgment-end');
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
            // 失敗: 同じ種目をもう一度(見出しとカウントダウンから)
            this.attempt++;
            this.runRetries++;
            reportDeepAnalytics('progression_update', {
              deathReason: `大惨事: ${this.currentStage?.title ?? ''}`,
              maxStage: this.currentStageIndex + 1,
              retries: this.runRetries,
            });
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
          if (!best.success) {
            reportDeepAnalytics('progression_update', { deathReason: `大惨事: ${this.currentStage?.title ?? ''}`, retries: this.runRetries });
          }
          this.attempt = 1;
          this.attemptResults = [];

          this.currentStageIndex++;
          reportDeepAnalytics('progression_update', { maxStage: this.currentStageIndex, retries: this.runRetries });
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
        if (this.isNameEntryOpen) break;

        // 移動は受付待ちの間も効かせる(確定だけ誤爆防止で待たせる)
        for (const dir of this.input.takeMenuNav()) {
          this.resultFocus = (this.resultFocus + dir + 3) % 3;
          this.updateResultFocus();
          sound.playClick(1000);
        }
        if (performance.now() < this.resultArmTime) break;

        if (this.input.isConfirmJustPressed()) {
          if (this.resultFocus === 0) {
            this.startGame();
          } else if (this.resultFocus === 1) {
            this.showTitle();
          } else {
            returnToHub();
          }
          return;
        } else if (this.input.isCancelJustPressed()) {
          this.showTitle();
          return;
        }
        break;
      }
    }
  }

  /** 1回の挑戦の評価。成功は、限界に近いほど上の段階。失敗は、0%(あふれた・割れた)なら「やりすぎ」、足りなかったなら「チキン野郎」 */
  private static judgmentLabel(success: boolean, scorePercent: number): { text: string; color: string } {
    if (!success) return scorePercent <= 0 ? { text: 'やりすぎ', color: '#ff1a1a' } : { text: 'チキン野郎', color: '#ff8800' };
    const tiers: { min: number; text: string; color: string }[] = [
      { min: 99.5, text: '神のギリギリ', color: '#ffe600' },
      { min: 95, text: 'ギリギリの超越者', color: '#ffc400' },
      { min: 85, text: 'ギリギリ名人', color: '#ff9e2c' },
      { min: 70, text: '限界チャレンジャー', color: '#00ff66' },
      { min: 50, text: 'そこそこギリギリ', color: '#8de8ff' },
      { min: -Infinity, text: 'おっかなびっくり', color: '#ffd9a0' },
    ];
    return tiers.find((t) => scorePercent >= t.min)!;
  }

  private enterJudgment() {
    this.state = 'STAGE_JUDGMENT';
    if (this.benchScene === 'stage') benchMark('judgment');   // 判定のスロー演出が終わるまで測る(終わりは STAGE_FADEOUT へ移るところ)
    sound.stopBgm();

    // Immediately clear danger overlays & sub info
    this.hudActionGuide.classList.remove('danger');
    this.dangerVignette.style.opacity = '0';
    this.dangerFlash.style.opacity = '0';
    this.hudSubInfo.style.display = 'none';

    this.judgmentPages = [];
    this.judgmentPageIndex = 0;
    this.stateTimer = 1.0;
    if (!this.currentJudgment) return;

    // 1画面に詰め込まず、伝えることを1つずつ順に切り替えて見せる(点数は各ページに出したまま)
    const score = `<div class="judgment-score">${this.currentJudgment.scorePercent.toFixed(1)}%</div>`;
    const label = GameManager.judgmentLabel(this.currentJudgment.success, this.currentJudgment.scorePercent);
    const labelHtml = `<div class="judgment-label" style="color: ${label.color}">${label.text}</div>`;
    if (this.currentJudgment.success) {
      this.judgmentPages.push({ html: `${labelHtml}${score}`, seconds: 1.2 });
    } else {
      this.judgmentPages.push({ html: `${labelHtml}${score}`, seconds: 1.2 });
      if (this.attempt < GameManager.MAX_ATTEMPTS) {
        this.judgmentPages.push({ html: `<div class="judgment-retry">もう一度挑戦</div>${score}`, seconds: 1.2 });
      }
    }

    document.body.style.removeProperty('--dim');
    this.centerBanner.style.display = 'flex';
    this.centerBanner.innerHTML = this.judgmentPages[0].html;
    this.stateTimer = this.judgmentPages[0].seconds;
  }

  private getResultMenuItems(): ResultMenuItem[] {
    return [
      { button: document.getElementById('btn-retry'), color: '#ffe600' },
      { button: document.getElementById('btn-result-title'), color: '#39ff88' },
      { button: document.getElementById('btn-result-exit'), color: '#00f0ff' },
    ];
  }

  private updateResultFocus() {
    const items = this.getResultMenuItems();
    setupResultMenu(document.getElementById('result-menu'), items);
    applyResultMenuFocus(items, this.resultFocus);
  }

  private enterResult() {
    this.state = 'RESULT';
    sound.stopBgm();
    if (this.currentStage) {
      this.currentStage.cleanup(this.scene);
      this.currentStage = null;
    }
    this.effects.clear();

    this.resultFocus = 0; // 再挑戦がデフォルト
    this.resultArmTime = performance.now() + 600;
    this.updateResultFocus();

    mountArcadeGuide({
      moveLabel: '選択',
      buttons: [
        { indices: [0], label: '決定' },
        { indices: [1], label: 'タイトルへ' },
      ],
      showHomeHint: true,
      backLabel: 'タイトルへ',
    });

    this.hudOverlay.style.display = 'none';
    this.centerBanner.style.display = 'none';
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
    deviation = Math.round(Math.min(88.0, Math.max(15.0, deviation)) * 10) / 10;

    // 総合評価の区分(平均スコア%の下限が高い順)。満点近くまで細かく分け、神は平均99.5%以上
    const RANKS: { min: number; text: string; color: string }[] = [
      { min: 99.5, text: '神のギリギリ', color: '#ffe600' },
      { min: 98, text: 'ギリギリの超越者', color: '#ffc400' },
      { min: 96, text: 'ギリギリ名人', color: '#ff9e2c' },
      { min: 93, text: 'ギリギリマスター', color: '#7dffb0' },
      { min: 88, text: '限界チャレンジャー', color: '#00ff66' },
      { min: 78, text: 'そこそこギリギリ', color: '#8de8ff' },
      { min: 65, text: '安全第一', color: '#ffffff' },
      { min: 45, text: 'おっかなびっくり', color: '#ffd9a0' },
      { min: 25, text: 'チキン野郎', color: '#ff8800' },
      { min: -Infinity, text: '大惨事常習犯', color: '#ff1a1a' },
    ];
    const grade = RANKS.find((r) => avgScore >= r.min)!;
    const rankText = grade.text;
    const rankColor = grade.color;

    // 種目ごとの成績は、1つの表にまとめる(種目名・判定・スコア%)
    const stagesEl = document.getElementById('result-stages-body')!;
    stagesEl.replaceChildren(...this.stageRecords.map((rec) => {
      const row = document.createElement('tr');
      const cell = (className: string, text: string) => Object.assign(document.createElement('td'), { className, textContent: text });
      const judge = cell('judge', rec.success ? '成功' : GameManager.judgmentLabel(false, rec.scorePercent).text);
      judge.style.color = rec.success ? '#00ff66' : '#ff4d4d';
      const pct = cell('pct', `${rec.scorePercent.toFixed(1)}%`);
      pct.style.color = judge.style.color;
      row.append(cell('title', rec.stageTitle), judge, pct);
      return row;
    }));

    const devEl = document.getElementById('deviation-val')!;
    countUpText(devEl, deviation.toFixed(1));

    const rankEl = document.getElementById('rank-val')!;
    rankEl.textContent = rankText;
    rankEl.style.color = rankColor;

    reportDeepAnalytics('progression_update', {
      result: 'clear',
      maxStage: this.stageRecords.length,
      retries: this.runRetries,
      score: Math.round(deviation * 10) / 10,
      extraStats: {
        deviation: Math.round(deviation * 10) / 10,
        rank: rankText,
        stages: this.stageRecords.map((r) => ({ title: r.stageTitle, success: r.success, scorePercent: Math.round(r.scorePercent * 10) / 10 })),
      },
    });

    // Register high score into the server ranking Top 3.
    runHighScoreEntryFlow({
      slug: 'extreme-edge-arcade',
      score: deviation,
      modal: { title: '限界記録', scoreDisplay: `${deviation.toFixed(1)} pt`, themeClass: 'theme-extreme', delayMs: NAME_ENTRY_AFTER_RESULT_MS },
      setBlocked: (blocked) => { this.isNameEntryOpen = blocked; },
      onName: (name) => RankingManager.addScore(deviation, rankText, name),
      onClosed: () => { this.resultArmTime = performance.now() + 800; },
    });
  }

  // --- Danger overlay: screen-edge vignette + flash, no numbers ---
  private updateDangerOverlay(limitVal: number, dt: number) {
    // Tiers:
    // 0–60: nothing
    // 60–80: faint vignette grows in (orange-red glow at edges)
    // 80–90: vignette bright, slow pulse
    // 90–100: vignette full + rapid white flash
    this.flashTimer -= dt;
    this.hudActionGuide.classList.toggle('danger', limitVal >= 70);

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
}
