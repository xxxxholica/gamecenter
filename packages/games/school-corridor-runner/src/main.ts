import * as THREE from 'three';
import { GameInputState, GameScore, GameState, LANE_COORDINATES, LaneIndex, ObstacleType } from './types';
import { InputManager } from './input/InputManager';
import { SoundSystem } from './audio/SoundSystem';
import { ParticleSystem } from './graphics/ParticleSystem';
import { FirstPersonArms } from './graphics/FirstPersonArms';
import { Corridor } from './world/Corridor';
import { Obstacle, ObstacleManager } from './world/ObstacleManager';
import { Player } from './entities/Player';
import { WordCard } from './entities/WordCard';
import { DictionaryBomb } from './entities/DictionaryBomb';
import { TeacherProjectile } from './entities/TeacherProjectile';
import { PowerUp } from './entities/PowerUp';
import { UIManager } from './ui/UIManager';
import { createSchoolGateNameplateTexture } from './graphics/Textures';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide, buttonIconHtml } from '../../../shared/arcadeGuide';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();

mountArcadeGuide({
  moveLabel: '移動',
  buttons: [{ indices: [0, 1, 2, 3], label: '攻撃(手裏剣/辞書ボム)' }],
  showHomeHint: true,
});

class Game {
  // Three.js
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock!: THREE.Clock;

  // システム
  private inputManager!: InputManager;
  private soundSystem!: SoundSystem;
  private particleSystem!: ParticleSystem;
  private uiManager!: UIManager;
  private fpArms!: FirstPersonArms;

  // 一人称クラッシュ（床倒れ込み）演出
  private isFallingDeath: boolean = false;
  private deathFallTimer: number = 0;

  // ゲーム世界
  private corridor!: Corridor;
  private obstacleManager!: ObstacleManager;
  private player!: Player;

  // 投擲武器リスト
  private wordCards: WordCard[] = [];
  private dictionaryBombs: DictionaryBomb[] = [];
  private teacherProjectiles: TeacherProjectile[] = [];

  // 無敵パワーアップ（1回のゲームで2回だけ出現）
  private powerUps: PowerUp[] = [];
  private readonly POWERUP_SPAWN_TIMES: readonly number[] = [28.0, 58.0]; // 経過秒数
  private powerUpSpawnIndex: number = 0;
  private powerUpClock: number = 0;
  private invincibleLight: THREE.PointLight | null = null;
  private wasInvincible: boolean = false;

  // ゲームステート
  private state: GameState = GameState.TITLE;
  private scoreData: GameScore = {
    score: 0,
    combo: 0,
    maxCombo: 0,
    distance: 0,
    destroyedCount: 0,
    dodgedSignsCount: 0,
    timeRemaining: 90.0,
    grade: 'C',
  };

  // 連続加速パラメータ（初速から大幅に急加速）
  private readonly START_SPEED: number = 25.0;  // 初速: 25 m/s (約 90 km/h)
  private readonly MAX_SPEED: number = 55.6;    // 最高速: 55.6 m/s (約 200 km/h)
  private currentSpeed: number = 25.0;

  // 速度大台到達（マイルストーン）演出用
  private speedMilestone150: boolean = false; // 150 km/h
  private speedMilestone200: boolean = false; // 200 km/h
  private speedMilestone250: boolean = false; // 250 km/h

  // 辞書ボムのストック管理
  private bombStock: number = 3;
  private bombReloadTimer: number = 0;
  private readonly BOMB_RELOAD_INTERVAL = 3.0; // 3秒で1冊リロード

  // カメラ追従とスクリーンシェイク
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;

  // スローモーション演出用
  private timeScale: number = 1.0;

  // カウントダウン演出用
  private isCountingDown: boolean = false;
  private countdownTimer: number = 0;
  private countdownStep: number = 0;

  // カウントダウン前「追われる」導入演出用
  private isPreChase: boolean = false;
  private preChaseTimer: number = 0;
  private chaseTeacherAnim: number = 0;
  private chaseTeacher: { group: THREE.Group; leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; crossArm: THREE.Mesh } | null = null;
  private readonly PRECHASE_DURATION = 2.0;
  private readonly PRECHASE_START_Z = -62; // 進行方向の廊下の奥（突き当たり側）
  private readonly PRECHASE_END_Z = -4.5;
  // ※ 廊下ジオメトリは z=0 より手前(正のZ)には存在しないため、カメラをこれ以上
  //   後方へ下げると視界端に廊下の外側（黒い余白）が見えてしまう。ごく僅かに留める。
  private readonly PRECHASE_CAM_START_Z = 1.6; // ワイドショット用にカメラを少し後方へ
  private readonly PRECHASE_FOV_START = 82; // 広角スタート（天井/床の外が見切れない安全範囲）→ 通常FOV(78)へズームイン

  // クリア（校門突破）演出用
  private isClearOutro: boolean = false;
  private clearOutroTimer: number = 0;
  private clearGate: THREE.Group | null = null;
  private clearGatePassed: boolean = false;
  private readonly CLEAR_OUTRO_DURATION = 2.8;
  private readonly CLEAR_GATE_DISTANCE = 42;

  // デモAI攻撃クールダウン
  private demoAttackTimer: number = 0;

  // デモ走行（アトラクトモード）の最大継続時間
  // ※ デモは死亡もタイムアップ判定も行わないため、上限がないと放置時に
  //   スコア・コンボが際限なく増加し続け、障害物のZ座標も無限にドリフトして
  //   長時間放置後に処理が重くなる原因になっていた。定期的に区切って
  //   startGame(true) でクリーンに再スタートさせることで解消する。
  private readonly DEMO_DURATION = 60.0;
  private demoElapsedTime: number = 0;

  constructor() {
    this.initEngine();
    this.setupEvents();
    this.uiManager.setGameState(GameState.TITLE);
    this.loop();
  }

  private initEngine(): void {
    const container = document.getElementById('canvas-container')!;
    this.clock = new THREE.Clock();

    this.scene = new THREE.Scene();

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(78, aspect, 0.05, 300);
    this.camera.position.set(0, 1.55, 0);
    this.scene.add(this.camera);

    this.fpArms = new FirstPersonArms();
    this.fpArms.group.visible = false;
    this.camera.add(this.fpArms.group);

    // 高解像度(Retina等)では描画解像度自体が高くギザギザが目立たないため、MSAA(antialias)は等倍の画面だけで使う。
    // 2倍解像度でのMSAAはGPU負荷が大きい割に見た目の差がほとんど無い
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    this.inputManager = new InputManager();
    this.soundSystem = new SoundSystem();
    this.particleSystem = new ParticleSystem(this.scene, this.camera);
    this.uiManager = new UIManager();

    this.corridor = new Corridor(this.scene);
    this.obstacleManager = new ObstacleManager(this.scene);
    // 先生の出席簿投擲コールバック登録
    this.obstacleManager.onTeacherAttack = (pos: THREE.Vector3) => {
      this.spawnTeacherProjectile(pos);
    };
    // 動的ギミック効果音コールバック登録
    this.obstacleManager.onPlaySound = (sound: 'cartRush' | 'lockerFall' | 'ballBounce' | 'polisherHum') => {
      switch (sound) {
        case 'cartRush':
          this.soundSystem.playCartRush();
          break;
        case 'lockerFall':
          this.soundSystem.playLockerFall();
          this.triggerScreenShake(0.8, 0.35);
          break;
        case 'ballBounce':
          this.soundSystem.playBallBounce();
          break;
        case 'polisherHum':
          this.soundSystem.playPolisherHum();
          break;
      }
    };

    this.player = new Player();
    this.scene.add(this.player.group);
  }

  private setupEvents(): void {
    window.addEventListener('resize', this.onResize);

    const btnStart = document.getElementById('btn-start');
    if (btnStart) {
      // 今押すボタンをアイコンで示す(いずれの攻撃ボタンでもスタートする)
      btnStart.innerHTML = `${buttonIconHtml([0, 1, 2, 3])} ${btnStart.textContent}`;
      btnStart.addEventListener('click', () => {
        this.startWithCountdown();
      });
    }

    const btnRetry = document.getElementById('btn-retry');
    if (btnRetry) {
      btnRetry.innerHTML = `${buttonIconHtml([0, 1, 2, 3])} ${btnRetry.textContent}`;
      btnRetry.addEventListener('click', () => {
        this.startWithCountdown();
      });
    }
  }

  private onResize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  /**
   * ゲーム開始エントリポイント。
   * ワールド・プレイヤー・スコアを完全リセットした上で、まず「先生に見つかって追われる」導入演出を再生し、
   * その演出が終わり次第カウントダウン（3, 2, 1, 走れ！）へと繋げる。
   */
  private startWithCountdown(): void {
    if (this.isCountingDown || this.isPreChase) return;
    this.soundSystem.unlock();

    // 1. ゲームステートを即時PLAYINGに設定
    this.state = GameState.PLAYING;
    this.isFallingDeath = false;
    this.deathFallTimer = 0;
    this.timeScale = 1.0;
    this.shakeIntensity = 0;
    this.shakeDuration = 0;

    // 2. プレイヤー・ワールド・障害物の初期位置を完全ロード
    // ※ 障害物・コインの事前スポーンはここでは行わない（カウントダウン直前のbeginCountdownSequence内で行う）。
    //   「追われる」導入演出中の廊下は先生が走り抜けるため、先に障害物を置くと先生が貫通してしまう。
    this.clearProjectiles();
    this.particleSystem.clearAll();
    this.corridor.reset();
    this.corridor.update(0, 0);
    this.obstacleManager.reset();
    this.player.reset();

    this.fpArms.group.visible = false;

    // 3. タイトルカードの四散フェードアウト
    this.uiManager.triggerTitleShatter();

    // 4. スコア・パラメータ初期化
    this.scoreData = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      distance: 0,
      destroyedCount: 0,
      dodgedSignsCount: 0,
      timeRemaining: 90.0,
      grade: 'C',
    };

    this.currentSpeed = this.START_SPEED;
    this.speedMilestone150 = false;
    this.speedMilestone200 = false;
    this.speedMilestone250 = false;
    this.bombStock = 3;
    this.bombReloadTimer = 0;

    // 5. HUDと入力のリセット
    this.uiManager.setGameState(GameState.PLAYING);
    this.inputManager.resetIdleTimer();
    this.soundSystem.stopBgm();

    // 6. カウントダウンより先に「追われる」導入演出を再生
    this.beginPreChase();
  }

  /**
   * カウントダウン前の「先生に見つかって追われる」導入演出を開始。
   * カメラは通常通り進行方向（廊下の奥＝実際に描画されている側）を向いたまま、
   * その廊下の突き当たりから先生が走ってくる姿を、ワイドショット→ドリーズームのカメラワークで捉える。
   */
  private beginPreChase(): void {
    this.isPreChase = true;
    this.preChaseTimer = 0;
    this.chaseTeacherAnim = 0;

    // 少し後方・広角のワイドショットから開始し、廊下の奥に小さく見える先生を捉える
    this.camera.position.set(0, 1.55, this.PRECHASE_CAM_START_Z);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 1.51, this.PRECHASE_CAM_START_Z - 25);
    this.camera.fov = this.PRECHASE_FOV_START;
    this.camera.updateProjectionMatrix();

    // 先生は進行方向の廊下の奥（反対側の突き当たり）から登場し、こちらへ向かって疾走してくる
    const teacher = this.obstacleManager.createChaseTeacherPreview();
    teacher.group.position.set(0, 0, this.PRECHASE_START_Z);
    this.scene.add(teacher.group);
    this.chaseTeacher = teacher;

    this.uiManager.triggerChaseWarning();
    this.soundSystem.playCaughtAlarm();
    this.triggerScreenShake(0.4, 0.25);
  }

  /**
   * 「追われる」導入演出の毎フレーム更新（先生が接近するアニメーションとカメラワーク）
   */
  private updatePreChase(dt: number): void {
    this.preChaseTimer += dt;
    const t = Math.min(1.0, this.preChaseTimer / this.PRECHASE_DURATION);
    const ease = t * t; // 加速的に接近・押し込む

    if (this.chaseTeacher) {
      // 走ってくる脚の振り
      this.chaseTeacherAnim += dt * 12;
      this.chaseTeacher.leftLeg.rotation.x = Math.sin(this.chaseTeacherAnim) * 0.6;
      this.chaseTeacher.rightLeg.rotation.x = -Math.sin(this.chaseTeacherAnim) * 0.6;

      // 竹刀を振りかざす威嚇モーション
      this.chaseTeacher.crossArm.rotation.x = -Math.abs(Math.sin(this.chaseTeacherAnim * 0.5)) * 0.9;

      // 廊下の奥から間近まで加速的に接近
      this.chaseTeacher.group.position.z =
        this.PRECHASE_START_Z + ease * (this.PRECHASE_END_Z - this.PRECHASE_START_Z);

      // 足音に合わせた小刻みなシェイク
      if (Math.floor(this.chaseTeacherAnim / Math.PI) % 2 === 0) {
        this.triggerScreenShake(0.1 + t * 0.3, 0.12);
      }
    }

    this.corridor.update(this.player.group.position.z, dt);
    this.particleSystem.update(dt, this.player.group.position.z, 0);

    // カメラワーク: 広角のワイドショットから、迫る先生へ向かってドリー＆ズームインで押し込む
    const camZ = this.PRECHASE_CAM_START_Z + ease * (0 - this.PRECHASE_CAM_START_Z);
    const fov = this.PRECHASE_FOV_START + ease * (78 - this.PRECHASE_FOV_START);

    this.camera.position.set(0, 1.55, camZ);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 1.51, camZ - 25);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.y += (Math.random() - 0.5) * this.shakeIntensity;
      this.camera.position.z += (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= Math.pow(0.05, dt);
    }

    if (this.preChaseTimer >= this.PRECHASE_DURATION) {
      this.endPreChase();
    }
  }

  /**
   * 追走演出の終了処理。先生のプレビューを片付け、カウントダウンへ切り替える
   */
  private endPreChase(): void {
    this.isPreChase = false;

    if (this.chaseTeacher) {
      this.scene.remove(this.chaseTeacher.group);
      this.chaseTeacher = null;
    }

    this.uiManager.hideChaseWarning();
    this.uiManager.triggerWhiteFlash();
    this.triggerScreenShake(1.0, 0.3);
    this.soundSystem.playEscapeDash();

    this.beginCountdownSequence();
  }

  /**
   * カウントダウン開始（最初の位置を完全ロード ＆ 3, 2, 1, 走れ！）
   */
  private beginCountdownSequence(): void {
    this.isCountingDown = true;
    this.countdownTimer = 0;
    this.countdownStep = 0;

    // ★前方の障害物・コイン・ギミックを即座に事前スポーン＆ロード
    // （カウントダウン開始時に前方の視界がすでに準備できているようにするため。
    //   「追われる」導入演出が終わった直後＝先生が廊下からいなくなった後に行うことで貫通を防ぐ）
    this.obstacleManager.update(0, this.START_SPEED, 0);

    // カメラ位置・姿勢を最初のスタート位置（X:0, Y:1.55, Z:0 正面向き）に即座にロード
    this.camera.position.set(0, 1.55, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 1.51, -25);
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();

    // 手元アーム初期化・表示（最初の構え位置にセット）
    this.fpArms.reset();
    this.fpArms.group.visible = true;
    this.fpArms.update(0, 0, 0, false, false, this.bombStock);

    // 最初の位置で初期描画を実行（事前ロードされた障害物・コインが視界に描画される）
    this.renderer.render(this.scene, this.camera);
  }

  private updateCountdown(dt: number): void {
    this.countdownTimer += dt;
    this.corridor.update(0, dt);
    this.player.update(dt, 15, false); // その場でスタート構え
    this.particleSystem.update(dt, 0, 0);
    this.fpArms.update(dt, 0, 0, false, false, this.bombStock);
    this.updateCamera(dt);

    // ★カウントダウン中も前方の障害物やコインのアニメーション（自転・浮遊・パトロール）をリアルタイム更新！
    this.obstacleManager.update(0, this.START_SPEED, dt);

    if (this.countdownStep === 0 && this.countdownTimer >= 0.45) {
      this.countdownStep = 1;
      this.uiManager.showCountdown('3');
      this.soundSystem.playCountdownBeep(false);
    } else if (this.countdownStep === 1 && this.countdownTimer >= 0.95) {
      this.countdownStep = 2;
      this.uiManager.showCountdown('2');
      this.soundSystem.playCountdownBeep(false);
    } else if (this.countdownStep === 2 && this.countdownTimer >= 1.45) {
      this.countdownStep = 3;
      this.uiManager.showCountdown('1');
      this.soundSystem.playCountdownBeep(false);
    } else if (this.countdownStep === 3 && this.countdownTimer >= 1.95) {
      this.countdownStep = 4;
      this.uiManager.showCountdown('走れ！');
      this.soundSystem.playCountdownBeep(true);
      this.uiManager.triggerWhiteFlash();
      this.triggerScreenShake(0.8, 0.4);
      this.soundSystem.startBgm();
      this.soundSystem.setSpeedFactor(1.0);
    } else if (this.countdownStep === 4 && this.countdownTimer >= 2.4) {
      this.isCountingDown = false;
      this.uiManager.hideCountdown();
      this.state = GameState.PLAYING;
    }
  }

  /**
   * ゲーム開始（デモ走行または直接開始）
   */
  private startGame(isDemo: boolean): void {
    this.state = isDemo ? GameState.DEMO : GameState.PLAYING;
    this.scoreData = {
      score: 0,
      combo: 0,
      maxCombo: 0,
      distance: 0,
      destroyedCount: 0,
      dodgedSignsCount: 0,
      timeRemaining: 90.0,
      grade: 'C',
    };

    this.currentSpeed = this.START_SPEED;
    this.speedMilestone150 = false;
    this.speedMilestone200 = false;
    this.speedMilestone250 = false;
    this.bombStock = 3;
    this.bombReloadTimer = 0;
    this.shakeIntensity = 0;
    this.timeScale = 1.0;
    this.isFallingDeath = false;
    this.deathFallTimer = 0;
    this.demoElapsedTime = 0;
    this.demoAttackTimer = 0;

    this.clearProjectiles();
    this.particleSystem.clearAll();
    this.corridor.reset();
    this.corridor.update(0, 0);
    this.obstacleManager.reset();
    this.player.reset();
    this.obstacleManager.update(0, this.START_SPEED, 0);

    // カメラ位置・姿勢を最初のスタート位置に初期化
    this.camera.position.set(0, 1.55, 0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 1.51, -25);
    this.camera.fov = 78;
    this.camera.updateProjectionMatrix();

    // 手元アーム初期化・表示
    this.fpArms.reset();
    this.fpArms.group.visible = true;
    this.fpArms.update(0, 0, 0, false, false, 3);

    this.uiManager.setGameState(this.state);
    this.inputManager.resetIdleTimer();

    if (!isDemo) {
      this.soundSystem.startBgm();
      this.soundSystem.setSpeedFactor(1.0);
    } else {
      this.soundSystem.stopBgm();
    }
  }

  private clearProjectiles(): void {
    for (const card of this.wordCards) {
      this.scene.remove(card.mesh);
    }
    this.wordCards = [];

    for (const bomb of this.dictionaryBombs) {
      this.scene.remove(bomb.mesh);
    }
    this.dictionaryBombs = [];

    for (const proj of this.teacherProjectiles) {
      this.scene.remove(proj.mesh);
    }
    this.teacherProjectiles = [];

    this.clearPowerUps();
    this.powerUpSpawnIndex = 0;
    this.powerUpClock = 0;
    if (this.invincibleLight) {
      this.scene.remove(this.invincibleLight);
      this.invincibleLight = null;
    }
    this.wasInvincible = false;

    this.isClearOutro = false;
    this.clearOutroTimer = 0;
    this.clearGatePassed = false;
    if (this.clearGate) {
      this.scene.remove(this.clearGate);
      this.clearGate = null;
    }
  }

  private clearPowerUps(): void {
    for (const p of this.powerUps) {
      p.dispose(this.scene);
    }
    this.powerUps = [];
  }

  /**
   * 指定のレーン・Z座標付近が、既存の障害物やゴールドコインと重なっていないか判定
   */
  private isPowerUpSpotClear(lane: LaneIndex, z: number): boolean {
    const clearance = 4.0; // 前後方向の安全マージン
    const laneX = LANE_COORDINATES[lane];

    for (const obs of this.obstacleManager.getObstacles()) {
      if (obs.isDestroyed) continue;
      if (Math.abs(obs.z - z) >= clearance) continue;

      // 全レーン封鎖ギミック（ジャンプ/スライド/爆破強制エリア）はレーンに関係なく常にブロック
      if (
        obs.type === ObstacleType.GIMMICK_JUMP ||
        obs.type === ObstacleType.GIMMICK_SLIDE ||
        obs.type === ObstacleType.GIMMICK_BOMB
      ) {
        return false;
      }

      const obsX = obs.group.position.x;
      if (Math.abs(obsX - laneX) < 1.6) {
        return false;
      }
    }

    for (const coin of this.obstacleManager.getCoins()) {
      if (coin.isCollected) continue;
      if (coin.lane === lane && Math.abs(coin.mesh.position.z - z) < clearance) {
        return false;
      }
    }

    return true;
  }

  /**
   * 無敵パワーアップ（青き稲妻オーラ）を前方のスポーン。
   * 他の障害物・ゴールドコインと重ならない空いたレーン/位置を探して配置する
   */
  private spawnPowerUp(): void {
    const baseZ = this.player.group.position.z - 85;

    let chosenLane: LaneIndex = 1;
    let chosenZ = baseZ;
    let found = false;

    for (let attempt = 0; attempt < 6 && !found; attempt++) {
      const z = baseZ - attempt * 6; // 空きが見つからなければ少しずつ奥へずらす
      const laneOrder = ([0, 1, 2] as LaneIndex[]).sort(() => Math.random() - 0.5);
      for (const lane of laneOrder) {
        if (this.isPowerUpSpotClear(lane, z)) {
          chosenLane = lane;
          chosenZ = z;
          found = true;
          break;
        }
      }
    }

    if (!found) {
      // 万一すべて埋まっていた場合は、十分に距離を離した安全な位置へ配置
      chosenLane = 1;
      chosenZ = baseZ - 40;
    }

    const powerUp = new PowerUp(LANE_COORDINATES[chosenLane], 1.3, chosenZ, chosenLane);
    this.scene.add(powerUp.mesh);
    this.powerUps.push(powerUp);
  }

  /**
   * メインループ
   */
  private loop = (): void => {
    requestAnimationFrame(this.loop);

    const rawDelta = Math.min(this.clock.getDelta(), 0.08);
    const dt = rawDelta * this.timeScale;

    const input = this.inputManager.update(rawDelta);

    this.checkAttractMode(input);

    // カウントダウン前「追われる」導入演出の実行中
    if (this.isPreChase) {
      this.updatePreChase(rawDelta);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // カウントダウンシーケンス実行中
    if (this.isCountingDown) {
      this.updateCountdown(rawDelta);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    switch (this.state) {
      case GameState.TITLE:
        this.updateTitle(rawDelta, input);
        break;

      case GameState.DEMO:
        this.updateDemo(dt, input);
        break;

      case GameState.PLAYING:
        this.updatePlaying(dt, input);
        break;

      case GameState.GAMEOVER:
      case GameState.CLEARED:
        this.updateResult(rawDelta, input);
        break;
    }

    this.updateCamera(rawDelta);
    this.renderer.render(this.scene, this.camera);
  };

  private checkAttractMode(_input: GameInputState): void {
    const idleSeconds = this.inputManager.getIdleTimeSeconds();

    if (this.state === GameState.TITLE && idleSeconds >= 10.0) {
      this.startGame(true);
    }

    if ((this.state === GameState.GAMEOVER || this.state === GameState.CLEARED) && idleSeconds >= 10.0) {
      this.state = GameState.TITLE;
      this.uiManager.setGameState(GameState.TITLE);
      this.inputManager.resetIdleTimer();
    }
  }

  private titleScrollZ: number = 0;

  private updateTitle(_dt: number, input: GameInputState): void {
    this.fpArms.group.visible = false;
    // タイトル画面中も背後の廊下がゆったり奥へとスクロール（夕暮れの廊下ステージを背景に美しく見せる）
    this.titleScrollZ -= 8 * _dt;
    this.corridor.update(this.titleScrollZ, _dt);
    this.camera.position.set(0, 1.8, this.titleScrollZ + 4.0);
    this.camera.rotation.set(0, 0, 0);
    this.camera.lookAt(0, 1.4, this.titleScrollZ - 20);

    if (input.startOrRetry || input.attack || input.shootShuriken || input.throwBomb || input.jump) {
      this.startWithCountdown();
    }
  }

  private updateResult(dt: number, input: GameInputState): void {
    this.fpArms.group.visible = false;
    // リザルト画面中も散乱した破片やパーティクルの物理運動・ステージ光を更新
    this.particleSystem.update(dt, this.player.group.position.z, 0);
    this.corridor.update(this.player.group.position.z, dt);

    if (input.startOrRetry || input.attack || input.shootShuriken || input.throwBomb || input.jump) {
      this.startWithCountdown();
    }
  }

  /**
   * 通常プレイ更新
   */
  private updatePlaying(dt: number, input: GameInputState): void {
    // クリア（校門突破）演出中: 校門を抜けて走り去るカットシーン
    if (this.isClearOutro) {
      this.updateClearOutro(dt);
      return;
    }

    // 激突・床倒れ込みシーケンス中（カメラが床へ倒れ込み、スローモーションで減速）
    if (this.isFallingDeath) {
      this.deathFallTimer += dt;
      this.currentSpeed = Math.max(0, this.currentSpeed - 60 * dt);
      const moveZ = -this.currentSpeed * dt;
      this.player.group.position.z += moveZ;

      this.corridor.update(this.player.group.position.z, dt);
      this.obstacleManager.update(this.player.group.position.z, this.currentSpeed, dt);
      this.updateProjectiles(dt);
      this.particleSystem.update(dt, this.player.group.position.z, 0.2);
      this.fpArms.update(dt, 0, 0, false, false, 0);

      if (this.deathFallTimer >= 0.75) {
        this.isFallingDeath = false;
        this.finishGame(GameState.GAMEOVER);
      }
      return;
    }

    // 1. タイムカウントダウン (90秒)
    this.scoreData.timeRemaining -= dt;
    const elapsedTime = 90.0 - this.scoreData.timeRemaining;

    // 1.5 無敵パワーアップの出現判定（1回のゲームで必ず2回だけ出現）
    if (
      this.powerUpSpawnIndex < this.POWERUP_SPAWN_TIMES.length &&
      elapsedTime >= this.POWERUP_SPAWN_TIMES[this.powerUpSpawnIndex]
    ) {
      this.spawnPowerUp();
      this.powerUpSpawnIndex++;
    }

    // 2. 連続加速計算（初速32m/sから最高速78m/sまで大幅かつ滑らかに加速）
    const t = Math.min(1.0, Math.max(0.0, elapsedTime / 90.0));
    // 進行割合カーブ: 前半から小気味よく加速し、後半は加速度的に猛スピード化
    const speedCurve = 0.55 * t + 0.45 * (t * t);
    this.currentSpeed = this.START_SPEED + (this.MAX_SPEED - this.START_SPEED) * speedCurve;

    // 節目（150km/h, 200km/h, 250km/h）での加速警報音 & 画面シェイク
    const speedKmh = this.currentSpeed * 3.6;
    if (!this.speedMilestone150 && speedKmh >= 150) {
      this.speedMilestone150 = true;
      this.soundSystem.playSpeedUp();
      this.triggerScreenShake(0.6, 0.35);
    }
    if (!this.speedMilestone200 && speedKmh >= 200) {
      this.speedMilestone200 = true;
      this.soundSystem.playSpeedUp();
      this.triggerScreenShake(0.8, 0.45);
    }
    if (!this.speedMilestone250 && speedKmh >= 250) {
      this.speedMilestone250 = true;
      this.soundSystem.playSpeedUp();
      this.triggerScreenShake(1.0, 0.55);
    }

    this.soundSystem.setSpeedFactor(this.currentSpeed / this.START_SPEED);

    // 3. タイムアップ判定 (90秒完走 = 校門突破・脱出成功！)
    if (this.scoreData.timeRemaining <= 0) {
      this.scoreData.timeRemaining = 0;
      this.beginClearOutro();
      return;
    }

    // 4. プレイヤー入力処理
    // レーン移動（地上でも空中でも可能）
    if (input.laneLeft) {
      if (this.player.moveLeft()) {
        this.soundSystem.playStep();
      }
    }
    if (input.laneRight) {
      if (this.player.moveRight()) {
        this.soundSystem.playStep();
      }
    }

    // ジャンプアクション
    if (input.jump) {
      if (this.player.jump()) {
        this.soundSystem.playJump();
      }
    }

    // スライディング音
    if (input.slide && !this.player.isSliding && !this.player.isJumping) {
      this.soundSystem.playSlide();
    }

    // 5. 統合投擲攻撃（Enter / ボタン1：手裏剣・辞書ボムをランダム発射）
    if (input.attack || input.shootShuriken || input.throwBomb) {
      this.performRandomAttack();
    }

    // 8. プレイヤー前進 & 走行距離・スコア加算
    const moveZ = -this.currentSpeed * dt;
    this.player.group.position.z += moveZ;
    this.scoreData.distance += Math.abs(moveZ);

    const comboMultiplier = 1.0 + Math.min(5.0, this.scoreData.combo * 0.1);
    this.scoreData.score += this.currentSpeed * 4 * comboMultiplier * dt;

    // プレイヤー更新
    this.player.update(dt, this.currentSpeed, input.slide);

    if (this.player.isSliding) {
      this.particleSystem.spawnSlideParticles(this.player.group.position);
    }

    // 9. ワールド＆障害物更新
    this.corridor.update(this.player.group.position.z, dt);
    this.obstacleManager.update(this.player.group.position.z, this.currentSpeed, dt);

    // 9.5 無敵パワーアップの更新 ＆ 通過済みクリーンアップ
    this.powerUpClock += dt;
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.update(dt, this.powerUpClock);
      if (p.mesh.position.z > this.player.group.position.z + 15 || p.isGone()) {
        p.dispose(this.scene);
        this.powerUps.splice(i, 1);
      }
    }

    // 10. 武器更新 & 衝突判定
    this.updateProjectiles(dt);
    this.checkCollisions();

    // 10.5 無敵状態の演出更新（青い追従ライト・オーラトレイル・HUDタイマー）
    this.updateInvincibleEffects();

    // 11. パーティクル更新
    const speedRatio = this.currentSpeed / this.START_SPEED;
    this.particleSystem.update(dt, this.player.group.position.z, speedRatio);

    // 12. 手元アーム更新（ハンドボブ、スライディング、ジャンプ浮遊）
    this.fpArms.update(
      dt,
      this.player.runCycle,
      this.currentSpeed,
      this.player.isSliding,
      this.player.isJumping,
      this.bombStock
    );

    // 13. HUD更新
    const reloadProgress = this.bombStock < 3 ? this.bombReloadTimer / this.BOMB_RELOAD_INTERVAL : 1.0;
    this.uiManager.updateHUD(
      this.scoreData.score,
      this.scoreData.combo,
      this.scoreData.timeRemaining,
      speedKmh,
      this.bombStock,
      reloadProgress
    );
  }

  /**
   * デモ走行（アトラクトモード）の更新：極限精度の神AI操縦
   */
  private updateDemo(dt: number, input: GameInputState): void {
    // デモ走行中に何らかの入力があった場合は、そのままゲーム開始はせずタイトル画面へ戻す
    if (input.anyKey || input.startOrRetry || input.attack || input.shootShuriken || input.throwBomb || input.jump) {
      this.state = GameState.TITLE;
      this.uiManager.setGameState(GameState.TITLE);
      this.inputManager.resetIdleTimer();
      return;
    }

    // デモは死亡・タイムアップ判定が無いため、一定時間で必ずクリーンに再スタートする
    // （放置時のスコア・コンボ無限増加、障害物Zドリフトの蓄積による重量化を防止）
    this.demoElapsedTime += dt;
    if (this.demoElapsedTime >= this.DEMO_DURATION) {
      this.startGame(true);
      return;
    }

    this.demoAttackTimer -= dt;

    const playerZ = this.player.group.position.z;
    const playerX = this.player.currentX;
    const currentLane = this.player.lane;

    // 前方 45m 以内の未破壊障害物を Z降順（手前から奥）で取得
    const upcoming = this.obstacleManager.getObstacles()
      .filter(o => !o.isDestroyed && o.z < playerZ && o.z > playerZ - 48)
      .sort((a, b) => b.z - a.z);

    let aiSlide = false;
    let needAttack = false;

    // ----------------------------------------------------
    // 1. 各レーンの危険度 ＆ 魅力度評価（神AIレーンナビゲーション）
    // ----------------------------------------------------
    const laneScores = [0, 0, 0]; // 低いほど安全かつ取りたいレーン

    // 1-1. 障害物による危険度ペナルティ
    for (const obs of upcoming) {
      const dist = playerZ - obs.z;
      if (dist <= 0 || dist > 42) continue;

      const weight = Math.max(1, (42 - dist) / 5);

      if (obs.type === ObstacleType.TEACHER) {
        // 先生は絶対に破壊不可！先生の現在X座標に近いレーンは超危険
        const tX = obs.group.position.x;
        for (let l = 0; l < 3; l++) {
          const lX = (l - 1) * 3;
          const distToTeacher = Math.abs(lX - tX);
          if (distToTeacher < 2.0) {
            laneScores[l] += 600 * weight; // 先生の真正面は絶対回避
          } else if (distToTeacher < 3.5) {
            laneScores[l] += 200 * weight;
          }
        }
      } else if (obs.type === ObstacleType.WET_FLOOR_CONE) {
        // 立入禁止コーン＆水拭き床: 破壊不能・飛び越え不能（完全迂回必須！）
        laneScores[obs.lane] += 550 * weight;
      } else if (
        obs.type === ObstacleType.GIMMICK_JUMP ||
        obs.type === ObstacleType.GIMMICK_SLIDE ||
        obs.type === ObstacleType.GIMMICK_BOMB
      ) {
        // 全レーン共通ギミック
      } else {
        // 特定レーンの通常障害物
        const obsLane = obs.lane;
        if (obsLane >= 0 && obsLane < 3) {
          laneScores[obsLane] += 40 * weight;
        }
      }
    }

    // 1-2. ゴールドコイン（高得点アイテム）による魅力度ボーナス（マイナス点＝超優先）
    const upcomingCoins = this.obstacleManager.getCoins()
      .filter(c => !c.isCollected && c.mesh.position.z < playerZ && c.mesh.position.z > playerZ - 38);

    for (const coin of upcomingCoins) {
      const dist = playerZ - coin.mesh.position.z;
      const coinWeight = Math.max(1, (38 - dist) / 4);
      laneScores[coin.lane] -= 90 * coinWeight; // コインのあるレーンへ強く引き寄せる！
    }

    // ----------------------------------------------------
    // 2. 最適レーンへのスラローム移動判定（神AI）
    // ----------------------------------------------------
    let bestLane = currentLane;
    let lowestScore = laneScores[currentLane];

    for (let l = 0; l < 3; l++) {
      if (laneScores[l] < lowestScore - 25) { // 25pt以上の明確なメリット・回避理由があれば即座に移動
        lowestScore = laneScores[l];
        bestLane = l as LaneIndex;
      }
    }

    // 先生が近接している場合の強制退避
    const nearTeacher = upcoming.find(o => o.type === ObstacleType.TEACHER && (playerZ - o.z) < 32);
    if (nearTeacher) {
      const tX = nearTeacher.group.position.x;
      if (Math.abs(tX - playerX) < 2.2) {
        if (bestLane === currentLane) {
          bestLane = (currentLane === 1 ? (tX > 0 ? 0 : 2) : 1) as LaneIndex;
        }
      }
    }

    // 立入禁止コーンが近接している場合の強制退避
    const nearCone = upcoming.find(o => o.type === ObstacleType.WET_FLOOR_CONE && o.lane === currentLane && (playerZ - o.z) < 28);
    if (nearCone) {
      const safeLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== currentLane);
      bestLane = safeLanes.sort((a, b) => laneScores[a] - laneScores[b])[0];
    }

    // レーン移動の実行
    if (bestLane < currentLane) {
      this.player.moveLeft();
    } else if (bestLane > currentLane) {
      this.player.moveRight();
    }

    // ----------------------------------------------------
    // 3. 飛来する出席簿（飛び道具）の確実迎撃 ＆ 回避
    // ----------------------------------------------------
    for (const proj of this.teacherProjectiles) {
      if (proj.isDead) continue;
      const distZ = playerZ - proj.mesh.position.z;
      if (distZ > 0 && distZ < 30) {
        const diffX = Math.abs(proj.mesh.position.x - playerX);
        if (diffX < 2.0) {
          // 正面から飛来：即座に迎撃連射！
          needAttack = true;
          // 至近距離（12m未満）なら緊急サイドステップ
          if (distZ < 12) {
            if (currentLane === 1) {
              if (laneScores[0] <= laneScores[2]) this.player.moveLeft();
              else this.player.moveRight();
            } else if (currentLane === 0) {
              this.player.moveRight();
            } else {
              this.player.moveLeft();
            }
          }
        }
      }
    }

    // ----------------------------------------------------
    // 4. 全障害物・ギミックへの精密アクション（ジャンプ・スライド・撃破）
    // ----------------------------------------------------
    for (const obs of upcoming) {
      const dist = playerZ - obs.z;
      if (dist <= 0) continue;

      const isSameLane = obs.lane === currentLane || Math.abs(obs.group.position.x - playerX) < 1.8;

      // 4-1. 看板くぐり抜け（通過完了までスライディングを確実に維持）
      if (obs.type === ObstacleType.HANGING_SIGN && isSameLane) {
        if (dist < 22 && dist > -1.5) {
          aiSlide = true;
        }
      }

      // 4-2. 全レーン封鎖スライディング（低シャッター/横断幕）
      if (obs.type === ObstacleType.GIMMICK_SLIDE) {
        if (dist < 24 && dist > -1.5) {
          aiSlide = true;
        }
      }

      // 4-3. 全レーン封鎖ジャンプ（跳び箱/低障害物）
      if (obs.type === ObstacleType.GIMMICK_JUMP) {
        if (dist < 15 && dist > 3.0 && !this.player.isJumping) {
          this.player.jump();
        }
      }

      // 4-4. 全レーン封鎖バリケード（巨大ダンボール壁）
      if (obs.type === ObstacleType.GIMMICK_BOMB) {
        if (dist < 32 && dist > 1.0) {
          needAttack = true;
        }
      }

      // 4-5. 暴走配膳台（超高速突進）
      if (obs.type === ObstacleType.CHARGING_CART) {
        if (isSameLane) {
          if (dist < 35) {
            needAttack = true;
            // 接近したら安全な隣レーンへスマートにサイドステップ
            if (dist < 20) {
              if (currentLane === 1) {
                if (laneScores[0] <= laneScores[2]) this.player.moveLeft();
                else this.player.moveRight();
              } else if (currentLane === 0) {
                this.player.moveRight();
              } else {
                this.player.moveLeft();
              }
            }
          }
        }
      }

      // 4-6. 倒壊ロッカー
      if (obs.type === ObstacleType.FALLING_LOCKER && isSameLane) {
        if (dist < 28) {
          needAttack = true; // 倒れる前に攻撃で粉砕
          if (dist < 16 && !this.player.isJumping) {
            this.player.jump(); // 倒れた場合は華麗に跳び越える
          }
        }
      }

      // 4-7. バウンドボール ＆ 清掃ポリッシャー（横移動ギミック）
      if (
        (obs.type === ObstacleType.BOUNCING_BALL || obs.type === ObstacleType.SWEEPING_POLISHER) &&
        dist < 32
      ) {
        // 自機とのX距離が縮まってきたら積極迎撃
        if (Math.abs(obs.group.position.x - playerX) < 2.4) {
          needAttack = true;
        }
      }

      // 4-8. 机・椅子、ロッカー・跳び箱（通常障害物）
      if (
        (obs.type === ObstacleType.DESK_CHAIR || obs.type === ObstacleType.LOCKER_VAULT) &&
        isSameLane &&
        dist < 30
      ) {
        if (obs.type === ObstacleType.DESK_CHAIR && dist < 14 && dist > 3.0 && !this.player.isJumping) {
          // 机・椅子は華麗に跳び越えて空中アイテムを回収！
          if (Math.random() < 0.5) {
            this.player.jump();
          } else {
            needAttack = true;
          }
        } else {
          needAttack = true;
        }
      }
    }

    // ----------------------------------------------------
    // 5. 攻撃の実行（神速テンポ連射）
    // ----------------------------------------------------
    if (needAttack && this.demoAttackTimer <= 0) {
      this.performRandomAttack();
      this.demoAttackTimer = 0.14; // クールダウン0.14秒でリズミカルに連射
    }

    this.currentSpeed = 32.0;
    const moveZ = -this.currentSpeed * dt;
    this.player.group.position.z += moveZ;
    this.player.update(dt, this.currentSpeed, aiSlide);

    if (aiSlide) {
      this.particleSystem.spawnSlideParticles(this.player.group.position);
    }

    this.corridor.update(this.player.group.position.z, dt);
    this.obstacleManager.update(this.player.group.position.z, this.currentSpeed, dt);
    this.updateProjectiles(dt);
    this.checkCollisions();
    this.particleSystem.update(dt, this.player.group.position.z, 1.0);

    // デモ走行中の手元アーム更新
    this.fpArms.update(
      dt,
      this.player.runCycle,
      this.currentSpeed,
      aiSlide,
      this.player.isJumping,
      this.bombStock
    );

    if (this.bombStock < 3) {
      this.bombReloadTimer += dt;
      if (this.bombReloadTimer >= this.BOMB_RELOAD_INTERVAL) {
        this.bombStock++;
        this.bombReloadTimer = 0;
      }
    }

    this.uiManager.updateHUD(
      this.scoreData.score,
      this.scoreData.combo,
      90.0,
      this.currentSpeed * 3.6,
      this.bombStock,
      1.0
    );
  }

  /**
   * 統合投擲攻撃：手裏剣または辞書ボムをランダムで射出
   */
  private performRandomAttack(): void {
    if (Math.random() < 0.5) {
      this.spawnShuriken();
    } else {
      this.spawnBomb();
    }
  }

  private spawnShuriken(): void {
    const spawnPos = new THREE.Vector3(
      this.camera.position.x + 0.28,
      this.camera.position.y - 0.18,
      this.camera.position.z - 0.65
    );
    const card = new WordCard(spawnPos, this.currentSpeed);
    this.scene.add(card.mesh);
    this.wordCards.push(card);
    this.soundSystem.playShuriken();
    this.fpArms.triggerShuriken();
  }

  private spawnBomb(): void {
    const spawnPos = new THREE.Vector3(
      this.camera.position.x + 0.15,
      this.camera.position.y - 0.05,
      this.camera.position.z - 0.85
    );
    const bomb = new DictionaryBomb(spawnPos, this.currentSpeed);
    this.scene.add(bomb.mesh);
    this.dictionaryBombs.push(bomb);
    this.soundSystem.playBombThrow();
    this.fpArms.triggerBombThrow(1);
  }

  private spawnTeacherProjectile(pos: THREE.Vector3): void {
    const proj = new TeacherProjectile(pos);
    this.scene.add(proj.mesh);
    this.teacherProjectiles.push(proj);
    this.soundSystem.playTeacherAttack();
  }

  private updateProjectiles(dt: number): void {
    for (let i = this.wordCards.length - 1; i >= 0; i--) {
      const card = this.wordCards[i];
      card.update(dt);
      this.particleSystem.spawnShurikenTrail(card.mesh.position);

      if (card.isDead) {
        this.scene.remove(card.mesh);
        this.wordCards.splice(i, 1);
      }
    }

    for (let i = this.dictionaryBombs.length - 1; i >= 0; i--) {
      const bomb = this.dictionaryBombs[i];
      const exploded = bomb.update(dt);
      this.particleSystem.spawnBombTrail(bomb.mesh.position);

      if (exploded || bomb.isExploded) {
        this.triggerBombExplosion(bomb.mesh.position, bomb.blastRadius);
        this.scene.remove(bomb.mesh);
        this.dictionaryBombs.splice(i, 1);
      }
    }

    // 先生の出席簿（飛び道具）
    const playerZ = this.player.group.position.z;
    for (let i = this.teacherProjectiles.length - 1; i >= 0; i--) {
      const proj = this.teacherProjectiles[i];
      proj.update(dt, playerZ);

      if (proj.isDead) {
        this.scene.remove(proj.mesh);
        this.teacherProjectiles.splice(i, 1);
      }
    }
  }

  /**
   * 百科事典ボム爆発（画面フラッシュではなく、着弾地点を大爆発させる）
   */
  private triggerBombExplosion(blastCenter: THREE.Vector3, radius: number): void {
    this.triggerScreenShake(1.25, 0.55);
    this.soundSystem.playHugeExplosion();
    this.particleSystem.spawnBombExplosion(blastCenter, this.camera.position);

    const obstacles = this.obstacleManager.getObstacles();
    let hitAny = false;

    for (const obs of obstacles) {
      if (obs.isDestroyed) continue;

      const obsPos = obs.group.position;
      const dist = obsPos.distanceTo(blastCenter);

      // 強制バリケードまたは通常障害物
      if (dist <= radius || (obs.type === ObstacleType.GIMMICK_BOMB && Math.abs(obs.z - blastCenter.z) < 5.0)) {
        if (
          obs.type === ObstacleType.TEACHER ||
          obs.type === ObstacleType.WET_FLOOR_CONE ||
          obs.type === ObstacleType.GIMMICK_SLIDE ||
          obs.type === ObstacleType.GIMMICK_JUMP ||
          obs.type === ObstacleType.HANGING_SIGN
        ) {
          continue; // 先生、コーン、スライディング強制、看板、ジャンプ強制は爆風で破壊不可！
        }

        this.destroyObstacle(obs, true);
        hitAny = true;
      }
    }

    // 先生の出席簿も爆風で吹き飛ばす
    for (let i = this.teacherProjectiles.length - 1; i >= 0; i--) {
      const proj = this.teacherProjectiles[i];
      if (proj.mesh.position.distanceTo(blastCenter) <= radius) {
        proj.isDead = true;
        this.particleSystem.spawnDeskBreak(proj.mesh.position);
        this.scene.remove(proj.mesh);
        this.teacherProjectiles.splice(i, 1);
        hitAny = true;
      }
    }

    if (hitAny) {
      this.addCombo();
    }
  }

  private destroyObstacle(obs: Obstacle, isBomb: boolean, forced: boolean = false): void {
    if (obs.isDestroyed) return;

    // スライディング強制エリアや先生は通常時は破壊不可
    // （無敵パワーアップ中の forced=true の場合は例外なく破壊できる）
    if (
      !forced &&
      (
        obs.type === ObstacleType.TEACHER ||
        obs.type === ObstacleType.GIMMICK_SLIDE ||
        obs.type === ObstacleType.GIMMICK_JUMP ||
        obs.type === ObstacleType.HANGING_SIGN
      )
    ) {
      return;
    }

    // 物理崩壊エフェクト（全構成パーツが分解して床にガラガラと崩れ落ちる！）
    this.particleSystem.spawnObstacleCrumble(obs.group, isBomb || forced);

    if (forced && obs.type === ObstacleType.TEACHER) {
      // 無敵状態でのみ許される、生活指導の先生への突撃粉砕（爽快な特大ボーナス！）
      this.soundSystem.playLockerBreak();
      this.particleSystem.spawnLockerBreak(obs.group.position);
      this.scoreData.score += 1500 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (forced && obs.type === ObstacleType.WET_FLOOR_CONE) {
      this.soundSystem.playDeskBreak();
      this.particleSystem.spawnDeskBreak(obs.group.position);
      this.scoreData.score += 350 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (forced && obs.type === ObstacleType.HANGING_SIGN) {
      this.soundSystem.playDeskBreak();
      this.particleSystem.spawnDeskBreak(obs.group.position);
      this.scoreData.score += 500 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (forced && (obs.type === ObstacleType.GIMMICK_JUMP || obs.type === ObstacleType.GIMMICK_SLIDE)) {
      this.soundSystem.playLockerBreak();
      this.particleSystem.spawnLockerBreak(obs.group.position);
      this.scoreData.score += 700 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (obs.type === ObstacleType.DESK_CHAIR) {
      this.soundSystem.playDeskBreak();
      this.particleSystem.spawnDeskBreak(obs.group.position);
      this.scoreData.score += 250 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (obs.type === ObstacleType.LOCKER_VAULT || obs.type === ObstacleType.GIMMICK_BOMB) {
      this.soundSystem.playLockerBreak();
      this.particleSystem.spawnLockerBreak(obs.group.position);
      this.scoreData.score += 800 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (obs.type === ObstacleType.CHARGING_CART) {
      // 暴走配膳台をボムで粉砕（高得点！）
      this.soundSystem.playLockerBreak();
      this.particleSystem.spawnBombExplosion(obs.group.position, this.camera.position);
      this.scoreData.score += 1200 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (obs.type === ObstacleType.FALLING_LOCKER) {
      this.soundSystem.playLockerBreak();
      this.particleSystem.spawnLockerBreak(obs.group.position);
      this.scoreData.score += 800 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (obs.type === ObstacleType.BOUNCING_BALL) {
      this.soundSystem.playDeskBreak();
      this.particleSystem.spawnDeskBreak(obs.group.position);
      this.scoreData.score += 400 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    } else if (obs.type === ObstacleType.SWEEPING_POLISHER) {
      this.soundSystem.playLockerBreak();
      this.particleSystem.spawnDeskBreak(obs.group.position);
      this.scoreData.score += 500 * (1 + this.scoreData.combo * 0.1);
      this.scoreData.destroyedCount++;
    }

    this.obstacleManager.removeObstacle(obs);
  }

  /**
   * 衝突判定システム
   * 【一撃死の厳格化】接触した瞬間に即座にゲーム終了
   */
  private checkCollisions(): void {
    const playerBox = this.player.getBoundingBox();

    // 0. ゴールドコイン（高得点アイテム）の回収判定
    const coins = this.obstacleManager.getCoins();
    for (const coin of coins) {
      if (coin.isCollected) continue;
      if (playerBox.intersectsBox(coin.boundingBox)) {
        this.obstacleManager.removeCoin(coin);
        this.addCombo();
        const baseCoinScore = 1000;
        const totalCoinScore = Math.floor(baseCoinScore * (1 + this.scoreData.combo * 0.15));
        this.scoreData.score += totalCoinScore;
        this.soundSystem.playCoin(this.scoreData.combo);
        this.uiManager.triggerScorePop();
        this.particleSystem.spawnCoinBlurEffect(coin.mesh.position);
      }
    }

    const obstacles = this.obstacleManager.getObstacles();

    for (const obs of obstacles) {
      if (obs.isDestroyed) continue;

      const obsBox = obs.boundingBox;

      // 1. 単語帳シュリケン vs 障害物
      for (const card of this.wordCards) {
        if (card.isDead) continue;
        if (card.boundingBox.intersectsBox(obsBox)) {
          card.isDead = true;

          if (
            obs.type === ObstacleType.DESK_CHAIR ||
            obs.type === ObstacleType.LOCKER_VAULT ||
            obs.type === ObstacleType.CHARGING_CART ||
            obs.type === ObstacleType.GIMMICK_BOMB ||
            obs.type === ObstacleType.FALLING_LOCKER ||
            obs.type === ObstacleType.BOUNCING_BALL ||
            obs.type === ObstacleType.SWEEPING_POLISHER
          ) {
            this.destroyObstacle(obs, false);
            this.addCombo();
          } else {
            // 先生、看板、ジャンプ/スライド専用ギミック等には弾かれる
            this.particleSystem.spawnDeskBreak(card.mesh.position);
          }
          break;
        }
      }

      // 2. 百科事典ボム直撃
      for (const bomb of this.dictionaryBombs) {
        if (bomb.isExploded) continue;
        if (bomb.boundingBox.intersectsBox(obsBox)) {
          bomb.isExploded = true;
          break;
        }
      }

      // 3. 看板くぐり抜け判定
      if (obs.type === ObstacleType.HANGING_SIGN && !obs.hasDodged) {
        if (this.player.group.position.z < obs.z && this.player.lane === obs.lane) {
          if (this.player.isSliding) {
            obs.hasDodged = true;
            this.scoreData.score += 500 * (1 + this.scoreData.combo * 0.1);
            this.scoreData.dodgedSignsCount++;
            this.soundSystem.playSignDodge();
            this.addCombo();
          }
        }
      }

      // 4. 強制ギミック通過判定
      // 4-1. ジャンプ強制エリア: 飛び越えたか？
      if (obs.type === ObstacleType.GIMMICK_JUMP && !obs.hasDodged) {
        if (this.player.group.position.z < obs.z) {
          if (this.player.posY >= 0.95) {
            // ジャンプで跳び越え成功！
            obs.hasDodged = true;
            this.scoreData.score += 600 * (1 + this.scoreData.combo * 0.1);
            this.soundSystem.playSignDodge();
            this.addCombo();
          }
        }
      }

      // 4-2. スライディング強制エリア: 潜り抜けたか？
      if (obs.type === ObstacleType.GIMMICK_SLIDE && !obs.hasDodged) {
        if (this.player.group.position.z < obs.z) {
          if (this.player.isSliding) {
            obs.hasDodged = true;
            this.scoreData.score += 600 * (1 + this.scoreData.combo * 0.1);
            this.soundSystem.playSignDodge();
            this.addCombo();
          }
        }
      }

      // 5. プレイヤー vs 障害物の衝突（【一撃死】）
      // ジャンプ強制エリアで十分高く飛んでいる場合は衝突判定をスキップ
      if (obs.type === ObstacleType.GIMMICK_JUMP && this.player.posY >= 0.95) {
        continue;
      }
      // スライディング強制エリアでスライディングしていれば衝突スキップ
      if (obs.type === ObstacleType.GIMMICK_SLIDE && this.player.isSliding) {
        continue;
      }
      // 看板でスライディングしていれば衝突スキップ
      if (obs.type === ObstacleType.HANGING_SIGN && this.player.isSliding) {
        continue;
      }
      // 倒壊ロッカー: 倒れた後はジャンプで跳び越え可能！
      if (obs.type === ObstacleType.FALLING_LOCKER && (obs.isFallen || (obs.fallAngle ?? 0) >= Math.PI / 2)) {
        if (this.player.posY >= 0.75) {
          if (!obs.hasDodged && this.player.group.position.z < obs.z) {
            obs.hasDodged = true;
            this.scoreData.score += 500 * (1 + this.scoreData.combo * 0.1);
            this.soundSystem.playSignDodge();
            this.addCombo();
          }
          continue;
        }
      }
      // バウンドボール: ボールが上空に浮いている時はスライディングで下をくぐり抜け可能！
      if (obs.type === ObstacleType.BOUNCING_BALL && (obs.ballY ?? 0) >= 1.2 && this.player.isSliding) {
        if (!obs.hasDodged && this.player.group.position.z < obs.z) {
          obs.hasDodged = true;
          this.scoreData.score += 400 * (1 + this.scoreData.combo * 0.1);
          this.soundSystem.playSignDodge();
          this.addCombo();
        }
        continue;
      }

      if (playerBox.intersectsBox(obsBox)) {
        if (this.player.isInvincible) {
          // 無敵パワーアップ中：例外なく、触れただけで粉砕！
          this.destroyObstacle(obs, false, true);
          this.addCombo();
          continue;
        }
        this.triggerFatalDeath(obs);
        break;
      }
    }

    // 6. 単語帳シュリケン vs 先生の出席簿（相殺撃ち落とし）
    for (const card of this.wordCards) {
      if (card.isDead) continue;
      for (const proj of this.teacherProjectiles) {
        if (proj.isDead) continue;
        if (card.boundingBox.intersectsBox(proj.boundingBox)) {
          card.isDead = true;
          proj.isDead = true;
          this.soundSystem.playDeskBreak();
          this.particleSystem.spawnDeskBreak(proj.mesh.position);
          this.scoreData.score += 300 * (1 + this.scoreData.combo * 0.1);
          this.addCombo();
          break;
        }
      }
    }

    // 7. 先生の出席簿 vs プレイヤー（直撃・即死）
    for (const proj of this.teacherProjectiles) {
      if (proj.isDead) continue;
      if (playerBox.intersectsBox(proj.boundingBox)) {
        proj.isDead = true;
        this.scene.remove(proj.mesh);

        if (this.player.isInvincible) {
          // 無敵パワーアップ中：出席簿すら触れただけで粉砕！
          this.addCombo();
          this.soundSystem.playDeskBreak();
          this.particleSystem.spawnDeskBreak(proj.mesh.position);
          continue;
        }

        this.triggerFatalDeath();
        return;
      }
    }

    // 8. 無敵パワーアップ（青き稲妻オーラ）の獲得判定
    for (const p of this.powerUps) {
      if (p.isCollected) continue;
      if (playerBox.intersectsBox(p.boundingBox)) {
        p.isCollected = true;
        this.player.triggerInvincible(10.0);
        this.soundSystem.playPowerUpCollect();
        this.uiManager.triggerInvincibleStart();
        this.particleSystem.spawnPowerUpBurst(p.mesh.position);
        this.triggerScreenShake(0.6, 0.35);
      }
    }
  }

  /**
   * 【一撃死（即死ゲームオーバー）】
   * 障害物や敵攻撃に一度でも接触した瞬間、スローモーション爆散＋激しい揺れとともに手元が吹き飛び床へ倒れ込む
   */
  private triggerFatalDeath(obs?: Obstacle): void {
    if (this.state === GameState.DEMO) {
      this.player.triggerInvincible(1.2);
      return;
    }

    if (this.state !== GameState.PLAYING || this.isFallingDeath) return;

    // 1. スローモーション効果
    this.timeScale = 0.25;
    this.isFallingDeath = true;
    this.deathFallTimer = 0;

    // 2. 致命的激突音
    this.soundSystem.playFatalCrash();

    // 3. 画面の激しい揺れ ＆ 赤色フラッシュ
    this.triggerScreenShake(2.5, 0.9);
    this.uiManager.triggerRedFlash();

    // 4. 手元アームが吹き飛ぶ
    this.fpArms.triggerCrash();

    // 5. 主人公の文房具・教科書・ノート激突散乱エフェクト
    this.particleSystem.spawnPlayerShatter(this.camera.position, this.player.group);
    this.player.setVisible(false);

    // 6. 障害物も粉砕（破壊不可な障害物はそのまま）
    if (
      obs &&
      obs.type !== ObstacleType.TEACHER &&
      obs.type !== ObstacleType.WET_FLOOR_CONE &&
      obs.type !== ObstacleType.GIMMICK_SLIDE &&
      obs.type !== ObstacleType.GIMMICK_JUMP &&
      obs.type !== ObstacleType.HANGING_SIGN
    ) {
      this.destroyObstacle(obs, false);
    }
  }

  /**
   * 無敵パワーアップ状態の演出更新
   * 青い追従ポイントライト・オーラトレイル・HUDカウントダウンを管理し、
   * 状態終了の瞬間にバナー・ビネットを片付けてパワーダウン音を鳴らす
   */
  private updateInvincibleEffects(): void {
    const isInvincible = this.player.isInvincible;

    if (isInvincible) {
      if (!this.invincibleLight) {
        this.invincibleLight = new THREE.PointLight(0x2979ff, 4, 13, 2);
        this.scene.add(this.invincibleLight);
      }
      this.invincibleLight.position.set(
        this.player.group.position.x,
        1.4 + this.player.posY,
        this.player.group.position.z
      );
      this.invincibleLight.intensity = 4.0 + Math.sin(this.powerUpClock * 10) * 1.2;

      this.particleSystem.spawnInvincibleTrail(this.player.group.position);
      this.uiManager.updateInvincibleTimer(this.player.getInvincibleRemaining());
    } else if (this.wasInvincible) {
      if (this.invincibleLight) {
        this.scene.remove(this.invincibleLight);
        this.invincibleLight = null;
      }
      this.uiManager.triggerInvincibleEnd();
      this.soundSystem.playInvincibleEnd();
    }

    this.wasInvincible = isInvincible;
  }

  private addCombo(): void {
    this.scoreData.combo++;
    if (this.scoreData.combo > this.scoreData.maxCombo) {
      this.scoreData.maxCombo = this.scoreData.combo;
    }
    this.soundSystem.playCombo(this.scoreData.combo);
    this.uiManager.triggerScorePop();
  }

  private triggerScreenShake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = Math.max(this.shakeDuration, duration);
  }

  /**
   * 一人称カメラ更新（目線高さ、レーン移動追従、ジャンプ・スライド、ヘッドボブ、バンク角、倒れ込み）
   */
  private updateCamera(dt: number): void {
    // 激突床倒れ込み演出（Y: 0.22m付近へ落下、ロール・ピッチが傾いて床に横倒し・仰向けになる）
    if (this.isFallingDeath) {
      this.deathFallTimer += dt;
      const p = Math.min(1.0, this.deathFallTimer / 0.7);
      const fallEase = 1 - Math.pow(1 - p, 3);

      const targetX = this.player.group.position.x;
      const targetZ = this.player.group.position.z;
      this.camera.position.x = targetX;
      this.camera.position.z = targetZ;
      this.camera.position.y = THREE.MathUtils.lerp(1.55, 0.22, fallEase);

      // 床に頭を打って横倒しになる姿勢（ピッチ上向き + ロール大傾き）
      const fallPitch = THREE.MathUtils.lerp(-0.04, 0.42, fallEase);
      const fallRoll = THREE.MathUtils.lerp(0, 1.15, fallEase);
      const fallYaw = THREE.MathUtils.lerp(0, 0.35, fallEase);

      this.camera.rotation.set(fallPitch, fallYaw, fallRoll, 'YXZ');
      return;
    }

    if (this.state === GameState.TITLE && !this.isCountingDown) {
      return;
    }

    if (this.state === GameState.GAMEOVER && !this.isCountingDown) {
      return;
    }

    const pPos = this.player.group.position;

    // 1. 目線高さ計算:
    // 通常: 1.55
    // ジャンプ: 2.5付近 (Player.posYは最大約1.7〜1.8) -> 1.55 + posY * 0.58 ≒ 2.55
    // スライディング: 0.65付近
    let targetY = 1.55;
    if (this.player.isSliding) {
      targetY = 0.65;
    } else if (this.player.isJumping) {
      targetY = 1.55 + this.player.posY * 0.58;
    } else {
      // 歩行ヘッドボブ（走行テンポに応じた微小な上下揺れ）
      const bobIntensity = Math.min(1.0, this.currentSpeed / 35.0);
      const headBobY = Math.sin(this.player.runCycle * 2) * 0.03 * bobIntensity;
      targetY = 1.55 + headBobY;
    }

    // 2. レーン移動（X軸）:
    const targetX = pPos.x;
    const targetZ = pPos.z;

    const prevCamX = this.camera.position.x;
    this.camera.position.x += (targetX - this.camera.position.x) * Math.min(1.0, dt * 24);
    this.camera.position.y += (targetY - this.camera.position.y) * Math.min(1.0, dt * 18);
    this.camera.position.z = targetZ;

    // 3. 視野角 (FOV): 78〜84度に設定し、廊下の両壁や蛍光灯が後方に流れるスピード感を強調
    const speedRatio = Math.max(0, (this.currentSpeed - this.START_SPEED) / (this.MAX_SPEED - this.START_SPEED));
    const targetFov = 78 + speedRatio * 6.0;
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1.0, dt * 6);
    this.camera.updateProjectionMatrix();

    // 4. レーン移動時のバンク角（ロール傾き）
    const velX = (this.camera.position.x - prevCamX) / Math.max(0.001, dt);
    const bankRoll = -THREE.MathUtils.clamp(velX * 0.012, -0.1, 0.1);

    // 視線の先（前方の廊下消失点）
    const lookTargetY = this.camera.position.y - 0.04;
    this.camera.lookAt(this.camera.position.x * 0.85, lookTargetY, this.camera.position.z - 25);
    this.camera.rotation.z += bankRoll;

    // 5. スクリーンシェイク（爆発・激突時の揺れ）
    if (this.shakeDuration > 0) {
      this.shakeDuration -= dt;
      const offsetX = (Math.random() - 0.5) * this.shakeIntensity;
      const offsetY = (Math.random() - 0.5) * this.shakeIntensity;
      const offsetZ = (Math.random() - 0.5) * this.shakeIntensity;

      this.camera.position.x += offsetX;
      this.camera.position.y += offsetY;
      this.camera.position.z += offsetZ;

      this.shakeIntensity *= Math.pow(0.05, dt);
    }
  }

  /**
   * クリア演出用の校門オブジェクトを生成（石の門柱・開いた鉄扉・ネームプレート・灯り）
   */
  private createSchoolGate(): THREE.Group {
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x6d6f6b, roughness: 0.85 });
    const capMat = new THREE.MeshStandardMaterial({ color: 0x4a4c49, roughness: 0.8 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.4 });
    const lampGlassMat = new THREE.MeshStandardMaterial({
      color: 0xfff3c4,
      emissive: 0xffdd88,
      emissiveIntensity: 1.4,
    });
    const nameplateTex = createSchoolGateNameplateTexture();
    const nameplateMat = new THREE.MeshStandardMaterial({ map: nameplateTex, roughness: 0.6 });

    const pillarPositions = [-4.6, 4.6];
    for (const px of pillarPositions) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.6, 0.9), stoneMat);
      pillar.position.set(px, 1.8, 0);
      group.add(pillar);

      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.25, 1.1), capMat);
      cap.position.set(px, 3.72, 0);
      group.add(cap);

      // ネームプレート（正面のみ）
      const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.5), nameplateMat);
      plate.position.set(px, 1.9, 0.46);
      group.add(plate);

      // 門灯
      const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.15, 8), capMat);
      lampBase.position.set(px, 3.95, 0);
      group.add(lampBase);
      const lampGlass = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), lampGlassMat);
      lampGlass.position.set(px, 4.18, 0);
      group.add(lampGlass);
      const lampLight = new THREE.PointLight(0xffdd88, 2.0, 10);
      lampLight.position.set(px, 4.18, 0);
      group.add(lampLight);
    }

    // 左右へ開いた鉄扉（走り抜けやすいよう完全に開いた状態で配置）
    const gateLeafGeo = new THREE.BoxGeometry(1.7, 3.0, 0.06);
    const leftLeaf = new THREE.Mesh(gateLeafGeo, ironMat);
    leftLeaf.position.set(-4.15, 1.6, -1.65);
    leftLeaf.rotation.y = Math.PI / 2.1;
    group.add(leftLeaf);

    const rightLeaf = new THREE.Mesh(gateLeafGeo, ironMat);
    rightLeaf.position.set(4.15, 1.6, -1.65);
    rightLeaf.rotation.y = -Math.PI / 2.1;
    group.add(rightLeaf);

    return group;
  }

  /**
   * クリア（校門突破）演出の開始。
   * 残存する障害物を一掃して安全なまっすぐな廊下を作り、少し先に校門を配置。
   * プレイヤーはラストスパートでそのまま校門を駆け抜け、演出後にリザルト画面へ。
   */
  private beginClearOutro(): void {
    // 残っている障害物・コイン・飛び道具を一掃し、安全に校門まで走り抜けられるようにする
    // ※ clearProjectiles() は isClearOutro フラグ自体もリセットしてしまうため、必ず先に呼ぶこと
    this.obstacleManager.reset();
    this.clearProjectiles();

    this.isClearOutro = true;
    this.clearOutroTimer = 0;
    this.clearGatePassed = false;

    const gateZ = this.player.group.position.z - this.CLEAR_GATE_DISTANCE;
    this.clearGate = this.createSchoolGate();
    this.clearGate.position.set(0, 0, gateZ);
    this.scene.add(this.clearGate);

    this.soundSystem.playClearFanfare();
  }

  /**
   * クリア演出の毎フレーム更新（ラストスパートで校門を駆け抜け、外の光へ抜け出る）
   */
  private updateClearOutro(dt: number): void {
    this.clearOutroTimer += dt;

    // 最後の力を振り絞ってのラストスプリント
    this.currentSpeed = Math.min(this.MAX_SPEED * 1.15, this.currentSpeed + 30 * dt);
    const moveZ = -this.currentSpeed * dt;
    this.player.group.position.z += moveZ;
    this.scoreData.distance += Math.abs(moveZ);

    this.player.update(dt, this.currentSpeed, false);
    this.corridor.update(this.player.group.position.z, dt);
    this.particleSystem.update(dt, this.player.group.position.z, this.currentSpeed / this.START_SPEED);
    this.fpArms.update(dt, this.player.runCycle, this.currentSpeed, false, false, this.bombStock);

    // 校門を通過した瞬間、閉塞した廊下の夕焼けフォグから、抜け出た先の眩しい光へ切り替える
    if (this.clearGate && !this.clearGatePassed && this.player.group.position.z < this.clearGate.position.z) {
      this.clearGatePassed = true;
      this.uiManager.triggerWhiteFlash();
      this.triggerScreenShake(0.7, 0.45);
      if (this.scene.fog instanceof THREE.FogExp2) {
        this.scene.fog.color.setHex(0xfff3d6);
        this.scene.fog.density = 0.007;
      }
    }

    this.uiManager.updateHUD(
      this.scoreData.score,
      this.scoreData.combo,
      0,
      this.currentSpeed * 3.6,
      this.bombStock,
      1.0
    );

    if (this.clearOutroTimer >= this.CLEAR_OUTRO_DURATION) {
      this.isClearOutro = false;
      if (this.clearGate) {
        this.scene.remove(this.clearGate);
        this.clearGate = null;
      }
      this.finishGame(GameState.CLEARED);
    }
  }

  /**
   * ゲーム終了（即死 / クリア）
   */
  private finishGame(state: GameState): void {
    this.state = state;
    this.soundSystem.stopBgm();
    this.fpArms.group.visible = false;

    const score = this.scoreData.score;
    let grade = 'C';
    if (score >= 250000) {
      grade = 'SSS';
    } else if (score >= 180000) {
      grade = 'SS';
    } else if (score >= 120000) {
      grade = 'S';
    } else if (score >= 70000) {
      grade = 'A';
    } else if (score >= 35000) {
      grade = 'B';
    }
    this.scoreData.grade = grade;

    this.uiManager.setGameState(state, this.scoreData);
    this.inputManager.resetIdleTimer();
  }
}

// 起動
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
