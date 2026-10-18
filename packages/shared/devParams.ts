// 開発・計測用の URL パラメータ(?bench=1・?debug・?preview など)を、本番のドメインでは効かせない。
// ゲームのコードは location.search をあちこちで読むので、読む前に URL から消しておく(各ゲームの最初・ハブの最初に1回)。
// 計測の道具(bench-all.mjs など)は dist/ を 127.0.0.1 で配信して開くので、本番で消しても計測には響かない。

import { BENCH_STORAGE_KEY } from './arcadeBenchCore.ts';

const PRODUCTION_HOSTS = new Set(['game.hinata.works', 'replay.game.hinata.works']);
/** 本番でも残すパラメータ: 管理画面からリプレイを再生するためのもの */
const KEPT_PARAMS = new Set(['replay', 'ticket', 'speed', 'seek']);

/** 本番のドメインか。'game.hinata.works.' のような末尾のドット付きも同じホストとして扱う */
export function isProductionHost(hostname: string): boolean {
  return PRODUCTION_HOSTS.has(hostname.toLowerCase().replace(/\.$/, ''));
}

/** 本番のドメインで開かれたら、URL から開発用のパラメータを消し、残っているベンチの印も消す */
export function stripDevParamsOnProduction(): void {
  if (typeof window === 'undefined' || !isProductionHost(window.location.hostname)) return;
  try { window.localStorage.removeItem(BENCH_STORAGE_KEY); } catch { /* localStorage が使えない環境では、もともと無効 */ }
  const url = new URL(window.location.href);
  const drop = [...url.searchParams.keys()].filter((k) => !KEPT_PARAMS.has(k));
  if (drop.length === 0) return;
  for (const k of drop) url.searchParams.delete(k);
  window.history.replaceState(window.history.state, '', url.href);
}
