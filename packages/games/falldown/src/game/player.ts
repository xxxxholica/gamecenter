// ===========================================================
//  プレイヤー（ドリラー）の移動・掘削ロジック（純粋ロジック）
// ===========================================================
import { World, type Kind } from './world.ts';

export interface ControlState {
  /** -1 / 0 / 1 */
  dx: number;
  /** -1(下) / 0 / 1(上) */
  dy: number;
  /** アクションボタンを押している */
  dig: boolean;
  /** このフレームで押された */
  digPressed: boolean;
}

export type PlayerState = 'ground' | 'walk' | 'climb' | 'fall';

export interface DigAction {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  result: 'none' | 'hit' | 'break' | 'capsule' | 'blocked';
  count: number;
  /** 叩いたブロックの種類（爆弾の演出・加点用） */
  kind?: Kind;
}

const WALK_SPEED = 6.5;
const AIR_SHIFT_SPEED = 7;
const GRAVITY = 32;
const MAX_FALL = 13;
const CLIMB_TIME = 0.26;
const DIG_INTERVAL = 0.15;
const DIG_INTERVAL_FAST = 0.03;

export class Player {
  x = 4;
  y = 1;
  tx = 4;
  vy = 0;
  facing: 1 | -1 = 1;
  /** 掘っている向き（描画用） */
  aimX = 1;
  aimY = 0;
  state: PlayerState = 'ground';
  /** 検証用: true なら、掘る間隔を大幅に縮める */
  fastDig = false;
  digCooldown = 0;
  digAnim = 0;
  climbT = 0;
  climbFromX = 0;
  climbFromY = 0;
  climbHold = 0;
  landedImpact = 0;

  reset(x: number, y: number) {
    this.x = this.tx = x;
    this.y = y;
    this.vy = 0;
    this.state = 'ground';
    this.digCooldown = 0;
  }

  get col() {
    return Math.round(this.x);
  }
  get row() {
    return Math.round(this.y);
  }

  update(dt: number, c: ControlState, world: World): DigAction | null {
    this.digCooldown -= dt;
    this.digAnim = Math.max(0, this.digAnim - dt * 4);
    this.landedImpact = 0;
    let action: DigAction | null = null;

    // 掘削方向（移動キーとの同時押しで上下左右を選べる）
    let ax: number = this.facing;
    let ay = 0;
    if (c.dy < 0) { ax = 0; ay = -1; }
    else if (c.dy > 0) { ax = 0; ay = 1; }
    else if (c.dx !== 0) { ax = c.dx; ay = 0; }
    this.aimX = ax;
    this.aimY = ay;

    const wantsDig = c.dig && (c.digPressed || this.digCooldown <= 0);

    switch (this.state) {
      case 'ground': {
        const col = this.col;
        const row = this.row;
        this.y = row;
        this.x += clampStep(this.tx - this.x, WALK_SPEED * dt);
        if (!world.isSolid(col, row - 1)) {
          this.state = 'fall';
          this.vy = 0;
          this.tx = col;
          break;
        }
        // 横向きに掘ろうとしても、その先が空いている（またはアイテム）なら歩いて進む
        const sideOpen = ay === 0 && c.dx !== 0 && !world.isSolid(col + ax, row);
        if (wantsDig && this.digCooldown <= 0.05 && !sideOpen) {
          if (ax !== 0) this.facing = ax as 1 | -1;
          action = this.doDig(world, col + ax, row + ay, ax, ay);
          break;
        }
        if (c.dig && !sideOpen) break; // アクション中は歩かない
        if (c.dx !== 0) {
          this.facing = c.dx as 1 | -1;
          const nx = col + c.dx;
          if (!world.isSolid(nx, row)) {
            this.state = 'walk';
            this.tx = nx;
            this.climbHold = 0;
          } else if (this.canClimb(world, col, row, c.dx)) {
            this.climbHold += dt;
            if (this.climbHold > 0.12) this.startClimb(col, row);
          }
        } else if (c.dy > 0 && this.canClimb(world, col, row, this.facing)) {
          this.startClimb(col, row);
        } else {
          this.climbHold = 0;
        }
        break;
      }
      case 'walk': {
        const step = clampStep(this.tx - this.x, WALK_SPEED * dt);
        this.x += step;
        if (Math.abs(this.tx - this.x) < 1e-3) {
          this.x = this.tx;
          this.state = 'ground';
        }
        break;
      }
      case 'climb': {
        this.climbT += dt / CLIMB_TIME;
        const t = Math.min(this.climbT, 1);
        const up = Math.min(t / 0.55, 1);
        const side = Math.max(0, (t - 0.45) / 0.55);
        this.y = this.climbFromY + easeOut(up);
        this.x = this.climbFromX + this.facing * easeInOut(Math.min(side, 1));
        if (t >= 1) {
          this.x = this.tx = this.climbFromX + this.facing;
          this.y = this.climbFromY + 1;
          this.state = 'ground';
          this.climbHold = 0;
        }
        break;
      }
      case 'fall': {
        // 空中では左右の微調整のみ
        if (c.dx !== 0 && Math.abs(this.x - this.tx) < 0.15) {
          const nx = this.tx + c.dx;
          if (!world.isSolid(nx, Math.floor(this.y)) && !world.isSolid(nx, Math.ceil(this.y))) {
            this.tx = nx;
          }
          this.facing = c.dx as 1 | -1;
        }
        this.x += clampStep(this.tx - this.x, AIR_SHIFT_SPEED * dt);

        this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
        const ny = this.y - this.vy * dt;
        const r = Math.floor(this.y + 1e-4);
        if (ny <= r && world.isSolid(this.tx, r - 1)) {
          this.y = r;
          this.landedImpact = this.vy;
          this.vy = 0;
          this.state = 'ground';
        } else {
          this.y = ny;
        }
        // 落下中も掘れる（左右・下）
        if (wantsDig && this.digCooldown <= 0.05 && ay <= 0) {
          action = this.doDig(world, this.tx + ax, Math.round(this.y) + ay, ax, ay);
        }
        break;
      }
    }
    return action;
  }

  private canClimb(world: World, col: number, row: number, dir: number) {
    const b = world.get(col + dir, row);
    return (
      !!b && !b.falling &&
      !world.isSolid(col, row + 1) &&
      !world.isSolid(col + dir, row + 1)
    );
  }

  private startClimb(col: number, row: number) {
    this.state = 'climb';
    this.climbT = 0;
    this.climbFromX = col;
    this.climbFromY = row;
    this.climbHold = 0;
  }

  private doDig(world: World, x: number, y: number, dx: number, dy: number): DigAction {
    this.digCooldown = this.fastDig ? DIG_INTERVAL_FAST : DIG_INTERVAL;
    this.digAnim = 1;
    const r = world.dig(x, y);
    return { x, y, dirX: dx, dirY: dy, result: r.result, count: r.count, kind: r.kind };
  }
}

function clampStep(d: number, max: number) {
  return Math.max(-max, Math.min(max, d));
}
function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
}
function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
