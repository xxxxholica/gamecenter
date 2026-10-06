export interface ArenaPillar {
  x: number;
  y: number;
  radius: number;
}

export class Field {
  public readonly width: number = 3600;
  public readonly height: number = 3600;
  public readonly minX: number = -1800;
  public readonly maxX: number = 1800;
  public readonly minY: number = -1800;
  public readonly maxY: number = 1800;

  public readonly pillars: ArenaPillar[] = [];

  constructor() {
    // 8 tactical cyber-energy pillars across the 3600x3600 arena
    const positions = [
      { x: -700, y: -700 },
      { x: 700, y: -700 },
      { x: -700, y: 700 },
      { x: 700, y: 700 },
      { x: 0, y: -1100 },
      { x: 0, y: 1100 },
      { x: -1100, y: 0 },
      { x: 1100, y: 0 },
    ];
    for (const pos of positions) {
      this.pillars.push({ x: pos.x, y: pos.y, radius: 42 });
    }
  }

  public clamp(x: number, y: number, radius: number): { x: number; y: number } {
    let nx = Math.max(this.minX + radius, Math.min(this.maxX - radius, x));
    let ny = Math.max(this.minY + radius, Math.min(this.maxY - radius, y));

    // Resolve collision with arena pillars
    for (const pillar of this.pillars) {
      const dx = nx - pillar.x;
      const dy = ny - pillar.y;
      const dist = Math.hypot(dx, dy);
      const minDist = radius + pillar.radius;
      if (dist < minDist && dist > 0.001) {
        nx = pillar.x + (dx / dist) * minDist;
        ny = pillar.y + (dy / dist) * minDist;
      }
    }

    return { x: nx, y: ny };
  }

  public render(
    ctx: CanvasRenderingContext2D,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number
  ) {
    const left = camX - viewW / 2;
    const right = camX + viewW / 2;
    const top = camY - viewH / 2;
    const bottom = camY + viewH / 2;

    // 1. Cyber Floor Grid
    ctx.strokeStyle = 'rgba(0, 180, 255, 0.07)';
    ctx.lineWidth = 1;
    const gridSize = 100;
    const startX = Math.floor(Math.max(left, this.minX) / gridSize) * gridSize;
    const endX = Math.min(right, this.maxX);
    const startY = Math.floor(Math.max(top, this.minY) / gridSize) * gridSize;
    const endY = Math.min(bottom, this.maxY);

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, Math.max(top, this.minY));
      ctx.lineTo(x, Math.min(bottom, this.maxY));
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(Math.max(left, this.minX), y);
      ctx.lineTo(Math.min(right, this.maxX), y);
    }
    ctx.stroke();

    // 2. Arena Boundary Forcefield Walls
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#00f0ff';
    ctx.strokeRect(this.minX, this.minY, this.width, this.height);

    // Outer danger hazard stripe area
    ctx.fillStyle = 'rgba(255, 30, 60, 0.08)';
    if (left < this.minX) ctx.fillRect(left, top, this.minX - left, viewH);
    if (right > this.maxX) ctx.fillRect(this.maxX, top, right - this.maxX, viewH);
    if (top < this.minY) ctx.fillRect(left, top, viewW, this.minY - top);
    if (bottom > this.maxY) ctx.fillRect(left, this.maxY, viewW, bottom - this.maxY);

    // 3. Cyber Energy Pillars
    for (const pillar of this.pillars) {
      if (
        pillar.x + pillar.radius < left ||
        pillar.x - pillar.radius > right ||
        pillar.y + pillar.radius < top ||
        pillar.y - pillar.radius > bottom
      ) {
        continue;
      }

      ctx.save();
      ctx.translate(pillar.x, pillar.y);

      // Base shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.arc(0, 8, pillar.radius + 6, 0, Math.PI * 2);
      ctx.fill();

      // Outer ring
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, pillar.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Core glow
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, pillar.radius);
      grad.addColorStop(0, 'rgba(0, 255, 255, 0.8)');
      grad.addColorStop(0.7, 'rgba(0, 100, 200, 0.4)');
      grad.addColorStop(1, 'rgba(0, 20, 50, 0.9)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, pillar.radius - 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }
}
