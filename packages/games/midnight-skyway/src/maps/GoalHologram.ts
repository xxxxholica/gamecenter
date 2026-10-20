import * as THREE from 'three';
import { untrackedRandom as rand } from '../../../../shared/arcadeReplay';

/** 砕けた旗の破片が消えるまで(秒) */
const SHARD_LIFE = 2.6;

/** Black and white chequered texture (crisp squares), `cols` x `rows` cells. */
function chequer(cols: number, rows: number): THREE.CanvasTexture {
  const cell = 32, c = document.createElement('canvas');
  c.width = cols * cell;
  c.height = rows * cell;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    g.fillStyle = (x + y) % 2 === 0 ? '#ffffff' : '#0a0a0a';
    g.fillRect(x * cell, y * cell, cell, cell);
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearFilter;
  t.generateMipmaps = false;
  return t;
}

/** "No entry" board: hazard stripes above and below a red panel with 立入禁止. */
function noEntry(aspect: number): THREE.CanvasTexture {
  const w = 1024, h = Math.round(w / aspect), c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#121212';
  g.fillRect(0, 0, w, h);
  const band = h * 0.24;
  const stripes = (y0: number): void => {
    g.save();
    g.beginPath();
    g.rect(0, y0, w, band);
    g.clip();
    g.fillStyle = '#ffcc00';
    const step = band * 1.1;
    for (let x = -band * 2; x < w + band * 2; x += step * 2) {
      g.beginPath();
      g.moveTo(x, y0 + band);
      g.lineTo(x + step, y0 + band);
      g.lineTo(x + step + band, y0);
      g.lineTo(x + band, y0);
      g.closePath();
      g.fill();
    }
    g.restore();
  };
  stripes(0);
  stripes(h - band);
  g.fillStyle = '#c4001a';
  g.fillRect(0, band, w, h - band * 2);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = `900 ${Math.round(h * 0.34)}px sans-serif`;
  g.fillText('立入禁止', w / 2, h * 0.47);
  g.font = `900 ${Math.round(h * 0.11)}px sans-serif`;
  g.fillText('DO NOT ENTER', w / 2, h * 0.68);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

/**
 * Goal gate drawn as a hologram: a chequered flag hung across the whole road (deck to top bar), two light posts, a top bar and a
 * chequered strip on the deck. The flag ripples a little. It fades in / out (setVisible) so it is not there at the start.
 * The flag is single-sided. Seen from behind (the far side of the gate, where the car cannot cross back) there is a solid
 * "no entry" board instead; it and the frame are always there, only the flag and the strip fade in.
 * At the goal the flag shatters (burst): one shard per chequer cell flies off along the car's way and shrinks away.
 */
export class GoalHologram {
  public readonly group = new THREE.Group();
  private readonly mats: { mat: THREE.Material & { opacity: number }; base: number; flicker: boolean; fade: boolean }[] = [];
  private readonly textures: THREE.Texture[] = [];
  private readonly flagGeo: THREE.PlaneGeometry;
  private readonly flagRest: Float32Array;
  private readonly flag: THREE.Mesh;
  private readonly strip: THREE.Mesh;
  private readonly board: THREE.Mesh;
  private alpha = 0;
  private target = 0;
  private t = 0;
  /** 旗の破片: マスごとに1枚。出ていない間は大きさ0で置いておく(シェーダは最初から用意される) */
  private readonly shards: THREE.InstancedMesh;
  private readonly shardState: { home: THREE.Vector3; p: THREE.Vector3; v: THREE.Vector3; rot: THREE.Euler; spin: THREE.Vector3 }[] = [];
  private shardAge = -1;
  private readonly dummy = new THREE.Object3D();

  /**
   * @param pos     centre of the road at the gate
   * @param heading direction of travel (radians, atan2(dx, dz)) at the gate
   * @param width   deck width
   */
  constructor(pos: THREE.Vector3, heading: number, width: number) {
    const H = 7;                                             // height of the gate
    const make = <T extends THREE.Material & { opacity: number }>(m: T, base: number, flicker = true, fade = true): T => { m.opacity = fade ? 0 : base; this.mats.push({ mat: m, base, flicker, fade }); return m; };
    const glow = (color: number): THREE.MeshBasicMaterial => make(new THREE.MeshBasicMaterial({ color, transparent: true, fog: false, blending: THREE.AdditiveBlending, depthWrite: false }), 0.9, false, false);

    // the flag: one square per metre, an even number of columns across the deck
    const cols = Math.max(2, 2 * Math.round(width / 2)), rows = Math.round(H);
    const flagTex = chequer(cols, rows);
    this.textures.push(flagTex);
    this.flagGeo = new THREE.PlaneGeometry(width, H, cols * 2, rows * 2);
    this.flagRest = (this.flagGeo.attributes.position.array as Float32Array).slice();
    const flag = this.flag = new THREE.Mesh(this.flagGeo, make(new THREE.MeshBasicMaterial({ map: flagTex, transparent: true, fog: false, depthWrite: false, side: THREE.FrontSide }), 0.62, false));
    flag.position.set(0, H / 2 + 0.1, 0);
    flag.rotation.y = Math.PI;                               // PlaneGeometry faces +Z; the oncoming cars come from -Z (local)

    const post = new THREE.BoxGeometry(0.4, H + 0.4, 0.4);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(post, glow(0xffffff));
      p.position.set(sx * (width / 2 + 0.3), (H + 0.4) / 2, 0);
      this.group.add(p);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(width + 1.0, 0.45, 0.45), glow(0xffffff));
    bar.position.set(0, H + 0.25, 0);

    const stripTex = chequer(cols, 2);
    this.textures.push(stripTex);
    const strip = this.strip = new THREE.Mesh(new THREE.PlaneGeometry(width, 2), make(new THREE.MeshBasicMaterial({ map: stripTex, transparent: true, fog: false, depthWrite: false }), 0.75, false));
    strip.rotation.x = -Math.PI / 2;
    strip.position.set(0, 0.05, 0);

    // far side: solid no-entry board, a little behind the flag's ripple
    const boardTex = noEntry(width / H);
    this.textures.push(boardTex);
    const board = this.board = new THREE.Mesh(new THREE.PlaneGeometry(width, H), make(new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, fog: false, side: THREE.FrontSide }), 0.92, false, false));
    board.position.set(0, H / 2 + 0.1, 0.6);
    this.group.add(flag, bar, strip, board);

    // shards: the flag's cells, white and black
    const cellW = width / cols, cellH = H / rows;
    this.shards = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(cellW * 0.92, cellH * 0.92),
      new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false, toneMapped: false }),
      cols * rows,
    );
    const white = new THREE.Color(0.95, 0.95, 0.95), dark = new THREE.Color(0.04, 0.05, 0.07);   // 白を光らせると、たくさん舞ったときに画面が白く霞む
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const k = y * cols + x;
      this.shards.setColorAt(k, (x + y) % 2 === 0 ? white : dark);
      this.shardState.push({
        home: new THREE.Vector3(-width / 2 + (x + 0.5) * cellW, H + 0.1 - (y + 0.5) * cellH, 0),
        p: new THREE.Vector3(), v: new THREE.Vector3(), rot: new THREE.Euler(), spin: new THREE.Vector3(),
      });
    }
    this.hideShards();
    this.shards.frustumCulled = false;
    this.group.add(this.shards);

    this.group.position.copy(pos);
    this.group.rotation.y = heading;                          // local +Z = direction of travel
  }

  public setVisible(on: boolean): void {
    this.target = on ? 1 : 0;
  }

  /** レースの準備: 砕けた旗の破片を片付け、逆走止めの看板を戻す */
  public reset(): void {
    this.hideShards();
    this.board.visible = true;
  }

  /** ゴール: 旗が砕けて、車の進む向きへ飛び散る。carVel は車の速度(m/s、ワールド) */
  public burst(carVel: THREE.Vector3): void {
    const local = carVel.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, -this.group.rotation.y);   // ゲートの向き(+Z が進行方向)へ
    for (const s of this.shardState) {
      s.p.copy(s.home);
      // 前へは控えめに(ゴールのカメラはゲートの少し先にいる。破片が画面を覆わないよう)、上と横へ大きく散る
      s.v.set(
        local.x * 0.2 + s.home.x * 1.1 + (rand() - 0.5) * 6,
        3 + rand() * 7,
        local.z * 0.15 + 1 + rand() * 4,
      );
      s.rot.set(0, 0, 0);
      s.spin.set((rand() - 0.5) * 12, (rand() - 0.5) * 12, (rand() - 0.5) * 12);
    }
    this.shardAge = 0;
    this.alpha = 0;                                          // 旗はその瞬間に消える(破片に変わる)
    this.flag.visible = this.strip.visible = false;
    this.board.visible = false;                              // 逆走止めの「立入禁止」も、レースが終われば要らない(ウィニングランの画に映り込む)
  }

  private hideShards(): void {
    this.shardAge = -1;
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (let k = 0; k < this.shardState.length; k++) this.shards.setMatrixAt(k, this.dummy.matrix);
    this.shards.instanceMatrix.needsUpdate = true;
  }

  private updateShards(dt: number): void {
    this.shardAge += dt;
    if (this.shardAge >= SHARD_LIFE) { this.hideShards(); return; }
    const shrink = Math.min(1, Math.max(0, (SHARD_LIFE - this.shardAge) / (SHARD_LIFE * 0.45)));
    this.shardState.forEach((s, k) => {
      s.v.y -= 9.8 * dt;
      s.v.multiplyScalar(Math.exp(-0.6 * dt));               // 空気の抵抗: ひらひらと遅くなる
      s.p.addScaledVector(s.v, dt);
      s.rot.x += s.spin.x * dt; s.rot.y += s.spin.y * dt; s.rot.z += s.spin.z * dt;
      this.dummy.position.copy(s.p);
      this.dummy.rotation.copy(s.rot);
      this.dummy.scale.setScalar(shrink);
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(k, this.dummy.matrix);
    });
    this.shards.instanceMatrix.needsUpdate = true;
  }

  public update(dt: number): void {
    if (this.shardAge >= 0) this.updateShards(dt);
    this.alpha += (this.target - this.alpha) * Math.min(1, 3 * dt);
    this.t += dt;
    const shown = this.alpha > 0.01;
    this.flag.visible = this.strip.visible = shown;
    if (!shown) return;
    const flicker = 0.9 + 0.1 * Math.sin(this.t * 9) * Math.sin(this.t * 3.7);
    for (const { mat, base, flicker: f, fade } of this.mats) if (fade) mat.opacity = base * this.alpha * (f ? flicker : 1);
    // ripple the flag along its width (more towards the middle of the road, fixed at the posts)
    const pos = this.flagGeo.attributes.position, rest = this.flagRest, halfW = Math.abs(rest[0]) || 1;
    for (let i = 0; i < pos.count; i++) {
      const x = rest[i * 3], y = rest[i * 3 + 1];
      const edge = 1 - Math.min(1, Math.abs(x) / halfW);
      pos.setZ(i, Math.sin(x * 0.9 - this.t * 4 + y * 0.3) * 0.35 * Math.sqrt(edge));
    }
    pos.needsUpdate = true;
  }

  public dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.flagGeo.dispose();
    this.shards.geometry.dispose();
    (this.shards.material as THREE.Material).dispose();
  }
}
