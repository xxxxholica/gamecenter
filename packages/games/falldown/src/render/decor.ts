// エリア固有の飾り(化石・水晶・溶岩など)。壁と奥の壁に、決まった乱数で埋め込む。画像素材は使わず Canvas で描く
import * as THREE from 'three';
import { canvas } from './textures.ts';
import { hash } from './hash.ts';

const N = 128;

type Draw = (g: CanvasRenderingContext2D) => void;

interface Kind {
  id: string;
  /** 出るエリア(深さ m)。from 以上 to 未満 */
  from: number;
  to: number;
  draw: Draw;
  /** 画面での大きさ(m)。幅 × 高さ */
  w: number;
  h: number;
  /** 光るもの(水晶・溶岩・金)。ブルームで滲む */
  glow?: number;
  /** 1行・1か所あたりの出やすさ */
  chance: number;
}

function outline(g: CanvasRenderingContext2D, fill: string, line = 'rgba(0,0,0,0.65)', lw = 3) {
  g.fillStyle = fill;
  g.strokeStyle = line;
  g.lineWidth = lw;
  g.lineJoin = 'round';
  g.fill();
  g.stroke();
}

// ---------------- 表土層 ----------------
const drawRoot: Draw = (g) => {
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    if (depth > 4 || len < 6) return;
    const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
    g.strokeStyle = '#2f1c0e';
    g.lineWidth = w + 2;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo((x + x2) / 2 + 6, (y + y2) / 2, x2, y2);
    g.stroke();
    g.strokeStyle = '#7a5530';
    g.lineWidth = w;
    g.stroke();
    branch(x2, y2, a + 0.5, len * 0.7, w * 0.7, depth + 1);
    branch(x2, y2, a - 0.55, len * 0.66, w * 0.65, depth + 1);
  };
  branch(64, 6, Math.PI / 2, 38, 9, 0);
};

const drawWorm: Draw = (g) => {
  g.lineCap = 'round';
  g.beginPath();
  for (let x = 14; x <= 114; x += 4) {
    const y = 64 + Math.sin(x * 0.11) * 22;
    if (x === 14) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.strokeStyle = '#5a2a22';
  g.lineWidth = 17;
  g.stroke();
  g.strokeStyle = '#d98f84';
  g.lineWidth = 12;
  g.stroke();
  g.strokeStyle = 'rgba(120,50,45,0.6)';
  g.lineWidth = 2;
  for (let x = 24; x <= 106; x += 10) {
    const y = 64 + Math.sin(x * 0.11) * 22;
    g.beginPath();
    g.moveTo(x, y - 6);
    g.lineTo(x, y + 6);
    g.stroke();
  }
};

const drawAcorn: Draw = (g) => {
  g.beginPath();
  g.ellipse(64, 74, 26, 34, 0, 0, Math.PI * 2);
  outline(g, '#b27a34');
  g.fillStyle = 'rgba(255,230,160,0.35)';
  g.beginPath();
  g.ellipse(55, 66, 7, 16, 0.2, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.ellipse(64, 46, 31, 20, 0, Math.PI, 0);
  g.closePath();
  outline(g, '#5e3a14');
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 2;
  for (let x = 40; x <= 88; x += 12) {
    g.beginPath();
    g.moveTo(x, 36);
    g.lineTo(x + 6, 46);
    g.stroke();
  }
  g.fillStyle = '#3a220c';
  g.fillRect(61, 18, 6, 14);
};

// ---------------- 赤土層 ----------------
const drawAmmonite: Draw = (g) => {
  const pts: [number, number][] = [];
  for (let t = 0; t < Math.PI * 6; t += 0.12) {
    const r = 3 + t * 3.1;
    pts.push([64 + Math.cos(t) * r, 64 + Math.sin(t) * r]);
  }
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.strokeStyle = 'rgba(0,0,0,0.7)';
  g.lineWidth = 16;
  g.stroke();
  g.strokeStyle = '#dccba0';
  g.lineWidth = 11;
  g.stroke();
  g.strokeStyle = 'rgba(120,95,50,0.7)';
  g.lineWidth = 2;
  for (let i = 8; i < pts.length; i += 3) {
    const [x, y] = pts[i];
    const [x0, y0] = pts[i - 1];
    const a = Math.atan2(y - y0, x - x0) + Math.PI / 2;
    g.beginPath();
    g.moveTo(x - Math.cos(a) * 5, y - Math.sin(a) * 5);
    g.lineTo(x + Math.cos(a) * 5, y + Math.sin(a) * 5);
    g.stroke();
  }
};

const drawTrilobite: Draw = (g) => {
  g.beginPath();
  g.ellipse(64, 40, 24, 16, 0, Math.PI, 0);
  g.closePath();
  outline(g, '#cdbd96');
  for (let i = 0; i < 6; i++) {
    const w = 24 - i * 2.2;
    g.beginPath();
    g.ellipse(64, 46 + i * 11, w, 7, 0, 0, Math.PI * 2);
    outline(g, i % 2 ? '#c2b28c' : '#d4c59f', 'rgba(0,0,0,0.55)', 2);
  }
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath();
  g.ellipse(54, 36, 3.5, 5, 0, 0, Math.PI * 2);
  g.ellipse(74, 36, 3.5, 5, 0, 0, Math.PI * 2);
  g.fill();
};

const drawBone: Draw = (g) => {
  const bone = (cx: number, cy: number, len: number, a: number, th: number) => {
    g.save();
    g.translate(cx, cy);
    g.rotate(a);
    g.beginPath();
    g.rect(-len / 2, -th / 2, len, th);
    for (const sx of [-1, 1]) {
      g.moveTo(sx * len / 2 + th * 0.7, -th * 0.55);
      g.arc(sx * len / 2, -th * 0.55, th * 0.75, 0, Math.PI * 2);
      g.moveTo(sx * len / 2 + th * 0.7, th * 0.55);
      g.arc(sx * len / 2, th * 0.55, th * 0.75, 0, Math.PI * 2);
    }
    outline(g, '#e6dcc0');
    g.restore();
  };
  bone(64, 70, 76, -0.5, 13);
  bone(58, 48, 54, 0.25, 9);
};

// ---------------- 岩盤層 ----------------
const drawFish: Draw = (g) => {
  g.strokeStyle = 'rgba(0,0,0,0.6)';
  g.lineWidth = 8;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(34, 64);
  g.lineTo(92, 64);
  g.stroke();
  g.strokeStyle = '#d6cdb4';
  g.lineWidth = 4;
  g.stroke();
  for (let x = 40; x <= 86; x += 7) {
    const h = 20 - Math.abs(x - 62) * 0.4;
    g.beginPath();
    g.moveTo(x, 64 - h);
    g.lineTo(x, 64 + h);
    g.stroke();
  }
  g.beginPath();
  g.moveTo(92, 64);
  g.lineTo(116, 42);
  g.lineTo(116, 86);
  g.closePath();
  outline(g, '#cfc5a8', 'rgba(0,0,0,0.6)', 2);
  g.beginPath();
  g.ellipse(26, 64, 15, 18, 0, 0, Math.PI * 2);
  outline(g, '#d6cdb4');
  g.fillStyle = 'rgba(0,0,0,0.7)';
  g.beginPath();
  g.arc(22, 60, 3.4, 0, Math.PI * 2);
  g.fill();
};

const drawOre: Draw = (g) => {
  const gem = (cx: number, cy: number, r: number, base: string, hi: string) => {
    const pts: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const d = r * (0.8 + ((k * 7) % 5) * 0.08);
      pts.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d]);
    }
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    outline(g, base);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    g.lineTo(pts[1][0], pts[1][1]);
    g.lineTo(cx, cy);
    g.closePath();
    g.fillStyle = hi;
    g.fill();
  };
  gem(44, 78, 24, '#2c2e38', '#6c7388');
  gem(80, 62, 20, '#3a2e2a', '#8c6a52');
  gem(66, 92, 14, '#2c2e38', '#9aa6c4');
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const [x, y] of [[36, 68], [74, 54], [62, 88]]) g.fillRect(x, y, 4, 4);
};

const drawRuin: Draw = (g) => {
  g.beginPath();
  g.rect(22, 24, 84, 80);
  outline(g, '#8c867a', 'rgba(0,0,0,0.7)', 4);
  g.strokeStyle = 'rgba(30,26,20,0.85)';
  g.lineWidth = 4;
  g.lineCap = 'square';
  // 渦と階段状の文様
  g.beginPath();
  g.moveTo(36, 50);
  g.lineTo(50, 50);
  g.lineTo(50, 38);
  g.lineTo(64, 38);
  g.lineTo(64, 50);
  g.lineTo(78, 50);
  g.lineTo(78, 38);
  g.lineTo(92, 38);
  g.stroke();
  g.beginPath();
  g.arc(64, 78, 14, 0, Math.PI * 1.7);
  g.arc(64, 78, 6, 0, Math.PI * 1.7);
  g.stroke();
};

// ---------------- 水晶洞 ----------------
const drawCrystal: Draw = (g) => {
  const prism = (x: number, base: number, w: number, h: number, tilt: number, c1: string, c2: string) => {
    g.save();
    g.translate(x, base);
    g.rotate(tilt);
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.lineTo(-w / 2, -h * 0.75);
    g.lineTo(0, -h);
    g.lineTo(w / 2, -h * 0.75);
    g.lineTo(w / 2, 0);
    g.closePath();
    outline(g, c1, 'rgba(20,10,60,0.7)', 2);
    g.beginPath();
    g.moveTo(0, -h);
    g.lineTo(-w / 2, -h * 0.75);
    g.lineTo(-w / 2, 0);
    g.lineTo(-w * 0.1, 0);
    g.lineTo(-w * 0.1, -h * 0.8);
    g.closePath();
    g.fillStyle = c2;
    g.fill();
    g.restore();
  };
  prism(40, 112, 24, 70, -0.3, '#8f6cff', '#d9ccff');
  prism(86, 112, 26, 78, 0.28, '#6ee8ff', '#d4faff');
  prism(64, 114, 30, 96, 0, '#a98bff', '#f0e8ff');
  prism(104, 112, 16, 40, 0.6, '#6ee8ff', '#d4faff');
};

const drawMushroom: Draw = (g) => {
  const shroom = (x: number, y: number, s: number) => {
    g.fillStyle = '#b8fff0';
    g.fillRect(x - 5 * s, y, 10 * s, 28 * s);
    g.beginPath();
    g.ellipse(x, y, 26 * s, 22 * s, 0, Math.PI, 0);
    g.closePath();
    outline(g, '#34f0c0', 'rgba(0,60,50,0.7)', 2);
    g.fillStyle = 'rgba(220,255,250,0.9)';
    for (const [dx, dy] of [[-12, -8], [4, -14], [14, -5]]) {
      g.beginPath();
      g.arc(x + dx * s, y + dy * s, 3.4 * s, 0, Math.PI * 2);
      g.fill();
    }
  };
  shroom(46, 70, 1.15);
  shroom(88, 88, 0.8);
};

const drawBat: Draw = (g) => {
  g.fillStyle = '#17121f';
  g.strokeStyle = 'rgba(160,140,220,0.6)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 52);
  g.quadraticCurveTo(44, 30, 10, 42);
  g.quadraticCurveTo(24, 54, 22, 70);
  g.quadraticCurveTo(36, 62, 44, 78);
  g.quadraticCurveTo(54, 68, 64, 82);
  g.quadraticCurveTo(74, 68, 84, 78);
  g.quadraticCurveTo(92, 62, 106, 70);
  g.quadraticCurveTo(104, 54, 118, 42);
  g.quadraticCurveTo(84, 30, 64, 52);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(54, 52);
  g.lineTo(52, 38);
  g.lineTo(62, 46);
  g.lineTo(66, 46);
  g.lineTo(76, 38);
  g.lineTo(74, 52);
  g.closePath();
  g.fill();
  g.fillStyle = '#ff9bd0';
  g.fillRect(58, 54, 3, 3);
  g.fillRect(67, 54, 3, 3);
};

// ---------------- マグマ層 ----------------
const drawLavaCrack: Draw = (g) => {
  const line = (pts: [number, number][], w: number, color: string) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  };
  const main: [number, number][] = [[64, 6], [52, 30], [70, 50], [48, 78], [66, 104], [58, 124]];
  const side: [number, number][] = [[70, 50], [96, 62], [108, 88]];
  const side2: [number, number][] = [[48, 78], [24, 90], [14, 110]];
  for (const p of [main, side, side2]) line(p, 11, 'rgba(255,90,20,0.45)');
  for (const p of [main, side, side2]) line(p, 6, '#ff7a1a');
  for (const p of [main, side, side2]) line(p, 2.4, '#fff0b0');
};

const drawLavaBubble: Draw = (g) => {
  for (const [x, y, r] of [[40, 80, 22], [84, 66, 16], [66, 100, 12], [96, 98, 9]] as const) {
    const grad = g.createRadialGradient(x, y, 1, x, y, r);
    grad.addColorStop(0, '#fff2b0');
    grad.addColorStop(0.45, '#ffb030');
    grad.addColorStop(1, '#e8440c');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(80,10,0,0.7)';
    g.lineWidth = 2;
    g.stroke();
  }
};

const drawSkull: Draw = (g) => {
  g.beginPath();
  g.ellipse(64, 52, 32, 30, 0, 0, Math.PI * 2);
  g.rect(48, 64, 32, 28);
  outline(g, '#8a7e72', 'rgba(0,0,0,0.75)', 3);
  g.fillStyle = '#16100c';
  for (const x of [50, 78]) {
    g.beginPath();
    g.ellipse(x, 54, 8, 10, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.beginPath();
  g.moveTo(64, 66);
  g.lineTo(59, 76);
  g.lineTo(69, 76);
  g.closePath();
  g.fill();
  g.strokeStyle = '#16100c';
  g.lineWidth = 2;
  for (let x = 52; x <= 76; x += 6) {
    g.beginPath();
    g.moveTo(x, 82);
    g.lineTo(x, 92);
    g.stroke();
  }
  g.strokeStyle = 'rgba(255,120,40,0.7)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(64, 24);
  g.lineTo(60, 36);
  g.lineTo(68, 42);
  g.stroke();
};

// ---------------- 黄金郷の入口 ----------------
const drawCoins: Draw = (g) => {
  const coin = (x: number, y: number, r: number) => {
    g.beginPath();
    g.ellipse(x, y, r, r * 0.9, 0, 0, Math.PI * 2);
    outline(g, '#ffd23a', 'rgba(110,60,0,0.85)', 3);
    g.strokeStyle = '#c88a00';
    g.lineWidth = 2.5;
    g.beginPath();
    g.ellipse(x, y, r * 0.62, r * 0.55, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#fff3a8';
    g.beginPath();
    g.ellipse(x - r * 0.3, y - r * 0.3, r * 0.2, r * 0.12, -0.6, 0, Math.PI * 2);
    g.fill();
  };
  coin(38, 92, 22);
  coin(80, 96, 20);
  coin(60, 66, 21);
  coin(100, 70, 14);
};

const drawIdol: Draw = (g) => {
  g.fillStyle = '#ffd23a';
  g.strokeStyle = 'rgba(110,60,0,0.85)';
  g.lineWidth = 3;
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(40, 112);
  g.lineTo(46, 62);
  g.lineTo(82, 62);
  g.lineTo(88, 112);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(46, 66);
  g.lineTo(26, 90);
  g.lineTo(34, 96);
  g.lineTo(52, 78);
  g.closePath();
  g.moveTo(82, 66);
  g.lineTo(102, 90);
  g.lineTo(94, 96);
  g.lineTo(76, 78);
  g.closePath();
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(64, 42, 20, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.beginPath();
  g.moveTo(44, 30);
  g.lineTo(54, 10);
  g.lineTo(64, 24);
  g.lineTo(74, 10);
  g.lineTo(84, 30);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = '#6a3a00';
  g.fillRect(54, 40, 6, 5);
  g.fillRect(68, 40, 6, 5);
  g.fillStyle = '#e0a020';
  g.fillRect(52, 80, 24, 6);
};

const drawChest: Draw = (g) => {
  g.beginPath();
  g.rect(22, 58, 84, 50);
  outline(g, '#8a5226', 'rgba(0,0,0,0.75)', 3);
  g.beginPath();
  g.moveTo(22, 58);
  g.quadraticCurveTo(64, 14, 106, 58);
  g.closePath();
  outline(g, '#a0602c', 'rgba(0,0,0,0.75)', 3);
  g.fillStyle = '#ffd23a';
  g.fillRect(22, 56, 84, 8);
  g.fillRect(40, 40, 8, 68);
  g.fillRect(80, 40, 8, 68);
  g.beginPath();
  g.rect(58, 60, 12, 16);
  outline(g, '#ffe27a', 'rgba(110,60,0,0.9)', 2);
  g.fillStyle = '#4a2a00';
  g.fillRect(63, 66, 3, 6);
};

const KINDS: Kind[] = [
  // 表土層
  { id: 'root', from: 0, to: 100, draw: drawRoot, w: 1.7, h: 1.7, chance: 0.1 },
  { id: 'worm', from: 0, to: 100, draw: drawWorm, w: 1.6, h: 1.6, chance: 0.07 },
  { id: 'acorn', from: 0, to: 100, draw: drawAcorn, w: 1.1, h: 1.1, chance: 0.05 },
  // 赤土層
  { id: 'ammonite', from: 100, to: 200, draw: drawAmmonite, w: 1.7, h: 1.7, chance: 0.08 },
  { id: 'trilobite', from: 100, to: 200, draw: drawTrilobite, w: 1.5, h: 1.5, chance: 0.07 },
  { id: 'bone', from: 100, to: 200, draw: drawBone, w: 2.2, h: 2.2, chance: 0.08 },
  // 岩盤層
  { id: 'fish', from: 200, to: 300, draw: drawFish, w: 2.1, h: 2.1, chance: 0.07 },
  { id: 'ore', from: 200, to: 300, draw: drawOre, w: 1.6, h: 1.6, chance: 0.09 },
  { id: 'ruin', from: 200, to: 300, draw: drawRuin, w: 1.8, h: 1.8, chance: 0.06 },
  // 水晶洞
  { id: 'crystal', from: 300, to: 400, draw: drawCrystal, w: 1.9, h: 1.9, glow: 1.4, chance: 0.1 },
  { id: 'mushroom', from: 300, to: 400, draw: drawMushroom, w: 1.6, h: 1.6, glow: 1.2, chance: 0.07 },
  { id: 'bat', from: 300, to: 400, draw: drawBat, w: 1.7, h: 1.7, chance: 0.05 },
  // マグマ層
  { id: 'lavaCrack', from: 400, to: 480, draw: drawLavaCrack, w: 1.9, h: 1.9, glow: 1.6, chance: 0.1 },
  { id: 'lavaBubble', from: 400, to: 480, draw: drawLavaBubble, w: 1.5, h: 1.5, glow: 1.4, chance: 0.07 },
  { id: 'skull', from: 400, to: 480, draw: drawSkull, w: 1.4, h: 1.4, chance: 0.05 },
  // 黄金郷の入口
  { id: 'coins', from: 480, to: 1000, draw: drawCoins, w: 1.6, h: 1.6, glow: 0.9, chance: 0.1 },
  { id: 'idol', from: 480, to: 1000, draw: drawIdol, w: 1.7, h: 1.7, glow: 0.7, chance: 0.06 },
  { id: 'chest', from: 480, to: 1000, draw: drawChest, w: 1.6, h: 1.6, chance: 0.05 },
];

const CAP = 40;

interface Layer {
  kind: Kind;
  mesh: THREE.InstancedMesh;
}

/** 壁(左右)と奥の壁に、エリアごとの飾りを置く */
export class Decor {
  private layers: Layer[] = [];
  /** 描き終えたテクスチャ(事前に GPU へ転送しておくため、外から見えるようにする) */
  readonly textures: THREE.Texture[] = [];
  /** 前回並べた行の範囲(同じなら、並べ直さない) */
  private lastRange = '';
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private c = new THREE.Color();

  /**
   * @param sideX 壁の飾りを置くxの範囲(プレイ領域の外側)。[内側の端, 外側の端]
   * @param backHalf 奥の壁に置くxの範囲(±)
   * @param avoid 壁の上で避ける範囲 [x, 半幅](目盛り板)
   */
  constructor(
    private scene: THREE.Scene,
    private sideX: [number, number],
    private backHalf: number,
    private avoid: [number, number],
    private wallZ: number,
    private backZ: number,
  ) {
    const geo = new THREE.PlaneGeometry(1, 1);
    for (const kind of KINDS) {
      const [cv, g] = canvas(N);
      kind.draw(g);
      const tex = new THREE.CanvasTexture(cv);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textures.push(tex);
      const glow = kind.glow ?? 0;
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        transparent: true,
        alphaTest: 0.04,
        depthWrite: false,
        roughness: 0.9,
        metalness: 0,
        emissive: glow ? 0xffffff : 0x000000,
        emissiveMap: glow ? tex : null,
        emissiveIntensity: glow,
        fog: !glow,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, CAP);
      mesh.setColorAt(0, new THREE.Color());
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      this.layers.push({ kind, mesh });
    }
  }

  /** 画面に見える行 [minY, maxY] の分を並べ直す */
  update(minY: number, maxY: number) {
    const y0 = Math.floor(minY) - 2;
    const y1 = Math.ceil(maxY) + 2;
    // 置く場所は行ごとに決まっているので、見える行の範囲が変わらないかぎり、前回のままでよい
    const range = `${y0}|${y1}`;
    if (range === this.lastRange) return;
    this.lastRange = range;
    this.layers.forEach(({ kind, mesh }, ki) => {
      let n = 0;
      for (let y = y0; y <= y1 && n < CAP; y++) {
        const d = 1 - y;
        if (d < kind.from || d >= kind.to) continue;
        // 0:左の壁 1:右の壁 2:奥の壁
        for (let slot = 0; slot < 3 && n < CAP; slot++) {
          if (hash(y + ki * 0.37, slot * 17 + ki * 3.1) >= kind.chance * (slot === 2 ? 0.8 : 1)) continue;
          const h1 = hash(y * 1.7 + ki, slot + 5.3);
          const h2 = hash(y * 2.9 + ki * 1.3, slot + 9.1);
          const h3 = hash(y * 4.1 + ki * 2.1, slot + 1.7);
          let x: number;
          let z: number;
          let dim = 1;
          if (slot === 2) {
            x = (h1 - 0.5) * 2 * this.backHalf;
            z = this.backZ;
            dim = 0.55;
          } else {
            const side = slot === 0 ? -1 : 1;
            x = side * (this.sideX[0] + h1 * (this.sideX[1] - this.sideX[0]));
            if (Math.abs(x - this.avoid[0]) < this.avoid[1] + kind.w * 0.5) continue;
            z = this.wallZ;
          }
          const scale = 0.85 + h2 * 0.4;
          this.e.set(0, 0, (h3 - 0.5) * 0.9);
          this.q.setFromEuler(this.e);
          this.v.set(x, y + h2 - 0.5, z);
          this.s.set(kind.w * scale, kind.h * scale, 1);
          this.m.compose(this.v, this.q, this.s);
          mesh.setMatrixAt(n, this.m);
          this.c.setScalar(dim);
          mesh.setColorAt(n, this.c);
          n++;
        }
      }
      mesh.count = n;
      mesh.visible = n > 0; // 1つも出ない種類は、描画の呼び出しごと省く
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    });
  }
}
