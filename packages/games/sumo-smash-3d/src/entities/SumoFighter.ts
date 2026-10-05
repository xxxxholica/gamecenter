import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { CharacterModel, CharacterColors } from './CharacterModel';
import { SoundManager } from '../audio/SoundManager';
import { ParticleManager } from '../effects/ParticleManager';

export type FighterActionState =
  | 'idle'
  | 'walk'
  | 'dash'
  | 'guard'
  | 'harite'
  | 'buchikamashi_charge'
  | 'buchikamashi_rush'
  | 'shiko'
  | 'grab_attempt'
  | 'grab_holding'
  | 'throw'
  | 'grabbed'
  | 'stun'
  | 'hit'
  | 'fall';

export class SumoFighter {
  public id: string;
  public name: string;
  public model: CharacterModel;
  public body: CANNON.Body;
  public mesh: THREE.Group;

  // 相撲システム（蓄積ダメージ・吹き飛び倍率）
  public damagePercent: number = 0; // 0%〜
  public hasSuperArmor: boolean = false; // 四股中の吹き飛び無効
  public isGuarding: boolean = false; // ガード中
  public wins: number = 0;

  // ガード耐久値システム（使いすぎでスタン）
  public guardGauge: number = 100; // 0〜100
  public readonly maxGuardGauge: number = 100;
  public guardCooldown: number = 0; // ガード解除後の再使用制限クールタイム
  public readonly guardIntervalTime: number = 0.9; // ガード解除後0.9秒は再ガード不可
  public isStunned: boolean = false; // スタン中
  public stunTimer: number = 0; // スタン残り時間
  public readonly maxStunTime: number = 2.2; // スタン持続2.2秒

  // クールタイム（秒）
  public buchikamashiCooldown: number = 0;
  public readonly buchikamashiMaxCooldown: number = 2.8;

  public shikoCooldown: number = 0;
  public readonly shikoMaxCooldown: number = 4.2;

  // つかみ（組み手・投げ）システム
  public grabCooldown: number = 0;
  public readonly grabMaxCooldown: number = 0.7; // つかみクールタイム
  public grabbedOpponent: SumoFighter | null = null; // 掴んでいる相手
  public grabber: SumoFighter | null = null; // 自分を掴んでいる相手
  public grabHoldTimer: number = 0; // 掴み持続時間
  public grabEscapeMeter: number = 0; // 掴まれ脱出ゲージ（0〜100）
  public readonly maxGrabHoldTime: number = 2.6; // 最大掴み持続時間（2.6秒、確定2.0秒拘束）
  public grabAttackCooldown: number = 0; // 掴み中の一方的打撃連打クールタイム
  public grabPunchCount: number = 0; // 掴み中の打撃ヒット数

  // アクション状態
  public state: FighterActionState = 'idle';
  public stateTimer: number = 0;
  public chargeTimer: number = 0;
  public maxChargeTime: number = 0.65; // チャージ時間短縮でテンポUP

  // 移動パラメータ
  private walkSpeed: number = 13.5; // 通常歩行速度 (13.5)
  private dashSpeed: number = 24.0; // すり足ダッシュ速度 (24.0: 圧倒的な疾走感)
  private dashDustTimer: number = 0;
  private facingAngle: number = 0; // ラジアン（Y軸回転）
  private targetFacingAngle: number = 0;
  private buchikamashiDir: THREE.Vector3 = new THREE.Vector3(1, 0, 0); // ぶちかまし突進方向ベクトル

  // 攻撃ヒットボックス用情報
  public isAttackActive: boolean = false;
  public currentAttackType: 'harite' | 'buchikamashi' | 'shiko' | 'grab' | null = null;
  public attackHitRegistered: boolean = false;
  public shikoStompDone: boolean = false; // 四股の着地足踏み発生フラグ（ヒット登録フラグと分離）
  public hariteArm: 'left' | 'right' = 'right'; // 左右交互突っ張りフラグ

  // 参照
  private soundManager: SoundManager;
  private particleManager: ParticleManager;
  public initialPosition: THREE.Vector3;
  public initialAngle: number;

  // 頭上マーカー（1P / 2P / CPU インジケーター）
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
    this.isGuarding = false;
    this.guardGauge = this.maxGuardGauge;
    this.guardCooldown = 0;
    this.isStunned = false;
    this.stunTimer = 0;
    this.buchikamashiCooldown = 0;
    this.shikoCooldown = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.attackHitRegistered = false;
    this.shikoStompDone = false;

    this.syncMeshWithPhysics();
  }

  /**
   * 毎フレームの更新
   */
  public update(
    dt: number,
    moveInput: { x: number; z: number; isMoving: boolean; dash: boolean },
    actionInputs: {
      harite: boolean;
      buchikamashiCharge: boolean;
      buchikamashiRelease: boolean;
      shiko: boolean;
      grab: boolean;
      guard: boolean;
    },
    opponentPos: THREE.Vector3
  ) {
    this.stateTimer += dt;

    // クールタイムの減少
    if (this.buchikamashiCooldown > 0) {
      this.buchikamashiCooldown = Math.max(0, this.buchikamashiCooldown - dt);
    }
    if (this.shikoCooldown > 0) {
      this.shikoCooldown = Math.max(0, this.shikoCooldown - dt);
    }
    if (this.grabCooldown > 0) {
      this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    }
    if (this.guardCooldown > 0) {
      this.guardCooldown = Math.max(0, this.guardCooldown - dt);
    }

    // ガードゲージの自動回復（ガード中・スタン中でない時）
    if (this.state !== 'guard' && this.state !== 'stun') {
      this.guardGauge = Math.min(this.maxGuardGauge, this.guardGauge + dt * 22.0);
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
      case 'dash':
        this.handleMovementAndTransitions(dt, moveInput, actionInputs, opponentPos);
        break;

      case 'guard':
        this.handleGuard(dt, moveInput, actionInputs.guard, opponentPos);
        break;

      case 'stun':
        this.handleStun(dt);
        break;

      case 'harite':
        this.handleHarite(dt);
        break;

      case 'buchikamashi_charge':
        this.handleBuchikamashiCharge(
          dt,
          actionInputs.buchikamashiCharge,
          actionInputs.buchikamashiRelease,
          moveInput,
          opponentPos
        );
        break;

      case 'buchikamashi_rush':
        this.handleBuchikamashiRush(dt);
        break;

      case 'shiko':
        this.handleShiko(dt);
        break;

      case 'grab_attempt':
        this.handleGrabAttempt(dt);
        break;

      case 'grab_holding':
        this.handleGrabHolding(dt, moveInput, actionInputs, opponentPos);
        break;

      case 'throw':
        this.handleThrow(dt);
        break;

      case 'grabbed':
        this.handleGrabbed(dt, moveInput, actionInputs);
        break;

      case 'hit':
        this.handleHitStun(dt);
        break;
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

  /**
   * 通常移動、すり足ダッシュおよび攻撃遷移
   */
  private handleMovementAndTransitions(
    dt: number,
    moveInput: { x: number; z: number; isMoving: boolean; dash: boolean },
    actions: { harite: boolean; buchikamashiCharge: boolean; buchikamashiRelease: boolean; shiko: boolean; grab: boolean; guard: boolean },
    opponentPos: THREE.Vector3
  ) {
    // 接地チェック（土俵平面 Y=0、通常立ち姿勢の剛体中心 Y~0.9m）
    const isGrounded = this.body.position.y <= 1.15;

    // ガードへの遷移（地上限定、クールタイム中でなく、ゲージ十分）
    if (actions.guard && isGrounded && this.guardCooldown <= 0 && this.guardGauge >= 15) {
      this.startGuard();
      return;
    }

    // つかみへの遷移（地上限定、ガードを崩す特効技！ダッシュ中も即発動可能）
    if (actions.grab && isGrounded && this.grabCooldown <= 0) {
      this.startGrabAttempt();
      return;
    }

    // 攻撃への遷移優先度: 四股（地上限定） > 張り手 > ぶちかましチャージ（ダッシュ中も即座にキャンセル可能！）
    if (actions.shiko && isGrounded && this.shikoCooldown <= 0) {
      this.startShiko();
      return;
    }
    if (actions.harite) {
      this.startHarite();
      return;
    }
    if (actions.buchikamashiCharge && this.buchikamashiCooldown <= 0) {
      this.startBuchikamashiCharge(moveInput, opponentPos);
      return;
    }

    // 移動制御（すり足ダッシュ / 通常歩行 / 停止）
    if (moveInput.isMoving) {
      if (isGrounded) {
        if (moveInput.dash) {
          // --- すり足ダッシュ（電光石火の高速疾走・Shiftホールド対応） ---
          const wasNotDashing = this.state !== 'dash';
          this.state = 'dash';

          // 初速バースト（ダッシュ開始時にギュンッと鋭く踏み込む）
          const currentSpeed = wasNotDashing ? this.dashSpeed * 1.12 : this.dashSpeed;
          this.body.velocity.x = moveInput.x * currentSpeed;
          this.body.velocity.z = moveInput.z * currentSpeed;
          this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);

          if (wasNotDashing) {
            this.soundManager.playSuriasi();
            this.particleManager.spawnDust(
              new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
              new THREE.Vector3(moveInput.x, 0, moveInput.z)
            );
          }

          // 疾走中の土煙トレイル（高速すり足の砂煙を継続発生）
          this.dashDustTimer += dt;
          if (this.dashDustTimer >= 0.075) {
            this.dashDustTimer = 0;
            this.particleManager.spawnDust(
              new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
              new THREE.Vector3(-moveInput.x * 0.8, 0, -moveInput.z * 0.8)
            );
          }
        } else {
          // --- 通常歩行 ---
          this.state = 'walk';
          const speed = this.walkSpeed;
          this.body.velocity.x = moveInput.x * speed;
          this.body.velocity.z = moveInput.z * speed;
          this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
        }
      } else {
        // 空中制御: 打ち上げの慣性を維持しつつ、わずかな空中レバー操作で位置調整
        this.body.velocity.x += moveInput.x * this.walkSpeed * 0.05;
        this.body.velocity.z += moveInput.z * this.walkSpeed * 0.05;
      }
    } else {
      if (isGrounded) {
        if (moveInput.dash) {
          // レバーニュートラルでもShiftを押した場合は現在向いている正面方向へ高速すり足突進！
          const wasNotDashing = this.state !== 'dash';
          this.state = 'dash';

          const dirX = Math.sin(this.facingAngle);
          const dirZ = Math.cos(this.facingAngle);
          const currentSpeed = wasNotDashing ? this.dashSpeed * 1.12 : this.dashSpeed;
          this.body.velocity.x = dirX * currentSpeed;
          this.body.velocity.z = dirZ * currentSpeed;

          if (wasNotDashing) {
            this.soundManager.playSuriasi();
            this.particleManager.spawnDust(
              new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
              new THREE.Vector3(dirX, 0, dirZ)
            );
          }

          this.dashDustTimer += dt;
          if (this.dashDustTimer >= 0.075) {
            this.dashDustTimer = 0;
            this.particleManager.spawnDust(
              new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
              new THREE.Vector3(-dirX * 0.8, 0, -dirZ * 0.8)
            );
          }
        } else {
          // 完全静止（すり足制動でピタッと踏ん張る）
          this.state = 'idle';
          this.body.velocity.x *= 0.72;
          this.body.velocity.z *= 0.72;

          // 静止時は相手の方向を向く
          const dx = opponentPos.x - this.body.position.x;
          const dz = opponentPos.z - this.body.position.z;
          if (Math.hypot(dx, dz) > 0.1) {
            this.targetFacingAngle = Math.atan2(dx, dz);
          }
        }
      }
    }
  }

  /**
   * つかみ（組み手）開始
   */
  private startGrabAttempt() {
    this.state = 'grab_attempt';
    this.stateTimer = 0;
    this.isAttackActive = true;
    this.currentAttackType = 'grab';
    this.attackHitRegistered = false;
    this.grabCooldown = this.grabMaxCooldown;

    // 前方に力強くすり足踏み込み（5.0 -> 6.5: 相手の間合いへ一気に切り込む）
    const dirX = Math.sin(this.facingAngle);
    const dirZ = Math.cos(this.facingAngle);
    this.body.velocity.x = dirX * 6.5;
    this.body.velocity.z = dirZ * 6.5;

    this.soundManager.playSuriasi();
  }

  private handleGrabAttempt(dt: number) {
    // 発生: 0.03〜0.22秒で掴みヒットボックス有効（吸い付き性能UP）
    this.isAttackActive = this.stateTimer >= 0.03 && this.stateTimer <= 0.22;

    if (this.stateTimer > 0.12) {
      this.body.velocity.x *= 0.8;
      this.body.velocity.z *= 0.8;
    }

    // 0.26秒で空振り終了
    if (this.stateTimer > 0.26) {
      this.state = 'idle';
      this.isAttackActive = false;
      this.currentAttackType = null;
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
    }
  }

  /**
   * つかみ成功（がっぷり四つ成立）
   */
  public onGrabSuccess(opponent: SumoFighter) {
    this.state = 'grab_holding';
    this.stateTimer = 0;
    this.grabHoldTimer = 0;
    this.grabAttackCooldown = 0;
    this.grabPunchCount = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.grabbedOpponent = opponent;
    this.body.velocity.set(0, 0, 0);

    // 組み合いSE & 土煙インパクト
    this.soundManager.playTaiko();
    this.particleManager.spawnHariteHit(
      new THREE.Vector3(
        (this.body.position.x + opponent.body.position.x) * 0.5,
        1.1,
        (this.body.position.z + opponent.body.position.z) * 0.5
      )
    );
  }

  /**
   * 掴まれた側の状態遷移
   */
  public onGrabbed(grabber: SumoFighter) {
    this.state = 'grabbed';
    this.stateTimer = 0;
    this.isAttackActive = false;
    this.currentAttackType = null;
    this.isGuarding = false;
    this.grabber = grabber;
    this.grabEscapeMeter = 0;
    this.damagePercent += 3; // 組み止めダメージ3%
    this.body.velocity.set(0, 0, 0);
  }

  /**
   * がっぷり四つ中（寄り切り押し出し、および投げ技派生受付）
   */
  private handleGrabHolding(
    dt: number,
    moveInput: { x: number; z: number; isMoving: boolean; dash: boolean },
    actions: { harite: boolean; buchikamashiCharge: boolean; buchikamashiRelease: boolean; shiko: boolean; grab: boolean; guard: boolean },
    opponentPos: THREE.Vector3
  ) {
    if (!this.grabbedOpponent || this.grabbedOpponent.state !== 'grabbed') {
      this.state = 'idle';
      this.grabbedOpponent = null;
      return;
    }

    this.grabHoldTimer += dt;

    // 相手を自分の正面 0.9m にがっちり引き寄せて固定
    const forwardX = Math.sin(this.facingAngle);
    const forwardZ = Math.cos(this.facingAngle);
    this.grabbedOpponent.body.position.x = this.body.position.x + forwardX * 0.9;
    this.grabbedOpponent.body.position.z = this.body.position.z + forwardZ * 0.9;
    this.grabbedOpponent.body.position.y = Math.max(this.grabbedOpponent.body.position.y, 0.95);
    this.grabbedOpponent.body.velocity.set(0, 0, 0);

    // 寄り切り移動（移動キー入力で相手をパワフルに土俵際へ押し込む！）
    if (moveInput.isMoving) {
      const yorikiriSpeed = moveInput.dash ? 11.0 : 7.5; // すり足寄り切り強化 (6.0 -> 7.5 / dash 9.0 -> 11.0)
      this.body.velocity.x = moveInput.x * yorikiriSpeed;
      this.body.velocity.z = moveInput.z * yorikiriSpeed;
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);

      if (Math.random() < 0.35) {
        this.particleManager.spawnDust(
          new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
          new THREE.Vector3(-moveInput.x, 0, -moveInput.z)
        );
      }
    } else {
      this.body.velocity.x *= 0.5;
      this.body.velocity.z *= 0.5;
    }

    // つかみ攻撃クールダウン減衰
    if (this.grabAttackCooldown > 0) {
      this.grabAttackCooldown = Math.max(0, this.grabAttackCooldown - dt);
    }

    // 派生アクション①：つかみ打撃攻撃（張り手ボタン A / J で掴んだまま一方的に殴りつける！）
    if (actions.harite && this.grabAttackCooldown <= 0) {
      this.grabAttackCooldown = 0.18; // 心地よい高速連打テンポ
      this.grabPunchCount++;

      // 相手への打撃ダメージ（1発あたり 4.5% 加算）
      const strikeDamage = 4.5;
      this.grabbedOpponent.damagePercent += strikeDamage;

      // 左右交互に繰り出す
      this.hariteArm = this.hariteArm === 'right' ? 'left' : 'right';

      // インパクト音 ＆ エフェクト
      this.soundManager.playHarite();
      const strikePos = new THREE.Vector3(
        this.grabbedOpponent.body.position.x,
        1.1,
        this.grabbedOpponent.body.position.z
      );
      this.particleManager.spawnHariteHit(strikePos);
      this.particleManager.triggerShake(0.22);

      // 相手を軽く揺らす（打撃リアクション）
      const forwardVec = new THREE.Vector3(forwardX, 0, forwardZ);
      this.grabbedOpponent.body.applyImpulse(
        new CANNON.Vec3(forwardVec.x * 60, 20, forwardVec.z * 60),
        this.grabbedOpponent.body.position
      );
    }

    // 派生アクション②：投げ（ぶちかましボタン B / K または Grab ボタンで豪快に投げ飛ばす！）
    if (this.grabHoldTimer > 0.08) {
      if (actions.buchikamashiCharge || actions.buchikamashiRelease || actions.grab || actions.shiko) {
        const throwDir = moveInput.isMoving
          ? new THREE.Vector3(moveInput.x, 0, moveInput.z).normalize()
          : new THREE.Vector3(forwardX, 0, forwardZ);
        this.executeThrow(throwDir);
        return;
      }
    }

    // 最大ホールド時間終了（2.6秒）：自動的に前方へ豪快に投げ飛ばす！
    if (this.grabHoldTimer >= this.maxGrabHoldTime) {
      this.executeThrow(new THREE.Vector3(forwardX, 0, forwardZ));
    }
  }

  /**
   * 上手投げ（豪快な投げ技）発動！
   */
  private executeThrow(throwDir: THREE.Vector3) {
    if (!this.grabbedOpponent) return;

    const opponent = this.grabbedOpponent;
    this.state = 'throw';
    this.stateTimer = 0;
    this.body.velocity.set(0, 0, 0);

    // 相手へのダメージ（16%）加算
    const throwDamage = 16;
    opponent.damagePercent += throwDamage;

    // 相手へ強烈な吹き飛ばしインパルス（850 -> 920）
    const baseThrowImpulse = 920;
    const kbMult = 1.0 + opponent.damagePercent / 65.0;
    const finalImpulse = baseThrowImpulse * kbMult;

    // 投げの方向（入力方向＋斜め上への豪快な放物線）
    const impulse = new CANNON.Vec3(
      throwDir.x * finalImpulse,
      finalImpulse * 0.32,
      throwDir.z * finalImpulse
    );

    opponent.body.applyImpulse(impulse, opponent.body.position);
    opponent.state = 'hit';
    opponent.stateTimer = 0;
    opponent.grabber = null;

    // ドカン！と地面叩きつけの土煙＋大火花＋カメラシェイク
    this.particleManager.spawnHariteHit(
      new THREE.Vector3(opponent.body.position.x, 1.0, opponent.body.position.z)
    );
    this.particleManager.triggerShake(0.8);
    this.soundManager.playTaiko();
    this.soundManager.playBuchikamashiHit(1.3);

    this.grabbedOpponent = null;
  }

  private handleThrow(dt: number) {
    this.body.velocity.x *= 0.7;
    this.body.velocity.z *= 0.7;

    // 0.38秒で投げのフォロースルー終了
    if (this.stateTimer > 0.38) {
      this.state = 'idle';
    }
  }

  /**
   * 掴まれ拘束中（確定2秒間は完全脱出不能！2秒経過後にレバーガチャ脱出解禁）
   */
  private handleGrabbed(
    dt: number,
    moveInput: { x: number; z: number; isMoving: boolean; dash: boolean },
    actions: { harite: boolean; buchikamashiCharge: boolean; buchikamashiRelease: boolean; shiko: boolean; grab: boolean; guard: boolean }
  ) {
    if (!this.grabber || this.grabber.state !== 'grab_holding') {
      this.state = 'idle';
      this.grabber = null;
      return;
    }

    // ★ 確定2秒間（grabHoldTimer < 2.0秒）は完全脱出不能！
    // 2.0秒が経過した後にのみ、レバーガチャ・ボタン連打で脱出メーターが蓄積される
    if (this.grabber.grabHoldTimer >= 2.0) {
      if (actions.harite || actions.grab || actions.shiko || moveInput.dash || moveInput.isMoving) {
        this.grabEscapeMeter += 16;
      }

      // 脱出成功！（双方が弾かれて仕切り直し）
      if (this.grabEscapeMeter >= 100) {
        const dx = this.body.position.x - this.grabber.body.position.x;
        const dz = this.body.position.z - this.grabber.body.position.z;
        const len = Math.hypot(dx, dz) || 1;
        const pushX = (dx / len) * 260;
        const pushZ = (dz / len) * 260;

        this.body.applyImpulse(new CANNON.Vec3(pushX, 50, pushZ), this.body.position);
        this.grabber.body.applyImpulse(new CANNON.Vec3(-pushX, 50, -pushZ), this.grabber.body.position);

        this.state = 'idle';
        this.grabber.state = 'idle';
        this.grabber.grabbedOpponent = null;
        this.grabber = null;

        this.soundManager.playGuard();
        this.particleManager.spawnGuardSpark(new THREE.Vector3(this.body.position.x, 1.0, this.body.position.z));
      }
    }
  }

  /**
   * 張り手（ボタンA）開始
   */
  private startHarite() {
    this.state = 'harite';
    this.stateTimer = 0;
    this.isAttackActive = true;
    this.currentAttackType = 'harite';
    this.attackHitRegistered = false;

    // 左右交互に突っ張りを繰り出す（連打時の爽快感MAX）
    this.hariteArm = this.hariteArm === 'right' ? 'left' : 'right';

    // 前方に程よくすり足踏み込み（6.0 -> 3.5: 爆走連打を抑制）
    const dirX = Math.sin(this.facingAngle);
    const dirZ = Math.cos(this.facingAngle);
    this.body.velocity.x = dirX * 3.5;
    this.body.velocity.z = dirZ * 3.5;

    // 掌底の風切り・気合エフェクトを前方へ発生
    const forwardDir = new THREE.Vector3(dirX, 0, dirZ);
    const fighterPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
    this.particleManager.spawnHariteSwing(fighterPos, forwardDir);

    this.soundManager.playHarite();
  }

  private handleHarite(dt: number) {
    // 発生: 0.04〜0.14秒でヒットボックス有効
    this.isAttackActive = this.stateTimer >= 0.04 && this.stateTimer <= 0.14;

    // 踏み込みの後にしっかり足元ですり足制動
    if (this.stateTimer > 0.09) {
      this.body.velocity.x *= 0.82;
      this.body.velocity.z *= 0.82;
    }

    // 0.23秒で動作終了（0.17s -> 0.23s: 適度な後隙を設け、連打ハメを防止）
    if (this.stateTimer > 0.23) {
      this.state = 'idle';
      this.isAttackActive = false;
      this.currentAttackType = null;
      this.body.velocity.x = 0;
      this.body.velocity.z = 0;
    }
  }

  /**
   * ぶちかまし（ボタンB）チャージ開始
   * 使用時に入力された方向（レバー入力方向）へ瞬時に狙いを定めて突っ込み準備
   */
  private startBuchikamashiCharge(
    moveInput?: { x: number; z: number; isMoving: boolean },
    opponentPos?: THREE.Vector3
  ) {
    this.state = 'buchikamashi_charge';
    this.stateTimer = 0;
    this.chargeTimer = 0;
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;

    // 使用時に入力された方向へ瞬時に向きを合わせる！
    if (moveInput && moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
      this.facingAngle = this.targetFacingAngle;
      this.buchikamashiDir.set(moveInput.x, 0, moveInput.z).normalize();
    } else if (opponentPos) {
      // レバーニュートラルの場合は相手の方向へ向く
      const dx = opponentPos.x - this.body.position.x;
      const dz = opponentPos.z - this.body.position.z;
      if (Math.hypot(dx, dz) > 0.1) {
        this.targetFacingAngle = Math.atan2(dx, dz);
        this.facingAngle = this.targetFacingAngle;
        this.buchikamashiDir.set(dx, 0, dz).normalize();
      }
    } else {
      const dirX = Math.sin(this.facingAngle);
      const dirZ = Math.cos(this.facingAngle);
      this.buchikamashiDir.set(dirX, 0, dirZ).normalize();
    }
  }

  private handleBuchikamashiCharge(
    dt: number,
    isHolding: boolean,
    isReleased: boolean,
    moveInput: { x: number; z: number; isMoving: boolean },
    opponentPos: THREE.Vector3
  ) {
    this.chargeTimer += dt;
    const progress = Math.min(1.0, this.chargeTimer / this.maxChargeTime);

    // チャージ中もレバー入力で狙う方向をエイミング可能
    if (moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
      this.buchikamashiDir.set(moveInput.x, 0, moveInput.z).normalize();
    }

    // チャージ音＆粒子
    if (Math.random() < 0.4) {
      this.soundManager.playBuchikamashiCharge(progress);
    }
    this.particleManager.spawnChargeParticle(
      new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z),
      progress
    );

    // ボタンを離したか、最大タメ完了で突進発動
    if (isReleased || this.chargeTimer >= this.maxChargeTime * 1.15) {
      this.releaseBuchikamashi(moveInput);
    }
  }

  /**
   * ぶちかまし突進発動
   * 入力方向へ頭から豪快に突っ込む！
   */
  private releaseBuchikamashi(moveInput?: { x: number; z: number; isMoving: boolean }) {
    this.state = 'buchikamashi_rush';
    this.stateTimer = 0;
    this.isAttackActive = true;
    this.currentAttackType = 'buchikamashi';
    this.attackHitRegistered = false;
    this.hasSuperArmor = true; // 突進中は剛体スーパーアーマーで強引に突っ込む！

    // 発動の瞬間に移動入力があればその方向へ更新。なければチャージ中に定めた方向をそのまま維持！
    if (moveInput && moveInput.isMoving) {
      this.targetFacingAngle = Math.atan2(moveInput.x, moveInput.z);
      this.facingAngle = this.targetFacingAngle;
      this.buchikamashiDir.set(moveInput.x, 0, moveInput.z).normalize();
    } else if (this.buchikamashiDir.lengthSq() > 0.01) {
      this.targetFacingAngle = Math.atan2(this.buchikamashiDir.x, this.buchikamashiDir.z);
      this.facingAngle = this.targetFacingAngle;
    } else {
      const dirX = Math.sin(this.facingAngle);
      const dirZ = Math.cos(this.facingAngle);
      this.buchikamashiDir.set(dirX, 0, dirZ).normalize();
    }

    const chargeRatio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    // スピード: フルチャージでステージ半径（約9.2m）分突進するよう調整
    // C=0: 11.5m/s (0.30s持続 = 約3.45m突進), C=1.0: 16.0m/s (0.58s持続 = 約9.28m突進！ステージ半径に完全一致！)
    const speed = 11.5 + chargeRatio * 4.5;

    this.body.velocity.x = this.buchikamashiDir.x * speed;
    this.body.velocity.z = this.buchikamashiDir.z * speed;

    // ぶちかましのクールタイム開始
    this.buchikamashiCooldown = this.buchikamashiMaxCooldown;

    this.soundManager.playBuchikamashiHit(0.5 + chargeRatio * 0.5);
    // 突進開始時の後方爆発噴煙
    this.particleManager.spawnDust(
      new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
      new THREE.Vector3(-this.buchikamashiDir.x, 0, -this.buchikamashiDir.z)
    );
  }

  private handleBuchikamashiRush(dt: number) {
    const chargeRatio = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    // 突進持続時間: C=0で0.30s, C=1.0で0.58s（フルチャージで 16.0m/s × 0.58s = 9.28m 突進！）
    const rushDuration = 0.30 + chargeRatio * 0.28;
    const speed = 11.5 + chargeRatio * 4.5;

    // 突進中はキャラクターの向きを突進方向に完全固定（頭から突っ込む！）
    this.targetFacingAngle = Math.atan2(this.buchikamashiDir.x, this.buchikamashiDir.z);
    this.facingAngle = this.targetFacingAngle;

    // 突進持続時間中は指定方向への突き進む速度を強力にキープ（突っ込む推進力を維持！）
    if (this.stateTimer < rushDuration) {
      this.body.velocity.x = this.buchikamashiDir.x * speed;
      this.body.velocity.z = this.buchikamashiDir.z * speed;

      // 突進中の土煙トレイル
      if (Math.random() < 0.6) {
        this.particleManager.spawnDust(
          new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
          new THREE.Vector3(-this.buchikamashiDir.x, 0, -this.buchikamashiDir.z)
        );
      }
    }

    this.isAttackActive = this.stateTimer < rushDuration * 0.95;

    if (this.stateTimer >= rushDuration) {
      this.state = 'idle';
      this.isAttackActive = false;
      this.currentAttackType = null;
      this.hasSuperArmor = false;
      this.body.velocity.x *= 0.1;
      this.body.velocity.z *= 0.1;
    }
  }

  /**
   * ガード（ボタンD / Space等）
   */
  private startGuard() {
    this.state = 'guard';
    this.stateTimer = 0;
    this.isGuarding = true;
    this.isAttackActive = false;
    this.currentAttackType = null;
  }

  private handleGuard(
    dt: number,
    moveInput: { x: number; z: number; isMoving: boolean },
    isHoldingGuard: boolean,
    opponentPos: THREE.Vector3
  ) {
    // ガード持続中、耐久ゲージを徐々に消費（毎秒26pt消費＝約3.8秒で枯渇）
    this.guardGauge = Math.max(0, this.guardGauge - dt * 26.0);

    // ガードゲージ枯渇でガードクラッシュ（スタン発生！）
    if (this.guardGauge <= 0) {
      this.triggerGuardBreak();
      return;
    }

    // ガードを自ら解除した場合
    if (!isHoldingGuard) {
      this.state = 'idle';
      this.isGuarding = false;
      this.guardCooldown = this.guardIntervalTime; // ガード解除後0.9秒間は再ガード不可！
      return;
    }

    // ガード中は低速（通常の35%）で踏ん張り移動
    const guardSpeed = this.walkSpeed * 0.35;
    if (moveInput.isMoving) {
      this.body.velocity.x = moveInput.x * guardSpeed;
      this.body.velocity.z = moveInput.z * guardSpeed;
    } else {
      this.body.velocity.x *= 0.6;
      this.body.velocity.z *= 0.6;
    }

    // 相手の方向を常に向く
    const dx = opponentPos.x - this.body.position.x;
    const dz = opponentPos.z - this.body.position.z;
    if (Math.hypot(dx, dz) > 0.1) {
      this.targetFacingAngle = Math.atan2(dx, dz);
    }
  }

  /**
   * ガードクラッシュ（使いすぎ・シールド破壊によるスタン発生！）
   */
  public triggerGuardBreak() {
    this.state = 'stun';
    this.stateTimer = 0;
    this.isGuarding = false;
    this.isStunned = true;
    this.stunTimer = this.maxStunTime;
    this.guardGauge = 0;
    this.guardCooldown = 2.5; // スタン復帰後もしばらくガード不可

    // 物理速度を停止
    this.body.velocity.x = 0;
    this.body.velocity.z = 0;

    // クラッシュ音＆エフェクト
    const pos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
    this.soundManager.playGuardBreak();
    this.particleManager.spawnGuardBreak(pos);
  }

  /**
   * スタン（気絶・無防備）状態
   */
  private handleStun(dt: number) {
    this.stunTimer -= dt;
    this.body.velocity.x *= 0.8;
    this.body.velocity.z *= 0.8;

    // ガードゲージはスタン中ごくゆっくり回復
    this.guardGauge = Math.min(this.maxGuardGauge, this.guardGauge + dt * 10.0);

    // 頭上ピヨピヨ星
    const pos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);
    if (Math.random() < 0.22) {
      this.soundManager.playDaze();
    }
    this.particleManager.spawnStunStars(pos);

    // スタン時間終了で通常復帰
    if (this.stunTimer <= 0) {
      this.state = 'idle';
      this.isStunned = false;
    }
  }

  /**
   * 四股（ボタンC）開始
   */
  private startShiko() {
    this.state = 'shiko';
    this.stateTimer = 0;
    this.hasSuperArmor = true; // 四股開始で即座にスーパーアーマー発動！
    this.isAttackActive = false;
    this.currentAttackType = 'shiko';
    this.attackHitRegistered = false; // 相手にヒットしたかどうかのフラグ
    this.shikoStompDone = false; // 足踏み着地エフェクト発生フラグ

    // 四股のクールタイム開始
    this.shikoCooldown = this.shikoMaxCooldown;

    this.body.velocity.x = 0;
    this.body.velocity.z = 0;
  }

  private handleShiko(dt: number) {
    // 0.0〜0.26秒: 足上げ〜踏み下ろし（スーパーアーマー持続）
    // 0.26秒地点で大地に着地ドスン！（衝撃波発生＋攻撃判定有効化）
    if (this.stateTimer >= 0.26 && !this.shikoStompDone) {
      this.shikoStompDone = true;
      this.isAttackActive = true; // 攻撃判定を発生！
      this.soundManager.playShiko();
      this.particleManager.spawnShikoShockwave(
        new THREE.Vector3(this.body.position.x, 0, this.body.position.z)
      );
    }

    // 0.26秒〜0.46秒の間、攻撃判定を持続（範囲内の相手を確実に捉える！）
    if (this.stateTimer >= 0.46) {
      this.isAttackActive = false;
    }

    // 0.48秒でスーパーアーマー解除
    if (this.stateTimer >= 0.48) {
      this.hasSuperArmor = false;
    }

    // 0.54秒でアクション完了（構えへ復帰）
    if (this.stateTimer > 0.54) {
      this.state = 'idle';
      this.currentAttackType = null;
      this.isAttackActive = false;
    }
  }

  /**
   * 被弾硬直
   */
  private handleHitStun(dt: number) {
    this.isAttackActive = false;

    // 接地チェック（足元が土俵面 Y=0 付近、剛体重心 Y<=1.05m、かつ下降中）
    const isGrounded = this.body.position.y <= 1.05 && this.body.velocity.y <= 0.5;

    // 通常ヒットなら0.25秒で復帰
    // 四股等で空中に打ち上がっている場合は着地するまで空中くらい状態を維持（最大1.8秒で強制復帰）
    if ((this.stateTimer > 0.25 && isGrounded) || this.stateTimer > 1.8) {
      this.state = 'idle';

      // 空中から着地した瞬間の着地土煙
      if (isGrounded) {
        this.soundManager.playTaiko();
        this.particleManager.spawnDust(
          new THREE.Vector3(this.body.position.x, 0.2, this.body.position.z),
          new THREE.Vector3(0, 0, 0)
        );
      }
    }
  }

  /**
   * 攻撃ヒットの処理（ダメージ蓄積＋ノックバック適用）
   */
  public receiveHit(
    attackerPos: THREE.Vector3,
    attackType: 'harite' | 'buchikamashi' | 'shiko',
    attackerChargeProgress: number = 0
  ) {
    // スーパーアーマー中は吹き飛びを完全に無効化（ノーリアクション）
    if (this.hasSuperArmor) {
      // わずかなダメージ倍率加算のみ
      this.damagePercent += 3;
      return;
    }

    // 吹き飛びベクトルの計算（攻撃者から自身への向き）
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

    // ガード中の処理（ダメージ＆ノックバック大幅カット＋耐久値消費）
    if (this.state === 'guard') {
      const myPos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);

      if (attackType === 'harite') {
        // 張り手ガード: 削りダメージ1%のみ、耐久値-8（16 -> 8: ガードが即割れるのを防止）
        this.guardGauge -= 8;
        if (this.guardGauge <= 0) {
          this.triggerGuardBreak();
          return;
        }
        this.particleManager.spawnGuardSpark(myPos);
        this.soundManager.playGuard();
        this.damagePercent += 1;
        const pushImpulse = new CANNON.Vec3(hitDir.x * 60, 0, hitDir.z * 60);
        this.body.applyImpulse(pushImpulse, this.body.position);
        return;
      } else if (attackType === 'shiko') {
        // 四股ガード: 耐久値-32（大削り）、削りダメージ3%
        this.guardGauge -= 32;
        if (this.guardGauge <= 0) {
          this.triggerGuardBreak();
          return;
        }
        this.particleManager.spawnGuardSpark(myPos);
        this.soundManager.playGuard();
        this.damagePercent += 3;
        // 地響きによりガードしていても少し上へ浮き上がる
        const guardLiftImpulse = new CANNON.Vec3(0, 480, 0);
        this.body.applyImpulse(guardLiftImpulse, this.body.position);
        return;
      } else if (attackType === 'buchikamashi') {
        // ぶちかましガード: 耐久値-45、大削り
        const chargePower = 1.0 + attackerChargeProgress * 1.2;
        this.guardGauge -= 45 * chargePower;
        if (this.guardGauge <= 0) {
          this.triggerGuardBreak();
          return;
        }

        this.particleManager.spawnGuardSpark(myPos);
        this.soundManager.playGuard();
        this.damagePercent += (18 * chargePower) * 0.25;
        const guardImpulse =
          (550 + attackerChargeProgress * 500) * chargePower * (1.0 + this.damagePercent / 70.0) * 0.25;
        const impulse = new CANNON.Vec3(hitDir.x * guardImpulse, guardImpulse * 0.05, hitDir.z * guardImpulse);
        this.body.applyImpulse(impulse, this.body.position);
        this.state = 'hit';
        this.stateTimer = 0.15;
        this.isGuarding = false;
        this.guardCooldown = this.guardIntervalTime;
        return;
      }
    }

    // スタン中に被弾した場合: スタン解除
    if (this.state === 'stun') {
      this.isStunned = false;
      this.stunTimer = 0;
    }

    let baseDamage = 0;
    let baseImpulse = 0;

    switch (attackType) {
      case 'harite':
        baseDamage = 4; // 6 -> 4 (連打での過剰なダメージ蓄積を抑制)
        baseImpulse = 180; // 260 -> 180 (牽制・小押し出しに適正化)
        this.particleManager.spawnHariteHit(
          new THREE.Vector3(this.body.position.x, 1.2, this.body.position.z)
        );
        this.soundManager.playHarite();
        break;

      case 'buchikamashi':
        const chargePower = 1.0 + attackerChargeProgress * 1.4;
        baseDamage = 20 * chargePower;
        baseImpulse = (700 + attackerChargeProgress * 600) * chargePower;
        this.particleManager.spawnBuchikamashiHit(
          new THREE.Vector3(this.body.position.x, 1.0, this.body.position.z),
          chargePower
        );
        this.soundManager.playBuchikamashiHit(chargePower);
        break;

      case 'shiko':
        baseDamage = 18; // 四股ヒット: 相手にしっかりダメージ（18%）を与える！
        baseImpulse = 1350; // 画面内に綺麗に収まる上向きインパルス！
        this.particleManager.spawnShikoHit(
          new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z)
        );
        this.soundManager.playShikoHit();
        break;
    }

    // ダメージ蓄積
    this.damagePercent += baseDamage;

    // ノックバック演算（基本インパルス × (1 + ダメージ倍率 / 70)）
    const knockbackMultiplier = 1.0 + this.damagePercent / 70.0;

    let impulse: CANNON.Vec3;
    if (attackType === 'shiko') {
      // 四股専用: 画面内に綺麗に収まる高さ（約3.5m〜4.2m）で真上に打ち上げる！
      // ダメージが蓄積しても画面外へ飛び出さないよう初速上限（15.0m/s）を設定
      const liftRatio = 1.0 + (this.damagePercent / 70.0) * 0.35;
      const initialVy = Math.min(15.0, (baseImpulse / 100) * liftRatio); // 最大初速 15.0m/s (最高高度約4.0m)
      const verticalImpulse = initialVy * 100;
      const horizontalDrift = 35 * (1.0 + (this.damagePercent / 70.0) * 0.2);

      impulse = new CANNON.Vec3(
        hitDir.x * horizontalDrift,
        verticalImpulse,
        hitDir.z * horizontalDrift
      );

      // 地面接触を確実に離脱させ、画面内に収まる垂直初速を直接適用
      this.body.position.y = Math.max(this.body.position.y, 1.15);
      this.body.velocity.y = initialVy;
      this.body.velocity.x = hitDir.x * 0.6;
      this.body.velocity.z = hitDir.z * 0.6;
    } else {
      const finalImpulse = baseImpulse * knockbackMultiplier;
      // 水平方向＋わずかな上方向成分（浮き上がり）
      impulse = new CANNON.Vec3(
        hitDir.x * finalImpulse,
        finalImpulse * 0.18, // 上に浮き上がらせる
        hitDir.z * finalImpulse
      );
    }

    this.body.applyImpulse(impulse, this.body.position);

    // 状態を被弾へ
    this.state = 'hit';
    this.stateTimer = 0;
  }

  /**
   * 前方ヒットボックスの位置と半径を取得
   */
  public getHitbox(): { position: THREE.Vector3; radius: number } | null {
    if (!this.isAttackActive || !this.currentAttackType) return null;

    const pos = new THREE.Vector3(this.body.position.x, this.body.position.y, this.body.position.z);

    if (this.currentAttackType === 'shiko') {
      // 四股は自身の周囲全方位（半径 3.5mの大衝撃波）
      return { position: pos, radius: 3.5 };
    }

    // 張り手・ぶちかましは前方
    const forwardX = Math.sin(this.facingAngle);
    const forwardZ = Math.cos(this.facingAngle);

    if (this.currentAttackType === 'harite') {
      pos.x += forwardX * 0.95;
      pos.z += forwardZ * 0.95;
      pos.y += 0.2;
      return { position: pos, radius: 0.65 };
    }

    if (this.currentAttackType === 'buchikamashi') {
      pos.x += forwardX * 1.3;
      pos.z += forwardZ * 1.3;
      return { position: pos, radius: 1.2 };
    }

    if (this.currentAttackType === 'grab') {
      pos.x += forwardX * 1.15;
      pos.z += forwardZ * 1.15;
      pos.y += 0.2;
      return { position: pos, radius: 0.95 };
    }

    return null;
  }

  /**
   * 回転の補間
   */
  private updateRotation(dt: number) {
    // 突進中は突進方向に体を完全固定（頭から突っ込む！）
    if (this.state === 'buchikamashi_rush') {
      this.facingAngle = this.targetFacingAngle;
      return;
    }

    // 角度差分の正規化 (-PI ~ PI)
    let diff = this.targetFacingAngle - this.facingAngle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const rotSpeed = 38.0; // 旋回追従速度大幅UP (26.0 -> 38.0) でレバー入力に即座に足元が追従
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

    if (this.state === 'harite') {
      animProgress = Math.min(1.0, this.stateTimer / 0.23);
    } else if (this.state === 'buchikamashi_charge') {
      chargeProgress = Math.min(1.0, this.chargeTimer / this.maxChargeTime);
    } else if (this.state === 'buchikamashi_rush') {
      animProgress = Math.min(1.0, this.stateTimer / 0.46);
    } else if (this.state === 'shiko') {
      animProgress = Math.min(1.0, this.stateTimer / 0.54);
    } else if (this.state === 'grab_attempt') {
      animProgress = Math.min(1.0, this.stateTimer / 0.22);
    } else if (this.state === 'grab_holding') {
      animProgress = Math.min(1.0, this.grabHoldTimer / this.maxGrabHoldTime);
    } else if (this.state === 'throw') {
      animProgress = Math.min(1.0, this.stateTimer / 0.38);
    } else if (this.state === 'grabbed') {
      animProgress = Math.min(1.0, this.stateTimer / 1.0);
    } else if (this.state === 'hit') {
      animProgress = Math.min(1.0, this.stateTimer / 0.25);
    }

    this.model.updateAnimation(dt, this.state as any, animProgress, chargeProgress, this.hariteArm);
  }

  /**
   * 頭上マーカーの浮遊アニメーション
   */
  public updateMarkerAnimation(dt: number) {
    this.markerAnimTimer += dt;
    // 上下にふわりと揺れる浮遊モーション
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
