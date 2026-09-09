// ============================================================================
// particles.js - Clay Dust, Jet Smoke, Lime Powder, Sparks & Mud
// ============================================================================

import * as THREE from 'three';

export class ParticleSystem {
  constructor(scene) {
    this.scene = scene;

    // 1. Dust & Smoke Particles (Points)
    this.maxDust = 2400;
    this.dustGeometry = new THREE.BufferGeometry();
    this.dustPositions = new Float32Array(this.maxDust * 3);
    this.dustColors = new Float32Array(this.maxDust * 3);
    this.dustSizes = new Float32Array(this.maxDust);
    this.dustData = []; // { vel, life, maxLife, type }

    for (let i = 0; i < this.maxDust; i++) {
      this.dustPositions[i * 3 + 0] = 0;
      this.dustPositions[i * 3 + 1] = -1000;
      this.dustPositions[i * 3 + 2] = 0;

      this.dustColors[i * 3 + 0] = 1;
      this.dustColors[i * 3 + 1] = 1;
      this.dustColors[i * 3 + 2] = 1;

      this.dustSizes[i] = 0;

      this.dustData.push({
        active: false,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1,
        type: 'dust',
        baseSize: 1.0,
        baseColor: new THREE.Color()
      });
    }

    this.dustGeometry.setAttribute('position', new THREE.BufferAttribute(this.dustPositions, 3));
    this.dustGeometry.setAttribute('color', new THREE.BufferAttribute(this.dustColors, 3));
    this.dustGeometry.setAttribute('size', new THREE.BufferAttribute(this.dustSizes, 1));

    // Custom Canvas circular particle texture
    const texture = this._createParticleTexture();

    const dustMaterial = new THREE.PointsMaterial({
      size: 1.5,
      map: texture,
      transparent: true,
      opacity: 0.85,
      vertexColors: true,
      depthWrite: false,
      blending: THREE.NormalBlending
    });

    this.points = new THREE.Points(this.dustGeometry, dustMaterial);
    this.points.frustumCulled = false;
    this.scene.add(this.points);

    // 2. Sparks (Additive Blending)
    this.maxSparks = 400;
    this.sparkGeometry = new THREE.BufferGeometry();
    this.sparkPositions = new Float32Array(this.maxSparks * 3);
    this.sparkData = [];

    for (let i = 0; i < this.maxSparks; i++) {
      this.sparkPositions[i * 3 + 0] = 0;
      this.sparkPositions[i * 3 + 1] = -1000;
      this.sparkPositions[i * 3 + 2] = 0;
      this.sparkData.push({
        active: false,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.4
      });
    }

    this.sparkGeometry.setAttribute('position', new THREE.BufferAttribute(this.sparkPositions, 3));
    const sparkMaterial = new THREE.PointsMaterial({
      size: 0.35,
      map: texture,
      color: 0xffaa00,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.sparkPoints = new THREE.Points(this.sparkGeometry, sparkMaterial);
    this.sparkPoints.frustumCulled = false;
    this.scene.add(this.sparkPoints);

    this.dustIndex = 0;
    this.sparkIndex = 0;
  }

  _createParticleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
    grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.7)');
    grad.addColorStop(0.8, 'rgba(255, 255, 255, 0.2)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    return new THREE.CanvasTexture(canvas);
  }

  _spawnDust(pos, vel, type, colorHex, baseSize, life) {
    const p = this.dustData[this.dustIndex];
    p.active = true;
    p.vel.copy(vel);
    p.life = 0;
    p.maxLife = life;
    p.type = type;
    p.baseSize = baseSize;
    p.baseColor.setHex(colorHex);

    const i3 = this.dustIndex * 3;
    this.dustPositions[i3 + 0] = pos.x;
    this.dustPositions[i3 + 1] = pos.y;
    this.dustPositions[i3 + 2] = pos.z;

    this.dustColors[i3 + 0] = p.baseColor.r;
    this.dustColors[i3 + 1] = p.baseColor.g;
    this.dustColors[i3 + 2] = p.baseColor.b;

    this.dustSizes[this.dustIndex] = baseSize;

    this.dustIndex = (this.dustIndex + 1) % this.maxDust;
  }

  _spawnSpark(pos, vel) {
    const s = this.sparkData[this.sparkIndex];
    s.active = true;
    s.vel.copy(vel);
    s.life = 0;
    s.maxLife = 0.25 + Math.random() * 0.2;

    const i3 = this.sparkIndex * 3;
    this.sparkPositions[i3 + 0] = pos.x;
    this.sparkPositions[i3 + 1] = pos.y;
    this.sparkPositions[i3 + 2] = pos.z;

    this.sparkIndex = (this.sparkIndex + 1) % this.maxSparks;
  }

  // 1. 土煙パーティクル (赤茶色のクレイダスト)
  emitDriftDust(pos, moveVel, intensity = 1.0) {
    const count = Math.ceil(3 * intensity);
    for (let i = 0; i < count; i++) {
      const p = pos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.35,
        0.05 + Math.random() * 0.1,
        (Math.random() - 0.5) * 0.35
      ));

      // Drift dust moves away and upwards
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 2.5 - moveVel.x * 0.2,
        0.8 + Math.random() * 1.5,
        (Math.random() - 0.5) * 2.5 - moveVel.z * 0.2
      );

      // Reddish brown ground dust variations
      const colors = [0xa5492a, 0x8a3c22, 0xc06846, 0x6e2e17];
      const color = colors[Math.floor(Math.random() * colors.length)];

      this._spawnDust(p, vel, 'dust', color, 1.2 + Math.random() * 1.0, 0.7 + Math.random() * 0.5);
    }
  }

  // 2. 消火器ジェット煙 (猛烈な白い噴射煙)
  emitJetSmoke(leftNozzlePos, rightNozzlePos, facingDir) {
    const nozzles = [leftNozzlePos, rightNozzlePos];
    nozzles.forEach((pos) => {
      for (let i = 0; i < 4; i++) {
        // High speed blast behind the chair
        const spreadX = (Math.random() - 0.5) * 2.2;
        const spreadY = (Math.random() - 0.3) * 1.2;
        const spreadZ = (Math.random() - 0.5) * 2.2;

        const blastVel = facingDir.clone().multiplyScalar(-24 - Math.random() * 14)
          .add(new THREE.Vector3(spreadX, spreadY, spreadZ));

        const p = pos.clone().add(new THREE.Vector3(
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1,
          (Math.random() - 0.5) * 0.1
        ));

        // Pure white & icy light cyan smoke
        const colors = [0xffffff, 0xf0f8ff, 0xe8f4f8];
        const color = colors[Math.floor(Math.random() * colors.length)];

        this._spawnDust(p, blastVel, 'jet', color, 2.0 + Math.random() * 1.5, 0.4 + Math.random() * 0.3);
      }
    });
  }

  // 3. 足ブレーキ (激しい摩擦火花＋濃い砂埃)
  emitFootBrake(pos, moveVel) {
    // Sparks
    for (let i = 0; i < 4; i++) {
      const sparkVel = new THREE.Vector3(
        (Math.random() - 0.5) * 5.0 - moveVel.x * 0.3,
        1.0 + Math.random() * 3.5,
        (Math.random() - 0.5) * 5.0 - moveVel.z * 0.3
      );
      this._spawnSpark(pos, sparkVel);
    }

    // Dense grinding dust
    for (let i = 0; i < 3; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 3.0 - moveVel.x * 0.15,
        0.5 + Math.random() * 1.8,
        (Math.random() - 0.5) * 3.0 - moveVel.z * 0.15
      );
      this._spawnDust(pos, vel, 'brake', 0x5a2310, 1.4 + Math.random() * 0.8, 0.5 + Math.random() * 0.3);
    }
  }

  // 4. 石灰煙幕 (台車激突時に炸裂する巨大白煙)
  emitLimeExplosion(centerPos) {
    for (let i = 0; i < 150; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 4 + Math.random() * 16;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        1.5 + Math.random() * 8.0,
        Math.sin(angle) * speed
      );

      const p = centerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        0.2 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.2
      ));

      this._spawnDust(p, vel, 'lime', 0xffffff, 3.2 + Math.random() * 2.5, 1.2 + Math.random() * 0.8);
    }
  }

  // 5. 泥はね (ぬかるみ)
  emitMudSplatter(pos, moveVel) {
    for (let i = 0; i < 4; i++) {
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.0 - moveVel.x * 0.2,
        1.5 + Math.random() * 3.0,
        (Math.random() - 0.5) * 4.0 - moveVel.z * 0.2
      );
      this._spawnDust(pos, vel, 'mud', 0x3d1c06, 1.5 + Math.random() * 1.2, 0.45 + Math.random() * 0.3);
    }
  }

  // 6. メガボム大爆発エフェクト (広範囲の火球・CO2消火剤煙・衝撃波土煙・火花)
  emitMegaBombExplosion(centerPos, blastRadius = 16) {
    // 1. 高速火球コア (オレンジ・黄色・赤の爆炎)
    const fireColors = [0xff3300, 0xff5500, 0xff8800, 0xffcc00, 0xffeedd];
    for (let i = 0; i < 75; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 12.0 + Math.random() * 24.0;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        2.0 + Math.random() * 12.0,
        Math.sin(angle) * speed
      );
      const p = centerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.5,
        0.3 + Math.random() * 0.8,
        (Math.random() - 0.5) * 1.5
      ));
      const col = fireColors[Math.floor(Math.random() * fireColors.length)];
      this._spawnDust(p, vel, 'fire', col, 4.5 + Math.random() * 3.0, 0.55 + Math.random() * 0.45);
    }

    // 2. 超巨大CO2・消火剤白煙マッシュルーム雲 (広範囲に広がる白灰煙)
    const smokeColors = [0xffffff, 0xf5f6fa, 0xecf0f1, 0xdcdde1, 0xbdc3c7];
    for (let i = 0; i < 220; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3.0 + Math.random() * (blastRadius * 1.3);
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        2.5 + Math.random() * 14.0,
        Math.sin(angle) * speed
      );
      const p = centerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 2.0,
        0.4 + Math.random() * 1.2,
        (Math.random() - 0.5) * 2.0
      ));
      const col = smokeColors[Math.floor(Math.random() * smokeColors.length)];
      this._spawnDust(p, vel, 'lime', col, 5.0 + Math.random() * 4.0, 1.4 + Math.random() * 1.0);
    }

    // 3. 地表を放射状に薙ぎ払う衝撃波土煙 (赤茶色クレイグラウンドの土煙)
    const soilColors = [0x7d4224, 0xa55f37, 0x4b2312, 0xd28250];
    for (let i = 0; i < 90; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 8.0 + Math.random() * 26.0;
      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        0.5 + Math.random() * 3.0,
        Math.sin(angle) * speed
      );
      const p = centerPos.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 1.2,
        0.1,
        (Math.random() - 0.5) * 1.2
      ));
      const col = soilColors[Math.floor(Math.random() * soilColors.length)];
      this._spawnDust(p, vel, 'blast_dust', col, 3.5 + Math.random() * 2.5, 0.9 + Math.random() * 0.6);
    }

    // 4. 四方八方に飛び散る大量の金属火花
    this.emitWallSparks(centerPos, new THREE.Vector3(0, 1, 0), 60);
  }

  // Emit bright metal collision sparks on chair/wall impact
  emitWallSparks(pos, normal, count = 18) {
    const norm = (normal && normal.lengthSq() > 0.001) ? normal.clone().normalize() : new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < count; i++) {
      const idx = this.sparkIndex;
      this.sparkIndex = (this.sparkIndex + 1) % this.maxSparks;

      const p = this.sparkData[idx];
      p.active = true;
      p.life = 0;
      p.maxLife = 0.25 + Math.random() * 0.25;

      const i3 = idx * 3;
      this.sparkPositions[i3 + 0] = pos.x + (Math.random() - 0.5) * 0.2;
      this.sparkPositions[i3 + 1] = (pos.y || 0) + 0.35 + (Math.random() - 0.5) * 0.2;
      this.sparkPositions[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.2;

      // Cone scatter along collision normal
      const speed = 6.0 + Math.random() * 12.0;
      p.vel.set(
        norm.x * speed + (Math.random() - 0.5) * 8.0,
        Math.random() * 6.0 + 2.0,
        norm.z * speed + (Math.random() - 0.5) * 8.0
      );
    }
    this.sparkGeometry.attributes.position.needsUpdate = true;
  }

  update(dt) {
    // Update dust & smoke
    for (let i = 0; i < this.maxDust; i++) {
      const p = this.dustData[i];
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        this.dustPositions[i * 3 + 1] = -1000;
        this.dustSizes[i] = 0;
        continue;
      }

      const progress = p.life / p.maxLife; // 0 -> 1

      // Physics update
      if (p.type === 'jet') {
        p.vel.multiplyScalar(0.92); // rapid air drag
        p.vel.y += 0.8 * dt; // gentle rise
      } else if (p.type === 'lime') {
        p.vel.multiplyScalar(0.90);
        p.vel.y += 0.9 * dt;
      } else if (p.type === 'fire') {
        p.vel.multiplyScalar(0.86);
        p.vel.y += 4.2 * dt; // explosive thermal rise
      } else if (p.type === 'blast_dust') {
        p.vel.multiplyScalar(0.89);
        p.vel.y -= 1.0 * dt;
      } else {
        p.vel.x *= 0.94;
        p.vel.z *= 0.94;
        p.vel.y -= 2.5 * dt; // gravity
      }

      const i3 = i * 3;
      this.dustPositions[i3 + 0] += p.vel.x * dt;
      this.dustPositions[i3 + 1] += p.vel.y * dt;
      this.dustPositions[i3 + 2] += p.vel.z * dt;

      // Ground clamp for falling dust
      if (this.dustPositions[i3 + 1] < 0.05 && p.vel.y < 0) {
        this.dustPositions[i3 + 1] = 0.05;
        p.vel.y = 0;
      }

      // Size expands over time
      const currentSize = p.baseSize * (1.0 + progress * 2.5);
      this.dustSizes[i] = currentSize;

      // Alpha fade out (darkening/fading)
      const fade = Math.max(0, 1.0 - progress);
      this.dustColors[i3 + 0] = p.baseColor.r * fade;
      this.dustColors[i3 + 1] = p.baseColor.g * fade;
      this.dustColors[i3 + 2] = p.baseColor.b * fade;
    }

    this.dustGeometry.attributes.position.needsUpdate = true;
    this.dustGeometry.attributes.color.needsUpdate = true;
    this.dustGeometry.attributes.size.needsUpdate = true;

    // Update sparks
    for (let i = 0; i < this.maxSparks; i++) {
      const s = this.sparkData[i];
      if (!s.active) continue;

      s.life += dt;
      if (s.life >= s.maxLife) {
        s.active = false;
        this.sparkPositions[i * 3 + 1] = -1000;
        continue;
      }

      s.vel.y -= 12.0 * dt; // gravity

      const i3 = i * 3;
      this.sparkPositions[i3 + 0] += s.vel.x * dt;
      this.sparkPositions[i3 + 1] += s.vel.y * dt;
      this.sparkPositions[i3 + 2] += s.vel.z * dt;

      if (this.sparkPositions[i3 + 1] < 0.02) {
        this.sparkPositions[i3 + 1] = 0.02;
        s.vel.y = -s.vel.y * 0.4;
      }
    }

    this.sparkGeometry.attributes.position.needsUpdate = true;
  }
}
