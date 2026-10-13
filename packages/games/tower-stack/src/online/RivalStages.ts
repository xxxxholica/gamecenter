// オンライン対戦で、相手のステージ(土台とタワー)を自分のステージの横に並べて3Dで描く。
// 相手のタワーは、サーバーが約10Hzで配る様子(ブロックの種類・位置・角度)から作り、届いた位置へなめらかに寄せる。
// 物理は動かさない(見た目だけ)。自分のステージは原点、相手は参加の番号の順に左右へ STAGE_SPACING ずつずらして置く。
import * as THREE from 'three';
import type { TowerState } from '../../../../shared/towerProtocol';
import { PIECES } from '../pieces';
import { PLAYER_COLORS } from './net';
import { BestMarker } from '../bestMarker';

/** ステージどうしの間隔(m)。土台の幅 + すき間 */
export const STAGE_SPACING = 16;
/** 最高到達のブロックを、2人の間に置くときの位置(自分のステージの中心から、相手側へ何m)。間(間隔の半分=8m)の中で、2人のブロックが重ならない位置 */
export const BETWEEN_TAG_X = 7;

interface Ghost {
  piece: number;
  obj: THREE.Group;
  x: number;
  y: number;
  a: number;
}

interface Stage {
  id: number;
  name: string;
  index: number;
  offset: number;
  root: THREE.Group;
  ghosts: Ghost[];
  color: string;
  marker: BestMarker;
  state: TowerState;
  out: boolean;
  gone: boolean;
  grey: boolean;
  flash: number;
}

export interface RivalStagesOptions {
  /** 土台(と支柱)の見た目を新しく作る */
  makePlatform: () => THREE.Object3D;
  /** 爆発の演出 */
  explode: (x: number, y: number, color: number, power: number) => void;
}

export class RivalStages {
  private stages: Stage[] = [];
  private mine: { name: string; color: string } | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly opts: RivalStagesOptions) {}

  /** ステージを並べる。players は参加の番号順(index が色)。自分は原点、相手は番号の差 × 間隔の位置 */
  public setup(players: { id: number; name: string }[], myId: number): void {
    this.clear();
    const myIndex = Math.max(0, players.findIndex((p) => p.id === myId));
    players.forEach((p, index) => {
      const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
      if (p.id === myId) {
        this.mine = { name: p.name, color };
        return;
      }
      const offset = (index - myIndex) * STAGE_SPACING;
      const root = new THREE.Group();
      root.position.x = offset;
      const platform = this.opts.makePlatform();
      root.add(platform);
      this.scene.add(root);
      // 相手の最高到達の点線とブロック(ステージの中。線は相手の色)
      const marker = new BestMarker({ color, width: 300, tagX: offset > 0 ? -BETWEEN_TAG_X : BETWEEN_TAG_X, stripe: color });
      root.add(marker.group);
      this.stages.push({
        id: p.id, name: p.name, index, offset, root, ghosts: [], color, marker,
        state: { h: 0, b: 0, d: 0, lv: 1, k: [], it: [], n: [], f: 0 }, out: false, gone: false, grey: false, flash: 0,
      });
    });
  }

  /** 並んだステージ全体の幅の中心(自分のステージからの距離) と ステージの数 */
  public layout(): { center: number; count: number } | null {
    if (!this.mine) return null;
    const offsets = [0, ...this.stages.map((s) => s.offset)];
    return { center: (Math.min(...offsets) + Math.max(...offsets)) / 2, count: offsets.length };
  }

  /** サーバーからの様子を反映する(落とした・脱落したら演出を出す) */
  public update(p: Record<number, TowerState & { out: boolean }>, gone: number[], camBottom: number): void {
    for (const s of this.stages) {
      if (gone.includes(s.id) && !s.gone) {
        s.gone = true;
        this.greyOut(s);
      }
      const st = p[s.id];
      if (!st) continue;
      if (st.d > s.state.d && !st.out) {
        this.opts.explode(s.offset, Math.max(camBottom + 2, -1), 0xffffff, 0.8);
      }
      if (st.out && !s.out) {
        s.out = true;
        this.opts.explode(s.offset, Math.max(camBottom + 2, s.state.h / 2), 0xffffff, 1.6);
        this.greyOut(s);
      }
      s.state = st;
      this.syncGhosts(s);
    }
  }

  /** おじゃまを受けた相手の名札を一瞬赤くする */
  public flash(id: number): void {
    const s = this.stages.find((x) => x.id === id);
    if (s) s.flash = 0.8;
  }

  /** 自分の名前と色(上部のHUDに出す) */
  public myInfo(): { name: string; color: string } | null {
    return this.mine;
  }

  /** 相手のステージごとの表示用の情報(上部のHUDを置く位置と中身) */
  public rivals(): { id: number; name: string; color: string; offset: number; drops: number; items: number[]; next: number[]; flags: number; out: boolean; gone: boolean; flash: boolean }[] {
    return this.stages.map((s) => ({
      id: s.id, name: s.name, color: s.color, offset: s.offset, drops: s.state.d, items: s.state.it ?? [], next: s.state.n ?? [], flags: s.state.f ?? 0,
      out: s.out, gone: s.gone, flash: s.flash > 0,
    }));
  }

  /** 毎フレーム: 届いた位置へ寄せる・最高到達の線を動かす */
  public tick(dt: number): void {
    const k = Math.min(1, dt * 14);
    for (const s of this.stages) {
      for (const g of s.ghosts) {
        g.obj.position.x += (g.x - g.obj.position.x) * k;
        g.obj.position.y += (g.y - g.obj.position.y) * k;
        g.obj.rotation.z += (g.a - g.obj.rotation.z) * k;
      }
      s.flash = Math.max(0, s.flash - dt);
      s.marker.update(s.state.b, dt);
    }
  }

  public clear(): void {
    for (const s of this.stages) {
      for (const g of s.ghosts) disposeObject(g.obj);
      this.scene.remove(s.root);
      s.marker.dispose();
    }
    this.stages = [];
    this.mine = null;
  }

  private syncGhosts(s: Stage): void {
    const list = s.state.k;
    // 並びの同じ位置で種類が違う・余ったものは作り直す/捨てる
    for (let i = 0; i < list.length; i++) {
      const [piece, x, y, a] = list[i];
      let g = s.ghosts[i];
      if (g && g.piece !== piece) {
        disposeObject(g.obj);
        s.root.remove(g.obj);
        g = undefined as unknown as Ghost;
      }
      if (!g) {
        const def = PIECES[piece];
        if (!def) continue;
        const obj = def.build(new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.35, metalness: 0.05 }));
        obj.position.set(x, y, 0);
        obj.rotation.z = a;
        s.root.add(obj);
        g = { piece, obj, x, y, a };
        s.ghosts[i] = g;
        if (s.grey) greyObject(obj);
      }
      g.x = x;
      g.y = y;
      g.a = a;
    }
    for (let i = list.length; i < s.ghosts.length; i++) {
      disposeObject(s.ghosts[i].obj);
      s.root.remove(s.ghosts[i].obj);
    }
    s.ghosts.length = Math.min(s.ghosts.length, list.length);
  }

  private greyOut(s: Stage): void {
    s.grey = true;
    for (const g of s.ghosts) greyObject(g.obj);
  }
}

const GREY = new THREE.Color(0x6b7280);
function greyObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    if (m && 'color' in m) {
      m.color.lerp(GREY, 0.75);
      if (m.emissive) m.emissiveIntensity = 0;
    }
  });
}

/** 相手のブロックの材質と、そのピースだけの形状を捨てる(使い回しの形状は残す) */
function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material;
    (Array.isArray(m) ? m : [m]).forEach((x) => x.dispose());
    if (!mesh.geometry.userData.shared) mesh.geometry.dispose();
  });
}
