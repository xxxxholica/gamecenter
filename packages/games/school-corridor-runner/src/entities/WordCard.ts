import * as THREE from 'three';
import { createWordCardTexture } from '../graphics/Textures';

export class WordCard {
  public mesh: THREE.Mesh;
  public velocity: THREE.Vector3;
  public isDead: boolean = false;
  private distanceTraveled: number = 0;
  private readonly MAX_DISTANCE = 50;

  // 当たり判定
  public boundingBox: THREE.Box3 = new THREE.Box3();

  // 共通ジオメトリ & マテリアル（キャッシュ用）
  private static cardGeo: THREE.BoxGeometry | null = null;
  private static cardMat: THREE.MeshBasicMaterial | null = null;

  constructor(startPos: THREE.Vector3, forwardSpeed: number) {
    if (!WordCard.cardGeo) {
      // 薄い長方形のカード束
      WordCard.cardGeo = new THREE.BoxGeometry(0.8, 0.05, 0.4);
    }
    if (!WordCard.cardMat) {
      const tex = createWordCardTexture();
      WordCard.cardMat = new THREE.MeshBasicMaterial({
        map: tex,
        color: 0xffffff,
      });
    }

    this.mesh = new THREE.Mesh(WordCard.cardGeo, WordCard.cardMat);
    this.mesh.position.copy(startPos);
    if (startPos.y === undefined || isNaN(startPos.y)) {
      this.mesh.position.y = 1.2; // フォールバック高さ
    }

    // 前方に高速直進 (Zマイナス方向)
    this.velocity = new THREE.Vector3(0, 0, -(forwardSpeed + 65));
    this.updateBoundingBox();
  }

  public update(dt: number): void {
    if (this.isDead) return;

    // 前進
    const deltaZ = this.velocity.z * dt;
    this.mesh.position.z += deltaZ;
    this.distanceTraveled += Math.abs(deltaZ);

    // 高速水平スピン（シュリケン風）
    this.mesh.rotation.y += 35 * dt;

    if (this.distanceTraveled >= this.MAX_DISTANCE) {
      this.isDead = true;
    }

    this.updateBoundingBox();
  }

  private updateBoundingBox(): void {
    const p = this.mesh.position;
    this.boundingBox.min.set(p.x - 0.45, p.y - 0.2, p.z - 0.45);
    this.boundingBox.max.set(p.x + 0.45, p.y + 0.2, p.z + 0.45);
  }
}
