import * as THREE from 'three';
import { InputManager } from './input';
import { SoundSystem } from './audio';
import { EffectsManager } from './effects';
import { CourtroomWorld } from './world';
import { TestimonyManager, TestimonyProjectile } from './testimony';
import { loadRanking, submitScore } from './ranking';
import { STAGES, STAGE_TIME_LIMIT, GAVEL_BONUS_DURATION, PENALTY_SECONDS } from './types';

type GameState = 'TITLE' | 'READY' | 'PLAYING' | 'GAVEL_BONUS' | 'VERDICT' | 'RESULT' | 'ATTRACT_RANKING';

const IDLE_TO_ATTRACT = 12.0;
const ATTRACT_RANKING_DURATION = 6.0;
const SPAWN_INTERVAL = 1.7;
const MAX_CONCURRENT = 2;
const FIRE_COOLDOWN = 0.4;
const MAX_MISSES = 3;

export class GameManager {
  private camera: THREE.PerspectiveCamera;
  private world: CourtroomWorld;
  private input: InputManager;
  private sound: SoundSystem;
  private effects: EffectsManager;
  private testimonies: TestimonyManager;
  private raycaster = new THREE.Raycaster();

  private state: GameState = 'TITLE';
  private stateTimer = 0;
  private idleTimer = 0;
  private demoMode = false;

  private stageIndex = 0;
  private score = 0;
  private demoStageElapsed = 0;
  private timeRemaining = STAGE_TIME_LIMIT;
  private spawnTimer = 0;
  private spawnQueue: { text: string; isContradiction: boolean }[] = [];
  private gavelPressCount = 0;
  private titleAngle = 0;
  private fireCooldown = 0;
  private missCount = 0;

  private crosshairX = 0;
  private crosshairY = 0;

  private readonly titleScreen: HTMLElement;
  private readonly startPrompt: HTMLElement;
  private readonly rankingScreen: HTMLElement;
  private readonly rankingList: HTMLElement;
  private readonly retryPrompt: HTMLElement;
  private readonly hud: HTMLElement;
  private readonly caseNameEl: HTMLElement;
  private readonly evidenceNameEl: HTMLElement;
  private readonly timerValueEl: HTMLElement;
  private readonly crosshairEl: HTMLElement;

  constructor(camera: THREE.PerspectiveCamera, world: CourtroomWorld, input: InputManager, sound: SoundSystem, effects: EffectsManager, testimonies: TestimonyManager) {
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.sound = sound;
    this.effects = effects;
    this.testimonies = testimonies;

    this.titleScreen = document.getElementById('title-screen')!;
    this.startPrompt = document.getElementById('start-prompt')!;
    this.rankingScreen = document.getElementById('ranking-screen')!;
    this.rankingList = document.getElementById('ranking-list')!;
    this.retryPrompt = document.getElementById('retry-prompt')!;
    this.hud = document.getElementById('hud')!;
    this.caseNameEl = document.getElementById('case-name')!;
    this.evidenceNameEl = document.getElementById('evidence-name')!;
    this.timerValueEl = document.getElementById('timer-value')!;
    this.crosshairEl = document.getElementById('crosshair')!;
  }

  public update(dt: number): void {
    const inputState = this.input.poll();
    this.updateCamera(dt);
    this.world.updateIdle(dt, this.state === 'TITLE');
    this.effects.update(dt);
    this.testimonies.update(dt, this.camera);

    switch (this.state) {
      case 'TITLE':
        this.idleTimer += dt;
        this.startPrompt.style.opacity = Math.sin(performance.now() / 220) > 0 ? '1' : '0.25';
        if (inputState.actionJustPressed) {
          this.startGame(false);
        } else if (this.idleTimer >= IDLE_TO_ATTRACT) {
          this.startGame(true);
        }
        break;

      case 'READY':
        this.stateTimer -= dt;
        if (inputState.actionJustPressed && this.demoMode) this.interruptDemo();
        if (this.stateTimer <= 0) {
          this.beginStagePlay();
        }
        break;

      case 'PLAYING':
        if (inputState.actionJustPressed && this.demoMode) {
          this.interruptDemo();
          break;
        }
        this.updatePlaying(dt, inputState);
        break;

      case 'GAVEL_BONUS':
        if (inputState.actionJustPressed && this.demoMode) {
          this.interruptDemo();
          break;
        }
        this.updateGavelBonus(dt, inputState);
        break;

      case 'VERDICT':
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.enterResult();
        break;

      case 'RESULT':
        this.idleTimer += dt;
        if (inputState.actionJustPressed) {
          this.startGame(false);
        } else if (this.idleTimer >= IDLE_TO_ATTRACT) {
          this.startGame(true);
        }
        break;

      case 'ATTRACT_RANKING':
        this.stateTimer -= dt;
        if (inputState.actionJustPressed) {
          this.startGame(false);
        } else if (this.stateTimer <= 0) {
          this.returnToTitle();
        }
        break;
    }
  }

  // ===== 状態遷移 =====

  private startGame(demo: boolean): void {
    this.demoMode = demo;
    this.stageIndex = 0;
    this.score = 0;
    this.missCount = 0;
    this.idleTimer = 0;
    this.titleScreen.classList.add('hidden');
    this.rankingScreen.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.enterReady();
  }

  private enterReady(): void {
    this.state = 'READY';
    this.stateTimer = 0.9;
    this.sound.playReady();
    this.effects.showFlashText('READY', 'flash-ready', 850);
    this.caseNameEl.textContent = STAGES[this.stageIndex].caseName;
    this.evidenceNameEl.textContent = STAGES[this.stageIndex].evidence;
  }

  private beginStagePlay(): void {
    this.state = 'PLAYING';
    this.timeRemaining = STAGE_TIME_LIMIT;
    this.spawnTimer = 0.4;
    this.gavelPressCount = 0;
    this.demoStageElapsed = 0;
    this.buildSpawnQueue();
    this.testimonies.clearAll();
  }

  private buildSpawnQueue(): void {
    const stage = STAGES[this.stageIndex];
    const items = [
      { text: stage.contradiction, isContradiction: true },
      ...stage.dummyTestimonies.map((t) => ({ text: t, isContradiction: false })),
    ];
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    this.spawnQueue = items;
  }

  private updatePlaying(dt: number, inputState: { moveX: number; moveY: number; actionJustPressed: boolean }): void {
    this.timeRemaining -= dt;
    this.timerValueEl.textContent = String(Math.max(0, Math.ceil(this.timeRemaining)));

    if (this.demoMode) {
      this.demoStageElapsed += dt;
      if (this.demoStageElapsed > 15) {
        this.testimonies.clearAll();
        this.enterAttractRanking();
        return;
      }
      this.updateDemoAim(dt);
    } else {
      this.crosshairX = THREE.MathUtils.clamp(this.crosshairX + inputState.moveX * dt * 1.6, -1, 1);
      this.crosshairY = THREE.MathUtils.clamp(this.crosshairY + inputState.moveY * dt * 1.6, -1, 1);
    }
    this.updateCrosshairDom();

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.testimonies.active.length < MAX_CONCURRENT) {
      this.spawnNext();
      this.spawnTimer = SPAWN_INTERVAL;
    }

    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    const fire = this.demoMode ? this.demoFireSignal : inputState.actionJustPressed && this.fireCooldown <= 0;
    this.demoFireSignal = false;
    if (fire) {
      if (!this.demoMode) this.fireCooldown = FIRE_COOLDOWN;
      this.handleFire();
    }

    if (!this.demoMode && this.timeRemaining <= 0) {
      this.testimonies.clearAll();
      this.enterResult();
    }
  }

  private spawnNext(): void {
    if (this.spawnQueue.length === 0) this.buildSpawnQueue();
    const item = this.spawnQueue.shift()!;
    const randX = (Math.random() - 0.5) * 2.2;
    const spawnPos = new THREE.Vector3(randX * 0.5, 2.6, -5.0);
    const targetPos = new THREE.Vector3(randX, 1.85, 2.0);
    this.testimonies.spawn(item.text, item.isContradiction, spawnPos, targetPos);
  }

  private handleFire(): void {
    this.sound.playObjection();
    this.effects.showFlashText('異議あり！', 'flash-objection', 380);

    this.raycaster.setFromCamera(new THREE.Vector2(this.crosshairX, -this.crosshairY), this.camera);
    const hit = this.testimonies.raycastHit(this.raycaster);
    if (!hit) return;

    if (hit.isContradiction) {
      this.resolveCorrectHit(hit);
    } else {
      this.resolveWrongHit(hit);
    }
  }

  private resolveCorrectHit(hit: TestimonyProjectile): void {
    this.sound.playHit();
    this.effects.flashScreen('flash-white', 160);
    this.effects.triggerShake(0.35, 0.35);
    this.effects.spawnShatter(hit.mesh.position.clone(), 0xffe600);
    this.effects.showFlashText('論破', 'flash-hit', 1100);
    this.world.defendantKnockback();
    this.testimonies.remove(hit);
    this.testimonies.clearAll();

    this.score += 500 + Math.max(0, Math.round(this.timeRemaining)) * 10;

    this.state = 'GAVEL_BONUS';
    this.stateTimer = GAVEL_BONUS_DURATION;
    this.gavelPressCount = 0;
  }

  private resolveWrongHit(hit: TestimonyProjectile): void {
    this.sound.playBuzzer();
    this.effects.flashScreen('flash-red', 160);
    this.effects.triggerShake(0.15, 0.2);
    this.testimonies.remove(hit);
    this.timeRemaining = Math.max(0, this.timeRemaining - PENALTY_SECONDS);

    if (this.demoMode) return;
    this.missCount += 1;
    if (this.missCount >= MAX_MISSES) {
      this.testimonies.clearAll();
      this.enterResult();
    }
  }

  private updateGavelBonus(dt: number, inputState: { actionJustPressed: boolean }): void {
    this.stateTimer -= dt;
    const pressed = this.demoMode ? this.demoFireSignal : inputState.actionJustPressed;
    this.demoFireSignal = false;
    if (pressed) {
      this.gavelPressCount += 1;
      this.score += 120 * this.gavelPressCount;
      this.sound.playGavel();
      this.effects.triggerShake(0.12, 0.12);
      this.effects.spawnGavelSlam(this.world.defendant.position.clone().add(new THREE.Vector3(0, 2.4, 0)));
    }
    if (this.stateTimer <= 0) {
      this.world.defendantReset();
      if (this.demoMode) {
        this.enterAttractRanking();
        return;
      }
      this.stageIndex += 1;
      if (this.stageIndex >= STAGES.length) {
        this.enterVerdict();
      } else {
        this.enterReady();
      }
    }
  }

  private enterVerdict(): void {
    this.state = 'VERDICT';
    this.stateTimer = 1.6;
    this.sound.playVerdict();
    this.effects.showFlashText('有罪', 'flash-verdict', 1500);
  }

  private enterResult(): void {
    this.testimonies.clearAll();
    const ranking = submitScore(this.score);
    this.renderRanking(ranking);
    this.retryPrompt.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.rankingScreen.classList.remove('hidden');
    this.idleTimer = 0;
    this.state = 'RESULT';
  }

  private enterAttractRanking(): void {
    this.testimonies.clearAll();
    const ranking = loadRanking();
    this.renderRanking(ranking);
    this.retryPrompt.classList.add('hidden');
    this.hud.classList.add('hidden');
    this.rankingScreen.classList.remove('hidden');
    this.state = 'ATTRACT_RANKING';
    this.stateTimer = ATTRACT_RANKING_DURATION;
  }

  private interruptDemo(): void {
    this.testimonies.clearAll();
    this.world.defendantReset();
    this.startGame(false);
  }

  private returnToTitle(): void {
    this.rankingScreen.classList.add('hidden');
    this.titleScreen.classList.remove('hidden');
    this.idleTimer = 0;
    this.state = 'TITLE';
  }

  private renderRanking(scores: number[]): void {
    this.rankingList.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const row = document.createElement('div');
      row.className = 'ranking-row';
      const rank = document.createElement('span');
      rank.textContent = `${i + 1}`;
      const val = document.createElement('span');
      val.textContent = scores[i] !== undefined ? String(scores[i]) : '-----';
      row.appendChild(rank);
      row.appendChild(val);
      this.rankingList.appendChild(row);
    }
  }

  // ===== デモ用オートエイム =====
  private demoFireSignal = false;

  private updateDemoAim(dt: number): void {
    const target = this.testimonies.active.find((p) => p.isContradiction);
    if (!target) return;

    const ndc = target.mesh.position.clone().project(this.camera);
    const dx = ndc.x - this.crosshairX;
    const dy = -ndc.y - this.crosshairY;
    this.crosshairX += dx * Math.min(1, dt * 4);
    this.crosshairY += dy * Math.min(1, dt * 4);

    const dist = Math.hypot(dx, dy);
    if (dist < 0.09 && target.t > 0.3 && target.t < 0.92) {
      this.demoFireSignal = true;
    }
  }

  private updateCrosshairDom(): void {
    const leftPct = 50 + this.crosshairX * 42;
    const topPct = 50 + this.crosshairY * 38;
    this.crosshairEl.style.left = `${leftPct}%`;
    this.crosshairEl.style.top = `${topPct}%`;
  }

  private updateCamera(dt: number): void {
    if (this.state === 'TITLE' || this.state === 'ATTRACT_RANKING') {
      this.titleAngle += dt * 0.15;
      this.camera.position.set(Math.sin(this.titleAngle) * 7, 3.2, Math.cos(this.titleAngle) * 7 - 5);
      this.camera.lookAt(0, 2, -5);
    } else {
      const base = new THREE.Vector3(0, 1.78, 3.4);
      this.camera.position.copy(base).add(this.effects.shakeOffset);
      this.camera.lookAt(0, 2.1, -5.4);
    }
  }
}
