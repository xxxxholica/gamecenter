import * as THREE from 'three';
import { MapMetadata } from './MapBase';
import { StreamedCityMap } from './StreamedCityMap';
import { buildRoadSigns, JP_STYLE, SignSpec } from './RoadSigns';
import { GoalHologram } from './GoalHologram';
import { SECTOR_FRACTIONS } from '../core/Ghost';
import { buildTougeCourse } from './TougeBuilder';
import type { CarController } from '../core/CarController';
import courseData from './touge_downhill.json';

const SIGNS: SignSpec[] = [
  {
    kind: 'gantry',
    at: 26,
    snap: 4,
    priority: true,
    rows: [
      { main: '展望駐車場', sub: 'Summit Parking', arrow: 'upleft' },
      { main: '月影・湯元', sub: 'Tsukikage Onsen', arrow: 'up' },
    ],
  },
  {
    kind: 'side',
    at: 840,
    rows: [
      { main: '連続つづら折り', sub: 'Hairpin Section', arrow: 'up' },
      { main: '湯元渓谷', sub: 'Yumoto Gorge', arrow: 'up' },
    ],
  },
  {
    kind: 'side',
    at: 1995,
    rows: [
      { main: '湯元温泉街', sub: 'Onsen Town', arrow: 'up' },
      { main: '紅雲橋', sub: 'Red Arch Bridge', arrow: 'up' },
    ],
  },
  {
    kind: 'side',
    at: 2150,
    rows: [
      { main: '月影第一隧道', sub: 'Tsukikage Bypass Tunnel', arrow: 'up' },
      { main: '山頂展望台', sub: 'Summit', arrow: 'up' },
    ],
  },
  { kind: 'km', at: 300, text: '0.3' },
  { kind: 'km', at: 600, text: '0.6' },
  { kind: 'km', at: 1000, text: '1.0' },
  { kind: 'km', at: 1400, text: '1.4' },
  { kind: 'km', at: 2010, text: '2.0' },
];

/**
 * "Tsukikage Onsen Touge Downhill" (月影・湯元 峠ダウンヒル)
 * Built from the 4 Nano Banana Pro visual targets:
 *  - View 1: Summit Start with Cylindrical Steel Water Tower, Retro Vending Machines & Overhead Highway Gantry
 *  - View 2: Famous 5 Consecutive Hairpins with Red Deceleration Strips, Inner Gutter Grating, Concrete Crib Wall & Curve Mirrors
 *  - View 3: Cliffside Concrete Snow Shed (洞門) -> Vermilion Red Steel Arch Bridge over the Onsen Resort Town Night Panorama
 *  - View 4: High-Speed Mountain Bypass Tunnel Hillclimb with White Tiled Walls, Twin Amber Sodium Strips, Jet Fans & Exit Signs
 */
export class TougeDownhillMap extends StreamedCityMap {
  public readonly metadata: MapMetadata = {
    id: 'tsukikage_touge',
    name: '月影・湯元 峠ダウンヒル',
    subtitle: 'Tsukikage Onsen Touge Downhill',
    area: '月影山〜湯元温泉渓谷',
    courseLength: `${(courseData.length / 1000).toFixed(1)} km`,
    difficulty: '★★★★★',
    description:
      '山頂の給水塔・自販機コーナーからスタートし、高速S字と名物「5連ヘアピン」を一気に駆け下りる峠サーキット。イン側の側溝（側溝走り）を使ったコーナリング、洞門から飛び出す赤いアーチ鉄橋と眼下の温泉街夜景、そして山頂へ一気に駆け上がる高速山岳バイパストンネルが待ち受けます。',
    keySpots: ['山頂給水塔・自販機コーナー', '名物5連ヘアピン＆側溝', '洞門〜赤い鉄橋＆温泉街夜景', '高速山岳バイパストンネル'],
    tag: 'TOUGE 3D',
  };

  public override readonly competitive = true;
  /** 峠は道沿いの灯りが多い(街灯・灯籠など)ので、反射板・鋲はまばらにする(約24mおき) */
  public override readonly roadsideStep = 12;
  public readonly startPosition: THREE.Vector3;
  public readonly startRotationY: number;

  protected readonly modelBase = '';
  protected readonly road: THREE.Vector3[];
  private readonly zones: number[];
  private readonly roadWidth: number;
  private goal: GoalHologram | null = null;

  public override getRoadWidth(): number | null {
    return this.roadWidth;
  }

  constructor() {
    super();
    this.roadWidth = courseData.roadWidth ?? 12.0;
    this.hasFarTier = false;
    this.corridorHalfWidth = this.roadWidth / 2 - 0.85;
    this.carLift = 0.06;
    this.gradeEffect = 0.85;
    this.fogDensity = 0.0014;
    this.viewDistance = 3200;

    const rows = courseData.road as number[][];
    this.road = rows.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.zones = rows.map((r) => r[3] ?? 1);
    this.smoothRoadHeights(8, 2);
    this.goalIndex = this.road.length * SECTOR_FRACTIONS[SECTOR_FRACTIONS.length - 1];

    this.startPosition = this.road[0].clone();
    const next = this.road[Math.min(6, this.road.length - 1)];
    this.startRotationY = Math.atan2(next.x - this.road[0].x, next.z - this.road[0].z);

    this.buildMap();
  }

  /** Procedural touge course needs no external city chunk streaming; completes immediately. */
  public override async loadOpenData(): Promise<void> {
    this.onProgress?.(1, 1);
  }

  public buildMap(): void {
    const W = this.roadWidth;
    const pts = this.road.filter((_, i) => i % 5 === 0);
    this.roadSpline = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.checkpoints = pts.filter((_, i) => i % 10 === 0);

    // 1. Complete Touge 3D Geometry (Road, Hairpin Strips, Gutters, Crib Walls, Snow Shed, Red Arch Bridge, Onsen Town, Tunnel, Cedar Forest)
    this.group.add(
      buildTougeCourse(this.road, {
        roadWidth: W,
        zones: courseData.zones,
        zonePerSample: this.zones,
      }),
    );

    // 2. Japanese Highway Gantry & Roadside Signs
    this.group.add(buildRoadSigns(this.road, W, SIGNS, JP_STYLE));

    // 3. Goal Hologram on the Summit Finish Straight (u = 0.98)
    const gi = Math.floor(this.goalIndex!), gu = this.goalIndex! - gi, n = this.road.length;
    const a = this.road[gi % n], b = this.road[(gi + 1) % n];
    this.goal = new GoalHologram(a.clone().lerp(b, gu), Math.atan2(b.x - a.x, b.z - a.z), W);
    this.group.add(this.goal.group);

    // 4. Deep Valley Ground Plane
    const base = new THREE.Mesh(
      new THREE.PlaneGeometry(8000, 8000),
      new THREE.MeshBasicMaterial({ color: 0x0b1017 }),
    );
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, -18, 0);
    this.group.add(base);
  }

  public override constrainCar(car: CarController, dt: number = 1 / 60): void {
    super.constrainCar(car, dt);

    const n = this.road.length;
    const prog = this.getProgressFraction();
    const idx = Math.min(n - 1, Math.max(0, Math.floor(prog * n)));
    const zone = this.zones[idx];

    // 1. Tunnel Jet-Fan Tailwind (View 4): inside the high-speed mountain bypass tunnel (Zone 5),
    //    compensate uphill gravity drag so the car rockets up the tunnel climb at 150-168 km/h!
    if (zone === 5 && car.canDrive && car.speed > 8) {
      car.speed = Math.min(car.maxSpeed * 1.24, car.speed + 9.8 * this.gradeEffect * 0.145 * dt);
    }

    // 2. Gutter Run (側溝走り) Assist on S-Curves & 5 Consecutive Hairpins (Zone 1 & Zone 2):
    //    When the car hooks its inner wheels over the concrete gutter grating (3.8m..5.15m from centre),
    //    give a subtle cornering bite & slight inner-wheel drop!
    if ((zone === 1 || zone === 2) && car.canDrive && Math.abs(car.currentSteerAngle) > 0.15 && car.speed > 12) {
      const r = this.road[idx];
      const d = Math.hypot(car.position.x - r.x, car.position.z - r.z);
      if (d > this.corridorHalfWidth - 1.35 && d <= this.corridorHalfWidth - 0.05) {
        car.position.y -= 0.035; // Inner tire drops slightly into the gutter grating
        const bite = Math.sign(car.currentSteerAngle) * 0.22 * dt;
        car.rotationY += bite;
        car.velocityHeading += bite;
      }
    }
  }

  public override setGoalVisible(on: boolean): void {
    this.goal?.setVisible(on);
  }

  public override burstGoal(carVel: THREE.Vector3): void {
    this.goal?.burst(carVel);
  }

  public override resetGoal(): void {
    this.goal?.reset();
  }

  /** 洞門(Zone 3)とトンネル(Zone 5)には屋根がある */
  public override isRoofed(i: number): boolean {
    const z = this.zones[i];
    return z === 3 || z === 5;
  }

  public override update(dt: number, carPosition: THREE.Vector3): void {
    super.update(dt, carPosition);
    this.goal?.update(dt);
  }

  public override dispose(): void {
    this.goal?.dispose();
    super.dispose();
  }
}
