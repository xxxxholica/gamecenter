// ============================================================================
// chair.js - Office Chair with Twin Fire Extinguishers (Pure Primitives)
// ============================================================================

import * as THREE from 'three';

export class OfficeChair {
  constructor(options = {}) {
    this.fabricColor = options.fabricColor !== undefined ? options.fabricColor : 0x1a459c;
    this.extinguisherColor = options.extinguisherColor !== undefined ? options.extinguisherColor : 0xcc0000;

    this.group = new THREE.Group();

    // Chair sub-parts for destruction animation
    this.debrisList = []; // populated during dismantle/shatter
    this.isShattered = false;

    // Node references for animation
    this.seatMesh = null;
    this.backrestMesh = null;
    this.columnMesh = null;
    this.starBaseGroup = null;
    this.extinguisherLeft = null;
    this.extinguisherRight = null;
    this.casters = [];

    // Left/Right nozzle world positions for particles
    this.leftNozzleWorldPos = new THREE.Vector3();
    this.rightNozzleWorldPos = new THREE.Vector3();
    this.leftCasterWorldPos = new THREE.Vector3();
    this.rightCasterWorldPos = new THREE.Vector3();

    this._buildChair();
  }

  _buildChair() {
    // Materials
    // Office fabric for seat & backrest
    const fabricMat = new THREE.MeshStandardMaterial({
      color: this.fabricColor,
      roughness: 0.85,
      metalness: 0.05
    });

    // Dark grey plastic for trim & lever
    const plasticMat = new THREE.MeshStandardMaterial({
      color: 0x222225,
      roughness: 0.6,
      metalness: 0.1
    });

    // Chrome steel for central cylinder and star legs
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0xd0d4da,
      roughness: 0.25,
      metalness: 0.9
    });

    // Shiny fire extinguisher
    const extinguisherMat = new THREE.MeshStandardMaterial({
      color: this.extinguisherColor,
      roughness: 0.3,
      metalness: 0.35
    });

    // Extinguisher metal brass/silver valves
    const valveMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      roughness: 0.2,
      metalness: 0.85
    });

    // 1. Five-star base and casters
    this.starBaseGroup = new THREE.Group();
    const legCount = 5;
    const legRadius = 0.42;

    for (let i = 0; i < legCount; i++) {
      const angle = (i / legCount) * Math.PI * 2;

      // Chrome leg arm
      const legGeo = new THREE.BoxGeometry(0.05, 0.04, legRadius);
      const legMesh = new THREE.Mesh(legGeo, chromeMat);
      legMesh.castShadow = true;
      legMesh.position.set(
        Math.sin(angle) * (legRadius * 0.5),
        0.06,
        Math.cos(angle) * (legRadius * 0.5)
      );
      legMesh.rotation.y = angle;
      this.starBaseGroup.add(legMesh);

      // Caster wheel housing & wheels
      const casterGroup = new THREE.Group();
      casterGroup.position.set(
        Math.sin(angle) * legRadius,
        0.04,
        Math.cos(angle) * legRadius
      );

      // Wheel pin
      const pinGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.04, 8);
      const pinMesh = new THREE.Mesh(pinGeo, chromeMat);
      casterGroup.add(pinMesh);

      // Twin black rubber wheels
      const wheelGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.02, 12);
      wheelGeo.rotateZ(Math.PI / 2);
      const wheelLeft = new THREE.Mesh(wheelGeo, plasticMat);
      wheelLeft.position.set(-0.015, -0.015, 0);
      wheelLeft.castShadow = true;
      const wheelRight = new THREE.Mesh(wheelGeo, plasticMat);
      wheelRight.position.set(0.015, -0.015, 0);
      wheelRight.castShadow = true;

      casterGroup.add(wheelLeft);
      casterGroup.add(wheelRight);
      this.starBaseGroup.add(casterGroup);
      this.casters.push(casterGroup);
    }
    this.group.add(this.starBaseGroup);

    // 2. Central pneumatic cylinder (column)
    const colGroup = new THREE.Group();
    const outerCylinderGeo = new THREE.CylinderGeometry(0.045, 0.05, 0.22, 12);
    const outerCylinder = new THREE.Mesh(outerCylinderGeo, plasticMat);
    outerCylinder.position.y = 0.17;
    outerCylinder.castShadow = true;
    colGroup.add(outerCylinder);

    const innerPistonGeo = new THREE.CylinderGeometry(0.028, 0.028, 0.18, 12);
    const innerPiston = new THREE.Mesh(innerPistonGeo, chromeMat);
    innerPiston.position.y = 0.28;
    innerPiston.castShadow = true;
    colGroup.add(innerPiston);

    // Height adjustment lever
    const leverGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.18, 8);
    leverGeo.rotateZ(Math.PI / 2);
    const lever = new THREE.Mesh(leverGeo, plasticMat);
    lever.position.set(0.12, 0.35, 0.05);
    lever.rotation.z = -0.15;
    colGroup.add(lever);

    this.columnMesh = colGroup;
    this.group.add(colGroup);

    // 3. Seat cushion
    const seatGroup = new THREE.Group();
    seatGroup.position.y = 0.42;

    // Cushion base plate
    const basePlateGeo = new THREE.BoxGeometry(0.48, 0.03, 0.48);
    const basePlate = new THREE.Mesh(basePlateGeo, plasticMat);
    basePlate.castShadow = true;
    seatGroup.add(basePlate);

    // Blue foam cushion
    const cushionGeo = new THREE.CylinderGeometry(0.28, 0.27, 0.07, 16);
    cushionGeo.scale(1.0, 1.0, 0.95);
    const cushion = new THREE.Mesh(cushionGeo, fabricMat);
    cushion.position.y = 0.04;
    cushion.castShadow = true;
    cushion.receiveShadow = true;
    seatGroup.add(cushion);

    this.seatMesh = seatGroup;
    this.group.add(seatGroup);

    // 4. Backrest support stem and backrest
    const backGroup = new THREE.Group();
    backGroup.position.set(0, 0.45, -0.22);

    // L-shaped metal connector
    const stemVGeo = new THREE.BoxGeometry(0.06, 0.32, 0.025);
    const stemV = new THREE.Mesh(stemVGeo, chromeMat);
    stemV.position.set(0, 0.16, -0.04);
    backGroup.add(stemV);

    // Blue backrest cushion
    const backGeo = new THREE.BoxGeometry(0.46, 0.44, 0.06);
    const backMesh = new THREE.Mesh(backGeo, fabricMat);
    backMesh.position.set(0, 0.32, 0.0);
    backMesh.rotation.x = -0.08; // slightly leaned back
    backMesh.castShadow = true;
    backMesh.receiveShadow = true;
    backGroup.add(backMesh);

    // Backrest plastic rear shell
    const backShellGeo = new THREE.BoxGeometry(0.47, 0.45, 0.02);
    const backShell = new THREE.Mesh(backShellGeo, plasticMat);
    backShell.position.set(0, 0.32, -0.035);
    backShell.rotation.x = -0.08;
    backGroup.add(backShell);

    this.backrestMesh = backGroup;
    this.group.add(backGroup);

    // 5. Twin Fire Extinguishers mounted to rear of backrest
    this.extinguisherLeft = this._createExtinguisher(-0.16);
    this.extinguisherRight = this._createExtinguisher(0.16);
    this.group.add(this.extinguisherLeft);
    this.group.add(this.extinguisherRight);

    // Mounting brackets / metal straps
    const bracketGeo = new THREE.BoxGeometry(0.42, 0.03, 0.02);
    const bracketTop = new THREE.Mesh(bracketGeo, chromeMat);
    bracketTop.position.set(0, 0.8, -0.3);
    const bracketBtm = new THREE.Mesh(bracketGeo, chromeMat);
    bracketBtm.position.set(0, 0.6, -0.3);
    this.group.add(bracketTop);
    this.group.add(bracketBtm);

    // Position chair upright
    this.group.position.set(0, 0, 0);
  }

  _createExtinguisher(offsetX) {
    const extGroup = new THREE.Group();
    extGroup.position.set(offsetX, 0.72, -0.32);

    const extinguisherMat = new THREE.MeshStandardMaterial({
      color: 0xdc143c,
      roughness: 0.25,
      metalness: 0.4
    });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.7 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });

    // Main red cylinder body
    const bodyGeo = new THREE.CylinderGeometry(0.068, 0.068, 0.38, 16);
    const body = new THREE.Mesh(bodyGeo, extinguisherMat);
    body.castShadow = true;
    extGroup.add(body);

    // Rounded top dome
    const domeGeo = new THREE.SphereGeometry(0.068, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const dome = new THREE.Mesh(domeGeo, extinguisherMat);
    dome.position.y = 0.19;
    extGroup.add(dome);

    // Rounded bottom dome
    const btmGeo = new THREE.SphereGeometry(0.068, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const btm = new THREE.Mesh(btmGeo, extinguisherMat);
    btm.position.y = -0.19;
    extGroup.add(btm);

    // Valve head & release lever
    const valveGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.06, 8);
    const valve = new THREE.Mesh(valveGeo, silverMat);
    valve.position.y = 0.27;
    extGroup.add(valve);

    const leverGeo = new THREE.BoxGeometry(0.025, 0.04, 0.08);
    const lever = new THREE.Mesh(leverGeo, silverMat);
    lever.position.set(0, 0.29, -0.02);
    extGroup.add(lever);

    // Pressure Gauge (yellow dot)
    const gaugeGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.01, 8);
    gaugeGeo.rotateX(Math.PI / 2);
    const gauge = new THREE.Mesh(gaugeGeo, new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    gauge.position.set(0.03, 0.26, 0.02);
    extGroup.add(gauge);

    // Rear Jet Nozzle (angled downward and backward for maximum thrust)
    const nozzleGroup = new THREE.Group();
    nozzleGroup.position.set(0, -0.15, -0.08);
    nozzleGroup.rotation.x = -0.35; // pointed backwards/downwards

    const nozzleGeo = new THREE.ConeGeometry(0.045, 0.12, 12, 1, true);
    nozzleGeo.rotateX(-Math.PI / 2);
    const nozzle = new THREE.Mesh(nozzleGeo, blackMat);
    nozzleGroup.add(nozzle);

    // Nozzle tip dummy anchor for particle emitter
    const nozzleTip = new THREE.Object3D();
    nozzleTip.position.set(0, 0, -0.1);
    nozzleGroup.add(nozzleTip);
    extGroup.nozzleTip = nozzleTip;

    extGroup.add(nozzleGroup);
    return extGroup;
  }

  // Update nozzle & ground positions in world space
  updateWorldPositions() {
    if (this.extinguisherLeft?.nozzleTip) {
      this.extinguisherLeft.nozzleTip.getWorldPosition(this.leftNozzleWorldPos);
    }
    if (this.extinguisherRight?.nozzleTip) {
      this.extinguisherRight.nozzleTip.getWorldPosition(this.rightNozzleWorldPos);
    }

    // Foot brake / caster contact points
    this.group.getWorldPosition(this.leftCasterWorldPos);
    this.rightCasterWorldPos.copy(this.leftCasterWorldPos);

    const offsetL = new THREE.Vector3(-0.28, 0, 0).applyQuaternion(this.group.quaternion);
    const offsetR = new THREE.Vector3(0.28, 0, 0).applyQuaternion(this.group.quaternion);

    this.leftCasterWorldPos.add(offsetL);
    this.rightCasterWorldPos.add(offsetR);
    this.leftCasterWorldPos.y = 0.05;
    this.rightCasterWorldPos.y = 0.05;
  }

  // Apply tilt/roll to chair based on steering and drift
  setDynamics(rollAngle, pitchAngle, casterTurnAngle) {
    if (this.isShattered) return;
    this.seatMesh.rotation.z = rollAngle * 0.8;
    this.backrestMesh.rotation.z = rollAngle * 0.9;
    this.seatMesh.rotation.x = pitchAngle;

    // Swivel casters slightly towards movement
    for (let i = 0; i < this.casters.length; i++) {
      this.casters[i].rotation.y = casterTurnAngle * 0.5;
    }
  }

  // Shatter the chair into explosive pieces on CRASH
  shatter(impactVelocity) {
    if (this.isShattered) return;
    this.isShattered = true;

    // Detach main parts and make them independent physics debris
    const parts = [
      this.seatMesh,
      this.backrestMesh,
      this.columnMesh,
      this.starBaseGroup,
      this.extinguisherLeft,
      this.extinguisherRight
    ];

    this.debrisList = [];

    parts.forEach((part) => {
      if (!part) return;
      // Get current world transform
      const worldPos = new THREE.Vector3();
      const worldQuat = new THREE.Quaternion();
      part.getWorldPosition(worldPos);
      part.getWorldQuaternion(worldQuat);

      // Reparent to root group with global transforms
      part.position.copy(worldPos);
      part.quaternion.copy(worldQuat);

      // Assign explosive debris physics
      const scatterSpeed = 8 + Math.random() * 12;
      const angle = Math.random() * Math.PI * 2;
      const vel = new THREE.Vector3(
        Math.cos(angle) * scatterSpeed + (impactVelocity?.x || 0) * 0.3,
        6 + Math.random() * 10,
        Math.sin(angle) * scatterSpeed + (impactVelocity?.z || 0) * 0.3
      );

      const rotVel = new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15
      );

      this.debrisList.push({
        mesh: part,
        vel: vel,
        rotVel: rotVel,
        bounces: 0
      });
    });
  }

  updateDebris(dt) {
    if (!this.isShattered) return;
    const gravity = -24;

    for (let i = 0; i < this.debrisList.length; i++) {
      const d = this.debrisList[i];
      d.vel.y += gravity * dt;
      d.mesh.position.addScaledVector(d.vel, dt);

      d.mesh.rotation.x += d.rotVel.x * dt;
      d.mesh.rotation.y += d.rotVel.y * dt;
      d.mesh.rotation.z += d.rotVel.z * dt;

      // Ground bounce
      if (d.mesh.position.y < 0.15) {
        d.mesh.position.y = 0.15;
        d.vel.y = -d.vel.y * 0.45;
        d.vel.x *= 0.7;
        d.vel.z *= 0.7;
        d.rotVel.multiplyScalar(0.7);
        d.bounces++;
      }
    }
  }

  reset() {
    this.isShattered = false;
    this.debrisList = [];

    // Re-attach parts to default local positions
    this.seatMesh.position.set(0, 0.42, 0);
    this.seatMesh.rotation.set(0, 0, 0);

    this.backrestMesh.position.set(0, 0.45, -0.22);
    this.backrestMesh.rotation.set(0, 0, 0);

    this.columnMesh.position.set(0, 0, 0);
    this.columnMesh.rotation.set(0, 0, 0);

    this.starBaseGroup.position.set(0, 0, 0);
    this.starBaseGroup.rotation.set(0, 0, 0);

    this.extinguisherLeft.position.set(-0.16, 0.72, -0.32);
    this.extinguisherLeft.rotation.set(0, 0, 0);

    this.extinguisherRight.position.set(0.16, 0.72, -0.32);
    this.extinguisherRight.rotation.set(0, 0, 0);
  }
}
