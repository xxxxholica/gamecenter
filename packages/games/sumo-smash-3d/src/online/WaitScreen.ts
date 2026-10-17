import type { ClientMsg, ServerMsg } from '../../../../shared/sumoProtocol';
import { MAX_PLAYERS } from '../../../../shared/sumoProtocol';
import { FIGHTERS } from '../../../../shared/sumoSim/SimWorld';
import { WaitScreen as SharedWaitScreen } from '../../../../shared/online/WaitScreen';
import type { SumoNet } from './net';

export interface WaitDeps {
  /** 退出して戻る(モード選択へ)。 */
  onBack: () => void;
  /** 接続エラー・閉鎖・満員などで入れない時: 案内を出してタイトルへ戻る。 */
  onErrorToTitle: (message: string) => void;
}

/**
 * オンライン対戦の待機画面(共通部品を、このゲームの赤で使う)。
 * 参加順がそのまま力士の番号(1P=東方 蒼天龍・2P=西方 紅炎山 …)になる。名前は対戦中に出る力士名と同じ。
 */
export class WaitScreen extends SharedWaitScreen<ServerMsg, ClientMsg> {
  constructor(client: SumoNet, deps: WaitDeps) {
    super(client, {
      ...deps,
      maxPlayers: MAX_PLAYERS,
      accent: '#e63946',
      accentGlow: 'rgba(230, 57, 70, .3)',
      highlight: '#ff6b75',
      highlightGlow: 'rgba(230, 57, 70, .45)',
      playerColor: (i) => FIGHTERS[i].css,
      playerMeta: (i) => `${FIGHTERS[i].side}\n${i + 1}P`,
    });
  }
}
