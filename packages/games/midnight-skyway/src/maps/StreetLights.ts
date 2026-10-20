import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Brightness of every lamp glow (halos, light pools on the road, uplights): one knob for both stages. */
const GLOW_LEVEL = 0.65;

/** Soft round glow for the lamps (one texture for all of them). */
export function glowTexture(): THREE.CanvasTexture {
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(255, 236, 190, ${GLOW_LEVEL})`);
  grad.addColorStop(0.25, `rgba(255, 210, 140, ${0.55 * GLOW_LEVEL})`);
  grad.addColorStop(1, 'rgba(255, 190, 110, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface StreetLights {
  group: THREE.Group;
}

export interface StreetLightOptions {
  /** Distance between two lamps along the road (m). */
  spacing?: number;
  /** Height of the pole above the deck (m). */
  height?: number;
  /** Length of the arm reaching over the road (m). */
  arm?: number;
}

/**
 * Expressway street lights at an equal spacing along the whole route, on alternating sides: a tapered steel pole behind the
 * parapet with an upswept arm over the lanes and a lamp head under its tip. Steel and lamp heads are merged into one mesh each;
 * the glow of all lamps is a single Points object.
 * `road` = deck surface samples (~2 m apart, driven in index order, closed loop); lateral +ve = driver's right.
 */
export function buildStreetLights(road: THREE.Vector3[], roadWidth: number, opts: StreetLightOptions = {}): StreetLights {
  const n = road.length, half = roadWidth / 2;
  const spacing = opts.spacing ?? 32, H = opts.height ?? 9.5, ARM = opts.arm ?? 2.8, TILT = 0.2;
  const group = new THREE.Group();
  const arc = [0];
  for (let i = 1; i <= n; i++) arc.push(arc[i - 1] + Math.hypot(road[i % n].x - road[i - 1].x, road[i % n].z - road[i - 1].z));
  const total = arc[n];
  const indexAt = (s: number): number => {
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= s) lo = m; else hi = m; }
    return lo;
  };
  const yawAt = (i: number): number => {
    const a = road[(i - 3 + n * 4) % n], b = road[(i + 3) % n];
    return Math.atan2(b.x - a.x, b.z - a.z);
  };

  const steel: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [], glow: number[] = [];
  const poolPos: number[] = [], poolUv: number[] = [];
  const count = Math.max(1, Math.floor(total / spacing)), step = total / count;      // an exact whole number of equal gaps
  const UP = new THREE.Vector3(0, 1, 0);
  for (let k = 0; k < count; k++) {
    const i = indexAt(step * (k + 0.5)), r = road[i], yaw = yawAt(i);
    const nx = -Math.cos(yaw), nz = Math.sin(yaw);                  // lateral (+ = driver's right)
    const side = k % 2 === 0 ? 1 : -1;
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const put = (g: THREE.BufferGeometry, pos: THREE.Vector3, q: THREE.Quaternion, into: THREE.BufferGeometry[]): void => {
      g.applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
      into.push(g);
    };
    const bx = r.x + nx * side * (half + 0.6), bz = r.z + nz * side * (half + 0.6);

    put(new THREE.CylinderGeometry(0.07, 0.13, H, 12), new THREE.Vector3(bx, r.y + H / 2, bz), new THREE.Quaternion(), steel);           // tapered pole
    put(new THREE.BoxGeometry(0.5, 0.08, 0.5), new THREE.Vector3(bx, r.y + 0.04, bz), qYaw, steel);                                       // base plate
    put(new THREE.CylinderGeometry(0.19, 0.22, 0.4, 12), new THREE.Vector3(bx, r.y + 0.28, bz), new THREE.Quaternion(), steel);           // collar
    // arm over the road, swept up towards its tip (the tip is on the road side: -side along the lateral axis)
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    const armQ = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * TILT));
    const armC = new THREE.Vector3(bx - nx * side * (ARM / 2) * cosT, r.y + H + (ARM / 2) * sinT - 0.05, bz - nz * side * (ARM / 2) * cosT);
    put(new THREE.BoxGeometry(ARM, 0.13, 0.13), armC, armQ, steel);
    const tip = new THREE.Vector3(bx - nx * side * ARM * cosT, r.y + H + ARM * sinT - 0.05, bz - nz * side * ARM * cosT);
    put(new THREE.BoxGeometry(1.1, 0.2, 0.42), tip.clone().add(new THREE.Vector3(0, -0.2, 0)), qYaw, heads);                             // lamp head
    glow.push(tip.x, tip.y - 0.35, tip.z);

    // pool of light on the deck under the lamp: a quad lying on the road surface (follows its slope)
    const a = road[(i - 4 + n * 4) % n], b = road[(i + 4) % n];
    const fwd = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const lat = new THREE.Vector3(nx, 0, nz).normalize();
    const cLat = side * (half + 0.6 - ARM * cosT);                    // under the lamp: the lamp is on the road side of its pole
    const c = new THREE.Vector3(r.x + nx * cLat, r.y + 0.06, r.z + nz * cLat);
    const L = 9, Wd = roadWidth * 0.62;                                // half length along the road / half width across
    const corner = (u: number, v: number): void => { poolPos.push(c.x + fwd.x * L * u + lat.x * Wd * v, c.y + fwd.y * L * u, c.z + fwd.z * L * u + lat.z * Wd * v); };
    corner(-1, -1); corner(1, -1); corner(1, 1); corner(-1, -1); corner(1, 1); corner(-1, 1);
    poolUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
  }

  const poleMesh = new THREE.Mesh(mergeGeometries(steel), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, fog: false });
  const headMesh = new THREE.Mesh(mergeGeometries(heads), headMat);
  const tex = glowTexture();
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
  const halo = new THREE.Points(pg, new THREE.PointsMaterial({
    map: tex, size: 9, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xffe0a8,
  }));
  halo.frustumCulled = false;
  const poolGeo = new THREE.BufferGeometry();
  poolGeo.setAttribute('position', new THREE.Float32BufferAttribute(poolPos, 3));
  poolGeo.setAttribute('uv', new THREE.Float32BufferAttribute(poolUv, 2));
  const pools = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xffd89a, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  pools.frustumCulled = false;
  group.add(poleMesh, headMesh, halo, pools);
  steel.forEach((g) => g.dispose());
  heads.forEach((g) => g.dispose());

  return { group };
}
