// ============================================================================
// main.js - 爆走！グラウンド事務椅子GP Main Entry Point
// ============================================================================

import * as THREE from 'three';
import { InputManager } from './input.js';
import { SoundSystem } from './audio.js';
import { OfficeChair } from './chair.js';
import { GroundTrack } from './track.js';
import { ParticleSystem } from './particles.js';
import { PhysicsEngine } from './physics.js';
import { SpeedLines } from './speedlines.js';
import { NPCManager } from './npc.js';
import { WeaponManager } from './weapons.js';
import { installHomeReturn } from '../../../shared/homeReturn.ts';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();

// Game States
const STATE = {
  TITLE: 'TITLE',
  COUNTDOWN: 'COUNTDOWN',
  PLAYING: 'PLAYING',
  GOAL: 'GOAL',
  CRASH: 'CRASH'
};

class Game {
  constructor() {
    this.currentState = STATE.TITLE;

    // Time tracking
    this.raceTime = 0;
    this.countdownTimer = 0;
    this.goalSlowdown = 1.0;

    // Three.js Core
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.container = document.getElementById('canvas-container');

    // Camera chase parameters
    this.camTargetPos = new THREE.Vector3();
    this.camLookAt = new THREE.Vector3();
    this.baseFov = 70;
    this.maxFov = 90;

    // Subsystems
    this.input = new InputManager();
    this.sound = new SoundSystem();
    this.speedlines = new SpeedLines('speedlines-canvas');

    // DOM HUD elements
    this.hudLap = document.getElementById('lap-display');
    this.hudPos = document.getElementById('pos-display');
    this.hudTime = document.getElementById('time-display');
    this.hudSpeed = document.getElementById('speed-display');
    this.hudAnnounce = document.getElementById('hud-center-announce');
    this.hudBombStatus = document.getElementById('bomb-status');
    this.jetBlocks = Array.from(document.querySelectorAll('.jet-block'));

    this.whiteoutOverlay = document.getElementById('whiteout-overlay');
    this.mudOverlay = document.getElementById('mud-overlay');
    this.checkerOverlay = document.getElementById('checker-overlay');

    // Screens
    this.titleScreen = document.getElementById('title-screen');
    this.crashScreen = document.getElementById('crash-screen');
    this.goalScreen = document.getElementById('goal-screen');
    this.goalTitleEl = document.getElementById('goal-title');
    this.crashReasonEl = document.getElementById('crash-reason');
    this.finalTimeEl = document.getElementById('final-time');
    this.finalRankEl = document.getElementById('final-rank');

    this._initThree();
    this._bindEvents();

    // Loop
    this.prevTime = performance.now();
    this._animate = this._animate.bind(this);
    requestAnimationFrame(this._animate);
  }

  _initThree() {
    // Scene (Daytime School Sky)
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x5c9eff);

    // Camera
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, aspect, 0.1, 1000);
    this.camera.position.set(0, 5, -15);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.container.appendChild(this.renderer.domElement);

    // Build World Objects
    this.track = new GroundTrack(this.scene);
    this.chair = new OfficeChair();
    this.scene.add(this.chair.group);
    this.particles = new ParticleSystem(this.scene);

    // Physics Engine
    this.physics = new PhysicsEngine(this.track, this.chair, this.particles, this.sound);
    this.physics.reset();

    // Rival AI racers (11 competitors)
    this.npcManager = new NPCManager(this.scene, this.track, this.particles, this.sound);

    // CO2 Cylinder Bomb Weapon System
    this.weaponManager = new WeaponManager(this.scene, this.track, this.particles, this.sound);

    // Initial camera placement behind chair facing +Z
    this.camTargetPos.set(0, 2.2, -5);
    this.camLookAt.set(0, 0.8, 5);
    this.camera.position.copy(this.camTargetPos);
    this.camera.lookAt(this.camLookAt);

    // Resize listener
    window.addEventListener('resize', () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  _bindEvents() {
    const startBtn = document.getElementById('start-btn');
    startBtn.addEventListener('click', () => this.startGame());

    const retryCrashBtn = document.getElementById('retry-crash-btn');
    retryCrashBtn.addEventListener('click', () => this.startGame());

    const retryGoalBtn = document.getElementById('retry-goal-btn');
    retryGoalBtn.addEventListener('click', () => this.startGame());

    // Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        window.location.href = '../../';
      }
    });
  }

  startGame() {
    this.sound.init();
    this.sound.resume();

    this.titleScreen.classList.add('hidden');
    this.crashScreen.classList.add('hidden');
    this.goalScreen.classList.add('hidden');
    if (this.checkerOverlay) {
      this.checkerOverlay.classList.add('hidden');
    }

    this.physics.reset();
    this.npcManager.reset();
    this.weaponManager.reset();
    this.raceTime = 0;
    this.goalSlowdown = 1.0;

    // カウントダウン開始時に即座にスタート地点へスナップ
    this.chair.group.position.set(0, 0, 0);
    this.chair.group.rotation.set(0, Math.PI / 2 - this.physics.yaw, 0);
    this.chair.updateWorldPositions();
    this.chair.setDynamics(0, 0, 0);

    this.camTargetPos.set(0, 2.2, -5);
    this.camLookAt.set(0, 0.8, 5);
    this.camera.position.copy(this.camTargetPos);
    this.camera.lookAt(this.camLookAt);
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();

    // Start 3-second arcade countdown
    this.currentState = STATE.COUNTDOWN;
    this.countdownTimer = 3.5;
    this._updateAnnounce('3');
    this.sound.playBeep(false);
  }

  _updateAnnounce(text, show = true) {
    if (show) {
      this.hudAnnounce.textContent = text;
      this.hudAnnounce.classList.add('show');
    } else {
      this.hudAnnounce.classList.remove('show');
    }
  }

  _formatTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  }

  _updateHUD(speedKmH) {
    // 0. POS (Real-time Race Position)
    if (this.hudPos && this.npcManager) {
      const rankData = this.npcManager.calculateRankings(this.physics);
      this.hudPos.innerHTML = `${rankData.playerRank}<span class="pos-total">/${rankData.totalRacers}</span>`;
    }

    // 1. LAP
    this.hudLap.textContent = `${this.physics.lap}/${this.physics.maxLaps}`;

    // 2. TIME
    this.hudTime.textContent = this._formatTime(this.raceTime);

    // 3. SPEED
    this.hudSpeed.textContent = Math.round(speedKmH);

    // 4. JET Meter (10 blocks)
    const activeBlocks = Math.round(this.physics.jetEnergy * 10);
    for (let i = 0; i < this.jetBlocks.length; i++) {
      if (i < activeBlocks) {
        this.jetBlocks[i].className = 'jet-block active';
        if (this.physics.jetEnergy < 0.25) {
          this.jetBlocks[i].classList.add('danger');
        }
      } else {
        this.jetBlocks[i].className = 'jet-block';
      }
    }

    // 5. BOMB Status (Enter key weapon)
    if (this.hudBombStatus && this.weaponManager) {
      if (this.weaponManager.canThrow()) {
        this.hudBombStatus.textContent = 'READY';
        this.hudBombStatus.className = 'bomb-ready';
      } else {
        const rem = this.weaponManager.cooldown.toFixed(1);
        this.hudBombStatus.textContent = `${rem}s`;
        this.hudBombStatus.className = 'bomb-cooldown';
      }
    }

    // 6. Whiteout & Mud overlays
    this.whiteoutOverlay.style.opacity = Math.min(1.0, this.physics.whiteout);
    this.mudOverlay.style.opacity = this.physics.isMud ? '0.35' : '0';

    // 7. Announcements (Wrong Way or Bomb hits)
    if (this.currentState === STATE.PLAYING) {
      if (this.physics.wrongWay) {
        this._updateAnnounce('逆走！', true);
      } else if (this.weaponManager.hitAnnounceTimer > 0) {
        this._updateAnnounce(this.weaponManager.recentHitAnnouncement, true);
      } else if (this.hudAnnounce.textContent === '逆走！' || this.hudAnnounce.textContent.includes('HIT')) {
        this._updateAnnounce('', false);
      }
    }
  }

  _updateCamera(dt, currentSpeed) {
    const chairPos = this.chair.group.position;
    const forward = new THREE.Vector3(Math.cos(this.physics.yaw), 0, Math.sin(this.physics.yaw));

    // Dynamic camera distance based on speed
    const camDist = 3.8 + (currentSpeed / 60) * 1.5;
    const camHeight = 1.9 + (currentSpeed / 60) * 0.5;

    // Follow position behind chair
    const idealPos = chairPos.clone()
      .sub(forward.clone().multiplyScalar(camDist))
      .add(new THREE.Vector3(0, camHeight, 0));

    // Camera smoothing
    const smoothFactor = Math.min(1.0, 14.0 * dt);
    this.camTargetPos.lerp(idealPos, smoothFactor);

    // Look at point slightly in front of chair
    const lookTarget = chairPos.clone().add(forward.clone().multiplyScalar(4.0)).add(new THREE.Vector3(0, 0.8, 0));
    this.camLookAt.lerp(lookTarget, smoothFactor);

    // Apply Screen Shake
    if (this.physics.screenShake > 0.001) {
      const shakeAmt = this.physics.screenShake * 0.25;
      const shakeX = (Math.random() - 0.5) * shakeAmt;
      const shakeY = (Math.random() - 0.5) * shakeAmt;
      const shakeZ = (Math.random() - 0.5) * shakeAmt;

      this.camera.position.set(
        this.camTargetPos.x + shakeX,
        Math.max(0.3, this.camTargetPos.y + shakeY),
        this.camTargetPos.z + shakeZ
      );
      this.camera.lookAt(this.camLookAt.x + shakeX, this.camLookAt.y + shakeY, this.camLookAt.z + shakeZ);
    } else {
      this.camera.position.copy(this.camTargetPos);
      this.camera.lookAt(this.camLookAt);
    }

    // Dynamic FOV widening (70 -> 90) during jet boost and high speeds
    const speedRatio = Math.min(1.0, currentSpeed / 60);
    const boostBoost = this.physics.isJetting ? 0.25 : 0;
    const targetFov = this.baseFov + (this.maxFov - this.baseFov) * Math.min(1.0, speedRatio + boostBoost);
    this.camera.fov += (targetFov - this.camera.fov) * 8.0 * dt;
    this.camera.updateProjectionMatrix();
  }

  _animate() {
    requestAnimationFrame(this._animate);

    const now = performance.now();
    const rawDt = Math.min((now - this.prevTime) / 1000, 0.1);
    this.prevTime = now;
    let dt = rawDt;

    // Gamepad / Keyboard update
    this.input.update();

    // Start / Restart button edge trigger
    if (this.input.startPressed) {
      if (this.currentState === STATE.TITLE || this.currentState === STATE.CRASH || this.currentState === STATE.GOAL) {
        this.startGame();
        return;
      }
    }

    // State Machine
    if (this.currentState === STATE.COUNTDOWN) {
      const prevTimer = this.countdownTimer;
      this.countdownTimer -= rawDt;

      // NPCs idle on starting grid
      this.npcManager.update(rawDt, this.physics, false);

      if (prevTimer > 2.5 && this.countdownTimer <= 2.5) {
        this._updateAnnounce('2');
        this.sound.playBeep(false);
      } else if (prevTimer > 1.5 && this.countdownTimer <= 1.5) {
        this._updateAnnounce('1');
        this.sound.playBeep(false);
      } else if (prevTimer > 0.5 && this.countdownTimer <= 0.5) {
        this._updateAnnounce('GO!');
        this.sound.playBeep(true);
      } else if (this.countdownTimer <= 0) {
        this._updateAnnounce('', false);
        this.currentState = STATE.PLAYING;
      }
    } else if (this.currentState === STATE.PLAYING) {
      this.raceTime += rawDt;

      // Handle Enter / Button 2 Bomb Throw
      if (this.input.throwPressed) {
        this.weaponManager.throwCylinder(this.physics.pos, this.physics.vel, this.physics.yaw);
      }

      // Update Physics with player input
      this.physics.update(dt, this.input);

      // Update Rival NPCs & collision physics
      this.npcManager.update(dt, this.physics, true, this.weaponManager);

      // Update Weapons & Bomb explosions
      this.weaponManager.update(dt, this.npcManager, this.physics);

      // Check crash condition
      if (this.physics.isCrashed) {
        this.currentState = STATE.CRASH;
        this.crashReasonEl.textContent = this.physics.crashReason;
        setTimeout(() => {
          this.crashScreen.classList.remove('hidden');
        }, 1200);
      }

      // Check finish condition
      if (this.physics.isFinished) {
        this.currentState = STATE.GOAL;

        // Calculate and display final rank (Supports up to 12 racers)
        const finalRankData = this.npcManager.calculateRankings(this.physics);
        const rankSuffix = (r) => {
          if (r === 1) return '1ST';
          if (r === 2) return '2ND';
          if (r === 3) return '3RD';
          return `${r}TH`;
        };
        const rankText = finalRankData.playerRank === 1
          ? '1ST PLACE! CHAMPION!'
          : `${rankSuffix(finalRankData.playerRank)} PLACE / ${finalRankData.totalRacers}`;

        if (this.finalRankEl) {
          this.finalRankEl.textContent = rankText;
          this.finalRankEl.style.color = finalRankData.playerRank === 1 ? '#ffff00' : (finalRankData.playerRank <= 3 ? '#00ffcc' : '#ff9900');
        }

        const titleText = finalRankData.playerRank === 1 ? 'GOAL!! 優勝！' : 'GOAL!! 完走';
        if (this.goalTitleEl) {
          this.goalTitleEl.textContent = titleText;
          this.goalTitleEl.style.color = finalRankData.playerRank === 1 ? '#ffff00' : '#00ffcc';
        }
        if (this.finalTimeEl) {
          this.finalTimeEl.textContent = this._formatTime(this.raceTime);
        }

        // ゴール表示と完走リザルトを1回に集約（二重表示・段階遅延の撤廃）
        // 0.6秒のスローモーションチェッカー通過演出後、一体型リザルト画面を表示
        setTimeout(() => {
          this.goalScreen.classList.remove('hidden');
        }, 600);
      }
    } else if (this.currentState === STATE.GOAL) {
      // Slow-motion dramatic celebration
      this.goalSlowdown = Math.max(0.18, this.goalSlowdown - 0.5 * rawDt);
      dt = rawDt * this.goalSlowdown;
      // Idle coast physics
      this.physics.update(dt, { steer: 0, jet: false, brake: false });
      // Keep NPCs moving past finish line
      this.npcManager.update(dt, this.physics, true, this.weaponManager);
      this.weaponManager.update(dt, this.npcManager, this.physics);
    } else if (this.currentState === STATE.CRASH) {
      // Shattered parts physics
      this.physics.update(dt, { steer: 0, jet: false, brake: false });
      this.npcManager.update(dt, this.physics, true, this.weaponManager);
      this.weaponManager.update(dt, this.npcManager, this.physics);
    }

    // Update dynamic track props
    this.track.updateDynamics(dt);

    // Update particles
    this.particles.update(dt);

    const currentSpeed = this.physics.vel.length();
    const speedKmH = currentSpeed * 3.6;

    // Update Speed lines
    this.speedlines.update(this.physics.isJetting, speedKmH);

    // Update Camera
    this._updateCamera(rawDt, currentSpeed);

    // Update HUD
    this._updateHUD(speedKmH);

    // Render Scene
    this.renderer.render(this.scene, this.camera);
  }
}

// Instantiate game on load
window.addEventListener('DOMContentLoaded', () => {
  new Game();
});
