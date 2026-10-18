import * as THREE from 'three';
import roadNetwork from './helsinki_roads.json';
import { glowTexture } from './StreetLights';
import { mulberry32 } from '../../../../shared/online/seededRandom';

/** The asphalt texture is designed for an 8 m wide road and stretched across other widths. */
const TEXTURE_ROAD_WIDTH = 8.0;
/** Lift of the drawn roads above the baked ground heights. */
export const ROAD_LIFT = 0.16;
/** The hole-covering underlay reaches this far beyond the drawn road edge on each side. */
const UNDERLAY_MARGIN = 2.5;
const TEXTURE_REPEAT_METRES = 12;

/** Chaikin corner cutting on an open polyline; the two end points stay where they are. */
function smoothOpen(pts: THREE.Vector3[], passes: number): THREE.Vector3[] {
  let cur = pts;
  for (let k = 0; k < passes && cur.length > 2; k++) {
    const next: THREE.Vector3[] = [cur[0].clone()];
    for (let i = 0; i < cur.length - 1; i++) {
      const a = cur[i], b = cur[i + 1];
      next.push(a.clone().lerp(b, 0.25), a.clone().lerp(b, 0.75));
    }
    next.push(cur[cur.length - 1].clone());
    cur = next;
  }
  return cur;
}

function makeAsphaltTexture(markings: boolean): THREE.CanvasTexture {
  // 512 px across TEXTURE_ROAD_WIDTH metres, 1024 px along TEXTURE_REPEAT_METRES metres
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#48494d';
  g.fillRect(0, 0, W, H);
  // wheel-track wear (darker bands) and grain
  for (const cx of [W * 0.28, W * 0.72]) {
    const grad = g.createLinearGradient(cx - 50, 0, cx + 50, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(20,20,22,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(cx - 50, 0, 100, H);
  }
  const img = g.getImageData(0, 0, W, H);
  const rand = mulberry32(102);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 26;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (markings) {
    // solid edge lines and a dashed centre line
    const mPerPx = TEXTURE_ROAD_WIDTH / W;
    g.fillStyle = 'rgba(235,235,230,0.92)';
    const lw = 0.15 / mPerPx;
    g.fillRect(0.3 / mPerPx, 0, lw, H);
    g.fillRect(W - 0.3 / mPerPx - lw, 0, lw, H);
    const dash = (TEXTURE_REPEAT_METRES / 4) * (H / TEXTURE_REPEAT_METRES); // 3 m dash, 3 m gap
    for (let y = 0; y < H; y += dash * 2) g.fillRect(W / 2 - lw / 2, y, lw, dash);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  return tex;
}

/**
 * Night glow of the city's street lamps: a soft warm point every ~26 m along the streets (the wider ones on both sides), a few
 * metres above the road. One Points object; the caller shows it at night only.
 */
export function buildStreetGlow(): THREE.Points {
  type Way = { w: number; r: number; pts: number[][] };
  const ways = (roadNetwork as { ways: Way[] }).ways;
  const SPACING = 26;
  const out: number[] = [];
  for (const way of ways) {
    if (way.w < 4) continue;                                   // alleys stay dark
    let next = SPACING * 0.5, side = 1;                        // distance from the current segment's start to the next lamp
    for (let i = 1; i < way.pts.length; i++) {
      const a = way.pts[i - 1], b = way.pts[i];
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      if (len < 0.01) continue;
      const nx = -(b[2] - a[2]) / len, nz = (b[0] - a[0]) / len;
      let d = next;
      while (d < len) {
        const t = d / len, off = (way.w / 2 + 0.6) * side;
        out.push(a[0] + (b[0] - a[0]) * t + nx * off, a[1] + (b[1] - a[1]) * t + 6.5, a[2] + (b[2] - a[2]) * t + nz * off);
        side = -side;                                          // alternate sides
        d += SPACING;
      }
      next = d - len;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const glow = new THREE.Points(geo, new THREE.PointsMaterial({
    map: glowTexture(), size: 11, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xffc27a,
  }));
  glow.frustumCulled = false;
  glow.visible = false;
  return glow;
}

/**
 * Clean, drawn roads on top of the baked ground heights: every street of the OSM network inside the mesh area
 * (not just the driven route). Wide roads get lane markings; alleys are plain asphalt. Wider roads are stacked
 * slightly higher so their markings win at junctions.
 */
export function buildStreetNetwork(): THREE.Group {
const group = new THREE.Group();
group.name = 'street_network';
  type Way = { w: number; r: number; pts: number[][] };
  const ways = (roadNetwork as { ways: Way[] }).ways;

  interface Batch { pos: number[]; uv: number[]; idx: number[]; }
  const marked: Batch = { pos: [], uv: [], idx: [] };
  const plain: Batch = { pos: [], uv: [], idx: [] };
  const under: Batch = { pos: [], uv: [], idx: [] };

  const addStrip = (batch: Batch, line: THREE.Vector3[], half: number, dy: number, uvRepeat: boolean): void => {
    const n = line.length;
    if (n < 2) return;
    const base = batch.pos.length / 3;
    let arc = 0;
    for (let i = 0; i < n; i++) {
      const a = line[Math.max(0, i - 1)], b = line[Math.min(n - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z;
      const len = Math.hypot(tx, tz) || 1;
      const nx = -tz / len, nz = tx / len;
      const c = line[i];
      batch.pos.push(c.x + nx * half, c.y + dy, c.z + nz * half, c.x - nx * half, c.y + dy, c.z - nz * half);
      if (i > 0) arc += Math.hypot(c.x - line[i - 1].x, c.z - line[i - 1].z);
      const v = uvRepeat ? arc / TEXTURE_REPEAT_METRES : 0;
      batch.uv.push(0, v, 1, v);
      if (i < n - 1) {
        const k = base + i * 2;
        batch.idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
  };

  for (const way of ways) {
    const line = smoothOpen(way.pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)), 2);
    const half = way.w / 2;
    addStrip(way.w >= 7 ? marked : plain, line, half, ROAD_LIFT + way.r * 0.01, true);
    addStrip(under, line, half + UNDERLAY_MARGIN, -0.3, false);
  }

  const toMesh = (b: Batch, mat: THREE.Material): THREE.Mesh => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setIndex(b.idx);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    return mesh;
  };
  const roadMat = (markings: boolean, offset: number): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      map: makeAsphaltTexture(markings),
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: offset,
      polygonOffsetUnits: offset,
    });

  // underlay: hides holes left in the mesh where clutter was removed
  group.add(
    toMesh(under, new THREE.MeshBasicMaterial({ color: 0x4a4b4e, side: THREE.DoubleSide })),
    toMesh(plain, roadMat(false, -3)),
    toMesh(marked, roadMat(true, -4))
  );
  return group;
}
