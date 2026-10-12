// tower-stack(グラグラタワー)の対戦ルール。物理は各プレイヤーのブラウザで動き、サーバーは様子の中継・おじゃまの宛先決め・時間と結果を持つ。
// 1on1(2人)で同時に自分のタワーを積み、先に3個落とした方の負け(人数を増やしても、最後の1人が勝ち・順位は脱落が遅かった順で動く)。
// 途中で抜けた人は脱落扱い。残りが1人以下になったら結果を送って場を空に戻す。決着がつかないときは MAX_MATCH_MS で打ち切る。
import {
  ATTACK_KINDS, ATTACK_MIN_INTERVAL_MS, COUNTDOWN_SEC, MAX_MATCH_MS, MAX_PLAYERS, MAX_SNAP_BLOCKS, PIECE_COUNT, STATE_INTERVAL_MS,
} from '../../../shared/towerProtocol.ts';
import type { BlockSnap, ResultEntry, TowerState } from '../../../shared/towerProtocol.ts';
import type { ConfigField, GameModule, Member, Msg, Room } from '../engine.ts';
import { log } from '../log.ts';

/** 高さの上限(m)。これを超える値は不正として捨てる */
const MAX_HEIGHT = 400;
/** 最高到達が1回の送信で伸びてよい量(m)。様子は約10Hzで届くので、普通に積んでいれば届かない */
const MAX_BEST_STEP = 12;

/** 参加者に付ける名前(使われていないものからランダム) */
export const TOWER_NAMES = ['大工のゲン', 'つみき名人', 'クレーン王', '鳶のタツ', 'ブロック侍', 'バランス姫', 'ビル建てっ子', '高所の鬼'];

const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** 整数の短い一覧の検証。範囲外や多すぎるものは捨てる(不正なら空) */
function cleanIntList(v: unknown, maxLen: number, lo: number, hi: number): number[] {
  if (!Array.isArray(v) || v.length > maxLen) return [];
  return v.every((x) => Number.isInteger(x) && x >= lo && x <= hi) ? (v as number[]) : [];
}

/** タワーの様子の検証。不正なら null(数値は小数2桁に丸める)。 */
export function cleanState(msg: Record<string, unknown>): TowerState | null {
  const { h, b, d, lv, k } = msg;
  if (!isNum(h, 0, MAX_HEIGHT) || !isNum(b, 0, MAX_HEIGHT) || !isNum(d, 0, 3) || !isNum(lv, 1, 99)) return null;
  if (!Array.isArray(k) || k.length > MAX_SNAP_BLOCKS) return null;
  const blocks: BlockSnap[] = [];
  for (const it of k) {
    if (!Array.isArray(it) || it.length !== 4) return null;
    const [p, x, y, a] = it;
    if (!Number.isInteger(p) || p < 0 || p >= PIECE_COUNT) return null;
    if (!isNum(x, -50, 50) || !isNum(y, -50, MAX_HEIGHT + 10) || !isNum(a, -100, 100)) return null;
    blocks.push([p, round2(x), round2(y), round2(a)]);
  }
  // 持ち物・次のピース・構え中の状態(古いクライアントからは来ないので、無ければ空として扱う)
  const it = cleanIntList(msg.it, 3, 0, 3);
  const n = cleanIntList(msg.n, 2, 0, PIECE_COUNT - 1);
  const f = isNum(msg.f, 0, 3) ? Math.round(msg.f) : 0;
  return { h: round2(h), b: round2(b), d: Math.round(d), lv: Math.round(lv), k: blocks, it, n, f };
}

interface TowerData {
  state: TowerState;
  out: boolean;
  lastAttackAt: number;
  lastStateAt: number;
}

interface Slot {
  id: number;
  name: string;
  best: number;
  out: boolean;
  gone: boolean;
  /** 何番目に脱落したか(0=まだ残っている)。大きいほど後まで残った */
  outOrder: number;
}

const emptyState = (): TowerState => ({ h: 0, b: 0, d: 0, lv: 1, k: [], it: [], n: [], f: 0 });

export class TowerGame implements GameModule<TowerData> {
  readonly id = 'tower-stack';
  readonly playerNames = TOWER_NAMES;
  readonly maxPlayers = MAX_PLAYERS;
  /** 1on1 なので、2人そろったら10秒待って始める(マッチ後の待機) */
  readonly startWhenFullMs = 10000;
  readonly maxPlayMs = MAX_MATCH_MS;
  /** 管理画面の設定項目: なし */
  readonly config: ConfigField[] = [];

  private room!: Room<TowerData>;
  /** 開始時の参加者(並びが番号=色)。抜けた人も結果に残すため、ここで持つ */
  private slots: Slot[] = [];
  private startAt = 0;
  private outCount = 0;
  private tick: ReturnType<typeof setInterval> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private finished = false;

  attach(room: Room<TowerData>): void {
    this.room = room;
  }

  getConfig(): Record<string, string> {
    return {};
  }

  setConfig(): void {}

  resolved(): Record<string, string> {
    return {};
  }

  onJoin(m: Member<TowerData>): void {
    m.data = { state: emptyState(), out: false, lastAttackAt: 0, lastStateAt: 0 };
  }

  /** 抜けた人は脱落扱い(それまでの最高到達は残る)。 */
  onLeave(m: Member<TowerData>): void {
    const slot = this.slots.find((s) => s.id === m.peer.id);
    if (!slot) return;
    slot.gone = true;
    this.markOut(slot);
    log(`tower leave name=${slot.name}`);
  }

  onReset(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.endTimer) clearTimeout(this.endTimer);
    this.tick = null;
    this.endTimer = null;
    this.slots = [];
    this.finished = false;
  }

  playerInfo(): object {
    return {};
  }

  roomExtra(): object {
    return {};
  }

  onPref(): string | null {
    return null;
  }

  prepareStart(): Msg {
    const members = [...this.room.members];
    this.slots = members.map(([id, m]) => ({ id, name: m.name, best: 0, out: false, gone: false, outOrder: 0 }));
    this.outCount = 0;
    for (const [, m] of members) m.data = { state: emptyState(), out: false, lastAttackAt: 0, lastStateAt: 0 };
    this.finished = false;
    log(`tower start players=${members.length}`);
    return { t: 'start', players: members.map(([id, m]) => ({ id, name: m.name })) };
  }

  onGo(): Msg {
    const now = Date.now();
    this.startAt = now + COUNTDOWN_SEC * 1000;
    this.tick = setInterval(() => this.broadcastStates(), STATE_INTERVAL_MS);
    // 決着がつかないときの打ち切り(エンジンの上限より少し前に、結果を送ってから終わる)
    this.endTimer = setTimeout(() => this.finish('time'), MAX_MATCH_MS - 5000);
    return { t: 'go', startAt: this.startAt };
  }

  onPlayMessage(m: Member<TowerData>, msg: Msg): void {
    const slot = this.slots.find((s) => s.id === m.peer.id);
    if (!slot || this.finished) return;
    const now = Date.now();
    if (msg.t === 'state') {
      if (m.data.out) return;
      // 様子は約10Hzで届く。それより速く送って最高到達を一気に伸ばしたり、全員への配信を増やしたりできないよう、半分の間隔より短いものは捨てる
      if (now - m.data.lastStateAt < STATE_INTERVAL_MS / 2) return;
      m.data.lastStateAt = now;
      const st = cleanState(msg);
      if (!st) return;
      // 最高到達は下がらず、一度に伸びすぎない
      st.b = Math.max(slot.best, Math.min(st.b, slot.best + MAX_BEST_STEP));
      slot.best = st.b;
      m.data.state = st;
    } else if (msg.t === 'attack') {
      if (m.data.out || now < this.startAt) return;
      if (typeof msg.k !== 'string' || !ATTACK_KINDS.includes(msg.k)) return;
      if (now - m.data.lastAttackAt < ATTACK_MIN_INTERVAL_MS) return;
      const to = this.pickTarget(m.peer.id);
      if (to === null) return;
      m.data.lastAttackAt = now;
      this.room.broadcast({ t: 'atk', k: msg.k, from: m.peer.id, to });
    } else if (msg.t === 'out') {
      if (m.data.out) return;
      m.data.out = true;
      this.markOut(slot);
      if (isNum(msg.b, 0, MAX_HEIGHT)) slot.best = Math.max(slot.best, Math.min(round2(msg.b), slot.best + MAX_BEST_STEP));
      m.data.state = { ...m.data.state, b: slot.best, d: 3 };
      log(`tower out name=${slot.name} best=${slot.best}`);
      this.broadcastStates();
      if (this.isDone()) this.finish('last-one');
    }
  }

  /** おじゃまの宛先: 送った人を除き、まだ脱落していない人のうち最高到達が一番高い人(同じなら先に参加した人)。 */
  private pickTarget(fromId: number): number | null {
    let best: Slot | null = null;
    for (const s of this.slots) {
      if (s.id === fromId || s.out || s.gone) continue;
      if (!best || s.best > best.best) best = s;
    }
    return best ? best.id : null;
  }

  private markOut(slot: Slot): void {
    if (slot.out) return;
    slot.out = true;
    slot.outOrder = ++this.outCount;
  }

  /** 残りが1人以下になったら決着 */
  isDone(): boolean {
    return this.finished || (this.slots.length > 0 && this.slots.filter((s) => !s.out).length <= 1);
  }

  /** 順位: 残っている人(最高到達の高い順) → 脱落が遅かった順(同時なら最高到達の高い順) */
  buildResults(): Msg {
    const entries: ResultEntry[] = [...this.slots]
      .sort((a, b) => {
        if (a.out !== b.out) return a.out ? 1 : -1;
        if (a.out && a.outOrder !== b.outOrder) return b.outOrder - a.outOrder;
        return b.best - a.best;
      })
      .map((s) => ({ id: s.id, name: s.name, best: s.best, out: s.out }));
    return { t: 'results', entries };
  }

  private broadcastStates(): void {
    const p: Record<number, TowerState & { out: boolean }> = {};
    for (const [id, m] of this.room.members) {
      if (!this.slots.some((s) => s.id === id)) continue;
      p[id] = { ...m.data.state, out: m.data.out };
    }
    const gone = this.slots.filter((s) => s.gone).map((s) => s.id);
    this.room.broadcast({ t: 'states', p, gone });
  }

  private finish(reason: string): void {
    if (this.finished) return;
    this.finished = true;
    log(`tower end reason=${reason} ${this.slots.map((s) => `${s.name}=${s.best}`).join(' ')}`);
    this.room.end();
  }
}
