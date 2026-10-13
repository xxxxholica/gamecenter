import * as THREE from 'three';
import { BillboardPool, type Particle } from './BillboardPool';
import { radialTexture } from './fxTextures';

const SPARK_ORANGE = [[0, '#ffffff'], [0.15, '#fff6a9'], [0.4, '#ff9000'], [0.75, 'rgba(255, 34, 0, 0.4)'], [1, 'rgba(255, 0, 0, 0)']] as const;
const SPARK_BLUE = [[0, '#ffffff'], [0.15, '#c8f0ff'], [0.4, '#2aa8ff'], [0.75, 'rgba(40, 70, 255, 0.4)'], [1, 'rgba(0, 20, 255, 0)']] as const;
const SMOKE = [[0, 'rgba(240, 245, 250, 0.75)'], [0.35, 'rgba(220, 228, 238, 0.45)'], [0.7, 'rgba(195, 205, 218, 0.15)'], [1, 'rgba(180, 190, 200, 0)']] as const;
const FLAME = [[0, 'rgba(255, 255, 255, 1)'], [0.25, 'rgba(170, 235, 255, 0.9)'], [0.6, 'rgba(40, 130, 255, 0.45)'], [1, 'rgba(10, 40, 255, 0)']] as const;
const DROP = [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(200,225,255,0.8)'], [1, 'rgba(160,200,255,0)']] as const;

/**
 * タイヤまわりの粒の演出: 煙(高速・ドリフト・雨の水煙)、火花(ドリフト・衝突・着地)、
 * ブーストの炎、雨の水の粒。種類ごとに1回の描画(BillboardPool)でまとめて出す。
 */
export class TireSmokeSystem {
  public group = new THREE.Group();
  /** 雨: 水煙を青白くする */
  public wet = false;

  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly textures: THREE.CanvasTexture[];
  private readonly smoke: BillboardPool;
  private readonly sparks: BillboardPool;
  private readonly sparksBlue: BillboardPool;
  private readonly flames: BillboardPool;
  private readonly drops: BillboardPool;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor() {
    this.group.name = 'tire_smoke_and_spark_system';
    const smokeTex = radialTexture(64, SMOKE, 2);
    const sparkTex = radialTexture(64, SPARK_ORANGE, 1, 'rgba(255, 255, 255, 0.85)');   // 十字のきらめき
    const sparkBlueTex = radialTexture(64, SPARK_BLUE, 1, 'rgba(220, 245, 255, 0.85)');
    const flameTex = radialTexture(64, FLAME, 1);
    const dropTex = radialTexture(32, DROP);
    this.textures = [smokeTex, sparkTex, sparkBlueTex, flameTex, dropTex];

    this.smoke = new BillboardPool(320, smokeTex, this.geometry, { additive: false });
    this.sparks = new BillboardPool(120, sparkTex, this.geometry, { additive: true });
    this.sparksBlue = new BillboardPool(120, sparkBlueTex, this.geometry, { additive: true });
    this.flames = new BillboardPool(110, flameTex, this.geometry, { additive: true, fog: false });
    this.drops = new BillboardPool(900, dropTex, this.geometry, { additive: true, fog: false, color: 0x8fb0e0 });
    for (const pool of [this.smoke, this.sparks, this.sparksBlue, this.flames, this.drops]) this.group.add(pool.mesh);
  }

  /** 車輪の接地点から煙を出す(高速・ドリフト・雨の水煙) */
  public emitSmoke(position: THREE.Vector3, carVelocity: THREE.Vector3, intensity: number = 1.0): void {
    const p = this.smoke.spawn();
    if (!p) return;
    p.maxAge = 0.55 + Math.random() * 0.35;
    p.s0 = 0.3 + Math.random() * 0.15;
    p.s1 = 1.2 + Math.random() * 0.6 + intensity * 0.4;
    p.o0 = Math.min(0.65, 0.3 + intensity * 0.25);
    p.pos.set(position.x + (Math.random() - 0.5) * 0.14, position.y + 0.08 + Math.random() * 0.05, position.z + (Math.random() - 0.5) * 0.14);
    if (this.wet) { p.r = 0.78; p.g = 0.88; p.b = 1; }
    p.vel.set(carVelocity.x * 0.12 + (Math.random() - 0.5) * 0.5, 0.35 + Math.random() * 0.45, carVelocity.z * 0.12 + (Math.random() - 0.5) * 0.5);
  }

  /** ドリフト・衝突・着地の火花(blue: ブースト中の青白い火花) */
  public emitSpark(position: THREE.Vector3, carVelocity: THREE.Vector3, driftDirection: number = 0, intensity: number = 1.0, blue: boolean = false): void {
    const p = (blue ? this.sparksBlue : this.sparks).spawn();
    if (!p) return;
    p.maxAge = 0.16 + Math.random() * 0.16;
    p.s0 = 0.15 + Math.random() * 0.15 + intensity * 0.08;
    p.pos.set(position.x + (Math.random() - 0.5) * 0.1, position.y + 0.04 + Math.random() * 0.04, position.z + (Math.random() - 0.5) * 0.1);

    // 火花は、車の進行と逆向きと、すべる向きの外側へ飛ぶ
    const speed = carVelocity.length();
    const backward = Math.max(2.0, speed * 0.25);
    const outward = driftDirection !== 0 ? -driftDirection : (Math.random() - 0.5) * 2;
    const fx = speed > 0.1 ? carVelocity.x / speed : 0;
    const fz = speed > 0.1 ? carVelocity.z / speed : 1;
    p.vel.set(
      -fx * (backward + Math.random() * 4.0) + fz * outward * (2.0 + Math.random() * 3.5),
      0.8 + Math.random() * 2.2,
      -fz * (backward + Math.random() * 4.0) - fx * outward * (2.0 + Math.random() * 3.5)
    );
  }

  /**
   * 雨: タイヤが跳ね上げた水の粒。worldVelocity は水が離れる時の速度(世界座標。車より遅く、後ろへ置いていかれる)、
   * outward は車の側面から外へ向かう単位ベクトル。
   */
  public emitSplash(position: THREE.Vector3, worldVelocity: THREE.Vector3, outward: THREE.Vector3, intensity: number = 1.0): void {
    const p = this.drops.spawn();
    if (!p) return;
    p.maxAge = 0.3 + Math.random() * 0.4;
    p.s0 = (0.08 + Math.random() * 0.1) * (0.8 + intensity * 0.4);
    p.pos.set(position.x + (Math.random() - 0.5) * 0.2, position.y + 0.05, position.z + (Math.random() - 0.5) * 0.2);
    const out = Math.random() * 2.0 * intensity;
    p.vel.set(
      worldVelocity.x + outward.x * out + (Math.random() - 0.5) * 1.4,
      1.2 + Math.random() * 2.6 * intensity,
      worldVelocity.z + outward.z * out + (Math.random() - 0.5) * 1.4
    );
  }

  /** 排気口のブースト炎(車より遅く流れて、後ろへ尾を引く) */
  public emitFlame(position: THREE.Vector3, carVelocity: THREE.Vector3, intensity: number = 1.0): void {
    for (let n = 0; n < 3; n++) {
      const p = this.flames.spawn();
      if (!p) return;
      p.maxAge = 0.14 + Math.random() * 0.12;
      p.s0 = (0.6 + Math.random() * 0.35) * (0.7 + intensity * 0.7);
      p.pos.set(position.x + (Math.random() - 0.5) * 0.12, position.y + (Math.random() - 0.5) * 0.12, position.z + (Math.random() - 0.5) * 0.12);
      p.vel.set(carVelocity.x * 0.55, 0.15 + Math.random() * 0.3, carVelocity.z * 0.55);
    }
  }

  public update(dt: number, camera: THREE.Camera): void {
    const q = camera.quaternion;

    this.smoke.update(dt, q, (p, d) => {
      p.pos.addScaledVector(p.vel, d);
      const t = p.age / p.maxAge;
      p.sx = p.sy = THREE.MathUtils.lerp(p.s0, p.s1, Math.pow(t, 0.7));
      p.alpha = p.o0 * (1 - t);
      return true;
    });

    const spark = (p: Particle, d: number): boolean => {
      p.vel.y -= 8.5 * d;                                        // 重力で地面へ戻り、跳ねる
      p.pos.addScaledVector(p.vel, d);
      if (p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.y = -p.vel.y * 0.35;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      const t = p.age / p.maxAge;
      p.sx = p.sy = THREE.MathUtils.lerp(p.s0, 0.05, t);
      p.alpha = 1 - t * t;
      return true;
    };
    this.sparks.update(dt, q, spark);
    this.sparksBlue.update(dt, q, spark);

    this.flames.update(dt, q, (p, d) => {
      p.pos.addScaledVector(p.vel, d);
      const t = p.age / p.maxAge;
      p.sx = p.sy = p.s0 * (1 - t * 0.75);
      p.alpha = 0.95 * (1 - t);
      return true;
    });

    // 水の粒は、画面上の動きの向きに細長く伸ばす(水が飛んでいく筋に見える)
    this.tmpQ.copy(q).invert();
    this.drops.update(dt, q, (p, d) => {
      p.vel.y -= 9.8 * d;
      p.pos.addScaledVector(p.vel, d);
      const t = p.age / p.maxAge;
      const size = p.s0 * (1 - t * 0.5);
      this.tmpV.copy(p.vel).applyQuaternion(this.tmpQ);
      p.angle = Math.atan2(this.tmpV.y, this.tmpV.x);
      p.sx = size * (1 + Math.min(5, Math.hypot(this.tmpV.x, this.tmpV.y) * 0.45));
      p.sy = size * 0.7;
      p.alpha = 0.8 * (1 - t * t);
      return true;
    });
  }

  public reset(): void {
    for (const pool of [this.smoke, this.sparks, this.sparksBlue, this.flames, this.drops]) pool.reset();
  }

  public dispose(): void {
    for (const pool of [this.smoke, this.sparks, this.sparksBlue, this.flames, this.drops]) pool.dispose();
    this.textures.forEach((t) => t.dispose());
    this.geometry.dispose();
  }
}
