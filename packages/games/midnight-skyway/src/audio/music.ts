// BGMシーケンサー: 曲データ(tracks.ts)を先読みスケジューリングで合成再生する。
// 曲が終わるとプールの中から別の曲をランダムに選んで続ける(同じ曲は連続させない)。
import type { AudioEngine } from './engine';
import { LeadStyle, Section, TRACKS, Track, totalBars } from './tracks';

const midiHz = (n: number): number => 440 * Math.pow(2, (n - 69) / 12);
const LOOKAHEAD = 0.25;   // 秒: この先までの音を予約しておく

interface Run {
  track: Track;
  out: GainNode;
  /** キックに合わせて凹ませる(サイドチェイン風)。パッド・ベース・リードがここを通る */
  pump: GainNode;
  leadSend: GainNode;
  nextTime: number;
  step: number;   // 曲頭からの16分音符の数
  bars: number;
}

export class Bgm {
  private pool: 'menu' | 'race' | null = null;
  private run: Run | null = null;
  private lastId = '';
  private duckLevel = 1;
  private shuffleQueues: { menu: Track[]; race: Track[] } = { menu: [], race: [] };

  constructor(private readonly eng: AudioEngine) {
    window.setInterval(() => this.tick(), 25);
  }

  private getNextTrack(pool: 'menu' | 'race'): Track | null {
    let queue = this.shuffleQueues[pool];
    if (!queue || queue.length === 0) {
      const candidates = TRACKS.filter((t) => t.pool === pool);
      if (candidates.length === 0) return null;
      // フィッシャー・イェーツ シャッフルで完全ランダム順序を生成
      const shuffled = [...candidates];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      // 直前に流れた曲と同じ曲が先頭になった場合は別の曲と入れ替え
      if (shuffled.length > 1 && shuffled[0].id === this.lastId) {
        const swapIdx = 1 + Math.floor(Math.random() * (shuffled.length - 1));
        [shuffled[0], shuffled[swapIdx]] = [shuffled[swapIdx], shuffled[0]];
      }
      queue = shuffled;
      this.shuffleQueues[pool] = queue;
    }
    return queue.shift() ?? null;
  }

  /** 指定したプールの曲を流す。forceChangeがtrueの場合は同一プールでも即座に別曲へランダム切り替え */
  public play(pool: 'menu' | 'race', forceChange: boolean = false): void {
    if (this.pool === pool && !forceChange && this.run) return;
    this.pool = pool;
    this.fadeOutRun(0.6);
    this.eng.whenRunning(() => this.startNext());
  }

  /** BGMだけを下げる(1で通常)。ポーズ・リザルトで使う */
  public duck(level: number, timeConstant = 0.25): void {
    this.duckLevel = level;
    this.eng.musicDuck.gain.setTargetAtTime(level, this.eng.ctx.currentTime, timeConstant);
  }

  public get currentName(): string {
    return this.run?.track.name ?? '';
  }

  private startNext(): void {
    if (this.run || !this.pool) return;
    const track = this.getNextTrack(this.pool);
    if (!track) return;
    this.lastId = track.id;

    const ctx = this.eng.ctx;
    const out = ctx.createGain();
    out.gain.value = 0;
    out.gain.setTargetAtTime(1, ctx.currentTime, 0.25);
    out.connect(this.eng.musicDuck);
    this.eng.musicDuck.gain.value = this.duckLevel;

    const pump = ctx.createGain();
    pump.connect(out);

    // リードにだけ、付点8分のディレイ
    const beat = 60 / track.bpm;
    const leadSend = ctx.createGain();
    leadSend.gain.value = 0.42;
    const delay = ctx.createDelay(2);
    delay.delayTime.value = beat * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.38;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    leadSend.connect(delay);
    delay.connect(tone);
    tone.connect(feedback);
    feedback.connect(delay);
    tone.connect(out);

    this.run = { track, out, pump, leadSend, nextTime: ctx.currentTime + 0.12, step: 0, bars: totalBars(track) };
  }

  private fadeOutRun(seconds: number): void {
    const run = this.run;
    if (!run) return;
    this.run = null;
    const ctx = this.eng.ctx;
    run.out.gain.cancelScheduledValues(ctx.currentTime);
    run.out.gain.setTargetAtTime(0, ctx.currentTime, seconds / 3);
    window.setTimeout(() => run.out.disconnect(), (seconds + 4) * 1000);
  }

  private tick(): void {
    const run = this.run;
    if (!run || !this.eng.running) return;
    const ctx = this.eng.ctx;
    // タブの裏に回るなどで大きく遅れたら、追いつかず今の時刻から続ける
    if (run.nextTime < ctx.currentTime - 0.5) run.nextTime = ctx.currentTime + 0.05;

    const stepDur = 60 / run.track.bpm / 4;
    while (run.nextTime < ctx.currentTime + LOOKAHEAD) {
      const bar = Math.floor(run.step / 16);
      if (bar >= run.bars) {
        // 曲の終わり: 少し重ねて次の曲へ
        this.fadeOutRun(1.5);
        this.startNext();
        return;
      }
      this.scheduleStep(run, bar, run.step % 16, run.nextTime, stepDur);
      run.step++;
      run.nextTime += stepDur;
    }
  }

  private sectionAt(track: Track, bar: number): { s: Section; i: number } {
    let start = 0;
    for (const s of track.sections) {
      if (bar < start + s.bars) return { s, i: bar - start };
      start += s.bars;
    }
    const last = track.sections[track.sections.length - 1];
    return { s: last, i: last.bars - 1 };
  }

  private scheduleStep(run: Run, bar: number, step: number, t: number, stepDur: number): void {
    const track = run.track;
    const { s, i } = this.sectionAt(track, bar);
    const chord = track.prog[bar % track.prog.length];
    const barDur = stepDur * 16;

    // ---- ドラム ----(曲ごとのノリ: 四つ打ち / ブロークン / ハーフタイム / DnB / フォンク)
    const style = track.drums ?? 'four';
    const KICKS: Record<string, number[]> = {
      four: [0, 4, 8, 12],
      broken: [0, 6, 10, 14],
      halftime: [0, 10],
      dnb: [0, 10],
      phonk: [0, 3, 6, 10],
    };
    // ビルドの最後の小節は、最後の拍でキックを抜く
    if (s.kick && KICKS[style].includes(step) && !(s.roll && i === s.bars - 1 && step >= 12)) {
      this.kick(run, t);
      this.pumpDip(run, t, stepDur * (style === 'four' ? 4 : 3));
    }
    if (s.clap) {
      const backbeat = style === 'halftime' ? [8] : [4, 12];
      if (backbeat.includes(step)) {
        if (style === 'dnb') this.snare(run, t, 0.9);
        else this.clap(run, t);
      }
    }
    if (s.hat) {
      if (style === 'four' || style === 'broken') {
        if (step % 4 === 2) this.hat(run, t, true);
      } else if (style === 'halftime') {
        if (step % 4 === 0 || step % 4 === 2) this.hat(run, t, step % 8 === 6);
      } else if (step % 2 === 0) {
        this.hat(run, t, step % 8 === 6);
      }
    }
    if (s.hat16) {
      if (style === 'phonk') { if (step % 4 !== 2) this.hat(run, t, false); }
      else if (step % 2 === 1) this.hat(run, t, false);
    }

    // ---- ビルドアップ ----
    if (s.riser && step === 0) this.riser(run, t, barDur, i / s.bars, (i + 1) / s.bars);
    if (s.roll && i >= s.bars - 2) {
      const last = i === s.bars - 1;
      const every = last ? 1 : 2;
      if (step % every === 0) this.snare(run, t, 0.25 + 0.5 * ((i - (s.bars - 2)) * 16 + step) / 32);
    }
    if (s.crash && i === 0 && step === 0) this.crash(run, t);

    // ---- 音階楽器 ----
    const third = chord.minor ? 3 : 4;
    const tones = [0, third, 7, 12, 12 + third, 19];
    if (s.pad && step === 0) {
      const base = track.key + 12 + chord.root;
      this.pad(run, t, barDur, [base, base + third, base + 7, base + 12], s.bright ? 3600 : 1700);
    }
    if (s.bass) {
      const note = track.key + chord.root;
      switch (track.bassStyle ?? 'offbeat') {
        case 'rolling':
          if (step % 2 === 1) this.bass(run, t, stepDur * 1.6, note + (step % 8 === 7 ? 12 : 0));
          break;
        case 'octave':
          if (step % 4 === 0) this.bass(run, t, stepDur * 1.8, note);
          else if (step % 4 === 2) this.bass(run, t, stepDur * 1.8, note + 12);
          break;
        case 'sparse':
          if (step === 0 || step === 10) this.bass(run, t, stepDur * (step === 0 ? 8 : 5), note);
          break;
        default:
          if (step % 4 === 2) this.bass(run, t, stepDur * 3, note);
      }
    }
    if (s.lead) {
      const phrase = s.lead === 1 ? track.arp : track.melody[bar % 2];
      const idx = phrase[step];
      if (idx !== null && idx !== undefined) {
        const note = track.key + 24 + chord.root + tones[idx % tones.length];
        this.lead(run, t, stepDur * (s.lead === 1 ? 1.6 : 2.4), note, s.lead === 2 ? 0.15 : 0.1, track.leadStyle ?? 'saw');
      }
    }
  }

  // ------------------------------------------------------------
  // 音色
  // ------------------------------------------------------------

  private pumpDip(run: Run, t: number, dur: number): void {
    const g = run.pump.gain;
    g.setValueAtTime(0.2, t);
    g.linearRampToValueAtTime(1, t + dur * 0.85);
  }

  private kick(run: Run, t: number): void {
    const ctx = this.eng.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(165, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    g.gain.setValueAtTime(0.95, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    osc.connect(g);
    g.connect(run.out);
    osc.start(t);
    osc.stop(t + 0.36);
    this.noise(t, 0.02, 'highpass', 2500, 0.7, 0.25, run.out);
  }

  private clap(run: Run, t: number): void {
    for (let k = 0; k < 3; k++) this.noise(t + k * 0.011, k === 2 ? 0.16 : 0.02, 'bandpass', 1500, 1.1, 0.34, run.out);
  }

  private hat(run: Run, t: number, open: boolean): void {
    this.noise(t, open ? 0.13 : 0.035, 'highpass', 8000, 0.7, open ? 0.13 : 0.05, run.out);
  }

  private snare(run: Run, t: number, vol: number): void {
    this.noise(t, 0.11, 'highpass', 1800, 0.7, 0.3 * vol, run.out);
    const ctx = this.eng.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    g.gain.setValueAtTime(0.25 * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g);
    g.connect(run.out);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  private crash(run: Run, t: number): void {
    this.noise(t, 1.8, 'highpass', 5000, 0.7, 0.3, run.out);
  }

  private riser(run: Run, t: number, dur: number, from: number, to: number): void {
    const ctx = this.eng.ctx;
    const src = this.eng.noiseSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = 'bandpass';
    f.Q.value = 2.2;
    const hz = (p: number) => 350 * Math.pow(20, p);   // 350Hz → 7kHz
    f.frequency.setValueAtTime(hz(from), t);
    f.frequency.exponentialRampToValueAtTime(hz(to), t + dur);
    g.gain.setValueAtTime(0.03 + 0.2 * from, t);
    g.gain.linearRampToValueAtTime(0.03 + 0.2 * to, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(run.out);
    src.start(t, this.eng.noiseOffset());
    src.stop(t + dur + 0.02);
  }

  private pad(run: Run, t: number, dur: number, notes: number[], cutoff: number): void {
    const ctx = this.eng.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(cutoff * 0.6, t);
    f.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.8, t + 0.03);
    g.gain.setValueAtTime(0.8, t + dur - 0.06);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
    f.connect(g);
    g.connect(run.pump);
    g.connect(this.eng.reverbSend);
    // スーパーソウ風: 少しずつ音程をずらしたノコギリ波を重ねる
    for (const n of notes) {
      for (const cents of [-13, 0, 13]) {
        const osc = ctx.createOscillator();
        const og = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.value = midiHz(n);
        osc.detune.value = cents;
        og.gain.value = 0.034;
        osc.connect(og);
        og.connect(f);
        osc.start(t);
        osc.stop(t + dur + 0.08);
      }
    }
  }

  private bass(run: Run, t: number, dur: number, note: number): void {
    const ctx = this.eng.ctx;
    const saw = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    saw.type = 'sawtooth';
    sub.type = 'sine';
    saw.frequency.value = midiHz(note);
    sub.frequency.value = midiHz(note);
    f.type = 'lowpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(260, t + 0.16);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.34, t + 0.006);
    g.gain.setValueAtTime(0.34, t + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    saw.connect(f);
    f.connect(g);
    sub.connect(g);
    g.connect(run.pump);
    saw.start(t);
    sub.start(t);
    saw.stop(t + dur + 0.02);
    sub.stop(t + dur + 0.02);
  }

  private lead(run: Run, t: number, dur: number, note: number, vol: number, style: LeadStyle = 'saw'): void {
    const ctx = this.eng.ctx;
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = 'lowpass';
    f.Q.value = style === 'square' ? 4 : 2;
    f.frequency.setValueAtTime(style === 'pluck' ? 5200 : 4200, t);
    f.frequency.exponentialRampToValueAtTime(style === 'pluck' ? 700 : 1300, t + (style === 'pluck' ? Math.min(dur, 0.22) : dur));
    // 音の長さ: pluck は短く切る、bell は長く響かせる
    const len = style === 'pluck' ? Math.min(dur, 0.24) : style === 'bell' ? dur * 1.5 : dur;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(style === 'bell' ? vol * 0.8 : vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    f.connect(g);
    g.connect(run.pump);
    g.connect(run.leadSend);
    g.connect(this.eng.reverbSend);
    const voices: { type: OscillatorType; mul: number; cents: number; gain: number }[] =
      style === 'square' ? [{ type: 'square', mul: 1, cents: -7, gain: 0.7 }, { type: 'square', mul: 1, cents: 7, gain: 0.7 }]
      : style === 'bell' ? [{ type: 'sine', mul: 1, cents: 0, gain: 1 }, { type: 'sine', mul: 2, cents: 3, gain: 0.45 }, { type: 'sine', mul: 3.01, cents: 0, gain: 0.2 }]
      : style === 'pluck' ? [{ type: 'triangle', mul: 1, cents: -4, gain: 1 }, { type: 'sawtooth', mul: 1, cents: 4, gain: 0.5 }]
      : [{ type: 'sawtooth', mul: 1, cents: -9, gain: 1 }, { type: 'sawtooth', mul: 1, cents: 9, gain: 1 }];
    for (const v of voices) {
      const osc = ctx.createOscillator();
      const og = ctx.createGain();
      osc.type = v.type;
      osc.frequency.value = midiHz(note) * v.mul;
      osc.detune.value = v.cents;
      og.gain.value = v.gain;
      osc.connect(og);
      og.connect(f);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
  }

  private noise(t: number, dur: number, type: BiquadFilterType, freq: number, q: number, vol: number, dest: AudioNode): void {
    const ctx = this.eng.ctx;
    const src = this.eng.noiseSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, this.eng.noiseOffset());
    src.stop(t + dur + 0.02);
  }
}
