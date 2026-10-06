import { HasPosition } from '../world/SpatialGrid';
import { PickupType } from '../types';

export class PickupItem implements HasPosition {
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public radius: number = 10;
  public type: PickupType = 'EXP_SMALL';
  public value: number = 10;
  public active: boolean = false;
  public color: string = '#00f0ff';
  public lifeTimer: number = 0;

  // Magnet target
  public target: { x: number; y: number } | null = null;
  public magnetSpeed: number = 0;

  public init(x: number, y: number, type: PickupType) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.active = true;
    this.target = null;
    this.magnetSpeed = 0;
    this.lifeTimer = 0;

    // Small random outward pop
    const angle = Math.random() * Math.PI * 2;
    const pop = 40 + Math.random() * 60;
    this.vx = Math.cos(angle) * pop;
    this.vy = Math.sin(angle) * pop;

    switch (type) {
      case 'EXP_SMALL':
        this.value = 10;
        this.radius = 8;
        this.color = '#00f0ff';
        break;
      case 'EXP_MEDIUM':
        this.value = 40;
        this.radius = 12;
        this.color = '#bf40bf';
        break;
      case 'EXP_LARGE':
        this.value = 150;
        this.radius = 16;
        this.color = '#ffdd00';
        break;
      case 'SWORD_ITEM':
        this.value = 1;
        this.radius = 22;
        this.color = '#ffd700';
        break;
      case 'HEAL':
        this.value = 25;
        this.radius = 14;
        this.color = '#00ff88';
        break;
      case 'MAGNET':
        this.value = 1;
        this.radius = 14;
        this.color = '#3388ff';
        break;
      case 'SPECIAL_ORB':
        this.value = 25;
        this.radius = 15;
        this.color = '#ff2255';
        break;
    }
  }

  public update(dt: number) {
    if (!this.active) return;
    this.lifeTimer += dt;

    if (this.target) {
      // Accelerate towards magnet target (faster pull for swords)
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const dist = Math.hypot(dx, dy);

      const accel = this.type === 'SWORD_ITEM' ? 2600 : 1400;
      this.magnetSpeed += dt * accel;
      const step = Math.max(this.magnetSpeed * dt, (this.type === 'SWORD_ITEM' ? 350 : 200) * dt);

      if (dist <= step || dist < (this.type === 'SWORD_ITEM' ? 24 : 12)) {
        this.x = this.target.x;
        this.y = this.target.y;
      } else {
        this.x += (dx / dist) * step;
        this.y += (dy / dist) * step;
      }
    } else {
      // Normal physics drift
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= 0.9;
      this.vy *= 0.9;
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    if (!this.active) return;

    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.type === 'SWORD_ITEM') {
      // Pulsing golden beacon ground aura
      const pulse = 1.0 + Math.sin(this.lifeTimer * 5) * 0.25;
      ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 24 * pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Sparkling floating animation
    const bob = Math.sin(this.lifeTimer * 6) * 3;
    ctx.translate(0, bob);

    ctx.fillStyle = this.color;

    if (this.type === 'SWORD_ITEM') {
      // Floating glowing golden sword icon
      const spinAngle = this.lifeTimer * 3.5;
      ctx.rotate(spinAngle);

      // Blade
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ffd700';
      ctx.lineWidth = 2.5;

      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(4, -6);
      ctx.lineTo(3, 4);
      // Guard
      ctx.lineTo(8, 4);
      ctx.lineTo(8, 7);
      ctx.lineTo(2, 7);
      // Grip
      ctx.lineTo(2, 14);
      ctx.lineTo(-2, 14);
      ctx.lineTo(-2, 7);
      // Left Guard
      ctx.lineTo(-8, 7);
      ctx.lineTo(-8, 4);
      ctx.lineTo(-3, 4);
      ctx.lineTo(-4, -6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Gleam core
      ctx.fillStyle = '#ff3366';
      ctx.beginPath();
      ctx.arc(0, 5, 2.5, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type.startsWith('EXP')) {
      // Diamond crystal shape
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(this.radius * 0.7, 0);
      ctx.lineTo(0, this.radius);
      ctx.lineTo(-this.radius * 0.7, 0);
      ctx.closePath();
      ctx.fill();

      // White shiny highlight
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-2, -3, this.radius * 0.25, 0, Math.PI * 2);
      ctx.fill();
    } else if (this.type === 'HEAL') {
      // Cross / Heart shape
      ctx.fillRect(-this.radius * 0.3, -this.radius, this.radius * 0.6, this.radius * 2);
      ctx.fillRect(-this.radius, -this.radius * 0.3, this.radius * 2, this.radius * 0.6);
    } else {
      // Glowing orb
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

export class PickupPool {
  private pool: PickupItem[] = [];
  private readonly maxItems = 700;

  constructor() {
    for (let i = 0; i < this.maxItems; i++) {
      this.pool.push(new PickupItem());
    }
  }

  public spawn(x: number, y: number, type: PickupType): PickupItem | null {
    for (let i = 0; i < this.maxItems; i++) {
      const item = this.pool[i];
      if (!item.active) {
        item.init(x, y, type);
        return item;
      }
    }
    return null;
  }

  public spawnSwordBurst(x: number, y: number, count: number) {
    for (let i = 0; i < count; i++) {
      const item = this.spawn(x, y, 'SWORD_ITEM');
      if (item) {
        const angle = (i * Math.PI * 2) / count + (Math.random() - 0.5) * 0.5;
        const speed = 120 + Math.random() * 100;
        item.vx = Math.cos(angle) * speed;
        item.vy = Math.sin(angle) * speed;
      }
    }
  }

  public clear() {
    for (let i = 0; i < this.maxItems; i++) {
      this.pool[i].active = false;
    }
  }

  public getActiveItems(): PickupItem[] {
    return this.pool.filter((item) => item.active);
  }


  public attractAllTo(target: { x: number; y: number }) {
    for (let i = 0; i < this.maxItems; i++) {
      const item = this.pool[i];
      if (item.active) {
        item.target = target;
      }
    }
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxItems; i++) {
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
    const left = camX - viewW / 2 - 50;
    const right = camX + viewW / 2 + 50;
    const top = camY - viewH / 2 - 50;
    const bottom = camY + viewH / 2 + 50;

    for (let i = 0; i < this.maxItems; i++) {
      const item = this.pool[i];
      if (!item.active) continue;
      if (item.x < left || item.x > right || item.y < top || item.y > bottom) continue;
      item.render(ctx);
    }
  }
}
