import * as THREE from 'three';
import type { CarBase } from '../models/CarBase';
import { TrailJModel } from '../models/TrailJModel';
import { CrossJModel } from '../models/CrossJModel';
import { TruckJModel } from '../models/TruckJModel';
import type { CarSpec, CarState } from '../../../../shared/netProtocol';

/** 受信した姿勢を、この時間だけ遅らせて補間表示する(ネットワークの揺らぎを吸収する)。 */
const INTERP_DELAY_MS = 120;
/** 古いスナップショットは捨てる。 */
const KEEP_MS = 1500;
/** この時間以上更新が来ない車は「通信途絶」とみなして当たり判定から外す。 */
export const STALE_MS = 1500;

export function createCarModel(type: string): CarBase {
  if (type === 'cross_j') return new CrossJModel();
  if (type === 'truck_j') return new TruckJModel();
  return new TrailJModel();
}

interface Snapshot {
  t: number;
  s: CarState;
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

  private snaps: Snapshot[] = [];
  private lastRecv = 0;

  constructor(id: number, name: string, spec: CarSpec, night: boolean) {
    this.id = id;
    this.name = name;
    this.color = spec.body;
    this.car = createCarModel(spec.type);
    this.car.setBodyColor(spec.body);
    this.car.setRoofColor(spec.roof);
    this.car.initSuspension();
    this.car.setLights(night);
    this.car.group.visible = false;
    this.label = makeLabel(name, spec.body);
    this.car.group.add(this.label);
  }

  public push(s: CarState, now = performance.now()): void {
    this.snaps.push({ t: now, s });
    this.lastRecv = now;
    while (this.snaps.length > 2 && now - this.snaps[0].t > KEEP_MS) this.snaps.shift();
  }

  public get stale(): boolean {
    return performance.now() - this.lastRecv > STALE_MS;
  }

  public update(now = performance.now()): void {
    const sn = this.snaps;
    if (sn.length === 0) return;
    const rt = now - INTERP_DELAY_MS;
    let a = sn[0], b = sn[0];
    for (let i = 0; i < sn.length; i++) {
      if (sn[i].t <= rt) a = sn[i];
      if (sn[i].t >= rt) { b = sn[i]; break; }
      b = sn[i];
    }
    const u = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
    const A = a.s, B = b.s;
    const lerp = (i: number) => A[i] + (B[i] - A[i]) * u;
    // 角度差を最短(-π..π)に直す。while ループだと巨大な値(1e300 など)で値が変わらず無限ループになり、ブラウザが固まるため剰余で正規化する
    let d = (B[3] - A[3]) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    this.pos.set(lerp(0), lerp(1), lerp(2));
    this.rotY = A[3] + d * u;
    this.speed = lerp(4);
    this.progress = B[9];
    this.valid = true;

    const g = this.car.group;
    g.visible = true;
    g.position.copy(this.pos);
    g.rotation.set(lerp(7), this.rotY, 0, 'YXZ');        // 7: 路面の勾配
    this.car.bodyPivot?.rotation.set(0, 0, lerp(6));       // 6: ボディのロール
    const steer = lerp(5);
    const wheels = this.car.wheels;
    if (wheels && wheels.length >= 4) {
      const base = this.car.wheelBaseYaw;
      wheels.forEach((w, i) => {
        w.rotation.x = 0;
        w.rotation.y = (base[i] ?? 0) + (i < 2 ? steer : 0);
      });
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
