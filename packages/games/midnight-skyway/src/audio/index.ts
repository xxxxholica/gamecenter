import { AudioEngine } from './engine';
import { Bgm } from './music';
import { Sfx } from './sfx';

const engine = new AudioEngine();

/** ゲーム全体で共有するBGM・効果音 */
export const audio = {
  engine,
  bgm: new Bgm(engine),
  sfx: new Sfx(engine),
};
