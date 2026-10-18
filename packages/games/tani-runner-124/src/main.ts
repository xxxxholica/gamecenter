import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction.ts';
// ============================================================
// Entry point: Tani Multiplier Runner
// ============================================================

import { Game } from './game.ts';
import { installHomeReturn } from '../../../shared/homeReturn.ts';

// 戻る操作は Backspace(アケコンは SELECT)に統一。Escape は無効
installHomeReturn();
watchResultAutoReturn(['title-fail-btn', 'title-success-btn']);

window.addEventListener('DOMContentLoaded', () => {
  console.log('[TANI RUNNER 124] Initializing Arcade Engine...');
  new Game();
});

