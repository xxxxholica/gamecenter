// 1行ログ。個人情報は出さない(IPのみ。名前は自動採番)。
export function log(...args: unknown[]): void {
  console.log('[online]', ...args);
}
