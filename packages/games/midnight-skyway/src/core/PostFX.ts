import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * 画面全体にかける後処理: ブルーム(明るい部分のにじみ) → トーンマッピング → 色調補正(陰影の色の乗せ・彩度・
 * コントラスト・ビネット・フィルムグレイン)。車・街・道路・空を同じ調子に揃える。
 * 昼と夜でプリセットを切り替える。URL に ?fx=0 を付けると無効(比較用)。
 */

interface Preset {
  bloomStrength: number;
  bloomRadius: number;
  bloomThreshold: number;
  contrast: number;
  saturation: number;
  /** 影の側に乗せる色 / 明るい側に乗せる色(表示色空間の加算値) */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  vignette: number;
  grain: number;
}

const PRESETS: Record<'day' | 'night', Preset> = {
  // 夜: 青緑の影と暖色の明かり。ネオンと窓の光をにじませる
  night: {
    bloomStrength: 0.28, bloomRadius: 0.35, bloomThreshold: 0.95,
    contrast: 1.08, saturation: 1.1,
    shadowTint: [-0.012, 0.02, 0.038], highlightTint: [0.035, 0.014, -0.018],
    vignette: 0.38, grain: 0.026,
  },
  // 昼: 少し暖色寄りの落ち着いたフィルム調。彩度を抑えて街の灰色と揃える
  day: {
    bloomStrength: 0.08, bloomRadius: 0.3, bloomThreshold: 1.0,
    contrast: 1.05, saturation: 0.98,
    shadowTint: [0.0, 0.008, 0.022], highlightTint: [0.016, 0.009, -0.006],
    vignette: 0.24, grain: 0.018,
  },
};

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uContrast: { value: 1 },
    uSaturation: { value: 1 },
    uShadowTint: { value: new THREE.Vector3() },
    uHighlightTint: { value: new THREE.Vector3() },
    uVignette: { value: 0 },
    uGrain: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uContrast, uSaturation, uVignette, uGrain, uTime;
    uniform vec3 uShadowTint, uHighlightTint;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // 彩度とコントラスト(中間灰を軸に)
      c = mix(vec3(luma), c, uSaturation);
      c = (c - 0.5) * uContrast + 0.5;
      // 陰影ごとの色の乗せ(スプリットトーン)
      luma = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.5, luma)) + uHighlightTint * smoothstep(0.45, 1.0, luma);
      // ビネット(周辺減光)
      float d = distance(vUv, vec2(0.5)) * 1.4142;
      c *= 1.0 - uVignette * smoothstep(0.35, 1.0, d);
      // フィルムグレイン(暗い所ほど目立たせる)
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 61.0) - 0.5;
      c += n * uGrain * (1.15 - luma);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

export class PostFX {
  public enabled = true;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly grade: ShaderPass;
  private readonly clock = new THREE.Clock();
  private width = 0;
  private height = 0;
  private pixelRatio = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    // 半精度の浮動小数点(明るさが1を超える値を保つ) + 4倍MSAA(後処理を通してもジャギーが増えないように)
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());                                  // トーンマッピング(ACES)とsRGB変換は、ここで1回だけ
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.setTimeOfDay('day');
    this.enabled = new URLSearchParams(location.search).get('fx') !== '0';
  }

  public setTimeOfDay(t: 'day' | 'night'): void {
    const p = PRESETS[t];
    this.bloom.strength = p.bloomStrength;
    this.bloom.radius = p.bloomRadius;
    this.bloom.threshold = p.bloomThreshold;
    this.bloom.enabled = p.bloomStrength >= 0.1;   // ほぼ見えない強さなら、ブルームの全画面パスごと省く(昼)
    const u = this.grade.uniforms;
    u.uContrast.value = p.contrast;
    u.uSaturation.value = p.saturation;
    (u.uShadowTint.value as THREE.Vector3).set(...p.shadowTint);
    (u.uHighlightTint.value as THREE.Vector3).set(...p.highlightTint);
    u.uVignette.value = p.vignette;
    u.uGrain.value = p.grain;
  }

  /** 1フレーム描画する。画面サイズや解像度が変わっていたら、描画先も合わせる。 */
  public render(): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    if (size.x !== this.width || size.y !== this.height || pr !== this.pixelRatio) {
      this.width = size.x;
      this.height = size.y;
      this.pixelRatio = pr;
      this.composer.setPixelRatio(pr);
      this.composer.setSize(size.x, size.y);
    }
    this.grade.uniforms.uTime.value = this.clock.elapsedTime;
    this.composer.render(this.clock.getDelta());
  }
}
