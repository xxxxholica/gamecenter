// ============================================================
// Core Game Controller: Tani Multiplier Runner
// Minimal UI text, humanoid crowd, 124 wall, and bonus flight track
// ============================================================

import { countUpText } from '../../../shared/arcadeScoreCountUp.ts';
import * as THREE from 'three';
import { inputManager } from './input.ts';
import { sound } from './audio.ts';
import { StudentCrowd } from './studentMesh.ts';
import { WorldManager, GatePair, RING_HALF_WIDTH } from './world.ts';
import { pickRequirement } from './courseGenerator.ts';
import { LEVELS, LEVEL_ORDER, LevelId, loadLevel, saveLevel } from './levels.ts';
import { EffectsManager } from './effects.ts';
import { GateInfo, MathOpType } from './textures.ts';
import { gateResult } from './gateGenerator.ts';
import { RankingStore } from './ranking.ts';
import { LevelSelectScreen } from './levelSelectScreen.ts';
import { ResultMenu } from './resultMenu.ts';
import { buttonIconHtml, mountArcadeGuide } from '../../../shared/arcadeGuide.ts';
import { ArcadePause } from '../../../shared/arcadePause.ts';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen.ts';
import { returnToHub } from '../../../shared/homeReturn.ts';
import { startArcadeCountdown, type ArcadeCountdownHandle } from '../../../shared/arcadeCountdown';
import { reportDeathPoint, reportDeepAnalytics, reportRoundStart } from '../../../shared/arcadeAnalytics';
import { benchDone, benchMark, benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import { runHighScoreEntryFlow, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';

/** 最後のジャンプのタイミングゲージ: 緑の帯の中心(0〜1)・半幅、カーソルの往復にかかる秒数、受付時間 */
const LAUNCH_ZONE_CENTER = 0.8;
const LAUNCH_ZONE_HALF = 0.07;
const LAUNCH_SWEEP_SEC = 0.9;
const LAUNCH_WINDOW_SEC = 1.8;

export type GameState =
  | 'TITLE'
  | 'LEVEL_SELECT'
  | 'COUNTDOWN'
  | 'RUNNING'
  | 'WALL_CRASH'
  | 'BONUS_LAUNCH'
  | 'BONUS_FLIGHT'
  | 'STAGE_CLEAR'
  | 'GAME_CLEAR'
  | 'GAME_OVER';

export class Game {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;

  public state: GameState = 'TITLE';
  private countdown: ArcadeCountdownHandle | null = null;
  public crowd: StudentCrowd;
  public world: WorldManager;
  public effects: EffectsManager;

  // Running settings (High-speed sprint!)
  public forwardSpeed: number = 22.5;
  public playerZ: number = 0;
  public currentCredits: number = 4;
  public graduationRequirement: number = 124;

  // Bonus Flight settings
  public flightBoost: number = 1.0;
  /** 最後のジャンプのタイミング判定(0〜1)。ボタンを押した位置が緑の帯の中心に近いほど1 */
  private launchQuality = 0;
  private launchPressed = false;
  private launchLockedAt = 0;
  public bonusTimer: number = 0;
  public maxAchievedMultiplier: number = 1.0;
  /** 壁に着いた時点の人数(124を消費する前)。取得単位 = これ × 到達倍率 */
  public creditsAtWall: number = 0;

  // ボーナス飛行の操作: 加速は3回まで、リング成功ごとに取得単位 +10%
  private flightTotal: number = 0;

  /** 現在のステージ番号(0: 小学生 → 1: 中学生 → 2: 高専生)とレベル */
  public stageIndex: number = 0;
  public level: LevelId = loadLevel();
  /** 通しプレイでこれまで卒業した学校の合計取得単位と内訳 */
  public totalScore: number = 0;
  public stageScores: { level: LevelId; score: number }[] = [];
  private countdownElapsed: number = 0;

  private readonly benchScene = benchParam('scene');
  private benchClock = 0;
  private benchNextBoost = 0;
  private levelSelect!: LevelSelectScreen;
  private resultMenu = new ResultMenu();
  private flightBoostsLeft: number = 0;
  public ringsHit: number = 0;
  private pickupsCollected = 0;
  private reqTextElem: HTMLElement | null = null;
  private stageTextElem: HTMLElement | null = null;
  private roundIntroBanner: HTMLElement | null = null;
  private roundIntroHeadline: HTMLElement | null = null;
  private roundIntroSub: HTMLElement | null = null;
  private launchCursorElem: HTMLElement | null = null;
  private bonusHintElem: HTMLElement | null = null;
  public lastDingMultiplier: number = 1.0;

  // Third-person camera tracking
  private camPos: THREE.Vector3 = new THREE.Vector3(0, 6.0, 10.0);
  private camLookAt: THREE.Vector3 = new THREE.Vector3(0, 1.5, -6.0);
  /** 壁にぶつかった後のカメラの目標(毎フレーム new しない) */
  private readonly crashCamPos = new THREE.Vector3();
  private readonly crashCamLook = new THREE.Vector3();

  // HUD Elements
  private hudElem: HTMLElement | null = null;
  private taniCounterElem: HTMLElement | null = null;
  private creditsBoxElem: HTMLElement | null = null;
  private bonusHudElem: HTMLElement | null = null;
  private bonusMultTextElem: HTMLElement | null = null;

  // Overlay Screens
  private arcadeTitleScreen: ArcadeTitleScreen | null = null;
  private levelSelectScreen: HTMLElement | null = null;
  private failScreen: HTMLElement | null = null;
  private failScoreElem: HTMLElement | null = null;
  private successScreen: HTMLElement | null = null;
  private finalMultElem: HTMLElement | null = null;
  private finalScoreElem: HTMLElement | null = null;
  private finalRingElem: HTMLElement | null = null;

  constructor() {
    const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.004);

    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 6.0, 10.0);

    // 高解像度(Retina等)では描画解像度自体が高くギザギザが目立たないため、MSAA(antialias)は等倍の画面だけで使う。
    // 2倍解像度でのMSAAはGPU負荷が大きい割に見た目の差がほとんど無い
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: window.devicePixelRatio < 1.5,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    // 等倍の画面では 1.5 倍の解像度で描いて縮める(細い線や遠くの模様がなめらかになり、GPU の仕事も増えて省電力でクロックが下がりきらない)
    this.renderer.setPixelRatio(window.devicePixelRatio < 1.5 ? 1.5 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.crowd = new StudentCrowd(this.scene);
    this.world = new WorldManager(this.scene);
    this.effects = new EffectsManager(this.scene, this.camera);

    this.cacheDOMElements();
    this.setupEventListeners();

    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    if (isPreview) {
      const titleElem = document.getElementById('screen-title');
      if (titleElem) titleElem.style.display = 'none';
      const guideElem = document.querySelector('.agc-root');
      if (guideElem) (guideElem as HTMLElement).style.display = 'none';
      this.startGame();
      this.countdown?.cancel();
      this.hideRoundIntroBanner();
      this.state = 'RUNNING';
      this.currentCredits = 36;
      this.crowd.reset(36);
      this.playerZ = -20;
      if (this.hudElem) this.hudElem.style.display = 'none';
    } else {
      this.initArcadeTitleScreen();
      this.showTitleGuide();
    }

    // ベンチマーク(?bench=1): 全レベルを、ボットの操作で走る(ゲート → 壁 → ジャンプ台 → 空中のリング)
    declareBenchTargets([
      { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
      ...LEVEL_ORDER.map((id) => ({
        id: `run-${id}`,
        label: `${LEVELS[id].label} を走る`,
        kind: 'run',
        params: { scene: 'run', level: id },
        input: 'self' as const,
        seconds: 150,
      })),
    ]);
    if (this.benchScene === 'run') {
      const lv = benchParam('level');
      if (lv && (LEVEL_ORDER as string[]).includes(lv)) this.level = lv as LevelId;
      this.startGame();
    } else if (this.benchScene === 'title') {
      benchReady('title');
    }

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.animate(0);
  }

  private cacheDOMElements(): void {
    this.hudElem = document.getElementById('hud');
    if (this.hudElem) this.hudElem.style.display = 'none';
    this.taniCounterElem = document.getElementById('tani-counter');
    this.creditsBoxElem = document.getElementById('hud-credits-box');
    this.bonusHudElem = document.getElementById('bonus-multiplier-hud');
    this.bonusMultTextElem = document.getElementById('bonus-current-mult');

    this.levelSelectScreen = document.getElementById('level-select-screen');
    this.failScreen = document.getElementById('fail-screen');
    this.failScoreElem = document.getElementById('fail-score-display');
    this.successScreen = document.getElementById('success-screen');
    this.finalMultElem = document.getElementById('final-multiplier-display');
    this.finalScoreElem = document.getElementById('final-score-display');
    this.finalRingElem = document.getElementById('final-ring-display');
    this.reqTextElem = document.getElementById('req-text');
    this.stageTextElem = document.getElementById('stage-text');
    this.roundIntroBanner = document.getElementById('round-intro-banner');
    this.roundIntroHeadline = document.getElementById('round-intro-headline');
    this.roundIntroSub = document.getElementById('round-intro-sub');
    this.bonusHintElem = document.getElementById('bonus-hint');
  }

  private setupEventListeners(): void {
    // 難易度選択(カード描画・アケコン/キーボード操作は LevelSelectScreen が持つ)
    this.levelSelect = new LevelSelectScreen(this.levelSelectScreen!, {
      onSelect: (level) => {
        this.level = level;
        saveLevel(level);
      },
      onConfirm: () => this.startGame(),
      onBack: () => this.showTitleScreen(),
    });


    // 再挑戦 / 次の学校へ進むボタン
    const retryFailBtn = document.getElementById('retry-fail-btn');
    if (retryFailBtn) {
      retryFailBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.startGame();
      });
    }
    const retrySuccessBtn = document.getElementById('retry-success-btn');
    if (retrySuccessBtn) {
      retrySuccessBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.state === 'STAGE_CLEAR') {
          this.startStage(this.stageIndex + 1);
        } else {
          this.startGame();
        }
      });
    }

    // タイトルに戻るボタン
    for (const id of ['title-fail-btn', 'title-success-btn']) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showTitleScreen();
        });
      }
    }

    // ゲームを終了（ハブへ戻る）ボタン
    for (const id of ['exit-fail-btn', 'exit-success-btn']) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          returnToHub();
        });
      }
    }
  }

  private initArcadeTitleScreen(): void {
    this.arcadeTitleScreen = new ArcadeTitleScreen({
      slug: 'tani-runner-124',
      accentColor: '#00e676',
      tagline: '小学校・中学校・高専を卒業して 留年の壁を打ち破れ！',
      startButtonLabel: 'スタート',
      promptLabel: 'PRESS START / ENTER / 画面クリック',
      onStart: () => {
        this.startGame();
      },
    });

    this.arcadeTitleScreen.show();
  }

  /** 難易度選択画面を開く（ベンチマーク・デバッグ用） */
  public openLevelSelect(): void {
    this.state = 'LEVEL_SELECT';
    this.resultMenu.close();
    this.arcadeTitleScreen?.hide();
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    if (this.hudElem) this.hudElem.style.display = 'none';
    this.levelSelect.show(this.level);
    mountArcadeGuide({
      moveLabel: 'レベル選択',
      buttons: [
        { indices: [0], label: '決定' },
        { indices: [1], label: 'タイトルへ' },
      ],
      showHomeHint: true,
      backLabel: 'タイトルへ',
    });
  }

  /** タイトル画面に戻る */
  public showTitleScreen(): void {
    this.countdown?.cancel();
    this.hideRoundIntroBanner();
    this.state = 'TITLE';
    this.resultMenu.close();
    this.levelSelect.hide();
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    if (this.hudElem) this.hudElem.style.display = 'none';
    this.arcadeTitleScreen?.show();
    this.showTitleGuide();
  }

  private hideRoundIntroBanner(): void {
    this.roundIntroBanner?.classList.add('hidden');
    this.roundIntroBanner?.classList.remove('stage-clear-mode');
    this.roundIntroBanner?.style.removeProperty('--dim');
    this.roundIntroSub?.classList.add('hidden');
  }

  private showTitleGuide(): void {
    mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
  }

  /** プレイ中のガイド。カウントダウン中はポーズできないので、移動だけ出して、ホーム/ポーズの行は出さない */
  private showRunGuide(pausable = true): void {
    mountArcadeGuide({
      moveLabel: '移動',
      showHomeHint: pausable,
      backLabel: 'ポーズ',
    });
  }

  private showResultGuide(): void {
    mountArcadeGuide({
      moveLabel: '選択',
      buttons: [
        { indices: [0], label: '決定' },
        { indices: [1], label: '終了' },
      ],
      showHomeHint: true,
      backLabel: 'タイトルへ',
    });
  }

  /** 小学生 → 中学生 → 高専生 の3ステージ通しプレイを最初から始める */
  public startGame(): void {
    this.totalScore = 0;
    this.stageScores = [];
    const startIdx = this.benchScene === 'run' ? Math.max(0, LEVEL_ORDER.indexOf(this.level)) : 0;

    sound.init();
    sound.playCoin();

    this.startStage(startIdx);
  }

  /** 指定ステージ(0: 小学校 / 1: 中学校 / 2: 高専)を開始する */
  public startStage(stageIndex: number): void {
    this.stageIndex = stageIndex;
    this.level = LEVEL_ORDER[stageIndex] ?? 'elementary';
    saveLevel(this.level);

    this.arcadeTitleScreen?.hide();
    this.levelSelect.hide();
    this.resultMenu.close();
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    this.bonusHudElem?.classList.add('hidden');
    this.showLaunchTiming(false);
    this.showRunGuide(false);
    if (this.hudElem) this.hudElem.style.display = 'block';

    sound.playStartJingle();

    // 極限ギリギリ選手権のように「小学校を卒業せよ」等の大見出しと 3・2・1・GO! を出してラウンドを始める
    this.roundIntroBanner?.classList.remove('hidden', 'stage-clear-mode');
    this.roundIntroBanner?.style.setProperty('--dim', '1');
    if (this.roundIntroHeadline) {
      this.roundIntroHeadline.textContent = LEVELS[this.level].headline;
    }
    this.roundIntroSub?.classList.add('hidden');

    this.state = 'COUNTDOWN';
    this.countdownElapsed = 0;
    this.countdown?.cancel();
    this.countdown = startArcadeCountdown({
      accentColor: '#ffea00',
      offsetY: '16vh',
      onGo: () => {
        this.hideRoundIntroBanner();
        this.state = 'RUNNING';
        this.showRunGuide();
        sound.startRunningBgm();
        if (this.benchScene === 'run') benchReady('run-start');
      },
    });
    this.playerZ = 0;
    this.currentCredits = 4;
    this.flightBoost = 1.0;
    this.launchQuality = 0;
    this.launchPressed = false;
    this.maxAchievedMultiplier = 1.0;
    this.lastDingMultiplier = 1.0;
    this.creditsAtWall = 0;

    // Reset camera to start line
    this.camPos.set(0, 6.0, 10.0);
    this.camLookAt.set(0, 1.5, -6.0);

    // Completely reset crowd state (clears flying/dead states from previous run)
    this.crowd.reset(this.currentCredits);

    // 今回の卒業要件を抽選し、ゲート・障害物・アイテム・リングを作り直す
    this.graduationRequirement = pickRequirement(this.level);
    this.world.reset(this.graduationRequirement, this.level);
    this.ringsHit = 0;
    this.pickupsCollected = 0;
    reportDeepAnalytics('progression_update', {
      difficulty: LEVELS[this.level].label,
      extraStats: { stage: this.stageIndex + 1, requirement: this.graduationRequirement },
    });
    reportRoundStart({ stage: this.stageIndex + 1, difficulty: LEVELS[this.level].label, requirement: this.graduationRequirement });
    this.effects.clearAll();
    if (this.reqTextElem) this.reqTextElem.textContent = `要件 ${this.graduationRequirement}`;
    if (this.stageTextElem) this.stageTextElem.textContent = LEVELS[this.level].schoolName;

    this.updateHUD();
  }

  public setCredits(amount: number, delta: number = 0): void {
    this.currentCredits = Math.max(0, Math.floor(amount));
    this.crowd.setCount(this.currentCredits);

    if (this.taniCounterElem) {
      this.taniCounterElem.textContent = this.currentCredits.toString();
      this.fitCreditText(this.taniCounterElem, this.currentCredits);
    }

    if (this.creditsBoxElem) {
      if (delta > 0) {
        this.creditsBoxElem.classList.remove('shrink');
        this.creditsBoxElem.classList.add('pulse');
        setTimeout(() => this.creditsBoxElem?.classList.remove('pulse'), 150);
      } else if (delta < 0) {
        this.creditsBoxElem.classList.remove('pulse');
        this.creditsBoxElem.classList.add('shrink');
        setTimeout(() => this.creditsBoxElem?.classList.remove('shrink'), 150);
      }
    }

    // Immediate fail if credits drop to 0
    if (this.currentCredits <= 0 && this.state === 'RUNNING') {
      if (this.benchScene === 'run') {
        // ベンチ: 引き算・割り算のゲートで全滅しても終わらせず、壁・ジャンプ台・空中のリングまで走りきる
        benchMark('credits-rescued');
        this.setCredits(6);
        return;
      }
      this.triggerGameOver();
    }
  }

  private updateHUD(): void {
    if (this.taniCounterElem) {
      this.taniCounterElem.textContent = this.currentCredits.toString();
      this.fitCreditText(this.taniCounterElem, this.currentCredits);
    }
  }

  /** 桁数が増えても枠からはみ出さないように HUD の単位数字サイズを自動調整 */
  private fitCreditText(el: HTMLElement, value: number): void {
    const digits = String(Math.abs(Math.floor(value))).length;
    if (digits <= 4) {
      el.style.fontSize = '';
    } else if (digits === 5) {
      el.style.fontSize = 'clamp(30px, 4.4vw, 58px)';
    } else if (digits === 6) {
      el.style.fontSize = 'clamp(26px, 3.8vw, 48px)';
    } else {
      el.style.fontSize = 'clamp(22px, 3.2vw, 40px)';
    }
  }

  /** リザルト画面の大きな単位数字も桁数に応じて収まるサイズに調整 */
  private fitResultScoreText(el: HTMLElement, value: number): void {
    const digits = String(Math.abs(Math.floor(value))).length;
    if (digits <= 4) {
      el.style.fontSize = '';
    } else if (digits === 5) {
      el.style.fontSize = 'clamp(38px, min(14vh, 9.5vw), 115px)';
    } else if (digits === 6) {
      el.style.fontSize = 'clamp(32px, min(12vh, 8vw), 96px)';
    } else {
      el.style.fontSize = 'clamp(26px, min(10vh, 6.8vw), 80px)';
    }
  }

  /** ポーズ(Backspace / SELECT): 走行中に止めて、やり直せる */
  private readonly pause = new ArcadePause({
    accent: '#00e676',
    isPlaying: () =>
      this.state === 'COUNTDOWN' ||
      this.state === 'RUNNING' ||
      this.state === 'WALL_CRASH' ||
      this.state === 'BONUS_LAUNCH' ||
      this.state === 'BONUS_FLIGHT',
    onOpen: () => this.countdown?.pause(),     // 3・2・1 の最中も開ける(数字はポーズの間、止まる)
    onClose: () => this.countdown?.resume(),
    onRestart: () => this.startGame(),
  });

  // Main game loop
  private lastTime: number = 0;
  private animate = (time: number): void => {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.08, (time - this.lastTime) / 1000) || 0.016;
    this.lastTime = time;

    let input = inputManager.poll();
    if (this.benchScene === 'run') input = this.benchBot(input, dt);

    // State machine(ポーズ中は進めない)
    switch (this.pause.isOpen ? 'PAUSED' : this.state) {
      case 'COUNTDOWN':
        // カウントダウンの経過に合わせて暗幕をなめらかに晴らす
        this.countdownElapsed += dt;
        this.roundIntroBanner?.style.setProperty('--dim', String(Math.max(0, 1 - this.countdownElapsed / 2.4)));
        // 走り出す前の待機。群衆を足踏みさせるだけで、前進・ゲート判定はしない
        this.crowd.updateRunning(dt, 0);
        break;
      case 'RUNNING':
        this.updateRunning(dt, input);
        break;
      case 'WALL_CRASH':
        this.updateWallCrash(dt, input);
        break;
      case 'BONUS_LAUNCH':
        this.updateBonusLaunch();
        break;
      case 'BONUS_FLIGHT':
        this.updateBonusFlight(dt, input);
        break;
    }

    this.effects.update(dt, this.camPos, this.camLookAt);
    this.renderer.render(this.scene, this.camera);
  };

  /** ベンチマーク用のボット: 左右にゆるく振りながら走り、ジャンプ台は緑の帯で押し、空中では一定間隔で加速する。 */
  private benchBot(input: ReturnType<typeof inputManager.poll>, dt: number): ReturnType<typeof inputManager.poll> {
    this.benchClock += dt;
    let actionJustPressed = false;
    if (this.state === 'WALL_CRASH' && !this.launchPressed) {
      actionJustPressed = Math.abs(this.launchCursorPos(this.bonusTimer) - LAUNCH_ZONE_CENTER) < 0.05;
    } else if (this.state === 'BONUS_FLIGHT' && this.benchClock >= this.benchNextBoost) {
      actionJustPressed = true;
      this.benchNextBoost = this.benchClock + 1.5;
    }
    let moveX = Math.sin(this.benchClock * 1.1) * 0.9;
    if (this.state === 'RUNNING') {
      // 次のゲートは、通ったあとの人数が多い側へ寄る
      const next = this.world.gates.find((g) => !g.leftGate.passed && !g.rightGate.passed && g.z < this.playerZ);
      if (next) moveX = gateResult(this.currentCredits, next.leftGate.info).survivors >= gateResult(this.currentCredits, next.rightGate.info).survivors ? -0.9 : 0.9;
      if (this.currentCredits > 0 && this.currentCredits < 6) this.setCredits(6);   // 全滅で終わらないように
      // 壁の手前で卒業要件に届いていなければ、足す(ジャンプ台・空中のリングまで必ず見せるため)
      if (this.playerZ <= this.world.bossWallZ + 6 && this.currentCredits < this.graduationRequirement + 40) {
        this.setCredits(this.graduationRequirement + 40);   // 直前の障害物で減っても届くように、余裕をもたせる
        benchMark('credits-topped-up');
      }
    }
    return { ...input, moveX, narrowFormation: false, actionPressed: actionJustPressed, actionJustPressed };
  }

  // State: Running forward through gates
  private updateRunning(dt: number, input: ReturnType<typeof inputManager.poll>): void {
    this.playerZ -= this.forwardSpeed * dt;
    this.crowd.groupZ = this.playerZ;
    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    const mx = isPreview ? Math.sin(performance.now() * 0.003) * 0.4 : input.moveX;
    this.crowd.updateRunning(dt, mx);
    if (isPreview && this.hudElem) this.hudElem.style.display = 'none';

    // Gate collision checking: individual student boundary detection!
    for (const gatePair of this.world.gates) {
      if (this.playerZ <= gatePair.z && !gatePair.leftGate.passed && !gatePair.rightGate.passed) {
        gatePair.leftGate.passed = true;
        gatePair.rightGate.passed = true;

        this.processIndividualGateCollisions(gatePair);

        gatePair.leftGate.mesh.visible = false;
        gatePair.rightGate.mesh.visible = false;
        break;
      }
    }

    // 障害物(課題)とアイテム(友達)
    this.world.updateItems(dt);
    this.processCourseItems();

    // Third-person camera tracking:
    // Follows behind and above the crowd, smoothly expanding zoom based on crowd size
    const crowdScale = Math.min(4.5, Math.sqrt(this.currentCredits) * 0.3);
    const camDist = 8.5 + crowdScale * 1.1;
    const camHeight = 5.2 + crowdScale * 0.6;

    const targetCamX = this.crowd.groupX * 0.45;
    const targetCamY = camHeight;
    const targetCamZ = this.playerZ + camDist;

    this.camPos.set(targetCamX, targetCamY, targetCamZ);
    this.camLookAt.set(this.crowd.groupX * 0.25, 1.4, this.playerZ - 12.0);

    // Approach 124 Wall
    if (this.playerZ <= this.world.bossWallZ + 3.0) {
      this.checkWallEncounter();
    }
  }

  // Individual student gate collision:
  // Characters that overflow into the negative gate get ELIMINATED with red bursts!
  private processIndividualGateCollisions(gatePair: GatePair): void {
    let leftCount = 0;
    let rightCount = 0;
    const leftPositions: { x: number; y: number; z: number }[] = [];
    const rightPositions: { x: number; y: number; z: number }[] = [];

    for (let i = 0; i < this.crowd.count; i++) {
      const s = this.crowd.students[i];
      if (!s.active || s.isFlying) continue;

      const wx = this.crowd.groupX + s.localX;
      const wz = this.playerZ + s.localZ;

      if (wx <= 0) {
        leftCount++;
        leftPositions.push({ x: wx, y: 0.5, z: wz });
      } else {
        rightCount++;
        rightPositions.push({ x: wx, y: 0.5, z: wz });
      }
    }

    const leftInfo = gatePair.leftGate.info;
    const rightInfo = gatePair.rightGate.info;

    // Calculate survivors/spawn for each side
    const leftRes = this.calcSideGateResult(leftCount, leftInfo);
    const rightRes = this.calcSideGateResult(rightCount, rightInfo);

    let touchedNegative = false;

    // Red burst effects for eliminated characters on the left
    if (leftRes.eliminated > 0) {
      touchedNegative = true;
      const countToSpawn = Math.min(leftRes.eliminated, leftPositions.length, 35);
      for (let k = 0; k < countToSpawn; k++) {
        const p = leftPositions[k];
        this.effects.spawnDispersalDebris(p.x, p.y, p.z, 2, true);
      }
    }

    // Red burst effects for eliminated characters on the right
    if (rightRes.eliminated > 0) {
      touchedNegative = true;
      const countToSpawn = Math.min(rightRes.eliminated, rightPositions.length, 35);
      for (let k = 0; k < countToSpawn; k++) {
        const p = rightPositions[k];
        this.effects.spawnDispersalDebris(p.x, p.y, p.z, 2, true);
      }
    }

    if (touchedNegative) {
      sound.playCreditDown();
      inputManager.rumble(300, 0.9, 0.6);
      this.effects.shake(0.48, 0.32);
    }

    const newTotal = leftRes.survivors + rightRes.survivors;
    const delta = newTotal - this.currentCredits;

    const isMultiplicative = (op: MathOpType) =>
      op === 'integral_double' || op === 'integral_triple' || op === 'tensor_prod' || op === 'eigen_boost' || op === 'limit_inf' ||
      op === 'affine' || op === 'square' || op === 'percent_up';

    const gained = delta > 0;
    if (gained && !touchedNegative) {
      const isSuper = (leftCount > 0 && isMultiplicative(leftInfo.type)) || (rightCount > 0 && isMultiplicative(rightInfo.type));
      sound.playCreditUp(isSuper);
      inputManager.rumble(130, 0.25, 0.6);
      this.effects.shake(0.25, 0.18);
    } else if (gained && touchedNegative) {
      // Both loss and gain happened in split crowd
      sound.playCreditUp(false);
    }

    // Update total credits:
    // If newTotal > 0, runners continue sprint.
    // If newTotal <= 0, credits hit 0 and all runners are gone.
    this.setCredits(newTotal, delta);
  }

  // ゲート1つを適用した結果(計算は gateGenerator.ts の gateResult と共通)
  private calcSideGateResult(count: number, info: GateInfo): {
    survivors: number;
    eliminated: number;
  } {
    return gateResult(count, info);
  }

  // 障害物に触れた生徒は脱落し、アイテムの近くを通ると人数が増える
  private processCourseItems(): void {
    for (const ob of this.world.obstacles) {
      if (ob.hit || this.playerZ > ob.spec.z) continue;
      ob.hit = true;

      const half = ob.spec.width / 2 + 0.25;
      const hitPositions: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < this.crowd.count; i++) {
        const s = this.crowd.students[i];
        if (!s.active || s.isFlying) continue;
        const wx = this.crowd.groupX + s.localX;
        if (Math.abs(wx - ob.currentX) <= half) {
          hitPositions.push({ x: wx, y: 0.5, z: this.playerZ + s.localZ });
        }
      }

      if (hitPositions.length > 0) {
        const burst = Math.min(hitPositions.length, 30);
        for (let k = 0; k < burst; k++) {
          const p = hitPositions[k];
          this.effects.spawnDispersalDebris(p.x, p.y, p.z, 2, true);
        }
        sound.playCreditDown();
        inputManager.rumble(250, 0.8, 0.5);
        this.effects.shake(0.4, 0.28);
        const newTotal = this.currentCredits - hitPositions.length;
        // 死亡地点マップ: 障害物で脱落した場所(横・進んだ距離)と人数
        reportDeathPoint(`level:${this.level}`, ob.currentX, -ob.spec.z, '障害物', { lost: hitPositions.length });
        this.setCredits(newTotal, -hitPositions.length);
        if (this.state !== 'RUNNING') return;
      }
    }

    for (const pk of this.world.pickups) {
      if (pk.collected || this.playerZ > pk.spec.z) continue;
      pk.collected = true;

      let near = false;
      for (let i = 0; i < this.crowd.count; i++) {
        const s = this.crowd.students[i];
        if (!s.active || s.isFlying) continue;
        if (Math.abs(this.crowd.groupX + s.localX - pk.spec.x) < 1.4) {
          near = true;
          break;
        }
      }
      if (!near) continue;

      this.world.hideItem(pk.mesh);
      this.effects.spawnDispersalDebris(pk.spec.x, 1.0, pk.spec.z, 8, false);
      sound.playCreditUp(false);
      inputManager.rumble(100, 0.2, 0.5);
      this.pickupsCollected++;
      this.setCredits(this.currentCredits + pk.spec.value, pk.spec.value);
    }
  }

  // ボーナス飛行のリング: 飛行中の生徒の3割が2本の柱の間を通ると成功(取得単位 +10%)。高さは問わない
  private checkRingCrossing(x: number, _y: number, prevZ: number, z: number): void {
    for (const ring of this.world.rings) {
      if (ring.hit || !(prevZ > ring.spec.z && z <= ring.spec.z)) continue;
      if (Math.abs(x - ring.spec.x) > RING_HALF_WIDTH) continue;

      ring.passCount++;
      if (ring.passCount >= Math.max(3, this.flightTotal * LEVELS[this.level].ringPassRatio)) {
        ring.hit = true;
        this.ringsHit++;
        (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x39ff88);
        sound.playMultiplierDing(1500);
        inputManager.rumble(100, 0.3, 0.6);
        this.updateBonusHint();
      }
    }
  }

  private updateBonusHint(): void {
    if (!this.bonusHintElem) return;
    const hint = `加速 ${this.flightBoostsLeft} ・ リング ${this.ringsHit}/${this.world.rings.length}`;
    if (this.bonusHintElem.textContent !== hint) this.bonusHintElem.textContent = hint;
  }

  // Check 124 Wall Barrier Encounter
  private checkWallEncounter(): void {
    if (this.currentCredits < this.graduationRequirement) {
      // Failed! Not enough credits (全員圧殺・跳ね返り)
      sound.stopBgm();
      sound.playObstacleCrash();
      inputManager.rumble(500, 1.0, 0.8);
      this.effects.shake(0.8, 0.6);
      this.effects.spawnDispersalDebris(this.crowd.groupX, 1.0, this.world.bossWallZ, 40, true);
      this.crowd.killAll();
      this.triggerGameOver();
    } else {
      // Success! 124 units consumed to shatter the wall
      sound.stopBgm();
      sound.playWallBreak();
      inputManager.rumble(600, 1.0, 0.9);
      this.effects.shake(0.9, 0.7);

      // 取得単位の元になる人数(124を消費する前)
      this.creditsAtWall = this.currentCredits;

      // Consume 124 credits
      const surplus = this.currentCredits - this.graduationRequirement;
      this.setCredits(surplus, -this.graduationRequirement);

      // Shatter wall
      this.world.hideBossWall();
      this.effects.spawnWallShatter(0, 3.4, this.world.bossWallZ, 10.8, 6.8);

      // Transition to Wall Crash & ジャンプのタイミング判定
      this.state = 'WALL_CRASH';
      this.bonusTimer = 0;
      this.launchQuality = 0;
      this.launchPressed = false;
      this.launchLockedAt = 0;
      this.showLaunchTiming(true);
    }
  }

  // State: ジャンプ台の手前。ゲージの緑の帯でボタンを押すほど遠くへ飛ぶ(押した位置で1回だけ確定)
  private updateWallCrash(dt: number, input: ReturnType<typeof inputManager.poll>): void {
    this.bonusTimer += dt;

    const pos = this.launchCursorPos(this.bonusTimer);
    if (!this.launchPressed) {
      this.setLaunchCursor(pos);
      if (input.actionJustPressed) {
        this.launchPressed = true;
        this.launchLockedAt = this.bonusTimer;
        const d = Math.abs(pos - LAUNCH_ZONE_CENTER);
        this.launchQuality = d <= LAUNCH_ZONE_HALF ? 1 : Math.max(0, 1 - (d - LAUNCH_ZONE_HALF) / 0.5);
        const label = this.launchQuality >= 1 ? 'PERFECT!!' : this.launchQuality >= 0.6 ? 'GOOD' : 'ミス';
        const resultEl = document.getElementById('launch-timing-result');
        if (resultEl) resultEl.textContent = label;
        sound.playShootRocket();
        inputManager.rumble(80, 0.5, 0.6);
        this.effects.shake(0.2 + 0.3 * this.launchQuality, 0.15);
      }
    }

    // Move slightly forward onto ramp
    this.playerZ -= 6.0 * dt;
    this.crowd.groupZ = this.playerZ;
    this.crowd.updateRunning(dt, 0);

    // Dynamic cinematic camera shifting to side-angle
    this.camPos.lerp(this.crashCamPos.set(7.0, 4.5, this.world.bossWallZ + 12.0), dt * 5.0);
    this.camLookAt.lerp(this.crashCamLook.set(0, 2.0, this.world.bossWallZ - 20.0), dt * 5.0);

    // 押した場合は結果を少し見せてから、押さなかった場合は時間切れで飛ぶ
    const done = this.launchPressed ? this.bonusTimer - this.launchLockedAt >= 0.6 : this.bonusTimer >= LAUNCH_WINDOW_SEC;
    if (done) {
      this.showLaunchTiming(false);
      this.state = 'BONUS_LAUNCH';
    }
  }

  /** ゲージのカーソル位置(0〜1)。往復し続ける */
  private launchCursorPos(t: number): number {
    const phase = (t / LAUNCH_SWEEP_SEC) % 1;
    return Math.abs(phase * 2 - 1);
  }

  private setLaunchCursor(pos: number): void {
    this.launchCursorElem ??= document.getElementById('launch-timing-cursor');
    if (this.launchCursorElem) this.launchCursorElem.style.left = `${pos * 100}%`;
  }

  private showLaunchTiming(show: boolean): void {
    const box = document.getElementById('launch-timing');
    if (!box) return;
    box.classList.toggle('hidden', !show);
    if (show) {
      // 押すボタンをアイコンで示す(プレイ中のガイドには出さないため、ここで教える)
      const label = box.querySelector('.launch-timing-label');
      if (label) label.innerHTML = `${buttonIconHtml([0])} タイミングよくジャンプ`;
      const zone = document.getElementById('launch-timing-zone');
      if (zone) {
        zone.style.left = `${(LAUNCH_ZONE_CENTER - LAUNCH_ZONE_HALF) * 100}%`;
        zone.style.width = `${LAUNCH_ZONE_HALF * 2 * 100}%`;
      }
      const resultEl = document.getElementById('launch-timing-result');
      if (resultEl) resultEl.textContent = '';
      this.setLaunchCursor(0);
    }
  }

  // State: Launch students off ramp into the air
  private updateBonusLaunch(): void {
    this.state = 'BONUS_FLIGHT';

    // ジャンプのタイミングが良いほど遠くへ飛ぶ(1.0〜1.7)
    this.flightBoost = 1.0 + 0.7 * this.launchQuality;

    sound.playCatapultLaunch();
    inputManager.rumble(600, 0.9, 0.9);
    this.effects.shake(0.7, 0.5);

    // Launch all remaining students
    this.crowd.launchFlight(this.flightBoost);

    // Show bonus multiplier HUD
    this.flightBoostsLeft = LEVELS[this.level].maxBoosts;
    this.flightTotal = this.currentCredits;
    this.updateBonusHint();
    this.bonusHudElem?.classList.remove('hidden');
    if (this.bonusMultTextElem) {
      this.bonusMultTextElem.textContent = '×1.0';
    }
  }

  // State: Flying & sliding along bonus track
  private updateBonusFlight(dt: number, input: ReturnType<typeof inputManager.poll>): void {
    // 方向: 空中の生徒を左右に振ってリングを狙う。加速: ボタンでもう一押し(3回まで)
    this.crowd.steerFlight(dt, input.moveX);
    if (input.actionJustPressed && this.flightBoostsLeft > 0) {
      this.flightBoostsLeft--;
      this.crowd.boostFlight(9.0);
      sound.playShootRocket();
      inputManager.rumble(120, 0.5, 0.5);
      this.effects.shake(0.3, 0.2);
      this.updateBonusHint();
    }

    const { furthestZ, allStopped } = this.crowd.updateFlight(dt, (x, y, prevZ, z) => this.checkRingCrossing(x, y, prevZ, z));

    // Check current multiplier at leading student
    const { mult, label } = this.world.getMultiplierAtZ(furthestZ);
    if (mult > this.maxAchievedMultiplier) {
      this.maxAchievedMultiplier = mult;
      if (this.bonusMultTextElem) {
        this.bonusMultTextElem.textContent = label;
      }
      // Sound ping when crossing to higher multiplier
      if (mult > this.lastDingMultiplier) {
        this.lastDingMultiplier = mult;
        sound.playMultiplierDing(700 + mult * 60);
        inputManager.rumble(80, 0.3, 0.6);
      }
    }

    // Cinematic tracking camera following the leading airborne students
    const targetCam = new THREE.Vector3(
      8.5,
      6.5,
      furthestZ + 16.0
    );
    const targetLook = new THREE.Vector3(
      0,
      2.0,
      furthestZ - 12.0
    );

    this.camPos.lerp(targetCam, dt * 6.0);
    this.camLookAt.lerp(targetLook, dt * 6.0);

    // When all students have stopped sliding
    if (allStopped) {
      this.onStageFlightComplete();
    }
  }

  /** ボーナス飛行終了時: 小学校・中学校は「次の学校に進む」ボタン付きのリザルト画面を出し、高専まで卒業したら最終リザルトへ */
  private onStageFlightComplete(): void {
    // 取得単位 = 壁に着いた人数 × 到達倍率。余った人数が多いほど、遠くまで飛ぶほど増える
    const prevTotal = this.totalScore;
    const stageScore = Math.round(this.creditsAtWall * this.maxAchievedMultiplier * (1 + 0.1 * this.ringsHit));
    this.totalScore += stageScore;
    this.stageScores.push({ level: this.level, score: stageScore });

    reportDeepAnalytics('progression_update', {
      result: 'clear',
      difficulty: LEVELS[this.level].label,
      score: stageScore,
      itemsCollected: this.pickupsCollected,
      extraStats: {
        stage: this.stageIndex + 1,
        totalScore: this.totalScore,
        requirement: this.graduationRequirement,
        creditsAtWall: this.creditsAtWall,
        maxMultiplier: this.maxAchievedMultiplier,
        ringsHit: this.ringsHit,
        ringsTotal: this.world.rings.length,
      },
    });

    // ベンチマーク(?bench=1&scene=run)では指定レベル1本だけで完了させる
    if (this.benchScene === 'run' || this.stageIndex >= LEVEL_ORDER.length - 1) {
      this.triggerGameClear(this.totalScore, prevTotal);
      return;
    }

    this.triggerStageClear(prevTotal);
  }

  /** 小学校・中学校の卒業リザルト: 最終リザルトと同じ見た目で、「中学校に進む / 高専に進む」ボタンを初期選択にする */
  private triggerStageClear(startScore: number = 0): void {
    this.state = 'STAGE_CLEAR';
    this.hideRoundIntroBanner();
    sound.stopBgm();
    sound.playVictoryFanfare();

    if (this.finalMultElem) {
      this.finalMultElem.textContent = `倍率 ×${this.maxAchievedMultiplier.toFixed(1)}`;
    }
    const levelEl = document.getElementById('final-level-display');
    if (levelEl) {
      levelEl.textContent = LEVELS[this.level].schoolName;
    }
    if (this.finalRingElem) {
      this.finalRingElem.textContent = `リング ${this.ringsHit}/${this.world.rings.length}${this.ringsHit > 0 ? `  +${this.ringsHit * 10}%` : ''}`;
    }
    if (this.finalScoreElem) {
      this.fitResultScoreText(this.finalScoreElem, this.totalScore);
      countUpText(this.finalScoreElem, `${this.totalScore}`, { startValue: startScore });
    }

    const nextLevel = LEVEL_ORDER[this.stageIndex + 1];
    const primaryBtn = document.getElementById('retry-success-btn');
    const titleBtn = document.getElementById('title-success-btn');
    if (primaryBtn && nextLevel) {
      primaryBtn.textContent = `${LEVELS[nextLevel].schoolName}に進む`;
      primaryBtn.dataset.autoSeconds = '5';
      delete primaryBtn.dataset.autoDisabled;
    }
    if (titleBtn) {
      titleBtn.dataset.autoDisabled = '1';
    }

    this.bonusHudElem?.classList.add('hidden');
    this.successScreen?.classList.remove('hidden');
    this.stampResult(this.successScreen, 1700);
    this.openResultMenu(['retry-success-btn', 'title-success-btn', 'exit-success-btn']);
  }

  // Game Over: 「留年」 (その時点で留年し、それまでに卒業した学校の合計単位を記録)
  private triggerGameOver(): void {
    this.state = 'GAME_OVER';
    this.hideRoundIntroBanner();
    this.bonusHudElem?.classList.add('hidden');
    this.showLaunchTiming(false);
    if (this.benchScene === 'run') benchDone('game-over');
    reportDeepAnalytics('progression_update', {
      result: 'gameover',
      deathReason: '卒業要件に届かず留年',
      difficulty: LEVELS[this.level].label,
      score: this.totalScore,
      itemsCollected: this.pickupsCollected,
      extraStats: {
        stage: this.stageIndex + 1,
        totalScore: this.totalScore,
        requirement: this.graduationRequirement,
        credits: this.currentCredits,
        maxMultiplier: this.maxAchievedMultiplier,
      },
    });
    sound.stopBgm();
    sound.playGameOverJingle();

    if (this.failScoreElem) {
      this.fitResultScoreText(this.failScoreElem, this.totalScore);
      if (this.totalScore > 0) {
        countUpText(this.failScoreElem, `${this.totalScore}`);
      } else {
        this.failScoreElem.textContent = '0';
      }
    }
    const failLevelEl = document.getElementById('fail-level-display');
    if (failLevelEl) {
      failLevelEl.textContent = `${LEVELS[this.level].schoolName}で留年`;
    }
    this.failScreen?.classList.remove('hidden');
    this.stampResult(this.failScreen, this.totalScore > 0 ? 1500 : 700);
    this.openResultMenu(['retry-fail-btn', 'title-fail-btn', 'exit-fail-btn']);

    if (this.totalScore > 0) {
      const score = this.totalScore;
      runHighScoreEntryFlow({
        slug: 'tani-runner-124',
        score,
        modal: { title: '卒業名簿', scoreDisplay: `${score} 単位`, themeClass: 'theme-tani', delayMs: NAME_ENTRY_AFTER_RESULT_MS },
        setBlocked: (blocked) => this.resultMenu.setLocked(blocked),
        onName: (name) => RankingStore.add(score, name, false),
      });
    }
  }

  // Game Clear: 「卒業」 (Yellow bold text) + 3学校の合計取得単位
  private triggerGameClear(score: number = this.totalScore, startScore: number = 0): void {
    this.state = 'GAME_CLEAR';
    this.hideRoundIntroBanner();
    if (this.benchScene === 'run') benchDone('clear');
    sound.stopBgm();
    sound.playVictoryFanfare();

    if (this.finalMultElem) {
      this.finalMultElem.textContent = `倍率 ×${this.maxAchievedMultiplier.toFixed(1)}`;
    }

    const levelEl = document.getElementById('final-level-display');
    if (levelEl) {
      levelEl.textContent = LEVELS[this.level].schoolName;
    }
    if (this.finalRingElem) {
      this.finalRingElem.textContent = `リング ${this.ringsHit}/${this.world.rings.length}${this.ringsHit > 0 ? `  +${this.ringsHit * 10}%` : ''}`;
    }
    if (this.finalScoreElem) {
      this.fitResultScoreText(this.finalScoreElem, score);
      countUpText(this.finalScoreElem, `${score}`, { startValue: startScore });
    }

    const primaryBtn = document.getElementById('retry-success-btn');
    const titleBtn = document.getElementById('title-success-btn');
    if (primaryBtn) {
      primaryBtn.textContent = '再挑戦';
      primaryBtn.dataset.autoDisabled = '1';
      delete primaryBtn.dataset.autoSeconds;
    }
    if (titleBtn) {
      delete titleBtn.dataset.autoDisabled;
    }

    this.bonusHudElem?.classList.add('hidden');
    this.successScreen?.classList.remove('hidden');
    // 数字の加算(約1.45秒)と、最後の弾みが終わってから押す
    this.stampResult(this.successScreen, 1700);
    this.openResultMenu(['retry-success-btn', 'title-success-btn', 'exit-success-btn']);

    runHighScoreEntryFlow({
      slug: 'tani-runner-124',
      score,
      modal: { title: '卒業名簿', scoreDisplay: `${score} 単位`, themeClass: 'theme-tani', delayMs: NAME_ENTRY_AFTER_RESULT_MS },
      setBlocked: (blocked) => this.resultMenu.setLocked(blocked),
      onName: (name) => RankingStore.add(score, name, true),
    });
  }

  /** ハンコを、delayMs 後に「ポン」と音を鳴らして押す(単位が出そろってから) */
  private stampResult(screen: HTMLElement | null, delayMs: number): void {
    const stamp = screen?.querySelector('.result-stamp');
    if (!screen || !stamp) return;
    stamp.classList.remove('stamped');
    window.setTimeout(() => {
      if (screen.classList.contains('hidden')) return;
      stamp.classList.add('stamped');
      sound.playStamp();
    }, delayMs);
  }

  private openResultMenu(buttonIds: string[]): void {
    const buttons = buttonIds.map((id) => document.getElementById(id)).filter((b): b is HTMLElement => b !== null);
    this.resultMenu.open(buttons);
    this.showResultGuide();
  }
}
