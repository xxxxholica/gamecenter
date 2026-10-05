import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { PhysicsWorld } from '../physics/PhysicsWorld';

export class Dohyo {
  public mesh: THREE.Group;
  public body: CANNON.Body;
  public readonly radius: number = 9.2;
  public readonly height: number = 1.2;

  constructor(physics: PhysicsWorld) {
    this.mesh = new THREE.Group();

    // 1. 土俵の剛体（円柱）
    // Cannon-es の Cylinder は、Z軸方向またはY軸方向の向きに注意
    // CANNON.Cylinder(radiusTop, radiusBottom, height, numSegments)
    const cylinderShape = new CANNON.Cylinder(this.radius, this.radius + 0.9, this.height, 32);
    this.body = new CANNON.Body({
      mass: 0, // 静的剛体（動かない）
      material: physics.dohyoMaterial,
      position: new CANNON.Vec3(0, -this.height / 2, 0),
    });
    this.body.addShape(cylinderShape);
    physics.world.addBody(this.body);

    // 2. Three.js メッシュ作成
    this.createDohyoMesh();
  }

  private createDohyoMesh() {
    // 土俵台座（わずかに台形の円柱）
    const geometry = new THREE.CylinderGeometry(this.radius, this.radius + 0.9, this.height, 64);
    
    // プロシージャル土俵テクスチャ（砂地・仕切り線・俵サークル）
    const texture = this.createDohyoTexture();
    const matTop = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.78,
      metalness: 0.02,
    });

    const matSide = new THREE.MeshStandardMaterial({
      color: 0xba855f, // 明るく温かみのある赤土色
      roughness: 0.82,
    });

    // 円柱の上面・側面・下面マテリアル
    const materials = [matSide, matTop, matSide];
    const baseMesh = new THREE.Mesh(geometry, materials);
    baseMesh.position.y = -this.height / 2;
    baseMesh.receiveShadow = true;
    baseMesh.castShadow = true;
    this.mesh.add(baseMesh);

    // 勝負俵（円周に並ぶ藁俵のリング）
    this.createTawaraRing();

    // 土俵下の装飾フロア（場外・客席フロア: 伝統の千歳緑アリーナフロアで土俵が鮮やかに映える）
    const floorGeo = new THREE.PlaneGeometry(120, 120);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x25352b,
      roughness: 0.85,
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.y = -this.height - 3.0; // 土俵より十分に下
    floorMesh.receiveShadow = true;
    this.mesh.add(floorMesh);

  }


  /**
   * キャンバスを使って土俵上面のリアルなテクスチャを自動生成
   */
  private createDohyoTexture(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 背景: 明るく清潔感のある美しい砂土ベージュ
    ctx.fillStyle = '#dcbe9b';
    ctx.fillRect(0, 0, size, size);

    // 砂粒ノイズの描画
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 22;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise * 0.9));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise * 0.7));
    }
    ctx.putImageData(imgData, 0, 0);

    const cx = size / 2;
    const cy = size / 2;

    // 円形土俵境界（勝負俵の目安円）
    ctx.strokeStyle = '#85583b';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, (size / 2) * 0.94, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の円（掃き清められた清浄な円）
    ctx.fillStyle = 'rgba(255, 242, 220, 0.28)';
    ctx.beginPath();
    ctx.arc(cx, cy, (size / 2) * 0.92, 0, Math.PI * 2);
    ctx.fill();

    // 中央の仕切り線（二本の白線）
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 5;
    const lineWidth = 20;
    const lineLength = 220;
    const lineGap = 160;

    // 東（左）側白線
    ctx.fillRect(cx - lineGap / 2 - lineWidth, cy - lineLength / 2, lineWidth, lineLength);
    // 西（右）側白線
    ctx.fillRect(cx + lineGap / 2, cy - lineLength / 2, lineWidth, lineLength);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * 円周に配置する勝負俵（藁俵の3Dディテール）
   */
  private createTawaraRing() {
    const numTawaras = 48;
    const tawaraRadius = this.radius * 0.94;
    const tawaraGeo = new THREE.CylinderGeometry(0.22, 0.22, 1.25, 12);
    const tawaraMat = new THREE.MeshStandardMaterial({
      color: 0xe5ba55, // 黄金色に輝く藁俵
      roughness: 0.85,
    });

    const ringGroup = new THREE.Group();
    for (let i = 0; i < numTawaras; i++) {
      const angle = (i / numTawaras) * Math.PI * 2;
      const x = Math.cos(angle) * tawaraRadius;
      const z = Math.sin(angle) * tawaraRadius;

      // 4か所の徳俵（少し外側に飛び出している俵）
      const isTokudawara = i % 12 === 0;
      const r = isTokudawara ? tawaraRadius + 0.18 : tawaraRadius;
      const px = Math.cos(angle) * r;
      const pz = Math.sin(angle) * r;

      const mesh = new THREE.Mesh(tawaraGeo, tawaraMat);
      mesh.position.set(px, 0.05, pz);
      mesh.rotation.y = -angle + Math.PI / 2;
      mesh.rotation.z = Math.PI / 2;
      mesh.castShadow = true;
      ringGroup.add(mesh);
    }
    this.mesh.add(ringGroup);
  }

    // 柱や梁は視界を遮るため撤廃（現代の大相撲・吊り屋根同様、視界を完全クリアに）
}


