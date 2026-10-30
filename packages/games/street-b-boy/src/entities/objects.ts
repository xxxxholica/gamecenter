import * as THREE from 'three';
import { BoundingBox2D } from './player';
import { TextureGenerator } from '../world/textures';
import { EdgeTrigger } from '../engine/edgeTrigger';

// 1. CASSETTE TAPE (Coin)
export class CassetteTape {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public isCollected: boolean = false;
  public isGold: boolean;
  private animTimer: number = Math.random() * 5;
  private baseY: number;

  constructor(x: number, y: number, isGold: boolean = false) {
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.isGold = isGold;
    this.mesh = new THREE.Group();

    const labelTex = TextureGenerator.getCassetteLabelTexture(isGold);

    // Cassette Body Box
    const geo = new THREE.BoxGeometry(0.7, 0.45, 0.12);
    const mat = new THREE.MeshStandardMaterial({
      map: labelTex,
      color: isGold ? 0xffea00 : 0xdddddd,
      emissive: isGold ? 0xffbb00 : 0x000000,
      emissiveIntensity: isGold ? 0.6 : 0,
      roughness: 0.3,
      metalness: isGold ? 0.8 : 0.2
    });
    const body = new THREE.Mesh(geo, mat);
    this.mesh.add(body);

    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): void {
    if (this.isCollected) return;
    this.animTimer += dt;
    // Hover bob & 3D rotation
    this.mesh.rotation.y += (this.isGold ? 6 : 3.5) * dt;
    this.mesh.position.y = this.baseY + Math.sin(this.animTimer * 4) * 0.15;
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - 0.4,
      y: this.y - 0.25,
      w: 0.8,
      h: 0.6
    };
  }
}

// 2. INTERACTIVE BLOCKS (Question Block & Brick Block)
export type BlockType = 'question' | 'brick' | 'solid';

export class StageBlock {
  public mesh: THREE.Mesh;
  public x: number;
  public y: number;
  public type: BlockType;
  public isHit: boolean = false;
  public isDestroyed: boolean = false;
  public containsGold: boolean = false;

  private bounceOffset: number = 0;
  private bounceSpeed: number = 0;

  constructor(x: number, y: number, type: BlockType, containsGold: boolean = false) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.containsGold = containsGold;

    const geo = new THREE.BoxGeometry(1, 1, 1);
    let mat: THREE.Material;

    if (type === 'question') {
      mat = new THREE.MeshStandardMaterial({
        map: TextureGenerator.getQuestionBlockTexture(),
        roughness: 0.4,
        metalness: 0.5
      });
    } else if (type === 'brick') {
      mat = new THREE.MeshStandardMaterial({
        map: TextureGenerator.getBrickBlockTexture(),
        roughness: 0.8
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: 0x333339,
        roughness: 0.7
      });
    }

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.position.set(x, y, 0);
  }

  public hit(): { type: BlockType; spawnedItem: boolean; isGold: boolean } {
    if (this.isHit || this.isDestroyed) {
      return { type: this.type, spawnedItem: false, isGold: false };
    }

    this.bounceSpeed = 6.0;

    if (this.type === 'question') {
      this.isHit = true;
      // Change texture to empty block
      this.mesh.material = new THREE.MeshStandardMaterial({
        map: TextureGenerator.getEmptyBlockTexture(),
        roughness: 0.7
      });
      return { type: 'question', spawnedItem: true, isGold: this.containsGold };
    } else if (this.type === 'brick') {
      this.isDestroyed = true;
      return { type: 'brick', spawnedItem: false, isGold: false };
    }

    return { type: 'solid', spawnedItem: false, isGold: false };
  }

  public update(dt: number): void {
    if (this.isDestroyed) return;

    if (this.bounceSpeed !== 0 || this.bounceOffset > 0) {
      this.bounceOffset += this.bounceSpeed * dt;
      this.bounceSpeed -= 40 * dt;
      if (this.bounceOffset <= 0) {
        this.bounceOffset = 0;
        this.bounceSpeed = 0;
      }
      this.mesh.position.y = this.y + this.bounceOffset;
    }
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - 0.5,
      y: this.y - 0.5,
      w: 1.0,
      h: 1.0
    };
  }
}

// 3. BREAKABLE STREET OBSTACLE (Trash Can, Cardboard Box)
export class StreetObstacle {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public isDestroyed: boolean = false;
  public type: 'trash_can' | 'cardboard';
  public width: number = 0.9;
  public height: number = 1.0;

  constructor(x: number, y: number, type: 'trash_can' | 'cardboard') {
    this.x = x;
    this.y = y;
    this.type = type;
    this.mesh = new THREE.Group();

    if (type === 'trash_can') {
      this.width = 0.8;
      this.height = 1.1;
      const canGeo = new THREE.CylinderGeometry(0.4, 0.35, 1.1, 16);
      const canMat = new THREE.MeshStandardMaterial({ color: 0x4a7c59, roughness: 0.5, metalness: 0.3 });
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.y = 0.55;
      can.castShadow = true;

      // Lid
      const lidGeo = new THREE.CylinderGeometry(0.43, 0.43, 0.1, 16);
      const lid = new THREE.Mesh(lidGeo, canMat);
      lid.position.y = 1.15;
      this.mesh.add(can, lid);
    } else {
      this.width = 1.0;
      this.height = 0.9;
      const boxGeo = new THREE.BoxGeometry(1.0, 0.9, 0.9);
      const boxMat = new THREE.MeshStandardMaterial({
        map: TextureGenerator.getCardboardTexture(),
        roughness: 0.8
      });
      const box = new THREE.Mesh(boxGeo, boxMat);
      box.position.y = 0.45;
      box.castShadow = true;
      this.mesh.add(box);
    }

    this.mesh.position.set(x, y, 0);
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - this.width / 2,
      y: this.y,
      w: this.width,
      h: this.height
    };
  }
}

// 4. PARTICLE & DEBRIS SYSTEM
export interface DebrisParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  life: number;
  maxLife: number;
}

export class ParticleSystem {
  public group: THREE.Group;
  private particles: DebrisParticle[] = [];
  /**
   * 形と材質は、種類ごとに共有する(粒ごとに作って捨てると、GPUへの転送と破棄が演出のたびに起きる)。
   * 粒の消え方は scale で表すので、材質は粒の間で共有しても変わらない。
   */
  private readonly geos = new Map<string, THREE.BufferGeometry>();
  private readonly mats = new Map<string, THREE.Material>();
  /** 同時に出せる粒の上限。連続して演出が重なっても、描画する数が増え続けない(超えたら古い粒から消す) */
  private static readonly MAX_PARTICLES = 320;

  constructor() {
    this.group = new THREE.Group();
  }

  private geo(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.geos.get(key);
    if (!g) { g = make(); this.geos.set(key, g); }
    return g;
  }

  private mat(key: string, make: () => THREE.Material): THREE.Material {
    let m = this.mats.get(key);
    if (!m) { m = make(); this.mats.set(key, m); }
    return m;
  }

  /** 粒を登録する。上限を超えたら、いちばん古い粒を外す(形・材質は共有なので破棄しない) */
  private addParticle(p: DebrisParticle): void {
    this.particles.push(p);
    while (this.particles.length > ParticleSystem.MAX_PARTICLES) {
      const old = this.particles.shift()!;
      this.group.remove(old.mesh);
    }
  }

  public spawnSmoke(x: number, y: number): void {
    const k = Math.floor(Math.random() * 3);
    const geo = this.geo(`smoke${k}`, () => new THREE.SphereGeometry(0.12 + k * 0.03, 6, 6));
    const mat = this.mat('smoke', () => new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.7
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.1, (Math.random() - 0.5) * 0.2);
    this.group.add(mesh);

    this.addParticle({
      mesh,
      vx: (Math.random() - 0.5) * 1.5,
      vy: 1.2 + Math.random() * 1.0,
      vz: (Math.random() - 0.5) * 1.0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      life: 0.35,
      maxLife: 0.35
    });
  }

  public spawnBrickDebris(x: number, y: number): void {
    const brickTex = TextureGenerator.getBrickBlockTexture();
    for (let i = 0; i < 6; i++) {
      const geo = this.geo('brick', () => new THREE.BoxGeometry(0.3, 0.3, 0.3));
      const mat = this.mat('brick', () => new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8 }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, 0);
      this.group.add(mesh);

      this.addParticle({
        mesh,
        vx: (Math.random() - 0.5) * 10,
        vy: 4 + Math.random() * 8,
        vz: (Math.random() - 0.5) * 8,
        rotX: Math.random() * 10,
        rotY: Math.random() * 10,
        rotZ: Math.random() * 10,
        life: 0.8,
        maxLife: 0.8
      });
    }
  }

  public spawnObstacleDebris(x: number, y: number, type: 'trash_can' | 'cardboard'): void {
    const color = (type === 'trash_can') ? 0x4a7c59 : 0xb58351;
    for (let i = 0; i < 8; i++) {
      const geo = this.geo('obstacle', () => new THREE.BoxGeometry(0.25, 0.25, 0.25));
      const mat = this.mat(`obstacle${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.7 }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.4, 0);
      this.group.add(mesh);

      this.addParticle({
        mesh,
        vx: (Math.random() - 0.5) * 12,
        vy: 5 + Math.random() * 7,
        vz: (Math.random() - 0.5) * 8,
        rotX: Math.random() * 12,
        rotY: Math.random() * 12,
        rotZ: Math.random() * 12,
        life: 0.7,
        maxLife: 0.7
      });
    }
  }

  public spawnSparkles(x: number, y: number, count: number = 8, color: number = 0xffe600): void {
    for (let i = 0; i < count; i++) {
      const geo = this.geo('sparkle', () => new THREE.BoxGeometry(0.1, 0.1, 0.1));
      const mat = this.mat(`sparkle${color}`, () => new THREE.MeshBasicMaterial({ color }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      this.group.add(mesh);

      this.addParticle({
        mesh,
        vx: (Math.random() - 0.5) * 8,
        vy: 2 + Math.random() * 7,
        vz: (Math.random() - 0.5) * 6,
        rotX: Math.random() * 10,
        rotY: Math.random() * 10,
        rotZ: Math.random() * 10,
        life: 0.5,
        maxLife: 0.5
      });
    }
  }

  public spawnFireworks(x: number, y: number): void {
    const colors = [0xff1a1a, 0x00f0ff, 0xffe600, 0xffffff, 0x39ff14];
    const chosenColor = colors[Math.floor(Math.random() * colors.length)];
    for (let i = 0; i < 28; i++) {
      const geo = this.geo('firework', () => new THREE.SphereGeometry(0.12, 6, 6));
      const mat = this.mat(`firework${chosenColor}`, () => new THREE.MeshBasicMaterial({ color: chosenColor }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      this.group.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      this.addParticle({
        mesh,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 2,
        vz: (Math.random() - 0.5) * 8,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        life: 1.0,
        maxLife: 1.0
      });
    }
  }

  public spawnSparks(x: number, y: number, count: number = 5): void {
    for (let i = 0; i < count; i++) {
      const geo = this.geo('spark', () => new THREE.BoxGeometry(0.08, 0.08, 0.08));
      const sparkColor = Math.random() > 0.5 ? 0xffea00 : 0xff5500;
      const mat = this.mat(`spark${sparkColor}`, () => new THREE.MeshBasicMaterial({ color: sparkColor }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.05, (Math.random() - 0.5) * 0.2);
      this.group.add(mesh);

      this.addParticle({
        mesh,
        vx: (Math.random() - 0.7) * 7,
        vy: 2 + Math.random() * 5,
        vz: (Math.random() - 0.5) * 4,
        rotX: Math.random() * 10,
        rotY: Math.random() * 10,
        rotZ: Math.random() * 10,
        life: 0.25,
        maxLife: 0.25
      });
    }
  }

  public spawnWater(x: number, y: number, count: number = 6): void {
    for (let i = 0; i < count; i++) {
      const k = Math.floor(Math.random() * 3);
      const geo = this.geo(`water${k}`, () => new THREE.SphereGeometry(0.1 + k * 0.03, 5, 5));
      const waterColor = Math.random() > 0.3 ? 0x00f0ff : 0xffffff;
      const mat = this.mat(`water${waterColor}`, () => new THREE.MeshBasicMaterial({
        color: waterColor,
        transparent: true,
        opacity: 0.8
      }));
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.5, (Math.random() - 0.5) * 0.3);
      this.group.add(mesh);

      this.addParticle({
        mesh,
        vx: (Math.random() - 0.5) * 3,
        vy: 10 + Math.random() * 8,
        vz: (Math.random() - 0.5) * 3,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        life: 0.6,
        maxLife: 0.6
      });
    }
  }

  public spawnSteam(x: number, y: number): void {
    const k = Math.floor(Math.random() * 3);
    const geo = this.geo(`steam${k}`, () => new THREE.SphereGeometry(0.2 + k * 0.07, 6, 6));
    const mat = this.mat('steam', () => new THREE.MeshBasicMaterial({
      color: 0xddffff,
      transparent: true,
      opacity: 0.5
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.2, (Math.random() - 0.5) * 0.3);
    this.group.add(mesh);

    this.addParticle({
      mesh,
      vx: (Math.random() - 0.5) * 1.2,
      vy: 4.5 + Math.random() * 2.5,
      vz: (Math.random() - 0.5) * 1.2,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      life: 0.7,
      maxLife: 0.7
    });
  }

  public spawnShockwave(x: number, y: number): void {
    const geo = this.geo('shockwave', () => new THREE.RingGeometry(0.2, 0.4, 24));
    const mat = this.mat('shockwave', () => new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.8, 0.1);
    this.group.add(mesh);

    let life = 0.28;
    const maxLife = 0.28;

    this.addParticle({
      mesh,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      life,
      maxLife
    });
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.group.remove(p.mesh);                         // 形・材質は共有なので破棄しない
        this.particles.splice(i, 1);
        continue;
      }

      p.vy -= 18 * dt; // Gravity
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      p.mesh.rotation.x += p.rotX * dt;
      p.mesh.rotation.y += p.rotY * dt;
      p.mesh.rotation.z += p.rotZ * dt;

      // Fade out
      const scale = p.life / p.maxLife;
      p.mesh.scale.set(scale, scale, scale);
    }
  }

  public clear(): void {
    for (const p of this.particles) this.group.remove(p.mesh);
    this.particles = [];
  }

  /** 共有している形・材質を破棄する(ステージを作り直す時) */
  public dispose(): void {
    this.clear();
    for (const g of this.geos.values()) g.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.geos.clear();
    this.mats.clear();
  }
}

// 5. GRIND RAIL
export class GrindRail {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public length: number;

  constructor(x: number, y: number, length: number) {
    this.x = x;
    this.y = y;
    this.length = length;
    this.mesh = new THREE.Group();

    // Bright yellow rail pipe
    const pipeGeo = new THREE.CylinderGeometry(0.08, 0.08, length, 12);
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0xffe600,
      metalness: 0.85,
      roughness: 0.2
    });
    const pipe = new THREE.Mesh(pipeGeo, pipeMat);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(length / 2, 0, 0);
    pipe.castShadow = true;
    this.mesh.add(pipe);

    this.mesh.position.set(x, y, 0);
  }

  /**
   * 支柱を立てる。groundAt(x) はその x の真下にある足場の上面の高さ(なければ null)を返す。
   * 足場がある所は地面まで届く支柱、足場のない所(穴の上)は上から吊るすケーブルにして、宙に浮いて見えないようにする。
   */
  public buildSupports(groundAt: (worldX: number) => number | null): void {
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const positions: number[] = [];
    for (let px = 0.4; px < this.length - 0.3; px += 3.0) positions.push(px);
    const lastPx = this.length - 0.4;
    if (positions.length === 0 || lastPx - positions[positions.length - 1] > 0.4) {
      positions.push(lastPx);
    }

    for (const px of positions) {
      const ground = groundAt(this.x + px);
      if (ground !== null && ground < this.y - 0.1) {
        const h = this.y - ground;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, h, 8), postMat);
        post.position.set(px, -h / 2, 0);
        post.castShadow = true;
        this.mesh.add(post);
      } else {
        // 地面に設置していないレールの柱は奈落の下まで続いているように見せる
        const abyssDepth = 35; // 画面外・奈落の底まで十分届く長さ
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, abyssDepth, 8), postMat);
        post.position.set(px, -abyssDepth / 2, 0);
        post.castShadow = true;
        this.mesh.add(post);
      }
    }
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x,
      y: this.y - 0.2,
      w: this.length,
      h: 0.4
    };
  }
}

// 6. FIRE HYDRANT (With Erupting Water Geyser)
export class FireHydrant {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public isErupted: boolean = false;
  /** プレイヤーが水柱に入った瞬間(得点・コンボ・効果音を1回の通過につき1回だけ出すため) */
  public readonly columnEntry = new EdgeTrigger();
  private waterColumn: THREE.Mesh;
  private capMesh: THREE.Mesh;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.mesh = new THREE.Group();

    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.3, 0.35, 1.0, 12);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, roughness: 0.4 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    body.castShadow = true;
    this.mesh.add(body);

    // Side nozzles
    const nozGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.8, 8);
    const nozMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
    const noz = new THREE.Mesh(nozGeo, nozMat);
    noz.rotation.z = Math.PI / 2;
    noz.position.y = 0.6;
    this.mesh.add(noz);

    // Dome cap
    const capGeo = new THREE.SphereGeometry(0.25, 12, 8);
    this.capMesh = new THREE.Mesh(capGeo, bodyMat);
    this.capMesh.position.y = 1.05;
    this.mesh.add(this.capMesh);

    // Translucent high-pressure water column
    const waterGeo = new THREE.CylinderGeometry(0.35, 0.45, 6.0, 16);
    const waterMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.55
    });
    this.waterColumn = new THREE.Mesh(waterGeo, waterMat);
    this.waterColumn.position.set(0, 4.0, 0);
    this.waterColumn.visible = false;
    this.mesh.add(this.waterColumn);

    this.mesh.position.set(x, y, 0);
  }

  public erupt(): void {
    if (this.isErupted) return;
    this.isErupted = true;
    this.capMesh.visible = false;
    this.waterColumn.visible = true;
  }

  /** 消火栓の本体。噴出前後を問わず常にソリッド(上に乗れて、横は壁) */
  public getAABB(): BoundingBox2D {
    return {
      x: this.x - 0.4,
      y: this.y,
      w: 0.8,
      h: 1.1
    };
  }

  /** 噴出中の水柱(トリガー)。体は止めず、触れると打ち上げる。噴出前は判定なし */
  public getColumnAABB(): BoundingBox2D | null {
    if (!this.isErupted) return null;
    return {
      x: this.x - 0.45,
      y: this.y + 1.0,
      w: 0.9,
      h: 6.0
    };
  }
}

// 7. SUBWOOFER BOUNCE PAD
export class SubwooferPad {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public cone: THREE.Mesh;
  private punchTimer: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.mesh = new THREE.Group();

    // Subwoofer Box (wide speaker)
    const boxGeo = new THREE.BoxGeometry(1.6, 0.9, 1.4);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x111116, roughness: 0.3, metalness: 0.7 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 0.45;
    box.castShadow = true;
    box.receiveShadow = true;
    this.mesh.add(box);

    // Neon Rim
    const rimGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.08, 24);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.y = 0.92;
    this.mesh.add(rim);

    // Speaker Cone (faces upward)
    const coneGeo = new THREE.CylinderGeometry(0.55, 0.4, 0.1, 24);
    const coneMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getSpeakerGrilleTexture(),
      roughness: 0.8
    });
    this.cone = new THREE.Mesh(coneGeo, coneMat);
    this.cone.position.y = 0.94;
    this.mesh.add(this.cone);

    this.mesh.position.set(x, y, 0);
  }

  public bounce(): void {
    this.punchTimer = 0.3;
  }

  public update(dt: number): void {
    if (this.punchTimer > 0) {
      this.punchTimer -= dt;
      this.cone.position.y = 0.84 + Math.sin(this.punchTimer * 20) * 0.15;
    } else {
      this.cone.position.y = 0.94;
    }
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - 0.8,
      y: this.y,
      w: 1.6,
      h: 1.0
    };
  }
}

// 8. STEAM MANHOLE VENT
export class SteamVent {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public timer: number = Math.random() * 3;
  public isSteaming: boolean = false;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.mesh = new THREE.Group();

    // Manhole Cover
    const coverGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.08, 20);
    const coverMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getManholeTexture(),
      roughness: 0.6,
      metalness: 0.8
    });
    const cover = new THREE.Mesh(coverGeo, coverMat);
    cover.position.y = 0.04;
    cover.receiveShadow = true;
    this.mesh.add(cover);

    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): boolean {
    this.timer += dt;
    const cycle = this.timer % 4.5;
    this.isSteaming = (cycle < 2.5); // Steam for 2.5s, quiet for 2s
    return this.isSteaming;
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - 0.5,
      y: this.y,
      w: 1.0,
      h: this.isSteaming ? 4.5 : 0
    };
  }
}

// 9. SECURITY LASER GRID
export class LaserGrid {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public width: number;
  public beamHeight: number;
  public isIntermittent: boolean;
  private static readonly SUPPORT_POST_MAT = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.85, roughness: 0.28 });
  private static readonly SUPPORT_COLLAR_MAT = new THREE.MeshStandardMaterial({ color: 0x1a1c20, emissive: 0xff0033, emissiveIntensity: 0.25, metalness: 0.8 });
  public isActive: boolean = true;
  public beamMesh: THREE.Mesh;
  private animTimer: number = Math.random() * 3.0;
  private nodeMat: THREE.MeshStandardMaterial;
  private supportsGroup: THREE.Group;
  /** 点滅1周期の秒数(2.5秒 = 96BPMの4拍)。周期を揃えた複数のレーザーは位相(phase)で交互に点滅させる */
  private period: number = 3.6;
  /** 1周期のうち発射している割合。残りは前半が消灯、後半が予告(黄色の点滅) */
  private duty: number = 2.0 / 3.6;

  constructor(x: number, y: number, width: number = 3.0, beamHeight: number = 1.15, isIntermittent: boolean = false, beat?: { period: number; phase: number; duty?: number }) {
    if (beat) {
      this.duty = beat.duty ?? this.duty;
      this.period = beat.period;
      this.animTimer = beat.phase * beat.period;
    }
    this.x = x;
    this.y = y;
    this.width = width;
    this.beamHeight = beamHeight;
    this.isIntermittent = isIntermittent;
    this.mesh = new THREE.Group();

    // エミッタはビームの高さに配置し、支柱はエミッタから真下の床(または壁面ブラケット・奈落)へ伸ばす。
    // ビームより上には突き出さないため「跳び越えられない高い壁」には見えない。
    const nodeGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: 0xff0033, emissiveIntensity: 0.6, metalness: 0.8 });
    this.nodeMat = nodeMat;
    const leftNode = new THREE.Mesh(nodeGeo, nodeMat);
    leftNode.position.set(0, beamHeight, 0);
    const rightNode = new THREE.Mesh(nodeGeo, nodeMat);
    rightNode.position.set(width, beamHeight, 0);
    this.mesh.add(leftNode, rightNode);

    this.supportsGroup = new THREE.Group();
    this.mesh.add(this.supportsGroup);

    // Glowing Red Laser Beam
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, width, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    this.beamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.beamMesh.rotation.z = Math.PI / 2;
    this.beamMesh.position.set(width / 2, beamHeight, 0);
    this.mesh.add(this.beamMesh);

    this.mesh.position.set(x, y, 0);
  }

  private addSupportColumn(px: number, postH: number, postY: number, baseY: number, baseRTop = 0.16, baseRBottom = 0.19): void {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.065, postH, 8), LaserGrid.SUPPORT_POST_MAT);
    post.position.set(px, postY, 0);
    post.castShadow = true;
    this.supportsGroup.add(post);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(baseRTop, baseRBottom, 0.07, 12), LaserGrid.SUPPORT_COLLAR_MAT);
    base.position.set(px, baseY, 0);
    this.supportsGroup.add(base);
  }

  /**
   * 両端のエミッタを支える支柱を生成する。
   * - 足場やレールがある箇所はその上面まで支柱と台座を伸ばす
   * - 崩れる足場や穴の上(恒久足場がない箇所)は奈落の底まで支柱を伸ばして片側が宙に浮かないようにする
   * - 縦穴(dropShaft)内では壁から張り出す水平ブラケットアームで両端を支える
   */
  public buildSupports(
    groundAt: (worldX: number) => number | null,
    shaft?: { x0: number; x1: number } | null
  ): void {
    while (this.supportsGroup.children.length > 0) {
      const child = this.supportsGroup.children[0] as THREE.Mesh;
      this.supportsGroup.remove(child);
      child.geometry?.dispose();
    }

    const postMat = LaserGrid.SUPPORT_POST_MAT;
    const collarMat = LaserGrid.SUPPORT_COLLAR_MAT;

    if (shaft && this.x >= shaft.x0 - 0.1 && this.x + this.width <= shaft.x1 + 0.1) {
      // 縦穴内: 両端の垂直ポスト + 壁から張り出す水平サポートアームと斜めブレース
      for (const px of [0, this.width]) {
        this.addSupportColumn(px, this.beamHeight, this.beamHeight / 2, 0.035, 0.15, 0.17);
      }

      const arm = new THREE.Mesh(new THREE.BoxGeometry(this.width + 0.24, 0.1, 0.14), postMat);
      arm.position.set(this.width / 2, -0.02, 0);
      this.supportsGroup.add(arm);

      const leftAnchored = Math.abs(this.x - shaft.x0) < 0.25;
      const wallLocalX = leftAnchored ? 0 : this.width;
      const wallPlate = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 0.28), collarMat);
      wallPlate.position.set(wallLocalX, -0.22, 0);
      this.supportsGroup.add(wallPlate);

      const braceLen = Math.hypot(this.width * 0.65, 0.5);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(braceLen, 0.06, 0.08), postMat);
      const dir = leftAnchored ? 1 : -1;
      brace.position.set(wallLocalX + dir * (this.width * 0.325), -0.27, 0);
      brace.rotation.z = dir * Math.atan2(0.5, this.width * 0.65);
      this.supportsGroup.add(brace);
      return;
    }

    for (const px of [0, this.width]) {
      const ground = groundAt(this.x + px);
      if (ground !== null && ground <= this.y + this.beamHeight - 0.05) {
        const h = (this.y + this.beamHeight) - ground;
        this.addSupportColumn(px, h, this.beamHeight - h / 2, ground - this.y + 0.035);
      } else {
        // 恒久的な足場がない箇所(崩れる足場や奈落の上)は奈落の底まで支柱を伸ばす
        const abyssDepth = 35;
        this.addSupportColumn(px, abyssDepth, this.beamHeight - abyssDepth / 2, 0.035);
      }
    }
  }

  public update(dt: number): void {
    this.animTimer += dt;

    if (this.isIntermittent) {
      // 周期の 0〜duty が発射(既定55%)、残りの前半が消灯、後半が予告(黄色の点滅)
      const frac = (this.animTimer % this.period) / this.period;
      const rest = (frac - this.duty) / (1 - this.duty);
      if (frac < this.duty) {
        // Active Danger Laser
        this.isActive = true;
        this.beamMesh.visible = true;
        (this.beamMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0033);
        this.beamMesh.scale.x = 0.8 + Math.sin(this.animTimer * 16) * 0.3;
        this.beamMesh.scale.z = 0.8 + Math.sin(this.animTimer * 16) * 0.3;
      } else if (rest < 0.5) {
        // Cooldown Off
        this.isActive = false;
        this.beamMesh.visible = false;
      } else {
        // Warning Blink (flashes yellow warning player that beam is recharging)
        this.isActive = false;
        this.beamMesh.visible = Math.sin(this.animTimer * 20) > 0;
        (this.beamMesh.material as THREE.MeshBasicMaterial).color.setHex(0xffea00);
      }
    } else {
      this.isActive = true;
      this.beamMesh.visible = true;
      this.beamMesh.scale.x = 0.8 + Math.sin(this.animTimer * 16) * 0.3;
      this.beamMesh.scale.z = 0.8 + Math.sin(this.animTimer * 16) * 0.3;
    }
    // 停止中はエミッタも消灯し、触れても安全であることを見た目で示す
    this.nodeMat.emissiveIntensity = this.isActive ? 0.6 : 0.05;
  }

  public getBeamAABB(): BoundingBox2D {
    if (!this.isActive) {
      return { x: -999, y: -999, w: 0, h: 0 };
    }
    // ビームと両端のエミッタ(0.3四方)を含む帯
    return {
      x: this.x - 0.15,
      y: this.y + this.beamHeight - 0.15,
      w: this.width + 0.3,
      h: 0.3
    };
  }
}

// 10. MOVING GONDOLA PLATFORM
export class MovingPlatform {
  public mesh: THREE.Group;
  public startX: number;
  public startY: number;
  public currentX: number;
  public currentY: number;
  public deltaX: number;
  public deltaY: number;
  public speed: number;
  public width: number;
  public height: number = 0.6;
  public vx: number = 0;
  public vy: number = 0;
  private animTimer: number = Math.random() * 5;

  constructor(x: number, y: number, w: number, deltaX: number = 0, deltaY: number = 0, speed: number = 1.5, style: 'gondola' | 'cart' = 'gondola') {
    this.startX = x;
    this.startY = y;
    this.currentX = x;
    this.currentY = y;
    this.width = w;
    this.deltaX = deltaX;
    this.deltaY = deltaY;
    this.speed = speed;
    this.mesh = new THREE.Group();

    // Scaffold Deck
    const deckGeo = new THREE.BoxGeometry(w, this.height, 2.6);
    const deckMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getCautionStripesTexture(),
      roughness: 0.7
    });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(w / 2, -this.height / 2, 0);
    deck.castShadow = true;
    deck.receiveShadow = true;
    this.mesh.add(deck);

    if (style === 'cart') {
      // レールカート: 吊り下げケーブルの代わりに車輪と連結器。地面のレールを走るので宙に浮いて見えない
      const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 14);
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.4 });
      for (const wx of [0.9, w - 0.9]) {
        for (const wz of [-0.9, 0.9]) {
          const wheel = new THREE.Mesh(wheelGeo, wheelMat);
          wheel.rotation.x = Math.PI / 2;
          wheel.position.set(wx, -this.height - 0.05, wz);
          this.mesh.add(wheel);
        }
      }
      const lampGeo = new THREE.BoxGeometry(0.3, 0.2, 0.5);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffee88 });
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(w - 0.2, 0.1, 0);
      this.mesh.add(lamp);
    } else {
      // Twin suspension cables
      const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 8, 6);
      const cableMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
      const cableL = new THREE.Mesh(cableGeo, cableMat);
      cableL.position.set(0.4, 4, 0);
      const cableR = new THREE.Mesh(cableGeo, cableMat);
      cableR.position.set(w - 0.4, 4, 0);
      this.mesh.add(cableL, cableR);
    }

    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): void {
    this.animTimer += dt * this.speed;
    const prevX = this.currentX;
    const prevY = this.currentY;

    const offset = Math.sin(this.animTimer);
    this.currentX = this.startX + this.deltaX * offset;
    this.currentY = this.startY + this.deltaY * offset;

    this.vx = (this.currentX - prevX) / dt;
    this.vy = (this.currentY - prevY) / dt;

    this.mesh.position.set(this.currentX, this.currentY, 0);
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.currentX,
      y: this.currentY - this.height,
      w: this.width,
      h: this.height
    };
  }
}


// 11. CRUMBLING PLATFORM (面3: 踏むと少し揺れて落ちる足場板。一定時間で復活する)
export class CrumblingPlatform {
  public mesh: THREE.Group;
  public x: number;
  public y: number; // 上面の高さ
  public width: number;
  public readonly height: number = 0.5;
  public state: 'idle' | 'shaking' | 'falling' | 'gone' = 'idle';

  private timer: number = 0;
  private offsetY: number = 0;
  private vy: number = 0;

  private static readonly SHAKE_TIME = 0.55;
  private static readonly FALL_TIME = 1.0;
  private static readonly GONE_TIME = 2.6;

  /** 踏んでから落ち始めるまでの時間(秒)。短いほど立ち止まれない */
  private readonly shakeTime: number;

  constructor(x: number, y: number, width: number, shakeTime: number = CrumblingPlatform.SHAKE_TIME) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.shakeTime = shakeTime;
    this.mesh = new THREE.Group();

    const plankGeo = new THREE.BoxGeometry(width, this.height, 2.4);
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.85 });
    const plank = new THREE.Mesh(plankGeo, plankMat);
    plank.position.set(width / 2, -this.height / 2, 0);
    plank.castShadow = true;
    this.mesh.add(plank);

    // ひび割れ(崩れる足場だと一目で分かる橙色の線) + 一方通行の板と共通の縁の線
    const crackMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a });
    for (let cx = 0.6; cx < width - 0.3; cx += 0.9) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.02, 2.0), crackMat);
      crack.position.set(cx, 0.005, 0);
      this.mesh.add(crack);
    }
    const edge = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0x66ccff }));
    edge.position.set(width / 2, 0, 1.2);
    this.mesh.add(edge);

    this.mesh.position.set(x, y, 0);
  }

  /** 乗っている間に呼ぶ。最初の一度だけ崩壊のカウントダウンを始める */
  public touch(): void {
    if (this.state === 'idle') {
      this.state = 'shaking';
      this.timer = this.shakeTime;
    }
  }

  /** 乗れる状態(揺れ始めても、落ち始めるまでは乗れる) */
  public get isActive(): boolean {
    return this.state === 'idle' || this.state === 'shaking';
  }

  public update(dt: number): void {
    switch (this.state) {
      case 'shaking':
        this.timer -= dt;
        this.mesh.position.x = this.x + (Math.random() - 0.5) * 0.08;
        this.mesh.position.y = this.y + (Math.random() - 0.5) * 0.05;
        if (this.timer <= 0) {
          this.state = 'falling';
          this.timer = CrumblingPlatform.FALL_TIME;
          this.vy = 0;
          this.mesh.position.x = this.x;
        }
        break;
      case 'falling':
        this.timer -= dt;
        this.vy -= 22 * dt;
        this.offsetY += this.vy * dt;
        this.mesh.position.y = this.y + this.offsetY;
        this.mesh.rotation.z = Math.max(-0.5, this.offsetY * 0.08);
        if (this.timer <= 0) {
          this.state = 'gone';
          this.timer = CrumblingPlatform.GONE_TIME;
          this.mesh.visible = false;
        }
        break;
      case 'gone':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.state = 'idle';
          this.offsetY = 0;
          this.vy = 0;
          this.mesh.rotation.z = 0;
          this.mesh.position.set(this.x, this.y, 0);
          this.mesh.visible = true;
        }
        break;
      default:
        break;
    }
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x,
      y: this.y - this.height + this.offsetY,
      w: this.width,
      h: this.height
    };
  }
}

// 12. CHECKPOINT (通過すると、ミスした時にここから再開できる旗)
export class Checkpoint {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public isReached: boolean = false;
  private flag: THREE.Mesh;
  private flagMat: THREE.MeshBasicMaterial;
  private animTimer: number = Math.random() * 3;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.mesh = new THREE.Group();

    const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.3 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.0, 8), poleMat);
    pole.position.y = 1.5;
    this.mesh.add(pole);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.12, 12), poleMat);
    base.position.y = 0.06;
    this.mesh.add(base);

    this.flagMat = new THREE.MeshBasicMaterial({ color: 0x888899, side: THREE.DoubleSide });
    this.flag = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), this.flagMat);
    this.flag.position.set(0.55, 2.6, 0);
    this.mesh.add(this.flag);

    this.mesh.position.set(x, y, 0);
  }

  public reach(): void {
    if (this.isReached) return;
    this.isReached = true;
    this.flagMat.color.setHex(0x00ff88);
  }

  public update(dt: number): void {
    this.animTimer += dt;
    this.flag.rotation.y = Math.sin(this.animTimer * (this.isReached ? 6 : 2)) * 0.25;
  }

  /** 旗の周りの縦長のトリガー(体は止めない) */
  public getAABB(): BoundingBox2D {
    return { x: this.x - 0.6, y: this.y, w: 1.2, h: 3.0 };
  }
}

// 13. VERTICAL LASER TRAP (下から定期的にレーザーが飛んでくる砲台)
export class VerticalLaserTrap {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public targetHeight: number;
  public period: number;
  public timer: number;
  public speed: number;
  private emitterMesh: THREE.Mesh;
  public onFire?: (trap: VerticalLaserTrap) => void;

  constructor(
    x: number,
    y: number,
    targetHeight: number = 42,
    period: number = 2.0,
    phase: number = 0,
    speed: number = 22
  ) {
    this.x = x;
    this.y = y;
    this.targetHeight = targetHeight;
    this.period = period;
    this.timer = phase * period;
    this.speed = speed;

    this.mesh = new THREE.Group();

    // 砲台・エミッター台座
    const emitterGeo = new THREE.CylinderGeometry(0.35, 0.55, 0.5, 8);
    const emitterMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      emissive: 0xff0033,
      emissiveIntensity: 0.4,
      metalness: 0.85,
    });
    this.emitterMesh = new THREE.Mesh(emitterGeo, emitterMat);
    this.emitterMesh.position.set(0, 0.25, 0);
    this.mesh.add(this.emitterMesh);

    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): void {
    const prevTimer = this.timer;
    this.timer += dt;

    // 周期の境目で発射
    if (Math.floor(prevTimer / this.period) !== Math.floor(this.timer / this.period)) {
      this.onFire?.(this);
    }
  }

  public dispose(): void {
    this.mesh.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
        else obj.material?.dispose();
      }
    });
  }
}
