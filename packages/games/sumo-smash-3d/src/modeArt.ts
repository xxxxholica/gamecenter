// モード選択カードの絵(インラインSVG)。固定の文字列だけを返す。

const ACCENT = '#e63946';
const SKIN = '#efc49b';
const SKIN_DARK = '#d29f74';
const SAND = '#c9a36a';
const STRAW = '#e6c98a';

/** 腰を落として組み合う力士(足元の中心が (x, floor)、右向き。dir=-1 で左向き) */
function rikishi(x: number, floor: number, dir: 1 | -1, mawashi: string, scale = 0.92): string {
  return `<g transform="translate(${x} ${floor}) scale(${dir * scale} ${scale})">`
    + `<g stroke="${SKIN_DARK}" stroke-width="11" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M0 -30L15 -19L19 -3"/><path d="M-3 -30L-17 -17L-24 -3"/></g>`
    + `<ellipse cx="3" cy="-49" rx="23" ry="25" fill="${SKIN}"/><ellipse cx="-4" cy="-56" rx="10" ry="12" fill="#fff" opacity=".18"/>`
    + `<path d="M-19 -35Q4 -24 27 -37L25 -27Q4 -14 -17 -25Z" fill="${mawashi}"/>`
    + `<g stroke="${SKIN}" stroke-width="9.5" fill="none" stroke-linecap="round"><path d="M9 -64L36 -57"/></g><circle cx="38" cy="-56.5" r="5.5" fill="${SKIN}"/>`
    + `<circle cx="10" cy="-82" r="10.5" fill="${SKIN}"/><path d="M0 -88Q9 -97 20 -88Q10 -91 0 -88Z" fill="#2a1d18"/><ellipse cx="7" cy="-98" rx="5.5" ry="3" fill="#2a1d18"/>`
    + `<circle cx="15" cy="-82" r="1.5" fill="#2a1d18"/><path d="M12 -76Q16 -74 19 -76" stroke="#8a4a3a" stroke-width="1.4" fill="none" stroke-linecap="round"/></g>`;
}

const frame = (inner: string): string =>
  `<svg viewBox="0 0 240 120" xmlns="http://www.w3.org/2000/svg">`
  + `<defs><linearGradient id="smo-sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#dcb97c"/><stop offset="1" stop-color="#a98450"/></linearGradient></defs>`
  + `<g stroke="${ACCENT}" stroke-width="1.5" fill="none" opacity=".6"><path d="M6 14V6H14M234 14V6H226M6 106V114H14M234 106V114H226"/></g>`
  + inner + `</svg>`;

/** CPU対戦: 土俵の上で組み合う2人の力士 */
export const CPU_ART = frame(
  `<ellipse cx="120" cy="107" rx="108" ry="9" fill="#6b4f2c"/><ellipse cx="120" cy="103" rx="108" ry="9" fill="url(#smo-sand)"/>`
  + `<ellipse cx="120" cy="103" rx="78" ry="6" fill="none" stroke="${STRAW}" stroke-width="3.5" stroke-dasharray="8 3"/>`
  + rikishi(78, 104, 1, '#1b6fa8') + rikishi(162, 104, -1, ACCENT)
  + `<g transform="translate(120 36) scale(.62) translate(-118 -42)" style="filter:drop-shadow(0 0 5px ${ACCENT})"><path d="M118 22L124 36L138 38L127 47L130 61L118 53L106 61L109 47L98 38L112 36Z" fill="#ffcc33" stroke="#fff" stroke-opacity=".7" stroke-width="1"/></g>`
  + `<text x="120" y="39.5" text-anchor="middle" fill="#2a1d18" font-size="8" font-family="Arial" font-weight="900" font-style="italic">VS</text>`,
);

/** 土俵を上から見て、4人が乱戦 */
export const ONLINE_ART = frame(
  `<ellipse cx="120" cy="66" rx="106" ry="46" fill="#6b4f2c"/><ellipse cx="120" cy="62" rx="106" ry="46" fill="url(#smo-sand)"/>`
  + `<ellipse cx="120" cy="62" rx="80" ry="34" fill="none" stroke="${STRAW}" stroke-width="4" stroke-dasharray="9 3"/>`
  + [[88, 48, '#1b6fa8'], [152, 48, ACCENT], [96, 78, '#2e9b3e'], [146, 77, '#8b5cc7']].map(([cx, cy, c]) =>
    `<g><ellipse cx="${cx}" cy="${cy}" rx="17" ry="11" fill="${SKIN}"/><ellipse cx="${cx}" cy="${Number(cy) + 2}" rx="17" ry="6" fill="none" stroke="${c}" stroke-width="5"/>`
    + `<circle cx="${cx}" cy="${Number(cy) - 8}" r="6.5" fill="${SKIN}"/><ellipse cx="${cx}" cy="${Number(cy) - 14}" rx="3.5" ry="2" fill="#2a1d18"/></g>`).join('')
  + `<g stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".85"><path d="M104 56L112 60M136 56L128 60M108 70L114 66M132 70L126 66"/></g>`
  + `<g style="filter:drop-shadow(0 0 4px ${ACCENT})"><circle cx="120" cy="62" r="9" fill="#0b1018" stroke="${ACCENT}" stroke-width="2"/><text x="120" y="66" text-anchor="middle" fill="${ACCENT}" font-size="11" font-family="Arial" font-weight="900">4P</text></g>`,
);
