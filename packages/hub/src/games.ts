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
  // ハブでどのグループに入れるか(遊び方のスタイル。1つのゲームは1つのグループにだけ入る)
  group: GroupId;
  // オンライン対戦に対応しているか(開催中かどうかは、サーバーに問い合わせて別に調べる)
  online?: boolean;
  // true にするとハブ(ピックアップ・一覧)に表示しない。ゲーム本体のビルド・配信はそのまま。
  hidden?: boolean;
}

/** ハブのグループ(遊び方のスタイル) */
export type GroupId = 'easy' | 'party' | 'score' | 'hard';

export interface GroupDef {
  id: GroupId;
  title: string;
  /** 見出しの横に出す、ひとこと */
  note: string;
}

/**
 * グループの固定の並び順(初めての人が、上からやさしい順に遊べる流れ)。
 * 画面には、ロードのたびにランダムで選んだ1グループを一番上に上げて、残りをこの順番で並べる(main.ts)。
 */
export const GROUPS: readonly GroupDef[] = [
  { id: 'easy', title: 'かんたん操作', note: 'ボタンひとつで、すぐ遊べる' },
  { id: 'party', title: 'みんなでワイワイ', note: 'オンラインで、友だちと' },
  { id: 'score', title: 'ハイスコアで勝負', note: 'ランキングの1位を狙え' },
  { id: 'hard', title: '高難易度に挑戦', note: '腕に自信のある人向け' },
];

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
    slug: 'midnight-skyway',
    title: 'ミッドナイト・スカイウェイ',
    englishTitle: 'MIDNIGHT SKYWAY: TIME ATTACK',
    description:
      '夜の高架高速を走るタイムアタック。PLATEAUの3D都市モデルで作ったヘルシンキと東京・丸の内を、好きなマシンで駆け抜けよう。オンラインなら最大4人でレース！',
    thumbnail: 'thumbnails/midnight-skyway.webp',
    logo: 'logos/midnight-skyway.webp',
    accent: '#00e5ff',
    group: 'party',
    online: true,
    developer: XXXXHOLICA,
  },
  {
    slug: 'cyber-2d-fighter-3d',
    title: 'サイバー２Dファイター３D',
    englishTitle: 'CYBER 2D FIGHTER 3D',
    description: '3Dキャラクターで戦う横視点の対戦格闘。4人のファイターから選び、6ボタンの攻撃と必殺技で勝負！CPU戦・練習・開催中のオンライン対戦に対応。',
    thumbnail: 'thumbnails/cyber-2d-fighter-3d.webp',
    logo: 'logos/cyber-2d-fighter-3d.webp',
    accent: '#b544ff',
    group: 'party',
    online: true,
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
    group: 'party',
    online: true,
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
    group: 'hard',
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
    group: 'hard',
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
    group: 'easy',
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
    group: 'score',
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
    group: 'easy',
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
    group: 'score',
    developer: KURENAI_BEAT,
  },
  {
    slug: 'tower-stack',
    title: 'グラグラタワー',
    englishTitle: 'TOWER STACK',
    description:
      '落ちてくるブロックを積み上げて高さを競う物理パズル。3個落としたらゲームオーバー。突風やいん石をアイテムで乗り越えて、限界の高さに挑戦しよう。',
    thumbnail: 'thumbnails/tower-stack.webp',
    logo: 'logos/tower-stack.webp',
    accent: '#ffd166',
    group: 'party',
    online: true,
    developer: THOUSANDL000,
  },
  {
    slug: 'falldown',
    title: '無限降下ドリル',
    englishTitle: 'FALL DOWN',
    description:
      'ブロックを掘り進めて地下500mの黄金郷を目指せ！同じ色はまとめて壊れるけど、支えを失ったブロックは落ちてくる。酸素カプセルを拾いながら、潰されずにどこまで潜れるか。',
    thumbnail: 'thumbnails/falldown.webp',
    logo: 'logos/falldown.webp',
    accent: '#ff8a3d',
    group: 'hard',
    developer: THOUSANDL000,
  },
];

export const games: GameEntry[] = allGames.filter((game) => !game.hidden);

// 非表示のゲームはビルド・配置の対象からも外す(scripts/build.mjs・scripts/assemble.mjs が参照する)
export const hiddenSlugs: string[] = allGames.filter((game) => game.hidden).map((game) => game.slug);
