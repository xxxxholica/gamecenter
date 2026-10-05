import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  createFloorTexture,
  createWallTexture,
  createWindowWallTexture,
  createOutsideSkyTexture,
  createBuildingWindowsTexture,
} from '../graphics/Textures';

interface CorridorSegment {
  group: THREE.Group;
  baseZ: number;
}

export class Corridor {
  private scene: THREE.Scene;
  private segments: CorridorSegment[] = [];

  private readonly SEGMENT_LENGTH = 36;
  private readonly NUM_SEGMENTS = 6;
  private readonly CORRIDOR_WIDTH = 10;
  private readonly CORRIDOR_HEIGHT = 7.5; // 天井を高くしてジャンプ時の外側露出を防止

  // 夕暮れフォグのデフォルト値（クリア演出で校門通過時に変化させた後、リセット時に復元する）
  private readonly DEFAULT_FOG_COLOR = 0x381928;
  private readonly DEFAULT_FOG_DENSITY = 0.018;
  private fog: THREE.FogExp2;

  // 蛍光灯の点滅用タイマー
  private flickerTimer: number = 0;
  private flickeringLightMesh: THREE.Mesh | null = null;
  private flickeringLightMat: THREE.MeshBasicMaterial | null = null;

  // 共通マテリアル
  private floorMaterial: THREE.MeshStandardMaterial;
  private rightWallMaterial: THREE.MeshStandardMaterial;
  private leftWallMaterial: THREE.MeshStandardMaterial;
  private ceilingMaterial: THREE.MeshStandardMaterial;
  private lightMaterial: THREE.MeshBasicMaterial;

  // 窓の外の景色(屋外シーン): 空の板はプレイヤーに追従し、地面・木・校舎などは区画ごとに作る
  private sky: THREE.Mesh;
  private outsideMaterials: Record<'ground' | 'track' | 'line' | 'fence' | 'trunk' | 'leaf' | 'leaf2' | 'pole' | 'goal', THREE.MeshLambertMaterial>;
  private buildingMaterial: THREE.MeshBasicMaterial;
  private segmentCounter = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 夕暮れのフォグ（奥が夕暮れの茜色に包まれる）
    this.fog = new THREE.FogExp2(this.DEFAULT_FOG_COLOR, this.DEFAULT_FOG_DENSITY);
    this.scene.fog = this.fog;

    // テクスチャ
    const floorTex = createFloorTexture();
    const rightWallTex = createWallTexture();
    const windowTex = createWindowWallTexture();
    windowTex.repeat.set(this.SEGMENT_LENGTH / 9, 1); // 窓3枚(横9m)を区画の長さぶん繰り返す

    // マテリアル
    this.floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.35,  // ワックスの反射感
      metalness: 0.15,
    });

    this.rightWallMaterial = new THREE.MeshStandardMaterial({
      map: rightWallTex,
      roughness: 0.8,
    });

    this.leftWallMaterial = new THREE.MeshStandardMaterial({
      map: windowTex,
      roughness: 0.7,
      emissive: 0xff7043,
      emissiveIntensity: 0.15, // 夕日の反射発光
      alphaTest: 0.5,          // ガラスの部分は透明にして、外の景色を見せる
      side: THREE.DoubleSide,
    });

    // 窓の外: 空(円筒の内側に貼る)。フォグの影響を受けず、プレイヤーに追従する。
    // 窓から斜め前方を見ても空が途切れないよう、板ではなく全周を囲う円筒にしている(継ぎ目はプレイヤーの背後)。
    this.sky = new THREE.Mesh(
      new THREE.CylinderGeometry(250, 250, 160, 48, 1, true),
      new THREE.MeshBasicMaterial({
        map: createOutsideSkyTexture(),
        side: THREE.BackSide,
        fog: false,
        toneMapped: false,
        depthWrite: false,
      }),
    );
    this.sky.renderOrder = -1;
    this.sky.position.set(0, 48, -20);                          // 地平線(テクスチャの下から20%)が目の高さ付近に来る
    this.scene.add(this.sky);
    this.scene.background = new THREE.Color(0x1d1048);        // 円筒の上端より上は、空のいちばん上の色で埋める
    const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
    this.outsideMaterials = {
      ground: lambert(0x7a5a45),
      track: lambert(0xa24a32),
      line: lambert(0xe8dccb),
      fence: lambert(0x2f2638),
      trunk: lambert(0x3a2a2a),
      leaf: lambert(0x33452f),
      leaf2: lambert(0x4a3a4a),
      pole: lambert(0x3a3340),
      goal: lambert(0xf2eee6),
    };
    const buildingTex = createBuildingWindowsTexture();
    buildingTex.repeat.set(10, 3);
    this.buildingMaterial = new THREE.MeshBasicMaterial({ map: buildingTex });

    this.ceilingMaterial = new THREE.MeshStandardMaterial({
      color: 0xd7ccc8,
      roughness: 0.9,
    });

    this.lightMaterial = new THREE.MeshBasicMaterial({
      color: 0xffffff,
    });

    // 環境光・夕日のディレクショナルライト
    this.setupLighting();

    // 廊下セグメントの初期生成
    for (let i = 0; i < this.NUM_SEGMENTS; i++) {
      const baseZ = -i * this.SEGMENT_LENGTH;
      const group = this.createSegmentGroup(baseZ);
      this.scene.add(group);
      this.segments.push({ group, baseZ });
    }
  }

  private setupLighting(): void {
    // 茜色〜琥珀色の環境光
    const ambientLight = new THREE.AmbientLight(0xff9e80, 0.75);
    this.scene.add(ambientLight);

    // 左窓から差し込む強烈な夕日ライト
    const sunLight = new THREE.DirectionalLight(0xffa726, 1.8);
    sunLight.position.set(-15, 8, -20);
    this.scene.add(sunLight);

    // 床の反射を際立たせるフィルライト
    const floorLight = new THREE.DirectionalLight(0xffd54f, 0.6);
    floorLight.position.set(0, 10, 10);
    this.scene.add(floorLight);
  }

  private createSegmentGroup(baseZ: number): THREE.Group {
    const group = new THREE.Group();
    group.position.z = baseZ;

    const hw = this.CORRIDOR_WIDTH / 2; // 5
    const len = this.SEGMENT_LENGTH;

    // 1. 床 (Y = 0)
    const floorGeo = new THREE.PlaneGeometry(this.CORRIDOR_WIDTH, len);
    const floor = new THREE.Mesh(floorGeo, this.floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -len / 2);
    floor.receiveShadow = true;
    group.add(floor);

    // 2. 天井 (Y = CORRIDOR_HEIGHT)
    const ceilingGeo = new THREE.PlaneGeometry(this.CORRIDOR_WIDTH, len);
    const ceiling = new THREE.Mesh(ceilingGeo, this.ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, this.CORRIDOR_HEIGHT, -len / 2);
    group.add(ceiling);

    // 3. 左壁（教室窓側: 夕日の見える大窓）
    const leftWallGeo = new THREE.PlaneGeometry(len, this.CORRIDOR_HEIGHT);
    const leftWall = new THREE.Mesh(leftWallGeo, this.leftWallMaterial);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-hw, this.CORRIDOR_HEIGHT / 2, -len / 2);
    group.add(leftWall);

    // 4. 右壁（教室側: ドア・掲示板・腰壁）
    const rightWallGeo = new THREE.PlaneGeometry(len, this.CORRIDOR_HEIGHT);
    const rightWall = new THREE.Mesh(rightWallGeo, this.rightWallMaterial);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(hw, this.CORRIDOR_HEIGHT / 2, -len / 2);
    group.add(rightWall);

    // 5. 天井の蛍光灯（一定間隔で配置）
    const lightSpacing = 9;
    for (let z = 0; z > -len; z -= lightSpacing) {
      const fixtureGroup = new THREE.Group();
      fixtureGroup.position.set(0, 6.2, z - lightSpacing / 2);

      // 天井から吊り下げるロッド2本
      const rodGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.3, 6);
      const rodMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
      const rod1 = new THREE.Mesh(rodGeo, rodMat);
      rod1.position.set(0, 0.65, -1.0);
      fixtureGroup.add(rod1);

      const rod2 = new THREE.Mesh(rodGeo, rodMat);
      rod2.position.set(0, 0.65, 1.0);
      fixtureGroup.add(rod2);

      // 器具ベース（グレーの金属）
      const baseGeo = new THREE.BoxGeometry(0.5, 0.1, 3.2);
      const baseMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      fixtureGroup.add(base);

      // 蛍光管2本（エミッシブホワイト）
      const tubeGeo = new THREE.CylinderGeometry(0.04, 0.04, 3.0, 8);
      tubeGeo.rotateX(Math.PI / 2);

      const tube1 = new THREE.Mesh(tubeGeo, this.lightMaterial);
      tube1.position.set(-0.12, -0.06, 0);
      fixtureGroup.add(tube1);

      const tube2 = new THREE.Mesh(tubeGeo, this.lightMaterial);
      tube2.position.set(0.12, -0.06, 0);
      fixtureGroup.add(tube2);

      if (!this.flickeringLightMesh && Math.random() < 0.2) {
        this.flickeringLightMesh = tube1;
        this.flickeringLightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        tube1.material = this.flickeringLightMat;
      }

      group.add(fixtureGroup);
    }

    this.mergeStaticFixtures(group);
    this.addOutsideScenery(group, len, hw);
    return group;
  }

  /**
   * 窓の外の景色: 校庭の地面・トラック・フェンス・木・ゴール・電柱・遠くの校舎。
   * 実際に奥行きのある3Dなので、走るにつれて視差が付く。区画ごとに配置を変え、同じ絵の繰り返しに見えないようにする。
   * 部品はマテリアルごとに1メッシュへ結合し、描画命令を増やさない。
   */
  private addOutsideScenery(group: THREE.Group, len: number, hw: number): void {
    const seed = ++this.segmentCounter;
    let state = seed * 7919 + 13;
    const rand = () => ((state = (state * 16807) % 2147483647) / 2147483647);
    const geos = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => {
      const g = geo.clone();
      g.rotateY(ry);
      g.translate(x, y, z);
      const list = geos.get(mat) ?? [];
      list.push(g);
      geos.set(mat, list);
    };
    const m = this.outsideMaterials;
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const zMid = -len / 2;

    // 地面(校庭)
    const ground = new THREE.PlaneGeometry(90, len).rotateX(-Math.PI / 2);
    add(m.ground, ground, -hw - 45, -0.25, zMid);
    // 陸上トラック(赤茶色のレーンと白線)
    const track = new THREE.PlaneGeometry(9, len).rotateX(-Math.PI / 2);
    add(m.track, track, -hw - 16, -0.15, zMid);
    for (let k = 0; k < 4; k++) add(m.line, new THREE.PlaneGeometry(0.12, len).rotateX(-Math.PI / 2), -hw - 12.5 - k * 2.2, -0.08, zMid);

    // フェンス(校舎の外壁沿い): 支柱 + 2段の横線 + 金網の帯
    add(m.fence, box(0.06, 0.06, len), -hw - 7, 2.2, zMid);
    add(m.fence, box(0.06, 0.06, len), -hw - 7, 0.5, zMid);
    for (let z = -1.5; z > -len; z -= 3) add(m.fence, box(0.12, 2.5, 0.12), -hw - 7, 1.2, z);

    // 電柱(一定間隔) + 腕木
    for (let z = -4 - rand() * 4; z > -len; z -= 18) {
      add(m.pole, new THREE.CylinderGeometry(0.14, 0.18, 10, 6), -hw - 9.5, 5, z);
      add(m.pole, box(0.12, 0.12, 2.6), -hw - 9.5, 9.4, z);
      add(m.pole, box(0.12, 0.12, 2.0), -hw - 9.5, 8.4, z);
    }

    // 木: 幹 + 2つの茂み(夕日を背にした濃い色)
    const trees = 5 + Math.floor(rand() * 4);
    for (let i = 0; i < trees; i++) {
      const x = -hw - 20 - rand() * 18;
      const z = -rand() * len;
      const h = 3 + rand() * 3;
      const r = 1.6 + rand() * 1.4;
      add(m.trunk, new THREE.CylinderGeometry(0.2, 0.3, h, 6), x, h / 2, z);
      const leaf = rand() < 0.5 ? m.leaf : m.leaf2;
      add(leaf, new THREE.IcosahedronGeometry(r, 0), x, h + r * 0.6, z);
      add(leaf, new THREE.IcosahedronGeometry(r * 0.75, 0), x + r * 0.5, h + r * 1.3, z - r * 0.3);
    }
    // 校舎沿いの低木
    for (let z = -2; z > -len; z -= 4 + rand() * 3) {
      add(m.leaf, new THREE.IcosahedronGeometry(0.7 + rand() * 0.5, 0), -hw - 5.2, 0.5, z);
    }

    // サッカーゴール(区画によって出る)
    if (rand() < 0.5) {
      const gx = -hw - 28, gz = -6 - rand() * (len - 12);
      add(m.goal, box(0.12, 2.4, 0.12), gx, 1.2, gz - 3.5);
      add(m.goal, box(0.12, 2.4, 0.12), gx, 1.2, gz + 3.5);
      add(m.goal, box(0.12, 0.12, 7.1), gx, 2.4, gz);
    }

    // 遠景の校舎・体育館(点灯した窓が並ぶ。フォグで紫に溶ける)
    const bld = new THREE.Group();
    let z = 0;
    while (z > -len) {
      const w = 12 + rand() * 16;
      const h = 9 + rand() * 12;
      const mesh = new THREE.Mesh(box(w, h, 10), this.buildingMaterial);
      mesh.rotation.y = Math.PI / 2;
      mesh.position.set(-hw - 52 - rand() * 8, h / 2, z - w / 2);
      bld.add(mesh);
      z -= w + rand() * 8;
    }
    group.add(bld);

    for (const [mat, list] of geos) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (merged) group.add(new THREE.Mesh(merged, mat));
    }
  }

  /**
   * 蛍光灯器具(ロッド・ベース・蛍光管)は1区画に4台×5部品あり、そのままだと部品ごとに描画命令が発生する。
   * 動かない部品なので、区画ごとに同じ見た目(マテリアルの種類と色)の部品を1メッシュに結合する。
   * 点滅させる蛍光管(flickeringLightMesh)は色を個別に変えるため結合しない。
   */
  private mergeStaticFixtures(group: THREE.Group): void {
    group.updateMatrixWorld(true);
    const toGroupSpace = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const buckets = new Map<string, { material: THREE.Material; geometries: THREE.BufferGeometry[] }>();
    const merged: THREE.Mesh[] = [];

    for (const fixture of group.children) {
      if (!(fixture instanceof THREE.Group)) continue;
      fixture.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || mesh === this.flickeringLightMesh) return;
        const material = mesh.material as THREE.MeshBasicMaterial | THREE.MeshLambertMaterial;
        const key = `${material.type}:${material.color.getHexString()}`;
        const geometry = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toGroupSpace, mesh.matrixWorld));
        const bucket = buckets.get(key) ?? { material, geometries: [] };
        bucket.geometries.push(geometry);
        buckets.set(key, bucket);
        merged.push(mesh);
      });
    }

    for (const mesh of merged) {
      mesh.removeFromParent();
    }
    for (const { material, geometries } of buckets.values()) {
      const geometry = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (geometry) group.add(new THREE.Mesh(geometry, material));
    }
  }

  /**
   * プレイヤーの位置に合わせて廊下のセグメントを前方に再配置（無限ループ）
   */
  public update(playerZ: number, dt: number): void {
    // 窓の外の空はプレイヤーに追従させる(どこまで走っても同じ夕日・山並みが遠くに見える)
    this.sky.position.z = playerZ;
    // 蛍光灯の点滅演出
    this.flickerTimer += dt;
    if (this.flickeringLightMat) {
      if (Math.sin(this.flickerTimer * 40) > 0.6 && Math.random() > 0.4) {
        this.flickeringLightMat.color.setHex(0x444444);
      } else {
        this.flickeringLightMat.color.setHex(0xffffff);
      }
    }

    // プレイヤーが前進（Zが負の方向へ移動）するにつれて、
    // プレイヤーよりも後方に十分離れたセグメントを最前線へ移動
    const cutoffDistance = this.SEGMENT_LENGTH;

    for (const seg of this.segments) {
      if (seg.group.position.z > playerZ + cutoffDistance) {
        // 最も奥（最小のZ）にあるセグメントを探す
        let minZ = 0;
        for (const s of this.segments) {
          if (s.group.position.z < minZ) {
            minZ = s.group.position.z;
          }
        }
        // そのさらに奥へ再配置
        seg.group.position.z = minZ - this.SEGMENT_LENGTH;
      }
    }
  }

  public reset(): void {
    for (let i = 0; i < this.segments.length; i++) {
      this.segments[i].group.position.z = -i * this.SEGMENT_LENGTH;
    }
    this.resetFog();
  }

  /**
   * クリア演出（校門通過）で変化させたフォグを、通常の夕暮れフォグへ戻す
   */
  public resetFog(): void {
    this.fog.color.setHex(this.DEFAULT_FOG_COLOR);
    this.fog.density = this.DEFAULT_FOG_DENSITY;
  }
}
