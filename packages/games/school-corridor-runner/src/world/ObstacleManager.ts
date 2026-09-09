import * as THREE from 'three';
import { LANE_COORDINATES, LaneIndex, ObstacleType } from '../types';
import {
  createSignboardTexture,
  createTeacherFaceTexture,
  createVaultingBoxTexture,
  createLockerDoorTexture,
  createBannerTexture,
  createCardboardBarricadeTexture,
  createWarningArrowTexture,
  createBasketBallTexture,
  createConeStripeTexture,
} from '../graphics/Textures';
import { Coin } from '../entities/Coin';

export interface Obstacle {
  group: THREE.Group;
  type: ObstacleType;
  lane: LaneIndex;
  z: number;
  isDestroyed: boolean;
  hasDodged: boolean;
  boundingBox: THREE.Box3;
  // 先生の横移動パトロール用
  moveDir?: number;       // 1: 右へ, -1: 左へ
  moveSpeed?: number;     // 横移動速度 (m/s)
  leftLeg?: THREE.Mesh;   // 歩行アニメ用脚
  rightLeg?: THREE.Mesh;
  crossArm?: THREE.Mesh;  // 攻撃アニメ用
  animTimer?: number;
  attackTimer?: number;   // 攻撃クールダウン

  // 動的ギミック用
  stateTimer?: number;         // 予兆・アクション進行用タイマー
  actionState?: number;        // 0: 予兆待機, 1: アクション発動中, 2: 完了
  warningMesh?: THREE.Mesh;    // 赤色床矢印などの予告表示
  pivotGroup?: THREE.Group;    // 倒壊ロッカーなどの回転ピボット
  subMesh?: THREE.Mesh;        // バウンドボール本体、パトランプ等
  shadowMesh?: THREE.Mesh;     // ボール等の床影
  ballVelY?: number;           // ボールの垂直速度
  ballY?: number;              // ボールの現在Y座標
  fallAngle?: number;          // 倒壊ロッカーの倒れ込み角度
  isFallen?: boolean;          // ロッカーが完全に倒れたか
}

export class ObstacleManager {
  private scene: THREE.Scene;
  private obstacles: Obstacle[] = [];
  private coins: Coin[] = [];
  private nextSpawnZ: number = -30;
  private animClock: number = 0;
  private lastSlalomOpenLane: LaneIndex = 1; // スラローム生成用

  // コールバック
  public onTeacherAttack?: (pos: THREE.Vector3) => void;
  public onPlaySound?: (sound: 'cartRush' | 'lockerFall' | 'ballBounce' | 'polisherHum') => void;

  // 強制ギミックエリアの出現カウンター
  private normalSpawnCounter: number = 0;
  private readonly GIMMICK_CYCLE_COUNT = 3;
  private lastGimmickType: ObstacleType = ObstacleType.GIMMICK_JUMP;

  // キャッシュ用テクスチャ
  private signTexture: THREE.CanvasTexture;
  private teacherFaceTexture: THREE.CanvasTexture;
  private lockerTexture: THREE.CanvasTexture;
  private vaultingTextures: THREE.CanvasTexture[] = [];
  private bannerTexture: THREE.CanvasTexture;
  private barricadeTexture: THREE.CanvasTexture;
  private warningArrowTexture: THREE.CanvasTexture;
  private basketBallTexture: THREE.CanvasTexture;
  private coneStripeTexture: THREE.CanvasTexture;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.signTexture = createSignboardTexture();
    this.teacherFaceTexture = createTeacherFaceTexture();
    this.lockerTexture = createLockerDoorTexture();
    this.bannerTexture = createBannerTexture();
    this.barricadeTexture = createCardboardBarricadeTexture();
    this.warningArrowTexture = createWarningArrowTexture();
    this.basketBallTexture = createBasketBallTexture();
    this.coneStripeTexture = createConeStripeTexture();

    for (let i = 1; i <= 6; i++) {
      this.vaultingTextures.push(createVaultingBoxTexture(i));
    }
  }

  /**
   * 小型: 積み上げ机・椅子
   */
  private createDeskChairObstacle(): THREE.Group {
    const group = new THREE.Group();

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xb07d4b, roughness: 0.6 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.4, metalness: 0.5 });

    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.1), woodMat);
    deskTop.position.y = 1.0;
    group.add(deskTop);

    const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.0, 6);
    const legPositions = [
      [-0.7, 0.5, -0.45],
      [0.7, 0.5, -0.45],
      [-0.7, 0.5, 0.45],
      [0.7, 0.5, 0.45],
    ];
    for (const pos of legPositions) {
      const leg = new THREE.Mesh(legGeo, steelMat);
      leg.position.set(pos[0], pos[1], pos[2]);
      group.add(leg);
    }

    const chairSeat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.8), woodMat);
    chairSeat.position.set(0.1, 1.4, 0);
    chairSeat.rotation.z = 0.25;
    group.add(chairSeat);

    const chairBack = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.4, 0.08), woodMat);
    chairBack.position.set(0.2, 1.7, -0.35);
    chairBack.rotation.z = 0.25;
    group.add(chairBack);

    return group;
  }

  /**
   * 大型: 巨大ロッカーまたは跳び箱
   */
  private createLockerVaultObstacle(): THREE.Group {
    const group = new THREE.Group();
    const isVault = Math.random() > 0.5;

    if (isVault) {
      const totalLevels = 6;
      const baseWidth = 1.8;
      const baseDepth = 1.4;
      const levelHeight = 0.32;

      for (let i = 0; i < totalLevels; i++) {
        const factor = 1 - (i * 0.08);
        const w = baseWidth * factor;
        const d = baseDepth * factor;
        const tex = this.vaultingTextures[i % this.vaultingTextures.length];
        const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, levelHeight - 0.02, d), mat);
        mesh.position.y = i * levelHeight + levelHeight / 2;
        group.add(mesh);
      }

      const cushionMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.9 });
      const topCushion = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.9), cushionMat);
      topCushion.position.y = totalLevels * levelHeight + 0.1;
      group.add(topCushion);
    } else {
      const lockerBodyMat = new THREE.MeshStandardMaterial({ color: 0x546e7a, roughness: 0.4, metalness: 0.4 });
      const doorMat = new THREE.MeshStandardMaterial({ map: this.lockerTexture, roughness: 0.5, metalness: 0.3 });

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 1.0), lockerBodyMat);
      body.position.y = 1.25;
      group.add(body);

      const door1 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.3), doorMat);
      door1.position.set(-0.43, 1.25, 0.51);
      group.add(door1);

      const door2 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.3), doorMat);
      door2.position.set(0.43, 1.25, 0.51);
      group.add(door2);
    }

    return group;
  }

  /**
   * 破壊不可: 生活指導の先生（横に移動してパトロール）
   */
  private createTeacherObstacle(): { group: THREE.Group; leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; crossArm: THREE.Mesh } {
    const group = new THREE.Group();

    const suitMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const tieMat = new THREE.MeshLambertMaterial({ color: 0xb71c1c });
    const faceMat = new THREE.MeshLambertMaterial({ map: this.teacherFaceTexture });
    const hairMat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const armBandMat = new THREE.MeshLambertMaterial({ color: 0xffeb3b });
    const shinaiMat = new THREE.MeshLambertMaterial({ color: 0xd7ccc8 });

    // 脚（股関節をピボットにして前後に歩行スイング可能にする）
    const legGeo = new THREE.BoxGeometry(0.35, 0.95, 0.35);
    legGeo.translate(0, -0.45, 0); // 上部がピボット

    const leftLeg = new THREE.Mesh(legGeo, suitMat);
    leftLeg.position.set(-0.28, 0.95, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, suitMat);
    rightLeg.position.set(0.28, 0.95, 0);
    group.add(rightLeg);

    // 胴体
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.1, 0.6), suitMat);
    body.position.y = 1.55;
    group.add(body);

    const shirt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.05), shirtMat);
    shirt.position.set(0, 1.85, 0.31);
    group.add(shirt);

    const tie = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.55, 0.06), tieMat);
    tie.position.set(0, 1.65, 0.32);
    group.add(tie);

    // 頭部
    const headMatArray = [suitMat, suitMat, hairMat, suitMat, faceMat, hairMat];
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.75, 0.75), headMatArray);
    head.position.y = 2.45;
    group.add(head);

    // 腕組み（攻撃時に動かす）
    const crossArm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.28, 0.35), suitMat);
    crossArm.position.set(0, 1.55, 0.38);
    group.add(crossArm);

    // 腕章
    const armband = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.2, 0.28), armBandMat);
    armband.position.set(-0.55, 1.75, 0);
    group.add(armband);

    // 竹刀
    const shinai = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 1.4, 6), shinaiMat);
    shinai.rotation.x = Math.PI / 4;
    shinai.position.set(0.55, 1.3, -0.1);
    group.add(shinai);

    return { group, leftLeg, rightLeg, crossArm };
  }

  /**
   * 上部: 吊り下げ看板「廊下走行禁止」
   * 走っている視界（目線1.55m）の正面に堂々と塞がる高さ（中心1.70m, 下端1.20m, 上端2.20m）に配置
   */
  private createHangingSignObstacle(): THREE.Group {
    const group = new THREE.Group();

    // 天井(7.5m)から看板上端(2.2m)まで伸びる左右の鉄チェーン
    const chainMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const chainLength = 5.3;
    const chainGeo = new THREE.CylinderGeometry(0.025, 0.025, chainLength, 6);

    const chainY = 2.2 + chainLength / 2; // 4.85m
    const chain1 = new THREE.Mesh(chainGeo, chainMat);
    chain1.position.set(-1.0, chainY, 0);
    group.add(chain1);

    const chain2 = new THREE.Mesh(chainGeo, chainMat);
    chain2.position.set(1.0, chainY, 0);
    group.add(chain2);

    const signMat = new THREE.MeshStandardMaterial({
      map: this.signTexture,
      roughness: 0.4,
    });
    const signEdgeMat = new THREE.MeshStandardMaterial({ color: 0xffd600 });
    const signMats = [signEdgeMat, signEdgeMat, signEdgeMat, signEdgeMat, signMat, signMat];

    // 幅2.8m, 高さ1.0mの看板。中心Y: 1.70m（下端1.20m、上端2.20m）
    const signBoard = new THREE.Mesh(new THREE.BoxGeometry(2.8, 1.0, 0.12), signMats);
    signBoard.position.set(0, 1.70, 0);
    signBoard.castShadow = true;
    group.add(signBoard);

    return group;
  }

  /**
   * 【3択強制ギミック 1】ジャンプ強制エリア
   */
  private createJumpGimmickArea(): THREE.Group {
    const group = new THREE.Group();

    const lockerMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.5, metalness: 0.3 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0xd7a15c, roughness: 0.6 });
    const padMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.8 });

    const barGeo = new THREE.BoxGeometry(9.6, 0.9, 1.2);
    const barMesh = new THREE.Mesh(barGeo, lockerMat);
    barMesh.position.set(0, 0.45, 0);
    group.add(barMesh);

    const vault1 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 1.3), woodMat);
    vault1.position.set(-3, 0.47, 0);
    group.add(vault1);

    const vault2 = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.95, 1.3), woodMat);
    vault2.position.set(3, 0.47, 0);
    group.add(vault2);

    const pad1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.2), padMat);
    pad1.position.set(-3, 0.95, 0);
    group.add(pad1);

    const pad2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 1.2), padMat);
    pad2.position.set(3, 0.95, 0);
    group.add(pad2);

    const stripeGeo = new THREE.BoxGeometry(9.8, 0.12, 0.15);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffd600 });
    const stripeMesh = new THREE.Mesh(stripeGeo, stripeMat);
    stripeMesh.position.set(0, 0.92, 0.6);
    group.add(stripeMesh);

    return group;
  }

  /**
   * 【3択強制ギミック 2】しゃがみ（スライディング）強制エリア
   */
  private createSlideGimmickArea(): THREE.Group {
    const group = new THREE.Group();

    const bannerMat = new THREE.MeshStandardMaterial({
      map: this.bannerTexture,
      roughness: 0.5,
    });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6 });

    const bannerMats = [frameMat, frameMat, frameMat, frameMat, bannerMat, bannerMat];
    // 下端 Y = 1.15m, 上端 Y = 5.75m
    const banner = new THREE.Mesh(new THREE.BoxGeometry(9.8, 4.6, 0.15), bannerMats);
    banner.position.set(0, 3.45, 0);
    group.add(banner);

    // 天井(7.5m)まで繋ぐスチールパイプフレーム4本
    const pipeGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 8);
    const pipeMat = new THREE.MeshLambertMaterial({ color: 0x666666 });
    const pipeX = [-4.0, -1.3, 1.3, 4.0];
    for (const px of pipeX) {
      const pipe = new THREE.Mesh(pipeGeo, pipeMat);
      pipe.position.set(px, 6.6, 0);
      group.add(pipe);
    }

    return group;
  }

  /**
   * 【3択強制ギミック 3】破壊強制エリア
   */
  private createBombGimmickArea(): THREE.Group {
    const group = new THREE.Group();

    const boxMat = new THREE.MeshStandardMaterial({
      map: this.barricadeTexture,
      roughness: 0.7,
    });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8d6e4b, roughness: 0.8 });

    const boxW = 1.9;
    const boxH = 1.35;
    const boxD = 1.4;

    // 4段 × 5列 = 20個の段ボール箱 (全高 5.4m)
    for (let row = 0; row < 4; row++) {
      for (let col = -2; col <= 2; col++) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(boxW - 0.05, boxH - 0.05, boxD), boxMat);
        box.position.set(col * boxW, row * boxH + boxH / 2, (Math.random() - 0.5) * 0.2);
        group.add(box);
      }
    }

    const beamGeo = new THREE.BoxGeometry(9.8, 0.2, 0.2);
    const beam = new THREE.Mesh(beamGeo, woodMat);
    beam.position.set(0, 2.7, 0.8);
    group.add(beam);

    return group;
  }

  /**
   * 動的ギミック 1: 暴走配膳台（ステンレス給食カート・床の赤矢印点滅予告付き）
   */
  private createChargingCartObstacle(): { group: THREE.Group; warningMesh: THREE.Mesh } {
    const group = new THREE.Group();

    // 1. 赤い床警告矢印ライン（手前へ向かって伸びる）
    const warningGeo = new THREE.PlaneGeometry(2.4, 26);
    warningGeo.rotateX(-Math.PI / 2);
    const warningMat = new THREE.MeshBasicMaterial({
      map: this.warningArrowTexture,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    });
    const warningMesh = new THREE.Mesh(warningGeo, warningMat);
    warningMesh.position.set(0, 0.03, 13);
    group.add(warningMesh);

    // 2. カート本体
    const cartGroup = new THREE.Group();
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8dc,
      metalness: 0.85,
      roughness: 0.25,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x37474f,
      metalness: 0.9,
      roughness: 0.3,
    });

    // カート棚板（上下2段）
    const shelfGeo = new THREE.BoxGeometry(1.5, 0.08, 1.2);
    const lowerShelf = new THREE.Mesh(shelfGeo, steelMat);
    lowerShelf.position.y = 0.35;
    cartGroup.add(lowerShelf);

    const upperShelf = new THREE.Mesh(shelfGeo, steelMat);
    upperShelf.position.y = 1.15;
    cartGroup.add(upperShelf);

    // 四隅のステンレス支柱パイプ
    const poleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.1, 8);
    const polePositions = [
      [-0.7, 0.75, -0.55],
      [0.7, 0.75, -0.55],
      [-0.7, 0.75, 0.55],
      [0.7, 0.75, 0.55],
    ];
    for (const pos of polePositions) {
      const pole = new THREE.Mesh(poleGeo, steelMat);
      pole.position.set(pos[0], pos[1], pos[2]);
      cartGroup.add(pole);
    }

    // 手押しハンドル（手前上部）
    const handleGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.4, 8);
    handleGeo.rotateZ(Math.PI / 2);
    const handle = new THREE.Mesh(handleGeo, darkSteelMat);
    handle.position.set(0, 1.28, 0.62);
    cartGroup.add(handle);

    // 車輪4つ
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const wheelPositions = [
      [-0.68, 0.12, -0.45],
      [0.68, 0.12, -0.45],
      [-0.68, 0.12, 0.45],
      [0.68, 0.12, 0.45],
    ];
    for (const pos of wheelPositions) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos[0], pos[1], pos[2]);
      cartGroup.add(wheel);
    }

    // 上段の積載物: 大型アルミ給食缶
    const potGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.5, 16);
    const alumMat = new THREE.MeshStandardMaterial({ color: 0xb0bec5, metalness: 0.7, roughness: 0.35 });
    const pot = new THREE.Mesh(potGeo, alumMat);
    pot.position.set(-0.32, 1.45, -0.1);
    cartGroup.add(pot);

    const lidGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16);
    const lid = new THREE.Mesh(lidGeo, alumMat);
    lid.position.set(-0.32, 1.72, -0.1);
    cartGroup.add(lid);

    // 四角いパン箱
    const boxGeo = new THREE.BoxGeometry(0.55, 0.32, 0.85);
    const breadBox = new THREE.Mesh(boxGeo, alumMat);
    breadBox.position.set(0.35, 1.35, 0);
    cartGroup.add(breadBox);

    group.add(cartGroup);

    return { group, warningMesh };
  }

  /**
   * 動的ギミック 2: 倒壊ロッカー（接近で手前に倒れるピボット付き）
   */
  private createFallingLockerObstacle(): { group: THREE.Group; pivotGroup: THREE.Group } {
    const group = new THREE.Group();

    // 手前の底面（Z = +0.5, Y = 0）を軸にして手前側へ倒れるピボット
    const pivotGroup = new THREE.Group();
    pivotGroup.position.set(0, 0, 0.5);

    // ロッカー本体
    const lockerBodyMat = new THREE.MeshStandardMaterial({ color: 0x455a64, roughness: 0.4, metalness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.5, 1.0), lockerBodyMat);
    body.position.set(0, 1.25, -0.5);
    pivotGroup.add(body);

    // ドアパネル
    const doorMat = new THREE.MeshStandardMaterial({ map: this.lockerTexture, roughness: 0.5, metalness: 0.3 });
    const door1 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.3), doorMat);
    door1.position.set(-0.43, 1.25, 0.01);
    pivotGroup.add(door1);

    const door2 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 2.3), doorMat);
    door2.position.set(0.43, 1.25, 0.01);
    pivotGroup.add(door2);

    group.add(pivotGroup);

    return { group, pivotGroup };
  }

  /**
   * 動的ギミック 3: バウンドボール（横断跳躍バスケットボール）
   */
  private createBouncingBallObstacle(): { group: THREE.Group; ballMesh: THREE.Mesh; shadowMesh: THREE.Mesh } {
    const group = new THREE.Group();

    // 床の影
    const shadowGeo = new THREE.PlaneGeometry(0.9, 0.9);
    shadowGeo.rotateX(-Math.PI / 2);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.position.y = 0.02;
    group.add(shadowMesh);

    // ボール本体
    const ballGeo = new THREE.SphereGeometry(0.45, 18, 18);
    const ballMat = new THREE.MeshStandardMaterial({
      map: this.basketBallTexture,
      roughness: 0.55,
      metalness: 0.1,
    });
    const ballMesh = new THREE.Mesh(ballGeo, ballMat);
    ballMesh.position.y = 0.45;
    group.add(ballMesh);

    return { group, ballMesh, shadowMesh };
  }

  /**
   * 動的ギミック 4: 清掃用ポリッシャー（左右往復・黄色パトランプ付き）
   */
  private createSweepingPolisherObstacle(): { group: THREE.Group; warningLamp: THREE.Mesh } {
    const group = new THREE.Group();

    // 底面円盤ブラシ
    const brushGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.22, 20);
    const brushMat = new THREE.MeshStandardMaterial({
      color: 0x263238,
      roughness: 0.9,
    });
    const brushMesh = new THREE.Mesh(brushGeo, brushMat);
    brushMesh.position.y = 0.11;
    group.add(brushMesh);

    // モーターハウジング
    const motorGeo = new THREE.CylinderGeometry(0.45, 0.55, 0.5, 16);
    const motorMat = new THREE.MeshStandardMaterial({
      color: 0xfbc02d,
      metalness: 0.5,
      roughness: 0.35,
    });
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.y = 0.47;
    group.add(motor);

    // 操作シャフト & ハンドル
    const shaftGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.5, 8);
    shaftGeo.rotateX(Math.PI / 6);
    const shaftMat = new THREE.MeshStandardMaterial({ color: 0x90a4ae, metalness: 0.8, roughness: 0.3 });
    const shaft = new THREE.Mesh(shaftGeo, shaftMat);
    shaft.position.set(0, 1.0, 0.35);
    group.add(shaft);

    const handleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8);
    handleGeo.rotateZ(Math.PI / 2);
    const handle = new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color: 0x212121 }));
    handle.position.set(0, 1.62, 0.72);
    group.add(handle);

    // 黄色パトランプ
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x333333 }));
    lampBase.position.y = 0.76;
    group.add(lampBase);

    const lampGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12);
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffeb3b });
    const warningLamp = new THREE.Mesh(lampGeo, lampMat);
    warningLamp.position.y = 0.9;
    group.add(warningLamp);

    return { group, warningLamp };
  }

  /**
   * 破壊不可・迂回必須: 立入禁止コーン＆水拭き床
   */
  private createWetFloorConeObstacle(): THREE.Group {
    const group = new THREE.Group();

    // 1. 水拭き濡れ床（反射する水たまり）
    const wetFloorGeo = new THREE.PlaneGeometry(2.6, 2.4);
    const wetFloorMat = new THREE.MeshStandardMaterial({
      color: 0x81d4fa,
      metalness: 0.85,
      roughness: 0.08,
      transparent: true,
      opacity: 0.55,
    });
    const wetFloor = new THREE.Mesh(wetFloorGeo, wetFloorMat);
    wetFloor.rotation.x = -Math.PI / 2;
    wetFloor.position.y = 0.02;
    group.add(wetFloor);

    // 2. 三角コーン（左右2本）
    const coneGeo = new THREE.ConeGeometry(0.32, 1.05, 16);
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0xff3d00,
      roughness: 0.35,
      metalness: 0.1,
    });
    const baseGeo = new THREE.BoxGeometry(0.68, 0.08, 0.68);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x212121, roughness: 0.8 });

    const tapeGeo = new THREE.CylinderGeometry(0.19, 0.23, 0.18, 16);
    const tapeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    for (const xOff of [-0.75, 0.75]) {
      const coneUnit = new THREE.Group();

      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.y = 0.04;
      base.castShadow = true;
      coneUnit.add(base);

      const cone = new THREE.Mesh(coneGeo, coneMat);
      cone.position.y = 0.56;
      cone.castShadow = true;
      coneUnit.add(cone);

      const tape = new THREE.Mesh(tapeGeo, tapeMat);
      tape.position.y = 0.52;
      coneUnit.add(tape);

      coneUnit.position.x = xOff;
      group.add(coneUnit);
    }

    // 3. 黄黒警戒コーンバー
    const barGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.7, 12);
    const barMat = new THREE.MeshStandardMaterial({
      map: this.coneStripeTexture,
      roughness: 0.4,
    });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.78, 0);
    bar.castShadow = true;
    group.add(bar);

    // 4. 立入禁止ミニプレート
    const plateGeo = new THREE.BoxGeometry(0.75, 0.45, 0.04);
    const plateMat = new THREE.MeshStandardMaterial({
      map: this.coneStripeTexture,
      roughness: 0.4,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(0, 0.68, 0.04);
    plate.castShadow = true;
    group.add(plate);

    return group;
  }

  /**
   * カウントダウン前の「追われる」導入演出専用に、生活指導の先生インスタンスを1体生成する。
   * 通常の障害物トラッキング（obstacles配列）には登録されないため、
   * 呼び出し側が自前でシーンへの追加・アニメーション・削除を管理する。
   */
  public createChaseTeacherPreview(): { group: THREE.Group; leftLeg: THREE.Mesh; rightLeg: THREE.Mesh; crossArm: THREE.Mesh } {
    return this.createTeacherObstacle();
  }

  /**
   * ゴールドコインを連続ライン状に配置
   */
  public spawnCoinLine(lane: LaneIndex, startZ: number, count: number = 4, spacing: number = 2.8, y: number = 1.0): void {
    const x = LANE_COORDINATES[lane];
    for (let i = 0; i < count; i++) {
      const z = startZ - i * spacing;
      const coin = new Coin(x, y, z, lane);
      this.coins.push(coin);
      this.scene.add(coin.mesh);
    }
  }

  public getCoins(): Coin[] {
    return this.coins;
  }

  public removeCoin(coin: Coin): void {
    coin.isCollected = true;
  }


  /**
   * 毎フレームの障害物更新（先生の横移動 ＆ スポーン）
   */
  public update(playerZ: number, forwardSpeed: number, dt: number): void {
    // 1. 生活指導の先生の横移動パトロール更新（机・ロッカー貫通防止 ＆ 定期攻撃）
    for (const obs of this.obstacles) {
      if (obs.isDestroyed) continue;
      if (obs.type === ObstacleType.TEACHER && obs.moveDir !== undefined && obs.moveSpeed !== undefined) {
        const nextX = obs.group.position.x + obs.moveDir * obs.moveSpeed * dt;

        // 【机・ロッカー貫通防止】同じZ付近にある障害物とのコリジョンチェック
        let isBlocked = false;
        for (const other of this.obstacles) {
          if (other === obs || other.isDestroyed) continue;
          if (other.type === ObstacleType.DESK_CHAIR || other.type === ObstacleType.LOCKER_VAULT) {
            if (Math.abs(obs.z - other.z) < 2.0) {
              const halfWidth = other.type === ObstacleType.DESK_CHAIR ? 1.0 : 1.1;
              const obsLeft = other.group.position.x - halfWidth - 0.75;
              const obsRight = other.group.position.x + halfWidth + 0.75;
              if (nextX >= obsLeft && nextX <= obsRight) {
                isBlocked = true;
                break;
              }
            }
          }
        }

        if (isBlocked) {
          // 机やロッカーに衝突したため反転（貫通しない！）
          obs.moveDir = -obs.moveDir;
        } else if (nextX > 3.5) {
          obs.group.position.x = 3.5;
          obs.moveDir = -1;
        } else if (nextX < -3.5) {
          obs.group.position.x = -3.5;
          obs.moveDir = 1;
        } else {
          obs.group.position.x = nextX;
        }

        // 当たり判定ボックスも横移動に追従
        const curX = obs.group.position.x;
        obs.boundingBox.min.set(curX - 0.75, 0, obs.z - 0.6);
        obs.boundingBox.max.set(curX + 0.75, 2.8, obs.z + 0.6);

        // 脚のスイング歩行アニメーション
        obs.animTimer = (obs.animTimer || 0) + dt * 10;
        if (obs.leftLeg && obs.rightLeg) {
          obs.leftLeg.rotation.x = Math.sin(obs.animTimer) * 0.5;
          obs.rightLeg.rotation.x = -Math.sin(obs.animTimer) * 0.5;
        }

        // 【定期攻撃アクション】プレイヤーの前方にいる時、出席簿を投擲
        obs.attackTimer = (obs.attackTimer ?? (1.0 + Math.random() * 0.8)) - dt;
        const distAhead = playerZ - obs.z;
        if (obs.attackTimer <= 0) {
          obs.attackTimer = 2.0 + Math.random() * 0.8;
          if (distAhead > 10 && distAhead < 50) {
            if (obs.crossArm) {
              obs.crossArm.rotation.x = -Math.PI / 3;
              setTimeout(() => {
                if (obs.crossArm) obs.crossArm.rotation.x = 0;
              }, 250);
            }
            if (this.onTeacherAttack) {
              this.onTeacherAttack(new THREE.Vector3(curX, 1.4, obs.z));
            }
          }
        }
      }

      // 2. 暴走配膳台（CHARGING_CART）の予兆 ＆ 突進
      if (obs.type === ObstacleType.CHARGING_CART) {
        obs.stateTimer = (obs.stateTimer || 0) + dt;

        if (obs.actionState === 0) {
          // 予兆中（0.7秒間）: 床の赤い矢印ライン点滅 ＆ 本体ブルブル振動
          if (obs.warningMesh) {
            obs.warningMesh.visible = Math.sin(obs.stateTimer * 28) > -0.2;
          }
          const baseX = LANE_COORDINATES[obs.lane];
          obs.group.position.x = baseX + (Math.random() - 0.5) * 0.08;

          if (obs.stateTimer >= 0.7) {
            obs.actionState = 1;
            obs.group.position.x = baseX;
            if (obs.warningMesh) obs.warningMesh.visible = false;
            if (this.onPlaySound) this.onPlaySound('cartRush');
          }
        } else if (obs.actionState === 1) {
          // 突進中: 手前（+Z方向）へ自走（プレイヤーの進行と合わさり1.5倍の猛スピード！）
          const cartSpeed = forwardSpeed * 0.5;
          obs.z += cartSpeed * dt;
          obs.group.position.z = obs.z;

          const curX = LANE_COORDINATES[obs.lane];
          obs.boundingBox.min.set(curX - 0.8, 0, obs.z - 0.7);
          obs.boundingBox.max.set(curX + 0.8, 1.8, obs.z + 0.7);
        }
      }

      // 3. 倒壊ロッカー（FALLING_LOCKER）の接近検知 ＆ 揺れ予兆 ＆ 倒壊
      if (obs.type === ObstacleType.FALLING_LOCKER) {
        const dist = playerZ - obs.z;

        if (obs.actionState === 0) {
          // 速度に連動し、到達の約0.8秒前（予兆0.5秒＋倒壊0.3秒）で確実に揺れ予兆へ移行
          const triggerDist = Math.max(16, forwardSpeed * 0.82);
          if (dist < triggerDist) {
            obs.actionState = 1;
            obs.stateTimer = 0;
          }
        } else if (obs.actionState === 1) {
          // 予兆中（0.5秒間）: ガタガタと左右に激しく振動
          obs.stateTimer = (obs.stateTimer || 0) + dt;
          if (obs.pivotGroup) {
            obs.pivotGroup.rotation.z = Math.sin(obs.stateTimer * 38) * 0.08;
          }

          if (obs.stateTimer >= 0.5) {
            obs.actionState = 2; // 倒壊開始
            if (obs.pivotGroup) obs.pivotGroup.rotation.z = 0;
          }
        } else if (obs.actionState === 2) {
          // 倒壊中: 手前側へバタンと90度倒れ込む
          obs.fallAngle = Math.min(Math.PI / 2, (obs.fallAngle ?? 0) + dt * 7.5);
          if (obs.pivotGroup) {
            obs.pivotGroup.rotation.x = obs.fallAngle;
          }

          if (obs.fallAngle >= Math.PI / 2) {
            if (!obs.isFallen) {
              obs.isFallen = true;
              if (this.onPlaySound) this.onPlaySound('lockerFall');
            }
          }

          // 当たり判定: 倒れるにつれて高さが低くなり、手前に伸びる
          const curX = LANE_COORDINATES[obs.lane];
          const angle = obs.fallAngle ?? 0;
          const curH = 2.5 * Math.cos(angle) + 0.9 * Math.sin(angle);
          const reachZ = 2.5 * Math.sin(angle);
          obs.boundingBox.min.set(curX - 0.9, 0, obs.z - 0.5);
          obs.boundingBox.max.set(curX + 0.9, Math.max(0.9, curH), obs.z + reachZ);
        }
      }

      // 4. バウンドボール（BOUNCING_BALL）の横断 ＆ 垂直放物線バウンド
      if (obs.type === ObstacleType.BOUNCING_BALL && obs.moveDir !== undefined && obs.moveSpeed !== undefined) {
        // 横移動（壁から壁へ）
        const nextX = obs.group.position.x + obs.moveDir * obs.moveSpeed * dt;
        if (nextX > 4.2) {
          obs.moveDir = -1;
        } else if (nextX < -4.2) {
          obs.moveDir = 1;
        } else {
          obs.group.position.x = nextX;
        }

        // 垂直バウンド運動（重力 -24 m/s^2）
        obs.ballVelY = (obs.ballVelY ?? 5.0) - 24 * dt;
        obs.ballY = (obs.ballY ?? 0.45) + (obs.ballVelY ?? 0) * dt;

        if (obs.ballY <= 0.45) {
          obs.ballY = 0.45;
          obs.ballVelY = 7.5; // 最高到達点 約 1.6m
          if (this.onPlaySound && Math.abs(playerZ - obs.z) < 40) {
            this.onPlaySound('ballBounce');
          }
        }

        if (obs.subMesh) {
          obs.subMesh.position.y = obs.ballY;
          obs.subMesh.rotation.x += dt * 7;
          obs.subMesh.rotation.z += dt * 5;
        }

        // 床影のスケール追従
        if (obs.shadowMesh) {
          const shadowScale = Math.max(0.35, 1.0 - (obs.ballY - 0.45) * 0.4);
          obs.shadowMesh.scale.set(shadowScale, shadowScale, shadowScale);
        }

        // 当たり判定ボックスの追従
        const curX = obs.group.position.x;
        const curY = obs.ballY ?? 0.45;
        obs.boundingBox.min.set(curX - 0.45, curY - 0.45, obs.z - 0.45);
        obs.boundingBox.max.set(curX + 0.45, curY + 0.45, obs.z + 0.45);
      }

      // 5. 清掃用ポリッシャー（SWEEPING_POLISHER）の左右往復 ＆ パトランプ回転
      if (obs.type === ObstacleType.SWEEPING_POLISHER) {
        obs.stateTimer = (obs.stateTimer || 0) + dt;
        const curX = Math.sin(obs.stateTimer * 2.0) * 3.0;
        obs.group.position.x = curX;

        // パトランプ回転
        if (obs.subMesh) {
          obs.subMesh.rotation.y += dt * 14;
        }

        obs.boundingBox.min.set(curX - 0.8, 0, obs.z - 0.8);
        obs.boundingBox.max.set(curX + 0.8, 1.8, obs.z + 0.8);
      }
    }

    this.animClock += dt;

    // ゴールドコインの更新とクリーンアップ
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const coin = this.coins[i];
      coin.update(dt, this.animClock);
      if (coin.mesh.position.z > playerZ + 15 || (coin.isCollected && coin.mesh.scale.x < 0.05)) {
        coin.dispose(this.scene);
        this.coins.splice(i, 1);
      }
    }

    // 2. スポーン処理（速度に応じた先読み距離とスペーシング）
    const lookAhead = Math.max(95, forwardSpeed * 2.2);
    const spawnTargetZ = playerZ - lookAhead;

    while (this.nextSpawnZ > spawnTargetZ) {
      this.normalSpawnCounter++;

      if (this.normalSpawnCounter >= this.GIMMICK_CYCLE_COUNT) {
        this.spawnGimmickArea(this.nextSpawnZ);
        this.normalSpawnCounter = 0;
        const gimmickSpacing = Math.max(32, forwardSpeed * 0.52);
        this.nextSpawnZ -= gimmickSpacing;
      } else {
        this.spawnObstaclePattern(this.nextSpawnZ, forwardSpeed);
        const spacing = Math.max(18, forwardSpeed * 0.38) + Math.random() * 8;
        this.nextSpawnZ -= spacing;
      }
    }

    // 3. 通過済みクリーンアップ
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (obs.z > playerZ + 15 || obs.isDestroyed) {
        this.scene.remove(obs.group);
        this.obstacles.splice(i, 1);
      }
    }
  }

  /**
   * 3択の強制エリア（全レーン封鎖）のスポーン
   */
  private spawnGimmickArea(z: number): void {
    const candidateTypes = [
      ObstacleType.GIMMICK_JUMP,
      ObstacleType.GIMMICK_SLIDE,
      ObstacleType.GIMMICK_BOMB,
    ].filter(t => t !== this.lastGimmickType);

    const type = candidateTypes[Math.floor(Math.random() * candidateTypes.length)];
    this.lastGimmickType = type;

    let group: THREE.Group = new THREE.Group();
    const boundingBox = new THREE.Box3();

    switch (type) {
      case ObstacleType.GIMMICK_JUMP:
        group = this.createJumpGimmickArea();
        boundingBox.min.set(-4.9, 0, z - 0.7);
        boundingBox.max.set(4.9, 0.95, z + 0.7);
        // ジャンプクリア後のご褒美ゴールドコイン（全レーン）
        this.spawnCoinLine(0, z - 4.0, 1, 0, 1.8);
        this.spawnCoinLine(1, z - 4.0, 1, 0, 1.8);
        this.spawnCoinLine(2, z - 4.0, 1, 0, 1.8);
        break;

      case ObstacleType.GIMMICK_SLIDE:
        group = this.createSlideGimmickArea();
        boundingBox.min.set(-4.9, 1.15, z - 0.3);
        boundingBox.max.set(4.9, 7.5, z + 0.3);
        // スライディング中にくぐりながら回収できる低空ゴールドコイン
        this.spawnCoinLine(1, z, 2, 2.0, 0.7);
        break;

      case ObstacleType.GIMMICK_BOMB:
        group = this.createBombGimmickArea();
        boundingBox.min.set(-4.9, 0, z - 0.8);
        boundingBox.max.set(4.9, 5.5, z + 0.8);
        // 爆破突破後の爽快ゴールドコイン列
        this.spawnCoinLine(1, z - 3.5, 3, 2.5, 1.0);
        break;
    }

    group.position.set(0, 0, z);
    this.scene.add(group);

    this.obstacles.push({
      group,
      type,
      lane: 1,
      z,
      isDestroyed: false,
      hasDodged: false,
      boundingBox,
    });
  }

  /**
   * 障害物パターンスポーン（スラローム配置、迂回必須コーン、ゴールドコインライン、動的ギミック）
   */
  private spawnObstaclePattern(z: number, _forwardSpeed: number): void {
    const patternRand = Math.random();

    // パターン1: 【2レーン同時封鎖スラローム】（約28%）
    // 3レーンのうち「2レーン」を封鎖し、残る1レーンを開放。
    // 開放レーンにはゴールドコインライン（3〜4個）を配置！
    // 直前に開放したレーンとは異なるレーンを開けることで、左右のリズミカルなクランクスラロームを強制
    if (patternRand < 0.28) {
      const availableOpenLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== this.lastSlalomOpenLane);
      const openLane = availableOpenLanes[Math.floor(Math.random() * availableOpenLanes.length)];
      this.lastSlalomOpenLane = openLane;

      const blockedLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== openLane);
      for (const bLane of blockedLanes) {
        const obsTypeRand = Math.random();
        let obsType = ObstacleType.DESK_CHAIR;
        if (obsTypeRand < 0.40) {
          obsType = ObstacleType.LOCKER_VAULT;
        } else if (obsTypeRand < 0.75) {
          obsType = ObstacleType.WET_FLOOR_CONE; // 迂回必須コーン
        }
        this.createAndAddObstacle(obsType, bLane, z);
      }

      // 開放レーンにゴールドコイン（3〜4枚）を並べる
      this.spawnCoinLine(openLane, z, 3, 3.0, 1.0);
      return;
    }

    // パターン2: 【動的ギミック＋退避レーンゴールド回収】（約32%）
    if (patternRand < 0.60) {
      const dynamicTypes = [
        ObstacleType.CHARGING_CART,
        ObstacleType.FALLING_LOCKER,
        ObstacleType.BOUNCING_BALL,
        ObstacleType.SWEEPING_POLISHER,
      ];
      const type = dynamicTypes[Math.floor(Math.random() * dynamicTypes.length)];

      if (type === ObstacleType.BOUNCING_BALL || type === ObstacleType.SWEEPING_POLISHER) {
        // レーン全体を横断・往復するギミック
        this.createAndAddObstacle(type, 1, z);
        // 端のレーンにゴールドコインを配置
        const itemLane = (Math.random() > 0.5 ? 0 : 2) as LaneIndex;
        this.spawnCoinLine(itemLane, z, 3, 3.2, 1.0);
      } else if (type === ObstacleType.CHARGING_CART) {
        // 暴走配膳台: 1レーンに出現
        const cartLane = Math.floor(Math.random() * 3) as LaneIndex;
        this.createAndAddObstacle(type, cartLane, z);

        const otherLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== cartLane);
        if (Math.random() < 0.45) {
          const secondLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
          const safeLane = otherLanes.find(l => l !== secondLane)!;
          this.createAndAddObstacle(ObstacleType.DESK_CHAIR, secondLane, z);
          this.spawnCoinLine(safeLane, z, 3, 3.0, 1.0);
        } else {
          const itemLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
          this.spawnCoinLine(itemLane, z, 3, 3.0, 1.0);
        }
      } else if (type === ObstacleType.FALLING_LOCKER) {
        // 倒壊ロッカー: 1レーンに出現
        const lockerLane = Math.floor(Math.random() * 3) as LaneIndex;
        this.createAndAddObstacle(type, lockerLane, z);

        const otherLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== lockerLane);
        const safeLane = otherLanes[Math.floor(Math.random() * otherLanes.length)];
        this.spawnCoinLine(safeLane, z, 3, 3.0, 1.0);
      }
      return;
    }

    // パターン3: 【立入禁止コーン＆水拭き床迂回パターン】（約18%）
    if (patternRand < 0.78) {
      // コーンを特に中央（1）または端に設置し、迂回レーンへゴールドを配置
      const coneLane = Math.random() < 0.6 ? 1 : (Math.random() < 0.5 ? 0 : 2) as LaneIndex;
      this.createAndAddObstacle(ObstacleType.WET_FLOOR_CONE, coneLane, z);

      // コーン以外のレーンにゴールドコインをスポーン
      const freeLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== coneLane);
      const targetLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
      this.spawnCoinLine(targetLane, z, 3, 2.8, 1.0);

      // 40%の確率で別のフリーレーンに吊り看板（スライディング可）を追加
      if (Math.random() < 0.40) {
        const otherFree = freeLanes.find(l => l !== targetLane)!;
        this.createAndAddObstacle(ObstacleType.HANGING_SIGN, otherFree, z);
      }
      return;
    }

    // パターン4: 【静止障害物＋ジャンプ/スライディング爽快アクション＋ゴールドコイン】（残り約22%）
    {
      const laneOccupied = [false, false, false];
      const numObstacles = Math.random() < 0.5 ? 1 : 2;

      for (let count = 0; count < numObstacles; count++) {
        const availableLanes: LaneIndex[] = [];
        for (let l = 0; l < 3; l++) {
          if (!laneOccupied[l]) availableLanes.push(l as LaneIndex);
        }
        if (availableLanes.length <= 1) break; // 最低1レーンは安全保証

        const chosenLane = availableLanes[Math.floor(Math.random() * availableLanes.length)];
        laneOccupied[chosenLane] = true;

        const typeRand = Math.random();
        let type: ObstacleType;
        if (typeRand < 0.35) {
          type = ObstacleType.DESK_CHAIR;
          // 机・椅子を跳び越えた位置に空中ゴールドコイン（Y: 1.8）を配置
          this.spawnCoinLine(chosenLane, z - 1.5, 1, 0, 1.8);
        } else if (typeRand < 0.58) {
          type = ObstacleType.LOCKER_VAULT;
        } else if (typeRand < 0.78) {
          type = ObstacleType.HANGING_SIGN;
          // 看板の下にスライディング回収用ゴールドコイン（Y: 0.7）を配置
          this.spawnCoinLine(chosenLane, z, 2, 2.5, 0.7);
        } else {
          type = ObstacleType.TEACHER;
        }

        this.createAndAddObstacle(type, chosenLane, z);
      }

      // 空いている安全レーンにも地上ゴールドコインを配置
      const freeLanes: LaneIndex[] = [];
      for (let l = 0; l < 3; l++) {
        if (!laneOccupied[l]) freeLanes.push(l as LaneIndex);
      }
      if (freeLanes.length > 0) {
        const rewardLane = freeLanes[Math.floor(Math.random() * freeLanes.length)];
        this.spawnCoinLine(rewardLane, z, 3, 3.0, 1.0);
      }
    }
  }

  private createAndAddObstacle(type: ObstacleType, lane: LaneIndex, z: number): void {
    let group: THREE.Group;
    const x = LANE_COORDINATES[lane];
    const boundingBox = new THREE.Box3();
    let leftLeg: THREE.Mesh | undefined;
    let rightLeg: THREE.Mesh | undefined;
    let crossArm: THREE.Mesh | undefined;
    let moveDir: number | undefined;
    let moveSpeed: number | undefined;
    let warningMesh: THREE.Mesh | undefined;
    let pivotGroup: THREE.Group | undefined;
    let subMesh: THREE.Mesh | undefined;
    let shadowMesh: THREE.Mesh | undefined;
    let ballVelY: number | undefined;
    let ballY: number | undefined;
    let actionState: number | undefined;
    let stateTimer: number | undefined;

    switch (type) {
      case ObstacleType.DESK_CHAIR:
        group = this.createDeskChairObstacle();
        boundingBox.min.set(x - 0.9, 0, z - 0.7);
        boundingBox.max.set(x + 0.9, 1.8, z + 0.7);
        break;

      case ObstacleType.LOCKER_VAULT:
        group = this.createLockerVaultObstacle();
        boundingBox.min.set(x - 1.0, 0, z - 0.8);
        boundingBox.max.set(x + 1.0, 2.6, z + 0.8);
        break;

      case ObstacleType.TEACHER: {
        const teacher = this.createTeacherObstacle();
        group = teacher.group;
        leftLeg = teacher.leftLeg;
        rightLeg = teacher.rightLeg;
        crossArm = teacher.crossArm;
        moveDir = Math.random() > 0.5 ? 1 : -1;
        moveSpeed = 2.4 + Math.random() * 1.6;
        boundingBox.min.set(x - 0.75, 0, z - 0.6);
        boundingBox.max.set(x + 0.75, 2.8, z + 0.6);
        break;
      }

      case ObstacleType.HANGING_SIGN:
        group = this.createHangingSignObstacle();
        boundingBox.min.set(x - 1.4, 1.20, z - 0.3);
        boundingBox.max.set(x + 1.4, 2.30, z + 0.3);
        break;

      case ObstacleType.CHARGING_CART: {
        const cart = this.createChargingCartObstacle();
        group = cart.group;
        warningMesh = cart.warningMesh;
        actionState = 0; // 0: 予兆待機, 1: 突進
        stateTimer = 0;
        boundingBox.min.set(x - 0.8, 0, z - 0.7);
        boundingBox.max.set(x + 0.8, 1.8, z + 0.7);
        break;
      }

      case ObstacleType.FALLING_LOCKER: {
        const locker = this.createFallingLockerObstacle();
        group = locker.group;
        pivotGroup = locker.pivotGroup;
        actionState = 0; // 0: 直立待機, 1: 揺れ予兆, 2: 倒壊
        stateTimer = 0;
        boundingBox.min.set(x - 0.9, 0, z - 0.5);
        boundingBox.max.set(x + 0.9, 2.5, z + 0.5);
        break;
      }

      case ObstacleType.BOUNCING_BALL: {
        const ball = this.createBouncingBallObstacle();
        group = ball.group;
        subMesh = ball.ballMesh;
        shadowMesh = ball.shadowMesh;
        const startLeft = Math.random() > 0.5;
        const startX = startLeft ? -4.2 : 4.2;
        moveDir = startLeft ? 1 : -1;
        moveSpeed = 4.2;
        ballVelY = 5.0;
        ballY = 0.45;
        actionState = 1;
        stateTimer = 0;
        boundingBox.min.set(startX - 0.45, 0, z - 0.45);
        boundingBox.max.set(startX + 0.45, 0.9, z + 0.45);
        break;
      }

      case ObstacleType.SWEEPING_POLISHER: {
        const polisher = this.createSweepingPolisherObstacle();
        group = polisher.group;
        subMesh = polisher.warningLamp;
        stateTimer = Math.random() * Math.PI * 2;
        actionState = 1;
        const initX = Math.sin(stateTimer) * 3.0;
        boundingBox.min.set(initX - 0.8, 0, z - 0.8);
        boundingBox.max.set(initX + 0.8, 1.8, z + 0.8);
        break;
      }

      case ObstacleType.WET_FLOOR_CONE:
        group = this.createWetFloorConeObstacle();
        boundingBox.min.set(x - 1.15, 0, z - 0.7);
        boundingBox.max.set(x + 1.15, 2.6, z + 0.7);
        break;

      default:
        return;
    }

    const spawnX = type === ObstacleType.BOUNCING_BALL
      ? (moveDir === 1 ? -4.2 : 4.2)
      : (type === ObstacleType.SWEEPING_POLISHER ? (Math.sin(stateTimer ?? 0) * 3.0) : x);

    group.position.set(spawnX, 0, z);
    this.scene.add(group);

    this.obstacles.push({
      group,
      type,
      lane,
      z,
      isDestroyed: false,
      hasDodged: false,
      boundingBox,
      moveDir,
      moveSpeed,
      leftLeg,
      rightLeg,
      crossArm,
      animTimer: Math.random() * Math.PI,
      attackTimer: 1.0 + Math.random() * 1.2,
      warningMesh,
      pivotGroup,
      subMesh,
      shadowMesh,
      ballVelY,
      ballY,
      actionState,
      stateTimer,
      fallAngle: 0,
      isFallen: false,
    });
  }

  public getObstacles(): Obstacle[] {
    return this.obstacles;
  }

  public removeObstacle(obs: Obstacle): void {
    obs.isDestroyed = true;
    this.scene.remove(obs.group);
  }

  public reset(): void {
    for (const obs of this.obstacles) {
      this.scene.remove(obs.group);
    }
    this.obstacles = [];

    for (const coin of this.coins) {
      coin.dispose(this.scene);
    }
    this.coins = [];

    this.nextSpawnZ = -30;
    this.normalSpawnCounter = 0;
    this.lastSlalomOpenLane = 1;
  }
}
