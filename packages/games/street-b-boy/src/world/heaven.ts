// FINAL STAGE の「天国のような輝かしい空間」: 空のグラデーション・雲海・光の筋・大理石の柱・金色の光の輪。
// ステージの足場やギミックはそのままに、背景と空気だけを差し替える。
import * as THREE from 'three';

/** 画面全体の背景になる空。上は澄んだ青、地平は眩しい白金色で、中央上に太陽の光が差す */
export function createHeavenSkyTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5aa6f2');
  sky.addColorStop(0.35, '#9fcdfa');
  sky.addColorStop(0.68, '#ffe9c0');
  sky.addColorStop(1, '#fff6dc');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 太陽の光(中央の少し上から放射する光)
  const sun = ctx.createRadialGradient(W * 0.5, H * 0.34, 0, W * 0.5, H * 0.34, W * 0.62);
  sun.addColorStop(0, 'rgba(255,255,255,0.95)');
  sun.addColorStop(0.18, 'rgba(255,244,200,0.7)');
  sun.addColorStop(0.5, 'rgba(255,225,160,0.25)');
  sun.addColorStop(1, 'rgba(255,225,160,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, W, H);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** ふわっとした雲のひとかたまり(白い丸をいくつか重ねて、縁をぼかす) */
function createCloudTexture(): THREE.CanvasTexture {
  const W = 256, H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const puffs: [number, number, number][] = [
    [0.28, 0.62, 0.26], [0.45, 0.45, 0.32], [0.62, 0.55, 0.3], [0.78, 0.65, 0.22], [0.5, 0.7, 0.34],
  ];
  for (const [px, py, pr] of puffs) {
    const g = ctx.createRadialGradient(px * W, py * H, 0, px * W, py * H, pr * H * 1.6);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.55, 'rgba(255,252,240,0.55)');
    g.addColorStop(1, 'rgba(255,250,235,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 空から斜めに差す光の筋(上が明るく、下へ薄れ、左右の縁もぼかす) */
function createRayTexture(): THREE.CanvasTexture {
  const W = 64, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    const fade = Math.pow(1 - y / (H - 1), 0.8);
    for (let x = 0; x < W; x++) {
      const edge = Math.sin((x / (W - 1)) * Math.PI);
      const a = Math.round(255 * fade * edge * edge);
      const i = (y * W + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 244;
      img.data[i + 2] = 205;
      img.data[i + 3] = a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface HeavenBackdrop {
  /** ゆっくり回す金色の光の輪 */
  halos: THREE.Mesh[];
}

/**
 * 天国の背景を group に組み立てる。levelEndX までの全長に、雲海・光の筋・大理石の柱・光の輪を置く。
 * 配置は固定の疑似乱数で決めるので、毎回同じ景色になる。
 */
export function buildHeavenBackdrop(group: THREE.Group, levelEndX: number): HeavenBackdrop {
  let seed = 20260711;
  const rand = (): number => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const between = (a: number, b: number): number => a + (b - a) * rand();

  // 1. 雲: 空に浮かぶ雲と、足場の下に広がる雲海(穴の底が真っ暗にならず、雲の上を駆けている感じにする)
  const cloudTex = createCloudTexture();
  const makeCloud = (x: number, y: number, z: number, w: number, h: number, opacity: number): void => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, opacity }));
    sprite.position.set(x, y, z);
    sprite.scale.set(w, h, 1);
    group.add(sprite);
  };
  for (let i = 0; i < 70; i++) makeCloud(between(-30, levelEndX + 30), between(6, 30), between(-48, -16), between(18, 40), between(8, 16), between(0.5, 0.9));
  for (let i = 0; i < 46; i++) makeCloud(between(-30, levelEndX + 30), between(-9, -3), between(-30, -6), between(20, 44), between(8, 16), between(0.75, 1));

  // 2. 光の筋(加算合成で、雲の向こうから斜めに差し込む)
  const rayTex = createRayTexture();
  for (let x = -20; x < levelEndX + 30; x += 22) {
    const mat = new THREE.MeshBasicMaterial({
      map: rayTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: between(0.18, 0.32), side: THREE.DoubleSide,
    });
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(between(5, 9), 70), mat);
    ray.position.set(x + between(-4, 4), 14, -22);
    ray.rotation.z = between(-0.42, -0.2);
    group.add(ray);
  }

  // 3. 大理石の柱(上に金の柱頭)。ところどころ折れた柱も混ぜる
  const marble = new THREE.MeshStandardMaterial({ color: 0xfaf5ea, roughness: 0.35, metalness: 0.05, emissive: 0x6a6048, emissiveIntensity: 0.6 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd45a, roughness: 0.25, metalness: 0.9, emissive: 0x6a4a10, emissiveIntensity: 0.5 });
  for (let x = -10; x < levelEndX + 20; x += 16) {
    const px = x + between(-3, 3);
    const z = between(-14, -8);
    const broken = rand() < 0.3;
    const h = broken ? between(5, 9) : between(14, 22);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.0, h, 18), marble);
    column.position.set(px, h / 2 - 4, z);
    group.add(column);
    const base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 2.6), marble);
    base.position.set(px, -3.7, z);
    group.add(base);
    if (!broken) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.7, 2.8), gold);
      cap.position.set(px, h - 4 + 0.35, z);
      group.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 24), gold);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(px, h - 4 - 0.4, z);
      group.add(ring);
    }
  }

  // 4. 金色の光の輪(天使の輪)。空に浮かんでゆっくり回る
  const halos: THREE.Mesh[] = [];
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
  for (let x = 6; x < levelEndX + 20; x += 34) {
    const r = between(2.4, 4.2);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 10, 40), haloMat);
    halo.position.set(x + between(-6, 6), between(10, 20), between(-20, -12));
    halo.rotation.x = between(0.9, 1.3);
    group.add(halo);
    halos.push(halo);
  }

  return { halos };
}

/**
 * 天国の空から、1面の夜の街の空へ、k(0〜1)で移り変わる背景。
 * ファイナルの縦穴を落ちて、1面の舞台(地上)へ戻ってくる演出に使う。setBlend は k が変わったときだけ描き直す。
 */
export function createReturnSky(night: number): { texture: THREE.CanvasTexture; setBlend: (k: number) => void } {
  const W = 256, H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const heaven: [number, string][] = [[0, '#5aa6f2'], [0.35, '#9fcdfa'], [0.68, '#ffe9c0'], [1, '#fff6dc']];
  const nightTop = new THREE.Color(night);
  const nightBottom = new THREE.Color(night).lerp(new THREE.Color(0x1a2438), 0.6);
  const tmp = new THREE.Color();
  let last = -1;

  const setBlend = (k: number): void => {
    const v = Math.min(1, Math.max(0, k));
    if (Math.abs(v - last) < 0.004) return;
    last = v;
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    for (const [t, hex] of heaven) {
      tmp.set(hex).lerp(t < 0.5 ? nightTop : nightBottom, v);
      grad.addColorStop(t, `#${tmp.getHexString()}`);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    const sun = ctx.createRadialGradient(W * 0.5, H * 0.34, 0, W * 0.5, H * 0.34, W * 0.62);
    const a = 1 - v;
    sun.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
    sun.addColorStop(0.18, `rgba(255,244,200,${0.7 * a})`);
    sun.addColorStop(0.5, `rgba(255,225,160,${0.25 * a})`);
    sun.addColorStop(1, 'rgba(255,225,160,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    texture.needsUpdate = true;
  };
  setBlend(0);
  return { texture, setBlend };
}
