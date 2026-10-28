// 管理画面の静的ファイル(HTML/CSS/JS)。/admin(末尾スラッシュなし)で開かれても崩れないよう、参照はすべて /admin/ からの絶対パスにする。
// 一般向け(Hub)の明るい方眼グリッド＋落書き背景と手書き風フォント(Yusei Magic)を取り入れたポップなデザイン。
// アナリティクスボードは、全収集データを多角的にタブで切り替えて閲覧・JSON出力できる。
import deathMapGeometry from './deathMapGeometry.json' with { type: 'json' };

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
      <h2>オンライン対戦</h2>
    </div>
    <div id="summary" class="stats"></div>
    <div id="games" class="server-games-container"></div>
  </section>

  <section class="card" id="ads-card">
    <div class="card-head">
      <h2>ローディング広告</h2>
      <span id="ads-state" class="state">OFF</span>
    </div>
    <div id="ads-summary" class="stats"></div>
    <div id="ads-breakdown"></div>
    <div class="row">
      <button id="ads-on-btn" class="primary">ONにする</button>
      <button id="ads-off-btn">OFFにする</button>
    </div>
  </section>

  <!-- アナリティクス ボード -->
  <section class="card" id="analytics-card">
    <div class="card-head">
      <h2>アナリティクス</h2>
      <button id="analytics-reload" class="ghost">再読み込み</button>
    </div>

    <!-- ゲーム選択フィルターバー -->
    <div class="analytics-filter-bar">
      <div class="filter-group">
        <label for="analytics-game-filter">表示対象:</label>
        <select id="analytics-game-filter">
          <option value="all">すべてのゲーム 全体集計</option>
          <option value="midnight-skyway">ミッドナイト・スカイウェイ</option>
          <option value="street-b-boy">ストリートビーボーイ</option>
          <option value="cyber-2d-fighter-3d">サイバー２Dファイター３D</option>
          <option value="sumo-smash-3d">剛体大相撲</option>
          <option value="school-corridor-runner">テンパレラン</option>
          <option value="survivor-score-battle">サバイバー・スコアバトル</option>
          <option value="ennichi-shateki">えんにち射的</option>
          <option value="extreme-edge-arcade">極限ギリギリ選手権</option>
          <option value="tani-runner-124">単位増殖ラン</option>
          <option value="tower-stack">タワースタック</option>
          <option value="falldown">無限降下ドリル</option>
        </select>
      </div>
      <div id="game-filter-status" class="game-filter-badge" style="display:none;"></div>
    </div>

    <!-- タブ切り替えバー -->
    <div class="tab-bar">
      <button class="tab-btn active" data-tab="tab-overview">サマリー</button>
      <button class="tab-btn" data-tab="tab-replays">リプレイ</button>
      <button class="tab-btn" data-tab="tab-deathmap">死亡マップ</button>
      <button class="tab-btn" data-tab="tab-hardware">ハードウェア</button>
      <button class="tab-btn" data-tab="tab-performance">パフォーマンス</button>
      <button class="tab-btn" data-tab="tab-progression">進行・死因</button>
      <button class="tab-btn" data-tab="tab-raw">生イベントログ</button>
    </div>

    <!-- 各タブ画面 -->
    <div id="tab-overview" class="tab-panel active">
      <!-- 全体表示用 -->
      <div id="analytics-all-view">
        <div id="analytics-summary" class="stats"></div>

        <div id="analytics-table-wrap" class="table-wrap" style="margin-top: 14px;"></div>
      </div>
      <!-- 個別ゲーム表示用 -->
      <div id="analytics-game-view" style="display:none;">
        <div id="game-view-header" class="game-view-header"></div>
        <div id="game-stats" class="stats"></div>
        <div id="game-progression-details" class="sub-grids"></div>
        <div id="game-deathmap-wrap"></div>
        <div id="game-plays-wrap"></div>
      </div>
    </div>

    <!-- リプレイ専用タブ -->
    <div id="tab-replays" class="tab-panel">
      <div class="sub-card">
        <div class="table-title-row">
          <h4>ランキングのリプレイ</h4>
          <span class="table-hint-text" id="replays-count-hint"></span>
        </div>
        <div id="all-replays-wrap" class="table-wrap"></div>
      </div>
    </div>

    <!-- 死亡マップ専用タブ -->
    <div id="tab-deathmap" class="tab-panel">
      <div id="deathmap-tab-content"></div>
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
          <option value="all">すべてのデータ 完全統合</option>
          <option value="summary">集計サマリー</option>
          <option value="ads">ローディング広告の表示実績</option>
          <option value="hardware">ハードウェア・環境スペック</option>
          <option value="performance">パフォーマンス・FPS・エラー</option>
          <option value="progression">ゲーム進行・到達度・死因</option>
          <option value="input">入力デバイス統計</option>
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
      <h2>ランキング管理</h2>
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
  font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
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
  font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
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
  font-weight: 900;
  font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
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

/* 死亡地点マップ */
.deathmap { display: flex; flex-direction: column; gap: 10px; }
.deathmap canvas { width: 100%; background: #0b1120; border-radius: 10px; border: 1.5px solid #334155; display: block; }
.deathmap-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 460px), 1fr)); gap: 12px; align-items: start; }
.deathmap-panel { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.deathmap-panel.wide { grid-column: 1 / -1; }
.deathmap-scroll { max-height: 620px; overflow: auto; border-radius: 10px; border: 1.5px solid #334155; background: #1c1917; }
.deathmap-scroll canvas { border: 0; border-radius: 0; margin: 0 auto; }
.deathmap-panel-head { font-size: 13px; font-weight: 800; color: #0f172a; }
.deathmap-geo-legend { font-size: 11px; color: #475569; }
.deathmap-causes { font-size: 12px; font-weight: 700; color: #334155; }
.deathmap-hover { position: fixed; z-index: 2000; display: none; max-width: 300px; padding: 6px 9px; border-radius: 8px; background: rgba(15,23,42,.94); color: #f1f5f9; font-size: 12px; font-weight: 700; pointer-events: none; box-shadow: 0 6px 18px rgba(0,0,0,.3); }
.deathmap-geo-legend i { box-shadow: none; border-radius: 2px; }
#deathmap-tab-content { display: flex; flex-direction: column; gap: 14px; }
.deathmap-legend { display: flex; flex-wrap: wrap; gap: 8px 16px; font-size: 12px; color: #334155; padding: 4px 2px; }
.deathmap-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; box-shadow: 0 0 4px currentColor; }
.deathmap-tip { font-size: 12px; color: #475569; background: #f1f5f9; padding: 6px 10px; border-radius: 6px; border-left: 3px solid #0284c7; }


/* リプレイ */
.replay-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  padding: 5px 12px;
  border-radius: 8px;
  border: none;
  background: linear-gradient(135deg, #6366f1, #4f46e5);
  color: #ffffff;
  cursor: pointer;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.35);
  transition: transform .1s ease, filter .1s ease, box-shadow .1s ease;
}
.replay-btn:hover {
  filter: brightness(1.1);
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(99, 102, 241, 0.45);
}
.replay-btn:active {
  transform: translateY(1px);
}
.game-badge {
  display: inline-block;
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  background: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
  white-space: nowrap;
}
.status-pill {
  display: inline-block;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 8px;
  border-radius: 999px;
  white-space: nowrap;
}
.status-pill.clear { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.status-pill.perfect { background: #fdf2f8; color: #be185d; border: 1px solid #f472b6; }
.status-pill.retire { background: #fef3c7; color: #b45309; border: 1px solid #fde047; }
.status-pill.unknown { background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; }

.replay-modal { position: fixed; inset: 0; z-index: 1000; background: rgba(15, 23, 42, 0.86); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; padding: 16px; }
.replay-stage { position: relative; overflow: hidden; background: #000; border-radius: 8px; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
.replay-stage iframe { position: absolute; left: 0; top: 0; border: 0; transform-origin: 0 0; background: #000; }
.replay-bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; color: #e2e8f0; font-size: 13px; }
.replay-bar button { font: inherit; padding: 4px 10px; border-radius: 6px; border: 1px solid #64748b; background: #1e293b; color: #e2e8f0; cursor: pointer; }
.replay-bar button.on { background: #6366f1; border-color: #818cf8; }
.replay-status { min-width: 240px; }
.replay-status .bad { color: #fca5a5; }
.replay-status .good { color: #86efac; }
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
.ranking-item .count { font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif; font-weight: 900; font-size: .95rem; color: #0284c7; }

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
.analytics-table td.num { font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif; font-weight: 900; font-size: .95rem; }

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
.error-meta { font-size: .75rem; color: #991b1b; font-family: inherit; }

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
.raw-log-table td.log-data { font-family: inherit; font-size: .74rem; color: #334155; }
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
.entry .pos { font-weight: 900; font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif; color: #0284c7; min-width: 2.4em; }
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
.entry .mark.perfect,
.replay-star-mark.perfect {
  background: linear-gradient(135deg, #fdf2f8, #f3e8ff);
  border: 1px solid #f472b6;
  color: #be185d;
}
.replay-star-mark {
  display: inline-block;
  margin-left: 6px;
  font-size: .72rem;
  font-weight: 800;
  padding: .1em .5em;
  border-radius: 999px;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  color: #b45309;
  vertical-align: 1px;
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
  var DEATH_MAP_GEOMETRY = ${JSON.stringify(deathMapGeometry)};   // 死亡マップの背景(実際のゲームのマップ。npm run deathmap で作る)
  var gamesEl = document.getElementById('games');
  var summaryEl = document.getElementById('summary');
  var adsStateEl = document.getElementById('ads-state');
  var adsSummaryEl = document.getElementById('ads-summary');
  var adsBreakdownEl = document.getElementById('ads-breakdown');
  var adsOnBtn = document.getElementById('ads-on-btn');
  var adsOffBtn = document.getElementById('ads-off-btn');
  var lastServerAds = { enabled: false, count: 0 };

  var HEADERS = { 'X-Requested-With': 'online-admin' };
  var TITLES = { 'cyber-2d-fighter-3d': 'サイバー２Dファイター３D', 'midnight-skyway': 'MIDNIGHT SKYWAY', 'sumo-smash-3d': '剛体大相撲', 'tower-stack': 'グラグラタワー' };
  var PHASES = { lobby: '参加受付中', loading: 'ロード中', racing: '実行中' };
  var MINUTES = [['60', '1時間'], ['120', '2時間'], ['180', '3時間'], ['360', '6時間'], ['720', '12時間'], ['1440', '24時間'], ['2880', '48時間']];
  var BOARD_TITLES = {
    'street-b-boy': 'ストリートビーボーイ',
    'school-corridor-runner': 'テンパレラン',
    'survivor-score-battle': 'サバイバー・スコアバトル',
    'ennichi-shateki': 'えんにち射的',
    'extreme-edge-arcade': '極限ギリギリ選手権',
    'tani-runner-124': '単位増殖ラン',
    'midnight-skyway': 'ミッドナイト・スカイウェイ',
    'cyber-2d-fighter-3d': 'サイバー２Dファイター３D',
    'sumo-smash-3d': '剛体大相撲',
    'tower-stack': 'タワースタック',
    'falldown': '無限降下ドリル'
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

  function fmtNum(v) {
    return typeof v === 'number' && isFinite(v) ? String(Math.round(v * 1000) / 1000) : '-';
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
    ['exitPhases', '離脱した場面'],
    ['exitReasons', '閉じた理由'],
    ['vehicles', '選択車両'],
    ['characters', '選択キャラクター'],
    ['maxStages', '到達ステージ / WAVE'],
    ['difficulties', '難易度'],
    ['modes', 'モード']
  ];

  function gameTitle(gid) {
    return BOARD_TITLES[gid] || TITLES[gid] || gid;
  }

  function buildGameBox(gid, g) {
    var sections = PROG_SECTIONS.filter(function (sec) { return Object.keys(g[sec[0]] || {}).length > 0; });
    if (sections.length === 0) return null;
    var name = gameTitle(gid);
    var meta = [el('span', { className: 'meta-tag', text: 'プレイ ' + g.launchCount + '回' })];
    if (g.launchCount > 0) meta.push(el('span', { className: 'meta-tag soft', text: '完走率 ' + Math.round(g.clearRate * 100) + '%' }));
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
      var tabId = btn.getAttribute('data-tab');
      var target = document.getElementById(tabId);
      if (target) target.classList.add('active');
      if (tabId === 'tab-replays') {
        loadAllReplays();
      } else if (tabId === 'tab-deathmap') {
        loadDeathMapTab();
      }
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
    lastServerAds = s.ads || { enabled: false, count: 0 };
    updateAdsCard();
  }

  function fmtSec(sec) {
    if (typeof sec !== 'number' || !isFinite(sec) || sec <= 0) return '0';
    return String(Math.round(sec * 100) / 100);
  }

  function updateAdsCard() {
    var ads = lastServerAds || { enabled: false, count: 0 };
    var adStats = (cachedAnalyticsData && cachedAnalyticsData.ads) || {
      totalImpressions: 0,
      totalDurationSec: 0,
      avgDurationSec: 0,
      byLogo: {}
    };
    if (adsStateEl) {
      adsStateEl.textContent = ads.enabled ? 'ON' : 'OFF';
      adsStateEl.className = 'state' + (ads.enabled ? ' open' : '');
    }
    if (adsSummaryEl) {
      var totalSec = adStats.totalDurationSec || 0;
      setStats(adsSummaryEl, [
        ['広告表示', ads.enabled ? 'ON' : 'OFF', '', ads.enabled],
        ['登録ロゴ数', String(ads.count), '件', ads.count > 0],
        ['総表示回数', String(adStats.totalImpressions || 0), '回', (adStats.totalImpressions || 0) > 0],
        ['合計表示時間', fmtSec(totalSec), totalSec >= 60 ? '秒 / ' + formatDuration(totalSec) : '秒'],
        ['平均表示時間', (adStats.totalImpressions || 0) > 0 ? fmtSec(adStats.avgDurationSec) : '-', (adStats.totalImpressions || 0) > 0 ? '秒/回' : ''],
      ]);
    }
    if (adsBreakdownEl) {
      adsBreakdownEl.textContent = '';
      var byLogo = adStats.byLogo || {};
      var logos = Object.keys(byLogo).sort();
      if (logos.length === 0) {
        adsBreakdownEl.appendChild(el('div', { className: 'empty', text: '広告ごとの表示実績はまだ記録されていません。' }));
      } else {
        var sub = el('div', { className: 'sub-card' });
        sub.appendChild(el('h4', { text: '広告ロゴ別 表示実績 回数・合計秒数' }));
        var tWrap = el('div', { className: 'table-wrap' });
        var tbl = el('table', { className: 'analytics-table' });
        tbl.appendChild(el('thead', null, [
          el('tr', null, [
            el('th', { text: '広告ロゴ' }),
            el('th', { text: '表示回数' }),
            el('th', { text: '合計表示時間' }),
            el('th', { text: '平均表示時間' }),
          ])
        ]));
        var tbody = el('tbody');
        logos.forEach(function (logo) {
          var st = byLogo[logo];
          var sec = st.totalDurationSec || 0;
          tbody.appendChild(el('tr', null, [
            el('td', { text: logo }),
            el('td', { className: 'num', text: String(st.count) + '回' }),
            el('td', { className: 'num', text: fmtSec(sec) + '秒' + (sec >= 60 ? ' ' + formatDuration(sec) : '') }),
            el('td', { className: 'num', text: fmtSec(st.avgDurationSec) + '秒' }),
          ]));
        });
        tbl.appendChild(tbody);
        tWrap.appendChild(tbl);
        sub.appendChild(tWrap);
        adsBreakdownEl.appendChild(sub);
      }
    }
    if (adsOnBtn) adsOnBtn.disabled = !!ads.enabled;
    if (adsOffBtn) adsOffBtn.disabled = !ads.enabled;
  }

  // ==========================================
  // 📈 アナリティクス レンダリング
  // ==========================================
  var selectedGame = 'all';
  var cachedAnalyticsData = null;

  function updateFilterUI() {
    var statusEl = document.getElementById('game-filter-status');
    var hintEl = document.getElementById('export-target-hint');
    var exportBtn = document.getElementById('export-btn');
    if (selectedGame === 'all') {
      if (statusEl) statusEl.style.display = 'none';
      if (hintEl) hintEl.textContent = '対象: 全ゲーム';
      if (exportBtn) exportBtn.textContent = 'JSONダウンロード';
    } else {
      var gname = gameTitle(selectedGame);
      if (statusEl) {
        statusEl.style.display = 'flex';
        statusEl.textContent = '';
        statusEl.appendChild(el('span', { text: gname + ' に絞り込み中' }));
        var clearBtn = el('button', { text: '解除', title: '全ゲーム表示に戻す' });
        clearBtn.addEventListener('click', function () {
          var sel = document.getElementById('analytics-game-filter');
          if (sel) sel.value = 'all';
          selectedGame = 'all';
          updateFilterUI();
          if (cachedAnalyticsData) renderAnalytics(cachedAnalyticsData);
          reloadAnalyticsSubTabs();
        });
        statusEl.appendChild(clearBtn);
      }
      if (hintEl) hintEl.textContent = '対象: ' + gname;
      if (exportBtn) exportBtn.textContent = gname + ' のJSONダウンロード';
    }
  }

  function renderPlaysTable(container, plays, showGameColumn, maxRows) {
    if (!container) return;
    container.textContent = '';
    if (!plays || plays.length === 0) {
      container.appendChild(el('div', { className: 'empty', text: 'プレイ履歴はまだありません。' }));
      return;
    }
    var list = plays.slice(-(maxRows || 50)).reverse();
    var tbl = el('table', { className: 'analytics-table' });
    var headers = [
      ...(showGameColumn ? [el('th', { text: 'ゲーム' })] : []),
      el('th', { text: '日時' }),
      el('th', { text: '時間' }),
      el('th', { text: '結果' }),
      el('th', { text: 'スコア' }),
      el('th', { text: 'カスタム選択 / 到達' }),
      el('th', { text: 'FPS' }),
      el('th', { text: '離脱・死因' }),
    ];
    tbl.appendChild(el('thead', null, [el('tr', null, headers)]));
    var tbody = el('tbody');
    list.forEach(function (p) {
      var gname = gameTitle(p.gameId);
      var timeStr = p.startedAt ? new Date(p.startedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
      var durStr = p.durationSec ? formatDuration(p.durationSec) : '-';
      
      var resPillClass = p.perfect ? 'status-pill perfect' : (p.completed ? 'status-pill clear' : (p.endedAt ? 'status-pill retire' : 'status-pill unknown'));
      var resText = p.perfect ? '★ 完全制覇' : (p.completed ? '完走' : (p.endedAt ? 'リタイア' : '終了未受信'));
      var resPill = el('span', { className: resPillClass, text: resText });

      var scoreText = p.formattedScore || (p.score !== undefined ? fmtNum(p.score) : '-');
      var fpsText = p.performance && p.performance.avgFps !== undefined ? (fmtNum(p.performance.avgFps) + 'fps') : '-';
      var customText = '-';
      if (p.progression) {
        var parts = [];
        if (p.progression.vehicle) parts.push(p.progression.vehicle);
        if (p.progression.character) parts.push(p.progression.character);
        if (p.progression.maxStage) parts.push(p.progression.maxStage);
        if (parts.length > 0) customText = parts.join(' / ');
      }

      var deathInfo = '';
      if (p.rounds && p.rounds.length) {
        var reasons = p.rounds.map(function (r) { return r.deathReason; }).filter(Boolean);
        if (reasons.length) deathInfo = ' ' + reasons.slice(-2).join('・');
      } else if (p.progression && p.progression.deathReason) {
        deathInfo = ' ' + p.progression.deathReason;
      }

      var rowCells = [
        ...(showGameColumn ? [el('td', null, [el('span', { className: 'game-badge', text: gname })])] : []),
        el('td', { text: timeStr }),
        el('td', { text: durStr }),
        el('td', null, [resPill]),
        el('td', { className: 'num', text: scoreText }),
        el('td', { text: customText }),
        el('td', { className: 'num', text: fpsText }),
        el('td', { text: exitText(p) + deathInfo }),
      ];
      tbody.appendChild(el('tr', null, rowCells));
    });
    tbl.appendChild(tbody);
    container.appendChild(tbl);
  }

  function renderGamePlays(plays) {
    var wrap = document.getElementById('game-plays-wrap');
    if (!wrap) return;
    wrap.textContent = '';
    var sub = el('div', { className: 'sub-card' });
    sub.appendChild(el('h4', { text: '最近のプレイ履歴とリプレイ 直近20件' }));
    var tWrap = el('div', { className: 'table-wrap' });
    renderPlaysTable(tWrap, plays, false, 20);
    sub.appendChild(tWrap);
    wrap.appendChild(sub);
  }

  var EXIT_REASON_LABEL = { exit: 'ゲームから戻った', browser_close: 'ページを閉じた', closed: '閉じた' };
  var PHASE_LABEL = { title: 'タイトル', menu: 'メニュー', playing: 'プレイ中', paused: 'ポーズ', result: '結果', name_entry: '名前登録', lobby: 'ロビー' };

  /** 離脱: どの場面で・どう閉じたか(終了が届かなかったものは、最後に分かっている場面) */
  function exitText(p) {
    var phase = p.exitPhase || p.lastPhase;
    var where = phase ? (PHASE_LABEL[phase] || phase) : '-';
    if (p.exitPhaseSec !== undefined && p.exitPhase) where += ' ' + Math.round(p.exitPhaseSec) + '秒';
    var how = p.exitReason ? (EXIT_REASON_LABEL[p.exitReason] || p.exitReason) : (p.endedAt ? '' : '終了未受信');
    return how ? where + ' / ' + how : where;
  }

  /** リプレイの再生ボタン。seekSec: そのラウンドが始まった所(少し前から見せる) */
  function replayButton(gid, replayId, seekSec) {
    var b = el('button', { className: 'replay-btn', type: 'button', text: '▶ リプレイ' });
    b.addEventListener('click', function () { openReplay(gid, replayId, Math.max(0, (seekSec || 0) - 2)); });
    return b;
  }

  // ---- リプレイの再生(ゲームを iframe で開き、記録した操作を入れ直して動かす) ----
  var replayModal = null;
  function closeReplay() {
    if (replayModal) { replayModal.remove(); replayModal = null; }
    window.removeEventListener('message', onReplayMessage);
    document.removeEventListener('keydown', onReplayKey);
  }
  function onReplayKey(e) { if (e.key === 'Escape') closeReplay(); }
  var replayStatusEl = null;
  var replayFrame = null;
  // ゲームを開くオリジン(サーバーの REPLAY_ORIGIN)。記録の中身は誰でも送れるので、管理画面とは別のオリジンで動かし、ログインを持たせない
  var replayOrigin = location.origin;
  function onReplayMessage(e) {
    if (e.origin !== replayOrigin || !replayFrame || e.source !== replayFrame.contentWindow) return;
    var m = e.data;
    if (!m || m.type !== 'gamecenter:replay-status' || !replayStatusEl) return;
    var st = m.status;
    replayStatusEl.textContent = '';
    replayStatusEl.appendChild(el('span', { text: formatDuration(st.sec || 0) + '  ' + st.frame + ' / ' + st.frames + ' フレーム  照合 ' + st.checkpoints + '  ' }));
    if (st.versionMismatch) replayStatusEl.appendChild(el('span', { className: 'bad', text: '記録した時とゲームの版が違います(途中で止まったり、ずれたりすることがあります)' }));
    if (st.seeking) replayStatusEl.appendChild(el('span', { text: 'ラウンドの頭まで進めています…' }));
    if (st.diverged) replayStatusEl.appendChild(el('span', { className: 'bad', text: '記録とずれました: ' + (st.divergeNote || '') }));
    else if (st.done) replayStatusEl.appendChild(el('span', { className: 'good', text: '最後まで記録どおりに再生しました' }));
  }
  function openReplay(gid, replayId, seekSec) {
    closeReplay();
    replayModal = el('div', { className: 'replay-modal' });
    var info = el('div', { className: 'replay-bar', text: '記録を読み込み中...' });
    replayModal.appendChild(info);
    document.body.appendChild(replayModal);
    document.addEventListener('keydown', onReplayKey);
    Promise.all([
      call('GET', '/admin/api/replay?id=' + encodeURIComponent(replayId)),
      call('GET', '/admin/api/replay-ticket?id=' + encodeURIComponent(replayId)),
    ]).then(function (got) {
      if (!replayModal) return;
      var rec = got[0];
      var tk = got[1] || {};
      var isProdHost = location.hostname.replace(/\\.$/, '') === 'game.hinata.works';
      replayOrigin = typeof tk.origin === 'string' && /^https?:\\/\\/[\\w.-]+(:\\d+)?$/.test(tk.origin) ? tk.origin : (isProdHost ? '' : location.origin);
      if (!replayOrigin || (isProdHost && replayOrigin.replace(/\\.$/, '') === location.origin.replace(/\\.$/, ''))) {
        info.textContent = 'リプレイ用の別オリジン(REPLAY_ORIGIN)が設定されていないため再生できません';
        var errClose = el('button', { type: 'button', text: '閉じる' });
        errClose.addEventListener('click', closeReplay);
        info.appendChild(errClose);
        return;
      }
      var h = rec.header || {};
      var w = Math.max(320, Math.min(3840, Number(h.w) || 1280));
      var hh = Math.max(240, Math.min(2160, Number(h.h) || 720));
      var scale = Math.min(window.innerWidth * 0.92 / w, (window.innerHeight - 120) / hh, 1.5);
      var stage = el('div', { className: 'replay-stage' });
      stage.style.width = Math.round(w * scale) + 'px';
      stage.style.height = Math.round(hh * scale) + 'px';
      replayFrame = el('iframe', { title: 'リプレイ' });
      replayFrame.width = String(w);
      replayFrame.height = String(hh);
      replayFrame.style.width = w + 'px';
      replayFrame.style.height = hh + 'px';
      replayFrame.style.transform = 'scale(' + scale + ')';
      replayFrame.setAttribute('allow', 'autoplay; gamepad');
      replayFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      var targetGame = typeof h.game === 'string' && /^[a-z0-9-]+$/.test(h.game) ? h.game : gid;
      replayFrame.src = replayOrigin + '/games/' + encodeURIComponent(targetGame) + '/?replay=' + encodeURIComponent(replayId) + '&ticket=' + encodeURIComponent(String(tk.ticket || '')) + (seekSec > 0 ? '&seek=' + Math.max(0, Math.round(seekSec * 10) / 10) : '');
      stage.appendChild(replayFrame);
      var bar = el('div', { className: 'replay-bar' });
      var speedBtns = [];
      [0.5, 1, 2, 4].forEach(function (v) {
        var b = el('button', { type: 'button', text: v + 'x', className: v === 1 ? 'on' : '' });
        b.addEventListener('click', function () {
          speedBtns.forEach(function (x) { x.className = ''; });
          b.className = 'on';
          replayFrame.contentWindow.postMessage({ type: 'gamecenter:replay-control', speed: v }, replayOrigin);
        });
        speedBtns.push(b);
        bar.appendChild(b);
      });
      var paused = false;
      var pauseBtn = el('button', { type: 'button', text: '一時停止' });
      pauseBtn.addEventListener('click', function () {
        paused = !paused;
        pauseBtn.textContent = paused ? '再開' : '一時停止';
        replayFrame.contentWindow.postMessage({ type: 'gamecenter:replay-control', paused: paused }, replayOrigin);
      });
      bar.appendChild(pauseBtn);
      var closeBtn = el('button', { type: 'button', text: '閉じる' });
      closeBtn.addEventListener('click', closeReplay);
      bar.appendChild(closeBtn);
      replayStatusEl = el('span', { className: 'replay-status', text: '' });
      bar.appendChild(replayStatusEl);
      var notes = [];
      if (h.startedAt || h.e0) notes.push(new Date(h.e0).toLocaleString('ja-JP'));
      if (rec.gapAt !== undefined) notes.push('記録の途中が届いていないため、そこまでを再生します');
      else if (!rec.final) notes.push('記録の最後が届いていません ブラウザが強制終了した可能性');
      if (h.framed === false) notes.push('ハブを通さずに開いたプレイ');
      info.textContent = notes.join(' / ');
      replayModal.appendChild(stage);
      replayModal.appendChild(bar);
      window.addEventListener('message', onReplayMessage);
    }).catch(function (e) {
      info.textContent = '記録を読み込めませんでした: ' + e.message;
    });
  }

  // ---- 死亡地点マップ ----
  // 背景は、ゲームの本物のコードから取り出した実際のマップ(deathMapGeometry.json。npm run deathmap で作る)。
  // マップを持つゲームだけを、マップ(ステージ・コース)ごとに全部並べる(選ぶ操作はない)。
  var DEATHMAP_ORDER = ['street-b-boy', 'falldown', 'school-corridor-runner', 'tower-stack', 'tani-runner-124', 'midnight-skyway'];
  /** 地点の呼び方(skyway は死亡ではなく、ぶつかった・時間切れになった場所) */
  var POINT_LABEL = { 'midnight-skyway': '衝突・タイムアップ地点' };
  var SKYWAY_COURSE_NAMES = { tsukikage_touge: '月影・湯元 峠ダウンヒル', tokyo_climb: '東京クライム' };
  var DEATHMAP_NOTE = '赤いバツが地点です。バツに合わせると、死因と日時が出ます。';

  // バツに合わせた時に、カーソルの横に出す小さな説明(1つを使い回す)
  var deathHover = null;
  function showDeathHover(e, text) {
    if (!deathHover) { deathHover = el('div', { className: 'deathmap-hover' }); document.body.appendChild(deathHover); }
    deathHover.textContent = text;
    deathHover.style.display = 'block';
    deathHover.style.left = Math.min(window.innerWidth - 300, e.clientX + 14) + 'px';
    deathHover.style.top = (e.clientY + 14) + 'px';
  }
  function hideDeathHover() { if (deathHover) deathHover.style.display = 'none'; }

  function hasDeathMap(gid) { return !!DEATH_MAP_GEOMETRY[gid]; }

  /** マップの見出し */
  function mapTitle(gid, mapId, geo) {
    if (gid === 'midnight-skyway') return SKYWAY_COURSE_NAMES[mapId.replace('course:', '')] || mapId;
    if (gid === 'street-b-boy') return 'STAGE ' + mapId.replace('stage', '') + ' ' + (geo.title || '');
    if (gid === 'tani-runner-124') return geo.title || mapId;
    return '';
  }

  /**
   * マップごとの描き方。range: 描く範囲(死亡地点で広げる)。equal: 縦横同じ縮尺。flipY: 上が +y。aspect: 縦/横の比(equal でない時の画面の形)
   * draw(ctx, P, s): P(x, y) で画面の座標。s は1単位の画面上の長さ
   */
  function mapSpec(gid, mapId, geo, deaths) {
    var maxY = 0, maxX = 0;
    deaths.forEach(function (d) { maxY = Math.max(maxY, d.y); maxX = Math.max(maxX, d.x); });
    if (gid === 'midnight-skyway') {
      var xs = geo.road.map(function (p) { return p[0]; }), zs = geo.road.map(function (p) { return p[1]; });
      return {
        range: [Math.min.apply(null, xs) - 40, Math.max.apply(null, xs) + 40, Math.min.apply(null, zs) - 40, Math.max.apply(null, zs) + 40],
        equal: true, bg: '#0b1220',
        draw: function (ctx, P, s) {
          var line = function (w, color) {
            ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.beginPath();
            geo.road.forEach(function (p, i) { var q = P(p[0], p[1]); if (i === 0) ctx.moveTo(q[0], q[1]); else ctx.lineTo(q[0], q[1]); });
            ctx.closePath(); ctx.stroke();
          };
          line(Math.max(6, 14 * s), '#334155');            // 道路(幅は約14m)
          line(Math.max(4, 11 * s), '#475569');
          ctx.setLineDash([6, 6]); line(1, 'rgba(250,204,21,.7)'); ctx.setLineDash([]);   // 中央線
          var st = P(geo.road[0][0], geo.road[0][1]);
          ctx.fillStyle = '#22d3ee'; ctx.beginPath(); ctx.arc(st[0], st[1], 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#e2e8f0'; ctx.font = "700 12px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif"; ctx.fillText('START / GOAL', st[0] + 9, st[1] - 8);
        },
      };
    }
    if (gid === 'street-b-boy') {
      var x0 = Infinity, x1 = -Infinity, y1 = 6;
      geo.platforms.forEach(function (p) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0] + p[2]); y1 = Math.max(y1, p[1] + 4); });
      x1 = Math.max(x1, geo.goal[0] + 6);
      return {
        range: [x0 - 2, x1 + 2, -4, Math.max(y1, Math.min(maxY + 2, y1 + 30))], equal: true, flipY: true, bg: '#111827', minH: 150,
        draw: function (ctx, P, s) {
          var rect = function (x, yTop, w, h, fill, stroke) {
            var a = P(x, yTop), b = P(x + w, yTop - h);
            ctx.fillStyle = fill; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
            if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
          };
          // 足場(地面は濃く、すり抜けられる足場は明るく薄く)
          geo.platforms.forEach(function (p) { rect(p[0], p[1], p[2], Math.max(p[3], 0.3), p[4] ? '#64748b' : '#334155', p[4] ? '#94a3b8' : '#475569'); });
          if (geo.shaft) { var a = P(geo.shaft.x0, 2), b = P(geo.shaft.x1, -4); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]); }
          geo.crumbling.forEach(function (c) { ctx.setLineDash([3, 3]); rect(c[0], c[1], c[2], 0.5, 'rgba(180,83,9,.5)', '#f59e0b'); ctx.setLineDash([]); });
          geo.moving.forEach(function (m) {
            rect(m[0], m[1], m[2], 0.5, 'rgba(14,165,233,.55)', '#38bdf8');
            if (m[3] || m[4]) { var a1 = P(m[0] + m[2] / 2, m[1]), b1 = P(m[0] + m[2] / 2 + m[3], m[1] + m[4]); ctx.strokeStyle = 'rgba(56,189,248,.6)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(a1[0], a1[1]); ctx.lineTo(b1[0], b1[1]); ctx.stroke(); ctx.setLineDash([]); }
          });
          geo.rails.forEach(function (g) { var a = P(g[0], g[1]), b = P(g[0] + g[2], g[1]); ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); });
          geo.blocks.forEach(function (b) { rect(b[0] - 0.5, b[1] + 0.5, 1, 1, b[2] === 'question' ? '#ca8a04' : '#92400e'); });
          geo.lasers.forEach(function (l) { rect(l[0] - l[2] / 2, l[1] + l[3], l[2], l[3], 'rgba(239,68,68,.45)'); });
          geo.vlasers.forEach(function (l) { rect(l[0] - 0.2, l[1] + l[2], 0.4, l[2], 'rgba(239,68,68,.6)'); });
          var icon = function (list, color, r) { list.forEach(function (o) { var q = P(o[0], o[1] + 0.4); ctx.fillStyle = color; ctx.fillRect(q[0] - r, q[1] - r, r * 2, r * 2); }); };
          icon(geo.hydrants, '#ef4444', 3); icon(geo.subwoofers, '#a855f7', 3); icon(geo.vents, '#e5e7eb', 2.5); icon(geo.obstacles, '#a16207', 3);
          geo.checkpoints.forEach(function (c) { var a = P(c[0], c[1]), b = P(c[0], c[1] + 3); ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.fillStyle = '#22c55e'; ctx.fillRect(b[0], b[1], 7, 5); });
          geo.enemies.forEach(function (e) { var q = P(e[0], e[1] + 0.7); ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(2.5, 0.6 * s), 0, Math.PI * 2); ctx.stroke(); });
          var g1 = P(geo.goal[0], geo.goal[1]); ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(g1[0], g1[1] - 6, 6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fde68a'; ctx.font = "700 11px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif"; ctx.fillText('GOAL', g1[0] - 14, g1[1] - 16);
        },
        legend: [['#334155', '地面・足場'], ['#64748b', 'すり抜け足場'], ['#38bdf8', '動く足場'], ['#f59e0b', '崩れる足場'], ['#ef4444', 'レーザー・消火栓'], ['#fb923c', '敵(○)'], ['#22c55e', 'チェックポイント']],
      };
    }
    if (gid === 'falldown') {
      // 坑道は横 geo.width マス(マスの中心が x=0..width-1)、1段 = 深さ1m。1マスを正方形の実寸で描き、枠の中で縦にスクロールして見る
      var font = "700 11px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
      var bottom = Math.max(geo.goalDepth + 3, Math.min(maxY + 2, geo.goalDepth + 20));
      return {
        range: [-0.5, geo.width - 0.5, 0, bottom], cell: 22, gutter: 46, bg: '#1c1917',
        // 地点は、いたマスの真ん中(深さ d m の段は d〜d+1)
        point: function (d) { return [Math.min(geo.width - 1, Math.max(0, Math.round(d.x))), d.y + 0.5]; },
        where: function (d) { return '深さ' + d.y + 'm・左から' + (Math.min(geo.width - 1, Math.max(0, Math.round(d.x))) + 1) + '列目'; },
        draw: function (ctx, P) {
          var L = -0.5, R = geo.width - 0.5;
          geo.strata.forEach(function (layer, i) {
            var next = i + 1 < geo.strata.length ? geo.strata[i + 1].depth : geo.goalDepth;
            var a = P(L, layer.depth), b = P(R, next);
            ctx.fillStyle = layer.back; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
          });
          var g = P(L, geo.goalDepth), g2 = P(R, bottom);
          ctx.fillStyle = '#ca8a04'; ctx.fillRect(g[0], g[1], g2[0] - g[0], g2[1] - g[1]);
          // ブロックの区切り(1マスごとの細い線、10mごとに太い線)
          ctx.lineWidth = 1;
          for (var c = 0; c <= geo.width; c++) { var a1 = P(c - 0.5, 0), b1 = P(c - 0.5, bottom); ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.moveTo(a1[0] + 0.5, a1[1]); ctx.lineTo(b1[0] + 0.5, b1[1]); ctx.stroke(); }
          ctx.textAlign = 'right'; ctx.font = font;
          for (var y = 0; y <= bottom; y++) {
            var p1 = P(L, y), p2 = P(R, y), major = y % 10 === 0;
            ctx.strokeStyle = major ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.12)';
            ctx.beginPath(); ctx.moveTo(p1[0], p1[1] + 0.5); ctx.lineTo(p2[0], p2[1] + 0.5); ctx.stroke();
            if (major) { ctx.fillStyle = '#cbd5e1'; ctx.fillText(y + 'm', p1[0] - 6, p1[1] + 4); }
          }
          ctx.textAlign = 'left';
          // 地層・ゴールの名前(段の中に書く)
          geo.strata.forEach(function (layer) { var a = P(L, layer.depth); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(layer.name, a[0] + 4, a[1] + 15); });
          ctx.fillStyle = '#fff7d6'; ctx.fillText('黄金郷(ゴール)', g[0] + 4, g[1] + 15);
        },
      };
    }
    if (gid === 'school-corridor-runner') {
      var len = Math.max(400, Math.ceil((Math.min(maxX, 50000) + 40) / geo.segment) * geo.segment);
      var hw = geo.width / 2;
      return {
        range: [0, len, -hw - 0.8, hw + 0.8], aspect: 0.18, bg: '#1e1b16', minH: 140,
        draw: function (ctx, P) {
          var a = P(0, -hw), b = P(len, hw);
          // 1m の画面上の長さ。廊下が長いほど細かくなるので、継ぎ目・窓・距離の数値はこれに合わせて間引く
          var ppm = P(1, 0)[0] - P(0, 0)[0];
          ctx.fillStyle = '#a8a29e'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);            // 床
          if (geo.segment * ppm >= 10) {                                                            // 区画(36m)ごとの継ぎ目(詰まる時は描かない)
            for (var z = 0; z < len; z += geo.segment) {
              var t = P(z, -hw), u = P(z, hw); ctx.strokeStyle = 'rgba(68,64,60,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(t[0], t[1]); ctx.lineTo(u[0], u[1]); ctx.stroke();
            }
          }
          ctx.fillStyle = '#7dd3fc';                                                                // 窓側の壁(左。詰まる時は1本の帯にする)
          if (geo.windowChunk * ppm >= 8) {
            for (var w = 0; w < len; w += geo.windowChunk) {
              var p1 = P(w + 1, -hw - 0.8), p2 = P(w + geo.windowChunk - 1, -hw);
              ctx.fillRect(p1[0], p1[1], p2[0] - p1[0], p2[1] - p1[1]);
            }
          } else { var wa = P(0, -hw - 0.8), wb = P(len, -hw); ctx.fillRect(wa[0], wa[1], wb[0] - wa[0], wb[1] - wa[1]); }
          var r1 = P(0, hw), r2 = P(len, hw + 0.8); ctx.fillStyle = '#78716c'; ctx.fillRect(r1[0], r1[1], r2[0] - r1[0], r2[1] - r1[1]);   // 教室側の壁(右)
          ctx.setLineDash([8, 6]); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1;
          for (var i = 0; i < geo.lanes.length - 1; i++) { var m = (geo.lanes[i] + geo.lanes[i + 1]) / 2, q1 = P(0, m), q2 = P(len, m); ctx.beginPath(); ctx.moveTo(q1[0], q1[1]); ctx.lineTo(q2[0], q2[1]); ctx.stroke(); }
          ctx.setLineDash([]);
          // 距離の目盛り: 隣と 90px 以上あく間隔(100m・200m・500m・1000m…)で、線と数値を描く。右端からはみ出す数値は描かない
          var step = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].filter(function (v) { return v * ppm >= 90; })[0] || 20000;
          ctx.font = "700 11px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
          for (var d = step; d < len; d += step) {
            var q = P(d, hw), q0 = P(d, -hw), label = d + 'm';
            ctx.strokeStyle = 'rgba(28,25,23,.55)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
            if (q[0] + 3 + ctx.measureText(label).width <= b[0]) { ctx.fillStyle = '#1c1917'; ctx.fillText(label, q[0] + 3, q[1] - 3); }
          }
          var w1 = P(2, -hw - 0.8); ctx.fillStyle = '#e0f2fe'; ctx.fillText('窓', w1[0], w1[1] - 3);
        },
      };
    }
    if (gid === 'tower-stack') {
      var top = Math.max(20, Math.min(maxY + 4, 500));
      return {
        range: [-geo.moveLimit - 2, geo.moveLimit + 2, geo.killY - 1, top], equal: true, flipY: true, bg: '#0c1a33', minH: 220,
        draw: function (ctx, P, s) {
          var a = P(-geo.platformHalfW, 0), b = P(geo.platformHalfW, -1);
          ctx.fillStyle = '#7a5236'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);             // 土台
          ctx.strokeStyle = 'rgba(148,163,184,.5)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
          [-geo.moveLimit, geo.moveLimit].forEach(function (x) { var p = P(x, geo.killY), q = P(x, top); ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); });   // ブロックを動かせる範囲
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(226,232,240,.6)'; ctx.font = "700 11px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
          for (var h = 5; h < top; h += 5) { var q = P(geo.moveLimit + 0.3, h); ctx.fillText(h + 'm', q[0], q[1] + 4); var l1 = P(-geo.moveLimit, h), l2 = P(geo.moveLimit, h); ctx.strokeStyle = 'rgba(148,163,184,.12)'; ctx.beginPath(); ctx.moveTo(l1[0], l1[1]); ctx.lineTo(l2[0], l2[1]); ctx.stroke(); }
        },
        legend: [['#7a5236', '土台'], ['#94a3b8', 'ブロックを動かせる範囲(点線)']],
      };
    }
    if (gid === 'tani-runner-124') {
      var end = geo.zones.length ? geo.zones[geo.zones.length - 1][1] : geo.wallDist + 50;
      var half = geo.trackWidth / 2;
      return {
        range: [0, end, -half - 2, half + 2], aspect: 0.16, bg: '#14532d', minH: 130,
        draw: function (ctx, P) {
          var a = P(0, -half), b = P(geo.wallDist, half);
          ctx.fillStyle = '#365314'; ctx.fillRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);             // 走るコース(黒板色)
          var colors = ['#8b0000', '#b22222', '#c71585', '#d2691e', '#b8860b', '#006400', '#1e90ff', '#4b0082'];
          geo.zones.forEach(function (z, i) {                                                     // 壁の先の倍率ゾーン
            var p = P(z[0], -half - 2), q = P(z[1], half + 2);
            ctx.fillStyle = colors[i % colors.length]; ctx.fillRect(p[0], p[1], q[0] - p[0], q[1] - p[1]);
            ctx.fillStyle = '#fff'; ctx.font = "700 10px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif"; ctx.fillText(z[2], p[0] + 2, (p[1] + q[1]) / 2 + 3);
          });
          var w1 = P(geo.wallDist, -half - 2), w2 = P(geo.wallDist, half + 2);
          ctx.strokeStyle = '#f8fafc'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(w1[0], w1[1]); ctx.lineTo(w2[0], w2[1]); ctx.stroke();
          ctx.fillStyle = '#f8fafc'; ctx.font = "700 11px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif"; ctx.fillText('卒業要件の壁 ' + geo.wallDist + 'm', w1[0] - 120, w1[1] - 2);
          ctx.fillStyle = 'rgba(255,255,255,.7)';
          for (var d = 50; d < geo.wallDist; d += 50) { var q2 = P(d, half); ctx.fillText(d + 'm', q2[0] + 2, q2[1] + 12); }
        },
        legend: [['#365314', 'コース(ゲート・障害物は毎回ちがう)'], ['#f8fafc', '卒業要件の壁']],
      };
    }
    return null;
  }

  function drawDeathMapCanvas(st) {
    var spec = st.spec, r = spec.range;
    var minX = r[0], maxX = r[1], minY = r[2], maxY = r[3];
    var pad = 10, cw, ch, sx, sy, ox, oy;
    if (spec.cell) {
      // 1マス = spec.cell px の実寸(範囲は spec.range のまま。地点で広げると、実際のマップとずれる)
      sx = sy = spec.cell;
      cw = (maxX - minX) * sx + pad * 2 + spec.gutter;
      ch = (maxY - minY) * sy + pad * 2;
      st.canvas.style.width = Math.round(cw) + 'px';
      ox = pad + spec.gutter; oy = pad;
    } else {
      var spanX = Math.max(10, r[1] - r[0]), spanY = Math.max(10, r[3] - r[2]);
      st.deaths.forEach(function (d) {
        if (d.x >= r[0] - spanX && d.x <= r[1] + spanX) { minX = Math.min(minX, d.x - 1); maxX = Math.max(maxX, d.x + 1); }
        if (d.y >= r[2] - spanY && d.y <= r[3] + spanY) { minY = Math.min(minY, d.y - 1); maxY = Math.max(maxY, d.y + 1); }
      });
      cw = st.canvas.clientWidth || 800;
      ch = spec.equal ? cw * (maxY - minY) / (maxX - minX) : cw * (spec.aspect || 0.6);
      ch = Math.max(spec.minH || 180, Math.min(620, ch));
      sx = (cw - pad * 2) / (maxX - minX); sy = (ch - pad * 2) / (maxY - minY);
      if (spec.equal) sx = sy = Math.min(sx, sy);
      ox = pad + ((cw - pad * 2) - (maxX - minX) * sx) / 2; oy = pad + ((ch - pad * 2) - (maxY - minY) * sy) / 2;
    }
    st.canvas.style.height = Math.round(ch) + 'px';
    var dpr = Math.min(window.devicePixelRatio || 1, 32000 / ch);   // (キャンバスの縦は 32767px まで)
    st.canvas.width = Math.round(cw * dpr);
    st.canvas.height = Math.round(ch * dpr);
    var ctx = st.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = spec.bg || '#0b1120';
    ctx.fillRect(0, 0, cw, ch);
    var P = function (x, y) { return [ox + (x - minX) * sx, spec.flipY ? oy + (maxY - y) * sy : oy + (y - minY) * sy]; };
    ctx.save();
    spec.draw(ctx, P, sx);
    ctx.restore();
    // 地点は赤いバツ(背景の赤いもの・暗い所でも見えるよう、黒い縁を付ける)
    st.placed = [];
    var cross = function (x, y, color, w) {
      var k = 4.5;
      ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - k, y - k); ctx.lineTo(x + k, y + k); ctx.moveTo(x + k, y - k); ctx.lineTo(x - k, y + k); ctx.stroke();
    };
    st.deaths.forEach(function (d) {
      var q = spec.point ? spec.point(d) : [d.x, d.y], p = P(q[0], q[1]);
      cross(p[0], p[1], 'rgba(0,0,0,.75)', 4.2);
      cross(p[0], p[1], '#ef4444', 2.2);
      st.placed.push({ x: p[0], y: p[1], d: d });
    });
  }

  /** 1つのマップ(ステージ・コース)の図。バツに合わせると、死因と日時が出る */
  function createMapPanel(gid, mapId, geo, deaths) {
    var spec = mapSpec(gid, mapId, geo, deaths);
    if (!spec) return null;
    // 横長のマップ(ステージ・廊下・コース)は、横いっぱいに広げる
    var wideMap = (spec.range[1] - spec.range[0]) / (spec.range[3] - spec.range[2]) > 2.5;
    var panel = el('div', { className: 'deathmap-panel' + (wideMap ? ' wide' : '') });
    var title = mapTitle(gid, mapId, geo);
    if (title) panel.appendChild(el('div', { className: 'deathmap-panel-head', text: title + ' — ' + deaths.length + '件' }));
    var canvas = el('canvas');
    // 実寸で描く縦長のマップは、枠の中でスクロールして見る
    if (spec.cell) { var scroller = el('div', { className: 'deathmap-scroll' }); scroller.appendChild(canvas); panel.appendChild(scroller); } else panel.appendChild(canvas);
    var st = { gid: gid, canvas: canvas, spec: spec, deaths: deaths, placed: [], legend: spec.legend };
    var nearest = function (e) {
      var r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, best = null, bd = 80;
      st.placed.forEach(function (p) { var d = (p.x - mx) * (p.x - mx) + (p.y - my) * (p.y - my); if (d < bd) { bd = d; best = p.d; } });
      return best;
    };
    canvas.addEventListener('mousemove', function (e) {
      var d = nearest(e);
      if (!d) { hideDeathHover(); return; }
      showDeathHover(e, (d.cause || '不明') + (spec.where ? ' / ' + spec.where(d) : '') + ' / ' + new Date(d.at).toLocaleString('ja-JP') + (d.round ? ' / ' + d.round + 'ラウンド目' : '') + (d.t !== undefined ? ' / 開始から' + Math.round(d.t) + '秒' : ''));
    });
    canvas.addEventListener('mouseleave', hideDeathHover);
    deathMapPanels.push(st);
    return { el: panel, st: st };
  }

  /** 1つのゲームの死亡マップ(マップを全部並べる)。マップを持たないゲームは null */
  function createGameDeathMaps(gid, sp) {
    var maps = DEATH_MAP_GEOMETRY[gid];
    if (!maps) return null;
    var deaths = (sp && sp.deaths) || [];
    var causeCount = Object.create(null);
    deaths.forEach(function (d) { var k = d.cause || '不明'; causeCount[k] = (causeCount[k] || 0) + 1; });
    var causes = Object.keys(causeCount).sort(function (a, b) { return causeCount[b] - causeCount[a]; });
    var card = el('div', { className: 'sub-card deathmap' });
    card.appendChild(el('h4', { text: gameTitle(gid) + ' — ' + (POINT_LABEL[gid] || '死亡地点') + ' ' + deaths.length + '件' }));
    // 死因ごとの件数(地点はどれも赤いバツ。死因は、バツに合わせると出る)
    var legend = el('div', { className: 'deathmap-causes', text: causes.length === 0 ? 'まだ記録はありません' : causes.map(function (k) { return k + ' ' + causeCount[k] + '件'; }).join(' ・ ') });
    card.appendChild(legend);
    var grid = el('div', { className: 'deathmap-grid' });
    // 死亡地点の多いマップから並べる(記録がなくても、マップは全部出す)
    var ids = Object.keys(maps).sort(function (a, b) {
      var na = deaths.filter(function (d) { return d.map === a; }).length, nb = deaths.filter(function (d) { return d.map === b; }).length;
      return nb - na || (a < b ? -1 : 1);
    });
    var panels = [];
    ids.forEach(function (id) {
      var p = createMapPanel(gid, id, maps[id], deaths.filter(function (d) { return d.map === id; }));
      if (p) { grid.appendChild(p.el); panels.push(p.st); }
    });
    card.appendChild(grid);
    // 背景の見方(マップの描き方はゲームで共通なので、1回だけ出す)
    var geoLegend = panels.length && panels[0].legend;
    if (geoLegend) {
      var lg = el('div', { className: 'deathmap-legend deathmap-geo-legend' });
      geoLegend.forEach(function (x) { var it = el('span'), dot = el('i'); dot.style.background = x[0]; it.appendChild(dot); it.appendChild(document.createTextNode(x[1])); lg.appendChild(it); });
      card.appendChild(lg);
    }
    return { card: card, panels: panels };
  }

  var deathMapPanels = [];
  function redrawDeathMaps() { deathMapPanels.forEach(function (st) { if (st.canvas.isConnected) drawDeathMapCanvas(st); }); }
  window.addEventListener('resize', function () { redrawDeathMaps(); });

  // 個別ゲームの表示の中の死亡マップ(マップを持つゲームだけ)
  function loadDeathMap(gid) {
    var wrap = document.getElementById('game-deathmap-wrap');
    if (!wrap) return;
    wrap.textContent = '';
    if (!hasDeathMap(gid)) return;
    call('GET', '/admin/api/analytics/spatial?game=' + encodeURIComponent(gid)).then(function (sp) {
      wrap.textContent = '';
      var res = createGameDeathMaps(gid, sp);
      if (!res) return;
      wrap.appendChild(res.card);
      res.panels.forEach(drawDeathMapCanvas);
    }).catch(function () { wrap.textContent = ''; });
  }

  // 死亡マップのタブ: マップを持つゲームを全部、マップごとに並べる
  function loadDeathMapTab() {
    var wrap = document.getElementById('deathmap-tab-content');
    if (!wrap) return;
    wrap.textContent = '死亡マップを読み込み中...';
    deathMapPanels = [];
    hideDeathHover();
    Promise.all(DEATHMAP_ORDER.filter(hasDeathMap).map(function (gid) {
      return call('GET', '/admin/api/analytics/spatial?game=' + encodeURIComponent(gid))
        .then(function (sp) { return { gid: gid, sp: sp }; })
        .catch(function () { return { gid: gid, sp: { deaths: [] } }; });
    })).then(function (list) {
      wrap.textContent = '';
      wrap.appendChild(el('div', { className: 'deathmap-tip', text: DEATHMAP_NOTE }));   // 見方の説明は、タブの上に1回だけ
      var all = [];
      list.forEach(function (x) {
        var res = createGameDeathMaps(x.gid, x.sp);
        if (!res) return;
        wrap.appendChild(res.card);
        all = all.concat(res.panels);
      });
      all.forEach(drawDeathMapCanvas);
    }).catch(function (err) {
      wrap.textContent = '死亡マップの読み込みに失敗しました: ' + (err.message || err);
    });
  }


  /** リプレイのタブ: ランキングに載っているプレイのリプレイ(残すのはこれだけ)。表示対象のゲームで絞る */
  function loadAllReplays() {
    var wrap = document.getElementById('all-replays-wrap');
    var hint = document.getElementById('replays-count-hint');
    if (wrap) wrap.textContent = 'ランキングを読み込み中...';
    return call('GET', '/admin/api/lb')
      .then(function (res) {
        var rows = [];
        (res.boards || []).forEach(function (b) {
          if (selectedGame !== 'all' && b.slug !== selectedGame) return;
          b.entries.forEach(function (e) { if (e.replay && e.replay.id) rows.push({ b: b, e: e }); });
        });
        if (hint) hint.textContent = 'ランキングに載っている間だけ残します(' + rows.length + '件)';
        wrap.textContent = '';
        if (rows.length === 0) { wrap.appendChild(el('div', { className: 'empty', text: 'リプレイのあるランキングの記録はまだありません。' })); return; }
        var tbl = el('table', { className: 'analytics-table' });
        tbl.appendChild(el('thead', null, [el('tr', null, [
          el('th', { text: '' }), el('th', { text: 'ゲーム' }), el('th', { text: '枠' }), el('th', { text: '順位' }),
          el('th', { text: '名前' }), el('th', { text: 'スコア' }), el('th', { text: '日付' }),
        ])]));
        var tbody = el('tbody');
        rows.forEach(function (x) {
          var gname = gameTitle(x.b.slug);
          var nameCell = el('td');
          nameCell.appendChild(el('span', { text: x.e.name }));
          if (x.e.perfect) {
            nameCell.appendChild(el('span', { className: 'replay-star-mark perfect', text: '★ 完全制覇' }));
          } else if (x.e.cleared) {
            nameCell.appendChild(el('span', { className: 'replay-star-mark', text: '★ クリア' }));
          }
          tbody.appendChild(el('tr', null, [
            el('td', null, [replayButton(x.b.slug, x.e.replay.id, x.e.replay.seek)]),
            el('td', { text: gname }),
            el('td', { text: x.b.variantLabel || '-' }),
            el('td', { className: 'num', text: x.e.rank + '位' }),
            nameCell,
            el('td', { className: 'num', text: x.e.formattedScore }),
            el('td', { text: x.e.date }),
          ]));
        });
        tbl.appendChild(tbody);
        wrap.appendChild(tbl);
      })
      .catch(function (err) {
        if (wrap) showLoadError(wrap, 'ランキングのリプレイ', err);
      });
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
    updateAdsCard();
    var allKeys = Object.keys(data.games || {}).filter(function (gid) { return Object.prototype.hasOwnProperty.call(BOARD_TITLES, gid); });
    var activeKeys = selectedGame === 'all' ? allKeys : (data.games[selectedGame] ? [selectedGame] : []);

    // 1. サマリータブ
    var allView = document.getElementById('analytics-all-view');
    var gameView = document.getElementById('analytics-game-view');

    if (selectedGame === 'all') {
      if (allView) allView.style.display = 'block';
      if (gameView) gameView.style.display = 'none';

      var adSum = data.ads || { totalImpressions: 0, totalDurationSec: 0 };
      setStats(document.getElementById('analytics-summary'), [
        ['総訪問セッション', String(data.totalSessions)],
        ['アクティブ訪問中', String(data.activeSessionsNow), '人', data.activeSessionsNow > 0],
        ['総ゲームプレイ数', String(data.totalPlays)],
        ['総プレイ時間', ((data.totalPlayTimeSec || 0) / 3600).toFixed(1), 'h'],
        ['広告総表示回数', String(adSum.totalImpressions || 0), '回 / ' + fmtSec(adSum.totalDurationSec || 0) + '秒', (adSum.totalImpressions || 0) > 0],
        ['全体平均FPS', String(data.avgFpsOverall || 60), 'fps'],
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
            el('th', { text: '食いつき度 リピート・滞在' }),
            el('th', { text: '完走数' }),
            el('th', { text: '完走率' }),
            el('th', { text: '平均時間' }),
            el('th', { text: 'ハイスコア' }),
            el('th', { text: '平均FPS' }),
            el('th', { text: 'エラー' }),
          ])
        ]));
        var tbody = el('tbody');
        allKeys.forEach(function (gid) {
          var g = data.games[gid];
          var name = gameTitle(gid);
          var bestText = g.bestScore !== undefined ? fmtNum(g.bestScore) : '-';
          var rep = g.repeatRate !== undefined ? Number(g.repeatRate.toFixed(1)) : 1;
          var engSec = g.engagementScore || g.avgPlayTimeSec || 0;
          var badgeType = (rep >= 2.0 || engSec >= 300) ? 'hot' : ((rep >= 1.3 || engSec >= 120) ? 'good' : 'normal');
          var badgeLabel = badgeType === 'hot' ? '超没入' : (badgeType === 'good' ? '好評' : '通常');
          var engCell = el('span', { className: 'engagement-badge ' + badgeType }, [
            el('span', { text: badgeLabel + ' ' }),
            el('small', { text: rep + '回/人 ' + formatDuration(engSec) })
          ]);
          tbody.appendChild(el('tr', null, [
            el('td', { text: name }),
            el('td', { className: 'num', text: String(g.launchCount) }),
            el('td', null, [engCell]),
            el('td', { className: 'num', text: String(g.completeCount) }),
            el('td', { className: 'num', text: Math.round(g.clearRate * 100) + '%' }),
            el('td', { text: formatDuration(g.avgPlayTimeSec) }),
            el('td', { className: 'num', text: bestText }),
            el('td', { className: 'num', text: g.avgFps ? fmtNum(g.avgFps) + 'fps' : '-' }),
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

      var gname = gameTitle(selectedGame);
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
          el('span', { text: gname + ' アナリティクス分析' }),
          el('span', { className: 'meta-tag', text: '総プレイ: ' + g.launchCount + '回' })
        ]));
      }

      setStats(document.getElementById('game-stats'), [
        ['プレイ数', String(g.launchCount)],
        ['遊んだ人数', String(g.uniquePlayers || 1), '人'],
        ['食いつき度 リピート', (g.repeatRate ? g.repeatRate.toFixed(1) : '1.0') + '回/人', (g.repeatRate >= 2.0 || (g.engagementScore || 0) >= 300) ? '超没入' : ((g.repeatRate >= 1.3 || (g.engagementScore || 0) >= 120) ? '好評' : '通常'), (g.repeatRate >= 1.3)],
        ['1人あたり滞在時間', formatDuration(g.engagementScore || g.avgPlayTimeSec)],
        ['完走数', String(g.completeCount), '', g.completeCount > 0],
        ['完走率', String(Math.round(g.clearRate * 100)) + '%', '', g.completeCount > 0],
        ['1プレイ平均時間', formatDuration(g.avgPlayTimeSec)],
        ['ハイスコア', g.bestScore !== undefined ? fmtNum(g.bestScore) : '-', g.avgScore ? '平均 ' + Math.round(g.avgScore) : ''],
        ['平均FPS', g.avgFps ? fmtNum(g.avgFps) : '-', 'fps'],
        ['最低FPS 1% Low', g.minFps ? fmtNum(g.minFps) : '-', 'fps'],
        ['平均ロード時間', g.avgLoadMs ? (g.avgLoadMs / 1000).toFixed(1) : '-', '秒'],
        ['ゲームパッド利用', String(g.gamepadCount || 0), '回'],
        ['エラー発生件数', String(g.errorCount || 0), '件', (g.errorCount || 0) > 0 ? 'warn' : false],
      ]);

      var gProg = document.getElementById('game-progression-details');
      if (gProg) {
        gProg.textContent = '';
        var hasProg = false;
        PROG_SECTIONS.forEach(function (sec) {
          if (Object.keys(g[sec[0]] || {}).length > 0) {
            hasProg = true;
            renderShareList(gProg, sec[1], g[sec[0]]);
          }
        });
        if (!hasProg) {
          var emptyCard = el('div', { className: 'sub-card' });
          emptyCard.appendChild(el('div', { className: 'empty', text: 'このゲームの固有データ 死因・キャラ・車両等はまだ記録されていません。' }));
          gProg.appendChild(emptyCard);
        }
      }

      // 個別プレイ履歴の読み込み
      loadGamePlays(selectedGame);
      loadDeathMap(selectedGame);
    }

    // 2. ハードウェアタブ (全体)
    setStats(document.getElementById('hardware-stats'), [
      ['検出GPU数', String(Object.keys(data.hardware.gpuRenderers || {}).length), '種'],
      ['検出OS数', String(Object.keys(data.hardware.os || {}).length), '種'],
      ['検出ブラウザ数', String(Object.keys(data.hardware.browsers || {}).length), '種'],
    ]);
    var hwDetails = document.getElementById('hardware-details');
    hwDetails.textContent = '';
    renderShareList(hwDetails, 'GPU レンダラー グラフィックチップ', data.hardware.gpuRenderers);
    renderShareList(hwDetails, 'GPU ベンダー', data.hardware.gpuVendors);
    renderShareList(hwDetails, 'オペレーティングシステム OS', data.hardware.os);
    renderShareList(hwDetails, 'ブラウザ', data.hardware.browsers);
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
        ['最低FPS 1% Low', gameG && gameG.minFps ? String(gameG.minFps) : '-', 'fps'],
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
        el('th', { text: '最低FPS 1% Low' }),
        el('th', { text: 'エラー発生数' }),
      ])
    ]));
    var pTbody = el('tbody');
    activeKeys.forEach(function (gid) {
      var g = data.games[gid];
      pTbody.appendChild(el('tr', null, [
        el('td', { text: gameTitle(gid) }),
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

  }

  function showLoadError(box, label, err) {
    if (!box) return;
    box.textContent = '';
    box.appendChild(el('div', { className: 'empty load-error', text: label + 'を読み込めませんでした。' + (err && err.message ? err.message : err) + ' 再読み込みを押してください。' }));
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
      var events = (res.events || []).filter(function (ev) { return !ev.gameId || Object.prototype.hasOwnProperty.call(BOARD_TITLES, ev.gameId); }).slice(-100).reverse();
      if (events.length === 0) {
        wrap.appendChild(el('div', { className: 'empty', text: '対象のイベントログはまだありません。' }));
        return;
      }
      wrap.appendChild(el('div', { className: 'raw-log-note', text: '新しい順に直近' + events.length + '件 全' + (res.count || events.length) + '件中' }));
      var tbl = el('table', { className: 'raw-log-table' });
      tbl.appendChild(el('thead', null, [
        el('tr', null, [el('th', { text: '時刻' }), el('th', { text: '種別' }), el('th', { text: 'ゲーム' }), el('th', { text: 'データ' })])
      ]));
      var tbody = el('tbody');
      events.forEach(function (ev) {
        tbody.appendChild(el('tr', null, [
          el('td', { className: 'log-time', text: formatLogTime(ev.timestamp) }),
          el('td', { className: 'log-type' }, [el('span', { className: 'log-type-chip', text: ev.type })]),
          el('td', { className: 'log-game', text: ev.gameId ? gameTitle(ev.gameId) : '-' }),
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
    if (e.perfect) {
      kids.push(el('span', { className: 'mark perfect', text: '★ 完全制覇スター' }));
    } else if (e.cleared) {
      kids.push(el('span', { className: 'mark', text: '★ クリアスター' }));
    }
    if (e.role) {
      kids.push(el('span', { className: 'mark ' + (e.role === '開発者' ? 'dev' : 'tester'), text: e.role }));
    } else if (e.dev) {
      kids.push(el('span', { className: 'mark dev', text: '開発者' }));
    }
    if (e.origName) kids.push(el('span', { className: 'meta orig', text: '元: ' + e.origName }));
    if (e.extra) kids.push(el('span', { className: 'meta', text: e.extra }));
    kids.push(el('span', { className: 'meta', text: e.date + (e.hasGhost ? ' ゴースト有' : '') }));

    var acts = el('span', { className: 'acts' });
    if (e.replay && e.replay.id) acts.appendChild(replayButton(b.slug, e.replay.id, e.replay.seek));
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
      if (window.confirm(boardTitle(b) + ' の ' + e.rank + '位 ' + e.name + ' ' + e.formattedScore + ' を削除します。よろしいですか？')) {
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
        placeholder: '好きな名前 漢字カタカナひらがな英数 1〜10文字',
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
      var hintEl = el('div', { className: 'form-hint', text: '※ランキングでは「好きな名前 ロール」で表示されます。漢字・カタカナ・ひらがな・英数が使えます。' });

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
        if (window.confirm(boardTitle(b) + ' の記録 ' + b.entries.length + ' 件をすべて消します ゴーストも消えます。よろしいですか？')) {
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
  if (adsOnBtn) {
    adsOnBtn.addEventListener('click', function () {
      act('/admin/api/ads?on=1');
    });
  }
  if (adsOffBtn) {
    adsOffBtn.addEventListener('click', function () {
      act('/admin/api/ads?on=0');
    });
  }
  document.getElementById('logout').addEventListener('click', function () {
    fetch('/admin/logout', { method: 'POST', headers: HEADERS, cache: 'no-store', credentials: 'same-origin' })
      .then(function () { location.href = '/admin/login'; });
  });

  function reloadAnalyticsSubTabs() {
    loadRawLogs();
    loadErrors();
    var replaysTab = document.getElementById('tab-replays');
    if (replaysTab && replaysTab.classList.contains('active')) {
      loadAllReplays();
    }
    var deathMapTab = document.getElementById('tab-deathmap');
    if (deathMapTab && deathMapTab.classList.contains('active')) {
      loadDeathMapTab();
    }
  }

  document.getElementById('boards-reload').addEventListener('click', loadBoards);
  document.getElementById('analytics-reload').addEventListener('click', function () {
    loadAnalytics();
    reloadAnalyticsSubTabs();
  });

  // ゲームフィルターの変更イベント
  var gameFilterSelect = document.getElementById('analytics-game-filter');
  if (gameFilterSelect) {
    gameFilterSelect.addEventListener('change', function () {
      selectedGame = gameFilterSelect.value;
      updateFilterUI();
      if (cachedAnalyticsData) renderAnalytics(cachedAnalyticsData);
      reloadAnalyticsSubTabs();
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
    var replaysTab = document.getElementById('tab-replays');
    if (replaysTab && replaysTab.classList.contains('active')) {
      loadAllReplays();
    }
  }, 30000);
})();
`;
