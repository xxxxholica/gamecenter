// 力士1人分の「中身」(状態機械・物理・当たりの受け方)。描画・音・パーティクルには触れない:
// 起きた演出は FxBus へイベントとして出し、画面側(ブラウザ)が再生する。サーバーとブラウザ(CPU対戦)の両方で動く。
// 物理エンジン(cannon-es)は、サーバーとブラウザで置き場所が違うため、import せず呼び出し側から渡してもらう(SimEnv.C)。
import type * as CANNONNS from 'cannon-es';
import type { FxBus } from './FxBus.ts';
import type { FighterSnap } from '../sumoProtocol.ts';
import { STATE_NAMES } from '../sumoProtocol.ts';

export type Cannon = typeof CANNONNS;

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

/** シミュレーションの外から借りるもの */
export interface SimEnv {
  C: Cannon;
  world: CANNONNS.World;
  fighterMaterial: CANNONNS.Material;
  fx: FxBus;
  /** 強い当たりの一瞬、動きを止める(秒) */
  requestHitStop(sec: number): void;
}

export interface FighterConfig {
  id: string;
  name: string;
  startX: number;
  startY: number;
  startZ: number;
  startAngle: number;
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
/**
 * 張り手を当てると溜まるゲージ。連続で当てなくても減らない(ラウンドの始めに0へ戻る)。
 * 溜まるほど通常の張り手の吹き飛びが段階的に強くなり、満タンで次の1発が強い張り手になる。
 */
const HARITE_GAUGE_PER_HIT = 20; // 5発で満タン
const HARITE_GAUGE_STAGE = 20; // ゲージがこれだけ溜まるごとに1段階上がる
/** 段階ごとの、通常の張り手の吹き飛びの倍率(0段階=ゲージが空のとき) */
const HARITE_STAGE_KB = [1.0, 1.15, 1.3, 1.5, 1.7] as const;

/** つかみを出したとき、この距離までの相手には自動で向き直る(m) */
const GRAB_AIM_ASSIST_RANGE = 3.6;

/** 吹き飛ばされている間(被弾・投げ)に、地面で毎フレーム速度に掛ける減衰 */
const GROUND_DRAG = 0.95;

/** 吹き飛ばしの強さ(基本インパルスへの倍率)。摩擦をなくしたので、攻撃ごとに飛距離で決める。 */
const KB_HARITE = 1.4;
const KB_RUSH = 0.75;
const KB_THROW = 1.1;

/** 画面(HUD・アニメーション)が使う、技の定数と計算 */
export const BUCHIKAMASHI_MAX_COOLDOWN = 5.6;
export const GRAB_MAX_COOLDOWN = 0.9;
export const GRAB_HOLD_TIME = 0.15;
export const MAX_CHARGE_TIME = 0.55;
/** 突進の長さ(秒)。フルタメで約 8.4m(土俵の半径ぶん) */
export const rushDurationFor = (chargeRatio: number) => 0.3 + chargeRatio * 0.3;

/** 強い当たりの一瞬、動きを止める長さ: 0.04 + 0.025 × 威力(秒) */
const hitStopFor = (power: number) => 0.04 + 0.025 * power;

type AttackType = 'harite' | 'harite_strong' | 'buchikamashi' | 'grab';

export class SimFighter {
  public readonly id: string;
  public name: string;
  public readonly body: CANNONNS.Body;

  // 百人組手用の体格・速度・耐性パラメータ(既定値はすべて1.0)
  public bodyScale = 1.0;
  public walkSpeedMult = 1.0;
  public knockbackTakenMult = 1.0;
  /** 空から降下中(着地するまで true) */
  public isSkyDropping = false;
  /** 空から降下して土俵に着地した瞬間のコールバック(着地衝撃波の発生用) */
  public onSkyLanded: ((fighter: SimFighter) => void) | null = null;

  // 戦闘ステータス
  public damagePercent = 0; // 0%〜
  public hasSuperArmor = false; // ぶちかまし突進中は吹き飛ばない
  /** 試合から外れた(オンラインで退出した)。以降は土俵に出ない */
  public gone = false;

  // ぶちかまし
  public buchikamashiCooldown = 0;
  public readonly buchikamashiMaxCooldown = BUCHIKAMASHI_MAX_COOLDOWN;

  // つかみ
  public grabCooldown = 0;
  public readonly grabMaxCooldown = GRAB_MAX_COOLDOWN;
  public grabbedOpponent: SimFighter | null = null; // 掴んでいる相手
  public grabber: SimFighter | null = null; // 自分を掴んでいる相手
  public grabHoldTimer = 0;
  public grabEscapeMeter = 0; // 掴まれている間、ボタンを押すたびに溜まる(100で脱出)
  public readonly grabHoldTime = GRAB_HOLD_TIME; // 掴んでから投げるまで(掴んだらすぐ投げる)

  // 張り手ゲージ(当てると溜まり、時間では減らない。段階で吹き飛びが強くなり、満タンで次の張り手が強くなる)
  public hariteGauge = 0; // 0〜100
  private hariteStrong = false;

  // 反撃(ハメ抜け)
  public lastAttacker: SimFighter | null = null;
  private counterMeter = 0;
  private invulnTimer = 0;

  // 状態
  public state: FighterActionState = 'idle';
  public stateTimer = 0;
  public chargeTimer = 0;
  public readonly maxChargeTime = MAX_CHARGE_TIME;

  // 向き
  private facingAngle = 0; // ラジアン(Y軸回転)
  private targetFacingAngle = 0;
  private buchikamashiDirX = 1;
  private buchikamashiDirZ = 0;

  // 攻撃判定
  public isAttackActive = false;
  public currentAttackType: AttackType | null = null;
  public attackHitRegistered = false;
  public hariteArm: 'left' | 'right' = 'right'; // 左右交互

  public readonly startX: number;
  public readonly startY: number;
  public readonly startZ: number;
  public readonly startAngle: number;

  private readonly env: SimEnv;

  constructor(env: SimEnv, cfg: FighterConfig) {
    this.env = env;
    this.id = cfg.id;
    this.name = cfg.name;
    this.startX = cfg.startX;
    this.startY = cfg.startY;
    this.startZ = cfg.startZ;
    this.startAngle = cfg.startAngle;

    // どっしりとしたシリンダー(半径0.85m、高さ1.8m、質量100kg)
    const C = env.C;
    this.body = new C.Body({
      mass: 100,
      material: env.fighterMaterial,
      linearDamping: 0.15, // 適度な空気抵抗
      angularDamping: 0.9,
      fixedRotation: true, // 転倒防止(常に直立を維持)
    });
    this.body.addShape(new C.Cylinder(0.85, 0.85, 1.8, 16));
    env.world.addBody(this.body);

    this.resetPosition();
  }

  /** 初期位置への配置リセット */
  public resetPosition(): void {
    this.body.position.set(this.startX, this.startY, this.startZ);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.facingAngle = this.startAngle;
    this.targetFacingAngle = this.startAngle;
    this.state = 'idle';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.hasSuperArmor = false;
    this.isSkyDropping = false;
    this.buchikamashiCooldown = 0;
    this.grabCooldown = 0;
    this.grabbedOpponent = null;
    this.grabber = null;
    this.lastAttacker = null;
    this.counterMeter = 0;
    this.invulnTimer = 0;
    this.hariteGauge = 0;
    this.hariteStrong = false;
    this.damagePercent = 0;
    this.body.collisionResponse = true;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.attackHitRegistered = false;
  }

  /**
   * 百人組手で次の敵力士を上空から土俵へ降下スポーンさせる。
   */
  public spawnFromSky(
    x: number,
    y: number,
    z: number,
    facingAngle: number,
    opts?: { name?: string; scale?: number; mass?: number; speedMult?: number; knockbackTakenMult?: number },
  ): void {
    if (this.grabbedOpponent) {
      this.grabbedOpponent.grabber = null;
      this.grabbedOpponent.state = 'idle';
      this.grabbedOpponent.body.collisionResponse = true;
      this.grabbedOpponent = null;
    }
    if (this.grabber) {
      this.grabber.grabbedOpponent = null;
      if (this.grabber.state === 'grab_holding') this.grabber.state = 'idle';
      this.grabber = null;
    }
    if (opts?.name !== undefined) this.name = opts.name;
    this.bodyScale = opts?.scale ?? 1.0;
    this.walkSpeedMult = opts?.speedMult ?? 1.0;
    this.knockbackTakenMult = opts?.knockbackTakenMult ?? 1.0;
    this.body.mass = opts?.mass ?? 100;
    this.body.updateMassProperties();

    this.gone = false;
    this.isSkyDropping = true;
    this.body.collisionResponse = true;
    this.body.wakeUp();
    this.body.position.set(x, y, z);
    this.body.velocity.set(0, -4.5, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.facingAngle = facingAngle;
    this.targetFacingAngle = facingAngle;
    this.state = 'idle';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.hasSuperArmor = false;
    this.buchikamashiCooldown = 0;
    this.grabCooldown = 0;
    this.lastAttacker = null;
    this.counterMeter = 0;
    this.invulnTimer = 0;
    this.hariteGauge = 0;
    this.hariteStrong = false;
    this.damagePercent = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.attackHitRegistered = false;
  }

  /** 試合から外す(退出)。土俵の外へ置き、以降は動かない。 */
  public leave(): void {
    this.gone = true;
    this.isSkyDropping = false;
    this.state = 'fall';
    this.body.collisionResponse = false;
    this.body.position.set(this.startX, -25, this.startZ);
    this.body.velocity.set(0, 0, 0);
    if (this.grabbedOpponent) {
      this.grabbedOpponent.grabber = null;
      this.grabbedOpponent.state = 'idle';
      this.grabbedOpponent.body.collisionResponse = true;
      this.grabbedOpponent = null;
    }
    if (this.grabber) {
      this.grabber.grabbedOpponent = null;
      if (this.grabber.state === 'grab_holding') this.grabber.state = 'idle';
      this.grabber = null;
    }
  }

  /** 画面外へ落ちた力士は、その下で止める(落ち続けて値が大きくならないように) */
  private pinIfFarBelow(): void {
    if (this.body.position.y < -25) {
      this.body.position.y = -25;
      this.body.velocity.set(0, 0, 0);
    }
  }

  /**
   * 毎フレームの更新。oppX/oppZ は一番近い相手の位置(静止時の向き・つかみの補正・突進の向きに使う)。相手がいなければ null。
   */
  public update(dt: number, moveInput: FighterMoveInput, actions: FighterActions, oppX: number | null, oppZ: number | null): void {
    if (this.gone) return;
    this.stateTimer += dt;

    // 空から降下中: 落下予告の影の位置にまっすぐ落ち、着地した瞬間に衝撃波を起こす
    if (this.isSkyDropping) {
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
      if (oppX !== null && oppZ !== null) {
        const dx = oppX - this.body.position.x;
        const dz = oppZ - this.body.position.z;
        if (Math.hypot(dx, dz) > 0.1) {
          this.targetFacingAngle = Math.atan2(dx, dz);
        }
      }
      this.updateRotation(dt);
      const landedOnGround = this.body.position.y <= 1.25;
      const landedOnFighter = this.stateTimer > 0.15 && this.body.position.y <= 3.0 && Math.abs(this.body.velocity.y) < 1.5;
      if (landedOnGround || landedOnFighter) {
        this.isSkyDropping = false;
        this.body.velocity.set(0, 0, 0);
        this.onSkyLanded?.(this);
      }
      return;
    }

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

    // 落下チェック
    if (this.body.position.y < -2.0 && this.state !== 'fall') {
      this.state = 'fall';
      this.env.fx.sound('playRingOut');
    }

    if (this.state === 'fall') {
      this.pinIfFarBelow();
      return;
    }

    // 状態機械
    switch (this.state) {
      case 'idle':
      case 'walk':
        this.handleMovementAndTransitions(moveInput, actions, oppX, oppZ);
        break;
      case 'strike_hold':
        this.handleStrikeHold(moveInput, actions, oppX, oppZ);
        break;
      case 'harite':
        this.handleHarite();
        break;
      case 'buchikamashi_charge':
        this.handleBuchikamashiCharge(dt, actions, moveInput);
        break;
      case 'buchikamashi_rush':
        this.handleBuchikamashiRush();
        break;
      case 'grab_attempt':
        this.handleGrabAttempt();
        break;
      case 'grab_holding':
        this.handleGrabHolding(dt, moveInput);
        break;
      case 'throw':
        this.handleThrow();
        break;
      case 'grabbed':
        this.handleGrabbed(actions);
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
  }

  /** 画面・通信用の状態(ホストが約20Hzで送る/CPU対戦では毎フレーム画面に渡す)。round=true なら通信量を減らすため丸める。 */
  public toSnap(round: boolean): FighterSnap {
    const r = (v: number, k = 100) => (round ? Math.round(v * k) / k : v);
    const c = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
    const b = this.body;
    return [
      r(c(b.position.x, 900)), r(c(b.position.y, 900)), r(c(b.position.z, 900)),
      r(c(b.velocity.x, 900)), r(c(b.velocity.y, 900)), r(c(b.velocity.z, 900)),
      r(this.facingAngle, 1000),
      Math.max(0, STATE_NAMES.indexOf(this.state)),
      r(Math.min(this.stateTimer, 900)), r(Math.min(this.chargeTimer, 900)),
      r(Math.min(this.damagePercent, 900), 10),
      r(this.buchikamashiCooldown), r(this.grabCooldown),
      r(this.hariteGauge, 10),
      this.hariteArm === 'left' ? 1 : 0,
      r(Math.min(this.grabHoldTimer, 900)),
      this.gone ? 1 : 0,
    ];
  }

  private isGrounded(): boolean {
    return this.body.position.y <= 1.15;
  }

  /** 移動入力に合わせて歩く。ratio は歩行速度に対する割合 */
  private walk(moveInput: FighterMoveInput, ratio = 1): void {
    const sp = WALK_SPEED * this.walkSpeedMult * ratio;
    this.body.velocity.x = moveInput.x * sp;
    this.body.velocity.z = moveInput.z * sp;
    this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
  }

  /** 止まるときは、すり足でピタッと踏ん張る */
  private brake(factor = 0.45): void {
    this.body.velocity.x *= factor;
    this.body.velocity.z *= factor;
  }

  /** 通常移動と、打撃・つかみへの遷移 */
  private handleMovementAndTransitions(moveInput: FighterMoveInput, actions: FighterActions, oppX: number | null, oppZ: number | null): void {
    const grounded = this.isGrounded();

    // つかみ
    if (actions.grabPressed && grounded && this.grabCooldown <= 0) {
      this.startGrabAttempt(oppX, oppZ);
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
      if (oppX !== null && oppZ !== null) {
        const dx = oppX - this.body.position.x;
        const dz = oppZ - this.body.position.z;
        if (Math.hypot(dx, dz) > 0.1) {
          this.targetFacingAngle = Math.atan2(dx, dz);
        }
      }
    }
  }

  /** 打撃ボタンを押した直後。すぐ離せば張り手、押し続ければぶちかましのタメへ。 */
  private handleStrikeHold(moveInput: FighterMoveInput, actions: FighterActions, oppX: number | null, oppZ: number | null): void {
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
        this.startBuchikamashiCharge(moveInput, oppX, oppZ);
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
  private startGrabAttempt(oppX: number | null, oppZ: number | null): void {
    this.state = 'grab_attempt';
    this.stateTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = 'grab';
    this.attackHitRegistered = false;
    this.grabCooldown = this.grabMaxCooldown;

    // 相手が近ければ、その方向へ向き直る(狙いが多少ずれていても掴める)
    if (oppX !== null && oppZ !== null) {
      const dx = oppX - this.body.position.x;
      const dz = oppZ - this.body.position.z;
      if (Math.hypot(dx, dz) <= GRAB_AIM_ASSIST_RANGE) {
        this.facingAngle = Math.atan2(dx, dz);
        this.targetFacingAngle = this.facingAngle;
      }
    }

    // 前方へ踏み込む
    this.body.velocity.x = Math.sin(this.facingAngle) * 6;
    this.body.velocity.z = Math.cos(this.facingAngle) * 6;

    this.env.fx.sound('playSuriasi');
  }

  private handleGrabAttempt(): void {
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

  /** つかみ成功。短く持ち上げたあと、そのまま投げる。 */
  public onGrabSuccess(opponent: SimFighter): void {
    this.state = 'grab_holding';
    this.stateTimer = 0;
    this.grabHoldTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.grabbedOpponent = opponent;
    this.body.velocity.set(0, 0, 0);

    this.env.fx.sound('playTaiko');
    this.env.fx.particle(
      'spawnHariteHit',
      (this.body.position.x + opponent.body.position.x) * 0.5,
      1.1,
      (this.body.position.z + opponent.body.position.z) * 0.5
    );
  }

  /** 掴まれた側 */
  public onGrabbed(grabber: SimFighter): void {
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

  private handleGrabHolding(dt: number, moveInput: FighterMoveInput): void {
    const opp = this.grabbedOpponent;
    if (!opp || opp.state !== 'grabbed') {
      if (opp) opp.body.collisionResponse = true;
      this.state = 'idle';
      this.grabbedOpponent = null;
      return;
    }

    this.grabHoldTimer += dt;

    // 相手を自分の正面にがっちり引き寄せて固定
    const forwardX = Math.sin(this.facingAngle);
    const forwardZ = Math.cos(this.facingAngle);
    opp.body.position.x = this.body.position.x + forwardX * 0.9;
    opp.body.position.z = this.body.position.z + forwardZ * 0.9;
    opp.body.position.y = Math.max(opp.body.position.y, 0.95);
    opp.body.velocity.set(0, 0, 0);
    this.body.velocity.set(0, 0, 0);

    // 投げる方向をレバーで決められる
    if (moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
    }

    if (this.grabHoldTimer >= this.grabHoldTime) {
      if (moveInput.isMoving) {
        const len = Math.hypot(moveInput.x, moveInput.z) || 1;
        this.executeThrow(moveInput.x / len, moveInput.z / len);
      } else {
        this.executeThrow(forwardX, forwardZ);
      }
    }
  }

  /** 投げ */
  private executeThrow(dirX: number, dirZ: number): void {
    const opponent = this.grabbedOpponent;
    if (!opponent) return;

    const C = this.env.C;
    this.state = 'throw';
    this.stateTimer = 0;
    this.body.velocity.set(0, 0, 0);

    opponent.damagePercent += 16;

    // ダメージが溜まるほど遠くへ飛ぶ(0%で約2m、100%で約7m)
    const kbMult = 1.0 + opponent.damagePercent / 60.0;
    const finalImpulse = 920 * KB_THROW * kbMult * opponent.knockbackTakenMult * (opponent.body.mass / 100);

    opponent.body.applyImpulse(new C.Vec3(dirX * finalImpulse, finalImpulse * 0.12, dirZ * finalImpulse), opponent.body.position);
    opponent.state = 'hit';
    opponent.stateTimer = 0;
    opponent.grabber = null;
    opponent.body.collisionResponse = true;

    // 投げの叩きつけは、強い当たりと同じ爆発にする
    this.env.fx.particle('spawnBuchikamashiHit', opponent.body.position.x, 1.0, opponent.body.position.z, 1.0);
    this.env.requestHitStop(hitStopFor(1.0));
    this.env.fx.particle('triggerShake', 0.8);
    this.env.fx.sound('playTaiko');
    this.env.fx.sound('playBuchikamashiHit', 1.3);

    this.grabbedOpponent = null;
  }

  private handleThrow(): void {
    this.brake(0.7);
    if (this.stateTimer > 0.38) {
      this.state = 'idle';
    }
  }

  /** 掴まれている間: ボタンを連打すると抜けられる */
  private handleGrabbed(actions: FighterActions): void {
    const grabber = this.grabber;
    if (!grabber || grabber.state !== 'grab_holding') {
      this.state = 'idle';
      this.grabber = null;
      this.body.collisionResponse = true;
      return;
    }

    if (actions.strikePressed || actions.grabPressed) {
      this.grabEscapeMeter += 34;
    }

    if (this.grabEscapeMeter >= 100) {
      const C = this.env.C;
      const dx = this.body.position.x - grabber.body.position.x;
      const dz = this.body.position.z - grabber.body.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const push = 260;
      const pushX = (dx / len) * push;
      const pushZ = (dz / len) * push;

      this.body.applyImpulse(new C.Vec3(pushX, 50, pushZ), this.body.position);
      grabber.body.applyImpulse(new C.Vec3(-pushX, 50, -pushZ), grabber.body.position);

      this.state = 'idle';
      this.body.collisionResponse = true;
      grabber.state = 'idle';
      grabber.grabbedOpponent = null;
      this.grabber = null;

      this.env.fx.sound('playGuard');
      this.env.fx.particle('spawnGuardSpark', this.body.position.x, 1.0, this.body.position.z);
    }
  }

  // ---------------------------------------------------------------
  // 打撃: 張り手(ちょん押し) / ぶちかまし(長押し)
  // ---------------------------------------------------------------

  private startHarite(): void {
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

    this.env.fx.particle('spawnHariteSwing', this.body.position.x, this.body.position.y, this.body.position.z, dirX, 0, dirZ);
    this.env.fx.sound('playHarite');
  }

  private handleHarite(): void {
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

  /** ぶちかましのタメ開始。タメ中も遅く動け、レバーで突進方向を狙える。 */
  private startBuchikamashiCharge(moveInput: FighterMoveInput, oppX: number | null, oppZ: number | null): void {
    this.state = 'buchikamashi_charge';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.brake(0.3);

    if (moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
      this.facingAngle = this.targetFacingAngle;
      this.setRushDir(moveInput.x, moveInput.z);
    } else if (oppX !== null && oppZ !== null) {
      const dx = oppX - this.body.position.x;
      const dz = oppZ - this.body.position.z;
      if (Math.hypot(dx, dz) > 0.1) {
        this.targetFacingAngle = Math.atan2(dx, dz);
        this.facingAngle = this.targetFacingAngle;
        this.setRushDir(dx, dz);
      }
    } else {
      this.setRushDir(Math.sin(this.facingAngle), Math.cos(this.facingAngle));
    }
  }

  private setRushDir(x: number, z: number): void {
    const len = Math.hypot(x, z) || 1;
    this.buchikamashiDirX = x / len;
    this.buchikamashiDirZ = z / len;
  }

  private handleBuchikamashiCharge(dt: number, actions: FighterActions, moveInput: FighterMoveInput): void {
    this.chargeTimer += dt;

    // タメ中も遅く動け、動かした方向が突進方向になる
    if (moveInput.isMoving) {
      this.walk(moveInput, CHARGE_MOVE_RATIO);
      this.setRushDir(moveInput.x, moveInput.z);
    } else {
      this.brake();
    }

    // ボタンを離したか、最大までタメたら突進
    if (actions.strikeReleased || !actions.strike || this.chargeTimer >= this.maxChargeTime * 1.15) {
      this.releaseBuchikamashi(moveInput);
    }
  }

  /** 突進の速さ。歩行より速く、タメるほど速く・長く走る */
  private rushSpeed(chargeRatio: number): number {
    return (9 + chargeRatio * 5) * this.walkSpeedMult; // 9〜14 m/s(歩行の3〜4.5倍)
  }

  private rushDuration(chargeRatio: number): number {
    return rushDurationFor(chargeRatio);
  }

  private releaseBuchikamashi(moveInput: FighterMoveInput): void {
    this.state = 'buchikamashi_rush';
    this.stateTimer = 0;
    this.isAttackActive = true;
    this.currentAttackType = 'buchikamashi';
    this.attackHitRegistered = false;
    this.hasSuperArmor = true; // 突進中は止まらない

    if (moveInput.isMoving) {
      this.setRushDir(moveInput.x, moveInput.z);
    } else if (this.buchikamashiDirX * this.buchikamashiDirX + this.buchikamashiDirZ * this.buchikamashiDirZ < 0.01) {
      this.setRushDir(Math.sin(this.facingAngle), Math.cos(this.facingAngle));
    }
    this.targetFacingAngle = Math.atan2(this.buchikamashiDirX, this.buchikamashiDirZ);
    this.facingAngle = this.targetFacingAngle;

    const chargeRatio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    const speed = this.rushSpeed(chargeRatio);
    this.body.velocity.x = this.buchikamashiDirX * speed;
    this.body.velocity.z = this.buchikamashiDirZ * speed;

    this.buchikamashiCooldown = this.buchikamashiMaxCooldown;

    this.env.fx.sound('playBuchikamashiHit', 0.5 + chargeRatio * 0.5);
    this.env.fx.particle('spawnDust', this.body.position.x, 0.2, this.body.position.z, -this.buchikamashiDirX, 0, -this.buchikamashiDirZ);
  }

  private handleBuchikamashiRush(): void {
    const chargeRatio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    const duration = this.rushDuration(chargeRatio);
    const speed = this.rushSpeed(chargeRatio);

    // 突進方向に体を固定(頭から突っ込む)
    this.targetFacingAngle = Math.atan2(this.buchikamashiDirX, this.buchikamashiDirZ);
    this.facingAngle = this.targetFacingAngle;

    if (this.stateTimer < duration) {
      this.body.velocity.x = this.buchikamashiDirX * speed;
      this.body.velocity.z = this.buchikamashiDirZ * speed;
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
  private handleHitStun(dt: number, actions: FighterActions): void {
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

    // 接地チェック(剛体重心 Y<=1.05m、かつ下降中)
    const grounded = this.body.position.y <= 1.05 && this.body.velocity.y <= 0.5;

    // 通常ヒットは 0.25 秒で復帰。空中に打ち上がっている間は着地まで(最大 1.8 秒)
    if ((this.stateTimer > 0.25 && grounded) || this.stateTimer > 1.8) {
      this.state = 'idle';

      if (grounded) {
        this.env.fx.sound('playTaiko');
        this.env.fx.particle('spawnDust', this.body.position.x, 0.2, this.body.position.z, 0, 0, 0);
      }
    }
  }

  /** 反撃: 連続で攻撃されている状態から抜け、相手を押し返す */
  private doCounter(): void {
    const C = this.env.C;
    this.counterMeter = 0;
    this.invulnTimer = COUNTER_INVULN_SEC;
    this.state = 'idle';
    this.stateTimer = 0;
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;

    this.env.fx.particle('spawnGuardSpark', this.body.position.x, 1.1, this.body.position.z);
    this.env.fx.particle('spawnHariteHit', this.body.position.x, 1.1, this.body.position.z);
    this.env.fx.particle('triggerShake', 0.4);
    this.env.fx.sound('playGuard');

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
        new C.Vec3((dx / len) * COUNTER_IMPULSE, COUNTER_IMPULSE * 0.2, (dz / len) * COUNTER_IMPULSE),
        attacker.body.position
      );
    }
  }

  /**
   * 攻撃ヒットの処理(ダメージ蓄積+ノックバック適用)
   *
   * 三すくみ:
   *  - 張り手は、タメている相手を中断させる(被弾すると必ず硬直に入る)
   *  - ぶちかましは、突進中は止まらず、つかみを弾き飛ばす
   *  - つかみは、出の間は張り手を受けても止まらない
   */
  public receiveHit(attackerX: number, attackerZ: number, attackType: 'harite' | 'harite_strong' | 'buchikamashi', attackerChargeProgress = 0, attacker: SimFighter | null = null): void {
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
      this.env.fx.particle('spawnGuardSpark', this.body.position.x, 1.1, this.body.position.z);
      return;
    }

    // 掴んでいる最中に被弾したら、相手を放す
    if (this.state === 'grab_holding' && this.grabbedOpponent) {
      this.grabbedOpponent.state = 'idle';
      this.grabbedOpponent.grabber = null;
      this.grabbedOpponent.body.collisionResponse = true;
      this.grabbedOpponent = null;
    }

    let hx = this.body.position.x - attackerX;
    let hz = this.body.position.z - attackerZ;
    if (hx * hx + hz * hz < 0.001) {
      hx = 0;
      hz = 1;
    } else {
      const len = Math.hypot(hx, hz);
      hx /= len;
      hz /= len;
    }

    let baseDamage = 0;
    let baseImpulse = 0;

    if (attackType === 'harite') {
      baseDamage = 4;
      // 攻撃側のゲージが溜まっているほど強く吹き飛ばす(加算する前の段階で決める)
      const stage = attacker ? Math.min(HARITE_STAGE_KB.length - 1, Math.floor(attacker.hariteGauge / HARITE_GAUGE_STAGE)) : 0;
      baseImpulse = 180 * HARITE_STAGE_KB[stage];
      this.env.fx.particle('spawnHariteHit', this.body.position.x, 1.2, this.body.position.z);
      this.env.fx.sound('playHarite');

      // 当てるほど、攻撃側の張り手ゲージが溜まる
      if (attacker) attacker.hariteGauge = Math.min(100, attacker.hariteGauge + HARITE_GAUGE_PER_HIT);
    } else if (attackType === 'harite_strong') {
      baseDamage = 9;
      baseImpulse = 480;
      this.env.fx.particle('spawnBuchikamashiHit', this.body.position.x, 1.1, this.body.position.z, 0.9);
      this.env.requestHitStop(hitStopFor(0.9));
      this.env.fx.particle('triggerShake', 0.3);
      this.env.fx.sound('playBuchikamashiHit', 0.8);
    } else {
      const chargePower = 1.0 + attackerChargeProgress * 1.4;
      baseDamage = 20 * chargePower;
      baseImpulse = 700 * (1.0 + attackerChargeProgress * 1.6);
      this.env.fx.particle('spawnBuchikamashiHit', this.body.position.x, 1.0, this.body.position.z, chargePower);
      this.env.requestHitStop(hitStopFor(chargePower));
      this.env.fx.sound('playBuchikamashiHit', chargePower);
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
    const finalImpulse = baseImpulse * kbScale * knockbackMultiplier * this.knockbackTakenMult * (this.body.mass / 100);
    this.body.applyImpulse(new this.env.C.Vec3(hx * finalImpulse, finalImpulse * 0.18, hz * finalImpulse), this.body.position);

    this.state = 'hit';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
  }

  /** 前方ヒットボックスの位置と半径。攻撃中でなければ null。 */
  public getHitbox(): { x: number; y: number; z: number; radius: number } | null {
    if (!this.isAttackActive || !this.currentAttackType) return null;

    const fx = Math.sin(this.facingAngle);
    const fz = Math.cos(this.facingAngle);
    const p = this.body.position;
    const s = this.bodyScale;

    switch (this.currentAttackType) {
      case 'harite':
        return { x: p.x + fx * 1.05 * s, y: p.y + 0.2, z: p.z + fz * 1.05 * s, radius: 0.75 * s };
      case 'harite_strong':
        return { x: p.x + fx * 1.15 * s, y: p.y + 0.2, z: p.z + fz * 1.15 * s, radius: 0.95 * s };
      case 'buchikamashi':
        return { x: p.x + fx * 1.3 * s, y: p.y, z: p.z + fz * 1.3 * s, radius: 1.3 * s };
      case 'grab':
        return { x: p.x + fx * 1.3 * s, y: p.y + 0.2, z: p.z + fz * 1.3 * s, radius: 1.2 * s };
    }
    return null;
  }

  /** 回転の補間 */
  private updateRotation(dt: number): void {
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
}
