// ランキングの保存層。上位5件×(ゲーム/バリアント)を1つのJSONファイルに持つ。件数が少ないので、全体をメモリに置き、
// 変更のたびに一時ファイルへ書いてから rename する(書き込み途中で落ちても壊れない)。
// 検証はここで行う: クライアントの申告は信用しない(名前の正規化・スコア範囲・ゴーストの形式)。
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import {
  GAME_LEADERBOARD_DEFS,
  LEADERBOARD_MAX_ENTRIES,
  DEV_NAME,
  ADMIN_ROLES,
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
}

interface Board {
  /** この記録が作られたときのコースの版(arcadeLeaderboardCore の revision)。いまの版と違えば、起動時に破棄する */
  rev: number;
  entries: StoredEntry[];
}

function isStoredEntry(e: unknown): e is StoredEntry {
  const x = e as StoredEntry | null;
  return !!x && typeof x === 'object' && typeof x.id === 'string' && typeof x.score === 'number' && Number.isFinite(x.score) && typeof x.name === 'string';
}

export type SubmitInput = {
  name?: unknown;
  score?: unknown;
  extra?: unknown;
  cleared?: unknown;
  ghost?: unknown;
};

export type SubmitResult =
  | { ok: true; rank: number; entries: LeaderboardEntry[] }
  | { ok: false; error: 'unknown_board' | 'bad_score' | 'bad_ghost' };

export type SetRoleOptions =
  | { on: false }
  | { on: true; name: string; role: AdminRole };

function today(): string {
  const jst = new Date(Date.now() + 9 * 3600 * 1000);
  return jst.toISOString().split('T')[0].replace(/-/g, '/');
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
  return score >= Math.max(lo, v?.minScore ?? lo) && score <= Math.min(hi, v?.maxScore ?? hi);
}

export class LeaderboardStore {
  private boards = new Map<string, Board>();
  private file: string | null;

  constructor(file: string | null) {
    this.file = file;
    if (!file) return;
    try {
      const content = fs.readFileSync(file, 'utf8');
      const data = JSON.parse(content);
      for (const [key, b] of Object.entries<Board>(data?.boards ?? {})) {
        const [slug, variant] = parseBoardKey(key);
        if (!this.def(slug, variant) || !b || !Array.isArray(b.entries)) continue;     // 知らない枠・壊れた枠は捨てる
        if ((b.rev ?? 0) !== this.revisionOf(slug, variant)) continue;                 // コースが作り直された枠は破棄する
        const entries = b.entries.filter(isStoredEntry).slice(0, LEADERBOARD_MAX_ENTRIES);   // 手で編集して壊れた行があっても、読み出しで落ちない
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
    return (board?.entries ?? []).map(({ ghost, origName: _origName, ...e }) => ({ ...e, hasGhost: !!ghost }));
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

  submit(slug: string, variant: string | undefined, input: SubmitInput): SubmitResult {
    const def = this.def(slug, variant);
    if (!def) return { ok: false, error: 'unknown_board' };
    const score = typeof input.score === 'number' ? input.score : NaN;
    if (!scoreInRange(def, score, variant)) return { ok: false, error: 'bad_score' };

    const key = boardKey(slug, variant);
    const board = this.boards.get(key) ?? { rev: this.revisionOf(slug, variant), entries: [] };
    const rank = rankForScore(def, board.entries, score);
    if (rank < 0) return { ok: true, rank: -1, entries: this.list(slug, variant) ?? [] };   // 圏外は保存しない

    let ghost: GhostTrace | undefined;
    if (input.ghost !== undefined && input.ghost !== null) {
      if (!GHOST_GAMES.has(slug)) return { ok: false, error: 'bad_ghost' };
      const g = validateGhost(input.ghost, score);
      if (!g) return { ok: false, error: 'bad_ghost' };
      ghost = g;
    }

    const entry: StoredEntry = {
      id: crypto.randomUUID(),
      rank: 0,
      name: sanitizeLeaderboardName(input.name),
      score,
      formattedScore: def.formatScore(score),
      date: today(),
      extra: sanitizeLeaderboardExtra(input.extra),
      cleared: input.cleared === true ? true : undefined,
      ghost,
    };
    board.entries = insertScore(def, board.entries, entry);
    this.boards.set(key, board);
    this.save();
    return { ok: true, rank: board.entries.findIndex((e) => e.id === entry.id) + 1, entries: this.list(slug, variant) ?? [] };
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
      await fsp.writeFile(tmp, JSON.stringify({ boards: Object.fromEntries(this.boards) }));
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
      fs.writeFileSync(tmp, JSON.stringify({ boards: Object.fromEntries(this.boards) }));
      fs.renameSync(tmp, this.file);
    } catch (e) {
      console.warn('[leaderboard] 保存に失敗しました:', (e as Error).message);
    }
  }
}
