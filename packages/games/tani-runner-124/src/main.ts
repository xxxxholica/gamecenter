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

