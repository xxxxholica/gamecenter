import * as THREE from 'three';

export interface CharacterColors {
  skinColor: number;
  mawashiColor: number;
  hairColor: number;
}

export class CharacterModel {
  public root: THREE.Group;

  // 主要ボーン・パーツノード
  private bodyGroup: THREE.Group;
  private torsoMesh: THREE.Mesh;
  private bellyMesh: THREE.Mesh;
  private headMesh: THREE.Mesh;
  private chonmageMesh: THREE.Mesh;
  private mawashiMesh: THREE.Mesh;

  private leftArmGroup: THREE.Group;
  private rightArmGroup: THREE.Group;
  private leftHandMesh: THREE.Mesh;
  private rightHandMesh: THREE.Mesh;

  private leftLegGroup: THREE.Group;
  private rightLegGroup: THREE.Group;

  private skinMat: THREE.MeshStandardMaterial;
  private mawashiMat: THREE.MeshStandardMaterial;
  private hairMat: THREE.MeshStandardMaterial;

  // アニメーション用変数
  private animTimer: number = 0;

  constructor(colors: CharacterColors) {
    this.root = new THREE.Group();

    // マテリアル
    const skinMat = new THREE.MeshStandardMaterial({
      color: colors.skinColor,
      roughness: 0.65,
      metalness: 0.05,
    });
    this.skinMat = skinMat;

    const mawashiMat = new THREE.MeshStandardMaterial({
      color: colors.mawashiColor,
      roughness: 0.8,
      metalness: 0.1,
    });
    this.mawashiMat = mawashiMat;

    const hairMat = new THREE.MeshStandardMaterial({
      color: colors.hairColor,
      roughness: 0.4,
    });
    this.hairMat = hairMat;

    // 胴体グループ（Y軸中心）
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.position.y = 0.9;
    this.root.add(this.bodyGroup);

    // 胴体（胸・背中）
    const torsoGeo = new THREE.CylinderGeometry(0.55, 0.48, 0.7, 16);
    this.torsoMesh = new THREE.Mesh(torsoGeo, skinMat);
    this.torsoMesh.position.y = 0.35;
    this.torsoMesh.castShadow = true;
    this.bodyGroup.add(this.torsoMesh);

    // 太鼓腹（相撲取り特有のどっしりとしたお腹）
    const bellyGeo = new THREE.SphereGeometry(0.58, 16, 16);
    bellyGeo.scale(1.0, 0.8, 1.15);
    this.bellyMesh = new THREE.Mesh(bellyGeo, skinMat);
    this.bellyMesh.position.set(0, 0.15, 0.15);
    this.bellyMesh.castShadow = true;
    this.bodyGroup.add(this.bellyMesh);

    // マワシ（廻し）
    const mawashiGeo = new THREE.CylinderGeometry(0.56, 0.52, 0.36, 16);
    this.mawashiMesh = new THREE.Mesh(mawashiGeo, mawashiMat);
    this.mawashiMesh.position.y = -0.05;
    this.mawashiMesh.castShadow = true;
    this.bodyGroup.add(this.mawashiMesh);

    // マワシの前垂れ（前袋）
    const tareGeo = new THREE.BoxGeometry(0.3, 0.4, 0.08);
    const tareMesh = new THREE.Mesh(tareGeo, mawashiMat);
    tareMesh.position.set(0, -0.22, 0.54);
    tareMesh.castShadow = true;
    this.bodyGroup.add(tareMesh);

    // 頭部
    const headGeo = new THREE.SphereGeometry(0.3, 16, 16);
    this.headMesh = new THREE.Mesh(headGeo, skinMat);
    this.headMesh.position.set(0, 0.82, 0.05);
    this.headMesh.castShadow = true;
    this.bodyGroup.add(this.headMesh);

    // 大銀杏（大銀杏・ちょんまげ）
    const chonmageGeo = new THREE.SphereGeometry(0.18, 12, 12);
    chonmageGeo.scale(0.8, 0.4, 1.4);
    this.chonmageMesh = new THREE.Mesh(chonmageGeo, hairMat);
    this.chonmageMesh.position.set(0, 0.28, -0.08);
    this.chonmageMesh.rotation.x = -0.3;
    this.headMesh.add(this.chonmageMesh);

    // --- 腕部 ---
    // 左腕
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.62, 0.55, 0);
    this.bodyGroup.add(this.leftArmGroup);

    const armGeo = new THREE.CylinderGeometry(0.16, 0.14, 0.55, 12);
    const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
    leftArmMesh.position.y = -0.25;
    leftArmMesh.castShadow = true;
    this.leftArmGroup.add(leftArmMesh);

    // 左平手（力士特有の大きな掌）
    const handGeo = new THREE.BoxGeometry(0.20, 0.25, 0.09);
    this.leftHandMesh = new THREE.Mesh(handGeo, skinMat);
    this.leftHandMesh.position.set(0, -0.55, 0);
    this.leftHandMesh.castShadow = true;
    this.leftArmGroup.add(this.leftHandMesh);

    // 右腕
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.62, 0.55, 0);
    this.bodyGroup.add(this.rightArmGroup);

    const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
    rightArmMesh.position.y = -0.25;
    rightArmMesh.castShadow = true;
    this.rightArmGroup.add(rightArmMesh);

    // 右平手（力士特有の大きな掌）
    this.rightHandMesh = new THREE.Mesh(handGeo, skinMat);
    this.rightHandMesh.position.set(0, -0.55, 0);
    this.rightHandMesh.castShadow = true;
    this.rightArmGroup.add(this.rightHandMesh);

    // --- 脚部 ---
    const legGeo = new THREE.CylinderGeometry(0.24, 0.18, 0.65, 12);

    // 左脚
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.35, -0.2, 0);
    this.bodyGroup.add(this.leftLegGroup);

    const leftLegMesh = new THREE.Mesh(legGeo, skinMat);
    leftLegMesh.position.y = -0.32;
    leftLegMesh.castShadow = true;
    this.leftLegGroup.add(leftLegMesh);

    // 右脚
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.35, -0.2, 0);
    this.bodyGroup.add(this.rightLegGroup);

    const rightLegMesh = new THREE.Mesh(legGeo, skinMat);
    rightLegMesh.position.y = -0.32;
    rightLegMesh.castShadow = true;
    this.rightLegGroup.add(rightLegMesh);
  }

  /** 力士の肌・まわし・髪の色を切り替える(百人組手の敵バリエーション用) */
  public setColors(colors: CharacterColors): void {
    this.skinMat.color.setHex(colors.skinColor);
    this.mawashiMat.color.setHex(colors.mawashiColor);
    this.hairMat.color.setHex(colors.hairColor);
  }

  /**
   * アニメーション更新
   * @param dt 経過時間
   * @param state 現在の状態
   * @param moveSpeed 現在の移動速度
   */
  public updateAnimation(
    dt: number,
    state: 'idle' | 'walk' | 'dash' | 'harite' | 'buchikamashi_charge' | 'buchikamashi_rush' | 'shiko' | 'grab_attempt' | 'grab_holding' | 'throw' | 'grabbed' | 'guard' | 'stun' | 'hit',
    stateProgress: number = 0,
    chargeProgress: number = 0,
    hariteArm: 'left' | 'right' = 'right'
  ) {
    this.animTimer += dt;

    // リセット基準姿勢
    this.resetPose();

    switch (state) {
      case 'idle':
        this.animateIdle();
        break;
      case 'walk':
        this.animateWalk();
        break;
      case 'dash':
        this.animateDash();
        break;
      case 'harite':
        this.animateHarite(stateProgress, hariteArm);
        break;
      case 'buchikamashi_charge':
        this.animateBuchikamashiCharge(chargeProgress);
        break;
      case 'buchikamashi_rush':
        this.animateBuchikamashiRush();
        break;
      case 'shiko':
        this.animateShiko(stateProgress);
        break;
      case 'grab_attempt':
        this.animateGrabAttempt(stateProgress);
        break;
      case 'grab_holding':
        this.animateGrabHolding();
        break;
      case 'throw':
        this.animateThrow(stateProgress);
        break;
      case 'grabbed':
        this.animateGrabbed();
        break;
      case 'guard':
        this.animateGuard();
        break;
      case 'stun':
        this.animateStun();
        break;
      case 'hit':
        this.animateHit(stateProgress);
        break;
    }
  }

  private animateGuard() {
    // ガード（腰を落として両腕を胸の前で立てて固める）
    this.bodyGroup.position.y = 0.74;
    this.bodyGroup.rotation.x = 0.2; // わずかに前傾
    // 両腕を前に立ててクロス気味に構える
    this.leftArmGroup.rotation.set(1.3, 0.3, -0.4);
    this.rightArmGroup.rotation.set(1.3, -0.3, 0.4);
    this.leftArmGroup.position.x = -0.45;
    this.rightArmGroup.position.x = 0.45;
    this.leftLegGroup.rotation.x = 0.25;
    this.rightLegGroup.rotation.x = -0.25;
  }

  private animateStun() {
    // スタン（腰が浮いて棒立ち、体がふらふら揺れて脱力）
    const sway = Math.sin(this.animTimer * 5.0) * 0.22;
    const wobble = Math.cos(this.animTimer * 6.5) * 0.16;
    this.bodyGroup.position.y = 0.95 + Math.sin(this.animTimer * 8.0) * 0.04;
    this.bodyGroup.rotation.z = sway;
    this.bodyGroup.rotation.x = -0.15 + wobble;

    // 頭がクラクラ
    this.headMesh.rotation.y = Math.sin(this.animTimer * 7.0) * 0.4;
    this.headMesh.rotation.z = Math.cos(this.animTimer * 7.0) * 0.3;

    // 両腕がだらんと脱力
    this.leftArmGroup.rotation.set(-0.2 + wobble, 0, 0.15);
    this.rightArmGroup.rotation.set(-0.2 - wobble, 0, -0.15);
    this.leftArmGroup.position.x = -0.55;
    this.rightArmGroup.position.x = 0.55;
  }



  private resetPose() {
    this.bodyGroup.position.y = 0.9;
    this.bodyGroup.rotation.set(0, 0, 0);

    this.leftArmGroup.position.set(-0.62, 0.55, 0);
    this.rightArmGroup.position.set(0.62, 0.55, 0);
    this.leftArmGroup.rotation.set(0, 0, 0.2);
    this.rightArmGroup.rotation.set(0, 0, -0.2);

    this.leftHandMesh.rotation.set(0, 0, 0);
    this.rightHandMesh.rotation.set(0, 0, 0);
    this.leftHandMesh.scale.set(1, 1, 1);
    this.rightHandMesh.scale.set(1, 1, 1);

    this.leftLegGroup.rotation.set(0, 0, 0);
    this.rightLegGroup.rotation.set(0, 0, 0);

    this.torsoMesh.rotation.set(0, 0, 0);
    this.headMesh.rotation.set(0, 0, 0);
  }

  private animateIdle() {
    // 構え（腰を落として、呼吸するように上下）
    const breath = Math.sin(this.animTimer * 3.0) * 0.04;
    this.bodyGroup.position.y = 0.85 + breath;
    // 手を前方に構える
    this.leftArmGroup.rotation.x = 0.4;
    this.rightArmGroup.rotation.x = 0.4;
    this.leftArmGroup.rotation.z = 0.3;
    this.rightArmGroup.rotation.z = -0.3;
  }

  private animateWalk() {
    // どすこい歩行（超高速キビキビ足さばき）
    const walkCycle = this.animTimer * 22.0;
    const sway = Math.sin(walkCycle) * 0.14;
    this.bodyGroup.rotation.z = sway;
    this.bodyGroup.position.y = 0.85 + Math.abs(Math.cos(walkCycle)) * 0.08;

    this.leftLegGroup.rotation.x = Math.sin(walkCycle) * 0.55;
    this.rightLegGroup.rotation.x = -Math.sin(walkCycle) * 0.55;

    this.leftArmGroup.rotation.x = -Math.sin(walkCycle) * 0.45 + 0.3;
    this.rightArmGroup.rotation.x = Math.sin(walkCycle) * 0.45 + 0.3;
  }

  private animateDash() {
    // すり足（超高速な足踏み込みで砂煙を巻き上げる）
    this.bodyGroup.position.y = 0.72;
    this.bodyGroup.rotation.x = 0.4; // 前傾姿勢
    this.leftArmGroup.rotation.x = 0.8;
    this.rightArmGroup.rotation.x = 0.8;

    // 高速すり足の足元振動
    const dashFlutter = Math.sin(this.animTimer * 40.0) * 0.18;
    this.leftLegGroup.rotation.x = 0.3 + dashFlutter;
    this.rightLegGroup.rotation.x = -0.3 - dashFlutter;
  }

  private animateHarite(progress: number, armSide: 'left' | 'right' = 'right') {
    // 張り手（大相撲の鋭く重い突っ張り）
    // progress は 0.0 ~ 1.0 (約0.23秒の打撃)
    //
    // 【腰振りの根絶】
    // bodyGroup.rotation.y を絶対回さない！腰・マワシは正面を向いてブレず、
    // 重心を低く落としたすり足スタンスで足を前後に踏み張る。
    //
    // 【手の平（掌底）のインパクト】
    // 腕を前方正中線へ向けて電光石火で突き出し、手首をカッと垂直に起こして
    // 掌（てのひら）の広い面を相手の正面へ力強く押し付ける！

    // 打撃のイージング（発生急加速 -> インパクト持続 -> 素早く引き戻し）
    let strike = 0;
    if (progress < 0.35) {
      // 発生：手元から前方へ弾丸のように射出
      const p = progress / 0.35;
      strike = Math.sin(p * Math.PI * 0.5); // 0 -> 1
    } else if (progress < 0.6) {
      // インパクト：伸びきった位置で相手の胸板に押し込みタメ
      const p = (progress - 0.35) / 0.25;
      strike = 1.0 + Math.sin(p * Math.PI) * 0.04;
    } else {
      // 戻り：スッと構えへ引き戻す
      const p = (progress - 0.6) / 0.4;
      strike = 1.0 - Math.sin(p * Math.PI * 0.5); // 1 -> 0
    }

    // 体幹：重心を深く落とし、鋭い前傾（腰・マワシは正面固定）
    this.bodyGroup.position.y = 0.76;
    this.bodyGroup.rotation.x = 0.26;
    this.bodyGroup.rotation.y = 0; // 腰・マワシは絶対に振らない！

    // 上半身（肩甲骨のみ）の極微小な押し出し（0.04rad）
    const sideSign = armSide === 'right' ? 1 : -1;
    this.torsoMesh.rotation.y = -sideSign * 0.05 * strike;

    // 足腰の踏ん張り：突く側の足を前に踏み込み、反対の足で土俵を蹴る
    if (armSide === 'right') {
      this.rightLegGroup.rotation.x = 0.28;
      this.leftLegGroup.rotation.x = -0.26;
    } else {
      this.leftLegGroup.rotation.x = 0.28;
      this.rightLegGroup.rotation.x = -0.26;
    }

    // 突く側の腕（ストライクアーム）
    const strikeArm = armSide === 'right' ? this.rightArmGroup : this.leftArmGroup;
    const strikeHand = armSide === 'right' ? this.rightHandMesh : this.leftHandMesh;

    // 肩ごと前方へ突き出す！正中線（相手の胸の真ん中）へ向かって絞り込む！
    strikeArm.position.z = strike * 0.48;
    strikeArm.position.x = sideSign * (0.62 - strike * 0.3); // 0.62 -> 0.32
    strikeArm.position.y = 0.55 + strike * 0.08;

    // 腕をまっすぐ前方に伸ばす
    strikeArm.rotation.x = 1.57 * strike;
    strikeArm.rotation.y = -sideSign * 0.15 * strike;
    strikeArm.rotation.z = sideSign * 0.08 * strike;

    // 手首を垂直（90度）にカッと起こし、掌底（手のひら）を相手の正面に向ける！
    strikeHand.rotation.x = (Math.PI * 0.5) * strike;
    const handScale = 1.0 + strike * 0.2; // インパクト時に掌を一回り大きく強調！
    strikeHand.scale.set(handScale, handScale, handScale);

    // 引く側の腕（引き手・ガード構え）
    const recoilArm = armSide === 'right' ? this.leftArmGroup : this.rightArmGroup;
    const recoilHand = armSide === 'right' ? this.leftHandMesh : this.rightHandMesh;
    const oppSign = -sideSign;

    // 脇を締め、肘を後ろへ引き絞って次の突っ張りに備える
    recoilArm.position.z = -0.16 * strike;
    recoilArm.position.x = oppSign * (0.62 - strike * 0.12);
    recoilArm.rotation.x = 0.65 + strike * 0.25; // 肘を曲げて構える
    recoilArm.rotation.y = oppSign * 0.35 * strike;
    recoilArm.rotation.z = oppSign * 0.3;
    recoilHand.rotation.x = 0;
  }

  private animateBuchikamashiCharge(chargeProgress: number) {
    // ぶちかましタメ（超低空・腰を深く落として唸る）
    const tremble = (Math.random() - 0.5) * 0.05 * chargeProgress;
    this.bodyGroup.position.y = 0.65 - chargeProgress * 0.15 + tremble;
    this.bodyGroup.rotation.x = 0.55 + chargeProgress * 0.2; // 鋭い前傾
    this.bodyGroup.rotation.z = tremble;

    // 両腕を大きく後ろへ引き絞る
    this.leftArmGroup.rotation.x = -0.6 - chargeProgress * 0.4;
    this.rightArmGroup.rotation.x = -0.6 - chargeProgress * 0.4;
    this.leftLegGroup.rotation.x = -0.4;
    this.rightLegGroup.rotation.x = 0.4;
  }

  private animateBuchikamashiRush() {
    // ぶちかまし突進（頭突きロケット姿勢）
    this.bodyGroup.position.y = 0.6;
    this.bodyGroup.rotation.x = 0.95; // ほぼ水平に頭から突っ込む
    this.leftArmGroup.rotation.x = -0.8;
    this.rightArmGroup.rotation.x = -0.8;
  }

  private animateShiko(progress: number) {
    // 四股（片足を天高く突き上げ、一気に振り下ろす！）
    // progress: 0.0 ~ 0.5: 足上げ, 0.5 ~ 0.7: 振り下ろし, 0.7 ~ 1.0: 着地・踏ん張り
    if (progress < 0.5) {
      const lift = progress / 0.5;
      this.bodyGroup.position.y = 0.85 + lift * 0.15;
      this.bodyGroup.rotation.z = -lift * 0.35; // 体を傾ける
      // 右足を高く上げる
      this.rightLegGroup.rotation.z = -lift * 1.5;
      this.rightLegGroup.rotation.x = -lift * 0.4;
      // 手を広げてバランス
      this.rightArmGroup.rotation.z = -lift * 0.8;
      this.leftArmGroup.rotation.z = lift * 0.5;
    } else if (progress < 0.75) {
      // 振り下ろし〜着地ドスン！
      this.bodyGroup.position.y = 0.65; // 深く沈み込む
      this.bodyGroup.rotation.z = 0;
      this.rightLegGroup.rotation.z = 0;
      this.leftLegGroup.rotation.z = 0.4;
      this.rightLegGroup.rotation.z = -0.4;
      this.leftArmGroup.rotation.x = 0.6;
      this.rightArmGroup.rotation.x = 0.6;
    } else {
      // 構えへ復帰
      const recover = (progress - 0.75) / 0.25;
      this.bodyGroup.position.y = 0.65 + recover * 0.2;
    }
  }

  private animateHit(progress: number) {
    // 被弾（仰け反り）
    const recoil = Math.sin(progress * Math.PI);
    this.bodyGroup.rotation.x = -0.7 * recoil;
    this.bodyGroup.position.y = 0.9 + recoil * 0.2;
    this.leftArmGroup.rotation.x = -0.8 * recoil;
    this.rightArmGroup.rotation.x = -0.8 * recoil;
  }

  private animateGrabAttempt(progress: number) {
    // つかみかかり（低姿勢で両腕を広げて相手のマワシを掴みに行く）
    const reach = Math.sin(progress * Math.PI);
    this.bodyGroup.position.y = 0.74 - reach * 0.05;
    this.bodyGroup.rotation.x = 0.32 + reach * 0.12; // 鋭い前傾

    // 両腕を前に伸ばしながら左右に広げ、相手を包み込むように内側へ絞る
    this.leftArmGroup.position.set(-0.55 + reach * 0.15, 0.55, reach * 0.45);
    this.rightArmGroup.position.set(0.55 - reach * 0.15, 0.55, reach * 0.45);
    this.leftArmGroup.rotation.set(1.45 * reach, -0.35 * reach, 0.35 * reach);
    this.rightArmGroup.rotation.set(1.45 * reach, 0.35 * reach, -0.35 * reach);

    // 手の平を開いて前へ向ける
    this.leftHandMesh.rotation.x = (Math.PI * 0.4) * reach;
    this.rightHandMesh.rotation.x = (Math.PI * 0.4) * reach;
  }

  private animateGrabHolding() {
    // がっぷり四つ（相手のマワシをガッチリ両手で引きつけ、胸を突き合わせて組み合う）
    const grappleTremble = Math.sin(this.animTimer * 18.0) * 0.015;
    this.bodyGroup.position.y = 0.76 + grappleTremble;
    this.bodyGroup.rotation.x = 0.22;
    this.bodyGroup.rotation.z = grappleTremble * 0.8;

    // 両腕を深く差し込んでマワシを引きつける
    this.leftArmGroup.position.set(-0.38, 0.52, 0.48);
    this.rightArmGroup.position.set(0.38, 0.52, 0.48);
    this.leftArmGroup.rotation.set(1.25, 0.4, -0.45);
    this.rightArmGroup.rotation.set(1.25, -0.4, 0.45);

    // 両脚を踏ん張る
    this.leftLegGroup.rotation.x = 0.25;
    this.rightLegGroup.rotation.x = -0.25;
  }

  private animateThrow(progress: number) {
    // 上手投げ（豪快な大技！体を大きくひねって相手を腰に乗せ、頭上から地面へ叩きつける）
    // progress: 0.0 ~ 0.4 (抱え上げ・捻り), 0.4 ~ 0.7 (豪快な振り下ろし・叩きつけ), 0.7 ~ 1.0 (残心・フォロースルー)
    if (progress < 0.4) {
      const p = progress / 0.4;
      this.bodyGroup.position.y = 0.72 - p * 0.1; // 腰を深く沈める
      this.bodyGroup.rotation.y = -0.75 * p; // 体を左に大きく捻る
      this.bodyGroup.rotation.x = 0.25;
      // 右腕をグッと引き上げて相手を抱え込む
      this.rightArmGroup.position.set(0.4, 0.65, 0.4);
      this.rightArmGroup.rotation.set(1.6 + p * 0.4, -0.5, 0.4);
      this.leftArmGroup.rotation.set(0.8, 0.6, -0.5);
    } else if (progress < 0.7) {
      const p = (progress - 0.4) / 0.3;
      // 体を一気に右前方へ旋回させながら前屈！地面へ叩きつける！
      this.bodyGroup.position.y = 0.62 + p * 0.1;
      this.bodyGroup.rotation.y = -0.75 + p * 1.5; // -0.75 -> 0.75
      this.bodyGroup.rotation.x = 0.25 + p * 0.45; // 前屈
      // 右腕を天から地へ豪快に振り下ろす！
      this.rightArmGroup.position.set(0.2, 0.5, 0.5);
      this.rightArmGroup.rotation.set(2.0 + p * 0.5, 0.2, -0.3);
      this.leftArmGroup.rotation.set(0.5, -0.5, 0.3);
    } else {
      const p = (progress - 0.7) / 0.3;
      // 投げ切った残心
      this.bodyGroup.position.y = 0.72 + p * 0.15;
      this.bodyGroup.rotation.y = 0.75 * (1 - p);
      this.bodyGroup.rotation.x = 0.7 * (1 - p * 0.7);
    }
  }

  private animateGrabbed() {
    // 掴まれ拘束中（マワシを掴まれて体が少し浮き上がり、足がバタつく無防備リアクション）
    const struggle = Math.sin(this.animTimer * 16.0) * 0.08;
    this.bodyGroup.position.y = 0.96 + Math.abs(struggle) * 0.04;
    this.bodyGroup.rotation.x = -0.18 + struggle * 0.4;
    this.bodyGroup.rotation.z = struggle * 0.8;

    // 両腕が浮いてバランスを崩す
    this.leftArmGroup.rotation.set(0.6 + struggle, 0.2, 0.6);
    this.rightArmGroup.rotation.set(0.6 - struggle, -0.2, -0.6);

    // 足がもがく
    this.leftLegGroup.rotation.x = -0.3 + struggle * 1.2;
    this.rightLegGroup.rotation.x = 0.3 - struggle * 1.2;
  }
}
