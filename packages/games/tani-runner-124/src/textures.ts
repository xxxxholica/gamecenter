// ============================================================
// Canvas Procedural Texture Generator
// University Mathematics symbols (∬, ∭, d/dx, ker, ∑, 124)
// and bonus multiplier lines along the graduation flight track
// ============================================================

import * as THREE from 'three';

export type MathOpType =
  | 'integral_double' // ∬ (Double Integral: ×2)
  | 'integral_triple' // ∭ (Triple Integral: ×3)
  | 'integral_add'    // ∫ +C (Definite Integral: +C)
  | 'series_sum'      // ∑ +C (Series Summation: +C)
  | 'tensor_prod'     // ⊗2 (Tensor Product: ×2)
  | 'eigen_boost'     // λ=2 (Eigen Expansion: ×2)
  | 'limit_inf'       // lim ∞ (Infinite Limit: +50)
  | 'diff_1st'        // d/dx (1st Derivative: ÷2)
  | 'diff_2nd'        // d²/dx² (2nd Derivative: ÷3)
  | 'diff_partial'    // ∂/∂x (Partial Derivative: -C)
  | 'kernel'          // ker (Kernel Subspace: -C)
  | 'coker'           // coker (Cokernel Loss: -C)
  | 'eigen_decay'     // λ=0.5 (Eigen Damping: ÷2)
  | 'divergence'      // ∇・F (Divergence Outflow: -C)
  | 'affine'          // ax+b (中学生: 一次式。人数×a に b を足す)
  | 'square'          // x² (中学生: 人数の2乗。増えすぎないよう ×10 が上限)
  | 'percent_up'      // 150% (中学生: ×1.5)
  | 'sqrt'            // √x (中学生: 人数の平方根)
  | 'percent_down';   // 70% など (中学生: 割合で減る。value が残る割合[%])

export interface GateInfo {
  type: MathOpType;
  value: number;
  /** 一次式 ax+b の a(affine のときだけ使う) */
  factor?: number;
  label: string;
  isPositive: boolean;
}

export class TextureGenerator {
  // Course Corridor Floor Texture
  public static createFloorTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Dark grey floor
    ctx.fillStyle = '#17191e';
    ctx.fillRect(0, 0, 512, 512);

    // Grid lines
    ctx.strokeStyle = '#282c35';
    ctx.lineWidth = 4;
    const tileSize = 64;
    for (let x = 0; x <= 512; x += tileSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, 512);
      ctx.stroke();
    }
    for (let y = 0; y <= 512; y += tileSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(512, y);
      ctx.stroke();
    }

    // Side border stripes
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, 24, 512);
    ctx.fillRect(512 - 24, 0, 24, 512);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 40);
    return texture;
  }

  // Gate Texture: University Mathematics symbols (e.g. "∬", "d/dx", "∑ +20", "ker")
  // isWhite が true の場合(高専生)、赤・青の区別をなくして全て白ゲートにする
  public static createGateTexture(gate: GateInfo, isWhite: boolean = false): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    const isPos = gate.isPositive;
    const mainColor = isWhite ? '#ffffff' : (isPos ? '#00f0ff' : '#ff0033');
    const darkBg = isWhite ? 'rgba(24, 25, 30, 0.92)' : (isPos ? 'rgba(0, 25, 55, 0.88)' : 'rgba(55, 0, 10, 0.88)');

    // Background
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, 512, 320);

    // Heavy neon border
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, 512 - 20, 320 - 20);

    // Inner bright border
    ctx.strokeStyle = isWhite ? '#e0e4ea' : '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, 512 - 44, 320 - 44);

    // University Math symbol text
    const text = gate.label;

    // Dynamically adjust font size based on text length for maximum punch
    let fontSize = 135;
    if (text.length > 6) fontSize = 84;
    else if (text.length > 4) fontSize = 102;
    else if (text.length > 2) fontSize = 118;

    const fontStack = `'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif`;
    ctx.font = `900 ${fontSize}px ${fontStack}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 枠内に確実に収まるよう実測幅でフォントサイズを縮小
    const maxTextWidth = 512 - 80;
    const measuredWidth = ctx.measureText(text).width;
    if (measuredWidth > maxTextWidth) {
      fontSize = Math.max(48, Math.floor(fontSize * (maxTextWidth / measuredWidth)));
      ctx.font = `900 ${fontSize}px ${fontStack}`;
    }

    // Extreme black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = Math.max(12, Math.round(fontSize * 0.18));
    ctx.strokeText(text, 256, 160);

    // Bright fill
    ctx.fillStyle = isWhite ? '#ffffff' : (isPos ? '#ffea00' : '#ffffff');
    ctx.fillText(text, 256, 160);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // Boss Wall Texture: 卒業要件の大きな数字(標準は124)
  public static createBossWallTexture(requirement: number = 124): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Brick mortar
    ctx.fillStyle = '#18100e';
    ctx.fillRect(0, 0, 1024, 512);

    // Brick pattern
    const brickH = 40;
    const brickW = 100;
    for (let r = 0; r < 512 / brickH; r++) {
      const offsetX = (r % 2 === 0) ? 0 : -brickW / 2;
      for (let c = 0; c < 1024 / brickW + 1; c++) {
        const x = c * brickW + offsetX;
        const y = r * brickH;
        ctx.fillStyle = (r + c) % 3 === 0 ? '#63251c' : '#7b2e23';
        ctx.fillRect(x + 2, y + 2, brickW - 4, brickH - 4);
      }
    }

    // Heavy dark plate in center
    ctx.fillStyle = '#050505';
    ctx.fillRect(100, 80, 1024 - 200, 352);
    ctx.strokeStyle = '#ff0033';
    ctx.lineWidth = 16;
    ctx.strokeRect(100, 80, 1024 - 200, 352);

    // Enormous "124" text
    ctx.font = "900 240px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 20;
    ctx.strokeText(String(requirement), 512, 256);

    ctx.fillStyle = '#ff1744';
    ctx.fillText(String(requirement), 512, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // Bonus Multiplier Segment Texture (for the flight runway)
  // Generates a track panel with a multiplier marking (e.g. "×1.5")
  public static createBonusSegmentTexture(multiplierStr: string, bgColor: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 512);

    // Side gold rails
    ctx.fillStyle = '#ffd700';
    ctx.fillRect(0, 0, 36, 512);
    ctx.fillRect(512 - 36, 0, 36, 512);

    // Thick start/finish threshold line
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 512, 24);
    ctx.fillRect(0, 512 - 24, 512, 24);

    // Multiplier text
    ctx.font = "900 120px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 22;
    ctx.strokeText(multiplierStr, 256, 256);

    ctx.fillStyle = '#ffffff';
    ctx.fillText(multiplierStr, 256, 256);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // 障害物(課題)のテクスチャ: 赤黒の警告ストライプ + 「課題」
  public static createObstacleTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#2a0008';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = '#e0143c';
    for (let x = -128; x < 384; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.lineTo(x + 24, 128);
      ctx.lineTo(x + 24 + 128, 0);
      ctx.lineTo(x + 128, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(56, 26, 144, 76);
    ctx.font = "900 62px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('課題', 128, 66);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // アイテム(友達)の数字ラベル「+N」
  public static createPickupTexture(value: number): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.font = "900 92px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 16;
    ctx.strokeText(`+${value}`, 128, 66);
    ctx.fillStyle = '#39ff88';
    ctx.fillText(`+${value}`, 128, 66);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
