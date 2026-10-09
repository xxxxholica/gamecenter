// プレイデータ収集・アナリティクス保存層。
// セッション、ハードウェア、ゲームプレイ(FPS/APM/進行/死因)、エラーログを保持し、集計・JSON出力する。
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

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
  networkType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  audioSampleRate?: number;
  audioMaxChannels?: number;
  colorDepth?: number;
  touchPoints?: number;
  gamepadName?: string;
  gamepadHasHaptics?: boolean;
  timezone?: string;
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
  totalActions?: number;
  apm?: number;
  peakApm?: number;
  keyboardActions?: number;
  gamepadActions?: number;
  touchActions?: number;
  pauseCount?: number;
  blurCount?: number;
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
  avgApm?: number;
  errorCount: number;
  deathReasons: Record<string, number>;
  characters: Record<string, number>;
  vehicles: Record<string, number>;
  maxStages: Record<string, number>;
  difficulties: Record<string, number>;
  modes: Record<string, number>;
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
  networkTypes: Record<string, number>;
  screenResolutions: Record<string, number>;
}

export interface AnalyticsSummary {
  totalSessions: number;
  totalPlays: number;
  totalPlayTimeSec: number;
  activeSessionsNow: number;
  gamepadUserRate: number;
  avgFpsOverall: number;
  avgApmOverall: number;
  totalErrors: number;
  hardware: HardwareShare;
  games: Record<string, GameMetrics>;
}

export interface AnalyticsDataPayload {
  sessions: SessionData[];
  plays: PlayRecord[];
  events: AnalyticsEvent[];
  errors: ErrorRecord[];
  updatedAt: string;
}

const MAX_SESSIONS = 2000;
const MAX_PLAYS = 10000;
const MAX_EVENTS = 20000;
const MAX_ERRORS = 1000;
const MAX_ROUNDS_PER_PLAY = 100;
/** 再送で同じイベントが重複して届いても二重に数えないための、直近の clientEventId の保持数 */
const MAX_SEEN_EVENT_IDS = 20000;
const SAVE_DEBOUNCE_MS = 600;

/** 既存のプレイ記録を更新するイベント種別 */
const PLAY_UPDATE_TYPES = new Set(['game_close', 'game_over', 'game_clear', 'game_heartbeat', 'score_submit', 'progression_update']);

export class AnalyticsStore {
  private sessions = new Map<string, SessionData>();
  private plays = new Map<string, PlayRecord>();
  private events: AnalyticsEvent[] = [];
  private errors: ErrorRecord[] = [];
  private seenEventIds = new Set<string>();
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
        for (const e of this.events) if (e.clientEventId) this.seenEventIds.add(e.clientEventId);
      }
      if (Array.isArray(data.errors)) {
        this.errors = data.errors.filter((e) => e && typeof e.id === 'string').slice(-MAX_ERRORS);
      }
    } catch (e) {
      console.warn(`[analytics] load failed (${(e as Error).message}), starting fresh`);
    }
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
      updatedAt: new Date().toISOString(),
    };
    const tmp = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fsp.mkdir(path.dirname(this.filePath), { recursive: true });
      await fsp.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8');
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
  }): { ok: boolean; eventId: string; duplicate?: boolean } {
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
    const sessionId = String(input.sessionId || '').trim() || crypto.randomUUID();

    // 1. セッションの取得・更新
    let session = this.sessions.get(sessionId);
    if (!session) {
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
        session.device = { ...session.device, ...input.device };
      }
    }

    // 2. イベントログ追加
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
    if (this.events.length > MAX_EVENTS) {
      this.events.splice(0, this.events.length - MAX_EVENTS);
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

    // 4. ゲームプレイ関連のディープ処理
    const data = input.data;
    const playIdRaw = data?.playId;
    const playId = typeof playIdRaw === 'string' && playIdRaw ? playIdRaw : undefined;
    if (input.type === 'game_launch' && input.gameId) {
      const id = playId || crypto.randomUUID();
      const existing = this.plays.get(id);
      if (existing) {
        // 先に届いた終了/ハートビートで作られた記録に、起動情報を補う(再送で順序が前後しても壊れないように)
        if (new Date(nowIso).getTime() < new Date(existing.startedAt).getTime()) existing.startedAt = nowIso;
        if (data?.variant) existing.variant = String(data.variant);
        if (data?.inputDevice) existing.inputDevice = data.inputDevice as PlayRecord['inputDevice'];
      } else {
        session.totalPlays++;
        this.addPlay({
          playId: id,
          sessionId,
          gameId: input.gameId,
          variant: data?.variant ? String(data.variant) : undefined,
          startedAt: nowIso,
          inputDevice: data?.inputDevice as PlayRecord['inputDevice'],
        });
      }
    } else if (playId && input.gameId && PLAY_UPDATE_TYPES.has(input.type)) {
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
    const elapsed = Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(play.startedAt).getTime()) / 1000));
    if (typeof data.durationSec === 'number' && Number.isFinite(data.durationSec)) {
      // 古い(再送で遅れて届いた)スナップショットで、より長い記録を縮めない
      play.durationSec = Math.max(play.durationSec ?? 0, Math.max(0, data.durationSec));
    } else if (type !== 'progression_update') {
      play.durationSec = Math.max(play.durationSec ?? 0, elapsed);
    }
    if (type === 'game_close' || type === 'game_over' || type === 'game_clear') {
      if (type !== 'game_over') play.endedAt = nowIso;
    }
    if (type === 'game_clear' || data.completed === true) play.completed = true;
    if (typeof data.score === 'number' && !(typeof play.score === 'number' && play.score >= data.score)) {
      play.score = data.score;
      if (typeof data.formattedScore === 'string') play.formattedScore = data.formattedScore;
    }
    if (type === 'score_submit' && data.cleared === true) play.completed = true;
    if (data.performance && typeof data.performance === 'object') play.performance = data.performance as PerformanceMetrics;
    if (data.input && typeof data.input === 'object') play.input = data.input as InputMetrics;

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
      if (typeof data.score === 'number') r.score = data.score;
      play.rounds = [...(play.rounds ?? []), r].slice(-MAX_ROUNDS_PER_PLAY);
    }
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
      networkTypes: {},
      screenResolutions: {},
    };

    const countKey = (map: Record<string, number>, key?: string) => {
      if (!key) return;
      map[key] = (map[key] || 0) + 1;
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
        countKey(hardware.networkTypes, s.device.networkType);
        if (s.device.screenWidth && s.device.screenHeight) {
          countKey(hardware.screenResolutions, `${s.device.screenWidth}x${s.device.screenHeight}`);
        }
      }
    }

    const games: Record<string, GameMetrics> = {};
    const acc: Record<string, { fpsSum: number; fpsN: number; apmSum: number; apmN: number }> = {};
    const scoreSums: Record<string, number> = {};
    let totalFpsSum = 0;
    let totalFpsCount = 0;
    let totalApmSum = 0;
    let totalApmCount = 0;

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
          avgApm: undefined,
          errorCount: 0,
          deathReasons: {},
          characters: {},
          vehicles: {},
          maxStages: {},
          difficulties: {},
          modes: {},
          uniquePlayers: 0,
          repeatRate: 1,
          engagementScore: 0,
        };
      }
      const g = games[p.gameId];
      g.launchCount++;
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
        const a = (acc[p.gameId] ??= { fpsSum: 0, fpsN: 0, apmSum: 0, apmN: 0 });
        a.fpsSum += p.performance.avgFps;
        a.fpsN++;
        if (p.performance.minFps) {
          g.minFps = g.minFps ? Math.min(g.minFps, p.performance.minFps) : p.performance.minFps;
        }
      }

      // 入力・APM集計
      if (p.input?.apm) {
        totalApmSum += p.input.apm;
        totalApmCount++;
        const a = (acc[p.gameId] ??= { fpsSum: 0, fpsN: 0, apmSum: 0, apmN: 0 });
        a.apmSum += p.input.apm;
        a.apmN++;
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
      if (a.apmN > 0) g.avgApm = Math.round((a.apmSum / a.apmN) * 10) / 10;
    }
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
      avgApmOverall: totalApmCount > 0 ? Math.round((totalApmSum / totalApmCount) * 10) / 10 : 0,
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
