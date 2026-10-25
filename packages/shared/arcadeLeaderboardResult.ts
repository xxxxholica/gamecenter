import type { LeaderboardEntry } from './arcadeLeaderboardCore.ts';

/** 圏外はサーバーが正常に受け付けた結果。通信・検証の失敗とは区別する。 */
export type SaveLeaderboardResult =
  | { status: 'saved'; rank: number; list: LeaderboardEntry[] }
  | { status: 'out_of_rank'; rank: number; list: LeaderboardEntry[] }
  | { status: 'error'; rank: -1; list: LeaderboardEntry[]; error: string };

export function leaderboardSaveFeedback(result: SaveLeaderboardResult): { title: string; message: string } {
  if (result.status === 'saved') return { title: '登録完了', message: `第${result.rank}位に登録しました` };
  if (result.status === 'out_of_rank') return { title: '枠外となりました', message: 'ランキングが更新され、上位5位の枠外となりました' };
  const title = '登録できませんでした';
  switch (result.error) {
    case 'network_error':
    case 'invalid_response':
      return { title: '登録結果を確認できませんでした', message: '通信状況とランキングをご確認ください' };
    case 'ticket_unavailable':
    case 'bad_ticket':
    case 'expired_ticket':
    case 'used_ticket':
    case 'wrong_game':
      return { title, message: 'プレイの確認ができませんでした。次のプレイでもう一度お試しください' };
    case 'bad_score':
    case 'implausible_score':
    case 'bad_ghost':
      return { title, message: '記録の確認に失敗しました' };
    case 'rate':
      return { title, message: 'ただいま混み合っています' };
    default:
      return { title, message: 'ランキングの登録処理に失敗しました' };
  }
}
