import { IS_FIREFOX } from './browser';
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


/**
 * 濡れた路面の反射(画面空間反射, SSR): 深度から面の向きを復元し、上向きの面(路面・屋根)だけに、
 * 画面内の映像を反射として映す。雨紋のゆらぎ、水たまり(場所による濡れ具合)、フレネル(浅い角度ほど強く映る)、
 * 縦方向のにじみ(濡れた路面のネオンが縦に伸びる)をつける。ブルームの前(リニア空間)で合成する。
 */
const WetShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    uProj: { value: new THREE.Matrix4() },
    uProjInv: { value: new THREE.Matrix4() },
    uView: { value: new THREE.Matrix4() },
    uViewInv: { value: new THREE.Matrix4() },
    uRes: { value: new THREE.Vector2(1, 1) },
    uWet: { value: 0 },
    uTime: { value: 0 },
    uNight: { value: 1 },
    uPrevVP: { value: new THREE.Matrix4() },
    uMotion: { value: 0 },
    /** xy = 自車の画面位置(0〜1)、z = 自車の大きさ(画面の高さに対する半径) */
    uCarUV: { value: new THREE.Vector3(0.5, 0.4, 0.2) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse, tDepth;
    uniform mat4 uProj, uProjInv, uView, uViewInv, uPrevVP;
    uniform vec2 uRes;
    uniform float uWet, uTime, uNight, uMotion;
    uniform vec3 uCarUV;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec2 hash2(vec2 p) { return vec2(hash(p), hash(p + 17.3)); }
    float vnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
    }

    vec3 viewPos(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }

    // 雨粒が落ちてできる波紋: 格子ごとに、時間差で広がる輪(法線のずれを返す)
    vec2 ripples(vec2 p, float t, float scale) {
      vec2 g = p * scale;
      vec2 id = floor(g);
      vec2 f = fract(g) - 0.5;
      vec2 r = hash2(id);
      float ph = fract(t * (0.7 + r.x * 0.5) + r.y);
      vec2 c = (hash2(id + 7.0) - 0.5) * 0.5;
      vec2 d = f - c;
      float dist = length(d);
      float ring = sin((dist - ph * 0.45) * 46.0) * smoothstep(ph * 0.45 + 0.06, ph * 0.45 - 0.1, dist) * smoothstep(0.0, 0.08, ph * 0.45 - dist + 0.1);
      return normalize(d + 1e-4) * ring * (1.0 - ph) * step(0.45, r.x);
    }

    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float depth = texture2D(tDepth, vUv).x;
      // モーションブラー: 1フレーム前のカメラでの位置との差(画面上の動き)に沿ってぼかす。自車の周りはぼかさない
      if (uMotion > 0.001 && depth < 0.99999) {
        vec4 wpm = uViewInv * vec4(viewPos(vUv), 1.0);
        vec4 pc = uPrevVP * wpm;
        vec2 vel = (vUv - (pc.xy / pc.w * 0.5 + 0.5)) * uMotion;
        float vl = length(vel);
        vel *= min(1.0, 0.05 / max(vl, 1e-5));
        float carMask = smoothstep(uCarUV.z, uCarUV.z * 1.6, length((vUv - uCarUV.xy) * vec2(uRes.x / uRes.y, 1.0)));
        vel *= carMask;
        vec3 acc = col;
        for (int i = 1; i < 8; i++) acc += texture2D(tDiffuse, vUv + vel * (float(i) / 7.0 - 0.5)).rgb;
        col = acc / 8.0;
      }
      if (uWet < 0.01 || depth > 0.99999) { gl_FragColor = vec4(col, 1.0); return; }

      vec3 P = viewPos(vUv);
      vec2 px = 1.0 / uRes;
      vec3 Pr = viewPos(vUv + vec2(px.x, 0.0)), Pl = viewPos(vUv - vec2(px.x, 0.0));
      vec3 Pu = viewPos(vUv + vec2(0.0, px.y)), Pd = viewPos(vUv - vec2(0.0, px.y));
      vec3 dx = abs(Pr.z - P.z) < abs(P.z - Pl.z) ? Pr - P : P - Pl;
      vec3 dy = abs(Pu.z - P.z) < abs(P.z - Pd.z) ? Pu - P : P - Pd;
      vec3 n = normalize(cross(dx, dy));
      if (dot(n, P) > 0.0) n = -n;
      vec3 wn = mat3(uViewInv) * n;
      float up = smoothstep(0.82, 0.96, wn.y);
      if (up < 0.001) { gl_FragColor = vec4(col, 1.0); return; }

      vec3 wp = (uViewInv * vec4(P, 1.0)).xyz;
      // 水たまり: 場所によって濡れ具合が変わる(大きな水たまりは鏡に近い)
      float puddle = smoothstep(0.24, 0.52, vnoise(wp.xz * 0.11) * 0.7 + vnoise(wp.xz * 0.43) * 0.3);
      float wet = uWet * up * mix(0.7, 1.0, puddle);

      // 波紋と細かなうねりで法線をゆらす(水たまりほど穏やか)
      vec2 rp = ripples(wp.xz, uTime, 1.6) + ripples(wp.xz + 31.0, uTime * 1.13, 2.7) * 0.7;
      vec2 wob = (vec2(vnoise(wp.xz * 3.1 + uTime * 0.4), vnoise(wp.xz * 3.1 + 40.0 - uTime * 0.3)) - 0.5) * 0.05;
      vec3 offW = vec3(rp.x * 0.18 + wob.x, 0.0, rp.y * 0.18 + wob.y) * mix(1.0, 0.45, puddle);
      vec3 nv = normalize(n + mat3(uView) * offW);

      vec3 V = normalize(P);
      float ndv = clamp(dot(nv, -V), 0.0, 1.0);
      float fres = 0.18 + 0.82 * pow(1.0 - ndv, 3.2);
      vec3 R = normalize(reflect(V, nv));

      // 画面空間のレイマーチ(大きく進んで、当たったら二分探索で詰める)
      vec3 refl = vec3(0.0);
      float conf = 0.0;
      if (R.z < 0.0) {
        float stepLen = 0.35;
        vec3 pos = P + n * 0.04;
        vec3 prev = pos;
        for (int i = 0; i < 44; i++) {
          prev = pos;
          pos += R * stepLen;
          vec4 cp = uProj * vec4(pos, 1.0);
          if (cp.w <= 0.0) break;
          vec2 uv = cp.xy / cp.w * 0.5 + 0.5;
          if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
          vec3 sp = viewPos(uv);
          float diff = pos.z - sp.z;
          if (diff < 0.0 && diff > -(stepLen * 1.6 + 0.4)) {
            vec3 lo = prev, hi = pos;
            for (int j = 0; j < 6; j++) {
              vec3 mid = (lo + hi) * 0.5;
              vec4 mp = uProj * vec4(mid, 1.0);
              vec2 muv = mp.xy / mp.w * 0.5 + 0.5;
              if (mid.z - viewPos(muv).z < 0.0) hi = mid; else lo = mid;
            }
            vec4 hp = uProj * vec4(hi, 1.0);
            vec2 huv = hp.xy / hp.w * 0.5 + 0.5;
            // 当たった所が空(深度が最大)なら無効。画面の縁・遠方は薄れる
            if (texture2D(tDepth, huv).x < 0.99999) {
              vec2 e = smoothstep(0.0, 0.08, huv) * (1.0 - smoothstep(0.92, 1.0, huv));
              conf = e.x * e.y * (1.0 - smoothstep(60.0, 220.0, length(hi - P)));
              // 濡れた路面らしく、縦方向へにじませる
              float sm = (1.0 - puddle * 0.6) * 0.012 + 0.003;
              for (int k = -3; k <= 3; k++) refl += texture2D(tDiffuse, huv + vec2(0.0, float(k) * sm * 0.5)).rgb;
              refl /= 7.0;
            }
            break;
          }
          stepLen *= 1.13;
        }
      }
      // 反射が当たらなかった所は、空の色を薄く映す
      vec3 sky = mix(vec3(0.42, 0.52, 0.62), vec3(0.025, 0.04, 0.09), uNight) * (0.5 + 0.5 * max(0.0, (mat3(uViewInv) * R).y));
      refl = mix(sky, refl, conf);

      // 濡れると地面が暗くなり、その上に反射が乗る
      vec3 base = col * mix(1.0, 0.55, wet);
      gl_FragColor = vec4(base + refl * fres * wet * 1.15, 1.0);
    }
  `,
};

class WetReflectionPass extends ShaderPass {
  private readonly prevVP = new THREE.Matrix4();
  private readonly vp = new THREE.Matrix4();
  private primed = false;
  /** 自車の位置(世界座標)。モーションブラーで自車の周りをぼかさないために使う */
  public readonly carWorld = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly cam: THREE.PerspectiveCamera) {
    super(WetShader);
  }

  public override render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean): void {
    const u = this.uniforms;
    u.tDepth.value = readBuffer.depthTexture;
    this.cam.updateMatrixWorld();
    (u.uProj.value as THREE.Matrix4).copy(this.cam.projectionMatrix);
    (u.uProjInv.value as THREE.Matrix4).copy(this.cam.projectionMatrixInverse);
    (u.uView.value as THREE.Matrix4).copy(this.cam.matrixWorldInverse);
    (u.uViewInv.value as THREE.Matrix4).copy(this.cam.matrixWorld);
    (u.uRes.value as THREE.Vector2).set(readBuffer.width, readBuffer.height);
    const vp = this.vp.multiplyMatrices(this.cam.projectionMatrix, this.cam.matrixWorldInverse);
    if (!this.primed) { this.prevVP.copy(vp); this.primed = true; }
    (u.uPrevVP.value as THREE.Matrix4).copy(this.prevVP);
    // 自車の画面位置と大きさ
    this.tmp.copy(this.carWorld);
    const dist = this.tmp.distanceTo(this.cam.position);
    this.tmp.project(this.cam);
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.cam.fov) / 2) * Math.max(0.5, dist);
    (u.uCarUV.value as THREE.Vector3).set(this.tmp.x * 0.5 + 0.5, this.tmp.y * 0.5 + 0.5, 2.6 / (2 * halfH));
    super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
    this.prevVP.copy(vp);
  }
}

/**
 * 横に伸びる光の筋(アナモルフィックフレア): 明るい光を横方向へ、青みをつけて引き伸ばす。ブルームの前に足す。
 */
const AnamorphicShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0 },
    uThreshold: { value: 1.1 },
    uRes: { value: new THREE.Vector2(1, 1) },
    /** 筋の色味。ブーストでは車の主色に寄る */
    uTint: { value: new THREE.Color(0.45, 0.72, 1.0) },
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
    uniform float uStrength, uThreshold;
    uniform vec2 uRes;
    uniform vec3 uTint;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uStrength > 0.001) {
        float px = 12.0 / uRes.x;
        vec3 acc = vec3(0.0);
        for (int i = -12; i <= 12; i++) {
          if (i == 0) continue;
          float w = exp(-abs(float(i)) * 0.25);
          vec3 s = texture2D(tDiffuse, vUv + vec2(float(i) * px, 0.0)).rgb;
          acc += max(s - uThreshold, 0.0) * w;
        }
        c += acc * uTint * uStrength * 0.045;
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `,
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
    uAspect: { value: 1 },
    /** 速度の演出: x=放射ブラー y=色収差 z=速度線 w=閃光 */
    uSpeedFx: { value: new THREE.Vector4() },
    uBoost: { value: 0 },
    uLightning: { value: 0 },
    /** レンズに付いた雨粒(0〜1) */
    uLens: { value: 0 },
    /** x=ゴール前の盛り上がり y=ドリフト */
    uMood: { value: new THREE.Vector2() },
    /** ブースト中の速度線の色(車の主色) */
    uBoostCol: { value: new THREE.Color(0.45, 0.8, 1.0) },
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
    uniform vec3 uShadowTint, uHighlightTint, uBoostCol;
    uniform float uAspect, uBoost, uLightning, uLens;
    uniform vec2 uMood;
    uniform vec4 uSpeedFx;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    // レンズに付いた水滴: 大きさも位置もばらばらの粒が、ふくらみ、しばらく留まり、すべり落ちる。粒の中は画面が逆さにゆがんで見える
    vec2 lensDrops(vec2 uv, out float rim) {
      rim = 0.0;
      vec2 ofs = vec2(0.0);
      for (int layer = 0; layer < 2; layer++) {
        float sc = layer == 0 ? 5.0 : 9.0;
        vec2 p = uv * vec2(uAspect, 1.0) * sc + float(layer) * 17.0;
        vec2 id = floor(p);
        vec2 f = fract(p) - 0.5;
        float h = hash(id), h2 = hash(id + 9.1), h3 = hash(id + 3.7);
        float life = fract(uTime * (0.045 + 0.03 * h2) + h);
        float slide = smoothstep(0.6, 1.0, life);
        vec2 c = vec2((h2 - 0.5) * 0.5, (h3 - 0.5) * 0.4 - slide * slide * 0.95);
        float rad = (layer == 0 ? 0.13 : 0.075) * (0.6 + 0.6 * h3) * smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.93, 1.0, life));
        vec2 d = (f - c) * vec2(1.0, 0.85);
        float dist = length(d) / max(rad, 1e-4);
        float inside = (1.0 - smoothstep(0.82, 1.0, dist)) * step(1.0 - 0.32 * uLens, h);
        ofs += -d / max(rad, 1e-4) * inside * 0.04 * (layer == 0 ? 1.0 : 0.7);
        rim = max(rim, smoothstep(0.65, 0.95, dist) * (1.0 - smoothstep(0.95, 1.0, dist)) * step(1.0 - 0.32 * uLens, h));
      }
      return ofs;
    }

    void main() {
      float lensRim = 0.0;
      vec2 suv = vUv;
      if (uLens > 0.01) suv += lensDrops(vUv, lensRim) * uLens;
      vec2 toC = vUv - 0.5;
      float rad = length(toC * vec2(uAspect, 1.0));
      vec3 c;
      float edge = smoothstep(0.12, 0.75, rad);
      if (uSpeedFx.x + uSpeedFx.y > 0.001) {
        // 周辺ほど強い放射ブラーと、赤青のずれ(色収差)
        vec2 dir = -toC * uSpeedFx.x * 0.09 * edge;
        vec2 ca = toC * uSpeedFx.y * 0.02 * edge;
        vec3 acc = vec3(0.0);
        for (int i = 0; i < 6; i++) {
          vec2 o = dir * (float(i) / 5.0);
          acc += vec3(texture2D(tDiffuse, suv + o + ca).r, texture2D(tDiffuse, suv + o).g, texture2D(tDiffuse, suv + o - ca).b);
        }
        c = acc / 6.0;
      } else {
        c = texture2D(tDiffuse, suv).rgb;
      }
      c += vec3(0.5, 0.6, 0.8) * lensRim * uLens * 0.05;
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // 彩度とコントラスト(中間灰を軸に)
      c = mix(vec3(luma), c, uSaturation + uMood.x * 0.18);
      c = (c - 0.5) * uContrast + 0.5;
      // 陰影ごとの色の乗せ(スプリットトーン)
      luma = clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
      c += uShadowTint * (1.0 - smoothstep(0.0, 0.5, luma)) + uHighlightTint * smoothstep(0.45, 1.0, luma);
      // ビネット(周辺減光)
      float d = distance(vUv, vec2(0.5)) * 1.4142;
      c *= 1.0 - (uVignette + uBoost * 0.28) * smoothstep(0.35, 1.0, d);
      // 速度線: 画面の周辺を、中心から外へ流れる細い筋(ブースト中は青白く)
      if (uSpeedFx.z > 0.01) {
        float ang = atan(toC.y, toC.x) / 6.2831853 * 110.0;
        float id = floor(ang);
        float lane = abs(fract(ang) - 0.5);
        float h1 = hash(vec2(id, 1.7));
        float h2 = hash(vec2(id, 9.1));
        float thin = 0.03 + 0.16 * h2;
        float f = fract(rad * 0.9 - uTime * (1.6 + 2.2 * h1) + h1 * 7.0);
        float streak = smoothstep(0.0, 0.03, f) * (1.0 - smoothstep(0.06, 0.3, f));
        float line = (1.0 - smoothstep(thin * 0.5, thin, lane)) * streak * step(0.35, h2 + h1 * 0.5);
        float mask = smoothstep(0.38, 0.85, rad);
        vec3 lineCol = mix(vec3(0.85, 0.92, 1.0), uBoostCol, uBoost);
        c += lineCol * line * mask * uSpeedFx.z * 0.8;
      }
      // ゴール前: 縁が暖色に脈打つ / ドリフト中: 縁にほのかな寒色
      c += vec3(1.0, 0.5, 0.15) * uMood.x * edge * (0.035 + 0.04 * (0.5 + 0.5 * sin(uTime * 7.0)));
      c += vec3(0.0, 0.25, 0.55) * uMood.y * edge * 0.05;
      // 稲光
      c += vec3(0.62, 0.72, 1.0) * uLightning * 0.4;
      // ドリフト確定の閃光
      c += vec3(0.55, 0.8, 1.0) * uSpeedFx.w * (0.15 + 0.35 * edge);
      // フィルムグレイン(暗い所ほど目立たせる)
      float n = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime) * 61.0) - 0.5;
      c += n * uGrain * (1.15 - luma);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }
  `,
};

// warmup の描画の前に、シェーダを並列にコンパイルし終えておく(ennichi-shateki と共通。packages/shared/shaderCompile.ts)
export { compileInParallel } from '../../../../shared/shaderCompile';

export class PostFX {
  public enabled = true;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly flareBase = new THREE.Color(0.45, 0.72, 1.0);
  private readonly boostFlare = new THREE.Color(0.45, 0.72, 1.0);
  private readonly wet: WetReflectionPass;
  private readonly anamorphic: ShaderPass;
  private motion = 0;
  private night = true;
  private rain = 0;
  private readonly grade: ShaderPass;
  private readonly clock = new THREE.Clock();
  private width = 0;
  private height = 0;
  private pixelRatio = 0;
  private preset: Preset = PRESETS.day;

  constructor(private readonly renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    // 半精度の浮動小数点(明るさが1を超える値を保つ) + 2倍MSAA(後処理を通してもジャギーが増えないように。4倍は画質は上だが重いので、2倍にしている)
    const target = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: 2 });
    target.depthTexture = new THREE.DepthTexture(size.x * pr, size.y * pr);   // 濡れた路面の反射が、深度から面の向きを復元する
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.wet = new WetReflectionPass(camera as THREE.PerspectiveCamera);
    this.wet.enabled = false;
    this.composer.addPass(this.wet);
    this.anamorphic = new ShaderPass(AnamorphicShader);
    this.composer.addPass(this.anamorphic);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.5, 0.5, 0.9);
    if (IS_FIREFOX) {
      // Firefox: ブルームを半分の解像度で(UnrealBloomPass は、元から画面の半分で処理するので、画面の 1/4)。
      // 計測(Firefox, 東京スカイウェイ, 60秒×2): fps 146→155、p99 18.2→17ms、スパイク 2〜5→0 回。ブルームを切った場合と同じ数値。
      // 見た目は、街灯・ライトのにじみが、小さく弱くなる(夜に目立つ)。元に戻すには、この分岐を消す。
      const setSize = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w: number, h: number): void => setSize(Math.max(2, Math.round(w / 2)), Math.max(2, Math.round(h / 2)));
    }
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());                                  // トーンマッピング(ACES)とsRGB変換は、ここで1回だけ
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.setTimeOfDay('day');
    this.enabled = new URLSearchParams(location.search).get('fx') !== '0';
  }

  public setTimeOfDay(t: 'day' | 'night'): void {
    const p = PRESETS[t];
    this.preset = p;
    this.night = t === 'night';
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

  /** 雨(0〜1)。路面の反射を有効にし、明かりのにじみを強める。 */
  public setRain(amount: number, lens = 1): void {
    this.rain = amount;
    this.grade.uniforms.uLens.value = amount * lens;
    this.wet.enabled = amount > 0.01 || this.motion > 0.001;
    this.wet.uniforms.uWet.value = amount;
  }

  /** モーションブラーの強さ(0で無効)と、自車の位置(自車の周りはぼかさない) */
  public setMotion(strength: number, car?: THREE.Vector3): void {
    this.motion = strength;
    this.wet.uniforms.uMotion.value = strength;
    this.wet.enabled = this.rain > 0.01 || strength > 0.001;
    if (car) this.wet.carWorld.copy(car);
  }

  /** 稲光の明るさ(0〜1) */
  public setLightning(level: number): void {
    this.grade.uniforms.uLightning.value = level;
  }

  /**
   * 速度に連動した演出を設定する(毎フレーム)。
   * speed: 速度(0〜1) / boost: ブーストの強さ(0〜1) / flash: 閃光(0〜1) / shake: 画面の揺れ(0〜1) / scale: 演出の強さ(1が標準)
   */
  /** ブースト中の画面の色(速度線・フレア)を、車の主色に合わせる */
  public setBoostColors(line: THREE.Color, flare: THREE.Color): void {
    this.grade.uniforms.uBoostCol.value.copy(line);
    this.boostFlare.copy(flare);
  }

  public setSpeedState(speed: number, boost: number, flash: number, shake: number, scale = 1, finale = 0, drift = 0): void {
    const fastLevel = Math.max(0, (speed - 0.35) / 0.65);          // 最高速に近づくほど強い
    const u = this.grade.uniforms;
    (u.uSpeedFx.value as THREE.Vector4).set(
      (fastLevel * 0.6 + boost * 1.0) * scale,                    // 放射ブラー
      (fastLevel * 0.35 + boost * 0.9 + flash * 1.2 + shake * 0.5) * scale,   // 色収差
      Math.min(1, fastLevel * 0.7 + boost * 0.9) * scale,         // 速度線
      flash * scale                                                 // 閃光
    );
    u.uBoost.value = boost;
    const flare = ((this.night ? 1 : 0.25) + this.rain * 0.4 + boost * 0.8 + flash * 0.6) * scale;
    this.anamorphic.uniforms.uStrength.value = flare;
    this.anamorphic.enabled = flare > 0.02;
    this.anamorphic.uniforms.uThreshold.value = this.night ? 1.0 : 1.6;
    this.anamorphic.uniforms.uTint.value.copy(this.flareBase).lerp(this.boostFlare, Math.min(1, boost * 1.5));
    (u.uMood.value as THREE.Vector2).set(finale * scale, drift * scale);
    const p = this.preset;
    this.bloom.strength = p.bloomStrength + boost * 0.45 + flash * 0.4 + finale * 0.12 + this.rain * 0.12;
    this.bloom.radius = p.bloomRadius + this.rain * 0.15;
    this.bloom.threshold = p.bloomThreshold - this.rain * 0.05;
    this.bloom.enabled = this.bloom.strength >= 0.1;
  }

  /** シーンを描く先(RenderPass が描く、後処理の入力)。シェーダを事前にコンパイルするとき、この描画先を設定しておく(画面に描く設定とはシェーダが違う) */
  public get sceneTarget(): THREE.WebGLRenderTarget | null {
    return this.enabled ? this.composer.readBuffer : null;
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
    this.wet.uniforms.uTime.value = this.clock.elapsedTime;
    this.wet.uniforms.uNight.value = this.preset === PRESETS.night ? 1 : 0;
    this.anamorphic.uniforms.uRes.value.set(size.x * pr, size.y * pr);
    this.grade.uniforms.uAspect.value = size.x / Math.max(1, size.y);
    this.grade.uniforms.uTime.value = this.clock.elapsedTime;
    this.composer.render(this.clock.getDelta());
  }
}
