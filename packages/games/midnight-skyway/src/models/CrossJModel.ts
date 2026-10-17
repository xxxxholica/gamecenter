import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { CarBodyGenerator, LowerBodySection } from './CarBodyGenerator';
import { CarInterior } from './CarInterior';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export class CrossJModel extends CarBase {
  public readonly specs: CarSpecs = {
    name: 'CROSS J',
    category: '軽クロスオーバー SUV',
    length: '3,395 mm',
    width: '1,475 mm',
    height: '1,440 mm',
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
      mirrorY: 1.32,          // ルーフ前縁(フレーム下端)から吊るす
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
        fender: [0.68, 0.58],
        beltline: [0.65, 0.79],
      },
      // 1: Hood Front Step
      {
        z: 1.44,
        yBottom: 0.22,
        yTop: 0.84,
        sill: [0.68, 0.24],
        fender: [0.695, 0.62],
        beltline: [0.655, 0.82],
      },
      // 2: Front Wheelhouse FRONT Lip (Clear of tire front!)
      {
        z: 1.43,
        yBottom: 0.22,
        yTop: 0.85,
        sill: [0.68, 0.24],       // 壁は続けて、穴は円形に切り抜く
        wheelArch: [0.77, 0.52],
        fender: [0.755, 0.74],    // Prominent crossover flare
        beltline: [0.665, 0.84],
      },
      // 3: Front Wheelhouse CENTER (Full open arch over wide tire!)
      {
        z: frontWheelZ, // 1.18
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],       // 壁は続けて、穴は円形に切り抜く
        wheelArch: [0.77, 0.52],
        fender: [0.765, 0.77],    // Full wide blister arch
        beltline: [0.675, 0.85],
      },
      // 4: Front Wheelhouse REAR Lip (Clear of tire rear at z=0.87m!)
      {
        z: 0.84,
        yBottom: 0.22,
        yTop: 0.87,
        sill: [0.68, 0.24],       // 壁は続けて、穴は円形に切り抜く
        wheelArch: [0.77, 0.52],
        fender: [0.755, 0.74],
        beltline: [0.685, 0.86],
      },
      // 5: Cowl / Hood Rear
      {
        z: 0.78,                  // ボンネットの後端(ここから後ろは車内。Aピラーの足元の位置)
        yBottom: 0.22,
        yTop: 0.88,               // Smooth junction with cowl
        sill: [0.68, 0.24],
        fender: [0.74, 0.64],
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
        fender: [0.765, 0.58],    // 後席側の肩を少し張らせる
        beltline: [0.715, 0.86],
      },
      // 10: Rear Wheelhouse FRONT Lip (Clear of tire front at z=-0.91m!)
      {
        z: -0.88,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],       // 壁は続けて、穴は円形に切り抜く
        wheelArch: [0.77, 0.52],
        fender: [0.79, 0.74],     // Chunky rear blister flare
        beltline: [0.72, 0.86],
      },
      // 11: Rear Wheelhouse CENTER (Full open arch over wide rear tire!)
      {
        z: rearWheelZ, // -1.22
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],       // 壁は続けて、穴は円形に切り抜く
        wheelArch: [0.77, 0.52],
        fender: [0.82, 0.77],
        beltline: [0.725, 0.86],
      },
      // 12: Rear Wheelhouse REAR Lip (Clear of tire rear!)
      {
        z: -1.48,
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],       // 壁は続けて、穴は円形に切り抜く
        wheelArch: [0.77, 0.52],
        fender: [0.80, 0.74],
        beltline: [0.73, 0.86],
      },
      // 13: Solid Vertical Rear Hatch (Flat back, flush at z=-1.50m!)
      {
        z: -1.57,                 // 後ろへ張り出して、ふっくらしたお尻にする
        yBottom: 0.22,
        yTop: 0.86,
        sill: [0.68, 0.24],
        fender: [0.755, 0.62],
        beltline: [0.73, 0.86],
      },
    ];

    const isCabinZone = [
      false, false, false, false, false, true,   // 5(z=0.78)から後ろは車内。ボンネットの上面はここで終わり、後ろはダッシュボードにする
      true, true, true, true,
      true, true, true,
      false
    ];

    // Wheel Arch Cutout Zones (100% hollows out the body over the wide crossover tires!)
    const isWheelArchZone = [
      false, false,
      true, true, true,   // Front wheel arch zone (sections 2, 3, 4: z=0.84 to 1.43m)
      false, false, false, false, false,
      true, true, true,   // Rear wheel arch zone (sections 10, 11, 12: z=-0.88 to -1.42m)
      false
    ];

    // ハスラーのような、ふっくらとした丸み: 断面をなめらかに補間し、前後の角と上縁を丸める
    const lowerMesh = CarBodyGenerator.generateSmoothLowerBodyMesh(
      lowerSections,
      isCabinZone,
      this.bodyMaterial,
      isWheelArchZone,
      {
        noseRadius: 0.2, tailRadius: 0.2, roll: 0.1, zStep: 0.03, edgeSub: 5,
        // タイヤの周りを円形にくり抜く(穴の縁は、オーバーフェンダーの円弧で縁取る)
        archCircles: [frontWheelZ, rearWheelZ].map((z) => ({ z, y: wheelRadius + 0.01, r: archRadius + 0.01, xMin: 0.40 })),
      },
    );
    carRoot.add(lowerMesh);

    // ダッシュボード上面: 白いフレームの内側(ボンネットの後端より後ろ)は車内なので、橙色のボンネットではなく黒い樹脂のダッシュボードにする
    const dashTop = new THREE.Mesh(new RoundedBoxGeometry(1.26, 0.10, 0.40, 4, 0.04), this.plasticMaterial);
    dashTop.position.set(0, 0.825, 0.62);
    dashTop.castShadow = true;
    carRoot.add(dashTop);

    // --- 2. BOLD & THICK Structural Pillars & Fully Integrated Cabin Base Frame ---
    const beltlineY = 0.86;
    const roofBaseY = 1.42; // The strict baseline level where the roof begins!
    const pillarTopY = 1.43; // フレームの上端は屋根板の中に少し食い込ませ、屋根との間に隙間を作らない

    // A. SOLID CABIN BASE FRAME (Hermetically connects lower body waistline to upper pillars & glass)
    const baseFrame = CarBodyGenerator.buildCabinBaseFrame(
      beltlineY,
      0.78,   // Front cowl (windshield base)
      -1.50,  // Rear tailgate waist
      0.70,   // Half width strictly inside the 0.715m bulging beltline!
      this.bodyMaterial,
      true,
    );
    carRoot.add(baseFrame);

    // 屋根の下面に張り付く平たい帯。管より太く・薄くして、屋根とフレームの境目をぼかす
    const roofFillet = (pts: THREE.Vector3[]): void => {
      const strip = CarBodyGenerator.buildTubeFrame(pts, 0.055, this.roofMaterial, 120);
      strip.scale.y = 0.45;
      strip.position.y = 1.422 - 0.45 * 1.395;
      carRoot.add(strip);
    };
    // 後ろのフレーム(D-Pillar + 後ろ上のヘッダー)の形。y→xの角丸のアーチ(縦はまっすぐ、角は半径 archR の円弧、上は水平)を
    // 密な点で定義し、奥行き(z)は高さと横位置から滑らかに決める。点を等間隔・密にして、管がねじれたりつぶれたりしないようにする
    const archTubeR = 0.062;   // 後ろのフレームの太さ(管の半径)
    // 太くした分、柱の中心は内側へ寄せ(外面は従来と同じ約0.72m)、上端は下げて(管の頂点は従来と同じ高さ)、車体と屋根からはみ出さないようにする
    const archXp = 0.66, archR = 0.07, archTop = 1.375, archBase = 0.74;   // 柱の足元はボディの中に差し込み、切り口を隠す
    const archZ = (_x: number, _y: number): number => -1.43;   // 屋根と車体をつなぐ柱は垂直、上の横材も一直線(曲げない)
    const archPoints = (): THREE.Vector3[] => {
      const out: THREE.Vector3[] = [];
      const yv = archTop - archR, xv = archXp - archR;
      const add = (x: number, y: number): void => { out.push(new THREE.Vector3(x, y, archZ(x, y))); };
      const nV = 30, nA = 8, nH = 40;
      for (let i = 0; i < nV; i++) add(-archXp, archBase + ((yv - archBase) * i) / nV);
      for (let i = 0; i < nA; i++) { const a = Math.PI - (i / nA) * (Math.PI / 2); add(-xv + Math.cos(a) * archR, yv + Math.sin(a) * archR); }
      for (let i = 0; i <= nH; i++) add(-xv + ((2 * xv) * i) / nH, archTop);
      for (let i = 1; i <= nA; i++) { const a = Math.PI / 2 - (i / nA) * (Math.PI / 2); add(xv + Math.cos(a) * archR, yv + Math.sin(a) * archR); }
      for (let i = 1; i <= nV; i++) add(archXp, yv - ((yv - archBase) * i) / nV);
      return out;
    };
    // 屋根の横のレールとつなぐ点(角の円弧の45度の所)
    const archJoin = ((): THREE.Vector3 => {
      const x = archXp - archR + Math.cos(Math.PI / 4) * archR, y = archTop - archR + Math.sin(Math.PI / 4) * archR;
      return new THREE.Vector3(x, y, archZ(x, y));
    })();

    [-1, 1].forEach((side) => {
      // A-Pillars with Smooth Rounded Contours (positioned safely inside lower body x=0.65m -> x=0.59m)
      const aStart = new THREE.Vector3(side * 0.70, 0.78, 0.80);   // 足元はボンネット(カウル)の端寄りに立て、上へ向かって内側に傾ける
      const aPillar = CarBodyGenerator.buildTubeFrame([aStart, new THREE.Vector3(side * 0.69, 1.395, 0.45)], 0.04, this.roofMaterial);
      carRoot.add(aPillar);
      // 継ぎ目(A-Pillarの上端): 屋根のレール・フロント上の横材と接する所を丸い球でつなぐ
      const aJoint = new THREE.Mesh(new THREE.SphereGeometry(0.058, 20, 14), this.roofMaterial);
      aJoint.position.set(side * 0.69, 1.395, 0.45);
      carRoot.add(aJoint);
      // 屋根の下面へ向けて柱をラッパ状に広げ、屋根との境目をぼかす
      const aDir = new THREE.Vector3(side * 0.69, 1.395, 0.45).sub(aStart).normalize();
      const aTop = new THREE.Vector3(side * 0.69, 1.395, 0.45).addScaledVector(aDir, 0.015);
      carRoot.add(CarBodyGenerator.buildFlare(aTop.clone().addScaledVector(aDir, -0.16), aTop, 0.04, 0.05, this.roofMaterial));
      // 後ろの柱も同じ
      carRoot.add(CarBodyGenerator.buildFlare(new THREE.Vector3(side * archXp, 1.33, -1.50), new THREE.Vector3(side * archXp, 1.43, -1.50), 0.042, 0.05, this.roofMaterial));

      // B-Pillars with Smooth Rounded Contours (x=0.65m -> x=0.59m)
      const bStart = new THREE.Vector3(side * 0.70, beltlineY, -0.32);
      const bEnd = new THREE.Vector3(side * 0.69, pillarTopY, -0.32);
      const bPillar = CarBodyGenerator.buildSmoothPillar(bStart, bEnd, 0.080, 0.065, 0.025, this.plasticMaterial);
      carRoot.add(bPillar);

      const bGussetGeo = new THREE.SphereGeometry(0.052, 16, 12).scale(1, 1, 1.15);   // 角のある箱ではなく、丸い継ぎ目にする
      const bGusset = new THREE.Mesh(bGussetGeo, this.plasticMaterial);
      bGusset.position.set(side * 0.70, beltlineY, -0.32);
      bGusset.castShadow = true;
      carRoot.add(bGusset);

      // C-Pillars (6-light window divider pillars) with Smooth Rounded Contours
      const cStart = new THREE.Vector3(side * 0.70, beltlineY, -0.85);
      const cEnd = new THREE.Vector3(side * 0.69, pillarTopY, -0.85);
      const cPillar = CarBodyGenerator.buildSmoothPillar(cStart, cEnd, 0.080, 0.065, 0.025, this.plasticMaterial);
      carRoot.add(cPillar);

      const cGussetGeo = new THREE.SphereGeometry(0.052, 16, 12).scale(1, 1, 0.96);   // 角のある箱ではなく、丸い継ぎ目にする
      const cGusset = new THREE.Mesh(cGussetGeo, this.plasticMaterial);
      cGusset.position.set(side * 0.70, beltlineY, -0.85);
      cGusset.castShadow = true;
      carRoot.add(cGusset);

      // D-Pillar は、後ろのヘッダーとひと続きの丸い管にして下で作る(足元はボディの中へ差し込むので、継ぎ目の球は付けない)

      // Roof Side Rails with Smooth Contours (sits right under roofBaseY, x=0.59m)
      const sideRail = CarBodyGenerator.buildTubeFrame(
        [
          new THREE.Vector3(side * 0.69, 1.395, 0.45),
          new THREE.Vector3(side * 0.685, 1.39, -0.5),
          new THREE.Vector3(side * 0.675, 1.365, -1.2),
          new THREE.Vector3(side * archJoin.x, archJoin.y, archJoin.z),   // 後ろのフレームの角と同じ点でつなぐ
        ],
        0.04,
        this.roofMaterial,
      );
      carRoot.add(sideRail);
      roofFillet([
        new THREE.Vector3(side * 0.69, 1.395, 0.45),
        new THREE.Vector3(side * 0.685, 1.395, -0.5),
        new THREE.Vector3(side * 0.675, 1.395, -1.2),
        new THREE.Vector3(side * archXp, 1.395, -1.43),
      ]);
      const dJoint = new THREE.Mesh(new THREE.SphereGeometry(archTubeR + 0.004, 16, 12), this.roofMaterial);
      dJoint.position.set(side * archJoin.x, archJoin.y, archJoin.z);
      carRoot.add(dJoint);

      // --- INTEGRATED WINDOW SASH FRAMEWORK ---
      // 1. Door Window Sash - Top (runs along roof rail, cleanly under roof)
      const topSashGeo = new THREE.BoxGeometry(0.03, 0.03, 1.80);   // 後ろのフレームの曲線の手前で止める
      const topSash = new THREE.Mesh(topSashGeo, this.plasticMaterial);
      topSash.position.set(side * 0.685, 1.36, -0.46);
      carRoot.add(topSash);

      // 2. Door Window Sash - Bottom (weatherstrip rail along beltline)
      const btmSashGeo = new THREE.BoxGeometry(0.04, 0.03, 1.95);
      const btmSash = new THREE.Mesh(btmSashGeo, this.plasticMaterial);
      btmSash.position.set(side * 0.70, beltlineY + 0.015, -0.525);
      carRoot.add(btmSash);

      // 3. A-Pillar Front Window Sash Post
      const fPostGeo = new THREE.BoxGeometry(0.03, 0.48, 0.03);
      const fPost = new THREE.Mesh(fPostGeo, this.plasticMaterial);
      fPost.position.set(side * 0.70, 1.12, 0.45);
      carRoot.add(fPost);

      // 4. B-Pillar Center Window Divider Post
      const bPostGeo = new THREE.BoxGeometry(0.03, 0.48, 0.03);
      const bPost = new THREE.Mesh(bPostGeo, this.plasticMaterial);
      bPost.position.set(side * 0.70, 1.12, -0.32);
      carRoot.add(bPost);

      // 5. C-Pillar Rear Window Divider Post
      const cPostGeo = new THREE.BoxGeometry(0.03, 0.48, 0.03);
      const cPost = new THREE.Mesh(cPostGeo, this.plasticMaterial);
      cPost.position.set(side * 0.70, 1.12, -0.85);
      carRoot.add(cPost);

      // 6. Crossover Side Body Cladding Moldings (Muscular bulging lower contour)
      const moldGeo = new RoundedBoxGeometry(0.035, 0.16, 1.30, 4, 0.016);
      const mold = new THREE.Mesh(moldGeo, this.plasticMaterial);
      mold.position.set(side * 0.745, 0.48, -0.15);
      mold.castShadow = true;
      carRoot.add(mold);
    });

    // Windshield Upper Header (sits cleanly under roofBaseY)
    const wsHeader = CarBodyGenerator.buildTubeFrame(
      [new THREE.Vector3(-0.69, 1.395, 0.45), new THREE.Vector3(0, 1.401, 0.46), new THREE.Vector3(0.69, 1.395, 0.45)],
      0.04,
      this.roofMaterial,
    );
    carRoot.add(wsHeader);
    roofFillet([new THREE.Vector3(-0.69, 1.395, 0.45), new THREE.Vector3(0, 1.401, 0.46), new THREE.Vector3(0.69, 1.395, 0.45)]);

    // 後ろのフレーム: 左のD-Pillar → 後ろ上のヘッダー → 右のD-Pillar をひと続きの丸い管にする。
    // 下は後ろへ張り出し、上は内側へ絞って屋根の下に収める(屋根の後縁は角丸なので、角では内側に寄せる)
    const rearFrame = CarBodyGenerator.buildTubeFrame(archPoints(), archTubeR, this.roofMaterial, 400);
    carRoot.add(rearFrame);
    roofFillet([new THREE.Vector3(-archXp, 1.395, -1.43), new THREE.Vector3(0, 1.395, -1.43), new THREE.Vector3(archXp, 1.395, -1.43)]);

    // ===============================================================
    // --- TOPMOST LAYER: CAMBERED CURVED ROOF PANEL ---
    // Sits directly on top of roofBaseY (1.42m) and spans wider (1.30m) & longer (2.02m)
    // than all frame members so NO frame member can EVER protrude!
    // ===============================================================
    const roofLength = 2.12;   // 前後のフレーム(後ろの膨らみを含む)を上から覆う長さ
    const roofWidth = 1.54;    // 左右のピラーとレールを上から覆う幅
    const roofMesh = CarBodyGenerator.buildRoundedRoof(
      roofWidth,
      roofLength,
      0.055,  // 屋根板の厚み(縁は丸めてある)
      0.075,  // 中央の盛り上がり(以前は4cm。ふっくら見える大きさ)
      -0.52,  // Center Z
      roofBaseY, // Sits exactly on the 1.42m frame ceiling line
      0.2,    // 上から見た角の丸み(半径)
      this.roofMaterial
    );
    carRoot.add(roofMesh);

    // Integrated Rear Spoiler with Rounded Form
    const spoilerGeo = new THREE.CapsuleGeometry(0.028, 0.86 - 0.056, 6, 14).rotateZ(Math.PI / 2).scale(1, 0.9, 2.4);   // 丸い断面のリップ
    const spoiler = new THREE.Mesh(spoilerGeo, this.roofMaterial);
    spoiler.position.set(0, roofBaseY + 0.03, -1.50);
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
      1.36,
      0.62,
      0.045, // 4.5cm gentle outward curve
      -0.46, // Slant angle
      new THREE.Vector3(0, 1.12, 0.585),
      this.glassMaterial
    );
    carRoot.add(windshield);
    this.windshield = windshield;

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
      const xPos = side * 0.70;
      const rotY = side > 0 ? Math.PI / 2 : -Math.PI / 2;

      // Front door window with rounded corners
      const fWin = CarBodyGenerator.buildRoundedWindow(0.70, 0.47, 0.05, this.glassMaterial);
      fWin.rotation.y = rotY;
      fWin.position.set(xPos, 1.12, 0.10);
      carRoot.add(fWin);

      // Rear door window with rounded corners
      const rWin = CarBodyGenerator.buildRoundedWindow(0.56, 0.47, 0.05, this.glassMaterial);
      rWin.rotation.y = rotY;
      rWin.position.set(xPos, 1.12, -0.62);
      carRoot.add(rWin);

      // C/D Quarter glass with rounded corners
      const qWin = CarBodyGenerator.buildRoundedWindow(0.44, 0.46, 0.06, this.glassMaterial);
      qWin.rotation.y = rotY;
      qWin.position.set(xPos, 1.115, -1.22);
      carRoot.add(qWin);
    });

    // C. Rear Hatch Window with Rounded Corners (Clean vertical fit at z=-1.505m)
    const rearWin = CarBodyGenerator.buildRoundedWindow(1.34, 0.47, 0.06, this.glassMaterial);
    rearWin.rotation.y = Math.PI;
    rearWin.position.set(0, 1.12, -1.45);
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

      // 黒い平たいオーバーフェンダーは、ボディの前後端より外へはみ出すため外し、下のボディ色の縁取りに置き換えた

      // 穴の縁をなめらかな丸い縁取り(ボディ色の半円の管)で包み、切り口の角とギザギザを隠す。
      // 管の中心はボディの外面(高さごとの幅)に沿わせて、ボディからはみ出さないようにする
      const bodyX = (y: number): number => {
        const k = (v: number, a0: number, a1: number, b0: number, b1: number): number => b0 + (b1 - b0) * Math.min(1, Math.max(0, (v - a0) / (a1 - a0)));
        return y < 0.52 ? k(y, 0.24, 0.52, 0.68, 0.77) : k(y, 0.52, 0.74, 0.77, 0.80);
      };
      const lipPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const th = THREE.MathUtils.degToRad(-15 + (210 * i) / 40);
        const y = wheelRadius + 0.01 + (archRadius + 0.01) * Math.sin(th);
        lipPts.push(new THREE.Vector3((pos.x > 0 ? 1 : -1) * (bodyX(y) - 0.012 - (pos.z > 0 ? 0.04 : 0)), y, THREE.MathUtils.clamp(pos.z + (archRadius + 0.01) * Math.cos(th), -1.54, 1.43)));   // ボディの前後端より外へは出さない
      }
      const lip = CarBodyGenerator.buildTubeFrame(lipPts, 0.032, this.bodyMaterial, 120);
      carRoot.add(lip);
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
    const fBumperGeo = CarBodyGenerator.buildRoundedBumperGeometry(1.46, 0.26, 0.18, 0.1, 0.035, 0.2, 1);
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
      const tY = 0.64;        // 後端の上縁は丸めて低くなっているので、その下に収まる高さ(y=0.485〜0.795)
      const tZ = -1.576;      // Flush-mounted against tailgate sheetmetal (z=-1.50m)

      // 1. Black Resin Bezel Housing (Flush recess base)
      const bezelGeo = new RoundedBoxGeometry(0.060, 0.31, 0.016, 4, 0.007);
      const bezel = new THREE.Mesh(bezelGeo, this.plasticMaterial);
      lampGroup.add(bezel);

      // 2. Upper Red LED Stop/Tail Lamp Segment
      const redGeo = new THREE.BoxGeometry(0.052, 0.14, 0.012);
      const redLens = new THREE.Mesh(redGeo, this.taillightEmissive);
      redLens.position.set(0, 0.07, -0.006);
      lampGroup.add(redLens);

      // 3. Middle Amber Turn Signal Segment
      const amberGeo = new THREE.BoxGeometry(0.052, 0.065, 0.012);
      const amberLens = new THREE.Mesh(amberGeo, this.amberEmissive);
      amberLens.position.set(0, -0.035, -0.006);
      lampGroup.add(amberLens);

      // 4. Lower White Reverse Backup Lamp Segment
      const revGeo = new THREE.BoxGeometry(0.052, 0.055, 0.012);
      const revLens = new THREE.Mesh(revGeo, this.headlightEmissive);
      revLens.position.set(0, -0.098, -0.006);
      lampGroup.add(revLens);

      lampGroup.position.set(tX, tY, tZ);
      carRoot.add(lampGroup);
    });

    // Rear Hatch Accent Garnish & Door Handle
    const garnishGeo = new RoundedBoxGeometry(0.50, 0.045, 0.025, 4, 0.012);
    const garnish = new THREE.Mesh(garnishGeo, this.silverMaterial);
    garnish.position.set(0, 0.80, -1.582);
    carRoot.add(garnish);

    const rHandleGeo = new RoundedBoxGeometry(0.16, 0.02, 0.02, 4, 0.009);
    const rHandle = new THREE.Mesh(rHandleGeo, this.plasticMaterial);
    rHandle.position.set(0, 0.77, -1.592);
    carRoot.add(rHandle);

    // Rear Bumper with Silver Skid Plate
    const rBumperGeo = CarBodyGenerator.buildRoundedBumperGeometry(1.46, 0.26, 0.18, 0.1, 0.035, 0.2, -1);
    const rBumper = new THREE.Mesh(rBumperGeo, this.plasticMaterial);
    rBumper.position.set(0, 0.32, -1.61);
    rBumper.castShadow = true;
    carRoot.add(rBumper);

    const rSkidGeo = new RoundedBoxGeometry(0.88, 0.12, 0.06, 4, 0.025);
    const rSkid = new THREE.Mesh(rSkidGeo, this.silverMaterial);
    rSkid.position.set(0, 0.24, -1.68);
    carRoot.add(rSkid);

    const refGeo = new THREE.BoxGeometry(0.14, 0.035, 0.02);
    [-0.48, 0.48].forEach((x) => {
      const refMesh = new THREE.Mesh(refGeo, this.taillightEmissive);
      refMesh.position.set(x, 0.34, -1.702);
      carRoot.add(refMesh);
    });

    const rearPlate = this.createLicensePlate('CROSS J', true);
    rearPlate.position.set(0, 0.34, -1.708);
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

      mirrorGroup.position.set(side * 0.78, 0.97, 0.62);   // Aピラーの外側
      carRoot.add(mirrorGroup);

      [0.15, -0.55].forEach((zH) => {
        const handleGeo = new THREE.BoxGeometry(0.02, 0.025, 0.10);
        const handle = new THREE.Mesh(handleGeo, this.plasticMaterial);
        handle.position.set(side * 0.72, 0.78, zH);
        carRoot.add(handle);
      });
    });

    // --- 9. 4 EXPOSED ALLOY ROAD WHEELS (same spec as the spare tire) ---
    this.addRoadWheels(carRoot, trackWidth, frontWheelZ, rearWheelZ, wheelRadius, wheelWidth);

    // Exhaust Pipe
    const exhaustGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.18, 16);
    exhaustGeo.rotateX(Math.PI / 2);
    const exhaust = new THREE.Mesh(exhaustGeo, this.chromeMaterial);
    exhaust.position.set(0.38, 0.18, -1.55);
    carRoot.add(exhaust);

    this.group.add(carRoot);
    this.addContactShadow(2.4, 4.5);
  }
}
