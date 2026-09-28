// ============================================================
// Entry point: Tani Multiplier Runner
// ============================================================

import { Game } from './game.ts';
import { installHomeReturn } from '../../../shared/homeReturn.ts';
import { mountArcadeGuide } from '../../../shared/arcadeGuide.ts';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();

mountArcadeGuide({
  moveLabel: '隊列操作',
  buttons: [{ indices: [0, 1, 7], label: 'アクション' }],
  showHomeHint: true,
});

window.addEventListener('DOMContentLoaded', () => {
  console.log('[TANI RUNNER 124] Initializing Arcade Engine...');
  new Game();
});

// Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape') {
    window.location.href = '../../';
  }
});
