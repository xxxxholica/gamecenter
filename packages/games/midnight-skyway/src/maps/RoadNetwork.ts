import * as THREE from 'three';
import type { SignSpec, SignRow } from './RoadSigns';

/** Shape of the JSON written by the design scripts: main loop plus (optional) opposite carriageway and branches. */
export interface RoadData {
  road: number[][];
  opposite?: number[][];
  branches?: { kind: string; from: number; to: number; road: number[][] }[];
}

export interface RoadBranch { kind: string; from: number; to: number; road: THREE.Vector3[]; ground: number[] }
export interface RoadNetwork {
  /** Opposite carriageway (visual only), index-aligned with the main loop. */
  opposite: THREE.Vector3[];
  oppositeGround: number[];
  /** Open side routes: first sample = loop[from], last = loop[to]. */
  branches: RoadBranch[];
}

const smoothstep = (w: number): number => w * w * (3 - 2 * w);

/**
 * Builds the vectors for the opposite carriageway and the branches. `road` is the main loop AFTER its runtime height
 * smoothing: the opposite carriageway copies its heights, and the branch ends are blended onto it (the JSON stored the
 * unsmoothed heights).
 */
export function buildRoadNetwork(data: RoadData, road: THREE.Vector3[]): RoadNetwork {
  const opposite = (data.opposite ?? []).map(([x, , z], i) => new THREE.Vector3(x, road[i]?.y ?? 0, z));
  const oppositeGround = (data.opposite ?? []).map((r) => r[3]);
  const branches: RoadBranch[] = (data.branches ?? []).map((b) => {
    const n = b.road.length, N = road.length, BLEND = 100;
    // start and end follow the loop's own height profile (index-aligned, ~2 m samples), the middle its ground-following one
    const pts = b.road.map(([x, y, z], i) => {
      const s0 = smoothstep(Math.min(1, i / BLEND)), s1 = smoothstep(Math.min(1, (n - 1 - i) / BLEND));
      const yStart = road[(b.from + i) % N].y, yEnd = road[((b.to - (n - 1 - i)) % N + N) % N].y;
      const y1 = yStart * (1 - s0) + y * s0;
      return new THREE.Vector3(x, yEnd * (1 - s1) + y1 * s1, z);
    });
    return { kind: b.kind, from: b.from, to: b.to, road: pts, ground: b.road.map((r) => r[3]) };
  });
  return { opposite, oppositeGround, branches };
}

/**
 * Advance guide signs about `lead` metres before each fork: one board per route, the branch's arrow pointing to the side
 * it leaves to. `rows(i, side)` supplies the two destination rows of the i-th branch: [straight on, branch].
 * Existing signs closer than `clear` metres to a fork sign are dropped so the gantries do not pile up.
 */
export function addForkSigns(
  specs: SignSpec[], net: RoadNetwork, road: THREE.Vector3[], rows: (i: number) => [SignRow, SignRow], opts: { badge?: string; lead?: number; clear?: number } = {},
): SignSpec[] {
  const n = road.length, arc = [0];
  for (let i = 1; i <= n; i++) arc.push(arc[i - 1] + Math.hypot(road[i % n].x - road[i - 1].x, road[i % n].z - road[i - 1].z));
  const total = arc[n], lead = opts.lead ?? 230, clear = opts.clear ?? 170;
  const fork: SignSpec[] = net.branches.map((b, i) => {
    const a = road[b.from], a2 = road[(b.from + 3) % n], p = b.road[Math.min(b.road.length - 1, 30)];
    // which way does the branch leave? cross(heading, offset) > 0  ->  towards the driver's left (x right / z forward frame of the game)
    const cross = (a2.x - a.x) * (p.z - a.z) - (a2.z - a.z) * (p.x - a.x);
    const [straight, branch] = rows(i);
    const leftOfDriver = cross < 0;
    return {
      kind: 'gantry', at: ((arc[b.from] - lead) % total + total) % total, snap: 30, badge: opts.badge, priority: true,
      // boards stand on the side their route leaves to
      rows: leftOfDriver ? [{ ...branch, arrow: 'upleft' }, straight] : [straight, { ...branch, arrow: 'upright' }],
    } as SignSpec;
  });
  const dist = (a: number, b: number): number => { const d = Math.abs(a - b) % total; return Math.min(d, total - d); };
  const kept = specs.filter((s) => s.kind === 'km' || !fork.some((f) => dist(s.at, f.at) < clear));
  return [...kept, ...fork];
}

export interface ParapetGaps { left: boolean[]; right: boolean[] }

/**
 * Where a branch leaves or joins, the two decks run side by side / overlap: leave out the parapet between them so the
 * opening is visible (the main deck on the branch's side, the branch on the main deck's side).
 * Returns the gaps for the main loop and for each branch. Lateral sign: left = driver's left.
 */
export function parapetGaps(road: THREE.Vector3[], net: RoadNetwork, roadWidth: number): { main: ParapetGaps; branches: ParapetGaps[] } {
  const n = road.length, T = roadWidth - 0.6;   // the barrier runs up to the nose where the two decks meet
  const main: ParapetGaps = { left: new Array(n).fill(false), right: new Array(n).fill(false) };
  const branches = net.branches.map((b) => {
    const m = b.road.length;
    const a = road[b.from], a2 = road[(b.from + 3) % n], p = b.road[Math.min(m - 1, 30)];
    const cross = (a2.x - a.x) * (p.z - a.z) - (a2.z - a.z) * (p.x - a.x);   // > 0: the branch is on the driver's right
    const branchSideRight = cross > 0;
    const bg: ParapetGaps = { left: new Array(m).fill(false), right: new Array(m).fill(false) };
    const near = (ax: number, az: number, pts: THREE.Vector3[]): boolean => pts.some((q) => (q.x - ax) ** 2 + (q.z - az) ** 2 < T * T);
    // only the stretch of the loop that runs alongside the branch (from where it leaves to where it rejoins): before and
    // after it the loop's own barrier must be intact, it carries on as the branch's outer barrier
    const span = ((b.to - b.from) % n + n) % n;
    const window = (i: number): boolean => ((i - b.from) % n + n) % n <= span;
    for (let i = 0; i < n; i++) {
      if (!window(i)) continue;
      if (near(road[i].x, road[i].z, b.road)) (branchSideRight ? main.right : main.left)[i] = true;
    }
    const alongside: THREE.Vector3[] = [];
    for (let k = 0; k <= 150; k++) alongside.push(road[(b.from + k) % n], road[((b.to - k) % n + n) % n]);   // the loop where it runs beside this branch
    for (let j = 0; j < m; j++) if (near(b.road[j].x, b.road[j].z, alongside)) (branchSideRight ? bg.left : bg.right)[j] = true;
    return bg;
  });
  return { main, branches };
}

export function routeLength(pts: THREE.Vector3[], closed = true): number {
  let len = 0;
  const n = pts.length;
  for (let i = 1; i < (closed ? n + 1 : n); i++) len += Math.hypot(pts[i % n].x - pts[i - 1].x, pts[i % n].z - pts[i - 1].z);
  return len;
}

/**
 * The same signs for the opposite carriageway, whose driving direction runs against the loop's (build it from the
 * reversed opposite array): a sign at distance s along the loop stands at the same place, i.e. at the mirrored distance
 * along the reversed road. Kilometre posts count from the start of that direction.
 */
export function mirrorSigns(specs: SignSpec[], mainLength: number, oppositeLength: number, kmText: (metres: number) => string): SignSpec[] {
  return specs.map((s) => {
    const at = oppositeLength - (s.at / mainLength) * oppositeLength;
    return s.kind === 'km' ? { ...s, at, text: kmText(at) } : { ...s, at };
  });
}

/**
 * Spreads the sign designs of `base` (its gantries and roadside boards, cycled) evenly around a loop of `length` metres,
 * `factor` times as many as listed, plus a kilometre post every `kmEvery` metres.
 */
export function spreadSigns(base: SignSpec[], length: number, kmText: (metres: number) => string, factor = 3, kmEvery = 200): SignSpec[] {
  const out: SignSpec[] = [];
  for (const [kind, phase] of [['gantry', 0.35], ['side', 0.85]] as const) {
    const list = base.filter((s) => s.kind === kind);
    if (!list.length) continue;
    const count = list.length * factor, step = length / count;
    for (let k = 0; k < count; k++) {
      // side boards are nudged off a gantry that would land on the same spot
      let at = (k + phase) * step;
      if (kind === 'side') at += 45;
      out.push({ ...list[(k + (kind === 'side' ? 1 : 0)) % list.length], at: at % length });
    }
  }
  for (let m = kmEvery; m < length - 80; m += kmEvery) out.push({ kind: 'km', at: m, text: kmText(m) });
  return out;
}
