export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
  shape: 'CIRCLE' | 'STAR' | 'RING' | 'SPARK';
  active: boolean;
}

export class ParticleSystem {
  private pool: Particle[] = [];
  private readonly maxParticles = 350;
  private nextIdx: number = 0;

  constructor() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 4,
        color: '#ffffff',
        alpha: 1,
        life: 0,
        maxLife: 1,
        shape: 'CIRCLE',
        active: false,
      });
    }
  }

  private getParticle(): Particle | null {
    for (let i = 0; i < this.maxParticles; i++) {
      const idx = (this.nextIdx + i) % this.maxParticles;
      if (!this.pool[idx].active) {
        this.nextIdx = (idx + 1) % this.maxParticles;
        return this.pool[idx];
      }
    }
    return null;
  }

  public emitBurst(
    x: number,
    y: number,
    color: string,
    count: number = 16,
    speed: number = 220,
    radius: number = 4,
    life: number = 0.5
  ) {
    for (let i = 0; i < count; i++) {
      const p = this.getParticle();
      if (!p) break;

      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.4 + Math.random() * 0.8);

      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.radius = radius * (0.6 + Math.random() * 0.8);
      p.color = color;
      p.alpha = 1;
      p.life = life * (0.7 + Math.random() * 0.6);
      p.maxLife = p.life;
      p.shape = Math.random() > 0.4 ? 'CIRCLE' : 'SPARK';
      p.active = true;
    }
  }

  public emitRing(x: number, y: number, color: string, maxRadius: number = 200, duration: number = 0.6) {
    const p = this.getParticle();
    if (!p) return;

    p.x = x;
    p.y = y;
    p.vx = 0;
    p.vy = 0;
    p.radius = maxRadius;
    p.color = color;
    p.alpha = 1;
    p.life = duration;
    p.maxLife = duration;
    p.shape = 'RING';
    p.active = true;
  }

  public clear() {
    for (let i = 0; i < this.maxParticles; i++) {
      this.pool[i].active = false;
    }
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }

      p.alpha = Math.max(0, p.life / p.maxLife);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (let i = 0; i < this.maxParticles; i++) {
      const p = this.pool[i];
      if (!p.active) continue;

      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;

      if (p.shape === 'CIRCLE') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'SPARK') {
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if (p.shape === 'RING') {
        const progress = 1 - p.life / p.maxLife;
        const currentR = p.radius * Math.sin(progress * Math.PI * 0.5);
        ctx.lineWidth = 4 * (1 - progress);
        ctx.beginPath();
        ctx.arc(p.x, p.y, currentR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}
