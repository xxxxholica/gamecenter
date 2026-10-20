// キャンバスで生成するテクスチャ類（外部アセット不要）
import * as THREE from 'three';

export function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** ひび割れ（透明） */
export function crackTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  const r = rand(3);
  g.strokeStyle = 'rgba(10,6,4,0.95)';
  g.lineCap = 'round';
  const crack = (x: number, y: number, ang: number, len: number, w: number) => {
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 6; i++) {
      ang += (r() - 0.5) * 1.1;
      x += Math.cos(ang) * len / 6;
      y += Math.sin(ang) * len / 6;
      g.lineTo(x, y);
      if (r() < 0.35 && w > 1.5) crack(x, y, ang + (r() - 0.5) * 2, len * 0.5, w * 0.6);
    }
    g.stroke();
  };
  for (let i = 0; i < 5; i++) crack(64, 64, (i / 5) * Math.PI * 2 + r(), 70, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 空のグラデーション */
export function skyTexture() {
  const [c, g] = canvas(256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#2d6fd0');
  grad.addColorStop(0.7, '#8fd0ff');
  grad.addColorStop(1, '#ffe6b0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  // 雲
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, s] of [[50, 70, 1], [180, 110, 0.8], [120, 40, 0.6]]) {
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(x + i * 12 * s, y + Math.sin(i * 2) * 5 * s, 14 * s, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ===========================================================
//  宝石・鉱石風テクスチャ
// ===========================================================
type Pt = [number, number];

function poly(g: CanvasRenderingContext2D, pts: Pt[], fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

/** 法線 (x,y,z) を法線マップの色に（キャンバス上方向 = +y） */
function nrm(x: number, y: number, z: number) {
  const l = Math.hypot(x, y, z) || 1;
  const c = (v: number) => Math.round((v / l * 0.5 + 0.5) * 255);
  return `rgb(${c(x)},${c(y)},${c(z)})`;
}

function grey(v: number, a = 1) {
  const c = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgba(${c},${c},${c},${a})`;
}

/**
 * カット面のある宝石（プリンセスカット風）を、岩の縁取りに埋め込んだ見た目。
 * map は白基調（インスタンスカラーで着色）、normalMap でカット面に本物の陰影をつける。
 */
export function gemTextures() {
  const S = 256;
  const [mc, m] = canvas(S);
  const [nc, n] = canvas(S);
  const r = rand(23);

  // ---- 岩の縁（原石っぽさ） ----
  m.fillStyle = grey(0.2);
  m.fillRect(0, 0, S, S);
  n.fillStyle = nrm(0, 0, 1);
  n.fillRect(0, 0, S, S);
  for (let i = 0; i < 420; i++) {
    const x = r() * S, y = r() * S, s = 3 + r() * 9;
    m.fillStyle = grey(0.1 + r() * 0.16);
    m.beginPath();
    m.arc(x, y, s, 0, Math.PI * 2);
    m.fill();
    n.fillStyle = nrm((r() - 0.5) * 1.2, (r() - 0.5) * 1.2, 1);
    n.beginPath();
    n.arc(x, y, s, 0, Math.PI * 2);
    n.fill();
  }

  // ---- 宝石本体 ----
  const lo = 22, hi = S - 22, c = S / 2, t = 46; // 外枠と中央テーブルの半径
  const O: Pt[] = [[lo, lo], [hi, lo], [hi, hi], [lo, hi]];
  const T: Pt[] = [[c - t, c - t], [c + t, c - t], [c + t, c + t], [c - t, c + t]];
  const M: Pt[] = [[c, lo], [hi, c], [c, hi], [lo, c]];
  // 各辺の外向き方向（キャンバス座標、y は下向き）
  const dirs: Pt[] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const tilt = 0.75;
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const [dx, dy] = dirs[i];
    // 辺の左右方向（角に向かう向き）
    const ox = O[i][0] - M[i][0], oy = O[i][1] - M[i][1];
    const ol = Math.hypot(ox, oy);
    const sx = ox / ol, sy = oy / ol;
    const faces: { pts: Pt[]; nx: number; ny: number; b: number }[] = [
      { pts: [O[i], M[i], T[i]], nx: dx + sx * 0.45, ny: dy + sy * 0.45, b: 0.5 + r() * 0.2 },
      { pts: [M[i], T[j], T[i]], nx: dx, ny: dy, b: 0.7 + r() * 0.2 },
      { pts: [M[i], O[j], T[j]], nx: dx - sx * 0.45, ny: dy - sy * 0.45, b: 0.5 + r() * 0.2 },
    ];
    for (const f of faces) {
      // キャンバスの y は下向きなので法線の y は反転
      poly(n, f.pts, nrm(f.nx * tilt, -f.ny * tilt, 1));
      poly(m, f.pts, grey(f.b));
    }
  }
  // テーブル面
  poly(n, T, nrm(0, 0, 1));
  const tg = m.createRadialGradient(c - 14, c - 14, 4, c, c, t * 1.4);
  tg.addColorStop(0, grey(1));
  tg.addColorStop(0.5, grey(0.9));
  tg.addColorStop(1, grey(0.72));
  poly(m, T, tg as unknown as string);

  // 内部のきらめき（インクルージョン）
  for (let i = 0; i < 26; i++) {
    const x = lo + 10 + r() * (hi - lo - 20), y = lo + 10 + r() * (hi - lo - 20);
    m.fillStyle = `rgba(255,255,255,${0.15 + r() * 0.35})`;
    m.beginPath();
    m.arc(x, y, 1 + r() * 2.2, 0, Math.PI * 2);
    m.fill();
  }

  // カットの稜線（明るい線）
  m.strokeStyle = 'rgba(255,255,255,0.4)';
  m.lineWidth = 2;
  m.beginPath();
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    m.moveTo(O[i][0], O[i][1]); m.lineTo(T[i][0], T[i][1]);
    m.moveTo(M[i][0], M[i][1]); m.lineTo(T[i][0], T[i][1]);
    m.moveTo(M[i][0], M[i][1]); m.lineTo(T[j][0], T[j][1]);
  }
  m.stroke();
  m.strokeStyle = 'rgba(255,255,255,0.8)';
  m.lineWidth = 2.5;
  m.strokeRect(c - t, c - t, t * 2, t * 2);
  // 外枠のふち（宝石と岩の境目）
  m.strokeStyle = grey(0.15, 0.9);
  m.lineWidth = 4;
  m.strokeRect(lo, lo, hi - lo, hi - lo);

  // 星形のハイライト
  const star = (x: number, y: number, s: number) => {
    m.fillStyle = 'rgba(255,255,255,0.95)';
    m.beginPath();
    m.moveTo(x, y - s); m.lineTo(x + s * 0.18, y - s * 0.18); m.lineTo(x + s, y);
    m.lineTo(x + s * 0.18, y + s * 0.18); m.lineTo(x, y + s); m.lineTo(x - s * 0.18, y + s * 0.18);
    m.lineTo(x - s, y); m.lineTo(x - s * 0.18, y - s * 0.18);
    m.closePath();
    m.fill();
  };
  star(c - t + 10, c - t + 10, 16);
  star(hi - 30, lo + 26, 7);

  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(nc);
  normalMap.anisotropy = 8;
  return { map, normalMap };
}

/** 硬い岩：金属の鉱脈が走るごつごつした塊（×印のひびで「硬い」と分かるように） */
export function oreRockTextures() {
  const S = 256;
  const [mc, m] = canvas(S);
  const [nc, n] = canvas(S);
  const [rc, rg] = canvas(S); // roughness（鉱脈だけつるつる）
  const r = rand(57);

  m.fillStyle = '#5d554e';
  m.fillRect(0, 0, S, S);
  n.fillStyle = nrm(0, 0, 1);
  n.fillRect(0, 0, S, S);
  rg.fillStyle = grey(0.95);
  rg.fillRect(0, 0, S, S);

  // ごつごつした岩肌
  for (let i = 0; i < 260; i++) {
    const x = r() * S, y = r() * S, s = 6 + r() * 22;
    const v = 0.25 + r() * 0.2;
    m.fillStyle = `rgb(${Math.round(v * 255 + 10)},${Math.round(v * 240)},${Math.round(v * 225)})`;
    m.beginPath();
    m.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    m.fill();
    n.fillStyle = nrm((r() - 0.5) * 1.4, (r() - 0.5) * 1.4, 1);
    n.beginPath();
    n.ellipse(x, y, s, s * (0.6 + r() * 0.4), r() * 3, 0, Math.PI * 2);
    n.fill();
  }

  // 金属の鉱脈
  const vein = (x: number, y: number, ang: number, len: number, w: number) => {
    const pts: Pt[] = [[x, y]];
    for (let i = 0; i < 8; i++) {
      ang += (r() - 0.5) * 0.9;
      x += Math.cos(ang) * len / 8;
      y += Math.sin(ang) * len / 8;
      pts.push([x, y]);
    }
    for (const [ctx, style, lw] of [
      [m, '#cfd6e0', w],
      [m, '#ffffff', w * 0.35],
      [rg, grey(0.15), w],
    ] as [CanvasRenderingContext2D, string, number][]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    }
  };
  for (let i = 0; i < 4; i++) vein(r() * S, r() * S, r() * 6, 90 + r() * 80, 3 + r() * 4);
  // 金属のつぶ
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, s = 2 + r() * 4;
    m.fillStyle = r() < 0.3 ? '#ffd76a' : '#e3e8ef';
    m.beginPath();
    m.arc(x, y, s, 0, Math.PI * 2);
    m.fill();
    rg.fillStyle = grey(0.1);
    rg.beginPath();
    rg.arc(x, y, s, 0, Math.PI * 2);
    rg.fill();
  }

  // ×印の深いひび
  for (const [a, b] of [[[60, 60], [196, 196]], [[196, 60], [60, 196]]] as [Pt, Pt][]) {
    m.strokeStyle = '#1c1714';
    m.lineWidth = 14;
    m.lineCap = 'round';
    m.beginPath();
    m.moveTo(a[0], a[1]);
    const steps = 6;
    for (let i = 1; i <= steps; i++) {
      const tt = i / steps;
      m.lineTo(a[0] + (b[0] - a[0]) * tt + (r() - 0.5) * 10, a[1] + (b[1] - a[1]) * tt + (r() - 0.5) * 10);
    }
    m.stroke();
    n.strokeStyle = nrm(0.6, 0.6, 1);
    n.lineWidth = 16;
    n.beginPath();
    n.moveTo(a[0], a[1]);
    n.lineTo(b[0], b[1]);
    n.stroke();
  }
  // 縁を暗く
  const eg = m.createRadialGradient(S / 2, S / 2, S * 0.3, S / 2, S / 2, S * 0.75);
  eg.addColorStop(0, 'rgba(0,0,0,0)');
  eg.addColorStop(1, 'rgba(0,0,0,0.55)');
  m.fillStyle = eg;
  m.fillRect(0, 0, S, S);

  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(nc);
  const roughnessMap = new THREE.CanvasTexture(rc);
  return { map, normalMap, roughnessMap };
}

/** 黒曜石ブロック（壊せない・落ちない）：漆黒のガラス質＋鋼の枠＋錠前マーク */
export function obsidianTextures() {
  const S = 256;
  const [mc, m] = canvas(S);
  const [nc, n] = canvas(S);
  const [rc, rg] = canvas(S);
  const r = rand(91);

  // 漆黒のガラス質（紫がかった光沢の筋）
  m.fillStyle = '#100c16';
  m.fillRect(0, 0, S, S);
  n.fillStyle = nrm(0, 0, 1);
  n.fillRect(0, 0, S, S);
  rg.fillStyle = grey(0.08);
  rg.fillRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) {
    const x = r() * S, y = r() * S, len = 60 + r() * 120, ang = -0.7 + (r() - 0.5) * 0.5;
    const grad = m.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    grad.addColorStop(0, 'rgba(120,80,200,0)');
    grad.addColorStop(0.5, `rgba(${140 + r() * 60},${90 + r() * 50},255,${0.12 + r() * 0.18})`);
    grad.addColorStop(1, 'rgba(120,80,200,0)');
    m.strokeStyle = grad;
    m.lineWidth = 4 + r() * 12;
    m.beginPath();
    m.moveTo(x, y);
    m.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    m.stroke();
  }
  // 貝殻状の割れ面（黒曜石らしい曲面の陰影）
  for (let i = 0; i < 18; i++) {
    const x = r() * S, y = r() * S, s = 18 + r() * 34;
    n.fillStyle = nrm((r() - 0.5) * 0.9, (r() - 0.5) * 0.9, 1);
    n.beginPath();
    n.ellipse(x, y, s, s * 0.7, r() * 3, 0, Math.PI * 2);
    n.fill();
  }

  // 鋼の枠
  const F = 22;
  const frame = (ctx: CanvasRenderingContext2D, style: string | CanvasGradient) => {
    ctx.fillStyle = style;
    ctx.fillRect(0, 0, S, F);
    ctx.fillRect(0, S - F, S, F);
    ctx.fillRect(0, 0, F, S);
    ctx.fillRect(S - F, 0, F, S);
  };
  const steel = m.createLinearGradient(0, 0, S, S);
  steel.addColorStop(0, '#9aa3b0');
  steel.addColorStop(0.5, '#4f5764');
  steel.addColorStop(1, '#2c313a');
  frame(m, steel);
  frame(rg, grey(0.3));
  // 枠のベベル（法線）
  poly(n, [[0, 0], [S, 0], [S - F, F], [F, F]], nrm(0, 0.8, 1));
  poly(n, [[S, 0], [S, S], [S - F, S - F], [S - F, F]], nrm(0.8, 0, 1));
  poly(n, [[S, S], [0, S], [F, S - F], [S - F, S - F]], nrm(0, -0.8, 1));
  poly(n, [[0, S], [0, 0], [F, F], [F, S - F]], nrm(-0.8, 0, 1));
  m.strokeStyle = '#2a2f38';
  m.lineWidth = 3;
  m.strokeRect(F, F, S - 2 * F, S - 2 * F);
  // リベット
  for (const [x, y] of [[F / 2, F / 2], [S - F / 2, F / 2], [F / 2, S - F / 2], [S - F / 2, S - F / 2], [S / 2, F / 2], [S / 2, S - F / 2], [F / 2, S / 2], [S - F / 2, S / 2]]) {
    const g = m.createRadialGradient(x - 2, y - 2, 1, x, y, 7);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, '#4a525e');
    m.fillStyle = g;
    m.beginPath();
    m.arc(x, y, 6, 0, Math.PI * 2);
    m.fill();
  }

  // 錠前マーク（壊せない印）
  const cx = S / 2, cy = S / 2 + 10;
  m.strokeStyle = '#c9d2de';
  m.lineWidth = 11;
  m.lineCap = 'round';
  m.beginPath();
  m.arc(cx, cy - 22, 22, Math.PI, 0);
  m.lineTo(cx + 22, cy - 6);
  m.moveTo(cx - 22, cy - 22);
  m.lineTo(cx - 22, cy - 6);
  m.stroke();
  const body = m.createLinearGradient(cx, cy - 10, cx, cy + 40);
  body.addColorStop(0, '#ffe58a');
  body.addColorStop(1, '#c88a10');
  m.fillStyle = body;
  m.beginPath();
  m.roundRect(cx - 36, cy - 10, 72, 54, 8);
  m.fill();
  m.fillStyle = '#3a2a08';
  m.beginPath();
  m.arc(cx, cy + 10, 7, 0, Math.PI * 2);
  m.fill();
  m.fillRect(cx - 3, cy + 12, 6, 16);
  rg.fillStyle = grey(0.25);
  rg.fillRect(cx - 40, cy - 50, 80, 100);
  n.fillStyle = nrm(0, 0.25, 1);
  n.beginPath();
  n.roundRect(cx - 36, cy - 10, 72, 18, 8);
  n.fill();

  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(nc);
  const roughnessMap = new THREE.CanvasTexture(rc);
  return { map, normalMap, roughnessMap };
}

/**
 * 爆弾ブロック：黒い鋼の箱に、オレンジと黒の注意縞の枠と、導火線に火がついた爆弾のマーク。
 * 注意縞と導火線の火花は emissiveMap にも描いて、暗い坑道でも光って目立つようにする。
 */
export function bombTextures() {
  const S = 256;
  const [mc, m] = canvas(S);
  const [nc, n] = canvas(S);
  const [rc, rg] = canvas(S);
  const [ec, e] = canvas(S);
  const r = rand(37);

  m.fillStyle = '#23262d';
  m.fillRect(0, 0, S, S);
  n.fillStyle = nrm(0, 0, 1);
  n.fillRect(0, 0, S, S);
  rg.fillStyle = grey(0.45);
  rg.fillRect(0, 0, S, S);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  // 鋼板のうっすらしたキズ
  for (let i = 0; i < 40; i++) {
    const x = r() * S, y = r() * S, len = 8 + r() * 30;
    m.strokeStyle = `rgba(255,255,255,${0.03 + r() * 0.05})`;
    m.lineWidth = 1;
    m.beginPath();
    m.moveTo(x, y);
    m.lineTo(x + len, y + (r() - 0.5) * 6);
    m.stroke();
  }

  // 注意縞の枠（オレンジ×黒）
  const F = 30;
  const ring = (ctx: CanvasRenderingContext2D, a: string, b: string) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.rect(F, F, S - 2 * F, S - 2 * F);
    ctx.clip('evenodd');
    ctx.fillStyle = b;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = a;
    for (let k = -S; k < S * 2; k += 44) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + 22, 0);
      ctx.lineTo(k + 22 - S, S);
      ctx.lineTo(k - S, S);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  };
  ring(m, '#ff8a1f', '#16181d');
  ring(e, '#ff6a10', '#000');
  m.strokeStyle = '#0b0c0f';
  m.lineWidth = 4;
  m.strokeRect(F, F, S - 2 * F, S - 2 * F);
  // 枠のベベル（法線）
  poly(n, [[0, 0], [S, 0], [S - F, F], [F, F]], nrm(0, 0.7, 1));
  poly(n, [[S, 0], [S, S], [S - F, S - F], [S - F, F]], nrm(0.7, 0, 1));
  poly(n, [[S, S], [0, S], [F, S - F], [S - F, S - F]], nrm(0, -0.7, 1));
  poly(n, [[0, S], [0, 0], [F, F], [F, S - F]], nrm(-0.7, 0, 1));

  // 爆弾のマーク
  const cx = S / 2 - 6, cy = S / 2 + 14, R = 58;
  const body = m.createRadialGradient(cx - 20, cy - 22, 6, cx, cy, R);
  body.addColorStop(0, '#6a717c');
  body.addColorStop(0.45, '#262a31');
  body.addColorStop(1, '#07080a');
  m.fillStyle = body;
  m.beginPath();
  m.arc(cx, cy, R, 0, Math.PI * 2);
  m.fill();
  m.strokeStyle = '#000';
  m.lineWidth = 4;
  m.stroke();
  // ハイライト
  m.fillStyle = 'rgba(255,255,255,0.55)';
  m.beginPath();
  m.ellipse(cx - 22, cy - 26, 14, 8, -0.7, 0, Math.PI * 2);
  m.fill();
  rg.fillStyle = grey(0.12);
  rg.beginPath();
  rg.arc(cx, cy, R, 0, Math.PI * 2);
  rg.fill();
  // 球の丸みを法線に
  const ng = n.createRadialGradient(cx, cy, 4, cx, cy, R);
  ng.addColorStop(0, nrm(0, 0, 1));
  ng.addColorStop(1, nrm(0, 0, 0.35));
  n.fillStyle = ng;
  n.beginPath();
  n.arc(cx, cy, R, 0, Math.PI * 2);
  n.fill();
  // 口金
  m.fillStyle = '#8b929c';
  m.beginPath();
  m.roundRect(cx + 26, cy - R - 6, 30, 22, 5);
  m.fill();
  m.strokeStyle = '#000';
  m.lineWidth = 3;
  m.stroke();
  // 導火線
  m.strokeStyle = '#e8d8a0';
  m.lineWidth = 7;
  m.lineCap = 'round';
  m.beginPath();
  m.moveTo(cx + 42, cy - R - 4);
  m.bezierCurveTo(cx + 44, cy - R - 28, cx + 66, cy - R - 26, cx + 72, cy - R - 46);
  m.stroke();
  // 火花（ここが光る）
  const sx = cx + 74, sy = cy - R - 50;
  for (const [ctx, c1, c2] of [[m, '#fff7b0', '#ff7a1a'], [e, '#ffffff', '#ff8a2a']] as const) {
    const g = ctx.createRadialGradient(sx, sy, 1, sx, sy, 20);
    g.addColorStop(0, c1);
    g.addColorStop(0.5, c2);
    g.addColorStop(1, 'rgba(255,90,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(sx, sy, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = c1;
    ctx.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.2;
      ctx.beginPath();
      ctx.moveTo(sx + Math.cos(a) * 10, sy + Math.sin(a) * 10);
      ctx.lineTo(sx + Math.cos(a) * (i % 2 ? 22 : 30), sy + Math.sin(a) * (i % 2 ? 22 : 30));
      ctx.stroke();
    }
  }
  // 球の中の「BOMB」マークをうっすら光らせる
  e.fillStyle = 'rgba(255,90,20,0.35)';
  e.beginPath();
  e.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
  e.fill();

  const map = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const emissiveMap = new THREE.CanvasTexture(ec);
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nc);
  const roughnessMap = new THREE.CanvasTexture(rc);
  return { map, normalMap, roughnessMap, emissiveMap };
}

/** 黄金郷の神殿：金のレンガと太陽の刻印 */
export function goldTempleTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rand(77);
  g.fillStyle = '#5a3c08';
  g.fillRect(0, 0, S, S);
  const bh = 32, bw = 64;
  for (let row = 0; row < S / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < S / bw + 1; col++) {
      const x = col * bw + off + 2, y = row * bh + 2;
      const grad = g.createLinearGradient(x, y, x + bw, y + bh);
      const v = r();
      grad.addColorStop(0, v < 0.3 ? '#fff1a8' : '#ffd95a');
      grad.addColorStop(0.5, '#e8a91e');
      grad.addColorStop(1, '#a86a08');
      g.fillStyle = grad;
      g.fillRect(x, y, bw - 4, bh - 4);
      // 刻印（ジグザグ・丸）
      g.strokeStyle = 'rgba(110,60,0,0.6)';
      g.lineWidth = 2;
      if (v < 0.25) {
        g.beginPath();
        g.arc(x + bw / 2 - 2, y + bh / 2 - 2, 8, 0, Math.PI * 2);
        g.stroke();
        g.beginPath();
        g.arc(x + bw / 2 - 2, y + bh / 2 - 2, 3, 0, Math.PI * 2);
        g.stroke();
      } else if (v < 0.5) {
        g.beginPath();
        for (let i = 0; i <= 6; i++) g.lineTo(x + 8 + i * 7.5, y + (i % 2 ? 8 : 20));
        g.stroke();
      }
    }
  }
  // きらめき
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(255,255,230,${0.4 + r() * 0.5})`;
    g.fillRect(r() * S, r() * S, 2, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 黄金の太陽の紋章 */
export function sunEmblemTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  g.clearRect(0, 0, S, S);
  const cx = S / 2;
  g.fillStyle = '#ffd23a';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const a1 = a - 0.12, a2 = a + 0.12;
    const r1 = 62, r2 = i % 2 ? 104 : 124;
    g.beginPath();
    g.moveTo(cx + Math.cos(a1) * r1, cx + Math.sin(a1) * r1);
    g.lineTo(cx + Math.cos(a) * r2, cx + Math.sin(a) * r2);
    g.lineTo(cx + Math.cos(a2) * r1, cx + Math.sin(a2) * r1);
    g.fill();
  }
  const grad = g.createRadialGradient(cx - 14, cx - 14, 6, cx, cx, 66);
  grad.addColorStop(0, '#fffbe0');
  grad.addColorStop(0.6, '#ffc21a');
  grad.addColorStop(1, '#b06a00');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cx, 64, 0, Math.PI * 2);
  g.fill();
  // 顔
  g.strokeStyle = '#8a4a00';
  g.lineWidth = 5;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(cx - 20, cx - 8, 9, Math.PI * 1.1, Math.PI * 1.9);
  g.moveTo(cx + 29, cx - 8);
  g.arc(cx + 20, cx - 8, 9, Math.PI * 1.1, Math.PI * 1.9);
  g.moveTo(cx - 22, cx + 18);
  g.quadraticCurveTo(cx, cx + 36, cx + 22, cx + 18);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ===========================================================
//  土の壁に埋め込まれた、白い目盛り板
// ===========================================================
/** 5mぶんの目盛り(0.5m刻み)。縦に並べて繰り返す。上端が5mの区切り */
export function rulerTileTexture() {
  const PX = 64; // 1mあたりのpx
  const [c, g] = canvas(64);
  c.width = 64;
  c.height = PX * 5;
  const grad = g.createLinearGradient(0, 0, 64, 0);
  grad.addColorStop(0, '#dcdcdc');
  grad.addColorStop(0.5, '#ffffff');
  grad.addColorStop(1, '#cfcfcf');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, c.height);
  g.strokeStyle = '#1c1c22';
  g.lineCap = 'butt';
  for (let i = 0; i < 10; i++) {
    const y = i * (PX / 2);
    const len = i === 0 ? 40 : i % 2 === 0 ? 26 : 14;
    g.lineWidth = i === 0 ? 5 : 3;
    // 区切りが上下の端にかかるので、0mの線は上端と下端の両方に描く
    for (const yy of i === 0 ? [1, c.height - 1] : [y]) {
      g.beginPath();
      g.moveTo(64, yy);
      g.lineTo(64 - len, yy);
      g.stroke();
    }
  }
  // 縁
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(0, 0, 3, c.height);
  g.fillRect(61, 0, 3, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 目盛り板に刻む数字(透明地に暗い文字) */
export function rulerNumberTexture(text: string, bold: boolean) {
  const [c, g] = canvas(128);
  c.height = 64;
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#1c1c22';
  g.font = `${bold ? '900 46px' : '700 34px'} "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Yu Gothic UI", "Meiryo", system-ui, sans-serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, 6, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ===========================================================
//  エリアごとの土・岩のテクスチャ(壁・奥の壁に使う。色は壁の色を乗せるので、ここは灰色基調)
// ===========================================================
/** 0:表土 1:赤土 2:岩盤 3:水晶洞 4:マグマ 5:黄金郷(神殿のレンガ) */
export function soilTexture(kind: number) {
  const S = 256;
  const [c, g] = canvas(S);
  const r = rand(100 + kind * 17);
  /** タイルの継ぎ目が出ないよう、端をまたぐ描画は上下左右に折り返して描く */
  const wrap = (fn: (ox: number, oy: number) => void) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  const grain = (n: number, a: number) => {
    for (let i = 0; i < n; i++) {
      const v = Math.floor(r() * 255);
      g.fillStyle = `rgba(${v},${v},${v},${a})`;
      g.fillRect(r() * S, r() * S, 2, 2);
    }
  };
  const blobs = (n: number, lo: number, hi: number, alpha: number, size: number) => {
    for (let i = 0; i < n; i++) {
      const v = lo + Math.floor(r() * (hi - lo));
      g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      const x = r() * S, y = r() * S, rr = 4 + r() * size;
      wrap((ox, oy) => {
        g.beginPath();
        g.ellipse(x + ox, y + oy, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, Math.PI * 2);
        g.fill();
      });
    }
  };
  /** ぎざぎざに折れ曲がるひび */
  const crack = (x: number, y: number, len: number, w: number, color: string, branch = true) => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    let a = r() * Math.PI * 2;
    wrap((ox, oy) => {
      let px = x + ox, py = y + oy;
      g.beginPath();
      g.moveTo(px, py);
      for (let s = 0; s < len; s++) {
        a += (r() - 0.5) * 1.1;
        px += Math.cos(a) * (5 + r() * 7);
        py += Math.sin(a) * (5 + r() * 7);
        g.lineTo(px, py);
      }
      g.stroke();
    });
    if (branch && w > 1) crack(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30, Math.floor(len / 2), w * 0.6, color, false);
  };

  g.fillStyle = kind === 3 ? '#6e6e78' : kind === 4 ? '#6a6a6a' : '#7a7a7a';
  g.fillRect(0, 0, S, S);

  switch (kind) {
    case 0: {
      // 表土: 粒の細かい土、小石、細い根
      blobs(60, 95, 150, 0.35, 14);
      grain(6000, 0.2);
      for (let i = 0; i < 26; i++) {
        const x = r() * S, y = r() * S, rr = 3 + r() * 5;
        wrap((ox, oy) => {
          g.fillStyle = 'rgba(40,40,40,0.55)';
          g.beginPath();
          g.ellipse(x + ox + 1.5, y + oy + 1.5, rr, rr * 0.75, 0.4, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = `rgba(${150 + r() * 70},${150 + r() * 70},${150 + r() * 70},0.9)`;
          g.beginPath();
          g.ellipse(x + ox, y + oy, rr, rr * 0.75, 0.4, 0, Math.PI * 2);
          g.fill();
        });
      }
      for (let i = 0; i < 5; i++) crack(r() * S, r() * S, 10, 2, 'rgba(30,30,30,0.5)');
      break;
    }
    case 1: {
      // 赤土: 粘土の横縞(地層)
      blobs(40, 100, 150, 0.3, 18);
      for (let y = 0; y < S; ) {
        const h = 10 + r() * 26;
        const v = r() < 0.5 ? 40 : 230;
        g.fillStyle = `rgba(${v},${v},${v},${0.1 + r() * 0.16})`;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.07 + y) * 2);
        for (let x = S; x >= 0; x -= 16) g.lineTo(x, y + h + Math.sin(x * 0.07 + y) * 2);
        g.closePath();
        g.fill();
        y += h;
      }
      grain(3500, 0.16);
      for (let i = 0; i < 14; i++) {
        const x = r() * S, y = r() * S, rr = 2 + r() * 4;
        g.fillStyle = 'rgba(235,235,235,0.7)';
        wrap((ox, oy) => g.fillRect(x + ox, y + oy, rr * 1.6, rr));
      }
      break;
    }
    case 2: {
      // 岩盤: 角ばった岩の面と、深いひび
      for (let i = 0; i < 46; i++) {
        const v = 70 + Math.floor(r() * 120);
        g.fillStyle = `rgba(${v},${v},${v},0.5)`;
        const x = r() * S, y = r() * S, rr = 14 + r() * 34;
        wrap((ox, oy) => {
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const aa = (k / 6) * Math.PI * 2 + r() * 0.5;
            const d = rr * (0.7 + r() * 0.5);
            const px = x + ox + Math.cos(aa) * d, py = y + oy + Math.sin(aa) * d;
            if (k === 0) g.moveTo(px, py);
            else g.lineTo(px, py);
          }
          g.closePath();
          g.fill();
        });
      }
      grain(2500, 0.14);
      for (let i = 0; i < 9; i++) crack(r() * S, r() * S, 12, 2.4, 'rgba(15,15,20,0.75)');
      break;
    }
    case 3: {
      // 水晶洞: 暗い岩に、小さな結晶のきらめき
      blobs(50, 80, 140, 0.35, 20);
      grain(2500, 0.14);
      for (let i = 0; i < 90; i++) {
        const x = r() * S, y = r() * S, s = 3 + r() * 9;
        const v = 190 + Math.floor(r() * 65);
        wrap((ox, oy) => {
          g.fillStyle = `rgba(${v},${v},255,${0.35 + r() * 0.4})`;
          g.beginPath();
          g.moveTo(x + ox, y + oy - s);
          g.lineTo(x + ox + s * 0.55, y + oy + s * 0.4);
          g.lineTo(x + ox - s * 0.55, y + oy + s * 0.4);
          g.closePath();
          g.fill();
        });
      }
      break;
    }
    case 4: {
      // マグマ層: 焼けた黒い岩と、割れ目の赤い光
      blobs(50, 60, 120, 0.4, 22);
      grain(2500, 0.12);
      for (let i = 0; i < 8; i++) crack(r() * S, r() * S, 14, 6, 'rgba(255,170,110,0.28)');
      for (let i = 0; i < 8; i++) crack(r() * S, r() * S, 14, 2.2, 'rgba(255,235,200,0.9)');
      break;
    }
    default: {
      // 黄金郷: 神殿のレンガ
      const bw = 64, bh = 32;
      for (let row = 0; row < S / bh; row++) {
        for (let col = 0; col < S / bw + 1; col++) {
          const x = col * bw + (row % 2 ? bw / 2 : 0) - (row % 2 ? bw : 0) + bw;
          const v = 120 + Math.floor(r() * 80);
          g.fillStyle = `rgb(${v},${v},${v})`;
          g.fillRect(x % S, row * bh, bw, bh);
          if (x % S + bw > S) g.fillRect(x % S - S, row * bh, bw, bh);
        }
      }
      g.strokeStyle = 'rgba(20,20,20,0.85)';
      g.lineWidth = 3;
      for (let row = 0; row <= S / bh; row++) {
        g.beginPath();
        g.moveTo(0, row * bh);
        g.lineTo(S, row * bh);
        g.stroke();
        const off = row % 2 ? bw / 2 : 0;
        for (let x = off; x <= S + bw; x += bw) {
          g.beginPath();
          g.moveTo(x, row * bh);
          g.lineTo(x, (row + 1) * bh);
          g.stroke();
        }
      }
      grain(3000, 0.14);
      break;
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 神殿の帯飾り：階段状の雷文（グレカ）と刻まれた金の帯 */
export function friezeTexture() {
  const S = 256;
  const [c, g] = canvas(S);
  const grad = g.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#fff0a0');
  grad.addColorStop(0.15, '#e9ad22');
  grad.addColorStop(0.85, '#b9770c');
  grad.addColorStop(1, '#6e4200');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  // 上下のふち
  g.fillStyle = 'rgba(80,40,0,0.55)';
  g.fillRect(0, 22, S, 6);
  g.fillRect(0, S - 28, S, 6);
  // 雷文（階段状のうず）
  g.strokeStyle = '#6a3a00';
  g.lineWidth = 9;
  g.lineJoin = 'miter';
  const u = 32;
  for (let k = 0; k < 2; k++) {
    const x = k * 128 + 14;
    const y = 52;
    g.beginPath();
    g.moveTo(x, y + 5 * u - 8);
    g.lineTo(x, y);
    g.lineTo(x + 3 * u, y);
    g.lineTo(x + 3 * u, y + 3 * u);
    g.lineTo(x + u, y + 3 * u);
    g.lineTo(x + u, y + u);
    g.lineTo(x + 2 * u, y + u);
    g.lineTo(x + 2 * u, y + 2 * u);
    g.moveTo(x, y + 5 * u - 8);
    g.lineTo(x + 4 * u - 8, y + 5 * u - 8);
    g.stroke();
  }
  // 明るい縁取りで浮き彫りに見せる
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = 'rgba(255,240,170,0.35)';
  g.lineWidth = 2;
  g.strokeRect(2, 2, S - 4, S - 4);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 中心が明るく外へ消えていく丸い光（加算合成用） */
export function glowTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}

/** 上から差しこむ光の筋（上が明るく、下と左右が消える） */
export function rayTexture() {
  const S = 128;
  const [c, g] = canvas(S);
  const v = g.createLinearGradient(0, 0, 0, S);
  v.addColorStop(0, 'rgba(255,255,255,0.0)');
  v.addColorStop(0.25, 'rgba(255,255,255,0.9)');
  v.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = v;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-in';
  const h = g.createLinearGradient(0, 0, S, 0);
  h.addColorStop(0, 'rgba(0,0,0,0)');
  h.addColorStop(0.5, 'rgba(0,0,0,1)');
  h.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = h;
  g.fillRect(0, 0, S, S);
  return new THREE.CanvasTexture(c);
}
