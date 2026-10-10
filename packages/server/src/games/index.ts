// 対戦サーバーが扱うゲームの一覧。id は packages/hub/src/games.ts の slug と同じ。ゲームを足す時はここに登録する。
import type { GameModule } from '../engine.ts';
import { EnnichiGame } from './ennichi.ts';
import { SkywayGame } from './skyway.ts';
import { SumoGame } from './sumo.ts';
import { TowerGame } from './tower.ts';

export const GAME_FACTORIES: Record<string, () => GameModule> = {
  'midnight-skyway': () => new SkywayGame(),
  'sumo-smash-3d': () => new SumoGame(),
  'tower-stack': () => new TowerGame(),
};

/**
 * 現在は提供していない(クライアントがオフライン専用の)ゲーム。モジュールとテストだけ残してあり、
 * 環境変数 ONLINE_EXTRA_GAMES=ennichi-shateki(カンマ区切り)を付けた時だけ登録する。
 */
const DORMANT_FACTORIES: Record<string, () => GameModule> = {
  'ennichi-shateki': () => new EnnichiGame(),
};
for (const id of (process.env.ONLINE_EXTRA_GAMES ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
  if (DORMANT_FACTORIES[id]) GAME_FACTORIES[id] = DORMANT_FACTORIES[id];
}
