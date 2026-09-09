# Game Center

Three.js製ミニゲームを集めたハブ。npm workspacesによるモノレポ構成。

## 構成

```
gamecenter/
  packages/
    hub/                    # ゲーム選択画面 (トップページ)
    games/
      school-corridor-runner/
      extreme-edge-arcade/
  scripts/assemble.mjs      # 各パッケージのbuildをdist/に集約
  scripts/dev-all.mjs       # hub + 全ゲームのdevサーバーを一括起動
```

各ゲームは独立したVite + TypeScriptプロジェクト。hubはゲーム一覧を表示し、各ゲームへリンクするだけの薄いランディングページ。

## 開発

hub + 全ゲームのdevサーバーを一括起動する(ハブからゲームへのリンクも動作する)。

```bash
npm install
npm run dev
```

`http://localhost:5173/` がhub。各ゲームはそれぞれ別ポート(5180番台)のdevサーバーで起動し、hubの`/games/<slug>/`宛のリクエストは自動的にそのポートへプロキシされる(`scripts/dev-all.mjs`が各ゲームのポートをhubの`VITE_GAME_PORTS`環境変数として渡し、`packages/hub/vite.config.ts`がそれを見てプロキシ設定を組み立てる)。

1つのゲームだけ単体で開発したい場合:

```bash
npm run dev -w packages/games/school-corridor-runner
```

hub単体のプレビュー(この状態ではゲームへのリンクは404になる。ビルド後に確認するか`npm run dev`を使うこと):

```bash
npm run dev:hub
```

## ビルド・確認

hub + 全ゲームをビルドし、`dist/`以下に1つのサイトとして組み立てる。

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
```

## 新しいゲームの追加

1. `packages/games/<slug>/` に新しいVite+TypeScriptプロジェクトを作成する(既存ゲームの`package.json`/`vite.config.ts`を雛形にする)。
   - `vite.config.ts` に `base: './'` を設定すること(`dist/games/<slug>/` にネストして配置されるため)。
2. `packages/hub/src/games.ts` にエントリを追加する。
3. `npm install`(workspaceが自動検出される)→ `npm run build` で確認。

`packages/games/`配下のディレクトリは`npm run dev`実行時に自動検出されるため、devサーバー一括起動側の設定変更は不要。
