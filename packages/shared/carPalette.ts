// マシンの色パレット(クライアントの選択画面とオンライン対戦サーバーの両方が使う)。
// オンライン対戦では「他の参加者と body の色が被らない」ことをサーバーがこのパレットで判定する。
// Nodeの型ストリップで直接実行されるため、ランタイム構文は使わない(enum等)。

export type CarType = 'trail_j' | 'cross_j' | 'combat_sedan' | 'missile_truck_j';
export const CAR_TYPES: CarType[] = ['trail_j', 'cross_j', 'combat_sedan', 'missile_truck_j'];

export interface ColorPreset {
  name: string;
  bodyColor: number;
  roofColor: number;
  bgGradient: string;
}

export const CAR_PALETTES: Record<CarType, ColorPreset[]> = {
  trail_j: [
    { name: 'キネティックイエロー', bodyColor: 0xded235, roofColor: 0x1a1c22, bgGradient: '#ded235' },
    { name: 'ジャングルグリーン', bodyColor: 0x243325, roofColor: 0x1a1c22, bgGradient: '#243325' },
    { name: 'ブリスクブルー', bodyColor: 0x1976d2, roofColor: 0x1a1c22, bgGradient: '#1976d2' },
    { name: 'ミディアムグレー', bodyColor: 0x4b5563, roofColor: 0x1a1c22, bgGradient: '#4b5563' },
    { name: 'シフォンアイボリー', bodyColor: 0xe6cf9e, roofColor: 0x1a1c22, bgGradient: '#e6cf9e' },
    { name: 'ピュアホワイト', bodyColor: 0xf5f6fa, roofColor: 0x1a1c22, bgGradient: '#f5f6fa' },
    { name: 'ブルーイッシュブラック', bodyColor: 0x11141a, roofColor: 0x11141a, bgGradient: '#11141a' },
  ],
  cross_j: [
    { name: 'オレンジ×白', bodyColor: 0xe05615, roofColor: 0xf5f6fa, bgGradient: 'linear-gradient(135deg, #e05615 50%, #ffffff 50%)' },
    { name: 'デニムブルー×ガンメ', bodyColor: 0x2952a3, roofColor: 0x2d3436, bgGradient: 'linear-gradient(135deg, #2952a3 50%, #2d3436 50%)' },
    { name: 'フェニックスレッド×黒', bodyColor: 0xd63031, roofColor: 0x1a1c22, bgGradient: 'linear-gradient(135deg, #d63031 50%, #1a1c22 50%)' },
    { name: 'クールカーキ×白', bodyColor: 0x3d4d3d, roofColor: 0xf5f6fa, bgGradient: 'linear-gradient(135deg, #3d4d3d 50%, #ffffff 50%)' },
    { name: 'オフブルー×白', bodyColor: 0x54a0ff, roofColor: 0xf5f6fa, bgGradient: 'linear-gradient(135deg, #54a0ff 50%, #ffffff 50%)' },
    { name: 'ピュアホワイト×黒', bodyColor: 0xf5f6fa, roofColor: 0x1a1c22, bgGradient: 'linear-gradient(135deg, #f5f6fa 50%, #1a1c22 50%)' },
  ],
  combat_sedan: [
    { name: 'ミリタリーオリーブ', bodyColor: 0x35422e, roofColor: 0x1f241d, bgGradient: '#35422e' },
    { name: 'デザートサンド', bodyColor: 0x8a7a5a, roofColor: 0x3d3527, bgGradient: '#8a7a5a' },
    { name: 'ステルスブラック', bodyColor: 0x1e2022, roofColor: 0x111315, bgGradient: '#1e2022' },
    { name: 'ブラッドラスト', bodyColor: 0x5a2323, roofColor: 0x241111, bgGradient: '#5a2323' },
    { name: 'ガンメタルスチール', bodyColor: 0x4a5056, roofColor: 0x232629, bgGradient: '#4a5056' },
  ],
  missile_truck_j: [
    { name: 'ホワイト×オリーブ', bodyColor: 0xf5f6fa, roofColor: 0x283823, bgGradient: 'linear-gradient(135deg, #f5f6fa 50%, #283823 50%)' },
    { name: 'アーミーグリーン', bodyColor: 0x364835, roofColor: 0x202b20, bgGradient: '#364835' },
    { name: 'デザートコヨーテ', bodyColor: 0x9c7a52, roofColor: 0x4a3a27, bgGradient: '#9c7a52' },
    { name: 'タクティカルブラック', bodyColor: 0x1f2326, roofColor: 0x141719, bgGradient: '#1f2326' },
    { name: 'スノーレスキュー', bodyColor: 0xe8ecf0, roofColor: 0xd63031, bgGradient: 'linear-gradient(135deg, #e8ecf0 50%, #d63031 50%)' },
  ],
};
