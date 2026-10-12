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

/** 参加者の番号ごとのプライマリカラー。白い文字を載せても読める濃さ(名前のボックス・最高到達のブロックなど) */
export const PLAYER_COLORS = ['#0a7d9e', '#c92c3c', '#238a3c', '#7b3fc4'];
/** 同じ4色の明るい版。暗い背景の上に、色付きの文字として出すとき用(結果画面など) */
export const PLAYER_COLORS_LIGHT = ['#35c9e8', '#ff6b6b', '#7ddc6a', '#c792ea'];
