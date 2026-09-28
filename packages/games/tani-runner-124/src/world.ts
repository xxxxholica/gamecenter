// ============================================================
// World & Course Builder: Running Corridor, Numerical Gates,
// 124 Wall, and the Infinite Multiplier Bonus Runway
// ============================================================

import * as THREE from 'three';
import { TextureGenerator, GateInfo } from './textures.ts';

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
  public bonusTrackEndZ: number = -1000.0;

  // Course elements
  public trackMesh: THREE.Mesh | null = null;
  public bonusSegments: THREE.Mesh[] = [];
  public gates: GatePair[] = [];
  public bossWallGroup: THREE.Group | null = null;
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
    this.buildGates();
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

  // 1. Running Track (0 to -450)
  private buildCourseTrack(): void {
    const trackLen = Math.abs(this.bossWallZ);
    const floorGeo = new THREE.PlaneGeometry(this.trackWidth, trackLen);
    floorGeo.rotateX(-Math.PI / 2);
    const floorTex = TextureGenerator.createFloorTexture();
    const floorMat = new THREE.MeshLambertMaterial({ map: floorTex });

    this.trackMesh = new THREE.Mesh(floorGeo, floorMat);
    this.trackMesh.position.set(0, 0, this.bossWallZ / 2);
    this.trackMesh.receiveShadow = true;
    this.scene.add(this.trackMesh);

    // Side guard rails
    const railGeo = new THREE.BoxGeometry(0.6, 1.8, trackLen);
    const railMat = new THREE.MeshLambertMaterial({ color: 0x1f232e });

    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-this.trackWidth / 2 - 0.3, 0.9, this.bossWallZ / 2);
    this.scene.add(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(this.trackWidth / 2 + 0.3, 0.9, this.bossWallZ / 2);
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

  // 3. University Mathematics Gates
  private buildGates(): void {
    const gateConfigs: { z: number; left: GateInfo; right: GateInfo }[] = [
      // Gate 1: 重積分 vs 偏微分
      {
        z: -45,
        left: { type: 'integral_double', value: 2, label: '∬', isPositive: true },
        right: { type: 'diff_partial', value: 10, label: '∂/∂x', isPositive: false }
      },
      // Gate 2: 核空間没収 vs 級数総和
      {
        z: -95,
        left: { type: 'kernel', value: 15, label: 'ker', isPositive: false },
        right: { type: 'series_sum', value: 20, label: '∑ +20', isPositive: true }
      },
      // Gate 3: 三重積分 vs 1階微分
      {
        z: -150,
        left: { type: 'integral_triple', value: 3, label: '∭', isPositive: true },
        right: { type: 'diff_1st', value: 2, label: 'd/dx', isPositive: false }
      },
      // Gate 4: 固有値減衰 vs 定積分
      {
        z: -205,
        left: { type: 'eigen_decay', value: 2, label: 'λ=0.5', isPositive: false },
        right: { type: 'integral_add', value: 30, label: '∫ +30', isPositive: true }
      },
      // Gate 5: 級数総和 vs 余核退化
      {
        z: -260,
        left: { type: 'series_sum', value: 35, label: '∑ +35', isPositive: true },
        right: { type: 'coker', value: 25, label: 'coker', isPositive: false }
      },
      // Gate 6: 2階微分 vs テンソル積
      {
        z: -315,
        left: { type: 'diff_2nd', value: 3, label: 'd²/dx²', isPositive: false },
        right: { type: 'tensor_prod', value: 2, label: '⊗2', isPositive: true }
      },
      // Gate 7: 固有空間拡大 vs 勾配流出
      {
        z: -370,
        left: { type: 'eigen_boost', value: 2, label: 'λ=2', isPositive: true },
        right: { type: 'divergence', value: 30, label: '∇・F', isPositive: false }
      },
      // Gate 8: 無限大極限 vs 三重積分 (Final Double Chance!)
      {
        z: -415,
        left: { type: 'limit_inf', value: 50, label: 'lim ∞', isPositive: true },
        right: { type: 'integral_triple', value: 3, label: '∭', isPositive: true }
      }
    ];

    const gateW = 4.4;
    const gateH = 3.2;

    gateConfigs.forEach(cfg => {
      // Left Gate
      const leftTex = TextureGenerator.createGateTexture(cfg.left);
      const leftMat = new THREE.MeshBasicMaterial({ map: leftTex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const leftMesh = new THREE.Mesh(new THREE.PlaneGeometry(gateW, gateH), leftMat);
      leftMesh.position.set(-2.4, gateH / 2 + 0.1, cfg.z);

      // Right Gate
      const rightTex = TextureGenerator.createGateTexture(cfg.right);
      const rightMat = new THREE.MeshBasicMaterial({ map: rightTex, transparent: true, opacity: 0.95, side: THREE.DoubleSide });
      const rightMesh = new THREE.Mesh(new THREE.PlaneGeometry(gateW, gateH), rightMat);
      rightMesh.position.set(2.4, gateH / 2 + 0.1, cfg.z);

      // Frame posts
      this.addGatePosts(leftMesh, gateW, gateH, cfg.left.isPositive);
      this.addGatePosts(rightMesh, gateW, gateH, cfg.right.isPositive);

      this.scene.add(leftMesh);
      this.scene.add(rightMesh);

      this.gates.push({
        z: cfg.z,
        leftGate: { mesh: leftMesh, info: cfg.left, passed: false },
        rightGate: { mesh: rightMesh, info: cfg.right, passed: false }
      });
    });
  }

  private addGatePosts(parentMesh: THREE.Mesh, w: number, h: number, isPos: boolean): void {
    const postGeo = new THREE.CylinderGeometry(0.12, 0.12, h, 8);
    const postMat = new THREE.MeshLambertMaterial({ color: isPos ? 0x00d4ff : 0xff1744 });

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
    const wallTex = TextureGenerator.createBossWallTexture();
    const sideMat = new THREE.MeshLambertMaterial({ color: 0x221310 });
    const frontMat = new THREE.MeshLambertMaterial({ map: wallTex });

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

  public reset(): void {
    this.gates.forEach(g => {
      g.leftGate.passed = false;
      g.leftGate.mesh.visible = true;
      g.rightGate.passed = false;
      g.rightGate.mesh.visible = true;
    });

    if (this.bossWallGroup) {
      this.bossWallGroup.visible = true;
    }
  }
}
