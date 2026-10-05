// Single source of truth for the hub's game list.
// To add a new game: create packages/games/<slug>, then add an entry here.
export interface Developer {
  name: string;
  url: string;
  avatar: string;
}

export interface GameEntry {
  slug: string;
  title: string;
  // ゲーム内ロゴ表記そのままの英語タイトル
  englishTitle: string;
  description: string;
  // packages/hub/public/thumbnails/<slug>.webp に配置したサムネイル画像
  thumbnail: string;
  // packages/hub/public/logos/<slug>.webp に配置したタイトルロゴ画像(オプショナル)
  logo?: string;
  // 筐体の縁・ホバー時に光るネオンカラー(そのゲーム自身のキーカラーに合わせる)
  accent: string;
  developer: Developer;
  // true にするとハブ(ピックアップ・一覧)に表示しない。ゲーム本体のビルド・配信はそのまま。
  hidden?: boolean;
}

// GitHubのアイコンは `github.com/<user>.png` で本人のアバターにリダイレクトされる。
const XXXXHOLICA: Developer = {
  name: 'xxxxholica',
  url: 'https://github.com/xxxxholica',
  avatar: 'https://github.com/xxxxholica.png',
};

const KURENAI_BEAT: Developer = {
  name: 'KURENAI-beat',
  url: 'https://github.com/KURENAI-beat',
  avatar: 'https://github.com/KURENAI-beat.png',
};

// この配列の順番がそのままピックアップの巡回順・一覧の表示順になる。
const allGames: GameEntry[] = [
  {
    slug: 'phaser-fighter',
    title: 'ストリートストライカー',
    englishTitle: 'STREET STRIKER',
    description:
      '本格2D対戦格闘ゲーム。弱・中・強の通常技と投げに加え、ブレイクショック、パリィ、強化技、超必殺技を駆使して戦う。個性豊かな6人のファイターから選び、CPU戦や2P対戦で白熱の攻防を繰り広げろ！',
    thumbnail: 'thumbnails/phaser-fighter.webp',
    logo: 'logos/phaser-fighter.webp',
    accent: '#00f0ff',
    developer: KURENAI_BEAT,
  },
  {
    slug: 'school-corridor-runner',
    title: 'テンパレラン',
    englishTitle: 'TEMPALE RUN',
    description:
      '放課後の校舎を全力疾走。追いかけてくる先生の目を盗み、手裏剣と辞書ボムで妨害物を破壁しながら校門突破を目指すエンドレスランナー。廊下に潜む罠や障害物をかわして距離を稼ぎ、パワーアップを拾ってハイスコアに挑め。',
    thumbnail: 'thumbnails/school-corridor-runner.webp',
    logo: 'logos/school-corridor-runner.webp',
    accent: '#ffb100',
    developer: XXXXHOLICA,
  },
  {
    slug: 'midnight-skyway',
    title: 'ミッドナイト・スカイウェイ',
    englishTitle: 'MIDNIGHT SKYWAY: TIME ATTACK',
    description:
      '夜の都市に浮かぶ架空の高架高速を駆け抜けるタイムアタック。PLATEAUの3D都市モデルで再現したヘルシンキと東京丸の内の2ステージを、3台のマシンから選んで走り、自己ベストを更新しろ。',
    thumbnail: 'thumbnails/midnight-skyway.webp',
    logo: 'logos/midnight-skyway.webp',
    accent: '#00e5ff',
    developer: XXXXHOLICA,
  },
  {
    slug: 'tani-runner-124',
    title: '単位増殖ラン',
    englishTitle: 'TANI RUNNER 124',
    description:
      '微積分・線形代数のゲートを潜り抜けて単位を増殖させ、卒業要件124単位を目指す群衆ランナー。青ゲートで爆増、赤ゲートで激減。最後は余剰単位を射出してボーナス倍率を稼げ。',
    thumbnail: 'thumbnails/tani-runner-124.webp',
    logo: 'logos/tani-runner-124.webp',
    accent: '#ffe600',
    developer: XXXXHOLICA,
  },
  {
    slug: 'ennichi-shateki',
    title: 'えんにち射的',
    englishTitle: 'ARCADE CORK SHOOTER',
    description:
      'むげん連射のお祭りアクション。コルク銃を撃ちまくって縁日の屋台に並ぶ景品を狙い撃ち、爆弾で一掃コンボも決めろ。制限時間内に獲得した景品の総重量でハイスコアを競う射的シューティング。',
    thumbnail: 'thumbnails/ennichi-shateki.webp',
    logo: 'logos/ennichi-shateki.webp',
    accent: '#ff8c00',
    developer: XXXXHOLICA,
  },
  {
    slug: 'extreme-edge-arcade',
    title: '極限ギリギリ選手権',
    englishTitle: 'EXTREME GIRI-GIRI ARCADE',
    description:
      'ドリンクバー、目覚まし時計、スマホ充電など、日常に潜む「ギリギリ」を攻略する連続チャレンジ。レバー上だけのシンプルな操作で、あふれる寸前・止まる寸前の絶妙なタイミングを狙い、「ギリギリ度」の偏差値で競え。',
    thumbnail: 'thumbnails/extreme-edge-arcade.webp',
    logo: 'logos/extreme-edge-arcade.webp',
    accent: '#ff2b4d',
    developer: XXXXHOLICA,
  },
  {
    slug: 'street-b-boy',
    title: 'ストリートビーボーイ',
    englishTitle: 'STREET B-BOY',
    description:
      'ブレイクダンス少年が街を駆け抜けるアーケード2.5Dプラットフォーマー。スピン攻撃で段ボールやレーザーを蹴散らし、レールグラインドやサブウーファーのバウンドを駆使してゴールドカセットを狙え。',
    thumbnail: 'thumbnails/street-b-boy.webp',
    logo: 'logos/street-b-boy.webp',
    accent: '#ffea00',
    developer: XXXXHOLICA,
  },
];

export const games: GameEntry[] = allGames.filter((game) => !game.hidden);

// 非表示のゲームはビルド・配置の対象からも外す(scripts/build.mjs・scripts/assemble.mjs が参照する)
export const hiddenSlugs: string[] = allGames.filter((game) => game.hidden).map((game) => game.slug);
