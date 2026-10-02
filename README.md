# Game Center

自作ミニゲームを集めたハブサイト。npm workspacesによるモノレポ構成。

## 構成

```
gamecenter/
  packages/
    hub/                      # ゲーム選択画面 (トップページ, Vite + TypeScript)
    games/
      school-corridor-runner/  # テンパレラン (Three.js)
      extreme-edge-arcade/     # 極限ギリギリ選手権 (Three.js)
      tani-runner-124/         # 単位増殖ラン (Three.js)
      phaser-fighter/          # STREET STRIKER（ストリートストライカー） (Phaser 3)
      ennichi-shateki/         # えんにち射的 (Three.js)
      street-b-boy/            # ストリートビーボーイ (Three.js)
      midnight-skyway/         # ミッドナイト・スカイウェイ (Three.js, 3Dレース / PLATEAU・ヘルシンキの3D都市モデル)
    shared/homeReturn.ts      # 全ゲーム共通: SELECT長押しでハブへ戻る
  scripts/assemble.mjs        # 各パッケージのbuildをdist/に集約
  scripts/dev-all.mjs         # hub + 全ゲームのdevサーバーを単一プロセス・単一ポートで起動
```

各ゲームは独立したVite + TypeScriptプロジェクト(描画はThree.jsまたはPhaser 3)。hubはゲーム一覧を表示し、各ゲームへリンクするだけの薄いランディングページ。ゲーム一覧・説明文は`packages/hub/src/games.ts`が唯一の情報源(single source of truth)。

## 開発

hub + 全ゲームのdevサーバーを一括起動する(ハブからゲームへのリンクも動作する)。

```bash
npm install
npm run dev
```

`http://localhost:5173/` がhub。hub・各ゲームはすべて単一のNodeプロセス・単一ポート(5173)で動く。`scripts/dev-all.mjs`がhubと各ゲームそれぞれのVite devサーバーをmiddlewareModeで生成し、`connect`で`/games/<slug>/`ごとにマウントしている(各インスタンスは独立したモジュールグラフ・HMRを持つため、あるゲームの変更が他ゲームやhubに影響することはない)。

1つのゲームだけ単体で開発したい場合:

```bash
npm run dev -w packages/games/phaser-fighter
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
```

出力レイアウト:

```
dist/
  index.html        # hub
  games/
    school-corridor-runner/
    extreme-edge-arcade/
    tani-runner-124/
    phaser-fighter/
    ennichi-shateki/
    street-b-boy/
    midnight-skyway/
```

## デプロイ

https://game.hinata.works/ で公開している。

```bash
```


## アケコン操作

ホーム画面からゲームの開始・終了までアケコン(Gamepad API標準マッピング)だけで完結する。レバーを矢印キー、ボタンをEnter/Spaceに割り当てるキーボードエンコーダ式の筐体でも操作できる。

| 場所 | 操作 |
| --- | --- |
| ホーム | レバー: ゲームを選ぶ / ボタン(0〜7, START): 離した瞬間にゲーム開始 |
| ゲーム中 | SELECT(button 8)を1秒長押し: ホームへ戻る(キーボードはEsc) |

- ゲームから戻ると、直前に遊んだゲームが選択された状態で表示される。
- ブラウザはゲームパッド操作をユーザー操作とみなさないため、アケコンだけで遊ぶと音が鳴らず全画面にもならない。筐体では自動再生を許可したキオスクモードで起動すること:
  ```bash
  google-chrome --kiosk --autoplay-policy=no-user-gesture-required https://game.hinata.works/
  ```

## 新しいゲームの追加

1. `packages/games/<slug>/` に新しいVite+TypeScriptプロジェクトを作成する(既存ゲームの`package.json`/`vite.config.ts`を雛形にする)。
   - `vite.config.ts` に `base: './'` を設定すること(`dist/games/<slug>/` にネストして配置されるため)。
2. エントリ(`src/main.ts`)で `installHomeReturn()`(`packages/shared/homeReturn.ts`)を呼び、SELECT長押しでホームへ戻れるようにする。タイトル・開始・リトライはアケコンのボタンだけで操作できるようにすること。
3. `packages/hub/src/games.ts` にエントリを追加する(タイトル・説明文・サムネイル画像・アクセントカラー)。サムネイルは `packages/hub/public/thumbnails/<slug>.webp` に置く。
4. `npm install`(workspaceが自動検出される)→ `npm run build` で確認。

`packages/games/`配下のディレクトリは`npm run dev`実行時に自動検出されるため、devサーバー一括起動側の設定変更は不要。
