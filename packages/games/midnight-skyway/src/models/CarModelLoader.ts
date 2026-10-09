import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

let combatSedanGltf: THREE.Group | null = null;
let missileTruckGltf: THREE.Group | null = null;
let loadPromise: Promise<void> | null = null;

export async function preloadGlbCars(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const [cs, mt] = await Promise.all([
      loader.loadAsync('./models/combat_sedan.glb'),
      loader.loadAsync('./models/missile_truck_j.glb'),
    ]);
    combatSedanGltf = cs.scene;
    missileTruckGltf = mt.scene;
  })();
  return loadPromise;
}

function cloneWithMaterials(root: THREE.Object3D): THREE.Group {
  const cloned = root.clone(true) as THREE.Group;
  cloned.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map((m) => m.clone());
      } else if (obj.material) {
        obj.material = obj.material.clone();
      }
    }
  });
  return cloned;
}

export function getCombatSedanScene(): THREE.Group {
  if (!combatSedanGltf) throw new Error('combat_sedan.glb is not preloaded');
  return cloneWithMaterials(combatSedanGltf);
}

export function getMissileTruckScene(): THREE.Group {
  if (!missileTruckGltf) throw new Error('missile_truck_j.glb is not preloaded');
  return cloneWithMaterials(missileTruckGltf);
}
