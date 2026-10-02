// 管理画面の静的ファイル(HTML/CSS/JS)。/admin(末尾スラッシュなし)で開かれても崩れないよう、参照はすべて /admin/ からの絶対パスにする。
// CSP が script-src 'self' のため、インラインにせず別ファイルとして配信する。
// ゲームごとのカードは、サーバーが返す設定項目(schema)から組み立てる。表示する文字は textContent で入れる。
export const ADMIN_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>オンライン対戦 管理</title>
<link rel="stylesheet" href="/admin/app.css">
</head>
<body>
<main>
  <section class="card top">
    <div id="summary" class="stats"></div>
    <div class="row">
      <button id="stop-all" class="danger">全ゲームを緊急停止</button>
      <button id="logout" class="ghost">ログアウト</button>
    </div>
  </section>
  <div id="games"></div>
</main>
<script src="/admin/app.js"></script>
</body>
</html>
`;

/** ブラウザ標準のBasic認証ダイアログの代わりの、自前のログイン画面。JS無し(素のフォームPOST)。 */
export const LOGIN_HTML = (showError: boolean): string => `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>オンライン対戦 管理 — ログイン</title>
<style>
:root { color-scheme: dark; }
html { font-size: clamp(14px, 1.2vw + 9px, 20px); }
body { margin: 0; min-height: 100dvh; display: flex; align-items: center; justify-content: center; background: #060b16; color: #e6edf7; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; }
form { width: min(22rem, calc(100vw - 32px)); background: #0c1626; border: 1px solid #22304a; border-radius: 12px; padding: 24px; display: flex; flex-direction: column; gap: 14px; }
h1 { margin: 0 0 4px; font-size: 1.1rem; }
label { font-size: .8rem; color: #8fa3c2; display: flex; flex-direction: column; gap: 6px; }
input, button { font: inherit; font-size: 1rem; padding: .6em .8em; border-radius: 10px; border: 1px solid #3a4a66; background: #14213a; color: #fff; }
button { cursor: pointer; font-weight: 700; background: linear-gradient(135deg, #00b8d4, #0091ea); border-color: #00e5ff; }
.error { color: #ff6b81; font-size: .85rem; margin: 0; }
</style>
</head>
<body>
<form method="post" action="/admin/login">
  <h1>オンライン対戦 管理</h1>
  ${showError ? '<p class="error">IDまたはパスワードが違います(または試行回数の上限です)。</p>' : ''}
  <label>ID<input type="text" name="user" autocomplete="username" required autofocus></label>
  <label>パスワード<input type="password" name="pass" autocomplete="current-password" required></label>
  <button type="submit">ログイン</button>
</form>
</body>
</html>
`;

export const ADMIN_CSS = `
:root { color-scheme: dark; }
html { font-size: clamp(14px, 1.2vw + 9px, 20px); }
body { margin: 0; background: #060b16; color: #e6edf7; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; }
main { max-width: 36rem; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 16px; }
h2 { margin: 0; font-size: 1.05rem; }
#games { display: flex; flex-direction: column; gap: 16px; }
.card { background: #0c1626; border: 1px solid #22304a; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.state { font-size: 1rem; font-weight: 800; padding: .2em .8em; border-radius: 999px; background: #3a1620; color: #ff6b81; }
.state.open { background: #0b3a22; color: #00e676; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr)); gap: 8px; }
.stat { background: #0a111f; border: 1px solid #22304a; border-radius: 10px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.stat .k { font-size: .72rem; color: #8fa3c2; letter-spacing: .08em; }
.stat .v { white-space: nowrap; font-size: 1.5rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; color: #fff; }
.stat .v.txt { font-size: 1.05rem; line-height: 1.5; }
.stat .v small { font-size: .9rem; font-weight: 600; color: #8fa3c2; }
.stat.on .v { color: #00e676; }
label { font-size: .8rem; color: #8fa3c2; }
.field { display: flex; align-items: center; gap: .8rem; }
.field label { white-space: nowrap; }
.field select { flex: 1; min-width: 0; }
select, button { font: inherit; font-size: 1rem; padding: .6em .8em; border-radius: 10px; border: 1px solid #3a4a66; background: #14213a; color: #fff; }
button { cursor: pointer; font-weight: 700; }
button.primary { background: linear-gradient(135deg, #00b8d4, #0091ea); border-color: #00e5ff; }
button.danger { background: #4a1520; border-color: #ff6b81; }
button.ghost { background: transparent; border-color: #3a4a66; color: #8fa3c2; }
button:disabled { opacity: .5; cursor: default; }
.row { display: flex; gap: 10px; }
.row > * { flex: 1; }
.members { display: flex; flex-direction: column; gap: 6px; }
.member { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: .4em .7em; border-radius: 8px; background: #0a111f; border: 1px solid #22304a; font-size: .9rem; }
.member button { padding: .3em .8em; font-size: .85rem; }
`;

export const ADMIN_JS = `
(function () {
  var gamesEl = document.getElementById('games');
  var summaryEl = document.getElementById('summary');
  var HEADERS = { 'X-Requested-With': 'online-admin' };
  var TITLES = { 'midnight-skyway': 'MIDNIGHT SKYWAY', 'ennichi-shateki': 'えんにち射的' };
  var PHASES = { lobby: '参加受付中', loading: 'ロード中', racing: '実行中' };
  var MINUTES = [['60', '1時間'], ['120', '2時間'], ['180', '3時間'], ['360', '6時間']];
  var cards = {};      // gameId -> { el, selects, minutes, ... } (選択中の値を自動更新で上書きしないため、カードは作り直さず中身だけ更新する)

  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) for (var k in props) { if (k === 'text') e.textContent = props[k]; else e[k] = props[k]; }
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }

  function call(method, path) {
    return fetch(path, { method: method, headers: HEADERS, cache: 'no-store', credentials: 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }

  function stat(label, value, sub, on) {
    var v = el('b', { className: 'v' + (/^[0-9:-]+$/.test(value) ? '' : ' txt'), text: value });
    if (sub) v.appendChild(el('small', { text: sub }));
    return el('div', { className: 'stat' + (on ? ' on' : '') }, [el('span', { className: 'k', text: label }), v]);
  }

  function setStats(box, list) {
    box.textContent = '';
    list.forEach(function (x) { box.appendChild(stat(x[0], x[1], x[2], x[3])); });
  }

  function buildCard(g) {
    var c = { selects: {} };
    c.title = el('h2', { text: TITLES[g.id] || g.id });
    c.state = el('span', { className: 'state' });
    c.detail = el('div', { className: 'stats' });
    var kids = [el('div', { className: 'head' }, [c.title, c.state]), c.detail];
    g.schema.forEach(function (f) {
      var sel = el('select', null, f.options.map(function (o) { return el('option', { value: o.value, text: o.label }); }));
      sel.value = g.config[f.key] || f.options[0].value;
      c.selects[f.key] = sel;
      kids.push(el('div', { className: 'field' }, [el('label', { text: f.label }), sel]));
    });
    c.minutes = el('select', null, MINUTES.map(function (m) { return el('option', { value: m[0], text: m[1] }); }));
    c.minutes.value = '180';
    kids.push(el('div', { className: 'field' }, [el('label', { text: '開放する時間' }), c.minutes]));
    c.openBtn = el('button', { className: 'primary', text: '開放する' });
    c.closeBtn = el('button', { text: '閉鎖する' });
    kids.push(el('div', { className: 'row' }, [c.openBtn, c.closeBtn]));
    c.members = el('div', { className: 'members' });
    kids.push(c.members);
    c.el = el('section', { className: 'card' }, kids);
    c.id = g.id;
    c.openBtn.addEventListener('click', function () {
      var q = 'game=' + encodeURIComponent(g.id) + '&minutes=' + encodeURIComponent(c.minutes.value);
      Object.keys(c.selects).forEach(function (k) { q += '&' + encodeURIComponent(k) + '=' + encodeURIComponent(c.selects[k].value); });
      act('/admin/api/open?' + q);
    });
    c.closeBtn.addEventListener('click', function () {
      if (c.players > 0 && !window.confirm('参加者が ' + c.players + ' 人います。全員が切断されます。閉鎖しますか？')) return;
      act('/admin/api/close?game=' + encodeURIComponent(g.id));
    });
    return c;
  }

  function updateCard(c, g) {
    c.players = g.players;
    c.state.textContent = g.open ? '開放中' : '閉鎖中';
    c.state.className = 'state' + (g.open ? ' open' : '');
    var closes = !g.open ? '-' : g.closesAt ? new Date(g.closesAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '手動';
    setStats(c.detail, [
      ['参加者', String(g.players), '/ ' + g.max, g.players > 0],
      ['進行', PHASES[g.phase] || g.phase],
      ['接続', String(g.clients)],
      ['自動閉鎖', closes],
    ]);
    // 参加者とキック
    c.members.textContent = '';
    g.members.forEach(function (m) {
      var kick = el('button', { className: 'danger', text: 'キック' });
      kick.addEventListener('click', function () {
        if (window.confirm(m.name + ' を追い出しますか？')) act('/admin/api/kick?game=' + encodeURIComponent(g.id) + '&id=' + m.id);
      });
      c.members.appendChild(el('div', { className: 'member' }, [el('span', { text: m.name }), kick]));
    });
  }

  function render(s) {
    var total = 0, open = 0;
    s.games.forEach(function (g) {
      if (!cards[g.id]) { cards[g.id] = buildCard(g); gamesEl.appendChild(cards[g.id].el); }
      updateCard(cards[g.id], g);
      total += g.players;
      if (g.open) open++;
    });
    setStats(summaryEl, [
      ['開放中', String(open), '/ ' + s.games.length, open > 0],
      ['参加者', String(total)],
      ['接続', String(s.clients)],
    ]);
  }

  function refresh() {
    return call('GET', '/admin/api/status').then(render).catch(function () {});
  }

  function act(path) {
    return call('POST', path).then(render).catch(refresh);
  }

  document.getElementById('stop-all').addEventListener('click', function () {
    if (window.confirm('全ゲームを閉鎖し、参加者を全員切断します。よろしいですか？')) act('/admin/api/close?game=all');
  });
  document.getElementById('logout').addEventListener('click', function () {
    fetch('/admin/logout', { method: 'POST', headers: HEADERS, cache: 'no-store', credentials: 'same-origin' })
      .then(function () { location.href = '/admin/login'; });
  });

  refresh();
  setInterval(refresh, 10000);
})();
`;
