import * as THREE from 'three';
import { FestivalStall } from './stall';
import { CorkRifle } from './gun';
import { PrizeEntity, createAllPrizes } from './prizes';
import { DynamicTargetsManager } from './dynamic_targets';
import { CorkSystem } from './cork';
import { ArcadeInput } from './input';
import { ArcadeHUD } from './hud';
import { sounds } from './audio';
import { ResultsPrizePileManager } from './results_pile';

type GameState = 'title' | 'attract_demo' | 'attract_ranking' | 'playing' | 'results';

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
  private score: number = 0;
  private highScore: number = 9800;
  private timeLeft: number = 30.0;
  readonly MAX_TIME_CAP = 45.0; // Prevent infinite runaway seconds while keeping extension thrills
  private totalDefeatedCount: number = 0;

  // Explosive Bomb Cooldown
  private bombCooldown: number = 0;
  readonly BOMB_RECHARGE_TIME = 1.3;

  // Combo system
  private comboCount: number = 0;
  private comboTimer: number = 0;
  private lastScoreMilestone: number = 0;

  // Automatic replenishment queue
  private restockQueue: RestockSlot[] = [];

  // State timers
  private stateTimer: number = 0;
  private titleOrbitAngle: number = 0;
  private demoFireTimer: number = 0;
  private demoTargetIndex: number = 0;
  private demoExplosiveCycle: boolean = false;
  private lastTickInt: number = 30;
  private screenShake: number = 0;

  // 3D vectors
  private aimTargetWorld: THREE.Vector3 = new THREE.Vector3();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  constructor() {
    this.initThree();
    this.initGame();
    this.setupEvents();
    this.animate(0);
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffe2b8, 1.0);
    this.scene.add(ambientLight);

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

    this.enterTitle();
  }

  private setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        window.location.href = '../../';
      }
    });

    const handleScreenTouchOrClick = (e?: Event) => {
      if (this.state === 'attract_demo') {
        this.enterTitle();
        if (e && e.cancelable) e.preventDefault();
        return;
      }
      if (this.state === 'title') {
        if (this.stateTimer > 0.35) {
          this.startGame();
        }
        return;
      }
      if (this.state === 'attract_ranking') {
        if (this.stateTimer > 0.35) {
          this.startGame();
        }
        return;
      }
      if (this.state === 'results') {
        if (this.stateTimer > 0.6) {
          this.enterTitle();
        }
        return;
      }
    };

    window.addEventListener('click', handleScreenTouchOrClick);
    window.addEventListener('pointerdown', (e) => {
      if (this.state === 'attract_demo') {
        handleScreenTouchOrClick(e);
      }
    });

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

  // --- STATE TRANSITIONS ---

  private enterTitle() {
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
  }

  private enterAttractDemo() {
    this.prizePileManager.cleanup(this.scene);
    this.state = 'attract_demo';
    this.stateTimer = 0;
    this.demoFireTimer = 0.8;
    this.demoTargetIndex = 2;
    this.demoExplosiveCycle = false;
    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = true;
    this.resetAllPrizes();
    this.dynamicTargets.reset();

    this.hud.setMode('demo');
    this.hud.updateInGame(0, 30.0, this.highScore, 1.0, 0);
    this.hud.showFlash('デモプレイ', '画面タップまたは操作でトップへ', 1.4);
  }

  private enterAttractRanking() {
    this.state = 'attract_ranking';
    this.stateTimer = 0;
    this.stall.titleRifleGroup.visible = true;
    this.gun.group.visible = false;

    this.hud.setMode('ranking');
    this.hud.renderRanking();
    this.hud.updateCrosshair(0, 0, false);
  }

  private startGame() {
    if (this.state === 'playing') return;

    sounds.init();
    sounds.playTaiko();

    this.state = 'playing';
    this.prizePileManager.cleanup(this.scene);
    this.prizePileManager.reset();
    this.stateTimer = 0;
    this.score = 0;
    this.timeLeft = 30.0;
    this.totalDefeatedCount = 0;
    this.bombCooldown = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastScoreMilestone = 0;
    this.lastTickInt = 30;
    this.screenShake = 0;
    this.restockQueue = [];

    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = true;
    this.gun.reset();
    this.corkSystem.reset();
    this.resetAllPrizes();
    this.dynamicTargets.reset();

    this.camera.position.set(0, 1.48, 2.15);
    this.camera.lookAt(0, 1.25, -0.6);
    this.input.setAim(0, 0.05);

    this.hud.setMode('playing');
    this.hud.updateInGame(this.score, this.timeLeft, this.highScore, 1.0, 0);
    this.hud.showFlash('構エ', '大屋台 動く景品と風船 登場', 1.2);
  }

  private enterResults() {
    this.state = 'results';
    this.stateTimer = 0;

    const isNewRecord = this.score > this.highScore;
    if (isNewRecord) {
      this.highScore = this.score;
      this.hud.highScores.unshift({ rank: 1, score: this.score, name: 'しゃてき名人' });
      this.hud.highScores = this.hud.highScores.slice(0, 5);
      this.hud.highScores.forEach((e, idx) => (e.rank = idx + 1));
      sounds.playGrandPrizeFanfare();
    } else {
      sounds.playTaiko();
    }

    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = false;

    // Trigger 3D digital scale presentation on counter
    this.prizePileManager.startPile(this.scene, this.prizes, this.dynamicTargets);

    const breakdown = this.prizePileManager.getDefeatedBreakdown();
    this.hud.setMode('results');
    this.hud.renderResults(this.score, this.totalDefeatedCount, isNewRecord, breakdown);
    this.hud.updateCrosshair(0, 0, false);
  }

  private resetAllPrizes() {
    this.prizes.forEach((p) => p.reset());
    this.restockQueue = [];
  }

  // --- SHOOTING LOGIC ---

  private tryShootNormal(): boolean {
    sounds.playShoot(false);
    this.screenShake = 0.2;

    const fireData = this.gun.fire(this.scene, false);
    const shootDir = this.aimTargetWorld.clone().sub(fireData.origin).normalize();
    this.corkSystem.spawn(fireData.origin, shootDir, 'normal');

    const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
    this.hud.updateInGame(this.score, this.timeLeft, this.highScore, bombRatio, this.comboCount);
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

    this.hud.updateInGame(this.score, this.timeLeft, this.highScore, 0.0, this.comboCount);
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
    this.stall.update(dt, elapsed);
    this.dynamicTargets.update(dt, elapsed);
    this.hud.updateFlash(dt);

    if (this.bombCooldown > 0) {
      this.bombCooldown = Math.max(0, this.bombCooldown - dt);
    }

    if (this.comboCount > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    const baseCamX = 0;
    const baseCamY = 1.48;
    const baseCamZ = 2.15;

    switch (this.state) {
      case 'title':
        this.updateTitle(dt, elapsed, inputState);
        break;
      case 'attract_demo':
        this.updateAttractDemo(dt, elapsed, inputState);
        break;
      case 'attract_ranking':
        this.updateAttractRanking(dt, elapsed, inputState);
        break;
      case 'playing':
        this.updatePlaying(dt, elapsed, inputState);
        break;
      case 'results':
        this.updateResults(dt, inputState);
        break;
    }

    if (this.state === 'playing' || this.state === 'attract_demo') {
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
          this.comboTimer = 2.4;
          sounds.playCombo(this.comboCount);

          const multiplier = 1.0 + Math.min(2.0, (this.comboCount - 1) * 0.2);
          const pts = Math.round(directPoints * multiplier);
          this.score += pts;

          if (targetName === '黄金UFO') {
            this.screenShake = 0.9;
            this.hud.showFlash('黄金UFO 撃墜', `+${pts}g 獲得`, 1.5, true);
            this.prizePileManager.recordDefeated('ufo', '黄金UFO');
          } else if (targetName === 'お祭り風船') {
            this.screenShake = 0.4;
            this.hud.showFlash('風船破裂', `+${pts}g`, 0.8);
            this.prizePileManager.recordDefeated('balloon', 'お祭り風船');
          } else if (targetName === '射的アヒル') {
            this.screenShake = 0.35;
            this.hud.showFlash('アヒル撃ち落とし', `+${pts}g`, 0.8);
            this.prizePileManager.recordDefeated('duck', '射的アヒル');
          }

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
      this.addTimeBonus(0.5, `重量 ${this.lastScoreMilestone}g 達成`);
    }
  }

  // Safe time extend capped strictly to MAX 1.5 seconds
  private addTimeBonus(rawBonus: number, reason: string) {
    const bonus = Math.min(1.5, Math.max(0.1, rawBonus));
    this.timeLeft = Math.min(this.MAX_TIME_CAP, this.timeLeft + bonus);
    sounds.playTimeExtend();
    this.hud.showFlash(`延長 +${bonus.toFixed(1)}秒`, reason, 1.6, true);
  }

  // --- AUTOMATIC REPLENISHMENT ---

  private updateAutomaticRestock(dt: number) {
    for (let i = this.restockQueue.length - 1; i >= 0; i--) {
      const item = this.restockQueue[i];
      item.timer -= dt;

      if (item.timer <= 0) {
        const prize = this.prizes.find((p) => p.config.slotId === item.slotId);
        if (prize) {
          prize.triggerSpawnEffect();
          if (this.state === 'playing') {
            this.hud.showFlash('新入荷', `${prize.config.name} 入荷`, 0.8);
          }
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
      this.startGame();
      return;
    }

    const idleSeconds = (performance.now() - this.input.lastInputTime) / 1000;
    if (idleSeconds >= 12.0) {
      this.enterAttractDemo();
    }
  }

  private updateAttractDemo(dt: number, elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;

    if (inputState.hasAnyInput) {
      this.enterTitle();
      return;
    }

    this.camera.position.set(0, 1.48, 2.15);
    this.camera.lookAt(0, 1.25, -0.6);

    // Alternate demo targets between shelf prizes, moving ducks, and balloons
    const target3D = new THREE.Vector3();
    if (this.demoTargetIndex % 3 === 0 && this.dynamicTargets.balloons.length > 0) {
      target3D.copy(this.dynamicTargets.balloons[this.demoTargetIndex % this.dynamicTargets.balloons.length].pos);
    } else if (this.demoTargetIndex % 3 === 1 && this.dynamicTargets.ducks.length > 0) {
      target3D.copy(this.dynamicTargets.ducks[this.demoTargetIndex % this.dynamicTargets.ducks.length].pos);
    } else {
      const active = this.prizes.filter((p) => !p.isDefeated);
      if (active.length > 0) {
        const p = active[this.demoTargetIndex % active.length];
        target3D.copy(p.currentPos);
        target3D.y += p.config.comY * 1.1;
      }
    }

    const screenTarget = target3D.project(this.camera);
    const curX = this.input.aimX;
    const curY = this.input.aimY;
    this.input.setAim(
      curX + (screenTarget.x - curX) * 4.8 * dt,
      curY + (screenTarget.y - curY) * 4.8 * dt
    );

    this.updateAimPlane();
    this.hud.updateCrosshair(this.input.aimX, this.input.aimY, true, true);
    this.gun.update(dt, elapsed, this.camera, this.aimTargetWorld, true);

    this.demoFireTimer -= dt;
    if (this.demoFireTimer <= 0) {
      this.demoExplosiveCycle = !this.demoExplosiveCycle;
      if (this.demoExplosiveCycle && this.bombCooldown <= 0) {
        this.tryShootExplosive();
        this.demoFireTimer = 2.4;
      } else {
        this.tryShootNormal();
        this.demoFireTimer = 1.3;
      }
      this.demoTargetIndex++;
    }

    if (this.stateTimer >= 10.0) {
      this.enterAttractRanking();
    }
  }

  private updateAttractRanking(dt: number, _elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;

    if (inputState.hasAnyInput) {
      this.startGame();
      return;
    }

    this.titleOrbitAngle += dt * 0.2;
    const camX = Math.sin(this.titleOrbitAngle) * 0.8;
    this.camera.position.set(camX, 1.48, 2.4);
    this.camera.lookAt(0, 1.25, -0.4);

    if (this.stateTimer >= 6.0) {
      this.enterTitle();
    }
  }

  // Active Gameplay Loop
  private updatePlaying(dt: number, elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    // 1. Time countdown
    this.timeLeft -= dt;
    if (this.timeLeft < 0) this.timeLeft = 0;

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

    // 4. Shooting Inputs
    if (inputState.shootExplosiveJustPressed) {
      this.tryShootExplosive();
    } else if (inputState.shootNormalJustPressed) {
      this.tryShootNormal();
    }

    // 5. Update HUD
    const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
    this.hud.updateInGame(this.score, this.timeLeft, this.highScore, bombRatio, this.comboCount);

    // 6. Game Over check
    if (this.timeLeft <= 0) {
      sounds.playTimeUp();
      this.hud.showFlash('時間切レ', 'タイムアップ 成績発表へ', 2.0, true);
      this.enterResults();
      return;
    }
  }

  private updateResults(dt: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;

    // 1. Update 3D physics prize drop simulation and off-screen despawning
    this.prizePileManager.update(dt, this.camera);

    // 2. Smooth cinematic camera glide framing the tabletop desk (机の下を見切れさせる)
    const isWide = window.innerWidth >= 860;
    const targetCamX = isWide ? -0.18 : 0.05;
    const targetCamY = 1.20;
    const targetCamZ = isWide ? 1.95 : 2.25;
    this.camera.position.x += (targetCamX - this.camera.position.x) * 3.5 * dt;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 3.5 * dt;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 3.5 * dt;
    this.camera.lookAt(0.38, 1.10, 1.35);

    if (this.stateTimer > 1.0 && (inputState.startJustPressed || inputState.shootNormalJustPressed)) {
      this.enterTitle();
    }
  }

  private updateAimPlane() {
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.aimX, this.input.aimY), this.camera);
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.55);
    const hitPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(aimPlane, hitPoint)) {
      this.aimTargetWorld.copy(hitPoint);
    } else {
      this.aimTargetWorld.copy(this.camera.position).addScaledVector(this.raycaster.ray.direction, 3.0);
    }
  }

  // Step Prize physics simulation and handle toppling/scoring/restocking
  private updatePrizes(dt: number) {
    for (const prize of this.prizes) {
      const newlyDefeated = prize.update(dt);
      if (newlyDefeated) {
        this.totalDefeatedCount++;
        this.comboCount++;
        this.comboTimer = 2.4;
        sounds.playCombo(this.comboCount);
        this.prizePileManager.recordDefeated(prize.config.type, prize.config.name);

        const multiplier = 1.0 + Math.min(2.0, (this.comboCount - 1) * 0.2);
        const addedPoints = Math.round(prize.config.points * multiplier);
        this.score += addedPoints;
        this.screenShake = 0.65;

        // Capped time bonus: ONLY Golden Daruma recovers time (+1.5 seconds)
        // All other prizes (treasure, lucky cat, tv, etc.) do not restore time.
        if (prize.config.type === 'daruma') {
          this.addTimeBonus(1.5, `特賞 ${prize.config.name} 撃破`);
        } else if (this.comboCount >= 3) {
          this.hud.showFlash(
            `${this.comboCount}連鎖 COMBO`,
            `${prize.config.name} +${addedPoints}g`,
            1.2
          );
        } else {
          this.hud.showFlash('撃破', `${prize.config.name} +${addedPoints}g`, 1.0);
        }

        // Score-based time recovery (+0.5s per 2500 pts)
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
        this.hud.updateInGame(this.score, this.timeLeft, this.highScore, bombRatio, this.comboCount);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ArcadeCorkShooter();
});
