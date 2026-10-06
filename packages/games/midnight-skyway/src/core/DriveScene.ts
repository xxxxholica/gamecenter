import { PostFX } from './PostFX';
import { audio } from '../audio';
import { createSkyEnvironments, type SkyEnvironments } from './SkyEnvironment';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { MapBase } from '../maps/MapBase';
import { CarBase } from '../models/CarBase';
import { CarController, CameraMode } from './CarController';
import { TireSmokeSystem } from './TireSmokeSystem';
import type { TimeOfDay } from './TimeOfDay';

export interface DriveSceneCallbacks {
  onSpeedUpdate?: (speedKmH: number, rpm: number, gear: string, isDrifting?: boolean) => void;
  onPositionUpdate?: (carPos: THREE.Vector3, carRotY: number, forwardTraffic: THREE.Vector2[]) => void;
  onProgressUpdate?: (fraction: number, speedKmH: number, dt: number) => void;
  onCameraModeChange?: (mode: CameraMode) => void;
  /** 自車の物理の直後、マップの拘束(壁・路面)の前。オンライン対戦の車同士の当たり判定に使う。 */
  onBeforeConstrain?: (car: CarController, dt: number) => void;
}

/**
 * 太陽の影マップ。dGPU搭載PC向けに 4096px とし、範囲を自車の周囲(約120m四方)に絞る。
 * 1テクセル約3cm(以前は 2048px・160m四方で約8cm)になり、車や標識の影の輪郭がはっきりする。
 */
const SHADOW_MAP_SIZE = 4096;
const SHADOW_HALF_EXTENT = 60;

export class DriveScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;

  public currentMap: MapBase | null = null;
  public currentCar: CarBase | null = null;
  private skyEnv: SkyEnvironments | null = null;
  private postFx: PostFX;
  public carController: CarController | null = null;
  public tireSmoke: TireSmokeSystem;

  public active: boolean = false;
  private animationFrameId: number | null = null;
  private clock: THREE.Clock;

  // Chase camera state: the camera follows the car at a fixed distance; only its heading lags a little behind the car's
  private cameraLookTarget = new THREE.Vector3();
  private currentCameraPos = new THREE.Vector3();
  // 押している間だけ、車の前から車を映す視点(Vキー / アケコンのY)。離すと元の視点へ戻る
  private frontKeyHeld = false;
  private frontPadHeld = false;
  private frontActive = false;         // 前方の視点が出ているか(視点はボタンで即座に切り替わる)
  private chaseHeading = 0;
  private chaseDist = 4.4;
  private chaseHeight = 2.9;

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

    // 5. Window resize
    window.addEventListener('resize', this.onResize.bind(this));

    // 6. Camera mode switch key (C key)
    window.addEventListener('keydown', (e) => {
      if (!this.active) return;
      if (e.code === 'KeyC') this.cycleCameraMode();
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
    // The ortho box below is only 160x160m, so 2048px already resolves to ~8cm/texel — 4096 measured indistinguishable
    // in practice and just doubles shadow-map fill/memory cost for no visible gain.
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
    this.hemiLight.intensity = night ? 1.0 : 0.45;
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

  public loadMap(map: MapBase): void {
    if (this.currentMap) {
      this.scene.remove(this.currentMap.group);
      this.currentMap.dispose();
    }

    this.currentMap = map;
    map.attachRenderer(this.renderer);
    this.scene.add(map.group);
    this.applyPaintEnvironment();                                  // NPC車の塗装にも環境マップを持たせる
    if (this.scene.fog instanceof THREE.FogExp2) this.scene.fog.density = map.fogDensity ?? 0.0035;
    this.camera.far = map.viewDistance ?? 2000;
    this.camera.updateProjectionMatrix();
    map.setNight(this.timeOfDay === 'night');

    // If car exists, respawn it at map start point
    if (this.carController) {
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

    this.applyPaintEnvironment();
    this.respawnCar();
  }

  public respawnCar(): void {
    if (!this.carController || !this.currentMap) return;
    this.tireSmoke?.reset();
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

  public setCameraMode(mode: CameraMode): void {
    if (!this.carController) return;
    this.carController.cameraMode = mode;
    this.controls.enabled = (mode === 'orbit');
    if (mode === 'chase') this.chaseHeading = this.carController.rotationY;   // no swing when coming back to the chase view
    
    // Adjust field of view: natural FOV for first-person cockpit (62°), standard for third-person chase (54°)
    this.camera.fov = mode === 'cockpit' ? 62 : 54;
    this.camera.updateProjectionMatrix();

    this.callbacks.onCameraModeChange?.(mode);
    if (mode === 'orbit' && this.carController) {
      this.controls.target.copy(this.carController.position).add(new THREE.Vector3(0, 0.8, 0));
    }
  }

  /** アケコンのYボタンの押下状態(メニュー表示中などは false を渡す) */
  public setFrontViewPad(held: boolean): void {
    this.frontPadHeld = held;
  }

  public cycleCameraMode(): void {
    if (!this.carController) return;
    // 視点は一人称(cockpit)と三人称後方(chase)の2つに限定
    const modes: CameraMode[] = ['chase', 'cockpit'];
    const currentIdx = modes.indexOf(this.carController.cameraMode);
    const nextMode = modes[(currentIdx + 1) % modes.length];
    this.setCameraMode(nextMode);
    audio.sfx.cameraSwitch('cycle');
  }

  public start(): void {
    this.active = true;
    this.clock.start();
    this.animate();
  }

  public stop(): void {
    this.active = false;
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

    // 前方の視点: 押している間だけ。ボタンでの視点切り替えなのでアニメーションはつけず、効果音だけ鳴らす
    const wantFront = mode !== 'orbit' && (this.frontKeyHeld || this.frontPadHeld);
    if (wantFront !== this.frontActive) {
      this.frontActive = wantFront;
      audio.sfx.cameraSwitch(wantFront ? 'front' : 'back');
      // 運転席視点との行き来でも、視野角はその場で切り替える
      this.camera.fov = mode === 'cockpit' && !wantFront ? 62 : 54;
      this.camera.updateProjectionMatrix();
    }
    // 運転席視点のときも、前方の視点の間は三人称のカメラを使う
    if (mode === 'cockpit' && this.frontActive) {
      mode = 'chase';
    } else if (mode === 'cockpit') {
      this.chaseHeading = rotY;
    }
    const front = this.frontActive ? 1 : 0;

    const forward = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
    const right = new THREE.Vector3(Math.cos(rotY), 0, -Math.sin(rotY));

    if (mode === 'chase') {
      this.controls.enabled = false;
      const speedFactor = Math.min(1.0, Math.abs(this.carController.speed) / this.carController.maxSpeed);
      // Frame-rate independent exponential smoothing. Only the distance / height / heading are smoothed, never the
      // absolute position: smoothing the position makes the camera trail the car by speed / rate metres (10 m at top speed).
      const k = (rate: number): number => 1 - Math.exp(-rate * dt);
      this.chaseDist += (4.4 + speedFactor * 1.1 - this.chaseDist) * k(4);
      this.chaseHeight += (2.9 - speedFactor * 0.25 - this.chaseHeight) * k(4);
      let dh = rotY - this.chaseHeading;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.chaseHeading += dh * k(7);                       // the view swings a little in corners, then settles
      const cf = new THREE.Vector3(Math.sin(this.chaseHeading), 0, Math.cos(this.chaseHeading));
      // 前方の視点では、カメラを車の真正面(車の周りを180°回った位置)へ置く
      const orbit = this.chaseHeading + front * Math.PI;
      const camDir = new THREE.Vector3(Math.sin(orbit), 0, Math.cos(orbit));

      this.currentCameraPos.copy(carPos)
        .sub(camDir.multiplyScalar(this.chaseDist))
        .add(new THREE.Vector3(0, this.chaseHeight, 0));
      this.camera.position.copy(this.currentCameraPos);

      // 斜め上から見下ろす視点。注視点を車の近くに置いて、カメラを下へ向ける(俯角は低速で約16°、最高速で約12°)
      const lookAhead = (2.4 + speedFactor * 2.0) * (1 - front);   // 前方の視点では車そのものを見る
      this.cameraLookTarget.copy(carPos).add(new THREE.Vector3(0, 0.9, 0)).add(cf.multiplyScalar(lookAhead));
      this.camera.lookAt(this.cameraLookTarget);

    } else if (mode === 'cockpit') {
      this.controls.enabled = false;
      // 車種ごとのコクピットアイポイント・注視位置を使用
      const eyeOffset = this.currentCar.cockpitEyeOffset;
      const lookOffset = this.currentCar.cockpitLookOffset;

      const eyePos = carPos.clone()
        .add(right.clone().multiplyScalar(eyeOffset.x))
        .add(new THREE.Vector3(0, eyeOffset.y, 0))
        .add(forward.clone().multiplyScalar(eyeOffset.z));

      this.camera.position.copy(eyePos);
      const lookTarget = eyePos.clone()
        .add(forward.clone().multiplyScalar(lookOffset.z))
        .add(new THREE.Vector3(0, lookOffset.y, 0))
        .add(right.clone().multiplyScalar(lookOffset.x));
      this.camera.lookAt(lookTarget);

    } else if (mode === 'hood') {
      this.controls.enabled = false;
      // Hood / Bumper camera
      const hoodPos = carPos.clone()
        .add(new THREE.Vector3(0, 0.85, 0))
        .add(forward.clone().multiplyScalar(1.2));
      this.camera.position.copy(hoodPos);
      const lookTarget = hoodPos.clone().add(forward.clone().multiplyScalar(20.0));
      this.camera.lookAt(lookTarget);

    } else if (mode === 'orbit') {
      this.controls.enabled = true;
      this.controls.target.copy(carPos).add(new THREE.Vector3(0, 0.8, 0));
      this.controls.update();
    }
  }

  private animate = (): void => {
    if (!this.active) return;
    this.animationFrameId = requestAnimationFrame(this.animate);
    this.step(Math.min(this.clock.getDelta(), 0.1));
  };

  /** Advance simulation + camera by dt seconds and render one frame. */
  public step(dt: number, render: boolean = true): void {
    if (this.paused) {                                          // frozen: keep showing the last frame
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
        const tires = this.carController.getTireContactPositions();
        const moveVector = new THREE.Vector3(
          Math.sin(this.carController.velocityHeading) * this.carController.speed,
          0,
          Math.cos(this.carController.velocityHeading) * this.carController.speed
        );
        const speedKmH = this.carController.speedKmH;
        const slip = Math.abs(this.carController.slipAngle);

        // 1. DRIFT SPARKS: Emit glowing friction sparks while drifting
        if (this.carController.isDrifting || (this.carController.speed > 8.0 && slip > 0.10)) {
          const sparkIntensity = Math.min(1.8, slip * 3.0 + 0.5);
          this.tireSmoke.emitSpark(tires.rearLeft, moveVector, this.carController.driftDirection, sparkIntensity);
          this.tireSmoke.emitSpark(tires.rearRight, moveVector, this.carController.driftDirection, sparkIntensity);

          // Deep drift also sparks lightly from front outside tire
          if (this.carController.isDrifting && slip > 0.22) {
            const outsideFrontTire = this.carController.driftDirection === 1 ? tires.frontRight : tires.frontLeft;
            this.tireSmoke.emitSpark(outsideFrontTire, moveVector, this.carController.driftDirection, sparkIntensity * 0.7);
          }
        }

        // 2. HIGH SPEED TIRE SMOKE: Emit continuous smoke when speed reaches redline gauge (>= 115 km/h)
        if (speedKmH >= 115) {
          const highSpeedIntensity = Math.min(1.4, 0.4 + (speedKmH - 115) / 20);
          this.tireSmoke.emitSmoke(tires.rearLeft, moveVector, highSpeedIntensity);
          this.tireSmoke.emitSmoke(tires.rearRight, moveVector, highSpeedIntensity);
        }
      }
    }

    // 2. Update Camera (mode-dependent FOV, wider view while a drift boost is on)
    if (this.carController) {
      const isCockpit = this.carController.cameraMode === 'cockpit' && !this.frontActive;
      // 一人称ではフロントガラスを消してフルクリアにする(三人称では車体として見せる)
      const windshield = this.currentCar?.windshield;
      if (windshield) windshield.visible = !isCockpit;
      const baseFov = isCockpit ? 62 : 54;
      const fovTarget = this.carController.boostTimer > 0 ? (baseFov + 6) : baseFov;
      if (Math.abs(this.camera.fov - fovTarget) > 0.05) {
        this.camera.fov += (fovTarget - this.camera.fov) * Math.min(1, 6 * dt);
        this.camera.updateProjectionMatrix();
      }
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
