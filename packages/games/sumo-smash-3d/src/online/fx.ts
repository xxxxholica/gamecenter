// 演出の再生。シミュレーション(サーバー、またはCPU対戦ではブラウザ内)が出した演出イベント(shared/sumoSim/fxTable.ts の表の番号+引数)を、
// 実際の SoundManager・ParticleManager・バナーなどの呼び出しに直す。表にない番号・型の合わない引数は捨てる(任意のメソッド呼び出しは受け付けない)。
import * as THREE from 'three';
import type { SoundManager } from '../audio/SoundManager';
import type { ParticleManager } from '../effects/ParticleManager';
import type { FxEvent } from '../../../../shared/sumoProtocol';
import { FX } from '../../../../shared/sumoSim/fxTable.ts';

export interface FxSink {
  sound: SoundManager;
  particle: ParticleManager;
  showBanner(main: string, sub: string, ms: number): void;
  blast(center: THREE.Vector3, audienceRadius: number): void;
}

export function replayFx(ev: FxEvent, sink: FxSink): void {
  const def = FX[ev[0] as number];
  if (!def) return;
  const args: unknown[] = [];
  let p = 1;
  for (const c of def.sig) {
    if (c === 'v') {
      const x = ev[p], y = ev[p + 1], z = ev[p + 2];
      if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return;
      args.push(new THREE.Vector3(x, y, z));
      p += 3;
    } else {
      const v = ev[p++];
      if (c === 'n' && typeof v !== 'number') return;
      if (c === 's' && typeof v !== 'string') return;
      if (c === 'b' && typeof v !== 'boolean') return;
      args.push(v);
    }
  }
  switch (def.target) {
    case 'sound':
      (sink.sound as unknown as Record<string, (...a: unknown[]) => void>)[def.name](...args);
      break;
    case 'particle':
      (sink.particle as unknown as Record<string, (...a: unknown[]) => void>)[def.name](...args);
      break;
    case 'ui':
      sink.showBanner(args[0] as string, args[1] as string, args[2] as number);
      break;
    case 'main':
      sink.blast(args[0] as THREE.Vector3, args[1] as number);
      break;
  }
}
