// ===========================================================
//  地中グリッド（純粋ロジック / Three.js 非依存）
//  y は上が正。地表の床が y=0、プレイヤーは y=1 からスタートし、
//  下へ掘るほど y はマイナスになる（深さ = -y メートル）。
// ===========================================================

export const W = 9; // 坑道の横幅（マス）
export const COLOR_COUNT = 4;

/**
 * color=宝石 / hard=硬い岩 / air=酸素カプセル / life=ハート（残機+1） / bedrock=黒曜石（壊せないが絶対に落ちない）
 * bomb=爆弾（掘ると爆発して、周囲8マスのブロックを削る。隣の爆弾は連鎖して爆発する）
 */
export type Kind = 'color' | 'hard' | 'air' | 'life' | 'bedrock' | 'bomb';

/** 爆発が周囲8マスのブロックに与えるダメージ（耐久がこれ以下なら壊れ、それ以上ならヒビが入る） */
export const BOMB_DAMAGE = 2;
/** プレイヤーが力尽きたときの大爆発の半径（マス） */
export const PLAYER_BLAST_RADIUS = 2;

/** 取るアイテム（プレイヤーは通り抜けられる） */
export function isItem(k: Kind) {
  return k === 'air' || k === 'life';
}

export interface Block {
  id: number;
  kind: Kind;
  color: number; // kind==='color' のときの色番号
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  falling: boolean;
  /** 落下中の進捗 0..1（描画位置 = y - offset） */
  offset: number;
  /** 支えを失って揺れている経過秒（-1 = 揺れていない） */
  shake: number;
  /** 直前に着地した（着地連鎖判定用） */
  landed: boolean;
  /** 地層に固定されている（支えがなくても落ちない。掘れば壊れる） */
  pinned: boolean;
  unit: number;
}

interface Unit {
  id: number;
  blocks: Block[];
  kind: Kind;
  color: number;
  supported: boolean;
  dropped: boolean;
}

interface FallGroup {
  blocks: Block[];
  offset: number;
  /** 落下速度（マス/秒）。0 から加速していく */
  vel: number;
}

/** 落下ブロックの加速度（マス/秒²） */
const FALL_ACCEL = 24;

export type WorldEvent =
  | { type: 'hit'; x: number; y: number; kind: Kind; color: number; hp: number; maxHp: number }
  | { type: 'break'; x: number; y: number; kind: Kind; color: number; cells: { x: number; y: number }[] }
  | { type: 'pop'; color: number; chain: number; cells: { x: number; y: number }[] }
  | { type: 'land'; x: number; y: number; size: number }
  | { type: 'capsule'; x: number; y: number }
  | { type: 'clank'; x: number; y: number }
  | {
      type: 'explode';
      /** 爆発した爆弾の位置（連鎖すると複数） */
      centers: { x: number; y: number }[];
      /** 爆発で消えたブロック（爆弾自身を含む） */
      destroyed: { x: number; y: number; kind: Kind; color: number }[];
      /** 爆発で削られて、まだ残っているブロック（ヒビが入る） */
      chipped: { x: number; y: number; kind: Kind; color: number; hp: number; maxHp: number }[];
      /** プレイヤーが力尽きたときの大爆発（演出を特別に派手にする） */
      big: boolean;
    }
  | { type: 'life'; x: number; y: number };

/** 深さに応じた難易度パラメータ */
export function difficulty(depth: number) {
  const d = Math.max(0, depth);
  const layer = Math.floor(d / 100);
  return {
    layer,
    /** 宝石の硬さ：0〜149m は1、150m〜は2、300m〜は3 */
    colorHp: Math.min(1 + Math.floor(d / 150), 3),
    /** 硬い岩の硬さ：2から始まり、150mごとに+1（最大5） */
    hardHp: Math.min(2 + Math.floor(d / 150), 5),
    hardChance: Math.min(0.03 + d * 0.0005, 0.2),
    /** 爆弾ブロックが出る確率（1マスあたり。浅いところには出ない） */
    bombChance: d < 8 ? 0 : Math.min(0.014 + d * 0.00005, 0.035),
    airChance: Math.max(0.028 - d * 0.00003, 0.011),
    bedrockChance: d < 20 ? 0 : Math.min(0.025 + d * 0.00012, 0.08),
    /** 酸素の毎秒減少量（最大 100） */
    airDrain: Math.min(3.0 * (1 + d / 250), 11),
    /** 支えを失ってから落ち始めるまでの揺れる時間（秒）。浅いと1.1秒、深いほど短く最短0.7秒 */
    shakeTime: Math.max(1.1 - d * 0.0008, 0.7),
    /** 落下ブロックの速さ（マス/秒） */
    fallSpeed: Math.min(3.8 + d * 0.003, 6.5),
    /** 横穴（空洞）ができる確率（1行あたり） */
    caveChance: d < 5 ? 0 : 0.16,
    /** 黒曜石の壁（9マス中8マスが黒曜石の行）ができる確率（1行あたり） */
    barrierChance: d < 60 ? 0 : 0.015,
  };
}

/** 決定的な乱数（mulberry32） */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  rows = new Map<number, (Block | null)[]>();
  /** 生成済みの一番下の行（これより下は「まだ見えない岩盤」扱いで固い） */
  bottom = 1;
  /** 保持している一番上の行 */
  top = 0;
  /** これより下は生成しない（ゴールの黄金郷） */
  limitY = -Infinity;
  falling: FallGroup[] = [];
  units: Unit[] = [];
  dirty = true;
  events: WorldEvent[] = [];
  chain = 0;
  private sincePop = 99;
  /** 次の行に作る横穴（a〜b 列が空洞） */
  private pendingCave: { y: number; a: number; b: number } | null = null;
  /** 直前に作った黒曜石の壁の行 */
  private lastBarrierY = 0;
  /** これから作る黒曜石の壁（cavityY 行が空洞、barrierY 行が壁） */
  private pendingBarrier: { cavityY: number; barrierY: number } | null = null;
  /** 黒曜石の壁どうしの最低間隔（行） */
  static readonly BARRIER_GAP = 80;
  private rng: () => number;
  private nextId = 1;
  private depthForSpeed = 0;

  constructor(seed = Date.now()) {
    this.rng = makeRng(seed);
    this.ensure(-40);
  }

  // ---------------- アクセス ----------------
  get(x: number, y: number): Block | null {
    if (x < 0 || x >= W) return null;
    const r = this.rows.get(y);
    return r ? r[x] : null;
  }

  private set(x: number, y: number, b: Block | null) {
    let r = this.rows.get(y);
    if (!r) {
      if (!b) return;
      r = new Array(W).fill(null);
      this.rows.set(y, r);
    }
    r[x] = b;
  }

  /** プレイヤーにとって通れないか（壁・岩盤・ブロック。酸素カプセルは通れる＝取れる） */
  isSolid(x: number, y: number): boolean {
    if (x < 0 || x >= W) return true;
    if (y < this.bottom) return true;
    const b = this.get(x, y);
    return !!b && !isItem(b.kind);
  }

  /**
   * プレイヤーが横から入ってよいか。isSolid に加えて、真上の落下中のブロックが
   * このマスへ入りかけている（下に動き始めている）ときも入れない。
   * （入れてしまうと、ブロックがプレイヤーと重なったまま下へ抜けて、埋まってしまう）
   */
  isBlockedForMove(x: number, y: number): boolean {
    if (this.isSolid(x, y)) return true;
    const a = this.get(x, y + 1);
    return !!a && a.falling && a.offset > 0 && !isItem(a.kind);
  }

  /** ブロックがあるか（カプセル含む） */
  occupied(x: number, y: number): boolean {
    if (x < 0 || x >= W) return true;
    if (y < this.bottom) return true;
    return !!this.get(x, y);
  }

  forEachBlock(fn: (b: Block) => void) {
    for (const r of this.rows.values()) for (const b of r) if (b) fn(b);
  }

  // ---------------- 生成 ----------------
  /** y=minY まで地層を生成する */
  ensure(minY: number) {
    minY = Math.max(minY, this.limitY);
    while (this.bottom > minY) {
      this.bottom--;
      this.generateRow(this.bottom);
    }
  }

  /** maxY より上の行を破棄（メモリ節約） */
  trim(maxY: number) {
    for (const y of [...this.rows.keys()]) if (y > maxY) this.rows.delete(y);
    this.top = Math.min(this.top, maxY);
    for (const g of this.falling) g.blocks = g.blocks.filter((b) => b.y <= maxY);
    this.falling = this.falling.filter((g) => g.blocks.length > 0);
    this.dirty = true;
  }

  /** ハートを置く深さ（100m ごとに1個） */
  private heartBand = -1;
  private heartDepth = -1;

  private generateRow(y: number) {
    const depth = -y;
    const band = Math.floor(depth / 100);
    if (band !== this.heartBand) {
      this.heartBand = band;
      this.heartDepth = band * 100 + 20 + Math.floor(this.rng() * 70); // 各100mの 20〜89m 地点
    }
    this.generateRowInner(y);
    if (depth === this.heartDepth) this.placeHeart(y);
  }

  /** 行のどこか1マスにハートを置く（黒曜石・地層に固定された天井は避ける） */
  private placeHeart(y: number) {
    const row = this.rows.get(y);
    if (!row) return;
    // 黒曜石の壁の行は避ける（唯一の抜け穴が、ハートに置き換わらないように）
    if (row.filter((b) => b?.kind === 'bedrock').length >= W - 1) {
      this.heartDepth++;
      return;
    }
    const cand: number[] = [];
    for (let x = 0; x < W; x++) {
      const b = row[x];
      if (!b || ((b.kind === 'color' || b.kind === 'hard') && !b.pinned)) cand.push(x);
    }
    if (!cand.length) {
      this.heartDepth++; // 置けなければ次の行へ
      return;
    }
    const x = cand[Math.floor(this.rng() * cand.length)];
    row[x] = this.makeBlock('life', 0, 1, x, y);
    this.dirty = true;
  }

  private generateRowInner(y: number) {
    const depth = -y;
    const diff = difficulty(depth);
    const row: (Block | null)[] = new Array(W).fill(null);
    const above = this.rows.get(y + 1);
    const cave = this.pendingCave && this.pendingCave.y === y ? this.pendingCave : null;
    this.pendingCave = null;
    const capsuleAt = cave && this.rng() < 0.35 ? cave.a + Math.floor(this.rng() * (cave.b - cave.a + 1)) : -1;

    // 黒曜石の壁（まれに出現）：
    //   天井の行（地層に固定＝崩れない）
    //   空洞の行（左右に走って抜け穴を探せる）
    //   壁の行（9マス中8マスが黒曜石、抜け穴は1マス）
    //   壁の下の行（黒曜石なし）
    const pb = this.pendingBarrier;
    if (pb && y === pb.cavityY) {
      // 空洞。ときどき酸素カプセルが落ちている
      const cap = this.rng() < 0.5 ? Math.floor(this.rng() * W) : -1;
      for (let x = 0; x < W; x++) row[x] = x === cap ? this.makeBlock('air', 0, 1, x, y) : null;
      this.rows.set(y, row);
      this.dirty = true;
      return;
    }
    if (pb && y === pb.barrierY) {
      const gap = Math.floor(this.rng() * W);
      for (let x = 0; x < W; x++) {
        row[x] = x === gap
          ? this.makeBlock('color', Math.floor(this.rng() * COLOR_COUNT), diff.colorHp, x, y)
          : this.makeBlock('bedrock', 0, 1, x, y);
      }
      this.pendingBarrier = null;
      this.lastBarrierY = y;
      this.rows.set(y, row);
      this.dirty = true;
      return;
    }
    const belowBarrier = y === this.lastBarrierY - 1;

    for (let x = 0; x < W; x++) {
      // 横穴：空洞（ときどき酸素カプセルが落ちている）
      if (cave && x >= cave.a && x <= cave.b) {
        row[x] = x === capsuleAt ? this.makeBlock('air', 0, 1, x, y) : null;
        continue;
      }
      const r = this.rng();
      let kind: Kind = 'color';
      // 黒曜石は通り道をふさがないよう、横・上（斜め含む）に黒曜石がない場所にだけ置く
      const canBedrock =
        !(x > 0 && row[x - 1]?.kind === 'bedrock') &&
        ![x - 1, x, x + 1].some((ax) => above?.[ax]?.kind === 'bedrock');
      if (canBedrock && !belowBarrier && this.rng() < diff.bedrockChance) kind = 'bedrock';
      else if (depth >= 4 && r < diff.airChance) kind = 'air';
      else if (depth >= 6 && r < diff.airChance + diff.hardChance) kind = 'hard';
      else if (depth >= 8 && r < diff.airChance + diff.hardChance + diff.bombChance) kind = 'bomb';

      let color = 0;
      if (kind === 'color') {
        const left = x > 0 ? row[x - 1] : null;
        const up = above ? above[x] : null;
        const c = this.rng();
        if (left && left.kind === 'color' && c < 0.42) color = left.color;
        else if (up && up.kind === 'color' && c < 0.62) color = up.color;
        else color = Math.floor(this.rng() * COLOR_COUNT);
      }
      const hp = kind === 'color' ? diff.colorHp : kind === 'hard' ? diff.hardHp : 1;
      row[x] = this.makeBlock(kind, color, hp, x, y);
    }

    // 次の行から黒曜石の壁を作るなら、この行を「天井」として地層に固定する
    if (
      !cave &&
      y - 2 > this.limitY &&
      this.lastBarrierY - (y - 2) >= World.BARRIER_GAP &&
      this.rng() < diff.barrierChance
    ) {
      for (const b of row) if (b) b.pinned = true;
      this.pendingBarrier = { cavityY: y - 1, barrierY: y - 2 };
      this.rows.set(y, row);
      this.dirty = true;
      return;
    }

    // 次の行に横穴を作るなら、この行に「天井」を作っておく。
    // 天井は横穴より1マスずつ広い同色ブロックなので、両端で下の行に支えられて崩れない。
    if (!cave && y - 1 > this.limitY && this.rng() < diff.caveChance) {
      const w = 3 + Math.floor(this.rng() * 4); // 3〜6 マス
      const a = 1 + Math.floor(this.rng() * (W - 2 - w + 1));
      const b = a + w - 1;
      const color = Math.floor(this.rng() * COLOR_COUNT);
      for (let x = a - 1; x <= b + 1; x++) row[x] = this.makeBlock('color', color, diff.colorHp, x, y);
      this.pendingCave = { y: y - 1, a, b };
    }
    this.rows.set(y, row);
    this.dirty = true;
  }

  makeBlock(kind: Kind, color: number, hp: number, x: number, y: number): Block {
    return {
      id: this.nextId++, kind, color, hp, maxHp: hp, x, y,
      falling: false, offset: 0, shake: -1, landed: false, pinned: false, unit: -1,
    };
  }

  /** テスト・デバッグ用：任意の配置をセット */
  place(kind: Kind, color: number, x: number, y: number, hp = 1) {
    const b = this.makeBlock(kind, color, hp, x, y);
    this.set(x, y, b);
    this.dirty = true;
    return b;
  }

  clearAll() {
    this.rows.clear();
    this.falling = [];
    this.dirty = true;
  }

  // ---------------- 連結・支え判定 ----------------
  private recomputeOnce(): boolean {
    const units: Unit[] = [];
    const still: Block[] = [];
    this.forEachBlock((b) => {
      b.unit = -1;
      if (!b.falling) still.push(b);
    });
    for (const b of still) {
      if (b.unit !== -1) continue;
      const u: Unit = { id: units.length, blocks: [], kind: b.kind, color: b.color, supported: false, dropped: false };
      units.push(u);
      const stack = [b];
      b.unit = u.id;
      while (stack.length) {
        const c = stack.pop()!;
        u.blocks.push(c);
        if (c.kind !== 'color') continue;
        for (const [dx, dy] of DIRS) {
          const n = this.get(c.x + dx, c.y + dy);
          if (n && !n.falling && n.unit === -1 && n.kind === 'color' && n.color === c.color) {
            n.unit = u.id;
            stack.push(n);
          }
        }
      }
    }

    // 下から支えを伝播
    const queue: Unit[] = [];
    for (const u of units) {
      // 底の行 or 黒曜石は常に支えになる（黒曜石は落ちない）
      if (u.kind === 'bedrock' || u.blocks.some((b) => b.pinned || b.y === this.bottom)) {
        u.supported = true;
        queue.push(u);
      }
    }
    while (queue.length) {
      const u = queue.pop()!;
      for (const b of u.blocks) {
        const a = this.get(b.x, b.y + 1);
        if (a && !a.falling && a.unit !== u.id) {
          const au = units[a.unit];
          if (!au.supported) {
            au.supported = true;
            queue.push(au);
          }
        }
      }
    }

    // 着地したブロックが同色4個以上でつながったら消滅（連鎖）
    let popped = false;
    for (const u of units) {
      if (u.kind === 'color' && u.blocks.length >= 4 && u.blocks.some((b) => b.landed)) {
        if (this.sincePop > 1.2) this.chain = 0;
        this.sincePop = 0;
        this.chain++;
        const cells = u.blocks.map((b) => ({ x: b.x, y: b.y }));
        for (const b of u.blocks) this.set(b.x, b.y, null);
        this.events.push({ type: 'pop', color: u.color, chain: this.chain, cells });
        popped = true;
      }
    }
    this.forEachBlock((b) => (b.landed = false));
    if (popped) return true;

    for (const u of units) {
      if (u.supported) {
        for (const b of u.blocks) b.shake = -1;
      } else {
        let s = -1;
        for (const b of u.blocks) s = Math.max(s, b.shake);
        if (s < 0) s = 0;
        for (const b of u.blocks) b.shake = s;
      }
    }
    this.units = units;
    return false;
  }

  recompute() {
    let guard = 0;
    while (this.recomputeOnce() && guard++ < 32) {
      /* 消滅が起きたら組み直し */
    }
    this.dirty = false;
  }

  // ---------------- 更新 ----------------
  update(dt: number, depth: number) {
    this.depthForSpeed = depth;
    const diff = difficulty(depth);
    if (this.dirty) this.recompute();

    // 揺れ → 落下開始
    for (const u of this.units) {
      if (u.supported || u.dropped) continue;
      if (u.blocks.some((b) => b.falling || this.get(b.x, b.y) !== b)) continue;
      for (const b of u.blocks) b.shake += dt;
      if (u.blocks[0].shake >= diff.shakeTime) {
        u.dropped = true;
        for (const b of u.blocks) {
          b.falling = true;
          b.shake = -1;
          b.offset = 0;
        }
        this.falling.push({ blocks: u.blocks, offset: 0, vel: 0 });
      }
    }

    // 落下
    // 下のマスが空いていることを確かめてから動かすので、着地のときに
    // 下のブロックへめり込んで跳ね返る（ワンバウンドする）ことがない。
    const speed = difficulty(this.depthForSpeed).fallSpeed;
    const groupOf = new Map<Block, FallGroup>();
    for (const g of this.falling) for (const b of g.blocks) groupOf.set(b, g);
    for (const g of [...this.falling]) {
      g.vel = Math.min(g.vel + FALL_ACCEL * dt, speed);
      let move = g.vel * dt;
      let landed = false;
      while (move > 0) {
        // 次に進むマスの状態：空き / 何かある（着地） / 落下中のブロック（追いかける）
        let blocked = false;
        let cap = 1; // 下の落下ブロックに追いつかない範囲（このマス内の進み具合の上限）
        const set = new Set(g.blocks);
        for (const b of g.blocks) {
          const by = b.y - 1;
          if (by < this.bottom) { blocked = true; break; }
          const n = this.get(b.x, by);
          if (!n || set.has(n)) continue;
          const ng = n.falling ? groupOf.get(n) : undefined;
          if (!ng) { blocked = true; break; }
          cap = Math.min(cap, ng.offset);
          g.vel = Math.min(g.vel, ng.vel);
        }
        if (blocked) {
          this.land(g);
          landed = true;
          break;
        }
        const step = Math.min(move, cap - g.offset);
        if (step <= 0) break; // 下のブロックにぴったりくっついて一緒に落ちる
        g.offset += step;
        move -= step;
        if (g.offset >= 1 - 1e-6) {
          for (const b of g.blocks) this.set(b.x, b.y, null);
          for (const b of g.blocks) {
            b.y -= 1;
            this.set(b.x, b.y, b);
          }
          g.offset = 0;
        } else break;
      }
      if (!landed) for (const b of g.blocks) b.offset = g.offset;
    }

    this.sincePop += dt;
  }

  private land(g: FallGroup) {
    g.offset = 0;
    let minX = 0, minY = 0;
    for (const b of g.blocks) {
      b.falling = false;
      b.offset = 0;
      b.shake = -1;
      b.landed = true;
      minX += b.x;
      minY = Math.min(minY, b.y);
    }
    this.falling = this.falling.filter((f) => f !== g);
    this.events.push({ type: 'land', x: minX / g.blocks.length, y: g.blocks[0].y, size: g.blocks.length });
    this.dirty = true;
  }

  /** 落下グループを丸ごと消す（プレイヤーが潰されたときの救済など） */
  removeFalling(pred: (b: Block) => boolean) {
    const removed: Block[] = [];
    for (const g of this.falling) {
      if (g.blocks.some(pred)) {
        for (const b of g.blocks) {
          if (this.get(b.x, b.y) === b) this.set(b.x, b.y, null);
          removed.push(b);
        }
        g.blocks = [];
      }
    }
    this.falling = this.falling.filter((g) => g.blocks.length > 0);
    if (removed.length) this.dirty = true;
    return removed;
  }

  /** 岩盤・黒曜石・アイテムを含め、いま残っているブロックをすべて消す(ゴール到達の演出)。消したブロックを返す */
  destroyAll(): Block[] {
    const gone: Block[] = [];
    this.forEachBlock((b) => gone.push(b));
    this.rows.clear();
    this.falling = [];
    this.dirty = true;
    return gone;
  }

  removeAt(x: number, y: number) {
    const b = this.get(x, y);
    if (!b) return null;
    this.set(x, y, null);
    if (b.falling) {
      for (const g of this.falling) g.blocks = g.blocks.filter((f) => f !== b);
      this.falling = this.falling.filter((g) => g.blocks.length > 0);
    }
    this.dirty = true;
    return b;
  }

  // ---------------- 掘削 ----------------
  /**
   * (x,y) のブロックを叩く。
   * 戻り値: 'none' | 'hit'（まだ壊れない） | 'break'（壊れた。cells に消えたマス） | 'capsule'
   */
  /** 検証用: true なら、岩盤・黒曜石も含め、すべてのブロックを1回で壊せる */
  breakAll = false;

  dig(x: number, y: number): { result: 'none' | 'hit' | 'break' | 'capsule' | 'blocked'; count: number; kind?: Kind } {
    const b = this.get(x, y);
    if (!b || b.falling) return { result: 'none', count: 0 };
    if (b.kind === 'bedrock' && !this.breakAll) {
      this.events.push({ type: 'clank', x, y });
      return { result: 'blocked', count: 0, kind: 'bedrock' };
    }
    if (this.dirty) this.recompute();
    // アイテムは掘らずに、触れて取る（プレイヤーは通り抜けられる）
    if (isItem(b.kind)) return { result: 'none', count: 0, kind: b.kind };
    if (b.kind === 'bomb') return this.detonate(b);
    if (this.breakAll) b.hp = 1;
    b.hp -= 1;
    if (b.hp > 0) {
      this.events.push({ type: 'hit', x, y, kind: b.kind, color: b.color, hp: b.hp, maxHp: b.maxHp });
      return { result: 'hit', count: 0, kind: b.kind };
    }
    let targets: Block[] = [b];
    if (b.kind === 'color') {
      const u = this.units[b.unit];
      if (u && u.blocks.includes(b)) targets = u.blocks.filter((t) => this.get(t.x, t.y) === t && !t.falling);
    }
    const cells = targets.map((t) => ({ x: t.x, y: t.y }));
    for (const t of targets) this.set(t.x, t.y, null);
    this.dirty = true;
    this.events.push({ type: 'break', x, y, kind: b.kind, color: b.color, cells });
    return { result: 'break', count: targets.length, kind: b.kind };
  }

  /**
   * 爆弾を爆発させる。周囲8マスのブロックに BOMB_DAMAGE のダメージ（耐久が尽きたら壊れ、残ったらヒビ）。
   * 黒曜石とアイテム（酸素カプセル・ハート）は無傷。隣の爆弾は連鎖して爆発する。
   * 爆風で壊れた宝石に同じ色でつながっているブロックは、耐久に関係なく連鎖してまとめて壊れる。
   * 爆風でプレイヤーは傷つかないが、足場や支えが消えるとブロックが落ちてくる。
   */
  private detonate(origin: Block): { result: 'break'; count: number; kind: Kind } {
    this.removeAt(origin.x, origin.y);
    const count = this.explodeAt(origin.x, origin.y, 1, BOMB_DAMAGE, false, [
      { x: origin.x, y: origin.y, kind: 'bomb', color: 0 },
    ]);
    return { result: 'break', count, kind: 'bomb' };
  }

  /**
   * プレイヤーが最後のミスをしたときの大爆発。周囲 BLAST_RADIUS マスのブロックを（黒曜石とアイテム以外）すべて吹き飛ばす。
   * 範囲内の爆弾は誘爆する。消えたブロックの数を返す。
   */
  blastPlayer(px: number, py: number): number {
    return this.explodeAt(Math.round(px), Math.round(py), PLAYER_BLAST_RADIUS, 999, true, []);
  }

  /**
   * (cx, cy) を中心に、半径 radius マスの円形に damage のダメージを与える爆発。
   * 範囲内の爆弾は半径1・BOMB_DAMAGE で誘爆する。壊れたのが宝石なら、同じ色のつながりもまとめて壊す。
   * 消えたブロックの数（initial を含む）を返し、'explode' イベントを積む。
   */
  private explodeAt(
    cx: number, cy: number, radius: number, damage: number, big: boolean,
    initial: { x: number; y: number; kind: Kind; color: number }[],
  ): number {
    const destroyed = [...initial];
    const hit: Block[] = [];
    const centers: { x: number; y: number }[] = [{ x: cx, y: cy }];
    const queue: Block[] = [];
    /** 爆風で壊れたブロックを消す。宝石なら、同じ色でつながっているブロックも連鎖して消す */
    const kill = (n: Block) => {
      this.removeAt(n.x, n.y);
      destroyed.push({ x: n.x, y: n.y, kind: n.kind, color: n.color });
      if (n.kind !== 'color') return;
      const stack: Block[] = [n];
      while (stack.length) {
        const c = stack.pop()!;
        for (const [dx, dy] of DIRS) {
          const m = this.get(c.x + dx, c.y + dy);
          if (!m || m.kind !== 'color' || m.color !== n.color || m.falling) continue;
          this.removeAt(m.x, m.y);
          destroyed.push({ x: m.x, y: m.y, kind: m.kind, color: m.color });
          stack.push(m);
        }
      }
    };
    const apply = (bx: number, by: number, r: number, dmg: number) => {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r + 1) continue; // 角を丸める（半径1なら 3x3 全部、半径2なら円形）
          const n = this.get(bx + dx, by + dy);
          if (!n || n.kind === 'bedrock' || isItem(n.kind)) continue;
          if (n.kind === 'bomb') {
            this.removeAt(n.x, n.y);
            destroyed.push({ x: n.x, y: n.y, kind: 'bomb', color: 0 });
            queue.push(n);
            continue;
          }
          n.hp -= dmg;
          if (n.hp <= 0) kill(n);
          else if (!hit.includes(n)) hit.push(n);
        }
      }
    };
    apply(cx, cy, radius, damage);
    while (queue.length) {
      const bomb = queue.pop()!;
      centers.push({ x: bomb.x, y: bomb.y });
      apply(bomb.x, bomb.y, 1, BOMB_DAMAGE);
    }
    const chipped = hit
      .filter((n) => this.get(n.x, n.y) === n)
      .map((n) => ({ x: n.x, y: n.y, kind: n.kind, color: n.color, hp: n.hp, maxHp: n.maxHp }));
    this.dirty = true;
    this.events.push({ type: 'explode', centers, destroyed, chipped, big });
    return destroyed.length;
  }

  /** プレイヤー位置と重なる酸素カプセルを回収 */
  collectAt(px: number, py: number): { air: number; life: number } {
    const got = { air: 0, life: 0 };
    for (let x = Math.floor(px); x <= Math.ceil(px); x++) {
      for (let y = Math.floor(py); y <= Math.ceil(py); y++) {
        const b = this.get(x, y);
        if (!b || !isItem(b.kind)) continue;
        const by = b.y - b.offset;
        if (Math.abs(b.x - px) < 0.6 && Math.abs(by - py) < 0.6) {
          this.removeAt(b.x, b.y);
          if (b.kind === 'life') {
            this.events.push({ type: 'life', x: b.x, y: b.y });
            got.life++;
          } else {
            this.events.push({ type: 'capsule', x: b.x, y: b.y });
            got.air++;
          }
        }
      }
    }
    return got;
  }

  /** プレイヤーの頭上から落ちてきて重なった落下ブロック */
  crushingBlocks(px: number, py: number): Block[] {
    const out: Block[] = [];
    for (const g of this.falling) {
      for (const b of g.blocks) {
        if (isItem(b.kind)) continue;
        const by = b.y - b.offset;
        if (Math.abs(b.x - px) < 0.7 && by > py - 0.2 && by - py < 0.82) out.push(b);
      }
    }
    return out;
  }
}

const DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
