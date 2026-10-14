import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu';
import * as THREE from 'three';
import { InputManager, InputState } from './engine/input';
import { SoundManager } from './engine/audio';
import { Player, BoundingBox2D } from './entities/player';
import { Stage, STAGE_CONFIGS, FINAL_STAGE, DEFAULT_BACKGROUND, DEFAULT_FOG_DENSITY } from './world/stage';
import { INITIAL_LIVES, stageClearBonus } from './world/rewards';
import { CollisionDebugOverlay, DebugShape } from './engine/collision';
import { HudManager } from './ui/hud';
import { CassetteTape, StageBlock } from './entities/objects';
import { SurveillanceDrone } from './entities/enemies';
import { installHomeReturn, returnToHub } from '../../../shared/homeReturn';
import { ArcadePause } from '../../../shared/arcadePause';
import { mountArcadeGuide, buttonIconHtml } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { startArcadeCountdown, type ArcadeCountdownHandle } from '../../../shared/arcadeCountdown';
import { reportDeepAnalytics } from '../../../shared/arcadeAnalytics';

// 戻る操作は Backspace(アケコンは SELECT)に統一。Escape は無効
installHomeReturn();
watchResultAutoReturn(['btn-result-title']);

const mountPlayGuide = () => mountArcadeGuide({
  moveLabel: '移動',
  buttons: [
    { indices: [0], label: 'ジャンプ', keyLabel: 'Space' },
    { indices: [1, 2], label: 'スピン攻撃', keyLabel: 'X / K' },
  ],
  showHomeHint: true,
  backLabel: 'ポーズ',
});
const mountTitleGuide = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
mountTitleGuide();

/** ミス後に再開するときの最低残り時間(秒)。時間切れで再開直後にまたミスするのを防ぐ */
const RESPAWN_MIN_TIME = 30;
/** ステージの開始地点。チェックポイントを通過していないときの再開地点にもなる */
const STAGE_SPAWN = { x: 1.5, y: 0.5 } as const;
/** スピンがドローンに届く、本体の上下の余裕(m)。どの角度からでも落とせるようにする */
const DRONE_SPIN_REACH = 0.6;

/** タイトルのダンサーを足場の手前の縁(奥行き±1.4)近くに立たせ、縁のラインが足元の床に見えるようにする */
const TITLE_DANCER_Z = 1.1;

type GameState = 'title' | 'attract_demo' | 'attract_ranking' | 'playing' | 'game_over' | 'clear';

class StreetBBoyGame {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private input: InputManager;
  private sound: SoundManager;
  private hud: HudManager;
  private arcadeTitleScreen!: ArcadeTitleScreen;

  private stage: Stage | null = null;
  private player: Player | null = null;

  // Title Scene specific entities
  private titleGroup: THREE.Group | null = null;
  private titleDancer: Player | null = null;

  private state: GameState = 'title';
  private stateTimer: number = 0;
  /** ポーズ(Backspace / SELECT): プレイ中に止めて、やり直せる */
  private readonly pause = new ArcadePause({
    accent: '#ffe600',
    isPlaying: () => this.state === 'playing' && !!this.player && !this.player.isDead,
    onOpen: () => this.countdownHandle?.pause(),     // 3・2・1 の最中も開ける(数字はポーズの間、止まる)
    onClose: () => this.countdownHandle?.resume(),
    onRestart: () => this.retryFromResult(),
  });

  // Gameplay metrics
  private currentStage: number = 1;
  private hordeAlerted: boolean = false;
  private score: number = 0;
  private timeLeft: number = 99;
  /** ステージ開始前の 3・2・1・GO! の間は true(時間が進まず、操作できない) */
  private countingDown = false;
  private countdownHandle: ArcadeCountdownHandle | null = null;
  private lives: number = INITIAL_LIVES;
  // 分析用: 1プレイ内の統計
  private lastDeathCause = '';
  private deathsByCause: Record<string, number> = {};
  private cassettesTaken = 0;
  private goldTaken = 0;
  private maxComboSeen = 0;
  private stompKills = 0;

  // Result Menu Navigation (0: 再挑戦, 1: タイトルに戻る, 2: ゲームを終了)
  private resultMenuFocus: number = 0;
  private resultArmTime: number = 0;

  // Camera Shake & Combo System
  private cameraShakeTimer: number = 0;
  private cameraShakeIntensity: number = 0;
  private comboHits: number = 0;
  private comboTimer: number = 0;
  private lastGrindSoundTime: number = 0;

  // 縦穴を落ちて1面の舞台へ戻る演出の進み具合(0=天国〜1=1面の夜の街)
  private returnBlend: number = 0;
  // 1面の街が現れてから、操作が効かず、自動でゴールまで走っている間
  private homecoming: boolean = false;
  // ゴールの爆発の続き(秒)。ゴール後しばらく、花火と火花を連続して上げる
  private goalBlastTimer: number = 0;
  private goalBlastTick: number = 0;
  private goalFlashEl: HTMLDivElement | null = null;

  // 最後に通過したチェックポイント(ミスした時の再開地点)
  private checkpoint: { x: number; y: number } | null = null;
  // ミスから再開(またはゲームオーバー)までの待ちタイマー。やり直し・タイトルに戻るときに取り消す
  private respawnTimer: number | null = null;

  // ?debug=collision のときだけ有効な、判定の可視化
  private collisionDebug: CollisionDebugOverlay | null = null;

  private lastTime: number = performance.now();

  constructor() {
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
    // 高解像度(Retina等)では描画解像度自体が高くギザギザが目立たないため、MSAA(antialias)は等倍の画面だけで使う。
    // 2倍解像度でのMSAAはGPU負荷が大きい割に見た目の差がほとんど無い
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: window.devicePixelRatio < 1.5,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    // 影を落とす光源(castShadow)が無いので shadowMap は使わない(有効にしていても影は出ず、処理だけが残る)
    this.renderer.shadowMap.enabled = false;
    this.renderer.debug.checkShaderErrors = false;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(DEFAULT_BACKGROUND);
    this.scene.fog = new THREE.FogExp2(DEFAULT_BACKGROUND, DEFAULT_FOG_DENSITY);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 300);

    this.input = new InputManager();
    this.sound = new SoundManager();
    this.hud = new HudManager();

    // 結果画面の Backspace(アケコンは SELECT)は、タイトルへ戻る
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Backspace' || e.repeat) return;
      if ((this.state === 'game_over' || this.state === 'clear') && !this.hud.isNameEntryOpen && performance.now() >= this.resultArmTime) {
        e.preventDefault();
        this.setupTitleScene();
      }
    });

    if (CollisionDebugOverlay.isRequested()) {
      this.collisionDebug = new CollisionDebugOverlay(this.scene);
    }

    this.setupEventListeners();
    this.setupTitleScene();

    window.addEventListener('resize', this.onResize);

    // タイトル消去後(ゲーム開始時)とタイトル表示中の両方のライト構成のシェーダをループ開始前にコンパイルする
    if (this.titleGroup) this.titleGroup.visible = false;
    this.renderer.render(this.scene, this.camera);
    if (this.titleGroup) this.titleGroup.visible = true;
    this.renderer.render(this.scene, this.camera);
    this.renderer.getContext().finish();
    this.lastTime = performance.now();

    // Start rendering loop
    requestAnimationFrame(this.gameLoop);
  }

  private setupEventListeners(): void {
    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      btnStart.innerHTML = `${buttonIconHtml([0])} ${btnStart.textContent}`;
      btnStart.addEventListener('click', () => {
        this.sound.init();
        this.startGame();
      });
    }

    const bindResultBtn = (id: string, idx: number, action: () => void) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 順位の確認中・名前登録中は、キー・パッドと同じく受け付けない(登録が出る前に次のゲームが始まってしまう)
        if (this.hud.isNameEntryOpen || performance.now() < this.resultArmTime) return;
        action();
      });
      btn.addEventListener('mouseenter', () => {
        this.resultMenuFocus = idx;
        this.updateResultFocus();
      });
      btn.addEventListener('focus', () => btn.blur());
    };
    bindResultBtn('btn-restart', 0, () => this.retryFromResult());
    bindResultBtn('btn-result-title', 1, () => this.setupTitleScene());
    bindResultBtn('btn-result-exit', 2, () => { returnToHub(); });

    this.hud.onNameEntryClosed = () => {
      this.resultArmTime = performance.now() + 800;
    };

    // Ranking screen click to play
    const rankingOverlay = document.getElementById('ranking-overlay');
    if (rankingOverlay) {
      rankingOverlay.addEventListener('click', () => {
        this.sound.init();
        this.startGame();
      });
    }
  }

  private retryFromResult(): void {
    this.sound.init();
    this.startGame();
  }

  private updateResultFocus(): void {
    const items: ResultMenuItem[] = [
      { button: document.getElementById('btn-restart'), color: '#ffe600' },
      { button: document.getElementById('btn-result-title'), color: '#39ff88' },
      { button: document.getElementById('btn-result-exit'), color: '#00f0ff' },
    ];
    setupResultMenu(document.getElementById('result-menu'), items);
    applyResultMenuFocus(items, this.resultMenuFocus);
  }

  private openResultScreen(status: 'clear' | 'gameover'): void {
    this.resultMenuFocus = 0; // 再挑戦がデフォルト
    this.resultArmTime = performance.now() + 600;
    this.hud.showResult(status, this.score);
    this.updateResultFocus();

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

  private handleResultInput(input: InputState): void {
    if (this.hud.isNameEntryOpen) return;

    // 移動は受付待ちの間も効かせる(確定だけ誤爆防止で待たせる)
    for (const dir of input.menuNav) {
      this.resultMenuFocus = (this.resultMenuFocus + dir + 3) % 3;
      this.updateResultFocus();
      this.sound.playCoin();
    }
    if (performance.now() < this.resultArmTime) return;

    // 確定: アケコンAボタン または Enter/Space (W・矢印上のジャンプでは確定しない)
    if (input.confirmPressed) {
      if (this.resultMenuFocus === 0) this.retryFromResult();
      else if (this.resultMenuFocus === 1) this.setupTitleScene();
      else returnToHub();
    } else if (input.spinPressed) {
      // Bボタン: 終了
      returnToHub();
    }
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  // -------------------------------------------------------------
  // TITLE SCENE (Dynamic 3D Street Showcase)
  // -------------------------------------------------------------
  private setupTitleScene(): void {
    this.cleanupGameplay();

    this.state = 'title';
    this.stateTimer = 0;
    mountTitleGuide();
    this.hud.showTitle(false);
    this.hud.showRanking(false);
    this.hud.showDemoBanner(false);
    this.hud.hideCenterBanner();
    this.hud.hideResult();
    this.hud.setInvincibleBorder(false);
    this.hud.setGameplayHUDVisible(false);

    if (!this.arcadeTitleScreen) {
      this.arcadeTitleScreen = new ArcadeTitleScreen({
        slug: 'street-b-boy',
        accentColor: '#ffea00',
        tagline: 'ブレイクダンス横スクロールアクション',
        startButtonLabel: 'スタート',
        promptLabel: 'PRESS START / ENTER / 画面クリック',
        onStart: () => {
          this.sound.init();
          this.startGame();
        },
      });
    }
    this.arcadeTitleScreen.show();

    // 最初のステージ(Stage 1: BRONX STREET)を背景として生成
    this.stage = new Stage(this.scene, 1);

    // 主人公ダンサーをステージ1のスタート地点に配置
    this.titleDancer = new Player();
    this.titleDancer.reset(2.2, 0);
    this.titleDancer.isGrounded = true;
    this.titleDancer.mesh.position.z = TITLE_DANCER_Z;
    this.scene.add(this.titleDancer.mesh);

    // 主人公を照らすドラマチックなフロントスポットライト
    this.titleGroup = new THREE.Group();
    const titleKeyLight = new THREE.SpotLight(0xffea00, 4.5, 12, Math.PI / 3, 0.4);
    titleKeyLight.position.set(2.2, 3.5, 3.5);
    titleKeyLight.target = this.titleDancer.mesh;
    const titleRimLight = new THREE.DirectionalLight(0x00f0ff, 1.8);
    titleRimLight.position.set(0, 3, -2);
    this.titleGroup.add(titleKeyLight, titleRimLight);
    this.scene.add(this.titleGroup);

    // 主人公をズームインしつつロゴの下に全身が美しく収まるカメラアングル
    this.camera.position.set(2.2, 1.1, 4.5 + TITLE_DANCER_Z);
    this.camera.lookAt(2.2, 0.8, TITLE_DANCER_Z);

    this.input.resetIdleTimer();
  }

  // -------------------------------------------------------------
  // GAMEPLAY INITIALIZATION
  // -------------------------------------------------------------
  private startGame(isDemo: boolean = false): void {
    const canReuseTitleStage = (this.state === 'title' || this.state === 'attract_ranking')
      && this.stage !== null
      && this.stage.stageNumber === 1;
    const reusedDancer = canReuseTitleStage ? this.titleDancer : null;
    if (reusedDancer) {
      this.titleDancer = null;
    } else if (this.titleDancer) {
      this.scene.remove(this.titleDancer.mesh);
      this.titleDancer = null;
    }
    if (this.titleGroup) {
      this.scene.remove(this.titleGroup);
      this.titleGroup = null;
    }

    const reusedStage = canReuseTitleStage ? this.stage : null;
    if (reusedStage) {
      this.stage = null;
    }
    this.cleanupGameplay();

    this.currentStage = 1;
    this.score = 0;
    this.timeLeft = this.getStageInitialTime(this.currentStage);
    this.lives = INITIAL_LIVES;
    this.lastDeathCause = '';
    this.deathsByCause = {};
    this.cassettesTaken = 0;
    this.goldTaken = 0;
    this.maxComboSeen = 0;
    this.stompKills = 0;
    this.hud.updateScore(this.score);
    this.hud.updateTime(this.timeLeft);
    this.hud.updateLives(this.lives);

    this.stage = reusedStage ?? new Stage(this.scene, this.currentStage);
    this.setupStageHooks(this.stage);
    this.checkpoint = null;
    this.homecoming = false;
    this.returnBlend = 0;
    this.sound.setBaseTempo(this.stage.config.tempo);
    this.sound.setBgmStyle(this.stage.config.bgm ?? 'street');
    if (reusedDancer) {
      this.player = reusedDancer;
      this.player.reset(STAGE_SPAWN.x, STAGE_SPAWN.y);
      this.player.mesh.position.z = 0;
    } else {
      this.player = new Player();
      this.player.reset(STAGE_SPAWN.x, STAGE_SPAWN.y);
      this.scene.add(this.player.mesh);
    }
    this.camera.position.set(STAGE_SPAWN.x, 2.5, 13.0);

    this.hud.showTitle(false);
    this.hud.showRanking(false);
    this.hud.hideResult();
    this.hud.setGameplayHUDVisible(true);
    this.arcadeTitleScreen?.hide();

    if (isDemo) {
      this.state = 'attract_demo';
      this.hud.showDemoBanner(true);
      this.hud.hideCenterBanner();
    } else {
      this.state = 'playing';
      mountPlayGuide();
      this.hud.showDemoBanner(false);
      this.beginStageCountdown();
      this.sound.startBgm();
      this.sound.setGoldMode(false);
    }

    this.comboHits = 0;
    this.comboTimer = 0;
    this.cameraShakeTimer = 0;
    this.cameraShakeIntensity = 0;
    this.hud.hideCombo();

    this.stateTimer = 0;
    this.input.resetIdleTimer();
  }

  private cleanupGameplay(): void {
    this.goalBlastTimer = 0;
    if (this.respawnTimer !== null) {
      window.clearTimeout(this.respawnTimer);
      this.respawnTimer = null;
    }
    this.countdownHandle?.cancel();
    this.countingDown = false;
    if (this.player) {
      this.scene.remove(this.player.mesh);
      this.player = null;
    }
    if (this.stage) {
      this.stage.dispose();
      this.stage = null;
    }
    this.comboHits = 0;
    this.comboTimer = 0;
    this.cameraShakeTimer = 0;
    this.cameraShakeIntensity = 0;
    this.hud.hideCombo();
    this.hud.setHordeWarning(0);
    this.sound.setGoldMode(false);
  }

  private advanceToNextStage(): void {
    if (this.currentStage >= FINAL_STAGE) return;
    this.currentStage++;

    if (this.stage) {
      this.stage.dispose();
      this.stage = null;
    }

    this.timeLeft = this.getStageInitialTime(this.currentStage);
    this.hud.updateTime(this.timeLeft);

    this.stage = new Stage(this.scene, this.currentStage);
    this.setupStageHooks(this.stage);
    this.checkpoint = null;
    this.homecoming = false;
    this.returnBlend = 0;
    this.sound.setBaseTempo(this.stage.config.tempo);
    this.sound.setBgmStyle(this.stage.config.bgm ?? 'street');
    if (this.player) {
      this.player.reset(STAGE_SPAWN.x, STAGE_SPAWN.y);
    }
    this.camera.position.set(STAGE_SPAWN.x, 2.5, 13.0);

    this.state = 'playing';
    this.stateTimer = 0;
    this.beginStageCountdown();

    this.sound.startBgm();
    this.sound.setGoldMode(false);
  }

  private setupStageHooks(stage: Stage): void {
    stage.onVerticalLaserFired = (x) => {
      if (this.player && Math.abs(this.player.x - x) < 28) {
        this.sound.playShoot();
      }
    };
  }

  /** 「STAGE n」を出したまま 3・2・1・GO! を数え、GO! まで時間を止めて操作を受け付けない。 */
  private beginStageCountdown(): void {
    this.hud.showCenterBanner('ready', this.currentStage === FINAL_STAGE ? 'FINAL' : `STAGE ${this.currentStage}`);
    this.countingDown = true;
    this.countdownHandle?.cancel();
    this.countdownHandle = startArcadeCountdown({
      accentColor: '#ffea00',
      offsetY: '24vh',
      onGo: () => {
        this.countingDown = false;
        if (this.state === 'playing') this.hud.hideCenterBanner();
      },
    });
  }

  private getStageInitialTime(stage: number): number {
    return (STAGE_CONFIGS[stage] ?? STAGE_CONFIGS[1]).timeLimit;
  }

  // -------------------------------------------------------------
  // MAIN LOOP
  // -------------------------------------------------------------
  private gameLoop = (timestamp: number): void => {
    requestAnimationFrame(this.gameLoop);

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // Cap delta time for stable physics
    this.lastTime = timestamp;

    const inputState = this.input.update();

    // ポーズ中は進めない(描画だけ続ける)
    if (this.pause.isOpen) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // 1. 無操作デモは撤廃。タイトル画面を常時維持する。

    // 2. State Machine Update
    switch (this.state) {
      case 'title':
        this.updateTitle(dt, timestamp, inputState);
        break;

      case 'attract_demo':
        this.updateAttractDemo(dt, timestamp, inputState);
        break;

      case 'attract_ranking':
        this.updateAttractRanking(dt, inputState);
        break;

      case 'playing':
        this.updatePlaying(dt, timestamp, inputState);
        break;

      case 'clear':
        this.updateClear(dt, timestamp, inputState);
        break;

      case 'game_over':
        this.updateGameOver(dt, inputState);
        break;
    }

    this.updateCollisionDebug();
    this.renderer.render(this.scene, this.camera);
  };

  /** 判定の可視化(?debug=collision)。solid=緑 / oneWay=青 / trigger=黄 / hazard=赤 / player=白 / attack=マゼンタ */
  private updateCollisionDebug(): void {
    if (!this.collisionDebug) return;
    const shapes: DebugShape[] = [];
    if (this.stage && (this.state === 'playing' || this.state === 'attract_demo' || this.state === 'clear')) {
      shapes.push(...this.stage.getCollisionShapes());
      if (this.player) {
        shapes.push({ kind: 'player', box: this.player.getAABB() });
        const attack = this.player.getAttackAABB();
        if (attack) shapes.push({ kind: 'attack', box: attack });
      }
    }
    this.collisionDebug.update(shapes);
  }

  // -------------------------------------------------------------
  // TITLE UPDATE
  // -------------------------------------------------------------
  private updateTitle(dt: number, time: number, input: InputState): void {
    this.stateTimer += dt;

    if (this.stage) {
      this.stage.update(dt, time * 0.001, this.camera.position.x);
    }

    if (this.titleDancer) {
      this.titleDancer.animateBreakdanceDemo(dt, this.stateTimer);
      this.titleDancer.mesh.position.set(this.titleDancer.x, this.titleDancer.y, TITLE_DANCER_Z);
    }

    // 主人公を中心にしたズームインカメラ（臨場感ある微細スウィング）
    const camSwayX = Math.sin(this.stateTimer * 0.6) * 0.15;
    const camSwayY = Math.cos(this.stateTimer * 0.8) * 0.04;
    this.camera.position.set(2.2 + camSwayX, 1.1 + camSwayY, 4.5 + TITLE_DANCER_Z);
    this.camera.lookAt(2.2, 0.8, TITLE_DANCER_Z);

    // Start on action
    if (input.startPressed || input.jumpPressed) {
      this.sound.init();
      this.startGame();
    }
  }

  // -------------------------------------------------------------
  // ATTRACT DEMO UPDATE
  // -------------------------------------------------------------
  private updateAttractDemo(dt: number, time: number, input: InputState): void {
    this.stateTimer += dt;

    // Interrupt attract demo immediately on ANY input!
    if (input.anyActionPressed) {
      this.sound.init();
      this.startGame();
      return;
    }

    // Demo duration ~10s -> Switch to ranking
    if (this.stateTimer >= 10) {
      this.state = 'attract_ranking';
      this.stateTimer = 0;
      this.hud.showDemoBanner(false);
      this.hud.showRanking(true);
      return;
    }

    // Automated script for Stage 1 demo
    const demoInput: InputState = {
      left: false,
      right: true, // Auto dash right
      down: false,
      jump: false,
      jumpPressed: false,
      jumpReleased: false,
      spinPressed: false,
      startPressed: false,
      anyActionPressed: false,
      confirmPressed: false,
      menuNav: [],
      lastInputTime: 0
    };

    if (this.player) {
      // Auto jump over first pit (X: 23-28)
      if (this.player.x > 22 && this.player.x < 24 && this.player.isGrounded) {
        demoInput.jump = true;
        demoInput.jumpPressed = true;
      }
      // Auto spin attack through first cardboard box (X: 18)
      if (this.player.x > 16.5 && this.player.x < 18.5) {
        demoInput.spinPressed = true;
      }
    }

    this.runPhysicsAndCollisions(dt, time, demoInput);
  }

  // -------------------------------------------------------------
  // ATTRACT RANKING UPDATE
  // -------------------------------------------------------------
  private updateAttractRanking(dt: number, input: InputState): void {
    this.stateTimer += dt;

    // Interrupt immediately on any input to start real game
    if (input.anyActionPressed) {
      this.sound.init();
      this.startGame();
      return;
    }

    // After ~6s, return to title screen
    if (this.stateTimer >= 6) {
      this.setupTitleScene();
    }
  }

  // -------------------------------------------------------------
  // PLAYING UPDATE
  // -------------------------------------------------------------
  private updatePlaying(dt: number, time: number, input: InputState): void {
    // カウントダウン中: 時間も操作も止め、ステージとカメラだけ動かす
    if (this.countingDown) {
      this.stage?.update(dt, time * 0.001, this.camera.position.x);
      this.updateCamera(dt);
      return;
    }

    // Time countdown
    this.timeLeft -= dt;
    this.hud.updateTime(this.timeLeft);

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.hud.showCenterBanner('timeup');
      this.sound.playTimeUp();
      this.handlePlayerDeath(true, 'タイムアップ');
      return;
    }

    // Combo timer decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboHits = 0;
      }
    }

    this.runPhysicsAndCollisions(dt, time, input);
  }

  // -------------------------------------------------------------
  // CORE PHYSICS & COLLISION ENGINE (Mario-grade 2.5D AABB)
  // -------------------------------------------------------------
  private runPhysicsAndCollisions(dt: number, time: number, input: InputState): void {
    if (!this.player || !this.stage) return;

    // If player is already dead, run death physics/animation and skip all gameplay collisions
    if (this.player.isDead) {
      this.player.update(dt, input);
      this.player.mesh.position.set(this.player.x, this.player.y, 0);
      this.stage.update(dt, time * 0.001, this.camera.position.x);
      this.updateCamera(dt);
      return;
    }

    // 縦穴を通過して地上へ帰還したことを記録
    const dropShaft = this.stage.dropShaft;
    if (dropShaft && !this.homecoming && this.player.x > dropShaft.x0 && this.player.x < dropShaft.x1 && this.player.y < dropShaft.revealY) {
      this.homecoming = true;
      this.stage.vanishShaft();
    }

    // Spin attack trigger
    if (input.spinPressed && this.player.triggerSpin()) {
      this.sound.playSpin();
      this.stage.particleSystem.spawnShockwave(this.player.x, this.player.y);
      this.triggerCameraShake(0.15, 0.15);
    }

    // Update player movement & physics
    // 縦穴の中では、落下速度に上限をつけて、ゆっくり舞い降りる(レーザーを避ける時間をつくる)
    const shaft = this.stage?.dropShaft;
    this.player.fallSpeedLimit = shaft && this.player.x > shaft.x0 && this.player.x < shaft.x1 ? shaft.fallSpeedLimit : 24;
    const { spawnedSmoke, jumped } = this.player.update(dt, input);
    if (jumped) {
      this.sound.playJump();
    }
    if (spawnedSmoke) {
      this.stage.particleSystem.spawnSmoke(this.player.x, this.player.y);
    }

    // Invincibility fx
    if (this.player.isInvincible) {
      this.player.animateGoldGlow(time * 0.001);
      this.hud.setInvincibleBorder(true);
      if (Math.random() < 0.4) {
        this.stage.particleSystem.spawnSparkles(this.player.x, this.player.y + 0.8, 2, 0xffea00);
      }
    } else {
      this.player.resetMaterials();
      this.hud.setInvincibleBorder(false);
    }

    // Pit fall check
    if (this.player.y < -5) {
      this.handlePlayerDeath(false, '穴に落下');
      return;
    }

    // -------------------------------------------------------------
    // 体を止める判定(ソリッド / 一方通行)。すべて resolveSolid を通す。
    //  solid  : 地面・ブロック・缶・消火栓の本体・サブウーファー → 上に乗れる / 横は壁 / 下から頭突き
    //  oneWay : 薄い足場板・ゴンドラ・レールカート・崩れる足場 → 下からは通り抜け、上からだけ着地
    // -------------------------------------------------------------
    let groundedThisFrame = false;
    const attackBox = this.player.getAttackAABB();

    for (const plat of this.stage.platforms) {
      const hit = this.resolveSolid(
        { x: plat.x, y: plat.y - plat.h, w: plat.w, h: plat.h },
        plat.oneWay ? 'oneWay' : 'solid'
      );
      if (hit === 'top') {
        groundedThisFrame = true;
      } else if (hit === 'bottom') {
        this.sound.playSmash();
        this.triggerCameraShake(0.08, 0.1);
      }
    }

    // 動く足場(ゴンドラ・レールカート): 上に乗ると一緒に運ばれる
    for (const mp of this.stage.movingPlatforms) {
      if (this.resolveSolid(mp.getAABB(), 'oneWay') === 'top') {
        groundedThisFrame = true;
        this.player.x += mp.vx * dt;
        this.player.y += mp.vy * dt;
      }
    }

    // 崩れる足場: 乗ると崩壊のカウントダウンが始まる
    for (const cp of this.stage.crumblingPlatforms) {
      if (!cp.isActive) continue;
      if (this.resolveSolid(cp.getAABB(), 'oneWay') === 'top') {
        groundedThisFrame = true;
        cp.touch();
      }
    }

    // ブロック(?ブロック / レンガ)
    for (const block of this.stage.blocks) {
      if (block.isDestroyed) continue;
      const hit = this.resolveSolid(block.getAABB(), 'solid', 0.08, 0.08);
      if (hit === 'top') {
        groundedThisFrame = true;
      } else if (hit === 'bottom') {
        this.onBlockHit(block);
      }
    }

    // 壊せる障害物(缶・段ボール): スピン/無敵の攻撃で壊れる。壊れなければソリッド
    for (let i = this.stage.obstacles.length - 1; i >= 0; i--) {
      const obs = this.stage.obstacles[i];
      if (obs.isDestroyed) continue;
      const obsBox = obs.getAABB();

      if (attackBox && this.checkAABB(attackBox, obsBox)) {
        obs.isDestroyed = true;
        this.sound.playSmash();
        this.stage.particleSystem.spawnObstacleDebris(obs.x, obs.y, obs.type);
        this.stage.scene.remove(obs.mesh);
        this.addScore(150);
        this.triggerCameraShake(0.14, 0.15);
        this.registerComboHit();
        continue;
      }

      if (this.resolveSolid(obsBox, 'solid') === 'top') groundedThisFrame = true;
    }

    // 消火栓: 攻撃で噴出する。本体は噴出の前後を問わず常にソリッド(水柱は後段のトリガー)
    for (const hyd of this.stage.fireHydrants) {
      const hydBox = hyd.getAABB();
      if (!hyd.isErupted && attackBox && this.checkAABB(attackBox, hydBox)) {
        hyd.erupt();
        this.sound.playGeyser();
        this.stage.particleSystem.spawnWater(hyd.x, hyd.y + 0.8, 18);
        this.triggerCameraShake(0.3, 0.3);
        this.addScore(300);
        this.registerComboHit();
      }
      if (this.resolveSolid(hydBox, 'solid') === 'top') groundedThisFrame = true;
    }

    // サブウーファー: ソリッド。上から乗ると高く跳ね上げる
    for (const sub of this.stage.subwoofers) {
      if (this.resolveSolid(sub.getAABB(), 'solid') === 'top') {
        sub.bounce();
        this.player.vy = 20.0;
        this.player.isGrounded = false;
        this.sound.playSubwoofer();
        this.stage.particleSystem.spawnShockwave(sub.x, sub.y + 0.9);
        this.triggerCameraShake(0.35, 0.3);
        this.registerComboHit();
        this.addScore(200);
      }
    }

    if (!groundedThisFrame && this.player.isGrounded && this.player.vy < 0) {
      this.player.isGrounded = false;
    }

    // Refresh player AABB after all solid collision adjustments
    const pBox = this.player.getAABB();

    // Cassette Collection
    for (const cassette of this.stage.cassettes) {
      if (cassette.isCollected) continue;
      if (this.checkAABB(pBox, cassette.getAABB())) {
        cassette.isCollected = true;
        this.cassettesTaken++;
        if (cassette.isGold) this.goldTaken++;
        this.stage.scene.remove(cassette.mesh);

        if (cassette.isGold) {
          this.sound.playPowerup();
          this.sound.setGoldMode(true);
          this.player.triggerInvincibility(4);
          this.stage.particleSystem.spawnSparkles(cassette.x, cassette.y, 24, 0xffea00);
          this.addScore(1000);
          this.timeLeft = Math.min(this.timeLeft + 5.0, 99);
        } else {
          this.sound.playCoin();
          this.stage.particleSystem.spawnSparkles(cassette.x, cassette.y, 8, 0x00f0ff);
          this.addScore(100);
          this.timeLeft = Math.min(this.timeLeft + 1.5, 99);
        }
        this.hud.updateTime(this.timeLeft);
      }
    }

    // Check if player invincibility expired to revert BGM tempo
    if (!this.player.isInvincible) {
      this.sound.setGoldMode(false);
    }

    // Grind Rails
    let onRail = false;
    for (const rail of this.stage.grindRails) {
      const rBox = rail.getAABB();
      if (this.checkAABB(pBox, rBox)) {
        if ((this.player.vy <= 0 && this.player.prevY >= rail.y - 0.25) || this.player.isGrinding) {
          onRail = true;
          this.player.isGrinding = true;
          this.player.isGrounded = true;
          this.player.y = rail.y + 0.05;
          this.player.vy = 0;
          groundedThisFrame = true;

          const grindSpeed = this.player.isFacingRight ? 13.5 : -13.5;
          this.player.vx = grindSpeed;

          if (Math.random() < 0.6) {
            this.stage.particleSystem.spawnSparks(this.player.x, this.player.y);
          }
          if (time - this.lastGrindSoundTime > 120) {
            this.sound.playGrind();
            this.lastGrindSoundTime = time;
          }

          if (input.jumpPressed) {
            this.player.isGrinding = false;
            this.player.vy = 16.5;
            this.player.vx = grindSpeed * 1.15;
            this.sound.playJump();
            this.registerComboHit();
            this.triggerCameraShake(0.15, 0.15);
          }

          if (this.player.x < rail.x - 0.2 || this.player.x > rail.x + rail.length + 0.2) {
            this.player.isGrinding = false;
          }
          break;
        }
      }
    }
    if (!onRail && this.player.isGrinding) {
      this.player.isGrinding = false;
    }

    // Steam Vents (Updraft Lift)
    for (const vent of this.stage.steamVents) {
      if (vent.isSteaming) {
        const vBox = vent.getAABB();
        if (this.checkAABB(pBox, vBox)) {
          this.player.vy = Math.min(this.player.vy + 42 * dt, 14.0);
          this.player.isGrounded = false;
        }
      }
    }

    // 消火栓の水柱(トリガー): 噴出中に触れると高く打ち上げる。
    // 打ち上げは触れている間ずっと続けるが、得点・コンボ・効果音は「入った瞬間」の1回だけ(毎フレーム出すと、1回通るだけで数万点入る)
    for (const hyd of this.stage.fireHydrants) {
      const column = hyd.getColumnAABB();
      const inside = !!column && this.checkAABB(pBox, column);
      const entered = hyd.columnEntry.update(inside);
      if (inside) {
        this.player.vy = 20.5;
        this.player.isGrounded = false;
      }
      if (entered) {
        this.sound.playGeyser();
        this.stage.particleSystem.spawnWater(this.player.x, this.player.y + 0.5, 8);
        this.triggerCameraShake(0.2, 0.2);
        this.registerComboHit();
      }
    }

    // チェックポイント(トリガー): 通過するとミス後の再開地点になる
    for (const cp of this.stage.checkpoints) {
      if (!cp.isReached && this.checkAABB(pBox, cp.getAABB())) {
        cp.reach();
        this.checkpoint = { x: cp.x, y: cp.y };
        this.sound.playPowerup();
        this.stage.particleSystem.spawnSparkles(cp.x, cp.y + 2.6, 14, 0x00ff88);
        this.hud.showCenterBanner('ready', 'CHECK POINT');
        window.setTimeout(() => {
          if (this.state === 'playing' && !this.player?.isDead) this.hud.hideCenterBanner();
        }, 900);
      }
    }

    // Security Laser Grids (Slide Underneath to Evade!)
    for (const laser of this.stage.laserGrids) {
      const beamBox = laser.getBeamAABB();
      if (this.checkAABB(pBox, beamBox)) {
        // リスポーン直後の無敵やしゃがみでも、レーザーは防げない。しゃがんで潜れるかは、
        // しゃがんだ体(高さ0.95)がビームの帯に重なるかどうかだけで決まる(低いビームは潜れない)
        if (this.player.isDead) return;
        this.sound.playLaserWarning();
        this.stage.particleSystem.spawnSparkles(this.player.x, this.player.y + 1.0, 18, 0xff0033);
        this.triggerCameraShake(0.45, 0.4);
        this.handlePlayerDeath(false, 'レーザー');
        return;
      }
    }

    // Enemies Interaction
    for (const enemy of this.stage.enemies) {
      enemy.update(dt, this.player.x, (proj) => {
        if (this.stage) {
          this.stage.projectiles.push(proj);
          this.stage.scene.add(proj.mesh);
          this.sound.playShoot();
        }
      }, this.player.y);
      if (enemy.isDead) continue;

      // Solid environment wall collision (platforms, stairs, blocks, street obstacles)
      this.stage.updateEnemyCollisions(enemy);

      const eBox = enemy.getAABB();

      // Attack Box check (Spin or Gold Invincible)
      // 浮遊する敵(ドローン)は、上でも下でも横でも、スピンが近くをかすめれば落とせる(判定を上下に広げる)
      const hurtBox = enemy instanceof SurveillanceDrone
        ? { x: eBox.x, y: eBox.y - DRONE_SPIN_REACH, w: eBox.w, h: eBox.h + DRONE_SPIN_REACH * 2 }
        : eBox;
      if (attackBox && this.checkAABB(attackBox, hurtBox)) {
        enemy.defeat(this.player.isFacingRight ? 8 : -8, 10);
        this.sound.playSmash();
        this.stage.particleSystem.spawnSparkles(enemy.x, enemy.y + 0.5, 12, 0xff1a1a);
        this.addScore(enemy.scoreValue);
        this.registerComboHit();
        this.triggerCameraShake(0.22, 0.2);
        continue;
      }

      // Normal Player Contact Check
      if (this.checkAABB(pBox, eBox)) {
        // Stomp from above (Player is falling and the feet are in the top half of the enemy)
        if (this.player.vy < 0 && pBox.y >= eBox.y + eBox.h * 0.5) {
          enemy.defeat(4, 6);
          this.player.bounceOnEnemy();
          this.sound.playStomp();
          this.stage.particleSystem.spawnSparkles(enemy.x, enemy.y + 0.5, 8, 0xffea00);
          this.addScore(enemy.scoreValue);
          this.registerComboHit();
          this.stompKills++;
          this.triggerCameraShake(0.18, 0.18);
        } else if (this.player.spawnShieldTimer <= 0) {
          // Hurt / Death by contact
          this.handlePlayerDeath(false, '敵との接触');
          return;
        }
      }
    }

    // 後ろから追ってくる犬の大群の出現と後片付け。迫ってくる圧力を画面の縁の警告で伝える
    this.stage.updateEnemies(dt, this.player.x, this.player.y);
    const pressure = this.stage.getHordePressure(this.player.x);
    this.hud.setHordeWarning(pressure);
    // 群れがすぐ後ろまで迫った瞬間に、警告音を一度鳴らす(離れたら、また鳴るようにする)
    if (pressure > 0.65 && !this.hordeAlerted) {
      this.hordeAlerted = true;
      this.sound.playLaserWarning();
    } else if (pressure < 0.3) {
      this.hordeAlerted = false;
    }

    // Projectile Collisions (Deflection with Spin Attack, Damage on Player, Deflected hitting Enemies, Obstacle Blocking)
    for (const proj of this.stage.projectiles) {
      if (proj.isDead) continue;
      const projBox = proj.getAABB();

      // 弾はソリッド(地面・ブロック・缶・消火栓・スピーカー)で止まる。一方通行の板は素通りする
      if (this.stage.isBlockedBySolid(projBox)) {
        proj.isDead = true;
        this.sound.playSmash();
        this.stage.particleSystem.spawnSparks(proj.x, proj.y, 6);
        continue;
      }

      // Deflected Projectile hitting Enemies
      if (proj.isDeflected) {
        for (const enemy of this.stage.enemies) {
          if (enemy.isDead) continue;
          if (this.checkAABB(projBox, enemy.getAABB())) {
            enemy.defeat(proj.vx > 0 ? 8 : -8, 8);
            proj.isDead = true;
            this.sound.playSmash();
            this.stage.particleSystem.spawnSparkles(enemy.x, enemy.y + 0.5, 14, 0x00f0ff);
            this.addScore(500);
            this.registerComboHit();
            this.triggerCameraShake(0.22, 0.2);
            break;
          }
        }
        continue;
      }

      // Enemy Projectile hitting Player
      if (this.checkAABB(pBox, projBox)) {
        if (this.player.isSpinning) {
          // Spin attack deflects projectile!
          proj.deflect();
          this.sound.playDeflect();
          this.stage.particleSystem.spawnSparkles(proj.x, proj.y, 12, 0x00f0ff);
          this.registerComboHit();
          this.addScore(300);
          this.triggerCameraShake(0.2, 0.15);
        } else if (this.player.isInvincible || this.player.spawnShieldTimer > 0) {
          // Gold invincibility or spawn shield destroys projectile
          proj.isDead = true;
          this.sound.playSmash();
          this.stage.particleSystem.spawnSparkles(proj.x, proj.y, 8, 0xffea00);
          this.addScore(150);
        } else {
          this.handlePlayerDeath(false, '敵の飛び道具');
          return;
        }
      }
    }

    // Goal Reach Check (Turntable stage at end of level)
    const goalBox = this.stage.getGoalAABB();
    if (this.checkAABB(pBox, goalBox)) {
      // 自由落下の縦穴があるステージ(FINAL)では、落下シーケンス(homecoming)を正規に通過していなければゴール無効
      if (this.stage.dropShaft && !this.homecoming) {
        return;
      }
      this.handleGoalClear();
      return;
    }

    // Sync 3D player mesh to post-collision coordinates
    this.player.mesh.position.set(this.player.x, this.player.y, 0);

    // Update Stage World
    this.updateReturnBlend(dt);
    this.stage.update(dt, time * 0.001, this.camera.position.x);

    // 2.5D Camera Tracking
    this.updateCamera(dt);
  }

  // -------------------------------------------------------------
  // 2.5D CAMERA TRACKING
  // -------------------------------------------------------------
  /** 縦穴を落ちるあいだ、天国から1面の夜の街へ景色を移す(縦穴の上の台にいる間・リスポーン直後は天国のまま) */
  private updateReturnBlend(dt: number): void {
    if (!this.stage || !this.player) return;
    const shaft = this.stage.dropShaft;
    let target = 0;
    if (shaft && this.player.x > shaft.x0 - 0.5) {
      const from = shaft.topY;
      const to = 3.5;
      target = Math.min(1, Math.max(0, (from - this.player.y) / (from - to)));
    }
    this.returnBlend += (target - this.returnBlend) * Math.min(1, dt * 6);
    this.stage.setReturnBlend(this.returnBlend);
  }

  private updateCamera(dt: number): void {
    if (!this.player) return;

    const lookAhead = this.player.isFacingRight ? 3.0 : -1.5;
    let targetX = this.player.x + lookAhead;
    let targetY = Math.max(3.2, this.player.y + 2.0);
    let lerpSpeed = 4.5 * dt;

    // 縦穴: 穴の真ん中を映し、落ちる速さの分だけ先(下)を映す。台の上にいるときは、穴の中が見えるまで下げる
    const shaft = this.stage?.dropShaft;
    if (shaft && this.player.x > shaft.x0 - 6 && this.player.x < shaft.x1 + 1) {
      targetX = (shaft.x0 + shaft.x1) / 2;
      const falling = Math.min(0, this.player.vy) * 0.35;
      targetY = Math.max(3.2, Math.min(this.player.y + 2.0 + falling, shaft.topY - 2.5));
      lerpSpeed = 10 * dt;
    }
    this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, targetX, lerpSpeed);
    this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, targetY, lerpSpeed);
    this.camera.position.z = 13.0;

    // Apply Arcade Camera Shake
    if (this.cameraShakeTimer > 0) {
      this.cameraShakeTimer -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity;
      if (this.cameraShakeTimer <= 0) {
        this.cameraShakeIntensity = 0;
      }
    }

    this.camera.lookAt(this.camera.position.x + 0.5, this.camera.position.y - 0.8, 0);
  }

  // -------------------------------------------------------------
  // STAGE CLEAR GOAL SEQUENCE
  // -------------------------------------------------------------
  private handleGoalClear(): void {
    if (!this.player || !this.stage || this.state !== 'playing') return;

    this.state = 'clear';
    this.stateTimer = 0;
    this.hud.setHordeWarning(0);
    this.sound.stopBgm();
    this.sound.playClear();
    reportDeepAnalytics('progression_update', {
      ...(this.currentStage === FINAL_STAGE ? { result: 'clear' as const } : {}),
      maxStage: this.currentStage,
      maxCombo: this.maxComboSeen,
      enemiesDefeated: this.stompKills,
      itemsCollected: this.cassettesTaken,
      extraStats: { goldCassettes: this.goldTaken, livesLeft: this.lives, deaths: this.deathsByCause, score: this.score },
    });

    this.player.x = this.stage.goalX;
    this.player.y = this.stage.goalY + 0.3;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.isVictory = true;

    // Time Bonus Calculation
    const timeBonus = Math.floor(this.timeLeft) * 100;
    const stageBonus = stageClearBonus(this.currentStage);
    this.addScore(timeBonus + stageBonus);

    // 縦穴を落ちてきたゴールは、爆発で華々しく飾る
    if (this.stage.dropShaft) this.startGoalExplosion();

    if (this.currentStage === FINAL_STAGE) {
      this.hud.showCenterBanner('allclear');
    } else {
      this.hud.showCenterBanner('clear');
    }
  }

  /** 落下のゴールの爆発: 一瞬の閃光、衝撃波、火花と花火の連発、大きな画面の揺れと爆発音 */
  private startGoalExplosion(): void {
    if (!this.stage) return;
    const gx = this.stage.goalX;
    const gy = this.stage.goalY;
    const ps = this.stage.particleSystem;
    for (const dy of [0.3, 1.5, 3]) ps.spawnShockwave(gx, gy + dy);
    ps.spawnSparkles(gx, gy + 1, 70, 0xff7a1a);
    ps.spawnSparkles(gx, gy + 1.5, 60, 0xffe600);
    ps.spawnSparkles(gx, gy + 2, 50, 0xffffff);
    ps.spawnSparkles(gx, gy + 2.5, 40, 0x00f0ff);
    for (let i = 0; i < 8; i++) {
      ps.spawnFireworks(gx + (Math.random() - 0.5) * 10, gy + 2 + Math.random() * 6);
    }
    this.triggerCameraShake(0.9, 0.9);
    this.sound.playSmash();
    setTimeout(() => this.sound.playSmash(), 140);
    setTimeout(() => this.sound.playSmash(), 300);
    this.goalBlastTimer = 1.6;
    this.goalBlastTick = 0;

    // 画面全体の白い閃光
    if (!this.goalFlashEl) {
      const el = document.createElement('div');
      el.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:8;';
      document.body.appendChild(el);
      this.goalFlashEl = el;
    }
    this.goalFlashEl.animate([{ opacity: 0.95 }, { opacity: 0.35, offset: 0.25 }, { opacity: 0 }], { duration: 1100, easing: 'ease-out' });
  }

  private updateClear(dt: number, time: number, input: InputState): void {
    this.stateTimer += dt;

    // ゴールの爆発の続き(0.12秒ごとに、花火と火花を上げて、少し揺らす)
    if (this.goalBlastTimer > 0 && this.stage) {
      this.goalBlastTimer -= dt;
      this.goalBlastTick -= dt;
      if (this.goalBlastTick <= 0) {
        this.goalBlastTick = 0.12;
        const gx = this.stage.goalX + (Math.random() - 0.5) * 8;
        const gy = this.stage.goalY + 1 + Math.random() * 7;
        this.stage.particleSystem.spawnFireworks(gx, gy);
        this.stage.particleSystem.spawnSparkles(gx, gy, 18, Math.random() < 0.5 ? 0xff7a1a : 0xffe600);
        this.triggerCameraShake(0.3, 0.15);
      }
    }

    if (this.stage) {
      this.stage.update(dt, time * 0.001, this.camera.position.x);
      // Continuous celebratory fireworks!
      if (Math.random() < 0.25) {
        this.stage.particleSystem.spawnFireworks(
          this.stage.goalX + (Math.random() - 0.5) * 8,
          this.stage.goalY + 3 + Math.random() * 4
        );
      }
    }

    if (this.player) {
      const dummyInput: InputState = {
        left: false, right: false, down: false, jump: false,
        jumpPressed: false, jumpReleased: false, spinPressed: false,
        startPressed: false, anyActionPressed: false, confirmPressed: false, menuNav: [], lastInputTime: 0
      };
      this.player.update(dt, dummyInput);
    }

    // Camera zooms dramatically into B-Boy freeze pose!
    if (this.stage) {
      this.camera.position.x = THREE.MathUtils.lerp(this.camera.position.x, this.stage.goalX, 3.0 * dt);
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, this.stage.goalY + 1.8, 3.0 * dt);
      this.camera.position.z = THREE.MathUtils.lerp(this.camera.position.z, 7.5, 2.0 * dt);
      this.camera.lookAt(this.stage.goalX, this.stage.goalY + 0.8, 0);
    }

    // Stage progression logic
    if (this.currentStage < FINAL_STAGE) {
      if (this.stateTimer >= 3.2) {
        this.advanceToNextStage();
      }
    } else {
      // FINAL STAGE: All Clear result overlay
      if (this.stateTimer >= 3.5 && this.resultArmTime === 0) {
        this.openResultScreen('clear');
      }
      if (this.stateTimer >= 3.5) {
        this.handleResultInput(input);
      }
    }
  }

  // -------------------------------------------------------------
  // PLAYER DEATH & GAME OVER
  // -------------------------------------------------------------
  private handlePlayerDeath(skipHurtSound: boolean = false, cause: string = '不明'): void {
    if (!this.player || this.player.isDead) return;
    this.lastDeathCause = cause;
    this.deathsByCause[cause] = (this.deathsByCause[cause] ?? 0) + 1;

    this.player.isDead = true;
    this.hud.setHordeWarning(0);
    this.player.vy = 12; // Death bounce
    if (!skipHurtSound) {
      this.sound.playHurt();
      this.hud.showCenterBanner('dead');
    }

    this.lives -= 1;
    this.hud.updateLives(this.lives);
    // 残機が減るたびに得点が半分になる(ゲームオーバー時も含む)
    this.score = Math.floor(this.score / 2);
    this.hud.updateScore(this.score);

    this.respawnTimer = window.setTimeout(() => {
      this.respawnTimer = null;
      if (this.lives > 0) {
        // 通過済みのチェックポイントがあればそこから。無ければ、ステージの開始地点から再開する
        if (this.player && this.stage) {
          const safePos: { x: number; y: number } = this.checkpoint
            ? { x: this.checkpoint.x, y: this.checkpoint.y + 0.3 }
            : STAGE_SPAWN;
          // タイムアップでのミスは、再開後すぐにまたタイムアップにならないよう時間を戻す
          if (this.timeLeft < RESPAWN_MIN_TIME) {
            this.timeLeft = RESPAWN_MIN_TIME;
            this.hud.updateTime(this.timeLeft);
          }
          this.player.reset(safePos.x, safePos.y, true);
          // 追ってきていた犬の大群はいったん消し、少し猶予をおいてからやり直す
          this.stage.resetHorde(4);
          // Snap camera immediately to respawn location to prevent camera disorientation
          this.camera.position.x = safePos.x;
          this.camera.position.y = Math.max(3.2, safePos.y + 2.0);
          this.hud.hideCenterBanner();
        }
      } else {
        // Game Over
        this.state = 'game_over';
        this.stateTimer = 0;
        this.sound.stopBgm();
        reportDeepAnalytics('progression_update', {
          result: 'gameover',
          maxStage: this.currentStage,
          deathReason: this.lastDeathCause || 'ライフ枯渇',
          maxCombo: this.maxComboSeen,
          enemiesDefeated: this.stompKills,
          itemsCollected: this.cassettesTaken,
          extraStats: { goldCassettes: this.goldTaken, livesLeft: this.lives, deaths: this.deathsByCause, score: this.score },
        });
        this.openResultScreen('gameover');
      }
    }, 1800);
  }

  private updateGameOver(dt: number, input: InputState): void {
    this.stateTimer += dt;
    this.handleResultInput(input);
  }

  // -------------------------------------------------------------
  // UTILITIES & FEEDBACK
  // -------------------------------------------------------------
  private triggerCameraShake(intensity: number = 0.25, duration: number = 0.25): void {
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, intensity);
    this.cameraShakeTimer = Math.max(this.cameraShakeTimer, duration);
  }

  private registerComboHit(): void {
    this.comboHits += 1;
    this.maxComboSeen = Math.max(this.maxComboSeen, this.comboHits);
    this.comboTimer = 2.2;
    if (this.comboHits >= 2) {
      this.hud.showCombo(this.comboHits);
      this.addScore(this.comboHits * 150);
    }
  }

  private addScore(pts: number): void {
    this.score += pts;
    this.hud.updateScore(this.score);
  }

  /**
   * 体を止める判定の共通処理。プレイヤーの位置と速度をその場で補正し、どの面に当たったかを返す。
   *  solid  : 上から着地('top') / 下から頭突き('bottom') / 横から押し戻し('side')
   *  oneWay : 上から着地('top')だけ。下や横からは通り抜ける
   */
  private resolveSolid(
    box: BoundingBox2D,
    kind: 'solid' | 'oneWay',
    minOverlapX: number = 0.02,
    minOverlapY: number = 0
  ): 'top' | 'bottom' | 'side' | null {
    const p = this.player;
    if (!p) return null;

    const bLeft = box.x;
    const bRight = box.x + box.w;
    const bBottom = box.y;
    const bTop = box.y + box.h;

    const pLeft = p.x - p.width / 2;
    const pRight = p.x + p.width / 2;
    const pBottom = p.y;
    const pTop = p.y + p.height;

    const overlapX = Math.min(pRight, bRight) - Math.max(pLeft, bLeft);
    const overlapY = Math.min(pTop, bTop) - Math.max(pBottom, bBottom);
    if (overlapX <= minOverlapX || overlapY <= minOverlapY) return null;

    const prevTop = p.prevY + p.height;
    const prevBottom = p.prevY;

    if (kind === 'oneWay') {
      if (p.vy <= 0 && prevBottom >= bTop - 0.38) {
        p.y = bTop;
        p.vy = 0;
        p.isGrounded = true;
        return 'top';
      }
      return null;
    }

    // 1. 下から頭突き
    if ((p.vy > 0 && prevTop <= bBottom + 0.38) || (overlapY < overlapX && p.vy > 0 && pBottom < bBottom)) {
      p.y = bBottom - p.height;
      p.vy = -1.5;
      return 'bottom';
    }
    // 2. 上から着地
    if ((p.vy <= 0 && prevBottom >= bTop - 0.38) || (overlapY < overlapX && p.vy <= 0 && pBottom >= bBottom + (bTop - bBottom) * 0.25)) {
      p.y = bTop;
      p.vy = 0;
      p.isGrounded = true;
      return 'top';
    }
    // 3. 横から押し戻し
    if (p.prevX < bLeft || (p.x < bLeft + box.w / 2 && overlapX < overlapY)) {
      p.x = bLeft - p.width / 2;
      p.vx = Math.min(0, p.vx);
    } else {
      p.x = bRight + p.width / 2;
      p.vx = Math.max(0, p.vx);
    }
    return 'side';
  }

  /** ブロックを下から叩いたときの効果(レンガは砕け、?ブロックはカセットを出す) */
  private onBlockHit(block: StageBlock): void {
    if (!this.stage) return;
    const hitResult = block.hit();

    if (hitResult.type === 'brick') {
      this.sound.playSmash();
      this.stage.particleSystem.spawnBrickDebris(block.x, block.y);
      this.stage.scene.remove(block.mesh);
      this.addScore(50);
      this.triggerCameraShake(0.12, 0.15);
    } else if (hitResult.type === 'question' && hitResult.spawnedItem) {
      if (hitResult.isGold) {
        // Spawn Gold Cassette popping out!
        this.sound.playPowerup();
        const gold = new CassetteTape(block.x, block.y + 1.2, true);
        this.stage.cassettes.push(gold);
        this.stage.scene.add(gold.mesh);
        this.stage.particleSystem.spawnSparkles(block.x, block.y + 1.2, 14, 0xffea00);
      } else {
        // Spawn Cassette Coin
        this.sound.playCoin();
        this.addScore(100);
        this.stage.particleSystem.spawnSparkles(block.x, block.y + 1.2, 8, 0x00f0ff);
      }
    }
  }

  private checkAABB(a: BoundingBox2D, b: BoundingBox2D): boolean {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
  }
}

// Instantiate game on load
window.addEventListener('DOMContentLoaded', () => {
  new StreetBBoyGame();
});
