// えんにち射的 用のオンライン接続(共有部品 shared/online を、このゲームのメッセージ型とゲームidで使う)。
import { NetClient } from '../../../../shared/online/NetClient';
import { fetchOnlineStatus } from '../../../../shared/online/onlineStatus';
import type { ClientMsg, ServerMsg } from '../../../../shared/ennichiProtocol';

/** サーバー側のゲームid(ハブの slug と同じ) */
export const GAME_ID = 'ennichi-shateki';

export type EnnichiNet = NetClient<ServerMsg, ClientMsg>;

export const createNet = (): EnnichiNet => new NetClient<ServerMsg, ClientMsg>(GAME_ID);

/** オンライン対戦が開かれているか(START を押した時に1回だけ呼ぶ)。 */
export const fetchEnnichiStatus = (timeoutMs?: number) => fetchOnlineStatus(GAME_ID, timeoutMs);
