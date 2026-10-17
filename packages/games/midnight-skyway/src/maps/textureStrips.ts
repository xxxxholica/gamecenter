import * as THREE from 'three';
import { IS_FIREFOX } from '../core/browser';
import { STRIP_MIN_WIDTH, STRIP_ROWS, imageSize, stripRanges, stripTargetSize } from './textureStripsCore';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Firefox 向け: チャンクの 4096² のテクスチャ(RGBA で 64MB)を、1回で GPU へ転送すると、その間 rAF が約 40ms 止まる。
//   計測(Firefox 157, M4): 4096² で 48 回、2048² で 3 回、1024² で 0 回のスパイク(同じ条件で 40 秒)。
//   JPEG のデコーダの種類・スレッドは関係なく、転送するバイト数で決まる。
// 画質を落とさず、同じテクスチャを、帯(既定 128 行 = 約2MB)に分けて、1フレームに1つずつ転送する。
// 帯の転送は copyTextureToTexture(texSubImage2D)、ミップマップは最後の帯で一度だけ作る。

export { IS_FIREFOX };

type PlainImage = { width: number; height: number };

// ---- 確保済みテクスチャの使い回し(プール) ----
// 計測(Firefox): 帯が遅い(約 20ms)のは、確保した直後の最初の1帯(k=0)だけ。Firefox は、確保しただけのテクスチャへ初めて書くときに、
// テクスチャ全体(4096² で約 85MB)をゼロで埋める(警告 "incurring lazy initialization")。2帯目以降は 2ms 前後。
// 確保・初期化は、読み込み中(見えない間)に先に済ませたテクスチャを、チャンクが解放されるたびに返して、次のチャンクで使い回す。
// (その後の計測で、帯が遅い主な原因は、キャンバスを GPU 側で描いていたことと分かった(下の sharedStrip)。ゼロ埋めの確保済みプールは、それに加えて残してある)
const MAX_FREE_PER_KEY = 3;
const freeTextures = new Map<string, THREE.DataTexture[]>();
const templates = new Map<string, { tex: THREE.Texture; w: number; h: number; count: number }>();

/**
 * 帯の転送に使うキャンバスと、それを包んだテクスチャ。幅ごとに1つだけ作って、全部の転送で使い回す。
 * キャンバスは willReadFrequently: true(CPU 側で描く)にする。計測(Firefox 157, M4, 東京スカイクライム 夜):
 *   既定(GPU 側)だと、画像を初めて描く帯(k=0 と k=1)の転送が 10ms 前後かかる。画像 1 枚ぶん(2048²=16MB)を、描くときに GPU へ上げるため。
 *   CPU 側なら、描くのも転送も帯の大きさ(約 1MB)ぶんだけで、どの帯も 1ms 以下(70 秒のスパイク 6 → 0、1%low 55 → 72 fps)。
 */
const sharedStrips = new Map<number, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tex: THREE.Texture }>();
function sharedStrip(W: number) {
  let s = sharedStrips.get(W);
  if (!s) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = STRIP_ROWS;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tex = new THREE.Texture(canvas);
    tex.flipY = false;
    sharedStrips.set(W, (s = { canvas, ctx, tex }));
  }
  return s;
}

function stripKey(tex: THREE.Texture, w: number, h: number): string {
  return [w, h, tex.format, tex.type, tex.colorSpace, tex.wrapS, tex.wrapT, tex.minFilter, tex.magFilter, tex.anisotropy, tex.generateMipmaps ? 1 : 0].join('|');
}

/** 読み込み中に見た、大きなテクスチャの設定を覚えておく(あとで、同じ設定のテクスチャを先に確保するため)。 */
export function rememberStripTemplate(tex: THREE.Texture): void {
  const img = tex.image as PlainImage | null;
  if (!img || !(img.width >= STRIP_MIN_WIDTH)) return;
  const target = stripTargetSize(img.width, img.height);
  const key = stripKey(tex, target.w, target.h);
  const t = templates.get(key);
  if (t) { t.count++; return; }
  // 画像は持たない(デコード済みの 64MB を握り続けないため)。設定だけを写した、空のテクスチャ
  const like = new THREE.Texture();
  like.format = tex.format; like.type = tex.type; like.colorSpace = tex.colorSpace;
  like.wrapS = tex.wrapS; like.wrapT = tex.wrapT; like.minFilter = tex.minFilter; like.magFilter = tex.magFilter;
  like.anisotropy = tex.anisotropy; like.generateMipmaps = tex.generateMipmaps;
  templates.set(key, { tex: like, w: target.w, h: target.h, count: 1 });
}

/** プールから確保済みのテクスチャを1つ取り出す(なければ null)。 */
function takeFree(key: string): THREE.DataTexture | null {
  const t = freeTextures.get(key)?.pop() ?? null;
  if (t) t.userData.inPool = false;
  return t;
}

function allocateStripTexture(r: THREE.WebGLRenderer, like: THREE.Texture, W: number, H: number, key: string): THREE.DataTexture {
  const dst = new THREE.DataTexture(null, W, H, like.format as THREE.PixelFormat, like.type);
  dst.colorSpace = like.colorSpace;
  dst.wrapS = like.wrapS; dst.wrapT = like.wrapT;
  dst.magFilter = like.magFilter; dst.minFilter = like.minFilter;
  dst.anisotropy = like.anisotropy;
  dst.flipY = false;
  dst.generateMipmaps = like.generateMipmaps;          // 確保のときだけ、ミップの段数を決めるために必要
  dst.source.dataReady = false;                        // 確保するだけで、データは送らない
  dst.needsUpdate = true;
  dst.userData.stripKey = key;
  r.initTexture(dst);
  dst.generateMipmaps = false;                         // 帯を送るたびに、ミップを作り直さない
  return dst;
}

/**
 * 読み込み中に、よく使う設定のテクスチャを count 個ずつ先に確保し、ゼロ埋め(初回の書き込みで起きる)も済ませてプールへ入れる。
 * 1フレームに1つ。読み込み画面の間に呼ぶ(走行中だと、確保のたびに約 20ms 止まる)。
 */
export function* prewarmStripPool(r: THREE.WebGLRenderer, perKey = 2): Generator<void, void, void> {
  const pos = new THREE.Vector2();
  for (const [key, t] of [...templates.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 2)) {
    const list = freeTextures.get(key) ?? [];
    freeTextures.set(key, list);
    while (list.length < perKey) {
      const dst = allocateStripTexture(r, t.tex, t.w, t.h, key);
      dst.generateMipmaps = false;
      // 最初の書き込みで、Firefox がテクスチャ全体をゼロで埋める。帯の転送と同じキャンバスで書いて、キャンバス側の最初の転送もここで済ませる
      r.copyTextureToTexture(sharedStrip(t.w).tex, dst, null, pos.set(0, 0));
      dst.userData.inPool = true;
      list.push(dst);
      yield;
    }
  }
}

/** チャンクの解放で、テクスチャを返す。プール対象(uploadInStrips で作ったもの)なら、捨てずに取っておく。捨てたときだけ false。 */
export function releaseStripTexture(tex: THREE.Texture): boolean {
  const key = tex.userData?.stripKey as string | undefined;
  if (!key) return false;
  if (tex.userData.inPool) return true;                 // 1つのチャンクの複数の素材が、同じテクスチャを指している(二重に返さない)
  const list = freeTextures.get(key) ?? [];
  freeTextures.set(key, list);
  if (list.length >= MAX_FREE_PER_KEY) return false;
  tex.userData.inPool = true;
  list.push(tex as THREE.DataTexture);
  return true;
}

/**
 * GLTFLoader のテクスチャの読み込みを、Firefox で止まらない方法に差し替える。
 * three.js の ImageBitmapLoader は createImageBitmap にオプションを付け、Firefox ではそのデコードと変換が rAF を止める。
 * `Image.decode()` は、デコードを細かく区切って別スレッドで行うので、止まらない(計測: スパイク 0)。
 * 戻す画像は、大きいもの(STRIP_MIN_WIDTH 以上)は HTMLImageElement(帯に分けて転送する)、小さいものは ImageBitmap。
 */
export function decodeWithImageElement(loader: GLTFLoader): void {
  loader.register((parser) => {
    const tl = (parser as unknown as { textureLoader?: { isImageBitmapLoader?: boolean; options?: ImageBitmapOptions; load: (...a: unknown[]) => unknown } }).textureLoader;
    if (tl?.isImageBitmapLoader) {
      tl.load = (url: unknown, onLoad?: unknown, _onProgress?: unknown, onError?: unknown): unknown => {
        const p = (async (): Promise<HTMLImageElement | ImageBitmap> => {
          const blob = await (await fetch(String(url))).blob();
          const size = imageSize(new Uint8Array(await blob.slice(0, 65536).arrayBuffer()));
          if (size && size[0] >= STRIP_MIN_WIDTH) {
            const im = new Image();
            im.src = String(url);
            await im.decode();
            return im;
          }
          // 小さい画像(Helsinki の 1024² など)は、従来と同じ ImageBitmapLoader の読み込み(速い転送の経路。HTMLImageElement のままだと 1 回 15〜35ms かかる)
          return createImageBitmap(blob, { premultiplyAlpha: 'none', ...(tl.options ?? {}), colorSpaceConversion: 'none' });
        })();
        p.then(onLoad as (im: HTMLImageElement | ImageBitmap) => void, onError as (e: unknown) => void);
        return p;
      };
    }
    return { name: 'DecodeWithImageElement' };
  });
}

/**
 * texture(大きな画像)を、帯ごとに転送する。1回 next() するたびに、1つの帯だけを転送する。
 * 完了したら、users(その texture を map に使っている素材)を、転送済みの別のテクスチャへ差し替える。
 * 画像が小さいときは、そのまま initTexture する(1ステップ)。
 */
export function* uploadInStrips(
  r: THREE.WebGLRenderer,
  tex: THREE.Texture,
  users: THREE.MeshStandardMaterial[],
  onDone?: () => void,
): Generator<void, void, void> {
  const img = tex.image as (PlainImage & CanvasImageSource) | null;
  if (!img || !(img.width >= STRIP_MIN_WIDTH)) {
    r.initTexture(tex);
    (tex.image as { close?: () => void } | null)?.close?.();
    onDone?.();
    yield;                                             // 1フレームに転送するのは1枚だけ(続けて送ると、1フレームで十数枚になる)
    return;
  }
  const SRC_W = img.width, SRC_H = img.height;
  const { w: W, h: H, down } = stripTargetSize(SRC_W, SRC_H);

  // 1) 空のテクスチャを確保する(転送はしない)。素材が参照している設定を、そのまま引き継ぐ。プールに初期化済みのものがあれば、それを使う
  const key = stripKey(tex, W, H);
  let dst = takeFree(key);
  if (dst) {
    dst.generateMipmaps = false;                       // 最後の帯の転送まで、ミップは作り直さない
  } else {
    dst = allocateStripTexture(r, tex, W, H, key);
  }
  yield;

  // 2) 帯ごとに、キャンバスへ写して転送する
  const { canvas, ctx, tex: strip } = sharedStrip(W);
  strip.format = tex.format as THREE.PixelFormat; strip.type = tex.type;
  const pos = new THREE.Vector2();
  const ranges = stripRanges(H, STRIP_ROWS);
  for (let k = 0; k < ranges.length; k++) {
    const [y, rows] = ranges[k];
    if (canvas.height !== rows) canvas.height = rows;  // 最後の帯だけ行数が違うことがある(高さを変えると中身は消える)
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, y * down, SRC_W, rows * down, 0, 0, W, rows);
    if (k === ranges.length - 1) dst.generateMipmaps = tex.generateMipmaps;   // 最後の帯の転送で、ミップを一度だけ作る
    r.copyTextureToTexture(strip, dst, null, pos.set(0, y));
    if (k < ranges.length - 1) yield;
  }

  // 3) 素材のテクスチャを差し替え、元のテクスチャ(転送していない)を捨てる
  dst.needsUpdate = false;
  for (const m of users) { if (m.map === tex) m.map = dst; }
  tex.dispose();
  (tex.image as { close?: () => void } | null)?.close?.();
  tex.image = null;
  onDone?.();
}
