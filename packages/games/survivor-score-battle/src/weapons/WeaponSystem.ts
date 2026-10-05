import { WeaponType } from '../types';
import { WEAPON_REGISTRY } from './WeaponDefinitions';
import { BulletPool } from './BulletPool';
import { SpatialGrid } from '../world/SpatialGrid';
import { Enemy } from '../entities/Enemy';
import { SoundManager } from '../audio/SoundManager';
import { ParticleSystem } from '../effects/ParticleSystem';

export interface ActiveWeapon {
  type: WeaponType;
  level: number;
  timer: number;
  orbitAngle: number;
}

export class WeaponSystem {
  public ownerId: string;
  public isPlayer: boolean;
  public activeWeapons: Map<WeaponType, ActiveWeapon> = new Map();

  // Stat multipliers
  public attackPowerMult: number = 1.0;
  public attackSpeedMult: number = 1.0;
  public critChance: number = 0.05;

  constructor(ownerId: string, isPlayer: boolean) {
    this.ownerId = ownerId;
    this.isPlayer = isPlayer;

    // Start with default weapon
    this.addOrUpgradeWeapon('ENERGY_BLASTER');
  }

  public addOrUpgradeWeapon(type: WeaponType): number {
    const existing = this.activeWeapons.get(type);
    if (existing) {
      const meta = WEAPON_REGISTRY[type];
      if (existing.level < meta.maxLevel) {
        existing.level += 1;
      }
      return existing.level;
    } else {
      this.activeWeapons.set(type, {
        type,
        level: 1,
        timer: 0,
        orbitAngle: 0,
      });
      return 1;
    }
  }

  public getWeaponLevel(type: WeaponType): number {
    const w = this.activeWeapons.get(type);
    return w ? w.level : 0;
  }

  public update(
    dt: number,
    owner: { x: number; y: number; vx: number; vy: number },
    enemyGrid: SpatialGrid<Enemy>,
    bulletPool: BulletPool,
    soundManager: SoundManager,
    particleSystem: ParticleSystem
  ) {
    for (const [type, weapon] of this.activeWeapons) {
      const meta = WEAPON_REGISTRY[type];
      const config = meta.levels[weapon.level - 1];
      const cooldown = Math.max(0.05, config.cooldown / this.attackSpeedMult);

      weapon.timer += dt;

      // Continuous weapons like Orbit Blade
      if (type === 'ORBIT_BLADE') {
        weapon.orbitAngle += config.speed * dt;
      }

      if (weapon.timer >= cooldown) {
        weapon.timer = 0;
        this.fireWeapon(
          type,
          weapon,
          owner,
          enemyGrid,
          bulletPool,
          soundManager,
          particleSystem
        );
      }
    }
  }

  private fireWeapon(
    type: WeaponType,
    weapon: ActiveWeapon,
    owner: { x: number; y: number; vx: number; vy: number },
    enemyGrid: SpatialGrid<Enemy>,
    bulletPool: BulletPool,
    soundManager: SoundManager,
    particleSystem: ParticleSystem
  ) {
    const meta = WEAPON_REGISTRY[type];
    const config = meta.levels[weapon.level - 1];
    const damage = config.damage * this.attackPowerMult;
    const cooldown = Math.max(0.05, config.cooldown / this.attackSpeedMult);

    switch (type) {
      case 'ENERGY_BLASTER': {
        const target = enemyGrid.getNearest(owner.x, owner.y, 800);
        let baseAngle = 0;
        if (target) {
          baseAngle = Math.atan2(target.y - owner.y, target.x - owner.x);
        } else if (owner.vx !== 0 || owner.vy !== 0) {
          baseAngle = Math.atan2(owner.vy, owner.vx);
        }

        const count = config.count;
        const spread = 0.18;
        for (let i = 0; i < count; i++) {
          const angle = count === 1 ? baseAngle : baseAngle + (i - (count - 1) / 2) * spread;
          const vx = Math.cos(angle) * config.speed;
          const vy = Math.sin(angle) * config.speed;

          bulletPool.spawn(
            owner.x,
            owner.y,
            vx,
            vy,
            'ENERGY_BLASTER',
            damage,
            config.pierce,
            config.radius,
            1.2,
            meta.color,
            this.ownerId
          );
        }

        if (this.isPlayer) soundManager.sfx.playBlaster();
        break;
      }

      case 'HOMING_MISSILE': {
        const nearby = enemyGrid.query(owner.x, owner.y, 1000);
        const count = config.count;

        for (let i = 0; i < count; i++) {
          const target = nearby.length > 0 ? nearby[i % nearby.length] : null;
          const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
          const vx = Math.cos(angle) * config.speed * 0.6;
          const vy = Math.sin(angle) * config.speed * 0.6;

          const b = bulletPool.spawn(
            owner.x,
            owner.y,
            vx,
            vy,
            'HOMING_MISSILE',
            damage,
            config.pierce,
            config.radius,
            2.5,
            meta.color,
            this.ownerId
          );
          if (b && target) {
            b.target = target;
          }
        }

        if (this.isPlayer) soundManager.sfx.playMissileLaunch();
        break;
      }

      case 'PLASMA_LASER': {
        const target = enemyGrid.getNearest(owner.x, owner.y, 900);
        if (!target) break;

        const baseAngle = Math.atan2(target.y - owner.y, target.x - owner.x);
        const count = config.count;
        for (let i = 0; i < count; i++) {
          const angle = count === 1 ? baseAngle : baseAngle + (i - (count - 1) / 2) * 0.22;
          const vx = Math.cos(angle) * config.speed;
          const vy = Math.sin(angle) * config.speed;

          bulletPool.spawn(
            owner.x,
            owner.y,
            vx,
            vy,
            'PLASMA_LASER',
            damage,
            config.pierce,
            config.radius,
            0.6,
            meta.color,
            this.ownerId
          );
        }

        if (this.isPlayer) soundManager.sfx.playLaser();
        break;
      }

      case 'ORBIT_BLADE': {
        const count = config.count;
        for (let i = 0; i < count; i++) {
          const bladeAngle = weapon.orbitAngle + (i * Math.PI * 2) / count;
          const b = bulletPool.spawn(
            owner.x + Math.cos(bladeAngle) * 80,
            owner.y + Math.sin(bladeAngle) * 80,
            0,
            0,
            'ORBIT_BLADE',
            damage,
            config.pierce,
            config.radius,
            cooldown * 1.5,
            meta.color,
            this.ownerId
          );
          if (b) {
            b.owner = owner;
            b.orbitAngle = bladeAngle;
            b.orbitSpeed = config.speed;
            b.orbitDistance = 75 + (weapon.level > 4 ? 20 : 0);
          }
        }
        if (this.isPlayer && Math.random() < 0.3) soundManager.sfx.playBladeSlash();
        break;
      }

      case 'THUNDER_BOLT': {
        const count = config.count;
        const targets = enemyGrid.query(owner.x, owner.y, 850);
        if (targets.length === 0) break;

        for (let i = 0; i < Math.min(count, targets.length); i++) {
          const t = targets[Math.floor(Math.random() * targets.length)];
          bulletPool.spawn(
            t.x,
            t.y,
            0,
            0,
            'THUNDER_BOLT',
            damage,
            config.pierce,
            config.radius,
            0.18,
            meta.color,
            this.ownerId
          );
          particleSystem.emitBurst(t.x, t.y, '#ffe600', 12, 180, 5, 0.4);
        }

        if (this.isPlayer) soundManager.sfx.playLightning();
        break;
      }

      case 'PULSE_RING': {
        const b = bulletPool.spawn(
          owner.x,
          owner.y,
          0,
          0,
          'PULSE_RING',
          damage,
          config.pierce,
          config.radius,
          0.45,
          meta.color,
          this.ownerId
        );
        if (b) {
          b.owner = owner;
          b.maxRadius = config.radius;
        }

        if (this.isPlayer) soundManager.sfx.playExplosion(false);
        break;
      }

      case 'DRONE_SQUAD': {
        const count = config.count;
        const target = enemyGrid.getNearest(owner.x, owner.y, 700);
        for (let i = 0; i < count; i++) {
          const droneAngle = (i * Math.PI * 2) / count + Date.now() * 0.002;
          const droneX = owner.x + Math.cos(droneAngle) * 55;
          const droneY = owner.y + Math.sin(droneAngle) * 55;

          let fireAngle = droneAngle;
          if (target) {
            fireAngle = Math.atan2(target.y - droneY, target.x - droneX);
          }
          const vx = Math.cos(fireAngle) * config.speed;
          const vy = Math.sin(fireAngle) * config.speed;

          bulletPool.spawn(
            droneX,
            droneY,
            vx,
            vy,
            'DRONE_SQUAD',
            damage,
            config.pierce,
            config.radius,
            0.9,
            meta.color,
            this.ownerId
          );
        }
        if (this.isPlayer && Math.random() < 0.25) soundManager.sfx.playBlaster();
        break;
      }

      case 'NOVA_BOMB': {
        const target = enemyGrid.getNearest(owner.x, owner.y, 800);
        const count = config.count;
        for (let i = 0; i < count; i++) {
          const angle = target
            ? Math.atan2(target.y - owner.y, target.x - owner.x) + (Math.random() - 0.5) * 0.5
            : Math.random() * Math.PI * 2;
          const vx = Math.cos(angle) * config.speed;
          const vy = Math.sin(angle) * config.speed;

          bulletPool.spawn(
            owner.x,
            owner.y,
            vx,
            vy,
            'NOVA_BOMB',
            damage,
            config.pierce,
            config.radius,
            0.6,
            meta.color,
            this.ownerId
          );
        }
        if (this.isPlayer) soundManager.sfx.playExplosion(false);
        break;
      }
    }
  }
}
