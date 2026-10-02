// 使い方: npm run ctl -w packages/server -- <コマンド>
//   status                                  … 全ゲームの状態
//   open <ゲーム> [分] [キー=値 ...]         … 開放し、指定の分後に自動で閉鎖する(分を省略すると180分。0 で手動閉鎖まで開放し続ける)
//       例: open skyway 180 map=helsinki_technical tod=night / open ennichi 120 mode=coop
//       分・各設定には random も指定できる(skyway の map=random は参加者の希望で決定、tod=random はレースごとに抽選、
//       分=random は 1/2/3/6 時間から開放時に1回選ぶ)。設定を省略すると前回の設定。
//   close <ゲーム|all>                      … 閉鎖して参加者を全員切断(all で全ゲームを緊急停止)
//   kick <ゲーム> <参加者id>                 … 参加者を追い出す(id は status の参加者一覧)
// ゲームは id(例: midnight-skyway)か、一意に決まる部分文字列(例: skyway)。
import http from 'node:http';
import { DEFAULT_SOCKET, type ServerStatus } from './control.ts';

const DEFAULT_MINUTES = 180;
const socketPath = process.env.ONLINE_CONTROL_SOCKET ?? DEFAULT_SOCKET;
const [cmd, ...rest] = process.argv.slice(2);

function call(method: string, path: string): Promise<ServerStatus> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, method, path }, (res) => {
      let body = '';
      res.on('data', (d) => (body += d));
      res.on('end', () => (res.statusCode === 200 ? resolve(JSON.parse(body)) : reject(new Error(`HTTP ${res.statusCode}`))));
    });
    req.on('error', reject);
    req.end();
  });
}

function show(s: ServerStatus): void {
  for (const g of s.games) {
    const until = g.open && g.closesAt ? `(${new Date(g.closesAt).toLocaleTimeString('ja-JP')} に自動で閉鎖)` : g.open ? '(手動で閉鎖するまで開放)' : '';
    const cfg = g.schema.map((f) => `${f.key}=${g.config[f.key]}${g.config[f.key] === 'random' && g.resolved[f.key] ? `(次:${g.resolved[f.key]})` : ''}`).join(' ');
    console.log(`${g.id}: ${g.open ? '開放中' : '閉鎖中'} ${until}  ${cfg}  参加者:${g.players}/${g.max}(${g.phase})  接続:${g.clients}`);
    for (const m of g.members) console.log(`    id=${m.id} ${m.name}`);
  }
  console.log(`接続の合計: ${s.clients}`);
}

try {
  if (cmd === 'status') {
    show(await call('GET', '/status'));
  } else if (cmd === 'open' && rest[0]) {
    const q = new URLSearchParams({ game: rest[0], minutes: String(DEFAULT_MINUTES) });
    for (const a of rest.slice(1)) {
      const kv = a.split('=');
      if (kv.length === 2) q.set(kv[0], kv[1]);                // キー=値: ゲーム固有の設定
      else if (a === 'random' || Number.isFinite(Number(a))) q.set('minutes', a);
      else throw new Error(`引数を解釈できません: ${a}`);
    }
    show(await call('POST', `/open?${q}`));
  } else if (cmd === 'close' && rest[0]) {
    show(await call('POST', `/close?${new URLSearchParams({ game: rest[0] })}`));
  } else if (cmd === 'kick' && rest[0] && rest[1]) {
    show(await call('POST', `/kick?${new URLSearchParams({ game: rest[0], id: rest[1] })}`));
  } else {
    console.error('使い方: ctl <status | open <ゲーム> [分] [キー=値 ...] | close <ゲーム|all> | kick <ゲーム> <id>>');
    process.exit(2);
  }
} catch (e) {
  console.error(`失敗しました(${(e as Error).message})。サーバーが起動しているか、同じユーザーで実行しているか、ゲーム名が合っているか確認してください。`);
  process.exit(1);
}
