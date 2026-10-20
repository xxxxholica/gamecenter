import * as THREE from 'three';
import { mulberry32 } from '../../../../shared/online/seededRandom';

export interface ViaductOptions {
  /** Drivable surface width between the parapets (metres). */
  roadWidth: number;
  /** Girder (box beam) depth below the surface. */
  girderDepth: number;
  /** Parapet height above the surface. */
  parapetHeight: number;
  /** Distance between pillars along the route. */
  pillarSpacing: number;
  /** Repeat length of the road texture along the route. */
  textureRepeat: number;
}

/** [lateral, height] pairs describing a straight cross-section segment. */
type Segment = [[number, number], [number, number]];

/** Highway asphalt: solid edge lines and ONE dashed centre line (two lanes). */
export function makeHighwayTexture(roadWidth: number, repeatMetres: number): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#4b4c50';
  g.fillRect(0, 0, W, H);
  const img = g.getImageData(0, 0, W, H);
  const rand = mulberry32(101);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  const pxPerM = W / roadWidth;
  // wheel-track wear in each lane
  for (const f of [1 / 4, 3 / 4]) {
    const cx = W * f, grad = g.createLinearGradient(cx - 60, 0, cx + 60, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.5, 'rgba(15,15,18,0.28)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(cx - 60, 0, 120, H);
  }
  g.fillStyle = 'rgba(238,238,232,0.95)';
  const lw = 0.18 * pxPerM;
  g.fillRect(0.35 * pxPerM, 0, lw, H);                 // left edge line
  g.fillRect(W - 0.35 * pxPerM - lw, 0, lw, H);        // right edge line
  const pxPerMAlong = H / repeatMetres;
  const dash = 4 * pxPerMAlong;                        // 4 m dash, 4 m gap (repeat 16 m -> 2 dashes)
  for (let y = 0; y < H; y += dash * 2) g.fillRect(W / 2 - lw / 2, y, lw, dash);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Elevated expressway along a closed route: asphalt, box girder, parapets and pillars down to the ground.
 * `road` holds the surface samples [x, surfaceY, z] (~2 m apart), `ground` the ground height below each sample.
 */
export function buildViaduct(road: THREE.Vector3[], ground: number[], opts: ViaductOptions): THREE.Group {
  const n = road.length;
  const at = (i: number): THREE.Vector3 => road[(i + n) % n];
  const half = opts.roadWidth / 2;

  // frames along the route: heading + lateral normal
  const nx = new Float32Array(n), nz = new Float32Array(n), yaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i + 1);
    const tx = b.x - a.x, tz = b.z - a.z, len = Math.hypot(tx, tz) || 1;
    nx[i] = -tz / len; nz[i] = tx / len; yaw[i] = Math.atan2(tx, tz);
  }

  /** Sweeps every cross-section segment along the closed route; each segment gets its own vertices (hard edges). */
  const sweep = (segments: Segment[], withUv = false): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let arc = 0;
    const arcs: number[] = [0];
    const cnt = n + 1;
    for (let i = 1; i < cnt; i++) { const a = road[i - 1], b = road[i % n]; arc += Math.hypot(b.x - a.x, b.z - a.z); arcs.push(arc); }
    segments.forEach(([[l0, h0], [l1, h1]]) => {
      const base = pos.length / 3;
      for (let i = 0; i < cnt; i++) { // the last vertex row repeats the first frame to close the loop (with its own uv)
        const k = i % n, r = road[k];
        pos.push(r.x + nx[k] * l0, r.y + h0, r.z + nz[k] * l0, r.x + nx[k] * l1, r.y + h1, r.z + nz[k] * l1);
        if (withUv) { const v = arcs[i] / opts.textureRepeat; uv.push(0, v, 1, v); }
        if (i < cnt - 1) { const q = base + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const group = new THREE.Group();
  group.name = 'viaduct';
  const gw = half + 0.9; // girder half width (sticks out beyond the parapets)

  // asphalt surface (lit: receives cast shadows from the car, traffic and buildings)
  const surfGeo = ((): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const cnt = n + 1;
    let arc = 0;
    for (let i = 0; i < cnt; i++) {
      const k = i % n, r = road[k];
      if (i > 0) arc += Math.hypot(road[k].x - road[(i - 1) % n].x, road[k].z - road[(i - 1) % n].z);
      const yy = r.y + 0.03;
      pos.push(r.x - nx[k] * half, yy, r.z - nz[k] * half, r.x + nx[k] * half, yy, r.z + nz[k] * half);
      const v = arc / opts.textureRepeat;
      uv.push(0, v, 1, v);
      if (i < cnt - 1) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  })();
  const surface = new THREE.Mesh(
    surfGeo,
    new THREE.MeshStandardMaterial({ map: makeHighwayTexture(opts.roadWidth, opts.textureRepeat), roughness: 0.88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
  );
  surface.receiveShadow = true;
  // box girder: outer walls, underside and the deck edge
  const D = opts.girderDepth;
  const girder = new THREE.Mesh(
    sweep([[[-gw, 0], [-gw, -D]], [[-gw, -D], [-gw + 1.4, -D - 0.5]], [[-gw + 1.4, -D - 0.5], [gw - 1.4, -D - 0.5]], [[gw - 1.4, -D - 0.5], [gw, -D]], [[gw, -D], [gw, 0]], [[-gw, 0], [-half, 0]], [[half, 0], [gw, 0]]]),
    new THREE.MeshStandardMaterial({ color: 0x8a8c8f, roughness: 0.95, side: THREE.DoubleSide })
  );
  girder.receiveShadow = true;
  // parapets on both sides. Outer barrier: a low concrete kerb, an acrylic panel above it and a slim top rail (the city stays visible through it).
  const P = opts.parapetHeight, t = 0.45, C = 0.35, pl = half + 0.22, rl = 0.07;
  const both = (per: (l: number, sgn: number) => Segment[]): Segment[] => [...per(-1, -1), ...per(1, 1)];
  const kerb = new THREE.Mesh(
    sweep(both((_, g) => [[[g * half, 0], [g * half, C]], [[g * half, C], [g * (half + t), C]], [[g * (half + t), C], [g * (half + t), 0]]])),
    new THREE.MeshStandardMaterial({ color: 0xb7b9bc, roughness: 0.9, side: THREE.DoubleSide })
  );
  const panel = new THREE.Mesh(
    sweep(both((_, g) => [[[g * pl, C], [g * pl, P]]])),
    new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  const rail = new THREE.Mesh(
    sweep(both((_, g) => [[[g * (pl - rl), P - 0.1], [g * (pl - rl), P]], [[g * (pl - rl), P], [g * (pl + rl), P]], [[g * (pl + rl), P], [g * (pl + rl), P - 0.1]]])),
    new THREE.MeshStandardMaterial({ color: 0x9da1a6, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  );
  panel.renderOrder = 2;
  kerb.receiveShadow = true;
  panel.receiveShadow = true; // glass shadow-casting reads as an opaque dark stripe, so it only receives
  rail.receiveShadow = true;
  const parapets = new THREE.Group();
  parapets.add(kerb, panel, rail);
  group.add(surface, girder, parapets);

  // pillars + cap beams every `pillarSpacing` metres
  const spots: number[] = [];
  let acc = opts.pillarSpacing / 2;
  for (let i = 1; i < n; i++) {
    acc += Math.hypot(road[i].x - road[i - 1].x, road[i].z - road[i - 1].z);
    if (acc >= opts.pillarSpacing) { spots.push(i); acc = 0; }
  }
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x8f9194, roughness: 0.95 });
  const columns = new THREE.InstancedMesh(boxGeo, concrete, spots.length);
  const caps = new THREE.InstancedMesh(boxGeo, concrete, spots.length);
  const o = new THREE.Object3D();
  const capH = 1.4;
  spots.forEach((i, k) => {
    const r = road[i];
    if (ground[i] >= r.y - 1) {   // the deck bridges over something (another stretch of the road): no pillar here
      o.scale.set(0, 0, 0); o.updateMatrix();
      columns.setMatrixAt(k, o.matrix); caps.setMatrixAt(k, o.matrix);
      return;
    }
    const beamTop = r.y - D - 0.5;
    const colTop = beamTop - capH;
    const colBottom = ground[i] - 3; // sink a little into the ground
    o.position.set(r.x, (colTop + colBottom) / 2, r.z);
    o.rotation.set(0, yaw[i], 0);
    o.scale.set(2.4, colTop - colBottom, 2.4);
    o.updateMatrix(); columns.setMatrixAt(k, o.matrix);
    o.position.set(r.x, beamTop - capH / 2, r.z);
    o.scale.set(opts.roadWidth + 2.6, capH, 2.8);
    o.updateMatrix(); caps.setMatrixAt(k, o.matrix);
  });
  columns.instanceMatrix.needsUpdate = true; caps.instanceMatrix.needsUpdate = true;
  columns.frustumCulled = false; caps.frustumCulled = false;
  columns.receiveShadow = true;
  caps.receiveShadow = true;
  group.add(columns, caps);
  for (const m of [surface, girder, kerb, panel, rail]) m.frustumCulled = false;
  return group;
}
