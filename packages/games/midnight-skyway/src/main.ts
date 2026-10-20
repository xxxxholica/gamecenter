import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { AutoPilot } from './core/AutoPilot';
import { GarageScene } from './core/GarageScene';
import { DragonCarModel } from './models/DragonCarModel';
import { preloadGlbCars } from './models/CarModelLoader';
import { CarBase } from './models/CarBase';

import { boostThemeFor } from './core/BoostTheme';
import { DriveScene } from './core/DriveScene';
import { DriveHUD } from './ui/DriveHUD';
import { MapBase } from './maps/MapBase';
import { TokyoMap } from './maps/TokyoMap';
import { HelsinkiTechnicalMap } from './maps/HelsinkiTechnicalMap';
import { TokyoClimbMap } from './maps/TokyoClimbMap';
import { STAGES } from './ui/stages';
import { benchParam, benchReady, benchDone, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import { RaceDirector } from './core/RaceDirector';
import { TimeAttackManager } from './core/TimeAttackManager';

import { GameFlowManager } from './ui/GameFlowManager';
import { TitleScreen } from './ui/TitleScreen';
import { CarSelectScreen } from './ui/CarSelectScreen';
import { MapSelectScreen } from './ui/MapSelectScreen';
import type { GhostTrace } from './core/Ghost';
import { StageLoadingScreen } from './ui/StageLoadingScreen';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { reportDeepAnalytics, reportRoundStart } from '../../../shared/arcadeAnalytics';
import { replayBarrier } from '../../../shared/arcadeReplay';
import { PadEdge, readPad, startPadLoop } from '../../../shared/arcadePad';
import { audio } from './audio';
import { createNet } from './net/skywayNet';
import { OnlineRace } from './net/OnlineRace';
import { mulberry32 } from '../../../shared/online/seededRandom';
import { fetchGhost, loadRawScores, saveLeaderboardScore } from '../../../shared/arcadeLeaderboard';
import { runHighScoreEntryFlow, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';
import { setTrafficRng } from './core/Traffic';
import { LobbyScreen } from './ui/LobbyScreen';
import { ModeSelectScreen } from './ui/ModeSelectScreen';
import { OnlineHUD } from './ui/OnlineHUD';
import { fetchSkywayStatus } from './net/skywayNet';
import type { CarSpec, PublicStatus, RacerInfo, ServerMsg } from '../../../shared/netProtocol';
import { CAR_TYPES, type CarType } from '../../../shared/carPalette';

const { bgm, sfx } = audio;

// オンライン対戦はイベント用: 主催者が開放している間だけ、コース選択に「オンライン対戦」の項目が出る。
// 開放/閉鎖はゲーム画面からは行わない(管理画面か、サーバー機上の `npm run ctl`)。
// WebSocket に繋ぐのは、その項目を選んで待機画面に入った時だけ。

// 戻る操作は Backspace(アケコンは SELECT)に統一。Escape は無効
installHomeReturn();
watchResultAutoReturn(['res-btn-title']);

// 画面ごとのアケコンガイド(左下。呼ぶたびに前の画面のカードと入れ替わる)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート', keyLabel: 'Enter' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
const guideModeSelect = () => mountArcadeGuide({
  moveLabel: 'モード選択',
  keyMoveKeys: 'WASD',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideCarSelect = () => mountArcadeGuide({
  moveLabel: 'マシン選択',
  keyMoveKeys: 'WASD',
  buttons: [
    { indices: [2, 3, 4, 5], label: 'カラー変更', keyLabel: 'C' },
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideMapSelect = () => mountArcadeGuide({
  moveLabel: 'コース選択',
  keyMoveKeys: 'WASD',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideLobby = () => mountArcadeGuide({
  moveLabel: 'マシン選択',
  keyMoveKeys: 'WASD',
  buttons: [
    { indices: [2, 3, 4, 5], label: 'カラー変更', keyLabel: 'C' },
    { indices: [0], label: 'コース希望へ' },
    { indices: [1], label: '退出' },
  ],
  showHomeHint: true,
});
const guideOnlineCourse = () => mountArcadeGuide({
  moveLabel: 'コース希望',
  keyMoveKeys: 'WASD',
  buttons: [
    { indices: [0], label: '待機画面へ' },
    { indices: [1], label: 'マシン選択へ' },
  ],
  showHomeHint: true,
});
const guideOnlineWait = () => mountArcadeGuide({
  moveLabel: 'ボタン選択',
  keyMoveKeys: 'WASD',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
// レース中のガイドは、メニュー(ポーズ・結果)を開いている間だけ、メニュー用に入れ替える
let raceGuideState: 'race' | 'pause' | 'result' = 'race';
/** ロード中(ロード画面を出してから、明転が始まるまで)は、ガイドを出さない */
let raceLoading = false;
const guideRace = (hidden = false): HTMLElement => {
  raceGuideState = 'race';
  const root = mountArcadeGuide({
    moveLabel: 'ハンドル',
    keyMoveKeys: 'A / D',
    buttons: [
      { indices: [0], label: '加速', keyLabel: 'W' },
      { indices: [1], label: 'ハンドブレーキ', keyLabel: 'Space' },
      { indices: [3], label: '前方確認', keyLabel: 'V' },
    ],
    showHomeHint: true,
    backLabel: 'ポーズ',
  });
  if (hidden) { root.style.transition = 'none'; root.style.opacity = '0'; }   // 明転に合わせて、あとから fadeGuide で出す
  return root;
};
/** ボタンガイドを、ms かけて見えなく(to=0)/ 見えるように(to=1)する */
const fadeGuide = (root: HTMLElement | null, to: 0 | 1, ms: number): void => {
  if (!root) return;
  void root.offsetWidth;
  root.style.transition = `opacity ${ms}ms ${to ? 'ease-out' : 'ease-in'}`;
  root.style.opacity = String(to);
};
const guideRaceMenu = (state: 'pause' | 'result') => {
  raceGuideState = state;
  mountArcadeGuide({
    moveLabel: 'ボタン選択',
    keyMoveKeys: 'WASD',
    buttons: [{ indices: [0], label: '決定' }],
    showHomeHint: true,
    backLabel: state === 'pause' ? '再開' : 'タイトルへ',
  });
};

window.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('canvas-container');
  const titleContainer = document.getElementById('screen-title');
  const carSelectContainer = document.getElementById('screen-car-select');
  const mapSelectContainer = document.getElementById('screen-map-select');
  const stageLoadingContainer = document.getElementById('screen-stage-loading');
  const lobbyContainer = document.getElementById('screen-lobby');
  const modeSelectContainer = document.getElementById('screen-mode-select');
  const appEl = document.getElementById('app');
  const hudContainer = document.getElementById('drive-hud-container');

  if (!container || !titleContainer || !carSelectContainer || !mapSelectContainer || !stageLoadingContainer || !hudContainer || !lobbyContainer || !modeSelectContainer || !appEl) {
    console.error('Required screen containers not found');
    return;
  }

  // Preload GLTF binary models before scene initialization
  await replayBarrier('boot-load', preloadGlbCars());   // (操作のリプレイ: 読み込みが終わった所を、記録と揃える)

  // 起動の各段階(ガレージ・車・走行シーン・マップ・シェーダ準備)を続けて行うと、1 回で 1 秒以上画面が止まる
  // (Firefox: 約1.2秒。Windows の Chrome: ガレージ〜マップ作りまでの 1 回だけで 0.8〜1.35 秒)。
  // 段階の間で1フレーム譲り、1回の止まりを短くする(ページが裏にあって rAF が来なくても、少し待てば進める)
  const yieldFrame = () => new Promise<void>((resolve) => { requestAnimationFrame(() => resolve()); setTimeout(resolve, 100); });

  // ==========================================
  // 1. Initialize Garage Scene
  // ==========================================
  const garage = new GarageScene(container);
  await yieldFrame();

  // Car Models (3 Dragon Cars)
  const carModels: Record<CarType, CarBase> = {
    dragon_a: new DragonCarModel('a'),
    dragon_b: new DragonCarModel('b'),
    dragon_c: new DragonCarModel('c'),
  };
  await yieldFrame();

  let currentCar: CarBase = carModels.dragon_a;
  garage.turntableGroup.add(currentCar.group);

  // ベンチマーク(?bench=1)の場面: 全ステージ × 全マシンのレース、全マシンのガレージ、タイトル
  declareBenchTargets([
    { id: 'title', label: 'タイトル', kind: 'title', params: { scene: 'title' }, input: 'idle', seconds: 20 },
    ...CAR_TYPES.map((car) => ({ id: `garage-${car}`, label: `マシン選択 ${car}`, kind: 'garage', params: { scene: 'garage', car }, input: 'idle' as const, seconds: 20 })),
    ...STAGES.flatMap((st) => CAR_TYPES.map((car) => ({
      id: `race-${st.id}-${car}`,
      label: `${st.title} / ${car}`,
      kind: 'race',
      params: { scene: 'race', stage: st.id, car },
      input: 'self' as const,
      seconds: 300,      // 1周走りきると benchDone() で止まる。これは打ち切りの上限
    }))),
  ]);
  const benchScene = benchParam('scene');
  const benchAutoDrive = benchScene === 'race';   // ベンチ: HUD は出したまま、コースの1周をオートパイロットで走る
  const benchCar = benchParam('car');
  if (benchCar && benchCar in carModels) {
    garage.turntableGroup.remove(currentCar.group);
    currentCar = carModels[benchCar as CarType];
    garage.turntableGroup.add(currentCar.group);
  }

  // ==========================================
  // 2. Initialize Drive Scene & Maps
  // ==========================================
  const driveScene = new DriveScene(garage.renderer);
  await yieldFrame();

  // Map registry
  const mapFactories: Record<string, () => MapBase> = {
    tokyo_skyway: () => new TokyoMap(),
    helsinki_technical: () => new HelsinkiTechnicalMap(),
    tokyo_climb: () => new TokyoClimbMap(),
  };

  let lightsBeforeRace = true;   // the garage's own headlight setting, restored when the car goes back
  const benchStage = benchParam('stage');
  let currentMapId = benchStage && benchStage in mapFactories ? benchStage : 'tokyo_skyway';
  const bootMapId = currentMapId;   // 起動時に作っておくマップ(通常は東京。ベンチでは指定のステージ)
  let currentMapInstance: MapBase = mapFactories[currentMapId]();
  let bootMapUnused = true;
  await yieldFrame();
  driveScene.loadMap(currentMapInstance, false);
  await yieldFrame();
  await driveScene.warmupAsync(Object.values(carModels));   // シェーダは並列にコンパイルし終えてから描く(リンクの完了待ちで止まらない)
  for (const car of Object.values(carModels)) driveScene.clearPaintEnvironment(car);   // ガレージ側の環境マップに戻す
  garage.renderer.clear();   // 準備の描画(全車種を原点に重ねた走行シーン)が、譲ったフレームで画面に出ないように消す
  await yieldFrame();
  await garage.warmup();

  // ==========================================
  // 3. Initialize Time Attack Manager
  // ==========================================
  const timeAttack = new TimeAttackManager();

  const syncBestTimeDisplay = () => {
    const best = timeAttack.getBestRecord(currentMapId);
    driveHUD.updateBestTime(best ? timeAttack.formatTime(best.bestTimeMs) : null);
  };

  // ==========================================
  // Online (event) mode state
  // ==========================================
  const net = createNet();
  let onlineRoom: Extract<ServerMsg, { t: 'room' }> | null = null;
  interface OnlineSession {
    seed: number;
    slot: number;
    players: RacerInfo[];
    you: number;
    race: OnlineRace | null;
    ready: boolean;                                          // マップのロードが終わった
    goAt: number | null;                                     // サーバー時刻: カウントダウン開始(go を受け取ってから、カウントダウンを始めるまで)
    goTime: number | null;                                   // サーバー時刻: 実際のGO(カウントダウン後)。完走タイムを実経過時間で出すのに使う
    disconnected: boolean;
    finished: boolean;
  }
  let online: OnlineSession | null = null;
  const onlineHUD = new OnlineHUD(appEl);
  const GO_COUNTDOWN_MS = 3000;

  /** 待機中に自分で選んだ(または前のレースで走った)マシン。次に参加した時、最初に希望として送り直す。 */
  let onlinePicked: CarSpec | null = null;
  /** STARTを押した時に取得した、オンライン対戦の開催状況(null=閉鎖中)。モード選択に出す。 */
  let onlineStatus: PublicStatus | null = null;

  let lastWarnSec = -1;   // the last whole second for which the low-time beep sounded

  /** 一緒に走るゴースト(そのコースのランキング1位で、ゴーストが保存されているもの)。null ならペースボットが走る。オンライン対戦では使わない。 */
  let ghostPick: { id: string; rank: number } | null = null;

  /** 選んだコースのランキングを取得し、いちばん上位のゴーストを走らせる相手にする。取得に失敗したらペースボット。 */
  const loadGhostChoices = async () => {
    const scores = await loadRawScores('midnight-skyway', currentMapId);
    const first = scores.find((e) => e.hasGhost && e.id);
    ghostPick = first ? { id: first.id!, rank: first.rank } : null;
  };

  const restartRace = (changeBgm = false) => {
    driveHUD.hideResultModal();
    driveHUD.hidePauseModal();
    lastWarnSec = -1;
    if (changeBgm) {
      bgm.play('race', true);
    }
    bgm.duck(1);
    sfx.startEngine();
    driveScene.respawnCar();
    if (driveScene.carController) {
      driveScene.carController.canDrive = false;
    }
    timeAttack.initCourse(currentMapId, currentCar.specs.name);
    driveHUD.resetSectors();
    raceDirector.prepare(currentMapInstance, currentMapId, currentCar);
    reportDeepAnalytics('progression_update', {
      vehicle: currentCar.specs.name,
      mode: online ? 'オンライン' : 'ひとり',
      maxStage: currentMapId,
      extraStats: { map: currentMapId },
    });
    reportRoundStart({ map: currentMapId, car: currentCar.specs.name, mode: online ? 'オンライン' : 'ひとり' });
    syncBestTimeDisplay();
    if (online) return;                                      // オンライン: 全員のロードが揃って go が来てから始める
    timeAttack.startCountdown();
  };

  /** go を受け取り、かつ自分のロードも終わっていれば、全員のGOが揃うカウントダウンを始める。 */
  const tryStartOnlineCountdown = () => {
    if (!online || !online.ready || online.goAt === null || !online.race) return;
    const goAt = online.goAt;
    online.goAt = null;
    onlineHUD.showWaiting(null);
    online.race.begin();
    const goTime = goAt + GO_COUNTDOWN_MS;
    online.goTime = goTime;
    // BGM: 部屋の乱数の種で全員が同じ曲を選び、カウントダウンの開始(goAt)を曲の頭にそろえる
    bgm.playSynced(online.seed, performance.now() + (goAt - net.serverNow()));
    const traffic = currentMapInstance.traffic;
    if (traffic) traffic.sharedClock = () => (net.serverNow() - goTime) / 1000;
    timeAttack.startCountdownSynced(goTime - net.serverNow(), () => goTime - net.serverNow());
  };

  timeAttack.callbacks.onCountdown = (step) => {
    driveHUD.showCountdown(step);
    sfx.countdown(step);
    if (step === 'GO') {
      if (driveScene.carController) {
        driveScene.carController.canDrive = true;
      }
    } else {
      if (driveScene.carController) {
        driveScene.carController.canDrive = false;
      }
    }
  };

  timeAttack.callbacks.onTimeUpdate = (_ms, formatted) => {
    driveHUD.updateTimer(formatted);
    driveHUD.updateSectorLive(timeAttack.currentSectorElapsedMs);
  };

  timeAttack.callbacks.onSectorPassed = (sector) => {
    driveHUD.setSector(sector);
    sfx.sector();
  };

  timeAttack.callbacks.onGate = (_i, bonusMs) => {
    raceDirector.onGate(bonusMs);
    sfx.gate();
  };
  timeAttack.callbacks.onRemaining = (ms) => {
    raceDirector.onRemaining(ms);
    const sec = Math.ceil(ms / 1000);
    if (sec <= 10 && sec > 0 && sec !== lastWarnSec) {
      lastWarnSec = sec;
      sfx.warning();
    }
  };

  timeAttack.callbacks.onGoal = (result) => {
    if (benchAutoDrive) benchDone(result.timedOut ? 'goal-timeout' : 'goal');
    driveHUD.finishSectors(result.sectors);
    reportDeepAnalytics('progression_update', {
      result: result.timedOut ? 'gameover' : 'clear',
      ...(result.timedOut ? { deathReason: 'タイムアップ' } : {}),
      vehicle: currentCar.specs.name,
      mode: online ? 'オンライン' : 'ひとり',
      maxStage: currentMapId,
      extraStats: { map: currentMapId, totalTimeMs: Math.round(result.totalTimeMs), sectorMs: result.sectors.map((x) => Math.round(x.timeMs)) },
    });
    raceDirector.onGoal(result);
    if (online && !online.disconnected && !result.timedOut) {
      online.finished = true;
      // 完走タイムは、フレームの積算(背景タブやラグでずれる)ではなく、サーバー時刻のGOからの実経過時間で送る。結果表は results の受信で出る
      const elapsed = online.goTime !== null ? Math.max(1, Math.round(net.serverNow() - online.goTime)) : Math.round(result.totalTimeMs);
      net.send({ t: 'finish', timeMs: elapsed });
      bgm.duck(0.3);
      sfx.goal();
      return;
    }
    driveHUD.showResultModal(result);
    if (!result.timedOut) driveScene.setResultView(true);   // 走り続ける車を前から映し、リザルトは左に出す
    bgm.duck(0.3);
    if (result.timedOut) sfx.timeUp();
    else sfx.goal();
    syncBestTimeDisplay();

    if (!result.timedOut && result.totalTimeMs > 0) {
      const trace = raceDirector.lastTrace;   // 登録のときに、この走行をゴーストとして一緒に送る
      const totalTimeMs = Math.round(result.totalTimeMs);
      runHighScoreEntryFlow({
        slug: 'midnight-skyway',
        score: totalTimeMs,
        variantId: currentMapId,
        modal: { title: '走行記録', scoreDisplay: result.formattedTime, themeClass: 'theme-skyway', delayMs: NAME_ENTRY_AFTER_RESULT_MS },
        setBlocked: (blocked) => { driveHUD.isNameEntryOpen = blocked; },
        onClosed: () => driveHUD.armResultModal(),
        onName: async (name) => {
          await saveLeaderboardScore('midnight-skyway', totalTimeMs, name, currentMapId, result.carName, { ghost: trace ?? undefined });
          syncBestTimeDisplay();
        },
      });
    }
  };

  const teardownOnlineRace = () => {
    online?.race?.dispose();
    online = null;
    raceDirector.online = false;
    driveScene.gridOffset = null;
    driveHUD.setOnlineMode(false);
    onlineHUD.hide();
  };

  /** オンライン対戦を終えて待機画面へ戻る(途中で出る場合は参加も取り消す)。 */
  const leaveOnlineRace = () => {
    returnCarToGarage();
    net.send({ t: 'leave' });                                // 終了済みなら何も起きない
    onlineRoom = null;
    lobby.setRoom(null);
    flow.goToOnlineLobby();
  };

  // Safe helper to move player car back to garage turntable
  const returnCarToGarage = () => {
    sfx.stopEngine();
    bgm.duck(1);
    if (driveScene.active) {
      driveScene.stop();
    }
    driveScene.paused = false;
    currentCar.setLights(lightsBeforeRace);
    raceDirector.dispose();
    teardownOnlineRace();
    if (driveScene.carController) {
      driveScene.scene.remove(currentCar.group);
    }
    driveScene.clearPaintEnvironment(currentCar);          // 選択画面(別シーン)ではそちらの環境マップを使う
    // Reset wheel steering angles
    currentCar.wheels.forEach((w, i) => {
      w.rotation.x = 0;
      w.rotation.y = currentCar.wheelBaseYaw[i] ?? w.rotation.y;
    });
    currentCar.group.position.set(0, 0, 0);
    currentCar.group.rotation.set(0, 0, 0);
    garage.turntableGroup.add(currentCar.group);
  };

  // ==========================================
  // 4. Initialize Drive HUD
  // ==========================================
  const driveHUD = new DriveHUD(hudContainer, {
    onReturnToTitle: () => {
      if (online) {
        leaveOnlineRace();
        return;
      }
      returnCarToGarage();
      flow.goToTitle();
    },
    onChangeMap: () => {
      returnCarToGarage();
      flow.goToMapSelect();
    },
    onChangeCar: () => {
      returnCarToGarage();
      flow.goToCarSelect();
    },
    onChangeCamera: (mode) => {
      driveScene.setCameraMode(mode);
    },
    onRetry: () => {
      restartRace(true);
    },
    onPauseChange: (paused) => {
      if (online) return;                                    // オンライン中は他の人が走っているので止まらない
      const changed = driveScene.paused !== paused;
      driveScene.paused = paused;                        // the pause menu really freezes the game
      sfx.setEngineSuspended(paused);
      bgm.duck(paused ? 0.35 : 1);
      if (changed) sfx.pause(paused);
    },
  });

  const raceDirector = new RaceDirector(driveScene, timeAttack, driveHUD);

  // Telemetry & physics callbacks
  driveScene.callbacks.onSpeedUpdate = (speed, rpm, gear, isDrifting) => {
    driveHUD.updateTelemetry(speed, rpm, gear);
    sfx.updateEngine(rpm, speed, !!isDrifting);
  };
  driveScene.callbacks.onPositionUpdate = (pos, rotY, fwdTraffic) => {
    driveHUD.updateCarPosition(pos, rotY, fwdTraffic);
  };
  driveScene.callbacks.onFxUpdate = (speed, boost, slipstream) => driveHUD.setFx(speed, boost, slipstream);
  driveScene.callbacks.onProgressUpdate = (fraction, speedKmH, dt) => {
    timeAttack.update(dt, fraction, speedKmH);
    raceDirector.update(fraction);
    const cc = driveScene.carController;
    if (online?.race && cc) {
      online.race.update(dt, cc, fraction, timeAttack.elapsedTimeMs);
      driveHUD.setRemoteMarkers([...online.race.remotes.values()].filter((r) => r.valid).map((r) => ({ x: r.pos.x, z: r.pos.z, color: r.color })));
    }
  };
  const isPreviewMode = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
  // 撮影用(?preview / ?noHud): HUD とボタンガイドを出さず、車はコースのルートを自動で走る(ハブのサムネイル・プレビュー動画用)
  let previewPilot: AutoPilot | null = null;
  if (isPreviewMode) {
    const hide = document.createElement('style');
    hide.textContent = '#agc-guide { display: none !important; }';
    document.head.append(hide);
  }
  driveScene.callbacks.onBeforeConstrain = (car) => {
    online?.race?.collide(car);
    if ((isPreviewMode || benchAutoDrive) && car) {
      car.canDrive = true;
      if (!previewPilot) {
        const route = currentMapInstance?.getRoutePoints();
        if (route && route.length > 0) previewPilot = new AutoPilot(route, car, 30, 17);
      }
      if (previewPilot) previewPilot.update();
      else car.autopilot = { steer: 0, throttle: true, brake: false };
      if (car.speed < 18) car.speed = 24;
    }
  };

  // ==========================================
  // 5. Initialize Screen Components
  // ==========================================
  const titleScreen = new TitleScreen(titleContainer, {
    onStart: async () => {
      sfx.uiConfirm();
      // マシン選択の前に、必ずモード選択を挟む(オンライン対戦が開かれていなければ、その項目は選べない)
      onlineStatus = await fetchSkywayStatus(1500);
      flow.goToModeSelect();                                  // 開催されていなくても、オンライン対戦の項目は出す(選べない)
    },
  });

  const carSelectScreen = new CarSelectScreen(carSelectContainer, {
    onSelectCar: (carType) => {
      sfx.uiMove();
      garage.turntableGroup.remove(currentCar.group);
      currentCar = carModels[carType];
      garage.turntableGroup.add(currentCar.group);
      carSelectScreen.updateSpecs(currentCar.specs);
    },
    onColorChange: (bodyColor, roofColor) => {
      sfx.uiMove();
      currentCar.setBodyColor(bodyColor);
      if (roofColor !== undefined) {
        currentCar.setRoofColor(roofColor);
      }
    },
    onToggleLights: (enabled) => {
      sfx.uiMove();
      currentCar.setLights(enabled);
    },
    onToggleTurntable: (enabled) => {
      sfx.uiMove();
      garage.isRotating = enabled;
    },
    onCameraViewChange: (view) => {
      sfx.uiMove();
      garage.setCameraView(view);
    },
    onNext: () => {
      sfx.uiConfirm();
      reportDeepAnalytics('progression_update', { vehicle: currentCar.specs.name });
      if (flow.currentScreen === 'ONLINE_LOBBY') flow.goToOnlineCourse();    // オンライン: コースの希望まで進める
      else flow.goToMapSelect();
    },
    onPick: (type, preset) => {                              // オンライン待機中の選択は、希望としてサーバーへ送る
      if (flow.currentScreen !== 'ONLINE_LOBBY') return;
      onlinePicked = { type, body: preset.bodyColor, roof: preset.roofColor };
      net.send({ t: 'pref', car: onlinePicked });
    },
    onBack: () => {
      if (flow.currentScreen === 'ONLINE_LOBBY') {
        leaveOnlineLobby();
        return;
      }
      sfx.uiBack();
      flow.goToModeSelect();                                 // モード選択を経由してきたので、そこへ戻る
    },
  });

  carSelectScreen.updateSpecs(currentCar.specs);

  let loadingGhosts = false;   // コース選択の決定を押してから、ゴーストの候補が届くまで
  const mapSelectScreen = new MapSelectScreen(mapSelectContainer, {
    onSelectMap: (mapId) => {
      if (flow.currentScreen === 'ONLINE_COURSE') {          // オンライン: 選んだコースは希望として送る
        net.send({ t: 'pref', course: mapId });
        sfx.uiMove();
        return;
      }
      if (mapFactories[mapId]) {
        if (mapId !== currentMapId) sfx.uiMove();
        currentMapId = mapId;
      }
    },
    onStartRace: () => {
      sfx.uiConfirm();
      if (loadingGhosts) return;
      loadingGhosts = true;
      void loadGhostChoices().finally(() => {
        loadingGhosts = false;
        if (flow.currentScreen !== 'MAP_SELECT') return;
        flow.startRace();
      });
    },
    onStartOnline: () => {                                   // コース希望まで終わったら、待機画面へ
      sfx.uiConfirm();
      flow.goToOnlineWait();
    },
    onClearPick: () => {                                     // コース希望の取り消し(選択済みのカードを押し直す/Backspace)
      net.send({ t: 'pref', course: null });
      sfx.uiMove();
    },
    onBack: () => {
      sfx.uiBack();
      if (flow.currentScreen === 'ONLINE_COURSE') flow.goToOnlineLobby();   // マシン選択へ(待機は続く)
      else flow.goToCarSelect();
    },
  });

  const stageLoadingScreen = new StageLoadingScreen(stageLoadingContainer);
  stageLoadingScreen.onLevel = (v) => {
    garage.setLoadLevel(v);                                       // メーターが上がるほど、背景の街が速く流れて揺れる
    // 同じく、エンジン音もメーターに合わせて、回転が上がり、大きくなる(アイドリング → ほぼ全開)
    if (stageLoadingScreen.isOpen()) {
      sfx.updateEngine(850 + v * v * 5000, v * 60, false);
      sfx.setWind(v * 0.5, 0);
    }
  };
  stageLoadingScreen.onHide = () => sfx.stopEngine();

  const modeSelectScreen = new ModeSelectScreen(modeSelectContainer, {
    onSelect: (mode) => {
      sfx.uiConfirm();
      if (mode === 'online') flow.goToOnlineLobby();
      else flow.goToCarSelect();
    },
    onBack: () => {
      sfx.uiBack();
      flow.goToTitle();
    },
  });

  /** 待機画面から退出してモード選択へ戻る(接続も切る: 開いたままにして負荷をかけない)。 */
  const leaveOnlineLobby = () => {
    sfx.uiBack();
    net.send({ t: 'leave' });
    onlineRoom = null;
    lobby.setRoom(null);
    net.close();
    flow.goToModeSelect();
  };

  /** 接続エラー時などにオンラインから退出してタイトルへ戻る。 */
  const leaveOnlineToTitle = (msg?: string) => {
    sfx.uiBack();
    returnCarToGarage();
    net.send({ t: 'leave' });
    onlineRoom = null;
    lobby.setRoom(null);
    lobby.hide();
    onlineHUD.hide();
    net.close();
    flow.goToTitle();
    if (msg) onlineHUD.toast(msg);
  };

  /** 選ぼうとした色が他の人に取られた: サーバーが持っている自分のマシンに戻す(未確定なら次の空き色へ)。 */
  const resyncColor = () => {
    const room = lobby.room;
    const mine = room?.players.find((p) => p.id === room.you)?.car;
    if (mine) carSelectScreen.setCar(mine.type as CarType, mine.body);
    else carSelectScreen.cycleColor();
  };

  /** 部屋の状況(希望の集計・自分の希望・主催者の固定)をコース希望の画面に反映する。 */
  const syncCourseUI = () => {
    const r = lobby.room;
    if (!r) return;
    const fixed = r.mapMode !== 'random' ? r.mapMode : null;
    mapSelectScreen.setOnlineState(r.votes, lobby.myCourse, fixed);
  };

  const lobby = new LobbyScreen(lobbyContainer, net, {
    onBack: leaveOnlineLobby,
    onColorTaken: resyncColor,
    onBackToCourse: () => flow.goToOnlineCourse(),
    onProblem: () => {
      // 接続エラー時はリトライを尋ねず即座にタイトルへ戻る
      leaveOnlineToTitle();
    },
    onErrorToTitle: (msg) => leaveOnlineToTitle(msg),
  });

  net.on('room', (m) => {
    const joinedNow = onlineRoom === null;
    onlineRoom = m;
    lobby.setRoom(m);
    carSelectScreen.setTakenColors(lobby.othersBodies());
    syncCourseUI();
    // 参加した直後: 前に選んだマシンがあれば、希望として送り直す
    if (joinedNow && flow.currentScreen === 'ONLINE_LOBBY' && onlinePicked) net.send({ t: 'pref', car: onlinePicked });
    // ロード中またはレース中に誰かが抜けた(ロード中に抜けた人の車が、出走時に残らないよう、参加者の一覧も追従させる)
    if (online) {
      online.players = online.players.filter((p) => m.players.some((mp) => mp.id === p.id));
      if (online.race) for (const id of [...online.race.remotes.keys()]) if (!m.players.some((p) => p.id === id)) online.race.removePlayer(id);
    }
  });

  net.on('left', () => {                                     // レースが終わってルームが空に戻った
    onlineRoom = null;
    lobby.setRoom(null);
    // 結果が届かないまま空に戻った(ロード中の打ち切りなど): 走れない画面が取り残されないよう、タイトルへ戻す
    if (online && !online.finished && !online.race) leaveOnlineToTitle('対戦が終了しました');
  });

  net.on('start', (m) => {
    if (!onlineRoom || !mapFactories[m.map] || (flow.currentScreen !== 'ONLINE_LOBBY' && flow.currentScreen !== 'ONLINE_COURSE' && flow.currentScreen !== 'ONLINE_WAIT')) return;
    currentMapId = m.map;
    online = {
      seed: m.seed,
      slot: Math.max(0, m.grid.indexOf(onlineRoom.you)),
      players: m.players,
      you: onlineRoom.you,
      race: null,
      ready: false,
      goAt: null,
      goTime: null,
      disconnected: false,
      finished: false,
    };
    // 自動で決まったマシンも含め、サーバーが確定させた自分のマシンにする(次に参加する時もこのマシンを希望する)
    const mine = m.players.find((p) => p.id === onlineRoom!.you);
    if (mine) {
      carSelectScreen.setCar(mine.car.type as CarType, mine.car.body);
      onlinePicked = mine.car;
    }
    flow.startRace();
  });

  net.on('go', (m) => {
    if (!online) return;
    online.goAt = m.at;
    tryStartOnlineCountdown();
  });

  net.on('results', (m) => {
    if (!online?.race) return;
    if (!online.finished) {
      if (!m.done) return;                                    // 走行中は、他の人の途中経過を出さない
      // サーバーが打ち切った(最初のゴールから30秒など): まだ走っている車を止めて、「タイムアップ」の結果を出す
      online.finished = true;
      raceDirector.onForcedEnd();
      bgm.duck(0.3);
      sfx.timeUp();
    }
    const colors = new Map<number, number>(online.players.map((p) => [p.id, p.car.body]));
    onlineHUD.showResults(m.entries, online.you, m.done, colors, m.endsInMs);
    if (m.done) {
      const mine = m.entries.findIndex((e) => e.id === online!.you);
      reportDeepAnalytics('online_results', { rank: mine + 1, players: m.entries.length, timeMs: m.entries[mine]?.timeMs ?? null, finished: m.entries.filter((e) => e.timeMs !== null).length });
    }
  });

  net.onClose((code) => {
    if (!online) return;
    const msg = code === 4001 ? '主催者がオンライン対戦を終了しました' : '接続が切れました';
    leaveOnlineToTitle(msg);
  });

  onlineHUD.onLeave = () => {
    leaveOnlineToTitle();
  };

  // Title screen 2-second car rotation cycle
  const titleCarEntries = CAR_TYPES.map((type) => ({ type, model: carModels[type] }));
  let titleCarIndex = Math.max(0, titleCarEntries.findIndex((e) => e.model === currentCar));
  let titleCarTimer: number | null = null;

  const startTitleCarCycle = () => {
    stopTitleCarCycle();
    const idx = titleCarEntries.findIndex((e) => e.model === currentCar);
    if (idx >= 0) titleCarIndex = idx;
    titleCarTimer = window.setInterval(() => {
      if (flow.currentScreen !== 'TITLE') {
        stopTitleCarCycle();
        return;
      }
      titleCarIndex = (titleCarIndex + 1) % titleCarEntries.length;
      garage.turntableGroup.remove(currentCar.group);
      currentCar = titleCarEntries[titleCarIndex].model;
      currentCar.setLights(lightsBeforeRace);
      currentCar.group.position.set(0, 0, 0);
      currentCar.group.rotation.set(0, 0, 0);
      garage.turntableGroup.add(currentCar.group);
    }, 2000);
  };

  const stopTitleCarCycle = () => {
    if (titleCarTimer !== null) {
      clearInterval(titleCarTimer);
      titleCarTimer = null;
    }
  };

  // ==========================================
  // 6. Game Flow Coordinator (State Machine)
  // ==========================================
  const flow = new GameFlowManager({
    onEnterTitle: () => {
      bgm.play('menu', true);                                // タイトルに戻るたびに別の曲
      lobby.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.setCameraView('orbit');
      garage.isRotating = true;
      garage.start();
      guideTitle();
      titleScreen.show();
      startTitleCarCycle();
    },
    onEnterModeSelect: () => {
      stopTitleCarCycle();
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      guideModeSelect();
      modeSelectScreen.show(onlineStatus);
    },
    onEnterCarSelect: () => {
      stopTitleCarCycle();
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      carSelectScreen.setCarType(titleCarEntries[titleCarIndex].type);
      carSelectScreen.updateSpecs(currentCar.specs);
      carSelectScreen.setOnlineMode(false);
      guideCarSelect();
      carSelectScreen.show();
    },
    onEnterMapSelect: () => {
      stopTitleCarCycle();
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      const records = Object.fromEntries(STAGES.map((st) => [st.id, timeAttack.getBestRecord(st.id)]));
      mapSelectScreen.setOnlineMode(false);
      mapSelectScreen.setSelectedMap(currentMapId);
      guideMapSelect();
      mapSelectScreen.show(records);
    },
    onEnterOnlineLobby: () => {
      stopTitleCarCycle();
      bgm.play('menu');
      titleScreen.hide();
      modeSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      carSelectScreen.setCarType(titleCarEntries[titleCarIndex].type);
      carSelectScreen.updateSpecs(currentCar.specs);
      carSelectScreen.setOnlineMode(true);                   // マシン選択をそのまま使い、右にマッチングのパネルを出す
      carSelectScreen.setTakenColors(lobby.othersBodies());
      guideLobby();
      carSelectScreen.show();
      lobby.setWaitingVisible(false);                        // 表示は待機画面のときだけ(先に切り替える: show() が参加できない案内で待機画面へ移すことがある)
      lobby.show();                                          // 接続・参加は続く
    },
    onEnterOnlineCourse: () => {
      stopTitleCarCycle();
      bgm.play('menu');
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      mapSelectScreen.setOnlineMode(true);                   // コース選択の画面をそのまま使い、選んだコースを希望として送る
      syncCourseUI();
      guideOnlineCourse();
      mapSelectScreen.show();
      lobby.setWaitingVisible(false);
      lobby.show();
    },
    onEnterOnlineWait: () => {
      stopTitleCarCycle();
      bgm.play('menu');
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      guideOnlineWait();
      lobby.show();
      lobby.setWaitingVisible(true);                         // 参加者と「あと◯秒 / 待機中」を出す
    },
    onStartRace: async () => {
      stopTitleCarCycle();
      if (online) bgm.stop();                 // 対戦は、全員の出走に合わせて、同じ曲を同じ位置から流す(tryStartOnlineCountdown)
      else bgm.play('race', true);
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      driveHUD.hide();

      // Instantiate map (reuse the pre-built boot instance on the first solo race if still on the default map)
      const reuseBootMap = bootMapUnused && !online && currentMapId === bootMapId;
      bootMapUnused = false;
      if (!reuseBootMap) {
        if (online) setTrafficRng(mulberry32(online.seed));    // 全員同じ交通NPC
        try {
          currentMapInstance = mapFactories[currentMapId]();
        } finally {
          setTrafficRng(null);
        }
      }
      if (online) {
        const traffic = currentMapInstance.traffic;
        if (traffic) traffic.sharedClock = () => -1;         // go が来るまで動かさない
        raceDirector.online = true;
        driveHUD.setOnlineMode(true);
        driveScene.gridOffset = { lateral: (online.slot % 2 === 0 ? -1 : 1) * 1.8, back: Math.floor(online.slot / 2) * 6 };
      } else {
        raceDirector.online = false;
        driveHUD.setOnlineMode(false);
        driveScene.gridOffset = null;
      }

      // 選んだゴーストの本体は、読み込みと並行して取得する(オンライン対戦では使わない)
      const pick = online ? null : ghostPick;
      const ghostFetch = pick ? fetchGhost<GhostTrace>('midnight-skyway', currentMapId, pick.id) : null;

      // Show stage loading screen with course attribution
      const stage = STAGES.find((st) => st.id === currentMapId);
      const courseName = stage?.title ?? currentMapInstance.metadata.name;
      stageLoadingScreen.show(courseName, currentMapInstance.metadata.attribution);
      sfx.startEngine();                               // ロード中のエンジン音(メーターに合わせて大きくなる。onLevel で更新)
      raceLoading = true;
      fadeGuide(document.getElementById('agc-guide'), 0, 350);       // ロード中はボタンガイドを消す(フェードアウト)

      // ロード中も、背景のガレージ(街の中を走る車)はそのまま動かす。車は台座に置いたまま、コースだけ先に読み込む
      lightsBeforeRace = currentCar.lightsEnabled;
      if (!reuseBootMap) {
        driveScene.loadMap(currentMapInstance, false); // 車はまだ台座にあるので、スタート地点には置かない
      }
      driveHUD.setMap(currentMapInstance);

      // Stream initial chunks and update loading progress
      const streamable = currentMapInstance as MapBase & { onProgress?: ((l: number, t: number) => void) | null };
      streamable.onProgress = (loaded, total) => {
        stageLoadingScreen.updateProgress(loaded, total);
      };

      try {
        if (currentMapInstance.loadOpenData) {
          // (読み込みが終わる時刻は端末・ネットワーク次第なので、操作のリプレイでは記録と同じ所で終わったことにする)
          await replayBarrier('stage-load', Promise.race([
            currentMapInstance.loadOpenData(),
            new Promise((resolve) => setTimeout(resolve, 15000)),
          ]));
        }
      } catch (err) {
        console.warn('Map open data load error:', err);
      }

      // ロードが終わったら、カードをしまい、車が画面に向かって突っ込む → 暗転 → 明転で走行シーンへ
      await stageLoadingScreen.finish();
      await garage.launch();
      await stageLoadingScreen.blackout();             // 車が画面を覆うところで暗転し、真っ暗の間に走行シーンへ入れ替える
      garage.stop();
      garage.turntableGroup.remove(currentCar.group);
      garage.endLaunch();
      driveScene.setCar(currentCar);
      stageLoadingScreen.hide();

      // 選んだゴースト(取得できなければペースボット)
      raceDirector.selectedGhost = null;
      if (ghostFetch && pick) {
        const trace = await ghostFetch;
        if (trace) raceDirector.selectedGhost = { trace, rank: pick.rank };
      }

      // Stage is 100% ready! Now start scene and countdown!
      driveHUD.setAccent(boostThemeFor(currentCar).hud);   // HUD の主色は、選んだ車の色
      driveHUD.show();
      if (isPreviewMode) { hudContainer.style.display = 'none'; previewPilot = null; }
      const raceGuide = guideRace(true);                 // 明転に合わせてフェードインさせる(それまでは見えない)
      restartRace();
      await driveScene.warmupAsync();                  // 暗転中に、マップ固有のシェーダーを事前コンパイル(街のチャンクは除く)。並列にコンパイルし終えてから描く
      driveScene.start();
      if (driveScene.carController) driveScene.carController.padBlocked = () => driveHUD.isMenuOpen();
      stageLoadingScreen.reveal();                     // 明転(走行シーンの最初の描画のあとに明るくなる)
      requestAnimationFrame(() => requestAnimationFrame(() => { fadeGuide(raceGuide, 1, 650); raceLoading = false; if (benchAutoDrive) benchReady('race-start'); }));   // ガイドも同じタイミングでフェードイン
      if (online) {
        online.race = new OnlineRace(net, driveScene, online.players, online.you, {
          onStandings: (rows) => onlineHUD.setStandings(rows),
          onToast: (t) => onlineHUD.toast(t),
        });
        online.ready = true;
        onlineHUD.show();
        onlineHUD.showWaiting('他のプレイヤーを待っています…');
        net.send({ t: 'loaded' });
        tryStartOnlineCountdown();
      }
    },
    onRetryRace: () => {
      restartRace();
    },
    onTogglePause: () => {
      driveHUD.togglePause();
    },
  });

  // Race-time arcade pad buttons (X: camera / START: pause). Lever + A (drive, handbrake) are read by CarController;
  // the pause/result menus are driven by DriveHUD. Polled every frame so presses made on other screens never carry over.
  const racePad = new PadEdge();
  let menuWasOpen = false;
  startPadLoop(racePad, (p) => {
    const menuOpen = driveHUD.isMenuOpen();
    // The frame a menu closes, its confirming press must not also act as a race button
    const ignore = menuOpen || menuWasOpen;
    menuWasOpen = menuOpen;
    if (flow.currentScreen === 'RACE') {
      const want = driveHUD.isResultModalOpen() ? 'result' : menuOpen ? 'pause' : 'race';
      if (!raceLoading && want !== raceGuideState) { if (want === 'race') guideRace(); else guideRaceMenu(want); }
    }
    if (ignore || flow.currentScreen !== 'RACE' || !driveScene.active) {
      driveScene.setFrontViewPad(false);
      return;
    }
    // Y: 押している間だけ車の前からの視点
    driveScene.setFrontViewPad(!!readPad().buttons[3]);
    if (p.any(9)) driveHUD.togglePause(true);
  });

  // Dev hooks
  if (import.meta.env.DEV) {
    (window as unknown as { __game: unknown }).__game = {
      driveScene,
      garage,
      flow,
      timeAttack,
    };
  }

  // Initial State: Enter Title Screen or directly start race if preview
  if (isPreviewMode) {
    if (stageLoadingContainer) stageLoadingContainer.style.display = 'none';
    if (hudContainer) hudContainer.style.display = 'none';
    flow.startRace();
  } else if (benchScene === 'race') {
    flow.startRace();
  } else if (benchScene === 'garage') {
    flow.goToCarSelect();
    benchReady('garage');
  } else {
    flow.goToTitle();
    if (benchScene === 'title') benchReady('title');
  }
});
