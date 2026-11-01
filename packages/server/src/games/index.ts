// 対戦サーバーが扱うゲームの一覧。id は packages/hub/src/games.ts の slug と同じ。ゲームを足す時はここに登録する。
import type { GameModule } from '../engine.ts';
import { SkywayGame } from './skyway.ts';
import { SumoGame } from './sumo.ts';
import { TowerGame } from './tower.ts';

export const GAME_FACTORIES: Record<string, () => GameModule> = {
  'midnight-skyway': () => new SkywayGame(),
  'sumo-smash-3d': () => new SumoGame(),
  'tower-stack': () => new TowerGame(),
};

