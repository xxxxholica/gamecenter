import * as THREE from 'three';

interface Fragment {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  life: number;
  maxLife: number;
}

interface GavelDrop {
  group: THREE.Group;
  t: number;
  duration: number;
  targetY: number;
}

export class EffectsManager {
  private scene: THREE.Scene;
  private flashOverlay: HTMLElement;
  private flashText: HTMLElement;

  private shakeTime = 0;
  private shakeDuration = 0.001;
  private shakeIntensity = 0;
  public shakeOffset = new THREE.Vector3();

  private fragments: Fragment[] = [];
  private gavelDrops: GavelDrop[] = [];
  private flashTextTimer: number | null = null;

  constructor(scene: THREE.Scene, flashOverlay: HTMLElement, flashText: HTMLElement) {
    this.scene = scene;
    this.flashOverlay = flashOverlay;
    this.flashText = flashText;
  }

  public triggerShake(intensity: number, duration: number): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDuration = duration;
    this.shakeTime = duration;
  }

  public flashScreen(colorClass: 'flash-white' | 'flash-red', duration = 150): void {
    this.flashOverlay.className = `screen-flash ${colorClass} active`;
    window.setTimeout(() => {
      this.flashOverlay.className = 'screen-flash';
    }, duration);
  }

  public showFlashText(text: string, colorClass: string, durationMs = 900): void {
    if (this.flashTextTimer !== null) window.clearTimeout(this.flashTextTimer);
    this.flashText.textContent = text;
    this.flashText.className = `flash-text ${colorClass} show`;
    this.flashTextTimer = window.setTimeout(() => {
      this.flashText.className = 'flash-text hidden';
      this.flashTextTimer = null;
    }, durationMs);
  }

  // 文字パネルの粉砕演出(小さな破片メッシュを飛散させる)
  public spawnShatter(position: THREE.Vector3, color: number): void {
    const count = 14;
    for (let i = 0; i < count; i++) {
      const geo = new THREE.BoxGeometry(0.06 + Math.random() * 0.08, 0.06 + Math.random() * 0.08, 0.02);
      const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(position);
      this.scene.add(mesh);
      const speed = 1.5 + Math.random() * 2.5;
      const dir = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.6, (Math.random() - 0.5) * 2).normalize();
      this.fragments.push({
        mesh,
        velocity: dir.multiplyScalar(speed),
        angularVelocity: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        life: 0,
        maxLife: 0.55 + Math.random() * 0.25,
      });
    }
  }

  // ボーナスタイム中の木槌連打演出
  public spawnGavelSlam(target: THREE.Vector3): void {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a3418, roughness: 0.6 });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), mat);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.45, 12), mat);
    head.rotation.z = Math.PI / 2;
    head.position.y = -0.55;
    group.add(handle, head);
    group.position.set(target.x + (Math.random() - 0.5) * 0.6, target.y + 4, target.z);
    this.scene.add(group);
    this.gavelDrops.push({ group, t: 0, duration: 0.28, targetY: target.y + 0.5 });
  }

  public update(dt: number): void {
    // カメラシェイク減衰
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const power = this.shakeIntensity * Math.max(this.shakeTime / this.shakeDuration, 0);
      this.shakeOffset.set((Math.random() - 0.5) * power, (Math.random() - 0.5) * power, 0);
      if (this.shakeTime <= 0) {
        this.shakeIntensity = 0;
        this.shakeOffset.set(0, 0, 0);
      }
    }

    // 破片更新
    for (let i = this.fragments.length - 1; i >= 0; i--) {
      const f = this.fragments[i];
      f.life += dt;
      f.velocity.y -= dt * 4.5;
      f.mesh.position.addScaledVector(f.velocity, dt);
      f.mesh.rotation.x += f.angularVelocity.x * dt;
      f.mesh.rotation.y += f.angularVelocity.y * dt;
      f.mesh.rotation.z += f.angularVelocity.z * dt;
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 1 - f.life / f.maxLife);
      if (f.life >= f.maxLife) {
        this.scene.remove(f.mesh);
        f.mesh.geometry.dispose();
        mat.dispose();
        this.fragments.splice(i, 1);
      }
    }

    // 木槌落下演出更新
    for (let i = this.gavelDrops.length - 1; i >= 0; i--) {
      const g = this.gavelDrops[i];
      g.t += dt;
      const progress = Math.min(g.t / g.duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      g.group.position.y = THREE.MathUtils.lerp(g.group.position.y, g.targetY, eased * 0.9 + 0.1);
      g.group.rotation.z = -Math.PI / 2.5 * (1 - progress);
      if (progress >= 1) {
        this.scene.remove(g.group);
        g.group.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
        });
        this.gavelDrops.splice(i, 1);
      }
    }
  }

  public disposeAll(): void {
    for (const f of this.fragments) {
      this.scene.remove(f.mesh);
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
    }
    this.fragments = [];
    for (const g of this.gavelDrops) {
      this.scene.remove(g.group);
    }
    this.gavelDrops = [];
  }
}
