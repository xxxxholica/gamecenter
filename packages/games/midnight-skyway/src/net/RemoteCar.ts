import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CarBase } from '../models/CarBase';
import { DragonCarModel } from '../models/DragonCarModel';
import type { CarSpec, CarState } from '../../../../shared/netProtocol';
import { RemoteTrack } from './remoteTrack';

/** この時間以上更新が来ない車は「通信途絶」とみなして当たり判定から外す。 */
export const STALE_MS = 1500;

/** ドラゴン・カーの翼・尻尾の振幅を速度で変えるときの基準速度(m/s)。 */
const DRAGON_REF_SPEED = 42;

export function createCarModel(type: string, remote = false): CarBase {
  if (type === 'dragon_b') return new DragonCarModel('b', { remote });
  if (type === 'dragon_c') return new DragonCarModel('c', { remote });
  return new DragonCarModel('a', { remote });
}

const DEFORM_ROOTS = new Set(['Dragon_Wings', 'Dragon_Tail', 'Dragon_Tail_R']);

/**
 * 相手車両の静止パーツ(Body_Chassis / Dragon_Horns / 後輪2本)を素材ごとに結合してドローコールを削減する。
 * CarModelLoader の共有ジオメトリを壊さないよう、元メッシュの geometry.dispose() は呼ばない。
 */
function mergeRemoteStaticMeshes(car: CarBase): void {
  const pivot = car.bodyPivot;
  if (!pivot) return;
  // 後輪2本はステアしないため bodyPivot 側へ移して車体・角と一体化する
  while (car.wheels.length > 2) {
    const rear = car.wheels.pop()!;
    pivot.attach(rear);
  }
  pivot.updateWorldMatrix(true, true);
  const invPivot = pivot.matrixWorld.clone().invert();
  const byMat = new Map<THREE.Material, { geos: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();

  const collect = (o: THREE.Object3D): void => {
    if (DEFORM_ROOTS.has(o.name)) return;
    if (o instanceof THREE.Mesh && !Array.isArray(o.material) && !o.material.transparent && o.geometry?.attributes.position) {
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      for (const k of Object.keys(g.attributes)) {
        if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      }
      g.clearGroups();
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(invPivot, o.matrixWorld));
      let entry = byMat.get(o.material);
      if (!entry) {
        entry = { geos: [], meshes: [] };
        byMat.set(o.material, entry);
      }
      entry.geos.push(g);
      entry.meshes.push(o);
    }
    for (const c of o.children) collect(c);
  };
  collect(pivot);

  for (const [mat, entry] of byMat) {
    if (entry.geos.length < 2) {
      entry.geos.forEach((g) => g.dispose());
      continue;
    }
    const merged = mergeGeometries(entry.geos, false);
    entry.geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    for (const m of entry.meshes) m.parent?.remove(m);
    pivot.add(mesh);
  }
}

/** 他のプレイヤーの車。受信した姿勢を補間して表示する(物理は持たない)。 */
export class RemoteCar {
  public readonly id: number;
  public readonly name: string;
  public readonly car: CarBase;
  public readonly label: THREE.Sprite;
  public readonly color: number;

  /** 現在の表示姿勢(補間後)。当たり判定・順位にも使う。 */
  public readonly pos = new THREE.Vector3();
  public rotY = 0;
  public speed = 0;
  public progress = 0;
  public valid = false;
  /** 受信した、ステア・ドリフト中(0|1)・ブーストの強さ(0〜1)。演出に使う */
  public steer = 0;
  public drift = 0;
  public boost = 0;

  private readonly track = new RemoteTrack();

  constructor(id: number, name: string, spec: CarSpec) {
    this.id = id;
    this.name = name;
    this.color = spec.body;
    this.car = createCarModel(spec.type, true);
    this.car.setBodyColor(spec.body);
    this.car.setRoofColor(spec.roof);
    this.car.initSuspension();
    mergeRemoteStaticMeshes(this.car);
    this.car.setLights(true);
    // 接地影(addContactShadow)はあるので、相手車両の40超のサブメッシュは 4096px 影マップから外す
    this.car.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = false;
        o.receiveShadow = false;
      }
    });
    this.car.group.visible = false;
    this.label = makeLabel(name, spec.body);
    this.car.group.add(this.label);
  }

  public push(s: CarState, now = performance.now(), sentAt?: number): void {
    this.track.push(s, now, sentAt);
  }

  public get stale(): boolean {
    return this.track.sinceLastRecv(performance.now()) > STALE_MS;
  }

  public update(now = performance.now(), viewerPos?: THREE.Vector3, animateParts = true): void {
    if (!this.track.update(now)) return;
    const p = this.track.pose;
    this.pos.set(p.x, p.y, p.z);
    this.rotY = p.yaw;
    this.speed = p.speed;
    this.progress = p.progress;
    this.steer = p.steer;
    this.drift = p.drift;
    this.boost = p.boost;
    this.valid = true;

    const g = this.car.group;
    g.visible = true;                                   // 最初の姿勢が届くまでは隠してある(コンストラクタ)
    g.position.copy(this.pos);
    g.rotation.set(p.pitch, this.rotY, 0, 'YXZ');      // 路面の勾配
    this.car.bodyPivot?.rotation.set(0, 0, p.roll);     // ボディのロール
    const steer = p.steer;
    const wheels = this.car.wheels;
    if (wheels && wheels.length >= 2) {
      const base = this.car.wheelBaseYaw;
      for (let i = 0; i < wheels.length; i++) {
        wheels[i].rotation.x = 0;
        wheels[i].rotation.y = (base[i] ?? 0) + (i < 2 ? steer : 0);
      }
    }
    // ドラゴン・カーの翼・尻尾(FK): 近くの相手だけ、フレームごとに1台ずつ順番に頂点変形・転送を回す
    if (animateParts && this.car instanceof DragonCarModel && (!viewerPos || this.pos.distanceToSquared(viewerPos) <= 65 * 65)) {
      this.car.updateDragonParts(now / 1000, Math.abs(p.speed) / DRAGON_REF_SPEED);
    }
  }

  public dispose(): void {
    this.car.group.parent?.remove(this.car.group);
    this.label.material.map?.dispose();
    this.label.material.dispose();
  }
}

function makeLabel(text: string, color: number): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 28px system-ui, "Hiragino Kaku Gothic ProN", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 192, 32);
  g.fillStyle = '#' + new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.55).getHexString();
  g.fillText(text, 192, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(4.8, 0.8, 1);
  sprite.position.set(0, 2.2, 0);
  sprite.renderOrder = 10;
  return sprite;
}
