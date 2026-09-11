import * as THREE from 'three';

export class TextureGenerator {
  private static cache: Map<string, THREE.CanvasTexture> = new Map();

  public static getBrickWallWithGraffiti(tag: string = 'B-BOY'): THREE.CanvasTexture {
    const key = `brick_graffiti_${tag}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Dark reddish-brown brick background
    ctx.fillStyle = '#2b1b17';
    ctx.fillRect(0, 0, 512, 512);

    // Brick mortar lines
    ctx.fillStyle = '#140c0a';
    const brickH = 32;
    const brickW = 64;
    for (let y = 0; y < 512; y += brickH) {
      const offset = (Math.floor(y / brickH) % 2) * (brickW / 2);
      for (let x = -brickW; x < 512 + brickW; x += brickW) {
        ctx.fillStyle = (Math.sin(x * 12 + y * 5) > 0.2) ? '#3d251e' : '#2b1b17';
        ctx.fillRect(x + offset + 2, y + 2, brickW - 4, brickH - 4);
      }
    }

    // Graffiti Art
    ctx.save();
    ctx.translate(256, 256);
    ctx.rotate(-0.08);

    // Splatter dots
    const colors = ['#00f0ff', '#ffe600', '#ff1a1a', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = colors[i % colors.length];
      const rx = (Math.random() - 0.5) * 440;
      const ry = (Math.random() - 0.5) * 200;
      const r = 2 + Math.random() * 8;
      ctx.beginPath();
      ctx.arc(rx, ry, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Graffiti wildstyle arrow
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(-180, 50);
    ctx.lineTo(-210, 80);
    ctx.lineTo(-150, 80);
    ctx.lineTo(-130, 60);
    ctx.closePath();
    ctx.fill();

    // Graffiti text
    ctx.font = 'bold 76px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Black heavy shadow/outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 14;
    ctx.strokeText(tag, 0, 0);

    // Neon cyan inner glow
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.strokeText(tag, 0, 0);

    // Yellow fill
    ctx.fillStyle = '#ffe600';
    ctx.fillText(tag, 0, 0);

    ctx.restore();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  public static getQuestionBlockTexture(): THREE.CanvasTexture {
    const key = 'question_block';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Golden metallic base
    const grad = ctx.createLinearGradient(0, 0, 256, 256);
    grad.addColorStop(0, '#ffe600');
    grad.addColorStop(0.5, '#e6b800');
    grad.addColorStop(1, '#b38600');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);

    // Dark border
    ctx.lineWidth = 12;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(6, 6, 244, 244);

    // Corner rivets
    const rivets = [
      [24, 24], [232, 24], [24, 232], [232, 232]
    ];
    rivets.forEach(([rx, ry]) => {
      ctx.fillStyle = '#443300';
      ctx.beginPath();
      ctx.arc(rx, ry, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffff66';
      ctx.beginPath();
      ctx.arc(rx - 2, ry - 2, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Question Mark '?'
    ctx.font = 'bold 150px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000000';
    ctx.fillText('?', 132, 134);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('?', 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getEmptyBlockTexture(): THREE.CanvasTexture {
    const key = 'empty_block';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(0, 0, 256, 256);

    ctx.lineWidth = 14;
    ctx.strokeStyle = '#181818';
    ctx.strokeRect(7, 7, 242, 242);

    // Corner rivets
    const rivets = [[24, 24], [232, 24], [24, 232], [232, 232]];
    rivets.forEach(([rx, ry]) => {
      ctx.fillStyle = '#111111';
      ctx.beginPath();
      ctx.arc(rx, ry, 10, 0, Math.PI * 2);
      ctx.fill();
    });

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getBrickBlockTexture(): THREE.CanvasTexture {
    const key = 'brick_single_block';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#110b0a';
    ctx.fillRect(0, 0, 256, 256);

    // 4 brick segments
    ctx.fillStyle = '#a84128';
    ctx.fillRect(6, 6, 118, 118);
    ctx.fillRect(132, 6, 118, 118);
    ctx.fillRect(6, 132, 118, 118);
    ctx.fillRect(132, 132, 118, 118);

    // Brick texture details
    ctx.fillStyle = '#7a2815';
    ctx.fillRect(10, 10, 50, 14);
    ctx.fillRect(140, 30, 40, 14);
    ctx.fillRect(20, 160, 40, 14);
    ctx.fillRect(150, 190, 50, 14);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getCardboardTexture(): THREE.CanvasTexture {
    const key = 'cardboard';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#a67c52';
    ctx.fillRect(0, 0, 256, 256);

    // Packing tape
    ctx.fillStyle = '#c79d6b';
    ctx.fillRect(100, 0, 56, 256);

    // Fragile stencil mark
    ctx.strokeStyle = '#4a2f1b';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 180, 80, 50);
    ctx.fillStyle = '#4a2f1b';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('FRAGILE', 26, 212);

    // Barcode
    ctx.fillStyle = '#2b1b10';
    for (let x = 160; x < 230; x += 4 + Math.random() * 6) {
      ctx.fillRect(x, 190, 2 + Math.random() * 3, 35);
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getVinylRecordTexture(): THREE.CanvasTexture {
    const key = 'vinyl_record';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // Black vinyl
    ctx.fillStyle = '#0a0a0a';
    ctx.beginPath();
    ctx.arc(256, 256, 254, 0, Math.PI * 2);
    ctx.fill();

    // Grooves
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    for (let r = 130; r < 250; r += 6) {
      ctx.beginPath();
      ctx.arc(256, 256, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Center record label
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.arc(256, 256, 110, 0, Math.PI * 2);
    ctx.fill();

    // Red inner ring
    ctx.fillStyle = '#ff1a1a';
    ctx.beginPath();
    ctx.arc(256, 256, 80, 0, Math.PI * 2);
    ctx.fill();

    // Text on label
    ctx.font = 'bold 22px Impact, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';
    ctx.fillText('STREET B-BOY', 256, 240);
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('33 1/3 RPM', 256, 264);

    // Spindle hole
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(256, 256, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(256, 256, 12, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getCassetteLabelTexture(isGold: boolean = false): THREE.CanvasTexture {
    const key = `cassette_${isGold ? 'gold' : 'standard'}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;

    // Background shell
    ctx.fillStyle = isGold ? '#ffe600' : '#1a1a1a';
    ctx.fillRect(0, 0, 256, 160);

    // Label sticker
    ctx.fillStyle = isGold ? '#fff480' : '#00f0ff';
    ctx.fillRect(20, 16, 216, 128);

    // Spool window cutouts
    ctx.fillStyle = isGold ? '#b38600' : '#0a0a0a';
    ctx.beginPath();
    ctx.arc(80, 80, 24, 0, Math.PI * 2);
    ctx.arc(176, 80, 24, 0, Math.PI * 2);
    ctx.fill();

    // Spool cogs
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(80, 80, 8, 0, Math.PI * 2);
    ctx.arc(176, 80, 8, 0, Math.PI * 2);
    ctx.fill();

    // Cassette text
    ctx.font = 'bold 20px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#000000';
    ctx.fillText(isGold ? 'GOLD CYPHER' : 'B-BOY MIX 94', 128, 44);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getAsphaltRoadTexture(): THREE.CanvasTexture {
    const key = 'asphalt_road';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Asphalt grey
    ctx.fillStyle = '#1e1e22';
    ctx.fillRect(0, 0, 512, 256);

    // Pavement noise
    ctx.fillStyle = '#292930';
    for (let i = 0; i < 600; i++) {
      ctx.fillRect(Math.random() * 512, Math.random() * 256, 2, 2);
    }

    // Street yellow curb stripe
    ctx.fillStyle = '#ffe600';
    ctx.fillRect(0, 236, 512, 20);

    // Asphalt cracks
    ctx.strokeStyle = '#111114';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(80, 50);
    ctx.lineTo(130, 90);
    ctx.lineTo(190, 75);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  public static getSpeakerGrilleTexture(): THREE.CanvasTexture {
    const key = 'speaker_grille';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#151515';
    ctx.fillRect(0, 0, 128, 128);

    ctx.fillStyle = '#000000';
    for (let y = 4; y < 128; y += 8) {
      for (let x = 4; x < 128; x += 8) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getSubwayTileTexture(): THREE.CanvasTexture {
    const key = 'subway_tile';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    // White/ivory subway tiles
    ctx.fillStyle = '#e8e8e4';
    ctx.fillRect(0, 0, 512, 512);

    // Grout grid
    ctx.fillStyle = '#444444';
    const tileH = 28;
    const tileW = 56;
    for (let y = 0; y < 512; y += tileH) {
      const offset = (Math.floor(y / tileH) % 2) * (tileW / 2);
      for (let x = -tileW; x < 512 + tileW; x += tileW) {
        ctx.fillStyle = (Math.sin(x * 5 + y * 7) > 0.3) ? '#f2f2ee' : '#e0e0dc';
        ctx.fillRect(x + offset + 1, y + 1, tileW - 2, tileH - 2);
      }
    }

    // Green mosaic top band
    ctx.fillStyle = '#0f5235';
    ctx.fillRect(0, 40, 512, 40);
    ctx.fillStyle = '#ffe600';
    ctx.fillRect(0, 76, 512, 4);

    // Subway tag
    ctx.font = 'bold 64px Impact, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText('42 ST SUBWAY', 64, 72);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  public static getNeonBillboardTexture(text: string): THREE.CanvasTexture {
    const key = `neon_billboard_${text}`;
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Black frame
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, 512, 256);

    // Border neon line
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 480, 224);

    // Neon text
    ctx.font = 'bold 58px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 16;
    ctx.strokeText(text, 256, 128);

    ctx.strokeStyle = '#ff1a1a';
    ctx.lineWidth = 8;
    ctx.strokeText(text, 256, 128);

    ctx.fillStyle = '#ffe600';
    ctx.fillText(text, 256, 128);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getHoodieBackTexture(): THREE.CanvasTexture {
    const key = 'hoodie_back';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Dark hoodie navy fabric
    ctx.fillStyle = '#182030';
    ctx.fillRect(0, 0, 256, 256);

    // Stencil graffiti circle
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(128, 128, 88, 0, Math.PI * 2);
    ctx.stroke();

    // Star icon top
    ctx.fillStyle = '#ff1a1a';
    ctx.beginPath();
    ctx.arc(128, 64, 14, 0, Math.PI * 2);
    ctx.fill();

    // Stencil text
    ctx.font = 'bold 44px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('B-BOY', 128, 115);

    ctx.font = 'bold 52px Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('94', 128, 160);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getManholeTexture(): THREE.CanvasTexture {
    const key = 'manhole_cover';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Dark cast iron
    ctx.fillStyle = '#222226';
    ctx.fillRect(0, 0, 256, 256);

    // Rim
    ctx.strokeStyle = '#3a3a40';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.arc(128, 128, 116, 0, Math.PI * 2);
    ctx.stroke();

    // Vent holes
    ctx.fillStyle = '#0c0c10';
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const hx = 128 + Math.cos(angle) * 75;
      const hy = 128 + Math.sin(angle) * 75;
      ctx.beginPath();
      ctx.arc(hx, hy, 12, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center text
    ctx.font = 'bold 24px Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555560';
    ctx.fillText('NYC STEAM', 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    this.cache.set(key, texture);
    return texture;
  }

  public static getCautionStripesTexture(): THREE.CanvasTexture {
    const key = 'caution_stripes';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#ffe600';
    ctx.fillRect(0, 0, 256, 64);

    ctx.fillStyle = '#111111';
    for (let x = -64; x < 320; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 20, 0);
      ctx.lineTo(x - 10, 64);
      ctx.lineTo(x - 30, 64);
      ctx.closePath();
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }

  public static getWaterTowerTexture(): THREE.CanvasTexture {
    const key = 'water_tower';
    if (this.cache.has(key)) return this.cache.get(key)!;

    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Wood cedar staves
    ctx.fillStyle = '#654321';
    ctx.fillRect(0, 0, 256, 256);

    // Stave vertical lines
    ctx.fillStyle = '#3e2714';
    for (let x = 0; x < 256; x += 16) {
      ctx.fillRect(x, 0, 2, 256);
    }

    // Steel tension hoops
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 40, 256, 12);
    ctx.fillRect(0, 120, 256, 12);
    ctx.fillRect(0, 200, 256, 12);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    this.cache.set(key, texture);
    return texture;
  }
}
