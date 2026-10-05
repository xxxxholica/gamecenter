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

/** ドラムのノリ。省略時は four(四つ打ち) */
export type DrumStyle = 'four' | 'broken' | 'halftime' | 'dnb' | 'phonk';
/** ベースの刻み方。省略時は offbeat(裏打ち) */
export type BassStyle = 'offbeat' | 'rolling' | 'octave' | 'sparse';
/** リードの音色。省略時は saw */
export type LeadStyle = 'saw' | 'square' | 'pluck' | 'bell';

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
  /** 曲ごとのノリと音色。ここを変えると、同じ作りの曲でも別のジャンルに聞こえる */
  drums?: DrumStyle;
  bassStyle?: BassStyle;
  leadStyle?: LeadStyle;
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
    drums: 'four',
    bassStyle: 'offbeat',
    leadStyle: 'saw',
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
    drums: 'four',
    bassStyle: 'rolling',
    leadStyle: 'square',
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
    drums: 'broken',
    bassStyle: 'octave',
    leadStyle: 'pluck',
  },
  {
    id: 'tokyo-phonk',
    name: 'Tokyo Drift Phonk',
    pool: 'race',
    bpm: 160,
    key: 48, // C
    prog: [{ root: 0, minor: M }, { root: 3, minor: false }, { root: 6, minor: false }, { root: 5, minor: M }],
    arp: [0, 2, 4, 2, 0, 2, 5, 2, 0, 2, 4, 2, 3, 2, 1, 0],
    melody: [
      [5, null, 5, null, 4, null, 3, null, 5, null, null, 4, 3, null, 2, null],
      [5, null, 5, null, 4, null, 3, 4, 5, null, 4, null, 3, 2, 1, null],
    ],
    sections: STRUCTURE,
    drums: 'phonk',
    bassStyle: 'sparse',
    leadStyle: 'bell',
  },
  {
    id: 'cyber-dnb',
    name: 'Cyber Drum & Bass',
    pool: 'race',
    bpm: 172,
    key: 43, // G
    prog: [{ root: 0, minor: M }, { root: 5, minor: M }, { root: 8, minor: false }, { root: 10, minor: false }],
    arp: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 4, 5, 4, 2, 1],
    melody: [
      [4, null, null, 3, 4, null, 5, null, null, 4, 3, null, 2, null, 3, null],
      [5, null, 4, null, 3, null, null, 4, 5, null, 4, null, 3, 2, null, 1],
    ],
    sections: STRUCTURE,
    drums: 'dnb',
    bassStyle: 'rolling',
    leadStyle: 'saw',
  },
  {
    id: 'overdrive-wave',
    name: 'Overdrive Synthwave',
    pool: 'race',
    bpm: 135,
    key: 41, // F
    prog: [{ root: 0, minor: M }, { root: 8, minor: false }, { root: 3, minor: false }, { root: 10, minor: false }],
    arp: [0, null, 1, null, 2, null, 3, null, 4, null, 3, null, 2, null, 1, null],
    melody: [
      [3, null, 4, null, 5, null, null, 4, 3, null, null, 2, 3, null, 4, null],
      [5, null, null, 4, 3, null, 4, 5, null, null, 4, 3, null, 2, null, null],
    ],
    sections: STRUCTURE,
    drums: 'four',
    bassStyle: 'octave',
    leadStyle: 'square',
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
    drums: 'halftime',
    bassStyle: 'sparse',
    leadStyle: 'bell',
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
    drums: 'broken',
    bassStyle: 'offbeat',
    leadStyle: 'pluck',
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    pool: 'race',
    bpm: 126,
    key: 36, // C
    prog: [{ root: 0, minor: false }, { root: 7, minor: false }, { root: 9, minor: M }, { root: 5, minor: false }],
    arp: [0, 2, 1, 2, 0, 2, 1, 3, 0, 2, 1, 2, 3, 2, 1, 0],
    melody: [
      [4, null, 3, null, 4, null, 5, null, 4, null, null, 3, null, null, 2, null],
      [5, null, 4, null, 3, null, 4, null, 5, null, 5, null, 4, null, 3, null],
    ],
    sections: STRUCTURE,
    drums: 'broken',
    bassStyle: 'rolling',
    leadStyle: 'pluck',
  },
  {
    id: 'redline-trance',
    name: 'Redline Trance',
    pool: 'race',
    bpm: 138,
    key: 44, // G#
    prog: [{ root: 0, minor: M }, { root: 8, minor: false }, { root: 3, minor: false }, { root: 7, minor: false }],
    arp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 2, 3],
    melody: [
      [5, null, null, 5, null, 4, null, 3, null, 4, null, null, 5, null, null, null],
      [4, null, null, 4, null, 3, null, 2, null, 3, null, 4, null, 5, null, null],
    ],
    sections: STRUCTURE,
    drums: 'four',
    bassStyle: 'rolling',
    leadStyle: 'bell',
  },
  {
    id: 'tunnel-vision',
    name: 'Tunnel Vision',
    pool: 'race',
    bpm: 148,
    key: 39, // D#
    prog: [{ root: 0, minor: M }, { root: 0, minor: M }, { root: 10, minor: false }, { root: 8, minor: false }],
    arp: [0, null, 0, 2, null, 0, 3, null, 0, null, 0, 2, null, 4, 3, null],
    melody: [
      [3, null, null, null, 4, null, null, 3, null, null, 2, null, null, null, null, null],
      [4, null, null, 5, null, null, 4, null, null, 3, null, null, 2, null, 3, null],
    ],
    sections: STRUCTURE,
    drums: 'halftime',
    bassStyle: 'octave',
    leadStyle: 'square',
  },
  {
    id: 'blue-hour',
    name: 'Blue Hour',
    pool: 'menu',
    bpm: 112,
    key: 41, // F
    prog: [{ root: 0, minor: false }, { root: 9, minor: M }, { root: 2, minor: M }, { root: 7, minor: false }],
    arp: [0, null, 1, null, 2, null, 1, null, 3, null, 2, null, 1, null, 0, null],
    melody: [
      [4, null, null, 3, null, null, 4, null, null, null, 5, null, null, 4, null, null],
      [3, null, null, 4, null, null, 5, null, null, 4, null, null, 3, null, null, null],
    ],
    sections: STRUCTURE,
    drums: 'halftime',
    bassStyle: 'sparse',
    leadStyle: 'bell',
  },
  {
    id: 'parking-b2',
    name: 'Parking Level B2',
    pool: 'menu',
    bpm: 118,
    key: 46, // A#
    prog: [{ root: 0, minor: M }, { root: 3, minor: false }, { root: 8, minor: false }, { root: 5, minor: M }],
    arp: [0, 2, null, 1, 3, null, 2, null, 0, 2, null, 4, 3, null, 1, null],
    melody: [
      [3, null, 4, null, null, 3, null, null, 5, null, null, 4, null, null, null, null],
      [5, null, null, 4, null, 3, null, null, 4, null, null, 2, null, 3, null, null],
    ],
    sections: STRUCTURE,
    drums: 'broken',
    bassStyle: 'octave',
    leadStyle: 'pluck',
  },
  {
    id: 'rain-on-the-deck',
    name: 'Rain on the Deck',
    pool: 'menu',
    bpm: 104,
    key: 40, // E
    prog: [{ root: 0, minor: M }, { root: 5, minor: M }, { root: 3, minor: false }, { root: 8, minor: false }],
    arp: [0, null, null, 2, null, null, 1, null, null, 3, null, null, 2, null, null, null],
    melody: [
      [5, null, null, null, 4, null, null, null, 3, null, null, 4, null, null, null, null],
      [4, null, null, null, 3, null, null, 2, null, null, null, 3, null, null, 4, null],
    ],
    sections: STRUCTURE,
    drums: 'halftime',
    bassStyle: 'sparse',
    leadStyle: 'square',
  },
];

export const totalBars = (t: Track): number => t.sections.reduce((a, s) => a + s.bars, 0);
