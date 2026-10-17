// えんにち射的(最大4人)の対戦ルール。待機中: モードの希望(対戦/協力)。開始時: 「主催者の固定 > 希望の多数決 > 抽選」でモードを決める。
// 実行中: 各自が自分の台を動かし、サーバーは照準・発砲・動いている景品のスナップショット・得点を中継/集計する(クライアント権威)。
// 共有の的(大UFO)は、出現を共有シードで全員が同じに計算し、サーバーは「最初の命中」を採用する(協力は命中の合算でHPを減らす)。
import type { Defeated, EntryResult, FireEvent, Mode, PrizeSnap, UfoSpec } from '../../../shared/ennichiProtocol.ts';
import { COUNTDOWN_MS, DURATION_MS as DEFAULT_DURATION_MS, MAX_PLAYERS, MODES, ufoSchedule } from '../../../shared/ennichiProtocol.ts';
import type { ConfigField, GameModule, Member, Msg, Room } from '../engine.ts';
import { decide, RANDOM, tally } from '../vote.ts';
import { log } from '../log.ts';
import { isNum } from '../../../shared/online/validate.ts';

/** 制限時間(テスト用に環境変数で短縮できる。クライアントには start で伝える) */
const DURATION_MS = Number(process.env.ONLINE_ENNICHI_DURATION_MS) || DEFAULT_DURATION_MS;
/** go を送ってから、カウントダウンを始めるまでの猶予(全員にメッセージが届いてから始まるように) */
const GO_LEAD_MS = 800;
/** 終了時刻から、最終結果(result)を待つ猶予。揃わなくても、この時間で集計する */
const RESULT_GRACE_MS = Number(process.env.ONLINE_ENNICHI_GRACE_MS) || 4000;
/** 同期メッセージの中継間隔(約20Hz) */
const SYNC_MS = 50;
/** 同じ人の ufoHit は、この間隔より短いものを捨てる(協力の巨大UFOのHPを連打で削れないように) */
const UFO_HIT_MIN_INTERVAL_MS = 120;
const MAX_SCORE = 200000;
const MAX_SNAP = 24;

interface EnnichiMember {
  /** 希望するモード */
  mode: Mode | null;
  aim: [number, number] | null;
  snap: PrizeSnap[] | null;
  snapDirty: boolean;
  /** 申告された累積得点(UFOの得点を除く)と内訳 */
  score: number;
  defeated: Defeated;
  /** サーバーが採用したUFOの得点 */
  ufoPts: number;
  lastUfoHit: number;
  finalized: boolean;
}

const isVec = (v: unknown, n: number, lim: number): v is number[] => Array.isArray(v) && v.length === n && v.every((x) => isNum(x, -lim, lim));

function cleanDefeated(d: unknown): Defeated | null {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const out: Defeated = {};
  const entries = Object.entries(d as Record<string, unknown>);
  if (entries.length > 24) return null;
  for (const [k, v] of entries) {
    if (k.length > 24 || !isNum(v, 0, 999) || !Number.isInteger(v)) return null;
    out[k] = v;
  }
  return out;
}

export class EnnichiGame implements GameModule<EnnichiMember> {
  readonly id = 'ennichi-shateki';
  readonly maxPlayers = MAX_PLAYERS;
  /** 実行(racing)の最大時間: カウントダウン+プレイ+猶予 */
  readonly maxPlayMs = GO_LEAD_MS + COUNTDOWN_MS + DURATION_MS + RESULT_GRACE_MS + 4000;
  /**
   * 管理画面に出す設定項目: なし。モードは常に「参加者の希望の多数決(同数・希望なしは抽選)」。
   * setConfig はテスト・緊急用(ctl の mode=…)に残してあり、管理画面からは変えられない。
   */
  readonly config: ConfigField[] = [];
  readonly playerNames: string[] = [
    'スナイパー・アサシーノ',
    'しゃてき名人',
    '早撃ちジョー',
    'コルクのゴルゴ',
    '的あて番長',
    'スナイパーたろう',
    'お祭りボーイ',
    'はやうち次郎',
  ];

  private room!: Room<EnnichiMember>;
  private modeSetting = RANDOM;
  private mode: Mode = 'versus';
  private seed = 0;
  private schedule: UfoSpec[] = [];
  private ufoHp = new Map<number, number>();
  private ufoDone = new Set<number>();
  private teamBonus = 0;
  /** GOの時刻(サーバー時刻ms) */
  private goTime = 0;
  private fires: [number, FireEvent][] = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private endTimer: ReturnType<typeof setTimeout> | null = null;

  attach(room: Room<EnnichiMember>): void {
    this.room = room;
  }

  getConfig(): Record<string, string> {
    return { mode: this.modeSetting };
  }

  setConfig(cfg: Record<string, string>): void {
    if (cfg.mode === RANDOM || MODES.includes(cfg.mode as Mode)) this.modeSetting = cfg.mode;
    if (this.room.phase === 'lobby') this.room.broadcastRoom();
  }

  resolved(): Record<string, string> {
    return {};
  }

  private data(m: Member<EnnichiMember>): EnnichiMember {
    return m.data;
  }

  onJoin(m: Member<EnnichiMember>): void {
    m.data = { mode: null, aim: null, snap: null, snapDirty: false, score: 0, defeated: {}, ufoPts: 0, lastUfoHit: 0, finalized: false } satisfies EnnichiMember;
  }

  onLeave(): void {}

  onReset(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.endTimer) clearTimeout(this.endTimer);
    this.tick = this.endTimer = null;
    this.fires = [];
  }

  playerInfo(m: Member<EnnichiMember>): object {
    return { mode: this.data(m).mode };
  }

  private votes(): Record<string, number> {
    return tally([...this.room.members.values()].map((m) => this.data(m).mode));
  }

  roomExtra(): object {
    return { modeSetting: this.modeSetting, votes: this.votes() };
  }

  onPref(m: Member<EnnichiMember>, msg: Msg): string | null {
    if (msg.mode !== null && !MODES.includes(msg.mode as Mode)) return 'bad_pref';
    this.data(m).mode = msg.mode as Mode | null;
    this.room.broadcastRoom();
    return null;
  }

  prepareStart(): Msg {
    this.mode = decide(this.modeSetting, MODES, this.votes()) as Mode;
    this.seed = (Math.random() * 0xffffffff) >>> 0;
    this.schedule = ufoSchedule(this.seed, this.mode, DURATION_MS);
    this.ufoHp = new Map(this.schedule.map((u) => [u.n, u.hp]));
    this.ufoDone = new Set();
    this.teamBonus = 0;
    this.fires = [];
    const grid = [...this.room.members.keys()];
    for (const m of this.room.members.values()) Object.assign(this.data(m), { aim: null, snap: null, snapDirty: false, score: 0, defeated: {}, ufoPts: 0, lastUfoHit: 0, finalized: false });
    log(`ennichi mode=${this.mode} players=${grid.length}`);
    return { t: 'start', seed: this.seed, mode: this.mode, grid, players: [...this.room.members].map(([id, m]) => ({ id, name: m.name })), durationMs: DURATION_MS };
  }

  onGo(): Msg {
    const at = Date.now() + GO_LEAD_MS;
    this.goTime = at + COUNTDOWN_MS;
    const endAt = this.goTime + DURATION_MS;
    this.tick = setInterval(() => this.flush(), SYNC_MS);
    this.endTimer = setTimeout(() => this.room.end(), endAt - Date.now() + RESULT_GRACE_MS);
    return { t: 'go', at, endAt };
  }

  onPlayMessage(m: Member<EnnichiMember>, msg: Msg): void {
    const d = this.data(m);
    switch (msg.t) {
      case 'aim':
        if (isVec(msg.a, 2, 2)) d.aim = [msg.a[0], msg.a[1]];
        return;
      case 'fire': {
        const f = msg.f as FireEvent | undefined;
        if (f && (f.k === 'n' || f.k === 'b') && isVec(f.o, 3, 100) && isVec(f.d, 3, 100)) {
          this.fires.push([m.peer.id, { k: f.k, o: [f.o[0], f.o[1], f.o[2]], d: [f.d[0], f.d[1], f.d[2]] }]);
          if (this.fires.length > 200) this.fires.shift();
        }
        return;
      }
      case 'snap':
        if (Array.isArray(msg.p) && msg.p.length <= MAX_SNAP && msg.p.every((e) => isVec(e, 7, 100) && Number.isInteger((e as number[])[0]) && Number.isInteger((e as number[])[6]))) {
          d.snap = msg.p as PrizeSnap[];
          d.snapDirty = true;
        }
        return;
      case 'score': {
        const defeated = cleanDefeated(msg.defeated);
        // 得点は減らない(古いメッセージの遅れ・巻き戻しは無視)
        if (isNum(msg.score, 0, MAX_SCORE) && defeated && msg.score >= d.score) {
          d.score = msg.score;
          d.defeated = defeated;
        }
        return;
      }
      case 'ufoHit':
        this.ufoHit(m, msg.n);
        return;
      case 'result': {
        const defeated = cleanDefeated(msg.defeated);
        if (isNum(msg.score, 0, MAX_SCORE) && defeated && !d.finalized) {
          d.score = Math.max(d.score, msg.score);
          d.defeated = defeated;
          d.finalized = true;
          log(`ennichi result id=${m.peer.id} score=${d.score}`);
        }
        return;
      }
    }
  }

  /** 共有の的への命中: 出現中の的だけ。最初の1件を採用(協力はHPを減らす)。 */
  private ufoHit(m: Member<EnnichiMember>, n: unknown): void {
    const spec = this.schedule.find((u) => u.n === n);
    const now = Date.now();
    const d = this.data(m);
    if (!spec || this.ufoDone.has(spec.n) || now - d.lastUfoHit < UFO_HIT_MIN_INTERVAL_MS) return;
    const t = now - this.goTime;
    if (t < spec.t0 - 400 || t > spec.t0 + spec.dur + 400) return;      // 出現していない的への命中は無効
    d.lastUfoHit = now;
    const hp = Math.max(0, (this.ufoHp.get(spec.n) ?? 1) - 1);
    this.ufoHp.set(spec.n, hp);
    let pts = 0, bonus = 0;
    if (hp === 0) {
      this.ufoDone.add(spec.n);
      if (this.mode === 'versus') {
        pts = spec.pts;
        d.ufoPts += pts;
      } else {
        bonus = spec.bonus;
        this.teamBonus += bonus;
      }
    }
    this.room.broadcast({ t: 'ufo', n: spec.n, hp, by: m.peer.id, pts, bonus });
  }

  isDone(): boolean {
    return this.room.members.size > 0 && [...this.room.members.values()].every((m) => this.data(m).finalized);
  }

  buildResults(): Msg {
    const grid = [...this.room.members.keys()];
    const entries: EntryResult[] = [...this.room.members].map(([id, m]) => {
      const d = this.data(m);
      return { id, name: m.name, slot: grid.indexOf(id), score: d.score + d.ufoPts, prizeScore: d.score, ufoPts: d.ufoPts, defeated: d.defeated };
    });
    entries.sort((a, b) => b.score - a.score);
    const teamScore = entries.reduce((s, e) => s + e.score, 0) + this.teamBonus;
    return { t: 'results', mode: this.mode, entries, teamScore, teamBonus: this.teamBonus, done: true };
  }

  /** 他の人の動きを、受け取る人ごとに(自分の分を除いて)まとめて送る。 */
  private flush(): void {
    const fires = this.fires;
    this.fires = [];
    const sc: Record<number, number> = {};
    for (const [id, m] of this.room.members) sc[id] = this.data(m).score + this.data(m).ufoPts;
    for (const [id, m] of this.room.members) {
      const a: Record<number, [number, number]> = {};
      const p: Record<number, PrizeSnap[]> = {};
      for (const [oid, o] of this.room.members) {
        if (oid === id) continue;
        const od = this.data(o);
        if (od.aim) a[oid] = od.aim;
        if (od.snap && od.snapDirty) p[oid] = od.snap;
      }
      m.peer.send({ t: 'sync', a, f: fires.filter(([fid]) => fid !== id), p, sc });
    }
    for (const m of this.room.members.values()) this.data(m).snapDirty = false;
  }
}
