// 開発・計測用の URL パラメータ(?bench=1・?debug・?preview など)を、本番のドメインでは効かせない。
// ゲームのコードは location.search をあちこちで読むので、読む前に URL から消しておく(各ゲームの最初・ハブの最初に1回)。
// 計測の道具(bench-all.mjs など)は dist/ を 127.0.0.1 で配信して開くので、本番で消しても計測には響かない。

import { BENCH_STORAGE_KEY } from './arcadeBenchCore.ts';

const PRODUCTION_HOSTS = new Set(['game.hinata.works', 'replay.game.hinata.works']);
/** 本番でも残すパラメータ: 管理画面からリプレイを再生するためのもの(replay パラメータがある時のみ有効) */
const KEPT_REPLAY_PARAMS = new Set(['replay', 'ticket', 'speed', 'seek']);
const VALID_REPLAY_ID_RE = /^[\w-]{1,64}$/;

/** 本番のドメインか。'game.hinata.works.' のような末尾のドット付きも同じホストとして扱う */
export function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTS.has(hostname.toLowerCase().replace(/\.$/, ''));
}

/** 撮影用の ?preview または ?noHud が付いているか(パラメータ名として完全一致で判定し、値の部分一致による誤発火を防ぐ) */
export function hasPreviewParam(): boolean {
  if (typeof location === 'undefined' || !location.search) return false;
  const q = new URLSearchParams(location.search);
  return q.has('preview') || q.has('noHud');
}

/** 本番のドメインで開かれたら、URL から開発用のパラメータを消し、残っているベンチの印も消す */
export function stripDevParamsOnProduction(): void {
  if (typeof window === 'undefined' || !isProductionHost(window.location.hostname)) return;
  try { window.localStorage.removeItem(BENCH_STORAGE_KEY); } catch { /* localStorage が使えない環境では、もともと無効 */ }
  const url = new URL(window.location.href);
  const replayId = url.searchParams.get('replay');
  const allowReplayParams = Boolean(replayId && VALID_REPLAY_ID_RE.test(replayId));
  const drop = [...url.searchParams.keys()].filter((k) => !(allowReplayParams && KEPT_REPLAY_PARAMS.has(k)));
  if (drop.length === 0) return;
  for (const k of drop) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, '', url.href);
}
