// ============================================================
// Core Game Controller: Tani Multiplier Runner
// Minimal UI text, humanoid crowd, 124 wall, and bonus flight track
// ============================================================

import * as THREE from 'three';
import { inputManager } from './input.ts';
import { sound } from './audio.ts';
import { StudentCrowd } from './studentMesh.ts';
import { WorldManager, GatePair } from './world.ts';
import { EffectsManager } from './effects.ts';
import { GateInfo, MathOpType } from './textures.ts';

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

  constructor() {
    const canvas = document.getElementById('webgl-canvas') as HTMLCanvasElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05060a);
    this.scene.fog = new THREE.FogExp2(0x05060a, 0.004);

    this.camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.camera.position.set(0, 6.0, 10.0);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.crowd = new StudentCrowd(this.scene);
    this.world = new WorldManager(this.scene);
    this.effects = new EffectsManager(this.scene, this.camera);

    this.cacheDOMElements();
    this.setupEventListeners();

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
  }

  private setupEventListeners(): void {
    const startBtn = document.getElementById('start-btn');
    startBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.startGame();
    });

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

    // Reset camera to start line
    this.camPos.set(0, 6.0, 10.0);
    this.camLookAt.set(0, 1.5, -6.0);

    // Completely reset crowd state (clears flying/dead states from previous run)
    this.crowd.reset(this.currentCredits);

    this.world.reset();
    this.effects.clearAll();

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
        this.updateBonusFlight(dt);
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
      op === 'integral_double' || op === 'integral_triple' || op === 'tensor_prod' || op === 'eigen_boost' || op === 'limit_inf';

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

  // Calculate side gate result:
  // University Mathematics operations (Integrals, Summations, Tensors vs Derivatives, Kernels, Divergence)
  private calcSideGateResult(count: number, info: GateInfo): {
    survivors: number;
    eliminated: number;
  } {
    if (count <= 0) {
      return { survivors: 0, eliminated: 0 };
    }

    if (info.isPositive) {
      let survivors = count;
      switch (info.type) {
        case 'integral_double':
        case 'tensor_prod':
        case 'eigen_boost':
          survivors = count * 2;
          break;
        case 'integral_triple':
          survivors = count * 3;
          break;
        case 'integral_add':
        case 'series_sum':
        case 'limit_inf':
          survivors = count + info.value;
          break;
        default:
          survivors = count * (info.value || 1);
          break;
      }
      return { survivors, eliminated: 0 };
    } else {
      // University Mathematics Reductions:
      let survivors = 0;
      switch (info.type) {
        case 'diff_1st':
        case 'eigen_decay':
          // Order reduction / damping (half)
          survivors = Math.max(0, Math.floor(count / 2));
          break;
        case 'diff_2nd':
          // 2nd-order deep reduction (one third)
          survivors = Math.max(0, Math.floor(count / 3));
          break;
        case 'diff_partial':
        case 'kernel':
        case 'coker':
        case 'divergence':
          // Subspace loss / leakage
          survivors = Math.max(0, count - info.value);
          break;
        default:
          survivors = Math.max(0, count - info.value);
          break;
      }
      const eliminated = count - survivors;
      return { survivors, eliminated };
    }
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
    this.bonusHudElem?.classList.remove('hidden');
    if (this.bonusMultTextElem) {
      this.bonusMultTextElem.textContent = '×1.0';
    }
  }

  // State: Flying & sliding along bonus track
  private updateBonusFlight(dt: number): void {
    const { furthestZ, allStopped } = this.crowd.updateFlight(dt);

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

    this.bonusHudElem?.classList.add('hidden');
    this.successScreen?.classList.remove('hidden');
  }
}
