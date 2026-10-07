import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import * as THREE from 'three';
import { InputManager } from './input';
import { EffectsManager } from './effects';
import { GameManager } from './game';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();
watchResultAutoReturn(['btn-result-title']);

mountArcadeGuide({
  buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }],
  showHomeHint: true,
});

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
  // 高解像度(Retina等)では描画解像度自体が高くギザギザが目立たないため、MSAA(antialias)は等倍の画面だけで使う。
  // 2倍解像度でのMSAAはGPU負荷が大きい割に見た目の差がほとんど無い
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' });
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
