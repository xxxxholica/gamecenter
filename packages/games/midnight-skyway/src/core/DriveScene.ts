import { forceSinglePassForTransparent } from './singlePass';
import { PostFX, compileInParallel } from './PostFX';
import { audio } from '../audio';
import { audioRandom, untrackedRandom, untrackedTimeout } from '../../../../shared/arcadeReplay';
import { createSkyEnvironments, type SkyEnvironments } from './SkyEnvironment';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapBase } from '../maps/MapBase';
import { CarBase } from '../models/CarBase';
import { DragonCarModel } from '../models/DragonCarModel';
import { CarController, CameraMode } from './CarController';
import { TireSmokeSystem } from './TireSmokeSystem';
import { BOOST_THEMES, boostThemeFor, type BoostTheme } from './BoostTheme';
import { SpeedStreaks } from './SpeedStreaks';
import { RoadVfx } from './RoadVfx';
import { RainSystem } from './RainSystem';
import { Lightning } from './Lightning';
import { RoadsideRhythm } from './RoadsideRhythm';
import type { TimeOfDay } from './TimeOfDay';

export interface DriveSceneCallbacks {
  onSpeedUpdate?: (speedKmH: number, rpm: number, gear: string, isDrifting?: boolean) => void;
  onPositionUpdate?: (carPos: THREE.Vector3, carRotY: number, forwardTraffic: THREE.Vector2[]) => void;
  onProgressUpdate?: (fraction: number, speedKmH: number, dt: number) => void;
  /** 自車の物理の直後、マップの拘束(壁・路面)の前。オンライン対戦の車同士の当たり判定に使う。 */
  /** 毎フレーム: 速度(0〜1)・ブースト(0〜1)・スリップストリーム(0〜1)。HUDの縁の光などに使う。 */
  onFxUpdate?: (speed: number, boost: number, slipstream: number) => void;
  onBeforeConstrain?: (car: CarController, dt: number) => void;
}

/**
 * 太陽の影マップ。dGPU搭載PC向けに 4096px とし、範囲を自車の周囲(約120m四方)に絞る。
 * 1テクセル約3cm(以前は 2048px・160m四方で約8cm)になり、車や標識の影の輪郭がはっきりする。
 */
const SHADOW_MAP_SIZE = 4096;
const SHADOW_HALF_EXTENT = 60;

/** 雨粒の量(0〜1。表示する粒の割合)。1で全部、小さいほど少ない */
const RAIN_INTENSITY = 0.4;

export class DriveScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  public currentMap: MapBase | null = null;
  public currentCar: CarBase | null = null;
  /** ドラゴン・カーのFKアニメ用の経過秒(ポーズ中は進まない)。 */
  private dragonTime = 0;
  private skyEnv: SkyEnvironments | null = null;
  private postFx: PostFX;
  public carController: CarController | null = null;
  public tireSmoke: TireSmokeSystem;
  private speedStreaks: SpeedStreaks;
  private roadVfx: RoadVfx;
  private rainSystem: RainSystem;
  private rhythm: RoadsideRhythm;

  public active: boolean = false;
  private animationFrameId: number | null = null;
  private clock: THREE.Clock;

  // Chase camera state: the camera follows the car at a fixed distance; only its heading lags a little behind the car's
  private cameraLookTarget = new THREE.Vector3();
  private currentCameraPos = new THREE.Vector3();
  // 押している間だけ、車の前から車を映す視点(Vキー / アケコンのY)。離すと元の視点へ戻る
  private frontKeyHeld = false;
  private frontPadHeld = false;
  private resultView = false;          // ゴール後: 走り続ける車を前から映し、リザルトを横に出す
  private resultBlend = 0;
  private viewOffsetOn = false;
  private frontActive = false;         // 前方の視点が出ているか(視点はボタンで即座に切り替わる)
  private chaseHeading = 0;
  private chaseDist = 4.4;
  private chaseHeight = 2.9;
  private cameraTrauma = 0;

  // 疾走感の演出(速度・ブースト・ドリフトに連動するカメラと後処理)
  /** URL に ?calm=1 を付けると、揺れ・FOVの広がり・ブラーを控えめにする(酔いやすい人向け) */
  private readonly motionScale = new URLSearchParams(location.search).get('calm') === '1' ? 0.3 : 1;
  private fxTime = 0;
  private boostLevel = 0;              // ブーストの強さ(0〜1、なめらかに増減)
  /** 自車のブーストの強さ(0〜1)。対戦で相手へ送る */
  public get boostAmount(): number { return this.boostLevel; }
  /** 雨が降っているか(相手の車の水しぶきの判断に使う) */
  public get isRainy(): boolean { return this.rainy; }
  private fovKick = 0;                 // ブースト開始・ドリフト確定の瞬間に一瞬だけ広がるFOV
  private distKick = 0;                // 同じく一瞬だけカメラが後ろへ引く距離
  private flash = 0;                   // ドリフト確定の閃光
  private camLean = 0;                 // ドリフト中のカメラの傾き
  private prevBoostTimer = 0;
  private prevSpeed = 0;
  private prevY = 0;
  private prevVy = 0;
  private fxPrimed = false;
  private nearMissCooldown = 0;
  private lastSpeedFactor = 0;
  // 1フレームの間に、あちこちの演出で使い回す(毎回つくらない)
  private tires!: ReturnType<CarController['getTireContactPositions']>;
  private readonly carVel = new THREE.Vector3();          // 車の進む速度(m/s)。向きは velocityHeading
  private readonly lateral = new THREE.Vector3();         // 車の右向き
  private readonly waterVel = new THREE.Vector3();
  private readonly outward = new THREE.Vector3();
  private boostTheme: BoostTheme = BOOST_THEMES.default;   // ブーストの色と演出(車ごと。setCar で切り替わる)
  private boltCarry = 0;                                       // Azure の電撃を出すタイミングの端数
  private readonly exhaustInnerL = new THREE.Vector3();        // Gold の4連ノズルの内側の2本
  private readonly exhaustInnerR = new THREE.Vector3();
  private readonly exhaustL = new THREE.Vector3();
  private readonly exhaustR = new THREE.Vector3();
  private readonly scratch = new THREE.Vector3();
  /** 追従カメラの計算に使う使い回し(毎フレーム new しない) */
  private readonly camFwd = new THREE.Vector3();
  private readonly camDir = new THREE.Vector3();
  private prevAccelSpeed = 0;
  private accelSm = 0;                 // なめらかにした加速度(m/s²)。カメラの引きと沈みに使う
  private slipstream = 0;              // 前の車の真後ろにいる度合い(0〜1)
  private readonly passPrev = new WeakMap<object, number>();

  // 天気(雨): 濡れた路面の反射・雨粒・水しぶき・霧・稲光・雨音
  /** 天候は雨のみ。確認用に URL の ?rain=0 で晴れにできる。 */
  private readonly rainy = new URLSearchParams(location.search).get('rain') !== '0';
  private mapFogDensity = 0.0035;
  private hemiBase = 0.45;
  private readonly lightning = new Lightning(12);

  /** Frozen (pause menu): nothing moves, the last frame stays on screen. */
  public paused: boolean = false;
  /** スタート位置のずらし(オンライン対戦のグリッド): lateral=+で進行方向の右、back=後ろへ(m)。 */
  public gridOffset: { lateral: number; back: number } | null = null;
  private timeOfDay: TimeOfDay = 'day';
  private headSpot!: THREE.SpotLight;

  // Environment lights
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private skyMesh!: THREE.Mesh;
  private skyUniforms!: {
    uTime: { value: number };
    uSunDir: { value: THREE.Vector3 };
    uNight: { value: number };
  };

  // Callbacks
  public callbacks: DriveSceneCallbacks = {};

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.clock = new THREE.Clock();

    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue
    this.scene.fog = new THREE.FogExp2(0xcfe4ee, 0.0035);

    // 2. Camera setup
    const aspect = renderer.domElement.clientWidth / renderer.domElement.clientHeight;
    this.camera = new THREE.PerspectiveCamera(55, aspect, 0.2, 2000);
    this.camera.position.set(0, 5, -10);

    // 3. OrbitControls (used in orbit camera mode)
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.01;
    this.controls.enabled = false;

    // 4. Lighting & Sky
    this.setupLighting();
    this.setupSky();
    this.postFx = new PostFX(this.renderer, this.scene, this.camera);

    // 4b. Tire Smoke Particle System
    this.tireSmoke = new TireSmokeSystem();
    this.scene.add(this.tireSmoke.group);

    this.speedStreaks = new SpeedStreaks();
    this.scene.add(this.speedStreaks.mesh);
    this.rhythm = new RoadsideRhythm();
    this.scene.add(this.rhythm.group);
    this.rhythm.onBeaconPass = () => audio.sfx.whoosh(this.lastSpeedFactor);
    this.rainSystem = new RainSystem();
    this.scene.add(this.rainSystem.mesh);
    this.roadVfx = new RoadVfx();
    this.scene.add(this.roadVfx.group);

    // 5. Window resize
    window.addEventListener('resize', this.onResize.bind(this));

    // 6. Camera selfie/lookback key (V key)
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'KeyV') this.frontKeyHeld = true;
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyV') this.frontKeyHeld = false;
    });
    window.addEventListener('blur', () => { this.frontKeyHeld = false; });
  }

  private setupLighting(): void {
    // Now that the city and road (StreamedCityMap / ViaductBuilder) are lit materials too, not just the car: less flat
    // ambient/hemi fill than before so cast shadows keep real contrast, and the sun trimmed a touch so concrete facades
    // don't clip white under ACES tonemapping.
    this.hemiLight = new THREE.HemisphereLight(0xddeeff, 0x3d4840, 0.45);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff7e6, 1.75);
    this.sunLight.position.set(200, 400, 150);
    this.sunLight.castShadow = true;
    // 影マップの大きさと範囲は、ファイル先頭の SHADOW_MAP_SIZE / SHADOW_HALF_EXTENT を参照(4096px・約120m四方で約3cm/テクセル)。
    this.sunLight.shadow.mapSize.width = SHADOW_MAP_SIZE;
    this.sunLight.shadow.mapSize.height = SHADOW_MAP_SIZE;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 1000;
    const shadowSize = SHADOW_HALF_EXTENT;
    this.sunLight.shadow.camera.left = -shadowSize;
    this.sunLight.shadow.camera.right = shadowSize;
    this.sunLight.shadow.camera.top = shadowSize;
    this.sunLight.shadow.camera.bottom = -shadowSize;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;   // 解像度を上げた分の影のぎざぎざ(シャドウアクネ)を抑える
    this.scene.add(this.sunLight);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    this.scene.add(this.ambientLight);

    // Headlights of the car (night only): one spot light that follows the car
    this.headSpot = new THREE.SpotLight(0xfff0d0, 700, 110, 0.5, 0.7, 2);
    this.headSpot.visible = false;
    this.scene.add(this.headSpot, this.headSpot.target);
  }

  /** 天気を画面・音に反映する: 反射・雨粒・霧の濃さ・雨音。 */
  private applyWeather(): void {
    const rain = this.rainy;
    this.postFx.setRain(rain ? 1 : 0, 0.6);
    this.tireSmoke.wet = rain;
    this.currentCar?.setWet(rain);
    this.rainSystem.intensity = rain ? RAIN_INTENSITY : 0;
    this.rainSystem.reset();
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = this.mapFogDensity * (rain ? 1.6 : 1);
    this.currentMap?.traffic?.setFogDensity(this.mapFogDensity * (rain ? 1.6 : 1), this.camera.far);
    if (!rain) {
      this.lightning.reset();
      this.postFx.setLightning(0);
      this.hemiLight.intensity = this.hemiBase;
    }
    if (this.active && rain) audio.sfx.startRain(); else audio.sfx.stopRain();
  }

  /** Day: sunlit, clouds, street lamps off. Night: moon, stars, dark blue city, headlights and street lamps on. */
  public setTimeOfDay(t: TimeOfDay): void {
    this.timeOfDay = t;
    const night = t === 'night';
    this.skyUniforms.uNight.value = night ? 1 : 0;
    this.postFx.setTimeOfDay(night ? 'night' : 'day');
    // Night is a deep blue dusk, not black: the city stays readable (moon, sky glow and lit windows do the work)
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.color.set(night ? 0x1a2646 : 0xcfe4ee);
    this.hemiLight.color.set(night ? 0x7d92d6 : 0xddeeff);
    this.hemiLight.groundColor.set(night ? 0x2c3550 : 0x3d4840);
    this.hemiBase = night ? 1.0 : 0.45;
    this.hemiLight.intensity = this.hemiBase;
    this.sunLight.color.set(night ? 0xb4c6ff : 0xfff7e6);
    this.sunLight.intensity = night ? 1.0 : 1.75;
    this.ambientLight.color.set(night ? 0xa4b4e6 : 0xffffff);
    this.ambientLight.intensity = night ? 0.5 : 0.1;
    if (this.skyEnv) this.scene.environment = night ? this.skyEnv.night : this.skyEnv.day;
    this.scene.environmentIntensity = 1;
    this.applyPaintEnvironment();
    this.headSpot.visible = night;
    this.currentMap?.setNight(night);
    this.currentCar?.setLights(night);
  }

  private setupSky(): void {
    // Large hemisphere sky dome with procedural dynamic moving clouds
    const skyGeo = new THREE.SphereGeometry(1500, 32, 24);

    this.skyUniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.4).normalize() },
      uNight: { value: 0 },
    };

    const vertexShader = `
      varying vec3 vWorldPosition;
      void main() {
        vWorldPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const fragmentShader = `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform float uNight;
      varying vec3 vWorldPosition;

      // 2D Hash function
      vec2 hash(vec2 p) {
        p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
        return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
      }

      // 2D Perlin-style noise
      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(dot(hash(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
                       dot(hash(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
                   mix(dot(hash(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
                       dot(hash(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x), u.y);
      }

      // Fractional Brownian Motion for procedural cloud details
      float fbm(vec2 p) {
        float f = 0.0;
        f += 0.500 * noise(p); p = p * 2.02 + vec2(0.12, 0.15);
        f += 0.250 * noise(p); p = p * 2.04 + vec2(-0.11, 0.23);
        f += 0.125 * noise(p);
        return f;
      }

      void main() {
        vec3 dir = normalize(vWorldPosition);
        float h = dir.y; // Height factor (-1 to +1)

        // 1. Natural Sky Gradient (moody, rich atmospheric tone)
        vec3 zenithColor = mix(vec3(0.14, 0.28, 0.50), vec3(0.020, 0.040, 0.120), uNight);   // Deep slate blue / night
        vec3 midSkyColor = mix(vec3(0.38, 0.54, 0.70), vec3(0.050, 0.090, 0.220), uNight);   // Calm sky blue / night
        vec3 horizonColor = mix(vec3(0.81, 0.89, 0.93), vec3(0.102, 0.149, 0.275), uNight); // Matches road fog (#cfe4ee / #1a2646)

        vec3 skyColor;
        if (h > 0.25) {
          skyColor = mix(midSkyColor, zenithColor, (h - 0.25) / 0.75);
        } else {
          skyColor = mix(horizonColor, midSkyColor, max(0.0, h) / 0.25);
        }

        // 2. Rich Dynamic Clouds (Fully covers zenith directly overhead & stretches to horizon)
        if (h > 0.01) {
          // Perspective projection that preserves natural cloud scale at zenith (directly overhead)
          // dist scale smoothly stretches towards horizon while keeping zenith dense and detailed
          float dist = 1.0 / max(h + 0.22, 0.12);
          vec2 skyCoord = dir.xz * dist * 1.6;

          // Wind drift vectors for 2 evolving cloud layers
          vec2 windMain = vec2(uTime * 0.018, uTime * 0.007);
          vec2 windDetail = vec2(uTime * 0.028, uTime * 0.012);

          // Layer 1: Main volumetric clouds with turbulence
          vec2 p1 = skyCoord + windMain;
          float f1 = fbm(p1 * 0.65);
          float f2 = fbm(p1 * 1.45 + vec2(f1 * 0.5, -f1 * 0.35) + windDetail * 0.3);
          float mainClouds = f1 * 0.62 + f2 * 0.38;

          // Layer 2: High wispy layers ensuring zenith is densely populated with clouds
          vec2 p2 = skyCoord * 1.7 + windDetail;
          float cirrus = fbm(p2 * 0.6) * 0.35;

          // High coverage thresholding: plenty of clouds covering 65-75% of sky
          float coverage = 0.68;
          float density = smoothstep(1.0 - coverage - 0.22, 1.0 - coverage + 0.26, mainClouds + cirrus + 0.24);

          // Zenith booster: guarantees thick, dramatic clouds directly overhead (h > 0.5)
          float zenithBoost = smoothstep(0.3, 0.9, h) * 0.12;
          density = clamp(density + zenithBoost, 0.0, 1.0);

          if (density > 0.01) {
            // Sun rim lighting & silver lining
            float sunDot = max(0.0, dot(dir, normalize(uSunDir)));
            float sunHighlight = pow(sunDot, 3.5) * 0.55;

            // 3D volumetric shading: deep shaded undersides + bright sunlit cloud tops
            vec3 cloudBase = vec3(0.62, 0.67, 0.75); // Shaded base
            vec3 cloudLit = vec3(0.97, 0.98, 1.0) + vec3(0.14, 0.10, 0.05) * sunHighlight;
            vec3 cloudColor = mix(cloudBase, cloudLit, clamp(f2 * 1.25 + sunHighlight * 0.8, 0.0, 1.0));
            cloudColor *= 1.0 - 0.92 * uNight;   // clouds are only dark shapes at night

            // Soft blend near horizon into distance fog
            float horizonFade = smoothstep(0.01, 0.15, h);
            float finalAlpha = density * horizonFade * 0.96;

            skyColor = mix(skyColor, cloudColor, finalAlpha);
          }
        }

        // Night: stars, and the moon where the light comes from
        if (uNight > 0.01) {
          vec3 sp = dir * 220.0;
          vec3 cell = floor(sp);
          float r = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float d = length(fract(sp) - 0.5);
          float star = step(0.9965, r) * smoothstep(0.36, 0.0, d);
          star *= smoothstep(0.02, 0.25, h) * (0.65 + 0.35 * sin(uTime * 2.0 + r * 60.0));
          skyColor += vec3(star) * uNight;
          float md = dot(dir, normalize(uSunDir));
          float moon = smoothstep(0.9988, 0.9994, md);
          skyColor = mix(skyColor, vec3(0.95, 0.96, 1.0), moon * uNight);
          skyColor += vec3(0.35, 0.45, 0.75) * pow(max(md, 0.0), 60.0) * 0.35 * uNight;
        }

        // Fade below horizon to seamlessly integrate with road fog
        if (h < 0.01) {
          skyColor = mix(horizonColor * 0.94, skyColor, clamp(h / 0.01, 0.0, 1.0));
        }

        gl_FragColor = vec4(skyColor, 1.0);
      }
    `;

    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });

    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -1000;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    // 車の塗装・ガラス・クロームに映る環境マップ(昼用・夜用)。明るさが1を超えるHDRで作り、鋭いハイライトを出す
    this.skyEnv = createSkyEnvironments(this.renderer, new THREE.Vector3(0.3, 0.88, 0.22));
    this.scene.environment = this.timeOfDay === 'night' ? this.skyEnv.night : this.skyEnv.day;
  }

  /** respawn=false: 車はまだ台座にあるので、スタート地点へは置かない(あとで setCar が置く)。 */
  public loadMap(map: MapBase, respawn = true): void {
    if (this.currentMap) {
      this.scene.remove(this.currentMap.group);
      this.currentMap.dispose();
    }

    this.currentMap = map;
    map.attachRenderer(this.renderer);
    this.scene.add(map.group);
    this.applyPaintEnvironment();                                  // NPC車の塗装にも環境マップを持たせる
    this.rhythm.setRoute(map.getRoutePoints(), map.getRoadWidth());
    this.mapFogDensity = map.fogDensity ?? 0.0035;
    this.applyWeather();
    this.camera.far = map.viewDistance ?? 2000;
    map.traffic?.setFogDensity(this.mapFogDensity * (this.rainy ? 1.6 : 1), this.camera.far);
    this.camera.updateProjectionMatrix();
    map.setNight(this.timeOfDay === 'night');

    // If car exists, respawn it at map start point
    if (this.carController && respawn) {
      this.respawnCar();
    }
  }

  /**
   * 塗装・ガラス・クロームの素材に、環境マップを直接持たせる。three.js では、scene.environment を使う素材の
   * envMapIntensity は無視される(scene.environmentIntensity が全体に効く)ため、素材ごとに強さを変えるには
   * 素材自身の envMap を設定する必要がある。目印は material.userData.skyEnv(昼の強さ)。
   * 車の選択画面(別シーン)に戻る時は clearPaintEnvironment() で外し、そちらの環境マップを使わせる。
   */
  public applyPaintEnvironment(): void {
    if (!this.skyEnv) return;
    const night = this.timeOfDay === 'night';
    const tex = night ? this.skyEnv.night : this.skyEnv.day;
    this.scene.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        const base = m.userData?.skyEnv as number | undefined;
        if (base === undefined) continue;
        const pm = m as THREE.MeshStandardMaterial;
        if (pm.envMap !== tex) { const first = pm.envMap === null; pm.envMap = tex; if (first) pm.needsUpdate = true; }
        pm.envMapIntensity = base * (night ? m.userData.skyEnvNight ?? 1 : 1);
      }
    });
  }

  public clearPaintEnvironment(car: CarBase): void {
    car.group.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!mat) return;
      for (const m of Array.isArray(mat) ? mat : [mat]) {
        if (m.userData?.skyEnv === undefined) continue;
        const pm = m as THREE.MeshStandardMaterial;
        if (pm.envMap) { pm.envMap = null; pm.needsUpdate = true; }
      }
    });
  }

  public setCar(car: CarBase): void {
    if (this.currentCar) {
      this.scene.remove(this.currentCar.group);
    }

    this.currentCar = car;
    this.scene.add(car.group);

    if (!this.carController) {
      this.carController = new CarController(car);
    } else {
      this.carController.setCar(car);
    }

    this.boostTheme = boostThemeFor(car);
    this.tireSmoke.setTheme(this.boostTheme);
    this.postFx.setBoostColors(this.boostTheme.streak, this.boostTheme.flare);
    this.applyPaintEnvironment();
    this.respawnCar();
  }

  public respawnCar(): void {
    if (!this.carController || !this.currentMap) return;
    this.tireSmoke?.reset();
    this.speedStreaks.reset();
    this.roadVfx.reset();
    this.nearMissCooldown = 0;
    this.rhythm.reset();
    this.accelSm = 0;
    this.slipstream = 0;
    const startPos = this.currentMap.startPosition.clone();
    // Slightly lift to prevent ground clipping
    startPos.y += 0.05;
    if (this.gridOffset) {
      const r = this.currentMap.startRotationY;
      startPos.x += Math.cos(r) * this.gridOffset.lateral - Math.sin(r) * this.gridOffset.back;
      startPos.z += -Math.sin(r) * this.gridOffset.lateral - Math.cos(r) * this.gridOffset.back;
    }
    this.carController.resetPosition(startPos, this.currentMap.startRotationY);
    this.currentMap.onRespawn(this.carController);              // grounded on the road before the countdown starts
    const carPos = this.carController.position;

    // Reset the chase camera behind the car
    this.chaseHeading = this.currentMap.startRotationY;
    this.chaseDist = 4.4;
    this.chaseHeight = 2.9;
    this.resultView = false;
    this.resultBlend = 0;
    this.fxPrimed = false;
    this.boostLevel = this.fovKick = this.distKick = this.flash = this.camLean = 0;
    const forwardX = Math.sin(this.currentMap.startRotationY);
    const forwardZ = Math.cos(this.currentMap.startRotationY);
    this.currentCameraPos.set(
      carPos.x - forwardX * 5.0,
      carPos.y + 2.4,
      carPos.z - forwardZ * 5.0
    );
    this.camera.position.copy(this.currentCameraPos);
    this.camera.lookAt(carPos.x, carPos.y + 0.8, carPos.z);
  }

  /** ゴール後のリザルト用の視点(車の前から映す)を入り切りする。 */
  public setResultView(on: boolean): void {
    this.resultView = on;
    if (!on) this.resultBlend = 0;
  }

  public setCameraMode(mode: CameraMode): void {
    if (!this.carController) return;
    // 一人称視点は廃止: 常に三人称後方視点(chase)に固定
    const effectiveMode: CameraMode = (mode === 'cockpit' || mode === 'hood') ? 'chase' : mode;
    this.carController.cameraMode = effectiveMode;
    this.controls.enabled = (effectiveMode === 'orbit');
    if (effectiveMode === 'chase') this.chaseHeading = this.carController.rotationY;   // no swing when coming back to the chase view
    
    this.camera.fov = 54;
    this.camera.updateProjectionMatrix();

    if (effectiveMode === 'orbit' && this.carController) {
      this.controls.target.copy(this.carController.position).add(new THREE.Vector3(0, 0.8, 0));
    }
  }

  /** アケコンのYボタンの押下状態(メニュー表示中などは false を渡す) */
  public setFrontViewPad(held: boolean): void {
    this.frontPadHeld = held;
  }

  /**
   * 起動時(最初の requestAnimationFrame の前)や暗転中に、コース・車両・影パス・視錐台外のバリケード等のシェーダーを事前コンパイルする。
   * userData.skipWarmup が付いたサブツリー(街のチャンク)は視錐台カリングを外さない:
   * チャンクの素材はダミーメッシュ(StreamedCityMap)と同じシェーダーなので、全チャンクを描くコストをかけない。
   */
  public warmup(cars: CarBase[] = []): void {
    const restore = this.prepareWarmup(cars);
    try {
      this.renderScene();
      this.renderer.getContext().finish();
    } finally {
      restore();
    }
  }

  /**
   * warmup と同じ。描画の前に、同じ状態のシェーダを並列にコンパイルし終えるまで(メインスレッドを止めずに)待つ。
   * 起動時用(この間、走行シーンは描かれていないので、車を足したままでも見えない)。
   */
  public async warmupAsync(cars: CarBase[] = []): Promise<void> {
    const restore = this.prepareWarmup(cars);
    try {
      await compileInParallel(this.renderer, this.scene, this.camera, this.postFx.sceneTarget);
      this.renderScene();
      this.renderer.getContext().finish();
    } finally {
      restore();
    }
  }

  /** warmup の状態にする(車を足し、視錐台カリングを外す)。戻す関数を返す。 */
  private prepareWarmup(cars: CarBase[]): () => void {
    const prevParents = new Map<THREE.Object3D, THREE.Object3D | null>();
    for (const c of cars) {
      prevParents.set(c.group, c.group.parent);
      this.scene.add(c.group);
    }
    this.applyPaintEnvironment();
    const toggled: THREE.Object3D[] = [];
    const unculled = (o: THREE.Object3D): void => {
      if (o.userData?.skipWarmup) return;
      if (o.frustumCulled) {
        o.frustumCulled = false;
        toggled.push(o);
      }
      for (const child of o.children) unculled(child);
    };
    unculled(this.scene);
    return () => {
      for (const o of toggled) o.frustumCulled = true;
      for (const c of cars) {
        this.scene.remove(c.group);
        const p = prevParents.get(c.group);
        if (p) p.add(c.group);
      }
    };
  }

  public start(): void {
    this.active = true;
    forceSinglePassForTransparent(this.scene);   // 透明で両面の素材が、毎フレーム2回描かれ、そのたびにシェーダを照合し直すのを防ぐ

    if (this.rainy) audio.sfx.startRain();
    this.clock.start();
    if (this.animationFrameId === null) {
      this.animationFrameId = requestAnimationFrame(this.animate.bind(this));
    }
  }

  public stop(): void {
    this.active = false;
    audio.bgm.setDrive(null);
    audio.sfx.stopRain();
    this.resultView = false;
    this.resultBlend = 0;
    if (this.viewOffsetOn) { this.camera.clearViewOffset(); this.viewOffsetOn = false; }
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /** 後処理(ブルーム・色調補正)を通して描画する。?fx=0 で無効。 */
  private renderScene(): void {
    if (this.postFx.enabled) this.postFx.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private onResize(): void {
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  private updateCamera(dt: number): void {
    if (!this.carController || !this.currentCar) return;

    const carPos = this.carController.position;
    const rotY = this.carController.rotationY;
    let mode = this.carController.cameraMode;
    if (mode === 'cockpit' || mode === 'hood') mode = 'chase';

    // 前方の視点: 押している間だけ。ボタンでの視点切り替えなのでアニメーションはつけず、効果音だけ鳴らす
    const wantFront = mode !== 'orbit' && (this.frontKeyHeld || this.frontPadHeld);
    if (wantFront !== this.frontActive) {
      this.frontActive = wantFront;
      audio.sfx.cameraSwitch(wantFront ? 'front' : 'back');
      this.camera.fov = 54;
      this.camera.updateProjectionMatrix();
    }
    // ゴール後のリザルト: カメラが車の周りを後ろから前へ回り込み、車は右へ寄る(リザルトは左に出る)
    const kr = 1 - Math.exp(-1.5 * dt);
    this.resultBlend += ((this.resultView ? 1 : 0) - this.resultBlend) * kr;
    const e = this.resultBlend * this.resultBlend * (3 - 2 * this.resultBlend);
    const front = Math.max(this.frontActive ? 1 : 0, e);

    if (mode === 'chase') {
      this.controls.enabled = false;
      const speedFactor = Math.min(1.0, Math.abs(this.carController.speed) / this.carController.maxSpeed);
      // Frame-rate independent exponential smoothing. Only the distance / height / heading are smoothed, never the
      // absolute position: smoothing the position makes the camera trail the car by speed / rate metres (10 m at top speed).
      const k = (rate: number): number => 1 - Math.exp(-rate * dt);
      const cc = this.carController;
      const m = this.motionScale;
      // 加速で後ろへ引かれ、減速で車へ寄る。ブーストでは低く構える
      const pull = THREE.MathUtils.clamp(this.accelSm, -14, 10) * 0.07;
      this.chaseDist += (4.4 + speedFactor * 1.1 + (this.boostLevel * 1.4 + this.distKick + pull) * m + e * 1.4 - this.chaseDist) * k(4);
      this.chaseHeight += (2.9 - speedFactor * 0.25 - this.boostLevel * 0.45 * m + pull * 0.12 - e * 1.5 - this.chaseHeight) * k(4);
      let dh = rotY - this.chaseHeading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.chaseHeading += dh * k(7 - 3.5 * cc.driftFactor);   // the view swings a little in corners (more slowly in a drift, so the slide shows), then settles
      const cf = this.camFwd.set(Math.sin(this.chaseHeading), 0, Math.cos(this.chaseHeading));
      // 前方の視点では、カメラを車の真正面(車の周りを180°回った位置)へ置く
      const orbit = this.chaseHeading + front * Math.PI + e * 0.28 * Math.sin(this.fxTime * 0.5);   // 前に回り込んだあとも、ゆっくり揺れる
      const camDir = this.camDir.set(Math.sin(orbit), 0, Math.cos(orbit));

      this.currentCameraPos.copy(carPos)
        .sub(camDir.multiplyScalar(this.chaseDist));
      this.currentCameraPos.y += this.chaseHeight;
      this.camera.position.copy(this.currentCameraPos);

      // 斜め上から見下ろす視点。注視点を車の近くに置いて、カメラを下へ向ける(俯角は低速で約16°、最高速で約12°)
      const lookAhead = (2.4 + speedFactor * 2.0) * (1 - front);   // 前方の視点では車そのものを見る
      // ドリフト中は、車の向きではなく進んでいく方向へ視線を寄せる(スライドの先を見る)
      const lookHeading = this.chaseHeading - cc.slipAngle * 0.6 * cc.driftFactor * (1 - front);
      cf.set(Math.sin(lookHeading), 0, Math.cos(lookHeading));
      this.cameraLookTarget.copy(carPos).add(cf.multiplyScalar(lookAhead));
      this.cameraLookTarget.y += 0.9;
      this.camera.lookAt(this.cameraLookTarget);
      // ドリフトの向きへカメラを傾ける
      const steerLean = cc.currentSteerAngle * 0.14 * speedFactor * (1 - cc.driftFactor);   // ハンドルを切った側へ、カメラも傾く
      this.camLean += ((cc.driftFactor * cc.driftDirection * 0.045 + steerLean) * m - this.camLean) * k(6);
      this.camera.rotateZ(this.camLean);

    } else if (mode === 'orbit') {
      this.controls.enabled = true;
      this.controls.target.copy(carPos);
      this.controls.target.y += 0.8;
      this.controls.update();
    }

    // リザルト中は、画面全体を右へずらして、左側をリザルトに空ける
    if (e > 0.002) {
      const w = this.renderer.domElement.clientWidth, h = this.renderer.domElement.clientHeight;
      this.camera.setViewOffset(w, h, -e * 0.2 * w, 0, w, h);
      this.viewOffsetOn = true;
    } else if (this.viewOffsetOn) {
      this.camera.clearViewOffset();
      this.viewOffsetOn = false;
    }

    // 高速走行・ブースト中の微振動(なめらかな揺れ)
    if (mode === 'chase' && this.carController) {
      const sf = Math.min(1, Math.abs(this.carController.speed) / this.carController.maxSpeed);
      const amp = (Math.max(0, sf - 0.35) * 0.02 + this.boostLevel * 0.055) * this.motionScale;
      if (amp > 0.0005) {
        const t = this.fxTime;
        this.camera.position.x += (Math.sin(t * 37.1) + Math.sin(t * 23.7 + 1.3)) * 0.5 * amp;
        this.camera.position.y += (Math.sin(t * 41.3 + 0.4) + Math.sin(t * 29.9)) * 0.5 * amp;
        this.camera.rotateZ(Math.sin(t * 31.7) * amp * 0.12);
      }
    }

    // Camera shake (collisions, landings, boost end)
    if (this.cameraTrauma > 0) {
      this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 2.5);
      const shake = this.cameraTrauma * this.cameraTrauma;
      const shakeX = (untrackedRandom() - 0.5) * shake * 0.45;
      const shakeY = (untrackedRandom() - 0.5) * shake * 0.45;
      const shakeZ = (untrackedRandom() - 0.5) * shake * 0.3;
      this.camera.position.x += shakeX;
      this.camera.position.y += shakeY;
      this.camera.position.z += shakeZ;
      this.camera.rotation.z += (untrackedRandom() - 0.5) * shake * 0.04;
    }
  }

  /** ブースト終了: マフラーからの破裂音と、小さな炎と火花 */
  private backfire(cc: CarController): void {
    audio.sfx.backfire();
    this.updateExhaust(cc);
    for (const pos of [this.exhaustL, this.exhaustR]) {
      for (let i = 0; i < 4; i++) this.tireSmoke.emitFlame(pos, this.carVel, 1.4);
      for (let i = 0; i < 5; i++) this.tireSmoke.emitSpark(pos, this.carVel, i % 2 ? 1 : -1, 1.2, false);
    }
    this.addCameraTrauma(0.08);
  }

  /** 排気口の位置(後輪の少し内側・後ろ・上)を exhaustL / exhaustR に入れる。 */
  private updateExhaust(cc: CarController): void {
    const back = this.scratch.set(-Math.sin(cc.rotationY) * 0.55, 0.4, -Math.cos(cc.rotationY) * 0.55);
    this.exhaustL.copy(this.tires.rearLeft).lerp(cc.position, 0.35).add(back);
    this.exhaustR.copy(this.tires.rearRight).lerp(cc.position, 0.35).add(back);
  }

  /** 交通車まわりの演出: すれ違いの風切り音とスリップストリーム(前の車の真後ろでは空気の筋が集まる。速さは変えない)。 */
  private updateTrafficFx(dt: number, cc: CarController): void {
    const traffic = this.currentMap?.traffic;
    let slip = 0;
    if (traffic) {
      const fx = Math.sin(cc.rotationY), fz = Math.cos(cc.rotationY);
      for (const n of traffic.cars) {
        const dx = n.obj.position.x - cc.position.x, dz = n.obj.position.z - cc.position.z;
        if (Math.abs(dx) > 40 || Math.abs(dz) > 40) continue;
        const along = dx * fx + dz * fz;
        const lateral = Math.abs(dx * fz - dz * fx);
        const prev = this.passPrev.get(n);
        this.passPrev.set(n, along);
        if (prev !== undefined && prev > 0 && along <= 0 && lateral < 7) {
          const rel = n.isForward ? cc.speed - n.speed : cc.speed + n.speed;
          if (rel > 12) {
            const close = 1 - lateral / 7;
            audio.sfx.passBy(rel, close);
            this.addCameraTrauma(0.06 * close);
            this.flash = Math.max(this.flash, 0.12 * close);
          }
        }
        // 前を走る車の真後ろ(4〜32m、横2.4m以内)
        if (n.isForward && along > 4 && along < 32 && lateral < 2.4 && cc.speed > 15) {
          slip = Math.max(slip, (1 - (along - 4) / 28) * (1 - lateral / 2.4));
        }
      }
    }
    this.slipstream += (slip - this.slipstream) * (1 - Math.exp(-(slip > this.slipstream ? 3 : 1.5) * dt));
  }

  /** 稲光: ときどき空が光り、少し遅れて雷鳴が届く。 */
  private updateLightning(dt: number): void {
    if (this.lightning.update(dt)) {
      untrackedTimeout(() => { if (this.rainy && this.active) audio.sfx.thunder(); }, 500 + audioRandom() * 1800);
    }
    this.postFx.setLightning(this.lightning.level);
    this.hemiLight.intensity = this.hemiBase + this.lightning.level * 1.2;
  }

  /** 速度・ブースト・ドリフトに連動した演出の更新: FOV、衝撃のキック、後処理、ブーストの炎。 */
  private updateSpeedFx(dt: number): void {
    const cc = this.carController!;
    const m = this.motionScale;
    const k = (rate: number): number => 1 - Math.exp(-rate * dt);
    this.fxTime += dt;
    const sf = Math.min(1, Math.abs(cc.speed) / cc.maxSpeed);
    const boosting = cc.boostTimer > 0;
    this.lastSpeedFactor = sf;
    if (this.fxPrimed && dt > 0) this.accelSm += ((cc.speed - this.prevAccelSpeed) / dt - this.accelSm) * k(5);
    this.prevAccelSpeed = cc.speed;

    // ブースト開始・ドリフト確定(ブーストの残りが増えた瞬間)にパンチを入れる
    if (cc.boostTimer > this.prevBoostTimer + 0.05) {
      const fresh = this.prevBoostTimer <= 0;
      const pu = this.boostTheme.punch;
      this.fovKick = Math.max(this.fovKick, fresh ? pu.fov : pu.fov * 0.65);
      this.distKick = Math.max(this.distKick, fresh ? pu.dist : pu.dist * 0.62);
      this.flash = pu.flash;
      this.roadVfx.fireShockwave(cc.position, fresh ? 22 : 14, this.boostTheme);
      if (fresh) audio.sfx.boostStart();
      this.addCameraTrauma(fresh ? pu.trauma : pu.trauma * 0.67);
      this.boostBurst(cc, fresh);
    }
    if (this.prevBoostTimer > 0 && cc.boostTimer <= 0) this.backfire(cc);
    this.prevBoostTimer = cc.boostTimer;

    // 着地の衝撃と、壁・車への接触(1フレームでの急な減速)
    const y = cc.position.y;
    if (this.fxPrimed && dt > 0) {
      const vy = (y - this.prevY) / dt;
      if (Math.abs(vy) < 60) {
        if (this.prevVy < -5 && vy > this.prevVy + 5) {
          this.addCameraTrauma(Math.min(0.55, -this.prevVy * 0.05));
          // 着地: 車体の下から火花
          const under = this.scratch.copy(cc.position);
          under.y += 0.15;
          for (let i = 0; i < 12; i++) this.tireSmoke.emitSpark(under, this.carVel, i % 2 ? 1 : -1, 1.4, false);
        }
        this.prevVy = vy;
      }
      if (this.prevSpeed - cc.speed > 5) {
        this.addCameraTrauma(Math.min(0.5, (this.prevSpeed - cc.speed) * 0.05));
        // 衝突の火花: 車の周りへ一斉に飛び散る
        const at = this.scratch.copy(cc.position);
        at.y += 0.5;
        for (let i = 0; i < 16; i++) this.tireSmoke.emitSpark(at, this.carVel, i % 2 ? 1 : -1, 1.8, false);
        this.flash = Math.max(this.flash, 0.35);
      }
    }
    this.prevY = y;
    this.prevSpeed = cc.speed;
    this.fxPrimed = true;

    this.boostLevel += ((boosting ? 1 : 0) - this.boostLevel) * k(boosting ? 8 : 3);
    this.fovKick *= Math.exp(-5 * dt);
    this.distKick *= Math.exp(-3 * dt);
    this.flash *= Math.exp(-6 * dt);

    // FOV: 速度で広がり、ブーストでさらに広がる
    const fovTarget = 54 + (Math.pow(sf, 1.5) * 14 + this.boostLevel * 11 + this.fovKick + this.slipstream * 3) * m;
    const fov = this.frontActive || this.resultView ? 54 : fovTarget;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov += (fov - this.camera.fov) * Math.min(1, 8 * dt);
      this.camera.updateProjectionMatrix();
    }

    // 風切り音、路肩の反射板の列、すれ違い、スリップストリーム
    audio.sfx.setWind(sf, this.boostLevel);
    this.rhythm.update(cc.position, this.timeOfDay === 'night');
    this.callbacks.onFxUpdate?.(sf, this.boostLevel, this.slipstream);
    this.updateTrafficFx(dt, cc);

    // 路面・車まわりの演出(光跡・タイヤ痕・アンダーグロー・衝撃波)
    const slip = Math.abs(cc.slipAngle);
    const skidding = cc.isDrifting || (cc.speed > 8 && slip > 0.1);
    this.roadVfx.update(dt, cc, this.tires, skidding, Math.min(1, slip * 3), this.timeOfDay === 'night', cc.driftFactor, this.boostLevel, m, this.boostTheme);

    // ニアミス: 走行中の車の脇をかすめた瞬間に、小さなパンチと風切り音
    this.nearMissCooldown = Math.max(0, this.nearMissCooldown - dt);
    const traffic = this.currentMap?.traffic;
    if (traffic && this.nearMissCooldown <= 0 && cc.speed > 16) {
      const px = cc.position.x, pz = cc.position.z;
      for (const n of traffic.cars) {
        const dx = n.obj.position.x - px, dz = n.obj.position.z - pz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 2.3 * 2.3 && d2 < 3.6 * 3.6) {
          this.nearMissCooldown = 0.7;
          this.fovKick = Math.max(this.fovKick, 5);
          this.flash = Math.max(this.flash, 0.25);
          this.addCameraTrauma(0.12);
          audio.sfx.nearMiss();
          break;
        }
      }
    }

    const map = this.currentMap;
    audio.bgm.setDrive(sf, this.boostLevel, map?.competitive ? map.getProgressFraction() : null);                    // 音源のBGMも速度・ブーストに合わせて抜けが変わる
    // ゴール前(進行度80%〜)は色が鮮やかになり、縁が暖色にゆっくり脈打つ
    const finale = map?.competitive ? Math.min(1, Math.max(0, (map.getProgressFraction() - 0.8) / 0.2)) : 0;
    this.postFx.setMotion(0.55 * m, cc.position);
    this.postFx.setSpeedState(sf, this.boostLevel, this.flash, Math.min(1, this.cameraTrauma), m, finale, cc.driftFactor);

    // 雨: 雨粒・稲光・水しぶき
    if (this.rainy) {
      this.rainSystem.update(dt, cc.position, cc.rotationY, this.carVel, this.timeOfDay === 'night');
      this.updateLightning(dt);
      if (cc.speedKmH > 45) {
        const spray = Math.min(1.0, 0.35 + (cc.speedKmH - 45) / 90);
        const tr = this.tires;
        for (const w of [tr.rearLeft, tr.rearRight]) this.tireSmoke.emitSmoke(w, this.carVel, spray);
        if (cc.speedKmH > 90) for (const w of [tr.frontLeft, tr.frontRight]) this.tireSmoke.emitSmoke(w, this.carVel, spray * 0.5);
        // 水はね: タイヤが跳ね上げた水の粒(車より遅く、後ろへ置いていかれる)。ドリフト中は多く、外へ大きく飛ぶ
        const lat = this.lateral.set(Math.cos(cc.rotationY), 0, -Math.sin(cc.rotationY));
        const water = this.waterVel.copy(this.carVel).multiplyScalar(0.4);
        const n = (cc.speedKmH > 80 ? 0.7 : 0.4) + (cc.isDrifting ? 0.5 : 0);   // 1フレームに出す粒の数の期待値
        for (const w of [tr.rearLeft, tr.rearRight, tr.frontLeft, tr.frontRight]) {
          if (untrackedRandom() >= n) continue;
          const side = Math.sign((w.x - cc.position.x) * lat.x + (w.z - cc.position.z) * lat.z) || 1;
          this.tireSmoke.emitSplash(w, water, this.outward.copy(lat).multiplyScalar(side), spray * (cc.isDrifting ? 1.2 : 1));
        }
      }
    }

    // 風切りの筋(車の周りを後ろへ流れる光の線)
    this.speedStreaks.update(dt, cc.position, cc.velocityHeading, Math.abs(cc.speed), Math.max(Math.max(0, (sf - 0.4) / 0.6), this.slipstream * 0.9) * m, this.boostLevel * m, this.boostTheme.streak);

    // ブースト中は排気口から、車の主色の炎。車ごとに、さらに固有の演出が加わる
    if (this.boostLevel > 0.15) {
      this.updateExhaust(cc);
      const lv = this.boostLevel;
      const th = this.boostTheme;
      this.tireSmoke.emitFlame(this.exhaustL, this.carVel, lv);
      this.tireSmoke.emitFlame(this.exhaustR, this.carVel, lv);
      if (th.kind === 'fire') {
        // 炎息: 火の粉が排気口から舞い上がる
        for (let i = 0; i < 2; i++) {
          this.tireSmoke.emitEmber(this.exhaustL, this.carVel, lv);
          this.tireSmoke.emitEmber(this.exhaustR, this.carVel, lv);
        }
      } else if (th.kind === 'storm') {
        // 雷: 車の横を、電撃が走る
        this.boltCarry += dt * 16 * lv;
        const n = Math.floor(this.boltCarry);
        this.boltCarry -= n;
        if (n > 0) this.tireSmoke.emitBolts(n, cc.position, cc.rotationY, this.carVel);
      } else if (th.kind === 'radiant') {
        // 黄金の咆哮: 4連ノズル(内側の2本を足す)と、金の粉
        this.exhaustInnerL.lerpVectors(this.exhaustL, this.exhaustR, 0.3);
        this.exhaustInnerR.lerpVectors(this.exhaustL, this.exhaustR, 0.7);
        this.tireSmoke.emitFlame(this.exhaustInnerL, this.carVel, lv * 0.85);
        this.tireSmoke.emitFlame(this.exhaustInnerR, this.carVel, lv * 0.85);
        if (untrackedRandom() < lv * 0.9) this.tireSmoke.emitMote(cc.position, this.carVel, 1.3);
      }
    }
  }

  /** ブーストに入った瞬間の、車ごとの固有の演出(主色の衝撃波は fireShockwave が出す) */
  private boostBurst(cc: CarController, fresh: boolean): void {
    this.updateExhaust(cc);
    const k = fresh ? 1 : 0.5;
    switch (this.boostTheme.kind) {
      case 'fire':      // 火の粉が一気に噴き上がる
        for (const pos of [this.exhaustL, this.exhaustR]) {
          for (let i = 0; i < 18 * k; i++) this.tireSmoke.emitEmber(pos, this.carVel, 1.8);
          for (let i = 0; i < 3; i++) this.tireSmoke.emitFlame(pos, this.carVel, 1.5);
        }
        break;
      case 'storm':     // 電撃が車の周りに一斉に走る
        this.tireSmoke.emitBolts(Math.round(10 * k), cc.position, cc.rotationY, this.carVel);
        break;
      case 'radiant':   // 金の粉が車の周りに舞い上がる
        for (let i = 0; i < 34 * k; i++) this.tireSmoke.emitMote(cc.position, this.carVel, 1.8);
        break;
    }
  }

  private addCameraTrauma(amount: number): void {
    this.cameraTrauma = Math.min(1.0, this.cameraTrauma + amount);
  }

  private animate = (): void => {
    if (!this.active) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.step(Math.min(this.clock.getDelta(), 0.1));
  };

  /** Advance simulation + camera by dt seconds and render one frame. */
  public step(dt: number, render: boolean = true): void {
    if (this.paused) {                                          // frozen: keep showing the last frame
      audio.bgm.setDrive(null);
      if (render) this.renderScene();
      return;
    }
    // 1. Update car physics & mechanics
    if (this.carController) {
      this.carController.update(dt);
      this.callbacks.onBeforeConstrain?.(this.carController, dt);
      if (this.currentMap) {
        this.currentMap.constrainCar(this.carController, dt);
        this.currentMap.update(dt, this.carController.position);
        this.carController.syncTransform();
      }

      // 1フレームに1度だけ: タイヤの接地点と、車の進む速度
      const ccNow = this.carController;
      this.tires = ccNow.getTireContactPositions();
      this.carVel.set(Math.sin(ccNow.velocityHeading) * ccNow.speed, 0, Math.cos(ccNow.velocityHeading) * ccNow.speed);

      // Headlights follow the car
      if (this.headSpot.visible) {
        const c = this.carController, fx = Math.sin(c.rotationY), fz = Math.cos(c.rotationY);
        this.headSpot.position.set(c.position.x + fx * 1.6, c.position.y + 0.85, c.position.z + fz * 1.6);
        this.headSpot.target.position.set(c.position.x + fx * 30, c.position.y - 1.5, c.position.z + fz * 30);
        this.headSpot.target.updateMatrixWorld();
      }

      // Move sun light with car for optimal shadow coverage
      if (this.sunLight) {
        this.sunLight.position.x = this.carController.position.x + 120;
        this.sunLight.position.z = this.carController.position.z + 80;
        this.sunLight.target.position.copy(this.carController.position);
        this.sunLight.target.updateMatrixWorld();
      }

      // Sky dome follows car & updates dynamic moving clouds
      if (this.skyUniforms) {
        this.skyUniforms.uTime.value += dt;
        if (this.sunLight) {
          this.skyUniforms.uSunDir.value.copy(this.sunLight.position).sub(this.carController.position).normalize();
        }
      }
      if (this.skyMesh) {
        this.skyMesh.position.copy(this.carController.position);
      }

      // Notify HUD
      if (this.callbacks.onSpeedUpdate) {
        this.callbacks.onSpeedUpdate(
          this.carController.speedKmH,
          this.carController.rpm,
          this.carController.gear,
          this.carController.isDrifting
        );
      }
      if (this.callbacks.onProgressUpdate && this.currentMap) {
        const frac = this.currentMap.getProgressFraction();
        this.callbacks.onProgressUpdate(frac, this.carController.speedKmH, dt);
      }
      if (this.callbacks.onPositionUpdate) {
        const fwdTraffic = this.currentMap?.traffic?.getForwardCarPositions() ?? [];
        this.callbacks.onPositionUpdate(
          this.carController.position,
          this.carController.rotationY,
          fwdTraffic
        );
      }

      // Tire visual effects: Sparks during drift, Smoke during high-speed redline
      if (this.tireSmoke && this.carController) {
        const tires = this.tires;
        const moveVector = this.carVel;
        const speedKmH = this.carController.speedKmH;
        const slip = Math.abs(this.carController.slipAngle);

        // 1. DRIFT SPARKS: Emit glowing friction sparks while drifting
        if (this.carController.isDrifting || (this.carController.speed > 8.0 && slip > 0.10)) {
          const sparkIntensity = Math.min(1.45, slip * 2.4 + 0.4) * (1 + this.boostLevel * 0.4);
          const blue = this.boostLevel > 0.3;
          this.tireSmoke.emitSpark(tires.rearLeft, moveVector, this.carController.driftDirection, sparkIntensity, blue);
          this.tireSmoke.emitSpark(tires.rearRight, moveVector, this.carController.driftDirection, sparkIntensity, blue);

          // Deep drift also sparks lightly from front outside tire
          if (this.carController.isDrifting && slip > 0.22) {
            const outsideFrontTire = this.carController.driftDirection === 1 ? tires.frontRight : tires.frontLeft;
            this.tireSmoke.emitSpark(outsideFrontTire, moveVector, this.carController.driftDirection, sparkIntensity * 0.7, blue);
          }
        }

        // 1b. DRIFT SMOKE: 滑っている間は白煙をもくもくと出す
        if (this.carController.isDrifting && slip > 0.08) {
          const driftSmoke = Math.min(1.6, 0.6 + slip * 3.0);
          this.tireSmoke.emitSmoke(tires.rearLeft, moveVector, driftSmoke);
          this.tireSmoke.emitSmoke(tires.rearRight, moveVector, driftSmoke);
        }

        // 2. HIGH SPEED TIRE SMOKE: Emit continuous smoke when speed reaches redline gauge (>= 115 km/h)
        if (speedKmH >= 115) {
          const highSpeedIntensity = Math.min(1.4, 0.4 + (speedKmH - 115) / 20);
          this.tireSmoke.emitSmoke(tires.rearLeft, moveVector, highSpeedIntensity);
          this.tireSmoke.emitSmoke(tires.rearRight, moveVector, highSpeedIntensity);
        }
      }
    }

    // 2. Update Camera FOV and the speed effects
    if (this.carController) {
      const windshield = this.currentCar?.windshield;
      if (windshield) windshield.visible = true;
      // ドラゴン・カーの角・翼・尻尾(多関節FK)。速いほど翼と尻尾の振れが大きくなる
      if (this.currentCar instanceof DragonCarModel) {
        this.dragonTime += dt;
        const cc = this.carController;
        this.currentCar.updateDragonParts(this.dragonTime, Math.abs(cc.speed) / Math.max(1, cc.maxSpeed));
      }
      this.updateSpeedFx(dt);
    }
    this.updateCamera(dt);

    // 2b. Update tire smoke billboards with updated camera
    if (this.tireSmoke) {
      this.tireSmoke.update(dt, this.camera);
    }

    // 3. Render
    if (render) this.renderScene();
  }
}
