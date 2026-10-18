import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import { GameEngine } from './game/GameEngine';
import { installHomeReturn } from '../../../shared/homeReturn';
import { benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';

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

  // canvasはウィンドウ全体に広げ、論理サイズはウィンドウ比率にそのまま追従する。
  // UIが潰れないよう、論理サイズの下限を幅1280 x 高さ1080とする。
  const MIN_W = 1280;
  const BASE_H = 1080;
  let viewW = 1920;
  let viewH = BASE_H;
  let scale = 1;

  const resize = () => {
    const cw = Math.max(1, window.innerWidth);
    const ch = Math.max(1, window.innerHeight);
    const dpr = window.devicePixelRatio || 1;
    const uiScale = Math.min(ch / BASE_H, cw / MIN_W);
    viewW = cw / uiScale;
    viewH = ch / uiScale;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;
    scale = uiScale * dpr;
  };
  resize();
  window.addEventListener('resize', resize);

  // Initialize Game Engine
  const engine = new GameEngine();

  // ベンチマーク(?bench=1): タイトル(CPU のデモが動く) / 試合(ランダム入力。レベルアップ・結果の画面もそのまま通る) / 5分間を最後まで(自動操作)
  declareBenchTargets([
    { id: 'title', label: 'タイトル(CPUデモ)', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 30 },
    { id: 'play', label: '試合(ランダム入力)', kind: 'play', params: { scene: 'play' }, input: 'random', seconds: 120 },
    { id: 'full', label: '5分間を最後まで(自動操作・大群とボス3体)', kind: 'play', params: { scene: 'full' }, input: 'self', seconds: 340 },
  ]);
  const benchScene = benchParam('scene');
  if (benchScene === 'play' || benchScene === 'full') engine.startBenchMatch();
  else if (benchScene === 'title') benchReady('title');

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

  // Game Loop
  let lastTime = performance.now();

  function gameLoop(now: number) {
    const dt = Math.min((now - lastTime) / 1000, 0.1); // Clamp to max 100ms
    lastTime = now;

    // Update
    engine.update(dt);

    // Render
    ctx!.setTransform(scale, 0, 0, scale, 0, 0);
    engine.render(ctx!, viewW, viewH);

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
});
