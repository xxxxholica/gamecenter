/** The stages of the game in on-screen order (left to right): one source for the course select, the loading screen and the records. */
export interface StageInfo {
  id: string;
  title: string;
  sub: string;
  length: string;
  stars: string;
  /** Short highlight shown as a tag on the card. */
  tag: string;
}

export const STAGES: StageInfo[] = [
  { id: 'tokyo_skyway', title: '東京 丸の内スカイウェイ', sub: '神田橋・八重洲バイパス経由', length: '2.40 km', stars: '★★☆☆☆', tag: '初心者向け' },
  { id: 'helsinki_technical', title: 'ヘルシンキ ハーバーリッジ', sub: 'テクニカル・アップダウン', length: '2.1 km', stars: '★★★★☆', tag: '急カーブ&起伏' },
  { id: 'tokyo_climb', title: '東京 スカイクライム', sub: '超高層を駆け上がる', length: '4.4 km', stars: '★★★★★', tag: '超高層まで登る' },
];

export const stageNumber = (id: string): number => STAGES.findIndex((s) => s.id === id) + 1;
