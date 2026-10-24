import * as THREE from 'three';
import { MapMetadata } from './MapBase';
import { StreamedCityMap } from './StreamedCityMap';
import { buildViaduct } from './ViaductBuilder';
import { spreadSigns, routeLength } from './RoadNetwork';
import { buildRoadSigns, buildCurveSigns, SignSpec, SignStyle } from './RoadSigns';
import { RoadTube } from './RoadTube';
import { GoalHologram } from './GoalHologram';
import { buildStreetLights, StreetLights } from './StreetLights';
import { SECTOR_FRACTIONS } from '../core/Ghost';

/** A designed course as written by the design scripts: rows [x, deckY, z, supportY] ~2 m apart (closed loop). */
export interface TechnicalCourseData {
  roadWidth?: number;
  length: number;
  deckMin: number;
  deckMax: number;
  road: number[][];
}

export interface TechnicalCityConfig {
  metadata: MapMetadata;
  course: TechnicalCourseData;
  /** URL of the chunk directory of the city (with trailing slash). */
  modelBase: string;
  signs: SignSpec[];
  signStyle: SignStyle;
  kmText: (metres: number) => string;
  /** Flat plane under everything (sea / dark ground) where no city chunk covers. */
  ground: { color: number; y: number };
  loadRadius: number;
  unloadRadius: number;
  fogDensity: number;
  viewDistance: number;
  carLift?: number;
  /** How much the road gradient works on the car (see StreamedCityMap.gradeEffect). */
  gradeEffect?: number;
  girderDepth?: number;
  pillarSpacing?: number;
  /** Lit windows of the buildings at night (see StreamedCityMap.nightLook): colour, share lit, window cell size in metres. */
  nightLook?: { color: [number, number, number]; density: number; floorH: number; winW: number };
}

/**
 * A designed "technical" loop over a streamed city: competitive rules (ghost, time limit, drift boost), the road gradient acting on
 * the car, buildings cut out of the deck's way at load time, and the goal hologram. The city-specific parts come from the config.
 */
export abstract class TechnicalCityMap extends StreamedCityMap {
  public readonly metadata: MapMetadata;
  public override readonly competitive = true;

  public readonly startPosition: THREE.Vector3;
  public readonly startRotationY: number;

  protected readonly modelBase: string;
  protected readonly road: THREE.Vector3[];
  private readonly support: number[];
  private readonly roadWidth: number;

  public override getRoadWidth(): number | null { return this.roadWidth; }
  private goal: GoalHologram | null = null;
  private lights: StreetLights | null = null;
  private baseMat: THREE.MeshBasicMaterial | null = null;

  constructor(private readonly cfg: TechnicalCityConfig) {
    super();
    this.metadata = cfg.metadata;
    this.modelBase = cfg.modelBase;
    this.roadWidth = cfg.course.roadWidth ?? 13.5;
    this.hasFarTier = true;
    this.loadRadius = cfg.loadRadius;
    this.unloadRadius = cfg.unloadRadius;
    this.corridorHalfWidth = this.roadWidth / 2 - 1.0;
    this.carLift = cfg.carLift ?? 0.06;
    this.gradeEffect = cfg.gradeEffect ?? 0.7;
    this.fogDensity = cfg.fogDensity;
    this.viewDistance = cfg.viewDistance;
    if (cfg.nightLook) this.nightLook = { ...cfg.nightLook, color: new THREE.Color(...cfg.nightLook.color) };

    const rows = cfg.course.road;
    this.road = rows.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.support = rows.map((r) => r[3]);
    this.smoothRoadHeights(8, 2);   // keep the crests and dips, but take the kinks out of the baked profile
    this.goalIndex = this.road.length * SECTOR_FRACTIONS[SECTOR_FRACTIONS.length - 1];   // where TimeAttackManager ends the race
    this.roadTube = new RoadTube(this.road, this.roadWidth / 2 + 2.0);   // deck half width + parapet + girder overhang + margin

    this.startPosition = this.road[0].clone();
    const next = this.road[Math.min(6, this.road.length - 1)];
    this.startRotationY = Math.atan2(next.x - this.road[0].x, next.z - this.road[0].z);

    this.buildMap();
  }

  public buildMap(): void {
    const c = this.cfg, W = this.roadWidth;
    const pts = this.road.filter((_, i) => i % 5 === 0);
    this.roadSpline = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    this.checkpoints = pts.filter((_, i) => i % 10 === 0);

    this.group.add(buildViaduct(this.road, this.support, { roadWidth: W, girderDepth: c.girderDepth ?? 1.5, parapetHeight: 1.0, pillarSpacing: c.pillarSpacing ?? 22, textureRepeat: 16 }));

    const signs = spreadSigns(c.signs, routeLength(this.road), c.kmText, 2);
    this.group.add(buildRoadSigns(this.road, W, signs, c.signStyle));
    this.group.add(buildCurveSigns(this.road, W));   // chevrons on the outside of every sharp bend
    this.lights = buildStreetLights(this.road, W); // expressway lights at an equal spacing
    this.group.add(this.lights.group);

    // Goal hologram at the finish line; hidden until the run is well under way
    const gi = Math.floor(this.goalIndex!), gu = this.goalIndex! - gi, n = this.road.length;
    const a = this.road[gi % n], b = this.road[(gi + 1) % n];
    this.goal = new GoalHologram(a.clone().lerp(b, gu), Math.atan2(b.x - a.x, b.z - a.z), W);
    this.group.add(this.goal.group);

    this.baseMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(c.ground.color).multiplyScalar(0.4) });
    const base = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000), this.baseMat);
    base.rotation.x = -Math.PI / 2;
    base.position.set(0, c.ground.y, 0);
    this.group.add(base);
  }

  public override setGoalVisible(on: boolean): void { this.goal?.setVisible(on); }
  public override burstGoal(carVel: THREE.Vector3): void { this.goal?.burst(carVel); }
  public override resetGoal(): void { this.goal?.reset(); }

  public override update(dt: number, carPosition: THREE.Vector3): void {
    super.update(dt, carPosition);
    this.goal?.update(dt);
  }

  public override dispose(): void {
    this.goal?.dispose();
    super.dispose();
  }
}
