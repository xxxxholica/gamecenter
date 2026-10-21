import { getReplayId, getReplayMode, replayCheckpoint, replayRoundStart, replayWasFramed, untrackedClearTimeout, untrackedInterval, untrackedTimeout } from './arcadeReplay.ts';
// (アナリティクスのタイマーは、操作の記録・再生で追わない。送信の都合で作られるもので、ゲームの進み方とは関係がないため)

// クライアント側のアナリティクス・プレイデータ収集ヘルパー。
// 端末ハードウェア詳細、パフォーマンス(FPS/ロード)、操作APM、ゲーム進行・死因を極限までディープに追跡する。

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
  /** 主に使用された入力デバイス */
  primaryDevice?: 'keyboard' | 'gamepad' | 'touch';
}

export interface ProgressionMetrics {
  /** プレイの結末。'clear' ならクリア扱い(完走率に反映)、'gameover' は失敗・終了 */
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
  /** そのラウンドのスコア(ランキングに登録しなくても残す) */
  score?: number;
  extraStats?: Record<string, unknown>;
}

/**
 * ゲームの今の場面。離脱(閉じる・ブラウザ終了)がどの場面で起きたかを残すのに使う。
 * title / menu(キャラ・コース・難易度などの選択) / playing / paused / result / name_entry / lobby(オンラインの待合)
 */
export type PlayPhase = 'title' | 'menu' | 'playing' | 'paused' | 'result' | 'name_entry' | 'lobby';

const PERF_SAMPLE_INTERVAL_MS = 5000;
const API_ENDPOINT = '/api/analytics/event';
const SESSION_STORAGE_KEY = 'gamecenter_session_id';
const SESSION_STARTED_KEY = 'gamecenter_session_started';
const CURRENT_PLAY_KEY = 'gamecenter_current_play_id';
const CURRENT_PLAY_TIME_KEY = 'gamecenter_current_play_start_time';
export const GAME_ANALYTICS_MESSAGE = 'gamecenter:analytics';

let cachedDevice: ClientDevice | null = null;

/** WebGL から GPU 情報を安全に取得 */
function getGpuInfo(): { vendor?: string; renderer?: string } {
  if (typeof document === 'undefined') return {};
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (!gl || !(gl instanceof WebGLRenderingContext)) return {};
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return {};
    }
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    // 読み取り専用に作った使い捨てのコンテキストは、すぐ手放す(ブラウザの WebGL コンテキストの上限は小さく、ゲーム本体のものを奪いかねない)
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return {
      vendor: typeof vendor === 'string' ? vendor : undefined,
      renderer: typeof renderer === 'string' ? renderer : undefined,
    };
  } catch {
    return {};
  }
}

/** クライアント端末の環境＆ハードウェア情報をディープに収集する */
export function detectClientDevice(): ClientDevice {
  if (cachedDevice) return cachedDevice;
  if (typeof window === 'undefined') return {};

  const ua = navigator.userAgent || '';
  let os = 'Unknown';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(ua)) os = 'macOS';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/Linux/i.test(ua)) os = 'Linux';

  let browser = 'Unknown';
  if (/Edg\//i.test(ua)) browser = 'Edge';
  else if (/Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = 'Safari';
  else if (/Firefox\//i.test(ua)) browser = 'Firefox';

  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua) ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) ||
    window.innerWidth <= 820;

  // GPU
  const gpu = getGpuInfo();

  // ゲームパッド
  let hasGamepad = false;
  let gamepadName: string | undefined = undefined;
  try {
    if (typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      if (pads) {
        for (const p of pads) {
          if (p) {
            hasGamepad = true;
            gamepadName = p.id;
            break;
          }
        }
      }
    }
  } catch { /* ignore */ }

  cachedDevice = {
    os,
    browser,
    isMobile,
    screenWidth: typeof window.screen !== 'undefined' ? window.screen.width : undefined,
    screenHeight: typeof window.screen !== 'undefined' ? window.screen.height : undefined,
    devicePixelRatio: typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1,
    hasGamepad,
    gpuRenderer: gpu.renderer,
    gpuVendor: gpu.vendor,
    cpuCores: navigator.hardwareConcurrency,
    deviceMemoryGb: (navigator as any).deviceMemory,
    gamepadName,
    language: navigator.language,
  };

  return cachedDevice;
}

/** 一意のセッションIDを取得 */
export function getSessionId(): string {
  if (typeof window === 'undefined' || !window.sessionStorage) {
    return 'node-sess-' + Math.random().toString(36).slice(2, 10);
  }
  let id = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  if (!id) {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      id = crypto.randomUUID();
    } else {
      id = 'sess-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    }
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  }
  return id;
}

// ==========================================
// 📮 送信キュー(取りこぼし防止)
// ==========================================
// 送信に失敗(オフライン・429・5xx)したイベントは localStorage に残し、あとで再送する。
// 各イベントに eventId を付けるので、再送が重複してもサーバー側で二重には数えない。
const QUEUE_KEY = 'gamecenter_analytics_queue';
const MAX_QUEUE = 300;
const FLUSH_BATCH = 20;
const FLUSH_INTERVAL_MS = 30_000;
const QUEUE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
/** 端末情報は重いので、セッションの最初とゲーム起動のときだけ付ける */
const DEVICE_EVENT_TYPES = new Set(['session_start', 'game_launch']);

interface WireEvent {
  eventId: string;
  sessionId: string;
  type: string;
  gameId?: string;
  timestamp: string;
  data?: Record<string, unknown>;
  device?: ClientDevice;
  referrer?: string;
}

function newId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
}

function readQueue(): WireEvent[] {
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function writeQueue(list: WireEvent[]): void {
  try {
    if (list.length === 0) window.localStorage.removeItem(QUEUE_KEY);
    else window.localStorage.setItem(QUEUE_KEY, JSON.stringify(list.slice(-MAX_QUEUE)));
  } catch { /* 容量超過・プライベートモードなどでは諦める */ }
}

function enqueue(ev: WireEvent): void {
  writeQueue([...readQueue(), ev]);
}

type PostResult = 'ok' | 'drop' | 'retry';

/** イベントを1回送る。ok=届いた / drop=再送しても無駄(不正な内容など) / retry=あとで再送 */
async function postEvents(events: WireEvent[], beacon: boolean): Promise<PostResult> {
  const body = JSON.stringify(events.length === 1 ? events[0] : { events });
  // ページを離れる最中はブラウザが送信を引き受ける sendBeacon を使う(同期で呼ぶので、直後に閉じられても残る)
  if (beacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      if (navigator.sendBeacon(API_ENDPOINT, new Blob([body], { type: 'application/json' }))) return 'ok';
    } catch { /* fetch に切り替える */ }
  }
  try {
    if (typeof fetch !== 'function') return 'retry';
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: body.length < 60_000,
    });
    if (res.ok) return 'ok';
    return res.status === 429 || res.status === 408 || res.status >= 500 ? 'retry' : 'drop';
  } catch (e) {
    console.debug?.('[analytics] send failed:', e);
    return 'retry';
  }
}

let flushing = false;
let flusherInstalled = false;

/** 溜まっている未送信イベントを古い順に送る。失敗したらそこで止めて次の機会に回す */
export async function flushAnalyticsQueue(): Promise<void> {
  if (flushing || typeof window === 'undefined') return;
  flushing = true;
  try {
    for (;;) {
      const now = Date.now();
      const q = readQueue().filter((e) => e && typeof e.eventId === 'string' && now - new Date(e.timestamp).getTime() < QUEUE_MAX_AGE_MS);
      if (q.length === 0) {
        writeQueue([]);
        break;
      }
      const batch = q.slice(0, FLUSH_BATCH);
      if ((await postEvents(batch, false)) === 'retry') break;
      const sent = new Set(batch.map((e) => e.eventId));
      // 送信中に増えた分を落とさないよう、送った分だけ取り除く
      writeQueue(readQueue().filter((e) => !sent.has(e.eventId)));
    }
  } finally {
    flushing = false;
  }
}

function ensureQueueFlusher(): void {
  if (flusherInstalled || typeof window === 'undefined') return;
  flusherInstalled = true;
  window.addEventListener('online', () => void flushAnalyticsQueue());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flushAnalyticsQueue();
  });
  const timer = untrackedInterval(() => {
    if (readQueue().length > 0) void flushAnalyticsQueue();
  }, FLUSH_INTERVAL_MS);
  (timer as { unref?: () => void }).unref?.();
  void flushAnalyticsQueue();
}

/**
 * アナリティクスイベントをサーバーへ送信する。
 * 失敗したら端末に保存して再送する(戻り値は「今回すぐ届いたか」)。
 * beacon: ページを離れる直前に送るとき true。
 */
export async function sendAnalyticsEvent(
  type: string,
  options: {
    gameId?: string;
    data?: Record<string, unknown>;
    device?: ClientDevice;
    beacon?: boolean;
  } = {},
): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (getReplayMode() === 'replay') return false;   // リプレイの再生では送らない

  const ev: WireEvent = {
    eventId: newId('ev'),
    sessionId: getSessionId(),
    type,
    gameId: options.gameId,
    timestamp: new Date().toISOString(),
    data: options.data,
    device: options.device ?? (DEVICE_EVENT_TYPES.has(type) ? detectClientDevice() : undefined),
    referrer: DEVICE_EVENT_TYPES.has(type) && typeof document !== 'undefined' ? document.referrer : undefined,
  };

  ensureQueueFlusher();
  const r = await postEvents([ev], options.beacon === true);
  if (r === 'retry') {
    enqueue(ev);
    return false;
  }
  if (r === 'ok' && readQueue().length > 0) void flushAnalyticsQueue();
  return r === 'ok';
}

/** セッション開始を記録(送信に失敗しても再送キューに残るので、開始済みの印は付けてよい) */
export function initSessionTracking(): void {
  if (typeof window === 'undefined') return;
  ensureQueueFlusher();
  try {
    if (window.sessionStorage.getItem(SESSION_STARTED_KEY)) return;
    window.sessionStorage.setItem(SESSION_STARTED_KEY, '1');
  } catch {
    return;
  }
  void sendAnalyticsEvent('session_start', { device: detectClientDevice() });
}

// ==========================================
// ⚡ パフォーマンス (FPS/ロード) トラッカー
// ==========================================
export class FpsTracker {
  private active = false;
  private rafId = 0;
  private lastTime = 0;
  private frameCount = 0;
  private droppedFrames = 0;
  private frameTimes: number[] = [];
  private startTime = 0;
  private loadDurationMs = 0;
  private activeMs = 0;

  start(loadDurationMs = 0): void {
    if (typeof window === 'undefined' || this.active) return;
    this.active = true;
    this.startTime = performance.now();
    this.lastTime = this.startTime;
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.frameTimes = [];
    this.activeMs = 0;
    this.loadDurationMs = loadDurationMs;

    const loop = (now: number) => {
      if (!this.active) return;
      const delta = now - this.lastTime;
      this.lastTime = now;
      if (delta > 0 && delta < 1000) {
        this.frameCount++;
        this.activeMs += delta;
        this.frameTimes.push(delta);
        if (delta > 33.4) { // 30fps を下回るフレーム遅延をドロップとみなす
          this.droppedFrames++;
        }
        if (this.frameTimes.length > 600) { // 最大10秒分保持
          this.frameTimes.shift();
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): PerformanceMetrics {
    this.active = false;
    if (typeof cancelAnimationFrame === 'function' && this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
    return this.getMetrics();
  }

  getMetrics(): PerformanceMetrics {
    // フレームが連続して来ていた時間だけで平均を出す(非表示・一時停止の間を含めると実際より低く出る)
    const totalDuration = this.activeMs / 1000;
    const avgFps = totalDuration > 0 && this.frameCount > 0 ? Math.round((this.frameCount / totalDuration) * 10) / 10 : 60;

    let minFps = avgFps;
    if (this.frameTimes.length > 0) {
      const sorted = [...this.frameTimes].sort((a, b) => b - a); // 降順 (大きいdelta = 低fps)
      const worstDelta = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.05))]; // 95% tile
      minFps = worstDelta > 0 ? Math.round((1000 / worstDelta) * 10) / 10 : avgFps;
    }

    const droppedFrameRate = this.frameCount > 0 ? Math.round((this.droppedFrames / this.frameCount) * 100) / 100 : 0;
    const memoryMb = (performance as any).memory?.usedJSHeapSize
      ? Math.round(((performance as any).memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10
      : undefined;

    return {
      avgFps: Math.min(144, avgFps),
      minFps: Math.min(144, minFps),
      droppedFrameRate,
      loadDurationMs: this.loadDurationMs,
      memoryUsageMb: memoryMb,
    };
  }
}

// ==========================================
// 🕹️ 操作・入力 (デバイス) トラッカー
// ==========================================
export class InputTracker {
  private active = false;
  private keyCount = 0;
  private padCount = 0;
  private touchCount = 0;
  private padTimer?: number;
  private pauseCount = 0;
  private blurCount = 0;
  private onKey?: (e: KeyboardEvent) => void;
  private onTouch?: (e: TouchEvent) => void;
  private onBlur?: () => void;
  private extraWindows: Window[] = [];

  /** ハブのiframe内のゲームなど、親windowに届かない入力元を追加する(start後に呼ぶ) */
  attachWindow(win: Window): void {
    if (!this.active || !this.onKey || !this.onTouch || !this.onBlur) return;
    try {
      win.addEventListener('keydown', this.onKey, { passive: true });
      win.addEventListener('touchstart', this.onTouch, { passive: true });
      win.addEventListener('blur', this.onBlur);
      this.extraWindows.push(win);
    } catch { /* クロスオリジンなどで触れない場合は無視 */ }
  }

  start(): void {
    if (typeof window === 'undefined' || this.active) return;
    this.active = true;
    this.keyCount = 0;
    this.padCount = 0;
    this.touchCount = 0;
    this.pauseCount = 0;
    this.blurCount = 0;

    this.onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keyCount++;
      if (e.key === 'p' || e.key === 'P' || e.key === 'Backspace') this.pauseCount++;
    };
    this.onTouch = () => {
      this.touchCount++;
    };
    this.onBlur = () => {
      this.blurCount++;
    };

    window.addEventListener('keydown', this.onKey, { passive: true });
    window.addEventListener('touchstart', this.onTouch, { passive: true });
    window.addEventListener('blur', this.onBlur);

    // アケコンのボタンを押した回数(押した瞬間だけ数える)。キーを1回押しただけで「キーボード」にならないよう、回数で比べる
    const prev: boolean[] = [];
    this.padTimer = untrackedInterval(() => {
      if (!this.active || typeof navigator.getGamepads !== 'function') return;
      try {
        const pads = navigator.getGamepads();
        let k = 0;
        for (const pad of pads) {
          if (!pad) continue;
          for (const b of pad.buttons) {
            if (b.pressed && !prev[k]) this.padCount++;
            prev[k++] = b.pressed;
          }
        }
      } catch { /* 読めない環境 */ }
    }, 100);
  }

  stop(): InputMetrics {
    this.active = false;
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    if (this.onTouch) window.removeEventListener('touchstart', this.onTouch);
    if (this.onBlur) window.removeEventListener('blur', this.onBlur);
    for (const win of this.extraWindows) {
      try {
        if (this.onKey) win.removeEventListener('keydown', this.onKey);
        if (this.onTouch) win.removeEventListener('touchstart', this.onTouch);
        if (this.onBlur) win.removeEventListener('blur', this.onBlur);
      } catch { /* ignore */ }
    }
    this.extraWindows = [];
    if (this.padTimer !== undefined) untrackedClearTimeout(this.padTimer);
    this.padTimer = undefined;
    return this.getMetrics();
  }

  getMetrics(): InputMetrics {
    // いちばん多く使われた入力。同じ回数ならアケコンを優先する(筐体ではアケコンが本来の入力)
    const k = this.keyCount, p = this.padCount, t = this.touchCount;
    const primaryDevice: 'keyboard' | 'gamepad' | 'touch' | undefined =
      k + p + t === 0 ? undefined : p >= k && p >= t ? 'gamepad' : k >= t ? 'keyboard' : 'touch';

    return {
      pauseCount: this.pauseCount,
      blurCount: this.blurCount,
      primaryDevice,
    };
  }
}

// ==========================================
// 🛡️ クライアントエラー・クラッシュ自動検知
// ==========================================
function hookWindowErrors(report: (data: Record<string, unknown>) => void): void {
  window.addEventListener('error', (e) => {
    report({
      message: String(e.message || 'Unknown error'),
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack ? String(e.error.stack).slice(0, 500) : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    report({
      message: 'Unhandled Promise Rejection: ' + String(e.reason?.message || e.reason || 'unknown'),
      stack: e.reason?.stack ? String(e.reason.stack).slice(0, 500) : undefined,
    });
  });
}

export function attachGlobalErrorTracker(gameId?: string): void {
  if (typeof window === 'undefined' || (window as any).__analytics_error_hooked) return;
  (window as any).__analytics_error_hooked = true;
  hookWindowErrors((data) => void sendAnalyticsEvent('client_error', { gameId, data }));
}

/**
 * ハブのiframe内のゲームから、親(ハブ)へエラーとFPSを中継する。
 * iframe内のエラーは親windowには届かず、親のrequestAnimationFrameはゲームの描画を測れないため、ゲーム側で拾って渡す。
 */
function relayFramedTelemetry(): void {
  if ((window as any).__analytics_relay_hooked) return;
  (window as any).__analytics_relay_hooked = true;
  const post = (subType: string, data: Record<string, unknown>) => {
    try {
      window.parent.postMessage({ type: GAME_ANALYTICS_MESSAGE, subType, data }, window.location.origin);
    } catch { /* ignore */ }
  };
  hookWindowErrors((data) => post('client_error', data));
  const replayId = getReplayId();
  if (replayId) post('replay', { replayId });

  const fps = new FpsTracker();
  fps.start();
  const sample = () => post('perf_sample', { performance: fps.getMetrics() });
  untrackedInterval(() => {
    if (document.visibilityState === 'visible') sample();
  }, PERF_SAMPLE_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') sample();
  });
}

// ==========================================
// 🎮 ゲーム - ハブ間連携メッセージ
// ==========================================
/** ゲーム側から親ハブへディープアナリティクスイベントを通知。直接開かれている(親がない)場合は自分で記録する */
/** ゲームの側で覚えておく、今の場面(放置されたらハブへ戻す判定に使う。homeReturn.ts) */
let gameSidePhase = 'title';
export function getGamePhase(): string {
  return gameSidePhase;
}

export function reportDeepAnalytics(type: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  if (type === 'phase' && typeof data?.phase === 'string') gameSidePhase = data.phase;
  else if (type === 'round_start') gameSidePhase = 'playing';
  else if (type === 'progression_update' && (data?.result === 'gameover' || data?.result === 'clear')) gameSidePhase = 'result';
  else if (type === 'pause') gameSidePhase = data?.action === 'open' ? 'paused' : data?.action === 'resume' ? 'playing' : gameSidePhase;
  // 操作のリプレイ: 記録では照合点として残し、再生では記録と突き合わせる
  replayCheckpoint(type, data);
  // ベンチマーク有効時は、ゲームの進行(ステージ・ウェーブなど)を計測のマークにして、カクつきがどの場面で起きたか分かるようにする
  (window as unknown as { __gcBenchMark?: (label: string) => void }).__gcBenchMark?.(
    [type, ...['maxStage', 'maxWave', 'mode', 'result'].filter((k) => data?.[k] !== undefined).map((k) => `${k}=${String(data?.[k])}`)].join(' '),
  );
  if (window.parent && window.parent !== window) {
    try {
      window.parent.postMessage({ type: GAME_ANALYTICS_MESSAGE, subType: type, data }, window.location.origin);
    } catch { /* 親に届けられなくても、ゲームは止めない */ }
    return;
  }
  applyDeepAnalytics(type, data, standaloneGameId);
}

/** 今の場面を知らせる。同じ場面・同じ内容が続けて来ても1回として数える。detail には stage・screen などを入れる */
export function reportPhase(phase: PlayPhase, detail?: Record<string, unknown>): void {
  reportDeepAnalytics('phase', { ...detail, phase });
}

/** 1ラウンド(ゲームオーバー/クリアで終わる1回の挑戦)を始めた。やり直し・再挑戦のたびに呼ぶ。detail には stage・mode などを入れる */
let gameRoundNo = 0;
export function reportRoundStart(detail?: Record<string, unknown>): void {
  // リプレイ: ラウンドごとに乱数を作り直す(タイトルのデモなどのずれを、ラウンドへ持ち込まない)
  replayRoundStart(++gameRoundNo);
  reportDeepAnalytics('round_start', detail);
}

/**
 * 死亡地点(脱落・失敗した場所)を知らせる。管理画面の死亡地点マップに点として出る。
 * map: 図の種類(ゲームの中で、同じ座標で描ける単位。ステージ・コースごとに分ける)。x・y: その図の上の位置(ゲームの座標のままでよい)
 */
export function reportDeathPoint(map: string, x: number, y: number, cause?: string, extra?: Record<string, unknown>): void {
  reportDeepAnalytics('death_point', { map, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, ...(cause ? { cause } : {}), ...extra });
}

/** ゲームが自分からホーム(ハブ)へ戻ろうとしている(ポーズの「ゲームを終了」・タイトルで戻る・結果の「ゲームを終了」など) */
export function reportExit(via?: string): void {
  reportDeepAnalytics('exit', via ? { via } : undefined);
}

/**
 * ハブ(受信側)と直接起動(自己記録)で共通の処理。
 * - perf_sample: iframe内のゲームが測ったFPSを保持する(イベントとしては送らない)
 * - progression_update: 進行状況へ反映。ゲームオーバー/クリアはその場で1ラウンドとして送り、それ以外は少し待ってまとめて送る
 * - それ以外: そのままイベントとして送る
 */
export function applyDeepAnalytics(type: string, data: Record<string, unknown> | undefined, gameId: string | undefined): void {
  if (type === 'perf_sample') {
    const perf = data?.performance;
    if (perf && typeof perf === 'object') reportedPerformance = perf as PerformanceMetrics;
    return;
  }
  if (type === 'progression_update') {
    if (!data) return;
    updateGameProgression(data);
    if (data.result === 'gameover' || data.result === 'clear') {
      sendRoundEnd(data, gameId);
      setPhase('result', undefined, gameId);
    } else scheduleProgressionFlush(gameId);
    return;
  }
  if (type === 'phase') {
    const { phase, ...detail } = data ?? {};
    if (typeof phase === 'string') setPhase(phase, Object.keys(detail).length > 0 ? detail : undefined, gameId);
    return;
  }
  if (type === 'round_start') {
    startRound(data, gameId);
    return;
  }
  if (type === 'pause') {
    // 開いた: 場面を paused に。閉じた(再開): 開く前の場面に戻す。やり直し・終了は、そのあとの round_start・exit で分かる
    if (data?.action === 'open') {
      phaseBeforePause = currentPhase;
      setPhase('paused', currentPhase ? { from: currentPhase.name } : undefined, gameId);
    } else if (data?.action === 'resume' && phaseBeforePause) {
      setPhase(phaseBeforePause.name, phaseBeforePause.detail, gameId);
    }
    if (data?.action !== 'open') phaseBeforePause = null;
    if (data?.action === 'restart' || data?.action === 'exit') sendPlayEvent('pause_action', { action: data.action }, gameId);
    return;
  }
  if (type === 'exit') {
    exitRequest = { via: typeof data?.via === 'string' ? data.via : undefined, phase: currentPhase?.name };
    return;
  }
  sendPlayEvent(type, data, gameId);
}

// ==========================================
// ライフサイクルトラッキング
// ==========================================
const HEARTBEAT_INTERVAL_MS = 20_000;
const PROGRESSION_FLUSH_DELAY_MS = 2000;
/** 同じラウンド終了の通知が続けて来ても二重に数えない時間 */
const ROUND_DEDUPE_MS = 1500;

let activeFpsTracker: FpsTracker | null = null;
let activeInputTracker: InputTracker | null = null;
let activeProgression: ProgressionMetrics = {};
let activePlay: { gameId: string; playId: string; startedAt: number } | null = null;
/** iframe内のゲームが測って送ってきたFPS。あればハブ自身の計測より優先する */
let reportedPerformance: PerformanceMetrics | undefined;
let heartbeatTimer: number | undefined;
let progressionTimer: number | undefined;
let lifecycleInstalled = false;
let lastRound: { sig: string; at: number } | null = null;
let lastRoundEndAt: number | undefined;
/** 今の場面と、その場面になった時刻 */
let currentPhase: { name: string; detail?: Record<string, unknown>; at: number } | null = null;
let phaseBeforePause: { name: string; detail?: Record<string, unknown>; at: number } | null = null;
/** このプレイで始めたラウンドの数と、今のラウンドを始めた時刻 */
let roundNo = 0;
let roundStartedAt: number | null = null;
/** 起動から、ゲームが最初の場面(たいていタイトル)を知らせるまで(ロード時間) */
let loadMs: number | undefined;
/** ゲームが自分から戻ろうとした(閉じる理由を「戻った」にする) */
let exitRequest: { via?: string; phase?: string } | null = null;

function resetPlayState(): void {
  currentPhase = null;
  phaseBeforePause = null;
  roundNo = 0;
  roundStartedAt = null;
  loadMs = undefined;
  exitRequest = null;
  lastRoundEndAt = undefined;
}

/** プレイ開始からの秒(0.1秒単位) */
function playTime(): number {
  return activePlay ? Math.round((Date.now() - activePlay.startedAt) / 100) / 10 : 0;
}

/** このプレイに属するイベントを送る(プレイの何秒目か・何ラウンド目かを付ける) */
function sendPlayEvent(type: string, data: Record<string, unknown> | undefined, gameId: string | undefined): void {
  void sendAnalyticsEvent(type, {
    gameId: gameId ?? activePlay?.gameId,
    data: activePlay ? { ...data, playId: activePlay.playId, t: playTime(), round: roundNo } : data,
  });
}

function setPhase(name: string, detail: Record<string, unknown> | undefined, gameId: string | undefined): void {
  if (!activePlay) return;
  if (currentPhase && currentPhase.name === name && JSON.stringify(currentPhase.detail ?? null) === JSON.stringify(detail ?? null)) return;
  const now = Date.now();
  const first = loadMs === undefined;
  if (first) loadMs = now - activePlay.startedAt;
  currentPhase = { name, detail, at: now };
  sendPlayEvent('phase_change', { phase: name, ...(detail ? { detail } : {}), ...(first ? { loadMs } : {}) }, gameId);
}

function startRound(detail: Record<string, unknown> | undefined, gameId: string | undefined): void {
  if (!activePlay) return;
  roundNo++;
  roundStartedAt = Date.now();
  phaseBeforePause = null;
  if (loadMs === undefined) loadMs = roundStartedAt - activePlay.startedAt;
  currentPhase = { name: 'playing', detail, at: roundStartedAt };
  sendPlayEvent('round_start', detail ? { detail } : undefined, gameId);
}

function currentPlayId(): string | undefined {
  if (activePlay) return activePlay.playId;
  try {
    return window.sessionStorage.getItem(CURRENT_PLAY_KEY) || undefined;
  } catch {
    return undefined;
  }
}

function elapsedSec(): number {
  return activePlay ? Math.max(0, Math.round((Date.now() - activePlay.startedAt) / 1000)) : 0;
}

/** 今この瞬間のプレイ状況(ハートビート・ラウンド終了・終了で共通) */
function playSnapshot(): Record<string, unknown> {
  const now = Date.now();
  const perf = reportedPerformance ?? activeFpsTracker?.getMetrics();
  return {
    playId: activePlay?.playId,
    durationSec: elapsedSec(),
    t: playTime(),
    // 今どの場面で、その場面に入って何秒か。何ラウンド目で、そのラウンドを始めて何秒か
    phase: currentPhase?.name,
    phaseDetail: currentPhase?.detail,
    phaseSec: currentPhase ? Math.round((now - currentPhase.at) / 100) / 10 : undefined,
    round: roundNo,
    roundSec: roundStartedAt !== null ? Math.round((now - roundStartedAt) / 100) / 10 : undefined,
    loadMs,
    performance: perf ? { ...perf, loadDurationMs: loadMs ?? perf.loadDurationMs } : undefined,
    input: activeInputTracker?.getMetrics(),
    progression: { ...activeProgression },
  };
}

/** 途中経過を送る。終了イベントが届かなかった(スマホで閉じられた・クラッシュした)プレイも、ここまでの記録は残る */
function sendHeartbeat(unload: boolean): void {
  if (!activePlay) return;
  void sendAnalyticsEvent('game_heartbeat', { gameId: activePlay.gameId, data: playSnapshot(), beacon: unload });
}

function installLifecycleListeners(): void {
  if (lifecycleInstalled || typeof window === 'undefined') return;
  lifecycleInstalled = true;
  // タブを隠す・アプリを切り替える時点で送る。モバイルでは pagehide が来ないまま破棄されることがあるため
  document.addEventListener('visibilitychange', () => {
    if (!activePlay) return;
    sendPlayEvent('visibility', { state: document.visibilityState }, undefined);
    if (document.visibilityState === 'hidden') sendHeartbeat(true);
  });
}

function scheduleProgressionFlush(gameId: string | undefined): void {
  if (!activePlay) return;
  if (progressionTimer) untrackedClearTimeout(progressionTimer);
  progressionTimer = untrackedTimeout(() => {
    progressionTimer = undefined;
    if (!activePlay) return;
    void sendAnalyticsEvent('progression_update', {
      gameId: gameId ?? activePlay.gameId,
      data: { playId: activePlay.playId, ...activeProgression },
    });
  }, PROGRESSION_FLUSH_DELAY_MS);
}

const ROUND_FIELDS = ['result', 'deathReason', 'maxStage', 'mode', 'character', 'vehicle', 'difficulty', 'retries', 'maxCombo', 'enemiesDefeated', 'itemsCollected', 'score', 'extraStats'] as const;

/** ゲームオーバー/クリアをその場で送る(iframeを閉じる前に離脱されても、各ラウンドの結果が残る) */
function sendRoundEnd(data: Record<string, unknown>, gameId: string | undefined): void {
  const gid = gameId ?? activePlay?.gameId;
  if (!gid) return;
  const round: Record<string, unknown> = {};
  for (const k of ROUND_FIELDS) if (data[k] !== undefined) round[k] = data[k];
  const sig = JSON.stringify(round);
  const now = Date.now();
  if (lastRound && lastRound.sig === sig && now - lastRound.at < ROUND_DEDUPE_MS) return;
  if (!activePlay) return;
  lastRound = { sig, at: now };
  if (progressionTimer) {
    untrackedClearTimeout(progressionTimer);
    progressionTimer = undefined;
  }
  // 何ラウンド目か・何秒かかったか(round_start を知らせないゲームでは、プレイ開始・前のラウンドの終わりから数える)
  round.round = roundNo || 1;
  const startedAt = roundStartedAt ?? lastRoundEndAt ?? activePlay?.startedAt;
  if (startedAt !== undefined) round.durationSec = Math.round((now - startedAt) / 100) / 10;
  lastRoundEndAt = now;
  const cleared = data.result === 'clear';
  void sendAnalyticsEvent(cleared ? 'game_clear' : 'game_over', {
    gameId: gid,
    data: { ...playSnapshot(), ...(typeof data.score === 'number' ? { score: data.score } : {}), completed: cleared ? true : undefined, round },
  });
  roundStartedAt = null;
}

/** ゲーム起動を記録 */
export function trackGameLaunch(
  gameId: string,
  variant?: string,
  inputDevice?: 'keyboard' | 'gamepad' | 'touch',
  /**
   * このページ自身で FPS を測るか。ハブがゲームを iframe で開く時は false: 親の rAF はゲームの描画を測れず、
   * 値は iframe 内のゲームが送ってくる(reportedPerformance)ので、親にも毎フレームのループを回すのは無駄(同じスレッドを使うため)。
   */
  measureFps = true,
  /** 起動の様子(ハブで選ぶまでに何秒見ていたか など) */
  launchInfo?: Record<string, unknown>,
): string {
  const playId = newId('play');

  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(CURRENT_PLAY_KEY, playId);
      window.sessionStorage.setItem(CURRENT_PLAY_TIME_KEY, String(Date.now()));
    } catch { /* ignore */ }
  }

  activePlay = { gameId, playId, startedAt: Date.now() };
  activeProgression = {};
  reportedPerformance = undefined;
  lastRound = null;
  resetPlayState();
  activeFpsTracker = null;
  if (measureFps) {
    activeFpsTracker = new FpsTracker();
    activeFpsTracker.start();
  }

  activeInputTracker = new InputTracker();
  activeInputTracker.start();

  attachGlobalErrorTracker(gameId);

  void sendAnalyticsEvent('game_launch', {
    gameId,
    data: {
      playId,
      variant,
      inputDevice,
      ...launchInfo,
    },
  });

  if (typeof window !== 'undefined') {
    installLifecycleListeners();
    if (heartbeatTimer) untrackedClearTimeout(heartbeatTimer);
    heartbeatTimer = untrackedInterval(() => {
      if (document.visibilityState === 'visible') sendHeartbeat(false);
    }, HEARTBEAT_INTERVAL_MS);
  }

  return playId;
}

/** 計測中のプレイに、iframe内ゲームのwindowを入力計測の対象として追加する */
export function attachGameInputSource(win: Window | null | undefined): void {
  if (win) activeInputTracker?.attachWindow(win);
}

let standaloneStarted = false;
let standaloneGameId: string | undefined;

/**
 * ハブを経由せずゲームのURLが直接開かれた場合に、ゲーム自身が起動・終了を記録する。
 * ハブのiframe内(window.parent !== window)ではハブ側が起動・終了を記録するので、ここではエラーとFPSを親へ中継するだけ。
 * ページを離れるとき(pagehide)に終了を送る。
 */
export function startStandaloneTracking(): void {
  if (typeof window === 'undefined' || standaloneStarted) return;
  // リプレイの再生では、記録した時と同じ作り方にする(管理画面の iframe の中で再生しても、直接開いて遊んだ記録なら直接の作り方)
  const framed = replayWasFramed() ?? window.parent !== window;
  if (framed) {
    relayFramedTelemetry();
    return;
  }
  const m = /\/games\/([\w-]+)\/?/.exec(window.location.pathname);
  if (!m) return;
  standaloneStarted = true;
  const gameId = m[1];
  standaloneGameId = gameId;
  trackGameLaunch(gameId, undefined, undefined, true, { standalone: true });
  const replayId = getReplayId();
  if (replayId) applyDeepAnalytics('replay', { replayId }, gameId);
  window.addEventListener('pagehide', () => trackGameClose(gameId, { unload: true, reason: exitRequest ? 'exit' : 'browser_close' }));
}

/** ゲーム内進行・ファネル状態の更新 */
export function updateGameProgression(metrics: Partial<ProgressionMetrics>): void {
  activeProgression = { ...activeProgression, ...metrics };
}

/** ゲーム終了を記録。unload: ページを離れる最中の送信(sendBeacon を使う) */
export function trackGameClose(
  gameId?: string,
  extra?: {
    playId?: string;
    completed?: boolean;
    score?: number;
    formattedScore?: string;
    progression?: ProgressionMetrics;
    unload?: boolean;
    /**
     * 閉じた理由。exit=ゲームが自分から戻った(ポーズ・タイトル・結果の「ゲームを終了」) / browser_close=ゲーム中にページを離れた
     * (ブラウザ・タブを閉じた、再読み込みした) / closed=それ以外。省略時は、ゲームが戻ろうとしていたかで決める
     */
    reason?: 'exit' | 'browser_close' | 'closed';
  },
): void {
  const playId = extra?.playId ?? currentPlayId();
  const snapshot = activePlay ? playSnapshot() : {};
  const reason = extra?.reason ?? (exitRequest ? 'exit' : extra?.unload ? 'browser_close' : 'closed');
  const exitVia = exitRequest?.via;
  let durationSec = elapsedSec();

  if (!activePlay && typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const startMs = Number(window.sessionStorage.getItem(CURRENT_PLAY_TIME_KEY));
      if (Number.isFinite(startMs) && startMs > 0) durationSec = Math.max(0, Math.round((Date.now() - startMs) / 1000));
    } catch { /* ignore */ }
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.removeItem(CURRENT_PLAY_KEY);
      window.sessionStorage.removeItem(CURRENT_PLAY_TIME_KEY);
    } catch { /* ignore */ }
  }

  const perf = reportedPerformance ?? (activeFpsTracker ? activeFpsTracker.stop() : undefined);
  activeFpsTracker?.stop();
  const input = activeInputTracker ? activeInputTracker.stop() : undefined;
  const progression = { ...activeProgression, ...(extra?.progression || {}) };
  const closedGameId = gameId ?? activePlay?.gameId;

  if (heartbeatTimer) untrackedClearTimeout(heartbeatTimer);
  heartbeatTimer = undefined;
  if (progressionTimer) untrackedClearTimeout(progressionTimer);
  progressionTimer = undefined;
  activePlay = null;
  reportedPerformance = undefined;
  lastRound = null;
  activeFpsTracker = null;
  activeInputTracker = null;
  activeProgression = {};
  resetPlayState();

  void sendAnalyticsEvent('game_close', {
    gameId: closedGameId,
    beacon: extra?.unload === true,
    data: {
      ...snapshot,
      playId,
      durationSec,
      reason,
      exitVia,
      completed: extra?.completed ?? (progression.result === 'clear' ? true : undefined),
      score: extra?.score,
      formattedScore: extra?.formattedScore,
      performance: perf && snapshot.loadMs !== undefined ? { ...perf, loadDurationMs: snapshot.loadMs as number } : perf,
      input,
      progression,
    },
  });
}

/** スコア送信イベントを記録 */
export function trackScoreSubmit(
  gameId: string,
  data: {
    score: number;
    formattedScore?: string;
    cleared?: boolean;
    perfect?: boolean;
    playId?: string;
    rank?: number;
    progression?: ProgressionMetrics;
  },
): void {
  void sendAnalyticsEvent('score_submit', {
    gameId,
    data: {
      ...data,
      playId: data.playId ?? currentPlayId(),
      progression: data.progression || activeProgression,
    },
  });
}
