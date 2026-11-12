/**
 * Web Audio API を用いたリアルタイム効果音シンセサイザー
 * 外部音声ファイルへの依存がなく、即座に低遅延で迫力ある相撲サウンドを再生
 */
import { SumoBgm, BgmTrack } from './SumoBgm';
import { createWhiteNoiseBuffer } from '../../../../shared/audioUtils';

export class SoundManager {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;

  // BGM
  private bgm: SumoBgm | null = null;
  private bgmGain: GainNode | null = null;
  private static readonly BGM_VOLUME = 0.3;
  private wantedTrack: BgmTrack | null = null;
  private onlineSyncEnabled: boolean = false;
  private bgmAnchorMs: number = 0;
  private serverNowFn: (() => number) | undefined = undefined;

  constructor() {
    // ブラウザは最初の操作がないと音を出せない。最初の操作で音声を有効にする
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  /** 音声を有効にする(最初の操作で呼ぶ。ゲームパッドの入力からも呼べる) */
  public unlock() {
    this.initCtx();
    if (this.wantedTrack) this.startBgmNow();
  }

  private startBgmNow() {
    if (!this.ctx || !this.wantedTrack) return;
    if (!this.bgmGain) {
      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = this.isMuted ? 0 : SoundManager.BGM_VOLUME;
      this.bgmGain.connect(this.ctx.destination);
      this.bgm = new SumoBgm(this.ctx, this.bgmGain);
      if (this.onlineSyncEnabled) {
        this.bgm.setOnlineSync(true, this.bgmAnchorMs, this.serverNowFn);
      }
    }
    this.bgm!.start(this.wantedTrack);
  }

  /** オンライン対戦の待機画面および試合中のみBGMをサーバー時刻へ同期させる */
  public setOnlineSync(enabled: boolean, anchorMs: number = 0, serverNowFn?: () => number) {
    this.onlineSyncEnabled = enabled;
    this.bgmAnchorMs = anchorMs;
    this.serverNowFn = serverNowFn;
    this.bgm?.setOnlineSync(enabled, anchorMs, serverNowFn);
  }

  /** BGMを流す(同じ曲なら何もしない) */
  public playBgm(track: BgmTrack) {
    this.wantedTrack = track;
    if (!this.ctx) this.initCtx(); // 操作前は音が止まったまま待機し、最初の操作で鳴り出す
    if (this.ctx) this.startBgmNow();
  }

  public stopBgm() {
    this.wantedTrack = null;
    this.bgm?.stop();
  }

  /** 仕切りや決着の間は、太鼓と低音だけの静かな演奏にする */
  public setBgmCalm(calm: boolean) {
    this.bgm?.setCalm(calm);
  }

  /** 大きな爆発のあいだ、BGMを一時的に下げる */
  public duckBgm(seconds: number) {
    if (!this.ctx || !this.bgmGain || this.isMuted) return;
    const t = this.ctx.currentTime;
    const g = this.bgmGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(SoundManager.BGM_VOLUME * 0.2, t + 0.05);
    g.linearRampToValueAtTime(SoundManager.BGM_VOLUME, t + seconds);
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playHarite() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // 張り手（鋭い破裂音・肉体打撃音）
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.1);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // ノイズ（スナップ感）
    this.playNoise(0.06, 0.4, 1800);
  }

  public playGuard() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // ガード成功音（硬質なブロック・受け止め「カキィン！」）
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(440, t + 0.1);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.14);

    // 高周波スナップ
    this.playNoise(0.08, 0.35, 3200);
  }

  public playGuardBreak() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // ガードクラッシュ音（シールド粉砕・大衝撃「ガシャァン！」）
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(400, t);
    osc1.frequency.exponentialRampToValueAtTime(60, t + 0.35);

    gain1.gain.setValueAtTime(0.8, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.4);

    // 割れるような金属ガラスノイズ
    this.playNoise(0.3, 0.7, 4500);
  }

  public playDaze() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // スタン・ピヨピヨ音
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.linearRampToValueAtTime(1200, t + 0.1);
    osc.frequency.linearRampToValueAtTime(700, t + 0.2);

    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);
  }



  public playBuchikamashiCharge(progress: number) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    // チャージ音（うなり・周波数上昇）
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    const baseFreq = 80 + progress * 240;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.linearRampToValueAtTime(baseFreq + 30, t + 0.05);

    gain.gain.setValueAtTime(0.12 * Math.min(1, progress + 0.2), t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

    // フィルター
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400 + progress * 1000, t);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  public playBuchikamashiHit(powerRatio: number = 1.0) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // ぶちかまし（重厚な爆発音・超ド迫力インパクト）
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.35);

    const volume = Math.min(1.0, 0.6 + powerRatio * 0.4);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.4);

    // 爆発的低周波ノイズ
    this.playNoise(0.25, volume * 0.8, 600);
  }

  public playSuriasi() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    // すり足（砂を擦るようなシュッという音）
    this.playNoise(0.1, 0.25, 2400);
  }

  public playTaiko() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // 和太鼓（ドン！）
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.5);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  public playHyoshigi() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    // 拍子木（カーン！）
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2400, t);
    osc.frequency.exponentialRampToValueAtTime(1900, t + 0.15);

    gain.gain.setValueAtTime(0.6, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  public playRingOut() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    // 場外落下音
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.6);

    setTimeout(() => {
      this.playTaiko();
    }, 400);
  }

  /** 爆発音。重い低音の"ドン"に、砕ける音と、あとを引く轟きを重ねる */
  public playExplosion(power: number = 1) {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.7 * power);
    gain.gain.setValueAtTime(0.95, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.9 * power);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + 0.9 * power);

    this.playNoise(0.35 * power, 0.7, 3200); // 砕ける音
    this.playNoise(1.2 * power, 0.4, 420); // 轟き
  }

  private playNoise(duration: number, volume: number, cutoff: number) {
    if (!this.ctx) return;

    const noise = this.ctx.createBufferSource();
    noise.buffer = createWhiteNoiseBuffer(this.ctx, duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, this.ctx.currentTime);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start(this.ctx.currentTime);
  }
}
