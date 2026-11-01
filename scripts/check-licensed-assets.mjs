#!/usr/bin/env node
// 公開版に含めない素材(サイバー2Dファイター3D、東京コース)が公開リポジトリに混入していないか、履歴全体と現在のファイルを検査する。
// scripts/licensed-asset-blobs.txt は対象素材の Git blob ハッシュの一覧で、ファイル名を変えても検出できる。

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORBIDDEN_PATH_RE = /cyber-2d-fighter-3d|\.fbx$|models\/tokyo\/|tokyo_climb|tokyo_route|TokyoClimbMap|TokyoMap/i;
const FORBIDDEN_TEXT_RE = 'cyber-2d-fighter-3d|cyberFighter|サイバー[2２]D|tokyo_climb|PLATEAU';
const SELF = ['scripts/check-licensed-assets.mjs', 'scripts/licensed-asset-blobs.txt'];

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30 });
const here = dirname(fileURLToPath(import.meta.url));
const licensed = new Set(readFileSync(join(here, 'licensed-asset-blobs.txt'), 'utf8').split('\n').filter(Boolean));
const errors = [];

for (const line of git('rev-list', '--objects', 'HEAD').split('\n')) {
  const [hash, ...rest] = line.split(' ');
  const path = rest.join(' ');
  if (licensed.has(hash)) errors.push(`再配布できない素材の blob: ${hash} ${path}`);
  else if (FORBIDDEN_PATH_RE.test(path)) errors.push(`禁止されたパス: ${path}`);
}

// git grep は一致なしのとき終了コード1を返す
try {
  const excludes = SELF.map((p) => `:!${p}`);
  const hits = git('grep', '-IilE', FORBIDDEN_TEXT_RE, 'HEAD', '--', '.', ...excludes);
  for (const hit of hits.split('\n').filter(Boolean)) errors.push(`素材のゲームへの参照: ${hit.replace(/^HEAD:/, '')}`);
} catch (error) {
  if (error.status !== 1) throw error;
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  console.error(`\n${errors.length} 件の混入を検出しました。履歴に入った素材は、ファイルを消すだけでは取り除けません。`);
  process.exit(1);
}
console.log(`混入なし(${licensed.size} 件の素材ハッシュと履歴全体を検査)`);
