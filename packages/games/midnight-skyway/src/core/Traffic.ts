import * as THREE from 'three';
import { CarBase } from '../models/CarBase';
import { TrailJModel } from '../models/TrailJModel';
import { CrossJModel } from '../models/CrossJModel';
import { mergeMeshesByMaterial } from '../models/mergeMeshes';
import { buildFarVariant, buildUltraFarVariant } from '../models/npcLod';

/** NPCの配置・塗装に使う乱数。オンライン対戦では全員同じシードの乱数に差し替える(未設定=Math.random)。 */
let trafficRng: (() => number) | null = null;
export function setTrafficRng(rng: (() => number) | null): void { trafficRng = rng; }
const rand = (): number => (trafficRng ? trafficRng() : Math.random());

/** Everyday paint colours (body) — chosen at random per car. */
const PAINTS = [0xf4f4f2, 0xf4f4f2, 0x1b1c1f, 0x1b1c1f, 0xb9bcc0, 0x8a8d92, 0xb3202a, 0x1f4e9c, 0x2d6a4f, 0xe7b416, 0xd9641e, 0xd8c9a8, 0x5b3a29];
const ROOFS = [null, null, 0x1b1c1f, 0xf4f4f2];   // null = same as the body

/** この距離(m)より遠いNPC車は、ホイールなどを省いた簡易モデルで描く(THREE.LOD)。 */
const LOD_FAR_DIST = 40;
/** この距離(m)より遠いNPC車は、さらに数メッシュだけの簡易モデルで描く(npcLod.ts の buildUltraFarVariant)。 */
const LOD_ULTRA_DIST = 150;

interface NpcPrototype {
  /** 近距離用(従来のモデル)。 */
  near: CarBase;
  /** 遠距離用の簡易モデル(ホイール簡略・小部品なし・ガラスは不透明)。塗装の素材は far 側の別インスタンス。 */
  far: CarBase;
  /** とても遠い距離用(塗装・ライト・暗い部分の数メッシュだけ)。 */
  ultra: CarBase;
}

/** One prototype per model, flattened into a few draw calls (wheels do not spin, so they are baked into the body meshes). */
const prototypes = new Map<string, NpcPrototype>();
function makeModel(kind: string): CarBase {
  return kind === 'trail' ? new TrailJModel() : new CrossJModel();
}
function prototype(kind: string): NpcPrototype {
  let p = prototypes.get(kind);
  if (!p) {
    const near = makeModel(kind);
    near.setLights(true);
    mergeMeshesByMaterial(near.group, { pruneEmpty: true });
    const far = makeModel(kind);
    far.setLights(true);
    buildFarVariant(far);
    const ultra = makeModel(kind);
    ultra.setLights(true);
    buildUltraFarVariant(ultra);
    // Each spawned NPC needs its own paint colour, so bodyMaterial/roofMaterial are cloned per car (spawn(), below) and
    // transparent parts (glass) are never merged by mergeMeshesByMaterial — a full traffic field still ends up as
    // ~1,900 individual meshes. Measured: giving them all castShadow cost ~2ms/frame (~35% of frame time) for shadow
    // patches under fast-moving cars that are barely visible, so it's reverted; the player's own car still casts one.
    for (const m of [near, far, ultra]) {
      m.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.castShadow = false; o.receiveShadow = false; } });
    }
    // 透明で両面の素材(ガラス)を three.js は、裏面 → 表面の2回に分けて描き、そのたびに素材の更新(needsUpdate)でシェーダの照合をやり直す。
    // 見えているNPC車のガラスだけで、1フレームに十数回(計測: 5秒で約9,000回)。不透明度 0.1 のガラスは、1回で描いても見分けがつかない。
    for (const m of [near, far, ultra]) {
      m.group.traverse((o) => {
        const mat = o instanceof THREE.Mesh ? (o.material as THREE.Material | THREE.Material[]) : null;
        for (const x of Array.isArray(mat) ? mat : mat ? [mat] : []) if (x.transparent && x.side === THREE.DoubleSide) x.forceSinglePass = true;
      });
    }
    p = { near, far, ultra };
    prototypes.set(kind, p);
  }
  return p;
}

/** この距離(m)より近いNPC車だけ、影を落とす。離れる時は少し遠くまで保つ。 */
const SHADOW_ON_DIST = 55;
const SHADOW_OFF_DIST = 70;

export interface NpcCar {
  obj: THREE.Object3D;
  s: number;
  speed: number;
  baseSpeed: number;
  lateral: number;
  isForward: boolean;
  kind?: string;
  hazardTimer?: number;
  hazardBlink?: boolean;
  /** 衝突でレーンから弾かれた時の復帰先(最初の衝突時に記録) */
  baseLateral?: number;
  /** 横方向に弾かれる速度(m/s)。指数的に減衰する */
  lateralVel?: number;
  /** 衝突で一瞬ふらつく向きのずれ(rad)。減衰する */
  yawKick?: number;
  /** 同じ接触で毎フレーム減速・ふらつきが重ならないための待ち時間(秒) */
  hitCooldown?: number;
  /** 今、影を落とす設定になっているか(近くの車だけ true) */
  shadowOn?: boolean;
}

export interface TrafficCollisionResult {
  hit: boolean;
  pushX: number;
  pushZ: number;
  speedFactor: number;
  impact: number;
  isRearEnd: boolean;
  /** プレイヤーが弾かれる速度(m/s, ワールドXZ)。接触の初回だけ入る */
  knockX: number;
  knockZ: number;
  /** 後ろから当てられた時の前方への押し出し(m/s, 速度に加算) */
  speedAdd: number;
  /** 進行方向(車の向き)を乱す量。横からの接触は0(まっすぐ走り続けられる)、追突は小さく入る。 */
  turn: number;
  /** この接触が新規(クールダウン明け)か。回転・ロール等の揺れは新規の時だけ与える */
  fresh: boolean;
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
  public cars: NpcCar[] = [];
  private readonly forwardCars: NpcCar[] = [];
  private readonly forwardPositions: THREE.Vector2[] = [];

  // Opposite route arcs
  private oppRoute: THREE.Vector3[] = [];
  private oppArcs: number[] = [0];
  private oppTotal = 0;

  // Forward route arcs
  private fwdRoute: THREE.Vector3[] = [];
  private fwdArcs: number[] = [0];
  private fwdTotal = 0;

  /** この距離(m)より遠いNPCは描かない。霧で見えなくなる距離に合わせる(setFogDensity)。短いと、霧の薄いコースで遠くの車が突然現れる。 */
  private showDistance = 450;

  /** FogExp2 の濃度から、霧で見えなくなる(透過率およそ2%)距離を表示距離にする。 */
  public setFogDensity(density: number, viewDistance = 2000): void {
    const hidden = Math.sqrt(Math.log(50)) / Math.max(1e-6, density);
    this.showDistance = Math.min(viewDistance, Math.max(450, hidden));
  }

  /**
   * 共有時計(オンライン対戦): 設定すると dt を使わず、レース開始からの秒数(負=開始前)に合わせて固定刻みで進める。
   * 全員の交通NPCがほぼ同じ位置・速度になる(フレームレートに依存しない)。
   */
  public sharedClock: (() => number) | null = null;
  private simTime = 0;
  private static readonly STEP = 1 / 60;

  constructor(roadWidth: number, options: TrafficOptions) {
    this.group.name = 'traffic';
    const kinds = ['trail', 'cross'];

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
      for (const c of this.cars) {
        if (c.isForward) {
          this.forwardCars.push(c);
          this.forwardPositions.push(new THREE.Vector2());
        }
      }
    }
  }

  /** Clone of a prototype with its own randomly chosen paint. 近距離用と遠距離用の2段階(THREE.LOD)。塗装の素材は両方で共有する。 */
  private spawn(proto: NpcPrototype): THREE.Object3D {
    const { near, far, ultra } = proto;
    const body = near.bodyMaterial.clone(), roof = near.roofMaterial.clone();
    const paint = PAINTS[Math.floor(rand() * PAINTS.length)], rf = ROOFS[Math.floor(rand() * ROOFS.length)];
    body.color.setHex(paint);
    roof.color.setHex(rf ?? paint);
    const level = (src: CarBase): THREE.Object3D => {
      const obj = src.group.clone(true);
      obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (o.material === src.bodyMaterial) o.material = body;
        else if (o.material === src.roofMaterial) o.material = roof;
      });
      return obj;
    };
    const lod = new THREE.LOD();
    lod.addLevel(level(near), 0);
    lod.addLevel(level(far), LOD_FAR_DIST, 0.1);
    lod.addLevel(level(ultra), LOD_ULTRA_DIST, 0.1);
    return lod;
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
    const forwardCars = this.forwardCars;

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
      if (c.hitCooldown && c.hitCooldown > 0) c.hitCooldown -= dt;
      // 弾かれた分を横に滑らせ、少しずつ元のレーンへ戻す
      if (c.lateralVel) {
        c.lateral += c.lateralVel * dt;
        c.lateralVel *= Math.exp(-5 * dt);
        if (Math.abs(c.lateralVel) < 0.02) c.lateralVel = 0;
      }
      if (c.baseLateral !== undefined && !c.lateralVel) {
        c.lateral += (c.baseLateral - c.lateral) * Math.min(1, dt * 0.8);
      }
      if (c.yawKick) {
        c.yawKick *= Math.exp(-3 * dt);
        if (Math.abs(c.yawKick) < 0.005) c.yawKick = 0;
      }
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
      const d2 = dx * dx + dz * dz;
      c.obj.visible = d2 < this.showDistance * this.showDistance;
      if (!c.obj.visible) continue;
      // 近くの車だけ影を落とす(全車だと負荷が大きい)。出入りで点滅しないよう、入る距離と出る距離をずらす
      const wantShadow = c.shadowOn ? d2 < SHADOW_OFF_DIST * SHADOW_OFF_DIST : d2 < SHADOW_ON_DIST * SHADOW_ON_DIST;
      if (wantShadow !== !!c.shadowOn) {
        c.shadowOn = wantShadow;
        c.obj.traverse((o) => { if (o instanceof THREE.Mesh && o.material && !(o.material as THREE.Material).transparent) o.castShadow = wantShadow; });
      }

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
      c.obj.rotation.set(pitch, yaw + (c.yawKick ?? 0), 0, 'YXZ');
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
      knockX: 0,
      knockZ: 0,
      speedAdd: 0,
      turn: 0,
      fresh: false,
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
      // (0,0,1) を Y軸まわりに回した向き。Vector3 を作らずに三角関数で直接求める
      const fwdX = Math.sin(c.obj.rotation.y);
      const fwdZ = Math.cos(c.obj.rotation.y);
      const rightX = fwdZ;
      const rightZ = -fwdX;

      // Vector from NPC to player in NPC's local space
      const localZ = dx * fwdX + dz * fwdZ;       // longitudinal: + = player in front, - = player behind
      const localX = dx * rightX + dz * rightZ;   // lateral: + = player to right, - = player to left

      const overlapX = (CAR_HALF_W * 2) - Math.abs(localX);
      const overlapZ = (CAR_HALF_L * 2) - Math.abs(localZ);

      if (overlapX > 0 && overlapZ > 0) {
        result.hit = true;

        if (overlapZ < overlapX) {
          // Longitudinal collision (Rear-end or head-on)
          result.isRearEnd = localZ < 0; // Player is behind NPC (rear-ended the NPC)
          const pushDist = overlapZ + 0.15;
          const sign = localZ < 0 ? -1 : 1;
          result.pushX += fwdX * sign * pushDist;
          result.pushZ += fwdZ * sign * pushDist;

          // Heavy deceleration penalty for rear-ending other traffic
          const relSpeed = Math.max(0, playerSpeed - c.speed);
          result.impact = Math.min(1.0, relSpeed / 15.0 + 0.3);
          result.turn = Math.max(result.turn, result.impact * 0.3);
          result.speedFactor = Math.min(result.speedFactor, Math.max(0.3, c.speed / Math.max(1, playerSpeed) * 0.7));
        } else {
          // Side scrape
          const pushDist = overlapX + 0.1;
          const sign = localX < 0 ? -1 : 1;
          result.pushX += rightX * sign * pushDist;
          result.pushZ += rightZ * sign * pushDist;

          // 横からの接触はこすっただけ: 速度は少し落ちるだけで、向きは変えない(横へ弾かれるだけ)
          result.impact = Math.max(result.impact, 0.4);
          result.speedFactor = Math.min(result.speedFactor, 0.93);
        }

        // 接触の初回だけ、はっきり弾く(毎フレーム減速・ふらつきを重ねない)
        if (!c.hitCooldown || c.hitCooldown <= 0) {
          c.hitCooldown = 0.4;
          result.fresh = true;
          const impact = result.impact;
          const relSpeed = Math.abs(playerSpeed - c.speed);
          const awaySign = localX > 0 ? -1 : 1;                   // NPC側から見て、プレイヤーと反対へ
          if (overlapZ < overlapX) {
            // 前後の衝突: 当てた側は止まり、当てられた側は押し出される
            const sign = localZ < 0 ? -1 : 1;
            result.knockX += fwdX * sign * (2 + impact * 8);
            result.knockZ += fwdZ * sign * (2 + impact * 8);
            if (localZ < 0) {
              // プレイヤーが後ろから追突: NPCは前へ押し出される
              c.speed = Math.min(c.baseSpeed * 1.35, c.speed + relSpeed * 0.4);
            } else {
              // NPCが後ろから追突: プレイヤーが前へ押し出され、NPCは減速する
              result.speedAdd += Math.min(8, relSpeed * 0.4 + 2);
              c.speed = Math.max(6, c.speed * 0.6);
            }
          } else {
            // 横からの接触: 双方が横へ弾かれる
            result.knockX += rightX * -awaySign * (3 + impact * 6);
            result.knockZ += rightZ * -awaySign * (3 + impact * 6);
            c.speed = Math.max(6, c.speed * 0.85);
          }
          c.baseLateral ??= c.lateral;
          c.lateralVel = (c.lateralVel ?? 0) + awaySign * (2.5 + impact * 5);
          c.yawKick = awaySign * Math.min(0.4, 0.15 + impact * 0.3);
        }
      }
    }

    return result;
  }

  /**
   * Returns positions of forward traffic cars for HUD minimap display.
   */
  public getForwardCarPositions(): THREE.Vector2[] {
    for (let i = 0; i < this.forwardCars.length; i++) {
      const p = this.forwardCars[i].obj.position;
      this.forwardPositions[i].set(p.x, p.z);
    }
    return this.forwardPositions;
  }

}
