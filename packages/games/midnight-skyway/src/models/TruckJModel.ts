import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { CarBodyGenerator } from './CarBodyGenerator';

export class TruckJModel extends CarBase {
  public readonly specs: CarSpecs = {
    name: 'TRUCK J',
    category: 'Kei Workhorse Truck (軽トラック)',
    length: '3,395 mm',
    width: '1,475 mm',
    height: '1,780 mm',
    wheelbase: '1,900 mm',
    drivetrain: '4WD (Part-time) / 5MT',
    weight: '790 kg',
    description:
      '3面図を極限まで忠実に立体化した本格軽トラック。剛健なラダーフレーム、キャブオーバー型運転席、三方開き高剛性アオリ付きロング荷台、キャブ下引き出し収納トランク、荷台保護鳥居フレーム、下部スペアタイヤ吊り下げマウントを備えたタフなワークホース。',
  };

  constructor() {
    super();
    // Default truck body color: Commercial Pure White
    this.bodyMaterial.color.setHex(0xf5f6fa);
    this.roofMaterial.color.setHex(0xf5f6fa);
    this.buildModel();
  }

  private buildModel(): void {
    const carRoot = new THREE.Group();

    const trackWidth = 1.28;
    const wheelRadius = 0.28;
    const wheelWidth = 0.16;
    const frontWheelZ = 1.15;
    const rearWheelZ = -0.75;

    // ===============================================================
    // --- 1. CABIN LOWER & FRONT BODY (Cab-Over Workhorse Front) ---
    // ===============================================================
    const cabWidth = 1.44;
    const cabHalfW = cabWidth / 2;
    const beltlineY = 0.88;

    // A. Front Heavy-Duty Unpainted Black Resin Bumper
    const fBumperGeo = new THREE.BoxGeometry(cabWidth + 0.02, 0.34, 0.10);
    const fBumper = new THREE.Mesh(fBumperGeo, this.plasticMaterial);
    fBumper.position.set(0, 0.44, 1.49);
    fBumper.castShadow = true;
    carRoot.add(fBumper);

    // Lower Air Intake Slits
    const intakeGeo = new THREE.BoxGeometry(0.56, 0.10, 0.04);
    const intake = new THREE.Mesh(intakeGeo, this.interiorMaterial);
    intake.position.set(0.08, 0.40, 1.545);
    carRoot.add(intake);

    // Front License Plate Mounting Bracket (Raised commercial plastic pedestal)
    const fPlateBaseGeo = new THREE.BoxGeometry(0.35, 0.18, 0.02);
    const fPlateBase = new THREE.Mesh(fPlateBaseGeo, this.plasticMaterial);
    fPlateBase.position.set(-0.24, 0.40, 1.545);
    carRoot.add(fPlateBase);

    // Front License Plate ("TRUCK J", offset slightly to left side matching blueprint!)
    const frontPlate = this.createLicensePlate('TRUCK J', true);
    frontPlate.position.set(-0.24, 0.40, 1.56);
    carRoot.add(frontPlate);

    // B. Nose Front Sheetmetal (Vertical Cab-Over Front Mask - zero horizontal hood shelf!)
    // Extends cleanly from bumper top (y=0.61) straight up to windshield cowl line (y=0.88, z=1.45)
    const noseGeo = new THREE.BoxGeometry(cabWidth, 0.27, 0.06);
    const nose = new THREE.Mesh(noseGeo, this.bodyMaterial);
    nose.position.set(0, 0.745, 1.47);
    nose.castShadow = true;
    carRoot.add(nose);

    // Horizontal Chrome Grille Bars
    const grilleBarGeo = new THREE.BoxGeometry(0.68, 0.025, 0.02);
    [0.75, 0.70].forEach((y) => {
      const bar = new THREE.Mesh(grilleBarGeo, this.silverMaterial);
      bar.position.set(0, y, 1.505);
      carRoot.add(bar);
    });

    // Center Front Emblem
    const emblemGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.015, 16);
    emblemGeo.rotateX(Math.PI / 2);
    const emblem = new THREE.Mesh(emblemGeo, this.chromeMaterial);
    emblem.position.set(0, 0.78, 1.505);
    carRoot.add(emblem);

    // Trapezoidal Multi-Reflector Headlights
    [-1, 1].forEach((side) => {
      const hlGroup = new THREE.Group();

      const hlHousingGeo = new THREE.BoxGeometry(0.24, 0.14, 0.06);
      const hlHousing = new THREE.Mesh(hlHousingGeo, this.chromeMaterial);
      hlGroup.add(hlHousing);

      // Main Projector Beam
      const hlLensGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16);
      hlLensGeo.rotateX(Math.PI / 2);
      const hlLens = new THREE.Mesh(hlLensGeo, this.headlightEmissive);
      hlLens.position.set(side * -0.03, 0, 0.03);
      hlGroup.add(hlLens);

      // Amber Turn Signal Segment (Outer corner)
      const amberGeo = new THREE.BoxGeometry(0.06, 0.12, 0.03);
      const amber = new THREE.Mesh(amberGeo, this.amberEmissive);
      amber.position.set(side * 0.08, 0, 0.03);
      hlGroup.add(amber);

      hlGroup.position.set(side * 0.52, 0.72, 1.49);
      carRoot.add(hlGroup);
    });

    // C. Cab Lower Doors with Clean Semicircular Wheel Arch Cutout
    // Wheel center: z = 1.15, y = 0.28, wheelRadius = 0.28
    const archRadius = 0.34; // 6cm clearance around tire (clean opening without any protruding meshes!)
    const doorRearZ = 0.38;  // cabBackZ
    const doorFrontZ = 1.48; // meets front bumper
    const doorBottomY = 0.32;
    const doorTopY = beltlineY; // 0.88

    // 2D Door Profile Shape with Semicircular Wheel Arch Cutout
    const doorShape = new THREE.Shape();
    doorShape.moveTo(doorRearZ, doorBottomY);
    doorShape.lineTo(0.8124, doorBottomY);
    doorShape.absarc(
      frontWheelZ,
      0.28,
      archRadius,
      Math.atan2(0.04, -0.33764),
      Math.atan2(0.04, 0.33764),
      true
    );
    doorShape.lineTo(doorFrontZ, doorBottomY);
    doorShape.lineTo(doorFrontZ, 0.60);
    doorShape.lineTo(1.44, doorTopY);
    doorShape.lineTo(doorRearZ, doorTopY);
    doorShape.closePath();

    const doorThickness = 0.04;

    [-1, 1].forEach((side) => {
      // 1. Molded Door Panel with Wheel Arch Cutout
      const doorGeo = new THREE.ExtrudeGeometry(doorShape, {
        depth: doorThickness,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.005,
        bevelThickness: 0.005,
      });

      const posAttr = doorGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        const shapeZ = posAttr.getX(i);
        const shapeY = posAttr.getY(i);
        const shapeDepth = posAttr.getZ(i);

        const worldX = side > 0
          ? (cabHalfW - shapeDepth)
          : (-cabHalfW + shapeDepth);
        const worldY = shapeY;
        const worldZ = shapeZ;

        posAttr.setXYZ(i, worldX, worldY, worldZ);
      }

      if (side < 0) {
        const index = doorGeo.getIndex();
        if (index) {
          const arr = index.array as Uint16Array | Uint32Array;
          for (let i = 0; i < arr.length; i += 3) {
            const tmp = arr[i];
            arr[i] = arr[i + 1];
            arr[i + 1] = tmp;
          }
        }
      }

      doorGeo.computeVertexNormals();
      const doorMesh = new THREE.Mesh(doorGeo, this.bodyMaterial);
      doorMesh.castShadow = true;
      doorMesh.receiveShadow = true;
      carRoot.add(doorMesh);

      // Cab Boarding Step (Recessed foot step for easy climbing, safely clear of front tire)
      const stepGeo = new THREE.BoxGeometry(0.05, 0.08, 0.10);
      const step = new THREE.Mesh(stepGeo, this.interiorMaterial);
      step.position.set(side * (cabHalfW - 0.03), 0.28, 1.52);
      carRoot.add(step);

      // Commercial Vertical Door Handle
      const dHandleGeo = new THREE.BoxGeometry(0.02, 0.03, 0.10);
      const dHandle = new THREE.Mesh(dHandleGeo, this.plasticMaterial);
      dHandle.position.set(side * (cabHalfW + 0.005), 0.82, 0.55);
      carRoot.add(dHandle);

      // Key Hole
      const keyGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.01, 8);
      keyGeo.rotateZ(Math.PI / 2);
      const key = new THREE.Mesh(keyGeo, this.chromeMaterial);
      key.position.set(side * (cabHalfW + 0.008), 0.74, 0.62);
      carRoot.add(key);

      // Commercial Vertical Door Mirror (Large upright truck mirror)
      const mirrorGroup = new THREE.Group();
      const mStemGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.12, 8);
      mStemGeo.rotateZ(side * 0.45);
      const mStem = new THREE.Mesh(mStemGeo, this.plasticMaterial);
      mirrorGroup.add(mStem);

      const mHousingGeo = new THREE.BoxGeometry(0.05, 0.20, 0.12);
      const mHousing = new THREE.Mesh(mHousingGeo, this.plasticMaterial);
      mHousing.position.set(side * 0.08, 0.04, 0);
      mirrorGroup.add(mHousing);

      const mGlassGeo = new THREE.PlaneGeometry(0.09, 0.18);
      const mGlass = new THREE.Mesh(mGlassGeo, this.chromeMaterial);
      mGlass.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      mGlass.position.set(side * 0.106, 0.04, -0.005);
      mirrorGroup.add(mGlass);

      mirrorGroup.position.set(side * (cabHalfW + 0.02), 1.04, 1.36);
      carRoot.add(mirrorGroup);
    });

    // ===============================================================
    // --- 2. CABIN UPPER FRAME, PILLARS & CURVED CAB ROOF ---
    // ===============================================================
    const roofBaseY = 1.46;
    const pillarTopY = 1.44;
    const cabBackZ = 0.38;

    [-1, 1].forEach((side) => {
      // Slanted A-Pillar (connects front nose cowl z=1.45 straight up to roof header z=1.125)
      const aStart = new THREE.Vector3(side * (cabHalfW - 0.04), beltlineY, 1.45);
      const aEnd = new THREE.Vector3(side * (cabHalfW - 0.08), pillarTopY, 1.125);
      const aPillar = CarBodyGenerator.buildSmoothPillar(aStart, aEnd, 0.075, 0.065, 0.02, this.bodyMaterial);
      carRoot.add(aPillar);

      // Vertical Rear B-Pillar (Cab rear corner)
      const bStart = new THREE.Vector3(side * (cabHalfW - 0.04), beltlineY, cabBackZ);
      const bEnd = new THREE.Vector3(side * (cabHalfW - 0.08), pillarTopY, cabBackZ);
      const bPillar = CarBodyGenerator.buildSmoothPillar(bStart, bEnd, 0.085, 0.065, 0.02, this.bodyMaterial);
      carRoot.add(bPillar);

      // Cab Roof Side Rail (spans from A-pillar top z=1.125 to B-pillar top z=0.38)
      const rStart = new THREE.Vector3(side * (cabHalfW - 0.08), pillarTopY, 1.125);
      const rEnd = new THREE.Vector3(side * (cabHalfW - 0.08), pillarTopY, cabBackZ);
      const rRail = CarBodyGenerator.buildSmoothPillar(rStart, rEnd, 0.065, 0.060, 0.02, this.bodyMaterial);
      carRoot.add(rRail);

      // Door Window Glass (Trapezoidal Kei-truck door window extending forward to A-pillar)
      const fWin = CarBodyGenerator.buildRoundedWindow(0.72, 0.52, 0.04, this.glassMaterial);
      fWin.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      fWin.position.set(side * (cabHalfW - 0.04), 1.15, 0.75);
      carRoot.add(fWin);
    });

    // Windshield Upper Header (at roof front edge z=1.125m)
    const wsHeaderGeo = new THREE.BoxGeometry(cabWidth - 0.16, 0.065, 0.07);
    const wsHeader = new THREE.Mesh(wsHeaderGeo, this.bodyMaterial);
    wsHeader.position.set(0, 1.445, 1.125);
    carRoot.add(wsHeader);

    // Large Panoramic Windshield (True Cab-Over slant from nose z=1.45 to roof z=1.125)
    // Completely eliminates any exposed horizontal hood shelf!
    const windshield = CarBodyGenerator.buildCurvedWindshield(
      cabWidth - 0.16,
      0.65,
      0.035,
      -0.524, // authentic 30-degree slant
      new THREE.Vector3(0, 1.161, 1.288),
      this.glassMaterial
    );
    carRoot.add(windshield);

    // Front Wipers (nestled right at the windshield bottom cowl line)
    [-0.24, 0.24].forEach((x) => {
      const wiperGeo = new THREE.BoxGeometry(0.36, 0.015, 0.015);
      wiperGeo.rotateZ(-0.10);
      const wiper = new THREE.Mesh(wiperGeo, this.plasticMaterial);
      wiper.position.set(x, 0.89, 1.46);
      carRoot.add(wiper);
    });

    // ===============================================================
    // --- CABIN INTERIOR (Seen clearly through windshield & rear window!) ---
    // ===============================================================
    const interiorGroup = new THREE.Group();

    // A. Cabin Floor Plate
    const cabFloorGeo = new THREE.BoxGeometry(cabWidth - 0.12, 0.04, 1.05);
    const floorMesh = new THREE.Mesh(cabFloorGeo, this.interiorMaterial);
    floorMesh.position.set(0, 0.46, 0.92);
    interiorGroup.add(floorMesh);

    // B. Driver & Passenger Commercial Seats (2-Seater Cab)
    [-1, 1].forEach((side) => {
      const seatGroup = new THREE.Group();

      // Seat Cushion
      const cushionGeo = new THREE.BoxGeometry(0.44, 0.10, 0.44);
      const cushion = new THREE.Mesh(cushionGeo, this.interiorMaterial);
      cushion.position.set(0, 0.53, 0.64);
      seatGroup.add(cushion);

      // Seat Backrest (Stands upright right in front of rear window!)
      const backGeo = new THREE.BoxGeometry(0.42, 0.46, 0.08);
      const back = new THREE.Mesh(backGeo, this.interiorMaterial);
      back.position.set(0, 0.80, 0.46);
      back.rotation.x = -0.08;
      seatGroup.add(back);

      // Seat Headrest (Directly visible through rear window!)
      const headGeo = new THREE.BoxGeometry(0.22, 0.14, 0.07);
      const head = new THREE.Mesh(headGeo, this.interiorMaterial);
      head.position.set(0, 1.10, 0.44);
      seatGroup.add(head);

      // Headrest Steel Stems
      [-0.05, 0.05].forEach((xStem) => {
        const stemGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.08, 8);
        const stem = new THREE.Mesh(stemGeo, this.chromeMaterial);
        stem.position.set(xStem, 1.04, 0.44);
        seatGroup.add(stem);
      });

      seatGroup.position.x = side * 0.35;
      interiorGroup.add(seatGroup);
    });

    // C. Dashboard & Instrument Panel (Positioned cleanly under front cowl z=1.45)
    const dashGeo = new THREE.BoxGeometry(cabWidth - 0.16, 0.24, 0.24);
    const dash = new THREE.Mesh(dashGeo, this.interiorMaterial);
    dash.position.set(0, 0.82, 1.34);
    interiorGroup.add(dash);

    // D. Steering Wheel (Right-Hand Drive: x = -0.35m)
    const wheelGroup = new THREE.Group();
    const rimGeo = new THREE.TorusGeometry(0.14, 0.014, 8, 24);
    const sRim = new THREE.Mesh(rimGeo, this.plasticMaterial);
    wheelGroup.add(sRim);

    const sColumnGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.25, 12);
    sColumnGeo.rotateX(Math.PI / 2);
    const sColumn = new THREE.Mesh(sColumnGeo, this.plasticMaterial);
    sColumn.position.z = 0.12;
    wheelGroup.add(sColumn);

    wheelGroup.rotation.x = 0.45; // slanted Kei-truck steering column
    wheelGroup.position.set(-0.35, 0.94, 1.18);
    interiorGroup.add(wheelGroup);

    // E. Interior Rearview Mirror
    const rvmGeo = new THREE.BoxGeometry(0.12, 0.04, 0.02);
    const rvm = new THREE.Mesh(rvmGeo, this.plasticMaterial);
    rvm.position.set(0, 1.38, 1.14);
    interiorGroup.add(rvm);

    carRoot.add(interiorGroup);

    // ===============================================================
    // --- CAB BACK WALL & REAR WINDOW (Clean cutout with rubber gasket) ---
    // ===============================================================
    const cabBackWallGroup = new THREE.Group();

    // 1. Lower Back Sheetmetal Panel (Below window, from bed floor y=0.64 to window bottom y=1.04)
    const lowerBackGeo = new THREE.BoxGeometry(cabWidth - 0.06, 0.40, 0.035);
    const lowerBack = new THREE.Mesh(lowerBackGeo, this.bodyMaterial);
    lowerBack.position.set(0, 0.84, cabBackZ);
    lowerBack.castShadow = true;
    cabBackWallGroup.add(lowerBack);

    // Cab Back Stiffener Vertical Press Ribs (on lower panel)
    for (let i = -4; i <= 4; i++) {
      const ribGeo = new THREE.BoxGeometry(0.045, 0.28, 0.015);
      const rib = new THREE.Mesh(ribGeo, this.bodyMaterial);
      rib.position.set(i * 0.12, 0.84, cabBackZ - 0.022);
      cabBackWallGroup.add(rib);
    }

    // 2. Upper Back Header Panel (Above window, from window top y=1.38 to roofBaseY=1.46)
    const upperBackGeo = new THREE.BoxGeometry(cabWidth - 0.06, 0.08, 0.035);
    const upperBack = new THREE.Mesh(upperBackGeo, this.bodyMaterial);
    upperBack.position.set(0, 1.42, cabBackZ);
    upperBack.castShadow = true;
    cabBackWallGroup.add(upperBack);

    // 3. Left & Right Back Pillars (Flanking the rear window, x=±0.41 to ±0.69)
    [-1, 1].forEach((side) => {
      const sidePillarGeo = new THREE.BoxGeometry(0.28, 0.34, 0.035);
      const sidePillar = new THREE.Mesh(sidePillarGeo, this.bodyMaterial);
      sidePillar.position.set(side * 0.55, 1.21, cabBackZ);
      sidePillar.castShadow = true;
      cabBackWallGroup.add(sidePillar);
    });

    // 4. Rear Window Frame / Rubber Weatherstrip Gasket (Opening: W=0.82m, H=0.34m)
    const gasketShape = new THREE.Shape();
    const gW = 0.84 / 2;
    const gH = 0.36 / 2;
    const gR = 0.04;
    gasketShape.moveTo(-gW + gR, -gH);
    gasketShape.lineTo(gW - gR, -gH);
    gasketShape.quadraticCurveTo(gW, -gH, gW, -gH + gR);
    gasketShape.lineTo(gW, gH - gR);
    gasketShape.quadraticCurveTo(gW, gH, gW - gR, gH);
    gasketShape.lineTo(-gW + gR, gH);
    gasketShape.quadraticCurveTo(-gW, gH, -gW, gH - gR);
    gasketShape.lineTo(-gW, -gH + gR);
    gasketShape.quadraticCurveTo(-gW, -gH, -gW + gR, -gH);

    // Hole in gasket for clear glass opening
    const holePath = new THREE.Path();
    const hW = 0.78 / 2;
    const hH = 0.30 / 2;
    const hR = 0.03;
    holePath.moveTo(-hW + hR, -hH);
    holePath.lineTo(hW - hR, -hH);
    holePath.quadraticCurveTo(hW, -hH, hW, -hH + hR);
    holePath.lineTo(hW, hH - hR);
    holePath.quadraticCurveTo(hW, hH, hW - hR, hH);
    holePath.lineTo(-hW + hR, hH);
    holePath.quadraticCurveTo(-hW, hH, -hW, hH - hR);
    holePath.lineTo(-hW, -hH + hR);
    holePath.quadraticCurveTo(-hW, -hH, -hW + hR, -hH);
    gasketShape.holes.push(holePath);

    const gasketGeo = new THREE.ExtrudeGeometry(gasketShape, {
      depth: 0.015,
      bevelEnabled: false,
    });
    const gasketMesh = new THREE.Mesh(gasketGeo, this.plasticMaterial);
    gasketMesh.position.set(0, 1.21, cabBackZ - 0.02);
    cabBackWallGroup.add(gasketMesh);

    // 5. Authentic Transparent Rear Window Pane (Looking directly into the cabin!)
    const rearWinPane = CarBodyGenerator.buildRoundedWindow(0.80, 0.32, 0.035, this.glassMaterial);
    rearWinPane.rotation.y = Math.PI;
    rearWinPane.position.set(0, 1.21, cabBackZ - 0.01);
    cabBackWallGroup.add(rearWinPane);

    carRoot.add(cabBackWallGroup);

    // Curved Cab Roof Panel (４つのフレームをぴったりカバーするキャブルーフ)
    const cabRoofMesh = CarBodyGenerator.buildCurvedRoof(
      1.35,            // width: 左右レール(±0.64m)をぴったり覆う幅
      0.76,            // length: 前ヘッダー(z=1.125)から後ヘッダー(z=0.38)までの長さ
      0.035,           // thickness
      0.025,           // camberHeight: 軽トラらしい穏やかなラウンドクラウン
      0.75,            // centerZ: ４つのフレームの中央 (1.125 + 0.38)/2
      roofBaseY,       // baseY: フレーム上面にジャストフィット
      this.bodyMaterial
    );
    carRoot.add(cabRoofMesh);

    // ===============================================================
    // --- 3. CAB-BACK PROTECTOR / TORII FRAME (荷台鳥居フレーム) ---
    // Sturdy steel safety frame - height lowered to align with cab roof!
    // ===============================================================
    const toriiGroup = new THREE.Group();
    const toriiMat = this.silverMaterial;
    const pipeRadius = 0.016;
    const toriiTopY = 1.54; // Roof peak is 1.52m -> fits cleanly without protruding!

    // A. Left & Right Main Uprights (From bed deck level y=0.65m to toriiTopY=1.54m)
    [-1, 1].forEach((side) => {
      const uprightHeight = toriiTopY - 0.65;
      const uprightGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, uprightHeight, 16);
      const upright = new THREE.Mesh(uprightGeo, toriiMat);
      upright.position.set(side * 0.58, 0.65 + uprightHeight / 2, cabBackZ - 0.04);
      toriiGroup.add(upright);

      // Top corner rope hook
      const rHookGeo = new THREE.TorusGeometry(0.016, 0.005, 8, 16);
      const rHook = new THREE.Mesh(rHookGeo, toriiMat);
      rHook.position.set(side * 0.56, toriiTopY - 0.01, cabBackZ - 0.04);
      toriiGroup.add(rHook);
    });

    // B. Top Horizontal Crossbar (aligned flush just above roof crown at y=1.54m)
    const topBarGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, 1.16, 16);
    topBarGeo.rotateZ(Math.PI / 2);
    const topBar = new THREE.Mesh(topBarGeo, toriiMat);
    topBar.position.set(0, toriiTopY, cabBackZ - 0.04);
    toriiGroup.add(topBar);

    // C. Middle Horizontal Crossbar (Flush with top of side gates at y=0.95m)
    const midBarGeo = new THREE.CylinderGeometry(pipeRadius, pipeRadius, 1.16, 16);
    midBarGeo.rotateZ(Math.PI / 2);
    const midBar = new THREE.Mesh(midBarGeo, toriiMat);
    midBar.position.set(0, 0.95, cabBackZ - 0.04);
    toriiGroup.add(midBar);

    // D. 2 Vertical Window Guard Grille Bars (From midBar y=0.95 to topBar y=1.54)
    const vBarHeight = toriiTopY - 0.95;
    [-0.20, 0.20].forEach((x) => {
      const vBarGeo = new THREE.CylinderGeometry(pipeRadius * 0.85, pipeRadius * 0.85, vBarHeight, 12);
      const vBar = new THREE.Mesh(vBarGeo, toriiMat);
      vBar.position.set(x, 0.95 + vBarHeight / 2, cabBackZ - 0.04);
      toriiGroup.add(vBar);
    });

    carRoot.add(toriiGroup);

    // ===============================================================
    // --- 4. CARGO BED (ロングフラット荷台 ＆ 三方開きアオリ) ---
    // Dimensions: Length 2.05m (z=0.36 to -1.68m), Width 1.41m, Deck Y=0.65m
    // ===============================================================
    const bedGroup = new THREE.Group();
    const bedZStart = 0.36;
    const bedZEnd = -1.68;
    const bedLength = Math.abs(bedZStart - bedZEnd);
    const bedCenterZ = (bedZStart + bedZEnd) * 0.5;
    const bedWidth = 1.41;
    const bedFloorY = 0.65;
    const aoriHeight = 0.28;

    // A. Heavy-Duty Corrugated Steel Deck Floor
    const floorGeo = new THREE.BoxGeometry(bedWidth, 0.04, bedLength);
    const floor = new THREE.Mesh(floorGeo, this.bodyMaterial);
    floor.position.set(0, bedFloorY, bedCenterZ);
    floor.castShadow = true;
    floor.receiveShadow = true;
    bedGroup.add(floor);

    // Longitudinal Deck Corrugation Ribs (Pressed steel grooves)
    const ribGeo = new THREE.BoxGeometry(0.03, 0.015, bedLength * 0.98);
    for (let i = -7; i <= 7; i++) {
      const dRib = new THREE.Mesh(ribGeo, this.silverMaterial);
      dRib.position.set(i * 0.09, bedFloorY + 0.025, bedCenterZ);
      bedGroup.add(dRib);
    }

    // Front Gate / Bulkhead (Solid front wall under torii)
    const fAoriGeo = new THREE.BoxGeometry(bedWidth, aoriHeight, 0.03);
    const fAori = new THREE.Mesh(fAoriGeo, this.bodyMaterial);
    fAori.position.set(0, bedFloorY + aoriHeight / 2 + 0.02, bedZStart);
    fAori.castShadow = true;
    bedGroup.add(fAori);

    // B. Left & Right Drop Sides (三方開きサイドゲートアオリ)
    [-1, 1].forEach((side) => {
      const sAoriGroup = new THREE.Group();

      // Main Gate Panel
      const sAoriGeo = new THREE.BoxGeometry(0.035, aoriHeight, bedLength);
      const sAori = new THREE.Mesh(sAoriGeo, this.bodyMaterial);
      sAori.castShadow = true;
      sAoriGroup.add(sAori);

      // Horizontal Pressed Stiffener Beads (2 grooves across side gate)
      [-0.05, 0.05].forEach((yOff) => {
        const beadGeo = new THREE.BoxGeometry(0.042, 0.02, bedLength * 0.99);
        const bead = new THREE.Mesh(beadGeo, this.bodyMaterial);
        bead.position.y = yOff;
        sAoriGroup.add(bead);
      });

      // 5 Rope Tie-Down Hooks along lower edge of side gate
      for (let i = 0; i < 5; i++) {
        const frac = i / 4;
        const hookZ = bedLength * 0.44 - frac * (bedLength * 0.88);
        const hookGeo = new THREE.TorusGeometry(0.016, 0.005, 8, 12, Math.PI);
        hookGeo.rotateZ(Math.PI);
        const hook = new THREE.Mesh(hookGeo, this.silverMaterial);
        hook.position.set(side * 0.022, -aoriHeight / 2 - 0.01, hookZ);
        sAoriGroup.add(hook);
      }

      // Gate Latch Handles (Front and Rear locking levers)
      [-bedLength * 0.46, bedLength * 0.46].forEach((zH) => {
        const latchGeo = new THREE.BoxGeometry(0.02, 0.025, 0.08);
        const latch = new THREE.Mesh(latchGeo, this.plasticMaterial);
        latch.position.set(side * 0.025, aoriHeight / 2 - 0.03, zH);
        sAoriGroup.add(latch);
      });

      sAoriGroup.position.set(side * (bedWidth / 2 - 0.015), bedFloorY + aoriHeight / 2 + 0.02, bedCenterZ);
      bedGroup.add(sAoriGroup);
    });

    // C. Rear Tailgate (後アオリ)
    const rAoriGroup = new THREE.Group();
    const rAoriGeo = new THREE.BoxGeometry(bedWidth, aoriHeight, 0.035);
    const rAori = new THREE.Mesh(rAoriGeo, this.bodyMaterial);
    rAori.castShadow = true;
    rAoriGroup.add(rAori);

    // Horizontal Pressed Beads on Rear Gate
    [-0.05, 0.05].forEach((yOff) => {
      const beadGeo = new THREE.BoxGeometry(bedWidth * 0.98, 0.02, 0.042);
      const bead = new THREE.Mesh(beadGeo, this.bodyMaterial);
      bead.position.y = yOff;
      rAoriGroup.add(bead);
    });

    // Rear Gate Center Handle & Chain Latches
    [-bedWidth * 0.42, bedWidth * 0.42].forEach((xH) => {
      const latchGeo = new THREE.BoxGeometry(0.08, 0.025, 0.02);
      const latch = new THREE.Mesh(latchGeo, this.plasticMaterial);
      latch.position.set(xH, aoriHeight / 2 - 0.03, -0.025);
      rAoriGroup.add(latch);
    });

    rAoriGroup.position.set(0, bedFloorY + aoriHeight / 2 + 0.02, bedZEnd);
    bedGroup.add(rAoriGroup);

    carRoot.add(bedGroup);

    // ===============================================================
    // --- 5. CHASSIS, SUSPENSION & UNDER-BED MECHANISMS ---
    // Ladder Frame, Tool Box, Battery, Under-Bed Spare Wheel, Rear Axle!
    // ===============================================================
    // A. Steel Ladder Chassis Rails (Left & Right Main Frame Rails)
    [-0.38, 0.38].forEach((xRail) => {
      const railGeo = new THREE.BoxGeometry(0.08, 0.12, 3.10);
      const rail = new THREE.Mesh(railGeo, this.interiorMaterial);
      rail.position.set(xRail, 0.48, -0.15);
      rail.castShadow = true;
      carRoot.add(rail);
    });

    // Crossmembers
    [-1.40, -0.75, 0.10, 0.85].forEach((zCross) => {
      const crossGeo = new THREE.BoxGeometry(0.72, 0.06, 0.08);
      const cross = new THREE.Mesh(crossGeo, this.interiorMaterial);
      cross.position.set(0, 0.48, zCross);
      carRoot.add(cross);
    });

    // B. Under-Bed Tool Box / Drawer (Left Side: 図面詳細「キャブ下引き出し収納 25L」!)
    const toolBoxGeo = new THREE.BoxGeometry(0.24, 0.20, 0.46);
    const toolBox = new THREE.Mesh(toolBoxGeo, this.plasticMaterial);
    toolBox.position.set(-0.52, 0.44, -0.10);
    toolBox.castShadow = true;
    carRoot.add(toolBox);

    // Tool Box Lid Handle
    const tHandleGeo = new THREE.BoxGeometry(0.02, 0.04, 0.12);
    const tHandle = new THREE.Mesh(tHandleGeo, this.chromeMaterial);
    tHandle.position.set(-0.645, 0.48, -0.10);
    carRoot.add(tHandle);

    // C. Commercial Battery Box (Right Side)
    const battGeo = new THREE.BoxGeometry(0.20, 0.18, 0.28);
    const batt = new THREE.Mesh(battGeo, this.plasticMaterial);
    batt.position.set(0.50, 0.45, 0.05);
    carRoot.add(batt);

    // Fuel Tank (Center Right, clear of rear wheel)
    const tankGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.32, 16);
    tankGeo.rotateX(Math.PI / 2);
    const tank = new THREE.Mesh(tankGeo, this.plasticMaterial);
    tank.position.set(0.48, 0.44, -0.25);
    carRoot.add(tank);

    // D. Under-Bed Suspended Spare Wheel (図面背面図にある荷台下水平吊り下げスペアタイヤ!)
    const spareGroup = new THREE.Group();
    // Spare wheel has NO brake disc (includeBrakes = false)
    const spareTire = this.createSteelWheel(wheelRadius, wheelWidth, wheelRadius * 0.58, true, false);
    // Suspended HORIZONTALLY under rear bed floor (横置き・水平吊り下げ)
    spareTire.rotation.z = -Math.PI / 2;
    spareGroup.add(spareTire);

    // Spare Wheel Winch Bracket connecting to chassis crossmember
    const sMountGeo = new THREE.BoxGeometry(0.14, 0.08, 0.14);
    const sMount = new THREE.Mesh(sMountGeo, this.interiorMaterial);
    sMount.position.y = 0.10;
    spareGroup.add(sMount);

    spareGroup.position.set(0, 0.38, -1.25);
    carRoot.add(spareGroup);

    // E. Heavy-Duty Rear Rigid Axle & Leaf Springs
    const axleGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.22, 16);
    axleGeo.rotateZ(Math.PI / 2);
    const axle = new THREE.Mesh(axleGeo, this.interiorMaterial);
    axle.position.set(0, wheelRadius + 0.01, rearWheelZ);
    carRoot.add(axle);

    // Center Differential Pumpkin (ホーシングデフ玉)
    const diffGeo = new THREE.SphereGeometry(0.08, 16, 16);
    diffGeo.scale(1.0, 1.1, 1.3);
    const diff = new THREE.Mesh(diffGeo, this.interiorMaterial);
    diff.position.set(0, wheelRadius + 0.01, rearWheelZ);
    carRoot.add(diff);

    // Longitudinal Leaf Springs
    [-0.44, 0.44].forEach((xLeaf) => {
      const leafGeo = new THREE.BoxGeometry(0.04, 0.03, 0.70);
      const leaf = new THREE.Mesh(leafGeo, this.interiorMaterial);
      leaf.position.set(xLeaf, wheelRadius - 0.03, rearWheelZ);
      carRoot.add(leaf);
    });

    // Exhaust Silencer & Tailpipe
    const mufflerGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.32, 16);
    mufflerGeo.rotateZ(Math.PI / 2);
    const muffler = new THREE.Mesh(mufflerGeo, this.interiorMaterial);
    muffler.position.set(-0.25, 0.35, -0.42);
    carRoot.add(muffler);

    const tailpipeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.25, 12);
    tailpipeGeo.rotateX(Math.PI / 2);
    const tailpipe = new THREE.Mesh(tailpipeGeo, this.chromeMaterial);
    tailpipe.position.set(-0.35, 0.32, -0.65);
    carRoot.add(tailpipe);

    // F. Rear Fascia, Tail Lamps & Mud Flaps
    // Rear Horizontal Combination Lamps (Brake Red + Turn Amber + Reverse White)
    [-1, 1].forEach((side) => {
      const lampGroup = new THREE.Group();

      const housingGeo = new THREE.BoxGeometry(0.24, 0.09, 0.03);
      const housing = new THREE.Mesh(housingGeo, this.interiorMaterial);
      lampGroup.add(housing);

      // Red Stop/Tail
      const redGeo = new THREE.BoxGeometry(0.10, 0.07, 0.02);
      const red = new THREE.Mesh(redGeo, this.taillightEmissive);
      red.position.set(side * -0.05, 0, 0.015);
      lampGroup.add(red);

      // Amber Turn
      const ambGeo = new THREE.BoxGeometry(0.06, 0.07, 0.02);
      const amb = new THREE.Mesh(ambGeo, this.amberEmissive);
      amb.position.set(side * 0.03, 0, 0.015);
      lampGroup.add(amb);

      // White Reverse
      const revGeo = new THREE.BoxGeometry(0.04, 0.07, 0.02);
      const rev = new THREE.Mesh(revGeo, this.headlightEmissive);
      rev.position.set(side * 0.08, 0, 0.015);
      lampGroup.add(rev);

      // Positioned cleanly on rear crossmember facing backwards (-Z)
      lampGroup.position.set(side * 0.50, 0.44, bedZEnd - 0.015);
      carRoot.add(lampGroup);

      // Rear Mud Flap (Mudguard rubber behind rear wheels)
      const flapGeo = new THREE.BoxGeometry(0.20, 0.22, 0.008);
      const flap = new THREE.Mesh(flapGeo, this.plasticMaterial);
      flap.position.set(side * (trackWidth / 2), 0.32, -1.02);
      carRoot.add(flap);
    });

    // Rear License Plate Bracket & Lighting Housing (Facing rearward, fully exposed!)
    const rPlateBaseGeo = new THREE.BoxGeometry(0.35, 0.18, 0.02);
    const rPlateBase = new THREE.Mesh(rPlateBaseGeo, this.interiorMaterial);
    rPlateBase.position.set(0, 0.40, bedZEnd - 0.015);
    carRoot.add(rPlateBase);

    // License Plate Lamp Housing
    const rLampGeo = new THREE.BoxGeometry(0.12, 0.03, 0.04);
    const rLamp = new THREE.Mesh(rLampGeo, this.plasticMaterial);
    rLamp.position.set(0, 0.50, bedZEnd - 0.02);
    carRoot.add(rLamp);

    // Rear License Plate ("TRUCK J", mounted cleanly facing rearward)
    const rearPlate = this.createLicensePlate('TRUCK J', true);
    rearPlate.position.set(0, 0.40, bedZEnd - 0.03);
    rearPlate.rotation.y = Math.PI;
    carRoot.add(rearPlate);

    // ===============================================================
    // --- 6. 4 AUTHENTIC COMMERCIAL STEEL ROAD WHEELS (鉄チン) ---
    // ===============================================================
    const wheelPositions = [
      { x: -trackWidth / 2, z: frontWheelZ, isLeft: true },
      { x: trackWidth / 2, z: frontWheelZ, isLeft: false },
      { x: -trackWidth / 2, z: rearWheelZ, isLeft: true },
      { x: trackWidth / 2, z: rearWheelZ, isLeft: false },
    ];

    this.wheels = [];
    wheelPositions.forEach((pos) => {
      // 12-inch commercial pressed steel wheel
      const wheel = this.createSteelWheel(wheelRadius, wheelWidth, wheelRadius * 0.58, true);
      wheel.position.set(pos.x, wheelRadius + 0.01, pos.z);
      if (pos.isLeft) {
        wheel.rotation.y = Math.PI; // Face points LEFT
      } else {
        wheel.rotation.y = 0;       // Face points RIGHT
      }
      this.wheels.push(wheel);
      carRoot.add(wheel);
    });

    this.group.add(carRoot);
  }
}
