// midnight-skyway の走行中の順位。サーバーが全員の最新の進行率を同じ時刻に揃えて決め、全員に配る(画面ごとに別々に計算するとズレるため)。
// Nodeの型ストリップで直接実行されるため、enum等のランタイム構文は使わない。

/** 進行率の変化速度で先を予測する上限(ms)。これより長く途絶えた車は、最後の位置で止まっているものとして扱う。 */
export const EXTRAPOLATE_MAX_MS = 300;
/** 変化速度の推定に使う、2つの受信の間隔の範囲(ms)。短すぎると誤差が増幅され、長すぎると古い速度になる。 */
const MIN_SPAN_MS = 20;
const MAX_SPAN_MS = 1000;

export interface ProgressTrack {
  /** 単調な進行率(コース1周のゴール後にループの継ぎ目を越えて 0 に戻っても下がらない) */
  progress: number;
  /** 受信時刻(ms) */
  at: number;
  /** 進行率の変化速度(/ms)。まだ分からなければ 0 */
  rate: number;
}

/** 新しい進行率 p を受信時刻 at で取り込む。ループの継ぎ目(0.9超→0.1未満)を越えた値は、後戻りとして無視する。 */
export function updateTrack(prev: ProgressTrack | null, p: number, at: number): ProgressTrack {
  if (!prev) return { progress: p, at, rate: 0 };
  if (prev.progress > 0.9 && p < 0.1) return { progress: prev.progress, at, rate: 0 };
  const span = at - prev.at;
  let rate = prev.rate;
  if (span >= MIN_SPAN_MS && span <= MAX_SPAN_MS) rate = Math.max(0, (p - prev.progress) / span);
  return { progress: p, at, rate };
}

/** 時刻 now での進行率の推定。 */
export function estimateProgress(t: ProgressTrack, now: number): number {
  return t.progress + t.rate * Math.min(EXTRAPOLATE_MAX_MS, Math.max(0, now - t.at));
}

export interface RankInput {
  id: number;
  /** ゴール済みならタイム(ms) */
  finish: number | null;
  track: ProgressTrack | null;
}

/** 順位(先頭が1位)の参加者id。ゴール済みはタイム順、その後ろに未完走を推定進行率の降順で並べる。同値は id の小さい順で安定させる。 */
export function rankRacers(racers: RankInput[], now: number): number[] {
  return racers
    .map((r) => ({ id: r.id, finish: r.finish, prog: r.track ? estimateProgress(r.track, now) : -1 }))
    .sort((a, b) => {
      if (a.finish !== null || b.finish !== null) {
        if (a.finish === null) return 1;
        if (b.finish === null) return -1;
        return a.finish - b.finish || a.id - b.id;
      }
      return b.prog - a.prog || a.id - b.id;
    })
    .map((r) => r.id);
}
