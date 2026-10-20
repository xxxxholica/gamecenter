import { IS_FIREFOX, IS_SAFARI, decodeInWorker, decodeWithImageElement, prewarmStripPool, releaseStripTexture, rememberStripTemplate, uploadInStrips, usesStripUpload } from './textureStrips';
import { benchMark } from '../../../../shared/arcadeBenchTargets';
import { realNow, untrackedFrame, untrackedTimeout } from '../../../../shared/arcadeReplay';
import { reportDeathPoint } from '../../../../shared/arcadeAnalytics';
import { audio } from '../audio';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { MapBase } from './MapBase';
import type { RoadTube } from './RoadTube';
import type { CarController } from '../core/CarController';

export interface StreamChunk {
  file: string;
  bbox: { minX: number; maxX: number; minZ: number; maxZ: number };
}
interface StreamManifest {
  chunks: StreamChunk[];
}

/**
 * Spaces out chunk requests. The production server bans clients that fetch many distinct non-static files (.glb) in a short time
 * , so the ~640 chunks of a stage must not be requested as fast as the network allows.
 * Token bucket: `burst` requests may go out at once, after that one every `intervalMs`. Lower priority numbers go first.
 * One instance is shared by all maps, so re-entering a stage right away does not get a fresh burst.
 */
class RequestPacer {
  private tokens: number;
  private last = performance.now();
  private queue: { priority: number; cancelled: () => boolean; resolve: () => void }[] = [];
  private timer: number | null = null;

  constructor(private readonly burst: number, private readonly intervalMs: number) {
    this.tokens = burst;
  }

  /** Resolves when the caller may send its request. Waiters whose `cancelled()` turns true are released without using a slot. */
  public acquire(priority: number, cancelled: () => boolean): Promise<void> {
    this.refill();
    if (this.tokens >= 1 && this.queue.length === 0) {
      this.tokens -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const at = this.queue.findIndex((q) => q.priority > priority);
      this.queue.splice(at < 0 ? this.queue.length : at, 0, { priority, cancelled, resolve });
      this.schedule();
    });
  }

  private refill(): void {
    const now = performance.now();
    this.tokens = Math.min(this.burst, this.tokens + (now - this.last) / this.intervalMs);
    this.last = now;
  }

  private schedule(): void {
    if (this.timer !== null) return;
    const wait = Math.max(50, (1 - this.tokens) * this.intervalMs);
    // (読み込みの裏方なので、操作の記録・再生で追わないタイマーを使う。終わる時刻がネットワーク次第で変わるため)
    this.timer = untrackedTimeout(() => {
      this.timer = null;
      this.refill();
      while (this.queue.length > 0) {
        if (this.queue[0].cancelled()) { this.queue.shift()!.resolve(); continue; }
        if (this.tokens < 1) break;
        this.tokens -= 1;
        this.queue.shift()!.resolve();
      }
      if (this.queue.length > 0) this.schedule();
    }, wait);
  }
}

let sharedPacer: RequestPacer | null = null;

/**
 * 4096×4096 の JPEG アトラス(ImageBitmap)をメインスレッドでそのまま gl.texSubImage2D に渡すと、
 * Chromium の遅延デコードと 64MB の転送でメインスレッドが 1枚あたり約115ms(2枚重なると278ms)止まる。
 * Web Worker 上の GPU バックド OffscreenCanvas に一度描画して transferToImageBitmap() で戻すことで、
 * デコードと GPU SharedImage への転送を別スレッドで完了させ、メインスレッドの initTexture を約0.1ms(GPU間コピー)にする。
 */
let gpuUploadWorker: Worker | null | undefined;
let gpuUploadSeq = 0;
/** チャンクの準備に1フレームで使ってよい時間(ms)。走行中は、描画の余裕に収まる程度。開始前のロード中は、止まっても見えないので大きく。 */
const PREP_BUDGET_RACING_MS = 3;
const PREP_BUDGET_LOADING_MS = 12;
/** step() は、チャンクの準備が終われば true、予算を使い切って続きがあれば false を返す。 */
interface PrepJob {
  budgetMs: number;
  step: () => boolean;
}

const gpuUploadWaiters = new Map<number, (bmp: ImageBitmap) => void>();

function getGpuUploadWorker(): Worker | null {
  if (gpuUploadWorker !== undefined) return gpuUploadWorker;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    gpuUploadWorker = null;
    return null;
  }
  try {
    const code = `
      const canvases = new Map();
      self.onmessage = (e) => {
        const { id, bmp } = e.data;
        try {
          const key = bmp.width + 'x' + bmp.height;
          let entry = canvases.get(key);
          if (!entry) {
            const osc = new OffscreenCanvas(bmp.width, bmp.height);
            const ctx = osc.getContext('2d');
            entry = { osc, ctx };
            canvases.set(key, entry);
          }
          entry.ctx.drawImage(bmp, 0, 0);
          bmp.close();
          const out = entry.osc.transferToImageBitmap();
          self.postMessage({ id, bmp: out }, [out]);
        } catch {
          self.postMessage({ id, bmp }, [bmp]);
        }
      };
    `;
    const url = URL.createObjectURL(new Blob([code], { type: 'application/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    w.onmessage = (e: MessageEvent<{ id: number; bmp: ImageBitmap }>) => {
      const resolve = gpuUploadWaiters.get(e.data.id);
      if (resolve) {
        gpuUploadWaiters.delete(e.data.id);
        resolve(e.data.bmp);
      } else {
        e.data.bmp?.close?.();
      }
    };
    gpuUploadWorker = w;
  } catch {
    gpuUploadWorker = null;
  }
  return gpuUploadWorker;
}

async function prepareGpuTextureImage(tex: THREE.Texture): Promise<void> {
  const worker = getGpuUploadWorker();
  const img = tex.image as ImageBitmap | null;
  if (!worker || !img || typeof img.close !== 'function' || !(img.width >= 1024)) return;
  const id = ++gpuUploadSeq;
  const gpuBmp = await new Promise<ImageBitmap>((resolve) => {
    gpuUploadWaiters.set(id, resolve);
    worker.postMessage({ id, bmp: img }, [img]);
  });
  tex.image = gpuBmp;
}

/**
 * Base class for maps made of many GLB chunks that are streamed in around the car and released behind it,
 * with a drivable corridor around a baked road profile (Y follows the profile, the car is pushed back at the edges).
 */
/**
 * GPUへ転送し終えたテクスチャの元画像(デコード済みの ImageBitmap)を解放する。
 * three.js は転送後も元画像を保持し続けるが、一度転送した画像は再転送されないので(version が変わらない限り)、
 * 4096px のアトラスでは1枚あたり約64MBのメインメモリがそのまま無駄になる。見た目には影響しない。
 */
function releaseUploadedImage(tex: THREE.Texture): void {
  const img = tex.image as { close?: () => void } | null;
  if (img && typeof img.close === 'function') img.close();
}

export abstract class StreamedCityMap extends MapBase {
  /** URL prefix of the chunk directory (with trailing slash); it must contain manifest.json. */
  protected abstract readonly modelBase: string;
  /** Dense road samples [x, surfaceY, z] (every ~2 m) of the closed route. */
  protected abstract readonly road: THREE.Vector3[];

  /** Chunks closer than this to the car (metres, to the chunk's bounding box) are resident. */
  protected loadRadius: number = 230;
  /** ...and are released again beyond this distance (hysteresis avoids thrashing). */
  protected unloadRadius: number = 290;
  protected readonly maxParallelLoads: number = 3;
  /** Request pacing (see RequestPacer): this many chunk requests at once, then one per `requestIntervalMs`. Off in dev. */
  protected readonly requestBurst: number = 20;
  protected readonly requestIntervalMs: number = 700;
  /** Half-width of the drivable corridor around the road centre line (metres). */
  protected corridorHalfWidth: number = 4.8;
  /** Ride height of the car origin above the road samples. */
  protected carLift: number = 0.19;
  /**
   * How much the road gradient works on the car (0 = not at all, 1 = full gravity): climbing slows it down, descending speeds it up.
   * Also enables the crest / dip ride-height feel. Off by default so existing courses drive exactly as before.
   */
  protected gradeEffect: number = 0;
  private heave = 0;
  /** Smoothed per-sample gradient and vertical curvature of the closed route (built on first use when gradeEffect > 0). */
  private grade: { slope: Float32Array; kappa: Float32Array } | null = null;
  /** Fractional sample index of a one-way gate on the closed route (the goal): it can be crossed forwards only. */
  protected goalIndex: number | null = null;
  private prevGateD: number | null = null;
  /** When set, city triangles inside this tube are dropped as chunks load (see RoadTube). */
  protected roadTube: RoadTube | null = null;

  /** Optional coarse "far tier" (same chunk keys, tiny textures) kept resident for the whole area: `modelBase + 'far/'`. */
  protected hasFarTier: boolean = false;
  /** How long a freshly loaded chunk takes to dither in (ms). */
  protected readonly fadeMs: number = 1200;

  public onProgress: ((loaded: number, total: number) => void) | null = null;

  /** Side routes (open stretches); the first / last sample coincide with the loop. Assigned by the subclass. */
  protected branches: THREE.Vector3[][] = [];
  /** Every drivable path with the car's rate-limited position along it (in fractional sample indices). */
  private paths: { pts: THREE.Vector3[]; closed: boolean; lastIndex: number; trackU: number | null }[] = [];
  private activePath = 0;
  protected disposed = false;
  private loading: Promise<void> | null = null;
  protected manifest: StreamManifest | null = null;
  private loader: GLTFLoader | null = null;
  private pacer: RequestPacer | null = null;
  protected resident = new Map<string, THREE.Object3D>();
  protected pending = new Set<string>();
  protected lastStreamMs = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private warmupInstalled = false;
  /**
   * 建物テクスチャの異方性フィルタ。近くのチャンクは4(斜めから見る壁の見え方は十分で、16より GPU のサンプリングが軽い)、
   * 遠景(far tier。縮小テクスチャで、遠くを見るだけ)は1。実機の上限を超えない値にする。
   */
  private chunkAnisotropy = 4;
  /** file → チャンク(updateStreaming が毎回全チャンクを走査しないための索引) */
  private chunkIndex: Map<string, StreamChunk> | null = null;
  /** Chunks whose geometry/materials or textures are being prepared 1 per frame to avoid main-thread stalls. */
  private prepJobs: PrepJob[] = [];
  private prepPumpScheduled = false;
  private uploadJobs: { textures: THREE.Texture[]; resolve: () => void; gen?: Generator<void, void, void>; fast?: boolean }[] = [];
  private uploadPumpScheduled = false;
  /** テクスチャを帯で送るか(textureStrips.ts の usesStripUpload。attachRenderer で決める) */
  private stripUpload = IS_FIREFOX;
  /** 最後にテクスチャを転送したフレームの時刻(document.timeline.currentTime) */
  private lastUploadFrame: CSSNumberish | null = null;
  private farObjects = new Map<string, THREE.Object3D>();
  /** Keys of near chunks that are fully faded in (their far twin is hidden). */
  private nearOpaque = new Set<string>();
  private fades: { obj: THREE.Object3D; mats: THREE.Material[]; t0: number; dur: number; done: () => void }[] = [];

  /**
   * Moving-average the closed route's heights (window +-`half` samples, `passes` times) so slope changes are gentle:
   * a kink in the baked profile shows up as a bump when driven at speed. Call before building geometry from `road`.
   */
  protected smoothRoadHeights(half: number = 6, passes: number = 2): void {
    const n = this.road.length;
    for (let pass = 0; pass < passes; pass++) {
      const ys = this.road.map((r) => r.y);
      for (let i = 0; i < n; i++) {
        let sum = 0;
        for (let k = -half; k <= half; k++) sum += ys[(i + k + n * 4) % n];
        this.road[i].y = sum / (2 * half + 1);
      }
    }
  }

  /** Starts streaming: resolves once the chunks around the start line are in. Safe to call repeatedly. */
  public loadOpenData(): Promise<void> {
    if (!this.loading) this.loading = this.initStreaming();
    return this.loading;
  }

  private async initStreaming(): Promise<void> {
    this.manifest = (await (await fetch(this.modelBase + 'manifest.json')).json()) as StreamManifest;
    this.loader = new GLTFLoader();
    this.loader.setMeshoptDecoder(MeshoptDecoder);
    if (IS_FIREFOX) decodeWithImageElement(this.loader);   // Firefox は createImageBitmap(オプション付き)のデコードで rAF が止まる(textureStrips.ts)
    else if (IS_SAFARI) decodeInWorker(this.loader);      // Safari はメインスレッドで展開すると、その間止まる(textureStrips.ts)
    if (!import.meta.env.DEV) this.pacer = sharedPacer ??= new RequestPacer(this.requestBurst, this.requestIntervalMs);

    const initial = this.wanted(this.startPosition.x, this.startPosition.z, this.loadRadius);
    let loaded = 0;
    this.onProgress?.(0, initial.length);
    await Promise.all(initial.map((c) => this.loadChunk(c, true).then(() => this.onProgress?.(++loaded, initial.length))));
    this.onProgress?.(initial.length, initial.length);
    if (this.stripUpload && this.renderer) await this.runPerFrame(prewarmStripPool(this.renderer));   // 走行中に確保すると約 20ms 止まるので、読み込み中に済ませる
    if (this.hasFarTier) void this.loadFarTier();
  }

  /** ジェネレーターを、1フレームに1ステップずつ最後まで進める(読み込み中の、見えない作業用)。 */
  private runPerFrame(gen: Generator<void, void, void>): Promise<void> {
    return new Promise((resolve) => {
      const step = (): void => {
        if (this.disposed) { resolve(); return; }
        let done = true;
        try { done = gen.next().done === true; } catch (e) { console.warn('prewarm failed', e); }
        if (done) resolve(); else untrackedFrame(step);
      };
      untrackedFrame(step);
    });
  }

  public attachRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
    this.stripUpload = usesStripUpload(renderer);
    this.ensureShaderWarmupMesh();
  }

  /**
   * チャンクのフェード中(alphaHash: true)と通常時(alphaHash: false)の両方のシェーダー(本描画＋影パス)を
   * 初回ウォームアップ時にコンパイルし、Three.js のプログラムキャッシュに常駐させるための極小ダミーメッシュ。
   * これにより、17.87秒や31.87秒でフェードが始まる・終わる瞬間のシェーダー再コンパイル(175ms)を防ぎつつ、
   * フェード完了後のチャンクを alphaHash: false(不透明・Early-Z有効)に保てる。
   */
  private ensureShaderWarmupMesh(): void {
    if (this.warmupInstalled) return;
    this.warmupInstalled = true;

    const dummyTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    dummyTex.colorSpace = THREE.SRGBColorSpace;
    dummyTex.needsUpdate = true;

    const pos = new Float32Array([0, 0, 0, 0.001, 0, 0, 0, 0.001, 0]);
    const nor = new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const uv = new Float32Array([0, 0, 1, 0, 0, 1]);

    const geoTex = new THREE.BufferGeometry();
    geoTex.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geoTex.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geoTex.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

    const geoCol = new THREE.BufferGeometry();
    geoCol.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geoCol.setAttribute('normal', new THREE.BufferAttribute(nor, 3));

    const makeStd = (withMap: boolean) =>
      new THREE.MeshStandardMaterial(withMap ? { map: dummyTex } : { color: 0x6b6e73 });

    const configs: { geo: THREE.BufferGeometry; withMap: boolean; fade: boolean }[] = [
      { geo: geoTex, withMap: true, fade: false },
      { geo: geoTex, withMap: true, fade: true },
      { geo: geoCol, withMap: false, fade: false },
      { geo: geoCol, withMap: false, fade: true },
    ];

    const holder = new THREE.Group();
    if (this.startPosition) holder.position.copy(this.startPosition);
    for (const cfg of configs) {
      const std = makeStd(cfg.withMap);
      const mat = this.convertMaterial(std);
      std.dispose();
      if (cfg.fade) {
        mat.alphaHash = true;
        mat.opacity = 0.5;
      }
      const m = new THREE.Mesh(cfg.geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      holder.add(m);
    }
    this.group.add(holder);
  }

  /**
   * チャンクの準備(道路トンネルの削り + 素材の差し替え)を、1フレームにつき budgetMs だけ進める。
   * 削りは1チャンクで 40〜70ms かかることがあり、走行中に1フレームで済ませると、そのフレームが丸ごと止まる。
   * instant(開始前のロード中)は止まっても見えないので、大きな予算で一気に進める。
   */
  private schedulePrepareChunk(root: THREE.Object3D, isFar: boolean, instant = false): Promise<void> {
    return new Promise((resolve) => {
      const carve = this.roadTube ? this.roadTube.carveSteps(root, () => this.prepShouldYield()) : null;
      let carved = carve === null;
      const prep = this.prepareChunkSteps(root, isFar, () => this.prepShouldYield());
      this.prepJobs.push({
        budgetMs: instant ? PREP_BUDGET_LOADING_MS : PREP_BUDGET_RACING_MS,
        step: () => {
          if (this.disposed) { resolve(); return true; }
          if (!carved) {
            if (!carve!.next().done) return false;                 // 予算を使い切った: 続きは次のフレーム
            carved = true;
          }
          const prevAniso = this.chunkAnisotropy;
          if (isFar) this.chunkAnisotropy = 1;
          let done = true;
          try { done = prep.next().done === true; } finally { this.chunkAnisotropy = prevAniso; }
          if (!done) return false;
          resolve();
          return true;
        },
      });
      this.pumpPrep();
    });
  }

  private prepDeadline = 0;
  private prepShouldYield(): boolean {
    return realNow() >= this.prepDeadline;   // (1フレームの中の予算なので本当の時刻で測る)
  }

  /** 1フレームに進めるのは1つのチャンクだけ(終わったら次のフレーム)。 */
  private pumpPrep(): void {
    if (this.prepPumpScheduled || this.prepJobs.length === 0) return;
    this.prepPumpScheduled = true;
    untrackedFrame(() => {
      this.prepPumpScheduled = false;
      const job = this.prepJobs[0];
      if (job) {
        this.prepDeadline = realNow() + job.budgetMs;
        if (job.step()) this.prepJobs.shift();
      }
      if (this.prepJobs.length > 0) this.pumpPrep();
    });
  }

  /**
   * Uploading a chunk's textures on its first render costs 200-400 ms in one frame (16 x 1024 px + mipmaps).
   * Instead the textures are decoded/uploaded in a Worker OffscreenCanvas first, then bound to WebGL 1 per frame.
   */
  private async stageUpload(root: THREE.Object3D, instant = false): Promise<void> {
    const set = new Set<THREE.Texture>();
    const users = new Map<THREE.Texture, THREE.MeshStandardMaterial[]>();
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const m = o.material as THREE.MeshStandardMaterial;
      if (!m.map) return;
      set.add(m.map);
      const list = users.get(m.map) ?? [];
      if (!list.includes(m)) list.push(m);
      users.set(m.map, list);
    });
    if (!this.renderer || set.size === 0) return;

    const textures = [...set];
    if (this.stripUpload) {
      // 大きなテクスチャ(2048 以上)は、帯に分けて1フレームに1つずつ送る(textureStrips.ts)。
      // Firefox: 4096² を一度に転送すると rAF が約 40ms 止まる。
      // Chrome(Windows, ANGLE D3D11): 下の Worker の方法だと、GPU プロセスで 1024² 12ms・4096² 193ms 止まる(東京の 150〜183ms の停止、
      //   ヘルシンキの 33ms の連続)。CPU 側の画像のまま送る(小さい画像は 1024² 3.5ms、帯は 1 帯 3ms 前後)。
      // Safari(Mac): 下の Worker の方法でも 4096² 1枚に 50ms かかる(走行中に 60〜95ms 止まる)。帯は 1 帯 5ms。
      for (const tex of textures) rememberStripTemplate(tex);   // 読み込み中に、大きなテクスチャの設定を覚えておく(あとでプールを先に確保する)
      const r = this.renderer;
      if (IS_FIREFOX) await Promise.all(textures.map((tex) => prepareGpuTextureImage(tex)));   // Firefox は、これまでどおり、小さい画像(ImageBitmap)を Worker で GPU 側に載せてから転送する
      if (this.disposed || !this.renderer) {
        for (const tex of textures) releaseUploadedImage(tex);
        return;
      }
      return new Promise((resolve) => {
        const gen = (function* (): Generator<void, void, void> { for (const tex of textures) yield* uploadInStrips(r, tex, users.get(tex) ?? []); })();
        this.uploadJobs.push({ textures: [], resolve, gen, fast: instant });
        this.pumpUploads();
      });
    }
    await Promise.all(textures.map((tex) => prepareGpuTextureImage(tex)));
    if (this.disposed || !this.renderer) {
      for (const tex of textures) releaseUploadedImage(tex);
      return;
    }

    return new Promise((resolve) => {
      this.uploadJobs.push({ textures, resolve });
      this.pumpUploads();
    });
  }

  private pumpUploads(): void {
    if (this.uploadPumpScheduled || this.uploadJobs.length === 0 || !this.renderer) return;
    this.uploadPumpScheduled = true;
    untrackedFrame(() => {
      this.uploadPumpScheduled = false;
      this.tickUploads();
      if (this.uploadJobs.length > 0) {
        this.pumpUploads();
      }
    });
  }

  private tickUploads(): void {
    const r = this.renderer;
    if (!r || this.uploadJobs.length === 0) return;
    // 転送は 1 フレームに 1 回まで。tickUploads は pumpUploads の rAF と constrainCar の両方から呼ばれるので、
    // そのままだと 1 フレームに 2 枚送る。Windows の Chrome では 1024px を 2 枚ずつ(ミップマップ込み)送り続けると、
    // GPU プロセスの処理が追いつかず、3 フレームほどで 33ms のフレームが続いていた(ヘルシンキ: 走行 40 秒で 142 回)
    const frame = document.timeline?.currentTime ?? null;
    if (frame !== null) {
      if (frame === this.lastUploadFrame) return;
      this.lastUploadFrame = frame;
    }
    const job = this.uploadJobs[0];
    if (job.gen) {
      let done = true;
      try {
        // 開始前の読み込み中(fast)は、止まっても見えないので、1フレームに 12ms ぶんまとめて進める。走行中は1ステップ
        // (本当の時刻で区切る。操作の記録中の performance.now() はフレームの中で止まっていて、区切りにならない)
        const until = realNow() + (job.fast ? 12 : 0);
        do { done = job.gen.next().done === true; } while (!done && realNow() < until);
      } catch (e) { console.warn('texture strip upload failed', e); }
      if (done) { this.uploadJobs.shift(); job.resolve(); }
      return;
    }
    const tex = job.textures.shift();
    if (tex) {
      try {
        r.initTexture(tex);
        releaseUploadedImage(tex);
      } catch {
        // ignore texture init errors
      }
    }
    if (job.textures.length === 0) {
      this.uploadJobs.shift();
      job.resolve();
    }
  }

  private keyOf(file: string): string { return file.replace(/\.glb$/, ''); }

  /**
   * Coarse chunks for the whole area, loaded in the background nearest first. A far chunk is shown only while its detailed
   * twin (same key) is not fully faded in, so the horizon is always there and never pops.
   */
  private async loadFarTier(): Promise<void> {
    let manifest: StreamManifest;
    try {
      const res = await fetch(this.modelBase + 'far/manifest.json');
      if (!res.ok) return;
      manifest = (await res.json()) as StreamManifest;
    } catch { return; }
    if (!this.loader) return;
    const order = manifest.chunks
      .map((c) => ({ c, d: this.boxDistance(c, this.startPosition.x, this.startPosition.z) }))
      .sort((a, b) => a.d - b.d)
      .map((e) => e.c);
    const queue = order.slice();
    const worker = async (): Promise<void> => {
      for (let c = queue.shift(); c && !this.disposed; c = queue.shift()) {
        try {
          await this.pacer?.acquire(1, () => this.disposed);   // after every waiting near chunk
          if (this.disposed) return;
          const scene = await this.fetchAndPrepare(this.modelBase + 'far/' + c.file, true);
          if (!scene) return;
          const key = this.keyOf(c.file);
          scene.visible = !this.nearOpaque.has(key);
          this.group.add(scene);
          this.farObjects.set(key, scene);
          benchMark('far-added');
          this.startFade(scene, this.fadeMs * 1.5, () => {});
        } catch (err) {
          console.warn(`[${this.metadata.id}] far chunk failed`, c.file, err);
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  /** Lit material so the city shades under the same sun/sky as the car; casts and receives so buildings ground each other. */
  /**
   * 素材の差し替えと法線の補いを、メッシュ1つずつ、shouldYield() が true になったら中断しながら進める。
   * 1チャンクで数十〜百以上のメッシュがあり、まとめて行うと、Firefox では 1 フレームに約 27ms かかる。
   */
  private *prepareChunkSteps(root: THREE.Object3D, isFar: boolean, shouldYield: () => boolean): Generator<void, void, void> {
    const meshes: THREE.Mesh[] = [];
    root.traverse((o) => { if (o instanceof THREE.Mesh) meshes.push(o); });
    for (const o of meshes) {
      const old = o.material as THREE.MeshStandardMaterial;
      o.material = this.convertMaterial(old);
      old.dispose();
      // PLATEAU chunks ship with no normal attribute at all (fine for the old unlit material, but a lit one needs
      // N·L and renders solid black without it).
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.castShadow = !isFar;
      o.receiveShadow = true;
      if (shouldYield()) yield;
    }
  }

  /** Dither the chunk in (alpha hashing: opaque-pass, no sorting, no see-through overlaps). */
  private startFade(obj: THREE.Object3D, dur: number, done: () => void): void {
    const mats: THREE.Material[] = [];
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const m = o.material as THREE.Material;
        m.alphaHash = true;
        m.opacity = 0;
        m.needsUpdate = true;
        mats.push(m);
      }
    });
    this.fades.push({ obj, mats, t0: performance.now(), dur, done });
  }

  private tickFades(): void {
    if (this.fades.length === 0) return;
    const now = performance.now();
    for (let i = this.fades.length - 1; i >= 0; i--) {
      const f = this.fades[i];
      const t = Math.min(1, (now - f.t0) / f.dur);
      for (const m of f.mats) m.opacity = t;
      if (t >= 1) {
        for (const m of f.mats) { m.alphaHash = false; m.opacity = 1; m.needsUpdate = true; }
        this.fades.splice(i, 1);
        f.done();
      }
    }
  }

  protected boxDistance(c: StreamChunk, x: number, z: number): number {
    const dx = Math.max(c.bbox.minX - x, 0, x - c.bbox.maxX);
    const dz = Math.max(c.bbox.minZ - z, 0, z - c.bbox.maxZ);
    return Math.hypot(dx, dz);
  }

  /** Chunks within `radius` of (x, z), nearest first. */
  protected wanted(x: number, z: number, radius: number): StreamChunk[] {
    if (!this.manifest) return [];
    // 半径内のものだけを集めてから並べる(全チャンク分のオブジェクトを作らない)
    const near: { c: StreamChunk; d: number }[] = [];
    for (const c of this.manifest.chunks) {
      const d = this.boxDistance(c, x, z);
      if (d <= radius) near.push({ c, d });
    }
    near.sort((a, b) => a.d - b.d);
    return near.map((e) => e.c);
  }

  /**
   * PLATEAU meshes ship as MeshStandardMaterial with no roughness/normal maps, so the full PBR shader buys nothing;
   * Lambert (diffuse + shadows, no specular/fresnel) is a much cheaper way to shade the thousands of streamed
   * building meshes under the same sun/hemisphere light as the car, instead of leaving them unlit.
   * flatShading: PLATEAU buildings are boxy massing with genuinely hard edges, and the far tier is welded +
   * mesh-simplified to ~1/12 the triangles (see tokyo_convert.mjs) — computeVertexNormals()'s smooth shading
   * rounds those hard corners into a "melted" blob, especially on the far tier, which now stands out once lit
   * instead of unlit. Flat per-face shading reads as intentional low-poly facets instead, on both tiers, so the
   * near/far crossfade doesn't also swap the shading style.
   */
  protected convertMaterial(old: THREE.MeshStandardMaterial): THREE.Material {
    if (old.map) old.map.anisotropy = Math.min(this.chunkAnisotropy, this.renderer?.capabilities.getMaxAnisotropy() ?? this.chunkAnisotropy);
    const mat = new THREE.MeshLambertMaterial({
      ...(old.map ? { map: old.map } : { color: old.color }),
      flatShading: true,
      transparent: old.transparent,
      opacity: old.opacity,
      alphaTest: old.alphaTest,
      side: old.side,
    });
    this.addNightWindows(mat);
    return mat;
  }

  /**
   * The lit windows of the city at night: warm rectangles on the walls of the buildings (procedural, in world space).
   * density = share of windows that are lit, floorH / winW = size of one window cell in metres. Far away they fade to a soft glow.
   */
  protected nightLook = { color: new THREE.Color(1.0, 0.9, 0.68), density: 0.5, floorH: 3.8, winW: 2.6 };

  private addNightWindows(mat: THREE.MeshLambertMaterial): void {
    const look = this.nightLook;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uWinCol = { value: look.color };
      shader.uniforms.uWinParams = { value: new THREE.Vector3(look.density, look.floorH, look.winW) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vNightPos;\nvarying vec3 vNightNor;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNightPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNightNor = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform vec3 uWinCol;
uniform vec3 uWinParams;
varying vec3 vNightPos;
varying vec3 vNightNor;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (abs(vNightNor.y) < 0.4) {
  float along = mix(vNightPos.z, vNightPos.x, abs(vNightNor.z));      // position along the wall
  vec2 cell = vec2(along / uWinParams.z, vNightPos.y / uWinParams.y);
  vec2 id = floor(cell);
  vec2 f = fract(cell);
  float r = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
  float lit = step(1.0 - uWinParams.x, r);
  float pane = step(0.15, f.x) * step(f.x, 0.85) * step(0.2, f.y) * step(f.y, 0.8);
  #ifdef USE_FOG
    float near = 1.0 - smoothstep(180.0, 420.0, vFogDepth);
  #else
    float near = 1.0;
  #endif
  float glow = mix(uWinParams.x * 0.3, lit * pane, near);              // far walls: an even soft glow
  totalEmissiveRadiance += uWinCol * glow * (0.6 + 0.4 * fract(r * 7.0));
}`);
    };
    mat.customProgramCacheKey = () => 'city-night-windows';
  }

  private stageLock: Promise<void> = Promise.resolve();

  /**
   * チャンク1つぶんの GLB を取得して、描画できる状態(パース・素材の準備・テクスチャの GPU 転送)まで進める。
   * ダウンロードは並列のままだが、重い処理は inStage で1チャンクずつにする。複数のチャンクが同時に届いても、
   * パースと転送が同じフレームに重ならず、読み込み中・開始直後のフレーム落ちが出ない(途中で破棄されたら null)。
   */
  private async fetchAndPrepare(url: string, isFar: boolean, instant = false): Promise<THREE.Group | null> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    const buf = await res.arrayBuffer();
    if (this.disposed) return null;
    const prev = this.stageLock;
    let release!: () => void;
    this.stageLock = new Promise<void>((r) => { release = r; });
    await prev;
    try {
      if (this.disposed) return null;
      benchMark('parse-start');
      const gltf = await this.loader!.parseAsync(buf, '');
      benchMark('parse-end');
      gltf.scene.userData.skipWarmup = true;
      await this.schedulePrepareChunk(gltf.scene, isFar, instant);
      benchMark('prep-end');
      if (!this.disposed) await this.stageUpload(gltf.scene, instant);
      benchMark('upload-end');
      if (this.disposed) { this.disposeObject(gltf.scene); return null; }
      return gltf.scene;
    } finally {
      release();
    }
  }

  private async loadChunk(c: StreamChunk, instant = false): Promise<void> {
    if (!this.loader || this.resident.has(c.file) || this.pending.has(c.file)) return;
    this.pending.add(c.file);
    try {
      await this.pacer?.acquire(0, () => this.disposed);
      if (this.disposed) return;
      const scene = await this.fetchAndPrepare(this.modelBase + c.file, false, instant);
      if (!scene) return;
      this.group.add(scene);
      this.resident.set(c.file, scene);
      benchMark('chunk-added');
      const key = this.keyOf(c.file);
      const shown = (): void => {
        this.nearOpaque.add(key);
        const far = this.farObjects.get(key);
        if (far) far.visible = false;
      };
      if (instant || !this.hasFarTier && this.fadeMs <= 0) shown();
      else this.startFade(scene, this.fadeMs, shown);
    } catch (err) {
      console.warn(`[${this.metadata.id}] failed to load`, c.file, err);
    } finally {
      this.pending.delete(c.file);
    }
  }

  private disposeObject(obj: THREE.Object3D): void {
    obj.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const m = o.material as THREE.MeshBasicMaterial;
      if (m.map && !(this.stripUpload && releaseStripTexture(m.map))) m.map.dispose();   // 帯で転送したテクスチャは、捨てずに次のチャンクへ使い回す
      m.dispose();
    });
  }

  private lastCrashReport = -Infinity;
  /** 死亡地点マップ: ぶつかった場所(プレイヤーが運転している間だけ。続けて当たっている間は1秒に1回) */
  private reportCrash(car: CarController, p: { x: number; z: number }, impact: number, what: string): void {
    if (!car.canDrive || impact < 0.2) return;
    const now = performance.now();
    if (now - this.lastCrashReport < 1000) return;
    this.lastCrashReport = now;
    reportDeathPoint(`course:${this.metadata.id}`, p.x, p.z, what, { impact: Math.round(impact * 100) / 100 });
  }

  /** Load chunks that came into range, release the ones that fell out of it. */
  protected updateStreaming(x: number, z: number): void {
    if (!this.manifest) return;
    const now = performance.now();
    if (now - this.lastStreamMs < 400) return;
    this.lastStreamMs = now;

    const index = (this.chunkIndex ??= new Map(this.manifest.chunks.map((k) => [k.file, k])));
    for (const [file, obj] of this.resident) {
      const c = index.get(file);
      if (c && this.boxDistance(c, x, z) > this.unloadRadius) {
        this.group.remove(obj);
        this.disposeObject(obj);
        this.resident.delete(file);
        this.fades = this.fades.filter((f) => f.obj !== obj);
        const key = this.keyOf(file);
        this.nearOpaque.delete(key);
        const far = this.farObjects.get(key);
        if (far) far.visible = true;
      }
    }
    const todo = this.wanted(x, z, this.loadRadius).filter((c) => !this.resident.has(c.file) && !this.pending.has(c.file));
    for (const c of todo.slice(0, Math.max(0, this.maxParallelLoads - this.pending.size))) void this.loadChunk(c);
  }

  public dispose(): void {
    this.disposed = true;
    super.dispose();
  }

  public constrainCar(car: CarController, dt: number = 1 / 60): void {
    const p = car.position;
    this.tickUploads();
    this.tickFades();
    this.updateStreaming(p.x, p.z);
    if (this.paths.length !== 1 + this.branches.length) {
      this.paths = [{ pts: this.road, closed: true, lastIndex: 0, trackU: null }, ...this.branches.map((pts) => ({ pts, closed: false, lastIndex: 0, trackU: null }))];
    }

    // Nearest sample on every path (search near the previous hit, globally when far away); the car follows the closest path.
    // The paths coincide around a fork, so the height is continuous when the car changes over.
    const hits = this.paths.map((st) => {
      const n = st.pts.length;
      const search = (from: number, to: number): { idx: number; d2: number } => {
        let best = -1, bestD2 = Infinity;
        for (let k = from; k <= to; k++) {
          const i = st.closed ? ((k % n) + n) % n : k;
          if (i < 0 || i >= n) continue;
          const dx = st.pts[i].x - p.x, dz = st.pts[i].z - p.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < bestD2) { bestD2 = d2; best = i; }
        }
        return { idx: best, d2: bestD2 };
      };
      let hit = search(st.lastIndex - 40, st.lastIndex + 40);
      if (hit.idx < 0 || hit.d2 > 30 * 30) hit = search(0, n - 1);
      st.lastIndex = hit.idx;
      return hit;
    });
    let best = 0;
    hits.forEach((h, i) => { if (h.d2 < hits[best].d2) best = i; });
    if (best !== this.activePath && hits[this.activePath].d2 <= hits[best].d2 + 4) best = this.activePath;   // hysteresis (~2 m)
    if (best !== this.activePath) { this.activePath = best; this.paths[best].trackU = null; }
    const st = this.paths[this.activePath], hit = hits[this.activePath];
    const pts = st.pts, n = pts.length, closed = st.closed;
    const at = (i: number): THREE.Vector3 => pts[closed ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i))];

    // Closest point on the polyline (not just the nearest sample): keeps the corridor wall and the height continuous,
    // otherwise the car steps up/down every ~2 m sample and bobs. Several segments around the nearest sample are tested
    // because samples are not evenly spaced (clusters of 0.8 m next to 2 m gaps).
    const project = (a: THREE.Vector3, b: THREE.Vector3): { t: number; qx: number; qz: number; d2: number } => {
      const abx = b.x - a.x, abz = b.z - a.z, len2 = abx * abx + abz * abz || 1;
      const t = THREE.MathUtils.clamp(((p.x - a.x) * abx + (p.z - a.z) * abz) / len2, 0, 1);
      const qx = a.x + abx * t, qz = a.z + abz * t;
      return { t, qx, qz, d2: (p.x - qx) ** 2 + (p.z - qz) ** 2 };
    };
    let seg = project(at(hit.idx - 4), at(hit.idx - 3));
    let segK = -4;
    for (let k = -3; k <= 3; k++) {
      const cand = project(at(hit.idx + k), at(hit.idx + k + 1));
      if (cand.d2 < seg.d2) { seg = cand; segK = k; }
    }
    // Position along the route as a fractional sample index. On the inside of a bend the closest point can jump between
    // two branches of the road; the car cannot, so limit how fast the tracked position may advance (+ a little slack).
    const wrapU = (u: number): number => (closed ? (u + n) % n : Math.min(n - 1, Math.max(0, u)));
    const uCand = wrapU(hit.idx + segK + seg.t);
    if (st.trackU === null) st.trackU = uCand;
    let du = uCand - st.trackU;
    if (closed) { if (du > n / 2) du -= n; else if (du < -n / 2) du += n; }
    if (Math.abs(du) > 25) st.trackU = uCand;                       // teleport (respawn, map change)
    else {
      const spacing = 2.0;
      const maxDu = (Math.abs(car.speed) * dt * 1.5 + 0.2) / spacing;
      st.trackU = wrapU(st.trackU + THREE.MathUtils.clamp(du, -maxDu, maxDu));
    }
    // One-way gate: coming from the far side (having passed it) the car cannot get back across; forwards is free
    if (this.goalIndex !== null && this.activePath === 0 && closed) {
      const half = n / 2, g = this.goalIndex;
      const d = ((st.trackU - g + half) % n + n) % n - half;   // samples past the gate (negative = still before it)
      const pd = this.prevGateD;
      if (pd !== null && pd >= 0 && pd < 10 && d < 0 && d > -10) {
        const gi = Math.floor(g), f = new THREE.Vector3().subVectors(at(gi + 1), at(gi)).setY(0).normalize();
        const push = (0.1 - d) * 2.0;                            // ~2 m per sample: back onto the far side of the gate
        p.x += f.x * push;
        p.z += f.z * push;
        st.trackU = wrapU(g + 0.1);
        if (car.speed < 0) car.speed = 0;
        this.prevGateD = 0.1;
      } else {
        this.prevGateD = d;
      }
    }
    const u0 = Math.floor(st.trackU), uf = st.trackU - u0;
    const rA = at(u0), rB = at(u0 + 1);
    const surfaceY = rA.y + (rB.y - rA.y) * uf;
    const dist = Math.sqrt(seg.d2);
    if (dist > this.corridorHalfWidth) {
      // Push back to the corridor edge and scrub speed (soft "wall")
      const k = this.corridorHalfWidth / dist;
      p.x = seg.qx + (p.x - seg.qx) * k;
      p.z = seg.qz + (p.z - seg.qz) * k;
      car.speed *= Math.pow(0.55, dt);                                // light scrape: ~45% per second while touching
    }

    // Surface height from the road profile + slope-aligned pitch
    const a = at(u0 - 3), b = at(u0 + 3);
    const run = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    const slope = (b.y - a.y) / run;
    const along = Math.sign((b.x - a.x) * Math.sin(car.rotationY) + (b.z - a.z) * Math.cos(car.rotationY)) || 1;
    let lift = this.carLift, pitchSlope = slope;
    if (this.gradeEffect > 0 && this.activePath === 0) {
      // Gradient and vertical curvature come from a heavily smoothed copy of the profile, interpolated along the route:
      // sample-to-sample noise of the baked heights must not reach the car's speed or ride height.
      const g = (this.grade ??= this.buildGrade());
      const i0 = ((u0 % n) + n) % n, i1 = (i0 + 1) % n;
      const gSlope = g.slope[i0] + (g.slope[i1] - g.slope[i0]) * uf, gKappa = g.kappa[i0] + (g.kappa[i1] - g.kappa[i0]) * uf;
      // continuous (cos) instead of sign: no flip-flopping while the car is sideways to the road (drifting, hairpins)
      const alongC = ((b.x - a.x) * Math.sin(car.rotationY) + (b.z - a.z) * Math.cos(car.rotationY)) / run;
      car.speed -= 9.8 * this.gradeEffect * gSlope * alongC * dt;   // speed is signed along the heading
      const vMax = car.maxSpeed * 1.28;   // room for a drift boost
      if (car.speed > vMax) car.speed = vMax;
      // pressed into a dip, light over a crest
      const target = THREE.MathUtils.clamp(-car.speed * car.speed * gKappa * 0.1, -0.15, 0.2);
      this.heave += (target - this.heave) * Math.min(1, 4 * dt);
      lift += this.heave;
      pitchSlope = gSlope * Math.abs(alongC);
    }
    p.y = surfaceY + lift;
    car.groundPitch += (-Math.atan(pitchSlope * along) - car.groundPitch) * 0.15;

    // Traffic obstacle collision check (Same-lane other cars)
    if (this.traffic) {
      const tCol = this.traffic.checkPlayerCollision(p, car.rotationY, car.speed);
      if (tCol.hit) {
        car.applyKnockback(tCol.pushX, tCol.pushZ, tCol.impact, tCol.isRearEnd, tCol.knockX, tCol.knockZ, tCol.fresh, tCol.turn);
        if (tCol.fresh) {
          car.speed = car.speed * tCol.speedFactor + tCol.speedAdd;
          audio.sfx.crash(tCol.impact);
          this.reportCrash(car, p, tCol.impact, '一般車');
        }
      }
    }
  }

  /** Moving-average (+-`half` samples, ~2 m apart) slope and vertical curvature of the closed route. */
  private buildGrade(half = 10): { slope: Float32Array; kappa: Float32Array } {
    const r = this.road, n = r.length, W = 2 * half + 1;
    const runOf = (i: number, k: number): number => Math.hypot(r[(i + k) % n].x - r[(i - k + n * 4) % n].x, r[(i + k) % n].z - r[(i - k + n * 4) % n].z) || 1;
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) raw[i] = (r[(i + 4) % n].y - r[(i - 4 + n) % n].y) / runOf(i, 4);
    const avg = (src: Float32Array): Float32Array => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) { let sum = 0; for (let k = -half; k <= half; k++) sum += src[(i + k + n * 4) % n]; out[i] = sum / W; }
      return out;
    };
    const slope = avg(raw), kappa = new Float32Array(n);
    for (let i = 0; i < n; i++) kappa[i] = (slope[(i + half) % n] - slope[(i - half + n) % n]) / runOf(i, half);
    return { slope, kappa: avg(kappa) };
  }

  public override onRespawn(car: CarController): void {
    if (this.disposed) return;
    // forget where the car was: the tracked position is rate-limited, so after a restart from near the finish line it would
    // crawl to the start and the car would hang at the wrong height (falling onto the road) for seconds
    for (const st of this.paths) { st.trackU = null; st.lastIndex = 0; }
    this.activePath = 0;
    this.heave = 0;
    this.prevGateD = null;
    car.groundPitch = 0;
    this.constrainCar(car, 0);                                   // sit on the road surface right now
    car.syncTransform();
  }

  public override getRoutePoints(): THREE.Vector3[] | null { return this.road; }
  public override getCarLift(): number { return this.carLift; }
  public override getGradeEffect(): number { return this.gradeEffect; }

  public override getSurfaceY(pos: { x: number; z: number }): number {
    if (!this.road || this.road.length === 0) return 0;
    let bestD2 = Infinity;
    let bestY = this.road[0].y;
    const allPaths = [this.road, ...this.branches];
    for (let pIdx = 0; pIdx < allPaths.length; pIdx++) {
      const pts = allPaths[pIdx];
      if (!pts || pts.length === 0) continue;
      for (let i = 0; i < pts.length; i += 2) {
        const pt = pts[i];
        const dx = pt.x - pos.x;
        const dz = pt.z - pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestY = pt.y;
        }
      }
    }
    return bestY;
  }

  public override update(dt: number, carPosition: THREE.Vector3): void {
    this.traffic?.update(dt, carPosition);
  }

  public override getProgressFraction(): number {
    const mainPath = this.paths[0];
    if (!mainPath || mainPath.trackU === null || this.road.length === 0) return 0;
    return (mainPath.trackU / this.road.length + 1.0) % 1.0;
  }
}

