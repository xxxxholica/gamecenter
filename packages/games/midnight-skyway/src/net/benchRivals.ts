// ベンチマーク(?bench=1&rivals=N)用: オンライン対戦の相手の車を、サーバーなしで走らせる。
// OnlineRace に本物の通信(SkywayNet)の代わりに BenchRivalNet を渡すので、相手の車の描画・補間・演出・エンジン音・当たり判定・順位は本番と同じ処理を通る。
// 実機と同じく、物理を計算するのは自車だけ。相手の姿勢は、走行ルートに沿って自車の前に並べたものを、サーバーと同じ間隔(STATE_HZ)・同じ形('states')で、
// 届く時刻に揺らぎを付けて渡す。相手は全員が画面に入る近さを保つので、描く量は実際の対戦より多めの、重い側の条件になる。
import type { CarState, ClientMsg, RacerInfo, ServerMsg } from '../../../../shared/netProtocol.ts';
import { STATE_HZ } from '../../../../shared/netProtocol.ts';
import { CAR_PALETTES, CAR_TYPES, type CarType } from '../../../../shared/carPalette.ts';

export interface RoutePoint { x: number; y: number; z: number }

/** 相手の並び: 自車から走行ルートに沿って何m前か(ahead)と、横のずれ(m)。前後の位置は phase をずらしてゆっくり揺らし、抜きつ抜かれつを作る。 */
const SLOTS = [
  { ahead: 12, lateral: 1.8, phase: 0 },
  { ahead: 22, lateral: -1.8, phase: 2.1 },
  { ahead: 34, lateral: 1.8, phase: 4.2 },
];
/** 前後の揺れの幅(m)と周期(秒)。いちばん近い相手でも、自車と重ならない(12 - 5 = 7m > 車長) */
const SWAY_M = 5;
const SWAY_PERIOD_S = 9;
/** 届く時刻の揺らぎ(ms)。0〜この値の遅れを、1回ごとにばらばらに付ける */
const JITTER_MS = 40;
/** 自車の位置を走行ルートの点に合わせるとき、前回の点から前後に探す数 */
const SEARCH_WINDOW = 40;

/** 自車の参加者(id は 1)。色は、そのマシンの最初の色 */
export function benchSelfPlayer(type: CarType): RacerInfo {
  const preset = CAR_PALETTES[type][0];
  return { id: 1, name: 'YOU', car: { type, body: preset.bodyColor, roof: preset.roofColor } };
}

/** 相手の参加者(id は 2 から。自車は 1)。マシンの種類と色は、本番で選べるものから順に */
export function benchRivalPlayers(count: number): RacerInfo[] {
  return SLOTS.slice(0, count).map((_, i) => {
    const type = CAR_TYPES[(i + 1) % CAR_TYPES.length];
    const preset = CAR_PALETTES[type][i % CAR_PALETTES[type].length];
    return { id: i + 2, name: `RIVAL ${i + 1}`, car: { type, body: preset.bodyColor, roof: preset.roofColor } };
  });
}

/** 走行ルートに沿って、自車の前に並べた相手の姿勢を作る(three.js を使わない計算だけの部分)。 */
export class BenchRivalPlan {
  readonly count: number;
  private readonly route: RoutePoint[];
  private readonly carLift: number;
  private readonly dist: number[] = [];
  private readonly length: number;
  private readonly closed: boolean;
  private cursor = -1;

  constructor(route: RoutePoint[], carLift: number, count: number) {
    this.route = route;
    this.carLift = carLift;
    this.count = Math.min(count, SLOTS.length);
    let d = 0;
    for (let i = 0; i < route.length; i++) {
      if (i > 0) d += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
      this.dist.push(d);
    }
    const first = route[0], last = route[route.length - 1];
    this.closed = route.length > 2 && Math.hypot(first.x - last.x, first.z - last.z) < 30;
    this.length = d + (this.closed ? Math.hypot(first.x - last.x, first.z - last.z) : 0);
  }

  /** 自車の位置に最も近い走行ルートの点(前回の点の近くだけ探す。最初の1回は全部) */
  private locate(x: number, z: number): number {
    const n = this.route.length;
    const from = this.cursor < 0 ? 0 : this.cursor - SEARCH_WINDOW;
    const to = this.cursor < 0 ? n - 1 : this.cursor + SEARCH_WINDOW;
    let best = Math.max(0, this.cursor), bestD = Infinity;
    for (let k = from; k <= to; k++) {
      const i = this.closed ? ((k % n) + n) % n : Math.min(n - 1, Math.max(0, k));
      const p = this.route[i];
      const dd = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (dd < bestD) { bestD = dd; best = i; }
    }
    this.cursor = best;
    return best;
  }

  /** 走行ルートの始点から d(m)の位置と向き。周回コースは一周で戻り、そうでなければ両端で止まる */
  private at(d: number): { x: number; y: number; z: number; yaw: number } {
    const r = this.route, n = r.length;
    if (this.closed) d = ((d % this.length) + this.length) % this.length;
    else d = Math.min(this.dist[n - 1], Math.max(0, d));
    let lo = n - 1, hi = 0;                                   // 周回コースの、終点から始点へ戻る区間
    if (!this.closed || d <= this.dist[n - 1]) {
      lo = 0; hi = n - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.dist[mid] <= d) lo = mid; else hi = mid; }
    }
    const a = r[lo], b = r[hi];
    const span = (hi === 0 ? this.length : this.dist[hi]) - this.dist[lo];
    const u = span > 0 ? Math.min(1, Math.max(0, (d - this.dist[lo]) / span)) : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u + this.carLift, z: a.z + (b.z - a.z) * u, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  /** 自車が送った姿勢から、相手それぞれの姿勢を作る。ステア・ロール・ドリフト・ブーストなどは自車の値を使う(演出も本番と同じだけ出る) */
  public states(own: CarState, tSec: number): CarState[] {
    const base = this.dist[this.locate(own[0], own[2])];
    const out: CarState[] = [];
    for (let i = 0; i < this.count; i++) {
      const slot = SLOTS[i];
      const ahead = slot.ahead + Math.sin((tSec / SWAY_PERIOD_S) * 2 * Math.PI + slot.phase) * SWAY_M;
      const p = this.at(base + ahead);
      const x = p.x + Math.cos(p.yaw) * slot.lateral, z = p.z - Math.sin(p.yaw) * slot.lateral;   // 進行方向の右(+)・左(-)
      const p9 = own[9] + ahead / this.length;
      const progress = this.closed ? p9 % 1 : Math.min(1, p9);
      out.push([x, p.y, z, p.yaw, own[4], own[5], own[6], own[7], own[8], progress, own[10] ?? 0]);
    }
    return out;
  }
}

type Handler = (msg: ServerMsg) => void;

/** OnlineRace に渡す、通信の代わり。自車の 'state' を受け取り、相手の 'states' を STATE_HZ で、文字列にして読み直してから(受信と同じ手間)届ける。 */
export class BenchRivalNet {
  private readonly handlers = new Map<string, Set<Handler>>();
  private own: CarState | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private seed = 1;
  private readonly plan: BenchRivalPlan;
  private readonly ids: number[];

  constructor(plan: BenchRivalPlan, players: RacerInfo[]) {
    this.plan = plan;
    this.ids = players.map((p) => p.id);
  }

  public on<T extends ServerMsg['t']>(t: T, fn: (msg: Extract<ServerMsg, { t: T }>) => void): () => void {
    let set = this.handlers.get(t);
    if (!set) this.handlers.set(t, (set = new Set()));
    set.add(fn as Handler);
    return () => set!.delete(fn as Handler);
  }

  public send(msg: ClientMsg): void {
    if (msg.t === 'state') this.own = msg.s;
  }

  public serverNow(): number {
    return Date.now();
  }

  public start(): void {
    this.stop();
    this.timer = setInterval(() => this.tick(), 1000 / STATE_HZ);
  }

  public stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    if (!this.own) return;
    const ts = this.serverNow();
    const list = this.plan.states(this.own, ts / 1000);
    const s: Record<number, CarState> = {};
    const sent: Record<number, number> = {};
    list.forEach((st, i) => { s[this.ids[i]] = st; sent[this.ids[i]] = ts; });
    const text = JSON.stringify({ t: 'states', s, ts: sent } satisfies ServerMsg);
    setTimeout(() => this.emit(JSON.parse(text) as ServerMsg), this.jitter());
  }

  /** 0〜JITTER_MS の遅れ(固定の種の乱数。毎回ほぼ同じ揺れ方になる) */
  private jitter(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return (this.seed / 0x7fffffff) * JITTER_MS;
  }

  private emit(msg: ServerMsg): void {
    for (const fn of this.handlers.get(msg.t) ?? []) fn(msg);
  }
}
