# Game Center

自作ミニゲームを集めたハブサイト。npm workspacesによるモノレポ構成。

## 構成

```
gamecenter/
  packages/
    hub/                      # ゲーム選択画面 (トップページ, Vite + TypeScript)
    games/
      school-corridor-runner/  # 学園脱出ラン (Three.js)
      extreme-edge-arcade/     # 極限ギリギリ選手権 (Three.js)
      tani-runner-124/         # 単位増殖ラン (Three.js)
      classroom-trial-blitz/   # 超速学級裁判 (Three.js)
      office-chair-gp/         # 爆走！グラウンド事務椅子GP (Three.js)
      phaser-fighter/          # サイバー2Dファイター (Phaser 3)
      ennichi-shateki/         # えんにち射的 (Three.js)
      street-b-boy/            # ストリートビーボーイ (Three.js)
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
    tani-runner-124/
    classroom-trial-blitz/
    office-chair-gp/
    phaser-fighter/
    ennichi-shateki/
    street-b-boy/
```

## 新しいゲームの追加

1. `packages/games/<slug>/` に新しいVite+TypeScriptプロジェクトを作成する(既存ゲームの`package.json`/`vite.config.ts`を雛形にする)。
   - `vite.config.ts` に `base: './'` を設定すること(`dist/games/<slug>/` にネストして配置されるため)。
2. `packages/hub/src/games.ts` にエントリを追加する(タイトル・説明文・デモGIF・アクセントカラー)。
3. `npm install`(workspaceが自動検出される)→ `npm run build` で確認。

`packages/games/`配下のディレクトリは`npm run dev`実行時に自動検出されるため、devサーバー一括起動側の設定変更は不要。
