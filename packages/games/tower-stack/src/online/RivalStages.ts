// オンライン対戦で、相手のステージ(土台とタワー)を自分のステージの横に並べて3Dで描く。
// 相手のタワーは、サーバーが約10Hzで配る様子(ブロックの種類・位置・角度)から作り、届いた位置へなめらかに寄せる。
// 物理は動かさない(見た目だけ)。自分のステージは原点、相手は参加の番号の順に左右へ STAGE_SPACING ずつずらして置く。
import * as THREE from 'three';
import type { TowerState } from '../../../../shared/towerProtocol';
import { PIECES } from '../pieces';
import { PLAYER_COLORS } from './net';

/** ステージどうしの間隔(m)。土台の幅 + すき間 */
export const STAGE_SPACING = 16;

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
  label: Label;
  state: TowerState;
  out: boolean;
  gone: boolean;
  grey: boolean;
  flash: number;
}

/** ステージの下に出す名札(名前・高さ・残機)。内容が変わったときだけ描き直す */
class Label {
  readonly sprite: THREE.Sprite;
  private readonly canvas: HTMLCanvasElement;
  private readonly tex: THREE.CanvasTexture;
  private last = '';

  constructor(private readonly color: string) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, fog: false }));
    this.sprite.scale.set(10, 2.5, 1);
    this.sprite.renderOrder = 10;
  }

  draw(name: string, h: number, lives: number, status: string, flash: boolean): void {
    const key = `${name}|${h.toFixed(1)}|${lives}|${status}|${flash}`;
    if (key === this.last) return;
    this.last = key;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, 512, 128);
    g.fillStyle = flash ? 'rgba(230, 57, 70, 0.92)' : 'rgba(8, 8, 14, 0.82)';
    g.beginPath();
    g.roundRect(8, 8, 496, 112, 22);
    g.fill();
    g.fillStyle = this.color;
    g.fillRect(8, 8, 14, 112);
    g.font = '800 36px system-ui, "Hiragino Kaku Gothic ProN", sans-serif';
    g.fillStyle = this.color;
    g.textBaseline = 'middle';
    g.fillText(name, 40, 42, 300);
    g.font = '900 44px Impact, "Arial Black", system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.textAlign = 'right';
    g.fillText(`${h.toFixed(1)}m`, 488, 44);
    g.textAlign = 'left';
    if (status) {
      g.font = '900 34px system-ui, "Hiragino Kaku Gothic ProN", sans-serif';
      g.fillStyle = '#ff8a93';
      g.fillText(status, 40, 92);
    } else {
      // 残機はハート(ブロックの色の四角と見分けがつくように)
      g.font = '900 34px system-ui, "Hiragino Kaku Gothic ProN", sans-serif';
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < lives ? '#ff4d6d' : 'rgba(255,255,255,0.22)';
        g.fillText('♥', 40 + i * 40, 94);
      }
    }
    this.tex.needsUpdate = true;
  }

  dispose(): void {
    this.tex.dispose();
    (this.sprite.material as THREE.SpriteMaterial).dispose();
  }
}

export interface RivalStagesOptions {
  /** 土台(と支柱)の見た目を新しく作る */
  makePlatform: () => THREE.Object3D;
  /** 爆発の演出 */
  explode: (x: number, y: number, color: number, power: number) => void;
}

export class RivalStages {
  private stages: Stage[] = [];
  private mine: { label: Label; name: string } | null = null;

  constructor(private readonly scene: THREE.Scene, private readonly opts: RivalStagesOptions) {}

  /** ステージを並べる。players は参加の番号順(index が色)。自分は原点、相手は番号の差 × 間隔の位置 */
  public setup(players: { id: number; name: string }[], myId: number): void {
    this.clear();
    const myIndex = Math.max(0, players.findIndex((p) => p.id === myId));
    players.forEach((p, index) => {
      const color = PLAYER_COLORS[index % PLAYER_COLORS.length];
      if (p.id === myId) {
        const label = new Label(color);
        label.sprite.position.set(0, -2.2, 1.5);
        this.scene.add(label.sprite);
        this.mine = { label, name: `${p.name}（あなた）` };
        return;
      }
      const offset = (index - myIndex) * STAGE_SPACING;
      const root = new THREE.Group();
      root.position.x = offset;
      const platform = this.opts.makePlatform();
      root.add(platform);
      this.scene.add(root);
      const label = new Label(color);
      label.sprite.position.set(offset, -2.2, 1.5);
      this.scene.add(label.sprite);
      this.stages.push({
        id: p.id, name: p.name, index, offset, root, ghosts: [], label,
        state: { h: 0, b: 0, d: 0, lv: 1, k: [] }, out: false, gone: false, grey: false, flash: 0,
      });
    });
  }

  /** 並んだステージ全体の幅の中心(自分のステージからの距離) と ステージの数 */
  public layout(): { center: number; count: number } | null {
    if (!this.mine) return null;
    const offsets = [0, ...this.stages.map((s) => s.offset)];
    return { center: (Math.min(...offsets) + Math.max(...offsets)) / 2, count: offsets.length };
  }

  /** 相手のタワーのいまの高さの最大(カメラの高さ合わせに使う) */
  public maxHeight(): number {
    let h = 0;
    for (const s of this.stages) if (!s.out && !s.gone) h = Math.max(h, s.state.h);
    return h;
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

  /** 毎フレーム: 届いた位置へ寄せる・名札を描く */
  public tick(dt: number, mine: { h: number; drops: number; out: boolean }): void {
    const k = Math.min(1, dt * 14);
    for (const s of this.stages) {
      for (const g of s.ghosts) {
        g.obj.position.x += (g.x - g.obj.position.x) * k;
        g.obj.position.y += (g.y - g.obj.position.y) * k;
        g.obj.rotation.z += (g.a - g.obj.rotation.z) * k;
      }
      s.flash = Math.max(0, s.flash - dt);
      const status = s.gone ? '退出' : s.out ? '脱落' : '';
      s.label.draw(s.name, s.state.h, 3 - s.state.d, status, s.flash > 0);
    }
    if (this.mine) this.mine.label.draw(this.mine.name, mine.h, 3 - mine.drops, mine.out ? '脱落' : '', false);
  }

  public clear(): void {
    for (const s of this.stages) {
      for (const g of s.ghosts) disposeObject(g.obj);
      this.scene.remove(s.root);
      this.scene.remove(s.label.sprite);
      s.label.dispose();
    }
    this.stages = [];
    if (this.mine) {
      this.scene.remove(this.mine.label.sprite);
      this.mine.label.dispose();
      this.mine = null;
    }
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
