import * as THREE from 'three';
import type { CarController } from './CarController';
import type { Traffic, NpcCar } from './Traffic';
import type { MapBase } from '../maps/MapBase';

let sfxModule: any = null;
if (typeof window !== 'undefined') {
  import('../audio/index.ts').then((m) => { sfxModule = m.audio.sfx; }).catch(() => {});
}
function playSfx(call: (sfx: any) => void): void {
  if (sfxModule) {
    try { call(sfxModule); } catch {}
  }
}

export interface CombatTarget {
  id: string;
  isPlayer: boolean;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  rotationY: number;
  hp: number;
  maxHp: number;
  isDead: boolean;
  carType: string;
  obj?: THREE.Object3D;
  npcRef?: NpcCar;
}

export interface Bullet {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  target: CombatTarget | null;
  shooterId: string;
  life: number;
  maxLife: number;
  homingFactor: number;
}

export interface Missile {
  group: THREE.Group;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  speed: number;
  target: CombatTarget | null;
  shooterId: string;
  life: number;
  smokeTimer: number;
}

export interface ExplosionParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
  initialScale: number;
  scaleVector?: THREE.Vector3;
  shrink?: boolean;
  noGravity?: boolean;
}

export interface CarDebrisPiece {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
  bounceCount: number;
  hasTrail: boolean;
}

export interface RoadCrater {
  group: THREE.Group;
  position: THREE.Vector3;
  radius: number;
  createdAt: number;
  lifetime: number; // in seconds until restored
  state: 'opening' | 'active' | 'restoring' | 'done';
  fallingBlocks: { mesh: THREE.Mesh; initialY: number; fallSpeed: number; rotSpeed: THREE.Vector3 }[];
  craterRimMesh: THREE.Mesh;
  blackVoidMesh: THREE.Mesh;
  smokeTimer: number;
}

export class CombatSystem {
  public scene: THREE.Scene;
  public playerController: CarController | null = null;
  public traffic: Traffic | null = null;
  public map: MapBase | null = null;

  // Camera trauma shake callback
  public onCameraShake?: (amount: number) => void;

  // Threat warning
  public incomingThreatTimer = 0;

  /** レース開始フラグ: 開始前（カウントダウン中等）はガンナー・ミサイルの照準・発射を禁止 */
  public raceStarted = true;

  // Player combat status
  public playerHp = 3;
  public playerMaxHp = 3;
  public playerIsDead = false;
  public playerFlyVelocity = new THREE.Vector3();
  public playerFlyAngular = new THREE.Vector3();
  public playerRespawnTimer = 0;
  public playerInvincibleTimer = 0;
  public playerShootCooldown = 0;
  private rearPipeFlameTimer = 0;
  public timeSinceLastDamage = 0;
  private autoRepairTimer = 0;

  // Objects in simulation
  private bullets: Bullet[] = [];
  private missiles: Missile[] = [];
  public craters: RoadCrater[] = []; // Maintained empty for backward compatibility (craters abolished)
  private particles: ExplosionParticle[] = [];
  private carDebris: CarDebrisPiece[] = [];

  // Reusable geometry / materials
  private bulletGeo: THREE.CylinderGeometry;
  private bulletMat: THREE.MeshBasicMaterial;
  private missileBodyGeo: THREE.CylinderGeometry;
  private missileNoseGeo: THREE.ConeGeometry;
  private missileBodyMat: THREE.MeshStandardMaterial;
  private missileNoseMat: THREE.MeshBasicMaterial;
  private smokeGeo: THREE.DodecahedronGeometry;
  private smokeMat: THREE.MeshBasicMaterial;
  private fireMat: THREE.MeshBasicMaterial;
  private flameGeo: THREE.ConeGeometry;
  private pipeFlameGeo: THREE.ConeGeometry;
  private flameCoreMat: THREE.MeshBasicMaterial;

  // 3D Lock-on Diamond Pointer Marker (ひし形のみ)
  public camera: THREE.Camera | null = null;
  private lockOnReticleGroup: THREE.Group;
  private lockOnDiamond: THREE.Mesh;

  // Lock-on status for HUD
  public currentLockOn: { targetName: string; dist: number; state: 'ready' | 'too_close' | 'too_far' | 'locked' } | null = null;

  constructor(scene: THREE.Scene, camera?: THREE.Camera) {
    this.scene = scene;
    this.camera = camera ?? null;

    // Bullet (Glowing tracer)
    this.bulletGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.8, 6);
    this.bulletGeo.rotateX(Math.PI / 2);
    this.bulletMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });

    // Missile model
    this.missileBodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 1.2, 8);
    this.missileBodyGeo.rotateX(Math.PI / 2);
    this.missileNoseGeo = new THREE.ConeGeometry(0.12, 0.35, 8);
    this.missileNoseGeo.rotateX(Math.PI / 2);
    this.missileBodyMat = new THREE.MeshStandardMaterial({ color: 0x3d4f33, roughness: 0.4, metalness: 0.6 });
    this.missileNoseMat = new THREE.MeshBasicMaterial({ color: 0xff3322 });

    // Particles & Muzzle Flames
    this.smokeGeo = new THREE.DodecahedronGeometry(0.35, 0);
    this.smokeMat = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.7 });
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff7711, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    this.flameGeo = new THREE.ConeGeometry(0.18, 0.85, 6);
    this.flameGeo.rotateX(Math.PI / 2);

    // Dedicated compact flame geometry for Combat Sedan rear exhaust pipes:
    // Base radius 0.040m (neatly inside 0.065m pipe), length 0.38m, translated so base is at Z=0
    this.pipeFlameGeo = new THREE.ConeGeometry(0.040, 0.38, 8);
    this.pipeFlameGeo.rotateX(Math.PI / 2);
    this.pipeFlameGeo.translate(0, 0, 0.19);

    this.flameCoreMat = new THREE.MeshBasicMaterial({
      color: 0xffea44,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    // 3D Lock-on Diamond Pointer Marker (ひし形のみ)
    this.lockOnReticleGroup = new THREE.Group();
    this.lockOnReticleGroup.name = 'combat_lockon_reticle';
    this.lockOnReticleGroup.visible = false;

    // Diamond pointer marker (◆) framing the locked vehicle
    const diamondGeo = new THREE.RingGeometry(1.2, 1.45, 4);
    const diamondMat = new THREE.MeshBasicMaterial({
      color: 0xff2233,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    this.lockOnDiamond = new THREE.Mesh(diamondGeo, diamondMat);
    this.lockOnDiamond.position.y = 0.9;
    this.lockOnReticleGroup.add(this.lockOnDiamond);

    this.lockOnReticleGroup.renderOrder = 999;
    this.scene.add(this.lockOnReticleGroup);
  }

  public setEntities(player: CarController, traffic: Traffic | null, map: MapBase | null, camera?: THREE.Camera): void {
    this.playerController = player;
    this.traffic = traffic;
    this.map = map;
    if (camera) this.camera = camera;
    this.updatePlayerMaxHp();
    this.playerHp = this.playerMaxHp;
  }

  public updatePlayerMaxHp(): void {
    if (!this.playerController?.car) return;
    const name = this.playerController.car.specs.name.toUpperCase();
    if (name.includes('TRAIL')) {
      this.playerMaxHp = 5;
    } else if (name.includes('COMBAT')) {
      this.playerMaxHp = 4;
    } else if (name.includes('MLRS') || name.includes('TRUCK')) {
      this.playerMaxHp = 3;
    } else if (name.includes('CROSS')) {
      this.playerMaxHp = 2;
    } else {
      this.playerMaxHp = 3;
    }
  }

  public reset(): void {
    // Clean up all active projectiles and craters
    for (const b of this.bullets) this.scene.remove(b.mesh);
    for (const m of this.missiles) this.scene.remove(m.group);
    for (const c of this.craters) this.scene.remove(c.group);
    for (const p of this.particles) this.scene.remove(p.mesh);
    for (const d of this.carDebris) this.scene.remove(d.mesh);

    this.bullets = [];
    this.missiles = [];
    this.craters = [];
    this.particles = [];
    this.carDebris = [];
    this.lockOnReticleGroup.visible = false;

    this.updatePlayerMaxHp();
    this.playerHp = this.playerMaxHp;
    this.playerIsDead = false;
    this.playerFlyVelocity.set(0, 0, 0);
    this.playerFlyAngular.set(0, 0, 0);
    this.playerRespawnTimer = 0;
    this.playerInvincibleTimer = 0;
    this.playerShootCooldown = 0;
    this.rearPipeFlameTimer = 0;
    this.timeSinceLastDamage = 0;
    this.autoRepairTimer = 0;
    this.currentLockOn = null;
  }

  /** Gathers all active potential targets */
  private getAllTargets(excludeId?: string): CombatTarget[] {
    const list: CombatTarget[] = [];

    // 1. Player
    if (this.playerController && excludeId !== 'player') {
      const p = this.playerController;
      const speed = p.speed;
      const rotY = p.rotationY;
      const vel = new THREE.Vector3(Math.sin(rotY) * speed, 0, Math.cos(rotY) * speed);
      const carType = p.car ? (p.car.specs.name.includes('COMBAT') ? 'combat_sedan' : p.car.specs.name.includes('MLRS') ? 'missile_truck_j' : 'normal') : 'normal';

      list.push({
        id: 'player',
        isPlayer: true,
        position: p.position.clone(),
        velocity: vel,
        rotationY: rotY,
        hp: this.playerHp,
        maxHp: this.playerMaxHp,
        isDead: this.playerIsDead || this.playerInvincibleTimer > 0,
        carType,
        obj: p.car.group,
      });
    }

    // 2. NPCs
    if (this.traffic) {
      for (let i = 0; i < this.traffic.cars.length; i++) {
        const npc = this.traffic.cars[i];
        const id = `npc_${i}`;
        if (id === excludeId || !npc.obj.visible) continue;

        const vel = new THREE.Vector3(Math.sin(npc.obj.rotation.y) * npc.speed, 0, Math.cos(npc.obj.rotation.y) * npc.speed);

        list.push({
          id,
          isPlayer: false,
          position: npc.obj.position.clone(),
          velocity: vel,
          rotationY: npc.obj.rotation.y,
          hp: npc.hp ?? 3,
          maxHp: npc.maxHp ?? 3,
          isDead: !!npc.isDead,
          carType: npc.kind || 'normal',
          obj: npc.obj,
          npcRef: npc,
        });
      }
    }

    return list;
  }

  /** Accurately retrieves the road surface elevation Y at position */
  public getRoadSurfaceY(pos: { x: number; y?: number; z: number }): number {
    if (this.map && typeof (this.map as any).getSurfaceY === 'function') {
      const sy = (this.map as any).getSurfaceY(pos);
      if (typeof sy === 'number' && !isNaN(sy)) return sy;
    }
    if (this.playerController) {
      return this.playerController.position.y;
    }
    return 0;
  }

  public update(dt: number): void {
    if (this.incomingThreatTimer > 0) {
      this.incomingThreatTimer -= dt;
    }

    if (this.playerInvincibleTimer > 0) {
      this.playerInvincibleTimer -= dt;
      // Blink car visibility
      if (this.playerController && !this.playerIsDead) {
        this.playerController.car.group.visible = Math.floor(Date.now() / 100) % 2 === 0;
      }
    } else if (this.playerController && !this.playerIsDead) {
      this.playerController.car.group.visible = true;
    }

    // 1. Process Player death tumble & respawn
    if (this.playerIsDead) {
      this.playerRespawnTimer -= dt;
      if (this.playerController) {
        this.playerController.car.group.visible = false; // Intact car is hidden, replaced by shattered debris
        const p = this.playerController.position;
        p.x += this.playerFlyVelocity.x * dt;
        p.y += this.playerFlyVelocity.y * dt;
        p.z += this.playerFlyVelocity.z * dt;
      }
      this.playerFlyVelocity.y -= 26 * dt; // Gravity

      if (this.playerRespawnTimer <= 0) {
        this.respawnPlayer();
      }
    }

    // 2. Process NPC death tumble & respawn
    if (this.traffic) {
      for (const npc of this.traffic.cars) {
        if (npc.isDead) {
          npc.respawnTimer = (npc.respawnTimer ?? 0) - dt;
          npc.obj.visible = false; // Intact car is hidden, replaced by shattered debris
          if (npc.flyVelocity && npc.flyAngularVelocity) {
            npc.obj.position.x += npc.flyVelocity.x * dt;
            npc.obj.position.y += npc.flyVelocity.y * dt;
            npc.obj.position.z += npc.flyVelocity.z * dt;
            npc.flyVelocity.y -= 26 * dt;
          }

          if ((npc.respawnTimer ?? 0) <= 0) {
            npc.isDead = false;
            npc.hp = npc.maxHp;
            npc.obj.visible = true;
            npc.flyVelocity = undefined;
            npc.flyAngularVelocity = undefined;
          }
        }
      }
    }

    // Trail J: 本格4WDのセーフティ・自己修復機能（4.5秒間被弾なしで3秒ごとに+1 HP回復）
    this.timeSinceLastDamage += dt;
    if (this.playerController?.car?.specs?.name?.toUpperCase().includes('TRAIL')) {
      if (!this.playerIsDead && this.playerHp < this.playerMaxHp && this.timeSinceLastDamage >= 4.5) {
        this.autoRepairTimer += dt;
        if (this.autoRepairTimer >= 3.0) {
          this.playerHp = Math.min(this.playerMaxHp, this.playerHp + 1);
          this.autoRepairTimer = 0;
          playSfx((s) => s.blip(0.4));
        }
      }
    }

    // 3. Auto-targeting and firing for Player (レース開始前は使用不可)
    if (this.raceStarted && this.playerController?.canDrive !== false) {
      this.updatePlayerCombat(dt);
    } else {
      this.currentLockOn = null;
      this.lockOnReticleGroup.visible = false;
    }

    // 4. Auto-targeting and firing for Combat NPCs (レース開始前は使用不可)
    if (this.raceStarted) {
      this.updateNpcCombat(dt);
    }

    // 5. Update Projectiles
    this.updateBullets(dt);
    this.updateMissiles(dt);

    // 6. Update explosion particles & shattered car debris (Craters abolished)
    this.updateParticles(dt);
    this.updateCarDebris(dt);
  }

  /** Player automatic targeting & shooting */
  private updatePlayerCombat(dt: number): void {
    if (!this.playerController || this.playerIsDead) {
      this.lockOnReticleGroup.visible = false;
      this.currentLockOn = null;
      return;
    }

    const carType = this.playerController.car.specs.name;
    const isCombatSedan = carType.includes('COMBAT');
    const isMissileTruck = carType.includes('MLRS');

    if (!isCombatSedan && !isMissileTruck) {
      this.currentLockOn = null;
      this.lockOnReticleGroup.visible = false;
      return;
    }

    this.playerShootCooldown -= dt;
    const pPos = this.playerController.position;
    const fwd = new THREE.Vector3(Math.sin(this.playerController.rotationY), 0, Math.cos(this.playerController.rotationY)).normalize();

    // Twin rear upward-pointing pipes: update anchored swaying flame and slipstream sparks
    if (isCombatSedan && !this.playerIsDead) {
      if ((this.playerController.car as any).updateExhaustFlames) {
        (this.playerController.car as any).updateExhaustFlames(dt, this.playerController.speed, this.playerShootCooldown > 0);
      }
      this.rearPipeFlameTimer = (this.rearPipeFlameTimer || 0) + dt;
      const speed = Math.abs(this.playerController.speed);
      const interval = speed > 22 ? 0.10 : 0.18;
      if (this.rearPipeFlameTimer >= interval) {
        this.rearPipeFlameTimer = 0;
        if (speed > 10 || this.playerShootCooldown > 0) {
          this.emitRearPipeFlames(pPos, fwd, this.playerController.speed, false);
        }
      }
    }

    // Find best target ahead
    const targets = this.getAllTargets('player');
    let bestTarget: CombatTarget | null = null;
    let bestDist = Infinity;

    for (const t of targets) {
      if (t.isDead) continue;
      const toT = t.position.clone().sub(pPos);
      const dist = toT.length();
      const dot = toT.clone().normalize().dot(fwd);

      // Must be roughly ahead (within ~75 degree cone)
      if (dot > 0.40) {
        if (isCombatSedan && dist >= 6 && dist <= 45) {
          if (dist < bestDist) {
            bestDist = dist;
            bestTarget = t;
          }
        } else if (isMissileTruck && dist >= 22 && dist <= (t.carType.toLowerCase().includes('cross') ? 62 : 88)) {
          if (dist < bestDist) {
            bestDist = dist;
            bestTarget = t;
          }
        }
      }
    }

    // Update Lock-on HUD status and 3D Pointer Reticle marker
    if (bestTarget) {
      this.currentLockOn = {
        targetName: bestTarget.isPlayer ? 'RIVAL PLAYER' : `NPC (${bestTarget.carType.toUpperCase()})`,
        dist: Math.round(bestDist),
        state: 'locked',
      };

      // Position and animate 3D lock-on diamond pointer (ひし形のみ) directly on target
      this.lockOnReticleGroup.visible = true;
      this.lockOnReticleGroup.position.copy(bestTarget.position);

      // Billboard diamond to face camera if available, otherwise player
      if (this.camera) {
        this.lockOnDiamond.lookAt(this.camera.position);
      } else {
        this.lockOnDiamond.lookAt(pPos);
      }

      // Breathing pulse animation
      const tSec = performance.now() * 0.003;
      const pulse = 1.0 + Math.sin(tSec * 6.0) * 0.1;
      this.lockOnDiamond.scale.set(pulse, pulse, 1.0);
    } else {
      this.lockOnReticleGroup.visible = false;

      // Check if nearest car is too close or too far for informative HUD
      let nearestDist = Infinity;
      for (const t of targets) {
        if (t.isDead) continue;
        const toT = t.position.clone().sub(pPos);
        const dist = toT.length();
        const dot = toT.clone().normalize().dot(fwd);
        if (dot > 0.40 && dist < nearestDist) nearestDist = dist;
      }

      if (isMissileTruck && nearestDist < 22) {
        this.currentLockOn = { targetName: 'WARNING', dist: Math.round(nearestDist), state: 'too_close' };
      } else if (this.incomingThreatTimer > 0) {
        this.currentLockOn = { targetName: 'INCOMING ENEMY FIRE', dist: 0, state: 'threat' as any };
      } else if (nearestDist < 120) {
        this.currentLockOn = { targetName: 'TARGETING', dist: Math.round(nearestDist), state: 'too_far' };
      } else {
        this.currentLockOn = null;
      }
    }

    // Auto-fire when target is locked and cooldown elapsed
    if (bestTarget && this.playerShootCooldown <= 0) {
      if (isCombatSedan) {
        this.fireMachineGun('player', pPos, fwd, bestTarget);
        this.playerShootCooldown = 0.45; // Rapid 2-burst rate
      } else if (isMissileTruck) {
        this.fireHomingMissile('player', pPos, fwd, bestTarget);
        this.playerShootCooldown = 2.0; // 2 seconds MLRS salvo reload
      }
    }
  }

  /** Combat NPCs automatic targeting & shooting */
  private updateNpcCombat(dt: number): void {
    if (!this.traffic) return;

    for (let i = 0; i < this.traffic.cars.length; i++) {
      const npc = this.traffic.cars[i];
      if (npc.isDead || !npc.obj.visible) continue;

      const isSedan = npc.kind === 'combat_sedan';
      const isTruck = npc.kind === 'missile_truck';
      if (!isSedan && !isTruck) continue;

      npc.weaponCooldown = (npc.weaponCooldown ?? (2.0 + Math.random() * 2.0)) - dt;
      if (npc.weaponCooldown > 0) continue;

      const nPos = npc.obj.position;
      const fwd = new THREE.Vector3(Math.sin(npc.obj.rotation.y), 0, Math.cos(npc.obj.rotation.y)).normalize();
      const myId = `npc_${i}`;
      (npc as any).combatId = myId;

      const targets = this.getAllTargets(myId);
      let bestTarget: CombatTarget | null = null;
      let bestDist = Infinity;

      for (const t of targets) {
        if (t.isDead) continue;
        const toT = t.position.clone().sub(nPos);
        const dist = toT.length();
        const dot = toT.clone().normalize().dot(fwd);

        if (dot > 0.45) {
          // Cross J drifting evasion: 高速ドリフト中はミサイルのロックオンを完全に振り切る
          const isCrossPlayer = t.isPlayer && (this.playerController?.car?.specs?.name?.toUpperCase().includes('CROSS') ?? false);
          if (isCrossPlayer && this.playerController?.isDrifting && Math.abs(this.playerController.speed) > 18) {
            continue;
          }

          // NPCs prioritize targeting other NPCs over player so player isn't unfairly ganked from behind
          // Cross Jは車体が小型・高機動なため照準に2.0倍の距離換算ペナルティ
          const isCrossTarget = isCrossPlayer || t.carType.toLowerCase().includes('cross');
          const stealthFactor = isCrossTarget ? 2.0 : 1.0;
          const effectiveDist = (t.isPlayer ? dist * 1.6 : dist) * stealthFactor;
          const maxTruckRange = isCrossTarget ? 60 : 82;

          if (isSedan && dist >= 6 && dist <= 42) {
            if (effectiveDist < bestDist) { bestDist = effectiveDist; bestTarget = t; }
          } else if (isTruck && dist >= 24 && dist <= maxTruckRange) {
            if (effectiveDist < bestDist) { bestDist = effectiveDist; bestTarget = t; }
          }
        }
      }

      if (bestTarget) {
        if (isSedan) {
          this.fireMachineGun(myId, nPos, fwd, bestTarget);
          npc.weaponCooldown = bestTarget.isPlayer ? (4.2 + Math.random() * 1.5) : (1.4 + Math.random() * 0.6);
        } else if (isTruck) {
          this.fireHomingMissile(myId, nPos, fwd, bestTarget);
          npc.weaponCooldown = bestTarget.isPlayer ? (5.5 + Math.random() * 2.0) : (3.2 + Math.random() * 1.0);
        }

        if (bestTarget.isPlayer) {
          this.incomingThreatTimer = 2.5;
        }
      }
    }
  }

  /** Fires twin machine gun bullets with muzzle fire and tracer from Combat Sedan's roof turret */
  public fireMachineGun(shooterId: string, origin: THREE.Vector3, forward: THREE.Vector3, target: CombatTarget): void {
    playSfx((s) => s.machineGun());

    let shooterSpeed = 0;
    // Firing recoil vibration on shooter vehicle & camera trauma shake
    if (shooterId === 'player') {
      shooterSpeed = this.playerController?.speed ?? 0;
      this.playerController?.applyRecoilKick(0.018, (Math.random() - 0.5) * 0.012);
      this.onCameraShake?.(0.14);
    } else if (this.traffic) {
      const npcIdx = parseInt(shooterId.replace('npc_', ''), 10);
      const npc = this.traffic.cars[npcIdx];
      if (npc) {
        shooterSpeed = npc.speed ?? 0;
        npc.obj.rotation.x -= 0.025;
      }
    }

    // 1. Huge vertical flame blasts erupting from the two upward-pointing pipes at the back of Combat Sedan!
    this.emitRearPipeFlames(origin, forward, shooterSpeed, true);

    // 2. Twin roof gun barrels protruding on top of Combat Sedan:
    // Model coordinates: x = ±0.14, y = 1.86, z = 1.2
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    [-0.14, 0.14].forEach((offset) => {
      const pos = origin.clone().add(forward.clone().multiplyScalar(1.2)).add(right.clone().multiplyScalar(offset));
      pos.y += 1.86; // Exactly at the top roof turret barrel tips

      // Emit roaring muzzle fire burst directly from the top protrusion!
      this.emitRoofMuzzleFire(pos, forward, shooterSpeed);

      const mesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const vel = forward.clone().multiplyScalar(115); // High velocity 115 m/s

      this.bullets.push({
        mesh,
        position: pos,
        velocity: vel,
        target,
        shooterId,
        life: 0,
        maxLife: 0.65,
        homingFactor: 4.5,
      });
    });
  }

  /** Fires a heavy homing rocket with smoke trail */
  public fireHomingMissile(shooterId: string, origin: THREE.Vector3, forward: THREE.Vector3, target: CombatTarget): void {
    playSfx((s) => s.missileLaunch());

    // Heavy rocket launch recoil kick & camera trauma
    if (shooterId === 'player') {
      this.playerController?.applyRecoilKick(0.085, (Math.random() - 0.5) * 0.035);
      this.onCameraShake?.(0.55);
    } else if (this.traffic) {
      const npcIdx = parseInt(shooterId.replace('npc_', ''), 10);
      const npc = this.traffic.cars[npcIdx];
      if (npc) {
        npc.obj.rotation.x -= 0.07;
      }
    }

    const mGroup = new THREE.Group();
    const body = new THREE.Mesh(this.missileBodyGeo, this.missileBodyMat);
    const nose = new THREE.Mesh(this.missileNoseGeo, this.missileNoseMat);
    nose.position.z = 0.72;
    mGroup.add(body);
    mGroup.add(nose);

    // Launch from top MLRS rack with slight random tilt
    const startPos = origin.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.85, (Math.random() - 0.5) * 0.4));
    mGroup.position.copy(startPos);
    this.scene.add(mGroup);

    // Initial launch kick: Upwards and forwards with high launch speed
    const initialVel = forward.clone().multiplyScalar(75).add(new THREE.Vector3(0, 3.0, 0));

    this.missiles.push({
      group: mGroup,
      position: startPos,
      velocity: initialVel,
      speed: 75, // rapidly accelerates up to 135 m/s
      target,
      shooterId,
      life: 0,
      smokeTimer: 0,
    });
  }

  /** Updates bullets flying and checks collisions */
  private updateBullets(dt: number): void {
    const alive: Bullet[] = [];
    const allTargets = this.getAllTargets();

    for (const b of this.bullets) {
      b.life += dt;
      if (b.life >= b.maxLife) {
        this.scene.remove(b.mesh);
        continue;
      }

      // Keep bullet target live position updated
      if (b.target) {
        if (b.target.isPlayer && this.playerController) {
          b.target.position.copy(this.playerController.position);
          b.target.isDead = this.playerIsDead;
        } else if (b.target.npcRef) {
          b.target.position.copy(b.target.npcRef.obj.position);
          b.target.isDead = !!b.target.npcRef.isDead;
        } else if (b.target.obj) {
          b.target.position.copy(b.target.obj.position);
        }
      }

      // Homing guidance
      if (b.target && !b.target.isDead) {
        const toTarget = b.target.position.clone().add(new THREE.Vector3(0, 0.6, 0)).sub(b.position).normalize();
        b.velocity.lerp(toTarget.multiplyScalar(105), b.homingFactor * dt);
      }

      b.position.addScaledVector(b.velocity, dt);
      b.mesh.position.copy(b.position);
      b.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.velocity.clone().normalize());

      // Collision check against ALL active targets (can hit intervening cars!)
      let hitTarget: CombatTarget | null = null;
      const candidateTargets = (b.target && !b.target.isDead && !allTargets.some((t) => t.id === b.target?.id))
        ? [b.target, ...allTargets]
        : allTargets;

      for (const t of candidateTargets) {
        if (t.id === b.shooterId || t.isDead) continue;
        const d = b.position.distanceTo(t.position.clone().add(new THREE.Vector3(0, 0.6, 0)));
        if (d < 2.0) {
          hitTarget = t;
          break;
        }
      }

      if (hitTarget) {
        this.applyDamage(hitTarget, 1, b.position, b.shooterId);
        playSfx((s) => s.bulletHit());
        this.scene.remove(b.mesh);
      } else {
        alive.push(b);
      }
    }

    this.bullets = alive;
  }

  /** Updates missiles flying, homing steering, and checks collisions */
  private updateMissiles(dt: number): void {
    const alive: Missile[] = [];
    const allTargets = this.getAllTargets();

    for (const m of this.missiles) {
      m.life += dt;
      if (m.life >= 5.0) {
        // Self-detonate if life expired
        this.triggerExplosion(m.position, true);
        this.scene.remove(m.group);
        continue;
      }

      // Keep target live position, velocity, and alive status updated
      if (m.target) {
        if (m.target.isPlayer && this.playerController) {
          m.target.position.copy(this.playerController.position);
          m.target.velocity.set(
            Math.sin(this.playerController.rotationY) * this.playerController.speed,
            0,
            Math.cos(this.playerController.rotationY) * this.playerController.speed
          );
          m.target.isDead = this.playerIsDead;
        } else if (m.target.npcRef) {
          m.target.position.copy(m.target.npcRef.obj.position);
          m.target.velocity.set(
            Math.sin(m.target.npcRef.obj.rotation.y) * m.target.npcRef.speed,
            0,
            Math.cos(m.target.npcRef.obj.rotation.y) * m.target.npcRef.speed
          );
          m.target.isDead = !!m.target.npcRef.isDead;
        } else if (m.target.obj) {
          m.target.position.copy(m.target.obj.position);
        }
      }

      // High rocket acceleration up to 135 m/s
      m.speed = Math.min(135, m.speed + 90 * dt);

      // Lead-predictive proportional navigation homing
      if (m.target && !m.target.isDead) {
        const dist = m.position.distanceTo(m.target.position);
        const timeToHit = Math.max(0.02, dist / Math.max(40, m.speed));
        // Transition to direct car tracking as missile closes in (< 25m) so lead prediction never aims past/short
        const leadFactor = Math.min(1.0, Math.max(0.0, (dist - 12) / 25));
        const targetLead = m.target.position.clone()
          .add(m.target.velocity.clone().multiplyScalar(timeToHit * leadFactor))
          .add(new THREE.Vector3(0, 0.7, 0));

        const dirToTarget = targetLead.sub(m.position).normalize();
        const currentDir = m.velocity.clone().normalize();
        const steerRate = m.life < 0.1 ? 8.0 : (dist < 30 ? 28.0 : 18.0); // Aggressive homing
        currentDir.lerp(dirToTarget, Math.min(1.0, steerRate * dt)).normalize();
        m.velocity.copy(currentDir.multiplyScalar(m.speed));
      }

      const prevPos = m.position.clone();
      m.position.addScaledVector(m.velocity, dt);

      // Prevent missile from diving into road deck prematurely while tracking target
      const roadY = this.getRoadSurfaceY(m.position);
      if (m.target && !m.target.isDead && m.position.y < roadY + 0.45) {
        m.position.y = roadY + 0.45;
        if (m.velocity.y < 0) m.velocity.y = 0;
      }

      m.group.position.copy(m.position);
      m.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), m.velocity.clone().normalize());

      // Emit rocket smoke and engine flare
      m.smokeTimer += dt;
      if (m.smokeTimer >= 0.025) {
        m.smokeTimer = 0;
        this.emitMissileSmoke(m.position);
      }

      // Check collision against all targets with continuous swept line segment to eliminate tunneling
      let hitTarget: CombatTarget | null = null;
      const moveSegment = new THREE.Line3(prevPos, m.position);
      const segClosest = new THREE.Vector3();

      const candidateTargets = (m.target && !m.target.isDead && !allTargets.some((t) => t.id === m.target?.id))
        ? [m.target, ...allTargets]
        : allTargets;

      for (const t of candidateTargets) {
        if (t.id === m.shooterId || t.isDead) continue;
        const targetCenter = t.position.clone().add(new THREE.Vector3(0, 0.65, 0));
        moveSegment.closestPointToPoint(targetCenter, true, segClosest);
        const dist = segClosest.distanceTo(targetCenter);
        if (dist < 3.6) {
          hitTarget = t;
          break;
        }
      }

      // Safeguard: direct distance check to tracked target
      if (!hitTarget && m.target && !m.target.isDead && m.target.id !== m.shooterId) {
        const targetCenter = m.target.position.clone().add(new THREE.Vector3(0, 0.65, 0));
        if (m.position.distanceTo(targetCenter) < 3.6) {
          hitTarget = m.target;
        }
      }

      if (hitTarget) {
        this.applyDamage(hitTarget, 2, m.position, m.shooterId);
        this.triggerExplosion(m.position, true);
        this.scene.remove(m.group);
      } else if ((!m.target || m.target.isDead || m.life > 2.0) && m.position.y <= roadY + 0.15) {
        // Only detonate on ground if target is lost/dead or rocket has spent its flight
        this.triggerExplosion(new THREE.Vector3(m.position.x, roadY, m.position.z), true);
        this.scene.remove(m.group);
      } else {
        alive.push(m);
      }
    }

    this.missiles = alive;
  }

  /** Applies damage to target, triggers death sequence if HP reaches 0 */
  public applyDamage(target: CombatTarget, dmg: number, hitPos: THREE.Vector3, shooterId?: string): void {
    if (target.isDead) return;

    if (target.isPlayer) {
      // 自分の攻撃（ミサイル、銃撃、爆風）による自傷は100%完全無効化
      if (shooterId === 'player') return;
      if (this.playerInvincibleTimer > 0) return;

      this.timeSinceLastDamage = 0;
      this.autoRepairTimer = 0;

      target.hp = Math.max(0, target.hp - dmg);
      this.playerHp = target.hp;
      this.onCameraShake?.(0.65);
      playSfx((s) => s.crash(0.6));
      if (this.playerHp <= 0) {
        this.killPlayer(target.position);
      }
      return;
    }

    target.hp = Math.max(0, target.hp - dmg);
    if (target.npcRef) {
      target.npcRef.hp = target.hp;
      if (target.hp <= 0) {
        this.killNpc(target.npcRef, hitPos);
      }
    }
  }

  /** Player blown into the air with violent tumble and shattered debris */
  private killPlayer(pos?: THREE.Vector3): void {
    if (this.playerIsDead) return;

    this.playerIsDead = true;
    this.playerRespawnTimer = 3.2;
    this.lockOnReticleGroup.visible = false;
    this.currentLockOn = null;

    const p = this.playerController ? this.playerController.position.clone() : (pos || new THREE.Vector3());
    const v = this.playerController
      ? new THREE.Vector3(Math.sin(this.playerController.rotationY), 0, Math.cos(this.playerController.rotationY)).multiplyScalar(this.playerController.speed)
      : new THREE.Vector3();

    // Massive upward launch & lateral kick
    this.playerFlyVelocity.set(
      (Math.random() - 0.5) * 12,
      18 + Math.random() * 4,
      (Math.random() - 0.5) * 12
    );
    // Rapid tumbling spin on all 3 axes
    this.playerFlyAngular.set(
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 20,
      (Math.random() - 0.5) * 14
    );

    // Hide intact car model - it shatters into pieces!
    if (this.playerController) {
      this.playerController.car.group.visible = false;
      this.playerController.speed = 0;
    }

    // Spawn realistic shattered car debris
    this.spawnShatteredCarDebris(p, v);

    // Big explosion at car location (craters abolished!)
    this.triggerExplosion(p.clone(), false);
  }

  /** NPC blown into the air with tumbling rotation and shattered debris */
  private killNpc(npc: NpcCar, _hitPos: THREE.Vector3): void {
    if (npc.isDead) return;

    npc.isDead = true;
    npc.respawnTimer = 3.2;
    // Hide intact NPC car model - it shatters into pieces!
    npc.obj.visible = false;

    // Clear any active in-flight bullets or missiles fired by this dead NPC
    const myId = (npc as any).combatId;
    if (myId) {
      this.bullets = this.bullets.filter((b) => {
        if (b.shooterId === myId) {
          this.scene.remove(b.mesh);
          return false;
        }
        return true;
      });
      this.missiles = this.missiles.filter((m) => {
        if (m.shooterId === myId) {
          this.scene.remove(m.group);
          return false;
        }
        return true;
      });
    }

    npc.flyVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 14,
      16 + Math.random() * 5,
      (Math.random() - 0.5) * 14
    );
    npc.flyAngularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 18,
      (Math.random() - 0.5) * 22,
      (Math.random() - 0.5) * 16
    );

    const nPos = npc.obj.position.clone();
    const nVel = new THREE.Vector3(0, 0, (npc.isForward ? 1 : -1) * npc.speed);

    // Spawn realistic shattered car debris
    this.spawnShatteredCarDebris(nPos, nVel);

    // Big explosion at NPC death location (craters abolished!)
    this.triggerExplosion(nPos, false);
  }

  private respawnPlayer(): void {
    if (!this.playerController) return;
    this.playerIsDead = false;
    this.updatePlayerMaxHp();
    this.playerHp = this.playerMaxHp;
    this.timeSinceLastDamage = 0;
    this.autoRepairTimer = 0;
    this.playerInvincibleTimer = 2.5; // 2.5 seconds invincibility
    this.playerFlyVelocity.set(0, 0, 0);
    this.playerFlyAngular.set(0, 0, 0);
    this.playerController.speed = 0;

    // Reset car orientation & restore visibility
    this.playerController.car.group.visible = true;
    this.playerController.car.group.rotation.set(0, 0, 0);

    // Map respawn
    if (this.map) {
      this.map.onRespawn(this.playerController);
    }
  }

  /** Huge explosion effect with shockwave ring, blinding flash, fireball storm, and scorch mark */
  public triggerExplosion(pos: THREE.Vector3, _createCrater = false): void {
    playSfx((s) => s.explosion(true));

    // Screen trauma / camera shake based on distance to player
    if (this.playerController) {
      const d = pos.distanceTo(this.playerController.position);
      if (d < 50) {
        const falloff = 1 - d / 50;
        this.onCameraShake?.(falloff * 0.85);
      }
    }

    const roadY = this.getRoadSurfaceY(pos);

    // 1. Blinding Incandescent Flash Sphere
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xfff6bb,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });
    const flashMesh = new THREE.Mesh(this.smokeGeo, flashMat);
    flashMesh.position.copy(pos);
    flashMesh.scale.setScalar(3.5);
    this.scene.add(flashMesh);
    this.particles.push({
      mesh: flashMesh,
      velocity: new THREE.Vector3(0, 1, 0),
      rotVelocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.22,
      initialScale: 3.5,
    });

    // 2. Expanding Ground Shockwave Blast Ring
    const shockRingGeo = new THREE.RingGeometry(0.8, 2.2, 32);
    const shockRingMat = new THREE.MeshBasicMaterial({
      color: 0xffaa33,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const shockRing = new THREE.Mesh(shockRingGeo, shockRingMat);
    shockRing.rotation.x = -Math.PI / 2;
    shockRing.position.set(pos.x, roadY + 0.1, pos.z);
    this.scene.add(shockRing);
    this.particles.push({
      mesh: shockRing,
      velocity: new THREE.Vector3(0, 0.2, 0),
      rotVelocity: new THREE.Vector3(),
      life: 0,
      maxLife: 0.45,
      initialScale: 1.0,
    });

    // 3. Huge Fireball & Shockwave storm (45 large fire particles)
    for (let i = 0; i < 45; i++) {
      const mesh = new THREE.Mesh(this.smokeGeo, Math.random() < 0.7 ? this.fireMat : this.smokeMat);
      mesh.position.copy(pos);
      const scale = 1.6 + Math.random() * 2.8;
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 28,
        Math.random() * 20 + 4,
        (Math.random() - 0.5) * 28
      );

      this.particles.push({
        mesh,
        velocity: vel,
        rotVelocity: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 0),
        life: 0,
        maxLife: 0.8 + Math.random() * 0.8,
        initialScale: scale,
      });
    }

    // 4. Towering dark mushroom smoke cloud (25 heavy smoke puffs)
    for (let i = 0; i < 25; i++) {
      const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat);
      mesh.position.copy(pos);
      const scale = 2.0 + Math.random() * 2.5;
      mesh.scale.setScalar(scale);
      this.scene.add(mesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 16 + 10,
        (Math.random() - 0.5) * 12
      );

      this.particles.push({
        mesh,
        velocity: vel,
        rotVelocity: new THREE.Vector3((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 0),
        life: 0,
        maxLife: 1.5 + Math.random() * 1.2,
        initialScale: scale,
      });
    }

    // 5. Shower of fiery sparks and hot shrapnel (40 sparks)
    this.emitSparks(pos, new THREE.Vector3(0, 1, 0), 40);

    // 6. Non-colliding scorch mark on road surface (zero hazard, purely cosmetic, fades out over time)
    const scorchGeo = new THREE.CircleGeometry(3.6, 20);
    const scorchMat = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const scorchMesh = new THREE.Mesh(scorchGeo, scorchMat);
    scorchMesh.rotation.x = -Math.PI / 2;
    scorchMesh.position.set(pos.x, roadY + 0.02, pos.z);
    this.scene.add(scorchMesh);
    this.particles.push({
      mesh: scorchMesh,
      velocity: new THREE.Vector3(),
      rotVelocity: new THREE.Vector3(),
      life: 0,
      maxLife: 14.0,
      initialScale: 1.0,
    });
  }

  /** Spawns realistic fragmented car debris (wheels, doors, hood, chassis, shrapnel) exploding outwards */
  private spawnShatteredCarDebris(pos: THREE.Vector3, vel: THREE.Vector3): void {
    // 1. 4 Spinning Wheels flying outward
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
    const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 12);
    const wheelDirs = [
      new THREE.Vector3(-1, 0.8, 1),
      new THREE.Vector3(1, 0.8, 1),
      new THREE.Vector3(-1, 0.8, -1),
      new THREE.Vector3(1, 0.8, -1),
    ];
    for (const wd of wheelDirs) {
      const mesh = new THREE.Mesh(wheelGeo, wheelMat);
      mesh.position.copy(pos).add(wd.clone().multiplyScalar(0.7));
      this.scene.add(mesh);

      const wVel = wd.clone().normalize().multiplyScalar(14 + Math.random() * 8)
        .add(vel.clone().multiplyScalar(0.4))
        .add(new THREE.Vector3(0, 10 + Math.random() * 8, 0));

      this.carDebris.push({
        mesh,
        position: mesh.position.clone(),
        velocity: wVel,
        angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25, (Math.random() - 0.5) * 25),
        life: 0,
        maxLife: 3.2,
        bounceCount: 0,
        hasTrail: false,
      });
    }

    // 2. Hood / Roof panels blown sky-high
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
    const panelGeo = new THREE.BoxGeometry(1.6, 0.08, 1.4);
    for (let p = 0; p < 2; p++) {
      const mesh = new THREE.Mesh(panelGeo, panelMat);
      mesh.position.copy(pos).add(new THREE.Vector3(0, 0.8 + p * 0.4, 0));
      this.scene.add(mesh);

      const pVel = new THREE.Vector3((Math.random() - 0.5) * 12, 18 + Math.random() * 8, (Math.random() - 0.5) * 12)
        .add(vel.clone().multiplyScalar(0.3));

      this.carDebris.push({
        mesh,
        position: mesh.position.clone(),
        velocity: pVel,
        angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18),
        life: 0,
        maxLife: 3.2,
        bounceCount: 0,
        hasTrail: true,
      });
    }

    // 3. Side doors blown outwards
    const doorGeo = new THREE.BoxGeometry(0.08, 0.7, 1.1);
    for (const side of [-1, 1]) {
      const mesh = new THREE.Mesh(doorGeo, panelMat);
      mesh.position.copy(pos).add(new THREE.Vector3(side * 0.8, 0.5, 0));
      this.scene.add(mesh);

      const dVel = new THREE.Vector3(side * (14 + Math.random() * 6), 12 + Math.random() * 6, (Math.random() - 0.5) * 10)
        .add(vel.clone().multiplyScalar(0.3));

      this.carDebris.push({
        mesh,
        position: mesh.position.clone(),
        velocity: dVel,
        angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
        life: 0,
        maxLife: 3.2,
        bounceCount: 0,
        hasTrail: false,
      });
    }

    // 4. Burning heavy engine block / chassis chunk
    const engineMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const engineMesh = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.6, 1.2), engineMat);
    engineMesh.position.copy(pos);
    this.scene.add(engineMesh);
    this.carDebris.push({
      mesh: engineMesh,
      position: engineMesh.position.clone(),
      velocity: new THREE.Vector3((Math.random() - 0.5) * 10, 12 + Math.random() * 4, (Math.random() - 0.5) * 10).add(vel.clone().multiplyScalar(0.4)),
      angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
      life: 0,
      maxLife: 3.2,
      bounceCount: 0,
      hasTrail: true,
    });

    // 5. 22+ Shredded fiery shrapnel & scrap pieces
    const scrapGeo = new THREE.DodecahedronGeometry(0.35, 0);
    const scrapMat = new THREE.MeshBasicMaterial({ color: 0xff6622 });
    for (let k = 0; k < 22; k++) {
      const mesh = new THREE.Mesh(scrapGeo, Math.random() < 0.5 ? scrapMat : panelMat);
      mesh.position.copy(pos);
      const s = 0.5 + Math.random() * 0.8;
      mesh.scale.set(s, s * 0.4, s);
      this.scene.add(mesh);

      const sVel = new THREE.Vector3(
        (Math.random() - 0.5) * 26,
        14 + Math.random() * 14,
        (Math.random() - 0.5) * 26
      ).add(vel.clone().multiplyScalar(0.4));

      this.carDebris.push({
        mesh,
        position: mesh.position.clone(),
        velocity: sVel,
        angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30),
        life: 0,
        maxLife: 2.8,
        bounceCount: 0,
        hasTrail: Math.random() < 0.3,
      });
    }
  }

  /** Updates flying shattered car debris with road bounce physics */
  private updateCarDebris(dt: number): void {
    const alive: CarDebrisPiece[] = [];
    for (const d of this.carDebris) {
      d.life += dt;
      if (d.life >= d.maxLife) {
        this.scene.remove(d.mesh);
        continue;
      }

      // Gravity
      d.velocity.y -= 26 * dt;

      // Position & tumbling rotation
      d.position.addScaledVector(d.velocity, dt);
      d.mesh.position.copy(d.position);
      d.mesh.rotation.x += d.angularVelocity.x * dt;
      d.mesh.rotation.y += d.angularVelocity.y * dt;
      d.mesh.rotation.z += d.angularVelocity.z * dt;

      // Road bounce collision
      const roadY = this.getRoadSurfaceY(d.position);
      if (d.position.y <= roadY + 0.1 && d.velocity.y < 0) {
        d.position.y = roadY + 0.1;
        d.velocity.y = -d.velocity.y * 0.42;
        d.velocity.x *= 0.72;
        d.velocity.z *= 0.72;
        d.bounceCount++;
        if (d.bounceCount <= 3) {
          this.emitSparks(d.position, new THREE.Vector3(0, 1, 0), 4);
        }
      }

      // Smoke trail for burning pieces
      if (d.hasTrail && Math.random() < 0.35) {
        this.emitExplosionSmoke(d.position.clone(), 0.4);
      }

      alive.push(d);
    }
    this.carDebris = alive;
  }

  private updateParticles(dt: number): void {
    const alive: ExplosionParticle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        continue;
      }

      p.mesh.position.addScaledVector(p.velocity, dt);
      if (!p.noGravity) {
        p.velocity.y -= 10 * dt; // Gravity
      }
      p.mesh.rotation.x += p.rotVelocity.x * dt;
      p.mesh.rotation.y += p.rotVelocity.y * dt;

      // Expand/shrink and fade
      const progress = p.life / p.maxLife;
      if (p.scaleVector) {
        const factor = p.shrink ? Math.max(1.0 - progress * 0.7, 0.15) : (1.0 + progress * 0.5);
        p.mesh.scale.set(
          p.scaleVector.x * factor,
          p.scaleVector.y * factor,
          p.scaleVector.z * factor
        );
      } else {
        const s = p.initialScale * (1.0 + progress * 2.2);
        p.mesh.scale.setScalar(s);
      }
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(1.0 - progress, 0);

      alive.push(p);
    }
    this.particles = alive;
  }

  private emitMissileSmoke(pos: THREE.Vector3): void {
    const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
    mesh.position.copy(pos);
    mesh.scale.setScalar(0.4);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 2, (Math.random() - 0.5) * 1.5),
      rotVelocity: new THREE.Vector3(1, 1, 0),
      life: 0,
      maxLife: 0.6,
      initialScale: 0.4,
    });
  }

  private emitExplosionSmoke(pos: THREE.Vector3, scale = 1.0): void {
    const mesh = new THREE.Mesh(this.smokeGeo, this.smokeMat.clone());
    mesh.position.copy(pos);
    mesh.scale.setScalar(scale);
    this.scene.add(mesh);

    this.particles.push({
      mesh,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 3 + 1, (Math.random() - 0.5) * 2),
      rotVelocity: new THREE.Vector3(0.5, 0.5, 0),
      life: 0,
      maxLife: 1.2,
      initialScale: scale,
    });
  }

  /** Emits intense muzzle fire / flame tongues from the top protruding barrels of Combat Sedan */
  private emitRoofMuzzleFire(barrelPos: THREE.Vector3, forward: THREE.Vector3, shooterSpeed: number): void {
    const forwardSpeed = Math.max(shooterSpeed, 0) + 32;

    // 1. Incandescent Core Flame Tongue (pointing forward along barrel axis)
    const flameMesh = new THREE.Mesh(this.flameGeo, this.flameCoreMat);
    flameMesh.position.copy(barrelPos);
    flameMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), forward);
    flameMesh.scale.set(0.9, 0.9, 1.4);
    this.scene.add(flameMesh);

    this.particles.push({
      mesh: flameMesh,
      velocity: forward.clone().multiplyScalar(forwardSpeed * 0.4),
      rotVelocity: new THREE.Vector3(0, 0, (Math.random() - 0.5) * 8),
      life: 0,
      maxLife: 0.12,
      initialScale: 1.0,
    });

    // 2. Billowing Fireballs (expanding fiery orange/yellow firebursts shooting forward)
    for (let i = 0; i < 4; i++) {
      const pMesh = new THREE.Mesh(this.smokeGeo, this.fireMat);
      const spawnP = barrelPos.clone().add(forward.clone().multiplyScalar(0.15 + i * 0.18));
      pMesh.position.copy(spawnP);
      const initScale = 0.35 + Math.random() * 0.25;
      pMesh.scale.setScalar(initScale);
      this.scene.add(pMesh);

      const fVel = forward.clone().multiplyScalar(forwardSpeed + Math.random() * 12)
        .add(new THREE.Vector3((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 2.5));

      this.particles.push({
        mesh: pMesh,
        velocity: fVel,
        rotVelocity: new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12),
        life: 0,
        maxLife: 0.16 + Math.random() * 0.08,
        initialScale: initScale,
      });
    }
  }

  /** Retrieves world positions of the twin rear upward-facing exhaust pipes of Combat Sedan */
  public getCombatSedanRearPipes(pos: THREE.Vector3, fwd: THREE.Vector3): { left: THREE.Vector3; right: THREE.Vector3 } {
    if (this.playerController?.car?.specs?.name?.includes('COMBAT') && this.playerController.car.group) {
      const leftW = new THREE.Vector3(-0.45, 2.1827, -0.9035);
      const rightW = new THREE.Vector3(0.45, 2.1827, -0.9035);
      this.playerController.car.group.localToWorld(leftW);
      this.playerController.car.group.localToWorld(rightW);
      return { left: leftW, right: rightW };
    }

    const right = new THREE.Vector3(fwd.z, 0, -fwd.x).normalize();
    // The 2 pipes are at z = -0.90m (behind center), x = ±0.45m, y = +2.18m (top opening)
    const baseBack = pos.clone().addScaledVector(fwd, -0.90);
    baseBack.y += 2.18;

    const left = baseBack.clone().addScaledVector(right, -0.45);
    const rightP = baseBack.clone().addScaledVector(right, 0.45);
    return { left, right: rightP };
  }

  /** Emits compact, realistic exhaust fire out of the two upward-pointing pipes at the back of Combat Sedan */
  public emitRearPipeFlames(carPos: THREE.Vector3, fwd: THREE.Vector3, carSpeed: number, isWeaponBlast = false): void {
    const pipes = this.getCombatSedanRearPipes(carPos, fwd);
    const pipeList = [pipes.left, pipes.right];

    // Slanted 22 deg backwards from UP (matches the physical tilt of Combat Sedan's exhaust stacks)
    const ang = 22 * (Math.PI / 180);
    const pipeDir = new THREE.Vector3(0, Math.cos(ang), 0).addScaledVector(fwd, -Math.sin(ang)).normalize();

    const forwardCompensation = fwd.clone().multiplyScalar(carSpeed * 0.95);
    const upwardSpeed = isWeaponBlast ? 14 : 9;

    pipeList.forEach((pipePos) => {
      // 1. Sleek flame tongue emanating directly from inside the pipe opening (never protruding past pipe walls)
      const flameMat = this.flameCoreMat.clone();
      const flameMesh = new THREE.Mesh(this.pipeFlameGeo, flameMat);
      flameMesh.position.copy(pipePos);
      flameMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), pipeDir);

      // Compact radius (fits neatly within 0.065m outer pipe radius, never bulging out)
      const radScale = isWeaponBlast ? (0.70 + Math.random() * 0.15) : (0.50 + Math.random() * 0.15);
      const lenScale = isWeaponBlast ? (0.95 + Math.random() * 0.25) : (0.55 + Math.random() * 0.20);
      flameMesh.scale.set(radScale, radScale, lenScale);
      this.scene.add(flameMesh);

      const flameVel = pipeDir.clone().multiplyScalar(upwardSpeed).add(forwardCompensation);

      this.particles.push({
        mesh: flameMesh,
        velocity: flameVel,
        rotVelocity: new THREE.Vector3(0, 0, (Math.random() - 0.5) * 4),
        life: 0,
        maxLife: isWeaponBlast ? 0.11 : 0.07,
        initialScale: lenScale,
        scaleVector: new THREE.Vector3(radScale, radScale, lenScale),
        shrink: true,
        noGravity: true,
      });

      // 2. Discrete micro-flame sparks/embers shooting up along the pipe axis
      const count = isWeaponBlast ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const pMat = this.fireMat.clone();
        const pMesh = new THREE.Mesh(this.smokeGeo, pMat);
        const spawnP = pipePos.clone().addScaledVector(pipeDir, 0.05 + i * 0.06);
        pMesh.position.copy(spawnP);
        const initScale = isWeaponBlast ? (0.09 + Math.random() * 0.03) : (0.05 + Math.random() * 0.02);
        pMesh.scale.setScalar(initScale);
        this.scene.add(pMesh);

        const pVel = pipeDir.clone().multiplyScalar(upwardSpeed + Math.random() * 4)
          .add(forwardCompensation)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));

        this.particles.push({
          mesh: pMesh,
          velocity: pVel,
          rotVelocity: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
          life: 0,
          maxLife: isWeaponBlast ? 0.13 : 0.08,
          initialScale: initScale,
          noGravity: true,
        });
      }
    });
  }

  private emitSparks(pos: THREE.Vector3, dir: THREE.Vector3, count: number): void {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.15), this.bulletMat);
      mesh.position.copy(pos);
      this.scene.add(mesh);

      const spread = new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 4 + 1, (Math.random() - 0.5) * 6);
      const vel = dir.clone().multiplyScalar(15).add(spread);

      this.particles.push({
        mesh,
        velocity: vel,
        rotVelocity: new THREE.Vector3(5, 5, 5),
        life: 0,
        maxLife: 0.25 + Math.random() * 0.2,
        initialScale: 1.0,
      });
    }
  }
}
