// 走行中の速度メーター: 1/4 円の目盛り付きアーク。SVG の文字列を作るだけで、固定の値しか入れない。
// 円の中心は右下の隅。左(9時)から上(12時)へ、時計回りに伸びる。

/** メーターの右端(km/h) */
export const SPEED_MAX = 200;
/** ここからレッドゾーン(km/h) */
export const SPEED_RED = 160;
/** この速度から黄色(km/h) */
export const SPEED_WARN = 120;
/** 目盛りの数 */
export const SEG_COUNT = 50;
/** 数字を振る間隔(km/h) */
const LABEL_STEP = 40;

const CX = 196;
const CY = 196;
const R = 168;          // 目盛りの帯の中心の半径
const BAND = 15;        // 帯の太さ
const SWEEP = 90;       // 1/4 円

const pt = (angle: number, r: number): [number, number] => {
  const a = (angle * Math.PI) / 180;
  return [CX + r * Math.sin(a), CY - r * Math.cos(a)];
};
const f = (n: number): string => n.toFixed(2);

/** 値(km/h)を角度(度)にする: 左 = -90、上 = 0 */
export const angleOf = (kmh: number): number => -SWEEP + SWEEP * Math.max(0, Math.min(1, kmh / SPEED_MAX));

const arcPath = (a0: number, a1: number, r: number): string => {
  const [x0, y0] = pt(a0, r);
  const [x1, y1] = pt(a1, r);
  return `M ${f(x0)} ${f(y0)} A ${r} ${r} 0 0 1 ${f(x1)} ${f(y1)}`;
};

/** その目盛り(0 始まり)の色の段階: 0 通常 / 1 警戒 / 2 レッドゾーン */
export const segLevel = (i: number): 0 | 1 | 2 => {
  const kmh = (i / SEG_COUNT) * SPEED_MAX;
  return kmh >= SPEED_RED ? 2 : kmh >= SPEED_WARN ? 1 : 0;
};

/** 速度メーターの SVG。目盛りは `.sg-seg` が SEG_COUNT 個、左から順に並ぶ。針は `#sg-needle`(回転の中心は右下の隅)。 */
export function speedGaugeSvg(): string {
  const step = SWEEP / SEG_COUNT;
  const gap = 0.55;
  let segs = '';
  for (let i = 0; i < SEG_COUNT; i++) {
    const a0 = -SWEEP + i * step + gap / 2;
    const a1 = -SWEEP + (i + 1) * step - gap / 2;
    segs += `<path class="sg-seg lv${segLevel(i)}" d="${arcPath(a0, a1, R)}"/>`;
  }
  let labels = '';
  for (let v = 0; v <= SPEED_MAX + 1e-6; v += LABEL_STEP) {
    const [x, y] = pt(angleOf(v), R - BAND / 2 - 14);
    labels += `<text class="sg-label${v >= SPEED_RED ? ' red' : ''}" x="${f(x)}" y="${f(y)}">${v}</text>`;
  }
  return `
    <svg class="sg-svg" viewBox="0 0 200 200" aria-hidden="true">
      <g id="sg-segs" style="--sg-w:${BAND}px">${segs}</g>
      ${labels}
      <g id="sg-needle" class="sg-needle" transform="rotate(${angleOf(0)} ${CX} ${CY})">
        <polygon points="${CX},${CY - R - 8} ${CX - 2.6},${CY - 96} ${CX + 2.6},${CY - 96}"/>
      </g>
    </svg>`;
}

