import * as THREE from 'three';
import type { CarBase } from './CarBase';
import { mergeMeshesByMaterial } from './mergeMeshes';

/**
 * NPC車の遠距離用の簡易モデルを作る(THREE.LOD の遠い側)。
 * 元のモデルは三角形の約6割がホイール(1本あたり約4,000〜4,700)で、窓ガラスなどの透明部品がそれぞれ別の描画になる。
 * 遠くの車では見分けがつかないので、次のように省く。
 *  - ホイールを、タイヤとリムの2つの円柱にする
 *  - ナット・取っ手など、ごく小さな部品を取り除く
 *  - 透明なガラスを、1つの不透明な暗い素材にする(まとめて1回の描画にできる)
 * 渡す car は、このために新しく作った別のインスタンスであること(中身を書き換える)。
 */

const TINY_PART_RADIUS = 0.07;         // これより小さい部品(メッシュの外接球の半径, m)は取り除く
let farGlass: THREE.MeshStandardMaterial | null = null;

function getFarGlass(): THREE.MeshStandardMaterial {
  farGlass ??= new THREE.MeshStandardMaterial({ color: 0x141b27, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.35 });
  return farGlass;
}

export function buildFarVariant(car: CarBase): THREE.Group {
  const root = car.group;
  root.updateMatrixWorld(true);

  // 1. ホイール: 大きさを測ってから、タイヤとリムだけの簡易な形に作り替える
  const wheelSet = new Set<THREE.Object3D>(car.wheels);
  for (const w of car.wheels) {
    const size = new THREE.Box3().setFromObject(w).getSize(new THREE.Vector3());
    const width = Math.min(size.x, size.z), radius = size.y / 2;
    for (const c of [...w.children]) {
      c.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose(); });
      w.remove(c);
    }
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 14).rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.62, width * 1.01, 14).rotateZ(Math.PI / 2);
    w.add(new THREE.Mesh(tireGeo, car.tireMaterial), new THREE.Mesh(rimGeo, car.silverMaterial));
  }

  // 2. ごく小さな部品の除去と、透明部品の不透明化
  const remove: THREE.Object3D[] = [];
  const sphere = new THREE.Sphere();
  const scale = new THREE.Vector3();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || o.name === 'contact_shadow') return;
    for (let p: THREE.Object3D | null = o; p; p = p.parent) if (wheelSet.has(p)) return;   // ホイールは上で作り替え済み
    const g = mesh.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    sphere.copy(g.boundingSphere!);
    o.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    if (sphere.radius * Math.max(scale.x, scale.y, scale.z) < TINY_PART_RADIUS) { remove.push(o); return; }
    const mat = mesh.material as THREE.Material;
    if (!Array.isArray(mat) && mat.transparent) mesh.material = getFarGlass();
  });
  for (const o of remove) o.parent?.remove(o);

  // 3. 素材ごとに1メッシュへ結合(ホイールも車体と一緒に焼き込む)
  mergeMeshesByMaterial(root, { pruneEmpty: true });
  return root;
}

let ultraDark: THREE.MeshStandardMaterial | null = null;
function getUltraDark(): THREE.MeshStandardMaterial {
  ultraDark ??= new THREE.MeshStandardMaterial({ color: 0x0c1018, roughness: 0.7, metalness: 0.15, envMapIntensity: 0.3 });
  return ultraDark;
}

/**
 * NPC車の「とても遠い」用の簡易モデルを作る(THREE.LOD の一番遠い側)。
 * buildFarVariant でも、1台あたり 22 回の描画(素材ごとに1メッシュ)が残る。見えている交通NPCは十数台〜三十台で、
 * そのほとんどが 150m 以上先(霧の薄いコースでは 500m 以上)にあり、画面では数ピクセルの塗装色の点と光だけなので、
 * 車体・屋根の塗装、ライト(発光する素材)、それ以外のすべて(1つの暗い素材)の数個のメッシュに減らす。
 * 渡す car は、このために新しく作った別のインスタンスであること(中身を書き換える)。
 */
export function buildUltraFarVariant(car: CarBase): THREE.Group {
  const root = buildFarVariant(car);
  const keep = new Set<THREE.Material>([car.bodyMaterial, car.roofMaterial, car.headlightEmissive, car.taillightEmissive, car.amberEmissive]);
  const dark = getUltraDark();
  const remove: THREE.Object3D[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (o.name === 'contact_shadow') { remove.push(o); return; }
    if (!keep.has(mesh.material as THREE.Material)) mesh.material = dark;
  });
  for (const o of remove) o.parent?.remove(o);
  mergeMeshesByMaterial(root, { pruneEmpty: true });
  return root;
}
