import * as THREE from 'three';

interface Particle {
  mesh: THREE.Mesh | THREE.Points;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  drag: number;
}

export class EffectsManager {
  private camera: THREE.PerspectiveCamera;
  private origCamPos = new THREE.Vector3();
  private origCamRot = new THREE.Euler();
  private targetCamPos = new THREE.Vector3();
  private targetLookAt = new THREE.Vector3();
  private introCamPos = new THREE.Vector3();
  private isZooming = false;
  private zoomTimer = 0;
  private zoomDuration = 1.8;
  private scene: THREE.Scene;

  // Screen shake
  private trauma = 0; // 0 to 1
  private shakeTime = 0;

  // Particles
  private particles: Particle[] = [];
  private particleGroup: THREE.Group;
  /**
   * 粒の形は、種類・大きさの段階ごとに共有する(粒ごとに作って捨てると、GPUへの転送と破棄が演出のたびに起きる)。
   * 材質は、粒ごとに透明度を変えて消えていくので共有しない。
   */
  private readonly shapes = new Map<string, THREE.BufferGeometry>();
  /** 同時に出せる粒の上限(連続して演出が重なっても、描画する数が増え続けない。超えたら古い粒から消す) */
  private static readonly MAX_PARTICLES = 400;

  constructor(camera: THREE.PerspectiveCamera, scene: THREE.Scene) {
    this.camera = camera;
    this.scene = scene;
    this.origCamPos.copy(camera.position);
    this.origCamRot.copy(camera.rotation);

    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);
    this.keepParticlePrograms();
  }

  /**
   * 粒の材質(破片・火花・しぶきと煙の3通り)のシェーダを、いつも作ってある状態にしておく。
   * 粒の材質は消えるたびに破棄するので、粒がひとつも無い間にシェーダまで破棄され、次の演出(判定の瞬間など)で作り直しになって
   * 画面が止まる。そこで、同じ設定の見本を、色も奥行きも書かない(画面に何も出ない)状態で毎フレーム描いておく。
   * 見本は毎フレーム描かれるので、ステージが変わって光の数が変わっても、ステージの読み込みと一緒にシェーダが作られる。
   */
  private keepParticlePrograms(): void {
    const geom = new THREE.BoxGeometry(0.001, 0.001, 0.001);
    const samples = [
      new THREE.MeshStandardMaterial({ roughness: 0.8 }),                 // spawnExplosionChunks
      new THREE.MeshBasicMaterial(),                                       // spawnSparks
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9 }),    // spawnLiquidSplash・spawnSmoke
    ];
    for (const mat of samples) {
      mat.colorWrite = false;
      mat.depthWrite = false;
      const mesh = new THREE.Mesh(geom, mat);
      mesh.frustumCulled = false;
      this.particleGroup.add(mesh);
    }
  }

  private shape(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.shapes.get(key);
    if (!g) { g = make(); this.shapes.set(key, g); }
    return g;
  }

  private addParticle(p: Particle): void {
    this.particles.push(p);
    while (this.particles.length > EffectsManager.MAX_PARTICLES) {
      const old = this.particles.shift()!;
      this.particleGroup.remove(old.mesh);
      (old.mesh.material as THREE.Material).dispose();
    }
  }

  /** 共有している形を破棄する(ゲームを作り直す時) */
  dispose() {
    this.clear();
    for (const g of this.shapes.values()) g.dispose();
    this.shapes.clear();
  }

  setCameraBase(pos: THREE.Vector3, target: THREE.Vector3) {
    this.targetCamPos.copy(pos);
    this.targetLookAt.copy(target);
    this.origCamPos.copy(pos);
    this.camera.position.copy(pos);
    this.camera.lookAt(target);
    this.origCamRot.copy(this.camera.rotation);
  }

  // Dramatic Arcade Zoom: Camera swoops from far away into play position
  startIntroZoom(duration = 1.8) {
    this.zoomDuration = duration;
    this.zoomTimer = 0;
    this.isZooming = true;

    const offset = new THREE.Vector3().subVectors(this.targetCamPos, this.targetLookAt);
    const dist = offset.length();
    offset.normalize();

    this.introCamPos.copy(this.targetLookAt).addScaledVector(offset, Math.max(9.0, dist * 3.2));
    this.introCamPos.y += 3.2;

    this.camera.position.copy(this.introCamPos);
    this.camera.lookAt(this.targetLookAt);
    this.origCamPos.copy(this.introCamPos);
    this.origCamRot.copy(this.camera.rotation);
  }

  // Add screen shake trauma (0.0 to 1.0)
  addTrauma(amount: number) {
    this.trauma = Math.min(1.0, this.trauma + amount);
  }

  update(dt: number) {
    // 0. Update Intro Zoom from distance
    if (this.isZooming) {
      this.zoomTimer += dt;
      const t = Math.min(1.0, this.zoomTimer / this.zoomDuration);
      // Fast start, dramatic smooth deceleration into position
      const ease = 1 - Math.pow(1 - t, 3);

      this.origCamPos.lerpVectors(this.introCamPos, this.targetCamPos, ease);
      this.camera.position.copy(this.origCamPos);
      this.camera.lookAt(this.targetLookAt);
      this.origCamRot.copy(this.camera.rotation);

      if (t >= 1.0) {
        this.isZooming = false;
        this.origCamPos.copy(this.targetCamPos);
        this.camera.position.copy(this.targetCamPos);
        this.camera.lookAt(this.targetLookAt);
        this.origCamRot.copy(this.camera.rotation);
      }
    }

    // 1. Update screen shake
    if (this.trauma > 0) {
      this.shakeTime += dt * 35;
      const shake = this.trauma * this.trauma; // quadratic response feels punchier
      
      const maxOffset = 0.25; // max position displacement
      const maxRot = 0.05;    // max angular displacement

      const offsetX = (Math.sin(this.shakeTime * 1.7) + (Math.random() - 0.5) * 0.4) * maxOffset * shake;
      const offsetY = (Math.cos(this.shakeTime * 2.1) + (Math.random() - 0.5) * 0.4) * maxOffset * shake;
      const offsetZ = (Math.sin(this.shakeTime * 1.3)) * maxOffset * 0.5 * shake;

      const rotZ = (Math.sin(this.shakeTime * 2.5) + (Math.random() - 0.5) * 0.5) * maxRot * shake;

      this.camera.position.x = this.origCamPos.x + offsetX;
      this.camera.position.y = this.origCamPos.y + offsetY;
      this.camera.position.z = this.origCamPos.z + offsetZ;
      this.camera.rotation.z = this.origCamRot.z + rotZ;

      // Decay trauma
      this.trauma = Math.max(0, this.trauma - dt * 1.5);
    } else {
      this.camera.position.copy(this.origCamPos);
      this.camera.rotation.copy(this.origCamRot);
    }

    // 2. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;

      if (p.life >= p.maxLife) {
        this.particleGroup.remove(p.mesh);
        (p.mesh.material as THREE.Material).dispose();          // 形は共有なので破棄しない
        this.particles.splice(i, 1);
        continue;
      }

      // Physics
      p.velocity.y -= p.gravity * dt;
      p.velocity.multiplyScalar(Math.pow(p.drag, dt * 60));
      p.mesh.position.addScaledVector(p.velocity, dt);

      p.mesh.rotation.x += p.angularVelocity.x * dt;
      p.mesh.rotation.y += p.angularVelocity.y * dt;
      p.mesh.rotation.z += p.angularVelocity.z * dt;

      // Scale down or fade near end of life
      const progress = p.life / p.maxLife;
      const scale = 1.0 - progress * 0.5;
      p.mesh.scale.setScalar(scale);

      if ('opacity' in (p.mesh.material as THREE.Material)) {
        ((p.mesh.material as unknown) as { opacity: number }).opacity = 1.0 - progress;
      }
    }
  }

  // Spawn bursting chunks (for meat bun explosion, food splat, plastic bits)
  spawnExplosionChunks(pos: THREE.Vector3, color: number, count = 25, size = 0.08) {
    for (let i = 0; i < count; i++) {
      const v = Math.floor(Math.random() * 6);                // 大きさの違うかけらを6通りから選ぶ
      const geom = this.shape(`chunk:${size}:${v}`, () => new THREE.BoxGeometry(
        size * (0.6 + 0.8 * ((v * 0.37) % 1)),
        size * (0.6 + 0.8 * ((v * 0.61 + 0.2) % 1)),
        size * (0.6 + 0.8 * ((v * 0.83 + 0.5) % 1))
      ));
      const mat = new THREE.MeshStandardMaterial({
        color: color,
        roughness: 0.8,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(pos);

      // Random outwards velocity
      const theta = Math.random() * Math.PI * 2;
      const phi = (Math.random() - 0.2) * Math.PI;
      const speed = 2.0 + Math.random() * 4.5;
      const velocity = new THREE.Vector3(
        Math.cos(theta) * Math.cos(phi) * speed,
        Math.abs(Math.sin(phi)) * speed + 1.5,
        Math.sin(theta) * Math.cos(phi) * speed
      );

      const angularVelocity = new THREE.Vector3(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 20
      );

      this.particleGroup.add(mesh);
      this.addParticle({
        mesh,
        velocity,
        angularVelocity,
        life: 0,
        maxLife: 1.2 + Math.random() * 0.8,
        gravity: 9.8,
        drag: 0.96,
      });
    }
  }

  // Liquid splash droplets
  spawnLiquidSplash(pos: THREE.Vector3, color: number, count = 30) {
    for (let i = 0; i < count; i++) {
      const v = Math.floor(Math.random() * 4);
      const geom = this.shape(`splash:${v}`, () => new THREE.SphereGeometry(0.04 + v * 0.01, 6, 6));
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(pos);

      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.0;
      const velocity = new THREE.Vector3(
        Math.cos(angle) * speed,
        1.5 + Math.random() * 2.5,
        Math.sin(angle) * speed
      );

      this.particleGroup.add(mesh);
      this.addParticle({
        mesh,
        velocity,
        angularVelocity: new THREE.Vector3(),
        life: 0,
        maxLife: 0.8 + Math.random() * 0.5,
        gravity: 12.0,
        drag: 0.94,
      });
    }
  }

  // Smoke / Steam puffs
  spawnSmoke(pos: THREE.Vector3, color = 0x222222, count = 15) {
    for (let i = 0; i < count; i++) {
      const v = Math.floor(Math.random() * 4);
      const geom = this.shape(`smoke:${v}`, () => new THREE.SphereGeometry(0.08 + v * 0.027, 6, 6));
      const mat = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.8,
      });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.2,
        pos.y + (Math.random() - 0.5) * 0.1,
        pos.z + (Math.random() - 0.5) * 0.2
      );

      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.8,
        1.2 + Math.random() * 1.5,
        (Math.random() - 0.5) * 0.8
      );

      this.particleGroup.add(mesh);
      this.addParticle({
        mesh,
        velocity,
        angularVelocity: new THREE.Vector3(),
        life: 0,
        maxLife: 1.0 + Math.random() * 0.6,
        gravity: -1.0, // rises
        drag: 0.92,
      });
    }
  }

  // Sparks
  spawnSparks(pos: THREE.Vector3, count = 20) {
    for (let i = 0; i < count; i++) {
      const geom = this.shape('spark', () => new THREE.BoxGeometry(0.02, 0.02, 0.06));
      const mat = new THREE.MeshBasicMaterial({ color: 0xffea00 });
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.copy(pos);

      const speed = 2.0 + Math.random() * 4.0;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2
      ).normalize();

      this.particleGroup.add(mesh);
      this.addParticle({
        mesh,
        velocity: dir.multiplyScalar(speed),
        angularVelocity: new THREE.Vector3(10, 10, 10),
        life: 0,
        maxLife: 0.4 + Math.random() * 0.3,
        gravity: 8.0,
        drag: 0.98,
      });
    }
  }

  clear() {
    for (const p of this.particles) {
      this.particleGroup.remove(p.mesh);
      (p.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
    this.trauma = 0;
  }
}
