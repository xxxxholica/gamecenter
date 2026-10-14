import * as THREE from 'three';
import { BillboardPool, type Particle } from './BillboardPool';
import { radialTexture } from './fxTextures';
import { BOOST_THEMES, type BoostTheme } from './BoostTheme';

const SPARK_ORANGE = [[0, '#ffffff'], [0.15, '#fff6a9'], [0.4, '#ff9000'], [0.75, 'rgba(255, 34, 0, 0.4)'], [1, 'rgba(255, 0, 0, 0)']] as const;
// ブーストの色つきの粒は、白いテクスチャに粒ごとの色を掛ける(色は BoostTheme の主色)
const GLINT = [[0, '#ffffff'], [0.15, 'rgba(255, 255, 255, 0.95)'], [0.4, 'rgba(255, 255, 255, 0.6)'], [0.75, 'rgba(255, 255, 255, 0.2)'], [1, 'rgba(255, 255, 255, 0)']] as const;
const SMOKE = [[0, 'rgba(240, 245, 250, 0.75)'], [0.35, 'rgba(220, 228, 238, 0.45)'], [0.7, 'rgba(195, 205, 218, 0.15)'], [1, 'rgba(180, 190, 200, 0)']] as const;
const FLAME = [[0, 'rgba(255, 255, 255, 1)'], [0.25, 'rgba(255, 255, 255, 0.85)'], [0.6, 'rgba(255, 255, 255, 0.4)'], [1, 'rgba(255, 255, 255, 0)']] as const;
const DROP = [[0, 'rgba(255,255,255,1)'], [0.35, 'rgba(200,225,255,0.8)'], [1, 'rgba(160,200,255,0)']] as const;

/**
 * タイヤまわりの粒の演出: 煙(高速・ドリフト・雨の水煙)、火花(ドリフト・衝突・着地)、
 * ブーストの炎・火の粉・金の粉・電撃、雨の水の粒。種類ごとに1回の描画(BillboardPool)でまとめて出す。
 * ブーストの色と演出は BoostTheme(車ごと)で決まる。
 */
export class TireSmokeSystem {
  public group = new THREE.Group();
  /** 雨: 水煙を青白くする */
  public wet = false;
  /** ブーストの色・演出。車を替えたら setTheme で切り替える */
  public theme: BoostTheme = BOOST_THEMES.default;

  private readonly geometry = new THREE.PlaneGeometry(1, 1);
  private readonly textures: THREE.CanvasTexture[];
  private readonly smoke: BillboardPool;
  private readonly sparks: BillboardPool;
  private readonly glints: BillboardPool;
  private readonly arcs: BillboardPool;
  private readonly flames: BillboardPool;
  private readonly drops: BillboardPool;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly camInv = new THREE.Quaternion();
  private readonly boltA = new THREE.Vector3();
  private readonly boltB = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly white = new THREE.Color(1, 1, 1);

  constructor() {
    this.group.name = 'tire_smoke_and_spark_system';
    const smokeTex = radialTexture(64, SMOKE, 2);
    const sparkTex = radialTexture(64, SPARK_ORANGE, 1, 'rgba(255, 255, 255, 0.85)');   // 十字のきらめき
    const glintTex = radialTexture(64, GLINT, 1, 'rgba(255, 255, 255, 0.85)');
    const arcTex = radialTexture(32, GLINT);
    const flameTex = radialTexture(64, FLAME, 1);
    const dropTex = radialTexture(32, DROP);
    this.textures = [smokeTex, sparkTex, glintTex, arcTex, flameTex, dropTex];

    this.smoke = new BillboardPool(320, smokeTex, this.geometry, { additive: false });
    this.sparks = new BillboardPool(120, sparkTex, this.geometry, { additive: true });
    this.glints = new BillboardPool(260, glintTex, this.geometry, { additive: true });
    this.arcs = new BillboardPool(260, arcTex, this.geometry, { additive: true, fog: false });
    this.flames = new BillboardPool(280, flameTex, this.geometry, { additive: true, fog: false });
    this.drops = new BillboardPool(900, dropTex, this.geometry, { additive: true, fog: false, color: 0x8fb0e0 });
    for (const pool of [this.smoke, this.sparks, this.glints, this.arcs, this.flames, this.drops]) this.group.add(pool.mesh);
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

  /** ドリフト・衝突・着地の火花(boosted: ブースト中は、車の主色の火花) */
  public emitSpark(position: THREE.Vector3, carVelocity: THREE.Vector3, driftDirection: number = 0, intensity: number = 1.0,
    boosted: boolean = false, theme: BoostTheme = this.theme): void {
    const p = (boosted ? this.glints : this.sparks).spawn();
    if (!p) return;
    if (boosted) this.tint(p, theme.streak, 8.5);
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

  /** 色つきの粒(glints)の基本色と重力を決める。重力が負なら舞い上がる */
  private tint(p: Particle, color: THREE.Color, gravity: number): void {
    p.r = p.r0 = color.r; p.g = p.g0 = color.g; p.b = p.b0 = color.b;
    p.o0 = gravity;
    p.s1 = 0;
  }

  /** 排気口のブースト炎(車より遅く流れて、後ろへ尾を引く)。芯は白、外側ほど車の主色になる */
  public emitFlame(position: THREE.Vector3, carVelocity: THREE.Vector3, intensity: number = 1.0, theme: BoostTheme = this.theme): void {
    const f = theme.flame;
    for (let n = 0; n < f.count; n++) {
      const p = this.flames.spawn();
      if (!p) return;
      p.maxAge = (0.14 + Math.random() * 0.12) * f.life;
      p.s0 = (0.6 + Math.random() * 0.35) * (0.7 + intensity * 0.7) * f.size;
      p.pos.set(position.x + (Math.random() - 0.5) * 0.12, position.y + (Math.random() - 0.5) * 0.12, position.z + (Math.random() - 0.5) * 0.12);
      p.vel.set(carVelocity.x * 0.55, f.rise * (0.5 + Math.random()), carVelocity.z * 0.55);
      p.r0 = theme.primary.r; p.g0 = theme.primary.g; p.b0 = theme.primary.b;
      p.o0 = f.alpha;
    }
  }

  /** 火の粉(Crimson): 排気口から舞い上がり、流れて消える */
  public emitEmber(position: THREE.Vector3, carVelocity: THREE.Vector3, intensity: number = 1.0, theme: BoostTheme = this.theme): void {
    const p = this.glints.spawn();
    if (!p) return;
    this.tint(p, theme.streak, -1.5);
    p.maxAge = 0.5 + Math.random() * 0.5;
    p.s0 = 0.08 + Math.random() * 0.1 + intensity * 0.03;
    p.pos.set(position.x + (Math.random() - 0.5) * 0.3, position.y + Math.random() * 0.2, position.z + (Math.random() - 0.5) * 0.3);
    p.vel.set(carVelocity.x * 0.4 + (Math.random() - 0.5) * 2.4, 1.2 + Math.random() * 2.8, carVelocity.z * 0.4 + (Math.random() - 0.5) * 2.4);
  }

  /** 金の粉(Gold): 車の周りにきらめきながら漂い、ゆっくり舞い上がる。center は車の位置、spread はその周りの広がり */
  public emitMote(center: THREE.Vector3, carVelocity: THREE.Vector3, spread: number = 1.2, theme: BoostTheme = this.theme): void {
    const p = this.glints.spawn();
    if (!p) return;
    this.tint(p, theme.streak, -0.2);
    p.s1 = 1 + Math.random() * 6;                                        // きらめきの位相(0 以外でまたたく)
    p.maxAge = 0.8 + Math.random() * 0.6;
    p.s0 = 0.1 + Math.random() * 0.12;
    p.pos.set(center.x + (Math.random() - 0.5) * 2 * spread, center.y + 0.2 + Math.random() * 1.1, center.z + (Math.random() - 0.5) * 2 * spread);
    p.vel.set(carVelocity.x * 0.3 + (Math.random() - 0.5) * 1.2, 0.5 + Math.random() * 1.2, carVelocity.z * 0.3 + (Math.random() - 0.5) * 1.2);
  }

  /**
   * 電撃(Azure): 車体の左右から外へ、ジグザグに走る光。粒は車と同じ速度で動き、短く消える。
   * carPos・rotY は車の位置と向き(前が (sin, cos))。count 本ぶん出す。
   */
  public emitBolts(count: number, carPos: THREE.Vector3, rotY: number, carVelocity: THREE.Vector3, theme: BoostTheme = this.theme): void {
    const sn = Math.sin(rotY), cs = Math.cos(rotY);
    const toWorld = (lx: number, ly: number, lz: number, out: THREE.Vector3): THREE.Vector3 =>
      out.set(carPos.x + lx * cs + lz * sn, carPos.y + ly, carPos.z - lx * sn + lz * cs);
    const color = this.tmpColor.copy(theme.primary).lerp(this.white, 0.55);
    for (let b = 0; b < count; b++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const sx = side * (0.8 + Math.random() * 0.3), sy = 0.3 + Math.random() * 0.6, sz = (Math.random() - 0.5) * 3.4;
      const ex = sx + side * (1.2 + Math.random() * 2.2);
      const ey = Math.random() < 0.4 ? 0.05 : sy + (Math.random() - 0.3) * 1.6;      // ときどき地面まで落ちる
      const ez = sz + (Math.random() - 0.5) * 2.4;
      const life = 0.06 + Math.random() * 0.06;
      const seg = 6;
      toWorld(sx, sy, sz, this.boltA);
      for (let i = 1; i <= seg; i++) {
        const u = i / seg, j = i === seg ? 0 : 0.22;
        toWorld(sx + (ex - sx) * u + (Math.random() - 0.5) * j, sy + (ey - sy) * u + (Math.random() - 0.5) * j,
          sz + (ez - sz) * u + (Math.random() - 0.5) * j, this.boltB);
        const p = this.arcs.spawn();
        if (!p) return;
        // 画面上の向きと長さ: 線分をカメラ空間に直し、その向きに細長く伸ばす
        this.tmpV.subVectors(this.boltB, this.boltA);
        const worldLen = this.tmpV.length();
        this.tmpV.applyQuaternion(this.camInv);
        const thick = 0.1 + Math.random() * 0.05;
        p.angle = Math.atan2(this.tmpV.y, this.tmpV.x);
        p.sx = Math.hypot(this.tmpV.x, this.tmpV.y) * 1.2 + thick * 2;
        p.sy = thick * (1 + 0.5 * (1 - u));
        p.maxAge = life;
        p.alpha = 1;
        p.pos.addVectors(this.boltA, this.boltB).multiplyScalar(0.5);
        p.vel.copy(carVelocity);
        p.r = color.r; p.g = color.g; p.b = color.b;
        p.o0 = worldLen;
        this.boltA.copy(this.boltB);
      }
    }
  }

  public setTheme(theme: BoostTheme): void { this.theme = theme; }

  public update(dt: number, camera: THREE.Camera): void {
    const q = camera.quaternion;
    this.camInv.copy(q).invert();

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

    // 色つきの粒(ブーストの火花・火の粉・金の粉)。o0 が重力(負なら舞い上がる)。s1 が 0 以外ならまたたく
    this.glints.update(dt, q, (p, d) => {
      p.vel.y -= p.o0 * d;
      p.pos.addScaledVector(p.vel, d);
      if (p.o0 > 1 && p.pos.y < 0.02) {
        p.pos.y = 0.02;
        p.vel.y = -p.vel.y * 0.35;
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }
      const t = p.age / p.maxAge;
      p.sx = p.sy = THREE.MathUtils.lerp(p.s0, 0.05, t);
      p.alpha = (1 - t * t) * (p.s1 > 0 ? 0.55 + 0.45 * Math.sin(p.age * 28 + p.s1) : 1);
      return true;
    });

    // 電撃: 車についていき、出た瞬間が最も明るい
    this.arcs.update(dt, q, (p, d) => {
      p.pos.addScaledVector(p.vel, d);
      p.alpha = 1 - p.age / p.maxAge;
      return true;
    });

    // 炎: 芯は白、時間とともに主色へ
    this.flames.update(dt, q, (p, d) => {
      p.pos.addScaledVector(p.vel, d);
      const t = p.age / p.maxAge;
      const hot = (1 - t) * 0.5;
      p.r = p.r0 + (1 - p.r0) * hot;
      p.g = p.g0 + (1 - p.g0) * hot;
      p.b = p.b0 + (1 - p.b0) * hot;
      p.sx = p.sy = p.s0 * (1 - t * 0.75);
      p.alpha = p.o0 * (1 - t);
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
    for (const pool of [this.smoke, this.sparks, this.glints, this.arcs, this.flames, this.drops]) pool.reset();
  }

  public dispose(): void {
    for (const pool of [this.smoke, this.sparks, this.glints, this.arcs, this.flames, this.drops]) pool.dispose();
    this.textures.forEach((t) => t.dispose());
    this.geometry.dispose();
  }
}
