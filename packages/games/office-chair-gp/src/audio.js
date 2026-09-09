// ============================================================================
// audio.js - Web Audio API Arcade Sound Synthesizer
// ============================================================================

export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.initialized = false;

    // Continuous sound nodes
    this.jetNode = null;
    this.jetGain = null;

    this.rollNode = null;
    this.rollGain = null;

    this.driftNode = null;
    this.driftGain = null;

    this.footNode = null;
    this.footGain = null;
  }

  init() {
    if (this.initialized) return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.ctx = new AudioContext();

    this._createJetEngine();
    this._createRollSound();
    this._createFootBrakeSound();

    this.initialized = true;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Create pink/white noise buffer for rocket jet
  _createNoiseBuffer(seconds = 2) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      // Brown/Pink mixed noise
      data[i] = (lastOut + 0.04 * white) / 1.04;
      lastOut = data[i];
      data[i] *= 3.5; // Gain
    }
    return buffer;
  }

  _createWhiteNoiseBuffer(seconds = 2) {
    const bufferSize = this.ctx.sampleRate * seconds;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _createJetEngine() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer();
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;

    const highFilter = this.ctx.createBiquadFilter();
    highFilter.type = 'peaking';
    highFilter.frequency.value = 2400;
    highFilter.gain.value = 8;

    this.jetGain = this.ctx.createGain();
    this.jetGain.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(highFilter);
    highFilter.connect(this.jetGain);
    this.jetGain.connect(this.ctx.destination);
    noise.start(0);

    this.jetNode = noise;
  }

  _createRollSound() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer();
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 600;
    filter.Q.value = 1.8;

    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(this.rollGain);
    this.rollGain.connect(this.ctx.destination);
    noise.start(0);

    this.rollNode = noise;
  }

  _createFootBrakeSound() {
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createWhiteNoiseBuffer();
    noise.loop = true;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 3.0;

    this.footGain = this.ctx.createGain();
    this.footGain.gain.value = 0.0001;

    noise.connect(filter);
    filter.connect(this.footGain);
    this.footGain.connect(this.ctx.destination);
    noise.start(0);

    this.footNode = noise;
  }

  // Update dynamic continuous sounds
  update({ isJetting, speedKmH, isBraking, isDrifting, isMud }) {
    if (!this.initialized || !this.ctx) return;

    const now = this.ctx.currentTime;

    // Jet sound
    if (this.jetGain) {
      const targetJetVol = isJetting ? 0.85 : 0.0001;
      this.jetGain.gain.setTargetAtTime(targetJetVol, now, 0.04);
    }

    // Ground roll sound (speed-based)
    if (this.rollGain) {
      const normSpeed = Math.min(1.0, speedKmH / 160);
      const targetRollVol = normSpeed > 0.02 ? normSpeed * 0.4 : 0.0001;
      this.rollGain.gain.setTargetAtTime(targetRollVol, now, 0.05);
    }

    // Foot brake / heavy drift screech
    if (this.footGain) {
      let targetFootVol = 0.0001;
      if (isBraking && speedKmH > 10) {
        targetFootVol = 0.65;
      } else if (isDrifting && speedKmH > 35) {
        targetFootVol = 0.35;
      }
      this.footGain.gain.setTargetAtTime(targetFootVol, now, 0.05);
    }
  }

  // One-shot: トンボ踏みボヨン音
  playTomboBounce() {
    if (!this.initialized || !this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(520, now + 0.12);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.35);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  }

  // One-shot: 散乱物（パイロン・ハードル）ヒット音
  playObstacleHit() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.15);

    gain.gain.setValueAtTime(0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // One-shot: 壁・敵NPCとの接触バウンド打撃音
  playWallHit(vol = 0.8) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Metal thump oscillator
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.18);

    gain.gain.setValueAtTime(Math.min(1.0, vol), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);

    // Metal click noise transient
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createWhiteNoiseBuffer(0.1);
    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.value = 1600;
    nFilter.Q.value = 3.0;

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(vol * 0.7, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.1);
  }

  // One-shot: ボンベ投擲風切り音
  playThrowBomb() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.2);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.25);
  }

  // One-shot: ボンベ炸裂大爆発音 (重低音サブベース＋強烈な炸裂ノイズ＋爆風残響)
  playBombExplode() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    // 1. Heavy sub-bass seismic thump (180Hz -> 24Hz)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(24, now + 0.65);

    gain.gain.setValueAtTime(1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.75);

    // 2. Powerful explosion powder blast noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createNoiseBuffer(1.0);
    const nFilter = this.ctx.createBiquadFilter();
    nFilter.type = 'lowpass';
    nFilter.frequency.setValueAtTime(2400, now);
    nFilter.frequency.exponentialRampToValueAtTime(90, now + 0.85);

    const nGain = this.ctx.createGain();
    nGain.gain.setValueAtTime(1.2, now);
    nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);

    noise.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.95);

    // 3. Shockwave high-frequency initial detonation snap
    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(550, now);
    snapOsc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
    snapGain.gain.setValueAtTime(0.7, now);
    snapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    snapOsc.connect(snapGain);
    snapGain.connect(this.ctx.destination);
    snapOsc.start(now);
    snapOsc.stop(now + 0.15);
  }

  // One-shot: ジャンプ台打ち上げ音
  playJumpRamp() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(720, now + 0.25);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  // One-shot: 加速パッド踏破ブースト音
  playBoostPad() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(1400, now + 0.28);

    gain.gain.setValueAtTime(0.7, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.42);
  }

  // One-shot: 土の盛り上がり跳ね上がり音 (バンプホップ)
  playBumpHop() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.18);

    gain.gain.setValueAtTime(0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  // One-shot: 窪み突入衝撃音 (ディップ底づき音)
  playDipImpact() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.16);

    gain.gain.setValueAtTime(0.65, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }

  // One-shot: 石灰ライン引き突入音
  playLimeHit() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createWhiteNoiseBuffer(1);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3000, now);
    filter.frequency.exponentialRampToValueAtTime(500, now + 0.4);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.8, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 0.5);
  }

  // One-shot: 大破クラッシュ音
  playCrash() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;

    // Explosion blast noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this._createWhiteNoiseBuffer(1.5);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.8);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + 1.2);

    // Deep sub bass boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(25, now + 0.6);

    subGain.gain.setValueAtTime(0.9, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);

    subOsc.connect(subGain);
    subGain.connect(this.ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.7);
  }

  // One-shot: カウントダウン音
  playBeep(isHigh = false) {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(isHigh ? 880 : 440, now);

    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isHigh ? 0.4 : 0.15));

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + (isHigh ? 0.45 : 0.2));
  }

  // One-shot: 完走ファンファーレ
  playFanfare() {
    if (!this.initialized || !this.ctx) return;
    const notes = [
      { f: 523.25, d: 0.15, t: 0.0 }, // C5
      { f: 659.25, d: 0.15, t: 0.15 }, // E5
      { f: 783.99, d: 0.15, t: 0.3 }, // G5
      { f: 1046.50, d: 0.7, t: 0.45 } // C6
    ];

    const now = this.ctx.currentTime;
    notes.forEach((n) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(n.f, now + n.t);

      const start = now + n.t;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.4, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + n.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + n.d + 0.05);
    });
  }

  stopAll() {
    if (!this.initialized || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.jetGain) this.jetGain.gain.setValueAtTime(0.0001, now);
    if (this.rollGain) this.rollGain.gain.setValueAtTime(0.0001, now);
    if (this.footGain) this.footGain.gain.setValueAtTime(0.0001, now);
  }
}
