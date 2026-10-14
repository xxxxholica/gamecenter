import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { NightCity } from './NightCity';
import { RainSystem } from './RainSystem';
import { Lightning } from './Lightning';
import { PostFX } from './PostFX';
import { TireSmokeSystem } from './TireSmokeSystem';
import { carByGroup } from '../models/CarBase';
import { DragonCarModel } from '../models/DragonCarModel';

/** 背景が後ろへ流れる速さ(m/s)。約110km/h */
const CRUISE_SPEED = 30;
/** タイヤの回る速さ(rad/s)。実際の速さ(約90rad/s)だと、コマ送りで逆回りに見えるので、見映えのよい速さにする */
const WHEEL_SPIN = 26;

/**
 * タイトル〜出走前のメニューの背景。車は原点に止まり、夜の雨の東京の高架(NightCity)が後ろへ流れて、
 * 走っているように見せる。路面の反射・ブルーム・雨・稲光はレース中と同じ後処理(PostFX)を通す。
 * 「回転」のON/OFFは、車の台座ではなくカメラが車の周りをゆっくり回るかどうかになる。
 */
export class GarageScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public turntableGroup: THREE.Group;
  public isRotating: boolean = true;
  private static readonly ORIGIN = new THREE.Vector3();
  private static readonly CRUISE_VEL = new THREE.Vector3(0, 0, CRUISE_SPEED);
  private readonly ground = new THREE.Vector3(0, 0, -CRUISE_SPEED * 0.55);   // 跳ねた水が、路面と一緒に後ろへ流れていく速さ
  private readonly center = new THREE.Vector3();
  private readonly wheelPos = new THREE.Vector3();
  private readonly sideDir = new THREE.Vector3();
  private readonly city = new NightCity();
  private readonly rain = new RainSystem();
  private readonly postFx: PostFX;
  private readonly spray = new TireSmokeSystem();
  private wheelAngle = 0;
  /** ドラゴン・カーのFKアニメ用の経過秒 */
  private dragonTime = 0;
  private lastTime = 0;
  /** ロード中のメーターの値(0〜1)。大きいほど街が速く流れ、画面が揺れる */
  private loadLevel = 0;
  public setLoadLevel(v: number): void { this.loadLevel = v; }
  /** 発進演出(ロード完了 → 車が画面へ突っ込む)。-1 = 演出なし、それ以外は経過秒 */
  private launchT = -1;
  private launchResolve: (() => void) | null = null;
  private readonly launchFromPos = new THREE.Vector3();
  private readonly launchFromTarget = new THREE.Vector3();
  private launchWasRotating = true;
  private static readonly LAUNCH_POS = new THREE.Vector3(0, 1.0, 4.6);
  private static readonly LAUNCH_TARGET = new THREE.Vector3(0, 0.85, 0);
  /** 車の先端がカメラに触れるまでの秒数(この時に resolve する) */
  private static readonly LAUNCH_HIT = 0.82;
  private readonly lightning = new Lightning(6, 9, 23, 8);

  constructor(container: HTMLElement) {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1226);
    this.scene.fog = new THREE.FogExp2(0x101a33, 0.012);

    // 2. Camera setup
    const aspect = container.clientWidth / container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 100);
    this.camera.position.set(4.2, 2.2, 5.0);
    this.liftView(container.clientWidth, container.clientHeight);

    // 3. Renderer setup
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.debug.checkShaderErrors = false;
    container.appendChild(this.renderer.domElement);

    // 4. Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03; // Don't clip below floor
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 14.0;
    this.controls.target.set(0, 0.9, 0);
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.9;

    // 5. Turntable Group (Car sits on this)
    this.turntableGroup = new THREE.Group();
    this.scene.add(this.turntableGroup);

    // 6. Garage environment
    this.setupLighting();
    this.setupEnvironment();
    this.scene.add(this.city.group);
    this.rain.surround = true;
    this.rain.intensity = 1;
    this.scene.add(this.rain.mesh);
    this.scene.add(this.spray.group);
    this.postFx = new PostFX(this.renderer, this.scene, this.camera);
    this.postFx.setTimeOfDay('night');
    this.postFx.setRain(1, 1);
    this.spray.wet = true;

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize.bind(this, container));
  }

  private setupLighting(): void {
    // 夜: 青い空の明かりと、月明かり
    this.scene.add(new THREE.HemisphereLight(0x7d92d6, 0x2c3550, 0.9));
    this.scene.add(new THREE.AmbientLight(0x8fa2ff, 0.25));

    const moon = new THREE.DirectionalLight(0xb4c6ff, 1.2);
    moon.position.set(5, 8, 4);
    moon.castShadow = true;
    moon.shadow.mapSize.width = 2048;
    moon.shadow.mapSize.height = 2048;
    moon.shadow.camera.near = 0.5;
    moon.shadow.camera.far = 25;
    moon.shadow.camera.left = -4;
    moon.shadow.camera.right = 4;
    moon.shadow.camera.top = 4;
    moon.shadow.camera.bottom = -4;
    moon.shadow.bias = -0.0003;
    this.scene.add(moon);

    // 後ろから、街灯の暖色の縁取り
    const rim = new THREE.DirectionalLight(0xffa860, 1.6);
    rim.position.set(-2, 3, -6);
    this.scene.add(rim);

    // ネオンの寒色・桃色の反射光
    const neonL = new THREE.PointLight(0x35e0ff, 14, 14, 2);
    neonL.position.set(-4.5, 1.6, 2.5);
    this.scene.add(neonL);
    const neonR = new THREE.PointLight(0xff3da8, 10, 14, 2);
    neonR.position.set(4.5, 1.2, -2.5);
    this.scene.add(neonR);

    // ヘッドライト: 濡れた路面を前方へ照らす
    const head = new THREE.SpotLight(0xfff0d0, 220, 60, 0.45, 0.8, 2);
    head.position.set(0, 0.85, 1.6);
    head.target.position.set(0, -1.5, 30);
    this.scene.add(head, head.target);
  }

  private setupEnvironment(): void {
    // 車の塗装・クリアコート・クロームに映り込む、夜の街の環境マップ(暗い空に、ネオンと街灯の帯)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const ctx = envCanvas.getContext('2d');
    if (ctx) {
      const sky = ctx.createLinearGradient(0, 0, 0, 128);
      sky.addColorStop(0, '#0a1230');
      sky.addColorStop(1, '#1d2a52');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, 512, 128);
      const ground = ctx.createLinearGradient(0, 128, 0, 256);
      ground.addColorStop(0, '#1a2038');
      ground.addColorStop(1, '#05070d');
      ctx.fillStyle = ground;
      ctx.fillRect(0, 128, 512, 128);
      // 地平線ぞいの街の明かり
      const lights = ['#35e0ff', '#ff3da8', '#ffb347', '#fff2d6', '#7a5cff'];
      for (let i = 0; i < 46; i++) {
        const x = (i * 97 + (i * i) % 53) % 512;
        const w = 4 + (i * 13) % 22;
        const y = 92 + (i * 29) % 34;
        ctx.fillStyle = lights[i % lights.length];
        ctx.globalAlpha = 0.5 + ((i * 7) % 5) * 0.1;
        ctx.fillRect(x, y, w, 3 + (i % 3) * 2);
      }
      ctx.globalAlpha = 1;
      // 月
      const moon = ctx.createRadialGradient(380, 36, 2, 380, 36, 60);
      moon.addColorStop(0, '#e8efff');
      moon.addColorStop(0.3, 'rgba(160,185,255,0.6)');
      moon.addColorStop(1, 'rgba(160,185,255,0)');
      ctx.fillStyle = moon;
      ctx.fillRect(300, 0, 160, 110);
    }
    const envTex = new THREE.CanvasTexture(envCanvas);
    envTex.mapping = THREE.EquirectangularReflectionMapping;
    envTex.colorSpace = THREE.SRGBColorSpace;
    this.scene.environment = pmrem.fromEquirectangular(envTex).texture;
    pmrem.dispose();
    envTex.dispose();
  }

  private onWindowResize(container: HTMLElement): void {
    const width = container.clientWidth;
    const height = container.clientHeight;
    this.camera.aspect = width / height;
    this.liftView(width, height);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /** Shifts the picture up a little so the car clears the buttons along the bottom of the select screens. */
  private liftView(width: number, height: number): void {
    this.camera.setViewOffset(width, height, 0, Math.round(height * 0.13), width, height);
  }

  public setCameraView(view: 'orbit' | 'front' | 'side' | 'cockpit'): void {
    if (view === 'orbit') {
      this.camera.position.set(4.2, 2.2, 5.0);
      this.controls.target.set(0, 0.9, 0);
    } else if (view === 'front') {
      this.camera.position.set(0, 1.1, 4.5);
      this.controls.target.set(0, 0.8, 1.2);
    } else if (view === 'side') {
      this.camera.position.set(4.8, 1.2, 0);
      this.controls.target.set(0, 0.9, 0);
    } else if (view === 'cockpit') {
      // Zoom right into the driver window to see dashboard, steering wheel & seats!
      this.camera.position.set(-1.1, 1.45, 0.2);
      this.controls.target.set(-0.2, 1.1, -0.1);
    }
  }

  /**
   * 発進演出: カメラを正面に寄せ、車を画面へ向かって加速させる(街と雨は速く流れ、速度線が強まる)。
   * 車の先端がカメラに触れる瞬間に resolve する。呼んだ側が画面を切り替えたら endLaunch() で戻す。描画していない時は何もせず resolve。
   */
  public launch(): Promise<void> {
    if (!this.active) return Promise.resolve();
    this.launchWasRotating = this.isRotating;
    this.isRotating = false;
    this.controls.enabled = false;
    this.launchFromPos.copy(this.camera.position);
    this.launchFromTarget.copy(this.controls.target);
    this.launchT = 0;
    return new Promise((resolve) => { this.launchResolve = resolve; });
  }

  /**
   * 発進演出を終え、台座の位置・カメラ・自動回転を発進前に戻す。
   * 戻さないと、走行からタイトル以外のメニュー(コース・マシン選択など)へ戻ったとき、正面を向いたまま回転しない。
   */
  public endLaunch(): void {
    if (this.launchT >= 0) {
      this.camera.position.copy(this.launchFromPos);
      this.controls.target.copy(this.launchFromTarget);
      this.camera.lookAt(this.controls.target);
      this.isRotating = this.launchWasRotating;
    }
    this.launchT = -1;
    this.launchResolve = null;
    this.turntableGroup.position.set(0, 0, 0);
    this.controls.enabled = true;
  }

  private updateLaunch(dt: number): number {
    const t = (this.launchT += dt);
    const k = Math.min(1, t / 0.5);
    const e = 1 - (1 - k) * (1 - k);                                  // 速度が落ち着くように寄る
    this.camera.position.lerpVectors(this.launchFromPos, GarageScene.LAUNCH_POS, e);
    this.controls.target.lerpVectors(this.launchFromTarget, GarageScene.LAUNCH_TARGET, e);
    this.camera.lookAt(this.controls.target);
    const run = Math.max(0, t - 0.2);
    this.turntableGroup.position.z = 8 * run * run;                   // 加速しながらまっすぐ向かってくる
    if (t >= GarageScene.LAUNCH_HIT && this.launchResolve) {
      const done = this.launchResolve;
      this.launchResolve = null;
      done();
    }
    return Math.min(1, t / GarageScene.LAUNCH_HIT);
  }

  public active: boolean = false;
  private animationFrameId: number | null = null;

  /** 初回起動時(最初の requestAnimationFrame の前)に、ガレージと後処理のシェーダー・テクスチャを事前コンパイルする。 */
  public warmup(): void {
    if (this.postFx.enabled) this.postFx.render();
    else this.renderer.render(this.scene, this.camera);
    this.renderer.getContext().finish();
  }

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.controls.enabled = true;
    this.lastTime = performance.now() / 1000;
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
  }

  public stop(): void {
    this.active = false;
    this.controls.enabled = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private animateCar(car: NonNullable<ReturnType<typeof carByGroup.get>>, dt: number, rush: number): void {
    car.setWet(true);
    if (car instanceof DragonCarModel) {
      this.dragonTime += dt;
      car.updateDragonParts(this.dragonTime, Math.min(1, 0.4 + rush * 0.6 + this.loadLevel * 0.4));   // 巡航中の振れを基準に、発進・ロード中ほど大きく振れる
    }
    this.wheelAngle = (this.wheelAngle + WHEEL_SPIN * dt) % (Math.PI * 2);
    const ground = this.ground, center = this.center, v = this.wheelPos;
    car.group.getWorldPosition(center);
    car.wheels.forEach((w, i) => {
      // 左側のタイヤは向きが反転して作られている(wheelBaseYaw が π)ので、回転の向きも逆にする
      const flipped = Math.abs(Math.abs(car.wheelBaseYaw[i] ?? 0) - Math.PI) < 0.1;
      w.rotation.x = flipped ? -this.wheelAngle : this.wheelAngle;
      w.getWorldPosition(v);
      v.y = 0.02;
      const side = Math.sign(v.x - center.x) || 1;
      const out = this.sideDir.set(side, 0, 0);
      const rear = i >= 2;
      if (Math.random() < (rear ? 0.7 : 0.25)) this.spray.emitSplash(v, ground, out, 0.8);
      if (rear && Math.random() < 0.12) this.spray.emitSmoke(v, ground, 0.5);
    });
  }

  public animate(): void {
    if (!this.active) return;
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

    const now = performance.now() / 1000;
    const dt = Math.min(0.1, this.lastTime ? now - this.lastTime : 0.016);
    this.lastTime = now;

    const rush = this.launchT >= 0 ? this.updateLaunch(dt) : 0;       // 発進演出の進み(0〜1)

    // 背景を流し、雨を降らせる。車は止まっているので、雨の相対速度は「後ろへ流れる」ぶんを渡す
    const lv = this.loadLevel;
    this.city.update(dt, CRUISE_SPEED * (1 + rush * 1.6 + lv * 0.6));
    this.rain.update(dt, GarageScene.ORIGIN, 0, GarageScene.CRUISE_VEL, true);

    // 稲光
    this.lightning.update(dt);
    this.postFx.setLightning(this.lightning.level);

    // 台座の車: タイヤを回し、タイヤから水を跳ね上げる
    for (const child of this.turntableGroup.children) {
      const car = carByGroup.get(child);
      if (car) { this.animateCar(car, dt, rush); break; }
    }
    this.spray.update(dt, this.camera);

    // 「回転」: カメラが車の周りをゆっくり回る
    this.controls.autoRotate = this.isRotating;
    if (this.launchT < 0) this.controls.update();
    // ロード中は、速いほどカメラが震える(メーターが赤くなるにつれて強く)
    const shakeAmp = lv * lv * 0.05 + rush * 0.02;
    if (shakeAmp > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * shakeAmp;
      this.camera.position.y += (Math.random() - 0.5) * shakeAmp;
    }

    // レース中と同じ後処理。速く走っているようにブラーと速度線もかける
    this.postFx.setSpeedState(Math.min(1, 0.62 + rush * 0.38 + lv * 0.25), rush * 0.9 + lv * lv * 0.35, rush * rush * 0.6, rush * 0.3 + lv * lv * 0.8, 1);
    if (this.postFx.enabled) this.postFx.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
