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

const THOUSANDL000: Developer = {
  name: 'thousandl000',
  url: 'https://github.com/thousandl000',
  avatar: 'https://github.com/thousandl000.png',
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
      'パンチやキックで戦う2D対戦格闘ゲーム。個性いっぱいの6人から好きなファイターを選んで、CPUや友だちと1対1で勝負しよう。必殺技が決まると気持ちいい！',
    thumbnail: 'thumbnails/phaser-fighter.webp',
    logo: 'logos/phaser-fighter.webp',
    accent: '#00f0ff',
    developer: KURENAI_BEAT,
  },
  {
    slug: 'sumo-smash-3d',
    title: '剛体大相撲',
    englishTitle: 'SUMO SMASH 3D',
    description:
      'ぶつかって、つかんで、土俵の外へ押し出せ！ひとりならCPUと取り組み、オンラインなら最大4人で大乱闘。ふっ飛ばされる悔しさも楽しさのうち。',
    thumbnail: 'thumbnails/sumo-smash-3d.webp',
    logo: 'logos/sumo-smash-3d.webp',
    accent: '#e63946',
    developer: THOUSANDL000,
  },
  {
    slug: 'school-corridor-runner',
    title: 'テンパレラン',
    englishTitle: 'TEMPALE RUN',
    description:
      '放課後の校舎をダッシュ！追いかけてくる先生から逃げながら、手裏剣や辞書ボムで障害物を吹き飛ばそう。どこまで走れるかハイスコアに挑戦。',
    thumbnail: 'thumbnails/school-corridor-runner.webp',
    logo: 'logos/school-corridor-runner.webp',
    accent: '#ffb100',
    developer: XXXXHOLICA,
  },
  {
    slug: 'street-b-boy',
    title: 'ストリートビーボーイ',
    englishTitle: 'STREET B-BOY',
    description:
      'ブレイクダンスの少年が街を駆け抜けるアクション。回転で障害物を蹴散らして、レールをすべり、スピーカーで跳ねて、ゴールドカセットを集めよう。',
    thumbnail: 'thumbnails/street-b-boy.webp',
    logo: 'logos/street-b-boy.webp',
    accent: '#ffea00',
    developer: XXXXHOLICA,
  },
  {
    slug: 'midnight-skyway',
    title: 'ミッドナイト・スカイウェイ',
    englishTitle: 'MIDNIGHT SKYWAY: TIME ATTACK',
    description:
      '夜の高架高速を走るタイムアタック。PLATEAUの3D都市モデルで作ったヘルシンキと東京・丸の内を、好きなマシンで駆け抜けよう。オンラインなら最大4人でレース！',
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
      'ゲートをくぐって単位を増やし、卒業に必要な124単位を目指そう。青いゲートで一気に増えて、赤いゲートは減ってしまう。最後は余った単位を発射してボーナス！',
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
      'お祭りの屋台で、コルク銃を撃ちまくる射的ゲーム。景品をたくさん撃ち落として、集めた重さでハイスコアを競おう。爆弾で一気に倒すとスカッとする！',
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
      'ドリンクを注ぐ、時計を止める、風船をふくらませる…。日常のちょっとしたギリギリを、ボタンひとつのタイミングで攻めよう。あふれる寸前、割れる寸前が勝負！',
    thumbnail: 'thumbnails/extreme-edge-arcade.webp',
    logo: 'logos/extreme-edge-arcade.webp',
    accent: '#ff2b4d',
    developer: XXXXHOLICA,
  },
  {
    slug: 'survivor-score-battle',
    title: 'サバイバー・スコアバトル',
    englishTitle: 'SURVIVOR SCORE BATTLE',
    description:
      '自分ひとり対CPU7人のサバイバル。回るブレードで敵を倒して、フィールドの剣を奪い合おう。ボスも登場。どこまで生き残ってスコアを伸ばせるか！',
    thumbnail: 'thumbnails/survivor-score-battle.webp',
    logo: 'logos/survivor-score-battle.webp',
    accent: '#00e5ff',
    developer: KURENAI_BEAT,
  },
  {
    slug: 'tower-stack',
    title: 'グラグラタワー',
    englishTitle: 'TOWER STACK',
    description:
      '落ちてくるブロックを積み上げて高さを競う物理パズル。3個落としたらゲームオーバー。突風やいん石などの邪魔イベントを、ツタ・セメント・バリア・回復のアイテムで乗り切れ。',
    thumbnail: 'thumbnails/tower-stack.webp',
    logo: 'logos/tower-stack.webp',
    accent: '#ffd166',
    developer: THOUSANDL000,
  },
];

export const games: GameEntry[] = allGames.filter((game) => !game.hidden);

// 非表示のゲームはビルド・配置の対象からも外す(scripts/build.mjs・scripts/assemble.mjs が参照する)
export const hiddenSlugs: string[] = allGames.filter((game) => game.hidden).map((game) => game.slug);
