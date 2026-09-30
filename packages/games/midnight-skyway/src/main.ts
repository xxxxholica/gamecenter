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
import { PadEdge, startPadLoop } from './input/arcadePad';

// アケコン/ゲームパッドのSELECT長押しでホーム(ハブ)へ戻る
installHomeReturn();

// 画面ごとのアケコンガイド(左下。呼ぶたびに前の画面のカードと入れ替わる)
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true });
const guideCarSelect = () => mountArcadeGuide({
  moveLabel: 'マシン選択',
  buttons: [
    { indices: [2, 3, 4, 5], label: 'カラー変更' },
    { indices: [0, 9], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideMapSelect = () => mountArcadeGuide({
  moveLabel: 'コース選択',
  buttons: [
    { indices: [0, 9], label: '決定' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideTimeSelect = () => mountArcadeGuide({
  moveLabel: '日中 / 夜間',
  buttons: [
    { indices: [0, 9], label: 'レース開始' },
    { indices: [1], label: '戻る' },
  ],
  showHomeHint: true,
});
const guideRace = () => mountArcadeGuide({
  moveLabel: '↑走る ↓減速(旋回中ブレーキでドリフト) ←→ハンドル',
  buttons: [
    { indices: [0], label: 'ハンドブレーキ(ドリフト)' },
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
  const hudContainer = document.getElementById('drive-hud-container');

  if (!container || !titleContainer || !carSelectContainer || !mapSelectContainer || !timeSelectContainer || !stageLoadingContainer || !hudContainer) {
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

  const restartRace = () => {
    driveHUD.hideResultModal();
    driveHUD.hidePauseModal();
    driveScene.respawnCar();
    if (driveScene.carController) {
      driveScene.carController.canDrive = false;
    }
    timeAttack.initCourse(currentMapId, currentCar.specs.name);
    raceDirector.prepare(currentMapInstance, currentMapId, currentCar);
    syncBestTimeDisplay();
    timeAttack.startCountdown();
  };

  timeAttack.callbacks.onCountdown = (step) => {
    driveHUD.showCountdown(step);
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
  };

  timeAttack.callbacks.onGate = (_i, bonusMs) => raceDirector.onGate(bonusMs);
  timeAttack.callbacks.onRemaining = (ms) => raceDirector.onRemaining(ms);

  timeAttack.callbacks.onGoal = (result) => {
    raceDirector.onGoal(result);
    driveHUD.showResultModal(result);
    syncBestTimeDisplay();
  };

  // Safe helper to move player car back to garage turntable
  const returnCarToGarage = () => {
    if (driveScene.active) {
      driveScene.stop();
    }
    driveScene.paused = false;
    currentCar.setLights(lightsBeforeRace);
    raceDirector.dispose();
    if (driveScene.carController) {
      driveScene.scene.remove(currentCar.group);
    }
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
      restartRace();
    },
    onPauseChange: (paused) => {
      driveScene.paused = paused;                        // the pause menu really freezes the game
    },
  });

  const raceDirector = new RaceDirector(driveScene, timeAttack, driveHUD);

  // Telemetry & physics callbacks
  driveScene.callbacks.onSpeedUpdate = (speed, rpm, gear, isDrifting) => {
    driveHUD.updateTelemetry(speed, rpm, gear, isDrifting);
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
  };

  // ==========================================
  // 5. Initialize Screen Components
  // ==========================================
  const titleScreen = new TitleScreen(titleContainer, {
    onStart: () => {
      flow.goToCarSelect();
    },
  });

  const carSelectScreen = new CarSelectScreen(carSelectContainer, {
    onSelectCar: (carType) => {
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
      currentCar.setBodyColor(bodyColor);
      if (roofColor !== undefined) {
        currentCar.setRoofColor(roofColor);
      }
    },
    onToggleLights: (enabled) => {
      currentCar.setLights(enabled);
    },
    onToggleTurntable: (enabled) => {
      garage.isRotating = enabled;
    },
    onCameraViewChange: (view) => {
      garage.setCameraView(view);
    },
    onNext: () => {
      flow.goToMapSelect();
    },
    onBack: () => {
      flow.goToTitle();
    },
  });

  carSelectScreen.updateSpecs(currentCar.specs);

  const mapSelectScreen = new MapSelectScreen(mapSelectContainer, {
    onSelectMap: (mapId) => {
      if (mapFactories[mapId]) {
        currentMapId = mapId;
      }
    },
    onStartRace: () => {
      flow.goToTimeSelect();
    },
    onBack: () => {
      flow.goToCarSelect();
    },
  });

  const timeSelectScreen = new TimeSelectScreen(timeSelectContainer, {
    onSelect: (t) => {
      currentTimeOfDay = t;
      saveTimeOfDay(t);
    },
    onStartRace: () => {
      flow.startRace();
    },
    onBack: () => {
      flow.goToMapSelect();
    },
  });

  const stageLoadingScreen = new StageLoadingScreen(stageLoadingContainer);

  // ==========================================
  // 6. Game Flow Coordinator (State Machine)
  // ==========================================
  const flow = new GameFlowManager({
    onEnterTitle: () => {
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
    onEnterCarSelect: () => {
      titleScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      carSelectScreen.updateSpecs(currentCar.specs);
      guideCarSelect();
      carSelectScreen.show();
    },
    onEnterMapSelect: () => {
      titleScreen.hide();
      carSelectScreen.hide();
      timeSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      const records = Object.fromEntries(STAGES.map((st) => [st.id, timeAttack.getBestRecord(st.id)]));
      mapSelectScreen.setSelectedMap(currentMapId);
      guideMapSelect();
      mapSelectScreen.show(records);
    },
    onEnterTimeSelect: () => {
      titleScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      stageLoadingScreen.hide();
      driveHUD.hide();
      garage.start();
      guideTimeSelect();
      timeSelectScreen.show(currentTimeOfDay);
    },
    onStartRace: async () => {
      titleScreen.hide();
      carSelectScreen.hide();
      mapSelectScreen.hide();
      timeSelectScreen.hide();
      driveHUD.hide();

      // Instantiate map
      currentMapInstance = mapFactories[currentMapId]();

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
