import * as THREE from 'three';
import { Stage, StageResult } from '../types';
import { InputManager } from '../input';
import { EffectsManager } from '../effects';
import { sound } from '../audio';

export class Stage5Yakisoba implements Stage {
  id = 4;
  numberText = 'STAGE 4';
  title = '焼きそば湯切り';
  mission = 'フタ崩壊寸前を攻めて湯を切り切れ！';
  instruction = '[ENTER / ↑] 傾ける';
  limitLabel = 'フタ剥がれ度';

  private scene!: THREE.Scene;
  private effects!: EffectsManager;
  private stageGroup = new THREE.Group();

  // State
  private waterRemaining = 100.0; // 100% to 0%
  private lidStress = 0.0; // 0 to 1.0 (tears at 1.0)
  private currentTilt = 0.0; // 0.0 (flat) to 1.3 rad (~75 deg)
  private failed = false;
  private completed = false;
  private timeLeft = 8.0;
  private active = false;

  // Meshes
  private cupGroup = new THREE.Group();
  private lidMesh!: THREE.Mesh;
  private lidFlapGroup = new THREE.Group();
  private noodlesMesh!: THREE.Mesh;
  private hotWaterMesh!: THREE.Mesh;
  private waterStreamMesh!: THREE.Mesh;
  private slitJetsGroup = new THREE.Group();
  private sinkGroup = new THREE.Group();

  constructor(effects: EffectsManager) {
    this.effects = effects;
  }

  init(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    // Closer camera: angled to clearly witness the lid flap peeling and water draining simultaneously
    this.effects.setCameraBase(
      new THREE.Vector3(0, 1.9, 2.9),
      new THREE.Vector3(0, 0.7, 0.1)
    );

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.75);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(3, 7, 4);
    this.stageGroup.add(amb, dir);

    // Build Stainless Sink
    this.sinkGroup = new THREE.Group();
    this.sinkGroup.position.set(0, -0.6, 0);

    // Sink basin floor
    const sinkFloorMat = new THREE.MeshStandardMaterial({
      color: 0x888c94,
      metalness: 0.85,
      roughness: 0.25,
    });
    const sinkFloor = new THREE.Mesh(new THREE.BoxGeometry(7, 0.2, 5), sinkFloorMat);
    this.sinkGroup.add(sinkFloor);

    // Drain hole
    const drainGeom = new THREE.CylinderGeometry(0.55, 0.55, 0.22, 24);
    const drainMat = new THREE.MeshBasicMaterial({ color: 0x111115 });
    const drainHole = new THREE.Mesh(drainGeom, drainMat);
    drainHole.position.set(0, 0.01, 0.3);
    this.sinkGroup.add(drainHole);

    // Drain strainer grid
    const strainerGeom = new THREE.TorusGeometry(0.52, 0.03, 8, 24);
    const strainerMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.9 });
    const strainer = new THREE.Mesh(strainerGeom, strainerMat);
    strainer.rotation.x = Math.PI / 2;
    strainer.position.set(0, 0.12, 0.3);
    this.sinkGroup.add(strainer);

    // Cross bars for drain
    const barGeom = new THREE.BoxGeometry(1.0, 0.02, 0.04);
    const bar1 = new THREE.Mesh(barGeom, strainerMat);
    bar1.position.set(0, 0.12, 0.3);
    const bar2 = new THREE.Mesh(barGeom, strainerMat);
    bar2.rotation.y = Math.PI / 2;
    bar2.position.set(0, 0.12, 0.3);
    this.sinkGroup.add(bar1, bar2);

    this.stageGroup.add(this.sinkGroup);

    // Build Yakisoba Container
    this.cupGroup = new THREE.Group();
    this.cupGroup.position.set(0, 1.4, 0.2);

    // Square Styrofoam Container
    const cupOuterGeom = new THREE.BoxGeometry(1.8, 0.7, 1.8);
    const cupMat = new THREE.MeshStandardMaterial({
      color: 0xf4f4f0,
      roughness: 0.9,
    });
    const cupOuter = new THREE.Mesh(cupOuterGeom, cupMat);
    this.cupGroup.add(cupOuter);

    // Noodles inside
    const noodleGeom = new THREE.BoxGeometry(1.5, 0.45, 1.5);
    const noodleMat = new THREE.MeshStandardMaterial({
      color: 0xdfa038, // curly noodle color
      roughness: 0.8,
    });
    this.noodlesMesh = new THREE.Mesh(noodleGeom, noodleMat);
    this.noodlesMesh.position.set(0, 0.1, 0);
    this.cupGroup.add(this.noodlesMesh);

    // Copious Hot Water filling inside the cup (submerging noodles)
    const waterGeom = new THREE.BoxGeometry(1.68, 0.44, 1.68);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x66ccff,
      transparent: true,
      opacity: 0.72,
      roughness: 0.1,
      metalness: 0.25,
    });
    this.hotWaterMesh = new THREE.Mesh(waterGeom, waterMat);
    this.hotWaterMesh.position.set(0, 0.12, 0);
    this.cupGroup.add(this.hotWaterMesh);

    // Cabbage bits floating in the hot water
    for (let i = 0; i < 6; i++) {
      const cab = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.02, 0.14),
        new THREE.MeshStandardMaterial({ color: 0x38b000 })
      );
      cab.position.set((Math.random() - 0.5) * 1.2, 0.33, (Math.random() - 0.5) * 1.2);
      cab.rotation.y = Math.random() * Math.PI;
      this.cupGroup.add(cab);
    }

    // Main Lid (covers back half)
    const lidGeom = new THREE.BoxGeometry(1.82, 0.03, 1.2);
    const lidMat = new THREE.MeshStandardMaterial({
      color: 0xcc2222, // iconic instant yakisoba red design
      metalness: 0.1,
      roughness: 0.4,
    });
    this.lidMesh = new THREE.Mesh(lidGeom, lidMat);
    this.lidMesh.position.set(0, 0.36, -0.3);
    this.cupGroup.add(this.lidMesh);

    // Front Lid Flap with Drain Slits & Hazard Yellow Warning Rim
    this.lidFlapGroup = new THREE.Group();
    this.lidFlapGroup.position.set(0, 0.36, 0.3); // hinge point

    const flapGeom = new THREE.BoxGeometry(1.82, 0.03, 0.6);
    flapGeom.translate(0, 0, 0.3); // pivot along hinge
    const flapMat = new THREE.MeshStandardMaterial({
      color: 0xff3333,
      metalness: 0.1,
      roughness: 0.4,
    });
    const flapMesh = new THREE.Mesh(flapGeom, flapMat);

    // Hazard Yellow Border on flap front edge
    const hazardEdge = new THREE.Mesh(
      new THREE.BoxGeometry(1.84, 0.04, 0.08),
      new THREE.MeshBasicMaterial({ color: 0xffe600 })
    );
    hazardEdge.position.set(0, 0.01, 0.58);
    flapMesh.add(hazardEdge);

    // Drain slits texture/cutouts on the flap (openings reveal hot water)
    const slitMat = new THREE.MeshBasicMaterial({ color: 0x1a3344 });
    for (let s = -2; s <= 2; s++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.04, 0.26), slitMat);
      slit.position.set(s * 0.22, 0.01, 0.38);
      flapMesh.add(slit);
    }

    this.lidFlapGroup.add(flapMesh);
    this.cupGroup.add(this.lidFlapGroup);

    // Slit Jets Group: separate water jet streamers coming directly out of the slits
    this.slitJetsGroup = new THREE.Group();
    this.slitJetsGroup.position.set(0, 0.36, 0.85);
    const jetMat = new THREE.MeshBasicMaterial({
      color: 0x99ddff,
      transparent: true,
      opacity: 0.8,
    });
    for (let s = -2; s <= 2; s++) {
      const jetGeom = new THREE.CylinderGeometry(0.03, 0.06, 0.6, 6);
      jetGeom.translate(0, -0.3, 0);
      const jet = new THREE.Mesh(jetGeom, jetMat);
      jet.position.set(s * 0.22, 0, 0);
      jet.rotation.x = Math.PI * 0.25;
      this.slitJetsGroup.add(jet);
    }
    this.slitJetsGroup.visible = false;
    this.cupGroup.add(this.slitJetsGroup);

    // Massive Main Hot Water Drain Torrent (from front edge of cup splashing into sink)
    const streamGeom = new THREE.CylinderGeometry(0.18, 0.38, 1.8, 10);
    streamGeom.translate(0, -0.9, 0);
    const streamMat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.85,
    });
    this.waterStreamMesh = new THREE.Mesh(streamGeom, streamMat);
    this.waterStreamMesh.position.set(0, 0.25, 0.9);
    this.waterStreamMesh.visible = false;
    this.cupGroup.add(this.waterStreamMesh);

    this.stageGroup.add(this.cupGroup);
  }

  start() {
    this.active = true;
  }

  update(dt: number, input: InputManager): StageResult | null {
    if (!this.active) return null;

    this.timeLeft -= dt;

    if (!this.failed && !this.completed) {
      // Input: Lever Forward tilt amount (0.0 to 1.0)
      const forwardInput = input.getForwardTilt();

      // Target cup tilt in radians (0 to 75 deg = 1.3 rad)
      const targetTilt = forwardInput * 1.3;
      this.currentTilt = THREE.MathUtils.lerp(this.currentTilt, targetTilt, dt * 8);
      this.cupGroup.rotation.x = this.currentTilt;

      const tiltDegrees = (this.currentTilt * 180) / Math.PI;

      // Water drainage logic
      if (tiltDegrees > 18 && this.waterRemaining > 0) {
        // Pour rate increases with tilt angle
        const flowRate = Math.pow((tiltDegrees - 18) / 45, 1.6) * 34;
        this.waterRemaining = Math.max(0, this.waterRemaining - flowRate * dt);

        this.waterStreamMesh.visible = true;
        this.slitJetsGroup.visible = true;
        sound.startPourSound();

        // Massive torrential water stream expands with flow
        const streamScale = 0.9 + (flowRate / 30) * 1.5;
        this.waterStreamMesh.scale.set(streamScale, 1, streamScale);

        // Tilt tension 0→1 across the pour range — drives escalating "about to overflow" staging
        const tiltIntensity = Math.min(1, Math.max(0, (tiltDegrees - 18) / 60));

        // Water violently splashing in sink basin — more furious the harder it's tilted
        if (Math.random() < 0.5 + tiltIntensity * 0.4) {
          this.effects.spawnLiquidSplash(
            new THREE.Vector3(0, -0.45, 0.3),
            0x77ccff,
            3 + Math.round(tiltIntensity * 6)
          );
        }

        // Extra splash right at the cup's front lip — sells the "about to spill over the lid" feeling
        if (tiltIntensity > 0.5 && Math.random() < 0.4) {
          this.effects.spawnLiquidSplash(new THREE.Vector3(0, 1.6, 1.0), 0x99ddff, 2 + Math.round(tiltIntensity * 3));
        }

        // Billowing hot steam rising from sink drain
        if (Math.random() < 0.5) {
          this.effects.spawnSmoke(
            new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.3, 0.3),
            0xffffff,
            2
          );
        }

        // Camera shake grows with how hard it's tilted, independent of lid stress —
        // constant escalating tension while pouring, not just near failure
        this.effects.addTrauma(tiltIntensity * tiltIntensity * 0.045);
      } else {
        this.waterStreamMesh.visible = false;
        this.slitJetsGroup.visible = false;
        sound.stopPourSound();
      }

      // Copious water inside cup dynamically sloshes and drains
      const waterRatio = this.waterRemaining / 100.0;
      this.hotWaterMesh.scale.set(1, Math.max(0.01, waterRatio), 1);
      this.hotWaterMesh.position.y = -0.1 + waterRatio * 0.22;
      this.hotWaterMesh.position.z = Math.sin(this.currentTilt) * 0.25;
      this.hotWaterMesh.visible = waterRatio > 0.01;

      // Hot steam constantly wafting up from hot water slits
      if (this.waterRemaining > 0 && Math.random() < 0.2) {
        this.effects.spawnSmoke(
          new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.9, 0.3),
          0xffffff,
          1
        );
      }

      // Lid peel stress logic:
      // Safe up to ~42 degrees. Beyond 42 degrees, seal peels back ("ペリペリ...")
      if (tiltDegrees > 42) {
        const excess = (tiltDegrees - 42) / 30; // 0 at 42deg, 1.0 at 72deg
        // Stress builds rapidly if held at steep angles
        this.lidStress += excess * dt * 0.65;

        // Lid flap visibly curls open as stress accumulates
        this.lidFlapGroup.rotation.x = -Math.pow(this.lidStress, 1.4) * 0.95;

        // Peel tick sound
        if (Math.random() < 0.3) {
          sound.playClick(600 + Math.random() * 400);
        }
      } else {
        // Slowly recover a little bit if back off
        this.lidStress = Math.max(0, this.lidStress - dt * 0.15);
        this.lidFlapGroup.rotation.x = -Math.pow(this.lidStress, 1.4) * 0.95;
      }

      // Multi-tier lid stress feedback (replaces numeric meter):
      if (this.lidStress > 0.9) {
        // CRITICAL: rapid creak ticks, abundant steam, lid flap shakes
        if (Math.random() < 0.3) sound.playTick(1600 + Math.random() * 600);
        this.effects.spawnSmoke(new THREE.Vector3(0, 1.4, 0.5), 0xffffff, 3);
        this.effects.spawnSmoke(new THREE.Vector3(0.2, 1.3, 0.4), 0xbbbbff, 2);
        // Lid flap jitters
        const jitter = (this.lidStress - 0.9) * 0.3;
        this.lidFlapGroup.rotation.z = (Math.random() - 0.5) * jitter;
        this.lidFlapGroup.rotation.y = (Math.random() - 0.5) * jitter * 0.5;
        // Cup itself wobbles
        this.cupGroup.position.x = Math.sin(Date.now() * 0.04) * jitter * 0.12;
      } else if (this.lidStress > 0.7) {
        // Warning: moderate steam and gentle wobble
        if (Math.random() < 0.18) sound.playTick(1200);
        if (Math.random() < 0.4) this.effects.spawnSmoke(new THREE.Vector3(0, 1.4, 0.5), 0xffffff, 2);
        this.cupGroup.position.x = 0;
        this.lidFlapGroup.rotation.z = 0;
      } else {
        this.cupGroup.position.x = 0;
        this.lidFlapGroup.rotation.z = 0;
      }

      // 1. Check Failure: Lid Catastrophic Failure!
      if (this.lidStress >= 1.0 || tiltDegrees > 78) {
        this.failed = true;
        sound.stopPourSound();
        this.waterStreamMesh.visible = false;
        this.slitJetsGroup.visible = false;
        this.triggerFailureEffects();
        return {
          completed: true,
          success: false,
          scorePercent: 0,
          judgmentText: '大惨事',
        };
      }

      // 2. Check Success: All water drained!
      if (this.waterRemaining <= 0.05) {
        this.completed = true;
        sound.stopPourSound();
        this.waterStreamMesh.visible = false;
        this.slitJetsGroup.visible = false;

        // Max courage score: The higher the lidStress was pushed without bursting, the higher the score!
        const baseScore = 95.0;
        const courageBonus = this.lidStress * 4.9;
        const scorePercent = Number(Math.min(99.9, baseScore + courageBonus).toFixed(1));

        sound.playSuccessChime(scorePercent);
        return {
          completed: true,
          success: true,
          scorePercent,
          judgmentText: '成功',
        };
      }
    }

    // Time out check
    if (this.timeLeft <= 0 && !this.failed && !this.completed) {
      sound.stopPourSound();
      this.waterStreamMesh.visible = false;
      this.slitJetsGroup.visible = false;

      // If time ran out with lots of water remaining -> soggy yakisoba (failure)
      const drained = 100 - this.waterRemaining;
      if (drained >= 80) {
        const scorePercent = Number(drained.toFixed(1));
        sound.playSuccessChime(scorePercent);
        return {
          completed: true,
          success: true,
          scorePercent,
          judgmentText: '成功',
        };
      } else {
        this.failed = true;
        sound.playFailBuzzer();
        return {
          completed: true,
          success: false,
          scorePercent: 0,
          judgmentText: '大惨事',
        };
      }
    }

    return null;
  }

  triggerFailureEffects() {
    sound.playFailBuzzer();
    sound.playExplosion();
    this.effects.addTrauma(0.95);

    // Lid rips completely off and flies backwards
    this.lidFlapGroup.rotation.x = -Math.PI * 0.85;
    this.noodlesMesh.visible = false;
    this.hotWaterMesh.visible = false;

    // Catastrophic noodle avalanche into the sink!
    this.effects.spawnExplosionChunks(new THREE.Vector3(0, 0.8, 0.4), 0xdfa038, 45, 0.14);
    // Cabbage bits
    this.effects.spawnExplosionChunks(new THREE.Vector3(0, 0.8, 0.4), 0x38b000, 20, 0.08);
    // Massive deluge of boiling hot water splashing violently across the sink!
    this.effects.spawnLiquidSplash(new THREE.Vector3(0, -0.4, 0.3), 0x66ccff, 70);
    this.effects.spawnLiquidSplash(new THREE.Vector3(0.2, -0.2, 0.4), 0x99ddff, 50);
    this.effects.spawnSmoke(new THREE.Vector3(0, 0.2, 0.4), 0xffffff, 8);
  }

  getLimitValue(): number {
    // Limit is lid stress percentage
    return Math.min(100, Math.max(0, this.lidStress * 100));
  }

  getRemainingTime(): number {
    return Math.max(0, this.timeLeft);
  }

  getSubInfo(): string | null {
    if (this.completed) return '湯切り完了 0.0%';
    if (this.failed) return 'フタ崩壊 (大惨事)';
    return `残り湯量 ${this.waterRemaining.toFixed(1)}%`;
  }

  cleanup(scene: THREE.Scene) {
    sound.stopPourSound();
    scene.remove(this.stageGroup);
  }
}
