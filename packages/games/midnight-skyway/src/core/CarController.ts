import * as THREE from 'three';
import { CarBase } from '../models/CarBase';
import { readPad } from '../../../../shared/arcadePad';

export interface DriveInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export type CameraMode = 'chase' | 'hood' | 'cockpit' | 'orbit';

export class CarController {
  public car: CarBase;
  public position: THREE.Vector3;
  public rotationY: number = 0;

  // Dynamics & Speed
  public speed: number = 0;             // m/s
  public canDrive: boolean = true;      // Controlled by TimeAttackManager (countdown etc.)
  public maxSpeed: number = 38.0;       // ~137 km/h (Kei-car top speed)
  public maxReverseSpeed: number = 10.0;// ~36 km/h
  public acceleration: number = 14.0;   // m/s^2
  public braking: number = 8.0;         // m/s^2 (a gentler brake: it used to stop the car too hard)
  public dragCoeff: number = 0.985;     // Natural deceleration / air resistance
  public currentSteerAngle: number = 0; // Front wheels steer angle (radians)
  public maxSteerAngle: number = 0.55;  // Max wheel turn angle

  // Body Dynamics (Roll, Pitch, Suspension)
  public bodyRoll: number = 0;
  public bodyPitch: number = 0;
  /** 衝突で弾かれている速度(m/s, ワールドXZ)。毎フレーム減衰する */
  private knockVelX = 0;
  private knockVelZ = 0;

  // Drift Dynamics (Brake-initiated drift)
  public isDrifting: boolean = false;
  public driftDirection: number = 0;   // -1: right, 1: left
  public driftFactor: number = 0;      // 0.0 (grip) to 1.0 (drift slide)
  public slipAngle: number = 0;        // Car yaw vs velocity heading difference
  public velocityHeading: number = 0;  // Direction car is sliding/moving

  // Drift score & boost (only when a map switches them on: competitive courses)
  public driftBoostEnabled: boolean = false;
  public driftScore: number = 0;          // banked points of this run
  public driftChain: number = 0;          // points of the drift in progress (banked when it ends cleanly)
  public driftChainTime: number = 0;      // seconds the current drift has lasted
  public boostTimer: number = 0;          // seconds of boost left
  public boostMax: number = 1;            // length of the boost in progress (for the meter)
  /** Fired when a drift is banked: points and the boost it earned. */
  public onDriftBanked: ((points: number, boostSec: number) => void) | null = null;

  /** When set, the car drives itself (winning run): analog steer -1..1 (+ = towards +rotationY), throttle, brake. */
  public autopilot: { steer: number; throttle: boolean; brake: boolean } | null = null;

  // Road-surface attitude set by the map (radians); added to the suspension motion
  public groundPitch: number = 0;

  // Active camera mode
  public cameraMode: CameraMode = 'chase';

  /** Returns true while a menu owns the arcade pad (set by main.ts). */
  public padBlocked: () => boolean = () => false;

  // Input states
  private inputs: DriveInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    handbrake: false,
  };

  private keydownHandler: (e: KeyboardEvent) => void;
  private keyupHandler: (e: KeyboardEvent) => void;

  constructor(car: CarBase) {
    this.car = car;
    this.car.initSuspension();
    this.position = new THREE.Vector3(0, 0, 0);
    this.applyCarSpecs();

    this.keydownHandler = this.onKeyDown.bind(this);
    this.keyupHandler = this.onKeyUp.bind(this);
    this.bindInputs();
  }

  public setCar(car: CarBase): void {
    this.car = car;
    this.car.initSuspension();
    this.applyCarSpecs();
  }

  /**
   * Applies car-specific dynamic parameters based on vehicle class and mass.
   * Cross J (870kg): Speedster & agile handling
   * Trail J (1,040kg): Balanced 4WD, high stability & knockback resistance
   * Combat Sedan (2,150kg): Straight-line power, heavier understeer
   * Truck J MLRS (1,280kg): Heavy lifted chassis, slowest top speed
   */
  public applyCarSpecs(): void {
    const name = this.car?.specs?.name?.toUpperCase() || '';
    if (name.includes('CROSS')) {
      this.maxSpeed = 42.0;       // ~151 km/h (最高速 ★★★★★)
      this.acceleration = 16.5;   // m/s^2 (加速力 ★★★★★)
      this.maxSteerAngle = 0.62;  // 旋回力 ★★★★★
      this.braking = 9.5;
    } else if (name.includes('TRAIL')) {
      this.maxSpeed = 38.5;       // ~139 km/h (最高速 ★★★★☆)
      this.acceleration = 14.5;   // m/s^2 (加速力 ★★★★☆)
      this.maxSteerAngle = 0.55;  // 旋回力 ★★★★☆
      this.braking = 8.5;
    } else if (name.includes('COMBAT')) {
      this.maxSpeed = 39.5;       // ~142 km/h (最高速 ★★★★☆)
      this.acceleration = 13.0;   // m/s^2 (立ち上がりは重量級)
      this.maxSteerAngle = 0.46;  // 旋回力 ★★☆☆☆ (急カーブでアンダーステア)
      this.braking = 7.5;
    } else if (name.includes('MLRS') || name.includes('TRUCK')) {
      this.maxSpeed = 36.5;       // ~131 km/h (最高速 ★★★☆☆)
      this.acceleration = 12.0;   // m/s^2
      this.maxSteerAngle = 0.44;  // 旋回力 ★★☆☆☆
      this.braking = 7.5;
    } else {
      this.maxSpeed = 38.0;
      this.acceleration = 14.0;
      this.maxSteerAngle = 0.55;
      this.braking = 8.0;
    }
  }

  public resetPosition(pos: THREE.Vector3, rotY: number = 0): void {
    this.position.copy(pos);
    this.rotationY = rotY;
    this.velocityHeading = rotY;
    this.speed = 0;
    this.currentSteerAngle = 0;
    this.bodyRoll = 0;
    this.bodyPitch = 0;
    this.knockVelX = 0;
    this.knockVelZ = 0;
    this.isDrifting = false;
    this.driftDirection = 0;
    this.driftFactor = 0;
    this.slipAngle = 0;
    this.driftScore = 0;
    this.driftChain = 0;
    this.driftChainTime = 0;
    this.boostTimer = 0;
    this.autopilot = null;
    this.updateCarTransforms();
  }

  /**
   * 他車との接触。めり込みの解消(押し戻し)は毎フレーム行い、弾き飛ばし・車体の揺れ・向きの乱れは
   * 接触の初回(fresh)だけ与える。毎フレーム足すと車体が大きく傾いたり向きが回り続けるため。
   */
  public applyKnockback(
    pushX: number, pushZ: number, impact: number, isRearEnd: boolean = false,
    knockX: number = 0, knockZ: number = 0, fresh: boolean = true, turn: number = impact,
  ): void {
    this.position.x += pushX;
    this.position.z += pushZ;
    if (!fresh) return;

    // Trail Jは強固なラダーフレームにより接触衝撃・吹き飛びを60%軽減
    const isTrail = this.car?.specs?.name?.toUpperCase().includes('TRAIL');
    const knockResistance = isTrail ? 0.4 : 1.0;

    // 弾かれる速度(横・後ろへ滑り、すぐ減衰する)
    this.knockVelX += knockX * knockResistance;
    this.knockVelZ += knockZ * knockResistance;

    const sideSign = (pushX * Math.cos(this.rotationY) - pushZ * Math.sin(this.rotationY)) > 0 ? 1 : -1;
    // 向きの乱れは turn の分だけ(横からの接触では0: 当たっても進行方向は変わらない)
    this.rotationY += sideSign * Math.min(0.22, turn * 0.18 * knockResistance);
    this.velocityHeading += sideSign * Math.min(0.32, turn * 0.25 * knockResistance);
    this.bodyRoll = THREE.MathUtils.clamp(this.bodyRoll + sideSign * Math.min(0.18, impact * 0.16 * knockResistance), -0.2, 0.2);
    this.slipAngle += sideSign * Math.min(0.35, turn * 0.3 * knockResistance);
    const pitchAdd = isRearEnd ? Math.min(0.15, impact * 0.12 * knockResistance) : -Math.min(0.08, impact * 0.08 * knockResistance);
    this.bodyPitch = THREE.MathUtils.clamp(this.bodyPitch + pitchAdd, -0.12, 0.12);
  }

  private bindInputs(): void {
    window.addEventListener('keydown', this.keydownHandler);
    window.addEventListener('keyup', this.keyupHandler);
  }

  // キーボード: W = 加速、A / D = ハンドル、Space = ハンドブレーキ(ドリフト)。矢印キーは使わない(減速のキーも無い)
  private onKeyDown(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW':
        this.inputs.forward = true;
        e.preventDefault();
        break;
      case 'KeyA':
        this.inputs.left = true;
        break;
      case 'KeyD':
        this.inputs.right = true;
        break;
      case 'Space':
        this.inputs.handbrake = true;
        e.preventDefault();
        break;
    }
  }

  private onKeyUp(e: KeyboardEvent): void {
    switch (e.code) {
      case 'KeyW':
        this.inputs.forward = false;
        break;
      case 'KeyA':
        this.inputs.left = false;
        break;
      case 'KeyD':
        this.inputs.right = false;
        break;
      case 'Space':
        this.inputs.handbrake = false;
        break;
    }
  }

  /**
   * Main Physics & Animation update tick (called every frame)
   */
  public update(delta: number): void {
    const dt = Math.min(delta, 0.05); // Clamp max timestep

    // Keyboard + arcade pad (lever left/right = steer, A = accelerate, B = handbrake). The pad is ignored while a pause/result menu is using it.
    const pad = this.padBlocked() ? null : readPad();
    const inp: DriveInputState = {
      forward: this.inputs.forward || !!pad?.buttons[0],
      backward: this.inputs.backward,                      // 減速の操作は無い(オートパイロットだけが使う)
      left: this.inputs.left || !!pad?.left,
      right: this.inputs.right || !!pad?.right,
      handbrake: this.inputs.handbrake || !!pad?.buttons[1],
    };

    if (this.autopilot) {
      inp.forward = this.autopilot.throttle;
      inp.backward = this.autopilot.brake;
      inp.left = inp.right = inp.handbrake = false;
    }

    // Check drift trigger:
    // When speed > 7.5 m/s (~27 km/h), the wheel is actually turned, and brake is pressed (S key/Down/Handbrake)
    const isBraking = inp.backward || inp.handbrake;
    const steerIntent = inp.left ? 1 : (inp.right ? -1 : 0);

    if (!this.isDrifting && this.speed > 7.5 && steerIntent !== 0 && isBraking && Math.abs(this.currentSteerAngle) > 0.05) {
      this.isDrifting = true;
      this.driftDirection = steerIntent;
      this.velocityHeading = this.rotationY;
    }

    // Drift continuation & exit conditions
    if (this.isDrifting) {
      if (this.speed < 5.0) {
        // Drop out of drift if car slows down too much
        this.isDrifting = false;
      } else if (!isBraking) {
        // The drift lasts only while the brake / handbrake button is held: letting go ends it at once
        this.isDrifting = false;
      }
    }

    if (this.driftBoostEnabled) this.updateDriftScore(dt);

    // Smooth drift transition factor (0 = grip, 1 = full drift)
    const targetDriftFactor = this.isDrifting ? 1.0 : 0.0;
    this.driftFactor = THREE.MathUtils.lerp(this.driftFactor, targetDriftFactor, Math.min(1, (this.isDrifting ? 10.0 : 9.0) * dt));

    // 1. Steering with speed sensitivity & drift allowance
    const v = Math.abs(this.speed);
    const normalMaxSteer = Math.min(this.maxSteerAngle, Math.atan((2.45 * 14) / Math.max(v * v, 1)));
    // Restrain max drift steer so the car doesn't turn in too sharply
    const driftMaxSteer = Math.min(this.maxSteerAngle * 0.85, normalMaxSteer * 1.25);
    const effectiveMaxSteer = THREE.MathUtils.lerp(normalMaxSteer, driftMaxSteer, this.driftFactor);

    let targetSteer = 0;
    if (inp.left) targetSteer += effectiveMaxSteer;
    if (inp.right) targetSteer -= effectiveMaxSteer;

    if (this.autopilot) targetSteer = this.autopilot.steer * effectiveMaxSteer;

    const rate = targetSteer === 0 ? 16 : (this.isDrifting ? 11 : 9);
    this.currentSteerAngle = THREE.MathUtils.lerp(this.currentSteerAngle, targetSteer, Math.min(1, rate * dt));

    // 2. Acceleration & Braking Dynamics
    const vMax = this.boostTimer > 0 ? this.maxSpeed * 1.2 : this.maxSpeed;
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      if (this.speed > 0 && this.speed < vMax && this.canDrive) this.speed = Math.min(vMax, this.speed + 11.0 * dt);   // extra push, with or without the throttle
    }
    // 変速: 加速中にギアが上がると、一瞬だけ駆動が抜けて加速が鈍る(惰性で進む)
    const gearBefore = this.gearNum;
    this.syncGear();
    if (this.gearNum > gearBefore && inp.forward && this.speed > 0) this.shiftTimer = CarController.SHIFT_TIME;
    const shiftFactor = this.shiftTimer > 0 ? CarController.SHIFT_POWER : 1;
    this.shiftTimer = Math.max(0, this.shiftTimer - dt);
    if (inp.forward) {
      if (this.speed < -0.1) {
        // Braking in reverse
        this.speed += this.braking * dt;
      } else {
        // Accelerate forward (power curve: responsive at low-mid, tapering at top)
        const powerFactor = Math.max(0.2, 1.0 - (this.speed / vMax) * 0.8);
        // In drift, give full power/boost so the player can power-slide at top speed
        const driftPowerFactor = this.isDrifting ? 1.05 : 1.0;
        this.speed += this.acceleration * powerFactor * driftPowerFactor * shiftFactor * dt;
        if (this.speed > vMax) this.speed -= (this.speed - vMax) * 0.35 * dt;   // above the top speed (boost ended, downhill) it eases back instead of snapping
      }
    } else if (inp.backward) {
      if (this.speed > 0.1) {
        // Braking while going forward:
        // In drift, keep high speed momentum (only very light scrub: ~1.5 m/s^2 instead of 24 m/s^2)
        const currentBraking = this.isDrifting ? 1.5 : this.braking;
        this.speed -= currentBraking * dt;
      } else {
        // Reversing
        this.speed -= this.acceleration * 0.6 * dt;
        if (this.speed < -this.maxReverseSpeed) this.speed = -this.maxReverseSpeed;
      }
    } else {
      // Coasting deceleration: in drift, slide friction is low so car keeps high forward speed
      const currentDrag = this.isDrifting ? 0.998 : this.dragCoeff;
      this.speed *= Math.pow(currentDrag, dt * 60);
      if (Math.abs(this.speed) < 0.05) this.speed = 0;
    }

    // Handbrake: minimal speed scrub in drift to allow sustained slide
    if (inp.handbrake) {
      const handbrakeDecel = this.isDrifting ? 0.9995 : 0.97;
      this.speed *= Math.pow(handbrakeDecel, dt * 60);
    }

    // Sliding sideways costs speed: the more the car is turned against its direction of travel, the more it scrubs
    if (this.isDrifting && this.speed > 0) this.speed -= 1.2 * Math.min(1, Math.abs(this.slipAngle) / 0.35) * dt;

    if (!this.canDrive) {
      this.speed = 0;
    }

    // 3. Turning angular velocity (Bicycle model + Gentle drift slide)
    const wheelbase = 2.45; // ~2.45m
    let turnAngularVel = (this.speed / wheelbase) * Math.sin(this.currentSteerAngle);

    if (this.driftFactor > 0.01) {
      // Modest oversteer: tail rotates outward gently without snapping into a tight turn
      const oversteerMultiplier = 1.0 + 0.35 * this.driftFactor;
      turnAngularVel *= oversteerMultiplier;

      // Responsive counter-steering to easily straighten out
      const isCounterSteering = (this.driftDirection === 1 && inp.right) || (this.driftDirection === -1 && inp.left);
      if (isCounterSteering) {
        turnAngularVel *= 0.4;
      }
    }

    // Clamp turn angular velocity to prevent sudden aggressive spinning
    turnAngularVel = THREE.MathUtils.clamp(turnAngularVel, -1.25, 1.25);

    this.rotationY += turnAngularVel * dt;

    // 4. Inertial Velocity Heading & Slip Angle
    if (this.driftFactor > 0.01) {
      const followRate = inp.forward ? 2.5 : 3.2;
      let diff = this.rotationY - this.velocityHeading;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;

      // Clamp max slip angle (~20 degrees / 0.35 rad) so the car maintains speed and smooth arc through corners
      const maxSlip = 0.35;
      diff = THREE.MathUtils.clamp(diff, -maxSlip, maxSlip);

      this.velocityHeading += diff * Math.min(1, followRate * dt);
      this.slipAngle = this.rotationY - this.velocityHeading;
    } else {
      this.velocityHeading = this.rotationY;
      this.slipAngle = 0;
    }

    // 5. Position update (Movement follows inertial slide strongly, letting the car slide outward)
    const actualMoveHeading = THREE.MathUtils.lerp(this.rotationY, this.velocityHeading, this.driftFactor * 0.90);
    const forwardX = Math.sin(actualMoveHeading);
    const forwardZ = Math.cos(actualMoveHeading);

    this.position.x += forwardX * this.speed * dt;
    this.position.z += forwardZ * this.speed * dt;

    // 衝突で弾かれた分(横・後ろへ滑って止まる)
    if (this.knockVelX !== 0 || this.knockVelZ !== 0) {
      this.position.x += this.knockVelX * dt;
      this.position.z += this.knockVelZ * dt;
      const decay = Math.exp(-5 * dt);
      this.knockVelX *= decay;
      this.knockVelZ *= decay;
      if (Math.hypot(this.knockVelX, this.knockVelZ) < 0.05) { this.knockVelX = 0; this.knockVelZ = 0; }
    }

    // 6. Suspension Dynamics (Body Roll on cornering/drift, Pitch on accel/brake)
    const lateralAcc = turnAngularVel * this.speed;
    const maxRoll = this.isDrifting ? 0.10 : 0.07;
    const rollScale = this.isDrifting ? 0.008 : 0.006;
    const targetRoll = THREE.MathUtils.clamp(lateralAcc * rollScale, -maxRoll, maxRoll);
    const targetPitch = (inp.forward ? -0.025 : (inp.backward ? 0.035 : 0));

    this.bodyRoll = THREE.MathUtils.lerp(this.bodyRoll, targetRoll, 7.0 * dt);
    this.bodyPitch = THREE.MathUtils.lerp(this.bodyPitch, targetPitch, 8.0 * dt);

    // 7. Update Car Meshes and Wheels
    this.updateCarTransforms();
    this.animateWheels(dt);
  }

  /**
   * Applies weapon recoil kick impulse to suspension pitch and roll
   */
  public applyRecoilKick(pitchKick: number, rollKick: number = 0): void {
    this.bodyPitch += pitchKick;
    this.bodyRoll += rollKick;
  }

  /** Scores the drift in progress; when it ends cleanly and long enough it is banked and pays out a boost. */
  private updateDriftScore(dt: number): void {
    if (this.isDrifting) {
      this.driftChainTime += dt;
      const combo = 1 + Math.min(2, this.driftChainTime * 0.5);          // x1 -> x3 over four seconds
      this.driftChain += Math.abs(this.speed) * Math.abs(this.slipAngle) * 20 * combo * dt;
    } else if (this.driftChainTime > 0) {
      if (this.driftChainTime >= 0.6 && this.driftChain >= 25 && this.speed > 8) {
        const points = Math.round(this.driftChain);
        const boostSec = Math.min(3.0, Math.max(0.9, 0.8 + this.driftChainTime * 0.6));
        this.driftScore += points;
        this.boostTimer = Math.min(4.5, this.boostTimer + boostSec);
        this.boostMax = Math.max(this.boostTimer, 0.6);
        this.onDriftBanked?.(points, boostSec);
      }
      this.driftChain = 0;
      this.driftChainTime = 0;
    }
  }

  /**
   * Returns world contact positions for all 4 tires (used for tire smoke and skid effects)
   */
  public getTireContactPositions(): { rearLeft: THREE.Vector3; rearRight: THREE.Vector3; frontLeft: THREE.Vector3; frontRight: THREE.Vector3 } {
    const wheels = this.car.wheels;
    const groundY = this.position.y;

    const getPos = (index: number, fallbackOffset: THREE.Vector3): THREE.Vector3 => {
      const v = new THREE.Vector3();
      if (wheels && wheels[index]) {
        wheels[index].getWorldPosition(v);
        v.y = groundY;
      } else {
        v.copy(fallbackOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.rotationY).add(this.position);
      }
      return v;
    };

    return {
      frontLeft: getPos(0, new THREE.Vector3(-0.65, 0, 1.2)),
      frontRight: getPos(1, new THREE.Vector3(0.65, 0, 1.2)),
      rearLeft: getPos(2, new THREE.Vector3(-0.65, 0, -1.2)),
      rearRight: getPos(3, new THREE.Vector3(0.65, 0, -1.2)),
    };
  }

  private updateCarTransforms(): void {
    // Whole car: position, heading and the slope of the road (wheels stay on the surface)
    this.car.group.position.copy(this.position);
    this.car.group.rotation.set(this.groundPitch, this.rotationY, 0, 'YXZ');
    // Suspension: only the body pitches / rolls, around its pivot, so the wheels never sink into the road
    this.car.bodyPivot?.rotation.set(this.bodyPitch, 0, this.bodyRoll);
  }

  /** Re-apply the transform after a map moved the car (ground snap / boundary push-back). */
  public syncTransform(): void {
    this.updateCarTransforms();
  }

  /**
   * Wheels do NOT spin (by design). The front pair (indices 0 and 1) turns with the steering, always relative to the yaw
   * each wheel was built with (outer face outward). The rear wheels keep their built orientation.
   */
  private animateWheels(_dt: number): void {
    const wheels = this.car.wheels;
    if (!wheels || wheels.length < 4) return;
    const base = this.car.wheelBaseYaw;
    wheels.forEach((w, i) => {
      w.rotation.x = 0;
      w.rotation.y = (base[i] ?? 0) + (i < 2 ? this.currentSteerAngle : 0);
    });
  }

  /**
   * Speed in km/h for UI display
   */
  public get speedKmH(): number {
    return Math.abs(Math.round(this.speed * 3.6));
  }

  /** 6速。各ギアで出せる最高速(最高速に対する割合)。ブースト中の最高速超えは6速のまま */
  private static readonly GEAR_TOP = [0.2, 0.36, 0.52, 0.68, 0.84, 1.0];
  private gearNum = 1;
  private shiftTimer = 0;
  /** 変速で駆動が抜ける時間(秒)と、その間に残る加速の割合 */
  private static readonly SHIFT_TIME = 0.22;
  private static readonly SHIFT_POWER = 0.1;

  /** 速度からギアを決める: 回転が上がりきる手前で上げ、十分落ちたら下げる(境目はずらして、行き来しない) */
  private syncGear(): void {
    const v = Math.abs(this.speed) / this.maxSpeed;
    const top = CarController.GEAR_TOP;
    while (this.gearNum < top.length && v > top[this.gearNum - 1] * 0.93) this.gearNum++;
    while (this.gearNum > 1 && v < top[this.gearNum - 2] * 0.62) this.gearNum--;
  }

  /**
   * Current gear for HUD: 停止 P / 後退 R / 前進 1〜6
   */
  public get gear(): string {
    if (this.speed < -0.1) return 'R';
    if (Math.abs(this.speed) < 0.1) return 'P';
    this.syncGear();
    return String(this.gearNum);
  }

  /**
   * Simulated RPM for gauges / engine sound: ギアごとに上がり、変速で落ちる
   */
  public get rpm(): number {
    const idle = 850;
    const maxRpm = 6500;
    this.syncGear();
    const gearTop = CarController.GEAR_TOP[this.gearNum - 1] * this.maxSpeed;
    const ratio = Math.min(1.04, Math.abs(this.speed) / gearTop);
    const rpm = idle + (maxRpm - idle) * Math.pow(ratio, 0.85);
    return Math.round(this.shiftTimer > 0 ? rpm * 0.92 : rpm);   // 変速の間は、回転が少し沈む
  }
}
