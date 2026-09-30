// ============================================================
// Core Game Controller: Tani Multiplier Runner
// Minimal UI text, humanoid crowd, 124 wall, and bonus flight track
// ============================================================

import * as THREE from 'three';
import { buttonIconHtml } from '../../../shared/arcadeGuide.ts';
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

export type GameState =
  | 'TITLE'
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
  public mashCount: number = 0;
  public bonusTimer: number = 0;
  public maxAchievedMultiplier: number = 1.0;
  /** 壁に着いた時点の人数(124を消費する前)。取得単位 = これ × 到達倍率 */
  public creditsAtWall: number = 0;

  // ボーナス飛行の操作: 加速は3回まで、リング成功ごとに取得単位 +10%
  private flightTotal: number = 0;

  /** 選んでいるレベル(小学生・中学生・高専生)。前回の選択を覚えている */
  public level: LevelId = loadLevel();
  private levelBtns: HTMLElement[] = [];
  private prevMoveX: number = 0;
  private flightBoostsLeft: number = 0;
  public ringsHit: number = 0;
  private reqTextElem: HTMLElement | null = null;
  private bonusHintElem: HTMLElement | null = null;
  public lastDingMultiplier: number = 1.0;

  // Third-person camera tracking
  private camPos: THREE.Vector3 = new THREE.Vector3(0, 6.0, 10.0);
  private camLookAt: THREE.Vector3 = new THREE.Vector3(0, 1.5, -6.0);

  // HUD Elements
  private taniCounterElem: HTMLElement | null = null;
  private creditsBoxElem: HTMLElement | null = null;
  private bonusHudElem: HTMLElement | null = null;
  private bonusMultTextElem: HTMLElement | null = null;

  // Overlay Screens
  private startScreen: HTMLElement | null = null;
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
    this.applyLevelSelection(this.level);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    this.animate(0);
  }

  private cacheDOMElements(): void {
    this.taniCounterElem = document.getElementById('tani-counter');
    this.creditsBoxElem = document.getElementById('hud-credits-box');
    this.bonusHudElem = document.getElementById('bonus-multiplier-hud');
    this.bonusMultTextElem = document.getElementById('bonus-current-mult');

    this.startScreen = document.getElementById('start-screen');
    this.failScreen = document.getElementById('fail-screen');
    this.successScreen = document.getElementById('success-screen');
    this.finalMultElem = document.getElementById('final-multiplier-display');
    this.finalScoreElem = document.getElementById('final-score-display');
    this.finalRingElem = document.getElementById('final-ring-display');
    this.reqTextElem = document.getElementById('req-text');
    this.bonusHintElem = document.getElementById('bonus-hint');
  }

  private setupEventListeners(): void {
    const startBtn = document.getElementById('start-btn');
    if (startBtn) startBtn.innerHTML = `${buttonIconHtml([0, 1, 7])} ${startBtn.textContent}`;
    startBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startGame();
    });

    // レベル選択(タップ/クリックで選ぶ。アケコンは左右で選ぶ)
    this.levelBtns = Array.from(document.querySelectorAll<HTMLElement>('.level-btn'));
    for (const btn of this.levelBtns) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.applyLevelSelection(btn.dataset.level as LevelId);
      });
    }
    // 結果画面から、レベル選択(開始画面)へ戻る
    for (const id of ['level-change-fail-btn', 'level-change-success-btn']) {
      document.getElementById(id)?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showStartScreen();
      });
    }

    const retryFailBtn = document.getElementById('retry-fail-btn');
    retryFailBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startGame();
    });

    const retrySuccessBtn = document.getElementById('retry-success-btn');
    retrySuccessBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startGame();
    });

    this.startScreen?.addEventListener('click', () => {
      if (this.state === 'TITLE') this.startGame();
    });
    this.failScreen?.addEventListener('click', () => {
      if (this.state === 'GAME_OVER') this.startGame();
    });
    this.successScreen?.addEventListener('click', () => {
      if (this.state === 'GAME_CLEAR') this.startGame();
    });
  }

  /** レベルを選ぶ。ボタンの強調、説明、そのレベルのランキング表示を更新する */
  private applyLevelSelection(level: LevelId): void {
    this.level = level;
    saveLevel(level);
    for (const btn of this.levelBtns) {
      btn.classList.toggle('selected', btn.dataset.level === level);
    }
    const desc = document.getElementById('level-desc');
    if (desc) desc.textContent = LEVELS[level].description;
    RankingStore.render(document.getElementById('start-ranking'), level);
  }

  /** 左右でレベルを切り替える(アケコン/キーボード)。押しっぱなしで連続して動かないよう、倒した瞬間だけ反応する */
  private handleLevelInput(moveX: number): void {
    const dir = moveX > 0.5 && this.prevMoveX <= 0.5 ? 1 : moveX < -0.5 && this.prevMoveX >= -0.5 ? -1 : 0;
    this.prevMoveX = moveX;
    if (dir === 0) return;
    const idx = LEVEL_ORDER.indexOf(this.level);
    const next = Math.max(0, Math.min(LEVEL_ORDER.length - 1, idx + dir));
    if (next !== idx) this.applyLevelSelection(LEVEL_ORDER[next]);
  }

  /** 開始画面(レベル選択)に戻る */
  private showStartScreen(): void {
    this.state = 'TITLE';
    sound.stopBgm();
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    this.bonusHudElem?.classList.add('hidden');
    this.startScreen?.classList.remove('hidden');
    this.applyLevelSelection(this.level);
  }

  public startGame(): void {
    sound.init();
    sound.playCoin();
    sound.playStartJingle();
    sound.startRunningBgm();

    this.state = 'RUNNING';
    this.playerZ = 0;
    this.currentCredits = 4;
    this.flightBoost = 1.0;
    this.mashCount = 0;
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

    this.startScreen?.classList.add('hidden');
    this.failScreen?.classList.add('hidden');
    this.successScreen?.classList.add('hidden');
    this.bonusHudElem?.classList.add('hidden');

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

    // 開始画面では、左右でレベルを選ぶ
    if (this.state === 'TITLE') this.handleLevelInput(input.moveX);

    // Handle Start on Title/Results
    if ((this.state === 'TITLE' || this.state === 'GAME_OVER' || this.state === 'GAME_CLEAR') && input.actionJustPressed) {
      this.startGame();
    }

    // State machine
    switch (this.state) {
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
    this.bonusHintElem.textContent = `加速 ${this.flightBoostsLeft} ・ リング ${this.ringsHit}/${this.world.rings.length}`;
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

      // Transition to Wall Crash & Mash phase
      this.state = 'WALL_CRASH';
      this.bonusTimer = 0;
      this.mashCount = 0;
    }
  }

  // State: Brief slow-mo mash window before launching surplus students
  private updateWallCrash(dt: number, input: ReturnType<typeof inputManager.poll>): void {
    this.bonusTimer += dt;

    // Mash button 0 / Space / Z to boost launch velocity!
    if (input.actionJustPressed) {
      this.mashCount++;
      sound.playShootRocket();
      inputManager.rumble(50, 0.5, 0.5);
      this.effects.shake(0.2, 0.1);
    }

    // Move slightly forward onto ramp
    this.playerZ -= 6.0 * dt;
    this.crowd.groupZ = this.playerZ;
    this.crowd.updateRunning(dt, 0);

    // Dynamic cinematic camera shifting to side-angle
    this.camPos.lerp(new THREE.Vector3(7.0, 4.5, this.world.bossWallZ + 12.0), dt * 5.0);
    this.camLookAt.lerp(new THREE.Vector3(0, 2.0, this.world.bossWallZ - 20.0), dt * 5.0);

    if (this.bonusTimer >= 0.6) {
      this.state = 'BONUS_LAUNCH';
    }
  }

  // State: Launch students off ramp into the air
  private updateBonusLaunch(): void {
    this.state = 'BONUS_FLIGHT';

    // Calculate boost factor based on mash count (e.g. 1.0 up to 1.7)
    this.flightBoost = 1.0 + Math.min(0.7, this.mashCount * 0.08);

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
    const rankIndex = RankingStore.add(score, this.level);
    if (this.finalRingElem) {
      this.finalRingElem.textContent = `${LEVELS[this.level].label}　リング ${this.ringsHit}/${this.world.rings.length}${this.ringsHit > 0 ? `  +${this.ringsHit * 10}%` : ''}`;
    }
    if (this.finalScoreElem) {
      this.finalScoreElem.textContent = `${score} 単位`;
    }
    RankingStore.render(document.getElementById('success-ranking'), this.level, rankIndex);
    RankingStore.render(document.getElementById('start-ranking'), this.level);

    this.bonusHudElem?.classList.add('hidden');
    this.successScreen?.classList.remove('hidden');
  }
}
