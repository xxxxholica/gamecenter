import * as THREE from 'three';
import type { ClientMsg, Defeated, FireEvent, Mode, ServerMsg, UfoSpec } from '../../../../shared/ennichiProtocol';
import { COUNTDOWN_MS, UFO_GIANT_HP, ufoSchedule } from '../../../../shared/ennichiProtocol';
import type { DynamicTargetsManager } from '../dynamic_targets';
import type { PrizeEntity } from '../prizes';
import type { EnnichiNet } from './net';
import { OnlineHud } from './OnlineHud';
import { RemoteStall } from './RemoteStall';
import { SharedUfo } from './SharedUfo';
import { SnapshotTracker, laneX } from './snapshot';

type StartMsg = Extract<ServerMsg, { t: 'start' }>;
type GoMsg = Extract<ServerMsg, { t: 'go' }>;
export type ResultsMsg = Extract<ServerMsg, { t: 'results' }>;

/** 送信の間隔(秒)。接続あたりの送信上限(毎秒60通)に収まるよう、照準15Hz・景品8Hz・得点2Hz */
const AIM_INTERVAL = 1 / 15;
const SNAP_INTERVAL = 1 / 8;
const SCORE_INTERVAL = 0.5;

export interface MatchHost {
  scene: THREE.Scene;
  dynamicTargets: DynamicTargetsManager;
  /** 自分の台の景品(動いているものを、スナップショットとして他の人へ送る) */
  getPrizes(): PrizeEntity[];
  /** 自分の照準(NDC) */
  getAim(): [number, number];
  /** 自分の累積得点(共有UFOの得点を除く)と、倒した景品の内訳 */
  getScore(): { score: number; defeated: Defeated };
}

export interface MatchHandlers {
  /** 最終結果が届いた */
  onResults(res: ResultsMsg): void;
  /** 自分が共有UFOに当てた(得点・演出用)。pts=自分に入る得点(協力は0) */
  onMyUfoHit(pts: number, destroyed: boolean): void;
  /** 接続が切れた時 */
  onDisconnect?: () => void;
}

/**
 * 対戦中のネットワーク側(自分の台以外のすべて): 他の人の台・銃・コルク、共有の的(大UFO)、順位表示、送受信。
 * 自分の台の遊び(物理・コルクの当たり・得点)は main.ts のままで、ここへは「発砲」「共有UFOへの命中」だけを渡す。
 */
export class OnlineMatch {
  public readonly mode: Mode;
  public readonly mySlot: number;
  public readonly you: number;
  /** go を受け取るまでは Infinity(カウントダウン中のまま)。begin() で確定する */
  public goTime = Infinity;
  public endAt = Infinity;
  /** 切断した(以降の順位は共有されない。自分の遊びは続けられる) */
  public disconnected = false;
  /** 共有UFOでサーバーに採用された自分の得点(対戦) */
  public ufoPts = 0;
  /** チーム全体に入ったボーナス(協力) */
  public teamBonus = 0;

  private readonly host: MatchHost;
  private readonly net: EnnichiNet;
  private readonly hud: OnlineHud;
  private readonly handlers: MatchHandlers;
  private readonly start: StartMsg;
  private readonly remotes = new Map<number, RemoteStall>();
  private readonly names = new Map<number, string>();
  private readonly scores = new Map<number, number>();
  private readonly shared: SharedUfo;
  private readonly tracker = new SnapshotTracker();
  private readonly offs: (() => void)[] = [];
  private aimT = 0;
  private snapT = 0;
  private scoreT = 0;
  private lastAim = '';
  private lastScore = -1;
  private finished = false;
  private goFlashUntil = 0;

  constructor(host: MatchHost, net: EnnichiNet, hud: OnlineHud, start: StartMsg, you: number, handlers: MatchHandlers) {
    this.host = host;
    this.net = net;
    this.hud = hud;
    this.start = start;
    this.you = you;
    this.handlers = handlers;
    this.mode = start.mode;
    this.mySlot = Math.max(0, start.grid.indexOf(you));

    for (const p of start.players) {
      this.names.set(p.id, p.name);
      this.scores.set(p.id, 0);
      if (p.id === you) continue;
      const slot = start.grid.indexOf(p.id);
      this.remotes.set(p.id, new RemoteStall(host.scene, laneX(slot, this.mySlot), start.seed, p.name));
    }
    const schedule: UfoSpec[] = ufoSchedule(start.seed, start.mode, start.durationMs);
    this.shared = new SharedUfo(host.dynamicTargets.ufo, schedule, this.mySlot);

    this.offs.push(
      net.on('sync', (m) => this.onSync(m)),
      net.on('ufo', (m) => this.onUfo(m)),
      net.on('results', (m) => this.handlers.onResults(m)),
      net.on('room', (m) => {                                 // 途中で抜けた人の台を片付ける
        for (const id of [...this.remotes.keys()]) {
          if (!m.players.some((p) => p.id === id)) {
            this.hud.toast(`${this.names.get(id) ?? 'PLAYER'} が退出しました`);
            this.remotes.get(id)?.dispose();
            this.remotes.delete(id);
          }
        }
      }),
      net.onClose(() => {
        this.disconnected = true;
        this.hud.toast('接続が切れました');
        this.handlers.onDisconnect?.();
      }),
    );
    hud.show();
    hud.setBoard([]);
    hud.setTeam(this.mode === 'coop' ? 0 : null, start.players.length);
  }

  /** 全員のロード完了(go)を受け取った: カウントダウンを始める。 */
  public begin(go: GoMsg): void {
    this.goTime = go.at + COUNTDOWN_MS;
    this.endAt = go.endAt;
  }

  /** サーバー時刻 */
  public now(): number {
    return this.net.serverNow();
  }

  /** GOからの経過ms(負=カウントダウン中) */
  public elapsedMs(): number {
    return Number.isFinite(this.goTime) ? this.now() - this.goTime : -1e9;
  }

  public get phase(): 'countdown' | 'playing' | 'ended' {
    const t = this.now();
    return t < this.goTime ? 'countdown' : t < this.endAt ? 'playing' : 'ended';   // go 前は Infinity なので countdown
  }

  public timeLeftSec(): number {
    return Number.isFinite(this.endAt) ? Math.max(0, (this.endAt - this.now()) / 1000) : this.start.durationMs / 1000;
  }

  /** 自分の表示用の得点: 台の得点 + 共有UFOの得点 */
  public displayScore(): number {
    return this.host.getScore().score + this.ufoPts;
  }

  /** 自分が発砲した(座標は自分のローカル座標のまま送る)。 */
  public sendFire(kind: 'n' | 'b', origin: THREE.Vector3, dir: THREE.Vector3): void {
    if (this.disconnected) return;
    const r = (v: number) => Math.round(v * 1000) / 1000;
    const f: FireEvent = { k: kind, o: [r(origin.x), r(origin.y), r(origin.z)], d: [r(dir.x), r(dir.y), r(dir.z)] };
    this.net.send({ t: 'fire', f } satisfies ClientMsg);
  }

  /** 自分のコルクが共有の的に当たった(採否・得点はサーバーが決める)。 */
  public reportUfoHit(): void {
    const spec = this.shared.activeSpec;
    if (spec && !this.disconnected) this.net.send({ t: 'ufoHit', n: spec.n });
  }

  /** 終了: 最終結果を送る(1回だけ)。 */
  public finish(): void {
    if (this.finished) return;
    this.finished = true;
    const s = this.host.getScore();
    if (!this.disconnected) this.net.send({ t: 'result', score: s.score, defeated: s.defeated });
  }

  public update(dt: number, elapsed: number): void {
    const t = this.elapsedMs();
    this.shared.update(t, this.now(), dt);
    for (const r of this.remotes.values()) r.update(dt, elapsed);

    // カウントダウン表示
    if (!Number.isFinite(this.goTime)) this.hud.setCountdown('…');                 // 他のプレイヤーのロード待ち
    else if (t < 0) this.hud.setCountdown(String(Math.ceil(-t / 1000)));
    else if (t < 700) this.hud.setCountdown('GO!');
    else this.hud.setCountdown(null);

    // 協力の巨大UFOのHP
    const spec = this.shared.activeSpec;
    this.hud.setUfoHp(this.mode === 'coop' && spec ? this.shared.hpOf(spec.n) : null, UFO_GIANT_HP);

    // 順位表示とチーム合計
    this.scores.set(this.you, this.displayScore());
    this.hud.setBoard([...this.scores].map(([id, score]) => ({ id, name: this.names.get(id) ?? 'PLAYER', score, me: id === this.you })));
    if (this.mode === 'coop') this.hud.setTeam([...this.scores.values()].reduce((a, b) => a + b, 0) + this.teamBonus, this.start.players.length);

    // 送信
    if (this.disconnected || this.finished) return;
    this.aimT += dt;
    if (this.aimT >= AIM_INTERVAL) {
      this.aimT = 0;
      const [ax, ay] = this.host.getAim();
      const key = `${ax.toFixed(3)},${ay.toFixed(3)}`;
      if (key !== this.lastAim) {
        this.lastAim = key;
        this.net.send({ t: 'aim', a: [Math.round(ax * 1000) / 1000, Math.round(ay * 1000) / 1000] });
      }
    }
    this.snapT += dt;
    if (this.snapT >= SNAP_INTERVAL) {
      this.snapT = 0;
      const p = this.tracker.collect(this.host.getPrizes());
      if (p.length > 0) this.net.send({ t: 'snap', p });
    }
    this.scoreT += dt;
    if (this.scoreT >= SCORE_INTERVAL) {
      this.scoreT = 0;
      const s = this.host.getScore();
      if (s.score !== this.lastScore) {
        this.lastScore = s.score;
        this.net.send({ t: 'score', score: s.score, defeated: s.defeated });
      }
    }
  }

  private onSync(m: Extract<ServerMsg, { t: 'sync' }>): void {
    for (const [id, a] of Object.entries(m.a)) this.remotes.get(Number(id))?.setAim(a);
    for (const [id, f] of m.f) this.remotes.get(id)?.addFire(f);
    for (const [id, p] of Object.entries(m.p)) this.remotes.get(Number(id))?.applySnap(p);
    for (const [id, sc] of Object.entries(m.sc)) if (Number(id) !== this.you) this.scores.set(Number(id), sc);
  }

  /** サーバーの共有UFOの採否: 残りHPを反映し、通知する。 */
  private onUfo(m: Extract<ServerMsg, { t: 'ufo' }>): void {
    this.shared.applyEvent(m.n, m.hp, this.now());
    this.teamBonus += m.bonus;
    const who = m.by === this.you ? 'あなた' : this.names.get(m.by) ?? 'PLAYER';
    if (m.by === this.you) {
      this.ufoPts += m.pts;
      this.handlers.onMyUfoHit(m.pts, m.hp === 0);
    }
    if (m.hp === 0) {
      this.hud.toast(this.mode === 'coop' ? `巨大UFO撃破！ チームに +${m.bonus}g` : `${who} が共有UFOを撃墜！ +${m.pts}g`);
    }
  }

  public dispose(): void {
    this.offs.forEach((f) => f());
    this.offs.length = 0;
    for (const r of this.remotes.values()) r.dispose();
    this.remotes.clear();
    this.shared.dispose();
    this.hud.hide();
  }
}
