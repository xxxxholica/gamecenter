import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export interface AudienceConfig {
  dohyoRadius: number; // 土俵の半径 (約9.2m)
  innerRadius: number; // 観客席内周 (約10.8m)
  outerRadius: number; // 観客席外周 (約29.0m)
  numRows: number;     // 席の列数
}

export class Audience {
  public mesh: THREE.Group;

  // インスタンスメッシュ
  private zabutonInstanced!: THREE.InstancedMesh;
  private legsInstanced!: THREE.InstancedMesh;
  private torsoInstanced!: THREE.InstancedMesh;
  private headInstanced!: THREE.InstancedMesh;
  private hairInstanced!: THREE.InstancedMesh;

  private totalCount: number = 0;

  // 各観客の初期位置・向き・アニメーション位相情報
  private spectatorData: Array<{
    basePosition: THREE.Vector3;
    baseRotation: THREE.Euler;
    baseScale: THREE.Vector3;
    phase: number;
    speed: number;
    role: 'spectator' | 'judge' | 'rikishi';
    row: number;
    angle: number;
    /** 1列後ろの最も近い席のインデックス（後ろから前へ詰める補充用。最奥列や通路前は -1） */
    behindIndex: number;
  }> = [];

  private animTimer: number = 0;
  private tempObject: THREE.Object3D = new THREE.Object3D();

  // 爆破で吹き飛ばされた観客と座布団(弾道で飛ぶ)
  private flyers: Array<{
    index: number;
    part: 'person' | 'cushion' | 'tile';
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    quat: THREE.Quaternion;
    angVel: THREE.Vector3;
    scale: THREE.Vector3;
    t: number;
    maxT: number;
  }> = [];
  private blown: boolean[] = [];
  /** 空席になってからの経過秒数（一定時間で後ろの列から前に詰めて補充） */
  private blowTimer!: Float32Array;
  private refillWaveTimer = 0;
  /** 後ろの席から前の席へ移動中の観客 */
  private scooting = new Map<number, { fromPos: THREE.Vector3; t: number; duration: number }>();

  // 客席の床(マス席)。1マスずつ吹き飛ばせるよう、インスタンスのタイルで組む
  private floorTiles!: THREE.InstancedMesh;
  private tileBase: Array<{ pos: THREE.Vector3; quat: THREE.Quaternion; scale: THREE.Vector3 }> = [];
  private tileBlown: boolean[] = [];
  private tileBlowTimer!: Float32Array;
  private innerRadius: number;
  private outerRadius: number;
  private numRows: number;
  private flyDummy = new THREE.Object3D();
  private flyMatrix = new THREE.Matrix4();
  private zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(config: Partial<AudienceConfig> = {}) {
    this.mesh = new THREE.Group();

    const innerRadius = config.innerRadius ?? 10.6;
    const outerRadius = config.outerRadius ?? 29.5;
    const numRows = config.numRows ?? 13;
    this.innerRadius = innerRadius;
    this.outerRadius = outerRadius;
    this.numRows = numRows;

    // 1. マス席のすり鉢状ひな壇フロア作成
    this.createStandFloors(innerRadius, outerRadius, numRows);

    // 2. 吊り屋根（大屋根・水引幕・四房）の作成
    this.createTsuriyane();

    // 3. 観客のインスタンスメッシュ配置
    this.createSpectators(innerRadius, outerRadius, numRows);
  }

  /**
   * 観客席のひな壇（中央が空洞のドーナツ型リング段差デッキ・マス席）
   * 土俵（半径9.2m）の周りには一切被らず、外周（10.6m〜29.5m）にのみ階段状フロアを展開
   */
  private createStandFloors(innerR: number, outerR: number, numRows: number) {
    const floorGroup = new THREE.Group();

    // マス席の敷物（深みのある千歳緑）
    const ringMatTatami = new THREE.MeshStandardMaterial({
      color: 0x1f3024,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    // 段差の木製蹴込み壁（和風木目ダークブラウン）
    const riserMatWood = new THREE.MeshStandardMaterial({
      color: 0x191410,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    // 白木レール仕切り
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x6e5332,
      roughness: 0.7,
      side: THREE.DoubleSide,
    });

    const stepWidth = (outerR - innerR) / numRows;
    const riserGeos: THREE.BufferGeometry[] = [];
    const railGeos: THREE.BufferGeometry[] = [];

    for (let r = 0; r < numRows; r++) {
      const rInner = innerR + r * stepWidth;
      const rOuter = rInner + stepWidth;
      const progress = r / (numRows - 1);
      // 外側に向かって緩やかに高くなる（最前列 -1.18m 〜 最奥 +0.82m）
      const heightY = -1.18 + Math.pow(progress, 1.2) * 2.0;
      const prevHeightY = r === 0 ? -1.25 : -1.18 + Math.pow((r - 1) / (numRows - 1), 1.2) * 2.0;
      const riserHeight = Math.max(0.06, heightY - prevHeightY);

      // 1. 各段の水平踏み面。席の数ぶんのタイルに分け、爆破のとき1枚ずつ飛ばせるようにする
      const midR = (rInner + rOuter) / 2;
      const nTiles = Math.floor((2 * Math.PI * midR) / 0.88); // 席(観客)と同じ数・同じ角度
      const tileThickness = 0.14;
      const arcOuter = (2 * Math.PI * rOuter) / nTiles; // 外側の弧に合わせて、すき間を作らない
      for (let t = 0; t < nTiles; t++) {
        const a = (t / nTiles) * Math.PI * 2;
        this.tileBase.push({
          pos: new THREE.Vector3(Math.cos(a) * midR, heightY - tileThickness / 2, Math.sin(a) * midR),
          quat: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -a),
          scale: new THREE.Vector3(stepWidth + 0.01, tileThickness, arcOuter * 1.003),
        });
      }

      // 2. 各段の内側垂直蹴込み壁（オープンエンド円筒＝筒壁のみ、中心は完全空洞）
      if (r > 0) {
        const riserGeo = new THREE.CylinderGeometry(
          rInner,
          rInner,
          riserHeight,
          64,
          1,
          true // openEnded = true (上面下面フタなし、筒壁のみ)
        );
        riserGeo.translate(0, heightY - riserHeight * 0.5, 0);
        riserGeos.push(riserGeo);
      }

      // 3. マス席の木枠仕切りリング
      if (r > 0 && r % 2 === 0) {
        const railGeo = new THREE.RingGeometry(rInner + stepWidth * 0.48, rInner + stepWidth * 0.52, 64);
        railGeo.rotateX(-Math.PI / 2);
        railGeo.translate(0, heightY + 0.005, 0);
        railGeos.push(railGeo);
      }
    }

    if (riserGeos.length > 0) {
      const mergedRiser = new THREE.Mesh(mergeGeometries(riserGeos), riserMatWood);
      mergedRiser.receiveShadow = true;
      floorGroup.add(mergedRiser);
      riserGeos.forEach((g) => g.dispose());
    }
    if (railGeos.length > 0) {
      const mergedRail = new THREE.Mesh(mergeGeometries(railGeos), railMat);
      floorGroup.add(mergedRail);
      railGeos.forEach((g) => g.dispose());
    }

    // タイルをまとめて1つのインスタンスメッシュにする
    this.floorTiles = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), ringMatTatami, this.tileBase.length);
    this.floorTiles.receiveShadow = true;
    const m = new THREE.Matrix4();
    this.tileBase.forEach((tb, i) => {
      m.compose(tb.pos, tb.quat, tb.scale);
      this.floorTiles.setMatrixAt(i, m);
    });
    this.floorTiles.instanceMatrix.needsUpdate = true;
    this.tileBlown = new Array(this.tileBase.length).fill(false);
    this.tileBlowTimer = new Float32Array(this.tileBase.length);
    floorGroup.add(this.floorTiles);

    this.mesh.add(floorGroup);
  }

  /**
   * 大相撲の象徴「神明造り 吊り屋根」
   * カメラのプレイ視界を遮らない高所（Y = 24m以上）に配置
   */
  private createTsuriyane() {
    const yaneGroup = new THREE.Group();
    yaneGroup.position.set(0, 28.0, 0);

    // 1. 神明造りの大屋根（切妻屋根）
    const roofWidth = 14.5;
    const roofLength = 17.5;
    const roofHeight = 4.2;

    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x3d3022, // 杉皮葺き・銅板葺きの落ち着いた屋根色
      roughness: 0.85,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x9b6b3e, // 白木・檜の木肌
      roughness: 0.7,
    });

    // 屋根の三角形妻壁・梁
    const roofGeo = new THREE.ConeGeometry(roofWidth * 0.75, roofHeight, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.scale(1.0, 1.0, 1.25);
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.y = roofHeight * 0.5;
    roofMesh.castShadow = true;
    yaneGroup.add(roofMesh);

    const woodGeos: THREE.BufferGeometry[] = [];
    // 千木（ちぎ・屋根両端の交差木）
    for (const zSide of [-roofLength * 0.46, roofLength * 0.46]) {
      const chigi1 = new THREE.BoxGeometry(0.35, 3.2, 0.35);
      chigi1.rotateZ(0.55);
      chigi1.translate(-0.6, roofHeight + 0.6, zSide);
      woodGeos.push(chigi1);

      const chigi2 = new THREE.BoxGeometry(0.35, 3.2, 0.35);
      chigi2.rotateZ(-0.55);
      chigi2.translate(0.6, roofHeight + 0.6, zSide);
      woodGeos.push(chigi2);
    }

    // 鰹木（かつおぎ・棟木上の丸太 5本）
    for (let k = -2; k <= 2; k++) {
      const katsuogi = new THREE.CylinderGeometry(0.38, 0.38, 3.2, 12);
      katsuogi.rotateZ(Math.PI / 2);
      katsuogi.translate(0, roofHeight + 0.8, k * 2.8);
      woodGeos.push(katsuogi);
    }
    yaneGroup.add(new THREE.Mesh(mergeGeometries(woodGeos), woodMat));
    woodGeos.forEach((g) => g.dispose());

    // 2. 水引幕（屋根の下周りをぐるりと囲む濃紫色の幕・桜紋入り）
    const makuTexture = this.createMakuTexture();
    const makuMat = new THREE.MeshStandardMaterial({
      map: makuTexture,
      roughness: 0.85,
    });
    const makuHeight = 1.8;
    const makuGeo = new THREE.BoxGeometry(roofWidth * 0.92, makuHeight, roofLength * 0.92);
    const makuMesh = new THREE.Mesh(makuGeo, makuMat);
    makuMesh.position.y = -makuHeight * 0.45;
    yaneGroup.add(makuMesh);

    // 幕の縁取り（白ライン）
    const borderMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
    const borderGeo = new THREE.BoxGeometry(roofWidth * 0.93, 0.1, roofLength * 0.93);
    const borderMesh = new THREE.Mesh(borderGeo, borderMat);
    borderMesh.position.y = -makuHeight * 0.95;
    yaneGroup.add(borderMesh);

    // 3. 四隅の四房（東=青房、西=白房、南=赤房、北=黒房）
    const fusaRadius = 0.45;
    const fusaHeight = 3.6;
    const fusaGeo = new THREE.CylinderGeometry(0.12, fusaRadius, fusaHeight, 8);

    const fusaConfigs = [
      { x: roofWidth * 0.44, z: roofLength * 0.44, color: 0x2266aa }, // 東: 青房（東北）
      { x: -roofWidth * 0.44, z: -roofLength * 0.44, color: 0xffffff }, // 西: 白房（西南）
      { x: roofWidth * 0.44, z: -roofLength * 0.44, color: 0xcc2222 }, // 南: 赤房（東南）
      { x: -roofWidth * 0.44, z: roofLength * 0.44, color: 0x222222 }, // 北: 黒房（西北）
    ];

    fusaConfigs.forEach((fusa) => {
      const fusaMat = new THREE.MeshStandardMaterial({ color: fusa.color, roughness: 0.7 });
      const fMesh = new THREE.Mesh(fusaGeo, fusaMat);
      fMesh.position.set(fusa.x, -makuHeight - fusaHeight * 0.45, fusa.z);
      yaneGroup.add(fMesh);
    });

    this.mesh.add(yaneGroup);
  }

  /**
   * 水引幕のプロシージャルテクスチャ生成（相撲協会の桜紋・白ライン）
   */
  private createMakuTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // 濃紫・漆黒の格式ある絹織物
    ctx.fillStyle = '#180f24';
    ctx.fillRect(0, 0, 1024, 256);

    // 金糸・白糸の家紋（桜の五弁紋）
    for (let i = 0; i < 4; i++) {
      const cx = 128 + i * 256;
      const cy = 110;

      // 桜花弁 5枚
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#e6b800';
      ctx.lineWidth = 3;
      for (let p = 0; p < 5; p++) {
        const ang = (p / 5) * Math.PI * 2 - Math.PI / 2;
        const px = cx + Math.cos(ang) * 28;
        const py = cy + Math.sin(ang) * 28;
        ctx.beginPath();
        ctx.arc(px, py, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      // 花芯（金色）
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd700';
      ctx.fill();
      ctx.stroke();
    }

    // 幕の下部白帯（水引の二引ライン）
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 222, 1024, 20);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  }

  /**
   * 観客・審判・控え力士の InstancedMesh 生成と配置
   */
  private createSpectators(
    innerR: number,
    outerR: number,
    numRows: number
  ) {
    // 観客の座標リストを計算
    const seatList: Array<{
      pos: THREE.Vector3;
      facingAngle: number;
      role: 'spectator' | 'judge' | 'rikishi';
      row: number;
      angle: number;
    }> = [];

    const stepWidth = (outerR - innerR) / numRows;

    // 行ごとに同心円状にびっしり配置
    for (let r = 0; r < numRows; r++) {
      const radius = innerR + r * stepWidth + stepWidth * 0.5;
      const progress = r / (numRows - 1);
      // 各段差の高さ（踏み面高さ + 座布団の半厚 0.04m）
      const heightY = -1.18 + Math.pow(progress, 1.2) * 2.0 + 0.04;

      // 席の間隔（約0.82m〜0.92m）
      const circum = 2 * Math.PI * radius;
      const numSeats = Math.floor(circum / 0.88);

      for (let s = 0; s < numSeats; s++) {
        const angle = (s / numSeats) * Math.PI * 2;

        // 東西の花道（力士入場通路）には席を作らない（各方角に約 2.5m の通路をあける）
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);

        // 東西通路（Zが小さくXが±最大の外周側）
        if (Math.abs(sinA * radius) < 1.4 && radius > innerR + 2.0 && Math.abs(cosA) > 0.8) {
          continue; // 通路
        }

        const px = cosA * radius;
        const pz = sinA * radius;

        // 土俵中央 (0, 0.5, 0) を向く
        const facingAngle = Math.atan2(-px, -pz);

        // 役割の判定:
        // 最前列（r === 0）の東西南北の中央付近に「勝負審判（親方）」
        let role: 'spectator' | 'judge' | 'rikishi' = 'spectator';

        if (r === 0) {
          // 四方の中心（角度 0, PI/2, PI, 3PI/2 付近）
          const modAngle = Math.abs(Math.sin(angle * 2));
          if (modAngle < 0.09) {
            role = 'judge'; // 勝負審判（黒羽織袴）
          } else if (Math.abs(cosA) > 0.92 && Math.abs(sinA) < 0.15) {
            role = 'rikishi'; // 東西の控え力士
          }
        }

        seatList.push({
          pos: new THREE.Vector3(px, heightY, pz),
          facingAngle,
          role,
          row: r,
          angle,
        });
      }
    }

    this.totalCount = seatList.length;
    this.blown = new Array(this.totalCount).fill(false);
    this.blowTimer = new Float32Array(this.totalCount);

    // ジオメトリ定義（座っている人物）
    // 1. 座布団
    const zabutonGeo = new THREE.BoxGeometry(0.55, 0.08, 0.55);
    // 2. 下半身（座り足・膝）
    const legsGeo = new THREE.BoxGeometry(0.46, 0.22, 0.42);
    legsGeo.translate(0, 0.11, 0.08);
    // 3. 胴体（服）
    const torsoGeo = new THREE.BoxGeometry(0.44, 0.52, 0.32);
    torsoGeo.translate(0, 0.42, -0.02);
    // 4. 頭部（顔）
    const headGeo = new THREE.SphereGeometry(0.16, 12, 10);
    headGeo.translate(0, 0.78, 0.02);
    // 5. 髪（ヘアスタイル）
    const hairGeo = new THREE.SphereGeometry(0.165, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
    hairGeo.translate(0, 0.79, 0.02);

    // マテリアル
    const zabutonMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
    const legsMat = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 });
    const torsoMat = new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 });
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.02 });
    const hairMat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.1 });

    // InstancedMesh 生成
    this.zabutonInstanced = new THREE.InstancedMesh(zabutonGeo, zabutonMat, this.totalCount);
    this.legsInstanced = new THREE.InstancedMesh(legsGeo, legsMat, this.totalCount);
    this.torsoInstanced = new THREE.InstancedMesh(torsoGeo, torsoMat, this.totalCount);
    this.headInstanced = new THREE.InstancedMesh(headGeo, headMat, this.totalCount);
    this.hairInstanced = new THREE.InstancedMesh(hairGeo, hairMat, this.totalCount);

    this.zabutonInstanced.receiveShadow = true;
    this.legsInstanced.castShadow = true;
    this.torsoInstanced.castShadow = true;
    this.headInstanced.castShadow = true;

    // カラーパレット
    // 服の色（画像にあるような多彩で生き生きとした客席の服色）
    const shirtColors = [
      new THREE.Color(0xfcfcfc), // 清潔な白シャツ
      new THREE.Color(0xf0ede5), // 生成り
      new THREE.Color(0x222226), // 黒スーツ
      new THREE.Color(0x353740), // チャコールグレー
      new THREE.Color(0x1a365d), // ネイビー
      new THREE.Color(0x2b6cb0), // ブルー
      new THREE.Color(0x63b3ed), // 水色
      new THREE.Color(0x9b2c2c), // えんじ・ワインレッド
      new THREE.Color(0xc53030), // 赤Tシャツ
      new THREE.Color(0xdd6b20), // オレンジ
      new THREE.Color(0xd69e2e), // マスタードイエロー
      new THREE.Color(0x2f855a), // 深緑
      new THREE.Color(0x38a169), // 明るいグリーン
      new THREE.Color(0x553c9a), // 紫
      new THREE.Color(0x805ad5), // ラベンダー
      new THREE.Color(0xb7791f), // キャメル・ベージュ
      new THREE.Color(0x744210), // ブラウン
      new THREE.Color(0xd53f8c), // ピンク・和装
    ];

    // ズボン色
    const pantsColors = [
      new THREE.Color(0x1a202c), // 黒
      new THREE.Color(0x2d3748), // ダークグレー
      new THREE.Color(0x2b4365), // ジーンズブルー
      new THREE.Color(0x4a5568), // グレー
      new THREE.Color(0xa0aec0), // ライトグレー
      new THREE.Color(0x744210), // ベージュチノパン
    ];

    // 肌色パレット
    const skinColors = [
      new THREE.Color(0xf6d5b8),
      new THREE.Color(0xefc49b),
      new THREE.Color(0xebb485),
      new THREE.Color(0xf1caa0),
    ];

    // 髪色パレット
    const hairColors = [
      new THREE.Color(0x111111), // 漆黒
      new THREE.Color(0x241c18), // ダークブラウン
      new THREE.Color(0x3d2b1f), // 茶髪
      new THREE.Color(0xcccccc), // 白髪
      new THREE.Color(0x777777), // ロマンスグレー
    ];

    // 座布団パレット
    const zabutonColors = [
      new THREE.Color(0x1e4620), // 溜席伝統の千歳緑
      new THREE.Color(0x1a365d), // 紺色
      new THREE.Color(0x7b1113), // えんじ
      new THREE.Color(0x4a2c5a), // 古代紫
    ];

    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.totalCount; i++) {
      const seat = seatList[i];

      // わずかな姿勢の自然なランダム揺らぎ（個々の観客の個性）
      const jitterRotY = (Math.random() - 0.5) * 0.25;
      const jitterLeanX = (Math.random() - 0.5) * 0.12; // 前傾・後傾
      const jitterLeanZ = (Math.random() - 0.5) * 0.08; // 左右傾き

      dummy.position.copy(seat.pos);
      dummy.rotation.set(jitterLeanX, seat.facingAngle + jitterRotY, jitterLeanZ);

      // 体格スケール（審判・控え力士・一般観客）
      let scale = 1.0;
      if (seat.role === 'rikishi') {
        scale = 1.35; // 控え力士は超大柄
      } else if (seat.role === 'judge') {
        scale = 1.1; // 勝負審判親方は威厳ある体格
      } else {
        scale = 0.92 + Math.random() * 0.16; // 一般観客の体格差
      }
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();

      // 各インスタンスにマトリックスを設定
      this.zabutonInstanced.setMatrixAt(i, dummy.matrix);
      this.legsInstanced.setMatrixAt(i, dummy.matrix);
      this.torsoInstanced.setMatrixAt(i, dummy.matrix);
      this.headInstanced.setMatrixAt(i, dummy.matrix);
      this.hairInstanced.setMatrixAt(i, dummy.matrix);

      // カラーリング
      if (seat.role === 'judge') {
        // 勝負審判（黒紋付羽織袴・白襟）
        this.zabutonInstanced.setColorAt(i, new THREE.Color(0x1b4d3e)); // 溜席緑座布団
        this.legsInstanced.setColorAt(i, new THREE.Color(0x111113)); // 黒袴
        this.torsoInstanced.setColorAt(i, new THREE.Color(0x0e0e10)); // 黒羽織
        this.headInstanced.setColorAt(i, skinColors[Math.floor(Math.random() * skinColors.length)]);
        this.hairInstanced.setColorAt(i, new THREE.Color(0x151515));
      } else if (seat.role === 'rikishi') {
        // 控え力士（上半身裸＋マワシ姿）
        const isEast = seat.pos.x < 0;
        const mawashiCol = isEast ? new THREE.Color(0x1b4965) : new THREE.Color(0x8b1e0f);
        const rikishiSkin = new THREE.Color(0xefc49b);

        this.zabutonInstanced.setColorAt(i, new THREE.Color(0x1b4d3e));
        this.legsInstanced.setColorAt(i, mawashiCol); // マワシ下半身
        this.torsoInstanced.setColorAt(i, rikishiSkin); // 肌色
        this.headInstanced.setColorAt(i, rikishiSkin);
        this.hairInstanced.setColorAt(i, new THREE.Color(0x111111)); // 大銀杏
      } else {
        // 一般観客（多彩な服・座布団・髪・肌）
        const zCol = seat.row === 0 ? new THREE.Color(0x1e4620) : zabutonColors[Math.floor(Math.random() * zabutonColors.length)];
        const shirtCol = shirtColors[Math.floor(Math.random() * shirtColors.length)];
        const pantsCol = pantsColors[Math.floor(Math.random() * pantsColors.length)];
        const skinCol = skinColors[Math.floor(Math.random() * skinColors.length)];
        const hairCol = hairColors[Math.floor(Math.random() * hairColors.length)];

        this.zabutonInstanced.setColorAt(i, zCol);
        this.legsInstanced.setColorAt(i, pantsCol);
        this.torsoInstanced.setColorAt(i, shirtCol);
        this.headInstanced.setColorAt(i, skinCol);
        this.hairInstanced.setColorAt(i, hairCol);
      }

      // アニメーション用データの保持
      this.spectatorData.push({
        basePosition: seat.pos.clone(),
        baseRotation: dummy.rotation.clone(),
        baseScale: new THREE.Vector3(scale, scale, scale),
        phase: Math.random() * Math.PI * 2,
        speed: 1.8 + Math.random() * 1.5,
        role: seat.role,
        row: seat.row,
        angle: seat.angle,
        behindIndex: -1,
      });
    }

    // 各席の「1列後ろの最も近い席(behindIndex)」を計算しておく(後ろから前に詰める補充用)
    const rowBuckets: number[][] = Array.from({ length: numRows }, () => []);
    for (let i = 0; i < this.totalCount; i++) {
      rowBuckets[this.spectatorData[i].row].push(i);
    }
    for (let i = 0; i < this.totalCount; i++) {
      const d = this.spectatorData[i];
      if (d.row >= numRows - 1) continue;
      let bestIdx = -1;
      let bestAngleDiff = 0.14; // 通路をまたがない範囲
      for (const candIdx of rowBuckets[d.row + 1]) {
        const cand = this.spectatorData[candIdx];
        let diff = Math.abs(cand.angle - d.angle);
        if (diff > Math.PI) diff = Math.PI * 2 - diff;
        if (diff < bestAngleDiff) {
          bestAngleDiff = diff;
          bestIdx = candIdx;
        }
      }
      d.behindIndex = bestIdx;
    }

    // インスタンスバッファをGPUへ更新
    this.zabutonInstanced.instanceMatrix.needsUpdate = true;
    this.legsInstanced.instanceMatrix.needsUpdate = true;
    this.torsoInstanced.instanceMatrix.needsUpdate = true;
    this.headInstanced.instanceMatrix.needsUpdate = true;
    this.hairInstanced.instanceMatrix.needsUpdate = true;

    if (this.zabutonInstanced.instanceColor) this.zabutonInstanced.instanceColor.needsUpdate = true;
    if (this.legsInstanced.instanceColor) this.legsInstanced.instanceColor.needsUpdate = true;
    if (this.torsoInstanced.instanceColor) this.torsoInstanced.instanceColor.needsUpdate = true;
    if (this.headInstanced.instanceColor) this.headInstanced.instanceColor.needsUpdate = true;
    if (this.hairInstanced.instanceColor) this.hairInstanced.instanceColor.needsUpdate = true;

    // グループに追加
    this.mesh.add(this.zabutonInstanced);
    this.mesh.add(this.legsInstanced);
    this.mesh.add(this.torsoInstanced);
    this.mesh.add(this.headInstanced);
    this.mesh.add(this.hairInstanced);
  }

  /**
   * 観客の生き生きとしたアニメーション更新
   * 平常時: 自然な呼吸・首の動き
   * 激突・大技時: 身を乗り出す熱狂
   * 勝負あり時: 拍手喝采・ざわめき
   */
  /** 観客を何分割して、1フレームに1区画ずつ更新するか */
  private static readonly UPDATE_SLICES = 3;
  private updateSlice = 0;

  public update(dt: number, isRoundActive: boolean, shakeIntensity: number = 0) {
    this.animTimer += dt;

    // 激突時（shakeIntensity > 0）や決着時は全員が身を乗り出してどよめく
    const isExcited = shakeIntensity > 0.1 || !isRoundActive;
    const excitementMultiplier = isExcited ? 2.5 : 1.0;

    // 揺れは animTimer の関数なので、観客を3区画に分けて1フレームに1区画だけ更新しても動きは途切れない。
    // 行列の計算と転送(instanceMatrix のアップロード)が毎フレームの約1/3で済む。
    const slices = Audience.UPDATE_SLICES;
    const size = Math.ceil(this.totalCount / slices);
    const start = this.updateSlice * size;
    const end = Math.min(this.totalCount, start + size);
    this.updateSlice = (this.updateSlice + 1) % slices;

    const torsoArr = this.torsoInstanced.instanceMatrix.array as Float32Array;
    const headArr = this.headInstanced.instanceMatrix.array as Float32Array;
    const hairArr = this.hairInstanced.instanceMatrix.array as Float32Array;
    let updated = false;

    for (let i = start; i < end; i++) {
      const data = this.spectatorData[i];
      if (this.blown[i] || this.scooting.has(i)) continue; // 爆破で飛んだ観客・前詰め移動中は別処理
      if (data.role === 'judge') continue; // 審判親方は微動だにせず威厳を保つ

      // 微小なサイン波の首・体の揺れ
      const wave = Math.sin(this.animTimer * data.speed + data.phase);
      const nodLean = wave * 0.04 * excitementMultiplier;

      // 激突・喝采時の前傾（身を乗り出す）
      const leanForward = isExcited ? 0.08 + Math.abs(wave) * 0.06 : 0;

      this.tempObject.position.copy(data.basePosition);
      this.tempObject.rotation.copy(data.baseRotation);
      this.tempObject.rotateX(nodLean + leanForward);
      this.tempObject.scale.copy(data.baseScale);

      // 上半身（胴体・頭・髪）のみ前傾して動かす。3つとも同じ行列なので、1回の計算結果を書き込む
      this.tempObject.updateMatrix();
      const o = i * 16;
      this.tempObject.matrix.toArray(torsoArr, o);
      for (let k = 0; k < 16; k++) {
        headArr[o + k] = torsoArr[o + k];
        hairArr[o + k] = torsoArr[o + k];
      }
      updated = true;
    }

    if (updated) {
      // 更新した区画だけをGPUへ送る
      for (const mesh of [this.torsoInstanced, this.headInstanced, this.hairInstanced]) {
        const attr = mesh.instanceMatrix;
        attr.clearUpdateRanges();
        attr.addUpdateRange(start * 16, (end - start) * 16);
        attr.needsUpdate = true;
      }
    }

    this.updateFlyers(dt);
    this.updateRefillAndScoot(dt);
  }

  /**
   * 吹き飛ばされた観客席を、後ろの列から前の列へ順番に詰めることで補充する。
   * 最奥の列には外周通路から新しい観客が補充され、吹き飛んだ床タイルも修復される。
   */
  private updateRefillAndScoot(dt: number) {
    // 1. 吹き飛んだ床タイルの修復(飛散アニメーション終了後に元の位置へ戻す)
    let tileRestored = false;
    const tm = this.flyMatrix;
    for (let i = 0; i < this.tileBase.length; i++) {
      if (!this.tileBlown[i]) continue;
      this.tileBlowTimer[i] += dt;
      if (this.tileBlowTimer[i] >= 3.4) {
        this.tileBlown[i] = false;
        this.tileBlowTimer[i] = 0;
        const tb = this.tileBase[i];
        tm.compose(tb.pos, tb.quat, tb.scale);
        this.floorTiles.setMatrixAt(i, tm);
        tileRestored = true;
      }
    }
    if (tileRestored) {
      this.floorTiles.instanceMatrix.clearUpdateRanges();
      this.floorTiles.instanceMatrix.needsUpdate = true;
    }

    // 2. 空席タイマーを進める
    let hasBlownReady = false;
    for (let i = 0; i < this.totalCount; i++) {
      if (!this.blown[i]) continue;
      this.blowTimer[i] += dt;
      if (this.blowTimer[i] >= 3.6) hasBlownReady = true;
    }

    // 3. 定期的に後ろの列から前の空席へ1段ずつ詰めるウェーブを実行
    this.refillWaveTimer += dt;
    if (hasBlownReady && this.refillWaveTimer >= 0.65) {
      this.refillWaveTimer = 0;
      const allMeshes = [this.zabutonInstanced, this.legsInstanced, this.torsoInstanced, this.headInstanced, this.hairInstanced];
      let anyHidden = false;
      // 前列(row=0)から後列(row=numRows-1)の順に走査し、1ステップにつき1列分だけ前に詰める
      for (let i = 0; i < this.totalCount; i++) {
        if (!this.blown[i] || this.blowTimer[i] < 3.6) continue;
        const d = this.spectatorData[i];
        const b = d.behindIndex;
        if (b >= 0) {
          // 後ろの席に観客がいれば、その観客が前の席(i)へ移動し、後ろの席(b)が空席になる
          if (!this.blown[b] && !this.scooting.has(b)) {
            this.blown[i] = false;
            this.blowTimer[i] = 0;
            this.scooting.set(i, {
              fromPos: this.spectatorData[b].basePosition.clone(),
              t: 0,
              duration: 0.42,
            });
            // 後ろの席(b)は次のウェーブでさらに後ろから詰められるように空席化
            this.blown[b] = true;
            this.blowTimer[b] = 3.6;
            for (const m of allMeshes) {
              m.setMatrixAt(b, this.zeroMatrix);
            }
            anyHidden = true;
          }
        } else {
          // 最奥列(または通路前): 外周から新しい観客が座り直す
          this.blown[i] = false;
          this.blowTimer[i] = 0;
          const rad = Math.hypot(d.basePosition.x, d.basePosition.z) || 1;
          const fromPos = new THREE.Vector3(
            d.basePosition.x + (d.basePosition.x / rad) * 1.35,
            d.basePosition.y + 0.14,
            d.basePosition.z + (d.basePosition.z / rad) * 1.35
          );
          this.scooting.set(i, { fromPos, t: 0, duration: 0.42 });
        }
      }
      if (anyHidden) {
        for (const m of allMeshes) {
          m.instanceMatrix.clearUpdateRanges();
          m.instanceMatrix.needsUpdate = true;
        }
      }
    }

    // 4. 前詰め移動中の観客の補間アニメーション更新
    if (this.scooting.size > 0) {
      const allMeshes = [this.zabutonInstanced, this.legsInstanced, this.torsoInstanced, this.headInstanced, this.hairInstanced];
      for (const [idx, scoot] of this.scooting.entries()) {
        if (this.blown[idx]) {
          this.scooting.delete(idx);
          continue;
        }
        scoot.t += dt;
        const p = Math.min(1, scoot.t / scoot.duration);
        const ease = p * p * (3 - 2 * p);
        const hopY = Math.sin(p * Math.PI) * 0.16;
        const d = this.spectatorData[idx];

        this.tempObject.position.lerpVectors(scoot.fromPos, d.basePosition, ease);
        this.tempObject.position.y += hopY;
        this.tempObject.rotation.copy(d.baseRotation);
        this.tempObject.scale.copy(d.baseScale);
        this.tempObject.updateMatrix();

        for (const m of allMeshes) {
          m.setMatrixAt(idx, this.tempObject.matrix);
        }

        if (p >= 1) {
          this.scooting.delete(idx);
        }
      }
      for (const m of allMeshes) {
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /** 席の高さ(半径から、その段の踏み面の高さを求める) */
  public floorHeightAt(radius: number): number {
    const stepWidth = (this.outerRadius - this.innerRadius) / this.numRows;
    const row = Math.max(0, Math.min(this.numRows - 1, Math.floor((radius - this.innerRadius) / stepWidth)));
    const progress = row / (this.numRows - 1);
    return -1.18 + Math.pow(progress, 1.2) * 2.0;
  }

  /**
   * 客席を爆破する。爆心地の周りの観客と座布団が、外向きに弾き飛ばされる。
   * 返り値は吹き飛ばした人数。
   */
  public explodeAt(center: THREE.Vector3, radius: number): number {
    let count = 0;
    for (let i = 0; i < this.totalCount; i++) {
      if (this.blown[i]) continue;
      const data = this.spectatorData[i];
      const dx = data.basePosition.x - center.x;
      const dz = data.basePosition.z - center.z;
      const dy = data.basePosition.y - center.y;
      const dist = Math.hypot(dx, dz, dy * 0.6);
      if (dist > radius) continue;

      this.blown[i] = true;
      this.blowTimer[i] = 0;
      this.scooting.delete(i);
      count++;
      const falloff = 1 - dist / radius; // 中心に近いほど強く飛ぶ
      const len = Math.hypot(dx, dz) || 1;
      const out = new THREE.Vector3(dx / len, 0, dz / len);
      // 爆心から離れる向きに、少し散らして飛ばす
      const spread = new THREE.Vector3((Math.random() - 0.5) * 0.9, 0, (Math.random() - 0.5) * 0.9);
      const dir = out.add(spread).normalize();
      const sp = 7 + falloff * 13 + Math.random() * 4;

      // 人は大きく、座布団は人とは別方向へ軽く舞う
      this.flyers.push({
        index: i,
        part: 'person',
        pos: data.basePosition.clone(),
        vel: new THREE.Vector3(dir.x * sp, 8 + falloff * 10 + Math.random() * 4, dir.z * sp),
        quat: new THREE.Quaternion().setFromEuler(data.baseRotation),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 9),
        scale: data.baseScale.clone(),
        t: 0,
        maxT: 2.6 + Math.random() * 0.8,
      });
      const cdir = dir.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2)).normalize();
      this.flyers.push({
        index: i,
        part: 'cushion',
        pos: data.basePosition.clone(),
        vel: new THREE.Vector3(cdir.x * (sp * 0.9), 6 + falloff * 8 + Math.random() * 5, cdir.z * (sp * 0.9)),
        quat: new THREE.Quaternion().setFromEuler(data.baseRotation),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 16),
        scale: data.baseScale.clone(),
        t: 0,
        maxT: 2.2 + Math.random() * 0.8,
      });
    }

    // 爆心の床(席のタイル)も、1枚ずつ弾き飛ばす。中心のほうが強く、外のほうが弱い
    const tileRadius = radius * 0.9;
    for (let i = 0; i < this.tileBase.length; i++) {
      if (this.tileBlown[i]) continue;
      const tb = this.tileBase[i];
      const dx = tb.pos.x - center.x;
      const dz = tb.pos.z - center.z;
      const dist = Math.hypot(dx, dz);
      if (dist > tileRadius) continue;

      this.tileBlown[i] = true;
      this.tileBlowTimer[i] = 0;
      const falloff = 1 - dist / tileRadius;
      const len = dist || 1;
      const dir = new THREE.Vector3(dx / len, 0, dz / len).add(
        new THREE.Vector3((Math.random() - 0.5) * 0.7, 0, (Math.random() - 0.5) * 0.7)
      ).normalize();
      const sp = 4 + falloff * 10 + Math.random() * 3;
      this.flyers.push({
        index: i,
        part: 'tile',
        pos: tb.pos.clone(),
        vel: new THREE.Vector3(dir.x * sp, 5 + falloff * 9 + Math.random() * 3, dir.z * sp),
        quat: tb.quat.clone(),
        angVel: new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 7),
        scale: tb.scale.clone(),
        t: 0,
        maxT: 2.2 + Math.random() * 0.9,
      });
    }

    return count;
  }

  /** 吹き飛んだ観客を元の席に戻す(新しい試合の前に呼ぶ) */
  public restoreAll() {
    this.flyers.length = 0;
    this.scooting.clear();
    this.refillWaveTimer = 0;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.totalCount; i++) {
      this.blowTimer[i] = 0;
      if (!this.blown[i]) continue;
      this.blown[i] = false;
      const data = this.spectatorData[i];
      dummy.position.copy(data.basePosition);
      dummy.rotation.copy(data.baseRotation);
      dummy.scale.copy(data.baseScale);
      dummy.updateMatrix();
      for (const m of [this.zabutonInstanced, this.legsInstanced, this.torsoInstanced, this.headInstanced, this.hairInstanced]) {
        m.setMatrixAt(i, dummy.matrix);
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.needsUpdate = true;
      }
    }
    const tm = new THREE.Matrix4();
    for (let i = 0; i < this.tileBase.length; i++) {
      this.tileBlowTimer[i] = 0;
      if (!this.tileBlown[i]) continue;
      this.tileBlown[i] = false;
      const tb = this.tileBase[i];
      tm.compose(tb.pos, tb.quat, tb.scale);
      this.floorTiles.setMatrixAt(i, tm);
    }
    this.floorTiles.instanceMatrix.clearUpdateRanges();
    this.floorTiles.instanceMatrix.needsUpdate = true;
  }

  /** 飛んでいる観客・座布団の弾道を進め、行列を書き込む */
  private updateFlyers(dt: number) {
    if (this.flyers.length === 0) return;

    const personMeshes = [this.legsInstanced, this.torsoInstanced, this.headInstanced, this.hairInstanced];
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();

    for (let k = this.flyers.length - 1; k >= 0; k--) {
      const f = this.flyers[k];
      f.t += dt;
      f.vel.y -= 24 * dt;
      f.pos.addScaledVector(f.vel, dt);
      e.set(f.angVel.x * dt, f.angVel.y * dt, f.angVel.z * dt);
      q.setFromEuler(e);
      f.quat.premultiply(q);

      const done = f.t >= f.maxT || f.pos.y < -4;
      if (done) {
        const targets =
          f.part === 'person' ? personMeshes : f.part === 'tile' ? [this.floorTiles] : [this.zabutonInstanced];
        for (const m of targets) {
          m.setMatrixAt(f.index, this.zeroMatrix);
          m.instanceMatrix.addUpdateRange(f.index * 16, 16);
          m.instanceMatrix.needsUpdate = true;
        }
        this.flyers.splice(k, 1);
        continue;
      }

      this.flyDummy.position.copy(f.pos);
      this.flyDummy.quaternion.copy(f.quat);
      this.flyDummy.scale.copy(f.scale);
      this.flyDummy.updateMatrix();
      this.flyMatrix.copy(this.flyDummy.matrix);

      const targets =
          f.part === 'person' ? personMeshes : f.part === 'tile' ? [this.floorTiles] : [this.zabutonInstanced];
      for (const m of targets) {
        m.setMatrixAt(f.index, this.flyMatrix);
        m.instanceMatrix.addUpdateRange(f.index * 16, 16);
        m.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
