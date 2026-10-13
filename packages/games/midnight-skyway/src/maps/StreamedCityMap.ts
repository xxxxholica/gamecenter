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
    this.timer = window.setTimeout(() => {
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
  /**
   * 建物テクスチャの異方性フィルタ。近くのチャンクは4(斜めから見る壁の見え方は十分で、16より GPU のサンプリングが軽い)、
   * 遠景(far tier。縮小テクスチャで、遠くを見るだけ)は1。実機の上限を超えない値にする。
   */
  private chunkAnisotropy = 4;
  /** file → チャンク(updateStreaming が毎回全チャンクを走査しないための索引) */
  private chunkIndex: Map<string, StreamChunk> | null = null;
  /** Chunks whose textures are still being uploaded to the GPU, a few per frame. */
  private uploadJobs: { textures: THREE.Texture[]; resolve: () => void }[] = [];
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
    if (!import.meta.env.DEV) this.pacer = sharedPacer ??= new RequestPacer(this.requestBurst, this.requestIntervalMs);

    const initial = this.wanted(this.startPosition.x, this.startPosition.z, this.loadRadius);
    let loaded = 0;
    this.onProgress?.(0, initial.length);
    await Promise.all(initial.map((c) => this.loadChunk(c, true).then(() => this.onProgress?.(++loaded, initial.length))));
    this.onProgress?.(initial.length, initial.length);
    if (this.hasFarTier) void this.loadFarTier();
  }

  public attachRenderer(renderer: THREE.WebGLRenderer): void {
    this.renderer = renderer;
  }

  /**
   * Uploading a chunk's textures on its first render costs 200-400 ms in one frame (16 x 1024 px + mipmaps).
   * Instead the textures are initialised a few at a time (about 6 ms per frame) before the chunk becomes visible.
   */
  private stageUpload(root: THREE.Object3D, instant = false): Promise<void> {
    const set = new Set<THREE.Texture>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) { const t = (o.material as THREE.MeshBasicMaterial).map; if (t) set.add(t); }
    });
    if (!this.renderer || set.size === 0) return Promise.resolve();

    if (instant) {
      for (const tex of set) {
        try {
          this.renderer.initTexture(tex);
          releaseUploadedImage(tex);
        } catch {
          // ignore texture init errors
        }
      }
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      this.uploadJobs.push({ textures: [...set], resolve });
      this.pumpUploads();
    });
  }

  private pumpUploads(): void {
    if (this.uploadJobs.length === 0 || !this.renderer) return;
    requestAnimationFrame(() => {
      this.tickUploads();
      if (this.uploadJobs.length > 0) {
        this.pumpUploads();
      }
    });
  }

  private tickUploads(): void {
    const r = this.renderer;
    if (!r || this.uploadJobs.length === 0) return;
    const t0 = performance.now();
    while (this.uploadJobs.length > 0 && performance.now() - t0 < 6) {
      const job = this.uploadJobs[0];
      const tex = job.textures.shift();
      if (tex) { r.initTexture(tex); releaseUploadedImage(tex); }
      if (job.textures.length === 0) { this.uploadJobs.shift(); job.resolve(); }
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
          const gltf = await this.loader!.loadAsync(this.modelBase + 'far/' + c.file);
          if (this.disposed) { this.disposeObject(gltf.scene); return; }
          this.chunkAnisotropy = 1;                           // 遠景のテクスチャは縮小済みで、遠くを見るだけ(prepareChunk は同期)
          this.prepareChunk(gltf.scene);
          this.chunkAnisotropy = 4;
          await this.stageUpload(gltf.scene);
          if (this.disposed) { this.disposeObject(gltf.scene); return; }
          const key = this.keyOf(c.file);
          gltf.scene.visible = !this.nearOpaque.has(key);
          this.group.add(gltf.scene);
          this.farObjects.set(key, gltf.scene);
          this.startFade(gltf.scene, this.fadeMs * 1.5, () => {});
        } catch (err) {
          console.warn(`[${this.metadata.id}] far chunk failed`, c.file, err);
        }
      }
    };
    await Promise.all([worker(), worker()]);
  }

  /** Lit material so the city shades under the same sun/sky as the car; casts and receives so buildings ground each other. */
  private prepareChunk(root: THREE.Object3D): void {
    this.roadTube?.carve(root);
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const old = o.material as THREE.MeshStandardMaterial;
      o.material = this.convertMaterial(old);
      old.dispose();
      // PLATEAU chunks ship with no normal attribute at all (fine for the old unlit material, but a lit one needs
      // N·L and renders solid black without it).
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      o.castShadow = true;
      o.receiveShadow = true;
    });
  }

  /** Dither the chunk in (alpha hashing: opaque-pass, no sorting, no see-through overlaps). */
  private startFade(obj: THREE.Object3D, dur: number, done: () => void): void {
    const mats: THREE.Material[] = [];
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) { const m = o.material as THREE.Material; m.alphaHash = true; m.opacity = 0; mats.push(m); }
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

  /** 1 at night, 0 by day: shared by every building material, so switching needs no recompile. */
  private readonly nightUniform = { value: 0 };
  /**
   * The lit windows of the city at night: warm rectangles on the walls of the buildings (procedural, in world space).
   * density = share of windows that are lit, floorH / winW = size of one window cell in metres. Far away they fade to a soft glow.
   */
  protected nightLook = { color: new THREE.Color(1.0, 0.9, 0.68), density: 0.5, floorH: 3.8, winW: 2.6 };

  public override setNight(night: boolean): void {
    this.nightUniform.value = night ? 1 : 0;
  }

  private addNightWindows(mat: THREE.MeshLambertMaterial): void {
    const look = this.nightLook, night = this.nightUniform;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uNight = night;
      shader.uniforms.uWinCol = { value: look.color };
      shader.uniforms.uWinParams = { value: new THREE.Vector3(look.density, look.floorH, look.winW) };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vNightPos;\nvarying vec3 vNightNor;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNightPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNightNor = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
uniform float uNight;
uniform vec3 uWinCol;
uniform vec3 uWinParams;
varying vec3 vNightPos;
varying vec3 vNightNor;`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (uNight > 0.01 && abs(vNightNor.y) < 0.4) {
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
  totalEmissiveRadiance += uWinCol * glow * uNight * (0.6 + 0.4 * fract(r * 7.0));
}`);
    };
    mat.customProgramCacheKey = () => 'city-night-windows';
  }

  private async loadChunk(c: StreamChunk, instant = false): Promise<void> {
    if (!this.loader || this.resident.has(c.file) || this.pending.has(c.file)) return;
    this.pending.add(c.file);
    try {
      await this.pacer?.acquire(0, () => this.disposed);
      if (this.disposed) return;
      const gltf = await this.loader.loadAsync(this.modelBase + c.file);
      if (this.disposed) { this.disposeObject(gltf.scene); return; }
      this.prepareChunk(gltf.scene);
      await this.stageUpload(gltf.scene, instant);
      if (this.disposed) { this.disposeObject(gltf.scene); return; }
      this.group.add(gltf.scene);
      this.resident.set(c.file, gltf.scene);
      const key = this.keyOf(c.file);
      const shown = (): void => {
        this.nearOpaque.add(key);
        const far = this.farObjects.get(key);
        if (far) far.visible = false;
      };
      if (instant || !this.hasFarTier && this.fadeMs <= 0) shown();
      else this.startFade(gltf.scene, this.fadeMs, shown);
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
      m.map?.dispose();
      m.dispose();
    });
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

    // RoadBlockade collision check (Wangan Midnight style barricades)
    if (this.blockade) {
      const col = this.blockade.checkCarCollision(p, 1.2);
      if (col.hit) {
        p.x += col.pushX;
        p.z += col.pushZ;
        car.speed *= Math.max(0.15, 1.0 - col.impact * 0.75);
        audio.sfx.crash(col.impact);
      }
    }

    // Traffic obstacle collision check (Same-lane other cars)
    if (this.traffic) {
      const tCol = this.traffic.checkPlayerCollision(p, car.rotationY, car.speed);
      if (tCol.hit) {
        car.applyKnockback(tCol.pushX, tCol.pushZ, tCol.impact, tCol.isRearEnd, tCol.knockX, tCol.knockZ, tCol.fresh, tCol.turn);
        if (tCol.fresh) {
          car.speed = car.speed * tCol.speedFactor + tCol.speedAdd;
          audio.sfx.crash(tCol.impact);
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
    this.blockade?.update(dt);
  }

  public override getProgressFraction(): number {
    const mainPath = this.paths[0];
    if (!mainPath || mainPath.trackU === null || this.road.length === 0) return 0;
    return (mainPath.trackU / this.road.length + 1.0) % 1.0;
  }
}

