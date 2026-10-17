// ベンチマークの場面の一覧(ゲームのデータから作る。地層が増えれば、計測する場面も増える)
import type { BenchTarget } from '../../../shared/arcadeBenchCore';

/** ゴールの手前から始めて、クリアの演出までを測る場面の開始深さ(ゴールまで30m) */
export const GOAL_APPROACH = 30;
/** ベンチの地形を固定する乱数の種(毎回同じ地形・同じ爆弾の位置で測る) */
export const BENCH_SEED = 20260101;

export function fallDownBenchTargets(strata: readonly { depth: number; name: string }[], goalDepth: number): BenchTarget[] {
  return [
    { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
    ...strata.map((s) => ({
      id: `play-d${s.depth}`,
      label: `${s.name}(${s.depth}mから)`,
      kind: 'play',
      params: { scene: 'play', depth: String(s.depth) },
      input: 'self' as const,
      seconds: 60,
    })),
    {
      id: 'play-goal',
      label: '黄金郷への到達(クリアの演出まで)',
      kind: 'goal',
      params: { scene: 'play', depth: String(goalDepth - GOAL_APPROACH) },
      input: 'self',
      seconds: 120,
    },
  ];
}

/** ボットが見る世界の最小限(テストでは本物の World / Game を渡す) */
interface BotGame {
  player: { x: number; y: number };
  world: { get(x: number, y: number): { kind: string } | null };
}

/**
 * ベンチ用の自動操作。真下を掘り進み、真下が壊せない(黒曜石)ときは、壊せる列まで横へ寄る。
 * 掘る速さは本番と同じなので、実際のプレイに近い数の爆発・落下・破片が出る。
 */
export function createBenchBot(width: number) {
  let lastDepthAt = 0;
  let lastDepth = -1;
  let wander = 0; // 進めない状態が続いたときの、横へ寄る向き
  return function benchBot(game: BotGame, nowMs: number): { dx: number; dy: number; dig: boolean; digPressed: boolean } {
    const col = Math.round(game.player.x);
    const row = Math.round(game.player.y);
    const depth = Math.floor(1 - game.player.y);
    if (depth !== lastDepth) {
      lastDepth = depth;
      lastDepthAt = nowMs;
      wander = 0;
    } else if (nowMs - lastDepthAt > 4000 && wander === 0) {
      wander = col < width / 2 ? 1 : -1; // 4秒進めなければ、反対側へ寄る
    }
    const blocked = (c: number) => game.world.get(c, row - 1)?.kind === 'bedrock';
    let dx = wander;
    if (dx === 0 && blocked(col)) {
      for (let d = 1; d < width && dx === 0; d++) {
        for (const c of [col - d, col + d]) {
          if (c >= 0 && c < width && !blocked(c)) {
            dx = c < col ? -1 : 1;
            break;
          }
        }
      }
    }
    // 横へ寄るときは横向きに掘る(開いていれば歩く)。そうでなければ真下
    return dx !== 0 ? { dx, dy: 0, dig: true, digPressed: false } : { dx: 0, dy: -1, dig: true, digPressed: false };
  };
}
