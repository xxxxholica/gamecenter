/** 座標から決まる 0〜1 の擬似乱数(同じ座標なら、いつも同じ値) */
export function hash(a: number, b: number) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
