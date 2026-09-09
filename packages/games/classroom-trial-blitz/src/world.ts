import * as THREE from 'three';
import { createWoodTexture, createChalkboardTexture, createFloorTexture } from './textures';

// 外部3Dモデル不使用。Three.js基本プリミティブのみで法廷教室を構築する。
export class CourtroomWorld {
  public scene: THREE.Scene;
  public podium: THREE.Group;
  public defendant: THREE.Group;
  public defendantBase: THREE.Vector3;
  public gavel: THREE.Group;
  public evidenceIcons: THREE.Group;
  public spotlight: THREE.SpotLight;
  public dust: THREE.Points;

  private defendantWobble = 0;
  private evidenceMats: THREE.Material[] = [];
  private disposables: { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] }[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    scene.background = new THREE.Color(0x020203);
    scene.fog = new THREE.Fog(0x020203, 12, 30);

    const floorTex = createFloorTexture();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(40, 40),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);
    this.track(floor.geometry, floor.material);

    // 黒板 + 背後の壁
    const chalkTex = createChalkboardTexture();
    const blackboard = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 4.2),
      new THREE.MeshStandardMaterial({ map: chalkTex, roughness: 0.8 })
    );
    blackboard.position.set(0, 3.2, -8);
    scene.add(blackboard);
    this.track(blackboard.geometry, blackboard.material);

    // 証言台(被告人が立つ台)
    const woodTex = createWoodTexture();
    const standMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.7 });
    const witnessStand = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 1.2), standMat);
    witnessStand.position.set(0, 0.7, -5.5);
    scene.add(witnessStand);
    this.track(witnessStand.geometry);

    // 被告人(直方体+球体の学生モデル)
    this.defendant = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x27324a, roughness: 0.6 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe8b998, roughness: 0.7 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.5, 0.5), bodyMat);
    body.position.y = 2.15;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), skinMat);
    head.position.y = 3.05;
    this.defendant.add(body, head);
    this.defendant.position.set(0, 0, -5.4);
    scene.add(this.defendant);
    this.defendantBase = this.defendant.position.clone();
    this.track(body.geometry, bodyMat);
    this.track(head.geometry, skinMat);

    // 教卓(プレイヤー自身。画面下部に映る)
    this.podium = new THREE.Group();
    const podiumTop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.2, 1.0), standMat);
    podiumTop.position.set(0, 1.0, 0);
    const podiumBody = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.8), standMat);
    podiumBody.position.set(0, 0.5, 0);
    this.podium.add(podiumTop, podiumBody);
    this.podium.position.set(0, 0, 1.6);
    scene.add(this.podium);
    this.track(podiumTop.geometry);
    this.track(podiumBody.geometry);

    // 木槌(ガベル)
    this.gavel = this.buildGavel();
    this.gavel.position.set(2.6, 3.6, -3.5);
    scene.add(this.gavel);

    // 浮遊する証拠品アイコン(抽象的な結晶体で表現)
    this.evidenceIcons = new THREE.Group();
    const iconColors = [0xffe600, 0xff1a1a, 0xffffff];
    for (let i = 0; i < 5; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: iconColors[i % iconColors.length],
        emissive: iconColors[i % iconColors.length],
        emissiveIntensity: 0.3,
        roughness: 0.3,
      });
      const icon = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), mat);
      const angle = (i / 5) * Math.PI * 2;
      icon.position.set(Math.cos(angle) * 3.2, 2.4 + Math.sin(i) * 0.4, Math.sin(angle) * 3.2 - 5);
      this.evidenceIcons.add(icon);
      this.evidenceMats.push(mat);
      this.track(icon.geometry, mat);
    }
    scene.add(this.evidenceIcons);

    // 照明
    this.spotlight = new THREE.SpotLight(0xffffff, 220, 30, Math.PI / 6, 0.4, 1.2);
    this.spotlight.position.set(0, 10, -3);
    this.spotlight.target.position.set(0, 1.5, -5.5);
    scene.add(this.spotlight, this.spotlight.target);

    const ambient = new THREE.AmbientLight(0x223344, 1.2);
    scene.add(ambient);
    const rim = new THREE.PointLight(0xff2b2b, 30, 20);
    rim.position.set(-4, 3, -2);
    scene.add(rim);

    // 光の埃パーティクル
    const dustCount = 200;
    const positions = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 1] = Math.random() * 6;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 14 - 4;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0xfff2c0, size: 0.03, transparent: true, opacity: 0.5 });
    this.dust = new THREE.Points(dustGeo, dustMat);
    scene.add(this.dust);
    this.track(dustGeo, dustMat);
  }

  private buildGavel(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.6 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10), mat);
    handle.rotation.z = Math.PI / 2.4;
    handle.position.set(-0.3, 0.2, 0);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.55, 14), mat);
    head.rotation.z = Math.PI / 2;
    head.position.set(0.45, 0.45, 0);
    g.add(handle, head);
    this.track(handle.geometry);
    this.track(head.geometry, mat);
    return g;
  }

  private track(geometry?: THREE.BufferGeometry, material?: THREE.Material | THREE.Material[]): void {
    this.disposables.push({ geometry, material });
  }

  public updateIdle(dt: number, titleMode: boolean): void {
    this.evidenceIcons.rotation.y += dt * 0.4;
    for (const child of this.evidenceIcons.children) {
      child.rotation.x += dt * 0.8;
      child.rotation.y += dt * 0.6;
    }
    if (titleMode) {
      this.gavel.rotation.y += dt * 0.6;
    }

    const dustPos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dustPos.count; i++) {
      let y = dustPos.getY(i) + dt * 0.15;
      if (y > 6) y = 0;
      dustPos.setY(i, y);
    }
    dustPos.needsUpdate = true;

    // 被告人の震え(常時)
    this.defendantWobble += dt * 9;
    this.defendant.position.x = this.defendantBase.x + Math.sin(this.defendantWobble) * 0.02;
  }

  // 撃破時のノックバック演出(黒板に激突)
  public defendantKnockback(): void {
    this.defendant.position.z = this.defendantBase.z - 0.6;
  }

  public defendantReset(): void {
    this.defendant.position.copy(this.defendantBase);
  }

  public disposeAll(): void {
    for (const d of this.disposables) {
      d.geometry?.dispose();
      if (Array.isArray(d.material)) {
        d.material.forEach((m) => m.dispose());
      } else {
        d.material?.dispose();
      }
    }
    this.disposables = [];
  }
}
