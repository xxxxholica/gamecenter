import * as THREE from 'three';

export interface InteriorConfig {
  cabinLength: number;
  cabinWidth: number;
  cabinHeight: number;
  floorY: number;
  centerZ: number;
  dashZ: number;
  frontSeatZ: number;
  rearSeatZ: number;
  steeringSide: 'right' | 'left'; // Default right hand drive for Japan Kei-car
  /** ルームミラーの取り付け高さ(ルーフ前縁のフレームの下)。省略時は窓の上端付近 */
  mirrorY?: number;
}

export class CarInterior {
  public group: THREE.Group;

  // Materials
  private interiorPlasticMat: THREE.MeshStandardMaterial;
  private seatFabricMat: THREE.MeshStandardMaterial;
  private seatAccentMat: THREE.MeshStandardMaterial;
  private screenEmissiveMat: THREE.MeshStandardMaterial;
  private chromeMat: THREE.MeshStandardMaterial;
  private mirrorGlassMat: THREE.MeshStandardMaterial;

  constructor(config: InteriorConfig) {
    this.group = new THREE.Group();

    // 1. Initialize Materials
    this.interiorPlasticMat = new THREE.MeshStandardMaterial({
      color: 0x181a1f, // Deep dark charcoal
      roughness: 0.85,
      metalness: 0.05,
    });

    this.seatFabricMat = new THREE.MeshStandardMaterial({
      color: 0x2d3238, // Technical textured fabric
      roughness: 0.9,
      metalness: 0.05,
    });

    this.seatAccentMat = new THREE.MeshStandardMaterial({
      color: 0x485460, // Lighter bolster fabric
      roughness: 0.8,
      metalness: 0.05,
    });

    // Nav Screen with subtle blue/green UI glow
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0a192f';
    ctx.fillRect(0, 0, 256, 160);
    // Draw simple UI (Speed, GPS map route)
    ctx.fillStyle = '#10ac84';
    ctx.font = 'bold 20px monospace';
    ctx.fillText('MAP NAVI', 20, 36);
    ctx.strokeStyle = '#00d2d3';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(30, 130);
    ctx.lineTo(100, 80);
    ctx.lineTo(180, 110);
    ctx.lineTo(230, 50);
    ctx.stroke();
    // Clock
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px monospace';
    ctx.fillText('12:00', 190, 32);

    const screenTex = new THREE.CanvasTexture(canvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;

    this.screenEmissiveMat = new THREE.MeshStandardMaterial({
      map: screenTex,
      emissive: 0x336699,
      emissiveIntensity: 0.8,
      roughness: 0.2,
    });

    this.chromeMat = new THREE.MeshStandardMaterial({
      color: 0xdcdde1,
      metalness: 0.9,
      roughness: 0.15,
    });

    this.mirrorGlassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.95,
      roughness: 0.05,
    });

    // 2. Build Components
    this.buildCabinFloorAndWalls(config);
    this.buildDashboard(config);
    this.buildSteeringWheel(config);
    this.buildCenterConsole(config);
    this.buildSeats(config);
    this.buildRearviewMirror(config);
  }

  private buildCabinFloorAndWalls(cfg: InteriorConfig): void {
    // Floor
    const floorGeo = new THREE.BoxGeometry(cfg.cabinWidth * 0.92, 0.04, cfg.cabinLength * 0.94);
    const floor = new THREE.Mesh(floorGeo, this.interiorPlasticMat);
    floor.position.set(0, cfg.floorY, cfg.centerZ);
    this.group.add(floor);

    // Inner Door Trim Panels (Left & Right)
    [-1, 1].forEach((side) => {
      const trimGeo = new THREE.BoxGeometry(0.04, 0.36, cfg.cabinLength * 0.88);
      const trim = new THREE.Mesh(trimGeo, this.interiorPlasticMat);
      trim.position.set(side * (cfg.cabinWidth * 0.46), cfg.floorY + 0.20, cfg.centerZ);
      this.group.add(trim);

      // Armrest
      const armrestGeo = new THREE.BoxGeometry(0.06, 0.035, 0.38);
      const armrest = new THREE.Mesh(armrestGeo, this.seatFabricMat);
      armrest.position.set(side * (cfg.cabinWidth * 0.44), cfg.floorY + 0.23, cfg.frontSeatZ);
      this.group.add(armrest);
    });
  }

  private buildDashboard(cfg: InteriorConfig): void {
    const dashWidth = cfg.cabinWidth * 0.88;
    const dashY = cfg.floorY + 0.40;

    // Main Horizontal Dashboard Beam
    const dashGeo = new THREE.BoxGeometry(dashWidth, 0.18, 0.34);
    const dash = new THREE.Mesh(dashGeo, this.interiorPlasticMat);
    dash.position.set(0, dashY, cfg.dashZ);
    this.group.add(dash);

    // Instrument Cluster Binnacle (Speedometer Hood - Right Hand Drive)
    const meterX = cfg.steeringSide === 'right' ? -0.32 : 0.32;
    const hoodGeo = new THREE.BoxGeometry(0.24, 0.10, 0.16);
    const hood = new THREE.Mesh(hoodGeo, this.interiorPlasticMat);
    hood.position.set(meterX, dashY + 0.10, cfg.dashZ - 0.06);
    this.group.add(hood);

    // Instrument Cluster Dials (Speedometer / Tachometer)
    const dialGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16);
    dialGeo.rotateX(Math.PI / 2);
    const dialMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: 0xffaa00,
      emissiveIntensity: 0.5,
      roughness: 0.2,
    });
    [-0.05, 0.05].forEach((offset) => {
      const dial = new THREE.Mesh(dialGeo, dialMat);
      dial.position.set(meterX + offset, dashY + 0.08, cfg.dashZ - 0.145);
      this.group.add(dial);
    });

    // Center Infotainment Screen (Navigation tablet)
    const screenGeo = new THREE.BoxGeometry(0.22, 0.13, 0.03);
    const screen = new THREE.Mesh(screenGeo, this.screenEmissiveMat);
    screen.position.set(0, dashY + 0.08, cfg.dashZ - 0.08);
    screen.rotation.x = -0.15;
    this.group.add(screen);

    // AC Vents (Air conditioning louvers)
    const ventGeo = new THREE.BoxGeometry(0.07, 0.035, 0.015);
    [-0.09, 0.09].forEach((vX) => {
      const vent = new THREE.Mesh(ventGeo, this.chromeMat);
      vent.position.set(vX, dashY + 0.01, cfg.dashZ - 0.175);
      this.group.add(vent);
    });

    // Passenger Dashboard Tray / Grab Bar
    const passX = cfg.steeringSide === 'right' ? 0.32 : -0.32;
    const grabBarGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.22, 12);
    grabBarGeo.rotateZ(Math.PI / 2);
    const grabBar = new THREE.Mesh(grabBarGeo, this.interiorPlasticMat);
    grabBar.position.set(passX, dashY + 0.05, cfg.dashZ - 0.175);
    this.group.add(grabBar);
  }

  private buildSteeringWheel(cfg: InteriorConfig): void {
    const steerX = cfg.steeringSide === 'right' ? -0.32 : 0.32;
    // 一人称の視点(目の高さ約0.9m上)から、リムが視界の下側に入る高さ
    const steerY = cfg.floorY + 0.66;
    const steerZ = cfg.dashZ - 0.18;

    const steerGroup = new THREE.Group();
    steerGroup.position.set(steerX, steerY, steerZ);
    steerGroup.rotation.x = 0.35;

    // Steering Column
    const colGeo = new THREE.CylinderGeometry(0.03, 0.04, 0.18, 12);
    colGeo.rotateX(Math.PI / 2);
    const col = new THREE.Mesh(colGeo, this.interiorPlasticMat);
    col.position.z = 0.08;
    steerGroup.add(col);

    // Outer Rim (Torus)
    const rimRadius = 0.15;
    const rimGeo = new THREE.TorusGeometry(rimRadius, 0.016, 12, 32);
    const rim = new THREE.Mesh(rimGeo, this.interiorPlasticMat);
    steerGroup.add(rim);

    // Center Horn Pad / Hub
    const hubGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16);
    hubGeo.rotateX(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, this.interiorPlasticMat);
    steerGroup.add(hub);

    // Chrome Center Emblem
    const embGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.032, 16);
    embGeo.rotateX(Math.PI / 2);
    const emb = new THREE.Mesh(embGeo, this.chromeMat);
    steerGroup.add(emb);

    // 3 Spokes
    const spokeAngles = [Math.PI, 0, -Math.PI / 2];
    spokeAngles.forEach((angle) => {
      // 長辺を半径方向(X)にとり、角度ぶん回してハブからリムへ伸ばす
      const spokeGeo = new THREE.BoxGeometry(rimRadius * 0.85, 0.024, 0.016);
      const spoke = new THREE.Mesh(spokeGeo, this.interiorPlasticMat);
      spoke.position.set(
        Math.cos(angle) * (rimRadius * 0.55),
        Math.sin(angle) * (rimRadius * 0.55),
        0
      );
      spoke.rotation.z = angle;
      steerGroup.add(spoke);
    });

    this.group.add(steerGroup);
  }

  private buildCenterConsole(cfg: InteriorConfig): void {
    const conWidth = 0.18;
    const conLength = 0.55;
    const conGeo = new THREE.BoxGeometry(conWidth, 0.18, conLength);
    const con = new THREE.Mesh(conGeo, this.interiorPlasticMat);
    con.position.set(0, cfg.floorY + 0.12, cfg.dashZ - 0.35);
    this.group.add(con);

    // Shift Lever
    const leverGroup = new THREE.Group();
    leverGroup.position.set(0, cfg.floorY + 0.21, cfg.dashZ - 0.28);

    const bootGeo = new THREE.ConeGeometry(0.045, 0.06, 8);
    const boot = new THREE.Mesh(bootGeo, this.interiorPlasticMat);
    leverGroup.add(boot);

    const shaftGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.10, 8);
    shaftGeo.translate(0, 0.05, 0);
    const shaft = new THREE.Mesh(shaftGeo, this.chromeMat);
    leverGroup.add(shaft);

    const knobGeo = new THREE.SphereGeometry(0.022, 12, 12);
    knobGeo.translate(0, 0.10, 0);
    const knob = new THREE.Mesh(knobGeo, this.interiorPlasticMat);
    leverGroup.add(knob);

    this.group.add(leverGroup);

    // Cup holders
    [-0.04, 0.04].forEach((cuX) => {
      const cupGeo = new THREE.CylinderGeometry(0.03, 0.025, 0.04, 16);
      const cup = new THREE.Mesh(cupGeo, this.interiorPlasticMat);
      cup.position.set(cuX, cfg.floorY + 0.21, cfg.dashZ - 0.45);
      this.group.add(cup);
    });
  }

  private buildSeats(cfg: InteriorConfig): void {
    // 1. Front Seats (Driver & Passenger)
    [-0.32, 0.32].forEach((xPos) => {
      const seatGroup = new THREE.Group();
      seatGroup.position.set(xPos, cfg.floorY, cfg.frontSeatZ);

      // Seat Base Cushion
      const baseGeo = new THREE.BoxGeometry(0.38, 0.12, 0.40);
      const base = new THREE.Mesh(baseGeo, this.seatFabricMat);
      base.position.y = 0.10;
      base.castShadow = true;
      seatGroup.add(base);

      // Seat Bolsters
      [-0.17, 0.17].forEach((bX) => {
        const bolsterGeo = new THREE.BoxGeometry(0.06, 0.05, 0.40);
        const bolster = new THREE.Mesh(bolsterGeo, this.seatAccentMat);
        bolster.position.set(bX, 0.15, 0);
        seatGroup.add(bolster);
      });

      // Backrest
      const backGeo = new THREE.BoxGeometry(0.36, 0.42, 0.10);
      const back = new THREE.Mesh(backGeo, this.seatFabricMat);
      back.position.set(0, 0.36, -0.15);
      back.rotation.x = -0.12;
      back.castShadow = true;
      seatGroup.add(back);

      // Backrest side wings
      [-0.16, 0.16].forEach((wX) => {
        const wingGeo = new THREE.BoxGeometry(0.05, 0.38, 0.08);
        const wing = new THREE.Mesh(wingGeo, this.seatAccentMat);
        wing.position.set(wX, 0.36, -0.12);
        wing.rotation.x = -0.12;
        seatGroup.add(wing);
      });

      // Headrest
      const headGeo = new THREE.BoxGeometry(0.18, 0.12, 0.08);
      const head = new THREE.Mesh(headGeo, this.seatFabricMat);
      head.position.set(0, 0.62, -0.18);
      seatGroup.add(head);

      // Headrest chrome support rods
      [-0.04, 0.04].forEach((rodX) => {
        const rodGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.07, 8);
        const rod = new THREE.Mesh(rodGeo, this.chromeMat);
        rod.position.set(rodX, 0.55, -0.17);
        seatGroup.add(rod);
      });

      this.group.add(seatGroup);
    });

    // 2. Rear Bench Seat
    const rearGroup = new THREE.Group();
    rearGroup.position.set(0, cfg.floorY, cfg.rearSeatZ);

    // Bench Cushion
    const rBenchGeo = new THREE.BoxGeometry(cfg.cabinWidth * 0.82, 0.12, 0.36);
    const rBench = new THREE.Mesh(rBenchGeo, this.seatFabricMat);
    rBench.position.y = 0.10;
    rearGroup.add(rBench);

    // Bench Backrest
    const rBackGeo = new THREE.BoxGeometry(cfg.cabinWidth * 0.80, 0.40, 0.09);
    const rBack = new THREE.Mesh(rBackGeo, this.seatFabricMat);
    rBack.position.set(0, 0.34, -0.12);
    rBack.rotation.x = -0.08;
    rearGroup.add(rBack);

    // Rear Headrests
    [-0.28, 0.28].forEach((hrX) => {
      const rHeadGeo = new THREE.BoxGeometry(0.16, 0.10, 0.07);
      const rHead = new THREE.Mesh(rHeadGeo, this.seatFabricMat);
      rHead.position.set(hrX, 0.58, -0.14);
      rearGroup.add(rHead);
    });

    this.group.add(rearGroup);
  }

  private buildRearviewMirror(cfg: InteriorConfig): void {
    const mirrorGroup = new THREE.Group();
    // Positioned at top of windshield center
    mirrorGroup.position.set(0, cfg.mirrorY ?? cfg.floorY + cfg.cabinHeight * 0.88, cfg.dashZ + 0.06);

    // Stem attached to windshield
    const stemGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8);
    stemGeo.rotateX(Math.PI / 4);
    const stem = new THREE.Mesh(stemGeo, this.interiorPlasticMat);
    mirrorGroup.add(stem);

    // Mirror Housing
    const housingGeo = new THREE.BoxGeometry(0.18, 0.06, 0.025);
    const housing = new THREE.Mesh(housingGeo, this.interiorPlasticMat);
    housing.position.set(0, -0.03, -0.03);
    mirrorGroup.add(housing);

    // Mirror Glass Surface
    const glassGeo = new THREE.PlaneGeometry(0.17, 0.05);
    const glass = new THREE.Mesh(glassGeo, this.mirrorGlassMat);
    glass.rotation.y = Math.PI;
    glass.position.set(0, -0.03, -0.043);
    mirrorGroup.add(glass);

    this.group.add(mirrorGroup);
  }
}
