import * as THREE from 'three';
import { Stage, StageResult, StageBriefing } from '../types';
import { InputManager } from '../input';
import { EffectsManager } from '../effects';
import { sound } from '../audio';

export class Stage1Drink implements Stage {
  id = 1;
  numberText = 'STAGE 1';
  title = 'ドリンクバー';
  mission = '泡を溢れさせずにフチ極限まで注げ！';
  instruction = '[レバー上] 長押し: 注ぐ (離して確定)';
  briefing: StageBriefing = {
    key: '[レバー上] 長押し',
    ok: 'フチ極限まで注いで離す',
    ng: 'あふれる・足りなすぎ',
  };
  limitLabel = '液面・泡限界';

  private scene!: THREE.Scene;
  private effects!: EffectsManager;
  private stageGroup = new THREE.Group();

  // Glass dimensions
  private readonly glassHeight = 3.0;
  private readonly glassRadius = 0.9;
  private readonly maxSafeHeight = 2.85; // rim height

  // State
  private isPouring = false;
  private liquidHeight = 0.2; // starts slightly filled
  private foamHeight = 0.05;
  private hasReleased = false;
  private completed = false;
  private failed = false;
  private timeLeft = 12.0;
  private settleTimer = 0.0;
  private readonly settleWait = 1.0; // レバーを離して1秒静止で自動確定
  private active = false;
  // 毎回わずかに違う(±10%程度)。同じ手順の暗記だけでは通らないようにする
  private readonly pourSpeed = 0.7 * (0.9 + Math.random() * 0.2);
  private readonly foamSurgeSpeed = 1.3 * (0.9 + Math.random() * 0.2);

  // Meshes
  private glassMesh!: THREE.Mesh;
  private liquidMesh!: THREE.Mesh;
  private foamMesh!: THREE.Mesh;
  private streamMesh!: THREE.Mesh;
  private nozzleGroup!: THREE.Group;
  private bubbleParticles!: THREE.Points;

  constructor(effects: EffectsManager) {
    this.effects = effects;
  }

  init(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    // Optimized camera: eye-level with the glass rim for precise edge judgment
    this.effects.setCameraBase(
      new THREE.Vector3(0, 2.7, 3.2),
      new THREE.Vector3(0, 2.1, 0)
    );

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(3, 8, 5);
    this.stageGroup.add(amb, dir);

    // Table / Counter
    const tableGeom = new THREE.BoxGeometry(10, 1, 6);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.3,
      metalness: 0.8,
    });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.position.set(0, -0.5, 0);
    this.stageGroup.add(table);

    // Dispenser machine nozzle at top
    this.nozzleGroup = new THREE.Group();
    const nozzleHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.8, 16),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.15 })
    );
    nozzleHead.position.set(0, 4.2, 0);
    const nozzleTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.3, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 })
    );
    nozzleTip.position.set(0, 3.7, 0);
    this.nozzleGroup.add(nozzleHead, nozzleTip);
    this.stageGroup.add(this.nozzleGroup);

    // Stream from nozzle to glass
    const streamGeom = new THREE.CylinderGeometry(0.1, 0.1, 2.0, 8);
    const streamMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.9,
    });
    this.streamMesh = new THREE.Mesh(streamGeom, streamMat);
    this.streamMesh.position.set(0, 2.7, 0);
    this.streamMesh.visible = false;
    this.stageGroup.add(this.streamMesh);

    // Transparent Glass
    const glassGeom = new THREE.CylinderGeometry(
      this.glassRadius,
      this.glassRadius * 0.8,
      this.glassHeight,
      32,
      1,
      true
    );
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.4,
      roughness: 0.05,
      metalness: 0.1,
      transmission: 0.8,
      ior: 1.5,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.glassMesh = new THREE.Mesh(glassGeom, glassMat);
    this.glassMesh.position.set(0, this.glassHeight / 2, 0);
    this.stageGroup.add(this.glassMesh);

    // Glass Base Bottom
    const baseGeom = new THREE.CylinderGeometry(this.glassRadius * 0.8, this.glassRadius * 0.82, 0.1, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.2 });
    const glassBase = new THREE.Mesh(baseGeom, baseMat);
    glassBase.position.set(0, 0.05, 0);
    this.stageGroup.add(glassBase);

    // Hazard Red Limit Rim Ring at exactly maxSafeHeight
    const rimGeom = new THREE.TorusGeometry(this.glassRadius + 0.01, 0.04, 8, 32);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    const rim = new THREE.Mesh(rimGeom, rimMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, this.maxSafeHeight, 0);
    this.stageGroup.add(rim);

    // Limit warning tick lines on glass side (75%, 50%, 25%)
    [0.75, 0.5, 0.25].forEach(ratio => {
      const tickH = this.maxSafeHeight * ratio;
      const tickGeom = new THREE.TorusGeometry(this.glassRadius * 0.98, 0.015, 6, 24);
      const tickMat = new THREE.MeshBasicMaterial({ color: 0x88ff88 });
      const tick = new THREE.Mesh(tickGeom, tickMat);
      tick.rotation.x = Math.PI / 2;
      tick.position.set(0, tickH, 0);
      this.stageGroup.add(tick);
    });

    // Liquid Mesh (melon soda bright green)
    const liquidGeom = new THREE.CylinderGeometry(
      this.glassRadius * 0.95,
      this.glassRadius * 0.76,
      1,
      32
    );
    // Anchor cylinder base at bottom
    liquidGeom.translate(0, 0.5, 0);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0x11ff60,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x00aa33,
      emissiveIntensity: 0.2,
    });
    this.liquidMesh = new THREE.Mesh(liquidGeom, liquidMat);
    this.liquidMesh.position.set(0, 0, 0);
    this.stageGroup.add(this.liquidMesh);

    // Foam Mesh (thick bubbly head)
    const foamGeom = new THREE.CylinderGeometry(
      this.glassRadius * 0.96,
      this.glassRadius * 0.94,
      1,
      32
    );
    foamGeom.translate(0, 0.5, 0);
    const foamMat = new THREE.MeshStandardMaterial({
      color: 0xeeffee,
      roughness: 0.9,
      metalness: 0.0,
      emissive: 0x224422,
      emissiveIntensity: 0.1,
    });
    this.foamMesh = new THREE.Mesh(foamGeom, foamMat);
    this.foamMesh.position.set(0, 0, 0);
    this.stageGroup.add(this.foamMesh);

    // Internal soda bubbles
    const bubbleCount = 40;
    const bubblePos = new Float32Array(bubbleCount * 3);
    for (let i = 0; i < bubbleCount; i++) {
      bubblePos[i * 3 + 0] = (Math.random() - 0.5) * (this.glassRadius * 1.4);
      bubblePos[i * 3 + 1] = Math.random() * this.glassHeight;
      bubblePos[i * 3 + 2] = (Math.random() - 0.5) * (this.glassRadius * 1.4);
    }
    const bubbleGeom = new THREE.BufferGeometry();
    bubbleGeom.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
    const bubbleMat = new THREE.PointsMaterial({
      color: 0xaaffaa,
      size: 0.06,
      transparent: true,
      opacity: 0.8,
    });
    this.bubbleParticles = new THREE.Points(bubbleGeom, bubbleMat);
    this.stageGroup.add(this.bubbleParticles);

    this.updateVisuals();
  }

  start() {
    this.active = true;
  }

  private updateVisuals() {
    // Liquid scale and position
    this.liquidMesh.scale.set(1, Math.max(0.01, this.liquidHeight), 1);

    // Foam is placed right on top of the liquid
    this.foamMesh.position.y = this.liquidHeight;
    this.foamMesh.scale.set(1, Math.max(0.01, this.foamHeight), 1);
  }

  update(dt: number, input: InputManager): StageResult | null {
    if (!this.active || this.completed) return null;

    this.timeLeft -= dt;

    // Jiggle internal bubbles
    const posAttr = this.bubbleParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      let y = posAttr.getY(i) + dt * 0.8;
      if (y > this.liquidHeight) y = 0.05;
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;

    // Check pouring input: Lever Up (or Button 0 / W / Enter for compatibility)
    if (!this.failed) {
      if (input.isLeverUp() || input.isButton0()) {
        this.settleTimer = 0.0;
        if (!this.isPouring) {
          this.isPouring = true;
          this.hasReleased = true; // marked as has participated
          sound.startPourSound();
          this.streamMesh.visible = true;
        }

        // Liquid rises steadily
        this.liquidHeight += this.pourSpeed * dt;

        // Foam surges up much faster!
        this.foamHeight += this.foamSurgeSpeed * dt;

        // Slight nozzle vibration
        this.nozzleGroup.position.x = (Math.random() - 0.5) * 0.02;

        // Tension audio cues when foam is near the rim
        const totalTop = this.liquidHeight + this.foamHeight;
        const proximity = totalTop / this.maxSafeHeight;
        if (proximity > 0.9) {
          // Rapid high-pitched ticks — "it's about to spill!"
          if (Math.random() < 0.25) sound.playTick(1800 + Math.random() * 400);
          // Foam itself trembles violently
          this.foamMesh.position.x = (Math.random() - 0.5) * 0.06;
          this.foamMesh.position.z = (Math.random() - 0.5) * 0.06;
        } else if (proximity > 0.75) {
          if (Math.random() < 0.1) sound.playTick(1200);
          this.foamMesh.position.x = (Math.random() - 0.5) * 0.025;
          this.foamMesh.position.z = (Math.random() - 0.5) * 0.025;
        } else {
          this.foamMesh.position.x = 0;
          this.foamMesh.position.z = 0;
        }

        // Spawn occasional splash droplet
        if (Math.random() < 0.3) {
          this.effects.spawnLiquidSplash(
            new THREE.Vector3(0, this.liquidHeight + this.foamHeight, 0),
            0x11ff60,
            2
          );
        }
      } else {
        if (this.isPouring) {
          // Temporarily stop pouring
          this.isPouring = false;
          sound.stopPourSound();
          this.streamMesh.visible = false;
          this.nozzleGroup.position.set(0, 0, 0);
        }

        // Foam subsides smoothly when not pouring, allowing more room to pour liquid!
        if (this.foamHeight > 0.02) {
          this.foamHeight = Math.max(0.01, this.foamHeight - dt * 1.15);
        }
        this.foamMesh.position.x = 0;
        this.foamMesh.position.z = 0;

        // 一度でも注いだ後は、レバーを離して静止すると自動確定タイマーが進む
        if (this.hasReleased && !this.completed) {
          this.settleTimer += dt;
        }
      }
    }

    // Total top height of the drink = liquid + foam
    const totalTop = this.liquidHeight + this.foamHeight;

    // 1. Check Overflow Failure Condition
    if (totalTop > this.maxSafeHeight && !this.failed) {
      this.failed = true;
      sound.stopPourSound();
      this.streamMesh.visible = false;
      this.triggerFailureEffects();
      return {
        completed: true,
        success: false,
        scorePercent: 0,
        judgmentText: '大惨事',
      };
    }

    // 2. Finalize stage when timeout occurs OR settled after pouring
    const isSettled = this.hasReleased && !this.isPouring && this.settleTimer >= this.settleWait;
    if ((this.timeLeft <= 0 || isSettled) && !this.failed && this.hasReleased) {
      this.completed = true;
      this.isPouring = false;
      sound.stopPourSound();
      this.streamMesh.visible = false;

      // Calculate score based on liquid height reached relative to rim
      // Pure liquid + settled foam near the top gives max score!
      const effectiveHeight = this.liquidHeight + this.foamHeight * 0.8;
      const scoreRatio = Math.min(0.999, effectiveHeight / this.maxSafeHeight);
      const scorePercent = Number((scoreRatio * 100).toFixed(1));

      if (scorePercent >= 35) {
        sound.playSuccessChime(scorePercent);
        return {
          completed: true,
          success: true,
          scorePercent,
          judgmentText: '成功',
        };
      } else {
        // Underfilled
        sound.playFailBuzzer();
        return {
          completed: true,
          success: false,
          scorePercent,
          judgmentText: '大惨事',
        };
      }
    }

    // Never poured and timed out
    if (this.timeLeft <= 0 && !this.failed && !this.hasReleased) {
      this.failed = true;
      sound.stopPourSound();
      this.streamMesh.visible = false;
      sound.playFailBuzzer();
      return {
        completed: true,
        success: false,
        scorePercent: 0,
        judgmentText: '大惨事',
      };
    }

    this.updateVisuals();
    return null;
  }

  triggerFailureEffects() {
    sound.playFailBuzzer();
    sound.playExplosion();
    this.effects.addTrauma(0.85);
    // Green soda overflow cascade
    this.effects.spawnLiquidSplash(
      new THREE.Vector3(0, this.maxSafeHeight, 0),
      0x11ff60,
      40
    );
    this.effects.spawnLiquidSplash(
      new THREE.Vector3(0.5, this.maxSafeHeight, 0.5),
      0xffffff,
      20
    );
  }

  getLimitValue(): number {
    const totalTop = this.liquidHeight + this.foamHeight;
    return Math.min(100, Math.max(0, (totalTop / this.maxSafeHeight) * 100));
  }

  getRemainingTime(): number {
    return Math.max(0, this.timeLeft);
  }

  getSubInfo(): string | null {
    if (this.hasReleased && !this.isPouring && !this.completed && !this.failed) {
      const remain = Math.max(0, this.settleWait - this.settleTimer);
      return `確定まで ${remain.toFixed(1)}s`;
    }
    return null;
  }

  cleanup(scene: THREE.Scene) {
    sound.stopPourSound();
    scene.remove(this.stageGroup);
  }
}
