/**
 * Web Audio 共通ヘルパー。
 */

/**
 * ホワイトノイズの AudioBuffer を生成する。
 * @param ctx AudioContext
 * @param duration 長さ（秒）
 * @param envelope 各サンプルに掛ける音量(t: 先頭からの秒数, p: 全体のうちの進み具合 0〜1)。省略すると一定(1)
 */
export function createWhiteNoiseBuffer(
  ctx: BaseAudioContext,
  duration: number,
  envelope?: (t: number, p: number) => number,
): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (envelope ? envelope(i / ctx.sampleRate, i / bufferSize) : 1);
  }
  return buffer;
}
