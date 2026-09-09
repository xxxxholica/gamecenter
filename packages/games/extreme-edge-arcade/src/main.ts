import * as THREE from 'three';
import { InputManager } from './input';
import { EffectsManager } from './effects';
import { GameManager } from './game';

function initApp() {
  const container = document.getElementById('canvas-container')!;

  // Scene
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060608);

  // Camera
  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.set(0, 2, 4);

  // Renderer
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  container.appendChild(renderer.domElement);

  // Systems
  const input = new InputManager();
  const effects = new EffectsManager(camera, scene);
  const game = new GameManager(scene, camera, effects, input);

  // Resize
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Fullscreen toggle on 'F'
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyF') {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    }
    if (e.code === 'Escape') {
      // ホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
      window.location.href = '../../';
    }
  });

  // Animation Loop
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.1);

    input.update(dt);
    game.update(dt);
    effects.update(dt);

    renderer.render(scene, camera);
  }

  animate();
}

window.addEventListener('DOMContentLoaded', initApp);
