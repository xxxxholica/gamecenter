import { HasPosition } from '../world/SpatialGrid';
import { WeaponType } from '../types';

export class Bullet implements HasPosition {
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public radius: number = 8;
  public damage: number = 25;
  public pierce: number = 1;
  public hitsLeft: number = 1;
  public life: number = 1.0;
  public maxLife: number = 1.0;
  public type: WeaponType = 'ENERGY_BLASTER';
  public color: string = '#00f0ff';
  public active: boolean = false;
  public isEnemy: boolean = false;
  public ownerId: string = '';

  // Homing missile target
  public target: { x: number; y: number; alive: boolean } | null = null;
  public turnSpeed: number = 6.0;

  // Orbit blade
  public orbitAngle: number = 0;
  public orbitDistance: number = 75;
  public orbitSpeed: number = 4.0;
  public owner: { x: number; y: number } | null = null;

  // Pulse ring
  public maxRadius: number = 150;

  // Set of entities already hit by this piercing bullet to avoid multi-hitting every frame
  public hitEntities: Set<any> = new Set();

  public init(
    x: number,
    y: number,
    vx: number,
    vy: number,
    type: WeaponType,
    damage: number,
    pierce: number,
    radius: number,
    life: number,
    color: string,
    ownerId: string,
    isEnemy: boolean = false
  ) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.type = type;
    this.damage = damage;
    this.pierce = pierce;
    this.hitsLeft = pierce;
    this.radius = radius;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.ownerId = ownerId;
    this.isEnemy = isEnemy;
    this.active = true;
    this.target = null;
    this.owner = null;
    this.hitEntities.clear();
  }

  public update(dt: number) {
    if (!this.active) return;

    this.life -= dt;
    if (this.life <= 0) {
      this.active = false;
      return;
    }

    if (this.type === 'ORBIT_BLADE' && this.owner) {
      this.orbitAngle += this.orbitSpeed * dt;
      this.x = this.owner.x + Math.cos(this.orbitAngle) * this.orbitDistance;
      this.y = this.owner.y + Math.sin(this.orbitAngle) * this.orbitDistance;
      return;
    }

    if (this.type === 'PULSE_RING' && this.owner) {
      this.x = this.owner.x;
      this.y = this.owner.y;
      const progress = 1 - this.life / this.maxLife;
      this.radius = this.maxRadius * progress;
      return;
    }

    if (this.type === 'HOMING_MISSILE') {
      if (this.target && this.target.alive) {
        const targetAngle = Math.atan2(this.target.y - this.y, this.target.x - this.x);
        let currentAngle = Math.atan2(this.vy, this.vx);
        let angleDiff = targetAngle - currentAngle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

        currentAngle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), this.turnSpeed * dt);
        const speed = Math.hypot(this.vx, this.vy);
        this.vx = Math.cos(currentAngle) * speed;
        this.vy = Math.sin(currentAngle) * speed;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.type === 'ENERGY_BLASTER') {
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, this.radius * 2, this.radius, 0, 0, Math.PI * 2);
      ctx.fill();
      // White hot core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, this.radius, this.radius * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'HOMING_MISSILE') {
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      ctx.fillStyle = this.color;
      // Missile body
      ctx.fillRect(-this.radius, -this.radius * 0.5, this.radius * 2, this.radius);
      // Flame trail
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.moveTo(-this.radius, -this.radius * 0.4);
      ctx.lineTo(-this.radius - 8, 0);
      ctx.lineTo(-this.radius, this.radius * 0.4);
      ctx.fill();
    } else if (this.type === 'PLASMA_LASER') {
      const angle = Math.atan2(this.vy, this.vx);
      ctx.rotate(angle);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-this.radius * 3, -this.radius * 0.5, this.radius * 6, this.radius);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.radius * 3, -this.radius * 0.5, this.radius * 6, this.radius);
    } else if (this.type === 'ORBIT_BLADE') {
      ctx.rotate(this.orbitAngle * 4);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const a = (i * Math.PI * 2) / 3;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * this.radius * 1.5, Math.sin(a) * this.radius * 1.5);
      }
      ctx.stroke();
    } else if (this.type === 'PULSE_RING') {
      const progress = 1 - this.life / this.maxLife;
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 4 * (1 - progress);
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (this.type === 'THUNDER_BOLT') {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, -600);
      ctx.lineTo(-10, -300);
      ctx.lineTo(12, -120);
      ctx.lineTo(0, 0);
      ctx.stroke();
    } else if (this.type === 'NOVA_BOMB') {
      const progress = 1 - this.life / this.maxLife;
      const alpha = Math.max(0.06, (1 - progress * 0.65) * 0.18);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = Math.min(0.75, alpha * 3.8);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      // Default glowing orb
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class BulletPool {
  private pool: Bullet[] = [];
  private readonly maxBullets = 800;

  constructor() {
    for (let i = 0; i < this.maxBullets; i++) {
      this.pool.push(new Bullet());
    }
  }

  public spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    type: WeaponType,
    damage: number,
    pierce: number,
    radius: number,
    life: number,
    color: string,
    ownerId: string,
    isEnemy: boolean = false
  ): Bullet | null {
    for (let i = 0; i < this.maxBullets; i++) {
      const b = this.pool[i];
      if (!b.active) {
        b.init(x, y, vx, vy, type, damage, pierce, radius, life, color, ownerId, isEnemy);
        return b;
      }
    }
    return null;
  }

  public clear() {
    for (let i = 0; i < this.maxBullets; i++) {
      this.pool[i].active = false;
    }
  }

  /** update の途中で再利用する、アクティブな弾の一覧(毎フレーム新しい配列を作らない) */
  private readonly activeBuf: Bullet[] = [];

  /**
   * その時点でアクティブな弾の一覧(スナップショット)。返す配列は次の呼び出しまで有効で、呼び出し側は保持しない。
   * ループ中に新しく撃たれた弾は含まれない(以前の filter の結果と同じ)。
   */
  public getActiveBullets(): readonly Bullet[] {
    const buf = this.activeBuf;
    buf.length = 0;
    for (let i = 0; i < this.maxBullets; i++) {
      if (this.pool[i].active) buf.push(this.pool[i]);
    }
    return buf;
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxBullets; i++) {
      if (this.pool[i].active) {
        this.pool[i].update(dt);
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number
  ) {
    const left = camX - viewW / 2 - 100;
    const right = camX + viewW / 2 + 100;
    const top = camY - viewH / 2 - 100;
    const bottom = camY + viewH / 2 + 100;

    for (let i = 0; i < this.maxBullets; i++) {
      const b = this.pool[i];
      if (!b.active) continue;
      if (b.x < left || b.x > right || b.y < top || b.y > bottom) continue;
      b.render(ctx);
    }
  }
}
