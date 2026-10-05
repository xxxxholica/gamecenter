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
import { LEVELS, LevelId, loadLevel, saveLevel } from './levels.ts';
import { EffectsManager } from './effects.ts';
import { GateInfo, MathOpType } from './textures.ts';
import { gateResult } from './gateGenerator.ts';
import { RankingStore } from './ranking.ts';
import { LevelSelectScreen } from './levelSelectScreen.ts';
import { ResultMenu } from './resultMenu.ts';
import { mountArcadeGuide } from '../../../shared/arcadeGuide.ts';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen.ts';
import { checkHighScore } from '../../../shared/arcadeLeaderboard';
import { startArcadeCountdown, type ArcadeCountdownHandle } from '../../../shared/arcadeCountdown';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';

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

  /** 選んでいるレベル(小学生・中学生・高専生)。前回の選択を覚えている */
  public level: LevelId = loadLevel();
  private levelSelect!: LevelSelectScreen;
  private resultMenu = new ResultMenu();
  private flightBoostsLeft: number = 0;
  public ringsHit: number = 0;
  private reqTextElem: HTMLElement | null = null;
  private launchCursorElem: HTMLElement | null = null;
  private bonusHintElem: HTMLElement | null = null;
  public lastDingMultiplier: number = 1.0;

  // Third-person camera tracking
  private camPos: THREE.Vector3 = new THREE.Vector3(0, 6.0, 10.0);
  private camLookAt: THREE.Vector3 = new THREE.Vector3(0, 1.5, -6.0);

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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.crowd = new StudentCrowd(this.scene);
    this.world = new WorldManager(this.scene);
    this.effects = new EffectsManager(this.scene, this.camera);

    this.cacheDOMElements();
    this.setupEventListeners();
    this.initArcadeTitleScreen();
    this.showTitleGuide();

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
    this.successScreen = document.getElementById('success-screen');
    this.finalMultElem = document.getElementById('final-multiplier-display');
    this.finalScoreElem = document.getElementById('final-score-display');
    this.finalRingElem = document.getElementById('final-ring-display');
    this.reqTextElem = document.getElementById('req-text');
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


    // 再挑戦ボタン
    for (const id of ['retry-fail-btn', 'retry-success-btn']) {
      const btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.startGame();
        });
      }
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
          window.location.href = '../../';
        });
      }
    }
  }

  private initArcadeTitleScreen(): void {
    this.arcadeTitleScreen = new ArcadeTitleScreen({
      slug: 'tani-runner-124',
      accentColor: '#00e676',
      tagline: '124単位集めて 留年の壁を打ち破れ！',
      startButtonLabel: '開始',
      promptLabel: 'PRESS START / SPACE / 画面クリック',
      onStart: () => {
        this.openLevelSelect();
      },
    });

    this.arcadeTitleScreen.show();
  }

  /** 難易度選択画面を開く（深夜首都高のように「開始」の後に遷移） */
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
    });
  }

  /** タイトル画面に戻る */
  public showTitleScreen(): void {
    this.countdown?.cancel();
    this.state = 'TITLE';
    this.resultMenu.close();
    this.levelSelect.hide();
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    if (this.hudElem) this.hudElem.style.display = 'none';
    this.arcadeTitleScreen?.show();
    this.showTitleGuide();
  }

  private showTitleGuide(): void {
    mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true });
  }

  private showRunGuide(): void {
    mountArcadeGuide({
      moveLabel: '←→ 隊列操作 / ↓ 隊列を絞る',
      buttons: [{ indices: [0, 1, 7], label: 'ジャンプのタイミング・加速' }],
      showHomeHint: true,
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
    });
  }

  public startGame(): void {
    this.arcadeTitleScreen?.hide();
    this.levelSelect.hide();
    this.resultMenu.close();
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    this.bonusHudElem?.classList.add('hidden');
    this.showLaunchTiming(false);
    this.showRunGuide();
    if (this.hudElem) this.hudElem.style.display = 'block';

    sound.init();
    sound.playCoin();
    sound.playStartJingle();

    // 開始前に 3・2・1・GO! を挟む(レベル選択の決定直後にいきなり走り出さない)
    this.state = 'COUNTDOWN';
    this.countdown?.cancel();
    this.countdown = startArcadeCountdown({
      accentColor: '#00e676',
      onGo: () => {
        this.state = 'RUNNING';
        sound.startRunningBgm();
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
    this.effects.clearAll();
    if (this.reqTextElem) this.reqTextElem.textContent = `要件 ${this.graduationRequirement}`;

    this.updateHUD();
  }

  public setCredits(amount: number, delta: number = 0): void {
    this.currentCredits = Math.max(0, Math.floor(amount));
    this.crowd.setCount(this.currentCredits);

    if (this.taniCounterElem) {
      this.taniCounterElem.textContent = this.currentCredits.toString();
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
      this.triggerGameOver();
    }
  }

  private updateHUD(): void {
    if (this.taniCounterElem) {
      this.taniCounterElem.textContent = this.currentCredits.toString();
    }
  }

  // Main game loop
  private lastTime: number = 0;
  private animate = (time: number): void => {
    requestAnimationFrame(this.animate);

    const dt = Math.min(0.08, (time - this.lastTime) / 1000) || 0.016;
    this.lastTime = time;

    const input = inputManager.poll();

    // State machine
    switch (this.state) {
      case 'COUNTDOWN':
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

  // State: Running forward through gates
  private updateRunning(dt: number, input: ReturnType<typeof inputManager.poll>): void {
    this.playerZ -= this.forwardSpeed * dt;
    this.crowd.groupZ = this.playerZ;
    this.crowd.updateRunning(dt, input.moveX);

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
    this.camPos.lerp(new THREE.Vector3(7.0, 4.5, this.world.bossWallZ + 12.0), dt * 5.0);
    this.camLookAt.lerp(new THREE.Vector3(0, 2.0, this.world.bossWallZ - 20.0), dt * 5.0);

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
      this.triggerGameClear();
    }
  }

  // Game Over: 「留年」 (Red bold text)
  private triggerGameOver(): void {
    this.state = 'GAME_OVER';
    sound.stopBgm();
    sound.playGameOverJingle();

    this.failScreen?.classList.remove('hidden');
    this.openResultMenu(['retry-fail-btn', 'title-fail-btn', 'exit-fail-btn']);
  }

  // Game Clear: 「卒業」 (Yellow bold text) + Final Multiplier
  private triggerGameClear(): void {
    this.state = 'GAME_CLEAR';
    sound.stopBgm();
    sound.playVictoryFanfare();

    if (this.finalMultElem) {
      this.finalMultElem.textContent = `倍率 ×${this.maxAchievedMultiplier.toFixed(1)}`;
    }

    // 取得単位 = 壁に着いた人数 × 到達倍率。余った人数が多いほど、遠くまで飛ぶほど増える
    const score = Math.round(this.creditsAtWall * this.maxAchievedMultiplier * (1 + 0.1 * this.ringsHit));
    if (this.finalRingElem) {
      this.finalRingElem.textContent = `${LEVELS[this.level].label}　リング ${this.ringsHit}/${this.world.rings.length}${this.ringsHit > 0 ? `  +${this.ringsHit * 10}%` : ''}`;
    }
    if (this.finalScoreElem) {
      countUpText(this.finalScoreElem, `${score} 単位`);
    }

    this.bonusHudElem?.classList.add('hidden');
    this.successScreen?.classList.remove('hidden');
    this.openResultMenu(['retry-success-btn', 'title-success-btn', 'exit-success-btn']);

    const check = checkHighScore('tani-runner-124', score, this.level);
    if (check.isRankIn) {
      this.resultMenu.setLocked(true);
      mountNameEntryModal({
        title: '卒業名簿',
        scoreDisplay: `${score} 単位`,
        rankDisplay: `第${check.rank}位`,
        themeClass: 'theme-tani',
        delayMs: NAME_ENTRY_AFTER_RESULT_MS,
        onComplete: (katakanaName) => {
          this.resultMenu.setLocked(false);
          RankingStore.add(score, this.level, katakanaName);
        },
      });
    } else {
      RankingStore.add(score, this.level);
    }
  }

  private openResultMenu(buttonIds: string[]): void {
    const buttons = buttonIds.map((id) => document.getElementById(id)).filter((b): b is HTMLElement => b !== null);
    this.resultMenu.open(buttons);
    this.showResultGuide();
  }
}
