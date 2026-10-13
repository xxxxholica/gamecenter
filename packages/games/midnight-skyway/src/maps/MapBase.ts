import * as THREE from 'three';
import type { CarController } from '../core/CarController';
import type { RoadBlockade } from './RoadBlockade';
import type { Traffic } from '../core/Traffic';

export interface MapMetadata {
  id: string;
  name: string;
  subtitle: string;
  area: string;
  courseLength: string;
  difficulty: '★☆☆☆☆' | '★★☆☆☆' | '★★★☆☆' | '★★★★☆' | '★★★★★';
  description: string;
  keySpots: string[];
  attribution?: string;
  /** Short badge shown in the HUD (data source). */
  tag?: string;
}

export abstract class MapBase {
  public abstract readonly metadata: MapMetadata;
  public group: THREE.Group;
  public abstract readonly startPosition: THREE.Vector3;
  public abstract readonly startRotationY: number;
  public roadSpline: THREE.CatmullRomCurve3 | null = null;
  public checkpoints: THREE.Vector3[] = [];
  /** Extra polylines for the minimap: side routes and the opposite carriageway ([x, z] pairs). */
  public overviewRoutes: { points: THREE.Vector2[]; drivable: boolean }[] = [];
  /** Optional FogExp2 density override for this map. */
  public fogDensity?: number;
  /** Camera far plane for this map (default 2000). */
  public viewDistance?: number;

  /** Wangan Midnight style barricades & collisions */
  public blockade: RoadBlockade | null = null;
  /** Minimap coordinates of blockades [x, z] */
  public blockadePositions: THREE.Vector2[] = [];

  /** Race rules on: ghost / pace-bot rival, time-limit checkpoints, drift points and boost. Off = plain time attack. */
  public readonly competitive: boolean = false;

  /** Dense samples of the drivable closed route (~2 m apart) for the rival bot; null when the map has none. */
  public getRoutePoints(): THREE.Vector3[] | null { return null; }

  /** 欄干の間の路面の幅(m)。走行ルートに沿った演出(反射板・鋲)に使う。分からなければ null。 */
  public getRoadWidth(): number | null { return null; }

  /** How much the road gradient works on the car (0 = not at all): the rival bot drives with the same physics. */
  public getGradeEffect(): number { return 0; }

  /** How far the car origin rides above the route samples. */
  public getCarLift(): number { return 0; }

  /** Returns the road surface elevation Y at coordinates (x, z). Returns 0 by default. */
  public getSurfaceY(_pos: { x: number; z: number }): number { return 0; }

  /** Called when the car is (re)placed at the start: reset any road tracking and put it on the road surface. */
  public onRespawn(_car: CarController): void {}

  /** Day / night: maps switch their own lights (street lamps) here. */
  public setNight(_night: boolean): void {}

  /** Shows / hides the goal hologram (maps without one ignore it). */
  public setGoalVisible(_on: boolean): void {}

  /** Traffic system (Opposite + Same-lane obstacles) */
  public traffic: Traffic | null = null;

  constructor() {
    this.group = new THREE.Group();
  }

  /** Lets a map spread GPU uploads over several frames (called by DriveScene when the map is loaded). */
  public attachRenderer(_renderer: THREE.WebGLRenderer): void {}

  public abstract buildMap(): void;
  public async loadOpenData?(): Promise<void>;

  /** Called every frame after the car moved: keep it on the ground / inside the drivable area. */
  /** Per-frame hook for map-owned animation (traffic, ...). */
  public update(_dt: number, _carPosition: THREE.Vector3): void {}

  public constrainCar(_car: CarController, _dt: number = 1 / 60): void {}

  public getProgressFraction(): number {
    return 0;
  }

  public dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
        if (child.geometry) child.geometry.dispose();
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (!m) return;
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        });
      }
    });
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }
  }
}
