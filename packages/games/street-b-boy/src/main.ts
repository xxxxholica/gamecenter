import * as THREE from 'three';
import { InputManager, InputState } from './engine/input';
import { SoundManager } from './engine/audio';
import { Player, BoundingBox2D } from './entities/player';
import { Stage } from './world/stage';
import { BoomboxModel } from './world/boombox';
import { HudManager } from './ui/hud';
import { CassetteTape } from './entities/objects';
import { TextureGenerator } from './world/textures';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide, buttonIconHtml } from '../../../shared/arcadeGuide';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();

mountArcadeGuide({
  moveLabel: '移動',
  buttons: [
    { indices: [0], label: 'ジャンプ' },
    { indices: [1, 2], label: 'スピン攻撃' },
  ],
  showHomeHint: true,
});

type GameState = 'title' | 'attract_demo' | 'attract_ranking' | 'playing' | 'game_over' | 'clear';

class StreetBBoyGame {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  private input: InputManager;
  private sound: SoundManager;
  private hud: HudManager;

  private stage: Stage | null = null;
  private player: Player | null = null;

  // Title Scene specific entities
  private titleGroup: THREE.Group | null = null;
  private titleBoombox: BoomboxModel | null = null;
  private titleDancer: Player | null = null;

  private state: GameState = 'title';
  private stateTimer: number = 0;

  // Gameplay metrics
  private currentStage: number = 1;
  private score: number = 0;
  private timeLeft: number = 99;
  private lives: number = 3;

  // Camera Shake & Combo System
  private cameraShakeTimer: number = 0;
  private cameraShakeIntensity: number = 0;
  private comboHits: number = 0;
  private comboTimer: number = 0;
  private lastGrindSoundTime: number = 0;

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

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070c);
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.018);

    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 300);

    this.input = new InputManager();
    this.sound = new SoundManager();
    this.hud = new HudManager();

    this.setupEventListeners();
    this.setupTitleScene();

    window.addEventListener('resize', this.onResize);

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

    const btnRestart = document.getElementById('btn-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.sound.init();
        this.startGame();
      });
    }

    // Ranking screen click to play
    const rankingOverlay = document.getElementById('ranking-overlay');
    if (rankingOverlay) {
      rankingOverlay.addEventListener('click', () => {
        this.sound.init();
        this.startGame();
      });
    }

    // Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        window.location.href = '../../';
      }
    });
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
    this.hud.showTitle(true);
    this.hud.showRanking(false);
    this.hud.showDemoBanner(false);
    this.hud.hideCenterBanner();
    this.hud.hideResult();
    this.hud.setInvincibleBorder(false);

    this.titleGroup = new THREE.Group();
    this.scene.add(this.titleGroup);

    // Title lighting
    const titleAmbient = new THREE.AmbientLight(0x223355, 2.0);
    const titleSpot = new THREE.SpotLight(0xffea00, 8.0, 30, Math.PI / 3, 0.4);
    titleSpot.position.set(0, 10, 8);
    titleSpot.target.position.set(0, 1, 0);
    this.titleGroup.add(titleAmbient, titleSpot, titleSpot.target);

    // Brick Wall with Graffiti behind
    const wallGeo = new THREE.BoxGeometry(24, 12, 0.6);
    const wallMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getBrickWallWithGraffiti('STREET B-BOY'),
      roughness: 0.7
    });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.set(0, 5, -3);
    this.titleGroup.add(wall);

    // Asphalt Ground
    const groundGeo = new THREE.BoxGeometry(28, 2, 14);
    const groundMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getAsphaltRoadTexture(),
      roughness: 0.8
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.set(0, -1, 0);
    ground.receiveShadow = true;
    this.titleGroup.add(ground);

    // Giant Rotating Boombox in Center
    this.titleBoombox = new BoomboxModel(1.4);
    this.titleBoombox.mesh.position.set(0, 1.8, -0.6);
    this.titleGroup.add(this.titleBoombox.mesh);

    // Red-Hat B-Boy Stepping to the Beat in front
    this.titleDancer = new Player();
    this.titleDancer.x = 0;
    this.titleDancer.y = 0;
    this.titleDancer.mesh.position.set(0, 0, 1.8);
    this.titleDancer.isGrounded = true;
    this.titleGroup.add(this.titleDancer.mesh);

    // Title Camera position
    this.camera.position.set(0, 2.5, 7.5);
    this.camera.lookAt(0, 1.5, 0);

    this.input.resetIdleTimer();
  }

  // -------------------------------------------------------------
  // GAMEPLAY INITIALIZATION
  // -------------------------------------------------------------
  private startGame(isDemo: boolean = false): void {
    if (this.titleGroup) {
      this.scene.remove(this.titleGroup);
      this.titleGroup = null;
      this.titleBoombox = null;
      this.titleDancer = null;
    }

    this.cleanupGameplay();

    this.currentStage = 1;
    this.score = 0;
    this.timeLeft = this.getStageInitialTime(this.currentStage);
    this.lives = 3;
    this.hud.updateScore(this.score);
    this.hud.updateStage(this.currentStage);
    this.hud.updateTime(this.timeLeft);
    this.hud.updateLives(this.lives);

    this.stage = new Stage(this.scene, this.currentStage);
    this.player = new Player();
    this.player.reset(1.5, 0.5);
    this.scene.add(this.player.mesh);

    this.hud.showTitle(false);
    this.hud.showRanking(false);
    this.hud.hideResult();

    if (isDemo) {
      this.state = 'attract_demo';
      this.hud.showDemoBanner(true);
      this.hud.hideCenterBanner();
    } else {
      this.state = 'playing';
      this.hud.showDemoBanner(false);
      this.hud.showCenterBanner('ready', `STAGE ${this.currentStage} READY`);
      window.setTimeout(() => {
        if (this.state === 'playing') this.hud.hideCenterBanner();
      }, 1400);
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
    this.sound.setGoldMode(false);
  }

  private advanceToNextStage(): void {
    if (this.currentStage >= 4) return;
    this.currentStage++;

    if (this.stage) {
      this.stage.dispose();
      this.stage = null;
    }

    this.timeLeft = this.getStageInitialTime(this.currentStage);
    this.hud.updateStage(this.currentStage);
    this.hud.updateTime(this.timeLeft);

    this.stage = new Stage(this.scene, this.currentStage);
    if (this.player) {
      this.player.reset(1.5, 0.5);
    }

    this.state = 'playing';
    this.stateTimer = 0;
    this.hud.showCenterBanner('ready', `STAGE ${this.currentStage} READY`);
    window.setTimeout(() => {
      if (this.state === 'playing') this.hud.hideCenterBanner();
    }, 1400);

    this.sound.startBgm();
    this.sound.setGoldMode(false);
  }

  private getStageInitialTime(stage: number): number {
    switch (stage) {
      case 1: return 75;
      case 2: return 70;
      case 3: return 65;
      case 4: return 60;
      default: return 75;
    }
  }

  // -------------------------------------------------------------
  // MAIN LOOP
  // -------------------------------------------------------------
  private gameLoop = (timestamp: number): void => {
    requestAnimationFrame(this.gameLoop);

    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05); // Cap delta time for stable physics
    this.lastTime = timestamp;

    const inputState = this.input.update();

    // 1. Check Attract Mode Trigger (12s idle on Title or Result)
    if (this.state === 'title' && this.input.getIdleDurationSeconds() >= 12) {
      this.startGame(true); // Enter Attract Demo!
      return;
    }

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

    this.renderer.render(this.scene, this.camera);
  };

  // -------------------------------------------------------------
  // TITLE UPDATE
  // -------------------------------------------------------------
  private updateTitle(dt: number, time: number, input: InputState): void {
    this.stateTimer += dt;

    if (this.titleBoombox) {
      this.titleBoombox.update(time * 0.001);
      this.titleBoombox.mesh.rotation.y = Math.sin(this.stateTimer * 0.4) * 0.25;
    }

    if (this.titleDancer) {
      const dummyInput: InputState = {
        left: false, right: false, down: false, jump: false,
        jumpPressed: false, jumpReleased: false, spinPressed: false,
        startPressed: false, anyActionPressed: false, lastInputTime: 0
      };
      this.titleDancer.update(dt, dummyInput);
    }

    // Camera gentle dynamic pan
    this.camera.position.x = Math.sin(this.stateTimer * 0.3) * 1.5;
    this.camera.position.y = 2.4 + Math.cos(this.stateTimer * 0.25) * 0.3;
    this.camera.lookAt(0, 1.4, 0);

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
    // Time countdown
    this.timeLeft -= dt;
    this.hud.updateTime(this.timeLeft);

    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.hud.showCenterBanner('timeup');
      this.sound.playHurt();
      this.handlePlayerDeath();
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

    // Spin attack trigger
    if (input.spinPressed && this.player.triggerSpin()) {
      this.sound.playSpin();
      this.stage.particleSystem.spawnShockwave(this.player.x, this.player.y);
      this.triggerCameraShake(0.15, 0.15);
    }

    // Update player movement & physics
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
      this.handlePlayerDeath();
      return;
    }

    // Platform Collisions (Full Solid AABB: Top landing, Bottom ceiling headbutt, Left/Right side walls)
    let groundedThisFrame = false;

    for (const plat of this.stage.platforms) {
      const platLeft = plat.x;
      const platRight = plat.x + plat.w;
      const platTop = plat.y;
      const platBottom = plat.y - plat.h;

      const pLeft = this.player.x - this.player.width / 2;
      const pRight = this.player.x + this.player.width / 2;
      const pBottom = this.player.y;
      const pTop = this.player.y + this.player.height;

      const overlapX = Math.min(pRight, platRight) - Math.max(pLeft, platLeft);
      const overlapY = Math.min(pTop, platTop) - Math.max(pBottom, platBottom);

      if (overlapX > 0.02 && overlapY > 0) {
        const prevTop = this.player.prevY + this.player.height;
        const prevBottom = this.player.prevY;

        // 1. Headbutt / Ceiling: Jumping from underneath the platform
        if ((this.player.vy > 0 && prevTop <= platBottom + 0.38) || (overlapY < overlapX && this.player.vy > 0 && pBottom < platBottom)) {
          this.player.y = platBottom - this.player.height;
          this.player.vy = -1.5;
          this.sound.playSmash();
          this.triggerCameraShake(0.08, 0.1);
        }
        // 2. Landing on top of platform from above
        else if ((this.player.vy <= 0 && prevBottom >= platTop - 0.38) || (overlapY < overlapX && this.player.vy <= 0 && pBottom >= platBottom + (platTop - platBottom) * 0.25)) {
          this.player.y = platTop;
          this.player.vy = 0;
          this.player.isGrounded = true;
          groundedThisFrame = true;
        }
        // 3. Side collision: Running or jumping into platform walls / stairs
        else {
          if (this.player.prevX < plat.x || (this.player.x < plat.x + plat.w / 2 && overlapX < overlapY)) {
            this.player.x = platLeft - this.player.width / 2;
            this.player.vx = Math.min(0, this.player.vx);
          } else {
            this.player.x = platRight + this.player.width / 2;
            this.player.vx = Math.max(0, this.player.vx);
          }
        }
      }
    }

    // Moving Gondola Platforms (Full Solid AABB: Top landing & carry, Bottom headbutt, Side collision)
    for (const mp of this.stage.movingPlatforms) {
      const mpLeft = mp.currentX;
      const mpRight = mp.currentX + mp.width;
      const mpTop = mp.currentY;
      const mpBottom = mp.currentY - mp.height;

      const pLeft = this.player.x - this.player.width / 2;
      const pRight = this.player.x + this.player.width / 2;
      const pBottom = this.player.y;
      const pTop = this.player.y + this.player.height;

      const overlapX = Math.min(pRight, mpRight) - Math.max(pLeft, mpLeft);
      const overlapY = Math.min(pTop, mpTop) - Math.max(pBottom, mpBottom);

      if (overlapX > 0.02 && overlapY > 0) {
        const prevTop = this.player.prevY + this.player.height;
        const prevBottom = this.player.prevY;

        // 1. Headbutt / Ceiling: Jumping from underneath moving platform
        if ((this.player.vy > 0 && prevTop <= mpBottom + 0.38) || (overlapY < overlapX && this.player.vy > 0 && pBottom < mpBottom)) {
          this.player.y = mpBottom - this.player.height;
          this.player.vy = -1.5;
          this.sound.playSmash();
          this.triggerCameraShake(0.08, 0.1);
        }
        // 2. Landing on top of moving platform & carrying motion
        else if ((this.player.vy <= 0 && prevBottom >= mpTop - 0.38) || (overlapY < overlapX && this.player.vy <= 0 && pBottom >= mpBottom)) {
          this.player.y = mpTop;
          this.player.vy = 0;
          this.player.isGrounded = true;
          groundedThisFrame = true;
          this.player.x += mp.vx * dt;
          this.player.y += mp.vy * dt;
        }
        // 3. Side collision with moving platform
        else {
          if (this.player.prevX < mp.currentX || (this.player.x < mp.currentX + mp.width / 2 && overlapX < overlapY)) {
            this.player.x = mpLeft - this.player.width / 2;
            this.player.vx = Math.min(0, this.player.vx);
          } else {
            this.player.x = mpRight + this.player.width / 2;
            this.player.vx = Math.max(0, this.player.vx);
          }
        }
      }
    }

    // Stage Blocks Collisions (Question & Brick Blocks)
    for (const block of this.stage.blocks) {
      if (block.isDestroyed) continue;
      const bBox = block.getAABB();

      const pLeft = this.player.x - this.player.width / 2;
      const pRight = this.player.x + this.player.width / 2;
      const pBottom = this.player.y;
      const pTop = this.player.y + this.player.height;

      const bLeft = bBox.x;
      const bRight = bBox.x + bBox.w;
      const bBottom = bBox.y;
      const bTop = bBox.y + bBox.h;

      const overlapX = Math.min(pRight, bRight) - Math.max(pLeft, bLeft);
      const overlapY = Math.min(pTop, bTop) - Math.max(pBottom, bBottom);

      if (overlapX > 0.08 && overlapY > 0.08) {
        const prevTop = this.player.prevY + this.player.height;
        const prevBottom = this.player.prevY;

        // 1. Headbutt from below
        if ((this.player.vy > 0 && prevTop <= bBottom + 0.35) || (overlapY < overlapX && this.player.vy > 0 && pBottom < bBottom)) {
          this.player.y = bBottom - this.player.height;
          this.player.vy = -1.5;
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
        // 2. Landing on top of block
        else if ((this.player.vy <= 0 && prevBottom >= bTop - 0.35) || (overlapY < overlapX && this.player.vy <= 0 && pBottom >= bBottom)) {
          this.player.y = bTop;
          this.player.vy = 0;
          this.player.isGrounded = true;
          groundedThisFrame = true;
        }
        // 3. Side collision with block
        else {
          if (this.player.x < block.x) {
            this.player.x = bLeft - this.player.width / 2;
            this.player.vx = 0;
          } else {
            this.player.x = bRight + this.player.width / 2;
            this.player.vx = 0;
          }
        }
      }
    }

    if (!groundedThisFrame && this.player.isGrounded && this.player.vy < 0) {
      this.player.isGrounded = false;
    }

    // Refresh player AABB after platform and block collision adjustments
    const pBox = this.player.getAABB();

    // Breakable Street Obstacles (Trash cans, cardboard boxes)
    const attackBox = this.player.getAttackAABB();

    for (let i = this.stage.obstacles.length - 1; i >= 0; i--) {
      const obs = this.stage.obstacles[i];
      if (obs.isDestroyed) continue;
      const obsBox = obs.getAABB();

      // Spin attack or Gold Dash destroys obstacle!
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

      // Solid obstacle blocking player if not attacking
      if (this.checkAABB(pBox, obsBox)) {
        if (this.player.vy <= 0 && pBox.y >= obsBox.y + obsBox.h - 0.3) {
          this.player.y = obsBox.y + obsBox.h;
          this.player.vy = 0;
          this.player.isGrounded = true;
        } else if (this.player.x < obsBox.x) {
          this.player.x = obsBox.x - this.player.width / 2;
          this.player.vx = 0;
        } else if (this.player.x > obsBox.x + obsBox.w) {
          this.player.x = obsBox.x + obsBox.w + this.player.width / 2;
          this.player.vx = 0;
        }
      }
    }

    // Cassette Collection
    for (const cassette of this.stage.cassettes) {
      if (cassette.isCollected) continue;
      if (this.checkAABB(pBox, cassette.getAABB())) {
        cassette.isCollected = true;
        this.stage.scene.remove(cassette.mesh);

        if (cassette.isGold) {
          this.sound.playPowerup();
          this.sound.setGoldMode(true);
          this.player.triggerInvincibility(12);
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

    // Subwoofer Bounce Pads
    for (const sub of this.stage.subwoofers) {
      const sBox = sub.getAABB();
      if (this.checkAABB(pBox, sBox)) {
        if (this.player.vy <= 0 && this.player.prevY >= sBox.y + sBox.h - 0.4) {
          sub.bounce();
          this.player.y = sBox.y + sBox.h;
          this.player.vy = 20.0;
          this.player.isGrounded = false;
          this.sound.playSubwoofer();
          this.stage.particleSystem.spawnShockwave(sub.x, sub.y + 0.9);
          this.triggerCameraShake(0.35, 0.3);
          this.registerComboHit();
          this.addScore(200);
        }
      }
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

    // Fire Hydrants (Eruption & Water Column Boost)
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

      if (hyd.isErupted) {
        if (this.checkAABB(pBox, hydBox)) {
          this.player.vy = 20.5;
          this.player.isGrounded = false;
          this.sound.playGeyser();
          this.stage.particleSystem.spawnWater(this.player.x, this.player.y + 0.5, 8);
          this.triggerCameraShake(0.2, 0.2);
          this.registerComboHit();
        }
      } else {
        if (this.checkAABB(pBox, hydBox)) {
          if (this.player.vy <= 0 && this.player.prevY >= hydBox.y + hydBox.h - 0.3) {
            this.player.y = hydBox.y + hydBox.h;
            this.player.vy = 0;
            this.player.isGrounded = true;
            groundedThisFrame = true;
          } else if (this.player.x < hyd.x) {
            this.player.x = hydBox.x - this.player.width / 2;
            this.player.vx = 0;
          } else {
            this.player.x = hydBox.x + hydBox.w + this.player.width / 2;
            this.player.vx = 0;
          }
        }
      }
    }

    // Security Laser Grids (Slide Underneath to Evade!)
    for (const laser of this.stage.laserGrids) {
      const beamBox = laser.getBeamAABB();
      if (this.checkAABB(pBox, beamBox)) {
        if (this.player.isCrouching || this.player.spawnShieldTimer > 0) {
          if (Math.random() < 0.2) {
            this.stage.particleSystem.spawnSparkles(this.player.x, this.player.y + 0.3, 2, 0x00f0ff);
          }
        } else {
          if (this.player.isDead) return;
          this.sound.playLaserWarning();
          this.stage.particleSystem.spawnSparkles(this.player.x, this.player.y + 1.0, 18, 0xff0033);
          this.triggerCameraShake(0.45, 0.4);
          this.handlePlayerDeath();
          return;
        }
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
      });
      if (enemy.isDead) continue;

      // Solid environment wall collision (platforms, stairs, blocks, street obstacles)
      this.stage.updateEnemyCollisions(enemy);

      const eBox = enemy.getAABB();

      // Attack Box check (Spin or Gold Invincible)
      if (attackBox && this.checkAABB(attackBox, eBox)) {
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
        // Stomp from above (Player is falling and hits top 35% of enemy)
        if (this.player.vy < 0 && pBox.y >= eBox.y + eBox.h * 0.5) {
          enemy.defeat(4, 6);
          this.player.bounceOnEnemy();
          this.sound.playStomp();
          this.stage.particleSystem.spawnSparkles(enemy.x, enemy.y + 0.5, 8, 0xffea00);
          this.addScore(enemy.scoreValue);
          this.registerComboHit();
          this.triggerCameraShake(0.18, 0.18);
        } else if (this.player.spawnShieldTimer <= 0) {
          // Hurt / Death by contact
          this.handlePlayerDeath();
          return;
        }
      }
    }

    // Projectile Collisions (Deflection with Spin Attack, Damage on Player, Deflected hitting Enemies)
    for (const proj of this.stage.projectiles) {
      if (proj.isDead) continue;
      const projBox = proj.getAABB();

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
          this.handlePlayerDeath();
          return;
        }
      }
    }

    // Goal Reach Check (Turntable stage at end of level)
    const goalBox = this.stage.getGoalAABB();
    if (this.checkAABB(pBox, goalBox) || (this.player.x >= this.stage.goalX - 1.5 && this.player.y >= this.stage.goalY - 0.4)) {
      this.handleGoalClear();
      return;
    }

    // Sync 3D player mesh to post-collision coordinates
    this.player.mesh.position.set(this.player.x, this.player.y, 0);

    // Update Stage World
    this.stage.update(dt, time * 0.001, this.camera.position.x);

    // 2.5D Camera Tracking
    this.updateCamera(dt);
  }

  // -------------------------------------------------------------
  // 2.5D CAMERA TRACKING
  // -------------------------------------------------------------
  private updateCamera(dt: number): void {
    if (!this.player) return;

    const lookAhead = this.player.isFacingRight ? 3.0 : -1.5;
    const targetX = this.player.x + lookAhead;
    const targetY = Math.max(3.2, this.player.y + 2.0);

    const lerpSpeed = 4.5 * dt;
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
    this.sound.stopBgm();
    this.sound.playClear();

    this.player.x = this.stage.goalX;
    this.player.y = this.stage.goalY + 0.3;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.isVictory = true;

    // Time Bonus Calculation
    const timeBonus = Math.floor(this.timeLeft) * 100;
    const stageBonus = (this.currentStage === 4) ? 10000 : 3000;
    this.addScore(timeBonus + stageBonus);

    if (this.currentStage === 4) {
      this.hud.showCenterBanner('allclear');
    } else {
      this.hud.showCenterBanner('clear', `STAGE ${this.currentStage} CLEAR`);
    }
  }

  private updateClear(dt: number, time: number, input: InputState): void {
    this.stateTimer += dt;

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
        startPressed: false, anyActionPressed: false, lastInputTime: 0
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
    if (this.currentStage < 4) {
      if (this.stateTimer >= 3.2) {
        this.advanceToNextStage();
      }
    } else {
      // Final Stage 4: All Clear result overlay
      if (this.stateTimer >= 3.5) {
        this.hud.showResult('clear', this.score);
      }

      if (this.stateTimer > 4.5 && (input.startPressed || input.jumpPressed)) {
        this.startGame();
      }
    }
  }

  // -------------------------------------------------------------
  // PLAYER DEATH & GAME OVER
  // -------------------------------------------------------------
  private handlePlayerDeath(): void {
    if (!this.player || this.player.isDead) return;

    this.player.isDead = true;
    this.player.vy = 12; // Death bounce
    this.sound.playHurt();
    this.hud.showCenterBanner('dead');

    this.lives -= 1;
    this.hud.updateLives(this.lives);

    window.setTimeout(() => {
      if (this.lives > 0) {
        // Respawn at guaranteed safe platform checkpoint (never over a pit!)
        if (this.player && this.stage) {
          const safePos = this.stage.getSafeRespawnPosition(this.player.x);
          this.player.reset(safePos.x, safePos.y, true);
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
        this.hud.showResult('gameover', this.score);
      }
    }, 1800);
  }

  private updateGameOver(dt: number, input: InputState): void {
    this.stateTimer += dt;
    if (this.stateTimer > 1.5 && (input.startPressed || input.jumpPressed)) {
      this.startGame();
    }
    // Inactivity in Game Over triggers Attract loop after 12s
    if (this.input.getIdleDurationSeconds() >= 12) {
      this.setupTitleScene();
    }
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
