import * as THREE from 'three';
import { DOHYO_HEIGHT, DOHYO_RADIUS } from '../../../../shared/sumoSim/SimWorld';

/** 土俵の見た目(物理の剛体は、シミュレーション側 shared/sumoSim が持つ)。 */
export class Dohyo {
  public mesh: THREE.Group;
  public readonly radius: number = DOHYO_RADIUS;
  public readonly height: number = DOHYO_HEIGHT;

  // 爆発で付く焦げ跡(その試合のあいだ残る)
  private scorches: THREE.Mesh[] = [];
  private scorchTextures: THREE.CanvasTexture[] = [];
  private static readonly MAX_SCORCHES = 70;

  constructor() {
    this.mesh = new THREE.Group();

    // Three.js メッシュ作成
    this.createDohyoMesh();
  }

  /** 焦げ跡の模様。中心が濃く、縁は不揃いにかすれる */
  private makeScorchTexture(): THREE.CanvasTexture {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const blot = (x: number, y: number, r: number, a: number) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(8,5,3,${a})`);
      g.addColorStop(0.55, `rgba(14,9,5,${a * 0.6})`);
      g.addColorStop(1, 'rgba(14,9,5,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    };
    blot(size / 2, size / 2, size * 0.46, 0.95);
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = size * (0.12 + Math.random() * 0.2);
      blot(size / 2 + Math.cos(a) * d, size / 2 + Math.sin(a) * d, size * (0.12 + Math.random() * 0.14), 0.7);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * 土俵の上に焦げ跡を付ける。pos は爆発の位置(高さは無視)、radius は焦げの大きさ(m)。
   * 土俵の外(半径を超える位置)には付けない。
   */
  public addScorch(pos: THREE.Vector3, radius: number, strength: number = 1) {
    if (Math.hypot(pos.x, pos.z) > this.radius - 0.1) return;

    if (this.scorchTextures.length === 0) {
      for (let i = 0; i < 4; i++) this.scorchTextures.push(this.makeScorchTexture());
    }

    let mesh: THREE.Mesh;
    if (this.scorches.length >= Dohyo.MAX_SCORCHES) {
      // いちばん古い跡を使い回す
      mesh = this.scorches.shift()!;
      this.scorches.push(mesh);
    } else {
      mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        })
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.renderOrder = 1;
      this.mesh.add(mesh);
      this.scorches.push(mesh);
    }

    const mat = mesh.material as THREE.MeshBasicMaterial;
    mat.map = this.scorchTextures[Math.floor(Math.random() * this.scorchTextures.length)];
    mat.opacity = Math.min(1, 0.55 + 0.4 * strength);
    mat.needsUpdate = true;
    const size = radius * 2 * (0.85 + Math.random() * 0.3);
    mesh.scale.set(size, size, 1);
    mesh.position.set(pos.x, 0.015 + this.scorches.length * 0.00015, pos.z);
    mesh.rotation.z = Math.random() * Math.PI * 2;
  }

  /** 焦げ跡を消す(新しい試合の前) */
  public clearScorches() {
    for (const m of this.scorches) {
      this.mesh.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.scorches.length = 0;
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
      color: 0x6f4a2f, // 赤土色
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

    // 背景: 締め固めた赤茶色の土(照明で明るく写るぶん、素の色は暗めにしてある)
    ctx.fillStyle = '#52331c';
    ctx.fillRect(0, 0, size, size);

    // 土のむら(濃い・薄い茶色の斑をたくさん重ねる)
    for (let i = 0; i < 520; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = 14 + Math.random() * 70;
      const dark = Math.random() < 0.55;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, dark ? 'rgba(34,20,9,0.26)' : 'rgba(120,80,46,0.2)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // 砂粒ノイズの描画
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const noise = (Math.random() - 0.5) * 30;
      d[i] = Math.min(255, Math.max(0, d[i] + noise));
      d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + noise * 0.9));
      d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + noise * 0.7));
    }
    ctx.putImageData(imgData, 0, 0);

    const cx = size / 2;
    const cy = size / 2;

    // 円形土俵境界（勝負俵の目安円）
    ctx.strokeStyle = '#33210f';
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cx, cy, (size / 2) * 0.94, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の円(掃かれて、わずかに色が違う)
    ctx.fillStyle = 'rgba(96, 62, 34, 0.14)';
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


