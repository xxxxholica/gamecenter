// 操作の記録(リプレイ)の保存層。ゲームが10秒ごとに送ってくる小分けの記録を、リプレイごとに1つのファイルへ追記する。
// メモリ(MemoryMax=256M)に溜めないよう、中身はディスクに置き、メモリには一覧だけを持つ。
// 件数・合計の大きさの上限を超えたら、ランキングに載っておらず遊び終わって猶予の過ぎたものから消す。それでも足りなければ、新しい記録を断る。
// 書き足せるのは、最初の小分けを送った端末だけ(小分けごとに書き込みの鍵を付ける。サーバーは鍵のハッシュだけを持つ)。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface ReplayInfo {
  id: string;
  game: string;
  createdAt: string;
  updatedAt: string;
  bytes: number;
  chunks: number;
  /** 最後の小分けが届いた(ページを離れる時に送るもの)。届かずに終わったものもある */
  final: boolean;
}

const ID_RE = /^[\w-]{8,64}$/;
/** 書き込みの鍵(ゲームが記録を始める時に作る乱数) */
const KEY_RE = /^[\w-]{16,128}$/;
const KEY_HASH_RE = /"kh":"([0-9a-f]{64})"/;
/** 記録中とみなす間(最後の小分けから)。これより新しい記録は、上限を超えても消さない */
export const REPLAY_LIVE_GRACE_MS = 30 * 60 * 1000;
/** 1つの回線(IP。IPv6 は /64)が同時に持てる、ランキング未掲載の記録の数(会場の共有回線で複数の筐体が遊んでも足りる数) */
const MAX_LIVE_PER_OWNER = Number(process.env.REPLAY_MAX_LIVE_PER_IP) || 200;
/** 上限を超えたあとも、記録中のものの続きは、ここまで受け付ける(上限の何倍か) */
const HARD_LIMIT_RATIO = 1.25;
const GAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
/** 1リプレイの上限(ゲーム側は 8MB で打ち切る) */
const MAX_REPLAY_BYTES = 10 * 1024 * 1024;
/** 1リプレイあたりの小分け(行)の上限(10秒ごとに1回なので、通常のプレイでは数十〜百数十回に収まる) */
const MAX_REPLAY_CHUNKS = 500;

const hashKey = (key: string): string => crypto.createHash('sha256').update(key).digest('hex');
function sameHash(a: string, b: string): boolean {
  return a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
/** 1回に届く小分けの上限(ゲーム側は 60KB 以下に分ける) */
export const MAX_REPLAY_CHUNK_BYTES = 128 * 1024;

/** リプレイのヘッダーから `__proto__` 等の危険なキーを落とし、深さ・キー数・文字数を抑える(storage の 8000 文字上限はそのまま通す) */
function sanitizeHeader(v: unknown, depth = 0): unknown {
  if (typeof v === 'string') return v.length > 8_000 ? v.slice(0, 8_000) : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean' || v === null) return v;
  if (depth >= 4) return undefined;
  if (Array.isArray(v)) return v.slice(0, 100).map((x) => sanitizeHeader(x, depth + 1));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (n++ >= 60) break;
      out[k.length > 80 ? k.slice(0, 80) : k] = sanitizeHeader(x, depth + 1);
    }
    return out;
  }
  return undefined;
}

export class ReplayStore {
  private readonly index = new Map<string, ReplayInfo>();
  /** 書き込みの鍵のハッシュ(一覧には出さない)。無いもの(鍵を付ける前の記録)には書き足せない */
  private readonly keyHashes = new Map<string, string>();
  /** 記録を始めた回線と、回線ごとの記録(メモリだけ。再起動のあとに届いたものから数える) */
  private readonly owners = new Map<string, string>();
  private readonly ownerIds = new Map<string, Set<string>>();
  private totalBytes = 0;
  private readonly dir: string | null;
  private readonly maxTotalBytes: number;
  private readonly maxCount: number;
  /** ランキングに載っている記録が指すリプレイの id(呼ぶたびにランキング全体をなめるので、1回の処理で1度だけ呼ぶ) */
  private readonly referencedIds: () => ReadonlySet<string>;

  constructor(
    dir: string | null,
    maxTotalBytes = Number(process.env.REPLAY_MAX_TOTAL_BYTES) || 500 * 1024 * 1024,
    maxCount = Number(process.env.REPLAY_MAX_COUNT) || 5000,
    referencedIds: () => ReadonlySet<string> = () => new Set(),
  ) {
    this.dir = dir;
    this.maxTotalBytes = maxTotalBytes;
    this.maxCount = maxCount;
    this.referencedIds = referencedIds;
    this.load();
  }

  private file(id: string): string {
    return path.join(this.dir!, `${id}.jsonl`);
  }

  private load(): void {
    if (!this.dir) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      for (const name of fs.readdirSync(this.dir)) {
        if (!name.endsWith('.jsonl')) continue;
        const id = name.slice(0, -6);
        if (!ID_RE.test(id)) continue;
        const st = fs.statSync(path.join(this.dir, name));
        // ゲーム名は最初の行だけ読んで取る(全部は読まない)
        let game = 'unknown';
        let final = false;
        try {
          const fd = fs.openSync(path.join(this.dir, name), 'r');
          const buf = Buffer.alloc(4096);
          const n = fs.readSync(fd, buf, 0, buf.length, 0);
          fs.closeSync(fd);
          const head = buf.subarray(0, n).toString('utf8');
          const m = /"game":"([a-z0-9-]+)"/.exec(head);
          if (m) game = m[1];
          const k = KEY_HASH_RE.exec(head);
          if (k) this.keyHashes.set(id, k[1]);
          final = st.size < 200_000 ? fs.readFileSync(path.join(this.dir, name), 'utf8').includes('"final":true') : false;
        } catch { /* 読めなければ unknown のまま */ }
        this.index.set(id, {
          id, game, createdAt: st.birthtime.toISOString(), updatedAt: st.mtime.toISOString(), bytes: st.size, chunks: 0, final,
        });
        this.totalBytes += st.size;
      }
    } catch (e) {
      console.warn(`[replay] load failed: ${(e as Error).message}`);
    }
  }

  /**
   * 小分けの記録を1つ追記する。owner は送ってきた回線(回数の上限を数える単位)。
   * 断る理由: bad_* 形が悪い / forbidden 鍵が違う / too_large 1つの記録が大きすぎる / rate 回線ごとの数の上限 / full 全体の上限
   */
  append(body: Record<string, unknown>, owner?: string, now = Date.now()): { ok: boolean; error?: string } {
    if (!this.dir) return { ok: false, error: 'unavailable' };
    const id = body.id;
    const game = body.game;
    const seq = body.seq;
    const key = body.key;
    if (typeof id !== 'string' || !ID_RE.test(id)) return { ok: false, error: 'bad_id' };
    if (typeof game !== 'string' || !GAME_RE.test(game)) return { ok: false, error: 'bad_game' };
    if (typeof seq !== 'number' || !Number.isInteger(seq) || seq < 0 || seq > 1_000_000) return { ok: false, error: 'bad_seq' };
    if (!Array.isArray(body.tokens)) return { ok: false, error: 'bad_tokens' };
    if (typeof key !== 'string' || !KEY_RE.test(key)) return { ok: false, error: 'bad_key' };
    let info = this.index.get(id);
    if (info) {
      const kh = this.keyHashes.get(id);
      if (!kh || !sameHash(kh, hashKey(key))) return { ok: false, error: 'forbidden' };
      if (info.game !== game) return { ok: false, error: 'bad_game' };
      if (info.chunks >= MAX_REPLAY_CHUNKS) return { ok: false, error: 'too_large' };
      if (info.final && this.referencedIds().has(id)) return { ok: false, error: 'already_final' };
    } else if (owner && this.liveCount(owner) >= MAX_LIVE_PER_OWNER) {
      return { ok: false, error: 'rate' };
    }
    // 鍵のハッシュは最初の行の頭に置く(起動時は各ファイルの頭 4KB だけ読む)
    const line: Record<string, unknown> = { ...(info ? {} : { kh: hashKey(key) }), seq, game, tokens: body.tokens };
    if (seq === 0 && body.header && typeof body.header === 'object' && !Array.isArray(body.header)) {
      line.header = sanitizeHeader(body.header);
    }
    if (body.final === true) line.final = true;
    const text = JSON.stringify(line) + '\n';
    if ((info?.bytes ?? 0) + text.length > MAX_REPLAY_BYTES) return { ok: false, error: 'too_large' };
    // 全体の上限: 遊び終わったものを消しても足りなければ、新しい記録は断り、記録中のものの続きは少し上まで受ける
    if (this.overLimit(info ? 0 : 1, text.length)) {
      this.prune(now, info ? 0 : 1, text.length);
      const ratio = info ? HARD_LIMIT_RATIO : 1;
      if (this.overLimit(info ? 0 : 1, text.length, ratio)) return { ok: false, error: 'full' };
    }
    fs.appendFileSync(this.file(id), text);
    const iso = new Date(now).toISOString();
    if (!info) {
      info = { id, game, createdAt: iso, updatedAt: iso, bytes: 0, chunks: 0, final: false };
      this.index.set(id, info);
      this.keyHashes.set(id, line.kh as string);
      if (owner) {
        this.owners.set(id, owner);
        let ids = this.ownerIds.get(owner);
        if (!ids) this.ownerIds.set(owner, (ids = new Set()));
        ids.add(id);
      }
    }
    info.bytes += text.length;
    info.chunks++;
    info.updatedAt = iso;
    if (body.final === true) info.final = true;
    this.totalBytes += text.length;
    return { ok: true };
  }

  /** 書き込みの鍵が、その記録のものか(ランキングに載せる時に、他人の記録を指していないかを確かめる) */
  verifyKey(id: string, key: unknown): boolean {
    const kh = this.keyHashes.get(id);
    return !!kh && typeof key === 'string' && KEY_RE.test(key) && sameHash(kh, hashKey(key));
  }

  private overLimit(addCount: number, addBytes: number, ratio = 1): boolean {
    return this.totalBytes + addBytes > this.maxTotalBytes * ratio || this.index.size + addCount > this.maxCount * ratio;
  }

  /** その回線が持っている、ランキング未掲載の記録の数 */
  private liveCount(owner: string): number {
    const ids = this.ownerIds.get(owner);
    if (!ids) return 0;
    const refs = this.referencedIds();
    let n = 0;
    for (const id of ids) if (!refs.has(id)) n++;
    return n;
  }

  /**
   * これから足す分(addCount 件・addBytes)が上限に収まるまで、ランキング未掲載で遊び終わって猶予の過ぎたものから、古い順に消す。
   * 記録中のもの(猶予の内)とランキングに載っているものは消さない(大量に送られても、他の人の記録が押し出されないように)
   */
  private prune(now: number, addCount: number, addBytes: number): void {
    // 並べ替えの比較のたびに一覧を作ると、上限を超えたあとの追記1回が数十ms かかり、送り続けられるとサーバーが詰まる
    const refs = this.referencedIds();
    const stale = [...this.index.values()]
      .filter((r) => !refs.has(r.id) && now - new Date(r.updatedAt).getTime() >= REPLAY_LIVE_GRACE_MS)
      .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    for (const r of stale) {
      if (!this.overLimit(addCount, addBytes)) break;
      this.remove(r.id);
    }
  }

  private remove(id: string): void {
    const info = this.index.get(id);
    if (!info) return;
    try { fs.unlinkSync(this.file(id)); } catch { /* もう無い */ }
    this.totalBytes -= info.bytes;
    this.index.delete(id);
    this.keyHashes.delete(id);
    const owner = this.owners.get(id);
    if (owner) {
      this.owners.delete(id);
      const ids = this.ownerIds.get(owner);
      ids?.delete(id);
      if (ids && ids.size === 0) this.ownerIds.delete(owner);
    }
  }

  /**
   * keep に無いリプレイを消す。記録中(最後に届いてから grace 以内)のものは残す(遊び終わってからランキングに載るため)。
   * ランキングに載ったプレイのリプレイだけを残す運用で、定期的に呼ぶ。消した数を返す
   */
  sweepUnreferenced(keep: ReadonlySet<string>, graceMs = REPLAY_LIVE_GRACE_MS, now = Date.now()): number {
    let n = 0;
    for (const r of [...this.index.values()]) {
      if (keep.has(r.id) || now - new Date(r.updatedAt).getTime() < graceMs) continue;
      this.remove(r.id);
      n++;
    }
    return n;
  }

  has(id: string): boolean {
    return this.index.has(id);
  }

  list(game?: string, limit = 200): ReplayInfo[] {
    return [...this.index.values()]
      .filter((r) => !game || r.game === game)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(1, Math.min(2000, limit)));
  }

  /** 小分けを順番に並べ直して、1つの記録にする。無ければ null */
  get(id: string): { header: unknown; tokens: unknown[]; final: boolean; gapAt?: number } | null {
    if (!this.dir || !ID_RE.test(id) || !this.index.has(id)) return null;
    let text: string;
    try { text = fs.readFileSync(this.file(id), 'utf8'); } catch { return null; }
    const chunks = new Map<number, { tokens: unknown[]; header?: unknown; final?: boolean }>();
    for (const l of text.split('\n')) {
      if (!l) continue;
      try {
        const c = JSON.parse(l) as { seq: number; tokens: unknown[]; header?: unknown; final?: boolean };
        if (!chunks.has(c.seq)) chunks.set(c.seq, c);          // 再送で同じ番号が2回届いても1回だけ使う
      } catch { /* 壊れた行は飛ばす */ }
    }
    const ordered = [...chunks.entries()].sort((a, b) => a[0] - b[0]);
    // 途中の小分けが届いていなければ、そこまでで切る(抜けたまま続けると、再生がでたらめになる)
    let gapAt: number | undefined;
    const usable: typeof ordered = [];
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i][0] !== i) { gapAt = i; break; }
      usable.push(ordered[i]);
    }
    const header = usable[0]?.[1].header ?? null;
    return {
      header,
      tokens: usable.flatMap(([, c]) => c.tokens),
      final: gapAt === undefined && usable.some(([, c]) => c.final),
      ...(gapAt !== undefined ? { gapAt } : {}),
    };
  }
}
