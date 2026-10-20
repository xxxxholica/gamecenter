import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Dohyo } from './entities/Dohyo';
import { Audience } from './entities/Audience';
import { FighterView } from './entities/FighterView';
import { InputManager, PlayerInputState } from './input/InputManager';
import { SoundManager } from './audio/SoundManager';
import { ParticleManager } from './effects/ParticleManager';
import { HalfResFx } from './effects/HalfResFx';
import { UIManager } from './ui/UIManager';
import { SumoAI } from './ai/SumoAI';
import { installHomeReturn, returnToHub } from '../../../shared/homeReturn';
import { ArcadePause } from '../../../shared/arcadePause';
import { reportDeepAnalytics, reportRoundStart } from '../../../shared/arcadeAnalytics';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { ModeSelect } from '../../../shared/online/ModeSelect';
import { CPU_ART, ONLINE_ART } from './modeArt';
import { MenuNav } from '../../../shared/arcadeMenuNav';
import { PadEdge, readPad } from '../../../shared/arcadePad';
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import type { PublicStatus } from '../../../shared/online/core';
import type { FighterSnap, FxEvent, ServerMsg } from '../../../shared/sumoProtocol';
import { ROUND_NAMES, WINS_TO_MATCH } from '../../../shared/sumoProtocol';
import { FIGHTERS, MATCH_OVER_DELAY_SEC, SimWorld, startPose } from '../../../shared/sumoSim/SimWorld';
import { benchDone, benchMark, benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import type { FighterInput } from '../../../shared/sumoSim/SimWorld';
import type { FighterActions, FighterMoveInput } from '../../../shared/sumoSim/SimFighter';
import { createNet, fetchSumoStatus } from './online/net';
import { WaitScreen } from './online/WaitScreen';
import { OnlineMatch, type ResultsMsg } from './online/OnlineMatch';
import { replayFx, type FxSink } from './online/fx';

// 戻る操作は Backspace(アケコンは SELECT)に統一。Escape は無効
installHomeReturn();
// リザルトで無操作が続いたらタイトルへ戻る
watchResultAutoReturn(['result-btn-title']);

const ACCENT = '#e63946';
const isPreviewMode = () => typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));

// 画面左下の共通ボタンガイド(場面ごとに差し替える)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
const guideModeSelect = () => mountArcadeGuide({
  moveLabel: 'モード選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideBattle = () => mountArcadeGuide({
  moveLabel: '移動',
  buttons: [
    { indices: [0, 2], label: '打撃', keyLabel: 'Space' },
    { indices: [1, 3], label: 'つかみ', keyLabel: 'K' },
  ],
  showHomeHint: true,
  backLabel: 'ポーズ',
});
const guideResult = () => mountArcadeGuide({
  moveLabel: '選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '終了' },
  ],
  showHomeHint: true,
  backLabel: 'タイトルへ',
});

// モード選択カードの絵(固定のSVG)
export type GameState = 'title' | 'menu' | 'battle';

type RoundState = 'waiting' | 'standby' | 'active' | 'finished' | 'match_over';

/**
 * 画面(このクラス)は、力士の「見た目」だけを持つ。物理・当たり判定・ラウンド進行・得点は shared/sumoSim の SimWorld が持ち、
 *   CPU対戦: ブラウザの中で SimWorld を動かす(1P=自分、2P=CPU)
 *   オンライン対戦: サーバーが SimWorld を動かし、届いた状態(スナップショット)と演出を表示する(自分の操作だけを送る)
 * どちらも、力士の状態(FighterSnap)と演出イベント(FxEvent)を受け取って描くだけの同じ経路で表示する。
 */
class SumoGame {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;

  private dohyo: Dohyo;
  private audience: Audience;
  /** 力士の見た目(最大4人。使わない分は隠す) */
  private readonly views: FighterView[] = [];
  /** いま土俵に立っている力士の数 */
  private activeCount = 2;

  private inputManager: InputManager;
  private soundManager: SoundManager;
  private particleManager: ParticleManager;
  /** 爆発の炎・煙を半分の解像度で描いて重ねる(場外の大爆発で GPU の塗りつぶしが間に合わなくなるため) */
  private halfResFx: HalfResFx;
  private uiManager: UIManager;
  /** 演出イベントの再生先 */
  private fxSink!: FxSink;

  // ゲーム状態
  private gameState: GameState = 'title';

  // 固定カメラの基本位置・注視点（クォータービュー）
  // 土俵が下部中央の技ゲージと被らないよう、画面上寄りに収める
  private readonly cameraBasePos = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'))
    ? new THREE.Vector3(0, 9.5, 11.2)
    : new THREE.Vector3(0, 18.2, 20.0);
  private readonly cameraLookAt = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'))
    ? new THREE.Vector3(0, 1.2, 0)
    : new THREE.Vector3(0, -1.5, 1.8);

  // タイトル画面カメラ周回用
  private titleCameraAngle: number = 0;

  // カメラの正面・右ベクトル（移動ベクトル変換用）
  private camForward: THREE.Vector3 = new THREE.Vector3();
  // 毎フレーム使い回す作業用ベクトル
  private readonly worldMoveTmp = new THREE.Vector3();
  private camRight: THREE.Vector3 = new THREE.Vector3();

  // 力士ごとの爆破管理(1力士につき1回の落下/客席爆破)
  private readonly blastedFighters = new Set<number>();

  private roundState: RoundState = 'standby';
  private isRoundActive: boolean = false;
  private lastTime: number = 0;
  /** 力士を初期位置へ戻した回数(変わったら、客席の爆破を再び可能にする) */
  private lastRc = -1;
  /** 結果の画面を出した(試合ごとに1回) */
  private modalShown = false;

  // 全ゲーム共通のタイトル画面・モード選択・メニュー操作
  private titleScreen: ArcadeTitleScreen;
  private modeSelect: ModeSelect;
  private menuNav = new MenuNav();
  private padEdge = new PadEdge();
  // 画面を切り替えた直後に、同じ押下が次の画面の決定・戻るとして二重に入らないようにする
  private inputArmTime: number = 0;

  // CPU対戦(ブラウザ内のシミュレーション)
  private cpu: { sim: SimWorld; ai: SumoAI; benchAis?: SumoAI[] } | null = null;
  // ベンチマーク(?bench=1&scene=bout&n=2〜4): 全員を CPU が操作して、1試合(二本先取)を最後まで見せる
  private readonly benchScene = benchParam('scene');
  private benchReadySent = false;

  // オンライン対戦(サーバーが持つシミュレーションの表示)
  private readonly net = createNet();
  private onlineStatus: PublicStatus | null = null;
  private waitScreen: WaitScreen | null = null;
  /** オンライン対戦の力士名(参加者の番号順。サーバーがランダムに付けた名前) */
  private onlineNames: string[] = [];
  private match: OnlineMatch | null = null;
  /** ポーズ(Backspace / SELECT): CPU対戦は止めてやり直せる。オンライン対戦は相手がいるので止めず、退出だけできる */
  private readonly pauseCpu = new ArcadePause({
    accent: ACCENT,
    isPlaying: () => this.gameState === 'battle' && !!this.cpu && !this.uiManager.isVictoryModalOpen() && !isPreviewMode(),
    onRestart: () => this.startCpuBattle(),
  });
  private onlineWired = false;
  private onlineYou = 0;
  private startingFlow = false;
  private noticeEl: HTMLElement | null = null;
  private noticeTimer: number | null = null;

  constructor() {
    // オンライン対戦用のポーズ(相手がいるので止めず、退出だけできる)。作るだけで、キー入力を自分で受ける
    new ArcadePause({
      accent: ACCENT,
      isPlaying: () => this.gameState === 'battle' && !!this.match && !this.uiManager.isVictoryModalOpen() && !isPreviewMode(),
      exitLabel: '退出',
      onExit: () => { this.leaveOnline(); returnToHub(); },
    });
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
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.debug.checkShaderErrors = false;
    document.body.appendChild(this.renderer.domElement);

    // 4. 照明（相撲場の吊り屋根照明）
    this.setupLighting();

    // 5. 各種マネージャー
    this.soundManager = new SoundManager();
    this.particleManager = new ParticleManager(this.scene);
    this.halfResFx = new HalfResFx(this.particleManager.fx);
    this.fxSink = {
      sound: this.soundManager,
      particle: this.particleManager,
      showBanner: (m, s, ms) => {
        // アナリティクス: 1番ごとの勝負(勝った力士と決まり手)・取り直し
        if (m === '勝負あり' || m.includes('取り直し')) reportDeepAnalytics('bout_end', { banner: m, detail: s });
        this.uiManager.showBanner(m, s, ms);
      },
      blast: (c, r) => this.onBlastEvent(c, r),
    };
    this.inputManager = new InputManager();
    this.uiManager = new UIManager();

    // 6. 土俵ステージの構築
    this.dohyo = new Dohyo();
    this.scene.add(this.dohyo.mesh);

    // 爆発のたびに、土俵へ焦げ跡を付ける
    this.particleManager.onScorch = (pos, radius, strength) => this.dohyo.addScorch(pos, radius, strength);

    // 最大級の爆発では、画面全体が一瞬、炎の色に染まる
    const blastFlash = document.createElement('div');
    blastFlash.style.cssText =
      'position:fixed;inset:0;pointer-events:none;z-index:5000;opacity:0;' +
      'background:radial-gradient(circle at 50% 55%, rgba(255,244,210,0.95) 0%, rgba(255,150,50,0.75) 45%, rgba(190,50,10,0.55) 100%);';
    document.body.appendChild(blastFlash);
    this.particleManager.onScreenFlash = (intensity) => {
      blastFlash.style.transition = 'none';
      blastFlash.style.opacity = String(0.9 * intensity);
      void blastFlash.offsetWidth;
      blastFlash.style.transition = `opacity ${0.3 + 0.35 * intensity}s ease-out`;
      blastFlash.style.opacity = '0';
    };

    // 観客席・大相撲アリーナ（溜席・マス席・吊り屋根）の構築
    this.audience = new Audience({
      dohyoRadius: this.dohyo.radius,
      innerRadius: this.dohyo.radius + 1.4,
      outerRadius: 30.0,
      numRows: 14,
    });
    this.scene.add(this.audience.mesh);

    // 7. 力士の見た目(最大4人: 東方 蒼天龍・西方 紅炎山・翠嵐海・金剛峰)
    FIGHTERS.forEach((f, i) => {
      const view = new FighterView(i, f.name, { skinColor: f.skin, mawashiColor: f.mawashi, hairColor: f.hair }, this.soundManager, this.particleManager, `${i + 1}P`);
      this.scene.add(view.mesh);
      this.views.push(view);
    });
    this.showViews(2, [null, null]);

    // リサイズ監視
    window.addEventListener('resize', this.onWindowResize.bind(this));

    // リザルトのメニュー移動(WASD)は押した瞬間をためておく
    window.addEventListener('keydown', (e) => {
      if (this.uiManager.isVictoryModalOpen() && this.menuNav.pushKey(e)) e.preventDefault();
    });

    // リザルト画面: 再挑戦(CPU対戦だけ) / タイトルに戻る / ゲームを終了
    this.uiManager.onRematch = () => {
      this.uiManager.hideVictoryModal();
      this.soundManager.playTaiko();
      this.startCpuBattle();
    };
    this.uiManager.onReturnTitle = () => {
      this.uiManager.hideVictoryModal();
      this.returnToTitle();                                   // オンラインの途中だった場合の片付けも、タイトルへ戻る時にまとめて行う
    };
    this.uiManager.onExit = () => {
      returnToHub();
    };

    // タイトル画面(全ゲーム共通)。スタートでモード選択へ
    this.titleScreen = new ArcadeTitleScreen({
      slug: 'sumo-smash-3d',
      accentColor: ACCENT,
      tagline: 'ぶつかって土俵からぶっ飛ばせ！',
      onStart: () => {
        this.soundManager.playHyoshigi();
        void this.onStartPressed();
      },
    });
    this.modeSelect = new ModeSelect(
      { title: 'モード選択', accent: ACCENT, arcade: true },
      (id) => this.onModeSelected(id),
      () => {
        this.modeSelect.hide();
        this.returnToTitle();
      },
    );

    // 初回フレームのシェーダコンパイル・テクスチャ転送を requestAnimationFrame 開始前に完了させる
    this.halfResFx.render(this.renderer, this.scene, this.camera, true);
    this.renderer.getContext().finish();
    this.particleManager.update(0.016);

    declareBenchTargets([
      { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
      ...[2, 3, 4].map((n) => ({
        id: `bout-${n}`,
        label: `${n}人の取り組み(全員CPU)`,
        kind: 'bout',
        params: { scene: 'bout', n: String(n) },
        input: 'self' as const,
        seconds: 240,
      })),
    ]);

    // 初期状態はタイトル画面
    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    if (isPreview) {
      this.titleScreen.hide();
      this.startCpuBattle();
    } else if (this.benchScene === 'bout') {
      this.titleScreen.hide();
      this.startBenchBout(Math.min(4, Math.max(2, Number(benchParam('n')) || 2)));
    } else {
      this.showTitle();
      if (this.benchScene === 'title') benchReady('title');
    }

    // アニメーションループ開始
    this.lastTime = performance.now();
    requestAnimationFrame(this.gameLoop.bind(this));
  }

  private setupLighting() {
    // 1. 環境光＋半球光（全方向からの柔らかなアリーナ照明を1灯の半球光に集約してフラグメント負荷を軽減）
    const ambientLight = new THREE.AmbientLight(0xfff5e6, 0.75);
    this.scene.add(ambientLight);
    const hemiLight = new THREE.HemisphereLight(0xfff8ee, 0xd8c3a5, 1.35);
    hemiLight.position.set(0, 30, 0);
    this.scene.add(hemiLight);

    // 2. 吊り屋根メインスポットライト/トップライト（土俵全体を力強く照らす）
    const mainLight = new THREE.DirectionalLight(0xffffff, 2.0);
    mainLight.position.set(0, 28, 6);
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

    // 3. 背後リムライト（奥から輪郭を美しく縁取る）
    const rimLight = new THREE.DirectionalLight(0xaad4ff, 0.9);
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
   * 土俵に立つ力士(n人)を、初期位置に出す。使わない分は隠す。labels は頭上マーカーの文字。
   */
  /** labels は力士ごとの頭上マーカーの文字。null は何も出さない */
  private showViews(n: number, labels: (string | null)[]) {
    this.activeCount = n;
    this.views.forEach((v, i) => {
      if (i >= n) {
        v.mesh.visible = false;
        v.gone = true;
        return;
      }
      const pose = startPose(i, n);
      v.placeAt(pose.x, pose.z, pose.angle);
      v.setMarkerLabel(labels[i] ?? null);
    });
  }

  /** 試合の画面の共通の準備(CPU対戦・オンライン対戦) */
  private prepareBattleScreen() {
    this.gameState = 'battle';
    this.camera.position.copy(this.cameraBasePos);
    this.camera.lookAt(this.cameraLookAt);
    this.computeCameraVectors();

    // 吹き飛んだ客席・土俵の焦げ跡・残留爆発エフェクトを元に戻す(新しい試合ごと)
    this.particleManager.clear();
    this.audience.restoreAll();
    this.dohyo.clearScorches();

    this.titleScreen.hide();
    this.uiManager.hideTitleScreen();
    this.uiManager.hideVictoryModal();
    guideBattle();
    this.soundManager.playBgm('battle');

    this.isRoundActive = false;
    this.blastedFighters.clear();
    this.lastRc = -1;
    this.modalShown = false;

    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    if (isPreview) {
      this.camera.position.set(0, 11.5, 13.5);
      this.camera.lookAt(new THREE.Vector3(0, 1.0, 0));
      this.computeCameraVectors();
      const bh = document.getElementById('battle-hud');
      if (bh) bh.style.display = 'none';
      const banners = document.querySelectorAll('.banner-container, #banner');
      banners.forEach((b) => (b as HTMLElement).style.display = 'none');
      const guides = document.querySelectorAll('.agc-root');
      guides.forEach((g) => (g as HTMLElement).style.display = 'none');
    }
  }

  /**
   * CPU対戦(1P=自分 vs 2P=CPU、二本先取)。シミュレーションはこのブラウザの中で動かす。
   */
  public startCpuBattle() {
    reportDeepAnalytics('progression_update', { mode: 'CPU対戦' });
    reportRoundStart({ mode: 'CPU対戦' });
    this.match = null;
    this.showViews(2, ['あなた', null]);
    this.uiManager.setMultiLayout(null);
    this.uiManager.setRematchEnabled(true);
    this.uiManager.setMode('pve');
    this.prepareBattleScreen();

    const sim = new SimWorld(CANNON, { count: 2, winsToMatch: WINS_TO_MATCH });
    this.cpu = { sim, ai: new SumoAI(sim.fighters[1]) };
    this.roundState = 'standby';
    sim.start();                                              // 「見合って」から。柝・バナーは演出イベントとして最初のフレームで再生される
  }

  /** ベンチマーク用: n 人(2〜4)の力士を全員 CPU が操作する。HUD は2人用のまま(3人目以降は描画だけ)。 */
  private startBenchBout(n: number) {
    this.match = null;
    this.showViews(n, new Array<string | null>(n).fill(null));
    this.uiManager.setMultiLayout(null);
    this.uiManager.setRematchEnabled(true);
    this.uiManager.setMode('pve');
    this.prepareBattleScreen();

    const sim = new SimWorld(CANNON, { count: n, winsToMatch: WINS_TO_MATCH });
    this.cpu = { sim, ai: new SumoAI(sim.fighters[1]), benchAis: sim.fighters.map((f) => new SumoAI(f)) };
    this.roundState = 'standby';
    sim.start();
  }

  /**
   * タイトル画面へ復帰
   */
  public returnToTitle() {
    this.showTitle();
    this.soundManager.playHyoshigi();
  }

  private showTitle() {
    this.leaveOnline();                                       // オンラインの途中だった場合の片付け(オフラインでは何もしない)
    this.cpu = null;
    this.particleManager.clear();
    this.audience.restoreAll();
    this.dohyo.clearScorches();
    this.showViews(2, [null, null]);
    this.soundManager.playBgm('menu');
    this.gameState = 'title';
    this.armInput();
    this.uiManager.showTitleScreen();
    this.titleScreen.show();
    guideTitle();
  }

  /** モード選択(CPU対戦 / オンライン対戦) */
  private openModeSelect() {
    this.gameState = 'menu';
    this.titleScreen.hide();
    this.armInput();
    const st = this.onlineStatus;
    const full = !!st && st.players >= st.max;                // 満員でもグレーアウトしない(選ぶと「満員です」と案内が出る)
    this.modeSelect.show([
      { id: 'pve', art: CPU_ART, title: 'CPU対戦', sub: 'ひとりで二本先取', desc: 'CPU力士と対戦します。張り手・頭突き・つかみで、先に二番取った方が勝ちです。' },
      {
        id: 'online',
        art: ONLINE_ART,
        title: 'オンライン対戦',
        sub: !st ? '現在は開催されていません' : full ? '満員' : st.phase !== 'lobby' ? '対戦中' : `参加中 ${st.players}/${st.max}`,
        desc: '最大4人の乱戦。土俵に最後まで残った人が1点、先に2点取った人の勝ち。待っている間に集まった人で始まります。',
        disabled: !st,                                           // 開催されていなくても項目は出す(選べない)
      },
    ]);
    guideModeSelect();
  }

  private onModeSelected(id: string) {
    this.modeSelect.hide();
    if (id === 'online') {
      this.enterOnlineWait();
      return;
    }
    this.startCpuBattle();
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
    // ゲームパッドだけで始めても音が出るよう、ボタンが押されたら音声を有効にする
    if (padPress.any(0, 1, 2, 3, 9)) this.soundManager.unlock();

    if (this.gameState !== 'battle') {
      this.updateTitleScreen(dt);
    } else if (this.roundState === 'match_over' && this.uiManager.isVictoryModalOpen()) {
      this.updateResultMenu(padPress.any(0, 9), padPress.any(1));
      this.updateBattle(dt);
    } else if (!this.pauseCpu.isOpen) {
      this.updateBattle(dt);
    }

    // 観客の生き生きとしたアニメーション更新（ざわめき・熱狂・拍手）
    this.audience.update(dt, this.isRoundActive, this.particleManager.shakeIntensity);

    // 毎フレーム末尾で入力単発バッファをクリア
    this.inputManager.update();

    // レンダリング
    this.halfResFx.render(this.renderer, this.scene, this.camera);
  }

  /**
   * タイトル画面中の更新
   */
  private updateTitleScreen(dt: number) {
    // カメラの優雅なアトラクト旋回
    this.titleCameraAngle += dt * 0.18;
    const camRadius = 20.0;
    this.camera.position.set(
      Math.sin(this.titleCameraAngle) * camRadius,
      12.5,
      Math.cos(this.titleCameraAngle) * camRadius
    );
    this.camera.lookAt(0, 1.2, 0);

    // 土俵に立つ力士は構えアニメーション
    for (let i = 0; i < this.activeCount; i++) this.views[i].idle(dt);

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

    if (padConfirm || this.inputManager.isKeyTriggered('Enter')) {
      this.uiManager.confirmCurrentResultSelection();
    } else if (this.inputManager.isKeyTriggered('Backspace')) {
      this.uiManager.hideVictoryModal();
      this.returnToTitle();
    } else if (padExit) {
      returnToHub();
    }
  }

  // ---------------------------------------------------------------
  // オンライン対戦: モード選択 → 待機 → 対戦(サーバーのシミュレーションを表示し、自分の操作を送る) → 結果
  // ---------------------------------------------------------------

  /** START: モード選択を出す(オンライン対戦が開かれていなければ、その項目は選べない)。 */
  private async onStartPressed() {
    if (this.startingFlow) return;
    this.startingFlow = true;
    try {
      this.onlineStatus = await fetchSumoStatus(1500);        // 開催状況の確認は START の時の1回だけ(WebSocket には繋がない)
    } finally {
      this.startingFlow = false;
    }
    if (this.gameState !== 'title') return;
    this.openModeSelect();                                    // 開催されていなくても、オンライン対戦の項目は出す(選べない)
  }

  /** 画面の上部に出す短い案内(接続が切れた・相手が抜けた など) */
  private showNotice(text: string) {
    if (!this.noticeEl) {
      this.noticeEl = document.createElement('div');
      this.noticeEl.style.cssText =
        'position:fixed;left:50%;top:14%;transform:translateX(-50%);z-index:9999;pointer-events:none;padding:.7em 1.4em;border-radius:6px;' +
        'background:rgba(14,12,16,.94);border:1px solid #e63946;color:#fff;font:700 1rem system-ui,"Hiragino Kaku Gothic ProN",sans-serif;letter-spacing:.08em;' +
        'box-shadow:0 0 24px rgba(230,57,70,.35);display:none;';
      document.body.appendChild(this.noticeEl);
    }
    this.noticeEl.textContent = text;
    this.noticeEl.style.display = 'block';
    if (this.noticeTimer !== null) clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => {
      if (this.noticeEl) this.noticeEl.style.display = 'none';
    }, 3500);
  }

  private enterOnlineWait() {
    this.gameState = 'menu';
    this.armInput();
    this.wireOnline();
    if (!this.waitScreen) {
      this.waitScreen = new WaitScreen(this.net, {
        onBack: () => {                                       // 退出してモード選択へ(接続も切る)
          this.leaveOnline();
          this.openModeSelect();
        },
        onErrorToTitle: (msg: string) => {                    // 入れない時はリトライを尋ねず、案内してタイトルへ戻る
          this.returnToTitle();
          this.showNotice(msg);
        },
      });
    }
    guideModeSelect();
    this.waitScreen.show();
  }

  /** サーバーからの通知の受け口(1回だけ登録する)。 */
  private wireOnline() {
    if (this.onlineWired) return;
    this.onlineWired = true;
    this.net.on('room', (m) => {
      this.onlineYou = m.you;
      this.waitScreen?.setRoom(m);
    });
    this.net.on('left', () => this.waitScreen?.setRoom(null));
    this.net.on('start', (m) => this.beginOnlineMatch(m));
    this.net.on('go', () => this.onOnlineGo());
  }

  /** 開始の合図: 試合の画面を作り、ロード完了を伝える(全員が揃うと go が来る)。 */
  private beginOnlineMatch(m: Extract<ServerMsg, { t: 'start' }>) {
    if (this.gameState !== 'menu') return;
    this.waitScreen?.hide();                                  // 接続は保ったまま、待機画面だけ閉じる
    this.modeSelect.hide();
    const slot = Math.max(0, m.players.findIndex((p) => p.id === this.onlineYou));
    const count = m.players.length;
    this.cpu = null;
    this.match?.dispose();
    this.match = new OnlineMatch(this.net, slot, count, {
      onResults: (res) => this.onOnlineResults(res),
      onDisconnect: () => {
        if (this.gameState !== 'battle' || this.uiManager.isVictoryModalOpen()) return;
        this.returnToTitle();
        this.showNotice('接続が切れました');
      },
    });

    this.onlineNames = m.players.map((p) => p.name);
    reportDeepAnalytics('progression_update', { mode: 'オンライン', extraStats: { players: count } });
    reportRoundStart({ mode: 'オンライン', players: count });
    this.showViews(count, FIGHTERS.slice(0, count).map((_, i) => (i === slot ? 'あなた' : null)));
    this.uiManager.setMultiLayout(
      FIGHTERS.slice(0, count).map((f, i) => ({ name: this.onlineNames[i] ?? f.name, css: f.css, label: `${i + 1}P`, me: i === slot }))
    );
    this.uiManager.setRematchEnabled(false);
    this.prepareBattleScreen();
    this.soundManager.setBgmCalm(true);
    this.roundState = 'waiting';
    this.showNotice(`あなたは ${FIGHTERS[slot].side} ${this.onlineNames[slot] ?? FIGHTERS[slot].name}(${slot + 1}P)`);
    this.net.send({ t: 'loaded' });
  }

  /** 全員のロードが揃った。サーバーが仕切りを始めるので、その状態が届くのを待つ。 */
  private onOnlineGo() {
    if (!this.match || this.gameState !== 'battle' || this.roundState !== 'waiting') return;
    this.roundState = 'standby';
  }

  /** 試合の結果が届いた(二本先取・最後の1人)。 */
  private onOnlineResults(res: ResultsMsg) {
    if (this.gameState !== 'battle' || !this.match) return;
    if (res.w === null) {                                     // 全員が抜けた
      this.returnToTitle();
      this.showNotice('試合が終了しました');
      return;
    }
    if (this.uiManager.isVictoryModalOpen()) return;
    const me = this.match.slot;
    this.roundState = 'match_over';
    this.showOnlineVictory(res.w, res.s, me);
  }

  /** オンラインの結果表示: 勝者と順位表。自分が勝ったかを添える。 */
  private showOnlineVictory(winner: number, wins: number[], me: number) {
    this.modalShown = true;
    this.soundManager.playTaiko();
    this.soundManager.playBgm('menu');
    this.menuNav.clear();
    this.armInput(600);
    reportDeepAnalytics('progression_update', {
      result: winner === me ? 'clear' : 'gameover',
      ...(winner === me ? {} : { deathReason: 'オンライン対戦で敗北' }),
      mode: 'オンライン',
      extraStats: { players: wins.length, wins: wins[me] ?? 0, winnerWins: wins[winner] ?? 0 },
    });
    const rows = wins.map((w, i) => ({ name: this.onlineNames[i] ?? FIGHTERS[i].name, css: FIGHTERS[i].css, wins: w, me: i === me }));
    this.uiManager.showVictory(winner === me, rows);
    guideResult();
  }

  /** オンラインの途中だった場合の片付け。オフラインでは何も起きない。 */
  private leaveOnline() {
    this.waitScreen?.hide();
    this.match?.dispose();
    this.match = null;
    this.uiManager.setRematchEnabled(true);
    this.uiManager.setMultiLayout(null);
    if (this.net.connected) {
      this.net.send({ t: 'leave' });
      this.net.close();                                       // 開いたままにして負荷をかけない
    }
  }

  // ---------------------------------------------------------------
  // バトル中の1フレーム
  // ---------------------------------------------------------------

  /**
   * バトル中の更新。CPU対戦はブラウザ内のシミュレーションを進め、オンライン対戦はサーバーから届いた状態を取り出す。
   * どちらも「力士の状態+演出イベント」を受け取って、同じ経路で描く。
   */
  private updateBattle(dt: number) {
    let snaps: FighterSnap[] | null = null;
    let wins: number[] = [];
    let rc = 0;
    let phase: RoundState = this.roundState;
    let events: FxEvent[] = [];

    if (this.cpu) {
      // 1P は自分の操作、2P は CPU
      const { sim, ai, benchAis } = this.cpu;
      const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
      let mine: FighterInput;
      if (benchAis) {
        // 全員 CPU: それぞれ、いちばん近い相手を狙う
        const inputs = sim.fighters.map((f, i) => {
          let nearest = sim.fighters[(i + 1) % sim.fighters.length];
          let best = Infinity;
          for (const o of sim.fighters) {
            if (o === f) continue;
            const d = (o.body.position.x - f.body.position.x) ** 2 + (o.body.position.z - f.body.position.z) ** 2;
            if (d < best) { best = d; nearest = o; }
          }
          const plan = benchAis[i].update(dt, nearest);
          return { move: plan.move, actions: plan.actions };
        });
        sim.step(dt, inputs);
        mine = inputs[0];
      } else if (isPreview) {
        // プレビュー時は 1P も相手方向へ押し込み、押し合いの格闘状態を維持する
        const p1X = sim.fighters[0].body.position.x;
        const p2X = sim.fighters[1].body.position.x;
        const dirX = p2X > p1X ? 1 : -1;
        mine = {
          move: { x: dirX, z: 0, isMoving: true },
          actions: {
            strikePressed: Math.random() < 0.2,
            strike: true,
            strikeReleased: false,
            grabPressed: false,
          }
        };
        const bh = document.getElementById('battle-hud');
        if (bh) bh.style.display = 'none';
        const banners = document.querySelectorAll('.banner-container, #banner');
        banners.forEach((b) => (b as HTMLElement).style.display = 'none');
      } else {
        const raw = this.inputManager.getPlayer1Input();
        mine = { move: this.toWorldMoveInput(raw), actions: this.toActions(raw) };
      }
      if (!benchAis) {
        const plan = ai.update(dt, sim.fighters[0]);
        sim.step(dt, [mine, { move: plan.move, actions: plan.actions }]);
      }
      snaps = sim.fighterSnaps();
      wins = sim.wins;
      rc = sim.resetCount;
      phase = sim.phase as RoundState;
      events = sim.fx.take();
      if (benchAis && !this.benchReadySent && phase === 'active') { this.benchReadySent = true; benchReady('bout-start'); }
      if (phase === 'match_over' && sim.phaseTime >= MATCH_OVER_DELAY_SEC && !this.modalShown) {
        this.modalShown = true;
        if (benchAis) benchDone('match-over');
        this.showVictory(sim.winner ?? 0);
      }
    } else if (this.match) {
      // 自分の操作をサーバーへ送る(結果表示中は不要)
      const now = Date.now();
      if (this.roundState !== 'match_over') {
        const raw = this.inputManager.getPlayer1Input();
        const mv = this.toWorldMoveInput(raw);
        this.match.sendInput(now, mv.x, mv.z, mv.isMoving, raw.strikePressed, raw.strike, raw.strikeReleased, raw.grabPressed);
      }
      events = this.match.drainEvents(now);
      const view = this.match.view(now);
      if (view) {
        snaps = view.f;
        wins = view.w;
        rc = view.rc;
        phase = (ROUND_NAMES[view.rs] ?? 'standby') as RoundState;
      }
    }

    // 演出(効果音・粒子・バナー・爆破)
    for (const ev of events) replayFx(ev, this.fxSink);

    // 力士の状態を画面に反映する
    if (snaps) {
      if (rc !== this.lastRc) {
        this.lastRc = rc;
        this.blastedFighters.clear();                         // 仕切り直し: 各力士の爆破を再び可能にする
      }
      // 結果を出している間は、局面を結果のまま保つ
      if (this.roundState !== 'match_over' || !this.uiManager.isVictoryModalOpen()) this.roundState = phase;
      this.isRoundActive = this.roundState === 'active';
      for (let i = 0; i < this.activeCount; i++) this.views[i].applyState(snaps[i], dt);
      this.checkSeatBlast();
      this.updateHud(wins);
    } else {
      for (let i = 0; i < this.activeCount; i++) this.views[i].idle(dt);
    }

    // エフェクト(強い当たりの一瞬は、粒子だけゆっくり進める)
    if (this.particleManager.hitStopRemaining > 0) {
      this.particleManager.hitStopRemaining -= dt;
      this.particleManager.update(dt * 0.2);
    } else {
      this.particleManager.update(dt);
    }
    this.applyCameraShake();
  }

  /** CPU対戦の結果(勝った人の番号 0=自分 1=CPU)。 */
  private showVictory(winner: number) {
    this.soundManager.playTaiko();
    this.soundManager.playBgm('menu');
    this.menuNav.clear();
    this.armInput(600);
    const wins = this.cpu?.sim.wins ?? [0, 0];
    reportDeepAnalytics('progression_update', {
      result: winner === 0 ? 'clear' : 'gameover',
      ...(winner === 0 ? {} : { deathReason: 'CPUに敗北' }),
      mode: 'CPU対戦',
      extraStats: { wins: wins[0], cpuWins: wins[1] },
    });
    this.uiManager.showVictory(winner === 0, [
      { name: FIGHTERS[0].name, css: FIGHTERS[0].css, wins: wins[0], me: false },
      { name: FIGHTERS[1].name, css: FIGHTERS[1].css, wins: wins[1], me: false },
    ]);
    guideResult();
  }

  /**
   * HUDの更新
   */
  private updateHud(wins: number[]) {
    const v = this.views;
    if (this.match) {
      // オンライン(多人数): 上部バーに全員のダメージ・得点。技の箱(下部中央)は自分の分
      const me = v[this.match.slot];
      this.uiManager.updateMulti(
        v.slice(0, this.activeCount).map((f, i) => ({ damage: f.damagePercent, wins: wins[i] ?? 0, out: f.gone || f.state === 'fall' || f.position.y < -1.8 }))
      );
      this.uiManager.updateStats(
        me.damagePercent, 0, wins[this.match.slot] ?? 0, 0,
        me.chargeRatio,
        me.buchikamashiCooldownRatio, me.grabCooldownRatio, me.hariteGauge
      );
      return;
    }
    this.uiManager.updateStats(
      v[0].damagePercent, v[1].damagePercent, wins[0] ?? 0, wins[1] ?? 0,
      v[0].chargeRatio,
      v[0].buchikamashiCooldownRatio, v[0].grabCooldownRatio,
      v[0].hariteGauge
    );
  }

  /** カメラ基準の入力をワールド座標の移動入力に変換する */
  private toWorldMoveInput(raw: PlayerInputState): FighterMoveInput {
    const move = this.worldMoveTmp.set(0, 0, 0);
    if (raw.isMoving) {
      move.addScaledVector(this.camRight, raw.moveX);
      move.addScaledVector(this.camForward, -raw.moveZ);
      move.normalize();
    }
    return { x: move.x, z: move.z, isMoving: raw.isMoving };
  }

  private toActions(raw: PlayerInputState): FighterActions {
    return {
      strikePressed: raw.strikePressed,
      strike: raw.strike,
      strikeReleased: raw.strikeReleased,
      grabPressed: raw.grabPressed,
    };
  }

  /**
   * 場外・客席への落下の大爆発。画面の大半を炎と煙が埋める。
   * audienceRadius > 0 なら、その範囲の観客も吹き飛ばす。
   */
  private triggerMegaBlast(center: THREE.Vector3, audienceRadius: number) {
    benchMark(audienceRadius > 0 ? 'mega-blast audience' : 'mega-blast');
    if (audienceRadius > 0) this.audience.explodeAt(center, audienceRadius);
    this.particleManager.spawnMegaBlast(center, 14);
    this.particleManager.spawnBurn(center, 7, 2.6);
    this.soundManager.playExplosion(2.4);
    this.soundManager.duckBgm(2.2);
  }

  /**
   * サーバーまたはシミュレータからの爆発イベント。
   * 各力士の落下ごとに発生する。既に客席突入で爆破済みの力士は二重発火を防止。
   */
  private onBlastEvent(center: THREE.Vector3, audienceRadius: number) {
    let nearestIdx = -1;
    let minDist = Infinity;
    for (let i = 0; i < this.activeCount; i++) {
      const f = this.views[i];
      const d = Math.hypot(f.position.x - center.x, f.position.z - center.z);
      if (d < minDist) {
        minDist = d;
        nearestIdx = i;
      }
    }

    // 既に客席突入で爆破済みならスキップ
    if (nearestIdx >= 0 && minDist < 5.0 && this.blastedFighters.has(nearestIdx)) {
      return;
    }
    if (nearestIdx >= 0) {
      this.blastedFighters.add(nearestIdx);
    }
    const r = Math.hypot(center.x, center.z);
    const effRadius = audienceRadius > 0 ? audienceRadius : (r >= this.dohyo.radius ? 7 : 0);
    this.triggerMegaBlast(center, effRadius);
  }

  /**
   * 力士が客席に突っ込んだら、その場で客席を爆破する(観客と座布団が吹き飛ぶ)
   * 複数人対戦でも、突っ込んだ各力士ごとに爆破が発生する。
   */
  private checkSeatBlast() {
    const seatInner = this.dohyo.radius + 1.4;
    for (let i = 0; i < this.activeCount; i++) {
      if (this.blastedFighters.has(i)) continue;
      const f = this.views[i];
      if (f.gone) continue;
      const r = Math.hypot(f.position.x, f.position.z);
      if (r < seatInner - 0.2) continue;
      const floor = this.audience.floorHeightAt(r);
      if (f.position.y > floor + 0.9) continue; // まだ客席の上を飛んでいる

      // 客席ごと大爆破(観客と座布団が吹き飛ぶ)
      this.blastedFighters.add(i);
      this.triggerMegaBlast(new THREE.Vector3(f.position.x, floor + 0.7, f.position.z), 9);
    }
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
