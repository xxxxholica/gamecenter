import { Entity } from './Entity';
import { WeaponSystem } from '../weapons/WeaponSystem';
import { SwordSystem } from '../weapons/SwordSystem';
import { BulletPool } from '../weapons/BulletPool';
import { drawOutlinedText } from '../ui/outlinedText';
import { SpatialGrid } from '../world/SpatialGrid';
import { Enemy } from './Enemy';
import { SoundManager } from '../audio/SoundManager';
import { ParticleSystem } from '../effects/ParticleSystem';
import { DamageNumbers } from '../effects/DamageNumbers';
import { ScreenEffects } from '../effects/ScreenEffects';
import { PickupPool } from '../items/ExpGem';
import { Field } from '../world/Field';
import { ContenderState } from '../types';

export class Player extends Entity {
  public id: string = 'player';
  public name: string = 'あなた';
  public isPlayer: boolean = true;
  public color: string = '#00f0ff';
  public accentColor: string = '#ffd700';

  // Combat systems
  public weaponSystem: WeaponSystem;
  public swordSystem: SwordSystem;

  // Stats
  public magnetRadius: number = 180;
  public score: number = 0;
  public kills: number = 0;
  public level: number = 1;
  public exp: number = 0;
  public nextExp: number = 120;

  // Special Gauge
  public specialGauge: number = 0;
  public isSpecialReady: boolean = false;

  // Combo system
  public comboCount: number = 0;
  public comboTimer: number = 0;
  public readonly comboDuration: number = 2.5;
  public maxCombo: number = 0;

  // Ranking
  public rank: number = 1;
  public prevRank: number = 1;

  constructor(x: number, y: number) {
    super(x, y, 22);
    this.hp = 150;
    this.maxHp = 150;
    this.speed = 275;
    this.invulnerableTimer = 2.5; // 2.5s startup invulnerability barrier
    this.weaponSystem = new WeaponSystem(this.id, true);
    this.swordSystem = new SwordSystem(this.id, true, 2);
  }

  public addExp(amount: number, soundManager: SoundManager): boolean {
    this.exp += amount;
    soundManager.sfx.playExpPickup();

    if (this.exp >= this.nextExp) {
      this.exp -= this.nextExp;
      this.level += 1;
      this.heal(25);
      this.nextExp = Math.floor(this.nextExp * 1.45 + 50);
      soundManager.sfx.playLevelUp();
      return true; // Leveled up!
    }
    return false;
  }

  public addScore(amount: number, isKill: boolean = false, soundManager?: SoundManager, damageNumbers?: DamageNumbers) {
    if (isKill) {
      this.kills += 1;
      this.comboCount += 1;
      this.comboTimer = this.comboDuration;
      if (this.comboCount > this.maxCombo) {
        this.maxCombo = this.comboCount;
      }

      // Special gauge gain
      this.addSpecialGauge(1.2, soundManager, damageNumbers);

      // Sound and milestone popups
      if (soundManager) soundManager.sfx.playKill(this.comboCount);

      if (damageNumbers) {
        if (this.comboCount === 10) {
          damageNumbers.addPopup(this.x, this.y - 70, 'GREAT! 10 KILLS', '#ffaa00', 24);
        } else if (this.comboCount === 25) {
          damageNumbers.addPopup(this.x, this.y - 70, 'SUPER! 25 KILLS', '#ffdd00', 26);
        } else if (this.comboCount === 50) {
          damageNumbers.addPopup(this.x, this.y - 70, 'AMAZING!! 50 KILLS', '#ff2255', 30);
        } else if (this.comboCount === 100) {
          damageNumbers.addPopup(this.x, this.y - 70, 'MEGA KILL!! 100 KILLS', '#00f0ff', 36);
        }
      }
    }

    // Combo score multiplier
    let mult = 1.0;
    if (this.comboCount >= 100) mult = 3.0;
    else if (this.comboCount >= 50) mult = 2.0;
    else if (this.comboCount >= 25) mult = 1.5;
    else if (this.comboCount >= 10) mult = 1.2;

    this.score += Math.round(amount * mult);
  }

  public addSpecialGauge(
    amount: number,
    soundManager?: SoundManager,
    damageNumbers?: DamageNumbers
  ) {
    if (this.isSpecialReady) return;
    this.specialGauge = Math.min(100, this.specialGauge + amount);
    if (this.specialGauge >= 100) {
      this.isSpecialReady = true;
      if (soundManager) soundManager.sfx.playSpecialReady();
      if (damageNumbers) damageNumbers.addPopup(this.x, this.y - 50, 'SWORD STORM READY!', '#ff0055', 26);
    }
  }

  public activateSpecial(
    enemyGrid: SpatialGrid<Enemy>,
    soundManager: SoundManager,
    particleSystem: ParticleSystem,
    screenEffects: ScreenEffects,
    damageNumbers: DamageNumbers
  ): boolean {
    if (!this.isSpecialReady) return false;

    this.specialGauge = 0;
    this.isSpecialReady = false;

    // Dramatic Effects
    soundManager.sfx.playSwordStorm();
    this.swordSystem.activateSwordStorm(6.0);

    screenEffects.freeze(0.06);
    screenEffects.shake(25, 0.92);
    screenEffects.flash('#ffd700', 0.85);

    particleSystem.emitRing(this.x, this.y, '#ffd700', 1000, 0.8);
    particleSystem.emitBurst(this.x, this.y, '#ffd700', 40, 450, 8, 0.8);
    damageNumbers.addPopup(this.x, this.y - 80, 'SWORD STORM!!', '#ffd700', 42);

    // Initial shockwave clearing surrounding enemies
    const victims = enemyGrid.query(this.x, this.y, 800);
    for (const enemy of victims) {
      const isDead = enemy.takeDamage(1500);
      damageNumbers.addDamage(enemy.x, enemy.y, 1500, true);
      if (isDead) {
        this.addScore(enemy.scoreValue, true, soundManager, damageNumbers);
      }
    }

    return true;
  }

  public updatePlayer(
    dt: number,
    moveX: number,
    moveY: number,
    field: Field,
    enemyGrid: SpatialGrid<Enemy>,
    bulletPool: BulletPool,
    pickupPool: PickupPool,
    soundManager: SoundManager,
    particleSystem: ParticleSystem,
    damageNumbers: DamageNumbers,
    screenEffects: ScreenEffects
  ): boolean {
    if (!this.alive) return false;

    // 1. Movement
    this.vx = moveX * this.speed;
    this.vy = moveY * this.speed;
    this.update(dt);

    // Field clamp
    const clamped = field.clamp(this.x, this.y, this.radius);
    this.x = clamped.x;
    this.y = clamped.y;

    // 2. Combo decay
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
      }
    }

    // 2.5 Passive HP Regeneration (0.8 HP/sec)
    if (this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + 0.8 * dt);
    }

    // 3. Magnetize Pickups
    const pickups = pickupPool.getActiveItems();
    for (const item of pickups) {
      const dx = this.x - item.x;
      const dy = this.y - item.y;
      const distSq = dx * dx + dy * dy;

      const effectiveMagnet = item.type === 'SWORD_ITEM' ? 300 : this.magnetRadius;
      if (distSq <= effectiveMagnet * effectiveMagnet) {
        item.target = this;
      }

      // Collect pickup
      if (distSq <= (this.radius + item.radius) * (this.radius + item.radius)) {
        item.active = false;
        if (item.type === 'SWORD_ITEM') {
          this.swordSystem.addSword(1);
          soundManager.sfx.playSwordPickup();
          damageNumbers.addPopup(this.x, this.y - 45, 'SWORD +1!', '#ffd700', 26);
          particleSystem.emitBurst(this.x, this.y, '#ffd700', 22, 220, 5, 0.4);
          screenEffects.shake(5);
        } else if (item.type.startsWith('EXP')) {
          const leveled = this.addExp(item.value, soundManager);
          if (leveled) return true; // Notify level up!
        } else if (item.type === 'HEAL') {
          this.heal(item.value);
          soundManager.sfx.playExpPickup();
          damageNumbers.addPopup(this.x, this.y - 30, `+${item.value} HP`, '#00ff88', 20);
        } else if (item.type === 'MAGNET') {
          pickupPool.attractAllTo(this);
          soundManager.sfx.playSpecialReady();
          damageNumbers.addPopup(this.x, this.y - 30, 'MAGNET!', '#3388ff', 24);
        } else if (item.type === 'SPECIAL_ORB') {
          this.addSpecialGauge(item.value, soundManager, damageNumbers);
          damageNumbers.addPopup(this.x, this.y - 30, '+25% SPECIAL', '#ff2255', 22);
        }
      }
    }

    // 4. Update Rotating Swords
    this.swordSystem.update(dt);

    // 5. Auto-Weapons update
    this.weaponSystem.update(
      dt,
      this,
      enemyGrid,
      bulletPool,
      soundManager,
      particleSystem
    );

    return false;
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (!this.alive) return;

    // Draw Orbiting Swords in world space
    this.swordSystem.render(ctx, this.x, this.y, this.color);

    ctx.save();
    ctx.translate(this.x, this.y);

    // 1. Distinctive "YOU" Overhead Indicator
    ctx.font = "900 22px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    const bounce = Math.sin(Date.now() * 0.008) * 5;
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    drawOutlinedText(ctx, 'あなた', 0, -this.radius - 28 + bounce);
    ctx.shadowBlur = 0;

    // 2. Overhead HP Bar
    const barW = 54;
    const barH = 7;
    const barY = -this.radius - 20;
    const hpPct = Math.max(0, this.hp / this.maxHp);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(-barW / 2, barY, barW, barH);
    ctx.fillStyle = hpPct < 0.3 ? '#ff2255' : '#00ff88';
    ctx.fillRect(-barW / 2, barY, barW * hpPct, barH);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-barW / 2, barY, barW, barH);

    // 3. Outer Hero Aura
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius + 4, 0, Math.PI * 2);
    ctx.stroke();

    // 3.5 Invulnerability Barrier Shield
    if (this.invulnerableTimer > 0) {
      const shieldPulse = 1.0 + Math.sin(Date.now() * 0.015) * 0.08;
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, (this.radius + 12) * shieldPulse, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 215, 0, 0.22)';
      ctx.beginPath();
      ctx.arc(0, 0, (this.radius + 12) * shieldPulse, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Chassis / Core
    ctx.fillStyle = '#061622';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner bright core
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.4, this.color);
    grad.addColorStop(1, '#005577');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.75, 0, Math.PI * 2);
    ctx.fill();

    // Directional indicator
    if (this.vx !== 0 || this.vy !== 0) {
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.moveTo(this.radius + 6, 0);
      ctx.lineTo(this.radius - 4, -5);
      ctx.lineTo(this.radius - 4, 5);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  public toContenderState(): ContenderState {
    return {
      id: this.id,
      name: this.name,
      isPlayer: true,
      archetype: 'PLAYER',
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
    };
  }
}

