// 画像の大きさの計算など、ブラウザや three.js に依存しない部分(textureStrips.ts から使う。単体でテストできるよう分けている)。

/** この大きさ(幅)以上のテクスチャだけ、帯に分ける。小さいものは、そのまま転送しても止まらない。 */
export const STRIP_MIN_WIDTH = 2048;
/**
 * 転送するテクスチャの一辺の上限。これを超える画像(チャンクの 4096²)は、半分(2048²)に縮めて転送する(Firefox のみ)。
 * 計測(Firefox, 東京スカイウェイ, 60秒×2): 他の対策を入れたうえで、1%low 53→65、p99 17→12.3ms、fps 155→158.5。
 * 4096² を 2048² にすると転送とサンプリングのバイト数が 1/4 になり、GPU の余裕が増える。画質は、近くの建物の細部がやや粗くなる。
 * 元に戻すには、この値を 4096 以上にする。
 */
export const STRIP_MAX_SIDE = 2048;

/** 画像の大きさ → 実際に転送するテクスチャの大きさと、縮小の倍率(整数)。 */
export function stripTargetSize(w: number, h: number): { w: number; h: number; down: number } {
  const down = Math.max(1, Math.ceil(Math.max(w, h) / STRIP_MAX_SIDE));
  return { w: Math.floor(w / down), h: Math.floor(h / down), down };
}
export const STRIP_ROWS = 128;

/** 高さ height の画像を、rows 行ずつの帯 [y, 行数] に分ける。 */
export function stripRanges(height: number, rows: number): [number, number][] {
  const out: [number, number][] = [];
  for (let y = 0; y < height; y += rows) out.push([y, Math.min(rows, height - y)]);
  return out;
}

/** JPEG / PNG のバイト列の先頭から、画像の [幅, 高さ] を読む(デコードせずに、大きさだけ知るため)。読めなければ null。 */
export function imageSize(b: Uint8Array): [number, number] | null {
  if (b.length > 24 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return [dv.getUint32(16), dv.getUint32(20)];
  }
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }                                         // 詰め物
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {    // SOF0〜SOF15(DHT・JPG・DAC 以外)
        return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
      }
      if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }   // 長さのないマーカー
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
  }
  return null;
}

