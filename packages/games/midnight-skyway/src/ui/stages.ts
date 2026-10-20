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
  { id: 'tsukikage_touge', title: '月影・湯元 峠ダウンヒル', sub: '複合つづら折り・温泉街渓谷', length: '2.7 km', stars: '★★★★★', tag: '側溝走り&連続S字' },
  { id: 'tokyo_climb', title: '東京 スカイクライム', sub: '超高層を駆け上がる', length: '4.4 km', stars: '★★★★★', tag: '超高層まで登る' },
];

export const stageNumber = (id: string): number => STAGES.findIndex((s) => s.id === id) + 1;
