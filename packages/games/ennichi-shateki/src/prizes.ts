import * as THREE from 'three';
import {
  createDarumaTexture,
  createRobotTexture,
  createRamuneLabelTexture,
  createCaramelBoxTexture,
  createManekiNekoTexture,
  createRetroTVTexture,
  createTreasureBoxTexture,
  createJuiceCanTexture,
} from './textures';
import { ShelfInfo } from './stall';
import { sounds } from './audio';

export type PrizeType =
  | 'daruma'
  | 'manekineko'
  | 'treasure'
  | 'tv'
  | 'robot'
  | 'watergun'
  | 'juicecan'
  | 'ramune'
  | 'caramel'
  | 'snackbox';

export interface PrizeConfig {
  type: PrizeType;
  name: string;
  points: number;
  shelfIndex: number;
  slotId: number;
  shelfOffsetRatio: number;
  mass: number;
  baseWidth: number;
  baseDepth: number;
  height: number;
  comY: number;
  tippingAngleDeg: number;
  isMetal?: boolean;
}

export class PrizeEntity {
  public mesh: THREE.Group;
  public config: PrizeConfig;
  public shelf: ShelfInfo;

  public basePos: THREE.Vector3;
  public currentPos: THREE.Vector3;
  public velocity: THREE.Vector3 = new THREE.Vector3();
  public angularVelocity: THREE.Vector3 = new THREE.Vector3();

  public pitchAngle: number = 0;
  public pitchVelocity: number = 0;
  public rollAngle: number = 0;
  public rollVelocity: number = 0;

  public isFalling: boolean = false;
  public isDefeated: boolean = false;
  public isGrounded: boolean = false;
  public wobbleSoundTimer: number = 0;
  public criticalPitch: number;

  public isSpawning: boolean = false;
  public spawnTimer: number = 0;

  constructor(config: PrizeConfig, shelf: ShelfInfo) {
    this.config = config;
    this.shelf = shelf;

    const xSpan = (shelf.xMax - shelf.xMin) * 0.92;
    const x = shelf.xMin + (shelf.xMax - shelf.xMin) * 0.5 + config.shelfOffsetRatio * (xSpan * 0.5);
    const y = shelf.ySurface;
    const z = shelf.zCenter + shelf.depth * 0.12;

    this.basePos = new THREE.Vector3(x, y, z);
    this.currentPos = this.basePos.clone();
    this.criticalPitch = (config.tippingAngleDeg * Math.PI) / 180;

    this.mesh = this.buildMesh();
    this.updateMeshTransform();
  }

  /** 棚の中の並び位置(-1〜+1)を変える。開始のたびに景品の配置を入れ替えるために使う */
  public setShelfOffsetRatio(ratio: number) {
    this.config.shelfOffsetRatio = ratio;
    const xSpan = (this.shelf.xMax - this.shelf.xMin) * 0.92;
    this.basePos.x = this.shelf.xMin + (this.shelf.xMax - this.shelf.xMin) * 0.5 + ratio * (xSpan * 0.5);
  }

  public triggerSpawnEffect() {
    this.isSpawning = true;
    this.spawnTimer = 0;
    this.currentPos.copy(this.basePos);
    this.currentPos.y += 0.90; // Drop gently from above
    // Slow descent speed: rare top-shelf items descend at 0.38 m/s, lower shelves at 0.60 m/s
    const descentSpeed = this.config.shelfIndex === 2 ? -0.38 : -0.60;
    this.velocity.set(0, descentSpeed, 0);
    this.pitchAngle = 0;
    this.pitchVelocity = 0;
    this.rollAngle = 0;
    this.rollVelocity = 0;
    this.isFalling = false;
    this.isDefeated = false;
    this.isGrounded = false;
    this.mesh.visible = true;
  }

  private buildMesh(): THREE.Group {
    const group = new THREE.Group();

    switch (this.config.type) {
      case 'daruma': {
        const darumaTex = createDarumaTexture();
        const goldMat = new THREE.MeshStandardMaterial({
          map: darumaTex,
          metalness: 0.85,
          roughness: 0.22,
        });

        const lowerGeo = new THREE.SphereGeometry(0.2, 32, 24);
        const lower = new THREE.Mesh(lowerGeo, goldMat);
        lower.scale.set(1.08, 0.92, 1.05);
        lower.position.y = 0.18;
        lower.castShadow = true;
        group.add(lower);

        const upperGeo = new THREE.SphereGeometry(0.145, 32, 24);
        const upper = new THREE.Mesh(upperGeo, goldMat);
        upper.position.y = 0.33;
        upper.castShadow = true;
        group.add(upper);

        const baseRingGeo = new THREE.CylinderGeometry(0.16, 0.17, 0.05, 32);
        const baseRingMat = new THREE.MeshStandardMaterial({
          color: 0x805200,
          roughness: 0.5,
          metalness: 0.7,
        });
        const baseRing = new THREE.Mesh(baseRingGeo, baseRingMat);
        baseRing.position.y = 0.025;
        group.add(baseRing);

        const sashGeo = new THREE.TorusGeometry(0.19, 0.015, 12, 32);
        const sashMat = new THREE.MeshStandardMaterial({ color: 0xd91414, roughness: 0.4 });
        const sash = new THREE.Mesh(sashGeo, sashMat);
        sash.rotation.x = Math.PI / 2;
        sash.position.y = 0.22;
        group.add(sash);
        break;
      }

      case 'treasure': {
        const treasureTex = createTreasureBoxTexture();
        const chestMat = new THREE.MeshStandardMaterial({
          map: treasureTex,
          roughness: 0.4,
          metalness: 0.3,
        });
        const goldMat = new THREE.MeshStandardMaterial({
          color: 0xf1c40f,
          metalness: 0.9,
          roughness: 0.2,
        });

        const chestGeo = new THREE.BoxGeometry(0.24, 0.16, 0.16);
        const chest = new THREE.Mesh(chestGeo, chestMat);
        chest.position.y = 0.08;
        chest.castShadow = true;
        group.add(chest);

        const handleGeo = new THREE.TorusGeometry(0.035, 0.008, 8, 16, Math.PI);
        const leftH = new THREE.Mesh(handleGeo, goldMat);
        leftH.rotation.y = Math.PI / 2;
        leftH.position.set(-0.125, 0.09, 0);
        const rightH = leftH.clone();
        rightH.position.x = 0.125;
        rightH.rotation.y = -Math.PI / 2;
        group.add(leftH, rightH);
        break;
      }

      case 'manekineko': {
        const nekoTex = createManekiNekoTexture();
        const porcelainMat = new THREE.MeshStandardMaterial({
          map: nekoTex,
          roughness: 0.25,
          metalness: 0.1,
        });
        const whiteMat = new THREE.MeshStandardMaterial({ color: 0xfdfbf7, roughness: 0.25 });
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xf1c40f, metalness: 0.85, roughness: 0.2 });
        const redMat = new THREE.MeshStandardMaterial({ color: 0xd91414, roughness: 0.4 });

        const bodyGeo = new THREE.CylinderGeometry(0.09, 0.13, 0.22, 24);
        const body = new THREE.Mesh(bodyGeo, porcelainMat);
        body.position.y = 0.11;
        body.castShadow = true;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(0.11, 24, 24);
        const head = new THREE.Mesh(headGeo, porcelainMat);
        head.position.y = 0.27;
        head.castShadow = true;
        group.add(head);

        const earGeo = new THREE.ConeGeometry(0.035, 0.06, 4);
        const leftEar = new THREE.Mesh(earGeo, redMat);
        leftEar.position.set(-0.065, 0.36, 0);
        leftEar.rotation.z = 0.3;
        const rightEar = leftEar.clone();
        rightEar.position.x = 0.065;
        rightEar.rotation.z = -0.3;
        group.add(leftEar, rightEar);

        const collarGeo = new THREE.TorusGeometry(0.10, 0.012, 12, 24);
        const collar = new THREE.Mesh(collarGeo, redMat);
        collar.rotation.x = Math.PI / 2;
        collar.position.y = 0.21;
        group.add(collar);

        const bellGeo = new THREE.SphereGeometry(0.02, 12, 12);
        const bell = new THREE.Mesh(bellGeo, goldMat);
        bell.position.set(0, 0.19, 0.105);
        group.add(bell);

        const pawGeo = new THREE.CylinderGeometry(0.025, 0.028, 0.12, 12);
        const rightPaw = new THREE.Mesh(pawGeo, whiteMat);
        rightPaw.position.set(0.11, 0.27, 0.04);
        rightPaw.rotation.z = -0.4;
        rightPaw.rotation.x = 0.3;
        group.add(rightPaw);

        const leftPaw = new THREE.Mesh(pawGeo, whiteMat);
        leftPaw.position.set(-0.08, 0.13, 0.06);
        leftPaw.rotation.x = 0.6;
        group.add(leftPaw);

        const coinGeo = new THREE.BoxGeometry(0.08, 0.12, 0.015);
        const coin = new THREE.Mesh(coinGeo, goldMat);
        coin.position.set(-0.06, 0.12, 0.11);
        coin.rotation.y = -0.2;
        group.add(coin);
        break;
      }

      case 'tv': {
        const tvTex = createRetroTVTexture();
        const tvMat = new THREE.MeshStandardMaterial({
          map: tvTex,
          roughness: 0.45,
          metalness: 0.1,
        });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.5 });

        const tvGeo = new THREE.BoxGeometry(0.22, 0.20, 0.18);
        const tv = new THREE.Mesh(tvGeo, tvMat);
        tv.position.y = 0.12;
        tv.castShadow = true;
        group.add(tv);

        const legGeo = new THREE.CylinderGeometry(0.01, 0.008, 0.05, 8);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x2c1d11 });
        const leg1 = new THREE.Mesh(legGeo, legMat);
        leg1.position.set(-0.08, 0.02, 0.06);
        leg1.rotation.z = 0.2;
        const leg2 = leg1.clone();
        leg2.position.x = 0.08;
        leg2.rotation.z = -0.2;
        const leg3 = leg1.clone();
        leg3.position.z = -0.06;
        const leg4 = leg2.clone();
        leg4.position.z = -0.06;
        group.add(leg1, leg2, leg3, leg4);

        const antGeo = new THREE.CylinderGeometry(0.004, 0.004, 0.14, 6);
        const ant1 = new THREE.Mesh(antGeo, darkMat);
        ant1.position.set(-0.04, 0.28, 0);
        ant1.rotation.z = 0.35;
        const ant2 = ant1.clone();
        ant2.position.x = 0.04;
        ant2.rotation.z = -0.35;
        group.add(ant1, ant2);
        break;
      }

      case 'robot': {
        const robotTex = createRobotTexture();
        const robotMat = new THREE.MeshStandardMaterial({ map: robotTex, metalness: 0.7, roughness: 0.35 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0xbdc3c7, metalness: 0.9, roughness: 0.25 });
        const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, metalness: 0.6, roughness: 0.4 });

        const torsoGeo = new THREE.BoxGeometry(0.16, 0.18, 0.12);
        const torso = new THREE.Mesh(torsoGeo, robotMat);
        torso.position.y = 0.19;
        torso.castShadow = true;
        group.add(torso);

        const headGeo = new THREE.BoxGeometry(0.12, 0.11, 0.11);
        const head = new THREE.Mesh(headGeo, metalMat);
        head.position.y = 0.33;
        head.castShadow = true;
        group.add(head);

        const visorGeo = new THREE.BoxGeometry(0.09, 0.03, 0.02);
        const visorMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, emissive: 0xffaa00, emissiveIntensity: 0.4 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 0.34, 0.06);
        group.add(visor);

        const antennaGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8);
        const leftAnt = new THREE.Mesh(antennaGeo, darkMetalMat);
        leftAnt.rotation.z = Math.PI / 2;
        leftAnt.position.set(-0.08, 0.33, 0);
        const rightAnt = leftAnt.clone();
        rightAnt.position.x = 0.08;
        group.add(leftAnt, rightAnt);

        const keyGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.04, 8);
        const topKey = new THREE.Mesh(keyGeo, darkMetalMat);
        topKey.position.set(0, 0.40, 0);
        group.add(topKey);

        const armGeo = new THREE.BoxGeometry(0.04, 0.14, 0.04);
        const leftArm = new THREE.Mesh(armGeo, darkMetalMat);
        leftArm.position.set(-0.11, 0.18, 0);
        const rightArm = leftArm.clone();
        rightArm.position.x = 0.11;
        group.add(leftArm, rightArm);

        const legGeo = new THREE.BoxGeometry(0.05, 0.1, 0.09);
        const leftLeg = new THREE.Mesh(legGeo, metalMat);
        leftLeg.position.set(-0.045, 0.05, 0);
        const rightLeg = leftLeg.clone();
        rightLeg.position.x = 0.045;
        group.add(leftLeg, rightLeg);
        break;
      }

      case 'watergun': {
        const plasticMat = new THREE.MeshStandardMaterial({ color: 0xff4757, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.9 });
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.85 });
        const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });

        const bodyGeo = new THREE.BoxGeometry(0.05, 0.09, 0.28);
        const body = new THREE.Mesh(bodyGeo, plasticMat);
        body.position.set(0, 0.11, 0);
        body.castShadow = true;
        group.add(body);

        const tankGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.22, 16);
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, 0.19, -0.02);
        group.add(tank);

        const nozzleGeo = new THREE.CylinderGeometry(0.015, 0.025, 0.06, 12);
        const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
        nozzle.rotation.x = Math.PI / 2;
        nozzle.position.set(0, 0.11, 0.16);
        group.add(nozzle);

        const gripGeo = new THREE.BoxGeometry(0.04, 0.11, 0.06);
        const grip = new THREE.Mesh(gripGeo, nozzleMat);
        grip.rotation.x = 0.25;
        grip.position.set(0, 0.05, -0.06);
        group.add(grip);
        break;
      }

      case 'juicecan': {
        const canTex = createJuiceCanTexture();
        const canMat = new THREE.MeshStandardMaterial({ map: canTex, roughness: 0.35, metalness: 0.7 });
        const silverMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1, roughness: 0.2, metalness: 0.9 });

        const canGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 24);
        const can = new THREE.Mesh(canGeo, canMat);
        can.position.y = 0.11;
        can.castShadow = true;
        group.add(can);

        const rimGeo = new THREE.CylinderGeometry(0.066, 0.066, 0.015, 24);
        const topRim = new THREE.Mesh(rimGeo, silverMat);
        topRim.position.y = 0.215;
        const botRim = topRim.clone();
        botRim.position.y = 0.008;
        group.add(topRim, botRim);

        const tabGeo = new THREE.BoxGeometry(0.02, 0.005, 0.04);
        const tab = new THREE.Mesh(tabGeo, silverMat);
        tab.position.set(0, 0.225, 0.02);
        group.add(tab);
        break;
      }

      case 'ramune': {
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x70a1ff, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.85 });
        const labelTex = createRamuneLabelTexture();
        const labelMat = new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.5 });
        const capMat = new THREE.MeshStandardMaterial({ color: 0x2ed573, roughness: 0.4 });

        const lowerGeo = new THREE.CylinderGeometry(0.04, 0.045, 0.15, 20);
        const lower = new THREE.Mesh(lowerGeo, glassMat);
        lower.position.y = 0.075;
        lower.castShadow = true;
        group.add(lower);

        const labelGeo = new THREE.CylinderGeometry(0.041, 0.041, 0.08, 20, 1, true, -Math.PI / 2, Math.PI);
        const labelMesh = new THREE.Mesh(labelGeo, labelMat);
        labelMesh.position.y = 0.08;
        group.add(labelMesh);

        const waistGeo = new THREE.CylinderGeometry(0.026, 0.04, 0.05, 20);
        const waist = new THREE.Mesh(waistGeo, glassMat);
        waist.position.y = 0.175;
        group.add(waist);

        const marbleGeo = new THREE.SphereGeometry(0.012, 16, 16);
        const marbleMat = new THREE.MeshStandardMaterial({ color: 0x1e90ff, roughness: 0.05, metalness: 0.5 });
        const marble = new THREE.Mesh(marbleGeo, marbleMat);
        marble.position.set(0, 0.175, 0);
        group.add(marble);

        const neckGeo = new THREE.CylinderGeometry(0.03, 0.026, 0.06, 20);
        const neck = new THREE.Mesh(neckGeo, glassMat);
        neck.position.y = 0.225;
        group.add(neck);

        const capGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.025, 16);
        const cap = new THREE.Mesh(capGeo, capMat);
        cap.position.y = 0.265;
        group.add(cap);
        break;
      }

      case 'caramel': {
        const boxTex = createCaramelBoxTexture();
        const boxMat = new THREE.MeshStandardMaterial({ map: boxTex, roughness: 0.55, metalness: 0.05 });
        const boxGeo = new THREE.BoxGeometry(0.12, 0.17, 0.07);
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.y = 0.085;
        box.castShadow = true;
        group.add(box);
        break;
      }

      case 'snackbox': {
        const caramelTex = createCaramelBoxTexture();
        const snackMat = new THREE.MeshStandardMaterial({ map: caramelTex, roughness: 0.5, metalness: 0.05 });
        const snackGeo = new THREE.BoxGeometry(0.16, 0.22, 0.09);
        const snack = new THREE.Mesh(snackGeo, snackMat);
        snack.position.y = 0.11;
        snack.castShadow = true;
        group.add(snack);
        break;
      }
    }

    return group;
  }

  private updateMeshTransform() {
    if (!this.isFalling) {
      this.mesh.position.set(this.currentPos.x, this.currentPos.y, this.currentPos.z);
      this.mesh.rotation.set(0, 0, 0);
      this.mesh.rotation.x = -this.pitchAngle;
      this.mesh.rotation.z = this.rollAngle;
    } else {
      this.mesh.position.copy(this.currentPos);
      this.mesh.rotation.x += this.angularVelocity.x;
      this.mesh.rotation.y += this.angularVelocity.y;
      this.mesh.rotation.z += this.angularVelocity.z;
    }
  }

  public applyHitImpulse(hitPoint: THREE.Vector3, corkVel: THREE.Vector3, corkMass: number) {
    if (this.isDefeated) return;
    if (this.isSpawning) {
      this.isSpawning = false;
    }

    const hitLocalY = hitPoint.y - this.currentPos.y;
    const impulseMag = corkMass * corkVel.length();

    sounds.playHit(this.config.isMetal || false, impulseMag / (this.config.mass * 2.0));

    // Special tuning for Golden Daruma (heavy 7.5kg tumbler doll - impervious to cork spam)
    if (this.config.type === 'daruma') {
      this.currentPos.z -= 0.00015;
      this.pitchVelocity = Math.min(0.35, this.pitchVelocity + 0.06);
      sounds.playHit(true, 0.45);
      sounds.playWobble();
      return;
    }

    const pushZ = corkVel.z * corkMass;
    const relHeight = hitLocalY - this.config.comY;

    if (relHeight > 0.02) {
      const inertia = (1 / 12) * this.config.mass * (4 * this.config.comY * this.config.comY + this.config.baseDepth * this.config.baseDepth);
      const torque = relHeight * impulseMag * 0.9;
      const deltaAngularVel = torque / inertia;
      this.pitchVelocity += deltaAngularVel * 0.4;
    } else {
      const slideVel = (-Math.abs(pushZ) / this.config.mass) * 1.6;
      this.currentPos.z += slideVel * 0.06;
      this.velocity.z += slideVel;
      this.pitchVelocity += (impulseMag / this.config.mass) * 0.8;
    }

    const lateralOffset = hitPoint.x - this.currentPos.x;
    if (Math.abs(lateralOffset) > 0.01) {
      this.rollVelocity += (lateralOffset * impulseMag) / (this.config.mass * 0.08);
    }

    sounds.playWobble();
  }

  public applyExplosionImpulse(center: THREE.Vector3, blastRadius = 0.95, blastPower = 6.8) {
    if (this.isDefeated) return;
    if (this.isSpawning) {
      this.isSpawning = false;
    }

    const dist = this.currentPos.distanceTo(center);
    if (dist > blastRadius) return;

    const factor = Math.max(0, 1.0 - dist / blastRadius);
    const impulse = (blastPower * factor) / this.config.mass;

    const dir = this.currentPos.clone().sub(center).normalize();
    dir.z = -Math.abs(dir.z) - 0.4;
    dir.y = Math.abs(dir.y) + 0.3;
    dir.normalize();

    // 1. Golden Daruma: strictly ~3 direct bomb blasts to knock off!
    if (this.config.type === 'daruma') {
      if (factor < 0.40) {
        // Distant blast: only cosmetic wobble
        this.pitchVelocity = Math.min(0.4, this.pitchVelocity + 0.2 * factor);
        sounds.playWobble();
        return;
      }
      // Direct blast push: 0.0235m per blast. (Gap to rear shelf edge = 0.068m)
      // Blast 1: 0.0235m (rem: 0.0445m)
      // Blast 2: 0.0235m (rem: 0.0210m)
      // Blast 3: 0.0235m (total 0.0705m > 0.068m -> drops off shelf back)
      const blastRatio = Math.min(1.0, factor / 0.7);
      this.currentPos.z -= 0.0235 * blastRatio;
      this.velocity.z = 0;
      this.pitchVelocity = Math.min(0.65, this.pitchVelocity + 0.45 * factor);
      this.rollVelocity += dir.x * 0.25 * factor;
      sounds.playWobble();
      return;
    }

    // 2. Top Shelf prizes other than Golden Daruma (千両箱, 特大招き猫, 昭和レトロテレビ):
    // Moderately easy to fall (ある程度落ちやすく)
    if (this.config.shelfIndex === 2) {
      this.currentPos.z -= 0.048 * factor;
      this.velocity.addScaledVector(dir, impulse * 1.6);
      this.pitchVelocity += impulse * 2.8;
      this.rollVelocity += dir.x * impulse * 1.6;
      sounds.playWobble();
      return;
    }

    // 3. Middle and Bottom shelves (standard physics)
    this.currentPos.z -= 0.06 * factor;
    this.velocity.addScaledVector(dir, impulse * 1.9);
    this.pitchVelocity += (impulse * 3.8);
    this.rollVelocity += (dir.x * impulse * 2.0);

    sounds.playWobble();
  }

  public update(dt: number): boolean {
    if (this.isGrounded) return false;

    if (this.isSpawning) {
      this.currentPos.y += this.velocity.y * dt;
      if (this.currentPos.y <= this.basePos.y) {
        this.currentPos.y = this.basePos.y;
        this.velocity.set(0, 0, 0);
        this.isSpawning = false;
        sounds.playRestock();
      }
      this.updateMeshTransform();
      return false;
    }

    if (!this.isFalling) {
      const halfDepth = this.config.baseDepth * 0.5;
      const shelfBack = this.shelf.zBack;
      const rearEdgeZ = this.currentPos.z - halfDepth;

      if (rearEdgeZ < shelfBack) {
        this.isFalling = true;
        this.velocity.set(0, -0.3, -0.7);
        this.angularVelocity.set(-2.8, (Math.random() - 0.5) * 2, 0);
        return false;
      }

      if (Math.abs(this.velocity.z) > 0.001) {
        this.currentPos.z += this.velocity.z * dt;
        const friction = 8.0 * dt;
        if (Math.abs(this.velocity.z) <= friction) {
          this.velocity.z = 0;
        } else {
          this.velocity.z -= Math.sign(this.velocity.z) * friction;
        }
      }

      // Daruma is a self-righting tumbler doll (okiagari-koboshi) and does not topple on the shelf;
      // it only falls when pushed off the rear shelf edge.
      if (this.config.type !== 'daruma' && this.pitchAngle > this.criticalPitch) {
        this.isFalling = true;
        this.velocity.set(0, -0.4, -0.9);
        this.angularVelocity.set(-3.2, 0, (Math.random() - 0.5) * 2);
        return false;
      }

      const isDaruma = this.config.type === 'daruma';
      const stiffness = isDaruma ? 75.0 : this.config.type === 'treasure' ? 44.0 : 36.0;
      const damping = isDaruma ? 7.0 : 5.8;

      const pitchAcc = -stiffness * this.pitchAngle - damping * this.pitchVelocity;
      this.pitchVelocity += pitchAcc * dt;
      this.pitchAngle += this.pitchVelocity * dt;

      if (this.pitchAngle < 0) {
        this.pitchAngle = 0;
        if (Math.abs(this.pitchVelocity) > 0.8) {
          this.pitchVelocity = -this.pitchVelocity * 0.28;
          sounds.playHit(this.config.isMetal || false, 0.4);
        } else {
          this.pitchVelocity = 0;
        }
      }

      const rollAcc = -40.0 * this.rollAngle - 7.0 * this.rollVelocity;
      this.rollVelocity += rollAcc * dt;
      this.rollAngle += this.rollVelocity * dt;

      if (this.pitchAngle > 0.12) {
        this.wobbleSoundTimer += dt;
        if (this.wobbleSoundTimer > 0.20) {
          sounds.playWobble();
          this.wobbleSoundTimer = 0;
        }
      } else {
        this.wobbleSoundTimer = 0;
      }

      this.updateMeshTransform();
      return false;
    } else {
      this.velocity.y -= 9.8 * dt;
      this.currentPos.x += this.velocity.x * dt;
      this.currentPos.y += this.velocity.y * dt;
      this.currentPos.z += this.velocity.z * dt;

      this.updateMeshTransform();

      if (!this.isDefeated && this.currentPos.y < this.shelf.ySurface - 0.15) {
        this.isDefeated = true;
        sounds.playTopple(this.config.points);
        return true;
      }

      if (this.currentPos.y < 0.1) {
        this.currentPos.y = 0.1;
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.isGrounded = true;
      }

      return false;
    }
  }

  public getBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    box.setFromObject(this.mesh);
    // アケコンでの照準のブレを見込んで、判定を見た目より少し(約2〜3cm)広げる
    box.expandByScalar(0.03);
    return box;
  }

  public reset() {
    this.currentPos.copy(this.basePos);
    this.velocity.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.pitchAngle = 0;
    this.pitchVelocity = 0;
    this.rollAngle = 0;
    this.rollVelocity = 0;
    this.isFalling = false;
    this.isDefeated = false;
    this.isGrounded = false;
    this.isSpawning = false;
    this.mesh.visible = true;
    this.updateMeshTransform();
  }
}

// 17 Packed Prize Slots distributed across 4.3m wide shelves
export function createAllPrizes(shelves: ShelfInfo[]): PrizeEntity[] {
  const prizes: PrizeEntity[] = [];

  // ==========================================
  // TOP SHELF (Tier 2): 5 LUXURY GRAND PRIZES
  // ==========================================
  // Slot 0: 昭和レトロテレビ (400 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 0,
        type: 'tv',
        name: '昭和レトロテレビ',
        points: 400,
        shelfIndex: 2,
        shelfOffsetRatio: -0.80,
        mass: 2.4,
        baseWidth: 0.22,
        baseDepth: 0.17,
        height: 0.28,
        comY: 0.14,
        tippingAngleDeg: 28,
      },
      shelves[2]
    )
  );

  // Slot 1: 千両箱 (800 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 1,
        type: 'treasure',
        name: '千両箱',
        points: 800,
        shelfIndex: 2,
        shelfOffsetRatio: -0.40,
        mass: 3.2,
        baseWidth: 0.24,
        baseDepth: 0.16,
        height: 0.22,
        comY: 0.11,
        tippingAngleDeg: 30,
        isMetal: true,
      },
      shelves[2]
    )
  );

  // Slot 2: 金の大ダルマ (1000 pts - 特賞) - 爆破3回で落ちる高耐久仕様
  prizes.push(
    new PrizeEntity(
      {
        slotId: 2,
        type: 'daruma',
        name: '金の大ダルマ',
        points: 1000,
        shelfIndex: 2,
        shelfOffsetRatio: 0.0,
        mass: 7.5,
        baseWidth: 0.36,
        baseDepth: 0.36,
        height: 0.52,
        comY: 0.15,
        tippingAngleDeg: 80,
        isMetal: true,
      },
      shelves[2]
    )
  );

  // Slot 3: 特大招き猫 (700 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 3,
        type: 'manekineko',
        name: '特大招き猫',
        points: 700,
        shelfIndex: 2,
        shelfOffsetRatio: 0.40,
        mass: 2.8,
        baseWidth: 0.22,
        baseDepth: 0.18,
        height: 0.42,
        comY: 0.17,
        tippingAngleDeg: 29,
      },
      shelves[2]
    )
  );

  // Slot 4: 昭和レトロテレビ (400 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 4,
        type: 'tv',
        name: '昭和レトロテレビ',
        points: 400,
        shelfIndex: 2,
        shelfOffsetRatio: 0.80,
        mass: 2.4,
        baseWidth: 0.22,
        baseDepth: 0.17,
        height: 0.28,
        comY: 0.14,
        tippingAngleDeg: 28,
      },
      shelves[2]
    )
  );

  // ==========================================
  // MIDDLE SHELF (Tier 1): 6 MEDIUM PRIZES
  // ==========================================
  // Slot 5: ブリキのロボット (300 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 5,
        type: 'robot',
        name: 'ブリキのロボット',
        points: 300,
        shelfIndex: 1,
        shelfOffsetRatio: -0.82,
        mass: 1.8,
        baseWidth: 0.16,
        baseDepth: 0.14,
        height: 0.44,
        comY: 0.20,
        tippingAngleDeg: 24,
        isMetal: true,
      },
      shelves[1]
    )
  );

  // Slot 6: 爆速サイダー缶 (350 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 6,
        type: 'juicecan',
        name: '爆速サイダー缶',
        points: 350,
        shelfIndex: 1,
        shelfOffsetRatio: -0.50,
        mass: 1.5,
        baseWidth: 0.14,
        baseDepth: 0.14,
        height: 0.26,
        comY: 0.13,
        tippingAngleDeg: 25,
        isMetal: true,
      },
      shelves[1]
    )
  );

  // Slot 7: 特選水鉄砲 (300 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 7,
        type: 'watergun',
        name: '特選水鉄砲',
        points: 300,
        shelfIndex: 1,
        shelfOffsetRatio: -0.16,
        mass: 1.3,
        baseWidth: 0.18,
        baseDepth: 0.26,
        height: 0.24,
        comY: 0.12,
        tippingAngleDeg: 26,
      },
      shelves[1]
    )
  );

  // Slot 8: 大入り駄菓子箱 (200 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 8,
        type: 'snackbox',
        name: '大入り駄菓子箱',
        points: 200,
        shelfIndex: 1,
        shelfOffsetRatio: 0.16,
        mass: 0.65,
        baseWidth: 0.16,
        baseDepth: 0.10,
        height: 0.24,
        comY: 0.11,
        tippingAngleDeg: 21,
      },
      shelves[1]
    )
  );

  // Slot 9: ブリキのロボット (300 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 9,
        type: 'robot',
        name: 'ブリキのロボット',
        points: 300,
        shelfIndex: 1,
        shelfOffsetRatio: 0.50,
        mass: 1.8,
        baseWidth: 0.16,
        baseDepth: 0.14,
        height: 0.44,
        comY: 0.20,
        tippingAngleDeg: 24,
        isMetal: true,
      },
      shelves[1]
    )
  );

  // Slot 10: 特選水鉄砲 (300 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 10,
        type: 'watergun',
        name: '特選水鉄砲',
        points: 300,
        shelfIndex: 1,
        shelfOffsetRatio: 0.82,
        mass: 1.3,
        baseWidth: 0.18,
        baseDepth: 0.26,
        height: 0.24,
        comY: 0.12,
        tippingAngleDeg: 26,
      },
      shelves[1]
    )
  );

  // ==========================================
  // BOTTOM SHELF (Tier 0): 6 SMALL / SPEED PRIZES
  // ==========================================
  // Slot 11: 元祖ラムネ瓶 (100 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 11,
        type: 'ramune',
        name: '元祖ラムネ瓶',
        points: 100,
        shelfIndex: 0,
        shelfOffsetRatio: -0.84,
        mass: 0.45,
        baseWidth: 0.10,
        baseDepth: 0.10,
        height: 0.30,
        comY: 0.13,
        tippingAngleDeg: 18,
      },
      shelves[0]
    )
  );

  // Slot 12: 濃厚キャラメル箱 (100 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 12,
        type: 'caramel',
        name: '濃厚キャラメル',
        points: 100,
        shelfIndex: 0,
        shelfOffsetRatio: -0.50,
        mass: 0.32,
        baseWidth: 0.12,
        baseDepth: 0.08,
        height: 0.18,
        comY: 0.09,
        tippingAngleDeg: 19,
      },
      shelves[0]
    )
  );

  // Slot 13: 爆速サイダー缶 (350 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 13,
        type: 'juicecan',
        name: '爆速サイダー缶',
        points: 350,
        shelfIndex: 0,
        shelfOffsetRatio: -0.17,
        mass: 1.5,
        baseWidth: 0.14,
        baseDepth: 0.14,
        height: 0.26,
        comY: 0.13,
        tippingAngleDeg: 25,
        isMetal: true,
      },
      shelves[0]
    )
  );

  // Slot 14: 大入り駄菓子箱 (200 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 14,
        type: 'snackbox',
        name: '大入り駄菓子箱',
        points: 200,
        shelfIndex: 0,
        shelfOffsetRatio: 0.17,
        mass: 0.65,
        baseWidth: 0.16,
        baseDepth: 0.10,
        height: 0.24,
        comY: 0.11,
        tippingAngleDeg: 21,
      },
      shelves[0]
    )
  );

  // Slot 15: 濃厚キャラメル箱 (100 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 15,
        type: 'caramel',
        name: '濃厚キャラメル',
        points: 100,
        shelfIndex: 0,
        shelfOffsetRatio: 0.50,
        mass: 0.32,
        baseWidth: 0.12,
        baseDepth: 0.08,
        height: 0.18,
        comY: 0.09,
        tippingAngleDeg: 19,
      },
      shelves[0]
    )
  );

  // Slot 16: 元祖ラムネ瓶 (100 pts)
  prizes.push(
    new PrizeEntity(
      {
        slotId: 16,
        type: 'ramune',
        name: '元祖ラムネ瓶',
        points: 100,
        shelfIndex: 0,
        shelfOffsetRatio: 0.84,
        mass: 0.45,
        baseWidth: 0.10,
        baseDepth: 0.10,
        height: 0.30,
        comY: 0.13,
        tippingAngleDeg: 18,
      },
      shelves[0]
    )
  );

  return prizes;
}

/**
 * 同じ段の景品の並びをランダムに入れ替える(段の間は動かさないので、高得点の景品は上段のまま)。
 * 位置(スロット)は変えず、どの景品がどのスロットに載るかだけを変える。
 */
export function shuffleShelfLayout(prizes: PrizeEntity[]): void {
  const byShelf = new Map<number, PrizeEntity[]>();
  for (const p of prizes) {
    const list = byShelf.get(p.config.shelfIndex) ?? [];
    list.push(p);
    byShelf.set(p.config.shelfIndex, list);
  }
  for (const list of byShelf.values()) {
    const ratios = list.map((p) => p.config.shelfOffsetRatio).sort((a, b) => a - b);
    // Fisher-Yates
    for (let i = ratios.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ratios[i], ratios[j]] = [ratios[j], ratios[i]];
    }
    list.forEach((p, i) => p.setShelfOffsetRatio(ratios[i]));
  }
}
