import * as THREE from 'three';
import {
  createExplosionFireballTexture,
  createExplosionShockwaveTexture,
  createExplosionSmokeTexture,
  createExplosionScorchTexture,
} from './Textures';

interface PaperDebris {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface CrumblePiece {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotSpeed: THREE.Vector3;
  groundY: number;
  bounces: number;
  life: number;
  maxLife: number;
}

interface SparkParticle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  color: THREE.Color;
  size: number;
  life: number;
  maxLife: number;
}

interface BlurRing {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface ExplosionFireball {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
}

interface ExplosionShockwave {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
}

interface ExplosionSmokePuff {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  rotSpeed: number;
  life: number;
  maxLife: number;
  startScale: number;
  endScale: number;
}

interface ExplosionScorchMark {
  mesh: THREE.Mesh;
  life: number;
  maxLife: number;
}

interface ExplosionLight {
  light: THREE.PointLight;
  life: number;
  maxLife: number;
  startIntensity: number;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private camera?: THREE.Camera;

  // 1. 紙片（百科事典ボム爆発用: 薄いBox）
  private paperDebrisList: PaperDebris[] = [];
  private paperGeometry: THREE.BoxGeometry;
  private paperMaterials: THREE.MeshLambertMaterial[];

  // 2. 障害物崩壊パーツ（破壊されたオブジェクトの分解＆物理落下）
  private crumblePieces: CrumblePiece[] = [];
  private rubbleGeometries: THREE.BoxGeometry[] = [];
  private rubbleMaterials: THREE.MeshStandardMaterial[] = [];

  // 3. 火花・煙・破片（Pointsベースの軽量バッファ）
  private sparkParticles: SparkParticle[] = [];
  private sparkPoints: THREE.Points;
  private sparkGeometry: THREE.BufferGeometry;
  private sparkPositions: Float32Array;
  private sparkColors: Float32Array;
  private sparkSizes: Float32Array;
  private readonly MAX_SPARKS = 800;

  // 4. スピードライン（高速移動演出）
  private speedLines: THREE.LineSegments;
  private speedLineGeometry: THREE.BufferGeometry;
  private speedLinePositions: Float32Array;
  private readonly SPEED_LINE_COUNT = 80;

  // 5. コイン獲得ブラーリング
  private blurRings: BlurRing[] = [];
  private ringGeometry: THREE.RingGeometry;
  private ringMaterial: THREE.MeshBasicMaterial;

  // 6. 着弾地点の3D爆発エフェクト（ファイアボール、衝撃波、噴煙、焦げ跡、閃光ライト）
  private explosionFireballs: ExplosionFireball[] = [];
  private explosionShockwaves: ExplosionShockwave[] = [];
  private explosionSmokePuffs: ExplosionSmokePuff[] = [];
  private explosionScorchMarks: ExplosionScorchMark[] = [];
  private explosionLights: ExplosionLight[] = [];

  private fireballGeometry: THREE.SphereGeometry;
  private fireballCoreMaterial: THREE.MeshBasicMaterial;
  private fireballOuterMaterial: THREE.MeshBasicMaterial;
  private shockwaveGeometry: THREE.PlaneGeometry;
  private shockwaveMaterial: THREE.MeshBasicMaterial;
  private smokeGeometry: THREE.PlaneGeometry;
  private smokeMaterial: THREE.MeshBasicMaterial;
  private scorchGeometry: THREE.PlaneGeometry;
  private scorchMaterial: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene, camera?: THREE.Camera) {
    this.scene = scene;
    this.camera = camera;

    // 紙片用ジオメトリ＆マテリアル（白、クリーム、金箔の紙）
    this.paperGeometry = new THREE.BoxGeometry(0.35, 0.02, 0.45);
    this.paperMaterials = [
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      new THREE.MeshLambertMaterial({ color: 0xfffae0 }),
      new THREE.MeshLambertMaterial({ color: 0xffe082 }),
      new THREE.MeshLambertMaterial({ color: 0x90caf9 }),
    ];

    // 瓦礫・崩壊片用ジオメトリ＆マテリアル
    this.rubbleGeometries = [
      new THREE.BoxGeometry(0.35, 0.25, 0.35),
      new THREE.BoxGeometry(0.55, 0.12, 0.3),
      new THREE.BoxGeometry(0.2, 0.45, 0.2),
    ];
    this.rubbleMaterials = [
      new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 0.8 }), // 木片・机
      new THREE.MeshStandardMaterial({ color: 0x546e7a, metalness: 0.6, roughness: 0.4 }), // スチール
      new THREE.MeshStandardMaterial({ color: 0xc59b6d, roughness: 0.9 }), // 段ボール
      new THREE.MeshStandardMaterial({ color: 0xfbc02d, roughness: 0.5 }), // イエロー塗装
      new THREE.MeshStandardMaterial({ color: 0xd0d8dc, metalness: 0.8, roughness: 0.3 }), // ステンレス
    ];

    // 火花パーティクル初期化
    this.sparkGeometry = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.MAX_SPARKS * 3);
    this.sparkColors = new Float32Array(this.MAX_SPARKS * 3);
    this.sparkSizes = new Float32Array(this.MAX_SPARKS);

    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    this.sparkGeometry.setAttribute('color', new THREE.BufferAttribute(this.sparkColors, 3));
    this.sparkGeometry.setAttribute('size', new THREE.BufferAttribute(this.sparkSizes, 1));

    // 火花用の円形キャンバステクスチャ作成
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 64;
    pCanvas.height = 64;
    const pCtx = pCanvas.getContext('2d')!;
    const pGrad = pCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    pGrad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    pGrad.addColorStop(0.3, 'rgba(255, 200, 100, 0.8)');
    pGrad.addColorStop(0.7, 'rgba(255, 80, 0, 0.3)');
    pGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 64, 64);
    const particleTex = new THREE.CanvasTexture(pCanvas);

    const sparkMat = new THREE.PointsMaterial({
      size: 0.8,
      vertexColors: true,
      map: particleTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.sparkPoints = new THREE.Points(this.sparkGeometry, sparkMat);
    this.scene.add(this.sparkPoints);

    // スピードライン初期化
    this.speedLinePositions = new Float32Array(this.SPEED_LINE_COUNT * 2 * 3);
    this.speedLineGeometry = new THREE.BufferGeometry();
    this.speedLineGeometry.setAttribute('position', new THREE.BufferAttribute(this.speedLinePositions, 3));
    const speedLineMat = new THREE.LineBasicMaterial({
      color: 0xffd54f,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
    });
    this.speedLines = new THREE.LineSegments(this.speedLineGeometry, speedLineMat);
    this.scene.add(this.speedLines);
    this.resetSpeedLines(0);

    // コインブラーリング用
    this.ringGeometry = new THREE.RingGeometry(0.35, 0.75, 32);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    // 6. 着弾地点3D爆発用アセット初期化
    this.fireballGeometry = new THREE.SphereGeometry(1.0, 16, 12);
    const fireballTex = createExplosionFireballTexture();
    this.fireballCoreMaterial = new THREE.MeshBasicMaterial({
      map: fireballTex,
      color: 0xffffff,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.fireballOuterMaterial = new THREE.MeshBasicMaterial({
      map: fireballTex,
      color: 0xff7711,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.shockwaveGeometry = new THREE.PlaneGeometry(1.0, 1.0);
    const shockwaveTex = createExplosionShockwaveTexture();
    this.shockwaveMaterial = new THREE.MeshBasicMaterial({
      map: shockwaveTex,
      color: 0xffb74d,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.smokeGeometry = new THREE.PlaneGeometry(1.0, 1.0);
    const smokeTex = createExplosionSmokeTexture();
    this.smokeMaterial = new THREE.MeshBasicMaterial({
      map: smokeTex,
      color: 0x3e322a,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.scorchGeometry = new THREE.PlaneGeometry(4.2, 4.2);
    const scorchTex = createExplosionScorchTexture();
    this.scorchMaterial = new THREE.MeshBasicMaterial({
      map: scorchTex,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }

  /**
   * 百科事典ボム飛翔中の火花＆煙トレイル
   */
  public spawnBombTrail(pos: THREE.Vector3): void {
    if (this.sparkParticles.length >= this.MAX_SPARKS) return;

    for (let i = 0; i < 3; i++) {
      const pPos = pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.4
      ));
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.5 + 0.5,
        Math.random() * 1.5
      );
      this.sparkParticles.push({
        position: pPos,
        velocity: vel,
        color: new THREE.Color(0xffa726),
        size: 0.9 + Math.random() * 0.6,
        life: 0,
        maxLife: 0.25 + Math.random() * 0.15,
      });
    }
  }

  /**
   * 百科事典ボムの着弾地点3D巨大爆発
   * 画面フラッシュではなく、着弾したワールド座標で3Dプラズマ爆炎球体、衝撃波、噴煙、閃光ライト、焦げ跡が発生！
   */
  public spawnBombExplosion(pos: THREE.Vector3, cameraPos: THREE.Vector3): void {
    // 1. 着弾地点の動的ポイントライト（周囲の廊下壁・床・障害物を強烈に照らし出す局所閃光）
    const light = new THREE.PointLight(0xff9e1b, 16, 24);
    light.position.set(pos.x, Math.max(0.6, pos.y), pos.z);
    this.scene.add(light);
    this.explosionLights.push({
      light,
      life: 0,
      maxLife: 0.36,
      startIntensity: 16,
    });

    // 2. 着弾地点の3Dファイアボール（プラズマ爆炎球体）
    // (A) 白熱コア球体
    const coreMesh = new THREE.Mesh(this.fireballGeometry, this.fireballCoreMaterial.clone());
    coreMesh.position.copy(pos);
    this.scene.add(coreMesh);
    this.explosionFireballs.push({
      mesh: coreMesh,
      life: 0,
      maxLife: 0.22,
      startScale: 0.6,
      endScale: 4.0,
      startOpacity: 1.0,
    });

    // (B) 灼熱ブラスト球体（外縁火炎）
    const outerMesh = new THREE.Mesh(this.fireballGeometry, this.fireballOuterMaterial.clone());
    outerMesh.position.copy(pos);
    outerMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(outerMesh);
    this.explosionFireballs.push({
      mesh: outerMesh,
      life: 0,
      maxLife: 0.38,
      startScale: 1.0,
      endScale: 5.8,
      startOpacity: 0.95,
    });

    // 3. 衝撃波ブラストウェーブ
    // (A) 床面を疾走する水平衝撃波リング
    const floorWaveMesh = new THREE.Mesh(this.shockwaveGeometry, this.shockwaveMaterial.clone());
    floorWaveMesh.position.set(pos.x, Math.max(0.04, Math.min(pos.y, 0.4)), pos.z);
    floorWaveMesh.rotation.x = -Math.PI / 2;
    this.scene.add(floorWaveMesh);
    this.explosionShockwaves.push({
      mesh: floorWaveMesh,
      life: 0,
      maxLife: 0.38,
      startScale: 1.0,
      endScale: 8.5,
      startOpacity: 1.0,
    });

    // (B) 空間に広がる立体衝撃波リング
    const airWaveMesh = new THREE.Mesh(this.shockwaveGeometry, this.shockwaveMaterial.clone());
    airWaveMesh.position.copy(pos);
    airWaveMesh.rotation.set(Math.PI / 4, (Math.random() - 0.5) * 0.8, 0);
    this.scene.add(airWaveMesh);
    this.explosionShockwaves.push({
      mesh: airWaveMesh,
      life: 0,
      maxLife: 0.32,
      startScale: 0.8,
      endScale: 6.8,
      startOpacity: 0.85,
    });

    // 4. 着弾地点から噴き上がる黒煙・噴煙クラウド（もくもくと立ち上る圧倒的ボリューム）
    const numSmokes = 14;
    for (let s = 0; s < numSmokes; s++) {
      const sMesh = new THREE.Mesh(this.smokeGeometry, this.smokeMaterial.clone());
      const offset = new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.9
      );
      sMesh.position.copy(pos).add(offset);
      sMesh.rotation.z = Math.random() * Math.PI * 2;
      this.scene.add(sMesh);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.8,
        2.4 + Math.random() * 3.6,
        (Math.random() - 0.5) * 4.8
      );

      this.explosionSmokePuffs.push({
        mesh: sMesh,
        velocity: vel,
        rotSpeed: (Math.random() - 0.5) * 2.5,
        life: 0,
        maxLife: 0.75 + Math.random() * 0.4,
        startScale: 0.9 + Math.random() * 0.5,
        endScale: 3.6 + Math.random() * 1.5,
      });
    }

    // 5. 床の焦げ跡デカール（着弾痕・炭化クレーター）
    if (pos.y < 2.5) {
      const scorchMesh = new THREE.Mesh(this.scorchGeometry, this.scorchMaterial.clone());
      scorchMesh.position.set(pos.x, 0.02, pos.z);
      scorchMesh.rotation.x = -Math.PI / 2;
      scorchMesh.rotation.z = Math.random() * Math.PI * 2;
      this.scene.add(scorchMesh);
      this.explosionScorchMarks.push({
        mesh: scorchMesh,
        life: 0,
        maxLife: 4.5,
      });
    }

    // 6. 辞書の飛び散る無数の紙片（爆心から四方八方に吹っ飛ぶページ）
    const numPapers = 70;
    for (let i = 0; i < numPapers; i++) {
      const mat = this.paperMaterials[Math.floor(Math.random() * this.paperMaterials.length)];
      const mesh = new THREE.Mesh(this.paperGeometry, mat);
      mesh.position.copy(pos);
      mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2
      );

      // カメラ方向にも飛び散るようなベクトル
      const toCamera = new THREE.Vector3().subVectors(cameraPos, pos).normalize();
      const randomDir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5 + 0.5,
        (Math.random() - 0.5) * 2
      ).normalize();

      // カメラ方向への勢いを強めにブレンド
      const velocity = randomDir.multiplyScalar(15 + Math.random() * 20).add(
        toCamera.multiplyScalar(8 + Math.random() * 15)
      );

      const rotSpeed = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15
      );

      this.scene.add(mesh);
      this.paperDebrisList.push({
        mesh,
        velocity,
        rotSpeed,
        life: 0,
        maxLife: 1.5 + Math.random() * 1.0,
      });
    }

    // 7. 爆炎・火花スパーク（約220個・猛烈な拡散）
    for (let i = 0; i < 220; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 1.8 + 0.8,
        (Math.random() - 0.5) * 2
      ).normalize();
      const speed = 14 + Math.random() * 28;

      const color = new THREE.Color().setHSL(0.08 + Math.random() * 0.08, 1, 0.6 + Math.random() * 0.4);

      this.sparkParticles.push({
        position: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.2,
          (Math.random() - 0.5) * 1.2
        )),
        velocity: dir.multiplyScalar(speed),
        color,
        size: 1.3 + Math.random() * 1.6,
        life: 0,
        maxLife: 0.65 + Math.random() * 0.65,
      });
    }
  }

  /**
   * 障害物の物理崩壊エフェクト
   * 破壊された障害物の全構成パーツが重力に従ってバラバラに分解し、床にガラガラと崩れ落ちる
   */
  public spawnObstacleCrumble(group: THREE.Group, isBomb: boolean = false): void {
    group.updateMatrixWorld(true);

    const centerPos = new THREE.Vector3();
    group.getWorldPosition(centerPos);

    // 1. 障害物内部の全メッシュを個別パーツとして抽出・物理崩壊化
    group.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && mesh.geometry) {
        // 赤矢印予告デカールなどは崩壊対象外
        if (mesh.geometry.type === 'PlaneGeometry' && (mesh.material as THREE.Material)?.transparent) {
          return;
        }

        const worldPos = new THREE.Vector3();
        const worldQuat = new THREE.Quaternion();
        const worldScale = new THREE.Vector3();
        mesh.getWorldPosition(worldPos);
        mesh.getWorldQuaternion(worldQuat);
        mesh.getWorldScale(worldScale);

        // パーツのメッシュを作成
        const piece = new THREE.Mesh(mesh.geometry.clone(), mesh.material);
        piece.position.copy(worldPos);
        piece.quaternion.copy(worldQuat);
        piece.scale.copy(worldScale);

        // 中心からの外向きベクトル
        const outward = new THREE.Vector3().subVectors(worldPos, centerPos).normalize();
        if (outward.lengthSq() < 0.01) {
          outward.set((Math.random() - 0.5) * 2, 1.0, (Math.random() - 0.5) * 2).normalize();
        }

        const hForce = isBomb ? (6 + Math.random() * 8) : (2.5 + Math.random() * 4);
        const vForce = isBomb ? (7 + Math.random() * 9) : (4 + Math.random() * 5);

        const velocity = new THREE.Vector3(
          outward.x * hForce + (Math.random() - 0.5) * 3,
          vForce,
          outward.z * hForce + (isBomb ? (Math.random() - 0.5) * 4 : -Math.random() * 4 - 2)
        );

        const rotSpeed = new THREE.Vector3(
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 16,
          (Math.random() - 0.5) * 16
        );

        this.scene.add(piece);
        this.crumblePieces.push({
          mesh: piece,
          velocity,
          rotSpeed,
          groundY: Math.random() * 0.15 + 0.05,
          bounces: 0,
          life: 0,
          maxLife: 1.3 + Math.random() * 0.4,
        });
      }
    });

    // 2. 飛散する追加の瓦礫ブロック（6〜10個）
    const extraRubbleCount = isBomb ? 10 : 6;
    for (let i = 0; i < extraRubbleCount; i++) {
      const geo = this.rubbleGeometries[Math.floor(Math.random() * this.rubbleGeometries.length)];
      const mat = this.rubbleMaterials[Math.floor(Math.random() * this.rubbleMaterials.length)];
      const piece = new THREE.Mesh(geo, mat);

      const spawnPos = centerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.5 + 0.2,
        (Math.random() - 0.5) * 1.5
      ));
      piece.position.copy(spawnPos);
      piece.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      const speedH = isBomb ? (8 + Math.random() * 10) : (4 + Math.random() * 5);
      const speedV = isBomb ? (6 + Math.random() * 8) : (3 + Math.random() * 4);

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * speedH,
        speedV,
        (Math.random() - 0.5) * speedH
      );

      this.scene.add(piece);
      this.crumblePieces.push({
        mesh: piece,
        velocity,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        ),
        groundY: 0.1,
        bounces: 0,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.4,
      });
    }
  }

  /**
   * 主人公の激突粉砕エフェクト
   * プレイヤーの身体各パーツがバラバラに分解し、
   * カバンの中の教科書、ノート、三角定規、消しゴム、ペン、プリント用紙が廊下一面に派手に飛び散る
   */
  public spawnPlayerShatter(playerPos: THREE.Vector3, playerGroup?: THREE.Group): void {
    const centerPos = playerPos.clone();
    centerPos.y += 1.0; // 胴体中央付近

    // 1. プレイヤーモデルの各構成パーツを分解・激しく吹き飛ばす
    if (playerGroup) {
      playerGroup.updateMatrixWorld(true);
      playerGroup.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry) {
          const worldPos = new THREE.Vector3();
          const worldQuat = new THREE.Quaternion();
          const worldScale = new THREE.Vector3();
          mesh.getWorldPosition(worldPos);
          mesh.getWorldQuaternion(worldQuat);
          mesh.getWorldScale(worldScale);

          const piece = new THREE.Mesh(mesh.geometry.clone(), mesh.material);
          piece.position.copy(worldPos);
          piece.quaternion.copy(worldQuat);
          piece.scale.copy(worldScale);

          // 中心からカメラ手前・上空・左右へ激しく吹き飛ぶベクトル
          const outward = new THREE.Vector3().subVectors(worldPos, centerPos);
          if (outward.lengthSq() < 0.01) {
            outward.set((Math.random() - 0.5) * 2, 1.0, (Math.random() - 0.5) * 2);
          }
          outward.normalize();

          // カメラ側 (+Z) および上空 (+Y) に勢いを強化
          const velocity = new THREE.Vector3(
            outward.x * (6 + Math.random() * 8) + (Math.random() - 0.5) * 4,
            8 + Math.random() * 8,
            Math.abs(outward.z) * 5 + 4 + Math.random() * 6 // カメラ手前に向かって飛び散る
          );

          const rotSpeed = new THREE.Vector3(
            (Math.random() - 0.5) * 22,
            (Math.random() - 0.5) * 22,
            (Math.random() - 0.5) * 22
          );

          this.scene.add(piece);
          this.crumblePieces.push({
            mesh: piece,
            velocity,
            rotSpeed,
            groundY: Math.random() * 0.12 + 0.05,
            bounces: 0,
            life: 0,
            maxLife: 2.2 + Math.random() * 0.5,
          });
        }
      });
    }

    // 2. カバンから飛び散る学用品・文房具アイテム
    // (A) 教科書・ノート（赤・青・緑・黄・オレンジ）
    const bookColors = [0xd32f2f, 0x1976d2, 0x388e3c, 0xf57c00, 0x7b1fa2, 0xffd600];
    const bookGeo = new THREE.BoxGeometry(0.42, 0.06, 0.55);
    for (let i = 0; i < 7; i++) {
      const bMat = new THREE.MeshLambertMaterial({ color: bookColors[i % bookColors.length] });
      const bookMesh = new THREE.Mesh(bookGeo, bMat);
      bookMesh.position.copy(centerPos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 0.8
      ));
      bookMesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);

      const bVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        9 + Math.random() * 7,
        3 + Math.random() * 9
      );

      this.scene.add(bookMesh);
      this.crumblePieces.push({
        mesh: bookMesh,
        velocity: bVelocity,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18,
          (Math.random() - 0.5) * 18
        ),
        groundY: 0.06,
        bounces: 0,
        life: 0,
        maxLife: 2.5,
      });
    }

    // (B) 三角定規（半透明スカイブルー）
    const rulerGeo = new THREE.BoxGeometry(0.35, 0.02, 0.35);
    const rulerMat = new THREE.MeshLambertMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 2; i++) {
      const rulerMesh = new THREE.Mesh(rulerGeo, rulerMat);
      rulerMesh.position.copy(centerPos);
      this.scene.add(rulerMesh);
      this.crumblePieces.push({
        mesh: rulerMesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 10,
          7 + Math.random() * 6,
          4 + Math.random() * 7
        ),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20,
          (Math.random() - 0.5) * 20
        ),
        groundY: 0.04,
        bounces: 0,
        life: 0,
        maxLife: 2.2,
      });
    }

    // (C) 消しゴム（白スリーブ付き）
    const eraserGeo = new THREE.BoxGeometry(0.18, 0.12, 0.14);
    const eraserMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });
    for (let i = 0; i < 2; i++) {
      const eraserMesh = new THREE.Mesh(eraserGeo, eraserMat);
      eraserMesh.position.copy(centerPos);
      this.scene.add(eraserMesh);
      this.crumblePieces.push({
        mesh: eraserMesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 8,
          6 + Math.random() * 5,
          3 + Math.random() * 6
        ),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 25,
          (Math.random() - 0.5) * 25,
          (Math.random() - 0.5) * 25
        ),
        groundY: 0.05,
        bounces: 0,
        life: 0,
        maxLife: 2.0,
      });
    }

    // (D) ペン・鉛筆（細長い棒）
    const penColors = [0x212121, 0xd50000, 0x2979ff, 0xffd600];
    const penGeo = new THREE.BoxGeometry(0.04, 0.36, 0.04);
    for (let i = 0; i < 6; i++) {
      const pMat = new THREE.MeshLambertMaterial({ color: penColors[i % penColors.length] });
      const penMesh = new THREE.Mesh(penGeo, pMat);
      penMesh.position.copy(centerPos);
      this.scene.add(penMesh);
      this.crumblePieces.push({
        mesh: penMesh,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 9,
          7 + Math.random() * 6,
          4 + Math.random() * 8
        ),
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30,
          (Math.random() - 0.5) * 30
        ),
        groundY: 0.04,
        bounces: 0,
        life: 0,
        maxLife: 2.0,
      });
    }

    // (E) ルーズリーフ・プリント用紙（ヒラヒラと宙を舞う紙片）
    const paperCount = 28;
    for (let i = 0; i < paperCount; i++) {
      const mat = this.paperMaterials[Math.floor(Math.random() * this.paperMaterials.length)];
      const pMesh = new THREE.Mesh(this.paperGeometry, mat);
      pMesh.position.copy(centerPos).add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 1.0,
        (Math.random() - 0.5) * 1.0
      ));
      pMesh.rotation.set(Math.random() * Math.PI * 2, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);

      const pVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 10,
        7 + Math.random() * 8,
        3 + Math.random() * 9
      );

      this.scene.add(pMesh);
      this.paperDebrisList.push({
        mesh: pMesh,
        velocity: pVelocity,
        rotSpeed: new THREE.Vector3(
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14,
          (Math.random() - 0.5) * 14
        ),
        life: 0,
        maxLife: 2.2 + Math.random() * 0.8,
      });
    }

    // 3. インパクト大爆発火花（約100個）
    for (let i = 0; i < 100; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.8 + 0.4,
        Math.random() * 1.5 + 0.5
      ).normalize();

      const speed = 10 + Math.random() * 22;
      const color = new THREE.Color().setHSL(0.07 + Math.random() * 0.08, 1.0, 0.6 + Math.random() * 0.4);

      this.sparkParticles.push({
        position: centerPos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8
        )),
        velocity: dir.multiplyScalar(speed),
        color,
        size: 1.2 + Math.random() * 1.4,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.5,
      });
    }
  }

  /**
   * 机・椅子の粉砕エフェクト（木片・破片）
   */
  public spawnDeskBreak(pos: THREE.Vector3): void {
    for (let i = 0; i < 40; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.6 + 0.4,
        (Math.random() - 0.5) * 2
      ).normalize();

      const color = Math.random() > 0.3
        ? new THREE.Color(0xd7a15c) // 木片色
        : new THREE.Color(0x90a4ae); // 金属パイプ色

      this.sparkParticles.push({
        position: pos.clone(),
        velocity: dir.multiplyScalar(8 + Math.random() * 14),
        color,
        size: 0.7 + Math.random() * 0.9,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4,
      });
    }
  }

  /**
   * ロッカーの粉砕エフェクト（金属火花・鉄屑）
   */
  public spawnLockerBreak(pos: THREE.Vector3): void {
    for (let i = 0; i < 60; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2.0 + 0.3,
        (Math.random() - 0.5) * 2
      ).normalize();

      const color = Math.random() > 0.5
        ? new THREE.Color(0xffea00) // 火花黄色
        : new THREE.Color(0xb0bec5); // スチール色

      this.sparkParticles.push({
        position: pos.clone(),
        velocity: dir.multiplyScalar(10 + Math.random() * 18),
        color,
        size: 0.9 + Math.random() * 1.0,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.5,
      });
    }
  }

  /**
   * スライディング時の摩擦煙・火花
   */
  public spawnSlideParticles(playerPos: THREE.Vector3): void {
    if (this.sparkParticles.length >= this.MAX_SPARKS - 10) return;

    for (let i = 0; i < 3; i++) {
      const pPos = playerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        0.05,
        0.8 + Math.random() * 0.4
      ));

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5,
        Math.random() * 1.5 + 0.3,
        Math.random() * 4 + 2
      );

      const color = Math.random() > 0.4
        ? new THREE.Color(0xffaa33) // オレンジ火花
        : new THREE.Color(0xdddddd); // 摩擦煙白

      this.sparkParticles.push({
        position: pPos,
        velocity,
        color,
        size: 0.6 + Math.random() * 0.6,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
      });
    }
  }

  /**
   * 単語帳シュリケンの飛翔トレイル
   */
  public spawnShurikenTrail(pos: THREE.Vector3): void {
    if (this.sparkParticles.length >= this.MAX_SPARKS - 5) return;

    for (let i = 0; i < 2; i++) {
      const pPos = pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.2,
        Math.random() * 0.3
      ));

      this.sparkParticles.push({
        position: pPos,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, 1.5),
        color: new THREE.Color(0xff4081),
        size: 0.4,
        life: 0,
        maxLife: 0.2,
      });
    }
  }

  /**
   * コイン獲得時のソフトブラー＆モーションブラーエフェクト
   * 黄金の光輪が高速で拡散ブラーし、柔らかなボケ光球粒子が立ち上る
   */
  public spawnCoinBlurEffect(pos: THREE.Vector3): void {
    // 1. 拡散ブラーリングの生成（2枚）
    for (let r = 0; r < 2; r++) {
      const ringMat = this.ringMaterial.clone();
      const ringMesh = new THREE.Mesh(this.ringGeometry, ringMat);
      ringMesh.position.copy(pos);
      if (r === 0) {
        ringMesh.rotation.x = Math.PI / 2; // 水平リング
      } else {
        ringMesh.rotation.set(Math.PI / 3, (Math.random() - 0.5) * 0.5, 0); // 斜めリング
      }
      this.scene.add(ringMesh);

      this.blurRings.push({
        mesh: ringMesh,
        life: 0,
        maxLife: 0.32 + r * 0.08,
        startScale: 0.45,
        endScale: 2.2 + r * 0.7,
      });
    }

    // 2. 柔らかいボケ光球粒子（Bokeh Blur Sparkles）
    const numSparks = 16;
    for (let i = 0; i < numSparks; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const pPos = pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.3,
        (Math.random() - 0.5) * 0.4
      ));

      // 上空へフワッと吸い込まれるモーションブラー軌道
      const velY = 3.0 + Math.random() * 4.5;
      const velX = (Math.random() - 0.5) * 1.6;
      const velZ = (Math.random() - 0.5) * 1.6;

      // 黄金〜純白のグローカラー
      const colors = [0xffffff, 0xfff59d, 0xffd54f, 0xffb300, 0xff9100];
      const colorHex = colors[Math.floor(Math.random() * colors.length)];

      this.sparkParticles.push({
        position: pPos,
        velocity: new THREE.Vector3(velX, velY, velZ),
        color: new THREE.Color(colorHex),
        size: 1.1 + Math.random() * 0.9, // 柔らかいボケ感
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
      });
    }
  }

  /**
   * 無敵パワーアップ獲得時の豪華な青き閃光バースト
   * 多重リング、稲妻状スパーク、上昇する光の粒子が一斉に爆発する
   */
  public spawnPowerUpBurst(pos: THREE.Vector3): void {
    // 1. 拡散する青いブラーリング（3枚・角度違い）
    for (let r = 0; r < 3; r++) {
      const ringMat = this.ringMaterial.clone();
      ringMat.color.setHex(0x40c4ff);
      const ringMesh = new THREE.Mesh(this.ringGeometry, ringMat);
      ringMesh.position.copy(pos);
      if (r === 0) {
        ringMesh.rotation.x = Math.PI / 2;
      } else if (r === 1) {
        ringMesh.rotation.set(Math.PI / 2.6, 0.4, 0);
      } else {
        ringMesh.rotation.set(0.3, (Math.random() - 0.5) * 1.2, 0.6);
      }
      this.scene.add(ringMesh);

      this.blurRings.push({
        mesh: ringMesh,
        life: 0,
        maxLife: 0.4 + r * 0.12,
        startScale: 0.4,
        endScale: 3.2 + r * 1.1,
      });
    }

    // 2. 閃光ポイントライト
    const light = new THREE.PointLight(0x2979ff, 12, 20);
    light.position.copy(pos);
    this.scene.add(light);
    this.explosionLights.push({
      light,
      life: 0,
      maxLife: 0.45,
      startIntensity: 12,
    });

    // 3. 猛烈な青白スパーク大爆発（約140個）
    for (let i = 0; i < 140; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.6 + 0.3,
        (Math.random() - 0.5) * 2
      ).normalize();
      const speed = 8 + Math.random() * 20;

      const colors = [0xffffff, 0xb3ecff, 0x40c4ff, 0x2979ff, 0x18ffff];
      const colorHex = colors[Math.floor(Math.random() * colors.length)];

      this.sparkParticles.push({
        position: pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8
        )),
        velocity: dir.multiplyScalar(speed),
        color: new THREE.Color(colorHex),
        size: 1.0 + Math.random() * 1.5,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.6,
      });
    }

    // 4. 上空へ吸い込まれる祝福のボケ光球（柔らかく長く尾を引く）
    for (let i = 0; i < 24; i++) {
      if (this.sparkParticles.length >= this.MAX_SPARKS) break;

      const pPos = pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.5) * 0.6
      ));

      this.sparkParticles.push({
        position: pPos,
        velocity: new THREE.Vector3(
          (Math.random() - 0.5) * 1.4,
          3.5 + Math.random() * 4.0,
          (Math.random() - 0.5) * 1.4
        ),
        color: new THREE.Color(Math.random() > 0.5 ? 0xb3ecff : 0xffffff),
        size: 1.2 + Math.random() * 1.0,
        life: 0,
        maxLife: 0.5 + Math.random() * 0.4,
      });
    }
  }

  /**
   * 無敵状態で疾走中に発生する常時の青いオーラトレイル
   */
  public spawnInvincibleTrail(playerPos: THREE.Vector3): void {
    if (this.sparkParticles.length >= this.MAX_SPARKS - 8) return;

    for (let i = 0; i < 3; i++) {
      const pPos = playerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.9,
        Math.random() * 1.7,
        0.5 + Math.random() * 0.6
      ));

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        1.0 + Math.random() * 1.5,
        Math.random() * 2.0 + 1.0
      );

      const colors = [0x40c4ff, 0x2979ff, 0xb3ecff, 0xffffff];
      const colorHex = colors[Math.floor(Math.random() * colors.length)];

      this.sparkParticles.push({
        position: pPos,
        velocity,
        color: new THREE.Color(colorHex),
        size: 0.6 + Math.random() * 0.7,
        life: 0,
        maxLife: 0.3 + Math.random() * 0.25,
      });
    }
  }

  /**
   * スピードラインの更新
   */
  private resetSpeedLines(playerZ: number): void {
    for (let i = 0; i < this.SPEED_LINE_COUNT; i++) {
      const idx = i * 6;
      const x = (Math.random() - 0.5) * 12;
      const y = Math.random() * 5 + 0.2;
      const z = playerZ - 30 - Math.random() * 50;
      const length = 4 + Math.random() * 8;

      this.speedLinePositions[idx] = x;
      this.speedLinePositions[idx + 1] = y;
      this.speedLinePositions[idx + 2] = z;

      this.speedLinePositions[idx + 3] = x;
      this.speedLinePositions[idx + 4] = y;
      this.speedLinePositions[idx + 5] = z - length;
    }
    this.speedLineGeometry.attributes.position.needsUpdate = true;
  }

  /**
   * 毎フレームのパーティクル更新
   */
  public update(dt: number, playerZ: number, speedRatio: number): void {
    // 1. 紙片の物理シミュレーション
    const gravity = -20;
    const airResistance = 0.94;

    for (let i = this.paperDebrisList.length - 1; i >= 0; i--) {
      const debris = this.paperDebrisList[i];
      debris.life += dt;

      if (debris.life >= debris.maxLife) {
        this.scene.remove(debris.mesh);
        debris.mesh.geometry.dispose();
        this.paperDebrisList.splice(i, 1);
        continue;
      }

      // 重力 & 空気抵抗（ヒラヒラと舞い落ちる）
      debris.velocity.y += gravity * dt;
      debris.velocity.x *= airResistance;
      debris.velocity.z *= airResistance;

      debris.mesh.position.addScaledVector(debris.velocity, dt);

      // 床接触判定
      if (debris.mesh.position.y < 0.05) {
        debris.mesh.position.y = 0.05;
        debris.velocity.y = -debris.velocity.y * 0.2;
        debris.rotSpeed.multiplyScalar(0.7);
      }

      // 回転
      debris.mesh.rotation.x += debris.rotSpeed.x * dt;
      debris.mesh.rotation.y += debris.rotSpeed.y * dt;
      debris.mesh.rotation.z += debris.rotSpeed.z * dt;

      // 寿命終盤でフェードスケール
      const progress = debris.life / debris.maxLife;
      if (progress > 0.7) {
        const scale = 1 - (progress - 0.7) / 0.3;
        debris.mesh.scale.set(scale, scale, scale);
      }
    }

    // 2. 火花・煙 Points 更新
    let activeSparkCount = 0;
    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const sp = this.sparkParticles[i];
      sp.life += dt;

      if (sp.life >= sp.maxLife) {
        this.sparkParticles.splice(i, 1);
        continue;
      }

      sp.velocity.y -= 15 * dt;
      sp.position.addScaledVector(sp.velocity, dt);

      if (sp.position.y < 0.05) {
        sp.position.y = 0.05;
        sp.velocity.y = -sp.velocity.y * 0.4;
      }

      const pIdx = activeSparkCount * 3;
      this.sparkPositions[pIdx] = sp.position.x;
      this.sparkPositions[pIdx + 1] = sp.position.y;
      this.sparkPositions[pIdx + 2] = sp.position.z;

      const alpha = 1 - (sp.life / sp.maxLife);
      this.sparkColors[pIdx] = sp.color.r * alpha;
      this.sparkColors[pIdx + 1] = sp.color.g * alpha;
      this.sparkColors[pIdx + 2] = sp.color.b * alpha;

      this.sparkSizes[activeSparkCount] = sp.size * (1 - sp.life / sp.maxLife);
      activeSparkCount++;
    }

    // 残りのスロットをゼロクリア
    for (let i = activeSparkCount; i < this.MAX_SPARKS; i++) {
      const pIdx = i * 3;
      this.sparkPositions[pIdx] = 0;
      this.sparkPositions[pIdx + 1] = -9999;
      this.sparkPositions[pIdx + 2] = 0;
      this.sparkSizes[i] = 0;
    }

    this.sparkGeometry.attributes.position.needsUpdate = true;
    this.sparkGeometry.attributes.color.needsUpdate = true;
    this.sparkGeometry.attributes.size.needsUpdate = true;

    // 3. スピードライン更新（ハイスピード時に強調）
    const lineMat = this.speedLines.material as THREE.LineBasicMaterial;
    if (speedRatio > 1.2) {
      const lineAlpha = Math.min(0.85, (speedRatio - 1.2) * 1.5);
      lineMat.opacity = lineAlpha;

      for (let i = 0; i < this.SPEED_LINE_COUNT; i++) {
        const idx = i * 6;
        let z1 = this.speedLinePositions[idx + 2];
        let z2 = this.speedLinePositions[idx + 5];

        // プレイヤーに迫る
        const moveZ = 60 * dt * speedRatio;
        z1 += moveZ;
        z2 += moveZ;

        // プレイヤー背後に抜けたら前方にリスポーン
        if (z2 > playerZ + 5) {
          const newZ = playerZ - 40 - Math.random() * 50;
          const len = 6 + Math.random() * 12;
          z1 = newZ;
          z2 = newZ - len;
          this.speedLinePositions[idx] = (Math.random() - 0.5) * 10;
          this.speedLinePositions[idx + 3] = this.speedLinePositions[idx];
          this.speedLinePositions[idx + 1] = Math.random() * 5 + 0.2;
          this.speedLinePositions[idx + 4] = this.speedLinePositions[idx + 1];
        }

        this.speedLinePositions[idx + 2] = z1;
        this.speedLinePositions[idx + 5] = z2;
      }
      this.speedLineGeometry.attributes.position.needsUpdate = true;
    } else {
      lineMat.opacity = 0;
    }

    // 4. 崩壊パーツの物理更新（重力、バウンド、床での転がり、フェードアウト）
    for (let i = this.crumblePieces.length - 1; i >= 0; i--) {
      const p = this.crumblePieces[i];
      p.life += dt;

      // 重力加速度
      p.velocity.y -= 26 * dt;

      // 移動
      p.mesh.position.addScaledVector(p.velocity, dt);

      // 回転
      p.mesh.rotation.x += p.rotSpeed.x * dt;
      p.mesh.rotation.y += p.rotSpeed.y * dt;
      p.mesh.rotation.z += p.rotSpeed.z * dt;

      // 床とのバウンド＆摩擦
      if (p.mesh.position.y <= p.groundY) {
        p.mesh.position.y = p.groundY;
        if (p.velocity.y < -1.8 && p.bounces < 2) {
          p.velocity.y = -p.velocity.y * 0.35;
          p.velocity.x *= 0.65;
          p.velocity.z *= 0.65;
          p.rotSpeed.multiplyScalar(0.5);
          p.bounces++;
        } else {
          p.velocity.set(0, 0, 0);
          p.rotSpeed.set(0, 0, 0);
        }
      }

      // 寿命終盤のスムーズ縮小
      if (p.life >= p.maxLife - 0.35) {
        const fade = Math.max(0, (p.maxLife - p.life) / 0.35);
        p.mesh.scale.set(fade, fade, fade);
      }

      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        this.crumblePieces.splice(i, 1);
      }
    }

    // 5. コイン獲得ブラーリングの拡散＆フェードアウト
    for (let i = this.blurRings.length - 1; i >= 0; i--) {
      const ring = this.blurRings[i];
      ring.life += dt;
      const progress = Math.min(1, ring.life / ring.maxLife);

      // スケールをなめらかに拡大
      const currentScale = ring.startScale + (ring.endScale - ring.startScale) * Math.pow(progress, 0.7);
      ring.mesh.scale.set(currentScale, currentScale, currentScale);

      // アルファフェードアウト
      const mat = ring.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.9 * (1 - progress));

      if (ring.life >= ring.maxLife) {
        this.scene.remove(ring.mesh);
        mat.dispose();
        this.blurRings.splice(i, 1);
      }
    }

    // 6. 動的爆発ポイントライトの減衰
    for (let i = this.explosionLights.length - 1; i >= 0; i--) {
      const el = this.explosionLights[i];
      el.life += dt;
      const fade = Math.max(0, 1 - el.life / el.maxLife);
      el.light.intensity = el.startIntensity * fade * fade;

      if (el.life >= el.maxLife) {
        this.scene.remove(el.light);
        el.light.dispose();
        this.explosionLights.splice(i, 1);
      }
    }

    // 7. 3D爆発ファイアボール（プラズマ爆炎球体）の膨張＆フェードアウト
    for (let i = this.explosionFireballs.length - 1; i >= 0; i--) {
      const fb = this.explosionFireballs[i];
      fb.life += dt;
      const progress = Math.min(1, fb.life / fb.maxLife);
      const easeScale = Math.pow(progress, 0.42);
      const currentScale = fb.startScale + (fb.endScale - fb.startScale) * easeScale;
      fb.mesh.scale.set(currentScale, currentScale, currentScale);

      const mat = fb.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = fb.startOpacity * Math.max(0, 1 - Math.pow(progress, 1.3));

      if (fb.life >= fb.maxLife) {
        this.scene.remove(fb.mesh);
        mat.dispose();
        this.explosionFireballs.splice(i, 1);
      }
    }

    // 8. 爆発衝撃波リングの拡散＆フェードアウト
    for (let i = this.explosionShockwaves.length - 1; i >= 0; i--) {
      const sw = this.explosionShockwaves[i];
      sw.life += dt;
      const progress = Math.min(1, sw.life / sw.maxLife);
      const easeScale = Math.pow(progress, 0.5);
      const currentScale = sw.startScale + (sw.endScale - sw.startScale) * easeScale;
      sw.mesh.scale.set(currentScale, currentScale, currentScale);

      const mat = sw.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = sw.startOpacity * Math.max(0, 1 - progress);

      if (sw.life >= sw.maxLife) {
        this.scene.remove(sw.mesh);
        mat.dispose();
        this.explosionShockwaves.splice(i, 1);
      }
    }

    // 9. 爆発噴煙クラウドの浮上・拡散・フェード
    for (let i = this.explosionSmokePuffs.length - 1; i >= 0; i--) {
      const sp = this.explosionSmokePuffs[i];
      sp.life += dt;
      sp.velocity.x *= 0.94;
      sp.velocity.z *= 0.94;
      sp.velocity.y += 0.8 * dt; // 上昇気流
      sp.mesh.position.addScaledVector(sp.velocity, dt);

      if (this.camera) {
        sp.mesh.quaternion.copy(this.camera.quaternion);
      }
      sp.mesh.rotation.z += sp.rotSpeed * dt;

      const progress = Math.min(1, sp.life / sp.maxLife);
      const currentScale = sp.startScale + (sp.endScale - sp.startScale) * progress;
      sp.mesh.scale.set(currentScale, currentScale, currentScale);

      const mat = sp.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.78 * (1 - progress));

      if (sp.life >= sp.maxLife) {
        this.scene.remove(sp.mesh);
        mat.dispose();
        this.explosionSmokePuffs.splice(i, 1);
      }
    }

    // 10. 床焦げ跡（炭化痕）の更新＆長時間フェード
    for (let i = this.explosionScorchMarks.length - 1; i >= 0; i--) {
      const sc = this.explosionScorchMarks[i];
      sc.life += dt;
      if (sc.life > 3.0) {
        const fadeProgress = (sc.life - 3.0) / (sc.maxLife - 3.0);
        const mat = sc.mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = Math.max(0, 0.85 * (1 - fadeProgress));
      }

      if (sc.life >= sc.maxLife) {
        this.scene.remove(sc.mesh);
        (sc.mesh.material as THREE.Material).dispose();
        this.explosionScorchMarks.splice(i, 1);
      }
    }
  }

  public clearAll(): void {
    for (const debris of this.paperDebrisList) {
      this.scene.remove(debris.mesh);
      debris.mesh.geometry.dispose();
    }
    this.paperDebrisList = [];
    this.sparkParticles = [];

    for (const p of this.crumblePieces) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
    }
    this.crumblePieces = [];

    for (const ring of this.blurRings) {
      this.scene.remove(ring.mesh);
      (ring.mesh.material as THREE.Material).dispose();
    }
    this.blurRings = [];

    for (const el of this.explosionLights) {
      this.scene.remove(el.light);
      el.light.dispose();
    }
    this.explosionLights = [];

    for (const fb of this.explosionFireballs) {
      this.scene.remove(fb.mesh);
      (fb.mesh.material as THREE.Material).dispose();
    }
    this.explosionFireballs = [];

    for (const sw of this.explosionShockwaves) {
      this.scene.remove(sw.mesh);
      (sw.mesh.material as THREE.Material).dispose();
    }
    this.explosionShockwaves = [];

    for (const sp of this.explosionSmokePuffs) {
      this.scene.remove(sp.mesh);
      (sp.mesh.material as THREE.Material).dispose();
    }
    this.explosionSmokePuffs = [];

    for (const sc of this.explosionScorchMarks) {
      this.scene.remove(sc.mesh);
      (sc.mesh.material as THREE.Material).dispose();
    }
    this.explosionScorchMarks = [];
  }
}
