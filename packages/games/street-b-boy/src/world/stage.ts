import * as THREE from 'three';
import { BoundingBox2D } from '../entities/player';
import {
  CassetteTape, StageBlock, StreetObstacle, ParticleSystem,
  GrindRail, FireHydrant, SubwooferPad, SteamVent, LaserGrid, MovingPlatform,
  CrumblingPlatform, Checkpoint
} from '../entities/objects';
import { BaseEnemy, SecurityBot, SkaterDog, SurveillanceDrone, EnemyProjectile } from '../entities/enemies';
import { BoomboxModel } from './boombox';
import { TextureGenerator } from './textures';
import { CollisionShape, ONE_WAY_MAX_THICKNESS } from '../engine/collision';

export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  mesh: THREE.Mesh;
  /** 薄い足場板。下からは通り抜け、上からだけ着地できる */
  oneWay: boolean;
}

export type BackdropTheme = 'bronx' | 'subway' | 'rooftop' | 'neon';

/** ステージごとの設定。構成(足場・ギミック)は buildStageN に、見た目と進行のパラメータはここに集める */
export interface StageConfig {
  title: string;
  theme: BackdropTheme;
  goalX: number;
  goalY: number;
  timeLimit: number;
  /** BGMのテンポ(BPM) */
  tempo: number;
  ambientHex: number;
  hemiSky: number;
  hemiGround: number;
  moonHex: number;
  glowColor: number;
  dustColor: number;
  lampXs: number[];
  lampStyle: 'pole' | 'hanging';
  platformColor: number;
}

export const STAGE_CONFIGS: Record<number, StageConfig> = {
  1: {
    title: 'BRONX STREET', theme: 'bronx', goalX: 138, goalY: 3.5, timeLimit: 75, tempo: 96,
    ambientHex: 0x384865, hemiSky: 0xaaccff, hemiGround: 0x222633, moonHex: 0xddeeff,
    glowColor: 0xffea00, dustColor: 0x00f0ff, lampXs: [12, 35, 62, 90, 115, 138], lampStyle: 'pole',
    platformColor: 0x2b323d
  },
  2: {
    title: 'SUBWAY CYPHER', theme: 'subway', goalX: 150, goalY: 3.5, timeLimit: 70, tempo: 100,
    ambientHex: 0x284545, hemiSky: 0x88eecc, hemiGround: 0x182220, moonHex: 0xaaffdd,
    glowColor: 0x00ffaa, dustColor: 0x00ff88, lampXs: [14, 44, 70, 96, 124, 150], lampStyle: 'hanging',
    platformColor: 0x222e28
  },
  3: {
    title: 'ROOFTOP SKYLINE', theme: 'rooftop', goalX: 148, goalY: 2.8, timeLimit: 65, tempo: 104,
    ambientHex: 0x353258, hemiSky: 0xaa99ff, hemiGround: 0x1b1828, moonHex: 0xeeccff,
    glowColor: 0xffea00, dustColor: 0x00f0ff, lampXs: [12, 44, 78, 110, 140, 148], lampStyle: 'pole',
    platformColor: 0x222632
  },
  4: {
    title: 'NEON BLOCK PARTY', theme: 'neon', goalX: 160, goalY: 4.0, timeLimit: 60, tempo: 112,
    ambientHex: 0x483a55, hemiSky: 0xffccaa, hemiGround: 0x2b1e30, moonHex: 0xffeebb,
    glowColor: 0xff0066, dustColor: 0xffea00, lampXs: [14, 48, 80, 105, 132, 160], lampStyle: 'hanging',
    platformColor: 0x2b323d
  }
};

export class Stage {
  public scene: THREE.Scene;
  public platforms: Platform[] = [];
  public blocks: StageBlock[] = [];
  public cassettes: CassetteTape[] = [];
  public obstacles: StreetObstacle[] = [];
  public enemies: BaseEnemy[] = [];
  public projectiles: EnemyProjectile[] = [];
  public particleSystem: ParticleSystem;

  // Street gimmicks
  public grindRails: GrindRail[] = [];
  public fireHydrants: FireHydrant[] = [];
  public subwoofers: SubwooferPad[] = [];
  public steamVents: SteamVent[] = [];
  public laserGrids: LaserGrid[] = [];
  public movingPlatforms: MovingPlatform[] = [];
  public crumblingPlatforms: CrumblingPlatform[] = [];
  public checkpoints: Checkpoint[] = [];

  public stageNumber: number;
  public stageTitle: string;
  public readonly config: StageConfig;

  // Goal turntable & giant boombox
  public goalTurntable: THREE.Mesh;
  public goalBoombox: BoomboxModel;
  public goalX: number = 135;
  public goalY: number = 3.5;

  // Background meshes for parallax
  private bgGroup: THREE.Group;
  private dustPoints: THREE.Points;
  // 街灯ごとにスポットライトを置くと、画面外の街灯の分まで全画素で光源計算が増える。
  // 同時に画面に映る街灯は多くても2本なので、2灯だけ用意してカメラに近い街灯へ付け替える
  private spotlights: THREE.SpotLight[] = [];
  private lampXs: number[] = [];
  private static readonly ACTIVE_LAMP_LIGHTS = 2;
  private hvacFans: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, stageNumber: number = 1) {
    this.scene = scene;
    this.stageNumber = stageNumber;
    this.bgGroup = new THREE.Group();
    this.scene.add(this.bgGroup);

    this.particleSystem = new ParticleSystem();
    this.scene.add(this.particleSystem.group);

    this.config = STAGE_CONFIGS[stageNumber] || STAGE_CONFIGS[1];
    const cfg = this.config;
    this.stageTitle = cfg.title;
    this.goalX = cfg.goalX;
    this.goalY = cfg.goalY;

    // Goal stage setup
    const turntableGeo = new THREE.CylinderGeometry(2.8, 2.8, 0.4, 32);
    const turntableMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getVinylRecordTexture(),
      roughness: 0.3,
      metalness: 0.4
    });
    this.goalTurntable = new THREE.Mesh(turntableGeo, turntableMat);
    this.goalTurntable.position.set(this.goalX, this.goalY, 0);
    this.goalTurntable.receiveShadow = true;
    this.scene.add(this.goalTurntable);

    // Giant Boombox behind the turntable
    this.goalBoombox = new BoomboxModel(1.8);
    this.goalBoombox.mesh.position.set(this.goalX, this.goalY + 2.5, -2.5);
    this.scene.add(this.goalBoombox.mesh);

    // Ambient dust / spark particles
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 400;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = Math.random() * 200 - 10;
      dustPos[i * 3 + 1] = Math.random() * 20;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: cfg.dustColor,
      size: 0.14,
      transparent: true,
      opacity: 0.5
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);

    this.buildLighting();
    this.buildBackdrop();
    this.buildLevelContent();
    this.finalizeLevel();
    this.validateLayout();
  }

  // -------------------------------------------------------------
  // LIGHTING
  // -------------------------------------------------------------
  private buildLighting(): void {
    const cfg = this.config;
    // 環境光・月光・街灯は bgGroup に入れる。scene 直下に置くと dispose で消えず、面を進めるたびに光が積み重なって白飛びする
    const ambientLight = new THREE.AmbientLight(cfg.ambientHex, 2.3);
    this.bgGroup.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(cfg.hemiSky, cfg.hemiGround, 1.4);
    this.bgGroup.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(cfg.moonHex, 2.2);
    moonLight.position.set(50, 60, 40);
    this.bgGroup.add(moonLight);

    cfg.lampXs.forEach((lx) => {
      this.createLampFixture(lx);
    });

    for (let i = 0; i < Stage.ACTIVE_LAMP_LIGHTS; i++) {
      const spot = new THREE.SpotLight(cfg.glowColor, 4.5, 16, Math.PI / 4.5, 0.5, 1.2);
      this.scene.add(spot);
      this.scene.add(spot.target);
      this.spotlights.push(spot);
    }
    this.updateLampLights(0);
  }

  /** カメラに近い街灯から順にスポットライトを割り当てる */
  private updateLampLights(focusX: number): void {
    // 毎フレーム呼ばれるので配列を作らずに近い2本を選ぶ
    let first = -1;
    let second = -1;
    for (let i = 0; i < this.lampXs.length; i++) {
      const d = Math.abs(this.lampXs[i] - focusX);
      if (first < 0 || d < Math.abs(this.lampXs[first] - focusX)) {
        second = first;
        first = i;
      } else if (second < 0 || d < Math.abs(this.lampXs[second] - focusX)) {
        second = i;
      }
    }
    const picks = [first, second < 0 ? first : second];
    this.spotlights.forEach((spot, i) => {
      const lx = this.lampXs[picks[i]];
      if (lx === undefined) return;
      spot.position.set(lx + 1.2, 6.1, -1.2);
      spot.target.position.set(lx + 1.2, 0, 0);
    });
  }

  private createLampFixture(x: number): void {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(x, 0, -1.8);
    const glowColor = this.config.glowColor;
    const metal = new THREE.MeshStandardMaterial({ color: 0x1f242b, metalness: 0.8, roughness: 0.3 });

    if (this.config.lampStyle === 'pole') {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 6.5, 12), metal);
      pole.position.y = 3.25;
      pole.castShadow = true;
      lampGroup.add(pole);

      const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.12), metal);
      arm.position.set(0.6, 6.4, 0.6);
      lampGroup.add(arm);

      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.2, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0x111111 }));
      head.position.set(1.2, 6.25, 0.6);
      lampGroup.add(head);
    } else {
      // 天井から吊り下げた蛍光灯・ネオン管(地面まで届く柱がないので、足場と紛らわしくない)
      const wireMat = new THREE.MeshBasicMaterial({ color: 0x222222 });
      for (const wx of [0.5, 1.9]) {
        const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.0, 4), wireMat);
        wire.position.set(wx, 7.6, 0.6);
        lampGroup.add(wire);
      }
      const tube = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.14, 0.14), new THREE.MeshBasicMaterial({ color: glowColor }));
      tube.position.set(1.2, 6.1, 0.6);
      lampGroup.add(tube);
    }

    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), new THREE.MeshBasicMaterial({ color: glowColor }));
    bulb.position.set(1.2, 6.1, 0.6);
    lampGroup.add(bulb);

    // Volumetric Light Cone
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(2.0, 6.0, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
    );
    cone.position.set(1.2, 3.1, 0.6);
    lampGroup.add(cone);

    this.lampXs.push(x);
    this.bgGroup.add(lampGroup);
  }

  // -------------------------------------------------------------
  // BACKDROP (背景は判定なし。プレイ面(z=±1.4)から離し、暗く沈めて足場と見分ける)
  // -------------------------------------------------------------
  private buildBackdrop(): void {
    switch (this.config.theme) {
      case 'subway':
        this.buildSubwayBackdrop();
        break;
      case 'rooftop':
        this.buildRooftopBackdrop();
        break;
      case 'neon':
        this.buildNeonBackdrop();
        break;
      default:
        this.buildBronxBackdrop();
        break;
    }
  }

  /** 遠景の高層ビル群。窓はインスタンス描画にしてドローコールを抑える */
  private buildSkyline(opts: {
    z: number;
    minH: number;
    varH: number;
    minW: number;
    varW: number;
    xFrom: number;
    xTo: number;
    stepBase: number;
    windowChance: number;
    color: number;
  }): void {
    const buildingMat = new THREE.MeshStandardMaterial({ color: opts.color, roughness: 0.9 });
    const warm: THREE.Matrix4[] = [];
    const cool: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();

    for (let x = opts.xFrom; x < opts.xTo; x += opts.stepBase + Math.random() * 8) {
      const w = opts.minW + Math.random() * opts.varW;
      const h = opts.minH + Math.random() * opts.varH;
      const d = 12;
      const building = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), buildingMat);
      building.position.set(x, h / 2 - 2, opts.z);
      this.bgGroup.add(building);

      const frontZ = opts.z + d / 2 + 0.05;
      for (let wy = 4; wy < h - 4; wy += 3.5) {
        for (let wx = -w / 2 + 2; wx < w / 2 - 2; wx += 2.5) {
          if (Math.random() < opts.windowChance) {
            m.makeTranslation(x + wx, wy, frontZ);
            (Math.random() > 0.3 ? warm : cool).push(m.clone());
          }
        }
      }
    }

    const winGeo = new THREE.PlaneGeometry(1.0, 1.4);
    for (const [list, color] of [[warm, 0xffea70], [cool, 0x00f0ff]] as [THREE.Matrix4[], number][]) {
      if (list.length === 0) continue;
      const inst = new THREE.InstancedMesh(winGeo, new THREE.MeshBasicMaterial({ color }), list.length);
      list.forEach((mat, i) => inst.setMatrixAt(i, mat));
      inst.instanceMatrix.needsUpdate = true;
      this.bgGroup.add(inst);
    }
  }

  /** 壁の前面(z=-2.3)にぴったり貼り付けた背景の飾り。プレイ面(±1.4)とは十分離れている */
  private addWallMountedHvac(xs: number[], y: number): void {
    xs.forEach((hx) => {
      const hvacGroup = new THREE.Group();
      hvacGroup.position.set(hx, y, -2.0);

      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.3, 0.6),
        new THREE.MeshStandardMaterial({ color: 0x272d36, metalness: 0.7, roughness: 0.5 })
      );
      hvacGroup.add(box);

      const fan = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      fan.position.set(0, 0, 0.32);
      hvacGroup.add(fan);
      this.hvacFans.push(fan);

      this.bgGroup.add(hvacGroup);
    });
  }

  /** 背景の壁。プレイ面の足場(x = -6から開始)と左端を完全に一致させる */
  private addMidgroundWall(height: number, material: (x: number) => THREE.Material, startX: number = -6): void {
    for (let x = startX; x < 190; x += 18) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(18, height, 0.6), material(x));
      wall.position.set(x + 9, height / 2, -2.6);
      this.bgGroup.add(wall);
    }
    // 左端(x = -6)の終端を綺麗に見せるエンドピラー(境界の柱)
    const endPillarMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8 });
    const endPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, height + 1.0, 1.2), endPillarMat);
    endPillar.position.set(startX, (height + 1.0) / 2, -2.5);
    this.bgGroup.add(endPillar);
  }

  private buildBronxBackdrop(): void {
    this.buildSkyline({ z: -24, minH: 25, varH: 35, minW: 10, varW: 8, xFrom: -20, xTo: 190, stepBase: 14, windowChance: 0.55, color: 0x090c14 });

    // Rooftop Water Towers (壁の上に頭を出す)
    const wtTex = TextureGenerator.getWaterTowerTexture();
    [28, 76, 122].forEach((wx) => {
      const wtGroup = new THREE.Group();
      wtGroup.position.set(wx, 7.5, -4.5);

      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(1.8, 1.8, 3.2, 16),
        new THREE.MeshStandardMaterial({ map: wtTex, roughness: 0.8 })
      );
      barrel.position.y = 2.4;
      wtGroup.add(barrel);

      const roof = new THREE.Mesh(
        new THREE.ConeGeometry(2.1, 1.4, 16),
        new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.6 })
      );
      roof.position.y = 4.7;
      wtGroup.add(roof);

      const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
      [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(lx, 1.2, lz);
        wtGroup.add(leg);
      });

      this.bgGroup.add(wtGroup);
    });

    // Graffiti Bricks(暗めに落とす)
    const graffitiTags = ['STREET B-BOY', 'HIP HOP', 'BREAK', 'CYPHER', '90s BEATS', 'BRONX'];
    this.addMidgroundWall(9, (x) => new THREE.MeshStandardMaterial({
      map: TextureGenerator.getBrickWallWithGraffiti(graffitiTags[Math.abs(Math.floor(x / 18)) % graffitiTags.length]),
      color: 0x8a8a8a,
      roughness: 0.8
    }));
    this.addWallMountedHvac([15, 52, 98, 132], 5.8);
  }

  private buildSubwayBackdrop(): void {
    // 地下なので摩天楼はなし。タイル壁と柱、駅名の看板だけで構成する
    const tileTex = TextureGenerator.getSubwayTileTexture();
    tileTex.repeat.set(3, 1);
    this.addMidgroundWall(10, () => new THREE.MeshStandardMaterial({ map: tileTex, color: 0x777f7b, roughness: 0.5 }));

    // 駅の柱(壁の前面に貼り付く角柱。地面には届くが、プレイ面よりずっと奥)
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1b2420, roughness: 0.8 });
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    for (let x = 6; x < 170; x += 24) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(1.4, 10, 0.5), pillarMat);
      pillar.position.set(x, 5, -2.05);
      this.bgGroup.add(pillar);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.25, 0.52), stripeMat);
      stripe.position.set(x, 1.2, -2.05);
      this.bgGroup.add(stripe);
    }

    // 駅名標
    const stationNames = ['42 ST', 'CYPHER ST', 'BREAK AVE', 'GOAL LINE', 'B-BOY PLAZA'];
    for (let i = 0; i < stationNames.length; i++) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.2, 0.3),
        new THREE.MeshStandardMaterial({ map: TextureGenerator.getNeonBillboardTexture(stationNames[i]), roughness: 0.4 })
      );
      sign.position.set(20 + i * 32, 7.4, -2.1);
      this.bgGroup.add(sign);
    }

    // 天井
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(220, 1, 10), new THREE.MeshStandardMaterial({ color: 0x0c110f, roughness: 1 }));
    ceiling.position.set(80, 11, -3);
    this.bgGroup.add(ceiling);
  }

  private buildRooftopBackdrop(): void {
    // 壁はなく、開けた夜空とビル群。手前の低い層と奥の高い層で奥行きを出す
    this.buildSkyline({ z: -18, minH: 14, varH: 26, minW: 8, varW: 8, xFrom: -20, xTo: 190, stepBase: 12, windowChance: 0.5, color: 0x0b0d18 });
    this.buildSkyline({ z: -46, minH: 40, varH: 40, minW: 12, varW: 10, xFrom: -30, xTo: 210, stepBase: 18, windowChance: 0.3, color: 0x070912 });

    // 大きな月
    const moon = new THREE.Mesh(new THREE.CircleGeometry(9, 40), new THREE.MeshBasicMaterial({ color: 0xf1e6ff }));
    moon.position.set(70, 42, -110);
    this.bgGroup.add(moon);

    // 星
    const starGeo = new THREE.BufferGeometry();
    const starPos = new Float32Array(300 * 3);
    for (let i = 0; i < 300; i++) {
      starPos[i * 3] = -20 + Math.random() * 220;
      starPos[i * 3 + 1] = 18 + Math.random() * 50;
      starPos[i * 3 + 2] = -100;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    this.bgGroup.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, sizeAttenuation: true })));

    // 航空障害灯
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2222 });
    for (const bx of [10, 60, 105, 150]) {
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 8), beaconMat);
      beacon.position.set(bx, 40, -18);
      this.bgGroup.add(beacon);
    }
  }

  private buildNeonBackdrop(): void {
    this.buildSkyline({ z: -24, minH: 25, varH: 35, minW: 10, varW: 8, xFrom: -20, xTo: 190, stepBase: 14, windowChance: 0.4, color: 0x0d0714 });

    // ネオン格子の壁(低め)。看板が壁の上に見えるようにする
    const gridTex = TextureGenerator.getNeonGridTexture();
    gridTex.repeat.set(6, 2);
    this.addMidgroundWall(6, () => new THREE.MeshStandardMaterial({ map: gridTex, color: 0x9a9a9a, roughness: 0.6 }));

    const billboards = [
      { x: 30, text: 'KING OF BREAKS' },
      { x: 70, text: 'NEON BLOCK PARTY' },
      { x: 112, text: 'GRAND MASTER' },
      { x: 148, text: 'B-BOY FOREVER' }
    ];
    for (const b of billboards) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(12, 5, 0.4),
        new THREE.MeshStandardMaterial({ map: TextureGenerator.getNeonBillboardTexture(b.text), roughness: 0.3 })
      );
      mesh.position.set(b.x, 9.5, -3.2);
      this.bgGroup.add(mesh);
    }
    this.addWallMountedHvac([20, 90, 125], 4.5);
  }

  // -------------------------------------------------------------
  // BUILDER API
  // -------------------------------------------------------------
  /**
   * 足場を追加する。厚み0.6以下の板は一方通行(下から通り抜け・上から着地)。
   * 一方通行の板には縁に水色の線を、ネオン面のソリッドな足場には上面にテーマ色の線を入れて、見た目で区別できるようにする。
   */
  public addPlatform(x: number, y: number, w: number, h: number, isAsphalt: boolean = false, oneWay: boolean = h <= ONE_WAY_MAX_THICKNESS): void {
    // 粗いローポリ直方体から、セグメント分割された高品位ジオメトリに強化
    const widthSegs = Math.max(1, Math.min(64, Math.round(w * 1.5)));
    const heightSegs = Math.max(1, Math.min(16, Math.round(h * 2)));
    const geo = new THREE.BoxGeometry(w, h, 2.8, widthSegs, heightSegs, 2);
    let mat: THREE.Material;

    if (isAsphalt) {
      const tex = TextureGenerator.getAsphaltRoadTexture();
      tex.repeat.set(w / 4, 1);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    } else {
      mat = new THREE.MeshStandardMaterial({ color: this.config.platformColor, roughness: 0.7 });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, y - h / 2, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    // 段差・足場のクォリティ改善（立体スチールコーピング、六角ボルト、縁石ブロック、垂直サポートリブ）
    if (!oneWay) {
      const metalMat = new THREE.MeshStandardMaterial({
        color: 0x9aa2a8,
        metalness: 0.85,
        roughness: 0.25
      });
      const boltMat = new THREE.MeshStandardMaterial({
        color: 0xd4dadf,
        metalness: 0.95,
        roughness: 0.2
      });

      // 1. 手前上エッジのスチールコーピングパイプ（丸みと光沢のある面取りレール）
      const copingGeo = new THREE.CylinderGeometry(0.045, 0.045, w, 12);
      copingGeo.rotateZ(Math.PI / 2);
      const coping = new THREE.Mesh(copingGeo, metalMat);
      coping.position.set(0, h / 2, 1.4);
      coping.castShadow = true;
      mesh.add(coping);

      // 2. コーピングに一定間隔で打ち込まれた六角ボルト・リベット
      const boltGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.04, 6);
      const boltSpacing = 2.0;
      const numBolts = Math.max(2, Math.floor(w / boltSpacing));
      for (let i = 0; i <= numBolts; i++) {
        const bx = -w / 2 + 0.3 + ((w - 0.6) * i) / numBolts;
        const bolt = new THREE.Mesh(boltGeo, boltMat);
        bolt.rotation.x = Math.PI / 2;
        bolt.position.set(bx, h / 2 - 0.02, 1.42);
        mesh.add(bolt);
      }

      // 3. アスファルト道路の段差縁石（Curb）立体ブロック
      if (isAsphalt) {
        const curbMat = new THREE.MeshStandardMaterial({ color: 0x8f9598, roughness: 0.85 });
        const curbGeo = new THREE.BoxGeometry(w, 0.12, 0.2);
        const curb = new THREE.Mesh(curbGeo, curbMat);
        curb.position.set(0, h / 2 - 0.06, 1.35);
        mesh.add(curb);
      }

      // 4. 高さ1.0以上の段差垂直面にある立体サポートリブ / 目地スリット
      if (h >= 1.0) {
        const ribMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, metalness: 0.6, roughness: 0.4 });
        const ribGeo = new THREE.BoxGeometry(0.08, h - 0.12, 0.04);
        const numRibs = Math.max(1, Math.floor(w / 3.2));
        for (let i = 1; i <= numRibs; i++) {
          const rx = -w / 2 + (w * i) / (numRibs + 1);
          const rib = new THREE.Mesh(ribGeo, ribMat);
          rib.position.set(rx, 0, 1.42);
          mesh.add(rib);
        }
      }

      // 5. 段差の左右端の補強スチールコーナー金具
      const bracketGeo = new THREE.BoxGeometry(0.12, Math.min(h, 0.7), 0.1);
      for (const endX of [-w / 2 + 0.06, w / 2 - 0.06]) {
        const bracket = new THREE.Mesh(bracketGeo, metalMat);
        bracket.position.set(endX, h / 2 - Math.min(h, 0.7) / 2, 1.4);
        mesh.add(bracket);
      }
    }

    if (oneWay || this.config.theme === 'neon') {
      const lineColor = oneWay ? 0x66ccff : this.config.glowColor;
      const line = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), new THREE.MeshBasicMaterial({ color: lineColor }));
      line.position.set(0, h / 2, 1.4);
      mesh.add(line);
    }

    this.platforms.push({ x, y, w, h, mesh, oneWay });
  }

  public addBlock(block: StageBlock): void {
    this.blocks.push(block);
    this.scene.add(block.mesh);
  }

  public addCassette(cassette: CassetteTape): void {
    this.cassettes.push(cassette);
    this.scene.add(cassette.mesh);
  }

  public addObstacle(obstacle: StreetObstacle): void {
    this.obstacles.push(obstacle);
    this.scene.add(obstacle.mesh);
  }

  public addEnemy(enemy: BaseEnemy): void {
    this.enemies.push(enemy);
    enemy.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    this.scene.add(enemy.mesh);
  }

  public addGrindRail(rail: GrindRail): void {
    this.grindRails.push(rail);
    this.scene.add(rail.mesh);
  }

  public addFireHydrant(hydrant: FireHydrant): void {
    this.fireHydrants.push(hydrant);
    this.scene.add(hydrant.mesh);
  }

  public addSubwoofer(subwoofer: SubwooferPad): void {
    this.subwoofers.push(subwoofer);
    this.scene.add(subwoofer.mesh);
  }

  public addSteamVent(vent: SteamVent): void {
    this.steamVents.push(vent);
    this.scene.add(vent.mesh);
  }

  public addLaserGrid(grid: LaserGrid): void {
    this.laserGrids.push(grid);
    this.scene.add(grid.mesh);
  }

  public addMovingPlatform(platform: MovingPlatform): void {
    this.movingPlatforms.push(platform);
    this.scene.add(platform.mesh);
  }

  public addCrumblingPlatform(platform: CrumblingPlatform): void {
    this.crumblingPlatforms.push(platform);
    this.scene.add(platform.mesh);
  }

  public addCheckpoint(cp: Checkpoint): void {
    this.checkpoints.push(cp);
    this.scene.add(cp.mesh);
  }

  /** 全ての足場を置き終えた後の仕上げ(レールの支柱など、他の足場の位置に依存するもの) */
  private finalizeLevel(): void {
    this.grindRails.forEach((rail) => rail.buildSupports((wx) => this.groundHeightBelow(wx, rail.y)));
  }

  /** wx の真下にある足場の上面の高さ(maxY 以下で最も高いもの)。無ければ null */
  private groundHeightBelow(wx: number, maxY: number): number | null {
    let best: number | null = null;
    for (const p of this.platforms) {
      if (wx >= p.x && wx <= p.x + p.w && p.y <= maxY + 0.05) {
        if (best === null || p.y > best) best = p.y;
      }
    }
    return best;
  }

  // -------------------------------------------------------------
  // LEVEL LAYOUT BUILDER
  // -------------------------------------------------------------
  private buildLevelContent(): void {
    switch (this.stageNumber) {
      case 2:
        this.buildStage2();
        break;
      case 3:
        this.buildStage3();
        break;
      case 4:
        this.buildStage4();
        break;
      default:
        this.buildStage1();
        break;
    }
  }

  private addSign(x: number, y: number, text: string): void {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 1.7, 0.2),
      new THREE.MeshStandardMaterial({ map: TextureGenerator.getNeonBillboardTexture(text), roughness: 0.4 })
    );
    sign.position.set(x, y, -1.9);
    this.bgGroup.add(sign);
  }

  // -------------------------------------------------------------
  // STAGE 1: BRONX STREET (基本の動きを覚える面: 看板つきの導入、レール、ドローン、消火栓)
  // -------------------------------------------------------------
  private buildStage1(): void {
    // Road 1: X -6 to 25
    this.addPlatform(-6, 0, 31, 4, true);

    // チュートリアルの看板(背景)
    this.addSign(4, 4.4, 'JUMP: Z/SPACE');
    this.addSign(15, 4.4, 'SPIN: X/K');
    this.addSign(23, 4.4, 'HIT HYDRANT!');

    // Intro Question & Brick Blocks
    this.addBlock(new StageBlock(8, 3.2, 'question'));
    this.addBlock(new StageBlock(10, 3.2, 'brick'));
    this.addBlock(new StageBlock(12, 3.2, 'question'));
    this.addBlock(new StageBlock(14, 3.2, 'brick'));

    // Patrolling enemy first, then a cardboard box to spin through
    this.addEnemy(new SecurityBot(17.5, 0, 2.0));
    this.addObstacle(new StreetObstacle(20.5, 0, 'cardboard'));

    // Fire hydrant launches to a gold cassette
    this.addFireHydrant(new FireHydrant(23, 0));
    this.addCassette(new CassetteTape(23, 6.2, true));

    // Pit 1: X 25 to 29 (Gap 4.0 units - requires run jump or grind rail)
    this.addGrindRail(new GrindRail(24.5, 1.4, 7.5));

    // Road 2: X 29 to 51
    this.addPlatform(29, 0, 22, 4, true);
    this.addCheckpoint(new Checkpoint(30.5, 0));

    // Steam Vent & aggressive Skater Dog
    this.addSteamVent(new SteamVent(32, 0));
    this.addEnemy(new SkaterDog(35, 0, 5));

    // Elevated scaffolding platform (一方通行)
    this.addPlatform(36, 2.6, 8, 0.5);
    this.addCassette(new CassetteTape(38, 3.8));
    this.addCassette(new CassetteTape(40, 3.8));
    this.addCassette(new CassetteTape(42, 3.8));
    this.addEnemy(new SecurityBot(40, 2.6, 2.5));

    this.addObstacle(new StreetObstacle(46, 0, 'trash_can'));

    // Pit 2: X 51 to 55 (Gap 4.0 units)
    // Road 3: X 55 to 78
    this.addPlatform(55, 0, 23, 4, true);
    this.addCheckpoint(new Checkpoint(56.5, 0));

    // Stepping subway entrance stairs guarded by Drone & Security Bot
    this.addPlatform(58, 1.6, 5, 1.6);
    this.addPlatform(63, 3.0, 5, 3.0);
    this.addEnemy(new SurveillanceDrone(61, 4.8, 5));
    this.addEnemy(new SecurityBot(66, 3.0, 2.5));

    // High secret route blocks
    this.addBlock(new StageBlock(68, 6.2, 'brick'));
    this.addBlock(new StageBlock(70, 6.2, 'question'));
    this.addBlock(new StageBlock(72, 6.2, 'brick'));

    // Intermittent security laser grid before pit 3
    this.addLaserGrid(new LaserGrid(74, 0, 3.0, 1.15, true));

    // Pit 3: X 78 to 82 (Gap 4.0 units)
    // Road 4: X 82 to 112
    this.addPlatform(82, 0, 30, 4, true);
    this.addCheckpoint(new Checkpoint(83.5, 0));

    this.addEnemy(new SkaterDog(90, 0, 6));
    this.addEnemy(new SurveillanceDrone(96, 4.5, 6));

    // Trash can obstacle & Grind Rail 2
    this.addObstacle(new StreetObstacle(86, 0, 'trash_can'));
    this.addGrindRail(new GrindRail(88, 1.2, 8.0));

    // Brick stairs & Cassettes
    this.addBlock(new StageBlock(98, 3.2, 'brick'));
    this.addBlock(new StageBlock(99, 3.2, 'question'));
    this.addBlock(new StageBlock(100, 3.2, 'brick'));

    this.addEnemy(new SecurityBot(106, 0, 3));

    // Subwoofer Bounce Pad before goal!
    this.addSubwoofer(new SubwooferPad(110, 0));

    // Raised stage platforms leading to goal turntable (solid steps)
    this.addPlatform(115, 1.5, 8, 1.5);
    this.addPlatform(123, 2.8, 8, 2.8);
    this.addPlatform(131, 3.5, 14, 3.5);
  }

  // -------------------------------------------------------------
  // STAGE 2: SUBWAY CYPHER (線路と停車中の電車。3つ目の線路はレールカートで渡る)
  // -------------------------------------------------------------
  private buildStage2(): void {
    // Station Platform 1: X -6 to 24
    this.addPlatform(-6, 0, 30, 4);

    this.addBlock(new StageBlock(8, 3.2, 'question'));
    this.addBlock(new StageBlock(10, 3.2, 'question'));
    this.addBlock(new StageBlock(12, 3.2, 'brick'));

    // Steam vent & initial patrol bot
    this.addSteamVent(new SteamVent(14, 0));
    this.addObstacle(new StreetObstacle(17, 0, 'trash_can'));
    this.addEnemy(new SecurityBot(20, 0, 3));

    // Sunken railway track 1 (safe floor at y = -1.0) with fast Skater Dog!
    this.addPlatform(24, -1.0, 14, 3);
    this.addEnemy(new SkaterDog(28, -1.0, 5));

    // Parked Subway Train 1 (y = 1.8)
    this.addPlatform(26, 1.8, 10, 2.8);
    this.addGrindRail(new GrindRail(27, 2.8, 8.0));
    this.addCassette(new CassetteTape(30, 4.0));
    this.addCassette(new CassetteTape(32, 4.0));

    // Station Platform 2: X 38 to 64
    this.addPlatform(38, 0, 26, 4);
    this.addCheckpoint(new Checkpoint(39.5, 0));

    // SECURITY LASER GRID guarded by Drone!
    this.addLaserGrid(new LaserGrid(43, 0, 3.5, 1.15, false));
    this.addEnemy(new SurveillanceDrone(45, 4.2, 5));
    this.addEnemy(new SecurityBot(50, 0, 3.5));
    this.addEnemy(new SkaterDog(56, 0, 5));

    // Overhead Walkway (一方通行)
    this.addPlatform(49, 2.6, 7, 0.5);
    this.addBlock(new StageBlock(51, 5.6, 'question', true)); // Hidden Gold Cassette!
    this.addBlock(new StageBlock(53, 5.6, 'brick'));

    // Sunken track 2: X 64 to 76 with patrolling Skater Dog!
    this.addPlatform(64, -1.0, 12, 3);
    this.addEnemy(new SkaterDog(68, -1.0, 4.5));

    // Parked Subway Train 2:
    this.addPlatform(66, 1.8, 8, 2.8);
    this.addEnemy(new SurveillanceDrone(70, 4.2, 4));

    // Station Platform 3: X 76 to 104
    this.addPlatform(76, 0, 28, 4);
    this.addCheckpoint(new Checkpoint(77.5, 0));

    this.addBlock(new StageBlock(82, 3.2, 'question'));
    this.addBlock(new StageBlock(84, 3.2, 'brick'));
    this.addBlock(new StageBlock(86, 3.2, 'question'));

    this.addEnemy(new SecurityBot(88, 0, 3.5));
    this.addLaserGrid(new LaserGrid(92, 0, 3.2, 1.15, true));

    // Subwoofer Bounce Pad
    this.addSubwoofer(new SubwooferPad(98, 0));

    // Sunken track 3: X 104 to 118。レールと床を撤去し、動く床のみの奈落エリアにする(落ちたらデス)
    this.addMovingPlatform(new MovingPlatform(108, 0.5, 5.0, 4.0, 0, 1.6, 'gondola'));

    // Final Concourse Platform: X 118 to 150
    this.addPlatform(118, 0, 32, 4);
    this.addCheckpoint(new Checkpoint(119.5, 0));
    // Double Laser Grid: one crouch slide, one high barrier
    this.addLaserGrid(new LaserGrid(123, 0, 3.2, 1.15, true));
    this.addLaserGrid(new LaserGrid(129, 0, 3.2, 2.3, false));
    this.addEnemy(new SecurityBot(126, 0, 3.0));
    this.addEnemy(new SkaterDog(134, 0, 5));

    this.addPlatform(136, 1.5, 8, 1.5);
    this.addPlatform(144, 3.5, 12, 3.5);

    this.addTrackRails([[24, 38], [64, 76]], -1.0);
  }

  /** 線路の飾り(判定なし)。ソリッドな床の上に細いレールを2本敷く */
  private addTrackRails(spans: [number, number][], floorY: number): void {
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6b7378, metalness: 0.8, roughness: 0.4 });
    for (const [x0, x1] of spans) {
      for (const z of [-0.7, 0.7]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.06, 0.08), railMat);
        rail.position.set((x0 + x1) / 2, floorY + 0.03, z);
        this.bgGroup.add(rail);
      }
    }
  }

  // -------------------------------------------------------------
  // STAGE 3: ROOFTOP SKYLINE (ビルの谷間。崩れる足場板とゴンドラで渡る縦の動きの面)
  // -------------------------------------------------------------
  private buildStage3(): void {
    // Rooftop 1: X -6 to 22
    this.addPlatform(-6, 0, 28, 4);

    this.addBlock(new StageBlock(7, 3.2, 'question'));
    this.addBlock(new StageBlock(9, 3.2, 'brick'));
    this.addBlock(new StageBlock(11, 3.2, 'question'));

    this.addObstacle(new StreetObstacle(15, 0, 'cardboard'));
    this.addEnemy(new SecurityBot(17, 0, 3));
    this.addFireHydrant(new FireHydrant(20, 0));

    // 崩れる足場板 X 24〜32(面3の固有ギミック)。乗ると約0.5秒で落ちるので立ち止まらずに渡る
    this.addCrumblingPlatform(new CrumblingPlatform(24, 1.6, 2.4));
    this.addCrumblingPlatform(new CrumblingPlatform(27.3, 1.6, 2.4));
    this.addCrumblingPlatform(new CrumblingPlatform(30.6, 1.6, 2.4));
    this.addEnemy(new SurveillanceDrone(27, 4.4, 4));
    this.addCassette(new CassetteTape(26, 2.8));
    this.addCassette(new CassetteTape(28, 2.8));
    this.addCassette(new CassetteTape(30, 2.8));

    // Rooftop 2: X 34 to 51 (動く床とめり込まないよう長さを調整)
    this.addPlatform(34, 2.4, 17, 5);
    this.addCheckpoint(new Checkpoint(35.5, 2.4));
    this.addEnemy(new SkaterDog(40, 2.4, 5));

    // Grind Rail along rooftop parapet
    this.addGrindRail(new GrindRail(36, 3.6, 8.0));

    // High air duct route with Gold Cassette! (一方通行)
    this.addPlatform(42, 5.0, 6, 0.6);
    this.addBlock(new StageBlock(44, 8.0, 'question', true));
    this.addBlock(new StageBlock(46, 8.0, 'brick'));

    this.addEnemy(new SecurityBot(48, 2.4, 3));

    // Fast Moving Gondola Platform over abyss (めり込みを解消した配置: X 55.5〜62.5)
    this.addMovingPlatform(new MovingPlatform(59, 2.2, 5.0, 3.5, 0, 2.0));
    this.addEnemy(new SurveillanceDrone(60, 5.0, 5));

    // Rooftop 3: X 68 to 90
    this.addPlatform(68, 1.5, 22, 5);
    this.addCheckpoint(new Checkpoint(69.5, 1.5));
    this.addBlock(new StageBlock(74, 4.7, 'question'));
    this.addBlock(new StageBlock(76, 4.7, 'brick'));
    this.addEnemy(new SecurityBot(75, 1.5, 3));
    this.addLaserGrid(new LaserGrid(80, 1.5, 3.2, 1.15, true));
    this.addEnemy(new SkaterDog(84, 1.5, 5));

    // Subwoofer Bounce Pad on Rooftop 3!
    this.addSubwoofer(new SubwooferPad(87, 1.5));

    // High Vertical Moving Gondola Platform (床の間に収まる自然な上下動)
    this.addMovingPlatform(new MovingPlatform(93, 2.8, 5.0, 0, 1.6, 2.0));
    this.addEnemy(new SurveillanceDrone(95, 5.2, 5));

    // Rooftop 4: X 101 to 124
    this.addPlatform(101, 2.0, 23, 5);
    this.addCheckpoint(new Checkpoint(102.5, 2.0));
    this.addObstacle(new StreetObstacle(106, 2.0, 'cardboard'));
    this.addEnemy(new SkaterDog(108, 2.0, 5));
    this.addObstacle(new StreetObstacle(112, 2.0, 'cardboard'));
    this.addEnemy(new SecurityBot(118, 2.0, 3));

    // High Grind Rail into Helipad
    this.addGrindRail(new GrindRail(124, 2.4, 10.0));

    // Penthouse Helipad & DJ Stage: X 136 to 158
    this.addPlatform(136, 1.5, 22, 4);
    this.addCheckpoint(new Checkpoint(137.5, 1.5));
    this.addEnemy(new SecurityBot(140, 1.5, 2.5));
    this.addPlatform(144, 2.8, 12, 2.8);
  }

  // -------------------------------------------------------------
  // STAGE 4: NEON BLOCK PARTY (ビートに合わせて交互に点滅するレーザーが主役の総まとめ)
  // -------------------------------------------------------------
  private buildStage4(): void {
    // BGMのテンポに合わせ、4拍(2.5秒)を1周期にする
    const BEAT_PERIOD = 2.5;

    // Neon Boulevard 1: X -6 to 24
    this.addPlatform(-6, 0, 30, 4, true);

    this.addBlock(new StageBlock(6, 3.2, 'question'));
    this.addBlock(new StageBlock(8, 3.2, 'question'));
    this.addBlock(new StageBlock(10, 3.2, 'question'));
    this.addBlock(new StageBlock(12, 3.2, 'brick'));

    this.addFireHydrant(new FireHydrant(15, 0));
    this.addEnemy(new SkaterDog(16, 0, 5));
    this.addObstacle(new StreetObstacle(19, 0, 'cardboard'));
    this.addEnemy(new SecurityBot(21, 0, 2.5));

    // High Neon Speaker Stack with Grind Rail
    this.addPlatform(26, 1.8, 8, 1.8);
    this.addGrindRail(new GrindRail(27, 2.8, 6.0));
    this.addEnemy(new SurveillanceDrone(30, 4.6, 4));

    // Neon Boulevard 2: X 36 to 62
    this.addPlatform(36, 0, 26, 4, true);
    this.addCheckpoint(new Checkpoint(37.5, 0));

    // ビート同期レーザー(交互に点滅する2連)
    this.addLaserGrid(new LaserGrid(40, 0, 3.5, 1.15, true, { period: BEAT_PERIOD, phase: 0 }));
    this.addLaserGrid(new LaserGrid(52, 0, 3.0, 1.15, true, { period: BEAT_PERIOD, phase: 0.5 }));
    this.addEnemy(new SecurityBot(44, 0, 3));

    // Gimmick: Steam Vent & High Secret Gold Cassette (一方通行)
    this.addSteamVent(new SteamVent(46, 0));
    this.addPlatform(48, 2.8, 6, 0.6);
    this.addBlock(new StageBlock(50, 5.8, 'question', true));

    this.addEnemy(new SkaterDog(57, 0, 3));
    this.addEnemy(new SurveillanceDrone(58, 4.6, 5));

    // Fast Moving Gondola Platform over Neon Abyss
    this.addMovingPlatform(new MovingPlatform(64, 2.0, 7.0, 4.5, 0, 2.5));

    // Neon Boulevard 3: X 76 to 106
    this.addPlatform(76, 0, 30, 4, true);
    this.addCheckpoint(new Checkpoint(77.5, 0));

    this.addBlock(new StageBlock(82, 3.2, 'question'));
    this.addBlock(new StageBlock(84, 3.2, 'brick'));
    this.addBlock(new StageBlock(86, 3.2, 'question'));

    this.addEnemy(new SecurityBot(82, 0, 3));
    this.addEnemy(new SkaterDog(88, 0, 5));

    // Subwoofer Bounce Pad launch!
    this.addSubwoofer(new SubwooferPad(90, 0));

    // High Grind Rail over dual pulsing lasers (ビート同期・交互点滅)
    this.addGrindRail(new GrindRail(93, 2.8, 12.0));
    this.addLaserGrid(new LaserGrid(96, 0, 3.0, 1.15, true, { period: BEAT_PERIOD, phase: 0 }));
    this.addLaserGrid(new LaserGrid(102.5, 0, 3.0, 1.15, true, { period: BEAT_PERIOD, phase: 0.5 }));

    // レール上空に浮遊の敵(ドローン)を追加して、上のレールルートも適正なスリル・難易度にする
    this.addEnemy(new SurveillanceDrone(96.5, 3.9, 3.5));
    this.addEnemy(new SurveillanceDrone(100.5, 4.1, 4.0));
    this.addEnemy(new SurveillanceDrone(105, 4.6, 5));

    // スピーカーの島(X 108〜112): サブウーファーが宙に浮かないよう足場を置く。
    // 島の上のサブウーファーで高く跳ぶと、上空のカセットを取れる。
    this.addPlatform(108, 0, 4, 4, true);
    this.addSubwoofer(new SubwooferPad(110, 0));
    this.addCassette(new CassetteTape(109, 8.0));
    this.addCassette(new CassetteTape(111, 8.0));

    // Stepped Champion Pyramid leading to Grandmaster Turntable (solid steps)
    this.addPlatform(116, 1.5, 8, 1.5);
    this.addEnemy(new SkaterDog(118, 1.5, 3.5));
    this.addPlatform(126, 2.8, 8, 2.8);
    this.addEnemy(new SecurityBot(128, 2.8, 2.5));
    this.addPlatform(136, 3.8, 8, 3.8);
    this.addCassette(new CassetteTape(138, 5.0));
    this.addCassette(new CassetteTape(140, 5.0));

    // Final Grand Stage
    this.addPlatform(146, 2.0, 14, 2.0);
    this.addPlatform(154, 4.0, 14, 4.0);
  }

  // -------------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------------
  public update(dt: number, time: number, focusX?: number): void {
    if (focusX !== undefined) this.updateLampLights(focusX);

    // Rotate goal vinyl turntable
    this.goalTurntable.rotation.y += 1.8 * dt;

    // Update goal boombox animations (pulsing speakers & EQ)
    this.goalBoombox.update(time);

    // Rotate HVAC fans
    this.hvacFans.forEach((f) => {
      f.rotation.z += 15 * dt;
    });

    this.blocks.forEach((b) => b.update(dt));
    this.cassettes.forEach((c) => c.update(dt));
    this.subwoofers.forEach((s) => s.update(dt));
    this.laserGrids.forEach((l) => l.update(dt));
    this.movingPlatforms.forEach((m) => m.update(dt));
    this.crumblingPlatforms.forEach((c) => c.update(dt));
    this.checkpoints.forEach((c) => c.update(dt));

    // Update Steam Vents & Spawn Steam Particles
    this.steamVents.forEach((v) => {
      if (v.update(dt)) {
        if (Math.random() < 0.4) {
          this.particleSystem.spawnSteam(v.x, v.y + 0.1);
        }
      }
    });

    // Spawn water particles for erupted fire hydrants
    this.fireHydrants.forEach((h) => {
      if (h.isErupted && Math.random() < 0.6) {
        this.particleSystem.spawnWater(h.x, h.y + 0.8);
      }
    });

    // Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      proj.update(dt);
      if (proj.isDead) {
        this.scene.remove(proj.mesh);
        proj.mesh.geometry.dispose();
        (proj.mesh.material as THREE.Material).dispose();
        this.projectiles.splice(i, 1);
      }
    }

    // Update Particles
    this.particleSystem.update(dt);

    // Slow drift of dust particles
    const pos = this.dustPoints.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += 0.4 * dt;
      if (pos[i] > 190) pos[i] = -10;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  public getGoalAABB(): BoundingBox2D {
    return {
      x: this.goalX - 2.5,
      y: this.goalY,
      w: 5.0,
      h: 2.5
    };
  }

  // -------------------------------------------------------------
  // COLLISION QUERIES
  // -------------------------------------------------------------
  /** 全ての判定を種類別に列挙する(デバッグ表示用。プレイヤーの判定は呼び出し側で足す) */
  public getCollisionShapes(): CollisionShape[] {
    const shapes: CollisionShape[] = [];

    for (const p of this.platforms) {
      shapes.push({ kind: p.oneWay ? 'oneWay' : 'solid', box: { x: p.x, y: p.y - p.h, w: p.w, h: p.h } });
    }
    for (const m of this.movingPlatforms) shapes.push({ kind: 'oneWay', box: m.getAABB() });
    for (const c of this.crumblingPlatforms) {
      if (c.isActive) shapes.push({ kind: 'oneWay', box: c.getAABB() });
    }
    for (const b of this.blocks) {
      if (!b.isDestroyed) shapes.push({ kind: 'solid', box: b.getAABB() });
    }
    for (const o of this.obstacles) {
      if (!o.isDestroyed) shapes.push({ kind: 'solid', box: o.getAABB() });
    }
    for (const h of this.fireHydrants) {
      shapes.push({ kind: 'solid', box: h.getAABB() });
      const column = h.getColumnAABB();
      if (column) shapes.push({ kind: 'trigger', box: column });
    }
    for (const s of this.subwoofers) shapes.push({ kind: 'solid', box: s.getAABB() });
    for (const v of this.steamVents) {
      if (v.isSteaming) shapes.push({ kind: 'trigger', box: v.getAABB() });
    }
    for (const r of this.grindRails) shapes.push({ kind: 'trigger', box: r.getAABB() });
    for (const c of this.cassettes) {
      if (!c.isCollected) shapes.push({ kind: 'trigger', box: c.getAABB() });
    }
    for (const c of this.checkpoints) shapes.push({ kind: 'trigger', box: c.getAABB() });
    for (const l of this.laserGrids) shapes.push({ kind: 'hazard', box: l.getBeamAABB() });
    for (const e of this.enemies) {
      if (!e.isDead) shapes.push({ kind: 'hazard', box: e.getAABB() });
    }
    for (const p of this.projectiles) {
      if (!p.isDead) shapes.push({ kind: 'hazard', box: p.getAABB() });
    }
    shapes.push({ kind: 'trigger', box: this.getGoalAABB() });
    return shapes;
  }

  /** 弾や敵の横移動を止める壁になる箱(ソリッドのみ。一方通行の板は含まない) */
  private getWallBoxes(): { box: BoundingBox2D; minTopClearance: number }[] {
    const walls: { box: BoundingBox2D; minTopClearance: number }[] = [];
    for (const p of this.platforms) {
      if (p.oneWay) continue;
      walls.push({ box: { x: p.x, y: p.y - p.h, w: p.w, h: p.h }, minTopClearance: 0.3 });
    }
    for (const b of this.blocks) {
      if (!b.isDestroyed) walls.push({ box: b.getAABB(), minTopClearance: 0.2 });
    }
    for (const o of this.obstacles) {
      if (!o.isDestroyed) walls.push({ box: o.getAABB(), minTopClearance: 0.2 });
    }
    for (const h of this.fireHydrants) walls.push({ box: h.getAABB(), minTopClearance: 0.2 });
    for (const s of this.subwoofers) walls.push({ box: s.getAABB(), minTopClearance: 0.2 });
    return walls;
  }

  /** 弾が壁(ソリッド)に当たったか。一方通行の板は弾を止めない */
  public isBlockedBySolid(box: BoundingBox2D): boolean {
    for (const wall of this.getWallBoxes()) {
      const b = wall.box;
      if (box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y) return true;
    }
    return false;
  }

  /**
   * Resolves collision between an enemy and environmental walls
   * (solid platforms, stairs, blocks, street obstacles, hydrants, subwoofers).
   * Reverses enemy direction when colliding with a wall.
   */
  public updateEnemyCollisions(enemy: BaseEnemy): void {
    if (enemy.isDead) return;

    const halfW = enemy.width / 2;
    const eLeft = enemy.x - halfW;
    const eRight = enemy.x + halfW;
    const eBottom = enemy.y;
    const eTop = enemy.y + enemy.height;

    const prevLeft = enemy.prevX - halfW;
    const prevRight = enemy.prevX + halfW;

    for (const { box, minTopClearance } of this.getWallBoxes()) {
      const wLeft = box.x;
      const wRight = box.x + box.w;
      const wTop = box.y + box.h;
      const wBottom = box.y;

      // 足より高くそびえ、体と縦に重なるものだけが壁になる
      if (wTop > eBottom + minTopClearance && wBottom < eTop - 0.2) {
        // Moving right into the wall's left face
        if (prevRight <= wLeft + 0.25 && eRight >= wLeft) {
          enemy.x = wLeft - halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
        // Moving left into the wall's right face
        if (prevLeft >= wRight - 0.25 && eLeft <= wRight) {
          enemy.x = wRight + halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
      }
    }
  }

  // -------------------------------------------------------------
  // VALIDATION (開発時の配置チェック。問題があればコンソールにエラーを出す)
  // -------------------------------------------------------------
  private validateLayout(): void {
    const problems: string[] = [];

    // ゴールのターンテーブル(半径2.8)が足場に完全に支えられているか
    const radius = 2.8;
    const minX = this.goalX - radius;
    const maxX = this.goalX + radius;
    const goalSupported = this.platforms.some((p) => {
      return p.x <= minX && p.x + p.w >= maxX && Math.abs(p.y - this.goalY) <= 0.1;
    });
    if (!goalSupported) {
      problems.push(`ゴールのターンテーブル X=[${minX.toFixed(1)}, ${maxX.toFixed(1)}] Y=${this.goalY} が足場に完全には支えられていません`);
    }

    // 地面に置くものは、真下に足場があるか
    const groundItems: { label: string; x: number; y: number; halfW: number }[] = [
      ...this.subwoofers.map((s) => ({ label: 'サブウーファー', x: s.x, y: s.y, halfW: 0.8 })),
      ...this.fireHydrants.map((h) => ({ label: '消火栓', x: h.x, y: h.y, halfW: 0.4 })),
      ...this.steamVents.map((v) => ({ label: '蒸気口', x: v.x, y: v.y, halfW: 0.5 })),
      ...this.obstacles.map((o) => ({ label: '障害物', x: o.x, y: o.y, halfW: o.width / 2 })),
      ...this.checkpoints.map((c) => ({ label: 'チェックポイント', x: c.x, y: c.y, halfW: 0.3 }))
    ];
    for (const item of groundItems) {
      const supported = this.platforms.some((p) => {
        return p.x <= item.x - item.halfW + 0.01 && p.x + p.w >= item.x + item.halfW - 0.01 && Math.abs(p.y - item.y) <= 0.1;
      });
      if (!supported) {
        problems.push(`${item.label} (X=${item.x}, Y=${item.y}) の真下に足場がありません`);
      }
    }

    for (const p of problems) {
      console.error(`[Stage ${this.stageNumber}] ${p}`);
    }
  }

  /**
   * Calculates a guaranteed safe respawn position on a solid static platform.
   * Ensures the spawn position is never over a pit, laser grid, or thin edge.
   */
  public getSafeRespawnPosition(deathX: number): { x: number; y: number } {
    const solidPlatforms = this.platforms.filter((p) => !p.oneWay);
    const firstPlat = solidPlatforms[0];
    const defaultPos = {
      x: firstPlat ? Math.max(1.5, firstPlat.x + 3.0) : 1.5,
      y: (firstPlat ? firstPlat.y : 0) + 0.3
    };

    if (deathX <= 6.0 || solidPlatforms.length === 0) {
      return defaultPos;
    }

    // Filter wide, stable ground platforms that are at or behind the death point
    const candidates = solidPlatforms
      .filter((p) => p.w >= 6.0 && p.x + 1.5 <= deathX)
      .sort((a, b) => b.x - a.x); // Closest platform behind death point first

    for (const plat of candidates) {
      // Safe padding from both left and right edges of the platform to prevent falling into pits
      const edgePad = Math.min(2.5, plat.w * 0.25);
      const minSafeX = plat.x + edgePad;
      const maxSafeX = plat.x + plat.w - edgePad;

      if (maxSafeX < minSafeX) continue;

      // Respawn 4 units behind death point, clamped safely within this platform's margins
      let spawnX = THREE.MathUtils.clamp(deathX - 4.0, minSafeX, maxSafeX);

      // Avoid active laser grids
      let inLaser = false;
      for (const laser of this.laserGrids) {
        if (spawnX >= laser.x - 1.2 && spawnX <= laser.x + laser.width + 1.2) {
          inLaser = true;
          // Shift away from the laser if possible
          if (laser.x - 2.0 >= minSafeX) {
            spawnX = laser.x - 2.0;
            inLaser = false;
          } else if (laser.x + laser.width + 2.0 <= maxSafeX) {
            spawnX = laser.x + laser.width + 2.0;
            inLaser = false;
          }
          break;
        }
      }

      // Avoid subwoofers and steam vents directly on spawn point
      for (const sub of this.subwoofers) {
        if (Math.abs(sub.x - spawnX) < 1.5) {
          if (spawnX - 2.0 >= minSafeX) spawnX -= 2.0;
          else if (spawnX + 2.0 <= maxSafeX) spawnX += 2.0;
        }
      }

      if (!inLaser) {
        return { x: spawnX, y: plat.y + 0.3 };
      }
    }

    return defaultPos;
  }

  public dispose(): void {
    this.particleSystem.clear();
    this.scene.remove(this.particleSystem.group);
    this.projectiles.forEach((proj) => {
      this.scene.remove(proj.mesh);
      proj.mesh.geometry.dispose();
      (proj.mesh.material as THREE.Material).dispose();
    });
    this.projectiles = [];
    this.platforms.forEach((p) => {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      if (Array.isArray(p.mesh.material)) {
        p.mesh.material.forEach((m) => m.dispose());
      } else {
        p.mesh.material.dispose();
      }
    });
    this.blocks.forEach((b) => {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
    });
    this.cassettes.forEach((c) => {
      this.scene.remove(c.mesh);
    });
    this.obstacles.forEach((o) => {
      this.scene.remove(o.mesh);
    });
    this.enemies.forEach((e) => {
      this.scene.remove(e.mesh);
    });
    this.grindRails.forEach((r) => {
      this.scene.remove(r.mesh);
    });
    this.fireHydrants.forEach((f) => {
      this.scene.remove(f.mesh);
    });
    this.subwoofers.forEach((s) => {
      this.scene.remove(s.mesh);
    });
    this.steamVents.forEach((v) => {
      this.scene.remove(v.mesh);
    });
    this.laserGrids.forEach((l) => {
      this.scene.remove(l.mesh);
    });
    this.movingPlatforms.forEach((m) => {
      this.scene.remove(m.mesh);
    });
    this.crumblingPlatforms.forEach((c) => {
      this.scene.remove(c.mesh);
    });
    this.checkpoints.forEach((c) => {
      this.scene.remove(c.mesh);
    });
    this.spotlights.forEach((s) => {
      this.scene.remove(s);
      this.scene.remove(s.target);
    });
    this.scene.remove(this.bgGroup);
    this.scene.remove(this.goalTurntable);
    this.scene.remove(this.goalBoombox.mesh);
    this.scene.remove(this.dustPoints);
    this.dustPoints.geometry.dispose();
  }
}
