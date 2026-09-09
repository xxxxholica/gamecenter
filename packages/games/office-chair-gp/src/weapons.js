// ============================================================================
// weapons.js - Extinguisher CO2 Cylinder Bomb Throwing & Blast Physics
// ============================================================================

import * as THREE from 'three';

export class BombProjectile {
  constructor(scene, track, particles, sound, manager, startPos, startVel, thrower = 'player') {
    this.scene = scene;
    this.track = track;
    this.particles = particles;
    this.sound = sound;
    this.manager = manager;
    this.thrower = thrower;

    this.pos = startPos.clone();
    this.vel = startVel.clone();
    this.rotAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.rotSpeed = 14.0 + Math.random() * 8.0;
    this.life = 0;
    this.maxLife = 2.8;
    this.isDead = false;
    this.radius = 0.35; // Collision sphere

    this.mesh = this._buildMesh();
    this.mesh.position.copy(this.pos);
    this.scene.add(this.mesh);

    // Initial throw sound
    this.sound.playThrowBomb();
  }

  _buildMesh() {
    const group = new THREE.Group();

    // Red fire extinguisher cylinder body
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcc0000,
      roughness: 0.25,
      metalness: 0.35
    });
    const bodyGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.46, 12);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    group.add(body);

    // Top dome
    const domeGeo = new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const dome = new THREE.Mesh(domeGeo, bodyMat);
    dome.position.y = 0.23;
    group.add(dome);

    // Warning yellow hazard band
    const bandMat = new THREE.MeshStandardMaterial({
      color: 0xf1c40f,
      roughness: 0.4,
      metalness: 0.1
    });
    const bandGeo = new THREE.CylinderGeometry(0.124, 0.124, 0.08, 12);
    const band = new THREE.Mesh(bandGeo, bandMat);
    band.position.y = 0.05;
    group.add(band);

    // Brass/Chrome pressure valve and handle on top
    const valveMat = new THREE.MeshStandardMaterial({
      color: 0xdcdde1,
      roughness: 0.2,
      metalness: 0.85
    });
    const valveGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8);
    const valve = new THREE.Mesh(valveGeo, valveMat);
    valve.position.y = 0.32;
    group.add(valve);

    const leverGeo = new THREE.BoxGeometry(0.03, 0.03, 0.16);
    const lever = new THREE.Mesh(leverGeo, valveMat);
    lever.position.set(0, 0.36, 0.05);
    group.add(lever);

    return group;
  }

  update(dt, npcs, playerPhysics) {
    if (this.isDead) return;

    this.life += dt;
    if (this.life >= this.maxLife) {
      this.explode(npcs, playerPhysics);
      return;
    }

    // 1. Gravity and velocity integration
    this.vel.y -= 24.0 * dt;
    this.pos.addScaledVector(this.vel, dt);

    // Tumbling rotation
    this.mesh.rotateOnAxis(this.rotAxis, this.rotSpeed * dt);
    this.mesh.position.copy(this.pos);

    // 2. Ground impact: IMMEDIATE EXPLOSION! No bouncing
    const groundY = (this.track.getSmoothElevation
      ? this.track.getSmoothElevation(this.pos.x, this.pos.z)
      : this.track.getSplineYAt(this.pos.x, this.pos.z)) + 0.15;

    if (this.pos.y <= groundY && this.life > 0.04) {
      this.pos.y = groundY;
      this.explode(npcs, playerPhysics);
      return;
    }

    // 3. Jump ramp collision check: Immediate explosion if hitting ramp
    if (this.track && this.track.jumpRamps && this.life > 0.04) {
      for (const ramp of this.track.jumpRamps) {
        const dx = this.pos.x - ramp.x;
        const dz = this.pos.z - ramp.z;
        const cosA = Math.cos(-ramp.angleY);
        const sinA = Math.sin(-ramp.angleY);
        const lx = dx * cosA - dz * sinA;
        const lz = dx * sinA + dz * cosA;

        if (Math.abs(lx) <= ramp.halfW + 0.5 && Math.abs(lz) <= ramp.halfL + 0.5) {
          this.explode(npcs, playerPhysics);
          return;
        }
      }
    }

    // 4. White smoke trail in flight
    if (Math.random() < 0.6) {
      this.particles.emitDriftDust(this.pos, new THREE.Vector3(0, 0.8, 0), 0.7);
    }

    // 5. Direct hit detection: Check collision with player (ONLY enemy bombs can hit the player!)
    if (playerPhysics && this.thrower !== 'player') {
      const dx = this.pos.x - playerPhysics.pos.x;
      const dz = this.pos.z - playerPhysics.pos.z;
      const distSq = dx * dx + dz * dz;

      // Direct hit radius ~1.6m
      if (distSq < 2.56) {
        this.explode(npcs, playerPhysics, 'player');
        return;
      }
    }

    // 6. Direct hit detection: Check collision with any rival NPC (only player bombs directly detonate on NPCs)
    if (this.thrower === 'player' && npcs && npcs.racers) {
      for (const racer of npcs.racers) {
        const dx = this.pos.x - racer.pos.x;
        const dz = this.pos.z - racer.pos.z;
        const distSq = dx * dx + dz * dz;

        // Direct hit radius ~1.6m
        if (distSq < 2.56) {
          this.explode(npcs, playerPhysics, racer);
          return;
        }
      }
    }
  }

  explode(npcs, playerPhysics, directHitTarget = null) {
    if (this.isDead) return;
    this.isDead = true;

    // Remove 3D mesh
    this.scene.remove(this.mesh);

    // Audio boom
    this.sound.playBombExplode();

    // Massive blast radius: 16.0m (wide zone!)
    const blastRadius = 16.0;

    // Multi-tier mega particle explosion: Fireball core, gigantic CO2 powder, radial soil dust, sparks
    this.particles.emitMegaBombExplosion(this.pos, blastRadius);

    // Visual shockwave ring and flash light
    if (this.manager) {
      this.manager.spawnBlastVisual(this.pos, blastRadius);
    }

    // Apply blast wave to rival NPCs
    if (npcs && npcs.racers) {
      for (const racer of npcs.racers) {
        const dx = racer.pos.x - this.pos.x;
        const dz = racer.pos.z - this.pos.z;
        const dist = Math.hypot(dx, dz);

        if (dist < blastRadius || racer === directHitTarget) {
          const blastFactor = Math.max(0, 1.0 - dist / blastRadius);
          const pushStrength = (racer === directHitTarget) ? 60.0 : (24.0 + 38.0 * blastFactor);
          const dirX = dist > 0.001 ? dx / dist : 0;
          const dirZ = dist > 0.001 ? dz / dist : 1;

          if (this.thrower === 'player') {
            // Player hit NPC: Full chaotic spinout, speed drop and HIT! banner
            racer.hitByBomb(new THREE.Vector3(dirX, 0, dirZ), pushStrength);
            if (this.manager) {
              this.manager.recentHitAnnouncement = 'HIT!';
              this.manager.hitAnnounceTimer = 1.6;
            }
          } else {
            // NPC bomb near another NPC: Light bounce only, NO spinout!
            // This prevents friendly fire chain-reaction pileups and allows the pack to advance!
            racer.applyBounce(new THREE.Vector3(dirX, 0, dirZ), 10.0);
          }
        }
      }
    }

    // Apply blast wave to player (ONLY enemy bombs can damage or spin out the player!)
    if (playerPhysics && this.thrower !== 'player') {
      const dx = playerPhysics.pos.x - this.pos.x;
      const dz = playerPhysics.pos.z - this.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < blastRadius || directHitTarget === 'player') {
        const blastFactor = Math.max(0, 1.0 - dist / blastRadius);
        const pushStrength = (directHitTarget === 'player') ? 35.0 : (16.0 + 22.0 * blastFactor);
        const dirX = dist > 0.001 ? dx / dist : 0;
        const dirZ = dist > 0.001 ? dz / dist : 1;

        if (playerPhysics.hitByBomb) {
          playerPhysics.hitByBomb(new THREE.Vector3(dirX, 0, dirZ), pushStrength);
        } else {
          playerPhysics.screenShake = Math.max(playerPhysics.screenShake, blastFactor * 1.8);
          playerPhysics.whiteout = Math.max(playerPhysics.whiteout, blastFactor * 0.7);
          if (dist < 6.0) {
            playerPhysics.applyBounceImpulse(new THREE.Vector3(dirX, 0, dirZ).multiplyScalar(pushStrength));
          }
        }

        if (this.manager) {
          this.manager.recentHitAnnouncement = 'HIT!';
          this.manager.hitAnnounceTimer = 1.6;
        }
      }
    }
  }

  destroy() {
    this.isDead = true;
    this.scene.remove(this.mesh);
  }
}

export class WeaponManager {
  constructor(scene, track, particles, sound) {
    this.scene = scene;
    this.track = track;
    this.particles = particles;
    this.sound = sound;

    this.projectiles = [];
    this.blastEffects = [];
    this.cooldown = 0;
    this.cooldownMax = 1.4; // 1.4 seconds between cylinder throws
    this.npcBombCooldown = 6.0; // Global fleet cooldown for NPCs (6s initial calm)
    this.recentHitAnnouncement = '';
    this.hitAnnounceTimer = 0;
  }

  reset() {
    for (const p of this.projectiles) {
      p.destroy();
    }
    this.projectiles = [];

    // Clean up active blast effects
    for (const fx of this.blastEffects) {
      this.scene.remove(fx.ringMesh);
      this.scene.remove(fx.sphereMesh);
      this.scene.remove(fx.light);
      fx.ringMesh.geometry.dispose();
      fx.ringMesh.material.dispose();
      fx.sphereMesh.geometry.dispose();
      fx.sphereMesh.material.dispose();
    }
    this.blastEffects = [];

    this.cooldown = 0;
    this.npcBombCooldown = 6.0;
    this.recentHitAnnouncement = '';
    this.hitAnnounceTimer = 0;
  }

  canThrow() {
    return this.cooldown <= 0;
  }

  canNpcThrow() {
    if (this.npcBombCooldown > 0) return false;
    // Strict limit: Maximum 1 active NPC bomb in the air at any time across the fleet
    const activeNpcBombs = this.projectiles.filter(p => !p.isDead && p.thrower !== 'player').length;
    return activeNpcBombs === 0;
  }

  throwCylinder(racerPos, racerVel, racerYaw, thrower = 'player') {
    if (thrower === 'player') {
      if (!this.canThrow()) return false;
      this.cooldown = this.cooldownMax;
    } else {
      if (!this.canNpcThrow()) return false;
      // Impose global fleet cooldown: 6.0 to 9.5s before ANY NPC may throw again
      this.npcBombCooldown = 6.0 + Math.random() * 3.5;
    }

    // Launch position in front of racer
    const forward = new THREE.Vector3(Math.cos(racerYaw), 0, Math.sin(racerYaw));
    const launchPos = racerPos.clone()
      .addScaledVector(forward, 1.4)
      .add(new THREE.Vector3(0, 0.75, 0));

    // Launch velocity: Racer velocity + powerful forward launch (35 m/s) + slight upward arc (6.0 m/s)
    const forwardSpeed = Math.max(0, racerVel.dot(forward));
    const launchVel = forward.clone().multiplyScalar(forwardSpeed + 35.0)
      .add(new THREE.Vector3(0, 6.0, 0));

    const bomb = new BombProjectile(
      this.scene,
      this.track,
      this.particles,
      this.sound,
      this,
      launchPos,
      launchVel,
      thrower
    );

    this.projectiles.push(bomb);
    return true;
  }

  // Spawn expanding 3D shockwave ground ring and flash light
  spawnBlastVisual(pos, blastRadius = 16) {
    // 1. Expanding shockwave ring on ground
    const ringGeo = new THREE.RingGeometry(0.3, 1.8, 36);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(pos.x, pos.y + 0.12, pos.z);
    this.scene.add(ringMesh);

    // 2. Expanding fireball core sphere
    const sphereGeo = new THREE.SphereGeometry(1.2, 16, 12);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0xffe066,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    sphereMesh.position.set(pos.x, pos.y + 0.8, pos.z);
    this.scene.add(sphereMesh);

    // 3. Dynamic flash point light
    const light = new THREE.PointLight(0xff6600, 22.0, 40.0);
    light.position.set(pos.x, pos.y + 1.8, pos.z);
    this.scene.add(light);

    this.blastEffects.push({
      ringMesh,
      sphereMesh,
      light,
      life: 0,
      maxLife: 0.48,
      maxRadius: blastRadius
    });
  }

  update(dt, npcs, playerPhysics) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.npcBombCooldown = Math.max(0, this.npcBombCooldown - dt);
    this.hitAnnounceTimer = Math.max(0, this.hitAnnounceTimer - dt);

    // 1. Update active bombs
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt, npcs, playerPhysics);
      if (p.isDead) {
        this.projectiles.splice(i, 1);
      }
    }

    // 2. Animate and update expanding blast visual effects
    for (let i = this.blastEffects.length - 1; i >= 0; i--) {
      const fx = this.blastEffects[i];
      fx.life += dt;
      const progress = fx.life / fx.maxLife; // 0 to 1

      if (progress >= 1.0) {
        this.scene.remove(fx.ringMesh);
        this.scene.remove(fx.sphereMesh);
        this.scene.remove(fx.light);
        fx.ringMesh.geometry.dispose();
        fx.ringMesh.material.dispose();
        fx.sphereMesh.geometry.dispose();
        fx.sphereMesh.material.dispose();
        this.blastEffects.splice(i, 1);
        continue;
      }

      // Ring expands outwards to full blast radius and fades out
      const ringScale = 1.0 + progress * (fx.maxRadius * 0.75);
      fx.ringMesh.scale.set(ringScale, ringScale, 1.0);
      fx.ringMesh.material.opacity = 0.95 * (1.0 - progress);

      // Core sphere expands quickly and dissolves into white-hot vapor
      const sphereScale = 1.0 + progress * 5.0;
      fx.sphereMesh.scale.set(sphereScale, sphereScale, sphereScale);
      fx.sphereMesh.material.opacity = Math.max(0, 0.85 * (1.0 - progress * 2.2));

      // Flash light decays smoothly
      fx.light.intensity = 22.0 * Math.max(0, 1.0 - progress * 1.5);
    }
  }
}
