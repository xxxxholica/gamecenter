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
  // 詳細ハードウェア
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
  extraStats?: Record<string, unknown>;
}

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
  let gamepadHasHaptics = false;
  try {
    if (typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      if (pads) {
        for (const p of pads) {
          if (p) {
            hasGamepad = true;
            gamepadName = p.id;
            if (p.vibrationActuator || (p as any).hapticActuators?.length) gamepadHasHaptics = true;
            break;
          }
        }
      }
    }
  } catch { /* ignore */ }

  // ネットワーク
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  const networkType = conn?.effectiveType ? String(conn.effectiveType) : undefined;
  const downlinkMbps = typeof conn?.downlink === 'number' ? conn.downlink : undefined;
  const rttMs = typeof conn?.rtt === 'number' ? conn.rtt : undefined;

  // オーディオ
  let audioSampleRate: number | undefined = undefined;
  let audioMaxChannels: number | undefined = undefined;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const actx = new AudioCtx();
      audioSampleRate = actx.sampleRate;
      audioMaxChannels = actx.destination?.maxChannelCount;
      void actx.close();
    }
  } catch { /* ignore */ }

  // タイムゾーン & 言語
  let timezone: string | undefined = undefined;
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
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
    networkType,
    downlinkMbps,
    rttMs,
    audioSampleRate,
    audioMaxChannels,
    colorDepth: typeof window.screen !== 'undefined' ? window.screen.colorDepth : undefined,
    touchPoints: navigator.maxTouchPoints,
    gamepadName,
    gamepadHasHaptics,
    timezone,
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
  const timer = setInterval(() => {
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
// 🕹️ 操作・入力 (APM / デバイス) トラッカー
// ==========================================
export class InputTracker {
  private active = false;
  private startTime = 0;
  private keyCount = 0;
  private padCount = 0;
  private touchCount = 0;
  private pauseCount = 0;
  private blurCount = 0;
  private actionTimestamps: number[] = [];
  private peakCount = 0;
  private onKey?: (e: KeyboardEvent) => void;
  private onTouch?: (e: TouchEvent) => void;
  private onBlur?: () => void;
  private padTimer?: ReturnType<typeof setInterval>;
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
    this.startTime = Date.now();
    this.keyCount = 0;
    this.padCount = 0;
    this.touchCount = 0;
    this.pauseCount = 0;
    this.blurCount = 0;
    this.actionTimestamps = [];
    this.peakCount = 0;

    this.onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      this.keyCount++;
      this.recordAction();
      if (e.key === 'p' || e.key === 'P' || e.key === 'Backspace') this.pauseCount++;
    };
    this.onTouch = () => {
      this.touchCount++;
      this.recordAction();
    };
    this.onBlur = () => {
      this.blurCount++;
    };

    window.addEventListener('keydown', this.onKey, { passive: true });
    window.addEventListener('touchstart', this.onTouch, { passive: true });
    window.addEventListener('blur', this.onBlur);

    // ゲームパッドポーリング (変化があったときのみ加算)
    // (毎回配列を作らないよう、前回の押下状態は使い回す。ゲーム中もハブの側で動き続けるため)
    const lastPadButtons: boolean[] = [];
    this.padTimer = setInterval(() => {
      if (!this.active) return;
      try {
        // (50msごと。フレームごとの呼び出しとは重ならないので、共有の読み取りは使わない: Node のテストが拡張子なしの import を解決できない)
        const pad = typeof navigator.getGamepads === 'function' ? navigator.getGamepads()[0] : null;
        if (pad) {
          const buttons = pad.buttons;
          for (let i = 0; i < buttons.length; i++) {
            const pressed = buttons[i].pressed;
            if (pressed && !lastPadButtons[i]) {
              this.padCount++;
              this.recordAction();
            }
            lastPadButtons[i] = pressed;
          }
        }
      } catch { /* ignore */ }
    }, 50);
  }

  private recordAction(): void {
    const now = Date.now();
    this.actionTimestamps.push(now);
    // 直近1分間のみ保持
    while (this.actionTimestamps.length > 0 && now - this.actionTimestamps[0] > 60000) {
      this.actionTimestamps.shift();
    }
    // 直近1分間の操作数の最大値 = ピークAPM
    if (this.actionTimestamps.length > this.peakCount) this.peakCount = this.actionTimestamps.length;
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
    if (this.padTimer) clearInterval(this.padTimer);
    return this.getMetrics();
  }

  getMetrics(): InputMetrics {
    const durMin = Math.max(0.1, (Date.now() - this.startTime) / 60000);
    const total = this.keyCount + this.padCount + this.touchCount;
    const apm = Math.round((total / durMin) * 10) / 10;
    const peakApm = this.peakCount;

    return {
      totalActions: total,
      apm,
      peakApm,
      keyboardActions: this.keyCount,
      gamepadActions: this.padCount,
      touchActions: this.touchCount,
      pauseCount: this.pauseCount,
      blurCount: this.blurCount,
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

  const fps = new FpsTracker();
  fps.start();
  const sample = () => post('perf_sample', { performance: fps.getMetrics() });
  setInterval(() => {
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
export function reportDeepAnalytics(type: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
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
    if (data.result === 'gameover' || data.result === 'clear') sendRoundEnd(data, gameId);
    else scheduleProgressionFlush(gameId);
    return;
  }
  void sendAnalyticsEvent(type, { gameId, data });
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
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let progressionTimer: ReturnType<typeof setTimeout> | undefined;
let lifecycleInstalled = false;
let lastRound: { sig: string; at: number } | null = null;

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
  return {
    playId: activePlay?.playId,
    durationSec: elapsedSec(),
    performance: reportedPerformance ?? activeFpsTracker?.getMetrics(),
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
    if (document.visibilityState === 'hidden') sendHeartbeat(true);
  });
}

function scheduleProgressionFlush(gameId: string | undefined): void {
  if (!activePlay) return;
  if (progressionTimer) clearTimeout(progressionTimer);
  progressionTimer = setTimeout(() => {
    progressionTimer = undefined;
    if (!activePlay) return;
    void sendAnalyticsEvent('progression_update', {
      gameId: gameId ?? activePlay.gameId,
      data: { playId: activePlay.playId, ...activeProgression },
    });
  }, PROGRESSION_FLUSH_DELAY_MS);
}

const ROUND_FIELDS = ['result', 'deathReason', 'maxStage', 'mode', 'character', 'vehicle', 'difficulty', 'retries', 'maxCombo', 'extraStats'] as const;

/** ゲームオーバー/クリアをその場で送る(iframeを閉じる前に離脱されても、各ラウンドの結果が残る) */
function sendRoundEnd(data: Record<string, unknown>, gameId: string | undefined): void {
  const gid = gameId ?? activePlay?.gameId;
  if (!gid) return;
  const round: Record<string, unknown> = {};
  for (const k of ROUND_FIELDS) if (data[k] !== undefined) round[k] = data[k];
  const sig = JSON.stringify(round);
  const now = Date.now();
  if (lastRound && lastRound.sig === sig && now - lastRound.at < ROUND_DEDUPE_MS) return;
  lastRound = { sig, at: now };
  if (progressionTimer) {
    clearTimeout(progressionTimer);
    progressionTimer = undefined;
  }
  const cleared = data.result === 'clear';
  void sendAnalyticsEvent(cleared ? 'game_clear' : 'game_over', {
    gameId: gid,
    data: { ...playSnapshot(), completed: cleared ? true : undefined, round },
  });
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
    },
  });

  if (typeof window !== 'undefined') {
    installLifecycleListeners();
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
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
  if (window.parent !== window) {
    relayFramedTelemetry();
    return;
  }
  const m = /\/games\/([\w-]+)\/?/.exec(window.location.pathname);
  if (!m) return;
  standaloneStarted = true;
  const gameId = m[1];
  standaloneGameId = gameId;
  trackGameLaunch(gameId);
  window.addEventListener('pagehide', () => trackGameClose(gameId, { unload: true }));
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
  },
): void {
  const playId = extra?.playId ?? currentPlayId();
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

  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = undefined;
  if (progressionTimer) clearTimeout(progressionTimer);
  progressionTimer = undefined;
  activePlay = null;
  reportedPerformance = undefined;
  lastRound = null;
  activeFpsTracker = null;
  activeInputTracker = null;
  activeProgression = {};

  void sendAnalyticsEvent('game_close', {
    gameId: closedGameId,
    beacon: extra?.unload === true,
    data: {
      playId,
      durationSec,
      completed: extra?.completed ?? (progression.result === 'clear' ? true : undefined),
      score: extra?.score,
      formattedScore: extra?.formattedScore,
      performance: perf,
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
