// グラグラタワー (TOWER STACK)
// 落ちてくるブロックを物理演算で積み上げ、できるだけ高いタワーを目指すゲーム。
// 描画: Three.js (透視カメラ・影つきの3D表示) / 物理: cannon-es (Z方向を固定して2Dとして使う)
import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { installHomeReturn, returnToHub } from '../../../shared/homeReturn';
import { ArcadePause } from '../../../shared/arcadePause';
import { reportDeathPoint, reportDeepAnalytics, reportRoundStart } from '../../../shared/arcadeAnalytics';
import { BestMarker } from './bestMarker';
import { buttonIconHtml, mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu';
import { MenuNav } from '../../../shared/arcadeMenuNav';
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { countUpText } from '../../../shared/arcadeScoreCountUp';
import { setText, setDisplay } from '../../../shared/hudDom';
import { loadLeaderboardAndCheck, loadRawScores, saveLeaderboardScore, type LeaderboardEntry } from '../../../shared/arcadeLeaderboard';
import { renderRankingList } from '../../../shared/arcadeRankingList';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';
import { PIECES, partExtents, randomPieceIndex, resetPieceBag, type Cell, type Part, type PieceDef } from './pieces';
import { ModeSelect } from '../../../shared/online/ModeSelect';
import { BLOCKS_SOLID_SVG, TROPHY_SOLID_SVG, PEOPLE_SOLID_SVG, DROP_SOLID_SVG } from '../../../shared/online/modeIcons';
import { SOLO_ART, ONLINE_ART } from './modeArt';
import { Bgm } from './bgm';
import type { PublicStatus } from '../../../shared/online/core';
import { ATTACK_EVERY, ATTACK_KINDS, MAX_SNAP_BLOCKS, STATE_INTERVAL_MS } from '../../../shared/towerProtocol';
import type { BlockSnap, PlayerInfo, ResultEntry, ServerMsg, TowerState } from '../../../shared/towerProtocol';
import { createNet, fetchTowerStatus, PLAYER_COLORS_LIGHT } from './online/net';
import { WaitScreen } from './online/WaitScreen';
import { RivalStages, STAGE_SPACING, BETWEEN_TAG_X } from './online/RivalStages';
import { readGamepads } from '../../../shared/gamepadFrame';
import { benchDone, benchMark, benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import { finishPrograms, waitFramesSettled } from '../../../shared/shaderCompile';
import { createWhiteNoiseBuffer } from '../../../shared/audioUtils';
import { startArcadeTutorial, type ArcadeTutorialHandle } from '../../../shared/arcadeTutorial';

installHomeReturn();
// リザルトで無操作が続いたらタイトルへ戻る
watchResultAutoReturn(['result-btn-title']);

const SLUG = 'tower-stack'; // 共通ランキングでの名前 (packages/shared/arcadeLeaderboardCore.ts に定義)
const ACCENT = '#ffd166';
const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));

if (isPreview) {
  const style = document.createElement('style');
  style.textContent = `
    #hud, #result-modal, #banner, #edge-alert, #event-label, #event-fx, .agc-root, .ats-overlay { display: none !important; }
  `;
  document.head.appendChild(style);
}

// 画面左下の共通ボタンガイド (場面ごとに差し替える)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
const guidePlay = () => mountArcadeGuide({
  moveLabel: '移動',
  keyMoveKeys: 'A / D',
  buttons: [
    { indices: [0, 2], label: '回転', keyLabel: 'W' },
    { indices: [13], label: '落とす', keyLabel: 'S' },
    { indices: [1, 3], label: 'アイテムを使う', keyLabel: 'Enter' },
  ],
  showHomeHint: true, backLabel: 'ポーズ',
});
const guideMenu = () => mountArcadeGuide({
  moveLabel: '選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideResult = () => mountArcadeGuide({
  moveLabel: '選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: 'タイトルへ' },
  ],
  showHomeHint: true, backLabel: 'タイトルへ',
});

// ───────────────────────── 定数 ─────────────────────────
const VIEW_H = 20; // 画面に映る高さ(m)
const PLATFORM_HALF_W = 6;
const MAX_DROPS = 3;
const KILL_Y = -3.5; // これより下に落ちたブロックは「落下」
const MOVE_STEP = 0.5;
const MOVE_LIMIT = 8;
const ITEM_EVERY = 6; // 何個置くごとにアイテムがもらえるか(以前は3個ごと)
const ITEM_MAX = 3;
const VINE_RANGE = 2.3; // ツタが届く距離 (セル中心どうし。約2マス)
const VINE_DELAY = 0.3; // 着地してからツタが伸びるまでの秒数
const VINE_COLOR = 0x3fae4a;
const RESULT_DELAY = 1.6; // ゲームオーバーからリザルトが出るまでの秒数
const FIRST_FIX_DELAY = 0.8; // 1個目のブロックが着地してから固定されるまでの秒数
const HISCORE_KEY = 'tower-stack-hiscore';
const LEVEL_EVERY = 6; // 何個置くごとにレベル(落下スピード)が上がるか
const MAX_LEVEL = 10;
/** レベルごとの落下スピード(m/秒)。1 から MAX_LEVEL まで段階的に速くなる */
function levelSpeed(lv: number): number {
  return 3.0 + (lv - 1) * 0.5;
}

type ItemKind = 'glue' | 'cement' | 'heal';
const ITEM_INFO: Record<ItemKind, { name: string; desc: string }> = {
  glue: { name: 'ツタ', desc: '周りのブロックを固定する' },
  cement: { name: 'セメント', desc: '積んだブロックを全部固める' },
  heal: { name: '回復', desc: '残機を1つ回復する' },
};
const ITEM_KINDS: ItemKind[] = ['glue', 'cement', 'heal'];

type EventKind = 'wind' | 'quake' | 'meteor' | 'speed';
const EVENT_INFO: Record<EventKind, { name: string; desc: string; duration: number }> = {
  wind: { name: '突風', desc: '横からの風でブロックが流される', duration: 6 },
  quake: { name: '地震', desc: '土台がゆれる', duration: 4.5 },
  meteor: { name: 'いん石', desc: '空から石が降ってくる', duration: 5 },
  speed: { name: '加速', desc: 'ブロックの落下が速くなる', duration: 8 },
};
// 地震 ('quake') は難しすぎるので出さない。戻すときはこの配列に 'quake' を足す
const EVENT_KINDS: EventKind[] = ['wind', 'meteor', 'speed'];

// ───────────────────────── 描画セットアップ ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
// PCFSoftShadowMap は three.js で廃止済みで、最初の影の描画で PCFShadowMap に読み替えられる(警告つき)。
// その読み替えでシェーダのキーが変わり、起動時の先読みコンパイルが、実際に使うシェーダと一致しなくなっていた。最初から PCFShadowMap にしておく
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const SKY_LOW = new THREE.Color(0x8ecdf7);
const SKY_HIGH = new THREE.Color(0x0a0f2c);
scene.background = SKY_LOW.clone();
scene.fog = new THREE.Fog(SKY_LOW.clone(), 70, 190);

// 透視カメラ。Z=0 の面で縦 VIEW_H メートルが映る距離に、正面を向けて置く
const CAM_FOV = 30;
const CAM_TAN = Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
/** いま画面に映している高さ(m)。オンライン対戦ではステージを並べるぶん広くなる */
let viewH = VIEW_H;
/** カメラの左右の中心(自分のステージが原点) */
let camX = 0;
const CAM_OFFSET_X = 0; // 0 なら正面から。増やすと斜めから見る (3D化直後は 2.5)
const CAM_OFFSET_Y = 0; // 0 なら正面から。増やすと見下ろす (3D化直後は 3.5)
const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 500);
let viewHalfW = 10; // Z=0 の面で画面に映る横幅の半分

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight(0xdcefff, 0x8a6f55, 1.25));
const sun = new THREE.DirectionalLight(0xfff2dc, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const rim = new THREE.DirectionalLight(0x9fc4ff, 0.7);
rim.position.set(10, 4, -12);
scene.add(rim);

// ブロックの影を受ける奥の壁(透明。影だけ映る)。カメラについてくる
const shadowWall = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.38 }));
shadowWall.position.z = -1.2;
shadowWall.receiveShadow = true;
scene.add(shadowWall);

// ぼんやりした丸のテクスチャ (炎・火花・雲・光に使う)
function makeSoftTexture(blobs: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let i = 0; i < blobs; i++) {
    const r = blobs === 1 ? 64 : 26 + Math.random() * 26;
    const x = blobs === 1 ? 64 : 64 + (Math.random() - 0.5) * (128 - r * 2);
    const y = blobs === 1 ? 64 : 64 + (Math.random() - 0.5) * (128 - r * 2);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const softTex = makeSoftTexture(1);
const puffTex = makeSoftTexture(7);

// 土台 (木の台 + 上面の板) と支柱
const platformMesh = new THREE.Group();
{
  const base = new THREE.Mesh(
    new RoundedBoxGeometry(PLATFORM_HALF_W * 2, 1, 3, 3, 0.12),
    new THREE.MeshStandardMaterial({ color: 0x7a5236, roughness: 0.85 }),
  );
  base.castShadow = true;
  base.receiveShadow = true;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(PLATFORM_HALF_W * 2 - 0.1, 0.1, 2.9),
    new THREE.MeshStandardMaterial({ color: 0xb98a5e, roughness: 0.7 }),
  );
  top.position.y = 0.455;
  top.receiveShadow = true;
  platformMesh.add(base, top);
}
scene.add(platformMesh);
const pillar = new THREE.Mesh(
  new THREE.CylinderGeometry(0.9, 1.5, 80, 20),
  new THREE.MeshStandardMaterial({ color: 0x6f6a66, roughness: 0.95 }),
);
pillar.position.set(0, -41, 0);
pillar.receiveShadow = true;
scene.add(pillar);

// 遠くの雲と、高く登ると見えてくる星
for (let i = 0; i < 26; i++) {
  const cloud = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xffffff, transparent: true, opacity: 0.5 + Math.random() * 0.3, depthWrite: false }));
  const w = 14 + Math.random() * 16;
  cloud.scale.set(w, w * 0.45, 1);
  cloud.position.set((Math.random() - 0.5) * 110, -6 + Math.random() * 110, -30 - Math.random() * 40);
  scene.add(cloud);
}
const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0, fog: false, depthWrite: false });
{
  const pos: number[] = [];
  for (let i = 0; i < 700; i++) pos.push((Math.random() - 0.5) * 320, 30 + Math.random() * 330, -90 - Math.random() * 30);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  scene.add(new THREE.Points(geo, starMat));
}

// 高さの目盛り (5mごと)。文字の材質は使い回す(対戦では相手のステージにも同じ目盛りを出す)
const scaleLabelGeo = new THREE.PlaneGeometry(2.4, 0.9);
const scaleLabelMats = new Map<string, THREE.MeshBasicMaterial>();
function makeLabel(text: string): THREE.Mesh {
  let mat = scaleLabelMats.get(text);
  if (!mat) {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 48;
    const g = c.getContext('2d')!;
    g.font = '900 30px "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.textBaseline = 'middle';
    g.fillText(text, 4, 24);
    mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
    scaleLabelMats.set(text, mat);
  }
  return new THREE.Mesh(scaleLabelGeo, mat);
}
/** 目盛りの文字(5m〜300m)を、土台の左に並べる。ステージごとに1組 */
function addScaleLabels(parent: THREE.Object3D): void {
  for (let h = 5; h <= 300; h += 5) {
    const label = makeLabel(`${h}m`);
    label.position.set(-6.3, h + 0.5, -0.75);
    parent.add(label);
  }
}
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
for (let h = 5; h <= 300; h += 5) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(300, 0.04), lineMat);
  line.position.set(0, h, -0.75);
  scene.add(line);
}
addScaleLabels(scene);

// 最高到達: 黒い点線と、目盛りと同じ左側に出す黒いブロック(線の中心に重ねて手前に出す)
const ownMarker = new BestMarker({ color: '#000000', width: 300, tagX: -6.6 });
scene.add(ownMarker.group);

// 過去のランキングの高さの基準線(ひとりで遊ぶときだけ。上位3位)
const rankMarkers: THREE.Object3D[] = [];
let rankMarkerSeq = 0;
function makeRankLabel(text: string, color: string, rank: number): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 176;
  c.height = 56;
  const g = c.getContext('2d')!;
  g.fillStyle = color; // 順位の色のブロック
  g.fillRect(0, 0, 176, 56);
  g.font = '900 34px "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 112, 30);
  // ブロックの中の左に、順位の数字を入れたメダル
  g.beginPath();
  g.arc(30, 28, 21, 0, Math.PI * 2);
  g.fillStyle = RANK_MEDALS[rank - 1] ?? '#ffffff';
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#2a2118';
  g.font = '900 30px "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';
  g.fillText(String(rank), 30, 30);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.98, 0.63),
    new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false, fog: false }),
  );
  m.renderOrder = 10;
  return m;
}
const RANK_MEDALS = ['#ffd24a', '#d3dae3', '#e08a4a']; // メダルの色(金・銀・銅)
const RANK_COLORS = ['#a87400', '#66727f', '#a4531f']; // 金・銀・銅(白文字が読める濃さ)
// 順位の線に使う点線(白の点線を、線ごとに順位の色で塗る)
const rankDashTex = (() => {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 4;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 18, 4);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.set(300 / 0.9, 1);
  t.magFilter = THREE.NearestFilter;
  return t;
})();
function clearRankMarkers(): void {
  rankMarkerSeq++;
  for (const o of rankMarkers) {
    scene.remove(o);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.material !== undefined && (m.material as THREE.MeshBasicMaterial).map !== rankDashTex) (m.material as THREE.MeshBasicMaterial).map?.dispose();
      (m.material as THREE.Material).dispose();
      if (m.geometry !== undefined) m.geometry.dispose();
    });
  }
  rankMarkers.length = 0;
}
function loadRankMarkers(): void {
  clearRankMarkers();
  if (mode !== 'solo' || isPreview) return;
  const seq = rankMarkerSeq;
  void loadRawScores(SLUG).then((list) => {
    if (seq !== rankMarkerSeq || mode !== 'solo') return; // 取得中にやり直された・対戦に入った(対戦にはランキングの線を出さない)
    for (const e of list.slice(0, 3)) {
      const h = e.score / 100; // スコアは高さ(m)×100
      const color = RANK_COLORS[e.rank - 1] ?? '#ffffff';
      const g = new THREE.Group();
      const line = new THREE.Mesh(new THREE.PlaneGeometry(300, 0.1), new THREE.MeshBasicMaterial({ color, map: rankDashTex, transparent: true }));
      const label = makeRankLabel(`${h.toFixed(1)}m`, color, e.rank);
      label.position.set(6.51, 0, 0); // 自分の高さ(左側)と向かい合う右側に、線の中心に合わせて置く
      g.add(line, label);
      g.position.set(0, h, -0.8);
      scene.add(g);
      rankMarkers.push(g);
    }
  });
}

// 土台の位置の目印: 両端の縦線は常に表示し、土台が画面の下に隠れたら画面下にバーを出す
const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
const edgeLines = [-1, 1].map((side) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 160), edgeMat);
  m.position.set(side * PLATFORM_HALF_W, 0, -1.5);
  scene.add(m);
  return m;
});
const baseMarker = new THREE.Group();
baseMarker.add(new THREE.Mesh(
  new THREE.PlaneGeometry(PLATFORM_HALF_W * 2, 0.3),
  new THREE.MeshBasicMaterial({ color: 0xffffff }),
));
for (const side of [-1, 1]) {
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  cap.position.set(side * (PLATFORM_HALF_W - 0.15), 0.3, 0);
  baseMarker.add(cap);
}
const baseLabel = makeLabel('▼ 土台');
baseLabel.position.set(1.2 - PLATFORM_HALF_W + 0.5, 0.75, 0);
baseMarker.add(baseLabel);
baseMarker.position.z = 2;
baseMarker.visible = false;
scene.add(baseMarker);

// 落下位置ガイド (操作中のブロックの真下を薄く光らせる)
const guide = new THREE.Mesh(
  new THREE.PlaneGeometry(1, 80),
  new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16 }),
);
guide.position.z = -0.6;
guide.visible = false;
scene.add(guide);

// ───────────────────────── 物理セットアップ ─────────────────────────
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -20, 0) });
(world.solver as CANNON.GSSolver).iterations = 30;
world.allowSleep = true;
world.defaultContactMaterial.friction = 1.3;
world.defaultContactMaterial.restitution = 0;
world.defaultContactMaterial.contactEquationRelaxation = 4;

const platformBody = new CANNON.Body({ mass: 0, type: CANNON.Body.KINEMATIC });
platformBody.addShape(new CANNON.Box(new CANNON.Vec3(PLATFORM_HALF_W, 0.5, 1)));
platformBody.position.set(0, -0.5, 0);
world.addBody(platformBody);


interface Block {
  body: CANNON.Body;
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  /** 当たり判定の部品(テトリス型はマスごとの箱) */
  parts: Part[];
  /** PIECES の添字(いん石は -1)。オンライン対戦で相手にタワーの形を送るのに使う */
  piece: number;
  cemented: boolean;
  isMeteor: boolean;
  life: number;
}
let blocks: Block[] = [];
let constraints: CANNON.Constraint[] = [];

// ツタ (見た目)。2つのボディのローカル座標どうしを結ぶ
interface Vine { a: CANNON.Body; la: Cell; b: CANNON.Body; lb: Cell; mesh: THREE.Mesh }
let vines: Vine[] = [];
const vineGeo = new THREE.BoxGeometry(1, 0.13, 0.13);
const leafGeo = new THREE.SphereGeometry(0.16, 8, 6);
const vineMat = new THREE.MeshStandardMaterial({ color: VINE_COLOR, roughness: 0.8 });
const leafMat = new THREE.MeshStandardMaterial({ color: 0x7ddc6a, roughness: 0.7 });

function worldPoint(body: CANNON.Body, local: Cell): Cell {
  const a = 2 * Math.atan2(body.quaternion.z, body.quaternion.w);
  const s = Math.sin(a);
  const c = Math.cos(a);
  return [body.position.x + local[0] * c - local[1] * s, body.position.y + local[0] * s + local[1] * c];
}
function addVine(a: CANNON.Body, la: Cell, b: CANNON.Body, lb: Cell): void {
  const mesh = new THREE.Mesh(vineGeo, vineMat);
  for (const t of [-0.3, 0.3]) {
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(t, 0.12 * Math.sign(t), 0.05);
    leaf.scale.set(0.6, 1, 0.5); // 親が長さ方向に伸びるので細めにしておく
    mesh.add(leaf);
  }
  scene.add(mesh);
  vines.push({ a, la, b, lb, mesh });
}
function updateVines(): void {
  for (const v of vines) {
    const [ax, ay] = worldPoint(v.a, v.la);
    const [bx, by] = worldPoint(v.b, v.lb);
    const len = Math.max(0.2, Math.hypot(bx - ax, by - ay));
    v.mesh.position.set((ax + bx) / 2, (ay + by) / 2, 0.6);
    v.mesh.rotation.z = Math.atan2(by - ay, bx - ax);
    v.mesh.scale.x = len;
  }
}
function removeVinesOf(body: CANNON.Body): void {
  vines = vines.filter((v) => {
    if (v.a !== body && v.b !== body) return true;
    scene.remove(v.mesh);
    return false;
  });
}

function lock2D(body: CANNON.Body): void {
  body.linearFactor.set(1, 1, 0);
  body.angularFactor.set(0, 0, 1);
}

function createPiece(index: number, x: number, y: number): Block {
  const def: PieceDef = PIECES[index];
  const body = new CANNON.Body({ mass: def.mass });
  for (const pt of def.parts) {
    const shape = pt.round ? new CANNON.Sphere(pt.hw) : new CANNON.Box(new CANNON.Vec3(pt.hw, pt.hh, 0.5));
    body.addShape(shape, new CANNON.Vec3(pt.x, pt.y, 0));
  }
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.05 });
  const group = def.build(mat);
  lock2D(body);
  body.position.set(x, y, 0);
  body.linearDamping = 0.05;
  body.angularDamping = 0.6;
  body.sleepSpeedLimit = 0.15;
  body.sleepTimeLimit = 0.6;
  world.addBody(body);
  scene.add(group);
  const block: Block = { body, group, mat, parts: def.parts, piece: index, cemented: false, isMeteor: false, life: 0 };
  blocks.push(block);
  return block;
}

function removeBlock(block: Block): void {
  constraints = constraints.filter((c) => {
    if (c.bodyA === block.body || c.bodyB === block.body) {
      world.removeConstraint(c);
      return false;
    }
    return true;
  });
  removeVinesOf(block.body);
  world.removeBody(block.body);
  scene.remove(block.group);
  // 見た目の材質はピースごとに作っているので捨てる(形状は使い回しのものもあるので捨てない)
  block.group.traverse((o) => {
    const m = (o as THREE.Mesh).material;
    if (m) (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
  });
  blocks = blocks.filter((b) => b !== block);
}

function angleOf(body: CANNON.Body): number {
  return 2 * Math.atan2(body.quaternion.z, body.quaternion.w);
}
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
/** ブロックの一番高い所のY座標 */
function topOf(block: Block): number {
  const a = angleOf(block.body);
  const s = Math.sin(a);
  const c = Math.cos(a);
  let top = -Infinity;
  for (const pt of block.parts) {
    const { ey } = partExtents(pt, s, c);
    top = Math.max(top, block.body.position.y + pt.x * s + pt.y * c + ey);
  }
  return top;
}

/** ブロックの左右の端のX座標 (落下位置ガイド用) */
function xRangeOf(block: Block): [number, number] {
  const a = angleOf(block.body);
  const s = Math.sin(a);
  const c = Math.cos(a);
  let lo = Infinity;
  let hi = -Infinity;
  for (const pt of block.parts) {
    const { ex } = partExtents(pt, s, c);
    const cx = block.body.position.x + pt.x * c - pt.y * s;
    lo = Math.min(lo, cx - ex);
    hi = Math.max(hi, cx + ex);
  }
  return [lo, hi];
}

// ───────────────────────── 爆発エフェクト ─────────────────────────
type ParticleKind = 'fire' | 'smoke' | 'spark' | 'debris' | 'ring';
interface Particle {
  kind: ParticleKind;
  obj: THREE.Object3D;
  mat: THREE.Material & { opacity: number; color: THREE.Color };
  vel: THREE.Vector3;
  spin: THREE.Vector3 | null;
  gravity: number; // 下向きの加速度 (負なら上昇)
  drag: number;
  delay: number;
  life: number;
  max: number;
  s0: number;
  s1: number;
}
let particles: Particle[] = [];
const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
const debrisGeo = new RoundedBoxGeometry(0.3, 0.3, 0.3, 2, 0.05);
const FIRE_RAMP = [new THREE.Color(0xffe9a8), new THREE.Color(0xffb53a), new THREE.Color(0xf2601a), new THREE.Color(0x5a0f06)];

// 爆発の光。ライトを増減するとシェーダーの作り直しで一瞬止まるので、最初から2つ置いて使い回す
const flashLights = [0, 1].map(() => {
  const l = new THREE.PointLight(0xffb060, 0, 34, 2);
  scene.add(l);
  return l;
});
let flashIndex = 0;

function rnd(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function randomDir(zScale = 0.6): THREE.Vector3 {
  const a = Math.random() * Math.PI * 2;
  return new THREE.Vector3(Math.cos(a), Math.sin(a), (Math.random() - 0.5) * 2 * zScale).normalize();
}

function addSprite(kind: ParticleKind, x: number, y: number, z: number, map: THREE.Texture, color: number, additive: boolean): { obj: THREE.Sprite; mat: THREE.SpriteMaterial } {
  const mat = new THREE.SpriteMaterial({
    map, color, transparent: true, depthWrite: false, rotation: Math.random() * Math.PI * 2,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !additive,
  });
  const obj = new THREE.Sprite(mat);
  obj.position.set(x, y, z);
  obj.renderOrder = kind === 'smoke' ? 5 : 6;
  scene.add(obj);
  return { obj, mat };
}

/** (x, y) に爆発を出す。color は飛び散る破片の色、power は大きさ */
function explode(x: number, y: number, color: number, power = 1): void {
  // 光
  const light = flashLights[flashIndex++ % flashLights.length];
  light.position.set(x, y, 3);
  light.intensity = 260 * power;

  // 衝撃波のリング
  {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const obj = new THREE.Mesh(ringGeo, mat);
    obj.position.set(x, y, 0.6);
    scene.add(obj);
    particles.push({ kind: 'ring', obj, mat, vel: new THREE.Vector3(), spin: null, gravity: 0, drag: 0, delay: 0, life: 0.4, max: 0.4, s0: 0.3 * power, s1: 7 * power });
  }
  // 火の玉 (白→黄→橙→暗い赤 と色が変わりながらふくらむ)
  for (let i = 0, n = Math.round(12 * power); i < n; i++) {
    const { obj, mat } = addSprite('fire', x + rnd(-0.5, 0.5) * power, y + rnd(-0.5, 0.5) * power, rnd(-0.3, 0.9), softTex, 0xffffff, true);
    const life = rnd(0.45, 0.9);
    particles.push({ kind: 'fire', obj, mat, vel: randomDir().multiplyScalar(rnd(1, 4.5) * power), spin: null, gravity: -1.5, drag: 3, delay: rnd(0, 0.06), life, max: life, s0: rnd(0.8, 1.4) * power, s1: rnd(2.6, 4) * power });
  }
  // 煙 (少し遅れて出て、ふくらみながら昇っていく)
  for (let i = 0, n = Math.round(8 * power); i < n; i++) {
    const grey = rnd(0.1, 0.32);
    const { obj, mat } = addSprite('smoke', x + rnd(-0.7, 0.7) * power, y + rnd(-0.5, 0.7) * power, rnd(-0.4, 0.8), puffTex, new THREE.Color(grey, grey * 0.95, grey * 0.9).getHex(), false);
    const life = rnd(1.4, 2.5);
    const vel = randomDir().multiplyScalar(rnd(0.5, 2.2) * power);
    vel.y += 1.4;
    particles.push({ kind: 'smoke', obj, mat, vel, spin: null, gravity: -1.3, drag: 1.2, delay: rnd(0.06, 0.28), life, max: life, s0: rnd(1, 1.6) * power, s1: rnd(4, 5.5) * power });
  }
  // 火花
  for (let i = 0, n = Math.round(18 * power); i < n; i++) {
    const { obj, mat } = addSprite('spark', x, y, 0.4, softTex, Math.random() < 0.5 ? 0xffe9a0 : 0xff9a3c, true);
    const life = rnd(0.5, 1.1);
    const s = rnd(0.16, 0.34);
    particles.push({ kind: 'spark', obj, mat, vel: randomDir().multiplyScalar(rnd(8, 20) * Math.sqrt(power)), spin: null, gravity: 14, drag: 0.9, delay: 0, life, max: life, s0: s, s1: s * 0.3 });
  }
  // 破片 (ブロックの色のかけらが回りながら飛ぶ)
  for (let i = 0, n = Math.round(7 * power); i < n; i++) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
    const obj = new THREE.Mesh(debrisGeo, mat);
    obj.position.set(x + rnd(-0.4, 0.4), y + rnd(-0.4, 0.4), rnd(-0.3, 0.3));
    obj.castShadow = true;
    scene.add(obj);
    const vel = randomDir(1).multiplyScalar(rnd(4, 12) * Math.sqrt(power));
    vel.y += 4;
    const life = rnd(1.2, 1.9);
    const s = rnd(0.7, 1.5);
    particles.push({ kind: 'debris', obj, mat, vel, spin: new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), gravity: 20, drag: 0.2, delay: 0, life, max: life, s0: s, s1: s });
  }
}

const tmpColor = new THREE.Color();
function updateParticles(dt: number): void {
  for (const l of flashLights) l.intensity *= Math.exp(-dt * 9);
  if (particles.length === 0) return;
  particles = particles.filter((pt) => {
    if (pt.delay > 0) {
      pt.delay -= dt;
      pt.obj.visible = false;
      return true;
    }
    pt.obj.visible = true;
    pt.life -= dt;
    if (pt.life <= 0) {
      scene.remove(pt.obj);
      pt.mat.dispose();
      return false;
    }
    const t = 1 - pt.life / pt.max; // 0 → 1
    pt.vel.multiplyScalar(Math.exp(-pt.drag * dt));
    pt.vel.y -= pt.gravity * dt;
    pt.obj.position.addScaledVector(pt.vel, dt);
    const ease = 1 - Math.pow(1 - t, 3);
    const sc = pt.s0 + (pt.s1 - pt.s0) * ease;
    switch (pt.kind) {
      case 'fire': {
        const f = t * (FIRE_RAMP.length - 1);
        const i = Math.min(FIRE_RAMP.length - 2, Math.floor(f));
        pt.mat.color.copy(tmpColor.copy(FIRE_RAMP[i]).lerp(FIRE_RAMP[i + 1], f - i));
        pt.mat.opacity = 0.5 * Math.pow(1 - t, 1.3);
        pt.obj.scale.set(sc, sc, 1);
        break;
      }
      case 'smoke':
        pt.mat.opacity = 0.6 * Math.min(1, t * 6) * (1 - t);
        pt.obj.scale.set(sc, sc, 1);
        break;
      case 'spark':
        pt.mat.opacity = 1 - t * t;
        pt.obj.scale.set(sc, sc, 1);
        break;
      case 'ring':
        pt.mat.opacity = 0.75 * (1 - t);
        pt.obj.scale.setScalar(sc);
        break;
      case 'debris':
        pt.obj.rotation.x += pt.spin!.x * dt;
        pt.obj.rotation.y += pt.spin!.y * dt;
        pt.obj.rotation.z += pt.spin!.z * dt;
        pt.obj.scale.setScalar(pt.s0 * (1 - Math.pow(t, 4)));
        break;
    }
    return true;
  });
}

function clearParticles(): void {
  for (const pt of particles) {
    scene.remove(pt.obj);
    pt.mat.dispose();
  }
  particles = [];
  for (const l of flashLights) l.intensity = 0;
}

/** ゲームオーバー: 画面上のブロックを全部、爆発とともに弾き飛ばす */
function blowUpAll(): void {
  for (const c of constraints) world.removeConstraint(c);
  constraints = [];
  for (const v of vines) scene.remove(v.mesh);
  vines = [];
  if (blocks.length === 0) return;
  const cx = blocks.reduce((sum, b) => sum + b.body.position.x, 0) / blocks.length;
  const cy = blocks.reduce((sum, b) => sum + b.body.position.y, 0) / blocks.length;
  for (const blk of blocks) {
    const b = blk.body;
    if (b.type !== CANNON.Body.DYNAMIC) {
      // セメントなどで固まっていたブロックも動けるように戻す
      b.type = CANNON.Body.DYNAMIC;
      b.mass = 1;
      b.updateMassProperties();
    }
    b.allowSleep = false;
    b.wakeUp();
    b.collisionResponse = false; // たがいに引っかからずに飛び散らせる
    b.linearFactor.set(1, 1, 1); // ここだけ奥行き方向にも飛ばす
    b.angularFactor.set(1, 1, 1);
    const dx = b.position.x - cx;
    const dy = b.position.y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const sp = 9 + Math.random() * 8;
    b.velocity.set((dx / len) * sp + rnd(-4, 4), (dy / len) * sp * 0.6 + rnd(9, 15), rnd(-7, 9));
    b.angularVelocity.set(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
    explode(b.position.x, b.position.y, blk.mat.color.getHex(), 0.5);
  }
  explode(cx, cy, 0xffffff, 2.4);
  shake = 0.9;
  boom(0.6);
}

// ───────────────────────── 効果音 (Web Audio API) ─────────────────────────
let audio: AudioContext | null = null;
/** BGM。ブラウザは最初の操作のあとでないと音を出せないので、unlock は操作のたびに呼ぶ */
const bgm = new Bgm(() => {
  try {
    audio ??= new AudioContext();
    return audio;
  } catch {
    return null;
  }
});
function beep(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, slide = 0): void {
  if (demoActive) return; // タイトルの背景のデモでは音を出さない
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + dur);
  } catch {
    // 音が出せない環境では何もしない
  }
}

/** 爆発音 (ノイズ + 低音) */
function boom(dur = 0.35): void {
  if (demoActive) return;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    const buf = createWhiteNoiseBuffer(audio, dur, (_t, p) => Math.pow(1 - p, 2));
    const src = audio.createBufferSource();
    src.buffer = buf;
    const lp = audio.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1800, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + dur);
    const gain = audio.createGain();
    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(lp).connect(gain).connect(audio.destination);
    src.start(t);
  } catch {
    // 音が出せない環境では何もしない
  }
  beep(90, dur, 'sine', 0.2, -50);
}

// ───────────────────────── 入力 ─────────────────────────
interface Input {
  left: boolean; right: boolean; up: boolean; down: boolean; rotate: boolean; item: boolean; confirm: boolean; cancel: boolean;
  /** メニューの選択移動用: アケコン(十字キー・スティック)だけの傾き。キーボードは keydown から MenuNav に直接積むので、ここに混ぜると二重に動く */
  padNavX: number; padNavY: number;
}
const keys = new Set<string>();
const keyPressed = new Set<string>();
const menuNav = new MenuNav();
let resultOpen = false;
let nameEntryOpen = false; // 順位の確認中・名前入力中は、リザルトの操作を止める
window.addEventListener('keydown', (e) => {
  if (!isPreview) bgm.unlock();
  if (resultOpen && !nameEntryOpen && menuNav.pushKey(e)) e.preventDefault();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (!e.repeat) keyPressed.add(e.code);
  keys.add(e.code);
});
window.addEventListener('pointerdown', () => { if (!isPreview) bgm.unlock(); });
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let prevPadButtons: boolean[] = [];
function readInput(): Input {
  const inp: Input = { left: false, right: false, up: false, down: false, rotate: false, item: false, confirm: false, cancel: false, padNavX: 0, padNavY: 0 };
  inp.left = keys.has('ArrowLeft') || keys.has('KeyA');
  inp.right = keys.has('ArrowRight') || keys.has('KeyD');
  inp.down = keys.has('ArrowDown') || keys.has('KeyS');
  const kp = (...codes: string[]) => codes.some((c) => keyPressed.has(c));
  inp.rotate = kp('KeyW');
  inp.item = kp('Enter', 'Space');
  inp.confirm = kp('Enter');
  inp.cancel = kp('Backspace');
  keyPressed.clear();

  const pads = readGamepads();
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const b = pad.buttons.map((x) => x.pressed);
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    const padLeft = !!b[14] || ax < -0.5;
    const padRight = !!b[15] || ax > 0.5;
    const padDown = !!b[13] || ay > 0.5;
    const padUp = !!b[12] || ay < -0.5;
    inp.left ||= padLeft;
    inp.right ||= padRight;
    inp.down ||= padDown;
    inp.up ||= padUp;
    inp.padNavX = padLeft ? -1 : padRight ? 1 : 0;
    inp.padNavY = padUp ? -1 : padDown ? 1 : 0;
    const pressed = (i: number) => !!b[i] && !prevPadButtons[i];
    // ボタン0/2/4/6 = 回転、1/3/5/7 = アイテム
    inp.rotate ||= pressed(0) || pressed(2) || pressed(4) || pressed(6) || pressed(12);
    inp.item ||= pressed(1) || pressed(3) || pressed(5) || pressed(7);
    inp.confirm ||= pressed(0) || pressed(9);
    inp.cancel ||= pressed(1);
    prevPadButtons = b;
    break;
  }
  return inp;
}

// ───────────────────────── ゲーム状態 ─────────────────────────
type State = 'title' | 'menu' | 'playing' | 'gameover';
let state: State = 'title';
let stateTime = 0;

let current: Block | null = null; // 操作中のブロック
let currentReleased = false; // collide イベントで立つ
let targetX = 0;
let targetAngle = 0;
let fastDrop = false;
let spawnTimer = 0;
let nextIndex = 0; // 次のピース (PIECES の添字)
let nextIndex2 = 0; // 次の次のピース
let moveRepeat = 0;
let moveDir = 0;

let drops = 0;
let placed = 0;
let level = 1;
let bestHeight = 0;
let currentHeight = 0;
let pendingTime = 0;
let pendingMin = Infinity;
let items: ItemKind[] = [];
let glueArmed = false;
// 分析用: 1プレイ内の取得アイテム数と、種類ごとの使用回数
let itemsGained = 0;
let itemsUsedByKind: Record<string, number> = {};
let pendingVine: { block: Block; timer: number } | null = null;
let firstBlock: { block: Block; timer: number } | null = null; // 1個目は着地後に自動で固定する

let eventTimer = 30;
/** ランキング挑戦のスタート前のカウントダウン(秒)と、そのあとに GO! を出す残り時間 */
const SOLO_COUNTDOWN = 3;
let soloCountdown = 0;
let soloGo = 0;
let soloCountSec = 0;
let inTutorial = false;
let tutorialLastStep = -1;
let tutorialActionDone = false;
let tutorialActionDelay = 0;
let tutorialHandle: ArcadeTutorialHandle | null = null;
let activeEvent: EventKind | null = null;
const EVENT_WARN_TIME = 10; // 予兆(縁が赤く点滅して、ラベルが残り秒数を数える時間)
const WARN_BEEP_AT = [0, 7, 8, 9]; // 予兆の警告音を鳴らす、予兆開始からの経過秒(最初と、残り3・2・1秒)
let pendingEvent: { kind: EventKind; t: number; beeps: number } | null = null;
let activeTime = 0;
let windDir = 1;
let meteorTimer = 0;
let shake = 0;
let camY = 6;
let hiscore = 0;
try {
  hiscore = Number(localStorage.getItem(HISCORE_KEY)) || 0;
} catch {
  // 保存できない環境ではハイスコアなしで動かす
}

function fallSpeed(): number {
  let v = levelSpeed(level);
  if (activeEvent === 'speed') v *= 1.6;
  if (fastDrop) v *= 3;
  return v;
}
function score(): number {
  return Math.floor(bestHeight * 100);
}
// 物理ステップごとの処理: 操作中ブロックの制御と風
world.addEventListener('preStep', () => {
  if (current && !currentReleased) {
    const b = current.body;
    const vx = Math.max(-14, Math.min(14, (targetX - b.position.x) * 22));
    const hoverY = (tutorialHandle?.currentStepIndex() ?? -1) === 4 ? 7.2 : camY + 1.5;
    const vy = inTutorial && !fastDrop && !glueArmed ? Math.max(-6, Math.min(6, (hoverY - b.position.y) * 10)) : -fallSpeed();
    b.velocity.set(vx, vy, 0);
    const err = wrapAngle(targetAngle - angleOf(b));
    b.angularVelocity.set(0, 0, Math.max(-16, Math.min(16, err * 20)));
  }
  if (activeEvent === 'wind') {
    for (const blk of blocks) {
      if (blk.body.type === CANNON.Body.DYNAMIC && blk !== current) blk.body.force.x += windDir * 2.5 * blk.body.mass;
    }
  }
});

function spawnPiece(): void {
  const index = nextIndex;
  nextIndex = nextIndex2;
  nextIndex2 = randomPieceIndex();
  // オンライン対戦は画面が広いので、画面の上端ではなくタワーの少し上から落とす
  const top = camY + viewH / 2 + 1;
  const spawnY = isPreview ? currentHeight + 5.5 : mode === 'online' ? Math.min(top, Math.max(currentHeight, 2) + 9) : top;
  const block = createPiece(index, 0, spawnY);
  block.body.allowSleep = false;
  current = block;
  currentReleased = false;
  targetX = 0;
  targetAngle = 0;
  if (glueArmed) {
    block.mat.emissive.setHex(VINE_COLOR);
    block.mat.emissiveIntensity = 0.55;
  }
  block.body.addEventListener('collide', () => {
    if (current === block && !currentReleased) currentReleased = true;
  });
  renderNext();
}

function onLanded(block: Block): void {
  block.body.allowSleep = true;
  // 着地の衝撃をやわらげる (勢いでタワーを崩しにくくする)
  block.body.velocity.scale(0.3, block.body.velocity);
  block.body.angularVelocity.scale(0.3, block.body.angularVelocity);
  placed++;
  const nextLevel = Math.min(MAX_LEVEL, 1 + Math.floor(placed / LEVEL_EVERY));
  if (nextLevel > level) {
    level = nextLevel;
    showLevelUp();
    beep(500, 0.1, 'square', 0.07);
    setTimeout(() => beep(750, 0.16, 'square', 0.07), 110);
  }
  if (mode === 'online' && placed % ATTACK_EVERY === 0) {
    // オンライン対戦: 置いた数に応じて、一番高い相手へおじゃまを送る(宛先はサーバーが決める)
    net.send({ t: 'attack', k: ATTACK_KINDS[Math.floor(Math.random() * ATTACK_KINDS.length)] });
  }
  if (placed === 1) firstBlock = { block, timer: FIRST_FIX_DELAY };
  beep(180, 0.08, 'triangle', 0.12, -60);
  if (glueArmed) {
    // 少し落ち着いてからツタを伸ばす
    pendingVine = { block, timer: VINE_DELAY };
    glueArmed = false;
  }
  if (placed % ITEM_EVERY === 0 && items.length < ITEM_MAX) {
    const kind = ITEM_KINDS[Math.floor(Math.random() * ITEM_KINDS.length)];
    items.push(kind);
    itemsGained++;
    beep(660, 0.1, 'square', 0.07);
    setTimeout(() => beep(880, 0.14, 'square', 0.07), 90);
  }
  renderItems(); // 次のアイテムまでの残りも更新する
}

/** ツタ: 周り約2マス以内のブロック(と土台)にツタをからめて固定する */
function growVines(src: Block): void {
  const bind = (other: CANNON.Body, pairs: { la: Cell; lb: Cell; d: number }[]) => {
    if (pairs.length === 0) return;
    const c = new CANNON.LockConstraint(src.body, other, { maxForce: 1e5 });
    world.addConstraint(c);
    constraints.push(c);
    pairs.sort((p, q) => p.d - q.d);
    for (const p of pairs.slice(0, 3)) addVine(src.body, p.la, other, p.lb);
  };
  const srcCells = src.parts.map((pt): { local: Cell; world: Cell } => ({ local: [pt.x, pt.y], world: worldPoint(src.body, [pt.x, pt.y]) }));
  for (const blk of blocks) {
    if (blk === src || blk === current || blk.isMeteor) continue;
    const pairs: { la: Cell; lb: Cell; d: number }[] = [];
    for (const op of blk.parts) {
      const oc: Cell = [op.x, op.y];
      const [ox, oy] = worldPoint(blk.body, oc);
      for (const sc of srcCells) {
        const d = Math.hypot(ox - sc.world[0], oy - sc.world[1]);
        if (d <= VINE_RANGE) pairs.push({ la: sc.local, lb: oc, d });
      }
    }
    bind(blk.body, pairs);
  }
  // 土台 (上面は y=0)
  const pPairs: { la: Cell; lb: Cell; d: number }[] = [];
  for (const sc of srcCells) {
    const lx = sc.world[0] - platformBody.position.x;
    if (Math.abs(lx) <= PLATFORM_HALF_W && sc.world[1] <= VINE_RANGE) pPairs.push({ la: sc.local, lb: [lx, 0.5], d: sc.world[1] });
  }
  bind(platformBody, pPairs);
  src.mat.emissive.setHex(VINE_COLOR);
  src.mat.emissiveIntensity = 0.25;
  beep(520, 0.15, 'sine', 0.1, 300);
}

/** ブロックを動かない土台の一部にする */
function freezeBlock(blk: Block, tint: number): void {
  blk.cemented = true;
  blk.body.type = CANNON.Body.STATIC;
  blk.body.mass = 0;
  blk.body.updateMassProperties();
  blk.body.velocity.setZero();
  blk.body.angularVelocity.setZero();
  blk.body.aabbNeedsUpdate = true;
  blk.mat.color.lerp(new THREE.Color(0x9aa3ad), tint);
  blk.mat.emissiveIntensity = 0;
  blk.mat.roughness = 1;
}

function useItem(): void {
  const kind = items[0];
  if (!kind) return;
  if (kind === 'glue' && glueArmed) return; // すでに準備中
  items.shift();
  itemsUsedByKind[kind] = (itemsUsedByKind[kind] ?? 0) + 1;
  benchMark(`item ${kind}`);
  beep(740, 0.18, 'sine', 0.1, 400);
  if (kind === 'glue') {
    glueArmed = true;
    if (current && !currentReleased) {
      current.mat.emissive.setHex(VINE_COLOR);
      current.mat.emissiveIntensity = 0.55;
    }
  } else if (kind === 'cement') {
    for (const blk of blocks) {
      if (blk === current || blk.isMeteor || blk.cemented) continue;
      if (blk.body.velocity.length() > 1) continue; // 落下中のものは固めない
      freezeBlock(blk, 0.7);
    }
  } else if (kind === 'heal') {
    drops = Math.max(0, drops - 1);
  }
  renderItems();
}

// ───────────────────────── 邪魔イベント ─────────────────────────
function wakeAll(): void {
  for (const blk of blocks) blk.body.wakeUp();
}

/** 画面の縁の赤い光・ラベル・流れる線(イベントが来ていることを、文章ではなく見た目で知らせる) */
const elEdge = document.getElementById('edge-alert')!;
const elEventLabel = document.getElementById('event-label')!;
const elEventFx = document.getElementById('event-fx')!;
for (let i = 0; i < 18; i++) {
  const s = document.createElement('i');
  s.style.setProperty('--p', `${Math.round(Math.random() * 100)}%`);
  s.style.setProperty('--d', `${(0.5 + Math.random() * 0.9).toFixed(2)}s`);
  s.style.setProperty('--dl', `${(-Math.random() * 1.4).toFixed(2)}s`);
  elEventFx.append(s);
}

/** HUD の真下にラベルを置き、通知バナーはその下へずらす(HUD の高さは画面の大きさで変わるので、実際の位置から決める) */
function placeEventUi(): void {
  const r = document.getElementById('left')?.getBoundingClientRect();
  if (r && r.height > 0) document.documentElement.style.setProperty('--hud-bottom', `${Math.round(r.bottom)}px`);
}
window.addEventListener('resize', placeEventUi);

function setEventLook(mode: '' | 'warn' | 'active', kind?: EventKind): void {
  const k = mode && kind ? ` k-${kind}${kind === 'wind' ? (windDir < 0 ? ' left' : ' right') : ''}` : '';
  elEdge.className = mode + k;
  elEventLabel.className = mode + k;
  elEventFx.className = mode === 'active' && kind ? `fx-${kind}${kind === 'wind' && windDir < 0 ? ' left' : ''}` : '';
  if (mode && kind) {
    elEventLabel.innerHTML = mode === 'warn'
      ? `<svg viewBox="0 0 32 32">${EVENT_ICON[kind]}</svg>${EVENT_INFO[kind].name}<b id="ev-time">${EVENT_WARN_TIME.toFixed(1)}秒</b>`
      : `<svg viewBox="0 0 32 32">${EVENT_ICON[kind]}</svg>${EVENT_INFO[kind].name}`;
    placeEventUi();
  }
}

/** イベントを予告する。EVENT_WARN_TIME 秒後に本番が始まる */
function startEvent(kind: EventKind): void {
  if (pendingEvent) return;
  pendingEvent = { kind, t: EVENT_WARN_TIME, beeps: 0 };
  setEventLook('warn', kind);
}

function beginEvent(kind: EventKind): void {
  if (activeEvent) endEvent();
  activeEvent = kind;
  activeTime = 0;
  wakeAll();
  if (kind === 'wind') windDir = Math.random() < 0.5 ? -1 : 1;
  if (kind === 'quake') world.allowSleep = false;
  if (kind === 'meteor') meteorTimer = 0;
  setEventLook('active', kind);
  const se: Record<EventKind, [number, OscillatorType, number]> = {
    wind: [300, 'sine', 260],
    quake: [90, 'sawtooth', -30],
    meteor: [140, 'sawtooth', -60],
    speed: [420, 'square', 700],
  };
  beep(se[kind][0], 0.6, se[kind][1], 0.09, se[kind][2]);
}

function endEvent(): void {
  pendingEvent = null;
  setEventLook('');
  if (activeEvent === 'quake') {
    world.allowSleep = true;
    platformBody.position.x = 0;
    platformBody.velocity.setZero();
  }
  activeEvent = null;
}

function spawnMeteor(): void {
  const body = new CANNON.Body({ mass: 0.6 });
  body.addShape(new CANNON.Sphere(0.45));
  lock2D(body);
  // 画面の上の外から、土台の上あたりをめがけて降ってくる
  const x = (Math.random() - 0.5) * 2 * (PLATFORM_HALF_W - 1);
  body.position.set(x + (Math.random() - 0.5) * 4, camY + viewH / 2 + 2, 0);
  body.velocity.set((x - body.position.x) * 0.6, -9 - Math.random() * 3, 0);
  world.addBody(body);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a2d2d, emissive: 0xff5a1f, emissiveIntensity: 0.9, roughness: 1, flatShading: true });
  const group = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 1), mat);
  rock.castShadow = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xff7a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.6, 2.6, 1);
  group.add(rock, glow);
  scene.add(group);
  blocks.push({ body, group, mat, parts: [{ x: 0, y: 0, hw: 0.45, hh: 0.45, round: true }], piece: -1, cemented: false, isMeteor: true, life: 0 });
  beep(300, 0.4, 'sawtooth', 0.06, -220);
}

/**
 * 爆発の粒子・隕石などの素材は、使うたびに作って、終わったら dispose している。three.js は、あるシェーダを使う素材が1つもなくなると
 * そのシェーダを解放するので、粒子が全部消えるたびに、次の爆発・隕石で、同じシェーダをまた作ることになる
 * (計測: 90秒のプレイで、同じシェーダを3回ずつ作り直し。Firefox では 1回 14〜30ms 止まる)。
 * そこで、各種類の素材を1つずつ、画面のはるか下に置きっぱなしにして、シェーダを手放さないようにする(描画はされない)。起動時に、先にコンパイルもする。
 */
function keepProgramsAlive(): void {
  const keep: THREE.Object3D[] = [];
  const hide = (o: THREE.Object3D): void => { o.position.set(0, -1000, 0); scene.add(o); keep.push(o); };
  // 衝撃波のリング / 破片 / 隕石(explode・spawnMeteor と同じ素材の設定)
  hide(new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false })));
  hide(new THREE.Mesh(debrisGeo, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })));
  hide(new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 1), new THREE.MeshStandardMaterial({ color: 0x3a2d2d, emissive: 0xff5a1f, emissiveIntensity: 0.9, roughness: 1, flatShading: true })));
  hide(new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xff7a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
  // 火の玉・火花(加算)と、煙(通常の合成)のスプライト
  hide(addSprite('fire', 0, -1000, 0, softTex, 0xffffff, true).obj);
  hide(addSprite('smoke', 0, -1000, 0, puffTex, 0x222222, false).obj);
  renderer.compile(scene, camera);
  finishPrograms(renderer);   // 描かれないシェーダも、初めて使う時の確認まで済ませておく(プレイ中の初めての爆発で止まらないように)
}

function updateEvents(dt: number): void {
  if (pendingEvent) {
    pendingEvent.t -= dt;
    // 警告音を0.5秒ごとに3回
    const elapsed = EVENT_WARN_TIME - pendingEvent.t;
    while (pendingEvent.beeps < WARN_BEEP_AT.length && WARN_BEEP_AT[pendingEvent.beeps] <= elapsed) {
      beep(880, pendingEvent.beeps === 0 ? 0.5 : 0.25, 'sawtooth', 0.07, -320);
      pendingEvent.beeps++;
    }
    const timeEl = document.getElementById('ev-time');
    if (timeEl) timeEl.textContent = `${Math.max(0, pendingEvent.t).toFixed(1)}秒`;
    elEdge.classList.toggle('urgent', pendingEvent.t <= 3); // 残り3秒からは点滅を速くする
    if (pendingEvent.t <= 0) {
      const { kind } = pendingEvent;
      pendingEvent = null;
      beginEvent(kind);
    }
    return;
  }
  if (activeEvent) {
    activeTime += dt;
    const dur = EVENT_INFO[activeEvent].duration;
    if (activeEvent === 'quake') {
      const env = Math.sin((Math.PI * Math.min(activeTime, dur)) / dur);
      const x = 0.25 * env * Math.sin(activeTime * 7.5);
      platformBody.velocity.x = (x - platformBody.position.x) / Math.max(dt, 1 / 240);
      shake = Math.max(shake, 0.12 * env);
    }
    if (activeEvent === 'wind' && current && !currentReleased) {
      targetX = Math.max(-MOVE_LIMIT, Math.min(MOVE_LIMIT, targetX + windDir * 0.7 * dt));
    }
    if (activeEvent === 'meteor') {
      meteorTimer -= dt;
      if (meteorTimer <= 0 && activeTime < dur - 1) {
        spawnMeteor();
        meteorTimer = 2.5;
      }
    }
    if (activeTime >= dur) endEvent();
    return;
  }
  eventTimer -= dt;
  if (eventTimer <= 0) {
    // 予告なしで始まる
    startEvent(EVENT_KINDS[Math.floor(Math.random() * EVENT_KINDS.length)]);
    eventTimer = Math.max(16, 26 - bestHeight * 0.15);
  }
}

// ───────────────────────── HUD ─────────────────────────
const $ = (id: string) => document.getElementById(id)!;
const elDrops = $('drops');
const elNext = $('next');
const elMatch = $('match');
const elItems = $('items');
const elStatus = $('status');
const elBanner = $('banner');
const elHud = $('hud');
const elResult = $('result-modal');
const elResultScore = $('result-score');
const elResultRecord = $('result-record');

/** 通知の種類(色とアイコンで見分ける) */
type BannerKind = 'info' | 'get' | 'use' | 'event';
/** 通知は1か所に、1つずつ順番に出す。出ている間に次が来たら、そのぶん待つ */
interface BannerItem { title: string; sub: string; kind: BannerKind; time: number; icon: string }
const bannerQueue: BannerItem[] = [];
const BANNER_QUEUE_MAX = 4; // 待たせる数の上限。超えたら古い順に捨てる(遅れて古い知らせが出ないように)
const BANNER_TIME_SCALE = 2; // 各通知の表示時間にかける倍率
const BANNER_GAP = 0.12; // 次の通知までの間(秒)。切り替わりが分かるようにする
let bannerNow: { el: HTMLElement; t: number } | null = null;
let bannerGap = 0;

const ICON_WARN = '<path d="M16 3 L30 28 H2 Z" fill="#ffcc33" stroke="#7a1020" stroke-width="2" stroke-linejoin="round"/><rect x="14.5" y="11" width="3" height="9" rx="1.5" fill="#7a1020"/><circle cx="16" cy="24" r="1.8" fill="#7a1020"/>';
const ICON_FLAG = '<path d="M7 3 V29" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M9 5 H26 L21 11 L26 17 H9 Z" fill="#8fa3c0" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>';
const ICON_PLAYERS = '<circle cx="11" cy="11" r="4.5" fill="#8fa3c0" stroke="#fff" stroke-width="2"/><path d="M2 27 C2 19 20 19 20 27 Z" fill="#8fa3c0" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="23" cy="12" r="3.6" fill="#8fa3c0" stroke="#fff" stroke-width="2"/><path d="M22 20 C27 19 31 22 31 27 H23" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>';
const ICON_TROPHY = '<path d="M9 4 H23 V12 C23 17 20 20 16 20 C12 20 9 17 9 12 Z" fill="#ffd166" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M9 7 H4 C4 12 6 14 9 14 M23 7 H28 C28 12 26 14 23 14" fill="none" stroke="#fff" stroke-width="2"/><path d="M16 20 V25 M10 28 H22" stroke="#fff" stroke-width="3" stroke-linecap="round"/>';
const EVENT_ICON: Record<EventKind, string> = {
  wind: '<path d="M3 11 H20 A4 4 0 1 0 16 7 M3 17 H25 A4 4 0 1 1 21 21 M3 23 H14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>',
  quake: '<path d="M2 16 L8 8 L13 24 L19 6 L24 22 L30 14" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  meteor: '<path d="M4 4 L18 16 M2 12 L13 21 M10 2 L20 11" stroke="#ffb870" stroke-width="3" stroke-linecap="round"/><circle cx="21" cy="21" r="8" fill="#8a6a4e" stroke="#fff" stroke-width="2"/><circle cx="19" cy="19" r="2" fill="#5e4632"/><circle cx="24" cy="23" r="1.6" fill="#5e4632"/>',
  speed: '<path d="M4 5 L15 16 L4 27 M15 5 L26 16 L15 27" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
};

function renderBanner(b: BannerItem): void {
  placeEventUi();
  const el = document.createElement('div');
  el.className = `bn k-${b.kind}`;
  const head = document.createElement('div');
  head.className = 'b-head';
  head.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 32 32">${b.icon}</svg>`);
  head.append(b.title);
  const small = document.createElement('small');
  small.textContent = b.sub;
  el.append(head, small);
  elBanner.append(el);
  bannerNow = { el, t: b.time };
}

/** 通知を出す。何か出ている最中なら、順番待ちに入れる */
function showBanner(title: string, sub: string, kind: BannerKind, time: number, icon: string): void {
  bannerQueue.push({ title, sub, kind, time: time * BANNER_TIME_SCALE, icon });
  while (bannerQueue.length > BANNER_QUEUE_MAX) bannerQueue.shift();
}

function clearBanner(): void {
  bannerQueue.length = 0;
  bannerNow?.el.remove();
  bannerNow = null;
  bannerGap = 0;
}

/** 通知の進行(毎フレーム) */
function updateBanner(dt: number): void {
  if (bannerNow) {
    bannerNow.t -= dt;
    if (bannerNow.t > 0) return;
    bannerNow.el.remove();
    bannerNow = null;
    bannerGap = BANNER_GAP;
  }
  if (bannerGap > 0) {
    bannerGap -= dt;
    return;
  }
  const next = bannerQueue.shift();
  if (next) renderBanner(next);
}

/** 特殊ブロックの 次 用イラスト(96×46 の SVG) */
function nextIllustration(id: string, c: string): string {
  const dark = 'rgba(0,0,0,0.28)';
  const body: Record<string, string> = {
    car: `<rect x="14" y="20" width="68" height="16" rx="5" fill="${c}"/><rect x="30" y="9" width="36" height="14" rx="5" fill="${c}"/><rect x="34" y="12" width="28" height="9" rx="2" fill="#1b2a3a"/><rect x="14" y="31" width="68" height="5" rx="2" fill="${dark}"/><circle cx="30" cy="37" r="7" fill="#16181c"/><circle cx="30" cy="37" r="3" fill="#b8bec8"/><circle cx="66" cy="37" r="7" fill="#16181c"/><circle cx="66" cy="37" r="3" fill="#b8bec8"/><rect x="78" y="24" width="4" height="5" rx="1" fill="#fff6d0"/>`,
    desk: `<rect x="12" y="10" width="72" height="8" rx="2" fill="${c}"/><rect x="12" y="16" width="72" height="2" fill="${dark}"/><rect x="18" y="18" width="60" height="7" fill="#8a8f96"/><rect x="16" y="18" width="4" height="26" rx="1" fill="#9aa3ad"/><rect x="76" y="18" width="4" height="26" rx="1" fill="#9aa3ad"/><rect x="16" y="38" width="64" height="3" fill="#9aa3ad"/>`,
    daruma: `<circle cx="48" cy="23" r="20" fill="${c}"/><ellipse cx="48" cy="20" rx="12" ry="10" fill="#fff3e0"/><circle cx="43" cy="19" r="2.4" fill="#111"/><circle cx="53" cy="19" r="2.4" fill="#111"/><path d="M39 33 Q48 40 57 33" stroke="#ffc94a" stroke-width="2.5" fill="none"/>`,
    hydrant: `<rect x="40" y="10" width="16" height="28" rx="3" fill="${c}"/><path d="M38 12 A10 9 0 0 1 58 12 Z" fill="${c}"/><rect x="45" y="3" width="6" height="6" rx="1" fill="#c9ced6"/><rect x="30" y="18" width="36" height="8" rx="3" fill="${c}"/><rect x="33" y="38" width="30" height="6" rx="2" fill="${c}"/><rect x="40" y="12" width="4" height="26" fill="rgba(255,255,255,0.25)"/>`,
    phone: `<rect x="35" y="2" width="26" height="42" rx="5" fill="${c}" stroke="#7a8190" stroke-width="1.5"/><rect x="38" y="6" width="20" height="33" rx="2" fill="#2a6bd8"/><rect x="43" y="41" width="10" height="1.8" rx="1" fill="#fff"/>`,
    tawara: `<rect x="10" y="9" width="76" height="30" rx="10" fill="${c}"/><rect x="10" y="30" width="76" height="9" rx="6" fill="${dark}"/><rect x="26" y="9" width="4" height="30" fill="#6b4a24"/><rect x="46" y="9" width="4" height="30" fill="#6b4a24"/><rect x="66" y="9" width="4" height="30" fill="#6b4a24"/><ellipse cx="14" cy="24" rx="4" ry="12" fill="#c9a46a"/><ellipse cx="82" cy="24" rx="4" ry="12" fill="#c9a46a"/>`,
  };
  return `<svg viewBox="0 0 96 46" xmlns="http://www.w3.org/2000/svg">${body[id] ?? ''}</svg>`;
}

/** 次のピースを枠に描く。innerW/innerH は枠の中身の大きさ(px) */
function fillNextBox(box: HTMLElement, index: number, innerW: number, innerH: number): void {
  box.innerHTML = '';
  const def = PIECES[index];
  if (!def.tetromino) {
    // テトリス型でないピースはイラストで出す
    box.style.gridTemplateColumns = '100%';
    box.style.gridTemplateRows = '100%';
    box.innerHTML = nextIllustration(def.id, `#${def.color.toString(16).padStart(6, '0')}`);
    return;
  }
  const xs = def.parts.map((c) => c.x);
  const ys = def.parts.map((c) => c.y);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  // 大きい形(3段・4列を超える)は、マスを小さくして同じ枠に収める
  const cols = Math.round(Math.max(...xs) - minX) + 1;
  const rows = Math.round(maxY - Math.min(...ys)) + 1;
  const size = Math.min(20, Math.floor(innerH / rows) - 2, Math.floor(innerW / cols) - 2);
  box.style.gridTemplateColumns = `repeat(${cols}, ${size}px)`;
  box.style.gridTemplateRows = `repeat(${rows}, ${size}px)`;
  const color = `#${def.color.toString(16).padStart(6, '0')}`;
  for (const { x, y } of def.parts) {
    const i = document.createElement('i');
    i.style.background = color;
    i.style.gridColumn = String(Math.round(x - minX) + 1);
    i.style.gridRow = String(Math.round(maxY - y) + 1);
    box.append(i);
  }
}

/** 次と、その次(矢印の先)を container に出す */
function renderNextInto(container: HTMLElement, first: number, second: number): void {
  container.innerHTML = '';
  const big = document.createElement('div');
  big.className = 'nbox big';
  const arrow = document.createElement('span');
  arrow.className = 'narrow';
  arrow.textContent = '▶';
  const small = document.createElement('div');
  small.className = 'nbox small';
  container.append(big, arrow, small);
  fillNextBox(big, first, 50, 32);
  fillNextBox(small, second, 50, 32);
}
function renderNext(): void {
  renderNextInto(elNext, nextIndex, nextIndex2);
}

/** アイテムのアイコン(32×32 の SVG) */
const ITEM_ICON: Record<ItemKind, string> = {
  glue: '<path d="M6 26 C10 14 14 22 18 12 S24 10 27 5" stroke="#1f6b2a" stroke-width="3.5" fill="none" stroke-linecap="round"/><ellipse cx="11" cy="17" rx="4" ry="2.4" transform="rotate(-35 11 17)" fill="#2e9b3e"/><ellipse cx="22" cy="12" rx="4" ry="2.4" transform="rotate(35 22 12)" fill="#2e9b3e"/>',
  cement: '<path d="M7 11 H25 L23 27 H9 Z" fill="#6c7580"/><rect x="5" y="7" width="22" height="6" rx="2" fill="#8a949f"/><path d="M11 17 H21 M11 22 H21" stroke="#c9d0d8" stroke-width="2"/>',
  heal: '<path d="M16 28 C4 19 4 8 11 7 C14 7 16 10 16 10 C16 10 18 7 21 7 C28 8 28 19 16 28 Z" fill="#d6304f"/><path d="M9 11 C10 9 12 9 13 10" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.7"/>',
};

/** アイテム1枠。kind が無ければ未獲得(バリアの形の点線)。remain があれば、その中に残り個数を重ねる */
function makeItemSlot(kind: ItemKind | undefined, ready: boolean, remain?: string): HTMLElement {
  const d = document.createElement('div');
  if (kind) {
    d.className = `item ${kind}${ready ? ' ready' : ''}`;
    d.title = ITEM_INFO[kind].name;
    d.innerHTML = `<svg viewBox="0 0 32 32">${ITEM_ICON[kind]}</svg>`;
  } else {
    d.className = 'item slot';
    // 未獲得のスロットは、バリアの形の点線で出す
    d.innerHTML = `<svg viewBox="0 0 32 32"><path d="M16 3 L27 7 V16 C27 22 22 27 16 30 C10 27 5 22 5 16 V7 Z" fill="none" stroke="#fff" stroke-width="2" stroke-dasharray="3 3" stroke-linejoin="round"/></svg>${remain ? `<span>${remain}</span>` : ''}`;
  }
  return d;
}

function renderItems(): void {
  elItems.innerHTML = '';
  for (let i = 0; i < ITEM_MAX; i++) {
    const kind = items[i];
    // 最初の空きスロットに、次のアイテムまでの残り個数を重ねる
    const remain = !kind && i === items.length ? `あと<br>${ITEM_EVERY - (placed % ITEM_EVERY)}個` : undefined;
    // スロットの下に、アイテム名を添える
    const cell = document.createElement('div');
    cell.className = 'icell';
    const name = document.createElement('div');
    name.className = 'iname';
    name.textContent = kind ? ITEM_INFO[kind].name : '空き';
    name.classList.toggle('empty', !kind);
    cell.append(makeItemSlot(kind, i === 0, remain), name);
    elItems.append(cell);
  }
  // 使えるアイテムがあれば、右下寄りに「(ボタン) ○○を使用」を出す
  const hint = $('item-hint');
  if (items[0]) {
    // (ボタン) ○○を使用
    hint.innerHTML = `${buttonIconHtml([1], 'Enter')}<span class="ih-icon ${items[0]}"><svg viewBox="0 0 32 32">${ITEM_ICON[items[0]]}</svg></span><small>${ITEM_INFO[items[0]].desc}</small>`;
  }
  hint.classList.toggle('show', !!items[0]);
  const st: string[] = [];
  if (glueArmed) st.push('ツタ 準備OK');
  setText(elStatus, st.join(' / '));
}

function renderHud(): void {
  setDisplay(elHud, state === 'title' || state === 'menu' || inTutorial ? 'none' : 'block');
  renderMatchHud();

  // 残機: 左から MAX_DROPS 個。落とした数だけ右から消える
  const marks = elDrops.children;
  for (let i = 0; i < marks.length; i++) marks[i].classList.toggle('lost', i >= MAX_DROPS - drops);
}

// ───────────────────────── タイトル (全ゲーム共通の画面) ─────────────────────────
const titleScreen = new ArcadeTitleScreen({
  slug: 'tower-stack',
  accentColor: ACCENT,
  logoStretchY: 1.4, // 横長で上下に余白のあるロゴなので、幅は変えずに縦へ引き伸ばして、他のゲームと同じくらいの高さに見せる
  tagline: '揺れるブロックを限界まで積み上げろ！',
  onStart: () => void onStartPressed(),
});

/** タイトルの背景に置く飾りのタワー */
/** タイトル・モード選択の背景: 自動でブロックを積んでいくデモ。3個落ちたら、結果は出さずにやり直す */
let demoActive = false;
/** デモのブロック数・高さの上限。積み続けて重くなりすぎないように、超えたらまっさらにやり直す */
const DEMO_MAX_BLOCKS = 40;
const DEMO_MAX_HEIGHT = 26;
let demoPiece: Block | null = null;
let demoTarget = 0;
let demoRot = 0;
let demoRotTimer = 0;
function startDemo(): void {
  clearBlocks();
  resetRunState();
  resetPieceBag();
  nextIndex = randomPieceIndex();
  nextIndex2 = randomPieceIndex();
  eventTimer = Infinity; // 邪魔イベントは起こさない
  spawnTimer = 0.8;
  demoPiece = null;
  demoActive = true;
}
/** デモの操作役: 落ちてくるブロックごとに、左右の位置と回転の数をランダムに決めて動かす(うまく積めないこともある) */
function demoInput(dt: number): Input {
  const inp: Input = { left: false, right: false, up: false, down: false, rotate: false, item: false, confirm: false, cancel: false, padNavX: 0, padNavY: 0 };
  if (!current || currentReleased) return inp;
  if (demoPiece !== current) {
    demoPiece = current;
    demoTarget = (Math.random() - 0.5) * (benchScene === 'tall' ? 1.6 : 7);
    demoRot = Math.floor(Math.random() * 4);
    demoRotTimer = 0.15;
  }
  const diff = demoTarget - targetX;
  if (Math.abs(diff) >= MOVE_STEP) {
    inp.right = diff > 0;
    inp.left = diff < 0;
  }
  demoRotTimer -= dt;
  if (demoRot > 0 && demoRotTimer <= 0) {
    inp.rotate = true;
    demoRot--;
    demoRotTimer = 0.25;
  }
  inp.down = demoRot === 0 && Math.abs(diff) < MOVE_STEP; // 位置が決まったら早く落とす
  if (benchSolo && items[0]) {
    // ベンチ: 手に入れたアイテムは少し置いてから使う(ツタ・セメント・回復の演出も測る)
    benchItemWait += dt;
    if (benchItemWait > 2) { benchItemWait = 0; inp.item = true; }
  }
  return inp;
}

function clearBlocks(): void {
  clearParticles();
  for (const blk of [...blocks]) removeBlock(blk);
}

function showTitle(): void {
  tutorialHandle?.cancel();
  tutorialHandle = null;
  inTutorial = false;
  closeResult();
  modeSelect.hide();
  leaveOnline();
  clearBlocks();
  resetRunState(); // 対戦のあとでも、前のプレイの状況(残機・アイテム・記録・通知)を持ち越さない
  clearRankMarkers();
  startDemo();
  state = 'title';
  stateTime = 0;
  titleScreen.show();
  guideTitle();
}

// ───────────────────────── リザルト (共通メニュー) ─────────────────────────
const resultItems: ResultMenuItem[] = [
  { button: $('result-btn-retry'), color: ACCENT },
  { button: $('result-btn-title'), color: '#7bdff2' },
];
setupResultMenu($('result-menu'), resultItems);
const resultActions = [
  () => (mode === 'online' ? retryOnline() : startGame()),
  () => showTitle(),
];
const elResultTitle = document.querySelector('.result-title') as HTMLElement;
/** リザルトの見出し(ひとりで遊んだとき / オンライン対戦)を切り替える */
function setResultTexts(title: string, retry: string): void {
  elResultTitle.textContent = title;
  const btn = resultItems[0].button;
  if (btn) btn.textContent = retry;
}
resultItems.forEach((it, i) => it.button?.addEventListener('click', () => { if (resultOpen && !nameEntryOpen) resultActions[i](); }));
let resultFocus = 0;
let stopCountUp: (() => void) | null = null;

function openResult(_isNew?: boolean): void {
  setResultTexts('GAME OVER', '再挑戦');
  elResultScore.style.display = '';
  resultOpen = true;
  resultFocus = 0;
  menuNav.clear();
  applyResultMenuFocus(resultItems, resultFocus);
  elResultRecord.textContent = '';
  elResultRecord.classList.remove('new');
  elResult.classList.add('show');
  stopCountUp = countUpText(elResultScore, `${bestHeight.toFixed(1)} m`);
  guideResult();
  showRanking();
}

// ── 共通ランキング (上位3位)。上位に入ったら名前を登録する ──
const elResultRanking = $('result-ranking');
let resultSeq = 0;
let resultArmUntil = 0;

function renderRanking(list: LeaderboardEntry[] | null, highlightRank?: number): void {
  renderRankingList(elResultRanking, list, highlightRank);
}

function showRanking(): void {
  const seq = ++resultSeq;
  const s = score();
  const height = bestHeight;
  renderRanking(null);
  nameEntryOpen = true; // 順位の確認が終わるまで操作を止める
  void loadLeaderboardAndCheck(SLUG, s, undefined, 3).then(({ list, isRankIn, rank }) => {
    if (seq !== resultSeq) return; // 取得中に画面が閉じられた
    renderRanking(list);
    if (!isRankIn) {
      nameEntryOpen = false;
      return;
    }
    mountNameEntryModal({
      title: 'タワー記録',
      scoreDisplay: `${height.toFixed(1)} m`,
      rankDisplay: `第${rank}位`,
      themeClass: 'theme-street',
      delayMs: NAME_ENTRY_AFTER_RESULT_MS,
      onComplete: async (name) => {
        menuNav.clear();
        const res = await saveLeaderboardScore(SLUG, s, name);
        if (seq === resultSeq && res.rank > 0) renderRanking(res.list, res.rank);
        return res;
      },
      onClosed: () => {
        if (seq !== resultSeq) return;
        nameEntryOpen = false;
        resultArmUntil = performance.now() + 800; // 名前の決定がメニューの決定として入らないようにする
      },
    });
  });
}

function closeResult(): void {
  resultOpen = false;
  resultSeq++;
  nameEntryOpen = false;
  stopCountUp?.();
  stopCountUp = null;
  elResult.classList.remove('show');
}

function updateResult(inp: Input): void {
  if (nameEntryOpen || performance.now() < resultArmUntil) {
    menuNav.clear();
    return;
  }
  menuNav.updatePad(inp.padNavX, inp.padNavY);
  for (const dir of menuNav.take()) {
    resultFocus = (resultFocus + dir + resultItems.length) % resultItems.length;
    applyResultMenuFocus(resultItems, resultFocus);
    beep(420, 0.04, 'square', 0.04);
  }
  if (stateTime < RESULT_DELAY + 0.6) return; // 直前の操作が決定として入らないよう少し待つ
  if (inp.confirm) resultActions[resultFocus]();
  else if (inp.cancel) resultActions[1]();
}

// ───────────────────────── オンライン対戦 ─────────────────────────
// START → (開催中なら)あそびかた選択 → 待機 → 対戦(各自のタワーを積み、様子を送り合う) → 結果
type Mode = 'solo' | 'online';
let mode: Mode = 'solo';
const net = createNet();
let onlineStatus: PublicStatus | null = null;
let startingFlow = false;
let onlineYou = -1;
let onlineWired = false;
let waitScreen: WaitScreen | null = null;
const rivalStages = new RivalStages(scene, {
  makePlatform: () => {
    const g = new THREE.Group();
    const p = platformMesh.clone();
    p.position.set(0, -0.5, 0);
    g.add(p, pillar.clone());
    addScaleLabels(g); // 高さの目盛りも、相手のステージに出す
    // 土台の左右の白いライン(自分のステージと同じものを、相手のステージにも出す)
    for (const m of edgeLines) {
      const e = new THREE.Mesh(m.geometry, edgeMat);
      e.position.copy(m.position);
      g.add(e);
    }
    return g;
  },
  explode: (x, y, color, power) => {
    explode(x, y, color, power);
    boom(0.25);
  },
});

interface OnlineMatch {
  players: PlayerInfo[];
  /** スタートの時刻(サーバー時刻ms)。go が届くまでは無限大 */
  startAt: number;
  started: boolean;
  /** 決着がついて(自分が勝ち残って)積むのを止めた */
  stopped: boolean;
  out: boolean;
  results: ResultEntry[] | null;
  sendAcc: number;
  states: Record<number, TowerState & { out: boolean }>;
  gone: number[];
}
let match: OnlineMatch | null = null;

const modeSelect = new ModeSelect(
  { title: 'モード選択', accent: ACCENT, accentEnd: '#ff9f43', arcade: true },
  (id) => onModeSelected(id),
  () => {
    modeSelect.hide();
    showTitle();
  },
);

/** START: 遊び方の選択を出す(オンライン対戦が開かれていなければ、その項目は選べない) */
async function onStartPressed(): Promise<void> {
  if (startingFlow) return;
  startingFlow = true;
  try {
    onlineStatus = isPreview ? null : await fetchTowerStatus(1500); // 開催状況の確認は START の時の1回だけ
  } finally {
    startingFlow = false;
  }
  if (state !== 'title') return;
  if (isPreview) startGame();
  else openModeSelect(false); // 開催されていなくても、オンライン対戦の項目は出す(選べない)
}

function modeItems(st: PublicStatus | null) {
  return [
    { id: 'solo', art: SOLO_ART, title: 'ランキング挑戦', sub: '記録を塗り替える', points: [
      { icon: BLOCKS_SOLID_SVG, text: 'ひとりで高く積む' },
      { icon: TROPHY_SOLID_SVG, text: '上位の記録を\u200b超える高さを目指す' },
    ] },
    {
      id: 'online',
      art: ONLINE_ART,
      title: 'オンライン対戦',
      sub: !st ? '現在は開催されていません' : st.players >= st.max || st.phase !== 'lobby' ? '対戦中' : `参加者 ${st.players}/${st.max}`,
      points: [
        { icon: PEOPLE_SOLID_SVG, text: '1対1で同時に積む' },
        { icon: DROP_SOLID_SVG, text: '先に3個落とした方の負け' },
      ],
      disabled: !st, // 開催されていなくても項目は出す(選べない)
    },
  ];
}

function openModeSelect(refresh = true): void {
  state = 'menu';
  titleScreen.hide();
  modeSelect.show(modeItems(onlineStatus));
  guideMenu();
  if (refresh && !isPreview) {
    void fetchTowerStatus(1500).then((st) => {
      onlineStatus = st;
      if (state === 'menu') modeSelect.update(modeItems(st));
    });
  }
}

function onModeSelected(id: string): void {
  modeSelect.hide();
  if (id === 'online') {
    enterOnlineWait();
    return;
  }
  mode = 'solo';
  startGame();
}

function enterOnlineWait(): void {
  state = 'menu';
  wireOnline();
  if (!waitScreen) {
    waitScreen = new WaitScreen(net, {
      onBack: () => {
        leaveOnline();
        openModeSelect();
      },
      onErrorToTitle: (msg: string) => {
        showTitle();
        showNotice(msg);
      },
    });
  }
  guideMenu();
  waitScreen.show();
}

/** サーバーからの通知の受け口(1回だけ登録する) */
function wireOnline(): void {
  if (onlineWired) return;
  onlineWired = true;
  net.on('room', (m) => {
    onlineYou = m.you;
    waitScreen?.setRoom(m);
  });
  net.on('left', () => waitScreen?.setRoom(null));
  net.on('start', (m) => beginOnlineMatch(m));
  net.on('go', (m) => {
    if (!match) return;
    match.startAt = m.startAt;
  });
  net.on('states', (m) => {
    if (!match) return;
    match.states = m.p;
    match.gone = m.gone;
    rivalStages.update(m.p, m.gone, camY - viewH / 2);
  });
  net.on('atk', (m) => onAttack(m));
  net.on('results', (m) => onOnlineResults(m.entries));
  net.onClose(() => {
    if (mode !== 'online' || !match || match.results) return;
    showTitle();
    showNotice('接続が切れました');
  });
}

/** 開始の合図: 自分のタワーを用意して、ロード完了を伝える(全員そろうと go が来る) */
function beginOnlineMatch(m: Extract<ServerMsg, { t: 'start' }>): void {
  if (state !== 'menu') return;
  waitScreen?.hide(); // 接続は保ったまま、待機画面だけ閉じる
  modeSelect.hide();
  mode = 'online';
  match = {
    players: m.players, startAt: Infinity, started: false, stopped: false, out: false, results: null, sendAcc: 0, states: {}, gone: [],
  };
  startGame();
  rivalStages.setup(m.players, onlineYou);
  const me = m.players.findIndex((p) => p.id === onlineYou);
  showBanner('オンライン対戦', `あなたは ${m.players[me]?.name ?? ''}`, 'info', 2.5, ICON_PLAYERS);
  net.send({ t: 'loaded' });
}

/** おじゃま: 自分宛てならイベントを起こす。自分が送ったものは効果音だけ鳴らす */
function onAttack(m: Extract<ServerMsg, { t: 'atk' }>): void {
  if (!match) return;
  const kind = m.k as EventKind;
  if (!EVENT_INFO[kind]) return;
  if (m.to === onlineYou) {
    if (state === 'playing' && match.started && !match.stopped) startEvent(kind);
    return;
  }
  rivalStages.flash(m.to);
  if (m.from === onlineYou) {
    beep(700, 0.12, 'square', 0.06, 300);
  }
}

/** 自分のタワーの様子を送る(相手の画面に小さく出る) */
function sendState(): void {
  const k: BlockSnap[] = [];
  for (const blk of blocks) {
    if (blk.isMeteor || blk.piece < 0) continue; // 落下中のブロックも送る(相手の画面で落ちていく様子が見える)
    const r2 = (v: number) => Math.round(v * 100) / 100;
    k.push([blk.piece, r2(blk.body.position.x), r2(blk.body.position.y), r2(wrapAngle(angleOf(blk.body)))]);
  }
  net.send({
    t: 'state',
    h: Math.max(0, Math.round(currentHeight * 100) / 100),
    b: Math.max(0, Math.round(bestHeight * 100) / 100),
    d: Math.min(3, drops),
    lv: level,
    k: k.slice(-MAX_SNAP_BLOCKS),
    it: items.slice(0, ITEM_MAX).map((kind) => ITEM_KINDS.indexOf(kind)),
    n: [nextIndex, nextIndex2],
    f: glueArmed ? 1 : 0,
  });
}

/** 決着がついた(自分が最後まで残った): 積むのを止める */
function stopPlaying(title: string, sub: string): void {
  if (!match) return;
  match.stopped = true;
  sendState();
  endEvent();
  if (current) {
    removeBlock(current);
    current = null;
  }
  state = 'gameover';
  stateTime = 0;
  showBanner(title, sub, 'get', 3, ICON_TROPHY);
  beep(660, 0.3, 'square', 0.08, 300);
}

function onOnlineResults(entries: ResultEntry[]): void {
  if (!match) return;
  match.results = entries;
  const rank = entries.findIndex((e) => e.id === onlineYou) + 1;
  reportDeepAnalytics('progression_update', {
    result: rank === 1 ? 'clear' : 'gameover',
    ...(rank === 1 ? {} : { deathReason: 'オンライン対戦で敗北' }),
    mode: 'オンライン',
    maxStage: `${Math.floor(bestHeight)}m`,
    score: score(),
    extraStats: { rank, players: entries.length, bestHeightM: Math.round(bestHeight * 10) / 10, blocksPlaced: placed, drops },
  });
  if (state === 'playing') {
    if (entries[0]?.id === onlineYou) stopPlaying('WIN', '最後まで残った');
    else stopPlaying('試合終了', '');
  }
  // 結果を受け取ったら接続は閉じる(開いたままにして負荷をかけない)。もう一度遊ぶときに接続し直す
  net.close();
}

/** オンラインの結果: 順位表(最高到達の高い順) */
function openOnlineResult(entries: ResultEntry[]): void {
  const rank = entries.findIndex((e) => e.id === onlineYou) + 1;
  setResultTexts(rank === 1 ? 'YOU WIN!' : rank > 0 ? 'YOU LOSE…' : 'RESULT', 'もう一度対戦');
  elResultScore.style.display = 'none'; // 順位表に高さが出るので、大きなスコアは出さない
  resultOpen = true;
  resultFocus = 0;
  menuNav.clear();
  applyResultMenuFocus(resultItems, resultFocus);
  elResultRecord.textContent = '';
  elResultRecord.classList.remove('new');
  elResultRanking.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rank-head';
  head.textContent = '順位';
  elResultRanking.append(head);
  entries.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = `rank-row r${i + 1}`;
    if (e.id === onlineYou) row.classList.add('me');
    const index = match?.players.findIndex((p) => p.id === e.id) ?? -1;
    const no = Object.assign(document.createElement('span'), { className: 'rank-no', textContent: `${i + 1}位` });
    const name = Object.assign(document.createElement('span'), { className: 'rank-name', textContent: e.id === onlineYou ? `${e.name}（あなた）` : e.name });
    if (index >= 0) name.style.color = PLAYER_COLORS_LIGHT[index % PLAYER_COLORS_LIGHT.length];
    const sc = Object.assign(document.createElement('span'), { className: 'rank-score', textContent: e.out ? `脱落 ${e.best.toFixed(1)}m` : `生き残り ${e.best.toFixed(1)}m` });
    row.append(no, name, sc);
    elResultRanking.append(row);
  });
  elResult.classList.add('show');
  if (rank === 1) beep(880, 0.3, 'square', 0.08, 400);
  guideResult();
}

/** もう一度オンライン対戦: 待機画面へ戻る */
function retryOnline(): void {
  closeResult();
  clearBlocks();
  rivalStages.clear();
  match = null;
  resetRunState();
  startDemo();
  enterOnlineWait();
}

/** オンラインの途中だった場合の片付け。ひとりで遊んでいるときは何も起きない */
function leaveOnline(): void {
  waitScreen?.hide();
  rivalStages.clear();
  match = null;
  mode = 'solo';
  if (net.connected) {
    net.send({ t: 'leave' });
    net.close();
  }
}

/** オンライン対戦の表示: UI(状況・高さ・残機・次・アイテム・ボタンガイド)を上部の1本のバーにまとめる / 元に戻す */
let onlineLayout = false;
function setOnlineLayout(on: boolean): void {
  if (on === onlineLayout) return;
  onlineLayout = on;
  document.body.classList.toggle('online', on);
  
  if (on) clearRankMarkers(); // 対戦にはランキングがないので、線を消す
  if (!on) {
    clearOnlineHud();
    ownMarker.setColor('#000000'); // ひとりのときは黒い線
    ownMarker.setTagX(-6.6);
  }
}

/** 対戦のHUD: 残機・アイテム・次は自分の分だけで、ソロと同じ画面中央の大きな表示を使う。相手のステージには名前と状況だけをステージの下に出す */
interface RivalHud { name: HTMLElement }
const rivalHuds = new Map<number, RivalHud>();
/** 世界のX座標(m)が画面の横で何pxの位置か */
function screenX(worldX: number): number {
  return ((worldX - camX) / (2 * viewHalfW) + 0.5) * window.innerWidth;
}
function clearOnlineHud(): void {
  for (const r of rivalHuds.values()) {
    r.name.remove();
  }
  rivalHuds.clear();
  $('my-name').style.left = '';
  $('my-name').textContent = '';
}
function buildRivalHud(): RivalHud {
  const name = document.createElement('div');
  name.className = 'stage-name';
  elHud.append(name);
  return { name };
}
function renderOnlineHud(): void {
  if (!onlineLayout) return;
  const mineX = `${screenX(0)}px`;
  $('my-name').style.left = mineX; // HUD・ヒント・通知はソロと同じ画面中央。名前だけ自分のステージの下
  const me = rivalStages.myInfo();
  const nameEl = $('my-name');
  if (me) {
    // 最高到達の点線とブロックは、対戦では自分の色。ステージをまたいで相手の線と見比べられる
    ownMarker.setColor(me.color, me.color);
    // ブロックは、2人のステージの間(それぞれ相手側の端)に、重ならないよう並べて出す
    ownMarker.setTagX(rivalStages.rivals().some((r) => r.offset > 0) ? BETWEEN_TAG_X : -BETWEEN_TAG_X);
    const st = match?.out ? '脱落' : glueArmed ? 'ツタ準備OK' : '';
    nameEl.innerHTML = '';
    nameEl.append('あなた');
    if (st) nameEl.insertAdjacentHTML('beforeend', `<small>${st}</small>`);
    nameEl.style.background = me.color;
  }
  const seen = new Set<number>();
  for (const r of rivalStages.rivals()) {
    seen.add(r.id);
    let h = rivalHuds.get(r.id);
    if (!h) {
      h = buildRivalHud();
      rivalHuds.set(r.id, h);
    }
    const x = `${screenX(r.offset)}px`;
    h.name.style.left = x;
    h.name.style.background = r.flash ? '#ff4d5a' : r.color; // おじゃまを受けた瞬間は赤く
    const st = r.gone ? '退出' : r.out ? '脱落' : r.flags & 1 ? 'ツタ準備OK' : '';
    const nameKey = `${r.name}|${st}`;
    if (h.name.dataset.k !== nameKey) {
      h.name.dataset.k = nameKey;
      h.name.innerHTML = '';
      h.name.append(r.name);
      if (st) h.name.insertAdjacentHTML('beforeend', `<small>${st}</small>`);
    }
  }
  for (const [id, h] of rivalHuds) {
    if (!seen.has(id)) {
      h.name.remove();
      rivalHuds.delete(id);
    }
  }
}

/** レベルが上がった: バナーで知らせる(落下が速くなる) */
function showLevelUp(): void {
  shake = Math.max(shake, 0.25);
}

/** 対戦中の上部の表示(残り人数と状況) */
function renderMatchHud(): void {
  const show = mode === 'online' && !!match && (state === 'playing' || state === 'gameover');
  setDisplay(elMatch, 'none'); // 上部の状況表示は使わない(相手の名前は名札に、カウントダウンは画面中央に出す)
  setOnlineLayout(show);
  renderOnlineHud();
  // スタート前のカウントダウンを画面中央に大きく出す
  const elCount = $('countdown');
  let count = '';
  if (show && match && !match.started) {
    const sec = Math.ceil((match.startAt - net.serverNow()) / 1000);
    count = Number.isFinite(sec) ? String(Math.max(1, sec)) : '';
  } else if (mode === 'solo' && state === 'playing' && !isPreview && !inTutorial) {
    // ランキング挑戦のスタート前: 3・2・1 のあと、少しだけ GO! を出す
    if (soloCountdown > 0) count = String(Math.ceil(soloCountdown));
    else if (soloGo > 0) count = 'GO!';
  }
  setText(elCount, count);
  setDisplay(elCount, count ? 'block' : 'none');
}

let noticeEl: HTMLDivElement | null = null;
let noticeTimer: number | null = null;
/** 画面の上部に出す短い案内(接続が切れた・満員 など) */
function showNotice(text: string): void {
  if (!noticeEl) {
    noticeEl = document.createElement('div');
    noticeEl.style.cssText =
      'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:9999;pointer-events:none;padding:.7em 1.4em;border-radius:6px;' +
      'background:rgba(8,8,14,.94);border:1px solid #ffd166;color:#fff;font:700 1rem system-ui,"Hiragino Kaku Gothic ProN",sans-serif;letter-spacing:.08em;display:none;';
    document.body.appendChild(noticeEl);
  }
  noticeEl.textContent = text;
  noticeEl.style.display = 'block';
  if (noticeTimer !== null) clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    if (noticeEl) noticeEl.style.display = 'none';
  }, 3500);
}

// ───────────────────────── 進行 ─────────────────────────
/** 1回のプレイの状況をまっさらに戻す(開始前・タイトルに戻ったとき・もう一度対戦するときに使う) */
function resetRunState(): void {
  endEvent();
  current = null;
  currentReleased = false;
  drops = 0;
  placed = 0;
  level = 1;
  bestHeight = 0;
  currentHeight = 0;
  pendingTime = 0;
  pendingMin = Infinity;
  items = [];
  itemsGained = 0;
  itemsUsedByKind = {};
  glueArmed = false;
  pendingVine = null;
  firstBlock = null;
  shake = 0;
  camY = 6;
  ownMarker.hide();
  clearBanner();
  renderItems();
}

function startGame(): void {
  closeResult();
  titleScreen.hide();
  demoActive = false; // 背景のデモを止めて、ここから本番
  clearBlocks();
  resetRunState();
  loadRankMarkers(); // ひとりのときだけ、ランキングの線を最新にして出す
  finishPrograms(renderer);   // 起動のあとに作ったシェーダ(ランキングのラベルなど)も、カウントダウンのあいだに使える状態にしておく
  eventTimer = isPreview || mode === 'online' ? Infinity : 30; // オンライン対戦では、おじゃまは相手から飛んでくる
  spawnTimer = 0.4;

  if (isPreview) {
    const demoBlocks: [number, number, number][] = [
      [1, 0, 1],        // O (黄)
      [0, 0, 2.5],      // I (シアン)
      [4, -1.0, 3.8],   // J (青)
      [3, 1.0, 3.8],    // L (橙)
      [2, 0.0, 4.8],    // T (紫)
      [5, -0.6, 6.0],   // S (緑)
      [6, 0.8, 6.0],    // Z (赤)
    ];
    for (const [i, x, y] of demoBlocks) {
      freezeBlock(createPiece(i, x, y), 0);
    }
    placed = demoBlocks.length;
    currentHeight = 6.8;
    camY = 6.0;
  }

  resetPieceBag();
  nextIndex = isPreview ? 0 : randomPieceIndex();
  nextIndex2 = isPreview ? 1 : randomPieceIndex();
  renderNext();
  renderItems();
  state = 'playing';
  stateTime = 0;
  tutorialHandle?.cancel();
  tutorialHandle = null;
  inTutorial = false;
  tutorialLastStep = -1;
  tutorialActionDone = false;
  tutorialActionDelay = 0;
  if (mode === 'solo' && !isPreview && !benchSolo) {
    beginTutorial();
    return;
  }
  soloCountdown = mode === 'solo' && !isPreview ? SOLO_COUNTDOWN : 0;
  if (!isPreview) reportRoundStart({ mode: mode === 'online' ? 'オンライン' : 'ひとり' });
  soloGo = 0;
  soloCountSec = 0;
  if (!isPreview) {
    guidePlay();
    beep(520, 0.12, 'square', 0.07);
  }
}

function beginTutorial(): void {
  inTutorial = true;
  tutorialLastStep = -1;
  tutorialActionDone = false;
  tutorialActionDelay = 0;
  items = [];
  renderItems();
  spawnPiece();
  if (current) {
    current.body.position.set(0, camY + 1.5, 0);
  }
  renderHud();
  const handle = startArcadeTutorial({
    accentColor: ACCENT,
    steps: [
      { indices: [15], keyLabel: 'D', label: 'ブロックを右に動かす' },
      { indices: [14], keyLabel: 'A', label: 'ブロックを左に動かす' },
      { indices: [0, 2], keyLabel: 'W', label: 'ブロックを回転させる' },
      { indices: [13], keyLabel: 'S', label: 'ブロックを積む' },
      { indices: [1, 3], keyLabel: 'Space', label: 'ツタでブロックを固定する' },
      { indices: [1, 3], keyLabel: 'Space', label: 'セメントで全体を固める' },
    ],
    onComplete: () => {
      inTutorial = false;
      tutorialHandle = null;
      tutorialLastStep = -1;
      tutorialActionDone = false;
      tutorialActionDelay = 0;
      clearBlocks();
      resetRunState();
      resetPieceBag();
      nextIndex = randomPieceIndex();
      nextIndex2 = randomPieceIndex();
      renderNext();
      renderItems();
      eventTimer = 30;
      spawnTimer = 0.4;
      stateTime = 0;
      soloCountdown = SOLO_COUNTDOWN;
      soloGo = 0;
      soloCountSec = 0;
      reportRoundStart({ mode: 'ひとり' });
      guidePlay();
      renderHud();
      beep(520, 0.12, 'square', 0.07);
    },
  });
  if (inTutorial) {
    tutorialHandle = handle;
  }
}

function setupTutorialTower(withFallingPiece: boolean): void {
  clearBlocks();
  current = null;
  currentReleased = false;
  glueArmed = false;
  pendingVine = null;
  const preset: [number, number, number][] = [
    [1, 0, 1.0],      // O (黄)
    [0, 0, 2.5],      // I (シアン)
    [4, -1.0, 3.75],  // J (青)
    [3, 1.0, 3.75],   // L (橙)
  ];
  for (const [pieceIdx, x, y] of preset) {
    const blk = createPiece(pieceIdx, x, y);
    blk.body.type = CANNON.Body.STATIC;
    blk.body.mass = 0;
    blk.body.updateMassProperties();
    blk.body.velocity.setZero();
    blk.body.angularVelocity.setZero();
    blk.body.aabbNeedsUpdate = true;
  }
  currentHeight = 5.0;
  if (withFallingPiece) {
    const falling = createPiece(2, 0, 7.2); // T (紫)
    falling.body.allowSleep = false;
    current = falling;
    currentReleased = false;
    targetX = 0;
    targetAngle = 0;
    falling.body.addEventListener('collide', () => {
      if (current === falling && !currentReleased) currentReleased = true;
    });
  }
}

function updateTutorial(dt: number, inp: Input): void {
  const started = tutorialHandle?.isStarted() ?? false;
  const step = tutorialHandle?.currentStepIndex() ?? -1;
  const stepReady = tutorialHandle?.isStepReady() ?? false;

  if (step !== tutorialLastStep) {
    tutorialLastStep = step;
    tutorialActionDone = false;
    tutorialActionDelay = 0;
    if (step === 4) {
      setupTutorialTower(true);
      items = ['glue'];
      renderItems();
    } else if (step === 5) {
      if (blocks.length < 4) {
        setupTutorialTower(false);
      } else {
        current = null;
        currentReleased = false;
      }
      items = ['cement'];
      renderItems();
    }
  }

  if (step >= 0 && step < 4) {
    if (!tutorialActionDone && (!current || currentReleased || current.body.position.y < KILL_Y)) {
      if (step === 3 && stepReady && currentReleased && current && current.body.position.y >= 0) {
        // 土台に着地した！
        const landed = current;
        current = null;
        landed.body.velocity.setZero();
        landed.body.angularVelocity.setZero();
        beep(180, 0.08, 'triangle', 0.12, -60);
        tutorialActionDone = true;
      } else {
        clearBlocks();
        current = null;
        currentReleased = false;
        spawnPiece();
        const spawned = current as Block | null;
        if (spawned) spawned.body.position.set(0, camY + 1.5, 0);
      }
    }
  } else if (step === 4) {
    if (glueArmed && current && currentReleased) {
      const landed = current;
      current = null;
      glueArmed = false;
      landed.body.velocity.setZero();
      landed.body.angularVelocity.setZero();
      growVines(landed);
      tutorialActionDone = true;
    } else if (!tutorialActionDone && !glueArmed && !current) {
      setupTutorialTower(true);
      items = ['glue'];
      renderItems();
    }
  }

  if (started && current && !currentReleased) {
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0 && step < 4) {
      if (dir !== moveDir) {
        targetX += dir * MOVE_STEP;
        moveRepeat = 0.17;
      } else {
        moveRepeat -= dt;
        if (moveRepeat <= 0) {
          targetX += dir * MOVE_STEP;
          moveRepeat = 0.05;
        }
      }
      targetX = Math.max(-MOVE_LIMIT, Math.min(MOVE_LIMIT, targetX));
    }
    moveDir = dir;
    fastDrop = (stepReady && step === 3 && !tutorialActionDone && inp.down) || (step === 4 && glueArmed);
    if (stepReady && step === 2 && !tutorialActionDone && inp.rotate) {
      targetAngle -= Math.PI / 2;
      beep(420, 0.04, 'square', 0.04);
      tutorialActionDone = true;
    }
  } else {
    fastDrop = false;
    moveDir = 0;
  }
  world.step(1 / 120, dt, 10);

  if (!stepReady) return;

  if (step === 0) {
    if (inp.right) tutorialActionDone = true;
    if (tutorialActionDone) {
      tutorialActionDelay += dt;
      if (tutorialActionDelay >= 0.30) tutorialHandle?.advance(0);
    }
  } else if (step === 1) {
    if (inp.left) tutorialActionDone = true;
    if (tutorialActionDone) {
      tutorialActionDelay += dt;
      if (tutorialActionDelay >= 0.30) tutorialHandle?.advance(1);
    }
  } else if (step === 2) {
    if (tutorialActionDone) {
      tutorialActionDelay += dt;
      if (tutorialActionDelay >= 0.32) tutorialHandle?.advance(2);
    }
  } else if (step === 3) {
    if (tutorialActionDone) {
      tutorialActionDelay += dt;
      if (tutorialActionDelay >= 0.38) tutorialHandle?.advance(3);
    }
  } else if (step === 4) {
    if (!tutorialActionDone && !glueArmed && inp.item) {
      items = ['glue'];
      useItem();
      renderItems();
    }
    if (tutorialActionDone) {
      tutorialActionDelay += dt;
      if (tutorialActionDelay >= 0.55) tutorialHandle?.advance(4);
    }
  } else if (step === 5) {
    if (!tutorialActionDone && inp.item) {
      items = ['cement'];
      useItem();
      for (const blk of blocks) {
        if (!blk.cemented) freezeBlock(blk, 0.7);
      }
      renderItems();
      tutorialActionDone = true;
    }
    if (tutorialActionDone) {
      tutorialActionDelay += dt;
      if (tutorialActionDelay >= 0.55) tutorialHandle?.advance(5);
    }
  }
}

let resultIsNew = false;

function gameOver(): void {
  if (benchSolo) benchDone('game-over');
  state = 'gameover';
  stateTime = 0;
  endEvent();
  current = null;
  blowUpAll();
  if (mode === 'online' && match) {
    // オンライン対戦: 脱落を伝えて、結果が届くまで相手のタワーを見ながら待つ
    match.out = true;
    sendState();
    net.send({ t: 'out', b: bestHeight });
    showBanner('脱落', '結果を待っています', 'event', 3, ICON_WARN);
    return;
  }
  const s = score();
  const isNew = s > hiscore;
  if (isNew) {
    hiscore = s;
    try {
      localStorage.setItem(HISCORE_KEY, String(s));
    } catch {
      // 保存できなくても続行
    }
  }
  resultIsNew = isNew;
  reportDeepAnalytics('progression_update', {
    result: 'gameover',
    deathReason: 'ブロックの落下が上限',
    mode: 'ひとり',
    maxStage: `${Math.floor(bestHeight)}m`,
    score: s,
    itemsCollected: itemsGained,
    extraStats: { bestHeightM: Math.round(bestHeight * 10) / 10, blocksPlaced: placed, drops, itemsUsed: itemsUsedByKind },
  });
}

// ベンチマーク(?bench=1&scene=solo&event=wind|quake|meteor|speed): デモの操作役でひとり用を遊ぶ。event があれば、積み始めて少ししたら起こす
// scene=tall: 落としても終わらずに積み続け、高いタワー(ブロックが多い物理・高所の空と星)を測る
const benchScene = benchParam('scene');
const benchSolo = benchScene === 'solo' || benchScene === 'tall';
const benchEvent = benchParam('event') as EventKind | null;
let benchReadySent = false;
let benchEventAt = -1;
let benchItemWait = 0;
let benchHeightMark = 0;

function updatePlaying(dt: number, inp: Input): void {
  if (inTutorial) {
    updateTutorial(dt, inp);
    return;
  }
  if (mode === 'solo' && !demoActive && soloCountdown > 0) {
    // スタートの合図を待つ。その間は動かさない
    world.step(1 / 120, dt, 10);
    soloCountdown -= dt;
    const sec = Math.ceil(soloCountdown);
    if (sec > 0 && sec !== soloCountSec) beep(520, 0.12, 'square', 0.07);
    soloCountSec = sec;
    if (soloCountdown > 0) return;
    soloCountdown = 0;
    soloGo = 0.7;
    beep(880, 0.25, 'square', 0.08);
  }
  if (soloGo > 0) soloGo -= dt;
  if (benchSolo) {
    if (!benchReadySent) { benchReadySent = true; benchReady('solo-start'); benchEventAt = stateTime + 10; }
    if (benchEvent && benchEventAt > 0 && stateTime >= benchEventAt) { benchEventAt = -1; startEvent(benchEvent); }
    const mark = Math.floor(bestHeight / 10) * 10;   // 10m ごとの区切り(スパイクに「どの高さか」が付く)
    if (mark > benchHeightMark) { benchHeightMark = mark; benchMark(`height ${mark}m`); }
  }
  if (mode === 'online' && match) {
    const now = net.serverNow();
    if (!match.started) {
      // スタートの合図(go)を待つ。その間は動かさない
      world.step(1 / 120, dt, 10);
      if (now < match.startAt) return;
      match.started = true;
      showBanner('START', '先に3個落とした方の負け', 'info', 1.4, ICON_FLAG);
      beep(880, 0.2, 'square', 0.08);
    }
    match.sendAcc += dt * 1000;
    if (match.sendAcc >= STATE_INTERVAL_MS) {
      match.sendAcc = 0;
      sendState();
    }
  }
  // 操作
  if (current && !currentReleased) {
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (dir !== 0) {
      if (dir !== moveDir) {
        targetX += dir * MOVE_STEP;
        moveRepeat = 0.17;
      } else {
        moveRepeat -= dt;
        if (moveRepeat <= 0) {
          targetX += dir * MOVE_STEP;
          moveRepeat = 0.05;
        }
      }
      targetX = Math.max(-MOVE_LIMIT, Math.min(MOVE_LIMIT, targetX));
    }
    moveDir = dir;
    fastDrop = inp.down;
    if (inp.rotate) {
      targetAngle -= Math.PI / 2;
      beep(420, 0.04, 'square', 0.04);
    }
  } else {
    fastDrop = false;
    moveDir = 0;
  }
  if (inp.item) useItem();

  updateEvents(dt);
  world.step(1 / 120, dt, 10);

  // ツタ: 物理ステップの外で固定する
  if (pendingVine) {
    pendingVine.timer -= dt;
    if (pendingVine.timer <= 0) {
      const src = pendingVine.block;
      pendingVine = null;
      if (blocks.includes(src)) growVines(src);
      renderItems();
    }
  }

  // 1個目のブロックは落ち着いたら固定して、土台がわりにする
  if (firstBlock) {
    firstBlock.timer -= dt;
    const fb = firstBlock.block;
    if (!blocks.includes(fb)) firstBlock = null;
    else if (firstBlock.timer <= 0 && fb.body.velocity.length() < 0.5) {
      freezeBlock(fb, 0.35);
      firstBlock = null;
      beep(600, 0.12, 'sine', 0.08, 200);
    }
  }

  // 着地
  if (current && currentReleased) {
    const landed = current;
    current = null;
    onLanded(landed);
    spawnTimer = 0.7;
  }
  if (!current) {
    spawnTimer -= dt;
    if (spawnTimer <= 0) spawnPiece();
  }

  // 落下判定と高さ計測
  let h = 0;
  for (const blk of [...blocks]) {
    blk.life += dt;
    const p = blk.body.position;
    if (p.y < KILL_Y || Math.abs(p.x) > 16 || (blk.isMeteor && blk.life > 7)) {
      const wasCurrent = blk === current;
      const counts = !blk.isMeteor;
      if (counts) {
        // 落ちたブロックは画面の下端あたりで爆発する
        const ex = Math.max(camX - viewHalfW + 1.5, Math.min(camX + viewHalfW - 1.5, p.x));
        const ey = Math.max(p.y, camY - viewH / 2 + 2);
        explode(ex, ey, blk.mat.color.getHex(), 1.3);
      }
      removeBlock(blk);
      if (wasCurrent) {
        current = null;
        spawnTimer = 0.7;
      }
      if (counts) {
        drops++;
        // 死亡地点マップ: どの横位置から、タワーがどの高さの時に落ちたか(タイトルの背景のデモは除く)
        if (!demoActive && state === 'playing') reportDeathPoint('tower', p.x, currentHeight, `${drops}個目`);
        shake = 0.35;
        boom();
        if (drops >= MAX_DROPS) {
          if (demoActive || benchScene === 'tall') {
            drops = 0; // タイトルの背景・高層のベンチ: 3個落ちても結果は出さず、数え直してそのまま続ける
            continue;
          }
          renderHud();
          gameOver();
          return;
        }
      }
      continue;
    }
    if (blk === current || blk.isMeteor) continue;
    if (blk.body.velocity.length() < 0.6) h = Math.max(h, topOf(blk));
  }
  currentHeight = h;

  // 0.7秒以上保てた高さだけを記録にする (跳ねた瞬間を数えないため)
  if (h > bestHeight + 0.01) {
    pendingTime += dt;
    pendingMin = Math.min(pendingMin, h);
    if (pendingTime > 0.7) {
      bestHeight = pendingMin;
      pendingTime = 0;
      pendingMin = Infinity;
    }
  } else {
    pendingTime = 0;
    pendingMin = Infinity;
  }
  if (demoActive && (blocks.length > DEMO_MAX_BLOCKS || currentHeight > DEMO_MAX_HEIGHT)) {
    startDemo(); // 積みすぎ(物理の重さ・描画の増えすぎ)を防ぐため、ここでだけやり直す
    return;
  }
  ownMarker.update(demoActive ? 0 : bestHeight, dt); // 背景のデモでは出さない。記録が伸びたら、線とブロックをなめらかに動かす
}

let last = performance.now();
/** ポーズ(Backspace / SELECT): ひとりの時は進行を止めて、やり直せる。オンライン対戦は相手がいるので止めず、退出だけできる */
const pauseSolo = new ArcadePause({
  accent: ACCENT,
  isPlaying: () => state === 'playing' && mode === 'solo' && !demoActive && !isPreview,
  onOpen: () => tutorialHandle?.pause(),
  onClose: () => tutorialHandle?.resume(),
  onRestart: () => {
    tutorialHandle?.cancel();
    tutorialHandle = null;
    inTutorial = false;
    startGame();
  },
});
new ArcadePause({
  accent: ACCENT,
  isPlaying: () => state === 'playing' && mode === 'online' && !!match && !match.stopped && !isPreview,
  exitLabel: '退出',
  onExit: () => { leaveOnline(); returnToHub(); },
});

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stateTime += dt;
  const inp = benchSolo && state === 'playing' ? demoInput(dt) : readInput();
  if (inp.left || inp.right || inp.up || inp.down || inp.rotate || inp.item || inp.confirm || inp.cancel) bgm.unlock(); // アケコンの操作も、最初の操作として扱う
  bgm.setScene(state === 'playing' && !demoActive ? 'play' : 'menu');
  bgm.tick();

  if (state === 'playing') {
    if (!pauseSolo.isOpen) updatePlaying(dt, inp);
  } else {
    // タイトル・ゲームオーバー中も、残ったブロックは動かしておく
    if (state === 'gameover') {
      world.step(1 / 120, dt, 10);
      if (!resultOpen && stateTime >= RESULT_DELAY) {
        if (mode === 'solo') openResult(resultIsNew);
        else if (match?.results) openOnlineResult(match.results);
      }
      if (resultOpen) updateResult(inp);
    }
    // タイトルのスタート操作は共通タイトル画面が受け付ける
    if (demoActive && (state === 'title' || state === 'menu')) updatePlaying(dt, demoInput(dt));
  }

  // 描画同期
  for (const blk of blocks) {
    blk.group.position.set(blk.body.position.x, blk.body.position.y, blk.body.position.z);
    blk.group.quaternion.set(blk.body.quaternion.x, blk.body.quaternion.y, blk.body.quaternion.z, blk.body.quaternion.w);
  }
  updateVines();
  {
    const px = platformBody.position.x;
    const markerY = camY - VIEW_H / 2 + 1.9; // 画面下の操作説明のすぐ上
    edgeLines[0].position.set(px - PLATFORM_HALF_W, camY, 0);
    edgeLines[1].position.set(px + PLATFORM_HALF_W, camY, 0);
    baseMarker.visible = false; // 画面下のバーは使わない (両端の縦線だけで示す)
    baseMarker.position.set(px, markerY, 2);
  }
  guide.visible = !isPreview && state === 'playing' && !!current;
  if (current) {
    const [minX, maxX] = xRangeOf(current);
    guide.scale.x = maxX - minX;
    guide.position.set((minX + maxX) / 2, current.body.position.y - 40, -0.6);
  }
  platformMesh.position.set(platformBody.position.x, platformBody.position.y, 0);

  // カメラ: オンライン対戦では、並んだ全員のステージが入るように引いて、一番高いタワーに合わせる
  const lay = mode === 'online' ? rivalStages.layout() : null;
  let targetViewH = VIEW_H;
  let targetCamX = 0;
  let camTarget = Math.max(VIEW_H * 0.3, currentHeight + VIEW_H * 0.15);
  if (lay) {
    // 対戦のカメラ: 拡大率と横の位置は、全員の土台が入る固定の値にして動かさない。縦は自分のタワーだけを追う
    // (相手のタワーの高さで拡大や上下が変わると、画面が揺れて酔いやすいため)
    const fitW = (lay.count * STAGE_SPACING + 2) / camera.aspect;
    targetViewH = Math.max(VIEW_H, fitW);
    targetCamX = lay.center;
    camTarget = Math.max(targetViewH * 0.3, currentHeight + targetViewH * 0.15);
    rivalStages.tick(dt);
  }
  viewH += (targetViewH - viewH) * Math.min(1, dt * 3);
  camX += (targetCamX - camX) * Math.min(1, dt * 3);
  viewHalfW = (viewH / 2) * camera.aspect;
  camY += (camTarget - camY) * Math.min(1, dt * 2.5);
  updateParticles(dt);
  shake = Math.max(0, shake - dt * 0.8);
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;
  camera.position.set(camX + CAM_OFFSET_X + sx, camY + CAM_OFFSET_Y + sy, viewH / 2 / CAM_TAN);
  camera.lookAt(camX + sx, camY + sy, 0);
  // 太陽(影)はカメラの高さについてくる
  sun.position.set(camX - 9, camY + 16, 14);
  sun.target.position.set(camX, camY, 0);
  shadowWall.position.set(camX, camY, -1.2);
  const shadowHalf = Math.max(18, Math.ceil(viewHalfW + 2));
  if (sun.shadow.camera.right !== shadowHalf) {
    sun.shadow.camera.left = -shadowHalf;
    sun.shadow.camera.right = shadowHalf;
    sun.shadow.camera.top = Math.max(18, Math.ceil(viewH / 2 + 4));
    sun.shadow.camera.bottom = -sun.shadow.camera.top;
    sun.shadow.camera.far = 80 + shadowHalf;
    sun.shadow.camera.updateProjectionMatrix();
  }
  const sky = (scene.background as THREE.Color).copy(SKY_LOW).lerp(SKY_HIGH, Math.min(1, Math.max(0, (camY - 6) / 70)));
  scene.fog!.color.copy(sky);
  starMat.opacity = Math.min(1, Math.max(0, (camY - 35) / 40));

  updateBanner(dt);
  renderHud();
  renderer.render(scene, camera);
}

keepProgramsAlive();
declareBenchTargets([
  { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
  { id: 'solo-calm', label: 'ひとり用(おじゃまなし)', kind: 'solo', params: { scene: 'solo' }, input: 'self', seconds: 60 },
  ...(Object.keys(EVENT_INFO) as EventKind[]).map((kind) => ({
    id: `solo-${kind}`,
    label: `ひとり用(${EVENT_INFO[kind].name})`,
    kind: 'solo',
    params: { scene: 'solo', event: kind },
    input: 'self' as const,
    seconds: 50,
  })),
  { id: 'tall', label: '高いタワー(落としても続けて積む)', kind: 'solo', params: { scene: 'tall' }, input: 'self', seconds: 300 },   // 星が出る高さ(35m〜)まで積む
]);
if (isPreview) {
  startGame();
} else if (benchSolo) {
  mode = 'solo';
  startGame();
  eventTimer = Infinity;   // おじゃまは、指定した場面でだけ起こす
} else {
  showTitle();
  // 着いたと知らせるのは、ページの立ち上がりが済み、フレームが落ち着いてから(タイトルはすぐ出る。計測を始める所だけ遅らせる)。
  // 計測(Windows, Chrome): すぐに知らせると、最初の 0.2 秒と、ページの読み込みから約 1 秒後(Chrome の片付け)に 33〜50ms のフレームが入り、
  // 1%low が 36〜51 に下がる回があった(同じ場面の 2 回目・3 回目は 60)
  if (benchScene === 'title') void waitFramesSettled().then(() => benchReady('title'));
}
renderItems();
requestAnimationFrame(frame);

// 動作確認用 (開発時のみ)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tower = {
    get state() { return { state, drops, placed, level, bestHeight, currentHeight, items, activeEvent, blocks: blocks.length }; },
    give: (k: ItemKind) => { items.push(k); renderItems(); },
    event: (k: EventKind) => startEvent(k),
    next: (i: number) => { nextIndex = i; renderNext(); },
    get renderer() { return renderer; },
    get scene() { return scene; },
    get vines() { return vines.length; },
    speedup: () => showLevelUp(),
  };
}
