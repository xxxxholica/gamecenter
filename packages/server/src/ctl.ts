// 使い方: npm run ctl -w packages/server -- <コマンド>
//   status                                  … 全ゲームの状態
//   open <ゲーム> [分] [キー=値 ...]         … 開放し、指定の分後に自動で閉鎖する(分を省略すると180分。0 で手動閉鎖まで開放し続ける)
//       例: open skyway 180 map=tsukikage_touge
//       分・各設定には random も指定できる(skyway の map=random は参加者の希望で決定、
//       分=random は 1/2/3/6 時間から開放時に1回選ぶ)。設定を省略すると前回の設定。
//   close <ゲーム|all>                      … 閉鎖して参加者を全員切断(all で全ゲームを緊急停止)
//   kick <ゲーム> <参加者id>                 … 参加者を追い出す(id は status の参加者一覧)
//   clear-board <枠>                        … ランキングの枠の記録(とゴースト)をすべて消す。枠は <ゲームid> か <ゲームid>:<コース/難易度>
//       例: clear-board street-b-boy / clear-board midnight-skyway:tsukikage_touge
//   mark-dev <枠> <順位> [off]              … 枠の<順位>位の記録に、開発者の印を付ける(名前が「開発者」になり、ホームで強調される)。off で外す
//   set-role <枠> <順位> <名前> <ロール>     … 枠の<順位>位に「好きな名前（ロール）」を設定する(ロールは 開発者 または テスター)
//   clear-role <枠> <順位>                  … 枠の<順位>位のロール設定を解除し、元の名前に戻す
//   remove-record <枠> <順位>               … 枠の<順位>位(1〜3)の記録を1件消す(荒らし・不正な記録の削除)
//   ads <on|off>                            … ローディング画面の広告表示を ON / OFF に切り替える(既定は OFF)
// ゲームは id(例: midnight-skyway)か、一意に決まる部分文字列(例: skyway)。
import http from 'node:http';
import { DEFAULT_SOCKET, type ServerStatus } from './control.ts';

const DEFAULT_MINUTES = 180;
const socketPath = process.env.ONLINE_CONTROL_SOCKET ?? DEFAULT_SOCKET;
const [cmd, ...rest] = process.argv.slice(2);

function call(method: string, path: string): Promise<any> {
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
  if (s.ads) {
    console.log(`ローディング広告: ${s.ads.enabled ? 'ON' : 'OFF'} (有効ロゴ ${s.ads.count}件)`);
  }
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
  } else if (cmd === 'clear-board' && rest[0]) {
    const r = await call('POST', `/lb-clear?${new URLSearchParams({ board: rest[0] })}`);
    console.log(`${rest[0]}: ${r.cleared} 件を消しました`);
  } else if (cmd === 'mark-dev' && rest[0] && rest[1]) {
    const off = rest[2] === 'off';
    const r = await call('POST', `/lb-dev?${new URLSearchParams({ board: rest[0], rank: rest[1], on: off ? '0' : '1' })}`);
    console.log(`${rest[0]}: ${rest[1]}位の開発者の印を${off ? '外し' : '付け'}${r.changed ? 'ました' : '(すでにその状態です)'}`);
  } else if (cmd === 'set-role' && rest[0] && rest[1] && rest[2] && rest[3]) {
    const r = await call('POST', `/lb-role?${new URLSearchParams({ board: rest[0], rank: rest[1], on: '1', name: rest[2], role: rest[3] })}`);
    console.log(`${rest[0]}: ${rest[1]}位に「${rest[2]}（${rest[3]}）」を設定${r.changed ? 'しました' : '(すでにその状態です)'}`);
  } else if (cmd === 'clear-role' && rest[0] && rest[1]) {
    const r = await call('POST', `/lb-role?${new URLSearchParams({ board: rest[0], rank: rest[1], on: '0' })}`);
    console.log(`${rest[0]}: ${rest[1]}位のロール設定を解除${r.changed ? 'しました' : '(すでにその状態です)'}`);
  } else if (cmd === 'remove-record' && rest[0] && rest[1]) {
    await call('POST', `/lb-remove?${new URLSearchParams({ board: rest[0], rank: rest[1] })}`);
    console.log(`${rest[0]}: ${rest[1]}位の記録を消しました`);
  } else if (cmd === 'ads' && (rest[0] === 'on' || rest[0] === 'off')) {
    show(await call('POST', `/ads?on=${rest[0] === 'on' ? '1' : '0'}`));
  } else {
    console.error('使い方: ctl <status | open <ゲーム> [分] [キー=値 ...] | close <ゲーム|all> | kick <ゲーム> <id> | ads <on|off> | clear-board <枠> | mark-dev <枠> <順位> [off] | set-role <枠> <順位> <名前> <開発者|テスター> | clear-role <枠> <順位> | remove-record <枠> <順位>>');
    process.exit(2);
  }
} catch (e) {
  console.error(`失敗しました(${(e as Error).message})。サーバーが起動しているか、同じユーザーで実行しているか、ゲーム名が合っているか確認してください。`);
  process.exit(1);
}
