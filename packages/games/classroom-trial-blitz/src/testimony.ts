import * as THREE from 'three';
import { createTextPlateTexture } from './textures';

export type TrajectoryPattern = 'straight' | 'wave' | 'spin';

export class TestimonyProjectile {
  public mesh: THREE.Mesh;
  public text: string;
  public isContradiction: boolean;
  public pattern: TrajectoryPattern;
  public t = 0;
  public duration: number;
  private spawnPos: THREE.Vector3;
  private targetPos: THREE.Vector3;
  private waveSeed: number;
  public dead = false;

  constructor(text: string, isContradiction: boolean, spawnPos: THREE.Vector3, targetPos: THREE.Vector3, pattern: TrajectoryPattern, duration: number) {
    this.text = text;
    this.isContradiction = isContradiction;
    this.pattern = pattern;
    this.duration = duration;
    this.spawnPos = spawnPos.clone();
    this.targetPos = targetPos.clone();
    this.waveSeed = Math.random() * Math.PI * 2;

    const tex = createTextPlateTexture(text, false);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const geo = new THREE.PlaneGeometry(1.6, 0.6);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.copy(spawnPos);
  }

  public update(dt: number, camera: THREE.Camera): boolean {
    this.t += dt / this.duration;
    const progress = Math.min(this.t, 1);

    const pos = new THREE.Vector3().lerpVectors(this.spawnPos, this.targetPos, progress);
    if (this.pattern === 'wave') {
      pos.x += Math.sin(progress * Math.PI * 3 + this.waveSeed) * (1 - progress * 0.3) * 0.9;
    }
    this.mesh.position.copy(pos);

    const scale = 0.55 + progress * 0.9;
    this.mesh.scale.setScalar(scale);

    this.mesh.quaternion.copy(camera.quaternion);
    if (this.pattern === 'spin') {
      this.mesh.rotateZ(this.t * 8);
    }

    if (this.t >= 1) {
      this.dead = true;
      return true;
    }
    return false;
  }

  public dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.MeshBasicMaterial).map?.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

export class TestimonyManager {
  private scene: THREE.Scene;
  public active: TestimonyProjectile[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public spawn(text: string, isContradiction: boolean, spawnPos: THREE.Vector3, targetPos: THREE.Vector3): void {
    const patterns: TrajectoryPattern[] = ['straight', 'wave', 'spin'];
    const pattern = patterns[Math.floor(Math.random() * patterns.length)];
    const duration = 2.3 + Math.random() * 0.9;
    const proj = new TestimonyProjectile(text, isContradiction, spawnPos, targetPos, pattern, duration);
    this.scene.add(proj.mesh);
    this.active.push(proj);
  }

  public update(dt: number, camera: THREE.Camera): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const proj = this.active[i];
      const finished = proj.update(dt, camera);
      if (finished) {
        this.scene.remove(proj.mesh);
        proj.dispose();
        this.active.splice(i, 1);
      }
    }
  }

  public raycastHit(raycaster: THREE.Raycaster): TestimonyProjectile | null {
    const meshes = this.active.map((p) => p.mesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return null;
    const hitMesh = hits[0].object;
    return this.active.find((p) => p.mesh === hitMesh) ?? null;
  }

  public remove(proj: TestimonyProjectile): void {
    const idx = this.active.indexOf(proj);
    if (idx >= 0) this.active.splice(idx, 1);
    this.scene.remove(proj.mesh);
    proj.dispose();
  }

  public clearAll(): void {
    for (const proj of this.active) {
      this.scene.remove(proj.mesh);
      proj.dispose();
    }
    this.active = [];
  }
}
