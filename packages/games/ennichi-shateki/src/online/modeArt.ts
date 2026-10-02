// モード選択のカードの絵(固定のSVG)。

/** オフライン: コルク銃と的 */
export const OFFLINE_ART = `<svg viewBox="0 0 120 80" aria-hidden="true"><circle cx="86" cy="36" r="22" fill="none" stroke="#e8eef8" stroke-width="4"/><circle cx="86" cy="36" r="13" fill="none" stroke="#ff4d4f" stroke-width="4"/><circle cx="86" cy="36" r="4" fill="#ffd54a"/><path d="M10 54h46l6-8h14v8h6v8H34l-6 8h-8l4-8H10z" fill="#e8eef8"/><rect x="62" y="40" width="10" height="6" fill="#ffd54a"/></svg>`;

/** オンライン: 4つの屋台が並ぶ */
export const ONLINE_ART = `<svg viewBox="0 0 120 80" aria-hidden="true">${[0, 1, 2, 3].map((i) => `<g transform="translate(${6 + i * 28} 14)"><path d="M0 14l12-12 12 12z" fill="${['#ff4d4f', '#ffd54a', '#00e5ff', '#00e676'][i]}"/><rect x="2" y="14" width="20" height="26" fill="#1c2a44" stroke="#e8eef8" stroke-width="2"/><rect x="6" y="20" width="12" height="6" fill="#ffd54a"/></g>`).join('')}<text x="60" y="68" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="24" fill="#fff" stroke="#05070c" stroke-width="2" paint-order="stroke">VS</text></svg>`;

/** 対戦: 向かい合う2丁のコルク銃 */
export const VERSUS_ART = `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M8 50h34l5-7h10v7h4v7H27l-5 8h-7l3-8H8z" fill="#e8eef8"/><path d="M112 30H78l-5 7H63v-7h-4v-7h27l5-8h7l-3 8h17z" fill="#ffd54a"/><text x="60" y="48" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="22" fill="#fff" stroke="#05070c" stroke-width="2" paint-order="stroke">VS</text></svg>`;

/** 協力: 同じ的に向かう2丁と、ハート */
export const COOP_ART = `<svg viewBox="0 0 120 80" aria-hidden="true"><circle cx="86" cy="34" r="20" fill="none" stroke="#e8eef8" stroke-width="4"/><circle cx="86" cy="34" r="10" fill="none" stroke="#ff4d4f" stroke-width="4"/><path d="M8 46h32l5-6h9v6h4v6H26l-5 8h-7l3-8H8z" fill="#e8eef8"/><path d="M8 62h28l4-5h8v5h3v5H24l-4 6h-6l2-6H8z" fill="#ffd54a"/><path d="M60 12c-5-7-15 0-9 7l9 8 9-8c6-7-4-14-9-7z" fill="#ff4d4f"/></svg>`;
