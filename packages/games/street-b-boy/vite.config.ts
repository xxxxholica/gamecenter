import { defineConfig } from 'vite';
import { replayDeterminism } from '../../shared/viteReplayPlugin';

export default defineConfig({
  base: './',
  plugins: [replayDeterminism()],   // 操作の記録・再生: three.js の id の乱数を、ゲームの乱数と分ける
});
