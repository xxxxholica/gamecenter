import * as THREE from 'three';

/**
 * 車のボディ・ガラス・クロームに映り込む環境マップ(昼用・夜用)を、コードで作る。
 * 8bitの単純なグラデーションでは、塗装に鋭いハイライトが出ず、艶が平板に見える。ここでは明るさが1を超える
 * 値(太陽・空の光の帯・街の明かり)を持つ HDR の等距離円筒図を作り、PMREM で反射用に変換する。
 * 向き: three.js の EquirectangularReflectionMapping と同じ(u = atan2(z, x)/2π + 0.5、v = asin(y)/π + 0.5)。
 */

const W = 1024;
const H = 512;

type RGB = [number, number, number];

// 決まった乱数(ビルの並び・窓の明かりが毎回同じになるように)
const hash = (x: number, y = 0): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** 方位ごとのビルの高さ(仰角のsin値)。大小のビルが不規則に並ぶ。 */
const skylineHeight = (az: number): number => {
  const cell = Math.floor(az * 90);
  const big = hash(cell * 0.37) > 0.8 ? 0.16 : 0;
  return 0.07 + hash(cell) * 0.17 + big;
};

/** 水平線付近の街(ビルのシルエット + 窓の明かり)。窓の色と明るさは引数で変える。 */
function cityBand(az: number, y: number, body: RGB, lit: (r: number, r2: number) => RGB | null): RGB | null {
  if (y < 0 || y > skylineHeight(az)) return null;
  const wx = Math.floor(az * 520), wy = Math.floor(y * 520);
  const r = hash(wx, wy), r2 = hash(wx * 3.1, wy * 1.7);
  const glint = lit(r, r2);
  return glint ?? body;
}

function build(shade: (dir: THREE.Vector3, az: number, y: number) => RGB): THREE.DataTexture {
  const data = new Uint16Array(W * H * 4);
  const dir = new THREE.Vector3();
  const toHalf = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    const th = (v - 0.5) * Math.PI;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W;
      const phi = (u - 0.5) * Math.PI * 2;
      dir.set(Math.cos(phi) * Math.cos(th), Math.sin(th), Math.sin(phi) * Math.cos(th));
      const az = u;
      const c = shade(dir, az, dir.y);
      const k = (j * W + i) * 4;
      data[k] = toHalf(c[0]);
      data[k + 1] = toHalf(c[1]);
      data[k + 2] = toHalf(c[2]);
      data[k + 3] = toHalf(1);
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** 空に浮かぶ、横長の明るい帯(大きな雲・光源のように、ボディの側面に細長い映り込みを作る)。 */
function panel(az: number, y: number, az0: number, az1: number, y0: number, y1: number, feather = 0.01): number {
  const a = smooth(az0 - feather, az0 + feather, az) * (1 - smooth(az1 - feather, az1 + feather, az));
  const e = smooth(y0 - feather, y0 + feather, y) * (1 - smooth(y1 - feather, y1 + feather, y));
  return a * e;
}

function nightShade(moonDir: THREE.Vector3) {
  const horizon: RGB = [0.05, 0.07, 0.15];
  const zenith: RGB = [0.004, 0.008, 0.03];
  const body: RGB = [0.012, 0.014, 0.024];
  const windows = (r: number, r2: number): RGB | null => {
    if (r > 0.94) return null;
    if (r < 0.052) return r2 < 0.55 ? [4.5, 3.2, 1.7] : r2 < 0.85 ? [5, 5, 5.2] : [1.2, 4.2, 5.4];   // 暖色・白・シアンの窓
    return null;
  };
  /** 夜の水平線の帯(街の明かり・ネオン・街灯)。路面の濡れた反射にも使う。 */
  const band = (az: number, y: number): RGB | null => {
    const cityPx = cityBand(az, y, body, windows);
    if (cityPx) return cityPx;
    // ネオンの縦ライン(方位の決まった位置に、マゼンタ・シアン・橙)
    const stripe = Math.floor(az * 60);
    if (hash(stripe * 1.7) > 0.8 && y >= 0 && y < 0.06 + hash(stripe) * 0.14 && ((az * 60) % 1) < 0.12) {
      const k = hash(stripe * 0.9);
      return k < 0.34 ? [14, 1.5, 7] : k < 0.67 ? [1.5, 9, 14] : [14, 6, 1.5];
    }
    // 街灯の列(水平線すぐ上の橙の点が一定間隔で並ぶ)
    if (y >= 0.02 && y < 0.032 && ((az * 72) % 1) < 0.18) return [22, 11, 3.5];
    return null;
  };
  return (dir: THREE.Vector3, az: number, y: number): RGB => {
    if (y >= 0) {
      let c = mix(horizon, zenith, Math.pow(Math.min(1, y * 1.2), 0.5));
      const m = Math.max(0, dir.dot(moonDir));
      c = [c[0] + Math.pow(m, 1400) * 22 + Math.pow(m, 60) * 0.5, c[1] + Math.pow(m, 1400) * 24 + Math.pow(m, 60) * 0.55, c[2] + Math.pow(m, 1400) * 30 + Math.pow(m, 60) * 0.8];
      // 淡い光の帯(夜空の薄雲に月明かりが当たる)
      const p = panel(az, y, 0.55, 0.78, 0.5, 0.58, 0.02) * 0.9;
      c = mix(c, [0.55, 0.65, 1.0], p);
      const px = band(az, y);
      return px ?? c;
    }
    // 濡れた路面: 水平線の街の明かりを縦に長く映す(上下反転して減衰)
    const mirrored = band(az, -y * 0.8);
    const base: RGB = [0.008, 0.01, 0.014];
    if (mirrored) {
      const fall = Math.pow(Math.max(0, 1 + y * 3.2), 2.2) * 0.45;
      return [base[0] + mirrored[0] * fall, base[1] + mirrored[1] * fall, base[2] + mirrored[2] * fall];
    }
    return mix(base, [horizon[0] * 0.35, horizon[1] * 0.35, horizon[2] * 0.35], Math.pow(Math.max(0, 1 + y * 5), 3) * 0.5);
  };
}

/** 夜用の環境マップを作る(PMREM変換済み)。 */
export function createSkyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const nightSrc = build(nightShade(new THREE.Vector3(-0.35, 0.55, -0.4).normalize()));
  const night = pmrem.fromEquirectangular(nightSrc).texture;
  nightSrc.dispose();
  pmrem.dispose();
  return night;
}
