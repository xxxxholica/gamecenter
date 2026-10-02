import { TARGET_SCALE, type FlyingUFO } from '../dynamic_targets';
import { LANE_PITCH, ufoPose, type UfoSpec } from '../../../../shared/ennichiProtocol';

/** 命中が確定して墜ちる演出の長さ(ms) */
const FALL_MS = 1400;

/**
 * 共有の的(大UFO)。出現・経路は共有シードとサーバー時刻の関数なので、全員の画面で同じ時刻に同じ位置を飛ぶ
 * (列の座標 u を、自分のスロットに合わせて x に直す)。当たり判定はコルク側(FlyingUFO の外部制御モード)が行い、
 * 当たりの採否・HP・得点はサーバーが決める(applyEvent で反映)。
 */
export class SharedUfo {
  private readonly ufo: FlyingUFO;
  private readonly schedule: UfoSpec[];
  private readonly mySlot: number;
  private readonly hp = new Map<number, number>();
  private readonly destroyedAt = new Map<number, number>();
  private active: UfoSpec | null = null;

  constructor(ufo: FlyingUFO, schedule: UfoSpec[], mySlot: number) {
    this.ufo = ufo;
    this.schedule = schedule;
    this.mySlot = mySlot;
    for (const s of schedule) this.hp.set(s.n, s.hp);
    ufo.external = true;
    ufo.externalActive = false;
    ufo.mesh.visible = false;
  }

  /** いま出現していて撃てる的(なければ null)。命中の報告に使う。 */
  public get activeSpec(): UfoSpec | null {
    return this.active;
  }

  public hpOf(n: number): number {
    return this.hp.get(n) ?? 0;
  }

  /** サーバーの採否の通知: 残りHP。0 で撃破(墜ちる演出を始める)。 */
  public applyEvent(n: number, hp: number, serverNow: number): void {
    this.hp.set(n, hp);
    if (hp <= 0 && !this.destroyedAt.has(n)) this.destroyedAt.set(n, serverNow);
  }

  /** t: GOからの経過ms(負ならまだ)。serverNow: サーバー時刻ms。 */
  public update(t: number, serverNow: number, dt: number): void {
    const u = this.ufo;
    this.active = null;
    u.externalActive = false;

    for (const spec of this.schedule) {
      const doneAt = this.destroyedAt.get(spec.n);
      if (doneAt !== undefined) {
        const since = serverNow - doneAt;
        if (since < FALL_MS) this.fall(spec, since, dt);
        continue;
      }
      const pose = ufoPose(spec, t);
      if (!pose) continue;
      this.active = spec;
      u.externalActive = true;
      u.mesh.visible = true;
      u.pos.set(pose.u - this.mySlot * LANE_PITCH, pose.y, pose.z);
      u.mesh.position.copy(u.pos);
      u.mesh.scale.setScalar(spec.kind === 'giant' ? 6 : 4);
      u.mesh.rotation.z = -0.12;
      u.mesh.rotation.y += 1.3 * dt;
      return;
    }
    u.mesh.visible = false;
  }

  /** 撃破の演出: その場から回転しながら落ちる。 */
  private fall(spec: UfoSpec, sinceMs: number, dt: number): void {
    const u = this.ufo;
    const s = sinceMs / 1000;
    u.mesh.visible = true;
    u.mesh.position.y = Math.max(0.2, u.pos.y - 4.9 * s * s * 2);
    u.mesh.rotation.x += 12 * dt;
    u.mesh.rotation.z += 16 * dt;
    u.mesh.scale.setScalar((spec.kind === 'giant' ? 6 : 4) * Math.max(0.2, 1 - s * 0.4));
  }

  public dispose(): void {
    this.ufo.external = false;
    this.ufo.externalActive = false;
    this.ufo.mesh.scale.setScalar(TARGET_SCALE);
    this.ufo.mesh.rotation.set(0, 0, 0);
  }
}

