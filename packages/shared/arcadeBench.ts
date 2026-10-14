// 全ゲーム共通のベンチマーク計測。URL に ?bench=1 を付けて開くと有効になる(?bench=0 で解除)。
// ゲーム側のコードには触れず、ブラウザの API(requestAnimationFrame / WebGL / PerformanceObserver)の呼び出しを
// 横から計測して、カクつき(スパイク)の1回ごとに「JS・WebGL 呼び出し・GC・待ち」のどれで時間を使ったかを記録する。
//   F8: 結果を JSON で保存 / F9: 計測をリセット / F10: 表示の切り替え
// 使えない API(Firefox の LoAF・performance.memory など)は黙って飛ばす。

import {
  classifyGpu,
  classifySpike,
  isBenchEnabled,
  spikeThresholdMs,
  summarizeFrames,
  type SpikeCause,
} from './arcadeBenchCore';

type AnyFn = (...args: any[]) => any;

type GlCategory = 'compile' | 'upload' | 'sync' | 'draw';

const GL_METHODS: Record<string, GlCategory> = {
  compileShader: 'compile',
  linkProgram: 'compile',
  useProgram: 'compile',
  validateProgram: 'compile',
  getProgramParameter: 'compile',
  getShaderParameter: 'compile',
  getProgramInfoLog: 'compile',
  getShaderInfoLog: 'compile',
  getActiveUniform: 'compile',
  getActiveAttrib: 'compile',
  getUniformLocation: 'compile',
  getAttribLocation: 'compile',
  texImage2D: 'upload',
  texSubImage2D: 'upload',
  texImage3D: 'upload',
  texSubImage3D: 'upload',
  texStorage2D: 'upload',
  texStorage3D: 'upload',
  compressedTexImage2D: 'upload',
  generateMipmap: 'upload',
  bufferData: 'upload',
  bufferSubData: 'upload',
  readPixels: 'sync',
  finish: 'sync',
  clientWaitSync: 'sync',
  drawArrays: 'draw',
  drawElements: 'draw',
  drawArraysInstanced: 'draw',
  drawElementsInstanced: 'draw',
  drawRangeElements: 'draw',
};

const MAX_FRAMES = 400_000;
const MAX_SPIKES = 500;
const MAX_SLOW_CALLS = 200;
const MAX_LOAF = 400;
const SLOW_GL_CALL_MS = 4;

interface FrameAcc {
  jsMs: number;
  glMs: number;
  compileMs: number;
  uploadMs: number;
  draws: number;
  topName: string;
  topMs: number;
}

const newAcc = (): FrameAcc => ({ jsMs: 0, glMs: 0, compileMs: 0, uploadMs: 0, draws: 0, topName: '', topMs: 0 });

interface SpikeRecord {
  tSec: number;
  intervalMs: number;
  cause: SpikeCause;
  jsMs: number;
  glMs: number;
  compileMs: number;
  uploadMs: number;
  heapDropMb: number;
  draws: number;
  slowestGlCall: string;
  slowestGlMs: number;
  lastMark: string;
  loaf?: { durationMs: number; blockingMs: number; script: string };
}

interface TimelineRow {
  tSec: number;
  fps: number;
  maxMs: number;
  avgJsMs: number;
  avgGlMs: number;
  avgDraws: number;
  heapMb?: number;
}

interface LoafRecord {
  start: number;
  durationMs: number;
  blockingMs: number;
  script: string;
}

interface BenchState {
  t0: number;
  lastTs: number;
  /** 直前のフレームから今のフレームまでの間に積んだ内訳(=前のフレームの仕事) */
  acc: FrameAcc;
  intervals: number[];
  spikes: SpikeRecord[];
  slowCalls: { tSec: number; name: string; ms: number }[];
  marks: { tSec: number; label: string }[];
  loaf: LoafRecord[];
  longTasks: { start: number; durationMs: number }[];
  timeline: TimelineRow[];
  bucket: { startTs: number; frames: number; maxMs: number; js: number; gl: number; draws: number };
  causeCounts: Record<string, number>;
  prevHeapMb: number | undefined;
  programsLinked: number;
  texUploads: number;
}

let installed = false;
let state: BenchState;
let overlay: HTMLElement | null = null;
let overlayVisible = true;
let glContext: WebGLRenderingContext | WebGL2RenderingContext | null = null;
let gpuRenderer: string | undefined;
let lastMark = '';
let medianCache = 16.7;

const heapMb = (): number | undefined => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? m.usedJSHeapSize / (1024 * 1024) : undefined;
};

function freshState(now: number): BenchState {
  return {
    t0: now,
    lastTs: 0,
    acc: newAcc(),
    intervals: [],
    spikes: [],
    slowCalls: [],
    marks: [],
    loaf: [],
    longTasks: [],
    timeline: [],
    bucket: { startTs: 0, frames: 0, maxMs: 0, js: 0, gl: 0, draws: 0 },
    causeCounts: {},
    prevHeapMb: undefined,
    programsLinked: 0,
    texUploads: 0,
  };
}

/** 場面の区切りを記録する。スパイクには「直前のマーク」が付くので、どの場面で起きたか分かる。 */
export function benchMark(label: string): void {
  if (!installed) return;
  lastMark = label;
  state.marks.push({ tSec: round((performance.now() - state.t0) / 1000, 2), label });
  if (state.marks.length > 1000) state.marks.shift();
}

const round = (n: number, digits = 2): number => {
  const k = 10 ** digits;
  return Math.round(n * k) / k;
};

// ---- WebGL 呼び出しの計測 ----

function onGlCall(name: string, cat: GlCategory, ms: number): void {
  const a = state.acc;
  a.glMs += ms;
  if (cat === 'compile') a.compileMs += ms;
  else if (cat === 'upload') a.uploadMs += ms;
  else if (cat === 'draw') a.draws++;
  if (ms > a.topMs) {
    a.topMs = ms;
    a.topName = name;
  }
  if (name === 'linkProgram') state.programsLinked++;
  if (name === 'texImage2D' || name === 'texStorage2D') state.texUploads++;
  if (ms >= SLOW_GL_CALL_MS && state.slowCalls.length < MAX_SLOW_CALLS) {
    state.slowCalls.push({ tSec: round((performance.now() - state.t0) / 1000, 2), name, ms: round(ms) });
  }
}

function hookGl(): void {
  const protos: any[] = [];
  if (typeof WebGLRenderingContext !== 'undefined') protos.push(WebGLRenderingContext.prototype);
  if (typeof WebGL2RenderingContext !== 'undefined') protos.push(WebGL2RenderingContext.prototype);
  for (const proto of protos) {
    for (const [name, cat] of Object.entries(GL_METHODS)) {
      const orig = proto[name] as AnyFn | undefined;
      if (typeof orig !== 'function') continue;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        const s = performance.now();
        try {
          return orig.apply(this, args);
        } finally {
          onGlCall(name, cat, performance.now() - s);
        }
      };
    }
  }
  // どのコンテキストが描画に使われているか(GPU 名の取得用)を、生成時に捕まえる
  const origGetContext = HTMLCanvasElement.prototype.getContext as AnyFn;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
    const ctx = origGetContext.call(this, type, ...rest);
    if (ctx && /webgl/.test(type) && !glContext) glContext = ctx;
    return ctx;
  } as typeof HTMLCanvasElement.prototype.getContext;
}

function resolveGpuRenderer(): string | undefined {
  if (gpuRenderer) return gpuRenderer;
  try {
    if (!glContext) {
      // フック前に作られたコンテキストは、同じ種類を要求すると同じものが返る
      const c = document.querySelector('canvas');
      glContext = (c?.getContext('webgl2') ?? c?.getContext('webgl') ?? null) as typeof glContext;
    }
    const ext = glContext?.getExtension('WEBGL_debug_renderer_info');
    if (glContext && ext) gpuRenderer = String(glContext.getParameter(ext.UNMASKED_RENDERER_WEBGL));
  } catch { /* 取れなければ不明のまま */ }
  return gpuRenderer;
}

// ---- フレームの計測 ----

function closeBucket(ts: number): void {
  const b = state.bucket;
  if (b.frames > 0) {
    const h = heapMb();
    state.timeline.push({
      tSec: round((ts - state.t0) / 1000, 1),
      fps: b.frames,
      maxMs: round(b.maxMs, 1),
      avgJsMs: round(b.js / b.frames),
      avgGlMs: round(b.gl / b.frames),
      avgDraws: Math.round(b.draws / b.frames),
      heapMb: h === undefined ? undefined : round(h, 1),
    });
    if (state.timeline.length > 3600) state.timeline.shift();
  }
  state.bucket = { startTs: ts, frames: 0, maxMs: 0, js: 0, gl: 0, draws: 0 };
}

function findLoaf(ts: number, intervalMs: number): SpikeRecord['loaf'] {
  const from = ts - intervalMs - 5;
  for (let i = state.loaf.length - 1; i >= 0; i--) {
    const l = state.loaf[i];
    if (l.start + l.durationMs < from) break;
    if (l.start <= ts) return { durationMs: l.durationMs, blockingMs: l.blockingMs, script: l.script };
  }
  return undefined;
}

/** 新しい描画フレームの開始時に呼ぶ。ここまでに積んだ内訳は「ひとつ前のフレーム」の仕事。 */
function onFrameStart(ts: number): void {
  const prev = state.lastTs;
  state.lastTs = ts;
  const acc = state.acc;
  state.acc = newAcc();
  if (prev === 0) {
    state.bucket.startTs = ts;
    return;
  }
  const interval = ts - prev;
  const h = heapMb();
  const heapDrop = h !== undefined && state.prevHeapMb !== undefined ? Math.max(0, state.prevHeapMb - h) : 0;
  state.prevHeapMb = h;
  // タブが隠れていた間などの、極端に長い間隔は計測の対象にしない
  if (interval <= 0 || interval > 2000 || document.visibilityState !== 'visible') {
    closeBucket(ts);
    return;
  }

  if (state.intervals.length < MAX_FRAMES) state.intervals.push(interval);
  const b = state.bucket;
  b.frames++;
  b.maxMs = Math.max(b.maxMs, interval);
  b.js += acc.jsMs;
  b.gl += acc.glMs;
  b.draws += acc.draws;
  if (ts - b.startTs >= 1000) closeBucket(ts);

  if (state.intervals.length % 120 === 0) medianCache = summarizeFrames(state.intervals.slice(-600)).medianMs || medianCache;
  if (interval < spikeThresholdMs(medianCache) || state.spikes.length >= MAX_SPIKES) return;

  const cause = classifySpike({
    intervalMs: interval,
    jsMs: acc.jsMs,
    glMs: acc.glMs,
    compileMs: acc.compileMs,
    uploadMs: acc.uploadMs,
    heapDropMb: heapDrop,
  });
  state.causeCounts[cause] = (state.causeCounts[cause] ?? 0) + 1;
  state.spikes.push({
    tSec: round((ts - state.t0) / 1000, 2),
    intervalMs: round(interval, 1),
    cause,
    jsMs: round(acc.jsMs, 1),
    glMs: round(acc.glMs, 1),
    compileMs: round(acc.compileMs, 1),
    uploadMs: round(acc.uploadMs, 1),
    heapDropMb: round(heapDrop, 1),
    draws: acc.draws,
    slowestGlCall: acc.topName,
    slowestGlMs: round(acc.topMs, 1),
    lastMark,
    loaf: findLoaf(ts, interval),
  });
}

function hookRaf(): void {
  const origRaf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    origRaf((ts) => {
      // 同じフレームの2つ目以降のコールバックは、フレーム開始の処理を繰り返さない
      if (ts !== state.lastTs) onFrameStart(ts);
      const s = performance.now();
      try {
        cb(ts);
      } finally {
        state.acc.jsMs += performance.now() - s;
      }
    });
}

function observe(type: string, handle: (e: any) => void): void {
  try {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    new PerformanceObserver((list) => list.getEntries().forEach(handle)).observe({ type, buffered: false });
  } catch { /* 非対応ブラウザ(Firefox など)では飛ばす */ }
}

function hookObservers(): void {
  observe('long-animation-frame', (e) => {
    const scripts = (e.scripts ?? []) as { sourceURL?: string; sourceFunctionName?: string; invoker?: string; duration?: number }[];
    const top = [...scripts].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
    const name = top ? `${top.sourceFunctionName || top.invoker || '?'} @ ${(top.sourceURL || '').split('/').pop()}` : '';
    state.loaf.push({ start: e.startTime, durationMs: round(e.duration, 1), blockingMs: round(e.blockingDuration ?? 0, 1), script: name });
    if (state.loaf.length > MAX_LOAF) state.loaf.shift();
  });
  observe('longtask', (e) => {
    state.longTasks.push({ start: round(e.startTime, 1), durationMs: round(e.duration, 1) });
    if (state.longTasks.length > MAX_LOAF) state.longTasks.shift();
  });
}

// ---- 結果 ----

interface BatteryLike { charging: boolean; level: number }

export async function buildBenchReport(): Promise<Record<string, unknown>> {
  let battery: { charging: boolean; level: number } | undefined;
  try {
    const b = (await (navigator as unknown as { getBattery?: () => Promise<BatteryLike> }).getBattery?.()) ?? undefined;
    if (b) battery = { charging: b.charging, level: round(b.level, 2) };
  } catch { /* 取れない環境がある */ }
  const renderer = resolveGpuRenderer();
  const summary = summarizeFrames(state.intervals);
  const slowestFirst = [...state.spikes].sort((a, b) => b.intervalMs - a.intervalMs);
  return {
    generatedAt: new Date().toISOString(),
    url: window.location.href,
    game: /\/games\/([\w-]+)\/?/.exec(window.location.pathname)?.[1] ?? null,
    environment: {
      userAgent: navigator.userAgent,
      gpuRenderer: renderer ?? null,
      gpuClass: classifyGpu(renderer),
      cpuCores: navigator.hardwareConcurrency,
      deviceMemoryGb: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
      devicePixelRatio: window.devicePixelRatio,
      screen: `${window.screen.width}x${window.screen.height}`,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      battery: battery ?? null,
      supports: {
        longAnimationFrame: !!PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame'),
        longTask: !!PerformanceObserver.supportedEntryTypes?.includes('longtask'),
        heapMemory: heapMb() !== undefined,
      },
    },
    summary,
    glTotals: { programsLinked: state.programsLinked, textureUploads: state.texUploads },
    spikeCount: state.spikes.length,
    spikesByCause: state.causeCounts,
    spikesWorstFirst: slowestFirst.slice(0, 100),
    spikesInOrder: state.spikes,
    slowGlCalls: state.slowCalls,
    longAnimationFrames: state.loaf,
    longTasks: state.longTasks,
    marks: state.marks,
    timeline: state.timeline,
  };
}

async function downloadReport(): Promise<void> {
  const report = await buildBenchReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.href = URL.createObjectURL(blob);
  a.download = `bench-${report.game ?? 'game'}-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

// ---- 画面表示 ----

function mountOverlay(): void {
  const el = document.createElement('pre');
  el.style.cssText =
    'position:fixed;left:6px;bottom:6px;z-index:2147483647;margin:0;padding:6px 8px;pointer-events:none;' +
    'font:11px/1.35 ui-monospace,Consolas,monospace;color:#9fffb0;background:rgba(0,0,0,.72);' +
    'border:1px solid rgba(159,255,176,.4);border-radius:4px;white-space:pre;';
  document.body.appendChild(el);
  overlay = el;
  const render = () => {
    if (!overlay) return;
    overlay.style.display = overlayVisible ? 'block' : 'none';
    if (!overlayVisible) return;
    const recent = summarizeFrames(state.intervals.slice(-300));
    const all = summarizeFrames(state.intervals);
    const renderer = resolveGpuRenderer();
    const gpu = classifyGpu(renderer);
    const last = state.spikes[state.spikes.length - 1];
    const causes = Object.entries(state.causeCounts).map(([k, v]) => `${k}:${v}`).join(' ') || '-';
    overlay.textContent = [
      `BENCH  ${recent.avgFps.toFixed(0)} fps (直近5秒)  全体 ${all.avgFps.toFixed(1)} fps / 1%low ${all.onePercentLowFps.toFixed(0)}`,
      `frame p50 ${all.medianMs} / p95 ${all.p95Ms} / p99 ${all.p99Ms} / max ${all.maxMs} ms`,
      `spike ${state.spikes.length}  [${causes}]`,
      last ? `last: ${last.intervalMs}ms ${last.cause} js${last.jsMs} gl${last.glMs}${last.lastMark ? ' @' + last.lastMark : ''}` : 'last: -',
      `GPU: ${renderer ?? '不明'}${gpu === 'integrated' ? '  ⚠内蔵GPUで動作中の可能性' : gpu === 'software' ? '  ⚠ソフトウェア描画' : ''}`,
      'F8:保存  F9:リセット  F10:表示切替',
    ].join('\n');
  };
  setInterval(render, 500);
  render();
}

/** ベンチマークを有効にする(?bench=1 のときだけ動く)。各ゲームの installHomeReturn() から呼ばれる。 */
export function installBench(): void {
  if (installed || typeof window === 'undefined' || !isBenchEnabled()) return;
  installed = true;
  state = freshState(performance.now());
  hookRaf();
  hookGl();
  hookObservers();

  document.addEventListener('visibilitychange', () => benchMark(`visibility:${document.visibilityState}`));
  document.addEventListener('fullscreenchange', () => benchMark('fullscreen'));
  window.addEventListener('resize', () => benchMark('resize'));
  window.addEventListener('gamepadconnected', () => benchMark('gamepad-connected'));
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.code === 'F8') { e.preventDefault(); void downloadReport(); }
      else if (e.code === 'F9') { e.preventDefault(); state = freshState(performance.now()); lastMark = ''; }
      else if (e.code === 'F10') { e.preventDefault(); overlayVisible = !overlayVisible; }
    },
    true,
  );
  (window as unknown as Record<string, unknown>).__gcBenchMark = benchMark;
  (window as unknown as Record<string, unknown>).__gcBenchReport = buildBenchReport;

  if (document.body) mountOverlay();
  else window.addEventListener('DOMContentLoaded', mountOverlay, { once: true });
}
