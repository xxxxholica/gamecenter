import * as THREE from 'three';

/**
 * 爆発エフェクト。閃光・火球・煙・火花・破片・地面の衝撃波・一瞬の照り返しを重ねて、
 * 1つの爆発に見せる。粒子はスプライトを使い回す(爆発のたびにマテリアルを作らない)。
 */

type Kind = 'flash' | 'fire' | 'smoke' | 'spark' | 'debris' | 'tint';
type BatchKey = 'smoke' | 'smokeTop' | 'debris' | 'fire' | 'fireTop' | 'glow' | 'glowTop' | 'tint';

interface Fx {
  pos: THREE.Vector3;
  kind: Kind;
  vel: THREE.Vector3;
  drag: number; // 1秒あたりの速度の残り割合(小さいほどすぐ減速)
  gravity: number;
  life: number;
  maxLife: number;
  size0: number;
  size1: number;
  rot: number;
  spin: number;
  alpha: number; // 不透明度の倍率
  /** 'tint' の粒子だけが使う、開始と終了の色(寿命に沿って変わる) */
  c0: THREE.Color;
  c1: THREE.Color;
  noDepth: boolean;
  active: boolean;
}

interface Batch {
  mesh: THREE.Mesh;
  geo: THREE.InstancedBufferGeometry;
  posSize: THREE.InstancedBufferAttribute;
  colorAlpha: THREE.InstancedBufferAttribute;
  rot: THREE.InstancedBufferAttribute;
  count: number;
}

interface Ring {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  r1: number;
  active: boolean;
}

interface Burn {
  pos: THREE.Vector3;
  time: number;
  scale: number;
  accum: number;
}

// 色はリニア値。足し合わせ(加算合成)で白く飛ばないよう、全体にやや暗めにしてある。
const FIRE_COLORS = [
  new THREE.Color(1.0, 0.62, 0.2), // 明るい橙
  new THREE.Color(0.95, 0.3, 0.05), // 橙赤
  new THREE.Color(0.5, 0.07, 0.015), // 赤
  new THREE.Color(0.03, 0.012, 0.008), // 煤
];

const BILLBOARD_VERT = /* glsl */ `
  attribute vec4 aPosSize;
  attribute vec4 aColorAlpha;
  attribute float aRot;
  varying vec2 vUv;
  varying vec4 vColorAlpha;
  void main() {
    vUv = uv;
    vColorAlpha = aColorAlpha;
    float c = cos(aRot);
    float s = sin(aRot);
    vec2 aligned = position.xy * aPosSize.w;
    vec2 rotated = vec2(c * aligned.x - s * aligned.y, s * aligned.x + c * aligned.y);
    vec4 mvPosition = modelViewMatrix * vec4(aPosSize.xyz, 1.0);
    mvPosition.xy += rotated;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

// 粒は半分の解像度の描画先に描いてから画面に重ねる(HalfResFx)。描画先へは three.js のトーンマッピングと sRGB への変換が
// かからないので、画面に直接描いていた時と同じ色になるよう、ここで同じ計算(ACES Filmic と sRGB)をする
const BILLBOARD_FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uExposure;
  varying vec2 vUv;
  varying vec4 vColorAlpha;
  vec3 rrtAndOdtFit(vec3 v) {
    vec3 a = v * (v + 0.0245786) - 0.000090537;
    vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
    return a / b;
  }
  vec3 acesFilmic(vec3 color) {
    const mat3 inputMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
    const mat3 outputMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
    color *= uExposure / 0.6;
    return clamp(outputMat * rrtAndOdtFit(inputMat * color), 0.0, 1.0);
  }
  vec3 linearToSrgb(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }
  void main() {
    vec4 texel = texture2D(uMap, vUv);
    gl_FragColor = vec4(linearToSrgb(acesFilmic(vColorAlpha.rgb * texel.rgb)), texel.a * vColorAlpha.a);
  }
`;

/** 爆発の粒だけを載せるレイヤー(本番の描画からは外し、HalfResFx が半分の解像度で描く) */
export const FX_LAYER = 1;

function makeGlowTexture(inner: string, mid: string, outer: string, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 縁だけを少しぼかした、ほぼ均一な円(火花・土煙など、単色の粒用) */
function makeDiscTexture(size = 64): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.72, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 色の指定(16進)を、リニア値の Color に直したものを使い回す(粒子ごとに Color を作らない) */
const colorCache = new Map<number, THREE.Color>();
function cachedColor(hex: number): THREE.Color {
  let c = colorCache.get(hex);
  if (!c) {
    c = new THREE.Color(hex);
    colorCache.set(hex, c);
  }
  return c;
}

/** ふんわりした煙の塊。縁をわずかに不揃いにして、丸い円盤に見えないようにする */
function makeSmokeTexture(size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  for (let i = 0; i < 9; i++) {
    const r = size * (0.2 + Math.random() * 0.16);
    const x = size / 2 + (Math.random() - 0.5) * size * 0.34;
    const y = size / 2 + (Math.random() - 0.5) * size * 0.34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ExplosionFx {
  private scene: THREE.Scene;
  private pool: Fx[] = [];
  /** 使っていない粒(pool の中)。粒を出すたびに pool を端から調べると、爆発で数百個出すときに O(n²) になる(Chrome で約5ms、Firefox で約15ms) */
  private freeList: Fx[] = [];
  /** 動いている粒の数 */
  private activeN = 0;
  private batches: Record<BatchKey, Batch>;
  private rings: Ring[] = [];
  private burns: Burn[] = [];

  private texGlow: THREE.CanvasTexture;
  private texFire: THREE.CanvasTexture;
  private texSmoke: THREE.CanvasTexture;
  private texDisc: THREE.CanvasTexture;
  private ringGeo = new THREE.RingGeometry(0.82, 1, 48);

  // 爆発の一瞬だけ周りを照らす光(動的に増減すると描画の準備が走るので、1つを使い回す)
  private light: THREE.PointLight;
  private lightLife = 0;
  private lightMax = 0.001;
  private lightPeak = 0;

  private static readonly MAX_FX = 1800;

  /** 粒の色のトーンマッピングの露出(renderer.toneMappingExposure と同じ値にする。HalfResFx が毎フレーム合わせる) */
  public readonly exposure = { value: 1 };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.texGlow = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)');
    this.texFire = makeGlowTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0.8)', 'rgba(255,255,255,0)');
    this.texSmoke = makeSmokeTexture();
    this.texDisc = makeDiscTexture();

    this.batches = {
      smoke: this.createBatch(this.texSmoke, THREE.NormalBlending, true, 0),
      smokeTop: this.createBatch(this.texSmoke, THREE.NormalBlending, false, 10),
      debris: this.createBatch(this.texGlow, THREE.NormalBlending, true, 0),
      fire: this.createBatch(this.texFire, THREE.AdditiveBlending, true, 0),
      fireTop: this.createBatch(this.texFire, THREE.AdditiveBlending, false, 10),
      glow: this.createBatch(this.texGlow, THREE.AdditiveBlending, true, 0),
      glowTop: this.createBatch(this.texGlow, THREE.AdditiveBlending, false, 10),
      tint: this.createBatch(this.texDisc, THREE.NormalBlending, true, 0),
    };

    this.light = new THREE.PointLight(0xffa040, 0, 18, 1.6);
    this.light.visible = true;
    scene.add(this.light);
    this.spawnRing(new THREE.Vector3(0, -100, 0), 0.1, 0.001);
  }

  private createBatch(tex: THREE.Texture, blending: THREE.Blending, depthTest: boolean, renderOrder: number): Batch {
    const base = new THREE.PlaneGeometry(1, 1);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index;
    geo.attributes.position = base.attributes.position;
    geo.attributes.uv = base.attributes.uv;

    const posSize = new THREE.InstancedBufferAttribute(new Float32Array(ExplosionFx.MAX_FX * 4), 4);
    const colorAlpha = new THREE.InstancedBufferAttribute(new Float32Array(ExplosionFx.MAX_FX * 4), 4);
    const rot = new THREE.InstancedBufferAttribute(new Float32Array(ExplosionFx.MAX_FX), 1);
    posSize.setUsage(THREE.DynamicDrawUsage);
    colorAlpha.setUsage(THREE.DynamicDrawUsage);
    rot.setUsage(THREE.DynamicDrawUsage);

    geo.setAttribute('aPosSize', posSize);
    geo.setAttribute('aColorAlpha', colorAlpha);
    geo.setAttribute('aRot', rot);
    geo.instanceCount = 1;

    const mat = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: tex }, uExposure: this.exposure },
      vertexShader: BILLBOARD_VERT,
      fragmentShader: BILLBOARD_FRAG,
      transparent: true,
      depthWrite: false,
      depthTest,
      blending,
    });
    if (blending === THREE.AdditiveBlending) {
      // 加算の粒は、描画先の不透明度(=後ろの画面を隠す割合)を増やさない。重ねる時に後ろが暗くならないように
      mat.blending = THREE.CustomBlending;
      mat.blendSrc = THREE.SrcAlphaFactor;
      mat.blendDst = THREE.OneFactor;
      mat.blendSrcAlpha = THREE.ZeroFactor;
      mat.blendDstAlpha = THREE.OneFactor;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.layers.set(FX_LAYER);
    mesh.frustumCulled = false;
    mesh.renderOrder = renderOrder;
    mesh.visible = true;
    this.scene.add(mesh);

    return { mesh, geo, posSize, colorAlpha, rot, count: 0 };
  }

  /** 描く粒があるか(なければ HalfResFx は半分の解像度の描画を省く) */
  public hasVisibleBatch(): boolean {
    for (const k of Object.keys(this.batches) as BatchKey[]) if (this.batches[k].mesh.visible) return true;
    return false;
  }

  /** 粒の描画呼び出しを全部出させる(起動時にシェーダを作っておくため)。戻り値で元に戻す */
  public forceVisible(): () => void {
    const prev = (Object.keys(this.batches) as BatchKey[]).map((k) => [this.batches[k].mesh, this.batches[k].mesh.visible] as const);
    for (const [mesh] of prev) mesh.visible = true;
    return () => { for (const [mesh, v] of prev) mesh.visible = v; };
  }

  private acquire(kind: Kind): Fx {
    const free = this.freeList.pop();
    if (free) {
      this.configure(free, kind);
      return free;
    }
    const fx: Fx = {
      pos: new THREE.Vector3(),
      kind,
      vel: new THREE.Vector3(),
      drag: 1,
      gravity: 0,
      life: 0,
      maxLife: 1,
      size0: 1,
      size1: 1,
      rot: 0,
      spin: 0,
      alpha: 1,
      c0: new THREE.Color(),
      c1: new THREE.Color(),
      noDepth: false,
      active: false,
    };
    this.pool.push(fx);
    this.configure(fx, kind);
    return fx;
  }

  private configure(fx: Fx, kind: Kind) {
    fx.kind = kind;
    fx.rot = Math.random() * Math.PI * 2;
    fx.spin = (Math.random() - 0.5) * 2.0;
  }

  private activeCount(): number {
    return this.activeN;
  }

  private spawn(
    kind: Kind,
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    size0: number,
    size1: number,
    drag: number,
    gravity: number,
    alpha: number = 1
  ): Fx | null {
    if (this.activeCount() >= ExplosionFx.MAX_FX) return null;
    const fx = this.acquire(kind);
    fx.active = true;
    this.activeN++;
    fx.life = 0;
    fx.maxLife = life;
    fx.size0 = size0;
    fx.size1 = size1;
    fx.drag = drag;
    fx.gravity = gravity;
    fx.alpha = alpha;
    fx.vel.copy(vel);
    // 画面を覆うほど大きい粒子は、観客席や土俵の形と交差して硬い角が出るので、奥行き判定を切る
    fx.noDepth = Math.max(size0, size1) > 6;
    fx.pos.copy(pos);
    return fx;
  }

  /**
   * 単色の小さな粒(火花・土煙・風切り・チャージの光)を1つ出す。寿命に沿って c0 → c1 へ色が変わり、薄れて消える。
   * radius0 / radius1 は粒の半径(m)。粒ごとの Mesh や Color を作らず、同じ描画呼び出しにまとめる。
   */
  public emitTint(
    pos: THREE.Vector3,
    vel: THREE.Vector3,
    life: number,
    radius0: number,
    radius1: number,
    color0: number,
    color1: number
  ) {
    // 板の1辺が直径に当たる(球の半径の2倍)
    const fx = this.spawn('tint', pos, vel, life, radius0 * 2, radius1 * 2, 1, 0);
    if (!fx) return;
    fx.c0.copy(cachedColor(color0));
    fx.c1.copy(cachedColor(color1));
  }

  private static rand(a: number, b: number): number {
    return a + Math.random() * (b - a);
  }

  /** 爆発を起こす。scale: 0.4 = 小さな当たり / 1.0 = 強い当たり / 2.5 以上 = 場外の大爆発 */
  public explode(pos: THREE.Vector3, scale: number) {
    const R = ExplosionFx.rand;
    const s = scale;
    // 粒の数は大きな爆発でも増えすぎないよう、3を超えた分は半分の勢いで増やす
    const c = s <= 3 ? s : 3 + (s - 3) * 0.45;
    // 巨大な爆発で1枚ごとの粒子が画面全体を何十枚も覆ってGPUの塗りつぶし負荷が跳ね上がるのを防ぐ
    const sz = s <= 2.0 ? s : 2.0 + (s - 2.0) * 0.45;
    const v = new THREE.Vector3();
    const p = new THREE.Vector3();

    // 1. 閃光(一瞬だけ画面を白く焼く)
    this.spawn('flash', pos, v.set(0, 0, 0), 0.11, 1.4 * sz, 3.4 * sz, 1, 0);

    // 2. 火球の芯(大きく膨らみ、すぐ赤くなる)
    this.spawn('fire', pos, v.set(0, 0.8 * s, 0), 0.55, 1.0 * sz, 3.0 * sz, 0.4, 0);

    // 3. 炎の塊(外へ飛び散りながら膨らむ)
    const nFire = Math.round(5 + 11 * c);
    for (let i = 0; i < nFire; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = R(1.5, 5.0) * (0.6 + 0.5 * s);
      v.set(Math.cos(a) * sp, R(0.5, 4.0) * (0.6 + 0.4 * s), Math.sin(a) * sp);
      p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.4 * s, (Math.random() - 0.3) * 0.4 * s, (Math.random() - 0.5) * 0.4 * s));
      this.spawn('fire', p, v, R(0.35, 0.75), R(0.45, 0.8) * sz, R(1.1, 1.9) * sz, 0.12, 0);
    }

    // 4. 煙(遅れて立ち上り、長く残る)
    const nSmoke = Math.round((4 + 7 * c) * (s > 3 ? 0.5 : 1));
    for (let i = 0; i < nSmoke; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = R(0.6, 2.4) * (0.6 + 0.4 * s);
      v.set(Math.cos(a) * sp, R(1.2, 3.2) * (0.7 + 0.3 * s), Math.sin(a) * sp);
      p.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.5 * s, R(-0.1, 0.5) * s, (Math.random() - 0.5) * 0.5 * s));
      const huge = s > 3;
      // 大爆発の煙は、画面が真っ暗にならないよう、薄く短くする
      this.spawn(
        'smoke',
        p,
        v,
        Math.min(huge ? 1.5 : 2.8, R(1.1, 2.2) * (0.8 + 0.1 * Math.min(s, 3))),
        R(0.7, 1.1) * sz,
        R(2.2, 3.8) * sz,
        0.35,
        -0.6,
        huge ? 0.22 : 1
      );
    }

    // 5. 火花(細かく速く飛び、重力で落ちる)
    const nSpark = Math.round(12 + 26 * c);
    for (let i = 0; i < nSpark; i++) {
      const a = Math.random() * Math.PI * 2;
      const el = R(-0.1, 1.0);
      const sp = R(6, 17) * (0.6 + 0.4 * s);
      v.set(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp + 2, Math.sin(a) * Math.cos(el) * sp);
      this.spawn('spark', pos, v, R(0.35, 0.9), R(0.1, 0.2), 0.03, 0.5, 20);
    }

    // 6. 破片(砂と欠片が弧を描いて落ちる)
    const nDebris = Math.round(3 + 8 * c);
    for (let i = 0; i < nDebris; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = R(3, 9) * (0.6 + 0.4 * s);
      v.set(Math.cos(a) * sp, R(4, 11) * (0.6 + 0.4 * s), Math.sin(a) * sp);
      this.spawn('debris', pos, v, R(0.7, 1.4), R(0.12, 0.28), R(0.08, 0.18), 0.7, 22);
    }

    // 7. 地面を走る衝撃波
    this.spawnRing(pos, 1.3 + 2.8 * s, 0.38 + 0.12 * s);

    // 8. 照り返し
    this.flashLight(pos, 3 + 8 * s, 0.22 + 0.1 * s, 12 + 6 * s);
  }

  private spawnRing(pos: THREE.Vector3, r1: number, life: number) {
    let ring = this.rings.find((r) => !r.active);
    if (!ring) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff8a30,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      ring = { mesh, life: 0, maxLife: 1, r1: 1, active: false };
      this.rings.push(ring);
    }
    ring.active = true;
    ring.life = 0;
    ring.maxLife = life;
    ring.r1 = r1;
    ring.mesh.position.set(pos.x, Math.max(0.08, pos.y - 0.9), pos.z);
    ring.mesh.scale.set(0.3, 0.3, 0.3);
    ring.mesh.visible = true;
  }

  private flashLight(pos: THREE.Vector3, peak: number, life: number, dist: number) {
    this.light.position.copy(pos);
    this.light.distance = dist;
    this.lightPeak = Math.max(this.lightPeak * (this.lightLife / this.lightMax), peak);
    this.lightMax = life;
    this.lightLife = life;
    this.light.visible = true;
  }

  /** 爆発の跡が燃え続ける(煙と小さな炎が時間をかけて消える)。客席の爆破跡など */
  public burn(pos: THREE.Vector3, seconds: number, scale: number) {
    this.burns.push({ pos: pos.clone(), time: seconds, scale, accum: 0 });
  }

  public update(dt: number) {
    for (const k of Object.keys(this.batches) as BatchKey[]) {
      this.batches[k].count = 0;
    }

    const tmp = new THREE.Color();
    for (const fx of this.pool) {
      if (!fx.active) continue;
      fx.life += dt;
      if (fx.life >= fx.maxLife) {
        fx.active = false;
        this.activeN--;
        this.freeList.push(fx);
        continue;
      }
      const t = fx.life / fx.maxLife;

      // 移動(空気抵抗と重力)
      fx.vel.multiplyScalar(Math.pow(fx.drag, dt));
      fx.vel.y -= fx.gravity * dt;
      fx.pos.addScaledVector(fx.vel, dt);
      // 地面より下には潜らせない
      if (fx.kind === 'debris' || fx.kind === 'spark') {
        if (fx.pos.y < 0.05) {
          fx.pos.y = 0.05;
          fx.vel.y *= -0.3;
          fx.vel.x *= 0.6;
          fx.vel.z *= 0.6;
        }
      }

      const size = fx.size0 + (fx.size1 - fx.size0) * (fx.kind === 'smoke' ? Math.sqrt(t) : t);
      fx.rot += fx.spin * dt;

      let r = 1;
      let g = 1;
      let b = 1;
      let opacity = 1;

      if (fx.kind === 'fire') {
        // 白 → 橙 → 赤 → 煤 の順に色が変わり、後半で薄れる
        const k = t * 3;
        const i = Math.min(2, Math.floor(k));
        tmp.copy(FIRE_COLORS[i]).lerp(FIRE_COLORS[i + 1], k - i);
        r = tmp.r;
        g = tmp.g;
        b = tmp.b;
        opacity = Math.min(0.75, (1 - t) * 1.2);
      } else if (fx.kind === 'flash') {
        r = 1.0;
        g = 0.55;
        b = 0.22;
        opacity = (1 - t) * 0.7;
      } else if (fx.kind === 'smoke') {
        // 立ち上がりは焼けた色、すぐ灰色になる
        const warm = Math.max(0, 1 - t * 4);
        r = 0.035 + warm * 0.4;
        g = 0.032 + warm * 0.12;
        b = 0.03 + warm * 0.03;
        opacity = Math.min(1, t * 8) * (1 - t) * 0.5;
      } else if (fx.kind === 'tint') {
        tmp.copy(fx.c0).lerp(fx.c1, t);
        r = tmp.r;
        g = tmp.g;
        b = tmp.b;
        opacity = (1 - t) * 0.9;
      } else if (fx.kind === 'spark') {
        r = 1;
        g = 0.5 - t * 0.3;
        b = 0.1;
        opacity = 1 - t;
      } else {
        r = 0.08;
        g = 0.055;
        b = 0.035;
        opacity = (1 - t) * 0.95;
      }
      opacity *= fx.alpha;

      let key: BatchKey;
      if (fx.kind === 'smoke') key = fx.noDepth ? 'smokeTop' : 'smoke';
      else if (fx.kind === 'debris') key = 'debris';
      else if (fx.kind === 'tint') key = 'tint';
      else if (fx.kind === 'fire') key = fx.noDepth ? 'fireTop' : 'fire';
      else key = fx.noDepth ? 'glowTop' : 'glow';

      const batch = this.batches[key];
      const idx = batch.count++;
      const i4 = idx * 4;
      const ps = batch.posSize.array as Float32Array;
      ps[i4] = fx.pos.x;
      ps[i4 + 1] = fx.pos.y;
      ps[i4 + 2] = fx.pos.z;
      ps[i4 + 3] = size;

      const ca = batch.colorAlpha.array as Float32Array;
      ca[i4] = r;
      ca[i4 + 1] = g;
      ca[i4 + 2] = b;
      ca[i4 + 3] = opacity;

      (batch.rot.array as Float32Array)[idx] = fx.rot;
    }

    for (const k of Object.keys(this.batches) as BatchKey[]) {
      const batch = this.batches[k];
      batch.geo.instanceCount = batch.count;
      batch.mesh.visible = batch.count > 0;
      if (batch.count > 0) {
        batch.posSize.needsUpdate = true;
        batch.colorAlpha.needsUpdate = true;
        batch.rot.needsUpdate = true;
      }
    }

    for (const ring of this.rings) {
      if (!ring.active) continue;
      ring.life += dt;
      if (ring.life >= ring.maxLife) {
        ring.active = false;
        ring.mesh.visible = false;
        continue;
      }
      const t = ring.life / ring.maxLife;
      const r = 0.3 + (ring.r1 - 0.3) * (1 - Math.pow(1 - t, 3));
      ring.mesh.scale.set(r, r, r);
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.5;
    }

    // 照り返しの減衰
    if (this.lightLife > 0) {
      this.lightLife = Math.max(0, this.lightLife - dt);
      const k = this.lightLife / this.lightMax;
      this.light.intensity = this.lightPeak * k * k;
      if (this.lightLife === 0) {
        this.light.intensity = 0;
        this.lightPeak = 0;
      }
    }

    // 燃え続ける跡
    for (let i = this.burns.length - 1; i >= 0; i--) {
      const b = this.burns[i];
      b.time -= dt;
      if (b.time <= 0) {
        this.burns.splice(i, 1);
        continue;
      }
      b.accum += dt;
      while (b.accum > 0.09) {
        b.accum -= 0.09;
        const R = ExplosionFx.rand;
        const p = new THREE.Vector3(b.pos.x + R(-1, 1) * b.scale, b.pos.y + R(0, 0.5), b.pos.z + R(-1, 1) * b.scale);
        this.spawn('smoke', p, new THREE.Vector3(R(-0.3, 0.3), R(1.5, 3), R(-0.3, 0.3)), R(1.4, 2.4), 0.8, R(2.4, 3.6), 0.5, -0.4);
        if (Math.random() < 0.45) {
          this.spawn('fire', p, new THREE.Vector3(0, R(1, 2.5), 0), R(0.3, 0.6), 0.5, 1.0, 0.3, 0);
        }
      }
    }
  }

  /** すべての爆発粒子・衝撃波・残り火・照り返しを即座に消す */
  public clear() {
    for (const fx of this.pool) {
      if (fx.active) {
        fx.active = false;
        this.freeList.push(fx);
      }
    }
    this.activeN = 0;
    for (const k of Object.keys(this.batches) as BatchKey[]) {
      const batch = this.batches[k];
      batch.count = 0;
      batch.geo.instanceCount = 0;
      batch.mesh.visible = false;
    }
    for (const ring of this.rings) {
      ring.active = false;
      ring.mesh.visible = false;
    }
    this.burns.length = 0;
    this.lightLife = 0;
    this.lightPeak = 0;
    this.light.intensity = 0;
  }
}
