// 最高到達の高さを示す「点線 + 黒いブロック」。ひとりで遊ぶとき・対戦の自分と相手のステージで共通。
// 点線は高さに合わせて引き、ブロック(高さの数字)は線の中心に重ねて、他のブロックより手前に出す。
import * as THREE from 'three';

export interface BestMarkerOptions {
  /** 線とブロックの色の味付け(線の色)。自分は黒、相手は参加者の色 */
  color: string;
  /** 点線の幅(m) */
  width: number;
  /** ブロックの中心のX(m)。ステージの左端あたり */
  tagX: number;
  /** ブロックの色(誰の記録か)。省略すると黒いブロック */
  stripe?: string;
  /** 奥行き。透視で縦がずれないよう、線とブロックは同じ奥行きに置く */
  z?: number;
}

const DASH = 0.9; // 点線ひと組の長さ(m)

export class BestMarker {
  readonly group = new THREE.Group();
  private readonly line: THREE.Mesh;
  private readonly lineTex: THREE.CanvasTexture;
  private readonly tag: THREE.Mesh;
  private readonly tagCanvas: HTMLCanvasElement;
  private readonly tagTex: THREE.CanvasTexture;
  private shown = 0;
  private text = '';

  constructor(private readonly opts: BestMarkerOptions) {
    const z = opts.z ?? -0.7;
    // 点線の模様(白の点線を、線の色で塗る)
    const dash = document.createElement('canvas');
    dash.width = 32;
    dash.height = 4;
    const g = dash.getContext('2d')!;
    g.fillStyle = '#fff';
    g.fillRect(0, 0, 18, 4);
    this.lineTex = new THREE.CanvasTexture(dash);
    this.lineTex.wrapS = THREE.RepeatWrapping;
    this.lineTex.magFilter = THREE.NearestFilter;
    this.line = new THREE.Mesh(
      new THREE.PlaneGeometry(opts.width, 0.1),
      new THREE.MeshBasicMaterial({ color: opts.color, map: this.lineTex, transparent: true }),
    );
    this.line.position.z = z;
    this.setWidth(opts.width);

    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 160;
    this.tagCanvas.height = 56;
    this.tagTex = new THREE.CanvasTexture(this.tagCanvas);
    this.tagTex.colorSpace = THREE.SRGBColorSpace;
    this.tag = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 0.63),
      new THREE.MeshBasicMaterial({ map: this.tagTex, transparent: true, depthTest: false, depthWrite: false, fog: false }),
    );
    this.tag.position.set(opts.tagX, 0, z);
    this.tag.renderOrder = 10;
    this.group.add(this.line, this.tag);
    this.group.visible = false;
  }

  /** 線の色とブロックの帯の色を変える(対戦では自分の色、ひとりのときは黒)。変わらなければ何もしない */
  setColor(color: string, stripe?: string): void {
    if (color === this.opts.color && stripe === this.opts.stripe) return;
    this.opts.color = color;
    this.opts.stripe = stripe;
    (this.line.material as THREE.MeshBasicMaterial).color.set(color);
    this.text = ''; // ブロックを描き直す
  }

  /** ブロックの左右の位置を変える(対戦では、右に表示されるステージは右、左は左に出す) */
  setTagX(x: number): void {
    this.tag.position.x = x;
  }

  /** 点線の幅を変える(対戦ではステージの幅に合わせる) */
  setWidth(width: number): void {
    this.line.geometry.dispose();
    this.line.geometry = new THREE.PlaneGeometry(width, 0.1);
    this.lineTex.repeat.set(width / DASH, 1);
  }

  hide(): void {
    this.group.visible = false;
    this.shown = 0;
  }

  /** 記録(m)に向かって線とブロックをなめらかに動かす。0 以下なら隠す。出てきた瞬間はその位置に置く */
  update(best: number, dt: number): void {
    if (best <= 0) {
      this.hide();
      return;
    }
    if (this.shown === 0) this.shown = best;
    else this.shown += (best - this.shown) * Math.min(1, dt * 8);
    this.group.visible = true;
    this.line.position.y = this.shown;
    this.tag.position.y = this.shown; // 線の中心に合わせる
    const text = `${best.toFixed(1)}m`;
    if (text !== this.text) this.drawTag(text);
  }

  private drawTag(text: string): void {
    this.text = text;
    const g = this.tagCanvas.getContext('2d')!;
    // 対戦では、線につながるブロックをプレイヤーの色にする(白い文字)。ひとりのときは黒いブロックに白文字
    const color = this.opts.stripe;
    g.fillStyle = color ?? '#000';
    g.fillRect(0, 0, 160, 56);
    g.font = '900 34px "Hiragino Kaku Gothic StdN", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, sans-serif';
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 80, 30);
    this.tagTex.needsUpdate = true;
  }

  dispose(): void {
    this.line.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    this.lineTex.dispose();
    this.tag.geometry.dispose();
    (this.tag.material as THREE.Material).dispose();
    this.tagTex.dispose();
  }
}
