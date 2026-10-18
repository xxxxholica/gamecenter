// リプレイを見る札: 管理画面がリプレイを開くときに発行する、署名つき・期限つきの札。
// リプレイはゲームを管理画面とは別のオリジン(REPLAY_ORIGIN)で動かすので、ゲームは管理画面のログイン(Cookie)を持たない。
// 記録の中身は、この札を添えて公開の API(/api/replay/view)から読む。札は1つの記録にだけ効き、期限を過ぎると使えない。
import crypto from 'node:crypto';

/** 札の有効期間。再生の画面を開いてから記録を読み込むまでに使う(読み直すときは、管理画面が取り直す) */
const TTL_MS = 10 * 60 * 1000;

export class ReplayTickets {
  private readonly secret = crypto.randomBytes(32);   // プロセスごと(再起動すると、発行済みの札は使えなくなる)
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  private sign(payload: string): string {
    return crypto.createHmac('sha256', this.secret).update(payload).digest('base64url');
  }

  /** 記録 id にだけ効く札。形は <期限>.<署名> */
  issue(id: string): string {
    const exp = String(this.now() + TTL_MS);
    return `${exp}.${this.sign(`${id}.${exp}`)}`;
  }

  verify(id: string, ticket: unknown): boolean {
    if (typeof ticket !== 'string' || ticket.length > 120) return false;
    const i = ticket.indexOf('.');
    if (i < 0) return false;
    const exp = ticket.slice(0, i);
    if (!/^\d{1,16}$/.test(exp) || Number(exp) < this.now()) return false;
    const given = Buffer.from(ticket.slice(i + 1));
    const expected = Buffer.from(this.sign(`${id}.${exp}`));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  }
}
