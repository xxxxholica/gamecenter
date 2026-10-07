// Collects each workspace's build output into a single deployable dist/ tree:
//   dist/                  <- packages/hub/dist
//   dist/games/<slug>/     <- packages/games/<slug>/dist
import { existsSync, rmSync, renameSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { hiddenSlugs } from '../packages/hub/src/games.ts';

const root = path.dirname(fileURLToPath(import.meta.url)) + '/..';
const outDir = path.join(root, 'dist');
const hubDist = path.join(root, 'packages/hub/dist');
const gamesDir = path.join(root, 'packages/games');

rmSync(outDir, { recursive: true, force: true });

if (!existsSync(hubDist)) {
  throw new Error(`hub build not found at ${hubDist}`);
}
// コピーではなく移動する(midnight-skyway は約300MBあり、コピーだとディスクを二重に使うため)
renameSync(hubDist, outDir);
// 非表示のゲームはハブに出ないので、サムネイルやプレビューも配置しない
for (const slug of hiddenSlugs) {
  rmSync(path.join(outDir, 'thumbnails', `${slug}.webp`), { force: true });
  rmSync(path.join(outDir, 'previews', `${slug}.webm`), { force: true });
}

for (const slug of readdirSync(gamesDir)) {
  if (slug.startsWith('.')) continue;
  // 以前のビルドで残った dist/ があっても、非表示のゲームは配置しない
  if (hiddenSlugs.includes(slug)) continue;
  const gameDist = path.join(gamesDir, slug, 'dist');
  if (!existsSync(gameDist)) {
    console.warn(`skipping ${slug}: no dist/ (build failed or not built)`);
    continue;
  }
  mkdirSync(path.join(outDir, 'games'), { recursive: true });
  renameSync(gameDist, path.join(outDir, 'games', slug));
  console.log(`assembled games/${slug}`);
}
