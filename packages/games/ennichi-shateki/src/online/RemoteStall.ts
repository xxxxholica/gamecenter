import * as THREE from 'three';
import { FestivalStall } from '../stall';
import { CorkRifle } from '../gun';
import { PrizeEntity, createAllPrizes, shuffleShelfLayout } from '../prizes';
import type { FireEvent, PrizeSnap } from '../../../../shared/ennichiProtocol';
import { mulberry32 } from '../../../../shared/online/seededRandom';
import { makeLabel } from './label';

/** 他の人が撃ったコルク(見た目だけ): 当たり判定も音も無い。奥の壁・床・寿命で消える。 */
interface RemoteCork {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  age: number;
}

const CORK_SPEED = 36;
const WALL_Z = -1.38;
const WALL_TOP = 2.7;

/**
 * 他の人の台(見た目だけ)。持ち主が計算した景品の動きをスナップショットで受けて反映し、銃は照準に合わせて動かし、
 * 発砲に合わせてコルクを飛ばす。自分の台(x=0)に対して、スロット差だけ x をずらして置く。
 * 物理も効果音も動かさないので、他人の台で何が起きても、自分の遊びには影響しない。
 */
export class RemoteStall {
  public readonly group = new THREE.Group();
  private readonly stall: FestivalStall;
  private readonly prizes: PrizeEntity[];
  private readonly bySlot = new Map<number, PrizeEntity>();
  private readonly gun = new CorkRifle();
  private readonly cam: THREE.PerspectiveCamera;
  private readonly aimTarget = new THREE.Vector3(0, 1.3, -0.55);
  private readonly ray = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.55);
  private aim: [number, number] = [0, 0.05];
  private corks: RemoteCork[] = [];
  private readonly corkGeo = new THREE.CylinderGeometry(0.016, 0.013, 0.042, 10);
  private readonly corkMat = new THREE.MeshStandardMaterial({ color: 0xb58451, roughness: 0.9 });
  private readonly bombMat = new THREE.MeshStandardMaterial({ color: 0xd91414, emissive: 0xff3838, emissiveIntensity: 0.85 });
  private readonly scene: THREE.Scene;
  private readonly offsetX: number;

  constructor(scene: THREE.Scene, offsetX: number, seed: number, name: string) {
    this.scene = scene;
    this.offsetX = offsetX;
    this.stall = new FestivalStall();
    this.group.add(this.stall.group);
    this.stall.titleRifleGroup.visible = false;
    this.stall.lanternLights.forEach((l) => { l.visible = false; });         // 点光源は自分の台だけ(描画の負荷を抑える)
    this.prizes = createAllPrizes(this.stall.shelves);
    shuffleShelfLayout(this.prizes, mulberry32(seed));                        // 自分の台と同じ並び
    this.prizes.forEach((p) => {
      p.reset();
      this.group.add(p.mesh);                                                 // 台と同じ座標系(ローカル)に置く
      this.bySlot.set(p.config.slotId, p);
    });
    this.group.add(this.gun.group);
    this.group.position.x = offsetX;
    scene.add(this.group);
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.castShadow = false; });   // 影は自分の台だけ

    // 持ち主の視点(自分の台と同じカメラ位置)。銃の向きを、持ち主の照準から計算するのに使う
    this.cam = new THREE.PerspectiveCamera(54, 16 / 9, 0.1, 50);
    this.cam.position.set(offsetX, 1.48, 2.15);
    this.cam.lookAt(offsetX, 1.25, -0.6);
    this.cam.updateMatrixWorld(true);

    const label = makeLabel(name, '#ffd9a8');
    label.position.set(0, 3.1, 0.2);
    this.group.add(label);
  }

  public setAim(a: [number, number]): void {
    this.aim = a;
  }

  /** 持ち主から届いた、動いている景品の状態。 */
  public applySnap(list: PrizeSnap[]): void {
    for (const s of list) this.bySlot.get(s[0])?.applyRemote(s[1], s[2], s[3], s[4], s[5], s[6]);
  }

  /** 発砲(座標は持ち主のローカル座標。この台のグループに合わせて x をずらす)。 */
  public addFire(f: FireEvent): void {
    const mesh = new THREE.Mesh(this.corkGeo, f.k === 'b' ? this.bombMat : this.corkMat);
    mesh.position.set(f.o[0] + this.offsetX, f.o[1], f.o[2]);
    const dir = new THREE.Vector3(f.d[0], f.d[1], f.d[2]).normalize();
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.scene.add(mesh);
    this.corks.push({ mesh, vel: dir.multiplyScalar(CORK_SPEED), age: 0 });
    this.gun.fire(this.scene, f.k === 'b');                                   // 反動と硝煙
  }

  public update(dt: number, elapsed: number): void {
    // 銃: 持ち主の照準(NDC)から、狙っている点を求めて向ける
    this.ray.setFromCamera(new THREE.Vector2(this.aim[0], this.aim[1]), this.cam);
    const hit = new THREE.Vector3();
    if (this.ray.ray.intersectPlane(this.plane, hit)) this.aimTarget.copy(hit);
    this.gun.update(dt, elapsed, this.cam, this.aimTarget, true);

    for (let i = this.corks.length - 1; i >= 0; i--) {
      const c = this.corks[i];
      c.age += dt;
      c.vel.y -= 7.0 * dt;
      c.mesh.position.addScaledVector(c.vel, dt);
      const p = c.mesh.position;
      if (c.age > 2.5 || p.y < 0.85 || (p.z < WALL_Z && p.y < WALL_TOP)) {
        this.scene.remove(c.mesh);
        this.corks.splice(i, 1);
      }
    }
  }

  public dispose(): void {
    for (const c of this.corks) this.scene.remove(c.mesh);
    this.corks = [];
    this.gun.reset();
    this.scene.remove(this.group);
    this.corkGeo.dispose();
    this.corkMat.dispose();
    this.bombMat.dispose();
  }
}
