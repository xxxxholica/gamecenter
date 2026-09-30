import * as THREE from 'three';

/**
 * "Clear tube" around an elevated road (runtime twin of scripts/lib_road_tube.mjs): city triangles that sit inside / on / over
 * the deck are dropped when a chunk is loaded, so nothing pokes through the road, stands on it or hangs over it.
 * Done at load time (not baked) so courses sharing the same chunks are not affected by each other's tube.
 *   radius  horizontal distance from the centre line (deck half width + parapet + girder overhang + margin)
 *   below   how far below the deck surface the tube starts (roofs right under the girder stay)
 *   above   how far above the deck surface it reaches
 */
export class RoadTube {
  private static readonly GRID = 8;
  private readonly grid = new Map<number, number[]>();
  private readonly reach: number;
  private readonly nearCells = new Set<number>();
  private readonly bbox = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };

  constructor(private readonly road: THREE.Vector3[], private readonly radius = 6.5, private readonly below = 2.6, private readonly above = 40) {
    const G = RoadTube.GRID;
    road.forEach((r, i) => {
      const k = Math.floor(r.x / G) * 100000 + Math.floor(r.z / G);
      const list = this.grid.get(k);
      if (list) list.push(i); else this.grid.set(k, [i]);
      this.bbox.minX = Math.min(this.bbox.minX, r.x); this.bbox.maxX = Math.max(this.bbox.maxX, r.x);
      this.bbox.minZ = Math.min(this.bbox.minZ, r.z); this.bbox.maxZ = Math.max(this.bbox.maxZ, r.z);
    });
    this.reach = Math.ceil(radius / G);
    // cells within the tube's reach of the road (plus one): a triangle covering none of them cannot touch the tube
    road.forEach((r) => {
      const cx = Math.floor(r.x / G), cz = Math.floor(r.z / G);
      for (let a = -this.reach - 1; a <= this.reach + 1; a++) for (let b = -this.reach - 1; b <= this.reach + 1; b++) this.nearCells.add((cx + a) * 100000 + (cz + b));
    });
  }

  private inside(x: number, y: number, z: number): boolean {
    const G = RoadTube.GRID, cx = Math.floor(x / G), cz = Math.floor(z / G);
    for (let ix = cx - this.reach; ix <= cx + this.reach; ix++) {
      for (let iz = cz - this.reach; iz <= cz + this.reach; iz++) {
        const list = this.grid.get(ix * 100000 + iz);
        if (!list) continue;
        for (const i of list) {
          const r = this.road[i];
          if (y > r.y - this.below && y < r.y + this.above && Math.hypot(r.x - x, r.z - z) < this.radius) return true;
        }
      }
    }
    return false;
  }

  /**
   * A big triangle (a tower's wall) can cut through the tube with every vertex and its centroid outside it: sample its surface.
   * The step is small enough that any part of the triangle inside the tube's radius is within reach of a sample.
   */
  private insideSurface(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): boolean {
    const e1 = a.distanceTo(b), e2 = a.distanceTo(c), e3 = b.distanceTo(c);
    if (Math.max(e1, e2, e3) < 3) return false;                   // small: the vertices and centroid say enough
    const STEP = 1.3, nu = Math.min(40, Math.max(2, Math.ceil(e1 / STEP))), nv = Math.min(40, Math.max(2, Math.ceil(e2 / STEP)));   // 1.3 m: no part of the triangle is more than ~0.9 m from a sample
    for (let i = 0; i <= nu; i++) {
      for (let j = 0; j <= nv - (i * nv) / nu; j++) {
        const u = i / nu, w = j / nv;
        if (u + w > 1.0001) continue;
        if (this.inside(a.x + (b.x - a.x) * u + (c.x - a.x) * w, a.y + (b.y - a.y) * u + (c.y - a.y) * w, a.z + (b.z - a.z) * u + (c.z - a.z) * w)) return true;
      }
    }
    return false;
  }

  /** Removes the triangles of every mesh under `root` that touch the tube (any vertex or the centroid inside, or the surface of a big one). */
  public carve(root: THREE.Object3D): void {
    root.updateMatrixWorld(true);
    const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const geo = o.geometry as THREE.BufferGeometry, pos = geo.getAttribute('position');
      if (!pos) return;
      // skip meshes whose bounds are away from the road
      geo.computeBoundingBox();
      const bb = geo.boundingBox!.clone().applyMatrix4(o.matrixWorld), m = this.radius;
      if (bb.max.x < this.bbox.minX - m || bb.min.x > this.bbox.maxX + m || bb.max.z < this.bbox.minZ - m || bb.min.z > this.bbox.maxZ + m) return;
      const index = geo.getIndex(), count = index ? index.count : pos.count;
      const at = (t: number): number => (index ? index.getX(t) : t);
      const keep: number[] = [];
      const G = RoadTube.GRID;
      for (let t = 0; t + 2 < count; t += 3) {
        for (let k = 0; k < 3; k++) v[k].fromBufferAttribute(pos, at(t + k)).applyMatrix4(o.matrixWorld);
        // most triangles are nowhere near the road: one look at the cells their bounding box covers settles them
        const minX = Math.min(v[0].x, v[1].x, v[2].x), maxX = Math.max(v[0].x, v[1].x, v[2].x);
        const minZ = Math.min(v[0].z, v[1].z, v[2].z), maxZ = Math.max(v[0].z, v[1].z, v[2].z);
        let close = false;
        for (let cx = Math.floor(minX / G); cx <= Math.floor(maxX / G) && !close; cx++) {
          for (let cz = Math.floor(minZ / G); cz <= Math.floor(maxZ / G); cz++) if (this.nearCells.has(cx * 100000 + cz)) { close = true; break; }
        }
        if (!close) { keep.push(at(t), at(t + 1), at(t + 2)); continue; }
        const hit = this.inside(v[0].x, v[0].y, v[0].z) || this.inside(v[1].x, v[1].y, v[1].z) || this.inside(v[2].x, v[2].y, v[2].z)
          || this.inside((v[0].x + v[1].x + v[2].x) / 3, (v[0].y + v[1].y + v[2].y) / 3, (v[0].z + v[1].z + v[2].z) / 3)
          || this.insideSurface(v[0], v[1], v[2]);
        if (!hit) keep.push(at(t), at(t + 1), at(t + 2));
      }
      if (keep.length === count) return;
      geo.setIndex(keep);
    });
  }
}
