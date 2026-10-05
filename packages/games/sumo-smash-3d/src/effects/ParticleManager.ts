import * as THREE from 'three';

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
  private sphereGeo: THREE.SphereGeometry;
  private ringGeo: THREE.RingGeometry;

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
    this.sphereGeo = new THREE.SphereGeometry(1, 8, 8);
    this.ringGeo = new THREE.RingGeometry(0.1, 1, 32);
  }

  public update(dt: number) {
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
    for (let i = 0; i < 4; i++) {
      const mat = this.acquireMaterial({
        color: 0xd4b886,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 0.15;
      mesh.position.x += (Math.random() - 0.5) * 0.4;
      mesh.position.z += (Math.random() - 0.5) * 0.4;

      const vel = new THREE.Vector3(
        -dir.x * 2.0 + (Math.random() - 0.5) * 1.5,
        Math.random() * 1.2 + 0.3,
        -dir.z * 2.0 + (Math.random() - 0.5) * 1.5
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.2,
        sizeStart: 0.15,
        sizeEnd: 0.6,
        colorStart: new THREE.Color(0xecd5ab),
        colorEnd: new THREE.Color(0xbfa17c),
      });
    }
  }

  /**
   * 張り手ヒット（鋭い火花・インパクト閃光）
   */
  public spawnHariteHit(pos: THREE.Vector3) {
    for (let i = 0; i < 12; i++) {
      const mat = this.acquireMaterial({
        color: 0xffea00,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.copy(pos);

      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 6;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.sin(angle) * speed * 0.6 + 1.5,
        (Math.random() - 0.5) * 4
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.2 + Math.random() * 0.15,
        sizeStart: 0.18,
        sizeEnd: 0.02,
        colorStart: new THREE.Color(0xffffff),
        colorEnd: new THREE.Color(0xff5500),
      });
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
    for (let i = 0; i < 3; i++) {
      const mat = this.acquireMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 0.8 + (Math.random() - 0.5) * 0.2;
      mesh.position.addScaledVector(dir, 0.6);

      const vel = dir.clone().multiplyScalar(6.0 + Math.random() * 2.0);
      vel.x += (Math.random() - 0.5) * 0.8;
      vel.y += (Math.random() - 0.5) * 0.4;
      vel.z += (Math.random() - 0.5) * 0.8;

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.12,
        sizeStart: 0.14,
        sizeEnd: 0.02,
        colorStart: new THREE.Color(0xffffff),
        colorEnd: new THREE.Color(0xffcc80),
      });
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
    for (let i = 0; i < 8; i++) {
      const mat = this.acquireMaterial({
        color: 0x88ddff,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 0.8;

      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        (Math.random() - 0.2) * 3,
        Math.sin(angle) * speed
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.2,
        sizeStart: 0.12,
        sizeEnd: 0.01,
        colorStart: new THREE.Color(0xffffff),
        colorEnd: new THREE.Color(0x0088ff),
      });
    }
  }

  /**
   * ガードクラッシュ（シールド粉砕・大破）
   */
  public spawnGuardBreak(pos: THREE.Vector3) {
    this.triggerShake(0.8);

    // 巨大な粉砕リング
    const ringMat = this.acquireMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.copy(pos);
    ringMesh.position.y += 1.0;
    this.scene.add(ringMesh);

    this.particles.push({
      mesh: ringMesh,
      velocity: new THREE.Vector3(0, 0.4, 0),
      life: 0,
      maxLife: 0.35,
      sizeStart: 0.6,
      sizeEnd: 3.5,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xff0044),
    });

    // 飛び散るクリスタル・シャード粒子
    for (let i = 0; i < 28; i++) {
      const mat = this.acquireMaterial({
        color: 0x66ccff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.copy(pos);
      mesh.position.y += 1.0;

      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 8;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 5 + 1.0,
        Math.sin(angle) * speed
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.2,
        sizeStart: 0.22,
        sizeEnd: 0.03,
        colorStart: new THREE.Color(0xffffff),
        colorEnd: new THREE.Color(0x0066ff),
      });
    }
  }

  /**
   * スタン中の頭上ピヨピヨ星
   */
  public spawnStunStars(pos: THREE.Vector3) {
    for (let i = 0; i < 2; i++) {
      const mat = this.acquireMaterial({
        color: 0xffdd00,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      const angle = Math.random() * Math.PI * 2;
      const r = 0.5;
      mesh.position.set(pos.x + Math.cos(angle) * r, pos.y + 1.8, pos.z + Math.sin(angle) * r);

      const vel = new THREE.Vector3(
        -Math.sin(angle) * 2.0,
        (Math.random() - 0.5) * 0.5,
        Math.cos(angle) * 2.0
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.35,
        sizeStart: 0.12,
        sizeEnd: 0.02,
        colorStart: new THREE.Color(0xffff66),
        colorEnd: new THREE.Color(0xff9900),
      });
    }
  }



  /**
   * ぶちかましヒット（巨大な爆発的衝撃波リング＋閃光）
   */
  public spawnBuchikamashiHit(pos: THREE.Vector3, power: number = 1.0) {
    this.triggerShake(0.7 * power);

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
    for (let i = 0; i < count; i++) {
      const mat = this.acquireMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.copy(pos);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const speed = (6 + Math.random() * 9) * power;
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 2.0,
        Math.sin(phi) * Math.sin(theta) * speed
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.25,
        sizeStart: 0.3,
        sizeEnd: 0.05,
        colorStart: new THREE.Color(0xffff88),
        colorEnd: new THREE.Color(0xdd1100),
      });
    }
  }

  /**
   * 四股の衝撃波（地面を這う円形波紋＋土煙柱）
   */
  public spawnShikoShockwave(pos: THREE.Vector3) {
    this.triggerShake(0.5);

    // 地面を這うリング波紋
    const ringMat = this.acquireMaterial({
      color: 0xe0c080,
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.set(pos.x, 0.1, pos.z);
    ringMesh.rotation.x = -Math.PI / 2;
    this.scene.add(ringMesh);

    this.particles.push({
      mesh: ringMesh,
      velocity: new THREE.Vector3(0, 0, 0),
      life: 0,
      maxLife: 0.5,
      sizeStart: 0.8,
      sizeEnd: 5.5,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xbfa17c),
    });

    // 放射状の土煙
    for (let i = 0; i < 20; i++) {
      const angle = (i / 20) * Math.PI * 2;
      const mat = this.acquireMaterial({
        color: 0xdeb887,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.set(pos.x, 0.2, pos.z);

      const speed = 3.5 + Math.random() * 2;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        Math.random() * 1.5 + 0.5,
        Math.sin(angle) * speed
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.4 + Math.random() * 0.2,
        sizeStart: 0.3,
        sizeEnd: 0.8,
        colorStart: new THREE.Color(0xefd8b0),
        colorEnd: new THREE.Color(0x8c6d48),
      });
    }
  }

  /**
   * 四股直撃・天空打ち上げヒットエフェクト（天へ突き抜ける衝撃リング＋噴水状の土煙・閃光）
   */
  public spawnShikoHit(pos: THREE.Vector3) {
    this.triggerShake(0.6);

    // 上昇する衝撃波リング
    const ringMat = this.acquireMaterial({
      color: 0xffcc33,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(this.ringGeo, ringMat);
    ringMesh.position.set(pos.x, Math.max(0.2, pos.y), pos.z);
    ringMesh.rotation.x = -Math.PI / 2;
    this.scene.add(ringMesh);

    this.particles.push({
      mesh: ringMesh,
      velocity: new THREE.Vector3(0, 4.5, 0), // 画面内に綺麗に昇る速度
      life: 0,
      maxLife: 0.38,
      sizeStart: 0.8,
      sizeEnd: 4.2,
      colorStart: new THREE.Color(0xffffff),
      colorEnd: new THREE.Color(0xff8800),
    });

    // 噴き上がる土煙と黄金スパーク
    for (let i = 0; i < 24; i++) {
      const isGold = Math.random() < 0.4;
      const mat = this.acquireMaterial({
        color: isGold ? 0xffea00 : 0xdeb887,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(this.sphereGeo, mat);
      mesh.position.set(
        pos.x + (Math.random() - 0.5) * 0.6,
        Math.max(0.2, pos.y),
        pos.z + (Math.random() - 0.5) * 0.6
      );

      // 上方向中心の噴煙
      const spread = 1.8;
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * spread,
        5.0 + Math.random() * 5.0, // 画面内に収まる噴出速度
        (Math.random() - 0.5) * spread
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: vel,
        life: 0,
        maxLife: 0.45 + Math.random() * 0.25,
        sizeStart: isGold ? 0.2 : 0.35,
        sizeEnd: 0.05,
        colorStart: new THREE.Color(0xffffff),
        colorEnd: isGold ? new THREE.Color(0xff5500) : new THREE.Color(0x8c6239),
      });
    }
  }

  /**
   * チャージ中のオーラ粒子
   */
  public spawnChargeParticle(centerPos: THREE.Vector3, progress: number) {
    const mat = this.acquireMaterial({
      color: 0xffd700,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(this.sphereGeo, mat);

    // 外側から中心に向かって集まる粒子
    const radius = 1.6 - progress * 0.6;
    const angle = Math.random() * Math.PI * 2;
    const spawnY = Math.random() * 1.5;
    mesh.position.set(
      centerPos.x + Math.cos(angle) * radius,
      centerPos.y + spawnY,
      centerPos.z + Math.sin(angle) * radius
    );

    const targetPos = new THREE.Vector3(centerPos.x, centerPos.y + 0.8, centerPos.z);
    const vel = targetPos.sub(mesh.position).normalize().multiplyScalar(4.0);

    this.scene.add(mesh);
    this.particles.push({
      mesh,
      velocity: vel,
      life: 0,
      maxLife: 0.25,
      sizeStart: 0.12,
      sizeEnd: 0.02,
      colorStart: new THREE.Color(0xffea00),
      colorEnd: new THREE.Color(0xff4400),
    });
  }
}
