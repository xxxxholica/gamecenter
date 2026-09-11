import * as THREE from 'three';
import { BoundingBox2D } from './player';
import { TextureGenerator } from '../world/textures';

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

  constructor() {
    this.group = new THREE.Group();
  }

  public spawnSmoke(x: number, y: number): void {
    const geo = new THREE.SphereGeometry(0.12 + Math.random() * 0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xcccccc,
      transparent: true,
      opacity: 0.7
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.1, (Math.random() - 0.5) * 0.2);
    this.group.add(mesh);

    this.particles.push({
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
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const mat = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.8 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + (Math.random() - 0.5) * 0.4, 0);
      this.group.add(mesh);

      this.particles.push({
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
      const geo = new THREE.BoxGeometry(0.25, 0.25, 0.25);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.4, 0);
      this.group.add(mesh);

      this.particles.push({
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
      const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const mat = new THREE.MeshBasicMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      this.group.add(mesh);

      this.particles.push({
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
      const geo = new THREE.SphereGeometry(0.12, 6, 6);
      const mat = new THREE.MeshBasicMaterial({ color: chosenColor });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, 0);
      this.group.add(mesh);

      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 10;
      this.particles.push({
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
      const geo = new THREE.BoxGeometry(0.08, 0.08, 0.08);
      const mat = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xffea00 : 0xff5500 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.2, y + 0.05, (Math.random() - 0.5) * 0.2);
      this.group.add(mesh);

      this.particles.push({
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
      const geo = new THREE.SphereGeometry(0.1 + Math.random() * 0.08, 5, 5);
      const mat = new THREE.MeshBasicMaterial({
        color: Math.random() > 0.3 ? 0x00f0ff : 0xffffff,
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.5, (Math.random() - 0.5) * 0.3);
      this.group.add(mesh);

      this.particles.push({
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
    const geo = new THREE.SphereGeometry(0.2 + Math.random() * 0.15, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xddffff,
      transparent: true,
      opacity: 0.5
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.4, y + 0.2, (Math.random() - 0.5) * 0.3);
    this.group.add(mesh);

    this.particles.push({
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
    const geo = new THREE.RingGeometry(0.2, 0.4, 24);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y + 0.8, 0.1);
    this.group.add(mesh);

    let life = 0.28;
    const maxLife = 0.28;

    this.particles.push({
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
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach((m) => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
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
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      if (Array.isArray(p.mesh.material)) {
        p.mesh.material.forEach((m) => m.dispose());
      } else {
        p.mesh.material.dispose();
      }
    }
    this.particles = [];
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

    // Support posts
    const postGeo = new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    for (let px = 0.6; px < length; px += 3.0) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(px, -0.6, 0);
      post.castShadow = true;
      this.mesh.add(post);
    }

    this.mesh.position.set(x, y, 0);
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

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - 0.4,
      y: this.y,
      w: 0.8,
      h: this.isErupted ? 6.5 : 1.1
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
      x: this.x - 0.6,
      y: this.y,
      w: 1.2,
      h: this.isSteaming ? 5.0 : 0.2
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
  public isActive: boolean = true;
  public beamMesh: THREE.Mesh;
  private animTimer: number = Math.random() * 3.0;

  constructor(x: number, y: number, width: number = 3.0, beamHeight: number = 1.15, isIntermittent: boolean = false) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.beamHeight = beamHeight;
    this.isIntermittent = isIntermittent;
    this.mesh = new THREE.Group();

    const postH = Math.max(1.8, beamHeight + 0.6);
    // Left and Right Emitter Nodes
    const nodeGeo = new THREE.BoxGeometry(0.2, postH, 0.3);
    const nodeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8 });
    const leftNode = new THREE.Mesh(nodeGeo, nodeMat);
    leftNode.position.set(0, postH / 2, 0);
    const rightNode = new THREE.Mesh(nodeGeo, nodeMat);
    rightNode.position.set(width, postH / 2, 0);
    this.mesh.add(leftNode, rightNode);

    // Glowing Red Laser Beam
    const beamGeo = new THREE.CylinderGeometry(0.04, 0.04, width, 8);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
    this.beamMesh = new THREE.Mesh(beamGeo, beamMat);
    this.beamMesh.rotation.z = Math.PI / 2;
    this.beamMesh.position.set(width / 2, beamHeight, 0);
    this.mesh.add(this.beamMesh);

    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): void {
    this.animTimer += dt;

    if (this.isIntermittent) {
      const cycle = this.animTimer % 3.6;
      if (cycle < 2.0) {
        // Active Danger Laser
        this.isActive = true;
        this.beamMesh.visible = true;
        (this.beamMesh.material as THREE.MeshBasicMaterial).color.setHex(0xff0033);
        this.beamMesh.scale.x = 0.8 + Math.sin(this.animTimer * 16) * 0.3;
        this.beamMesh.scale.z = 0.8 + Math.sin(this.animTimer * 16) * 0.3;
      } else if (cycle < 2.8) {
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
  }

  public getBeamAABB(): BoundingBox2D {
    if (!this.isActive) {
      return { x: -999, y: -999, w: 0, h: 0 };
    }
    return {
      x: this.x + 0.1,
      y: this.y + this.beamHeight - 0.1,
      w: this.width - 0.2,
      h: 0.25
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

  constructor(x: number, y: number, w: number, deltaX: number = 0, deltaY: number = 0, speed: number = 1.5) {
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

    // Twin suspension cables
    const cableGeo = new THREE.CylinderGeometry(0.02, 0.02, 8, 6);
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9 });
    const cableL = new THREE.Mesh(cableGeo, cableMat);
    cableL.position.set(0.4, 4, 0);
    const cableR = new THREE.Mesh(cableGeo, cableMat);
    cableR.position.set(w - 0.4, 4, 0);
    this.mesh.add(cableL, cableR);

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
