import * as THREE from 'three';
import { mergeMeshesByMaterial } from './mergeMeshes';

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
  public plasticMaterial!: THREE.MeshStandardMaterial;
  public chromeMaterial!: THREE.MeshStandardMaterial;
  public silverMaterial!: THREE.MeshStandardMaterial;
  public tireMaterial!: THREE.MeshStandardMaterial;
  public wheelMaterial!: THREE.MeshStandardMaterial;
  public wheelSilverMaterial!: THREE.MeshStandardMaterial;
  public brakeDiscMaterial!: THREE.MeshStandardMaterial;
  public caliperMaterial!: THREE.MeshStandardMaterial;
  public headlightEmissive!: THREE.MeshStandardMaterial;
  public taillightEmissive!: THREE.MeshStandardMaterial;
  public amberEmissive!: THREE.MeshStandardMaterial;
  public interiorMaterial!: THREE.MeshStandardMaterial;

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
  /** [meshes before, after] the draw-call merge in initSuspension(). */
  public meshStats: { body: [number, number]; wheels: [number, number][] } | null = null;
  public lightsEnabled: boolean = true;
  /** Skip draw-call mesh merge in initSuspension (for GLB models with existing clean hierarchies/materials) */
  public skipMeshMerge: boolean = false;
  /** コクピット視点時のカメラ位置オフセット [右+, 上+, 前+] */
  public cockpitEyeOffset: THREE.Vector3 = new THREE.Vector3(-0.32, 1.20, -0.16);
  /** コクピット視点時の注視オフセット [右+, 上+, 前+] */
  public cockpitLookOffset: THREE.Vector3 = new THREE.Vector3(0, -0.04, 20.0);

  constructor() {
    this.group = new THREE.Group();
    carByGroup.set(this.group, this);
    this.initMaterials();
  }

  protected initMaterials(): void {
    // 1. High-end car paint (glossy deep clearcoat)
    this.bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xf7b731,
      metalness: 0.45,
      roughness: 0.1,
      clearcoat: 1.0,
      clearcoatRoughness: 0.015,
      ior: 1.52,
      reflectivity: 0.9,
      // 昼の反射の強さ(DriveScene.applyPaintEnvironment が素材の envMap に反映する。envMapIntensity は素材に envMap が無いと効かない)
      userData: { skyEnv: 1.7, skyEnvNight: 1.3 },
    });

    // 2. 2-tone roof paint (glossy contrast)
    this.roofMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x1e272e,
      metalness: 0.3,
      roughness: 0.12,
      clearcoat: 1.0,
      clearcoatRoughness: 0.015,
      ior: 1.52,
      userData: { skyEnv: 1.7, skyEnvNight: 1.3 },
    });

    // 3. Automotive High-Transmission Crystal Clear Glass
    this.glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.0,
      roughness: 0.0,
      // transmission は 0 にする。0より大きいと、three.js は画面内の不透明な物をすべて、もう1回別の描画先へ描き直す
      // (透過用の描画)。計測で、描画回数も三角形数も約4割減った。透け感は opacity で出す。
      transmission: 0,
      thickness: 0.02,
      ior: 1.5,
      reflectivity: 0.5,
      clearcoat: 1.0,
      clearcoatRoughness: 0.0,
      transparent: true,
      opacity: 0.10, // 白く濁る問題を解消し、クリスタルクリアな高い透明度に調整
      depthWrite: false,
      side: THREE.DoubleSide,
      userData: { skyEnv: 1.5, skyEnvNight: 1.2 },
    });

    // 4. Matte black unpainted resin
    this.plasticMaterial = new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.85,
      metalness: 0.05,
    });

    // 5. Metallic Chrome
    this.chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xe0e0e0,
      metalness: 0.95,
      roughness: 0.08,
      userData: { skyEnv: 1.8, skyEnvNight: 1.3 },
    });

    // 6. Silver metallic (Skid plates, accents)
    this.silverMaterial = new THREE.MeshStandardMaterial({
      color: 0xd2d7df,
      metalness: 0.8,
      roughness: 0.22,
      userData: { skyEnv: 1.5, skyEnvNight: 1.2 },
    });

    // 7. Tire Rubber (Deep matte charcoal black)
    this.tireMaterial = new THREE.MeshStandardMaterial({
      color: 0x16181b,
      roughness: 0.92,
      metalness: 0.05,
    });

    // 8. Wheel Rim Dark Gunmetal Alloy
    this.wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x22262e,
      roughness: 0.25,
      metalness: 0.85,
    });

    // 8b. Wheel Rim Bright Machined Silver
    this.wheelSilverMaterial = new THREE.MeshStandardMaterial({
      color: 0xecf0f1,
      roughness: 0.18,
      metalness: 0.92,
    });

    // 9. Brake Disc (Drilled cast iron)
    this.brakeDiscMaterial = new THREE.MeshStandardMaterial({
      color: 0x95a5a6,
      roughness: 0.3,
      metalness: 0.92,
    });

    // 10. Brake Caliper (Sporty Racing Red)
    this.caliperMaterial = new THREE.MeshStandardMaterial({
      color: 0xe74c3c,
      roughness: 0.25,
      metalness: 0.5,
    });

    // 11. Headlight Emissive LED
    this.headlightEmissive = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffff,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });

    // 12. Taillight Emissive Red
    this.taillightEmissive = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff0000,
      emissiveIntensity: 2.0,
      roughness: 0.2,
    });

    // 13. Amber turn signal
    this.amberEmissive = new THREE.MeshStandardMaterial({
      color: 0xff9f1a,
      emissive: 0xff9f1a,
      emissiveIntensity: 1.5,
      roughness: 0.2,
    });

    // 14. Interior
    this.interiorMaterial = new THREE.MeshStandardMaterial({
      color: 0x15171c,
      roughness: 0.9,
      metalness: 0.1,
    });
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
        m.roughness = Math.max(0.04, m.roughness * 0.5);
        m.envMapIntensity = m.envMapIntensity * 1.7;
      }
    } else {
      this.wetBackup?.forEach((v, m) => { m.roughness = v.roughness; m.envMapIntensity = v.envMapIntensity; });
      this.wetBackup = null;
    }
  }

  public setBodyColor(hex: number): void {
    this.bodyMaterial.color.setHex(hex);
  }

  public setRoofColor(hex: number): void {
    this.roofMaterial.color.setHex(hex);
  }

  public setLights(enabled: boolean): void {
    this.lightsEnabled = enabled;
    const hIntensity = enabled ? 2.5 : 0.0;
    const tIntensity = enabled ? 2.0 : 0.0;
    const aIntensity = enabled ? 1.5 : 0.0;

    this.headlightEmissive.emissiveIntensity = hIntensity;
    this.taillightEmissive.emissiveIntensity = tIntensity;
    this.amberEmissive.emissiveIntensity = aIntensity;
  }

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

    // hundreds of tiny meshes -> a few dozen (draw calls dominate the frame time)
    if (!this.skipMeshMerge) {
      this.meshStats = { body: mergeMeshesByMaterial(pivot), wheels: this.wheels.map((w) => mergeMeshesByMaterial(w)) };
    }
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

  /**
   * 4本のロードホイール(createDetailedWheel のオフロード仕様)を前後・左右に置き、this.wheels に入れる。
   * ホイールの面(+X)が外を向くよう、右(x > 0)は rotation.y = 0、左(x < 0)は rotation.y = PI。
   */
  protected addRoadWheels(carRoot: THREE.Object3D, trackWidth: number, frontZ: number, rearZ: number, radius: number, width: number): void {
    this.wheels = [];
    for (const z of [frontZ, rearZ]) {
      for (const isLeft of [true, false]) {
        const wheel = this.createDetailedWheel(radius, width, radius * 0.58, 8, true);
        wheel.position.set(isLeft ? -trackWidth / 2 : trackWidth / 2, radius + 0.01, z);
        wheel.rotation.y = isLeft ? Math.PI : 0;
        this.wheels.push(wheel);
        carRoot.add(wheel);
      }
    }
  }

  /**
   * Builds an authentic, wide, highly visible ALLOY WHEEL & TIRE assembly.
   * Ensures the wheel rim, spokes, hub and brake disc are fully exposed on the outside!
   */
  protected createDetailedWheel(
    radius: number,
    width: number,
    rimRadius: number,
    spokeCount: number = 8,
    isOffroad: boolean = false,
    includeBrakes: boolean = true
  ): THREE.Group {
    const wheelGroup = new THREE.Group();

    // ==========================================
    // 1. TIRE (Hollow rubber doughnut)
    // ==========================================
    // Main tread barrel (open-ended cylinder)
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 36, 1, true);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, this.tireMaterial);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    // Outer & Inner Sidewalls: ONLY covers between rimRadius and radius!
    // Leaves rimRadius completely HOLLOW for the wheel to shine!
    const outerWallGeo = new THREE.RingGeometry(rimRadius, radius, 36);
    outerWallGeo.rotateY(Math.PI / 2);

    const outerWall = new THREE.Mesh(outerWallGeo, this.tireMaterial);
    outerWall.position.x = width / 2;
    outerWall.castShadow = true;
    wheelGroup.add(outerWall);

    const innerWall = new THREE.Mesh(outerWallGeo, this.tireMaterial);
    innerWall.position.x = -width / 2;
    innerWall.rotation.y = Math.PI;   // 外壁と同じ面(YZ平面)のまま内側へ向ける。-π/2 だと直角に立ってしまう
    wheelGroup.add(innerWall);

    // Rounded shoulder curves (Toruses on tread edges)
    const shoulderThickness = 0.025;
    const shoulderGeo = new THREE.TorusGeometry(radius - shoulderThickness, shoulderThickness, 12, 36);
    shoulderGeo.rotateY(Math.PI / 2);

    const outerShoulder = new THREE.Mesh(shoulderGeo, this.tireMaterial);
    outerShoulder.position.x = width / 2;
    wheelGroup.add(outerShoulder);

    const innerShoulder = new THREE.Mesh(shoulderGeo, this.tireMaterial);
    innerShoulder.position.x = -width / 2;
    wheelGroup.add(innerShoulder);

    // Tread Blocks (chunky 3D tread pattern)
    if (isOffroad) {
      const blockGeo = new THREE.BoxGeometry(width * 0.44, 0.025, 0.045);
      for (let i = 0; i < 24; i++) {
        const angle = (i / 24) * Math.PI * 2;
        const blockL = new THREE.Mesh(blockGeo, this.tireMaterial);
        blockL.position.set(-width * 0.22, Math.sin(angle) * (radius + 0.01), Math.cos(angle) * (radius + 0.01));
        blockL.rotation.order = 'XYZ';
        blockL.rotation.x = -angle;
        blockL.rotation.y = 0.2;
        wheelGroup.add(blockL);

        const blockR = new THREE.Mesh(blockGeo, this.tireMaterial);
        blockR.position.set(width * 0.22, Math.sin(angle + 0.13) * (radius + 0.01), Math.cos(angle + 0.13) * (radius + 0.01));
        blockR.rotation.order = 'XYZ';
        blockR.rotation.x = -(angle + 0.13);
        blockR.rotation.y = -0.2;
        wheelGroup.add(blockR);
      }
    } else {
      const ribGeo = new THREE.TorusGeometry(radius + 0.005, 0.010, 8, 36);
      ribGeo.rotateY(Math.PI / 2);
      [-width * 0.22, 0, width * 0.22].forEach((xOff) => {
        const rib = new THREE.Mesh(ribGeo, this.tireMaterial);
        rib.position.x = xOff;
        wheelGroup.add(rib);
      });
    }

    // ==========================================
    // 2. ALLOY WHEEL (Pronounced Machined Metal)
    // ==========================================
    const faceX = width / 2 - 0.01; // Sits right at the outer surface!

    // A. Bright Polished Aluminum Outer Rim Lip
    const outerLipGeo = new THREE.TorusGeometry(rimRadius, 0.018, 12, 36);
    outerLipGeo.rotateY(Math.PI / 2);
    const outerLip = new THREE.Mesh(outerLipGeo, this.wheelSilverMaterial);
    outerLip.position.x = width / 2;
    wheelGroup.add(outerLip);

    // Inner rim barrel
    const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.98, 36, 1, true);
    barrelGeo.rotateZ(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, this.wheelMaterial);
    wheelGroup.add(barrel);

    // B. Prominent Center Hub
    const hubRadius = rimRadius * 0.36;
    const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius * 1.05, 0.04, 20);
    hubGeo.rotateZ(Math.PI / 2);
    const hub = new THREE.Mesh(hubGeo, this.wheelMaterial);
    hub.position.x = faceX - 0.01;
    wheelGroup.add(hub);

    // Center Cap with Shiny Chrome Accent
    const capGeo = new THREE.CylinderGeometry(hubRadius * 0.45, hubRadius * 0.45, 0.02, 16);
    capGeo.rotateZ(Math.PI / 2);
    const cap = new THREE.Mesh(capGeo, this.chromeMaterial);
    cap.position.x = faceX + 0.005;
    wheelGroup.add(cap);

    // 5 Chrome Hexagonal Lug Nuts
    const nutGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.02, 6);
    nutGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const nut = new THREE.Mesh(nutGeo, this.chromeMaterial);
      nut.position.set(
        faceX + 0.005,
        Math.sin(angle) * (hubRadius * 0.68),
        Math.cos(angle) * (hubRadius * 0.68)
      );
      wheelGroup.add(nut);
    }

    // C. Bright Machined Alloy Spokes (Bold & Highly Visible!)
    const spokeSpan = rimRadius - hubRadius;
    for (let i = 0; i < spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2;
      const midR = hubRadius + spokeSpan * 0.5;

      const spokeGroup = new THREE.Group();
      spokeGroup.position.set(faceX, Math.sin(angle) * midR, Math.cos(angle) * midR);
      spokeGroup.rotation.x = angle;

      // Dark gunmetal spoke body
      const sBodyGeo = new THREE.BoxGeometry(0.025, spokeSpan, 0.045);
      const sBody = new THREE.Mesh(sBodyGeo, this.wheelMaterial);
      spokeGroup.add(sBody);

      // Bright Machined Silver Face on the outside!
      const sFaceGeo = new THREE.BoxGeometry(0.008, spokeSpan * 0.98, 0.038);
      const sFace = new THREE.Mesh(sFaceGeo, this.wheelSilverMaterial);
      sFace.position.x = 0.012; // Raised outside!
      spokeGroup.add(sFace);

      wheelGroup.add(spokeGroup);
    }

    // ==========================================
    // 3. BRAKE DISC & RACING CALIPER (Road Wheels only!)
    // ==========================================
    if (includeBrakes) {
      // Visible right through the spokes!
      const discRadius = rimRadius * 0.80;
      const discGeo = new THREE.CylinderGeometry(discRadius, discRadius, 0.02, 32);
      discGeo.rotateZ(Math.PI / 2);
      const disc = new THREE.Mesh(discGeo, this.brakeDiscMaterial);
      disc.position.x = faceX - 0.04;
      wheelGroup.add(disc);

      // Big Racing Red Caliper
      const caliperGeo = new THREE.BoxGeometry(0.05, discRadius * 0.44, discRadius * 0.36);
      const caliper = new THREE.Mesh(caliperGeo, this.caliperMaterial);
      caliper.position.set(faceX - 0.025, discRadius * 0.62, 0);
      caliper.castShadow = true;
      wheelGroup.add(caliper);
    }

    return wheelGroup;
  }

  /**
   * Builds an authentic Kei-Truck PRESSED STEEL WHEEL (Techin wheel).
   * Features deep steel rim lip, curved dish face, 8 circular vent holes,
   * central black hub dust cap, and 4 lug nuts.
   */
  protected createSteelWheel(
    radius: number = 0.28,
    width: number = 0.16,
    rimRadius: number = 0.165,
    isSilver: boolean = true,
    includeBrakes: boolean = true
  ): THREE.Group {
    const wheelGroup = new THREE.Group();
    const steelMat = isSilver ? this.silverMaterial : this.wheelMaterial;

    // 1. Commercial Heavy-Duty Tire
    const tireGeo = new THREE.CylinderGeometry(radius, radius, width, 32, 1, true);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMesh = new THREE.Mesh(tireGeo, this.tireMaterial);
    tireMesh.castShadow = true;
    wheelGroup.add(tireMesh);

    // Sidewalls
    const wallGeo = new THREE.RingGeometry(rimRadius, radius, 32);
    wallGeo.rotateY(Math.PI / 2);

    const outerWall = new THREE.Mesh(wallGeo, this.tireMaterial);
    outerWall.position.x = width / 2;
    outerWall.castShadow = true;
    wheelGroup.add(outerWall);

    const innerWall = new THREE.Mesh(wallGeo, this.tireMaterial);
    innerWall.position.x = -width / 2;
    innerWall.rotation.y = Math.PI;   // 外壁と同じ面(YZ平面)のまま内側へ向ける。-π/2 だと直角に立ってしまう
    wheelGroup.add(innerWall);

    // Rounded shoulders
    const shoulderThickness = 0.02;
    const shoulderGeo = new THREE.TorusGeometry(radius - shoulderThickness, shoulderThickness, 10, 32);
    shoulderGeo.rotateY(Math.PI / 2);

    const outerShoulder = new THREE.Mesh(shoulderGeo, this.tireMaterial);
    outerShoulder.position.x = width / 2;
    wheelGroup.add(outerShoulder);

    const innerShoulder = new THREE.Mesh(shoulderGeo, this.tireMaterial);
    innerShoulder.position.x = -width / 2;
    wheelGroup.add(innerShoulder);

    // Chunky Commercial Tread Ribs
    [-width * 0.25, 0, width * 0.25].forEach((xOff) => {
      const ribGeo = new THREE.TorusGeometry(radius + 0.004, 0.008, 8, 32);
      ribGeo.rotateY(Math.PI / 2);
      const rib = new THREE.Mesh(ribGeo, this.tireMaterial);
      rib.position.x = xOff;
      wheelGroup.add(rib);
    });

    // 2. Pressed Steel Rim & Dish
    const faceX = width / 2 - 0.015;

    // Outer Rolled Rim Lip
    const lipGeo = new THREE.TorusGeometry(rimRadius, 0.014, 10, 32);
    lipGeo.rotateY(Math.PI / 2);
    const lip = new THREE.Mesh(lipGeo, steelMat);
    lip.position.x = width / 2;
    wheelGroup.add(lip);

    // Rim inner barrel
    const barrelGeo = new THREE.CylinderGeometry(rimRadius, rimRadius, width * 0.95, 32, 1, true);
    barrelGeo.rotateZ(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, this.wheelMaterial);
    wheelGroup.add(barrel);

    // Pressed Steel Dish Face (Inverted cone with circular press stamping)
    const dishRadius = rimRadius * 0.92;
    const dishGeo = new THREE.CylinderGeometry(dishRadius * 0.45, dishRadius, 0.035, 24);
    dishGeo.rotateZ(Math.PI / 2);
    const dish = new THREE.Mesh(dishGeo, steelMat);
    dish.position.x = faceX - 0.015;
    wheelGroup.add(dish);

    // 8 Circular Cooling / Weight-reduction Vent Holes
    const holeRadius = 0.015;
    const holeOrbitR = rimRadius * 0.65;
    const holeGeo = new THREE.CylinderGeometry(holeRadius, holeRadius, 0.04, 16);
    holeGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const hole = new THREE.Mesh(holeGeo, this.interiorMaterial);
      hole.position.set(
        faceX - 0.012,
        Math.sin(angle) * holeOrbitR,
        Math.cos(angle) * holeOrbitR
      );
      wheelGroup.add(hole);
    }

    // Central Raised Hub Boss
    const hubR = rimRadius * 0.38;
    const hubBossGeo = new THREE.CylinderGeometry(hubR, hubR * 1.05, 0.025, 20);
    hubBossGeo.rotateZ(Math.PI / 2);
    const hubBoss = new THREE.Mesh(hubBossGeo, steelMat);
    hubBoss.position.x = faceX - 0.005;
    wheelGroup.add(hubBoss);

    // Central Dust Cap (Matte black commercial cap)
    const dustCapGeo = new THREE.CylinderGeometry(hubR * 0.45, hubR * 0.45, 0.025, 16);
    dustCapGeo.rotateZ(Math.PI / 2);
    const dustCap = new THREE.Mesh(dustCapGeo, this.plasticMaterial);
    dustCap.position.x = faceX + 0.01;
    wheelGroup.add(dustCap);

    // 4 Chrome Hexagonal Lug Nuts (4-Lug PCD100)
    const nutGeo = new THREE.CylinderGeometry(0.010, 0.010, 0.02, 6);
    nutGeo.rotateZ(Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const nut = new THREE.Mesh(nutGeo, this.chromeMaterial);
      nut.position.set(
        faceX + 0.005,
        Math.sin(angle) * (hubR * 0.70),
        Math.cos(angle) * (hubR * 0.70)
      );
      wheelGroup.add(nut);
    }

    // Brake Disc inside wheel (only for road wheels)
    if (includeBrakes) {
      const discGeo = new THREE.CylinderGeometry(rimRadius * 0.75, rimRadius * 0.75, 0.018, 24);
      discGeo.rotateZ(Math.PI / 2);
      const disc = new THREE.Mesh(discGeo, this.brakeDiscMaterial);
      disc.position.x = faceX - 0.045;
      wheelGroup.add(disc);
    }

    return wheelGroup;
  }

  /**
   * Helper to create a Japanese Kei-Car license plate ("TRAIL J" or "CROSS J")
   */
  protected createLicensePlate(text: string, isYellowLightPlate: boolean = true): THREE.Group {
    const group = new THREE.Group();
    const plateGeo = new THREE.BoxGeometry(0.33, 0.165, 0.01);

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = isYellowLightPlate ? '#f1c40f' : '#ffffff';
    ctx.fillRect(0, 0, 256, 128);

    ctx.lineWidth = 8;
    ctx.strokeStyle = '#1e272e';
    ctx.strokeRect(6, 6, 244, 116);

    ctx.fillStyle = '#1e272e';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('軽 580', 128, 36);

    ctx.font = 'bold 42px monospace';
    ctx.fillText(text, 128, 92);

    const plateTex = new THREE.CanvasTexture(canvas);
    plateTex.colorSpace = THREE.SRGBColorSpace;

    const plateMat = new THREE.MeshStandardMaterial({
      map: plateTex,
      roughness: 0.4,
      metalness: 0.2,
      // 近くの面と同じ深さになってもナンバーが勝つ(角度によるちらつき・めり込み見えの防止)
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    group.add(plate);

    return group;
  }
}
