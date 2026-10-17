import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Bakes every static mesh below `root` into one mesh per (material, shadow flags): hundreds of tiny draw calls become a
 * few dozen. Positions are baked relative to `root`, so the merged meshes sit at the origin of `root`.
 * Left alone: transparent materials (their draw order matters), instanced / skinned meshes, multi-material meshes and
 * meshes that need vertex colours.
 * `pruneEmpty`: 結合で空になった Group も取り除く(NPC車のように、中身を名前や位置で参照しないモデル用)。
 * @returns [meshes before, meshes after]
 */
export function mergeMeshesByMaterial(root: THREE.Object3D, opts: { pruneEmpty?: boolean } = {}): [number, number] {
  root.updateWorldMatrix(true, true);
  const inverseRoot = root.matrixWorld.clone().invert();

  const groups = new Map<string, { material: THREE.Material; castShadow: boolean; receiveShadow: boolean; renderOrder: number; geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
  let before = 0;
  root.traverse((o) => {
    if (o === root || !(o instanceof THREE.Mesh)) return;
    before++;
    const mat = o.material;
    if (Array.isArray(mat) || o instanceof THREE.InstancedMesh || o instanceof THREE.SkinnedMesh) return;
    if (mat.transparent || (mat as THREE.MeshStandardMaterial).vertexColors) return;
    if (!o.geometry.attributes.position) return;

    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
    g.clearGroups();

    const rel = new THREE.Matrix4().multiplyMatrices(inverseRoot, o.matrixWorld);
    g.applyMatrix4(rel);
    if (rel.determinant() < 0) flipWinding(g); // mirrored transform: keep faces pointing outward

    const key = `${mat.uuid}|${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|${o.renderOrder}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { material: mat, castShadow: o.castShadow, receiveShadow: o.receiveShadow, renderOrder: o.renderOrder, geos: [], meshes: [] };
      groups.set(key, entry);
    }
    entry.geos.push(g);
    entry.meshes.push(o);
  });

  let merged = 0;
  for (const e of groups.values()) {
    const geometry = mergeGeometries(e.geos, false);
    if (!geometry) { e.geos.forEach((g) => g.dispose()); continue; }   // attribute mismatch: leave these meshes untouched
    e.geos.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geometry, e.material);
    mesh.castShadow = e.castShadow;
    mesh.receiveShadow = e.receiveShadow;
    mesh.renderOrder = e.renderOrder;
    for (const m of e.meshes) { m.parent?.remove(m); m.geometry.dispose(); }
    root.add(mesh);
    merged++;
  }
  if (opts.pruneEmpty) pruneEmptyGroups(root);   // 部品の位置を目印に使う車(プレイヤーの車)では、空の Group も残す
  let after = 0;
  root.traverse((o) => { if (o !== root && o instanceof THREE.Mesh) after++; });
  return [before, after];
}

/**
 * 結合で中身がなくなった、空の Group を取り除く(部品ごとの入れ物が、結合のあとも何十個も残る)。
 * 動くたびに全ノードの行列を計算し直すので、NPC車1台あたり数十ノードの空の Group が、そのまま毎フレームのコストになる。
 * root 自身と、メッシュ・ライトなど Group 以外は触らない。
 */
export function pruneEmptyGroups(root: THREE.Object3D): number {
  let removed = 0;
  const visit = (o: THREE.Object3D): void => {
    for (const c of [...o.children]) visit(c);
    if (o !== root && o.type === 'Group' && o.children.length === 0) { o.parent?.remove(o); removed++; }
  };
  visit(root);
  return removed;
}

/** Swap the 2nd and 3rd vertex of every triangle of a non-indexed geometry. */
function flipWinding(g: THREE.BufferGeometry): void {
  for (const attr of Object.values(g.attributes)) {
    const a = attr as THREE.BufferAttribute;
    const n = a.itemSize, arr = a.array as Float32Array;
    for (let i = 0; i + 2 < a.count; i += 3) {
      for (let k = 0; k < n; k++) {
        const t = arr[(i + 1) * n + k];
        arr[(i + 1) * n + k] = arr[(i + 2) * n + k];
        arr[(i + 2) * n + k] = t;
      }
    }
    a.needsUpdate = true;
  }
}
