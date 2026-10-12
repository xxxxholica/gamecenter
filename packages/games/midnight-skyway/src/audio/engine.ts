import { readGamepads } from '../../../../shared/gamepadFrame';
// Web Audio の土台: AudioContext、BGM/SEのバス、ミュート(Mキー)、自動再生制限の解除、タブ非表示時の停止。
// 音はすべて合成で、外部の音声ファイルは使わない。

const MUTE_KEY = 'skyway_muted';
const MASTER_VOLUME = 0.8;

export class AudioEngine {
  public readonly ctx: AudioContext;
  /** BGMだけを一時的に下げる(ポーズ・リザルト用) */
  public readonly musicDuck: GainNode;
  public readonly musicBus: GainNode;
  public readonly sfxBus: GainNode;
  /** BGMの残響。各曲のパッドとリードから送る */
  public readonly reverbSend: GainNode;
  public muted = false;

  private readonly master: GainNode;
  private readonly noiseBuf: AudioBuffer;
  private readyCallbacks: Array<() => void> = [];
  private suspendedByHide = false;
  private toastTimer = 0;

  constructor() {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    const ctx = this.ctx;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -12;
    limiter.knee.value = 8;
    limiter.ratio.value = 6;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;

    this.master = ctx.createGain();
    limiter.connect(this.master);
    this.master.connect(ctx.destination);

    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(limiter);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(limiter);

    const convolver = ctx.createConvolver();
    convolver.buffer = this.makeImpulse(1.8);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 1;
    this.reverbSend.connect(convolver);
    convolver.connect(this.musicDuck);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      // 保存できない環境では音あり
    }
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') this.flushReady();
    });
    this.installUnlock();
    this.installMuteKey();
    this.installVisibility();
  }

  public get running(): boolean {
    return this.ctx.state === 'running';
  }

  /** 音が出せる状態になったら(最初の入力後)実行する。すでに出せるなら即実行 */
  public whenRunning(cb: () => void): void {
    if (this.running) cb();
    else this.readyCallbacks.push(cb);
  }

  private flushReady(): void {
    const list = this.readyCallbacks;
    this.readyCallbacks = [];
    list.forEach((cb) => cb());
  }

  /** ホワイトノイズの再生元。start位置をずらして毎回違う音にする */
  public noiseSource(loop = false): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    return src;
  }

  public noiseOffset(): number {
    return Math.random() * 1.0;
  }

  private makeImpulse(seconds: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    return buf;
  }

  // ブラウザは最初のキー/ポインタ操作があるまで音を出させない。操作のたびにresumeを試みる。
  // (ゲームパッドのボタンはブラウザに「操作」と数えられない場合がある。その場合はキーボード/マウスの最初の入力で鳴り始める)
  private installUnlock(): void {
    const events = ['keydown', 'pointerdown', 'touchstart', 'mousedown'];
    const unlock = () => {
      if (this.running) {
        events.forEach((e) => window.removeEventListener(e, unlock, true));
        return;
      }
      void this.ctx.resume();
    };
    events.forEach((e) => window.addEventListener(e, unlock, true));

    const pollPad = () => {
      if (this.running) return;
      const pads = readGamepads();
      for (const pad of pads) {
        if (pad?.connected && pad.buttons.some((b) => b.pressed)) {
          void this.ctx.resume();
          break;
        }
      }
      requestAnimationFrame(pollPad);
    };
    requestAnimationFrame(pollPad);
  }

  private installMuteKey(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyM' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
      this.setMuted(!this.muted);
    });
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.03);
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      // 保存できなくても切り替えは効く
    }
    this.toast(muted ? 'SOUND OFF  (M)' : 'SOUND ON  (M)');
  }

  private toast(text: string): void {
    let el = document.getElementById('audio-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'audio-toast';
      el.style.cssText = 'position:fixed;top:14px;right:16px;z-index:2147483001;padding:6px 14px;font:900 13px/1 system-ui,sans-serif;letter-spacing:2px;color:#fff;background:rgba(5,8,14,.82);border-left:4px solid #00f0ff;pointer-events:none;transition:opacity .3s';
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { if (el) el.style.opacity = '0'; }, 1400);
  }

  private installVisibility(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.running) {
          this.suspendedByHide = true;
          void this.ctx.suspend();
        }
      } else if (this.suspendedByHide) {
        this.suspendedByHide = false;
        void this.ctx.resume();
      }
    });
  }
}
