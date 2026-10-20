import { Entity } from './Entity';
import { AiArchetype, ContenderState, WeaponType } from '../types';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { SwordSystem } from '../weapons/SwordSystem';
import { BulletPool } from '../weapons/BulletPool';
import { drawOutlinedText } from '../ui/outlinedText';
import { SpatialGrid } from '../world/SpatialGrid';
import { Enemy } from './Enemy';
import { Boss } from './Boss';
import { SoundManager } from '../audio/SoundManager';
import { ParticleSystem } from '../effects/ParticleSystem';
import { PickupPool, PickupItem } from '../items/ExpGem';
import { Field } from '../world/Field';

export interface CpuProfile {
  id: string;
  name: string;
  archetype: AiArchetype;
  color: string;
  accentColor: string;
  preferredWeapons: WeaponType[];
  speedFactor: number;
}

export const CPU_PROFILES: CpuProfile[] = [
  {
    id: 'cpu_nova',
    name: 'NOVA',
    archetype: 'ATTACKER',
    color: '#ff2255',
    accentColor: '#ff88aa',
    preferredWeapons: ['ENERGY_BLASTER', 'NOVA_BOMB', 'PLASMA_LASER'],
    speedFactor: 1.05,
  },
  {
    id: 'cpu_rex',
    name: 'REX',
    archetype: 'HUNTER',
    color: '#ff7700',
    accentColor: '#ffbb66',
    preferredWeapons: ['HOMING_MISSILE', 'PLASMA_LASER', 'THUNDER_BOLT'],
    speedFactor: 1.0,
  },
  {
    id: 'cpu_luna',
    name: 'LUNA',
    archetype: 'COLLECTOR',
    color: '#b033ff',
    accentColor: '#dda0ff',
    preferredWeapons: ['ORBIT_BLADE', 'PULSE_RING', 'DRONE_SQUAD'],
    speedFactor: 1.1,
  },
  {
    id: 'cpu_volt',
    name: 'VOLT',
    archetype: 'DEFENDER',
    color: '#0099ff',
    accentColor: '#88ddff',
    preferredWeapons: ['ORBIT_BLADE', 'PULSE_RING', 'ENERGY_BLASTER'],
    speedFactor: 0.95,
  },
  {
    id: 'cpu_mint',
    name: 'MINT',
    archetype: 'BOSS_HUNTER',
    color: '#00ff66',
    accentColor: '#aaffcc',
    preferredWeapons: ['THUNDER_BOLT', 'PLASMA_LASER', 'HOMING_MISSILE'],
    speedFactor: 1.02,
  },
  {
    id: 'cpu_blaze',
    name: 'BLAZE',
    archetype: 'PVP_AGGRESSOR',
    color: '#ffaa00',
    accentColor: '#ffe088',
    preferredWeapons: ['ENERGY_BLASTER', 'HOMING_MISSILE', 'DRONE_SQUAD'],
    speedFactor: 1.15,
  },
  {
    id: 'cpu_shadow',
    name: 'SHADOW',
    archetype: 'BALANCED',
    color: '#7000ff',
    accentColor: '#aa66ff',
    preferredWeapons: ['PLASMA_LASER', 'ORBIT_BLADE', 'NOVA_BOMB'],
    speedFactor: 1.0,
  },
];

export class CpuPlayer extends Entity {
  public id: string;
  public name: string;
  public isPlayer: boolean = false;
  public archetype: AiArchetype;
  public color: string;
  public accentColor: string;
  public preferredWeapons: WeaponType[];

  public weaponSystem: WeaponSystem;
  public swordSystem: SwordSystem;

  public magnetRadius: number = 260;
  public score: number = 0;
  public kills: number = 0;
  public level: number = 1;
  public exp: number = 0;
  public nextExp: number = 45;

  public specialGauge: number = 0;
  public rank: number = 2;
  public prevRank: number = 2;
  public swordsDropped: boolean = false;

  public initialHp: number;
  public initialSwords: number;
  public respawnTimer: number = 0;
  public respawnCount: number = 0;

  // AI navigation states
  private aiDecisionTimer: number = 0;
  private targetVx: number = 0;
  private targetVy: number = 0;

  constructor(profile: CpuProfile, spawnX: number, spawnY: number) {
    super(spawnX, spawnY, 20);
    this.id = profile.id;
    this.name = profile.name;
    this.archetype = profile.archetype;
    this.color = profile.color;
    this.accentColor = profile.accentColor;
    this.preferredWeapons = profile.preferredWeapons;

    const baseHps: Partial<Record<AiArchetype, number>> = {
      DEFENDER: 550,
      ATTACKER: 420,
      PVP_AGGRESSOR: 460,
      BOSS_HUNTER: 430,
      HUNTER: 410,
      COLLECTOR: 380,
      BALANCED: 430,
    };
    const hp = baseHps[profile.archetype] || 420;
    this.hp = hp;
    this.maxHp = hp;
    this.initialHp = hp;
    this.speed = 260 * profile.speedFactor;

    this.weaponSystem = new WeaponSystem(this.id, false);
    const startSwords = profile.archetype === 'PVP_AGGRESSOR' ? 4 : 3;
    this.initialSwords = startSwords;
    this.swordSystem = new SwordSystem(this.id, false, startSwords);

    // Give initial preferred weapons (NPC gets 2 weapons right away for competitive strength)
    if (this.preferredWeapons[0]) {
      this.weaponSystem.addOrUpgradeWeapon(this.preferredWeapons[0]);
    }
    if (this.preferredWeapons[1]) {
      this.weaponSystem.addOrUpgradeWeapon(this.preferredWeapons[1]);
    }
  }

  public getDroppedSwordsCount(): number {
    return Math.max(1, Math.min(10, Math.floor(this.swordSystem.swordCount * 0.35)));
  }

  public addExp(amount: number) {
    this.exp += amount;
    if (this.exp >= this.nextExp) {
      this.exp -= this.nextExp;
      this.level += 1;
      this.nextExp = Math.floor(this.nextExp * 1.30 + 15);
      this.autoLevelUp();
    }
  }

  private autoLevelUp() {
    // Pick an upgrade from preferred weapons or stat boosts
    const unmaxedWeapons = this.preferredWeapons.filter((w) => this.weaponSystem.getWeaponLevel(w) < 8);
    if (unmaxedWeapons.length > 0 && Math.random() < 0.80) {
      const pick = unmaxedWeapons[Math.floor(Math.random() * unmaxedWeapons.length)];
      this.weaponSystem.addOrUpgradeWeapon(pick);
    } else {
      // Stat boost
      const roll = Math.random();
      if (roll < 0.35) this.weaponSystem.attackPowerMult += 0.22;
      else if (roll < 0.65) this.weaponSystem.attackSpeedMult += 0.18;
      else this.maxHp += 45;
    }

    // Swords also level up
    if (Math.random() < 0.65 && this.swordSystem.swordCount < 30) {
      this.swordSystem.addSword(1);
    }
    this.swordSystem.baseDamage += 4;
    this.maxHp += 30;
    this.heal(80);
  }

  public respawn(field: Field, gameTime: number) {
    this.alive = true;
    this.swordsDropped = false;
    this.respawnTimer = 0;
    this.respawnCount += 1;
    this.invulnerableTimer = 3.0; // 3.0s invincible shield upon respawning

    // Spawn at arena edge
    const angle = Math.random() * Math.PI * 2;
    const dist = 600 + Math.random() * 500;
    const clamped = field.clamp(Math.cos(angle) * dist, Math.sin(angle) * dist, this.radius);
    this.x = clamped.x;
    this.y = clamped.y;
    this.vx = 0;
    this.vy = 0;

    // Scale HP with elapsed game time
    this.maxHp = Math.floor(this.initialHp + gameTime * 2.2);
    this.hp = this.maxHp;

    // Scale swords with elapsed game time
    const swords = Math.min(28, Math.max(4, Math.floor(this.initialSwords + gameTime / 30)));
    this.swordSystem.swordCount = swords;
    this.swordSystem.baseDamage = 50 + Math.floor(gameTime / 25) * 4;

    // Auto level up to keep pace with player
    const targetLvl = Math.max(this.level, Math.floor(1 + gameTime / 24));
    while (this.level < targetLvl) {
      this.level++;
      this.autoLevelUp();
    }
  }

  public addScore(amount: number, isKill: boolean = false) {
    if (isKill) {
      this.kills += 1;
      this.specialGauge = Math.min(100, this.specialGauge + 1.2);
    }
    this.score += amount;
  }

  public updateAI(
    dt: number,
    field: Field,
    enemyGrid: SpatialGrid<Enemy>,
    activeBoss: Boss | null,
    contenders: { id: string; x: number; y: number; hp: number; maxHp: number; alive: boolean }[],
    bulletPool: BulletPool,
    pickupPool: PickupPool,
    soundManager: SoundManager,
    particleSystem: ParticleSystem,
    playerScore: number,
    gameTime: number = 0
  ) {
    if (!this.alive) {
      if (this.respawnTimer > 0) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) {
          this.respawn(field, gameTime);
        }
      }
      return;
    }

    // Invulnerability timer countdown
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }

    // Passive HP Regeneration (keeps them durable and competitive)
    this.heal(8 * dt);

    this.aiDecisionTimer -= dt;

    // Evaluate navigation goal
    if (this.aiDecisionTimer <= 0) {
      this.aiDecisionTimer = 0.2 + Math.random() * 0.15;
      this.decideMovement(enemyGrid, activeBoss, contenders, pickupPool, gameTime);
    }

    // Smooth movement interpolation
    this.vx += (this.targetVx - this.vx) * dt * 5;
    this.vy += (this.targetVy - this.vy) * dt * 5;
    this.update(dt);

    // Arena boundary clamp
    const clamped = field.clamp(this.x, this.y, this.radius);
    this.x = clamped.x;
    this.y = clamped.y;

    // Collect Pickups (CPUs snatch Sword Items with 420px magnet and heal/empower on pickup!)
    const pickups = pickupPool.getActiveItems();
    for (const item of pickups) {
      const dx = this.x - item.x;
      const dy = this.y - item.y;
      const distSq = dx * dx + dy * dy;

      const effectiveMagnet = item.type === 'SWORD_ITEM' ? 420 : this.magnetRadius;
      if (distSq <= effectiveMagnet * effectiveMagnet) {
        item.target = this;
      }
      if (distSq <= (this.radius + item.radius) * (this.radius + item.radius)) {
        item.active = false;
        if (item.type === 'SWORD_ITEM') {
          this.swordSystem.addSword(1);
          this.swordSystem.baseDamage += 2;
          this.heal(40);
          particleSystem.emitBurst(this.x, this.y, this.color, 12, 160, 4, 0.3);
        } else if (item.type.startsWith('EXP')) {
          this.addExp(item.value);
        } else if (item.type === 'HEAL') {
          this.heal(item.value);
        }
      }
    }

    // Update Rotating Swords
    this.swordSystem.update(dt);

    // Special Activation check: if surrounded by rivals or enemies and special ready
    if (this.specialGauge >= 100) {
      const surrounding = enemyGrid.query(this.x, this.y, 450);
      const nearbyRivals = contenders.filter(c => c.id !== this.id && c.alive && Math.hypot(c.x - this.x, c.y - this.y) < 300);

      if (surrounding.length >= 5 || nearbyRivals.length >= 1) {
        this.specialGauge = 0;
        this.swordSystem.activateSwordStorm(4.5);
        particleSystem.emitRing(this.x, this.y, this.color, 400, 0.5);
      }
    }

    // Fire auto weapons
    this.weaponSystem.update(
      dt,
      this,
      enemyGrid,
      bulletPool,
      soundManager,
      particleSystem
    );

    // Dynamic catch-up scaling (keeps the competition fierce and close)
    if (this.score < playerScore * 0.8) {
      this.score += Math.floor(Math.random() * 2);
    }
  }

  private decideMovement(
    enemyGrid: SpatialGrid<Enemy>,
    activeBoss: Boss | null,
    contenders: { id: string; x: number; y: number; hp: number; maxHp: number; alive: boolean; isPlayer?: boolean }[],
    pickupPool: PickupPool,
    gameTime: number = 0
  ) {
    let desiredX = 0;
    let desiredY = 0;

    const nearbyEnemies = enemyGrid.query(this.x, this.y, 600);
    // Brief 5-second grace period on start, then all contenders actively battle!
    const earlyGamePeace = gameTime < 5;
    const rivals = contenders.filter((c) => c.id !== this.id && c.alive && (!earlyGamePeace || !c.isPlayer));
    const items = pickupPool.getActiveItems();
    const swordItems = items.filter((it) => it.type === 'SWORD_ITEM');

    // Universal Sword Prioritization: ALL archetypes value swords highly!
    if (swordItems.length > 0) {
      let closestSword: PickupItem | null = null;
      let minSwordDistSq = Infinity;
      for (const sw of swordItems) {
        const dSq = (sw.x - this.x) ** 2 + (sw.y - this.y) ** 2;
        if (dSq < minSwordDistSq) {
          minSwordDistSq = dSq;
          closestSword = sw;
        }
      }
      if (closestSword && minSwordDistSq < 700 * 700 && (this.archetype === 'COLLECTOR' || Math.random() < 0.80)) {
        desiredX = closestSword.x - this.x;
        desiredY = closestSword.y - this.y;
        const len = Math.hypot(desiredX, desiredY) || 1;
        this.targetVx = (desiredX / len) * this.speed;
        this.targetVy = (desiredY / len) * this.speed;
        return;
      }
    }

    switch (this.archetype) {
      case 'ATTACKER': {
        // Aggressively attack nearby rivals
        if (rivals.length > 0 && Math.random() < 0.85) {
          // Target closest rival
          let closestRival = rivals[0];
          let minDistSq = Infinity;
          for (const r of rivals) {
            const dSq = (r.x - this.x) ** 2 + (r.y - this.y) ** 2;
            if (dSq < minDistSq) {
              minDistSq = dSq;
              closestRival = r;
            }
          }
          desiredX = closestRival.x - this.x;
          desiredY = closestRival.y - this.y;
        } else if (nearbyEnemies.length > 0) {
          let cx = 0;
          let cy = 0;
          for (const e of nearbyEnemies) {
            cx += e.x;
            cy += e.y;
          }
          desiredX = cx / nearbyEnemies.length - this.x;
          desiredY = cy / nearbyEnemies.length - this.y;
        } else {
          desiredX = (Math.random() - 0.5) * 500;
          desiredY = (Math.random() - 0.5) * 500;
        }
        break;
      }

      case 'COLLECTOR': {
        // Highly prioritize SWORD_ITEM! If none, prioritize EXP items
        let closestItem: PickupItem | null = null;
        let minDistSq = Infinity;

        const targetList = swordItems.length > 0 ? swordItems : items;
        for (const it of targetList) {
          const dSq = (it.x - this.x) ** 2 + (it.y - this.y) ** 2;
          if (dSq < minDistSq) {
            minDistSq = dSq;
            closestItem = it;
          }
        }

        if (closestItem && minDistSq < 1000 * 1000) {
          desiredX = closestItem.x - this.x;
          desiredY = closestItem.y - this.y;
        } else if (nearbyEnemies.length > 0) {
          desiredX = nearbyEnemies[0].x - this.x;
          desiredY = nearbyEnemies[0].y - this.y;
        } else {
          desiredX = (Math.random() - 0.5) * 400;
          desiredY = (Math.random() - 0.5) * 400;
        }
        break;
      }

      case 'HUNTER': {
        // Hunt low-HP rivals first!
        let weakestRival: any = null;
        let minHpPct = 1.0;

        for (const r of rivals) {
          const d = Math.hypot(r.x - this.x, r.y - this.y);
          if (d < 900) {
            const hpPct = r.hp / r.maxHp;
            if (hpPct < minHpPct) {
              minHpPct = hpPct;
              weakestRival = r;
            }
          }
        }

        if (weakestRival && minHpPct < 0.65) {
          desiredX = weakestRival.x - this.x;
          desiredY = weakestRival.y - this.y;
        } else if (nearbyEnemies.length > 0) {
          // Hunt highest HP enemy
          let bestTarget: Enemy = nearbyEnemies[0];
          let maxHp = 0;
          for (const e of nearbyEnemies) {
            if (e.hp > maxHp) {
              maxHp = e.hp;
              bestTarget = e;
            }
          }
          desiredX = bestTarget.x - this.x;
          desiredY = bestTarget.y - this.y;
        }
        break;
      }

      case 'DEFENDER': {
        // If low HP, flee from all threats!
        if (this.hp < this.maxHp * 0.5) {
          let escapeX = 0;
          let escapeY = 0;
          for (const e of nearbyEnemies) {
            escapeX -= e.x - this.x;
            escapeY -= e.y - this.y;
          }
          for (const r of rivals) {
            const d = Math.hypot(r.x - this.x, r.y - this.y);
            if (d < 400) {
              escapeX -= r.x - this.x;
              escapeY -= r.y - this.y;
            }
          }
          desiredX = escapeX;
          desiredY = escapeY;
        } else if (nearbyEnemies.length > 0) {
          // Kite safely at perimeter
          const e = nearbyEnemies[0];
          const dist = Math.hypot(e.x - this.x, e.y - this.y);
          if (dist < 200) {
            desiredX = -(e.x - this.x);
            desiredY = -(e.y - this.y);
          } else {
            desiredX = -(e.y - this.y);
            desiredY = e.x - this.x;
          }
        }
        break;
      }

      case 'BOSS_HUNTER': {
        if (activeBoss && activeBoss.alive) {
          desiredX = activeBoss.x - this.x;
          desiredY = activeBoss.y - this.y;
        } else if (swordItems.length > 0) {
          desiredX = swordItems[0].x - this.x;
          desiredY = swordItems[0].y - this.y;
        } else if (nearbyEnemies.length > 0) {
          desiredX = nearbyEnemies[0].x - this.x;
          desiredY = nearbyEnemies[0].y - this.y;
        }
        break;
      }

      case 'PVP_AGGRESSOR': {
        // Always hunt other CPUs or the Player!
        if (rivals.length > 0) {
          let closestRival = rivals[0];
          let minDistSq = Infinity;
          for (const r of rivals) {
            const dSq = (r.x - this.x) ** 2 + (r.y - this.y) ** 2;
            if (dSq < minDistSq) {
              minDistSq = dSq;
              closestRival = r;
            }
          }
          const rDist = Math.sqrt(minDistSq);
          if (rDist > 90) {
            desiredX = closestRival.x - this.x;
            desiredY = closestRival.y - this.y;
          } else {
            // Tangential orbit circling to grind the rival with rotating swords!
            const nx = (closestRival.x - this.x) / (rDist || 1);
            const ny = (closestRival.y - this.y) / (rDist || 1);
            desiredX = -ny * 220 + nx * (rDist - 80);
            desiredY = nx * 220 + ny * (rDist - 80);
          }
        } else if (nearbyEnemies.length > 0) {
          desiredX = nearbyEnemies[0].x - this.x;
          desiredY = nearbyEnemies[0].y - this.y;
        }
        break;
      }

      case 'BALANCED':
      default: {
        if (this.hp < this.maxHp * 0.4) {
          // Flee if low hp
          if (nearbyEnemies.length > 0) {
            desiredX = -(nearbyEnemies[0].x - this.x);
            desiredY = -(nearbyEnemies[0].y - this.y);
          }
        } else if (swordItems.length > 0) {
          desiredX = swordItems[0].x - this.x;
          desiredY = swordItems[0].y - this.y;
        } else if (rivals.length > 0 && this.swordSystem.swordCount >= 4) {
          desiredX = rivals[0].x - this.x;
          desiredY = rivals[0].y - this.y;
        } else if (nearbyEnemies.length > 0) {
          desiredX = nearbyEnemies[0].x - this.x;
          desiredY = nearbyEnemies[0].y - this.y;
        }
        break;
      }
    }

    // Repulsive force to avoid ramming directly into dense enemy clusters
    let avoidX = 0;
    let avoidY = 0;
    for (const e of nearbyEnemies) {
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < 80 && d > 0.1) {
        const push = (80 - d) / 80;
        avoidX -= ((e.x - this.x) / d) * push * 380;
        avoidY -= ((e.y - this.y) / d) * push * 380;
      }
    }
    desiredX += avoidX;
    desiredY += avoidY;

    const mag = Math.hypot(desiredX, desiredY);
    if (mag > 0.01) {
      this.targetVx = (desiredX / mag) * this.speed;
      this.targetVy = (desiredY / mag) * this.speed;
    } else {
      this.targetVx = 0;
      this.targetVy = 0;
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (!this.alive) return;

    // Draw Orbiting Swords
    this.swordSystem.render(ctx, this.x, this.y, this.color);

    ctx.save();
    ctx.translate(this.x, this.y);

    // Invulnerability Shield Aura (when respawned)
    if (this.invulnerableTimer > 0) {
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      const pulse = Math.sin(Date.now() * 0.02) * 3;
      ctx.arc(0, 0, this.radius + 8 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // CPU Name Tag above head
    ctx.font = "700 13px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = this.accentColor;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    drawOutlinedText(ctx, this.name, 0, -this.radius - 20);

    // Overhead HP Bar
    const barW = 44;
    const barH = 5;
    const barY = -this.radius - 14;
    const hpPct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(-barW / 2, barY, barW, barH);
    ctx.fillStyle = hpPct < 0.3 ? '#ff2255' : '#00ff88';
    ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1;
    ctx.strokeRect(-barW / 2, barY, barW, barH);

    // Outer Aura
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
    ctx.stroke();

    // Body
    ctx.fillStyle = '#140c1c';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Core
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  public toContenderState(): ContenderState {
    return {
      id: this.id,
      name: this.name,
      isPlayer: false,
      archetype: this.archetype,
      color: this.color,
      accentColor: this.accentColor,
      score: this.score,
      kills: this.kills,
      level: this.level,
      swordCount: this.swordSystem ? this.swordSystem.swordCount : 1,
      rank: this.rank,
      prevRank: this.prevRank,
      hp: this.hp,
      maxHp: this.maxHp,
      alive: this.alive,
      respawnTimer: !this.alive && this.respawnTimer > 0 ? this.respawnTimer : undefined,
    };
  }
}

