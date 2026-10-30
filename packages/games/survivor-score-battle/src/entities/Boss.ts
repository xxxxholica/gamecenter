import { Enemy } from './Enemy';
import { BossType } from '../types';
import { BulletPool } from '../weapons/BulletPool';
import { ParticleSystem } from '../effects/ParticleSystem';
import { ScreenEffects } from '../effects/ScreenEffects';

export class Boss extends Enemy {
  public bossType: BossType;
  public bossName: string;
  public phase: number = 1;
  public attackTimer: number = 0;
  public specialTimer: number = 0;
  public chargeState: 'NONE' | 'WINDUP' | 'DASH' | 'COOLDOWN' = 'NONE';
  public chargeDirX: number = 0;
  public chargeDirY: number = 0;
  public chargeTimer: number = 0;

  constructor(x: number, y: number, bossType: BossType) {
    super(x, y, 'BOSS');
    this.bossType = bossType;

    switch (bossType) {
      case 'TITAN_MECH':
        this.bossName = 'TITAN';
        this.maxHp = 10000;
        this.radius = 55;
        this.speed = 115;
        this.scoreValue = 7000;
        this.color = '#ff3344';
        break;
      case 'VOID_WYRM':
        this.bossName = 'VOID';
        this.maxHp = 22000;
        this.radius = 62;
        this.speed = 128;
        this.scoreValue = 12000;
        this.color = '#aa00ff';
        break;
      case 'APEX_BEHEMOTH':
        this.bossName = 'APEX';
        this.maxHp = 35000;
        this.radius = 70;
        this.speed = 125;
        this.scoreValue = 18000;
        this.color = '#ffaa00';
        break;
      case 'OMEGA_OVERLORD':
        this.bossName = 'OMEGA';
        this.maxHp = 45000;
        this.radius = 76;
        this.speed = 135;
        this.scoreValue = 25000;
        this.color = '#ff0055';
        break;
    }

    this.hp = this.maxHp;
  }

  public updateBoss(
    dt: number,
    target: { x: number; y: number },
    bulletPool: BulletPool,
    particleSystem: ParticleSystem,
    screenEffects: ScreenEffects
  ) {
    if (!this.alive) return;

    this.update(dt);
    this.attackTimer += dt;
    this.specialTimer += dt;

    // Determine Phase based on HP percentage
    const hpPct = this.hp / this.maxHp;
    this.phase = hpPct < 0.35 ? 3 : hpPct < 0.7 ? 2 : 1;

    // 1. Charge Dash Attack
    if (this.chargeState === 'NONE' && this.specialTimer >= (this.phase === 3 ? 5.5 : 8.5)) {
      this.specialTimer = 0;
      this.chargeState = 'WINDUP';
      this.chargeTimer = 1.0;
      const dx = target.x - this.x;
      const dy = target.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      this.chargeDirX = dx / dist;
      this.chargeDirY = dy / dist;
    }

    if (this.chargeState === 'WINDUP') {
      this.chargeTimer -= dt;
      this.vx = 0;
      this.vy = 0;
      particleSystem.emitBurst(this.x, this.y, '#ffffff', 3, 100, 3, 0.2);
      if (this.chargeTimer <= 0) {
        this.chargeState = 'DASH';
        this.chargeTimer = 0.55;
        screenEffects.shake(8);
      }
      return;
    }

    if (this.chargeState === 'DASH') {
      this.chargeTimer -= dt;
      const dashSpeed = this.speed * 3.0;
      this.vx = this.chargeDirX * dashSpeed;
      this.vy = this.chargeDirY * dashSpeed;
      particleSystem.emitBurst(this.x, this.y, this.color, 4, 150, 6, 0.3);

      if (this.chargeTimer <= 0) {
        this.chargeState = 'COOLDOWN';
        this.chargeTimer = 0.6;
        // Shockwave upon stopping dash
        screenEffects.shake(12);
        particleSystem.emitRing(this.x, this.y, this.color, 250, 0.5);
      }
      return;
    }

    if (this.chargeState === 'COOLDOWN') {
      this.chargeTimer -= dt;
      this.vx = 0;
      this.vy = 0;
      if (this.chargeTimer <= 0) {
        this.chargeState = 'NONE';
      }
      return;
    }

    // 2. Normal Boss Movement
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * this.speed;
    this.vy = (dy / dist) * this.speed;

    // 3. Bullet Hell Attacks
    const fireInterval = this.phase === 3 ? 1.4 : this.phase === 2 ? 1.8 : 2.4;
    if (this.attackTimer >= fireInterval) {
      this.attackTimer = 0;
      this.fireBossBarrage(bulletPool, target);
    }
  }

  private fireBossBarrage(bulletPool: BulletPool, target: { x: number; y: number }) {
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const baseAngle = Math.atan2(dy, dx);

    if (this.bossType === 'TITAN_MECH') {
      // 14-way radial burst
      const count = 14;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count;
        const spd = 250;
        bulletPool.spawn(
          this.x,
          this.y,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          'ENERGY_BLASTER',
          22,
          1,
          9,
          3.5,
          '#ff3344',
          'boss',
          true
        );
      }
    } else if (this.bossType === 'VOID_WYRM') {
      // Spiral bullet streams
      const count = 18;
      const offset = Date.now() * 0.003;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count + offset;
        const spd = 265;
        bulletPool.spawn(
          this.x,
          this.y,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          'ENERGY_BLASTER',
          26,
          1,
          9,
          3.5,
          '#aa00ff',
          'boss',
          true
        );
      }
    } else if (this.bossType === 'APEX_BEHEMOTH') {
      // Dual targeted fan waves + 18-way ring
      const count = 18;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count;
        const spd = 275;
        bulletPool.spawn(
          this.x,
          this.y,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          'ENERGY_BLASTER',
          28,
          1,
          10,
          4.0,
          '#ffaa00',
          'boss',
          true
        );
      }
      // Targeted cone
      for (let i = -2; i <= 2; i++) {
        const angle = baseAngle + i * 0.18;
        const spd = 350;
        bulletPool.spawn(
          this.x,
          this.y,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          'ENERGY_BLASTER',
          30,
          1,
          10,
          3.0,
          '#ff3300',
          'boss',
          true
        );
      }
    } else if (this.bossType === 'OMEGA_OVERLORD') {
      // Ultimate Climax Bullet Hell: 20-way spiral with navigable gaps
      const count = 20;
      const offset = Date.now() * 0.004;
      for (let i = 0; i < count; i++) {
        const angle = (i * Math.PI * 2) / count + offset;
        const spd = 280;
        bulletPool.spawn(
          this.x,
          this.y,
          Math.cos(angle) * spd,
          Math.sin(angle) * spd,
          'ENERGY_BLASTER',
          32,
          1,
          10,
          4.0,
          '#ff0055',
          'boss',
          true
        );
      }
    }
  }

  public override render(ctx: CanvasRenderingContext2D) {
    if (!this.alive) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Draw directional dash telegraph line during WINDUP so player can dodge
    if (this.chargeState === 'WINDUP') {
      const dashDist = this.speed * 3.0 * 0.55 + this.radius;
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 40, 80, 0.78)';
      ctx.lineWidth = this.radius * 0.9;
      ctx.lineCap = 'round';
      ctx.setLineDash([18, 12]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(this.chargeDirX * dashDist, this.chargeDirY * dashDist);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(this.chargeDirX * dashDist, this.chargeDirY * dashDist);
      ctx.stroke();
      ctx.restore();
    }

    if (this.flashTimer > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 25;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    // Outer pulsating energy aura
    const pulse = 1 + Math.sin(Date.now() * 0.008) * 0.08;
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 25;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * pulse, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating boss glyph rings
    const rot = Date.now() * 0.0015;
    ctx.save();
    ctx.rotate(rot);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI * 2) / 6;
      ctx.strokeRect(Math.cos(a) * this.radius * 0.8 - 6, Math.sin(a) * this.radius * 0.8 - 6, 12, 12);
    }
    ctx.restore();

    // Core chassis
    ctx.fillStyle = '#100515';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius - 4, 0, Math.PI * 2);
    ctx.fill();

    // Inner Glowing Core
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, this.radius * 0.6);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, this.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
