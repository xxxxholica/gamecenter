// 管理画面(Web)。リバースプロキシと共有シークレットの後ろで公開する前提の、127.0.0.1 限定のHTTPサーバー。
//
// 多層防御:
//  1. リバースプロキシがアクセス元の制限・レート制限を担当する。ID/パスワードはここでは確認しない
//     (ブラウザ標準のBasic認証ダイアログをやめて、自前のログイン画面にするため)
//  2. リバースプロキシだけが知る共有シークレット(X-Online-Proxy)が付いていないリクエストは拒否する
//     → ローカルの他プロセスが 127.0.0.1 のこのポートへ直接アクセスしても何もできない
//  3. ログイン(ID/パスワード)に成功すると、ランダムなセッショントークンを HttpOnly Cookie で発行する。
//     ログイン失敗はIPごとに回数制限する(サーバーログの
//     「admin login failed」行を見て同じ防御を外側(ファイアウォール)からもかける)。
//  4. 状態を変える操作(ログインPOSTを除く)は X-Requested-With ヘッダー必須 + Sec-Fetch-Site が same-origin 以外なら拒否する
//     (CSRF対策。Cookie はブラウザが自動送信するため、他サイトからのPOSTを防ぐ必要がある)
//     ログインPOST自体は素のHTMLフォーム(JS無し)からなので X-Requested-With は使えず、Sec-Fetch-Site だけで見る。
//  シークレット未設定、または管理者ID/パスワード未設定なら管理画面そのものを起動しない。
import crypto from 'node:crypto';
import http from 'node:http';
import { ADMIN_CSS, ADMIN_HTML, ADMIN_JS, LOGIN_HTML } from './adminPage.ts';
import { handleAdminRequest, safeUrl, type ControlHandlers } from './control.ts';
import { log } from './log.ts';

const MIN_SECRET_LENGTH = 16;
const SESSION_COOKIE = 'online_admin_session';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12時間でログアウトが要る
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 10 * 60 * 1000; // 監視側の検知窓と合わせてある
const MAX_BODY_BYTES = 1024;

/** 長さの違いで時間差が出ないよう、SHA-256 にかけて同じ長さにしてから比べる。 */
function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** 不正なパーセントエンコーディング(%だけ等)で例外にならないデコード。失敗したら元の文字列のまま。 */
function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** `a=1&b=2` 形式の小さいPOSTボディを読む。上限を超えたら null(読み切らず接続を切る)。 */
function readBody(req: http.IncomingMessage, max: number): Promise<string | null> {
  return new Promise((resolve) => {
    let body = '';
    let over = false;
    req.on('data', (chunk: Buffer) => {
      if (over) return;
      body += chunk.toString('utf8');
      if (body.length > max) {
        over = true;
        resolve(null);
        req.destroy();
      }
    });
    req.on('end', () => { if (!over) resolve(body); });
    req.on('error', () => resolve(null));
  });
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = safeDecode(part.slice(i + 1).trim());
  }
  return out;
}

export function startAdminWeb(port: number, host: string, secret: string | undefined, adminUser: string | undefined, adminPass: string | undefined, h: ControlHandlers): http.Server | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    console.warn(`[online] ONLINE_PROXY_SECRET が未設定(または${MIN_SECRET_LENGTH}文字未満)のため、管理画面は無効です。`);
    return null;
  }
  if (!adminUser || !adminPass) {
    console.warn('[online] ONLINE_ADMIN_USER / ONLINE_ADMIN_PASS が未設定のため、管理画面は無効です。');
    return null;
  }

  // 上の判定で string だと分かった値を、クロージャの中でも string として使えるよう束ねる
  const proxySecret: string = secret;
  const user: string = adminUser;
  const pass: string = adminPass;

  // メモリ上のセッション(再起動で全員ログアウトになる。イベント用途として許容)。
  const sessions = new Map<string, number>(); // token -> 作成時刻
  // ログイン失敗の回数制限(IPごと)。固定ウィンドウ: findtime 内に maxAttempts 回失敗したら以降は 429。
  const loginFails = new Map<string, { start: number; n: number }>();

  function sweepSessions(now: number): void {
    for (const [tok, t] of sessions) if (now - t > SESSION_TTL_MS) sessions.delete(tok);
    for (const [ip, f] of loginFails) if (now - f.start >= LOGIN_WINDOW_MS) loginFails.delete(ip);
  }
  function tooManyFailures(ip: string, now: number): boolean {
    const f = loginFails.get(ip);
    if (!f || now - f.start >= LOGIN_WINDOW_MS) return false;
    return f.n >= LOGIN_MAX_ATTEMPTS;
  }
  function recordFailure(ip: string, now: number): void {
    const f = loginFails.get(ip);
    if (!f || now - f.start >= LOGIN_WINDOW_MS) loginFails.set(ip, { start: now, n: 1 });
    else f.n++;
  }

  const server = http.createServer((req, res) => {
    // 非同期ハンドラの例外は unhandled rejection になり、同じプロセスのオンライン対戦ごと落ちる。ここで必ず受け止める。
    handle(req, res).catch((e: Error) => {
      log(`admin error: ${e.message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"internal"}');
      else res.end();
    });
  });
  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const send = (code: number, type: string, body: string, extraHeaders: http.OutgoingHttpHeaders = {}) => {
      res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extraHeaders }).end(body);
    };
    const json = (code: number, body: object) => send(code, 'application/json', JSON.stringify(body));
    const html = (code: number, body: string, extraHeaders: http.OutgoingHttpHeaders = {}) => send(code, 'text/html; charset=utf-8', body, extraHeaders);

    const proxy = req.headers['x-online-proxy'];
    if (typeof proxy !== 'string' || !safeEqual(proxy, proxySecret)) return json(403, { error: 'forbidden' });

    const url = safeUrl(req.url);
    if (!url) return json(400, { error: 'bad_request' });

    const ip = (() => {
      const fwd = req.headers['x-forwarded-for'];
      return typeof fwd === 'string' ? fwd.split(',')[0].trim() : req.socket.remoteAddress ?? '';
    })();
    const now = Date.now();
    sweepSessions(now);

    // same-origin からの直接ナビゲーション/フォーム送信だけを通す(ログインフォームはJS無しのためこのチェックのみ)。
    const sameOriginish = (): boolean => {
      const site = req.headers['sec-fetch-site'];
      return typeof site !== 'string' || site === 'same-origin' || site === 'none';
    };

    // --- ログイン画面・ログイン処理(セッション不要) ---
    if (req.method === 'GET' && url.pathname === '/login') {
      return html(200, LOGIN_HTML(url.searchParams.get('error') === '1'));
    }
    if (req.method === 'POST' && url.pathname === '/login') {
      if (!sameOriginish()) return html(403, LOGIN_HTML(true));
      if (tooManyFailures(ip, now)) return html(429, LOGIN_HTML(true));
      const body = await readBody(req, MAX_BODY_BYTES);
      const params = new URLSearchParams(body ?? '');
      const u = params.get('user') ?? '', p = params.get('pass') ?? '';
      if (safeEqual(u, user) && safeEqual(p, pass)) {
        const token = crypto.randomBytes(32).toString('hex');
        sessions.set(token, now);
        log(`admin login ok ip=${ip}`);
        return html(302, '', {
          location: '/admin/',
          'set-cookie': `${SESSION_COOKIE}=${token}; Path=/admin/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
        });
      }
      recordFailure(ip, now);
      log(`admin login failed ip=${ip}`); // 監視側がこの行を見て遮断する
      return html(401, LOGIN_HTML(true));
    }
    if (req.method === 'POST' && url.pathname === '/logout') {
      if (req.headers['x-requested-with'] !== 'online-admin') return json(403, { error: 'forbidden' });
      const cookies = parseCookies(req.headers.cookie);
      if (cookies[SESSION_COOKIE]) sessions.delete(cookies[SESSION_COOKIE]);
      return html(302, '', {
        location: '/admin/login',
        'set-cookie': `${SESSION_COOKIE}=; Path=/admin/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
      });
    }

    // --- ここから先はセッション必須 ---
    const cookies = parseCookies(req.headers.cookie);
    const token = cookies[SESSION_COOKIE];
    const authed = typeof token === 'string' && sessions.has(token);
    if (!authed) {
      if (req.method === 'GET' && url.pathname === '/') return html(302, '', { location: '/admin/login' });
      return json(401, { error: 'login_required' });
    }

    const post = req.method === 'POST';
    if (post) {
      const site = req.headers['sec-fetch-site'];
      if (req.headers['x-requested-with'] !== 'online-admin' || (typeof site === 'string' && site !== 'same-origin')) {
        return json(403, { error: 'forbidden' });
      }
    }

    if (req.method === 'GET' && url.pathname === '/') return html(200, ADMIN_HTML);
    if (req.method === 'GET' && url.pathname === '/app.css') return send(200, 'text/css; charset=utf-8', ADMIN_CSS);
    if (req.method === 'GET' && url.pathname === '/app.js') return send(200, 'application/javascript; charset=utf-8', ADMIN_JS);
    // /api/status, /api/open, /api/close, /api/kick は CLI と同じ処理(接頭辞 /api を外して渡す)
    if (url.pathname.startsWith('/api/')) {
      const inner = new URL(url.toString());
      inner.pathname = url.pathname.slice(4);
      const r = handleAdminRequest(h, req.method ?? 'GET', inner);
      return json(r.code, r.body);
    }
    json(404, { error: 'not_found' });
  }
  server.listen(port, host, () => console.log(`[online] admin web http://${host}:${port} (リバースプロキシ経由のみ)`));
  return server;
}
