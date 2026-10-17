// 画面の外の剣を指す矢印(金色の光つき)と、その距離の文字の影を、一度だけ小さなキャンバスに描いておき、毎フレームは drawImage で貼る。
// 後半は画面の外に剣が数十本落ちていて、矢印ごとに shadowBlur(ぼかし)を2回使うと、1フレームに百回以上のぼかしになり、
// JS は軽くてもキャンバスの描画(GPU)が間に合わず 60fps → 20fps 台まで落ちる。見た目は、元の描き方をそのまま使うので変わらない。
//
// shadowBlur は座標変換(拡大)を受けず、画面の px で効く。そこで絵は、貼る先の拡大率(画面の px / ゲームの座標)と同じ解像度で描き、
// 1px = 画面の 1px で貼る(ぼかしの幅も、図形の大きさも、元の描き方と同じになる)。

const CHEVRON_BLUR = 12;
const LABEL_BLUR = 4;
export const LOCATOR_FONT = '900 13px sans-serif';

interface Sprite {
  canvas: HTMLCanvasElement;
  /** キャンバス上の、絵の基準点(矢印: 回転の中心 / 文字: 文字の左端・縦の中央)の位置(キャンバスの px) */
  originX: number;
  originY: number;
  /** 拡大率(キャンバスの px / ゲームの座標) */
  scale: number;
}

let chevron: Sprite | null = null;
const glyphShadows = new Map<string, Sprite>();
const advances = new Map<string, number>();

const quantize = (scale: number) => Math.max(0.5, Math.round(scale * 4) / 4);

/** 金色に光る矢印(右向き。原点が回転の中心) */
export function getChevronSprite(scale: number): Sprite {
  const s = quantize(scale);
  if (chevron && chevron.scale === s) return chevron;
  const pad = CHEVRON_BLUR * 1.6 + 2;                      // ぼかしのにじみ(画面の px)
  const left = 8 * s + pad, right = 14 * s + pad, half = 9 * s + pad;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(left + right);
  canvas.height = Math.ceil(half * 2);
  const c = canvas.getContext('2d')!;
  c.translate(left, half);
  c.scale(s, s);
  c.fillStyle = '#ffd700';
  c.shadowColor = '#ffd700';
  c.shadowBlur = CHEVRON_BLUR;
  c.beginPath();
  c.moveTo(14, 0);
  c.lineTo(-8, -9);
  c.lineTo(-2, 0);
  c.lineTo(-8, 9);
  c.closePath();
  c.fill();
  chevron = { canvas, originX: left, originY: half, scale: s };
  return chevron;
}

/** 1文字ぶんの、黒いぼかしの影だけ(文字そのものは含まない) */
function getGlyphShadow(ch: string, scale: number): Sprite {
  const s = quantize(scale);
  const key = `${ch}|${s}`;
  const hit = glyphShadows.get(key);
  if (hit) return hit;
  const pad = LABEL_BLUR * 1.6 + 2;
  const fontPx = 13 * s;
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d')!;
  c.font = `900 ${fontPx}px sans-serif`;
  const w = c.measureText(ch).width;
  canvas.width = Math.ceil(w + pad * 2);
  canvas.height = Math.ceil(fontPx * 1.4 + pad * 2);
  // 文字はキャンバスの外に描き、影だけを shadowOffset でキャンバスの中へ持ってくる
  const off = canvas.width + 50;
  c.font = `900 ${fontPx}px sans-serif`;
  c.textBaseline = 'middle';
  c.textAlign = 'left';
  c.fillStyle = '#000000';
  c.shadowColor = '#000000';
  c.shadowBlur = LABEL_BLUR;
  c.shadowOffsetX = off;
  c.fillText(ch, pad - off, canvas.height / 2);
  const sprite: Sprite = { canvas, originX: pad, originY: canvas.height / 2, scale: s };
  glyphShadows.set(key, sprite);
  return sprite;
}

function advance(ctx: CanvasRenderingContext2D, ch: string): number {
  let w = advances.get(ch);
  if (w === undefined) {
    w = ctx.measureText(ch).width;
    advances.set(ch, w);
  }
  return w;
}

/** 現在の座標変換の拡大率(画面の px / ゲームの座標) */
export function currentScale(ctx: CanvasRenderingContext2D): number {
  const m = ctx.getTransform();
  return Math.hypot(m.a, m.b);
}

/** 矢印を (0,0) を中心に、angle の向きで貼る(呼ぶ側で translate 済み) */
export function drawChevron(ctx: CanvasRenderingContext2D, angle: number, scale: number): void {
  const sp = getChevronSprite(scale);
  ctx.rotate(angle);
  ctx.drawImage(sp.canvas, -sp.originX / sp.scale, -sp.originY / sp.scale, sp.canvas.width / sp.scale, sp.canvas.height / sp.scale);
  ctx.rotate(-angle);
}

/**
 * 白い文字を、黒いぼかしの影つきで、(x, y) を中央に描く(元は shadowBlur = 4 の fillText)。
 * 影は1文字ずつの絵を貼り、文字はぼかしなしで上から描く。ctx.font は LOCATOR_FONT にしておくこと。
 */
export function drawShadowedLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number): void {
  let total = 0;
  for (const ch of text) total += advance(ctx, ch);
  let cx = x - total / 2;
  for (const ch of text) {
    const sp = getGlyphShadow(ch, scale);
    ctx.drawImage(sp.canvas, cx - sp.originX / sp.scale, y - sp.originY / sp.scale, sp.canvas.width / sp.scale, sp.canvas.height / sp.scale);
    cx += advance(ctx, ch);
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, x - total / 2, y);
}
