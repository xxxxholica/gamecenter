import * as THREE from 'three';

/**
 * プロシージャルテクスチャ生成ヘルパー
 * 外部テクスチャ画像を使わず、HTML5 Canvas APIでゲーム内のすべての素材を自作
 */

// 木目調フローリング（床）
export function createFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // ベースの飴色・琥珀色（学校の古いワックスがけ木造床）
  ctx.fillStyle = '#8f532a';
  ctx.fillRect(0, 0, 1024, 1024);

  // フローリングの板割り
  const plankHeight = 64;
  const plankWidth = 256;

  for (let y = 0; y < 1024; y += plankHeight) {
    const shift = (Math.floor(y / plankHeight) % 2) * (plankWidth / 2);
    for (let x = -shift; x < 1024; x += plankWidth) {
      // 板ごとに少し明度・色合いを変える
      const hueVariance = (Math.random() - 0.5) * 10;
      const lightVariance = (Math.random() - 0.5) * 16;
      ctx.fillStyle = `hsl(${25 + hueVariance}, 55%, ${36 + lightVariance}%)`;
      ctx.fillRect(x, y, plankWidth - 2, plankHeight - 2);

      // 板内の木目ストライプ
      ctx.strokeStyle = `rgba(60, 30, 10, ${0.15 + Math.random() * 0.15})`;
      ctx.lineWidth = 1 + Math.random();
      for (let grain = 0; grain < 6; grain++) {
        const gy = y + Math.random() * plankHeight;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.bezierCurveTo(
          x + plankWidth * 0.3, gy + (Math.random() - 0.5) * 10,
          x + plankWidth * 0.7, gy + (Math.random() - 0.5) * 10,
          x + plankWidth, gy
        );
        ctx.stroke();
      }
    }
  }

  // 目地の暗い影
  ctx.strokeStyle = '#2b1609';
  ctx.lineWidth = 2;
  for (let y = 0; y <= 1024; y += plankHeight) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 8);
  return texture;
}

// 教室の壁 & 掲示板（右壁など）
export function createWallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 上部: クリーム色の漆喰/ペンキ壁
  ctx.fillStyle = '#f4ebd0';
  ctx.fillRect(0, 0, 1024, 380);

  // 下部: 木製の腰壁（学校の定番）
  ctx.fillStyle = '#6e3c1d';
  ctx.fillRect(0, 380, 1024, 132);

  // 腰壁の木枠見切り
  ctx.fillStyle = '#4a2510';
  ctx.fillRect(0, 372, 1024, 12);
  ctx.fillRect(0, 500, 1024, 12);

  // 縦の木製羽目板ライン
  ctx.strokeStyle = '#3e200c';
  ctx.lineWidth = 2;
  for (let x = 0; x < 1024; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 384);
    ctx.lineTo(x, 500);
    ctx.stroke();
  }

  // 掲示板（コルクボード風）
  ctx.fillStyle = '#a67b4b';
  ctx.fillRect(80, 40, 380, 240);
  // 掲示板アルミ枠
  ctx.strokeStyle = '#737373';
  ctx.lineWidth = 8;
  ctx.strokeRect(80, 40, 380, 240);

  // 掲示板のポスター・習字・時間割
  // 習字1: 「廊下静粛」
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(100, 60, 60, 120);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 16px serif';
  ctx.fillText('廊', 120, 85);
  ctx.fillText('下', 120, 115);
  ctx.fillText('静', 120, 145);
  ctx.fillText('粛', 120, 175);

  // 習字2: 「爆走禁止」
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(175, 60, 60, 120);
  ctx.fillStyle = '#b71c1c';
  ctx.fillText('爆', 195, 85);
  ctx.fillText('走', 195, 115);
  ctx.fillText('禁', 195, 145);
  ctx.fillText('止', 195, 175);

  // 学園祭ポスター
  ctx.fillStyle = '#ffecb3';
  ctx.fillRect(250, 60, 100, 130);
  ctx.fillStyle = '#d84315';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('秋の学園祭', 255, 90);
  ctx.fillStyle = '#333';
  ctx.font = '11px sans-serif';
  ctx.fillText('文化祭開催中！', 255, 115);
  ctx.fillText('廊下走行厳禁', 255, 135);
  ctx.fillText('生活指導部', 255, 155);

  // 保健だより
  ctx.fillStyle = '#e8f5e9';
  ctx.fillRect(365, 80, 80, 100);
  ctx.fillStyle = '#2e7d32';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('保健だより', 370, 105);
  ctx.font = '10px sans-serif';
  ctx.fillText('怪我に注意', 370, 130);

  // 教室ドア（引き戸）
  ctx.fillStyle = '#7a4521';
  ctx.fillRect(560, 30, 420, 470);
  // ドアの窓ガラス: 左壁の窓と同じく実際に透過させ、奥の教室(addClassroomInterior)を覗けるようにする
  ctx.fillStyle = '#3e2723';
  ctx.fillRect(596, 56, 148, 248); // サッシ枠
  ctx.fillRect(776, 56, 148, 248);
  ctx.clearRect(600, 60, 140, 240);
  ctx.clearRect(780, 60, 140, 240);
  // クラス表示札「3年B組」
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(520, 20, 35, 100);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('3', 530, 45);
  ctx.fillText('年', 530, 65);
  ctx.fillText('B', 530, 85);
  ctx.fillText('組', 530, 105);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 教室の窓側（左壁: 夕暮れの茜色の空と窓枠）
/**
 * 左壁(窓側): 窓枠と腰壁だけを描く。ガラスの部分は透明にして、窓の外の景色(Corridor の屋外シーン)を直接見せる。
 * 1枚で壁の横9m分(3枚の窓)。Corridor 側で横に繰り返して使う。
 */
export function createWindowWallTexture(): THREE.CanvasTexture {
  const W = 768, H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, W, H);

  const sillTop = 478; // これより下は腰壁(高さ約1.9m)
  // 下部腰壁
  ctx.fillStyle = '#6e3c1d';
  ctx.fillRect(0, sillTop, W, H - sillTop);
  ctx.fillStyle = '#4a2510';
  ctx.fillRect(0, sillTop - 8, W, 14);
  // 腰壁の羽目板の溝
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < W; x += 64) ctx.fillRect(x, sillTop + 6, 3, H - sillTop - 6);

  // 窓枠(サッシ): 3枚の窓、縦の柱、中桟、上枠
  ctx.fillStyle = '#3e2723';
  const panes = 3;
  const paneW = W / panes;
  for (let i = 0; i < panes; i++) {
    const px = i * paneW;
    ctx.fillRect(px, 0, 14, sillTop);            // 柱
    ctx.fillRect(px, 215, paneW, 12);            // 中桟
    ctx.fillRect(px, 0, paneW, 14);              // 上枠
    // ガラスの縁のハイライト
    ctx.fillStyle = 'rgba(255, 224, 178, 0.35)';
    ctx.fillRect(px + 14, 14, 3, sillTop - 22);
    ctx.fillStyle = '#3e2723';
  }
  ctx.fillRect(W - 14, 0, 14, sillTop);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 左壁(窓なし版): 窓側と同じ配色・腰壁で統一感を保ちつつ、窓を入れない単調な壁面。
 * たまに窓の区画と入れ替えて使い、左側がずっと窓だけにならないようにする。
 */
export function createPlainWallTexture(): THREE.CanvasTexture {
  const W = 768, H = 640;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const sillTop = 478; // 窓側と同じ腰壁の高さ
  // 上部: 窓側と同じクリーム色の漆喰壁
  ctx.fillStyle = '#f4ebd0';
  ctx.fillRect(0, 0, W, sillTop);

  // 下部腰壁(窓側と同じ配色)
  ctx.fillStyle = '#6e3c1d';
  ctx.fillRect(0, sillTop, W, H - sillTop);
  ctx.fillStyle = '#4a2510';
  ctx.fillRect(0, sillTop - 8, W, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < W; x += 64) ctx.fillRect(x, sillTop + 6, 3, H - sillTop - 6);

  // うっすらした継ぎ目(窓側の柱と同じリズムを保ち、単調になりすぎないようにする)
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  const panes = 3;
  const paneW = W / panes;
  for (let i = 1; i < panes; i++) {
    ctx.fillRect(i * paneW - 1, 0, 2, sillTop);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * 窓の外の空。夕焼けのグラデーション・巨大な夕日・雲・遠い山並み。
 * 横は260m・縦は100mの板に貼る想定で、地平線は下から約20%の高さ。
 */
export function createOutsideSkyTexture(): THREE.CanvasTexture {
  const W = 1024, H = 512;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const horizon = Math.round(H * 0.8);

  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, '#1d1048');
  sky.addColorStop(0.3, '#6a1b6e');
  sky.addColorStop(0.55, '#c2185b');
  sky.addColorStop(0.8, '#ff7043');
  sky.addColorStop(1, '#ffe082');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // 巨大な夕日(地平線の近くに半分沈む)
  const sunX = 640, sunY = horizon - 40;
  const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 260);
  glow.addColorStop(0, 'rgba(255,255,255,1)');
  glow.addColorStop(0.18, 'rgba(255,245,157,0.95)');
  glow.addColorStop(0.5, 'rgba(255,112,67,0.45)');
  glow.addColorStop(1, 'rgba(255,112,67,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 横に長く伸びる雲(夕日に染まった帯)
  for (let i = 0; i < 9; i++) {
    const cy = 60 + i * 34 + (i % 3) * 10;
    const cx = (i * 331) % W;
    const cw = 260 + (i % 4) * 90;
    const grad = ctx.createLinearGradient(cx, cy, cx + cw, cy);
    grad.addColorStop(0, 'rgba(255,171,145,0)');
    grad.addColorStop(0.5, i % 2 ? 'rgba(255,138,101,0.55)' : 'rgba(244,143,177,0.5)');
    grad.addColorStop(1, 'rgba(255,171,145,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(cx + cw / 2, cy, cw / 2, 9 + (i % 3) * 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 遠い山並み(2層)
  const ridge = (baseY: number, amp: number, seed: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, horizon + 4);
    for (let x = 0; x <= W; x += 16) {
      const y = baseY - amp * (0.5 + 0.5 * Math.sin(x * 0.011 + seed) * Math.sin(x * 0.0037 + seed * 2.3)) - amp * 0.25 * Math.sin(x * 0.043 + seed);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, horizon + 4);
    ctx.closePath();
    ctx.fill();
  };
  ridge(horizon - 8, 70, 1.2, '#5a1f5c');
  ridge(horizon - 2, 42, 4.1, '#3a1448');

  // 地平線より下は暗い地面色(屋外の地面板に隠れる部分)
  ctx.fillStyle = '#2a1230';
  ctx.fillRect(0, horizon + 2, W, H - horizon);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** 遠景の校舎の窓(黄色く点灯した窓がまばらに並ぶ)。 */
export function createBuildingWindowsTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#2c2038';
  ctx.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 12; y < 256; y += 40) {
    for (let x = 10; x < 256; x += 32) {
      ctx.fillStyle = rand() < 0.35 ? '#ffd27a' : '#41314f';
      ctx.fillRect(x, y, 20, 24);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// 吊り下げ看板「廊下は走るな！！」
export function createSignboardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  // 看板ベース（学校の緑色の鉄板）
  ctx.fillStyle = '#1b5e20';
  ctx.fillRect(0, 0, 512, 160);

  // 黄色と黒の警告ストライプ枠
  ctx.lineWidth = 10;
  ctx.strokeStyle = '#ffd600';
  ctx.strokeRect(6, 6, 500, 148);

  // 警告アイコン（三角形）
  ctx.fillStyle = '#ffd600';
  ctx.beginPath();
  ctx.moveTo(40, 120);
  ctx.lineTo(70, 40);
  ctx.lineTo(100, 120);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('!', 62, 112);

  // 文字「廊下走行禁止」
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('廊下走行禁止', 290, 60);

  // サブテキスト「スライディング」
  ctx.fillStyle = '#ffea00';
  ctx.font = '900 24px sans-serif';
  ctx.fillText('スライディング', 290, 115);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 百科事典ボムのテクスチャ（重厚なハードカバー & 金箔押し装飾）
export function createDictionaryCoverTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 深紅の高級クロス装丁
  ctx.fillStyle = '#4a0e17';
  ctx.fillRect(0, 0, 512, 512);

  // 金箔の装飾フレーム
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 8;
  ctx.strokeRect(24, 24, 464, 464);
  ctx.lineWidth = 2;
  ctx.strokeRect(34, 34, 444, 444);

  // コーナー飾り
  const drawCorner = (cx: number, cy: number) => {
    ctx.fillStyle = '#ffd700';
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI * 2);
    ctx.fill();
  };
  drawCorner(44, 44);
  drawCorner(468, 44);
  drawCorner(44, 468);
  drawCorner(468, 468);

  // 金文字「大日本 百科事典」
  ctx.fillStyle = '#ffea75';
  ctx.textAlign = 'center';
  ctx.font = '900 48px serif';
  ctx.fillText('大日本', 256, 160);
  ctx.font = '900 64px serif';
  ctx.fillText('百科事典', 256, 250);
  ctx.font = 'bold 32px serif';
  ctx.fillText('― 極厚爆弾特装版 ―', 256, 330);
  ctx.font = 'bold 24px monospace';
  ctx.fillText('重量 5.2kg / 威力絶大', 256, 400);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 百科事典の小口（側面ページ）
export function createBookPagesTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // アイボリーの紙
  ctx.fillStyle = '#fff8e7';
  ctx.fillRect(0, 0, 256, 256);

  // 金付け（上部・横の金色小口）
  ctx.fillStyle = '#cca03b';
  for (let y = 0; y < 256; y += 4) {
    if (Math.random() > 0.4) {
      ctx.fillRect(0, y, 256, 2);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 単語帳シュリケン用テクスチャ（表紙・英単語）
export function createWordCardTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // 白い厚紙
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 128);

  // 左側のリング穴
  ctx.fillStyle = '#333333';
  ctx.beginPath();
  ctx.arc(28, 64, 12, 0, Math.PI * 2);
  ctx.fill();

  // 単語帳の表紙デザイン
  ctx.fillStyle = '#e91e63';
  ctx.fillRect(52, 12, 190, 104);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 18px sans-serif';
  ctx.fillText('高校 必携英単語', 65, 42);
  ctx.font = '900 24px monospace';
  ctx.fillText('PASS!! 3000', 65, 75);
  ctx.font = '14px sans-serif';
  ctx.fillText('単語帳シュリケン', 65, 100);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 生活指導の先生の顔
export function createTeacherFaceTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // 肌色ベース
  ctx.fillStyle = '#ffcca6';
  ctx.fillRect(0, 0, 256, 256);

  // 怒り眉
  ctx.fillStyle = '#222222';
  ctx.beginPath();
  ctx.moveTo(50, 80);
  ctx.lineTo(100, 105);
  ctx.lineTo(95, 115);
  ctx.lineTo(45, 90);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(206, 80);
  ctx.lineTo(156, 105);
  ctx.lineTo(161, 115);
  ctx.lineTo(211, 90);
  ctx.closePath();
  ctx.fill();

  // 黒縁メガネフレーム
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 8;
  ctx.strokeRect(40, 100, 70, 50);
  ctx.strokeRect(146, 100, 70, 50);
  // ブリッジ
  ctx.beginPath();
  ctx.moveTo(110, 125);
  ctx.lineTo(146, 125);
  ctx.stroke();

  // メガネの光るハイライト（白ライン）
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(50, 110);
  ctx.lineTo(90, 140);
  ctx.moveTo(156, 110);
  ctx.lineTo(196, 140);
  ctx.stroke();

  // 険しい口（一文字、怒り）
  ctx.strokeStyle = '#6d2626';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(80, 200);
  ctx.lineTo(176, 200);
  ctx.stroke();

  // 額の青筋マーク（怒りマーク）
  ctx.strokeStyle = '#d32f2f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(190, 40);
  ctx.lineTo(220, 40);
  ctx.moveTo(205, 25);
  ctx.lineTo(205, 55);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 跳び箱の数字テクスチャ
export function createVaultingBoxTexture(level: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  // 明るい木目
  ctx.fillStyle = '#e5b877';
  ctx.fillRect(0, 0, 256, 128);

  // 枠線
  ctx.strokeStyle = '#a67230';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 256, 128);

  // 段数表記
  ctx.fillStyle = '#222222';
  ctx.font = '900 72px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${level}`, 128, 64);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// ロッカーの扉テクスチャ
export function createLockerDoorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // スチールグレー
  ctx.fillStyle = '#78909c';
  ctx.fillRect(0, 0, 256, 512);

  // 枠の陰影
  ctx.strokeStyle = '#546e7a';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, 256, 512);

  // 上部の通気スリット（3本）
  ctx.fillStyle = '#37474f';
  for (let y = 60; y <= 100; y += 18) {
    ctx.fillRect(40, y, 176, 8);
  }

  // 名札入れ（アルミ枠）
  ctx.fillStyle = '#cfd8dc';
  ctx.fillRect(40, 160, 80, 40);
  ctx.fillStyle = '#263238';
  ctx.font = 'bold 16px sans-serif';
  ctx.fillText('3-A', 55, 186);

  // ドア取っ手・鍵穴
  ctx.fillStyle = '#263238';
  ctx.fillRect(200, 240, 16, 60);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 全レーン封鎖横断幕「廊下を走るな！スライディングで潜れ！」
export function createBannerTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // 白い布幕
  ctx.fillStyle = '#f5f5f5';
  ctx.fillRect(0, 0, 1024, 256);

  // 赤い縁取り
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#d50000';
  ctx.strokeRect(6, 6, 1012, 244);

  // 黄色と黒のトラ柄ストライプ（上下）
  const stripeW = 32;
  for (let x = 0; x < 1024; x += stripeW * 2) {
    ctx.fillStyle = '#ffd600';
    ctx.fillRect(x, 10, stripeW, 20);
    ctx.fillRect(x, 226, stripeW, 20);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + stripeW, 10, stripeW, 20);
    ctx.fillRect(x + stripeW, 226, stripeW, 20);
  }

  // メイン標語「廊下走行厳禁」
  ctx.fillStyle = '#b71c1c';
  ctx.font = '900 64px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('廊下走行厳禁', 512, 100);

  // サブテキスト「スライディング」
  ctx.fillStyle = '#111111';
  ctx.font = '900 40px sans-serif';
  ctx.fillText('スライディング', 512, 175);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 全レーン封鎖 巨大段ボールタワー/バリケードテクスチャ
export function createCardboardBarricadeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // クラフト段ボール色
  ctx.fillStyle = '#c59b6d';
  ctx.fillRect(0, 0, 512, 512);

  // 箱の継ぎ目グリッド
  ctx.strokeStyle = '#8d6e4b';
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, 512, 512);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.moveTo(0, 256);
  ctx.lineTo(512, 256);
  ctx.stroke();

  // ガムテープ（布テープ）
  ctx.fillStyle = '#9e794e';
  ctx.fillRect(100, 246, 312, 20);
  ctx.fillRect(246, 60, 20, 392);

  // スタンプ「取扱注意」
  ctx.strokeStyle = '#b71c1c';
  ctx.lineWidth = 6;
  ctx.strokeRect(40, 40, 180, 80);
  ctx.fillStyle = '#b71c1c';
  ctx.font = 'bold 30px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('取扱注意', 130, 90);

  // 封鎖バリケード & ボム指示
  ctx.fillStyle = '#d50000';
  ctx.font = '900 44px sans-serif';
  ctx.fillText('封鎖バリケード', 256, 330);
  ctx.font = '900 32px sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText('辞書ボムで爆破', 256, 385);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 暴走配膳台 床の赤い警告矢印ラインテクスチャ
export function createWarningArrowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 半透明黒背景
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, 128, 512);

  // 連続する赤い手前向き矢印
  ctx.fillStyle = '#ff1744';
  ctx.strokeStyle = '#ff8a80';
  ctx.lineWidth = 4;

  const arrowCount = 4;
  const step = 512 / arrowCount;

  for (let i = 0; i < arrowCount; i++) {
    const y = i * step;
    ctx.beginPath();
    ctx.moveTo(64, y + step * 0.85); // 矢印先端
    ctx.lineTo(20, y + step * 0.35);
    ctx.lineTo(44, y + step * 0.35);
    ctx.lineTo(44, y + step * 0.1);
    ctx.lineTo(84, y + step * 0.1);
    ctx.lineTo(84, y + step * 0.35);
    ctx.lineTo(108, y + step * 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// バウンドボール用テクスチャ（バスケットボール）
export function createBasketBallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // バスケットボールのオレンジ革
  ctx.fillStyle = '#e65100';
  ctx.fillRect(0, 0, 512, 256);

  // ドットシボ
  ctx.fillStyle = '#bf360c';
  for (let i = 0; i < 600; i++) {
    const rx = Math.random() * 512;
    const ry = Math.random() * 256;
    ctx.fillRect(rx, ry, 2, 2);
  }

  // 黒いリブライン
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(512, 128);
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 256);
  ctx.stroke();

  // 曲線リブライン
  ctx.beginPath();
  ctx.ellipse(128, 128, 80, 120, 0, 0, Math.PI * 2);
  ctx.ellipse(384, 128, 80, 120, 0, 0, Math.PI * 2);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// カラーコーン・コーンバー用（黄色と黒の警戒ストライプ ＆ 清掃中サイン）
export function createConeStripeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // 鮮やかな黄色ベース
  ctx.fillStyle = '#ffeb3b';
  ctx.fillRect(0, 0, 256, 256);

  // 黒の斜め警戒ストライプ
  ctx.fillStyle = '#111111';
  ctx.lineWidth = 32;
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 48, 0);
    ctx.lineTo(i + 48 + 256, 256);
    ctx.lineTo(i + 256, 256);
    ctx.closePath();
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

// 激しく燃え盛る火炎（飛び越え不能・完全迂回必須）テクスチャ
export function createFlameTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 512);

  // 1. 背景の火炎オーラ（赤〜オレンジのグラデーション）
  const flameGrad = ctx.createLinearGradient(128, 512, 128, 0);
  flameGrad.addColorStop(0.0, 'rgba(255, 255, 220, 1.0)'); // 底面: 白熱
  flameGrad.addColorStop(0.2, 'rgba(255, 200, 30, 0.95)'); // 下部: 鮮烈イエロー
  flameGrad.addColorStop(0.5, 'rgba(255, 80, 0, 0.85)');   // 中央: 燃えるオレンジ
  flameGrad.addColorStop(0.8, 'rgba(200, 20, 0, 0.55)');   // 上部: 深紅
  flameGrad.addColorStop(1.0, 'rgba(80, 0, 0, 0.0)');      // 先端: 消滅

  // 炎の舌（有機的なカーブを描く）
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(30, 512);
  ctx.bezierCurveTo(20, 380, 60, 250, 100, 140);
  ctx.bezierCurveTo(115, 80, 125, 20, 128, 0);
  ctx.bezierCurveTo(131, 20, 141, 80, 156, 140);
  ctx.bezierCurveTo(196, 250, 236, 380, 226, 512);
  ctx.closePath();
  ctx.fill();

  // 2. 側面のゆらめく火炎の舌
  ctx.fillStyle = 'rgba(255, 120, 0, 0.65)';
  ctx.beginPath();
  ctx.moveTo(10, 512);
  ctx.quadraticCurveTo(20, 340, 75, 220);
  ctx.quadraticCurveTo(85, 300, 60, 420);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(246, 512);
  ctx.quadraticCurveTo(236, 340, 181, 220);
  ctx.quadraticCurveTo(171, 300, 196, 420);
  ctx.closePath();
  ctx.fill();

  // 3. 中心の超高温コア（白熱するコアフレーム）
  const coreGrad = ctx.createLinearGradient(128, 512, 128, 120);
  coreGrad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  coreGrad.addColorStop(0.4, 'rgba(255, 255, 180, 0.9)');
  coreGrad.addColorStop(0.7, 'rgba(255, 210, 60, 0.5)');
  coreGrad.addColorStop(1.0, 'rgba(255, 140, 0, 0.0)');

  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.moveTo(70, 512);
  ctx.bezierCurveTo(80, 400, 110, 280, 128, 120);
  ctx.bezierCurveTo(146, 280, 176, 400, 186, 512);
  ctx.closePath();
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 焦土・焼け跡床テクスチャ
export function createCharredFloorTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // 外側に向かって薄れる黒焦げグラデーション
  const grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 124);
  grad.addColorStop(0.0, 'rgba(20, 10, 5, 0.95)');
  grad.addColorStop(0.35, 'rgba(35, 18, 10, 0.88)');
  grad.addColorStop(0.7, 'rgba(25, 12, 8, 0.55)');
  grad.addColorStop(0.9, 'rgba(15, 8, 5, 0.2)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0.0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();

  // 中心部の赤熱した割れ目・残り火（Ember cracks）
  ctx.strokeStyle = 'rgba(255, 90, 0, 0.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(100, 120);
  ctx.lineTo(125, 115);
  ctx.lineTo(145, 135);
  ctx.lineTo(165, 125);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 180, 30, 0.9)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(115, 135);
  ctx.lineTo(130, 125);
  ctx.lineTo(140, 145);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// ゴールドコイン（高得点アイテム）テクスチャ
export function createCoinTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // 背景クリア
  ctx.clearRect(0, 0, 256, 256);

  // コイン円盤ベース（黄金の放射状グラデーション）
  const radGrad = ctx.createRadialGradient(110, 110, 10, 128, 128, 124);
  radGrad.addColorStop(0, '#fffde7');   // 明るい光沢
  radGrad.addColorStop(0.25, '#ffd54f'); // 輝く金
  radGrad.addColorStop(0.65, '#ffb300'); // 深いゴールド
  radGrad.addColorStop(1, '#ff6f00');   // 縁の重厚なブロンズゴールド
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(128, 128, 124, 0, Math.PI * 2);
  ctx.fill();

  // 外周の立体リム（縁取り）
  ctx.strokeStyle = '#fff9c4';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = '#e65100';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(128, 128, 114, 0, Math.PI * 2);
  ctx.stroke();

  // 内側のドットレリーフ（コインの縁飾り）
  ctx.fillStyle = '#fff59d';
  const numDots = 24;
  for (let i = 0; i < numDots; i++) {
    const angle = (i / numDots) * Math.PI * 2;
    const dotX = 128 + Math.cos(angle) * 104;
    const dotY = 128 + Math.sin(angle) * 104;
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // 中央のくぼみ円
  const innerGrad = ctx.createRadialGradient(128, 128, 10, 128, 128, 88);
  innerGrad.addColorStop(0, '#ffe082');
  innerGrad.addColorStop(1, '#ffa000');
  ctx.fillStyle = innerGrad;
  ctx.beginPath();
  ctx.arc(128, 128, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffd54f';
  ctx.lineWidth = 3;
  ctx.stroke();

  // 中央の刻印：大きな星マーク「★」
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#e65100';
  ctx.shadowBlur = 6;
  ctx.font = '900 76px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 128, 112);

  // 下部刻印「1000」
  ctx.fillStyle = '#3e2723';
  ctx.shadowColor = '#fff59d';
  ctx.shadowBlur = 2;
  ctx.font = '900 32px sans-serif';
  ctx.fillText('1000', 128, 172);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}


// コイン用ソフトブラーハロー（柔らかい光のボケ）テクスチャ
export function createBlurHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.2, 'rgba(255, 245, 157, 0.85)');
  grad.addColorStop(0.45, 'rgba(255, 213, 79, 0.5)');
  grad.addColorStop(0.7, 'rgba(255, 152, 0, 0.2)');
  grad.addColorStop(0.9, 'rgba(255, 111, 0, 0.05)');
  grad.addColorStop(1, 'rgba(255, 87, 34, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 縦方向モーションブラー光条テクスチャ
export function createMotionBlurStreakTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 64, 256);

  // 中心から上下・左右にボケる光の筋
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255, 235, 59, 0)');
  grad.addColorStop(0.25, 'rgba(255, 235, 59, 0.3)');
  grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.75, 'rgba(255, 213, 79, 0.3)');
  grad.addColorStop(1, 'rgba(255, 160, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(16, 0, 32, 256);

  // 横方向のソフトブラー
  const hGrad = ctx.createLinearGradient(0, 0, 64, 0);
  hGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  hGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 64, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 3D爆発用ファイアボール（プラズマ爆炎球体）テクスチャ
export function createExplosionFireballTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // 中心：白熱 -> 中間：鮮烈な黄色〜オレンジ -> 外縁：赤橙〜消滅
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.2, 'rgba(255, 240, 120, 0.95)');
  grad.addColorStop(0.45, 'rgba(255, 140, 20, 0.85)');
  grad.addColorStop(0.7, 'rgba(230, 40, 0, 0.5)');
  grad.addColorStop(0.9, 'rgba(120, 10, 0, 0.15)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // 爆炎の乱流ノイズ
  ctx.fillStyle = 'rgba(255, 220, 80, 0.35)';
  for (let i = 0; i < 18; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist = 25 + Math.random() * 60;
    const r = 15 + Math.random() * 25;
    ctx.beginPath();
    ctx.arc(128 + Math.cos(angle) * dist, 128 + Math.sin(angle) * dist, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 爆発衝撃波リング（ブラストウェーブ）テクスチャ
export function createExplosionShockwaveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  const grad = ctx.createRadialGradient(128, 128, 60, 128, 128, 126);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.35, 'rgba(255, 220, 80, 0.25)');
  grad.addColorStop(0.7, 'rgba(255, 240, 180, 0.95)');
  grad.addColorStop(0.85, 'rgba(255, 140, 20, 0.8)');
  grad.addColorStop(1.0, 'rgba(255, 60, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 126, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 爆発の噴煙・黒煙クラウドテクスチャ
export function createExplosionSmokeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  const circles = [
    { x: 128, y: 128, r: 75, a: 0.75 },
    { x: 105, y: 110, r: 58, a: 0.65 },
    { x: 150, y: 115, r: 62, a: 0.65 },
    { x: 115, y: 145, r: 52, a: 0.55 },
    { x: 145, y: 140, r: 52, a: 0.55 },
    { x: 130, y: 95, r: 48, a: 0.6 },
  ];

  for (const c of circles) {
    const grad = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, c.r);
    grad.addColorStop(0.0, `rgba(50, 42, 38, ${c.a})`);
    grad.addColorStop(0.45, `rgba(65, 58, 54, ${c.a * 0.7})`);
    grad.addColorStop(0.8, `rgba(85, 80, 75, ${c.a * 0.3})`);
    grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 無敵パワーアップ（青き稲妻オーラ）のコア球体テクスチャ
export function createPowerUpCoreTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // 中心：白熱コア -> 中間：シアン -> 外縁：深い群青
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  grad.addColorStop(0.2, 'rgba(179, 236, 255, 0.98)');
  grad.addColorStop(0.5, 'rgba(41, 121, 255, 0.95)');
  grad.addColorStop(0.8, 'rgba(13, 71, 161, 0.9)');
  grad.addColorStop(1.0, 'rgba(2, 20, 60, 0.85)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  // 中央の稲妻アイコン（無敵の象徴）
  ctx.save();
  ctx.translate(128, 128);
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#80d8ff';
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.moveTo(10, -70);
  ctx.lineTo(-46, 14);
  ctx.lineTo(-6, 14);
  ctx.lineTo(-16, 74);
  ctx.lineTo(46, -10);
  ctx.lineTo(4, -10);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 無敵パワーアップ用ソフトブラーハロー（青白い光のボケ）テクスチャ
export function createPowerUpHaloTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
  grad.addColorStop(0.2, 'rgba(179, 236, 255, 0.85)');
  grad.addColorStop(0.45, 'rgba(64, 196, 255, 0.5)');
  grad.addColorStop(0.7, 'rgba(41, 121, 255, 0.22)');
  grad.addColorStop(0.9, 'rgba(13, 71, 161, 0.06)');
  grad.addColorStop(1, 'rgba(13, 71, 161, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 無敵パワーアップの光柱ビーム用（縦グラデーション）テクスチャ
export function createPowerUpBeamTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 64, 512);

  const vGrad = ctx.createLinearGradient(0, 0, 0, 512);
  vGrad.addColorStop(0, 'rgba(41, 121, 255, 0)');
  vGrad.addColorStop(0.15, 'rgba(120, 210, 255, 0.55)');
  vGrad.addColorStop(0.5, 'rgba(200, 240, 255, 0.85)');
  vGrad.addColorStop(0.85, 'rgba(120, 210, 255, 0.4)');
  vGrad.addColorStop(1, 'rgba(41, 121, 255, 0)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, 64, 512);

  const hGrad = ctx.createLinearGradient(0, 0, 64, 0);
  hGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  hGrad.addColorStop(0.5, 'rgba(255, 255, 255, 1)');
  hGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = hGrad;
  ctx.fillRect(0, 0, 64, 512);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// クリア演出: 校門の門柱ネームプレート
export function createSchoolGateNameplateTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // 御影石風の縦長プレート
  const stoneGrad = ctx.createLinearGradient(0, 0, 256, 0);
  stoneGrad.addColorStop(0, '#3a3f42');
  stoneGrad.addColorStop(0.5, '#565d61');
  stoneGrad.addColorStop(1, '#3a3f42');
  ctx.fillStyle = stoneGrad;
  ctx.fillRect(0, 0, 256, 512);

  ctx.strokeStyle = '#1c1f21';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 502);

  // 校名（縦書き風に一文字ずつ配置）
  ctx.fillStyle = '#f5f5f0';
  ctx.font = '900 54px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const chars = ['テ', 'ン', 'パ', 'る', '学', '園'];
  const startY = 90;
  const stepY = 62;
  chars.forEach((c, i) => {
    ctx.fillText(c, 128, startY + i * stepY);
  });

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

// 床の焦げ跡（爆心炭化クレーター）テクスチャ
export function createExplosionScorchTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 120);
  grad.addColorStop(0.0, 'rgba(12, 8, 6, 0.88)');
  grad.addColorStop(0.4, 'rgba(25, 18, 14, 0.78)');
  grad.addColorStop(0.7, 'rgba(45, 32, 24, 0.45)');
  grad.addColorStop(0.9, 'rgba(60, 45, 35, 0.15)');
  grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(128, 128, 120, 0, Math.PI * 2);
  ctx.fill();

  // 放射状の焦げスプラッシュ・煤の飛び散り
  ctx.strokeStyle = 'rgba(15, 10, 8, 0.6)';
  for (let i = 0; i < 18; i++) {
    const angle = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const len = 70 + Math.random() * 50;
    ctx.lineWidth = 1.5 + Math.random() * 3;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + Math.cos(angle) * len, 128 + Math.sin(angle) * len);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}


