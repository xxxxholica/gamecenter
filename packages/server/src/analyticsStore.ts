// プレイデータ収集・アナリティクス保存層。
// セッション、ハードウェア、ゲームプレイ(FPS/APM/進行/死因)、エラーログを保持し、集計・JSON出力する。
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { RateWindow } from './limits.ts';

export interface ClientDevice {
  os?: string;
  browser?: string;
  isMobile?: boolean;
  screenWidth?: number;
  screenHeight?: number;
  devicePixelRatio?: number;
  hasGamepad?: boolean;
  gpuRenderer?: string;
  gpuVendor?: string;
  cpuCores?: number;
  deviceMemoryGb?: number;
  gamepadName?: string;
  language?: string;
}

export interface PerformanceMetrics {
  avgFps?: number;
  minFps?: number;
  droppedFrameRate?: number;
  loadDurationMs?: number;
  memoryUsageMb?: number;
}

export interface InputMetrics {
  pauseCount?: number;
  blurCount?: number;
  primaryDevice?: 'keyboard' | 'gamepad' | 'touch';
}

export interface ProgressionMetrics {
  result?: 'clear' | 'gameover';
  mode?: string;
  character?: string;
  vehicle?: string;
  difficulty?: string;
  maxStage?: number | string;
  maxWave?: number;
  deathReason?: string;
  retries?: number;
  maxCombo?: number;
  enemiesDefeated?: number;
  itemsCollected?: number;
  score?: number;
  extraStats?: Record<string, unknown>;
}

export interface ErrorRecord {
  id: string;
  sessionId: string;
  gameId?: string;
  timestamp: string;
  message: string;
  stack?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

export interface SessionData {
  id: string;
  startedAt: string;
  lastActiveAt: string;
  device?: ClientDevice;
  referrer?: string;
  totalPlays: number;
}

/** 1プレイ(iframeを開いてから閉じるまで)の中の1ラウンド(ゲームオーバー/クリア)の記録 */
export interface RoundRecord {
  at: string;
  /** プレイの中で何ラウンド目か */
  round?: number;
  /** ラウンドを始めてから終わるまでの秒 */
  durationSec?: number;
  result?: 'clear' | 'gameover';
  deathReason?: string;
  maxStage?: number | string;
  score?: number;
  mode?: string;
  character?: string;
  vehicle?: string;
  difficulty?: string;
  retries?: number;
  maxCombo?: number;
  extraStats?: Record<string, unknown>;
}

export interface PlayRecord {
  playId: string;
  sessionId: string;
  gameId: string;
  variant?: string;
  startedAt: string;
  endedAt?: string;
  /** 最後にクライアントから何か届いた時刻(終了イベントが届かなかったプレイの目安) */
  lastSeenAt?: string;
  durationSec?: number;
  completed?: boolean;
  score?: number;
  formattedScore?: string;
  rounds?: RoundRecord[];
  hasGhost?: boolean;
  inputDevice?: 'keyboard' | 'gamepad' | 'touch';
  performance?: PerformanceMetrics;
  input?: InputMetrics;
  progression?: ProgressionMetrics;
  /** 起動の様子(ハブで選ぶまでに見ていた秒 hubBrowseSec・その来訪で何本目か nthGame・直接開いたか standalone) */
  launch?: Record<string, unknown>;
  /** 起動からゲームが最初の場面を出すまで(ms) */
  loadMs?: number;
  /** 場面の移り変わり(プレイ開始からの秒 t)。離脱がどこで起きたかを追える */
  timeline?: TimelineEntry[];
  /** 最後に分かっている場面(終了が届かなかったプレイでは、ハートビートの時点) */
  lastPhase?: string;
  /** 閉じた理由: exit=ゲームから戻った / browser_close=ゲーム中にページを離れた / closed=それ以外 */
  exitReason?: string;
  /** 閉じた(離脱した)時点の場面・その場面に入って何秒か・何ラウンド目か・そのラウンドを始めて何秒か */
  exitPhase?: string;
  exitPhaseSec?: number;
  exitRound?: number;
  exitRoundSec?: number;
  /** 操作の記録(リプレイ)の id */
  replayId?: string;
}

/** 場面の移り変わりの1件。kind: phase(場面が変わった)/ round_start / round_end / pause_action / visibility / name_entry_done / title_start / close */
export interface TimelineEntry {
  t: number;
  kind: string;
  phase?: string;
  round?: number;
  detail?: Record<string, unknown>;
}

export interface AnalyticsEvent {
  id: string;
  /** クライアントが付けるID。再送時の重複排除に使う */
  clientEventId?: string;
  sessionId: string;
  type: string;
  gameId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface GameMetrics {
  launchCount: number;
  completeCount: number;
  totalPlayTimeSec: number;
  avgPlayTimeSec: number;
  clearRate: number;
  scoresCount: number;
  avgScore?: number;
  bestScore?: number;
  gamepadCount: number;
  avgFps?: number;
  minFps?: number;
  errorCount: number;
  deathReasons: Record<string, number>;
  characters: Record<string, number>;
  vehicles: Record<string, number>;
  maxStages: Record<string, number>;
  difficulties: Record<string, number>;
  modes: Record<string, number>;
  /** 離脱した場面(閉じた時点の場面。終了が届かなかったプレイは、最後に分かっている場面) */
  exitPhases: Record<string, number>;
  /** 閉じた理由(exit / browser_close / closed、終了が届かなかったものは unknown) */
  exitReasons: Record<string, number>;
  /** 起動から最初の場面までの平均(ms) */
  avgLoadMs?: number;
  /** 食いつき度・エンゲージメント指標 */
  uniquePlayers: number;        // プレイしたユニーク訪問者数
  repeatRate: number;           // 1人あたり平均プレイ回数 (リピート度)
  engagementScore: number;      // 1人あたり平均滞在秒数 (食いつき指数)
}

export interface HardwareShare {
  gpuVendors: Record<string, number>;
  gpuRenderers: Record<string, number>;
  os: Record<string, number>;
  browsers: Record<string, number>;
  screenResolutions: Record<string, number>;
}

export interface AnalyticsSummary {
  totalSessions: number;
  totalPlays: number;
  totalPlayTimeSec: number;
  activeSessionsNow: number;
  gamepadUserRate: number;
  avgFpsOverall: number;
  totalErrors: number;
  hardware: HardwareShare;
  games: Record<string, GameMetrics>;
}

/** 死亡地点(脱落・失敗した場所)。map は図の種類(ステージ・コースなど)、x・y はその図の上の位置 */
export interface DeathPoint {
  at: string;
  playId?: string;
  replayId?: string;
  map: string;
  x: number;
  y: number;
  /** プレイ開始からの秒(リプレイでその少し前から見るため)と、何ラウンド目か */
  t?: number;
  round?: number;
  cause?: string;
}

export interface SpatialData {
  deaths: DeathPoint[];
}

export interface AnalyticsDataPayload {
  sessions: SessionData[];
  plays: PlayRecord[];
  events: AnalyticsEvent[];
  errors: ErrorRecord[];
  /** ゲームごとの死亡地点 */
  spatial?: Record<string, SpatialData>;
  updatedAt: string;
}

const MAX_SESSIONS = 2000;
const MAX_PLAYS = 10000;
const MAX_EVENTS = 20000;
const MAX_ERRORS = 1000;
const MAX_ROUNDS_PER_PLAY = 100;
const MAX_TIMELINE_PER_PLAY = 200;
/** ゲームごとに残す死亡地点の数(古いものから捨てる) */
const MAX_DEATHS_PER_GAME = 5000;
/** 死亡地点を保持するゲームの枠の上限(ランダムな gameId を大量に送られて Map が無制限に増えるのを防ぐ) */
const MAX_SPATIAL_GAMES = 32;
/** 本番のゲームID(ランダムな gameId で押し出されないよう保護する) */
const KNOWN_SPATIAL_GAMES = new Set([
  'street-b-boy', 'falldown', 'school-corridor-runner', 'tower-stack', 'tani-runner-124', 'midnight-skyway',
  'cyber-fighter', 'cyber-2d-fighter-3d', 'skyway', 'time-attack', 'tani-runner', 'super-golf', 'super-golf-3d',
]);
/** 再送で同じイベントが重複して届いても二重に数えないための、直近の clientEventId の保持数 */
const MAX_SEEN_EVENT_IDS = 20000;
const SAVE_DEBOUNCE_MS = 600;

/** 公開エンドポイントから届く値の上限。メモリ(MemoryMax=256M)と保存ファイルが、細工した巨大な本文で膨らまないようにする。 */
const MAX_STR_LEN = 1000;
const MAX_KEYS = 60;
const MAX_ARRAY = 100;
const MAX_DEPTH = 5;
const MAX_NODES = 300;
/** 1イベントの data を JSON にしたときの上限(バイト)。実際に送られる内容(FPS・入力・進行)は数KBに収まる。超えたら data は捨てる */
const MAX_EVENT_DATA_BYTES = 6_000;
/** イベントログ全体の上限(バイト)。件数(MAX_EVENTS)だけだと、1件を大きくして溜められてしまう。超えたら古い順に捨てる */
const MAX_EVENT_BYTES = 12 * 1024 * 1024;
/** 1プレイの記録(JSON)の上限(バイト)。更新のたびにキーが増えて膨らむのを抑える */
const MAX_PLAY_BYTES = 16_000;
/** 1つの IP が1分に作れる新しいセッションの数(会場の共有NATでも、来場者が1分にこれだけ増えることはない) */
const NEW_SESSIONS_PER_MIN = 60;
/** スコア・プレイ時間として受け付ける上限(ランキング側の汎用上限と同じ) */
const MAX_SCORE = 1_000_000_000;
const MAX_DURATION_SEC = 24 * 60 * 60;
/** 端末情報として受け付けるキー(これ以外は捨てる。セッションに無限にキーが増えないように) */
const DEVICE_STRING_KEYS = ['os', 'browser', 'gpuRenderer', 'gpuVendor', 'gamepadName', 'language'] as const;
const DEVICE_NUMBER_KEYS = ['screenWidth', 'screenHeight', 'devicePixelRatio', 'cpuCores', 'deviceMemoryGb'] as const;
const DEVICE_BOOL_KEYS = ['isMobile', 'hasGamepad'] as const;

/** 届いた端末情報から、決まったキー・型の値だけを取り出す。 */
export function sanitizeDevice(raw: unknown): ClientDevice | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const r = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of DEVICE_STRING_KEYS) if (typeof r[k] === 'string') out[k] = (r[k] as string).slice(0, 120);
  for (const k of DEVICE_NUMBER_KEYS) if (typeof r[k] === 'number' && Number.isFinite(r[k])) out[k] = r[k];
  for (const k of DEVICE_BOOL_KEYS) if (typeof r[k] === 'boolean') out[k] = r[k];
  return out as ClientDevice;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function launchInfo(data: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of LAUNCH_INFO_KEYS) if (data[k] !== undefined) out[k] = data[k];
  return Object.keys(out).length > 0 ? out : undefined;
}

/** ゲームidとして受け付ける形(ハブの slug と同じ)。 */
const GAME_ID_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;

/** 届いた JSON 値を、深さ・個数・文字数を抑えて複製する(`__proto__` などの危険なキーも落とす)。 */
export function sanitizeJson(v: unknown, budget = { n: MAX_NODES }, depth = 0): unknown {
  if (budget.n-- <= 0) return undefined;
  if (typeof v === 'string') return v.length > MAX_STR_LEN ? v.slice(0, MAX_STR_LEN) : v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'boolean' || v === null) return v;
  if (depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(v)) return v.slice(0, MAX_ARRAY).map((x) => sanitizeJson(x, budget, depth + 1));
  if (typeof v === 'object') {
    const out: Record<string, unknown> = {};
    let n = 0;
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
      if (n++ >= MAX_KEYS) break;
      out[k.length > 64 ? k.slice(0, 64) : k] = sanitizeJson(x, budget, depth + 1);
    }
    return out;
  }
  return undefined;
}

/** プレイの場面の移り変わり(timeline)に積むだけのイベント種別 */
const TIMELINE_TYPES = ['phase_change', 'round_start', 'pause_action', 'visibility', 'name_entry_done', 'title_start', 'menu_select', 'menu_back'];
/** 起動イベントの data のうち、起動の様子として残すキー */
const LAUNCH_INFO_KEYS = ['hubBrowseSec', 'nthGame', 'standalone'];

/** 既存のプレイ記録を更新するイベント種別 */
const PLAY_UPDATE_TYPES = new Set(['game_close', 'game_over', 'game_clear', 'game_heartbeat', 'score_submit', 'progression_update', ...TIMELINE_TYPES]);
/** プレイの記録としては扱わないイベント種別。これ以外で playId の付いたもの(ゲームごとの出来事)は timeline に積む */
const NON_PLAY_TYPES = new Set(['game_launch', 'session_start', 'hub_leave', 'client_error']);
/** 高頻度で大量に発生し、プレイ詳細(timeline/snapshot)側に集約されるため生イベントログ(events配列)には保存しないイベント種別 */
const SKIP_EVENT_LOG_TYPES = new Set(['phase_change', 'game_heartbeat', 'perf_sample', 'trace', 'visibility']);

export class AnalyticsStore {
  private sessions = new Map<string, SessionData>();
  private plays = new Map<string, PlayRecord>();
  private events: AnalyticsEvent[] = [];
  private errors: ErrorRecord[] = [];
  private spatial = new Map<string, SpatialData>();
  private seenEventIds = new Set<string>();
  /** events と同じ並びの、各イベントのおおよその大きさ(バイト)と、その合計 */
  private eventSizes: number[] = [];
  private eventBytes = 0;
  private readonly newSessionRate = new RateWindow(NEW_SESSIONS_PER_MIN, 60_000);
  private sinceSweep = 0;
  private readonly filePath: string | null;
  private saveTimer: NodeJS.Timeout | null = null;
  private dirty = false;

  constructor(filePath: string | null) {
    this.filePath = filePath;
    this.load();
  }

  private load(): void {
    if (!this.filePath) return;
    try {
      if (!fs.existsSync(this.filePath)) return;
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const data = JSON.parse(raw) as Partial<AnalyticsDataPayload>;
      if (Array.isArray(data.sessions)) {
        for (const s of data.sessions) {
          if (s && typeof s.id === 'string') this.sessions.set(s.id, s);
        }
      }
      if (Array.isArray(data.plays)) {
        for (const p of data.plays) {
          if (p && typeof p.playId === 'string') this.plays.set(p.playId, p);
        }
      }
      if (Array.isArray(data.events)) {
        this.events = data.events.filter((e) => e && typeof e.id === 'string').slice(-MAX_EVENTS);
        for (const e of this.events) {
          if (e.clientEventId) this.seenEventIds.add(e.clientEventId);
          const size = (e.data ? JSON.stringify(e.data).length : 0) + 200;
          this.eventSizes.push(size);
          this.eventBytes += size;
        }
        this.trimEvents();
      }
      if (Array.isArray(data.errors)) {
        this.errors = data.errors.filter((e) => e && typeof e.id === 'string').slice(-MAX_ERRORS);
      }
      if (data.spatial && typeof data.spatial === 'object') {
        for (const [gid, sp] of Object.entries(data.spatial)) {
          if (!GAME_ID_RE.test(gid) || !sp) continue;
          if (this.spatial.size >= MAX_SPATIAL_GAMES && !KNOWN_SPATIAL_GAMES.has(gid)) continue;
          this.spatial.set(gid, {
            deaths: Array.isArray(sp.deaths) ? sp.deaths.slice(-MAX_DEATHS_PER_GAME) : [],
          });
        }
      }
    } catch (e) {
      console.warn(`[analytics] load failed (${(e as Error).message}), starting fresh`);
    }
  }

  /** 件数とバイト数の両方の上限に収まるまで、古いイベントから捨てる */
  private trimEvents(): void {
    let drop = Math.max(0, this.events.length - MAX_EVENTS);
    let bytes = this.eventBytes;
    for (let i = 0; i < drop; i++) bytes -= this.eventSizes[i];
    while (bytes > MAX_EVENT_BYTES && drop < this.events.length - 1) bytes -= this.eventSizes[drop++];
    if (drop === 0) return;
    this.events.splice(0, drop);
    this.eventSizes.splice(0, drop);
    this.eventBytes = bytes;
  }

  private requestSave(): void {
    this.dirty = true;
    if (!this.filePath || this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
    this.saveTimer.unref();
  }

  async flush(): Promise<void> {
    if (!this.dirty || !this.filePath) return;
    this.dirty = false;
    const payload: AnalyticsDataPayload = {
      sessions: Array.from(this.sessions.values()).slice(-MAX_SESSIONS),
      plays: Array.from(this.plays.values()).slice(-MAX_PLAYS),
      events: this.events.slice(-MAX_EVENTS),
      errors: this.errors.slice(-MAX_ERRORS),
      spatial: Object.fromEntries(this.spatial),
      updatedAt: new Date().toISOString(),
    };
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      await fsp.writeFile(tmp, JSON.stringify(payload), 'utf8');
      await fsp.rename(tmp, this.filePath);
    } catch (e) {
      this.dirty = true;
      try { await fsp.unlink(tmp); } catch { /* ignore */ }
      console.warn(`[analytics] save failed: ${(e as Error).message}`);
    }
  }

  /** イベントを1件記録し、セッションやプレイデータを自動集約する */
  recordEvent(input: {
    sessionId: string;
    type: string;
    gameId?: string;
    timestamp?: string;
    data?: Record<string, unknown>;
    device?: ClientDevice;
    referrer?: string;
    clientEventId?: string;
    /** 送ってきた端末の IP(ipKey で丸めたもの)。新しいセッションの作りすぎを抑えるのに使う。省略すると制限しない */
    ip?: string;
  }): { ok: boolean; eventId: string; duplicate?: boolean } {
    let cleanData = input.data ? (sanitizeJson(input.data) as Record<string, unknown>) : undefined;
    let dataBytes = 0;
    if (cleanData) {
      dataBytes = JSON.stringify(cleanData).length;
      if (dataBytes > MAX_EVENT_DATA_BYTES) { cleanData = undefined; dataBytes = 0; }     // 大きすぎる data は捨てる(イベント自体は記録する)
    }
    input = {
      ...input,
      gameId: typeof input.gameId === 'string' && GAME_ID_RE.test(input.gameId) ? input.gameId : undefined,
      data: cleanData,
      device: sanitizeDevice(input.device),
      referrer: typeof input.referrer === 'string' ? input.referrer.slice(0, 500) : undefined,
    };
    const clientEventId = typeof input.clientEventId === 'string' && input.clientEventId.length <= 80 ? input.clientEventId : undefined;
    if (clientEventId && this.seenEventIds.has(clientEventId)) return { ok: true, eventId: clientEventId, duplicate: true };
    if (clientEventId) {
      this.seenEventIds.add(clientEventId);
      if (this.seenEventIds.size > MAX_SEEN_EVENT_IDS) {
        const oldest = this.seenEventIds.values().next().value;
        if (oldest) this.seenEventIds.delete(oldest);
      }
    }
    const parsedTs = input.timestamp ? new Date(input.timestamp).getTime() : NaN;
    // 時計のずれた端末の未来時刻でセッションが「アクティブ」のまま固まらないよう、先の時刻は受信時刻に丸める
    const nowIso = Number.isFinite(parsedTs) && parsedTs <= Date.now() + 60_000 ? new Date(parsedTs).toISOString() : new Date().toISOString();
    const eventId = crypto.randomUUID();
    const sessionId = String(input.sessionId || '').trim().slice(0, 80) || crypto.randomUUID();

    // 1. セッションの取得・更新
    let session = this.sessions.get(sessionId);
    if (!session) {
      // 新しいセッションの作りすぎ(正規のセッションを押し出す荒らし)は受けない
      if (input.ip !== undefined && !this.newSessionRate.hit(input.ip)) return { ok: false, eventId: '' };
      if (++this.sinceSweep >= 1000) { this.sinceSweep = 0; this.newSessionRate.sweep(); }
      session = {
        id: sessionId,
        startedAt: nowIso,
        lastActiveAt: nowIso,
        device: input.device,
        referrer: input.referrer,
        totalPlays: 0,
      };
      this.sessions.set(sessionId, session);
      if (this.sessions.size > MAX_SESSIONS) {
        const oldestKey = this.sessions.keys().next().value;
        if (oldestKey) this.sessions.delete(oldestKey);
      }
    } else {
      session.lastActiveAt = nowIso;
      if (input.device) {
        session.device = { ...session.device, ...input.device };      // sanitizeDevice 済みのキーだけなので、増え続けない
      }
    }

    // 2. イベントログ追加(高頻度の中間通知は timeline / snapshot 側に集約し、events 配列への重複蓄積をスキップ)
    if (!SKIP_EVENT_LOG_TYPES.has(input.type)) {
      const ev: AnalyticsEvent = {
        id: eventId,
        clientEventId,
        sessionId,
        type: String(input.type || 'unknown'),
        gameId: input.gameId ? String(input.gameId) : undefined,
        timestamp: nowIso,
        data: input.data && typeof input.data === 'object' ? input.data : undefined,
      };
      this.events.push(ev);
      this.eventSizes.push(dataBytes + 200);
      this.eventBytes += dataBytes + 200;
      this.trimEvents();
    }

    // 3. クライアントエラーの記録
    if (input.type === 'client_error' && input.data) {
      const errRecord: ErrorRecord = {
        id: crypto.randomUUID(),
        sessionId,
        gameId: input.gameId,
        timestamp: nowIso,
        message: String(input.data.message || 'unknown error'),
        stack: input.data.stack ? String(input.data.stack) : undefined,
        filename: input.data.filename ? String(input.data.filename) : undefined,
        lineno: typeof input.data.lineno === 'number' ? input.data.lineno : undefined,
        colno: typeof input.data.colno === 'number' ? input.data.colno : undefined,
      };
      this.errors.push(errRecord);
      if (this.errors.length > MAX_ERRORS) {
        this.errors.splice(0, this.errors.length - MAX_ERRORS);
      }
    }

    // 3.5 死亡地点(ゲームごとに別に溜める。プレイの記録の大きさの上限に巻き込まれないように)
    if (input.type === 'death_point' && input.gameId && input.data) this.recordSpatial(input.gameId, input.data, nowIso);

    // 4. ゲームプレイ関連のディープ処理
    const data = input.data;
    const playIdRaw = data?.playId;
    const playId = typeof playIdRaw === 'string' && playIdRaw ? playIdRaw.slice(0, 80) : undefined;
    if (input.type === 'game_launch' && input.gameId) {
      const id = playId || crypto.randomUUID();
      const existing = this.plays.get(id);
      if (existing) {
        // 先に届いた終了/ハートビートで作られた記録に、起動情報を補う(再送で順序が前後しても壊れないように)
        if (new Date(nowIso).getTime() < new Date(existing.startedAt).getTime()) existing.startedAt = nowIso;
        if (data?.variant) existing.variant = String(data.variant);
        if (data?.inputDevice) existing.inputDevice = data.inputDevice as PlayRecord['inputDevice'];
        existing.launch = launchInfo(data);
      } else {
        session.totalPlays++;
        this.addPlay({
          playId: id,
          sessionId,
          gameId: input.gameId,
          variant: data?.variant ? String(data.variant) : undefined,
          startedAt: nowIso,
          inputDevice: data?.inputDevice as PlayRecord['inputDevice'],
          launch: launchInfo(data),
        });
      }
    } else if (playId && input.gameId && (PLAY_UPDATE_TYPES.has(input.type) || !NON_PLAY_TYPES.has(input.type))) {
      // 起動イベントが失われていても、終了・ハートビート・進行更新が届けばプレイ記録を作る
      let play = this.plays.get(playId);
      if (!play) {
        const dur = typeof data?.durationSec === 'number' ? Math.max(0, data.durationSec) : 0;
        session.totalPlays++;
        play = this.addPlay({
          playId,
          sessionId,
          gameId: input.gameId,
          startedAt: new Date(new Date(nowIso).getTime() - dur * 1000).toISOString(),
        });
      }
      this.applyPlayUpdate(play, input.type, data!, nowIso);
    }

    this.requestSave();
    return { ok: true, eventId };
  }

  private recordSpatial(gameId: string, d: Record<string, unknown>, at: string): void {
    const map = typeof d.map === 'string' ? d.map.slice(0, 64) : '';
    if (!map) return;
    const x = num(d.x);
    const y = num(d.y);
    if (x === undefined || y === undefined) return;
    let sp = this.spatial.get(gameId);
    if (!sp) {
      if (this.spatial.size >= MAX_SPATIAL_GAMES) {
        // 本番のゲーム枠は保護し、未知の gameId の古い枠だけを押し出す
        let victim: string | undefined;
        for (const k of this.spatial.keys()) {
          if (!KNOWN_SPATIAL_GAMES.has(k)) { victim = k; break; }
        }
        if (victim) this.spatial.delete(victim);
        else if (!KNOWN_SPATIAL_GAMES.has(gameId)) return;
      }
      this.spatial.set(gameId, (sp = { deaths: [] }));
    }
    const playId = typeof d.playId === 'string' && d.playId ? d.playId.slice(0, 80) : undefined;
    const replayId = playId ? this.plays.get(playId)?.replayId : undefined;
    sp.deaths.push({
      at, playId, map, x, y, t: num(d.t), round: num(d.round),
      ...(typeof d.cause === 'string' ? { cause: d.cause.slice(0, 80) } : {}),
      ...(replayId ? { replayId } : {}),
    });
    if (sp.deaths.length > MAX_DEATHS_PER_GAME) sp.deaths.splice(0, sp.deaths.length - MAX_DEATHS_PER_GAME);
  }

  /** 管理画面の死亡地点マップ用。死亡地点に、そのプレイのリプレイの id を付けて返す(地点が先に届いた時のため、ここで補う) */
  getSpatial(gameId: string): SpatialData {
    const sp = this.spatial.get(gameId) ?? { deaths: [] };
    return {
      deaths: sp.deaths.map((d) => (d.replayId || !d.playId ? d : { ...d, replayId: this.plays.get(d.playId)?.replayId })),
    };
  }

  private pushTimeline(play: PlayRecord, entry: TimelineEntry): void {
    play.timeline = [...(play.timeline ?? []), entry].slice(-MAX_TIMELINE_PER_PLAY);
  }

  private addPlay(play: PlayRecord): PlayRecord {
    this.plays.set(play.playId, play);
    if (this.plays.size > MAX_PLAYS) {
      const oldestPlay = this.plays.keys().next().value;
      if (oldestPlay) this.plays.delete(oldestPlay);
    }
    return play;
  }

  private applyPlayUpdate(play: PlayRecord, type: string, data: Record<string, unknown>, nowIso: string): void {
    play.lastSeenAt = nowIso;
    const t = num(data.t) ?? Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(play.startedAt).getTime()) / 100) / 10);
    const round = num(data.round);
    if (typeof data.loadMs === 'number' && Number.isFinite(data.loadMs) && data.loadMs >= 0 && play.loadMs === undefined) play.loadMs = Math.round(data.loadMs);
    if (typeof data.phase === 'string') play.lastPhase = data.phase.slice(0, 40);
    if (type === 'replay') {
      if (typeof data.replayId === 'string' && /^[\w-]{8,64}$/.test(data.replayId)) play.replayId = data.replayId;
      return;
    }
    if (type === 'trace') return;   // 以前のクライアントが送る道すじ(大きい)は残さない
    if (TIMELINE_TYPES.includes(type) || !PLAY_UPDATE_TYPES.has(type)) {
      const { playId: _p, t: _t, round: _r, phase, detail, loadMs: _l, ...rest } = data;
      // (type は外から来る値なので、長さを抑える)
      const d = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : Object.keys(rest).length > 0 ? rest : undefined;
      this.pushTimeline(play, {
        t,
        kind: type === 'phase_change' ? 'phase' : type.slice(0, 40),
        ...(typeof phase === 'string' ? { phase: phase.slice(0, 40) } : type === 'round_start' ? { phase: 'playing' } : {}),
        ...(round !== undefined ? { round } : {}),
        ...(d ? { detail: d } : {}),
      });
      if (type === 'round_start') play.lastPhase = 'playing';
      this.capPlay(play);
      return;
    }
    if (type === 'game_over' || type === 'game_clear') {
      const r = data.round && typeof data.round === 'object' ? (data.round as Record<string, unknown>) : {};
      this.pushTimeline(play, { t, kind: 'round_end', round: num(r.round), detail: { result: type === 'game_clear' ? 'clear' : 'gameover' } });
    }
    if (type === 'game_close') {
      play.exitReason = typeof data.reason === 'string' ? data.reason.slice(0, 40) : undefined;
      play.exitPhase = typeof data.phase === 'string' ? data.phase.slice(0, 40) : undefined;
      play.exitPhaseSec = num(data.phaseSec);
      play.exitRound = round;
      play.exitRoundSec = num(data.roundSec);
      this.pushTimeline(play, { t, kind: 'close', ...(play.exitPhase ? { phase: play.exitPhase } : {}), detail: { reason: play.exitReason, ...(typeof data.exitVia === 'string' ? { via: data.exitVia } : {}) } });
    }
    const elapsed = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(play.startedAt).getTime()) / 1000));
    if (typeof data.durationSec === 'number' && Number.isFinite(data.durationSec)) {
      // 古い(再送で遅れて届いた)スナップショットで、より長い記録を縮めない
      play.durationSec = Math.min(MAX_DURATION_SEC, Math.max(play.durationSec ?? 0, Math.max(0, data.durationSec)));
    } else if (type !== 'progression_update') {
      play.durationSec = Math.max(play.durationSec ?? 0, elapsed);
    }
    if (type === 'game_close' || type === 'game_over' || type === 'game_clear') {
      if (type !== 'game_over') play.endedAt = nowIso;
    }
    if (type === 'game_clear' || data.completed === true) play.completed = true;
    if (typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0 && data.score <= MAX_SCORE && !(typeof play.score === 'number' && play.score >= data.score)) {
      play.score = data.score;
      if (typeof data.formattedScore === 'string') play.formattedScore = data.formattedScore;
    }
    if (type === 'score_submit' && data.cleared === true) play.completed = true;
    if (data.performance && typeof data.performance === 'object') play.performance = data.performance as PerformanceMetrics;
    if (data.input && typeof data.input === 'object') {
      play.input = data.input as InputMetrics;
      if (!play.inputDevice && typeof play.input.primaryDevice === 'string') play.inputDevice = play.input.primaryDevice;
    }

    // progression_update はデータ直下が進行情報。それ以外は data.progression にまとまっている
    const prog = type === 'progression_update' ? data : data.progression;
    if (prog && typeof prog === 'object') {
      const { playId: _p, ...rest } = prog as Record<string, unknown>;
      play.progression = { ...play.progression, ...(rest as ProgressionMetrics) };
      if (play.progression.result === 'clear') play.completed = true;
    }

    // ゲームオーバー/クリアごとに1ラウンドとして追記する(リトライを重ねても各回の死因が残る)
    if ((type === 'game_over' || type === 'game_clear') && data.round && typeof data.round === 'object') {
      const r = { ...(data.round as Record<string, unknown>), at: nowIso } as RoundRecord;
      if (!r.result) r.result = type === 'game_clear' ? 'clear' : 'gameover';
      if (typeof data.score === 'number' && Number.isFinite(data.score) && data.score >= 0 && data.score <= MAX_SCORE) r.score = data.score;
      else if (typeof r.score !== 'number' || !Number.isFinite(r.score) || r.score < 0 || r.score > MAX_SCORE) delete r.score;
      play.rounds = [...(play.rounds ?? []), r].slice(-MAX_ROUNDS_PER_PLAY);
    }
    this.capPlay(play);
  }

  /** 1プレイの記録が大きくなりすぎたら、自由形式の部分(extraStats・古いラウンド)から削る */
  private capPlay(play: PlayRecord): void {
    if (JSON.stringify(play).length <= MAX_PLAY_BYTES) return;
    if (play.timeline && play.timeline.length > 60) play.timeline = play.timeline.slice(-60);
    if (JSON.stringify(play).length <= MAX_PLAY_BYTES) return;
    if (play.progression) delete play.progression.extraStats;
    if (play.rounds) play.rounds = play.rounds.slice(-10).map(({ extraStats: _x, ...r }) => r);
    if (JSON.stringify(play).length <= MAX_PLAY_BYTES) return;
    delete play.rounds;
    if (JSON.stringify(play).length <= MAX_PLAY_BYTES) return;
    delete play.progression;
    delete play.performance;
    delete play.input;
  }

  /** 集計サマリーを計算して返す */
  getSummary(): AnalyticsSummary {
    const totalSessions = this.sessions.size;
    const totalPlays = this.plays.size;
    let totalPlayTimeSec = 0;

    const now = Date.now();
    const activeThresholdMs = 15 * 60 * 1000;
    let activeSessionsNow = 0;
    let gamepadSessions = 0;

    const hardware: HardwareShare = {
      gpuVendors: {},
      gpuRenderers: {},
      os: {},
      browsers: {},
      screenResolutions: {},
    };

    const countKey = (map: Record<string, number>, key?: string) => {
      if (!key || typeof key !== 'string') return;
      map[key] = (Object.hasOwn(map, key) ? map[key] : 0) + 1;
    };

    for (const s of this.sessions.values()) {
      if (now - new Date(s.lastActiveAt).getTime() <= activeThresholdMs) {
        activeSessionsNow++;
      }
      if (s.device?.hasGamepad) gamepadSessions++;

      if (s.device) {
        countKey(hardware.os, s.device.os);
        countKey(hardware.browsers, s.device.browser);
        countKey(hardware.gpuVendors, s.device.gpuVendor);
        countKey(hardware.gpuRenderers, s.device.gpuRenderer);
        if (s.device.screenWidth && s.device.screenHeight) {
          countKey(hardware.screenResolutions, `${s.device.screenWidth}x${s.device.screenHeight}`);
        }
      }
    }

    // gameId は外から来る値なので、`constructor` などで Object.prototype を書き換えられないようプロトタイプ無しの表にする
    const games: Record<string, GameMetrics> = Object.create(null);
    const acc: Record<string, { fpsSum: number; fpsN: number }> = Object.create(null);
    const scoreSums: Record<string, number> = Object.create(null);
    const loadAcc: Record<string, { sum: number; n: number }> = Object.create(null);
    let totalFpsSum = 0;
    let totalFpsCount = 0;

    for (const p of this.plays.values()) {
      if (!games[p.gameId]) {
        games[p.gameId] = {
          launchCount: 0,
          completeCount: 0,
          totalPlayTimeSec: 0,
          avgPlayTimeSec: 0,
          clearRate: 0,
          scoresCount: 0,
          avgScore: undefined,
          bestScore: undefined,
          gamepadCount: 0,
          avgFps: undefined,
          minFps: undefined,
          errorCount: 0,
          deathReasons: {},
          characters: {},
          vehicles: {},
          maxStages: {},
          difficulties: {},
          modes: {},
          exitPhases: {},
          exitReasons: {},
          avgLoadMs: undefined,
          uniquePlayers: 0,
          repeatRate: 1,
          engagementScore: 0,
        };
      }
      const g = games[p.gameId];
      g.launchCount++;
      countKey(g.exitPhases, p.exitPhase ?? p.lastPhase ?? 'unknown');
      countKey(g.exitReasons, p.exitReason ?? 'unknown');
      if (typeof p.loadMs === 'number') {
        const l = (loadAcc[p.gameId] ??= { sum: 0, n: 0 });
        l.sum += p.loadMs;
        l.n++;
      }
      const dur = p.durationSec ?? 0;
      g.totalPlayTimeSec += dur;
      totalPlayTimeSec += dur;
      if (p.completed) g.completeCount++;
      if (p.inputDevice === 'gamepad') g.gamepadCount++;
      if (typeof p.score === 'number') {
        g.scoresCount++;
        scoreSums[p.gameId] = (scoreSums[p.gameId] ?? 0) + p.score;
        if (g.bestScore === undefined || p.score > g.bestScore) g.bestScore = p.score;
      }

      // パフォーマンス集計(プレイごとの平均を、合計/件数で正しく平均する)
      if (p.performance?.avgFps) {
        totalFpsSum += p.performance.avgFps;
        totalFpsCount++;
        const a = (acc[p.gameId] ??= { fpsSum: 0, fpsN: 0 });
        a.fpsSum += p.performance.avgFps;
        a.fpsN++;
        if (p.performance.minFps) {
          g.minFps = g.minFps ? Math.min(g.minFps, p.performance.minFps) : p.performance.minFps;
        }
      }

      // 進行・死因集計(ラウンド記録があれば各回の死因を数え、なければプレイ全体の最終値)
      if (p.progression) {
        countKey(g.characters, p.progression.character);
        countKey(g.vehicles, p.progression.vehicle);
        countKey(g.difficulties, p.progression.difficulty);
        countKey(g.modes, p.progression.mode);
        if (p.progression.maxStage !== undefined) {
          countKey(g.maxStages, String(p.progression.maxStage));
        }
      }
      if (p.rounds && p.rounds.length > 0) {
        for (const r of p.rounds) countKey(g.deathReasons, r.deathReason);
      } else if (p.progression) {
        countKey(g.deathReasons, p.progression.deathReason);
      }
    }

    for (const [gid, a] of Object.entries(acc)) {
      const g = games[gid];
      if (a.fpsN > 0) g.avgFps = Math.round((a.fpsSum / a.fpsN) * 10) / 10;
    }
    for (const [gid, l] of Object.entries(loadAcc)) games[gid].avgLoadMs = Math.round(l.sum / l.n);
    for (const [gid, sum] of Object.entries(scoreSums)) {
      if (games[gid].scoresCount > 0) games[gid].avgScore = Math.round(sum / games[gid].scoresCount);
    }

    // ユニーク訪問者数と食いつき度(リピート率・滞在時間)の算出
    const gameSessionsMap = new Map<string, Set<string>>();
    for (const p of this.plays.values()) {
      if (!gameSessionsMap.has(p.gameId)) gameSessionsMap.set(p.gameId, new Set());
      gameSessionsMap.get(p.gameId)!.add(p.sessionId);
    }

    for (const [gid, g] of Object.entries(games)) {
      const unique = gameSessionsMap.get(gid)?.size || 1;
      g.uniquePlayers = unique;
      g.repeatRate = Math.round((g.launchCount / unique) * 10) / 10;
      g.engagementScore = Math.round(g.totalPlayTimeSec / unique);
    }

    // エラー集計
    for (const err of this.errors) {
      if (err.gameId && games[err.gameId]) {
        games[err.gameId].errorCount++;
      }
    }

    for (const g of Object.values(games)) {
      if (g.launchCount > 0) {
        g.avgPlayTimeSec = Math.round((g.totalPlayTimeSec / g.launchCount) * 10) / 10;
        g.clearRate = Math.round((g.completeCount / g.launchCount) * 100) / 100;
      }
    }

    return {
      totalSessions,
      totalPlays,
      totalPlayTimeSec,
      activeSessionsNow,
      gamepadUserRate: totalSessions > 0 ? Math.round((gamepadSessions / totalSessions) * 100) / 100 : 0,
      avgFpsOverall: totalFpsCount > 0 ? Math.round((totalFpsSum / totalFpsCount) * 10) / 10 : 60,
      totalErrors: this.errors.length,
      hardware,
      games,
    };
  }

  /** 項目ごとにJSON形式でエクスポートする。gameId 指定時はそのゲームに絞り込む */
  export(type: string, gameId?: string): object {
    const exportedAt = new Date().toISOString();
    let playsList = Array.from(this.plays.values());
    let eventsList = this.events;
    let errorsList = this.errors;

    if (gameId) {
      playsList = playsList.filter((p) => p.gameId === gameId);
      eventsList = eventsList.filter((e) => e.gameId === gameId);
      errorsList = errorsList.filter((e) => e.gameId === gameId);
    }

    const relevantSessionIds = new Set(playsList.map((p) => p.sessionId));
    const sessionsList = Array.from(this.sessions.values()).filter(
      (s) => !gameId || relevantSessionIds.has(s.id),
    );

    const summary = this.getSummary();
    const gameMetrics = gameId ? summary.games[gameId] : undefined;

    if (type === 'summary') {
      return {
        exportedAt,
        type: 'summary',
        ...(gameId ? { gameId, gameMetrics: gameMetrics ?? null } : { summary }),
      };
    }
    if (type === 'hardware') {
      return {
        exportedAt,
        type: 'hardware',
        ...(gameId ? { gameId } : {}),
        summary: summary.hardware,
        devices: sessionsList.map((s) => ({ sessionId: s.id, startedAt: s.startedAt, device: s.device })),
      };
    }
    if (type === 'performance') {
      return {
        exportedAt,
        type: 'performance',
        ...(gameId ? { gameId } : {}),
        playsPerformance: playsList
          .filter((p) => p.performance)
          .map((p) => ({
            playId: p.playId,
            sessionId: p.sessionId,
            gameId: p.gameId,
            durationSec: p.durationSec,
            performance: p.performance,
          })),
      };
    }
    if (type === 'progression') {
      return {
        exportedAt,
        type: 'progression',
        ...(gameId ? { gameId } : {}),
        playsProgression: playsList
          .filter((p) => p.progression)
          .map((p) => ({
            playId: p.playId,
            sessionId: p.sessionId,
            gameId: p.gameId,
            completed: p.completed,
            score: p.score,
            progression: p.progression,
          })),
      };
    }
    if (type === 'input') {
      return {
        exportedAt,
        type: 'input',
        ...(gameId ? { gameId } : {}),
        playsInput: playsList
          .filter((p) => p.input)
          .map((p) => ({
            playId: p.playId,
            sessionId: p.sessionId,
            gameId: p.gameId,
            inputDevice: p.inputDevice,
            input: p.input,
          })),
      };
    }
    if (type === 'errors') {
      return {
        exportedAt,
        type: 'errors',
        ...(gameId ? { gameId } : {}),
        count: errorsList.length,
        errors: errorsList,
      };
    }
    if (type === 'sessions') {
      return {
        exportedAt,
        type: 'sessions',
        ...(gameId ? { gameId } : {}),
        count: sessionsList.length,
        sessions: sessionsList,
      };
    }
    if (type === 'plays') {
      return {
        exportedAt,
        type: 'plays',
        ...(gameId ? { gameId } : {}),
        count: playsList.length,
        plays: playsList,
      };
    }
    if (type === 'events') {
      return {
        exportedAt,
        type: 'events',
        ...(gameId ? { gameId } : {}),
        count: eventsList.length,
        events: eventsList,
      };
    }

    // all (完全統合)
    return {
      exportedAt,
      type: 'all',
      ...(gameId ? { gameId, gameMetrics: gameMetrics ?? null } : { summary }),
      sessions: sessionsList,
      plays: playsList,
      events: eventsList,
      errors: errorsList,
    };
  }
}
