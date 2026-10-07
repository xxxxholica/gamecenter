// 管理操作(CLI・管理画面で共通)の実体。ゲームの場(GameHost)とランキングの保存層を、control.ts の ControlHandlers に結びつける。
import { parseBoardKey } from '../../shared/arcadeLeaderboardCore.ts';
import type { ControlHandlers } from './control.ts';
import type { GameHost } from './host.ts';
import type { LeaderboardStore } from './leaderboardStore.ts';

/** id、または一意に決まる部分文字列(CLI・管理画面用)でゲームを探す。 */
export function findHost(hosts: Map<string, GameHost>, name: string): GameHost | null {
  const exact = hosts.get(name);
  if (exact) return exact;
  const part = [...hosts.values()].filter((h) => name && h.id.includes(name));
  return part.length === 1 ? part[0] : null;
}

export function createControlHandlers(hosts: Map<string, GameHost>, leaderboard: LeaderboardStore, clientCount: () => number): ControlHandlers {
  return {
    status: () => ({ games: [...hosts.values()].map((h) => h.status()), clients: clientCount() }),
    open(game, opts) {
      const h = findHost(hosts, game);
      if (!h) return false;
      h.setOpen(true, opts);
      return true;
    },
    close(game) {
      if (game === 'all') {                                    // 緊急停止
        for (const h of hosts.values()) h.setOpen(false);
        return true;
      }
      const h = findHost(hosts, game);
      if (!h) return false;
      h.setOpen(false);
      return true;
    },
    kick(game, id) {
      return findHost(hosts, game)?.kick(id) ?? false;
    },
    listBoards() {
      return leaderboard.adminBoards();
    },
    setDev(board, rank, on) {
      const [slug, variant] = parseBoardKey(board);
      return leaderboard.setDev(slug, variant, rank, on);
    },
    clearBoard(board) {
      const [slug, variant] = parseBoardKey(board);
      return leaderboard.clearBoard(slug, variant);
    },
    removeEntry(board, rank) {
      const [slug, variant] = parseBoardKey(board);
      return leaderboard.removeEntry(slug, variant, rank);
    },
  };
}
