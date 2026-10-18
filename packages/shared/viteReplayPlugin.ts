// 各ゲームの vite.config.ts で使う: 操作の記録・再生(arcadeReplay.ts)のための、ビルド時の書き換え。
// three.js は物(素材・形・テクスチャなど)を作るたびに、id を Math.random から作る。読み込みが終わった時などに作られると、
// 引く回数が記録と再生とで変わり、ゲームの乱数(記録・再生で追うもの)がずれる。id の乱数だけを、追わない乱数に替える。
import type { Plugin } from 'vite';

export function replayDeterminism(): Plugin {
  return {
    name: 'gamecenter-replay-determinism',
    enforce: 'pre',
    transform(code, id) {
      if (!/[\\/]three[\\/]build[\\/]three\.(core|module)\.js$/.test(id) || !code.includes('function generateUUID()')) return null;
      const start = code.indexOf('function generateUUID()');
      const end = code.indexOf('\n}', start);
      const body = code.slice(start, end).replace(/Math\.random\(\)/g, '__gcUuidRandom()');
      return {
        code: 'const __gcUuidRandom = () => (globalThis.__gcUntrackedRandom || Math.random)();\n' + code.slice(0, start) + body + code.slice(end),
        map: null,
      };
    },
  };
}
