import * as THREE from 'three';
import { PrizeEntity } from './prizes';
import { DynamicTargetsManager } from './dynamic_targets';
import { sounds } from './audio';

export type BulletType = 'normal' | 'explosive';

export interface CorkBullet {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  prevPos: THREE.Vector3;
  velocity: THREE.Vector3;
  isAlive: boolean;
  hasHit: boolean;
  age: number;
  type: BulletType;
}

export interface ExplosionEffect {
  pos: THREE.Vector3;
  shockwaveMesh: THREE.Mesh;
  sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[];
  life: number;
  maxLife: number;
}

export class CorkSystem {
  /** 当たり判定で毎フレーム作り直さないための使い回し(弾ごと・的ごとに new しない) */
  private readonly segmentRay = new THREE.Ray();
  private readonly hitScratch = new THREE.Vector3();
  private scene: THREE.Scene;
  public bullets: CorkBullet[] = [];
  private normalCorkGeo: THREE.CylinderGeometry;
  private normalCorkMat: THREE.MeshStandardMaterial;

  private explosiveCorkGeo: THREE.CylinderGeometry;
  private explosiveCorkMat: THREE.MeshStandardMaterial;

  public explosions: ExplosionEffect[] = [];
  private shockwaveGeo: THREE.SphereGeometry;
  private sparkGeo: THREE.BoxGeometry;

  private chips: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];
  private chipGeo: THREE.BoxGeometry;
  private chipMat: THREE.MeshBasicMaterial;

  readonly NORMAL_MASS = 0.045;
  readonly EXPLOSIVE_MASS = 0.12;
  readonly CORK_SPEED = 36.0;
  /**
   * オンライン対戦: 空の高い所を飛ぶ共有の的を撃てるよう、屋台の奥の壁(z=-1.38)より上を飛ぶコルクは壁に当たらず抜けていく。
   * オフラインでは false(従来どおり、奥の壁に当たる)。
   */
  public skyOpen = false;
  private static readonly WALL_TOP = 2.7;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.normalCorkGeo = new THREE.CylinderGeometry(0.016, 0.013, 0.042, 12);
    this.normalCorkMat = new THREE.MeshStandardMaterial({
      color: 0xb58451,
      roughness: 0.9,
      metalness: 0.05,
    });

    this.explosiveCorkGeo = new THREE.CylinderGeometry(0.022, 0.018, 0.055, 12);
    this.explosiveCorkMat = new THREE.MeshStandardMaterial({
      color: 0xd91414,
      emissive: 0xff3838,
      emissiveIntensity: 0.85,
      metalness: 0.4,
      roughness: 0.3,
    });

    this.shockwaveGeo = new THREE.SphereGeometry(1, 16, 16);
    this.sparkGeo = new THREE.BoxGeometry(0.03, 0.03, 0.03);

    this.chipGeo = new THREE.BoxGeometry(0.014, 0.014, 0.014);
    this.chipMat = new THREE.MeshBasicMaterial({ color: 0xdeb887 });
  }

  public spawn(origin: THREE.Vector3, direction: THREE.Vector3, type: BulletType = 'normal'): CorkBullet {
    const isExplosive = type === 'explosive';
    const geo = isExplosive ? this.explosiveCorkGeo : this.normalCorkGeo;
    const mat = isExplosive ? this.explosiveCorkMat : this.normalCorkMat;

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());
    this.scene.add(mesh);

    // 爆弾コルクは発光マテリアルで光って見えるため、飛行中の点光源は付けない。
    // 光源の数が変わるたびに全マテリアルのシェーダー再コンパイルが走り、発射のたびに引っかかるため

    const bullet: CorkBullet = {
      mesh,
      pos: origin.clone(),
      prevPos: origin.clone(),
      velocity: direction.clone().normalize().multiplyScalar(this.CORK_SPEED),
      isAlive: true,
      hasHit: false,
      age: 0,
      type,
    };

    this.bullets.push(bullet);
    return bullet;
  }

  public triggerExplosion(
    center: THREE.Vector3,
    prizes: PrizeEntity[],
    dynamicTargets?: DynamicTargetsManager,
    onBlastHit?: (name: string, points: number, pos: THREE.Vector3) => void
  ) {
    sounds.playExplosion();

    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xff7700,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const shockMesh = new THREE.Mesh(this.shockwaveGeo, shockMat);
    shockMesh.position.copy(center);
    shockMesh.scale.set(0.1, 0.1, 0.1);
    this.scene.add(shockMesh);

    const sparks: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];
    const sparkColors = [0xffcc00, 0xd91414, 0xff4757, 0xffa502, 0xffffff];

    for (let i = 0; i < 32; i++) {
      const sparkMat = new THREE.MeshBasicMaterial({
        color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
        blending: THREE.AdditiveBlending,
      });
      const sMesh = new THREE.Mesh(this.sparkGeo, sparkMat);
      sMesh.position.copy(center);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 6.0,
        Math.random() * 5.0 + 0.5,
        (Math.random() - 0.5) * 6.0
      );

      this.scene.add(sMesh);
      sparks.push({
        mesh: sMesh,
        vel,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.35,
      });
    }

    this.explosions.push({
      pos: center.clone(),
      shockwaveMesh: shockMesh,
      sparks,
      life: 0,
      maxLife: 0.5,
    });

    const BLAST_RADIUS = 1.1;
    const BLAST_POWER = 7.5;

    // Shelf prizes AOE
    for (const prize of prizes) {
      if (prize.isDefeated) continue;
      const d = prize.currentPos.distanceTo(center);
      if (d <= BLAST_RADIUS) {
        prize.applyExplosionImpulse(center, BLAST_RADIUS, BLAST_POWER);
      }
    }

    // Dynamic targets AOE
    if (dynamicTargets) {
      // Balloons
      for (const b of dynamicTargets.balloons) {
        if (!b.isPopped && b.pos.distanceTo(center) <= BLAST_RADIUS) {
          const hitPos = b.pop();
          dynamicTargets.spawnConfetti(hitPos);
          if (onBlastHit) onBlastHit('お祭り風船', b.points, hitPos);
        }
      }
      // Ducks
      for (const d of dynamicTargets.ducks) {
        if (!d.isDown && d.pos.distanceTo(center) <= BLAST_RADIUS) {
          const hitPos = d.hit();
          dynamicTargets.spawnConfetti(hitPos);
          if (onBlastHit) onBlastHit('射的アヒル', d.points, hitPos);
        }
      }
      // UFO
      const ufo = dynamicTargets.ufo;
      const ufoLive = ufo.external ? ufo.externalActive : !ufo.isHit;       // 共有の的は、出現中だけ爆風に当たる
      if (ufoLive && ufo.pos.distanceTo(center) <= BLAST_RADIUS) {
        const hitPos = dynamicTargets.ufo.hit();
        dynamicTargets.spawnConfetti(hitPos);
        if (onBlastHit) onBlastHit('黄金UFO', dynamicTargets.ufo.points, hitPos);
      }
    }
  }

  private spawnImpactChips(point: THREE.Vector3, normal: THREE.Vector3) {
    for (let i = 0; i < 7; i++) {
      const chipMesh = new THREE.Mesh(this.chipGeo, this.chipMat);
      chipMesh.position.copy(point);

      const vel = normal.clone().multiplyScalar(1.5 + Math.random() * 2.0);
      vel.x += (Math.random() - 0.5) * 2.0;
      vel.y += Math.random() * 1.5;
      vel.z += (Math.random() - 0.5) * 2.0;

      this.scene.add(chipMesh);
      this.chips.push({
        mesh: chipMesh,
        vel,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.25,
      });
    }
  }

  // Collision testing against both shelf prizes and moving/flying targets
  public update(
    dt: number,
    prizes: PrizeEntity[],
    dynamicTargets: DynamicTargetsManager,
    onHit?: (targetName: string, points: number, hitPoint: THREE.Vector3, isExplosive: boolean) => void
  ) {
    // 1. Update active cork bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.age += dt;

      if (!b.isAlive || b.age > 2.5) {
        // 形状は全コルクで共有しているので dispose しない(破棄すると次の発射でGPUへ再転送になる)
        this.scene.remove(b.mesh);
        this.bullets.splice(i, 1);
        continue;
      }

      b.prevPos.copy(b.pos);
      b.velocity.y -= 7.0 * dt;
      b.pos.addScaledVector(b.velocity, dt);
      b.mesh.position.copy(b.pos);

      if (b.hasHit) {
        b.mesh.rotation.x += 12 * dt;
        b.mesh.rotation.z += 8 * dt;
        if (b.pos.y < 0.85) {
          b.pos.y = 0.85;
          b.velocity.set(0, 0, 0);
        }
        continue;
      }

      const segmentRay = this.segmentRay;
      segmentRay.origin.copy(b.prevPos);
      segmentRay.direction.copy(b.pos).sub(b.prevPos).normalize();
      const segmentDist = b.pos.distanceTo(b.prevPos);

      let closestHitPoint: THREE.Vector3 | null = null;
      let closestPrize: PrizeEntity | null = null;
      let closestDynamic: { type: 'balloon' | 'duck' | 'ufo'; obj: any } | null = null;
      let minDist = segmentDist;

      // Check Shelf Prizes
      for (const prize of prizes) {
        if (prize.isDefeated) continue;
        const box = prize.getBoundingBox();
        const hitTarget = this.hitScratch;
        if (segmentRay.intersectBox(box, hitTarget)) {
          const d = b.prevPos.distanceTo(hitTarget);
          if (d < minDist) {
            minDist = d;
            closestHitPoint = hitTarget.clone();
            closestPrize = prize;
            closestDynamic = null;
          }
        }
      }

      // Check Floating Balloons
      for (const balloon of dynamicTargets.balloons) {
        if (balloon.isPopped) continue;
        const box = balloon.getBoundingBox();
        const hitTarget = this.hitScratch;
        if (segmentRay.intersectBox(box, hitTarget)) {
          const d = b.prevPos.distanceTo(hitTarget);
          if (d < minDist) {
            minDist = d;
            closestHitPoint = hitTarget.clone();
            closestPrize = null;
            closestDynamic = { type: 'balloon', obj: balloon };
          }
        }
      }

      // Check Moving Ducks
      for (const duck of dynamicTargets.ducks) {
        if (duck.isDown) continue;
        const box = duck.getBoundingBox();
        const hitTarget = this.hitScratch;
        if (segmentRay.intersectBox(box, hitTarget)) {
          const d = b.prevPos.distanceTo(hitTarget);
          if (d < minDist) {
            minDist = d;
            closestHitPoint = hitTarget.clone();
            closestPrize = null;
            closestDynamic = { type: 'duck', obj: duck };
          }
        }
      }

      // Check Flying UFO
      if (!dynamicTargets.ufo.isHit) {
        const box = dynamicTargets.ufo.getBoundingBox();
        const hitTarget = this.hitScratch;
        if (segmentRay.intersectBox(box, hitTarget)) {
          const d = b.prevPos.distanceTo(hitTarget);
          if (d < minDist) {
            minDist = d;
            closestHitPoint = hitTarget.clone();
            closestPrize = null;
            closestDynamic = { type: 'ufo', obj: dynamicTargets.ufo };
          }
        }
      }

      // Handle Collision
      if (closestHitPoint) {
        b.hasHit = true;
        b.pos.copy(closestHitPoint);
        b.mesh.position.copy(b.pos);

        if (b.type === 'explosive') {
          // Explode!
          this.triggerExplosion(closestHitPoint, prizes, dynamicTargets, (name, pts, pos) => {
            if (onHit) onHit(name, pts, pos, true);
          });
          this.scene.remove(b.mesh);
          b.isAlive = false;

          if (closestPrize && onHit) {
            onHit(closestPrize.config.name, 0, closestHitPoint, true);
          }
        } else {
          // Normal bullet hit
          if (closestPrize) {
            closestPrize.applyHitImpulse(closestHitPoint, b.velocity, this.NORMAL_MASS);
            this.spawnImpactChips(closestHitPoint, new THREE.Vector3(0, 0, 1));
            if (onHit) onHit(closestPrize.config.name, 0, closestHitPoint, false);
          } else if (closestDynamic) {
            if (closestDynamic.type === 'balloon') {
              const hitPos = closestDynamic.obj.pop();
              dynamicTargets.spawnConfetti(hitPos);
              if (onHit) onHit('お祭り風船', closestDynamic.obj.points, hitPos, false);
            } else if (closestDynamic.type === 'duck') {
              const hitPos = closestDynamic.obj.hit();
              dynamicTargets.spawnConfetti(hitPos);
              if (onHit) onHit('射的アヒル', closestDynamic.obj.points, hitPos, false);
            } else if (closestDynamic.type === 'ufo') {
              const hitPos = closestDynamic.obj.hit();
              dynamicTargets.spawnConfetti(hitPos);
              if (onHit) onHit('黄金UFO', closestDynamic.obj.points, hitPos, false);
            }
          }

          b.velocity.z = Math.abs(b.velocity.z) * 0.18;
          b.velocity.y = 1.2 + Math.random() * 0.8;
          b.velocity.x = (Math.random() - 0.5) * 2.0;
        }
      } else if (b.pos.z < -1.38 && !(this.skyOpen && b.pos.y > CorkSystem.WALL_TOP)) {
        // Wall hit
        b.hasHit = true;
        b.pos.z = -1.38;

        if (b.type === 'explosive') {
          this.triggerExplosion(b.pos, prizes, dynamicTargets, (name, pts, pos) => {
            if (onHit) onHit(name, pts, pos, true);
          });
          this.scene.remove(b.mesh);
          b.isAlive = false;
        } else {
          b.velocity.z = 1.0;
          b.velocity.y = 0.5;
          this.spawnImpactChips(b.pos, new THREE.Vector3(0, 0, 1));
        }
      }
    }

    // 2. Update explosions
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.life += dt;

      if (exp.life >= exp.maxLife) {
        this.scene.remove(exp.shockwaveMesh);
        (exp.shockwaveMesh.material as THREE.Material).dispose();
        for (const s of exp.sparks) {
          this.scene.remove(s.mesh);
          (s.mesh.material as THREE.Material).dispose();
        }
        this.explosions.splice(i, 1);
      } else {
        const progress = exp.life / exp.maxLife;
        const scale = 0.1 + progress * 1.25;
        exp.shockwaveMesh.scale.set(scale, scale, scale);
        (exp.shockwaveMesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1.0 - progress);

        for (const s of exp.sparks) {
          s.life += dt;
          s.vel.y -= 9.8 * dt;
          s.mesh.position.addScaledVector(s.vel, dt);
          s.mesh.rotation.x += 10 * dt;
          s.mesh.rotation.y += 10 * dt;
          const sProgress = s.life / s.maxLife;
          s.mesh.scale.setScalar(Math.max(0.01, 1.0 - sProgress));
        }
      }
    }

    // 3. Update debris chips
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const chip = this.chips[i];
      chip.life += dt;
      if (chip.life >= chip.maxLife) {
        this.scene.remove(chip.mesh);
        this.chips.splice(i, 1);
      } else {
        chip.vel.y -= 9.8 * dt;
        chip.mesh.position.addScaledVector(chip.vel, dt);
        const progress = chip.life / chip.maxLife;
        chip.mesh.scale.setScalar(1.0 - progress * 0.5);
      }
    }
  }

  public reset() {
    for (const b of this.bullets) {
      this.scene.remove(b.mesh);
    }
    this.bullets = [];

    for (const e of this.explosions) {
      this.scene.remove(e.shockwaveMesh);
      (e.shockwaveMesh.material as THREE.Material).dispose();
      for (const s of e.sparks) {
        this.scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
      }
    }
    this.explosions = [];

    for (const c of this.chips) {
      this.scene.remove(c.mesh);
    }
    this.chips = [];
  }
}
