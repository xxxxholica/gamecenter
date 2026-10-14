// 落ちてくるピースの定義。テトリス型のブロックに加えて、ほかのゲームにちなんだ形(車・机・だるまなど)がある。
// 当たり判定は「箱」または「球」の組み合わせ(parts)で、重心が原点付近になるように置いてある。
// オンライン対戦では、相手のタワーを描くためにピースを番号(PIECES の添字)で送るので、並びを変えるときはサーバーと揃える必要はないが、
// 対戦中のクライアントどうしで同じ版を使うこと(packages/shared/towerProtocol.ts の PIECE_COUNT と数を合わせる)。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type Cell = [number, number];

/** 当たり判定の部品。round=true のときは半径 hw の球(だるま) */
export interface Part {
  x: number;
  y: number;
  hw: number;
  hh: number;
  round?: boolean;
}

export interface PieceDef {
  id: string;
  /** 次のピース表示に出す名前(テトリス型は空) */
  name: string;
  /** どのゲームにちなんだ形か(説明用) */
  from?: string;
  color: number;
  parts: Part[];
  mass: number;
  /** テトリス型か(次のピース表示をマス目で描く) */
  tetromino: boolean;
  /** 見た目を作る。mat はピースの主な色の材質(爆発の破片の色・セメントの色替えに使う) */
  build: (mat: THREE.MeshStandardMaterial) => THREE.Group;
}

const cellGeo = new RoundedBoxGeometry(0.97, 0.97, 0.97, 3, 0.1);
cellGeo.userData.shared = true; // 全ピースで使い回す(捨てない)

function shadowed<T extends THREE.Object3D>(o: T): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = true;
      c.receiveShadow = true;
    }
  });
  return o;
}

function tetromino(id: string, color: number, cells: Cell[]): PieceDef {
  return {
    id,
    name: '',
    color,
    parts: cells.map(([x, y]) => ({ x, y, hw: 0.5, hh: 0.5 })),
    mass: 1,
    tetromino: true,
    build: (mat) => {
      const g = new THREE.Group();
      for (const [x, y] of cells) {
        const m = new THREE.Mesh(cellGeo, mat);
        m.position.set(x, y, 0);
        g.add(m);
      }
      return shadowed(g);
    },
  };
}

/** マス目の座標(左下が0,0の整数)から、重心が原点になるように並べ直したブロックを作る(いびつな形用) */
function poly(id: string, color: number, grid: Cell[]): PieceDef {
  const cx = grid.reduce((s, c) => s + c[0], 0) / grid.length;
  const cy = grid.reduce((s, c) => s + c[1], 0) / grid.length;
  return tetromino(id, color, grid.map(([x, y]): Cell => [x - cx, y - cy]));
}

const std = (color: number, roughness = 0.5, metalness = 0.05) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

// ── 車 (ミッドナイト・スカイウェイ) ── 車体色 [body, roof]。ミッドナイト・スカイウェイのマシン色とは独立に持つ(あちらの車種入れ替えの影響を受けないため)
const CAR_COLORS: [number, number][] = [
  [0xded235, 0x1a1c22],
  [0x243325, 0x1a1c22],
  [0x1976d2, 0x1a1c22],
  [0x4b5563, 0x1a1c22],
  [0xe6cf9e, 0x1a1c22],
  [0xf5f6fa, 0x1a1c22],
  [0x11141a, 0x11141a],
  [0xe05615, 0xf5f6fa],
  [0x2952a3, 0x2d3436],
  [0xd63031, 0x1a1c22],
  [0x3d4d3d, 0xf5f6fa],
  [0x54a0ff, 0xf5f6fa],
  [0xf5f6fa, 0x1a1c22],
  [0x35422e, 0x1f241d],
  [0x8a7a5a, 0x3d3527],
  [0x1e2022, 0x111315],
  [0x5a2323, 0x241111],
  [0x4a5056, 0x232629],
  [0xf5f6fa, 0x283823],
  [0x364835, 0x202b20],
  [0x9c7a52, 0x4a3a27],
  [0x1f2326, 0x141719],
  [0xe8ecf0, 0xd63031],
];
function buildCar(mat: THREE.MeshStandardMaterial): THREE.Group {
  const [bodyColor, roofColor] = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
  mat.color.setHex(bodyColor);
  mat.roughness = 0.3;
  mat.metalness = 0.35;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.6, 0.62, 1.15, 3, 0.16), mat);
  body.position.set(0, -0.12, 0);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.55, 1.0, 3, 0.14), std(roofColor, 0.35, 0.3));
  roof.position.set(-0.12, 0.45, 0);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.36, 1.03), std(0x1b2a3a, 0.1, 0.6));
  glass.position.set(-0.12, 0.45, 0);
  g.add(body, roof, glass);
  const tireMat = std(0x16181c, 0.9);
  const rimMat = std(0xb8bec8, 0.3, 0.8);
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.5, 0.5]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 18), tireMat);
      tire.rotation.x = Math.PI / 2;
      tire.position.set(x, -0.42, z);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.24, 12), rimMat);
      rim.rotation.x = Math.PI / 2;
      rim.position.copy(tire.position);
      g.add(tire, rim);
    }
  }
  const lightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d0, emissive: 0xfff2b0, emissiveIntensity: 0.8 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff3030, emissive: 0xff2020, emissiveIntensity: 0.7 });
  for (const z of [-0.38, 0.38]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, 0.24), lightMat);
    head.position.set(1.3, -0.05, z);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.22), tailMat);
    tail.position.set(-1.3, -0.02, z);
    g.add(head, tail);
  }
  return shadowed(g);
}

// ── 机 (テンパレラン) ──
function buildDesk(mat: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new RoundedBoxGeometry(2.5, 0.22, 1.2, 2, 0.05), mat);
  top.position.set(0, 0.45, 0);
  const legMat = std(0x9aa3ad, 0.35, 0.7);
  for (const x of [-1.05, 1.05]) {
    for (const z of [-0.45, 0.45]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.0, 10), legMat);
      leg.position.set(x, -0.15, z);
      g.add(leg);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.95), legMat);
    bar.position.set(x, -0.62, 0);
    g.add(bar);
  }
  const drawer = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 1.0), std(0x8a8f96, 0.5, 0.4));
  drawer.position.set(0, 0.26, 0);
  g.add(top, drawer);
  return shadowed(g);
}

// ── だるま (えんにち射的) ── 球なので転がりやすい
function buildDaruma(mat: THREE.MeshStandardMaterial): THREE.Group {
  mat.roughness = 0.25;
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.62, 28, 20), mat);
  ball.scale.set(1, 1.05, 0.95);
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.34, 24), std(0xfff3e0, 0.6));
  face.position.set(0, 0.12, 0.6);
  face.scale.set(1, 0.9, 1);
  const eyeMat = std(0x111111, 0.4);
  for (const x of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), eyeMat);
    eye.position.set(x, 0.17, 0.61);
    g.add(eye);
  }
  const gold = std(0xffc94a, 0.3, 0.7);
  const belly = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 20, Math.PI), gold);
  belly.position.set(0, -0.28, 0.58);
  belly.rotation.z = Math.PI;
  g.add(ball, face, belly);
  return shadowed(g);
}

// ── 消火栓 (ストリートビーボーイ) ──
function buildHydrant(mat: THREE.MeshStandardMaterial): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 1.25, 20), mat);
  body.position.set(0, -0.08, 0);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.5, 0.18, 20), mat);
  base.position.set(0, -0.72, 0);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  cap.position.set(0, 0.55, 0);
  const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.16, 6), std(0xc9ced6, 0.3, 0.8));
  bolt.position.set(0, 0.9, 0);
  g.add(body, base, cap, bolt);
  for (const x of [-0.45, 0.45]) {
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 12), mat);
    noz.rotation.z = Math.PI / 2;
    noz.position.set(x, 0.15, 0);
    g.add(noz);
  }
  return shadowed(g);
}

// ── スマホ (極限ギリギリ選手権) ── 細長くて立てると不安定
function buildPhone(mat: THREE.MeshStandardMaterial): THREE.Group {
  mat.roughness = 0.2;
  mat.metalness = 0.6;
  const g = new THREE.Group();
  const body = new THREE.Mesh(new RoundedBoxGeometry(0.92, 1.85, 0.5, 3, 0.12), mat);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.78, 1.62),
    new THREE.MeshStandardMaterial({ color: 0x1d3b6a, emissive: 0x2a6bd8, emissiveIntensity: 0.55, roughness: 0.1 }),
  );
  screen.position.set(0, 0, 0.26);
  const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  bar.position.set(0, -0.68, 0.265);
  g.add(body, screen, bar);
  return shadowed(g);
}

// ── 米俵 (剛体大相撲) ── 横に寝かせた俵
function buildTawara(mat: THREE.MeshStandardMaterial): THREE.Group {
  mat.roughness = 0.95;
  const g = new THREE.Group();
  const bale = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.0, 20), mat);
  bale.rotation.z = Math.PI / 2;
  const ropeMat = std(0x6b4a24, 0.9);
  for (const x of [-0.6, 0, 0.6]) {
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.04, 6, 24), ropeMat);
    rope.rotation.y = Math.PI / 2;
    rope.position.set(x, 0, 0);
    g.add(rope);
  }
  for (const x of [-1.0, 1.0]) {
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), std(0xc9a46a, 1));
    end.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2;
    end.position.set(x + Math.sign(x) * 0.005, 0, 0);
    g.add(end);
  }
  g.add(bale);
  return shadowed(g);
}

export const PIECES: PieceDef[] = [
  tetromino('I', 0x35c9e8, [[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]]),
  tetromino('O', 0xf5d547, [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]),
  tetromino('T', 0xb26be8, [[-1, -0.25], [0, -0.25], [1, -0.25], [0, 0.75]]),
  tetromino('L', 0xf59e42, [[-1.25, -0.25], [-0.25, -0.25], [0.75, -0.25], [0.75, 0.75]]),
  tetromino('J', 0x4f7df0, [[1.25, -0.25], [0.25, -0.25], [-0.75, -0.25], [-0.75, 0.75]]),
  tetromino('S', 0x5fd068, [[-1, -0.5], [0, -0.5], [0, 0.5], [1, 0.5]]),
  tetromino('Z', 0xee5a5a, [[1, -0.5], [0, -0.5], [0, 0.5], [-1, 0.5]]),
  {
    id: 'car', name: '車', from: 'ミッドナイト・スカイウェイ', color: 0x1976d2, mass: 1.6, tetromino: false,
    parts: [{ x: 0, y: -0.15, hw: 1.3, hh: 0.4 }, { x: -0.12, y: 0.45, hw: 0.7, hh: 0.28 }],
    build: buildCar,
  },
  {
    id: 'desk', name: '机', from: 'テンパレラン', color: 0xc8935a, mass: 1, tetromino: false,
    parts: [{ x: 0, y: 0.42, hw: 1.25, hh: 0.2 }, { x: -1.05, y: -0.22, hw: 0.12, hh: 0.48 }, { x: 1.05, y: -0.22, hw: 0.12, hh: 0.48 }],
    build: buildDesk,
  },
  {
    id: 'daruma', name: 'だるま', from: 'えんにち射的', color: 0xd7262e, mass: 0.8, tetromino: false,
    parts: [{ x: 0, y: 0, hw: 0.62, hh: 0.62, round: true }],
    build: buildDaruma,
  },
  {
    id: 'hydrant', name: '消火栓', from: 'ストリートビーボーイ', color: 0xd83a2e, mass: 1.2, tetromino: false,
    parts: [{ x: 0, y: -0.05, hw: 0.38, hh: 0.8 }, { x: 0, y: -0.72, hw: 0.5, hh: 0.1 }],
    build: buildHydrant,
  },
  {
    id: 'phone', name: 'スマホ', from: '極限ギリギリ選手権', color: 0x30343c, mass: 0.6, tetromino: false,
    parts: [{ x: 0, y: 0, hw: 0.46, hh: 0.92 }],
    build: buildPhone,
  },
  {
    id: 'tawara', name: '米俵', from: '剛体大相撲', color: 0xe2c58e, mass: 1.1, tetromino: false,
    parts: [{ x: 0, y: 0, hw: 1.0, hh: 0.45 }],
    build: buildTawara,
  },
  // ── いびつな形のブロック(5〜8マス)。番号が変わらないよう、追加は必ず末尾に ──
  poly('U', 0xff8fab, [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1]]),
  poly('plus', 0x2ec4b6, [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]]),
  poly('stairs', 0xff9f1c, [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2]]),
  poly('ring', 0x9b5de5, [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]),
  poly('hook', 0x00bbf9, [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1], [3, 2]]),
  poly('F', 0xf15bb5, [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]]),
  poly('Y', 0x8ac926, [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1]]),
];

// 次のピースは「全種類を1個ずつ入れた袋」から順に取り出す。最初のひと回り(全種類の数)で全種類が必ず1回ずつ出て、袋が空になったら入れ直す。
let bag: number[] = [];

/** 袋を空にする(ゲームの開始時に呼ぶ) */
export function resetPieceBag(): void {
  bag = [];
}

/** 次のピースの番号(PIECES の添字)を選ぶ */
export function randomPieceIndex(rand: () => number = Math.random): number {
  if (bag.length === 0) {
    bag = PIECES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop()!;
}

/** 部品の中心と、指定の角度のときの上下・左右の半分の大きさ */
export function partExtents(p: Part, s: number, c: number): { ex: number; ey: number } {
  if (p.round) return { ex: p.hw, ey: p.hw };
  const as = Math.abs(s);
  const ac = Math.abs(c);
  return { ex: p.hw * ac + p.hh * as, ey: p.hw * as + p.hh * ac };
}
