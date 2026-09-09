export interface StageDef {
  caseName: string;
  evidence: string;
  dummyTestimonies: string[];
  contradiction: string;
}

export const STAGES: StageDef[] = [
  {
    caseName: '冷蔵庫プリン消失事件',
    evidence: '黄色いスプーン',
    dummyTestimonies: ['ずっと勉強してた', '購買のパン食べた', '甘いもの嫌い'],
    contradiction: 'スプーンなんて持ってない',
  },
  {
    caseName: '理科室フラスコ爆破事件',
    evidence: '焦げた前髪',
    dummyTestimonies: ['火なんか使ってない', '掃除してただけ', '薬品触ってない'],
    contradiction: '爆発の瞬間は見てない',
  },
  {
    caseName: '期末テスト解答盗難事件',
    evidence: '右手のチョーク汚れ',
    dummyTestimonies: ['朝から寝てた', '自分の力で解いた', '職員室は入ってない'],
    contradiction: '黒板の文字は見てない',
  },
];

export const STAGE_TIME_LIMIT = 20.0;
export const GAVEL_BONUS_DURATION = 3.0;
export const PENALTY_SECONDS = 3.0;

export interface InputState {
  moveX: number;
  moveY: number;
  actionPressed: boolean;
  actionJustPressed: boolean;
  hasGamepad: boolean;
}
