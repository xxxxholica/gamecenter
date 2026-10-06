import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CharacterModel, CharacterColors } from './CharacterModel';
import { SoundManager } from '../audio/SoundManager';
import { ParticleManager } from '../effects/ParticleManager';

export type FighterActionState =
  | 'idle'
  | 'walk'
  | 'strike_hold'
  | 'harite'
  | 'buchikamashi_charge'
  | 'buchikamashi_rush'
  | 'grab_attempt'
  | 'grab_holding'
  | 'throw'
  | 'grabbed'
  | 'hit'
  | 'fall';

export interface FighterMoveInput {
  x: number;
  z: number;
  isMoving: boolean;
}

/** 操作は「打撃」と「つかみ」の2ボタンだけ。打撃はちょん押しで張り手、長押しでぶちかまし。 */
export interface FighterActions {
  strikePressed: boolean; // 打撃ボタンを押した瞬間
  strike: boolean; // 打撃ボタンを押している間
  strikeReleased: boolean; // 打撃ボタンを離した瞬間
  grabPressed: boolean; // つかみボタンを押した瞬間
}

/**
 * 通常の歩行速度(m/s)。
 * 以前は摩擦のせいで、設定値 13.5 に対して実際には約 1 m/s しか進めなかった。その3倍にあたる 3.1 m/s。
 */
export const WALK_SPEED = 3.1;

/** これより短い押下は張り手、これ以上押し続けるとぶちかましのタメに入る(秒) */
const TAP_MAX_SEC = 0.16;
/** タメ中の移動速度(歩行に対する割合) */
const CHARGE_MOVE_RATIO = 0.4;

/** 連続で攻撃されている間(ハメ)にボタンを連打すると反撃して抜けられる */
const COUNTER_PER_PRESS = 34; // 3回押すと反撃
const COUNTER_DECAY_PER_SEC = 120; // 押さないと、溜まった分が減っていく
const COUNTER_INVULN_SEC = 0.6; // 反撃のあと、しばらくは連続技を受けない
const COUNTER_IMPULSE = 650; // 相手を押し返す強さ
/** 張り手を当て続けると溜まるゲージ。満タンで次の1発が強い張り手になる */
const HARITE_GAUGE_PER_HIT = 25; // 4発で満タン
const HARITE_GAUGE_IDLE_SEC = 0.5; // この間当てないと、ゲージが減り始める
const HARITE_GAUGE_DECAY_PER_SEC = 50;

/** つかみを出したとき、この距離までの相手には自動で向き直る(m) */
const GRAB_AIM_ASSIST_RANGE = 3.6;

/** 吹き飛ばされている間(被弾・投げ)に、地面で毎フレーム速度に掛ける減衰 */
const GROUND_DRAG = 0.95;

/** 吹き飛ばしの強さ(基本インパルスへの倍率)。摩擦をなくしたので、攻撃ごとに飛距離で決める。 */
const KB_HARITE = 1.4;
const KB_RUSH = 0.75;
const KB_THROW = 1.1;

export class SumoFighter {
  public id: string;
  public name: string;
  public model: CharacterModel;
  public body: CANNON.Body;
  public mesh: THREE.Group;

  // 戦闘ステータス
  public damagePercent: number = 0; // 0%〜
  public hasSuperArmor: boolean = false; // ぶちかまし突進中は吹き飛ばない
  public wins: number = 0;

  // ぶちかまし
  public buchikamashiCooldown: number = 0;
  public readonly buchikamashiMaxCooldown: number = 1.4;

  // つかみ
  public grabCooldown: number = 0;
  public readonly grabMaxCooldown: number = 0.9;
  public grabbedOpponent: SumoFighter | null = null; // 掴んでいる相手
  public grabber: SumoFighter | null = null; // 自分を掴んでいる相手
  public grabHoldTimer: number = 0;
  public grabEscapeMeter: number = 0; // 掴まれている間、ボタンを押すたびに溜まる(100で脱出)
  public readonly grabHoldTime: number = 0.15; // 掴んでから投げるまで(掴んだらすぐ投げる)

  // 張り手ゲージ(当て続けると溜まる。満タンで次の張り手が強くなる)
  public hariteGauge: number = 0; // 0〜100
  private hariteIdle: number = 0;
  private hariteStrong: boolean = false;

  // 反撃(ハメ抜け)
  public lastAttacker: SumoFighter | null = null;
  private counterMeter: number = 0;
  private invulnTimer: number = 0;

  // 状態
  public state: FighterActionState = 'idle';
  public stateTimer: number = 0;
  public chargeTimer: number = 0;
  public maxChargeTime: number = 0.55;

  // 向き
  private facingAngle: number = 0; // ラジアン（Y軸回転）
  private targetFacingAngle: number = 0;
  private buchikamashiDir: THREE.Vector3 = new THREE.Vector3(1, 0, 0);

  // 攻撃判定
  public isAttackActive: boolean = false;
  public currentAttackType: 'harite' | 'harite_strong' | 'buchikamashi' | 'grab' | null = null;
  public attackHitRegistered: boolean = false;
  public hariteArm: 'left' | 'right' = 'right'; // 左右交互

  // 外部依存
  private soundManager: SoundManager;
  private particleManager: ParticleManager;
  public initialPosition: THREE.Vector3;
  public initialAngle: number;

  // 頭上マーカー（1P / 2P / CPU 表記）
  public overheadMarker!: THREE.Sprite;
  private markerBaseY: number = 2.45;
  private markerAnimTimer: number = 0;

  constructor(
    id: string,
    name: string,
    colors: CharacterColors,
    physics: PhysicsWorld,
    soundManager: SoundManager,
    particleManager: ParticleManager,
    startPos: THREE.Vector3,
    startAngle: number
  ) {
    this.id = id;
    this.name = name;
    this.soundManager = soundManager;
    this.particleManager = particleManager;
    this.initialPosition = startPos.clone();
    this.initialAngle = startAngle;

    // 1. 3Dモデル生成
    this.model = new CharacterModel(colors);
    this.mesh = this.model.root;

    // 頭上マーカー（1P / 2P / CPU）の生成と配置
    const defaultLabel = this.id === 'p1' ? '1P' : 'CPU';
    this.overheadMarker = this.createOverheadMarker(defaultLabel, this.id === 'p1');
    this.mesh.add(this.overheadMarker);

    // 2. 物理剛体（CANNON.Body）
    // どっしりとしたシリンダー（半径0.85m、高さ1.8m、質量100kg）
    const cylinderShape = new CANNON.Cylinder(0.85, 0.85, 1.8, 16);
    this.body = new CANNON.Body({
      mass: 100,
      material: physics.fighterMaterial,
      linearDamping: 0.15, // 適度な空気抵抗
      angularDamping: 0.9,
      fixedRotation: true, // 転倒防止（常に直立を維持）
    });
    this.body.addShape(cylinderShape);
    physics.world.addBody(this.body);

    this.resetPosition();
  }

  /**
   * 初期位置への配置リセット
   */
  public resetPosition() {
    this.body.position.set(this.initialPosition.x, this.initialPosition.y, this.initialPosition.z);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.facingAngle = this.initialAngle;
    this.targetFacingAngle = this.initialAngle;
    this.state = 'idle';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.hasSuperArmor = false;
    this.buchikamashiCooldown = 0;
    this.grabCooldown = 0;
    this.grabbedOpponent = null;
    this.grabber = null;
    this.lastAttacker = null;
    this.counterMeter = 0;
    this.invulnTimer = 0;
    this.hariteGauge = 0;
    this.hariteIdle = 0;
    this.hariteStrong = false;
    this.body.collisionResponse = true;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.attackHitRegistered = false;

    this.syncMeshWithPhysics();
  }

  /**
   * 毎フレームの更新
   */
  public update(
    dt: number,
    moveInput: FighterMoveInput,
    actions: FighterActions,
    opponentPos: THREE.Vector3
  ) {
    this.stateTimer += dt;

    // クールタイムの減少
    if (this.buchikamashiCooldown > 0) {
      this.buchikamashiCooldown = Math.max(0, this.buchikamashiCooldown - dt);
    }
    if (this.grabCooldown > 0) {
      this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    }
    if (this.invulnTimer > 0) {
      this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    }

    // 張り手を当てない時間が続くと、ゲージが減っていく
    this.hariteIdle += dt;
    if (this.hariteGauge > 0 && this.hariteIdle > HARITE_GAUGE_IDLE_SEC) {
      this.hariteGauge = Math.max(0, this.hariteGauge - HARITE_GAUGE_DECAY_PER_SEC * dt);
    }

    // 落下チェック
    if (this.body.position.y < -2.0 && this.state !== 'fall') {
      this.state = 'fall';
      this.soundManager.playRingOut();
    }

    if (this.state === 'fall') {
      this.syncMeshWithPhysics();
      return;
    }

    // 状態機械
    switch (this.state) {
      case 'idle':
      case 'walk':
        this.handleMovementAndTransitions(dt, moveInput, actions, opponentPos);
        break;

      case 'strike_hold':
        this.handleStrikeHold(dt, moveInput, actions, opponentPos);
        break;

      case 'harite':
        this.handleHarite(dt);
        break;

      case 'buchikamashi_charge':
        this.handleBuchikamashiCharge(dt, actions, moveInput);
        break;

      case 'buchikamashi_rush':
        this.handleBuchikamashiRush(dt);
        break;

      case 'grab_attempt':
        this.handleGrabAttempt(dt);
        break;

      case 'grab_holding':
        this.handleGrabHolding(dt, moveInput);
        break;

      case 'throw':
        this.handleThrow(dt);
        break;

      case 'grabbed':
        this.handleGrabbed(dt, actions);
        break;

      case 'hit':
        this.handleHitStun(dt, actions);
        break;
    }

    // 吹き飛ばされている間は、地面で自然に減速する(土俵の摩擦はなくしてある)
    if ((this.state === 'hit' || this.state === 'throw') && this.isGrounded()) {
      this.body.velocity.x *= GROUND_DRAG;
      this.body.velocity.z *= GROUND_DRAG;
    }

    // 向きのスムーズな回転
    this.updateRotation(dt);

    // Three.jsメッシュと剛体位置の同期
    this.syncMeshWithPhysics();

    // モデルアニメーションの更新
    this.updateModelAnimation(dt);

    // 頭上マーカーの浮遊アニメーション更新
    this.updateMarkerAnimation(dt);
  }

  /** HUD用: タメている間だけ 0〜1。突進に入ったあとは 0(chargeTimer は突進の距離計算に残る) */
  public get chargeRatio(): number {
    return this.state === 'buchikamashi_charge' ? Math.min(1, this.chargeTimer / this.maxChargeTime) : 0;
  }

  private isGrounded(): boolean {
    return this.body.position.y <= 1.15;
  }

  /** 移動入力に合わせて歩く。ratio は歩行速度に対する割合 */
  private walk(moveInput: FighterMoveInput, ratio: number = 1) {
    this.body.velocity.x = moveInput.x * WALK_SPEED * ratio;
    this.body.velocity.z = moveInput.z * WALK_SPEED * ratio;
    this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
  }

  /** 止まるときは、すり足でピタッと踏ん張る */
  private brake(factor: number = 0.45) {
    this.body.velocity.x *= factor;
    this.body.velocity.z *= factor;
  }

  /**
   * 通常移動と、打撃・つかみへの遷移
   */
  private handleMovementAndTransitions(
    dt: number,
    moveInput: FighterMoveInput,
    actions: FighterActions,
    opponentPos: THREE.Vector3
  ) {
    const grounded = this.isGrounded();

    // つかみ
    if (actions.grabPressed && grounded && this.grabCooldown <= 0) {
      this.startGrabAttempt(opponentPos);
      return;
    }

    // 打撃: 押した瞬間に離していれば張り手、そのまま押していれば様子を見る
    if (actions.strikePressed && grounded) {
      if (actions.strikeReleased) {
        this.startHarite();
      } else {
        this.state = 'strike_hold';
        this.stateTimer = 0;
      }
      return;
    }

    if (moveInput.isMoving) {
      if (grounded) {
        this.state = 'walk';
        this.walk(moveInput);
      } else {
        // 空中制御: 打ち上げの慣性を維持しつつ、わずかなレバー操作で位置調整
        this.body.velocity.x += moveInput.x * WALK_SPEED * 0.02;
        this.body.velocity.z += moveInput.z * WALK_SPEED * 0.02;
      }
    } else if (grounded) {
      this.state = 'idle';
      // 吹き飛びの勢いが残っているときは、急に止めず自然に減速させる
      if (Math.hypot(this.body.velocity.x, this.body.velocity.z) > 4) {
        this.body.velocity.x *= GROUND_DRAG;
        this.body.velocity.z *= GROUND_DRAG;
      } else {
        this.brake();
      }

      // 静止時は相手の方向を向く
      const dx = opponentPos.x - this.body.position.x;
      const dz = opponentPos.z - this.body.position.z;
      if (Math.hypot(dx, dz) > 0.1) {
        this.targetFacingAngle = Math.atan2(dx, dz);
      }
    }
  }

  /**
   * 打撃ボタンを押した直後。すぐ離せば張り手、押し続ければぶちかましのタメへ。
   */
  private handleStrikeHold(
    dt: number,
    moveInput: FighterMoveInput,
    actions: FighterActions,
    opponentPos: THREE.Vector3
  ) {
    if (actions.strikeReleased || !actions.strike) {
      this.startHarite();
      return;
    }

    if (moveInput.isMoving) {
      this.walk(moveInput, CHARGE_MOVE_RATIO);
    } else {
      this.brake();
    }

    if (this.stateTimer >= TAP_MAX_SEC) {
      if (this.buchikamashiCooldown <= 0) {
        this.startBuchikamashiCharge(moveInput, opponentPos);
      } else {
        // ぶちかましが使えない間は、長押しでも張り手になる
        this.startHarite();
      }
    }
  }

  // ---------------------------------------------------------------
  // つかみ
  // ---------------------------------------------------------------

  /** つかみ開始。出は遅めで、空振りすると隙が長い。相手が近くにいれば、自動でそちらを向く */
  private startGrabAttempt(opponentPos?: THREE.Vector3) {
    this.state = 'grab_attempt';
    this.stateTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = 'grab';
    this.attackHitRegistered = false;
    this.grabCooldown = this.grabMaxCooldown;

    // 相手が近ければ、その方向へ向き直る(狙いが多少ずれていても掴める)
    if (opponentPos) {
      const dx = opponentPos.x - this.body.position.x;
      const dz = opponentPos.z - this.body.position.z;
      if (Math.hypot(dx, dz) <= GRAB_AIM_ASSIST_RANGE) {
        this.facingAngle = Math.atan2(dx, dz);
        this.targetFacingAngle = this.facingAngle;
      }
    }

    // 前方へ踏み込む
    const dirX = Math.sin(this.facingAngle);
    const dirZ = Math.cos(this.facingAngle);
    this.body.velocity.x = dirX * 6;
    this.body.velocity.z = dirZ * 6;

    this.soundManager.playSuriasi();
  }

  private handleGrabAttempt(dt: number) {
    // 判定は 0.08〜0.30 秒の間有効
    this.isAttackActive = this.stateTimer >= 0.08 && this.stateTimer <= 0.3;

    if (this.stateTimer > 0.1) {
      this.brake(0.7);
    }

    // 空振りの隙: 0.5 秒
    if (this.stateTimer > 0.5) {
      this.state = 'idle';
      this.isAttackActive = false;
      this.currentAttackType = null;
    }
  }

  /**
   * つかみ成功。短く持ち上げたあと、そのまま投げる。
   */
  public onGrabSuccess(opponent: SumoFighter) {
    this.state = 'grab_holding';
    this.stateTimer = 0;
    this.grabHoldTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.grabbedOpponent = opponent;
    this.body.velocity.set(0, 0, 0);

    this.soundManager.playTaiko();
    this.particleManager.spawnHariteHit(
      new THREE.Vector3(
        (this.body.position.x + opponent.body.position.x) * 0.5,
        1.1,
        (this.body.position.z + opponent.body.position.z) * 0.5
      )
    );
  }

  /** 掴まれた側 */
  public onGrabbed(grabber: SumoFighter) {
    // 掴まれている間は体が重なるので、押し返されないよう接触の反発を切る
    this.body.collisionResponse = false;
    this.state = 'grabbed';
    this.stateTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.grabber = grabber;
    this.grabEscapeMeter = 0;
    this.body.velocity.set(0, 0, 0);
  }

  private handleGrabHolding(dt: number, moveInput: FighterMoveInput) {
    if (!this.grabbedOpponent || this.grabbedOpponent.state !== 'grabbed') {
      if (this.grabbedOpponent) this.grabbedOpponent.body.collisionResponse = true;
      this.state = 'idle';
      this.grabbedOpponent = null;
      return;
    }

    this.grabHoldTimer += dt;

    // 相手を自分の正面にがっちり引き寄せて固定
    const forwardX = Math.sin(this.facingAngle);
    const forwardZ = Math.cos(this.facingAngle);
    this.grabbedOpponent.body.position.x = this.body.position.x + forwardX * 0.9;
    this.grabbedOpponent.body.position.z = this.body.position.z + forwardZ * 0.9;
    this.grabbedOpponent.body.position.y = Math.max(this.grabbedOpponent.body.position.y, 0.95);
    this.grabbedOpponent.body.velocity.set(0, 0, 0);
    this.body.velocity.set(0, 0, 0);

    // 投げる方向をレバーで決められる
    if (moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
    }

    if (this.grabHoldTimer >= this.grabHoldTime) {
      const dir = moveInput.isMoving
        ? new THREE.Vector3(moveInput.x, 0, moveInput.z).normalize()
        : new THREE.Vector3(forwardX, 0, forwardZ);
      this.executeThrow(dir);
    }
  }

  /** 投げ */
  private executeThrow(throwDir: THREE.Vector3) {
    if (!this.grabbedOpponent) return;

    const opponent = this.grabbedOpponent;
    this.state = 'throw';
    this.stateTimer = 0;
    this.body.velocity.set(0, 0, 0);

    opponent.damagePercent += 16;

    // ダメージが溜まるほど遠くへ飛ぶ(0%で約2m、100%で約7m)
    const kbMult = 1.0 + opponent.damagePercent / 60.0;
    const finalImpulse = 920 * KB_THROW * kbMult;

    opponent.body.applyImpulse(
      new CANNON.Vec3(throwDir.x * finalImpulse, finalImpulse * 0.12, throwDir.z * finalImpulse),
      opponent.body.position
    );
    opponent.state = 'hit';
    opponent.stateTimer = 0;
    opponent.grabber = null;
    opponent.body.collisionResponse = true;

    // 投げの叩きつけは、強い当たりと同じ爆発にする
    this.particleManager.spawnBuchikamashiHit(
      new THREE.Vector3(opponent.body.position.x, 1.0, opponent.body.position.z),
      1.0
    );
    this.particleManager.triggerShake(0.8);
    this.soundManager.playTaiko();
    this.soundManager.playBuchikamashiHit(1.3);

    this.grabbedOpponent = null;
  }

  private handleThrow(dt: number) {
    this.brake(0.7);
    if (this.stateTimer > 0.38) {
      this.state = 'idle';
    }
  }

  /** 掴まれている間: ボタンを連打すると抜けられる */
  private handleGrabbed(dt: number, actions: FighterActions) {
    if (!this.grabber || this.grabber.state !== 'grab_holding') {
      this.state = 'idle';
      this.grabber = null;
      this.body.collisionResponse = true;
      return;
    }

    if (actions.strikePressed || actions.grabPressed) {
      this.grabEscapeMeter += 34;
    }

    if (this.grabEscapeMeter >= 100) {
      const dx = this.body.position.x - this.grabber.body.position.x;
      const dz = this.body.position.z - this.grabber.body.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const push = 260;
      const pushX = (dx / len) * push;
      const pushZ = (dz / len) * push;

      this.body.applyImpulse(new CANNON.Vec3(pushX, 50, pushZ), this.body.position);
      this.grabber.body.applyImpulse(new CANNON.Vec3(-pushX, 50, -pushZ), this.grabber.body.position);

      this.state = 'idle';
      this.body.collisionResponse = true;
      this.grabber.state = 'idle';
      this.grabber.grabbedOpponent = null;
      this.grabber = null;

      this.soundManager.playGuard();
      this.particleManager.spawnGuardSpark(new THREE.Vector3(this.body.position.x, 1.0, this.body.position.z));
    }
  }

  // ---------------------------------------------------------------
  // 打撃: 張り手(ちょん押し) / ぶちかまし(長押し)
  // ---------------------------------------------------------------

  private startHarite() {
    // ゲージが満タンなら、この1発は強い張り手(ゲージは使い切る)
    this.hariteStrong = this.hariteGauge >= 100;
    if (this.hariteStrong) this.hariteGauge = 0;

    this.state = 'harite';
    this.stateTimer = 0;
    this.isAttackActive = true;
    this.currentAttackType = this.hariteStrong ? 'harite_strong' : 'harite';
    this.attackHitRegistered = false;

    // 左右交互に突っ張りを繰り出す
    this.hariteArm = this.hariteArm === 'right' ? 'left' : 'right';

    // 前方へ踏み込む
    const dirX = Math.sin(this.facingAngle);
    const dirZ = Math.cos(this.facingAngle);
    this.body.velocity.x = dirX * 3;
    this.body.velocity.z = dirZ * 3;

    const forwardDir = new THREE.Vector3(dirX, 0, dirZ);
    const fighterPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
    this.particleManager.spawnHariteSwing(fighterPos, forwardDir);

    this.soundManager.playHarite();
  }

  private handleHarite(dt: number) {
    // 判定は 0.04〜0.14 秒
    this.isAttackActive = this.stateTimer >= 0.04 && this.stateTimer <= 0.14;

    if (this.stateTimer > 0.09) {
      this.brake(0.7);
    }

    // 0.22 秒で終了。連打はできるが、一方的に押し切れるほど速くはない
    if (this.stateTimer > 0.22) {
      this.state = 'idle';
      this.isAttackActive = false;
      this.currentAttackType = null;
    }
  }

  /**
   * ぶちかましのタメ開始。タメ中も遅く動け、レバーで突進方向を狙える。
   */
  private startBuchikamashiCharge(moveInput?: FighterMoveInput, opponentPos?: THREE.Vector3) {
    this.state = 'buchikamashi_charge';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.brake(0.3);

    if (moveInput && moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
      this.facingAngle = this.targetFacingAngle;
      this.buchikamashiDir.set(moveInput.x, 0, moveInput.z).normalize();
    } else if (opponentPos) {
      const dx = opponentPos.x - this.body.position.x;
      const dz = opponentPos.z - this.body.position.z;
      if (Math.hypot(dx, dz) > 0.1) {
        this.targetFacingAngle = Math.atan2(dx, dz);
        this.facingAngle = this.targetFacingAngle;
        this.buchikamashiDir.set(dx, 0, dz).normalize();
      }
    } else {
      this.buchikamashiDir.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle)).normalize();
    }
  }

  private handleBuchikamashiCharge(dt: number, actions: FighterActions, moveInput: FighterMoveInput) {
    this.chargeTimer += dt;
    const progress = Math.min(1.0, this.chargeTimer / this.maxChargeTime);

    // タメ中も遅く動け、動かした方向が突進方向になる
    if (moveInput.isMoving) {
      this.walk(moveInput, CHARGE_MOVE_RATIO);
      this.buchikamashiDir.set(moveInput.x, 0, moveInput.z).normalize();
    } else {
      this.brake();
    }

    if (Math.random() < 0.4) {
      this.soundManager.playBuchikamashiCharge(progress);
    }
    this.particleManager.spawnChargeParticle(
      new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z),
      progress
    );

    // ボタンを離したか、最大までタメたら突進
    if (actions.strikeReleased || !actions.strike || this.chargeTimer >= this.maxChargeTime * 1.15) {
      this.releaseBuchikamashi(moveInput);
    }
  }

  /** 突進の速さ。歩行より速く、タメるほど速く・長く走る */
  private rushSpeed(chargeRatio: number): number {
    return 9 + chargeRatio * 5; // 9〜14 m/s(歩行の3〜4.5倍)
  }

  private rushDuration(chargeRatio: number): number {
    return 0.3 + chargeRatio * 0.3; // フルタメで約 8.4m(土俵の半径ぶん)
  }

  private releaseBuchikamashi(moveInput?: FighterMoveInput) {
    this.state = 'buchikamashi_rush';
    this.stateTimer = 0;
    this.isAttackActive = true;
    this.currentAttackType = 'buchikamashi';
    this.attackHitRegistered = false;
    this.hasSuperArmor = true; // 突進中は止まらない

    if (moveInput && moveInput.isMoving) {
      this.buchikamashiDir.set(moveInput.x, 0, moveInput.z).normalize();
    } else if (this.buchikamashiDir.lengthSq() < 0.01) {
      this.buchikamashiDir.set(Math.sin(this.facingAngle), 0, Math.cos(this.facingAngle)).normalize();
    }
    this.targetFacingAngle = Math.atan2(this.buchikamashiDir.x, this.buchikamashiDir.z);
    this.facingAngle = this.targetFacingAngle;

    const chargeRatio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    const speed = this.rushSpeed(chargeRatio);
    this.body.velocity.x = this.buchikamashiDir.x * speed;
    this.body.velocity.z = this.buchikamashiDir.z * speed;

    this.buchikamashiCooldown = this.buchikamashiMaxCooldown;

    this.soundManager.playBuchikamashiHit(0.5 + chargeRatio * 0.5);
    this.particleManager.spawnDust(
      new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
      new THREE.Vector3(-this.buchikamashiDir.x, 0, -this.buchikamashiDir.z)
    );
  }

  private handleBuchikamashiRush(dt: number) {
    const chargeRatio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    const duration = this.rushDuration(chargeRatio);
    const speed = this.rushSpeed(chargeRatio);

    // 突進方向に体を固定（頭から突っ込む）
    this.targetFacingAngle = Math.atan2(this.buchikamashiDir.x, this.buchikamashiDir.z);
    this.facingAngle = this.targetFacingAngle;

    if (this.stateTimer < duration) {
      this.body.velocity.x = this.buchikamashiDir.x * speed;
      this.body.velocity.z = this.buchikamashiDir.z * speed;

      if (Math.random() < 0.6) {
        this.particleManager.spawnDust(
          new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
          new THREE.Vector3(-this.buchikamashiDir.x, 0, -this.buchikamashiDir.z)
        );
      }
    }

    this.isAttackActive = this.stateTimer < duration * 0.95;

    if (this.stateTimer >= duration) {
      this.state = 'idle';
      this.isAttackActive = false;
      this.currentAttackType = null;
      this.hasSuperArmor = false;
      this.brake(0.1);
    }
  }

  // ---------------------------------------------------------------
  // 被弾
  // ---------------------------------------------------------------

  /** 被弾硬直 */
  private handleHitStun(dt: number, actions: FighterActions) {
    this.isAttackActive = false;

    // ボタン連打で反撃(連続技・ハメからの脱出)。大きく吹き飛んでいる最中は対象外。
    this.counterMeter = Math.max(0, this.counterMeter - COUNTER_DECAY_PER_SEC * dt);
    const speed = Math.hypot(this.body.velocity.x, this.body.velocity.z);
    if (this.isGrounded() && speed < 6) {
      if (actions.strikePressed || actions.grabPressed) {
        this.counterMeter += COUNTER_PER_PRESS;
      }
      if (this.counterMeter >= 100) {
        this.doCounter();
        return;
      }
    }

    // 接地チェック（剛体重心 Y<=1.05m、かつ下降中）
    const grounded = this.body.position.y <= 1.05 && this.body.velocity.y <= 0.5;

    // 通常ヒットは 0.25 秒で復帰。空中に打ち上がっている間は着地まで(最大 1.8 秒)
    if ((this.stateTimer > 0.25 && grounded) || this.stateTimer > 1.8) {
      this.state = 'idle';

      if (grounded) {
        this.soundManager.playTaiko();
        this.particleManager.spawnDust(
          new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
          new THREE.Vector3(0, 0, 0)
        );
      }
    }
  }

  /**
   * 反撃: 連続で攻撃されている状態から抜け、相手を押し返す
   */
  private doCounter() {
    this.counterMeter = 0;
    this.invulnTimer = COUNTER_INVULN_SEC;
    this.state = 'idle';
    this.stateTimer = 0;
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;

    const pos = new THREE.Vector3(this.body.position.x, 1.1, this.body.position.z);
    this.particleManager.spawnGuardSpark(pos);
    this.particleManager.spawnHariteHit(pos);
    this.particleManager.triggerShake(0.4);
    this.soundManager.playGuard();

    const attacker = this.lastAttacker;
    if (attacker && attacker.state !== 'fall') {
      const dx = attacker.body.position.x - this.body.position.x;
      const dz = attacker.body.position.z - this.body.position.z;
      const len = Math.hypot(dx, dz) || 1;

      // 相手が掴んでいたら放す
      if (attacker.state === 'grab_holding' && attacker.grabbedOpponent) {
        attacker.grabbedOpponent.body.collisionResponse = true;
        attacker.grabbedOpponent.grabber = null;
        attacker.grabbedOpponent = null;
      }
      attacker.state = 'hit';
      attacker.stateTimer = 0;
      attacker.isAttackActive = false;
      attacker.currentAttackType = null;
      attacker.hasSuperArmor = false;
      attacker.chargeTimer = 0;
      attacker.damagePercent += 4;
      attacker.body.applyImpulse(
        new CANNON.Vec3((dx / len) * COUNTER_IMPULSE, COUNTER_IMPULSE * 0.2, (dz / len) * COUNTER_IMPULSE),
        attacker.body.position
      );
    }
  }

  /**
   * 攻撃ヒットの処理（ダメージ蓄積＋ノックバック適用）
   *
   * 三すくみ:
   *  - 張り手は、タメている相手を中断させる(被弾すると必ず硬直に入る)
   *  - ぶちかましは、突進中は止まらず、つかみを弾き飛ばす
   *  - つかみは、出の間は張り手を受けても止まらない
   */
  public receiveHit(
    attackerPos: THREE.Vector3,
    attackType: 'harite' | 'harite_strong' | 'buchikamashi',
    attackerChargeProgress: number = 0,
    attacker: SumoFighter | null = null
  ) {
    // 反撃した直後は、連続技を受けない
    if (this.invulnTimer > 0) return;

    if (attacker) this.lastAttacker = attacker;

    // 突進中は吹き飛ばない
    if (this.hasSuperArmor) {
      this.damagePercent += 3;
      return;
    }

    // つかみの出の間は、張り手では止まらない
    if (this.state === 'grab_attempt' && attackType === 'harite') {
      this.damagePercent += 2;
      this.particleManager.spawnGuardSpark(
        new THREE.Vector3(this.body.position.x, 1.1, this.body.position.z)
      );
      return;
    }

    // 掴んでいる最中に被弾したら、相手を放す
    if (this.state === 'grab_holding' && this.grabbedOpponent) {
      this.grabbedOpponent.state = 'idle';
      this.grabbedOpponent.grabber = null;
      this.grabbedOpponent.body.collisionResponse = true;
      this.grabbedOpponent = null;
    }

    const hitDir = new THREE.Vector3(
      this.body.position.x - attackerPos.x,
      0,
      this.body.position.z - attackerPos.z
    );
    if (hitDir.lengthSq() < 0.001) {
      hitDir.set(0, 0, 1);
    } else {
      hitDir.normalize();
    }

    let baseDamage = 0;
    let baseImpulse = 0;

    if (attackType === 'harite') {
      baseDamage = 4;
      baseImpulse = 180;
      this.particleManager.spawnHariteHit(
        new THREE.Vector3(this.body.position.x, 1.2, this.body.position.z)
      );
      this.soundManager.playHarite();

      // 当て続けるほど、攻撃側の張り手ゲージが溜まる
      if (attacker) {
        attacker.hariteGauge = Math.min(100, attacker.hariteGauge + HARITE_GAUGE_PER_HIT);
        attacker.hariteIdle = 0;
      }
    } else if (attackType === 'harite_strong') {
      baseDamage = 9;
      baseImpulse = 480;
      this.particleManager.spawnBuchikamashiHit(
        new THREE.Vector3(this.body.position.x, 1.1, this.body.position.z),
        0.9
      );
      this.particleManager.triggerShake(0.3);
      this.soundManager.playBuchikamashiHit(0.8);
      if (attacker) attacker.hariteIdle = 0;
    } else {
      const chargePower = 1.0 + attackerChargeProgress * 1.4;
      baseDamage = 20 * chargePower;
      baseImpulse = 700 * (1.0 + attackerChargeProgress * 1.6);
      this.particleManager.spawnBuchikamashiHit(
        new THREE.Vector3(this.body.position.x, 1.0, this.body.position.z),
        chargePower
      );
      this.soundManager.playBuchikamashiHit(chargePower);
    }

    this.damagePercent += baseDamage;

    // ノックバック = 基本インパルス × (1 + ダメージ / k)。
    // 張り手は1発が軽いぶん、ダメージが溜まったときの伸びを大きくする(0%で約0.6m、100%で約3.5m)。
    const knockbackMultiplier =
      attackType === 'harite'
        ? 1.0 + this.damagePercent / 21.0
        : attackType === 'harite_strong'
          ? 1.0 + this.damagePercent / 35.0
          : 1.0 + this.damagePercent / 70.0;
    const kbScale = attackType === 'buchikamashi' ? KB_RUSH : KB_HARITE;
    const finalImpulse = baseImpulse * kbScale * knockbackMultiplier;
    this.body.applyImpulse(
      new CANNON.Vec3(hitDir.x * finalImpulse, finalImpulse * 0.18, hitDir.z * finalImpulse),
      this.body.position
    );

    this.state = 'hit';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
  }

  /**
   * 前方ヒットボックスの位置と半径を取得
   */
  public getHitbox(): { position: THREE.Vector3; radius: number } | null {
    if (!this.isAttackActive || !this.currentAttackType) return null;

    const pos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
    const forwardX = Math.sin(this.facingAngle);
    const forwardZ = Math.cos(this.facingAngle);

    if (this.currentAttackType === 'harite') {
      pos.x += forwardX * 1.05;
      pos.z += forwardZ * 1.05;
      pos.y += 0.2;
      return { position: pos, radius: 0.75 };
    }

    if (this.currentAttackType === 'harite_strong') {
      pos.x += forwardX * 1.15;
      pos.z += forwardZ * 1.15;
      pos.y += 0.2;
      return { position: pos, radius: 0.95 };
    }

    if (this.currentAttackType === 'buchikamashi') {
      pos.x += forwardX * 1.3;
      pos.z += forwardZ * 1.3;
      return { position: pos, radius: 1.3 };
    }

    if (this.currentAttackType === 'grab') {
      pos.x += forwardX * 1.3;
      pos.z += forwardZ * 1.3;
      pos.y += 0.2;
      return { position: pos, radius: 1.2 };
    }

    return null;
  }

  /**
   * 回転の補間
   */
  private updateRotation(dt: number) {
    // 突進中は突進方向に体を完全固定
    if (this.state === 'buchikamashi_rush') {
      this.facingAngle = this.targetFacingAngle;
      return;
    }

    let diff = this.targetFacingAngle - this.facingAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const rotSpeed = 38.0;
    this.facingAngle += diff * Math.min(1.0, rotSpeed * dt);
  }

  /**
   * 剛体と3Dメッシュの同期
   */
  private syncMeshWithPhysics() {
    this.mesh.position.set(this.body.position.x, this.body.position.y - 0.9, this.body.position.z);
    this.mesh.rotation.y = this.facingAngle;
  }

  /**
   * キャラクターモデルのアニメーション更新
   */
  private updateModelAnimation(dt: number) {
    let animProgress = 0;
    let chargeProgress = 0;
    let animState: 'idle' | 'walk' | 'harite' | 'buchikamashi_charge' | 'buchikamashi_rush' | 'grab_attempt' | 'grab_holding' | 'throw' | 'grabbed' | 'hit' = 'idle';

    switch (this.state) {
      case 'walk':
        animState = 'walk';
        break;
      case 'harite':
        animState = 'harite';
        animProgress = Math.min(1.0, this.stateTimer / 0.22);
        break;
      case 'buchikamashi_charge':
        animState = 'buchikamashi_charge';
        chargeProgress = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
        break;
      case 'buchikamashi_rush':
        animState = 'buchikamashi_rush';
        animProgress = Math.min(1.0, this.stateTimer / Math.max(0.01, this.rushDuration(Math.min(1, this.chargeTimer / this.maxChargeTime))));
        break;
      case 'grab_attempt':
        animState = 'grab_attempt';
        animProgress = Math.min(1.0, this.stateTimer / 0.26);
        break;
      case 'grab_holding':
        animState = 'grab_holding';
        animProgress = Math.min(1.0, this.grabHoldTimer / this.grabHoldTime);
        break;
      case 'throw':
        animState = 'throw';
        animProgress = Math.min(1.0, this.stateTimer / 0.38);
        break;
      case 'grabbed':
        animState = 'grabbed';
        animProgress = Math.min(1.0, this.stateTimer / 1.0);
        break;
      case 'hit':
        animState = 'hit';
        animProgress = Math.min(1.0, this.stateTimer / 0.25);
        break;
      default:
        break;
    }

    this.model.updateAnimation(dt, animState, animProgress, chargeProgress, this.hariteArm);
  }

  /**
   * 頭上マーカーの浮遊アニメーション
   */
  public updateMarkerAnimation(dt: number) {
    this.markerAnimTimer += dt;
    this.overheadMarker.position.y = this.markerBaseY + Math.sin(this.markerAnimTimer * 4.2) * 0.06;
  }

  /**
   * 頭上マーカー（1P / 2P / CPU）のスプライト生成
   */
  private createOverheadMarker(label: string, isP1: boolean): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    this.drawMarkerCanvas(ctx, label, isP1);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(1.4, 0.7, 1.0);
    sprite.position.set(0, this.markerBaseY, 0);
    sprite.renderOrder = 999;
    return sprite;
  }

  /**
   * マーカーのキャンバス描画（スタイリッシュな角丸バッジ＋下向き矢印）
   */
  private drawMarkerCanvas(ctx: CanvasRenderingContext2D, label: string, isP1: boolean) {
    const w = 512;
    const h = 256;
    ctx.clearRect(0, 0, w, h);

    const primaryColor = isP1 ? '#0077ff' : '#ff2244';
    const secondaryColor = isP1 ? '#00d4ff' : '#ff7700';
    const glowColor = isP1 ? 'rgba(0, 180, 255, 0.8)' : 'rgba(255, 60, 60, 0.8)';

    // バッジの外枠と影
    const bw = 240;
    const bh = 100;
    const bx = (w - bw) / 2;
    const by = 45;
    const r = 24;

    // ドロップシャドウ
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // 角丸バッジ背景グラデーション
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, secondaryColor);
    grad.addColorStop(1, primaryColor);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.fill();

    // 下向きの三角形インジケーター（▼）
    const tw = 44;
    const th = 32;
    const tx = w / 2;
    const ty = by + bh + 4;

    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, ty);
    ctx.lineTo(tx + tw / 2, ty);
    ctx.lineTo(tx, ty + th);
    ctx.closePath();
    ctx.fillStyle = primaryColor;
    ctx.fill();

    // 白色の太い光沢枠線
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.stroke();

    // 三角形枠線
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, ty);
    ctx.lineTo(tx + tw / 2, ty);
    ctx.lineTo(tx, ty + th);
    ctx.closePath();
    ctx.stroke();

    // 光彩グロー
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;

    // ラベルテキスト（「1P」「2P」「CPU」）
    ctx.font = '900 68px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // テキスト黒縁取り
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(label, w / 2, by + bh / 2);

    // テキスト本体（白）
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, w / 2, by + bh / 2);
  }

  /**
   * マーカーのラベル変更（1P, 2P, CPU）
   */
  public setMarkerLabel(label: string) {
    const isP1 = this.id === 'p1';
    const canvas = (this.overheadMarker.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    this.drawMarkerCanvas(ctx, label, isP1);
    this.overheadMarker.material.map!.needsUpdate = true;
  }

  /**
   * マーカーの表示・非表示
   */
  public setMarkerVisible(visible: boolean) {
    this.overheadMarker.visible = visible;
  }
}
