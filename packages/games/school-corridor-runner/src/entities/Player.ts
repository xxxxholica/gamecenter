import * as THREE from 'three';
import { LANE_COORDINATES, LaneIndex } from '../types';

export class Player {
  public group: THREE.Group;
  public lane: LaneIndex = 1; // 0: 左 (-3), 1: 中央 (0), 2: 右 (3)
  public currentX: number = 0;
  public targetX: number = 0;

  // 垂直移動（ジャンプ & 重力）
  public posY: number = 0;
  public velY: number = 0;
  public isJumping: boolean = false;
  private readonly JUMP_FORCE = 13.5;
  private readonly GRAVITY = -34.0;

  // 状態フラグ
  public isSliding: boolean = false;
  public isInvincible: boolean = false;
  private invincibleTimer: number = 0;

  // アニメーション用パーツ
  private bodyGroup: THREE.Group;
  private headMesh: THREE.Mesh;
  private neckMesh: THREE.Mesh;
  private torsoMesh: THREE.Mesh;
  private leftArmGroup: THREE.Group;
  private rightArmGroup: THREE.Group;
  private leftLegGroup: THREE.Group;
  private rightLegGroup: THREE.Group;
  private backpackMesh: THREE.Mesh;
  private headbandRibbon1: THREE.Mesh;
  private headbandRibbon2: THREE.Mesh;
  private bagMascotGroup: THREE.Group;

  // アニメーションカウンタ
  public runCycle: number = 0;
  private bankAngle: number = 0;

  // 当たり判定ボックス
  private boundingBox: THREE.Box3 = new THREE.Box3();

  constructor() {
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);

    this.bodyGroup = new THREE.Group();
    this.group.add(this.bodyGroup);

    // マテリアル定義（後ろ姿で一目で人間・学生と認識できるカラーリング）
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdfba });   // 明るい健康的なベージュ肌色
    const uniformMat = new THREE.MeshLambertMaterial({ color: 0x141b4d }); // 深い紺色制服
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });   // 白いワイシャツ
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });    // 黒髪
    const buttonMat = new THREE.MeshLambertMaterial({ color: 0xffd700 });  // 金ボタン
    const shoeMat = new THREE.MeshLambertMaterial({ color: 0x3e2723 });    // 茶色ローファー革靴
    const headbandMat = new THREE.MeshLambertMaterial({ color: 0xd50000 });// 赤い必勝ハチマキ
    const sockMat = new THREE.MeshLambertMaterial({ color: 0xffffff });    // 白いスクールソックス
    const bagMainMat = new THREE.MeshLambertMaterial({ color: 0x1976d2 }); // スポーツブルー通学リュック
    const bagSubMat = new THREE.MeshLambertMaterial({ color: 0x0d47a1 });  // 濃紺リュック底
    const bagBeltMat = new THREE.MeshLambertMaterial({ color: 0x37474f }); // 肩紐ベルト
    const zipperMat = new THREE.MeshLambertMaterial({ color: 0xe0e0e0 });  // ファスナー銀色
    const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xffea00 }); // 蛍光黄反射テープ
    const mascotMat = new THREE.MeshLambertMaterial({ color: 0x00e676 });  // マスコットキーホルダー

    // 1. 胴体 (Torso)
    const torsoGeo = new THREE.BoxGeometry(0.85, 0.95, 0.5);
    this.torsoMesh = new THREE.Mesh(torsoGeo, uniformMat);
    this.torsoMesh.position.y = 1.15;
    this.torsoMesh.castShadow = true;
    this.bodyGroup.add(this.torsoMesh);

    // 制服の学ラン詰め襟（首の根元を支える濃紺スタンドカラー）
    const uniformCollarGeo = new THREE.BoxGeometry(0.50, 0.12, 0.46);
    const uniformCollar = new THREE.Mesh(uniformCollarGeo, uniformMat);
    uniformCollar.position.set(0, 0.49, 0);
    this.torsoMesh.add(uniformCollar);

    // 白いワイシャツ襟（詰め襟の内側から首元へ立ち上がる白い境界線）
    const shirtCollarGeo = new THREE.BoxGeometry(0.44, 0.16, 0.42);
    const shirtCollar = new THREE.Mesh(shirtCollarGeo, shirtMat);
    shirtCollar.position.set(0, 0.53, 0);
    this.torsoMesh.add(shirtCollar);

    // 制服の金ボタン（前面: -Z側）
    const btnGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.04, 8);
    btnGeo.rotateX(Math.PI / 2);
    const btn1 = new THREE.Mesh(btnGeo, buttonMat);
    btn1.position.set(0, 0.15, -0.26);
    this.torsoMesh.add(btn1);

    const btn2 = new THREE.Mesh(btnGeo, buttonMat);
    btn2.position.set(0, -0.15, -0.26);
    this.torsoMesh.add(btn2);

    // 背中側（+Z面）のスポーツ通学リュック
    const bagGeo = new THREE.BoxGeometry(0.66, 0.76, 0.32);
    this.backpackMesh = new THREE.Mesh(bagGeo, bagMainMat);
    this.backpackMesh.position.set(0, 0.02, 0.38);
    this.torsoMesh.add(this.backpackMesh);

    // リュック下部ポケット（ツートンカラー）
    const bagBottomGeo = new THREE.BoxGeometry(0.67, 0.32, 0.34);
    const bagBottom = new THREE.Mesh(bagBottomGeo, bagSubMat);
    bagBottom.position.set(0, -0.22, 0.01);
    this.backpackMesh.add(bagBottom);

    // ファスナーライン（銀色）
    const zipGeo = new THREE.BoxGeometry(0.6, 0.03, 0.03);
    const zipper = new THREE.Mesh(zipGeo, zipperMat);
    zipper.position.set(0, 0.16, 0.17);
    this.backpackMesh.add(zipper);

    // 上部持ち手ループ
    const handleGeo = new THREE.BoxGeometry(0.24, 0.08, 0.04);
    const handle = new THREE.Mesh(handleGeo, bagBeltMat);
    handle.position.set(0, 0.42, 0.05);
    this.backpackMesh.add(handle);

    // 2本の蛍光イエロー反射ストライプ
    const refGeo1 = new THREE.BoxGeometry(0.58, 0.05, 0.03);
    const ref1 = new THREE.Mesh(refGeo1, reflectorMat);
    ref1.position.set(0, 0.08, 0.17);
    this.backpackMesh.add(ref1);

    const refGeo2 = new THREE.BoxGeometry(0.58, 0.05, 0.03);
    const ref2 = new THREE.Mesh(refGeo2, reflectorMat);
    ref2.position.set(0, -0.18, 0.18);
    this.backpackMesh.add(ref2);

    // リュック側面に揺れるお守りマスコットキーホルダー
    this.bagMascotGroup = new THREE.Group();
    this.bagMascotGroup.position.set(0.38, 0.12, 0.2);
    const mascotString = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.02), bagBeltMat);
    mascotString.position.y = -0.06;
    this.bagMascotGroup.add(mascotString);
    const mascotDoll = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), mascotMat);
    mascotDoll.position.y = -0.16;
    this.bagMascotGroup.add(mascotDoll);
    this.backpackMesh.add(this.bagMascotGroup);

    // 肩紐ベルト
    const beltGeo = new THREE.BoxGeometry(0.1, 0.85, 0.04);
    const leftBelt = new THREE.Mesh(beltGeo, bagBeltMat);
    leftBelt.position.set(-0.24, 0.05, 0.26);
    this.torsoMesh.add(leftBelt);

    const rightBelt = new THREE.Mesh(beltGeo, bagBeltMat);
    rightBelt.position.set(0.24, 0.05, 0.26);
    this.torsoMesh.add(rightBelt);

    // 2. 首パーツ (Neck - 後頭部とうなじ・襟の間から肌色をしっかり露出)
    const neckGeo = new THREE.CylinderGeometry(0.18, 0.20, 0.28, 12);
    this.neckMesh = new THREE.Mesh(neckGeo, skinMat);
    this.neckMesh.position.set(0, 1.70, 0);
    this.neckMesh.castShadow = true;
    this.bodyGroup.add(this.neckMesh);

    // 3. 頭部 (Head)
    const headGeo = new THREE.BoxGeometry(0.68, 0.68, 0.68);
    this.headMesh = new THREE.Mesh(headGeo, skinMat);
    this.headMesh.position.y = 2.06;
    this.headMesh.castShadow = true;
    this.bodyGroup.add(this.headMesh);

    // 髪の毛（短髪・刈り上げショートカット: 後頭部の下半分を削って肌色のうなじを露出）
    // トップ〜サイドの上半分のみを覆うヘアブロック
    const hairGeo = new THREE.BoxGeometry(0.74, 0.38, 0.70);
    const hairMesh = new THREE.Mesh(hairGeo, hairMat);
    hairMesh.position.set(0, 0.18, -0.02); // やや前寄りに配置し後頭部下側を開ける
    this.headMesh.add(hairMesh);

    // 頭頂部のアホ毛（跳ねた毛束で学生らしいシルエット）
    const cowlickGeo = new THREE.BoxGeometry(0.08, 0.22, 0.1);
    const cowlick = new THREE.Mesh(cowlickGeo, hairMat);
    cowlick.position.set(0, 0.46, -0.05);
    cowlick.rotation.z = 0.25;
    cowlick.rotation.x = -0.3;
    this.headMesh.add(cowlick);

    // 赤い必勝ハチマキ（額から後頭部をぐるりと一周）
    const headbandBandGeo = new THREE.BoxGeometry(0.76, 0.13, 0.74);
    const headbandBand = new THREE.Mesh(headbandBandGeo, headbandMat);
    headbandBand.position.set(0, 0.16, 0.0);
    this.headMesh.add(headbandBand);

    // ハチマキの結び目（後頭部 +Z側中央）
    const knotGeo = new THREE.BoxGeometry(0.14, 0.14, 0.1);
    const knotMesh = new THREE.Mesh(knotGeo, headbandMat);
    knotMesh.position.set(0, 0.16, 0.38);
    this.headMesh.add(knotMesh);

    // 後ろになびく2本のリボン（風でヒラヒラと揺れる）
    const ribbonGeo1 = new THREE.BoxGeometry(0.09, 0.44, 0.02);
    ribbonGeo1.translate(0, -0.22, 0);
    this.headbandRibbon1 = new THREE.Mesh(ribbonGeo1, headbandMat);
    this.headbandRibbon1.position.set(-0.06, 0.16, 0.41);
    this.headbandRibbon1.rotation.x = 0.4;
    this.headbandRibbon1.rotation.z = 0.2;
    this.headMesh.add(this.headbandRibbon1);

    const ribbonGeo2 = new THREE.BoxGeometry(0.08, 0.38, 0.02);
    ribbonGeo2.translate(0, -0.19, 0);
    this.headbandRibbon2 = new THREE.Mesh(ribbonGeo2, headbandMat);
    this.headbandRibbon2.position.set(0.06, 0.16, 0.41);
    this.headbandRibbon2.rotation.x = 0.45;
    this.headbandRibbon2.rotation.z = -0.22;
    this.headMesh.add(this.headbandRibbon2);

    // 前髪 & 目（進行方向 -Z面）
    const bangsGeo = new THREE.BoxGeometry(0.7, 0.18, 0.15);
    const bangsMesh = new THREE.Mesh(bangsGeo, hairMat);
    bangsMesh.position.set(0, 0.18, -0.32);
    this.headMesh.add(bangsMesh);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeGeo = new THREE.BoxGeometry(0.08, 0.12, 0.04);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.16, 0, -0.35);
    this.headMesh.add(leftEye);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.16, 0, -0.35);
    this.headMesh.add(rightEye);

    // 4. 腕 (左右) - 袖口から白いワイシャツカフス ＆ 肌色の手が露出し、腕振りで見え隠れする
    const sleeveGeo = new THREE.BoxGeometry(0.24, 0.54, 0.24);
    sleeveGeo.translate(0, -0.27, 0);

    const cuffGeo = new THREE.BoxGeometry(0.22, 0.06, 0.22);
    const handGeo = new THREE.BoxGeometry(0.20, 0.20, 0.20);

    // 左腕
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.set(-0.55, 1.5, 0);
    const leftSleeve = new THREE.Mesh(sleeveGeo, uniformMat);
    this.leftArmGroup.add(leftSleeve);

    const leftCuff = new THREE.Mesh(cuffGeo, shirtMat);
    leftCuff.position.set(0, -0.55, 0);
    this.leftArmGroup.add(leftCuff);

    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.set(0, -0.67, 0);
    this.leftArmGroup.add(leftHand);
    this.bodyGroup.add(this.leftArmGroup);

    // 右腕
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.set(0.55, 1.5, 0);
    const rightSleeve = new THREE.Mesh(sleeveGeo, uniformMat);
    this.rightArmGroup.add(rightSleeve);

    const rightCuff = new THREE.Mesh(cuffGeo, shirtMat);
    rightCuff.position.set(0, -0.55, 0);
    this.rightArmGroup.add(rightCuff);

    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.set(0, -0.67, 0);
    this.rightArmGroup.add(rightHand);
    this.bodyGroup.add(this.rightArmGroup);

    // 5. 脚 (左右) - 白いスクールソックスで走る脚の動きを後ろから明瞭化
    const legGeo = new THREE.BoxGeometry(0.32, 0.62, 0.32);
    legGeo.translate(0, -0.31, 0);

    const sockGeo = new THREE.BoxGeometry(0.33, 0.18, 0.33);
    const shoeGeo = new THREE.BoxGeometry(0.34, 0.18, 0.46);

    // 左脚
    this.leftLegGroup = new THREE.Group();
    this.leftLegGroup.position.set(-0.25, 0.75, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, uniformMat);
    this.leftLegGroup.add(leftLegMesh);

    const leftSock = new THREE.Mesh(sockGeo, sockMat);
    leftSock.position.set(0, -0.66, 0);
    this.leftLegGroup.add(leftSock);

    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.78, -0.06);
    this.leftLegGroup.add(leftShoe);
    this.bodyGroup.add(this.leftLegGroup);

    // 右脚
    this.rightLegGroup = new THREE.Group();
    this.rightLegGroup.position.set(0.25, 0.75, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, uniformMat);
    this.rightLegGroup.add(rightLegMesh);

    const rightSock = new THREE.Mesh(sockGeo, sockMat);
    rightSock.position.set(0, -0.66, 0);
    this.rightLegGroup.add(rightSock);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.78, -0.06);
    this.rightLegGroup.add(rightShoe);
    this.bodyGroup.add(this.rightLegGroup);

    this.setLane(1);
    this.currentX = 0;
    this.bodyGroup.visible = false;
  }

  public setLane(laneIndex: LaneIndex): void {
    this.lane = laneIndex;
    this.targetX = LANE_COORDINATES[this.lane];
  }

  public moveLeft(): boolean {
    if (this.lane > 0) {
      this.setLane((this.lane - 1) as LaneIndex);
      return true;
    }
    return false;
  }

  public moveRight(): boolean {
    if (this.lane < 2) {
      this.setLane((this.lane + 1) as LaneIndex);
      return true;
    }
    return false;
  }

  /**
   * ジャンプ発動（着地中のみ）
   */
  public jump(): boolean {
    if (!this.isJumping && this.posY <= 0.01) {
      this.isJumping = true;
      this.velY = this.JUMP_FORCE;
      this.isSliding = false; // スライディング解除
      return true;
    }
    return false;
  }

  public triggerInvincible(duration: number = 1.0): void {
    this.isInvincible = true;
    this.invincibleTimer = duration;
  }

  public getInvincibleRemaining(): number {
    return this.invincibleTimer;
  }

  /**
   * 毎フレームの更新処理
   */
  public update(dt: number, speed: number, slideInput: boolean): void {
    // 1. レーン移動のスムーズ補間 (Lerp) - 空中でも可能！
    const diff = this.targetX - this.currentX;
    this.currentX += diff * Math.min(1.0, dt * 16);
    this.group.position.x = this.currentX;

    // バンク角（移動時の傾き）
    const targetBank = -diff * 0.14;
    this.bankAngle += (targetBank - this.bankAngle) * Math.min(1.0, dt * 14);
    this.bodyGroup.rotation.z = this.bankAngle;

    // 2. ジャンプ物理シミュレーション
    if (this.isJumping) {
      this.velY += this.GRAVITY * dt;
      this.posY += this.velY * dt;

      if (this.posY <= 0) {
        this.posY = 0;
        this.velY = 0;
        this.isJumping = false;
      }
    } else {
      this.posY = 0;
    }
    this.group.position.y = this.posY;

    // 3. スライディング状態判定（接地中のみ可能）
    this.isSliding = slideInput && !this.isJumping;

    // 4. 無敵タイマー
    if (this.isInvincible) {
      this.invincibleTimer -= dt;
      if (this.invincibleTimer <= 0) {
        this.isInvincible = false;
      }
    }
    // 一人称視点のため三人称全身モデルは非表示を維持
    this.bodyGroup.visible = false;

    // 5. ポーズ & アニメーション更新
    if (this.isJumping) {
      // ジャンプポーズ: 脚を曲げて引き上げ、腕をやや広げる
      this.bodyGroup.position.y = 0;
      this.bodyGroup.rotation.x = -0.15; // やや前傾
      this.torsoMesh.position.y = 1.15;
      this.neckMesh.position.y = 1.70;
      this.headMesh.position.y = 2.06;
      this.leftLegGroup.rotation.x = -0.6; // 膝を曲げる
      this.rightLegGroup.rotation.x = -0.8;
      this.leftArmGroup.rotation.x = 0.5;
      this.rightArmGroup.rotation.x = 0.5;
      this.headMesh.rotation.x = 0;
    } else if (this.isSliding) {
      // スライディング姿勢: 体を前方に低く倒し、足を前方に突き出す
      this.bodyGroup.position.y = -0.55;
      this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, -Math.PI / 3, dt * 18);
      this.torsoMesh.position.y = 1.15;
      this.neckMesh.position.y = 1.70;
      this.headMesh.position.y = 2.06;
      this.leftLegGroup.rotation.x = -Math.PI / 3;
      this.rightLegGroup.rotation.x = -Math.PI / 3;
      this.leftArmGroup.rotation.x = Math.PI / 4;
      this.rightArmGroup.rotation.x = Math.PI / 4;
      this.headMesh.rotation.x = Math.PI / 4;
    } else {
      // 通常走行アニメーション
      this.bodyGroup.position.y = 0;
      this.bodyGroup.rotation.x = THREE.MathUtils.lerp(this.bodyGroup.rotation.x, 0.12, dt * 15);

      const animSpeed = Math.max(12, speed * 0.45);
      this.runCycle += dt * animSpeed;

      const legSwing = Math.sin(this.runCycle) * 0.85;
      this.leftLegGroup.rotation.x = legSwing;
      this.rightLegGroup.rotation.x = -legSwing;

      // 腕のスイング
      this.leftArmGroup.rotation.x = -legSwing * 0.9;
      this.rightArmGroup.rotation.x = legSwing * 0.9;

      // 胴体・首・頭部の上下バウンド
      const bounce = Math.abs(Math.sin(this.runCycle * 2)) * 0.12;
      this.torsoMesh.position.y = 1.15 + bounce;
      this.neckMesh.position.y = 1.70 + bounce;
      this.headMesh.position.y = 2.06 + bounce;
    }

    // 6. ハチマキの垂れ布の風圧アニメーション（高速ほど後ろへピンとなびく）
    const windForce = Math.min(1.2, speed / 45);
    const flutter1 = Math.sin(this.runCycle * 1.8) * 0.15;
    const flutter2 = Math.cos(this.runCycle * 1.8 + 0.8) * 0.15;
    this.headbandRibbon1.rotation.x = 0.35 + windForce * 0.65 + flutter1;
    this.headbandRibbon1.rotation.z = 0.15 + Math.sin(this.runCycle * 1.2) * 0.1;
    this.headbandRibbon2.rotation.x = 0.4 + windForce * 0.7 + flutter2;
    this.headbandRibbon2.rotation.z = -0.18 + Math.cos(this.runCycle * 1.2) * 0.1;

    // リュック側面のキーホルダーマスコットの揺れ
    this.bagMascotGroup.rotation.z = Math.sin(this.runCycle * 1.5) * 0.25;
    this.bagMascotGroup.rotation.x = Math.cos(this.runCycle * 1.5) * 0.2 + windForce * 0.35;

    // 当たり判定ボックスの計算
    this.updateBoundingBox();
  }

  private updateBoundingBox(): void {
    const px = this.group.position.x;
    const py = this.group.position.y;
    const pz = this.group.position.z;

    if (this.isSliding) {
      // スライディング時: 地面付近の低いボックス (高さ0.85m)
      this.boundingBox.min.set(px - 0.5, py, pz - 0.6);
      this.boundingBox.max.set(px + 0.5, py + 0.85, pz + 0.6);
    } else {
      // 直立・ジャンプ時: py から py + 2.2m
      this.boundingBox.min.set(px - 0.55, py, pz - 0.45);
      this.boundingBox.max.set(px + 0.55, py + 2.2, pz + 0.45);
    }
  }

  public getBoundingBox(): THREE.Box3 {
    return this.boundingBox;
  }

  public reset(): void {
    this.lane = 1;
    this.currentX = 0;
    this.targetX = 0;
    this.posY = 0;
    this.velY = 0;
    this.isJumping = false;
    this.group.position.set(0, 0, 0);
    this.isSliding = false;
    this.isInvincible = false;
    this.invincibleTimer = 0;
    this.bodyGroup.visible = false;
    this.bankAngle = 0;
    this.runCycle = 0;
    this.torsoMesh.position.y = 1.15;
    this.neckMesh.position.y = 1.70;
    this.headMesh.position.y = 2.06;
  }

  public setVisible(visible: boolean): void {
    this.bodyGroup.visible = visible;
  }
}
