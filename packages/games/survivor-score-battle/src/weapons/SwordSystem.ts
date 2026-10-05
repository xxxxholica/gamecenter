export interface BladeHitbox {
  x: number;
  y: number;
  radius: number;
  damage: number;
  angle: number;
}

export class SwordSystem {
  public ownerId: string;
  public isPlayer: boolean;

  public swordCount: number = 1;
  public baseDamage: number = 75;
  public damageMult: number = 1.0;

  public baseSpeed: number = 3.6; // radians / sec
  public speedMult: number = 1.0;

  public baseSize: number = 1.0;
  public sizeMult: number = 1.0;

  public baseRadius: number = 80;
  public radiusMult: number = 1.0;

  public orbitAngle: number = 0;
  public stormTimer: number = 0;

  // Target cooldown map (target -> timestamp when damage can next be dealt)
  private hitCooldowns: Map<any, number> = new Map();

  constructor(ownerId: string, isPlayer: boolean, initialSwords: number = 1) {
    this.ownerId = ownerId;
    this.isPlayer = isPlayer;
    this.swordCount = Math.max(1, initialSwords);
  }

  public addSword(count: number = 1) {
    this.swordCount = Math.min(64, this.swordCount + count);
  }

  public activateSwordStorm(duration: number = 6.0) {
    this.stormTimer = duration;
  }

  public get isStormActive(): boolean {
    return this.stormTimer > 0;
  }

  public update(dt: number) {
    if (this.stormTimer > 0) {
      this.stormTimer -= dt;
    }

    const currentSpeed = this.isStormActive
      ? this.baseSpeed * this.speedMult * 2.8
      : this.baseSpeed * this.speedMult;

    this.orbitAngle += currentSpeed * dt;

    // Clean up hit cooldowns
    const now = performance.now();
    for (const [target, expireTime] of this.hitCooldowns) {
      if (now >= expireTime) {
        this.hitCooldowns.delete(target);
      }
    }
  }

  public canHitTarget(target: any): boolean {
    const now = performance.now();
    const nextHitTime = this.hitCooldowns.get(target);
    return !nextHitTime || now >= nextHitTime;
  }

  public registerHit(target: any) {
    const hitInterval = this.isStormActive ? 25 : 45; // ms (allows rapid cutting of all swords)
    this.hitCooldowns.set(target, performance.now() + hitInterval);
  }

  /**
   * Calculates hitboxes for all currently orbiting swords
   */
  public getBladeHitboxes(ownerX: number, ownerY: number): BladeHitbox[] {
    const hitboxes: BladeHitbox[] = [];
    const count = this.swordCount;
    const isStorm = this.isStormActive;

    const size = (isStorm ? 2.2 : 1.0) * this.baseSize * this.sizeMult;
    const damage = (isStorm ? 2.2 : 1.0) * this.baseDamage * this.damageMult;
    const hitRadius = (isStorm ? 36 : 28) * size;

    if (count <= 8) {
      // Single orbit ring
      const r = this.baseRadius * this.radiusMult + (count > 4 ? (count - 4) * 6 : 0);
      for (let i = 0; i < count; i++) {
        const a = this.orbitAngle + (i * Math.PI * 2) / count;
        // Sword center
        const x = ownerX + Math.cos(a) * r;
        const y = ownerY + Math.sin(a) * r;
        hitboxes.push({ x, y, radius: hitRadius, damage, angle: a });

        // Inner hilt coverage (prevents inside-orbit deadzone)
        const inX = ownerX + Math.cos(a) * (r * 0.62);
        const inY = ownerY + Math.sin(a) * (r * 0.62);
        hitboxes.push({ x: inX, y: inY, radius: hitRadius * 0.85, damage, angle: a });

        // Outer tip coverage (extends forward cutting edge)
        const tipX = ownerX + Math.cos(a) * (r * 1.25);
        const tipY = ownerY + Math.sin(a) * (r * 1.25);
        hitboxes.push({ x: tipX, y: tipY, radius: hitRadius * 0.85, damage, angle: a });
      }
    } else {
      // Dual orbit rings (inner and outer rings)
      const innerCount = 6;
      const outerCount = count - innerCount;

      const innerR = (this.baseRadius * this.radiusMult) * 0.75;
      const outerR = (this.baseRadius * this.radiusMult) * 1.25 + (outerCount > 8 ? 15 : 0);

      // Inner ring
      for (let i = 0; i < innerCount; i++) {
        const a = this.orbitAngle + (i * Math.PI * 2) / innerCount;
        const x = ownerX + Math.cos(a) * innerR;
        const y = ownerY + Math.sin(a) * innerR;
        hitboxes.push({ x, y, radius: hitRadius, damage, angle: a });

        const inX = ownerX + Math.cos(a) * (innerR * 0.58);
        const inY = ownerY + Math.sin(a) * (innerR * 0.58);
        hitboxes.push({ x: inX, y: inY, radius: hitRadius * 0.8, damage, angle: a });
      }

      // Outer ring
      for (let i = 0; i < outerCount; i++) {
        const a = -this.orbitAngle * 1.15 + (i * Math.PI * 2) / outerCount;
        const x = ownerX + Math.cos(a) * outerR;
        const y = ownerY + Math.sin(a) * outerR;
        hitboxes.push({ x, y, radius: hitRadius, damage, angle: a });

        const tipX = ownerX + Math.cos(a) * (outerR * 1.22);
        const tipY = ownerY + Math.sin(a) * (outerR * 1.22);
        hitboxes.push({ x: tipX, y: tipY, radius: hitRadius * 0.85, damage, angle: a });
      }
    }

    return hitboxes;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    ownerX: number,
    ownerY: number,
    themeColor: string
  ) {
    const hitboxes = this.getBladeHitboxes(ownerX, ownerY);
    const isStorm = this.isStormActive;
    const size = (isStorm ? 2.2 : 1.0) * this.baseSize * this.sizeMult;

    ctx.save();

    for (let i = 0; i < hitboxes.length; i++) {
      const hb = hitboxes[i];
      ctx.save();
      ctx.translate(hb.x, hb.y);

      // Tangential or outward sword orientation (cutting angle)
      const bladeOrientation = hb.angle + Math.PI * 0.5;
      ctx.rotate(bladeOrientation);

      // Outer Glow
      const bladeGlow = isStorm ? '#ffd700' : themeColor;
      if (this.isPlayer && isStorm) {
        ctx.shadowColor = bladeGlow;
        ctx.shadowBlur = 12;
      }

      const bladeLen = 38 * size;
      const bladeW = 8 * size;

      // 1. Blade Body (Sharp Cyber Broadsword)
      ctx.fillStyle = isStorm ? '#fffae0' : '#ffffff';
      ctx.beginPath();
      // Tip
      ctx.moveTo(0, -bladeLen);
      // Right edge
      ctx.lineTo(bladeW * 0.5, -bladeLen * 0.65);
      ctx.lineTo(bladeW * 0.4, 0);
      // Hilt guard
      ctx.lineTo(bladeW * 0.9, 0);
      ctx.lineTo(bladeW * 0.9, 4 * size);
      ctx.lineTo(bladeW * 0.2, 4 * size);
      // Handle
      ctx.lineTo(bladeW * 0.2, 12 * size);
      ctx.lineTo(-bladeW * 0.2, 12 * size);
      ctx.lineTo(-bladeW * 0.2, 4 * size);
      // Left hilt guard
      ctx.lineTo(-bladeW * 0.9, 4 * size);
      ctx.lineTo(-bladeW * 0.9, 0);
      ctx.lineTo(-bladeW * 0.4, 0);
      // Left edge
      ctx.lineTo(-bladeW * 0.5, -bladeLen * 0.65);
      ctx.closePath();
      ctx.fill();

      // 2. Neon Edge Outline
      ctx.strokeStyle = bladeGlow;
      ctx.lineWidth = isStorm ? 3.5 : 2;
      ctx.stroke();

      // 3. Center Energy Channel
      ctx.strokeStyle = isStorm ? '#ff2255' : bladeGlow;
      ctx.lineWidth = 1.5 * size;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -bladeLen * 0.85);
      ctx.stroke();

      ctx.restore();
    }

    // Motion Orbit Arc Trail
    if (hitboxes.length > 0) {
      const firstR = Math.hypot(hitboxes[0].x - ownerX, hitboxes[0].y - ownerY);
      ctx.strokeStyle = isStorm ? 'rgba(255, 215, 0, 0.4)' : 'rgba(0, 240, 255, 0.15)';
      ctx.lineWidth = isStorm ? 5 : 2;
      ctx.beginPath();
      ctx.arc(ownerX, ownerY, firstR, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.restore();
  }
}
