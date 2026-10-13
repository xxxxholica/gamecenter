// ============================================================
// Visual FX Engine: Camera Shake, Flying Student Projectiles,
// Particle Debris, and Explosions using Three.js Primitives
// ============================================================

import * as THREE from 'three';

export interface RocketProjectile {
  mesh: THREE.Group;
  vx: number;
  vy: number;
  vz: number;
  targetZ: number;
  alive: boolean;
}

export interface DebrisParticle {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  rotVx: number;
  rotVy: number;
  life: number;
  maxLife: number;
}

export class EffectsManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Camera shake state
  private shakeIntensity: number = 0;
  private shakeDuration: number = 0;
  private shakeTimer: number = 0;
  public cameraBaseOffset: THREE.Vector3 = new THREE.Vector3(0, 5.5, 9.5);
  public cameraLookOffset: THREE.Vector3 = new THREE.Vector3(0, 1.2, -6.0);

  // Projectiles (Students launched at boss wall)
  public projectiles: RocketProjectile[] = [];

  // Debris Particles
  public particles: DebrisParticle[] = [];
  private particleGeometry: THREE.BoxGeometry;
  private redParticleMat: THREE.MeshBasicMaterial;
  private yellowParticleMat: THREE.MeshBasicMaterial;
  private brickParticleMat: THREE.MeshLambertMaterial;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    this.particleGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    this.redParticleMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
    this.yellowParticleMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
    this.brickParticleMat = new THREE.MeshLambertMaterial({ color: 0x6e2619 });
  }

  // Trigger screen shake
  public shake(intensity: number = 0.35, duration: number = 0.25): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = duration;
    this.shakeTimer = duration;
  }

  // Spawn scatter debris when students are lost or damaged
  public spawnDispersalDebris(x: number, y: number, z: number, count: number = 10, isNegative: boolean = true): void {
    const mat = isNegative ? this.redParticleMat : this.yellowParticleMat;
    for (let i = 0; i < count; i++) {
      const p = new THREE.Mesh(this.particleGeometry, mat);
      p.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.5, z + (Math.random() - 0.5) * 0.5);
      this.scene.add(p);

      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 8 + 4;
      this.particles.push({
        mesh: p,
        vx: Math.cos(angle) * speed,
        vy: Math.random() * 8 + 3,
        vz: Math.sin(angle) * speed,
        rotVx: Math.random() * 15,
        rotVy: Math.random() * 15,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4
      });
    }
  }

  // Massive explosion when the graduation wall breaks
  public spawnWallShatter(wallX: number, wallY: number, wallZ: number, width: number, height: number): void {
    const cols = 12;
    const rows = 8;
    const blockW = width / cols;
    const blockH = height / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const geo = new THREE.BoxGeometry(blockW * 0.9, blockH * 0.9, 0.8);
        const p = new THREE.Mesh(geo, this.brickParticleMat);
        const px = wallX - width / 2 + (c + 0.5) * blockW;
        const py = wallY - height / 2 + (r + 0.5) * blockH;
        p.position.set(px, py, wallZ);
        this.scene.add(p);

        // Blasted forward & outward
        const angle = Math.atan2(py - wallY, px - wallX);
        const speed = Math.random() * 18 + 10;

        this.particles.push({
          mesh: p,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 6,
          vy: Math.random() * 14 + 6,
          vz: -Math.random() * 25 - 8, // Blasted backward through the wall
          rotVx: (Math.random() - 0.5) * 20,
          rotVy: (Math.random() - 0.5) * 20,
          life: 0,
          maxLife: 2.2 + Math.random() * 0.8
        });
      }
    }
  }

  // Update projectiles, particles, and camera shake
  public update(dt: number, targetCamPos: THREE.Vector3, targetLookAt: THREE.Vector3, onProjectileImpact?: (x: number, y: number, z: number) => void): void {
    // 1. Update Camera Shake
    let shakeOffset = new THREE.Vector3(0, 0, 0);
    if (this.shakeTimer > 0) {
      this.shakeTimer -= dt;
      const progress = this.shakeTimer / this.shakeDuration;
      const curIntensity = this.shakeIntensity * progress;
      shakeOffset.set(
        (Math.random() - 0.5) * 2 * curIntensity,
        (Math.random() - 0.5) * 2 * curIntensity,
        (Math.random() - 0.5) * curIntensity
      );
      if (this.shakeTimer <= 0) {
        this.shakeIntensity = 0;
      }
    }

    this.camera.position.copy(targetCamPos).add(shakeOffset);
    this.camera.lookAt(targetLookAt);

    // 2. Update Projectiles
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      if (!proj.alive) continue;

      proj.mesh.position.x += proj.vx * dt;
      proj.mesh.position.y += proj.vy * dt;
      proj.mesh.position.z += proj.vz * dt;

      // Projectile rotation towards direction of travel
      proj.mesh.rotation.x = 0.2;

      // Check reached wall
      if (proj.mesh.position.z <= proj.targetZ) {
        const impactX = proj.mesh.position.x;
        const impactY = proj.mesh.position.y;
        const impactZ = proj.targetZ;

        proj.alive = false;
        this.scene.remove(proj.mesh);
        this.projectiles.splice(i, 1);

        if (onProjectileImpact) {
          onProjectileImpact(impactX, impactY, impactZ);
        }
      }
    }

    // 3. Update Debris Particles
    const gravity = -24.0;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      p.vy += gravity * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;

      // Ground bounce
      if (p.mesh.position.y < 0.1) {
        p.mesh.position.y = 0.1;
        p.vy = -p.vy * 0.45;
      }

      p.mesh.rotation.x += p.rotVx * dt;
      p.mesh.rotation.y += p.rotVy * dt;

      // Fade scale near end of life
      const remaining = 1 - (p.life / p.maxLife);
      if (remaining < 0.3) {
        const s = remaining / 0.3;
        p.mesh.scale.set(s, s, s);
      }
    }
  }

  public clearAll(): void {
    this.projectiles.forEach(p => this.scene.remove(p.mesh));
    this.projectiles = [];
    this.particles.forEach(p => this.scene.remove(p.mesh));
    this.particles = [];
    this.shakeIntensity = 0;
    this.shakeTimer = 0;
  }
}
