import * as THREE from 'three';

/**
 * 雨粒: 車の周りの空間に降らせる細い線。車の速度ぶんだけ後ろへ流れて見える(線の向きは、雨粒と車の相対速度)。
 * 後ろへ抜けた粒や地面に落ちた粒は、前方に出し直す。
 */
const COUNT = 700;

export class RainSystem {
  public readonly mesh: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly p = new Float32Array(COUNT * 3);
  private readonly fall = new Float32Array(COUNT);     // 粒ごとの落下速度のばらつき
  private readonly vrel = new THREE.Vector3();
  /** true なら車の周り全体に降らせる(前方だけでなく後ろにも)。メニューの背景で、カメラが車の周りを回る時に使う。 */
  public surround = false;
  public intensity = 0;                                // 0〜1: 降りの強さ(表示する粒の割合)

  constructor() {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(COUNT * 6);
    this.col = new Float32Array(COUNT * 6);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.visible = false;
    for (let i = 0; i < COUNT; i++) this.fall[i] = 0.8 + Math.random() * 0.5;
  }

  private spawn(i: number, car: THREE.Vector3, fx: number, fz: number, anywhere: boolean): void {
    const ahead = this.surround ? -34 + Math.random() * 68 : anywhere ? -8 + Math.random() * 52 : 14 + Math.random() * 40;
    const side = (Math.random() - 0.5) * 34;
    this.p[i * 3] = car.x + fx * ahead + fz * side;
    this.p[i * 3 + 1] = car.y + (anywhere ? -1 + Math.random() * 12 : 4 + Math.random() * 8);
    this.p[i * 3 + 2] = car.z + fz * ahead - fx * side;
  }

  public update(dt: number, car: THREE.Vector3, heading: number, carVel: THREE.Vector3, night: boolean): void {
    this.mesh.visible = this.intensity > 0.01;
    if (!this.mesh.visible) return;
    const fx = Math.sin(heading), fz = Math.cos(heading);
    const shown = Math.floor(COUNT * this.intensity);
    const bright = night ? 0.42 : 0.28;
    for (let i = 0; i < COUNT; i++) {
      const o = i * 6;
      if (i >= shown) { this.col.fill(0, o, o + 6); this.pos.fill(0, o, o + 6); continue; }
      if (this.p[i * 3 + 1] === 0) this.spawn(i, car, fx, fz, true);
      const vy = -22 * this.fall[i];
      this.p[i * 3] += 1.5 * dt;                                  // わずかな横風
      this.p[i * 3 + 1] += vy * dt;
      const rx = this.p[i * 3] - car.x, ry = this.p[i * 3 + 1] - car.y, rz = this.p[i * 3 + 2] - car.z;
      if (ry < -1.4 || (!this.surround && rx * fx + rz * fz < -8) || Math.abs(rx) + Math.abs(rz) > 70) this.spawn(i, car, fx, fz, false);
      // 線: 雨粒と車の相対速度の向きに伸ばす(速いほど長く、後ろへ流れる)
      this.vrel.set(1.5 - carVel.x, vy, -carVel.z);
      const len = Math.min(3.2, this.vrel.length() * 0.028);
      this.vrel.normalize().multiplyScalar(len);
      const x = this.p[i * 3], y = this.p[i * 3 + 1], z = this.p[i * 3 + 2];
      this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z;
      this.pos[o + 3] = x - this.vrel.x; this.pos[o + 4] = y - this.vrel.y; this.pos[o + 5] = z - this.vrel.z;
      const b = bright * (0.5 + 0.5 * this.fall[i]);
      this.col[o] = 0.7 * b; this.col[o + 1] = 0.8 * b; this.col[o + 2] = b;
      this.col[o + 3] = 0; this.col[o + 4] = 0; this.col[o + 5] = 0;
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public reset(): void {
    this.p.fill(0);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
