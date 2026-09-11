import * as THREE from 'three';
import { BoundingBox2D } from './player';

export type EnemyType = 'security_bot' | 'skater_dog' | 'surveillance_drone';

// 0. ENEMY PLASMA PROJECTILE
export class EnemyProjectile {
  public mesh: THREE.Mesh;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number = 0.25;
  public isDeflected: boolean = false;
  public isDead: boolean = false;
  public life: number = 3.5;

  constructor(x: number, y: number, vx: number, vy: number = 0) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;

    const geo = new THREE.SphereGeometry(0.2, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.mesh.position.set(this.x, this.y, 0);
  }

  public deflect(): void {
    if (this.isDeflected) return;
    this.isDeflected = true;
    this.vx = -this.vx * 1.5;
    this.vy = -this.vy * 1.5;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x00f0ff);
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2
    };
  }
}

export abstract class BaseEnemy {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public prevX: number;
  public prevY: number;
  public baseY: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 1.0;
  public height: number = 1.0;
  public isDead: boolean = false;
  public deathTimer: number = 0;
  public scoreValue: number = 200;
  public turnCooldown: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.baseY = y;
    this.mesh = new THREE.Group();
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

  public abstract update(dt: number, playerX: number, onShoot?: (proj: EnemyProjectile) => void): void;
  public abstract reverseDirection(): void;

  public defeat(launchVx: number = 4, launchVy: number = 8): void {
    if (this.isDead) return;
    this.isDead = true;
    this.vx = launchVx;
    this.vy = launchVy;
  }
}

// 1. Security Patrol Bot (Fires plasma laser bolts when facing player)
export class SecurityBot extends BaseEnemy {
  private minX: number;
  private maxX: number;
  private patrolDir: number = 1;
  private sirenMesh: THREE.Mesh;
  private eyeMesh: THREE.Mesh;
  private animTimer: number = 0;
  private shootTimer: number = Math.random() * 2.0;

  constructor(x: number, y: number, patrolRange: number = 5) {
    super(x, y);
    this.minX = x - patrolRange;
    this.maxX = x + patrolRange;
    this.width = 1.1;
    this.height = 1.2;
    this.scoreValue = 300;

    // Body (dark steel box)
    const bodyGeo = new THREE.BoxGeometry(1.0, 0.8, 0.7);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22262c, metalness: 0.7, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    this.mesh.add(body);

    // Tread Base
    const treadGeo = new THREE.BoxGeometry(1.1, 0.22, 0.8);
    const treadMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const tread = new THREE.Mesh(treadGeo, treadMat);
    tread.position.y = 0.11;
    this.mesh.add(tread);

    // Neon Scanner Eye
    const eyeGeo = new THREE.BoxGeometry(0.7, 0.12, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    this.eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeMesh.position.set(0, 0.65, 0.36);
    this.mesh.add(this.eyeMesh);

    // Red Siren on Top
    const sirenGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12);
    const sirenMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff0000, emissiveIntensity: 0.8 });
    this.sirenMesh = new THREE.Mesh(sirenGeo, sirenMat);
    this.sirenMesh.position.set(0, 1.05, 0);
    this.mesh.add(this.sirenMesh);
  }

  public reverseDirection(): void {
    this.patrolDir = -this.patrolDir;
    this.turnCooldown = 0.8;
  }

  public update(dt: number, playerX: number, onShoot?: (proj: EnemyProjectile) => void): void {
    this.animTimer += dt;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= 30 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.mesh.rotation.z += 10 * dt;
      this.mesh.position.set(this.x, this.y, 0);
      return;
    }

    if (this.turnCooldown > 0) {
      this.turnCooldown -= dt;
    }

    const distToPlayer = Math.abs(this.x - playerX);
    let patrolSpeed = 2.8;

    // Player alert & shooting AI
    if (distToPlayer < 14) {
      patrolSpeed = 4.0;
      if (this.turnCooldown <= 0) {
        this.patrolDir = playerX < this.x ? -1 : 1;
      }

      this.shootTimer += dt;
      if (this.shootTimer >= 2.6) {
        this.shootTimer = 0;
        if (onShoot) {
          const dir = this.patrolDir;
          onShoot(new EnemyProjectile(this.x + dir * 0.7, this.y + 0.65, dir * 8.0, 0));
        }
      }
    }

    this.x += this.patrolDir * patrolSpeed * dt;
    if (this.x > this.maxX) {
      this.x = this.maxX;
      this.patrolDir = -1;
    } else if (this.x < this.minX) {
      this.x = this.minX;
      this.patrolDir = 1;
    }

    this.mesh.position.set(this.x, this.y, 0);
    this.mesh.rotation.y = this.patrolDir > 0 ? 0 : Math.PI;

    // Siren pulse (faster when player nearby)
    const freq = distToPlayer < 14 ? 24 : 12;
    const pulse = (Math.sin(this.animTimer * freq) > 0) ? 1.2 : 0.2;
    (this.sirenMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
  }
}

// 2. Skateboard Dog (High-speed pursuit & bunny-hop tricks)
export class SkaterDog extends BaseEnemy {
  private minX: number;
  private maxX: number;
  private dir: number = -1;
  private wheels: THREE.Mesh[] = [];
  private dogGroup: THREE.Group;
  private animTimer: number = 0;

  constructor(x: number, y: number, patrolRange: number = 8) {
    super(x, y);
    this.minX = x - patrolRange;
    this.maxX = x + patrolRange;
    this.width = 1.3;
    this.height = 1.0;
    this.scoreValue = 400;

    // Skateboard Deck
    const deckGeo = new THREE.BoxGeometry(1.4, 0.08, 0.4);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0xffe600, roughness: 0.4 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.y = 0.18;
    this.mesh.add(deck);

    // Skateboard Wheels (4 cylinders)
    const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3 });
    const wheelPositions = [
      [-0.45, 0.09, 0.2], [0.45, 0.09, 0.2],
      [-0.45, 0.09, -0.2], [0.45, 0.09, -0.2]
    ];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      this.mesh.add(wheel);
      this.wheels.push(wheel);
    });

    // Dog Body
    this.dogGroup = new THREE.Group();
    this.dogGroup.position.y = 0.22;
    this.mesh.add(this.dogGroup);

    // Bulldog Torso
    const dogMat = new THREE.MeshStandardMaterial({ color: 0xb57845, roughness: 0.6 });
    const bodyGeo = new THREE.BoxGeometry(0.7, 0.4, 0.35);
    const body = new THREE.Mesh(bodyGeo, dogMat);
    body.position.set(0, 0.25, 0);
    this.dogGroup.add(body);

    // Dog Head
    const headGeo = new THREE.BoxGeometry(0.4, 0.35, 0.35);
    const head = new THREE.Mesh(headGeo, dogMat);
    head.position.set(0.35, 0.45, 0);
    this.dogGroup.add(head);

    // Sunglasses
    const glassesGeo = new THREE.BoxGeometry(0.12, 0.1, 0.36);
    const glassesMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const glasses = new THREE.Mesh(glassesGeo, glassesMat);
    glasses.position.set(0.5, 0.48, 0);
    this.dogGroup.add(glasses);

    // Red Bandana
    const bandanaGeo = new THREE.BoxGeometry(0.2, 0.12, 0.36);
    const bandanaMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a });
    const bandana = new THREE.Mesh(bandanaGeo, bandanaMat);
    bandana.position.set(0.2, 0.35, 0);
    this.dogGroup.add(bandana);
  }

  public reverseDirection(): void {
    this.dir = -this.dir;
    this.turnCooldown = 0.8;
  }

  public update(dt: number, playerX: number): void {
    this.animTimer += dt;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= 30 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.mesh.rotation.z += 12 * dt;
      this.mesh.position.set(this.x, this.y, 0);
      return;
    }

    if (this.turnCooldown > 0) {
      this.turnCooldown -= dt;
    }

    const distToPlayer = Math.abs(this.x - playerX);
    let speed = 4.2;

    // Aggressive pursuit when player is nearby
    if (distToPlayer < 14) {
      speed = 7.2; // Turbo charge!
      if (this.turnCooldown <= 0) {
        if (playerX > this.x + 1.2) {
          this.dir = 1;
        } else if (playerX < this.x - 1.2) {
          this.dir = -1;
        }
      }

      // Bunny hop occasionally while chasing
      if (this.vy === 0 && Math.sin(this.animTimer * 5) > 0.85) {
        this.vy = 7.0;
      }
    }

    // Gravity for bunny hop relative to baseY
    if (this.vy !== 0 || this.y > this.baseY) {
      this.vy -= 26 * dt;
      this.y += this.vy * dt;
      if (this.y <= this.baseY) {
        this.y = this.baseY;
        this.vy = 0;
      }
    }

    this.x += this.dir * speed * dt;
    if (this.x < this.minX) {
      this.x = this.minX;
      this.dir = 1;
    } else if (this.x > this.maxX) {
      this.x = this.maxX;
      this.dir = -1;
    }

    this.mesh.position.set(this.x, this.y, 0);
    this.mesh.rotation.y = this.dir > 0 ? 0 : Math.PI;

    // Roll wheels
    this.wheels.forEach((w) => {
      w.rotation.z += (this.dir * speed * dt) / 0.09;
    });

    // Dog leaning with inertia
    this.dogGroup.rotation.z = Math.sin(this.animTimer * 10) * 0.08;
  }
}

// 3. Surveillance Drone (Horizontal patrol, dive-bomb swoop & vertical plasma drops)
export class SurveillanceDrone extends BaseEnemy {
  private startY: number;
  private minX: number;
  private maxX: number;
  private patrolDir: number = 1;
  private animTimer: number = 0;
  private dropTimer: number = Math.random() * 2.0;
  private propLeft: THREE.Mesh;
  private propRight: THREE.Mesh;
  private spotLightBeam: THREE.Mesh;

  constructor(x: number, y: number, patrolRange: number = 6) {
    super(x, y);
    this.startY = y;
    this.minX = x - patrolRange;
    this.maxX = x + patrolRange;
    this.width = 1.0;
    this.height = 1.0;
    this.scoreValue = 350;

    // Drone Orb Body
    const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    this.mesh.add(body);

    // Glowing Cyan Core Ring
    const ringGeo = new THREE.TorusGeometry(0.36, 0.04, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    this.mesh.add(ring);

    // Twin Rotor Arms & Propellers
    const armGeo = new THREE.BoxGeometry(1.2, 0.06, 0.08);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x4b5563 });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.y = 0.55;
    this.mesh.add(arm);

    const propGeo = new THREE.BoxGeometry(0.45, 0.02, 0.06);
    const propMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    this.propLeft = new THREE.Mesh(propGeo, propMat);
    this.propLeft.position.set(-0.55, 0.6, 0);
    this.mesh.add(this.propLeft);

    this.propRight = new THREE.Mesh(propGeo, propMat);
    this.propRight.position.set(0.55, 0.6, 0);
    this.mesh.add(this.propRight);

    // Downward Spotlight Cone
    const coneGeo = new THREE.ConeGeometry(0.7, 1.4, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xff1a1a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    this.spotLightBeam = new THREE.Mesh(coneGeo, coneMat);
    this.spotLightBeam.position.set(0, -0.2, 0);
    this.mesh.add(this.spotLightBeam);
  }

  public reverseDirection(): void {
    this.patrolDir = -this.patrolDir;
    this.turnCooldown = 0.8;
  }

  public update(dt: number, playerX: number, onShoot?: (proj: EnemyProjectile) => void): void {
    this.animTimer += dt;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= 30 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.mesh.rotation.x += 8 * dt;
      this.mesh.position.set(this.x, this.y, 0);
      return;
    }

    // Horizontal patrol
    this.x += this.patrolDir * 3.2 * dt;
    if (this.x > this.maxX) {
      this.x = this.maxX;
      this.patrolDir = -1;
    } else if (this.x < this.minX) {
      this.x = this.minX;
      this.patrolDir = 1;
    }

    // Swoop down when player is nearby
    const distToPlayer = Math.abs(this.x - playerX);
    if (distToPlayer < 10) {
      const targetY = this.startY - 1.4;
      this.y = THREE.MathUtils.lerp(this.y, targetY + Math.sin(this.animTimer * 4) * 0.4, 3.2 * dt);

      // Vertical plasma bomb drop if right above player
      if (distToPlayer < 1.4) {
        this.dropTimer += dt;
        if (this.dropTimer >= 2.2) {
          this.dropTimer = 0;
          if (onShoot) {
            onShoot(new EnemyProjectile(this.x, this.y - 0.2, 0, -6.5));
          }
        }
      }
    } else {
      this.y = THREE.MathUtils.lerp(this.y, this.startY + Math.sin(this.animTimer * 3.5) * 0.6, 2.5 * dt);
    }

    this.mesh.position.set(this.x, this.y, 0);

    // Spin propellers fast
    this.propLeft.rotation.y += 35 * dt;
    this.propRight.rotation.y += 35 * dt;
  }
}
