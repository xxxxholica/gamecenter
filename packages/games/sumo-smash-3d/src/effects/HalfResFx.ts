import * as THREE from 'three';
import { FX_LAYER, type ExplosionFx } from './ExplosionFx';

const COMPOSITE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// 描画先には「粒を重ねた色(不透明度を掛けたもの)」と「後ろを隠す割合」が入っているので、そのまま上に重ねる
const COMPOSITE_FRAG = /* glsl */ `
  uniform sampler2D uFx;
  varying vec2 vUv;
  void main() {
    gl_FragColor = texture2D(uFx, vUv);
  }
`;

/**
 * 爆発の炎・煙・火花(ExplosionFx の粒)を、画面の半分の解像度で描いてから画面に重ねる。
 * 場外の大爆発では、大きな半透明の板が画面全体を何十枚も覆い、フルHDでは塗りつぶしだけで1フレーム(16.7ms)を超える。
 * 炎や煙はぼやけた絵なので、半分の解像度でも見た目はほとんど変わらず、塗る量は 1/4 になる。
 *
 * 1. 本番の描画: 粒(FX_LAYER)を除いて、ふつうに画面へ描く
 * 2. 半分の解像度の描画先に、土俵・力士・客席の奥行きだけを描く(粒が物の後ろに隠れるように。半透明の物は粒を隠さないので描かない)
 * 3. 同じ描画先に粒を描く(画面に直接描いていた時と同じ重ね方。加算の粒は後ろを隠さない)
 * 4. 描画先を画面に重ねる
 * 粒がひとつも無い間は 2〜4 を省く。
 */
export class HalfResFx {
  private readonly target = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: true });
  private readonly depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly size = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();
  private readonly hidden: THREE.Object3D[] = [];

  constructor(private readonly fx: ExplosionFx) {
    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        uniforms: { uFx: { value: this.target.texture } },
        vertexShader: COMPOSITE_VERT,
        fragmentShader: COMPOSITE_FRAG,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        blendSrcAlpha: THREE.OneFactor,
        blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      }),
    );
    quad.frustumCulled = false;
    this.compositeScene.add(quad);
  }

  /** 1フレームを描く。force: 粒が無くても 2〜4 を通す(起動時にシェーダを作っておくため) */
  public render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, force = false): void {
    camera.layers.disable(FX_LAYER);
    renderer.render(scene, camera);
    const restoreVisible = force ? this.fx.forceVisible() : null;
    if (force || this.fx.hasVisibleBatch()) this.renderFx(renderer, scene, camera);
    restoreVisible?.();
  }

  private renderFx(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(this.size.x / 2));
    const h = Math.max(1, Math.round(this.size.y / 2));
    if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    this.fx.exposure.value = renderer.toneMappingExposure;

    const background = scene.background;
    const autoClear = renderer.autoClear;
    const shadowAuto = renderer.shadowMap.autoUpdate;
    const clearAlpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clearColor);
    try {
      scene.background = null;
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;   // 影は本番の描画で作ったものを使う(描き直さない)
      renderer.setRenderTarget(this.target);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, false);

      // 奥行きだけ(色は書かない)
      this.hideTransparent(scene);
      scene.overrideMaterial = this.depthOnly;
      renderer.render(scene, camera);
      scene.overrideMaterial = null;
      this.restoreHidden();

      // 粒だけ
      camera.layers.set(FX_LAYER);
      renderer.render(scene, camera);
      camera.layers.set(0);

      renderer.setRenderTarget(null);
      renderer.render(this.compositeScene, this.compositeCamera);
    } finally {
      this.restoreHidden();
      scene.overrideMaterial = null;
      camera.layers.set(0);
      renderer.setRenderTarget(null);
      scene.background = background;
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.setClearColor(this.clearColor, clearAlpha);
    }
  }

  private hideTransparent(scene: THREE.Scene): void {
    scene.traverseVisible((obj) => {
      const mat = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      if (Array.isArray(mat) ? mat.some((m) => m.transparent) : mat.transparent) this.hidden.push(obj);
    });
    for (const obj of this.hidden) obj.visible = false;
  }

  private restoreHidden(): void {
    for (const obj of this.hidden) obj.visible = true;
    this.hidden.length = 0;
  }
}
