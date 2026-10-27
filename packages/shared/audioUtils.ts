import { audioRandom } from './arcadeReplay.ts';   // 音の乱数は、操作の記録・再生で追う乱数と分ける
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
    data[i] = (audioRandom() * 2 - 1) * (envelope ? envelope(i / ctx.sampleRate, i / bufferSize) : 1);
  }
  return buffer;
}

export interface StepSequencerSyncState {
  /** 次に鳴らすステップ番号 (0 .. cycleSteps - 1) */
  step: number;
  /** 次のステップを鳴らす AudioContext 時刻 (秒) */
  nextTime: number;
  /** サーバー基準との位相ズレ (秒, 測定・デバッグ用) */
  driftSec: number;
  /** 大幅なズレによりステップ位置をジャンプしたか */
  snapped: boolean;
}

/**
 * Web Audio のステップシーケンサ (SumoBgm / TowerStack Bgm 等) を
 * サーバー時刻 (serverNowMs) の拍・小節境界に同期させる。
 */
export function syncStepSequencer(
  ctxNow: number,
  nextTime: number,
  currentStep: number,
  serverNowMs: number,
  stepSec: number,
  cycleSteps: number,
  anchorMs = 0,
  minLeadSec = 0.04,
): StepSequencerSyncState {
  if (
    !Number.isFinite(ctxNow) ||
    !Number.isFinite(serverNowMs) ||
    !Number.isFinite(anchorMs) ||
    !Number.isFinite(stepSec) ||
    stepSec <= 0 ||
    !Number.isFinite(cycleSteps) ||
    cycleSteps <= 0
  ) {
    return {
      step: 0,
      nextTime: (Number.isFinite(ctxNow) ? ctxNow : 0) + Math.max(0.04, minLeadSec),
      driftSec: 0,
      snapped: false,
    };
  }
  const periodSec = cycleSteps * stepSec;
  const elapsedSec = (serverNowMs - anchorMs) / 1000;
  const serverPhaseSec = ((elapsedSec % periodSec) + periodSec) % periodSec;
  const serverPhaseSteps = serverPhaseSec / stepSec;

  const normStep = ((currentStep % cycleSteps) + cycleSteps) % cycleSteps;

  if (nextTime > 0) {
    const localPhaseSteps =
      (((normStep - (nextTime - ctxNow) / stepSec) % cycleSteps) + cycleSteps) % cycleSteps;
    const rawDiff = serverPhaseSteps - localPhaseSteps;
    const diffSteps =
      (((rawDiff + cycleSteps / 2) % cycleSteps) + cycleSteps) % cycleSteps - cycleSteps / 2;
    const driftSec = diffSteps * stepSec;

    // 半ステップ以内の微細なズレなら、ステップ番号を保ったまま nextTime をサーバー拍境界に一致させる
    if (Math.abs(diffSteps) <= 0.5) {
      const targetNextTime = Math.max(ctxNow + 0.005, nextTime - driftSec);
      return {
        step: normStep,
        nextTime: targetNextTime,
        driftSec,
        snapped: false,
      };
    }
  }

  // 初回・タブ復帰・曲切替・試合開始アンカー変更時は、minLeadSec 以降の直近のサーバー拍にスナップする
  const leadSec = Math.max(minLeadSec, 0.005);
  const futurePhaseSteps = (serverPhaseSteps + leadSec / stepSec) % cycleSteps;
  const snappedStep = Math.ceil(futurePhaseSteps) % cycleSteps;
  const remSteps = Math.ceil(futurePhaseSteps) - futurePhaseSteps;
  const snappedNextTime = ctxNow + leadSec + remSteps * stepSec;

  return {
    step: snappedStep,
    nextTime: snappedNextTime,
    driftSec: 0,
    snapped: true,
  };
}

export interface MediaSyncResult {
  action: 'locked' | 'rate' | 'seek';
  rate: number;
  targetSec: number;
  driftSec: number;
}

/**
 * HTMLAudioElement の再生位置 (currentTimeSec) をサーバー時刻ベースの目標位置に同期させるための
 * PLL (playbackRate 微調整 / 大幅ズレ時のシーク) 制御値を計算する。
 */
export function computeMediaSyncRate(
  currentTimeSec: number,
  serverNowMs: number,
  anchorServerMs: number,
  durationSec: number,
  loop: boolean,
  options?: {
    deadbandSec?: number;
    maxRateCatchupSec?: number;
    maxRateDelta?: number;
    gain?: number;
  },
): MediaSyncResult {
  const deadbandSec = options?.deadbandSec ?? 0.008;
  const maxRateCatchupSec = options?.maxRateCatchupSec ?? 0.55;
  const maxRateDelta = options?.maxRateDelta ?? 0.04;
  const gain = options?.gain ?? 0.6;

  const elapsedSec = (serverNowMs - anchorServerMs) / 1000;
  let targetSec: number;
  if (loop && durationSec > 0 && Number.isFinite(durationSec)) {
    targetSec = ((elapsedSec % durationSec) + durationSec) % durationSec;
  } else {
    targetSec = Math.max(0, elapsedSec);
  }

  let driftSec = targetSec - currentTimeSec;
  if (loop && durationSec > 0 && Number.isFinite(durationSec)) {
    driftSec =
      (((driftSec + durationSec / 2) % durationSec) + durationSec) % durationSec - durationSec / 2;
  }

  const absDrift = Math.abs(driftSec);
  if (absDrift <= deadbandSec) {
    return { action: 'locked', rate: 1.0, targetSec, driftSec };
  }
  if (absDrift <= maxRateCatchupSec) {
    const delta = Math.max(-maxRateDelta, Math.min(maxRateDelta, driftSec * gain));
    return { action: 'rate', rate: 1.0 + delta, targetSec, driftSec };
  }
  return { action: 'seek', rate: 1.0, targetSec, driftSec };
}
