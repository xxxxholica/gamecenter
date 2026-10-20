import * as THREE from 'three';
import type { CarBase } from '../models/CarBase';
import { DragonCarModel } from '../models/DragonCarModel';
import type { CarSpec, CarState } from '../../../../shared/netProtocol';
import { RemoteTrack } from './remoteTrack';

/** この時間以上更新が来ない車は「通信途絶」とみなして当たり判定から外す。 */
export const STALE_MS = 1500;

/** ドラゴン・カーの翼・尻尾の振幅を速度で変えるときの基準速度(m/s)。 */
const DRAGON_REF_SPEED = 42;

export function createCarModel(type: string): CarBase {
  if (type === 'dragon_b') return new DragonCarModel('b');
  if (type === 'dragon_c') return new DragonCarModel('c');
  return new DragonCarModel('a');
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
    this.car = createCarModel(spec.type);
    this.car.setBodyColor(spec.body);
    this.car.setRoofColor(spec.roof);
    this.car.initSuspension();
    this.car.setLights(true);
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

  public update(now = performance.now()): void {
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
    g.position.copy(this.pos);
    g.rotation.set(p.pitch, this.rotY, 0, 'YXZ');      // 路面の勾配
    this.car.bodyPivot?.rotation.set(0, 0, p.roll);     // ボディのロール
    const steer = p.steer;
    const wheels = this.car.wheels;
    if (wheels && wheels.length >= 4) {
      const base = this.car.wheelBaseYaw;
      wheels.forEach((w, i) => {
        w.rotation.x = 0;
        w.rotation.y = (base[i] ?? 0) + (i < 2 ? steer : 0);
      });
    }
    // ドラゴン・カーの角・翼・尻尾(FK)
    if (this.car instanceof DragonCarModel) {
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
  g.font = '900 28px "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';
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
