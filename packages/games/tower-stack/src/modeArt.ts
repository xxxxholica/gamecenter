// モード選択カードの絵(インラインSVG)。固定の文字列だけを返す。ブロックの色はテトリス型のピースの色。

const ACCENT = '#ffd166';
const COLORS = ['#ffd166', '#4cc9f0', '#ff6b6b', '#7ddc6a', '#c792ea', '#ff9f43'];
const P1 = '#35c9e8';
const P2 = '#ff6b6b';

/** ブロック1個: 本体に、上の光と下の影を重ねて立体に見せる */
function block(x: number, y: number, w: number, h: number, color: string): string {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="${color}"/>`
    + `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${h * 0.32}" rx="1.5" fill="#fff" opacity=".38"/>`
    + `<rect x="${x}" y="${y + h * 0.72}" width="${w}" height="${h * 0.28}" rx="2" fill="#000" opacity=".22"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="2.5" fill="none" stroke="#000" stroke-opacity=".35"/></g>`;
}

/** 下から積んだ塔。offsets は段ごとの横ずれ */
function tower(cx: number, floor: number, offsets: number[], colors: string[], w = 38, h = 15): string {
  return offsets.map((o, i) => block(cx - w / 2 + o, floor - h * (i + 1), w, h, colors[i % colors.length])).join('');
}

const frame = (inner: string): string =>
  `<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg">`
  + `<g stroke="${ACCENT}" stroke-width="1.5" fill="none" opacity=".55"><path d="M6 14V6H14M234 14V6H226M6 106V114H14M234 106V114H226"/></g>`
  + `<path d="M14 106H226" stroke="${ACCENT}" stroke-opacity=".45" stroke-width="1.5"/>`
  + inner + `</svg>`;

const crown = (x: number, y: number, s: number): string =>
  `<g transform="translate(${x} ${y}) scale(${s})" style="filter:drop-shadow(0 0 3px ${ACCENT})"><path d="M-10 6L-12 -6L-5 0L0 -9L5 0L12 -6L10 6Z" fill="${ACCENT}" stroke="#fff" stroke-opacity=".6" stroke-width=".8" stroke-linejoin="round"/></g>`;

/** ランキング挑戦: 積み上げた塔と、その上に伸びる「過去の記録」の点線 */
export const SOLO_ART = frame(
  `<g stroke-linecap="round"><path d="M20 24H220" stroke="${ACCENT}" stroke-width="1.8" stroke-dasharray="5 5" opacity=".85"/>`
  + `<path d="M20 46H220" stroke="#d0e0f0" stroke-width="1.2" stroke-dasharray="4 6" opacity=".4"/>`
  + `<path d="M20 64H220" stroke="#cd7f32" stroke-width="1.2" stroke-dasharray="4 6" opacity=".4"/></g>`
  + `<g font-family="Arial" font-weight="900" font-size="9" fill="${ACCENT}"><text x="24" y="19">1st</text></g>`
  + crown(206, 14, 1)
  + tower(120, 106, [0, 6, -5, 4, -3], COLORS)
  + `<path d="M120 28V19" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".8"/><path d="M116 22L120 17L124 22" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" opacity=".8"/>`
  + `<g fill="${ACCENT}" opacity=".9" style="filter:drop-shadow(0 0 3px ${ACCENT})"><path d="M60 40l2 5 5 .5-4 3.5 1.2 5L60 51l-4.2 3 1.2-5-4-3.5 5-.5z"/><path d="M182 62l1.5 3.6 3.9.4-3 2.6.9 3.8-3.3-2.2-3.3 2.2.9-3.8-3-2.6 3.9-.4z"/></g>`,
);

/** オンライン対戦: 2人の塔が並び、間に VS */
export const ONLINE_ART = frame(
  tower(58, 106, [0, 5, -4, 3], [P1, '#1f9fbd', P1, '#1f9fbd'], 36, 15)
  + tower(182, 106, [0, -5, 4, -3, 2], [P2, '#d94a4a', P2, '#d94a4a', P2], 36, 15)
  + `<g style="filter:drop-shadow(0 0 6px ${ACCENT})"><path d="M120 22L146 50L120 78L94 50Z" fill="#0b1018" stroke="${ACCENT}" stroke-width="2.5" stroke-linejoin="round"/>`
  + `<text x="120" y="57.5" text-anchor="middle" fill="${ACCENT}" font-size="20" font-family="Arial" font-weight="900" font-style="italic">VS</text></g>`
  + `<g stroke="${ACCENT}" stroke-width="2" fill="none" stroke-linecap="round" opacity=".7"><path d="M84 50H92M148 50H156" stroke-dasharray="3 4"/><path d="M104 14Q120 4 136 14M110 21Q120 14 130 21"/></g>`
  + `<g fill="${P1}"><circle cx="36" cy="30" r="3"/></g><g fill="${P2}"><circle cx="204" cy="30" r="3"/></g>`,
);
