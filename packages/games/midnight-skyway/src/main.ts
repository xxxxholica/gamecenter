import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { GarageScene } from './core/GarageScene';
import { TrailJModel } from './models/TrailJModel';
import { CrossJModel } from './models/CrossJModel';
import { TruckJModel } from './models/TruckJModel';
import { CarBase } from './models/CarBase';

import { DriveScene } from './core/DriveScene';
import { DriveHUD } from './ui/DriveHUD';
import { MapBase } from './maps/MapBase';
import { TokyoMap } from './maps/TokyoMap';
import { HelsinkiTechnicalMap } from './maps/HelsinkiTechnicalMap';
import { TokyoClimbMap } from './maps/TokyoClimbMap';
import { STAGES, stageNumber } from './ui/stages';
import { RaceDirector } from './core/RaceDirector';
import { TimeAttackManager } from './core/TimeAttackManager';

import { GameFlowManager } from './ui/GameFlowManager';
import { TitleScreen } from './ui/TitleScreen';
import { CarSelectScreen } from './ui/CarSelectScreen';
import { MapSelectScreen } from './ui/MapSelectScreen';
import { TimeSelectScreen } from './ui/TimeSelectScreen';
import { TimeOfDay, loadTimeOfDay, saveTimeOfDay } from './core/TimeOfDay';
import { StageLoadingScreen } from './ui/StageLoadingScreen';
import { installHomeReturn } from '../../../shared/homeReturn';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { PadEdge, startPadLoop } from '../../../shared/arcadePad';
import { audio } from './audio';
import { createNet } from './net/skywayNet';
import { OnlineRace } from './net/OnlineRace';
import { mulberry32 } from '../../../shared/online/seededRandom';
import { checkHighScore, saveLeaderboardScore } from '../../../shared/arcadeLeaderboard';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';
import { setTrafficRng } from './core/Traffic';
import { LobbyScreen } from './ui/LobbyScreen';
import { ModeSelectScreen } from './ui/ModeSelectScreen';
import { OnlineHUD } from './ui/OnlineHUD';
import { fetchSkywayStatus } from './net/skywayNet';
import type { CarSpec, PublicStatus, RacerInfo, ServerMsg } from '../../../shared/netProtocol';
import type { CarType } from '../../../shared/carPalette';

const { bgm, sfx } = audio;

// オンライン対戦はイベント用: 主催者が開放している間だけ、コース選択に「オンライン対戦」の項目が出る。
// 開放/閉鎖はゲーム画面からは行わない(管理画面か、サーバー機上の `npm run ctl`)。
// WebSocket に繋ぐのは、その項目を選んで待機画面に入った時だけ。

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();
watchResultAutoReturn(['res-btn-title']);

// 画面ごとのアケコンガイド(左下。呼ぶたびに前の画面のカードと入れ替わる)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true });
const guideModeSelect = () => mountArcadeGuide({
  moveLabel: 'モード選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideCarSelect = () => mountArcadeGuide({
  moveLabel: 'マシン選択',
  buttons: [
    { indices: [2, 3, 4, 5], label: 'カラー変更' },
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideMapSelect = () => mountArcadeGuide({
  moveLabel: 'コース選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideTimeSelect = () => mountArcadeGuide({
  moveLabel: '日中 / 夜間',
  buttons: [
    { indices: [0], label: 'レース開始' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideLobby = () => mountArcadeGuide({
  moveLabel: 'マシン選択',
  buttons: [
    { indices: [2, 3, 4, 5], label: 'カラー変更' },
    { indices: [0], label: 'コース希望へ' },
    { indices: [1], label: '退出' },
  ],
  showHomeHint: true,
});
const guideOnlineCourse = () => mountArcadeGuide({
  moveLabel: 'コース希望',
  buttons: [
    { indices: [0], label: '待機画面へ' },
    { indices: [1], label: 'マシン選択へ' },
  ],
  showHomeHint: true,
});
const guideOnlineWait = () => mountArcadeGuide({
  moveLabel: 'ボタン選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideRace = () => mountArcadeGuide({
  moveLabel: '↑走る ↓減速 ←→ハンドル',
  buttons: [
    { indices: [0], label: 'ハンドブレーキ' },
    { indices: [2], label: 'カメラ切替' },
    { indices: [9], label: 'ポーズ' },
  ],
  showHomeHint: true,
});

window.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('canvas-container');
  const titleContainer = document.getElementById('screen-title');
  const carSelectContainer = document.getElementById('screen-car-select');
  const mapSelectContainer = document.getElementById('screen-map-select');
  const timeSelectContainer = document.getElementById('screen-time-select');
  const stageLoadingContainer = document.getElementById('screen-stage-loading');
  const lobbyContainer = document.getElementById('screen-lobby');
  const modeSelectContainer = document.getElementById('screen-mode-select');
  const appEl = document.getElementById('app');
  const hudContainer = document.getElementById('drive-hud-container');

  if (!container || !titleContainer || !carSelectContainer || !mapSelectContainer || !timeSelectContainer || !stageLoadingContainer || !hudContainer || !lobbyContainer || !modeSelectContainer || !appEl) {
    console.error('Required screen containers not found');
    return;
  }

  // ==========================================
  // 1. Initialize Garage Scene
  // ==========================================
  const garage = new GarageScene(container);

  // Car Models (3 Original K-Cars)
  const trailJ = new TrailJModel();
  const crossJ = new CrossJModel();
  const truckJ = new TruckJModel();

  let currentCar: CarBase = trailJ;
  garage.turntableGroup.add(currentCar.group);

  // ==========================================
  // 2. Initialize Drive Scene & Maps
  // ==========================================
  const driveScene = new DriveScene(garage.renderer);

  // Map registry
  const mapFactories: Record<string, () => MapBase> = {
    tokyo_skyway: () => new TokyoMap(),
    helsinki_technical: () => new HelsinkiTechnicalMap(),
    tokyo_climb: () => new TokyoClimbMap(),
  };

  let currentTimeOfDay: TimeOfDay = loadTimeOfDay();
  let lightsBeforeRace = true;   // the garage's own headlight setting, restored when the car goes back
  let currentMapId = 'tokyo_skyway';
  let currentMapInstance: MapBase = mapFactories[currentMapId]();
  driveScene.loadMap(currentMapInstance);

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
    raceDirector.prepare(currentMapInstance, currentMapId, currentCar);
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
    const traffic = currentMapInstance.traffic;
    if (traffic) traffic.sharedClock = () => (net.serverNow() - goTime) / 1000;
    timeAttack.startCountdownSynced(goTime - net.serverNow());
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
  };

  timeAttack.callbacks.onSectorPassed = (sector) => {
    driveHUD.showSectorBanner(sector);
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
    bgm.duck(0.3);
    if (result.timedOut) sfx.timeUp();
    else sfx.goal();
    syncBestTimeDisplay();

    if (!result.timedOut && result.totalTimeMs > 0) {
      const check = checkHighScore('midnight-skyway', result.totalTimeMs, currentMapId);
      if (check.isRankIn) {
        driveHUD.isNameEntryOpen = true;
        mountNameEntryModal({
          title: '走行記録',
          scoreDisplay: result.formattedTime,
          rankDisplay: `第${check.rank}位`,
          themeClass: 'theme-skyway',
          delayMs: NAME_ENTRY_AFTER_RESULT_MS,
          onComplete: (katakanaName) => {
            driveHUD.isNameEntryOpen = false;
            saveLeaderboardScore('midnight-skyway', result.totalTimeMs, katakanaName, currentMapId, result.carName);
            syncBestTimeDisplay();
          },
        });
      }
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
    driveHUD.updateTelemetry(speed, rpm, gear, isDrifting);
    sfx.updateEngine(rpm, speed, !!isDrifting);
  };
  driveScene.callbacks.onCameraModeChange = (mode) => {
    driveHUD.updateCamBtnState(mode);
  };
  driveScene.callbacks.onPositionUpdate = (pos, rotY, fwdTraffic) => {
    driveHUD.updateCarPosition(pos, rotY, fwdTraffic);
  };
  driveScene.callbacks.onProgressUpdate = (fraction, speedKmH, dt) => {
    timeAttack.update(dt, fraction, speedKmH);
    raceDirector.update(fraction);
    const cc = driveScene.carController;
    if (online?.race && cc) {
      online.race.update(dt, cc, fraction, timeAttack.elapsedTimeMs);
      driveHUD.setRemoteMarkers([...online.race.remotes.values()].filter((r) => r.valid).map((r) => ({ x: r.pos.x, z: r.pos.z, color: r.color })));
    }
  };
  driveScene.callbacks.onBeforeConstrain = (car) => {
    online?.race?.collide(car);
  };

  // ==========================================
  // 5. Initialize Screen Components
  // ==========================================
  const titleScreen = new TitleScreen(titleContainer, {
    onStart: async () => {
      sfx.uiConfirm();
      // オンライン対戦が開かれていれば、マシン選択の前にモード選択を挟む(開かれていなければ従来どおり)
      onlineStatus = await fetchSkywayStatus(1500);
      if (onlineStatus) flow.goToModeSelect();
      else flow.goToCarSelect();
    },
  });

  const carSelectScreen = new CarSelectScreen(carSelectContainer, {
    onSelectCar: (carType) => {
      sfx.uiMove();
      garage.turntableGroup.remove(currentCar.group);
      if (carType === 'trail_j') {
        currentCar = trailJ;
      } else if (carType === 'cross_j') {
        currentCar = crossJ;
      } else if (carType === 'truck_j') {
        currentCar = truckJ;
      }
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
      if (onlineStatus) flow.goToModeSelect();               // モード選択を経由してきた時は、そこへ戻る
      else flow.goToTitle();
    },
  });

  carSelectScreen.updateSpecs(currentCar.specs);

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
      flow.goToTimeSelect();
    },
    onStartOnline: () => {                                   // コース希望まで終わったら、待機画面へ
      sfx.uiConfirm();
      flow.goToOnlineWait();
    },
    onClearPick: () => {                                     // コース希望の取り消し(選択済みのカードを押し直す/Delete)
      net.send({ t: 'pref', course: null });
      sfx.uiMove();
    },
    onBack: () => {
      sfx.uiBack();
      if (flow.currentScreen === 'ONLINE_COURSE') flow.goToOnlineLobby();   // マシン選択へ(待機は続く)
      else flow.goToCarSelect();
    },
  });

  const timeSelectScreen = new TimeSelectScreen(timeSelectContainer, {
    onSelect: (t) => {
      if (t !== currentTimeOfDay) sfx.uiMove();
      currentTimeOfDay = t;
      saveTimeOfDay(t);
    },
    onStartRace: () => {
      sfx.uiConfirm();
      flow.startRace();
    },
    onBack: () => {
      sfx.uiBack();
      flow.goToMapSelect();
    },
  });

  const stageLoadingScreen = new StageLoadingScreen(stageLoadingContainer);

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
  });

  net.on('start', (m) => {
    if (!onlineRoom || !mapFactories[m.map] || (flow.currentScreen !== 'ONLINE_LOBBY' && flow.currentScreen !== 'ONLINE_COURSE' && flow.currentScreen !== 'ONLINE_WAIT')) return;
    currentMapId = m.map;
    currentTimeOfDay = m.tod === 'day' ? 'day' : 'night';    // 保存はしない(ひとりで遊ぶ時の設定を変えない)
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
    if (!online?.race || !online.finished) return;
    const colors = new Map<number, number>(online.players.map((p) => [p.id, p.car.body]));
    onlineHUD.showResults(m.entries, online.you, m.done, colors, m.endsInMs);
  });

  net.onClose((code) => {
    if (!online) return;
    const msg = code === 4001 ? '主催者がオンライン対戦を終了しました' : '接続が切れました';
    leaveOnlineToTitle(msg);
  });

  onlineHUD.onLeave = () => {
    leaveOnlineToTitle();
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
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.setCameraView('orbit');
      garage.isRotating = true;
      garage.start();
      guideTitle();
      titleScreen.show();
    },
    onEnterModeSelect: () => {
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      guideModeSelect();
      modeSelectScreen.show(onlineStatus);
    },
    onEnterCarSelect: () => {
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      carSelectScreen.updateSpecs(currentCar.specs);
      carSelectScreen.setOnlineMode(false);
      guideCarSelect();
      carSelectScreen.show();
    },
    onEnterMapSelect: () => {
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      const records = Object.fromEntries(STAGES.map((st) => [st.id, timeAttack.getBestRecord(st.id)]));
      mapSelectScreen.setOnlineMode(false);
      mapSelectScreen.setSelectedMap(currentMapId);
      guideMapSelect();
      mapSelectScreen.show(records);
    },
    onEnterTimeSelect: () => {
      bgm.play('menu');
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      guideTimeSelect();
      timeSelectScreen.show(currentTimeOfDay);
    },
    onEnterOnlineLobby: () => {
      bgm.play('menu');
      titleScreen.hide();
      modeSelectScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      carSelectScreen.updateSpecs(currentCar.specs);
      carSelectScreen.setOnlineMode(true);                   // マシン選択をそのまま使い、右にマッチングのパネルを出す
      carSelectScreen.setTakenColors(lobby.othersBodies());
      guideLobby();
      carSelectScreen.show();
      lobby.setWaitingVisible(false);                        // 表示は待機画面のときだけ(先に切り替える: show() が参加できない案内で待機画面へ移すことがある)
      lobby.show();                                          // 接続・参加は続く
    },
    onEnterOnlineCourse: () => {
      bgm.play('menu');
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      timeSelectScreen.hide();
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
      bgm.play('menu');
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      guideOnlineWait();
      lobby.show();
      lobby.setWaitingVisible(true);                         // 参加者と「あと◯秒 / 待機中」を出す
    },
    onStartRace: async () => {
      bgm.play('race', true);
      lobby.hide();
      titleScreen.hide();
      modeSelectScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      driveHUD.hide();

      // Instantiate map
      if (online) setTrafficRng(mulberry32(online.seed));    // 全員同じ交通NPC
      try {
        currentMapInstance = mapFactories[currentMapId]();
      } finally {
        setTrafficRng(null);
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

      // Show stage loading screen with course attribution
      const stage = STAGES.find((st) => st.id === currentMapId);
      const stageNum = `STAGE ${stageNumber(currentMapId)}:`;
      const courseName = stage?.title ?? currentMapInstance.metadata.name;
      stageLoadingScreen.show(stageNum, courseName, currentMapInstance.metadata.attribution);

      // Pause garage & move car to drive scene
      garage.stop();
      garage.turntableGroup.remove(currentCar.group);
      driveScene.setCar(currentCar);

      // Setup map in drive scene and HUD
      lightsBeforeRace = currentCar.lightsEnabled;
      driveScene.loadMap(currentMapInstance);
      driveScene.setTimeOfDay(currentTimeOfDay);       // sky, lights, street lamps and the car's headlights
      driveHUD.setMap(currentMapInstance);

      // Stream initial chunks and update loading progress
      const streamable = currentMapInstance as MapBase & { onProgress?: ((l: number, t: number) => void) | null };
      streamable.onProgress = (loaded, total) => {
        stageLoadingScreen.updateProgress(loaded, total);
      };

      try {
        if (currentMapInstance.loadOpenData) {
          await Promise.race([
            currentMapInstance.loadOpenData(),
            new Promise((resolve) => setTimeout(resolve, 15000)),
          ]);
        }
      } catch (err) {
        console.warn('Map open data load error:', err);
      }

      // Finish loading animation
      await stageLoadingScreen.finish();

      // Stage is 100% ready! Now start scene and countdown!
      driveHUD.show();
      guideRace();
      driveScene.start();
      if (driveScene.carController) driveScene.carController.padBlocked = () => driveHUD.isMenuOpen();
      restartRace();
      if (online) {
        online.race = new OnlineRace(net, driveScene, online.players, online.you, currentTimeOfDay === 'night', {
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
    if (ignore || flow.currentScreen !== 'RACE' || !driveScene.active) return;
    if (p.any(2)) driveScene.cycleCameraMode();
    else if (p.any(9)) driveHUD.togglePause(true);
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

  // Initial State: Enter Title Screen
  flow.goToTitle();
});
