import type { CarState } from '../../../../shared/netProtocol.ts';
import { STATE_HZ } from '../../../../shared/netProtocol.ts';

/** 受信した姿勢を、この時間だけ遅らせて補間表示する(ネットワークの揺らぎを吸収する)。 */
const INTERP_DELAY_MS = 120;
/** 送信の間隔(ms)。受信時刻の揺らぎをならして、等間隔のスナップショットとして扱う。 */
const SNAP_INTERVAL_MS = 1000 / STATE_HZ;
/** 受信の間隔がこの何倍以上空いたら、長い途絶とみなして予定表を作り直す。また予定表の遅れの最小値を見る範囲(個数)。 */
const RESYNC_MS = SNAP_INTERVAL_MS * 3;
/** 次のスナップショットが間に合わないとき、直近の速度でこの時間までは先を予測して動かし続ける。 */
const EXTRAPOLATE_MAX_MS = 150;
/** 表示姿勢を目標姿勢へ寄せる時定数(ms)。補間で残る小さなカクつきを丸める。 */
const SMOOTH_TAU_MS = 45;
/** 目標との距離がこれ以上(m)なら、なめらかに寄せずその場へ移す(リスポーン・コース復帰など)。 */
const LAG_WINDOW = 40;
const SNAP_DISTANCE = 15;
/** 古いスナップショットは捨てる。 */
const KEEP_MS = 1500;


export interface Target {
  x: number; y: number; z: number; yaw: number;
  speed: number; steer: number; roll: number; pitch: number;
  progress: number;
}

/** 角度差を最短(-π..π)に直す。while ループだと巨大な値(1e300 など)で値が変わらず無限ループになり、ブラウザが固まるため剰余で正規化する */
export function wrapAngle(d: number): number {
  d %= 2 * Math.PI;
  if (d > Math.PI) d -= 2 * Math.PI;
  else if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

interface Snapshot {
  t: number;
  s: CarState;
}

/**
 * 他のプレイヤーの車の姿勢を、受信したスナップショットから滑らかに求める(描画側の補完)。
 * - 受信時刻の揺らぎは、推定した送信間隔の等間隔の時刻にならして補間する
 * - 次のスナップショットが間に合わないときは、止めずに直近の速度で少し先まで予測する
 * - 求めた目標姿勢へは、時定数つきで寄せて、残る小さなカクつきを丸める
 */
export class RemoteTrack {
  /** 現在の表示姿勢 */
  public readonly pose: Target = { x: 0, y: 0, z: 0, yaw: 0, speed: 0, steer: 0, roll: 0, pitch: 0, progress: 0 };
  public valid = false;

  private snaps: Snapshot[] = [];
  private lastRecv = 0;
  private lastUpdate: number | null = null;
  /** 受信から推定した送信間隔(ms) */
  private intervalMs = SNAP_INTERVAL_MS;
  /** 直近のスナップショットの、予定表の時刻に対する受信の遅れ(ms) */
  private lags: number[] = [];

  /** 最後に受信してからの経過(ms) */
  public sinceLastRecv(now: number): number {
    return now - this.lastRecv;
  }

  public push(s: CarState, now: number): void {
    // 受信時刻は通信の揺らぎでばらつき、止まったあとはまとめて届く。受信時刻をそのまま補間に使うと、速度が伸び縮みし、
    // まとめて届いた分が一瞬に潰れて車が止まる・戻るように見える。
    // 送信はほぼ等間隔なので、各スナップショットには「送信の予定表」に沿った時刻をつける:
    //  - 間隔は、送信側のフレーム刻みで20Hzちょうどにならないので、受信の間隔から推定する
    //  - 予定表は、直近でいちばん早く届いたもの(遅れが最小)に合わせて少しずつ寄せる。遅れて届いたものは予定表のまま(バッファで吸収)
    const prev = this.snaps[this.snaps.length - 1];
    let t = now;
    if (prev) {
      const arrivalGap = now - this.lastRecv;
      if (arrivalGap > RESYNC_MS * 4) {
        // 長い途絶・再接続: 予定表を捨てて受信時刻から作り直す
        this.lags.length = 0;
      } else {
        this.intervalMs += (Math.min(SNAP_INTERVAL_MS * 2, Math.max(SNAP_INTERVAL_MS * 0.5, arrivalGap)) - this.intervalMs) * 0.05;
        t = prev.t + this.intervalMs;
        // 届いた時刻より未来の時刻はつけない(予定表が先走っているので、その分を戻す)
        if (t > now) t = now;
        const lag = now - t;
        this.lags.push(lag);
        if (this.lags.length > LAG_WINDOW) this.lags.shift();
        const minLag = Math.min(...this.lags);
        // 予定表が遅れ続けている(最小の遅れが正)なら、その分へ少しずつ寄せる
        if (minLag > 0) t += minLag * 0.1;
      }
      if (t <= prev.t) t = prev.t + 1;
    }
    this.snaps.push({ t, s });
    this.lastRecv = now;
    while (this.snaps.length > 2 && t - this.snaps[0].t > KEEP_MS) this.snaps.shift();
  }

  /** now 時点の表示姿勢を更新する。受信がまだ無ければ false。 */
  public update(now: number): boolean {
    const sn = this.snaps;
    if (sn.length === 0) return false;
    const dtMs = this.lastUpdate === null ? 0 : Math.min(100, Math.max(0, now - this.lastUpdate));
    this.lastUpdate = now;

    // 予測は最後のスナップショットから EXTRAPOLATE_MAX_MS までに抑える
    const last = sn[sn.length - 1];
    const rt = Math.min(now - INTERP_DELAY_MS, last.t + EXTRAPOLATE_MAX_MS);
    const target = this.sample(rt);

    const p = this.pose;
    if (!this.valid || Math.hypot(target.x - p.x, target.y - p.y, target.z - p.z) > SNAP_DISTANCE) {
      Object.assign(p, target);
    } else {
      const k = 1 - Math.exp(-dtMs / SMOOTH_TAU_MS);
      p.x += (target.x - p.x) * k;
      p.y += (target.y - p.y) * k;
      p.z += (target.z - p.z) * k;
      p.yaw += wrapAngle(target.yaw - p.yaw) * k;
      p.speed += (target.speed - p.speed) * k;
      p.steer += (target.steer - p.steer) * k;
      p.roll += (target.roll - p.roll) * k;
      p.pitch += (target.pitch - p.pitch) * k;
      p.progress = target.progress;
    }
    this.valid = true;
    return true;
  }

  /** 時刻 rt の姿勢。スナップショットの間は補間し、最後より先は直近の速度で予測する。 */
  private sample(rt: number): Target {
    const sn = this.snaps;
    const last = sn[sn.length - 1];
    if (rt >= last.t) {
      const L = last.s;
      const prev = sn.length >= 2 ? sn[sn.length - 2] : null;
      const extra = rt - last.t;
      let x = L[0], y = L[1], z = L[2], yaw = L[3];
      if (prev && extra > 0) {
        const span = Math.min(200, Math.max(10, last.t - prev.t));
        const P = prev.s;
        x += ((L[0] - P[0]) / span) * extra;
        y += ((L[1] - P[1]) / span) * extra;
        z += ((L[2] - P[2]) / span) * extra;
        yaw += (wrapAngle(L[3] - P[3]) / span) * extra;
      }
      return { x, y, z, yaw, speed: L[4], steer: L[5], roll: L[6], pitch: L[7], progress: L[9] };
    }
    let a = sn[0], b = sn[0];
    for (let i = 0; i < sn.length; i++) {
      if (sn[i].t <= rt) a = sn[i];
      if (sn[i].t >= rt) { b = sn[i]; break; }
      b = sn[i];
    }
    const u = b.t > a.t ? Math.min(1, Math.max(0, (rt - a.t) / (b.t - a.t))) : 1;
    const A = a.s, B = b.s;
    const lerp = (i: number) => A[i] + (B[i] - A[i]) * u;
    return {
      x: lerp(0), y: lerp(1), z: lerp(2), yaw: A[3] + wrapAngle(B[3] - A[3]) * u,
      speed: lerp(4), steer: lerp(5), roll: lerp(6), pitch: lerp(7), progress: B[9],
    };
  }
}
