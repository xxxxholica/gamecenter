import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class GarageScene {
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public controls: OrbitControls;
  public turntableGroup: THREE.Group;
  public isRotating: boolean = true;
  private rotationSpeed: number = 0.005;

  constructor(container: HTMLElement) {
    // 1. Scene setup
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0f17);
    this.scene.fog = new THREE.FogExp2(0x0c0f17, 0.035);

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
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // 4. Controls setup
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03; // Don't clip below floor
    this.controls.minDistance = 1.2;
    this.controls.maxDistance = 14.0;
    this.controls.target.set(0, 0.9, 0);

    // 5. Turntable Group (Car sits on this)
    this.turntableGroup = new THREE.Group();
    this.scene.add(this.turntableGroup);

    // 6. Garage environment
    this.setupLighting();
    this.setupEnvironment();

    // 7. Event listeners
    window.addEventListener('resize', this.onWindowResize.bind(this, container));
  }

  private setupLighting(): void {
    // Ambient light with soft blue/neutral tint
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    this.scene.add(ambientLight);

    // Main key light (angled high directional light with crisp soft shadow)
    const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
    keyLight.position.set(5, 8, 4);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 4;
    keyLight.shadow.camera.bottom = -4;
    keyLight.shadow.bias = -0.0003;
    this.scene.add(keyLight);

    // Fill light from opposite side (cool blue fill)
    const fillLight = new THREE.DirectionalLight(0x70a1ff, 1.2);
    fillLight.position.set(-6, 4, -4);
    this.scene.add(fillLight);

    // Overhead showroom spotlight (creates beautiful roof/hood highlight)
    const topSpot = new THREE.SpotLight(0xfff3e0, 3.5, 12, Math.PI / 4, 0.3, 1);
    topSpot.position.set(0, 5, 0);
    topSpot.target.position.set(0, 0.8, 0);
    this.scene.add(topSpot);
    this.scene.add(topSpot.target);

    // Rim light from behind (creates edge specular highlights)
    const rimLight = new THREE.DirectionalLight(0xffbe76, 1.4);
    rimLight.position.set(0, 2, -6);
    this.scene.add(rimLight);
  }

  private setupEnvironment(): void {
    // Wet showroom dark floor with soft reflection
    const floorGeo = new THREE.PlaneGeometry(60, 60);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x10131d,
      roughness: 0.25,
      metalness: 0.6,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Subtle showroom grid helper
    const grid = new THREE.GridHelper(30, 30, 0x3d485e, 0x1f2430);
    grid.position.y = 0.002;
    this.scene.add(grid);

    // Turntable circular podium
    const podiumGeo = new THREE.CylinderGeometry(2.4, 2.45, 0.06, 64);
    const podiumMat = new THREE.MeshStandardMaterial({
      color: 0x161a24,
      roughness: 0.35,
      metalness: 0.5,
    });
    const podium = new THREE.Mesh(podiumGeo, podiumMat);
    podium.position.y = 0.03;
    podium.receiveShadow = true;
    this.turntableGroup.add(podium);

    // LED ring around the turntable podium edge
    const ringGeo = new THREE.TorusGeometry(2.41, 0.015, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf7b731 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.055;
    this.turntableGroup.add(ring);

    // Overhead illuminated softbox frame (visual only)
    const softboxGeo = new THREE.PlaneGeometry(3.5, 2.2);
    const softboxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const softbox = new THREE.Mesh(softboxGeo, softboxMat);
    softbox.rotation.x = Math.PI / 2;
    softbox.position.set(0, 4.8, 0);
    this.scene.add(softbox);

    // High-contrast studio lighting environment map for car paint, clearcoat, and chrome gloss
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envCanvas = document.createElement('canvas');
    envCanvas.width = 512;
    envCanvas.height = 256;
    const ctx = envCanvas.getContext('2d');
    if (ctx) {
      // Dark showroom background
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, 512, 256);

      // Floor dark horizon bounce
      const floorGrad = ctx.createLinearGradient(0, 128, 0, 256);
      floorGrad.addColorStop(0, '#1a1f2c');
      floorGrad.addColorStop(1, '#06080d');
      ctx.fillStyle = floorGrad;
      ctx.fillRect(0, 128, 512, 128);

      // Overhead large softbox highlight
      const topGrad = ctx.createRadialGradient(256, 40, 5, 256, 40, 120);
      topGrad.addColorStop(0, '#ffffff');
      topGrad.addColorStop(0.3, '#edf2f7');
      topGrad.addColorStop(1, 'rgba(237, 242, 247, 0)');
      ctx.fillStyle = topGrad;
      ctx.fillRect(100, 0, 312, 100);

      // Flank light strips for body curve reflections
      const sideL = ctx.createLinearGradient(0, 0, 90, 0);
      sideL.addColorStop(0, '#718096');
      sideL.addColorStop(1, 'rgba(113, 128, 150, 0)');
      ctx.fillStyle = sideL;
      ctx.fillRect(0, 60, 90, 80);

      const sideR = ctx.createLinearGradient(512, 0, 422, 0);
      sideR.addColorStop(0, '#718096');
      sideR.addColorStop(1, 'rgba(113, 128, 150, 0)');
      ctx.fillStyle = sideR;
      ctx.fillRect(422, 60, 90, 80);
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

  public active: boolean = false;
  private animationFrameId: number | null = null;

  public start(): void {
    if (this.active) return;
    this.active = true;
    this.controls.enabled = true;
    this.animate();
  }

  public stop(): void {
    this.active = false;
    this.controls.enabled = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public animate(): void {
    if (!this.active) return;
    this.animationFrameId = requestAnimationFrame(this.animate.bind(this));

    // Auto rotate turntable if enabled
    if (this.isRotating) {
      this.turntableGroup.rotation.y += this.rotationSpeed;
    }

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
