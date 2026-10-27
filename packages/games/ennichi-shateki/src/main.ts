import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu';
import * as THREE from 'three';
import { FestivalStall } from './stall';
import { CorkRifle } from './gun';
import { PrizeEntity, createAllPrizes, shuffleShelfLayout } from './prizes';
import { DynamicTargetsManager } from './dynamic_targets';
import { CorkSystem } from './cork';
import { ArcadeInput } from './input';
import { ArcadeHUD } from './hud';
import { sounds } from './audio';
import { ResultsPrizePileManager } from './results_pile';
import { installHomeReturn, returnToHub } from '../../../shared/homeReturn';
import { ArcadePause } from '../../../shared/arcadePause';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { loadRawScores, saveLeaderboardScore } from '../../../shared/arcadeLeaderboard';
import { ENNICHI_ROUND_SECONDS, ENNICHI_EXTENSION_SECONDS } from '../../../shared/ennichiRules';

const SLUG = 'ennichi-shateki';
import { reportDeepAnalytics, reportRoundStart } from '../../../shared/arcadeAnalytics';
import { startArcadeCountdown, type ArcadeCountdownHandle } from '../../../shared/arcadeCountdown';
import { startArcadeTutorial, type ArcadeTutorialHandle } from '../../../shared/arcadeTutorial';
import { runHighScoreEntryFlow, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';
import { benchDone, benchMark, benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import { compileInParallel, waitFramesSettled } from '../../../shared/shaderCompile';

// 戻る操作は Backspace(アケコンは SELECT)に統一。Escape は無効
installHomeReturn();
watchResultAutoReturn(['res-btn-title']);

const mountPlayGuide = () => mountArcadeGuide({
  moveLabel: 'ねらう',
  buttons: [
    { indices: [0], label: '通常弾', keyLabel: 'Space / Enter' },
    { indices: [1, 2, 7], label: 'バクダン弾', keyLabel: 'X / Shift' },
  ],
  showHomeHint: true,
  backLabel: 'ポーズ',
});
const mountTitleGuide = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
mountTitleGuide();

type GameState = 'title' | 'playing' | 'results';

interface RestockSlot {
  slotId: number;
  timer: number;
}

class ArcadeCorkShooter {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  // Subsystems
  private stall!: FestivalStall;
  private gun!: CorkRifle;
  private corkSystem!: CorkSystem;
  private dynamicTargets!: DynamicTargetsManager;
  private input!: ArcadeInput;
  private hud!: ArcadeHUD;
  private prizes: PrizeEntity[] = [];
  private prizePileManager = new ResultsPrizePileManager();

  // Game state
  private state: GameState = 'title';
  /** ポーズ(Backspace / SELECT): 的当ての最中に止めて、やり直せる */
  private readonly pause = new ArcadePause({
    accent: '#ff4d4f',
    isPlaying: () => this.state === 'playing',
    onOpen: () => {
      this.tutorialHandle?.pause();
      this.countdownHandle?.pause();     // 3・2・1 の最中も開ける(数字はポーズの間、止まる)
    },
    onClose: () => {
      this.tutorialHandle?.resume();
      this.countdownHandle?.resume();
    },
    onRestart: () => {
      this.cancelPreGameTimers();
      this.state = 'results'; // startGame は、プレイ中だと何もしないので、先に外す
      this.prizePileManager.cleanup(this.scene);
      this.startGame();
    },
  });
  /** ゲーム開始前のアクティブチュートリアル中は true(時間は進まず、照準移動や射撃を試せる) */
  private inTutorial = false;
  private tutorialLastStep = -1;
  private tutorialAimDist = 0;
  private tutorialActionDone = false;
  private tutorialActionDelay = 0;
  private tutorialLastAimX = 0;
  private tutorialLastAimY = 0.05;
  private tutorialHandle: ArcadeTutorialHandle | null = null;
  /** 開始前の 3・2・1・GO! の間は true(時間が進まず、撃てない) */
  private offlineCountdown = false;
  private countdownHandle: ArcadeCountdownHandle | null = null;
  private score: number = 0;
  private highScore: number = 0;
  private timeLeft: number = ENNICHI_ROUND_SECONDS;
  readonly MAX_TIME_CAP = ENNICHI_ROUND_SECONDS + ENNICHI_EXTENSION_SECONDS;
  // 延長できる秒数の総量(1プレイ)。延長の種類を増やしても、この枠を使い切ったらそれ以上は延びない
  readonly EXTENSION_BUDGET = ENNICHI_EXTENSION_SECONDS;
  private extensionUsed: number = 0;
  private comboBonusTier: number = 0;

  // 通常弾は6発で再装填(連打だけで押し切れないようにする)
  readonly MAX_AMMO = 6;
  readonly RELOAD_TIME = 1.0;
  private ammo: number = 6;
  private reloadTimer: number = 0;
  private totalDefeatedCount: number = 0;
  // 分析用: 1プレイ内の最大コンボと発射数
  private maxComboSeen = 0;
  private shotsNormal = 0;
  private shotsExplosive = 0;
  // 金だるまを落とした回数。1回ごとにスコア倍率が +1.0 される(コンボ倍率の最大3倍とは別枠)
  private darumaDropCount: number = 0;
  private isNameEntryOpen = false;
  private resultFocus = 0; // 0: 再挑戦, 1: タイトルに戻る, 2: ゲームを終了
  private resultArmTime = 0;

  // Explosive Bomb Cooldown
  private bombCooldown: number = 0;
  readonly BOMB_RECHARGE_TIME = 1.3;

  // Combo system
  private comboCount: number = 0;
  private comboTimer: number = 0;
  private lastScoreMilestone: number = 0;

  // Automatic replenishment queue
  private restockQueue: RestockSlot[] = [];

  // Title & state timers
  private arcadeTitleScreen: ArcadeTitleScreen | null = null;
  private renderingReady: boolean = false;
  private stateTimer: number = 0;
  private titleOrbitAngle: number = 0;
  private lastTickInt: number = 30;
  private screenShake: number = 0;

  // 3D vectors
  private aimTargetWorld: THREE.Vector3 = new THREE.Vector3();
  /** 狙いの先を求める時の使い回し(毎フレーム new しない) */
  private readonly aimNdc = new THREE.Vector2();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.55);
  private readonly aimHit = new THREE.Vector3();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  constructor() {
    this.initThree();
    this.initGame();
    this.loadHighScores();
    this.setupEvents();
    void this.startRendering();
  }

  private initThree() {
    const container = document.getElementById('canvas-container')!;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070e);
    this.scene.fog = new THREE.FogExp2(0x05070e, 0.07);

    // 2. Camera: adjusted for 4.6m widened stall
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 50);
    this.camera.position.set(0, 1.48, 2.15);

    // 3. Renderer
    // 高解像度(Retina等)では描画解像度自体が高くギザギザが目立たないため、MSAA(antialias)は等倍の画面だけで使う。
    // 2倍解像度でのMSAAはGPU負荷が大きい割に見た目の差がほとんど無い
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffe2b8, 1.0);
    this.scene.add(ambientLight);
    this.prizePileManager.prepareLights(this.scene); // 結果画面の照明は、光の数が変わらないよう、ここで先に置いておく

    const mainDirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    mainDirLight.position.set(2.0, 4.0, 2.5);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 1024;
    mainDirLight.shadow.mapSize.height = 1024;
    mainDirLight.shadow.bias = -0.001;
    this.scene.add(mainDirLight);

    // Focused Spotlights for wide Hinadan
    const darumaSpot = new THREE.SpotLight(0xffd700, 3.8, 7.0, 0.55, 0.5, 1.0);
    darumaSpot.position.set(0, 2.8, 0.8);
    darumaSpot.target.position.set(0, 1.65, -0.95);
    this.scene.add(darumaSpot);
    this.scene.add(darumaSpot.target);

    const leftSpot = new THREE.SpotLight(0xffeedd, 2.5, 6.5, 0.7, 0.6, 1.0);
    leftSpot.position.set(-1.4, 2.7, 1.0);
    leftSpot.target.position.set(-1.2, 1.15, -0.45);
    this.scene.add(leftSpot);
    this.scene.add(leftSpot.target);

    const rightSpot = new THREE.SpotLight(0xffeedd, 2.5, 6.5, 0.7, 0.6, 1.0);
    rightSpot.position.set(1.4, 2.7, 1.0);
    rightSpot.target.position.set(1.2, 1.15, -0.45);
    this.scene.add(rightSpot);
    this.scene.add(rightSpot.target);
  }

  private initGame() {
    this.input = new ArcadeInput();
    this.hud = new ArcadeHUD();

    this.stall = new FestivalStall();
    this.scene.add(this.stall.group);

    this.gun = new CorkRifle();
    this.scene.add(this.gun.group);

    this.corkSystem = new CorkSystem(this.scene);

    // Shelf prizes
    this.prizes = createAllPrizes(this.stall.shelves);
    this.prizes.forEach((p) => this.scene.add(p.mesh));

    // Dynamic moving ducks, flying balloons, and golden UFO
    this.dynamicTargets = new DynamicTargetsManager();
    this.scene.add(this.dynamicTargets.group);
    this.keepEffectPrograms();

    this.enterTitle();

    // ベンチマーク(?bench=1): タイトル / 30秒の1プレイ(ランダムに狙って撃つ)
    declareBenchTargets([
      { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
      { id: 'play', label: 'プレイ(ランダム入力)', kind: 'play', params: { scene: 'play' }, input: 'random', seconds: 45 },
    ]);
    // タイトルの benchReady は、シェーダを作り終えて描き始め、画面が落ち着いたあと(startRendering)
    if (benchParam('scene') === 'play') this.startGame();
  }

  /**
   * シェーダを並列に作り終えてから描き始める(packages/shared/shaderCompile.ts)。
   * 計測(Windows, Chrome, ANGLE D3D11): 最初の描画で 13 個のシェーダをその場で作り、リンクの完了待ちでメインスレッドが
   * 約 1 秒止まっていた(並列にすると約 0.14 秒)。
   * ベンチの「タイトルに着いた」は、ページの立ち上がりの一度きりの作業(Chrome がページを初めて描くためのシェーダ作り、
   * 読み込みから約 1 秒後の前の画面の片付け)が済み、画面が落ち着いてから知らせる(waitFramesSettled)。
   */
  private async startRendering(): Promise<void> {
    await compileInParallel(this.renderer, this.scene, this.camera, null, () => this.prizePileManager.duringCompile());
    this.renderingReady = true;
    this.animate(0);
    if (this.state === 'title') {
      this.arcadeTitleScreen?.show();
    }
    if (benchParam('scene') === 'title') {
      await waitFramesSettled();
      benchReady('title');
    }
  }

  /**
   * 撃つたびに出す粒の材質(銃口の煙・爆発の衝撃波と火花・的を倒した紙吹雪)のシェーダを、いつも作ってある状態にしておく。
   * 粒の材質は消えるたびに破棄するので、粒がひとつも無い間にシェーダまで破棄され、次に撃った瞬間に作り直しになって画面が止まる。
   * そこで、同じ設定の見本を、色も奥行きも書かない(画面に何も出ない)状態で毎フレーム描いておく。
   */
  private keepEffectPrograms() {
    const geom = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const samples = [
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.7 }), // CorkRifle.fire の煙
      new THREE.MeshBasicMaterial({ transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), // CorkSystem.triggerExplosion の衝撃波
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending }), // CorkSystem.triggerExplosion の火花
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), // DynamicTargetsManager.spawnConfetti
    ];
    for (const mat of samples) {
      mat.colorWrite = false;
      mat.depthWrite = false;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
    }
  }

  private setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    const handleScreenTouchOrClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (this.state === 'results') {
        if (this.isNameEntryOpen || performance.now() < this.resultArmTime) return;
        if (target?.closest('#res-btn-retry')) {
          this.prizePileManager.cleanup(this.scene);
          this.startGame();
          return;
        }
        if (target?.closest('#res-btn-title')) {
          this.enterTitle();
          return;
        }
        if (target?.closest('#res-btn-exit')) {
          returnToHub();
          return;
        }
      }

      if (this.state === 'title') {
        if (this.stateTimer > 0.35) {
          void this.onStartPressed();
        }
        return;
      }
    };

    window.addEventListener('click', handleScreenTouchOrClick);

    // Handle returning from another screen/tab/window cleanly
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.prevTimestamp = performance.now();
        this.input.lastInputTime = performance.now();
        this.input.resetAll();
        sounds.resumeAll();
      } else {
        sounds.pauseAll();
      }
    });

    window.addEventListener('focus', () => {
      this.prevTimestamp = performance.now();
      this.input.lastInputTime = performance.now();
      this.input.resetAll();
      sounds.resumeAll();
    });

    window.addEventListener('blur', () => {
      this.input.resetAll();
      sounds.pauseAll();
    });
  }

  private updateResultFocus(): void {
    const items: ResultMenuItem[] = [
      { button: document.getElementById('res-btn-retry'), color: '#ff4d4f' },
      { button: document.getElementById('res-btn-title'), color: '#39ff88' },
      { button: document.getElementById('res-btn-exit'), color: '#00f0ff' },
    ];
    setupResultMenu(document.querySelector('.results-action-block'), items);
    applyResultMenuFocus(items, this.resultFocus);

    items.forEach(({ button }, idx) => {
      if (!button) return;
      button.onmouseenter = () => {
        if (this.resultFocus === idx) return;
        this.resultFocus = idx;
        this.updateResultFocus();
      };
      button.onfocus = () => button.blur();
    });
  }

  // --- STATE TRANSITIONS ---

  private cancelPreGameTimers() {
    this.tutorialHandle?.cancel();
    this.tutorialHandle = null;
    this.inTutorial = false;
    this.countdownHandle?.cancel();
    this.countdownHandle = null;
    this.offlineCountdown = false;
  }

  private resetMatchState(shufflePrizes: boolean) {
    this.prizePileManager.cleanup(this.scene);
    this.prizePileManager.reset();
    this.score = 0;
    this.timeLeft = ENNICHI_ROUND_SECONDS;
    this.totalDefeatedCount = 0;
    this.maxComboSeen = 0;
    this.shotsNormal = 0;
    this.shotsExplosive = 0;
    this.darumaDropCount = 0;
    this.bombCooldown = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastScoreMilestone = 0;
    this.lastTickInt = ENNICHI_ROUND_SECONDS;
    this.screenShake = 0;
    this.restockQueue = [];
    this.gun.reset();
    this.corkSystem.reset();
    if (shufflePrizes) shuffleShelfLayout(this.prizes);
    this.resetAllPrizes();
    this.dynamicTargets.reset();
    this.ammo = this.MAX_AMMO;
    this.reloadTimer = 0;
    this.extensionUsed = 0;
    this.comboBonusTier = 0;
    this.input.setAim(0, 0.05);
    this.hud.updateAmmo(this.ammo, this.MAX_AMMO, false);
    this.hud.updateInGame(this.score, this.timeLeft, 1.0, 0);
  }

  private enterTitle() {
    this.cancelPreGameTimers();
    sounds.stopBgm();
    this.prizePileManager.cleanup(this.scene);
    this.state = 'title';
    this.stateTimer = 0;
    this.titleOrbitAngle = 0;
    this.stall.titleRifleGroup.visible = true;
    this.gun.group.visible = false;
    this.corkSystem.reset();
    this.resetAllPrizes();
    this.dynamicTargets.reset();

    this.hud.setMode('title');
    this.hud.updateCrosshair(0, 0, false);
    mountTitleGuide();

    if (!this.arcadeTitleScreen) {
      this.arcadeTitleScreen = new ArcadeTitleScreen({
        slug: 'ennichi-shateki',
        accentColor: '#ff4d4f',
        tagline: '撃ちまくって景品を総ざらい！',
        startButtonLabel: 'スタート',
        promptLabel: 'PRESS START / ボタンでスタート',
        onStart: () => {
          this.onStartPressed();
        },
      });
    }
    if (this.renderingReady) {
      this.arcadeTitleScreen.show();
    }
  }

  private onStartPressed() {
    if (this.state !== 'title') return;
    this.arcadeTitleScreen?.hide();
    this.startGame();
  }

  private startGame() {
    if (this.state === 'playing') return;
    reportRoundStart();

    this.cancelPreGameTimers();
    this.arcadeTitleScreen?.hide();
    sounds.init();
    sounds.playTaiko();
    sounds.startBgm();

    this.state = 'playing';
    this.stateTimer = 0;
    mountPlayGuide();
    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = true;
    this.camera.position.set(0, 1.48, 2.15);
    this.camera.lookAt(0, 1.25, -0.6);
    this.hud.setMode('playing');
    this.resetMatchState(true);

    // 開始ボタンを押した直後にまずアクティブチュートリアルを実施し、その後に 3・2・1・GO! を挟む
    this.beginTutorial();
  }

  private beginTutorial() {
    this.hud.setGameplayHUDVisible(false);
    this.inTutorial = true;
    this.tutorialLastStep = -1;
    this.tutorialAimDist = 0;
    this.tutorialActionDone = false;
    this.tutorialActionDelay = 0;
    this.tutorialLastAimX = this.input.aimX;
    this.tutorialLastAimY = this.input.aimY;
    this.tutorialHandle?.cancel();

    const handle = startArcadeTutorial({
      accentColor: '#ff4d4f',
      steps: [
        { indices: [15], keyLabel: 'D', label: '右にねらう' },
        { indices: [14], keyLabel: 'A', label: '左にねらう' },
        { indices: [12], keyLabel: 'W', label: '上にねらう' },
        { indices: [13], keyLabel: 'S', label: '下にねらう' },
        { indices: [0], keyLabel: 'Space', label: '通常弾で景品を落とす' },
        { indices: [1, 2], keyLabel: 'X', label: 'バクダン弾で吹き飛ばす' },
      ],
      onComplete: () => {
        this.inTutorial = false;
        this.tutorialHandle = null;
        // チュートリアル中に撃った弾や倒した景品・スコアを初期状態に戻して本番カウントダウンへ
        this.resetMatchState(false);
        this.hud.setGameplayHUDVisible(true);
        this.beginCountdown();
      },
    });
    if (this.inTutorial) {
      this.tutorialHandle = handle;
    }
  }

  private beginCountdown() {
    this.offlineCountdown = true;
    this.countdownHandle?.cancel();
    this.countdownHandle = startArcadeCountdown({
      accentColor: '#ffd54a',
      onGo: () => {
        this.offlineCountdown = false;
        if (benchParam('scene') === 'play') benchReady('play-start');
      },
    });
  }

  // --- HIGH SCORE (共通ランキング=サーバーの1位。「新記録」の判定に使う) ---
  private loadHighScores() {
    void loadRawScores(SLUG).then((list) => {
      if (list.length > 0) this.highScore = Math.max(this.highScore, list[0].score);
    });
  }

  private enterResults() {
    this.cancelPreGameTimers();
    // ベンチ: 倒した景品が台に降って積もる演出(物理)まで測る。全部落ちきって静まるまで、およそ8秒。
    // その間はランダム入力の Enter で結果画面を進めないよう、操作の受け付けも遅らせる
    const benchPile = benchParam('scene') === 'play';
    if (benchPile) {
      benchMark('results');
      window.setTimeout(() => benchDone('results-pile'), 8000);
    }
    sounds.stopBgm();
    this.state = 'results';
    this.stateTimer = 0;

    const isNewRecord = this.score > this.highScore;
    if (isNewRecord) this.highScore = this.score;

    this.resultFocus = 0; // 再挑戦がデフォルト
    this.resultArmTime = performance.now() + (benchPile ? 8500 : 600);
    mountArcadeGuide({
      moveLabel: '選択',
      buttons: [
        { indices: [0], label: '決定' },
        { indices: [1], label: '終了', keyLabel: 'X / Shift' },
      ],
      showHomeHint: true,
      backLabel: 'タイトルへ',
    });

    const finalScore = this.score;
    reportDeepAnalytics('progression_update', {
      result: 'clear',
      deathReason: 'タイムアップ',
      score: finalScore,
      maxCombo: this.maxComboSeen,
      enemiesDefeated: this.totalDefeatedCount,
      extraStats: { shotsNormal: this.shotsNormal, shotsExplosive: this.shotsExplosive, score: finalScore, newRecord: isNewRecord },
    });
    runHighScoreEntryFlow({
      slug: SLUG,
      score: finalScore,
      modal: { title: '番付 記名', scoreDisplay: `${finalScore.toLocaleString()} g`, themeClass: 'theme-ennichi', delayMs: NAME_ENTRY_AFTER_RESULT_MS },
      setBlocked: (blocked) => { this.isNameEntryOpen = blocked; },
      onName: (name) => saveLeaderboardScore(SLUG, finalScore, name),
      onClosed: () => { this.resultArmTime = performance.now() + 800; },
    });

    if (isNewRecord) {
      sounds.playGrandPrizeFanfare();
    } else {
      sounds.playTaiko();
    }

    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = false;

    // Trigger 3D digital scale presentation on counter
    this.prizePileManager.startPile(this.scene, this.prizes, this.dynamicTargets);

    const breakdown = this.prizePileManager.getDefeatedBreakdown();
    this.hud.renderResults(this.score, this.totalDefeatedCount, isNewRecord, breakdown);
    this.updateResultFocus();
    this.hud.setMode('results');
    this.hud.updateCrosshair(0, 0, false);
  }

  private resetAllPrizes() {
    this.prizes.forEach((p) => p.reset());
    this.restockQueue = [];
  }

  // --- SHOOTING LOGIC ---

  private tryShootNormal(): boolean {
    // 弾切れ(再装填中)は撃てない
    if (this.ammo <= 0) return false;
    this.ammo--;
    if (this.ammo === 0) this.reloadTimer = this.RELOAD_TIME;
    this.hud.updateAmmo(this.ammo, this.MAX_AMMO, this.ammo === 0);

    sounds.playShoot(false);
    this.screenShake = 0.2;

    const fireData = this.gun.fire(this.scene, false);
    const shootDir = this.aimTargetWorld.clone().sub(fireData.origin).normalize();
    this.corkSystem.spawn(fireData.origin, shootDir, 'normal');
    this.shotsNormal++;

    const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
    this.hud.updateInGame(this.score, this.timeLeft, bombRatio, this.comboCount, this.scoreMultiplier());
    return true;
  }

  private tryShootExplosive(): boolean {
    if (this.bombCooldown > 0) return false;

    this.bombCooldown = this.BOMB_RECHARGE_TIME;
    sounds.playShoot(true);
    this.screenShake = 0.45;

    const fireData = this.gun.fire(this.scene, true);
    const shootDir = this.aimTargetWorld.clone().sub(fireData.origin).normalize();
    this.corkSystem.spawn(fireData.origin, shootDir, 'explosive');
    this.shotsExplosive++;

    this.hud.updateInGame(this.score, this.timeLeft, 0.0, this.comboCount, this.scoreMultiplier());
    return true;
  }

  // --- ANIMATION LOOP ---

  private prevTimestamp: number = 0;

  private animate = (timestamp: number) => {
    requestAnimationFrame(this.animate);

    const rawDt = this.prevTimestamp === 0 ? 0.016 : (timestamp - this.prevTimestamp) / 1000;
    // Guard against time warp / accumulated delta spikes when returning from another screen
    const dt = rawDt > 0.35 ? 0.016 : Math.min(0.05, Math.max(0.001, rawDt));
    this.prevTimestamp = timestamp;
    const elapsed = timestamp / 1000;

    const inputState = this.input.update(dt);
    // ポーズ中は進めない(描画だけ続ける)
    if (this.pause.isOpen) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.stall.update(dt, elapsed);
    this.dynamicTargets.update(dt, elapsed);

    if (this.bombCooldown > 0) {
      this.bombCooldown = Math.max(0, this.bombCooldown - dt);
    }

    if (this.comboCount > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboBonusTier = 0;
      }
    }

    // 再装填
    if (this.ammo <= 0 && this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.MAX_AMMO;
        this.reloadTimer = 0;
        this.hud.updateAmmo(this.ammo, this.MAX_AMMO, false);
      }
    }

    const baseCamX = 0;
    const baseCamY = 1.48;
    const baseCamZ = 2.15;

    switch (this.state) {
      case 'title':
        this.updateTitle(dt, elapsed, inputState);
        break;
      case 'playing':
        this.updatePlaying(dt, elapsed, inputState);
        break;
      case 'results':
        this.updateResults(dt, inputState);
        break;
    }

    if (this.state === 'playing') {
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 2.8);
        const shakeMag = this.screenShake * 0.055;
        this.camera.position.x = baseCamX + (Math.random() - 0.5) * shakeMag;
        this.camera.position.y = baseCamY + (Math.random() - 0.5) * shakeMag;
        this.camera.position.z = baseCamZ + (Math.random() - 0.5) * shakeMag;
      } else {
        this.camera.position.set(baseCamX, baseCamY, baseCamZ);
      }
    }

    this.updatePrizes(dt);
    this.updateAutomaticRestock(dt);

    // Step projectiles with shelf prizes and dynamic moving/flying targets
    this.corkSystem.update(
      dt,
      this.prizes,
      this.dynamicTargets,
      (targetName, directPoints, _hitPoint, isExplosive) => {
        if (directPoints > 0) {
          // Dynamic target hit (Balloon / Duck / UFO)
          this.totalDefeatedCount++;
          this.comboCount++;
          this.maxComboSeen = Math.max(this.maxComboSeen, this.comboCount);
          this.comboTimer = 2.4;
          sounds.playCombo(this.comboCount);

          const multiplier = this.scoreMultiplier();
          const pts = Math.round(directPoints * multiplier);
          this.score += pts;

          if (targetName === '黄金UFO') {
            this.screenShake = 0.9;
            this.prizePileManager.recordDefeated('ufo', '黄金UFO');
            this.addTimeBonus(1.5);
          } else if (targetName === 'お祭り風船') {
            this.screenShake = 0.4;
            this.prizePileManager.recordDefeated('balloon', 'お祭り風船');
          } else if (targetName === '射的アヒル') {
            this.screenShake = 0.35;
            this.prizePileManager.recordDefeated('duck', '射的アヒル');
          }

          this.checkComboBonus();
          this.checkScoreMilestones();
        } else if (isExplosive) {
          this.screenShake = 0.85;
        } else {
          this.screenShake = 0.25;
        }
      }
    );

    this.renderer.render(this.scene, this.camera);
  };

  // Score-based time recovery (+0.5 seconds per 2500 points milestone)
  private checkScoreMilestones() {
    const MILESTONE_STEP = 2500;
    while (this.score >= this.lastScoreMilestone + MILESTONE_STEP) {
      this.lastScoreMilestone += MILESTONE_STEP;
      this.addTimeBonus(0.5);
    }
  }

  /**
   * 時間の延長。1プレイで延長できる総量は EXTENSION_BUDGET(15秒)まで。
   * 延長の種類(金の大ダルマ・得点・連鎖・黄金UFO)がいくつあっても、枠を使い切ればそれ以上は延びないので、無限には続かない。
   */
  private addTimeBonus(rawBonus: number) {
    const remaining = this.EXTENSION_BUDGET - this.extensionUsed;
    if (remaining <= 0.05) {
      return;
    }
    const bonus = Math.min(Math.max(0.1, rawBonus), remaining);
    this.extensionUsed += bonus;
    this.timeLeft = Math.min(this.MAX_TIME_CAP, this.timeLeft + bonus);
    sounds.playTimeExtend();
  }

  /** 連鎖(コンボ)が5・10に達したときの延長。1つの連鎖につき各段階1回だけ */
  private checkComboBonus() {
    const tiers = [
      { at: 5, bonus: 0.5 },
      { at: 10, bonus: 1.0 },
    ];
    for (let i = 0; i < tiers.length; i++) {
      if (this.comboCount >= tiers[i].at && this.comboBonusTier < i + 1) {
        this.comboBonusTier = i + 1;
        this.addTimeBonus(tiers[i].bonus);
      }
    }
  }

  // --- AUTOMATIC REPLENISHMENT ---

  private updateAutomaticRestock(dt: number) {
    for (let i = this.restockQueue.length - 1; i >= 0; i--) {
      const item = this.restockQueue[i];
      item.timer -= dt;

      if (item.timer <= 0) {
        const prize = this.prizes.find((p) => p.config.slotId === item.slotId);
        if (prize) {
          // 棚の演出(triggerSpawnEffect)だけで入荷が分かるので、下部中央のフラッシュ通知は出さない(コンボ表示との重複回避)
          prize.triggerSpawnEffect();
        }
        this.restockQueue.splice(i, 1);
      }
    }
  }

  // --- STATE UPDATES ---

  private updateTitle(dt: number, _elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;
    this.titleOrbitAngle += dt * 0.30;

    const camX = Math.sin(this.titleOrbitAngle) * 1.1;
    const camY = 1.48 + Math.cos(this.titleOrbitAngle * 0.6) * 0.14;
    const camZ = 2.35 + Math.cos(this.titleOrbitAngle) * 0.25;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(0, 1.25, -0.4);

    if (this.stateTimer > 0.35 && (inputState.startJustPressed || inputState.shootNormalJustPressed)) {
      this.onStartPressed();
      return;
    }
  }

  // Active Gameplay Loop
  private updatePlaying(dt: number, elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    if (this.inTutorial) {
      this.updateTutorial(dt, elapsed, inputState);
      return;
    }

    // 1. Time countdown
    if (!this.offlineCountdown) {
      this.timeLeft -= dt;
      if (this.timeLeft < 0) this.timeLeft = 0;
    }

    const curSec = Math.floor(this.timeLeft);
    if (curSec <= 5 && curSec < this.lastTickInt && curSec > 0) {
      sounds.playTick();
      this.lastTickInt = curSec;
    }

    // 2. Crosshair & 3D Aim Target
    this.updateAimPlane();

    let isHovering = false;
    for (const p of this.prizes) {
      if (!p.isDefeated && this.raycaster.ray.intersectsBox(p.getBoundingBox())) {
        isHovering = true;
        break;
      }
    }
    if (!isHovering) {
      for (const b of this.dynamicTargets.balloons) {
        if (!b.isPopped && this.raycaster.ray.intersectsBox(b.getBoundingBox())) {
          isHovering = true;
          break;
        }
      }
    }
    if (!isHovering) {
      for (const d of this.dynamicTargets.ducks) {
        if (!d.isDown && this.raycaster.ray.intersectsBox(d.getBoundingBox())) {
          isHovering = true;
          break;
        }
      }
    }
    if (!isHovering && !this.dynamicTargets.ufo.isHit) {
      if (this.raycaster.ray.intersectsBox(this.dynamicTargets.ufo.getBoundingBox())) {
        isHovering = true;
      }
    }

    this.hud.updateCrosshair(this.input.aimX, this.input.aimY, true, isHovering);

    // 3. Update Gun aiming
    this.gun.update(dt, elapsed, this.camera, this.aimTargetWorld, true);

    // 4. Shooting Inputs (カウントダウン中は撃てない)
    if (!this.offlineCountdown) {
      if (inputState.shootExplosiveJustPressed) {
        this.tryShootExplosive();
      } else if (inputState.shootNormalJustPressed) {
        this.tryShootNormal();
      }
    }

    // 5. Update HUD
    const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
    this.hud.updateInGame(this.score, this.timeLeft, bombRatio, this.comboCount, this.scoreMultiplier());

    // 6. Game Over check
    if (this.timeLeft <= 0) {
      sounds.playTimeUp();
      this.enterResults();
      return;
    }
  }

  private updateTutorial(dt: number, elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    const started = this.tutorialHandle?.isStarted() ?? false;
    const stepIdx = this.tutorialHandle?.currentStepIndex() ?? -1;
    const stepReady = this.tutorialHandle?.isStepReady() ?? false;

    if (!started) {
      this.input.setAim(0, 0.05);
      this.tutorialLastAimX = 0;
      this.tutorialLastAimY = 0.05;
    }

    if (stepIdx !== this.tutorialLastStep) {
      this.tutorialLastStep = stepIdx;
      this.tutorialAimDist = 0;
      this.tutorialActionDone = false;
      this.tutorialActionDelay = 0;
      if (stepIdx === 0 && this.input.aimX > 0.45) {
        this.input.setAim(0, this.input.aimY);
      } else if (stepIdx === 1 && this.input.aimX < -0.45) {
        this.input.setAim(0, this.input.aimY);
      } else if (stepIdx === 2 && this.input.aimY > 0.45) {
        this.input.setAim(this.input.aimX, 0.05);
      } else if (stepIdx === 3 && this.input.aimY < -0.45) {
        this.input.setAim(this.input.aimX, 0.05);
      } else if (stepIdx === 4 || stepIdx === 5) {
        this.shotsNormal = 0;
        this.shotsExplosive = 0;
        this.totalDefeatedCount = 0;
      }
      this.tutorialLastAimX = this.input.aimX;
      this.tutorialLastAimY = this.input.aimY;
    } else if (!stepReady) {
      this.tutorialAimDist = 0;
    }

    const dx = this.input.aimX - this.tutorialLastAimX;
    const dy = this.input.aimY - this.tutorialLastAimY;
    this.tutorialLastAimX = this.input.aimX;
    this.tutorialLastAimY = this.input.aimY;

    this.updateAimPlane();
    this.hud.updateCrosshair(this.input.aimX, this.input.aimY, true, false);
    this.gun.update(dt, elapsed, this.camera, this.aimTargetWorld, true);

    // チュートリアル中は弾切れ・クールダウンなしですぐ撃てるようにする
    this.ammo = this.MAX_AMMO;
    this.reloadTimer = 0;

    if (started && stepReady && stepIdx === 4) {
      if (inputState.shootNormalJustPressed) {
        const targetPrize = this.prizes.find((p) => !p.isDefeated && !p.isFalling && p.config.shelfIndex <= 1) || this.prizes.find((p) => !p.isDefeated && !p.isFalling);
        if (targetPrize) {
          this.aimTargetWorld.copy(targetPrize.currentPos);
          this.aimTargetWorld.y += targetPrize.config.height * 0.55;
        }
        this.tryShootNormal();
        if (targetPrize) {
          targetPrize.pitchVelocity += 9.5;
        }
      }
    } else if (started && stepReady && stepIdx === 5) {
      if (inputState.shootExplosiveJustPressed) {
        this.bombCooldown = 0;
        const targetPrize = this.prizes.find((p) => !p.isDefeated && !p.isFalling);
        if (targetPrize) {
          this.aimTargetWorld.copy(targetPrize.currentPos);
          this.aimTargetWorld.y += targetPrize.config.height * 0.45;
        }
        this.tryShootExplosive();
      }
    }

    if (!stepReady) return;

    if (stepIdx === 0) {
      if (dx > 0.001) {
        this.tutorialAimDist += dx;
        if (this.tutorialAimDist >= 0.22 || this.input.aimX >= 0.9) {
          this.tutorialAimDist = 0;
          this.tutorialHandle?.advance(0);
        }
      }
    } else if (stepIdx === 1) {
      if (dx < -0.001) {
        this.tutorialAimDist += Math.abs(dx);
        if (this.tutorialAimDist >= 0.22 || this.input.aimX <= -0.9) {
          this.tutorialAimDist = 0;
          this.tutorialHandle?.advance(1);
        }
      }
    } else if (stepIdx === 2) {
      if (dy > 0.001) {
        this.tutorialAimDist += dy;
        if (this.tutorialAimDist >= 0.18 || this.input.aimY >= 0.9) {
          this.tutorialAimDist = 0;
          this.tutorialHandle?.advance(2);
        }
      }
    } else if (stepIdx === 3) {
      if (dy < -0.001) {
        this.tutorialAimDist += Math.abs(dy);
        if (this.tutorialAimDist >= 0.18 || this.input.aimY <= -0.9) {
          this.tutorialAimDist = 0;
          this.tutorialHandle?.advance(3);
        }
      }
    } else if (stepIdx === 4) {
      if (this.shotsNormal > 0 && (this.totalDefeatedCount > 0 || this.prizes.some((p) => p.isFalling || p.isDefeated))) {
        this.tutorialActionDone = true;
      }
      if (this.tutorialActionDone) {
        this.tutorialActionDelay += dt;
        if (this.tutorialActionDelay >= 0.45) {
          this.tutorialHandle?.advance(4);
        }
      }
    } else if (stepIdx === 5) {
      if (this.shotsExplosive > 0 && (this.corkSystem.explosions.length > 0 || this.screenShake > 0.35)) {
        this.tutorialActionDone = true;
      }
      if (this.tutorialActionDone) {
        this.tutorialActionDelay += dt;
        if (this.tutorialActionDelay >= 0.50) {
          this.tutorialHandle?.advance(5);
        }
      }
    }
  }

  private updateResults(dt: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;

    // 1. Update 3D physics prize drop simulation and off-screen despawning
    this.prizePileManager.update(dt, this.camera);

    // 2. Smooth cinematic camera glide framing the tabletop desk (机の下を見切れさせる)
    const isWide = window.innerWidth >= 860;
    let targetCamX = isWide ? -0.18 : 0.05;
    let targetCamY = 1.20;
    let targetCamZ = isWide ? 1.95 : 2.25;
    let lookX = 0.38, lookY = 1.10, lookZ = 1.35;
    this.camera.position.x += (targetCamX - this.camera.position.x) * 3.5 * dt;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 3.5 * dt;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 3.5 * dt;
    this.camera.lookAt(lookX, lookY, lookZ);

    if (!this.isNameEntryOpen) {
      // 移動は受付待ちの間も効かせる(確定だけ誤爆防止で待たせる)
      for (const dir of inputState.menuNav) {
        this.resultFocus = (this.resultFocus + dir + 3) % 3;
        this.updateResultFocus();
        sounds.playTaiko();
      }
    }

    if (!this.isNameEntryOpen && performance.now() >= this.resultArmTime) {
      if (inputState.startJustPressed || inputState.shootNormalJustPressed) {
        if (this.resultFocus === 0) {
          this.prizePileManager.cleanup(this.scene);
          this.startGame();
        } else if (this.resultFocus === 1) {
          this.enterTitle();
        } else {
          returnToHub();
        }
      } else if (inputState.cancelJustPressed) {
        this.enterTitle();
      } else if (inputState.shootExplosiveJustPressed) {
        returnToHub();
      }
    }
  }

  private updateAimPlane() {
    this.raycaster.setFromCamera(this.aimNdc.set(this.input.aimX, this.input.aimY), this.camera);
    if (this.raycaster.ray.intersectPlane(this.aimPlane, this.aimHit)) {
      this.aimTargetWorld.copy(this.aimHit);
    } else {
      this.aimTargetWorld.copy(this.camera.position).addScaledVector(this.raycaster.ray.direction, 3.0);
    }
  }

  private scoreMultiplier(): number {
    return 1.0 + Math.min(2.0, (this.comboCount - 1) * 0.2) + this.darumaDropCount;
  }

  // Step Prize physics simulation and handle toppling/scoring/restocking
  private updatePrizes(dt: number) {
    for (const prize of this.prizes) {
      const newlyDefeated = prize.update(dt);
      if (newlyDefeated) {
        this.totalDefeatedCount++;
        this.comboCount++;
        this.maxComboSeen = Math.max(this.maxComboSeen, this.comboCount);
        this.comboTimer = 2.4;
        sounds.playCombo(this.comboCount);
        this.prizePileManager.recordDefeated(prize.config.type, prize.config.name);

        const multiplier = this.scoreMultiplier();
        const addedPoints = Math.round(prize.config.points * multiplier);
        this.score += addedPoints;
        this.screenShake = 0.65;

        // Capped time bonus: ONLY Golden Daruma recovers time (+1.5 seconds)
        // All other prizes (treasure, lucky cat, tv, etc.) do not restore time.
        // 通常の撃破はスコア加算と3Dの命中演出だけで十分伝わるため、下部中央へのフラッシュ通知は出さない
        if (prize.config.type === 'daruma') {
          this.darumaDropCount++;
          this.addTimeBonus(1.5);
        }

        // 連鎖(5・10)と得点による時間延長(延長枠の範囲内)
        this.checkComboBonus();
        this.checkScoreMilestones();

        // Automatic restocking queue:
        // Top shelf (Tier 2) has slowed replenishment speed (6.5s) to preserve luxury rarity!
        let restockDelay = 1.8;
        if (prize.config.shelfIndex === 2) {
          restockDelay = 6.5; // Slow down top shelf restocking significantly
        } else if (prize.config.shelfIndex === 1) {
          restockDelay = 3.0; // Medium shelf restocking
        }

        this.restockQueue.push({
          slotId: prize.config.slotId,
          timer: restockDelay,
        });

        const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
        this.hud.updateInGame(this.score, this.timeLeft, bombRatio, this.comboCount, this.scoreMultiplier());
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ArcadeCorkShooter();
});
