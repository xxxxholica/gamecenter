import type { ClientMsg, ServerMsg } from '../../../../shared/towerProtocol';
import { MAX_PLAYERS } from '../../../../shared/towerProtocol';
import { WaitScreen as SharedWaitScreen } from '../../../../shared/online/WaitScreen';
import { PLAYER_COLORS, type TowerNet } from './net';

export interface WaitDeps {
  /** 退出して戻る(モード選択へ)。 */
  onBack: () => void;
  /** 接続エラー・閉鎖・満員などで入れない時: 案内を出してタイトルへ戻る。 */
  onErrorToTitle: (message: string) => void;
}

/**
 * オンライン対戦の待機画面(共通部品を、このゲームの黄色で使う)。
 * 参加順がそのまま番号と色(相手のタワーの表示・結果で同じ色)になる。
 */
export class WaitScreen extends SharedWaitScreen<ServerMsg, ClientMsg> {
  constructor(client: TowerNet, deps: WaitDeps) {
    super(client, {
      ...deps,
      maxPlayers: MAX_PLAYERS,
      accent: '#ffd166',
      accentGlow: 'rgba(255, 209, 102, .25)',
      highlight: '#ffd54a',
      highlightGlow: 'rgba(255, 213, 74, .4)',
      playerColor: (i) => PLAYER_COLORS[i % PLAYER_COLORS.length],
    });
  }
}
