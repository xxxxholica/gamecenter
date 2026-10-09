export type TimeAttackState = 'READY' | 'COUNTDOWN' | 'RACING' | 'GOAL';

export interface SectorInfo {
  index: number;
  timeMs: number;
  deltaMs: number; // vs best sector (negative = faster)
}

export interface TimeAttackResult {
  totalTimeMs: number;
  formattedTime: string;
  sectors: SectorInfo[];
  topSpeedKmH: number;
  isNewRecord: boolean;
  bestTimeMs: number;
  carName: string;
  /** The time limit ran out before the goal (no record is saved). */
  timedOut?: boolean;
  /** Drift points banked in the run (competitive courses). */
  driftScore?: number;
  /** Progress reached, 0..1 (shown when timed out). */
  progress?: number;
}

/** Maximum race duration (5 minutes / 300,000 ms) safety limit to prevent infinite idling/stuck state */
export const MAX_RACE_TIME_MS = 5 * 60 * 1000;

/** Time-limit checkpoint rules: start with `initialMs`, every gate adds `bonusMs`; run out and the race is over. */
export interface TimeLimitRules {
  initialMs: number;
  bonusMs: number;
  /** Progress fractions of the gates, ascending. */
  gates: number[];
}

export interface StoredRecord {
  bestTimeMs: number;
  bestSectors: number[];
  topSpeedKmH: number;
  carName: string;
  date: string;
}

export interface TimeAttackCallbacks {
  onStateChange?: (state: TimeAttackState) => void;
  onCountdown?: (count: number | 'GO') => void;
  onTimeUpdate?: (timeMs: number, formatted: string) => void;
  onSectorPassed?: (sector: SectorInfo) => void;
  onGoal?: (result: TimeAttackResult) => void;
  /** Time left on the limit, every racing frame (only with rules). */
  onRemaining?: (remainingMs: number) => void;
  /** A time-limit gate was passed: bonus added. */
  onGate?: (index: number, bonusMs: number) => void;
}

/**
 * Manages the Time Attack lifecycle:
 * - Start line grid & countdown sequence (3, 2, 1, GO!)
 * - Accurate millisecond stopwatch
 * - Split / Sector checkpoint triggers
 * - Goal finish line detection & record storage (localStorage)
 */
export class TimeAttackManager {
  public state: TimeAttackState = 'READY';
  public elapsedTimeMs: number = 0;
  public topSpeedKmH: number = 0;

  /** オンライン対戦のカウントダウン: GO までの残り時間(ms)。あればフレームの積算の代わりにこれで進める。 */
  private syncedRemaining: (() => number) | null = null;
  private mapId: string = '';
  private carName: string = '';
  private sectorCount: number = 3;
  private sectorTimes: number[] = [];
  private lastSectorStartMs: number = 0;

  // Checkpoints along the route (fractional progress 0.0 to 1.0)
  // E.g., Sector 1 at 0.33, Sector 2 at 0.66, Goal at 1.0
  private checkFractions = [0.33, 0.66, 0.98];
  private nextCheckIdx = 0;

  // Countdown timing
  private countdownTimer: number = 0;
  private countdownStep: number = 3;

  // Time limit (optional) and the reference run the sector deltas are measured against (optional; default: stored best)
  private rules: TimeLimitRules | null = null;
  public remainingMs: number = 0;
  private nextGate = 0;
  private referenceSectors: number[] | null = null;
  private lastProgress = 0;
  /** Set by the caller (drift score of the run) so it can be put in the result. */
  public driftScoreProvider: (() => number) | null = null;

  public callbacks: TimeAttackCallbacks = {};

  constructor() {}

  public initCourse(mapId: string, carName: string): void {
    this.mapId = mapId;
    this.carName = carName;
    this.reset();
  }

  public setRules(rules: TimeLimitRules | null): void {
    this.rules = rules;
    this.remainingMs = rules?.initialMs ?? 0;
    this.nextGate = 0;
  }

  public setReferenceSectors(times: number[] | null): void {
    this.referenceSectors = times;
  }

  public reset(): void {
    this.remainingMs = this.rules?.initialMs ?? 0;
    this.nextGate = 0;
    this.state = 'READY';
    this.elapsedTimeMs = 0;
    this.topSpeedKmH = 0;
    this.sectorTimes = [];
    this.lastSectorStartMs = 0;
    this.nextCheckIdx = 0;
    this.countdownTimer = 0;
    this.countdownStep = 3;
    this.syncedRemaining = null;
    this.callbacks.onStateChange?.(this.state);
  }

  /**
   * Starts the countdown sequence: 3 -> 2 -> 1 -> GO!
   */
  public startCountdown(): void {
    this.reset();
    this.state = 'COUNTDOWN';
    this.countdownStep = 3;
    this.countdownTimer = 0;
    this.callbacks.onStateChange?.(this.state);
    this.callbacks.onCountdown?.(3);
  }

  /**
   * オンライン対戦: GO まで msUntilGo ミリ秒になるようにカウントダウンを始める(全員のGOを揃える)。
   * 3 → 2 → 1 → GO の表示は 1 秒刻みのまま、最初の刻みだけ短くなる。
   * remainingMs を渡すと、フレームの積算(重い端末ではフレームを落として遅れる)ではなく、その関数が返す GO までの残り時間で進める。
   */
  public startCountdownSynced(msUntilGo: number, remainingMs?: () => number): void {
    this.reset();
    this.syncedRemaining = remainingMs ?? null;
    this.state = 'COUNTDOWN';
    const remaining = Math.max(0, msUntilGo);
    this.countdownStep = Math.min(3, Math.max(1, Math.ceil(remaining / 1000)));
    this.countdownTimer = 1 - (remaining - (this.countdownStep - 1) * 1000) / 1000;
    this.callbacks.onStateChange?.(this.state);
    this.callbacks.onCountdown?.(this.countdownStep);
  }

  public update(dt: number, progressFraction: number, currentSpeedKmH: number): void {
    if (currentSpeedKmH > this.topSpeedKmH) {
      this.topSpeedKmH = Math.round(currentSpeedKmH);
    }

    if (this.state === 'COUNTDOWN' && this.syncedRemaining) {
      const rem = this.syncedRemaining();
      if (rem <= 0) {
        this.syncedRemaining = null;
        this.countdownStep = 0;
        this.callbacks.onCountdown?.('GO');
        this.state = 'RACING';
        this.elapsedTimeMs = -rem;                              // GO の時刻から遅れて気づいた分も、レース時間に含める
        this.callbacks.onStateChange?.(this.state);
      } else {
        const step = Math.min(3, Math.ceil(rem / 1000));
        if (step < this.countdownStep) {
          this.countdownStep = step;
          this.callbacks.onCountdown?.(step);
        }
      }
      return;
    }

    if (this.state === 'COUNTDOWN') {
      this.countdownTimer += dt;
      if (this.countdownTimer >= 1.0) {
        this.countdownTimer -= 1.0;
        this.countdownStep--;

        if (this.countdownStep > 0) {
          this.callbacks.onCountdown?.(this.countdownStep);
        } else if (this.countdownStep === 0) {
          this.callbacks.onCountdown?.('GO');
          this.state = 'RACING';
          this.callbacks.onStateChange?.(this.state);
        }
      }
      return;
    }

    if (this.state === 'RACING') {
      this.elapsedTimeMs += dt * 1000;
      this.callbacks.onTimeUpdate?.(this.elapsedTimeMs, this.formatTime(this.elapsedTimeMs));
      this.lastProgress = progressFraction;

      // 5分（300,000ms）の最大安全リミット（放置・スタック対策）
      if (this.elapsedTimeMs >= MAX_RACE_TIME_MS) {
        this.timeUp();
        return;
      }

      if (this.rules) {
        this.remainingMs -= dt * 1000;
        const gate = this.rules.gates[this.nextGate];
        if (gate !== undefined && progressFraction >= gate && progressFraction < gate + 0.12) {
          this.remainingMs += this.rules.bonusMs;
          this.callbacks.onGate?.(this.nextGate, this.rules.bonusMs);
          this.nextGate++;
        }
        this.callbacks.onRemaining?.(Math.max(0, this.remainingMs));
        if (this.remainingMs <= 0) {
          this.timeUp();
          return;
        }
      }

      // Checkpoint and sector progression
      if (this.nextCheckIdx < this.checkFractions.length) {
        const targetFrac = this.checkFractions[this.nextCheckIdx];

        if (this.nextCheckIdx < this.sectorCount - 1) {
          // Sector 1 or Sector 2 checkpoint
          if (progressFraction >= targetFrac && progressFraction < targetFrac + 0.12) {
            const secTime = this.elapsedTimeMs - this.lastSectorStartMs;
            this.lastSectorStartMs = this.elapsedTimeMs;
            this.sectorTimes.push(secTime);

            const bestRecord = this.getBestRecord();
            const bestSec = this.referenceSectors?.[this.nextCheckIdx] ?? bestRecord?.bestSectors[this.nextCheckIdx];
            const deltaMs = bestSec !== undefined ? secTime - bestSec : 0;

            const sectorInfo: SectorInfo = {
              index: this.nextCheckIdx + 1,
              timeMs: secTime,
              deltaMs,
            };

            this.callbacks.onSectorPassed?.(sectorInfo);
            this.nextCheckIdx++;
          }
        } else {
          // Final Goal Checkpoint (after completing sector checkpoints)
          if (this.nextCheckIdx === this.sectorCount - 1 && progressFraction >= targetFrac) {
            // GOAL reached!
            this.finishRace();
          }
        }
      }
    }
  }

  private finishRace(): void {
    this.state = 'GOAL';
    const finalSector = this.elapsedTimeMs - this.lastSectorStartMs;
    this.sectorTimes.push(finalSector);

    const bestRecord = this.getBestRecord();
    const isNewRecord = !bestRecord || this.elapsedTimeMs < bestRecord.bestTimeMs;

    const sectors: SectorInfo[] = this.sectorTimes.map((t, i) => {
      const bestSec = this.referenceSectors?.[i] ?? bestRecord?.bestSectors[i];
      return {
        index: i + 1,
        timeMs: t,
        deltaMs: bestSec !== undefined ? t - bestSec : 0,
      };
    });

    if (isNewRecord) {
      this.saveBestRecord({
        bestTimeMs: this.elapsedTimeMs,
        bestSectors: [...this.sectorTimes],
        topSpeedKmH: this.topSpeedKmH,
        carName: this.carName,
        date: new Date().toISOString(),
      });
    }

    const result: TimeAttackResult = {
      totalTimeMs: this.elapsedTimeMs,
      formattedTime: this.formatTime(this.elapsedTimeMs),
      sectors,
      topSpeedKmH: this.topSpeedKmH,
      isNewRecord,
      bestTimeMs: isNewRecord ? this.elapsedTimeMs : (bestRecord?.bestTimeMs ?? this.elapsedTimeMs),
      carName: this.carName,
      driftScore: this.driftScoreProvider?.(),
    };

    this.callbacks.onStateChange?.(this.state);
    this.callbacks.onGoal?.(result);
  }

  /** オンライン: サーバーが対戦を打ち切った。結果(記録)を出さずに、走行の判定だけを止める。 */
  public abort(): void {
    if (this.state !== 'RACING' && this.state !== 'COUNTDOWN') return;
    this.state = 'GOAL';
    this.callbacks.onStateChange?.(this.state);
  }

  /** The time limit ran out: the race ends without a record. */
  private timeUp(): void {
    this.state = 'GOAL';
    this.remainingMs = 0;
    this.callbacks.onRemaining?.(0);
    const result: TimeAttackResult = {
      totalTimeMs: this.elapsedTimeMs,
      formattedTime: this.formatTime(this.elapsedTimeMs),
      sectors: this.sectorTimes.map((t, i) => ({ index: i + 1, timeMs: t, deltaMs: 0 })),
      topSpeedKmH: this.topSpeedKmH,
      isNewRecord: false,
      bestTimeMs: this.getBestRecord()?.bestTimeMs ?? 0,
      carName: this.carName,
      timedOut: true,
      driftScore: this.driftScoreProvider?.(),
      progress: this.lastProgress,
    };
    this.callbacks.onStateChange?.(this.state);
    this.callbacks.onGoal?.(result);
  }

  public getBestRecord(mapId?: string): StoredRecord | null {
    const targetMapId = mapId ?? this.mapId;
    if (!targetMapId) return null;
    const key = `time_attack_${targetMapId}`;
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveBestRecord(record: StoredRecord): void {
    if (!this.mapId) return;
    const key = `time_attack_${this.mapId}`;
    try {
      localStorage.setItem(key, JSON.stringify(record));
    } catch (e) {
      console.warn('Failed to save record to localStorage', e);
    }
  }

  public formatTime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    const millis = Math.floor(ms % 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
}
