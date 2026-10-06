import * as THREE from 'three';

/**
 * 右壁(x=planeX)のドアガラスに映る、廊下の中の本物の反射(平面反射)。
 * 壁に対して鏡像の位置にカメラを置いてシーンをもう一度描き、その絵をガラスに半透明で貼る。
 * 左の窓・夕焼けの空・蛍光灯・障害物・コインがそのまま映る。
 * ガラスはどれも同じ平面(x=planeX)にあるので、描画は1フレームに1回で済む。
 * 角度が浅いほど(廊下の奥を見るほど)強く映る(フレネル)。
 */
export class GlassReflection {
  public readonly material: THREE.ShaderMaterial;

  private readonly renderTarget: THREE.WebGLRenderTarget;
  private readonly virtualCamera = new THREE.PerspectiveCamera();
  private readonly textureMatrix = new THREE.Matrix4();
  private readonly normal = new THREE.Vector3(-1, 0, 0); // 廊下の内側を向く
  private readonly planePos: THREE.Vector3;
  private readonly glassMeshes: THREE.Mesh[] = [];
  private readonly resolutionScale: number;

  // 毎フレーム使い回す一時オブジェクト
  private readonly camPos = new THREE.Vector3();
  private readonly view = new THREE.Vector3();
  private readonly target = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();
  private readonly rotation = new THREE.Matrix4();
  private readonly plane = new THREE.Plane();
  private readonly clipPlane = new THREE.Vector4();
  private readonly q = new THREE.Vector4();

  constructor(planeX: number, resolutionScale = 0.5) {
    this.planePos = new THREE.Vector3(planeX, 0, 0);
    this.resolutionScale = resolutionScale;
    this.renderTarget = new THREE.WebGLRenderTarget(512, 512, { type: THREE.HalfFloatType });

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.renderTarget.texture },
        textureMatrix: { value: this.textureMatrix },
        baseAlpha: { value: 0.3 },
        tint: { value: new THREE.Color(1.0, 0.96, 0.9) },
      },
      vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        #include <clipping_planes_pars_vertex>
        varying vec4 vUv;
        varying vec3 vWorldPos;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorldPos = world.xyz;
          vUv = textureMatrix * world;
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          #include <clipping_planes_vertex>
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform float baseAlpha;
        uniform vec3 tint;
        #include <clipping_planes_pars_fragment>
        varying vec4 vUv;
        varying vec3 vWorldPos;
        void main() {
          #include <clipping_planes_fragment>
          vec3 refl = texture2DProj(tDiffuse, vUv).rgb * tint;
          float facing = abs(normalize(cameraPosition - vWorldPos).x);   // 壁の法線は±x
          float fresnel = pow(1.0 - facing, 2.5);
          float alpha = clamp(baseAlpha + 0.65 * fresnel, 0.0, 0.95);
          gl_FragColor = vec4(refl, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      clipping: true, // クリア演出で廊下を出口で切り落とすとき、ガラスも一緒に切る
    });
  }

  /** 反射を映すガラスのメッシュを登録する(反射の描画中は自分自身が映らないよう隠す) */
  public addGlass(mesh: THREE.Mesh): void {
    this.glassMeshes.push(mesh);
  }

  public render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    camera.updateMatrixWorld();
    this.camPos.setFromMatrixPosition(camera.matrixWorld);
    this.view.subVectors(this.planePos, this.camPos);
    if (this.view.dot(this.normal) > 0) return; // カメラが壁の裏側にいる

    // 壁に対して鏡像の位置・向きにカメラを置く
    this.view.reflect(this.normal).negate().add(this.planePos);
    this.rotation.extractRotation(camera.matrixWorld);
    this.lookAt.set(0, 0, -1).applyMatrix4(this.rotation).add(this.camPos);
    this.target.subVectors(this.planePos, this.lookAt).reflect(this.normal).negate().add(this.planePos);

    const vc = this.virtualCamera;
    vc.position.copy(this.view);
    vc.up.set(0, 1, 0).applyMatrix4(this.rotation).reflect(this.normal);
    vc.lookAt(this.target);
    vc.far = camera.far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy(camera.projectionMatrix);

    // ワールド座標 → 反射テクスチャのUV
    this.textureMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    this.textureMatrix.multiply(vc.projectionMatrix);
    this.textureMatrix.multiply(vc.matrixWorldInverse);

    // 壁より向こう側(教室・屋外)は映さないよう、近クリップ面を壁に斜めに合わせる
    this.plane.setFromNormalAndCoplanarPoint(this.normal, this.planePos);
    this.plane.applyMatrix4(vc.matrixWorldInverse);
    this.clipPlane.set(this.plane.normal.x, this.plane.normal.y, this.plane.normal.z, this.plane.constant);
    const e = vc.projectionMatrix.elements;
    this.q.x = (Math.sign(this.clipPlane.x) + e[8]) / e[0];
    this.q.y = (Math.sign(this.clipPlane.y) + e[9]) / e[5];
    this.q.z = -1.0;
    this.q.w = (1.0 + e[10]) / e[14];
    this.clipPlane.multiplyScalar(2.0 / this.clipPlane.dot(this.q));
    e[2] = this.clipPlane.x;
    e[6] = this.clipPlane.y;
    e[10] = this.clipPlane.z + 1.0 - 0.003;
    e[14] = this.clipPlane.w;

    // 画面の解像度に合わせて反射の解像度を更新
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(1, Math.floor(size.x * this.resolutionScale));
    const h = Math.max(1, Math.floor(size.y * this.resolutionScale));
    if (this.renderTarget.width !== w || this.renderTarget.height !== h) this.renderTarget.setSize(w, h);

    const prevTarget = renderer.getRenderTarget();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    for (const m of this.glassMeshes) m.visible = false;

    renderer.setRenderTarget(this.renderTarget);
    renderer.clear();
    renderer.render(scene, vc);

    for (const m of this.glassMeshes) m.visible = true;
    renderer.shadowMap.autoUpdate = prevShadow;
    renderer.setRenderTarget(prevTarget);
  }
}
