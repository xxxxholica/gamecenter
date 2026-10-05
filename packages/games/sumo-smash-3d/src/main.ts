import * as THREE from 'three';
import { PhysicsWorld } from './physics/PhysicsWorld';
import { Dohyo } from './entities/Dohyo';
import { Audience } from './entities/Audience';
import { SumoFighter } from './entities/SumoFighter';
import { InputManager } from './input/InputManager';
import { SoundManager } from './audio/SoundManager';
import { ParticleManager } from './effects/ParticleManager';
import { UIManager, GameMode } from './ui/UIManager';
import { SumoAI } from './ai/SumoAI';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { ModeSelect } from '../../../shared/online/ModeSelect';
import { MenuNav } from '../../../shared/arcadeMenuNav';
import { PadEdge, readPad } from '../../../shared/arcadePad';
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';

// SELECT長押しでハブ(ゲーム選択画面)へ戻る
installHomeReturn();
// リザルトで無操作が続いたらタイトルへ戻る
watchResultAutoReturn(['result-btn-title']);

// games/<slug>/ 配下からハブ(ルート)へは2階層上
const HUB_URL = '../../';
const ACCENT = '#e63946';

// 画面左下の共通ボタンガイド(場面ごとに差し替える)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true });
const guideModeSelect = () => mountArcadeGuide({
  moveLabel: 'モード選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideHowTo = () => mountArcadeGuide({ buttons: [{ indices: [0, 1], label: '閉じる' }], showHomeHint: true });
const guideBattle = () => mountArcadeGuide({
  moveLabel: '移動',
  buttons: [
    { indices: [0], label: '張り手' },
    { indices: [1], label: 'ぶちかまし・長押しでタメ' },
    { indices: [2], label: '四股' },
    { indices: [3, 4], label: 'つかみ' },
    { indices: [5], label: 'すり足' },
    { indices: [6, 7], label: '防御' },
  ],
  showHomeHint: true,
  position: 'top-left',
});
const guideResult = () => mountArcadeGuide({
  moveLabel: '選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '終了' },
  ],
  showHomeHint: true,
});

// モード選択カードの絵(固定のSVG)
const rikishi = (x: number, color: string) =>
  `<circle cx="${x}" cy="30" r="13" fill="#efc49b"/><rect x="${x - 20}" y="44" width="40" height="34" rx="14" fill="#efc49b"/><rect x="${x - 20}" y="66" width="40" height="12" rx="3" fill="${color}"/>`;
const versusArt = (rightLabel: string) => `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="100" cy="84" rx="92" ry="12" fill="#c9a36a"/>
  ${rikishi(52, '#1b4965')}${rikishi(148, '#8b1e0f')}
  <text x="100" y="58" text-anchor="middle" font-size="20" font-weight="900" fill="#fff">VS</text>
  <text x="52" y="14" text-anchor="middle" font-size="12" font-weight="900" fill="#7fd4ff">1P</text>
  <text x="148" y="14" text-anchor="middle" font-size="12" font-weight="900" fill="#ff9d8a">${rightLabel}</text>
</svg>`;
const GUIDE_ART = `<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
  <rect x="45" y="14" width="110" height="72" rx="4" fill="#f3e6c8" stroke="#8b6b3a" stroke-width="4"/>
  <rect x="38" y="10" width="124" height="10" rx="5" fill="#8b1e0f"/><rect x="38" y="80" width="124" height="10" rx="5" fill="#8b1e0f"/>
  <text x="100" y="62" text-anchor="middle" font-size="32" font-weight="900" fill="#3a2410" font-family="serif">指南</text>
</svg>`;

export type GameState = 'title' | 'menu' | 'battle';

class SumoGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private physics: PhysicsWorld;
  private dohyo: Dohyo;
  private audience: Audience;
  private player1: SumoFighter;
  private player2: SumoFighter;
  private ai: SumoAI;

  private inputManager: InputManager;
  private soundManager: SoundManager;
  private particleManager: ParticleManager;
  private uiManager: UIManager;

  // ゲーム状態
  private gameState: GameState = 'title';
  private gameMode: GameMode = 'pve';

  // 固定カメラの基本位置・注視点（クォータービュー）
  // 土俵が大きく見えるよう、真上寄りの斜め見下ろしを保ったまま近づけている
  private readonly cameraBasePos = new THREE.Vector3(0, 17.2, 18.4);
  private readonly cameraLookAt = new THREE.Vector3(0, 0.5, 0);

  // タイトル画面カメラ周回用
  private titleCameraAngle: number = 0;

  // カメラの正面・右ベクトル（移動ベクトル変換用）
  private camForward: THREE.Vector3 = new THREE.Vector3();
  // 毎フレーム使い回す作業用ベクトル(力士側は受け取った値を保持しない)
  private readonly p1PosTmp = new THREE.Vector3();
  private readonly p2PosTmp = new THREE.Vector3();
  private readonly hitTargetTmp = new THREE.Vector3();
  private readonly hitSourceTmp = new THREE.Vector3();
  private readonly worldMoveTmp = new THREE.Vector3();
  private camRight: THREE.Vector3 = new THREE.Vector3();

  // バトルラウンド管理
  private roundState: 'standby' | 'active' | 'finished' | 'match_over' = 'standby';
  private roundStandbyTimer: number = 0;
  private isRoundActive: boolean = false;
  private roundResetTimer: number = 0;
  private lastTime: number = 0;

  // 全ゲーム共通のタイトル画面・モード選択・メニュー操作
  private titleScreen: ArcadeTitleScreen;
  private modeSelect: ModeSelect;
  private menuNav = new MenuNav();
  private padEdge = new PadEdge();
  // 画面を切り替えた直後に、同じ押下が次の画面の決定・戻るとして二重に入らないようにする
  private inputArmTime: number = 0;

  constructor() {
    // 1. Three.js シーン初期化（明るくクリアなアリーナ空間）
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x191b22);
    this.scene.fog = new THREE.Fog(0x191b22, 42, 110);

    // 2. カメラ
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.1,
      100
    );
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(this.cameraLookAt);

    // カメラ基準の平面移動ベクトルの計算
    this.computeCameraVectors();

    // 3. WebGL レンダラー（明るく豊かな発色・ACESトーンマッピング）
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    document.body.appendChild(this.renderer.domElement);

    // 4. 照明（相撲場の吊り屋根照明）
    this.setupLighting();

    // 5. 各種マネージャー
    this.physics = new PhysicsWorld();
    this.soundManager = new SoundManager();
    this.particleManager = new ParticleManager(this.scene);
    this.inputManager = new InputManager();
    this.uiManager = new UIManager();

    // 6. 土俵ステージの構築
    this.dohyo = new Dohyo(this.physics);
    this.scene.add(this.dohyo.mesh);

    // 観客席・大相撲アリーナ（溜席・マス席・吊り屋根）の構築
    this.audience = new Audience({
      dohyoRadius: this.dohyo.radius,
      innerRadius: this.dohyo.radius + 1.4,
      outerRadius: 30.0,
      numRows: 14,
    });
    this.scene.add(this.audience.mesh);

    // 7. 力士の構築
    // 東方 蒼天龍（1P: 紺碧マワシ、画面左側・西向き）
    this.player1 = new SumoFighter(
      'p1',
      '蒼天龍',
      {
        skinColor: 0xefc49b,
        mawashiColor: 0x1b4965, // 紺碧
        hairColor: 0x111111,
      },
      this.physics,
      this.soundManager,
      this.particleManager,
      new THREE.Vector3(-4.6, 1.2, 0),
      Math.PI / 2 // 東から西（右向き）
    );
    this.scene.add(this.player1.mesh);

    // 西方 紅炎山（CPU/2P: 深紅マワシ、画面右側・東向き）
    this.player2 = new SumoFighter(
      'p2',
      '紅炎山',
      {
        skinColor: 0xebb485,
        mawashiColor: 0x8b1e0f, // 深紅
        hairColor: 0x111111,
      },
      this.physics,
      this.soundManager,
      this.particleManager,
      new THREE.Vector3(4.6, 1.2, 0),
      -Math.PI / 2 // 西から東（左向き）
    );
    this.scene.add(this.player2.mesh);

    // 8. 敵AI
    this.ai = new SumoAI(this.player2);

    // リサイズ監視
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // リザルトのメニュー移動(WASD / 矢印)は押した瞬間をためておく
    window.addEventListener('keydown', (e) => {
      if (this.uiManager.isVictoryModalOpen() && this.menuNav.pushKey(e)) e.preventDefault();
    });

    // リザルト画面: 再挑戦 / タイトルに戻る / ゲームを終了
    this.uiManager.onRematch = () => {
      this.uiManager.hideVictoryModal();
      this.soundManager.playTaiko();
      this.startBattle(this.gameMode);
    };
    this.uiManager.onReturnTitle = () => {
      this.uiManager.hideVictoryModal();
      this.returnToTitle();
    };
    this.uiManager.onExit = () => {
      window.location.href = HUB_URL;
    };
    // 相撲指南を閉じたらモード選択へ戻る
    this.uiManager.onHowToPlayClosed = () => {
      this.soundManager.playHarite();
      this.openModeSelect();
    };

    // タイトル画面(全ゲーム共通)。スタートでモード選択へ
    this.titleScreen = new ArcadeTitleScreen({
      slug: 'sumo-smash-3d',
      accentColor: ACCENT,
      tagline: '剛体物理シミュレーション相撲アクション',
      onStart: () => {
        this.soundManager.playHyoshigi();
        this.openModeSelect();
      },
    });
    this.modeSelect = new ModeSelect(
      { title: 'モード選択', accent: ACCENT },
      (id) => this.onModeSelected(id),
      () => {
        this.modeSelect.hide();
        this.returnToTitle();
      },
    );

    // 初期状態はタイトル画面
    this.showTitle();

    // アニメーションループ開始
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  private setupLighting() {
    // 1. 環境光（全体を明るく温かみのある光で底上げ）
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.95);
    this.scene.add(ambientLight);

    // 2. 吊り屋根メインスポットライト/トップライト（土俵全体を力強く照らす）
    const mainLight = new THREE.DirectionalLight(0xffffff, 1.8);
    mainLight.position.set(0, 28, 4);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.near = 5;
    mainLight.shadow.camera.far = 45;
    mainLight.shadow.camera.left = -14;
    mainLight.shadow.camera.right = 14;
    mainLight.shadow.camera.top = 14;
    mainLight.shadow.camera.bottom = -14;
    mainLight.shadow.bias = -0.0008;
    this.scene.add(mainLight);

    // 3. 全方位アリーナフィルライト（立体感とクッキリした筋肉・土俵の陰影）
    // 正面ライト（手前から力士正面を照らす）
    const frontFill = new THREE.DirectionalLight(0xfff8ee, 0.65);
    frontFill.position.set(0, 18, 22);
    this.scene.add(frontFill);

    // 東側ライト（東方力士・土俵東側を照らす）
    const eastFill = new THREE.DirectionalLight(0xffeedd, 0.7);
    eastFill.position.set(20, 15, 0);
    this.scene.add(eastFill);

    // 西側ライト（西方力士・土俵西側を照らす）
    const westFill = new THREE.DirectionalLight(0xffeedd, 0.7);
    westFill.position.set(-20, 15, 0);
    this.scene.add(westFill);

    // 背後リムライト（奥から輪郭を美しく縁取る）
    const rimLight = new THREE.DirectionalLight(0xaad4ff, 0.85);
    rimLight.position.set(0, 16, -22);
    this.scene.add(rimLight);
  }

  private computeCameraVectors() {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    this.camForward.set(dir.x, 0, dir.z).normalize();
    this.camRight.crossVectors(this.camForward, new THREE.Vector3(0, 1, 0)).normalize();
  }

  private onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /**
   * バトル開始
   */
  public startBattle(mode: GameMode) {
    this.gameMode = mode;
    this.gameState = 'battle';

    // カメラ位置を定位置へ
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(this.cameraLookAt);
    this.computeCameraVectors();

    // 力士とスコアリセット
    this.player1.wins = 0;
    this.player2.wins = 0;

    // 頭上マーカーのラベル更新（PvPなら2P、PvEならCPU）
    this.player1.setMarkerLabel('1P');
    this.player2.setMarkerLabel(mode === 'pvp' ? '2P' : 'CPU');

    // UI切り替え
    this.uiManager.setMode(mode);
    this.uiManager.hideTitleScreen();
    this.uiManager.hideVictoryModal();
    guideBattle();

    // 立ち合いシーケンス開始（初番勝負）
    this.startRoundSequence(true);
  }

  /**
   * 立ち合いシーケンス開始
   * 「見合って！見合って！」の構え待機を経て、「はっけよい！」の文字と同時に立ち合い（操作可能）開始！
   */
  private startRoundSequence(isFirstRound: boolean) {
    this.roundState = 'standby';
    this.isRoundActive = false;
    this.roundStandbyTimer = 0;

    // 蓄積ダメージリセット
    this.player1.damagePercent = 0;
    this.player2.damagePercent = 0;

    // 位置・剛体速度リセット
    this.player1.resetPosition();
    this.player2.resetPosition();
    this.player1.body.velocity.set(0, 0, 0);
    this.player2.body.velocity.set(0, 0, 0);

    // 構えアニメーション（仕切り線で静止構え）
    this.player1.model.updateAnimation(0.016, 'idle', 0, 0);
    this.player2.model.updateAnimation(0.016, 'idle', 0, 0);

    // 柝の音（カチーン！）
    this.soundManager.playHyoshigi();

    let roundTitle = '初番勝負';
    let subText = '蒼天龍 vs 紅炎山・二本先取';

    if (!isFirstRound) {
      if (this.player1.wins === 1 && this.player2.wins === 1) {
        roundTitle = '結びの一番・決戦！';
        subText = '星取り五分・1 - 1 勝者が優勝！';
      } else {
        roundTitle = '二番勝負';
        const leader = this.player1.wins > this.player2.wins ? '蒼天龍 王手！' : '紅炎山 王手！';
        subText = `星取り・${this.player1.wins} - ${this.player2.wins} ${leader}`;
      }
    }

    this.uiManager.showBanner('見合って！見合って！', `${roundTitle} ｜ ${subText}`, 1400);
  }

  /**
   * タイトル画面へ復帰
   */
  public returnToTitle() {
    this.showTitle();
    this.soundManager.playHyoshigi();
  }

  private showTitle() {
    this.gameState = 'title';
    this.armInput();
    this.uiManager.showTitleScreen();
    this.titleScreen.show();
    guideTitle();
  }

  /** モード選択(1P vs CPU / 相撲指南) */
  private openModeSelect() {
    this.gameState = 'menu';
    this.armInput();
    this.modeSelect.show([
      { id: 'pve', badge: '1P vs CPU', art: versusArt('CPU'), title: '幕内本割', sub: 'ひとりで遊ぶ', desc: 'CPUの力士と二本先取で勝負します。' },
      // 二人対戦(pvp)は今後オンライン対戦として実装予定のため一旦非表示
      { id: 'guide', badge: 'HOW TO PLAY', art: GUIDE_ART, title: '相撲指南', sub: '遊び方・技', desc: '操作方法と技の効果を確認します。' },
    ]);
    guideModeSelect();
  }

  private onModeSelected(id: string) {
    this.modeSelect.hide();
    if (id === 'guide') {
      this.armInput();
      this.uiManager.openHowToPlay();
      this.soundManager.playHarite();
      guideHowTo();
      return;
    }
    this.startBattle(id === 'pvp' ? 'pvp' : 'pve');
  }

  private armInput(ms: number = 300) {
    this.inputArmTime = performance.now() + ms;
  }

  private isInputArmed(): boolean {
    return performance.now() >= this.inputArmTime;
  }

  /**
   * メインループ
   */
  private gameLoop(time: number) {
    requestAnimationFrame(this.gameLoop.bind(this));

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    // アケコンの「押した瞬間」は毎フレーム取り出しておく(画面をまたいだ押しっぱなしを決定にしない)
    const padPress = this.padEdge.poll();

    if (this.gameState !== 'battle') {
      this.updateTitleScreen(dt, padPress.any(0, 1));
    } else if (this.roundState === 'match_over' && this.uiManager.isVictoryModalOpen()) {
      this.updateResultMenu(padPress.any(0, 9), padPress.any(1));
      this.updateBattle(dt);
    } else {
      this.updateBattle(dt);
    }

    // 観客の生き生きとしたアニメーション更新（ざわめき・熱狂・拍手）
    this.audience.update(dt, this.isRoundActive, this.particleManager.shakeIntensity);

    // 毎フレーム末尾で入力単発バッファをクリア
    this.inputManager.update();

    // レンダリング
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * タイトル画面中の更新
   */
  private updateTitleScreen(dt: number, padClose: boolean) {
    // カメラの優雅なアトラクト旋回
    this.titleCameraAngle += dt * 0.18;
    const camRadius = 20.0;
    this.camera.position.set(
      Math.sin(this.titleCameraAngle) * camRadius,
      12.5,
      Math.cos(this.titleCameraAngle) * camRadius
    );
    this.camera.lookAt(0, 1.2, 0);

    // 力士2人は構えアニメーション
    this.player1.model.updateAnimation(dt, 'idle', 0, 0);
    this.player2.model.updateAnimation(dt, 'idle', 0, 0);
    this.player1.updateMarkerAnimation(dt);
    this.player2.updateMarkerAnimation(dt);

    // 相撲指南を開いている間: A / B / Enter / Space / Esc で閉じる(閉じるとモード選択へ戻る)
    if (this.uiManager.isHowToPlayOpen()) {
      if (this.isInputArmed() && (padClose || this.inputManager.isKeyTriggered('Escape', 'Enter', 'Space', 'Backspace'))) {
        this.uiManager.closeHowToPlay();
      }
      return;
    }

    // タイトル画面で Esc: ハブへ戻る(スタートは共通タイトル画面、モード選択は共通モード選択が受け付ける)
    if (this.gameState === 'title' && this.isInputArmed() && this.inputManager.isKeyTriggered('Escape')) {
      window.location.href = HUB_URL;
    }
  }

  /**
   * リザルトのメニュー操作(再挑戦 / タイトルに戻る / ゲームを終了)
   */
  private updateResultMenu(padConfirm: boolean, padExit: boolean) {
    const pad = readPad();
    this.menuNav.updatePad(pad.left ? -1 : pad.right ? 1 : 0, pad.up ? -1 : pad.down ? 1 : 0);
    // 移動は受付待ちの間も効かせる(決定だけ誤爆防止で待たせる)
    for (const dir of this.menuNav.take()) {
      this.uiManager.moveResultSelection(dir);
      this.soundManager.playHarite();
    }
    if (!this.isInputArmed()) return;

    if (padConfirm || this.inputManager.isKeyTriggered('Enter', 'Space')) {
      this.uiManager.confirmCurrentResultSelection();
    } else if (padExit) {
      window.location.href = HUB_URL;
    }
  }

  /**
   * バトル中の更新
   */
  private updateBattle(dt: number) {
    // Esc: ハブへ戻る(アケコンは SELECT 長押し。全ゲーム共通)
    if (this.inputManager.isKeyTriggered('Escape')) {
      window.location.href = HUB_URL;
      return;
    }

    // 1. 立ち合い待機（仕切り中: 「見合って！見合って！」）
    if (this.roundState === 'standby') {
      this.roundStandbyTimer += dt;

      // 仕切り中は静止（移動や攻撃は一切受け付けない）
      this.player1.body.velocity.set(0, 0, 0);
      this.player2.body.velocity.set(0, 0, 0);
      this.player1.model.updateAnimation(dt, 'idle', 0, 0);
      this.player2.model.updateAnimation(dt, 'idle', 0, 0);
      this.physics.step(dt);
      this.particleManager.update(dt);
      this.applyCameraShake();
      this.updateHud();

      // ★ 1.35秒経過のまさにこの瞬間：立ち合い開始！
      if (this.roundStandbyTimer >= 1.35) {
        this.roundState = 'active';
        this.isRoundActive = true;

        // ★ 文字表示と開始タイミングを完全に一致！
        this.uiManager.showBanner('はっけよい！', 'のこった！のこった！', 1600);
        this.soundManager.playTaiko();
      }
      return;
    }

    // 2. 試合決着（二本先取達成！リザルトモーダル表示中）
    if (this.roundState === 'match_over') {
      this.physics.step(dt);
      this.particleManager.update(dt);
      this.applyCameraShake();
      this.updateHud();

      return;
    }

    // 3. ラウンド決着後、次ラウンドへの仕切り直し待ち（「勝負あり！」後）
    if (this.roundState === 'finished') {
      this.roundResetTimer += dt;

      // 決着後の物理・エフェクト継続
      this.physics.step(dt);
      this.particleManager.update(dt);
      this.applyCameraShake();
      this.updateHud();

      if (this.roundResetTimer >= 2.4) {
        this.startRoundSequence(false);
      }
      return;
    }

    // 4. 立ち合い激闘中 (roundState === 'active')
    // 1P 入力更新
    const rawP1Input = this.inputManager.getPlayer1Input();

    const p1MoveInput = this.toWorldMoveInput(rawP1Input);
    const p1Actions = this.toActions(rawP1Input);

    // 2P 入力（PvPなら2P操作、PvEならCPU AI）
    let p2MoveInput = { x: 0, z: 0, isMoving: false, dash: false };
    let p2Actions = {
      harite: false,
      buchikamashiCharge: false,
      buchikamashiRelease: false,
      shiko: false,
      grab: false,
      guard: false,
    };

    if (this.gameMode === 'pvp') {
      const rawP2Input = this.inputManager.getPlayer2Input();
      p2MoveInput = this.toWorldMoveInput(rawP2Input);
      p2Actions = this.toActions(rawP2Input);
    } else {
      const p2Plan = this.ai.update(dt, this.player1);
      p2MoveInput = {
        x: p2Plan.moveX,
        z: p2Plan.moveZ,
        isMoving: p2Plan.isMoving,
        dash: p2Plan.dash,
      };
      p2Actions = {
        harite: p2Plan.harite,
        buchikamashiCharge: p2Plan.buchikamashiCharge,
        buchikamashiRelease: p2Plan.buchikamashiRelease,
        shiko: p2Plan.shiko,
        grab: p2Plan.grab,
        guard: p2Plan.guard,
      };
    }

    // 力士の更新
    const p1Pos = this.p1PosTmp.set(this.player1.body.position.x, this.player1.body.position.y, this.player1.body.position.z);
    const p2Pos = this.p2PosTmp.set(this.player2.body.position.x, this.player2.body.position.y, this.player2.body.position.z);

    this.player1.update(dt, p1MoveInput, p1Actions, p2Pos);
    this.player2.update(dt, p2MoveInput, p2Actions, p1Pos);

    // 攻撃判定（Step 3: ヒットボックス判定とノックバック演算）
    this.checkAttackHits();

    // 物理シミュレーション進行
    this.physics.step(dt);

    // 勝敗・リングアウト（Step 1: 落下判定とリセット）
    this.checkRingOut(dt);

    // エフェクト・パーティクルの更新
    this.particleManager.update(dt);

    // カメラシェイクの適用
    this.applyCameraShake();

    // UI統計の更新
    this.updateHud();
  }

  /**
   * HUDの更新
   */
  private updateHud() {
    this.uiManager.updateStats(
      this.player1.damagePercent,
      this.player2.damagePercent,
      this.player1.wins,
      this.player2.wins,
      this.player1.chargeTimer / this.player1.maxChargeTime,
      this.player2.chargeTimer / this.player2.maxChargeTime,
      this.player1.hasSuperArmor,
      this.player2.hasSuperArmor,
      this.player1.state === 'guard',
      this.player2.state === 'guard',
      this.player1.state === 'stun',
      this.player2.state === 'stun',
      this.player1.guardGauge,
      this.player2.guardGauge,
      this.player1.buchikamashiCooldown / this.player1.buchikamashiMaxCooldown,
      this.player2.buchikamashiCooldown / this.player2.buchikamashiMaxCooldown,
      this.player1.shikoCooldown / this.player1.shikoMaxCooldown,
      this.player2.shikoCooldown / this.player2.shikoMaxCooldown
    );
  }

  /**
   * 攻撃ヒット判定（ヒットボックス vs 相手の剛体）
   */
  private checkAttackHits() {
    this.resolveAttack(this.player1, this.player2, 'A:つかみ打撃！ B:上手投げ！ 移動:寄り切り！', 1800);
    this.resolveAttack(this.player2, this.player1, '組まれた！2秒後にレバー連打で脱出！', 1600);
  }

  /** attacker のヒットボックスが defender に届いていればヒット処理を行う */
  private resolveAttack(attacker: SumoFighter, defender: SumoFighter, grabHint: string, grabBannerMs: number) {
    const hitbox = attacker.getHitbox();
    if (!hitbox || attacker.attackHitRegistered) return;

    const defPos = this.hitTargetTmp.set(defender.body.position.x, defender.body.position.y, defender.body.position.z);
    if (hitbox.position.distanceTo(defPos) >= hitbox.radius + 0.85) return;

    // ヒット成立！
    attacker.attackHitRegistered = true;
    if (attacker.currentAttackType === 'grab') {
      // つかみ成立！（ガード貫通）
      if (defender.state !== 'fall' && defender.state !== 'grabbed' && defender.state !== 'throw') {
        attacker.onGrabSuccess(defender);
        defender.onGrabbed(attacker);
        this.uiManager.showBanner('がっぷり四つ！', grabHint, grabBannerMs);
      }
    } else {
      defender.receiveHit(
        this.hitSourceTmp.set(attacker.body.position.x, attacker.body.position.y, attacker.body.position.z),
        attacker.currentAttackType!,
        attacker.chargeTimer / attacker.maxChargeTime
      );
    }
  }

  /** カメラ基準の入力をワールド座標の移動入力に変換する */
  private toWorldMoveInput(raw: { isMoving: boolean; moveX: number; moveZ: number; dashTriggered: boolean }) {
    const move = this.worldMoveTmp.set(0, 0, 0);
    if (raw.isMoving) {
      move.addScaledVector(this.camRight, raw.moveX);
      move.addScaledVector(this.camForward, -raw.moveZ);
      move.normalize();
    }
    return { x: move.x, z: move.z, isMoving: raw.isMoving, dash: raw.dashTriggered };
  }

  private toActions(raw: {
    buttonAPressed: boolean; buttonB: boolean; buttonBReleased: boolean;
    buttonCPressed: boolean; buttonGrabPressed: boolean; guard: boolean;
  }) {
    return {
      harite: raw.buttonAPressed,
      buchikamashiCharge: raw.buttonB,
      buchikamashiRelease: raw.buttonBReleased,
      shiko: raw.buttonCPressed,
      grab: raw.buttonGrabPressed,
      guard: raw.guard,
    };
  }

  /**
   * 場外リングアウトの判定（二本先取ルール）
   */
  private checkRingOut(dt: number) {
    if (this.roundState !== 'active') {
      return;
    }

    const p1Fell = this.player1.body.position.y < -1.8;
    const p2Fell = this.player2.body.position.y < -1.8;

    if (p1Fell || p2Fell) {
      this.isRoundActive = false;
      this.roundResetTimer = 0;
      this.soundManager.playHyoshigi();

      if (p1Fell && p2Fell) {
        // 同体・取り直し
        this.roundState = 'finished';
        this.uiManager.showBanner('同体！取り直し', '物言いがつきました！取り直します', 2400);
        return;
      }

      let winnerText = '';
      let kimarite = '';

      if (p2Fell) {
        // 1P 勝利！
        this.player1.wins++;
        winnerText = '東方 蒼天龍の勝ち！';
        kimarite = this.determineKimarite(this.player1, this.player2);
      } else {
        // 2P 勝利！
        this.player2.wins++;
        winnerText = '西方 紅炎山の勝ち！';
        kimarite = this.determineKimarite(this.player2, this.player1);
      }

      // 決まり手コール
      this.uiManager.showBanner('勝負あり！', `${winnerText} 決まり手: ${kimarite}`, 2200);

      // 二点先取（2勝）達成チェック
      if (this.player1.wins >= 2 || this.player2.wins >= 2) {
        // 試合終了！自動で次ラウンドに進まないよう 'match_over' に移行
        this.roundState = 'match_over';
        setTimeout(() => {
          const grandWinner = this.player1.wins >= 2 ? '東方 蒼天龍' : '西方 紅炎山';
          const p2DisplayName = '西方 紅炎山';
          if (this.gameState !== 'battle' || this.roundState !== 'match_over') return;
          this.soundManager.playTaiko();
          this.menuNav.clear();
          this.armInput(600);
          this.uiManager.showVictoryModal(grandWinner, this.player1.wins, this.player2.wins, p2DisplayName);
          guideResult();
        }, 2200);
      } else {
        // どちらも2勝に達していない場合は仕切り直し（次ラウンドへ）
        this.roundState = 'finished';
      }
    }
  }

  /**
   * 相撲の決まり手判定
   */
  private determineKimarite(winner: SumoFighter, loser: SumoFighter): string {
    if (winner.state === 'throw') {
      return '上手投げ';
    }
    if (winner.state === 'grab_holding') {
      return '寄り切り';
    }
    if (winner.state === 'buchikamashi_rush') {
      return '突き出し';
    }
    if (winner.state === 'harite') {
      return '押し出し';
    }
    if (winner.state === 'shiko') {
      return '送り出し';
    }
    if (loser.damagePercent > 120) {
      return '寄り倒し';
    }
    return '押し出し';
  }

  /**
   * カメラシェイク
   */
  private applyCameraShake() {
    const shake = this.particleManager.shakeIntensity;
    if (shake > 0) {
      this.camera.position.x = this.cameraBasePos.x + (Math.random() - 0.5) * shake * 0.8;
      this.camera.position.y = this.cameraBasePos.y + (Math.random() - 0.5) * shake * 0.8;
      this.camera.position.z = this.cameraBasePos.z + (Math.random() - 0.5) * shake * 0.8;
    } else {
      this.camera.position.copy(this.cameraBasePos);
    }
    this.camera.lookAt(this.cameraLookAt);
  }
}

// 起動
window.addEventListener('DOMContentLoaded', () => {
  new SumoGame();
});
