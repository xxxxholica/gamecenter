import * as THREE from 'three';

/** Brightness of every lamp glow (halos, light pools on the road, uplights): one knob for both stages. */
const GLOW_LEVEL = 0.65;

/** Soft round glow for the lamps (one texture for all of them). */
export function glowTexture(): THREE.CanvasTexture {
  const S = 128, c = document.createElement('canvas');
  c.width = S; c.height = S;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, `rgba(255, 236, 190, ${GLOW_LEVEL})`);
  grad.addColorStop(0.25, `rgba(255, 210, 140, ${0.55 * GLOW_LEVEL})`);
  grad.addColorStop(1, 'rgba(255, 190, 110, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
