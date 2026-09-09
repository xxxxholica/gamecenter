import { defineConfig } from 'vite';

// scripts/dev-all.mjs が各ゲームのdevサーバーを起動した際にslug->portのJSONを渡す。
// 単体で `npm run dev:hub` した場合は未設定になり、ゲームへのリンクは従来通り404になる。
const gamePorts = JSON.parse(process.env.VITE_GAME_PORTS ?? '{}');

export default defineConfig({
  base: './',
  server: {
    proxy: Object.fromEntries(
      Object.entries(gamePorts).map(([slug, port]) => [
        `/games/${slug}/`,
        { target: `http://localhost:${port}`, ws: true },
      ]),
    ),
  },
});
