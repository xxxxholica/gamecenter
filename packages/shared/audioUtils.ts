/**
 * Web Audio 共通ヘルパー。
 */

/**
 * ホワイトノイズの AudioBuffer を生成する。
 * @param ctx AudioContext
 * @param duration 長さ（秒）
 */
export function createWhiteNoiseBuffer(ctx: BaseAudioContext, duration: number): AudioBuffer {
  const bufferSize = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}
