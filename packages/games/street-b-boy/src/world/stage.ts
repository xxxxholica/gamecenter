import * as THREE from 'three';
import { BoundingBox2D } from '../entities/player';
import {
  CassetteTape, StageBlock, StreetObstacle, ParticleSystem,
  GrindRail, FireHydrant, SubwooferPad, SteamVent, LaserGrid, MovingPlatform
} from '../entities/objects';
import { BaseEnemy, SecurityBot, SkaterDog, SurveillanceDrone, EnemyProjectile } from '../entities/enemies';
import { BoomboxModel } from './boombox';
import { TextureGenerator } from './textures';

export interface Platform {
  x: number;
  y: number;
  w: number;
  h: number;
  mesh: THREE.Mesh;
}

export class Stage {
  public scene: THREE.Scene;
  public platforms: Platform[] = [];
  public blocks: StageBlock[] = [];
  public cassettes: CassetteTape[] = [];
  public obstacles: StreetObstacle[] = [];
  public enemies: BaseEnemy[] = [];
  public projectiles: EnemyProjectile[] = [];
  public particleSystem: ParticleSystem;

  // New Street Gimmicks
  public grindRails: GrindRail[] = [];
  public fireHydrants: FireHydrant[] = [];
  public subwoofers: SubwooferPad[] = [];
  public steamVents: SteamVent[] = [];
  public laserGrids: LaserGrid[] = [];
  public movingPlatforms: MovingPlatform[] = [];

  public stageNumber: number;
  public stageTitle: string;

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

    const titles: Record<number, { title: string; goalX: number; goalY: number }> = {
      1: { title: 'BRONX STREET', goalX: 138, goalY: 3.5 },
      2: { title: 'SUBWAY CYPHER', goalX: 144, goalY: 3.5 },
      3: { title: 'ROOFTOP SKYLINE', goalX: 148, goalY: 2.8 },
      4: { title: 'NEON BLOCK PARTY', goalX: 160, goalY: 4.0 }
    };

    const cfg = titles[stageNumber] || titles[1];
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
    const dustColor = (stageNumber === 2) ? 0x00ff88 : (stageNumber === 4) ? 0xffea00 : 0x00f0ff;
    const dustMat = new THREE.PointsMaterial({
      color: dustColor,
      size: 0.14,
      transparent: true,
      opacity: 0.5
    });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);

    this.buildLighting();
    this.buildCityBackdrop();
    this.buildLevelContent();
  }

  private buildLighting(): void {
    let ambientHex = 0x384865;
    let hemiSky = 0xaaccff;
    let hemiGround = 0x222633;
    let moonHex = 0xddeeff;

    if (this.stageNumber === 2) {
      ambientHex = 0x284545;
      hemiSky = 0x88eecc;
      hemiGround = 0x182220;
      moonHex = 0xaaffdd;
    } else if (this.stageNumber === 3) {
      ambientHex = 0x353258;
      hemiSky = 0xaa99ff;
      hemiGround = 0x1b1828;
      moonHex = 0xeeccff;
    } else if (this.stageNumber === 4) {
      ambientHex = 0x483a55;
      hemiSky = 0xffccaa;
      hemiGround = 0x2b1e30;
      moonHex = 0xffeebb;
    }

    const ambientLight = new THREE.AmbientLight(ambientHex, 2.3);
    this.scene.add(ambientLight);

    const hemiLight = new THREE.HemisphereLight(hemiSky, hemiGround, 1.4);
    this.scene.add(hemiLight);

    const moonLight = new THREE.DirectionalLight(moonHex, 2.2);
    moonLight.position.set(50, 60, 40);
    this.scene.add(moonLight);

    const lampPositions = [12, 35, 62, 90, 115, this.goalX];
    lampPositions.forEach((lx) => {
      this.createStreetlamp(lx);
    });

    const glowColor = (this.stageNumber === 2) ? 0x00ffaa : (this.stageNumber === 4) ? 0xff0066 : 0xffea00;
    for (let i = 0; i < Stage.ACTIVE_LAMP_LIGHTS; i++) {
      const spot = new THREE.SpotLight(glowColor, 4.5, 16, Math.PI / 4.5, 0.5, 1.2);
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

  private createStreetlamp(x: number): void {
    const lampGroup = new THREE.Group();
    lampGroup.position.set(x, 0, -1.8);

    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 6.5, 12);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f242b, metalness: 0.8, roughness: 0.3 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 3.25;
    pole.castShadow = true;
    lampGroup.add(pole);

    const armGeo = new THREE.BoxGeometry(1.6, 0.1, 0.12);
    const arm = new THREE.Mesh(armGeo, poleMat);
    arm.position.set(0.6, 6.4, 0.6);
    lampGroup.add(arm);

    const headGeo = new THREE.CylinderGeometry(0.35, 0.2, 0.3, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(1.2, 6.25, 0.6);
    lampGroup.add(head);

    const glowColor = (this.stageNumber === 2) ? 0x00ffaa : (this.stageNumber === 4) ? 0xff0066 : 0xffea00;
    const bulbGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const bulbMat = new THREE.MeshBasicMaterial({ color: glowColor });
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(1.2, 6.1, 0.6);
    lampGroup.add(bulb);

    // Volumetric Light Cone
    const coneGeo = new THREE.ConeGeometry(2.0, 6.0, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(1.2, 3.1, 0.6);
    lampGroup.add(cone);

    this.lampXs.push(x);

    this.scene.add(lampGroup);
  }

  private buildCityBackdrop(): void {
    const buildingMat = new THREE.MeshStandardMaterial({ color: 0x090c14, roughness: 0.9 });
    const winMat1 = new THREE.MeshBasicMaterial({ color: 0xffea70 });
    const winMat2 = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // 1. Distant Skyscrapers
    for (let x = -20; x < 190; x += 14 + Math.random() * 8) {
      const w = 10 + Math.random() * 8;
      const h = 25 + Math.random() * 35;
      const d = 12;
      const bGeo = new THREE.BoxGeometry(w, h, d);
      const building = new THREE.Mesh(bGeo, buildingMat);
      building.position.set(x, h / 2 - 2, -24);
      this.bgGroup.add(building);

      for (let wy = 4; wy < h - 4; wy += 3.5) {
        for (let wx = -w / 2 + 2; wx < w / 2 - 2; wx += 2.5) {
          if (Math.random() > 0.45) {
            const winGeo = new THREE.PlaneGeometry(1.0, 1.4);
            const win = new THREE.Mesh(winGeo, Math.random() > 0.3 ? winMat1 : winMat2);
            win.position.set(x + wx, wy, -17.9);
            this.bgGroup.add(win);
          }
        }
      }
    }

    // 2. Rooftop Water Towers (on stages 1, 3, 4)
    if (this.stageNumber !== 2) {
      const wtTex = TextureGenerator.getWaterTowerTexture();
      [28, 76, 122].forEach((wx) => {
        const wtGroup = new THREE.Group();
        wtGroup.position.set(wx, 7.5, -4.5);

        // Wooden Barrel Body
        const bGeo = new THREE.CylinderGeometry(1.8, 1.8, 3.2, 16);
        const bMat = new THREE.MeshStandardMaterial({ map: wtTex, roughness: 0.8 });
        const barrel = new THREE.Mesh(bGeo, bMat);
        barrel.position.y = 2.4;
        wtGroup.add(barrel);

        // Conical Roof
        const rGeo = new THREE.ConeGeometry(2.1, 1.4, 16);
        const rMat = new THREE.MeshStandardMaterial({ color: 0x332211, roughness: 0.6 });
        const roof = new THREE.Mesh(rGeo, rMat);
        roof.position.y = 4.7;
        wtGroup.add(roof);

        // 4 Steel Legs
        const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8 });
        [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([lx, lz]) => {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.position.set(lx, 1.2, lz);
          wtGroup.add(leg);
        });

        this.bgGroup.add(wtGroup);
      });
    }

    // 3. HVAC Outdoor Air Conditioner Units with Rotating Fans
    [15, 52, 98, 132].forEach((hx) => {
      const hvacGroup = new THREE.Group();
      hvacGroup.position.set(hx, 3.5, -3.2);

      const boxGeo = new THREE.BoxGeometry(1.6, 1.3, 1.0);
      const boxMat = new THREE.MeshStandardMaterial({ color: 0x333a44, metalness: 0.7, roughness: 0.4 });
      const box = new THREE.Mesh(boxGeo, boxMat);
      hvacGroup.add(box);

      // Fan Grille & Rotating Blade
      const fanGeo = new THREE.BoxGeometry(0.8, 0.08, 0.04);
      const fanMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
      const fan = new THREE.Mesh(fanGeo, fanMat);
      fan.position.set(0, 0, 0.52);
      hvacGroup.add(fan);
      this.hvacFans.push(fan);

      this.bgGroup.add(hvacGroup);
    });

    // 4. Midground Walls (Subway Tiles or Graffiti Bricks)
    if (this.stageNumber === 2) {
      const tileTex = TextureGenerator.getSubwayTileTexture();
      tileTex.repeat.set(3, 1);
      for (let x = -10; x < 180; x += 18) {
        const wallGeo = new THREE.BoxGeometry(18, 9, 0.6);
        const wallMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.5 });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(x + 9, 4.5, -2.6);
        this.bgGroup.add(wall);
      }
    } else {
      const graffitiTags = ['STREET B-BOY', 'HIP HOP', 'BREAK', 'CYPHER', '90s BEATS', 'BRONX'];
      for (let x = -10; x < 180; x += 18) {
        const tag = graffitiTags[Math.abs(Math.floor(x / 18)) % graffitiTags.length];
        const wallGeo = new THREE.BoxGeometry(18, 9, 0.6);
        const wallMat = new THREE.MeshStandardMaterial({
          map: TextureGenerator.getBrickWallWithGraffiti(tag),
          roughness: 0.8
        });
        const wall = new THREE.Mesh(wallGeo, wallMat);
        wall.position.set(x + 9, 4.5, -2.6);
        this.bgGroup.add(wall);
      }
    }

    // 5. Neon Billboards
    if (this.stageNumber === 3 || this.stageNumber === 4) {
      const bText = (this.stageNumber === 3) ? 'ROOFTOP CYPHER' : 'KING OF BREAKS';
      const bGeo = new THREE.BoxGeometry(12, 5, 0.4);
      const bMat = new THREE.MeshStandardMaterial({
        map: TextureGenerator.getNeonBillboardTexture(bText),
        roughness: 0.3
      });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      bMesh.position.set(45, 9.5, -3.2);
      this.bgGroup.add(bMesh);

      const bMesh2 = new THREE.Mesh(bGeo, bMat);
      bMesh2.position.set(105, 9.5, -3.2);
      this.bgGroup.add(bMesh2);
    }
  }

  public addPlatform(x: number, y: number, w: number, h: number, isAsphalt: boolean = false): void {
    const geo = new THREE.BoxGeometry(w, h, 2.8);
    let mat: THREE.Material;

    if (isAsphalt) {
      const tex = TextureGenerator.getAsphaltRoadTexture();
      tex.repeat.set(w / 4, 1);
      mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: (this.stageNumber === 2) ? 0x222e28 : (this.stageNumber === 3) ? 0x222632 : 0x2b323d,
        roughness: 0.7
      });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + w / 2, y - h / 2, 0);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.platforms.push({ x, y, w, h, mesh });
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

  // -------------------------------------------------------------
  // LEVEL LAYOUT BUILDER (4 DIVERSE, GIMMICK-PACKED STAGES)
  // -------------------------------------------------------------
  private buildLevelContent(): void {
    switch (this.stageNumber) {
      case 1:
        this.buildStage1();
        break;
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
    }
  }

  // -------------------------------------------------------------
  // STAGE 1: BRONX STREET (Starter with Grind Rail, Drones & Fire Hydrant)
  // -------------------------------------------------------------
  private buildStage1(): void {
    // Road 1: X -6 to 25
    this.addPlatform(-6, 0, 31, 4, true);

    // Intro Question & Brick Blocks
    this.addBlock(new StageBlock(8, 3.2, 'question'));
    this.addBlock(new StageBlock(10, 3.2, 'brick'));
    this.addBlock(new StageBlock(12, 3.2, 'question'));
    this.addBlock(new StageBlock(14, 3.2, 'brick'));

    // Cardboard obstacles & patrolling enemies
    this.addObstacle(new StreetObstacle(17.5, 0, 'cardboard'));
    this.addEnemy(new SecurityBot(20.5, 0, 2.0));

    // Street Gimmick 1: Fire Hydrant moved further in to X = 23 with Gold Cassette launcher!
    this.addFireHydrant(new FireHydrant(23, 0));
    this.addCassette(new CassetteTape(23, 6.2, true)); // Gold Cassette!

    // Pit 1: X 25 to 29 (Gap 4.0 units - requires run jump or grind rail)
    this.addGrindRail(new GrindRail(24.5, 1.4, 7.5));

    // Road 2: X 29 to 51
    this.addPlatform(29, 0, 22, 4, true);

    // Steam Vent & aggressive Skater Dog
    this.addSteamVent(new SteamVent(32, 0));
    this.addEnemy(new SkaterDog(35, 0, 5));

    // Elevated scaffolding platform
    this.addPlatform(36, 2.6, 8, 0.5);
    this.addCassette(new CassetteTape(38, 3.8));
    this.addCassette(new CassetteTape(40, 3.8));
    this.addCassette(new CassetteTape(42, 3.8));
    this.addEnemy(new SecurityBot(40, 2.6, 2.5));

    this.addObstacle(new StreetObstacle(46, 0, 'trash_can'));

    // Pit 2: X 51 to 55 (Gap 4.0 units)
    // Road 3: X 55 to 78
    this.addPlatform(55, 0, 23, 4, true);

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
  // STAGE 2: SUBWAY CYPHER (Subway Tracks, Rails, Shooting Bots, Lasers)
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

    // SECURITY LASER GRID guarded by Drone!
    this.addLaserGrid(new LaserGrid(43, 0, 3.5, 1.15, false));
    this.addEnemy(new SurveillanceDrone(45, 4.2, 5));
    this.addEnemy(new SecurityBot(50, 0, 3.5));
    this.addEnemy(new SkaterDog(56, 0, 5));

    // Overhead Walkway
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

    this.addBlock(new StageBlock(82, 3.2, 'question'));
    this.addBlock(new StageBlock(84, 3.2, 'brick'));
    this.addBlock(new StageBlock(86, 3.2, 'question'));

    this.addEnemy(new SecurityBot(88, 0, 3.5));
    this.addLaserGrid(new LaserGrid(92, 0, 3.2, 1.15, true));

    // Subwoofer Bounce Pad
    this.addSubwoofer(new SubwooferPad(98, 0));

    // Sunken track 3: X 104 to 118
    this.addPlatform(104, -1.0, 14, 3);
    this.addEnemy(new SkaterDog(108, -1.0, 5));
    this.addGrindRail(new GrindRail(105, 1.4, 11.0));

    // Final Concourse Platform: X 118 to 150
    this.addPlatform(118, 0, 32, 4);
    // Double Laser Grid: one crouch slide, one high barrier
    this.addLaserGrid(new LaserGrid(123, 0, 3.2, 1.15, true));
    this.addLaserGrid(new LaserGrid(129, 0, 3.2, 2.3, false));
    this.addEnemy(new SecurityBot(126, 0, 3.0));
    this.addEnemy(new SkaterDog(134, 0, 5));

    this.addPlatform(136, 1.5, 8, 1.5);
    this.addPlatform(144, 3.5, 12, 3.5);
  }

  // -------------------------------------------------------------
  // STAGE 3: ROOFTOP SKYLINE (High Speed Gondolas, Drones & Abyss)
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

    // Scaffolding Bridge 1: X 24 to 32 over the sky gap!
    this.addPlatform(24, 1.6, 8, 0.6);
    this.addEnemy(new SurveillanceDrone(27, 4.4, 4));
    this.addCassette(new CassetteTape(26, 2.8));
    this.addCassette(new CassetteTape(28, 2.8));
    this.addCassette(new CassetteTape(30, 2.8));

    // Rooftop 2: X 34 to 54
    this.addPlatform(34, 2.4, 20, 5);
    this.addEnemy(new SkaterDog(40, 2.4, 5));

    // Grind Rail along rooftop parapet
    this.addGrindRail(new GrindRail(36, 3.6, 8.0));

    // High air duct route with Gold Cassette!
    this.addPlatform(42, 5.0, 6, 0.6);
    this.addBlock(new StageBlock(44, 8.0, 'question', true));
    this.addBlock(new StageBlock(46, 8.0, 'brick'));

    this.addEnemy(new SecurityBot(48, 2.4, 3));

    // Fast Moving Gondola Platform over abyss (speed 2.4)
    this.addMovingPlatform(new MovingPlatform(56, 2.2, 6.0, 4.0, 0, 2.4));
    this.addEnemy(new SurveillanceDrone(60, 5.0, 5));

    // Rooftop 3: X 68 to 90
    this.addPlatform(68, 1.5, 22, 5);
    this.addBlock(new StageBlock(74, 4.7, 'question'));
    this.addBlock(new StageBlock(76, 4.7, 'brick'));
    this.addEnemy(new SecurityBot(75, 1.5, 3));
    this.addLaserGrid(new LaserGrid(80, 1.5, 3.2, 1.15, true));
    this.addEnemy(new SkaterDog(84, 1.5, 5));

    // Subwoofer Bounce Pad on Rooftop 3!
    this.addSubwoofer(new SubwooferPad(87, 1.5));

    // High Vertical Moving Gondola Platform (speed 2.6)
    this.addMovingPlatform(new MovingPlatform(92, 2.2, 6.0, 0, 2.4, 2.6));
    this.addEnemy(new SurveillanceDrone(95, 5.2, 5));

    // Rooftop 4: X 101 to 124
    this.addPlatform(101, 2.0, 23, 5);
    this.addObstacle(new StreetObstacle(106, 2.0, 'cardboard'));
    this.addEnemy(new SkaterDog(108, 2.0, 5));
    this.addObstacle(new StreetObstacle(112, 2.0, 'cardboard'));
    this.addEnemy(new SecurityBot(118, 2.0, 3));

    // High Grind Rail into Helipad
    this.addGrindRail(new GrindRail(124, 2.4, 10.0));

    // Penthouse Helipad & DJ Stage: X 136 to 158
    this.addPlatform(136, 1.5, 22, 4);
    this.addEnemy(new SecurityBot(140, 1.5, 2.5));
    this.addPlatform(144, 2.8, 12, 2.8);
  }

  // -------------------------------------------------------------
  // STAGE 4: NEON BLOCK PARTY (Full Gimmick Master Gauntlet)
  // -------------------------------------------------------------
  private buildStage4(): void {
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

    // Blinking Laser Grid obstacle
    this.addLaserGrid(new LaserGrid(40, 0, 3.5, 1.15, true));
    this.addEnemy(new SecurityBot(44, 0, 3));

    // Gimmick: Steam Vent & High Secret Gold Cassette
    this.addSteamVent(new SteamVent(46, 0));
    this.addPlatform(48, 2.8, 6, 0.6);
    this.addBlock(new StageBlock(50, 5.8, 'question', true));

    this.addEnemy(new SkaterDog(52, 0, 6));
    this.addEnemy(new SurveillanceDrone(56, 4.6, 5));

    // Fast Moving Gondola Platform over Neon Abyss
    this.addMovingPlatform(new MovingPlatform(64, 2.0, 7.0, 4.5, 0, 2.5));

    // Neon Boulevard 3: X 76 to 106
    this.addPlatform(76, 0, 30, 4, true);

    this.addBlock(new StageBlock(82, 3.2, 'question'));
    this.addBlock(new StageBlock(84, 3.2, 'brick'));
    this.addBlock(new StageBlock(86, 3.2, 'question'));

    this.addEnemy(new SecurityBot(82, 0, 3));
    this.addEnemy(new SkaterDog(88, 0, 5));

    // Subwoofer Bounce Pad launch!
    this.addSubwoofer(new SubwooferPad(90, 0));

    // High Grind Rail over dual pulsing lasers!
    this.addGrindRail(new GrindRail(93, 2.8, 12.0));
    this.addLaserGrid(new LaserGrid(96, 0, 3.0, 1.15, true));
    this.addLaserGrid(new LaserGrid(103, 0, 3.0, 1.15, false));

    this.addEnemy(new SecurityBot(102, 0, 3));
    this.addEnemy(new SurveillanceDrone(105, 4.6, 5));

    // Gimmick: Dual Subwoofer Ramp
    this.addSubwoofer(new SubwooferPad(110, 0));

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

    // Update Stage Blocks
    this.blocks.forEach((b) => b.update(dt));

    // Update Cassettes
    this.cassettes.forEach((c) => c.update(dt));

    // Update Subwoofers
    this.subwoofers.forEach((s) => s.update(dt));

    // Update Laser Grids
    this.laserGrids.forEach((l) => l.update(dt));

    // Update Moving Platforms
    this.movingPlatforms.forEach((m) => m.update(dt));

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
      x: this.goalX - 2.0,
      y: this.goalY,
      w: 4.0,
      h: 2.0
    };
  }

  /**
   * Calculates a guaranteed safe respawn position on a solid static platform.
   * Ensures the spawn position is never over a pit, laser grid, or thin edge.
   */
  public getSafeRespawnPosition(deathX: number): { x: number; y: number } {
    const firstPlat = this.platforms[0];
    const defaultPos = {
      x: firstPlat ? Math.max(1.5, firstPlat.x + 3.0) : 1.5,
      y: (firstPlat ? firstPlat.y : 0) + 0.3
    };

    if (deathX <= 6.0 || this.platforms.length === 0) {
      return defaultPos;
    }

    // Filter wide, stable ground platforms that are at or behind the death point
    const candidates = this.platforms
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

  /**
   * Resolves collision between an enemy and environmental walls
   * (platforms, stairs, blocks, and street obstacles).
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

    // 1. Check Platforms (Elevated platform walls / steps)
    for (const plat of this.platforms) {
      const platLeft = plat.x;
      const platRight = plat.x + plat.w;
      const platTop = plat.y;
      const platBottom = plat.y - plat.h;

      // Platform acts as a wall if it rises higher than the enemy's feet
      // and overlaps the enemy's vertical body
      if (platTop > eBottom + 0.3 && platBottom < eTop - 0.2) {
        // Moving right into platform's left wall
        if (prevRight <= platLeft + 0.25 && eRight >= platLeft) {
          enemy.x = platLeft - halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
        // Moving left into platform's right wall
        if (prevLeft >= platRight - 0.25 && eLeft <= platRight) {
          enemy.x = platRight + halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
      }
    }

    // 2. Check Blocks (Question blocks & Brick blocks)
    for (const block of this.blocks) {
      if (block.isDestroyed) continue;
      const bBox = block.getAABB();
      const bLeft = bBox.x;
      const bRight = bBox.x + bBox.w;
      const bTop = bBox.y + bBox.h;
      const bBottom = bBox.y;

      if (bTop > eBottom + 0.2 && bBottom < eTop - 0.2) {
        // Moving right into block
        if (prevRight <= bLeft + 0.25 && eRight >= bLeft) {
          enemy.x = bLeft - halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
        // Moving left into block
        if (prevLeft >= bRight - 0.25 && eLeft <= bRight) {
          enemy.x = bRight + halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
      }
    }

    // 3. Check Breakable Street Obstacles (Trash cans, Cardboard boxes)
    for (const obs of this.obstacles) {
      if (obs.isDestroyed) continue;
      const oBox = obs.getAABB();
      const oLeft = oBox.x;
      const oRight = oBox.x + oBox.w;
      const oTop = oBox.y + oBox.h;
      const oBottom = oBox.y;

      if (oTop > eBottom + 0.2 && oBottom < eTop - 0.2) {
        // Moving right into obstacle
        if (prevRight <= oLeft + 0.25 && eRight >= oLeft) {
          enemy.x = oLeft - halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
        // Moving left into obstacle
        if (prevLeft >= oRight - 0.25 && eLeft <= oRight) {
          enemy.x = oRight + halfW;
          enemy.reverseDirection();
          enemy.mesh.position.x = enemy.x;
          return;
        }
      }
    }
  }

  public dispose(): void {
    this.particleSystem.clear();
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
