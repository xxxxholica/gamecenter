import * as THREE from 'three';
import type { CarController } from './CarController';

/**
 * ゴールの演出のカメラ。
 *  - gate: ゴールの瞬間。ゲートの少し先の路肩に低く据えたカメラが、スローモーションで砕けた旗の中を抜けてくる車を追う
 *  - そのあとのウィニングラン(リザルト表示中): 正面 → 斜め前 → 上昇するドローン → 路肩の据え置き → 回り込み、を切り替えて映す
 * カメラは道路の幅の内側に収める(壁・谷・建物にめり込まない)。屋根のある区間(トンネル・洞門)では、ドローンを使わない。
 */
type Shot = 'gate' | 'front' | 'side' | 'drone' | 'trackside' | 'orbit';
const CINEMATIC: Shot[] = ['front', 'side', 'drone', 'trackside', 'orbit'];
/** 1カットの長さ(秒) */
const SHOT_SEC = 4.5;
/** ドローンのカメラが目標の位置を追う速さ(1/秒)。経路の点(約2m間隔)で決まる位置を、そのまま使うとカクカク跳ぶ */
const DRONE_FOLLOW = 2.5;

export class FinishCamera {
  private shot: Shot = 'gate';
  private t = 0;                                   // 今のカットの経過(実時間の秒)
  private next = 0;                                // 次に使うカットの番号
  private idx = 0;                                 // 車のいる経路点(前回の近くだけ探す)
  private side = 1;                                // カメラを置く側(+1 = 進行方向の右)
  private readonly anchor = new THREE.Vector3();   // 据え置きのカメラの位置(gate・trackside)
  private readonly drone = new THREE.Vector3();    // ドローンの今の位置(目標をなめらかに追う)
  private droneReady = false;
  private orbit0 = 0;
  private readonly pos = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly fwd = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly spacing: number;

  /**
   * @param route  走行ルートの点(約2m間隔の閉じた輪)
   * @param half   路面の幅の半分(m)
   * @param roofed その経路点の上に屋根(トンネル・洞門)があるか
   */
  constructor(private readonly route: THREE.Vector3[], private readonly half: number, private readonly roofed: (i: number) => boolean) {
    const n = route.length;
    let len = 0;
    for (let i = 1; i < n; i++) len += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    this.spacing = len / Math.max(1, n - 1);
  }

  /** ウィニングランのカットに入っているか(gate の間は false) */
  public get cinematic(): boolean { return this.shot !== 'gate'; }

  /** ゴールの瞬間: ゲートの約14m先、車と反対側の路肩にカメラを据える */
  public startGate(car: CarController): void {
    this.locate(car, true);
    this.side = -this.carSide(car);
    this.frameAt(this.idx + this.steps(14));
    this.anchor.copy(this.route[this.wrap(this.idx + this.steps(14))]).addScaledVector(this.right, this.side * (this.half - 0.9));
    this.anchor.y += 0.7;
    this.shot = 'gate';
    this.t = 0;
  }

  /** リザルト表示とともに、ウィニングランのカットを順に映し始める */
  public startCinematic(car: CarController): void {
    this.next = 0;
    this.cut(car);
  }

  /** カメラを置く。dt は実時間(スローモーションの影響を受けない) */
  public update(dt: number, car: CarController, camera: THREE.PerspectiveCamera): void {
    this.locate(car, false);
    this.t += dt;
    if (this.shot !== 'gate' && (this.t >= SHOT_SEC || (this.shot === 'trackside' && this.passed(car)))) this.cut(car);

    const p = car.position;
    const heading = car.rotationY;
    const cf = this.fwd.set(Math.sin(heading), 0, Math.cos(heading));
    const cr = this.right.set(-cf.z, 0, cf.x);   // 車の右
    let fov = 50;
    switch (this.shot) {
      case 'gate': {
        this.pos.copy(this.anchor);
        this.look.set(p.x, p.y + 0.7, p.z);
        fov = 42;
        break;
      }
      case 'front': {
        const sway = Math.sin(this.t * 0.5) * 0.25;
        const a = heading + sway;
        // リザルトが画面の下半分に大きく出るので、車は少し離れて小さめに(画面全体は上へずらしてある)
        this.pos.set(p.x + Math.sin(a) * 8.5, p.y + 1.8, p.z + Math.cos(a) * 8.5);
        this.look.set(p.x, p.y + 0.8, p.z);
        break;
      }
      case 'side': {
        // 斜め前(翼の大きな車でも、車体が翼に隠れない高さ)
        this.pos.copy(p).addScaledVector(cr, this.side * 5.0).addScaledVector(cf, 8.0);
        this.pos.y += 2.2;
        this.look.copy(p).addScaledVector(cf, 0.5);
        this.look.y += 0.7;
        fov = 48;
        break;
      }
      case 'drone': {
        const u = Math.min(1, this.t / SHOT_SEC);
        const e = u * u * (3 - 2 * u);
        // 目標: 車の後ろの道路の真上(建物や壁にめり込まない)。そこへなめらかに寄せる
        this.pos.copy(this.route[this.wrap(this.idx - this.steps(10 + 14 * e))]);
        this.pos.y = p.y + 4 + 24 * e;
        if (!this.droneReady) { this.drone.copy(this.pos); this.droneReady = true; }
        else this.drone.lerp(this.pos, 1 - Math.exp(-DRONE_FOLLOW * dt));
        this.pos.copy(this.drone);
        this.look.set(p.x, p.y + 0.6, p.z);
        fov = 55;
        break;
      }
      case 'trackside': {
        this.pos.copy(this.anchor);
        this.look.set(p.x, p.y + 0.6, p.z);
        const d = this.pos.distanceTo(this.look);
        fov = THREE.MathUtils.clamp(2 * Math.atan(5 / Math.max(1, d)) * THREE.MathUtils.RAD2DEG, 18, 50);   // 車がおおよそ同じ大きさに映る
        break;
      }
      case 'orbit': {
        const a = this.orbit0 + this.t * 0.35;
        this.pos.set(p.x + Math.sin(a) * 8.5, p.y + 1.6, p.z + Math.cos(a) * 8.5);
        this.look.set(p.x, p.y + 0.7, p.z);
        fov = 52;
        break;
      }
    }
    if (this.shot !== 'gate' && this.shot !== 'trackside' && this.shot !== 'drone') this.keepOnRoad(this.pos);
    camera.position.copy(this.pos);
    camera.lookAt(this.look);
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }

  /** 次のカットへ(屋根のある区間ではドローンを飛ばす) */
  private cut(car: CarController): void {
    let shot = CINEMATIC[this.next % CINEMATIC.length];
    this.next++;
    if (shot === 'drone' && this.roofedAhead(this.steps(120))) {
      shot = CINEMATIC[this.next % CINEMATIC.length];
      this.next++;
    }
    this.shot = shot;
    this.t = 0;
    this.droneReady = false;
    this.side = -this.carSide(car);
    if (shot === 'trackside') {
      const ahead = this.idx + this.steps(55);
      this.frameAt(ahead);
      this.anchor.copy(this.route[this.wrap(ahead)]).addScaledVector(this.right, this.side * (this.half - 0.9));
      this.anchor.y += 0.6;
    } else if (shot === 'orbit') {
      this.orbit0 = car.rotationY + Math.PI * 0.75;
    }
  }

  /** 据え置きのカメラの横を、車が通り過ぎたか */
  private passed(car: CarController): boolean {
    this.frameAt(this.idx);
    const dx = car.position.x - this.anchor.x, dz = car.position.z - this.anchor.z;
    return dx * this.fwd.x + dz * this.fwd.z > 6;
  }

  /** 車のいる経路点を探す(first: 全体から) */
  private locate(car: CarController, first: boolean): void {
    const r = this.route, n = r.length, px = car.position.x, py = car.position.y, pz = car.position.z;
    let best = Infinity, bi = this.idx;
    const from = first ? 0 : -30, to = first ? n - 1 : 30;
    for (let k = from; k <= to; k++) {
      const i = first ? k : this.wrap(this.idx + k);
      const d = (r[i].x - px) ** 2 + (r[i].z - pz) ** 2 + (r[i].y - py) ** 2;   // 3D: 道路が別の道路の真上を通ることがある
      if (d < best) { best = d; bi = i; }
    }
    this.idx = bi;
  }

  /** 経路点 i の進行方向と右向きを fwd / right に入れる */
  private frameAt(i: number): void {
    const a = this.route[this.wrap(i - 1)], b = this.route[this.wrap(i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, len = Math.hypot(tx, tz) || 1;
    this.fwd.set(tx / len, 0, tz / len);
    this.right.set(-tz / len, 0, tx / len);   // 進行方向の右
  }

  /** 車が道路の中心より右(+1)か左(-1)か */
  private carSide(car: CarController): number {
    this.frameAt(this.idx);
    const c = this.route[this.idx];
    return (car.position.x - c.x) * this.right.x + (car.position.z - c.z) * this.right.z >= 0 ? 1 : -1;
  }

  /** 横方向に道路の幅の内側へ寄せる */
  private keepOnRoad(pos: THREE.Vector3): void {
    let best = Infinity, bi = this.idx;
    for (let k = -12; k <= 12; k++) {
      const i = this.wrap(this.idx + k), q = this.route[i];
      const d = (q.x - pos.x) ** 2 + (q.z - pos.z) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    this.frameAt(bi);
    const c = this.route[bi], lim = this.half - 0.4;
    const lat = (pos.x - c.x) * this.right.x + (pos.z - c.z) * this.right.z;
    const over = lat - THREE.MathUtils.clamp(lat, -lim, lim);
    if (over !== 0) pos.addScaledVector(this.right, -over);
  }

  private roofedAhead(count: number): boolean {
    for (let k = -this.steps(30); k <= count; k += 4) if (this.roofed(this.wrap(this.idx + k))) return true;
    return false;
  }

  private steps(metres: number): number { return Math.round(metres / this.spacing); }

  private wrap(i: number): number { const n = this.route.length; return ((i % n) + n) % n; }
}
