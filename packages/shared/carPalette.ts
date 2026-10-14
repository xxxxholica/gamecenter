// マシンの色パレット(クライアントの選択画面とオンライン対戦サーバーの両方が使う)。
// オンライン対戦では「他の参加者と body の色が被らない」ことをサーバーがこのパレットで判定する。
// Nodeの型ストリップで直接実行されるため、ランタイム構文は使わない(enum等)。

export type CarType = 'dragon_a' | 'dragon_b' | 'dragon_c';
export const CAR_TYPES: CarType[] = ['dragon_a', 'dragon_b', 'dragon_c'];

export interface ColorPreset {
  name: string;
  bodyColor: number;
  roofColor: number;
  bgGradient: string;
}

export const CAR_PALETTES: Record<CarType, ColorPreset[]> = {
  // 紅蓮の火竜 (body = Mat_CarPaint, roof = Mat_Armor)
  dragon_a: [
    { name: '紅蓮クリムゾン', bodyColor: 0xc42829, roofColor: 0x30303a, bgGradient: '#c42829' },
    { name: 'ナイトブラック', bodyColor: 0x1b1c20, roofColor: 0xc42829, bgGradient: 'linear-gradient(135deg, #1b1c20 50%, #c42829 50%)' },
    { name: 'パールホワイト', bodyColor: 0xf0eeea, roofColor: 0x30303a, bgGradient: '#f0eeea' },
    { name: 'ガンメタル×オレンジ', bodyColor: 0x4a5056, roofColor: 0xe05615, bgGradient: 'linear-gradient(135deg, #4a5056 50%, #e05615 50%)' },
    { name: 'ロイヤルパープル', bodyColor: 0x5b2a86, roofColor: 0x1a1a22, bgGradient: '#5b2a86' },
  ],
  // 蒼雷の東洋龍
  dragon_b: [
    { name: 'アズールブルー', bodyColor: 0x7fbfe0, roofColor: 0x306175, bgGradient: '#7fbfe0' },
    { name: 'ジェイドグリーン', bodyColor: 0x2fa58a, roofColor: 0x14383a, bgGradient: '#2fa58a' },
    { name: 'ミッドナイトネイビー', bodyColor: 0x1a2a52, roofColor: 0x6fb6e0, bgGradient: 'linear-gradient(135deg, #1a2a52 50%, #6fb6e0 50%)' },
    { name: 'シャンパンホワイト', bodyColor: 0xeee6d0, roofColor: 0x306175, bgGradient: '#eee6d0' },
    { name: 'サクラピンク', bodyColor: 0xe58fb0, roofColor: 0x3a2a38, bgGradient: '#e58fb0' },
  ],
  // 黄金の重装竜
  dragon_c: [
    { name: 'ゴールドアーマー', bodyColor: 0x5e6166, roofColor: 0xebcf75, bgGradient: 'linear-gradient(135deg, #5e6166 50%, #ebcf75 50%)' },
    { name: 'ブラック×ゴールド', bodyColor: 0x2a2c33, roofColor: 0xebcf75, bgGradient: 'linear-gradient(135deg, #2a2c33 50%, #ebcf75 50%)' },
    { name: 'シルバー×ブラック', bodyColor: 0xb9bcc0, roofColor: 0x1b1c1f, bgGradient: 'linear-gradient(135deg, #b9bcc0 50%, #1b1c1f 50%)' },
    { name: 'ブロンズ', bodyColor: 0x7a5230, roofColor: 0xd9a05b, bgGradient: 'linear-gradient(135deg, #7a5230 50%, #d9a05b 50%)' },
    { name: 'クリムゾン×ゴールド', bodyColor: 0x8c1f24, roofColor: 0xebcf75, bgGradient: 'linear-gradient(135deg, #8c1f24 50%, #ebcf75 50%)' },
  ],
};
