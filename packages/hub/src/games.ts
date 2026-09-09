// Single source of truth for the hub's game list.
// To add a new game: create packages/games/<slug>, then add an entry here.
export interface GameEntry {
  slug: string;
  title: string;
  // ゲーム内ロゴ表記そのままの英語タイトル
  englishTitle: string;
  description: string;
  // packages/hub/public/demos/<slug>.gif に配置したプレイ映像
  demo: string;
  // 筐体の縁・ホバー時に光るネオンカラー(そのゲーム自身のキーカラーに合わせる)
  accent: string;
}

// この配列の順番がそのままピックアップの巡回順・一覧の表示順になる。
export const games: GameEntry[] = [
  {
    slug: 'school-corridor-runner',
    title: '学園脱出ラン',
    englishTitle: 'TEMPALE RUN',
    description:
      '放課後の校舎を全力疾走。追いかけてくる先生の目を盗み、手裏剣と辞書ボムで妨害物を破壁しながら校門突破を目指すエンドレスランナー。',
    demo: 'demos/school-corridor-runner.gif',
    accent: '#ffb100',
  },
  {
    slug: 'extreme-edge-arcade',
    title: '極限ギリギリ選手権',
    englishTitle: 'EXTREME GIRI-GIRI ARCADE',
    description:
      'ドリンクバー、目覚まし時計、スマホ充電など、日常に潜む「ギリギリ」を攻略する連続チャレンジ。絶妙なタイミングでハイスコアを狙え。',
    demo: 'demos/extreme-edge-arcade.gif',
    accent: '#ff2b4d',
  },
  {
    slug: 'tani-runner-124',
    title: '単位増殖ラン',
    englishTitle: 'TANI RUNNER 124',
    description:
      '微積分・線形代数のゲートを潜り抜けて単位を増殖させ、卒業要件124単位を目指す群衆ランナー。青ゲートで爆増、赤ゲートで激減。最後は余剰単位を射出してボーナス倍率を稼げ。',
    demo: 'demos/tani-runner-124.gif',
    accent: '#ffe600',
  },
  {
    slug: 'classroom-trial-blitz',
    title: '超速学級裁判',
    englishTitle: 'OBJECTION BLITZ',
    description:
      '飛来する証言の中から矛盾を撃ち抜け。「異議あり！」で正解を撃てば「論破」、木槌連打でボーナス加算。全3事件を撃破して被告を「有罪」に追い込む一人称法廷シューティング。',
    demo: 'demos/classroom-trial-blitz.gif',
    accent: '#ff1a1a',
  },
  {
    slug: 'office-chair-gp',
    title: '爆走！グラウンド事務椅子GP',
    englishTitle: 'GROUND DRIFT RACER',
    description:
      '事務椅子でグラウンドを爆走するドリフトレース。消火器ジェットで急加速、足ブレーキでターン、ボンベ投擲で前方のライバルを妨害。土煙を巻き上げて1位でゴールを目指せ。',
    demo: 'demos/office-chair-gp.gif',
    accent: '#00ffcc',
  },
];
