// グラグラタワー (TOWER STACK)
// 落ちてくるブロックを物理演算で積み上げ、できるだけ高いタワーを目指すゲーム。
// 描画: Three.js (透視カメラ・影つきの3D表示) / 物理: cannon-es (Z方向を固定して2Dとして使う)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu';
import { MenuNav } from '../../../shared/arcadeMenuNav';
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { countUpText } from '../../../shared/arcadeScoreCountUp';
import { setText, setDisplay } from '../../../shared/hudDom';
import { loadLeaderboardAndCheck, saveLeaderboardScore, type LeaderboardEntry } from '../../../shared/arcadeLeaderboard';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';

installHomeReturn();
// リザルトで無操作が続いたらタイトルへ戻る
watchResultAutoReturn(['result-btn-title']);

const HUB_URL = '../../';
const SLUG = 'tower-stack'; // 共通ランキングでの名前 (packages/shared/arcadeLeaderboardCore.ts に定義)
const ACCENT = '#ffd166';

// 画面左下の共通ボタンガイド (場面ごとに差し替える)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true });
const guidePlay = () => mountArcadeGuide({
  moveLabel: '移動 / 下で早く落とす',
  buttons: [
    { indices: [0, 2], label: '回転' },
    { indices: [1, 3], label: 'アイテムを使う' },
  ],
  showHomeHint: true,
});
const guideResult = () => mountArcadeGuide({
  moveLabel: '選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '終了' },
  ],
  showHomeHint: true,
});

// ───────────────────────── 定数 ─────────────────────────
const VIEW_H = 20; // 画面に映る高さ(m)
const PLATFORM_HALF_W = 6;
const MAX_DROPS = 3;
const KILL_Y = -3.5; // これより下に落ちたブロックは「落下」
const MOVE_STEP = 0.5;
const MOVE_LIMIT = 8;
const ITEM_EVERY = 3; // 何個置くごとにアイテムがもらえるか
const ITEM_MAX = 3;
const VINE_RANGE = 2.3; // ツタが届く距離 (セル中心どうし。約2マス)
const VINE_DELAY = 0.3; // 着地してからツタが伸びるまでの秒数
const VINE_COLOR = 0x3fae4a;
const RESULT_DELAY = 1.6; // ゲームオーバーからリザルトが出るまでの秒数
const FIRST_FIX_DELAY = 0.8; // 1個目のブロックが着地してから固定されるまでの秒数
const HISCORE_KEY = 'tower-stack-hiscore';

type Cell = [number, number];
interface PieceDef { color: number; cells: Cell[] }
// セル座標は重心が原点になるようにしてある
const PIECES: PieceDef[] = [
  { color: 0x35c9e8, cells: [[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]] }, // I
  { color: 0xf5d547, cells: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]] }, // O
  { color: 0xb26be8, cells: [[-1, -0.25], [0, -0.25], [1, -0.25], [0, 0.75]] }, // T
  { color: 0xf59e42, cells: [[-1.25, -0.25], [-0.25, -0.25], [0.75, -0.25], [0.75, 0.75]] }, // L
  { color: 0x4f7df0, cells: [[1.25, -0.25], [0.25, -0.25], [-0.75, -0.25], [-0.75, 0.75]] }, // J
  { color: 0x5fd068, cells: [[-1, -0.5], [0, -0.5], [0, 0.5], [1, 0.5]] }, // S
  { color: 0xee5a5a, cells: [[1, -0.5], [0, -0.5], [0, 0.5], [-1, 0.5]] }, // Z
];

type ItemKind = 'glue' | 'cement' | 'shield' | 'heal';
const ITEM_INFO: Record<ItemKind, { name: string; desc: string }> = {
  glue: { name: 'ツタ', desc: '次のブロックが周り2マスのブロックにツタをからめて固定' },
  cement: { name: 'セメント', desc: '積んだブロックを全部かためる' },
  shield: { name: 'バリア', desc: '次の邪魔イベントを防ぐ' },
  heal: { name: '回復', desc: '残機を1つ回復する' },
};
const ITEM_KINDS: ItemKind[] = ['glue', 'cement', 'shield', 'heal'];

type EventKind = 'wind' | 'quake' | 'meteor' | 'speed';
const EVENT_INFO: Record<EventKind, { name: string; desc: string; duration: number }> = {
  wind: { name: '突風', desc: '横からの風でブロックが流される!', duration: 6 },
  quake: { name: '地震', desc: '土台がゆれる!', duration: 4.5 },
  meteor: { name: 'いん石', desc: '横から石が飛んでくる!', duration: 5 },
  speed: { name: 'スピードアップ', desc: 'ブロックの落下が速くなる!', duration: 8 },
};
// 地震 ('quake') は難しすぎるので出さない。戻すときはこの配列に 'quake' を足す
const EVENT_KINDS: EventKind[] = ['wind', 'meteor', 'speed'];

// ───────────────────────── 描画セットアップ ─────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
const CAM_DIST = VIEW_H / 2 / Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
const CAM_OFFSET_X = 0; // 0 なら正面から。増やすと斜めから見る (3D化直後は 2.5)
const CAM_OFFSET_Y = 0; // 0 なら正面から。増やすと見下ろす (3D化直後は 3.5)
const camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 1, 500);
let viewHalfW = 10; // Z=0 の面で画面に映る横幅の半分

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  viewHalfW = (VIEW_H / 2) * (w / h);
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

const cellGeo = new RoundedBoxGeometry(0.97, 0.97, 0.97, 3, 0.1);

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

// 高さの目盛り (5mごと)
function makeLabel(text: string): THREE.Mesh {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 48;
  const g = c.getContext('2d')!;
  g.font = 'bold 30px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.textBaseline = 'middle';
  g.fillText(text, 4, 24);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.9),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true }),
  );
  return m;
}
const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25 });
for (let h = 5; h <= 300; h += 5) {
  const line = new THREE.Mesh(new THREE.PlaneGeometry(60, 0.04), lineMat);
  line.position.set(0, h, -0.75);
  scene.add(line);
  const label = makeLabel(`${h}m`);
  label.position.set(-6.3, h + 0.5, -0.75);
  scene.add(label);
}
// 最高到達ライン
const bestLine = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 0.08),
  new THREE.MeshBasicMaterial({ color: 0xffd166 }),
);
bestLine.position.z = -0.7;
bestLine.visible = false;
scene.add(bestLine);

// 土台の位置の目印: 両端の縦線は常に表示し、土台が画面の下に隠れたら画面下にバーを出す
const edgeMat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.45 });
const edgeLines = [-1, 1].map((side) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, VIEW_H * 2), edgeMat);
  m.position.set(side * PLATFORM_HALF_W, 0, -1.5);
  scene.add(m);
  return m;
});
const baseMarker = new THREE.Group();
baseMarker.add(new THREE.Mesh(
  new THREE.PlaneGeometry(PLATFORM_HALF_W * 2, 0.3),
  new THREE.MeshBasicMaterial({ color: 0xffe08a }),
));
for (const side of [-1, 1]) {
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.9), new THREE.MeshBasicMaterial({ color: 0xffe08a }));
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

const cellShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));

interface Block {
  body: CANNON.Body;
  group: THREE.Group;
  mat: THREE.MeshStandardMaterial;
  cells: Cell[];
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

function createPiece(def: PieceDef, x: number, y: number): Block {
  const body = new CANNON.Body({ mass: 1 });
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.05 });
  for (const [cx, cy] of def.cells) {
    body.addShape(cellShape, new CANNON.Vec3(cx, cy, 0));
    const mesh = new THREE.Mesh(cellGeo, mat);
    mesh.position.set(cx, cy, 0);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  lock2D(body);
  body.position.set(x, y, 0);
  body.linearDamping = 0.05;
  body.angularDamping = 0.6;
  body.sleepSpeedLimit = 0.15;
  body.sleepTimeLimit = 0.6;
  world.addBody(body);
  scene.add(group);
  const block: Block = { body, group, mat, cells: def.cells, cemented: false, isMeteor: false, life: 0 };
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
  block.mat.dispose();
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
  const ext = 0.5 * (Math.abs(s) + Math.abs(c));
  let top = -Infinity;
  for (const [cx, cy] of block.cells) {
    top = Math.max(top, block.body.position.y + cx * s + cy * c + ext);
  }
  return top;
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
function beep(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.08, slide = 0): void {
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
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    const buf = audio.createBuffer(1, Math.floor(audio.sampleRate * dur), audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
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
interface Input { left: boolean; right: boolean; up: boolean; down: boolean; rotate: boolean; item: boolean; confirm: boolean; cancel: boolean }
const keys = new Set<string>();
const keyPressed = new Set<string>();
const menuNav = new MenuNav();
let resultOpen = false;
let nameEntryOpen = false; // 順位の確認中・名前入力中は、リザルトの操作を止める
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    window.location.href = HUB_URL;
    return;
  }
  if (resultOpen && !nameEntryOpen && menuNav.pushKey(e)) e.preventDefault();
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  if (!e.repeat) keyPressed.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

let prevPadButtons: boolean[] = [];
function readInput(): Input {
  const inp: Input = { left: false, right: false, up: false, down: false, rotate: false, item: false, confirm: false, cancel: false };
  inp.left = keys.has('ArrowLeft') || keys.has('KeyA');
  inp.right = keys.has('ArrowRight') || keys.has('KeyD');
  inp.down = keys.has('ArrowDown') || keys.has('KeyS');
  const kp = (...codes: string[]) => codes.some((c) => keyPressed.has(c));
  inp.rotate = kp('Space', 'KeyZ', 'ArrowUp', 'KeyW');
  inp.item = kp('Enter', 'KeyX', 'ShiftLeft', 'ShiftRight');
  inp.confirm = kp('Space', 'Enter');
  keyPressed.clear();

  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const b = pad.buttons.map((x) => x.pressed);
    const ax = pad.axes[0] ?? 0;
    const ay = pad.axes[1] ?? 0;
    inp.left ||= !!b[14] || ax < -0.5;
    inp.right ||= !!b[15] || ax > 0.5;
    inp.down ||= !!b[13] || ay > 0.5;
    inp.up ||= !!b[12] || ay < -0.5;
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
type State = 'title' | 'playing' | 'gameover';
let state: State = 'title';
let stateTime = 0;

let current: Block | null = null; // 操作中のブロック
let currentReleased = false; // collide イベントで立つ
let currentTouched: CANNON.Body | null = null;
let targetX = 0;
let targetAngle = 0;
let fastDrop = false;
let spawnTimer = 0;
let nextDef: PieceDef = PIECES[0];
let moveRepeat = 0;
let moveDir = 0;

let drops = 0;
let placed = 0;
let bestHeight = 0;
let currentHeight = 0;
let pendingTime = 0;
let pendingMin = Infinity;
let items: ItemKind[] = [];
let glueArmed = false;
let shield = false;
let pendingVine: { block: Block; timer: number } | null = null;
let firstBlock: { block: Block; timer: number } | null = null; // 1個目は着地後に自動で固定する

let eventTimer = 30;
let warnTimer = 0;
let upcoming: EventKind | null = null;
let activeEvent: EventKind | null = null;
let activeTime = 0;
let windDir = 1;
let meteorTimer = 0;
let bannerTimer = 0;
let shake = 0;
let camY = 6;
let hiscore = 0;
try {
  hiscore = Number(localStorage.getItem(HISCORE_KEY)) || 0;
} catch {
  // 保存できない環境ではハイスコアなしで動かす
}

function fallSpeed(): number {
  let v = 2.2 + Math.min(2.5, bestHeight * 0.04);
  if (activeEvent === 'speed') v *= 1.6;
  if (fastDrop) v *= 3;
  return v;
}
function score(): number {
  return Math.floor(bestHeight * 100);
}
function randomPiece(): PieceDef {
  return PIECES[Math.floor(Math.random() * PIECES.length)];
}

// 物理ステップごとの処理: 操作中ブロックの制御と風
world.addEventListener('preStep', () => {
  if (current && !currentReleased) {
    const b = current.body;
    const vx = Math.max(-14, Math.min(14, (targetX - b.position.x) * 22));
    b.velocity.set(vx, -fallSpeed(), 0);
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
  const def = nextDef;
  nextDef = randomPiece();
  const block = createPiece(def, 0, camY + VIEW_H / 2 + 1);
  block.body.allowSleep = false;
  current = block;
  currentReleased = false;
  currentTouched = null;
  targetX = 0;
  targetAngle = 0;
  if (glueArmed) {
    block.mat.emissive.setHex(VINE_COLOR);
    block.mat.emissiveIntensity = 0.55;
  }
  block.body.addEventListener('collide', (e: { body: CANNON.Body }) => {
    if (current === block && !currentReleased) {
      currentReleased = true;
      currentTouched = e.body;
    }
  });
  renderNext();
}

function onLanded(block: Block): void {
  block.body.allowSleep = true;
  // 着地の衝撃をやわらげる (勢いでタワーを崩しにくくする)
  block.body.velocity.scale(0.3, block.body.velocity);
  block.body.angularVelocity.scale(0.3, block.body.angularVelocity);
  placed++;
  if (placed === 1) firstBlock = { block, timer: FIRST_FIX_DELAY };
  beep(180, 0.08, 'triangle', 0.12, -60);
  if (glueArmed) {
    // 少し落ち着いてからツタを伸ばす
    pendingVine = { block, timer: VINE_DELAY };
    glueArmed = false;
  }
  if (placed % ITEM_EVERY === 0 && items.length < ITEM_MAX) {
    // 回復は、残機が減っているときだけ出る
    const pool = ITEM_KINDS.filter((k) => k !== 'heal' || drops > 0);
    const kind = pool[Math.floor(Math.random() * pool.length)];
    items.push(kind);
    showBanner(`アイテム GET: ${ITEM_INFO[kind].name}`, ITEM_INFO[kind].desc, true, 1.6);
    beep(660, 0.1, 'square', 0.07);
    setTimeout(() => beep(880, 0.14, 'square', 0.07), 90);
    renderItems();
  }
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
  const srcCells = src.cells.map((c) => ({ local: c, world: worldPoint(src.body, c) }));
  for (const blk of blocks) {
    if (blk === src || blk === current || blk.isMeteor) continue;
    const pairs: { la: Cell; lb: Cell; d: number }[] = [];
    for (const oc of blk.cells) {
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
  showBanner('ツタ!', '周りのブロックにからみついた', true, 1.4);
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
  if (kind === 'shield' && shield) return;
  if (kind === 'heal' && drops === 0) {
    // 残機が満タンなら使わずに後ろへ回す
    items.push(items.shift()!);
    showBanner('残機は満タン', '回復はあとに回した', true, 1.2);
    renderItems();
    return;
  }
  items.shift();
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
    showBanner('セメント!', 'いま積んであるブロックが固まった', true, 1.6);
  } else if (kind === 'heal') {
    drops = Math.max(0, drops - 1);
    showBanner('回復!', '残機が1つ戻った', true, 1.6);
  } else {
    shield = true;
  }
  renderItems();
}

// ───────────────────────── 邪魔イベント ─────────────────────────
function wakeAll(): void {
  for (const blk of blocks) blk.body.wakeUp();
}

function startEvent(kind: EventKind): void {
  if (shield) {
    shield = false;
    showBanner('バリアで防いだ!', `${EVENT_INFO[kind].name}を無効化`, true, 2);
    beep(900, 0.25, 'sine', 0.1, 500);
    renderItems();
    return;
  }
  activeEvent = kind;
  activeTime = 0;
  wakeAll();
  if (kind === 'wind') windDir = Math.random() < 0.5 ? -1 : 1;
  if (kind === 'quake') world.allowSleep = false;
  if (kind === 'meteor') meteorTimer = 0;
  const arrow = kind === 'wind' ? (windDir > 0 ? ' →→→' : ' ←←←') : '';
  showBanner(`${EVENT_INFO[kind].name}${arrow}`, EVENT_INFO[kind].desc, false, 2);
}

function endEvent(): void {
  if (activeEvent === 'quake') {
    world.allowSleep = true;
    platformBody.position.x = 0;
    platformBody.velocity.setZero();
  }
  activeEvent = null;
}

function spawnMeteor(): void {
  const side = Math.random() < 0.5 ? -1 : 1;
  const body = new CANNON.Body({ mass: 0.35 });
  body.addShape(new CANNON.Sphere(0.45));
  lock2D(body);
  const y = Math.max(2, currentHeight) + 1 + Math.random() * 2;
  body.position.set(side * 11, y, 0);
  body.velocity.set(-side * (7 + Math.random() * 2), 3, 0);
  world.addBody(body);
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a2d2d, emissive: 0xff5a1f, emissiveIntensity: 0.9, roughness: 1, flatShading: true });
  const group = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.47, 1), mat);
  rock.castShadow = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softTex, color: 0xff7a2a, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.set(2.6, 2.6, 1);
  group.add(rock, glow);
  scene.add(group);
  blocks.push({ body, group, mat, cells: [[0, 0]], cemented: false, isMeteor: true, life: 0 });
  beep(300, 0.4, 'sawtooth', 0.06, -220);
}

function updateEvents(dt: number): void {
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
  if (upcoming) {
    warnTimer -= dt;
    if (warnTimer <= 0) {
      const k = upcoming;
      upcoming = null;
      startEvent(k);
      eventTimer = Math.max(16, 26 - bestHeight * 0.15);
    }
    return;
  }
  eventTimer -= dt;
  if (eventTimer <= 0) {
    upcoming = EVENT_KINDS[Math.floor(Math.random() * EVENT_KINDS.length)];
    warnTimer = 2.5;
    showBanner('! まもなく邪魔イベント !', EVENT_INFO[upcoming].name, false, 2.4);
    beep(440, 0.12, 'square', 0.08);
    setTimeout(() => beep(440, 0.12, 'square', 0.08), 220);
  }
}

// ───────────────────────── HUD ─────────────────────────
const $ = (id: string) => document.getElementById(id)!;
const elScore = $('score');
const elHeight = $('height');
const elDrops = $('drops');
const elNext = $('next');
const elItems = $('items');
const elStatus = $('status');
const elBanner = $('banner');
const elHud = $('hud');
const elResult = $('result-modal');
const elResultScore = $('result-score');
const elResultDetail = $('result-detail');
const elResultRecord = $('result-record');

function showBanner(title: string, sub: string, good: boolean, time: number): void {
  elBanner.className = good ? 'good' : '';
  elBanner.innerHTML = '';
  elBanner.append(title);
  const s = document.createElement('small');
  s.textContent = sub;
  elBanner.append(s);
  elBanner.style.display = 'block';
  bannerTimer = time;
}

function renderNext(): void {
  elNext.innerHTML = '';
  const xs = nextDef.cells.map((c) => c[0]);
  const ys = nextDef.cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const maxY = Math.max(...ys);
  const color = `#${nextDef.color.toString(16).padStart(6, '0')}`;
  for (const [cx, cy] of nextDef.cells) {
    const i = document.createElement('i');
    i.style.background = color;
    i.style.gridColumn = String(Math.round(cx - minX) + 1);
    i.style.gridRow = String(Math.round(maxY - cy) + 1);
    elNext.append(i);
  }
}

function renderItems(): void {
  elItems.innerHTML = '';
  if (items.length === 0) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = `ブロックを${ITEM_EVERY}個置くともらえる`;
    elItems.append(e);
  }
  for (const kind of items) {
    const d = document.createElement('div');
    d.className = `item ${kind}`;
    d.textContent = ITEM_INFO[kind].name;
    elItems.append(d);
  }
  const st: string[] = [];
  if (glueArmed) st.push('ツタ 準備OK');
  if (shield) st.push('バリア展開中');
  setText(elStatus, st.join(' / '));
}

function renderHud(): void {
  setDisplay(elHud, state === 'title' ? 'none' : 'block');
  setText(elScore, String(score()));
  setText(elHeight, currentHeight.toFixed(1));
  // 残機: 左から MAX_DROPS 個。落とした数だけ右から消える
  const marks = elDrops.children;
  for (let i = 0; i < marks.length; i++) marks[i].classList.toggle('lost', i >= MAX_DROPS - drops);
}

// ───────────────────────── タイトル (全ゲーム共通の画面) ─────────────────────────
const titleScreen = new ArcadeTitleScreen({
  slug: 'tower-stack',
  accentColor: ACCENT,
  tagline: 'ブロックを積んで高さを競え! 3個落としたらゲームオーバー',
  onStart: () => startGame(),
});

/** タイトルの背景に置く飾りのタワー */
function buildTitleTower(): void {
  const deco: [number, number, number][] = [[1, 0, 1], [0, 0, 2.5], [1, 1, 4], [2, -1.5, 3.75]];
  for (const [i, x, y] of deco) freezeBlock(createPiece(PIECES[i], x, y), 0);
}

function clearBlocks(): void {
  clearParticles();
  for (const blk of [...blocks]) removeBlock(blk);
}

function showTitle(): void {
  closeResult();
  clearBlocks();
  endEvent();
  upcoming = null;
  current = null;
  currentHeight = 0;
  bestLine.visible = false;
  elBanner.style.display = 'none';
  buildTitleTower();
  state = 'title';
  stateTime = 0;
  titleScreen.show();
  guideTitle();
}

// ───────────────────────── リザルト (共通メニュー) ─────────────────────────
const resultItems: ResultMenuItem[] = [
  { button: $('result-btn-retry'), color: ACCENT },
  { button: $('result-btn-title'), color: '#7bdff2' },
  { button: $('result-btn-exit'), color: '#ff8fa3' },
];
setupResultMenu($('result-menu'), resultItems);
const resultActions = [() => startGame(), () => showTitle(), () => { window.location.href = HUB_URL; }];
resultItems.forEach((it, i) => it.button?.addEventListener('click', () => { if (resultOpen && !nameEntryOpen) resultActions[i](); }));
let resultFocus = 0;
let stopCountUp: (() => void) | null = null;

function openResult(isNew: boolean): void {
  resultOpen = true;
  resultFocus = 0;
  menuNav.clear();
  applyResultMenuFocus(resultItems, resultFocus);
  elResultDetail.textContent = `最高到達 ${bestHeight.toFixed(1)} m / 置いたブロック ${placed} 個`;
  elResultRecord.textContent = isNew ? '自己ベスト更新!' : `自己ベスト ${hiscore}`;
  elResultRecord.classList.toggle('new', isNew);
  elResult.classList.add('show');
  stopCountUp = countUpText(elResultScore, String(score()));
  guideResult();
  showRanking();
}

// ── 共通ランキング (上位3位)。上位に入ったら名前を登録する ──
const elResultRanking = $('result-ranking');
let resultSeq = 0;
let resultArmUntil = 0;

function renderRanking(list: LeaderboardEntry[] | null, highlightRank?: number): void {
  elResultRanking.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'rank-head';
  head.textContent = 'ランキング';
  elResultRanking.append(head);
  if (!list) {
    const row = document.createElement('div');
    row.className = 'rank-row empty';
    row.textContent = '読み込み中…';
    elResultRanking.append(row);
    return;
  }
  for (const e of list) {
    const row = document.createElement('div');
    row.className = `rank-row r${e.rank}`;
    if (e.score <= 0) row.classList.add('empty');
    if (e.rank === highlightRank) row.classList.add('me');
    const rank = document.createElement('span');
    rank.className = 'rank-no';
    rank.textContent = `${e.rank}位`;
    const name = document.createElement('span');
    name.className = 'rank-name';
    name.textContent = e.name;
    const sc = document.createElement('span');
    sc.className = 'rank-score';
    sc.textContent = e.formattedScore;
    row.append(rank, name, sc);
    elResultRanking.append(row);
  }
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
      scoreDisplay: `${s.toLocaleString()} pts`,
      rankDisplay: `第${rank}位`,
      themeClass: 'theme-street',
      delayMs: NAME_ENTRY_AFTER_RESULT_MS,
      onComplete: (name) => {
        nameEntryOpen = false;
        resultArmUntil = performance.now() + 800; // 名前の決定がメニューの決定として入らないようにする
        menuNav.clear();
        void saveLeaderboardScore(SLUG, s, name, undefined, `高さ ${height.toFixed(1)}m`).then((res) => {
          if (seq !== resultSeq) return;
          if (res.rank > 0) renderRanking(res.list, res.rank);
        });
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
  menuNav.updatePad(inp.left ? -1 : inp.right ? 1 : 0, inp.up ? -1 : inp.down ? 1 : 0);
  for (const dir of menuNav.take()) {
    resultFocus = (resultFocus + dir + resultItems.length) % resultItems.length;
    applyResultMenuFocus(resultItems, resultFocus);
    beep(420, 0.04, 'square', 0.04);
  }
  if (stateTime < RESULT_DELAY + 0.6) return; // 直前の操作が決定として入らないよう少し待つ
  if (inp.confirm) resultActions[resultFocus]();
  else if (inp.cancel) resultActions[2]();
}

// ───────────────────────── 進行 ─────────────────────────
function startGame(): void {
  closeResult();
  titleScreen.hide();
  clearBlocks();
  endEvent();
  current = null;
  currentReleased = false;
  drops = 0;
  placed = 0;
  bestHeight = 0;
  currentHeight = 0;
  pendingTime = 0;
  pendingMin = Infinity;
  items = [];
  glueArmed = false;
  shield = false;
  pendingVine = null;
  firstBlock = null;
  eventTimer = 30;
  upcoming = null;
  spawnTimer = 0.4;
  camY = 6;
  bestLine.visible = false;
  elBanner.style.display = 'none';
  nextDef = randomPiece();
  renderNext();
  renderItems();
  state = 'playing';
  stateTime = 0;
  guidePlay();
  beep(520, 0.12, 'square', 0.07);
}

let resultIsNew = false;

function gameOver(): void {
  state = 'gameover';
  stateTime = 0;
  endEvent();
  upcoming = null;
  current = null;
  blowUpAll();
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
}

function updatePlaying(dt: number, inp: Input): void {
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
      showBanner('1個目を固定!', 'このブロックはもう動かない', true, 1.4);
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
        const ex = Math.max(-viewHalfW + 1.5, Math.min(viewHalfW - 1.5, p.x));
        const ey = Math.max(p.y, camY - VIEW_H / 2 + 2);
        explode(ex, ey, blk.mat.color.getHex(), 1.3);
      }
      removeBlock(blk);
      if (wasCurrent) {
        current = null;
        spawnTimer = 0.7;
      }
      if (counts) {
        drops++;
        shake = 0.35;
        boom();
        if (drops >= MAX_DROPS) {
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
  if (bestHeight > 0) {
    bestLine.visible = true;
    bestLine.position.y = bestHeight;
  }
}

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  stateTime += dt;
  const inp = readInput();

  if (state === 'playing') {
    updatePlaying(dt, inp);
  } else {
    // タイトル・ゲームオーバー中も、残ったブロックは動かしておく
    if (state === 'gameover') {
      world.step(1 / 120, dt, 10);
      if (!resultOpen && stateTime >= RESULT_DELAY) openResult(resultIsNew);
      if (resultOpen) updateResult(inp);
    }
    // タイトルのスタート操作は共通タイトル画面が受け付ける
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
  guide.visible = state === 'playing' && !!current;
  if (current) {
    const xs = current.cells.map((c) => worldPoint(current!.body, c)[0]);
    const minX = Math.min(...xs) - 0.5;
    const maxX = Math.max(...xs) + 0.5;
    guide.scale.x = maxX - minX;
    guide.position.set((minX + maxX) / 2, current.body.position.y - 40, -0.6);
  }
  platformMesh.position.set(platformBody.position.x, platformBody.position.y, 0);

  const camTarget = Math.max(6, currentHeight + 3);
  camY += (camTarget - camY) * Math.min(1, dt * 2.5);
  updateParticles(dt);
  shake = Math.max(0, shake - dt * 0.8);
  const sx = (Math.random() - 0.5) * shake;
  const sy = (Math.random() - 0.5) * shake;
  camera.position.set(CAM_OFFSET_X + sx, camY + CAM_OFFSET_Y + sy, CAM_DIST);
  camera.lookAt(sx, camY + sy, 0);
  // 太陽(影)はカメラの高さについてくる
  sun.position.set(-9, camY + 16, 14);
  sun.target.position.set(0, camY, 0);
  const sky = (scene.background as THREE.Color).copy(SKY_LOW).lerp(SKY_HIGH, Math.min(1, Math.max(0, (camY - 6) / 70)));
  scene.fog!.color.copy(sky);
  starMat.opacity = Math.min(1, Math.max(0, (camY - 35) / 40));

  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) elBanner.style.display = 'none';
  }
  renderHud();
  renderer.render(scene, camera);
}

showTitle();
renderItems();
requestAnimationFrame(frame);

// 動作確認用 (開発時のみ)
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tower = {
    get state() { return { state, drops, placed, bestHeight, currentHeight, items, activeEvent, blocks: blocks.length }; },
    give: (k: ItemKind) => { items.push(k); renderItems(); },
    event: (k: EventKind) => startEvent(k),
    next: (i: number) => { nextDef = PIECES[i]; renderNext(); },
    get vines() { return vines.length; },
  };
}
