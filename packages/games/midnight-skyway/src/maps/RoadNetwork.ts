import * as THREE from 'three';
import type { SignSpec } from './RoadSigns';

export function routeLength(pts: THREE.Vector3[], closed = true): number {
  let len = 0;
  const n = pts.length;
  for (let i = 1; i < (closed ? n + 1 : n); i++) len += Math.hypot(pts[i % n].x - pts[i - 1].x, pts[i % n].z - pts[i - 1].z);
  return len;
}

/**
 * Spreads the sign designs of `base` (its gantries and roadside boards, cycled) evenly around a loop of `length` metres,
 * `factor` times as many as listed, plus a kilometre post every `kmEvery` metres.
 */
export function spreadSigns(base: SignSpec[], length: number, kmText: (metres: number) => string, factor = 3, kmEvery = 200): SignSpec[] {
  const out: SignSpec[] = [];
  for (const [kind, phase] of [['gantry', 0.35], ['side', 0.85]] as const) {
    const list = base.filter((s) => s.kind === kind);
    if (!list.length) continue;
    const count = list.length * factor, step = length / count;
    for (let k = 0; k < count; k++) {
      // side boards are nudged off a gantry that would land on the same spot
      let at = (k + phase) * step;
      if (kind === 'side') at += 45;
      out.push({ ...list[(k + (kind === 'side' ? 1 : 0)) % list.length], at: at % length });
    }
  }
  for (let m = kmEvery; m < length - 80; m += kmEvery) out.push({ kind: 'km', at: m, text: kmText(m) });
  return out;
}
