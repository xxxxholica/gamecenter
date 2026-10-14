import * as THREE from 'three';
import { BoundingBox2D } from '../entities/player';
import {
  CassetteTape, StageBlock, StreetObstacle, ParticleSystem,
  GrindRail, FireHydrant, SubwooferPad, SteamVent, LaserGrid, MovingPlatform,
  CrumblingPlatform, Checkpoint, VerticalLaserTrap
} from '../entities/objects';
import { BaseEnemy, SkaterDog, EnemyProjectile, DOG_HORDE } from '../entities/enemies';
import type { DogTerrain } from '../entities/enemies';
import { HordeSpawner, FINAL_HORDE } from '../entities/horde';
import { buildHeavenBackdrop, createReturnSky } from './heaven';
import type { HordeConfig } from '../entities/horde';
import { BoomboxModel } from './boombox';
import { TextureGenerator } from './textures';
import { CollisionShape, ONE_WAY_MAX_THICKNESS } from '../engine/collision';
import { buildStage1, buildStage2, buildStage3, buildStage4, buildStage5 } from './stageLayouts';

export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  mesh: THREE.Mesh;
  /** 薄い足場板。下からは通り抜け、上からだけ着地できる */
  oneWay: boolean;
}

export type BackdropTheme = 'bronx' | 'subway' | 'rooftop' | 'neon' | 'heaven';

/** ステージを持たない(またはステージが空を指定しない)ときの、夜の街の背景と霧 */
export const DEFAULT_BACKGROUND = 0x05070c;
export const DEFAULT_FOG_DENSITY = 0.018;

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
  /** 後ろから犬の大群が追ってくるステージの設定(無ければ大群なし) */
  horde?: HordeConfig;
  /** 画面全体の空と霧(無ければ夜の街の既定)。heaven は空のグラデーションを背景にする */
  sky?: { fogColor: number; fogDensity: number };
  /** BGMの種類(無ければ街のブーンバップ) */
  bgm?: 'heaven';
  /** 環境光・半球光・太陽の強さにかける倍率(無ければ1)。明るい色の空間で白飛びしないように下げる */
  lightScale?: number;
  /** ゴール裏の巨大ラジカセの大きさ(既定 1.8)。縦穴のように狭い所では小さくして、レーザーが見えるようにする */
  goalBoomboxScale?: number;
  /** 縦穴を落ちた先に、1面の舞台(夜の街)が現れる。街の背景を置き始める X。省略すると無し */
  homeStreetX?: number;
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
  },
  5: {
    title: 'FINAL: HEAVEN RUSH', theme: 'heaven', goalX: 362, goalY: 0, timeLimit: 100, tempo: 124,
    // 眩しい白金の光に包まれた天国。環境光は明るい白金、太陽は温かい金色
    ambientHex: 0xfff1d0, hemiSky: 0xffffff, hemiGround: 0xffe3a8, moonHex: 0xfff0c0,
    glowColor: 0xffd54a, dustColor: 0xfff2a0, lampXs: [], lampStyle: 'pole',
    platformColor: 0xe8dcc0, horde: FINAL_HORDE, sky: { fogColor: 0xfff0d0, fogDensity: 0.004 }, bgm: 'heaven', lightScale: 0.55, homeStreetX: 338.5
  }
};

/** 全ステージ数。最後のステージが FINAL STAGE */
export const FINAL_STAGE = 5;

export class Stage implements DogTerrain {
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
  public verticalLaserTraps: VerticalLaserTrap[] = [];
  public movingPlatforms: MovingPlatform[] = [];
  public crumblingPlatforms: CrumblingPlatform[] = [];
  public checkpoints: Checkpoint[] = [];

  public stageNumber: number;
  public stageTitle: string;
  public readonly config: StageConfig;

  // 後ろから追ってくる犬の大群(ファイナルのみ)
  private horde: HordeSpawner | null = null;
  private hordeEndX = Infinity;
  /** 縦穴(落下してゴールする区間)。あればカメラがその区間では穴を映して、落下の先を見せる */
  public dropShaft: {
    x0: number; x1: number; topY: number;
    /** 縦穴の中の落下速度の上限(m/s) */
    fallSpeedLimit: number;
    /** これより下へ落ちると、1面の街が現れて、操作が効かなくなり、壁が消える */
    revealY: number;
    /** 消える壁(最上段の台と右の壁)の左端の X */
    wallXs: number[];
  } | null = null;
  private shaftVanished = false;
  private hordeDogs: SkaterDog[] = [];

  // Goal turntable & giant boombox
  public goalTurntable: THREE.Mesh;
  public goalBoombox: BoomboxModel;
  public goalX: number = 135;
  public goalY: number = 3.5;

  // Background meshes for parallax
  /** レイアウト(stageLayouts.ts)からも使う */
  public bgGroup: THREE.Group;
  private dustPoints: THREE.Points;
  // 街灯ごとにスポットライトを置くと、画面外の街灯の分まで全画素で光源計算が増える。
  // 同時に画面に映る街灯は多くても2本なので、2灯だけ用意してカメラに近い街灯へ付け替える
  private spotlights: THREE.SpotLight[] = [];
  private lampXs: number[] = [];
  private static readonly ACTIVE_LAMP_LIGHTS = 2;
  private hvacFans: THREE.Mesh[] = [];
  private heavenHalos: THREE.Mesh[] = [];
  /** 天国の空(画面全体の背景)。dispose で解放する */
  private skyTexture: THREE.Texture | null = null;
  private returnSky: { setBlend: (k: number) => void } | null = null;
  /** 天国の背景(雲・柱・光の輪)。1面の街へ戻るとき、上へ遠ざける */
  private heavenGroup: THREE.Group | null = null;
  /** 1面の街の背景(ビル群・壁・街灯)。戻るとき、下から せり上がる */
  private homeGroup: THREE.Group | null = null;
  private returnLights: { ambient: THREE.AmbientLight; hemi: THREE.HemisphereLight; moon: THREE.DirectionalLight } | null = null;
  private returnFog: { heaven: THREE.Color; night: THREE.Color; heavenDensity: number } | null = null;
  /** 背景・ダストを敷く範囲の右端(ゴールの少し先まで。短いステージでは従来の190) */
  private get levelEndX(): number {
    return Math.max(190, this.goalX + 30);
  }

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
    this.horde = cfg.horde ? new HordeSpawner(cfg.horde) : null;
    this.hordeEndX = cfg.horde?.endX ?? Infinity;
    this.applySky();

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
    const boomboxScale = cfg.goalBoomboxScale ?? 1.8;
    this.goalBoombox = new BoomboxModel(boomboxScale);
    this.goalBoombox.mesh.position.set(this.goalX, this.goalY + boomboxScale * (2.5 / 1.8), -2.5);
    this.scene.add(this.goalBoombox.mesh);

    // Ambient dust / spark particles
    const dustGeo = new THREE.BufferGeometry();
    const dustCount = 400;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      dustPos[i * 3] = Math.random() * (this.levelEndX + 10) - 10;
      dustPos[i * 3 + 1] = Math.random() * 20;
      dustPos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({
      color: cfg.dustColor,
      size: cfg.theme === 'heaven' ? 0.22 : 0.14,
      transparent: true,
      opacity: cfg.theme === 'heaven' ? 0.85 : 0.5
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
  /** ステージの空と霧を scene に反映する。heaven は空のグラデーションを背景にする(dispose で夜の街へ戻す) */
  private applySky(): void {
    const sky = this.config.sky;
    if (!sky) return;
    if (this.config.theme === 'heaven') {
      const sky1 = createReturnSky(DEFAULT_BACKGROUND);
      this.skyTexture = sky1.texture;
      this.returnSky = sky1;
      this.scene.background = this.skyTexture;
    }
    this.scene.fog = new THREE.FogExp2(sky.fogColor, sky.fogDensity);
    this.returnFog = { heaven: new THREE.Color(sky.fogColor), night: new THREE.Color(DEFAULT_BACKGROUND), heavenDensity: sky.fogDensity };
  }

  private buildLighting(): void {
    const cfg = this.config;
    // 環境光・月光・街灯は bgGroup に入れる。scene 直下に置くと dispose で消えず、面を進めるたびに光が積み重なって白飛びする
    const k = cfg.lightScale ?? 1;
    const ambientLight = new THREE.AmbientLight(cfg.ambientHex, 2.3 * k);
    this.bgGroup.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(cfg.hemiSky, cfg.hemiGround, 1.4 * k);
    this.bgGroup.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(cfg.moonHex, 2.2 * k);
    moonLight.position.set(50, 60, 40);
    this.bgGroup.add(moonLight);
    this.returnLights = { ambient: ambientLight, hemi: hemiLight, moon: moonLight };

    cfg.lampXs.forEach((lx) => {
      this.createLampFixture(lx);
    });

    for (let i = 0; i < (cfg.lampXs.length > 0 ? Stage.ACTIVE_LAMP_LIGHTS : 0); i++) {
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
      case 'heaven':
        this.heavenGroup = new THREE.Group();
        this.bgGroup.add(this.heavenGroup);
        this.heavenHalos = buildHeavenBackdrop(this.heavenGroup, this.levelEndX).halos;
        if (this.config.homeStreetX !== undefined) this.buildHomeStreetBackdrop(this.config.homeStreetX);
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
  private addMidgroundWall(height: number, material: (x: number) => THREE.Material, startX: number = -6, z: number = -2.6): void {
    for (let x = startX; x < this.levelEndX; x += 18) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(18, height, 0.6), material(x));
      wall.position.set(x + 9, height / 2, z);
      this.bgGroup.add(wall);
    }
    // 左端(x = -6)の終端を綺麗に見せるエンドピラー(境界の柱)
    const endPillarMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.8 });
    const endPillar = new THREE.Mesh(new THREE.BoxGeometry(0.8, height + 1.0, 1.2), endPillarMat);
    endPillar.position.set(startX, (height + 1.0) / 2, z + 0.1);
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

  /**
   * 縦穴の底に現れる、1面(BRONX STREET)と同じ夜の街: 遠景のビル群・落書きのレンガ壁・街灯。
   */
  private buildHomeStreetBackdrop(x0: number): void {
    const before = this.bgGroup.children.length;
    this.buildSkyline({ z: -24, minH: 25, varH: 35, minW: 10, varW: 8, xFrom: x0, xTo: this.levelEndX + 10, stepBase: 14, windowChance: 0.55, color: 0x090c14 });
    const graffitiTags = ['STREET B-BOY', 'HIP HOP', 'BREAK', 'BRONX'];
    this.addMidgroundWall(9, (x) => new THREE.MeshStandardMaterial({
      map: TextureGenerator.getBrickWallWithGraffiti(graffitiTags[Math.abs(Math.floor(x / 18)) % graffitiTags.length]),
      color: 0x8a8a8a,
      roughness: 0.8
    }), x0, -6.2);
    for (const lx of [x0 + 24, x0 + 36]) this.createLampFixture(lx);
    const home = new THREE.Group();
    for (const child of this.bgGroup.children.slice(before)) home.add(child);
    home.position.y = 0;
    home.visible = false;
    this.bgGroup.add(home);
    this.homeGroup = home;
  }

  /** 1面の街へ到達したとき: 通り抜けたレーザーとトラップを消灯する(足場や壁は落下によって画面上外へ自然に見切れる) */
  public vanishShaft(): void {
    const shaft = this.dropShaft;
    if (!shaft || this.shaftVanished) return;
    this.shaftVanished = true;
    for (const laser of this.laserGrids) this.scene.remove(laser.mesh);
    this.laserGrids = [];
    for (const trap of this.verticalLaserTraps) {
      this.scene.remove(trap.mesh);
      trap.dispose();
    }
    this.verticalLaserTraps = [];
  }

  private setGroupFade(group: THREE.Group, alpha: number): void {
    if (alpha <= 0.001) {
      group.visible = false;
      return;
    }
    group.visible = true;
    group.traverse((obj) => {
      if (obj instanceof THREE.Sprite && obj.material) {
        if (obj.userData.baseOpacity === undefined) {
          obj.userData.baseOpacity = obj.material.opacity;
        }
        obj.material.transparent = true;
        obj.material.opacity = obj.userData.baseOpacity * alpha;
      } else if (obj instanceof THREE.Mesh && obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const mat of mats) {
          if (mat.userData.baseOpacity === undefined) {
            mat.userData.baseOpacity = mat.opacity !== undefined ? mat.opacity : 1.0;
          }
          mat.transparent = true;
          mat.opacity = mat.userData.baseOpacity * alpha;
        }
      }
    });
  }

  /**
   * 縦穴を落ちて1面の舞台へ戻る演出。k=0 が天国、k=1 が1面の夜の街。
   * 背景オブジェクトを急激に上下ワープさせず、滑らかなクロスフェードと空・霧のグラデーションで行う。
   */
  public setReturnBlend(k: number): void {
    if (!this.homeGroup || !this.heavenGroup) return;
    const v = Math.min(1, Math.max(0, k));
    const ease = v * v * (3 - 2 * v);

    this.heavenGroup.position.y = 0;
    this.homeGroup.position.y = 0;

    this.setGroupFade(this.heavenGroup, Math.max(0, Math.min(1, 1 - ease * 1.15)));
    this.setGroupFade(this.homeGroup, Math.max(0, Math.min(1, ease * 1.15)));

    this.returnSky?.setBlend(ease);
    const cfg = this.config;
    const night = STAGE_CONFIGS[1];
    if (this.returnLights) {
      const heavenK = cfg.lightScale ?? 1;
      const { ambient, hemi, moon } = this.returnLights;
      ambient.color.set(cfg.ambientHex).lerp(new THREE.Color(night.ambientHex), ease);
      ambient.intensity = 2.3 * (heavenK + (1 - heavenK) * ease);
      hemi.color.set(cfg.hemiSky).lerp(new THREE.Color(night.hemiSky), ease);
      hemi.groundColor.set(cfg.hemiGround).lerp(new THREE.Color(night.hemiGround), ease);
      hemi.intensity = 1.4 * (heavenK + (1 - heavenK) * ease);
      moon.color.set(cfg.moonHex).lerp(new THREE.Color(night.moonHex), ease);
      moon.intensity = 2.2 * (heavenK + (1 - heavenK) * ease);
    }
    if (this.returnFog && this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.returnFog.heaven).lerp(this.returnFog.night, ease);
      this.scene.fog.density = this.returnFog.heavenDensity + (DEFAULT_FOG_DENSITY - this.returnFog.heavenDensity) * ease;
    }
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
    this.buildSkyline({ z: -24, minH: 25, varH: 35, minW: 10, varW: 8, xFrom: -20, xTo: this.levelEndX, stepBase: 14, windowChance: 0.4, color: 0x0d0714 });

    // ネオン格子の壁(低め)。看板が壁の上に見えるようにする
    const gridTex = TextureGenerator.getNeonGridTexture();
    gridTex.repeat.set(6, 2);
    this.addMidgroundWall(6, () => new THREE.MeshStandardMaterial({ map: gridTex, color: 0x9a9a9a, roughness: 0.6 }));

    const billboards = [
      { x: 30, text: 'KING OF BREAKS' },
      { x: 70, text: 'NEON BLOCK PARTY' },
      { x: 112, text: 'GRAND MASTER' },
      { x: 148, text: 'B-BOY FOREVER' },
      // 長いステージ(ファイナル)の後半にも看板を置く
      ...(this.goalX > 200 ? [{ x: 196, text: 'DOG PACK RUSH' }, { x: 244, text: 'NEVER STOP' }, { x: 288, text: 'FINAL BREAK' }] : [])
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
  private static readonly sharedBoltGeo = (() => {
    const g = new THREE.CylinderGeometry(0.024, 0.024, 0.04, 6);
    g.rotateX(Math.PI / 2);
    return g;
  })();
  private static readonly sharedBoltMat = new THREE.MeshStandardMaterial({
    color: 0xd4dadf,
    metalness: 0.95,
    roughness: 0.2,
  });
  private static readonly sharedCurbMat = new THREE.MeshStandardMaterial({ color: 0x8f9598, roughness: 0.85 });
  private static readonly sharedRibMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, metalness: 0.6, roughness: 0.4 });
  private static readonly sharedMetalMatStandard = new THREE.MeshStandardMaterial({
    color: 0x9aa2a8,
    metalness: 0.85,
    roughness: 0.25,
  });
  private static readonly sharedMetalMatHeaven = new THREE.MeshStandardMaterial({
    color: 0xffd86b,
    metalness: 0.85,
    roughness: 0.25,
  });

  public addPlatform(x: number, y: number, w: number, h: number, isAsphalt: boolean = false, oneWay: boolean = h <= ONE_WAY_MAX_THICKNESS, street: boolean = false): void {
    // 粗いローポリ直方体から、セグメント分割された高品位ジオメトリに強化
    const widthSegs = Math.max(1, Math.min(64, Math.round(w * 1.5)));
    const heightSegs = Math.max(1, Math.min(16, Math.round(h * 2)));
    const geo = new THREE.BoxGeometry(w, h, 2.8, widthSegs, heightSegs, 2);
    let mat: THREE.Material;

    if (this.config.theme === 'heaven' && !street) {
      // 天国の足場は、金の縁取りのある白い大理石(street=true なら、1面と同じアスファルトの道にする)
      mat = new THREE.MeshStandardMaterial({ color: this.config.platformColor, roughness: 0.3, metalness: 0.05, emissive: 0x6a6048, emissiveIntensity: 0.6 });
    } else if (isAsphalt) {
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
      const metalMat = this.config.theme === 'heaven' ? Stage.sharedMetalMatHeaven : Stage.sharedMetalMatStandard;
      const dummy = new THREE.Matrix4();

      // 1. 手前上エッジのスチールコーピングパイプ（丸みと光沢のある面取りレール）
      const copingGeo = new THREE.CylinderGeometry(0.045, 0.045, w, 12);
      copingGeo.rotateZ(Math.PI / 2);
      const coping = new THREE.Mesh(copingGeo, metalMat);
      coping.position.set(0, h / 2, 1.4);
      coping.castShadow = true;
      mesh.add(coping);

      // 2. コーピングに一定間隔で打ち込まれた六角ボルト・リベット
      const boltSpacing = 2.0;
      const numBolts = Math.max(2, Math.floor(w / boltSpacing));
      const bolts = new THREE.InstancedMesh(Stage.sharedBoltGeo, Stage.sharedBoltMat, numBolts + 1);
      for (let i = 0; i <= numBolts; i++) {
        const bx = -w / 2 + 0.3 + ((w - 0.6) * i) / numBolts;
        dummy.makeTranslation(bx, h / 2 - 0.02, 1.42);
        bolts.setMatrixAt(i, dummy);
      }
      bolts.instanceMatrix.needsUpdate = true;
      mesh.add(bolts);

      // 3. アスファルト道路の段差縁石（Curb）立体ブロック
      if (isAsphalt) {
        const curbGeo = new THREE.BoxGeometry(w, 0.12, 0.2);
        const curb = new THREE.Mesh(curbGeo, Stage.sharedCurbMat);
        curb.position.set(0, h / 2 - 0.06, 1.35);
        mesh.add(curb);
      }

      // 4. 高さ1.0以上の段差垂直面にある立体サポートリブ / 目地スリット
      if (h >= 1.0) {
        const ribGeo = new THREE.BoxGeometry(0.08, h - 0.12, 0.04);
        const numRibs = Math.max(1, Math.floor(w / 3.2));
        const ribs = new THREE.InstancedMesh(ribGeo, Stage.sharedRibMat, numRibs);
        for (let i = 1; i <= numRibs; i++) {
          const rx = -w / 2 + (w * i) / (numRibs + 1);
          dummy.makeTranslation(rx, 0, 1.42);
          ribs.setMatrixAt(i - 1, dummy);
        }
        ribs.instanceMatrix.needsUpdate = true;
        mesh.add(ribs);
      }

      // 5. 段差の左右端の補強スチールコーナー金具
      const bracketH = Math.min(h, 0.7);
      const bracketGeo = new THREE.BoxGeometry(0.12, bracketH, 0.1);
      const brackets = new THREE.InstancedMesh(bracketGeo, metalMat, 2);
      dummy.makeTranslation(-w / 2 + 0.06, h / 2 - bracketH / 2, 1.4);
      brackets.setMatrixAt(0, dummy);
      dummy.makeTranslation(w / 2 - 0.06, h / 2 - bracketH / 2, 1.4);
      brackets.setMatrixAt(1, dummy);
      brackets.instanceMatrix.needsUpdate = true;
      mesh.add(brackets);
    }

    if (oneWay || this.config.theme === 'neon' || this.config.theme === 'heaven') {
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
    // 犬は足場の上を歩き、段差・壁・穴を見て跳ぶ
    if (enemy instanceof SkaterDog) enemy.terrain = this;
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

  public onVerticalLaserFired?: (x: number, y: number) => void;

  public addVerticalLaserTrap(trap: VerticalLaserTrap): void {
    trap.onFire = (t) => {
      const proj = new EnemyProjectile(t.x, t.y + 0.6, 0, t.speed, true);
      this.projectiles.push(proj);
      this.scene.add(proj.mesh);
      this.particleSystem.spawnSparks(t.x, t.y + 0.6, 6);
      this.onVerticalLaserFired?.(t.x, t.y);
    };
    this.verticalLaserTraps.push(trap);
    this.scene.add(trap.mesh);
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
        buildStage2(this);
        break;
      case 3:
        buildStage3(this);
        break;
      case 4:
        buildStage4(this);
        break;
      case 5:
        buildStage5(this);
        break;
      default:
        buildStage1(this);
        break;
    }
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
    // 天国の光の輪をゆっくり回す
    this.heavenHalos.forEach((h, i) => {
      h.rotation.z += (0.25 + (i % 3) * 0.08) * dt;
    });

    this.blocks.forEach((b) => b.update(dt));
    this.cassettes.forEach((c) => c.update(dt));
    this.subwoofers.forEach((s) => s.update(dt));
    this.laserGrids.forEach((l) => l.update(dt));
    this.verticalLaserTraps.forEach((t) => t.update(dt));
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
      if (pos[i] > this.levelEndX) pos[i] = -10;
    }
    this.dustPoints.geometry.attributes.position.needsUpdate = true;
  }

  // -------------------------------------------------------------
  // 犬のための地形と、後ろから追ってくる大群
  // -------------------------------------------------------------

  /** DogTerrain: x の位置で、高さ fromY〜toY にある最も低い足場の下面(頭上の天井)。無ければ null */
  public ceilingBottom(x: number, fromY: number, toY: number): number | null {
    let best: number | null = null;
    for (const p of this.platforms) {
      const bottom = p.y - p.h;
      if (x >= p.x && x <= p.x + p.w && bottom >= fromY && bottom <= toY && (best === null || bottom < best)) best = bottom;
    }
    return best;
  }

  /** DogTerrain: x の位置で、高さ maxY 以下にある最も高い足場の上面(足場・箱・缶・動く足場など)。無ければ null */
  public supportTop(x: number, maxY: number): number | null {
    let best: number | null = null;
    const consider = (bx: number, bw: number, top: number): void => {
      if (x >= bx && x <= bx + bw && top <= maxY && (best === null || top > best)) best = top;
    };
    for (const p of this.platforms) consider(p.x, p.w, p.y);
    for (const m of this.movingPlatforms) {
      const a = m.getAABB();
      consider(a.x, a.w, a.y + a.h);
    }
    for (const c of this.crumblingPlatforms) {
      if (!c.isActive) continue;
      const a = c.getAABB();
      consider(a.x, a.w, a.y + a.h);
    }
    for (const b of this.blocks) {
      if (b.isDestroyed) continue;
      const a = b.getAABB();
      consider(a.x, a.w, a.y + a.h);
    }
    for (const o of this.obstacles) {
      if (o.isDestroyed) continue;
      const a = o.getAABB();
      consider(a.x, a.w, a.y + a.h);
    }
    for (const sw of this.subwoofers) {
      const a = sw.getAABB();
      consider(a.x, a.w, a.y + a.h);
    }
    return best;
  }

  /**
   * 毎フレーム(プレイヤーが動ける間)。大群の犬を後ろから出し、画面外へ落ちた犬・倒れて時間が経った犬を片付ける。
   * 大群のないステージでも、倒した敵の後片付けだけは行う。
   */
  public updateEnemies(dt: number, playerX: number, playerY: number): void {
    this.hordeDogs = this.hordeDogs.filter((d) => !d.isDead);
    if (this.horde && playerX <= this.hordeEndX) {
      const n = this.horde.update(dt, this.hordeDogs.length);
      if (n > 0) this.spawnHordeDogs(n, playerX, playerY);
    }
    // ゴール前の登りと縦穴には、大群を入れない(穴に落ちてきてゴールの邪魔をしないように)
    for (const d of this.hordeDogs) {
      if (d.x > this.hordeEndX + 8) d.defeat(0, 0);
    }

    // 倒されて飛んでいった・落ちた敵は、しばらく見せてから取り除く(増え続けて重くならないように)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.isDead && (e.deathTimer > 1.6 || e.y < -16)) {
        this.scene.remove(e.mesh);
        this.enemies.splice(i, 1);
      }
    }
  }

  private spawnHordeDogs(count: number, playerX: number, playerY: number): void {
    // ステージ最初の足場の左端より左には出さない(出現できる地面がある所だけ)
    const leftmost = this.platforms.reduce((m, p) => Math.min(m, p.x), Infinity);
    for (let i = 0; i < count; i++) {
      const baseX = playerX - 24 - Math.random() * 10 - i * 1.4;
      // 真後ろが奈落(崩れた足場・動く足場の区間)なら、足場のある所まで後ろへさかのぼって出す。
      // 終盤の足場の渡りでも、大群が途切れないようにする
      for (let back = 0; back < 12; back++) {
        const x = Math.max(baseX - back * 4, leftmost + 1);
        // プレイヤーの高さ付近の足場(遠くの高い屋根の上などには出さない)
        const top = this.supportTop(x, playerY + 4);
        if (top === null) continue;
        const dog = new SkaterDog(x, top, 1, {
          ...DOG_HORDE,
          chaseSpeed: DOG_HORDE.chaseSpeed - 0.8 + Math.random() * 1.6,
          jumpSpeed: DOG_HORDE.jumpSpeed - 0.8 + Math.random() * 1.6,
        });
        dog.setDirection(1);
        this.addEnemy(dog);
        this.hordeDogs.push(dog);
        break;
      }
    }
  }

  /** 後ろから迫る犬の圧力(0=遠い〜1=すぐ後ろ)。警告の演出に使う */
  public getHordePressure(playerX: number): number {
    let nearest = Infinity;
    for (const d of this.hordeDogs) {
      const behind = playerX - d.x;
      if (behind > -2 && behind < nearest) nearest = behind;
    }
    if (!isFinite(nearest)) return 0;
    return Math.min(1, Math.max(0, (16 - nearest) / 12));
  }

  /** ミスして再開するとき: 大群をいったん消し、猶予をおいてからやり直す */
  public resetHorde(graceSeconds: number): void {
    for (const d of this.hordeDogs) {
      this.scene.remove(d.mesh);
      const idx = this.enemies.indexOf(d);
      if (idx >= 0) this.enemies.splice(idx, 1);
    }
    this.hordeDogs = [];
    this.horde?.restartGrace(graceSeconds);
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

    // 動く足場は出発点を中心に ±deltaX / ±deltaY で往復する。その範囲が、普通の足場や崩れる足場に食い込まないこと
    for (const m of this.movingPlatforms) {
      const x0 = m.startX - m.deltaX, x1 = m.startX + m.deltaX + m.width;
      const y0 = m.startY - m.deltaY - m.height, y1 = m.startY + m.deltaY;
      for (const p of this.platforms) {
        if (x0 < p.x + p.w && x1 > p.x && y0 < p.y && y1 > p.y - p.h) {
          problems.push(`動く足場(X ${x0.toFixed(1)}〜${x1.toFixed(1)}, Y ${y0.toFixed(1)}〜${y1.toFixed(1)})が足場(X ${p.x}〜${p.x + p.w}, 上面 Y ${p.y})に食い込みます`);
        }
      }
      for (const c of this.crumblingPlatforms) {
        const cb = c.getAABB();
        if (x0 < cb.x + cb.w && x1 > cb.x && y0 < cb.y + cb.h && y1 > cb.y) {
          problems.push(`動く足場(X ${x0.toFixed(1)}〜${x1.toFixed(1)})が崩れる足場(X ${cb.x})に食い込みます`);
        }
      }
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
    this.verticalLaserTraps.forEach((t) => {
      this.scene.remove(t.mesh);
      t.dispose();
    });
    this.verticalLaserTraps = [];
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
    // 空と霧を夜の街の既定へ戻す(次のステージが空を指定しない場合に備える)
    if (this.config.sky) {
      this.scene.background = new THREE.Color(DEFAULT_BACKGROUND);
      this.scene.fog = new THREE.FogExp2(DEFAULT_BACKGROUND, DEFAULT_FOG_DENSITY);
    }
    this.skyTexture?.dispose();
    this.skyTexture = null;
  }
}
