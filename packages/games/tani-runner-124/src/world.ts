// ============================================================
// World & Course Builder: Running Corridor, Numerical Gates,
// 124 Wall, and the Infinite Multiplier Bonus Runway
// ============================================================

import * as THREE from 'three';
import { TextureGenerator, GateInfo } from './textures.ts';
import { generateGateConfigs, GateConfig } from './gateGenerator.ts';
import { generateCourseItems, generateRings, ObstacleSpec, PickupSpec, RingSpec } from './courseGenerator.ts';
import type { LevelId } from './levels.ts';

export interface WorldObstacle {
  spec: ObstacleSpec;
  mesh: THREE.Group;
  /** 今この瞬間の中心X(揺れる障害物は時間で変わる) */
  currentX: number;
  hit: boolean;
}

export interface WorldPickup {
  spec: PickupSpec;
  mesh: THREE.Group;
  collected: boolean;
}

export interface WorldRing {
  spec: RingSpec;
  mesh: THREE.Mesh;
  hit: boolean;
  /** 通り抜けた生徒の数(一定数でリング成功) */
  passCount: number;
}

/** ボーナス飛行のリング(縦長のゲート)の幅の半分。飛行の高さは連打の回数で大きく変わるので、高さは問わず左右位置だけで判定する */
export const RING_HALF_WIDTH = 2.6;

export interface GatePair {
  z: number;
  leftGate: {
    mesh: THREE.Mesh;
    info: GateInfo;
    passed: boolean;
  };
  rightGate: {
    mesh: THREE.Mesh;
    info: GateInfo;
    passed: boolean;
  };
}

export interface MultiplierZone {
  zStart: number;
  zEnd: number;
  multiplier: number;
  label: string;
}

export class WorldManager {
  public scene: THREE.Scene;

  // Track dimensions
  public trackWidth: number = 10.0;
  public bossWallZ: number = -450.0;
  /** ゲートを置く位置(奥行き)。中身(種類と左右)は開始のたびにランダムに作る */
  private readonly gateZs: number[] = [-45, -95, -150, -205, -260, -315, -370, -415];
  public bonusTrackEndZ: number = -1000.0;

  // Course elements
  public trackMesh: THREE.Mesh | null = null;
  public bonusSegments: THREE.Mesh[] = [];
  public gates: GatePair[] = [];
  public bossWallGroup: THREE.Group | null = null;
  private bossWallFrontMat: THREE.MeshLambertMaterial | null = null;

  /** 卒業要件(壁を破るのに必要な人数)。標準は124で、開始のたびに抽選される */
  public requirement: number = 124;
  /** 今のレベル(ゲートの数式の種類や障害物の厳しさが変わる) */
  public level: LevelId = 'kosen';

  // ゲートの間に置く障害物・アイテム、ボーナス飛行のリング
  public obstacles: WorldObstacle[] = [];
  public pickups: WorldPickup[] = [];
  public rings: WorldRing[] = [];
  private elapsed: number = 0;
  public rampMesh: THREE.Mesh | null = null;

  // Multiplier zones along bonus track
  public multiplierZones: MultiplierZone[] = [
    { zStart: -450, zEnd: -480, multiplier: 1.0, label: '×1.0' },
    { zStart: -480, zEnd: -520, multiplier: 1.2, label: '×1.2' },
    { zStart: -520, zEnd: -570, multiplier: 1.5, label: '×1.5' },
    { zStart: -570, zEnd: -630, multiplier: 2.0, label: '×2.0' },
    { zStart: -630, zEnd: -700, multiplier: 3.0, label: '×3.0' },
    { zStart: -700, zEnd: -780, multiplier: 5.0, label: '×5.0' },
    { zStart: -780, zEnd: -870, multiplier: 10.0, label: '×10.0' },
    { zStart: -870, zEnd: -1000, multiplier: 20.0, label: '×20.0' }
  ];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.buildLighting();
    this.buildCourseTrack();
    this.buildBonusRunway();
    this.regenerateGates();
    this.regenerateItems();
    this.buildBossWall();
  }

  private buildLighting(): void {
    const ambient = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    dirLight.position.set(15, 30, 20);
    dirLight.castShadow = true;
    // 影の範囲は横30m程度なので1024pxで十分(2048pxは影の描き込み・参照ともにGPU負荷が4倍)
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -15;
    dirLight.shadow.camera.right = 15;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    this.scene.add(dirLight);

    // Dynamic track point lights
    const cyanLight = new THREE.PointLight(0x00f0ff, 1.5, 60);
    cyanLight.position.set(0, 8, -150);
    this.scene.add(cyanLight);

    const redLight = new THREE.PointLight(0xff0055, 1.5, 60);
    redLight.position.set(0, 8, -350);
    this.scene.add(redLight);
  }

  // 1. Running Track (-450 to +50: 手前に延長してタイトル画面で見切れないようにする)
  private buildCourseTrack(): void {
    const backExt = 50.0;
    const trackLen = Math.abs(this.bossWallZ) + backExt;
    const centerZ = (this.bossWallZ + backExt) / 2;

    const floorGeo = new THREE.PlaneGeometry(this.trackWidth, trackLen);
    floorGeo.rotateX(-Math.PI / 2);
    const floorTex = TextureGenerator.createFloorTexture();
    floorTex.repeat.set(1, Math.round(trackLen / 11.25));
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });

    this.trackMesh = new THREE.Mesh(floorGeo, floorMat);
    this.trackMesh.position.set(0, 0, centerZ);
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);

    // Side guard rails
    const railGeo = new THREE.BoxGeometry(0.6, 1.8, trackLen);
    const railMat = new THREE.MeshLambertMaterial({ color: 0x1f232e });

    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-this.trackWidth / 2 - 0.3, 0.9, centerZ);
    this.scene.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(this.trackWidth / 2 + 0.3, 0.9, centerZ);
    this.scene.add(rightRail);
  }

  // 2. Bonus Multiplier Runway with Jump Ramp
  private buildBonusRunway(): void {
    // Jump ramp right past the wall (Z = -452 to -456)
    const rampGeo = new THREE.BoxGeometry(this.trackWidth, 1.8, 5.0);
    rampGeo.rotateX(Math.PI / 10);
    const rampMat = new THREE.MeshLambertMaterial({ color: 0xffaa00 });
    this.rampMesh = new THREE.Mesh(rampGeo, rampMat);
    this.rampMesh.position.set(0, 0.5, this.bossWallZ - 3.5);
    this.scene.add(this.rampMesh);

    // Colorful multiplier floor panels along runway
    const colors = ['#8b0000', '#b22222', '#c71585', '#d2691e', '#b8860b', '#006400', '#1e90ff', '#4b0082'];

    this.multiplierZones.forEach((zone, idx) => {
      const len = Math.abs(zone.zEnd - zone.zStart);
      const centerZ = (zone.zStart + zone.zEnd) / 2;

      const segGeo = new THREE.PlaneGeometry(this.trackWidth + 4.0, len);
      segGeo.rotateX(-Math.PI / 2);

      const color = colors[idx % colors.length];
      const tex = TextureGenerator.createBonusSegmentTexture(zone.label, color);
      const segMat = new THREE.MeshLambertMaterial({ map: tex });

      const segMesh = new THREE.Mesh(segGeo, segMat);
      segMesh.position.set(0, 0.02, centerZ);
      segMesh.receiveShadow = true;
      this.scene.add(segMesh);
      this.bonusSegments.push(segMesh);
    });
  }

  // 3. University Mathematics Gates(開始のたびに作り直す)
  public regenerateGates(): void {
    this.disposeGates();
    this.buildGates(generateGateConfigs(this.gateZs, this.requirement, this.level));
  }

  private disposeGates(): void {
    for (const pair of this.gates) {
      for (const gate of [pair.leftGate, pair.rightGate]) {
        this.scene.remove(gate.mesh);
        gate.mesh.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.geometry.dispose();
          const mat = mesh.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
          if (mat.map) mat.map.dispose();
          mat.dispose();
        });
      }
    }
    this.gates = [];
  }

  private buildGates(gateConfigs: GateConfig[]): void {
    const gateW = 4.4;
    const gateH = 3.2;

    const isWhite = this.level === 'kosen';

    gateConfigs.forEach(cfg => {
      // Left Gate
      const leftTex = TextureGenerator.createGateTexture(cfg.left, isWhite);
      const leftMat = new THREE.MeshBasicMaterial({ map: leftTex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const leftMesh = new THREE.Mesh(new THREE.PlaneGeometry(gateW, gateH), leftMat);
      leftMesh.position.set(-2.4, gateH / 2 + 0.1, cfg.z);

      // Right Gate
      const rightTex = TextureGenerator.createGateTexture(cfg.right, isWhite);
      const rightMat = new THREE.MeshBasicMaterial({ map: rightTex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const rightMesh = new THREE.Mesh(new THREE.PlaneGeometry(gateW, gateH), rightMat);
      rightMesh.position.set(2.4, gateH / 2 + 0.1, cfg.z);

      // Frame posts (高専生は全て白フレーム)
      this.addGatePosts(leftMesh, gateW, gateH, cfg.left.isPositive, isWhite);
      this.addGatePosts(rightMesh, gateW, gateH, cfg.right.isPositive, isWhite);

      // どちらも良いゲート: 間に金色の柱を立てる(隊列を分けて両方に通すと両取りできる合図)。高専生は色区別なしのため非表示
      if (!isWhite && cfg.left.isPositive && cfg.right.isPositive) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, gateH, 0.25),
          new THREE.MeshBasicMaterial({ color: 0xffd700 })
        );
        pillar.position.set(2.4, 0, 0);
        leftMesh.add(pillar);
      }

      this.scene.add(leftMesh);
      this.scene.add(rightMesh);

      this.gates.push({
        z: cfg.z,
        leftGate: { mesh: leftMesh, info: cfg.left, passed: false },
        rightGate: { mesh: rightMesh, info: cfg.right, passed: false }
      });
    });
  }

  private addGatePosts(parentMesh: THREE.Mesh, w: number, h: number, isPos: boolean, isWhite: boolean = false): void {
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, h, 8);
    const postMat = new THREE.MeshLambertMaterial({ color: isWhite ? 0xffffff : (isPos ? 0x00d4ff : 0xff1744) });

    const pL = new THREE.Mesh(postGeo, postMat);
    pL.position.set(-w / 2, 0, 0);
    parentMesh.add(pL);

    const pR = new THREE.Mesh(postGeo, postMat);
    pR.position.set(w / 2, 0, 0);
    parentMesh.add(pR);
  }

  // 4. Boss Wall "124"
  private buildBossWall(): void {
    this.bossWallGroup = new THREE.Group();

    const wallW = 10.8;
    const wallH = 6.8;
    const wallD = 2.0;

    const wallGeo = new THREE.BoxGeometry(wallW, wallH, wallD);
    const wallTex = TextureGenerator.createBossWallTexture(this.requirement);
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x221310 });
    const frontMat = new THREE.MeshLambertMaterial({ map: wallTex });
    this.bossWallFrontMat = frontMat;

    const materials = [sideMat, sideMat, sideMat, sideMat, frontMat, sideMat];
    const wallMesh = new THREE.Mesh(wallGeo, materials);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.bossWallGroup.add(wallMesh);

    this.bossWallGroup.position.set(0, wallH / 2, this.bossWallZ);
    this.scene.add(this.bossWallGroup);
  }

  public hideBossWall(): void {
    if (this.bossWallGroup) {
      this.bossWallGroup.visible = false;
    }
  }

  // Get current multiplier based on student Z position
  public getMultiplierAtZ(z: number): { mult: number; label: string } {
    if (z >= this.bossWallZ) {
      return { mult: 1.0, label: '×1.0' };
    }
    for (let i = 0; i < this.multiplierZones.length; i++) {
      const zone = this.multiplierZones[i];
      if (z <= zone.zStart && z >= zone.zEnd) {
        const nextZone = this.multiplierZones[i + 1];
        const nextMult = nextZone ? nextZone.multiplier : zone.multiplier;
        const progress = (zone.zStart - z) / (zone.zStart - zone.zEnd);
        const interpolated = zone.multiplier + (nextMult - zone.multiplier) * progress;
        return { mult: interpolated, label: `×${interpolated.toFixed(1)}` };
      }
    }
    return { mult: 20.0, label: '×20.0' };
  }

  // ------------------------------------------------------------
  // 障害物・アイテム・リング
  // ------------------------------------------------------------
  private disposeObject(root: THREE.Object3D): void {
    this.scene.remove(root);
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh | THREE.Sprite;
      const geo = (mesh as THREE.Mesh).geometry;
      if (geo) geo.dispose();
      const mat = (mesh as THREE.Mesh).material as THREE.Material & { map?: THREE.Texture | null };
      if (mat) {
        if (mat.map) mat.map.dispose();
        mat.dispose();
      }
    });
  }

  public regenerateItems(): void {
    this.obstacles.forEach((o) => this.disposeObject(o.mesh));
    this.pickups.forEach((p) => this.disposeObject(p.mesh));
    this.rings.forEach((r) => this.disposeObject(r.mesh));
    this.obstacles = [];
    this.pickups = [];
    this.rings = [];
    this.elapsed = 0;

    const items = generateCourseItems(this.gateZs, this.level);
    const obstacleTex = TextureGenerator.createObstacleTexture();

    for (const spec of items.obstacles) {
      const group = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(spec.width, 1.7, 0.7),
        new THREE.MeshLambertMaterial({ map: obstacleTex.clone(), color: 0xffffff })
      );
      body.position.y = 0.85;
      group.add(body);
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(body.geometry),
        new THREE.LineBasicMaterial({ color: 0xffffff })
      );
      edges.position.y = 0.85;
      group.add(edges);
      group.position.set(spec.centerX, 0, spec.z);
      this.scene.add(group);
      this.obstacles.push({ spec, mesh: group, currentX: spec.centerX, hit: false });
    }

    for (const spec of items.pickups) {
      const group = new THREE.Group();
      const orb = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0x39ff88, transparent: true, opacity: 0.85 })
      );
      group.add(orb);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: TextureGenerator.createPickupTexture(spec.value), transparent: true }));
      label.scale.set(2.2, 1.1, 1);
      label.position.y = 1.2;
      group.add(label);
      group.position.set(spec.x, 1.0, spec.z);
      this.scene.add(group);
      this.pickups.push({ spec, mesh: group, collected: false });
    }

    for (const spec of generateRings(this.bossWallZ)) {
      // 遠くや高空からも見えるよう、2本の高い柱と飾りの輪でできたゲート
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(RING_HALF_WIDTH, 0.22, 10, 32),
        new THREE.MeshBasicMaterial({ color: 0xffd700 })
      );
      ring.position.set(spec.x, 6.0, spec.z);
      const pillarGeo = new THREE.CylinderGeometry(0.22, 0.22, 44, 8);
      for (const side of [-1, 1]) {
        const pillar = new THREE.Mesh(pillarGeo, ring.material);
        pillar.position.set(side * RING_HALF_WIDTH, 16, 0);
        ring.add(pillar);
      }
      this.scene.add(ring);
      this.rings.push({ spec, mesh: ring, hit: false, passCount: 0 });
    }
  }

  /** 揺れる障害物とアイテムの動き(毎フレーム) */
  public updateItems(dt: number): void {
    this.elapsed += dt;
    for (const o of this.obstacles) {
      if (o.spec.sway > 0) {
        o.currentX = o.spec.centerX + o.spec.sway * Math.sin(o.spec.phase + o.spec.swaySpeed * this.elapsed);
        o.mesh.position.x = o.currentX;
      }
    }
    for (const p of this.pickups) {
      if (!p.collected) p.mesh.position.y = 1.0 + Math.sin(this.elapsed * 3 + p.spec.z) * 0.18;
    }
  }

  public hideItem(root: THREE.Object3D): void {
    root.visible = false;
  }

  /** 開始のたびに、要件・ゲート・障害物・アイテムを作り直す(同じ正解の暗記を防ぐ) */
  public reset(requirement: number = 124, level: LevelId = 'kosen'): void {
    this.requirement = requirement;
    this.level = level;
    if (this.bossWallFrontMat) {
      this.bossWallFrontMat.map?.dispose();
      this.bossWallFrontMat.map = TextureGenerator.createBossWallTexture(requirement);
      this.bossWallFrontMat.needsUpdate = true;
    }
    this.regenerateGates();
    this.regenerateItems();

    if (this.bossWallGroup) {
      this.bossWallGroup.visible = true;
    }
  }
}
