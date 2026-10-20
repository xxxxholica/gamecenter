import * as THREE from 'three';

/**
 * Procedural texture generation for festival stall, wood hinadan, prizes, and signs.
 * Zero external image dependencies.
 */

// Generate realistic cedar / pine wood texture
export function createWoodTexture(baseColor = '#8B4513', grainColor = '#5C2E0B', width = 512, height = 512): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, width, height);

  // Wood grain lines
  ctx.strokeStyle = grainColor;
  ctx.lineWidth = 1.5;

  for (let y = 0; y < height; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= width; x += 16) {
      const noise = Math.sin(x * 0.03 + y * 0.05) * 3 + Math.sin(x * 0.1) * 2;
      ctx.lineTo(x, y + noise);
    }
    ctx.globalAlpha = 0.18 + Math.sin(y * 0.15) * 0.12;
    ctx.stroke();
  }

  // Dark plank rings / knots
  ctx.globalAlpha = 0.25;
  for (let i = 0; i < 3; i++) {
    const kx = (i * 180 + 90) % width;
    const ky = (i * 140 + 60) % height;
    ctx.beginPath();
    ctx.ellipse(kx, ky, 25, 8, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = grainColor;
    ctx.fill();
  }

  ctx.globalAlpha = 1.0;
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Generate Red & White festival stripe canopy texture (紅白の段だら縞)
export function createStripeCanopyTexture(width = 512, height = 256): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  const stripeWidth = 40;
  for (let x = 0; x < width; x += stripeWidth) {
    const isRed = Math.floor(x / stripeWidth) % 2 === 0;
    ctx.fillStyle = isRed ? '#d91414' : '#f5f5f0';
    ctx.fillRect(x, 0, stripeWidth, height);

    // Subtle shading on stripe seams
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(x + stripeWidth - 2, 0, 2, height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// Generate Daruma face and gold chest ornament texture
export function createDarumaTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Brilliant Gold background
  const grad = ctx.createRadialGradient(256, 256, 50, 256, 256, 256);
  grad.addColorStop(0, '#ffd700');
  grad.addColorStop(0.7, '#e6ac00');
  grad.addColorStop(1, '#b38600');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Face oval (white porcelain)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(256, 190, 110, 85, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#d91414';
  ctx.stroke();

  // Red eye rings
  ctx.fillStyle = '#d91414';
  ctx.beginPath();
  ctx.arc(205, 175, 28, 0, Math.PI * 2);
  ctx.arc(307, 175, 28, 0, Math.PI * 2);
  ctx.fill();

  // White inner eyes
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(205, 175, 22, 0, Math.PI * 2);
  ctx.arc(307, 175, 22, 0, Math.PI * 2);
  ctx.fill();

  // Fierce black pupils
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(205, 175, 14, 0, Math.PI * 2);
  ctx.arc(307, 175, 14, 0, Math.PI * 2);
  ctx.fill();

  // Fierce Daruma eyebrows (crane wings style 鶴の眉)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  // Left eyebrow
  ctx.beginPath();
  ctx.moveTo(160, 140);
  ctx.quadraticCurveTo(205, 120, 235, 145);
  ctx.stroke();
  // Right eyebrow
  ctx.beginPath();
  ctx.moveTo(352, 140);
  ctx.quadraticCurveTo(307, 120, 277, 145);
  ctx.stroke();

  // Fierce mustache / beard (turtle style 亀の髭)
  ctx.beginPath();
  ctx.moveTo(170, 230);
  ctx.quadraticCurveTo(210, 210, 256, 230);
  ctx.quadraticCurveTo(302, 210, 342, 230);
  ctx.stroke();

  // Gold chest Kanji "福" (Fortune) with thick black stroke
  ctx.font = 'bold 88px "Hiragino Mincho ProN", "Yu Mincho", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#d91414';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 10;
  ctx.strokeText('福', 256, 360);
  ctx.fillText('福', 256, 360);

  // Red decorative chest ribbons
  ctx.fillStyle = '#d91414';
  ctx.beginPath();
  ctx.arc(150, 360, 15, 0, Math.PI * 2);
  ctx.arc(362, 360, 15, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// Generate Tin Robot chest dial & face texture
export function createRobotTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Retro turquoise tin metal body
  ctx.fillStyle = '#2c7a7b';
  ctx.fillRect(0, 0, 256, 256);

  // Meter gauge panel
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#1a202c';
  ctx.lineWidth = 4;
  ctx.strokeRect(30, 30, 196, 110);
  ctx.fillRect(30, 30, 196, 110);

  // Gauge meter arch
  ctx.strokeStyle = '#d91414';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(128, 120, 60, Math.PI, 0);
  ctx.stroke();

  // Meter needle
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(128, 120);
  ctx.lineTo(165, 80);
  ctx.stroke();

  // Danger zone on gauge
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('MAX 999', 128, 130);

  // Lower decorative grills & buttons
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(70, 190, 20, 0, Math.PI * 2);
  ctx.arc(128, 190, 20, 0, Math.PI * 2);
  ctx.arc(186, 190, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}

// Generate Ramune Bottle retro label
export function createRamuneLabelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 256);

  // Red diamond border
  ctx.strokeStyle = '#0984e3';
  ctx.lineWidth = 8;
  ctx.strokeRect(15, 15, 226, 226);

  ctx.fillStyle = '#d91414';
  ctx.beginPath();
  ctx.arc(128, 70, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px "Hiragino Kaku Gothic StdN", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('祭', 128, 70);

  ctx.fillStyle = '#0984e3';
  ctx.font = 'bold 36px "Hiragino Mincho ProN", serif';
  ctx.fillText('元祖ラムネ', 128, 140);

  ctx.fillStyle = '#2d3436';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('特製 清涼飲料水', 128, 190);

  return new THREE.CanvasTexture(canvas);
}

// Generate Caramel Snack Box texture
export function createCaramelBoxTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Retro yellow caramel package
  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(0, 0, 256, 256);

  // Red ribbons
  ctx.fillStyle = '#d91414';
  ctx.fillRect(0, 30, 256, 40);
  ctx.fillRect(0, 186, 256, 40);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px "Hiragino Kaku Gothic StdN", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('伝統の味', 128, 50);
  ctx.fillText('特選 濃厚風味', 128, 206);

  // Big central text
  ctx.fillStyle = '#d91414';
  ctx.font = '900 42px "Hiragino Mincho ProN", serif';
  ctx.fillText('キャラメル', 128, 120);

  return new THREE.CanvasTexture(canvas);
}

// Generate Lantern "祭" / "射的" texture
export function createLanternTexture(text = '射的'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Red paper lantern background
  ctx.fillStyle = '#d91414';
  ctx.fillRect(0, 0, 256, 256);

  // Black ribbing lines of paper lantern
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 3;
  for (let y = 15; y < 256; y += 22) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y);
    ctx.stroke();
  }

  // White kanji with black outline
  ctx.font = 'bold 84px "Hiragino Mincho ProN", "Yu Mincho", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 12;
  ctx.strokeText(text, 128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, 128, 128);

  return new THREE.CanvasTexture(canvas);
}

// Generate Stall Banner (屋台の暖簾/垂れ幕) texture
export function createStallBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Deep indigo traditional curtain (伝統の藍染め)
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 1024, 256);

  // White geometric wave / crest pattern at bottom
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 235, 1024, 10);

  // Big bold Japanese festival typography
  ctx.font = '900 110px "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffcc00';
  ctx.strokeStyle = '#d91414';
  ctx.lineWidth = 14;
  ctx.strokeText('爆 速 縁 日 射 的', 512, 128);
  ctx.fillText('爆 速 縁 日 射 的', 512, 128);

  return new THREE.CanvasTexture(canvas);
}

// Generate Maneki-Neko (招き猫) coin & facial features texture
export function createManekiNekoTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // White glossy base
  ctx.fillStyle = '#fdfbf7';
  ctx.fillRect(0, 0, 256, 256);

  // Calico orange & black patches on back/sides
  ctx.fillStyle = '#d35400';
  ctx.beginPath();
  ctx.arc(40, 40, 35, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(210, 50, 28, 0, Math.PI * 2);
  ctx.fill();

  // Face: smiling happy eyes (closed crescent style)
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(85, 110, 18, Math.PI, 0); // Left eye
  ctx.arc(171, 110, 18, Math.PI, 0); // Right eye
  ctx.stroke();

  // Pink nose & mouth
  ctx.fillStyle = '#ff7675';
  ctx.beginPath();
  ctx.arc(128, 126, 6, 0, Math.PI * 2);
  ctx.fill();

  // Whiskers
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 3;
  // Left whiskers
  ctx.beginPath();
  ctx.moveTo(70, 126); ctx.lineTo(30, 120);
  ctx.moveTo(70, 134); ctx.lineTo(32, 138);
  // Right whiskers
  ctx.moveTo(186, 126); ctx.lineTo(226, 120);
  ctx.moveTo(186, 134); ctx.lineTo(224, 138);
  ctx.stroke();

  // Gold Koban coin at bottom ("千万両")
  ctx.fillStyle = '#f1c40f';
  ctx.strokeStyle = '#b7950b';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(128, 200, 36, 50, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 24px "Hiragino Mincho ProN", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('千万両', 128, 200);

  return new THREE.CanvasTexture(canvas);
}

// Generate Retro CRT TV texture (昭和レトロテレビ)
export function createRetroTVTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Retro woodgrain frame
  ctx.fillStyle = '#4a250e';
  ctx.fillRect(0, 0, 256, 256);

  // CRT Screen area (beveled glass)
  ctx.fillStyle = '#1e272e';
  ctx.fillRect(20, 20, 160, 216);

  // Scanlines & arcade test pattern
  ctx.fillStyle = '#ffcc00';
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('祭 射的 CH', 100, 100);

  ctx.fillStyle = '#d91414';
  ctx.font = 'bold 36px monospace';
  ctx.fillText('特賞 400', 100, 150);

  // TV Control knobs on right panel
  ctx.fillStyle = '#2f3542';
  ctx.fillRect(190, 20, 50, 216);

  // Two rotary channel dials
  ctx.fillStyle = '#747d8c';
  ctx.beginPath();
  ctx.arc(215, 70, 18, 0, Math.PI * 2);
  ctx.arc(215, 140, 18, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffd32a';
  ctx.fillRect(212, 54, 6, 16);
  ctx.fillRect(212, 124, 6, 16);

  // Speaker grill lines
  ctx.fillStyle = '#111111';
  for (let y = 180; y < 225; y += 8) {
    ctx.fillRect(196, y, 38, 3);
  }

  return new THREE.CanvasTexture(canvas);
}

// Generate Gold Koban Treasure Box texture (千両箱)
export function createTreasureBoxTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Black lacquered chest with gold fittings (黒漆・千両箱)
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, 256, 256);

  // Gold iron bands across chest
  ctx.fillStyle = '#f1c40f';
  ctx.fillRect(20, 0, 30, 256);
  ctx.fillRect(206, 0, 30, 256);
  ctx.fillRect(0, 40, 256, 24);
  ctx.fillRect(0, 192, 256, 24);

  // Center gold lockplate with "千両" Kanji
  ctx.fillStyle = '#ffd700';
  ctx.beginPath();
  ctx.arc(128, 128, 55, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#b7950b';
  ctx.stroke();

  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px "Hiragino Mincho ProN", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('千両', 128, 128);

  return new THREE.CanvasTexture(canvas);
}

// Generate Festival Cider / Juice Can texture (特選サイダー缶)
export function createJuiceCanTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Bright red / yellow festival soda can
  const grad = ctx.createLinearGradient(0, 0, 256, 0);
  grad.addColorStop(0, '#ff4757');
  grad.addColorStop(0.5, '#ffa502');
  grad.addColorStop(1, '#ff4757');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // Retro bold stars & banners
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 30, 256, 12);
  ctx.fillRect(0, 214, 256, 12);

  ctx.font = '900 42px "Hiragino Kaku Gothic StdN", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 6;
  ctx.strokeText('爆速サイダー', 128, 128);
  ctx.fillText('爆速サイダー', 128, 128);

  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#fffa65';
  ctx.fillText('SUPER ENNICHI SODA', 128, 175);

  return new THREE.CanvasTexture(canvas);
}

// Generate Carnival Target Duck texture (射的の的アヒル)
export function createDuckTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffcc00';
  ctx.fillRect(0, 0, 128, 128);

  // Big target bullseye on duck body
  ctx.strokeStyle = '#d91414';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(64, 64, 45, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#d91414';
  ctx.beginPath();
  ctx.arc(64, 64, 20, 0, Math.PI * 2);
  ctx.fill();

  // White center pip
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 8, 0, Math.PI * 2);
  ctx.fill();

  return new THREE.CanvasTexture(canvas);
}

// Generate Festival Pinwheel (風車・かざぐるま) texture
export function createPinwheelTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const colors = ['#d91414', '#ffcc00', '#0984e3', '#00b894'];
  const cx = 128;
  const cy = 128;
  const numBlades = 4;

  for (let i = 0; i < numBlades; i++) {
    const angleStart = (i * Math.PI * 2) / numBlades;
    const angleEnd = ((i + 1) * Math.PI * 2) / numBlades;

    ctx.fillStyle = colors[i % colors.length];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, 120, angleStart, angleEnd);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000000';
    ctx.stroke();
  }

  // Center gold pin
  ctx.fillStyle = '#f1c40f';
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  return new THREE.CanvasTexture(canvas);
}
