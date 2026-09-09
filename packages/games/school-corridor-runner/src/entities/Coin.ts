import * as THREE from 'three';
import { LaneIndex } from '../types';
import { createCoinTexture, createBlurHaloTexture, createMotionBlurStreakTexture } from '../graphics/Textures';

export class Coin {
  public mesh: THREE.Group;
  public boundingBox: THREE.Box3 = new THREE.Box3();
  public isCollected: boolean = false;
  public lane: LaneIndex;
  private baseHeight: number;
  private bobOffset: number;
  private coinGroup: THREE.Group;
  private coinMesh: THREE.Mesh;
  private blurHaloMesh: THREE.Mesh;
  private blurStreakMesh: THREE.Mesh;
  private ghostMesh1: THREE.Mesh;
  private ghostMesh2: THREE.Mesh;

  // 静的ジオメトリ＆マテリアルキャッシュ
  private static coinGeo: THREE.CylinderGeometry | null = null;
  private static coinMaterials: THREE.Material[] | null = null;
  private static haloGeo: THREE.PlaneGeometry | null = null;
  private static haloMat: THREE.MeshBasicMaterial | null = null;
  private static streakGeo: THREE.PlaneGeometry | null = null;
  private static streakMat: THREE.MeshBasicMaterial | null = null;
  private static ghostMat: THREE.MeshBasicMaterial | null = null;

  constructor(x: number, y: number, z: number, lane: LaneIndex) {
    this.lane = lane;
    this.baseHeight = y;
    this.bobOffset = z * 0.25;

    // 1. コイン本体ジオメトリ（直径約48cm、厚み5cmの適切なコインサイズ）
    if (!Coin.coinGeo) {
      Coin.coinGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.05, 32);
    }

    if (!Coin.coinMaterials) {
      const coinTex = createCoinTexture();
      const faceMat = new THREE.MeshStandardMaterial({
        map: coinTex,
        metalness: 0.75,
        roughness: 0.2,
        color: 0xffffff,
        emissive: 0x553300,
      });
      const sideMat = new THREE.MeshStandardMaterial({
        color: 0xffb300,
        metalness: 0.85,
        roughness: 0.2,
      });
      Coin.coinMaterials = [sideMat, faceMat, faceMat];
    }

    // 2. ブラーハロー（柔らかい光のボケ）用
    if (!Coin.haloGeo) {
      Coin.haloGeo = new THREE.PlaneGeometry(0.85, 0.85);
    }
    if (!Coin.haloMat) {
      const haloTex = createBlurHaloTexture();
      Coin.haloMat = new THREE.MeshBasicMaterial({
        map: haloTex,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    // 3. モーションブラー光条用
    if (!Coin.streakGeo) {
      Coin.streakGeo = new THREE.PlaneGeometry(0.22, 1.1);
    }
    if (!Coin.streakMat) {
      const streakTex = createMotionBlurStreakTexture();
      Coin.streakMat = new THREE.MeshBasicMaterial({
        map: streakTex,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    }

    // 4. 回転残像（モーションブラーゴースト）用
    if (!Coin.ghostMat) {
      Coin.ghostMat = new THREE.MeshBasicMaterial({
        color: 0xffd54f,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    }

    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, z);

    // コインの自転グループ
    this.coinGroup = new THREE.Group();

    // コイン本体（直立）
    this.coinMesh = new THREE.Mesh(Coin.coinGeo, Coin.coinMaterials);
    this.coinMesh.rotation.x = Math.PI / 2;
    this.coinMesh.castShadow = true;
    this.coinGroup.add(this.coinMesh);

    // 回転残像（モーションブラーゴーストディスク2枚：少し角度をずらして重ねる）
    this.ghostMesh1 = new THREE.Mesh(Coin.coinGeo, Coin.ghostMat);
    this.ghostMesh1.rotation.x = Math.PI / 2;
    this.ghostMesh1.rotation.y = 0.28; // 角度オフセット
    this.ghostMesh1.scale.set(1.04, 1.0, 1.04);
    this.coinGroup.add(this.ghostMesh1);

    this.ghostMesh2 = new THREE.Mesh(Coin.coinGeo, Coin.ghostMat);
    this.ghostMesh2.rotation.x = Math.PI / 2;
    this.ghostMesh2.rotation.y = -0.28; // 逆角度オフセット
    this.ghostMesh2.scale.set(1.08, 1.0, 1.08);
    this.coinGroup.add(this.ghostMesh2);

    this.mesh.add(this.coinGroup);

    // 5. ふんわりブラー発光ハロー（カメラ方向を向くソフトグロー）
    this.blurHaloMesh = new THREE.Mesh(Coin.haloGeo, Coin.haloMat);
    this.mesh.add(this.blurHaloMesh);

    // 6. 縦方向のモーションブラー光条
    this.blurStreakMesh = new THREE.Mesh(Coin.streakGeo, Coin.streakMat);
    this.mesh.add(this.blurStreakMesh);

    this.updateBoundingBox();
  }

  public update(dt: number, time: number): void {
    if (this.isCollected) {
      // 獲得時のモーションブラー演出（縦に引き伸ばされながら光となって上空へ吸い込まれる）
      this.mesh.position.y += 7.5 * dt;

      // コイン本体は縦長にモーションブラー伸び
      this.coinGroup.scale.y += 8.0 * dt;
      this.coinGroup.scale.x = Math.max(0, this.coinGroup.scale.x - 4.5 * dt);
      this.coinGroup.scale.z = Math.max(0, this.coinGroup.scale.z - 4.5 * dt);
      this.coinGroup.rotation.y += 30 * dt;

      // ブラーハローは一気に大きく拡散してフェードアウト
      this.blurHaloMesh.scale.multiplyScalar(1 + 7.5 * dt);
      (this.blurHaloMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        (this.blurHaloMesh.material as THREE.MeshBasicMaterial).opacity - 3.5 * dt
      );

      // 光条も縦に高速伸張
      this.blurStreakMesh.scale.y += 12.0 * dt;
      (this.blurStreakMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        (this.blurStreakMesh.material as THREE.MeshBasicMaterial).opacity - 4.0 * dt
      );
      return;
    }

    // ふわふわ浮遊運動
    this.mesh.position.y = this.baseHeight + Math.sin(time * 4.8 + this.bobOffset) * 0.08;

    // コイン直立自転（クルクル回転）
    this.coinGroup.rotation.y += 4.5 * dt;

    // ブラーハローの呼吸パルス（柔らかい発光ボケの脈動）
    const pulse = 1.0 + Math.sin(time * 6.0 + this.bobOffset) * 0.14;
    this.blurHaloMesh.scale.set(pulse, pulse, pulse);

    // 縦モーションブラー光条の微細揺らぎ
    this.blurStreakMesh.scale.x = 1.0 + Math.sin(time * 8.0) * 0.15;

    this.updateBoundingBox();
  }

  private updateBoundingBox(): void {
    const p = this.mesh.position;
    this.boundingBox.min.set(p.x - 0.45, p.y - 0.45, p.z - 0.45);
    this.boundingBox.max.set(p.x + 0.45, p.y + 0.45, p.z + 0.45);
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
  }
}
