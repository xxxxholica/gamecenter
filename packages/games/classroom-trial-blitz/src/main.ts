import * as THREE from 'three';
import { InputManager } from './input';
import { SoundSystem } from './audio';
import { EffectsManager } from './effects';
import { CourtroomWorld } from './world';
import { TestimonyManager } from './testimony';
import { GameManager } from './game';

function initApp(): void {
  const container = document.getElementById('game-container')!;
  const flashOverlay = document.getElementById('screen-flash')!;
  const flashText = document.getElementById('flash-text')!;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 60);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.appendChild(renderer.domElement);

  const world = new CourtroomWorld(scene);
  const input = new InputManager();
  const sound = new SoundSystem();
  const effects = new EffectsManager(scene, flashOverlay, flashText);
  const testimonies = new TestimonyManager(scene);
  const game = new GameManager(camera, world, input, sound, effects, testimonies);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      window.location.href = '../../';
    }
  });

  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    game.update(dt);
    renderer.render(scene, camera);
  }
  animate();
}

window.addEventListener('DOMContentLoaded', initApp);
