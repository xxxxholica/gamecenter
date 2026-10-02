import * as THREE from 'three';
import { FestivalStall } from './stall';
import { CorkRifle } from './gun';
import { PrizeEntity, createAllPrizes, shuffleShelfLayout } from './prizes';
import { DynamicTargetsManager } from './dynamic_targets';
import { CorkSystem } from './cork';
import { ArcadeInput } from './input';
import { ArcadeHUD } from './hud';
import { sounds } from './audio';
import { ResultsPrizePileManager } from './results_pile';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { ModeSelect } from '../../../shared/online/ModeSelect';
import { mulberry32 } from '../../../shared/online/seededRandom';
import type { PublicStatus } from '../../../shared/online/core';
import type { ServerMsg } from '../../../shared/ennichiProtocol';
import { createNet, fetchEnnichiStatus } from './online/net';
import { WaitScreen } from './online/WaitScreen';
import { OFFLINE_ART, ONLINE_ART } from './online/modeArt';
import { OnlineHud } from './online/OnlineHud';
import { OnlineMatch, type ResultsMsg } from './online/OnlineMatch';
import { sumDefeated } from './online/snapshot';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();

mountArcadeGuide({
  moveLabel: 'ねらう',
  buttons: [
    { indices: [0], label: '通常弾' },
    { indices: [1, 2, 7], label: 'バクダン弾' },
  ],
  showHomeHint: true,
});

/** menu=モード選択・待機画面(オンライン)、playing=オンラインのロード/カウントダウン中も含む */
type GameState = 'title' | 'menu' | 'playing' | 'results';

interface RestockSlot {
  slotId: number;
  timer: number;
}

class ArcadeCorkShooter {
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  // Subsystems
  private stall!: FestivalStall;
  private gun!: CorkRifle;
  private corkSystem!: CorkSystem;
  private dynamicTargets!: DynamicTargetsManager;
  private input!: ArcadeInput;
  private hud!: ArcadeHUD;
  private prizes: PrizeEntity[] = [];
  private prizePileManager = new ResultsPrizePileManager();

  // Game state
  private state: GameState = 'title';
  private score: number = 0;
  private highScore: number = 9800;
  private timeLeft: number = 30.0;
  readonly MAX_TIME_CAP = 45.0; // 念のための上限。実際は下の延長枠で 30+15=45秒 を超えない
  // 延長できる秒数の総量(1プレイ)。延長の種類を増やしても、この枠を使い切ったらそれ以上は延びない
  readonly EXTENSION_BUDGET = 15.0;
  private extensionUsed: number = 0;
  private extensionExhaustedNotified: boolean = false;
  private comboBonusTier: number = 0;

  // 通常弾は6発で再装填(連打だけで押し切れないようにする)
  readonly MAX_AMMO = 6;
  readonly RELOAD_TIME = 1.0;
  private ammo: number = 6;
  private reloadTimer: number = 0;
  private totalDefeatedCount: number = 0;

  // Explosive Bomb Cooldown
  private bombCooldown: number = 0;
  readonly BOMB_RECHARGE_TIME = 1.3;

  // Combo system
  private comboCount: number = 0;
  private comboTimer: number = 0;
  private lastScoreMilestone: number = 0;

  // Automatic replenishment queue
  private restockQueue: RestockSlot[] = [];

  // Title & state timers
  private arcadeTitleScreen: ArcadeTitleScreen | null = null;
  private stateTimer: number = 0;
  private titleOrbitAngle: number = 0;
  private lastTickInt: number = 30;
  private screenShake: number = 0;

  // --- オンライン対戦 ---
  private readonly net = createNet();
  private readonly onlineHud = new OnlineHud();
  private onlineStatus: PublicStatus | null = null;
  private modeSelect: ModeSelect | null = null;
  private waitScreen: WaitScreen | null = null;
  private match: OnlineMatch | null = null;
  private onlineWired = false;
  /** START を押してから先へ進むまでの間(開催状況の確認中など)の二重実行を防ぐ */
  private startingFlow = false;
  private awaitingResults = false;
  private awaitResultsUntil = 0;
  private onlinePiles: ResultsPrizePileManager[] = [];
  private escArmedUntil = 0;

  // 3D vectors
  private aimTargetWorld: THREE.Vector3 = new THREE.Vector3();
  private raycaster: THREE.Raycaster = new THREE.Raycaster();

  constructor() {
    this.initThree();
    this.initGame();
    this.loadHighScores();
    this.setupEvents();
    this.animate(0);
  }

  private initThree() {
    const container = document.getElementById('canvas-container')!;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070e);
    this.scene.fog = new THREE.FogExp2(0x05070e, 0.07);

    // 2. Camera: adjusted for 4.6m widened stall
    this.camera = new THREE.PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.1, 50);
    this.camera.position.set(0, 1.48, 2.15);

    // 3. Renderer
    // 高解像度(Retina等)では描画解像度自体が高くギザギザが目立たないため、MSAA(antialias)は等倍の画面だけで使う。
    // 2倍解像度でのMSAAはGPU負荷が大きい割に見た目の差がほとんど無い
    this.renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 1.5, powerPreference: 'high-performance' });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
    container.appendChild(this.renderer.domElement);

    // 4. Lights
    const ambientLight = new THREE.AmbientLight(0xffe2b8, 1.0);
    this.scene.add(ambientLight);

    const mainDirLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    mainDirLight.position.set(2.0, 4.0, 2.5);
    mainDirLight.castShadow = true;
    mainDirLight.shadow.mapSize.width = 1024;
    mainDirLight.shadow.mapSize.height = 1024;
    mainDirLight.shadow.bias = -0.001;
    this.scene.add(mainDirLight);

    // Focused Spotlights for wide Hinadan
    const darumaSpot = new THREE.SpotLight(0xffd700, 3.8, 7.0, 0.55, 0.5, 1.0);
    darumaSpot.position.set(0, 2.8, 0.8);
    darumaSpot.target.position.set(0, 1.65, -0.95);
    this.scene.add(darumaSpot);
    this.scene.add(darumaSpot.target);

    const leftSpot = new THREE.SpotLight(0xffeedd, 2.5, 6.5, 0.7, 0.6, 1.0);
    leftSpot.position.set(-1.4, 2.7, 1.0);
    leftSpot.target.position.set(-1.2, 1.15, -0.45);
    this.scene.add(leftSpot);
    this.scene.add(leftSpot.target);

    const rightSpot = new THREE.SpotLight(0xffeedd, 2.5, 6.5, 0.7, 0.6, 1.0);
    rightSpot.position.set(1.4, 2.7, 1.0);
    rightSpot.target.position.set(1.2, 1.15, -0.45);
    this.scene.add(rightSpot);
    this.scene.add(rightSpot.target);
  }

  private initGame() {
    this.input = new ArcadeInput();
    this.hud = new ArcadeHUD();

    this.stall = new FestivalStall();
    this.scene.add(this.stall.group);

    this.gun = new CorkRifle();
    this.scene.add(this.gun.group);

    this.corkSystem = new CorkSystem(this.scene);

    // Shelf prizes
    this.prizes = createAllPrizes(this.stall.shelves);
    this.prizes.forEach((p) => this.scene.add(p.mesh));

    // Dynamic moving ducks, flying balloons, and golden UFO
    this.dynamicTargets = new DynamicTargetsManager();
    this.scene.add(this.dynamicTargets.group);

    this.enterTitle();
  }

  private setupEvents() {
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Escapeでホーム(ゲームセンターハブ)へ戻る。games/<slug>/配下からルートへは2階層上。
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Escape') return;
      if (this.state === 'menu') return;                      // モード選択・待機画面は、それぞれ Esc で戻る
      if (this.match) {
        // 対戦中は、うっかり押して抜けないよう2回押しで退出する
        if (performance.now() < this.escArmedUntil) {
          this.enterTitle();
        } else {
          this.escArmedUntil = performance.now() + 2000;
          this.onlineHud.toast('もう一度 Esc で退出します');
        }
        return;
      }
      window.location.href = '../../';
    });

    const handleScreenTouchOrClick = () => {
      if (this.state === 'title') {
        if (this.stateTimer > 0.35) {
          void this.onStartPressed();
        }
        return;
      }
      if (this.state === 'results') {
        if (this.stateTimer > 0.6 && !this.match) {           // 対戦の結果は、結果パネルのボタンで戻る
          this.enterTitle();
        }
        return;
      }
    };

    window.addEventListener('click', handleScreenTouchOrClick);

    // Handle returning from another screen/tab/window cleanly
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.prevTimestamp = performance.now();
        this.input.lastInputTime = performance.now();
        this.input.resetAll();
        sounds.resumeAll();
      } else {
        sounds.pauseAll();
      }
    });

    window.addEventListener('focus', () => {
      this.prevTimestamp = performance.now();
      this.input.lastInputTime = performance.now();
      this.input.resetAll();
      sounds.resumeAll();
    });

    window.addEventListener('blur', () => {
      this.input.resetAll();
      sounds.pauseAll();
    });
  }

  // --- STATE TRANSITIONS ---

  private enterTitle() {
    this.leaveOnline();                                       // オンラインの途中だった場合の片付け(オフラインでは何もしない)
    sounds.stopBgm();
    this.prizePileManager.cleanup(this.scene);
    this.state = 'title';
    this.stateTimer = 0;
    this.titleOrbitAngle = 0;
    this.stall.titleRifleGroup.visible = true;
    this.gun.group.visible = false;
    this.corkSystem.reset();
    this.resetAllPrizes();
    this.dynamicTargets.reset();

    this.hud.setMode('title');
    this.hud.updateCrosshair(0, 0, false);

    if (!this.arcadeTitleScreen) {
      this.arcadeTitleScreen = new ArcadeTitleScreen({
        slug: 'ennichi-shateki',
        accentColor: '#ff4d4f',
        tagline: 'むげん連射のお祭りアクション',
        startButtonLabel: 'スタート',
        promptLabel: 'PRESS START / ボタンで開始',
        onStart: () => {
          void this.onStartPressed();
        },
      });
    }
    this.startingFlow = false;
    this.arcadeTitleScreen.show();
  }

  private startGame() {
    if (this.state === 'playing') return;

    this.restoreOfflineView();
    this.arcadeTitleScreen?.hide();
    sounds.init();
    sounds.playTaiko();
    sounds.startBgm();

    this.state = 'playing';
    this.prizePileManager.cleanup(this.scene);
    this.prizePileManager.reset();
    this.stateTimer = 0;
    this.score = 0;
    this.timeLeft = 30.0;
    this.totalDefeatedCount = 0;
    this.bombCooldown = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastScoreMilestone = 0;
    this.lastTickInt = 30;
    this.screenShake = 0;
    this.restockQueue = [];

    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = true;
    this.gun.reset();
    this.corkSystem.reset();
    // 毎回、同じ段の中で景品の並びを入れ替える(高得点の景品は上段のまま)
    shuffleShelfLayout(this.prizes);
    this.resetAllPrizes();
    this.dynamicTargets.reset();
    this.ammo = this.MAX_AMMO;
    this.reloadTimer = 0;
    this.extensionUsed = 0;
    this.extensionExhaustedNotified = false;
    this.comboBonusTier = 0;
    this.hud.updateExtension(this.EXTENSION_BUDGET);
    this.hud.updateAmmo(this.ammo, this.MAX_AMMO, false);

    this.camera.position.set(0, 1.48, 2.15);
    this.camera.lookAt(0, 1.25, -0.6);
    this.input.setAim(0, 0.05);

    this.hud.setMode('playing');
    this.hud.updateInGame(this.shownScore(), this.timeLeft, this.highScore, 1.0, 0);
    this.hud.showFlash('構エ', '大屋台 動く景品と風船 登場', 1.2);
  }

  // --- ONLINE (オンライン対戦: モード選択 → 待機 → 対戦/協力 → 結果) ---

  /** START: オンライン対戦が開かれていればモード選択を挟み、そうでなければ従来どおりそのままオフラインで始める。 */
  private async onStartPressed() {
    if (this.state !== 'title' || this.startingFlow) return;
    this.startingFlow = true;
    this.arcadeTitleScreen?.hide();
    this.onlineStatus = await fetchEnnichiStatus(1500);        // 開催状況の確認は、START の時の1回だけ(WebSocket には繋がない)
    if (this.state !== 'title') return;
    if (this.onlineStatus) this.openModeSelect();
    else this.startGame();
  }

  private openModeSelect() {
    this.state = 'menu';
    this.stateTimer = 0;
    this.hud.setMode('title');
    if (!this.modeSelect) {
      this.modeSelect = new ModeSelect(
        { title: 'モード選択', accent: '#ffd54a', accentEnd: '#ff8c00' },
        (id) => this.onModeSelected(id),
        () => this.enterTitle(),
      );
    }
    const st = this.onlineStatus;
    const full = !!st && st.players >= st.max;                  // 満員でもグレーアウトしない(選ぶと待機画面で「満員です」と案内が出る)
    this.modeSelect.show([
      { id: 'offline', badge: 'OFFLINE', art: OFFLINE_ART, title: 'オフライン', sub: 'ひとりで遊ぶ', desc: '制限時間30秒で、どれだけ景品を落とせるか。自己ベストを狙います。' },
      {
        id: 'online',
        badge: 'ONLINE',
        art: ONLINE_ART,
        title: 'オンライン対戦',
        sub: !st ? '' : full ? '満員' : st.phase !== 'lobby' ? 'プレイ中' : `参加中 ${st.players}/${st.max}`,
        desc: '最大4人で同時に遊びます。対戦は最高得点が勝ち、協力は点数を合算します。どちらで遊ぶかは、参加者の希望で決まります。',
      },
    ]);
  }

  private onModeSelected(id: string) {
    this.modeSelect?.hide();
    if (id === 'offline') {
      this.startGame();
      return;
    }
    this.enterOnlineWait();
  }

  private enterOnlineWait() {
    this.state = 'menu';
    this.stateTimer = 0;
    this.hud.setMode('title');
    this.wireOnline();
    if (!this.waitScreen) {
      this.waitScreen = new WaitScreen(this.net, {
        onBack: () => {                                        // 退出してモード選択へ(接続も切る)
          this.leaveOnline();
          this.openModeSelect();
        },
        onErrorToTitle: (msg: string) => {                     // 接続エラー時はリトライを尋ねず即座にタイトルへ戻る
          this.leaveOnline();
          this.enterTitle();
          this.onlineHud.toast(msg);
        },
      });
    }
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
    this.net.on('start', (m) => this.beginOnlineRound(m));
    this.net.on('go', (m) => this.match?.begin(m));
  }

  private onlineYou = 0;

  /** 開始の合図: 自分の台を共有シードの並びにそろえ、他の人の台などを作り、ロード完了を伝える。 */
  private beginOnlineRound(m: Extract<ServerMsg, { t: 'start' }>) {
    if (this.state !== 'menu') return;
    this.waitScreen?.hide();                                   // 接続は保ったまま、待機画面だけ閉じる
    sounds.init();
    sounds.playTaiko();
    sounds.startBgm();

    this.restoreOfflineView();
    this.prizePileManager.cleanup(this.scene);
    this.prizePileManager.reset();
    this.state = 'playing';
    this.stateTimer = 0;
    this.score = 0;
    this.timeLeft = m.durationMs / 1000;
    this.totalDefeatedCount = 0;
    this.bombCooldown = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.lastScoreMilestone = 0;
    this.lastTickInt = 30;
    this.screenShake = 0;
    this.restockQueue = [];
    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = true;
    this.gun.reset();
    this.corkSystem.reset();
    shuffleShelfLayout(this.prizes, mulberry32(m.seed));        // 全員が同じ景品の並びで始める
    this.resetAllPrizes();
    this.dynamicTargets.reset();
    this.ammo = this.MAX_AMMO;
    this.reloadTimer = 0;
    this.extensionUsed = this.EXTENSION_BUDGET;                  // オンラインでは時間の延長は無い(全員が同時に終わる)
    this.comboBonusTier = 0;
    this.hud.updateExtension(0);
    this.hud.updateAmmo(this.ammo, this.MAX_AMMO, false);

    // 左右に他の人の台が見えるよう、画角を広げる。空の高い所を飛ぶ共有の的を撃てるよう、奥の壁の上は抜ける
    this.camera.fov = 66;
    this.camera.updateProjectionMatrix();
    (this.scene.fog as THREE.FogExp2).density = 0.04;
    this.corkSystem.skyOpen = true;
    this.camera.position.set(0, 1.48, 2.15);
    this.camera.lookAt(0, 1.25, -0.6);
    this.input.setAim(0, 0.05);

    this.hud.setMode('playing');
    this.hud.updateInGame(this.shownScore(), this.timeLeft, this.highScore, 1.0, 0);

    this.match = new OnlineMatch(
      {
        scene: this.scene,
        dynamicTargets: this.dynamicTargets,
        getPrizes: () => this.prizes,
        getAim: () => [this.input.aimX, this.input.aimY],
        getScore: () => ({ score: this.score, defeated: this.defeatedCounts() }),
      },
      this.net,
      this.onlineHud,
      m,
      this.onlineYou,
      {
        onResults: (res) => this.onResultsMsg(res),
        onMyUfoHit: (pts, destroyed) => {
          if (!destroyed) return;
          this.screenShake = 0.9;
          this.hud.showFlash(pts > 0 ? '共有UFO 撃墜' : '巨大UFO 撃破', pts > 0 ? `+${pts}g 獲得` : 'チームの得点に加算', 1.5, true);
        },
        onDisconnect: () => {
          this.leaveOnline();
          this.enterTitle();
        },
      },
    );
    this.net.send({ t: 'loaded' });
  }

  private defeatedCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const e of this.prizePileManager.getDefeatedBreakdown()) out[e.type] = e.count;
    return out;
  }

  /** 自分の得点 + 共有UFOでサーバーに採用された得点(対戦)。 */
  private shownScore(): number {
    return this.score + (this.match?.ufoPts ?? 0);
  }

  private restoreOfflineView() {
    if (this.camera.fov !== 54) {
      this.camera.fov = 54;
      this.camera.updateProjectionMatrix();
    }
    (this.scene.fog as THREE.FogExp2).density = 0.07;
    this.corkSystem.skyOpen = false;
  }

  /** 時間切れ(サーバー時刻): 最終結果を送り、全員分の結果を待つ。 */
  private onOnlineTimeUp() {
    if (!this.match) return;
    sounds.stopBgm();
    sounds.playTimeUp();
    this.hud.showFlash('時間切レ', 'タイムアップ 結果を集計しています', 2.0, true);
    this.match.finish();
    this.state = 'results';
    this.stateTimer = 0;
    this.awaitingResults = true;
    this.awaitResultsUntil = performance.now() + 9000;
    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = false;
    this.hud.setMode('title');
    this.hud.updateCrosshair(0, 0, false);
  }

  /** 全員分の結果が届いた: 全員分の景品を1つの容器に落とす。結果パネルで順位/チームランクを出す。 */
  private onResultsMsg(res: ResultsMsg) {
    const match = this.match;
    if (!match) return;
    this.awaitingResults = false;
    this.state = 'results';
    this.stateTimer = 0;
    this.hud.setMode('title');
    this.hud.updateCrosshair(0, 0, false);
    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = false;
    this.clearOnlineResults();
    this.prizePileManager.cleanup(this.scene);

    // 対戦も協力も、全員分の景品を1つの容器(オフラインと同じ台)に落とす
    const pm = new ResultsPrizePileManager();
    pm.setDefeated(sumDefeated(res.entries.map((e) => e.defeated)));
    pm.startPile(this.scene, this.prizes, this.dynamicTargets);
    this.onlinePiles.push(pm);
    this.onlineHud.onLeave = () => this.enterTitle();
    this.onlineHud.showResults(res.mode, res.entries, res.teamScore, match.you);
    if (res.mode === 'versus' ? res.entries[0]?.id === match.you : res.teamScore > 0) sounds.playGrandPrizeFanfare();
    else sounds.playTaiko();
  }

  private clearOnlineResults() {
    for (const pm of this.onlinePiles) pm.cleanup(this.scene);
    this.onlinePiles = [];
  }

  /** 結果が届かない(切断など): 自分の成績だけの従来の結果画面にする。 */
  private fallbackLocalResults() {
    this.awaitingResults = false;
    this.match?.dispose();
    this.match = null;
    this.restoreOfflineView();
    this.enterResults();
  }

  /** オンラインの途中だった場合の片付け。オフラインでは何も起きない。 */
  private leaveOnline() {
    this.waitScreen?.hide();
    this.modeSelect?.hide();
    this.match?.dispose();
    this.match = null;
    this.clearOnlineResults();
    this.awaitingResults = false;
    this.onlineHud.hide();
    if (this.net.connected) {
      this.net.send({ t: 'leave' });
      this.net.close();                                         // 開いたままにして負荷をかけない
    }
    this.restoreOfflineView();
  }

  // --- HIGH SCORES (ブラウザに保存して、再読み込みしても残す) ---
  private static readonly HIGH_SCORE_KEY = 'ennichi_shateki_highscores';

  private loadHighScores() {
    try {
      const raw = localStorage.getItem(ArcadeCorkShooter.HIGH_SCORE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      const entries = parsed
        .filter((e) => e && typeof e.score === 'number' && typeof e.name === 'string')
        .slice(0, 5)
        .map((e, idx) => ({ rank: idx + 1, score: e.score, name: e.name }));
      if (entries.length === 0) return;
      this.hud.highScores = entries;
      this.highScore = entries[0].score;
    } catch {
      // 保存データが壊れていたら初期値のまま
    }
  }

  /** 今回のスコアがトップ5に入るなら、順位の位置に挿入して保存する(1位でなくても記録される) */
  private recordHighScore(score: number) {
    const list = this.hud.highScores;
    if (list.length >= 5 && score <= list[list.length - 1].score) return;
    list.push({ rank: 0, score, name: 'しゃてき名人' });
    list.sort((a, b) => b.score - a.score);
    this.hud.highScores = list.slice(0, 5);
    this.hud.highScores.forEach((e, idx) => (e.rank = idx + 1));
    try {
      localStorage.setItem(ArcadeCorkShooter.HIGH_SCORE_KEY, JSON.stringify(this.hud.highScores));
    } catch {
      // 保存できない環境(プライベートモードなど)では、今回の起動中だけ有効
    }
  }

  private enterResults() {
    sounds.stopBgm();
    this.state = 'results';
    this.stateTimer = 0;

    const isNewRecord = this.score > this.highScore;
    if (isNewRecord) this.highScore = this.score;
    this.recordHighScore(this.score);
    if (isNewRecord) {
      sounds.playGrandPrizeFanfare();
    } else {
      sounds.playTaiko();
    }

    this.stall.titleRifleGroup.visible = false;
    this.gun.group.visible = false;

    // Trigger 3D digital scale presentation on counter
    this.prizePileManager.startPile(this.scene, this.prizes, this.dynamicTargets);

    const breakdown = this.prizePileManager.getDefeatedBreakdown();
    this.hud.setMode('results');
    this.hud.renderResults(this.score, this.totalDefeatedCount, isNewRecord, breakdown);
    this.hud.updateCrosshair(0, 0, false);
  }

  private resetAllPrizes() {
    this.prizes.forEach((p) => p.reset());
    this.restockQueue = [];
  }

  // --- SHOOTING LOGIC ---

  private tryShootNormal(): boolean {
    // 弾切れ(再装填中)は撃てない
    if (this.ammo <= 0) return false;
    this.ammo--;
    if (this.ammo === 0) this.reloadTimer = this.RELOAD_TIME;
    this.hud.updateAmmo(this.ammo, this.MAX_AMMO, this.ammo === 0);

    sounds.playShoot(false);
    this.screenShake = 0.2;

    const fireData = this.gun.fire(this.scene, false);
    const shootDir = this.aimTargetWorld.clone().sub(fireData.origin).normalize();
    this.corkSystem.spawn(fireData.origin, shootDir, 'normal');
    this.match?.sendFire('n', fireData.origin, shootDir);

    const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
    this.hud.updateInGame(this.shownScore(), this.timeLeft, this.highScore, bombRatio, this.comboCount);
    return true;
  }

  private tryShootExplosive(): boolean {
    if (this.bombCooldown > 0) return false;

    this.bombCooldown = this.BOMB_RECHARGE_TIME;
    sounds.playShoot(true);
    this.screenShake = 0.45;

    const fireData = this.gun.fire(this.scene, true);
    const shootDir = this.aimTargetWorld.clone().sub(fireData.origin).normalize();
    this.corkSystem.spawn(fireData.origin, shootDir, 'explosive');
    this.match?.sendFire('b', fireData.origin, shootDir);

    this.hud.updateInGame(this.shownScore(), this.timeLeft, this.highScore, 0.0, this.comboCount);
    return true;
  }

  // --- ANIMATION LOOP ---

  private prevTimestamp: number = 0;

  private animate = (timestamp: number) => {
    requestAnimationFrame(this.animate);

    const rawDt = this.prevTimestamp === 0 ? 0.016 : (timestamp - this.prevTimestamp) / 1000;
    // Guard against time warp / accumulated delta spikes when returning from another screen
    const dt = rawDt > 0.35 ? 0.016 : Math.min(0.05, Math.max(0.001, rawDt));
    this.prevTimestamp = timestamp;
    const elapsed = timestamp / 1000;

    const inputState = this.input.update(dt);
    this.stall.update(dt, elapsed);
    this.dynamicTargets.update(dt, elapsed);
    this.hud.updateFlash(dt);

    if (this.bombCooldown > 0) {
      this.bombCooldown = Math.max(0, this.bombCooldown - dt);
    }

    if (this.comboCount > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.comboBonusTier = 0;
      }
    }

    // 再装填
    if (this.ammo <= 0 && this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.ammo = this.MAX_AMMO;
        this.reloadTimer = 0;
        this.hud.updateAmmo(this.ammo, this.MAX_AMMO, false);
      }
    }

    const baseCamX = 0;
    const baseCamY = 1.48;
    const baseCamZ = 2.15;

    switch (this.state) {
      case 'title':
        this.updateTitle(dt, elapsed, inputState);
        break;
      case 'menu':
        this.updateMenu(dt);
        break;
      case 'playing':
        this.updatePlaying(dt, elapsed, inputState);
        break;
      case 'results':
        this.updateResults(dt, inputState);
        break;
    }

    if (this.state === 'playing') {
      if (this.screenShake > 0) {
        this.screenShake = Math.max(0, this.screenShake - dt * 2.8);
        const shakeMag = this.screenShake * 0.055;
        this.camera.position.x = baseCamX + (Math.random() - 0.5) * shakeMag;
        this.camera.position.y = baseCamY + (Math.random() - 0.5) * shakeMag;
        this.camera.position.z = baseCamZ + (Math.random() - 0.5) * shakeMag;
      } else {
        this.camera.position.set(baseCamX, baseCamY, baseCamZ);
      }
    }

    this.updatePrizes(dt);
    this.updateAutomaticRestock(dt);
    this.match?.update(dt, elapsed);

    // Step projectiles with shelf prizes and dynamic moving/flying targets
    this.corkSystem.update(
      dt,
      this.prizes,
      this.dynamicTargets,
      (targetName, directPoints, _hitPoint, isExplosive) => {
        if (this.match && targetName === '黄金UFO') {
          // 共有の的: 当たりの採否・得点はサーバーが決める(最初に当てた人だけ)。ここでは報告するだけ
          this.match.reportUfoHit();
          this.screenShake = 0.5;
          return;
        }
        if (directPoints > 0) {
          // Dynamic target hit (Balloon / Duck / UFO)
          this.totalDefeatedCount++;
          this.comboCount++;
          this.comboTimer = 2.4;
          sounds.playCombo(this.comboCount);

          const multiplier = 1.0 + Math.min(2.0, (this.comboCount - 1) * 0.2);
          const pts = Math.round(directPoints * multiplier);
          this.score += pts;

          if (targetName === '黄金UFO') {
            this.screenShake = 0.9;
            this.hud.showFlash('黄金UFO 撃墜', `+${pts}g 獲得`, 1.5, true);
            this.prizePileManager.recordDefeated('ufo', '黄金UFO');
            this.addTimeBonus(1.5, '黄金UFO 撃墜');
          } else if (targetName === 'お祭り風船') {
            this.screenShake = 0.4;
            this.hud.showFlash('風船破裂', `+${pts}g`, 0.8);
            this.prizePileManager.recordDefeated('balloon', 'お祭り風船');
          } else if (targetName === '射的アヒル') {
            this.screenShake = 0.35;
            this.hud.showFlash('アヒル撃ち落とし', `+${pts}g`, 0.8);
            this.prizePileManager.recordDefeated('duck', '射的アヒル');
          }

          this.checkComboBonus();
          this.checkScoreMilestones();
        } else if (isExplosive) {
          this.screenShake = 0.85;
        } else {
          this.screenShake = 0.25;
        }
      }
    );

    this.renderer.render(this.scene, this.camera);
  };

  // Score-based time recovery (+0.5 seconds per 2500 points milestone)
  private checkScoreMilestones() {
    const MILESTONE_STEP = 2500;
    while (this.score >= this.lastScoreMilestone + MILESTONE_STEP) {
      this.lastScoreMilestone += MILESTONE_STEP;
      this.addTimeBonus(0.5, `重量 ${this.lastScoreMilestone}g 達成`);
    }
  }

  /**
   * 時間の延長。1プレイで延長できる総量は EXTENSION_BUDGET(15秒)まで。
   * 延長の種類(金の大ダルマ・得点・連鎖・黄金UFO)がいくつあっても、枠を使い切ればそれ以上は延びないので、無限には続かない。
   */
  private addTimeBonus(rawBonus: number, reason: string) {
    if (this.match) return;                                  // オンラインは延長なし
    const remaining = this.EXTENSION_BUDGET - this.extensionUsed;
    if (remaining <= 0.05) {
      if (!this.extensionExhaustedNotified) {
        this.extensionExhaustedNotified = true;
        this.hud.showFlash('延長枠 使い切り', 'これ以上は延びません', 1.4, true);
      }
      return;
    }
    const bonus = Math.min(Math.max(0.1, rawBonus), remaining);
    this.extensionUsed += bonus;
    this.timeLeft = Math.min(this.MAX_TIME_CAP, this.timeLeft + bonus);
    this.hud.updateExtension(this.EXTENSION_BUDGET - this.extensionUsed);
    sounds.playTimeExtend();
    this.hud.showFlash(`延長 +${bonus.toFixed(1)}秒`, reason, 1.6, true);
  }

  /** 連鎖(コンボ)が5・10に達したときの延長。1つの連鎖につき各段階1回だけ */
  private checkComboBonus() {
    const tiers = [
      { at: 5, bonus: 0.5 },
      { at: 10, bonus: 1.0 },
    ];
    for (let i = 0; i < tiers.length; i++) {
      if (this.comboCount >= tiers[i].at && this.comboBonusTier < i + 1) {
        this.comboBonusTier = i + 1;
        this.addTimeBonus(tiers[i].bonus, `${tiers[i].at}連鎖 達成`);
      }
    }
  }

  // --- AUTOMATIC REPLENISHMENT ---

  private updateAutomaticRestock(dt: number) {
    for (let i = this.restockQueue.length - 1; i >= 0; i--) {
      const item = this.restockQueue[i];
      item.timer -= dt;

      if (item.timer <= 0) {
        const prize = this.prizes.find((p) => p.config.slotId === item.slotId);
        if (prize) {
          prize.triggerSpawnEffect();
          if (this.state === 'playing') {
            this.hud.showFlash('新入荷', `${prize.config.name} 入荷`, 0.8);
          }
        }
        this.restockQueue.splice(i, 1);
      }
    }
  }

  // --- STATE UPDATES ---

  private updateTitle(dt: number, _elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;
    this.titleOrbitAngle += dt * 0.30;

    const camX = Math.sin(this.titleOrbitAngle) * 1.1;
    const camY = 1.48 + Math.cos(this.titleOrbitAngle * 0.6) * 0.14;
    const camZ = 2.35 + Math.cos(this.titleOrbitAngle) * 0.25;

    this.camera.position.set(camX, camY, camZ);
    this.camera.lookAt(0, 1.25, -0.4);

    if (this.stateTimer > 0.35 && (inputState.startJustPressed || inputState.shootNormalJustPressed)) {
      void this.onStartPressed();
      return;
    }
  }

  /** モード選択・待機画面: タイトルと同じようにカメラをゆっくり回す(入力では何も始まらない)。 */
  private updateMenu(dt: number) {
    this.stateTimer += dt;
    this.titleOrbitAngle += dt * 0.30;
    this.camera.position.set(Math.sin(this.titleOrbitAngle) * 1.1, 1.48 + Math.cos(this.titleOrbitAngle * 0.6) * 0.14, 2.35 + Math.cos(this.titleOrbitAngle) * 0.25);
    this.camera.lookAt(0, 1.25, -0.4);
  }

  // Active Gameplay Loop
  private updatePlaying(dt: number, elapsed: number, inputState: ReturnType<ArcadeInput['update']>) {
    // 1. Time countdown (オンライン: サーバー時刻で全員同時に終わる)
    if (this.match) {
      this.timeLeft = this.match.timeLeftSec();
    } else {
      this.timeLeft -= dt;
      if (this.timeLeft < 0) this.timeLeft = 0;
    }

    const curSec = Math.floor(this.timeLeft);
    if (curSec <= 5 && curSec < this.lastTickInt && curSec > 0) {
      sounds.playTick();
      this.lastTickInt = curSec;
    }

    // 2. Crosshair & 3D Aim Target
    this.updateAimPlane();

    let isHovering = false;
    for (const p of this.prizes) {
      if (!p.isDefeated && this.raycaster.ray.intersectsBox(p.getBoundingBox())) {
        isHovering = true;
        break;
      }
    }
    if (!isHovering) {
      for (const b of this.dynamicTargets.balloons) {
        if (!b.isPopped && this.raycaster.ray.intersectsBox(b.getBoundingBox())) {
          isHovering = true;
          break;
        }
      }
    }
    if (!isHovering) {
      for (const d of this.dynamicTargets.ducks) {
        if (!d.isDown && this.raycaster.ray.intersectsBox(d.getBoundingBox())) {
          isHovering = true;
          break;
        }
      }
    }
    if (!isHovering && !this.dynamicTargets.ufo.isHit) {
      if (this.raycaster.ray.intersectsBox(this.dynamicTargets.ufo.getBoundingBox())) {
        isHovering = true;
      }
    }

    this.hud.updateCrosshair(this.input.aimX, this.input.aimY, true, isHovering);

    // 3. Update Gun aiming
    this.gun.update(dt, elapsed, this.camera, this.aimTargetWorld, true);

    // 4. Shooting Inputs (オンライン: カウントダウン中は撃てない)
    if (!this.match || this.match.phase === 'playing') {
      if (inputState.shootExplosiveJustPressed) {
        this.tryShootExplosive();
      } else if (inputState.shootNormalJustPressed) {
        this.tryShootNormal();
      }
    }

    // 5. Update HUD
    const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
    this.hud.updateInGame(this.shownScore(), this.timeLeft, this.highScore, bombRatio, this.comboCount);

    // 6. Game Over check
    if (this.match) {
      if (this.match.phase === 'ended') this.onOnlineTimeUp();
      return;
    }
    if (this.timeLeft <= 0) {
      sounds.playTimeUp();
      this.hud.showFlash('時間切レ', 'タイムアップ 成績発表へ', 2.0, true);
      this.enterResults();
      return;
    }
  }

  private updateResults(dt: number, inputState: ReturnType<ArcadeInput['update']>) {
    this.stateTimer += dt;

    // オンライン: 全員の結果が届くまで待つ(届かなければ、自分の成績だけの結果にする)
    if (this.awaitingResults) {
      if (performance.now() > this.awaitResultsUntil || this.match?.disconnected) this.fallbackLocalResults();
      return;
    }

    // 1. Update 3D physics prize drop simulation and off-screen despawning
    if (this.onlinePiles.length > 0) {
      for (const pm of this.onlinePiles) pm.update(dt, this.camera);
    } else {
      this.prizePileManager.update(dt, this.camera);
    }

    // 2. Smooth cinematic camera glide framing the tabletop desk (机の下を見切れさせる)
    const isWide = window.innerWidth >= 860;
    let targetCamX = isWide ? -0.18 : 0.05;
    let targetCamY = 1.20;
    let targetCamZ = isWide ? 1.95 : 2.25;
    let lookX = 0.38, lookY = 1.10, lookZ = 1.35;
    this.camera.position.x += (targetCamX - this.camera.position.x) * 3.5 * dt;
    this.camera.position.y += (targetCamY - this.camera.position.y) * 3.5 * dt;
    this.camera.position.z += (targetCamZ - this.camera.position.z) * 3.5 * dt;
    this.camera.lookAt(lookX, lookY, lookZ);

    if (this.stateTimer > 1.0 && !this.match && (inputState.startJustPressed || inputState.shootNormalJustPressed)) {
      this.enterTitle();
    }
  }

  private updateAimPlane() {
    this.raycaster.setFromCamera(new THREE.Vector2(this.input.aimX, this.input.aimY), this.camera);
    const aimPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.55);
    const hitPoint = new THREE.Vector3();
    if (this.raycaster.ray.intersectPlane(aimPlane, hitPoint)) {
      this.aimTargetWorld.copy(hitPoint);
    } else {
      this.aimTargetWorld.copy(this.camera.position).addScaledVector(this.raycaster.ray.direction, 3.0);
    }
  }

  // Step Prize physics simulation and handle toppling/scoring/restocking
  private updatePrizes(dt: number) {
    for (const prize of this.prizes) {
      const newlyDefeated = prize.update(dt);
      if (newlyDefeated) {
        this.totalDefeatedCount++;
        this.comboCount++;
        this.comboTimer = 2.4;
        sounds.playCombo(this.comboCount);
        this.prizePileManager.recordDefeated(prize.config.type, prize.config.name);

        const multiplier = 1.0 + Math.min(2.0, (this.comboCount - 1) * 0.2);
        const addedPoints = Math.round(prize.config.points * multiplier);
        this.score += addedPoints;
        this.screenShake = 0.65;

        // Capped time bonus: ONLY Golden Daruma recovers time (+1.5 seconds)
        // All other prizes (treasure, lucky cat, tv, etc.) do not restore time.
        if (prize.config.type === 'daruma') {
          this.addTimeBonus(1.5, `特賞 ${prize.config.name} 撃破`);
        } else if (this.comboCount >= 3) {
          this.hud.showFlash(
            `${this.comboCount}連鎖 COMBO`,
            `${prize.config.name} +${addedPoints}g`,
            1.2
          );
        } else {
          this.hud.showFlash('撃破', `${prize.config.name} +${addedPoints}g`, 1.0);
        }

        // 連鎖(5・10)と得点による時間延長(延長枠の範囲内)
        this.checkComboBonus();
        this.checkScoreMilestones();

        // Automatic restocking queue:
        // Top shelf (Tier 2) has slowed replenishment speed (6.5s) to preserve luxury rarity!
        let restockDelay = 1.8;
        if (prize.config.shelfIndex === 2) {
          restockDelay = 6.5; // Slow down top shelf restocking significantly
        } else if (prize.config.shelfIndex === 1) {
          restockDelay = 3.0; // Medium shelf restocking
        }

        this.restockQueue.push({
          slotId: prize.config.slotId,
          timer: restockDelay,
        });

        const bombRatio = 1.0 - this.bombCooldown / this.BOMB_RECHARGE_TIME;
        this.hud.updateInGame(this.shownScore(), this.timeLeft, this.highScore, bombRatio, this.comboCount);
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new ArcadeCorkShooter();
});
