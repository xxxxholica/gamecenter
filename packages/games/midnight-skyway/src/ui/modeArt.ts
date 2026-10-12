// モード選択カードの絵(インラインSVG)。固定の文字列だけを返す。道路を車の後ろから見た構図で、他のゲームと同じく背景は塗らず、角の枠と床の線だけを引く。

const CYAN = '#00f0ff';
const MAGENTA = '#ff3df0';

/** 後ろから見た車。足元の中心が (cx, base) */
function car(cx: number, base: number, scale: number, body: string, glow: string): string {
  return `<g transform="translate(${cx} ${base}) scale(${scale})">`
    + `<ellipse cx="0" cy="1" rx="40" ry="5" fill="${glow}" opacity=".45" style="filter:blur(2px)"/>`
    + `<rect x="-31" y="-15" width="9" height="14" rx="2" fill="#080b12"/><rect x="22" y="-15" width="9" height="14" rx="2" fill="#080b12"/>`
    + `<path d="M-23 -27L-17 -42L17 -42L23 -27Z" fill="${body}"/><path d="M-23 -27L-17 -42L17 -42L23 -27Z" fill="#000" opacity=".25"/>`
    + `<path d="M-18.5 -29L-14 -39.5L14 -39.5L18.5 -29Z" fill="#14233d"/><path d="M-14 -39.5L-4 -39.5L-10 -29L-18.5 -29Z" fill="#fff" opacity=".14"/>`
    + `<rect x="-34" y="-28" width="68" height="20" rx="7" fill="${body}"/><rect x="-34" y="-28" width="68" height="7" rx="4" fill="#fff" opacity=".22"/><rect x="-34" y="-14" width="68" height="6" rx="3" fill="#000" opacity=".28"/>`
    + `<rect x="-31" y="-23" width="16" height="5.5" rx="2" fill="#ff3355" style="filter:drop-shadow(0 0 3px #ff3355)"/><rect x="15" y="-23" width="16" height="5.5" rx="2" fill="#ff3355" style="filter:drop-shadow(0 0 3px #ff3355)"/>`
    + `<rect x="-8" y="-18" width="16" height="7" rx="1.5" fill="#e8eef8"/><rect x="-26" y="-46" width="52" height="3.5" rx="1.5" fill="#080b12"/></g>`;
}

const dashes = (): string => {
  let d = '';
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5, t1 = (i + 0.55) / 5;
    const y0 = 58 + 48 * t0 * t0, y1 = 58 + 48 * t1 * t1;
    const w0 = 0.6 + 4.4 * t0 * t0, w1 = 0.6 + 4.4 * t1 * t1;
    d += `<path d="M${120 - w0 / 2} ${y0}L${120 + w0 / 2} ${y0}L${120 + w1 / 2} ${y1}L${120 - w1 / 2} ${y1}Z" fill="#fff" opacity=".6"/>`;
  }
  return d;
};

const scene = (inner: string): string =>
  `<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg">`
  + `<g stroke="${CYAN}" stroke-width="1.5" fill="none" opacity=".55"><path d="M6 14V6H14M234 14V6H226M6 106V114H14M234 106V114H226"/></g>`
  + `<path d="M14 106H226" stroke="${CYAN}" stroke-opacity=".45" stroke-width="1.5"/>`
  + `<path d="M116 58L26 106" stroke="${CYAN}" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 0 3px ${CYAN})"/><path d="M124 58L214 106" stroke="${MAGENTA}" stroke-width="2" stroke-linecap="round" style="filter:drop-shadow(0 0 3px ${MAGENTA})"/>`
  + dashes()
  + inner + `</svg>`;

/** オフライン走行: ひとりで走る */
export const CAR = scene(
  `<g stroke="#fff" stroke-linecap="round" opacity=".5" stroke-width="1.6"><path d="M44 62L62 74M32 80L50 90M196 62L178 74M208 80L190 90"/></g>`
  + car(120, 105, 1, '#e8eef8', CYAN)
  + `<g transform="translate(206 28)" fill="none" stroke="${CYAN}" stroke-width="2" style="filter:drop-shadow(0 0 3px ${CYAN})"><circle cx="0" cy="3" r="9"/><path d="M0 3V-3M0 3L5 6M-3 -9H3"/></g>`,
);

/** オンライン対戦: 2台が並んで競う */
export const VS = scene(
  car(80, 105, 0.9, '#2b7fff', CYAN) + car(160, 94, 0.66, '#ff3d8b', MAGENTA)
  + `<g style="filter:drop-shadow(0 0 6px ${CYAN})"><text x="120" y="44" text-anchor="middle" fill="#fff" font-size="26" font-family="Arial" font-weight="900" font-style="italic" stroke="${CYAN}" stroke-width="1">VS</text></g>`
  + `<g stroke-linecap="round" fill="none" opacity=".7"><path d="M96 18Q120 4 144 18" stroke="${CYAN}" stroke-width="2"/><path d="M104 24Q120 14 136 24" stroke="${MAGENTA}" stroke-width="2"/></g>`,
);
