import * as THREE from 'three';
import type { DriveScene } from '../core/DriveScene';
import type { CarController } from '../core/CarController';
import type { SkywayNet } from './skywayNet';
import { RemoteCar } from './RemoteCar';
import { carOverlap } from './carCollision';
import { audio } from '../audio';
import { boostThemeFor } from '../core/BoostTheme';
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

  constructor(client: SkywayNet, drive: DriveScene, players: RacerInfo[], you: number, hooks: OnlineRaceHooks) {
    this.client = client;
    this.hooks = hooks;
    this.you = you;
    const me = players.find((p) => p.id === you);
    this.myName = me?.name ?? 'YOU';
    this.myColor = me?.car.body ?? 0x00f0ff;
    for (const p of players) {
      if (p.id === you) continue;
      const rc = new RemoteCar(p.id, p.name, p.car);
      this.remotes.set(p.id, rc);
      drive.scene.add(rc.car.group);
    }
    this.drive = drive;
    this.offs.push(
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
    audio.sfx.removeRemoteEngine(id);
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
    this.updateRemoteFx(cc);
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
          r3(cc.currentSteerAngle), r3(cc.bodyRoll), r3(cc.groundPitch), cc.isDrifting ? 1 : 0, r3(p), r2(this.drive.boostAmount),
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

  /** 相手の車ごとの、前回の「自車から見た前後の位置」(すれ違いの検出用) */
  private readonly lastAhead = new Map<number, number>();
  private readonly fxVel = new THREE.Vector3();
  private readonly fxPos = new THREE.Vector3();
  private readonly fxWater = new THREE.Vector3();
  private readonly fxOut = new THREE.Vector3();

  /** 遠い相手には演出を出さない距離(m) */
  private static readonly FX_RANGE = 90;

  /**
   * 相手の車の演出を、自車と同じものを出す: ドリフトの火花とスモーク、ブーストの炎、雨の水しぶき、エンジン音、すれ違い音。
   * 位置・速度・ドリフト・ブーストは、受信した値(補間後)から作る。
   */
  private updateRemoteFx(cc: CarController): void {
    const smoke = this.drive.tireSmoke;
    const rainy = this.drive.isRainy;
    const fwdX = Math.sin(cc.rotationY), fwdZ = Math.cos(cc.rotationY);
    const rightX = Math.cos(cc.rotationY), rightZ = -Math.sin(cc.rotationY);
    for (const rc of this.remotes.values()) {
      if (!rc.valid || rc.stale || !this.racing) {
        audio.sfx.removeRemoteEngine(rc.id);
        continue;
      }
      const dx = rc.pos.x - cc.position.x, dz = rc.pos.z - cc.position.z;
      const dist = Math.hypot(dx, dz);
      const speedKmH = Math.abs(rc.speed) * 3.6;
      audio.sfx.updateRemoteEngine(rc.id, speedKmH, dist, (dx * rightX + dz * rightZ) / Math.max(dist, 8));

      // すれ違い: 自車から見た前後の位置が、近い距離で前→後ろ(またはその逆)に入れ替わった時
      const ahead = dx * fwdX + dz * fwdZ;
      const prevAhead = this.lastAhead.get(rc.id);
      this.lastAhead.set(rc.id, ahead);
      const lateral = Math.abs(dx * rightX + dz * rightZ);
      if (prevAhead !== undefined && Math.sign(prevAhead) !== Math.sign(ahead) && lateral < 9 && Math.abs(ahead) < 14) {
        const rel = Math.abs(rc.speed * Math.cos(rc.rotY - cc.rotationY) - cc.speed);
        audio.sfx.passBy(rel, 1 - lateral / 9);
      }

      if (dist > OnlineRace.FX_RANGE) continue;
      const tires = this.remoteTires(rc);
      const vel = this.fxVel.set(Math.sin(rc.rotY) * rc.speed, 0, Math.cos(rc.rotY) * rc.speed);
      const steerDir = rc.steer >= 0 ? 1 : -1;

      // ドリフト: 後輪の火花と白煙
      if (rc.drift > 0.5 && speedKmH > 20) {
        const intensity = Math.min(1.8, 0.9 + speedKmH / 150);
        const blue = rc.boost > 0.3;
        const theme = boostThemeFor(rc.car);
        smoke.emitSpark(tires.rearLeft, vel, steerDir, intensity, blue, theme);
        smoke.emitSpark(tires.rearRight, vel, steerDir, intensity, blue, theme);
        smoke.emitSmoke(tires.rearLeft, vel, Math.min(1.6, 0.6 + speedKmH / 120));
        smoke.emitSmoke(tires.rearRight, vel, Math.min(1.6, 0.6 + speedKmH / 120));
      }

      // 高速のタイヤスモーク
      if (speedKmH >= 115) {
        const k = Math.min(1.4, 0.4 + (speedKmH - 115) / 20) * 0.5;
        smoke.emitSmoke(tires.rearLeft, vel, k);
        smoke.emitSmoke(tires.rearRight, vel, k);
      }

      // ブースト: 排気口から、その車の主色の炎
      if (rc.boost > 0.15) {
        const theme = boostThemeFor(rc.car);
        const back = this.fxPos.set(-Math.sin(rc.rotY) * 0.55, 0.4, -Math.cos(rc.rotY) * 0.55);
        for (const w of [tires.rearLeft, tires.rearRight]) {
          const pos = this.fxOut.copy(w).lerp(rc.pos, 0.35).add(back);
          smoke.emitFlame(pos, vel, rc.boost, theme);
        }
      }

      // 雨: 水しぶき
      if (rainy && speedKmH > 45) {
        const spray = Math.min(1.0, 0.35 + (speedKmH - 45) / 90);
        for (const w of [tires.rearLeft, tires.rearRight]) smoke.emitSmoke(w, vel, spray);
        const latX = Math.cos(rc.rotY), latZ = -Math.sin(rc.rotY);
        const water = this.fxWater.copy(vel).multiplyScalar(0.4);
        const n = (speedKmH > 80 ? 0.7 : 0.4) + (rc.drift > 0.5 ? 0.5 : 0);
        for (const w of [tires.rearLeft, tires.rearRight, tires.frontLeft, tires.frontRight]) {
          if (Math.random() >= n) continue;
          const side = Math.sign((w.x - rc.pos.x) * latX + (w.z - rc.pos.z) * latZ) || 1;
          smoke.emitSplash(w, water, this.fxOut.set(latX * side, 0, latZ * side), spray * (rc.drift > 0.5 ? 1.2 : 1));
        }
      }
    }
  }

  /** 相手の車のタイヤの接地位置(前左・前右・後左・後右)。モデルの車輪から、無ければ車体から求める */
  private remoteTires(rc: RemoteCar) {
    const wheels = rc.car.wheels;
    const make = (i: number, ox: number, oz: number): THREE.Vector3 => {
      const v = new THREE.Vector3();
      if (wheels && wheels[i]) {
        wheels[i].getWorldPosition(v);
        v.y = rc.pos.y;
      } else {
        v.set(ox, 0, oz).applyAxisAngle(new THREE.Vector3(0, 1, 0), rc.rotY).add(rc.pos);
      }
      return v;
    };
    return {
      frontLeft: make(0, -0.65, 1.2),
      frontRight: make(1, 0.65, 1.2),
      rearLeft: make(2, -0.65, -1.2),
      rearRight: make(3, 0.65, -1.2),
    };
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
    this.offs.forEach((f) => f());
    this.offs = [];
    for (const rc of this.remotes.values()) rc.dispose();
    this.remotes.clear();
    audio.sfx.stopRemoteEngines();
  }
}

