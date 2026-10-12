// プレイチケット: ゲームを開いた時点でサーバーが発行する、署名つき・使い切りの札。
// スコアの申告にこれを必須にして、「起動してから申告までに実際に経過した時間」をサーバーの時計で測る。
// これで、DevToolsや curl から「いま」好きな値を送る(経過ゼロで高得点)ことはできなくなる。
// ただしスコアそのものはクライアントの計算なので、完全な改ざん対策ではない(時間をかければ、上限までは通る)。
import crypto from 'node:crypto';

/** チケットの有効期間。これを過ぎた札は受け付けない(開きっぱなしの筐体は、結果を送るたびに取り直す) */
const TTL_MS = 24 * 60 * 60 * 1000;
/** 使用済みの札を覚えておく上限(超えたら古い順に捨てる。TTL内の再利用を許さないための表) */
const MAX_USED = 50_000;

export type TicketError = 'bad_ticket' | 'expired_ticket' | 'used_ticket' | 'wrong_game';

export class RunTickets {
  private readonly secret: Buffer;
  private readonly used = new Map<string, number>();
  private readonly now: () => number;

  /**
   * secret を省略するとプロセスごとにランダム(再起動すると発行済みの札は無効になる)。
   * 再起動をまたいで札を有効にしたいときは、環境変数 LEADERBOARD_TICKET_SECRET で固定する。
   */
  constructor(secret?: string, now: () => number = Date.now) {
    this.secret = secret && secret.length >= 16 ? Buffer.from(secret) : crypto.randomBytes(32);
    this.now = now;
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  issue(slug: string): string {
    const payload = `${slug}.${this.now()}.${crypto.randomBytes(12).toString('base64url')}`;
    return `${payload}.${this.sign(payload)}`;
  }

  /**
   * 札を検証して使い切りにする。成功したら、発行からの経過時間(ms)を返す。
   * 失敗(別ゲームの札・期限切れ・再利用・改ざん)は TicketError。
   */
  redeem(ticket: unknown, slug: string): { ok: true; elapsedMs: number } | { ok: false; error: TicketError } {
    if (typeof ticket !== 'string' || ticket.length > 200) return { ok: false, error: 'bad_ticket' };
    const i = ticket.lastIndexOf('.');
    if (i < 0) return { ok: false, error: 'bad_ticket' };
    const payload = ticket.slice(0, i);
    const given = Buffer.from(ticket.slice(i + 1));
    const expected = Buffer.from(this.sign(payload));
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false, error: 'bad_ticket' };
    // payload = <slug>.<issuedAt>.<nonce>(slug にドットは含まれない)
    const [tSlug, issuedAtRaw, nonce] = payload.split('.');
    const issuedAt = Number(issuedAtRaw);
    if (!tSlug || !nonce || !Number.isFinite(issuedAt)) return { ok: false, error: 'bad_ticket' };
    if (tSlug !== slug) return { ok: false, error: 'wrong_game' };
    const elapsedMs = this.now() - issuedAt;
    if (elapsedMs < 0 || elapsedMs > TTL_MS) return { ok: false, error: 'expired_ticket' };
    if (this.used.has(nonce)) return { ok: false, error: 'used_ticket' };
    this.used.set(nonce, issuedAt + TTL_MS);
    if (this.used.size > MAX_USED) {
      const oldest = this.used.keys().next().value;
      if (oldest !== undefined) this.used.delete(oldest);
    }
    return { ok: true, elapsedMs };
  }

  /** 期限が過ぎた使用済みの記録を掃除する */
  sweep(): void {
    const t = this.now();
    for (const [nonce, until] of this.used) if (until < t) this.used.delete(nonce);
  }
}
