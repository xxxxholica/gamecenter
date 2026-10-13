import type { TimeOfDay } from '../core/TimeOfDay';

// 時間帯のアイコン(インラインSVG)。固定の文字列だけを返す。
const SUN = `<svg viewBox="0 0 120 80" aria-hidden="true"><circle cx="60" cy="40" r="17" fill="#ffd54a"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<line x1="60" y1="40" x2="${60 + 33 * Math.cos((a * Math.PI) / 180)}" y2="${40 + 33 * Math.sin((a * Math.PI) / 180)}" stroke="#ffd54a" stroke-width="4" stroke-linecap="round" stroke-dasharray="0 22 12 100"/>`).join('')}</svg>`;
const MOON = `<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M74 14a28 28 0 1 0 22 44A24 24 0 0 1 74 14z" fill="#f4f1de"/>${[[18, 16, 2], [34, 60, 1.5], [100, 20, 1.8], [22, 40, 1.2], [92, 66, 1.4]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>`).join('')}</svg>`;

export const TIME_ART: Record<TimeOfDay, { art: string; name: string }> = {
  day: { art: SUN, name: '日中' },
  night: { art: MOON, name: '夜間' },
};
