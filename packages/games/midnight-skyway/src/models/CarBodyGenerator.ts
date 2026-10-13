import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export interface LowerBodySection {
  z: number;
  yBottom: number;
  yTop: number;         // Top edge: hood center, cowl, or rear deck center
  sill: [number, number];       // [x, y]
  wheelArch?: [number, number]; // [x, y] cutout arch
  fender: [number, number];     // [x, y] fender flare peak
  beltline: [number, number];   // [x, y] waistline (top of door / fender)
}

export class CarBodyGenerator {
  /**
   * Generates a molded LOWER car body (hood, fenders, doors, sills, rear tailgate lower).
   * Stops cleanly at the beltline (waistline), leaving the entire cabin open for windows and pillars!
   */
  public static generateLowerBodyMesh(
    sections: LowerBodySection[],
    isCabinZone: boolean[],
    bodyMaterial: THREE.Material,
    isWheelArchZone?: boolean[]
  ): THREE.Mesh {
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    // Points per section ring:
    // In hood/nose zone (front) and rear trunk zone: fully sheeted across top center.
    // In cabin zone: leaves the center open (only doors/sills on sides, and cabin floor at bottom)!
    // To keep topology consistent and clean:
    // 0: Bottom Center (0, yBottom, z)
    // 1: Right Sill (sill.x, sill.y, z)
    // 2: Right Arch / Lower Quarter (archX, archY, z)
    // 3: Right Fender Flare Peak (fender.x, fender.y, z)
    // 4: Right Beltline (beltline.x, beltline.y, z)
    // 5: Top Center or Inward Door Lip (if cabin: [beltline.x * 0.9, beltline.y, z], else: [0, yTop, z])
    // 6: Left Inward Door Lip or Top Center
    // 7: Left Beltline (-beltline.x, beltline.y, z)
    // 8: Left Fender Flare Peak (-fender.x, fender.y, z)
    // 9: Left Arch / Lower Quarter (-archX, archY, z)
    // 10: Left Sill (-sill.x, sill.y, z)

    const pointsPerRing = 10;

    sections.forEach((sec, sIdx) => {
      const z = sec.z;
      const isCabin = isCabinZone[sIdx];

      const archX = sec.wheelArch ? sec.wheelArch[0] : (sec.sill[0] + sec.fender[0]) * 0.5;
      const archY = sec.wheelArch ? sec.wheelArch[1] : (sec.sill[1] + sec.fender[1]) * 0.5;

      // In cabin zone, top points 4 & 5 form the top sill of the door, NOT a solid roof!
      const topRightX = isCabin ? sec.beltline[0] * 0.92 : 0;
      const topRightY = isCabin ? sec.beltline[1] - 0.02 : sec.yTop;

      const topLeftX = isCabin ? -sec.beltline[0] * 0.92 : 0;
      const topLeftY = isCabin ? sec.beltline[1] - 0.02 : sec.yTop;

      const ring = [
        // 0: Bottom Center
        [0, sec.yBottom, z],
        // 1: Right Sill
        [sec.sill[0], sec.sill[1], z],
        // 2: Right Arch / Lower Quarter
        [archX, archY, z],
        // 3: Right Fender Flare Peak
        [sec.fender[0], sec.fender[1], z],
        // 4: Right Beltline (Window bottom sill)
        [sec.beltline[0], sec.beltline[1], z],
        // 5: Top Center or Door top inner edge
        [topRightX, topRightY, z],
        // 6: Left Beltline
        [topLeftX, topLeftY, z],
        // 7: Left Beltline (Window bottom sill)
        [-sec.beltline[0], sec.beltline[1], z],
        // 8: Left Fender Flare Peak
        [-sec.fender[0], sec.fender[1], z],
        // 9: Left Arch / Lower Quarter
        [-archX, archY, z],
        // 10: Left Sill
        [-sec.sill[0], sec.sill[1], z],
      ];

      ring.forEach((p, pIdx) => {
        vertices.push(p[0], p[1], p[2]);
        uvs.push(pIdx / (pointsPerRing - 1), sIdx / (sections.length - 1));
      });
    });

    const ringCount = 11;

    // Triangulate between sections
    for (let s = 0; s < sections.length - 1; s++) {
      const r0 = s * ringCount;
      const r1 = (s + 1) * ringCount;
      const isCabin = isCabinZone[s] && isCabinZone[s + 1];
      const isArch = isWheelArchZone ? isWheelArchZone[s] && isWheelArchZone[s + 1] : false;

      for (let p = 0; p < ringCount; p++) {
        const nextP = (p + 1) % ringCount;

        // In cabin zone, SKIP triangle between 5 and 6 so the cabin interior stays completely open!
        if (isCabin && p === 5) {
          continue;
        }

        // In wheel arch cutout zone, SKIP outer wall triangles (sill to arch) so the wheelhouse is completely hollowed out!
        // p === 1: Right side (Right Sill to Right Arch)
        // p === 9: Left side (Left Arch to Left Sill)
        // This ensures the body never penetrates the tires!
        if (isArch && (p === 1 || p === 9)) {
          continue;
        }

        const i0 = r0 + p;
        const i1 = r0 + nextP;
        const i2 = r1 + p;
        const i3 = r1 + nextP;

        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    // Front Nose Cap (Independent vertices so normals point straight +Z without smoothing with side walls)
    const secFront = sections[0];
    const frontCenterIdx = vertices.length / 3;
    const frontCenterY = (secFront.yBottom + secFront.yTop) * 0.5;
    vertices.push(0, frontCenterY, secFront.z);
    uvs.push(0.5, 0.5);

    const frontRingStart = vertices.length / 3;
    for (let p = 0; p < ringCount; p++) {
      const origIdx = p * 3;
      vertices.push(vertices[origIdx], vertices[origIdx + 1], vertices[origIdx + 2]);
      uvs.push(uvs[p * 2], uvs[p * 2 + 1]);
    }
    // Front cap triangles (facing +Z, CCW winding from front)
    for (let p = 0; p < ringCount; p++) {
      const nextP = (p + 1) % ringCount;
      indices.push(frontCenterIdx, frontRingStart + p, frontRingStart + nextP);
    }

    // Rear Tailgate Cap (Independent vertices so normals point straight -Z, eliminating concave shading distortion!)
    const lastSecIdx = sections.length - 1;
    const secRear = sections[lastSecIdx];
    const rearCenterIdx = vertices.length / 3;
    const rearCenterY = (secRear.yBottom + secRear.yTop) * 0.5;
    vertices.push(0, rearCenterY, secRear.z);
    uvs.push(0.5, 0.5);

    const rearRingStart = vertices.length / 3;
    const origRearOffset = lastSecIdx * ringCount * 3;
    for (let p = 0; p < ringCount; p++) {
      const origIdx = origRearOffset + p * 3;
      vertices.push(vertices[origIdx], vertices[origIdx + 1], vertices[origIdx + 2]);
      uvs.push(uvs[p * 2], uvs[p * 2 + 1]);
    }
    // Rear cap triangles (facing -Z, CCW winding from rear)
    for (let p = 0; p < ringCount; p++) {
      const nextP = (p + 1) % ringCount;
      indices.push(rearCenterIdx, rearRingStart + nextP, rearRingStart + p);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, bodyMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Generates black inner wheelhouse liner so wheels have realistic enclosed wheel wells.
   */
  public static generateWheelWell(
    centerX: number,
    centerY: number,
    centerZ: number,
    radius: number,
    depth: number,
    material: THREE.Material
  ): THREE.Mesh {
    const wellGeo = new THREE.CylinderGeometry(radius, radius, depth, 16, 1, true, 0, Math.PI);
    wellGeo.rotateZ(Math.PI / 2);
    wellGeo.rotateY(centerX > 0 ? 0 : Math.PI);
    const mesh = new THREE.Mesh(wellGeo, material);
    mesh.position.set(centerX, centerY, centerZ);
    return mesh;
  }

  /**
   * Generates molded overfender flare arc (lip molding along wheel arch)
   */
  public static generateOverfenderArc(
    centerX: number,
    centerY: number,
    centerZ: number,
    radius: number,
    flareWidth: number,
    material: THREE.Material
  ): THREE.Mesh {
    const points: THREE.Vector3[] = [];
    const segments = 16;
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI;
      const x = 0;
      const y = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      points.push(new THREE.Vector3(x, y, z));
    }

    const shape = new THREE.Shape();
    const sign = centerX > 0 ? 1 : -1;
    shape.moveTo(0, 0);
    shape.lineTo(sign * flareWidth, -0.02);
    shape.lineTo(sign * flareWidth, 0.04);
    shape.lineTo(0, 0.06);
    shape.closePath();

    const curve = new THREE.CatmullRomCurve3(points);
    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      steps: 16,
      extrudePath: curve,
      bevelEnabled: false,
    });

    const mesh = new THREE.Mesh(extrudeGeo, material);
    mesh.position.set(centerX, centerY, centerZ);
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * Builds an integrated structural cabin base rail that firmly connects the lower body
   * to the upper pillars (A, B, C, D) and windshield/window frames.
   * Completely eliminates gaps between lower body and upper cabin frame!
   */
  public static buildCabinBaseFrame(
    beltlineY: number,
    frontCowlZ: number,
    rearTailgateZ: number,
    halfWidth: number,
    material: THREE.Material,
    rounded = false,   // true: 角を丸めた部材にする(Cross J)
  ): THREE.Group {
    const group = new THREE.Group();
    if (rounded) {
      // 丸めた版: カウル・左右・後ろの4本をつなぎ目のないひと続きの輪(角丸の長方形)にする
      // ボディの上縁(丸めた肩・後端)にまたがる位置に置いて、ボディとの間に溝ができないようにする
      const x0 = halfWidth - 0.035, zf = frontCowlZ, zr = rearTailgateZ - 0.03, cr = 0.12, y0 = beltlineY - 0.02;
      const pts: THREE.Vector3[] = [];
      const line = (ax: number, az: number, bx: number, bz: number, n: number): void => {
        for (let i = 0; i < n; i++) { const t = i / n; pts.push(new THREE.Vector3(ax + (bx - ax) * t, y0, az + (bz - az) * t)); }
      };
      const arc = (cx: number, cz: number, a0: number): void => {
        for (let i = 0; i < 8; i++) { const a = a0 - (i / 8) * (Math.PI / 2); pts.push(new THREE.Vector3(cx + Math.cos(a) * cr, y0, cz + Math.sin(a) * cr)); }
      };
      arc(x0 - cr, zf - cr, Math.PI / 2);
      line(x0, zf - cr, x0, zr + cr, 40);
      arc(x0 - cr, zr + cr, 0);
      line(x0 - cr, zr, -x0 + cr, zr, 24);
      arc(-x0 + cr, zr + cr, -Math.PI / 2);
      line(-x0, zr + cr, -x0, zf - cr, 40);
      arc(-x0 + cr, zf - cr, Math.PI);
      line(-x0 + cr, zf, x0 - cr, zf, 24);
      const loop = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true, 'centripetal'), 360, 0.055, 14, true),
        material,
      );
      loop.scale.y = 0.45;                // 縦につぶして、ボディの上縁と面一(ほぼ平ら)になだらかにつなぐ
      loop.position.y = y0 * (1 - 0.45);
      loop.castShadow = true;
      group.add(loop);
      return group;
    }
    const box = (w: number, h: number, d: number): THREE.BufferGeometry =>
      rounded ? new RoundedBoxGeometry(w, h, d, 4, 0.034) : new THREE.BoxGeometry(w, h, d);

    // 1. Front Cowl Top Crossmember (Windshield base & hood trailing edge)
    const cowlGeo = box(halfWidth * 2 - 0.04, 0.08, 0.12);
    const cowlMesh = new THREE.Mesh(cowlGeo, material);
    cowlMesh.position.set(0, beltlineY, frontCowlZ);
    cowlMesh.castShadow = true;
    group.add(cowlMesh);

    // 2. Left & Right Waistline Side Sills (Door shoulder rails connecting A to D pillars)
    const railLength = Math.abs(frontCowlZ - rearTailgateZ) + 0.04;
    const railCenterZ = (frontCowlZ + rearTailgateZ) * 0.5;
    const sideRailGeo = box(0.08, 0.08, railLength);

    [-1, 1].forEach((side) => {
      const sideRail = new THREE.Mesh(sideRailGeo, material);
      sideRail.position.set(side * (halfWidth - 0.02), beltlineY, railCenterZ);
      sideRail.castShadow = true;
      group.add(sideRail);
    });

    // 3. Rear Hatch Lower Waist Rail (Windshield base on tailgate)
    const rearRailGeo = box(halfWidth * 2 - 0.06, 0.08, 0.10);
    const rearRail = new THREE.Mesh(rearRailGeo, material);
    rearRail.position.set(0, beltlineY, rearTailgateZ);
    rearRail.castShadow = true;
    group.add(rearRail);

    return group;
  }

  /**
   * ふっくらした丸みのある下半身(ボンネット・フェンダー・ドア・リア)を作る。
   * generateLowerBodyMesh と同じ断面データ(sections)を使うが、次の点が違う。
   *  - 断面を前後方向になめらかに補間する(単調な3次補間。折れ目・出っ張りを出さない)
   *  - 肩から上の断面(フェンダー→ベルトライン→天面)を曲線にする
   *  - 前端・後端は、上から見た角に半径 noseRadius / tailRadius の丸み、前後の上縁に roll の丸みを付ける
   *  - 前後のキャップ面の頂点を側面と共有し、角のところまで滑らかに陰影が続く
   */
  public static generateSmoothLowerBodyMesh(
    sections: LowerBodySection[],
    isCabinZone: boolean[],
    bodyMaterial: THREE.Material,
    isWheelArchZone: boolean[],
    opts: { noseRadius: number; tailRadius: number; roll: number; zStep?: number; edgeSub?: number; archCircles?: { z: number; y: number; r: number; xMin: number }[] },
  ): THREE.Mesh {
    const zStep = opts.zStep ?? 0.04;
    const edgeSub = opts.edgeSub ?? 3;
    const nSec = sections.length;

    // 各断面の輪(11点)。順序は generateLowerBodyMesh と同じ。
    const rings = sections.map((sec, i) => {
      const cabin = isCabinZone[i];
      const archX = sec.wheelArch ? sec.wheelArch[0] : (sec.sill[0] + sec.fender[0]) * 0.5;
      const archY = sec.wheelArch ? sec.wheelArch[1] : (sec.sill[1] + sec.fender[1]) * 0.5;
      const tx = cabin ? sec.beltline[0] * 0.92 : 0;
      const ty = cabin ? sec.beltline[1] - 0.02 : sec.yTop;
      return [
        [0, sec.yBottom], [sec.sill[0], sec.sill[1]], [archX, archY], [sec.fender[0], sec.fender[1]], [sec.beltline[0], sec.beltline[1]],
        [tx, ty], [-tx, ty],
        [-sec.beltline[0], sec.beltline[1]], [-sec.fender[0], sec.fender[1]], [-archX, archY], [-sec.sill[0], sec.sill[1]],
      ];
    });
    const RC = 11;

    // z 方向: 各点の座標を、断面の z に対する単調3次補間(Fritsch–Carlson)で補間する
    const zs = sections.map((s) => s.z);   // 降順(前→後)
    const tangents: number[][][] = rings.map(() => Array.from({ length: RC }, () => [0, 0]));
    for (let p = 0; p < RC; p++) {
      for (let c = 0; c < 2; c++) {
        const d: number[] = [];
        for (let i = 0; i < nSec - 1; i++) d.push((rings[i + 1][p][c] - rings[i][p][c]) / (zs[i + 1] - zs[i]));
        for (let i = 0; i < nSec; i++) {
          let m: number;
          if (i === 0) m = d[0];
          else if (i === nSec - 1) m = d[nSec - 2];
          else if (d[i - 1] * d[i] <= 0) m = 0;
          else {
            const h0 = zs[i] - zs[i - 1], h1 = zs[i + 1] - zs[i], w1 = 2 * h1 + h0, w2 = h1 + 2 * h0;
            m = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
          }
          tangents[i][p][c] = m;
        }
      }
    }
    const ringAt = (z: number): { pts: number[][]; seg: number } => {
      let i = 0;
      while (i < nSec - 2 && z < zs[i + 1]) i++;
      const h = zs[i + 1] - zs[i], t = (z - zs[i]) / h;
      const t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      const pts: number[][] = [];
      for (let p = 0; p < RC; p++) {
        const pt: number[] = [];
        for (let c = 0; c < 2; c++) {
          pt.push(h00 * rings[i][p][c] + h10 * h * tangents[i][p][c] + h01 * rings[i + 1][p][c] + h11 * h * tangents[i + 1][p][c]);
        }
        pts.push(pt);
      }
      return { pts, seg: i };
    };

    // サンプルする z: 一定間隔 + 全断面の z(前後端は細かく)
    const zFront = zs[0], zRear = zs[nSec - 1];
    const zSet = new Set<number>(zs.map((z) => Math.round(z * 1e4) / 1e4));
    for (let z = zFront; z > zRear; z -= zStep) zSet.add(Math.round(z * 1e4) / 1e4);
    const fine = Math.max(opts.noseRadius, opts.tailRadius, opts.roll) + 0.02;
    for (let d = 0; d <= fine; d += 0.015) { zSet.add(Math.round((zFront - d) * 1e4) / 1e4); zSet.add(Math.round((zRear + d) * 1e4) / 1e4); }
    const zList = [...zSet].filter((z) => z <= zFront + 1e-6 && z >= zRear - 1e-6).sort((a, b) => b - a);

    // 上の輪の曲線: 肩から天面までの辺(2→3,3→4,4→5 と 6→7,7→8,8→9)を Catmull-Rom で細分し、他の辺は直線
    const smoothEdge = new Set([2, 3, 4, 6, 7, 8]);
    const cr = (p0: number[], p1: number[], p2: number[], p3: number[], t: number): number[] => {
      const t2 = t * t, t3 = t2 * t;
      return [0, 1].map((c) => 0.5 * ((2 * p1[c]) + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3));
    };
    const subdivide = (pts: number[][]): number[][] => {
      const out: number[][] = [];
      for (let e = 0; e < RC; e++) {
        const a = pts[e], b = pts[(e + 1) % RC];
        for (let k = 0; k < edgeSub; k++) {
          const t = k / edgeSub;
          if (smoothEdge.has(e)) out.push(cr(pts[(e + RC - 1) % RC], a, b, pts[(e + 2) % RC], t));
          else out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
        }
      }
      return out;
    };
    const PC = RC * edgeSub;   // 輪1周の頂点数

    const vertices: number[] = [];
    const uvs: number[] = [];
    const segOfSample: number[] = [];
    const roundEnd = (x: number, y: number, d: number, r: number, W: number, yMid: number, yTopRef: number): [number, number] => {
      // d: 端面からの距離。平面の角の丸み(xの引き込み)と、上縁の丸み(yの落ち込み)
      let nx = x, ny = y;
      if (d < r) {
        const g = Math.sqrt(Math.max(0, 1 - (1 - d / r) * (1 - d / r)));
        const xc = W - r, ax = Math.abs(x);
        if (ax > xc) nx = Math.sign(x) * (xc + (ax - xc) * g);
      }
      const rr = opts.roll;
      if (d < rr && y > yMid) {
        const drop = rr * (1 - Math.sqrt(Math.max(0, 1 - (1 - d / rr) * (1 - d / rr))));
        const wgt = Math.min(1, (y - yMid) / Math.max(1e-3, yTopRef - yMid));
        ny = y - drop * wgt;
      }
      return [nx, ny];
    };
    const Wfront = Math.max(...rings[0].map((p) => Math.abs(p[0])));
    const Wrear = Math.max(...rings[nSec - 1].map((p) => Math.abs(p[0])));
    zList.forEach((z, zi) => {
      const { pts, seg } = ringAt(z);
      segOfSample.push(seg);
      const sub = subdivide(pts);
      const yMid = (pts[0][1] + pts[5][1]) * 0.5, yTopRef = Math.max(...pts.map((q) => q[1]));
      const dN = zFront - z, dT = z - zRear;
      sub.forEach((q, pi) => {
        let [x, y] = [q[0], q[1]];
        if (dN < opts.noseRadius || dN < opts.roll) [x, y] = roundEnd(x, y, dN, opts.noseRadius, Wfront, yMid, yTopRef);
        if (dT < opts.tailRadius || dT < opts.roll) [x, y] = roundEnd(x, y, dT, opts.tailRadius, Wrear, yMid, yTopRef);
        vertices.push(x, y, z);
        uvs.push(pi / PC, zi / (zList.length - 1));
      });
    });

    const indices: number[] = [];
    for (let k = 0; k < zList.length - 1; k++) {
      const seg = segOfSample[k];
      const cabin = isCabinZone[seg] && isCabinZone[seg + 1];
      const arch = isWheelArchZone[seg] && isWheelArchZone[seg + 1];
      const r0 = k * PC, r1 = (k + 1) * PC;
      for (let q = 0; q < PC; q++) {
        const e = Math.floor(q / edgeSub);
        if (cabin && e === 5) continue;                   // 室内側(上の辺 5→6)は開けておく
        if (!opts.archCircles && arch && (e === 1 || e === 9)) continue;       // ホイールハウスの穴(シル→アーチ)
        const nq = (q + 1) % PC;
        if (opts.archCircles && e <= 2 || opts.archCircles && e >= 8) {
          // 円形のホイールハウスの穴: 三角形の中心が円の中なら省く(穴の縁がなめらかな円弧になる)
          const inHole = (a: number, b: number, c: number): boolean => {
            const cx = (vertices[a * 3] + vertices[b * 3] + vertices[c * 3]) / 3;
            const cy = (vertices[a * 3 + 1] + vertices[b * 3 + 1] + vertices[c * 3 + 1]) / 3;
            const cz = (vertices[a * 3 + 2] + vertices[b * 3 + 2] + vertices[c * 3 + 2]) / 3;
            return opts.archCircles!.some((ac) => Math.abs(cx) > ac.xMin && (cz - ac.z) ** 2 + (cy - ac.y) ** 2 < ac.r * ac.r);
          };
          const t1 = !inHole(r0 + q, r1 + q, r0 + nq), t2 = !inHole(r0 + nq, r1 + q, r1 + nq);
          if (t1) indices.push(r0 + q, r1 + q, r0 + nq);
          if (t2) indices.push(r0 + nq, r1 + q, r1 + nq);
          continue;
        }
        indices.push(r0 + q, r1 + q, r0 + nq);
        indices.push(r0 + nq, r1 + q, r1 + nq);
      }
    }

    // 前後のキャップ面: 輪の頂点を共有して、中心から扇状に張る(側面となめらかにつながる)
    const addCap = (ringIdx: number, front: boolean): void => {
      const base = ringIdx * PC;
      let cy = 0;
      for (let q = 0; q < PC; q++) cy += vertices[(base + q) * 3 + 1];
      cy /= PC;
      const ci = vertices.length / 3;
      vertices.push(0, cy, vertices[base * 3 + 2]);
      uvs.push(0.5, 0.5);
      for (let q = 0; q < PC; q++) {
        const nq = (q + 1) % PC;
        if (front) indices.push(ci, base + q, base + nq);
        else indices.push(ci, base + nq, base + q);
      }
    };
    addCap(0, true);
    addCap(zList.length - 1, false);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, bodyMaterial);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * 角と縁を丸めたバンパー。正面から見た角の丸み(cornerR)、縁の面取り(bevel)、
   * 上から見た左右の端の巻き込み(planR)を付ける。frontSign=+1 なら前面が +z、-1 なら前面が -z。
   */
  public static buildRoundedBumperGeometry(
    width: number, height: number, depth: number, cornerR: number, bevel: number, planR: number, frontSign: 1 | -1,
  ): THREE.BufferGeometry {
    const w = width - 2 * bevel, h = height - 2 * bevel, r = Math.max(0.005, cornerR - bevel);
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 + r, -h / 2);
    shape.lineTo(w / 2 - r, -h / 2); shape.absarc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, false);
    shape.lineTo(w / 2, h / 2 - r); shape.absarc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, false);
    shape.lineTo(-w / 2 + r, h / 2); shape.absarc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, false);
    shape.lineTo(-w / 2, -h / 2 + r); shape.absarc(-w / 2 + r, -h / 2 + r, r, Math.PI, Math.PI * 1.5, false);
    let g: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shape, {
      depth: depth - 2 * bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, steps: 6, curveSegments: 6,
    });
    g.translate(0, 0, -(depth - 2 * bevel) / 2);
    // 上から見た端の巻き込み: 前面に近いほど、左右の端を内側へ引き込む
    const pos = g.getAttribute('position');
    const halfW = width / 2, xc = halfW - planR;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = frontSign === 1 ? depth / 2 - z : z + depth / 2;
      if (d < planR && Math.abs(x) > xc) {
        const gk = Math.sqrt(Math.max(0, 1 - (1 - d / planR) * (1 - d / planR)));
        pos.setX(i, Math.sign(x) * (xc + (Math.abs(x) - xc) * gk));
      }
    }
    // 頂点を溶接して、法線をなめらかにする(面ごとの法線だとカクカクして見える)
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g, 1e-4);
    g.computeVertexNormals();
    if (frontSign === -1) g.rotateY(0);   // 前面の向きは上の d の取り方で決まる(向きの反転は不要)
    return g;
  }

  /**
   * 角を丸めた屋根板。上から見た角の半径 cornerR、中央に向かって盛り上がるキャンバー、縁の丸み(フィレット)付き。
   * 平面は「角丸の長方形」を中心へ向かって縮めた輪の積み重ねで作るので、角の丸みが屋根全体になじむ。
   */
  public static buildRoundedRoof(
    width: number, length: number, thickness: number, camberHeight: number,
    centerZ: number, baseY: number, cornerR: number, material: THREE.Material,
  ): THREE.Mesh {
    const hw0 = width / 2, hl0 = length / 2;
    const cornerSeg = 10, edgeSegX = 14, edgeSegZ = 18;
    // 角丸長方形の輪郭(前から右辺・後・左辺の順)。点の並びは大きさによらず同じなので、輪を作る時に対応する点同士をつなげる
    const outlineFor = (hw: number, hl: number, cr: number): [number, number][] => {
      const out: [number, number][] = [];
      const R = Math.max(cr, 0.001);
      // 角は辺をたどる向き(前→右辺→後→左辺→前)と同じ向きに回る。向きが逆だと角が弦で切り取られて歪む
      const corner = (cx: number, cz: number, a0: number): void => {
        for (let i = 0; i <= cornerSeg; i++) { const a = a0 - (i / cornerSeg) * (Math.PI / 2); out.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
      };
      // 前右の角(前辺→右辺)、右辺(前→後)、後右の角、後辺(右→左)、後左の角、左辺(後→前)、前左の角、前辺(左→右)
      corner(hw - R, hl - R, Math.PI / 2);
      for (let i = 1; i < edgeSegZ; i++) out.push([hw, hl - R - (i / edgeSegZ) * (2 * hl - 2 * R)]);
      corner(hw - R, -hl + R, 0);
      for (let i = 1; i < edgeSegX; i++) out.push([hw - R - (i / edgeSegX) * (2 * hw - 2 * R), -hl]);
      corner(-hw + R, -hl + R, -Math.PI / 2);
      for (let i = 1; i < edgeSegZ; i++) out.push([-hw, -hl + R + (i / edgeSegZ) * (2 * hl - 2 * R)]);
      corner(-hw + R, hl - R, Math.PI);
      for (let i = 1; i < edgeSegX; i++) out.push([-hw + R + (i / edgeSegX) * (2 * hw - 2 * R), hl]);
      return out;
    };
    const outline = outlineFor(hw0, hl0, cornerR);
    const N = outline.length;

    // 縁から内側へ測った距離ごとの輪(縁の近くは細かく)。縦横どちらの縁も同じ距離で丸みが付く
    const dMax = Math.min(hw0, hl0) - 0.04;
    const ds = [0, 0.012, 0.028, 0.05, 0.08, 0.12, 0.17, 0.24, 0.33, 0.43, 0.54, 0.64, 0.71].filter((d) => d < dMax - 0.02);
    ds.push(dMax);
    const L = ds.length;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const topY = (x: number, z: number, d: number): number => {
      const nx = (2 * x) / width, nz = (2 * z) / length;
      const camber = camberHeight * Math.max(0, 1 - nx * nx) * Math.max(0, 1 - 0.25 * nz * nz);
      // 縁の丸み: 縁から7cmかけて屋根面に戻る
      const edge = 0.55 * Math.pow(1 - Math.min(1, d / 0.07), 2);
      return baseY + thickness * (1 - edge) + camber;
    };
    const push = (x: number, y: number, z: number): number => { vertices.push(x, y, centerZ + z); uvs.push(x / width + 0.5, z / length + 0.5); return vertices.length / 3 - 1; };
    // 上面の輪 j=0(縁)〜L-1、最後に中心
    for (let j = 0; j < L; j++) {
      const ring = j === 0 ? outline : outlineFor(hw0 - ds[j], hl0 - ds[j], cornerR - ds[j]);
      for (let i = 0; i < N; i++) { const x = ring[i][0], z = ring[i][1]; push(x, topY(x, z, ds[j]), z); }
    }
    const centerIdx = push(0, topY(0, 0, 1), 0);
    for (let j = 0; j < L - 1; j++) {
      for (let i = 0; i < N; i++) {
        const n = (i + 1) % N, a = j * N + i, b = j * N + n, c = (j + 1) * N + i, d = (j + 1) * N + n;
        indices.push(a, b, c, b, d, c);
      }
    }
    for (let i = 0; i < N; i++) indices.push((L - 1) * N + i, (L - 1) * N + (i + 1) % N, centerIdx);
    // 側面(縁の輪から下の輪へ)と下面
    const sideStart = vertices.length / 3;
    for (let i = 0; i < N; i++) push(outline[i][0], baseY, outline[i][1]);
    for (let i = 0; i < N; i++) { const n = (i + 1) % N; indices.push(i, sideStart + i, n, n, sideStart + i, sideStart + n); }
    const underCenter = push(0, baseY + camberHeight * 0.1, 0);
    for (let i = 0; i < N; i++) { const n = (i + 1) % N; indices.push(sideStart + i, underCenter, sideStart + n); }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Generates a sleek, curved automotive roof panel with gentle crown/camber
   * in both lateral and longitudinal directions, completely eliminating boxy flatness!
   */
  public static buildCurvedRoof(
    width: number,
    length: number,
    thickness: number,
    camberHeight: number,
    centerZ: number,
    baseY: number,
    material: THREE.Material
  ): THREE.Mesh {
    const nx = 16;
    const nz = 20;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const calcY = (x: number, z: number) => {
      const normX = (2 * x) / width;
      const normZ = (2 * (z - centerZ)) / length;
      const curveX = Math.max(0, 1 - normX * normX);
      const curveZ = Math.max(0, 1 - 0.25 * normZ * normZ);
      const camber = camberHeight * curveX * curveZ;
      const yTop = baseY + thickness + camber;
      const yBtm = baseY + camber * 0.4;
      return { yTop, yBtm };
    };

    // 1. Top Grid Vertices
    for (let j = 0; j <= nz; j++) {
      const v = j / nz;
      const z = centerZ - length / 2 + v * length;
      for (let i = 0; i <= nx; i++) {
        const u = i / nx;
        const x = -width / 2 + u * width;
        const { yTop } = calcY(x, z);
        vertices.push(x, yTop, z);
        uvs.push(u, v);
      }
    }

    const rowPts = nx + 1;
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const i0 = j * rowPts + i;
        const i1 = i0 + 1;
        const i2 = (j + 1) * rowPts + i;
        const i3 = i2 + 1;
        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
      }
    }

    // 2. Bottom Grid Vertices
    const btmStartIdx = vertices.length / 3;
    for (let j = 0; j <= nz; j++) {
      const v = j / nz;
      const z = centerZ - length / 2 + v * length;
      for (let i = 0; i <= nx; i++) {
        const u = i / nx;
        const x = -width / 2 + u * width;
        const { yBtm } = calcY(x, z);
        vertices.push(x, yBtm, z);
        uvs.push(u, v);
      }
    }

    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const i0 = btmStartIdx + j * rowPts + i;
        const i1 = i0 + 1;
        const i2 = btmStartIdx + (j + 1) * rowPts + i;
        const i3 = i2 + 1;
        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    // 3. Side Skirts
    // Left edge (i = 0)
    for (let j = 0; j < nz; j++) {
      const top0 = j * rowPts;
      const top1 = (j + 1) * rowPts;
      const btm0 = btmStartIdx + j * rowPts;
      const btm1 = btmStartIdx + (j + 1) * rowPts;
      indices.push(top0, btm0, top1);
      indices.push(top1, btm0, btm1);
    }
    // Right edge (i = nx)
    for (let j = 0; j < nz; j++) {
      const top0 = j * rowPts + nx;
      const top1 = (j + 1) * rowPts + nx;
      const btm0 = btmStartIdx + j * rowPts + nx;
      const btm1 = btmStartIdx + (j + 1) * rowPts + nx;
      indices.push(top0, top1, btm0);
      indices.push(top1, btm1, btm0);
    }
    // Front edge (j = nz, max Z)
    for (let i = 0; i < nx; i++) {
      const top0 = nz * rowPts + i;
      const top1 = top0 + 1;
      const btm0 = btmStartIdx + nz * rowPts + i;
      const btm1 = btm0 + 1;
      indices.push(top0, top1, btm0);
      indices.push(top1, btm1, btm0);
    }
    // Rear edge (j = 0, min Z)
    for (let i = 0; i < nx; i++) {
      const top0 = i;
      const top1 = i + 1;
      const btm0 = btmStartIdx + i;
      const btm1 = btmStartIdx + i + 1;
      indices.push(top0, btm0, top1);
      indices.push(top1, btm0, btm1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    return mesh;
  }

  /**
   * Generates a curved automotive windshield that rounds gently outward in the lateral direction,
   * completely eliminating flat cardboard-like appearance.
   */
  public static buildCurvedWindshield(
    width: number,
    height: number,
    curvatureDepth: number,
    slantAngle: number,
    center: THREE.Vector3,
    material: THREE.Material
  ): THREE.Mesh {
    const nx = 16;
    const ny = 8;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    for (let j = 0; j <= ny; j++) {
      const v = j / ny;
      const localY = (v - 0.5) * height;
      for (let i = 0; i <= nx; i++) {
        const u = i / nx;
        const localX = (u - 0.5) * width;
        const normX = (2 * localX) / width;
        // Lateral cylindrical crown forward
        const localZ = curvatureDepth * Math.max(0, 1 - normX * normX);

        vertices.push(localX, localY, localZ);
        uvs.push(u, v);
      }
    }

    const rowPts = nx + 1;
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const i0 = j * rowPts + i;
        const i1 = i0 + 1;
        const i2 = (j + 1) * rowPts + i;
        const i3 = i2 + 1;
        indices.push(i0, i1, i2);
        indices.push(i1, i3, i2);
        // Double-sided rendering so inside reflections work
        indices.push(i0, i2, i1);
        indices.push(i1, i2, i3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    geo.rotateX(slantAngle);

    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(center);
    return mesh;
  }

  /**
   * Generates a sleek rounded corner automotive window pane.
   */
  public static buildRoundedWindow(
    width: number,
    height: number,
    cornerRadius: number,
    material: THREE.Material
  ): THREE.Mesh {
    const shape = new THREE.Shape();
    const w = width / 2;
    const h = height / 2;
    const r = Math.min(cornerRadius, w * 0.35, h * 0.35);

    shape.moveTo(-w + r, -h);
    shape.lineTo(w - r, -h);
    shape.quadraticCurveTo(w, -h, w, -h + r);
    shape.lineTo(w, h - r);
    shape.quadraticCurveTo(w, h, w - r, h);
    shape.lineTo(-w + r, h);
    shape.quadraticCurveTo(-w, h, -w, h - r);
    shape.lineTo(-w, -h + r);
    shape.quadraticCurveTo(-w, -h, -w + r, -h);

    const geo = new THREE.ShapeGeometry(shape, 12);
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = false;
    return mesh;
  }

  /**
   * Builds an automotive structural pillar with smooth rounded corners,
   * eliminating sharp 90-degree boxy edges.
   */
  /**
   * 柱の上端を屋根へなだらかに広げる「ラッパ」(柱と屋根の境目をぼかす用)。
   * bottom→top の軸に沿って、半径が rBottom から rTop へ(根元ほどゆるやかに)広がる。
   */
  public static buildFlare(
    bottom: THREE.Vector3, top: THREE.Vector3, rBottom: number, rTop: number, material: THREE.Material,
  ): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(top, bottom);
    const len = dir.length();
    const pts: THREE.Vector2[] = [];
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector2(rBottom + (rTop - rBottom) * t * t * t, t * len));
    }
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), material);
    mesh.position.copy(bottom);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }

  /** 点列をなめらかにつなぐ丸い管(ピラーとヘッダーをひと続きにして、フレームに膨らみを持たせる用)。 */
  public static buildTubeFrame(points: THREE.Vector3[], radius: number, material: THREE.Material, segments = 96): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 14, false), material);
    mesh.castShadow = true;
    return mesh;
  }

  public static buildSmoothPillar(
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    thickness: number,
    cornerRadius: number,
    material: THREE.Material
  ): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const shape = new THREE.Shape();
    const w = width / 2;
    const t = thickness / 2;
    const r = Math.min(cornerRadius, w * 0.45, t * 0.45);

    shape.moveTo(-w + r, -t);
    shape.lineTo(w - r, -t);
    shape.quadraticCurveTo(w, -t, w, -t + r);
    shape.lineTo(w, t - r);
    shape.quadraticCurveTo(w, t, w - r, t);
    shape.lineTo(-w + r, t);
    shape.quadraticCurveTo(-w, t, -w, t - r);
    shape.lineTo(-w, -t + r);
    shape.quadraticCurveTo(-w, -t, -w + r, -t);

    const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
      depth: len,
      bevelEnabled: false,
    });
    extrudeGeo.translate(0, 0, -len / 2);

    const mesh = new THREE.Mesh(extrudeGeo, material);
    mesh.position.copy(center);

    const up = new THREE.Vector3(0, 0, 1);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    mesh.setRotationFromQuaternion(quaternion);
    mesh.castShadow = true;

    return mesh;
  }
}
