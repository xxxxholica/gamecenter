// sumo-smash-3d 用のオンライン接続(共有部品 shared/online を、このゲームのメッセージ型とゲームidで使う)。
import { NetClient } from '../../../../shared/online/NetClient';
import { fetchOnlineStatus } from '../../../../shared/online/onlineStatus';
import type { ClientMsg, ServerMsg } from '../../../../shared/sumoProtocol';

/** サーバー側のゲームid(ハブの slug と同じ) */
export const GAME_ID = 'sumo-smash-3d';

export type SumoNet = NetClient<ServerMsg, ClientMsg>;

export const createNet = (): SumoNet => new NetClient<ServerMsg, ClientMsg>(GAME_ID);

/** オンライン対戦が開かれているか(START を押した時に1回だけ呼ぶ)。 */
export const fetchSumoStatus = (timeoutMs?: number) => fetchOnlineStatus(GAME_ID, timeoutMs);
