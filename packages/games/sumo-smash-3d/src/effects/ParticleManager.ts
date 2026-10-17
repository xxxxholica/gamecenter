import * as THREE from 'three';
import { ExplosionFx } from './ExplosionFx';

interface Particle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  sizeStart: number;
  sizeEnd: number;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
}

export class ParticleManager {
  public scene: THREE.Scene;
  private particles: Particle[] = [];
  /** 粒子を出す時の作業用(毎回 new しない) */
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpVel = new THREE.Vector3();
  private ringGeo: THREE.RingGeometry;

  // 爆発(閃光・火球・煙・火花・衝撃波)
  public readonly fx: ExplosionFx;

  // 爆発の位置に土俵の焦げ跡を付ける(土俵側が登録する)。radius は焦げの大きさ(m)
  public onScorch: ((pos: THREE.Vector3, radius: number, strength: number) => void) | null = null;
  // 画面全体を一瞬染める(最大級の爆発用)。intensity は 0〜1
  public onScreenFlash: ((intensity: number) => void) | null = null;
  // 時間差で起こす連鎖爆発
  private scheduled: Array<{ t: number; pos: THREE.Vector3; scale: number }> = [];

  // ヒットストップ(強い当たりの一瞬、全体を止めて重さを出す)
  public hitStopRemaining: number = 0;

  // カメラシェイク
  public shakeIntensity: number = 0;
  public shakeDecay: number = 5.0;

  /** 粒子ごとに作ると生成と破棄が頻発するので、使い終わったマテリアルを再利用する */
  private materialPool: THREE.MeshBasicMaterial[] = [];
  private static readonly MATERIAL_POOL_MAX = 160;

  private acquireMaterial(params: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial {
    const mat = this.materialPool.pop();
    if (!mat) return new THREE.MeshBasicMaterial(params);
    // 前回の設定を引きずらないよう、指定されうる項目を既定値に戻してから反映する
    mat.side = THREE.FrontSide;
    mat.depthWrite = true;
    mat.transparent = false;
    mat.setValues(params);
    return mat;
  }

  private releaseMaterial(mat: THREE.MeshBasicMaterial) {
    if (this.materialPool.length < ParticleManager.MATERIAL_POOL_MAX) this.materialPool.push(mat);
    else mat.dispose();
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.ringGeo = new THREE.RingGeometry(0.1, 1, 32);
    this.fx = new ExplosionFx(scene);
  }

  /**
   * 場外・客席への落下用の最大級の爆発。大きな爆発を中心に起こし、そのまわりで連鎖して誘爆する。
   * 画面の大半が炎と煙で埋まる。
   */
  public spawnMegaBlast(center: THREE.Vector3, scale: number) {
    this.fx.explode(center, scale);
    this.fx.explode(new THREE.Vector3(center.x, center.y + 1.5, center.z), scale * 0.7);
    this.onScreenFlash?.(1);
    this.triggerShake(3.0);
    this.requestHitStop(0.16);

    // 連鎖: 中心のまわりで、少しずつ遅れて次々に爆発する
    const n = 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * (scale * 0.85);
      this.scheduled.push({
        t: 0.08 + (i / n) * 0.85 + Math.random() * 0.08,
        pos: new THREE.Vector3(
          center.x + Math.cos(a) * d,
          center.y + Math.random() * 2.2,
          center.z + Math.sin(a) * d
        ),
        scale: scale * (0.45 + Math.random() * 0.4),
      });
    }
  }

  /** 爆発の跡が燃え続ける */
  public spawnBurn(pos: THREE.Vector3, seconds: number, scale: number) {
    this.fx.burn(pos, seconds, scale);
  }

  /** 強い当たりの一瞬、動きを止める(秒) */
  public requestHitStop(seconds: number) {
    this.hitStopRemaining = Math.max(this.hitStopRemaining, seconds);
  }

  public update(dt: number) {
    this.fx.update(dt);

    // 連鎖爆発の時間を進める
    for (let i = this.scheduled.length - 1; i >= 0; i--) {
      const e = this.scheduled[i];
      e.t -= dt;
      if (e.t <= 0) {
        this.fx.explode(e.pos, e.scale);
        this.triggerShake(1.4);
        this.onScreenFlash?.(0.55);
        this.scheduled.splice(i, 1);
      }
    }

    // 粒子の更新
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.scene.remove(p.mesh);
        // ジオメトリは全粒子で共有しているので破棄しない(破棄すると次の粒子でGPUへ再転送される)
        this.releaseMaterial(p.mesh.material as THREE.MeshBasicMaterial);
        this.particles.splice(i, 1);
        continue;
      }

      const progress = p.life / p.maxLife;

      // 移動
      p.mesh.position.addScaledVector(p.velocity, dt);

      // スケール変化
      const currentScale = p.sizeStart + (p.sizeEnd - p.sizeStart) * progress;
      p.mesh.scale.set(currentScale, currentScale, currentScale);

      // アルファ & カラーフェード
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = (1 - progress) * 0.9;
      mat.color.lerpColors(p.colorStart, p.colorEnd, progress);
    }

    // カメラシェイク減衰
    if (this.shakeIntensity > 0) {
      this.shakeIntensity = Math.max(0, this.shakeIntensity - this.shakeDecay * dt);
    }
  }

  /**
   * カメラシェイク発生
   */
  public triggerShake(intensity: number = 0.5) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
  }

  /**
   * すり足の土煙
   */
  public spawnDust(pos: THREE.Vector3, dir: THREE.Vector3) {
    const p = this.tmpPos;
    const vel = this.tmpVel;
    for (let i = 0; i < 4; i++) {
      p.set(pos.x + (Math.random() - 0.5) * 0.4, pos.y + 0.15, pos.z + (Math.random() - 0.5) * 0.4);
      vel.set(
        -dir.x * 2.0 + (Math.random() - 0.5) * 1.5,
        Math.random() * 1.2 + 0.3,
        -dir.z * 2.0 + (Math.random() - 0.5) * 1.5
      );
      this.fx.emitTint(p, vel, 0.35 + Math.random() * 0.2, 0.15, 0.6, 0xecd5ab, 0xbfa17c);
    }
  }

  /**
   * 張り手ヒット（鋭い火花・インパクト閃光）
   */
  public spawnHariteHit(pos: THREE.Vector3) {
    // 小さな爆発(閃光・火花・煙)を重ねる
    this.fx.explode(pos, 0.5);
    this.onScorch?.(pos, 0.45, 0.4);
    const vel = this.tmpVel;
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      vel.set(Math.cos(angle) * speed, Math.sin(angle) * speed * 0.6 + 1.5, (Math.random() - 0.5) * 4);
      this.fx.emitTint(pos, vel, 0.2 + Math.random() * 0.15, 0.18, 0.02, 0xffffff, 0xff5500);
    }
  }

  /**
   * 張り手（突っ張り）の掌風・気合エフェクト（スイング時）
   */
  public spawnHariteSwing(pos: THREE.Vector3, dir: THREE.Vector3) {
    // 掌の前方に発生する衝撃リング
    const ringMat = this.acquireMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.position.y += 0.85;
    ringMesh.position.addScaledVector(dir, 0.8);
    // リングを進行方向に向ける
    ringMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(ringMesh);

    this.particles.push({
      mesh: ringMesh,
      velocity: dir.clone().multiplyScalar(4.5),
      life: 0,
      maxLife: 0.12,
      sizeStart: 0.25,
      sizeEnd: 1.0,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xffe082),
    });

    // 突きの風切り粒子
    const p = this.tmpPos;
    const vel = this.tmpVel;
    for (let i = 0; i < 3; i++) {
      p.set(pos.x, pos.y + 0.8 + (Math.random() - 0.5) * 0.2, pos.z).addScaledVector(dir, 0.6);
      vel.copy(dir).multiplyScalar(6.0 + Math.random() * 2.0);
      vel.x += (Math.random() - 0.5) * 0.8;
      vel.y += (Math.random() - 0.5) * 0.4;
      vel.z += (Math.random() - 0.5) * 0.8;
      this.fx.emitTint(p, vel, 0.12, 0.14, 0.02, 0xffffff, 0xffcc80);
    }
  }

  /**
   * ガード成功時のシールド火花・硬質インパクト
   */
  public spawnGuardSpark(pos: THREE.Vector3) {
    // 青白い防御リング
    const ringMat = this.acquireMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.position.y += 0.8;
    this.scene.add(ringMesh);

    this.particles.push({
      mesh: ringMesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 0,
      maxLife: 0.22,
      sizeStart: 0.4,
      sizeEnd: 2.2,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0x3399ff),
    });

    // 散る火花
    const p = this.tmpPos.set(pos.x, pos.y + 0.8, pos.z);
    const vel = this.tmpVel;
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      vel.set(Math.cos(angle) * speed, (Math.random() - 0.2) * 3, Math.sin(angle) * speed);
      this.fx.emitTint(p, vel, 0.2, 0.12, 0.01, 0xffffff, 0x0088ff);
    }
  }



  /**
   * ぶちかましヒット（巨大な爆発的衝撃波リング＋閃光）
   */
  public spawnBuchikamashiHit(pos: THREE.Vector3, power: number = 1.0) {
    this.triggerShake(0.7 * power);
    // 強い当たり: 火球と煙を伴う爆発。ほんの一瞬だけ動きを止めて重さを出す
    this.fx.explode(pos, 0.75 + 0.9 * power);
    this.onScorch?.(pos, 0.9 + 0.7 * power, 0.7 + 0.3 * power);
    this.requestHitStop(0.04 + 0.025 * power);

    // 衝撃波リング
    const ringMat = this.acquireMaterial({
      color: 0xffaa00,
      transparent: true,
      opacity: 0.9,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.rotation.x = -Math.PI / 2;
    this.scene.add(ringMesh);

    this.particles.push({
      mesh: ringMesh,
      velocity: new THREE.Vector3(0, 0.2, 0),
      life: 0,
      maxLife: 0.45,
      sizeStart: 0.5,
      sizeEnd: 4.5 * power,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xff2200),
    });

    // 放射状の爆発粒子
    const count = Math.floor(25 * power);
    const vel = this.tmpVel;
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = (6 + Math.random() * 9) * power;
      vel.set(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 2.0,
        Math.sin(phi) * Math.sin(theta) * speed
      );
      this.fx.emitTint(pos, vel, 0.35 + Math.random() * 0.25, 0.3, 0.05, 0xffff88, 0xdd1100);
    }
  }

  /**
   * チャージ中のオーラ粒子
   */
  public spawnChargeParticle(centerPos: THREE.Vector3, progress: number) {
    // 外側から中心に向かって集まる粒子
    const radius = 1.6 - progress * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const spawnY = Math.random() * 1.5;
    const p = this.tmpPos.set(
      centerPos.x + Math.cos(angle) * radius,
      centerPos.y + spawnY,
      centerPos.z + Math.sin(angle) * radius
    );
    const vel = this.tmpVel.set(centerPos.x, centerPos.y + 0.8, centerPos.z).sub(p).normalize().multiplyScalar(4.0);
    this.fx.emitTint(p, vel, 0.25, 0.12, 0.02, 0xffea00, 0xff4400);
  }
}
