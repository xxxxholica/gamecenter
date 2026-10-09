import * as THREE from 'three';
import type { DriveScene } from '../core/DriveScene';
import type { CarController } from '../core/CarController';
import type { SkywayNet } from './skywayNet';
import { RemoteCar } from './RemoteCar';
import { carOverlap } from './carCollision';
import { audio } from '../audio';
import type { CarState, FinishEntry, RacerInfo } from '../../../../shared/netProtocol';
import { STATE_HZ } from '../../../../shared/netProtocol';

export interface StandingRow {
  id: number;
  name: string;
  color: number;
  me: boolean;
  /** ゴール済みならタイム(ms) */
  timeMs: number | null;
}

export interface OnlineRaceHooks {
  onStandings: (rows: StandingRow[]) => void;
  onToast: (text: string) => void;
}

const SEND_INTERVAL = 1 / STATE_HZ;
const STANDINGS_INTERVAL = 0.25;

/**
 * 対戦中の同期を受け持つ: 自車の姿勢を送信し、他車を補間表示し、車同士の当たり判定と順位を計算する。
 * 物理は各クライアントが自車だけ計算する。当たりは自分の画面で見える重なりを自分の車だけ押し戻して解決する
 * (相手側も同じ処理をするので、両方の画面で離れる)。
 */
export class OnlineRace {
  private readonly client: SkywayNet;
  private readonly hooks: OnlineRaceHooks;
  public readonly you: number;
  public readonly remotes = new Map<number, RemoteCar>();
  private readonly myName: string;
  private readonly myColor: number;
  private racing = false;
  private sendTimer = 0;
  private standingsTimer = 0;
  private crashCooldown = 0;
  private finished = new Map<number, number>();
  /** サーバーが決めた順位(先頭が1位の参加者id)。まだ届いていなければ null で、自分の画面の進行率から仮に並べる。 */
  private serverOrder: number[] | null = null;
  private offs: (() => void)[] = [];
  private readonly drive: DriveScene;

  constructor(client: SkywayNet, drive: DriveScene, players: RacerInfo[], you: number, night: boolean, hooks: OnlineRaceHooks) {
    this.client = client;
    this.hooks = hooks;
    this.you = you;
    const me = players.find((p) => p.id === you);
    this.myName = me?.name ?? 'YOU';
    this.myColor = me?.car.body ?? 0x00f0ff;
    for (const p of players) {
      if (p.id === you) continue;
      const rc = new RemoteCar(p.id, p.name, p.car, night);
      this.remotes.set(p.id, rc);
      drive.scene.add(rc.car.group);
    }
    const combat = drive.combatSystem;
    combat.remoteSource = () => this.remotes.values();
    combat.onlineYou = you;
    combat.onLocalFire = (e) => {
      if (!this.racing) return;
      const r2 = (v: number) => Math.round(v * 100) / 100;
      client.send({ t: 'fire', k: e.k, o: [r2(e.origin.x), r2(e.origin.y), r2(e.origin.z)], f: [r2(e.forward.x), r2(e.forward.z)], tg: e.targetRemoteId });
    };
    combat.onPlayerKilled = () => { if (this.racing) client.send({ t: 'died' }); };
    this.drive = drive;
    this.offs.push(
      client.on('fire', (m) => {
        if (!this.racing || !this.remotes.has(m.from)) return;
        const f = new THREE.Vector3(m.f[0], 0, m.f[1]);
        if (f.lengthSq() < 1e-6) return;
        combat.spawnRemoteFire(m.from, { k: m.k, origin: new THREE.Vector3(m.o[0], m.o[1], m.o[2]), forward: f.normalize(), targetRemoteId: m.tg });
      }),
      client.on('died', (m) => { if (this.racing) combat.onRemoteDied(m.from); }),
      client.on('states', (m) => {
        const now = performance.now();
        const serverNow = this.client.serverNow();
        for (const [id, s] of Object.entries(m.s)) {
          const ts = m.ts?.[Number(id)];
          // 送信時刻(サーバー時刻)を、この端末の performance.now の時計に直す
          this.remotes.get(Number(id))?.push(s as CarState, now, ts === undefined ? undefined : now - (serverNow - ts));
        }
      }),
      client.on('results', (m) => this.applyResults(m.entries)),
      client.on('standings', (m) => { this.serverOrder = m.order; }),
    );
  }

  /** go を受けた: 状態の送信を始める。 */
  public begin(): void {
    this.racing = true;
    this.sendTimer = 0;
  }

  public removePlayer(id: number): void {
    const rc = this.remotes.get(id);
    if (!rc) return;
    this.hooks.onToast(`${rc.name} が退出しました`);
    rc.dispose();
    this.remotes.delete(id);
  }

  private applyResults(entries: FinishEntry[]): void {
    for (const e of entries) {
      if (e.timeMs === null || this.finished.has(e.id)) continue;
      this.finished.set(e.id, e.timeMs);
      if (e.id !== this.you) this.hooks.onToast(`${e.name} がゴール`);
    }
  }

  /** 毎フレーム(自車の物理の後)。progress は 0..1、elapsedMs はレース時計。 */
  public update(dt: number, cc: CarController, progress: number, elapsedMs: number): void {
    for (const rc of this.remotes.values()) rc.update();
    this.crashCooldown = Math.max(0, this.crashCooldown - dt);

    if (this.racing) {
      this.sendTimer += dt;
      if (this.sendTimer >= SEND_INTERVAL) {
        this.sendTimer %= SEND_INTERVAL;
        const r2 = (v: number) => Math.round(v * 100) / 100;
        const r3 = (v: number) => Math.round(v * 1000) / 1000;
        // スタートラインはループの継ぎ目の手前にあり、スタート直後は 0.99 付近を指すことがある(RaceDirector と同じ補正)
        const p = progress > 0.9 && elapsedMs < 5000 ? 0 : progress;
        const s: CarState = [
          r2(cc.position.x), r2(cc.position.y), r2(cc.position.z), r3(cc.rotationY), r2(cc.speed),
          r3(cc.currentSteerAngle), r3(cc.bodyRoll), r3(cc.groundPitch), cc.isDrifting ? 1 : 0, r3(p),
        ];
        this.client.send({ t: 'state', s, ts: Math.round(this.client.serverNow()) });
      }
    }

    this.standingsTimer += dt;
    if (this.standingsTimer >= STANDINGS_INTERVAL) {
      this.standingsTimer = 0;
      this.hooks.onStandings(this.standings(progress));
    }
  }

  /** 自車の物理の直後・マップの拘束の前に呼ぶ。重なりを解消し、ぶつかった分だけ減速する。 */
  public collide(cc: CarController): void {
    for (const rc of this.remotes.values()) {
      if (!rc.valid || rc.stale) continue;
      if (Math.abs(rc.pos.y - cc.position.y) > 2.5) continue;       // 別の高さの道路
      const hit = carOverlap(cc.position.x, cc.position.z, cc.rotationY, rc.pos.x, rc.pos.z, rc.rotY);
      if (!hit) continue;
      cc.position.x += hit.nx * (hit.depth + 0.02);
      cc.position.z += hit.nz * (hit.depth + 0.02);

      // 相手→自車の向き n に沿った相対速度。近づいている(c>0)時だけ、その分(反発係数0.2)を自車の速度から差し引く
      const mvx = Math.sin(cc.rotationY) * cc.speed, mvz = Math.cos(cc.rotationY) * cc.speed;
      const rvx = Math.sin(rc.rotY) * rc.speed, rvz = Math.cos(rc.rotY) * rc.speed;
      const closing = (rvx - mvx) * hit.nx + (rvz - mvz) * hit.nz;
      if (closing > 0) {
        const dv = closing * 0.6;
        const nvx = mvx + hit.nx * dv, nvz = mvz + hit.nz * dv;
        cc.speed = nvx * Math.sin(cc.rotationY) + nvz * Math.cos(cc.rotationY);
        if (closing > 2 && this.crashCooldown === 0) {
          audio.sfx.crash(Math.min(1, closing / 15));
          this.crashCooldown = 0.3;
          cc.bodyPitch += 0.05;
        }
      }
    }
  }

  public standings(myProgress: number): StandingRow[] {
    const rows: (StandingRow & { prog: number })[] = [
      { id: this.you, name: this.myName, color: this.myColor, me: true, timeMs: this.finished.get(this.you) ?? null, prog: myProgress },
    ];
    for (const rc of this.remotes.values()) {
      rows.push({ id: rc.id, name: rc.name, color: rc.color, me: false, timeMs: this.finished.get(rc.id) ?? null, prog: rc.progress });
    }
    const order = this.serverOrder;
    if (order) {
      // サーバーの順位に従う(全員の画面で同じになる)。まだ載っていない人(退出直後など)は後ろに回す
      const rank = (id: number) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
      rows.sort((a, b) => rank(a.id) - rank(b.id));
    } else {
      rows.sort((a, b) => {
        if (a.timeMs !== null || b.timeMs !== null) return (a.timeMs ?? Infinity) - (b.timeMs ?? Infinity);
        return b.prog - a.prog;
      });
    }
    return rows;
  }

  public dispose(): void {
    this.racing = false;
    const combat = this.drive.combatSystem;
    combat.remoteSource = null;
    combat.onLocalFire = undefined;
    combat.onPlayerKilled = undefined;
    combat.onlineYou = -1;
    this.offs.forEach((f) => f());
    this.offs = [];
    for (const rc of this.remotes.values()) rc.dispose();
    this.remotes.clear();
  }
}

