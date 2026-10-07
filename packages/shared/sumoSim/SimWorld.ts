// 相撲の対戦の「場」: 土俵・物理・力士(2〜4人)・ラウンド進行・得点。描画・音・通信には触れない。
//   サーバー: オンライン対戦の本体として動かし、約20Hzで snapshot() を全員へ送る。
//   ブラウザ: CPU対戦(2人)を同じコードで動かし、毎フレーム snapshot(false) を画面に渡す。
// ルール: 土俵から押し出された人から脱落。最後に残った人がそのラウンドの1点。先に winsToMatch 点取った人の勝ち。
//   全員が同時に落ちたら無得点で取り直し。途中で退出した人は脱落扱い(次のラウンド以降は出てこない)。残りが1人になったら、その人の勝ち。
// 物理エンジン(cannon-es)は、サーバーとブラウザで置き場所が違うため、import せず呼び出し側から渡してもらう。
import type * as CANNONNS from 'cannon-es';
import type { FighterSnap, SnapMsgBody } from '../sumoProtocol.ts';
import { ROUND_NAMES } from '../sumoProtocol.ts';
import { FxBus } from './FxBus.ts';
import { SimFighter } from './SimFighter.ts';
import type { Cannon, FighterActions, FighterMoveInput, SimEnv } from './SimFighter.ts';

export const DOHYO_RADIUS = 9.2;
export const DOHYO_HEIGHT = 1.2;
/** 力士が出る位置の、土俵の中心からの距離(m) */
const START_RADIUS = 4.6;
/** この高さより下に落ちたら、場外(ラウンドの脱落) */
const RING_OUT_Y = -1.8;
/** 仕切り(見合って)の長さ(秒) */
const STANDBY_SEC = 1.35;
/** 「はっけよい」から「のこった」を出すまで(秒) */
const NOKOTTA_DELAY_SEC = 1.1;
/** 勝負あり から次の仕切りまで(秒) */
const FINISHED_SEC = 2.4;
/** 試合が決まってから、結果画面を出すまで(秒)。サーバーはこの時間のあとで結果を送って場を空に戻す */
export const MATCH_OVER_DELAY_SEC = 2.2;

/** 力士の見た目と名前(1番目から順に割り当てる)。画面とサーバーで共有する。 */
export const FIGHTERS = [
  { id: 'p1', name: '蒼天龍', side: '東方', skin: 0xefc49b, mawashi: 0x1b4965, hair: 0x111111, css: '#3fa7e0' },
  { id: 'p2', name: '紅炎山', side: '西方', skin: 0xebb485, mawashi: 0x8b1e0f, hair: 0x111111, css: '#e63946' },
  { id: 'p3', name: '翠嵐海', side: '南方', skin: 0xf0c8a0, mawashi: 0x2d6a4f, hair: 0x111111, css: '#3fc77a' },
  { id: 'p4', name: '金剛峰', side: '北方', skin: 0xe9b98f, mawashi: 0xc9a227, hair: 0x111111, css: '#f2c230' },
];

/**
 * 力士の名前の候補(オンライン対戦で、参加者にランダムに付く)。見た目(まわしの色・方角)は参加順で決まる。
 * 先頭の4つは CPU 対戦で使う FIGHTERS の名前と同じ。
 */
export const SUMO_NAMES = [
  '蒼天龍', '紅炎山', '翠嵐海', '金剛峰',
  '大雷鳳', '白銀嶽', '黒鉄山', '猛虎丸', '轟天海', '烈風関',
  '鬼神丸', '雷電錦', '昇龍華', '剛力山', '朝霧富士', '荒波海',
  '鉄壁嶽', '神威山', '巌龍', '疾風川', '旭日峰', '大岩戸',
  '暁天', '豪炎', '海鳴', '白虎山', '大瀑布', '天狼星',
];

export type SimPhase = 'waiting' | 'standby' | 'active' | 'finished' | 'match_over';

export interface FighterInput {
  move: FighterMoveInput;
  actions: FighterActions;
}

export interface SimOptions {
  /** 力士の人数(2〜4) */
  count: number;
  /** 何点先取で試合に勝つか */
  winsToMatch: number;
  /** 1ラウンドの最長(秒)。超えたら無得点で取り直し。省略=無制限 */
  roundTimeLimitSec?: number;
  /** 力士ごとの名前(勝負ありの表示に使う)。省略または足りない分は FIGHTERS の名前 */
  names?: string[];
}

const IDLE_INPUT: FighterInput = {
  move: { x: 0, z: 0, isMoving: false },
  actions: { strikePressed: false, strike: false, strikeReleased: false, grabPressed: false },
};

/** i 番目の力士の初期位置(土俵の中心を向く)。2人なら左右、3〜4人なら円周に等間隔。 */
export function startPose(i: number, n: number): { x: number; z: number; angle: number } {
  const theta = Math.PI + (i * Math.PI * 2) / n;
  const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
  const rad = isPreview ? 1.4 : START_RADIUS;
  const x = Math.round(Math.cos(theta) * rad * 1000) / 1000;
  const z = Math.round(Math.sin(theta) * rad * 1000) / 1000;
  return { x, z, angle: Math.atan2(-x, -z) };
}

export class SimWorld {
  public readonly fighters: SimFighter[] = [];
  public readonly fx = new FxBus();
  public readonly wins: number[];
  public phase: SimPhase = 'waiting';
  /** 現在の局面に入ってからの経過(秒) */
  public phaseTime = 0;
  /** 力士を初期位置へ戻した回数。画面は変わった時に補間せず置き直す */
  public resetCount = 0;
  /** 試合に勝った人(match_over の時)。いなければ null */
  public winner: number | null = null;
  /** 強い当たりの一瞬、動きを止める残り(秒) */
  public hitStopRemaining = 0;

  private readonly C: Cannon;
  private readonly world: CANNONNS.World;
  private readonly opts: SimOptions;
  private nokottaTimer: number | null = null;
  private activeTime = 0;
  private blastDone = false;
  private lastFallen: SimFighter | null = null;
  private readonly fell = new Set<SimFighter>();

  constructor(C: Cannon, opts: SimOptions) {
    this.C = C;
    this.opts = opts;
    this.wins = new Array(opts.count).fill(0);

    // どっしりとした重厚な相撲重力
    this.world = new C.World();
    this.world.gravity.set(0, -28, 0);
    const solver = new C.GSSolver();
    solver.iterations = 10;     // 衝突時の安定性向上
    this.world.solver = solver;

    const dohyoMaterial = new C.Material('dohyo');
    const fighterMaterial = new C.Material('fighter');
    const defaultMaterial = new C.Material('default');
    // 力士 vs 土俵。摩擦を持たせると、接地した力士の水平速度がほぼ打ち消されてしまう。
    // そのため摩擦は0にして、止まる・滑る挙動は SimFighter 側の制動(brake / GROUND_DRAG)で作る。
    this.world.addContactMaterial(new C.ContactMaterial(fighterMaterial, dohyoMaterial, { friction: 0.0, restitution: 0.05 }));
    // 力士 vs 力士(相撲の押し合い・がっぷり四つ)
    this.world.addContactMaterial(new C.ContactMaterial(fighterMaterial, fighterMaterial, { friction: 0.2, restitution: 0.35 }));
    this.world.defaultContactMaterial = new C.ContactMaterial(defaultMaterial, defaultMaterial, { friction: 0.3, restitution: 0.1 });

    // 土俵の剛体(静的な円柱)
    const dohyo = new C.Body({ mass: 0, material: dohyoMaterial, position: new C.Vec3(0, -DOHYO_HEIGHT / 2, 0) });
    dohyo.addShape(new C.Cylinder(DOHYO_RADIUS, DOHYO_RADIUS + 0.9, DOHYO_HEIGHT, 32));
    this.world.addBody(dohyo);

    const env: SimEnv = {
      C,
      world: this.world,
      fighterMaterial,
      fx: this.fx,
      requestHitStop: (sec) => {
        this.hitStopRemaining = Math.max(this.hitStopRemaining, sec);
      },
    };
    for (let i = 0; i < opts.count; i++) {
      const f = FIGHTERS[i];
      const pose = startPose(i, opts.count);
      this.fighters.push(new SimFighter(env, { id: f.id, name: opts.names?.[i] ?? f.name, startX: pose.x, startY: 1.2, startZ: pose.z, startAngle: pose.angle }));
    }
  }

  /** 最初の仕切りから始める。 */
  public start(): void {
    const rest = this.fighters.filter((f) => !f.gone);
    if (rest.length <= 1) {
      this.endMatch(rest.length === 1 ? this.fighters.indexOf(rest[0]) : null);   // 始める前に、みんな抜けていた
      return;
    }
    this.startRound(true);
  }

  /** 試合から外す(退出)。残りが1人以下になったら、その人の勝ちで試合を終える。 */
  public removeFighter(slot: number): void {
    const f = this.fighters[slot];
    if (!f || f.gone) return;
    f.leave();
    if (this.phase === 'match_over') return;
    const rest = this.fighters.filter((x) => !x.gone);
    if (rest.length <= 1 && this.phase !== 'waiting') this.endMatch(rest.length === 1 ? this.fighters.indexOf(rest[0]) : null);
  }

  /** 1ステップ進める。inputs[i] は i 番目の力士の操作(null=何もしない)。 */
  public step(dt: number, inputs: (FighterInput | null)[]): void {
    this.phaseTime += dt;
    switch (this.phase) {
      case 'waiting':
        return;
      case 'standby':
        this.stepStandby(dt);
        return;
      case 'active':
        this.stepActive(dt, inputs);
        return;
      case 'finished':
        this.physicsStep(dt);
        if (this.phaseTime >= FINISHED_SEC) this.startRound(false);
        return;
      case 'match_over':
        this.physicsStep(dt);
        return;
    }
  }

  /** 画面・通信用のスナップショット(演出イベントは、ここで取り出して空にする)。round=true なら通信量を減らすため丸める。 */
  public snapshot(round: boolean, ts: number, n: number): SnapMsgBody {
    return {
      ts,
      n,
      rc: this.resetCount,
      rs: Math.max(0, ROUND_NAMES.indexOf(this.phase)),
      w: [...this.wins],
      f: this.fighters.map((f) => f.toSnap(round)),
      e: this.fx.take(),
    };
  }

  /** 力士ごとの状態だけ(演出は取り出さない)。 */
  public fighterSnaps(): FighterSnap[] {
    return this.fighters.map((f) => f.toSnap(false));
  }

  // ---------------------------------------------------------------
  // ラウンドの進行
  // ---------------------------------------------------------------

  /** 立ち合いシーケンス開始。「見合って」の構え待機のあと、「はっけよい」で操作可能になる。 */
  private startRound(isFirst: boolean): void {
    this.nokottaTimer = null;
    this.phase = 'standby';
    this.phaseTime = 0;
    this.activeTime = 0;
    this.blastDone = false;
    this.lastFallen = null;
    this.hitStopRemaining = 0;
    this.fell.clear();
    this.fx.sound('setBgmCalm', true);

    for (const f of this.fighters) {
      if (f.gone) continue;
      f.resetPosition();
    }
    this.resetCount++;

    this.fx.sound('playHyoshigi');
    // 勝てば試合が決まる人が2人以上いる番だけ、最終番と補足する(星取りは HUD の丸印で見える)
    const matchPoint = this.fighters.filter((f, i) => !f.gone && this.wins[i] >= this.opts.winsToMatch - 1).length;
    const isDecider = !isFirst && matchPoint >= 2;
    this.fx.push('ui', 'showBanner', '見合って', isDecider ? '最終番' : '', 1200);
  }

  private stepStandby(dt: number): void {
    // 仕切り中は静止(移動や攻撃は一切受け付けない)
    for (const f of this.fighters) f.body.velocity.set(0, 0, 0);
    this.physicsStep(dt);

    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    const standbyLimit = isPreview ? 0.1 : STANDBY_SEC;
    if (this.phaseTime >= standbyLimit) {
      this.phase = 'active';
      this.phaseTime = 0;
      this.fx.sound('setBgmCalm', false);
      this.fx.push('ui', 'showBanner', 'はっけよい', '', 900);
      // 「のこった」は、少し間をあけて別に出す(勝負がついていれば出さない)
      this.nokottaTimer = NOKOTTA_DELAY_SEC;
      this.fx.sound('playTaiko');
    }
  }

  private stepActive(dt: number, inputs: (FighterInput | null)[]): void {
    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    if (isPreview) {
      for (const f of this.fighters) {
        f.damagePercent = 0;
      }
    }
    if (this.nokottaTimer !== null) {
      this.nokottaTimer -= dt;
      if (this.nokottaTimer <= 0) {
        this.nokottaTimer = null;
        this.fx.push('ui', 'showBanner', 'のこった', '', 900);
      }
    }

    // 強い当たりの一瞬だけ、力士と物理を止める
    if (this.hitStopRemaining > 0) {
      this.hitStopRemaining -= dt;
      return;
    }

    this.activeTime += dt;

    // 一番近い(まだ落ちていない)相手の位置を渡して、力士を更新する
    for (let i = 0; i < this.fighters.length; i++) {
      const f = this.fighters[i];
      if (f.gone) continue;
      const input = inputs[i] ?? IDLE_INPUT;
      const opp = this.nearestOpponent(f);
      f.update(dt, input.move, input.actions, opp ? opp.body.position.x : null, opp ? opp.body.position.z : null);
    }

    this.resolveAttacks();
    this.physicsStep(dt);
    this.checkRingOut();
  }

  private physicsStep(dt: number): void {
    // 安定した固定ステップ(60Hz)
    this.world.step(1 / 60, Math.min(dt, 0.1), 3);
  }

  private nearestOpponent(me: SimFighter): SimFighter | null {
    let best: SimFighter | null = null;
    let bestD = Infinity;
    for (const o of this.fighters) {
      if (o === me || o.gone || o.state === 'fall') continue;
      const d = Math.hypot(o.body.position.x - me.body.position.x, o.body.position.z - me.body.position.z);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /** 攻撃ヒット判定(ヒットボックス vs 相手の剛体)。1回の攻撃は、いちばん近い1人にだけ当たる。 */
  private resolveAttacks(): void {
    for (const attacker of this.fighters) {
      if (attacker.gone) continue;
      const hb = attacker.getHitbox();
      if (!hb || attacker.attackHitRegistered) continue;

      let defender: SimFighter | null = null;
      let bestD = Infinity;
      for (const d of this.fighters) {
        if (d === attacker || d.gone) continue;
        const dist = Math.hypot(hb.x - d.body.position.x, hb.y - d.body.position.y, hb.z - d.body.position.z);
        if (dist < hb.radius + 0.85 && dist < bestD) {
          bestD = dist;
          defender = d;
        }
      }
      if (!defender) continue;

      // ヒット成立!
      attacker.attackHitRegistered = true;
      if (attacker.currentAttackType === 'grab') {
        // 突進中の相手は掴めない(突進のほうが、つかみを弾き飛ばす)
        if (defender.state === 'buchikamashi_rush') {
          attacker.attackHitRegistered = false;
          continue;
        }
        if (defender.state !== 'fall' && defender.state !== 'grabbed' && defender.state !== 'throw') {
          attacker.onGrabSuccess(defender);
          defender.onGrabbed(attacker);
        }
      } else {
        defender.receiveHit(
          attacker.body.position.x,
          attacker.body.position.z,
          attacker.currentAttackType as 'harite' | 'harite_strong' | 'buchikamashi',
          attacker.chargeTimer / attacker.maxChargeTime,
          attacker
        );
      }
    }
  }

  /** 場外の判定。残りが1人以下になったらラウンド終了。 */
  private checkRingOut(): void {
    for (const f of this.fighters) {
      if (f.gone || this.fell.has(f) || f.body.position.y >= RING_OUT_Y) continue;
      this.fell.add(f);
      this.lastFallen = f;
      // 最初の脱落の場所で大爆発(1ラウンドに1回。客席に先に突っ込んだ場合は、画面側がその場で爆破する)
      if (!this.blastDone) {
        this.blastDone = true;
        this.fx.push('main', 'blast', f.body.position.x, 0.8, f.body.position.z, 0);
      }
    }

    const alive = this.fighters.filter((f) => !f.gone && !this.fell.has(f));
    const timeUp = this.opts.roundTimeLimitSec !== undefined && this.activeTime >= this.opts.roundTimeLimitSec;
    if (alive.length > 1 && !timeUp) return;

    this.nokottaTimer = null;
    this.fx.sound('playHyoshigi');
    this.fx.sound('setBgmCalm', true);

    if (alive.length !== 1) {
      // 同体(全員が同時に落ちた)・時間切れ: 無得点で取り直し
      this.phase = 'finished';
      this.phaseTime = 0;
      this.fx.push('ui', 'showBanner', timeUp && alive.length > 1 ? '時間切れ　取り直し' : '同体　取り直し', '', 2000);
      return;
    }

    const winner = alive[0];
    const slot = this.fighters.indexOf(winner);
    this.wins[slot]++;
    const kimarite = this.determineKimarite(winner, this.lastFallen);
    this.fx.push('ui', 'showBanner', '勝負あり', `${winner.name}　${kimarite}`, 2000);

    if (this.wins[slot] >= this.opts.winsToMatch) this.endMatch(slot);
    else {
      this.phase = 'finished';
      this.phaseTime = 0;
    }
  }

  private endMatch(winnerSlot: number | null): void {
    this.phase = 'match_over';
    this.phaseTime = 0;
    this.winner = winnerSlot;
    this.nokottaTimer = null;
  }

  /** 相撲の決まり手判定 */
  private determineKimarite(winner: SimFighter, loser: SimFighter | null): string {
    if (winner.state === 'throw') return '上手投げ';
    if (winner.state === 'buchikamashi_rush') return '突き出し';
    if (winner.state === 'harite') return '押し出し';
    if (loser && loser.damagePercent > 120) return '寄り倒し';
    return '押し出し';
  }
}
