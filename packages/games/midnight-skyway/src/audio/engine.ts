import { readGamepads } from '../../../../shared/gamepadFrame';
import { createWhiteNoiseBuffer } from '../../../../shared/audioUtils';
import { audioRandom } from '../../../../shared/arcadeReplay';   // 音の乱数は、操作の記録・再生で追う乱数と分ける

// Web Audio の土台: AudioContext、BGM/SEのバス、自動再生制限の解除、タブ非表示時の停止。
// 効果音はすべて合成。BGMだけは public/bgm の音源ファイルを使う(music.ts)。

const MASTER_VOLUME = 0.8;

export class AudioEngine {
  public readonly ctx: AudioContext;
  /** BGMだけを一時的に下げる(ポーズ・リザルト用) */
  public readonly musicDuck: GainNode;
  public readonly musicBus: GainNode;
  public readonly sfxBus: GainNode;

  private readonly master: GainNode;
  private readonly noiseBuf: AudioBuffer;
  private readyCallbacks: Array<() => void> = [];
  private suspendedByHide = false;

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
    this.musicBus.gain.value = 0.8;
    this.musicBus.connect(limiter);
    this.musicDuck = ctx.createGain();
    this.musicDuck.connect(this.musicBus);

    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.65;
    this.sfxBus.connect(limiter);

    this.noiseBuf = createWhiteNoiseBuffer(ctx, 2);

    this.master.gain.value = MASTER_VOLUME;

    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') this.flushReady();
    });
    this.installUnlock();
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
    return audioRandom() * 1.0;
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
