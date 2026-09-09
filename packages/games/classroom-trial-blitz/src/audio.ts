// Web Audio APIによる完全シンセサイズSE(外部音声ファイル不使用)
export class SoundSystem {
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private tone(freq: number, duration: number, type: OscillatorType, gainPeak: number, delay = 0, freqEnd?: number): void {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    const t0 = ctx.currentTime + delay;
    osc.frequency.setValueAtTime(freq, t0);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t0 + duration);
    }
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  private noiseBurst(duration: number, gainPeak: number, delay = 0, filterFreq = 1200): void {
    const ctx = this.ensureCtx();
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    const t0 = ctx.currentTime + delay;
    gain.gain.setValueAtTime(gainPeak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(t0);
  }

  public playObjection(): void {
    this.tone(660, 0.09, 'sawtooth', 0.22);
    this.tone(880, 0.14, 'square', 0.18, 0.06);
  }

  public playHit(): void {
    this.noiseBurst(0.18, 0.35, 0, 1800);
    this.tone(520, 0.3, 'sawtooth', 0.25, 0, 90);
  }

  public playBuzzer(): void {
    this.tone(140, 0.35, 'square', 0.28, 0, 90);
  }

  public playGavel(): void {
    this.noiseBurst(0.06, 0.4, 0, 3200);
    this.tone(180, 0.18, 'sine', 0.3, 0, 45);
  }

  public playReady(): void {
    this.tone(440, 0.08, 'square', 0.16);
    this.tone(660, 0.12, 'square', 0.16, 0.09);
  }

  public playVerdict(): void {
    this.tone(523, 0.14, 'square', 0.2, 0);
    this.tone(659, 0.14, 'square', 0.2, 0.14);
    this.tone(784, 0.28, 'square', 0.22, 0.28);
  }
}
