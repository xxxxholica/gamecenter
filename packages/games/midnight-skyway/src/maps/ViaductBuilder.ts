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
  /** Closed loop (default) or an open stretch such as a branch. */
  closed?: boolean;
  /** Stretches (per sample) where the parapet on one side is left out: where another road forks off or joins. */
  parapetGaps?: { left: boolean[]; right: boolean[] };
  /** Branch decks: cut the asphalt where it lies on the road it forks from / joins, so only the widening sliver remains. */
  trimAgainst?: { road: THREE.Vector3[]; halfWidth: number };
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
  const closed = opts.closed ?? true;
  const at = (i: number): THREE.Vector3 => (closed ? road[(i + n) % n] : road[Math.min(n - 1, Math.max(0, i))]);
  const half = opts.roadWidth / 2;

  // frames along the route: heading + lateral normal
  const nx = new Float32Array(n), nz = new Float32Array(n), yaw = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i + 1);
    const tx = b.x - a.x, tz = b.z - a.z, len = Math.hypot(tx, tz) || 1;
    nx[i] = -tz / len; nz[i] = tx / len; yaw[i] = Math.atan2(tx, tz);
  }

  /** Sweeps every cross-section segment along the closed route; each segment gets its own vertices (hard edges). */
  const sweep = (segments: Segment[], withUv = false, hscale?: (i: number, seg: number) => number): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    let arc = 0;
    const arcs: number[] = [0];
    const cnt = closed ? n + 1 : n;
    for (let i = 1; i < cnt; i++) { const a = road[i - 1], b = road[i % n]; arc += Math.hypot(b.x - a.x, b.z - a.z); arcs.push(arc); }
    segments.forEach(([[l0, h0], [l1, h1]], segIdx) => {
      const base = pos.length / 3;
      for (let i = 0; i < cnt; i++) { // closed: the last vertex row repeats the first frame to close the loop (with its own uv)
        const k = i % n, r = road[k];
        const f = hscale ? hscale(k, segIdx) : 1;
        pos.push(r.x + nx[k] * l0, r.y + h0 * f, r.z + nz[k] * l0, r.x + nx[k] * l1, r.y + h1 * f, r.z + nz[k] * l1);
        if (withUv) { const v = arcs[i] / opts.textureRepeat; uv.push(0, v, 1, v); }
        if (i < cnt - 1 && !(hscale && hscale(i % n, segIdx) === 0 && hscale((i + 1) % n, segIdx) === 0)) { const q = base + i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
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
  // Lateral extent per frame: the full deck, except on a branch where it lies on the road it forks from / joins:
  // there only the sliver outside the other deck is drawn, so the two roads read as one widening carriageway.
  const latL = new Float32Array(n).fill(-half), latR = new Float32Array(n).fill(half);
  if (opts.trimAgainst) {
    const mr = opts.trimAgainst.road, mh = opts.trimAgainst.halfWidth, M = mr.length;
    // main deck edge polylines (left / right of its travel direction) near a point
    const mnx = new Float32Array(M), mnz = new Float32Array(M);
    for (let j = 0; j < M; j++) { const a = mr[(j - 1 + M) % M], b = mr[(j + 1) % M], tl = Math.hypot(b.x - a.x, b.z - a.z) || 1; mnx[j] = -(b.z - a.z) / tl; mnz[j] = (b.x - a.x) / tl; }
    for (let k = 0; k < n; k++) {
      const P = road[k];
      let bi = 0, bd = Infinity;
      for (let j = 0; j < M; j++) { const d = (mr[j].x - P.x) ** 2 + (mr[j].z - P.z) ** 2; if (d < bd) { bd = d; bi = j; } }
      const dM = (P.x - mr[bi].x) * mnx[bi] + (P.z - mr[bi].z) * mnz[bi];   // + : this deck is on the main deck's right
      if (Math.abs(dM) > 2 * half + 4) continue;                              // far away: nothing to trim
      // Cast a ray from this deck's centre across (towards the main deck) and find where it meets the main deck's near edge.
      const dir = dM < 0 ? 1 : -1, sgn = dM < 0 ? -1 : 1;                     // main is on our right (dir +1) or left; its edge facing us
      const rx = nx[k] * dir, rz = nz[k] * dir;
      let hit = NaN, best = Infinity;
      for (let j = bi - 40; j < bi + 40; j++) {
        const j0 = ((j % M) + M) % M, j1 = (j0 + 1) % M;
        const ax = mr[j0].x + mnx[j0] * mh * sgn, az = mr[j0].z + mnz[j0] * mh * sgn, bx = mr[j1].x + mnx[j1] * mh * sgn, bz = mr[j1].z + mnz[j1] * mh * sgn;
        const ex = bx - ax, ez = bz - az, den = rx * ez - rz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((ax - P.x) * ez - (az - P.z) * ex) / den, u = ((ax - P.x) * rz - (az - P.z) * rx) / den;
        if (u < 0 || u > 1) continue;
        const guess = Math.abs(dM) - mh;
        if (Math.abs(t - guess) < best) { best = Math.abs(t - guess); hit = t; }
      }
      if (Number.isNaN(hit)) continue;
      const lap = 0.75;                                                          // slightly over the main deck's edge: hides its edge line
      if (dM < 0) latR[k] = Math.min(half, Math.max(-half, hit + lap)); else latL[k] = Math.max(-half, Math.min(half, -(hit + lap)));
    }
  }
  const surfGeo = ((): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const cnt = closed ? n + 1 : n;
    let arc = 0;
    for (let i = 0; i < cnt; i++) {
      const k = i % n, r = road[k];
      if (i > 0) arc += Math.hypot(road[k].x - road[(i - 1) % n].x, road[k].z - road[(i - 1) % n].z);
      const yy = r.y + (opts.trimAgainst ? 0.036 : 0.03);
      pos.push(r.x + nx[k] * latL[k], yy, r.z + nz[k] * latL[k], r.x + nx[k] * latR[k], yy, r.z + nz[k] * latR[k]);
      const v = arc / opts.textureRepeat;
      uv.push((latL[k] + half) / (2 * half), v, (latR[k] + half) / (2 * half), v);
      const k2 = (i + 1) % n;
      if (i < cnt - 1 && (latR[k] - latL[k] > 0.02 || latR[k2] - latL[k2] > 0.02)) { const q = i * 2; idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3); }
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
    new THREE.MeshStandardMaterial({ map: makeHighwayTexture(opts.roadWidth, opts.textureRepeat), roughness: 0.88, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: opts.trimAgainst ? -4 : -2, polygonOffsetUnits: opts.trimAgainst ? -4 : -2 })
  );
  surface.receiveShadow = true;
  // box girder: outer walls, underside and the deck edge
  const D = opts.girderDepth;
  const girder = new THREE.Mesh(
    sweep([[[-gw, 0], [-gw, -D]], [[-gw, -D], [-gw + 1.4, -D - 0.5]], [[-gw + 1.4, -D - 0.5], [gw - 1.4, -D - 0.5]], [[gw - 1.4, -D - 0.5], [gw, -D]], [[gw, -D], [gw, 0]], [[-gw, 0], [-half, 0]], [[half, 0], [gw, 0]]], false,
      // where another deck lies against this one the flat girder shoulder on that side goes too (it would show as a frame)
      (i, seg) => (seg === 5 ? (opts.parapetGaps?.left[i] ? 0 : 1) : seg === 6 ? (opts.parapetGaps?.right[i] ? 0 : 1) : 1)),
    new THREE.MeshStandardMaterial({ color: 0x8a8c8f, roughness: 0.95, side: THREE.DoubleSide })
  );
  girder.castShadow = true;
  girder.receiveShadow = true;
  // parapets on both sides; at a gap they stop at the nose of the gore with an end post
  const ramp = (gap: boolean[] | undefined): Float32Array => {
    // no taper: the barrier runs right up to the nose where the decks meet and stops there with an end post
    const f = new Float32Array(n).fill(1);
    if (gap) for (let i = 0; i < n; i++) if (gap[i]) f[i] = 0;
    return f;
  };
  const fLeft = ramp(opts.parapetGaps?.left), fRight = ramp(opts.parapetGaps?.right);
  // Outer barrier: a low concrete kerb, an acrylic panel above it and a slim top rail (the city stays visible through it).
  const P = opts.parapetHeight, t = 0.45, C = 0.35, pl = half + 0.22, rl = 0.07;
  const both = (per: (l: number, sgn: number) => Segment[]): Segment[] => [...per(-1, -1), ...per(1, 1)];
  const sideOf = (perSide: number) => (i: number, seg: number): number => (seg < perSide ? fLeft : fRight)[i];
  const kerb = new THREE.Mesh(
    sweep(both((_, g) => [[[g * half, 0], [g * half, C]], [[g * half, C], [g * (half + t), C]], [[g * (half + t), C], [g * (half + t), 0]]]), false, sideOf(3)),
    new THREE.MeshStandardMaterial({ color: 0xb7b9bc, roughness: 0.9, side: THREE.DoubleSide })
  );
  const panel = new THREE.Mesh(
    sweep(both((_, g) => [[[g * pl, C], [g * pl, P]]]), false, sideOf(1)),
    new THREE.MeshStandardMaterial({ color: 0xbfe3f5, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false })
  );
  const rail = new THREE.Mesh(
    sweep(both((_, g) => [[[g * (pl - rl), P - 0.1], [g * (pl - rl), P]], [[g * (pl - rl), P], [g * (pl + rl), P]], [[g * (pl + rl), P], [g * (pl + rl), P - 0.1]]]), false, sideOf(3)),
    new THREE.MeshStandardMaterial({ color: 0x9da1a6, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide })
  );
  panel.renderOrder = 2;
  kerb.castShadow = true; kerb.receiveShadow = true;
  panel.receiveShadow = true; // glass shadow-casting reads as an opaque dark stripe, so it only receives
  rail.castShadow = true; rail.receiveShadow = true;
  const parapets = new THREE.Group();
  parapets.add(kerb, panel, rail);
  // end posts where a barrier stops at a gap (nose of the gore)
  const posts: THREE.Matrix4[] = [];
  for (const [gap, sgn] of [[opts.parapetGaps?.left, -1], [opts.parapetGaps?.right, 1]] as const) {
    if (!gap) continue;
    for (let i = 0; i < n; i++) {
      const prev = closed ? gap[(i - 1 + n) % n] : (i > 0 ? gap[i - 1] : false), next = closed ? gap[(i + 1) % n] : (i < n - 1 ? gap[i + 1] : false);
      const edgeIdx = !gap[i] && next ? i : !gap[i] && prev ? i : -1;                // last barrier sample next to the gap
      if (edgeIdx < 0) continue;
      const r = road[i], l = sgn * (half + 0.22);
      posts.push(new THREE.Matrix4().compose(new THREE.Vector3(r.x + nx[i] * l, r.y + P / 2, r.z + nz[i] * l), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw[i]), new THREE.Vector3(0.7, P, 0.7)));
    }
  }
  if (posts.length) {
    const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xb7b9bc, roughness: 0.9 }), posts.length);
    posts.forEach((mtx, k) => inst.setMatrixAt(k, mtx));
    inst.instanceMatrix.needsUpdate = true; inst.frustumCulled = false;
    inst.castShadow = true; inst.receiveShadow = true;
    parapets.add(inst);
  }
  group.add(surface, girder, parapets);

  // pillars + cap beams every `pillarSpacing` metres
  const spots: number[] = [];
  let acc = opts.pillarSpacing / 2;
  for (let i = 1; i < n; i++) {
    acc += Math.hypot(road[i].x - road[i - 1].x, road[i].z - road[i - 1].z);
    if (acc >= opts.pillarSpacing) { if (closed || (i > 15 && i < n - 15)) spots.push(i); acc = 0; }
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
  columns.castShadow = true; columns.receiveShadow = true;
  caps.castShadow = true; caps.receiveShadow = true;
  group.add(columns, caps);
  for (const m of [surface, girder, kerb, panel, rail]) m.frustumCulled = false;
  return group;
}
