import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../../../../shared/online/seededRandom';
import { glowTexture } from './StreetLights';

export interface TougeZones {
  uStartEnd: number;
  uHairpinStart: number;
  uSnowShedStart: number;
  uBridgeStart: number;
  uTunnelStart: number;
  uTunnelEnd: number;
}

export interface TougeBuildOptions {
  roadWidth: number;
  zones: TougeZones;
  zonePerSample: number[];
}

/** [lateral, height] cross-section segment */
type Segment = [[number, number], [number, number]];

interface CornerRun {
  a: number;
  b: number;
  peak: number;
  maxC: number;
  turnSum: number;
}

// ============================================================================
// 1. Procedural Canvas Textures (Road, Decel Strips, Walls, Foliage, Portals)
// ============================================================================

/** Standard Touge Wet Asphalt: double orange center line, white edge lines, wheel wear & concrete gutter grating on edges. */
function makeTougeAsphaltTexture(roadWidth: number, repeatMetres: number): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#23262c';
  g.fillRect(0, 0, W, H);

  const img = g.getImageData(0, 0, W, H);
  const rand = mulberry32(404);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rand() - 0.5) * 18;
    img.data[i] = Math.max(0, Math.min(255, img.data[i] + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] + n));
  }
  g.putImageData(img, 0, 0);

  const pxPerM = W / roadWidth;
  for (const f of [0.27, 0.73]) {
    const cx = W * f;
    const grad = g.createLinearGradient(cx - 65, 0, cx + 65, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.5, 'rgba(8,10,14,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(cx - 65, 0, 130, H);
  }

  // Concrete drainage gutter & dark steel grating slots on both outer 0.65m edges (側溝走り用の側溝・グレーチング)
  const gutterW = Math.round(0.68 * pxPerM);
  g.fillStyle = '#484d54';
  g.fillRect(0, 0, gutterW, H);
  g.fillRect(W - gutterW, 0, gutterW, H);

  g.fillStyle = '#14171c';
  const grateStep = Math.round(H / 16);
  for (let y = 4; y < H; y += grateStep) {
    g.fillRect(4, y, gutterW - 10, Math.round(grateStep * 0.68));
    g.fillRect(W - gutterW + 6, y, gutterW - 10, Math.round(grateStep * 0.68));
    g.fillStyle = '#333840';
    for (let s = 1; s <= 2; s++) {
      const sy = y + Math.round((grateStep * 0.68 * s) / 3);
      g.fillRect(4, sy, gutterW - 10, 2);
      g.fillRect(W - gutterW + 6, sy, gutterW - 10, 2);
    }
    g.fillStyle = '#14171c';
  }

  // Solid white shoulder lines just inside the gutters
  const lineW = Math.max(5, Math.round(0.16 * pxPerM));
  g.fillStyle = 'rgba(232, 238, 246, 0.88)';
  g.fillRect(gutterW + 2, 0, lineW, H);
  g.fillRect(W - gutterW - 2 - lineW, 0, lineW, H);

  // Double amber/orange no-passing center line + glowing cat's-eye road studs
  const mid = W >> 1;
  const gap = Math.max(3, Math.round(0.11 * pxPerM));
  g.fillStyle = 'rgba(238, 146, 28, 0.92)';
  g.fillRect(mid - gap - lineW, 0, lineW, H);
  g.fillRect(mid + gap, 0, lineW, H);

  const studStep = Math.round((4 / repeatMetres) * H);
  for (let y = Math.round(studStep * 0.5); y < H; y += studStep) {
    g.fillStyle = '#ffaa22';
    g.fillRect(mid - 3, y - 4, 6, 8);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Corner Entry Braking Zone Asphalt Texture (strictly placed ONLY before sharp corners):
 * Reddish-brown anti-skid transverse deceleration bands, white zebra center markings, and black tire drift skid marks.
 */
function makeHairpinAsphaltTexture(roadWidth: number): THREE.CanvasTexture {
  const W = 512, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#22252b';
  g.fillRect(0, 0, W, H);

  const pxPerM = W / roadWidth;
  const gutterW = Math.round(0.68 * pxPerM);
  const lineW = Math.max(5, Math.round(0.16 * pxPerM));

  // Reddish-brown anti-skid deceleration strips (赤茶色の減速帯)
  const bandStep = Math.round(H / 8);
  for (let y = 0; y < H; y += bandStep) {
    g.fillStyle = 'rgba(154, 48, 32, 0.80)';
    g.fillRect(gutterW + lineW + 2, y + 8, W - 2 * (gutterW + lineW + 2), Math.round(bandStep * 0.50));
    g.fillStyle = 'rgba(218, 224, 232, 0.46)';
    g.fillRect(gutterW + lineW + 2, y + 4, W - 2 * (gutterW + lineW + 2), 4);
  }

  // Twin black tire drift skid marks weaving across the lane
  g.strokeStyle = 'rgba(8, 9, 12, 0.72)';
  g.lineWidth = 14;
  for (const baseX of [W * 0.24, W * 0.36, W * 0.64, W * 0.76]) {
    g.beginPath();
    for (let y = 0; y <= H; y += 32) {
      const sway = Math.sin((y / H) * Math.PI * 2) * 16;
      if (y === 0) g.moveTo(baseX + sway, y);
      else g.lineTo(baseX + sway, y);
    }
    g.stroke();
  }

  // Concrete drainage gutter & dark steel grating on outer edges
  g.fillStyle = '#484d54';
  g.fillRect(0, 0, gutterW, H);
  g.fillRect(W - gutterW, 0, gutterW, H);
  g.fillStyle = '#14171c';
  const grateStep = Math.round(H / 16);
  for (let y = 4; y < H; y += grateStep) {
    g.fillRect(4, y, gutterW - 10, Math.round(grateStep * 0.68));
    g.fillRect(W - gutterW + 6, y, gutterW - 10, Math.round(grateStep * 0.68));
  }

  // White shoulder edge lines
  g.fillStyle = 'rgba(236, 240, 248, 0.92)';
  g.fillRect(gutterW + 2, 0, lineW, H);
  g.fillRect(W - gutterW - 2 - lineW, 0, lineW, H);

  // Center white zebra buffer zone + double orange line border
  const mid = W >> 1;
  const zebraHalf = Math.round(0.36 * pxPerM);
  g.save();
  g.beginPath();
  g.rect(mid - zebraHalf, 0, zebraHalf * 2, H);
  g.clip();
  g.strokeStyle = 'rgba(235, 240, 248, 0.76)';
  g.lineWidth = 8;
  for (let y = -H; y < H * 2; y += 28) {
    g.beginPath();
    g.moveTo(mid - zebraHalf - 10, y);
    g.lineTo(mid + zebraHalf + 10, y + 36);
    g.stroke();
  }
  g.restore();

  g.fillStyle = 'rgba(242, 148, 28, 0.95)';
  g.fillRect(mid - zebraHalf - lineW, 0, lineW, H);
  g.fillRect(mid + zebraHalf, 0, lineW, H);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Concrete Grid Crib Retaining Wall Texture (法枠コンクリート擁壁＋苔むした岩肌). */
function makeCribWallTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#252c26';
  g.fillRect(0, 0, W, H);

  const rand = mulberry32(707);
  for (let i = 0; i < 900; i++) {
    const x = rand() * W, y = rand() * H, r = 2 + rand() * 8;
    g.fillStyle = rand() > 0.5 ? 'rgba(24, 38, 26, 0.5)' : 'rgba(52, 56, 54, 0.45)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }

  const cells = 4, step = W / cells;
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    g.fillStyle = '#686e74';
    g.fillRect(p - 14, 0, 28, H);
    g.fillRect(0, p - 14, W, 28);
    g.fillStyle = '#848b92';
    g.fillRect(p - 14, 0, 6, H);
    g.fillRect(0, p - 14, W, 6);
    g.fillStyle = '#383d42';
    g.fillRect(p + 8, 0, 6, H);
    g.fillRect(0, p + 8, W, 6);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Weathered White Ceramic Tunnel Tile Wall Texture (白いタイル張りのトンネル側壁). */
function makeTunnelTileTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#cfd5dc';
  g.fillRect(0, 0, W, H);

  g.strokeStyle = '#8d959e';
  g.lineWidth = 2;
  const cols = 8, rows = 16;
  for (let i = 0; i <= cols; i++) {
    const x = (i * W) / cols;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
  }
  for (let j = 0; j <= rows; j++) {
    const y = (j * H) / rows;
    g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
  }

  // Dark exhaust soot & orange reflector band along the bottom of the tiled wall
  const soot = g.createLinearGradient(0, 0, W, 0);
  soot.addColorStop(0, 'rgba(26, 28, 32, 0.78)');
  soot.addColorStop(0.28, 'rgba(42, 46, 52, 0.28)');
  soot.addColorStop(0.85, 'rgba(32, 36, 40, 0.12)');
  soot.addColorStop(1, 'rgba(28, 30, 34, 0.65)');
  g.fillStyle = soot;
  g.fillRect(0, 0, W, H);

  g.fillStyle = '#ff8811';
  g.fillRect(54, 0, 14, H);

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Procedural Alpha-Tested Japanese Cedar Foliage Texture (リアルな杉の枝葉シルエット・透過テクスチャ).
 * Replaces flat geometric cones with multi-layered feathery needle boughs, dark interior occlusion, and ragged outer silhouettes.
 */
function makeCedarFoliageTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, W, H);

  const rand = mulberry32(919);
  const cx = W * 0.5;

  // Central dark bark trunk core inside the canopy
  g.fillStyle = '#1f1611';
  g.fillRect(cx - 8, H * 0.12, 16, H * 0.88);

  // Draw 9 tiers of drooping Japanese Cedar (スギ) boughs from top to bottom
  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const u = t / (tiers - 1); // 0 = crown tip, 1 = lowest skirt bough
    const baseY = H * (0.07 + u * 0.78);
    const maxSpan = W * (0.09 + Math.pow(u, 0.78) * 0.39);
    const clusterCount = 28 + Math.floor(u * 36);

    for (let k = 0; k < clusterCount; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const frac = Math.pow(rand(), 0.75); // radial distance 0..1 along bough
      const bx = cx + side * frac * maxSpan * (0.82 + rand() * 0.32);
      // Cedar branches droop downward then curl slightly at the tip
      const droop = frac * (28 + u * 42) - Math.pow(frac, 2.2) * 12 + (rand() - 0.5) * 18;
      const by = baseY + droop;

      // Darker near the trunk core, rich deep evergreen on outer needles
      const shade = 0.45 + frac * 0.55 * (0.75 + rand() * 0.4);
      const r = Math.round(14 * shade);
      const gr = Math.round(36 * shade);
      const b = Math.round(25 * shade);
      g.fillStyle = `rgba(${r}, ${gr}, ${b}, 0.96)`;
      g.strokeStyle = `rgba(${r + 4}, ${gr + 9}, ${b + 5}, 0.92)`;

      // Draw a fan of 7 spiky cedar needle clusters
      const fanAngleBase = side < 0 ? Math.PI * 0.78 : Math.PI * 0.22;
      for (let n = 0; n < 7; n++) {
        const ang = fanAngleBase + (rand() - 0.5) * 1.15;
        const len = 14 + rand() * 22 * (1 - u * 0.2);
        const nx = bx + Math.cos(ang) * len;
        const ny = by + Math.sin(ang) * len;
        g.lineWidth = 2.6 + rand() * 2.2;
        g.beginPath();
        g.moveTo(bx, by);
        g.lineTo(nx, ny);
        g.stroke();

        // Dense needle tuft blob
        g.beginPath();
        g.ellipse(
          (bx + nx) * 0.5,
          (by + ny) * 0.5,
          4.5 + rand() * 4.5,
          2.2 + rand() * 2.5,
          ang,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Red-and-White Chevron Signboard Texture (赤白シェブロン矢印板). */
function makeRedWhiteChevronTexture(pointLeft: boolean): THREE.CanvasTexture {
  const W = 256, H = 192;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#e4221c';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 10;
  g.strokeRect(5, 5, W - 10, H - 10);

  g.fillStyle = '#ffffff';
  for (const ox of [52, 148]) {
    g.beginPath();
    if (pointLeft) {
      g.moveTo(ox + 48, 22);
      g.lineTo(ox, H / 2);
      g.lineTo(ox + 48, H - 22);
      g.lineTo(ox + 82, H - 22);
      g.lineTo(ox + 34, H / 2);
      g.lineTo(ox + 82, 22);
    } else {
      g.moveTo(ox, 22);
      g.lineTo(ox + 48, H / 2);
      g.lineTo(ox, H - 22);
      g.lineTo(ox + 34, H - 22);
      g.lineTo(ox + 82, H / 2);
      g.lineTo(ox + 34, 22);
    }
    g.closePath();
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Yellow Diamond Japanese Touge Warning Sign ("急勾配 / つづら折り"). */
function makeYellowWarningSignTexture(): THREE.CanvasTexture {
  const W = 256, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, W, H);

  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(Math.PI / 4);
  g.fillStyle = '#f2b705';
  g.fillRect(-84, -84, 168, 168);
  g.strokeStyle = '#141414';
  g.lineWidth = 9;
  g.strokeRect(-76, -76, 152, 152);
  g.restore();

  g.strokeStyle = '#141414';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(128, 185);
  g.lineTo(128, 150);
  g.lineTo(98, 125);
  g.lineTo(156, 95);
  g.lineTo(124, 66);
  g.stroke();

  g.fillStyle = '#141414';
  g.font = '900 22px "Hiragino Kaku Gothic ProN", sans-serif';
  g.textAlign = 'center';
  g.fillText('急カーブ', 128, 212);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Green Japanese Tunnel Emergency Exit Sign ("非常口 EXIT 150m"). */
function makeEmergencyExitTexture(): THREE.CanvasTexture {
  const W = 128, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#009944';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 6;
  g.strokeRect(4, 4, W - 8, H - 8);

  g.fillStyle = '#ffffff';
  g.font = '900 28px "Hiragino Kaku Gothic ProN", sans-serif';
  g.textAlign = 'center';
  g.fillText('非常口', W / 2, 46);
  g.font = '900 22px Arial, sans-serif';
  g.fillText('EXIT', W / 2, 82);
  g.font = '700 20px Arial, sans-serif';
  g.fillText('← 150m', W / 2, 128);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Japanese Tunnel Portal Nameplate Texture (トンネル坑門の扁額「月影第一隧道」). */
function makeTunnelPortalSignTexture(title: string, sub: string): THREE.CanvasTexture {
  const W = 512, H = 160;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#20242a';
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#9aa2ac';
  g.lineWidth = 8;
  g.strokeRect(6, 6, W - 12, H - 12);

  g.fillStyle = '#f2f5f8';
  g.font = '900 62px "Hiragino Mincho ProN", "Hiragino Kaku Gothic ProN", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, W / 2, 66);
  g.fillStyle = '#b8c2cc';
  g.font = '700 24px Arial, sans-serif';
  g.fillText(sub, W / 2, 126);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Vertical Onsen Kanji Neon Signboard Texture ("湯元温泉", "秘湯旅館", "大浴場"). */
function makeOnsenNeonTexture(text: string, bg: string, fg: string): THREE.CanvasTexture {
  const W = 96, H = 320;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(5, 5, W - 10, H - 10);

  g.fillStyle = fg;
  g.font = '900 50px "Hiragino Kaku Gothic ProN", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const chars = [...text];
  const step = (H - 40) / Math.max(1, chars.length);
  chars.forEach((ch, i) => {
    g.fillText(ch, W / 2, 24 + step * (i + 0.5));
  });

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Alpha-tested Autumn Foliage Texture: Crimson Momiji Maple (紅葉) or Golden Ginkgo (イチョウ並木). */
function makeAutumnFoliageTexture(crimson: boolean): THREE.CanvasTexture {
  const W = 256, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.clearRect(0, 0, W, H);
  const rand = mulberry32(crimson ? 9012 : 9034);
  const cx = W / 2;

  g.fillStyle = '#24150e';
  g.fillRect(cx - 7, H * 0.16, 14, H * 0.84);

  const tiers = 9;
  for (let t = 0; t < tiers; t++) {
    const u = t / (tiers - 1);
    const baseY = H * (0.08 + u * 0.76);
    const maxSpan = W * (0.14 + Math.sin(u * Math.PI * 0.85) * 0.34);
    const clusterCount = 32 + Math.floor(u * 34);
    for (let k = 0; k < clusterCount; k++) {
      const side = k % 2 === 0 ? -1 : 1;
      const frac = Math.pow(rand(), 0.7);
      const bx = cx + side * frac * maxSpan * (0.8 + rand() * 0.35);
      const by = baseY + (rand() - 0.4) * 32;
      const shade = 0.55 + frac * 0.45 * (0.8 + rand() * 0.35);
      const r = crimson ? Math.min(255, Math.round(235 * shade)) : Math.min(255, Math.round(245 * shade));
      const gr = crimson ? Math.min(255, Math.round((42 + rand() * 55) * shade)) : Math.min(255, Math.round((165 + rand() * 55) * shade));
      const b = crimson ? Math.round(20 * shade) : Math.round(24 * shade);
      g.fillStyle = `rgba(${r}, ${gr}, ${b}, 0.96)`;
      for (let leaf = 0; leaf < 5; leaf++) {
        const ang = rand() * Math.PI * 2;
        const dist = rand() * 14;
        g.beginPath();
        g.ellipse(
          bx + Math.cos(ang) * dist,
          by + Math.sin(ang) * dist,
          7 + rand() * 6,
          4 + rand() * 4,
          ang,
          0,
          Math.PI * 2,
        );
        g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Traditional Japanese Castle-Style Mossy Stone Masonry Wall Texture (野面積み石垣・苔むした城壁). */
function makeStoneMasonryWallTexture(): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const rand = mulberry32(4411);

  g.fillStyle = '#171d18';
  g.fillRect(0, 0, W, H);

  const rows = 6;
  const rowH = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = (r % 2) * -28;
    const y = r * rowH;
    while (x < W) {
      const w = 52 + Math.floor(rand() * 44);
      const h = rowH - 5;
      const tone = 68 + Math.floor(rand() * 38);
      const moss = rand() > 0.55 ? 14 : 0;
      g.fillStyle = `rgb(${tone - 4}, ${tone + moss}, ${tone})`;
      g.beginPath();
      g.roundRect(x + 3, y + 3, w - 6, h - 2, 7);
      g.fill();
      g.strokeStyle = 'rgba(200, 215, 210, 0.16)';
      g.lineWidth = 2;
      g.stroke();
      x += w;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Segmented Emerald Moso Bamboo Culm Texture with Node Rings & Fiber Grain (孟宗竹の幹と節テクスチャ). */
function makeBambooCulmTexture(): THREE.CanvasTexture {
  const W = 128, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const rand = mulberry32(9182);

  // Cylindrical emerald-jade shading across X
  const cylGrad = g.createLinearGradient(0, 0, W, 0);
  cylGrad.addColorStop(0, '#0f3d1e');
  cylGrad.addColorStop(0.28, '#289e4c');
  cylGrad.addColorStop(0.52, '#54d678');
  cylGrad.addColorStop(0.76, '#1f7e3c');
  cylGrad.addColorStop(1, '#0d3318');
  g.fillStyle = cylGrad;
  g.fillRect(0, 0, W, H);

  // Subtle vertical bamboo fiber striations
  for (let i = 0; i < 60; i++) {
    const x = rand() * W;
    g.fillStyle = i % 2 === 0 ? 'rgba(210, 255, 190, 0.08)' : 'rgba(5, 25, 10, 0.12)';
    g.fillRect(x, 0, 1 + rand() * 1.5, H);
  }

  // Distinct horizontal bamboo node joints ("節") every 42px
  for (let y = 28; y < H; y += 42) {
    // Dark sheath shadow below node
    g.fillStyle = 'rgba(6, 24, 10, 0.78)';
    g.fillRect(0, y - 3, W, 4);
    // Bright pale-green/ivory node ring ridge
    g.fillStyle = 'rgba(205, 250, 175, 0.88)';
    g.fillRect(0, y + 1, W, 3.5);
    // Upper ring rim
    g.fillStyle = 'rgba(18, 62, 28, 0.65)';
    g.fillRect(0, y + 4.5, W, 2.5);
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Alpha-Tested Feather-Like Bamboo Leaf Sprays Texture (笹の葉・竹林の葉群テクスチャ). */
function makeBambooFoliageTexture(): THREE.CanvasTexture {
  const W = 512, H = 512;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const rand = mulberry32(6319);

  g.clearRect(0, 0, W, H);

  // Draw 95 radiating clusters of sharp, lance-shaped bamboo leaves ("笹の葉")
  for (let cl = 0; cl < 95; cl++) {
    const cx = W * (0.12 + rand() * 0.76);
    const cy = H * (0.08 + rand() * 0.78);
    const baseAngle = (rand() - 0.5) * 1.4 + Math.PI * 0.5;
    const leafCount = 5 + Math.floor(rand() * 4);

    // Thin twig stem
    g.strokeStyle = 'rgba(35, 95, 42, 0.85)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(cx, cy - 12);
    g.lineTo(cx, cy);
    g.stroke();

    for (let l = 0; l < leafCount; l++) {
      const spread = ((l / (leafCount - 1)) - 0.5) * 1.25;
      const ang = baseAngle + spread + (rand() - 0.5) * 0.12;
      const len = 26 + rand() * 24;
      const halfW = 3.2 + rand() * 2.2;

      const shade = 0.62 + rand() * 0.45;
      const r = Math.min(255, Math.round(52 * shade));
      const gr = Math.min(255, Math.round(195 * shade));
      const b = Math.min(255, Math.round(82 * shade));

      g.save();
      g.translate(cx, cy);
      g.rotate(ang);
      g.fillStyle = `rgba(${r}, ${gr}, ${b}, 0.96)`;
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(len * 0.42, -halfW, len, 0);
      g.quadraticCurveTo(len * 0.42, halfW, 0, 0);
      g.closePath();
      g.fill();
      g.restore();
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// ============================================================================
// 2. Main Touge Course Geometry, Continuous Mountain Terrain & Landmark Builder
// ============================================================================

export function buildTougeCourse(road: THREE.Vector3[], opts: TougeBuildOptions): THREE.Group {
  const n = road.length;
  const half = opts.roadWidth / 2;
  const zoneOf = opts.zonePerSample;
  const root = new THREE.Group();
  root.name = 'touge-course';

  const at = (i: number): THREE.Vector3 => road[(i + n * 4) % n];

  // 1. Frame vectors + Heavily Smoothed Normals (prevents wall folding/creasing on tight R=21.5m hairpins!)
  const nx = new Float32Array(n), nz = new Float32Array(n), yaw = new Float32Array(n), curv = new Float32Array(n);
  const sNx = new Float32Array(n), sNz = new Float32Array(n);
  const arcs = new Float32Array(n + 1);

  for (let i = 0; i < n; i++) {
    const a = at(i - 1), b = at(i + 1);
    const tx = b.x - a.x, tz = b.z - a.z, len = Math.hypot(tx, tz) || 1;
    nx[i] = -tz / len; // +1 = driver's right (valley/cliff side on clockwise loop), -1 = driver's left (mountain side)
    nz[i] = tx / len;
    yaw[i] = Math.atan2(tx, tz);
    if (i > 0) arcs[i] = arcs[i - 1] + Math.hypot(road[i].x - road[i - 1].x, road[i].z - road[i - 1].z);
  }
  arcs[n] = arcs[n - 1] + Math.hypot(road[0].x - road[n - 1].x, road[0].z - road[n - 1].z);

  // Smooth normal vectors over a +-14 sample window so wall & slope offsets never pinch or crease on tight R=21.5m hairpins
  for (let i = 0; i < n; i++) {
    let sx = 0, sz = 0;
    for (let d = -14; d <= 14; d++) {
      const k = (i + d + n) % n;
      sx += nx[k];
      sz += nz[k];
    }
    const len = Math.hypot(sx, sz) || 1;
    sNx[i] = sx / len;
    sNz[i] = sz / len;

    let dyaw = yaw[(i + 4) % n] - yaw[(i - 4 + n) % n];
    while (dyaw > Math.PI) dyaw -= 2 * Math.PI;
    while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
    curv[i] = dyaw; // +ve = turning left, -ve = turning right
  }

  // 2. Detect discrete sharp corners in Zone 1 & Zone 2 for STRICT braking-zone deceleration strips & corner props
  const isSharp = road.map((_, i) => (zoneOf[i] === 1 || zoneOf[i] === 2) && Math.abs(curv[i]) > 0.13);
  const cornerRuns: CornerRun[] = [];
  let curRun: CornerRun | null = null;
  for (let i = 8; i < n - 8; i++) {
    if (isSharp[i]) {
      const c = Math.abs(curv[i]);
      if (!curRun) curRun = { a: i, b: i, peak: i, maxC: c, turnSum: curv[i] };
      else {
        curRun.b = i;
        curRun.turnSum += curv[i];
        if (c > curRun.maxC) { curRun.maxC = c; curRun.peak = i; }
      }
    } else if (curRun) {
      if (curRun.b - curRun.a >= 5) cornerRuns.push(curRun);
      curRun = null;
    }
  }
  if (curRun && curRun.b - curRun.a >= 5) cornerRuns.push(curRun);

  // Strict Deceleration Strip Mask: ONLY 18 samples (~36m) before turn-in up to 4 samples past the apex!
  // Straightaways between corners stay 100% clean dark wet asphalt!
  const decelMask = new Uint8Array(n);
  for (const run of cornerRuns) {
    if (run.maxC < 0.16) continue; // Only medium-sharp to hairpin corners get red deceleration strips
    const startK = Math.max(20, run.a - 18);
    const endK = Math.min(n - 10, run.peak + 4);
    for (let k = startK; k <= endK; k++) {
      if (zoneOf[k] === 1 || zoneOf[k] === 2) decelMask[k] = 1;
    }
  }

  /** Sweep cross-section segments along a subset of samples where `pred(k)` is true. */
  const sweepWhere = (
    segments: Segment[],
    pred: (k: number) => boolean,
    repeatMetres = 16,
    withUv = true,
    useSmoothedNormal = false,
  ): THREE.BufferGeometry => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    const N = useSmoothedNormal ? sNx : nx;
    const Z = useSmoothedNormal ? sNz : nz;
    segments.forEach(([[l0, h0], [l1, h1]]) => {
      const base = pos.length / 3;
      for (let i = 0; i <= n; i++) {
        const k = i % n, r = road[k];
        pos.push(
          r.x + N[k] * l0, r.y + h0, r.z + Z[k] * l0,
          r.x + N[k] * l1, r.y + h1, r.z + Z[k] * l1,
        );
        if (withUv) {
          const v = arcs[i] / repeatMetres;
          uv.push(0, v, 1, v);
        }
        if (i < n && (pred(k) || pred((i + 1) % n))) {
          const q = base + i * 2;
          idx.push(q, q + 2, q + 1, q + 1, q + 2, q + 3);
        }
      }
    });
    const remap = new Int32Array(pos.length / 3).fill(-1);
    const cPos: number[] = [], cUv: number[] = [], cIdx: number[] = [];
    for (let m = 0; m < idx.length; m++) {
      const oldV = idx[m];
      let newV = remap[oldV];
      if (newV === -1) {
        newV = cPos.length / 3;
        remap[oldV] = newV;
        cPos.push(pos[oldV * 3], pos[oldV * 3 + 1], pos[oldV * 3 + 2]);
        if (withUv) cUv.push(uv[oldV * 2], uv[oldV * 2 + 1]);
      }
      cIdx.push(newV);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(cPos, 3));
    if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(cUv, 2));
    g.setIndex(cIdx);
    g.computeVertexNormals();
    return g;
  };

  // -------------------------------------------------------------------------
  // A. Road Surfaces: Normal Touge Asphalt vs Corner-Entry Deceleration Strips
  // -------------------------------------------------------------------------
  const isHairpinSample = (k: number): boolean => decelMask[k] === 1;
  const normalSurfGeo = sweepWhere([[[-half, 0.03], [half, 0.03]]], (k) => !isHairpinSample(k), 16, true);
  const hairpinSurfGeo = sweepWhere([[[-half, 0.035], [half, 0.035]]], (k) => isHairpinSample(k), 14, true);

  const normalSurfMesh = new THREE.Mesh(
    normalSurfGeo,
    new THREE.MeshStandardMaterial({
      map: makeTougeAsphaltTexture(opts.roadWidth, 16),
      roughness: 0.72,
      metalness: 0.08,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  normalSurfMesh.receiveShadow = true;
  normalSurfMesh.frustumCulled = false;

  const hairpinSurfMesh = new THREE.Mesh(
    hairpinSurfGeo,
    new THREE.MeshStandardMaterial({
      map: makeHairpinAsphaltTexture(opts.roadWidth),
      roughness: 0.76,
      metalness: 0.05,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    }),
  );
  hairpinSurfMesh.receiveShadow = true;
  hairpinSurfMesh.frustumCulled = false;
  root.add(normalSurfMesh, hairpinSurfMesh);

  // Continuous Deep Roadbed Sub-structure & Valley Embankment Skirt (seals road underside into the mountain terrain!)
  const bedGeo = sweepWhere(
    [
      [[-half - 0.55, 0.01], [-half - 3.8, -8.5]],
      [[-half - 3.8, -8.5], [half + 3.8, -8.5]],
      [[half + 3.8, -8.5], [half + 0.55, 0.01]],
      [[-half - 0.55, 0.01], [half + 0.55, 0.01]],
      [[half + 0.35, 0.01], [half + 4.8, -3.6]],
      [[half + 4.8, -3.6], [half + 11.5, -14.0]],
    ],
    (k) => zoneOf[k] !== 4, // Bridge has its own red steel girder deck
    16,
    false,
    true,
  );
  const bedMesh = new THREE.Mesh(bedGeo, new THREE.MeshLambertMaterial({ color: 0x17221b, side: THREE.DoubleSide }));
  bedMesh.frustumCulled = false;
  root.add(bedMesh);

  // -------------------------------------------------------------------------
  // B. Continuous 3D Mountain Terrain Heightfield (Eliminates all void / 奈落 while staying strictly below the road!)
  // -------------------------------------------------------------------------
  const { terrainMesh, sampleTerrainY } = buildMountainTerrain(road, sNx, sNz, zoneOf, half);
  root.add(terrainMesh);

  // -------------------------------------------------------------------------
  // C. Zones 0, 1, 2: Smooth Concrete Grid Crib Retaining Wall (法枠擁壁) + Forested Upper Bank + End Caps + Guardrail
  // -------------------------------------------------------------------------
  const isOpenTouge = (k: number): boolean => zoneOf[k] === 0 || zoneOf[k] === 1 || zoneOf[k] === 2;
  const cribStartIdx = 36;
  const cribEndIdx = road.findIndex((_, i) => zoneOf[i] === 3) - 1;
  // Scenic alcoves & historic stone masonry sections along the consecutive curves:
  const inShrineAlcove = (k: number): boolean => k >= 452 && k <= 476;
  const inChayaAlcove = (k: number): boolean => k >= 534 && k <= 560;
  const inStoneMasonryZone = (k: number): boolean =>
    (k >= 436 && k < 452) || (k > 476 && k <= 492) || (k >= 716 && k <= 766);
  const inGeothermalAlcove = (k: number): boolean => k >= 774 && k <= 832;

  const hasLeftCribWall = (k: number): boolean =>
    isOpenTouge(k) &&
    k >= cribStartIdx &&
    k <= cribEndIdx &&
    !inShrineAlcove(k) &&
    !inChayaAlcove(k) &&
    !inStoneMasonryZone(k) &&
    !inGeothermalAlcove(k);

  const cribTex = makeCribWallTexture();
  // Use smoothed normals + compact lateral offset (-2.85m) so it NEVER folds on hairpins!
  const cribWallGeo = sweepWhere(
    [
      [[-half - 0.32, -0.2], [-half - 0.58, 0.55]],
      [[-half - 0.58, 0.55], [-half - 2.85, 6.4]],
      [[-half - 2.85, 6.4], [-half - 5.2, 6.8]],
    ],
    hasLeftCribWall,
    12,
    true,
    true,
  );
  const cribWallMat = new THREE.MeshLambertMaterial({ map: cribTex, side: THREE.DoubleSide });
  const cribWallMesh = new THREE.Mesh(cribWallGeo, cribWallMat);
  cribWallMesh.receiveShadow = true;
  cribWallMesh.frustumCulled = false;

  // Mossy Japanese Castle-Style Stone Masonry Wall (野面積み石垣) in the Shrine & Bamboo Grove sections
  const stoneWallTex = makeStoneMasonryWallTexture();
  const stoneWallGeo = sweepWhere(
    [
      [[-half - 0.32, -0.2], [-half - 0.52, 0.45]],
      [[-half - 0.52, 0.45], [-half - 1.95, 4.4]],
      [[-half - 1.95, 4.4], [-half - 6.8, 4.6]],
    ],
    inStoneMasonryZone,
    10,
    true,
    true,
  );
  const stoneWallMat = new THREE.MeshLambertMaterial({ map: stoneWallTex, side: THREE.DoubleSide });
  const stoneWallMesh = new THREE.Mesh(stoneWallGeo, stoneWallMat);
  stoneWallMesh.receiveShadow = true;
  stoneWallMesh.frustumCulled = false;
  root.add(stoneWallMesh);

  // Forested upper mountain bank directly behind the crib wall (-2.8m .. -12.5m) ONLY where hasLeftCribWall is active
  const mountainBankGeo = sweepWhere(
    [
      [[-half - 2.8, 6.35], [-half - 7.2, 9.6]],
      [[-half - 7.2, 9.6], [-half - 12.5, -6.0]],
    ],
    hasLeftCribWall,
    16,
    false,
    true,
  );
  const mountainBankMat = new THREE.MeshLambertMaterial({ color: 0x152319, side: THREE.DoubleSide });
  const mountainBankMesh = new THREE.Mesh(mountainBankGeo, mountainBankMat);
  mountainBankMesh.frustumCulled = false;
  root.add(mountainBankMesh);

  // Recessed mountain backdrop behind the scenic alcoves & stone masonry walls so alcoves are open and unobstructed
  const alcoveBackBankGeo = sweepWhere(
    [
      [[-half - 6.6, 4.4], [-half - 11.8, 8.8]],
      [[-half - 11.8, 8.8], [-half - 16.5, -6.0]],
    ],
    (k) => isOpenTouge(k) && k >= cribStartIdx && k <= cribEndIdx && !hasLeftCribWall(k),
    16,
    false,
    true,
  );
  const alcoveBackBankMesh = new THREE.Mesh(alcoveBackBankGeo, mountainBankMat);
  alcoveBackBankMesh.frustumCulled = false;
  root.add(alcoveBackBankMesh);

  // Road-level plaza floor + masonry back face for the Shrine / Chaya / Geothermal alcoves
  // (their lanterns, stairs & yagura stand at road level, so the 2.2m pit down to the terrain must be filled)
  const inLeftAlcove = (k: number): boolean => inShrineAlcove(k) || inChayaAlcove(k) || inGeothermalAlcove(k);
  const alcoveFloorGeo = sweepWhere(
    [
      [[-half - 0.3, 0.02], [-half - 6.6, 0.02]],
      [[-half - 6.6, 0.02], [-half - 6.6, 4.4]],
    ],
    inLeftAlcove,
    10,
    true,
    true,
  );
  const alcoveFloorMesh = new THREE.Mesh(alcoveFloorGeo, stoneWallMat);
  alcoveFloorMesh.receiveShadow = true;
  alcoveFloorMesh.frustumCulled = false;
  root.add(alcoveFloorMesh);

  // Solid Concrete End-Cap Wing Walls at every transition boundary of hasLeftCribWall so wall edges are never open
  const cribCapGeos: THREE.BufferGeometry[] = [cribWallGeo];
  for (let k = cribStartIdx; k <= cribEndIdx; k++) {
    if (hasLeftCribWall(k) && (!hasLeftCribWall(k - 1) || !hasLeftCribWall(k + 1))) {
      const r = road[k], yw = yaw[k];
      const capGeo = new THREE.BoxGeometry(3.6, 7.0, 1.4);
      const lat = -(half + 2.0);
      capGeo.rotateY(yw);
      capGeo.translate(r.x + sNx[k] * lat, r.y + 3.1, r.z + sNz[k] * lat);
      cribCapGeos.push(capGeo);
    }
  }
  cribWallMesh.geometry = mergeGeometries(cribCapGeos);

  // Rockfall wire mesh fence above the concrete crib wall (落石防止ネット)
  const netGeo = sweepWhere(
    [[[-half - 2.8, 6.35], [-half - 2.45, 8.3]]],
    hasLeftCribWall,
    8,
    false,
    true,
  );
  const netMesh = new THREE.Mesh(
    netGeo,
    new THREE.MeshBasicMaterial({ color: 0x6c737a, wireframe: true, transparent: true, opacity: 0.52 }),
  );
  netMesh.frustumCulled = false;

  // White Corrugated W-Beam Guardrail (白い波形ガードレール) + Support Posts along the right cliff shoulder
  // Pullout bays: Overlook deck (254..298) & the Chaya teahouse plinth only (500..509) so the rail never stops short of a drop
  const inRightPulloutBay = (k: number): boolean => (k >= 254 && k <= 298) || (k >= 500 && k <= 509);
  const wBeam = (s: number): Segment[] => [
    [[s * (half + 0.18), 0.35], [s * (half + 0.18), 0.58]],
    [[s * (half + 0.18), 0.58], [s * (half + 0.28), 0.68]],
    [[s * (half + 0.28), 0.68], [s * (half + 0.18), 0.78]],
    [[s * (half + 0.18), 0.78], [s * (half + 0.18), 0.92]],
  ];
  const guardrailRightGeo = sweepWhere(
    wBeam(1),
    (k) => (isOpenTouge(k) || zoneOf[k] === 3) && !inRightPulloutBay(k),
    16,
    false,
  );
  // Left-side guardrail on the Zone 0 summit straights (start & finish) wherever no crib wall or parking apron
  // (apron = 66m centred on idx 11 → idx -5.5..27.5) seals the 2.2m drop to the terrain
  const onSummitApron = (k: number): boolean => k <= 27 || k >= n - 5;
  const guardrailLeftGeo = sweepWhere(
    wBeam(-1),
    (k) => zoneOf[k] === 0 && !onSummitApron(k) && !hasLeftCribWall(k),
    16,
    false,
  );
  const guardrailMat = new THREE.MeshStandardMaterial({ color: 0xdcdfe4, roughness: 0.45, metalness: 0.35, side: THREE.DoubleSide });
  const guardrailMesh = new THREE.Mesh(mergeGeometries([guardrailRightGeo, guardrailLeftGeo]), guardrailMat);
  guardrailMesh.receiveShadow = true;
  guardrailMesh.frustumCulled = false;
  root.add(cribWallMesh, netMesh, guardrailMesh);

  // -------------------------------------------------------------------------
  // D. Zone 0: Summit Start Area Landmarks (給水塔・自販機コーナー・展望駐車場)
  // -------------------------------------------------------------------------
  const startGroup = buildSummitStartArea(road, nx, nz, yaw, half);
  root.add(startGroup);

  // -------------------------------------------------------------------------
  // E. Zone 1 & 2 Touge Props + 5 Distinct Curve-Section Scenery Variations!
  // -------------------------------------------------------------------------
  const propsGroup = buildTougeRoadsideProps(road, nx, nz, yaw, zoneOf, half, cornerRuns);
  root.add(propsGroup);
  const curveSceneryGroup = buildCurveSectionSceneryVariations(road, nx, nz, sNx, sNz, yaw, half, sweepWhere);
  root.add(curveSceneryGroup);

  // -------------------------------------------------------------------------
  // F. Zone 3: Cliffside Concrete Snow Shed / Rock Shed (スノーシェッド・洞門 + Entrance/Exit Portal Caps)
  // -------------------------------------------------------------------------
  const snowShedGroup = buildSnowShed(road, nx, nz, yaw, zoneOf, half, sweepWhere);
  root.add(snowShedGroup);

  // -------------------------------------------------------------------------
  // G. Zone 4: Vermilion Red Steel Arch Bridge & Onsen Resort Town Panorama (赤いアーチ鉄橋＆温泉街夜景)
  // -------------------------------------------------------------------------
  const bridgeAndOnsenGroup = buildRedArchBridgeAndOnsenTown(road, nx, nz, yaw, zoneOf, half, sweepWhere, sampleTerrainY);
  root.add(bridgeAndOnsenGroup);

  // -------------------------------------------------------------------------
  // H. Zone 5: High-Speed Mountain Bypass Tunnel + Concrete Mountain Portals (坑門・白タイル壁・ジェットファン・非常口)
  // -------------------------------------------------------------------------
  const tunnelGroup = buildMountainBypassTunnel(road, nx, nz, yaw, zoneOf, half, sweepWhere);
  root.add(tunnelGroup);

  // -------------------------------------------------------------------------
  // I. Warm Amber Sodium Streetlights (open & bridge) + Tunnel/Shed Light Pools
  // -------------------------------------------------------------------------
  const lightsGroup = buildTougeStreetLights(road, nx, nz, yaw, zoneOf, opts.roadWidth);
  root.add(lightsGroup);

  // -------------------------------------------------------------------------
  // J. Multi-Biome Touge Forest (杉林 + ライトアップ紅葉・イチョウ並木 + 青竹林) planted on the 3D Terrain
  // -------------------------------------------------------------------------
  const forestGroup = buildRealisticCedarForest(road, sNx, sNz, zoneOf, half, sampleTerrainY);
  root.add(forestGroup);

  return root;
}

// ============================================================================
// 3. Continuous 3D Mountain Terrain Heightfield Builder
// ============================================================================

/**
 * Generates a continuous, C1-smooth 3D mountain terrain heightfield covering the entire touge & gorge world.
 * - Strictly stays below the road corridor (`baseRoadY - 2.2m`) within `half + 9.0m` of the road centerline so terrain
 *   triangles NEVER poke across the asphalt or block tunnel portals.
 * - Smoothly rises outside the corridor into the central Mount Tsukikage peak on the inside of the loop and carves the Onsen Gorge under the bridge.
 */
function buildMountainTerrain(
  road: THREE.Vector3[],
  sNx: Float32Array,
  sNz: Float32Array,
  zoneOf: number[],
  half: number,
): { terrainMesh: THREE.Mesh; sampleTerrainY: (x: number, z: number) => number } {
  const n = road.length;
  const iBridgeStart = zoneOf.findIndex((z) => z === 4);
  const iTunnelStart = zoneOf.findIndex((z) => z === 5);
  const bridgeSpan = Math.max(1, iTunnelStart - iBridgeStart);

  const fbm = (x: number, z: number): number =>
    Math.sin(x * 0.014) * Math.cos(z * 0.014) * 7.5 +
    Math.sin(x * 0.031 + 1.4) * Math.sin(z * 0.027 - 0.8) * 3.5;

  const sampleTerrainY = (x: number, z: number): number => {
    let bestK = 0;
    let bestD2 = Infinity;
    let wSum = 0;
    let yWeighted = 0;
    let gorgeWeighted = 0;

    // Sample every 2nd road point for smooth Gaussian elevation blending (zero discrete zone jumps!)
    for (let k = 0; k < n; k += 2) {
      const r = road[k];
      const dx = x - r.x, dz = z - r.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestK = k;
      }
      if (d2 < 110 * 110) {
        const w = Math.exp(-d2 / (42 * 42));
        wSum += w;
        yWeighted += r.y * w;
        if (zoneOf[k] === 4) {
          const uB = Math.max(0, Math.min(1, (k - iBridgeStart) / bridgeSpan));
          gorgeWeighted += Math.sin(uB * Math.PI) * w;
        }
      }
    }

    const rBest = road[bestK];
    const dBest = Math.sqrt(bestD2);
    const baseRoadY = wSum > 1e-4 ? yWeighted / wSum : rBest.y;
    const gorgeFactor = wSum > 1e-4 ? gorgeWeighted / wSum : 0;
    const lat = (x - rBest.x) * sNx[bestK] + (z - rBest.z) * sNz[bestK]; // < 0: inside loop (mountain), > 0: outside (valley)
    const noise = fbm(x, z);

    // Under the Red Arch Bridge (gorgeFactor > 0): carve the smooth Onsen River Gorge!
    const gorgeDrop = gorgeFactor * 22.0;

    // Keep the heightfield strictly below the roadbed within `half + 9.0m` (15m) of the road centerline!
    // This mathematically guarantees zero triangles ever poke through the road or block tunnel entrances.
    const safeCorridor = half + 9.0;
    if (dBest <= safeCorridor) {
      return baseRoadY - 2.2 - gorgeDrop;
    }

    const outDist = dBest - safeCorridor;
    // Smooth C^1 rational ramp: 0 at outDist = 0, derivative = 0 at outDist = 0, approaching 1 smoothly!
    const ramp = (outDist * outDist) / (outDist * outDist + 22.0 * 22.0);

    if (lat < 0) {
      // Inside the loop (mountain side): climb smoothly up into Mount Tsukikage's central peak
      const centralPeakBoost = Math.max(0, 1 - Math.hypot(x - (-40), z - 45) / 360) * 44.0;
      const mountainRise = Math.min(58.0, outDist * 0.48) + centralPeakBoost;
      return baseRoadY - 2.2 - gorgeDrop + ramp * (mountainRise + noise * 0.65);
    }

    // Outside the loop (valley side): drop into the forested valley, then rise into distant horizon mountains
    const valleyDrop = Math.min(24.0, outDist * 0.32);
    const horizonRise = Math.max(0, outDist - 75.0) * 0.48;
    return baseRoadY - 2.2 - gorgeDrop + ramp * (-valleyDrop + horizonRise + noise * 0.55);
  };

  // Build a continuous 152 x 172 grid mesh (~6.8m cell size) covering X in [-560, 480], Z in [-640, 580]
  const NX = 152, NZ = 172;
  const minX = -560, maxX = 480;
  const minZ = -640, maxZ = 580;
  const pos = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const col = new Float32Array((NX + 1) * (NZ + 1) * 3);
  const heights = new Float32Array((NX + 1) * (NZ + 1));

  let ptr = 0;
  for (let j = 0; j <= NZ; j++) {
    const z = minZ + ((maxZ - minZ) * j) / NZ;
    for (let i = 0; i <= NX; i++) {
      const x = minX + ((maxX - minX) * i) / NX;
      const y = sampleTerrainY(x, z);
      heights[ptr] = y;
      pos[ptr * 3] = x;
      pos[ptr * 3 + 1] = y;
      pos[ptr * 3 + 2] = z;
      ptr++;
    }
  }

  // Vertex colors based on local slope (rocky cliff face vs dark mossy cedar forest floor)
  const stepX = (maxX - minX) / NX;
  const stepZ = (maxZ - minZ) / NZ;
  for (let j = 0; j <= NZ; j++) {
    for (let i = 0; i <= NX; i++) {
      const idx = j * (NX + 1) + i;
      const hL = heights[j * (NX + 1) + Math.max(0, i - 1)];
      const hR = heights[j * (NX + 1) + Math.min(NX, i + 1)];
      const hD = heights[Math.max(0, j - 1) * (NX + 1) + i];
      const hU = heights[Math.min(NZ, j + 1) * (NX + 1) + i];
      const slope = Math.hypot((hR - hL) / (2 * stepX), (hU - hD) / (2 * stepZ));
      const rockMix = Math.max(0, Math.min(1, (slope - 0.35) / 0.55));
      col[idx * 3] = (0x12 / 255) * (1 - rockMix) + (0x28 / 255) * rockMix;
      col[idx * 3 + 1] = (0x20 / 255) * (1 - rockMix) + (0x2d / 255) * rockMix;
      col[idx * 3 + 2] = (0x18 / 255) * (1 - rockMix) + (0x33 / 255) * rockMix;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i;
      const b = a + 1;
      const c = a + (NX + 1);
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const terrainMesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
  );
  terrainMesh.receiveShadow = true;
  terrainMesh.frustumCulled = false;

  return { terrainMesh, sampleTerrainY };
}

// ============================================================================
// 4. Zone & Landmark Builders
// ============================================================================

/** Warm amber/orange sodium streetlights along open touge & bridge, plus road light pools inside snow shed & tunnel. */
function buildTougeStreetLights(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  yaw: Float32Array,
  zoneOf: number[],
  roadWidth: number,
): THREE.Group {
  const n = road.length, half = roadWidth / 2;
  const H = 8.4, ARM = 2.4, TILT = 0.2;
  const group = new THREE.Group();
  const steel: THREE.BufferGeometry[] = [], heads: THREE.BufferGeometry[] = [], glow: number[] = [];
  const poolPos: number[] = [], poolUv: number[] = [];
  const UP = new THREE.Vector3(0, 1, 0);

  let k = 0;
  for (let i = 8; i < n; i += 14) {
    k++;
    const z = zoneOf[i];
    const r = road[i], yw = yaw[i];
    const side = z === 4 ? (k % 2 === 0 ? 1 : -1) : 1;

    const a = road[(i - 4 + n) % n], b = road[(i + 4) % n];
    const fwd = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z).normalize();
    const lat = new THREE.Vector3(nx[i], 0, nz[i]).normalize();
    const cLat = z === 5 ? 0 : side * (half - 1.6);
    const c = new THREE.Vector3(r.x + nx[i] * cLat, r.y + 0.06, r.z + nz[i] * cLat);
    const L = 9.5, Wd = roadWidth * 0.62;
    const corner = (u: number, v: number): void => {
      poolPos.push(c.x + fwd.x * L * u + lat.x * Wd * v, c.y + fwd.y * L * u, c.z + fwd.z * L * u + lat.z * Wd * v);
    };
    corner(-1, -1); corner(1, -1); corner(1, 1); corner(-1, -1); corner(1, 1); corner(-1, 1);
    poolUv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);

    if (z === 3 || z === 5) continue;

    const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yw);
    const put = (g: THREE.BufferGeometry, pos: THREE.Vector3, q: THREE.Quaternion, into: THREE.BufferGeometry[]): void => {
      g.applyMatrix4(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(1, 1, 1)));
      into.push(g);
    };
    const bx = r.x + nx[i] * side * (half + 0.55), bz = r.z + nz[i] * side * (half + 0.55);
    put(new THREE.CylinderGeometry(0.065, 0.12, H, 10), new THREE.Vector3(bx, r.y + H / 2, bz), new THREE.Quaternion(), steel);
    const cosT = Math.cos(TILT), sinT = Math.sin(TILT);
    const armQ = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * TILT));
    const armC = new THREE.Vector3(bx - nx[i] * side * (ARM / 2) * cosT, r.y + H + (ARM / 2) * sinT - 0.05, bz - nz[i] * side * (ARM / 2) * cosT);
    put(new THREE.BoxGeometry(ARM, 0.12, 0.12), armC, armQ, steel);
    const tip = new THREE.Vector3(bx - nx[i] * side * ARM * cosT, r.y + H + ARM * sinT - 0.05, bz - nz[i] * side * ARM * cosT);
    put(new THREE.BoxGeometry(1.0, 0.18, 0.38), tip.clone().add(new THREE.Vector3(0, -0.18, 0)), qYaw, heads);
    glow.push(tip.x, tip.y - 0.32, tip.z);
  }

  if (steel.length) {
    const poleMesh = new THREE.Mesh(mergeGeometries(steel), new THREE.MeshLambertMaterial({ color: 0x7c8288 }));
    group.add(poleMesh);
    steel.forEach((g) => g.dispose());
  }
  if (heads.length) {
    group.add(new THREE.Mesh(mergeGeometries(heads), new THREE.MeshBasicMaterial({ color: 0xffd890, fog: false })));
    heads.forEach((g) => g.dispose());
  }
  const tex = glowTexture();
  if (glow.length) {
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(glow, 3));
    const halo = new THREE.Points(pg, new THREE.PointsMaterial({
      map: tex, size: 9.5, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xffb855,
    }));
    halo.frustumCulled = false;
    group.add(halo);
  }
  if (poolPos.length) {
    const poolGeo = new THREE.BufferGeometry();
    poolGeo.setAttribute('position', new THREE.Float32BufferAttribute(poolPos, 3));
    poolGeo.setAttribute('uv', new THREE.Float32BufferAttribute(poolUv, 2));
    const pools = new THREE.Mesh(poolGeo, new THREE.MeshBasicMaterial({
      map: tex, color: 0xffaa44, transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));
    pools.frustumCulled = false;
    group.add(pools);
  }
  return group;
}

/** Procedural backlit front texture for retro Japanese mountain-pass vending machines. */
function makeVendingMachineFrontTexture(headerColor: string, glowTint: string): THREE.CanvasTexture {
  const W = 128, H = 256;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;

  // Cabinet frame
  g.fillStyle = headerColor;
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#ffffff';
  g.fillRect(8, 8, W - 16, 22);
  g.fillStyle = headerColor;
  g.font = '900 13px sans-serif';
  g.textAlign = 'center';
  g.fillText('COLD / HOT', W / 2, 23);

  // Backlit drink display window
  g.fillStyle = glowTint;
  g.fillRect(10, 36, W - 20, 128);

  // 3 shelves of colorful miniature drink cans & bottles
  const canColors = ['#e52420', '#1c78d8', '#22a855', '#f29c18', '#ffffff', '#6b3fa0'];
  for (let row = 0; row < 3; row++) {
    const sy = 44 + row * 40;
    g.fillStyle = '#b8cad8';
    g.fillRect(14, sy + 28, W - 28, 5);
    for (let col = 0; col < 6; col++) {
      g.fillStyle = canColors[(row * 3 + col) % canColors.length];
      g.fillRect(16 + col * 16, sy + 4, 12, 22);
      // Little red/blue temperature button light
      g.fillStyle = row === 2 ? '#ff4422' : '#22ccff';
      g.fillRect(18 + col * 16, sy + 29, 8, 3);
    }
  }

  // Coin slot + illuminated pickup flap at bottom
  g.fillStyle = '#18222c';
  g.fillRect(10, 172, W - 20, 72);
  g.fillStyle = '#88e8ff';
  g.fillRect(W - 34, 180, 14, 24);
  g.fillStyle = '#384654';
  g.fillRect(18, 212, W - 36, 24);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Builds View 1: Summit Parking Apron, Cylindrical Steel Water Tower (給水塔), and 3 Glowing Vending Machines (自販機). */
function buildSummitStartArea(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  yaw: Float32Array,
  half: number,
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const UP = new THREE.Vector3(0, 1, 0);

  const placeAt = (idx: number, lat: number, dy: number, fwd = 0): THREE.Vector3 => {
    const k = (idx + n) % n, r = road[k], yw = yaw[k];
    const tx = Math.sin(yw), tz = Math.cos(yw);
    return new THREE.Vector3(r.x + nx[k] * lat + tx * fwd, r.y + dy, r.z + nz[k] * lat + tz * fwd);
  };

  // 1. Observation Parking Lot Apron + Low Perimeter Wall on the left of the start line
  const apronGeo = new THREE.BoxGeometry(11.5, 1.2, 66);
  const apronPos = placeAt(11, -(half + 5.4), -0.58, 0);
  const apronMesh = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({ color: 0x242830, roughness: 0.65 }));
  apronMesh.position.copy(apronPos);
  apronMesh.rotation.y = yaw[11];
  apronMesh.receiveShadow = true;
  group.add(apronMesh);

  const backWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 2.2, 66),
    new THREE.MeshLambertMaterial({ color: 0x525860 }),
  );
  backWall.position.copy(placeAt(11, -(half + 10.8), 0.8, 0));
  backWall.rotation.y = yaw[11];
  group.add(backWall);

  // 2. Iconic Cylindrical Steel Water Tower (給水塔) at sample 18, lat = -(half + 7.8)
  // Proportioned so the entire cylindrical tank, conical cap, and 6-legged truss tower frame cleanly in View 1!
  const wtPos = placeAt(18, -(half + 7.8), 0, 0);
  const wtGroup = new THREE.Group();
  wtGroup.position.copy(wtPos);
  wtGroup.rotation.y = yaw[18];

  const steelMat = new THREE.MeshStandardMaterial({ color: 0x707982, roughness: 0.65, metalness: 0.42 });
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0x88929c,
    emissive: 0x1c242c,
    roughness: 0.55,
    metalness: 0.35,
  });
  const legH = 8.8, tankH = 4.5, tankR = 3.1;

  const tank = new THREE.Mesh(new THREE.CylinderGeometry(tankR, tankR, tankH, 24), tankMat);
  tank.position.y = legH + tankH / 2;
  const cone = new THREE.Mesh(new THREE.ConeGeometry(tankR + 0.18, 1.25, 24), steelMat);
  cone.position.y = legH + tankH + 0.62;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(tankR + 0.55, tankR + 0.55, 0.22, 24), steelMat);
  ring.position.y = legH + 0.1;
  wtGroup.add(tank, cone, ring);

  const trussParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = new THREE.CylinderGeometry(0.18, 0.24, legH, 8);
    g.translate(Math.cos(a) * (tankR - 0.35), legH / 2, Math.sin(a) * (tankR - 0.35));
    trussParts.push(g);
  }
  for (const h of [2.9, 5.8, 8.4]) {
    const rStrut = new THREE.TorusGeometry(tankR - 0.35, 0.11, 6, 18);
    rStrut.rotateX(Math.PI / 2);
    rStrut.translate(0, h, 0);
    trussParts.push(rStrut);
  }
  wtGroup.add(new THREE.Mesh(mergeGeometries(trussParts), steelMat));
  group.add(wtGroup);

  // 3. 3 Retro Glowing Vending Machines (自販機コーナー) facing the road & starting car!
  const vmBasePos = placeAt(9, -(half + 4.1), 0, 0);
  // Rotate by yaw - 0.65*PI so the front (+Z) of the vending machines faces toward the road (+nx,+nz) and starting car!
  const vmYaw = yaw[9] - Math.PI * 0.65;
  const vmConfigs = [
    { body: 0xd8ece8, header: '#d42020', glow: '#e8feff' },
    { body: 0x1888b8, header: '#1468b8', glow: '#b8f8ff' },
    { body: 0x1c48a8, header: '#183888', glow: '#cceeff' },
  ];
  vmConfigs.forEach((vc, idx) => {
    const offsetAlong = (idx - 1) * 1.55;
    const p = placeAt(9, -(half + 4.1), 0, offsetAlong);
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.26, 2.1, 0.84),
      new THREE.MeshLambertMaterial({ color: vc.body }),
    );
    body.position.copy(p).add(new THREE.Vector3(0, 1.05, 0));
    body.rotation.y = vmYaw;

    const frontTex = makeVendingMachineFrontTexture(vc.header, vc.glow);
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.16, 1.98),
      new THREE.MeshBasicMaterial({ map: frontTex, fog: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    const q = new THREE.Quaternion().setFromAxisAngle(UP, vmYaw);
    panel.position.copy(p).add(new THREE.Vector3(0, 1.05, 0)).add(new THREE.Vector3(0, 0, 0.44).applyQuaternion(q));
    panel.rotation.y = vmYaw;
    group.add(body, panel);
  });

  const poolTex = glowTexture();
  const vmPool = new THREE.Mesh(
    new THREE.PlaneGeometry(9.0, 7.5),
    new THREE.MeshBasicMaterial({
      map: poolTex,
      color: 0x44e8ff,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    }),
  );
  vmPool.rotation.x = -Math.PI / 2;
  vmPool.position.copy(vmBasePos).add(new THREE.Vector3(nx[10] * 2.4, 0.08, nz[10] * 2.4));
  group.add(vmPool);

  for (const d of [2.4, 3.1]) {
    const bin = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.95, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x7c8288 }),
    );
    bin.position.copy(placeAt(10, -(half + 4.0), 0.48, d));
    bin.rotation.y = vmYaw;
    group.add(bin);
  }

  return group;
}

/** Builds View 2 Roadside Props: Orange Convex Curve Mirrors, Yellow Warning Signs, Red/White Chevrons & Stone Jizo. */
function buildTougeRoadsideProps(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  yaw: Float32Array,
  zoneOf: number[],
  half: number,
  runs: CornerRun[],
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const UP = new THREE.Vector3(0, 1, 0);

  const yellowPoleMat = new THREE.MeshLambertMaterial({ color: 0xf0b400 });
  const orangeHoodMat = new THREE.MeshLambertMaterial({ color: 0xff5a00 });
  const mirrorFaceMat = new THREE.MeshStandardMaterial({ color: 0xd8e8f8, roughness: 0.08, metalness: 0.85 });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7c807a });
  const warnTex = makeYellowWarningSignTexture();
  const warnMat = new THREE.MeshBasicMaterial({ map: warnTex, alphaTest: 0.4, side: THREE.DoubleSide });
  const chevLeftMat = new THREE.MeshBasicMaterial({ map: makeRedWhiteChevronTexture(true), side: THREE.DoubleSide });
  const chevRightMat = new THREE.MeshBasicMaterial({ map: makeRedWhiteChevronTexture(false), side: THREE.DoubleSide });

  const yellowPoles: THREE.BufferGeometry[] = [];
  const orangeHoods: THREE.BufferGeometry[] = [];
  const mirrorFaces: THREE.BufferGeometry[] = [];
  const jizoStones: THREE.BufferGeometry[] = [];
  const warnSigns: THREE.BufferGeometry[] = [];
  const chevLeftBoards: THREE.BufferGeometry[] = [];
  const chevRightBoards: THREE.BufferGeometry[] = [];

  for (const run of runs) {
    const leftTurn = run.turnSum > 0;
    const outSide = leftTurn ? 1 : -1;
    const inSide = -outSide;

    // 1. Orange Convex Curve Mirror (オレンジのカーブミラー) at entry & apex on the outside of the bend
    for (const idx of [Math.max(0, run.a + 2), run.peak]) {
      const r = road[idx], yw = yaw[idx];
      const lat = outSide * (half + 0.65);
      const px = r.x + nx[idx] * lat, pz = r.z + nz[idx] * lat;

      const pole = new THREE.CylinderGeometry(0.055, 0.065, 3.4, 8);
      pole.translate(px, r.y + 1.7, pz);
      yellowPoles.push(pole);

      const mYaw = yw + Math.PI - outSide * 0.35;
      const q = new THREE.Quaternion().setFromAxisAngle(UP, mYaw);
      const hood = new THREE.CylinderGeometry(0.56, 0.56, 0.16, 16);
      hood.rotateX(Math.PI / 2);
      hood.applyQuaternion(q);
      hood.translate(px, r.y + 3.15, pz);
      orangeHoods.push(hood);

      const face = new THREE.CylinderGeometry(0.48, 0.48, 0.18, 16);
      face.rotateX(Math.PI / 2);
      face.applyQuaternion(q);
      face.translate(px, r.y + 3.15, pz);
      mirrorFaces.push(face);
    }

    // 2. Yellow Diamond Japanese Warning Sign ("急カーブ") before the corner
    const warnIdx = Math.max(4, run.a - 7);
    const rw = road[warnIdx], wYaw = yaw[warnIdx];
    const wLat = -(half + 0.65);
    const wx = rw.x + nx[warnIdx] * wLat, wz = rw.z + nz[warnIdx] * wLat;
    const wPole = new THREE.CylinderGeometry(0.045, 0.05, 2.5, 8);
    wPole.translate(wx, rw.y + 1.25, wz);
    yellowPoles.push(wPole);

    const diamondGeo = new THREE.PlaneGeometry(1.15, 1.15);
    diamondGeo.rotateY(wYaw + Math.PI);
    diamondGeo.translate(wx, rw.y + 2.25, wz);
    warnSigns.push(diamondGeo);

    // 3. Red-and-White Chevron Boards + Inner Apex Stone Jizo Statue on sharp corners
    if (run.maxC > 0.15) {
      const count = 4;
      for (let k = 0; k < count; k++) {
        const idx = Math.round(run.a + ((run.b - run.a) * (k + 0.45)) / count);
        const rc = road[idx], cYaw = yaw[idx];
        const cLat = outSide * (half + 0.52);
        const cx = rc.x + nx[idx] * cLat, cz = rc.z + nz[idx] * cLat;
        const boardGeo = new THREE.PlaneGeometry(1.45, 1.05);
        boardGeo.rotateY(cYaw + Math.PI);
        boardGeo.translate(cx, rc.y + 1.48, cz);
        (leftTurn ? chevLeftBoards : chevRightBoards).push(boardGeo);
      }

      const rp = road[run.peak];
      const jLat = inSide * (half + 0.85);
      const jx = rp.x + nx[run.peak] * jLat, jz = rp.z + nz[run.peak] * jLat;
      const plinth = new THREE.BoxGeometry(0.85, 0.65, 0.85);
      plinth.translate(jx, rp.y + 0.32, jz);
      const body = new THREE.CylinderGeometry(0.24, 0.32, 0.95, 10);
      body.translate(jx, rp.y + 1.1, jz);
      const head = new THREE.SphereGeometry(0.22, 10, 8);
      head.translate(jx, rp.y + 1.72, jz);
      jizoStones.push(plinth, body, head);
    }
  }

  if (yellowPoles.length) group.add(new THREE.Mesh(mergeGeometries(yellowPoles), yellowPoleMat));
  if (orangeHoods.length) group.add(new THREE.Mesh(mergeGeometries(orangeHoods), orangeHoodMat));
  if (mirrorFaces.length) group.add(new THREE.Mesh(mergeGeometries(mirrorFaces), mirrorFaceMat));
  if (jizoStones.length) group.add(new THREE.Mesh(mergeGeometries(jizoStones), stoneMat));
  if (warnSigns.length) group.add(new THREE.Mesh(mergeGeometries(warnSigns), warnMat));
  if (chevLeftBoards.length) group.add(new THREE.Mesh(mergeGeometries(chevLeftBoards), chevLeftMat));
  if (chevRightBoards.length) group.add(new THREE.Mesh(mergeGeometries(chevRightBoards), chevRightMat));

  const delinParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i += 8) {
    if (zoneOf[i] > 2) continue;
    const r = road[i];
    const lat = half + 0.22;
    const g = new THREE.BoxGeometry(0.14, 0.28, 0.14);
    g.translate(r.x + nx[i] * lat, r.y + 1.05, r.z + nz[i] * lat);
    delinParts.push(g);
  }
  if (delinParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(delinParts), new THREE.MeshBasicMaterial({ color: 0xff6611, fog: false })));
  }

  return group;
}

/** Builds View 3 Part A: Cliffside Concrete Snow Shed / Rock Shed Gallery (スノーシェッド・洞門 + Mountain Cover & Portal Frames). */
function buildSnowShed(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  yaw: Float32Array,
  zoneOf: number[],
  half: number,
  sweepWhere: (segments: Segment[], pred: (k: number) => boolean, repeatMetres?: number, withUv?: boolean, useSmoothedNormal?: boolean) => THREE.BufferGeometry,
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const inShed = (k: number): boolean => zoneOf[k] === 3;

  // Inner concrete mountain wall (-lat) + sloped thick roof slab embedding into the mountain slope (-lat - 5m) + valley fascia beam (+lat)
  const H = 6.2;
  const shedGeo = sweepWhere(
    [
      [[-half - 0.5, -0.3], [-half - 0.5, H + 1.4]],
      [[-half - 0.5, H + 1.4], [-half - 5.5, H + 5.5]],
      [[-half - 0.5, H + 1.4], [half + 1.1, H]],
      [[half + 1.1, H], [half + 1.1, H - 1.1]],
      [[half + 1.1, H - 1.1], [-half - 0.5, H - 0.4]],
    ],
    inShed,
    12,
    false,
    true,
  );
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x62666c, roughness: 0.9, side: THREE.DoubleSide });
  const shedMesh = new THREE.Mesh(shedGeo, concreteMat);
  shedMesh.castShadow = true;
  shedMesh.receiveShadow = true;
  shedMesh.frustumCulled = false;
  group.add(shedMesh);

  // Forested cliff overburden slope behind & above the Snow Shed roof (seals into the 3D mountain terrain!)
  const shedCliffGeo = sweepWhere(
    [
      [[-half - 5.2, H + 5.2], [-half - 9.5, H + 9.2]],
      [[-half - 9.5, H + 9.2], [-half - 16.0, -5.0]],
    ],
    inShed,
    16,
    false,
    true,
  );
  const shedCliffMesh = new THREE.Mesh(
    shedCliffGeo,
    new THREE.MeshLambertMaterial({ color: 0x16241b, side: THREE.DoubleSide }),
  );
  shedCliffMesh.frustumCulled = false;
  group.add(shedCliffMesh);

  // Yellow hazard stripe band along the inner Snow Shed wall
  const stripeGeo = sweepWhere(
    [[[-half - 0.44, 1.2], [-half - 0.44, 1.75]]],
    inShed,
    4,
    false,
    true,
  );
  group.add(new THREE.Mesh(stripeGeo, new THREE.MeshBasicMaterial({ color: 0xe5a800, side: THREE.DoubleSide })));

  // Row of heavy rectangular concrete columns along the valley side (+lat) + Portal Frames at entry & exit
  const cols: THREE.BufferGeometry[] = [];
  const lamps: THREE.BufferGeometry[] = [];
  const UP = new THREE.Vector3(0, 1, 0);
  const shedIndices: number[] = [];
  for (let i = 0; i < n; i++) if (inShed(i)) shedIndices.push(i);

  for (let k = 0; k < shedIndices.length; k += 4) {
    const i = shedIndices[k];
    const r = road[i], q = new THREE.Quaternion().setFromAxisAngle(UP, yaw[i]);
    const lat = half + 0.72;
    const c = new THREE.BoxGeometry(0.78, H - 0.3, 0.95);
    c.applyQuaternion(q);
    c.translate(r.x + nx[i] * lat, r.y + (H - 0.3) / 2, r.z + nz[i] * lat);
    cols.push(c);

    const l = new THREE.BoxGeometry(1.6, 0.14, 0.45);
    l.applyQuaternion(q);
    l.translate(r.x, r.y + H - 0.42, r.z);
    lamps.push(l);
  }

  // Solid Portal Arch Frames at the entrance and exit of the Snow Shed so the gallery never starts abruptly in mid-air
  for (const endIdx of [shedIndices[0], shedIndices[shedIndices.length - 1]]) {
    if (endIdx === undefined) continue;
    const r = road[endIdx], q = new THREE.Quaternion().setFromAxisAngle(UP, yaw[endIdx]);
    const topBeam = new THREE.BoxGeometry((half + 1.2) * 2, 1.8, 1.8);
    topBeam.applyQuaternion(q);
    topBeam.translate(r.x, r.y + H + 0.4, r.z);
    const leftWall = new THREE.BoxGeometry(2.6, H + 2.2, 1.8);
    leftWall.applyQuaternion(q);
    leftWall.translate(r.x - nx[endIdx] * (half + 1.4), r.y + (H + 2.2) / 2 - 0.2, r.z - nz[endIdx] * (half + 1.4));
    cols.push(topBeam, leftWall);
  }

  if (cols.length) {
    const colMesh = new THREE.Mesh(mergeGeometries(cols), concreteMat);
    colMesh.castShadow = true;
    colMesh.receiveShadow = true;
    group.add(colMesh);
  }
  if (lamps.length) {
    group.add(new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: 0xffdfa0, fog: false })));
  }

  return group;
}

/** Builds View 3 Part B: Vermilion Red Steel Arch Bridge (赤いアーチ鉄橋) & Panoramic Onsen Town in the Gorge Below. */
function buildRedArchBridgeAndOnsenTown(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  yaw: Float32Array,
  zoneOf: number[],
  half: number,
  sweepWhere: (segments: Segment[], pred: (k: number) => boolean, repeatMetres?: number, withUv?: boolean) => THREE.BufferGeometry,
  sampleTerrainY: (x: number, z: number) => number,
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const inBridge = (k: number): boolean => zoneOf[k] === 4;

  const indices: number[] = [];
  for (let i = 0; i < n; i++) if (inBridge(i)) indices.push(i);

  const redSteelMat = new THREE.MeshStandardMaterial({ color: 0xb8281e, roughness: 0.55, metalness: 0.45, side: THREE.DoubleSide });

  // 1. Vermilion-Red Bridge Deck Girders & Parapet Railings
  const girderGeo = sweepWhere(
    [
      [[-half - 0.9, 0.2], [-half - 0.9, -2.2]],
      [[-half - 0.9, -2.2], [half + 0.9, -2.2]],
      [[half + 0.9, -2.2], [half + 0.9, 0.2]],
      [[-half - 0.4, 0], [-half - 0.4, 1.25]],
      [[half + 0.4, 0], [half + 0.4, 1.25]],
    ],
    inBridge,
    16,
    false,
  );
  const girderMesh = new THREE.Mesh(girderGeo, redSteelMat);
  girderMesh.frustumCulled = false;
  group.add(girderMesh);

  // 2. Monumental Smooth Parabolic Through-Arch Bridge Superstructure + Lower Arch Ribs
  if (indices.length > 4) {
    const m = indices.length;
    const archParts: THREE.BufferGeometry[] = [];
    const UP = new THREE.Vector3(0, 1, 0);
    const RIGHT = new THREE.Vector3(1, 0, 0);

    const archHeightAt = (k: number): { upper: number; lower: number } => {
      const clamped = Math.max(0, Math.min(m - 1, k));
      const r = road[indices[clamped]];
      const u = clamped / (m - 1);
      const archCurve = Math.max(0, 1 - 4 * (u - 0.5) * (u - 0.5));
      return {
        upper: r.y - 0.6 + 16.5 * archCurve,
        lower: r.y - 23.0 + 21.5 * archCurve,
      };
    };

    for (let k = 0; k < m; k += 2) {
      const idx = indices[k], r = road[idx];
      const kPrev = Math.max(0, k - 2), kNext = Math.min(m - 1, k + 2);
      const rPrev = road[indices[kPrev]], rNext = road[indices[kNext]];
      const ds = Math.hypot(rNext.x - rPrev.x, rNext.z - rPrev.z) || 4.0;
      const hCur = archHeightAt(k), hPrev = archHeightAt(kPrev), hNext = archHeightAt(kNext);

      const pitchUpper = Math.atan2(hNext.upper - hPrev.upper, ds);
      const pitchLower = Math.atan2(hNext.lower - hPrev.lower, ds);

      const qYaw = new THREE.Quaternion().setFromAxisAngle(UP, yaw[idx]);
      const qUpper = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(RIGHT, -pitchUpper));
      const qLower = qYaw.clone().multiply(new THREE.Quaternion().setFromAxisAngle(RIGHT, -pitchLower));

      for (const side of [-1, 1]) {
        const lat = side * (half + 0.72);
        const ax = r.x + nx[idx] * lat, az = r.z + nz[idx] * lat;

        const rib = new THREE.BoxGeometry(0.92, 1.15, 4.8);
        rib.applyQuaternion(qUpper);
        rib.translate(ax, hCur.upper, az);
        archParts.push(rib);

        const hangerH = hCur.upper - (r.y + 0.2);
        if (k % 4 === 0 && hangerH > 1.2) {
          const hanger = new THREE.BoxGeometry(0.38, hangerH, 0.38);
          hanger.applyQuaternion(qYaw);
          hanger.translate(ax, r.y + 0.2 + hangerH / 2, az);
          archParts.push(hanger);
        }

        const lowRib = new THREE.BoxGeometry(1.05, 1.25, 4.8);
        lowRib.applyQuaternion(qLower);
        lowRib.translate(ax, hCur.lower, az);
        archParts.push(lowRib);
      }

      if (k % 4 === 0 && hCur.upper - r.y > 5.8) {
        const spanW = half * 2 + 1.5;
        const strut = new THREE.BoxGeometry(spanW, 0.68, 0.78);
        strut.applyQuaternion(qYaw);
        strut.translate(r.x, hCur.upper, r.z);
        archParts.push(strut);
      }
    }
    group.add(new THREE.Mesh(mergeGeometries(archParts), redSteelMat));
  }

  // 3. Onsen Resort Town in the Gorge Flanking Both Sides of the Bridge
  // Every Ryokan building sits cleanly ON TOP of `sampleTerrainY(bx, bz)` with a stone plinth, warm shoji facade, and Japanese gable roof!
  const onsenGroup = new THREE.Group();
  const rand = mulberry32(888);
  const plinths: THREE.BufferGeometry[] = [];
  const woodWalls: THREE.BufferGeometry[] = [];
  const roofs: THREE.BufferGeometry[] = [];
  const eaveGlows: THREE.BufferGeometry[] = [];
  const litWindows: THREE.BufferGeometry[] = [];
  const lanternPts: number[] = [];
  const steamPts: number[] = [];
  const UP = new THREE.Vector3(0, 1, 0);

  // Procedural multi-story Ryokan timber & glowing shoji window lattice texture
  const ryokanCanvas = document.createElement('canvas');
  ryokanCanvas.width = 256;
  ryokanCanvas.height = 256;
  const rg = ryokanCanvas.getContext('2d')!;
  rg.fillStyle = '#2d1c12';
  rg.fillRect(0, 0, 256, 256);
  for (let fl = 0; fl < 3; fl++) {
    const fy = 14 + fl * 82;
    rg.fillStyle = '#1b100a';
    rg.fillRect(0, fy - 8, 256, 8);
    for (let col = 0; col < 6; col++) {
      const wx = 10 + col * 40;
      rg.fillStyle = (fl + col) % 5 === 0 ? '#ff9933' : '#ffcf70';
      rg.fillRect(wx, fy + 4, 30, 54);
      rg.strokeStyle = '#3a2214';
      rg.lineWidth = 3;
      rg.strokeRect(wx, fy + 4, 30, 54);
      rg.beginPath();
      rg.moveTo(wx + 15, fy + 4);
      rg.lineTo(wx + 15, fy + 58);
      rg.moveTo(wx, fy + 31);
      rg.lineTo(wx + 30, fy + 31);
      rg.stroke();
    }
  }
  const ryokanTex = new THREE.CanvasTexture(ryokanCanvas);
  ryokanTex.wrapS = THREE.RepeatWrapping;
  ryokanTex.wrapT = THREE.RepeatWrapping;
  ryokanTex.colorSpace = THREE.SRGBColorSpace;

  const neonTexts = [
    { text: '湯元温泉', bg: '#3a1208', fg: '#ffbb44' },
    { text: '秘湯旅館', bg: '#2c0822', fg: '#ff44aa' },
    { text: '大浴場', bg: '#082236', fg: '#44eeff' },
    { text: '月影温泉', bg: '#380a0a', fg: '#ff5533' },
    { text: '露天風呂', bg: '#281805', fg: '#ffcc33' },
  ];
  const neonMats = neonTexts.map((ns) => new THREE.MeshBasicMaterial({ map: makeOnsenNeonTexture(ns.text, ns.bg, ns.fg), fog: false, toneMapped: false }));
  const neonGeos: THREE.BufferGeometry[][] = neonTexts.map(() => []);

  let bCount = 0;
  for (let k = 6; k < indices.length - 4; k += 5) {
    const idx = indices[k], r = road[idx], yw = yaw[idx], q = new THREE.Quaternion().setFromAxisAngle(UP, yw);
    for (const side of [-1, 1]) {
      for (let tier = 0; tier < 2; tier++) {
        bCount++;
        const lat = side * (half + 16.5 + tier * 13.5 + rand() * 3.5);
        const bx = r.x + nx[idx] * lat;
        const bz = r.z + nz[idx] * lat;
        const bw = 9.5 + rand() * 5.0, bd = 10.0 + rand() * 4.5, bh = 8.5 + (bCount % 3) * 2.8;
        const groundY = sampleTerrainY(bx, bz);
        // Elevate Ryokan buildings so their warm shoji facades and tiered roofs frame both sides of the bridge
        const by = Math.max(groundY + 0.5, r.y - 9.0 + tier * 5.5);

        const plinth = new THREE.BoxGeometry(bw + 0.8, 9.0, bd + 0.8);
        plinth.applyQuaternion(q);
        plinth.translate(bx, by - 4.5, bz);
        plinths.push(plinth);

        const wall = new THREE.BoxGeometry(bw, bh, bd);
        wall.applyQuaternion(q);
        wall.translate(bx, by + bh / 2, bz);
        woodWalls.push(wall);

        // Traditional Japanese overhanging eave + pitched kawara gable roof ridge
        const eave = new THREE.BoxGeometry(bw + 2.4, 0.8, bd + 2.4);
        eave.applyQuaternion(q);
        eave.translate(bx, by + bh + 0.4, bz);
        roofs.push(eave);

        const eaveGlow = new THREE.BoxGeometry(bw + 1.6, 0.25, bd + 1.6);
        eaveGlow.applyQuaternion(q);
        eaveGlow.translate(bx, by + bh - 0.05, bz);
        eaveGlows.push(eaveGlow);

        const upperTier = new THREE.BoxGeometry(bw * 0.72, 1.8, bd * 0.82);
        upperTier.applyQuaternion(q);
        upperTier.translate(bx, by + bh + 1.55, bz);
        roofs.push(upperTier);

        const ridgeCap = new THREE.BoxGeometry(bw * 0.84, 0.55, bd * 0.92);
        ridgeCap.applyQuaternion(q);
        ridgeCap.translate(bx, by + bh + 2.6, bz);
        roofs.push(ridgeCap);

        for (let fl = 0; fl < 2; fl++) {
          const win = new THREE.BoxGeometry(bw + 0.24, 1.4, bd + 0.24);
          win.applyQuaternion(q);
          win.translate(bx, by + 2.2 + fl * 3.4, bz);
          litWindows.push(win);
        }

        if (tier === 0 && bCount % 2 === 0) {
          const signGeo = new THREE.BoxGeometry(2.3, 8.2, 2.3);
          signGeo.rotateY(yw);
          signGeo.translate(bx - nx[idx] * side * (bw * 0.48), by + bh * 0.65, bz - nz[idx] * side * (bw * 0.48));
          neonGeos[bCount % neonMats.length].push(signGeo);
        }

        for (let l = 0; l < 3; l++) {
          lanternPts.push(bx - nx[idx] * side * 5 + (rand() - 0.5) * 7, by + 3.0 + rand() * 2, bz - nz[idx] * side * 5 + (rand() - 0.5) * 7);
        }
        if (bCount % 2 === 0) {
          for (let s = 0; s < 4; s++) {
            steamPts.push(bx + (rand() - 0.5) * 6, by + bh + 2.2 + s * 2.6, bz + (rand() - 0.5) * 6);
          }
        }
      }
    }
  }

  neonGeos.forEach((geos, mIdx) => {
    if (geos.length) onsenGroup.add(new THREE.Mesh(mergeGeometries(geos), neonMats[mIdx]));
  });

  onsenGroup.add(
    new THREE.Mesh(mergeGeometries(plinths), new THREE.MeshLambertMaterial({ color: 0x444a52, emissive: 0x101216 })),
    new THREE.Mesh(
      mergeGeometries(woodWalls),
      new THREE.MeshStandardMaterial({
        map: ryokanTex,
        emissiveMap: ryokanTex,
        emissive: new THREE.Color(0xffaa44),
        emissiveIntensity: 0.75,
        roughness: 0.75,
      }),
    ),
    new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshLambertMaterial({ color: 0x364252, emissive: 0x121822 })),
    new THREE.Mesh(mergeGeometries(eaveGlows), new THREE.MeshBasicMaterial({ color: 0xffbb55, fog: false })),
    new THREE.Mesh(mergeGeometries(litWindows), new THREE.MeshBasicMaterial({ map: ryokanTex, color: 0xd9ad57, fog: false })),
  );

  const gTex = glowTexture();
  const lanternGeo = new THREE.BufferGeometry();
  lanternGeo.setAttribute('position', new THREE.Float32BufferAttribute(lanternPts, 3));
  onsenGroup.add(
    new THREE.Points(
      lanternGeo,
      new THREE.PointsMaterial({
        map: gTex,
        size: 6.5,
        sizeAttenuation: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
        color: 0xff9933,
      }),
    ),
  );

  const steamGeo = new THREE.BufferGeometry();
  steamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(steamPts), 3));
  onsenGroup.add(
    new THREE.Points(
      steamGeo,
      new THREE.PointsMaterial({
        map: gTex,
        size: 22,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        color: 0xdde6f2,
      }),
    ),
  );

  group.add(onsenGroup);
  return group;
}

/**
 * Builds View 4: High-Speed Mountain Bypass Tunnel + Monumental Concrete Mountain Portals (坑門・アーチ巻き立て・扁額・ウイング擁壁・山体尾根).
 * - Uses an exact `THREE.Shape` + `THREE.ExtrudeGeometry` portal collar matching the 8-vertex tunnel vault opening with zero intrusion!
 */
function buildMountainBypassTunnel(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  yaw: Float32Array,
  zoneOf: number[],
  half: number,
  sweepWhere: (segments: Segment[], pred: (k: number) => boolean, repeatMetres?: number, withUv?: boolean, useSmoothedNormal?: boolean) => THREE.BufferGeometry,
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const inTunnel = (k: number): boolean => zoneOf[k] === 5;
  const iStart = zoneOf.findIndex((z) => z === 5);
  let iEnd = n - 1;
  for (let i = n - 1; i >= 0; i--) {
    if (zoneOf[i] === 5) { iEnd = i; break; }
  }
  // Sweep tunnel interior strictly inside [iStart..iEnd] so no segment ever sticks out in front of the concrete portal collar!
  const inTunnelInterior = (k: number): boolean => k >= iStart + 1 && k <= iEnd - 1;

  // 1. Lower White Ceramic Tiled Sidewalls + Concrete Curbs
  const tileTex = makeTunnelTileTexture();
  const W = half + 0.55;
  const tileWallsGeo = sweepWhere(
    [
      [[-half, 0], [-W, 0.35]],
      [[-W, 0.35], [-W, 3.5]],
      [[half, 0], [W, 0.35]],
      [[W, 0.35], [W, 3.5]],
    ],
    inTunnelInterior,
    10,
    true,
    true,
  );
  const tileWallsMesh = new THREE.Mesh(
    tileWallsGeo,
    new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.55, metalness: 0.08, side: THREE.DoubleSide }),
  );
  tileWallsMesh.receiveShadow = true;
  tileWallsMesh.frustumCulled = false;

  // 2. Arched Dark Concrete Tunnel Vault Ceiling (3.5m..7.1m crown)
  const vaultGeo = sweepWhere(
    [
      [[-W, 3.5], [-W + 1.3, 5.7]],
      [[-W + 1.3, 5.7], [-2.4, 7.1]],
      [[-2.4, 7.1], [2.4, 7.1]],
      [[2.4, 7.1], [W - 1.3, 5.7]],
      [[W - 1.3, 5.7], [W, 3.5]],
    ],
    inTunnelInterior,
    16,
    false,
    true,
  );
  const vaultMesh = new THREE.Mesh(
    vaultGeo,
    new THREE.MeshStandardMaterial({ color: 0x3b3d42, roughness: 0.92, side: THREE.DoubleSide }),
  );
  vaultMesh.frustumCulled = false;

  // 3. Continuous Forested Mountain Ridge Overburden burying the entire Tunnel (strictly above the 14.5m portal lintel!)
  const tunnelRidgeGeo = sweepWhere(
    [
      [[-38.0, -8.0], [-16.5, 14.2]],
      [[-16.5, 14.2], [-5.5, 25.0]],
      [[-5.5, 25.0], [5.5, 25.0]],
      [[5.5, 25.0], [16.5, 14.2]],
      [[16.5, 14.2], [38.0, -8.0]],
    ],
    inTunnelInterior,
    16,
    false,
    true,
  );
  const mountainCapMat = new THREE.MeshLambertMaterial({ color: 0x16241b, side: THREE.DoubleSide });
  const tunnelRidgeMesh = new THREE.Mesh(tunnelRidgeGeo, mountainCapMat);
  tunnelRidgeMesh.frustumCulled = false;

  // 4. Twin Continuous Rows of Glowing Amber/Orange Sodium Tunnel Lights (inset by 2 samples from portals so they never poke out!)
  const stripLightsGeo = sweepWhere(
    [
      [[-W + 1.15, 5.25], [-W + 1.45, 5.55]],
      [[W - 1.45, 5.55], [W - 1.15, 5.25]],
    ],
    (k) => k >= iStart + 2 && k <= iEnd - 2,
    16,
    false,
    true,
  );
  const stripLightsMesh = new THREE.Mesh(
    stripLightsGeo,
    new THREE.MeshBasicMaterial({ color: 0xffaa22, fog: false, toneMapped: false, side: THREE.DoubleSide }),
  );
  stripLightsMesh.frustumCulled = false;
  group.add(tileWallsMesh, vaultMesh, tunnelRidgeMesh, stripLightsMesh);

  // 5. Monumental Concrete Tunnel Portals ( exact ExtrudeGeometry arch cutout + protruding arch ring + 扁額「月影第一隧道」 )
  const portalConcreteMat = new THREE.MeshStandardMaterial({
    color: 0x7e858e,
    emissive: 0x1e2228,
    roughness: 0.82,
    metalness: 0.12,
  });
  const archRingMat = new THREE.MeshStandardMaterial({
    color: 0x9aa2ad,
    emissive: 0x2b3038,
    roughness: 0.75,
    metalness: 0.15,
  });
  const portalSignMat = new THREE.MeshBasicMaterial({ map: makeTunnelPortalSignTexture('月影第一隧道', 'TSUKIKAGE BYPASS TUNNEL — 380m'), fog: false });
  const UP = new THREE.Vector3(0, 1, 0);

  // Explicit 7-segment convex arch-frame prism builder between `innerPts` (exact 8-vertex tunnel vault contour)
  // and `outerPts` from z0 to z1 — guarantees 100% open tunnel mouth with zero triangles ever crossing inside `innerPts`!
  const buildArchFrameGeo = (
    innerPts: [number, number][],
    outerPts: [number, number][],
    z0: number,
    z1: number,
  ): THREE.BufferGeometry => {
    const pos: number[] = [];
    const pushQuad = (
      ax: number, ay: number, az: number,
      bx: number, by: number, bz: number,
      cx: number, cy: number, cz: number,
      dx: number, dy: number, dz: number,
    ) => {
      pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
      pos.push(ax, ay, az, cx, cy, cz, dx, dy, dz);
    };
    for (let m = 0; m < innerPts.length - 1; m++) {
      const [ix0, iy0] = innerPts[m], [ix1, iy1] = innerPts[m + 1];
      const [ox0, oy0] = outerPts[m], [ox1, oy1] = outerPts[m + 1];
      // Front face (z0) & Back face (z1)
      pushQuad(ix0, iy0, z0, ox0, oy0, z0, ox1, oy1, z0, ix1, iy1, z0);
      pushQuad(ix1, iy1, z1, ox1, oy1, z1, ox0, oy0, z1, ix0, iy0, z1);
      // Inner arch reveal & outer perimeter wall
      pushQuad(ix0, iy0, z1, ix0, iy0, z0, ix1, iy1, z0, ix1, iy1, z1);
      pushQuad(ox1, oy1, z1, ox1, oy1, z0, ox0, oy0, z0, ox0, oy0, z1);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.computeVertexNormals();
    return geo;
  };

  const innerArchPts: [number, number][] = [
    [-W, -0.6],
    [-W, 3.5],
    [-W + 1.3, 5.7],
    [-2.4, 7.1],
    [2.4, 7.1],
    [W - 1.3, 5.7],
    [W, 3.5],
    [W, -0.6],
  ];
  const outerWallPts: [number, number][] = [
    [-16.2, -0.6],
    [-16.2, 6.0],
    [-16.2, 14.5],
    [-5.5, 14.5],
    [5.5, 14.5],
    [16.2, 14.5],
    [16.2, 6.0],
    [16.2, -0.6],
  ];
  const outerRingPts: [number, number][] = [
    [-W - 1.0, -0.5],
    [-W - 1.0, 3.7],
    [-W + 0.55, 6.35],
    [-2.65, 8.05],
    [2.65, 8.05],
    [W - 0.55, 6.35],
    [W + 1.0, 3.7],
    [W + 1.0, -0.5],
  ];

  const portalWallGeo = buildArchFrameGeo(innerArchPts, outerWallPts, -2.4, 3.0);
  const archRingGeo = buildArchFrameGeo(innerArchPts, outerRingPts, -3.05, -2.4);

  for (const [portalIdx, isEntry] of [[iStart, true], [iEnd, false]] as const) {
    if (portalIdx < 0) continue;
    const r = road[portalIdx];
    const yw = yaw[portalIdx] + (isEntry ? 0 : Math.PI);
    const pGroup = new THREE.Group();
    pGroup.position.copy(r);
    pGroup.rotation.y = yw;

    const wallMesh = new THREE.Mesh(portalWallGeo, portalConcreteMat);
    pGroup.add(wallMesh);

    const ringMesh = new THREE.Mesh(archRingGeo, archRingMat);
    pGroup.add(ringMesh);

    for (const side of [-1, 1]) {
      // Flared 35-deg concrete wing retaining walls (ウイング擁壁) embedding into the mountainside
      const wing = new THREE.Mesh(new THREE.BoxGeometry(14.0, 12.5, 2.6), portalConcreteMat);
      wing.position.set(side * (W + 10.5), 4.8, -3.6);
      wing.rotation.y = -side * 0.52;
      pGroup.add(wing);

      // Wide forested mountain flank behind each wing wall (eliminates any sky gap beside the portal!)
      const flank = new THREE.Mesh(new THREE.BoxGeometry(26.0, 26.0, 16.0), mountainCapMat);
      flank.position.set(side * (W + 20.5), 8.5, 4.5);
      flank.rotation.z = -side * 0.28;
      pGroup.add(flank);
    }

    // Decorative concrete portal cornice ledge at top of headwall
    const cornice = new THREE.Mesh(new THREE.BoxGeometry(33.6, 1.0, 6.2), archRingMat);
    cornice.position.set(0, 14.5, 0.2);
    pGroup.add(cornice);

    // Traditional Japanese Tunnel Nameplate (扁額「月影第一隧道」) resting cleanly above the 8.05m protruding arch collar
    const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.72), portalSignMat);
    signBoard.position.set(0, 8.95, -2.52);
    signBoard.rotation.y = Math.PI;
    pGroup.add(signBoard);

    // Broad forested mountain headwall sitting strictly ON TOP of the 14.5m cornice (y = 14.4m .. 30.4m)
    const headwallCap = new THREE.Mesh(new THREE.BoxGeometry(56.0, 16.0, 14.0), mountainCapMat);
    headwallCap.position.set(0, 22.4, 4.8);
    pGroup.add(headwallCap);

    group.add(pGroup);
  }

  // 6. Ceiling Twin Jet Fan Turbines, Green Emergency Exit Signs & Sidewall Orange Reflectors
  const jetFans: THREE.BufferGeometry[] = [];
  const reflectors: THREE.BufferGeometry[] = [];
  const exitSigns: THREE.BufferGeometry[] = [];
  const exitMat = new THREE.MeshBasicMaterial({ map: makeEmergencyExitTexture(), fog: false, toneMapped: false, side: THREE.DoubleSide });

  let stepCount = 0;
  for (let i = 0; i < n; i++) {
    if (!inTunnel(i)) continue;
    stepCount++;
    const r = road[i], yw = yaw[i], q = new THREE.Quaternion().setFromAxisAngle(UP, yw);

    if (stepCount % 6 === 0) {
      for (const side of [-1, 1]) {
        const ref = new THREE.BoxGeometry(0.08, 0.22, 0.36);
        ref.applyQuaternion(q);
        ref.translate(r.x + nx[i] * side * (W - 0.04), r.y + 1.15, r.z + nz[i] * side * (W - 0.04));
        reflectors.push(ref);
      }
    }

    if (stepCount % 22 === 8) {
      for (const side of [-1, 1]) {
        const cyl = new THREE.CylinderGeometry(0.52, 0.52, 3.2, 12);
        cyl.rotateX(Math.PI / 2);
        cyl.applyQuaternion(q);
        cyl.translate(r.x + nx[i] * side * 1.45, r.y + 6.35, r.z + nz[i] * side * 1.45);
        jetFans.push(cyl);

        const signGeo = new THREE.PlaneGeometry(0.95, 1.2);
        const lat = side * (W - 0.06);
        signGeo.rotateY(yw - side * (Math.PI / 2));
        signGeo.translate(r.x + nx[i] * lat, r.y + 2.45, r.z + nz[i] * lat);
        exitSigns.push(signGeo);
      }
    }
  }

  if (jetFans.length) {
    group.add(new THREE.Mesh(mergeGeometries(jetFans), new THREE.MeshStandardMaterial({ color: 0x50555c, roughness: 0.4, metalness: 0.6 })));
  }
  if (reflectors.length) {
    group.add(new THREE.Mesh(mergeGeometries(reflectors), new THREE.MeshBasicMaterial({ color: 0xff7700, fog: false, toneMapped: false })));
  }
  if (exitSigns.length) {
    group.add(new THREE.Mesh(mergeGeometries(exitSigns), exitMat));
  }

  return group;
}

/**
 * Builds 5 Distinct Scenic Variations across the Consecutive Curves Section (Zone 1 & Zone 2: idx = 180..865):
 * 1. Zone 1 Upper Ridge (idx = 200..310): 44m Red/White Microwave Relay Tower + Cliffside Night Panorama Overlook Deck & Spectator Cars
 * 2. Zone 2A S-Curves (idx = 375..580): Vermilion Shinto Shrine O-Torii Gate & Stone Lanterns + Roadside Touge Chaya Teahouses & Red Paper Lanterns
 * 3. Zone 2B Hairpin #1 (idx = 595..658): Drift Spectator Gallery Turnout & Tire Barriers
 * 4. Zone 2B Hairpin #2 (idx = 716..766): Bamboo Grove Lanterns & Uplights
 * 5. Zone 2B Hairpin #3 (idx = 772..855): Jigokudani Geothermal Hot-Spring Source Yagura Towers, Overhead Steam Pipeline & Onsen Welcome Arch
 */
function buildCurveSectionSceneryVariations(
  road: THREE.Vector3[],
  nx: Float32Array,
  nz: Float32Array,
  sNx: Float32Array,
  sNz: Float32Array,
  yaw: Float32Array,
  half: number,
  sweepWhere: (segments: Segment[], pred: (k: number) => boolean, repeatMetres?: number, withUv?: boolean, useSmoothedNormal?: boolean) => THREE.BufferGeometry,
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const UP = new THREE.Vector3(0, 1, 0);

  const placeAt = (idx: number, lat: number, dy: number, fwd = 0, useSmooth = false): THREE.Vector3 => {
    const k = (idx + n) % n, r = road[k], yw = yaw[k];
    const N = useSmooth ? sNx[k] : nx[k], Z = useSmooth ? sNz[k] : nz[k];
    const tx = Math.sin(yw), tz = Math.cos(yw);
    return new THREE.Vector3(r.x + N * lat + tx * fwd, r.y + dy, r.z + Z * lat + tz * fwd);
  };

  // Shared geometry accumulators for fast batch rendering
  const vermilionParts: THREE.BufferGeometry[] = [];
  const darkWoodParts: THREE.BufferGeometry[] = [];
  const stoneParts: THREE.BufferGeometry[] = [];
  const concreteParts: THREE.BufferGeometry[] = [];
  const darkRoofParts: THREE.BufferGeometry[] = [];
  const silverPipeParts: THREE.BufferGeometry[] = [];
  const redSteelParts: THREE.BufferGeometry[] = [];
  const whiteSteelParts: THREE.BufferGeometry[] = [];
  const yellowHazardParts: THREE.BufferGeometry[] = [];
  const warmGlowParts: THREE.BufferGeometry[] = [];
  const redLanternParts: THREE.BufferGeometry[] = [];
  const cyanGlowParts: THREE.BufferGeometry[] = [];
  const redBeaconPts: number[] = [];
  const warmLanternPts: number[] = [];
  const steamPlumePts: number[] = [];

  // Helper to spawn a parked JDM Spectator Car with glowing headlights, red tailbar, amber hazards & underglow
  const carBodyColors = [0xf2f6fa, 0xf5b800, 0x1888e8, 0xd82228, 0x22c866, 0x9838e8];
  const carBodyParts: THREE.BufferGeometry[][] = carBodyColors.map(() => []);
  const addSpectatorCar = (pos: THREE.Vector3, carYaw: number, colorIdx: number) => {
    const q = new THREE.Quaternion().setFromAxisAngle(UP, carYaw);
    const put = (g: THREE.BufferGeometry, lx: number, ly: number, lz: number, into: THREE.BufferGeometry[]) => {
      g.translate(lx, ly, lz);
      g.applyQuaternion(q);
      g.translate(pos.x, pos.y, pos.z);
      into.push(g);
    };
    const bodyArr = carBodyParts[colorIdx % carBodyColors.length];
    put(new THREE.BoxGeometry(1.88, 0.68, 4.35), 0, 0.52, 0, bodyArr);
    put(new THREE.BoxGeometry(1.78, 0.1, 0.36), 0, 1.05, -1.95, bodyArr);
    put(new THREE.BoxGeometry(1.56, 0.56, 2.15), 0, 1.08, -0.15, darkRoofParts);
    put(new THREE.BoxGeometry(1.65, 0.18, 0.12), 0, 0.58, 2.18, cyanGlowParts);
    put(new THREE.BoxGeometry(1.68, 0.16, 0.12), 0, 0.62, -2.18, redLanternParts);
    put(new THREE.BoxGeometry(1.86, 0.12, 4.38), 0, 0.42, 0, yellowHazardParts);
    warmLanternPts.push(pos.x + Math.sin(carYaw) * 2.6, pos.y + 0.7, pos.z + Math.cos(carYaw) * 2.6);
  };

  // =========================================================================
  // 1. ZONE 1 UPPER RIDGE (idx = 205..310):
  //    46m Red/White Microwave Relay Towers + Cliffside Night Panorama Overlook Deck
  // =========================================================================
  {
    // 1A. 46m Red-and-White Steel Lattice Microwave Relay Towers on the ridge peaks (idx = 212 & idx = 276)
    const buildMicrowaveRelayTower = (towerIdx: number, latOff: number, baseDy: number) => {
      const tBase = placeAt(towerIdx, latOff, baseDy, 0, true);
      const tiers = 7;
      const tierH = 6.2;
      for (let t = 0; t < tiers; t++) {
        const r0 = 4.6 * (1 - (t / tiers) * 0.72);
        const r1 = 4.6 * (1 - ((t + 1) / tiers) * 0.72);
        const y0 = t * tierH;
        const targetArr = t % 2 === 0 ? redSteelParts : whiteSteelParts;

        // Horizontal perimeter frame at top of tier
        const ring = new THREE.CylinderGeometry(r1, r1, 0.36, 4);
        ring.rotateY(Math.PI / 4);
        ring.translate(tBase.x, tBase.y + y0 + tierH, tBase.z);
        targetArr.push(ring);

        // 4 corner lattice legs
        for (let c = 0; c < 4; c++) {
          const a = (c + 0.5) * (Math.PI / 2);
          const leg = new THREE.CylinderGeometry(0.18, 0.24, tierH + 0.3, 6);
          const xm = ((r0 + r1) * 0.5) * Math.cos(a);
          const zm = ((r0 + r1) * 0.5) * 0.5 * 2 * Math.sin(a);
          leg.translate(tBase.x + xm, tBase.y + y0 + tierH * 0.5, tBase.z + zm);
          targetArr.push(leg);
        }

        if (t === 2 || t === 4 || t === 6) {
          for (let c = 0; c < 4; c++) {
            const a = (c + 0.5) * (Math.PI / 2);
            redBeaconPts.push(
              tBase.x + (r1 + 0.4) * Math.cos(a),
              tBase.y + y0 + tierH,
              tBase.z + (r1 + 0.4) * Math.sin(a),
            );
          }
        }
      }
      // Spire & 4 white parabolic microwave relay dishes
      const spire = new THREE.CylinderGeometry(0.08, 0.25, 8.5, 8);
      spire.translate(tBase.x, tBase.y + tiers * tierH + 4.2, tBase.z);
      redSteelParts.push(spire);
      redBeaconPts.push(tBase.x, tBase.y + tiers * tierH + 8.6, tBase.z);

      for (const [dh, ang] of [[22, 0.4], [26, 1.9], [31, -1.1], [35, 2.8]] as const) {
        const dish = new THREE.CylinderGeometry(1.65, 0.9, 0.7, 16);
        dish.rotateZ(Math.PI / 2);
        dish.rotateY(ang);
        dish.translate(tBase.x + Math.cos(ang) * 2.4, tBase.y + dh, tBase.z + Math.sin(ang) * 2.4);
        whiteSteelParts.push(dish);
      }
    };

    buildMicrowaveRelayTower(212, -(half + 14.5), 5.5);
    buildMicrowaveRelayTower(264, half + 11.8, -1.5);
    buildMicrowaveRelayTower(276, -(half + 12.8), 4.2);

    // 1B. Cliffside Cantilevered Night Panorama Overlook Deck (idx = 252..302, +lat cliff side)
    for (let k = 254; k <= 300; k += 6) {
      const pDeck = placeAt(k, half + 4.8, -0.28, 0, true);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw[k]);
      const slab = new THREE.BoxGeometry(9.6, 0.7, 12.6);
      slab.applyQuaternion(q);
      slab.translate(pDeck.x, pDeck.y, pDeck.z);
      concreteParts.push(slab);

      const strut = new THREE.BoxGeometry(0.65, 11.0, 0.65);
      strut.rotateZ(0.38);
      strut.applyQuaternion(q);
      strut.translate(pDeck.x + sNx[k] * 2.2, pDeck.y - 5.2, pDeck.z + sNz[k] * 2.2);
      concreteParts.push(strut);

      // Glowing cyan observation deck bollard post & outer safety rail
      const bollard = new THREE.CylinderGeometry(0.16, 0.18, 1.35, 8);
      bollard.translate(pDeck.x + sNx[k] * 4.1, pDeck.y + 1.0, pDeck.z + sNz[k] * 4.1);
      cyanGlowParts.push(bollard);
    }

    // 4 Parked Spectator Cars at the Overlook Pullout Bay (unobstructed by guardrail!)
    [258, 268, 280, 292].forEach((k, idx) => {
      const cPos = placeAt(k, half + 3.6, 0.08, 0, true);
      addSpectatorCar(cPos, yaw[k] - Math.PI * 0.62, idx);
    });
  }

  // =========================================================================
  // 2. ZONE 2A S-CURVES (idx = 375..580):
  //    Vermilion Shinto Shrine O-Torii Gate, Stone Toro Lanterns & Touge Chaya Teahouses
  // =========================================================================
  {
    // 2A-1. Spanning Roadside Vermilion O-Torii Gate (参道一の鳥居) at idx = 446
    const buildToriiGate = (center: THREE.Vector3, gateYaw: number, spanW: number, pillarH: number) => {
      const rCol = 0.52;
      for (const side of [-1, 1]) {
        const col = new THREE.CylinderGeometry(rCol * 0.88, rCol, pillarH, 14);
        col.translate(side * (spanW * 0.5), pillarH * 0.5 - 0.4, 0);
        col.applyMatrix4(new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(UP, gateYaw), new THREE.Vector3(1, 1, 1)));
        vermilionParts.push(col);

        const basePed = new THREE.CylinderGeometry(rCol * 1.35, rCol * 1.45, 1.2, 12);
        basePed.translate(side * (spanW * 0.5), 0.2, 0);
        basePed.applyMatrix4(new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(UP, gateYaw), new THREE.Vector3(1, 1, 1)));
        stoneParts.push(basePed);
      }

      // Upper Kasagi (笠木) & Nuki (貫) crossbeams
      const kasagi = new THREE.BoxGeometry(spanW + 4.8, 0.78, 1.15);
      kasagi.translate(0, pillarH - 0.15, 0);
      kasagi.applyMatrix4(new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(UP, gateYaw), new THREE.Vector3(1, 1, 1)));
      vermilionParts.push(kasagi);

      const shimaki = new THREE.BoxGeometry(spanW + 5.4, 0.48, 1.32);
      shimaki.translate(0, pillarH + 0.42, 0);
      shimaki.applyMatrix4(new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(UP, gateYaw), new THREE.Vector3(1, 1, 1)));
      darkRoofParts.push(shimaki);

      const nuki = new THREE.BoxGeometry(spanW + 3.2, 0.58, 0.72);
      nuki.translate(0, pillarH - 2.15, 0);
      nuki.applyMatrix4(new THREE.Matrix4().compose(center, new THREE.Quaternion().setFromAxisAngle(UP, gateYaw), new THREE.Vector3(1, 1, 1)));
      vermilionParts.push(nuki);
    };

    // Spanning First O-Torii Gate over the road at idx = 446 (clear width = 14.4m, height = 8.8m)
    buildToriiGate(road[446], yaw[446], (half + 2.4) * 2, 8.8);

    // Second Inner Shrine Torii + Stone Stairway climbing the left mountain alcove at idx = 463
    const shrineAlcovePos = placeAt(463, -(half + 6.8), 0.5, 0, true);
    buildToriiGate(shrineAlcovePos, yaw[463] - Math.PI * 0.5, 6.8, 6.8);
    for (let st = 0; st < 6; st++) {
      const stepPos = placeAt(463, -(half + 3.8 + st * 1.45), st * 0.65, 0, true);
      const step = new THREE.BoxGeometry(7.2, 0.85, 1.5);
      step.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, yaw[463]));
      step.translate(stepPos.x, stepPos.y, stepPos.z);
      stoneParts.push(step);
    }

    // 14 Glowing Stone Toro Lanterns (石灯籠) lining the S-Curves (idx = 440..490)
    for (let k = 440; k <= 490; k += 6) {
      for (const side of [-1, 1]) {
        const lat = side * (half + (side === -1 && k >= 452 && k <= 476 ? 3.2 : 1.15));
        const lp = placeAt(k, lat, 0, 0, true);
        const post = new THREE.CylinderGeometry(0.22, 0.3, 1.85, 6);
        post.translate(lp.x, lp.y + 0.92, lp.z);
        const cap = new THREE.ConeGeometry(0.68, 0.48, 6);
        cap.translate(lp.x, lp.y + 2.45, lp.z);
        stoneParts.push(post, cap);

        const firebox = new THREE.BoxGeometry(0.46, 0.46, 0.46);
        firebox.translate(lp.x, lp.y + 1.98, lp.z);
        warmGlowParts.push(firebox);
        warmLanternPts.push(lp.x, lp.y + 2.05, lp.z);
      }
    }

    // 2A-2. Traditional Roadside Touge Chaya Teahouses (峠の茶屋「月影庵」) at idx = 505 (+lat) & idx = 546 (-lat alcove)
    const buildChayaTeahouse = (idx: number, side: number) => {
      const basePos = placeAt(idx, side * (half + 6.4), -0.2, 0, true);
      const cYaw = yaw[idx] + (side === 1 ? -Math.PI * 0.5 : Math.PI * 0.5);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, cYaw);

      const plinth = new THREE.BoxGeometry(15.0, 6.0, 9.0);
      plinth.applyQuaternion(q);
      plinth.translate(basePos.x, basePos.y - 3.0, basePos.z);
      stoneParts.push(plinth);

      const body = new THREE.BoxGeometry(13.6, 4.4, 7.0);
      body.applyQuaternion(q);
      body.translate(basePos.x, basePos.y + 2.2, basePos.z);
      darkWoodParts.push(body);

      const roof = new THREE.BoxGeometry(15.8, 1.1, 9.2);
      roof.applyQuaternion(q);
      roof.translate(basePos.x, basePos.y + 4.8, basePos.z);
      const ridge = new THREE.BoxGeometry(13.2, 1.2, 5.2);
      ridge.applyQuaternion(q);
      ridge.translate(basePos.x, basePos.y + 5.8, basePos.z);
      darkRoofParts.push(roof, ridge);

      // Glowing Shoji Front & Side Windows protruding slightly outside body so they glow warmly
      const shoji = new THREE.BoxGeometry(14.0, 2.7, 7.35);
      shoji.applyQuaternion(q);
      shoji.translate(basePos.x, basePos.y + 1.95, basePos.z);
      warmGlowParts.push(shoji);

      // Row of 7 Glowing Red Paper Chochin Lanterns (赤提灯) + 2 Outdoor Nodate Parasols (野点傘) & Red Benches (床几)
      for (let m = -3; m <= 3; m++) {
        const lPos = placeAt(idx, side * (half + 2.5), 3.45, m * 2.1, true);
        const chochin = new THREE.SphereGeometry(0.38, 10, 8);
        chochin.scale(1, 1.35, 1);
        chochin.translate(lPos.x, lPos.y, lPos.z);
        redLanternParts.push(chochin);
        warmLanternPts.push(lPos.x, lPos.y, lPos.z);
      }
      for (const fOff of [-4.2, 4.2]) {
        const pPos = placeAt(idx, side * (half + 2.9), 0, fOff, true);
        const pole = new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8);
        pole.translate(pPos.x, pPos.y + 1.6, pPos.z);
        darkWoodParts.push(pole);
        const umbrella = new THREE.ConeGeometry(2.1, 0.75, 14);
        umbrella.translate(pPos.x, pPos.y + 3.2, pPos.z);
        vermilionParts.push(umbrella);
        const bench = new THREE.BoxGeometry(2.4, 0.55, 1.2);
        bench.applyQuaternion(q);
        bench.translate(pPos.x, pPos.y + 0.28, pPos.z);
        vermilionParts.push(bench);
      }
    };

    buildChayaTeahouse(505, 1);
    buildChayaTeahouse(546, -1);

    // Warm Crimson & Gold Ground Uplight Pools illuminating the Autumn Momiji & Ginkgo Trees (idx = 375..580)
    const upTex = glowTexture();
    const goldPools: THREE.BufferGeometry[] = [];
    const crimsonPools: THREE.BufferGeometry[] = [];
    for (let k = 376; k <= 580; k += 10) {
      for (const side of [-1, 1]) {
        const p = placeAt(k, side * (half + 4.5), 0.12, 0, true);
        const g = new THREE.PlaneGeometry(11.0, 11.0);
        g.rotateX(-Math.PI / 2);
        g.translate(p.x, p.y, p.z);
        ((k + side) % 3 === 0 ? goldPools : crimsonPools).push(g);
      }
    }
    if (goldPools.length) {
      group.add(new THREE.Mesh(mergeGeometries(goldPools), new THREE.MeshBasicMaterial({
        map: upTex, color: 0xffbb22, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false,
      })));
    }
    if (crimsonPools.length) {
      group.add(new THREE.Mesh(mergeGeometries(crimsonPools), new THREE.MeshBasicMaterial({
        map: upTex, color: 0xff3811, transparent: true, opacity: 0.48, blending: THREE.AdditiveBlending, depthWrite: false,
      })));
    }
  }

  // =========================================================================
  // 3. ZONE 2B HAIRPIN #1 (idx = 594..658):
  //    Drift Spectator Gallery Turnout & Tire Barriers
  // =========================================================================
  {
    // Red/White Tire Barriers & 5 Parked Drift Spectator Cars along Hairpin #1 (idx = 606..654)
    for (let k = 604; k <= 656; k += 2) {
      const tPos = placeAt(k, half + 0.85, 0.45, 0, true);
      const tireStack = new THREE.CylinderGeometry(0.48, 0.48, 0.95, 10);
      tireStack.translate(tPos.x, tPos.y, tPos.z);
      if (k % 4 === 0) redSteelParts.push(tireStack);
      else whiteSteelParts.push(tireStack);
    }
    [608, 616, 626, 638, 648].forEach((k, idx) => {
      const apronPos = placeAt(k, half + 4.8, -0.35, 0, true);
      const pad = new THREE.BoxGeometry(6.5, 0.7, 8.5);
      pad.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(UP, yaw[k]));
      pad.translate(apronPos.x, apronPos.y, apronPos.z);
      concreteParts.push(pad);
      addSpectatorCar(placeAt(k, half + 4.5, 0.02, 0, true), yaw[k] - Math.PI * 0.55, idx + 1);
    });
  }

  // =========================================================================
  // 4. ZONE 2B HAIRPIN #2 (idx = 716..768):
  //    Bamboo Grove Lanterns (竹灯籠)
  // =========================================================================
  {
    const mossyRockParts: THREE.BufferGeometry[] = [];

    // Glowing Cut-Bamboo Footlight Lanterns (竹灯籠), Mossy Garden Stones & Emerald Uplight Pools along the Bamboo Grove (idx = 720..766)
    const upTex = glowTexture();
    const bambooPoolsLeft: THREE.BufferGeometry[] = [];
    const bambooPoolsRight: THREE.BufferGeometry[] = [];
    const bambooSleeveParts: THREE.BufferGeometry[] = [];
    for (let k = 720; k <= 766; k += 4) {
      for (const side of [-1, 1]) {
        const baseDy = side === -1 ? 4.4 : 0.02;
        const lat = side * (half + (side === -1 ? 2.15 : 1.75));
        const lPos = placeAt(k, lat, baseDy, 0, true);

        // Dark stone base & mossy garden boulder next to the bamboo lantern (竹灯籠の台石・苔石)
        const basePad = new THREE.CylinderGeometry(0.24, 0.28, 0.18, 8);
        basePad.translate(lPos.x, lPos.y + 0.09, lPos.z);
        stoneParts.push(basePad);

        const mossBoulder = new THREE.SphereGeometry(0.38 + (k % 3) * 0.12, 6, 5);
        mossBoulder.scale(1.3, 0.65, 1.1);
        mossBoulder.translate(lPos.x + side * 0.45, lPos.y + 0.18, lPos.z + 0.35);
        mossyRockParts.push(mossBoulder);

        // Deep emerald bamboo outer cylinder (竹灯籠の外筒) + warm glowing inner candle window
        const outerTube = new THREE.CylinderGeometry(0.15, 0.16, 0.92, 8);
        outerTube.translate(lPos.x, lPos.y + 0.54, lPos.z);
        bambooSleeveParts.push(outerTube);

        const candle = new THREE.CylinderGeometry(0.12, 0.12, 0.38, 8);
        candle.translate(lPos.x, lPos.y + 0.82, lPos.z);
        warmGlowParts.push(candle);

        if (k % 8 === 0) {
          const p = placeAt(k, side * (half + 3.2), baseDy + 0.08, 0, true);
          const g = new THREE.PlaneGeometry(9.5, 9.5);
          g.rotateX(-Math.PI / 2);
          g.translate(p.x, p.y, p.z);
          (side === -1 ? bambooPoolsLeft : bambooPoolsRight).push(g);
        }
      }
    }
    if (bambooPoolsLeft.length) {
      group.add(new THREE.Mesh(mergeGeometries(bambooPoolsLeft), new THREE.MeshBasicMaterial({
        map: upTex, color: 0x22ff88, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
      })));
    }
    if (bambooPoolsRight.length) {
      group.add(new THREE.Mesh(mergeGeometries(bambooPoolsRight), new THREE.MeshBasicMaterial({
        map: upTex, color: 0x88ff44, transparent: true, opacity: 0.42, blending: THREE.AdditiveBlending, depthWrite: false,
      })));
    }
    if (mossyRockParts.length) {
      group.add(
        new THREE.Mesh(
          mergeGeometries(mossyRockParts),
          new THREE.MeshStandardMaterial({ color: 0x263830, emissive: 0x07110c, roughness: 0.78, flatShading: true }),
        ),
      );
    }
    if (bambooSleeveParts.length) {
      group.add(
        new THREE.Mesh(
          mergeGeometries(bambooSleeveParts),
          new THREE.MeshStandardMaterial({ color: 0x28663c, emissive: 0x0a2414, roughness: 0.42 }),
        ),
      );
    }
  }

  // =========================================================================
  // 5. ZONE 2B HAIRPIN #3 (idx = 768..855):
  //    Jigokudani Geothermal Hot-Spring Source Yagura Towers, Steam Pipelines & Text-Free Traditional Onsen Gate
  // =========================================================================
  {
    // 5A. 5 Traditional Wooden Hot-Spring Source Yagura Towers (源泉櫓・湯畑) with rising sulfur steam plumes
    for (const [yIdx, side, latDist] of [
      [774, 1, half + 5.8],
      [780, -1, half + 5.4],
      [792, 1, half + 6.8],
      [808, -1, half + 5.6],
      [824, 1, half + 6.2],
    ] as const) {
      const yPos = placeAt(yIdx, side * latDist, -0.3, 0, true);
      const crib = new THREE.BoxGeometry(5.5, 2.2, 5.5);
      crib.translate(yPos.x, yPos.y + 0.8, yPos.z);
      stoneParts.push(crib);

      const yaguraTower = new THREE.CylinderGeometry(0.85, 2.1, 10.5, 4);
      yaguraTower.rotateY(Math.PI / 4);
      yaguraTower.translate(yPos.x, yPos.y + 6.2, yPos.z);
      darkWoodParts.push(yaguraTower);

      const ventGlow = new THREE.CylinderGeometry(1.8, 2.2, 0.6, 12);
      ventGlow.translate(yPos.x, yPos.y + 2.0, yPos.z);
      warmGlowParts.push(ventGlow);
      warmLanternPts.push(yPos.x, yPos.y + 2.6, yPos.z);

      for (let s = 0; s < 8; s++) {
        steamPlumePts.push(
          yPos.x + (Math.sin(s * 2.1) * 2.4),
          yPos.y + 3.2 + s * 2.4,
          yPos.z + (Math.cos(s * 1.7) * 2.4),
        );
      }
    }

    // 5B. Roadside Silver Insulated Geothermal Hot-Water Pipelines (idx = 768..838) + Twin Overhead Pipe Bridges at idx = 772 & 796
    const pipeGeo = sweepWhere(
      [
        [[half + 1.35, 1.4], [half + 1.85, 1.9]],
        [[half + 1.35, 2.2], [half + 1.85, 2.7]],
      ],
      (k) => k >= 768 && k <= 838,
      12,
      true,
      true,
    );
    silverPipeParts.push(pipeGeo);

    for (const pbIdx of [772, 796]) {
      const pbCenter = road[pbIdx], pbYaw = yaw[pbIdx], pbQ = new THREE.Quaternion().setFromAxisAngle(UP, pbYaw);
      const pbSpan = (half + 2.2) * 2;
      for (const h of [6.4, 7.2]) {
        const crossPipe = new THREE.CylinderGeometry(0.32, 0.32, pbSpan, 12);
        crossPipe.rotateZ(Math.PI / 2);
        crossPipe.applyQuaternion(pbQ);
        crossPipe.translate(pbCenter.x, pbCenter.y + h, pbCenter.z);
        silverPipeParts.push(crossPipe);
      }
      for (const side of [-1, 1]) {
        const leg = new THREE.BoxGeometry(0.55, 7.8, 0.55);
        leg.translate(pbCenter.x + nx[pbIdx] * side * (pbSpan * 0.48), pbCenter.y + 3.8, pbCenter.z + nz[pbIdx] * side * (pbSpan * 0.48));
        silverPipeParts.push(leg);
      }
    }

    // 5C. Text-Free Traditional Japanese Onsen Town Vermilion Gate (温泉街の朱塗り太鼓門・反り瓦屋根・赤提灯7連) at idx = 846
    const wCenter = road[846], wYaw = yaw[846], wQ = new THREE.Quaternion().setFromAxisAngle(UP, wYaw);
    const wSpan = (half + 2.0) * 2;
    const wH = 6.8;
    for (const side of [-1, 1]) {
      const cx = wCenter.x + nx[846] * side * (wSpan * 0.5);
      const cz = wCenter.z + nz[846] * side * (wSpan * 0.5);

      // Main vermilion pillar + stone foundation plinth (礎石)
      const plinth = new THREE.CylinderGeometry(0.68, 0.78, 1.1, 12);
      plinth.translate(cx, wCenter.y + 0.55, cz);
      stoneParts.push(plinth);

      const col = new THREE.CylinderGeometry(0.44, 0.5, wH + 1.4, 14);
      col.translate(cx, wCenter.y + (wH + 1.4) * 0.5, cz);
      vermilionParts.push(col);

      // Fore & aft auxiliary wooden pillars (控柱)
      for (const fOff of [-1.15, 1.15]) {
        const subPos = placeAt(846, side * (wSpan * 0.5), 0, fOff);
        const subCol = new THREE.CylinderGeometry(0.26, 0.3, wH + 0.4, 10);
        subCol.translate(subPos.x, subPos.y + (wH + 0.4) * 0.5, subPos.z);
        darkWoodParts.push(subCol);
      }
    }

    // Lower Nuki tie-beam (貫) & Upper Kasagi lintel beam (冠木) with traditional vertical struts (束) & bracket blocks (斗栱)
    const lowerBeam = new THREE.BoxGeometry(wSpan + 3.2, 0.52, 0.68);
    lowerBeam.applyQuaternion(wQ);
    lowerBeam.translate(wCenter.x, wCenter.y + wH - 0.35, wCenter.z);
    vermilionParts.push(lowerBeam);

    const upperBeam = new THREE.BoxGeometry(wSpan + 4.2, 0.72, 1.05);
    upperBeam.applyQuaternion(wQ);
    upperBeam.translate(wCenter.x, wCenter.y + wH + 0.95, wCenter.z);
    vermilionParts.push(upperBeam);

    for (let st = -3; st <= 3; st++) {
      const stPos = placeAt(846, st * 2.1, wH + 0.3, 0);
      const strut = new THREE.BoxGeometry(0.42, 0.95, 0.58);
      strut.applyQuaternion(wQ);
      strut.translate(stPos.x, stPos.y, stPos.z);
      darkWoodParts.push(strut);
    }

    // Layered Traditional Dark-Tiled Roof (反り瓦屋根・垂木・棟飾り)
    const lowerRoof = new THREE.BoxGeometry(wSpan + 5.4, 0.48, 2.2);
    lowerRoof.applyQuaternion(wQ);
    lowerRoof.translate(wCenter.x, wCenter.y + wH + 1.52, wCenter.z);
    const upperRoof = new THREE.BoxGeometry(wSpan + 3.6, 0.55, 1.45);
    upperRoof.applyQuaternion(wQ);
    upperRoof.translate(wCenter.x, wCenter.y + wH + 2.02, wCenter.z);
    darkRoofParts.push(lowerRoof, upperRoof);

    // Copper-gold ridge beam (大棟) & eaves fascia trim so the traditional roof silhouette stands out against the night sky
    const ridgeCrest = new THREE.BoxGeometry(wSpan + 3.8, 0.22, 0.36);
    ridgeCrest.applyQuaternion(wQ);
    ridgeCrest.translate(wCenter.x, wCenter.y + wH + 2.38, wCenter.z);
    const eavesTrim = new THREE.BoxGeometry(wSpan + 5.45, 0.14, 2.26);
    eavesTrim.applyQuaternion(wQ);
    eavesTrim.translate(wCenter.x, wCenter.y + wH + 1.26, wCenter.z);
    yellowHazardParts.push(ridgeCrest, eavesTrim);

    // Golden Onigawara ridge-end ornaments (金色の鬼瓦・棟飾り)
    for (const side of [-1, 1]) {
      const oPos = placeAt(846, side * ((wSpan + 3.6) * 0.5), wH + 2.52, 0);
      const ornament = new THREE.BoxGeometry(0.48, 0.62, 0.68);
      ornament.applyQuaternion(wQ);
      ornament.translate(oPos.x, oPos.y, oPos.z);
      yellowHazardParts.push(ornament);
    }

    // Full Row of 7 Glowing Red Paper Chochin Lanterns (赤提灯7連 + 上下黒枠) hanging beneath the Nuki tie-beam
    for (let m = -3; m <= 3; m++) {
      const lPos = placeAt(846, m * 1.95, wH - 1.25, 0);
      const chochin = new THREE.SphereGeometry(0.42, 12, 10);
      chochin.scale(1, 1.38, 1);
      chochin.translate(lPos.x, lPos.y, lPos.z);
      redLanternParts.push(chochin);
      if (m % 2 === 0) {
        warmLanternPts.push(lPos.x, lPos.y, lPos.z);
      }

      for (const rimDy of [-0.52, 0.52]) {
        const rim = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10);
        rim.translate(lPos.x, lPos.y + rimDy, lPos.z);
        darkRoofParts.push(rim);
      }
    }
  }

  // Merge batch geometries by material
  if (vermilionParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(vermilionParts), new THREE.MeshStandardMaterial({ color: 0xd42418, emissive: 0x2c0604, roughness: 0.48 })));
  }
  if (darkWoodParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(darkWoodParts), new THREE.MeshLambertMaterial({ color: 0x3a2416, emissive: 0x120a05 })));
  }
  if (stoneParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(stoneParts), new THREE.MeshLambertMaterial({ color: 0x555c62, emissive: 0x101316, flatShading: true })));
  }
  if (concreteParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(concreteParts), new THREE.MeshLambertMaterial({ color: 0x6c737c, emissive: 0x14181c })));
  }
  if (darkRoofParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(darkRoofParts), new THREE.MeshStandardMaterial({ color: 0x2c3644, emissive: 0x11161e, roughness: 0.45 })));
  }
  if (silverPipeParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(silverPipeParts), new THREE.MeshStandardMaterial({ color: 0xb0bac4, emissive: 0x1c2228, roughness: 0.32, metalness: 0.78 })));
  }
  if (redSteelParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(redSteelParts), new THREE.MeshStandardMaterial({ color: 0xd82218, emissive: 0x280604, roughness: 0.5 })));
  }
  if (whiteSteelParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(whiteSteelParts), new THREE.MeshStandardMaterial({ color: 0xeef2f6, emissive: 0x22262c, roughness: 0.5 })));
  }
  if (yellowHazardParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(yellowHazardParts), new THREE.MeshStandardMaterial({ color: 0xf2b000, emissive: 0x2c1c00, roughness: 0.45 })));
  }
  if (warmGlowParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(warmGlowParts), new THREE.MeshBasicMaterial({ color: 0xffbb44, fog: false })));
  }
  if (redLanternParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(redLanternParts), new THREE.MeshBasicMaterial({ color: 0xff3318, fog: false })));
  }
  if (cyanGlowParts.length) {
    group.add(new THREE.Mesh(mergeGeometries(cyanGlowParts), new THREE.MeshBasicMaterial({ color: 0x55eeff, fog: false })));
  }
  carBodyParts.forEach((geos, cIdx) => {
    if (geos.length) {
      group.add(new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({
        color: carBodyColors[cIdx], roughness: 0.32, metalness: 0.55,
      })));
    }
  });

  const gTex = glowTexture();
  if (redBeaconPts.length) {
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(redBeaconPts, 3));
    group.add(new THREE.Points(bg, new THREE.PointsMaterial({
      map: gTex, size: 8.5, sizeAttenuation: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xff2211,
    })));
  }
  if (warmLanternPts.length) {
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(warmLanternPts, 3));
    group.add(new THREE.Points(lg, new THREE.PointsMaterial({
      map: gTex, size: 5.2, sizeAttenuation: true, transparent: true, opacity: 0.65, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, color: 0xff9933,
    })));
  }
  if (steamPlumePts.length) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(steamPlumePts, 3));
    group.add(new THREE.Points(sg, new THREE.PointsMaterial({
      map: gTex, size: 19.0, sizeAttenuation: true, transparent: true, opacity: 0.34, depthWrite: false, color: 0xffe8c8,
    })));
  }

  return group;
}

/**
 * Builds Multi-Biome Touge Forest:
 * 1. Deep Evergreen Japanese Cedar Forest (スギ林) in normal sections
 * 2. Illuminated Crimson Momiji Maple (紅葉) & Golden Ginkgo (イチョウ並木) in the S-Curves (idx = 365..585)
 * 3. High-Detail Segmented Emerald Moso Bamboo Grove (孟宗竹の青竹林：節付き竹幹クラスター＋笹の葉キャノピー) (idx = 716..768)
 */
function buildRealisticCedarForest(
  road: THREE.Vector3[],
  sNx: Float32Array,
  sNz: Float32Array,
  zoneOf: number[],
  half: number,
  sampleTerrainY: (x: number, z: number) => number,
): THREE.Group {
  const group = new THREE.Group();
  const n = road.length;
  const rand = mulberry32(515);

  // 1. Cedar / Autumn Bark Trunk Geometry (buried 1.5m into ground up to 10.5m)
  const trunkGeo = new THREE.CylinderGeometry(0.11, 0.32, 12.0, 6);
  trunkGeo.translate(0, 4.5, 0);

  // 2. Multi-Plane Crossed Foliage Canopy Geometry for Cedar & Autumn Trees (3 vertical star planes at 0°, 60°, 120°)
  const foliagePlanes: THREE.BufferGeometry[] = [];
  for (let a = 0; a < 3; a++) {
    const p = new THREE.PlaneGeometry(6.4, 15.2);
    p.rotateY((a * Math.PI) / 3);
    p.translate(0, 7.6, 0);
    foliagePlanes.push(p);
  }
  const foliageGeo = mergeGeometries(foliagePlanes);

  // 3. High-Detail 9-Culm Segmented Moso Bamboo Cluster Geometry (孟宗竹の幹・節リング・自然な傾き)
  const bambooClusterParts: THREE.BufferGeometry[] = [];
  const culmSpecs = [
    { bx: 0.0, bz: 0.0, bh: 14.8, r: 0.095, rx: 0.02, rz: -0.02 },
    { bx: -0.52, bz: -0.38, bh: 13.8, r: 0.088, rx: -0.05, rz: 0.04 },
    { bx: 0.54, bz: -0.34, bh: 14.5, r: 0.092, rx: -0.04, rz: -0.05 },
    { bx: -0.18, bz: 0.56, bh: 13.4, r: 0.084, rx: 0.06, rz: 0.02 },
    { bx: 0.46, bz: 0.48, bh: 14.2, r: 0.090, rx: 0.05, rz: -0.05 },
    { bx: -0.68, bz: 0.22, bh: 12.9, r: 0.080, rx: 0.03, rz: 0.06 },
    { bx: 0.18, bz: -0.64, bh: 13.6, r: 0.085, rx: -0.06, rz: -0.02 },
    { bx: -0.32, bz: -0.78, bh: 12.6, r: 0.078, rx: -0.07, rz: 0.04 },
    { bx: 0.76, bz: 0.08, bh: 13.2, r: 0.082, rx: 0.02, rz: -0.07 },
  ];
  for (const cs of culmSpecs) {
    const stalk = new THREE.CylinderGeometry(cs.r * 0.72, cs.r, cs.bh, 8, 1, false);
    // Scale V coordinate so bamboo node rings repeat every ~0.48m along the 14m stalk
    const uvAttr = stalk.attributes.uv as THREE.BufferAttribute;
    for (let u = 0; u < uvAttr.count; u++) {
      uvAttr.setY(u, uvAttr.getY(u) * 3.2);
    }
    stalk.translate(0, cs.bh * 0.5 - 0.6, 0);
    stalk.rotateX(cs.rx);
    stalk.rotateZ(cs.rz);
    stalk.translate(cs.bx, 0, cs.bz);
    bambooClusterParts.push(stalk);

    // Physical 3D raised node rings (竹の節) along the lower 6.5m of each culm for crisp 3D silhouette detail
    for (let ny = 0.8; ny <= 6.2; ny += 0.9) {
      const nodeRing = new THREE.CylinderGeometry(cs.r * 1.08, cs.r * 1.08, 0.055, 8);
      nodeRing.translate(0, ny, 0);
      nodeRing.rotateX(cs.rx);
      nodeRing.rotateZ(cs.rz);
      nodeRing.translate(cs.bx, 0, cs.bz);
      bambooClusterParts.push(nodeRing);
    }
  }
  const bambooStalkGeo = mergeGeometries(bambooClusterParts);

  // 4. Upper-Canopy Lance-Shaped Bamboo Leaf Sprays Geometry (y = 5.8m..14.8m so lower culms & nodes stay clearly visible!)
  const bambooLeafPlanes: THREE.BufferGeometry[] = [];
  for (let a = 0; a < 3; a++) {
    const p = new THREE.PlaneGeometry(5.6, 8.8);
    p.rotateY((a * Math.PI) / 3);
    p.translate(0, 10.2, 0);
    bambooLeafPlanes.push(p);
  }
  const bambooFoliageGeo = mergeGeometries(bambooLeafPlanes);

  const cedarMatrices: THREE.Matrix4[] = [];
  const crimsonMapleMatrices: THREE.Matrix4[] = [];
  const goldenGinkgoMatrices: THREE.Matrix4[] = [];
  const bambooMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();

  // Helper to check if a candidate tree position (tx, tz) is safely outside the road & walls everywhere
  const isClearOfRoad = (tx: number, tz: number, minClearance: number): boolean => {
    for (let k = 0; k < n; k += 2) {
      if (zoneOf[k] === 5) continue; // Trees CAN grow on top of the mountain ridge above the tunnel!
      const dx = tx - road[k].x, dz = tz - road[k].z;
      if (dx * dx + dz * dz < minClearance * minClearance) return false;
    }
    return true;
  };

  for (let i = 0; i < n; i += 2) {
    const z = zoneOf[i];
    if (z === 4) continue; // Keep the Onsen Gorge around the Red Arch Bridge open for the Ryokan view
    const r = road[i];
    const inParkingBay = z === 0 && i < 36;
    const inAutumnZone = i >= 365 && i <= 585;
    const inBambooZone = i >= 716 && i <= 768;

    for (const side of [-1, 1]) {
      // Keep immediate roadside clear where scenic decks, teahouses, or spectator bays sit
      const inScenicLandmark =
        (side === 1 && i >= 250 && i <= 306) ||
        (side === -1 && i >= 452 && i <= 476) ||
        (side === 1 && i >= 496 && i <= 514) ||
        (side === -1 && i >= 534 && i <= 558) ||
        (side === 1 && i >= 604 && i <= 656) ||
        (i >= 772 && i <= 832);

      // In the Bamboo Grove (716..768), plant a dense roadside row of bamboo culms right along the stone wall & right shoulder!
      if (inBambooZone) {
        for (const bRow of [0, 1]) {
          const latDist = side === -1
            ? half + 2.2 + bRow * 2.1 + rand() * 0.6
            : half + 1.85 + bRow * 2.2 + rand() * 0.6;
          const bx = r.x + sNx[i] * side * latDist + (rand() - 0.5) * 1.1;
          const bz = r.z + sNz[i] * side * latDist + (rand() - 0.5) * 1.1;
          if (isClearOfRoad(bx, bz, half + 1.45)) {
            const bGroundY = side === -1 ? r.y + 4.35 : r.y - 0.35 - bRow * 0.6;
            const bScale = 0.92 + rand() * 0.28;
            dummy.position.set(bx, bGroundY, bz);
            dummy.rotation.set((rand() - 0.5) * 0.04, rand() * Math.PI * 2, (rand() - 0.5) * 0.04);
            dummy.scale.set(bScale, bScale, bScale);
            dummy.updateMatrix();
            bambooMatrices.push(dummy.matrix.clone());
          }
        }
      }

      for (let c = 0; c < 3; c++) {
        if (inScenicLandmark && c === 0) continue;

        const minOffset = side === -1
          ? (inParkingBay ? half + 13.5 : inBambooZone ? half + 4.8 : half + 4.4)
          : (inBambooZone ? half + 4.6 : half + 3.2);
        const dist = z === 5
          ? (c - 1) * 11.0 + (rand() - 0.5) * 10.0
          : side * (minOffset + c * 7.2 + rand() * 4.2);
        const tx = r.x + sNx[i] * dist + (rand() - 0.5) * 2.4;
        const tz = r.z + sNz[i] * dist + (rand() - 0.5) * 2.4;

        if (!isClearOfRoad(tx, tz, half + 2.6)) continue;

        let groundY: number;
        if (z === 5) {
          const absLat = Math.abs(dist);
          groundY = r.y + Math.max(14.0, 22.5 - absLat * 0.48);
        } else if (c === 0) {
          groundY = side === -1
            ? (inParkingBay ? r.y - 0.2 : inBambooZone ? r.y + 4.4 : r.y + 6.4)
            : r.y - 1.8;
        } else {
          groundY = sampleTerrainY(tx, tz);
        }

        const scale = 0.88 + rand() * 0.52;
        dummy.position.set(tx, groundY - 0.5, tz);
        dummy.rotation.set((rand() - 0.5) * 0.05, rand() * Math.PI * 2, (rand() - 0.5) * 0.05);
        dummy.scale.set(scale, scale * (0.94 + rand() * 0.26), scale);
        dummy.updateMatrix();
        const matClone = dummy.matrix.clone();

        if (inBambooZone && c === 0) {
          bambooMatrices.push(matClone);
        } else if (inAutumnZone) {
          if ((i + c) % 3 === 0) goldenGinkgoMatrices.push(matClone);
          else crimsonMapleMatrices.push(matClone);
        } else {
          cedarMatrices.push(matClone);
        }
      }
    }
  }

  const allTreeMatrices = [...cedarMatrices, ...crimsonMapleMatrices, ...goldenGinkgoMatrices];
  const instTrunks = new THREE.InstancedMesh(
    trunkGeo,
    new THREE.MeshLambertMaterial({ color: 0x2c1e16 }),
    allTreeMatrices.length,
  );
  allTreeMatrices.forEach((m, k) => instTrunks.setMatrixAt(k, m));
  instTrunks.instanceMatrix.needsUpdate = true;
  instTrunks.frustumCulled = false;
  group.add(instTrunks);

  const addFoliageBatch = (mats: THREE.Matrix4[], tex: THREE.CanvasTexture, emissiveHex: number, customGeo = foliageGeo) => {
    if (!mats.length) return;
    const mesh = new THREE.InstancedMesh(
      customGeo,
      new THREE.MeshStandardMaterial({
        map: tex,
        emissive: new THREE.Color(emissiveHex),
        roughness: 0.85,
        alphaTest: 0.36,
        side: THREE.DoubleSide,
      }),
      mats.length,
    );
    mats.forEach((m, k) => mesh.setMatrixAt(k, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    group.add(mesh);
  };

  addFoliageBatch(cedarMatrices, makeCedarFoliageTexture(), 0x050c07);
  addFoliageBatch(crimsonMapleMatrices, makeAutumnFoliageTexture(true), 0x481408);
  addFoliageBatch(goldenGinkgoMatrices, makeAutumnFoliageTexture(false), 0x442e06);

  if (bambooMatrices.length) {
    const bambooCulmTex = makeBambooCulmTexture();
    const instBamboo = new THREE.InstancedMesh(
      bambooStalkGeo,
      new THREE.MeshStandardMaterial({
        map: bambooCulmTex,
        emissive: new THREE.Color(0x164c24),
        emissiveMap: bambooCulmTex,
        roughness: 0.38,
        metalness: 0.08,
      }),
      bambooMatrices.length,
    );
    bambooMatrices.forEach((m, k) => instBamboo.setMatrixAt(k, m));
    instBamboo.instanceMatrix.needsUpdate = true;
    instBamboo.frustumCulled = false;
    group.add(instBamboo);
    addFoliageBatch(bambooMatrices, makeBambooFoliageTexture(), 0x184822, bambooFoliageGeo);
  }

  return group;
}
