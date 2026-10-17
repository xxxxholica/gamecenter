/**
 * Firefox か(動作確認用に、URL に ff=1 を付けると Chrome でも Firefox の経路になる)。
 * Firefox は、テクスチャの転送・ブルームなど GPU 側の処理で、Chrome より 1 フレームの余裕が小さいため、
 * 一部の処理だけ別の方法をとる(maps/textureStrips.ts、core/PostFX.ts)。
 */
export const IS_FIREFOX = typeof navigator !== 'undefined'
  && (/Firefox/.test(navigator.userAgent) || (typeof location !== 'undefined' && /[?&]ff=1/.test(location.search)));
