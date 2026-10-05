import { Entity } from './Entity';
import { EnemyType } from '../types';
import { BulletPool } from '../weapons/BulletPool';

export class Enemy extends Entity {
  public type: EnemyType = 'NORMAL';
  public scoreValue: number = 10;
  public color: string = '#ff3366';
  public expType: 'EXP_SMALL' | 'EXP_MEDIUM' | 'EXP_LARGE' = 'EXP_SMALL';
  public attackDamage: number = 15;
  public shootTimer: number = 0;
  public shootCooldown: number = 2.5;

  // Chase Fatigue / De-aggro state (enemies break off pursuit after a while)
  public chaseTimer: number = 0;
  public maxChaseDuration: number = 4.5 + Math.random() * 4.0;
  public wanderTimer: number = 0;
  public wanderVx: number = 0;
  public wanderVy: number = 0;

  // Specialized combat states (Berserker & Weapon Master)
  public lungeTimer: number = 0;
  public lungeDuration: number = 0;
  public bladeAngle: number = 0;
  public weaponMode: 'LASER' | 'MISSILE' = Math.random() < 0.5 ? 'LASER' : 'MISSILE';
  public aimTimer: number = 0;
  public targetAimX: number = 0;
  public targetAimY: number = 0;

  constructor(x: number, y: number, type: EnemyType = 'NORMAL', difficultyMult: number = 1.0) {
    super(x, y, 16);
    this.type = type;

    switch (type) {
      case 'NORMAL':
        this.radius = 16;
        this.maxHp = 25 * difficultyMult;
        this.speed = 120 * Math.min(1.35, Math.sqrt(difficultyMult));
        this.scoreValue = 15;
        this.color = '#ff3366';
        this.attackDamage = 7;
        this.expType = 'EXP_SMALL';
        this.maxChaseDuration = 12.0 + Math.random() * 8.0;
        break;
      case 'FAST':
        this.radius = 14;
        this.maxHp = 18 * difficultyMult;
        this.speed = 185 * Math.min(1.35, Math.sqrt(difficultyMult));
        this.scoreValue = 25;
        this.color = '#ff9900';
        this.attackDamage = 6;
        this.expType = 'EXP_SMALL';
        this.maxChaseDuration = 15.0 + Math.random() * 6.0;
        break;
      case 'TANK':
        this.radius = 28;
        this.maxHp = 100 * difficultyMult;
        this.speed = 75 * Math.min(1.25, Math.sqrt(difficultyMult));
        this.scoreValue = 120;
        this.color = '#aa22ff';
        this.attackDamage = 16;
        this.expType = 'EXP_MEDIUM';
        this.maxChaseDuration = Infinity;
        break;
      case 'RANGED':
        this.radius = 18;
        this.maxHp = 38 * difficultyMult;
        this.speed = 95;
        this.scoreValue = 60;
        this.color = '#00ffaa';
        this.attackDamage = 9;
        this.expType = 'EXP_SMALL';
        this.shootCooldown = 2.0;
        this.maxChaseDuration = 16.0;
        break;
      case 'BERSERKER':
        this.radius = 20;
        this.maxHp = 50 * difficultyMult;
        this.speed = 225 * Math.min(1.3, Math.sqrt(difficultyMult));
        this.scoreValue = 150;
        this.color = '#ff0033';
        this.attackDamage = 15;
        this.expType = 'EXP_MEDIUM';
        this.maxChaseDuration = Infinity; // 交戦厨: 追跡を絶対に諦めず執拗に追う！
        break;
      case 'WEAPON_MASTER':
        this.radius = 26;
        this.maxHp = 110 * difficultyMult;
        this.speed = 105;
        this.scoreValue = 300;
        this.color = '#e000ff';
        this.attackDamage = 18;
        this.expType = 'EXP_LARGE';
        this.shootCooldown = 1.9;
        this.maxChaseDuration = Infinity;
        break;
      case 'ELITE':
        this.radius = 36;
        this.maxHp = 420 * difficultyMult;
        this.speed = 115 * Math.min(1.35, Math.sqrt(difficultyMult));
        this.scoreValue = 600;
        this.color = '#ff0055';
        this.attackDamage = 32;
        this.expType = 'EXP_LARGE';
        this.maxChaseDuration = Infinity;
        break;
      case 'BOSS':
        this.radius = 50;
        this.maxHp = 2500 * difficultyMult;
        this.speed = 85;
        this.scoreValue = 5000;
        this.color = '#ff0033';
        this.attackDamage = 45;
        this.expType = 'EXP_LARGE';
        this.maxChaseDuration = Infinity;
        break;
    }

    this.hp = this.maxHp;
  }

  public updateAI(
    dt: number,
    target: { x: number; y: number },
    bulletPool: BulletPool
  ) {
    if (!this.alive) return;

    this.update(dt);

    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (dist > 0.001) {
      if (this.type === 'BOSS') {
        // Boss maintains focused pursuit
        this.vx = (dx / dist) * this.speed;
        this.vy = (dy / dist) * this.speed;
      } else if (this.type === 'BERSERKER') {
        // 交戦厨: 追跡を絶対に諦めず、回転刃を展開して猛スピード突進！
        this.bladeAngle += dt * 9.0;
        let moveSpeed = this.speed;

        if (this.lungeDuration > 0) {
          this.lungeDuration -= dt;
          moveSpeed = this.speed * 2.1; // 猛烈な突進！
        } else {
          this.lungeTimer += dt;
          if (dist < 320 && this.lungeTimer >= 1.5) {
            this.lungeTimer = 0;
            this.lungeDuration = 0.50; // 突進開始
            moveSpeed = this.speed * 2.1;
          }
        }

        this.vx = (dx / dist) * moveSpeed;
        this.vy = (dy / dist) * moveSpeed;
      } else if (this.type === 'WEAPON_MASTER') {
        // 重火器兵: 照準線を定め、プラズマビームや誘導ミサイルをぶち込む！
        this.targetAimX = target.x;
        this.targetAimY = target.y;

        // 間合い管理 (240〜440px)
        if (dist > 440) {
          this.vx = (dx / dist) * this.speed;
          this.vy = (dy / dist) * this.speed;
        } else if (dist < 220) {
          this.vx = -(dx / dist) * this.speed * 0.9;
          this.vy = -(dy / dist) * this.speed * 0.9;
        } else {
          // 旋回運動
          this.vx = (-dy / dist) * this.speed * 0.65;
          this.vy = (dx / dist) * this.speed * 0.65;
        }

        this.aimTimer += dt;
        if (this.aimTimer >= this.shootCooldown) {
          this.aimTimer = 0;
          if (this.weaponMode === 'LASER') {
            // 直線プラズマ貫通レーザー
            bulletPool.spawn(
              this.x,
              this.y,
              (dx / dist) * 850,
              (dy / dist) * 850,
              'PLASMA_LASER',
              Math.round(this.attackDamage * 1.6),
              99,
              12,
              2.0,
              '#e000ff',
              'enemy',
              true
            );
          } else {
            // 2連マイクロミサイル
            for (let m = -1; m <= 1; m += 2) {
              const spread = Math.atan2(dy, dx) + m * 0.35;
              bulletPool.spawn(
                this.x,
                this.y,
                Math.cos(spread) * 420,
                Math.sin(spread) * 420,
                'HOMING_MISSILE',
                Math.round(this.attackDamage * 1.2),
                1,
                9,
                3.5,
                '#ff6600',
                'enemy',
                true
              );
            }
          }
        }
      } else if (this.wanderTimer > 0) {
        // 短い分散行動
        this.wanderTimer -= dt;
        this.vx = this.wanderVx;
        this.vy = this.wanderVy;

        // If target touches or comes near wandering enemy, re-aggro early
        if (dist < 140) {
          this.wanderTimer = 0;
          this.chaseTimer = 0;
          this.maxChaseDuration = 10.0 + Math.random() * 5.0;
        } else if (this.wanderTimer <= 0) {
          this.chaseTimer = 0;
          this.maxChaseDuration = 10.0 + Math.random() * 6.0;
        }
      } else {
        // Active pursuit
        this.chaseTimer += dt;
        if (this.chaseTimer >= this.maxChaseDuration && this.maxChaseDuration !== Infinity) {
          // Break off chase briefly for 1.2 ~ 2.0 seconds
          this.wanderTimer = 1.2 + Math.random() * 0.8;
          const awayAngle = Math.atan2(this.y - target.y, this.x - target.x) + (Math.random() - 0.5) * 1.2;
          const wanderSpeed = this.speed * 0.8;
          this.wanderVx = Math.cos(awayAngle) * wanderSpeed;
          this.wanderVy = Math.sin(awayAngle) * wanderSpeed;
          this.vx = this.wanderVx;
          this.vy = this.wanderVy;
        } else if (this.type === 'RANGED') {
          // Keep some distance and shoot
          if (dist > 350) {
            this.vx = (dx / dist) * this.speed;
            this.vy = (dy / dist) * this.speed;
          } else if (dist < 200) {
            this.vx = -(dx / dist) * this.speed * 0.8;
            this.vy = -(dy / dist) * this.speed * 0.8;
          } else {
            // Circle around target
            this.vx = (-dy / dist) * this.speed * 0.6;
            this.vy = (dx / dist) * this.speed * 0.6;
          }

          // Fire projectile
          this.shootTimer += dt;
          if (this.shootTimer >= this.shootCooldown) {
            this.shootTimer = 0;
            const bulletSpeed = 320;
            bulletPool.spawn(
              this.x,
              this.y,
              (dx / dist) * bulletSpeed,
              (dy / dist) * bulletSpeed,
              'ENERGY_BLASTER',
              this.attackDamage,
              1,
              7,
              3.0,
              '#ff2244',
              'enemy',
              true
            );
          }
        } else {
          // Direct chase
          this.vx = (dx / dist) * this.speed;
          this.vy = (dy / dist) * this.speed;
        }
      }
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (!this.alive) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    // Hit flash white
    if (this.flashTimer > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius + 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.fillStyle = this.color;
    if (this.type === 'ELITE') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
    }

    if (this.type === 'NORMAL') {
      // Triangle drone
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(this.radius, 0);
      ctx.lineTo(-this.radius * 0.7, -this.radius * 0.7);
      ctx.lineTo(-this.radius * 0.4, 0);
      ctx.lineTo(-this.radius * 0.7, this.radius * 0.7);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'FAST') {
      // Sleek arrowhead
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(this.radius * 1.3, 0);
      ctx.lineTo(-this.radius, -this.radius * 0.5);
      ctx.lineTo(-this.radius * 0.5, 0);
      ctx.lineTo(-this.radius, this.radius * 0.5);
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'TANK') {
      // Hexagon armored brute
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI * 2) / 6;
        const px = Math.cos(a) * this.radius;
        const py = Math.sin(a) * this.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Armor core
      ctx.fillStyle = '#220033';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'RANGED') {
      // Diamond sniper
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(this.radius, 0);
      ctx.lineTo(0, this.radius);
      ctx.lineTo(-this.radius, 0);
      ctx.closePath();
      ctx.fill();

      // Eye
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'ELITE') {
      // Spiky glowing elite boss mini
      const angle = Date.now() * 0.002;
      ctx.rotate(angle);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 === 0 ? this.radius * 1.2 : this.radius * 0.7;
        const a = (i * Math.PI * 2) / 8;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
    } else if (this.type === 'BERSERKER') {
      // 交戦厨: 真紅のトゲドローン + 回転ブラッドブレード
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);

      // Crimson Spiked Hull
      ctx.fillStyle = '#ff0033';
      ctx.beginPath();
      ctx.moveTo(this.radius * 1.3, 0);
      ctx.lineTo(-this.radius * 0.7, -this.radius * 0.85);
      ctx.lineTo(-this.radius * 0.35, 0);
      ctx.lineTo(-this.radius * 0.7, this.radius * 0.85);
      ctx.closePath();
      ctx.fill();

      // Spinning Twin Blood Blades
      ctx.strokeStyle = '#ff3366';
      ctx.lineWidth = 2.5;
      for (let b = 0; b < 2; b++) {
        const ba = this.bladeAngle + b * Math.PI;
        const bx = Math.cos(ba) * (this.radius + 10);
        const by = Math.sin(ba) * (this.radius + 10);
        ctx.beginPath();
        ctx.arc(bx, by, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Overhead badge
      ctx.rotate(-angle);
      ctx.font = '900 11px Impact, sans-serif';
      ctx.fillStyle = '#ff0033';
      ctx.textAlign = 'center';
      ctx.fillText('⚔️ 交戦厨', 0, -this.radius - 16);
    } else if (this.type === 'WEAPON_MASTER') {
      // 重火器兵: サイバー重装甲砲塔
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);

      // Heavy armored mecha chassis (Octagon)
      ctx.fillStyle = '#220838';
      ctx.strokeStyle = '#e000ff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI * 2) / 8;
        const px = Math.cos(a) * this.radius;
        const py = Math.sin(a) * this.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Twin Gun Barrels
      ctx.fillStyle = this.weaponMode === 'LASER' ? '#e000ff' : '#ff6600';
      ctx.fillRect(this.radius * 0.3, -5, this.radius * 0.8, 3.5);
      ctx.fillRect(this.radius * 0.3, 2, this.radius * 0.8, 3.5);

      // Laser aiming sight line (warnings before firing!)
      if (this.aimTimer > 0.6) {
        const aimPct = (this.aimTimer - 0.6) / (this.shootCooldown - 0.6);
        ctx.strokeStyle = `rgba(255, 0, 100, ${0.35 + aimPct * 0.6})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(this.radius + 500, 0);
        ctx.stroke();
      }

      // Overhead badge
      ctx.rotate(-angle);
      ctx.font = '900 11px Impact, sans-serif';
      ctx.fillStyle = this.weaponMode === 'LASER' ? '#e000ff' : '#ffaa00';
      ctx.textAlign = 'center';
      ctx.fillText(this.weaponMode === 'LASER' ? '⚡ 重レーザー' : '🚀 追尾ミサイル', 0, -this.radius - 16);
    }

    // Overhead Health Bar for any damaged enemy
    if (this.hp < this.maxHp) {
      const barW = Math.max(26, this.radius * 2);
      const barH = 5;
      const pct = Math.max(0, this.hp / this.maxHp);
      const barY = -this.radius - 12;

      // Dark background with subtle border
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.fillRect(-barW / 2, barY, barW, barH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-barW / 2, barY, barW, barH);

      // Gradient health fill (green -> orange -> red)
      ctx.fillStyle = pct > 0.5 ? '#00ff88' : (pct > 0.25 ? '#ffaa00' : '#ff2255');
      ctx.fillRect(-barW / 2, barY, barW * pct, barH);
    }

    ctx.restore();
  }
}
