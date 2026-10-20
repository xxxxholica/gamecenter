import tokyoClimb from '../maps/tokyo_climb.json';
import tougeDownhill from '../maps/touge_downhill.json';

type Pt = [number, number];
/** the route the car drives, in order, from the start line (every course is a plain loop) */
interface Outline { drive: Pt[] }

const xz = (rows: number[][]): Pt[] => rows.map((r) => [r[0], r[2]]);

const OUTLINES: Record<string, Outline> = {
  tsukikage_touge: { drive: xz(tougeDownhill.road) },
  tokyo_climb: { drive: xz(tokyoClimb.road) },
};

/** SVG of a course's layout: driven route with start marker and direction. */
export function courseOutlineSvg(mapId: string): string {
  const o = OUTLINES[mapId];
  if (!o) return '';
  const all = o.drive;
  const minX = Math.min(...all.map((p) => p[0])), maxX = Math.max(...all.map((p) => p[0]));
  const minZ = Math.min(...all.map((p) => p[1])), maxZ = Math.max(...all.map((p) => p[1]));
  const W = 200, H = 120, PAD = 6;
  const k = Math.min((W - 2 * PAD) / (maxX - minX || 1), (H - 2 * PAD) / (maxZ - minZ || 1));
  const ox = (W - (maxX - minX) * k) / 2, oz = (H - (maxZ - minZ) * k) / 2;
  const P = (p: Pt): string => `${((p[0] - minX) * k + ox).toFixed(1)},${((p[1] - minZ) * k + oz).toFixed(1)}`;
  const line = (pts: Pt[], step = 3): string => pts.filter((_, i) => i % step === 0 || i === pts.length - 1).map(P).join(' ');
  const start = P(o.drive[0]);
  // direction: a small triangle a little way along the route, pointing along it
  const a = o.drive[Math.min(30, o.drive.length - 1)], b = o.drive[Math.min(36, o.drive.length - 1)];
  const [ax, az] = P(a).split(',').map(Number), [bx, bz] = P(b).split(',').map(Number);
  const ang = (Math.atan2(bz - az, bx - ax) * 180) / Math.PI;
  return `<svg class="map-outline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <polyline class="ol-route-glow" points="${line(o.drive)} ${P(o.drive[0])}"/>
    <polyline class="ol-route" points="${line(o.drive)} ${P(o.drive[0])}"/>
    <polygon class="ol-arrow" points="-4,-3.5 4,0 -4,3.5" transform="translate(${ax.toFixed(1)} ${az.toFixed(1)}) rotate(${ang.toFixed(0)})"/>
    <circle class="ol-start" cx="${start.split(',')[0]}" cy="${start.split(',')[1]}" r="3.6"/>
  </svg>`;
}
