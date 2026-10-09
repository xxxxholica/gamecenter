import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { getMissileTruckScene } from './CarModelLoader';

export class MissileTruckModel extends CarBase {
  public readonly specs: CarSpecs = {
    name: 'TRUCK J MLRS',
    category: '8連装重武装軽トラック',
    length: '3,395 mm',
    width: '1,475 mm',
    height: '1,980 mm',
    wheelbase: '1,900 mm',
    drivetrain: 'リフトアップ4WD / 5MT',
    weight: '1,280 kg',
    description: 'Truck Jを極限武装カスタムした8連装ロケット搭載軽トラック。油圧チルト式MLRSポッド、スノープラウバンパー、ハイリフトオフロード足回りを完全装備。',
  };

  private primaryMaterials: THREE.MeshStandardMaterial[] = [];
  private secondaryMaterials: THREE.MeshStandardMaterial[] = [];
  private headlightMaterials: THREE.MeshStandardMaterial[] = [];

  constructor() {
    super();
    this.skipMeshMerge = true;
    this.cockpitEyeOffset = new THREE.Vector3(-0.32, 1.25, 0.20);
    this.cockpitLookOffset = new THREE.Vector3(0, -0.04, 20.0);
    this.buildCar();
    this.setBodyColor(0xf5f6fa); // Pure white default
    this.setRoofColor(0x283823); // Military launcher green default
  }

  private buildCar(): void {
    const gltfScene = getMissileTruckScene();
    const carRoot = (gltfScene.getObjectByName('TruckJ_Root') as THREE.Group) || gltfScene;

    // Orient model to +Z forward convention
    carRoot.rotation.y = Math.PI;

    // Retrieve the 4 wheels directly from carRoot
    // Due to rotation.y = PI, FR maps to Three.js Left (-X) and FL maps to Right (+X)
    const wheelFL = carRoot.getObjectByName('Wheel_FL');
    const wheelFR = carRoot.getObjectByName('Wheel_FR');
    const wheelRL = carRoot.getObjectByName('Wheel_RL');
    const wheelRR = carRoot.getObjectByName('Wheel_RR');

    this.wheels = [wheelFR!, wheelFL!, wheelRR!, wheelRL!].filter(Boolean) as THREE.Group[];

    // Extract materials
    carRoot.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if (!mat) continue;
          if (mat.name.includes('WindowGlass')) {
            mat.transparent = true;
            mat.opacity = 0.20;
            mat.depthWrite = false;
            mat.roughness = 0.05;
            this.windshield = child;
          } else if (mat.name.includes('TruckWhite')) {
            this.primaryMaterials.push(mat as THREE.MeshStandardMaterial);
            this.bodyMaterial = mat as any;
          } else if (mat.name.includes('LauncherGreen')) {
            this.secondaryMaterials.push(mat as THREE.MeshStandardMaterial);
            this.roofMaterial = mat as any;
          } else if (mat.name.includes('Headlight') || mat.name.includes('AmberLight')) {
            this.headlightMaterials.push(mat as THREE.MeshStandardMaterial);
          }
        }
      }
    });

    this.group.add(carRoot);
    this.addContactShadow(1.9, 3.8, 0);
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
      if (mat.name.includes('AmberLight')) {
        mat.emissive.setHex(enabled ? 0xff8800 : 0x000000);
        mat.emissiveIntensity = enabled ? 1.5 : 0.0;
      } else {
        mat.emissive.setHex(enabled ? 0xfff0c0 : 0x000000);
        mat.emissiveIntensity = enabled ? 2.5 : 0.0;
      }
    }
  }
}
