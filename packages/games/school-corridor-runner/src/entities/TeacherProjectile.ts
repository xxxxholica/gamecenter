import * as THREE from 'three';

export class TeacherProjectile {
  public mesh: THREE.Group;
  public velocity: THREE.Vector3;
  public isDead: boolean = false;
  public boundingBox: THREE.Box3 = new THREE.Box3();

  private static bookGeo: THREE.BoxGeometry | null = null;
  private static bookMat: THREE.MeshStandardMaterial | null = null;
  private static spineMat: THREE.MeshStandardMaterial | null = null;

  constructor(startPos: THREE.Vector3) {
    this.mesh = new THREE.Group();

    if (!TeacherProjectile.bookGeo) {
      // 出席簿（緑色の大型バインダー）
      TeacherProjectile.bookGeo = new THREE.BoxGeometry(0.8, 0.1, 0.6);
      TeacherProjectile.bookMat = new THREE.MeshStandardMaterial({
        color: 0x1b5e20, // 深緑色出席簿
        roughness: 0.5,
      });
      TeacherProjectile.spineMat = new THREE.MeshStandardMaterial({
        color: 0xffd54f, // 金色金具・背表紙
        metalness: 0.6,
      });
    }

    const book = new THREE.Mesh(TeacherProjectile.bookGeo!, TeacherProjectile.bookMat!);
    this.mesh.add(book);

    // 金色の出席簿クリップ・背表紙
    const clip = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.12, 0.1), TeacherProjectile.spineMat!);
    clip.position.set(0, 0, -0.26);
    this.mesh.add(clip);

    this.mesh.position.copy(startPos);
    this.mesh.position.y = 1.4; // 先生の手・胸の高さから投擲

    // プレイヤーに向かって手前（+Z方向）へ飛ぶ
    // プレイヤーも-Zへ走っているため、相対速度で急激に迫る
    this.velocity = new THREE.Vector3(0, 0, 20.0);

    this.updateBoundingBox();
  }

  public update(dt: number, playerZ: number): void {
    if (this.isDead) return;

    this.mesh.position.z += this.velocity.z * dt;

    // 縦回転しながら飛ぶ
    this.mesh.rotation.x += 18 * dt;
    this.mesh.rotation.y += 6 * dt;

    this.updateBoundingBox();

    // プレイヤーより後方に大きく抜けたら消滅
    if (this.mesh.position.z > playerZ + 15) {
      this.isDead = true;
    }
  }

  private updateBoundingBox(): void {
    const p = this.mesh.position;
    this.boundingBox.min.set(p.x - 0.45, p.y - 0.35, p.z - 0.45);
    this.boundingBox.max.set(p.x + 0.45, p.y + 0.35, p.z + 0.45);
  }
}
