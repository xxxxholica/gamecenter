// 演出(効果音・パーティクル・バナーなど)の一覧。シミュレーション(サーバー/ブラウザ)は演出を「番号+引数」のイベントとして出し、
// 画面側(ブラウザ)がこの表を使って SoundManager / ParticleManager などを呼ぶ。表にある呼び出しだけが再生できる(任意のメソッド呼び出しは受け付けない)。
// Nodeの型ストリップで直接実行されるため、ランタイム構文は使わない(enum等)。

export type FxTarget = 'sound' | 'particle' | 'ui' | 'main';

export interface FxDef {
  target: FxTarget;
  name: string;
  /** 引数の並び。v=座標(x,y,z の3つの数) n=数 s=文字列 b=真偽 */
  sig: string;
}

/**
 * 並びの順番がそのまま通信上の番号になる(サーバーと画面は同じ版を使う前提。途中に足すと食い違うので、足すときは末尾に)。
 */
export const FX: FxDef[] = [
  { target: 'sound', name: 'playHarite', sig: '' },
  { target: 'sound', name: 'playGuard', sig: '' },
  { target: 'sound', name: 'playGuardBreak', sig: '' },
  { target: 'sound', name: 'playDaze', sig: '' },
  { target: 'sound', name: 'playBuchikamashiHit', sig: 'n' },
  { target: 'sound', name: 'playSuriasi', sig: '' },
  { target: 'sound', name: 'playTaiko', sig: '' },
  { target: 'sound', name: 'playHyoshigi', sig: '' },
  { target: 'sound', name: 'playRingOut', sig: '' },
  { target: 'sound', name: 'playExplosion', sig: 'n' },
  { target: 'sound', name: 'duckBgm', sig: 'n' },
  { target: 'sound', name: 'setBgmCalm', sig: 'b' },
  { target: 'sound', name: 'playBgm', sig: 's' },
  { target: 'particle', name: 'spawnHariteHit', sig: 'v' },
  { target: 'particle', name: 'spawnHariteSwing', sig: 'vv' },
  { target: 'particle', name: 'spawnGuardSpark', sig: 'v' },
  { target: 'particle', name: 'spawnBuchikamashiHit', sig: 'vn' },
  { target: 'particle', name: 'triggerShake', sig: 'n' },
  { target: 'particle', name: 'spawnDust', sig: 'vv' },
  { target: 'ui', name: 'showBanner', sig: 'ssn' },
  { target: 'main', name: 'blast', sig: 'vn' },
];

export const FX_INDEX = new Map<string, number>(FX.map((d, i) => [`${d.target}.${d.name}`, i]));
