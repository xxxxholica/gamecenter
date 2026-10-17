// 受け取ったメッセージの値の検証(サーバーのゲームと、プロトコルの検証関数で共有)。
// Nodeの型ストリップ(サーバー)でも読み込まれるため、TypeScript 固有のランタイム構文(enum等)は使わない。

/** 有限の数で、lo〜hi の範囲に入っているか */
export const isNum = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
