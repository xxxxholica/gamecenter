import { createWhiteNoiseBuffer } from '../../../../shared/audioUtils';
/**
 * Web Audio API プロシージャルサウンドシステム
 * 外部音声ファイルゼロで迫力あるアーケードSEと動的テンポBGMを生成
 */
export class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  // BGM関連
  private isBgmPlaying: boolean = false;
  private bgmTimer: number | null = null;
  private currentStep: number = 0;
  private bpm: number = 135;

  constructor() {
    // ユーザーインタラクション時にAudioContextを初期化
  }

  private initContext(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AudioCtx();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    this.bgmGain = this.ctx.createGain();
    this.bgmGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    this.bgmGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
  }

  public unlock(): void {
    this.initContext();
  }

  /**
   * 単語帳シュリケン発射音（シャキッ、高速の風切り音）
   */
  public playShuriken(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.09);
  }

  /**
   * 百科事典ボム投擲音（重量感あるスイング音）
   */
  public playBombThrow(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(320, t + 0.15);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.25);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.26);
  }

  /**
   * 百科事典ボム大爆発音（大音量重低音＋ホワイトノイズ爆発）
   */
  public playHugeExplosion(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. ノイズによる爆風音
    const buffer = createWhiteNoiseBuffer(this.ctx, 1.2, (t) => Math.exp(-t / 0.35));

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    // ローパスフィルターで重低音強調
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, t);
    filter.frequency.exponentialRampToValueAtTime(80, t + 1.0);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(1.0, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 1.1);

    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);

    // 2. 超低音サブウーファーキック
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, t);
    subOsc.frequency.exponentialRampToValueAtTime(25, t + 0.6);

    subGain.gain.setValueAtTime(0.8, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    subOsc.connect(subGain);
    subGain.connect(this.sfxGain);

    noiseSource.start(t);
    subOsc.start(t);
    subOsc.stop(t + 0.7);
  }

  /**
   * 机・椅子の粉砕音（木材破砕）
   */
  public playDeskBreak(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(350, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.18);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.19);
  }

  /**
   * ロッカー粉砕音（金属破壊）
   */
  public playLockerBreak(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);

    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.31);
  }

  /**
   * スライディング音（ズザーッという床摩擦音）
   */
  public playSlide(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const buffer = createWhiteNoiseBuffer(this.ctx, 0.35, () => 0.5);

    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, t);
    filter.Q.setValueAtTime(1.5, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    noiseSource.start(t);
  }

  /**
   * ジャンプ音（爽快な跳躍音）
   */
  public playJump(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, t);
    osc.frequency.exponentialRampToValueAtTime(620, t + 0.15);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.19);
  }

  /**
   * 先生の出席簿投擲音（鋭い風切り投擲音）
   */
  public playTeacherAttack(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.12);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  /**
   * 致命的クラッシュ即死音（激しい激突・ガラス・金属破砕音）
   */
  public playFatalCrash(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 1. ノイズ爆発
    const buffer = createWhiteNoiseBuffer(this.ctx, 0.8, (t) => Math.exp(-t / 0.15));
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;

    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'lowpass';
    nFilter.frequency.setValueAtTime(2000, t);
    nFilter.frequency.exponentialRampToValueAtTime(100, t + 0.6);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(1.0, t);
    nGain.gain.exponentialRampToValueAtTime(0.01, t + 0.7);

    noiseSource.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.sfxGain);
    noiseSource.start(t);

    // 2. ディストーション衝突音
    const osc = this.ctx.createOscillator();
    const oGain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.5);

    oGain.gain.setValueAtTime(0.8, t);
    oGain.gain.exponentialRampToValueAtTime(0.01, t + 0.55);

    osc.connect(oGain);
    oGain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.56);
  }

  /**
   * レーン移動ステップ音
   */
  public playStep(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.06);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.06);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  /**
   * 看板くぐり抜け成功音
   */
  public playSignDodge(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t); // C5
    osc.frequency.exponentialRampToValueAtTime(1046.5, t + 0.12); // C6

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.16);
  }

  /**
   * 暴走配膳台突進音（ガラガラという金属車輪の疾走音）
   */
  public playCartRush(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.linearRampToValueAtTime(220, t + 0.28);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.32);
  }

  /**
   * 倒壊ロッカーの倒れ込み衝撃音（ドサッ・バタン！）
   */
  public playLockerFall(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.25);

    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.28);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.29);
  }

  /**
   * バウンドボールの弾む音（ボヨン・ダムッ）
   */
  public playBallBounce(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(90, t + 0.12);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  /**
   * 清掃ポリッシャーの回転モーター音
   */
  public playPolisherHum(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.linearRampToValueAtTime(105, t + 0.1);
    osc.frequency.linearRampToValueAtTime(95, t + 0.2);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.23);
  }

  /**
   * コンボ加算音（コンボ数に応じてピッチアップ）
   */
  public playCombo(comboCount: number): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = 440; // A4
    const semitones = Math.min(24, comboCount);
    const freq = baseFreq * Math.pow(2, semitones / 12);

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.25, t + 0.1);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.13);
  }

  /**
   * ゴールド単語帳（アイテム）取得音（爽快なチャリン♪ピロリン音、連続獲得でピッチアップ）
   */
  public playCoin(streak: number = 0): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const baseFreq = 987.77; // B5
    const pitchOffset = Math.min(12, streak) * 1.5;
    const f1 = baseFreq * Math.pow(2, pitchOffset / 12);
    const f2 = f1 * 1.334; // 約4度上 (E6)

    // 音1 (B5)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(f1, t);
    gain1.gain.setValueAtTime(0.32, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc1.connect(gain1);
    gain1.connect(this.sfxGain);
    osc1.start(t);
    osc1.stop(t + 0.1);

    // 音2 (E6)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(f2, t + 0.05);
    gain2.gain.setValueAtTime(0.35, t + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc2.connect(gain2);
    gain2.connect(this.sfxGain);
    osc2.start(t + 0.05);
    osc2.stop(t + 0.18);
  }

  /**
   * スピードアップ加速警告音
   */
  public playSpeedUp(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const st = t + i * 0.1;
      osc.frequency.setValueAtTime(880 + i * 220, st);

      gain.gain.setValueAtTime(0.3, st);
      gain.gain.exponentialRampToValueAtTime(0.01, st + 0.08);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(st);
      osc.stop(st + 0.09);
    }
  }

  /**
   * 無敵パワーアップ獲得音（煌びやかな上昇アルペジオ＋シマー）
   */
  public playPowerUpCollect(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6

    notes.forEach((freq, i) => {
      const st = t + i * 0.055;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.32, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + 0.36);
    });

    // シマーノイズ（きらめき）
    const buffer = createWhiteNoiseBuffer(this.ctx, 0.4, (t) => Math.exp(-t / 0.12));
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(3000, t);
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.sfxGain);
    noiseSource.start(t);
  }

  /**
   * 無敵状態の終了警告音（下降するパワーダウン音）
   */
  public playInvincibleEnd(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.4);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.43);
  }

  /**
   * カウントダウン前「見つかった！」追跡演出の警告音（甲高いサイレン＋怒声バーク）
   */
  public playCaughtAlarm(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;

    // 甲高い警笛サイレン（2音を素早く往復）
    const sirenOsc = this.ctx.createOscillator();
    const sirenGain = this.ctx.createGain();
    sirenOsc.type = 'square';
    for (let i = 0; i < 5; i++) {
      sirenOsc.frequency.setValueAtTime(i % 2 === 0 ? 880 : 660, t + i * 0.16);
    }
    sirenGain.gain.setValueAtTime(0.28, t);
    sirenGain.gain.setValueAtTime(0.28, t + 0.7);
    sirenGain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
    sirenOsc.connect(sirenGain);
    sirenGain.connect(this.sfxGain);
    sirenOsc.start(t);
    sirenOsc.stop(t + 0.86);

    // 怒声バーク（低く鋭い一喝）
    const barkOsc = this.ctx.createOscillator();
    const barkGain = this.ctx.createGain();
    barkOsc.type = 'sawtooth';
    barkOsc.frequency.setValueAtTime(220, t);
    barkOsc.frequency.exponentialRampToValueAtTime(90, t + 0.3);
    barkGain.gain.setValueAtTime(0.5, t);
    barkGain.gain.exponentialRampToValueAtTime(0.01, t + 0.32);
    barkOsc.connect(barkGain);
    barkGain.connect(this.sfxGain);
    barkOsc.start(t);
    barkOsc.stop(t + 0.33);
  }

  /**
   * 追跡演出 → カウントダウンへの切り替え「ダッシュ」効果音
   */
  public playEscapeDash(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1400, t + 0.22);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * 校門突破（クリア）演出の開始を彩る、勝ち誇るファンファーレ
   */
  public playClearFanfare(): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    // 上昇アルペジオ（C5-E5-G5-C6）＋最後にメジャーコードを伸ばす
    const arpeggio = [523.25, 659.25, 783.99, 1046.5];
    arpeggio.forEach((freq, i) => {
      const st = t + i * 0.11;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.3, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.4);
      osc.connect(gain);
      gain.connect(this.sfxGain!);
      osc.start(st);
      osc.stop(st + 0.41);
    });

    // 締めのメジャーコード（C-E-G）を伸ばして開放感を演出
    const chordStart = t + 0.45;
    const chordFreqs = [523.25, 659.25, 783.99, 1046.5];
    for (const freq of chordFreqs) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, chordStart);
      gain.gain.setValueAtTime(0.001, chordStart);
      gain.gain.linearRampToValueAtTime(0.22, chordStart + 0.08);
      gain.gain.setValueAtTime(0.22, chordStart + 0.7);
      gain.gain.exponentialRampToValueAtTime(0.001, chordStart + 1.3);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(chordStart);
      osc.stop(chordStart + 1.31);
    }
  }

  /**
   * BGM開始 / 停止 / テンポ変更
   */
  public startBgm(): void {
    if (this.isBgmPlaying) return;
    this.initContext();
    this.isBgmPlaying = true;
    this.currentStep = 0;
    this.bpm = 135;
    this.scheduleBgmNote();
  }

  public stopBgm(): void {
    this.isBgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  public setSpeedFactor(factor: number): void {
    // 速度に応じてBPMを 135 から最大 175 まで加速
    this.bpm = 135 + (factor - 1.0) * 40;
    this.bpm = Math.min(185, Math.max(130, this.bpm));
  }

  private scheduleBgmNote = (): void => {
    if (!this.isBgmPlaying || !this.ctx || !this.bgmGain) return;

    const t = this.ctx.currentTime;
    const stepInterval = (60 / this.bpm) / 4; // 16分音符

    // 疾走ドラムンベース風ベースライン (Aマイナー)
    // A2, C3, D3, E3, G3
    const bassNotes = [
      110.0, 110.0, 130.81, 110.0,
      146.83, 110.0, 164.81, 146.83,
      110.0, 110.0, 196.0, 164.81,
      146.83, 130.81, 123.47, 110.0
    ];

    const noteFreq = bassNotes[this.currentStep % bassNotes.length];

    // ベースオシレーター
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(noteFreq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, t);
    filter.frequency.exponentialRampToValueAtTime(150, t + stepInterval * 0.9);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + stepInterval * 0.95);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.bgmGain);

    osc.start(t);
    osc.stop(t + stepInterval);

    // 4ステップごとにキックドラム
    if (this.currentStep % 4 === 0) {
      const kickOsc = this.ctx.createOscillator();
      const kickGain = this.ctx.createGain();
      kickOsc.type = 'sine';
      kickOsc.frequency.setValueAtTime(140, t);
      kickOsc.frequency.exponentialRampToValueAtTime(30, t + 0.12);

      kickGain.gain.setValueAtTime(0.4, t);
      kickGain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

      kickOsc.connect(kickGain);
      kickGain.connect(this.bgmGain);

      kickOsc.start(t);
      kickOsc.stop(t + 0.14);
    }

    // 8ステップおきにスネア
    if (this.currentStep % 8 === 4) {
      const snareBuf = createWhiteNoiseBuffer(this.ctx, 0.1, (t) => Math.exp(-t / 0.03));
      const sSource = this.ctx.createBufferSource();
      sSource.buffer = snareBuf;
      const sGain = this.ctx.createGain();
      sGain.gain.setValueAtTime(0.25, t);
      sGain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);

      sSource.connect(sGain);
      sGain.connect(this.bgmGain);
      sSource.start(t);
    }

    this.currentStep++;
    this.bgmTimer = window.setTimeout(this.scheduleBgmNote, stepInterval * 1000);
  };

  /**
   * カウントダウン電子音（3, 2, 1 = ピッ、GO = ポーン！）
   */
  public playCountdownBeep(isGo: boolean): void {
    this.initContext();
    if (!this.ctx || !this.sfxGain) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    if (!isGo) {
      // 3, 2, 1: 鋭いカウントダウン電子ピッ音
      osc.type = 'square';
      osc.frequency.setValueAtTime(660, t);
      osc.frequency.setValueAtTime(880, t + 0.04);

      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.13);
    } else {
      // GO: 華やかな高音スタートチャイム・ファンファーレ
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1760, t + 0.08);

      gain.gain.setValueAtTime(0.6, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1320, t);
      osc2.frequency.exponentialRampToValueAtTime(2200, t + 0.1);
      gain2.gain.setValueAtTime(0.35, t);
      gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.connect(gain);
      osc2.connect(gain2);
      gain.connect(this.sfxGain);
      gain2.connect(this.sfxGain);

      osc.start(t);
      osc.stop(t + 0.46);
      osc2.start(t);
      osc2.stop(t + 0.51);
    }
  }
}
