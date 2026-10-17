// 剣1本ぶんの絵を、一度だけ小さなキャンバスに描いておき、毎フレームは drawImage で貼る。
// 軌道上の剣は、1人あたり最大 64 本 × 当たり判定3か所 = 最大 192 回、全員(8人)で千回を超える。
// そのたびに塗り・縁取り・芯の3つの図形を描くと、JS は軽くても、キャンバスの描画(ラスタライズ)が間に合わず、
// 剣が増えた頃から 100fps → 16〜36fps まで落ちる。見た目は、描き方をそのまま使うので変わらない。

export interface BladeStyle {
  /** 縁取りと芯の色(通常はプレイヤーのテーマ色。ストーム中は金) */
  glow: string;
  storm: boolean;
  /** 刃の大きさの倍率(baseSize * sizeMult * ストーム倍率) */
  size: number;
  /** ぼかしの光(プレイヤーのストーム中だけ) */
  blur: boolean;
}

export interface BladeSprite {
  canvas: HTMLCanvasElement;
  /** キャンバス上の、剣の原点(柄の付け根)の位置(キャンバスの px) */
  originX: number;
  originY: number;
  /** キャンバスの px あたりの、ゲームの座標の長さ(drawImage で貼るときの拡大率) */
  pxPerUnit: number;
}

const SIZE_STEP = 0.05;         // 大きさは 5% 刻みにまとめる(見分けがつかない)
const MAX_CACHE = 48;
const cache = new Map<string, BladeSprite>();

/** 刃の絵を ctx に描く(原点=柄の付け根の位置、刃先が上)。元の SwordSystem.render と同じ図形。 */
function drawBlade(ctx: CanvasRenderingContext2D, style: BladeStyle, blurPx: number): void {
  const { glow, storm, size } = style;
  if (style.blur) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = blurPx;
  }
  const bladeLen = 38 * size;
  const bladeW = 8 * size;

  // 1. Blade Body (Sharp Cyber Broadsword)
  ctx.fillStyle = storm ? '#fffae0' : '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, -bladeLen);
  ctx.lineTo(bladeW * 0.5, -bladeLen * 0.65);
  ctx.lineTo(bladeW * 0.4, 0);
  ctx.lineTo(bladeW * 0.9, 0);
  ctx.lineTo(bladeW * 0.9, 4 * size);
  ctx.lineTo(bladeW * 0.2, 4 * size);
  ctx.lineTo(bladeW * 0.2, 12 * size);
  ctx.lineTo(-bladeW * 0.2, 12 * size);
  ctx.lineTo(-bladeW * 0.2, 4 * size);
  ctx.lineTo(-bladeW * 0.9, 4 * size);
  ctx.lineTo(-bladeW * 0.9, 0);
  ctx.lineTo(-bladeW * 0.4, 0);
  ctx.lineTo(-bladeW * 0.5, -bladeLen * 0.65);
  ctx.closePath();
  ctx.fill();

  // 2. Neon Edge Outline
  ctx.strokeStyle = glow;
  ctx.lineWidth = storm ? 3.5 : 2;
  ctx.stroke();

  // 3. Center Energy Channel
  ctx.strokeStyle = storm ? '#ff2255' : glow;
  ctx.lineWidth = 1.5 * size;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -bladeLen * 0.85);
  ctx.stroke();
}

/**
 * 剣の絵(スプライト)を返す。`scale` は、貼る先の座標系が画面の px に対して何倍か(ctx の現在の拡大率)。
 * 画面で見える大きさに対して十分な解像度で描いておく(拡大して貼るとぼやけるため)。
 */
export function getBladeSprite(style: BladeStyle, scale: number): BladeSprite {
  const size = Math.max(SIZE_STEP, Math.round(style.size / SIZE_STEP) * SIZE_STEP);
  const px = Math.max(1, Math.round(scale * 2) / 2);              // 0.5 刻み
  const key = `${style.glow}|${style.storm ? 1 : 0}|${style.blur ? 1 : 0}|${size.toFixed(2)}|${px}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const q: BladeStyle = { ...style, size };
  const blur = style.blur ? 12 : 0;
  const lineW = style.storm ? 3.5 : 2;
  const pad = lineW + blur * 1.6 + 2;                               // 縁取りの太さと、ぼかしのにじみ
  const left = 8 * size * 0.9 + pad, right = left;
  const top = 38 * size + pad, bottom = 12 * size + pad;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((left + right) * px);
  canvas.height = Math.ceil((top + bottom) * px);
  const c = canvas.getContext('2d')!;
  c.scale(px, px);
  c.translate(left, top);
  drawBlade(c, q, blur * px);                                        // shadowBlur は座標変換を受けないので、px 倍にして、見た目のにじみを合わせる

  const sprite: BladeSprite = { canvas, originX: left * px, originY: top * px, pxPerUnit: px };
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, sprite);
  return sprite;
}
