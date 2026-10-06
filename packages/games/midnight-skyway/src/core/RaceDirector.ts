import { audio } from '../audio';
import * as THREE from 'three';
import type { MapBase } from '../maps/MapBase';
import type { CarBase } from '../models/CarBase';
import type { DriveScene } from './DriveScene';
import type { DriveHUD } from '../ui/DriveHUD';
import type { TimeAttackManager, TimeAttackResult } from './TimeAttackManager';
import { AutoPilot } from './AutoPilot';
import { GhostCar, GhostPlayer, GhostRecorder, buildPaceBot, loadGhost, saveGhost, SECTOR_FRACTIONS } from './Ghost';

/**
 * Race rules of competitive courses, on top of the plain time attack:
 *  - the rank-1 rival: the best recorded run replays as a see-through ghost car; before any run exists a pace bot drives the line
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
  /** オンライン対戦中: ゴースト/ペースボット/制限時間/ゴースト保存を使わない(相手は本物のプレイヤー)。 */
  public online = false;
  private map: MapBase | null = null;
  private winningRun: AutoPilot | null = null;
  private mapId = '';
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
    this.active = map.competitive;
    this.map = map;
    map.setGoalVisible(false);                                  // not there at the start
    this.mapId = mapId;
    this.carName = car.specs.name;
    this.hud.setRaceMode(this.active, map.showAltitude);
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
    const saved = loadGhost(mapId);
    const bot = route ? buildPaceBot(route, map.getCarLift(), map.getGradeEffect()) : null;
    const trace = saved ?? bot;
    if (trace) {
      this.rival = new GhostPlayer(trace);
      this.rivalLabel = trace.kind === 'bot' ? 'PACE BOT' : 'GHOST';
      this.rivalCar = new GhostCar(car.group, trace.kind === 'bot' ? 0xffaa00 : 0x00f0ff);
      this.scene.scene.add(this.rivalCar.group);
      this.rivalCar.group.visible = false;
    }
    this.ta.setReferenceSectors(this.rival?.sectorTimes() ?? null);

    // Time limit derived from the pace bot's lap (not from the player's best, so a fast record never makes it harder)
    if (bot) {
      const seg = bot.timeMs / 6;
      const gates = [1, 2, 3, 4, 5].map((k) => (k / 6) * SECTOR_FRACTIONS[SECTOR_FRACTIONS.length - 1]);
      this.ta.setRules({ initialMs: seg * 1.6, bonusMs: seg * 1.3, gates });
    } else {
      this.ta.setRules(null);
    }
    this.hud.updateRemaining(this.ta.remainingMs > 0 ? this.ta.remainingMs : null);
  }

  /**
   * A course that was redesigned makes its old best time and ghost meaningless: they are dropped when the route's signature
   * (point count, start point, length) no longer matches the one they were recorded on.
   */
  private dropStaleRecords(mapId: string, route: THREE.Vector3[]): void {
    let len = 0;
    for (let i = 1; i < route.length; i++) len += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z);
    const sig = `${route.length}:${route[0].x.toFixed(0)}:${route[0].z.toFixed(0)}:${Math.round(len)}`;
    try {
      const key = `course_sig_${mapId}`;
      const old = localStorage.getItem(key);
      if (old !== sig) {   // also covers records made before signatures existed
        localStorage.removeItem(`time_attack_${mapId}`);
        localStorage.removeItem(`ghost_${mapId}`);
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
      if (this.map?.showAltitude) this.hud.updateAltitude(cc.position.y - this.map.startPosition.y);
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

  /** Race over: a new record's run becomes the rank-1 ghost; a time-up stops the car. */
  public onGoal(result: TimeAttackResult): void {
    // winning run: the car takes over and drives on by itself, so the result can be read next to it
    const route = this.map?.getRoutePoints();
    const cc = this.scene.carController;
    if (!result.timedOut && route && cc) this.winningRun = new AutoPilot(route, cc);
    if (!this.active) return;
    if (result.timedOut && this.scene.carController) this.scene.carController.canDrive = false;
    if (result.isNewRecord && !result.timedOut && !this.online) saveGhost(this.mapId, this.recorder.finish(result.totalTimeMs, this.carName));
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
