// 破片・キラキラのパーティクル（InstancedMesh プール）
import * as THREE from 'three';

interface P {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rx: number; ry: number; vr: number;
  life: number; max: number; size: number;
  color: THREE.Color;
  grav: number;
}

class Pool {
  mesh: THREE.InstancedMesh;
  items: P[] = [];
  constructor(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, private max: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
  }
  add(p: P) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push(p);
  }
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  update(dt: number) {
    let n = 0;
    const alive: P[] = [];
    for (const p of this.items) {
      p.life -= dt;
      if (p.life <= 0) continue;
      alive.push(p);
      p.vy -= p.grav * dt;
      p.vx *= 1 - dt * 1.5;
      p.vz *= 1 - dt * 1.5;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.vr * dt;
      p.ry += p.vr * 0.7 * dt;
      const k = Math.min(1, p.life / (p.max * 0.4));
      const sc = p.size * k;
      this.e.set(p.rx, p.ry, 0);
      this.q.setFromEuler(this.e);
      this.m.compose(this.v.set(p.x, p.y, p.z), this.q, this.s.set(sc, sc, sc));
      this.mesh.setMatrixAt(n, this.m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.items = alive;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

export class Particles {
  private chunks: Pool;
  private sparks: Pool;

  constructor(scene: THREE.Scene) {
    this.chunks = new Pool(
      scene,
      new THREE.DodecahedronGeometry(0.5, 0),
      new THREE.MeshStandardMaterial({ roughness: 0.5, flatShading: true }),
      700,
    );
    this.sparks = new Pool(
      scene,
      new THREE.OctahedronGeometry(0.5, 0),
      new THREE.MeshBasicMaterial({ blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
      500,
    );
  }

  /** ブロック破壊の破片 */
  /** back: true なら、キャラクターの後ろ(奥)で起き、粒も奥へ向かう(ゴール到達の爆発など) */
  burst(x: number, y: number, color: THREE.Color, count = 10, power = 1, back = false) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1.5 + Math.random() * 4) * power;
      this.chunks.add({
        x: x + (Math.random() - 0.5) * 0.6, y: y + (Math.random() - 0.5) * 0.6, z: back ? -1.2 - Math.random() * 0.3 : (Math.random() - 0.2) * 0.6,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s + 3, vz: back ? -Math.random() * 0.6 : Math.random() * 3,
        rx: Math.random() * 6, ry: Math.random() * 6, vr: (Math.random() - 0.5) * 20,
        life: 0.6 + Math.random() * 0.5, max: 1.1, size: 0.08 + Math.random() * 0.14,
        color: color.clone().multiplyScalar(0.7 + Math.random() * 0.5),
        grav: 18,
      });
    }
  }

  /** 光る粒（連鎖・カプセル） */
  sparkle(x: number, y: number, color: THREE.Color, count = 12, power = 1, back = false) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (1 + Math.random() * 3.5) * power;
      this.sparks.add({
        x, y, z: back ? -1.2 : 0.5,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: back ? -Math.random() * 0.6 : (Math.random() - 0.5) * 2,
        rx: 0, ry: 0, vr: 8,
        life: 0.4 + Math.random() * 0.5, max: 0.9, size: 0.07 + Math.random() * 0.1,
        color: color.clone().multiplyScalar(1.5),
        grav: 2,
      });
    }
  }

  /** 爆発の火の粉：勢いよく飛び散って、しばらく舞ってから落ちる */
  embers(x: number, y: number, color: THREE.Color, count = 30, power = 1, back = false) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = (3 + Math.random() * 8) * power;
      this.sparks.add({
        x, y, z: back ? -1.2 : 0.5,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s + 2, vz: back ? -Math.random() * 0.8 : (Math.random() - 0.5) * 3,
        rx: 0, ry: 0, vr: 10,
        life: 0.8 + Math.random() * 0.9, max: 1.7, size: 0.06 + Math.random() * 0.1,
        color: color.clone().multiplyScalar(1.6),
        grav: 7,
      });
    }
  }

  /** 爆発の煙：ゆっくり立ちのぼる */
  smoke(x: number, y: number, count = 8, spread = 1, back = false) {
    for (let i = 0; i < count; i++) {
      const g = 0.16 + Math.random() * 0.14;
      this.chunks.add({
        x: x + (Math.random() - 0.5) * spread, y: y + (Math.random() - 0.5) * spread, z: back ? -1.3 - Math.random() * 0.3 : 0.5 + Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2.5, vz: back ? -Math.random() * 0.5 : Math.random() * 1.5,
        rx: 0, ry: 0, vr: 1.5,
        life: 0.9 + Math.random() * 0.8, max: 1.7, size: 0.35 + Math.random() * 0.4,
        color: new THREE.Color(g, g * 0.95, g * 0.9),
        grav: -1.2,
      });
    }
  }

  /** 土ぼこり */
  dust(x: number, y: number, count = 6, spread = 0.5) {
    for (let i = 0; i < count; i++) {
      this.chunks.add({
        x: x + (Math.random() - 0.5) * spread * 2, y, z: 0.4,
        vx: (Math.random() - 0.5) * 3, vy: Math.random() * 1.5, vz: Math.random(),
        rx: 0, ry: 0, vr: 2,
        life: 0.4 + Math.random() * 0.3, max: 0.7, size: 0.06 + Math.random() * 0.08,
        color: new THREE.Color(0x8a6a4a),
        grav: 3,
      });
    }
  }

  update(dt: number) {
    this.chunks.update(dt);
    this.sparks.update(dt);
  }
}
