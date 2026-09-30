import * as THREE from 'three';

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
   * Builds an individual structural pillar (A-Pillar, B-Pillar, C-Pillar) connecting waistline to roof.
   */
  public static buildPillar(
    start: THREE.Vector3,
    end: THREE.Vector3,
    width: number,
    thickness: number,
    material: THREE.Material
  ): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

    const geo = new THREE.BoxGeometry(width, len, thickness);
    // Align geometry with direction vector
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.copy(center);

    // Orientation
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
    mesh.setRotationFromQuaternion(quaternion);
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
    material: THREE.Material
  ): THREE.Group {
    const group = new THREE.Group();

    // 1. Front Cowl Top Crossmember (Windshield base & hood trailing edge)
    const cowlGeo = new THREE.BoxGeometry(halfWidth * 2 - 0.04, 0.08, 0.12);
    const cowlMesh = new THREE.Mesh(cowlGeo, material);
    cowlMesh.position.set(0, beltlineY, frontCowlZ);
    cowlMesh.castShadow = true;
    group.add(cowlMesh);

    // 2. Left & Right Waistline Side Sills (Door shoulder rails connecting A to D pillars)
    const railLength = Math.abs(frontCowlZ - rearTailgateZ) + 0.04;
    const railCenterZ = (frontCowlZ + rearTailgateZ) * 0.5;
    const sideRailGeo = new THREE.BoxGeometry(0.08, 0.08, railLength);

    [-1, 1].forEach((side) => {
      const sideRail = new THREE.Mesh(sideRailGeo, material);
      sideRail.position.set(side * (halfWidth - 0.02), beltlineY, railCenterZ);
      sideRail.castShadow = true;
      group.add(sideRail);
    });

    // 3. Rear Hatch Lower Waist Rail (Windshield base on tailgate)
    const rearRailGeo = new THREE.BoxGeometry(halfWidth * 2 - 0.06, 0.08, 0.10);
    const rearRail = new THREE.Mesh(rearRailGeo, material);
    rearRail.position.set(0, beltlineY, rearTailgateZ);
    rearRail.castShadow = true;
    group.add(rearRail);

    return group;
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
