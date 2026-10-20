# Game Center

自作ミニゲームを集めたハブサイト。npm workspaces のモノレポ。

## 構成

```
packages/
  hub/        ゲーム選択画面。ゲームの一覧・説明文は packages/hub/src/games.ts だけが持つ
  games/      ゲーム(どれも Vite + TypeScript、描画は Three.js)
    cyber-2d-fighter-3d  サイバー２Dファイター３D     sumo-smash-3d         剛体大相撲
    school-corridor-runner テンパレラン               street-b-boy          ストリートビーボーイ
    midnight-skyway      ミッドナイト・スカイウェイ   tani-runner-124       単位増殖ラン
    ennichi-shateki      えんにち射的                 extreme-edge-arcade   極限ギリギリ選手権
    survivor-score-battle サバイバー・スコアバトル    tower-stack           グラグラタワー
    falldown             無限降下ドリル
  shared/     全ゲーム共通の部品(戻る操作・ポーズ・ランキング・アナリティクス・リプレイ・ベンチマークなど)
  server/     オンライン対戦・ランキング・記録・管理画面のサーバー
scripts/      開発・ビルド・デプロイ・計測の道具
```

## 開発

```bash
npm install
npm run dev                                  # hub + 全ゲーム + 開発用サーバーを http://localhost:5173/ で起動
npm run dev -w packages/games/street-b-boy   # 1つのゲームだけ
```

`npm run dev`(`scripts/dev-all.mjs`)は、hub と各ゲームの Vite を1つのポートの `/games/<slug>/` にまとめ、`/api` を開発用のサーバーへ中継する(ランキングは `packages/server/data/` に保存。消せば空に戻る)。`packages/games/` のゲームは自動で見つかる。

## ビルド・確認・デプロイ

```bash
npm run build          # hub + 全ゲームを dist/ に1つのサイトとして組み立てる
npm run preview        # dist/ を配信して確かめる
npm run typecheck      # 型チェック(CI でも実行)
npm test               # テスト(CI でも実行)
```

- `games.ts` で `hidden: true` にしたゲームは、ビルド・公開の対象から外れる(`npm run dev` では遊べる)。
- 開発・計測用の URL パラメータ(`?bench=1`・`?debug`・`?preview` など)は、本番のドメインでは開いたときに消える(`packages/shared/devParams.ts`)。ついている間は、ランキングにも登録しない。

## ベンチマーク

全ゲームの「場面」(ステージ × キャラクター × 時間帯など)を1つずつ開き、フレーム落ちの回数と原因(シェーダのコンパイル・テクスチャ転送・GC・JS・待ち)を測る。実機の GPU で測るので、画面を出して動かす。

```bash
npm run bench:all -- --list                                   # 場面の一覧
npm run bench:all -- --fullscreen --hz 60 --repeat-failed 3   # 合否の判定(全場面。時間がかかる)
npm run bench:all -- --games midnight-skyway --targets 'race-tsukikage_touge'   # 絞り込み
```

- 既定は Chrome だけ(本番は Windows の Chrome)。Firefox・Safari は推奨外のブラウザで、最低限の確認をするときだけ `--browsers chromium,firefox,safari` のように足す。
- 結果は `bench-results/<日時>/summary.md` と場面ごとの JSON。
- 場面はゲームが `declareBenchTargets()`(`packages/shared/arcadeBenchTargets.ts`)で申告し、着いたら `benchReady()`、やりきったら `benchDone()` を呼ぶ。
- シェーダのコンパイルで落ちた場面は `node scripts/shader-trace.mjs <chromium|firefox> <ゲーム> <場面>` で、いつどのシェーダを作ったかを出せる。
- テクスチャの送り方の速さは GPU の描画方式で逆になる(Windows の D3D11 と Mac の Metal)。新しい環境では `node scripts/upload-probe.mjs` で確かめる(midnight-skyway の `usesStripUpload`)。
- Safari は Mac で `--browsers safari` を付けたときに測る(`scripts/bench-safari.mjs`。safaridriver で本物の Safari を動かす)。初回だけ `sudo safaridriver --enable` と、Safari の設定 → デベロッパ →「リモートオートメーションを許可」。計測中は Safari の窓にもほかのアプリにも触らない(フルスクリーンの窓が裏に回ると描画が止まる)。`--sweep` は使えない。

**合否の基準**(`packages/shared/arcadeBenchCore.ts` の `ACCEPTANCE`)。全体の計測は筐体(Windows・Chrome・60Hz・フルHD)で行う。速いモニターでは `--hz 60` で 60Hz を再現する。

| 項目 | 基準 |
|---|---|
| プレイ中の 1%low | 55fps 以上 |
| プレイ中の p99 / 最長のフレーム | 20ms 以下 / 50ms 以下 |
| プレイ中のシェーダのコンパイル・テクスチャ転送によるカクつき | 0回 |
| 入力の遅延 p95 / 最大 | 50ms 以下 / 100ms 以下 |
| 読み込み中の停止 | 1回 1秒以下 |

基準まで 10% 以内は「すれすれ」。不合格とすれすれの場面は3回測って、項目ごとの中央値で決める。

## プレイの記録

管理画面(`/admin/`)で見る。

- **アナリティクス**(`packages/shared/arcadeAnalytics.ts`): 起動・場面の移り変わり・ラウンドの結果・離脱を送る。ゲームは `reportRoundStart()`・`reportPhase()`・`reportDeepAnalytics('progression_update', …)` を呼ぶ。
- **リプレイ**(`packages/shared/arcadeReplay.ts`): 映像ではなく、フレームの時刻・乱数の種・入力・タイマーの順番・サーバーの応答を記録し、ゲーム自身にもう一度動いてもらう。ランキングに載ったプレイの分だけ残し、管理画面からそのラウンドの頭から見る(cyber-2d-fighter-3d は対象外)。
  - 新しいゲームでは、`src/main.ts` の最初に `import '../../../shared/arcadeReplayBoot';`、`vite.config.ts` に `plugins: [replayDeterminism()]` を入れる。
  - 記録と再生を揃えるため、音の乱数は `audioRandom()`、終わる時刻が端末で変わる待ち(読み込みなど)は `replayBarrier(名前, Promise)`、ゲームの進みに関係ない裏方のタイマーとフレームは `untrackedTimeout`・`untrackedFrame`、処理時間を測るところは `realNow()` を使う。
  - ずれる原因を探すときは、記録する側の localStorage に `gc_replay_debug=1` を入れる(再生で最初に違った所を出す)。
  - 遊んでいない画面で3分操作がなければ、ゲームはハブへ戻る(`homeReturn.ts`)。
- **死亡地点マップ**: ゲームが `reportDeathPoint(図, x, y, 死因)` で送り、管理画面がステージの図の上に描く。図は `npm run deathmap` でゲームのコードから作る(`packages/server/src/deathMapGeometry.json`。ステージやコースを変えたら作り直す)。

## アケコン操作

ホーム画面からゲームの開始・終了まで、アケコン(Gamepad API の標準マッピング)だけで遊べる。レバーを矢印キー、ボタンを Enter/Space に割り当てる筐体でも動く。

| 場所 | 操作 |
| --- | --- |
| ホーム | レバーでゲームを選び、ボタン(0〜7・START)を離すと始まる |
| ゲーム中 | SELECT(button 8)か Backspace を1秒長押しでホームへ(短押しはメニューの「戻る」) |

ゲームパッドの操作はブラウザがユーザーの操作とみなさないので、筐体は自動再生を許したキオスクで起動する:

```bash
google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://game.hinata.works/
```

## 新しいゲームの追加

1. `packages/games/<slug>/` に Vite + TypeScript のプロジェクトを作る(既存のゲームの `package.json`・`vite.config.ts` を雛形に。`base: './'` にする)。
2. `src/main.ts` で `installHomeReturn()`(`packages/shared/homeReturn.ts`)を呼ぶ。プレイ中の Backspace は `ArcadePause`(`packages/shared/arcadePause.ts`)のポーズを開く。タイトル・開始・リトライはアケコンのボタンだけで操作できるようにする。
3. `packages/hub/src/games.ts` に足し、サムネイルを `packages/hub/public/thumbnails/<slug>.webp` に置く。
4. `npm install` → `npm run build` で確かめる。

## コミット・PR の規則

`.githooks/`(`npm install` で有効化)と CI(`npm run check:hygiene`)で自動検査する。

- **コミットメッセージ**: 1行目は `<type>(<scope>): <日本語の要約>`(Conventional Commits 形式 + 日本語)。本文を続けるときは1行空ける。
  - 使える `type`: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `style`, `build`, `ci`, `revert`, `security`, `bench`, `balance`
- **トレーラー**: `Co-Authored-By:` は可。`Claude-Session:` や `https://claude.ai/code/session_...` などのセッション URL・ID はコミットメッセージ・PR 本文・コメントすべてで記載しない。
- **プライベート情報の禁止**:
  - コード・スクリプト・ドキュメント・コミット・PR 本文に個人のローカルパス(`/Users/<user>/...`, `C:\Users\<user>\...`, `file:///Users/...`)を残さない。
  - Git の Author / Committer メールアドレスにローカルホスト名(`@*.local`)や個人のフリーメール(`@gmail.com` など)を使わず、GitHub の `users.noreply.github.com` またはプロジェクト用アドレスを使う。

