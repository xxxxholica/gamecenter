// BGMの曲データ。すべて合成で鳴らすEDM。テンポ・キー・コード進行・フレーズを変えた曲を、メニュー用とレース用に分けて持つ。
// 1曲は64小節(約2分): イントロ → ビルドアップ → ドロップ → ブレイク → ビルドアップ → ドロップ → アウトロ。

export interface Chord {
  /** キー(ベース音)からの半音数 */
  root: number;
  minor: boolean;
}

export interface Section {
  bars: number;
  kick?: boolean;
  clap?: boolean;
  hat?: boolean;
  /** 16分の裏ハット(ドロップ用) */
  hat16?: boolean;
  bass?: boolean;
  pad?: boolean;
  /** 0: なし / 1: アルペジオ / 2: メロディ */
  lead?: 0 | 1 | 2;
  /** ノイズのライザー */
  riser?: boolean;
  /** スネアロール(区間の最後の2小節) */
  roll?: boolean;
  /** 区間の頭でクラッシュ */
  crash?: boolean;
  /** パッドのフィルターを開く(ドロップ) */
  bright?: boolean;
}

/** コードトーン列 [根音, 3度, 5度, +1oct, 3度+1oct, 5度+1oct] へのインデックス。null は休符 */
export type Phrase = (number | null)[];

export interface Track {
  id: string;
  name: string;
  pool: 'menu' | 'race';
  bpm: number;
  /** ベースの基準となるMIDIノート番号 */
  key: number;
  prog: Chord[];
  arp: Phrase;
  melody: [Phrase, Phrase];
  sections: Section[];
}

const M = true;

const STRUCTURE: Section[] = [
  { bars: 4, pad: true, hat: true, kick: true },
  { bars: 4, pad: true, hat: true, kick: true, bass: true, lead: 1 },
  { bars: 8, pad: true, hat: true, kick: true, clap: true, lead: 1, riser: true, roll: true },
  { bars: 16, pad: true, hat: true, hat16: true, kick: true, clap: true, bass: true, lead: 2, crash: true, bright: true },
  { bars: 8, pad: true, lead: 1 },
  { bars: 4, pad: true, kick: true, clap: true, lead: 1, riser: true, roll: true },
  { bars: 16, pad: true, hat: true, hat16: true, kick: true, clap: true, bass: true, lead: 2, crash: true, bright: true },
  { bars: 4, pad: true, hat: true, kick: true },
];

export const TRACKS: Track[] = [
  {
    id: 'neon-highway',
    name: 'Neon Highway',
    pool: 'race',
    bpm: 128,
    key: 45, // A
    prog: [{ root: 0, minor: M }, { root: 8, minor: false }, { root: 3, minor: false }, { root: 10, minor: false }],
    arp: [0, null, 1, null, 2, null, 1, null, 0, null, 1, null, 2, null, 4, null],
    melody: [
      [3, null, null, 4, null, 3, null, 5, null, 4, null, 3, null, null, 2, null],
      [5, null, null, 4, null, 3, null, 4, null, 5, null, 3, null, 2, null, 1],
    ],
    sections: STRUCTURE,
  },
  {
    id: 'midnight-run',
    name: 'Midnight Run',
    pool: 'race',
    bpm: 140,
    key: 40, // E
    prog: [{ root: 0, minor: M }, { root: 5, minor: M }, { root: 8, minor: false }, { root: 7, minor: false }],
    arp: [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 4, 3, 2, 1],
    melody: [
      [3, null, 4, null, 5, null, 4, null, 3, null, 2, null, 3, null, null, null],
      [4, null, null, 5, null, 4, null, 3, null, 4, null, null, 5, null, 4, 3],
    ],
    sections: STRUCTURE,
  },
  {
    id: 'skyline-drive',
    name: 'Skyline Drive',
    pool: 'race',
    bpm: 150,
    key: 37, // C#
    prog: [{ root: 0, minor: M }, { root: 3, minor: false }, { root: 8, minor: false }, { root: 10, minor: false }],
    arp: [0, null, 2, null, 1, null, 3, null, 2, null, 4, null, 3, null, 5, null],
    melody: [
      [5, null, 4, null, 3, null, 4, 5, null, null, 3, null, 2, null, 3, null],
      [3, null, 3, 4, null, 5, null, null, 4, null, 3, null, 5, null, 4, null],
    ],
    sections: STRUCTURE,
  },
  {
    id: 'afterglow',
    name: 'Afterglow',
    pool: 'menu',
    bpm: 124,
    key: 38, // D
    prog: [{ root: 0, minor: M }, { root: 8, minor: false }, { root: 10, minor: false }, { root: 5, minor: M }],
    arp: [0, null, null, 1, null, 2, null, null, 3, null, null, 2, null, 1, null, null],
    melody: [
      [4, null, null, null, 3, null, null, 2, null, null, 3, null, null, null, 4, null],
      [5, null, null, 4, null, null, 3, null, null, 4, null, null, 2, null, null, null],
    ],
    sections: STRUCTURE,
  },
  {
    id: 'garage-lights',
    name: 'Garage Lights',
    pool: 'menu',
    bpm: 132,
    key: 43, // G
    prog: [{ root: 0, minor: M }, { root: 8, minor: false }, { root: 3, minor: false }, { root: 7, minor: false }],
    arp: [0, 1, null, 2, null, 1, 0, null, 2, null, 3, null, 2, 1, null, null],
    melody: [
      [3, null, 4, null, null, 5, null, 4, null, 3, null, null, 2, null, null, null],
      [4, null, null, 3, null, 4, null, 5, null, null, 4, null, 3, null, 2, null],
    ],
    sections: STRUCTURE,
  },
];

export const totalBars = (t: Track): number => t.sections.reduce((a, s) => a + s.bars, 0);
