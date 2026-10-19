import * as THREE from 'three';
import { radialTexture } from './fxTextures';
import type { BoostTheme } from './BoostTheme';

/**
 * 速度とは別の、路面・車まわりの演出:
 *  - テールランプの光跡(尾を引く赤い帯。ブーストで青白く)
 *  - ドリフトのタイヤ痕
 *  - 車の下の発光(アンダーグロー。ドリフトで桃色、ブーストで青白く)
 *  - ブースト開始の衝撃波リング
 */

/** テールランプの光跡: 一定間隔で記録した位置を、細い帯でつなぐ */
class TaillightTrail {
  private static readonly N = 44;
  private static readonly STEP = 0.022;      // 秒ごとに1点
  public readonly mesh: THREE.Mesh;
  private readonly pts: THREE.Vector3[][] = [[], []];
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private acc = 0;

  constructor() {
    const n = TaillightTrail.N;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(2 * n * 2 * 3);
    this.col = new Float32Array(2 * n * 2 * 3);
    const idx: number[] = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < n - 1; i++) {
        const a = (r * n + i) * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
  }

  /** lights: 左右のテールランプの位置 / strength: 光の強さ(0〜1) / boost: ブースト(0〜1) / boostColor: ブースト中の光跡の色 */
  public update(dt: number, lights: [THREE.Vector3, THREE.Vector3], heading: number, strength: number, boost: number, boostColor: THREE.Color): void {
    const n = TaillightTrail.N;
    this.acc += dt;
    while (this.acc >= TaillightTrail.STEP) {
      this.acc -= TaillightTrail.STEP;
      for (let r = 0; r < 2; r++) {
        const v = this.pts[r].length >= n ? this.pts[r].pop()! : new THREE.Vector3();    // いちばん古い点を使い回す
        this.pts[r].unshift(v.copy(lights[r]));
      }
    }
    if (this.pts[0].length > 0) { this.pts[0][0].copy(lights[0]); this.pts[1][0].copy(lights[1]); }   // 先頭は常に車についていく
    const half = 0.04 + boost * 0.03;
    const sx = Math.cos(heading), sz = -Math.sin(heading);       // 進行方向に直交する横方向
    for (let r = 0; r < 2; r++) {
      const list = this.pts[r];
      for (let i = 0; i < n; i++) {
        const p = list[Math.min(i, list.length - 1)];
        const o = (r * n + i) * 6;
        const fade = list.length > 1 && i < list.length ? Math.pow(1 - i / n, 1.6) * strength : 0;
        if (!p) { this.pos.fill(0, o, o + 6); this.col.fill(0, o, o + 6); continue; }
        this.pos[o] = p.x - sx * half; this.pos[o + 1] = p.y; this.pos[o + 2] = p.z - sz * half;
        this.pos[o + 3] = p.x + sx * half; this.pos[o + 4] = p.y; this.pos[o + 5] = p.z + sz * half;
        const cr = 1 + (boostColor.r - 1) * boost, cg = 0.08 + (boostColor.g - 0.08) * boost, cb = 0.12 + (boostColor.b - 0.12) * boost;
        for (let k = 0; k < 2; k++) {
          this.col[o + k * 3] = cr * fade; this.col[o + k * 3 + 1] = cg * fade; this.col[o + k * 3 + 2] = cb * fade;
        }
      }
    }
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public reset(): void {
    this.pts[0].length = 0;
    this.pts[1].length = 0;
    this.col.fill(0);
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** タイヤ痕: 後輪の軌跡を、地面すれすれの黒い帯として残す(古いものから上書き) */
class SkidMarks {
  private static readonly SEGMENTS = 700;
  public readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private cursor = 0;
  private readonly last = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly hasLast = [false, false];
  private readonly cur = new THREE.Vector3();

  constructor() {
    const n = SkidMarks.SEGMENTS;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 4 * 3);
    this.col = new Float32Array(n * 4 * 4);
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** wheel: 0=左後輪 1=右後輪。skidding が false なら、つながりを切る */
  public add(wheel: 0 | 1, p: THREE.Vector3, skidding: boolean, strength: number): void {
    if (!skidding) { this.hasLast[wheel] = false; return; }
    const cur = this.cur.copy(p);
    cur.y += 0.035;
    const prev = this.last[wheel];
    if (!this.hasLast[wheel]) { prev.copy(cur); this.hasLast[wheel] = true; return; }
    const d2 = prev.distanceToSquared(cur);
    if (d2 < 0.04) return;                                   // まだ短い間は、前の点を残したまま伸ばす(低速でも痕がつながる)
    if (d2 > 25) { prev.copy(cur); return; }                 // 飛んだ(復帰など)ときは、つながない
    const dx = cur.x - prev.x, dz = cur.z - prev.z;
    const l = Math.hypot(dx, dz) || 1;
    const nx = -dz / l * 0.11, nz = dx / l * 0.11;
    const o = this.cursor * 12, c = this.cursor * 16;
    const a = Math.min(0.55, 0.2 + strength * 0.4);
    this.pos[o] = prev.x + nx; this.pos[o + 1] = prev.y; this.pos[o + 2] = prev.z + nz;
    this.pos[o + 3] = prev.x - nx; this.pos[o + 4] = prev.y; this.pos[o + 5] = prev.z - nz;
    this.pos[o + 6] = cur.x + nx; this.pos[o + 7] = cur.y; this.pos[o + 8] = cur.z + nz;
    this.pos[o + 9] = cur.x - nx; this.pos[o + 10] = cur.y; this.pos[o + 11] = cur.z - nz;
    for (let k = 0; k < 4; k++) { this.col[c + k * 4] = 0.02; this.col[c + k * 4 + 1] = 0.02; this.col[c + k * 4 + 2] = 0.025; this.col[c + k * 4 + 3] = a; }
    prev.copy(cur);
    this.cursor = (this.cursor + 1) % SkidMarks.SEGMENTS;
    (this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public reset(): void {
    this.col.fill(0);
    this.hasLast[0] = this.hasLast[1] = false;
    this.cursor = 0;
    (this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/** ブースト開始の衝撃波: 地面を広がっていく光の輪(色は車の主色。Gold は三重、Azure は二重) */
class Shockwave {
  private static readonly N = 3;
  private readonly rings: Array<{ mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; age: number; max: number; size: number }> = [];
  private readonly tex: THREE.CanvasTexture;
  private readonly geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  public readonly group = new THREE.Group();

  constructor() {
    this.tex = radialTexture(128, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0)'], [0.82, 'rgba(255,255,255,0.95)'], [0.92, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']]);
    for (let i = 0; i < Shockwave.N; i++) {
      const mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
        map: this.tex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.group.add(mesh);
      this.rings.push({ mesh, age: 1, max: 0.6, size: 18 });
    }
  }

  /** delay: 出るまでの待ち(秒)。待っている輪は age が負 */
  public fire(p: THREE.Vector3, size: number, color: THREE.Color, delay = 0): void {
    const r = this.rings.find((x) => x.age >= x.max) ?? this.rings[0];
    r.age = -delay;
    r.max = 0.55;
    r.size = size;
    r.mesh.position.set(p.x, p.y + 0.12, p.z);
    r.mesh.material.color.copy(color);
    r.mesh.visible = delay <= 0;
  }

  public update(dt: number): void {
    for (const r of this.rings) {
      if (r.age >= r.max) { r.mesh.visible = false; continue; }
      r.age += dt;
      if (r.age < 0) continue;
      r.mesh.visible = true;
      const t = Math.min(1, r.age / r.max);
      const s = 2 + (r.size - 2) * (1 - Math.pow(1 - t, 3));
      r.mesh.scale.set(s, 1, s);
      r.mesh.material.opacity = 0.9 * (1 - t);
    }
  }

  public reset(): void { for (const r of this.rings) { r.age = r.max; r.mesh.visible = false; } }

  public dispose(): void {
    this.tex.dispose();
    this.geo.dispose();
    for (const r of this.rings) r.mesh.material.dispose();
  }
}

const GLOW_BASE = new THREE.Color(0.1, 0.55, 1);
const GLOW_DRIFT = new THREE.Color(1, 0.15, 0.75);

export class RoadVfx {
  public readonly group = new THREE.Group();
  private readonly trail = new TaillightTrail();
  private readonly skids = new SkidMarks();
  private readonly shock = new Shockwave();
  private readonly glow: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly glowTex: THREE.CanvasTexture;
  private glowColor = new THREE.Color(0.1, 0.55, 1);
  private readonly glowTarget = new THREE.Color();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly waveColor = new THREE.Color();
  private readonly white = new THREE.Color(1, 1, 1);

  constructor() {
    this.glowTex = radialTexture(128, [[0, 'rgba(255,255,255,0.9)'], [0.4, 'rgba(255,255,255,0.45)'], [1, 'rgba(255,255,255,0)']]);
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: this.glowTex, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.glow.renderOrder = 2;
    this.glow.rotation.order = 'YXZ';
    this.group.add(this.trail.mesh, this.skids.mesh, this.shock.group, this.glow);
  }

  public fireShockwave(p: THREE.Vector3, size: number, theme: BoostTheme): void {
    const c = this.waveColor.copy(theme.primary).lerp(this.white, 0.25);
    this.shock.fire(p, size, c);
    if (theme.kind === 'storm') this.shock.fire(p, size * 0.6, c, 0.06);
    else if (theme.kind === 'radiant') {
      this.shock.fire(p, size * 0.72, c, 0.1);
      this.shock.fire(p, size * 0.5, c, 0.2);
    }
  }

  /**
   * 毎フレームの更新。car は車の位置・向き・進行方向、tires は後輪の接地点。
   * drift: 0〜1 / boost: 0〜1
   */
  public update(dt: number, car: { position: THREE.Vector3; rotationY: number; speed: number },
    tires: { rearLeft: THREE.Vector3; rearRight: THREE.Vector3 }, skidding: boolean, skidStrength: number,
    drift: number, boost: number, scale: number, theme: BoostTheme): void {
    const fx = Math.sin(car.rotationY), fz = Math.cos(car.rotationY);
    const speed = Math.abs(car.speed);

    // 光跡: テールランプの位置(後輪の少し内側・後ろ・上)
    const lights: [THREE.Vector3, THREE.Vector3] = [this.tmpA, this.tmpB];
    [tires.rearLeft, tires.rearRight].forEach((w, i) => {
      lights[i].copy(w).lerp(car.position, 0.18);
      lights[i].x -= fx * 0.75;
      lights[i].z -= fz * 0.75;
      lights[i].y = car.position.y + 0.62;
    });
    const trailStrength = Math.min(1, speed / 14) * (0.6 + 0.4 * scale);
    this.trail.update(dt, lights, car.rotationY, trailStrength, boost, theme.primary);

    // タイヤ痕
    this.skids.add(0, tires.rearLeft, skidding, skidStrength);
    this.skids.add(1, tires.rearRight, skidding, skidStrength);

    // アンダーグロー: 普段は淡い青、ドリフトで桃色、ブーストで青白く強く
    const target = this.glowTarget.copy(GLOW_BASE).lerp(GLOW_DRIFT, drift).lerp(theme.glow, boost);
    this.glowColor.lerp(target, Math.min(1, 8 * dt));
    this.glow.material.color.copy(this.glowColor);
    this.glow.material.opacity = Math.min(1, (0.5 + drift * 0.18 + boost * 0.5) * Math.min(1, 0.3 + speed / 12));
    this.glow.position.set(car.position.x, car.position.y + 0.07, car.position.z);
    this.glow.rotation.y = car.rotationY;
    const len = 6.5 + boost * 3, wid = 4.2 + boost * 1.2;
    this.glow.scale.set(wid, 1, len);

    this.shock.update(dt);
  }

  public reset(): void {
    this.trail.reset();
    this.skids.reset();
    this.shock.reset();
    this.glow.material.opacity = 0;
  }

  public dispose(): void {
    this.trail.dispose();
    this.skids.dispose();
    this.shock.dispose();
    this.glow.geometry.dispose();
    this.glow.material.dispose();
    this.glowTex.dispose();
  }
}
