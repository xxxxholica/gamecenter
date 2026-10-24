import * as THREE from 'three';

export interface CarSpecs {
  name: string;
  category: string;
  length: string;
  width: string;
  height: string;
  wheelbase: string;
  drivetrain: string;
  weight: string;
  description: string;
}

const CONTACT_SHADOW_NAME = 'contact_shadow';
let contactShadowMaterial: THREE.MeshBasicMaterial | null = null;

/** 車の下に敷く、ぼかした黒い影(全車で1つの素材を共有する)。影マップとは別に、車が路面に接地している感じを出す。 */
function getContactShadowMaterial(): THREE.MeshBasicMaterial {
  if (contactShadowMaterial) return contactShadowMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.filter = 'blur(14px)';
  ctx.fillStyle = 'rgba(0, 0, 0, 0.92)';
  ctx.beginPath();
  ctx.roundRect(30, 46, 68, 164, 26);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  contactShadowMaterial = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    opacity: 0.8,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return contactShadowMaterial;
}

/** 車の group から車を引く。メニューの背景(GarageScene)が、台座の上の車を見つけるために使う(userData に入れると clone() が壊れる)。 */
export const carByGroup = new WeakMap<THREE.Object3D, CarBase>();

export abstract class CarBase {
  public group: THREE.Group;
  public abstract readonly specs: CarSpecs;

  // Materials
  public bodyMaterial!: THREE.MeshPhysicalMaterial;
  public roofMaterial!: THREE.MeshPhysicalMaterial;
  public glassMaterial!: THREE.MeshPhysicalMaterial;

  public wheels: THREE.Group[] = [];
  /** フロントガラス。一人称視点では完全に消して、素通しで見えるようにする(DriveScene が切り替える) */
  public windshield: THREE.Object3D | null = null;
  /**
   * Everything except the wheels, wrapped so pitch/roll can tilt the body around a pivot at body height while the
   * wheels stay planted on the road (created by initSuspension()).
   */
  public bodyPivot: THREE.Group | null = null;
  /**
   * Yaw each wheel was built with: left wheels are turned by PI so their outer face points outward. Steering must be
   * applied relative to this, otherwise the front wheels end up inside-out (rim, brake and hub facing the car).
   */
  public wheelBaseYaw: number[] = [];
  public lightsEnabled: boolean = true;
  /** コクピット視点時のカメラ位置オフセット [右+, 上+, 前+] */
  public cockpitEyeOffset: THREE.Vector3 = new THREE.Vector3(-0.32, 1.20, -0.16);
  /** コクピット視点時の注視オフセット [右+, 上+, 前+] */
  public cockpitLookOffset: THREE.Vector3 = new THREE.Vector3(0, -0.04, 20.0);

  constructor() {
    this.group = new THREE.Group();
    carByGroup.set(this.group, this);
  }

  private wetBackup: Map<THREE.MeshStandardMaterial, { roughness: number; envMapIntensity: number }> | null = null;

  /** 雨で濡れた塗装: 粗さを下げ、環境の映り込みを強める(ツヤが出て、水を被った感じになる)。 */
  public setWet(wet: boolean): void {
    const mats: THREE.MeshStandardMaterial[] = [this.bodyMaterial, this.roofMaterial, this.glassMaterial].filter(Boolean);
    if (wet === (this.wetBackup !== null)) return;
    if (wet) {
      this.wetBackup = new Map();
      for (const m of mats) {
        this.wetBackup.set(m, { roughness: m.roughness, envMapIntensity: m.envMapIntensity });
        m.roughness = Math.max(0.04, m.roughness * 0.75);   // 濡れてつやは出るが、鏡のようにはしない
        m.envMapIntensity = m.envMapIntensity * 1.25;
      }
    } else {
      this.wetBackup?.forEach((v, m) => { m.roughness = v.roughness; m.envMapIntensity = v.envMapIntensity; });
      this.wetBackup = null;
    }
  }

  public abstract setBodyColor(hex: number): void;

  public abstract setRoofColor(hex: number): void;

  public abstract setLights(enabled: boolean): void;

  /**
   * Splits the model into a body pivot and planted wheels. Rotating the whole car around its ground-level origin sinks
   * the low side into the road as soon as it rolls; tilting only the body around `pivotHeight` does not.
   * Idempotent; keeps every world transform unchanged.
   */
  public initSuspension(pivotHeight: number = 0.5): void {
    if (this.bodyPivot) return;
    const pivot = new THREE.Group();
    pivot.name = 'body_pivot';
    pivot.position.set(0, pivotHeight, 0);
    this.group.add(pivot);
    const wheelSet = new Set<THREE.Object3D>(this.wheels);
    for (const child of [...this.group.children]) {
      if (child === pivot || wheelSet.has(child) || child.name === CONTACT_SHADOW_NAME) continue;   // 接地影は車体の傾きに合わせず、路面に置いたままにする
      if (this.wheels.some((w) => w.parent === child)) {
        // model root that holds the wheels next to the body parts: pull only the body parts out of it
        for (const part of [...child.children]) if (!wheelSet.has(part)) pivot.attach(part);
      } else {
        pivot.attach(child);
      }
    }
    // wheels: steering (Y) is the outer rotation and spin (X) the inner one, otherwise a steered wheel wobbles
    this.wheels.forEach((w) => { w.rotation.order = 'YXZ'; });
    this.wheelBaseYaw = this.wheels.map((w) => w.rotation.y);
    this.bodyPivot = pivot;
  }

  /** 車の下に接地影を置く(幅・長さは車体より少し大きく)。initSuspension() の前に呼ぶこと。 */
  protected addContactShadow(width: number, length: number, centerZ = 0): void {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, length), getContactShadowMaterial());
    mesh.name = CONTACT_SHADOW_NAME;
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, -0.04, centerZ);
    mesh.renderOrder = 2;
    this.group.add(mesh);
  }
}
