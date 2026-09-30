import * as THREE from 'three';
import type { CarController } from './CarController';

/**
 * Drives the car along the route by itself (pure pursuit): used for the winning run after the goal.
 * It steers with an analog value (no drift, no brake-steer), keeps a cruising speed and slows for bends.
 */
export class AutoPilot {
  private idx = 0;
  private readonly spacing: number;

  constructor(private readonly route: THREE.Vector3[], private readonly car: CarController, private readonly cruise = 20, private readonly minSpeed = 11) {
    // where the car is on the route (global search once, then a moving window)
    let best = Infinity;
    route.forEach((p, i) => {
      const d = (p.x - car.position.x) ** 2 + (p.z - car.position.z) ** 2 + (p.y - car.position.y) ** 2;   // 3D: a road may lie right above another
      if (d < best) { best = d; this.idx = i; }
    });
    this.spacing = 2.0;
    this.car.autopilot = { steer: 0, throttle: false, brake: false };
  }

  public stop(): void {
    if (this.car.autopilot) this.car.autopilot = null;
  }

  public update(): void {
    const ap = this.car.autopilot;
    if (!ap) return;
    const r = this.route, n = r.length, car = this.car, px = car.position.x, pz = car.position.z;
    // follow the nearest sample (window around the last one)
    let best = Infinity, bi = this.idx;
    for (let k = -30; k <= 30; k++) {
      const i = (this.idx + k + n * 4) % n, d = (r[i].x - px) ** 2 + (r[i].z - pz) ** 2;
      if (d < best) { best = d; bi = i; }
    }
    this.idx = bi;

    const speed = Math.max(0, car.speed);
    const look = THREE.MathUtils.clamp(speed * 0.9, 9, 26);
    const ahead = r[(bi + Math.round(look / this.spacing)) % n];
    let err = Math.atan2(ahead.x - px, ahead.z - pz) - car.rotationY;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    ap.steer = THREE.MathUtils.clamp(err * 1.8, -1, 1);

    // slow down for what is coming: heading change over the next ~50 m
    const h = (i: number): number => { const a = r[i % n], b = r[(i + 3) % n]; return Math.atan2(b.x - a.x, b.z - a.z); };
    let turn = h(bi + 25) - h(bi);
    while (turn > Math.PI) turn -= 2 * Math.PI;
    while (turn < -Math.PI) turn += 2 * Math.PI;
    const target = this.cruise - Math.min(1, Math.abs(turn) / 1.2) * (this.cruise - this.minSpeed);
    ap.throttle = speed < target;
    ap.brake = speed > target + 5;                            // only for a real overspeed: otherwise just coast down
  }
}
