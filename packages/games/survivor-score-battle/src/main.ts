import { GameEngine } from './game/GameEngine';
import { installHomeReturn } from '../../../shared/homeReturn';

installHomeReturn();

window.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Canvas element #game-canvas not found!');
    return;
  }

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) {
    console.error('Could not obtain 2D context from canvas');
    return;
  }

  // Set internal render resolution
  canvas.width = 1920;
  canvas.height = 1080;

  // Initialize Game Engine
  const engine = new GameEngine();

  // AudioContext unlock on first interaction
  const unlockAudio = () => {
    engine.sound.ensureContext();
    window.removeEventListener('click', unlockAudio);
    window.removeEventListener('keydown', unlockAudio);
  };
  window.addEventListener('click', unlockAudio);
  window.addEventListener('keydown', unlockAudio);

  // Prevent right-click context menu
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Escape') {
      if (engine.state === 'TITLE' || engine.state === 'RESULT') {
        window.location.href = '../../';
      }
    }
  });

  // Game Loop
  let lastTime = performance.now();

  function gameLoop(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.1); // Clamp to max 100ms
    lastTime = now;

    // Update
    engine.update(dt);

    // Render
    engine.render(ctx!, 1920, 1080);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
