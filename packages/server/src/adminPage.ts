// 管理画面の静的ファイル(HTML/CSS/JS)。/admin(末尾スラッシュなし)で開かれても崩れないよう、参照はすべて /admin/ からの絶対パスにする。
// 一般向け(Hub)の明るい方眼グリッド＋落書き背景と手書き風フォント(Yusei Magic)を取り入れたポップなデザイン。
// アナリティクスボードは、全収集データを多角的にタブで切り替えて閲覧・JSON出力できる。

export const ADMIN_HTML = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>ゲームセンター 管理ダッシュボード</title>
<link rel="stylesheet" href="/admin/app.css">
</head>
<body>
<main>
  <header class="admin-header">
    <div class="brand">
      <h1>ゲームセンター管理</h1>
    </div>
    <div class="header-actions">
      <button id="stop-all" class="danger">全ゲーム緊急停止</button>
      <button id="logout" class="ghost">ログアウト</button>
    </div>
  </header>

  <section class="card" id="server-card">
    <div class="card-head">
      <h2>🌐 オンライン対戦</h2>
    </div>
    <div id="summary" class="stats"></div>
    <div id="games" class="server-games-container"></div>
  </section>

  <!-- アナリティクス ボード -->
  <section class="card" id="analytics-card">
    <div class="card-head">
      <h2>📈 アナリティクス</h2>
      <button id="analytics-reload" class="ghost">再読み込み</button>
    </div>

    <!-- ゲーム選択フィルターバー -->
    <div class="analytics-filter-bar">
      <div class="filter-group">
        <label for="analytics-game-filter">表示対象:</label>
        <select id="analytics-game-filter">
          <option value="all">すべてのゲーム (全体集計)</option>
          <option value="midnight-skyway">ミッドナイト・スカイウェイ</option>
          <option value="street-b-boy">ストリートビーボーイ</option>
          <option value="sumo-smash-3d">剛体大相撲</option>
          <option value="school-corridor-runner">テンパレラン</option>
          <option value="survivor-score-battle">サバイバー・スコアバトル</option>
          <option value="ennichi-shateki">えんにち射的</option>
          <option value="extreme-edge-arcade">極限ギリギリ選手権</option>
          <option value="tani-runner-124">単位増殖ラン</option>
          <option value="tower-stack">タワースタック</option>
          <option value="phaser-fighter">ストリートストライカー</option>
        </select>
      </div>
      <div id="game-filter-status" class="game-filter-badge" style="display:none;"></div>
    </div>

    <!-- タブ切り替えバー -->
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="tab-overview">サマリー</button>
      <button class="tab-btn" data-tab="tab-hardware">ハードウェア</button>
      <button class="tab-btn" data-tab="tab-performance">パフォーマンス</button>
      <button class="tab-btn" data-tab="tab-progression">進行・死因</button>
      <button class="tab-btn" data-tab="tab-input">操作・APM</button>
      <button class="tab-btn" data-tab="tab-raw">生イベントログ</button>
    </div>

    <!-- 各タブ画面 -->
    <div id="tab-overview" class="tab-panel active">
      <!-- 全体表示用 -->
      <div id="analytics-all-view">
        <div id="analytics-summary" class="stats"></div>
        <div id="analytics-table-wrap" class="table-wrap"></div>
      </div>
      <!-- 個別ゲーム表示用 -->
      <div id="analytics-game-view" style="display:none;">
        <div id="game-view-header" class="game-view-header"></div>
        <div id="game-stats" class="stats"></div>
        <div id="game-progression-details" class="sub-grids"></div>
        <div id="game-plays-wrap"></div>
      </div>
    </div>

    <div id="tab-hardware" class="tab-panel">
      <div id="hardware-stats" class="stats"></div>
      <div id="hardware-details" class="sub-grids"></div>
    </div>

    <div id="tab-performance" class="tab-panel">
      <div id="performance-stats" class="stats"></div>
      <div id="performance-table-wrap" class="table-wrap"></div>
      <div id="errors-box" class="sub-panel"></div>
    </div>

    <div id="tab-progression" class="tab-panel">
      <div id="progression-details" class="game-boxes"></div>
    </div>

    <div id="tab-input" class="tab-panel">
      <div id="input-stats" class="stats"></div>
      <div id="input-details" class="sub-grids"></div>
    </div>

    <div id="tab-raw" class="tab-panel">
      <div id="raw-logs-wrap"></div>
    </div>

    <!-- 項目別 JSON エクスポート -->
    <div class="export-box">
      <div class="export-head">
        <h3>項目別 JSON エクスポート</h3>
        <p class="hint">収集した全アナリティクスデータを項目別に JSON でダウンロードできます。<span id="export-target-hint" class="export-target-hint">対象: 全ゲーム</span></p>
      </div>
      <div class="export-controls">
        <select id="export-type">
          <option value="all">すべてのデータ (完全統合)</option>
          <option value="summary">集計サマリー</option>
          <option value="hardware">ハードウェア・環境スペック</option>
          <option value="performance">パフォーマンス・FPS・エラー</option>
          <option value="progression">ゲーム進行・到達度・死因</option>
          <option value="input">操作・APM・入力統計</option>
          <option value="errors">クライアントエラーログ</option>
          <option value="plays">プレイ履歴一覧</option>
          <option value="sessions">訪問セッション一覧</option>
          <option value="events">全イベントログ</option>
        </select>
        <button id="export-btn" class="export">JSONダウンロード</button>
      </div>
    </div>
  </section>

  <section class="card" id="boards-card">
    <div class="card-head">
      <h2>🏆 ランキング管理</h2>
      <button id="boards-reload" class="ghost">再読み込み</button>
    </div>
    <div id="boards"></div>
  </section>
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
<title>ゲームセンター 管理 — ログイン</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800&family=Yusei+Magic&display=swap');
html { font-size: clamp(14px, 1.2vw + 9px, 20px); }
body {
  margin: 0;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #faf9f6;
  background-image:
    url('/doodles.svg'),
    linear-gradient(to right, rgba(148, 163, 184, 0.22) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.22) 1px, transparent 1px);
  background-size: 800px 800px, 24px 24px, 24px 24px;
  color: #1e293b;
  font-family: 'Yusei Magic', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', sans-serif;
}
form {
  width: min(24rem, calc(100vw - 32px));
  background: #ffffff;
  border: 2px solid #cbd5e1;
  border-radius: 16px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  padding: 28px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.brand { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.badge { background: #ffedd5; color: #ea580c; border: 1.5px solid #fed7aa; padding: .15em .6em; border-radius: 999px; font-size: .75rem; font-weight: 800; }
h1 { margin: 0; font-size: 1.3rem; font-weight: 800; color: #0f172a; }
label { font-size: .85rem; font-weight: 700; color: #475569; display: flex; flex-direction: column; gap: 6px; }
input, button {
  font: inherit;
  font-size: 1rem;
  padding: .65em .8em;
  border-radius: 10px;
  border: 1.5px solid #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
  outline: none;
  box-sizing: border-box;
}
input:focus { border-color: #0284c7; background: #fff; box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15); }
button {
  cursor: pointer;
  font-weight: 800;
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  border: none;
  color: #fff;
  box-shadow: 0 4px 10px rgba(2, 132, 199, 0.25);
  transition: transform .1s ease, filter .1s ease;
}
button:hover { filter: brightness(1.05); }
button:active { transform: translateY(1px); }
.error { color: #dc2626; background: #fee2e2; border: 1px solid #fca5a5; padding: .5em .8em; border-radius: 8px; font-size: .85rem; margin: 0; }
</style>
</head>
<body>
<form method="post" action="/admin/login">
  <div class="brand">
    <h1>ゲームセンター 管理</h1>
  </div>
  ${showError ? '<p class="error">IDまたはパスワードが違います(または試行回数の上限です)。</p>' : ''}
  <label>管理者ID<input type="text" name="user" autocomplete="username" required autofocus></label>
  <label>パスワード<input type="password" name="pass" autocomplete="current-password" required></label>
  <button type="submit">ログイン</button>
</form>
</body>
</html>
`;

export const ADMIN_CSS = `
@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@700;800&family=Yusei+Magic&display=swap');

html { font-size: clamp(14px, 1.2vw + 9px, 19px); }
body {
  margin: 0;
  background-color: #faf9f6;
  background-image:
    url('/doodles.svg'),
    linear-gradient(to right, rgba(148, 163, 184, 0.22) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(148, 163, 184, 0.22) 1px, transparent 1px);
  background-size: 800px 800px, 24px 24px, 24px 24px;
  color: #1e293b;
  font-family: 'Yusei Magic', 'M PLUS Rounded 1c', 'Hiragino Maru Gothic ProN', sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { max-width: 58rem; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 18px; box-sizing: border-box; }

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  background: #ffffff;
  border: 2px solid #cbd5e1;
  border-radius: 16px;
  padding: 14px 18px;
  box-shadow: 0 4px 14px rgba(15, 23, 42, 0.05);
}
.brand { display: flex; align-items: center; gap: 8px; }
.admin-header h1 { margin: 0; font-size: 1.25rem; font-weight: 800; color: #0f172a; }
.header-actions { display: flex; gap: 8px; }

h2 { margin: 0; font-size: 1.1rem; font-weight: 800; color: #0f172a; display: flex; align-items: center; gap: 6px; }

/* オンライン対戦カード内のゲーム操作コンソール */
.server-games-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-top: 6px;
  padding-top: 14px;
  border-top: 2px dashed #cbd5e1;
}

.server-game-card {
  background: #f8fafc;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.server-game-card h3 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
}
.server-game-card .stat {
  background: #ffffff;
}

/* 食いつき度 (エンゲージメント) 表示用 */
.engagement-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 800;
  font-size: .85rem;
  padding: .2em .6em;
  border-radius: 999px;
  white-space: nowrap;
}
.engagement-badge.hot {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}
.engagement-badge.good {
  background: #f0fdf4;
  color: #15803d;
  border: 1px solid #bbf7d0;
}
.engagement-badge.normal {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #e2e8f0;
}

.card {
  background: #ffffff;
  border: 2px solid #cbd5e1;
  border-radius: 16px;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  box-shadow: 0 4px 16px rgba(15, 23, 42, 0.05);
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
}
.card-head, .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; }

.state {
  font-size: .95rem;
  font-weight: 800;
  padding: .25em .8em;
  border-radius: 999px;
  background: #fee2e2;
  color: #b91c1c;
  border: 1.5px solid #fca5a5;
}
.state.open {
  background: #dcfce7;
  color: #15803d;
  border-color: #86efac;
}

.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 10px; }
.stat {
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.stat .k { font-size: .75rem; font-weight: 700; color: #64748b; letter-spacing: .04em; }
.stat .v {
  white-space: nowrap;
  font-size: 1.55rem;
  font-weight: 800;
  font-family: 'Impact', 'Arial Black', sans-serif;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
  color: #0f172a;
}
.stat .v.txt { font-size: 1.05rem; line-height: 1.5; font-family: inherit; }
.stat .v small { font-size: .85rem; font-weight: 700; color: #64748b; margin-left: 2px; }
.stat.on .v { color: #059669; }
.stat.warn .v { color: #dc2626; }
.stat.warn { border-color: #fecaca; background: #fef2f2; }

/* アナリティクス ゲームフィルターバー */
.analytics-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  padding: 10px 14px;
}
.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 15rem;
}
.filter-group label {
  font-size: .88rem;
  font-weight: 800;
  color: #0f172a;
  white-space: nowrap;
}
.filter-group select {
  font-size: .95rem;
  font-weight: 800;
  flex: 1;
  max-width: 24rem;
  background: #ffffff;
  border-color: #0284c7;
}
.game-filter-badge {
  background: #e0f2fe;
  color: #0369a1;
  border: 1.5px solid #bae6fd;
  font-weight: 800;
  font-size: .82rem;
  padding: .25em .8em;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.game-view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  padding: 12px 16px;
  margin-bottom: 2px;
}
.game-view-header h3 {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 8px;
}
.game-view-header .meta-tag {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fcd34d;
  font-size: .78rem;
  font-weight: 800;
  padding: .2em .65em;
  border-radius: 999px;
}
.export-target-hint {
  font-size: .8rem;
  font-weight: 800;
  color: #0369a1;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  padding: .2em .6em;
  border-radius: 6px;
  margin-left: 8px;
}

/* タブバー */
.tab-bar {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
  border-bottom: 2px solid #e2e8f0;
}
.tab-btn {
  padding: .45em .95em;
  font-size: .88rem;
  font-weight: 800;
  border-radius: 999px;
  border: 1.5px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  white-space: nowrap;
  transition: all .15s ease;
}
.tab-btn:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}
.tab-btn.active {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  color: #ffffff;
  border-color: #0284c7;
  box-shadow: 0 3px 8px rgba(2, 132, 199, 0.25);
}
.tab-panel {
  display: none;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
  max-width: 100%;
}
.tab-panel.active {
  display: flex;
}
#analytics-all-view, #analytics-game-view {
  display: flex;
  flex-direction: column;
  gap: 22px;
  min-width: 0;
  max-width: 100%;
}

/* サブパネル & グリッド */
.sub-grids {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 12px;
}
.sub-card {
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sub-card h4 {
  margin: 0;
  font-size: .92rem;
  font-weight: 800;
  color: #0f172a;
  border-bottom: 1.5px solid #e2e8f0;
  padding-bottom: 4px;
}
/* 進行・死因タブ: ゲームごとの大きなボックス */
.game-boxes { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.game-box {
  background: #ffffff;
  border: 2px solid #cbd5e1;
  border-radius: 14px;
  padding: 14px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  box-shadow: 0 2px 10px rgba(15, 23, 42, 0.05);
}
.game-box-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding-bottom: 10px;
  border-bottom: 2px dashed #e2e8f0;
}
.game-box-head h3 { margin: 0; font-size: 1.05rem; font-weight: 800; color: #0f172a; }
.game-box-meta { display: flex; gap: 6px; flex-wrap: wrap; }
.game-box-meta .meta-tag {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fcd34d;
  font-size: .75rem;
  font-weight: 800;
  padding: .15em .6em;
  border-radius: 999px;
}
.game-box-meta .meta-tag.soft { background: #e0f2fe; color: #0369a1; border-color: #bae6fd; }
.game-box-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 10px;
  min-width: 0;
}
.game-box-grid .sub-card { background: #f8fafc; min-width: 0; }
.ranking-item .label { overflow-wrap: anywhere; padding-right: 8px; }
.ranking-item .count { white-space: nowrap; }
.ranking-more { font-size: .75rem; font-weight: 700; color: #64748b; text-align: right; padding-top: 2px; }
.ranking-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ranking-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: .85rem;
  padding: .3em 0;
  border-bottom: 1px dashed #e2e8f0;
}
.ranking-item .label { font-weight: 700; color: #334155; }
.ranking-item .count { font-family: 'Impact', sans-serif; font-size: .95rem; color: #0284c7; }

/* テーブルラッパー & スクロール制御 */
.table-wrap, #analytics-table-wrap, #performance-table-wrap {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-radius: 12px;
  border: 1.5px solid #cbd5e1;
  background: #ffffff;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.04);
  box-sizing: border-box;
  margin-top: 14px;
}
.table-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px 10px;
  background: #f8fafc;
  border-bottom: 1.5px solid #e2e8f0;
}
.table-title-row h4 {
  margin: 0;
  font-size: .95rem;
  font-weight: 800;
  color: #0f172a;
}
.table-hint-text {
  font-size: .75rem;
  font-weight: 700;
  color: #64748b;
}
.analytics-table {
  width: 100%;
  min-width: 52rem;
  border-collapse: collapse;
  font-size: .84rem;
}
.analytics-table th {
  background: #f8fafc;
  color: #475569;
  padding: 10px 12px;
  text-align: left;
  font-weight: 800;
  border-bottom: 2px solid #cbd5e1;
  white-space: nowrap;
}
.analytics-table td {
  padding: 10px 12px;
  border-bottom: 1px solid #e2e8f0;
  color: #1e293b;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.analytics-table tr:last-child td {
  border-bottom: none;
}
.analytics-table tr:nth-child(even) td { background: #fafaf9; }
.analytics-table tr:hover td { background: #f0f9ff; }
.analytics-table td.num { font-family: 'Impact', 'Arial Black', sans-serif; font-size: .95rem; }

/* エラーボックス */
.error-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.error-item {
  background: #fef2f2;
  border: 1.5px solid #fecaca;
  border-radius: 10px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.error-msg { font-size: .88rem; font-weight: 800; color: #b91c1c; }
.error-meta { font-size: .75rem; color: #991b1b; font-family: monospace; }

/* 生ログテーブル: ブロックの幅に収め、長いデータは折り返す(はみ出す場合は枠の中だけ横スクロール) */
.raw-log-note { font-size: .78rem; font-weight: 700; color: #64748b; }
.raw-log-scroll {
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  background: #ffffff;
  box-sizing: border-box;
}
.raw-log-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: .78rem;
}
.raw-log-table th {
  background: #f1f5f9;
  color: #475569;
  padding: 8px 10px;
  text-align: left;
  font-weight: 800;
  border-bottom: 1.5px solid #cbd5e1;
  white-space: nowrap;
}
.raw-log-table th:nth-child(1) { width: 7.5rem; }
.raw-log-table th:nth-child(2) { width: 8.5rem; }
.raw-log-table th:nth-child(3) { width: 9.5rem; }
.raw-log-table td {
  padding: 7px 10px;
  border-bottom: 1px solid #e2e8f0;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}
.raw-log-table tr:last-child td { border-bottom: none; }
.raw-log-table tr:nth-child(even) td { background: #fafaf9; }
.raw-log-table td.log-time { white-space: nowrap; color: #475569; font-variant-numeric: tabular-nums; }
.raw-log-table td.log-data { font-family: ui-monospace, 'SF Mono', Menlo, monospace; font-size: .74rem; color: #334155; }
.log-type-chip {
  display: inline-block;
  max-width: 100%;
  padding: .1em .55em;
  border-radius: 999px;
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 800;
  font-size: .72rem;
  overflow-wrap: anywhere;
}
@media (max-width: 40rem) {
  .raw-log-table { table-layout: auto; min-width: 36rem; }
}
.error-item { min-width: 0; overflow-wrap: anywhere; }
.load-error { color: #b91c1c; }

label { font-size: .85rem; font-weight: 700; color: #475569; }
.field { display: flex; align-items: center; gap: .8rem; }
.field label { white-space: nowrap; }
.field select { flex: 1; min-width: 0; }

select, input[type="text"], button {
  font: inherit;
  font-size: .95rem;
  padding: .55em .85em;
  border-radius: 10px;
  border: 1.5px solid #cbd5e1;
  background: #f8fafc;
  color: #0f172a;
  box-sizing: border-box;
}
select:focus, input[type="text"]:focus {
  border-color: #0284c7;
  background: #ffffff;
  outline: none;
  box-shadow: 0 0 0 3px rgba(2, 132, 199, 0.15);
}

button {
  cursor: pointer;
  font-weight: 800;
  transition: transform .1s ease, filter .1s ease;
}
button:hover { filter: brightness(1.05); }
button:active { transform: translateY(1px); }
button.primary {
  background: linear-gradient(135deg, #0ea5e9, #0284c7);
  border: none;
  color: #fff;
  box-shadow: 0 3px 8px rgba(2, 132, 199, 0.25);
}
button.danger {
  background: linear-gradient(135deg, #ef4444, #dc2626);
  border: none;
  color: #fff;
  box-shadow: 0 3px 8px rgba(220, 38, 38, 0.25);
}
button.export {
  background: linear-gradient(135deg, #10b981, #059669);
  border: none;
  color: #fff;
  box-shadow: 0 3px 8px rgba(5, 150, 105, 0.25);
}
button.ghost {
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  color: #475569;
}
button:disabled { opacity: .5; cursor: default; transform: none; filter: none; }

.row { display: flex; gap: 10px; }
.row > * { flex: 1; }

.members { display: flex; flex-direction: column; gap: 6px; }
.member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: .5em .8em;
  border-radius: 10px;
  background: #f8fafc;
  border: 1.5px solid #e2e8f0;
  font-size: .92rem;
  font-weight: 700;
}
.member button { padding: .3em .8em; font-size: .85rem; }

.export-box {
  background: #f8fafc;
  border: 1.5px solid #cbd5e1;
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}
.export-head h3 { margin: 0; font-size: .98rem; font-weight: 800; color: #0f172a; }
.export-head .hint { margin: 2px 0 0; font-size: .8rem; color: #64748b; }
.export-controls { display: flex; gap: 10px; flex-wrap: wrap; }
.export-controls select { flex: 1; min-width: 14rem; }
.export-controls button { white-space: nowrap; }

/* ランキング管理 */
#boards { display: flex; flex-direction: column; gap: 10px; }
.board { background: #f8fafc; border: 1.5px solid #cbd5e1; border-radius: 12px; overflow: hidden; }
.board > summary {
  cursor: pointer;
  padding: .7em .9em;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-weight: 800;
  font-size: .98rem;
  background: #ffffff;
  user-select: none;
}
.board > summary small { color: #64748b; font-weight: 700; background: #e2e8f0; padding: .1em .5em; border-radius: 999px; }
.board .inner { display: flex; flex-direction: column; gap: 8px; padding: .8em .9em; }

.entry-box { display: flex; flex-direction: column; }
.entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
  padding: .55em .75em;
  border-radius: 10px;
  background: #ffffff;
  border: 1.5px solid #e2e8f0;
  font-size: .92rem;
}
.entry .pos { font-weight: 800; font-family: 'Impact', 'Arial Black', sans-serif; color: #0284c7; min-width: 2.4em; }
.entry .who { font-weight: 800; color: #0f172a; }
.entry .score { font-variant-numeric: tabular-nums; font-weight: 800; color: #d97706; }
.entry .meta { color: #64748b; font-size: .78rem; font-weight: 700; }
.entry .meta.orig { color: #0891b2; font-size: .78rem; }
.entry .mark {
  font-size: .75rem;
  font-weight: 800;
  padding: .1em .5em;
  border-radius: 999px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  color: #b45309;
}
.entry .mark.dev { background: #fce7f3; border-color: #fbcfe8; color: #db2777; }
.entry .mark.tester { background: #dcfce7; border-color: #bbf7d0; color: #16a34a; }
.entry .acts { margin-left: auto; display: flex; gap: 6px; }
.entry button, .board .clear { padding: .35em .8em; font-size: .83rem; }

.entry-form {
  width: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 6px;
  padding: 12px 14px;
  background: #f1f5f9;
  border: 1.5px solid #cbd5e1;
  border-radius: 10px;
}
.entry-form .form-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.entry-form input[type="text"] { flex: 1; min-width: 10rem; }
.entry-form select { min-width: 6.5rem; }
.entry-form .form-acts { display: flex; gap: 6px; }
.entry-form .form-acts button { padding: .4em .85em; font-size: .85rem; }
.entry-form .form-error { color: #dc2626; font-size: .78rem; font-weight: 800; min-height: 1.1em; }
.entry-form .form-hint { color: #64748b; font-size: .75rem; font-weight: 700; }
.empty { color: #64748b; font-size: .88rem; padding: .4em .2em; font-weight: 700; }
`;

export const ADMIN_JS = `
(function () {
  var gamesEl = document.getElementById('games');
  var summaryEl = document.getElementById('summary');

  var HEADERS = { 'X-Requested-With': 'online-admin' };
  var TITLES = { 'midnight-skyway': 'MIDNIGHT SKYWAY', 'sumo-smash-3d': '剛体大相撲' };
  var PHASES = { lobby: '参加受付中', loading: 'ロード中', racing: '実行中' };
  var MINUTES = [['60', '1時間'], ['120', '2時間'], ['180', '3時間'], ['360', '6時間']];
  var BOARD_TITLES = {
    'street-b-boy': 'ストリートビーボーイ',
    'school-corridor-runner': 'テンパレラン',
    'survivor-score-battle': 'サバイバー・スコアバトル',
    'ennichi-shateki': 'えんにち射的',
    'extreme-edge-arcade': '極限ギリギリ選手権',
    'tani-runner-124': '単位増殖ラン',
    'midnight-skyway': 'ミッドナイト・スカイウェイ',
    'sumo-smash-3d': '剛体大相撲',
    'tower-stack': 'タワースタック'
  };
  var boardsEl = document.getElementById('boards');
  var openBoards = {};
  var cards = {};

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
    var v = el('b', { className: 'v' + (/^[0-9.:%-]+$/.test(value) ? '' : ' txt'), text: value });
    if (sub) v.appendChild(el('small', { text: sub }));
    return el('div', { className: 'stat' + (on === 'warn' ? ' warn' : on ? ' on' : '') }, [el('span', { className: 'k', text: label }), v]);
  }

  function setStats(box, list) {
    box.textContent = '';
    list.forEach(function (x) { box.appendChild(stat(x[0], x[1], x[2], x[3])); });
  }

  function formatDuration(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + '秒';
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    if (m < 60) return m + '分' + (s > 0 ? s + '秒' : '');
    var h = Math.floor(m / 60);
    m = m % 60;
    return h + '時間' + (m > 0 ? m + '分' : '');
  }

  function renderShareList(container, title, map, limit) {
    var card = el('div', { className: 'sub-card' });
    card.appendChild(el('h4', { text: title }));
    var list = el('div', { className: 'ranking-list' });
    var entries = Object.entries(map || {}).sort(function (a, b) { return b[1] - a[1]; });
    var hidden = limit && entries.length > limit ? entries.length - limit : 0;
    if (hidden) entries = entries.slice(0, limit);
    if (entries.length === 0) {
      list.appendChild(el('div', { className: 'empty', text: 'データなし' }));
    } else {
      entries.forEach(function (ent) {
        list.appendChild(el('div', { className: 'ranking-item' }, [
          el('span', { className: 'label', text: ent[0] }),
          el('span', { className: 'count', text: String(ent[1]) + '件' }),
        ]));
      });
    }
    if (hidden) list.appendChild(el('div', { className: 'ranking-more', text: '他 ' + hidden + ' 項目' }));
    card.appendChild(list);
    container.appendChild(card);
  }

  // ゲームごとの大きなボックス。中に項目(死因・車両・キャラ…)ごとのカードをまとめる
  var PROG_SECTIONS = [
    ['deathReasons', '死因・ゲームオーバー要因'],
    ['vehicles', '選択車両'],
    ['characters', '選択キャラクター'],
    ['maxStages', '到達ステージ / WAVE'],
    ['difficulties', '難易度'],
    ['modes', 'モード']
  ];

  function buildGameBox(gid, g) {
    var sections = PROG_SECTIONS.filter(function (sec) { return Object.keys(g[sec[0]] || {}).length > 0; });
    if (sections.length === 0) return null;
    var name = (GAME_META[gid] ? GAME_META[gid].name : null) || BOARD_TITLES[gid] || gid;
    var meta = [el('span', { className: 'meta-tag', text: 'プレイ ' + g.launchCount + '回' })];
    if (g.launchCount > 0) meta.push(el('span', { className: 'meta-tag soft', text: 'クリア ' + Math.round(g.clearRate * 100) + '%' }));
    var box = el('section', { className: 'game-box' });
    box.appendChild(el('div', { className: 'game-box-head' }, [el('h3', { text: name }), el('div', { className: 'game-box-meta' }, meta)]));
    var grid = el('div', { className: 'game-box-grid' });
    sections.forEach(function (sec) { renderShareList(grid, sec[1], g[sec[0]], 8); });
    box.appendChild(grid);
    return box;
  }

  // ---- タブ切り替え制御 ----
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var target = document.getElementById(btn.getAttribute('data-tab'));
      if (target) target.classList.add('active');
    });
  });

  // ---- オンライン対戦 稼働状況 ----
  function buildCard(g) {
    var c = { selects: {} };
    c.title = el('h3', { text: TITLES[g.id] || g.id });
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
    c.el = el('div', { className: 'server-game-card' }, kids);
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
    c.members.textContent = '';
    g.members.forEach(function (m) {
      var kick = el('button', { className: 'danger', text: 'キック' });
      kick.addEventListener('click', function () {
        if (window.confirm(m.name + ' を追い出しますか？')) act('/admin/api/kick?game=' + encodeURIComponent(g.id) + '&id=' + m.id);
      });
      c.members.appendChild(el('div', { className: 'member' }, [el('span', { text: m.name }), kick]));
    });
  }

  function renderServerStatus(s) {
    var total = 0, open = 0;
    s.games.forEach(function (g) {
      if (!cards[g.id]) { cards[g.id] = buildCard(g); gamesEl.appendChild(cards[g.id].el); }
      updateCard(cards[g.id], g);
      total += g.players;
      if (g.open) open++;
    });
    setStats(summaryEl, [
      ['開放中ゲーム', String(open), '/ ' + s.games.length, open > 0],
      ['オンライン参加者', String(total)],
      ['総WebSocket接続', String(s.clients)],
    ]);
  }

  // ==========================================
  // ==========================================
  // 📈 アナリティクス レンダリング
  // ==========================================
  var selectedGame = 'all';
  var cachedAnalyticsData = null;
  var GAME_META = {
    'midnight-skyway': { name: 'ミッドナイト・スカイウェイ' },
    'street-b-boy': { name: 'ストリートビーボーイ' },
    'sumo-smash-3d': { name: '剛体大相撲' },
    'school-corridor-runner': { name: 'テンパレラン' },
    'survivor-score-battle': { name: 'サバイバー・スコアバトル' },
    'ennichi-shateki': { name: 'えんにち射的' },
    'extreme-edge-arcade': { name: '極限ギリギリ選手権' },
    'tani-runner-124': { name: '単位増殖ラン' },
    'tower-stack': { name: 'タワースタック' },
    'phaser-fighter': { name: 'ストリートストライカー' }
  };

  function updateFilterUI() {
    var statusEl = document.getElementById('game-filter-status');
    var hintEl = document.getElementById('export-target-hint');
    var exportBtn = document.getElementById('export-btn');
    if (selectedGame === 'all') {
      if (statusEl) statusEl.style.display = 'none';
      if (hintEl) hintEl.textContent = '対象: 全ゲーム';
      if (exportBtn) exportBtn.textContent = 'JSONダウンロード';
    } else {
      var meta = GAME_META[selectedGame] || { name: selectedGame };
      if (statusEl) {
        statusEl.style.display = 'flex';
        statusEl.textContent = '';
        statusEl.appendChild(el('span', { text: meta.name + ' に絞り込み中' }));
        var clearBtn = el('button', { text: '✕ 解除', title: '全ゲーム表示に戻す' });
        clearBtn.addEventListener('click', function () {
          var sel = document.getElementById('analytics-game-filter');
          if (sel) sel.value = 'all';
          selectedGame = 'all';
          updateFilterUI();
          if (cachedAnalyticsData) renderAnalytics(cachedAnalyticsData);
          loadRawLogs();
        });
        statusEl.appendChild(clearBtn);
      }
      if (hintEl) hintEl.textContent = '対象: ' + meta.name;
      if (exportBtn) exportBtn.textContent = meta.name + ' のJSONダウンロード';
    }
  }

  function renderGamePlays(plays) {
    var wrap = document.getElementById('game-plays-wrap');
    if (!wrap) return;
    wrap.textContent = '';
    var sub = el('div', { className: 'sub-card' });
    sub.appendChild(el('h4', { text: '最近のプレイ履歴 (直近20件)' }));
    if (!plays || plays.length === 0) {
      sub.appendChild(el('div', { className: 'empty', text: 'このゲームのプレイ履歴はまだありません。' }));
      wrap.appendChild(sub);
      return;
    }
    var tbl = el('table', { className: 'analytics-table' });
    tbl.appendChild(el('thead', null, [
      el('tr', null, [
        el('th', { text: '日時' }),
        el('th', { text: '時間' }),
        el('th', { text: '結果' }),
        el('th', { text: 'ラウンド' }),
        el('th', { text: 'スコア' }),
        el('th', { text: '平均/最低FPS' }),
        el('th', { text: 'APM' }),
        el('th', { text: 'カスタム選択 / 到達' }),
        el('th', { text: '死因 (各ラウンド)' }),
      ])
    ]));
    var tbody = el('tbody');
    plays.slice(-20).reverse().forEach(function (p) {
      var timeStr = p.startedAt ? new Date(p.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
      var durStr = p.durationSec ? formatDuration(p.durationSec) : '-';
      var resText = p.completed ? '完走/クリア' : (p.endedAt ? 'リタイア' : '終了未受信');
      var roundText = p.rounds && p.rounds.length ? p.rounds.length + '回' : '-';
      var scoreText = p.formattedScore || (p.score !== undefined ? String(p.score) : '-');
      var fpsText = p.performance ? (p.performance.avgFps + ' / ' + (p.performance.minFps || '-')) : '-';
      var apmText = p.input ? String(p.input.apm) : '-';
      var customText = '-';
      if (p.progression) {
        var parts = [];
        if (p.progression.vehicle) parts.push(p.progression.vehicle);
        if (p.progression.character) parts.push(p.progression.character);
        if (p.progression.maxStage) parts.push(p.progression.maxStage);
        if (parts.length > 0) customText = parts.join(' / ');
      }
      var deathText = '-';
      if (p.rounds && p.rounds.length) {
        var reasons = p.rounds.map(function (r) { return r.deathReason; }).filter(Boolean);
        if (reasons.length) deathText = reasons.slice(-3).join(' → ');
      } else if (p.progression && p.progression.deathReason) {
        deathText = p.progression.deathReason;
      }
      tbody.appendChild(el('tr', null, [
        el('td', { text: timeStr }),
        el('td', { text: durStr }),
        el('td', { text: resText }),
        el('td', { className: 'num', text: roundText }),
        el('td', { className: 'num', text: scoreText }),
        el('td', { className: 'num', text: fpsText }),
        el('td', { className: 'num', text: apmText }),
        el('td', { text: customText }),
        el('td', { text: deathText }),
      ]));
    });
    tbl.appendChild(tbody);
    var tWrap = el('div', { className: 'table-wrap' }, [tbl]);
    sub.appendChild(tWrap);
    wrap.appendChild(sub);
  }

  function loadGamePlays(gid) {
    var wrap = document.getElementById('game-plays-wrap');
    if (wrap) wrap.textContent = 'プレイ履歴を読み込み中...';
    call('GET', '/admin/api/analytics/export?type=plays&game=' + encodeURIComponent(gid))
      .then(function (res) { renderGamePlays(res.plays || []); })
      .catch(function () {
        if (wrap) wrap.textContent = '';
      });
  }

  function renderAnalytics(data) {
    cachedAnalyticsData = data;
    var allKeys = Object.keys(data.games || {});
    var activeKeys = selectedGame === 'all' ? allKeys : (data.games[selectedGame] ? [selectedGame] : []);

    // 1. サマリータブ
    var allView = document.getElementById('analytics-all-view');
    var gameView = document.getElementById('analytics-game-view');

    if (selectedGame === 'all') {
      if (allView) allView.style.display = 'block';
      if (gameView) gameView.style.display = 'none';

      setStats(document.getElementById('analytics-summary'), [
        ['総訪問セッション', String(data.totalSessions)],
        ['アクティブ訪問中', String(data.activeSessionsNow), '人', data.activeSessionsNow > 0],
        ['総ゲームプレイ数', String(data.totalPlays), '回'],
        ['総プレイ時間', formatDuration(data.totalPlayTimeSec)],
        ['全体平均FPS', String(data.avgFpsOverall || 60), 'fps'],
        ['平均APM', String(data.avgApmOverall || 0)],
        ['パッド利用率', String(Math.round(data.gamepadUserRate * 100)) + '%'],
        ['エラー発生件数', String(data.totalErrors || 0), '件', (data.totalErrors || 0) > 0 ? 'warn' : false],
      ]);

      var tableWrap = document.getElementById('analytics-table-wrap');
      tableWrap.textContent = '';
      if (allKeys.length === 0) {
        tableWrap.appendChild(el('div', { className: 'empty', text: 'プレイデータはまだ記録されていません。' }));
      } else {
        var table = el('table', { className: 'analytics-table' });
        table.appendChild(el('thead', null, [
          el('tr', null, [
            el('th', { text: 'ゲーム' }),
            el('th', { text: 'プレイ数' }),
            el('th', { text: '食いつき度 (リピート/滞在)' }),
            el('th', { text: 'クリア/完走率' }),
            el('th', { text: '平均時間' }),
            el('th', { text: 'ハイスコア' }),
            el('th', { text: '平均FPS' }),
            el('th', { text: '平均APM' }),
            el('th', { text: 'エラー' }),
          ])
        ]));
        var tbody = el('tbody');
        allKeys.forEach(function (gid) {
          var g = data.games[gid];
          var name = (GAME_META[gid] ? GAME_META[gid].name : null) || BOARD_TITLES[gid] || TITLES[gid] || gid;
          var clearText = g.completeCount + '回 (' + Math.round(g.clearRate * 100) + '%)';
          var bestText = g.bestScore !== undefined ? String(g.bestScore) : '-';
          var rep = g.repeatRate !== undefined ? Number(g.repeatRate.toFixed(1)) : 1;
          var engSec = g.engagementScore || g.avgPlayTimeSec || 0;
          var badgeType = (rep >= 2.0 || engSec >= 300) ? 'hot' : ((rep >= 1.3 || engSec >= 120) ? 'good' : 'normal');
          var badgeLabel = badgeType === 'hot' ? '超没入' : (badgeType === 'good' ? '好評' : '通常');
          var engCell = el('span', { className: 'engagement-badge ' + badgeType }, [
            el('span', { text: badgeLabel + ' ' }),
            el('small', { text: '(' + rep + '回/人, ' + formatDuration(engSec) + ')' })
          ]);
          tbody.appendChild(el('tr', null, [
            el('td', { text: name }),
            el('td', { className: 'num', text: String(g.launchCount) + '回' }),
            el('td', null, [engCell]),
            el('td', { text: clearText }),
            el('td', { text: formatDuration(g.avgPlayTimeSec) }),
            el('td', { className: 'num', text: bestText }),
            el('td', { className: 'num', text: g.avgFps ? String(g.avgFps) + 'fps' : '-' }),
            el('td', { className: 'num', text: g.avgApm ? String(g.avgApm) : '-' }),
            el('td', { text: g.errorCount > 0 ? g.errorCount + '件' : '0' }),
          ]));
        });
        table.appendChild(tbody);
        var headRow = el('div', { className: 'table-title-row' }, [
          el('h4', { text: 'ゲーム別パフォーマンス・食いつき度一覧' }),
          el('span', { className: 'table-hint-text', text: '表を左右にスクロールして全項目を確認できます' }),
        ]);
        tableWrap.appendChild(headRow);
        tableWrap.appendChild(table);
      }
    } else {
      // 個別ゲームビュー
      if (allView) allView.style.display = 'none';
      if (gameView) {
        gameView.style.display = 'flex';
        gameView.style.flexDirection = 'column';
        gameView.style.gap = '12px';
      }

      var meta = GAME_META[selectedGame] || { name: selectedGame };
      var g = data.games[selectedGame] || {
        launchCount: 0,
        uniquePlayers: 0,
        repeatRate: 1,
        engagementScore: 0,
        completeCount: 0,
        clearRate: 0,
        totalPlayTimeSec: 0,
        avgPlayTimeSec: 0,
        scoresCount: 0,
        gamepadCount: 0,
        errorCount: 0,
        deathReasons: {},
        characters: {},
        vehicles: {},
        maxStages: {},
      };

      var gHead = document.getElementById('game-view-header');
      if (gHead) {
        gHead.textContent = '';
        gHead.appendChild(el('h3', null, [
          el('span', { text: meta.name + ' アナリティクス分析' }),
          el('span', { className: 'meta-tag', text: '総プレイ: ' + g.launchCount + '回' })
        ]));
      }

      setStats(document.getElementById('game-stats'), [
        ['総プレイ回数', String(g.launchCount), '回'],
        ['遊んだ人数', String(g.uniquePlayers || 1), '人'],
        ['食いつき度 (リピート)', (g.repeatRate ? g.repeatRate.toFixed(1) : '1.0') + '回/人', (g.repeatRate >= 2.0 || (g.engagementScore || 0) >= 300) ? '超没入' : ((g.repeatRate >= 1.3 || (g.engagementScore || 0) >= 120) ? '好評' : '通常'), (g.repeatRate >= 1.3)],
        ['1人あたり滞在時間', formatDuration(g.engagementScore || g.avgPlayTimeSec)],
        ['完走/クリア率', String(Math.round(g.clearRate * 100)) + '%', '(' + g.completeCount + '回)', g.completeCount > 0],
        ['1プレイ平均時間', formatDuration(g.avgPlayTimeSec)],
        ['ハイスコア', g.bestScore !== undefined ? String(g.bestScore) : '-', g.avgScore ? '平均 ' + Math.round(g.avgScore) : ''],
        ['平均FPS', g.avgFps ? String(g.avgFps) : '-', 'fps'],
        ['最低FPS (1% Low)', g.minFps ? String(g.minFps) : '-', 'fps'],
        ['平均APM', g.avgApm ? String(g.avgApm) : '-', ''],
        ['ゲームパッド利用', String(g.gamepadCount || 0), '回'],
        ['エラー発生件数', String(g.errorCount || 0), '件', (g.errorCount || 0) > 0 ? 'warn' : false],
      ]);

      var gProg = document.getElementById('game-progression-details');
      if (gProg) {
        gProg.textContent = '';
        var hasProg = false;
        if (Object.keys(g.deathReasons || {}).length > 0) {
          hasProg = true;
          renderShareList(gProg, '死因・ゲームオーバー要因', g.deathReasons);
        }
        if (Object.keys(g.vehicles || {}).length > 0) {
          hasProg = true;
          renderShareList(gProg, '選択車両ランキング', g.vehicles);
        }
        if (Object.keys(g.characters || {}).length > 0) {
          hasProg = true;
          renderShareList(gProg, '選択キャラクターランキング', g.characters);
        }
        if (Object.keys(g.maxStages || {}).length > 0) {
          hasProg = true;
          renderShareList(gProg, '到達ステージ / WAVE 分布', g.maxStages);
        }
        if (Object.keys(g.difficulties || {}).length > 0) {
          hasProg = true;
          renderShareList(gProg, '難易度の選択', g.difficulties);
        }
        if (Object.keys(g.modes || {}).length > 0) {
          hasProg = true;
          renderShareList(gProg, 'モードの選択', g.modes);
        }
        if (!hasProg) {
          var emptyCard = el('div', { className: 'sub-card' });
          emptyCard.appendChild(el('div', { className: 'empty', text: 'このゲームの固有データ（死因・キャラ・車両等）はまだ記録されていません。' }));
          gProg.appendChild(emptyCard);
        }
      }

      // 個別プレイ履歴の読み込み
      loadGamePlays(selectedGame);
    }

    // 2. ハードウェアタブ (全体)
    setStats(document.getElementById('hardware-stats'), [
      ['検出GPU数', String(Object.keys(data.hardware.gpuRenderers || {}).length), '種'],
      ['検出OS数', String(Object.keys(data.hardware.os || {}).length), '種'],
      ['検出ブラウザ数', String(Object.keys(data.hardware.browsers || {}).length), '種'],
    ]);
    var hwDetails = document.getElementById('hardware-details');
    hwDetails.textContent = '';
    renderShareList(hwDetails, 'GPU レンダラー (グラフィックチップ)', data.hardware.gpuRenderers);
    renderShareList(hwDetails, 'GPU ベンダー', data.hardware.gpuVendors);
    renderShareList(hwDetails, 'オペレーティングシステム (OS)', data.hardware.os);
    renderShareList(hwDetails, 'ブラウザ', data.hardware.browsers);
    renderShareList(hwDetails, 'ネットワーク回線種別', data.hardware.networkTypes);
    renderShareList(hwDetails, '画面解像度', data.hardware.screenResolutions);

    // 3. パフォーマンスタブ
    if (selectedGame === 'all') {
      setStats(document.getElementById('performance-stats'), [
        ['全体平均FPS', String(data.avgFpsOverall || 60), 'fps'],
        ['総エラー件数', String(data.totalErrors || 0), '件', (data.totalErrors || 0) > 0 ? 'warn' : false],
      ]);
    } else {
      var gameG = data.games[selectedGame];
      setStats(document.getElementById('performance-stats'), [
        ['平均FPS', gameG && gameG.avgFps ? String(gameG.avgFps) : '-', 'fps'],
        ['最低FPS (1% Low)', gameG && gameG.minFps ? String(gameG.minFps) : '-', 'fps'],
        ['エラー発生件数', String((gameG && gameG.errorCount) || 0), '件', ((gameG && gameG.errorCount) || 0) > 0 ? 'warn' : false],
      ]);
    }

    var perfWrap = document.getElementById('performance-table-wrap');
    perfWrap.textContent = '';
    var pTable = el('table', { className: 'analytics-table' });
    pTable.appendChild(el('thead', null, [
      el('tr', null, [
        el('th', { text: 'ゲーム' }),
        el('th', { text: '平均FPS' }),
        el('th', { text: '最低FPS (1% Low)' }),
        el('th', { text: 'エラー発生数' }),
      ])
    ]));
    var pTbody = el('tbody');
    activeKeys.forEach(function (gid) {
      var g = data.games[gid];
      pTbody.appendChild(el('tr', null, [
        el('td', { text: (GAME_META[gid] ? GAME_META[gid].name : null) || BOARD_TITLES[gid] || gid }),
        el('td', { className: 'num', text: g.avgFps ? String(g.avgFps) + ' fps' : '-' }),
        el('td', { className: 'num', text: g.minFps ? String(g.minFps) + ' fps' : '-' }),
        el('td', { text: String(g.errorCount || 0) + ' 件' }),
      ]));
    });
    pTable.appendChild(pTbody);
    perfWrap.appendChild(pTable);

    // 4. 進行＆死因タブ
    var progDetails = document.getElementById('progression-details');
    progDetails.textContent = '';
    var progCount = 0;
    activeKeys.slice().sort(function (x, y) { return data.games[y].launchCount - data.games[x].launchCount; }).forEach(function (gid) {
      var box = buildGameBox(gid, data.games[gid]);
      if (box) { progCount++; progDetails.appendChild(box); }
    });
    if (progCount === 0) {
      progDetails.appendChild(el('div', { className: 'empty', text: '対象の進行・死因データはありません。' }));
    }

    // 5. 操作＆APMタブ
    if (selectedGame === 'all') {
      setStats(document.getElementById('input-stats'), [
        ['全体平均APM', String(data.avgApmOverall || 0)],
        ['ゲームパッド利用率', String(Math.round(data.gamepadUserRate * 100)) + '%'],
      ]);
    } else {
      var gObj = data.games[selectedGame];
      setStats(document.getElementById('input-stats'), [
        ['平均APM', gObj && gObj.avgApm ? String(gObj.avgApm) : '-'],
        ['ゲームパッド利用', String((gObj && gObj.gamepadCount) || 0), '回'],
      ]);
    }
    var inputDetails = document.getElementById('input-details');
    inputDetails.textContent = '';
    var apmMap = {};
    activeKeys.forEach(function (gid) {
      var g = data.games[gid];
      var name = (GAME_META[gid] ? GAME_META[gid].name : null) || BOARD_TITLES[gid] || gid;
      if (g.avgApm) apmMap[name] = g.avgApm;
    });
    renderShareList(inputDetails, 'ゲーム別 平均APM (操作の激しさ)', apmMap);
  }

  function showLoadError(box, label, err) {
    if (!box) return;
    box.textContent = '';
    box.appendChild(el('div', { className: 'empty load-error', text: label + 'を読み込めませんでした (' + (err && err.message ? err.message : err) + ')。再読み込みを押してください。' }));
  }

  function loadAnalytics() {
    return call('GET', '/admin/api/analytics/summary').then(renderAnalytics).catch(function (err) {
      // 失敗しても前回の表示は残す。初回など何も出ていないときだけ理由を出す
      if (!cachedAnalyticsData) showLoadError(document.getElementById('analytics-summary'), 'サマリー', err);
    });
  }

  function formatLogTime(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '-';
    var t = d.toLocaleTimeString('ja-JP');
    return d.toDateString() === new Date().toDateString() ? t : d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' }) + ' ' + t;
  }

  function eventSummary(data) {
    if (!data) return '-';
    var json = JSON.stringify(data);
    return json.length > 240 ? json.slice(0, 240) + '…' : json;
  }

  // 6. 生ログ・エラー取得タブ用
  function loadRawLogs() {
    var q = selectedGame === 'all' ? '' : '&game=' + encodeURIComponent(selectedGame);
    var wrap = document.getElementById('raw-logs-wrap');
    return call('GET', '/admin/api/analytics/export?type=events' + q).then(function (res) {
      wrap.textContent = '';
      var events = (res.events || []).slice(-100).reverse();
      if (events.length === 0) {
        wrap.appendChild(el('div', { className: 'empty', text: '対象のイベントログはまだありません。' }));
        return;
      }
      wrap.appendChild(el('div', { className: 'raw-log-note', text: '新しい順に直近' + events.length + '件(全' + (res.count || events.length) + '件中)' }));
      var tbl = el('table', { className: 'raw-log-table' });
      tbl.appendChild(el('thead', null, [
        el('tr', null, [el('th', { text: '時刻' }), el('th', { text: '種別' }), el('th', { text: 'ゲーム' }), el('th', { text: 'データ' })])
      ]));
      var tbody = el('tbody');
      events.forEach(function (ev) {
        tbody.appendChild(el('tr', null, [
          el('td', { className: 'log-time', text: formatLogTime(ev.timestamp) }),
          el('td', { className: 'log-type' }, [el('span', { className: 'log-type-chip', text: ev.type })]),
          el('td', { className: 'log-game', text: (GAME_META[ev.gameId] && GAME_META[ev.gameId].name) || ev.gameId || '-' }),
          el('td', { className: 'log-data', text: eventSummary(ev.data) }),
        ]));
      });
      tbl.appendChild(tbody);
      wrap.appendChild(el('div', { className: 'raw-log-scroll' }, [tbl]));
    }).catch(function (err) { showLoadError(wrap, 'イベントログ', err); });
  }

  // 直近のクライアントエラー(パフォーマンスタブ)
  function loadErrors() {
    var box = document.getElementById('errors-box');
    if (!box) return Promise.resolve();
    var q = selectedGame === 'all' ? '' : '&game=' + encodeURIComponent(selectedGame);
    return call('GET', '/admin/api/analytics/export?type=errors' + q).then(function (res) {
      box.textContent = '';
      var errs = (res.errors || []).slice(-10).reverse();
      var card = el('div', { className: 'sub-card' });
      card.appendChild(el('h4', { text: '直近のクライアントエラー' }));
      if (errs.length === 0) {
        card.appendChild(el('div', { className: 'empty', text: 'エラーは記録されていません。' }));
      } else {
        var list = el('div', { className: 'error-list' });
        errs.forEach(function (e) {
          var where = e.filename ? ' ' + e.filename.split('/').pop() + ':' + (e.lineno || 0) : '';
          list.appendChild(el('div', { className: 'error-item' }, [
            el('div', { className: 'error-msg', text: e.message }),
            el('div', { className: 'error-meta', text: formatLogTime(e.timestamp) + ' / ' + (e.gameId || '-') + where }),
          ]));
        });
        card.appendChild(list);
      }
      box.appendChild(card);
    }).catch(function () {});
  }

  // ---- ランキング管理 ----
  function boardTitle(b) { return (BOARD_TITLES[b.slug] || b.slug) + (b.variantLabel ? ' / ' + b.variantLabel : ''); }
  var NAME_REGEX = /^[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}a-zA-Z0-9ａ-ｚＡ-Ｚ０-９ー々〆〇ヶ]+$/u;

  function buildEntry(b, e) {
    var entryBox = el('div', { className: 'entry-box' });
    var kids = [
      el('span', { className: 'pos', text: e.rank + '位' }),
      el('span', { className: 'who', text: e.name }),
      el('span', { className: 'score', text: e.formattedScore }),
    ];
    if (e.cleared) kids.push(el('span', { className: 'mark', text: 'クリア' }));
    if (e.role) {
      kids.push(el('span', { className: 'mark ' + (e.role === '開発者' ? 'dev' : 'tester'), text: e.role }));
    } else if (e.dev) {
      kids.push(el('span', { className: 'mark dev', text: '開発者' }));
    }
    if (e.origName) kids.push(el('span', { className: 'meta orig', text: '（元: ' + e.origName + '）' }));
    if (e.extra) kids.push(el('span', { className: 'meta', text: e.extra }));
    kids.push(el('span', { className: 'meta', text: e.date + (e.hasGhost ? ' ゴースト有' : '') }));

    var acts = el('span', { className: 'acts' });
    var hasRole = !!(e.role || e.dev);

    var formOpen = false;
    var formEl = null;

    var editBtn = el('button', { text: hasRole ? 'ロール変更' : 'ロール設定' });
    acts.appendChild(editBtn);

    if (hasRole) {
      var clearBtn = el('button', { text: '解除' });
      clearBtn.addEventListener('click', function () {
        if (window.confirm(boardTitle(b) + ' の ' + e.rank + '位のロール設定を解除し、元の名前に戻しますか？')) {
          actBoards('/admin/api/lb-role?board=' + encodeURIComponent(b.board) + '&rank=' + e.rank + '&on=0');
        }
      });
      acts.appendChild(clearBtn);
    }

    var delBtn = el('button', { className: 'danger', text: '削除' });
    delBtn.addEventListener('click', function () {
      if (window.confirm(boardTitle(b) + ' の ' + e.rank + '位 (' + e.name + ' ' + e.formattedScore + ') を削除します。よろしいですか？')) {
        actBoards('/admin/api/lb-remove?board=' + encodeURIComponent(b.board) + '&rank=' + e.rank);
      }
    });
    acts.appendChild(delBtn);

    kids.push(acts);
    var row = el('div', { className: 'entry' }, kids);
    entryBox.appendChild(row);

    function toggleForm() {
      if (formOpen) {
        if (formEl) entryBox.removeChild(formEl);
        formEl = null;
        formOpen = false;
        editBtn.textContent = hasRole ? 'ロール変更' : 'ロール設定';
        return;
      }
      formOpen = true;
      editBtn.textContent = '閉じる';

      var defaultName = e.customName || (e.role ? e.name.replace(/（(開発者|テスター)）$/, '') : e.origName || e.name || '');
      var defaultRole = e.role || (e.dev ? '開発者' : '開発者');

      var nameInput = el('input', {
        type: 'text',
        placeholder: '好きな名前 (漢字カタカナひらがな英数 1〜10文字)',
        maxLength: 10,
        value: defaultName,
      });
      var roleSelect = el('select', null, [
        el('option', { value: '開発者', text: '開発者' }),
        el('option', { value: 'テスター', text: 'テスター' }),
      ]);
      roleSelect.value = defaultRole;

      var saveBtn = el('button', { className: 'primary', text: '決定' });
      var cancelBtn = el('button', { className: 'ghost', text: 'キャンセル' });
      var errEl = el('div', { className: 'form-error' });
      var hintEl = el('div', { className: 'form-hint', text: '※ランキングでは「好きな名前（ロール）」で表示されます。漢字・カタカナ・ひらがな・英数が使えます。' });

      function validate() {
        var v = nameInput.value.trim();
        if (!v) {
          errEl.textContent = '名前を入力してください。';
          return false;
        }
        if (Array.from(v).length > 10) {
          errEl.textContent = '名前は10文字以内にしてください。';
          return false;
        }
        if (!NAME_REGEX.test(v)) {
          errEl.textContent = '漢字・カタカナ・ひらがな・英数のみ使用できます。';
          return false;
        }
        errEl.textContent = '';
        return true;
      }

      nameInput.addEventListener('input', validate);

      saveBtn.addEventListener('click', function () {
        if (!validate()) return;
        var newName = nameInput.value.trim();
        var newRole = roleSelect.value;
        saveBtn.disabled = true;
        actBoards('/admin/api/lb-role?board=' + encodeURIComponent(b.board) + '&rank=' + e.rank + '&on=1&name=' + encodeURIComponent(newName) + '&role=' + encodeURIComponent(newRole));
      });

      cancelBtn.addEventListener('click', toggleForm);

      formEl = el('div', { className: 'entry-form' }, [
        el('div', { className: 'form-row' }, [
          nameInput,
          roleSelect,
          el('div', { className: 'form-acts' }, [saveBtn, cancelBtn]),
        ]),
        errEl,
        hintEl,
      ]);
      entryBox.appendChild(formEl);
      nameInput.focus();
    }

    editBtn.addEventListener('click', toggleForm);
    return entryBox;
  }

  function buildBoard(b) {
    var d = el('details', { className: 'board' });
    d.open = !!openBoards[b.board];
    d.addEventListener('toggle', function () { openBoards[b.board] = d.open; });
    d.appendChild(el('summary', null, [el('span', { text: boardTitle(b) }), el('small', { text: b.entries.length + '件' })]));
    var inner = el('div', { className: 'inner' });
    if (b.entries.length === 0) inner.appendChild(el('div', { className: 'empty', text: '記録はまだありません' }));
    b.entries.forEach(function (e) { inner.appendChild(buildEntry(b, e)); });
    if (b.entries.length > 0) {
      var clear = el('button', { className: 'danger clear', text: 'このボードの記録をすべて消す' });
      clear.addEventListener('click', function () {
        if (window.confirm(boardTitle(b) + ' の記録 ' + b.entries.length + ' 件をすべて消します(ゴーストも消えます)。よろしいですか？')) {
          actBoards('/admin/api/lb-clear?board=' + encodeURIComponent(b.board));
        }
      });
      inner.appendChild(clear);
    }
    d.appendChild(inner);
    return d;
  }

  function renderBoards(r) {
    boardsEl.textContent = '';
    r.boards.forEach(function (b) { boardsEl.appendChild(buildBoard(b)); });
  }

  function loadBoards() {
    return call('GET', '/admin/api/lb').then(renderBoards).catch(function () {
      boardsEl.textContent = '';
      boardsEl.appendChild(el('div', { className: 'empty', text: 'ランキングを読み込めませんでした。再読み込みを押してください。' }));
    });
  }

  function actBoards(path) {
    return call('POST', path).then(loadBoards).catch(loadBoards);
  }

  function refresh() {
    return call('GET', '/admin/api/status').then(renderServerStatus).catch(function () {});
  }

  function act(path) {
    return call('POST', path).then(renderServerStatus).catch(refresh);
  }

  // ---- イベント設定 ----
  document.getElementById('stop-all').addEventListener('click', function () {
    if (window.confirm('全ゲームを閉鎖し、参加者を全員切断します。よろしいですか？')) act('/admin/api/close?game=all');
  });
  document.getElementById('logout').addEventListener('click', function () {
    fetch('/admin/logout', { method: 'POST', headers: HEADERS, cache: 'no-store', credentials: 'same-origin' })
      .then(function () { location.href = '/admin/login'; });
  });

  document.getElementById('boards-reload').addEventListener('click', loadBoards);
  document.getElementById('analytics-reload').addEventListener('click', function () {
    loadAnalytics();
    loadRawLogs();
    loadErrors();
  });

  // ゲームフィルターの変更イベント
  var gameFilterSelect = document.getElementById('analytics-game-filter');
  if (gameFilterSelect) {
    gameFilterSelect.addEventListener('change', function () {
      selectedGame = gameFilterSelect.value;
      updateFilterUI();
      if (cachedAnalyticsData) renderAnalytics(cachedAnalyticsData);
      loadRawLogs();
      loadErrors();
    });
  }

  // JSONエクスポートのダウンロード処理
  document.getElementById('export-btn').addEventListener('click', function () {
    var type = document.getElementById('export-type').value;
    var btn = document.getElementById('export-btn');
    btn.disabled = true;
    var origText = btn.textContent;
    btn.textContent = 'ダウンロード中...';
    var q = selectedGame === 'all' ? '' : '&game=' + encodeURIComponent(selectedGame);
    call('GET', '/admin/api/analytics/export?type=' + encodeURIComponent(type) + q)
      .then(function (data) {
        var jsonStr = JSON.stringify(data, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        var prefix = selectedGame === 'all' ? '' : selectedGame + '-';
        a.href = url;
        a.download = 'gamecenter-analytics-' + prefix + type + '-' + nowStr + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      })
      .catch(function (err) {
        alert('エクスポートに失敗しました: ' + (err.message || err));
      })
      .finally(function () {
        btn.disabled = false;
        btn.textContent = origText;
      });
  });

  updateFilterUI();
  refresh();
  loadAnalytics();
  loadRawLogs();
  loadErrors();
  loadBoards();
  // 管理画面向けのレート制限に当たらないよう、更新は30秒ごと・画面を見ているときだけにする
  setInterval(function () {
    if (document.hidden) return;
    refresh();
    loadAnalytics();
    loadRawLogs();
    loadErrors();
  }, 30000);
})();
`;
