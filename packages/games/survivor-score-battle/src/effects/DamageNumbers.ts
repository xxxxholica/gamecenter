export interface DamageText {
  x: number;
  y: number;
  text: string;
  subText?: string;
  color: string;
  size: number;
  isCrit: boolean;
  life: number;
  maxLife: number;
  vy: number;
  active: boolean;
}

export class DamageNumbers {
  private pool: DamageText[] = [];
  private readonly maxCount = 60;

  constructor() {
    for (let i = 0; i < this.maxCount; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        text: '',
        color: '#ffffff',
        size: 16,
        isCrit: false,
        life: 0,
        maxLife: 0.8,
        vy: -60,
        active: false,
      });
    }
  }

  public addDamage(x: number, y: number, amount: number, isCrit: boolean = false) {
    for (let i = 0; i < this.maxCount; i++) {
      const item = this.pool[i];
      if (!item.active) {
        item.x = x + (Math.random() - 0.5) * 20;
        item.y = y + (Math.random() - 0.5) * 10;
        item.text = Math.round(amount).toString();
        item.subText = isCrit ? 'CRITICAL!' : undefined;
        item.color = isCrit ? '#ffdd00' : '#ffffff';
        item.size = isCrit ? 26 : 18;
        item.isCrit = isCrit;
        item.life = isCrit ? 0.9 : 0.65;
        item.maxLife = item.life;
        item.vy = isCrit ? -80 : -50;
        item.active = true;
        break;
      }
    }
  }

  public addPopup(x: number, y: number, text: string, color: string = '#00f0ff', size: number = 24) {
    for (let i = 0; i < this.maxCount; i++) {
      const item = this.pool[i];
      if (!item.active) {
        item.x = x;
        item.y = y;
        item.text = text;
        item.subText = undefined;
        item.color = color;
        item.size = size;
        item.isCrit = true;
        item.life = 1.0;
        item.maxLife = 1.0;
        item.vy = -40;
        item.active = true;
        break;
      }
    }
  }

  public update(dt: number) {
    for (let i = 0; i < this.maxCount; i++) {
      const item = this.pool[i];
      if (!item.active) continue;

      item.life -= dt;
      if (item.life <= 0) {
        item.active = false;
        continue;
      }

      item.y += item.vy * dt;
      item.vy *= 0.92;
    }
  }

  public render(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let i = 0; i < this.maxCount; i++) {
      const item = this.pool[i];
      if (!item.active) continue;

      const alpha = Math.max(0, item.life / item.maxLife);
      const scale = item.isCrit ? 1.0 + (1 - alpha) * 0.3 : 1.0;

      ctx.save();
      ctx.translate(item.x, item.y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = alpha;

      if (item.subText) {
        ctx.font = `900 12px Impact, sans-serif`;
        ctx.fillStyle = '#ff2255';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(item.subText, 0, -item.size * 0.7);
        ctx.fillText(item.subText, 0, -item.size * 0.7);
      }

      ctx.font = `900 ${item.size}px Impact, sans-serif`;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeText(item.text, 0, 0);

      ctx.fillStyle = item.color;
      ctx.fillText(item.text, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }

  public clear() {
    for (let i = 0; i < this.maxCount; i++) {
      this.pool[i].active = false;
    }
  }
}
