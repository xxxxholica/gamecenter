# Game Center

自作ミニゲームを集めたハブサイト。npm workspacesによるモノレポ構成。

## 構成

```
gamecenter/
  packages/
    hub/                      # ゲーム選択画面 (トップページ, Vite + TypeScript)
    games/
      cyber-2d-fighter-3d/      # サイバー２Dファイター３D (Three.js, 3D格闘 / CPU・練習・オンライン)
      school-corridor-runner/  # テンパレラン (Three.js)
      extreme-edge-arcade/     # 極限ギリギリ選手権 (Three.js)
      tani-runner-124/         # 単位増殖ラン (Three.js)
      ennichi-shateki/         # えんにち射的 (Three.js)
      street-b-boy/            # ストリートビーボーイ (Three.js)
      midnight-skyway/         # ミッドナイト・スカイウェイ (Three.js, 3Dレース / PLATEAU・ヘルシンキの3D都市モデル)
      falldown/                # 無限降下ドリル FALL DOWN (Three.js, 3D掘削アクションパズル)
    shared/homeReturn.ts      # 全ゲーム共通: 戻る操作(Backspace / アケコンのSELECT)の統一、Escapeの無効化、ハブへ戻る処理
    shared/arcadePause.ts     # 全ゲーム共通: プレイ中のポーズ画面(再開 / やり直す / ゲームを終了)
  scripts/assemble.mjs        # 各パッケージのbuildをdist/に集約
  scripts/dev-all.mjs         # hub + 全ゲームのdevサーバーを単一プロセス・単一ポートで起動
```

各ゲームは独立したVite + TypeScriptプロジェクト(描画はThree.js)。hubはゲーム一覧を表示し、各ゲームへリンクするだけの薄いランディングページ。ゲーム一覧・説明文は`packages/hub/src/games.ts`が唯一の情報源(single source of truth)。

## 開発

hub + 全ゲームのdevサーバーを一括起動する(ハブからゲームへのリンクも動作する)。

```bash
npm install
npm run dev
```

`http://localhost:5173/` がhub。hub・各ゲームはすべて単一のNodeプロセス・単一ポート(5173)で動く。`scripts/dev-all.mjs`がhubと各ゲームそれぞれのVite devサーバーをmiddlewareModeで生成し、`connect`で`/games/<slug>/`ごとにマウントしている(各インスタンスは独立したモジュールグラフ・HMRを持つため、あるゲームの変更が他ゲームやhubに影響することはない)。

1つのゲームだけ単体で開発したい場合:

```bash
npm run dev -w packages/games/street-b-boy
```

hub単体のプレビュー(この状態ではゲームへのリンクは404になる。ビルド後に確認するか`npm run dev`を使うこと):

```bash
npm run dev:hub
```

## ビルド・確認

hub + 全ゲームをビルドし、`dist/`以下に1つのサイトとして組み立てる(`scripts/build.mjs`)。
`packages/hub/src/games.ts` で `hidden: true` にしたゲームはビルド・配置の対象外になり、公開サイトからも読み込めなくなる(`npm run dev` では引き続き遊べる)。

```bash
npm run build
npm run preview   # dist/ を配信して確認
npm run typecheck  # 全パッケージの型チェック(CI でも実行)
npm test           # 全パッケージのテスト(CI でも実行)
```

出力レイアウト:

```
dist/
  index.html        # hub
  games/
    school-corridor-runner/
    extreme-edge-arcade/
    tani-runner-124/
    ennichi-shateki/
    street-b-boy/
    midnight-skyway/
    falldown/
```

## ベンチマーク

全ゲームの「場面」(ステージ × キャラクター × 時間帯 など)を1つずつ自動で開き、フレーム落ちの回数と原因(シェーダのコンパイル・テクスチャ転送・GC・JS・待ち)を測る。実機の GPU で測るため、ヘッドレスではなく画面を出して動かす(ウィンドウを隠さない)。

```bash
npm run bench:all -- --list                       # 計測する場面の一覧だけ出す
npm run bench:all                                 # Chrome + Firefox で全ゲームの全場面(時間がかかる)
npm run bench:all -- --games midnight-skyway --targets 'race-helsinki.*night'   # ゲーム・場面(idの正規表現)で絞る
npm run bench:all -- --cap 20                     # どの場面も最長20秒で打ち切る(動作確認用)
npm run bench:all -- --url http://localhost:5173  # npm run dev で配信中のものを測る
npm run bench:all -- --viewport 1920x1080         # 画面の大きさを変える(既定 1280x720。筐体のフルHDなど)
npm run bench:all -- --fullscreen                 # 画面いっぱいの大きさで測る(Chrome はキオスク表示、Firefox は画面と同じ大きさのページ)
npm run bench:all -- --hz 60                      # ゲームに渡すフレームを 60Hz に間引き、60Hz のモニターでの動きを再現する
npm run bench:all -- --fullscreen --hz 60 --repeat-failed 3   # 合否の判定(不合格・すれすれの場面は3回測って中央値)
```

結果は `bench-results/<日時>/summary.md`(合否、悪い場面の上位、ゲームごとの表)と、場面ごとの詳細 JSON。1場面は「読み込み」(場面に着くまで)と「プレイ中」に分けて集計する。表の「終了」は、ゲームが知らせた終わり方(clear / game-over など。「上限」は秒数いっぱいまで測った)。想定より早い game-over は、その先(後半・ボス・結果の演出)を測れていない印。「入力」は、入力が届いてから画面に出るまでの時間(数百msおきの模擬の入力。ランダム入力の場面は実際のキー入力も)。アケコン(ゲームパッド)の読み取りやモニター内部の遅れは含まない。

- 場面の一覧は、各ゲームが `declareBenchTargets()`(`packages/shared/arcadeBenchTargets.ts`)で申告する。ステージ表などのゲームのデータから作るので、ステージを足せば計測対象も増える。
- 場面は URL で指定して直接始める(例: `?bench=1&scene=race&stage=helsinki_technical&car=dragon_b&tod=night`)。操作は、ゲーム自身の自動操縦(`self`)、何もしない(`idle`)、スクリプトのランダム入力(`random`)のどれか。
- 場面に着いたら `benchReady()`、やりきったら `benchDone()` を呼ぶ。新しいゲームでは、`installHomeReturn()` のあとで場面を申告するだけでよい。
- 「shader-compile」のスパイクが出た場面は、`node scripts/shader-trace.mjs <chromium|firefox> <ゲーム> <場面のid> [秒数]` で、どのシェーダ(種類と `USE_MAP`・`DOUBLE_SIDED` などの機能)をいつ作ったかを出せる。場面に着いたあとに出たものが、プレイ中に初めて作られたシェーダ(先に `npm run build`)。
- サイバー２Dファイター３Dはベンチマークの対象外。代わりに検証用に、`?verify&p1=char2&p2=char3&stage=neon_shrine.jpg` でステージ・キャラクターを指定して、CPU 同士の対戦(HUDあり・体力は減らない)を始められる。

### 合否の基準

筐体(60Hz・フルHD)に合わせ、Chrome と Firefox の両方で、画面いっぱい・60Hz の再現で測る。開発機のモニターが 60Hz より速いときは `--hz 60` で再現する(ゲームに渡す rAF を 60Hz の区切りで間引くので、区切りに間に合わなかったフレームは垂直同期と同じく 33.3ms・50ms の間隔になる)。基準は `packages/shared/arcadeBenchCore.ts` の `ACCEPTANCE`。

| 項目 | 基準 |
|---|---|
| プレイ中の 1%low | 55fps 以上 |
| プレイ中の p99 / 最長のフレーム | 20ms 以下 / 50ms 以下 |
| プレイ中のシェーダのコンパイル・テクスチャ転送によるカクつき | 0回 |
| 入力の遅延 p95 / 最大 | 50ms 以下 / 100ms 以下 |
| 読み込み中の停止 | 1回 1秒以下 |

- 基準まで 10% 以内(1%low は 57.5fps 未満)は「すれすれ」。不合格とすれすれの場面は3回測り、項目ごとの中央値で決める。
- 60Hz の 1%low は、遅れたフレームが 0.1% を超えると 55fps を下回る(1回遅れるごとに 16.7ms 余分にかかるため)。
- 60Hz の再現は、ゲームの JS の処理時間は正確に数える。GPU の描画の遅れは、モニターのフレームが遅れた分として数えるので、モニターの1フレーム分(165Hz で約6ms)までの遅れは見逃す。
- ブラウザ・端末の側が原因で、ゲームでは直せないものは、合否から外して理由を残す。

## デプロイ

https://game.hinata.works/ で公開している。

```bash
```


## ランキング(サーバー保存)

各ゲームのランキング(上位5件)と、midnight-skywayのゴースト(走行の軌跡)は、ブラウザではなくサーバーに保存する。オンライン対戦サーバー(`packages/server`)と同じNodeプロセスが `/api/...` で受け付ける。

- `npm run dev` は `/api` を同じポート(5173)のまま、開発用のサーバーへ中継する。記録は `packages/server/data/leaderboard.json`(Git管理外)に保存される。消せば空に戻る。
- ブラウザ側は `packages/shared/arcadeLeaderboard.ts`(HTTPクライアント)、順位判定などの純粋ロジックは `arcadeLeaderboardCore.ts`(サーバーと共有)。
- 自己ベスト(midnight-skyway)と、音量・難易度などの端末ごとの設定は、これまでどおりlocalStorage。

## アケコン操作

ホーム画面からゲームの開始・終了までアケコン(Gamepad API標準マッピング)だけで完結する。レバーを矢印キー、ボタンをEnter/Spaceに割り当てるキーボードエンコーダ式の筐体でも操作できる。

| 場所 | 操作 |
| --- | --- |
| ホーム | レバー: ゲームを選ぶ / ボタン(0〜7, START): 離した瞬間にゲーム開始 |
| ゲーム中 | SELECT(button 8)またはキーボードのBackspaceを1秒長押し: ホームへ戻る(短押しはメニューの「戻る」) |

- ゲームから戻ると、直前に遊んだゲームが選択された状態で表示される。
- ブラウザはゲームパッド操作をユーザー操作とみなさないため、アケコンだけで遊ぶと音が鳴らず全画面にもならない。筐体では自動再生を許可したキオスクモードで起動すること:
  ```bash
  google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://game.hinata.works/
  ```

## 新しいゲームの追加

1. `packages/games/<slug>/` に新しいVite+TypeScriptプロジェクトを作成する(既存ゲームの`package.json`/`vite.config.ts`を雛形にする)。
   - `vite.config.ts` に `base: './'` を設定すること(`dist/games/<slug>/` にネストして配置されるため)。
2. エントリ(`src/main.ts`)で `installHomeReturn()`(`packages/shared/homeReturn.ts`)を呼び、戻る操作を Backspace(アケコンは SELECT)に統一する(Escape は無効になる)。タイトルの Backspace はホームへ戻り、メニューでは一つ前へ戻り、プレイ中は `ArcadePause`(`packages/shared/arcadePause.ts`)のポーズ画面を開く。タイトル・開始・リトライはアケコンのボタンだけで操作できるようにすること。
3. `packages/hub/src/games.ts` にエントリを追加する(タイトル・説明文・サムネイル画像・アクセントカラー)。サムネイルは `packages/hub/public/thumbnails/<slug>.webp` に置く。
4. `npm install`(workspaceが自動検出される)→ `npm run build` で確認。

`packages/games/`配下のディレクトリは`npm run dev`実行時に自動検出されるため、devサーバー一括起動側の設定変更は不要。
