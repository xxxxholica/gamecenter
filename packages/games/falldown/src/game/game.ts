// ===========================================================
//  ゲーム全体の状態（酸素・残機・スコア・深さ）
// ===========================================================
import { World, difficulty, type Kind, type WorldEvent } from './world.ts';
import { Player, type ControlState, type DigAction } from './player.ts';

export type Phase = 'title' | 'playing' | 'dying' | 'gameover' | 'clear';

export type GameEvent =
  | WorldEvent
  | { type: 'dig'; action: DigAction }
  | { type: 'crush'; x: number; y: number; lifeLost: boolean }
  | { type: 'suffocate'; x: number; y: number }
  | { type: 'score'; x: number; y: number; amount: number; label?: string }
  | { type: 'layer'; layer: number }
  | { type: 'landPlayer'; impact: number }
  | { type: 'gameover' }
  | { type: 'clear'; bonus: ClearBonus };

export interface ClearBonus {
  clear: number;
  air: number;
  lives: number;
  time: number;
  total: number;
}

export const MAX_AIR = 100;
export const START_LIVES = 3;
const INVULN_TIME = 2.5;
/** ゴール（黄金郷）の深さ。ここに立てばクリア */
export const GOAL_DEPTH = 500;
/** ゴール地点でプレイヤーが立つ行（この下が黄金郷の床） */
export const GOAL_Y = 1 - GOAL_DEPTH;
/** クリアタイムボーナスの基準（これより早いほど加点） */
const PAR_TIME = 600;

export class Game {
  world: World;
  player = new Player();
  phase: Phase = 'title';
  air = MAX_AIR;
  lives = START_LIVES;
  score = 0;
  maxDepth = 0;
  invuln = 0;
  dyingTimer = 0;
  time = 0;
  /** 検証用(URLに ?debug): 無敵(潰されない・酸素が減らない)。記録は残さない */
  debug = false;
  layer = 0;
  lastDeath: 'crush' | 'air' = 'crush';
  /** 最後の残機を失って爆発した（プレイヤーの姿を消す） */
  exploded = false;
  clearBonus: ClearBonus | null = null;
  events: GameEvent[] = [];

  constructor(seed = Date.now()) {
    this.world = this.makeWorld(seed);
  }

  private makeWorld(seed: number) {
    const w = new World(seed);
    w.limitY = GOAL_Y;
    return w;
  }

  start(seed = Date.now()) {
    this.world = this.makeWorld(seed);
    this.clearBonus = null;
    this.player = new Player();
    this.player.reset(4, 1);
    this.phase = 'playing';
    this.air = MAX_AIR;
    this.lives = START_LIVES;
    this.score = 0;
    this.maxDepth = 0;
    this.invuln = 0;
    this.exploded = false;
    this.time = 0;
    this.layer = 0;
    this.events = [];
  }

  /** タイトル画面に戻る（背景用に新しい地中を作り直す） */
  toTitle(seed = Date.now()) {
    this.start(seed);
    this.phase = 'title';
  }

  get depth() {
    return Math.max(0, Math.floor(1 - this.player.y));
  }

  update(dt: number, c: ControlState) {
    dt = Math.min(dt, 1 / 30);
    if (this.phase === 'title' || this.phase === 'gameover' || this.phase === 'clear') {
      // タイトル・ゲームオーバー中も地層の落下だけは動かす（演出）
      this.world.update(dt, 0);
      this.world.events.length = 0;
      return;
    }
    this.time += dt;
    const p = this.player;
    const w = this.world;

    if (this.phase === 'dying') {
      this.dyingTimer -= dt;
      w.update(dt, this.depth);
      this.flushWorldEvents();
      if (this.dyingTimer <= 0) {
        if (this.lives <= 0) {
          this.phase = 'gameover';
          this.events.push({ type: 'gameover' });
        } else {
          this.respawn();
        }
      }
      return;
    }

    // 地層の生成・破棄
    w.ensure(Math.floor(p.y) - 30);
    if (w.top > Math.ceil(p.y) + 22) w.trim(Math.ceil(p.y) + 22);

    const action = p.update(dt, c, w);
    if (action) {
      this.events.push({ type: 'dig', action });
      if (action.result === 'break') {
        const pts = action.count * 10 * (1 + this.layer);
        this.addScore(action.x, action.y, pts, action.kind === 'bomb' ? 'BOOM!' : undefined);
      }
    }
    if (p.landedImpact > 0) this.events.push({ type: 'landPlayer', impact: p.landedImpact });

    w.update(dt, this.depth);

    // 酸素カプセル
    const got = w.collectAt(p.x, p.y);
    if (got.air > 0) {
      // 酸素カプセルは1個で満タンまで回復
      this.air = MAX_AIR;
      this.addScore(p.x, p.y + 0.6, 100 * got.air, 'AIR FULL!');
    }
    for (let i = 0; i < got.life; i++) this.gainLife(p.x, p.y + 0.6);

    // ブロックの中に埋まってしまったときの救済（動けなくなるのを防ぐ）
    this.unstick();

    // 潰され判定
    const crush = w.crushingBlocks(p.x, p.y);
    if (crush.length) {
      const removed = w.removeFalling((b) => crush.includes(b));
      for (const b of removed) {
        this.events.push({ type: 'break', x: b.x, y: b.y, kind: b.kind, color: b.color, cells: [{ x: b.x, y: b.y }] });
      }
      if (this.invuln <= 0 && !this.debug) this.loseLife('crush');
    }

    // 深さ
    const d = this.depth;
    if (d > this.maxDepth) {
      this.score += (d - this.maxDepth) * 5 * (1 + this.layer);
      this.maxDepth = d;
      const layer = difficulty(d).layer;
      if (layer > this.layer && d < GOAL_DEPTH) {
        this.layer = layer;
        this.events.push({ type: 'layer', layer });
        this.air = Math.min(MAX_AIR, this.air + 15);
      }
    }

    // 黄金郷に到達でクリア
    if (this.phase === 'playing' && d >= GOAL_DEPTH && p.state === 'ground') {
      this.clear();
      this.flushWorldEvents();
      return;
    }

    // 酸素減少
    if (this.phase === 'playing' && this.debug) this.air = MAX_AIR;
    if (this.phase === 'playing') {
      this.air -= difficulty(d).airDrain * dt;
      if (this.air <= 0) {
        this.air = 0;
        this.loseLife('air');
      }
    }
    this.invuln = Math.max(0, this.invuln - dt);
    this.flushWorldEvents();
  }

  private flushWorldEvents() {
    for (const e of this.world.events) {
      this.events.push(e);
      if (e.type === 'pop') {
        const pts = e.cells.length * 20 * e.chain * (1 + this.layer);
        const cx = e.cells.reduce((s, c) => s + c.x, 0) / e.cells.length;
        const cy = e.cells.reduce((s, c) => s + c.y, 0) / e.cells.length;
        this.addScore(cx, cy, pts, e.chain > 1 ? `${e.chain} CHAIN!` : 'COMBO!');
      }
    }
    this.world.events.length = 0;
  }

  /** 残り時間・酸素・残機をボーナスとしてスコアに加算 */
  private clear() {
    const bonus: ClearBonus = {
      clear: 50000,
      air: Math.round(this.air) * 200,
      lives: this.lives * 20000,
      time: Math.max(0, Math.round(PAR_TIME - this.time)) * 100,
      total: 0,
    };
    bonus.total = bonus.clear + bonus.air + bonus.lives + bonus.time;
    this.score += bonus.total;
    this.clearBonus = bonus;
    this.phase = 'clear';
    // 黄金郷に着いたら、残っているブロックをすべて壊す。演出は、画面に見える範囲だけ(色・種類ごとにまとめて1件)
    const p = this.player;
    const groups = new Map<string, { kind: Kind; color: number; cells: { x: number; y: number }[] }>();
    for (const b of this.world.destroyAll()) {
      if (Math.abs(b.y - p.y) > 8) continue;
      const key = `${b.kind}:${b.color}`;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { kind: b.kind, color: b.color, cells: [] }));
      g.cells.push({ x: b.x, y: b.y });
    }
    for (const g of groups.values()) {
      this.events.push({ type: 'break', x: g.cells[0].x, y: g.cells[0].y, kind: g.kind, color: g.color, cells: g.cells });
    }
    this.events.push({ type: 'clear', bonus });
  }

  /** ハートを取った：残機+1（満タンならボーナス点） */
  private gainLife(x: number, y: number) {
    if (this.lives < START_LIVES) {
      this.lives++;
      this.addScore(x, y, 500, '1UP!');
    } else {
      this.addScore(x, y, 3000, 'LIFE MAX BONUS!');
    }
  }

  /**
   * プレイヤーが止まっているブロックの中に入り込んでいたら、
   * 真上が空いていれば押し上げる。空いていなければ潰されたあつかい（無敵中はブロックを壊す）。
   */
  private unstick() {
    const p = this.player;
    const w = this.world;
    // 落下中・よじ登り中は、斜めに動く途中で角に一瞬かかるだけなので何もしない
    if (p.state === 'climb' || p.state === 'fall') return;
    const col = Math.round(p.x);
    const row = Math.round(p.y);
    if (Math.abs(p.x - col) > 0.45 || Math.abs(p.y - row) > 0.45) return;
    const b = w.get(col, row);
    if (!b || b.falling || b.kind === 'air' || b.kind === 'life') return;
    if (!w.isSolid(col, row + 1)) {
      p.reset(col, row + 1);
      return;
    }
    if (this.invuln > 0 || this.debug) {
      w.removeAt(col, row);
      this.events.push({ type: 'break', x: col, y: row, kind: b.kind, color: b.color, cells: [{ x: col, y: row }] });
    } else {
      this.loseLife('crush');
    }
  }

  private addScore(x: number, y: number, amount: number, label?: string) {
    this.score += amount;
    this.events.push({ type: 'score', x, y, amount, label });
  }

  private loseLife(reason: 'crush' | 'air') {
    this.lives--;
    this.lastDeath = reason;
    const p = this.player;
    if (reason === 'crush') this.events.push({ type: 'crush', x: p.x, y: p.y, lifeLost: true });
    else this.events.push({ type: 'suffocate', x: p.x, y: p.y });
    this.phase = 'dying';
    this.dyingTimer = 1.6;
    // 最後の残機を失ったら、ドカーンと爆発する（ゲームオーバー）
    if (this.lives <= 0) {
      this.exploded = true;
      this.world.blastPlayer(p.x, p.y);
    }
  }

  private respawn() {
    const p = this.player;
    const w = this.world;
    const col = p.col;
    const row = Math.round(p.y);
    // 復活地点の周囲（頭上）を片付ける
    for (let y = row; y <= row + 3; y++) {
      for (let x = col - 1; x <= col + 1; x++) {
        const b = w.get(x, y);
        if (b) {
          w.removeAt(x, y);
          this.events.push({ type: 'break', x, y, kind: b.kind, color: b.color, cells: [{ x, y }] });
        }
      }
    }
    w.removeFalling((b) => Math.abs(b.x - col) <= 2 && b.y >= row - 1);
    p.reset(col, row);
    this.air = MAX_AIR;
    this.invuln = INVULN_TIME;
    this.phase = 'playing';
  }
}
