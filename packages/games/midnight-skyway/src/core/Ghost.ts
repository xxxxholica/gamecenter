import * as THREE from 'three';

/** A recorded run: one sample every SAMPLE_MS from the start of the race. Flat layout [x, y, z, rotY, progress] per sample. */
export interface GhostTrace {
  v: 1;
  timeMs: number;
  carName: string;
  date: string;
  kind: 'player' | 'bot';
  s: number[];
}

export const SAMPLE_MS = 100;
const STRIDE = 5;
/** Progress fractions of the sector lines and the finish (kept in sync with TimeAttackManager). */
export const SECTOR_FRACTIONS = [0.33, 0.66, 0.98];

const key = (mapId: string): string => `ghost_${mapId}`;

export function loadGhost(mapId: string): GhostTrace | null {
  try {
    const raw = localStorage.getItem(key(mapId));
    const g = raw ? (JSON.parse(raw) as GhostTrace) : null;
    return g && g.v === 1 && Array.isArray(g.s) && g.s.length >= STRIDE * 2 ? g : null;
  } catch {
    return null;
  }
}

export function saveGhost(mapId: string, g: GhostTrace): void {
  try {
    localStorage.setItem(key(mapId), JSON.stringify(g));
  } catch (e) {
    console.warn('Failed to save ghost', e);
  }
}

const round = (v: number, d: number): number => { const k = 10 ** d; return Math.round(v * k) / k; };

/** Samples the player's run every SAMPLE_MS (race clock) so it can be replayed later. */
export class GhostRecorder {
  private s: number[] = [];
  private next = 0;

  public reset(): void { this.s = []; this.next = 0; }

  public update(elapsedMs: number, pos: THREE.Vector3, rotY: number, progress: number): void {
    while (this.next <= elapsedMs) {
      this.s.push(round(pos.x, 2), round(pos.y, 2), round(pos.z, 2), round(rotY, 3), round(progress, 4));
      this.next += SAMPLE_MS;
    }
  }

  public finish(timeMs: number, carName: string): GhostTrace {
    return { v: 1, timeMs, carName, date: new Date().toISOString(), kind: 'player', s: this.s.slice() };
  }
}

/** Replays a trace: position / heading by race time, and "when was the ghost at progress p" for the live gap. */
export class GhostPlayer {
  private readonly n: number;
  private readonly progress: number[] = [];

  constructor(public readonly trace: GhostTrace) {
    this.n = trace.s.length / STRIDE;
    let run = 0;
    for (let i = 0; i < this.n; i++) {
      let p = trace.s[i * STRIDE + 4];
      if (i < 20 && p > 0.9) p = 0;            // the start line sits just behind the loop's seam: progress may read ~0.99 there
      run = Math.max(run, p);
      this.progress.push(run);
    }
  }

  public get timeMs(): number { return this.trace.timeMs; }

  public sample(tMs: number, out: { pos: THREE.Vector3; rotY: number }): boolean {
    const f = Math.min(this.n - 1, Math.max(0, tMs / SAMPLE_MS)), i = Math.floor(f), j = Math.min(this.n - 1, i + 1), u = f - i, s = this.trace.s;
    out.pos.set(
      s[i * STRIDE] + (s[j * STRIDE] - s[i * STRIDE]) * u,
      s[i * STRIDE + 1] + (s[j * STRIDE + 1] - s[i * STRIDE + 1]) * u,
      s[i * STRIDE + 2] + (s[j * STRIDE + 2] - s[i * STRIDE + 2]) * u,
    );
    let d = s[j * STRIDE + 3] - s[i * STRIDE + 3];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    out.rotY = s[i * STRIDE + 3] + d * u;
    return tMs <= (this.n - 1) * SAMPLE_MS;
  }

  /** Race time (ms) at which the ghost reached progress p, or null when it never did. */
  public timeAt(p: number): number | null {
    const pr = this.progress;
    if (p <= pr[0]) return 0;
    if (p > pr[this.n - 1]) return null;
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (pr[mid] < p) lo = mid; else hi = mid; }
    const span = pr[hi] - pr[lo] || 1;
    return (lo + (p - pr[lo]) / span) * SAMPLE_MS;
  }

  /** Sector split times (ms) of the ghost, matching TimeAttackManager's sectors. */
  public sectorTimes(): number[] | null {
    const t = SECTOR_FRACTIONS.map((f) => this.timeAt(f));
    if (t.some((v) => v === null)) return null;
    return (t as number[]).map((v, i) => v - (i > 0 ? (t[i - 1] as number) : 0));
  }
}

/**
 * A rival for the first run (no recorded run yet): drives the route at the speed its corners allow, with a standing start,
 * braking for corners and slowing on climbs. Its lap is a fair target rather than a perfect one (BOT_SKILL).
 */
export function buildPaceBot(route: THREE.Vector3[], carLift: number, grade = 0.7): GhostTrace {
  const A_LAT = 10.5, V_TOP = 34, A_ACC = 7.5, A_BRAKE = 13, GRADE = grade, BOT_SKILL = 0.97, K = 6;
  const n = route.length, R = new Float32Array(n), slope = new Float32Array(n), ds = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = route[(i - K + n) % n], b = route[i], c = route[(i + K) % n], nx = route[(i + 1) % n];
    ds[i] = Math.hypot(nx.x - b.x, nx.z - b.z) || 0.01;
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    const area2 = Math.abs((b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z));
    R[i] = area2 > 1e-6 ? (ab * bc * ca) / (2 * area2) : 1e6;
    const p = route[(i + 4) % n], q = route[(i - 4 + n) % n];
    slope[i] = (p.y - q.y) / (Math.hypot(p.x - q.x, p.z - q.z) || 1);
  }
  const v2 = new Float32Array(n);
  for (let i = 0; i < n; i++) v2[i] = Math.min(V_TOP * V_TOP, A_LAT * R[i]);
  v2[0] = 0;
  for (let i = 0; i < n - 1; i++) v2[i + 1] = Math.min(v2[i + 1], v2[i] + 2 * Math.max(1.5, A_ACC - 9.8 * GRADE * slope[i]) * ds[i]);
  for (let i = n - 2; i >= 0; i--) v2[i] = Math.min(v2[i], v2[i + 1] + 2 * Math.max(6, A_BRAKE + 9.8 * GRADE * slope[i]) * ds[i]);
  const t = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) t[i + 1] = t[i] + ds[i] / Math.max(0.5, (Math.sqrt(v2[i]) + Math.sqrt(v2[i + 1])) / 2 * BOT_SKILL);
  const s: number[] = [];
  let i = 0;
  const total = t[n - 1];
  for (let ms = 0; ms / 1000 <= total; ms += SAMPLE_MS) {
    while (i < n - 2 && t[i + 1] < ms / 1000) i++;
    const u = Math.min(1, Math.max(0, (ms / 1000 - t[i]) / ((t[i + 1] - t[i]) || 1)));
    const a = route[i], b = route[i + 1], nx = route[Math.min(n - 1, i + 3)];
    s.push(round(a.x + (b.x - a.x) * u, 2), round(a.y + (b.y - a.y) * u + carLift, 2), round(a.z + (b.z - a.z) * u, 2), round(Math.atan2(nx.x - a.x, nx.z - a.z), 3), round((i + u) / n, 4));
  }
  const g = new GhostPlayer({ v: 1, timeMs: 0, carName: 'PACE BOT', date: '', kind: 'bot', s });
  return { v: 1, timeMs: g.timeAt(SECTOR_FRACTIONS[SECTOR_FRACTIONS.length - 1]) ?? total * 1000, carName: 'PACE BOT', date: '', kind: 'bot', s };
}

/** The ghost's body: a see-through copy of the player's car (no lights, no shadows), tinted. */
export class GhostCar {
  public readonly group: THREE.Group;

  constructor(source: THREE.Object3D, tint: number) {
    this.group = source.clone(true) as THREE.Group;
    const lights: THREE.Object3D[] = [];
    this.group.traverse((o) => {
      if (o instanceof THREE.Light) lights.push(o);
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        const mats = (Array.isArray(o.material) ? o.material : [o.material]).map((m: THREE.Material) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          c.transparent = true;
          c.opacity = 0.42;
          c.depthWrite = false;
          if ('emissive' in c) { c.emissive = new THREE.Color(tint); c.emissiveIntensity = 0.6; }
          return c;
        });
        o.material = Array.isArray(o.material) ? mats : mats[0];
      }
    });
    lights.forEach((l) => l.parent?.remove(l));
  }

  public place(pos: THREE.Vector3, rotY: number): void {
    this.group.position.copy(pos);
    this.group.rotation.set(0, rotY, 0, 'YXZ');
  }

  public dispose(): void {
    this.group.parent?.remove(this.group);
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m: THREE.Material) => m.dispose());
    });
  }
}
