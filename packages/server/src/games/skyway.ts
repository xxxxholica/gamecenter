// midnight-skyway(レース)の対戦ルール。待機中: マシン(種類+色。他の参加者と body 色が被れない)とコースの希望。
// 開始時: 未選択のマシンを自動決定、コースは「主催者の固定 > 希望の多数決 > 抽選」。実行中: 座標の中継と完走タイムの集計。
import type { CarSpec, CarState, FinishEntry, RacerInfo } from '../../../shared/netProtocol.ts';
import { MAP_IDS, MIN_FINISH_MS, STATE_HZ, TIME_IDS } from '../../../shared/netProtocol.ts';
import { CAR_PALETTES, CAR_TYPES, type CarType } from '../../../shared/carPalette.ts';
import type { ConfigField, GameModule, Member, Msg, Room } from '../engine.ts';
import { decide, RANDOM, tally } from '../vote.ts';
import { log } from '../log.ts';
import { rankRacers, updateTrack, type ProgressTrack } from '../../../shared/skywayStandings.ts';

/** go 受信からカウントダウン開始までの猶予。全員にメッセージが届いてから始まるようにする。 */
const GO_LEAD_MS = 800;
/** 順位を配る間隔 */
const STANDINGS_MS = 250;
/** 最初のゴールから、未完走者を待つ時間 */
const FINISH_WAIT_MS = 30000;
/**
 * 誰もゴールしなくても、出走からこの時間でレースを強制終了して空に戻す(放置・荒らしで場が止まったままにならないように)。
 * 最長コース(tokyo_climb 約4.4km)の完走が3分前後なので、余裕を持たせて6分。テスト用に環境変数で短縮できる。
 */
const MAX_RACE_MS = (Number(process.env.ONLINE_MAX_RACE_SEC) || 360) * 1000;
/** 出走直後の即時ゴール申告を弾く下限の経過時間の上書き(テスト用。未指定ならコースごとの最短タイム-2秒) */
const minElapsedOverride = (): number | null => (process.env.ONLINE_MIN_ELAPSED_MS !== undefined ? Number(process.env.ONLINE_MIN_ELAPSED_MS) : null);
/** 申告タイムが、出走からの実経過時間より長いことを許す余裕(通信の遅れ・端末の時計のずれ) */
const FINISH_ELAPSED_SLACK_MS = 3000;

interface SkywayMember {
  /** null=まだ選んでいない(開始時に自動で決まる) */
  car: CarSpec | null;
  /** 希望するコース(null=希望なし) */
  course: string | null;
  state: CarState | null;
  /** state を送信した時のサーバー時刻(クライアントの申告。なければ null) */
  stateTs: number | null;
  /** 進行率の履歴(順位の計算用) */
  track: ProgressTrack | null;
  finish: number | null;
  /** 直近の発砲の時刻(連射の上限用) */
  lastFireAt: number;
}

/** 発砲の最短間隔(ms)。正規の連射(機関砲0.45秒・ミサイル2秒)よりずっと短い値で、荒らしの連打だけを弾く。 */
const MIN_FIRE_INTERVAL_MS = 150;
const finite = (v: unknown, lim: number): v is number => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim;

/** [x, y, z, rotY, speed, steer, roll, pitch, drift, progress, boost] の許容範囲(boost は無くてもよい)。範囲外は不正として捨てる(他の人のブラウザに巨大な値を渡さない)。 */
const STATE_LIMITS: [number, number][] = [[-1e5, 1e5], [-1e4, 1e4], [-1e5, 1e5], [-100, 100], [-200, 200], [-4, 4], [-4, 4], [-4, 4], [0, 1], [-1, 2], [0, 1]];
const isState = (s: unknown): s is CarState =>
  Array.isArray(s) && (s.length === 10 || s.length === 11) && s.every((v, i) => typeof v === 'number' && Number.isFinite(v) && v >= STATE_LIMITS[i][0] && v <= STATE_LIMITS[i][1]);

const isCar = (c: unknown): c is CarSpec =>
  !!c && typeof (c as CarSpec).type === 'string' && (c as CarSpec).type.length <= 24 && Number.isInteger((c as CarSpec).body) && Number.isInteger((c as CarSpec).roof);

/** 参加者に付く走り屋の二つ名(参加順ではなく、使われていないものからランダムに選ばれる) */
export const SKYWAY_PLAYER_NAMES = [
  '首都高の黒豹',
  '湾岸の白い稲妻',
  '環状線のゴースト',
  '深夜のゼロヨン野郎',
  '峠の魔術師',
  '夜明け前の流星',
  '午前3時のレーサー',
  'C1の幻影',
  '埠頭のドリフトキング',
  '疾風のカズマ',
  '閃光のリョウ',
  '爆音のテツヤ',
  'ターボのゲンジ',
  '夜叉のシンジ',
  '銀翼のハヤテ',
  '黒煙のダイゴ',
  '紅蓮のレン',
  '高速の狼',
  '路地裏のドリフター',
  '真夜中のスピード狂',
];

export class SkywayGame implements GameModule<SkywayMember> {
  readonly id = 'midnight-skyway';
  readonly maxPlayers = 4;
  readonly maxPlayMs = MAX_RACE_MS;
  /**
   * 管理画面に出す設定項目: なし。コースは常に「参加者の希望の多数決(なければ抽選)」、時間帯は常にランダム。
   * setConfig はテスト・緊急用(ctl の map=…/tod=…)に残してあり、管理画面からは変えられない。
   */
  readonly config: ConfigField[] = [];
  readonly playerNames: string[] = SKYWAY_PLAYER_NAMES;

  private room!: Room<SkywayMember>;
  /** 主催者の設定: コースのid=固定 / 'random'=参加者の希望で決める(なければ抽選) */
  private mapMode = RANDOM;
  private todMode = RANDOM;
  /** 次のレースの時間帯(決まった値) */
  private tod = TIME_IDS[0];
  /** いま走っている(ロード中を含む)レースのコース */
  private raceMap = MAP_IDS[0];
  private dirty = false;
  private tick: ReturnType<typeof setInterval> | null = null;
  private standingsTick: ReturnType<typeof setInterval> | null = null;
  private lastOrder = '';
  private standingsTicks = 0;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;
  private finishDeadline = 0;
  private goAt = 0;

  attach(room: Room<SkywayMember>): void {
    this.room = room;
    this.resolveTod();                                       // 時間帯は最初から引いておく(ランダム)
  }

  getConfig(): Record<string, string> {
    return { map: this.mapMode, tod: this.todMode };
  }

  setConfig(cfg: Record<string, string>): void {
    if (cfg.map === RANDOM || MAP_IDS.includes(cfg.map)) this.mapMode = cfg.map;
    if (cfg.tod === RANDOM || TIME_IDS.includes(cfg.tod)) this.todMode = cfg.tod;
    if (this.room.phase === 'lobby') {
      this.resolveTod();
      this.room.broadcastRoom();
    }
  }

  resolved(): Record<string, string> {
    return { tod: this.tod };
  }

  /** 時間帯を決める(ランダムならここで引く)。 */
  private resolveTod(): void {
    this.tod = this.todMode === RANDOM ? TIME_IDS[Math.floor(Math.random() * TIME_IDS.length)] : this.todMode;
  }

  private data(m: Member<SkywayMember>): SkywayMember {
    return m.data;
  }

  onJoin(m: Member<SkywayMember>): void {
    m.data = { car: null, course: null, state: null, stateTs: null, track: null, finish: null, lastFireAt: 0 } satisfies SkywayMember;
  }

  onLeave(): void {}

  onReset(): void {
    if (this.tick) clearInterval(this.tick);
    if (this.standingsTick) clearInterval(this.standingsTick);
    this.standingsTick = null;
    this.lastOrder = '';
    this.standingsTicks = 0;
    if (this.finishTimer) clearTimeout(this.finishTimer);
    this.tick = this.finishTimer = null;
    this.finishDeadline = 0;
    this.goAt = 0;
    this.dirty = false;
    this.resolveTod();                                       // ランダム設定なら次のレースの分を引き直す
  }

  playerInfo(m: Member<SkywayMember>): object {
    return { car: this.data(m).car, course: this.data(m).course };
  }

  private votes(): Record<string, number> {
    return tally([...this.room.members.values()].map((m) => this.data(m).course));
  }

  roomExtra(): object {
    return { mapMode: this.mapMode, votes: this.votes(), tod: this.tod };
  }

  /**
   * 待機中の希望の更新。マシンは「パレットにある種類+色」で、他の参加者と body の色が被らないこと。
   * エラー: 'color_taken'=その色は他の人が使っている / 'bad_pref'=不正な値
   */
  onPref(m: Member<SkywayMember>, msg: Msg): string | null {
    const d = this.data(m);
    if (msg.car !== undefined) {
      const car = isCar(msg.car) ? msg.car : null;
      const ok = car && CAR_TYPES.includes(car.type as CarType) && CAR_PALETTES[car.type as CarType].some((c) => c.bodyColor === car.body && c.roofColor === car.roof);
      if (!car || !ok) return 'bad_pref';
      for (const [oid, o] of this.room.members) if (oid !== m.peer.id && this.data(o).car?.body === car.body) return 'color_taken';
      d.car = { type: car.type, body: car.body, roof: car.roof };
    }
    if (msg.course !== undefined) {
      if (msg.course !== null && (typeof msg.course !== 'string' || !MAP_IDS.includes(msg.course))) return 'bad_pref';
      d.course = msg.course as string | null;
    }
    this.room.broadcastRoom();
    return null;
  }

  /** 未選択のマシンを自動で決める(他の人と色が被らないように)。 */
  private autoAssignCars(): void {
    const used = new Set<number>();
    for (const m of this.room.members.values()) if (this.data(m).car) used.add(this.data(m).car!.body);
    for (const m of this.room.members.values()) {
      const d = this.data(m);
      if (d.car) continue;
      const type = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
      const free = CAR_PALETTES[type].filter((c) => !used.has(c.bodyColor));
      const pool = free.length > 0 ? free : CAR_PALETTES[type];
      const c = pool[Math.floor(Math.random() * pool.length)];
      d.car = { type, body: c.bodyColor, roof: c.roofColor };
      used.add(c.bodyColor);
    }
  }

  prepareStart(): Msg {
    this.autoAssignCars();
    const map = decide(this.mapMode, MAP_IDS, this.votes());
    this.raceMap = map;
    const seed = (Math.random() * 0xffffffff) >>> 0;
    const grid = [...this.room.members.keys()];
    const players: RacerInfo[] = [...this.room.members].map(([id, m]) => ({ id, name: m.name, car: this.data(m).car! }));
    for (const m of this.room.members.values()) {
      this.data(m).state = null;
      this.data(m).stateTs = null;
      this.data(m).track = null;
      this.data(m).finish = null;
    }
    log(`skyway map=${map} tod=${this.tod}`);
    return { t: 'start', seed, map, tod: this.tod, grid, players };
  }

  onGo(): Msg {
    this.goAt = Date.now() + GO_LEAD_MS;
    this.tick = setInterval(() => this.flushStates(), 1000 / STATE_HZ);
    this.standingsTick = setInterval(() => this.flushStandings(), STANDINGS_MS);
    return { t: 'go', at: this.goAt };
  }

  onPlayMessage(m: Member<SkywayMember>, msg: Msg): void {
    const d = this.data(m);
    if (msg.t === 'state') {
      if (!isState(msg.s)) return;
      d.state = msg.s;
      // 送信時刻の申告は、受信時刻の前後数秒以内だけ信じる(時計が大きくずれた端末や不正な値で、他の人の補間を壊さない)
      const now = Date.now();
      d.stateTs = typeof msg.ts === 'number' && Number.isFinite(msg.ts) && Math.abs(msg.ts - now) < 5000 ? msg.ts : null;
      d.track = updateTrack(d.track, msg.s[9], Date.now());
      this.dirty = true;
    } else if (msg.t === 'fire') {
      const { k, o, f, tg } = msg;
      if (k !== 'g' && k !== 'm') return;
      if (!Array.isArray(o) || o.length !== 3 || !finite(o[0], 1e5) || !finite(o[1], 1e4) || !finite(o[2], 1e5)) return;
      if (!Array.isArray(f) || f.length !== 2 || !finite(f[0], 2) || !finite(f[1], 2)) return;
      if (tg !== null && !(typeof tg === 'number' && Number.isInteger(tg) && this.room.members.has(tg))) return;
      const now = Date.now();
      if (now - d.lastFireAt < MIN_FIRE_INTERVAL_MS) return;
      d.lastFireAt = now;
      this.relay(m, { t: 'fire', from: m.peer.id, k, o: [o[0], o[1], o[2]], f: [f[0], f[1]], tg });
    } else if (msg.t === 'died') {
      this.relay(m, { t: 'died', from: m.peer.id });
    } else if (msg.t === 'finish') {
      const timeMs = msg.timeMs;
      if (typeof timeMs !== 'number' || !Number.isFinite(timeMs) || timeMs <= 0 || d.finish !== null) return;
      // コースごとの最短タイムを下回る完走は物理的にありえないので、不正な申告として捨てる。
      // また、出走時刻(goAt)からの実経過時間も検証し、出走直後の即時ゴール申告による強制終了(DoS)チートを防ぐ。
      const minTime = MIN_FINISH_MS[this.raceMap] ?? 0;
      const minElapsed = minElapsedOverride() ?? Math.max(0, minTime - 2000);
      const elapsed = this.goAt > 0 ? Date.now() - this.goAt : 0;
      // 上限: 最大レース時間を超える申告、実経過時間より明らかに長い申告は、ありえない値として捨てる
      const tooLong = timeMs > MAX_RACE_MS || (this.goAt > 0 && timeMs > elapsed + FINISH_ELAPSED_SLACK_MS);
      if (timeMs < minTime || tooLong || (minElapsed > 0 && elapsed < minElapsed)) {
        log(`skyway finish rejected (out of range) id=${m.peer.id} time=${timeMs} elapsed=${elapsed} minTime=${minTime} minElapsed=${minElapsed} map=${this.raceMap}`);
        return;
      }
      log(`skyway finish id=${m.peer.id} time=${timeMs}`);
      d.finish = timeMs;
      if (!this.finishTimer) {
        this.finishTimer = setTimeout(() => this.room.end(), FINISH_WAIT_MS);
        this.finishDeadline = Date.now() + FINISH_WAIT_MS;
      }
      if (!this.isDone()) this.room.broadcast(this.results(false));
    }
  }

  /** 送り主以外の全員に中継する。 */
  private relay(from: Member<SkywayMember>, msg: Msg): void {
    for (const [id, o] of this.room.members) if (id !== from.peer.id) o.peer.send(msg);
  }

  isDone(): boolean {
    return this.room.members.size > 0 && [...this.room.members.values()].every((m) => this.data(m).finish !== null);
  }

  private results(done: boolean): Msg {
    const entries: FinishEntry[] = [...this.room.members].map(([id, m]) => ({ id, name: m.name, timeMs: this.data(m).finish }));
    entries.sort((a, b) => (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity));
    // 終了までの残り時間(端末ごとの時計のずれを避けるため、時刻ではなく残りのms)
    if (!done && this.finishDeadline) return { t: 'results', entries, done, endsInMs: Math.max(0, this.finishDeadline - Date.now()) };
    return { t: 'results', entries, done };
  }

  buildResults(): Msg {
    return this.results(true);
  }

  /** 順位を全員に配る。変わった時はすぐ、変わらなくても数回に1回(途中参加・取りこぼしの保険)。 */
  private flushStandings(): void {
    const order = rankRacers([...this.room.members].map(([id, m]) => ({ id, finish: this.data(m).finish, track: this.data(m).track })), Date.now());
    const key = order.join(',');
    this.standingsTicks = key === this.lastOrder ? this.standingsTicks + 1 : 0;
    if (this.standingsTicks !== 0 && this.standingsTicks % 8 !== 0) return;
    this.lastOrder = key;
    this.room.broadcast({ t: 'standings', order });
  }

  private flushStates(): void {
    if (!this.dirty) return;
    this.dirty = false;
    for (const [id, m] of this.room.members) {
      const s: Record<number, CarState> = {};
      const ts: Record<number, number> = {};
      for (const [oid, o] of this.room.members) {
        if (oid === id || !this.data(o).state) continue;
        s[oid] = this.data(o).state!;
        const t = this.data(o).stateTs;
        if (t !== null) ts[oid] = t;
      }
      m.peer.send({ t: 'states', s, ts });
    }
  }
}
