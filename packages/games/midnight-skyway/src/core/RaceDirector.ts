import { audio } from '../audio';
import * as THREE from 'three';
import type { MapBase } from '../maps/MapBase';
import type { CarBase } from '../models/CarBase';
import type { DriveScene } from './DriveScene';
import type { DriveHUD } from '../ui/DriveHUD';
import type { TimeAttackManager, TimeAttackResult } from './TimeAttackManager';
import { AutoPilot } from './AutoPilot';
import { GhostCar, GhostPlayer, GhostRecorder, buildPaceBot, type GhostTrace } from './Ghost';

/** コース(ルート)の署名。点数・開始点・長さが変わったら別のコースとみなす(端末に保存した自己ベストの無効化に使う) */
function routeSignature(route: THREE.Vector3[]): string {
  let len = 0;
  for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
  return `${route.length}:${route[0].x.toFixed(0)}:${route[0].z.toFixed(0)}:${Math.round(len)}`;
}

/**
 * Race rules of competitive courses, on top of the plain time attack:
 *  - the rival: a ranking run chosen before the start (ghost, fetched from the server) replays as a see-through car; with none a pace bot drives the line
 *  - live gap to the rival and sector deltas measured against it
 *  - time-limit checkpoints (start with little time, each gate adds some)
 *  - drift points and the boost they pay out
 * Courses that are not `competitive` are left exactly as they were.
 */
export class RaceDirector {
  private readonly recorder = new GhostRecorder();
  private rival: GhostPlayer | null = null;
  private rivalCar: GhostCar | null = null;
  private rivalLabel = 'GHOST';
  private active = false;
  /** スタート前に選んだ、ランキング上位のゴースト(サーバーから取得済み)。null ならペースボットが走る。 */
  public selectedGhost: { trace: GhostTrace; rank: number } | null = null;
  /** 直前のレースの走行の軌跡(完走したときだけ)。ランキングに登録するときにサーバーへ送る。 */
  public lastTrace: GhostTrace | null = null;
  /** オンライン対戦中: ゴースト/ペースボット/制限時間/ゴースト保存を使わない(相手は本物のプレイヤー)。 */
  public online = false;
  private map: MapBase | null = null;
  private winningRun: AutoPilot | null = null;
  private carName = '';
  private readonly tmp = { pos: new THREE.Vector3(), rotY: 0 };
  private readonly playerPos = new THREE.Vector3();

  constructor(private readonly scene: DriveScene, private readonly ta: TimeAttackManager, private readonly hud: DriveHUD) {}

  /** Call before every (re)start of a race. */
  public prepare(map: MapBase, mapId: string, car: CarBase): void {
    this.disposeRival();
    this.winningRun?.stop();
    this.winningRun = null;
    this.recorder.reset();
    this.lastTrace = null;
    this.active = map.competitive;
    this.map = map;
    map.setGoalVisible(false);                                  // not there at the start
    this.carName = car.specs.name;
    this.hud.setRaceMode(this.active);
    const cc = this.scene.carController;
    if (cc) {
      cc.driftBoostEnabled = this.active;
      cc.onDriftBanked = this.active ? () => {
        audio.sfx.driftBanked();
      } : null;
    }
    this.ta.driftScoreProvider = this.active ? () => cc?.driftScore ?? 0 : null;
    if (!this.active) {
      this.ta.setRules(null);
      this.ta.setReferenceSectors(null);
      return;
    }

    if (this.online) {
      this.ta.setRules(null);
      this.ta.setReferenceSectors(null);
      this.hud.updateRemaining(null);
      return;
    }

    const route = map.getRoutePoints();
    if (route) this.dropStaleRecords(mapId, route);
    const bot = route ? buildPaceBot(route, map.getCarLift(), map.getGradeEffect()) : null;
    const selected = this.selectedGhost;
    const trace = selected?.trace ?? bot;
    if (trace) {
      this.rival = new GhostPlayer(trace);
      this.rivalLabel = trace.kind === 'bot' || !selected ? 'PACE BOT' : `GHOST ${selected.rank}位`;
      this.rivalCar = new GhostCar(car.group, trace.kind === 'bot' ? 0xffaa00 : 0x00f0ff);
      this.scene.scene.add(this.rivalCar.group);
      this.rivalCar.group.visible = false;
    }
    this.ta.setReferenceSectors(this.rival?.sectorTimes() ?? null);

    // Pure lap time attack with 5-minute background safety timeout (no checkpoint penalty)
    this.ta.setRules(null);
    this.hud.updateRemaining(null);
  }

  /**
   * A course that was redesigned makes its old best time meaningless: it is dropped when the route's signature
   * no longer matches the one it was recorded on. (The ranking and ghosts live on the server, which drops them by the
   * course's `revision` in arcadeLeaderboardCore.)
   */
  private dropStaleRecords(mapId: string, route: THREE.Vector3[]): void {
    const sig = routeSignature(route);
    try {
      const key = `course_sig_${mapId}`;
      const old = localStorage.getItem(key);
      if (old !== sig) {   // also covers records made before signatures existed
        localStorage.removeItem(`time_attack_${mapId}`);
        localStorage.removeItem(`ghost_${mapId}`);   // 以前の版が端末に保存していたゴースト(今は使わない)
      }
      localStorage.setItem(key, sig);
    } catch { /* storage unavailable: nothing to protect */ }
  }

  /** Every frame, after TimeAttackManager.update. */
  public update(progress: number): void {
    this.winningRun?.update();
    if (!this.active) return;
    const cc = this.scene.carController;
    if (cc) {
      this.hud.updateDrift(cc.driftScore, cc.driftChain, cc.driftChainTime, cc.boostTimer, cc.boostMax);
    }
    // the goal hologram shows up once the run is well under way (past halfway), and only while racing
    this.map?.setGoalVisible(this.ta.state === 'RACING' && progress > 0.5 && progress < 0.99);
    if (this.ta.state !== 'RACING') {
      if (this.ta.state === 'READY' || this.ta.state === 'COUNTDOWN') {
        if (this.rivalCar && this.rival) { this.rival.sample(0, this.tmp); this.rivalCar.place(this.tmp.pos, this.tmp.rotY); this.rivalCar.group.visible = true; }
      }
      return;
    }
    const t = this.ta.elapsedTimeMs;
    if (cc) {
      this.playerPos.copy(cc.position);
      this.recorder.update(t, this.playerPos, cc.rotationY, progress > 0.9 && t < 5000 ? 0 : progress);
    }
    if (this.rival && this.rivalCar) {
      const still = this.rival.sample(t, this.tmp);
      this.rivalCar.place(this.tmp.pos, this.tmp.rotY);
      this.rivalCar.group.visible = still;                       // the rival is off the road once it has finished
      const p = progress > 0.9 && t < 5000 ? 0 : progress;
      const at = this.rival.timeAt(p);
      this.hud.updateGhostGap(at === null || p < 0.002 ? null : t - at, this.rivalLabel);
    }
  }

  public onGate(bonusMs: number): void { this.hud.showGateBonus(bonusMs); }

  public onRemaining(ms: number): void { if (this.active) this.hud.updateRemaining(ms); }

  /** Race over: the finished run is kept so it can be sent with the ranking entry (as a ghost); a time-up stops the car. */
  public onGoal(result: TimeAttackResult): void {
    // winning run: the car takes over and drives on by itself, so the result can be read next to it
    const route = this.map?.getRoutePoints();
    const cc = this.scene.carController;
    if (!result.timedOut && route && cc) this.winningRun = new AutoPilot(route, cc);
    if (!this.active) return;
    if (result.timedOut && this.scene.carController) this.scene.carController.canDrive = false;
    if (!result.timedOut && !this.online) this.lastTrace = this.recorder.finish(result.totalTimeMs, this.carName);
  }

  /** オンライン: サーバーが対戦を打ち切った(最初のゴールから30秒・最大レース時間)。未完走の車の走行を止める。 */
  public onForcedEnd(): void {
    this.ta.abort();
    if (this.scene.carController) this.scene.carController.canDrive = false;
  }

  public dispose(): void {
    this.winningRun?.stop();
    this.winningRun = null;
    this.disposeRival();
    this.active = false;
  }

  private disposeRival(): void {
    this.rivalCar?.dispose();
    this.rivalCar = null;
    this.rival = null;
  }
}
