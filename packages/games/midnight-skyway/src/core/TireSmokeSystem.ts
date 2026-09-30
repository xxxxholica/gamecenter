import * as THREE from 'three';

interface SmokeParticle {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  startScale: number;
  endScale: number;
  startOpacity: number;
  active: boolean;
}

interface SparkParticle {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  velocity: THREE.Vector3;
  age: number;
  maxAge: number;
  startScale: number;
  active: boolean;
}

export class TireSmokeSystem {
  public group: THREE.Group;

  // Smoke pool (Used for high-speed friction and heavy skids)
  private smokePool: SmokeParticle[] = [];
  private smokePoolSize: number = 80;
  private smokeTexture: THREE.CanvasTexture;

  // Spark pool (Used for brake-initiated drifts)
  private sparkPool: SparkParticle[] = [];
  private sparkPoolSize: number = 90;
  private sparkTexture: THREE.CanvasTexture;

  private baseGeometry: THREE.PlaneGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'tire_smoke_and_spark_system';

    this.baseGeometry = new THREE.PlaneGeometry(1, 1);

    // 1. Procedural smooth circular cloud/smoke texture
    const smokeCanvas = document.createElement('canvas');
    smokeCanvas.width = 64;
    smokeCanvas.height = 64;
    const sCtx = smokeCanvas.getContext('2d')!;
    const sGrad = sCtx.createRadialGradient(32, 32, 2, 32, 32, 31);
    sGrad.addColorStop(0, 'rgba(240, 245, 250, 0.75)');
    sGrad.addColorStop(0.35, 'rgba(220, 228, 238, 0.45)');
    sGrad.addColorStop(0.7, 'rgba(195, 205, 218, 0.15)');
    sGrad.addColorStop(1, 'rgba(180, 190, 200, 0)');
    sCtx.fillStyle = sGrad;
    sCtx.fillRect(0, 0, 64, 64);
    this.smokeTexture = new THREE.CanvasTexture(smokeCanvas);

    // 2. Procedural brilliant fire spark texture (Hot white center + bright orange-yellow corona)
    const sparkCanvas = document.createElement('canvas');
    sparkCanvas.width = 64;
    sparkCanvas.height = 64;
    const spCtx = sparkCanvas.getContext('2d')!;
    const spGrad = spCtx.createRadialGradient(32, 32, 1, 32, 32, 30);
    spGrad.addColorStop(0, '#ffffff');
    spGrad.addColorStop(0.15, '#fff6a9');
    spGrad.addColorStop(0.4, '#ff9000');
    spGrad.addColorStop(0.75, 'rgba(255, 34, 0, 0.4)');
    spGrad.addColorStop(1, 'rgba(255, 0, 0, 0)');
    spCtx.fillStyle = spGrad;
    spCtx.fillRect(0, 0, 64, 64);

    // Cross glint for sparkling arcade star effect
    spCtx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    spCtx.lineWidth = 2.5;
    spCtx.beginPath();
    spCtx.moveTo(32, 8);
    spCtx.lineTo(32, 56);
    spCtx.moveTo(8, 32);
    spCtx.lineTo(56, 32);
    spCtx.stroke();

    this.sparkTexture = new THREE.CanvasTexture(sparkCanvas);

    // 3. Pre-allocate smoke pool
    for (let i = 0; i < this.smokePoolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.smokeTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.baseGeometry, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.smokePool.push({
        mesh,
        velocity: new THREE.Vector3(),
        age: 0,
        maxAge: 1.0,
        startScale: 0.35,
        endScale: 1.4,
        startOpacity: 0.6,
        active: false,
      });
    }

    // 4. Pre-allocate spark pool (Additive blending for brilliant glowing sparks)
    for (let i = 0; i < this.sparkPoolSize; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.sparkTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(this.baseGeometry, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.sparkPool.push({
        mesh,
        velocity: new THREE.Vector3(),
        age: 0,
        maxAge: 0.25,
        startScale: 0.22,
        active: false,
      });
    }
  }

  /**
   * Spawn smoke particles from a wheel contact point on the road (High speed / Burnout)
   */
  public emitSmoke(position: THREE.Vector3, carVelocity: THREE.Vector3, intensity: number = 1.0): void {
    const p = this.smokePool.find((item) => !item.active);
    if (!p) return;

    p.active = true;
    p.mesh.visible = true;
    p.age = 0;
    p.maxAge = 0.55 + Math.random() * 0.35;
    p.startScale = 0.3 + Math.random() * 0.15;
    p.endScale = 1.2 + Math.random() * 0.6 + intensity * 0.4;
    p.startOpacity = Math.min(0.65, 0.3 + intensity * 0.25);

    p.mesh.position.set(
      position.x + (Math.random() - 0.5) * 0.14,
      position.y + 0.08 + Math.random() * 0.05,
      position.z + (Math.random() - 0.5) * 0.14
    );
    p.mesh.scale.set(p.startScale, p.startScale, p.startScale);
    p.mesh.material.opacity = p.startOpacity;

    p.velocity.set(
      carVelocity.x * 0.12 + (Math.random() - 0.5) * 0.5,
      0.35 + Math.random() * 0.45,
      carVelocity.z * 0.12 + (Math.random() - 0.5) * 0.5
    );
  }

  /**
   * Legacy alias for emitSmoke
   */
  public emit(position: THREE.Vector3, carVelocity: THREE.Vector3, intensity: number = 1.0): void {
    this.emitSmoke(position, carVelocity, intensity);
  }

  /**
   * Spawn bright friction sparks from tire when drifting (High impact arcade sparks)
   */
  public emitSpark(position: THREE.Vector3, carVelocity: THREE.Vector3, driftDirection: number = 0, intensity: number = 1.0): void {
    const p = this.sparkPool.find((item) => !item.active);
    if (!p) return;

    p.active = true;
    p.mesh.visible = true;
    p.age = 0;
    p.maxAge = 0.16 + Math.random() * 0.16;
    p.startScale = 0.15 + Math.random() * 0.15 + intensity * 0.08;

    p.mesh.position.set(
      position.x + (Math.random() - 0.5) * 0.1,
      position.y + 0.04 + Math.random() * 0.04,
      position.z + (Math.random() - 0.5) * 0.1
    );
    p.mesh.scale.set(p.startScale, p.startScale, p.startScale);
    p.mesh.material.opacity = 1.0;

    // Sparks fling backward and outward away from the car slide direction
    const speed = carVelocity.length();
    const backwardFactor = Math.max(2.0, speed * 0.25);
    const outwardAngle = driftDirection !== 0 ? -driftDirection : (Math.random() - 0.5) * 2;

    // Calculate perpendicular outward fling
    const forwardNormX = speed > 0.1 ? carVelocity.x / speed : 0;
    const forwardNormZ = speed > 0.1 ? carVelocity.z / speed : 1;
    const rightNormX = forwardNormZ;
    const rightNormZ = -forwardNormX;

    p.velocity.set(
      -forwardNormX * (backwardFactor + Math.random() * 4.0) + rightNormX * outwardAngle * (2.0 + Math.random() * 3.5),
      0.8 + Math.random() * 2.2, // Bounce up off tarmac
      -forwardNormZ * (backwardFactor + Math.random() * 4.0) + rightNormZ * outwardAngle * (2.0 + Math.random() * 3.5)
    );
  }

  /**
   * Update particle positions, physics, fade out, billboard orientation
   */
  public update(dt: number, camera: THREE.Camera): void {
    const camQuat = camera.quaternion;

    // 1. Update Smoke
    for (let i = 0; i < this.smokePoolSize; i++) {
      const p = this.smokePool[i];
      if (!p.active) continue;

      p.age += dt;
      if (p.age >= p.maxAge) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      p.mesh.position.addScaledVector(p.velocity, dt);

      const progress = p.age / p.maxAge;
      const currentScale = THREE.MathUtils.lerp(p.startScale, p.endScale, Math.pow(progress, 0.7));
      p.mesh.scale.set(currentScale, currentScale, currentScale);
      p.mesh.material.opacity = p.startOpacity * (1 - progress);
      p.mesh.quaternion.copy(camQuat);
    }

    // 2. Update Sparks
    for (let i = 0; i < this.sparkPoolSize; i++) {
      const sp = this.sparkPool[i];
      if (!sp.active) continue;

      sp.age += dt;
      if (sp.age >= sp.maxAge) {
        sp.active = false;
        sp.mesh.visible = false;
        continue;
      }

      // Gravity pulls sparks back to ground
      sp.velocity.y -= 8.5 * dt;
      sp.mesh.position.addScaledVector(sp.velocity, dt);

      // Bounce/stop at ground
      if (sp.mesh.position.y < 0.02) {
        sp.mesh.position.y = 0.02;
        sp.velocity.y = -sp.velocity.y * 0.35; // Lossy bounce
        sp.velocity.x *= 0.7;
        sp.velocity.z *= 0.7;
      }

      const progress = sp.age / sp.maxAge;
      const scale = THREE.MathUtils.lerp(sp.startScale, 0.05, progress);
      sp.mesh.scale.set(scale, scale, scale);
      sp.mesh.material.opacity = 1.0 - Math.pow(progress, 2.0);
      sp.mesh.quaternion.copy(camQuat);
    }
  }

  public reset(): void {
    for (const p of this.smokePool) {
      p.active = false;
      p.mesh.visible = false;
    }
    for (const sp of this.sparkPool) {
      sp.active = false;
      sp.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.smokeTexture.dispose();
    this.sparkTexture.dispose();
    this.baseGeometry.dispose();
    for (const p of this.smokePool) {
      p.mesh.material.dispose();
    }
    for (const sp of this.sparkPool) {
      sp.mesh.material.dispose();
    }
  }
}
