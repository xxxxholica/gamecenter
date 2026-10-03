import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction.ts';
// ============================================================
// Entry point: Tani Multiplier Runner
// ============================================================

import { Game } from './game.ts';
import { installHomeReturn } from '../../../shared/homeReturn.ts';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();
watchResultAutoReturn(['title-fail-btn', 'title-success-btn']);

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
