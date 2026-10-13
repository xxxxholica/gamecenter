import * as THREE from 'three';
import { PrizeEntity } from './prizes';
import { DynamicTargetsManager } from './dynamic_targets';
import { sounds } from './audio';

export interface DefeatedPrizeRecord {
  type: string;
  name: string;
}

export interface PrizeBreakdownEntry {
  name: string;
  type: string;
  count: number;
  weight: number;
}

interface PhysicsItem {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  angVel: THREE.Vector3;
  radius: number;
  mass: number;
  restitution: number;
  spawnDelay: number;
  hasSpawned: boolean;
  hasLandedOnDesk: boolean;
  hasFallenOffDesk: boolean;
  isDespawned?: boolean;
}

interface SparkleParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

export class ResultsPrizePileManager {
  private defeatedItems: DefeatedPrizeRecord[] = [];
  private items: PhysicsItem[] = [];
  private sparkles: SparkleParticle[] = [];
  private sparkleGeo: THREE.BoxGeometry;
  private containerGroup: THREE.Group = new THREE.Group();
  private spotlight: THREE.SpotLight | null = null;
  /** 結果画面の照明(スポット・補助光)。光の数が変わると全ての材質のシェーダーが作り直されて止まるので、最初に1度だけ置いて、強さだけを変える */
  private lightGroup: THREE.Group | null = null;
  private ambientFill: THREE.AmbientLight | null = null;
  private lanternFill: THREE.PointLight | null = null;
  private static readonly SPOT_INTENSITY = 3.4;
  private static readonly AMBIENT_INTENSITY = 1.35;
  private static readonly LANTERN_INTENSITY = 2.2;
  private sparkleMats: THREE.MeshBasicMaterial[] = [];
  private deskMesh: THREE.Group | null = null;
  private isActive: boolean = false;
  /** この山を置く x のずれ(オンライン対戦: 4人分の山を、各レーンの前に並べる)。 */
  public offsetX = 0;
  /** 補助光(環境光・暖色の点光源)を足すか。複数の山を並べる時は、最初の山だけ true にする。 */
  public fillLights = true;
  private timer: number = 0;
  private tempProjVec: THREE.Vector3 = new THREE.Vector3();

  // Showcase Desk Geometry on the counter (low-cost static meshes)
  private readonly DESK_CENTER_X = 0.38;
  private readonly DESK_WIDTH = 0.72; // X range: [0.02, 0.74]
  private readonly DESK_BACK_Z = 1.12;
  private readonly DESK_FRONT_Z = 1.675; // Aligns with front edge of stall counter
  private readonly DESK_SURFACE_Y = 0.885;

  constructor() {
    this.sparkleGeo = new THREE.BoxGeometry(0.022, 0.022, 0.022);
    // 火花の材質は、色ごとに1つだけ作って使い回す(火花ごとに作らない)
    this.sparkleMats = [0xffd700, 0xff3b30, 0x00e5ff, 0xffffff, 0xff9500].map((color) => new THREE.MeshBasicMaterial({ color }));
  }

  /** 結果画面の照明を、強さ0で先にシーンへ置く(ゲーム開始時に1度だけ呼ぶ)。結果画面で光を足すと、全ての材質のシェーダーが作り直されて、画面が止まる */
  public prepareLights(scene: THREE.Scene): void {
    if (this.lightGroup) return;
    this.lightGroup = new THREE.Group();
    this.spotlight = new THREE.SpotLight(0xffeedd, 0, 7.0, Math.PI / 2.8, 0.5, 1.1);
    this.spotlight.position.set(0.38, 2.70, 1.95);
    this.spotlight.target.position.set(0.38, 0.90, 1.38);
    this.ambientFill = new THREE.AmbientLight(0xffedd8, 0);
    this.lanternFill = new THREE.PointLight(0xff9944, 0, 10.0);
    this.lanternFill.position.set(0, 2.4, 1.2);
    this.lightGroup.add(this.spotlight, this.spotlight.target, this.ambientFill, this.lanternFill);
    scene.add(this.lightGroup);
  }

  private setLights(on: boolean): void {
    if (this.spotlight) this.spotlight.intensity = on ? ResultsPrizePileManager.SPOT_INTENSITY : 0;
    if (this.ambientFill) this.ambientFill.intensity = on && this.fillLights ? ResultsPrizePileManager.AMBIENT_INTENSITY : 0;
    if (this.lanternFill) this.lanternFill.intensity = on && this.fillLights ? ResultsPrizePileManager.LANTERN_INTENSITY : 0;
  }

  // Get standardized weight in grams for each prize type
  public static getItemWeight(type: string): number {
    switch (type) {
      case 'ufo':
        return 1500;
      case 'daruma':
        return 1000;
      case 'tv':
        return 800;
      case 'treasure':
        return 700;
      case 'robot':
        return 500;
      case 'bear':
        return 400;
      case 'manekineko':
        return 350;
      case 'watergun':
        return 350;
      case 'juicecan':
        return 300;
      case 'balloon':
        return 300;
      case 'sofubi':
        return 300;
      case 'snackbox':
        return 250;
      case 'duck':
        return 250;
      case 'kitsune':
        return 200;
      case 'caramel':
        return 150;
      case 'ramune':
        return 100;
      default:
        return 200;
    }
  }

  // Record an item defeated during gameplay
  public recordDefeated(type: string, name: string) {
    this.defeatedItems.push({ type, name });
  }

  // Get detailed breakdown of what items and how many were acquired
  public getDefeatedBreakdown(): PrizeBreakdownEntry[] {
    const map = new Map<string, PrizeBreakdownEntry>();

    for (const item of this.defeatedItems) {
      const unitWeight = ResultsPrizePileManager.getItemWeight(item.type);
      const existing = map.get(item.type);
      if (existing) {
        existing.count++;
        existing.weight += unitWeight;
      } else {
        map.set(item.type, {
          name: item.name,
          type: item.type,
          count: 1,
          weight: unitWeight,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => b.weight - a.weight);
  }

  // Reset tracking at start of new round
  public reset() {
    this.defeatedItems = [];
    this.isActive = false;
  }

  // Start physics drop simulation on results screen
  public startPile(
    scene: THREE.Scene,
    prizes: PrizeEntity[],
    dynamicTargets: DynamicTargetsManager
  ) {
    this.cleanup(scene);
    this.isActive = true;
    this.timer = 0;
    this.containerGroup = new THREE.Group();
    this.containerGroup.position.x = this.offsetX;
    scene.add(this.containerGroup);

    // 1. Build lightweight Japanese festival display table (商品台 / 赤毛氈) on counter
    this.deskMesh = this.buildDeskTable();
    this.containerGroup.add(this.deskMesh);

    // 2・3. 照明(机を狙う暖色のスポットと、背景を明るく保つ補助光)。足さずに、置いてある照明の強さを上げる
    this.prepareLights(scene);
    if (this.lightGroup) this.lightGroup.position.x = this.offsetX;
    this.setLights(true);

    // Items list: if 0 defeated, give a small cute consolation prize
    const itemsToSpawn: DefeatedPrizeRecord[] =
      this.defeatedItems.length > 0
        ? [...this.defeatedItems]
        : [{ type: 'ramune', name: '参加賞ラムネ' }];

    const total = itemsToSpawn.length;
    // Scale items nicely: large enough to see, compact enough to interact realistically
    const scale = total > 22 ? 0.72 : total > 12 ? 0.80 : 0.88;
    // Stagger drop interval so items drop sequentially
    const stagger = Math.max(0.08, Math.min(0.18, 2.2 / total));

    this.items = [];

    itemsToSpawn.forEach((item, index) => {
      const sourceMesh = this.findSourceMesh(item.type, prizes, dynamicTargets);
      if (!sourceMesh) return;

      const cloned = sourceMesh.clone(true);
      cloned.scale.set(scale, scale, scale);

      // Disable any point lights on cloned UFO
      cloned.traverse((child) => {
        if (child instanceof THREE.PointLight) {
          child.intensity = 0;
        }
      });
      cloned.visible = false;
      this.containerGroup.add(cloned);

      const props = this.getItemPhysicsProps(item.type, scale);

      // Centered drop spawn position directly above the desk table
      const spawnX = this.DESK_CENTER_X + (Math.random() - 0.5) * (this.DESK_WIDTH * 0.48);
      const spawnZ = 1.36 + (Math.random() - 0.5) * 0.28;
      const spawnY = 2.45 + (index % 4) * 0.09 + Math.random() * 0.12;
      const startPos = new THREE.Vector3(spawnX, spawnY, spawnZ);

      cloned.position.copy(startPos);

      const rot = new THREE.Euler(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );
      cloned.rotation.copy(rot);

      const angVel = new THREE.Vector3(
        (Math.random() - 0.5) * 3.5,
        (Math.random() - 0.5) * 4.5,
        (Math.random() - 0.5) * 3.5
      );

      this.items.push({
        mesh: cloned,
        pos: startPos,
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 0.20,
          -1.8,
          (Math.random() - 0.5) * 0.20
        ),
        rot,
        angVel,
        radius: props.radius,
        mass: props.mass,
        restitution: props.restitution,
        spawnDelay: 0.22 + index * stagger,
        hasSpawned: false,
        hasLandedOnDesk: false,
        hasFallenOffDesk: false,
      });
    });
  }

  // Find corresponding mesh template to clone
  private findSourceMesh(
    type: string,
    prizes: PrizeEntity[],
    dynamicTargets: DynamicTargetsManager
  ): THREE.Group | null {
    if (type === 'ufo') return dynamicTargets.ufo.mesh;
    if (type === 'duck') return dynamicTargets.ducks[0]?.mesh || null;
    if (type === 'balloon') return dynamicTargets.balloons[0]?.mesh || null;

    const prize = prizes.find((p) => p.config.type === type);
    if (prize) return prize.mesh;
    return prizes[0]?.mesh || null;
  }

  // Get physical collision radius, mass, and restitution for prize types
  private getItemPhysicsProps(type: string, scale: number) {
    switch (type) {
      case 'daruma':
        return { radius: 0.120 * scale, mass: 3.0, restitution: 0.22 };
      case 'tv':
        return { radius: 0.135 * scale, mass: 2.5, restitution: 0.20 };
      case 'treasure':
        return { radius: 0.120 * scale, mass: 2.4, restitution: 0.22 };
      case 'manekineko':
        return { radius: 0.105 * scale, mass: 1.6, restitution: 0.30 };
      case 'bear':
        return { radius: 0.105 * scale, mass: 1.5, restitution: 0.26 };
      case 'ramune':
        return { radius: 0.070 * scale, mass: 0.8, restitution: 0.38 };
      case 'sofubi':
        return { radius: 0.080 * scale, mass: 0.7, restitution: 0.42 };
      case 'kitsune':
        return { radius: 0.080 * scale, mass: 0.6, restitution: 0.32 };
      case 'duck':
        return { radius: 0.085 * scale, mass: 0.75, restitution: 0.36 };
      case 'balloon':
        return { radius: 0.110 * scale, mass: 0.35, restitution: 0.58 };
      case 'ufo':
        return { radius: 0.130 * scale, mass: 1.9, restitution: 0.28 };
      default:
        return { radius: 0.095 * scale, mass: 1.0, restitution: 0.30 };
    }
  }

  // Build lightweight static wooden display desk (漆塗り商品台 / 赤毛氈)
  // Low rendering cost: 100% static low-poly geometry, zero canvas re-renders
  private buildDeskTable(): THREE.Group {
    const group = new THREE.Group();

    const deskDepth = this.DESK_FRONT_Z - this.DESK_BACK_Z; // 0.555m
    const deskCenterZ = (this.DESK_FRONT_Z + this.DESK_BACK_Z) * 0.5; // 1.3975m

    // Table top surface (Red festival felt mat / lacquer finish)
    const topGeo = new THREE.BoxGeometry(this.DESK_WIDTH, 0.02, deskDepth);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x821c1a,
      roughness: 0.55,
      metalness: 0.10,
    });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(this.DESK_CENTER_X, this.DESK_SURFACE_Y - 0.01, deskCenterZ);
    topMesh.receiveShadow = true;
    topMesh.castShadow = true;
    group.add(topMesh);

    // Dark polished wood material for rims
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x1f140e,
      roughness: 0.5,
      metalness: 0.1,
    });

    const rimHeight = 0.035;
    const rimThickness = 0.020;

    // Back rim (prevents items from rolling back into the stall)
    const backRimGeo = new THREE.BoxGeometry(this.DESK_WIDTH, rimHeight, rimThickness);
    const backRim = new THREE.Mesh(backRimGeo, rimMat);
    backRim.position.set(this.DESK_CENTER_X, this.DESK_SURFACE_Y + rimHeight * 0.5, this.DESK_BACK_Z);
    group.add(backRim);

    // Left rim (prevents items from rolling into UI card)
    const sideRimGeo = new THREE.BoxGeometry(rimThickness, rimHeight, deskDepth);
    const leftRim = new THREE.Mesh(sideRimGeo, rimMat);
    leftRim.position.set(this.DESK_CENTER_X - this.DESK_WIDTH * 0.5, this.DESK_SURFACE_Y + rimHeight * 0.5, deskCenterZ);

    // Right rim
    const rightRim = new THREE.Mesh(sideRimGeo, rimMat);
    rightRim.position.set(this.DESK_CENTER_X + this.DESK_WIDTH * 0.5, this.DESK_SURFACE_Y + rimHeight * 0.5, deskCenterZ);

    group.add(leftRim, rightRim);

    // Front low spill bevel (allows items to naturally tumble over when crowded)
    const frontLipGeo = new THREE.BoxGeometry(this.DESK_WIDTH, 0.010, 0.016);
    const frontLipMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, // Subtle gold edge trim
      roughness: 0.35,
      metalness: 0.70,
    });
    const frontLip = new THREE.Mesh(frontLipGeo, frontLipMat);
    frontLip.position.set(this.DESK_CENTER_X, this.DESK_SURFACE_Y + 0.005, this.DESK_FRONT_Z);
    group.add(frontLip);

    return group;
  }

  // Spawn festive sparkles upon landing
  private spawnImpactSparkles(pos: THREE.Vector3) {
    for (let i = 0; i < 6; i++) {
      const mat = this.sparkleMats[Math.floor(Math.random() * this.sparkleMats.length)];
      const mesh = new THREE.Mesh(this.sparkleGeo, mat);
      mesh.position.copy(pos);
      mesh.position.x += (Math.random() - 0.5) * 0.06;
      mesh.position.z += (Math.random() - 0.5) * 0.06;

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.6,
        Math.random() * 1.8 + 0.6,
        (Math.random() - 0.5) * 1.6
      );

      this.containerGroup.add(mesh);
      this.sparkles.push({
        mesh,
        vel,
        life: 0,
        maxLife: 0.40 + Math.random() * 0.25,
      });
    }
  }

  // Step physics simulation: gravity, desk collisions, inter-item collisions, and off-screen despawn
  public update(dt: number, camera?: THREE.PerspectiveCamera) {
    if (!this.isActive) return;
    this.timer += dt;

    // Run multiple sub-steps per frame for stable, jitter-free rigid body physics
    const SUBSTEPS = 4;
    const subDt = dt / SUBSTEPS;

    const deskMinX = this.DESK_CENTER_X - this.DESK_WIDTH * 0.5;
    const deskMaxX = this.DESK_CENTER_X + this.DESK_WIDTH * 0.5;
    const deskMinZ = this.DESK_BACK_Z;
    const deskMaxZ = this.DESK_FRONT_Z;

    for (let step = 0; step < SUBSTEPS; step++) {
      // 1. Update each item
      for (const item of this.items) {
        if (item.isDespawned) continue;

        if (!item.hasSpawned) {
          if (this.timer >= item.spawnDelay) {
            item.hasSpawned = true;
            item.mesh.visible = true;
          } else {
            continue;
          }
        }

        // Apply Gravity
        item.vel.y -= 11.5 * subDt;

        // Air damping
        item.vel.x *= Math.max(0, 1.0 - 0.30 * subDt);
        item.vel.z *= Math.max(0, 1.0 - 0.30 * subDt);
        item.angVel.multiplyScalar(Math.max(0, 1.0 - 1.1 * subDt));

        // Position & Rotation Integration
        item.pos.addScaledVector(item.vel, subDt);
        item.rot.x += item.angVel.x * subDt;
        item.rot.y += item.angVel.y * subDt;
        item.rot.z += item.angVel.z * subDt;

        // --- COLLISION: DESK PLATFORM SURFACE & RIMS ---
        const isOverDesk =
          item.pos.x >= deskMinX &&
          item.pos.x <= deskMaxX &&
          item.pos.z >= deskMinZ &&
          item.pos.z <= deskMaxZ;

        if (isOverDesk) {
          const deskFloor = this.DESK_SURFACE_Y + item.radius;

          // Rear and side wooden rim boundaries (keep items channeled towards front spill)
          if (item.pos.y < this.DESK_SURFACE_Y + 0.04) {
            if (item.pos.z < deskMinZ + item.radius) {
              item.pos.z = deskMinZ + item.radius;
              if (item.vel.z < 0) item.vel.z = -item.vel.z * 0.35;
            }
            if (item.pos.x < deskMinX + item.radius) {
              item.pos.x = deskMinX + item.radius;
              if (item.vel.x < 0) item.vel.x = -item.vel.x * 0.35;
            }
            if (item.pos.x > deskMaxX - item.radius) {
              item.pos.x = deskMaxX - item.radius;
              if (item.vel.x > 0) item.vel.x = -item.vel.x * 0.35;
            }
          }

          if (item.pos.y <= deskFloor) {
            item.pos.y = deskFloor;

            if (item.vel.y < -0.2) {
              if (!item.hasLandedOnDesk) {
                item.hasLandedOnDesk = true;
                this.spawnImpactSparkles(item.pos);
              }
              sounds.playPrizePileDrop(0.95);
              item.vel.y = -item.vel.y * item.restitution;
            } else {
              item.vel.y = 0;
            }

            // Desk surface friction & rolling
            item.vel.x *= Math.max(0, 1.0 - 4.5 * subDt);
            item.vel.z *= Math.max(0, 1.0 - 4.5 * subDt);
            item.angVel.z = -item.vel.x / item.radius * 0.7;
            item.angVel.x = item.vel.z / item.radius * 0.7;

            // Rest stabilization
            if (
              Math.abs(item.vel.y) < 0.04 &&
              Math.abs(item.vel.x) < 0.05 &&
              Math.abs(item.vel.z) < 0.05
            ) {
              item.vel.set(0, 0, 0);
              item.angVel.multiplyScalar(0.85);
            }
          }
        } else {
          // --- ITEM IS OUTSIDE DESK BOUNDARIES (OVERFLOW / FALLEN OFF) ---

          // Spilled over the front lip: apply forward roll and tip-over momentum
          if (item.pos.z > this.DESK_FRONT_Z) {
            if (
              item.pos.y < this.DESK_SURFACE_Y + item.radius + 0.05 &&
              !item.hasFallenOffDesk
            ) {
              item.hasFallenOffDesk = true;
              item.vel.z += 0.32;
              item.angVel.x += 4.5;
            }
          }

          // Despawn check: as soon as item exits camera field of view, despawn immediately
          let isOutOfSight = false;
          if (camera) {
            this.tempProjVec.copy(item.pos);
            this.tempProjVec.x += this.offsetX;                    // 山の位置のずれを足して、画面の外に出たかを見る
            this.tempProjVec.project(camera);
            // In normalized device coordinates:
            // y < -1.10 is below the bottom screen cutoff
            // |x| > 1.25 is beyond the left/right screen edges
            // z > 1.0 is behind camera / far plane
            if (
              this.tempProjVec.y < -1.10 ||
              Math.abs(this.tempProjVec.x) > 1.25 ||
              this.tempProjVec.z > 1.0
            ) {
              isOutOfSight = true;
            }
          }

          // Failsafe world bounds below desk level and outside view frustum
          if (
            item.pos.y < 0.58 ||
            item.pos.z > 2.25 ||
            item.pos.x < -0.30 ||
            item.pos.x > 1.15
          ) {
            isOutOfSight = true;
          }

          if (isOutOfSight && item.pos.y < this.DESK_SURFACE_Y + item.radius) {
            item.isDespawned = true;
            item.mesh.visible = false;
            this.containerGroup.remove(item.mesh);
          }
        }
      }

      // 2. Inter-item collisions (crowding, bumping, pushing each other off the desk)
      const activeItems = this.items.filter((it) => it.hasSpawned && !it.isDespawned);
      const n = activeItems.length;

      for (let i = 0; i < n; i++) {
        const itemA = activeItems[i];
        for (let j = i + 1; j < n; j++) {
          const itemB = activeItems[j];

          const dx = itemA.pos.x - itemB.pos.x;
          const dy = itemA.pos.y - itemB.pos.y;
          const dz = itemA.pos.z - itemB.pos.z;
          const distSq = dx * dx + dy * dy + dz * dz;
          const minDist = itemA.radius + itemB.radius;

          if (distSq < minDist * minDist && distSq > 0.00001) {
            const dist = Math.sqrt(distSq);
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            // Push apart proportionally by mass
            const totalMass = itemA.mass + itemB.mass;
            const ratioA = itemB.mass / totalMass;
            const ratioB = itemA.mass / totalMass;

            itemA.pos.x += nx * overlap * ratioA;
            itemA.pos.y += ny * overlap * ratioA;
            itemA.pos.z += nz * overlap * ratioA;

            itemB.pos.x -= nx * overlap * ratioB;
            itemB.pos.y -= ny * overlap * ratioB;
            itemB.pos.z -= nz * overlap * ratioB;

            // Velocity impulse
            const rvx = itemA.vel.x - itemB.vel.x;
            const rvy = itemA.vel.y - itemB.vel.y;
            const rvz = itemA.vel.z - itemB.vel.z;
            const velNormal = rvx * nx + rvy * ny + rvz * nz;

            if (velNormal < 0) {
              const rest = Math.min(itemA.restitution, itemB.restitution);
              const imp = -(1 + rest) * velNormal / (1 / itemA.mass + 1 / itemB.mass);

              itemA.vel.x += (imp / itemA.mass) * nx;
              itemA.vel.y += (imp / itemA.mass) * ny;
              itemA.vel.z += (imp / itemA.mass) * nz;

              itemB.vel.x -= (imp / itemB.mass) * nx;
              itemB.vel.y -= (imp / itemB.mass) * ny;
              itemB.vel.z -= (imp / itemB.mass) * nz;

              // Tangential friction
              const friction = 0.22;
              const tx = rvx - velNormal * nx;
              const ty = rvy - velNormal * ny;
              const tz = rvz - velNormal * nz;
              itemA.vel.x -= tx * friction * subDt;
              itemA.vel.y -= ty * friction * subDt;
              itemA.vel.z -= tz * friction * subDt;
              itemB.vel.x += tx * friction * subDt;
              itemB.vel.y += ty * friction * subDt;
              itemB.vel.z += tz * friction * subDt;

              // Angular spin kick
              itemA.angVel.x += (ny * rvz - nz * rvy) * 0.7;
              itemA.angVel.z += (nx * rvy - ny * rvx) * 0.7;
              itemB.angVel.x -= (ny * rvz - nz * rvy) * 0.7;
              itemB.angVel.z -= (nx * rvy - ny * rvx) * 0.7;

              if (Math.abs(velNormal) > 0.45) {
                sounds.playPrizePileDrop(1.05);
              }
            }
          }
        }
      }
    }

    // Purge despawned items from the physics simulation
    if (this.items.some((it) => it.isDespawned)) {
      this.items = this.items.filter((it) => !it.isDespawned);
    }

    // Sync 3D transforms
    for (const item of this.items) {
      if (item.hasSpawned && !item.isDespawned) {
        item.mesh.position.copy(item.pos);
        item.mesh.rotation.copy(item.rot);
      }
    }

    // Update celebration sparkles
    for (let i = this.sparkles.length - 1; i >= 0; i--) {
      const p = this.sparkles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.containerGroup.remove(p.mesh); // 形と材質は全員で共有しているので、ここで dispose しない(GPU のデータが毎回作り直しになる)
        this.sparkles.splice(i, 1);
      } else {
        p.vel.y -= 7.0 * dt;
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += 12 * dt;
        p.mesh.rotation.y += 10 * dt;
        const s = 1.0 - p.life / p.maxLife;
        p.mesh.scale.set(s, s, s);
      }
    }
  }

  // Cleanup all 3D meshes and lights when leaving results screen
  public cleanup(scene: THREE.Scene) {
    this.isActive = false;

    for (const p of this.sparkles) {
      this.containerGroup.remove(p.mesh);
    }
    this.sparkles = [];
    this.setLights(false);

    this.items = [];

    if (this.containerGroup.parent) {
      scene.remove(this.containerGroup);
    }
    this.containerGroup.clear();
    this.deskMesh = null;
  }
}
