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
  | 'divergence';     // ∇・F (Divergence Outflow: -C)

export interface GateInfo {
  type: MathOpType;
  value: number;
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
  public static createGateTexture(gate: GateInfo): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d')!;

    const isPos = gate.isPositive;
    const mainColor = isPos ? '#00f0ff' : '#ff0033';
    const darkBg = isPos ? 'rgba(0, 25, 55, 0.88)' : 'rgba(55, 0, 10, 0.88)';

    // Background
    ctx.fillStyle = darkBg;
    ctx.fillRect(0, 0, 512, 320);

    // Heavy neon border
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 20;
    ctx.strokeRect(10, 10, 512 - 20, 320 - 20);

    // Inner bright border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(22, 22, 512 - 44, 320 - 44);

    // University Math symbol text
    const text = gate.label;

    // Dynamically adjust font size based on text length for maximum punch
    let fontSize = 135;
    if (text.length > 6) fontSize = 84;
    else if (text.length > 4) fontSize = 102;
    else if (text.length > 2) fontSize = 118;

    ctx.font = `900 ${fontSize}px 'Arial Black', 'Impact', 'Times New Roman', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Extreme black outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 24;
    ctx.strokeText(text, 256, 160);

    // Bright fill
    ctx.fillStyle = isPos ? '#ffea00' : '#ffffff';
    ctx.fillText(text, 256, 160);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // Boss Wall Texture: Just the huge number "124"
  public static createBossWallTexture(): THREE.CanvasTexture {
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
    ctx.font = "900 240px 'Arial Black', 'Impact', sans-serif";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 20;
    ctx.strokeText("124", 512, 256);

    ctx.fillStyle = '#ff1744';
    ctx.fillText("124", 512, 256);

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
    ctx.font = "900 120px 'Arial Black', 'Impact', sans-serif";
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
}
