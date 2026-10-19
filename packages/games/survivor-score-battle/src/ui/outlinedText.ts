// 縁取りつきの文字(strokeText のあとに fillText)を、一度だけ大きなキャンバス(まとめ置きの絵)に描いておき、毎フレームは drawImage で貼る。
// 計測(Windows, Firefox, タイトルの CPU のデモ): 1 フレームに縁取りつきの文字を 50 回ほど描いていて(ダメージの数字・名前・HUD)、
// JS は 1 フレーム 2〜4ms と軽いのに、キャンバスの描画(GPU)が間に合わず、30 秒に 9〜12 回、33〜67ms のフレームが出ていた。
// 文字を描かない版では 0〜2 回、文字を 1/2・1/10 にすると 5 回・2 回で、文字を描く回数に比例する。
// 文字ごとに別の小さなキャンバスにすると、かえって 12〜16 回に増えた(貼る元の絵が多いと重い)。剣の絵のように、貼る元の絵を少なくまとめる。
//
// 絵は、貼る先の拡大率(画面の px / ゲームの座標)と同じ解像度で描き、1px = 画面の 1px で貼る(locatorSprites と同じ)。
// 縁取りと文字は別の絵にして、その順に貼る。透明度(globalAlpha)をかけた時の重なり方も、元の描き方と同じになる。
// 描き方の設定(font・textAlign・textBaseline・lineWidth・lineJoin・色・影・letterSpacing)は、呼んだ時の ctx のものを使う。

import { currentScale } from './locatorSprites';

interface TextSprite {
  page: HTMLCanvasElement;
  /** まとめ置きの絵の中の位置(1 枚目の絵の左上) */
  sx: number;
  sy: number;
  w: number;
  h: number;
  /** 絵の中の、文字の基準点(textAlign・textBaseline の点)の位置(キャンバスの px) */
  originX: number;
  originY: number;
  /** 拡大率(キャンバスの px / ゲームの座標) */
  scale: number;
  /** 絵の枚数(縁取りつきは 2: 縁取り・文字の順に、右へ w + GAP ずつ並ぶ / 文字だけは 1) */
  layers: number;
}

interface Page {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  rowH: number;
}

const PAGE_SIZE = 1024;
/** 使い切ったら、いちばん古いページを消して使い直す(ダメージの数字は値ごとに違う絵になるので、長く遊ぶと増える。全部を消すと、画面の文字をまとめて作り直すことになる) */
const MAX_PAGES = 6;
/** 絵と絵のすき間(貼る時の補間で、となりの絵がにじまないように) */
const GAP = 2;

const sprites = new Map<string, TextSprite>();
const pages: Page[] = [];
/** いま絵を足しているページ */
let current = -1;
/** 新しい絵を描いて、範囲を調べるための作業用のキャンバス */
let work: CanvasRenderingContext2D | null = null;

// 拡大率は 1/8 刻みで絵を作る(貼る時の拡大・縮小は 6% 以内。会心の数字は 1.0〜1.3 倍に大きくなるので、1 つの数字で 3〜4 枚)
const quantize = (scale: number) => Math.max(0.5, Math.round(scale * 8) / 8);

/** 次のページに移る(まだ作れるなら新しく作り、もう作れないなら、いちばん古いページを消して、そこにあった絵を忘れる) */
function nextPage(): Page {
  current = (current + 1) % MAX_PAGES;
  let page = pages[current];
  if (!page) {
    const canvas = document.createElement('canvas');
    canvas.width = PAGE_SIZE;
    canvas.height = PAGE_SIZE;
    page = { canvas, ctx: canvas.getContext('2d')!, x: 0, y: 0, rowH: 0 };
    pages[current] = page;
    return page;
  }
  page.ctx.clearRect(0, 0, PAGE_SIZE, PAGE_SIZE);
  page.x = page.y = page.rowH = 0;
  for (const [key, sp] of sprites) if (sp.page === page.canvas) sprites.delete(key);
  return page;
}

/** 幅 w・高さ h の場所を取る(左から右へ並べ、はみ出たら次の行) */
function allocate(w: number, h: number): { page: Page; x: number; y: number } | null {
  if (w > PAGE_SIZE || h > PAGE_SIZE) return null;
  let page = pages[current] ?? nextPage();
  if (page.x + w > PAGE_SIZE) {
    page.x = 0;
    page.y += page.rowH + GAP;
    page.rowH = 0;
  }
  if (page.y + h > PAGE_SIZE) page = nextPage();
  const x = page.x, y = page.y;
  page.x += w + GAP;
  page.rowH = Math.max(page.rowH, h);
  return { page, x, y };
}

/**
 * 縁取りと文字の絵を、作業用のキャンバスに余白を大きく取って描き、実際に色が付いた範囲だけを、まとめ置きの絵に写す。
 * 縁取りの角(lineJoin が miter)は、文字の形によって、文字の枠から lineWidth × miterLimit / 2 まで尖って伸びるので、
 * 文字の大きさ(measureText)からは、絵の範囲が決まらない。
 */
function makeSprite(ctx: CanvasRenderingContext2D, text: string, s: number, outline: boolean): TextSprite | null {
  const blur = ctx.shadowBlur > 0 ? ctx.shadowBlur : 0;
  const font = (c: CanvasRenderingContext2D) => {
    c.font = ctx.font;
    c.textAlign = ctx.textAlign;
    c.textBaseline = ctx.textBaseline;
    c.letterSpacing = ctx.letterSpacing;
  };
  work ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  font(work);
  const t = work.measureText(text);
  const reach = !outline ? 0 : ctx.lineJoin === 'miter' ? (ctx.lineWidth / 2) * Math.max(1, ctx.miterLimit) : ctx.lineWidth / 2;
  const pad = Math.ceil((reach + 2) * s + blur * 1.6 + 2);   // 縁取りの届く所(ゲームの座標)と、影のにじみ(画面の px)
  const left = Math.ceil(t.actualBoundingBoxLeft * s) + pad;
  const up = Math.ceil(t.actualBoundingBoxAscent * s) + pad;
  const W = Math.max(1, left + Math.ceil(t.actualBoundingBoxRight * s) + pad);
  const H = Math.max(1, up + Math.ceil(t.actualBoundingBoxDescent * s) + pad);
  const n = outline ? 2 : 1;
  const canvas = work.canvas;
  if (canvas.width < W * n || canvas.height < H) {
    canvas.width = Math.max(canvas.width, W * n);
    canvas.height = Math.max(canvas.height, H);
  } else {
    work.setTransform(1, 0, 0, 1, 0, 0);
    work.clearRect(0, 0, W * n, H);
  }
  // 縁取りつきは、左に縁取り、右に文字
  const layers = outline
    ? [(c: CanvasRenderingContext2D) => c.strokeText(text, 0, 0), (c: CanvasRenderingContext2D) => c.fillText(text, 0, 0)]
    : [(c: CanvasRenderingContext2D) => c.fillText(text, 0, 0)];
  layers.forEach((draw, i) => {
    work!.setTransform(s, 0, 0, s, i * W + left, up);
    font(work!);
    work!.lineWidth = ctx.lineWidth;
    work!.lineJoin = ctx.lineJoin;
    work!.miterLimit = ctx.miterLimit;
    work!.strokeStyle = ctx.strokeStyle;
    work!.fillStyle = ctx.fillStyle;
    work!.shadowColor = ctx.shadowColor;
    work!.shadowBlur = blur;
    draw(work!);
  });
  work.shadowBlur = 0;
  // 絵を重ねた範囲
  const px = work.getImageData(0, 0, W * n, H).data;
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W * n; x++) {
      if (px[(y * W * n + x) * 4 + 3] === 0) continue;
      const lx = x % W;
      if (lx < x0) x0 = lx;
      if (lx > x1) x1 = lx;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) {
    x0 = y0 = 0;
    x1 = y1 = 0;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const at = allocate((w + GAP) * n - GAP, h);
  if (!at) return null;
  for (let i = 0; i < n; i++) at.page.ctx.drawImage(canvas, i * W + x0, y0, w, h, at.x + i * (w + GAP), at.y, w, h);
  return { page: at.page.canvas, sx: at.x, sy: at.y, w, h, originX: left - x0, originY: up - y0, scale: s, layers: n };
}

function drawSprite(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, outline: boolean): boolean {
  if (typeof ctx.fillStyle !== 'string' || (outline && typeof ctx.strokeStyle !== 'string') || ctx.shadowOffsetX !== 0 || ctx.shadowOffsetY !== 0) return false;
  const s = quantize(currentScale(ctx));
  const blur = ctx.shadowBlur > 0 ? `${ctx.shadowColor}/${ctx.shadowBlur}` : '';
  const line = outline ? `${ctx.lineWidth}|${ctx.lineJoin}|${ctx.miterLimit}|${ctx.strokeStyle}` : '-';
  const key = `${text}|${ctx.font}|${ctx.textAlign}|${ctx.textBaseline}|${ctx.letterSpacing}|${line}|${ctx.fillStyle}|${blur}|${s}`;
  let sp = sprites.get(key);
  if (!sp) {
    const made = makeSprite(ctx, text, s, outline);
    if (!made) return false;
    sp = made;
    sprites.set(key, sp);
  }
  // 影は絵の中に描いてあるので、貼る時には付けない
  const shadowBlur = ctx.shadowBlur;
  if (shadowBlur > 0) ctx.shadowBlur = 0;
  const dx = x - sp.originX / sp.scale, dy = y - sp.originY / sp.scale;
  const w = sp.w / sp.scale, h = sp.h / sp.scale;
  for (let i = 0; i < sp.layers; i++) ctx.drawImage(sp.page, sp.sx + i * (sp.w + GAP), sp.sy, sp.w, sp.h, dx, dy, w, h);
  if (shadowBlur > 0) ctx.shadowBlur = shadowBlur;
  return true;
}

/**
 * ctx.strokeText(text, x, y) と ctx.fillText(text, x, y) を続けて呼ぶのと同じ絵を描く。
 * 絵は、今の座標変換の拡大率(画面の px / ゲームの座標)を 1/8 刻みにした解像度で作る。
 * 色にグラデーションを使う時や、影をずらす時は、そのまま strokeText と fillText で描く。
 */
export function drawOutlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  if (drawSprite(ctx, text, x, y, true)) return;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

/** ctx.fillText(text, x, y) と同じ絵を描く(縁取りなし。ほかは drawOutlinedText と同じ) */
export function drawFilledText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  if (drawSprite(ctx, text, x, y, false)) return;
  ctx.fillText(text, x, y);
}
