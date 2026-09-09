// ============================================================================
// physics.js - Ground Drift Physics, Jet Thrust, Collisions & Lap Progress
// ============================================================================

import * as THREE from 'three';

export class PhysicsEngine {
  constructor(track, chair, particles, sound) {
    this.track = track;
    this.chair = chair;
    this.particles = particles;
    this.sound = sound;

    // Position & Orientation
    this.pos = new THREE.Vector3(0, 0, 0); // Start line (Z=0, facing +Z along straight)
    this.vel = new THREE.Vector3(0, 0, 0); // Linear velocity (m/s)
    this.yaw = Math.PI / 2;                // Facing +Z along forward track (radians)
    this.yawRate = 0;                     // Angular velocity (rad/s)

    // Vertical physics for Tombo jump/bounce & elevation
    this.posY = 0;
    this.velY = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.isAirborne = false;

    // Jet Energy (0.0 to 1.0)
    this.jetEnergy = 1.0;
    this.isJetting = false;
    this.isBraking = false;
    this.isDrifting = false;
    this.isMud = false;

    // Screen Shake & Whiteout
    this.screenShake = 0;
    this.whiteout = 0; // 0.0 to 1.0

    // Lap & Checkpoints
    this.currentCheckpoint = 1; // Start aiming for Checkpoint 1
    this.checkpointsPassed = 0;
    this.totalCheckpoints = track.checkpoints.length;
    this.lap = 1;
    this.maxLaps = 1;
    this.isFinished = false;
    this.isCrashed = false;
    this.crashReason = '';
    this.wrongWay = false;
    this.wrongWayTimer = 0;
    this.wallSoundCooldown = 0;

    // Physical constants
    this.mass = 120; // Chair + Fire extinguishers + Rider (kg)
    this.normalGrip = 9.0;
    this.driftGrip = 3.5;
    this.footBrakeDrag = 28.0;
    this.jetForce = 7200; // Produces >200 km/h acceleration
    this.topSpeedLimit = 65; // ~234 km/h
  }

  reset() {
    this.pos.set(0, 0, 0);
    this.vel.set(0, 0, 0);
    this.yaw = Math.PI / 2;
    this.yawRate = 0;

    this.posY = 0;
    this.velY = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.isAirborne = false;

    this.jetEnergy = 1.0;
    this.jetDepleted = false;
    this.isJetting = false;
    this.isBraking = false;
    this.isDrifting = false;
    this.isMud = false;

    this.screenShake = 0;
    this.whiteout = 0;

    this.currentCheckpoint = 1;
    this.checkpointsPassed = 0;
    this.isFinished = false;
    this.isCrashed = false;
    this.crashReason = '';
    this.wrongWay = false;
    this.wrongWayTimer = 0;
    this.wallSoundCooldown = 0;
    this.isSpinning = false;
    this.spinTimer = 0;

    this.chair.reset();
  }

  update(dt, input) {
    if (this.isCrashed) {
      this.chair.updateDebris(dt);
      return;
    }

    // Spinout behavior when hit by rival bomb
    if (this.isSpinning) {
      this.spinTimer -= dt;
      this.yaw += this.yawRate * dt;
      this.yawRate *= 0.94;
      this.vel.multiplyScalar(Math.max(0, 1 - 2.2 * dt)); // slide & decelerate
      if (this.spinTimer <= 0) {
        this.isSpinning = false;
        this.yawRate = 0;
      }

      this.pos.addScaledVector(this.vel, dt);
      this.chair.group.position.set(this.pos.x, this.posY, this.pos.z);
      this.chair.group.rotation.set(0, Math.PI / 2 - this.yaw, 0);
      this.chair.updateWorldPositions();
      this.chair.setDynamics(0, 0, 0);

      this.particles.emitDriftDust(this.chair.leftCasterWorldPos, this.vel, 2.0);
      this.particles.emitDriftDust(this.chair.rightCasterWorldPos, this.vel, 2.0);

      this.screenShake = Math.max(0, this.screenShake - 1.8 * dt);
      this.whiteout = Math.max(0, this.whiteout - 0.7 * dt);

      this.sound.update({
        isJetting: false,
        speedKmH: this.vel.length() * 3.6,
        isBraking: false,
        isDrifting: true,
        isMud: false
      });
      return;
    }

    // Cooldown timers
    this.wallSoundCooldown = Math.max(0, this.wallSoundCooldown - dt);

    const currentSpeed = this.vel.length();
    const speedKmH = currentSpeed * 3.6;

    // 0. Terrain elevation & surface features (Continuous smooth spline elevation + bumps - dips)
    const groundBaseY = this.track.getSmoothElevation
      ? this.track.getSmoothElevation(this.pos.x, this.pos.z)
      : this.track.getSplineYAt(this.pos.x, this.pos.z);

    // Bump (Mound) interaction: jump hop
    let bumpHeight = 0;
    if (this.track.bumps) {
      for (let i = 0; i < this.track.bumps.length; i++) {
        const b = this.track.bumps[i];
        const dist = Math.hypot(this.pos.x - b.x, this.pos.z - b.z);
        if (dist < b.radius) {
          const factor = Math.cos((dist / b.radius) * (Math.PI / 2));
          bumpHeight = Math.max(bumpHeight, factor * b.height);

          // Launch hop when hitting bump at speed
          if (currentSpeed > 7.0 && !this.isAirborne && dist < b.radius * 0.65) {
            this.isAirborne = true;
            this.velY = 5.0 + (currentSpeed / 25.0) * 4.0;
            this.pitch = 0.16;
            this.sound.playBumpHop();
            this.screenShake = Math.max(this.screenShake, 0.35);
            this.particles.emitDriftDust(this.chair.group.position, this.vel, 2.0);
          }
        }
      }
    }

    // Dip (Pothole) interaction: dip depth & mud drag
    let dipDepth = 0;
    if (this.track.dips) {
      for (let i = 0; i < this.track.dips.length; i++) {
        const d = this.track.dips[i];
        const dist = Math.hypot(this.pos.x - d.x, this.pos.z - d.z);
        if (dist < d.radius) {
          const factor = Math.cos((dist / d.radius) * (Math.PI / 2));
          dipDepth = Math.max(dipDepth, factor * d.depth);

          if (currentSpeed > 4.0 && !this.isAirborne) {
            this.vel.multiplyScalar(Math.pow(0.85, dt * 6.0)); // Speed penalty in mud dip
            this.screenShake = Math.max(this.screenShake, 0.35);
            if (this.wallSoundCooldown <= 0) {
              this.sound.playDipImpact();
              this.wallSoundCooldown = 0.35;
            }
            this.particles.emitMudSplatter(this.chair.group.position, this.vel);
          }
        }
      }
    }

    const currentGroundY = groundBaseY + bumpHeight - dipDepth;

    // 1. Controls processing
    // Jet thrust processing with depletion lock & hysteresis (Prevents infinite acceleration bug)
    this.isJetting = false;

    if (this.jetDepleted) {
      // Must recharge to at least 30% before jet can be fired again
      this.jetEnergy = Math.min(1.0, this.jetEnergy + 0.16 * dt);
      if (this.jetEnergy >= 0.30) {
        this.jetDepleted = false;
      }
    } else {
      if (input.jet && this.jetEnergy > 0.01) {
        this.isJetting = true;
        this.jetEnergy -= 0.22 * dt;
        if (this.jetEnergy <= 0.01) {
          this.jetEnergy = 0;
          this.isJetting = false;
          this.jetDepleted = true; // Depleted! Lock until recharged to 30%
        }
      } else {
        // Natural replenishment when not firing jet
        this.jetEnergy = Math.min(1.0, this.jetEnergy + 0.16 * dt);
      }
    }

    this.isBraking = input.brake;

    // 2. Airborne Physics
    if (this.isAirborne) {
      this.velY -= 28.0 * dt; // gravity
      this.posY += this.velY * dt;

      this.pitch += this.pitchVel * dt;
      this.roll += this.rollVel * dt;

      // Air drag on orientation
      this.pitchVel *= 0.96;
      this.rollVel *= 0.96;

      // Landed
      if (this.posY <= currentGroundY) {
        this.posY = currentGroundY;
        this.velY = 0;
        this.isAirborne = false;
        this.pitch = 0;
        this.roll = 0;
        this.screenShake = Math.max(this.screenShake, 0.4);
      }
    } else {
      // Smooth suspension damping to eliminate discrete jitter on slopes & uneven ground
      const diffY = currentGroundY - this.posY;
      this.posY += diffY * Math.min(1.0, 35.0 * dt);
    }

    // 3. Ground Drift Dynamics (only steer when on ground)
    const forwardDir = new THREE.Vector3(Math.cos(this.yaw), 0, Math.sin(this.yaw));
    const rightDir = new THREE.Vector3(-Math.sin(this.yaw), 0, Math.cos(this.yaw));

    if (!this.isAirborne) {
      // Steering & Foot Brake Turn-in
      let steerPower = input.steer;
      let turnRate = 2.8;

      if (this.isBraking) {
        // Foot brake: Shoes grind into clay, nose snaps inwards aggressively!
        turnRate = 4.6;
        this.screenShake = Math.max(this.screenShake, 0.08);
      }

      // Higher speed slightly reduces steering authority without brake
      const speedFactor = Math.max(0.2, 1.0 - (currentSpeed / 70) * 0.45);
      const targetYawRate = steerPower * turnRate * speedFactor;
      this.yawRate += (targetYawRate - this.yawRate) * 12.0 * dt;
      this.yaw += this.yawRate * dt;

      // Decompose velocity into Forward and Lateral (Side) components
      const forwardSpeed = this.vel.dot(forwardDir);
      const lateralSpeed = this.vel.dot(rightDir);

      // Slip angle for drift detection
      const slipAngle = Math.abs(lateralSpeed) / (Math.abs(forwardSpeed) + 0.1);
      this.isDrifting = (slipAngle > 0.25 && currentSpeed > 8.0);

      // Tire / Ground Grip Simulation
      // Off track (mud) check
      this.isMud = this.track.isOffTrack(this.pos);

      let lateralGrip = this.isDrifting ? this.driftGrip : this.normalGrip;
      let rollingResistance = 1.2;

      if (this.isMud) {
        rollingResistance = 12.0; // Mud deceleration
        lateralGrip = 1.8;       // Very slippery
        this.screenShake = Math.max(this.screenShake, 0.2);
        this.particles.emitMudSplatter(this.pos, this.vel);
      }

      if (this.isBraking) {
        rollingResistance += this.footBrakeDrag;
        this.particles.emitFootBrake(this.chair.leftCasterWorldPos, this.vel);
        this.particles.emitFootBrake(this.chair.rightCasterWorldPos, this.vel);
      }

      // Forces
      let netForwardForce = 0;
      if (this.isJetting) {
        netForwardForce += this.jetForce;
        // Emit jet particles
        this.particles.emitJetSmoke(
          this.chair.leftNozzleWorldPos,
          this.chair.rightNozzleWorldPos,
          forwardDir
        );
      } else {
        // Natural aerodynamic air drag + rolling caster drag
        // Office chair at speeds > 60 km/h experiences strong deceleration without jet
        const airDrag = 0.65 * forwardSpeed * Math.abs(forwardSpeed);
        const rollingFriction = forwardSpeed * rollingResistance * this.mass * 0.35;
        netForwardForce -= (airDrag + rollingFriction);
      }

      // Lateral friction cancels out sideways sliding
      const lateralForce = -lateralSpeed * lateralGrip * this.mass;

      // Accelerations
      const fwdAcc = netForwardForce / this.mass;
      const latAcc = lateralForce / this.mass;

      // Reconstruct velocity
      const newFwdSpeed = Math.min(this.topSpeedLimit, forwardSpeed + fwdAcc * dt);
      const newLatSpeed = lateralSpeed + latAcc * dt;

      this.vel.copy(forwardDir).multiplyScalar(newFwdSpeed)
        .addScaledVector(rightDir, newLatSpeed);

      // Emit clay dust particles when sliding / drifting
      if (this.isDrifting || (currentSpeed > 15 && Math.abs(input.steer) > 0.3)) {
        const dustIntensity = Math.min(2.5, slipAngle * 1.8 + currentSpeed / 30);
        this.particles.emitDriftDust(this.chair.leftCasterWorldPos, this.vel, dustIntensity);
        this.particles.emitDriftDust(this.chair.rightCasterWorldPos, this.vel, dustIntensity);
      }

      // Dynamic Chair visual tilt
      const rollTarget = -this.yawRate * (currentSpeed / 40) * 0.25;

      // Calculate terrain slope pitch in direction of heading for natural uphill/downhill tilt
      const elevAhead = this.track.getSmoothElevation
        ? this.track.getSmoothElevation(this.pos.x + forwardDir.x * 1.5, this.pos.z + forwardDir.z * 1.5)
        : this.track.getSplineYAt(this.pos.x + forwardDir.x * 1.5, this.pos.z + forwardDir.z * 1.5);
      const elevBehind = this.track.getSmoothElevation
        ? this.track.getSmoothElevation(this.pos.x - forwardDir.x * 1.5, this.pos.z - forwardDir.z * 1.5)
        : this.track.getSplineYAt(this.pos.x - forwardDir.x * 1.5, this.pos.z - forwardDir.z * 1.5);
      const slopePitch = Math.atan2(elevAhead - elevBehind, 3.0);

      const pitchTarget = (this.isJetting ? 0.08 : (this.isBraking ? -0.12 : 0)) + slopePitch;
      this.chair.setDynamics(rollTarget, pitchTarget, steerPower);
    } else {
      // In mid-air: jet propulsion with smoke if firing, plus aerodynamic flight drag
      if (this.isJetting) {
        this.vel.addScaledVector(forwardDir, (this.jetForce / this.mass) * dt);
        this.particles.emitJetSmoke(
          this.chair.leftNozzleWorldPos,
          this.chair.rightNozzleWorldPos,
          forwardDir
        );
      }
      const hSpeed = this.vel.length();
      if (hSpeed > 0.5) {
        const airDrag = 0.55 * hSpeed * hSpeed / this.mass;
        const speedRatio = Math.max(0, 1 - (airDrag * dt) / hSpeed);
        this.vel.multiplyScalar(speedRatio);
      }
      if (this.vel.length() > this.topSpeedLimit) {
        this.vel.setLength(this.topSpeedLimit);
      }

      // In mid-air, apply visual chaotic tumbling
      this.chair.setDynamics(this.roll, this.pitch, 0);
    }

    // 4. Update Position
    this.pos.addScaledVector(this.vel, dt);

    // Apply transform to chair group
    this.chair.group.position.set(this.pos.x, this.posY, this.pos.z);
    this.chair.group.rotation.set(0, Math.PI / 2 - this.yaw, 0);
    this.chair.updateWorldPositions();

    // 5. Obstacle & Gimmick Collisions
    this._checkCollisions(currentSpeed);

    // 6. Checkpoints & Lap
    this._checkLapProgress(dt);

    // 7. Screen Shake decay
    this.screenShake = Math.max(0, this.screenShake - 1.8 * dt);

    // 8. Whiteout decay
    this.whiteout = Math.max(0, this.whiteout - 0.7 * dt);

    // 9. Sound update
    this.sound.update({
      isJetting: this.isJetting,
      speedKmH: speedKmH,
      isBraking: this.isBraking,
      isDrifting: this.isDrifting,
      isMud: this.isMud
    });
  }

  _checkTrackWallCollision(currentSpeed) {
    const chairPos = this.pos;
    const trackPoints = this.track.trackPoints;

    // Find closest point on spline
    let minDistSq = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < trackPoints.length; i++) {
      const dsq = chairPos.distanceToSquared(trackPoints[i]);
      if (dsq < minDistSq) {
        minDistSq = dsq;
        closestIdx = i;
      }
    }

    const centerPoint = trackPoints[closestIdx];
    const offsetVec = new THREE.Vector3(chairPos.x - centerPoint.x, 0, chairPos.z - centerPoint.z);
    const distFromCenter = offsetVec.length();

    const halfWidth = this.track.trackWidth * 0.5; // 7.0m
    const chairRadius = 0.55;
    const maxAllowedDist = halfWidth - chairRadius; // ~6.45m

    if (distFromCenter > maxAllowedDist) {
      const wallNormal = offsetVec.clone().normalize();
      const impactVelocity = this.vel.dot(wallNormal);

      // コースアウト完全防止: 壁の内側に位置を固定
      this.pos.x = centerPoint.x + wallNormal.x * maxAllowedDist;
      this.pos.z = centerPoint.z + wallNormal.z * maxAllowedDist;

      // 1. 強い激突 (Impact): ドン！と強く当たった場合
      if (impactVelocity > 2.0) {
        const restitution = 0.5;
        this.vel.addScaledVector(wallNormal, -(1.0 + restitution) * impactVelocity);
        this.vel.multiplyScalar(0.85); // 壁との摩擦減速

        // バウンド反動によるヨー回転
        this.yawRate += (Math.random() - 0.5) * impactVelocity * 0.5;

        // 火花と砂埃パーティクル
        this.particles.emitFootBrake(this.chair.group.position, this.vel);

        // 打撃音: クールダウン付きで単発再生（マシンガン連打ノイズを完全排除）
        if (this.wallSoundCooldown <= 0) {
          this.sound.playObstacleHit();
          this.wallSoundCooldown = 0.25;
        }

        const shakeIntensity = Math.min(0.7, impactVelocity * 0.04 + 0.2);
        this.screenShake = Math.max(this.screenShake, shakeIntensity);
      }
      // 2. ゆっくり接触・壁擦り (Scrape / Slide): ゆっくり壁に触れた場合
      else if (impactVelocity > 0) {
        // 壁に向かう速度成分のみを綺麗に除去（振動・チャタリングを完全解消し、滑らかに壁沿いを滑らせる）
        this.vel.addScaledVector(wallNormal, -impactVelocity);
        // 壁に沿って走る微小な摩擦減衰
        this.vel.multiplyScalar(0.97);

        // ゆっくり触れている時は打撃音は一切鳴らさず、速度がある時のみ微細な火花
        if (currentSpeed > 4.0 && Math.random() < 0.25) {
          this.particles.emitFootBrake(this.chair.group.position, this.vel);
        }
      }
    }
  }

  // 0.1 ジャンプ台 (大空への打ち上げジャンプ)
  _checkJumpRamps(currentSpeed) {
    const chairPos = this.pos;
    const ramps = this.track.jumpRamps;
    if (!ramps) return;

    for (let i = 0; i < ramps.length; i++) {
      const ramp = ramps[i];
      const dx = chairPos.x - ramp.x;
      const dz = chairPos.z - ramp.z;

      const cosA = Math.cos(-ramp.angleY);
      const sinA = Math.sin(-ramp.angleY);
      const lx = dx * cosA - dz * sinA;
      const lz = dx * sinA + dz * cosA;

      if (Math.abs(lx) <= ramp.halfW && Math.abs(lz) <= ramp.halfL) {
        const rampBaseY = ramp.y || 0;
        const progress = (lz + ramp.halfL) / ramp.length;
        const slopeY = rampBaseY + Math.max(0, progress * ramp.height);

        if (!this.isAirborne) {
          this.posY = Math.max(this.posY, slopeY);
          this.pitch = 0.22;

          // Apex launch into the sky!
          if (progress >= 0.72 && currentSpeed > 5.0) {
            this.isAirborne = true;
            this.velY = 11.5 + (currentSpeed / 35.0) * 11.0; // High speed launches higher!
            this.vel.multiplyScalar(1.08); // speed boost on jump
            this.sound.playJumpRamp();
            this.screenShake = Math.max(this.screenShake, 0.45);
          }
        }
      }
    }
  }

  // 0.2 加速パッド (超加速 & JET全快ボーナス)
  _checkBoostPads(currentSpeed) {
    const chairPos = this.pos;
    const pads = this.track.boostPads;
    if (!pads) return;

    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad.cooldown > 0) continue;

      const dx = chairPos.x - pad.x;
      const dz = chairPos.z - pad.z;

      const cosA = Math.cos(-pad.angleY);
      const sinA = Math.sin(-pad.angleY);
      const lx = dx * cosA - dz * sinA;
      const lz = dx * sinA + dz * cosA;

      if (Math.abs(lx) <= pad.halfW && Math.abs(lz) <= pad.halfL) {
        pad.cooldown = 1.6;

        // Pad launch direction (+Z in local is sin(angleY), cos(angleY))
        const boostDir = new THREE.Vector3(Math.sin(pad.angleY), 0, Math.cos(pad.angleY)).normalize();

        // Shoot to >200 km/h instantly!
        const boostedSpeed = Math.max(this.vel.length() + 22.0, 58.0);
        this.vel.copy(boostDir).multiplyScalar(boostedSpeed);

        // Align yaw towards boost
        this.yaw = Math.atan2(boostDir.z, boostDir.x);

        // Bonus: Max out JET energy!
        this.jetEnergy = 1.0;
        this.isJetting = true;

        this.sound.playBoostPad();
        this.screenShake = Math.max(this.screenShake, 0.55);
        this.particles.emitFootBrake(this.chair.group.position, this.vel);
      }
    }
  }

  _checkCollisions(currentSpeed) {
    // 0. コース沿い防護壁判定 (コースアウト防止 & バウンド)
    this._checkTrackWallCollision(currentSpeed);

    // ジャンプ台 & 加速パッド判定
    this._checkJumpRamps(currentSpeed);
    this._checkBoostPads(currentSpeed);

    const chairPos = this.pos;

    // 1. 朝礼台 & 外周ネット (大破なし: バウンド反発のみ)
    for (let i = 0; i < this.track.lethalObjects.length; i++) {
      const obj = this.track.lethalObjects[i];
      if (obj.type === 'podium') {
        const dist = Math.hypot(chairPos.x - obj.x, chairPos.z - obj.z);
        if (dist < obj.radius) {
          // 強烈なバウンド反発で押し戻す
          const hitNormal = new THREE.Vector3(chairPos.x - obj.x, 0, chairPos.z - obj.z).normalize();
          this.pos.x = obj.x + hitNormal.x * (obj.radius + 0.1);
          this.pos.z = obj.z + hitNormal.z * (obj.radius + 0.1);

          const dot = this.vel.dot(hitNormal);
          if (dot < 0) {
            this.vel.addScaledVector(hitNormal, -1.6 * dot);
          } else {
            this.vel.multiplyScalar(-0.6);
          }
          this.screenShake = Math.max(this.screenShake, 0.65);
          this.sound.playObstacleHit();
          this.particles.emitFootBrake(this.chair.group.position, this.vel);
        }
      } else if (obj.type === 'fence') {
        const normX = chairPos.x / obj.radiusX;
        const normZ = chairPos.z / obj.radiusZ;
        const distSq = normX * normX + normZ * normZ;
        if (distSq > 1.0) {
          this.vel.multiplyScalar(-0.5);
          this.screenShake = Math.max(this.screenShake, 0.5);
          this.sound.playObstacleHit();
        }
      }
    }

    // 2. トンボ (整地具): 踏むと激しく跳ね上がりコントロール喪失
    for (let i = 0; i < this.track.tombos.length; i++) {
      const tombo = this.track.tombos[i];
      const dist = Math.hypot(chairPos.x - tombo.x, chairPos.z - tombo.z);
      if (dist < tombo.radius && !this.isAirborne && currentSpeed > 5.0) {
        // Bounce into air!
        this.isAirborne = true;
        this.velY = 7.5 + (currentSpeed / 40) * 4.0; // Jump height depends on speed
        this.pitchVel = (Math.random() - 0.5) * 14.0;
        this.rollVel = (Math.random() - 0.5) * 14.0;
        this.screenShake = 0.8;
        this.sound.playTomboBounce();

        // Slightly deflect horizontal velocity
        this.vel.x += (Math.random() - 0.5) * 8.0;
        this.vel.z += (Math.random() - 0.5) * 8.0;
      }
    }

    // 3. 石灰ライン引き粉末台車: 突入で真っ白な煙幕
    for (let i = 0; i < this.track.limeCarts.length; i++) {
      const cart = this.track.limeCarts[i];
      if (cart.hit) continue;
      const dist = Math.hypot(chairPos.x - cart.x, chairPos.z - cart.z);
      if (dist < cart.radius) {
        cart.hit = true;
        this.whiteout = 1.0; // Full whiteout screen effect
        this.screenShake = 0.6;
        this.sound.playLimeHit();
        this.particles.emitLimeExplosion(new THREE.Vector3(cart.x, 0.3, cart.z));
        this.vel.multiplyScalar(0.75); // slight slowdown
      }
    }

    // 4. サッカーゴール
    for (let i = 0; i < this.track.soccerGoals.length; i++) {
      const goal = this.track.soccerGoals[i];
      const dist = Math.hypot(chairPos.x - goal.x, chairPos.z - goal.z);
      if (dist < goal.radius) {
        this.vel.multiplyScalar(-0.6);
        this.screenShake = 0.5;
        this.sound.playObstacleHit();
      }
    }

    // 5. 散乱障害物 (パイロン, ハードル)
    for (let i = 0; i < this.track.dynamicObstacles.length; i++) {
      const obs = this.track.dynamicObstacles[i];
      if (obs.hit) continue;
      const dist = Math.hypot(chairPos.x - obs.pos.x, chairPos.z - obs.pos.z);
      if (dist < obs.radius + 0.6) {
        obs.hit = true;
        // Launch obstacle into the air!
        const hitDir = this.vel.clone().normalize();
        obs.vel.set(
          hitDir.x * (currentSpeed * 0.9 + 5.0) + (Math.random() - 0.5) * 4,
          5.0 + Math.random() * 8.0,
          hitDir.z * (currentSpeed * 0.9 + 5.0) + (Math.random() - 0.5) * 4
        );
        obs.rotVel.set(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        );

        // Player suffers a speed penalty and shake
        this.vel.multiplyScalar(0.82);
        this.screenShake = Math.max(this.screenShake, 0.3);
        this.sound.playObstacleHit();
      }
    }
  }

  _checkLapProgress(dt) {
    if (this.isFinished || this.isCrashed) return;

    // 1. チェックポイント進行 & 正確なゴールライン判定
    const targetCp = this.track.checkpoints[this.currentCheckpoint];
    const distToTarget = Math.hypot(this.pos.x - targetCp.position.x, this.pos.z - targetCp.position.z);

    if (distToTarget < targetCp.radius) {
      this.checkpointsPassed++;

      // 中間チェックポイントを通過中: 次のチェックポイントへ順送り
      if (this.currentCheckpoint > 0 && this.currentCheckpoint < this.totalCheckpoints - 1) {
        this.currentCheckpoint++;
      }
      // 最終コーナー出口のチェックポイントを通過した瞬間:
      // 次の目標を「チェックポイント 0（ゴールライン）」に設定！
      // ※この時点ではまだゴールではない！これからホームストレートを走ってチェッカーラインへ向かう
      else if (this.currentCheckpoint === this.totalCheckpoints - 1) {
        this.currentCheckpoint = 0;
      }
      // すべての中間チェックポイントを巡り、最後に「チェックポイント 0（ゴールライン）」のチェッカー白線を踏んだ瞬間！
      else if (this.currentCheckpoint === 0) {
        if (this.checkpointsPassed >= this.totalCheckpoints) {
          this.isFinished = true;
          this.sound.playFanfare();
        }
      }
    }

    // 2. 高精度・安定逆走判定 (接線マッチング + 時間デバウンス)
    const chairPos = this.pos;
    const trackPoints = this.track.trackPoints;
    let minDistSq = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < trackPoints.length; i++) {
      const dx = chairPos.x - trackPoints[i].x;
      const dz = chairPos.z - trackPoints[i].z;
      const dsq = dx * dx + dz * dz;
      if (dsq < minDistSq) {
        minDistSq = dsq;
        closestIdx = i;
      }
    }

    const trackTangent = this.track.trackTangents ? this.track.trackTangents[closestIdx] : null;
    const currentSpeed = this.vel.length();

    // 時速12km/h以上で走行中のみ進行方向ベクトルを比較
    if (trackTangent && currentSpeed > 3.5) {
      const moveDir = this.vel.clone().normalize();
      const alignment = moveDir.dot(trackTangent); // 正: 順走, 負: 逆走

      // 完全に180度近く逆走（alignment < -0.35）している場合のみタイマー蓄積
      if (alignment < -0.35) {
        this.wrongWayTimer += dt;
      } else {
        this.wrongWayTimer = Math.max(0, this.wrongWayTimer - 2.5 * dt);
      }

      // 0.6秒以上明らかに逆走し続けた場合のみ警告表示（一時的なスライドや急カーブでの誤判定を100%防止）
      this.wrongWay = (this.wrongWayTimer > 0.6);
    } else {
      this.wrongWayTimer = Math.max(0, this.wrongWayTimer - 3.0 * dt);
      this.wrongWay = false;
    }
  }

  _triggerCrash(reason) {
    this.isCrashed = true;
    this.crashReason = reason;
    this.sound.stopAll();
    this.sound.playCrash();
    this.screenShake = 1.6;
    this.chair.shatter(this.vel);
  }

  // 敵NPCやライバルとの弾き飛ばしバウンドバトル（大破なし）
  applyBounceImpulse(impulseVec, strength = 1.0) {
    this.vel.addScaledVector(impulseVec, strength);
    if (impulseVec.lengthSq() > 0.001) {
      this.pos.addScaledVector(impulseVec.clone().normalize(), 0.15);
    }
    this.screenShake = Math.max(this.screenShake, 0.45);
    if (this.wallSoundCooldown <= 0) {
      this.sound.playWallHit(0.85);
      this.wallSoundCooldown = 0.25;
    }
    this.particles.emitWallSparks(this.chair.group.position, impulseVec);
  }

  // ライバルのCO2ボンベ爆風直撃スピンアウト
  hitByBomb(pushDir, strength = 28.0) {
    this.isSpinning = true;
    this.spinTimer = 1.25;
    this.yawRate = (Math.random() < 0.5 ? 1 : -1) * (26.0 + Math.random() * 8.0);
    this.vel.multiplyScalar(0.22);
    this.vel.addScaledVector(pushDir, strength * 0.4);
    this.screenShake = 1.8;
    this.whiteout = 0.95;
    this.isJetting = false;
    this.jetDepleted = true;
    this.jetEnergy = 0.1;
    this.particles.emitLimeExplosion(this.pos);
    this.particles.emitWallSparks(this.chair.group.position, pushDir, 35);
  }
}
