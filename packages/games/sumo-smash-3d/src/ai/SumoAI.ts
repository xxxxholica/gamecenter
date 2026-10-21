import * as THREE from 'three';
import type { SimFighter, FighterActions, FighterMoveInput } from '../../../../shared/sumoSim/SimFighter';

export interface AiPlan {
  move: FighterMoveInput;
  actions: FighterActions;
}

/**
 * CPU 力士の思考。操作は人間と同じ「移動・打撃・つかみ」だけ。
 * 三すくみ(張り手 > タメ、タメ > つかみ、つかみ > 張り手)を意識して手を選ぶ。
 */
export class SumoAI {
  private fighter: SimFighter;
  private thinkTimer: number = 0;
  private thinkInterval: number = 0.08;

  private move: FighterMoveInput = { x: 0, z: 0, isMoving: false };
  // 押しっぱなしの状態(タメ)
  private holdStrike: boolean = false;
  // 1フレームだけ立てる入力
  private tapStrike: boolean = false;
  private tapGrab: boolean = false;
  private releaseStrike: boolean = false;

  private chargeTimer: number = 0;
  private targetChargeDuration: number = 0.5;

  constructor(fighter: SimFighter) {
    this.fighter = fighter;
  }

  public setThinkInterval(sec: number): void {
    this.thinkInterval = Math.max(0.03, sec);
  }

  public reset(): void {
    this.thinkTimer = 0;
    this.move = { x: 0, z: 0, isMoving: false };
    this.holdStrike = false;
    this.tapStrike = false;
    this.tapGrab = false;
    this.releaseStrike = false;
    this.chargeTimer = 0;
  }

  public update(dt: number, opponent: SimFighter): AiPlan {
    if (this.fighter.isSkyDropping || this.fighter.gone) {
      return {
        move: { x: 0, z: 0, isMoving: false },
        actions: { strikePressed: false, strike: false, strikeReleased: false, grabPressed: false },
      };
    }
    this.thinkTimer += dt;

    const myPos = new THREE.Vector3(this.fighter.body.position.x, 0, this.fighter.body.position.z);
    const oppPos = new THREE.Vector3(opponent.body.position.x, 0, opponent.body.position.z);

    // タメ中: 相手の方を向いたまま、狙いの長さまで押し続けて離す
    if (this.holdStrike) {
      this.chargeTimer += dt;
      const toOpp = oppPos.clone().sub(myPos);
      if (toOpp.lengthSq() > 0.01) {
        toOpp.normalize();
        this.move = { x: toOpp.x, z: toOpp.z, isMoving: true };
      }
      // 相手に張り手で割り込まれる位置なら、タメずに諦める(状態が変われば自然に解除される)
      if (this.fighter.state !== 'buchikamashi_charge' && this.fighter.state !== 'strike_hold') {
        this.holdStrike = false;
      } else if (this.chargeTimer >= this.targetChargeDuration) {
        this.holdStrike = false;
        this.releaseStrike = true;
      }
    } else if (this.thinkTimer >= this.thinkInterval) {
      this.thinkTimer = 0;
      this.plan(myPos, oppPos, opponent);
    }

    const plan: AiPlan = {
      move: { ...this.move },
      actions: {
        strikePressed: this.tapStrike,
        strike: this.holdStrike,
        strikeReleased: this.releaseStrike || (this.tapStrike && !this.holdStrike),
        grabPressed: this.tapGrab,
      },
    };

    // 単発の入力は1フレームで消す
    this.tapStrike = false;
    this.tapGrab = false;
    this.releaseStrike = false;
    return plan;
  }

  private moveToward(dir: THREE.Vector3) {
    this.move = { x: dir.x, z: dir.z, isMoving: true };
  }

  private plan(myPos: THREE.Vector3, oppPos: THREE.Vector3, opp: SimFighter) {
    const me = this.fighter;
    this.move = { x: 0, z: 0, isMoving: false };

    const toOpp = oppPos.clone().sub(myPos);
    const dist = toOpp.length();
    if (dist > 0.01) toOpp.normalize();
    const distFromCenter = Math.hypot(myPos.x, myPos.z);
    const edgeDanger = distFromCenter > 7.0;
    const toCenter = new THREE.Vector3(-myPos.x, 0, -myPos.z).normalize();
    const side = new THREE.Vector3(-toOpp.z, 0, toOpp.x);

    // 掴まれたり、連続で殴られたら、ボタンを連打して抜ける
    if (me.state === 'grabbed') {
      this.tapStrike = Math.random() < 0.7;
      return;
    }
    if (me.state === 'hit') {
      this.tapStrike = Math.random() < 0.5;
      return;
    }
    if (me.state === 'grab_holding' || me.state === 'throw') return;

    // 相手が突進してくる: 横にかわす
    if (opp.state === 'buchikamashi_rush' && dist < 6) {
      this.moveToward(side.multiplyScalar(Math.random() < 0.5 ? 1 : -1));
      return;
    }

    // 相手がタメている: 近づいて張り手で割り込む
    if (opp.state === 'buchikamashi_charge') {
      if (dist < 1.9) {
        this.tapStrike = true;
      } else {
        this.moveToward(toOpp);
      }
      return;
    }

    // 相手がつかみに来ている: 離れてかわす(近いなら突進で弾く)
    if (opp.state === 'grab_attempt' && dist < 3) {
      this.moveToward(toOpp.clone().multiplyScalar(-1));
      return;
    }

    // 近距離
    if (dist < 2.2) {
      const r = Math.random();
      if (r < 0.5) {
        this.tapStrike = true; // 張り手
      } else if (r < 0.8 && me.grabCooldown <= 0) {
        this.tapGrab = true; // 張り手を受けながら掴める
      } else {
        this.moveToward(toOpp);
      }
      return;
    }

    // 中距離: 離れてからタメて突進(つかみ狙いの相手には有効)
    if (dist < 8 && me.buchikamashiCooldown <= 0 && !edgeDanger && Math.random() < 0.3) {
      this.holdStrike = true;
      this.tapStrike = true;
      this.chargeTimer = 0;
      this.targetChargeDuration = 0.35 + Math.random() * 0.4;
      return;
    }

    // 基本は相手に詰める。土俵際なら中央寄りに
    let dir = toOpp;
    if (edgeDanger) {
      dir = toOpp.clone().addScaledVector(toCenter, 0.9).normalize();
    }
    this.moveToward(dir);
  }
}
