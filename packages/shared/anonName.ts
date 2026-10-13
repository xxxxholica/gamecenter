// 匿名の登録名「匿名A」「匿名B」…「匿名Z」「匿名AA」…。番号(0始まり)から名前を作る。全ゲーム共通の連番で、採番はサーバーが行う。

export const ANON_PREFIX = '匿名';

/** 0→匿名A, 25→匿名Z, 26→匿名AA, 27→匿名AB, 701→匿名ZZ, 702→匿名AAA */
export function anonNameFromIndex(index: number): string {
  let n = Math.max(0, Math.floor(index));
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return ANON_PREFIX + letters;
}
