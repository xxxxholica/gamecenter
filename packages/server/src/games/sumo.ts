// sumo-smash-3d(2〜4人の乱戦)の対戦ルール。物理・当たり判定・ラウンド進行は、サーバーが shared/sumoSim で持つ(サーバー権威)。
// クライアントは操作(input)だけを送り、サーバーは約60Hzでシミュレーションを進めて、約20Hzで全力士の状態と演出(snap)を全員へ送る。
// 土俵から押し出されたら脱落、最後に残った人が1点、先に2点取った人の勝ち。途中で抜けた人は脱落扱いで、試合は続く(残りが1人になったらその人の勝ち)。
import * as CANNON from 'cannon-es';
import { MAX_MATCH_MS, MAX_PLAYERS, ROUND_TIME_LIMIT_SEC, SNAP_INTERVAL_MS, WINS_TO_MATCH } from '../../../shared/sumoProtocol.ts';
import type { InputTuple } from '../../../shared/sumoProtocol.ts';
import { MATCH_OVER_DELAY_SEC, SUMO_NAMES, SimWorld } from '../../../shared/sumoSim/SimWorld.ts';
import type { FighterInput } from '../../../shared/sumoSim/SimWorld.ts';
import { RemoteInput } from '../../../shared/sumoSim/RemoteInput.ts';
import type { ConfigField, GameModule, Member, Msg, Room } from '../engine.ts';
import { log } from '../log.ts';
import { isNum } from '../../../shared/online/validate.ts';

/** シミュレーションの刻み(秒)。60Hz */
const STEP = 1 / 60;
/** 遅れた分を一度に取り戻す上限(ステップ数)。サーバーが詰まっても、まとめて何秒も進めない */
const MAX_CATCHUP_STEPS = 6;
/** この時間、操作が届かなかったら、押しっぱなしを止める(ms) */
const INPUT_STALE_MS = 1000;

/** 操作の検証。不正なら null。 */
export function cleanInput(v: unknown): InputTuple | null {
  if (!Array.isArray(v) || v.length !== 7) return null;
  const [x, z, mv, sp, st, sr, gp] = v;
  if (!isNum(x, -1, 1) || !isNum(z, -1, 1)) return null;
  for (const f of [mv, sp, st, sr, gp]) if (f !== 0 && f !== 1) return null;
  return [x, z, mv, sp, st, sr, gp] as InputTuple;
}

export class SumoGame implements GameModule<null> {
  readonly id = 'sumo-smash-3d';
  /** 参加者には力士名がランダムに付く(まわしの色・方角は参加順) */
  readonly playerNames: string[] = SUMO_NAMES;
  readonly maxPlayers = MAX_PLAYERS;
  readonly maxPlayMs = MAX_MATCH_MS;
  /** 管理画面の設定項目: なし */
  readonly config: ConfigField[] = [];

  private room!: Room<null>;
  /** 力士の番号(参加順)→ 参加者id */
  private slots: number[] = [];
  private sim: SimWorld | null = null;
  private inputs: RemoteInput[] = [];
  private tick: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;
  private acc = 0;
  private lastSnapAt = 0;
  private snapN = 0;
  private finished = false;

  attach(room: Room<null>): void {
    this.room = room;
  }

  getConfig(): Record<string, string> {
    return {};
  }

  setConfig(): void {}

  resolved(): Record<string, string> {
    return {};
  }

  onJoin(m: Member<null>): void {
    m.data = null;
  }

  /** 参加者が抜けた: 対戦中・ロード中なら脱落扱い(試合は続く)。 */
  onLeave(m: Member<null>): void {
    const slot = this.slots.indexOf(m.peer.id);
    if (slot < 0 || !this.sim) return;
    log(`sumo leave slot=${slot}`);
    this.sim.removeFighter(slot);
  }

  onReset(): void {
    if (this.tick) clearInterval(this.tick);
    this.tick = null;
    this.sim = null;
    this.slots = [];
    this.inputs = [];
    this.finished = false;
  }

  playerInfo(): object {
    return {};
  }

  roomExtra(): object {
    return {};
  }

  onPref(): string | null {
    return null;
  }

  prepareStart(): Msg {
    const members = [...this.room.members];
    this.slots = members.map(([id]) => id);
    this.inputs = members.map(() => new RemoteInput());
    this.sim = new SimWorld(CANNON, { count: members.length, winsToMatch: WINS_TO_MATCH, roundTimeLimitSec: ROUND_TIME_LIMIT_SEC, names: members.map(([, m]) => m.name) });
    this.finished = false;
    this.snapN = 0;
    log(`sumo start players=${members.length}`);
    return { t: 'start', players: members.map(([id, m]) => ({ id, name: m.name })) };
  }

  onGo(): Msg {
    this.sim?.start();
    this.lastTick = performance.now();
    this.acc = 0;
    this.lastSnapAt = 0;
    this.tick = setInterval(() => this.onTick(), 1000 / 60);
    return { t: 'go' };
  }

  onPlayMessage(m: Member<null>, msg: Msg): void {
    if (msg.t !== 'input') return;
    const slot = this.slots.indexOf(m.peer.id);
    const i = cleanInput(msg.i);
    if (slot >= 0 && i) this.inputs[slot].apply(i, Date.now());
  }

  isDone(): boolean {
    return this.finished;
  }

  buildResults(): Msg {
    return { t: 'results', w: this.sim?.winner ?? null, s: [...(this.sim?.wins ?? [])] };
  }

  private onTick(): void {
    const sim = this.sim;
    if (!sim) return;
    const now = performance.now();
    this.acc = Math.min(this.acc + (now - this.lastTick) / 1000, STEP * MAX_CATCHUP_STEPS);
    this.lastTick = now;

    while (this.acc >= STEP) {
      this.acc -= STEP;
      sim.step(STEP, this.collectInputs(sim));
    }

    const wall = Date.now();
    // 刻み(約16.7ms)の3つぶんが50msにわずかに届かず、4刻み(約15Hz)になるのを避けるため、半刻みぶん早めに送る
    if (wall - this.lastSnapAt >= SNAP_INTERVAL_MS - STEP * 500) {
      this.lastSnapAt = wall;
      const body = sim.snapshot(true, wall, this.snapN++);
      this.room.broadcast({ t: 'snap', ...body });
    }

    // 試合が決まって、結果表示の間をおいたら、結果を送って場を空に戻す
    if (sim.phase === 'match_over' && sim.phaseTime >= MATCH_OVER_DELAY_SEC && !this.finished) {
      this.finished = true;
      log(`sumo result winner=${sim.winner} wins=${sim.wins.join('-')}`);
      this.room.end();
    }
  }

  /** 力士ごとの操作。立ち合いの前(仕切り中)の操作は持ち越さない。 */
  private collectInputs(sim: SimWorld): (FighterInput | null)[] {
    const nowMs = Date.now();
    const live = sim.phase === 'active' && sim.hitStopRemaining <= 0;
    return this.inputs.map((ri) => {
      if (nowMs - ri.lastAt > INPUT_STALE_MS) ri.reset();
      if (!live) {
        if (sim.phase !== 'active') ri.clearEdges();       // 強い当たりの一瞬の間は、押した瞬間を保っておく
        return null;
      }
      return { move: { x: ri.moveX, z: ri.moveZ, isMoving: ri.isMoving }, actions: ri.take() };
    });
  }
}
