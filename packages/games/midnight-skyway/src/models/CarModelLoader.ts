import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export type DragonVariant = 'a' | 'b' | 'c';

const DRAGON_FILES: Record<DragonVariant, string> = {
  a: './models/dragon_car_a_crimson.glb',
  b: './models/dragon_car_b_azure.glb',
  c: './models/dragon_car_c_gold.glb',
};

/** 毎フレーム頂点バッファをFK変形するノード。インスタンス間でジオメトリを共有しないよう、クローン時に複製する。 */
const DRAGON_DEFORM_NODES = ['Dragon_Horns', 'Dragon_Wings', 'Dragon_Tail'];

const dragonGltf: Partial<Record<DragonVariant, THREE.Group>> = {};
let loadPromise: Promise<void> | null = null;

export async function preloadGlbCars(): Promise<void> {
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    await Promise.all((Object.keys(DRAGON_FILES) as DragonVariant[]).map(async (v) => {
      dragonGltf[v] = (await loader.loadAsync(DRAGON_FILES[v])).scene;
    }));
  })();
  return loadPromise;
}

export function getDragonCarScene(variant: DragonVariant): THREE.Group {
  const src = dragonGltf[variant];
  if (!src) throw new Error(`dragon_car_${variant} glb is not preloaded`);
  const cloned = src.clone(true) as THREE.Group;
  // GLB内で複数メッシュが共有している素材は、この車1台につき1つだけ複製する(色・光量の変更が1箇所で済む)
  const matMap = new Map<THREE.Material, THREE.Material>();
  const cloneMat = (m: THREE.Material): THREE.Material => {
    let c = matMap.get(m);
    if (!c) { c = m.clone(); matMap.set(m, c); }
    return c;
  };
  cloned.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    obj.material = Array.isArray(obj.material) ? obj.material.map(cloneMat) : cloneMat(obj.material);
  });
  for (const name of DRAGON_DEFORM_NODES) {
    cloned.getObjectByName(name)?.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) obj.geometry = obj.geometry.clone();
    });
  }
  return cloned;
}
