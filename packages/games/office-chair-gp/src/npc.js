// ============================================================================
// npc.js - Rival AI Office Chair Racers with Arcade Bumping & Real-time Ranking
// ============================================================================

import * as THREE from 'three';
import { OfficeChair } from './chair.js';

export class NPCRacer {
  constructor(options, scene, track, particles, sound) {
    this.name = options.name || 'RIVAL';
    this.fabricColor = options.fabricColor || 0xd63031;
    this.extinguisherColor = options.extinguisherColor || 0x222222;
    this.baseSpeed = options.baseSpeed || 42.0; // Target top speed m/s (~150km/h)
    this.boostSpeed = options.boostSpeed || 54.0; // During jet thrust (~195km/h)
    this.accel = options.accel || 26.0;
    this.targetLane = options.targetLane || 0.0; // Offset from track center (-7m to +7m)
    this.gridPos = options.gridPos || new THREE.Vector3(0, 0, -15);

    this.scene = scene;
    this.track = track;
    this.particles = particles;
    this.sound = sound;

    // Create customized rival office chair model
    this.chair = new OfficeChair({
      fabricColor: this.fabricColor,
      extinguisherColor: this.extinguisherColor
    });
    this.scene.add(this.chair.group);

    // State
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.posY = 0;
    this.velY = 0;
    this.yaw = Math.PI / 2;
    this.yawRate = 0;
    this.isAirborne = false;
    this.isJetting = false;
    this.isDrifting = false;
    this.isSpinning = false;
    this.spinTimer = 0;

    this.distance = 0; // Distance traveled along track spline
    this.lap = 1;
    this.trackLength = 1600; // Updated dynamically from spline
    this.laneOffset = this.targetLane;
    this.currentSpeed = 0;
    this.boostTimer = 0;
    this.boostCooldown = 4.0 + Math.random() * 4.0;
    this.bumpCooldown = 0;
    this.padCooldown = 0;
    this.bombCooldown = 5.0 + Math.random() * 8.0;
    this.respawnCooldown = 0;
    this.isCatchingUp = false;
    this.catchUpTargetSpeed = 0;
    this.catchUpTimer = 0;

    this.reset();
  }

  reset() {
    this.pos.copy(this.gridPos);
    this.vel.set(0, 0, 0);
    this.currentSpeed = 0;
    this.yaw = Math.PI / 2; // Facing +Z (straight forward on start grid)
    this.yawRate = 0;
    this.posY = this.track.getSmoothElevation ? this.track.getSmoothElevation(this.pos.x, this.pos.z) : 0;
    this.velY = 0;
    this.isAirborne = false;
    this.isJetting = false;
    this.isDrifting = false;
    this.isSpinning = false;
    this.spinTimer = 0;
    this.distance = this.gridPos.z; // Start distance behind origin
    this.lap = 1;
    this.laneOffset = this.targetLane;
    this.padCooldown = 0;
    this.bombCooldown = 9.0 + Math.random() * 12.0;
    this.respawnCooldown = 0;
    this.isCatchingUp = false;
    this.catchUpTargetSpeed = 0;
    this.catchUpTimer = 0;

    // Start boost: only leaders (RED FIRE & BLACK DEVIL) have a short 1.2s start burst
    if (this.name === 'RED FIRE' || this.name === 'BLACK DEVIL') {
      this.boostTimer = 1.2;
      this.boostCooldown = 6.0;
    } else {
      this.boostTimer = 0;
      this.boostCooldown = 4.0 + Math.random() * 5.0;
    }

    this.chair.group.position.set(this.pos.x, this.posY, this.pos.z);
    this.chair.group.rotation.set(0, Math.PI / 2 - this.yaw, 0);
    this.chair.updateWorldPositions();
    this.chair.setDynamics(0, 0, 0);
  }

  // Calculate curvature ahead to brake for sharp turns and jet on straights
  _getCurvatureAhead(spline, u, lookaheadDist = 25) {
    const totalLen = spline.getLength();
    const uOffset = lookaheadDist / totalLen;
    const uCurrent = u % 1.0;
    const uAhead = (u + uOffset) % 1.0;

    const tan1 = spline.getTangentAt(uCurrent).normalize();
    const tan2 = spline.getTangentAt(uAhead).normalize();
    const dot = Math.max(-1, Math.min(1, tan1.dot(tan2)));
    return 1.0 - dot; // 0 = straight, higher = sharp curve
  }

  update(dt, isPlaying, playerPhysics = null, weaponManager = null, allRacers = null) {
    const spline = this.track.trackSpline;
    if (!spline) return;

    this.trackLength = spline.getLength();

    if (!isPlaying) {
      // Idling at start line: subtle vibration
      this.chair.group.position.set(
        this.pos.x + (Math.random() - 0.5) * 0.015,
        this.posY,
        this.pos.z + (Math.random() - 0.5) * 0.015
      );
      this.chair.updateWorldPositions();
      return;
    }

    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    this.respawnCooldown = Math.max(0, this.respawnCooldown - dt);

    // Spinout behavior when hit by bomb
    if (this.isSpinning) {
      this.spinTimer -= dt;
      this.yaw += this.yawRate * dt;
      this.yawRate *= 0.94;
      this.currentSpeed = Math.max(0, this.currentSpeed - 16.0 * dt);

      if (this.spinTimer <= 0) {
        this.isSpinning = false;
        this.yawRate = 0;
      }

      this.chair.group.position.set(this.pos.x, this.posY, this.pos.z);
      this.chair.group.rotation.set(0, Math.PI / 2 - this.yaw, 0);
      this.chair.updateWorldPositions();

      this.particles.emitDriftDust(this.chair.leftCasterWorldPos, this.vel, 2.0);
      this.particles.emitDriftDust(this.chair.rightCasterWorldPos, this.vel, 2.0);
      return;
    }

    // 1. Spline Navigation & Speed AI
    const u = ((this.distance % this.trackLength) + this.trackLength) % this.trackLength / this.trackLength;
    const centerPt = spline.getPointAt(u);
    const tangent = spline.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // Check track curvature ahead (lookahead 24m)
    const curveAhead = this._getCurvatureAhead(spline, u, 24);

    // Boost timer management - Tactical Arcade Jet Thrust!
    this.padCooldown = Math.max(0, this.padCooldown - dt);
    this.boostCooldown -= dt;

    // Tactical jet activation: Only on straights (curveAhead < 0.12), NOT in turns or curves!
    if (this.boostCooldown <= 0 && curveAhead < 0.12) {
      this.boostTimer = 1.6 + Math.random() * 0.8; // 1.6 - 2.4s burst of jet
      this.boostCooldown = 4.0 + Math.random() * 3.5; // Active jetting without infinite dash
    }

    if (this.boostTimer > 0) {
      this.boostTimer -= dt;
      this.isJetting = true;
    } else {
      this.isJetting = false;
    }

    // Check Boost Pads for single bonus blast
    if (this.track.boostPads && this.padCooldown <= 0) {
      for (const pad of this.track.boostPads) {
        const dx = this.pos.x - pad.x;
        const dz = this.pos.z - pad.z;
        const cosA = Math.cos(-pad.angleY);
        const sinA = Math.sin(-pad.angleY);
        const lx = dx * cosA - dz * sinA;
        const lz = dx * sinA + dz * cosA;

        if (Math.abs(lx) <= pad.halfW && Math.abs(lz) <= pad.halfL) {
          this.boostTimer = Math.max(this.boostTimer, 1.4);
          this.currentSpeed = Math.min(this.boostSpeed + 4.0, this.currentSpeed + 12.0);
          this.padCooldown = 3.0; // Cooldown prevents continuous re-triggering
          break;
        }
      }
    }

    // Catch-up mode management: Sprinting from off-screen until drawn alongside player
    if (this.isCatchingUp) {
      this.catchUpTimer -= dt;
      if (playerPhysics) {
        const uPlayer = this.track.getClosestProgress ? this.track.getClosestProgress(playerPhysics.pos.x, playerPhysics.pos.z) : 0;
        let effU = uPlayer;
        if ((playerPhysics.checkpointsPassed || 0) < 3 && uPlayer > 0.7) effU = uPlayer - 1.0;
        const playerDist = (playerPhysics.lap - 1) * this.trackLength + effU * this.trackLength;
        const distBehind = playerDist - this.distance;

        // 「並んだら落とす」: プレイヤーの横に並んだ（差が2.5m以内または先行）瞬間、最高速度を通常へ落とす！
        if (distBehind <= 2.5 || this.catchUpTimer <= 0) {
          this.isCatchingUp = false;
          this.isJetting = false;
          this.boostTimer = 0;
          const playerSpeed = playerPhysics.vel.length();
          this.currentSpeed = Math.min(this.boostSpeed, Math.max(this.baseSpeed, playerSpeed * 0.96));
          this.boostCooldown = 4.0 + Math.random() * 3.0;
          this.respawnCooldown = 8.0 + Math.random() * 4.0;
          if (this.particles) {
            this.particles.emitFootBrake(this.chair.group.position, this.vel);
            this.particles.emitDriftDust(this.chair.leftCasterWorldPos, this.vel, 2.0);
            this.particles.emitDriftDust(this.chair.rightCasterWorldPos, this.vel, 2.0);
          }
        }
      } else if (this.catchUpTimer <= 0) {
        this.isCatchingUp = false;
      }
    }

    // Determine target speed based on curve & boost (Catch-up mode boosts top speed!)
    let targetSpeed = this.baseSpeed;
    if (this.isCatchingUp) {
      const playerSpeed = playerPhysics ? playerPhysics.vel.length() : 40.0;
      targetSpeed = Math.max(playerSpeed + 16.0, 66.0); // 追い上げ時のみ最高速度アップ！
      this.isJetting = true;
    } else if (this.isJetting) {
      targetSpeed = this.boostSpeed;
    } else if (curveAhead > 0.12) {
      // Corner braking
      targetSpeed = this.baseSpeed * Math.max(0.48, 1.0 - curveAhead * 2.8);
    }

    // Accelerate / Decelerate smoothly towards target speed
    if (this.currentSpeed < targetSpeed) {
      const accRate = this.isCatchingUp ? 42.0 : (this.isJetting ? this.accel * 2.2 : this.accel);
      this.currentSpeed = Math.min(targetSpeed, this.currentSpeed + accRate * dt);
    } else {
      // Decelerate smoothly
      const decelRate = this.isCatchingUp ? 12.0 : 20.0;
      this.currentSpeed = Math.max(targetSpeed, this.currentSpeed - decelRate * dt);
    }

    // Lane slight wandering / overtaking behavior
    const laneWander = Math.sin(this.distance * 0.02 + this.targetLane) * 1.5;
    const currentTargetLane = this.targetLane + laneWander;
    this.laneOffset += (currentTargetLane - this.laneOffset) * Math.min(1.0, 2.5 * dt);

    // Target position along track cross-section
    const idealPos = centerPt.clone().addScaledVector(normal, this.laneOffset);

    // Move distance forward
    this.distance += this.currentSpeed * dt;

    // Check lap completion
    if (this.distance >= this.lap * this.trackLength) {
      this.lap++;
    }

    // Update horizontal position (smooth lerp towards ideal path)
    const posLerp = Math.min(1.0, 16.0 * dt);
    this.pos.lerp(new THREE.Vector3(idealPos.x, 0, idealPos.z), posLerp);

    // Heading yaw aligned with spline tangent with drift slip angle in corners
    const baseTargetYaw = Math.atan2(tangent.z, tangent.x);
    let driftYawOffset = 0;
    if (curveAhead > 0.12 && this.currentSpeed > 22.0) {
      this.isDrifting = true;
      driftYawOffset = (this.laneOffset > 0 ? -0.22 : 0.22) * Math.min(1.5, curveAhead * 4.0);
    } else {
      this.isDrifting = false;
    }

    const targetYaw = baseTargetYaw + driftYawOffset;
    let dyaw = targetYaw - this.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    this.yawRate = dyaw * 10.0;
    this.yaw += this.yawRate * dt;

    // Compute velocity vector for particles and collisions
    const fwd = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.vel.copy(fwd).multiplyScalar(this.currentSpeed);

    // 1.8 Tactical Bomb Throwing AI: Restricted to player target only with strict limits
    this.bombCooldown -= dt;
    if (weaponManager && isPlaying && this.bombCooldown <= 0 && !this.isSpinning && !this.isAirborne) {
      if (weaponManager.canNpcThrow && weaponManager.canNpcThrow()) {
        let shouldThrow = false;

        // Target: ONLY the PLAYER ahead (does NOT bomb fellow NPCs to avoid race stalls)
        if (playerPhysics && !playerPhysics.isSpinning && !playerPhysics.isFinished) {
          const dx = playerPhysics.pos.x - this.pos.x;
          const dz = playerPhysics.pos.z - this.pos.z;
          const dist = Math.hypot(dx, dz);
          const fwdDot = fwd.x * dx + fwd.z * dz;

          // Player is 12m to 36m ahead, within forward cone (~44 degrees)
          if (fwdDot > 12.0 && dist < 36.0 && (fwdDot / dist) > 0.72) {
            // Chance to throw when player is lined up
            if (Math.random() < 0.45) {
              shouldThrow = true;
            }
          }
        }

        if (shouldThrow) {
          const thrown = weaponManager.throwCylinder(this.pos, this.vel, this.yaw, this);
          if (thrown) {
            // Generous cooldown per individual NPC: 16 to 28 seconds
            this.bombCooldown = 16.0 + Math.random() * 12.0;
          }
        }
      }
    }

    // 2. Vertical & Elevation Physics
    const groundElevation = this.track.getSmoothElevation
      ? this.track.getSmoothElevation(this.pos.x, this.pos.z)
      : this.track.getSplineYAt(this.pos.x, this.pos.z);

    // Jump ramp check
    if (this.track.jumpRamps && !this.isAirborne) {
      for (const ramp of this.track.jumpRamps) {
        const dx = this.pos.x - ramp.x;
        const dz = this.pos.z - ramp.z;
        const cosA = Math.cos(-ramp.angleY);
        const sinA = Math.sin(-ramp.angleY);
        const lx = dx * cosA - dz * sinA;
        const lz = dx * sinA + dz * cosA;

        if (Math.abs(lx) <= ramp.halfW && Math.abs(lz) <= ramp.halfL) {
          const progress = (lz + ramp.halfL) / ramp.length;
          if (progress >= 0.7 && this.currentSpeed > 10.0) {
            this.isAirborne = true;
            this.velY = 12.5 + (this.currentSpeed / 35.0) * 8.0;
          }
        }
      }
    }

    if (this.isAirborne) {
      this.velY -= 28.0 * dt;
      this.posY += this.velY * dt;
      if (this.posY <= groundElevation) {
        this.posY = groundElevation;
        this.velY = 0;
        this.isAirborne = false;
        // Landing dust puff
        this.particles.emitDriftDust(this.chair.group.position, this.vel, 1.8);
      }
    } else {
      // Suspension damping on ground
      const diffY = groundElevation - this.posY;
      this.posY += diffY * Math.min(1.0, 35.0 * dt);
    }

    // 3. Slope Pitch alignment
    const elevAhead = this.track.getSmoothElevation
      ? this.track.getSmoothElevation(this.pos.x + fwd.x * 1.5, this.pos.z + fwd.z * 1.5)
      : groundElevation;
    const elevBehind = this.track.getSmoothElevation
      ? this.track.getSmoothElevation(this.pos.x - fwd.x * 1.5, this.pos.z - fwd.z * 1.5)
      : groundElevation;
    const slopePitch = Math.atan2(elevAhead - elevBehind, 3.0);

    // Update Chair visual transform and tilt dynamics
    this.chair.group.position.set(this.pos.x, this.posY, this.pos.z);
    this.chair.group.rotation.set(0, Math.PI / 2 - this.yaw, 0);
    this.chair.updateWorldPositions();

    const rollTarget = -this.yawRate * 0.04;
    const pitchTarget = (this.isJetting ? 0.08 : 0) + slopePitch;
    this.chair.setDynamics(rollTarget, pitchTarget, 0);

    // 4. Particles emission
    if (this.isJetting) {
      this.particles.emitJetSmoke(
        this.chair.leftNozzleWorldPos,
        this.chair.rightNozzleWorldPos,
        fwd
      );
    }

    if (this.isDrifting || this.currentSpeed > 28.0) {
      const dustAmt = this.isDrifting ? 1.8 : 0.8;
      this.particles.emitDriftDust(this.chair.leftCasterWorldPos, this.vel, dustAmt);
      this.particles.emitDriftDust(this.chair.rightCasterWorldPos, this.vel, dustAmt);
    }
  }

  // Bounce interaction when bumped by player or rival
  applyBounce(pushDir, strength = 12.0) {
    this.pos.addScaledVector(pushDir, 0.2);
    this.laneOffset += pushDir.x * 0.8;
    this.currentSpeed = Math.max(10.0, this.currentSpeed - 4.0);
    this.bumpCooldown = 0.35;
  }

  // Hit by CO2 Cylinder bomb: Chaotic spinout & speed penalty
  hitByBomb(pushDir, strength = 26.0) {
    this.isCatchingUp = false;
    this.catchUpTimer = 0;
    this.isSpinning = true;
    this.spinTimer = 1.35; // 1.35s spinout
    this.boostTimer = 0;
    this.isJetting = false;
    this.boostCooldown = 5.0; // Must recover before jetting again
    this.respawnCooldown = 3.5; // Grace period before eligible for catch-up respawn
    this.currentSpeed = Math.max(1.5, this.currentSpeed * 0.1); // Severe deceleration
    this.yawRate = (Math.random() < 0.5 ? 1 : -1) * (24.0 + Math.random() * 8.0);
    this.pos.addScaledVector(pushDir, 0.55);
    this.laneOffset += pushDir.x * 3.0;
    this.particles.emitDriftDust(this.chair.group.position, this.vel, 2.5);
  }

  // Respawn safely OFF-SCREEN behind the player in high-speed catch-up mode
  respawnBehind(playerPhysics, spline, trackLen, playerDist, spawnOffset) {
    const spawnDist = playerDist - spawnOffset;
    const u = ((spawnDist % trackLen) + trackLen) % trackLen / trackLen;
    const centerPt = spline.getPointAt(u);
    const tangent = spline.getTangentAt(u).normalize();
    const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

    // Place across assigned target lane
    this.pos.copy(centerPt).addScaledVector(normal, this.targetLane);
    this.distance = spawnDist;
    this.lap = Math.max(1, Math.floor(spawnDist / trackLen) + 1);
    this.laneOffset = this.targetLane;
    this.yaw = Math.atan2(tangent.z, tangent.x);
    this.yawRate = 0;

    // Initiate catch-up mode: Highest speed sprint from off-screen
    const playerSpeed = playerPhysics ? playerPhysics.vel.length() : this.baseSpeed;
    this.isCatchingUp = true;
    this.catchUpTimer = 10.0;
    this.catchUpTargetSpeed = Math.max(playerSpeed + 16.0, 68.0);
    this.currentSpeed = this.catchUpTargetSpeed;
    this.boostTimer = 10.0;
    this.isJetting = true;

    const fwd = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    this.vel.copy(fwd).multiplyScalar(this.currentSpeed);

    // Track surface elevation & clear flight/spin states
    this.posY = this.track.getSmoothElevation
      ? this.track.getSmoothElevation(this.pos.x, this.pos.z)
      : this.track.getSplineYAt(this.pos.x, this.pos.z);
    this.velY = 0;
    this.isAirborne = false;
    this.isSpinning = false;
    this.spinTimer = 0;

    // Cooldown prevents immediate re-triggering
    this.respawnCooldown = 8.0 + Math.random() * 3.0;

    // Sync 3D transforms
    this.chair.group.position.set(this.pos.x, this.posY, this.pos.z);
    this.chair.group.rotation.set(0, Math.PI / 2 - this.yaw, 0);
    this.chair.updateWorldPositions();
    this.chair.setDynamics(0, 0, 0);

    // Off-screen jet smoke emission
    if (this.particles) {
      this.particles.emitJetSmoke(
        this.chair.leftNozzleWorldPos,
        this.chair.rightNozzleWorldPos,
        fwd
      );
    }
  }
}

export class NPCManager {
  constructor(scene, track, particles, sound) {
    this.scene = scene;
    this.track = track;
    this.particles = particles;
    this.sound = sound;

    this.racers = [];
    this.raceTime = 0;
    this._initRacers();
  }

  _initRacers() {
    // 11 Rival Racers (Total 12 Competitors in Grand Prix)
    const configs = [
      // 1. RED FIRE (Crimson Red / Black Tank)
      {
        name: 'RED FIRE',
        fabricColor: 0xc0392b,
        extinguisherColor: 0x111111,
        baseSpeed: 27.5,
        boostSpeed: 49.0,
        accel: 22.0,
        targetLane: -4.0,
        gridPos: new THREE.Vector3(-3.5, 0, -18.0)
      },
      // 2. BLUE SHADOW (Sky Blue / Silver Tank)
      {
        name: 'BLUE SHADOW',
        fabricColor: 0x2980b9,
        extinguisherColor: 0xecf0f1,
        baseSpeed: 26.5,
        boostSpeed: 47.5,
        accel: 20.0,
        targetLane: 4.0,
        gridPos: new THREE.Vector3(3.5, 0, -26.0)
      },
      // 3. YELLOW THUNDER (Racing Yellow / Orange Tank)
      {
        name: 'YELLOW THUNDER',
        fabricColor: 0xf39c12,
        extinguisherColor: 0xd35400,
        baseSpeed: 27.0,
        boostSpeed: 48.0,
        accel: 21.0,
        targetLane: -1.5,
        gridPos: new THREE.Vector3(-3.5, 0, -34.0)
      },
      // 4. GREEN VIPER (Emerald Green / Dark Green Tank)
      {
        name: 'GREEN VIPER',
        fabricColor: 0x27ae60,
        extinguisherColor: 0x145a32,
        baseSpeed: 25.5,
        boostSpeed: 46.0,
        accel: 19.0,
        targetLane: 2.0,
        gridPos: new THREE.Vector3(3.5, 0, -42.0)
      },
      // 5. PURPLE COMET (Royal Purple / White Tank)
      {
        name: 'PURPLE COMET',
        fabricColor: 0x8e44ad,
        extinguisherColor: 0xffffff,
        baseSpeed: 26.0,
        boostSpeed: 47.5,
        accel: 20.0,
        targetLane: -5.0,
        gridPos: new THREE.Vector3(-3.5, 0, -50.0)
      },
      // 6. ORANGE BEAST (Bright Orange / Gunmetal Tank)
      {
        name: 'ORANGE BEAST',
        fabricColor: 0xe67e22,
        extinguisherColor: 0x2c3e50,
        baseSpeed: 27.5,
        boostSpeed: 49.5,
        accel: 22.5,
        targetLane: 5.0,
        gridPos: new THREE.Vector3(3.5, 0, -58.0)
      },
      // 7. PINK PHANTOM (Hot Pink / Gold Tank)
      {
        name: 'PINK PHANTOM',
        fabricColor: 0xe84393,
        extinguisherColor: 0xf1c40f,
        baseSpeed: 25.0,
        boostSpeed: 45.5,
        accel: 18.5,
        targetLane: -2.5,
        gridPos: new THREE.Vector3(-3.5, 0, -66.0)
      },
      // 8. CYAN STORM (Neon Cyan / Deep Navy Tank)
      {
        name: 'CYAN STORM',
        fabricColor: 0x00cec9,
        extinguisherColor: 0x0c2461,
        baseSpeed: 26.5,
        boostSpeed: 48.0,
        accel: 20.5,
        targetLane: 3.5,
        gridPos: new THREE.Vector3(3.5, 0, -74.0)
      },
      // 9. WHITE KNIGHT (Pure White / Crimson Red Tank)
      {
        name: 'WHITE KNIGHT',
        fabricColor: 0xf5f6fa,
        extinguisherColor: 0xe74c3c,
        baseSpeed: 27.0,
        boostSpeed: 48.5,
        accel: 21.0,
        targetLane: -4.5,
        gridPos: new THREE.Vector3(-3.5, 0, -82.0)
      },
      // 10. BLACK DEVIL (Matte Black / Flame Red Tank)
      {
        name: 'BLACK DEVIL',
        fabricColor: 0x1e272e,
        extinguisherColor: 0xd63031,
        baseSpeed: 28.0,
        boostSpeed: 50.0,
        accel: 23.0,
        targetLane: 1.0,
        gridPos: new THREE.Vector3(3.5, 0, -90.0)
      },
      // 11. LIME BULLET (Fluorescent Lime / Carbon Tank)
      {
        name: 'LIME BULLET',
        fabricColor: 0x00b894,
        extinguisherColor: 0x2d3436,
        baseSpeed: 26.0,
        boostSpeed: 47.0,
        accel: 19.5,
        targetLane: -1.0,
        gridPos: new THREE.Vector3(-3.5, 0, -98.0)
      }
    ];

    for (const conf of configs) {
      const racer = new NPCRacer(conf, this.scene, this.track, this.particles, this.sound);
      this.racers.push(racer);
    }
  }

  reset() {
    this.raceTime = 0;
    for (const racer of this.racers) {
      racer.reset();
    }
  }

  update(dt, playerPhysics, isPlaying, weaponManager = null) {
    if (!isPlaying) {
      for (const racer of this.racers) {
        racer.update(dt, false, playerPhysics, weaponManager, this.racers);
      }
      return;
    }

    this.raceTime += dt;

    // 1. Update each NPC racer logic
    for (const racer of this.racers) {
      racer.update(dt, true, playerPhysics, weaponManager, this.racers);
    }

    // 1.5 Rubberband catch-up respawn: Bring distant NPCs directly behind player
    this._checkRubberbandRespawns(playerPhysics, dt);

    // 2. Collision detection: Player vs NPCs (Bounce battle, no total destruction)
    const playerPos = playerPhysics.pos;
    const playerSpeed = playerPhysics.vel.length();

    for (const racer of this.racers) {
      const dx = playerPos.x - racer.pos.x;
      const dz = playerPos.z - racer.pos.z;
      const dist = Math.hypot(dx, dz);

      const collisionRadius = 1.35; // Chair boundary radius ~0.65m each
      if (dist < collisionRadius && dist > 0.001) {
        const nx = dx / dist;
        const nz = dz / dist;
        const normal = new THREE.Vector3(nx, 0, nz);

        // Relative speed impact
        const bounceStrength = Math.max(12.0, playerSpeed * 0.65 + racer.currentSpeed * 0.45);

        // Apply impulse to player
        playerPhysics.applyBounceImpulse(normal.clone().multiplyScalar(bounceStrength * 0.65), 0.45);

        // Apply impulse to NPC
        racer.applyBounce(normal.clone().multiplyScalar(-1.0), bounceStrength * 0.5);

        // Emit clash sparks between the chairs
        const clashMidpoint = playerPos.clone().add(racer.pos).multiplyScalar(0.5);
        this.particles.emitWallSparks(clashMidpoint, normal);
      }
    }

    // 3. Collision detection: NPC vs NPC
    for (let i = 0; i < this.racers.length; i++) {
      for (let j = i + 1; j < this.racers.length; j++) {
        const r1 = this.racers[i];
        const r2 = this.racers[j];
        const dx = r1.pos.x - r2.pos.x;
        const dz = r1.pos.z - r2.pos.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 1.35 && dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          r1.applyBounce(new THREE.Vector3(nx, 0, nz), 8.0);
          r2.applyBounce(new THREE.Vector3(-nx, 0, -nz), 8.0);
        }
      }
    }
  }

  // Catch-up Rubberband Respawn: NPCs that fall too far behind respawn directly behind the player
  _checkRubberbandRespawns(playerPhysics, dt) {
    if (!playerPhysics || playerPhysics.isFinished || playerPhysics.wrongWay) return;
    // Allow start grid launch for initial 3.0 seconds
    if (this.raceTime < 3.0) return;

    const spline = this.track.trackSpline;
    if (!spline) return;
    const trackLen = this.track.getTrackLength ? this.track.getTrackLength() : spline.getLength();

    // Continuous player progress along circuit
    const uPlayer = this.track.getClosestProgress
      ? this.track.getClosestProgress(playerPhysics.pos.x, playerPhysics.pos.z)
      : 0;
    let effectiveU = uPlayer;
    if ((playerPhysics.checkpointsPassed || 0) < 3 && uPlayer > 0.7) {
      effectiveU = uPlayer - 1.0;
    }
    const playerTotalDist = (playerPhysics.lap - 1) * trackLen + effectiveU * trackLen;

    // Check rival racers that fell too far behind (off-screen threshold)
    for (let i = 0; i < this.racers.length; i++) {
      const racer = this.racers[i];
      if (racer.respawnCooldown > 0 || racer.isCatchingUp) continue;

      const distBehind = playerTotalDist - racer.distance;
      const dx = playerPhysics.pos.x - racer.pos.x;
      const dz = playerPhysics.pos.z - racer.pos.z;
      const euclidDist = Math.hypot(dx, dz);

      // Trigger off-screen catch-up respawn if:
      // 1) NPC is > 65m behind along spline, OR
      // 2) NPC Euclidean distance is > 60m and distBehind > 20m
      if (distBehind > 65.0 || (euclidDist > 60.0 && distBehind > 20.0)) {
        // Stagger spawn position far back OFF-SCREEN (75m to 110m behind player)
        const spawnOffset = 75.0 + (i % 6) * 6.5 + Math.random() * 4.0;
        racer.respawnBehind(playerPhysics, spline, trackLen, playerTotalDist, spawnOffset);
      }
    }
  }

  // Calculate real-time rank of all 12 competitors (Player + 11 Rival NPCs)
  // Returns: { playerRank: 1..12, totalRacers: 12, participants: [...] }
  calculateRankings(playerPhysics) {
    const trackLen = this.track.getTrackLength ? this.track.getTrackLength() : (this.track.trackSpline ? this.track.trackSpline.getLength() : 1600);

    // Continuous player progress calculation along circuit
    const uPlayer = this.track.getClosestProgress
      ? this.track.getClosestProgress(playerPhysics.pos.x, playerPhysics.pos.z)
      : 0;
    let effectiveU = uPlayer;
    if ((playerPhysics.checkpointsPassed || 0) < 3 && uPlayer > 0.7) {
      effectiveU = uPlayer - 1.0;
    }
    const playerProgress = (playerPhysics.lap - 1) * trackLen + effectiveU * trackLen;

    const participants = [
      {
        name: 'PLAYER',
        isPlayer: true,
        progress: playerProgress,
        lap: playerPhysics.lap
      }
    ];

    for (const racer of this.racers) {
      participants.push({
        name: racer.name,
        isPlayer: false,
        progress: racer.distance,
        lap: racer.lap
      });
    }

    // Sort descending by progress (furthest ahead gets 1st)
    participants.sort((a, b) => b.progress - a.progress);

    let playerRank = 1;
    for (let i = 0; i < participants.length; i++) {
      if (participants[i].isPlayer) {
        playerRank = i + 1;
        break;
      }
    }

    return {
      playerRank: playerRank,
      totalRacers: participants.length,
      participants: participants
    };
  }
}
