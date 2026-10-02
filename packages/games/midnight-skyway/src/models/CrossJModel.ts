import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { CarBodyGenerator, LowerBodySection } from './CarBodyGenerator';
import { CarInterior } from './CarInterior';

export class CrossJModel extends CarBase {
  public readonly specs: CarSpecs = {
    name: 'CROSS J',
    category: '軽クロスオーバー SUV',
    length: '3,395 mm',
    width: '1,475 mm',
    height: '1,500 mm',
    wheelbase: '2,460 mm',
    drivetrain: 'フルタイム4WD / ハイトワゴン',
    weight: '870 kg',
    description: '全高1.50mの3面図の寸法比率を正確に再現。重厚な6ライトピラーフレーム、切削アルミホイール、精密内装を実装。',
  };

  constructor() {
    super();
    this.setBodyColor(0xe05615); // Active Orange
    this.setRoofColor(0xf5f6fa); // Pure White roof
    this.buildCar();
  }

  private buildCar(): void {
    const carRoot = new THREE.Group();

    // Wheel & Stance Specifications (Proportional to 1.50m total height!)
    const frontWheelZ = 1.18;
    const rearWheelZ = -1.22;
    const wheelRadius = 0.31;
    const archRadius = 0.37;
    const wheelWidth = 0.25;
    const trackWidth = 1.30;

    // --- 0. Detailed Cabin Interior ---
    const interior = new CarInterior({
      cabinLength: 2.15,
      cabinWidth: 1.28,
      cabinHeight: 0.95,
      floorY: 0.30,
      centerZ: -0.48,
      dashZ: 0.38,
      frontSeatZ: -0.12,
      rearSeatZ: -0.96,
      steeringSide: 'right', // RHD
    });
    carRoot.add(interior.group);

    // --- 1. Molded LOWER Crossover Body Shell (Accurate Height: Beltline at y=0.86m!) ---
    // Clean Front Nose at z=1.46m (no overhang ahead of grille)
    // Flat Vertical Rear Gate at z=-1.50m (eliminates any concave sag!)
    // --- 1. Molded LOWER Crossover Body Shell (Accurate Height: Beltline at y=0.86m!) ---
    // True geometric wheelhouse cutouts cleanly hollow out all space around wheels (no body penetration!)
    // Lower body sections molded with RICH BULGING CONTOURS (muscular crossover curves & barrel door bulges)!
    const lowerSections: LowerBodySection[] = [
      // 0: Nose Front Tip (Grille mount base at z=1.46m) - Hood center crown
      {
        z: 1.46,
        yBottom: 0.22,
        yTop: 0.81,               // Power bulge center peak
        sill: [0.68, 0.24],
        fender: [0.73, 0.58],
        beltline: [0.705, 0.79],
      },
      // 1: Hood Front Step
      {
        z: 1.44,
        yBottom: 0.22,
        yTop: 0.84,
        sill: [0.68, 0.24],
        fender: [0.74, 0.62],
        beltline: [0.71, 0.82],
      },
      // 2: Front Wheelhouse FRONT Lip (Clear of tire front!)
      {
        z: 1.43,
        yBottom: 0.22,
        yTop: 0.85,
        sill: [0.44, 0.24],       // Inward behind tire
        wheelArch: [0.77, 0.68],  // Well above tire top (y=0.63m)!
        fender: [0.81, 0.74],     // Prominent crossover flare
        beltline: [0.72, 0.84],
      },
      // 3: Front Wheelhouse CENTER (Full open arch over wide tire!)
      {
        z: frontWheelZ, // 1.18
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.44, 0.24],       // Inside chassis floor
        wheelArch: [0.79, 0.73],  // Generous 10cm clearance above tire!
        fender: [0.82, 0.77],     // Full wide blister arch
        beltline: [0.725, 0.85],
      },
      // 4: Front Wheelhouse REAR Lip (Clear of tire rear at z=0.87m!)
      {
        z: 0.84,
        yBottom: 0.22,
        yTop: 0.87,
        sill: [0.44, 0.24],       // Inward behind tire
        wheelArch: [0.77, 0.68],  // Well above tire top!
        fender: [0.81, 0.74],
        beltline: [0.72, 0.86],
      },
      // 5: Cowl / Hood Rear
      {
        z: 0.78,
        yBottom: 0.22,
        yTop: 0.88,               // Smooth junction with cowl
        sill: [0.68, 0.24],
        fender: [0.745, 0.64],
        beltline: [0.72, 0.86],
      },
      // 6: Front Door (Cabin begins - rich curved barrel door bulge!)
      {
        z: 0.45,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],
        fender: [0.745, 0.58],    // Distinct outward door swell
        beltline: [0.715, 0.86],  // Well-defined shoulder
      },
      // 7: Door Center (Maximum rich body curvature)
      {
        z: 0.05,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],
        fender: [0.750, 0.58],    // Fullest mid-door swell
        beltline: [0.715, 0.86],
      },
      // 8: B-Pillar Zone
      {
        z: -0.32,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],
        fender: [0.745, 0.58],
        beltline: [0.715, 0.86],
      },
      // 9: Rear Door & C-Pillar Zone
      {
        z: -0.75,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],
        fender: [0.745, 0.58],
        beltline: [0.715, 0.86],
      },
      // 10: Rear Wheelhouse FRONT Lip (Clear of tire front at z=-0.91m!)
      {
        z: -0.88,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.44, 0.24],       // Inward behind tire
        wheelArch: [0.77, 0.68],  // Well above tire top!
        fender: [0.81, 0.74],     // Chunky rear blister flare
        beltline: [0.72, 0.86],
      },
      // 11: Rear Wheelhouse CENTER (Full open arch over wide rear tire!)
      {
        z: rearWheelZ, // -1.22
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.44, 0.24],       // Inside chassis floor
        wheelArch: [0.79, 0.73],  // Generous 10cm clearance above tire!
        fender: [0.82, 0.77],
        beltline: [0.725, 0.86],
      },
      // 12: Rear Wheelhouse REAR Lip (Clear of tire rear!)
      {
        z: -1.48,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.44, 0.24],       // Inward behind tire
        wheelArch: [0.77, 0.68],  // Well above tire top!
        fender: [0.81, 0.74],
        beltline: [0.72, 0.86],
      },
      // 13: Solid Vertical Rear Hatch (Flat back, flush at z=-1.50m!)
      {
        z: -1.50,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],
        fender: [0.73, 0.64],
        beltline: [0.71, 0.86],
      },
    ];

    const isCabinZone = [
      false, false, false, false, false, false,
      true, true, true, true,
      true, true, true,
      false
    ];

    // Wheel Arch Cutout Zones (100% hollows out the body over the wide crossover tires!)
    const isWheelArchZone = [
      false, false,
      true, true, true,   // Front wheel arch zone (sections 2, 3, 4: z=0.84 to 1.43m)
      false, false, false, false, false,
      true, true, true,   // Rear wheel arch zone (sections 10, 11, 12: z=-0.88 to -1.48m)
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
    const beltlineY = 0.86;
    const roofBaseY = 1.48; // The strict baseline level where the roof begins!
    const pillarTopY = 1.44; // Frame tops sit strictly inside/underneath roofBaseY!

    // A. SOLID CABIN BASE FRAME (Hermetically connects lower body waistline to upper pillars & glass)
    const baseFrame = CarBodyGenerator.buildCabinBaseFrame(
      beltlineY,
      0.78,   // Front cowl (windshield base)
      -1.50,  // Rear tailgate waist
      0.70,   // Half width strictly inside the 0.715m bulging beltline!
      this.bodyMaterial
    );
    carRoot.add(baseFrame);

    [-1, 1].forEach((side) => {
      // A-Pillars with Smooth Rounded Contours (positioned safely inside lower body x=0.65m -> x=0.59m)
      const aStart = new THREE.Vector3(side * 0.65, beltlineY, 0.78);
      const aEnd = new THREE.Vector3(side * 0.59, pillarTopY, 0.45);
      const aPillar = CarBodyGenerator.buildSmoothPillar(aStart, aEnd, 0.075, 0.065, 0.025, this.roofMaterial);
      carRoot.add(aPillar);

      // A-Pillar Base Gusset (Merges pillar seamlessly into cowl & front fender)
      const aGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.10);
      const aGusset = new THREE.Mesh(aGussetGeo, this.roofMaterial);
      aGusset.position.set(side * 0.66, beltlineY, 0.76);
      aGusset.castShadow = true;
      carRoot.add(aGusset);

      // B-Pillars with Smooth Rounded Contours (x=0.65m -> x=0.59m)
      const bStart = new THREE.Vector3(side * 0.65, beltlineY, -0.32);
      const bEnd = new THREE.Vector3(side * 0.59, pillarTopY, -0.32);
      const bPillar = CarBodyGenerator.buildSmoothPillar(bStart, bEnd, 0.080, 0.065, 0.025, this.plasticMaterial);
      carRoot.add(bPillar);

      const bGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
      const bGusset = new THREE.Mesh(bGussetGeo, this.plasticMaterial);
      bGusset.position.set(side * 0.66, beltlineY, -0.32);
      bGusset.castShadow = true;
      carRoot.add(bGusset);

      // C-Pillars (6-light window divider pillars) with Smooth Rounded Contours
      const cStart = new THREE.Vector3(side * 0.65, beltlineY, -0.85);
      const cEnd = new THREE.Vector3(side * 0.59, pillarTopY, -0.85);
      const cPillar = CarBodyGenerator.buildSmoothPillar(cStart, cEnd, 0.080, 0.065, 0.025, this.plasticMaterial);
      carRoot.add(cPillar);

      const cGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.10);
      const cGusset = new THREE.Mesh(cGussetGeo, this.plasticMaterial);
      cGusset.position.set(side * 0.66, beltlineY, -0.85);
      cGusset.castShadow = true;
      carRoot.add(cGusset);

      // D-Pillars (Rear corner white pillars - smoothly terminates under roof base)
      const dStart = new THREE.Vector3(side * 0.65, beltlineY, -1.50);
      const dEnd = new THREE.Vector3(side * 0.59, pillarTopY, -1.50);
      const dPillar = CarBodyGenerator.buildSmoothPillar(dStart, dEnd, 0.095, 0.065, 0.030, this.roofMaterial);
      carRoot.add(dPillar);

      const dGussetGeo = new THREE.BoxGeometry(0.08, 0.08, 0.10);
      const dGusset = new THREE.Mesh(dGussetGeo, this.roofMaterial);
      dGusset.position.set(side * 0.66, beltlineY, -1.49);
      dGusset.castShadow = true;
      carRoot.add(dGusset);

      // Roof Side Rails with Smooth Contours (sits right under roofBaseY, x=0.59m)
      const rStart = new THREE.Vector3(side * 0.59, pillarTopY, 0.45);
      const rEnd = new THREE.Vector3(side * 0.59, pillarTopY, -1.50);
      const sideRail = CarBodyGenerator.buildSmoothPillar(rStart, rEnd, 0.065, 0.060, 0.020, this.roofMaterial);
      carRoot.add(sideRail);

      // --- INTEGRATED WINDOW SASH FRAMEWORK ---
      // 1. Door Window Sash - Top (runs along roof rail, cleanly under roof)
      const topSashGeo = new THREE.BoxGeometry(0.03, 0.03, 1.95);
      const topSash = new THREE.Mesh(topSashGeo, this.plasticMaterial);
      topSash.position.set(side * 0.605, 1.42, -0.525);
      carRoot.add(topSash);

      // 2. Door Window Sash - Bottom (weatherstrip rail along beltline)
      const btmSashGeo = new THREE.BoxGeometry(0.04, 0.03, 1.95);
      const btmSash = new THREE.Mesh(btmSashGeo, this.plasticMaterial);
      btmSash.position.set(side * 0.66, beltlineY + 0.015, -0.525);
      carRoot.add(btmSash);

      // 3. A-Pillar Front Window Sash Post
      const fPostGeo = new THREE.BoxGeometry(0.03, 0.54, 0.03);
      const fPost = new THREE.Mesh(fPostGeo, this.plasticMaterial);
      fPost.position.set(side * 0.625, 1.15, 0.45);
      carRoot.add(fPost);

      // 4. B-Pillar Center Window Divider Post
      const bPostGeo = new THREE.BoxGeometry(0.03, 0.54, 0.03);
      const bPost = new THREE.Mesh(bPostGeo, this.plasticMaterial);
      bPost.position.set(side * 0.625, 1.15, -0.32);
      carRoot.add(bPost);

      // 5. C-Pillar Rear Window Divider Post
      const cPostGeo = new THREE.BoxGeometry(0.03, 0.54, 0.03);
      const cPost = new THREE.Mesh(cPostGeo, this.plasticMaterial);
      cPost.position.set(side * 0.625, 1.15, -0.85);
      carRoot.add(cPost);

      // 6. Crossover Side Body Cladding Moldings (Muscular bulging lower contour)
      const moldGeo = new THREE.BoxGeometry(0.035, 0.16, 1.30);
      const mold = new THREE.Mesh(moldGeo, this.plasticMaterial);
      mold.position.set(side * 0.745, 0.48, -0.15);
      mold.castShadow = true;
      carRoot.add(mold);
    });

    // Windshield Upper Header (sits cleanly under roofBaseY)
    const wsHeaderGeo = new THREE.BoxGeometry(1.18, 0.065, 0.07);
    const wsHeader = new THREE.Mesh(wsHeaderGeo, this.roofMaterial);
    wsHeader.position.set(0, 1.445, 0.45);
    carRoot.add(wsHeader);

    // Rear Hatch Upper Header (sits cleanly under roofBaseY)
    const rearHeaderGeo = new THREE.BoxGeometry(1.18, 0.065, 0.07);
    const rearHeader = new THREE.Mesh(rearHeaderGeo, this.roofMaterial);
    rearHeader.position.set(0, 1.445, -1.50);
    carRoot.add(rearHeader);

    // ===============================================================
    // --- TOPMOST LAYER: CAMBERED CURVED ROOF PANEL ---
    // Sits directly on top of roofBaseY (1.48m) and spans wider (1.30m) & longer (2.02m)
    // than all frame members so NO frame member can EVER protrude!
    // ===============================================================
    const roofLength = 2.02;
    const roofWidth = 1.30;
    const roofMesh = CarBodyGenerator.buildCurvedRoof(
      roofWidth,
      roofLength,
      0.05,   // Solid 5cm thickness capping the frames
      0.040,  // Gentle crossover crown camber
      -0.525, // Center Z
      roofBaseY, // Sits exactly on the 1.48m frame ceiling line
      this.roofMaterial
    );
    carRoot.add(roofMesh);

    // Integrated Rear Spoiler with Rounded Form
    const spoilerGeo = new THREE.BoxGeometry(1.22, 0.05, 0.14);
    const spoiler = new THREE.Mesh(spoilerGeo, this.roofMaterial);
    spoiler.position.set(0, roofBaseY + 0.05, -1.53);
    spoiler.castShadow = true;
    carRoot.add(spoiler);

    // Roof Antenna on top of the roof dome
    const antBaseGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.03, 8);
    const antBase = new THREE.Mesh(antBaseGeo, this.plasticMaterial);
    antBase.position.set(0, roofBaseY + 0.08, -0.65);
    carRoot.add(antBase);

    const antRodGeo = new THREE.CylinderGeometry(0.003, 0.005, 0.20, 6);
    antRodGeo.rotateX(0.35);
    const antRod = new THREE.Mesh(antRodGeo, this.plasticMaterial);
    antRod.position.set(0, roofBaseY + 0.17, -0.73);
    carRoot.add(antRod);

    // --- 3. CURVED & ROUNDED 6-LIGHT WINDOWS FITTED INTO SASH OPENINGS ---
    // A. Curved Panoramic Windshield (Bulges forward gracefully, matches hood curvature!)
    const windshield = CarBodyGenerator.buildCurvedWindshield(
      1.16,
      0.68,
      0.045, // 4.5cm gentle outward curve
      -0.46, // Slant angle
      new THREE.Vector3(0, 1.15, 0.585),
      this.glassMaterial
    );
    carRoot.add(windshield);

    // Front wipers
    [-0.26, 0.26].forEach((x) => {
      const wiperGeo = new THREE.BoxGeometry(0.36, 0.015, 0.015);
      wiperGeo.rotateZ(-0.10);
      const wiper = new THREE.Mesh(wiperGeo, this.plasticMaterial);
      wiper.position.set(x, 0.88, 0.72);
      carRoot.add(wiper);
    });

    // B. Rounded 6-Light Side Windows (Sleek aerodynamic corner radius!)
    [-1, 1].forEach((side) => {
      const xPos = side * 0.625;
      const rotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;

      // Front door window with rounded corners
      const fWin = CarBodyGenerator.buildRoundedWindow(0.70, 0.53, 0.05, this.glassMaterial);
      fWin.rotation.y = rotY;
      fWin.position.set(xPos, 1.15, 0.10);
      carRoot.add(fWin);

      // Rear door window with rounded corners
      const rWin = CarBodyGenerator.buildRoundedWindow(0.56, 0.53, 0.05, this.glassMaterial);
      rWin.rotation.y = rotY;
      rWin.position.set(xPos, 1.15, -0.62);
      carRoot.add(rWin);

      // C/D Quarter glass with rounded corners
      const qWin = CarBodyGenerator.buildRoundedWindow(0.44, 0.52, 0.06, this.glassMaterial);
      qWin.rotation.y = rotY;
      qWin.position.set(xPos, 1.145, -1.22);
      carRoot.add(qWin);
    });

    // C. Rear Hatch Window with Rounded Corners (Clean vertical fit at z=-1.505m)
    const rearWin = CarBodyGenerator.buildRoundedWindow(1.14, 0.53, 0.06, this.glassMaterial);
    rearWin.rotation.y = Math.PI;
    rearWin.position.set(0, 1.15, -1.505);
    carRoot.add(rearWin);

    const rWiperGeo = new THREE.BoxGeometry(0.24, 0.012, 0.012);
    rWiperGeo.rotateZ(0.25);
    const rWiper = new THREE.Mesh(rWiperGeo, this.plasticMaterial);
    rWiper.position.set(0.08, 0.98, -1.52);
    carRoot.add(rWiper);

    // --- 4. Inner Wheelhouse Liners & Molded Cladding ---
    [
      { x: -0.60, z: frontWheelZ },
      { x: 0.60, z: frontWheelZ },
      { x: -0.60, z: rearWheelZ },
      { x: 0.60, z: rearWheelZ },
    ].forEach((pos) => {
      const innerWell = CarBodyGenerator.generateWheelWell(
        pos.x,
        wheelRadius + 0.04,
        pos.z,
        archRadius * 1.05,
        0.28,
        this.plasticMaterial
      );
      carRoot.add(innerWell);

      const archFlare = CarBodyGenerator.generateOverfenderArc(
        pos.x > 0 ? 0.72 : -0.72,
        wheelRadius + 0.03,
        pos.z,
        archRadius,
        0.045,
        this.plasticMaterial
      );
      carRoot.add(archFlare);
    });

    // ===============================================================
    // --- 5. FRONT FASCIA & BUMPER (STRICT Z-LAYER HIERARCHY!) ---
    // Body ends at z=1.46
    // Layer 1 (z=1.50): Oval Headlights & Grille Frame
    // Layer 2 (z=1.52): Mesh Inlay, Chrome Emblems & Lamps
    // Layer 3 (z=1.55): Molded Front Bumper
    // Layer 4 (z=1.62): Silver Skid Guard & Fog Lamps
    // Layer 5 (z=1.65): License Plate "CROSS J"
    // ===============================================================
    const grilleZ = 1.50;
    const grilleGeo = new THREE.BoxGeometry(0.78, 0.16, 0.04);
    const grille = new THREE.Mesh(grilleGeo, this.plasticMaterial);
    grille.position.set(0, 0.58, grilleZ);
    carRoot.add(grille);

    const meshGeo = new THREE.BoxGeometry(0.74, 0.12, 0.045);
    const meshInlay = new THREE.Mesh(meshGeo, this.chromeMaterial);
    meshInlay.position.set(0, 0.58, grilleZ + 0.008);
    carRoot.add(meshInlay);

    const emblemGeo = new THREE.ConeGeometry(0.04, 0.05, 3);
    emblemGeo.rotateZ(Math.PI);
    const emblem = new THREE.Mesh(emblemGeo, this.silverMaterial);
    emblem.position.set(0, 0.58, grilleZ + 0.025);
    carRoot.add(emblem);

    const ovalWidth = 0.26;
    const ovalHeight = 0.18;
    const ovalGeo = new THREE.BoxGeometry(ovalWidth, ovalHeight, 0.03);
    const lampRadius = 0.09;
    const lampGeo = new THREE.CylinderGeometry(lampRadius, lampRadius, 0.02, 32);
    lampGeo.rotateX(Math.PI / 2);

    [-1, 1].forEach((side) => {
      const hX = side * 0.50;
      const hY = 0.58;

      const bezel = new THREE.Mesh(ovalGeo, this.chromeMaterial);
      bezel.position.set(hX, hY, grilleZ + 0.01);
      carRoot.add(bezel);

      const lamp = new THREE.Mesh(lampGeo, this.headlightEmissive);
      lamp.position.set(hX, hY, grilleZ + 0.028);
      carRoot.add(lamp);

      const amberBarGeo = new THREE.BoxGeometry(0.035, 0.12, 0.02);
      const amberBar = new THREE.Mesh(amberBarGeo, this.amberEmissive);
      amberBar.position.set(hX + (side > 0 ? 0.09 : -0.09), hY, grilleZ + 0.03);
      carRoot.add(amberBar);
    });

    // Front Bumper (Layer 3: at z=1.55)
    const fBumperGeo = new THREE.BoxGeometry(1.46, 0.26, 0.18);
    const fBumper = new THREE.Mesh(fBumperGeo, this.plasticMaterial);
    fBumper.position.set(0, 0.32, 1.55);
    fBumper.castShadow = true;
    carRoot.add(fBumper);

    // Front Skid Guard (Layer 4: at z=1.62)
    const fSkidGeo = new THREE.BoxGeometry(0.88, 0.14, 0.06);
    const fSkid = new THREE.Mesh(fSkidGeo, this.silverMaterial);
    fSkid.position.set(0, 0.24, 1.62);
    carRoot.add(fSkid);

    // Front Fog Lamps (Layer 4: at z=1.642)
    const fogGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.02, 16);
    fogGeo.rotateX(Math.PI / 2);
    [-0.48, 0.48].forEach((x) => {
      const fog = new THREE.Mesh(fogGeo, this.headlightEmissive);
      fog.position.set(x, 0.32, 1.642);
      carRoot.add(fog);
    });

    // Front License Plate (Layer 5: at z=1.655)
    const frontPlate = this.createLicensePlate('CROSS J', true);
    frontPlate.position.set(0, 0.34, 1.655);
    carRoot.add(frontPlate);

    // ===============================================================
    // --- 7. REAR FASCIA & VERTICAL TAILLIGHTS (FLAT & STRUCTURED) ---
    // ===============================================================
    // --- 7. REAR COMBINATION LAMPS & TAILGATE FASCIA ---
    // Tailgate flush at z=-1.50m
    // Taillights integrated cleanly into D-pillar & rear quarter recess (zero overhang!)
    // ===============================================================
    [-1, 1].forEach((side) => {
      const lampGroup = new THREE.Group();
      const tX = side * 0.63; // Inset safely inside D-pillar outer profile (0.675m)
      const tY = 0.87;        // Spans y=0.72m to 1.02m, perfectly within rear pillar base
      const tZ = -1.506;      // Flush-mounted against tailgate sheetmetal (z=-1.50m)

      // 1. Black Resin Bezel Housing (Flush recess base)
      const bezelGeo = new THREE.BoxGeometry(0.060, 0.31, 0.016);
      const bezel = new THREE.Mesh(bezelGeo, this.plasticMaterial);
      lampGroup.add(bezel);

      // 2. Upper Red LED Stop/Tail Lamp Segment
      const redGeo = new THREE.BoxGeometry(0.052, 0.14, 0.012);
      const redLens = new THREE.Mesh(redGeo, this.taillightEmissive);
      redLens.position.set(0, 0.07, 0.006);
      lampGroup.add(redLens);

      // 3. Middle Amber Turn Signal Segment
      const amberGeo = new THREE.BoxGeometry(0.052, 0.065, 0.012);
      const amberLens = new THREE.Mesh(amberGeo, this.amberEmissive);
      amberLens.position.set(0, -0.035, 0.006);
      lampGroup.add(amberLens);

      // 4. Lower White Reverse Backup Lamp Segment
      const revGeo = new THREE.BoxGeometry(0.052, 0.055, 0.012);
      const revLens = new THREE.Mesh(revGeo, this.headlightEmissive);
      revLens.position.set(0, -0.098, 0.006);
      lampGroup.add(revLens);

      lampGroup.position.set(tX, tY, tZ);
      carRoot.add(lampGroup);
    });

    // Rear Hatch Accent Garnish & Door Handle
    const garnishGeo = new THREE.BoxGeometry(0.50, 0.045, 0.025);
    const garnish = new THREE.Mesh(garnishGeo, this.silverMaterial);
    garnish.position.set(0, 0.74, -1.512);
    carRoot.add(garnish);

    const rHandleGeo = new THREE.BoxGeometry(0.16, 0.02, 0.02);
    const rHandle = new THREE.Mesh(rHandleGeo, this.plasticMaterial);
    rHandle.position.set(0, 0.71, -1.522);
    carRoot.add(rHandle);

    // Rear Bumper with Silver Skid Plate
    const rBumperGeo = new THREE.BoxGeometry(1.46, 0.26, 0.18);
    const rBumper = new THREE.Mesh(rBumperGeo, this.plasticMaterial);
    rBumper.position.set(0, 0.32, -1.54);
    rBumper.castShadow = true;
    carRoot.add(rBumper);

    const rSkidGeo = new THREE.BoxGeometry(0.88, 0.12, 0.06);
    const rSkid = new THREE.Mesh(rSkidGeo, this.silverMaterial);
    rSkid.position.set(0, 0.24, -1.61);
    carRoot.add(rSkid);

    const refGeo = new THREE.BoxGeometry(0.14, 0.035, 0.02);
    [-0.48, 0.48].forEach((x) => {
      const refMesh = new THREE.Mesh(refGeo, this.taillightEmissive);
      refMesh.position.set(x, 0.34, -1.632);
      carRoot.add(refMesh);
    });

    const rearPlate = this.createLicensePlate('CROSS J', true);
    rearPlate.position.set(0, 0.34, -1.638);
    rearPlate.rotation.y = Math.PI;
    carRoot.add(rearPlate);

    // --- 8. White 2-Tone Rounded Mirrors ---
    [-1, 1].forEach((side) => {
      const mirrorGroup = new THREE.Group();
      const stemGeo = new THREE.CylinderGeometry(0.015, 0.02, 0.06, 8);
      stemGeo.rotateZ(side * 0.4);
      const stem = new THREE.Mesh(stemGeo, this.plasticMaterial);
      mirrorGroup.add(stem);

      const mirrorHousing = new THREE.SphereGeometry(0.08, 16, 16);
      mirrorHousing.scale(0.8, 0.7, 1.2);
      const housing = new THREE.Mesh(mirrorHousing, this.roofMaterial);
      housing.position.set(side * 0.06, 0.04, 0);
      mirrorGroup.add(housing);

      const glassGeo = new THREE.PlaneGeometry(0.01, 0.10);
      const glass = new THREE.Mesh(glassGeo, this.chromeMaterial);
      glass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      glass.position.set(side * 0.09, 0.04, -0.06);
      mirrorGroup.add(glass);

      mirrorGroup.position.set(side * 0.72, 0.95, 0.44);
      carRoot.add(mirrorGroup);

      [0.15, -0.55].forEach((zH) => {
        const handleGeo = new THREE.BoxGeometry(0.02, 0.025, 0.10);
        const handle = new THREE.Mesh(handleGeo, this.plasticMaterial);
        handle.position.set(side * 0.72, 0.78, zH);
        carRoot.add(handle);
      });
    });

    // --- 9. 4 EXPOSED ALLOY ROAD WHEELS (IDENTICAL TO HIGH-DETAIL SPARE TIRE!) ---
    // Right wheels (x > 0): rotation.y = 0  -> machined silver face (+X) points RIGHT OUTWARD!
    // Left wheels (x < 0):  rotation.y = PI -> machined silver face (+X) points LEFT OUTWARD!
    const wheelPositions = [
      { x: -trackWidth / 2, z: frontWheelZ, isLeft: true },
      { x: trackWidth / 2, z: frontWheelZ, isLeft: false },
      { x: -trackWidth / 2, z: rearWheelZ, isLeft: true },
      { x: trackWidth / 2, z: rearWheelZ, isLeft: false },
    ];

    this.wheels = [];
    wheelPositions.forEach((pos) => {
      // Full 3D chunky tread blocks, deep machined rim, 8 spokes, lug nuts & red caliper!
      const wheel = this.createDetailedWheel(wheelRadius, wheelWidth, wheelRadius * 0.58, 8, true);
      wheel.position.set(pos.x, wheelRadius + 0.01, pos.z);
      if (pos.isLeft) {
        wheel.rotation.y = Math.PI; // Face points LEFT OUTWARD!
      } else {
        wheel.rotation.y = 0;       // Face points RIGHT OUTWARD!
      }
      this.wheels.push(wheel);
      carRoot.add(wheel);
    });

    // Exhaust Pipe
    const exhaustGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.18, 16);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaust = new THREE.Mesh(exhaustGeo, this.chromeMaterial);
    exhaust.position.set(0.38, 0.18, -1.55);
    carRoot.add(exhaust);

    this.group.add(carRoot);
  }
}
