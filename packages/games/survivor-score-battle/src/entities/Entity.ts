import { HasPosition } from '../world/SpatialGrid';

export class Entity implements HasPosition {
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public radius: number = 20;

  public hp: number = 100;
  public maxHp: number = 100;
  public speed: number = 200;

  public alive: boolean = true;
  public invulnerableTimer: number = 0;
  public flashTimer: number = 0;

  constructor(x: number, y: number, radius: number = 20) {
    this.x = x;
    this.y = y;
    this.radius = radius;
  }

  public update(dt: number) {
    if (this.invulnerableTimer > 0) {
      this.invulnerableTimer -= dt;
    }
    if (this.flashTimer > 0) {
      this.flashTimer -= dt;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  public takeDamage(amount: number): boolean {
    if (!this.alive || this.invulnerableTimer > 0) return false;

    this.hp -= amount;
    this.flashTimer = 0.08;

    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      return true; // Died
    }

    return false;
  }

  public heal(amount: number) {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }
}
