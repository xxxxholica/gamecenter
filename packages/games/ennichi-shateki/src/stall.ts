import * as THREE from 'three';
import {
  createWoodTexture,
  createStripeCanopyTexture,
  createLanternTexture,
  createStallBannerTexture,
  createPinwheelTexture,
} from './textures';

export interface ShelfInfo {
  index: number;
  ySurface: number;
  zCenter: number;
  zFront: number;
  zBack: number;
  xMin: number;
  xMax: number;
  depth: number;
}

export class FestivalStall {
  public group: THREE.Group;
  public shelves: ShelfInfo[] = [];
  public lanterns: THREE.Group[] = [];
  public lanternLights: THREE.PointLight[] = [];
  public pinwheels: THREE.Mesh[] = [];
  public ambientParticles!: THREE.Points;
  private particleGeo!: THREE.BufferGeometry;
  public titleRifleGroup: THREE.Group;

  constructor() {
    this.group = new THREE.Group();
    this.titleRifleGroup = new THREE.Group();
    this.buildStall();
    this.buildHinadan();
    this.buildLanterns();
    this.buildPinwheels();
    this.buildParticles();
    this.buildTitleRestingRifle();
  }

  private buildStall() {
    const woodTex = createWoodTexture('#6b3917', '#421f0a');
    woodTex.repeat.set(3, 2);
    const darkWoodMat = new THREE.MeshStandardMaterial({
      map: woodTex,
      roughness: 0.75,
      metalness: 0.1,
    });

    const pillarMat = new THREE.MeshStandardMaterial({
      color: 0x4a250e,
      roughness: 0.8,
    });

    // 4 Main corner pillars across widened span (width 4.6m)
    const pillarPositions = [
      [-2.25, 1.4, 1.45],
      [2.25, 1.4, 1.45],
      [-2.25, 1.4, -1.35],
      [2.25, 1.4, -1.35],
    ];
    const pillarGeo = new THREE.BoxGeometry(0.12, 2.8, 0.12);
    pillarPositions.forEach(([px, py, pz]) => {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, py, pz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      this.group.add(pillar);
    });

    // Extra center support pillars on back wall
    const midPillarGeo = new THREE.BoxGeometry(0.08, 2.8, 0.08);
    const mid1 = new THREE.Mesh(midPillarGeo, pillarMat);
    mid1.position.set(-0.8, 1.4, -1.35);
    const mid2 = new THREE.Mesh(midPillarGeo, pillarMat);
    mid2.position.set(0.8, 1.4, -1.35);
    this.group.add(mid1, mid2);

    // Front Wooden Counter (4.6m wide)
    const counterGeo = new THREE.BoxGeometry(4.6, 0.1, 0.65);
    const counter = new THREE.Mesh(counterGeo, darkWoodMat);
    counter.position.set(0, 0.82, 1.35);
    counter.receiveShadow = true;
    counter.castShadow = true;
    this.group.add(counter);

    // Counter front apron curtain
    const apronGeo = new THREE.PlaneGeometry(4.6, 0.8);
    const apronMat = new THREE.MeshStandardMaterial({
      color: 0x9b1b1b,
      side: THREE.DoubleSide,
    });
    const apron = new THREE.Mesh(apronGeo, apronMat);
    apron.position.set(0, 0.4, 1.67);
    this.group.add(apron);

    // Pitched Striped Canopy Roof (5.0m wide)
    const roofTex = createStripeCanopyTexture();
    roofTex.repeat.set(6, 2);
    const roofMat = new THREE.MeshStandardMaterial({
      map: roofTex,
      roughness: 0.6,
      side: THREE.DoubleSide,
    });

    // Front roof slope (水平基準から手前へ緩やかに下る軒屋根にし、奥の風船やUFOを隠さないようにする)
    const roofFrontGeo = new THREE.PlaneGeometry(4.9, 1.8);
    const roofFront = new THREE.Mesh(roofFrontGeo, roofMat);
    roofFront.position.set(0, 2.73, 0.6);
    roofFront.rotation.x = -Math.PI / 2 + Math.PI / 10;
    roofFront.castShadow = true;
    this.group.add(roofFront);

    // Back roof slope
    const roofBackGeo = new THREE.PlaneGeometry(4.9, 1.5);
    const roofBack = new THREE.Mesh(roofBackGeo, roofMat);
    roofBack.position.set(0, 2.75, -0.82);
    roofBack.rotation.x = -Math.PI / 2 - Math.PI / 9;
    roofBack.castShadow = true;
    this.group.add(roofBack);

    // Roof eave crossbeams
    const beamGeo = new THREE.BoxGeometry(4.9, 0.08, 0.08);
    const frontBeam = new THREE.Mesh(beamGeo, pillarMat);
    frontBeam.position.set(0, 2.45, 1.45);
    this.group.add(frontBeam);

    const backBeam = new THREE.Mesh(beamGeo, pillarMat);
    backBeam.position.set(0, 2.45, -1.35);
    this.group.add(backBeam);

    // Traditional festival banner / curtain (暖簾) under front beam
    const bannerTex = createStallBannerTexture();
    const bannerMat = new THREE.MeshStandardMaterial({
      map: bannerTex,
      transparent: true,
      side: THREE.DoubleSide,
    });
    const bannerGeo = new THREE.PlaneGeometry(4.5, 0.48);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 2.22, 1.42);
    this.group.add(banner);

    // Back wall
    const backWallGeo = new THREE.PlaneGeometry(4.7, 2.4);
    const backWallMat = new THREE.MeshStandardMaterial({
      color: 0x0a1128,
      roughness: 0.9,
    });
    const backWall = new THREE.Mesh(backWallGeo, backWallMat);
    backWall.position.set(0, 1.7, -1.4);
    this.group.add(backWall);

    // Floor of stall
    const floorGeo = new THREE.PlaneGeometry(5.2, 4.0);
    const floorTex = createWoodTexture('#3e210c', '#271407');
    floorTex.repeat.set(4, 3);
    const floorMat = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.85,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 0);
    floor.receiveShadow = true;
    this.group.add(floor);
  }

  // 3-Tier Wooden Hinadan (4.3m wide)
  private buildHinadan() {
    const hinadanWoodTex = createWoodTexture('#8b4513', '#502305');
    hinadanWoodTex.repeat.set(5, 1);
    const shelfMat = new THREE.MeshStandardMaterial({
      map: hinadanWoodTex,
      roughness: 0.65,
      metalness: 0.05,
    });

    const shelfWidth = 4.3;
    const shelfThickness = 0.06;
    const shelfDepth = 0.40;

    const tierDefs = [
      { y: 0.95, z: -0.15 },
      { y: 1.30, z: -0.55 },
      { y: 1.65, z: -0.95 },
    ];

    tierDefs.forEach((def, idx) => {
      const ySurface = def.y + shelfThickness / 2;
      const zFront = def.z + shelfDepth / 2;
      const zBack = def.z - shelfDepth / 2;

      this.shelves.push({
        index: idx,
        ySurface,
        zCenter: def.z,
        zFront,
        zBack,
        xMin: -shelfWidth / 2 + 0.15,
        xMax: shelfWidth / 2 - 0.15,
        depth: shelfDepth,
      });

      const plankGeo = new THREE.BoxGeometry(shelfWidth, shelfThickness, shelfDepth);
      const plank = new THREE.Mesh(plankGeo, shelfMat);
      plank.position.set(0, def.y, def.z);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.group.add(plank);

      const riserHeight = idx === 0 ? def.y : 0.35;
      const riserGeo = new THREE.BoxGeometry(shelfWidth, riserHeight, 0.04);
      const riser = new THREE.Mesh(riserGeo, shelfMat);
      riser.position.set(0, def.y - riserHeight / 2, zBack + 0.02);
      riser.receiveShadow = true;
      this.group.add(riser);

      // Red cloth runner strip
      const runnerGeo = new THREE.PlaneGeometry(shelfWidth, 0.04);
      const runnerMat = new THREE.MeshStandardMaterial({ color: 0xd91414, roughness: 0.6 });
      const runner = new THREE.Mesh(runnerGeo, runnerMat);
      runner.position.set(0, ySurface + 0.002, zFront - 0.025);
      runner.rotation.x = -Math.PI / 2;
      this.group.add(runner);
    });

    // Side panels
    const sidePanelGeo = new THREE.BoxGeometry(0.05, 1.8, 1.2);
    const leftSide = new THREE.Mesh(sidePanelGeo, shelfMat);
    leftSide.position.set(-shelfWidth / 2 - 0.03, 0.9, -0.55);
    this.group.add(leftSide);

    const rightSide = new THREE.Mesh(sidePanelGeo, shelfMat);
    rightSide.position.set(shelfWidth / 2 + 0.03, 0.9, -0.55);
    this.group.add(rightSide);
  }

  // Red Paper Lanterns across widened span (6 lanterns)
  private buildLanterns() {
    const lanternTexLeft = createLanternTexture('射的');
    const lanternTexRight = createLanternTexture('祭');

    const lanternPositions = [
      { x: -2.1, y: 2.15, z: 1.35, tex: lanternTexLeft },
      { x: -0.7, y: 2.2, z: 1.35, tex: lanternTexRight },
      { x: 0.7, y: 2.2, z: 1.35, tex: lanternTexLeft },
      { x: 2.1, y: 2.15, z: 1.35, tex: lanternTexRight },
      { x: -1.95, y: 2.38, z: -0.4, tex: lanternTexRight },
      { x: 1.95, y: 2.38, z: -0.4, tex: lanternTexLeft },
    ];

    const bodyGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.38, 16);
    const ringGeo = new THREE.CylinderGeometry(0.145, 0.145, 0.04, 16);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });

    lanternPositions.forEach((lp) => {
      const lanternGroup = new THREE.Group();

      const bodyMat = new THREE.MeshStandardMaterial({
        map: lp.tex,
        emissive: 0xd91414,
        emissiveIntensity: 0.55,
        roughness: 0.5,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      lanternGroup.add(body);

      const topRing = new THREE.Mesh(ringGeo, ringMat);
      topRing.position.y = 0.2;
      lanternGroup.add(topRing);

      const bottomRing = new THREE.Mesh(ringGeo, ringMat);
      bottomRing.position.y = -0.2;
      lanternGroup.add(bottomRing);

      const stringGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.18, 4);
      const stringMesh = new THREE.Mesh(stringGeo, ringMat);
      stringMesh.position.y = 0.3;
      lanternGroup.add(stringMesh);

      lanternGroup.position.set(lp.x, lp.y, lp.z);
      this.group.add(lanternGroup);
      this.lanterns.push(lanternGroup);
    });

    // 提灯の明かり。提灯ごとに点光源を置くと全画素で光源計算が6個分増えるため、前列・後列に1個ずつまとめる
    const lanternRows = [
      { x: 0, y: 2.13, z: 1.35, intensity: 3.2, distance: 6.0 },
      { x: 0, y: 2.2, z: -0.4, intensity: 1.8, distance: 5.0 },
    ];
    lanternRows.forEach((row) => {
      const lanternLight = new THREE.PointLight(0xff7722, row.intensity, row.distance);
      lanternLight.position.set(row.x, row.y, row.z);
      lanternLight.userData.baseIntensity = row.intensity;
      this.group.add(lanternLight);
      this.lanternLights.push(lanternLight);
    });
  }

  // Spinning Festival Pinwheels on corner posts
  private buildPinwheels() {
    const pwTex = createPinwheelTexture();
    const pwMat = new THREE.MeshStandardMaterial({
      map: pwTex,
      side: THREE.DoubleSide,
      roughness: 0.3,
    });
    const pwGeo = new THREE.PlaneGeometry(0.32, 0.32);

    const positions = [
      [-2.25, 2.45, 1.48],
      [2.25, 2.45, 1.48],
      [-2.25, 2.45, -1.38],
      [2.25, 2.45, -1.38],
    ];

    positions.forEach(([px, py, pz]) => {
      const pw = new THREE.Mesh(pwGeo, pwMat);
      pw.position.set(px, py, pz);
      this.group.add(pw);
      this.pinwheels.push(pw);
    });
  }

  // Floating particles
  private buildParticles() {
    const count = 180;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 5.0;
      positions[i * 3 + 1] = 0.8 + Math.random() * 2.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 3.0;

      colors[i * 3 + 0] = 1.0;
      colors[i * 3 + 1] = 0.75 + Math.random() * 0.25;
      colors[i * 3 + 2] = 0.2;
    }

    this.particleGeo = new THREE.BufferGeometry();
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const particleMat = new THREE.PointsMaterial({
      size: 0.035,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });

    this.ambientParticles = new THREE.Points(this.particleGeo, particleMat);
    this.group.add(this.ambientParticles);
  }

  private buildTitleRestingRifle() {
    const stockGeo = new THREE.BoxGeometry(0.06, 0.1, 0.45);
    const stockMat = new THREE.MeshStandardMaterial({ color: 0x5c2a12, roughness: 0.6 });
    const stock = new THREE.Mesh(stockGeo, stockMat);

    const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 12);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x2d3436, metalness: 0.8, roughness: 0.3 });
    const barrel = new THREE.Mesh(barrelGeo, metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, 0.45);

    const corkGeo = new THREE.CylinderGeometry(0.016, 0.014, 0.05, 8);
    const corkMat = new THREE.MeshStandardMaterial({ color: 0xb58451, roughness: 0.9 });
    const cork = new THREE.Mesh(corkGeo, corkMat);
    cork.rotation.x = Math.PI / 2;
    cork.position.set(0, 0.03, 0.76);

    this.titleRifleGroup.add(stock, barrel, cork);
    this.titleRifleGroup.position.set(0.65, 0.91, 1.35);
    this.titleRifleGroup.rotation.y = -0.3;
    this.titleRifleGroup.rotation.z = 0.05;
    this.group.add(this.titleRifleGroup);
  }

  public update(dt: number, elapsed: number) {
    // Sway lanterns
    this.lanterns.forEach((lg, idx) => {
      lg.rotation.z = Math.sin(elapsed * 1.5 + idx * 1.2) * 0.04;
      lg.rotation.x = Math.cos(elapsed * 1.2 + idx) * 0.02;
    });

    this.lanternLights.forEach((light, idx) => {
      light.intensity = light.userData.baseIntensity * (0.93 + Math.sin(elapsed * 8.0 + idx * 3.7) * 0.18);
    });

    // Spin pinwheels
    this.pinwheels.forEach((pw, idx) => {
      pw.rotation.z += (3.5 + idx * 0.8) * dt;
    });

    // Float particles
    const positions = this.particleGeo.attributes.position.array as Float32Array;
    const count = positions.length / 3;
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 1] += Math.sin(elapsed * 1.5 + i) * 0.0015;
      positions[i * 3 + 0] += Math.cos(elapsed * 0.8 + i) * 0.001;
      if (positions[i * 3 + 1] > 2.7) positions[i * 3 + 1] = 0.8;
      if (positions[i * 3 + 1] < 0.8) positions[i * 3 + 1] = 2.7;
    }
    this.particleGeo.attributes.position.needsUpdate = true;
  }
}
