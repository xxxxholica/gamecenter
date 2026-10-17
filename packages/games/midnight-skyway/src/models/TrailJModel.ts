import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { CarBodyGenerator, LowerBodySection } from './CarBodyGenerator';
import { CarInterior } from './CarInterior';

export class TrailJModel extends CarBase {
  public readonly specs: CarSpecs = {
    name: 'TRAIL J',
    category: '本格軽4WDオフローダー',
    length: '3,395 mm',
    width: '1,475 mm',
    height: '1,540 mm',
    wheelbase: '2,250 mm',
    drivetrain: 'パートタイム4WD / ラダーフレーム',
    weight: '1,040 kg',
    description: '3面図の寸法比率を正確に再現。前後パーツのレイヤー配置、垂直に引き締まったリアエンド、4輪すべてにスペアタイヤと同等のアルミホイールを完全装備。',
  };

  constructor() {
    super();
    this.setBodyColor(0xded235); // Kinetic Yellow
    this.setRoofColor(0x1a1c22); // Matte Black roof
    this.buildCar();
  }

  private buildCar(): void {
    const carRoot = new THREE.Group();

    // Wheel & Stance Specifications
    const frontWheelZ = 1.12;
    const rearWheelZ = -1.10;
    const wheelRadius = 0.33;
    const archRadius = 0.39;
    const wheelWidth = 0.26;
    const trackWidth = 1.34;

    // --- 0. Detailed Cabin Interior ---
    const interior = new CarInterior({
      cabinLength: 2.05,
      cabinWidth: 1.30,
      cabinHeight: 0.95,
      floorY: 0.34,
      centerZ: -0.45,
      dashZ: 0.36,
      frontSeatZ: -0.15,
      rearSeatZ: -0.92,
      steeringSide: 'right', // RHD
      mirrorY: 1.40,          // ルーフ前縁(フレーム下端)から吊るす
    });
    carRoot.add(interior.group);

    // --- 1. Molded LOWER Body Shell ---
    // Clean Front Nose at z=1.46m (no overhang ahead of grille)
    // Flat Vertical Rear Gate at z=-1.50m (eliminates any concave sag!)
    // --- 1. Molded LOWER Body Shell ---
    // True geometric wheelhouse cutouts cleanly hollow out all space around wheels (no body penetration!)
    // Lower body sections molded with RICH BULGING CONTOURS (muscular shoulders, curved door bulges, flared arches)!
    const lowerSections: LowerBodySection[] = [
      // 0: Nose Front Tip (Grille mount line) - Hood crown bulge
      {
        z: 1.48,
        yBottom: 0.26,
        yTop: 0.85,               // Power bulge peak
        sill: [0.69, 0.28],
        fender: [0.74, 0.64],
        beltline: [0.705, 0.83],
      },
      // 1: Hood Front Step
      {
        z: 1.46,
        yBottom: 0.26,
        yTop: 0.86,
        sill: [0.69, 0.28],
        fender: [0.75, 0.66],
        beltline: [0.71, 0.85],
      },
      // 2: Front Wheelhouse FRONT Lip (Clear of tire front at z=1.44m!)
      {
        z: 1.45,
        yBottom: 0.26,
        yTop: 0.87,
        sill: [0.44, 0.28],       // Inward behind tire
        wheelArch: [0.78, 0.70],  // Well above tire top (y=0.65m)!
        fender: [0.82, 0.76],     // Prominent blister flare
        beltline: [0.72, 0.86],
      },
      // 3: Front Wheelhouse CENTER (Full open arch over chunky tire!)
      {
        z: frontWheelZ, // 1.12
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.44, 0.28],       // Inside chassis floor
        wheelArch: [0.80, 0.75],  // Generous 10cm clearance above tire!
        fender: [0.83, 0.78],     // Full offroad muscular flare
        beltline: [0.725, 0.87],
      },
      // 4: Front Wheelhouse REAR Lip (Clear of tire rear at z=0.80m!)
      {
        z: 0.78,
        yBottom: 0.26,
        yTop: 0.89,
        sill: [0.44, 0.28],       // Inward behind tire
        wheelArch: [0.78, 0.70],  // Well above tire top (y=0.65m)!
        fender: [0.82, 0.76],
        beltline: [0.72, 0.88],
      },
      // 5: Cowl / Hood Rear (Base of windshield)
      {
        z: 0.74,
        yBottom: 0.26,
        yTop: 0.90,               // Smooth transition into windshield cowl
        sill: [0.69, 0.28],
        fender: [0.75, 0.68],
        beltline: [0.72, 0.88],
      },
      // 6: Front Door Area (Cabin begins - rich curved barrel bulge!)
      {
        z: 0.45,
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.685, 0.28],
        fender: [0.745, 0.60],    // Outward door bulge
        beltline: [0.72, 0.88],   // Pronounced waistline shoulder
      },
      // 7: Door Center (Maximum rich body curvature)
      {
        z: 0.05,
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.685, 0.28],
        fender: [0.750, 0.60],    // Fullest mid-door swell
        beltline: [0.72, 0.88],
      },
      // 8: B-Pillar / Door Rear
      {
        z: -0.35,
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.685, 0.28],
        fender: [0.745, 0.60],
        beltline: [0.72, 0.88],
      },
      // 9: Rear Wheelhouse FRONT Lip (Clear of tire front at z=-0.83m!)
      {
        z: -0.80,
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.44, 0.28],       // Inward behind tire
        wheelArch: [0.78, 0.70],  // Well above tire top!
        fender: [0.82, 0.76],     // Chunky rear blister arch
        beltline: [0.72, 0.88],
      },
      // 10: Rear Wheelhouse CENTER (Full open arch over chunky rear tire!)
      {
        z: rearWheelZ, // -1.15
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.44, 0.28],       // Inside chassis floor
        wheelArch: [0.80, 0.75],  // Generous 10cm clearance above tire!
        fender: [0.83, 0.78],
        beltline: [0.725, 0.88],
      },
      // 11: Rear Wheelhouse REAR Lip (Clear of tire rear at z=-1.47m!)
      {
        z: -1.48,
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.44, 0.28],       // Inward behind tire
        wheelArch: [0.78, 0.70],  // Well above tire top!
        fender: [0.82, 0.76],
        beltline: [0.72, 0.88],
      },
      // 12: Solid Vertical Tailgate (Flat back, flush at z=-1.50m!)
      {
        z: -1.50,
        yBottom: 0.26,
        yTop: 0.88,
        sill: [0.69, 0.28],
        fender: [0.74, 0.65],
        beltline: [0.71, 0.88],
      },
    ];

    const isCabinZone = [
      false, false, false, false, false, false,
      true, true, true, true, true, true, false
    ];

    // Wheel Arch Cutout Zones (100% hollows out the body over the chunky offroad tires!)
    const isWheelArchZone = [
      false, false,
      true, true, true,   // Front wheel arch zone (sections 2, 3, 4: z=0.78 to 1.45m)
      false, false, false, false,
      true, true, true,   // Rear wheel arch zone (sections 9, 10, 11: z=-0.80 to -1.48m)
      false
    ];

    const lowerMesh = CarBodyGenerator.generateLowerBodyMesh(
      lowerSections,
      isCabinZone,
      this.bodyMaterial,
      isWheelArchZone
    );
    carRoot.add(lowerMesh);

    // --- 2. BOLD & THICK Structural Pillars & Fully Integrated Cabin Base Frame ---
    const beltlineY = 0.88;
    const roofBaseY = 1.50; // The strict baseline level where the roof begins!
    const pillarTopY = 1.46; // Frame tops sit strictly inside/underneath roofBaseY!

    // A. SOLID CABIN BASE FRAME (Hermetically connects lower body waistline to upper pillars & glass)
    const baseFrame = CarBodyGenerator.buildCabinBaseFrame(
      beltlineY,
      0.74,   // Front cowl (windshield base)
      -1.50,  // Rear tailgate waist
      0.70,   // Half width strictly inside the 0.72m bulging beltline!
      this.bodyMaterial
    );
    carRoot.add(baseFrame);

    [-1, 1].forEach((side) => {
      // A-Pillars: positioned safely inside lower body (x=0.65m) and tapering to roof (x=0.59m)
      // Completely eliminates ANY frame protrusion through the body or roof sides!
      const aStart = new THREE.Vector3(side * 0.65, beltlineY, 0.74);
      const aEnd = new THREE.Vector3(side * 0.59, pillarTopY, 0.45);
      const aPillar = CarBodyGenerator.buildSmoothPillar(aStart, aEnd, 0.075, 0.065, 0.025, this.bodyMaterial);
      carRoot.add(aPillar);

      // A-Pillar Base Gusset (Neat compact gusset inside waistline)
      const aGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.10);
      const aGusset = new THREE.Mesh(aGussetGeo, this.bodyMaterial);
      aGusset.position.set(side * 0.66, beltlineY, 0.72);
      aGusset.castShadow = true;
      carRoot.add(aGusset);

      // B-Pillars: positioned safely inside waistline (x=0.65m -> x=0.59m)
      const bStart = new THREE.Vector3(side * 0.65, beltlineY, -0.35);
      const bEnd = new THREE.Vector3(side * 0.59, pillarTopY, -0.35);
      const bPillar = CarBodyGenerator.buildSmoothPillar(bStart, bEnd, 0.080, 0.065, 0.025, this.plasticMaterial);
      carRoot.add(bPillar);

      const bGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
      const bGusset = new THREE.Mesh(bGussetGeo, this.plasticMaterial);
      bGusset.position.set(side * 0.66, beltlineY, -0.35);
      bGusset.castShadow = true;
      carRoot.add(bGusset);

      // C/D-Pillars: positioned safely inside waistline (x=0.65m -> x=0.59m)
      const cStart = new THREE.Vector3(side * 0.65, beltlineY, -1.50);
      const cEnd = new THREE.Vector3(side * 0.59, pillarTopY, -1.50);
      const cPillar = CarBodyGenerator.buildSmoothPillar(cStart, cEnd, 0.095, 0.065, 0.030, this.bodyMaterial);
      carRoot.add(cPillar);

      const cGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.10);
      const cGusset = new THREE.Mesh(cGussetGeo, this.bodyMaterial);
      cGusset.position.set(side * 0.66, beltlineY, -1.49);
      cGusset.castShadow = true;
      carRoot.add(cGusset);

      // Roof Side Rails: sits right under roofBaseY, x=0.59m (well inside 0.65m roof half-width)
      const rStart = new THREE.Vector3(side * 0.59, pillarTopY, 0.45);
      const rEnd = new THREE.Vector3(side * 0.59, pillarTopY, -1.50);
      const sideRail = CarBodyGenerator.buildSmoothPillar(rStart, rEnd, 0.065, 0.060, 0.020, this.bodyMaterial);
      carRoot.add(sideRail);

      // --- INTEGRATED WINDOW SASH FRAMEWORK ---
      // 1. Door Window Sash - Top (runs inside rail, cleanly below roof)
      const topSashGeo = new THREE.BoxGeometry(0.03, 0.03, 1.95);
      const topSash = new THREE.Mesh(topSashGeo, this.plasticMaterial);
      topSash.position.set(side * 0.605, 1.44, -0.525);
      carRoot.add(topSash);

      // 2. Door Window Sash - Bottom (rests on beltline)
      const btmSashGeo = new THREE.BoxGeometry(0.04, 0.03, 1.95);
      const btmSash = new THREE.Mesh(btmSashGeo, this.plasticMaterial);
      btmSash.position.set(side * 0.66, beltlineY + 0.015, -0.525);
      carRoot.add(btmSash);

      // 3. A-Pillar Front Window Sash Post
      const fPostGeo = new THREE.BoxGeometry(0.03, 0.56, 0.03);
      const fPost = new THREE.Mesh(fPostGeo, this.plasticMaterial);
      fPost.position.set(side * 0.625, 1.16, 0.41);
      carRoot.add(fPost);

      // 4. Rear Quarter Window Post
      const rPostGeo = new THREE.BoxGeometry(0.03, 0.56, 0.03);
      const rPost = new THREE.Mesh(rPostGeo, this.plasticMaterial);
      rPost.position.set(side * 0.625, 1.16, -0.35);
      carRoot.add(rPost);

      // 5. Rugged Door Side Moldings (Adds rich bulging contour and muscular shoulder!)
      const moldGeo = new THREE.BoxGeometry(0.035, 0.16, 0.78);
      const mold = new THREE.Mesh(moldGeo, this.plasticMaterial);
      mold.position.set(side * 0.745, 0.52, 0.05);
      mold.castShadow = true;
      carRoot.add(mold);
    });

    // Windshield Upper Header (sits cleanly under roofBaseY)
    const wsHeaderGeo = new THREE.BoxGeometry(1.18, 0.065, 0.07);
    const wsHeader = new THREE.Mesh(wsHeaderGeo, this.bodyMaterial);
    wsHeader.position.set(0, 1.465, 0.45);
    carRoot.add(wsHeader);

    // Rear Hatch Upper Header (sits cleanly under roofBaseY)
    const rearHeaderGeo = new THREE.BoxGeometry(1.18, 0.065, 0.07);
    const rearHeader = new THREE.Mesh(rearHeaderGeo, this.bodyMaterial);
    rearHeader.position.set(0, 1.465, -1.50);
    carRoot.add(rearHeader);

    // ===============================================================
    // --- TOPMOST LAYER: CAMBERED CURVED ROOF PANEL ---
    // Sits directly on top of roofBaseY (1.50m) and spans wider (1.30m) & longer (2.02m)
    // than all frame members so NO frame member can EVER protrude!
    // ===============================================================
    const roofLength = 2.02;
    const roofWidth = 1.30;
    const roofMesh = CarBodyGenerator.buildCurvedRoof(
      roofWidth,
      roofLength,
      0.05,   // Solid 5cm thickness capping the frames
      0.038,  // Gentle crown camber dome
      -0.525, // Center Z
      roofBaseY, // Sits exactly on the 1.50m frame ceiling line
      this.roofMaterial
    );
    carRoot.add(roofMesh);

    // Drip Rails along the outer roof overhang
    [-1, 1].forEach((side) => {
      const railGeo = new THREE.BoxGeometry(0.025, 0.025, roofLength);
      const rail = new THREE.Mesh(railGeo, this.plasticMaterial);
      rail.position.set(side * (roofWidth / 2 - 0.01), roofBaseY + 0.055, -0.525);
      carRoot.add(rail);
    });

    // Roof Antenna on top of the roof dome
    const antBaseGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.03, 8);
    const antBase = new THREE.Mesh(antBaseGeo, this.plasticMaterial);
    antBase.position.set(-0.48, roofBaseY + 0.085, 0.25);
    carRoot.add(antBase);

    const antRodGeo = new THREE.CylinderGeometry(0.003, 0.005, 0.22, 6);
    antRodGeo.rotateZ(0.2);
    const antRod = new THREE.Mesh(antRodGeo, this.plasticMaterial);
    antRod.position.set(-0.51, roofBaseY + 0.185, 0.25);
    carRoot.add(antRod);

    // --- 3. CURVED & ROUNDED GLASS PANELS FITTED INTO SASH OPENINGS ---
    // A. Curved Panoramic Windshield
    const windshield = CarBodyGenerator.buildCurvedWindshield(
      1.16,
      0.68,
      0.045, // 4.5cm gentle outward curve
      -0.40, // Slant angle
      new THREE.Vector3(0, 1.16, 0.595),
      this.glassMaterial
    );
    carRoot.add(windshield);
    this.windshield = windshield;

    // Front wipers
    [-0.26, 0.26].forEach((x) => {
      const wiperGeo = new THREE.BoxGeometry(0.36, 0.015, 0.015);
      wiperGeo.rotateZ(-0.12);
      const wiper = new THREE.Mesh(wiperGeo, this.plasticMaterial);
      wiper.position.set(x, 0.90, 0.73);
      carRoot.add(wiper);
    });

    // B. Rounded Corner Side Windows (Sleek aerodynamic corner radius!)
    [-1, 1].forEach((side) => {
      const xPos = side * 0.625;
      const rotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;

      // Front door window with rounded corners
      const fWin = CarBodyGenerator.buildRoundedWindow(0.70, 0.54, 0.05, this.glassMaterial);
      fWin.rotation.y = rotY;
      fWin.position.set(xPos, 1.17, 0.05);
      carRoot.add(fWin);

      // Rear quarter window with rounded corners
      const rWin = CarBodyGenerator.buildRoundedWindow(0.98, 0.54, 0.05, this.glassMaterial);
      rWin.rotation.y = rotY;
      rWin.position.set(xPos, 1.17, -0.92);
      carRoot.add(rWin);
    });

    // C. Rear Hatch Window with Rounded Corners (Clean vertical fit at z=-1.505m)
    const rearWin = CarBodyGenerator.buildRoundedWindow(1.14, 0.54, 0.06, this.glassMaterial);
    rearWin.rotation.y = Math.PI;
    rearWin.position.set(0, 1.17, -1.505);
    carRoot.add(rearWin);

    // --- 4. Inner Wheelhouse Liners & Overfender Flares ---
    [
      { x: -0.62, z: frontWheelZ },
      { x: 0.62, z: frontWheelZ },
      { x: -0.62, z: rearWheelZ },
      { x: 0.62, z: rearWheelZ },
    ].forEach((pos) => {
      const innerWell = CarBodyGenerator.generateWheelWell(
        pos.x,
        wheelRadius + 0.04,
        pos.z,
        archRadius * 1.05,
        0.30,
        this.plasticMaterial
      );
      carRoot.add(innerWell);

      const archFlare = CarBodyGenerator.generateOverfenderArc(
        pos.x > 0 ? 0.74 : -0.74,
        wheelRadius + 0.03,
        pos.z,
        archRadius,
        0.065,
        this.plasticMaterial
      );
      carRoot.add(archFlare);
    });

    // ===============================================================
    // --- 5. FRONT FASCIA & BUMPER (STRICT Z-LAYER HIERARCHY!) ---
    // Body ends at z=1.48
    // Layer 1 (z=1.50): 5-Slot Grille & Headlight Bezel Frame
    // Layer 2 (z=1.52): Lenses, Projectors & DRL Rings
    // Layer 3 (z=1.55): Heavy-Duty Front Bumper Base
    // Layer 4 (z=1.59): Front Skid Guard & Fog Lamps
    // Layer 5 (z=1.61): License Plate "TRAIL J"
    // ===============================================================

    const grilleZ = 1.50;
    const fasciaGeo = new THREE.BoxGeometry(1.36, 0.30, 0.05);
    const fascia = new THREE.Mesh(fasciaGeo, this.plasticMaterial);
    fascia.position.set(0, 0.64, grilleZ);
    carRoot.add(fascia);

    // 5-Slot vertical grille slots
    const slotGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.18, 16);
    const slotMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 });
    for (let i = -2; i <= 2; i++) {
      const slot = new THREE.Mesh(slotGeo, slotMat);
      slot.position.set(i * 0.10, 0.64, grilleZ + 0.028);
      carRoot.add(slot);
    }

    // Round LED Headlights with Projector & DRL Halo Ring
    const hlRadius = 0.10;
    const hlBezelGeo = new THREE.CylinderGeometry(hlRadius + 0.015, hlRadius + 0.015, 0.04, 32);
    hlBezelGeo.rotateX(Math.PI / 2);

    const hlLensGeo = new THREE.CylinderGeometry(hlRadius, hlRadius, 0.02, 32);
    hlLensGeo.rotateX(Math.PI / 2);

    const hlProjectorGeo = new THREE.SphereGeometry(hlRadius * 0.45, 16, 16);

    [-1, 1].forEach((side) => {
      const hX = side * 0.50;
      const hY = 0.64;

      const bezel = new THREE.Mesh(hlBezelGeo, this.plasticMaterial);
      bezel.position.set(hX, hY, grilleZ + 0.02);
      carRoot.add(bezel);

      const lens = new THREE.Mesh(hlLensGeo, this.headlightEmissive);
      lens.position.set(hX, hY, grilleZ + 0.035);
      carRoot.add(lens);

      const proj = new THREE.Mesh(hlProjectorGeo, this.chromeMaterial);
      proj.position.set(hX, hY, grilleZ + 0.04);
      carRoot.add(proj);

      const turnGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.02, 16);
      turnGeo.rotateX(Math.PI / 2);
      const turn = new THREE.Mesh(turnGeo, this.amberEmissive);
      turn.position.set(side * 0.63, hY, grilleZ + 0.02);
      carRoot.add(turn);
    });

    // Front Bumper (Layer 3: Clearly in front of body at z=1.55!)
    const fBumperGeo = new THREE.BoxGeometry(1.48, 0.28, 0.18);
    const fBumper = new THREE.Mesh(fBumperGeo, this.plasticMaterial);
    fBumper.position.set(0, 0.38, 1.55);
    fBumper.castShadow = true;
    carRoot.add(fBumper);

    // Front Skid Incline (Layer 4: at z=1.59)
    const fSkidGeo = new THREE.BoxGeometry(0.95, 0.14, 0.16);
    fSkidGeo.rotateX(-0.4);
    const fSkid = new THREE.Mesh(fSkidGeo, this.silverMaterial);
    fSkid.position.set(0, 0.28, 1.59);
    carRoot.add(fSkid);

    // Front Fog Lamps (Layer 4: at z=1.63)
    const fogGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16);
    fogGeo.rotateX(Math.PI / 2);
    [-0.50, 0.50].forEach((x) => {
      const fog = new THREE.Mesh(fogGeo, this.headlightEmissive);
      fog.position.set(x, 0.38, 1.635);
      carRoot.add(fog);
    });

    // Front License Plate (Layer 5: at z=1.65)
    const frontPlate = this.createLicensePlate('TRAIL J', true);
    frontPlate.position.set(0, 0.40, 1.67);
    carRoot.add(frontPlate);

    // ===============================================================
    // --- 6. REAR BUMPER & REAR FASCIA (CLEAN VERTICAL LAYERS!) ---
    // Tailgate is flush at z=-1.50
    // Rear Bumper stands cleanly at z=-1.54
    // Taillights at z=-1.61
    // License Plate at z=-1.62
    // Spare Wheel Mount at z=-1.50, Wheel at z=-1.68
    // ===============================================================

    const rBumperGeo = new THREE.BoxGeometry(1.48, 0.26, 0.18);
    const rBumper = new THREE.Mesh(rBumperGeo, this.plasticMaterial);
    rBumper.position.set(0, 0.38, -1.54);
    rBumper.castShadow = true;
    carRoot.add(rBumper);

    // Rear Horizontal Taillights (Clear outer face!)
    const tailGeo = new THREE.BoxGeometry(0.22, 0.08, 0.02);
    [-0.50, 0.50].forEach((x) => {
      const tail = new THREE.Mesh(tailGeo, this.taillightEmissive);
      tail.position.set(x, 0.40, -1.635);
      carRoot.add(tail);

      const amberSeg = new THREE.BoxGeometry(0.06, 0.07, 0.022);
      const amber = new THREE.Mesh(amberSeg, this.amberEmissive);
      amber.position.set(x + (x > 0 ? 0.07 : -0.07), 0.40, -1.635);
      carRoot.add(amber);
    });

    // Rear License Plate
    const rearPlate = this.createLicensePlate('TRAIL J', true);
    rearPlate.position.set(0, 0.36, -1.64);
    rearPlate.rotation.y = Math.PI;
    carRoot.add(rearPlate);

    // Tailgate Solid Structure Panel (Eliminates any concave look, adds rugged offroad stamping!)
    const tailgatePlateGeo = new THREE.BoxGeometry(1.26, 0.46, 0.02);
    const tailgatePlate = new THREE.Mesh(tailgatePlateGeo, this.bodyMaterial);
    tailgatePlate.position.set(0, 0.65, -1.505);
    tailgatePlate.castShadow = true;
    carRoot.add(tailgatePlate);

    // Rear Side-Swinging Door Handle
    const rDoorHandleGeo = new THREE.BoxGeometry(0.12, 0.03, 0.025);
    const rDoorHandle = new THREE.Mesh(rDoorHandleGeo, this.plasticMaterial);
    rDoorHandle.position.set(0.48, 0.72, -1.52);
    carRoot.add(rDoorHandle);

    // Rear High-Mount Stop Lamp (CHMSL)
    const chmslGeo = new THREE.BoxGeometry(0.18, 0.025, 0.02);
    const chmsl = new THREE.Mesh(chmslGeo, this.taillightEmissive);
    chmsl.position.set(0, 1.45, -1.51);
    carRoot.add(chmsl);

    // Rear Wiper
    const rWiperGeo = new THREE.BoxGeometry(0.24, 0.012, 0.012);
    rWiperGeo.rotateZ(0.2);
    const rWiper = new THREE.Mesh(rWiperGeo, this.plasticMaterial);
    rWiper.position.set(-0.35, 0.95, -1.515);
    carRoot.add(rWiper);

    // --- 7. Full-Size Rear Mounted Spare Wheel ---
    // Mounted cleanly on tailgate: wheel face (+X) correctly faces rearward (-Z) with rotation.y = PI/2,
    // NO brakes/calipers attached, and bracket stays cleanly behind wheel inside the mount gap.
    const spareGroup = new THREE.Group();
    const bracketGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.06, 16);
    bracketGeo.rotateX(Math.PI / 2);
    const bracket = new THREE.Mesh(bracketGeo, this.plasticMaterial);
    bracket.position.z = -0.03; // Sits flush between tailgate (z=0) and inner tire wall (z=-0.06)
    spareGroup.add(bracket);

    // includeBrakes = false: Eliminates brake disc and caliper completely from spare tire!
    const spareWheel = this.createDetailedWheel(wheelRadius, wheelWidth, wheelRadius * 0.58, 8, true, false);
    // Outer face (+X) faces rearward (-Z): applyAxisAngle(Y, PI/2) rotates +X into -Z!
    spareWheel.rotation.y = Math.PI / 2;
    spareWheel.position.z = -0.16;
    spareGroup.add(spareWheel);

    spareGroup.position.set(0, 0.82, -1.50);
    carRoot.add(spareGroup);

    // --- 8. Side Mirrors & Door Handles ---
    [-1, 1].forEach((side) => {
      const mirrorGroup = new THREE.Group();
      const stemGeo = new THREE.BoxGeometry(0.06, 0.025, 0.04);
      const stem = new THREE.Mesh(stemGeo, this.plasticMaterial);
      mirrorGroup.add(stem);

      const housingGeo = new THREE.BoxGeometry(0.06, 0.12, 0.16);
      const housing = new THREE.Mesh(housingGeo, this.plasticMaterial);
      housing.position.set(side * 0.06, 0.03, 0);
      mirrorGroup.add(housing);

      const glassGeo = new THREE.PlaneGeometry(0.01, 0.10);
      const glass = new THREE.Mesh(glassGeo, this.chromeMaterial);
      glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      glass.position.set(side * 0.09, 0.03, -0.07);
      mirrorGroup.add(glass);

      mirrorGroup.position.set(side * 0.72, 1.00, 0.46);
      carRoot.add(mirrorGroup);

      const handleGeo = new THREE.BoxGeometry(0.02, 0.025, 0.10);
      const handle = new THREE.Mesh(handleGeo, this.plasticMaterial);
      handle.position.set(side * 0.72, 0.82, 0.10);
      carRoot.add(handle);
    });

    // --- 9. 4 EXPOSED ALLOY ROAD WHEELS (same spec as the spare tire) ---
    this.addRoadWheels(carRoot, trackWidth, frontWheelZ, rearWheelZ, wheelRadius, wheelWidth);

    // Exhaust Pipe
    const exhaustGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.20, 16);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaust = new THREE.Mesh(exhaustGeo, this.chromeMaterial);
    exhaust.position.set(0.40, 0.22, -1.54);
    carRoot.add(exhaust);

    this.group.add(carRoot);
    this.addContactShadow(2.5, 4.5);
  }
}
