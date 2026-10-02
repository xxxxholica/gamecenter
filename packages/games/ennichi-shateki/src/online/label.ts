import * as THREE from 'three';

/** 他の人の台の上に出す名前札(PLAYER 2 など)。 */
export function makeLabel(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 28px system-ui, "Hiragino Kaku Gothic ProN", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 8;
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.strokeText(text, 192, 32);
  g.fillStyle = color;
  g.fillText(text, 192, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(2.4, 0.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}
