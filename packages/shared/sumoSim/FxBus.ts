// シミュレーションが出した演出イベントをためておき、スナップショットに載せて送る(またはその場で再生する)ための入れ物。
import type { FxEvent } from '../sumoProtocol.ts';
import { FX, FX_INDEX } from './fxTable.ts';
import type { FxTarget } from './fxTable.ts';

/** 同じ演出が1回の送信にたまる上限(連続して出るものでメッセージが膨らまないように)と、全体の上限 */
const MAX_PER_KIND = 4;
const MAX_EVENTS = 24;

const round = (v: number) => Math.round(v * 100) / 100;

export class FxBus {
  private events: FxEvent[] = [];

  /** 演出を1件出す。座標(v)は x,y,z の3つの数として、そのまま並べて渡す。 */
  public push(target: FxTarget, name: string, ...args: (number | string | boolean)[]): void {
    const id = FX_INDEX.get(`${target}.${name}`);
    if (id === undefined) return;
    const ev: FxEvent = [id];
    let k = 0;
    for (const c of FX[id].sig) {
      if (c === 'v') {
        ev.push(round(Number(args[k++])), round(Number(args[k++])), round(Number(args[k++])));
      } else {
        const a = args[k++];
        if (c === 'n') ev.push(round(typeof a === 'number' ? a : 0));
        else if (c === 's') ev.push(typeof a === 'string' ? a.slice(0, 24) : '');
        else ev.push(!!a);
      }
    }
    this.events.push(ev);
  }

  public sound(name: string, ...args: (number | string | boolean)[]): void {
    this.push('sound', name, ...args);
  }

  public particle(name: string, ...args: (number | string | boolean)[]): void {
    this.push('particle', name, ...args);
  }

  /** たまった演出を取り出す(種類ごとの上限と全体の上限をかける)。 */
  public take(): FxEvent[] {
    const out: FxEvent[] = [];
    const counts = new Map<number, number>();
    for (const e of this.events) {
      const id = e[0] as number;
      const c = (counts.get(id) ?? 0) + 1;
      counts.set(id, c);
      if (c <= MAX_PER_KIND && out.length < MAX_EVENTS) out.push(e);
    }
    this.events = [];
    return out;
  }

  public clear(): void {
    this.events = [];
  }
}
