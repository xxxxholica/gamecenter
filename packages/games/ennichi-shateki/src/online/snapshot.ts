// オンライン対戦の純粋なロジック(three.js に依存しない): 景品のスナップショットの作り方、列の座標、順位の表記、チームランク。
// 単体テストできるよう、景品は必要な項目だけの構造(PrizeLike)で受ける。
import type { PrizeSnap } from '../../../../shared/ennichiProtocol.ts';
import { LANE_PITCH } from '../../../../shared/ennichiProtocol.ts';

export const FLAG_FALLING = 1;
export const FLAG_SPAWNING = 2;
export const FLAG_GROUNDED = 4;
/** 動きが止まって、棚の元の位置に戻った(受け取った側は、元の位置・姿勢に戻す) */
export const FLAG_REST = 8;

/** スナップショットに必要な、景品の状態。PrizeEntity がそのまま満たす。 */
export interface PrizeLike {
  config: { slotId: number };
  currentPos: { x: number; y: number; z: number };
  pitchAngle: number;
  rollAngle: number;
  velocity: { z: number };
  isFalling: boolean;
  isSpawning: boolean;
  isGrounded: boolean;
  mesh: { rotation: { x: number; z: number } };
}

/** 動いている(揺れている・落ちている・入荷中)か。止まった景品は送らない(配置は共有シードで既知)。 */
export function isMoving(p: PrizeLike): boolean {
  return p.isFalling || p.isSpawning || Math.abs(p.pitchAngle) > 0.004 || Math.abs(p.rollAngle) > 0.004 || Math.abs(p.velocity.z) > 0.002;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** 景品1つを [slotId, x, y, z, a, b, flags] にする。a/b は、落下中は mesh の回転x/z、そうでなければ pitch/roll。 */
export function encodePrize(p: PrizeLike, rest = false): PrizeSnap {
  let flags = 0;
  if (p.isFalling) flags |= FLAG_FALLING;
  if (p.isSpawning) flags |= FLAG_SPAWNING;
  if (p.isGrounded) flags |= FLAG_GROUNDED;
  if (rest) flags |= FLAG_REST;
  const a = p.isFalling ? p.mesh.rotation.x : p.pitchAngle;
  const b = p.isFalling ? p.mesh.rotation.z : p.rollAngle;
  return [p.config.slotId, r3(p.currentPos.x), r3(p.currentPos.y), r3(p.currentPos.z), r3(a), r3(b), flags];
}

/**
 * 送る景品を集める: いま動いているもの + 前回は動いていたが止まったもの(REST を付けて1回だけ)。
 * 落下して床に着いた景品(GROUNDED)は、着いた時の1回を送れば、受け取った側がその位置に残す。
 */
export class SnapshotTracker {
  private moving = new Set<number>();

  collect(prizes: PrizeLike[]): PrizeSnap[] {
    const out: PrizeSnap[] = [];
    const now = new Set<number>();
    for (const p of prizes) {
      const id = p.config.slotId;
      if (isMoving(p) && !p.isGrounded) {
        out.push(encodePrize(p));
        now.add(id);
      } else if (this.moving.has(id)) {
        out.push(encodePrize(p, !p.isGrounded));             // 床に着いた(GROUNDED)か、棚の上で止まった(REST)ことを1回だけ伝える
      }
    }
    this.moving = now;
    return out;
  }

  reset(): void {
    this.moving.clear();
  }
}

/** スロット slot の台の、自分(mySlot)から見た x 座標(自分の台が x=0。他人の台は左右にずれる)。 */
export function laneX(slot: number, mySlot: number): number {
  return (slot - mySlot) * LANE_PITCH;
}

/** 順位の表記: 1st / 2nd / 3rd / 4th */
export function ordinal(n: number): string {
  return ['1st', '2nd', '3rd', '4th'][n - 1] ?? `${n}th`;
}

/** 協力のチームランク: 1人あたりの平均得点で決める(人数が違っても同じ基準)。しきい値はオフラインの称号と同じ。 */
export const RANK_STEPS: [number, string][] = [[8000, 'S'], [5000, 'A'], [3000, 'B'], [1500, 'C']];

export function teamRank(teamScore: number, players: number): string {
  const avg = teamScore / Math.max(1, players);
  for (const [min, label] of RANK_STEPS) if (avg >= min) return label;
  return 'D';
}

/** 内訳(種類→個数)を合算する(協力の合算の山)。 */
export function sumDefeated(list: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of list) for (const [k, v] of Object.entries(d)) out[k] = (out[k] ?? 0) + v;
  return out;
}
