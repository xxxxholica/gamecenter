// 全ゲーム共通: ランクイン(記録登録画面)で鳴らす、短い合成ファンファーレ。
// 「タタタ・ターン」の上昇フレーズ + 和音の伸ばし。ファイルを持たず、その場で合成する。

let ctx: AudioContext | null = null;

/** [開始秒, 長さ秒, 周波数Hz[]](和音は複数の周波数を同時に鳴らす) */
const PHRASE: [number, number, number[]][] = [
  [0.0, 0.14, [523.25]],                       // C5
  [0.16, 0.14, [523.25]],                      // C5
  [0.32, 0.14, [523.25]],                      // C5
  [0.48, 0.34, [659.25]],                      // E5
  [0.86, 0.16, [587.33]],                      // D5
  [1.04, 0.5, [783.99, 659.25, 523.25]],       // C メジャー
  [1.56, 0.9, [1046.5, 783.99, 659.25, 523.25]], // 高いC の和音を伸ばす
];

export function playArcadeFanfare(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime + 0.05;
    const master = ctx.createGain();
    master.gain.value = 0.09;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 3200;
    master.connect(tone).connect(ctx.destination);

    for (const [start, len, freqs] of PHRASE) {
      for (const f of freqs) {
        const osc = ctx.createOscillator();
        const env = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = f;
        const a = t0 + start;
        env.gain.setValueAtTime(0.0001, a);
        env.gain.exponentialRampToValueAtTime(1 / freqs.length, a + 0.02);
        env.gain.setValueAtTime(1 / freqs.length, a + len * 0.7);
        env.gain.exponentialRampToValueAtTime(0.0001, a + len);
        osc.connect(env).connect(master);
        osc.start(a);
        osc.stop(a + len + 0.05);
      }
    }
  } catch {
    // 音が出せない環境(自動再生の制限など)でも、画面の進行には影響しない
  }
}
