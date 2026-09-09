import * as THREE from 'three';
import {
  createDictionaryCoverTexture,
  createBookPagesTexture,
} from '../graphics/Textures';

export class DictionaryBomb {
  public mesh: THREE.Mesh;
  public velocity: THREE.Vector3;
  public isExploded: boolean = false;
  private readonly GRAVITY = -32;
  public blastRadius: number = 4.8; // 爆発半径

  public boundingBox: THREE.Box3 = new THREE.Box3();

  private static bombGeo: THREE.BoxGeometry | null = null;
  private static bombMaterials: THREE.Material[] | null = null;

  constructor(startPos: THREE.Vector3, forwardSpeed: number) {
    if (!DictionaryBomb.bombGeo) {
      // 重厚な大判百科事典 (幅1.0m, 厚さ0.35m, 奥行き1.2m)
      DictionaryBomb.bombGeo = new THREE.BoxGeometry(1.0, 0.35, 1.2);
    }
    if (!DictionaryBomb.bombMaterials) {
      const coverTex = createDictionaryCoverTexture();
      const pagesTex = createBookPagesTexture();

      const coverMat = new THREE.MeshStandardMaterial({
        map: coverTex,
        roughness: 0.3,
        metalness: 0.35,
      });

      const pagesMat = new THREE.MeshStandardMaterial({
        map: pagesTex,
        roughness: 0.7,
      });

      // 各面のマテリアル [右, 左, 上, 下, 前, 後]
      DictionaryBomb.bombMaterials = [
        pagesMat,  // 右小口
        coverMat,  // 背表紙
        coverMat,  // 表紙（上）
        coverMat,  // 裏表紙（下）
        pagesMat,  // 前小口
        pagesMat,  // 後小口
      ];
    }

    this.mesh = new THREE.Mesh(DictionaryBomb.bombGeo, DictionaryBomb.bombMaterials);
    this.mesh.position.copy(startPos);
    if (startPos.y === undefined || isNaN(startPos.y)) {
      this.mesh.position.y = 1.4;
    }

    // 放物線軌道: 上方向と前方向の合成初速
    this.velocity = new THREE.Vector3(
      0,
      10.5, // 縦の放物線
      -(forwardSpeed + 42) // 前方スピード
    );

    this.updateBoundingBox();
  }

  public update(dt: number): boolean {
    if (this.isExploded) return true;

    // 重力
    this.velocity.y += this.GRAVITY * dt;

    this.mesh.position.x += this.velocity.x * dt;
    this.mesh.position.y += this.velocity.y * dt;
    this.mesh.position.z += this.velocity.z * dt;

    // 縦回転（豪快にタンブリング）
    this.mesh.rotation.x += 16 * dt;
    this.mesh.rotation.z += 6 * dt;

    this.updateBoundingBox();

    // 床に着弾したら爆発
    if (this.mesh.position.y <= 0.35) {
      this.mesh.position.y = 0.35;
      this.isExploded = true;
      return true;
    }

    return false;
  }

  private updateBoundingBox(): void {
    const p = this.mesh.position;
    this.boundingBox.min.set(p.x - 0.7, p.y - 0.4, p.z - 0.7);
    this.boundingBox.max.set(p.x + 0.7, p.y + 0.4, p.z + 0.7);
  }
}
