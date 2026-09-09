// ============================================================================
// track.js - 400m Track, Night Stadium Lighting, Obstacles & Gimmicks
// ============================================================================

import * as THREE from 'three';

export class GroundTrack {
  constructor(scene) {
    this.scene = scene;

    // Obstacle collections
    this.tombos = [];          // 放置されたトンボ (跳ね上がり)
    this.limeCarts = [];        // 石灰ライン引き (視界遮断煙幕)
    this.dynamicObstacles = []; // パイロン, ハードル (弾き飛ばし)
    this.soccerGoals = [];      // サッカーゴール (重い障害物)
    this.lethalObjects = [];    // 朝礼台, 外周ネット (バウンド障害物)
    this.jumpRamps = [];        // ジャンプ台 (大ジャンプ)
    this.boostPads = [];        // 加速パッド (超加速 & JET全快)
    this.bumps = [];            // 土の盛り上がり (Bumps / Mounds)
    this.dips = [];             // 泥の窪み (Potholes / Dips)

    // Track path spline & width (24m wide circuit!)
    this.trackSpline = null;
    this.trackPoints = [];
    this.trackWidth = 24.0; // 走路幅 24メートル (ワイドコース化)
    this.checkpoints = [];   // チェックポイントゲート

    this._buildTrackLayout();
    this._buildTrackSurface();
    this._buildGround();
    this._buildLighting();
    this._buildBackgroundScenery();
    this._buildTrackWalls();
    this._buildJumpRamps();
    this._buildBoostPads();
    this._buildBumpsAndDips();
    this._buildObstacles();
  }

  // 0. スプライン上の標高Y取得ユーティリティ (連続線分射影補間によりカクつきゼロのシルクのように滑らかな高さを算出)
  getSmoothElevation(x, z) {
    if (!this.trackPoints || this.trackPoints.length === 0) return 0;
    let minDistSq = Infinity;
    let closestIdx = 0;
    const count = this.trackPoints.length;
    for (let i = 0; i < count; i++) {
      const tp = this.trackPoints[i];
      const dx = x - tp.x;
      const dz = z - tp.z;
      const dsq = dx * dx + dz * dz;
      if (dsq < minDistSq) {
        minDistSq = dsq;
        closestIdx = i;
      }
    }

    const p = this.trackPoints[closestIdx];
    const prevP = this.trackPoints[(closestIdx - 1 + count) % count];
    const nextP = this.trackPoints[(closestIdx + 1) % count];

    const v1x = x - p.x;
    const v1z = z - p.z;
    const vNextX = nextP.x - p.x;
    const vNextZ = nextP.z - p.z;
    const lenNextSq = vNextX * vNextX + vNextZ * vNextZ;
    const dotNext = (v1x * vNextX + v1z * vNextZ) / (lenNextSq || 1);

    if (dotNext >= 0) {
      const t = Math.min(1.0, dotNext);
      return p.y + (nextP.y - p.y) * t;
    } else {
      const vPrevX = prevP.x - p.x;
      const vPrevZ = prevP.z - p.z;
      const lenPrevSq = vPrevX * vPrevX + vPrevZ * vPrevZ;
      const dotPrev = (v1x * vPrevX + v1z * vPrevZ) / (lenPrevSq || 1);
      const t = Math.min(1.0, Math.max(0.0, dotPrev));
      return p.y + (prevP.y - p.y) * t;
    }
  }

  getSplineYAt(x, z) {
    return this.getSmoothElevation(x, z);
  }

  getTrackTangentAt(x, z) {
    if (!this.trackPoints || !this.trackTangents) return new THREE.Vector3(0, 0, 1);
    const count = this.trackPoints.length;
    let minDistSq = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < count; i++) {
      const p = this.trackPoints[i];
      const dsq = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
      if (dsq < minDistSq) {
        minDistSq = dsq;
        closestIdx = i;
      }
    }
    return this.trackTangents[closestIdx] || new THREE.Vector3(0, 0, 1);
  }

  getTrackAngleAt(x, z) {
    const tan = this.getTrackTangentAt(x, z);
    return Math.atan2(tan.x, tan.z);
  }

  // スプライン上の連続進行度 u ∈ [0, 1) を最近傍セグメント投影により滑らかに算出
  getClosestProgress(x, z) {
    if (!this.trackPoints || this.trackPoints.length === 0) return 0;
    const count = this.trackPoints.length;
    let minDistSq = Infinity;
    let closestIdx = 0;
    for (let i = 0; i < count; i++) {
      const p = this.trackPoints[i];
      const dx = x - p.x;
      const dz = z - p.z;
      const dsq = dx * dx + dz * dz;
      if (dsq < minDistSq) {
        minDistSq = dsq;
        closestIdx = i;
      }
    }

    const p = this.trackPoints[closestIdx];
    const nextIdx = (closestIdx + 1) % count;
    const nextP = this.trackPoints[nextIdx];
    const prevIdx = (closestIdx - 1 + count) % count;
    const prevP = this.trackPoints[prevIdx];

    const vNextX = nextP.x - p.x;
    const vNextZ = nextP.z - p.z;
    const lenNextSq = vNextX * vNextX + vNextZ * vNextZ;
    const dotNext = lenNextSq > 0 ? ((x - p.x) * vNextX + (z - p.z) * vNextZ) / lenNextSq : 0;

    let progressIdx = closestIdx;
    if (dotNext >= 0) {
      const t = Math.min(1.0, dotNext);
      progressIdx = closestIdx + t;
    } else {
      const vPrevX = p.x - prevP.x;
      const vPrevZ = p.z - prevP.z;
      const lenPrevSq = vPrevX * vPrevX + vPrevZ * vPrevZ;
      const dotPrev = lenPrevSq > 0 ? ((x - prevP.x) * vPrevX + (z - prevP.z) * vPrevZ) / lenPrevSq : 0;
      const t = Math.min(1.0, Math.max(0.0, dotPrev));
      progressIdx = prevIdx + t;
    }

    return ((progressIdx / count) % 1.0 + 1.0) % 1.0;
  }

  getTrackLength() {
    if (!this.trackLength && this.trackSpline) {
      this.trackLength = this.trackSpline.getLength();
    }
    return this.trackLength || 1600;
  }

  // 1. コースレイアウト定義 (超広大メガサーキット: 完全直線ホームストレート・安全着地ロングストレート・高低差)
  _buildTrackLayout() {
    // Clean circuit with 280m pure straight finish line, smooth sweeping curves, and hill elevation!
    const rawPoints = [
      // 1. Home Straight (完全直線 X=0: Z=-80 から Z=200 までの超雄大なクリーンストレート)
      new THREE.Vector3(0, 0, 0),         // 0: Start / Finish Line (クリーンな直線)
      new THREE.Vector3(0, 0, 60),        // 1: Straightaway Boost (加速パッド1)
      new THREE.Vector3(0, 0, 130),       // 2: High-speed sprint
      new THREE.Vector3(0, 0, 200),       // 3: Straight exit toward Turn 1

      // 2. South Sweeper (超巨大な緩やか高速スイーパーコーナー R=120m)
      new THREE.Vector3(25, 0, 270),      // 4: Turn 1 Entry
      new THREE.Vector3(80, 0, 325),      // 5: Turn 1 Mid
      new THREE.Vector3(155, 0, 340),     // 6: Turn 1 Apex
      new THREE.Vector3(225, 0, 310),     // 7: Turn 2 Entry
      new THREE.Vector3(265, 0, 240),     // 8: Turn 2 Apex
      new THREE.Vector3(275, 0, 150),     // 9: Turn 2 Exit into Mega Back Straight

      // 3. Mega Back Straight (ジャンプ台は直線のど真ん中！着地後も100m以上直線が続く安全＆超爽快配置)
      new THREE.Vector3(270, 0.0, 75),    // 10: Back Straight Boost zone (加速パッド2)
      new THREE.Vector3(265, 0.0, 10),    // 11: Mega Jump Ramp launch (ジャンプ台1: 直線のど真ん中！)
      new THREE.Vector3(255, 0.0, -60),   // 12: Long straight landing zone (着地後もたっぷり直線！)
      new THREE.Vector3(240, 2.8, -140),  // 13: Thrilling hill climb (着地後に丘を駆け上がる！)
      new THREE.Vector3(210, 4.2, -220),  // 14: Hill crest (丘の頂上！)
      new THREE.Vector3(180, 1.5, -300),  // 15: Downhill glide into North Giant Loop

      // 4. North Giant Loop (大回りループコーナー R=130m)
      new THREE.Vector3(120, 1.0, -380),  // 16: North Loop Entry (バンク起伏)
      new THREE.Vector3(50, 1.8, -440),   // 17: North Loop Mid
      new THREE.Vector3(-30, 1.8, -440),  // 18: North Loop Apex
      new THREE.Vector3(-100, 1.0, -390), // 19: North Loop Downhill
      new THREE.Vector3(-160, 0.0, -340), // 20: North Loop Exit (加速パッド3)

      // 5. Technical Wave with Bumps & Dips (起伏バンプ＆窪みゾーン)
      new THREE.Vector3(-190, 0.0, -270), // 21: Wave 1 Entry
      new THREE.Vector3(-180, 0.0, -190), // 22: Dirt Mound Bumps (土の盛り上がり連続ジャンプ)
      new THREE.Vector3(-140, 0.0, -120), // 23: Pothole Dips (泥の窪み回避セクション)
      new THREE.Vector3(-85, 0.0, -70),   // 24: Wave transition

      // 6. Final Turn (ホームストレートへ向かう緩やかな大アール)
      new THREE.Vector3(-45, 0.0, -90),   // 25: Final Turn Entry
      new THREE.Vector3(-20, 0.0, -110),  // 26: Smooth entry into Home Straight
      new THREE.Vector3(0, 0, -80)        // 27: Home Straight approach into Goal Line
    ];

    this.trackSpline = new THREE.CatmullRomCurve3(rawPoints, true, 'centripetal');
    this.trackPoints = this.trackSpline.getPoints(360);

    // Precalculate forward course tangents at every track point
    this.trackTangents = [];
    const count = this.trackPoints.length;
    for (let i = 0; i < count; i++) {
      const nextP = this.trackPoints[(i + 1) % count];
      const p = this.trackPoints[i];
      const tan = new THREE.Vector3().subVectors(nextP, p).normalize();
      this.trackTangents.push(tan);
    }

    // Build checkpoints (36 gates cleanly distributed along the long course)
    // Index 0 is the exact Start / Goal line!
    const numCheckpoints = 36;
    for (let i = 0; i < numCheckpoints; i++) {
      const u = i / numCheckpoints;
      const pt = this.trackSpline.getPointAt(u);
      const tangent = this.trackSpline.getTangentAt(u).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      this.checkpoints.push({
        index: i,
        position: pt,
        normal: normal,
        tangent: tangent,
        radius: this.trackWidth * 0.65, // ~15.6m radius covering 24m wide track
        passed: false
      });
    }

    // Build lime chalk course lines & track surface marks
    this._buildChalkLines();
  }

  // 1.5 コース走路床の立体ソリッド描画 (高低差・丘・坂道に完全に追従する24m幅クレイ路面)
  _buildTrackSurface() {
    const segments = 360;
    const halfWidth = this.trackWidth * 0.5;
    const skirtWidth = 14.0; // Embankment slope descending smoothly to y=0 ground

    // Procedural track clay texture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#6e381c'; // Rich racing clay dirt
    ctx.fillRect(0, 0, 256, 256);

    // Clay dirt texture noise
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * 256;
      const y = Math.random() * 256;
      ctx.fillStyle = Math.random() < 0.5 ? 'rgba(50, 22, 10, 0.4)' : 'rgba(145, 80, 45, 0.35)';
      ctx.fillRect(x, y, 2, 2);
    }

    const surfaceTex = new THREE.CanvasTexture(canvas);
    surfaceTex.wrapS = THREE.RepeatWrapping;
    surfaceTex.wrapT = THREE.RepeatWrapping;
    surfaceTex.repeat.set(3, 60);

    const surfaceMat = new THREE.MeshStandardMaterial({
      map: surfaceTex,
      roughness: 0.88,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // 4 vertex columns per segment:
    // col 0: leftOuter (y = 0 ground level)
    // col 1: left (y = pt.y + 0.02 track level)
    // col 2: right (y = pt.y + 0.02 track level)
    // col 3: rightOuter (y = 0 ground level)
    const positions = [];
    const uvs = [];
    const indices = [];

    for (let i = 0; i <= segments; i++) {
      const u = (i % segments) / segments;
      const pt = this.trackSpline.getPointAt(u);
      const tangent = this.trackSpline.getTangentAt(u).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const left = pt.clone().addScaledVector(normal, -halfWidth);
      left.y = pt.y + 0.025;

      const right = pt.clone().addScaledVector(normal, halfWidth);
      right.y = pt.y + 0.025;

      // Outer skirts descend seamlessly to y=0 ground
      const leftOuter = pt.clone().addScaledVector(normal, -(halfWidth + skirtWidth));
      leftOuter.y = 0.005;

      const rightOuter = pt.clone().addScaledVector(normal, halfWidth + skirtWidth);
      rightOuter.y = 0.005;

      // Push 4 vertices per cross-section
      positions.push(leftOuter.x, leftOuter.y, leftOuter.z);
      positions.push(left.x, left.y, left.z);
      positions.push(right.x, right.y, right.z);
      positions.push(rightOuter.x, rightOuter.y, rightOuter.z);

      const vProgress = (i / segments) * 60;
      uvs.push(0, vProgress);
      uvs.push(0.33, vProgress);
      uvs.push(0.66, vProgress);
      uvs.push(1.0, vProgress);
    }

    // Build triangles connecting the 4 columns
    for (let i = 0; i < segments; i++) {
      const rowA = i * 4;
      const rowB = (i + 1) * 4;

      // Strip 1: Left Embankment (leftOuter -> left)
      indices.push(rowA + 0, rowB + 0, rowA + 1);
      indices.push(rowB + 0, rowB + 1, rowA + 1);

      // Strip 2: Main Track Surface (left -> right)
      indices.push(rowA + 1, rowB + 1, rowA + 2);
      indices.push(rowB + 1, rowB + 2, rowA + 2);

      // Strip 3: Right Embankment (right -> rightOuter)
      indices.push(rowA + 2, rowB + 2, rowA + 3);
      indices.push(rowB + 2, rowB + 3, rowA + 3);
    }

    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geom.setIndex(indices);
    geom.computeVertexNormals();

    const trackMesh = new THREE.Mesh(geom, surfaceMat);
    trackMesh.receiveShadow = true;
    this.scene.add(trackMesh);
  }

  // 2. クレイグラウンド (赤茶色の土) と白い石灰コースライン
  _buildGround() {
    // Procedural clay dirt texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Clay dirt red-brown base (warm daytime clay school ground)
    ctx.fillStyle = '#7d4224';
    ctx.fillRect(0, 0, 512, 512);

    // Multi-layered dirt grain noise
    for (let i = 0; i < 45000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = Math.random();
      if (r < 0.3) {
        ctx.fillStyle = 'rgba(75, 35, 18, 0.4)'; // dark soil
      } else if (r < 0.6) {
        ctx.fillStyle = 'rgba(165, 95, 55, 0.4)'; // light clay sand
      } else if (r < 0.85) {
        ctx.fillStyle = 'rgba(210, 130, 80, 0.3)'; // dry sunlit dust
      } else {
        ctx.fillStyle = 'rgba(240, 235, 220, 0.25)'; // chalk powder traces
      }
      ctx.fillRect(x, y, 1.5, 1.5);
    }

    const groundTex = new THREE.CanvasTexture(canvas);
    groundTex.wrapS = THREE.RepeatWrapping;
    groundTex.wrapT = THREE.RepeatWrapping;
    groundTex.repeat.set(60, 60);

    const groundGeo = new THREE.PlaneGeometry(1600, 1600);
    const groundMat = new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.9,
      metalness: 0.05
    });

    const groundMesh = new THREE.Mesh(groundGeo, groundMat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.receiveShadow = true;
    this.scene.add(groundMesh);

    // Soccer pitch chalk markings in center field
    this._buildSoccerFieldMarkings();
  }

  // サッカーコートの石灰白線 (学校グラウンド中央)
  _buildSoccerFieldMarkings() {
    const chalkMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });

    // Soccer touchline (70m x 45m)
    const lineThickness = 0.16;
    const addChalkLine = (x, z, w, h) => {
      const line = new THREE.Mesh(new THREE.PlaneGeometry(w, h), chalkMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.02, z);
      this.scene.add(line);
    };

    // Outer box
    addChalkLine(0, 0 - 22.5, 70, lineThickness);
    addChalkLine(0, 0 + 22.5, 70, lineThickness);
    addChalkLine(-35, 0, lineThickness, 45);
    addChalkLine(35, 0, lineThickness, 45);
    // Halfway line
    addChalkLine(0, 0, lineThickness, 45);

    // Center circle
    const circleGeo = new THREE.RingGeometry(6.8, 7.0, 32);
    const circle = new THREE.Mesh(circleGeo, chalkMat);
    circle.rotation.x = -Math.PI / 2;
    circle.position.set(0, 0.02, 0);
    this.scene.add(circle);
  }

  // 走路の内側・外側の白い石灰ライン (Chalk lines)
  _buildChalkLines() {
    const segments = 360;
    const halfWidth = this.trackWidth * 0.5;

    const chalkMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      side: THREE.DoubleSide
    });

    const innerPoints = [];
    const outerPoints = [];

    for (let i = 0; i <= segments; i++) {
      const u = (i % segments) / segments;
      const pt = this.trackSpline.getPointAt(u);
      const tangent = this.trackSpline.getTangentAt(u).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const inner = pt.clone().addScaledVector(normal, -halfWidth);
      inner.y = pt.y + 0.03;
      const outer = pt.clone().addScaledVector(normal, halfWidth);
      outer.y = pt.y + 0.03;

      innerPoints.push(inner);
      outerPoints.push(outer);
    }

    // Generate ribbon geometry for inner chalk line (0.15m wide)
    const chalkLineWidth = 0.15;
    const makeChalkRibbon = (points, dirMultiplier) => {
      const geom = new THREE.BufferGeometry();
      const positions = [];

      for (let i = 0; i < points.length; i++) {
        const p1 = points[i];
        const nextP = points[(i + 1) % points.length];
        const tangent = nextP.clone().sub(p1).normalize();
        const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

        const vLeft = p1.clone().addScaledVector(normal, -chalkLineWidth * 0.5);
        const vRight = p1.clone().addScaledVector(normal, chalkLineWidth * 0.5);

        positions.push(vLeft.x, vLeft.y, vLeft.z);
        positions.push(vRight.x, vRight.y, vRight.z);
      }

      const indices = [];
      for (let i = 0; i < points.length - 1; i++) {
        const base = i * 2;
        indices.push(base, base + 1, base + 2);
        indices.push(base + 1, base + 3, base + 2);
      }

      geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geom.setIndex(indices);
      geom.computeVertexNormals();
      return new THREE.Mesh(geom, chalkMat);
    };

    const innerMesh = makeChalkRibbon(innerPoints, 1);
    const outerMesh = makeChalkRibbon(outerPoints, -1);
    this.scene.add(innerMesh);
    this.scene.add(outerMesh);

    // Start / Goal checkered line banner on the ground (Clean straight X=0, Z=0)
    const startPt = this.trackSpline.getPointAt(0);
    const startTangent = this.trackSpline.getTangentAt(0).normalize();

    const startBannerGeo = new THREE.PlaneGeometry(this.trackWidth, 2.0);
    const checkerCanvas = document.createElement('canvas');
    checkerCanvas.width = 128;
    checkerCanvas.height = 32;
    const cctx = checkerCanvas.getContext('2d');
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, 128, 32);
    cctx.fillStyle = '#000000';
    for (let x = 0; x < 128; x += 16) {
      for (let y = 0; y < 32; y += 16) {
        if ((x / 16 + y / 16) % 2 === 0) {
          cctx.fillRect(x, y, 16, 16);
        }
      }
    }
    const checkerTex = new THREE.CanvasTexture(checkerCanvas);
    const startBannerMat = new THREE.MeshBasicMaterial({ map: checkerTex });
    const startBanner = new THREE.Mesh(startBannerGeo, startBannerMat);
    startBanner.rotation.x = -Math.PI / 2;
    startBanner.rotation.z = -Math.atan2(startTangent.z, startTangent.x) - Math.PI / 2;
    startBanner.position.set(startPt.x, startPt.y + 0.04, startPt.z);
    this.scene.add(startBanner);

    // Goal overhead banner arch (Pure clean overhead arch)
    const archPillarMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.6, roughness: 0.4 });
    const archBarMat = new THREE.MeshStandardMaterial({ color: 0xffff00, metalness: 0.2, roughness: 0.5 });

    const archGroup = new THREE.Group();
    archGroup.position.set(startPt.x, startPt.y, startPt.z);
    archGroup.rotation.y = -Math.atan2(startTangent.z, startTangent.x) - Math.PI / 2;

    const pillarLeft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.5, 12), archPillarMat);
    pillarLeft.position.set(-this.trackWidth * 0.52, 2.75, 0);
    pillarLeft.castShadow = true;

    const pillarRight = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 5.5, 12), archPillarMat);
    pillarRight.position.set(this.trackWidth * 0.52, 2.75, 0);
    pillarRight.castShadow = true;

    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(this.trackWidth + 0.5, 0.7, 0.4), archBarMat);
    crossBar.position.set(0, 5.2, 0);
    crossBar.castShadow = true;

    archGroup.add(pillarLeft);
    archGroup.add(pillarRight);
    archGroup.add(crossBar);
    this.scene.add(archGroup);
  }

  // 3. 環境・ライティング (快晴の青空・太陽光・超巨大運動場)
  _buildLighting() {
    // Daytime natural ambient & ground bounce (HemisphereLight)
    const hemiLight = new THREE.HemisphereLight(0xbbe0ff, 0x8a5229, 0.95);
    this.scene.add(hemiLight);

    // Bright direct sunlight (DirectionalLight)
    const sunLight = new THREE.DirectionalLight(0xfff7e8, 2.1);
    sunLight.position.set(200, 350, 160);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 1100;
    sunLight.shadow.camera.left = -420;
    sunLight.shadow.camera.right = 420;
    sunLight.shadow.camera.top = 520;
    sunLight.shadow.camera.bottom = -520;
    sunLight.shadow.bias = -0.0006;
    this.scene.add(sunLight);

    // Daytime crisp sky fog
    this.scene.fog = new THREE.FogExp2(0x8ec2fa, 0.0009);

    // 4 Corner Stadium Floodlight Towers (外周の四隅に配置)
    const towerPositions = [
      { x: -350, z: -500 },
      { x: 350, z: -500 },
      { x: 350, z: 450 },
      { x: -350, z: 450 }
    ];

    towerPositions.forEach((pos) => {
      this._createStadiumTower(pos.x, pos.z);
    });
  }

  _createStadiumTower(x, z) {
    const towerGroup = new THREE.Group();
    towerGroup.position.set(x, 0, z);

    const metalMat = new THREE.MeshStandardMaterial({
      color: 0x5a6578,
      metalness: 0.8,
      roughness: 0.35
    });

    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.9,
      roughness: 0.2
    });

    // Main lattice truss column
    const height = 32.0;
    const colGeo = new THREE.CylinderGeometry(0.7, 1.6, height, 6);
    const colMesh = new THREE.Mesh(colGeo, metalMat);
    colMesh.position.y = height * 0.5;
    colMesh.castShadow = true;
    towerGroup.add(colMesh);

    // Floodlight rack panel at top
    const rackGeo = new THREE.BoxGeometry(7.0, 3.5, 0.8);
    const rackMesh = new THREE.Mesh(rackGeo, metalMat);
    rackMesh.position.y = height + 1.2;
    rackMesh.castShadow = true;
    towerGroup.add(rackMesh);

    // Floodlight dish array (daytime metallic reflectors)
    for (let rx = -2.6; rx <= 2.6; rx += 1.3) {
      for (let ry = -1.0; ry <= 1.0; ry += 1.0) {
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.3), lampMat);
        bulb.position.set(rx, height + 1.2 + ry, 0.4);
        bulb.castShadow = true;
        towerGroup.add(bulb);
      }
    }

    this.scene.add(towerGroup);
  }

  // 4. 遠景 (昼の3階建て校舎、体育館、時計台、校庭の木々、防球ネット)
  _buildBackgroundScenery() {
    // School materials (Daytime cream concrete, blue sky reflecting windows)
    const schoolMat = new THREE.MeshStandardMaterial({ color: 0xded6c4, roughness: 0.85 });
    const roofTrimMat = new THREE.MeshStandardMaterial({ color: 0x3b587a, roughness: 0.5 });
    const winGlassMat = new THREE.MeshStandardMaterial({
      color: 0x5599dd,
      roughness: 0.15,
      metalness: 0.6
    });
    const sashMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const clockDialMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const clockHandMat = new THREE.MeshBasicMaterial({ color: 0x111111 });

    const schoolGroup = new THREE.Group();
    schoolGroup.position.set(0, 0, -560); // コース北端(Z=-455)のさらに100m奥に堂々と配置

    // Main 3-story concrete building body (enlarged for massive campus feel)
    const schoolBody = new THREE.Mesh(new THREE.BoxGeometry(260, 24, 28), schoolMat);
    schoolBody.position.y = 12;
    schoolBody.castShadow = true;
    schoolBody.receiveShadow = true;
    schoolGroup.add(schoolBody);

    // Blue roof perimeter parapet
    const roofTrim = new THREE.Mesh(new THREE.BoxGeometry(261, 1.4, 29), roofTrimMat);
    roofTrim.position.y = 24.7;
    roofTrim.castShadow = true;
    schoolGroup.add(roofTrim);

    // Clock tower on school roof
    const clockTower = new THREE.Mesh(new THREE.BoxGeometry(16, 13, 18), schoolMat);
    clockTower.position.set(0, 30.5, 0);
    clockTower.castShadow = true;
    const clockTrim = new THREE.Mesh(new THREE.BoxGeometry(16.8, 1.2, 18.8), roofTrimMat);
    clockTrim.position.set(0, 37.0, 0);
    clockGroupAdd: {
      const clockDial = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.4, 24), clockDialMat);
      clockDial.rotation.x = Math.PI / 2;
      clockDial.position.set(0, 31, 9.2);

      // Hands pointing to 3 o'clock
      const hourHand = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.3, 0.05), clockHandMat);
      hourHand.position.set(0.6, 31, 9.45);
      hourHand.rotation.z = -Math.PI / 2;
      const minHand = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.0, 0.05), clockHandMat);
      minHand.position.set(0, 32.0, 9.45);

      schoolGroup.add(clockTower);
      schoolGroup.add(clockTrim);
      schoolGroup.add(clockDial);
      schoolGroup.add(hourHand);
      schoolGroup.add(minHand);
    }

    // Windows on 3 school floors
    for (let floor = 0; floor < 3; floor++) {
      for (let x = -120; x <= 120; x += 10) {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(5.2, 4.0, 0.1), sashMat);
        frame.position.set(x, 5.0 + floor * 7.2, 14.06);
        const glass = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.6), winGlassMat);
        glass.position.set(x, 5.0 + floor * 7.2, 14.13);

        schoolGroup.add(frame);
        schoolGroup.add(glass);
      }
    }
    this.scene.add(schoolGroup);

    // Gymnasium (Gym with green curved arched roof)
    const gymGroup = new THREE.Group();
    gymGroup.position.set(-420, 0, -80); // 西側外周(X=-190)のさらに230m外側に配置

    const gymMat = new THREE.MeshStandardMaterial({ color: 0xd6cebb, roughness: 0.85 });
    const gymRoofMat = new THREE.MeshStandardMaterial({ color: 0x2e6b47, roughness: 0.5 });

    const gymBody = new THREE.Mesh(new THREE.BoxGeometry(70, 18, 120), gymMat);
    gymBody.position.y = 9.0;
    gymBody.castShadow = true;
    gymBody.receiveShadow = true;
    gymGroup.add(gymBody);

    const gymRoof = new THREE.Mesh(new THREE.CylinderGeometry(35, 35, 120, 24, 1, false, 0, Math.PI), gymRoofMat);
    gymRoof.position.set(0, 18, 0);
    gymRoof.rotation.z = Math.PI / 2;
    gymRoof.rotation.y = Math.PI / 2;
    gymRoof.castShadow = true;
    gymGroup.add(gymRoof);
    this.scene.add(gymGroup);

    // Trees around school yard (外周ネット沿いに配置)
    const treePositions = [
      { x: -280, z: -530 }, { x: -160, z: -530 }, { x: 160, z: -530 }, { x: 280, z: -530 },
      { x: 390, z: -380 }, { x: 400, z: -200 }, { x: 400, z: 0 }, { x: 400, z: 200 }, { x: 370, z: 360 },
      { x: -390, z: -300 }, { x: -400, z: 120 }, { x: -390, z: 300 },
      { x: -260, z: 490 }, { x: -120, z: 510 }, { x: 80, z: 510 }, { x: 240, z: 480 }
    ];

    treePositions.forEach((pos) => {
      this._createTree(pos.x, pos.z);
    });

    // Outer Stadium Fence (外周防球ネット: コースから100m以上離して接触ゼロに)
    this._buildOuterFence();
  }

  // 校庭の緑豊かな樹木
  _createTree(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a3d28, roughness: 0.9 });
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });

    // Trunk
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 4.0, 8), trunkMat);
    trunk.position.y = 2.0;
    trunk.castShadow = true;
    group.add(trunk);

    // Foliage clusters
    const foliage1 = new THREE.Mesh(new THREE.SphereGeometry(2.6, 8, 8), foliageMat);
    foliage1.position.set(0, 4.8, 0);
    foliage1.castShadow = true;
    const foliage2 = new THREE.Mesh(new THREE.SphereGeometry(2.1, 8, 8), foliageMat);
    foliage2.position.set(0.8, 6.2, 0.4);
    foliage2.castShadow = true;
    const foliage3 = new THREE.Mesh(new THREE.SphereGeometry(1.9, 8, 8), foliageMat);
    foliage3.position.set(-0.7, 5.8, -0.5);
    foliage3.castShadow = true;

    group.add(foliage1);
    group.add(foliage2);
    group.add(foliage3);
    this.scene.add(group);
  }

  // 外周防球ネット (超広大な校庭外周フェンス: 半径420m x 540m)
  _buildOuterFence() {
    const fenceRadiusX = 420;
    const fenceRadiusZ = 540;
    const postCount = 72;

    const postMat = new THREE.MeshStandardMaterial({ color: 0x556070, metalness: 0.7, roughness: 0.3 });
    const netMat = new THREE.MeshBasicMaterial({
      color: 0x667788,
      wireframe: true,
      transparent: true,
      opacity: 0.25
    });

    const netGeo = new THREE.CylinderGeometry(fenceRadiusX, fenceRadiusX, 14, postCount, 4, true);
    netGeo.scale(1.0, 1.0, fenceRadiusZ / fenceRadiusX);
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.y = 7;
    this.scene.add(netMesh);

    // Fence posts
    for (let i = 0; i < postCount; i++) {
      const angle = (i / postCount) * Math.PI * 2;
      const px = Math.cos(angle) * fenceRadiusX;
      const pz = Math.sin(angle) * fenceRadiusZ;

      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 14, 8), postMat);
      post.position.set(px, 7, pz);
      post.castShadow = true;
      this.scene.add(post);
    }

    this.lethalObjects.push({
      type: 'fence',
      radiusX: fenceRadiusX - 1.5,
      radiusZ: fenceRadiusZ - 1.5
    });
  }

  // 5. コース沿いの防護壁 (セーフティバリア: コースアウトを完全防止 & 高低差対応)
  _buildTrackWalls() {
    const segments = 360;
    const halfWidth = this.trackWidth * 0.5;
    const wallHeight = 1.25;
    const wallThickness = 0.45;

    const redMat = new THREE.MeshStandardMaterial({
      color: 0xdd1100,
      roughness: 0.35,
      metalness: 0.1
    });

    const whiteMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f4,
      roughness: 0.35,
      metalness: 0.1
    });

    const railMat = new THREE.MeshStandardMaterial({
      color: 0xd0d5dd,
      metalness: 0.85,
      roughness: 0.25
    });

    // Helper to generate a barrier along inner or outer edge
    const createSideBarrier = (sideSign) => {
      for (let i = 0; i < segments; i++) {
        const u1 = i / segments;
        const u2 = (i + 1) / segments;

        const p1 = this.trackSpline.getPointAt(u1);
        const t1 = this.trackSpline.getTangentAt(u1).normalize();
        const n1 = new THREE.Vector3(-t1.z, 0, t1.x).normalize();

        const p2 = this.trackSpline.getPointAt(u2);
        const t2 = this.trackSpline.getTangentAt(u2).normalize();
        const n2 = new THREE.Vector3(-t2.z, 0, t2.x).normalize();

        const wallP1 = p1.clone().addScaledVector(n1, sideSign * halfWidth);
        const wallP2 = p2.clone().addScaledVector(n2, sideSign * halfWidth);

        const center = wallP1.clone().add(wallP2).multiplyScalar(0.5);
        center.y = (wallP1.y + wallP2.y) * 0.5 + wallHeight * 0.5;

        const segVec = wallP2.clone().sub(wallP1);
        const segLen = segVec.length();
        const segAngle = Math.atan2(segVec.x, segVec.z);

        // Alternating red/white block (change every 2 segments for bold 90s arcade look)
        const isRed = Math.floor(i / 2) % 2 === 0;
        const blockMat = isRed ? redMat : whiteMat;

        const blockGeo = new THREE.BoxGeometry(wallThickness, wallHeight, segLen * 1.02);
        const block = new THREE.Mesh(blockGeo, blockMat);
        block.position.copy(center);
        block.rotation.y = segAngle;
        block.castShadow = true;
        block.receiveShadow = true;
        this.scene.add(block);

        // Top round steel guard rail on top of the barrier
        const railGeo = new THREE.CylinderGeometry(0.06, 0.06, segLen * 1.02, 8);
        railGeo.rotateX(Math.PI / 2);
        const rail = new THREE.Mesh(railGeo, railMat);
        rail.position.set(center.x, (wallP1.y + wallP2.y) * 0.5 + wallHeight + 0.06, center.z);
        rail.rotation.y = segAngle;
        rail.castShadow = true;
        this.scene.add(rail);
      }
    };

    // Build Inner Wall (sideSign = -1) and Outer Wall (sideSign = +1)
    createSideBarrier(-1);
    createSideBarrier(1);
  }

  // 6. グラウンド固有の障害物・ギミック (朝礼台、トンボ、石灰台車、パイロン、ハードル、サッカーゴール)
  _buildObstacles() {
    // 6.1 朝礼台 (ゴール周辺には絶対に置かず、遠くの校舎前広場へ退避)
    this._createPodium(40, -565);

    // 6.2 サッカーゴール (中央グラウンド内)
    this._createSoccerGoal(35, -10);
    this._createSoccerGoal(-40, 10);

    // 6.3 放置されたトンボ (整地具: 踏むと激しく跳ね上がりコントロール喪失)
    const tomboPositions = [
      { x: 140, z: 340, rot: 0.8 },
      { x: 260, z: -25, rot: -0.3 },
      { x: -10, z: -450, rot: 0.5 },
      { x: -175, z: -180, rot: -0.4 },
      { x: -40, z: -95, rot: 0.2 }
    ];
    tomboPositions.forEach((pos) => this._createTombo(pos.x, pos.z, pos.rot));

    // 6.4 石灰ライン引き粉末台車 (突入で真っ白な煙幕)
    const limePositions = [
      { x: 80, z: 320 },
      { x: 250, z: -100 },
      { x: 35, z: -450 },
      { x: -185, z: -240 },
      { x: -80, z: -75 }
    ];
    limePositions.forEach((pos) => this._createLimeCart(pos.x, pos.z));

    // 6.5 散乱障害物: パイロン (三角コーン) と ハードル
    this._createPylonsAndHurdles();
  }

  // 朝礼台 (Podium: 校舎前広場に退避)
  _createPodium(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const pipeMat = new THREE.MeshStandardMaterial({ color: 0x336699, metalness: 0.7, roughness: 0.3 });
    const topMat = new THREE.MeshStandardMaterial({ color: 0xb58855, roughness: 0.8 }); // wood top
    const stepMat = new THREE.MeshStandardMaterial({ color: 0x224466, metalness: 0.6 });

    // Top wooden platform
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.15, 2.5), topMat);
    topPlate.position.y = 1.35;
    topPlate.castShadow = true;
    group.add(topPlate);

    // Steel frame legs
    const legGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.3, 8);
    const legPositions = [
      [-1.8, 0.65, -1.1],
      [1.8, 0.65, -1.1],
      [-1.8, 0.65, 1.1],
      [1.8, 0.65, 1.1]
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const leg = new THREE.Mesh(legGeo, pipeMat);
      leg.position.set(lx, ly, lz);
      leg.castShadow = true;
      group.add(leg);
    });

    // Steps
    const step1 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.8), stepMat);
    step1.position.set(0, 0.5, 1.5);
    const step2 = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 0.8), stepMat);
    step2.position.set(0, 0.9, 1.1);
    group.add(step1);
    group.add(step2);

    this.scene.add(group);

    this.lethalObjects.push({
      type: 'podium',
      x: x,
      z: z,
      radius: 2.2
    });
  }

  // サッカーゴール
  _createSoccerGoal(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const netMat = new THREE.MeshBasicMaterial({ color: 0xcccccc, wireframe: true, transparent: true, opacity: 0.4 });

    // Posts & Crossbar (7.3m wide, 2.4m high)
    const postGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 8);
    const leftPost = new THREE.Mesh(postGeo, whiteMat);
    leftPost.position.set(-3.65, 1.2, 0);
    leftPost.castShadow = true;

    const rightPost = new THREE.Mesh(postGeo, whiteMat);
    rightPost.position.set(3.65, 1.2, 0);
    rightPost.castShadow = true;

    const barGeo = new THREE.CylinderGeometry(0.08, 0.08, 7.4, 8);
    barGeo.rotateZ(Math.PI / 2);
    const crossBar = new THREE.Mesh(barGeo, whiteMat);
    crossBar.position.set(0, 2.4, 0);
    crossBar.castShadow = true;

    // Net box
    const netGeo = new THREE.BoxGeometry(7.3, 2.4, 1.8);
    const netMesh = new THREE.Mesh(netGeo, netMat);
    netMesh.position.set(0, 1.2, -0.9);

    group.add(leftPost);
    group.add(rightPost);
    group.add(crossBar);
    group.add(netMesh);
    this.scene.add(group);

    this.soccerGoals.push({
      x: x,
      z: z,
      radius: 3.8
    });
  }

  // 放置されたトンボ (整地具)
  _createTombo(x, z, rotY) {
    const group = new THREE.Group();
    group.position.set(x, 0.06, z);
    group.rotation.y = rotY;

    const woodMat = new THREE.MeshStandardMaterial({ color: 0xa87948, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x666666, metalness: 0.6 });

    // T-bar ground rake blade (horizontal blade)
    const bladeGeo = new THREE.BoxGeometry(1.6, 0.08, 0.12);
    const blade = new THREE.Mesh(bladeGeo, metalMat);
    blade.position.set(0, 0.04, 0);
    blade.castShadow = true;
    group.add(blade);

    // Long wooden handle
    const handleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.8, 8);
    handleGeo.rotateX(Math.PI / 2);
    const handle = new THREE.Mesh(handleGeo, woodMat);
    handle.position.set(0, 0.04, 0.9);
    handle.castShadow = true;
    group.add(handle);

    this.scene.add(group);

    this.tombos.push({
      mesh: group,
      x: x,
      z: z,
      radius: 1.4,
      triggered: false
    });
  }

  // 石灰ライン引き台車
  _createLimeCart(x, z) {
    const group = new THREE.Group();
    group.position.set(x, 0, z);

    const greenMat = new THREE.MeshStandardMaterial({ color: 0x227744, metalness: 0.5, roughness: 0.5 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

    // Lime hopper hopper box (inverted pyramid-like)
    const hopper = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.6), greenMat);
    hopper.position.y = 0.35;
    hopper.castShadow = true;
    group.add(hopper);

    // White lime powder heap spilling on top
    const powder = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 6), whiteMat);
    powder.position.set(0, 0.55, 0);
    group.add(powder);

    // Handle bars
    const barGeo = new THREE.CylinderGeometry(0.015, 0.015, 1.0, 6);
    barGeo.rotateX(0.5);
    const handleL = new THREE.Mesh(barGeo, greenMat);
    handleL.position.set(-0.2, 0.6, -0.4);
    const handleR = new THREE.Mesh(barGeo, greenMat);
    handleR.position.set(0.2, 0.6, -0.4);
    group.add(handleL);
    group.add(handleR);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelL = new THREE.Mesh(wheelGeo, wheelMat);
    wheelL.position.set(-0.3, 0.12, 0);
    const wheelR = new THREE.Mesh(wheelGeo, wheelMat);
    wheelR.position.set(0.3, 0.12, 0);
    group.add(wheelL);
    group.add(wheelR);

    this.scene.add(group);

    this.limeCarts.push({
      mesh: group,
      x: x,
      z: z,
      radius: 1.1,
      hit: false
    });
  }

  // パイロン (コーン) と ハードル
  _createPylonsAndHurdles() {
    // Pylons (Red / White cones)
    const pylonPositions = [
      { x: 22, z: 260 },
      { x: 80, z: 320 },
      { x: 220, z: 310 },
      { x: 265, z: 230 },
      { x: 265, z: -10 },
      { x: 110, z: -415 },
      { x: 45, z: -450 },
      { x: -35, z: -450 },
      { x: -185, z: -270 },
      { x: -135, z: -130 },
      { x: -75, z: -75 },
      { x: -35, z: -95 }
    ];

    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff3300, roughness: 0.4 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    pylonPositions.forEach((pos) => {
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);

      const base = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.4), coneMat);
      base.position.y = 0.02;
      group.add(base);

      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.65, 12), coneMat);
      cone.position.y = 0.35;
      cone.castShadow = true;
      group.add(cone);

      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 0.14, 12), whiteMat);
      stripe.position.y = 0.32;
      group.add(stripe);

      this.scene.add(group);

      this.dynamicObstacles.push({
        type: 'pylon',
        mesh: group,
        pos: new THREE.Vector3(pos.x, 0, pos.z),
        vel: new THREE.Vector3(0, 0, 0),
        rotVel: new THREE.Vector3(0, 0, 0),
        radius: 0.5,
        hit: false
      });
    });

    // Hurdles (陸上ハードル)
    const hurdlePositions = [
      { x: 272, z: 130, rot: 0.0 },
      { x: -100, z: -415, rot: 0.5 },
      { x: -138, z: -105, rot: -0.2 }
    ];

    const hurdleBarMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
    const hurdleLegMat = new THREE.MeshStandardMaterial({ color: 0x8899aa, metalness: 0.7 });

    hurdlePositions.forEach((pos) => {
      const group = new THREE.Group();
      group.position.set(pos.x, 0, pos.z);
      group.rotation.y = pos.rot;

      // Wooden top crossbar with stripes
      const topBar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.03), hurdleBarMat);
      topBar.position.y = 0.85;
      topBar.castShadow = true;
      group.add(topBar);

      // Metal sliding height legs
      const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 8);
      const legL = new THREE.Mesh(legGeo, hurdleLegMat);
      legL.position.set(-0.5, 0.42, 0);
      const legR = new THREE.Mesh(legGeo, hurdleLegMat);
      legR.position.set(0.5, 0.42, 0);
      group.add(legL);
      group.add(legR);

      // Base runners
      const runnerGeo = new THREE.BoxGeometry(0.04, 0.03, 0.7);
      const runnerL = new THREE.Mesh(runnerGeo, hurdleLegMat);
      runnerL.position.set(-0.5, 0.02, 0.15);
      const runnerR = new THREE.Mesh(runnerGeo, hurdleLegMat);
      runnerR.position.set(0.5, 0.02, 0.15);
      group.add(runnerL);
      group.add(runnerR);

      this.scene.add(group);

      this.dynamicObstacles.push({
        type: 'hurdle',
        mesh: group,
        pos: new THREE.Vector3(pos.x, 0, pos.z),
        vel: new THREE.Vector3(0, 0, 0),
        rotVel: new THREE.Vector3(0, 0, 0),
        radius: 0.8,
        hit: false
      });
    });
  }

  // 7. ジャンプ台 (直線のど真ん中に設置！着地後も100m以上直線が続く安全＆超爽快メガジャンプ)
  _buildJumpRamps() {
    // Mega Back Straight Midpoint (x: 265, z: 10), jumping straight forward along the course
    this._createJumpRamp(265, 10, null, 10.0, 9.0, 2.4);
  }

  _createJumpRamp(x, z, angleY, width, length, height) {
    const rampAngle = (angleY !== null && angleY !== undefined)
      ? angleY
      : this.getTrackAngleAt(x, z);
    const y = this.getSplineYAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y, z);
    group.rotation.y = rampAngle;

    // 1. Procedural 256x256 arcade chevron arrow texture for the slope
    const slopeCanvas = document.createElement('canvas');
    slopeCanvas.width = 256;
    slopeCanvas.height = 256;
    const sCtx = slopeCanvas.getContext('2d');

    // Vivid arcade warning yellow background
    sCtx.fillStyle = '#f5c518';
    sCtx.fillRect(0, 0, 256, 256);

    // Hazard warning stripes on left & right borders (width 26px each)
    const stripeW = 26;
    sCtx.save();
    sCtx.fillStyle = '#111111';
    for (let sy = -256; sy < 512; sy += 28) {
      // Left border stripes
      sCtx.beginPath();
      sCtx.moveTo(0, sy);
      sCtx.lineTo(stripeW, sy + stripeW);
      sCtx.lineTo(stripeW, sy + stripeW + 14);
      sCtx.lineTo(0, sy + 14);
      sCtx.fill();

      // Right border stripes
      sCtx.beginPath();
      sCtx.moveTo(256 - stripeW, sy);
      sCtx.lineTo(256, sy - stripeW);
      sCtx.lineTo(256, sy - stripeW + 14);
      sCtx.lineTo(256 - stripeW, sy + 14);
      sCtx.fill();
    }
    sCtx.restore();

    // Red separation lines beside hazard stripes
    sCtx.fillStyle = '#d63031';
    sCtx.fillRect(stripeW - 2, 0, 4, 256);
    sCtx.fillRect(256 - stripeW - 2, 0, 4, 256);

    // Draw 3 bold arcade jump chevrons pointing up (+Z launch direction)
    const chevronYs = [200, 125, 50]; // Bottom to top
    for (const cy of chevronYs) {
      // Red outline / drop shadow
      sCtx.fillStyle = '#c0392b';
      sCtx.beginPath();
      sCtx.moveTo(128, cy - 28);
      sCtx.lineTo(218, cy + 26);
      sCtx.lineTo(198, cy + 38);
      sCtx.lineTo(128, cy - 2);
      sCtx.lineTo(58, cy + 38);
      sCtx.lineTo(38, cy + 26);
      sCtx.closePath();
      sCtx.fill();

      // Solid jet-black chevron
      sCtx.fillStyle = '#111111';
      sCtx.beginPath();
      sCtx.moveTo(128, cy - 32);
      sCtx.lineTo(214, cy + 22);
      sCtx.lineTo(196, cy + 32);
      sCtx.lineTo(128, cy - 8);
      sCtx.lineTo(60, cy + 32);
      sCtx.lineTo(42, cy + 22);
      sCtx.closePath();
      sCtx.fill();
    }

    // JUMP! arcade lettering between chevrons
    sCtx.fillStyle = '#111111';
    sCtx.font = '900 22px Impact, sans-serif';
    sCtx.textAlign = 'center';
    sCtx.textBaseline = 'middle';
    sCtx.fillText('▲  JUMP  ▲', 128, 238);

    const slopeTex = new THREE.CanvasTexture(slopeCanvas);
    slopeTex.wrapS = THREE.ClampToEdgeWrapping;
    slopeTex.wrapT = THREE.ClampToEdgeWrapping;

    const slopeMat = new THREE.MeshStandardMaterial({
      map: slopeTex,
      roughness: 0.35,
      metalness: 0.15,
      side: THREE.DoubleSide // Ensure slope face is visible from all angles without backface culling
    });

    // 2. Procedural industrial steel truss / metal plate texture for sides & back
    const sideCanvas = document.createElement('canvas');
    sideCanvas.width = 128;
    sideCanvas.height = 128;
    const sideCtx = sideCanvas.getContext('2d');
    sideCtx.fillStyle = '#2d3436';
    sideCtx.fillRect(0, 0, 128, 128);

    // Steel truss diagonal cross braces
    sideCtx.strokeStyle = '#636e72';
    sideCtx.lineWidth = 10;
    sideCtx.strokeRect(4, 4, 120, 120);
    sideCtx.beginPath();
    sideCtx.moveTo(4, 4);
    sideCtx.lineTo(124, 124);
    sideCtx.moveTo(124, 4);
    sideCtx.lineTo(4, 124);
    sideCtx.stroke();

    // Rivet bolts on corners
    sideCtx.fillStyle = '#b2bec3';
    const rivets = [[12, 12], [116, 12], [12, 116], [116, 116]];
    for (const [rx, ry] of rivets) {
      sideCtx.beginPath();
      sideCtx.arc(rx, ry, 4, 0, Math.PI * 2);
      sideCtx.fill();
    }

    const sideTex = new THREE.CanvasTexture(sideCanvas);
    sideTex.wrapS = THREE.RepeatWrapping;
    sideTex.wrapT = THREE.RepeatWrapping;
    sideTex.repeat.set(2, 1);

    const sideMat = new THREE.MeshStandardMaterial({
      map: sideTex,
      roughness: 0.5,
      metalness: 0.75,
      side: THREE.DoubleSide // Ensure sides and back are visible from all angles
    });

    const halfW = width * 0.5;
    const halfL = length * 0.5;

    // Solid concrete/asphalt foundation base under the ramp
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0x1e272e,
      roughness: 0.9,
      metalness: 0.1
    });
    const baseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(width + 1.2, 0.22, length + 1.2),
      baseMat
    );
    baseMesh.position.set(0, -0.11, 0);
    baseMesh.receiveShadow = true;
    group.add(baseMesh);

    // Slope Face geometry (CCW counter-clockwise order: upward facing normals)
    const slopePositions = [
      // Triangle 1
      -halfW, 0, -halfL,
       halfW, height, halfL,
       halfW, 0, -halfL,

      // Triangle 2
      -halfW, 0, -halfL,
      -halfW, height, halfL,
       halfW, height, halfL,
    ];
    const slopeUvs = [
      0, 0,
      1, 1,
      1, 0,

      0, 0,
      0, 1,
      1, 1,
    ];

    const slopeGeo = new THREE.BufferGeometry();
    slopeGeo.setAttribute('position', new THREE.Float32BufferAttribute(slopePositions, 3));
    slopeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(slopeUvs, 2));
    slopeGeo.computeVertexNormals();

    const slopeMesh = new THREE.Mesh(slopeGeo, slopeMat);
    slopeMesh.castShadow = true;
    slopeMesh.receiveShadow = true;
    group.add(slopeMesh);

    // Sides, Back & Bottom floor geometry
    const sidePositions = [
      // Back vertical face
      -halfW, height, halfL,
       halfW, height, halfL,
       halfW, 0, halfL,
      -halfW, height, halfL,
       halfW, 0, halfL,
      -halfW, 0, halfL,

      // Left triangle
      -halfW, 0, -halfL,
      -halfW, height, halfL,
      -halfW, 0, halfL,

      // Right triangle
       halfW, 0, -halfL,
       halfW, 0, halfL,
       halfW, height, halfL,

      // Bottom floor face
      -halfW, 0, -halfL,
       halfW, 0, -halfL,
       halfW, 0, halfL,
      -halfW, 0, -halfL,
       halfW, 0, halfL,
      -halfW, 0, halfL,
    ];
    const sideUvs = [
      // Back
      0, 1,  1, 1,  1, 0,
      0, 1,  1, 0,  0, 0,
      // Left
      0, 0,  1, 1,  1, 0,
      // Right
      0, 0,  1, 0,  1, 1,
      // Bottom floor
      0, 0,  1, 0,  1, 1,
      0, 0,  1, 1,  0, 1,
    ];

    const sideGeo = new THREE.BufferGeometry();
    sideGeo.setAttribute('position', new THREE.Float32BufferAttribute(sidePositions, 3));
    sideGeo.setAttribute('uv', new THREE.Float32BufferAttribute(sideUvs, 2));
    sideGeo.computeVertexNormals();

    const sideMesh = new THREE.Mesh(sideGeo, sideMat);
    sideMesh.castShadow = true;
    sideMesh.receiveShadow = true;
    group.add(sideMesh);

    // Steel edge side rails (Pipes & Yellow Posts)
    const railMat = new THREE.MeshStandardMaterial({ color: 0xe74c3c, metalness: 0.6, roughness: 0.25 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.5, roughness: 0.3 });

    const railSlopeLen = Math.hypot(length, height);
    const railPitch = Math.atan2(height, length);

    // Left & right main handrails
    const leftRail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, railSlopeLen, 12), railMat);
    leftRail.position.set(-halfW - 0.08, height * 0.5 + 0.3, 0);
    leftRail.rotation.x = Math.PI * 0.5 - railPitch;
    leftRail.castShadow = true;
    group.add(leftRail);

    const rightRail = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, railSlopeLen, 12), railMat);
    rightRail.position.set(halfW + 0.08, height * 0.5 + 0.3, 0);
    rightRail.rotation.x = Math.PI * 0.5 - railPitch;
    rightRail.castShadow = true;
    group.add(rightRail);

    // Vertical support posts (3 on each side)
    for (let p = 0; p <= 2; p++) {
      const pz = -halfL + (length * p) / 2;
      const py = (height * p) / 2;
      const postH = py + 0.3;

      const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, postH, 8), postMat);
      postL.position.set(-halfW - 0.08, postH * 0.5, pz);
      postL.castShadow = true;
      group.add(postL);

      const postR = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, postH, 8), postMat);
      postR.position.set(halfW + 0.08, postH * 0.5, pz);
      postR.castShadow = true;
      group.add(postR);
    }

    this.scene.add(group);

    this.jumpRamps.push({
      x: x,
      y: y,
      z: z,
      angleY: rampAngle,
      width: width,
      length: length,
      height: height,
      halfW: halfW,
      halfL: halfL
    });
  }

  // 8. 加速パッド (超加速 & JET全快ダッシュパネル)
  _buildBoostPads() {
    // 1: Home straight launch pad (x: 0, z: 60), automatically aligned with straightaway
    this._createBoostPad(0, 60, null, 8.0, 10.0);
    // 2: Mega Back Straight runway into jump ramp (x: 270, z: 75), automatically aligned with back straight
    this._createBoostPad(270, 75, null, 8.0, 10.0);
    // 3: North Giant Loop exit into Wave section (x: -160, z: -340), automatically aligned with progression direction
    this._createBoostPad(-160, -340, null, 8.0, 10.0);
  }

  _createBoostPad(x, z, angleY, width, length) {
    const padAngle = (angleY !== null && angleY !== undefined)
      ? angleY
      : this.getTrackAngleAt(x, z);
    const y = this.getSplineYAt(x, z);
    const group = new THREE.Group();
    group.position.set(x, y + 0.03, z);
    group.rotation.y = padAngle;

    // Glowing arcade chevron texture (>>>)
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Solid dark tech base
    ctx.fillStyle = '#0a1018';
    ctx.fillRect(0, 0, 128, 256);

    // Neon cyan & yellow forward arrows
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#00ffff';
    for (let y = 30; y < 256; y += 75) {
      ctx.beginPath();
      ctx.moveTo(20, y);
      ctx.lineTo(64, y + 36);
      ctx.lineTo(108, y);
      ctx.stroke();

      ctx.strokeStyle = '#ffff00';
      ctx.beginPath();
      ctx.moveTo(32, y + 10);
      ctx.lineTo(64, y + 36);
      ctx.lineTo(96, y + 10);
      ctx.stroke();
      ctx.strokeStyle = '#00ffff';
    }

    const boostTex = new THREE.CanvasTexture(canvas);
    boostTex.wrapS = THREE.RepeatWrapping;
    boostTex.wrapT = THREE.RepeatWrapping;

    const padMat = new THREE.MeshBasicMaterial({
      map: boostTex,
      transparent: true,
      opacity: 0.95
    });

    const padMesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), padMat);
    padMesh.rotation.x = -Math.PI / 2;
    padMesh.rotation.z = 0; // Point arrows forward along +Z launch direction
    group.add(padMesh);

    // Neon glowing border outline
    const borderMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const borderL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, length), borderMat);
    borderL.position.set(-width * 0.5, 0.02, 0);
    const borderR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, length), borderMat);
    borderR.position.set(width * 0.5, 0.02, 0);
    group.add(borderL);
    group.add(borderR);

    this.scene.add(group);

    this.boostPads.push({
      x: x,
      y: y,
      z: z,
      angleY: padAngle,
      width: width,
      length: length,
      texture: boostTex,
      halfW: width * 0.5,
      halfL: length * 0.5,
      cooldown: 0
    });
  }

  // 9. 土の盛り上がり (Bumps / Mounds) と 泥の窪み (Potholes / Dips)
  _buildBumpsAndDips() {
    // 9.1 盛り上がり (Bumps): 土の小山。乗ると跳ね上がり小ジャンプ！
    const bumpDefs = [
      { x: -180, z: -190, radius: 7.0, height: 0.9 }, // ウェーブセクション中央
      { x: -165, z: -150, radius: 6.5, height: 0.85 }, // 連続バンプ
      { x: 95, z: 325, radius: 6.0, height: 0.75 }    // 南スイーパー Apexイン側
    ];

    const moundCanvas = document.createElement('canvas');
    moundCanvas.width = 128;
    moundCanvas.height = 128;
    const mctx = moundCanvas.getContext('2d');
    mctx.fillStyle = '#8b4513';
    mctx.fillRect(0, 0, 128, 128);
    // Add white chalk zebra warning stripe across the mound
    mctx.fillStyle = '#f0f0f0';
    mctx.fillRect(20, 50, 88, 28);
    const moundTex = new THREE.CanvasTexture(moundCanvas);

    const moundMat = new THREE.MeshStandardMaterial({
      map: moundTex,
      roughness: 0.85,
      metalness: 0.05
    });

    bumpDefs.forEach((b) => {
      const y = this.getSplineYAt(b.x, b.z);
      const geo = new THREE.SphereGeometry(b.radius, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
      geo.scale(1.0, b.height / b.radius, 1.0);
      const mesh = new THREE.Mesh(geo, moundMat);
      mesh.position.set(b.x, y + 0.015, b.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      this.bumps.push(b);
    });

    // 9.2 窪み (Dips / Potholes): 泥のすり鉢状の穴。落ちるとガタガタ沈み込み＆減速！
    const dipDefs = [
      { x: -140, z: -120, radius: 5.5, depth: 0.55 }, // ウェーブ後半イン側
      { x: -95, z: -80, radius: 5.0, depth: 0.5 },    // 最終ターン手前
      { x: 235, z: 290, radius: 5.5, depth: 0.5 }     // ターン2出口
    ];

    const dipCanvas = document.createElement('canvas');
    dipCanvas.width = 128;
    dipCanvas.height = 128;
    const dctx = dipCanvas.getContext('2d');
    // Dark muddy wet center with rough edges
    const grad = dctx.createRadialGradient(64, 64, 5, 64, 64, 60);
    grad.addColorStop(0, '#1c1008');
    grad.addColorStop(0.65, '#3a1f10');
    grad.addColorStop(1, 'rgba(75, 35, 18, 0)');
    dctx.fillStyle = grad;
    dctx.fillRect(0, 0, 128, 128);
    const dipTex = new THREE.CanvasTexture(dipCanvas);

    const dipMat = new THREE.MeshBasicMaterial({
      map: dipTex,
      transparent: true,
      opacity: 0.95
    });

    dipDefs.forEach((d) => {
      const y = this.getSplineYAt(d.x, d.z);
      const geo = new THREE.PlaneGeometry(d.radius * 2, d.radius * 2);
      const mesh = new THREE.Mesh(geo, dipMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(d.x, y + 0.025, d.z);
      this.scene.add(mesh);

      this.dips.push(d);
    });
  }

  // Update flying dynamic obstacles & boost pads
  updateDynamics(dt) {
    // Animate boost pad chevrons
    for (let i = 0; i < this.boostPads.length; i++) {
      const pad = this.boostPads[i];
      if (pad.texture) {
        pad.texture.offset.y -= dt * 3.5; // Flowing forward in arrow launch direction
      }
      if (pad.cooldown > 0) {
        pad.cooldown = Math.max(0, pad.cooldown - dt);
      }
    }

    for (let i = 0; i < this.dynamicObstacles.length; i++) {
      const obs = this.dynamicObstacles[i];
      if (!obs.hit) continue;

      obs.vel.y -= 18.0 * dt; // gravity
      obs.pos.addScaledVector(obs.vel, dt);

      obs.mesh.position.copy(obs.pos);
      obs.mesh.rotation.x += obs.rotVel.x * dt;
      obs.mesh.rotation.y += obs.rotVel.y * dt;
      obs.mesh.rotation.z += obs.rotVel.z * dt;

      // Ground collision / slide
      if (obs.pos.y < 0) {
        obs.pos.y = 0;
        obs.vel.y = -obs.vel.y * 0.4;
        obs.vel.x *= 0.85;
        obs.vel.z *= 0.85;
        obs.rotVel.multiplyScalar(0.85);
      }
    }
  }

  // Check if position is off the track (mud zone)
  isOffTrack(pos) {
    let minDistSq = Infinity;
    for (let i = 0; i < this.trackPoints.length; i++) {
      const tp = this.trackPoints[i];
      const dx = pos.x - tp.x;
      const dz = pos.z - tp.z;
      const dsq = dx * dx + dz * dz;
      if (dsq < minDistSq) {
        minDistSq = dsq;
      }
    }

    const dist = Math.sqrt(minDistSq);
    return dist > (this.trackWidth * 0.5 + 0.8);
  }
}
