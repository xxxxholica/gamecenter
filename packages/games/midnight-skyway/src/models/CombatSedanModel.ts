import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { getCombatSedanScene } from './CarModelLoader';

export class CombatSedanModel extends CarBase {
  public readonly specs: CarSpecs = {
    name: 'COMBAT SEDAN',
    category: '重装甲コンバットセダン',
    length: '4,520 mm',
    width: '1,880 mm',
    height: '1,650 mm',
    wheelbase: '2,750 mm',
    drivetrain: '強化AWD / リフトアップシャーシ',
    weight: '2,150 kg',
    description: '荒廃した夜のハイウェイを制圧する重装甲セダン。ツイン重機関銃、ラムウェッジバンパー、スーパーチャージャー、オフロードスパイクタイヤを完全装備。',
  };

  private primaryMaterials: THREE.MeshStandardMaterial[] = [];
  private secondaryMaterials: THREE.MeshStandardMaterial[] = [];
  private headlightMaterials: THREE.MeshStandardMaterial[] = [];

  constructor() {
    super();
    this.skipMeshMerge = true;
    this.cockpitEyeOffset = new THREE.Vector3(-0.38, 1.05, -0.15);
    this.cockpitLookOffset = new THREE.Vector3(0, -0.04, 20.0);
    this.buildCar();
    this.setBodyColor(0x35422e); // Olive Drab default
    this.setRoofColor(0x1e272e);
    this.setLights(true);
  }

  private buildCar(): void {
    const gltfScene = getCombatSedanScene();
    const carRoot = (gltfScene.getObjectByName('Car_Root') as THREE.Group) || gltfScene;

    // Orient model to +Z forward convention (GLB is -Z forward in Three.js coordinates)
    carRoot.rotation.y = Math.PI;

    // Retrieve the 4 wheels directly from carRoot
    // Due to rotation.y = PI, FR maps to Three.js Left (-X) and FL maps to Right (+X)
    const wheelFL = carRoot.getObjectByName('Wheel_FL');
    const wheelFR = carRoot.getObjectByName('Wheel_FR');
    const wheelRL = carRoot.getObjectByName('Wheel_RL');
    const wheelRR = carRoot.getObjectByName('Wheel_RR');

    this.wheels = [wheelFR!, wheelFL!, wheelRR!, wheelRL!].filter(Boolean) as THREE.Group[];

    // Extract materials for dynamic color / lighting changes
    carRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          if (mat.name.includes('OliveDrab')) {
            this.primaryMaterials.push(mat as THREE.MeshStandardMaterial);
            this.bodyMaterial = mat as any;
          } else if (mat.name.includes('RustedIron')) {
            this.secondaryMaterials.push(mat as THREE.MeshStandardMaterial);
            this.roofMaterial = mat as any;
          } else if (mat.name.includes('Headlight') || mat.name.includes('SensorRed')) {
            this.headlightMaterials.push(mat as THREE.MeshStandardMaterial);
          } else if (mat.name.includes('SpikeSteel')) {
            // Tone down overly bright chrome spike steel to authentic dark combat steel so it doesn't blow out white
            const sm = mat as THREE.MeshStandardMaterial;
            sm.color.setHex(0x5a5e65);
            sm.roughness = 0.52;
            sm.metalness = 0.85;
          }
        }
      }
    });

    this.group.add(carRoot);
    this.addContactShadow(2.4, 5.0, 0);

    // Twin upward exhaust pipe flame groups (permanently anchored to the physical pipe openings)
    this.leftExhaustFlameGroup.position.set(-0.45, 2.1827, -0.9035);
    this.rightExhaustFlameGroup.position.set(0.45, 2.1827, -0.9035);
    this.group.add(this.leftExhaustFlameGroup);
    this.group.add(this.rightExhaustFlameGroup);
    this.setupExhaustFlames();
  }

  public leftExhaustFlameGroup = new THREE.Group();
  public rightExhaustFlameGroup = new THREE.Group();
  private flameTimer = 0;
  private flameBurstTimer = 0;

  private setupExhaustFlames(): void {
    // Slender incandescent core (base radius 0.030m, height 0.26m, starts flush at pipe rim Y=0)
    const coreGeo = new THREE.ConeGeometry(0.030, 0.26, 8);
    coreGeo.translate(0, 0.13, 0);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffea55,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
    });

    // Translucent fiery orange mantle (base radius 0.045m, height 0.34m, fits inside 0.065m pipe)
    const outerGeo = new THREE.ConeGeometry(0.045, 0.34, 8);
    outerGeo.translate(0, 0.17, 0);
    const outerMat = new THREE.MeshBasicMaterial({
      color: 0xff5511,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });

    [this.leftExhaustFlameGroup, this.rightExhaustFlameGroup].forEach((grp) => {
      const coreMesh = new THREE.Mesh(coreGeo, coreMat);
      coreMesh.name = 'flame_core';
      const outerMesh = new THREE.Mesh(outerGeo, outerMat);
      outerMesh.name = 'flame_outer';
      grp.add(coreMesh);
      grp.add(outerMesh);
      grp.visible = false; // Hidden initially in menu / idle until driving or firing
    });
  }

  /**
   * Updates living, swaying exhaust flames (ゆらゆら揺れる炎)
   * Anchored 100% to the pipe rims with natural turbulence and aerodynamic wind lean
   */
  public updateExhaustFlames(dt: number, speed: number, isFiring = false): void {
    this.flameTimer += dt;
    if (isFiring) this.flameBurstTimer = 0.25;
    else if (this.flameBurstTimer > 0) this.flameBurstTimer -= dt;

    const firing = this.flameBurstTimer > 0;
    const absSpeed = Math.abs(speed);
    const t = this.flameTimer;

    // Physical pipe slant: 22 deg backwards from vertical (+Y towards -Z)
    const baseTiltX = -0.384;
    // Aerodynamic wind drag leans the flame slightly backwards as car moves forward
    const windLean = -Math.min(absSpeed / 75, 0.22);

    [this.leftExhaustFlameGroup, this.rightExhaustFlameGroup].forEach((grp, idx) => {
      const seed = idx * 2.8;
      // Organic swaying & fluttering (ゆらめき・揺れ) across multiple harmonic waves
      const swayZ = Math.sin(t * 22 + seed) * 0.11 + Math.cos(t * 37 + seed) * 0.06;
      const swayX = Math.sin(t * 28 + seed) * 0.09 + Math.cos(t * 43) * 0.05;

      grp.rotation.x = baseTiltX + windLean + swayX;
      grp.rotation.z = swayZ;
      grp.rotation.y = Math.sin(t * 16 + seed) * 0.08;

      // High-frequency flame scale pulsing / flickering
      const flutter = 1.0 + Math.sin(t * 36 + seed) * 0.18 + Math.cos(t * 52 + seed) * 0.12;

      let lenScale = 0.5;
      let radScale = 0.6;
      if (firing) {
        lenScale = 1.35 * flutter;
        radScale = 0.95;
      } else if (absSpeed > 5) {
        lenScale = (0.65 + Math.min(absSpeed / 40, 0.55)) * flutter;
        radScale = 0.75 + Math.sin(t * 20 + seed) * 0.10;
      } else {
        lenScale = 0.35 * flutter;
        radScale = 0.55;
      }

      grp.scale.set(radScale, lenScale, radScale);
      grp.visible = true;
    });
  }

  public override setBodyColor(hex: number): void {
    for (const mat of this.primaryMaterials) {
      mat.color.setHex(hex);
    }
  }

  public override setRoofColor(hex: number): void {
    for (const mat of this.secondaryMaterials) {
      mat.color.setHex(hex);
    }
  }

  public override setLights(enabled: boolean): void {
    this.lightsEnabled = enabled;
    for (const mat of this.headlightMaterials) {
      if (mat.name.includes('SensorRed')) {
        mat.emissive.setHex(enabled ? 0xff1111 : 0x220000);
        mat.emissiveIntensity = enabled ? 2.5 : 0.2;
      } else {
        mat.emissive.setHex(enabled ? 0xfff0c0 : 0x000000);
        mat.emissiveIntensity = enabled ? 3.0 : 0.0;
      }
    }
  }
}
