import * as THREE from 'three';
import { createWoodTexture } from './textures';

export class CorkRifle {
  public group: THREE.Group;
  public muzzleWorldPos: THREE.Vector3 = new THREE.Vector3();
  public muzzleWorldDir: THREE.Vector3 = new THREE.Vector3();

  private muzzleMarker: THREE.Object3D;
  private smokeParticles: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];
  private smokeGeo: THREE.SphereGeometry;
  private smokeMat: THREE.MeshBasicMaterial;

  // Recoil kickback state
  private recoilOffset: number = 0;
  private recoilAngle: number = 0;
  private isRecoiling: boolean = false;
  private recoilTimer: number = 0;

  // Cork in muzzle
  private muzzleCork: THREE.Mesh;

  constructor() {
    this.group = new THREE.Group();

    const stockWoodTex = createWoodTexture('#733d1b', '#4a230e');
    stockWoodTex.repeat.set(2, 1);
    const stockMat = new THREE.MeshStandardMaterial({
      map: stockWoodTex,
      roughness: 0.5,
      metalness: 0.1,
    });

    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x34495e,
      roughness: 0.35,
      metalness: 0.85,
    });

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.4,
      metalness: 0.8,
    });

    // 1. Wooden Buttstock
    const buttGeo = new THREE.BoxGeometry(0.045, 0.11, 0.32);
    const butt = new THREE.Mesh(buttGeo, stockMat);
    butt.position.set(0, -0.05, 0.22);
    butt.rotation.x = 0.12;
    this.group.add(butt);

    // 2. Wooden Grip & Receiver
    const gripGeo = new THREE.BoxGeometry(0.048, 0.08, 0.35);
    const grip = new THREE.Mesh(gripGeo, stockMat);
    grip.position.set(0, -0.02, -0.08);
    this.group.add(grip);

    // 3. Steel Receiver Housing
    const recGeo = new THREE.BoxGeometry(0.046, 0.065, 0.22);
    const rec = new THREE.Mesh(recGeo, steelMat);
    rec.position.set(0, 0.02, -0.06);
    this.group.add(rec);

    // 4. Cocking Bolt
    const boltGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.06, 8);
    const bolt = new THREE.Mesh(boltGeo, brassMat);
    bolt.rotation.z = Math.PI / 2;
    bolt.position.set(0.035, 0.05, 0.0);
    this.group.add(bolt);

    // 5. Metal Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.65, 16);
    const barrel = new THREE.Mesh(barrelGeo, steelMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.032, -0.52);
    this.group.add(barrel);

    // 6. Fore-end
    const forendGeo = new THREE.BoxGeometry(0.042, 0.045, 0.36);
    const forend = new THREE.Mesh(forendGeo, stockMat);
    forend.position.set(0, 0.005, -0.38);
    this.group.add(forend);

    // 7. Brass Barrel Bands
    const bandGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.025, 16);
    const band1 = new THREE.Mesh(bandGeo, brassMat);
    band1.rotation.x = Math.PI / 2;
    band1.position.set(0, 0.032, -0.32);
    const band2 = band1.clone();
    band2.position.set(0, 0.032, -0.58);
    this.group.add(band1, band2);

    // 8. Front Sight
    const sightGeo = new THREE.BoxGeometry(0.006, 0.016, 0.01);
    const sight = new THREE.Mesh(sightGeo, brassMat);
    sight.position.set(0, 0.057, -0.82);
    this.group.add(sight);

    // 9. Rear Sight
    const rearSightGeo = new THREE.BoxGeometry(0.02, 0.015, 0.015);
    const rearSight = new THREE.Mesh(rearSightGeo, steelMat);
    rearSight.position.set(0, 0.055, -0.18);
    this.group.add(rearSight);

    // 10. Trigger Guard
    const guardGeo = new THREE.TorusGeometry(0.028, 0.005, 8, 16, Math.PI);
    const guard = new THREE.Mesh(guardGeo, brassMat);
    guard.rotation.y = Math.PI / 2;
    guard.rotation.x = Math.PI;
    guard.position.set(0, -0.06, 0.02);
    this.group.add(guard);

    // 11. Cork in muzzle
    const corkGeo = new THREE.CylinderGeometry(0.014, 0.012, 0.04, 12);
    const corkMat = new THREE.MeshStandardMaterial({
      color: 0xc19a6b,
      roughness: 0.9,
    });
    this.muzzleCork = new THREE.Mesh(corkGeo, corkMat);
    this.muzzleCork.rotation.x = Math.PI / 2;
    this.muzzleCork.position.set(0, 0.032, -0.86);
    this.group.add(this.muzzleCork);

    // Muzzle tip marker
    this.muzzleMarker = new THREE.Object3D();
    this.muzzleMarker.position.set(0, 0.032, -0.88);
    this.group.add(this.muzzleMarker);

    // Smoke particle shared geometry & material
    this.smokeGeo = new THREE.SphereGeometry(0.032, 8, 8);
    this.smokeMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.7,
    });
  }

  // Trigger recoil kickback & smoke (normal or explosive blast flash)
  public fire(scene: THREE.Scene, isExplosive = false): { origin: THREE.Vector3; direction: THREE.Vector3 } {
    this.isRecoiling = true;
    this.recoilTimer = 0;
    this.recoilOffset = isExplosive ? 0.18 : 0.12;
    this.recoilAngle = isExplosive ? 0.22 : 0.14;

    this.updateMuzzleVectors();

    const particleCount = isExplosive ? 14 : 7;
    const smokeColor = isExplosive ? 0xff6b4a : 0xdddddd;

    for (let i = 0; i < particleCount; i++) {
      const pMat = this.smokeMat.clone();
      pMat.color.setHex(smokeColor);
      const pMesh = new THREE.Mesh(this.smokeGeo, pMat);
      pMesh.position.copy(this.muzzleWorldPos);
      pMesh.position.add(
        new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.05)
      );

      const speed = isExplosive ? 2.4 : 1.4;
      const pVel = this.muzzleWorldDir.clone().multiplyScalar(speed + Math.random());
      pVel.x += (Math.random() - 0.5) * 0.5;
      pVel.y += 0.25 + Math.random() * 0.4;
      pVel.z += (Math.random() - 0.5) * 0.5;

      scene.add(pMesh);
      this.smokeParticles.push({
        mesh: pMesh,
        vel: pVel,
        life: 0,
        maxLife: isExplosive ? 0.45 : 0.3,
      });
    }

    return {
      origin: this.muzzleWorldPos.clone(),
      direction: this.muzzleWorldDir.clone(),
    };
  }

  public updateMuzzleVectors() {
    this.muzzleMarker.getWorldPosition(this.muzzleWorldPos);
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.group.quaternion);
    this.muzzleWorldDir.copy(dir.normalize());
  }

  public update(
    dt: number,
    elapsed: number,
    camera: THREE.Camera,
    targetWorldPos: THREE.Vector3,
    isActive: boolean
  ) {
    if (!isActive) {
      this.group.visible = false;
      return;
    }
    this.group.visible = true;

    // Fast snappy recoil recovery (tuned for rapid fire)
    if (this.isRecoiling) {
      this.recoilTimer += dt;
      if (this.recoilTimer < 0.03) {
        // Peak kick
      } else {
        const decay = Math.exp(-(this.recoilTimer - 0.03) * 18.0);
        this.recoilOffset *= decay;
        this.recoilAngle *= decay;
        if (this.recoilTimer > 0.18) {
          this.isRecoiling = false;
          this.recoilOffset = 0;
          this.recoilAngle = 0;
        }
      }
    }

    const gunRestPos = new THREE.Vector3(0.24, -0.22, -0.45);
    const idleSwayX = Math.sin(elapsed * 1.8) * 0.003;
    const idleSwayY = Math.cos(elapsed * 3.6) * 0.004;

    gunRestPos.x += idleSwayX;
    gunRestPos.y += idleSwayY;
    gunRestPos.z += this.recoilOffset;
    gunRestPos.y += this.recoilAngle * 0.3;

    const worldRestPos = gunRestPos.clone().applyMatrix4(camera.matrixWorld);
    this.group.position.copy(worldRestPos);
    this.group.lookAt(targetWorldPos);
    this.group.rotateX(-this.recoilAngle);

    this.updateMuzzleVectors();

    // Update smoke
    for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
      const p = this.smokeParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.mesh.parent?.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.smokeParticles.splice(i, 1);
      } else {
        p.mesh.position.addScaledVector(p.vel, dt);
        const progress = p.life / p.maxLife;
        const scale = 1.0 + progress * 3.5;
        p.mesh.scale.set(scale, scale, scale);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1.0 - progress);
      }
    }
  }

  public reset() {
    this.isRecoiling = false;
    this.recoilOffset = 0;
    this.recoilAngle = 0;
    for (const p of this.smokeParticles) {
      p.mesh.parent?.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.smokeParticles = [];
  }
}
