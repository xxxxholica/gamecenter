// ============================================================
// Student Crowd System: InstancedMesh Humanoids
// Organic non-trypophobic scatter: natural marathon crowd spread
// Eliminates grid/honeycomb regularity. Each student has unique pace
// ============================================================

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

export interface StudentInstance {
  // Local slot coordinates relative to group center
  localX: number;
  localZ: number;
  slotOffsetX: number;
  slotOffsetZ: number;
  popY: number; // Pop-up bounce height on spawn

  // World coordinates (for collision & flight)
  worldX: number;
  worldY: number;
  worldZ: number;
  vx: number;
  vy: number;
  vz: number;

  rotX: number;
  rotY: number;
  rotZ: number;
  rotVx: number;
  rotVz: number;

  phase: number;
  strideSpeed: number; // Individual running rhythm
  swayOffset: number;   // Slight personal lateral offset
  active: boolean;

  // Flight / Sliding state
  isFlying: boolean;
  bounces: number;
  stopped: boolean;
}

export class StudentCrowd {
  public scene: THREE.Scene;
  public maxCount: number = 600;
  public count: number = 4; // Start with 4
  public students: StudentInstance[] = [];

  // Three InstancedMeshes for Humanoid (Total 3 draw calls for 500+ students!)
  private bodyMesh: THREE.InstancedMesh;
  private leftLegMesh: THREE.InstancedMesh;
  private rightLegMesh: THREE.InstancedMesh;

  // Swarm center in world space
  public groupX: number = 0;
  public groupZ: number = 0;
  private animTime: number = 0;

  // Dummies for matrix computation
  private dummyBody: THREE.Object3D = new THREE.Object3D();
  private dummyLeftLeg: THREE.Object3D = new THREE.Object3D();
  private dummyRightLeg: THREE.Object3D = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    // 1. Torso + Head Compound Geometry (with Vertex Colors)
    const bodyGeo = this.createBodyWithHeadGeometry();
    const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, this.maxCount);
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodyMesh.castShadow = true;
    this.bodyMesh.receiveShadow = true;
    this.bodyMesh.frustumCulled = false; // Never cull active crowd
    this.scene.add(this.bodyMesh);

    // 2. Leg Geometry (Pivot at hip joint top)
    const legGeo = new THREE.BoxGeometry(0.12, 0.32, 0.13);
    legGeo.translate(0, -0.16, 0); // Move pivot to top of leg
    const legMat = new THREE.MeshLambertMaterial({ color: 0x111622 });

    this.leftLegMesh = new THREE.InstancedMesh(legGeo, legMat, this.maxCount);
    this.leftLegMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.leftLegMesh.castShadow = true;
    this.leftLegMesh.frustumCulled = false;
    this.scene.add(this.leftLegMesh);

    this.rightLegMesh = new THREE.InstancedMesh(legGeo, legMat, this.maxCount);
    this.rightLegMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rightLegMesh.castShadow = true;
    this.rightLegMesh.frustumCulled = false;
    this.scene.add(this.rightLegMesh);

    // Generate organic, non-geometric slots (Poisson-disc inspired distribution)
    // Completely eliminates grid/honeycomb patterns to prevent trypophobia
    const slots = this.generateOrganicSlots(this.maxCount);

    for (let i = 0; i < this.maxCount; i++) {
      const slot = slots[i];
      this.students.push({
        localX: slot.x,
        localZ: slot.z,
        slotOffsetX: slot.x,
        slotOffsetZ: slot.z,
        popY: 0,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        rotX: 0,
        rotY: 0,
        rotZ: 0,
        rotVx: 0,
        rotVz: 0,
        phase: Math.random() * Math.PI * 2,
        strideSpeed: 28.0 + (Math.random() - 0.5) * 5.0, // High-speed running frequency
        swayOffset: (Math.random() - 0.5) * 0.08,
        active: i < this.count,
        isFlying: false,
        bounces: 0,
        stopped: false
      });
    }

    this.setCount(this.count);
    this.updateInstancedMeshes();
  }

  // Generate organic, naturally scattered crowd positions
  // Replaces geometric grids with natural randomized human spacing
  private generateOrganicSlots(count: number): { x: number; z: number }[] {
    const slots: { x: number; z: number; distSq: number }[] = [];
    const minDistance = 0.52; // Natural personal space between runners
    const minDistanceSq = minDistance * minDistance;

    const goldenAngle = 2.399963;
    let seed = 1;

    for (let i = 0; slots.length < count; i++) {
      // Pseudo-random jitter with golden spiral expansion
      const angle = i * goldenAngle + Math.sin(i * 3.7) * 0.45;
      const r = Math.sqrt(i + 1) * 0.32 + Math.cos(i * 5.1) * 0.12;

      // Elliptical crowd pack fitting track width
      const x = Math.cos(angle) * r * 0.74 + (Math.sin(i * 11.3) * 0.08);
      const z = Math.sin(angle) * r * 1.30 + (Math.cos(i * 7.7) * 0.12);

      // Keep within track bounds [-3.6, 3.6]
      if (Math.abs(x) > 3.6) continue;

      // Spacing check to avoid overlap while remaining thoroughly randomized
      let tooClose = false;
      for (let j = 0; j < slots.length; j++) {
        const dx = slots[j].x - x;
        const dz = slots[j].z - z;
        if (dx * dx + dz * dz < minDistanceSq) {
          tooClose = true;
          break;
        }
      }

      if (!tooClose) {
        slots.push({ x, z, distSq: x * x * 1.3 + z * z });
      }

      seed++;
      if (seed > 15000) break; // Safety fallback
    }

    // Sort from center outward so initial students stay close to group center
    slots.sort((a, b) => a.distSq - b.distSq);
    return slots;
  }

  // Combine Head Sphere + Torso Box into single geometry with vertex colors
  private createBodyWithHeadGeometry(): THREE.BufferGeometry {
    const geometries: THREE.BufferGeometry[] = [];

    // 1. Torso: Navy Recruit Uniform Box
    const torsoGeo = new THREE.BoxGeometry(0.36, 0.46, 0.22);
    torsoGeo.translate(0, 0.55, 0);
    this.applyVertexColor(torsoGeo, new THREE.Color(0.11, 0.16, 0.29));
    geometries.push(torsoGeo);

    // 2. Head: Flesh-tone Sphere
    const headGeo = new THREE.SphereGeometry(0.16, 12, 12);
    headGeo.translate(0, 0.94, 0);
    this.applyVertexColor(headGeo, new THREE.Color(0.98, 0.82, 0.72));
    geometries.push(headGeo);

    // 3. Hair: Black cap Box
    const hairGeo = new THREE.BoxGeometry(0.32, 0.10, 0.32);
    hairGeo.translate(0, 1.05, 0);
    this.applyVertexColor(hairGeo, new THREE.Color(0.08, 0.08, 0.08));
    geometries.push(hairGeo);

    return BufferGeometryUtils.mergeGeometries(geometries, false);
  }

  private applyVertexColor(geometry: THREE.BufferGeometry, color: THREE.Color): void {
    const position = geometry.attributes.position;
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  // Full Reset for Start / Restart (Fixes disappeared students on retry)
  public reset(initialCount: number = 4): void {
    this.groupX = 0;
    this.groupZ = 0;
    this.animTime = 0;
    this.count = Math.max(0, Math.min(this.maxCount, initialCount));

    this.bodyMesh.count = this.count;
    this.leftLegMesh.count = this.count;
    this.rightLegMesh.count = this.count;

    for (let i = 0; i < this.maxCount; i++) {
      const s = this.students[i];
      s.isFlying = false;
      s.stopped = false;
      s.bounces = 0;
      s.popY = 0.4;
      s.localX = s.slotOffsetX;
      s.localZ = s.slotOffsetZ;
      s.worldX = s.slotOffsetX;
      s.worldY = 0;
      s.worldZ = s.slotOffsetZ;
      s.vx = 0;
      s.vy = 0;
      s.vz = 0;
      s.rotX = 0;
      s.rotY = 0;
      s.rotZ = 0;
      s.rotVx = 0;
      s.rotVz = 0;
      s.active = (i < this.count);
    }

    this.updateInstancedMeshes();
  }

  // Set student count (credits) with instant pop-spread
  public setCount(newCount: number): void {
    const prevCount = this.count;
    this.count = Math.max(0, Math.min(this.maxCount, Math.floor(newCount)));

    this.bodyMesh.count = this.count;
    this.leftLegMesh.count = this.count;
    this.rightLegMesh.count = this.count;

    for (let i = 0; i < this.maxCount; i++) {
      const s = this.students[i];
      if (i < this.count) {
        if (!s.active || i >= prevCount || s.isFlying) {
          s.active = true;
          s.isFlying = false;
          s.stopped = false;
          s.localX = s.slotOffsetX;
          s.localZ = s.slotOffsetZ;
          s.popY = 0.45;
          s.rotX = 0;
          s.rotY = 0;
          s.rotZ = 0;
        }
      } else {
        s.active = false;
        s.popY = 0;
      }
    }
  }

  // Running swarm update
  public updateRunning(dt: number, moveXInput: number): void {
    this.animTime += dt;

    // Steer group center (responsive at high speed)
    const steerSpeed = 16.5;
    this.groupX += moveXInput * steerSpeed * dt;
    this.groupX = Math.max(-3.6, Math.min(3.6, this.groupX));

    // Update pop bounce decay
    for (let i = 0; i < this.count; i++) {
      const s = this.students[i];
      if (s.popY > 0) {
        s.popY = Math.max(0, s.popY - dt * 3.5);
      }
    }

    this.updateInstancedMeshes();
  }

  // Update matrix positions and individual running animations
  private updateInstancedMeshes(): void {
    const maxSwingAngle = 0.85; // Power sprint leg angle
    const bounceAmp = 0.08;

    for (let i = 0; i < this.count; i++) {
      const s = this.students[i];
      if (!s.active) continue;

      if (!s.isFlying) {
        // Organic position: slot offset + subtle individual sway
        const finalX = this.groupX + s.localX + s.swayOffset;
        const finalZ = this.groupZ + s.localZ;

        // Individual stride timing prevents robotic synchronicity
        const phase = this.animTime * s.strideSpeed + s.phase;
        const bounceY = (Math.abs(Math.sin(phase)) * bounceAmp) + s.popY;
        const legSwing = Math.sin(phase) * maxSwingAngle;

        s.worldX = finalX;
        s.worldY = bounceY;
        s.worldZ = finalZ;

        // 1. Torso + Head
        this.dummyBody.position.set(finalX, bounceY, finalZ);
        this.dummyBody.rotation.set(0.08, 0, Math.sin(phase) * 0.03); // Natural running sway
        this.dummyBody.scale.set(1, 1, 1);
        this.dummyBody.updateMatrix();
        this.bodyMesh.setMatrixAt(i, this.dummyBody.matrix);

        // 2. Left Leg (Hip pivot at Y=0.32, X=-0.09)
        this.dummyLeftLeg.position.set(finalX - 0.09, bounceY + 0.32, finalZ);
        this.dummyLeftLeg.rotation.set(legSwing, 0, 0);
        this.dummyLeftLeg.scale.set(1, 1, 1);
        this.dummyLeftLeg.updateMatrix();
        this.leftLegMesh.setMatrixAt(i, this.dummyLeftLeg.matrix);

        // 3. Right Leg (Opposite swing)
        this.dummyRightLeg.position.set(finalX + 0.09, bounceY + 0.32, finalZ);
        this.dummyRightLeg.rotation.set(-legSwing, 0, 0);
        this.dummyRightLeg.scale.set(1, 1, 1);
        this.dummyRightLeg.updateMatrix();
        this.rightLegMesh.setMatrixAt(i, this.dummyRightLeg.matrix);
      } else {
        // Flying / Sliding physics (World Coordinates)
        this.dummyBody.position.set(s.worldX, s.worldY, s.worldZ);
        this.dummyBody.rotation.set(s.rotX, s.rotY, s.rotZ);
        this.dummyBody.scale.set(1, 1, 1);
        this.dummyBody.updateMatrix();
        this.bodyMesh.setMatrixAt(i, this.dummyBody.matrix);

        this.dummyLeftLeg.position.set(s.worldX - 0.09, s.worldY + 0.32, s.worldZ);
        this.dummyLeftLeg.rotation.set(s.rotX + 0.4, s.rotY, s.rotZ);
        this.dummyLeftLeg.scale.set(1, 1, 1);
        this.dummyLeftLeg.updateMatrix();
        this.leftLegMesh.setMatrixAt(i, this.dummyLeftLeg.matrix);

        this.dummyRightLeg.position.set(s.worldX + 0.09, s.worldY + 0.32, s.worldZ);
        this.dummyRightLeg.rotation.set(s.rotX - 0.4, s.rotY, s.rotZ);
        this.dummyRightLeg.scale.set(1, 1, 1);
        this.dummyRightLeg.updateMatrix();
        this.rightLegMesh.setMatrixAt(i, this.dummyRightLeg.matrix);
      }
    }

    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.leftLegMesh.instanceMatrix.needsUpdate = true;
    this.rightLegMesh.instanceMatrix.needsUpdate = true;
  }

  // Launch remaining students into bonus track flight
  public launchFlight(boostFactor: number = 1.0): void {
    const baseForwardSpeed = 52.0 * boostFactor;
    const baseUpwardSpeed = 24.0 * boostFactor;

    this.bodyMesh.count = this.count;
    this.leftLegMesh.count = this.count;
    this.rightLegMesh.count = this.count;

    for (let i = 0; i < this.count; i++) {
      const s = this.students[i];
      if (!s.active) continue;

      s.isFlying = true;
      s.bounces = 0;
      s.stopped = false;

      s.worldX = this.groupX + s.localX;
      s.worldY = 0.5;
      s.worldZ = this.groupZ + s.localZ;

      const spreadX = (Math.random() - 0.5) * 8.0;
      const speedVariation = 0.85 + Math.random() * 0.3;

      s.vx = spreadX;
      s.vy = baseUpwardSpeed * speedVariation;
      s.vz = -baseForwardSpeed * speedVariation;

      s.rotX = 0;
      s.rotY = Math.random() * Math.PI * 2;
      s.rotZ = 0;
      s.rotVx = (Math.random() - 0.5) * 14;
      s.rotVz = (Math.random() - 0.5) * 10;
    }
  }

  // Update flight and bounce physics
  public updateFlight(dt: number): { furthestZ: number; allStopped: boolean } {
    const gravity = -34.0;
    const groundY = 0.15;
    let furthestZ = this.groupZ;
    let allStopped = true;

    for (let i = 0; i < this.count; i++) {
      const s = this.students[i];
      if (!s.active) continue;

      if (!s.stopped) {
        allStopped = false;

        s.vy += gravity * dt;
        s.worldX += s.vx * dt;
        s.worldY += s.vy * dt;
        s.worldZ += s.vz * dt;

        s.rotX += s.rotVx * dt;
        s.rotZ += s.rotVz * dt;

        if (s.worldY <= groundY) {
          s.worldY = groundY;
          s.bounces++;

          if (s.bounces < 3) {
            s.vy = -s.vy * 0.45;
            s.vz *= 0.75;
            s.vx *= 0.75;
            s.rotVx *= 0.6;
          } else {
            s.vy = 0;
            s.vz *= Math.pow(0.18, dt);
            s.vx *= Math.pow(0.18, dt);
            s.rotX = Math.PI / 2;
            s.rotVx = 0;
            s.rotVz = 0;

            if (Math.abs(s.vz) < 1.0) {
              s.vz = 0;
              s.vx = 0;
              s.stopped = true;
            }
          }
        }
      }

      if (s.worldZ < furthestZ) {
        furthestZ = s.worldZ;
      }
    }

    this.updateInstancedMeshes();
    return { furthestZ, allStopped };
  }

  // Kill all students on fail (collapse to floor)
  public killAll(): void {
    this.bodyMesh.count = this.count;
    this.leftLegMesh.count = this.count;
    this.rightLegMesh.count = this.count;

    for (let i = 0; i < this.count; i++) {
      const s = this.students[i];
      s.isFlying = true;
      s.worldX = this.groupX + s.localX;
      s.worldY = 0.1;
      s.worldZ = this.groupZ + s.localZ;
      s.rotX = Math.PI / 2;
      s.rotZ = (Math.random() - 0.5) * 1.5;
      s.stopped = true;
    }
    this.updateInstancedMeshes();
  }
}
