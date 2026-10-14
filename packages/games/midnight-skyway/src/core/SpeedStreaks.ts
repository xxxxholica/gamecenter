import * as THREE from 'three';

/**
 * 風切りの筋: 車の周りの空間に細い光の線を置き、車が通り過ぎるぶんだけ後ろへ流れて見える。
 * 1本の線は(頭=明るい / 尾=暗い)で、加算合成なので尾は透けて消える。速度とブーストで本数と長さが増える。
 */
const COUNT = 140;
const LIFE = 0.45;

export class SpeedStreaks {
  public readonly mesh: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly head = new Float32Array(COUNT * 3);
  private readonly age = new Float32Array(COUNT).fill(LIFE);
  private readonly len = new Float32Array(COUNT);
  private readonly tint = new Float32Array(COUNT);
  private cursor = 0;
  private carry = 0;
  private readonly dir = new THREE.Vector3();

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
    this.mesh.renderOrder = 5;
  }

  /** level: 筋の強さ(0〜1) / boost: ブーストの強さ(0〜1) / boostColor: ブースト中の筋の色。heading は車の進行方向(ラジアン) */
  public update(dt: number, car: THREE.Vector3, heading: number, speed: number, level: number, boost: number, boostColor: THREE.Color): void {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    this.dir.set(fx, 0, fz);

    this.carry += (level * 55 + boost * 70) * dt;
    while (this.carry >= 1) {
      this.carry -= 1;
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % COUNT;
      const ahead = 8 + Math.random() * 34;
      const side = (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 6);
      this.head[i * 3] = car.x + fx * ahead + fz * side;
      this.head[i * 3 + 1] = car.y + 0.3 + Math.random() * 5;
      this.head[i * 3 + 2] = car.z + fz * ahead - fx * side;
      this.age[i] = 0;
      this.len[i] = 1.5 + Math.random() * 2.5;
      this.tint[i] = Math.random();
    }

    const stretch = 0.6 + speed * 0.02 + boost * 0.4;          // 線の長さの倍率(最高速で約1.4倍、ブーストで約1.8倍)
    for (let i = 0; i < COUNT; i++) {
      const o = i * 6;
      if (this.age[i] >= LIFE) {
        this.pos.fill(0, o, o + 6);
        this.col.fill(0, o, o + 6);
        continue;
      }
      this.age[i] += dt;
      const fade = Math.sin(Math.min(1, this.age[i] / LIFE) * Math.PI);   // 出て、消える
      const L = this.len[i] * stretch;
      // 頭が進行方向側、尾が後ろ(車が前へ進むので、筋は後ろへ流れて見える)
      this.pos[o] = this.head[i * 3];
      this.pos[o + 1] = this.head[i * 3 + 1];
      this.pos[o + 2] = this.head[i * 3 + 2];
      this.pos[o + 3] = this.head[i * 3] - this.dir.x * L;
      this.pos[o + 4] = this.head[i * 3 + 1];
      this.pos[o + 5] = this.head[i * 3 + 2] - this.dir.z * L;
      const b = fade * (0.35 + 0.65 * level);
      const warm = this.tint[i] > 0.85 ? 1 : 0;                 // ときどき混ざる暖色
      const boosted = boost > 0.2;
      const r = boosted ? boostColor.r : 0.85 + warm * 0.15;
      const g = boosted ? boostColor.g : 0.92;
      this.col[o] = r * b; this.col[o + 1] = g * b; this.col[o + 2] = (boosted ? boostColor.b : 1) * b;
      this.col[o + 3] = 0; this.col[o + 4] = 0; this.col[o + 5] = 0;   // 尾は透明
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public reset(): void {
    this.age.fill(LIFE);
    this.pos.fill(0);
    this.col.fill(0);
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
