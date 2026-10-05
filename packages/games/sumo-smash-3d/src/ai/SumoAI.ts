import * as THREE from 'three';
import { SumoFighter } from '../entities/SumoFighter';

export class SumoAI {
  private fighter: SumoFighter;
  private thinkTimer: number = 0;
  private currentActionPlan: {
    moveX: number;
    moveZ: number;
    isMoving: boolean;
    dash: boolean;
    harite: boolean;
    buchikamashiCharge: boolean;
    buchikamashiRelease: boolean;
    shiko: boolean;
    grab: boolean;
    guard: boolean;
  } = {
    moveX: 0,
    moveZ: 0,
    isMoving: false,
    dash: false,
    harite: false,
    buchikamashiCharge: false,
    buchikamashiRelease: false,
    shiko: false,
    grab: false,
    guard: false,
  };

  private aiChargeTimer: number = 0;
  private isCharging: boolean = false;
  private targetChargeDuration: number = 0.6;

  constructor(fighter: SumoFighter) {
    this.fighter = fighter;
  }

  public update(dt: number, playerFighter: SumoFighter) {
    this.thinkTimer += dt;

    const myPos = new THREE.Vector3(
      this.fighter.body.position.x,
      this.fighter.body.position.y,
      this.fighter.body.position.z
    );
    const pPos = new THREE.Vector3(
      playerFighter.body.position.x,
      playerFighter.body.position.y,
      playerFighter.body.position.z
    );

    const distToPlayer = myPos.distanceTo(pPos);
    const distFromCenter = Math.hypot(myPos.x, myPos.z);

    // チャージ中の処理
    if (this.isCharging) {
      this.aiChargeTimer += dt;

      // 相手の方向へエイミングを追従
      const toPlayer = pPos.clone().sub(myPos);
      toPlayer.y = 0;
      if (toPlayer.lengthSq() > 0.01) {
        toPlayer.normalize();
        this.currentActionPlan.moveX = toPlayer.x;
        this.currentActionPlan.moveZ = toPlayer.z;
        this.currentActionPlan.isMoving = true;
      }

      if (this.aiChargeTimer >= this.targetChargeDuration) {
        this.isCharging = false;
        this.currentActionPlan.buchikamashiCharge = false;
        this.currentActionPlan.buchikamashiRelease = true;
      } else {
        this.currentActionPlan.buchikamashiCharge = true;
        this.currentActionPlan.buchikamashiRelease = false;
        return this.currentActionPlan;
      }
    } else {
      this.currentActionPlan.buchikamashiRelease = false;
    }

    // 0.07秒ごとに俊敏に思考を更新（高速戦闘対応）
    if (this.thinkTimer >= 0.07) {
      this.thinkTimer = 0;
      this.planNextAction(distToPlayer, distFromCenter, myPos, pPos, playerFighter);
    }

    return this.currentActionPlan;
  }

  private planNextAction(
    dist: number,
    distFromCenter: number,
    myPos: THREE.Vector3,
    pPos: THREE.Vector3,
    player: SumoFighter
  ) {
    // リセット
    this.currentActionPlan.harite = false;
    this.currentActionPlan.shiko = false;
    this.currentActionPlan.grab = false;
    this.currentActionPlan.dash = false;
    this.currentActionPlan.guard = false;

    // プレイヤーへのベクトル
    const toPlayer = pPos.clone().sub(myPos);
    toPlayer.y = 0;
    toPlayer.normalize();

    // がっぷり四つで掴んでいる場合: 前進寄り切り & 打撃連打 & 上手投げ！
    if (this.fighter.state === 'grab_holding') {
      this.currentActionPlan.moveX = toPlayer.x;
      this.currentActionPlan.moveZ = toPlayer.z;
      this.currentActionPlan.isMoving = true;
      this.currentActionPlan.dash = true; // 力強く寄り切る

      // 掴み打撃攻撃（張り手）で相手にダメージを蓄積
      if (this.fighter.grabHoldTimer < 1.1) {
        this.currentActionPlan.harite = Math.random() < 0.75;
      } else {
        // 蓄積後にぶちかましボタンで豪快に上手投げ！
        this.currentActionPlan.buchikamashiCharge = true;
      }
      return;
    }

    // 掴まれている場合: ガチャ連打で脱出！
    if (this.fighter.state === 'grabbed') {
      this.currentActionPlan.harite = Math.random() < 0.8;
      this.currentActionPlan.dash = Math.random() < 0.8;
      return;
    }

    // 土俵際（ピンチ）の警戒
    const isRingEdgeDanger = distFromCenter > 7.0;
    const canGuardSafely = this.fighter.guardCooldown <= 0 && this.fighter.guardGauge > 30;

    // 相手がガードを固めているなら、積極的に「つかみ」でガード崩し！
    if (player.state === 'guard' && dist < 2.0 && this.fighter.grabCooldown <= 0) {
      this.currentActionPlan.grab = true;
      return;
    }

    // 0. 相手がスタン（気絶中）なら最大威力の攻撃で一気に場外へ押し出す！
    if (player.state === 'stun') {
      if (this.fighter.buchikamashiCooldown <= 0 && !this.isCharging) {
        this.isCharging = true;
        this.aiChargeTimer = 0;
        this.targetChargeDuration = 0.55;
        this.currentActionPlan.buchikamashiCharge = true;
        return;
      }
      // ダッシュで接近して張り手連打
      this.currentActionPlan.moveX = toPlayer.x;
      this.currentActionPlan.moveZ = toPlayer.z;
      this.currentActionPlan.isMoving = true;
      if (dist < 1.8) {
        this.currentActionPlan.harite = true;
      } else {
        this.currentActionPlan.dash = true;
      }
      return;
    }

    // 1. 相手がぶちかまし突進中
    if (player.state === 'buchikamashi_rush' && dist < 3.5) {
      if (this.fighter.shikoCooldown <= 0 && Math.random() < 0.5) {
        // 四股でスーパーアーマーカウンター！
        this.currentActionPlan.shiko = true;
        this.currentActionPlan.isMoving = false;
        return;
      } else if (canGuardSafely) {
        // ガードで受け止める！
        this.currentActionPlan.guard = true;
        this.currentActionPlan.isMoving = false;
        return;
      }
    }

    // 2. 近距離戦 (dist < 2.0m)
    if (dist < 2.0) {
      // 相手が張り手を出している場合、一定確率でガード（安全な場合のみ）
      if (player.state === 'harite' && canGuardSafely && Math.random() < 0.45) {
        this.currentActionPlan.guard = true;
        return;
      }

      const rand = Math.random();
      if (rand < 0.4) {
        // 張り手（突っ張り）連打
        this.currentActionPlan.harite = true;
      } else if (rand < 0.6 && this.fighter.grabCooldown <= 0) {
        // つかみ（組み手）
        this.currentActionPlan.grab = true;
      } else if (rand < 0.75 && this.fighter.shikoCooldown <= 0) {
        // 四股で体勢崩し（クールタイム終了時のみ）
        this.currentActionPlan.shiko = true;
      } else if (rand < 0.88 && canGuardSafely) {
        // 固いガードで様子見
        this.currentActionPlan.guard = true;
      } else {
        // 組み合って前進押し込み
        this.currentActionPlan.moveX = toPlayer.x;
        this.currentActionPlan.moveZ = toPlayer.z;
        this.currentActionPlan.isMoving = true;
      }
      return;
    }

    // 3. 中距離戦 (2.0m <= dist <= 7.0m)
    if (dist <= 7.0) {
      const rand = Math.random();
      if (rand < 0.35 && !this.isCharging && !isRingEdgeDanger && this.fighter.buchikamashiCooldown <= 0) {
        // ぶちかましタメ開始（クールタイム終了時のみ）
        this.isCharging = true;
        this.aiChargeTimer = 0;
        this.targetChargeDuration = 0.4 + Math.random() * 0.5;
        this.currentActionPlan.buchikamashiCharge = true;
        return;
      } else if (rand < 0.6) {
        // すり足ダッシュで急接近！
        this.currentActionPlan.moveX = toPlayer.x;
        this.currentActionPlan.moveZ = toPlayer.z;
        this.currentActionPlan.isMoving = true;
        this.currentActionPlan.dash = true;
        return;
      }
    }

    // 4. 移動方針: 基本は相手に向かってにじり寄る
    let targetDir = toPlayer;
    if (isRingEdgeDanger) {
      // 中央に戻るベクトルを加味
      const toCenter = new THREE.Vector3(-myPos.x, 0, -myPos.z).normalize();
      targetDir = targetDir.clone().addScaledVector(toCenter, 0.7).normalize();
    }

    this.currentActionPlan.moveX = targetDir.x;
    this.currentActionPlan.moveZ = targetDir.z;
    this.currentActionPlan.isMoving = true;
  }
}
