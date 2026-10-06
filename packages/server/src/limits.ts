// 開放中でも第三者に負荷をかけられないための制限類。値は環境変数で上書きできる。
export const num = (key: string, def: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

export const LIMITS = {
  /** 会場の共有NAT(全員が同じIPになる)を考慮して、同一IPの同時接続は多めに許可する */
  maxConnsPerIp: num('ONLINE_MAX_CONNS_PER_IP', 50),
  maxConnsTotal: num('ONLINE_MAX_CONNS_TOTAL', 64),
  connectsPerMinPerIp: num('ONLINE_CONNECTS_PER_MIN', 120),
  maxPayloadBytes: 2048,
  msgsPerSec: 60,
  idleTimeoutMs: 30000,
};

/** 固定ウィンドウ(1分)の回数制限。ウィンドウが切れたキーは掃除される。 */
export class RateWindow {
  private hits = new Map<string, { start: number; n: number }>();
  private limit: number;
  private windowMs: number;
  constructor(limit: number, windowMs: number) {
    this.limit = limit;
    this.windowMs = windowMs;
  }
  hit(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || now - h.start >= this.windowMs) {
      this.hits.set(key, { start: now, n: 1 });
      return true;
    }
    h.n++;
    return h.n <= this.limit;
  }
  sweep(now = Date.now()) {
    for (const [k, h] of this.hits) if (now - h.start >= this.windowMs) this.hits.delete(k);
  }
}
