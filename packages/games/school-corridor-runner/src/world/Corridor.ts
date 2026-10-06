import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GlassReflection } from './GlassReflection';
import {
  createFloorTexture,
  createWallTexture,
  createWindowWallTexture,
  createPlainWallTexture,
  createOutsideSkyTexture,
  createBuildingWindowsTexture,
  createSunPatchTexture,
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
  private leftWallMaterialPlain: THREE.MeshStandardMaterial;
  private ceilingMaterial: THREE.MeshStandardMaterial;
  private lightMaterial: THREE.MeshBasicMaterial;
  private sunPatchMaterial: THREE.MeshBasicMaterial;       // 左の窓から床へ差す光だまり
  private glassReflection: GlassReflection; // 右のドアガラスに映る廊下の中(平面反射)

  // 左壁: 窓なしチャンクを一定間隔で挟むためのカウンタ
  private leftWallChunkIndex = 0;
  private readonly LEFT_WALL_CHUNK_LEN = 9; // createWindowWallTexture/createPlainWallTexture 1枚ぶんの幅(m)
  private readonly LEFT_WALL_PLAIN_INTERVAL = 4; // このチャンク数に1回、窓なしにする(9m×4=36mごとに9m幅)

  // 窓の外の景色(屋外シーン): 空の板はプレイヤーに追従し、地面・木・校舎などは区画ごとに作る
  private sky: THREE.Mesh;
  private outsideMaterials: Record<'ground' | 'track' | 'line' | 'fence' | 'trunk' | 'leaf' | 'leaf2' | 'pole' | 'goal', THREE.MeshLambertMaterial>;
  private buildingMaterial: THREE.MeshBasicMaterial;
  private segmentCounter = 0;

  // ドアの窓越しに見える教室の中(右壁の外側): 机・椅子・黒板
  private classroomMaterials: Record<'wall' | 'deskTop' | 'deskLeg' | 'chair' | 'blackboard' | 'blackboardFrame', THREE.MeshBasicMaterial>;
  private classroomCounter = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 夕暮れのフォグ（奥が夕暮れの茜色に包まれる）
    this.fog = new THREE.FogExp2(this.DEFAULT_FOG_COLOR, this.DEFAULT_FOG_DENSITY);
    this.scene.fog = this.fog;

    // テクスチャ
    const floorTex = createFloorTexture();
    const rightWallTex = createWallTexture();
    // 左壁は9m幅のチャンク単位で窓あり/窓なしを切り替えるので、テクスチャは1チャンク分(repeat 1,1)のまま使う
    const windowTex = createWindowWallTexture();
    const plainTex = createPlainWallTexture();

    // マテリアル
    this.floorMaterial = new THREE.MeshStandardMaterial({
      map: floorTex,
      roughness: 0.35,  // ワックスの反射感
      metalness: 0.15,
    });

    const additive = (map: THREE.Texture, opacity: number) =>
      new THREE.MeshBasicMaterial({
        map,
        transparent: true,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
    this.sunPatchMaterial = additive(createSunPatchTexture(), 0.3);
    this.glassReflection = new GlassReflection(this.CORRIDOR_WIDTH / 2);

    this.rightWallMaterial = new THREE.MeshStandardMaterial({
      map: rightWallTex,
      roughness: 0.8,
      alphaTest: 0.5,          // ドアの窓ガラス部分は透明にして、奥の教室(addClassroomInterior)を見せる
      side: THREE.DoubleSide,
    });

    this.leftWallMaterial = new THREE.MeshStandardMaterial({
      map: windowTex,
      roughness: 0.7,
      emissive: 0xff7043,
      emissiveIntensity: 0.15, // 夕日の反射発光
      alphaTest: 0.5,          // ガラスの部分は透明にして、外の景色を見せる
      side: THREE.DoubleSide,
    });

    // 左壁(窓なし版): 窓側と全く同じ色味(漆喰・腰壁の配色、夕日の反射発光)で統一し、一定間隔で挟んで単調な「ずっと窓」を崩す
    this.leftWallMaterialPlain = new THREE.MeshStandardMaterial({
      map: plainTex,
      roughness: 0.7,
      emissive: 0xff7043,
      emissiveIntensity: 0.15,
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

    // ドアの窓越しに見える教室の中。廊下の光がほぼ届かない位置なので、陰影に頼るランバートだと
    // どんな色を仕込んでも真っ黒になってしまう。照明計算をしない単色(MeshBasicMaterial)にして、
    // 設定した色がそのまま確実に見えるようにする(屋外の夕焼けに対して室内は少し落ち着いた色味)。
    this.classroomMaterials = {
      wall: new THREE.MeshBasicMaterial({ color: 0x3d3348 }),
      deskTop: new THREE.MeshBasicMaterial({ color: 0x9a7848 }),
      deskLeg: new THREE.MeshBasicMaterial({ color: 0x5a4530 }),
      chair: new THREE.MeshBasicMaterial({ color: 0x6a6a7a }),
      blackboard: new THREE.MeshBasicMaterial({ color: 0x1f6b48 }),
      blackboardFrame: new THREE.MeshBasicMaterial({ color: 0x7a5530 }),
    };

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

  /**
   * 左の窓(z0〜z1)から床へ差し込む夕日の光だまり。壁際が強く、右へ行くほど薄れる。
   * 夕日は左・やや手前側から射すので、奥(-z)へ流れるように斜めに伸ばす。
   */
  private createSunPatchGeometry(hw: number, z0: number, z1: number): THREE.BufferGeometry {
    const reach = 7;   // 壁から床へ光が届く幅(m)
    const shift = -3;  // 届く先で奥へずれる量(m)
    const y = 0.03;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([
      -hw, y, z0,
      -hw, y, z1,
      -hw + reach, y, z1 + shift,
      -hw + reach, y, z0 + shift,
    ], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    return geo;
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

    // 3. 左壁（教室窓側: 夕日の見える大窓。LEFT_WALL_CHUNK_LEN幅ごとに区切り、
    //    LEFT_WALL_PLAIN_INTERVALチャンクに1回だけ一定間隔・一定幅で窓なしの壁を挟む）
    const chunkLen = this.LEFT_WALL_CHUNK_LEN;
    const sunPatches: THREE.BufferGeometry[] = [];
    const chunksPerSegment = len / chunkLen;
    for (let i = 0; i < chunksPerSegment; i++) {
      const isPlain = this.leftWallChunkIndex % this.LEFT_WALL_PLAIN_INTERVAL === 0;
      this.leftWallChunkIndex++;

      const chunkGeo = new THREE.PlaneGeometry(chunkLen, this.CORRIDOR_HEIGHT);
      const chunk = new THREE.Mesh(chunkGeo, isPlain ? this.leftWallMaterialPlain : this.leftWallMaterial);
      chunk.rotation.y = Math.PI / 2;
      chunk.position.set(-hw, this.CORRIDOR_HEIGHT / 2, -(i * chunkLen) - chunkLen / 2);
      group.add(chunk);

      if (!isPlain) {
        // 窓(3枚/チャンク)ごとに、床へ斜めに伸びる光だまりを置く。窓の幅は3m
        const zNear = -(i * chunkLen);
        for (let j = 0; j < 3; j++) {
          const z1 = zNear - j * 3;
          sunPatches.push(this.createSunPatchGeometry(hw, z1, z1 - 3));
        }
      }
    }
    if (sunPatches.length) {
      const merged = mergeGeometries(sunPatches, false);
      sunPatches.forEach((g) => g.dispose());
      if (merged) {
        const patchMesh = new THREE.Mesh(merged, this.sunPatchMaterial);
        patchMesh.renderOrder = 1;
        group.add(patchMesh);
      }
    }

    // 右壁のドアガラス(2枚)に、廊下の中の反射を映す。位置は createWallTexture の窓の位置に合わせてある
    const glassPanes: Array<[number, number]> = [[-14.9, -10.0], [-8.6, -3.7]];
    const reflections = glassPanes.map(([za, zb]) => {
      const g = new THREE.PlaneGeometry(zb - za, 3.5);
      g.rotateY(-Math.PI / 2);
      g.translate(hw - 0.04, 4.85, (za + zb) / 2);
      return g;
    });
    const reflectionGeo = mergeGeometries(reflections, false);
    reflections.forEach((g) => g.dispose());
    if (reflectionGeo) {
      const reflectionMesh = new THREE.Mesh(reflectionGeo, this.glassReflection.material);
      reflectionMesh.renderOrder = 1;
      this.glassReflection.addGlass(reflectionMesh);
      group.add(reflectionMesh);
    }

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
    this.addClassroomInterior(group, len, hw);
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
   * ドアの窓越しに見える教室の中: 机・椅子の簡易シルエットと黒板。
   * 右壁(教室ドア)のガラス部分は実際に透過しているので、その奥(x > hw)に配置する。
   * addOutsideSceneryと同じく区画ごとの決定的PRNGで配置を変え、マテリアルごとに1メッシュへ結合する。
   */
  private addClassroomInterior(group: THREE.Group, len: number, hw: number): void {
    const seed = ++this.classroomCounter;
    let state = seed * 104729 + 31; // 屋外の景色とは別の乗数で、独立したランダム列にする
    const rand = () => ((state = (state * 16807) % 2147483647) / 2147483647);
    const geos = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const add = (mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
      const g = geo.clone();
      g.translate(x, y, z);
      const list = geos.get(mat) ?? [];
      list.push(g);
      geos.set(mat, list);
    };
    const m = this.classroomMaterials;
    const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
    const zMid = -len / 2;

    // 奥の壁: 窓からどんな角度で覗いても外の空が突き抜けて見えないよう、上下左右にかなり余裕を持たせて覆う
    add(m.wall, box(0.3, 40, len + 10), hw + 5.0, this.CORRIDOR_HEIGHT / 2, zMid);

    // 黒板(奥の壁の手前、区画の全長にわたる帯)
    add(m.blackboardFrame, box(0.15, 1.6, len - 1), hw + 4.6, 2.3, zMid);
    add(m.blackboard, box(0.1, 1.4, len - 1.6), hw + 4.55, 2.3, zMid);

    // 机・椅子の列(2列、たまに空席を挟んで単調にならないようにする)
    const rowXs = [hw + 2.0, hw + 3.1];
    for (const x of rowXs) {
      for (let z = -1.5 - rand() * 1.5; z > -len; z -= 2.0 + rand() * 0.6) {
        if (rand() < 0.15) continue;
        add(m.deskTop, box(0.7, 0.08, 0.5), x, 1.1, z);
        add(m.deskLeg, box(0.06, 1.05, 0.06), x - 0.28, 0.53, z - 0.18);
        add(m.deskLeg, box(0.06, 1.05, 0.06), x + 0.28, 0.53, z - 0.18);
        add(m.chair, box(0.4, 0.06, 0.4), x, 0.55, z + 0.35);
        add(m.chair, box(0.4, 0.5, 0.06), x, 0.8, z + 0.52);
      }
    }

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
    // 区画は[z-長さ, z]を覆う。カメラ(プレイヤーより後ろにいることがある)の足元まで床が続くよう、
    // 区画が完全に後方へ抜けてから再配置する
    const cutoffDistance = this.SEGMENT_LENGTH + 12;

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

  /**
   * クリア演出用: 廊下をz=exitZで切り落とし、その先(z<exitZ)を描画しない。
   * nullで解除。廊下の区画は使い回されるので、位置ではなくワールド空間のクリップ面で切る。
   */
  public setExitClip(exitZ: number | null): void {
    const planes = exitZ === null ? null : [new THREE.Plane(new THREE.Vector3(0, 0, 1), -exitZ)];
    const touched = new Set<THREE.Material>();
    for (const seg of this.segments) {
      seg.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (touched.has(m)) continue;
          touched.add(m);
          m.clippingPlanes = planes;
          m.needsUpdate = true;
        }
      });
    }
  }

  /** 右のドアガラスの反射を描く。本番の描画の直前に毎フレーム呼ぶ */
  public renderGlassReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.glassReflection.render(renderer, scene, camera);
  }

  public reset(): void {
    this.setExitClip(null);
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
