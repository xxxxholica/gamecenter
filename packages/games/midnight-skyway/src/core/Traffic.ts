import * as THREE from 'three';
import { CarBase } from '../models/CarBase';
import { TrailJModel } from '../models/TrailJModel';
import { CrossJModel } from '../models/CrossJModel';
import { TruckJModel } from '../models/TruckJModel';
import { mergeMeshesByMaterial } from '../models/mergeMeshes';

/** NPCの配置・塗装に使う乱数。オンライン対戦では全員同じシードの乱数に差し替える(未設定=Math.random)。 */
let trafficRng: (() => number) | null = null;
export function setTrafficRng(rng: (() => number) | null): void { trafficRng = rng; }
const rand = (): number => (trafficRng ? trafficRng() : Math.random());

/** Everyday paint colours (body) — chosen at random per car. */
const PAINTS = [0xf4f4f2, 0xf4f4f2, 0x1b1c1f, 0x1b1c1f, 0xb9bcc0, 0x8a8d92, 0xb3202a, 0x1f4e9c, 0x2d6a4f, 0xe7b416, 0xd9641e, 0xd8c9a8, 0x5b3a29];
const ROOFS = [null, null, 0x1b1c1f, 0xf4f4f2];   // null = same as the body

/** One prototype per model, flattened into a few draw calls (wheels do not spin, so they are baked into the body meshes). */
const prototypes = new Map<string, CarBase>();
function prototype(kind: string): CarBase {
  let p = prototypes.get(kind);
  if (!p) {
    p = kind === 'trail' ? new TrailJModel() : kind === 'cross' ? new CrossJModel() : new TruckJModel();
    p.setLights(true);
    mergeMeshesByMaterial(p.group);
    // Each spawned NPC needs its own paint colour, so bodyMaterial/roofMaterial are cloned per car (spawn(), below) and
    // transparent parts (glass) are never merged by mergeMeshesByMaterial — a full traffic field still ends up as
    // ~1,900 individual meshes. Measured: giving them all castShadow cost ~2ms/frame (~35% of frame time) for shadow
    // patches under fast-moving cars that are barely visible, so it's reverted; the player's own car still casts one.
    p.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
    prototypes.set(kind, p);
  }
  return p;
}

interface NpcCar {
  obj: THREE.Group;
  s: number;
  speed: number;
  baseSpeed: number;
  lateral: number;
  isForward: boolean;
  hazardTimer?: number;
  hazardBlink?: boolean;
}

export interface TrafficCollisionResult {
  hit: boolean;
  pushX: number;
  pushZ: number;
  speedFactor: number;
  impact: number;
  isRearEnd: boolean;
}

export interface TrafficOptions {
  oppositeRoute?: THREE.Vector3[];
  oppositeCount?: number;
  oppositeLaneSpeeds?: [number, number];
  forwardRoute?: THREE.Vector3[];
  forwardCount?: number;
  forwardLaneSpeeds?: [number, number];
}

/**
 * Traffic management:
 * 1. Opposite carriageway (visual only, high relative speed).
 * 2. Same-lane Forward Traffic (High density, diverse variable speeds from 48 to 100+ km/h,
 *    equipped with adaptive cruise / anti-pileup follower logic so cars maintain natural highway spacing).
 */
export class Traffic {
  public readonly group = new THREE.Group();
  private cars: NpcCar[] = [];

  // Opposite route arcs
  private oppRoute: THREE.Vector3[] = [];
  private oppArcs: number[] = [0];
  private oppTotal = 0;

  // Forward route arcs
  private fwdRoute: THREE.Vector3[] = [];
  private fwdArcs: number[] = [0];
  private fwdTotal = 0;

  private readonly showDistance = 450;

  /**
   * 共有時計(オンライン対戦): 設定すると dt を使わず、レース開始からの秒数(負=開始前)に合わせて固定刻みで進める。
   * 全員の交通NPCがほぼ同じ位置・速度になる(フレームレートに依存しない)。
   */
  public sharedClock: (() => number) | null = null;
  private simTime = 0;
  private static readonly STEP = 1 / 60;

  constructor(roadWidth: number, options: TrafficOptions) {
    this.group.name = 'traffic';
    const kinds = ['trail', 'cross', 'truck'];

    // 1. Setup Opposite Route Traffic
    if (options.oppositeRoute && options.oppositeRoute.length > 0) {
      this.oppRoute = options.oppositeRoute;
      const n = this.oppRoute.length;
      for (let i = 1; i <= n; i++) {
        this.oppArcs.push(this.oppArcs[i - 1] + Math.hypot(this.oppRoute[i % n].x - this.oppRoute[i - 1].x, this.oppRoute[i % n].z - this.oppRoute[i - 1].z));
      }
      this.oppTotal = this.oppArcs[n];

      const count = options.oppositeCount ?? Math.round(this.oppTotal / 250);
      const laneSpeeds = options.oppositeLaneSpeeds ?? [27, 21];

      for (let k = 0; k < count; k++) {
        const lane = k % 2;
        const kind = kinds[Math.floor(rand() * kinds.length)];
        const car = this.spawn(prototype(kind));
        this.cars.push({
          obj: car,
          s: ((k + rand() * 0.6) / count) * this.oppTotal,
          speed: laneSpeeds[lane],
          baseSpeed: laneSpeeds[lane],
          lateral: (lane === 0 ? 1 : -1) * roadWidth * 0.25,
          isForward: false,
        });
        this.group.add(car);
      }
    }

    // 2. Setup Forward (Same Lane) Traffic Obstacles with Diverse Speeds
    if (options.forwardRoute && options.forwardRoute.length > 0) {
      this.fwdRoute = options.forwardRoute;
      const n = this.fwdRoute.length;
      for (let i = 1; i <= n; i++) {
        this.fwdArcs.push(this.fwdArcs[i - 1] + Math.hypot(this.fwdRoute[i % n].x - this.fwdRoute[i - 1].x, this.fwdRoute[i % n].z - this.fwdRoute[i - 1].z));
      }
      this.fwdTotal = this.fwdArcs[n];

      // Generous high-density forward count
      const count = options.forwardCount ?? Math.max(16, Math.round(this.fwdTotal / 80));
      const maxHalf = roadWidth * 0.5 - 1.2; // Maximum safe lateral offset within barriers

      for (let k = 0; k < count; k++) {
        // Distribute across 4 distinct lateral bands (Left Outer, Left Inner, Right Inner, Right Outer)
        // plus continuous jitter to thoroughly spread cars laterally across the entire road width
        const band = k % 4;
        let lateral: number;
        let baseSpeed: number;

        if (band === 0) {
          // Left Outer (Gutter / Slow cruising lane)
          lateral = maxHalf * (0.62 + rand() * 0.26);
          const isTruck = rand() < 0.6;
          const kind = isTruck ? 'truck' : kinds[Math.floor(rand() * kinds.length)];
          const car = this.spawn(prototype(kind));
          baseSpeed = isTruck ? 13.8 + rand() * 2.8 : 16.5 + rand() * 3.0; // 50~70 km/h

          // Staggered longitudinal position (No two cars side-by-side)
          const step = (this.fwdTotal - 60) / count;
          const s = (60 + k * step + (rand() - 0.5) * step * 0.7) % this.fwdTotal;

          this.cars.push({ obj: car, s, speed: baseSpeed, baseSpeed, lateral, isForward: true, hazardTimer: 0 });
          this.group.add(car);
        } else if (band === 1) {
          // Left Inner (Mid-left cruising lane)
          lateral = maxHalf * (0.16 + rand() * 0.28);
          const kind = kinds[Math.floor(rand() * kinds.length)];
          const car = this.spawn(prototype(kind));
          baseSpeed = 17.5 + rand() * 3.5; // 63~76 km/h

          const step = (this.fwdTotal - 60) / count;
          const s = (60 + k * step + (rand() - 0.5) * step * 0.7) % this.fwdTotal;

          this.cars.push({ obj: car, s, speed: baseSpeed, baseSpeed, lateral, isForward: true, hazardTimer: 0 });
          this.group.add(car);
        } else if (band === 2) {
          // Right Inner (Mid-right passing lane)
          lateral = -maxHalf * (0.16 + rand() * 0.28);
          const kind = kinds[Math.floor(rand() * kinds.length)];
          const car = this.spawn(prototype(kind));
          baseSpeed = 21.0 + rand() * 4.5; // 75~92 km/h

          const step = (this.fwdTotal - 60) / count;
          const s = (60 + k * step + (rand() - 0.5) * step * 0.7) % this.fwdTotal;

          this.cars.push({ obj: car, s, speed: baseSpeed, baseSpeed, lateral, isForward: true, hazardTimer: 0 });
          this.group.add(car);
        } else {
          // Right Outer (Fast lane / wall side)
          lateral = -maxHalf * (0.62 + rand() * 0.26);
          const isTruck = rand() < 0.15;
          const kind = isTruck ? 'truck' : kinds[Math.floor(rand() * kinds.length)];
          const car = this.spawn(prototype(kind));
          baseSpeed = 24.0 + rand() * 4.5; // 86~102 km/h

          const step = (this.fwdTotal - 60) / count;
          const s = (60 + k * step + (rand() - 0.5) * step * 0.7) % this.fwdTotal;

          this.cars.push({ obj: car, s, speed: baseSpeed, baseSpeed, lateral, isForward: true, hazardTimer: 0 });
          this.group.add(car);
        }
      }
    }
  }

  /** Clone of a prototype with its own randomly chosen paint. */
  private spawn(proto: CarBase): THREE.Group {
    const obj = proto.group.clone(true);
    const body = proto.bodyMaterial.clone(), roof = proto.roofMaterial.clone();
    const paint = PAINTS[Math.floor(rand() * PAINTS.length)], rf = ROOFS[Math.floor(rand() * ROOFS.length)];
    body.color.setHex(paint);
    roof.color.setHex(rf ?? paint);
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.material === proto.bodyMaterial) o.material = body;
      else if (o.material === proto.roofMaterial) o.material = roof;
    });
    return obj;
  }

  private sampleOpposite(s: number, out: THREE.Vector3): void {
    const t = ((s % this.oppTotal) + this.oppTotal) % this.oppTotal;
    let lo = 0, hi = this.oppArcs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.oppArcs[m] <= t) lo = m; else hi = m; }
    const a = this.oppRoute[lo % this.oppRoute.length], b = this.oppRoute[(lo + 1) % this.oppRoute.length];
    const f = (t - this.oppArcs[lo]) / Math.max(1e-6, this.oppArcs[lo + 1] - this.oppArcs[lo]);
    out.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
  }

  private sampleForward(s: number, out: THREE.Vector3): void {
    const t = ((s % this.fwdTotal) + this.fwdTotal) % this.fwdTotal;
    let lo = 0, hi = this.fwdArcs.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.fwdArcs[m] <= t) lo = m; else hi = m; }
    const a = this.fwdRoute[lo % this.fwdRoute.length], b = this.fwdRoute[(lo + 1) % this.fwdRoute.length];
    const f = (t - this.fwdArcs[lo]) / Math.max(1e-6, this.fwdArcs[lo + 1] - this.fwdArcs[lo]);
    out.set(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f);
  }

  private readonly p0 = new THREE.Vector3();
  private readonly p1 = new THREE.Vector3();
  private readonly p2 = new THREE.Vector3();

  public update(dt: number, player: THREE.Vector3): void {
    if (this.sharedClock) {
      const target = this.sharedClock();
      let steps = 0;
      while (this.simTime + Traffic.STEP <= target && steps < 180) {
        this.advance(Traffic.STEP);
        this.simTime += Traffic.STEP;
        steps++;
      }
      if (steps === 180) this.simTime = target;   // タブ停止などで大きく遅れた時は追いかけずに時計だけ合わせる
    } else {
      this.advance(dt);
    }
    this.place(player);
  }

  /** NPCの速度調整と走行距離を dt だけ進める。 */
  private advance(dt: number): void {
    const forwardCars = this.cars.filter((c) => c.isForward);

    // 1. Adaptive Cruise Control / Anti-pileup for diverse speed NPC traffic
    if (this.fwdTotal > 0 && forwardCars.length > 1) {
      for (let i = 0; i < forwardCars.length; i++) {
        const c = forwardCars[i];
        let closestDist = Infinity;
        let leadingSpeed = c.baseSpeed;

        for (let j = 0; j < forwardCars.length; j++) {
          if (i === j) continue;
          const other = forwardCars[j];

          // Check if directly in the same narrow lateral corridor (< 1.35m)
          if (Math.abs(c.lateral - other.lateral) < 1.35) {
            // Distance ahead along route
            let distAhead = other.s - c.s;
            if (distAhead < 0) distAhead += this.fwdTotal;

            if (distAhead > 1.0 && distAhead < closestDist) {
              closestDist = distAhead;
              leadingSpeed = other.speed;
            }
          }
        }

        // Adjust speed based on vehicle ahead
        if (closestDist < 12.0) {
          // Too close: match speed and brake slightly
          const target = Math.min(c.baseSpeed, Math.max(12.0, leadingSpeed * 0.94));
          c.speed = THREE.MathUtils.lerp(c.speed, target, Math.min(1.0, dt * 5.0));
        } else if (closestDist < 26.0) {
          // Smooth following distance
          const target = Math.min(c.baseSpeed, leadingSpeed);
          c.speed = THREE.MathUtils.lerp(c.speed, target, Math.min(1.0, dt * 2.5));
        } else {
          // Open road ahead: smoothly accelerate back to natural base cruising speed
          c.speed = THREE.MathUtils.lerp(c.speed, c.baseSpeed, Math.min(1.0, dt * 1.8));
        }
      }
    }

    for (const c of this.cars) {
      const total = c.isForward ? this.fwdTotal : this.oppTotal;
      if (total <= 0) continue;
      c.s = (c.s + c.speed * dt) % total;
    }
  }

  /** 現在の走行距離からNPCの位置・向きを反映する(プレイヤーから遠いものは非表示)。 */
  private place(player: THREE.Vector3): void {
    for (const c of this.cars) {
      const total = c.isForward ? this.fwdTotal : this.oppTotal;
      if (total <= 0) continue;

      if (c.isForward) {
        this.sampleForward(c.s, this.p0);
      } else {
        this.sampleOpposite(c.s, this.p0);
      }

      const dx = this.p0.x - player.x, dz = this.p0.z - player.z;
      c.obj.visible = dx * dx + dz * dz < this.showDistance * this.showDistance;
      if (!c.obj.visible) continue;

      if (c.isForward) {
        this.sampleForward(c.s - 3, this.p1);
        this.sampleForward(c.s + 3, this.p2);
      } else {
        this.sampleOpposite(c.s - 3, this.p1);
        this.sampleOpposite(c.s + 3, this.p2);
      }

      const tx = this.p2.x - this.p1.x, tz = this.p2.z - this.p1.z, len = Math.hypot(tx, tz) || 1;
      const yaw = Math.atan2(tx, tz), pitch = -Math.atan2(this.p2.y - this.p1.y, len);
      // lateral offset: + = driver's right (normal (-tz, tx))
      c.obj.position.set(this.p0.x - (tz / len) * c.lateral, this.p0.y + 0.1, this.p0.z + (tx / len) * c.lateral);
      c.obj.rotation.set(pitch, yaw, 0, 'YXZ');
    }
  }

  /**
   * Checks collision between player car and forward-driving traffic obstacles.
   * Player car size: approx 1.6m wide, 3.4m long.
   */
  public checkPlayerCollision(
    playerPos: THREE.Vector3,
    _playerRotY: number,
    playerSpeed: number
  ): TrafficCollisionResult {
    const result: TrafficCollisionResult = {
      hit: false,
      pushX: 0,
      pushZ: 0,
      speedFactor: 1.0,
      impact: 0,
      isRearEnd: false,
    };

    const CAR_HALF_W = 0.85;
    const CAR_HALF_L = 1.75;

    for (const c of this.cars) {
      if (!c.isForward || !c.obj.visible) continue;

      const npcPos = c.obj.position;
      const dx = playerPos.x - npcPos.x;
      const dz = playerPos.z - npcPos.z;
      const distSq = dx * dx + dz * dz;

      // Quick broadphase reject
      if (distSq > 5.5 * 5.5) continue;

      // NPC local coordinate transform
      const npcFwd = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.obj.rotation.y);
      const npcRight = new THREE.Vector3(npcFwd.z, 0, -npcFwd.x);

      // Vector from NPC to player in NPC's local space
      const localZ = dx * npcFwd.x + dz * npcFwd.z;       // longitudinal: + = player in front, - = player behind
      const localX = dx * npcRight.x + dz * npcRight.z;   // lateral: + = player to right, - = player to left

      const overlapX = (CAR_HALF_W * 2) - Math.abs(localX);
      const overlapZ = (CAR_HALF_L * 2) - Math.abs(localZ);

      if (overlapX > 0 && overlapZ > 0) {
        result.hit = true;

        if (overlapZ < overlapX) {
          // Longitudinal collision (Rear-end or head-on)
          result.isRearEnd = localZ < 0; // Player is behind NPC (rear-ended the NPC)
          const pushDist = overlapZ + 0.15;
          const sign = localZ < 0 ? -1 : 1;
          result.pushX += npcFwd.x * sign * pushDist;
          result.pushZ += npcFwd.z * sign * pushDist;

          // Heavy deceleration penalty for rear-ending other traffic
          const relSpeed = Math.max(0, playerSpeed - c.speed);
          result.impact = Math.min(1.0, relSpeed / 15.0 + 0.3);
          result.speedFactor = Math.min(result.speedFactor, Math.max(0.3, c.speed / Math.max(1, playerSpeed) * 0.7));
        } else {
          // Side scrape
          const pushDist = overlapX + 0.1;
          const sign = localX < 0 ? -1 : 1;
          result.pushX += npcRight.x * sign * pushDist;
          result.pushZ += npcRight.z * sign * pushDist;

          result.impact = Math.max(result.impact, 0.4);
          result.speedFactor = Math.min(result.speedFactor, 0.65);
        }

        // Destabilize the hit NPC vehicle (knockback, stumble, speed drop)
        c.speed = Math.max(6, c.speed * 0.7);
        c.lateral += (localX > 0 ? -0.45 : 0.45) * result.impact;
        c.obj.rotation.y += (localX > 0 ? -0.14 : 0.14) * result.impact;
      }
    }

    return result;
  }

  /**
   * Returns positions of forward traffic cars for HUD minimap display.
   */
  public getForwardCarPositions(): THREE.Vector2[] {
    const list: THREE.Vector2[] = [];
    for (const c of this.cars) {
      if (c.isForward) {
        list.push(new THREE.Vector2(c.obj.position.x, c.obj.position.z));
      }
    }
    return list;
  }

  /**
   * Returns positions of opposite traffic cars for HUD minimap display.
   */
  public getOppositeCarPositions(): THREE.Vector2[] {
    const list: THREE.Vector2[] = [];
    for (const c of this.cars) {
      if (!c.isForward) {
        list.push(new THREE.Vector2(c.obj.position.x, c.obj.position.z));
      }
    }
    return list;
  }
}
