// ランキングの保存層。上位5件×(ゲーム/バリアント)を1つのJSONファイルに持つ。件数が少ないので、全体をメモリに置き、
// 変更のたびに一時ファイルへ書いてから rename する(書き込み途中で落ちても壊れない)。
// 検証はここで行う: クライアントの申告は信用しない(名前の正規化・スコア範囲・ゴーストの形式)。
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { anonNameFromIndex } from '../../shared/anonName.ts';
import {
  GAME_LEADERBOARD_DEFS,
  LEADERBOARD_MAX_ENTRIES,
  DEV_NAME,
  isValidAdminCustomName,
  isValidAdminRole,
  formatAdminRoleName,
  getLeaderboardDef,
  insertScore,
  leaderboardBoardKey as boardKey,
  parseBoardKey,
  rankForScore,
  sanitizeLeaderboardExtra,
  sanitizeLeaderboardName,
  type AdminRole,
  type GameLeaderboardDef,
  type LeaderboardEntry,
} from '../../shared/arcadeLeaderboardCore.ts';

/** ゴースト(走行の軌跡)を保存できるゲーム */
const GHOST_GAMES = new Set(['midnight-skyway']);
const GHOST_STRIDE = 5;
const GHOST_SAMPLE_MS = 100;
const GHOST_MAX_SAMPLES = 7200;                    // 12分

export interface GhostTrace {
  v: 1;
  timeMs: number;
  carName: string;
  date: string;
  kind: 'player' | 'bot';
  s: number[];
}

interface StoredEntry extends LeaderboardEntry {
  id: string;
  /** 管理者の印・ロールを付ける前の名前(印を外すと戻す) */
  origName?: string;
  /** 管理者が設定した名前(ロール付与前) */
  customName?: string;
  ghost?: GhostTrace;
  /** このプレイの操作の記録(リプレイ)と、そのラウンドが始まった所(記録の開始からの秒)。ランキングに載っている間だけ残す */
  replay?: { id: string; seek: number };
}

interface Board {
  /** この記録が作られたときのコースの版(arcadeLeaderboardCore の revision)。いまの版と違えば、起動時に破棄する */
  rev: number;
  entries: StoredEntry[];
}

function roundScore(v: number): number {
  return Number.isInteger(v) ? v : Math.round(v * 1000) / 1000;
}

function isStoredEntry(e: unknown): e is StoredEntry {
  const x = e as StoredEntry | null;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.score === 'number' && Number.isFinite(x.score) && typeof x.name === 'string';
}

export interface SubmitContext {
  /** チケット発行からの経過時間(ms)。渡されたら、スコアが経過時間と釣り合うかも確かめる */
  elapsedMs?: number;
}

export type SubmitInput = {
  name?: unknown;
  score?: unknown;
  extra?: unknown;
  cleared?: unknown;
  ghost?: unknown;
  replay?: unknown;
  /** 登録ウィンドウを開いたときに予約した匿名名の札(reserveAnon の token) */
  anonToken?: unknown;
};

export type SubmitResult =
  | { ok: true; rank: number; entries: LeaderboardEntry[] }
  | { ok: false; error: 'unknown_board' | 'bad_score' | 'bad_ghost' | 'implausible_score' };

export type SetRoleOptions =
  | { on: false }
  | { on: true; name: string; role: AdminRole };

function today(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().split('T')[0].replace(/-/g, '/');
}

/** 1サンプル(0.1秒)で動いてよい最大距離(m)。車の最高速よりずっと大きい値で、偽の軌跡(瞬間移動・ランダム)だけを弾く */
const GHOST_MAX_STEP_M = 40;
/** 復活などでの瞬間移動を許す回数 */
const GHOST_MAX_JUMPS = 5;
/** 完走した軌跡なら、進行率(5つ目の値)はゴール近くまで届く(ゴールは 0.98: TimeAttackManager の SECTOR_FRACTIONS) */
const GHOST_MIN_FINAL_PROGRESS = 0.95;

/** 軌跡が「走った」形か: サンプル間の移動が現実的で、進行率がゴール近くまで届いている。 */
function ghostIsPlausible(s: number[]): boolean {
  const n = s.length / GHOST_STRIDE;
  let jumps = 0;
  let maxProgress = -Infinity;
  for (let i = 0; i < n; i++) {
    const progress = s[i * GHOST_STRIDE + 4];
    if (progress > maxProgress) maxProgress = progress;
    if (i === 0) continue;
    const dx = s[i * GHOST_STRIDE] - s[(i - 1) * GHOST_STRIDE];
    const dy = s[i * GHOST_STRIDE + 1] - s[(i - 1) * GHOST_STRIDE + 1];
    const dz = s[i * GHOST_STRIDE + 2] - s[(i - 1) * GHOST_STRIDE + 2];
    if (Math.hypot(dx, dy, dz) > GHOST_MAX_STEP_M && ++jumps > GHOST_MAX_JUMPS) return false;
  }
  return maxProgress >= GHOST_MIN_FINAL_PROGRESS;
}

/** ゴーストの形式を検証し、正規化したコピーを返す。不正なら null。 */
export function validateGhost(raw: unknown, timeMs: number): GhostTrace | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  if (g.v !== 1 || g.kind !== 'player') return null;
  if (!Array.isArray(g.s) || g.s.length < GHOST_STRIDE * 2 || g.s.length % GHOST_STRIDE !== 0) return null;
  if (g.s.length > GHOST_STRIDE * GHOST_MAX_SAMPLES) return null;
  for (const n of g.s) if (typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > 1e6) return null;
  // 軌跡の長さは、記録したタイムと(おおよそ)一致するはず
  const traceMs = (g.s.length / GHOST_STRIDE - 1) * GHOST_SAMPLE_MS;
  if (Math.abs(traceMs - timeMs) > 2000) return null;
  if (!ghostIsPlausible(g.s as number[])) return null;
  return {
    v: 1,
    timeMs,
    carName: sanitizeLeaderboardExtra(g.carName) ?? '',
    date: typeof g.date === 'string' ? g.date.slice(0, 10) : '',
    kind: 'player',
    s: g.s as number[],
  };
}

/** スコアの妥当な範囲。タイム(asc)は1秒〜1時間、点数は1〜10億。 */
function scoreInRange(def: GameLeaderboardDef, score: number, variant?: string): boolean {
  if (!Number.isFinite(score)) return false;
  const v = def.variants?.find((x) => x.id === variant);
  const [lo, hi] = def.scoreOrder === 'asc' ? [1000, 3_600_000] : [1, 1_000_000_000];
  const min = Math.max(lo, def.minScore ?? lo, v?.minScore ?? lo);
  const max = Math.min(hi, def.maxScore ?? hi, v?.maxScore ?? hi);
  return score >= min && score <= max;
}

/** 通信の遅れ・端末の時計のずれの余裕(ms)。タイムアタックの申告タイムが、経過時間より長いことを許す幅 */
const ELAPSED_SLACK_MS = 5000;

/**
 * 起動(チケット発行)からの経過時間と、申告スコアが釣り合うか。経過は、サーバーの時計で測った値。
 *   - タイム(asc): 申告タイムより短い間に走り終えることはできない
 *   - 点数(desc): 最短プレイ時間に満たない・1秒あたりの上限(maxScorePerSec)を超える点は出せない
 */
function scorePlausible(def: GameLeaderboardDef, score: number, elapsedMs: number): boolean {
  if (def.scoreOrder === 'asc') return elapsedMs + ELAPSED_SLACK_MS >= score;
  if (def.minRunMs !== undefined && elapsedMs < def.minRunMs) return false;
  if (def.maxScorePerSec !== undefined && score > def.maxScorePerSec * (elapsedMs / 1000 + ELAPSED_SLACK_MS / 1000)) return false;
  return true;
}

/** 予約した匿名名を使わずに放置されたとき、自動で破棄するまでの時間 */
const ANON_RESERVE_TTL_MS = 10 * 60_000;
/** 同時に予約できる数の上限(予約の連打で番号を食い潰されないように) */
const ANON_MAX_RESERVED = 300;
const GUEST_NAME = sanitizeLeaderboardName('');

/** 送られてきたリプレイの参照を、決まった形・範囲のものだけ受け取る */
function parseReplayRef(v: unknown): { id: string; seek: number } | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const { id, seek } = v as { id?: unknown; seek?: unknown };
  if (typeof id !== 'string' || !/^[\w-]{8,64}$/.test(id)) return undefined;
  const s = typeof seek === 'number' && Number.isFinite(seek) ? Math.min(24 * 3600, Math.max(0, seek)) : 0;
  return { id, seek: Math.round(s * 10) / 10 };
}

export class LeaderboardStore {
  private boards = new Map<string, Board>();
  /** 匿名の連番: next=次に新しく使う番号、free=予約が破棄されて空いた番号(小さい順に再利用する) */
  private anon: { next: number; free: number[] } = { next: 0, free: [] };
  /** 予約中の匿名名(メモリだけ。再起動で消えた分は欠番になる) */
  private reserved = new Map<string, { index: number; expires: number }>();
  private file: string | null;

  constructor(file: string | null) {
    this.file = file;
    if (!file) return;
    try {
      const content = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(content);
      const a = data?.anon;
      if (a && Number.isInteger(a.next) && a.next >= 0) {
        const free = Array.isArray(a.free) ? a.free.filter((n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0 && (n as number) < a.next) : [];
        this.anon = { next: a.next, free: [...new Set<number>(free)].sort((x, y) => x - y) };
      }
      for (const [key, b] of Object.entries<Board>(data?.boards ?? {})) {
        const [slug, variant] = parseBoardKey(key);
        if (!this.def(slug, variant) || !b || !Array.isArray(b.entries)) continue;     // 知らない枠・壊れた枠は捨てる
        if ((b.rev ?? 0) !== this.revisionOf(slug, variant)) continue;                 // コースが作り直された枠は破棄する
        const entries = b.entries
          .filter(isStoredEntry)
          .slice(0, LEADERBOARD_MAX_ENTRIES)
          .map((e) => ({ ...e, score: roundScore(e.score) }));   // 手で編集して壊れた行があっても、読み出しで落ちない
        this.boards.set(key, { rev: b.rev ?? 0, entries });
      }
    } catch (e) {
      if (fs.existsSync(file)) {
        const backup = `${file}.corrupted.${Date.now()}.bak`;
        try {
          fs.copyFileSync(file, backup);
          console.error(`[leaderboard] 破損ファイルを退避しました: ${backup}`, (e as Error).message);
        } catch { /* 退避失敗時も続行 */ }
      }
    }
  }

  // ---------- 匿名名 ----------

  private takeAnonIndex(): number {
    const index = this.anon.free.length > 0 ? this.anon.free.shift()! : this.anon.next++;
    this.save();
    return index;
  }

  private freeAnonIndex(index: number): void {
    if (this.anon.free.includes(index)) return;
    this.anon.free.push(index);
    this.anon.free.sort((x, y) => x - y);
    this.save();
  }

  /** 期限切れの予約を破棄する */
  private sweepAnon(): void {
    const now = Date.now();
    for (const [token, r] of this.reserved) {
      if (r.expires <= now) {
        this.reserved.delete(token);
        this.freeAnonIndex(r.index);
      }
    }
  }

  /** 登録ウィンドウを出したときに、匿名名を1つ予約する。上限に達していたら null */
  reserveAnon(): { token: string; name: string } | null {
    this.sweepAnon();
    if (this.reserved.size >= ANON_MAX_RESERVED) return null;
    const index = this.takeAnonIndex();
    const token = crypto.randomUUID();
    this.reserved.set(token, { index, expires: Date.now() + ANON_RESERVE_TTL_MS });
    return { token, name: anonNameFromIndex(index) };
  }

  /** 使われなかった予約を破棄して、その番号を空きに戻す */
  releaseAnon(token: unknown): boolean {
    if (typeof token !== 'string') return false;
    const r = this.reserved.get(token);
    if (!r) return false;
    this.reserved.delete(token);
    this.freeAnonIndex(r.index);
    return true;
  }

  /** その枠の、いまのコースの版(バリアントに revision がなければ 0) */
  private revisionOf(slug: string, variant?: string): number {
    return getLeaderboardDef(slug)?.variants?.find((v) => v.id === variant)?.revision ?? 0;
  }

  /** 実在する枠(スコアありのゲーム、バリアントがあるゲームはそのバリアントだけ)か */
  private def(slug: string, variant?: string): GameLeaderboardDef | null {
    const def = getLeaderboardDef(slug);
    if (!def || !def.hasScore) return null;
    const ids = def.variants?.map((v) => v.id);
    if (ids ? !variant || !ids.includes(variant) : variant) return null;
    return def;
  }

  /** スコアを受け付けるゲームか(バリアントは問わない。プレイチケットの発行先の確認用) */
  hasBoard(slug: string): boolean {
    const def = getLeaderboardDef(slug);
    return !!def && def.hasScore;
  }

  /** すべての枠のキー(ハブの一括取得用) */
  keys(): string[] {
    const keys: string[] = [];
    for (const [slug, def] of Object.entries(GAME_LEADERBOARD_DEFS)) {
      if (!def.hasScore) continue;
      if (def.variants) for (const v of def.variants) keys.push(boardKey(slug, v.id));
      else keys.push(slug);
    }
    return keys;
  }

  /** 公開用の上位リスト(ゴースト本体は含めず、有無だけ hasGhost で示す)。存在しない枠は null。 */
  list(slug: string, variant?: string): LeaderboardEntry[] | null {
    if (!this.def(slug, variant)) return null;
    const board = this.boards.get(boardKey(slug, variant));
    return (board?.entries ?? []).map(({ ghost, origName: _origName, replay: _replay, ...e }) => ({ ...e, hasGhost: !!ghost }));
  }

  all(): Record<string, LeaderboardEntry[]> {
    const out: Record<string, LeaderboardEntry[]> = {};
    for (const key of this.keys()) {
      const [slug, variant] = parseBoardKey(key);
      out[key] = this.list(slug, variant) ?? [];
    }
    return out;
  }

  ghost(slug: string, variant: string, id: string): GhostTrace | null {
    if (!this.def(slug, variant)) return null;
    return this.boards.get(boardKey(slug, variant))?.entries.find((e) => e.id === id)?.ghost ?? null;
  }

  /**
   * 登録する名前を決める。入力した名前が使えるならそれ。空・使えない名前なら、予約しておいた匿名名(なければ新しく採番)。
   * 予約があって別の名前を入力したときは、予約を破棄する。
   */
  private resolveName(input: SubmitInput): string {
    const typed = sanitizeLeaderboardName(input.name);
    const token = typeof input.anonToken === 'string' ? input.anonToken : '';
    const r = this.reserved.get(token);
    const usable = typed !== GUEST_NAME;
    if (r) {
      this.reserved.delete(token);
      if (!usable || typed === anonNameFromIndex(r.index)) return anonNameFromIndex(r.index);
      this.freeAnonIndex(r.index);
      return typed;
    }
    return usable ? typed : anonNameFromIndex(this.takeAnonIndex());
  }

  submit(slug: string, variant: string | undefined, input: SubmitInput, ctx: SubmitContext = {}): SubmitResult {
    const def = this.def(slug, variant);
    if (!def) return { ok: false, error: 'unknown_board' };
    const score = typeof input.score === 'number' && Number.isFinite(input.score) ? roundScore(input.score) : NaN;
    if (!scoreInRange(def, score, variant)) return { ok: false, error: 'bad_score' };
    if (ctx.elapsedMs !== undefined && !scorePlausible(def, score, ctx.elapsedMs)) return { ok: false, error: 'implausible_score' };

    const key = boardKey(slug, variant);
    const board = this.boards.get(key) ?? { rev: this.revisionOf(slug, variant), entries: [] };
    const rank = rankForScore(def, board.entries, score);
    if (rank < 0) {
      this.releaseAnon(input.anonToken);                                                   // 圏外なら予約は使わない
      return { ok: true, rank: -1, entries: this.list(slug, variant) ?? [] };              // 圏外は保存しない
    }

    let ghost: GhostTrace | undefined;
    if (input.ghost !== undefined && input.ghost !== null) {
      if (!GHOST_GAMES.has(slug)) return { ok: false, error: 'bad_ghost' };
      const g = validateGhost(input.ghost, score);
      if (!g) { this.releaseAnon(input.anonToken); return { ok: false, error: 'bad_ghost' }; }
      ghost = g;
    }

    const entry: StoredEntry = {
      id: crypto.randomUUID(),
      rank: 0,
      name: this.resolveName(input),
      score,
      formattedScore: def.formatScore(score),
      date: today(),
      extra: sanitizeLeaderboardExtra(input.extra),
      cleared: input.cleared === true ? true : undefined,
      ghost,
      replay: parseReplayRef(input.replay),
    };
    board.entries = insertScore(def, board.entries, entry);
    this.boards.set(key, board);
    this.save();
    return { ok: true, rank: board.entries.findIndex((e) => e.id === entry.id) + 1, entries: this.list(slug, variant) ?? [] };
  }

  /** ランキングに載っている記録が指す、リプレイの id(これ以外のリプレイは消してよい) */
  referencedReplayIds(): Set<string> {
    const ids = new Set<string>();
    for (const b of this.boards.values()) for (const e of b.entries) if (e.replay) ids.add(e.replay.id);
    return ids;
  }

  /** 管理画面用: すべての枠(記録が空の枠も)を、表示名つきで返す。 */
  adminBoards(): { board: string; slug: string; variant?: string; variantLabel?: string; entries: (LeaderboardEntry & { origName?: string; customName?: string })[] }[] {
    return this.keys().map((key) => {
      const [slug, variant] = parseBoardKey(key);
      const variantLabel = getLeaderboardDef(slug)?.variants?.find((v) => v.id === variant)?.label;
      const board = this.boards.get(key);
      const entries = (board?.entries ?? []).map(({ ghost, ...e }) => ({
        ...e,
        hasGhost: !!ghost,
      }));
      return { board: key, slug, variant, variantLabel, entries };
    });
  }

  /**
   * 枠の rank 位(1始まり)の記録に、ロール(「開発者」「テスター」)と任意の名前(漢字・カナ・かな・英数)を設定する・外す。
   * 設定すると名前が「好きな名前（ロール）」になる。外すと元の名前に戻す。
   */
  setRole(slug: string, variant: string | undefined, rank: number, opts: SetRoleOptions): boolean | null {
    if (!this.def(slug, variant)) return null;
    const board = this.boards.get(boardKey(slug, variant));
    const e = board?.entries[rank - 1];
    if (!e || !Number.isInteger(rank)) return null;

    if (!opts.on) {
      if (!e.role && !e.dev) return false;
      e.name = e.origName ?? 'ゲスト';
      delete e.origName;
      delete e.customName;
      delete e.role;
      delete e.dev;
      this.save();
      return true;
    }

    const { name, role } = opts;
    if (!isValidAdminRole(role) || !isValidAdminCustomName(name)) {
      return null;
    }
    const formatted = formatAdminRoleName(name, role);
    if (e.role === role && e.customName === name.trim() && e.name === formatted) {
      return false;
    }

    if (!e.origName) {
      e.origName = e.name;
    }
    e.customName = name.trim();
    e.role = role;
    if (role === '開発者') {
      e.dev = true;
    } else {
      delete e.dev;
    }
    e.name = formatted;
    this.save();
    return true;
  }

  /**
   * 枠の rank 位(1始まり)の記録に、開発者の印を付ける(on=true)・外す(false)。管理用(下位互換)。
   * 付けると名前が DEV_NAME になり、元の名前は残す。外すと元の名前に戻す。変えたら true、すでにその状態なら false、存在しない枠・順位は null。
   */
  setDev(slug: string, variant: string | undefined, rank: number, on: boolean): boolean | null {
    if (!this.def(slug, variant)) return null;
    const e = this.boards.get(boardKey(slug, variant))?.entries[rank - 1];
    if (!e || !Number.isInteger(rank)) return null;
    if (on === (e.dev === true && e.name === DEV_NAME)) return false;
    if (on) {
      if (!e.origName) e.origName = e.name;
      e.name = DEV_NAME;
      e.dev = true;
      e.role = '開発者';
      e.customName = DEV_NAME;
      this.save();
      return true;
    } else {
      e.name = e.origName ?? 'ゲスト';
      delete e.origName;
      delete e.customName;
      delete e.role;
      delete e.dev;
      this.save();
      return true;
    }
  }

  /** 枠の記録(ランキングとゴースト)をすべて消す(管理用: 荒らされたとき)。消した件数。存在しない枠は null。 */
  clearBoard(slug: string, variant?: string): number | null {
    if (!this.def(slug, variant)) return null;
    const board = this.boards.get(boardKey(slug, variant));
    const n = board?.entries.length ?? 0;
    if (board && n > 0) {
      board.entries = [];
      this.save();
    }
    return n;
  }

  /** 枠の rank 位(1始まり)の記録を1件消す(管理用)。消したら true、なければ false、存在しない枠は null。 */
  removeEntry(slug: string, variant: string | undefined, rank: number): boolean | null {
    if (!this.def(slug, variant)) return null;
    const board = this.boards.get(boardKey(slug, variant));
    if (!board || !Number.isInteger(rank) || rank < 1 || rank > board.entries.length) return false;
    board.entries.splice(rank - 1, 1);
    board.entries = board.entries.map((e, i) => ({ ...e, rank: i + 1 }));
    this.save();
    return true;
  }

  /** 変更が続いても書き込みは一定間隔にまとめる(ゴースト込みで数百KBになるため、毎回の同期書き込みで対戦の中継を止めない) */
  private static readonly SAVE_DELAY_MS = 300;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;
  private dirty = false;

  private save(): void {
    if (!this.file) return;
    this.dirty = true;
    if (this.saveTimer || this.writing) return;
    this.saveTimer = setTimeout(() => void this.writeAsync(), LeaderboardStore.SAVE_DELAY_MS);
    this.saveTimer.unref();
  }

  private async writeAsync(): Promise<void> {
    this.saveTimer = null;
    if (!this.file || !this.dirty) return;
    this.writing = true;
    this.dirty = false;
    try {
      const file = this.file;
      await fsp.mkdir(path.dirname(file), { recursive: true });
      const tmp = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify({ boards: Object.fromEntries(this.boards), anon: this.anon }));
      await fsp.rename(tmp, file);
    } catch (e) {
      console.warn('[leaderboard] 保存に失敗しました:', (e as Error).message);
    } finally {
      this.writing = false;
      if (this.dirty && !this.saveTimer) this.save();           // 書いている間に変更があった
    }
  }

  /** 未保存の変更を、いますぐ同期で書き出す(終了時・テスト用)。 */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file || !this.dirty) return;
    this.dirty = false;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${crypto.randomUUID()}.sync.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({ boards: Object.fromEntries(this.boards), anon: this.anon }));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.warn('[leaderboard] 保存に失敗しました:', (e as Error).message);
    }
  }
}
