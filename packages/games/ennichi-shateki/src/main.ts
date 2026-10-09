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
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { loadRawScores, saveLeaderboardScore } from '../../../shared/arcadeLeaderboard';

const SLUG = 'ennichi-shateki';
import { startArcadeCountdown, type ArcadeCountdownHandle } from '../../../shared/arcadeCountdown';
import { runHighScoreEntryFlow, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();
watchResultAutoReturn(['res-btn-title']);

mountArcadeGuide({
  moveLabel: 'ねらう',
  buttons: [
    { indices: [0], label: '通常弾' },
    { indices: [1, 2, 7], label: 'バクダン弾' },
  ],
  showHomeHint: true,
});

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
  /** 開始前の 3・2・1・GO! の間は true(時間が進まず、撃てない) */
  private offlineCountdown = false;
  private countdownHandle: ArcadeCountdownHandle | null = null;
  private score: number = 0;
  private highScore: number = 0;
  private timeLeft: number = 30.0;
  readonly MAX_TIME_CAP = 45.0; // 念のための上限。実際は下の延長枠で 30+15=45秒 を超えない
  // 延長できる秒数の総量(1プレイ)。延長の種類を増やしても、この枠を使い切ったらそれ以上は延びない
  readonly EXTENSION_BUDGET = 15.0;
  private extensionUsed: number = 0;
  private comboBonusTier: number = 0;

  // 通常弾は6発で再装填(連打だけで押し切れないようにする)
  readonly MAX_AMMO = 6;
  readonly RELOAD_TIME = 1.0;
  private ammo: number = 6;
  private reloadTimer: number = 0;
  private totalDefeatedCount: number = 0;
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
  private stateTimer: number = 0;
  private titleOrbitAngle: number = 0;
  private lastTickInt: number = 30;
  private screenShake: number = 0;

  // 3D vectors
  private aimTargetWorld: THREE.Vector3 = new THREE.Vector3();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  constructor() {
    this.initThree();
    this.initGame();
    this.loadHighScores();
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

  private enterTitle() {
    this.countdownHandle?.cancel();
    this.offlineCountdown = false;
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

    if (!this.arcadeTitleScreen) {
      this.arcadeTitleScreen = new ArcadeTitleScreen({
        slug: 'ennichi-shateki',
        accentColor: '#ff4d4f',
        tagline: 'むげん連射のお祭りアクション',
        startButtonLabel: 'スタート',
        promptLabel: 'PRESS START / ボタンで開始',
        onStart: () => {
          this.onStartPressed();
        },
      });
    }
    this.arcadeTitleScreen.show();
  }

  private onStartPressed() {
    if (this.state !== 'title') return;
    this.arcadeTitleScreen?.hide();
    this.startGame();
  }

  private startGame() {
    if (this.state === 'playing') return;

    this.arcadeTitleScreen?.hide();
    sounds.init();
    sounds.playTaiko();
    sounds.startBgm();

    this.state = 'playing';
    this.prizePileManager.cleanup(this.scene);
    this.prizePileManager.reset();
    this.stateTimer = 0;
    this.score = 0;
    this.timeLeft = 30.0;
    this.totalDefeatedCount = 0;
    this.darumaDropCount = 0;
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
    // 毎回、同じ段の中で景品の並びを入れ替える(高得点の景品は上段のまま)
    shuffleShelfLayout(this.prizes);
    this.resetAllPrizes();
    this.dynamicTargets.reset();
    this.ammo = this.MAX_AMMO;
    this.reloadTimer = 0;
    this.extensionUsed = 0;
    this.comboBonusTier = 0;
    this.hud.updateAmmo(this.ammo, this.MAX_AMMO, false);

    this.camera.position.set(0, 1.48, 2.15);
    this.camera.lookAt(0, 1.25, -0.6);
    this.input.setAim(0, 0.05);

    this.hud.setMode('playing');
    this.hud.updateInGame(this.score, this.timeLeft, 1.0, 0);

    // 開始ボタンを押した直後にいきなり始まらないよう、3・2・1・GO! を挟む
    this.offlineCountdown = true;
    this.countdownHandle?.cancel();
    this.countdownHandle = startArcadeCountdown({
      accentColor: '#ffd54a',
      onGo: () => {
        this.offlineCountdown = false;
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
    sounds.stopBgm();
    this.state = 'results';
    this.stateTimer = 0;

    const isNewRecord = this.score > this.highScore;
    if (isNewRecord) this.highScore = this.score;

    this.resultFocus = 0; // 再挑戦がデフォルト
    this.resultArmTime = performance.now() + 600;
    mountArcadeGuide({
      moveLabel: '選択',
      buttons: [
        { indices: [0], label: '決定' },
        { indices: [1], label: '終了' },
      ],
      showHomeHint: true,
    });

    const finalScore = this.score;
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
    this.hud.setMode('results');
    this.hud.renderResults(this.score, this.totalDefeatedCount, isNewRecord, breakdown);
    this.hud.updateCrosshair(0, 0, false);
    window.setTimeout(() => this.updateResultFocus(), 60);
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
      } else if (inputState.shootExplosiveJustPressed) {
        returnToHub();
      }
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
