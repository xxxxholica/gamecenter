// 対戦サーバーが扱うゲームの一覧。id は packages/hub/src/games.ts の slug と同じ。ゲームを足す時はここに登録する。
import type { GameModule } from '../engine.ts';
import { SkywayGame } from './skyway.ts';
import { EnnichiGame } from './ennichi.ts';

export const GAME_FACTORIES: Record<string, () => GameModule> = {
  'midnight-skyway': () => new SkywayGame(),
  'ennichi-shateki': () => new EnnichiGame(),
};
