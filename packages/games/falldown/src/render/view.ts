// ===========================================================
//  3D 描画（Three.js）
// ===========================================================
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { W, type Block } from '../game/world.ts';
import { GOAL_DEPTH, GOAL_Y, type Game } from '../game/game.ts';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { bombTextures, crackTexture, friezeTexture, gemTextures, glowTexture, goldTempleTexture, obsidianTextures, oreRockTextures, rayTexture, soilTexture, rulerNumberTexture, rulerTileTexture, skyTexture, sunEmblemTexture } from './textures.ts';
import { PlayerModel } from './playerModel.ts';
import { Decor } from './decor.ts';
import { hash } from './hash.ts';
import { Particles } from './particles.ts';

// ルビー / トパーズ / エメラルド / サファイア
export const BLOCK_COLORS = [0xff2e52, 0xffb51f, 0x1fd677, 0x2f7dff];
const HALF = (W - 1) / 2;
const MAX_BLOCKS = 9 * 40;
const WALL_COLS = 7;
/** 目盛り板の位置。手前の壁ブロック(奥行1.2、前面はz≒0.5〜0.65)のわずかに手前 */
const RULER_W = 0.8;
const RULER_X = -HALF - 2;
const RULER_Z = 0.7;

/** 地層ごとの雰囲気 */
export const STRATA = [
  { depth: 0, name: '表土層', back: 0x6b4a2e, wall: 0x7b5634, fog: 0x2a1a10 },
  { depth: 100, name: '赤土層', back: 0x6e2d1f, wall: 0x8a3b24, fog: 0x2a0c08 },
  { depth: 200, name: '岩盤層', back: 0x3c4552, wall: 0x56616f, fog: 0x0c1118 },
  { depth: 300, name: '水晶洞', back: 0x3b2a5c, wall: 0x54407e, fog: 0x120a24 },
  { depth: 400, name: 'マグマ層', back: 0x4a1608, wall: 0x6b2410, fog: 0x260500 },
  { depth: 480, name: '黄金郷の入口', back: 0x6a4a12, wall: 0x9a7020, fog: 0x3a2806 },
];

/** 深さに対応する地層の番号(STRATAの添字) */
function strataIndex(depth: number) {
  let i = 0;
  while (i < STRATA.length - 1 && depth >= STRATA[i + 1].depth) i++;
  return i;
}

/** 現在の層と、次の層までの情報。最後の層の次は黄金郷(ゴール) */
export function strataProgress(depth: number) {
  const i = strataIndex(depth);
  const next = i + 1 < STRATA.length ? { name: STRATA[i + 1].name, depth: STRATA[i + 1].depth } : { name: '黄金郷', depth: GOAL_DEPTH };
  return { name: STRATA[i].name, nextName: next.name, remain: Math.max(0, Math.ceil(next.depth - depth)) };
}

/** 毎フレーム呼ぶので、色のオブジェクトは使い回す(返すものは、次に呼ぶまでの間だけ有効) */
const strataColors = { back: new THREE.Color(), wall: new THREE.Color(), fog: new THREE.Color() };
const strataTmp = new THREE.Color();
function strataAt(depth: number) {
  const i = strataIndex(depth);
  const a = STRATA[i];
  const b = STRATA[Math.min(i + 1, STRATA.length - 1)];
  // 境界の手前 20m でなめらかに切り替え
  const t = a === b ? 0 : THREE.MathUtils.smoothstep(depth, b.depth - 20, b.depth);
  strataColors.back.setHex(a.back).lerp(strataTmp.setHex(b.back), t);
  strataColors.wall.setHex(a.wall).lerp(strataTmp.setHex(b.wall), t);
  strataColors.fog.setHex(a.fog).lerp(strataTmp.setHex(b.fog), t);
  return strataColors;
}
const SKY_FOG = new THREE.Color(0x8fd0ff);
// 毎フレーム使う色は、使うたびに作らず、ここで1つずつ持つ
const PULSE_WHITE = new THREE.Color(0xffffff);
const PULSE_ORANGE = new THREE.Color(0xff6a3a);
const PULSE_AMBER = new THREE.Color(0xffb060);
const GOLD_SPARK = new THREE.Color(0xffd34d);


export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  private bloom: UnrealBloomPass;

  private colorMesh: THREE.InstancedMesh;
  private hardMesh: THREE.InstancedMesh;
  private bedrockMesh: THREE.InstancedMesh;
  private bombMesh: THREE.InstancedMesh;
  private bombMat: THREE.MeshStandardMaterial;
  private crackMesh: THREE.InstancedMesh;
  private capsuleMesh: THREE.InstancedMesh;
  private capsuleGlow: THREE.InstancedMesh;
  private heartMesh: THREE.InstancedMesh;
  private heartGlow: THREE.InstancedMesh;
  /** 壁の岩。エリアごとにテクスチャが違うので、エリアごとに1つずつ持つ */
  private wallMeshes: THREE.InstancedMesh[] = [];
  private decor: Decor;
  private backWall: THREE.Mesh;
  private backTexes: THREE.Texture[] = [];
  private surface = new THREE.Group();
  private eldorado = new THREE.Group();
  private goldTex!: THREE.CanvasTexture;
  private goldLight!: THREE.PointLight;
  private sunEmblem!: THREE.Mesh;
  private gateGlow!: THREE.Mesh;
  private gateRays!: THREE.Group;
  private gateLight!: THREE.PointLight;
  private braziers: { outer: THREE.Mesh; inner: THREE.Mesh; halo: THREE.Mesh; light: THREE.PointLight; seed: number }[] = [];
  private godRays: THREE.Mesh[] = [];
  private envMap!: THREE.Texture;
  private lamp: THREE.PointLight;
  private fillLight: THREE.DirectionalLight;
  private player = new PlayerModel();
  particles: Particles;
  private labels = new Map<number, THREE.Mesh>();
  private rulerNumGeo = new THREE.PlaneGeometry(0.5, 0.25);

  private camY = 2;
  private camX = 0;
  private shakeAmp = 0;
  /** 爆発の火の玉・衝撃波（時間とともに広がって消える） */
  private blasts: { fire: THREE.Mesh; core: THREE.Mesh; ring: THREE.Mesh; t: number; life: number; scale: number; back: boolean }[] = [];
  private blastGeo = new THREE.IcosahedronGeometry(0.5, 2);
  private ringGeo = new THREE.RingGeometry(0.82, 1, 56);
  /**
   * 爆発のマテリアルの置き場。爆発のたびに作って捨てると、使う爆発が途切れた瞬間にシェーダ(プログラム)も解放されて、
   * 次の爆発でコンパイルし直す(数十ms〜数百ms止まる)。捨てずに使い回し、起動時にコンパイルも済ませておく
   */
  private blastMats: THREE.MeshBasicMaterial[] = [];
  private boomLight: THREE.PointLight;
  /** 爆発の瞬間にブルーム（にじむ光）を強める量 */
  private fogColor = new THREE.Color();
  /** 壁の並べ直しが要るかの判定用(行の範囲と壁の色が同じなら、前の結果を使い回す) */
  private wallKey = '';
  private bloomKick = 0;
  /** ゴール到達の演出中、キャラクターを見やすくする度合い(0〜1。なめらかに変わる) */
  private focus = 0;
  private time = 0;
  private hitPulse = new Map<number, number>();
  private tmpM = new THREE.Matrix4();
  private tmpQ = new THREE.Quaternion();
  private tmpE = new THREE.Euler();
  private tmpV = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpC = new THREE.Color();

  constructor(container: HTMLElement) {
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    this.renderer = r;

    this.camera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 80);
    this.scene.background = new THREE.Color(0x120a06);
    this.scene.fog = new THREE.Fog(0x120a06, 13, 30);

    // ---- ライト ----
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const hemi = new THREE.HemisphereLight(0xfff1d6, 0x2a1a10, 0.7);
    this.scene.add(hemi);
    this.fillLight = new THREE.DirectionalLight(0xffffff, 1.35);
    this.fillLight.position.set(4, 8, 10);
    this.scene.add(this.fillLight, this.fillLight.target);
    this.lamp = new THREE.PointLight(0xffd59a, 10, 10, 1.4);
    this.scene.add(this.lamp);
    this.boomLight = new THREE.PointLight(0xff9a40, 0, 26, 1.5);
    this.scene.add(this.boomLight);

    // ---- ブロック ----
    const geo = new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.1);
    // 宝石の映り込み用の環境マップ（ブロックにだけ使う）
    const pmrem = new THREE.PMREMGenerator(r);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.envMap = envMap;
    this.colorMesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshPhysicalMaterial({
        ...gemTextures(),
        normalScale: new THREE.Vector2(1.4, 1.4),
        roughness: 0.12,
        metalness: 0.1,
        clearcoat: 0.6,
        clearcoatRoughness: 0.06,
        envMap,
        envMapIntensity: 0.5,
      }),
      MAX_BLOCKS,
    );
    this.hardMesh = new THREE.InstancedMesh(
      geo,
      new THREE.MeshStandardMaterial({ ...oreRockTextures(), roughness: 1, metalness: 0.55, envMap, envMapIntensity: 0.7 }),
      MAX_BLOCKS,
    );
    this.bedrockMesh = new THREE.InstancedMesh(
      new RoundedBoxGeometry(0.98, 0.98, 0.98, 2, 0.05),
      new THREE.MeshPhysicalMaterial({
        ...obsidianTextures(),
        roughness: 1,
        metalness: 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.05,
        envMap,
        envMapIntensity: 0.45,
      }),
      MAX_BLOCKS,
    );
    this.bombMat = new THREE.MeshStandardMaterial({
      ...bombTextures(),
      emissive: 0xffffff,
      emissiveIntensity: 1,
      roughness: 1,
      metalness: 0.4,
      envMap,
      envMapIntensity: 0.5,
    });
    this.bombMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.08), this.bombMat, MAX_BLOCKS);
    this.crackMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.96, 0.96, 0.96),
      new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, opacity: 0.85 }),
      MAX_BLOCKS,
    );
    this.capsuleMesh = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(0.2, 0.34, 6, 14),
      new THREE.MeshStandardMaterial({ color: 0x8ff0ff, emissive: 0x10b8ff, emissiveIntensity: 1.1, roughness: 0.2 }),
      64,
    );
    this.capsuleGlow = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.44, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.1, depthWrite: false }),
      64,
    );
    // ハート（残機回復）
    const hs = new THREE.Shape();
    hs.moveTo(0, -0.5);
    hs.bezierCurveTo(-0.15, -0.35, -0.55, -0.1, -0.5, 0.18);
    hs.bezierCurveTo(-0.45, 0.45, -0.1, 0.5, 0, 0.25);
    hs.bezierCurveTo(0.1, 0.5, 0.45, 0.45, 0.5, 0.18);
    hs.bezierCurveTo(0.55, -0.1, 0.15, -0.35, 0, -0.5);
    const heartGeo = new THREE.ExtrudeGeometry(hs, { depth: 0.16, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 16 });
    heartGeo.center();
    heartGeo.scale(0.72, 0.72, 0.72);
    this.heartMesh = new THREE.InstancedMesh(
      heartGeo,
      new THREE.MeshStandardMaterial({ color: 0xff3f6c, emissive: 0xff1a50, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 }),
      32,
    );
    this.heartGlow = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.46, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xff8fb0, transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }),
      32,
    );
    for (const m of [this.colorMesh, this.hardMesh, this.bedrockMesh, this.bombMesh, this.crackMesh, this.capsuleMesh, this.capsuleGlow, this.heartMesh, this.heartGlow]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
      this.scene.add(m);
    }
    // instanceColor を確保
    this.colorMesh.setColorAt(0, new THREE.Color());
    this.hardMesh.setColorAt(0, new THREE.Color());
    this.bedrockMesh.setColorAt(0, new THREE.Color());
    this.bombMesh.setColorAt(0, new THREE.Color());

    // ---- 坑道の壁 ----
    const wallGeo = new RoundedBoxGeometry(1, 1, 1.2, 2, 0.08);
    for (let i = 0; i < STRATA.length; i++) {
      const mesh = new THREE.InstancedMesh(
        wallGeo,
        new THREE.MeshStandardMaterial({ map: soilTexture(i), roughness: 0.95 }),
        WALL_COLS * 2 * 26,
      );
      mesh.setColorAt(0, new THREE.Color());
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      this.wallMeshes.push(mesh);
    }

    // ---- 土の壁に埋め込んだ目盛り板(深さd(m) = ワールドのy: 1 - d) ----
    const tileTex = rulerTileTexture();
    tileTex.repeat.set(1, GOAL_DEPTH / 5);
    const tape = new THREE.Mesh(
      new THREE.PlaneGeometry(RULER_W, GOAL_DEPTH),
      new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.6, metalness: 0.05 }),
    );
    tape.position.set(RULER_X, 1 - GOAL_DEPTH / 2, RULER_Z);
    this.scene.add(tape);

    for (const mesh of this.wallMeshes) {
      // 壁と同じ絵(転送は1回だけ)を、奥の壁では細かく敷く
      const t = (mesh.material as THREE.MeshStandardMaterial).map!.clone();
      t.repeat.set(4, 6);
      t.needsUpdate = true;
      this.backTexes.push(t);
    }
    this.backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 2 * WALL_COLS, 30),
      new THREE.MeshStandardMaterial({ map: this.backTexes[0], roughness: 1, color: 0x6b4a2e }),
    );
    this.backWall.position.z = -0.75;
    this.scene.add(this.backWall);

    // ---- エリア固有の飾り(化石・水晶・溶岩など) ----
    this.decor = new Decor(
      this.scene,
      [HALF + 1.4, HALF + 6.2],
      HALF + 0.2,
      [RULER_X, RULER_W / 2 + 0.3],
      RULER_Z + 0.02,
      -0.72,
    );

    this.buildSurface();
    this.buildEldorado();
    this.scene.add(this.player.root);
    this.particles = new Particles(this.scene);

    // ---- ポストエフェクト ----
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.5, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    window.addEventListener('resize', () => this.resize());
    this.resize();

    // 最初に出す瞬間の、シェーダのコンパイルとテクスチャの転送でカクつかないよう、いまのうちに済ませておく
    // (飾りは、はじめて画面に出たときに初期化されて、数百ミリ秒止まっていた)
    for (const mesh of this.wallMeshes) this.renderer.initTexture((mesh.material as THREE.MeshStandardMaterial).map!);
    for (const t of this.backTexes) this.renderer.initTexture(t);
    for (const t of this.decor.textures) this.renderer.initTexture(t);
    // 実際の描画は、ポストエフェクトの描画先に描く。画面に直接描く設定でコンパイルすると、別のシェーダ(トーンマップの有無が違う)になって、事前に済ませた意味がなくなる
    // シェーダは、画面にある光の数でも変わる。黄金郷(金色の光を含む)が見えているときと見えていないときの両方を、先にコンパイルする
    this.renderer.setRenderTarget(this.composer.readBuffer);
    const eldoradoShown = this.eldorado.visible;
    // 爆発のマテリアルも、ここでシェーダを作っておく(はじめての爆発で止まらないように)
    const warm = [0xff7a1a, 0xfff2b0, 0xffd9a0].map((c) => new THREE.Mesh(this.blastGeo, this.takeBlastMat(c)));
    this.scene.add(...warm);
    for (const shown of [false, true]) {
      this.eldorado.visible = shown;
      this.renderer.compile(this.scene, this.camera);
    }
    this.eldorado.visible = eldoradoShown;
    for (const m of warm) {
      this.scene.remove(m);
      this.blastMats.push(m.material as THREE.MeshBasicMaterial);
    }
    this.renderer.setRenderTarget(null);
  }

  private buildSurface() {
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(W + 2 * WALL_COLS + 30, 16),
      new THREE.MeshBasicMaterial({ map: skyTexture(), fog: false }),
    );
    sky.position.set(0, 8.5, -0.7);
    this.surface.add(sky);
    // 地表の左右の地面と芝生（坑道の上はふさがない）
    const gw = WALL_COLS + 15;
    for (const s of [-1, 1]) {
      const cx = s * (HALF + 0.5 + gw / 2);
      const ground = new THREE.Mesh(
        new THREE.BoxGeometry(gw, 1, 1.4),
        new THREE.MeshStandardMaterial({ color: 0x7b5634, roughness: 0.9 }),
      );
      ground.position.set(cx, 0, -0.1);
      const grass = new THREE.Mesh(
        new THREE.BoxGeometry(gw, 0.22, 1.5),
        new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8 }),
      );
      grass.position.set(cx, 0.6, -0.1);
      this.surface.add(ground, grass);
    }
    // 木
    for (const [x, h] of [[-9, 2.4], [-7.4, 1.8], [8.2, 2.1], [10, 2.7]]) {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, h, 8), new THREE.MeshStandardMaterial({ color: 0x6d4c2f }));
      trunk.position.set(x, 0.6 + h / 2, -0.3);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.85, 1), new THREE.MeshStandardMaterial({ color: 0x2e9d4a, flatShading: true }));
      leaf.position.set(x, 0.6 + h + 0.4, -0.3);
      this.surface.add(trunk, leaf);
    }
    this.scene.add(this.surface);
  }

  /** ゴールの黄金郷：古代の太陽神殿。プレイヤーは神殿の屋上に降り立つ */
  private buildEldorado() {
    const env = this.envMap;
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd36a, metalness: 1, roughness: 0.3, envMap: env, envMapIntensity: 1.0, emissive: 0x1a0e00,
    });
    const darkGold = new THREE.MeshStandardMaterial({
      color: 0x8a5a14, metalness: 0.8, roughness: 0.45, envMap: env, envMapIntensity: 0.9, emissive: 0x140800,
    });
    const width = W + 2 * WALL_COLS + 6;
    const F = GOAL_Y - 0.5; // 屋上の高さ
    const add = (m: THREE.Object3D, x: number, y: number, z: number) => {
      m.position.set(x, y, z);
      this.eldorado.add(m);
      return m;
    };

    // ---- 屋上の石板（ここに着地する）と、雷文の帯飾り ----
    this.goldTex = goldTempleTexture();
    this.goldTex.repeat.set(width / 2, 1);
    add(new THREE.Mesh(
      new THREE.BoxGeometry(width, 1.5, 2.6),
      new THREE.MeshStandardMaterial({
        map: this.goldTex, metalness: 0.85, roughness: 0.35, envMap: env, envMapIntensity: 1.1, emissive: 0xffb020, emissiveIntensity: 0.1,
      }),
    ), 0, F - 0.75, -0.2);
    const frieze = friezeTexture();
    frieze.repeat.set(width / 1.1, 1);
    add(new THREE.Mesh(
      new THREE.PlaneGeometry(width, 0.95),
      new THREE.MeshStandardMaterial({ map: frieze, metalness: 0.7, roughness: 0.4, envMap: env, envMapIntensity: 1, emissive: 0x2a1400 }),
    ), 0, F - 0.8, 1.11);
    add(new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, 2.8), goldMat), 0, F - 0.1, -0.2);
    add(new THREE.Mesh(new THREE.BoxGeometry(width, 0.2, 2.9), goldMat), 0, F - 1.5, -0.2);

    // ---- 列柱の広間：奥は暗く、太陽の門の光がもれる ----
    const hallTop = F - 1.6, hallH = 5;
    add(new THREE.Mesh(
      new THREE.PlaneGeometry(width, hallH),
      new THREE.MeshStandardMaterial({ map: (() => { const t = goldTempleTexture(); t.repeat.set(width / 2, 2.5); return t; })(), color: 0x3a2408, roughness: 0.8, metalness: 0.4, envMap: env, envMapIntensity: 0.25 }),
    ), 0, hallTop - hallH / 2, -1.2);
    const colGeo = new THREE.CylinderGeometry(0.34, 0.4, hallH - 0.7, 20, 1);
    const ringGeo = new THREE.TorusGeometry(0.42, 0.07, 8, 24);
    const capGeo = new THREE.BoxGeometry(1.05, 0.3, 1.05);
    for (const x of [-10.4, -7.6, -4.8, -2.2, 2.2, 4.8, 7.6, 10.4]) {
      const cy = hallTop - hallH / 2;
      add(new THREE.Mesh(colGeo, goldMat), x, cy, 0.4);
      add(new THREE.Mesh(capGeo, darkGold), x, hallTop - 0.2, 0.4);
      add(new THREE.Mesh(capGeo, darkGold), x, hallTop - hallH + 0.2, 0.4);
      for (const k of [0.25, 0.75]) {
        const r = add(new THREE.Mesh(ringGeo, darkGold), x, hallTop - 0.35 - (hallH - 0.7) * k, 0.4);
        r.rotation.x = Math.PI / 2;
      }
    }

    // ---- 中央の太陽の門：回る紋章と、光の輪 ----
    const gy = hallTop - hallH / 2;
    const glow = glowTexture();
    const glowMat = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ map: glow, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.gateGlow = add(new THREE.Mesh(new THREE.PlaneGeometry(7, 7), glowMat(0xffa030, 0.6)), 0, gy, -1.1) as THREE.Mesh;
    const gate = add(new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.2, 14, 64), goldMat), 0, gy, 0.15);
    gate.castShadow = true;
    add(new THREE.Mesh(new THREE.TorusGeometry(2.05, 0.06, 8, 64), darkGold), 0, gy, 0.15);
    // 門のまわりの光の歯（ゆっくり回る）
    this.gateRays = new THREE.Group();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const ray = new THREE.Mesh(new THREE.ConeGeometry(0.13, i % 2 ? 0.5 : 0.8, 4), goldMat);
      const r = 2.2 + (i % 2 ? 0.25 : 0.4);
      ray.position.set(Math.cos(a) * r, Math.sin(a) * r, 0);
      ray.rotation.z = a - Math.PI / 2;
      this.gateRays.add(ray);
    }
    add(this.gateRays, 0, gy, 0.1);
    const sun = new THREE.Mesh(
      new THREE.PlaneGeometry(3.2, 3.2),
      new THREE.MeshStandardMaterial({
        map: sunEmblemTexture(), transparent: true, metalness: 0.6, roughness: 0.3, emissive: 0xffaa00, emissiveIntensity: 0.45, depthWrite: false,
      }),
    );
    this.sunEmblem = add(sun, 0, gy, 0.05) as THREE.Mesh;

    // ---- 正面の大階段（下へ行くほど広く、手前へせり出す） ----
    const stepMat = new THREE.MeshStandardMaterial({
      map: (() => { const t = goldTempleTexture(); t.repeat.set(width / 2, 0.25); return t; })(),
      metalness: 0.8, roughness: 0.4, envMap: env, envMapIntensity: 0.9,
    });
    const base = hallTop - hallH;
    for (let i = 0; i < 6; i++) {
      const d = 2.6 + i * 0.55;
      add(new THREE.Mesh(new THREE.BoxGeometry(width, 0.42, d), stepMat), 0, base - 0.21 - i * 0.42, -1.3 + d / 2);
    }

    // ---- 屋上の守護像（左右）と、燃えさかる聖火台 ----
    this.braziers = [];
    for (const s of [-1, 1]) {
      const sx = s * (HALF + 2.6);
      // 台座
      add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.5, 1.1), darkGold), sx, F + 0.25, 1.4);
      // 体・頭・羽根飾り（太陽の神官の像）
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.52, 1.5, 6), darkGold), sx, F + 1.25, 1.4);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.56), goldMat), sx, F + 2.3, 1.4);
      add(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.08, 0.2), darkGold), sx, F + 2.36, 1.7);
      for (let i = 0; i < 7; i++) {
        const a = -0.9 + (i / 6) * 1.8;
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.85, 4), i % 2 ? goldMat : darkGold);
        f.position.set(sx + Math.sin(a) * 0.5, F + 2.75 + Math.cos(a) * 0.4, 1.3);
        f.rotation.z = -a;
        this.eldorado.add(f);
      }
      // 腕に抱えた宝珠
      const orb = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.2, 1),
        new THREE.MeshStandardMaterial({ color: BLOCK_COLORS[s < 0 ? 0 : 2], emissive: BLOCK_COLORS[s < 0 ? 0 : 2], emissiveIntensity: 0.9, roughness: 0.1 }),
      );
      add(orb, sx, F + 1.4, 1.85);

      // 聖火台：金の鉢と炎、ゆらめく光
      const bx = s * (HALF + 1.05);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.9, 10), darkGold), bx, F + 0.45, 1.5);
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.32, 16, 1, true), goldMat), bx, F + 1.05, 1.5);
      const flameMat = (c: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
      const outer = add(new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 12, 1, true), flameMat(0xff6a1a)), bx, F + 1.6, 1.5);
      const inner = add(new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.6, 10, 1, true), flameMat(0xffe27a)), bx, F + 1.45, 1.52);
      const halo = add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), glowMat(0xff8a2a, 0.35)), bx, F + 1.55, 1.45);
      const light = new THREE.PointLight(0xff9a3a, 0, 7, 1.6);
      add(light, bx, F + 1.8, 2.2);
      this.braziers.push({ outer: outer as THREE.Mesh, inner: inner as THREE.Mesh, halo: halo as THREE.Mesh, light, seed: s * 3.1 });

      // 財宝の山と宝石
      const pile = add(new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.55, 16), goldMat), s * (HALF + 4.3), F + 0.28, 1.3);
      pile.scale.set(1, 1, 0.7);
      for (let i = 0; i < 4; i++) {
        const gem = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.13),
          new THREE.MeshStandardMaterial({ color: BLOCK_COLORS[i], emissive: BLOCK_COLORS[i], emissiveIntensity: 0.7, roughness: 0.1, metalness: 0.2 }),
        );
        gem.rotation.set(i, i * 2, 0);
        add(gem, s * (HALF + 3.8 + i * 0.32), F + 0.2 + (i % 2) * 0.22, 1.75);
      }
    }

    // ---- 上から差しこむ光の筋 ----
    const rayTex = rayTexture();
    this.godRays = [];
    for (const [x, w, rot] of [[-2.6, 2.2, 0.18], [0.4, 3, 0.1], [3.2, 1.8, 0.22]] as const) {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, 13),
        new THREE.MeshBasicMaterial({ map: rayTex, color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      );
      m.rotation.z = rot;
      add(m, x, F + 5.5, 1.9);
      this.godRays.push(m);
    }

    this.goldLight = new THREE.PointLight(0xffc94a, 0, 18, 1.1);
    add(this.goldLight, 0, F + 1.5, 3);
    // 門の光で、広間の中を下から照らす
    this.gateLight = new THREE.PointLight(0xffa640, 0, 12, 1.4);
    add(this.gateLight, 0, gy, 1.6);
    this.scene.add(this.eldorado);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    // 縦長画面でも坑道の横幅が収まるように
    const needW = W + 3;
    const dist = 12.5;
    const vfovForWidth = 2 * Math.atan(needW / 2 / dist / this.camera.aspect) * (180 / Math.PI);
    this.camera.fov = Math.max(46, Math.min(vfovForWidth, 80));
    this.camera.updateProjectionMatrix();
  }

  /** カメラをプレイヤー位置に即座に合わせる */
  snapCamera(game: Game) {
    this.camY = game.player.y - 1.0;
    this.camX = (game.player.x - HALF) * 0.3;
  }

  /** 被弾などの画面揺れ */
  shake(amount: number) {
    this.shakeAmp = Math.max(this.shakeAmp, amount);
  }

  /** 爆発：火の玉と衝撃波が広がり、周囲が一瞬明るく光る。scale が大きいほど派手 */
  /** back: true なら、キャラクターの後ろ(奥)で爆発させる */
  explosion(x: number, y: number, scale = 1, back = false) {
    const mk = (geo: THREE.BufferGeometry, color: number, z: number) => {
      const mat = this.takeBlastMat(color);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      this.scene.add(m);
      return m;
    };
    this.blasts.push({
      fire: mk(this.blastGeo, 0xff7a1a, back ? -1.4 : 0.5),
      core: mk(this.blastGeo, 0xfff2b0, back ? -1.3 : 0.6),
      ring: mk(this.ringGeo, 0xffd9a0, back ? -1.2 : 0.9),
      t: 0,
      life: 0.55 + 0.25 * scale,
      scale,
      back,
    });
    // 奥の爆発は、キャラクターを照らさず、にじむ光も弱める(キャラクターを見やすくする)
    if (!back) this.boomLight.position.set(x, y, 3);
    this.bloomKick = Math.min(this.bloomKick + (back ? 0.25 : 0.9) * scale, 2.5);
  }

  private takeBlastMat(color: number) {
    const mat = this.blastMats.pop() ?? new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    mat.color.setHex(color);
    mat.opacity = 1;
    return mat;
  }

  private updateBlasts(dt: number) {
    let light = 0;
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      const u = b.t / b.life;
      if (u >= 1) {
        for (const m of [b.fire, b.core, b.ring]) {
          this.scene.remove(m);
          this.blastMats.push(m.material as THREE.MeshBasicMaterial);
        }
        this.blasts.splice(i, 1);
        continue;
      }
      const e = 1 - Math.pow(1 - u, 3);
      b.fire.scale.setScalar(b.scale * (0.6 + 3.4 * e));
      (b.fire.material as THREE.MeshBasicMaterial).opacity = 0.9 * Math.pow(1 - u, 1.6);
      b.core.scale.setScalar(b.scale * (0.3 + 1.6 * e));
      (b.core.material as THREE.MeshBasicMaterial).opacity = Math.pow(1 - u, 3);
      b.ring.scale.setScalar(b.scale * (0.6 + 7 * e));
      (b.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - u);
      if (!b.back) light = Math.max(light, 70 * b.scale * Math.pow(1 - u, 2));
    }
    this.boomLight.intensity = light;
    this.bloomKick *= Math.exp(-dt * 4);
    this.bloom.strength = (0.5 + this.bloomKick) * (1 - 0.55 * this.focus);
  }

  pulse(blockId: number) {
    this.hitPulse.set(blockId, 1);
  }

  /** ワールド座標 → 画面座標(px) */
  toScreen(x: number, y: number) {
    this.tmpV.set(x - HALF, y, 0.6).project(this.camera);
    return {
      x: (this.tmpV.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.tmpV.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  /** 目盛り板の中心(深さ d m の高さ)の画面座標(px)。深さの表示ボックスをここに重ねる */
  rulerTagPos(d: number) {
    return this.toScreen(RULER_X + HALF, 1 - d);
  }

  /** 目盛り板の、画面での幅(px)。深さの表示ボックスを、これより広くするのに使う */
  rulerScreenWidth(d: number) {
    const a = this.toScreen(RULER_X + HALF - RULER_W / 2, 1 - d).x;
    const b = this.toScreen(RULER_X + HALF + RULER_W / 2, 1 - d).x;
    return Math.abs(b - a);
  }

  wx(x: number) {
    return x - HALF;
  }

  render(dt: number, game: Game) {
    this.time += dt;
    const p = game.player;
    const w = game.world;
    const playing = game.phase !== 'title';
    this.focus += ((game.phase === 'clear' ? 1 : 0) - this.focus) * Math.min(1, dt * 8);
    this.renderer.toneMappingExposure = 1.05 - 0.15 * this.focus;

    // ---- カメラ ----
    const targetY = playing ? p.y - 1.0 : 1.2 + Math.sin(this.time * 0.4) * 0.3;
    const targetX = playing ? (p.x - HALF) * 0.3 : Math.sin(this.time * 0.25) * 0.8;
    const k = 1 - Math.exp(-dt * 5);
    this.camY += (targetY - this.camY) * k;
    this.camX += (targetX - this.camX) * k;
    this.shakeAmp *= Math.exp(-dt * 9);
    const sx = (Math.random() - 0.5) * this.shakeAmp;
    const sy = (Math.random() - 0.5) * this.shakeAmp;
    this.camera.position.set(this.camX + sx, this.camY + 2.0 + sy, 12.5);
    this.camera.lookAt(this.camX * 0.55, this.camY - 0.6, 0);

    const depth = Math.max(0, -this.camY);
    const st = strataAt(depth);
    // 地表付近は明るく、深いほど暗い
    const surfaceT = THREE.MathUtils.clamp((this.camY + 2) / 6, 0, 1);
    const fogC = this.fogColor.copy(st.fog).lerp(SKY_FOG, surfaceT);
    (this.scene.background as THREE.Color).copy(fogC);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(fogC);
    const darkness = Math.min(depth / 600, 1);
    fog.near = 12 - darkness * 1.5;
    fog.far = 32 - darkness * 5;
    this.fillLight.intensity = 1.45 - darkness * 0.3;
    this.fillLight.position.set(this.camX + 4, this.camY + 8, 10);
    this.fillLight.target.position.set(this.camX, this.camY, 0);
    (this.backWall.material as THREE.MeshStandardMaterial).color.copy(st.back).multiplyScalar(1.35);
    this.backWall.position.y = this.camY;
    const backTex = this.backTexes[strataIndex(depth)];
    (this.backWall.material as THREE.MeshStandardMaterial).map = backTex;
    backTex.offset.y = this.camY / 5;
    this.backWall.visible = this.camY < 12;
    this.surface.visible = this.camY > -14;
    // 黄金郷が近づくと金色に照らされ、光の粒が舞う
    const toGoal = this.camY - GOAL_Y;
    this.eldorado.visible = toGoal < 30;
    if (this.eldorado.visible) {
      const near = THREE.MathUtils.clamp(1 - toGoal / 18, 0, 1);
      // ゴール到達の演出中(focus)は、キャラクターを見やすくするため、周りの光を弱める
      const dim = 1 - 0.85 * this.focus;
      this.goldLight.intensity = near * (20 + Math.sin(this.time * 2) * 4) * dim;
      // 太陽の門：紋章はゆっくり回り、光の歯は逆回り、奥の光が脈打つ
      this.sunEmblem.rotation.z = this.time * 0.25;
      this.gateRays.rotation.z = -this.time * 0.12;
      const beat = 0.5 + 0.5 * Math.sin(this.time * 1.6);
      (this.gateGlow.material as THREE.MeshBasicMaterial).opacity = 0.35 + beat * 0.25;
      this.gateGlow.scale.setScalar(1 + beat * 0.08);
      this.gateLight.intensity = near * (9 + beat * 5) * dim;
      // 聖火台の炎のゆらめき
      for (const b of this.braziers) {
        const t = this.time * 9 + b.seed;
        const f = 1 + Math.sin(t) * 0.12 + Math.sin(t * 2.3) * 0.08;
        b.outer.scale.set(1 + Math.sin(t * 1.7) * 0.06, f, 1);
        b.inner.scale.set(1, 1 + Math.sin(t * 2.9) * 0.15, 1);
        b.outer.rotation.y = t * 0.3;
        (b.halo.material as THREE.MeshBasicMaterial).opacity = 0.22 + f * 0.1;
        b.light.intensity = near * 5 * f * dim;
      }
      this.godRays.forEach((m, i) => {
        (m.material as THREE.MeshBasicMaterial).opacity = near * (0.13 + 0.06 * Math.sin(this.time * 0.7 + i * 2));
      });
      if (near > 0 && Math.random() < near * dt * 30) {
        const x = (Math.random() - 0.5) * (W + 8);
        this.particles.sparkle(x, GOAL_Y - 0.3 + Math.random() * 3, GOLD_SPARK, 1, 0.25);
      }
    }

    // ---- ブロック ----
    const minY = Math.floor(this.camY - 11);
    const maxY = Math.ceil(this.camY + 11);
    let nc = 0, nh = 0, nk = 0, na = 0, nb = 0, nl = 0, nx = 0;
    for (let y = minY; y <= maxY; y++) {
      for (let x = 0; x < W; x++) {
        const b = w.get(x, y);
        if (!b) continue;
        if (b.kind === 'life') {
          if (nl >= 32) continue;
          this.placeHeart(nl++, b);
          continue;
        }
        if (b.kind === 'air') {
          if (na >= 64) continue;
          this.placeCapsule(na++, b);
          continue;
        }
        const pulse = this.hitPulse.get(b.id) ?? 0;
        const sc = 1 - pulse * 0.14;
        let bx = b.x - HALF;
        const by = b.y - b.offset;
        if (b.shake >= 0) bx += Math.sin(this.time * 70 + b.id) * 0.07;
        this.tmpE.set(pulse * 0.08 * Math.sin(b.id), pulse * 0.1, 0);
        this.tmpQ.setFromEuler(this.tmpE);
        this.tmpM.compose(this.tmpV.set(bx, by, 0), this.tmpQ, this.tmpS.set(sc, sc, sc));
        const dmg = 1 - b.hp / b.maxHp;
        if (b.kind === 'color') {
          if (nc >= MAX_BLOCKS) continue;
          this.colorMesh.setMatrixAt(nc, this.tmpM);
          this.tmpC.setHex(BLOCK_COLORS[b.color]);
          // 深い層ほど鈍い光沢に／耐久が高いほど少し濃い
          this.tmpC.multiplyScalar(1 - dmg * 0.35 - Math.min(b.maxHp - 1, 3) * 0.06);
          if (pulse > 0) this.tmpC.lerp(PULSE_WHITE, pulse * 0.6);
          this.colorMesh.setColorAt(nc++, this.tmpC);
        } else if (b.kind === 'bedrock') {
          if (nb >= MAX_BLOCKS) continue;
          this.bedrockMesh.setMatrixAt(nb, this.tmpM);
          this.tmpC.setScalar(1);
          if (pulse > 0) this.tmpC.lerp(PULSE_ORANGE, pulse * 0.6);
          this.bedrockMesh.setColorAt(nb++, this.tmpC);
        } else if (b.kind === 'bomb') {
          if (nx >= MAX_BLOCKS) continue;
          this.bombMesh.setMatrixAt(nx, this.tmpM);
          this.tmpC.setScalar(1);
          if (pulse > 0) this.tmpC.lerp(PULSE_AMBER, pulse * 0.6);
          this.bombMesh.setColorAt(nx++, this.tmpC);
        } else {
          if (nh >= MAX_BLOCKS) continue;
          this.hardMesh.setMatrixAt(nh, this.tmpM);
          this.tmpC.setScalar(1 - dmg * 0.4);
          if (pulse > 0) this.tmpC.lerp(PULSE_WHITE, pulse * 0.5);
          this.hardMesh.setColorAt(nh++, this.tmpC);
        }
        if (dmg > 0 && nk < MAX_BLOCKS) {
          const cs = sc * (0.95 + dmg * 0.05);
          this.tmpE.set(0, 0, (b.id % 4) * Math.PI / 2);
          this.tmpQ.setFromEuler(this.tmpE);
          this.tmpM.compose(this.tmpV.set(bx, by, 0), this.tmpQ, this.tmpS.set(cs, cs, cs));
          this.crackMesh.setMatrixAt(nk++, this.tmpM);
        }
      }
    }
    for (const [id, v] of this.hitPulse) {
      const nv = v - dt * 6;
      if (nv <= 0) this.hitPulse.delete(id);
      else this.hitPulse.set(id, nv);
    }
    this.colorMesh.count = nc;
    this.hardMesh.count = nh;
    this.bedrockMesh.count = nb;
    this.bombMesh.count = nx;
    // 導火線と注意縞を、脈打つように光らせて「触ると危ない」ことを伝える
    this.bombMat.emissiveIntensity = 0.7 + 0.7 * (0.5 + 0.5 * Math.sin(this.time * 6));
    this.crackMesh.count = nk;
    this.capsuleMesh.count = na;
    this.capsuleGlow.count = na;
    this.heartMesh.count = nl;
    this.heartGlow.count = nl;
    for (const m of [this.colorMesh, this.hardMesh, this.bedrockMesh, this.bombMesh, this.crackMesh, this.capsuleMesh, this.capsuleGlow, this.heartMesh, this.heartGlow]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }

    this.updateWalls(minY, maxY, depth);
    this.decor.update(minY, maxY);
    this.updateLabels(minY, maxY);

    // ---- プレイヤー ----
    this.player.root.visible = true;
    this.player.update(dt, game, HALF);
    this.lamp.position.set(p.x - HALF + p.facing * 0.4, p.y + 0.8, 2.6);
    // 演出中は、キャラクターの手前のランプを強めて、見やすくする
    this.lamp.intensity = playing ? (10 + darkness * 14) * (1 + 1.2 * this.focus) : 0;
    this.lamp.distance = 9 + darkness * 3 + 4 * this.focus;

    this.particles.update(dt);
    this.updateBlasts(dt);
    this.composer.render();
  }

  private placeCapsule(i: number, b: Block) {
    const bx = b.x - HALF;
    const by = b.y - b.offset + Math.sin(this.time * 3 + b.id) * 0.06;
    this.tmpE.set(0.3, this.time * 1.8 + b.id, 0.5 + Math.sin(this.time * 2 + b.id) * 0.2);
    this.tmpQ.setFromEuler(this.tmpE);
    this.tmpM.compose(this.tmpV.set(bx, by, 0), this.tmpQ, this.tmpS.set(1, 1, 1));
    this.capsuleMesh.setMatrixAt(i, this.tmpM);
    const g = 1 + Math.sin(this.time * 4 + b.id) * 0.05;
    this.tmpM.compose(this.tmpV.set(bx, by, 0), this.tmpQ.identity(), this.tmpS.set(g, g, g));
    this.capsuleGlow.setMatrixAt(i, this.tmpM);
  }

  private placeHeart(i: number, b: Block) {
    const bx = b.x - HALF;
    const by = b.y - b.offset + Math.sin(this.time * 3 + b.id) * 0.06;
    // ドクンドクンと脈打ちながらゆっくり回る
    const beat = 1 + Math.max(0, Math.sin(this.time * 7)) * 0.12;
    this.tmpE.set(0, Math.sin(this.time * 1.5 + b.id) * 0.6, 0);
    this.tmpQ.setFromEuler(this.tmpE);
    this.tmpM.compose(this.tmpV.set(bx, by, 0.1), this.tmpQ, this.tmpS.set(beat, beat, beat));
    this.heartMesh.setMatrixAt(i, this.tmpM);
    this.tmpM.compose(this.tmpV.set(bx, by, 0), this.tmpQ.identity(), this.tmpS.set(beat, beat, beat));
    this.heartGlow.setMatrixAt(i, this.tmpM);
  }

  private updateWalls(minY: number, maxY: number, depth: number) {
    const st = strataAt(depth);
    // 行の範囲と壁の色が前のフレームと同じなら、並べ直さない(インスタンスの転送が毎フレーム走るのを避ける)
    const key = `${minY}|${maxY}|${st.wall.getHex()}`;
    if (key === this.wallKey) return;
    this.wallKey = key;
    const counts = this.wallMeshes.map(() => 0);
    const max = this.wallMeshes[0].instanceMatrix.count;
    for (let y = Math.min(maxY, -1); y >= Math.max(minY, GOAL_Y); y--) {
      // この行がどのエリアか(エリアごとに岩のテクスチャが違う)
      const k = strataIndex(1 - y);
      const mesh = this.wallMeshes[k];
      for (let i = 0; i < WALL_COLS; i++) {
        for (const side of [-1, 1]) {
          const n = counts[k];
          if (n >= max) break;
          const x = side < 0 ? -1 - i : W + i;
          const h = hash(x, y);
          const z = -0.1 - i * 0.05 + h * 0.15;
          this.tmpQ.identity();
          this.tmpM.compose(this.tmpV.set(x - HALF, y, z), this.tmpQ, this.tmpS.set(1, 1, 1));
          mesh.setMatrixAt(n, this.tmpM);
          if (y < GOAL_Y + 6) {
            // 黄金郷の神殿の壁
            this.tmpC.setHex(0xe0a826).multiplyScalar(0.55 + h * 0.4 - i * 0.04);
          } else {
            this.tmpC.copy(st.wall).multiplyScalar(0.8 + h * 0.35 - i * 0.04);
          }
          mesh.setColorAt(n, this.tmpC);
          counts[k]++;
        }
      }
    }
    this.wallMeshes.forEach((mesh, k) => {
      mesh.count = counts[k];
      mesh.visible = counts[k] > 0; // 何も描かないメッシュは、描画の呼び出しごと省く
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }

  private updateLabels(minY: number, maxY: number) {
    for (let y = minY; y <= maxY; y++) {
      const d = 1 - y;
      if (d <= 0 || d > GOAL_DEPTH || this.labels.has(d)) continue;
      const five = d % 5 === 0;
      const m = new THREE.Mesh(
        this.rulerNumGeo,
        new THREE.MeshStandardMaterial({
          map: rulerNumberTexture(String(d), five),
          transparent: true,
          roughness: 0.6,
          metalness: 0.05,
          depthWrite: false,
        }),
      );
      m.scale.setScalar(five ? 1.15 : 0.85);
      // 目盛りの線の少し下、板の左寄りに刻む
      m.position.set(RULER_X - RULER_W / 2 + 0.05 + (five ? 0.29 : 0.21), y - 0.16, RULER_Z + 0.01);
      this.scene.add(m);
      this.labels.set(d, m);
    }
    for (const [d, m] of this.labels) {
      const y = 1 - d;
      if (y > maxY + 6 || y < minY - 6) {
        this.scene.remove(m);
        (m.material as THREE.MeshStandardMaterial).map?.dispose();
        (m.material as THREE.Material).dispose();
        this.labels.delete(d);
      }
    }
  }

  clearLabels() {
    for (const m of this.labels.values()) {
      this.scene.remove(m);
      (m.material as THREE.MeshStandardMaterial).map?.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.labels.clear();
  }
}
