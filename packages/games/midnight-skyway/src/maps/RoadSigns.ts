import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type Arrow = 'up' | 'upleft' | 'upright';

export interface SignRow {
  /** Main line (large). */
  main: string;
  /** Second line (smaller): romaji in Japan, Swedish in Finland. */
  sub?: string;
  arrow?: Arrow;
}

export interface SignSpec {
  kind: 'gantry' | 'side' | 'km';
  /** Preferred distance along the route in metres; snapped to a nearby straight stretch. */
  at: number;
  rows?: SignRow[];
  /** Search range (m) for a straight spot near `at`; default 120 (gantries / boards), 40 (km posts). */
  snap?: number;
  /** Small route badge at the top-left of a gantry board (e.g. "C1"). */
  badge?: string;
  /** Text of a kilometre post. */
  text?: string;
  /** Resolved (snap-collision) before non-priority signs, so it always keeps its spot (e.g. mandatory fork warnings). */
  priority?: boolean;
}

export interface SignStyle {
  background: string;
  border: string;
  fontFamily: string;
  subFontFamily: string;
}

export const JP_STYLE: SignStyle = {
  background: '#0a6b45', border: '#ffffff',
  fontFamily: '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic","Noto Sans JP","Meiryo",sans-serif',
  subFontFamily: '"Helvetica Neue",Arial,sans-serif',
};

const PX_PER_M = 200;
const ROW_H = 1.25;      // one destination row (main + sub line)
const BOARD_H = ROW_H + 0.5;
const CORNER = 0.22;     // board corner radius (m)
const CLEAR_REAL = 4.7;  // free height (m) under any board that hangs over the lanes

// 看板などのテクスチャ用のキャンバスは、CPU 側で描く(willReadFrequently: true)。Firefox は、GPU 側のキャンバスをテクスチャへ上げるときに読み戻しが入り、
// 256x104 の看板 1 枚で約 7ms かかっていた(東京スカイウェイ 60 秒で 215 回)。CPU 側なら、読み戻しがなく 1ms 未満。
interface Board { front: THREE.CanvasTexture; back: THREE.CanvasTexture; w: number; h: number }

const measureCtx = document.createElement('canvas').getContext('2d')!;

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
}

function drawArrow(g: CanvasRenderingContext2D, cx: number, cy: number, size: number, arrow: Arrow): void {
  g.save();
  g.translate(cx, cy);
  g.rotate(arrow === 'up' ? 0 : arrow === 'upleft' ? -Math.PI / 4 : Math.PI / 4);
  g.fillStyle = '#fff';
  const w = size * 0.2;
  g.fillRect(-w / 2, -size * 0.1, w, size * 0.6);
  g.beginPath();
  g.moveTo(0, -size * 0.5); g.lineTo(size * 0.3, -size * 0.05); g.lineTo(-size * 0.3, -size * 0.05); g.closePath();
  g.fill();
  g.restore();
}

/** One rounded destination board (its own canvas, sized to the text) plus its plain back with stiffener ribs. */
function makeBoard(row: SignRow, style: SignStyle, badge?: string): Board {
  const mainPx = (row.sub ? ROW_H * 0.5 : ROW_H * 0.55) * PX_PER_M, subPx = ROW_H * 0.27 * PX_PER_M;
  measureCtx.font = `bold ${mainPx}px ${style.fontFamily}`;
  let textW = measureCtx.measureText(row.main).width;
  if (row.sub) { measureCtx.font = `${subPx}px ${style.subFontFamily}`; textW = Math.max(textW, measureCtx.measureText(row.sub).width); }
  const badgeW = badge ? 1.35 : 0, arrowW = row.arrow ? 1.05 : 0.2;
  const w = Math.max(3.0, 0.45 + badgeW + textW / PX_PER_M + 0.3 + arrowW + 0.2), h = BOARD_H;
  const W = Math.round(w * PX_PER_M), H = Math.round(h * PX_PER_M);

  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  roundRect(g, 0, 0, W, H, CORNER * PX_PER_M); g.fillStyle = style.background; g.fill();
  roundRect(g, 0.1 * PX_PER_M, 0.1 * PX_PER_M, W - 0.2 * PX_PER_M, H - 0.2 * PX_PER_M, 0.14 * PX_PER_M);
  g.strokeStyle = style.border; g.lineWidth = 0.055 * PX_PER_M; g.stroke();
  g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillStyle = '#fff';
  const cy = H / 2;
  let x0 = 0.45 * PX_PER_M;
  if (badge) {
    const bs = 0.95 * PX_PER_M;
    roundRect(g, x0, cy - bs / 2, bs, bs, 0.12 * PX_PER_M); g.fillStyle = '#fff'; g.fill();
    g.fillStyle = style.background; g.textAlign = 'center'; g.font = `bold ${0.44 * PX_PER_M}px ${style.subFontFamily}`;
    g.fillText(badge, x0 + bs / 2, cy + 0.02 * PX_PER_M);
    g.textAlign = 'left'; g.fillStyle = '#fff';
    x0 = 0.45 * PX_PER_M + badgeW * PX_PER_M;
  }
  if (row.sub) {
    g.font = `bold ${mainPx}px ${style.fontFamily}`; g.fillText(row.main, x0, cy - ROW_H * 0.13 * PX_PER_M);
    g.font = `${subPx}px ${style.subFontFamily}`; g.fillText(row.sub, x0, cy + ROW_H * 0.28 * PX_PER_M);
  } else {
    g.font = `bold ${mainPx}px ${style.fontFamily}`; g.fillText(row.main, x0, cy);
  }
  if (row.arrow) drawArrow(g, W - 0.35 * PX_PER_M - 0.5 * PX_PER_M, cy, ROW_H * 0.8 * PX_PER_M, row.arrow);
  const front = new THREE.CanvasTexture(c); front.colorSpace = THREE.SRGBColorSpace; front.anisotropy = 8;

  const bc = document.createElement('canvas'); bc.width = W; bc.height = H;
  const b = bc.getContext('2d', { willReadFrequently: true })!;
  roundRect(b, 0, 0, W, H, CORNER * PX_PER_M); b.fillStyle = '#7b8189'; b.fill();
  b.strokeStyle = '#a4aab1'; b.lineWidth = 0.05 * PX_PER_M;                       // rim + horizontal / vertical ribs
  roundRect(b, 0.08 * PX_PER_M, 0.08 * PX_PER_M, W - 0.16 * PX_PER_M, H - 0.16 * PX_PER_M, 0.15 * PX_PER_M); b.stroke();
  for (const f of [0.28, 0.72]) { b.beginPath(); b.moveTo(0.1 * PX_PER_M, H * f); b.lineTo(W - 0.1 * PX_PER_M, H * f); b.stroke(); }
  for (let k = 1; k < Math.round(w / 1.1); k++) { b.beginPath(); b.moveTo(W * k / Math.round(w / 1.1), 0.1 * PX_PER_M); b.lineTo(W * k / Math.round(w / 1.1), H - 0.1 * PX_PER_M); b.stroke(); }
  const back = new THREE.CanvasTexture(bc); back.colorSpace = THREE.SRGBColorSpace;
  return { front, back, w, h };
}

function makeKmBoard(text: string, style: SignStyle): Board {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  roundRect(g, 0, 0, S, S, 30); g.fillStyle = style.background; g.fill();
  roundRect(g, 12, 12, S - 24, S - 24, 20); g.strokeStyle = '#fff'; g.lineWidth = 8; g.stroke();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `bold 96px ${style.subFontFamily}`; g.fillText(text, S / 2, S * 0.42);
  g.font = `bold 56px ${style.subFontFamily}`; g.fillText('km', S / 2, S * 0.75);
  const front = new THREE.CanvasTexture(c); front.colorSpace = THREE.SRGBColorSpace;
  const bc = document.createElement('canvas'); bc.width = S; bc.height = S;
  const b = bc.getContext('2d', { willReadFrequently: true })!; roundRect(b, 0, 0, S, S, 30); b.fillStyle = '#7b8189'; b.fill();
  const back = new THREE.CanvasTexture(bc); back.colorSpace = THREE.SRGBColorSpace;
  return { front, back, w: 0.9, h: 0.9 };
}

/**
 * Expressway signage along a closed elevated route (real-world construction): round steel poles on base plates,
 * overhead truss gantries with separate hanging boards, roadside poles carrying stacked boards on clamped rails,
 * and kilometre posts. Each destination is its own rounded board with a ribbed grey back.
 * `road` = deck surface samples (game coordinates, ~2 m apart, driven in index order); lateral +ve = driver's right.
 * Steel is merged into one mesh; each board is two quads (front texture, back texture).
 */
export function buildRoadSigns(
  road: THREE.Vector3[], roadWidth: number, specs: SignSpec[], style: SignStyle, scale = 1,
  /** 他の路面の中心線(分岐・対向車線など)。支柱がこれらの路面の上に立つ場所には標識を置かず、近くの空いた場所へずらす。 */
  avoid: THREE.Vector3[][] = [],
): THREE.Group {
  const n = road.length;
  const half = roadWidth / 2;
  const arc = [0];
  for (let i = 1; i <= n; i++) arc.push(arc[i - 1] + Math.hypot(road[i % n].x - road[i - 1].x, road[i % n].z - road[i - 1].z));
  const total = arc[n];
  const yawAt = (i: number): number => {
    const a = road[(i - 3 + n) % n], b = road[(i + 3) % n];
    return Math.atan2(b.x - a.x, b.z - a.z);
  };
  const indexAt = (s: number): number => {
    const t = ((s % total) + total) % total;
    let lo = 0, hi = n;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (arc[m] <= t) lo = m; else hi = m; }
    return lo;
  };
  /** Total heading change within ±25 m: small = straight. */
  const bend = (s: number): number => {
    const a = yawAt(indexAt(s - 25)), b = yawAt(indexAt(s + 25));
    return Math.abs(Math.atan2(Math.sin(b - a), Math.cos(b - a)));
  };
  const snap = (s: number, range: number): number => {
    let best = s, bestV = Infinity;
    for (let d = -range; d <= range; d += 5) { const v = bend(s + d) + Math.abs(d) * 1e-5; if (v < bestV) { bestV = v; best = s + d; } }
    return ((best % total) + total) % total;
  };
  /** 支柱の位置(横方向)。+ が運転者の右。 */
  const postLats = (kind: SignSpec['kind']): number[] =>
    kind === 'gantry' ? [-(half + 0.85) * scale, (half + 0.85) * scale] : kind === 'side' ? [(half + 0.9) * scale] : [(half + 0.25) * scale];
  /** 点 (x,z) が、高さが近い(4m以内)別の路面の上にあるか。橋で立体交差している道路は除く。 */
  const onOtherDeck = (x: number, y: number, z: number): boolean => {
    for (const pts of avoid) {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k], b = pts[k + 1];
        const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
        if (Math.abs(a.y + (b.y - a.y) * t - y) > 4) continue;
        if (Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz)) < half + 0.1) return true;
      }
    }
    return false;
  };
  /** 前後12mの範囲でも支柱が別の路面に乗らないこと(分岐の鼻先ぎりぎりに立たないよう余裕を持たせる)。 */
  const postsClear = (kind: SignSpec['kind'], s: number): boolean => {
    if (avoid.length === 0) return true;
    for (const ds of [0, -6, 6, -12, 12]) {
      const i = indexAt(s + ds), r = road[i], yaw = yawAt(i);
      const nx = -Math.cos(yaw), nz = Math.sin(yaw);   // lateral (+ = driver's right)
      if (postLats(kind).some((lat) => onOtherDeck(r.x + nx * lat, r.y, r.z + nz * lat))) return false;
    }
    return true;
  };
  /** 候補位置の支柱が別の路面に乗るなら、前後に少しずつずらして空いた場所を探す。見つからなければ null。 */
  const clearSpot = (kind: SignSpec['kind'], s: number): number | null => {
    for (let d = 0; d <= 90; d += 10) {
      for (const sign of d === 0 ? [1] : [1, -1]) {
        const cand = ((s + sign * d) % total + total) % total;
        if (postsClear(kind, cand)) return cand;
      }
    }
    return null;
  };
  const arcDist = (a: number, b: number): number => { const d = Math.abs(a - b) % total; return Math.min(d, total - d); };

  // Each sign is independently snapped to the straightest nearby spot, so two signs whose nominal positions are up to
  // `range` apart can both be pulled onto the very same stretch (this is what happens right after the start: the
  // spawn point sits on a long straight, so a side board meant to be ~60 m further along gets snapped onto it too).
  // Resolve every spec's snapped position first and drop any non-priority, non-km spec that lands on top of one
  // already placed, so two structures never occupy the same stretch of road. Priority specs (fork warnings) resolve
  // first so they always keep their spot.
  const MIN_SIGN_CLEAR = 45;
  const claimed: number[] = [];
  const ordered = [...specs].sort((a, b) => (b.priority ? 1 : 0) - (a.priority ? 1 : 0));
  const resolved: { spec: SignSpec; at: number }[] = [];
  for (const spec of ordered) {
    let at = snap(spec.at, spec.snap ?? (spec.kind === 'km' ? 40 : 120));
    const open = clearSpot(spec.kind, at);
    if (open === null) continue;
    at = open;
    if (spec.kind !== 'km' && claimed.some((c) => arcDist(c, at) < MIN_SIGN_CLEAR)) continue;
    claimed.push(at);
    resolved.push({ spec, at });
  }

  const steelParts: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();
  const UP = new THREE.Vector3(0, 1, 0);

  for (const { spec, at } of resolved) {
    const i = indexAt(at);
    const r = road[i], yaw = yawAt(i);
    const tx = Math.sin(yaw), tz = Math.cos(yaw);      // direction of travel
    const nx = -tz, nz = tx;                            // lateral (+ = driver's right)
    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    // Every sign is modelled in its own units and enlarged by `scale` about the road surface point; positions given to
    // world() are in those units (so a road-edge position is divided by `scale` by the caller).
    const S = scale;
    const world = (lat: number, y: number, fwd: number): THREE.Vector3 => new THREE.Vector3(r.x + (nx * lat + tx * fwd) * S, r.y + y * S, r.z + (nz * lat + tz * fwd) * S);
    const add = (g: THREE.BufferGeometry, pos: THREE.Vector3, q: THREE.Quaternion = qYaw): void => {
      g.applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(S, S, S)));
      steelParts.push(g);
    };
    /** Axis-aligned bar in the road frame: w across the road, h up, d along it. */
    const bar = (w: number, h: number, d: number, lat: number, y: number, fwd: number): void => add(new THREE.BoxGeometry(w, h, d), world(lat, y, fwd));
    /** Bar between two points of the cross-section plane (lateral, height). */
    const strut = (l0: number, y0: number, l1: number, y1: number, fwd: number, t: number): void => {
      const dl = -(l1 - l0), dy = y1 - y0;                         // local +x is the driver's left
      const q = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(dy, dl)));
      add(new THREE.BoxGeometry(Math.hypot(dl, dy), t, t), world((l0 + l1) / 2, (y0 + y1) / 2, fwd), q);
    };
    const pole = (lat: number, fwd: number, y0: number, y1: number, rad: number): void => {
      add(new THREE.CylinderGeometry(rad, rad * 1.05, y1 - y0, 14), world(lat, (y0 + y1) / 2, fwd));
      add(new THREE.BoxGeometry(rad * 4.4, 0.06, rad * 4.4), world(lat, y0 + 0.03, fwd));                 // base plate
      add(new THREE.CylinderGeometry(rad * 1.5, rad * 1.7, 0.3, 14), world(lat, y0 + 0.21, fwd));         // anchor collar
    };
    const clamp = (lat: number, y: number, fwd: number, rad: number): void => add(new THREE.CylinderGeometry(rad * 1.45, rad * 1.45, 0.16, 14), world(lat, y, fwd));
    const board = (b: Board, lat: number, y: number): void => {
      const front = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: b.front, alphaTest: 0.5 }));
      front.position.copy(world(lat, y, -0.07)); front.rotation.y = yaw + Math.PI; front.scale.setScalar(S);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ map: b.back, alphaTest: 0.5 }));
      back.position.copy(world(lat, y, -0.03)); back.rotation.y = yaw; back.scale.setScalar(S);
      group.add(front, back);
    };

    if (spec.kind === 'gantry') {
      const boards = spec.rows!.map((row) => makeBoard(row, style, spec.badge));
      const span = (half + 0.85) / S, rad = 0.17, bh = BOARD_H, clear = CLEAR_REAL / S;   // posts stand at the road edges
      const gap = 0.35, totalW = boards.reduce((a, b) => a + b.w, 0) + gap * (boards.length - 1);
      const yBot = clear + bh + 0.45, yTop = yBot + 0.75;   // truss chords
      for (const side of [-1, 1]) pole(side * span, 0, 0, yTop + 0.35, rad);
      // the truss covers the boards, so it reaches out past the posts when they are wider than the road
      const truss = Math.max(span * 2 + 0.5, totalW + 1.2);
      bar(truss, 0.14, 0.14, 0, yTop, 0);
      bar(truss, 0.14, 0.14, 0, yBot, 0);
      const panels = Math.max(4, Math.round(truss / 1.1)), pl = truss / panels;
      for (let k = 0; k < panels; k++) {
        const l0 = -truss / 2 + k * pl;
        strut(l0, yBot, l0 + pl / 2, yTop, 0, 0.09);
        strut(l0 + pl / 2, yTop, l0 + pl, yBot, 0, 0.09);
      }
      // boards side by side under the truss, each hung on two rods
      let l = -totalW / 2;
      for (const b of boards) {
        const lc = l + b.w / 2;
        board(b, lc, clear + bh / 2);
        for (const f of [0.22, 0.78]) bar(0.08, yBot - (clear + bh), 0.1, l + b.w * f, (yBot + clear + bh) / 2, 0);
        l += b.w + gap;
      }
    } else if (spec.kind === 'side') {
      const boards = spec.rows!.map((row) => makeBoard(row, style));
      const rad = 0.15, postLat = (half + 0.9) / S, gapV = 0.18, bh = BOARD_H, clear = CLEAR_REAL / S;
      const minW = Math.min(...boards.map((b) => b.w));
      const stack = boards.length * bh + (boards.length - 1) * gapV;
      pole(postLat, 0, 0, clear + stack + 0.6, rad);
      boards.forEach((b, k) => {
        const yc = clear + bh / 2 + k * (bh + gapV);
        const lc = postLat - 0.45 - b.w / 2, left = postLat - 0.45 - minW + 0.25;   // same rail length for every board
        board(b, lc, yc);
        for (const dy of [-(bh / 2 - 0.32), bh / 2 - 0.32]) {
          bar(postLat - left, 0.09, 0.1, (postLat + left) / 2, yc + dy, 0);   // rail from the pole across the back of the board
          clamp(postLat, yc + dy, 0, rad);
        }
      });
    } else {
      const lat = (half + 0.25) / S, P = 1.1 / S, b = makeKmBoard(spec.text ?? '', style);
      pole(lat, 0.02, P, P + 1.85, 0.05);
      board(b, lat, P + 1.3);
    }
  }

  if (steelParts.length) {
    const steel = new THREE.Mesh(mergeGeometries(steelParts), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
    steel.castShadow = true;
    steel.receiveShadow = true;
    group.add(steel);
    steelParts.forEach((g) => g.dispose());
  }
  return group;
}

/** Chevron board (線形誘導標 / 矢羽根): yellow with black double chevrons pointing the way the road turns, as seen by the driver. */
function makeChevronTexture(left: boolean): THREE.CanvasTexture {
  const W = 320, H = 240, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  roundRect(g, 0, 0, W, H, 22); g.fillStyle = '#ffd200'; g.fill();
  roundRect(g, 10, 10, W - 20, H - 20, 14); g.strokeStyle = '#111'; g.lineWidth = 10; g.stroke();
  g.strokeStyle = '#111'; g.lineWidth = 34; g.lineCap = 'butt'; g.lineJoin = 'miter';
  const dir = left ? -1 : 1, cy = H / 2, hh = 68, arm = 50;    // dir: which way the chevrons point (seen by the driver)
  for (const tipX of [W / 2 - dir * 42 + dir * 25, W / 2 + dir * 42 + dir * 25]) {   // two chevrons, tips 84 px apart, centred on the board
    g.beginPath();
    g.moveTo(tipX - dir * arm, cy - hh);
    g.lineTo(tipX, cy);
    g.lineTo(tipX - dir * arm, cy + hh);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

/**
 * Chevron signs on the OUTSIDE of every sharp bend: a row of boards along the bend, each pointing the way the road turns
 * (「＜＜」 for a left bend, 「＞＞」 for a right one), facing the approaching driver, standing behind the parapet.
 * `road` = deck surface samples (~2 m apart, driven in index order, closed loop).
 */
export function buildCurveSigns(road: THREE.Vector3[], roadWidth: number, opts: { maxRadius?: number; minTurn?: number; spacing?: number; count?: number } = {}): THREE.Group {
  const n = road.length, half = roadWidth / 2, maxR = opts.maxRadius ?? 85, minTurn = opts.minTurn ?? 0.6, K = 6;
  const group = new THREE.Group();
  const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
  const yawAt = (i: number): number => { const a = road[(i - 3 + n * 4) % n], b = road[(i + 3) % n]; return Math.atan2(b.x - a.x, b.z - a.z); };
  const seg = (i: number): number => Math.hypot(road[(i + 1) % n].x - road[i % n].x, road[(i + 1) % n].z - road[i % n].z);
  const radius = (i: number): number => {
    const a = road[(i - K + n * 4) % n], b = road[i], c = road[(i + K) % n];
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    return area2 > 1e-6 ? (ab * bc * ca) / (2 * area2) : 1e9;
  };
  const sharp = road.map((_, i) => radius(i) < maxR);

  // runs of sharp samples (starting from a straight one so a bend is never cut by the array seam); nearby runs are one bend
  const start = sharp.findIndex((v) => !v);
  if (start < 0) return group;
  const runs: { a: number; b: number }[] = [];
  let cur: { a: number; b: number } | null = null, gapLen = 0;
  for (let c = 1; c <= n; c++) {
    const i = start + c;                                          // absolute (unwrapped) index
    if (sharp[i % n]) { if (!cur) cur = { a: i, b: i }; else cur.b = i; gapLen = 0; }
    else if (cur && ++gapLen > 8) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);

  const tex = { left: makeChevronTexture(true), right: makeChevronTexture(false) };
  const back = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d', { willReadFrequently: true })!; g.fillStyle = '#7b8189'; g.fillRect(0, 0, 64, 48); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const BW = 1.5, BH = 1.12, POLE_H = 1.95, SPACING = opts.spacing ?? 10, COUNT = opts.count ?? 4;
  const poles: THREE.BufferGeometry[] = [];
  const cyl = new THREE.CylinderGeometry(0.045, 0.05, POLE_H, 10);

  for (const run of runs) {
    let turn = 0, len = 0;
    for (let i = run.a; i < run.b; i++) { turn += wrap(yawAt((i + 1) % n) - yawAt(i % n)); len += seg(i % n); }
    if (Math.abs(turn) < minTurn || len < 16) continue;
    const left = turn > 0;                                        // yaw grows to the left (the car steers left with +rotationY)
    const side = left ? 1 : -1;                                   // outside of the bend: +ve lateral = driver's right
    const count = COUNT;                                          // a few boards, close together, around the middle of the bend
    for (let k = 0; k < count; k++) {
      const target = Math.min(len * 0.95, Math.max(len * 0.05, len / 2 + (k - (count - 1) / 2) * SPACING));
      let acc = 0, i = run.a;
      while (i < run.b && acc + seg(i % n) < target) { acc += seg(i % n); i++; }
      const idx = i % n, r = road[idx], yaw = yawAt(idx);
      const tx = Math.sin(yaw), tz = Math.cos(yaw), nx = -tz, nz = tx;
      const lat = side * (half + 0.5);
      const px = r.x + nx * lat, pz = r.z + nz * lat;
      const p = cyl.clone(); p.translate(px, r.y + POLE_H / 2, pz); poles.push(p);
      const frontMat = new THREE.MeshBasicMaterial({ map: left ? tex.left : tex.right, alphaTest: 0.5 });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), frontMat);
      front.position.set(px - tx * 0.06, r.y + POLE_H - BH / 2 + 0.05, pz - tz * 0.06);
      front.rotation.y = yaw + Math.PI;
      const rear = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: back, alphaTest: 0.5 }));
      rear.position.set(px - tx * 0.03, front.position.y, pz - tz * 0.03);
      rear.rotation.y = yaw;
      group.add(front, rear);
    }
  }
  if (poles.length) {
    const steel = new THREE.Mesh(mergeGeometries(poles), new THREE.MeshLambertMaterial({ color: 0x9aa0a6 }));
    group.add(steel);
    poles.forEach((g) => g.dispose());
  }
  cyl.dispose();
  return group;
}
