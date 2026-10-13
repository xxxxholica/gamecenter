import * as THREE from 'three';

/** 板ポリの粒1つぶん。毎フレームの動きは、プールを使う側(step)が書き換える。 */
export interface Particle {
  active: boolean;
  age: number;
  maxAge: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** 画面に対する大きさ(横・縦) */
  sx: number;
  sy: number;
  /** 画面上での回転(rad)。細長い粒の向きに使う */
  angle: number;
  alpha: number;
  /** 動きの計算に使う、粒ごとの値(開始の大きさ・終わりの大きさ・開始の濃さなど) */
  s0: number;
  s1: number;
  o0: number;
  r: number;
  g: number;
  b: number;
}

/**
 * 同じ見た目の粒を、1回の描画(InstancedMesh)でまとめて出す。粒ごとの濃さ(alpha)と色味を持てる。
 * 粒を1つずつメッシュにすると、粒の数だけ描画が増えるので、煙・火花・水の粒・炎はこれで描く。
 */
export class BillboardPool {
  public readonly mesh: THREE.InstancedMesh;
  public readonly particles: Particle[] = [];
  private readonly alphaAttr: THREE.InstancedBufferAttribute;
  private cursor = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly qr = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private static readonly Z = new THREE.Vector3(0, 0, 1);

  constructor(size: number, texture: THREE.Texture, geometry: THREE.PlaneGeometry, opts: { additive: boolean; fog?: boolean; color?: number }) {
    const mat = new THREE.MeshBasicMaterial({
      map: texture,
      color: opts.color ?? 0xffffff,
      transparent: true,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: THREE.DoubleSide,
      fog: opts.fog ?? true,
    });
    // 粒ごとの濃さ(alpha)を、頂点→フラグメントへ渡して掛ける
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aAlpha;\nvarying float vAlpha;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlpha = aAlpha;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vAlpha;');
    };
    const geo = geometry.clone();                                // aAlpha はこのプール専用なので、形は複製して持つ
    this.mesh = new THREE.InstancedMesh(geo, mat, size);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, this.color.setRGB(1, 1, 1));
    (this.mesh.instanceColor as THREE.InstancedBufferAttribute).setUsage(THREE.DynamicDrawUsage);
    this.alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(size), 1);
    this.alphaAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aAlpha', this.alphaAttr);
    for (let i = 0; i < size; i++) {
      this.particles.push({ active: false, age: 0, maxAge: 1, pos: new THREE.Vector3(), vel: new THREE.Vector3(), sx: 1, sy: 1, angle: 0, alpha: 0, s0: 1, s1: 1, o0: 1, r: 1, g: 1, b: 1 });
    }
  }

  /** 空いている粒を1つ取り出す(なければ null)。age・色味は初期化される。 */
  public spawn(): Particle | null {
    const n = this.particles.length;
    for (let k = 0; k < n; k++) {
      const p = this.particles[(this.cursor + k) % n];
      if (!p.active) {
        this.cursor = (this.cursor + k + 1) % n;
        p.active = true;
        p.age = 0;
        p.angle = 0;
        p.r = p.g = p.b = 1;
        return p;
      }
    }
    return null;
  }

  /**
   * 生きている粒を進めて、描画用の行列・濃さ・色を書き出す。
   * step は1粒を1フレーム進め、まだ生きていれば true を返す(false で消える)。
   */
  public update(dt: number, camQuat: THREE.Quaternion, step: (p: Particle, dt: number) => boolean): void {
    let k = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.age += dt;
      if (p.age >= p.maxAge || !step(p, dt)) { p.active = false; continue; }
      this.q.copy(camQuat);
      if (p.angle !== 0) this.q.multiply(this.qr.setFromAxisAngle(BillboardPool.Z, p.angle));
      this.m.compose(p.pos, this.q, this.s.set(p.sx, p.sy, 1));
      this.mesh.setMatrixAt(k, this.m);
      this.mesh.setColorAt(k, this.color.setRGB(p.r, p.g, p.b));
      this.alphaAttr.setX(k, p.alpha);
      k++;
    }
    this.mesh.count = k;
    this.mesh.visible = k > 0;
    if (k > 0) {
      this.mesh.instanceMatrix.needsUpdate = true;
      (this.mesh.instanceColor as THREE.InstancedBufferAttribute).needsUpdate = true;
      this.alphaAttr.needsUpdate = true;
    }
  }

  public reset(): void {
    for (const p of this.particles) p.active = false;
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}
