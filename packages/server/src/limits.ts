// 開放中でも第三者に負荷をかけられないための制限類。値は環境変数で上書きできる。
export const num = (key: string, def: number) => {
  const v = Number(process.env[key]);
  return Number.isFinite(v) && v > 0 ? v : def;
};

export const LIMITS = {
  /** 会場の実機4台は同じネットワーク(=同じIP)から繋ぐ。1台1本+入り直しの重なりが入り、一般公開で1人が枠を占められない値 */
  maxConnsPerIp: num('ONLINE_MAX_CONNS_PER_IP', 10),
  maxConnsTotal: num('ONLINE_MAX_CONNS_TOTAL', 64),
  connectsPerMinPerIp: num('ONLINE_CONNECTS_PER_MIN', 60),
  /** 同一IPの「繋いだだけで join していない」接続の上限(参加済みは maxConnsPerIp で数える)。会場の4台が同時にモード選択していても足りる */
  maxUnjoinedPerIp: num('ONLINE_MAX_UNJOINED_PER_IP', 8),
  /** 1つのIPが全体の枠を使い切って、他の参加者を締め出さないよう、同一IPの上限は全体の75%までに抑える(上の値と小さい方) */
  get effectiveConnsPerIp(): number {
    return Math.min(this.maxConnsPerIp, Math.max(1, Math.floor(this.maxConnsTotal * 0.75)));
  },
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

/**
 * 回数制限・接続数のキーにする IP。IPv6 は /64 に丸める(1つの家庭・回線に /64 が割り当てられるので、
 * その中のアドレスを次々に変えても制限をすり抜けられないように)。IPv4・IPv4射影アドレスはそのまま。
 */
export function ipKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  if (ip.startsWith('::ffff:') && ip.includes('.')) return ip.slice(7);          // ::ffff:1.2.3.4
  const [addr] = ip.split('%');                                                    // ゾーンID(fe80::1%en0)は捨てる
  const [head, tail] = addr.split('::');
  const front = head ? head.split(':') : [];
  if (tail !== undefined) {
    // "::" は連続するゼロの省略。前半が4グループ以上あれば、そこまでが /64
    if (front.length >= 4) return front.slice(0, 4).map((g) => g.toLowerCase().padStart(4, '0')).join(':') + '::/64';
    const groups = [...front, ...Array(Math.max(0, 4 - front.length)).fill('0')].slice(0, 4);
    return groups.map((g) => g.toLowerCase().padStart(4, '0')).join(':') + '::/64';
  }
  return front.slice(0, 4).map((g) => g.toLowerCase().padStart(4, '0')).join(':') + '::/64';
}
