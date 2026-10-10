// tower-stack 用のオンライン接続(共有部品 shared/online を、このゲームのメッセージ型とゲームidで使う)。
import { NetClient } from '../../../../shared/online/NetClient';
import { fetchOnlineStatus } from '../../../../shared/online/onlineStatus';
import type { ClientMsg, ServerMsg } from '../../../../shared/towerProtocol';

/** サーバー側のゲームid(ハブの slug と同じ) */
export const GAME_ID = 'tower-stack';

export type TowerNet = NetClient<ServerMsg, ClientMsg>;

export const createNet = (): TowerNet => new NetClient<ServerMsg, ClientMsg>(GAME_ID);

/** オンライン対戦が開かれているか(START を押した時に1回だけ呼ぶ)。 */
export const fetchTowerStatus = (timeoutMs?: number) => fetchOnlineStatus(GAME_ID, timeoutMs);

/** 参加者の番号ごとの色(待機画面・相手のタワー・結果で共通) */
export const PLAYER_COLORS = ['#35c9e8', '#ff6b6b', '#7ddc6a', '#c792ea'];
