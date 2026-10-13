import { SynthSfx } from './SynthSfx';
import { SynthBgm, BgmTrack } from './SynthBgm';
import { GameSettings } from '../types';

// 音声の初期化前(ブラウザの操作待ち)でも sfx / bgm を呼べるよう、何もしない代役を置いておく。
const NOOP = new Proxy({}, { get: () => () => {} }) as never;

export class SoundManager {
  private static instance: SoundManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;

  public sfx: SynthSfx = NOOP;
  public bgm: SynthBgm = NOOP;

  // タイトルのデモ中は効果音を鳴らさない
  private silent: boolean = false;

  private isMuted: boolean = false;
  private masterVol: number = 0.8;
  private bgmVol: number = 0.7;
  private sfxVol: number = 0.85;

  private initialized: boolean = false;

  private constructor() {}

  public static getInstance(): SoundManager {
    if (!SoundManager.instance) {
      SoundManager.instance = new SoundManager();
    }
    return SoundManager.instance;
  }

  public init() {
    if (this.initialized) return;

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.bgmGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.masterGain.gain.setValueAtTime(this.masterVol, this.ctx.currentTime);
      this.bgmGain.gain.setValueAtTime(this.bgmVol, this.ctx.currentTime);
      this.sfxGain.gain.setValueAtTime(this.silent ? 0 : this.sfxVol, this.ctx.currentTime);

      this.bgmGain.connect(this.masterGain);
      this.sfxGain.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      this.sfx = new SynthSfx(this.ctx, this.sfxGain);
      this.bgm = new SynthBgm(this.ctx, this.bgmGain);

      this.initialized = true;

      // Resume context if suspended
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    } catch (e) {
      console.warn('AudioContext initialization failed:', e);
    }
  }

  public ensureContext() {
    if (!this.initialized) {
      this.init();
    } else if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public playTrack(track: BgmTrack) {
    this.ensureContext();
    if (this.bgm) {
      this.bgm.setTrack(track);
    }
  }

  public stopBgm() {
    if (this.bgm) {
      this.bgm.stop();
    }
  }

  public setBgmVolume(vol: number) {
    this.bgmVol = Math.max(0, Math.min(1, vol));
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setValueAtTime(this.bgmVol, this.ctx.currentTime);
    }
  }

  public setSilent(on: boolean) {
    this.silent = on;
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(on ? 0 : this.sfxVol, this.ctx.currentTime);
    }
  }

  public setSfxVolume(vol: number) {
    this.sfxVol = Math.max(0, Math.min(1, vol));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.silent ? 0 : this.sfxVol, this.ctx.currentTime);
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : this.masterVol, this.ctx.currentTime);
    }
    return this.isMuted;
  }

  public getSettings(): GameSettings {
    return {
      masterVolume: this.masterVol,
      bgmVolume: this.bgmVol,
      sfxVolume: this.sfxVol,
      isMuted: this.isMuted,
      fullscreen: !!document.fullscreenElement,
    };
  }
}
