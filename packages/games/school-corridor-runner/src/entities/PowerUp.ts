import * as THREE from 'three';
import { LaneIndex } from '../types';
import {
  createPowerUpCoreTexture,
  createPowerUpHaloTexture,
  createPowerUpBeamTexture,
} from '../graphics/Textures';

/**
 * 無敵パワーアップ（青き稲妻オーラ）
 * 1回のゲームで2回だけ出現する超レアアイテム。
 * 取得すると10秒間、あらゆる障害物・攻撃を「触れるだけで破壊」できる無敵状態になる。
 */
export class PowerUp {
  public mesh: THREE.Group;
  public boundingBox: THREE.Box3 = new THREE.Box3();
  public isCollected: boolean = false;
  public lane: LaneIndex;

  private baseHeight: number;
  private bobOffset: number;
  private collectTimer: number = 0;

  private coreGroup: THREE.Group;
  private ring1: THREE.Mesh;
  private ring2: THREE.Mesh;
  private ring3: THREE.Mesh;
  private haloMesh: THREE.Mesh;
  private outerHaloMesh: THREE.Mesh;
  private beamMesh1: THREE.Mesh;
  private beamMesh2: THREE.Mesh;
  private sparkOrbs: { mesh: THREE.Mesh; radius: number; speed: number; angleOffset: number; heightSpeed: number }[] = [];
  private light: THREE.PointLight;

  // 静的ジオメトリ＆マテリアルキャッシュ
  private static coreGeo: THREE.IcosahedronGeometry | null = null;
  private static coreMat: THREE.MeshStandardMaterial | null = null;
  private static wireGeo: THREE.IcosahedronGeometry | null = null;
  private static wireMat: THREE.MeshBasicMaterial | null = null;
  private static ringGeo: THREE.TorusGeometry | null = null;
  private static ringMatCyan: THREE.MeshBasicMaterial | null = null;
  private static ringMatBlue: THREE.MeshBasicMaterial | null = null;
  private static ringMatWhite: THREE.MeshBasicMaterial | null = null;
  private static haloGeo: THREE.PlaneGeometry | null = null;
  private static haloMat: THREE.MeshBasicMaterial | null = null;
  private static outerHaloMat: THREE.MeshBasicMaterial | null = null;
  private static beamGeo: THREE.PlaneGeometry | null = null;
  private static beamMat: THREE.MeshBasicMaterial | null = null;
  private static sparkGeo: THREE.SphereGeometry | null = null;
  private static sparkMat: THREE.MeshBasicMaterial | null = null;

  constructor(x: number, y: number, z: number, lane: LaneIndex) {
    this.lane = lane;
    this.baseHeight = y;
    this.bobOffset = z * 0.3;

    // 1. コア球体（正二十面体・発光ジオメトリ）
    if (!PowerUp.coreGeo) {
      PowerUp.coreGeo = new THREE.IcosahedronGeometry(0.4, 1);
    }
    if (!PowerUp.coreMat) {
      const coreTex = createPowerUpCoreTexture();
      PowerUp.coreMat = new THREE.MeshStandardMaterial({
        map: coreTex,
        emissive: 0x2979ff,
        emissiveMap: coreTex,
        emissiveIntensity: 1.8,
        color: 0xffffff,
        roughness: 0.15,
        metalness: 0.2,
      });
    }

    // 2. 外周の電光ワイヤーフレーム殻
    if (!PowerUp.wireGeo) {
      PowerUp.wireGeo = new THREE.IcosahedronGeometry(0.52, 0);
    }
    if (!PowerUp.wireMat) {
      PowerUp.wireMat = new THREE.MeshBasicMaterial({
        color: 0x80d8ff,
        wireframe: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }

    // 3. 3本のジャイロ回転リング（トーラス）
    if (!PowerUp.ringGeo) {
      PowerUp.ringGeo = new THREE.TorusGeometry(0.68, 0.032, 8, 40);
    }
    if (!PowerUp.ringMatCyan) {
      PowerUp.ringMatCyan = new THREE.MeshBasicMaterial({
        color: 0x18ffff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    if (!PowerUp.ringMatBlue) {
      PowerUp.ringMatBlue = new THREE.MeshBasicMaterial({
        color: 0x2979ff,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }
    if (!PowerUp.ringMatWhite) {
      PowerUp.ringMatWhite = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }

    // 4. ソフトブラーハロー（内側・外側の二重発光）
    if (!PowerUp.haloGeo) {
      PowerUp.haloGeo = new THREE.PlaneGeometry(1.1, 1.1);
    }
    if (!PowerUp.haloMat) {
      const haloTex = createPowerUpHaloTexture();
      PowerUp.haloMat = new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }
    if (!PowerUp.outerHaloMat) {
      const haloTex = createPowerUpHaloTexture();
      PowerUp.outerHaloMat = new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.4,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    // 5. 天へ伸びる光柱ビーム（クロスプレーン）
    if (!PowerUp.beamGeo) {
      PowerUp.beamGeo = new THREE.PlaneGeometry(0.5, 5.5);
    }
    if (!PowerUp.beamMat) {
      const beamTex = createPowerUpBeamTexture();
      PowerUp.beamMat = new THREE.MeshBasicMaterial({
        map: beamTex,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    // 6. 周回する光の粒子（オービットスパーク）
    if (!PowerUp.sparkGeo) {
      PowerUp.sparkGeo = new THREE.SphereGeometry(0.055, 8, 8);
    }
    if (!PowerUp.sparkMat) {
      PowerUp.sparkMat = new THREE.MeshBasicMaterial({
        color: 0xe1f5ff,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }

    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);

    // コアグループ（自転・パルス対象）
    this.coreGroup = new THREE.Group();
    const coreMesh = new THREE.Mesh(PowerUp.coreGeo, PowerUp.coreMat);
    this.coreGroup.add(coreMesh);
    const wireMesh = new THREE.Mesh(PowerUp.wireGeo, PowerUp.wireMat);
    this.coreGroup.add(wireMesh);
    this.mesh.add(this.coreGroup);

    // 3本のジャイロリング（それぞれ異なる軸・異なる初期角度）
    this.ring1 = new THREE.Mesh(PowerUp.ringGeo, PowerUp.ringMatCyan.clone());
    this.ring1.rotation.x = Math.PI / 2;
    this.mesh.add(this.ring1);

    this.ring2 = new THREE.Mesh(PowerUp.ringGeo, PowerUp.ringMatBlue.clone());
    this.ring2.rotation.y = Math.PI / 3;
    this.mesh.add(this.ring2);

    this.ring3 = new THREE.Mesh(PowerUp.ringGeo, PowerUp.ringMatWhite.clone());
    this.ring3.rotation.x = Math.PI / 3.2;
    this.ring3.rotation.z = Math.PI / 4;
    this.mesh.add(this.ring3);

    // ハロー（内・外）
    this.haloMesh = new THREE.Mesh(PowerUp.haloGeo, PowerUp.haloMat);
    this.mesh.add(this.haloMesh);

    this.outerHaloMesh = new THREE.Mesh(PowerUp.haloGeo, PowerUp.outerHaloMat);
    this.outerHaloMesh.scale.set(1.9, 1.9, 1.9);
    this.mesh.add(this.outerHaloMesh);

    // 光柱ビーム（十字配置の2枚）
    this.beamMesh1 = new THREE.Mesh(PowerUp.beamGeo, PowerUp.beamMat.clone());
    this.beamMesh1.position.y = 2.0;
    this.mesh.add(this.beamMesh1);

    this.beamMesh2 = new THREE.Mesh(PowerUp.beamGeo, PowerUp.beamMat.clone());
    this.beamMesh2.position.y = 2.0;
    this.beamMesh2.rotation.y = Math.PI / 2;
    this.mesh.add(this.beamMesh2);

    // 周回スパーク（6個・異なる半径と速度）
    for (let i = 0; i < 6; i++) {
      const sparkMesh = new THREE.Mesh(PowerUp.sparkGeo, PowerUp.sparkMat);
      this.mesh.add(sparkMesh);
      this.sparkOrbs.push({
        mesh: sparkMesh,
        radius: 0.65 + (i % 3) * 0.12,
        speed: 2.2 + (i % 4) * 0.6,
        angleOffset: (i / 6) * Math.PI * 2,
        heightSpeed: 1.5 + i * 0.3,
      });
    }

    // 動的ポイントライト（周囲の廊下を青く照らす）
    this.light = new THREE.PointLight(0x2979ff, 3.5, 9, 2);
    this.light.position.set(0, 0, 0);
    this.mesh.add(this.light);

    this.updateBoundingBox();
  }

  public update(dt: number, time: number): void {
    if (this.isCollected) {
      // 獲得演出: 眩い閃光とともに全パーツが爆発的に拡散してフェードアウト
      this.collectTimer += dt;

      this.coreGroup.scale.multiplyScalar(1 + 9.0 * dt);
      this.coreGroup.rotation.y += 25 * dt;

      for (const ring of [this.ring1, this.ring2, this.ring3]) {
        ring.scale.multiplyScalar(1 + 6.5 * dt);
        const mat = ring.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - 2.6 * dt);
      }

      this.haloMesh.scale.multiplyScalar(1 + 11 * dt);
      (this.haloMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        (this.haloMesh.material as THREE.MeshBasicMaterial).opacity - 3.2 * dt
      );
      this.outerHaloMesh.scale.multiplyScalar(1 + 8 * dt);
      (this.outerHaloMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        (this.outerHaloMesh.material as THREE.MeshBasicMaterial).opacity - 1.6 * dt
      );

      const beamMat1 = this.beamMesh1.material as THREE.MeshBasicMaterial;
      const beamMat2 = this.beamMesh2.material as THREE.MeshBasicMaterial;
      beamMat1.opacity = Math.max(0, beamMat1.opacity - 2.5 * dt);
      beamMat2.opacity = Math.max(0, beamMat2.opacity - 2.5 * dt);

      for (const spark of this.sparkOrbs) {
        spark.mesh.position.multiplyScalar(1 + 12 * dt);
        const mat = spark.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, mat.opacity - 3.5 * dt);
      }

      this.light.intensity = Math.max(0, this.light.intensity - 14 * dt);

      return;
    }

    // ふわふわ浮遊運動（コインより速く・大きく）
    this.mesh.position.y = this.baseHeight + Math.sin(time * 2.6 + this.bobOffset) * 0.16;

    // コアの自転 & 呼吸パルス
    this.coreGroup.rotation.y += 2.2 * dt;
    this.coreGroup.rotation.x = Math.sin(time * 1.3) * 0.3;
    const pulse = 1.0 + Math.sin(time * 5.0 + this.bobOffset) * 0.09;
    this.coreGroup.scale.set(pulse, pulse, pulse);

    // 3本のジャイロリングをそれぞれ異なる軸・速度で回転
    this.ring1.rotation.z += dt * 1.8;
    this.ring2.rotation.x += dt * 2.3;
    this.ring3.rotation.y += dt * 1.5;

    // ハローの脈動
    const haloPulse = 1.0 + Math.sin(time * 4.0 + this.bobOffset) * 0.18;
    this.haloMesh.scale.set(haloPulse, haloPulse, haloPulse);
    const outerPulse = 1.9 + Math.sin(time * 1.6 + this.bobOffset) * 0.25;
    this.outerHaloMesh.scale.set(outerPulse, outerPulse, outerPulse);

    // 光柱ビームがゆっくり明滅
    const beamPulse = 0.45 + Math.sin(time * 3.0) * 0.15;
    (this.beamMesh1.material as THREE.MeshBasicMaterial).opacity = beamPulse;
    (this.beamMesh2.material as THREE.MeshBasicMaterial).opacity = beamPulse;

    // 周回スパークの軌道運動
    for (const spark of this.sparkOrbs) {
      const angle = time * spark.speed + spark.angleOffset;
      spark.mesh.position.set(
        Math.cos(angle) * spark.radius,
        Math.sin(time * spark.heightSpeed + spark.angleOffset) * 0.35,
        Math.sin(angle) * spark.radius
      );
    }

    // ポイントライトの明滅
    this.light.intensity = 3.0 + Math.sin(time * 6.0) * 0.8;

    this.updateBoundingBox();
  }

  /**
   * 獲得演出が完了し、シーンから完全に取り除いてよい状態か
   */
  public isGone(): boolean {
    return this.isCollected && this.collectTimer > 0.55;
  }

  private updateBoundingBox(): void {
    const p = this.mesh.position;
    this.boundingBox.min.set(p.x - 0.55, p.y - 0.55, p.z - 0.55);
    this.boundingBox.max.set(p.x + 0.55, p.y + 0.55, p.z + 0.55);
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }
}
