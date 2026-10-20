import * as THREE from 'three';

/**
 * 速度の手がかり: 車のすぐ脇を流れる光の点の列。
 * 高速道路の欄干の内側に並ぶ反射板(左はだいだい色、右は白。32mごとに大きな反射板)と、
 * 車線の上に埋めた鋲(キャッツアイ)。コースの走行ルートに沿って、車の周りの分だけをその場で置く。
 * 位置はルートの番号に結びつけてあるので、車が進んでも動かず、後ろへ流れて見える。
 */
const POOL = 36;                 // 左右それぞれ、同時に置く反射板の数
const STEP = 4;                  // 反射板の間隔の既定(ルートのサンプル数。約8m)。コースごとに変えられる(setRoute)
const BEACON = 16;               // 大きな反射板の間隔の目安(ルートのサンプル数。約32m)
const BEHIND = 12;               // 車の後ろ(サンプル数)
const AHEAD = 100;               // 車の前(サンプル数。約200m)

export class RoadsideRhythm {
  public readonly group = new THREE.Group();
  /** 大きな反射板(約32mごと)を車が通り過ぎた時に呼ばれる */
  public onBeaconPass: (() => void) | null = null;

  private route: THREE.Vector3[] | null = null;
  private half = 5.7;
  private step = STEP;
  /** 何本ごとに大きな反射板にするか(間隔が広いコースでも、1本おきは小さな反射板にして、明るくしすぎない) */
  private bigEvery = BEACON / STEP;
  private lastIdx = -1;
  private readonly plates: THREE.InstancedMesh;
  private readonly studs: THREE.InstancedMesh;
  private readonly plateMat: THREE.MeshBasicMaterial;
  private readonly studMat: THREE.MeshBasicMaterial;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly pos = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly tint = new THREE.Color();
  private readonly UP = new THREE.Vector3(0, 1, 0);

  constructor() {
    const plateGeo = new THREE.BoxGeometry(0.42, 0.14, 0.05);
    this.plateMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false });
    this.plates = new THREE.InstancedMesh(plateGeo, this.plateMat, POOL * 2);
    this.plates.setColorAt(0, new THREE.Color(1, 1, 1));
    const studGeo = new THREE.BoxGeometry(0.2, 0.025, 0.34);
    this.studMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), fog: false, toneMapped: false });
    this.studs = new THREE.InstancedMesh(studGeo, this.studMat, POOL * 3);
    this.studs.setColorAt(0, new THREE.Color(1, 1, 1));
    for (const im of [this.plates, this.studs]) {
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
    }
    this.group.visible = false;
  }

  /** route: 走行ルートのサンプル(約2mおき、閉じた周回) / roadWidth: 欄干の間の幅(m)。null なら出さない / step: 反射板・鋲の間隔(サンプル数) */
  public setRoute(route: THREE.Vector3[] | null, roadWidth: number | null, step = STEP): void {
    this.route = route && roadWidth ? route : null;
    this.half = (roadWidth ?? 0) / 2;
    this.step = step;
    this.bigEvery = Math.max(2, Math.round(BEACON / step));
    this.lastIdx = -1;
    this.group.visible = this.route !== null;
  }

  public reset(): void { this.lastIdx = -1; }

  public update(car: THREE.Vector3): void {
    const route = this.route;
    if (!route) return;
    const n = route.length;

    // 車に一番近いルート番号(前回の近くだけ探す。初回は全体)
    let best = -1, bestD = Infinity;
    const search = (from: number, to: number): void => {
      for (let k = from; k <= to; k++) {
        const i = ((k % n) + n) % n;
        const dx = route[i].x - car.x, dz = route[i].z - car.z;
        const d = dx * dx + dz * dz + Math.abs(route[i].y - car.y) * 4;
        if (d < bestD) { bestD = d; best = i; }
      }
    };
    if (this.lastIdx < 0) search(0, n - 1);
    else search(this.lastIdx - 30, this.lastIdx + 30);
    if (best < 0 || bestD > 40 * 40) { if (this.lastIdx >= 0) { this.lastIdx = -1; } return; }

    // 大きな反射板を通り過ぎたか
    if (this.lastIdx >= 0 && this.onBeaconPass) {
      const fwd = (best - this.lastIdx + n) % n;
      if (fwd > 0 && fwd < 30) {
        for (let k = 1; k <= fwd; k++) if ((this.lastIdx + k) % (this.step * this.bigEvery) === 0) { this.onBeaconPass(); break; }
      }
    }
    this.lastIdx = best;

    // 置き直す
    let slot = 0;
    const step = this.step, bigEvery = this.bigEvery;
    const start = best - BEHIND - ((best - BEHIND) % step + step) % step;
    this.plates.count = POOL * 2;
    for (let j = start; j <= best + AHEAD && slot < POOL; j += step, slot++) {
      const i = ((j % n) + n) % n;
      const a = route[(i - 1 + n) % n], b = route[(i + 1) % n], r = route[i];
      const yaw = Math.atan2(b.x - a.x, b.z - a.z);
      const nx = -Math.cos(yaw), nz = Math.sin(yaw);            // 横(+ = 進行方向の右)
      const big = ((j / step) % bigEvery + bigEvery) % bigEvery === 0;
      this.q.setFromAxisAngle(this.UP, yaw);
      const s = big ? 1.5 : 1;
      for (const side of [-1, 1]) {
        const lat = side * (this.half - 0.12);
        this.m.compose(this.pos.set(r.x + nx * lat, r.y + (big ? 0.78 : 0.7), r.z + nz * lat), this.q, this.scale.set(s, s, 1));
        this.plates.setMatrixAt(slot + (side > 0 ? POOL : 0), this.m);
        // 左はだいだい色、右は白
        this.plates.setColorAt(slot + (side > 0 ? POOL : 0), this.tint.copy(side > 0 ? WHITE : AMBER).multiplyScalar(big ? 3.2 : 1.8));
      }
      // 鋲: 左右の車線の外側の線と、中央の線の上
      [-1, 0, 1].forEach((side, k) => {
        const lat = side * (this.half - 0.5);
        this.m.compose(this.pos.set(r.x + nx * lat, r.y + 0.045, r.z + nz * lat), this.q, this.scale.set(1, 1, 1));
        this.studs.setMatrixAt(slot * 3 + k, this.m);
        this.studs.setColorAt(slot * 3 + k, side === 0 ? CYAN : side < 0 ? AMBER : WHITE);
      });
    }
    // 余ったぶんは見えなくする
    for (let k = slot; k < POOL; k++) {
      this.plates.setMatrixAt(k, this.zero);
      this.plates.setMatrixAt(POOL + k, this.zero);
      for (let c = 0; c < 3; c++) this.studs.setMatrixAt(k * 3 + c, this.zero);
    }
    this.plates.instanceMatrix.needsUpdate = true;
    this.studs.instanceMatrix.needsUpdate = true;
    if (this.plates.instanceColor) this.plates.instanceColor.needsUpdate = true;
    if (this.studs.instanceColor) this.studs.instanceColor.needsUpdate = true;
  }

  public dispose(): void {
    this.plates.geometry.dispose();
    this.studs.geometry.dispose();
    this.plateMat.dispose();
    this.studMat.dispose();
  }
}

const WHITE = new THREE.Color(1, 1, 1);
const AMBER = new THREE.Color(1, 0.55, 0.12);
const CYAN = new THREE.Color(0.35, 0.9, 1);
