import * as THREE from 'three';
import { Stage, StageResult, StageBriefing } from '../types';
import { InputManager } from '../input';
import { EffectsManager } from '../effects';
import { sound } from '../audio';

export class Stage4Clock implements Stage {
  id = 3;
  numberText = 'STAGE 3';
  title = '目覚まし時計';
  mission = '07:00ジャスト鳴動直前に止めろ！';
  instruction = '[ENTER] 止める(1回)';
  briefing: StageBriefing = {
    key: 'ENTER',
    ok: '07:00:00の直前で止める',
    ng: '鳴ってしまう・早すぎ',
  };
  limitLabel = '07:00接近度';

  private scene!: THREE.Scene;
  private effects!: EffectsManager;
  private stageGroup = new THREE.Group();

  // Clock time progress: 0.0 (06:59:50) to 10.0 seconds (07:00:00)
  // Let's run 10 virtual seconds over ~4.5 real seconds: rate = 10 / 4.5 = 2.22
  private virtualSeconds = 0.0; // 0.0 to 10.0
  private readonly maxVirtualSeconds = 10.0;
  // 時計の進む速さ(仮想秒/実秒)。毎回 2.0〜2.5 の間で変わる
  private readonly timeRate = 2.0 + Math.random() * 0.5;
  private active = false;
  private stopped = false;
  private alarmed = false;
  private hammerAnim = 0;

  // Meshes
  private clockGroup = new THREE.Group();
  private secondHand!: THREE.Mesh;
  private minuteHand!: THREE.Mesh;
  private hourHand!: THREE.Mesh;
  private topButton!: THREE.Mesh;
  private hammerMesh!: THREE.Mesh;
  private bellL!: THREE.Mesh;
  private bellR!: THREE.Mesh;

  private dialCanvas!: HTMLCanvasElement;
  private dialTexture!: THREE.CanvasTexture;

  constructor(effects: EffectsManager) {
    this.effects = effects;
  }

  init(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    // Closer camera framing the clock face directly
    this.effects.setCameraBase(
      new THREE.Vector3(0, 1.35, 2.8),
      new THREE.Vector3(0, 1.15, 0)
    );

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    const dir = new THREE.DirectionalLight(0xffffff, 1.3);
    dir.position.set(3, 6, 4);
    this.stageGroup.add(amb, dir);

    // Nightstand surface
    const tableGeom = new THREE.BoxGeometry(8, 1, 6);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x1f1814,
      roughness: 0.6,
    });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.position.set(0, -0.5, 0);
    this.stageGroup.add(table);

    // Build Alarm Clock
    this.clockGroup = new THREE.Group();
    this.clockGroup.position.set(0, 1.2, 0);

    // Main Clock Case (Retro Red/Metal Cylinder)
    const caseGeom = new THREE.CylinderGeometry(1.2, 1.2, 0.6, 32);
    caseGeom.rotateX(Math.PI / 2);
    const caseMat = new THREE.MeshStandardMaterial({
      color: 0xd62828,
      roughness: 0.3,
      metalness: 0.4,
    });
    const clockCase = new THREE.Mesh(caseGeom, caseMat);
    this.clockGroup.add(clockCase);

    // Bezel Rim
    const bezelGeom = new THREE.TorusGeometry(1.22, 0.06, 12, 32);
    const bezelMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      metalness: 0.9,
      roughness: 0.15,
    });
    const bezel = new THREE.Mesh(bezelGeom, bezelMat);
    bezel.position.set(0, 0, 0.3);
    this.clockGroup.add(bezel);

    // Feet (two angled pegs)
    const legMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8 });
    const legGeom = new THREE.CylinderGeometry(0.06, 0.06, 0.5, 12);
    const legL = new THREE.Mesh(legGeom, legMat);
    legL.position.set(-0.8, -1.2, 0);
    legL.rotation.z = Math.PI / 6;
    const legR = new THREE.Mesh(legGeom, legMat);
    legR.position.set(0.8, -1.2, 0);
    legR.rotation.z = -Math.PI / 6;
    this.clockGroup.add(legL, legR);

    // Twin Bells on top
    const bellGeom = new THREE.SphereGeometry(0.48, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const bellMat = new THREE.MeshStandardMaterial({
      color: 0xdddddd,
      metalness: 0.95,
      roughness: 0.1,
    });

    this.bellL = new THREE.Mesh(bellGeom, bellMat);
    this.bellL.rotation.z = Math.PI * 0.7;
    this.bellL.position.set(-0.85, 1.2, 0);

    this.bellR = new THREE.Mesh(bellGeom, bellMat);
    this.bellR.rotation.z = -Math.PI * 0.7;
    this.bellR.position.set(0.85, 1.2, 0);

    this.clockGroup.add(this.bellL, this.bellR);

    // Top Shut-off Button
    const btnGeom = new THREE.CylinderGeometry(0.22, 0.22, 0.25, 16);
    const btnMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.2,
    });
    this.topButton = new THREE.Mesh(btnGeom, btnMat);
    this.topButton.position.set(0, 1.32, 0);
    this.clockGroup.add(this.topButton);

    // Striker Hammer in between bells
    const hammerGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.35, 8);
    const hammerHeadGeom = new THREE.SphereGeometry(0.09, 8, 8);
    const hammerMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.9 });
    this.hammerMesh = new THREE.Mesh(hammerGeom, hammerMat);
    const hammerHead = new THREE.Mesh(hammerHeadGeom, hammerMat);
    hammerHead.position.set(0, 0.2, 0);
    this.hammerMesh.add(hammerHead);
    this.hammerMesh.position.set(0, 1.2, 0);
    this.clockGroup.add(this.hammerMesh);

    // Clock Face Dial (Canvas Texture)
    this.dialCanvas = document.createElement('canvas');
    this.dialCanvas.width = 512;
    this.dialCanvas.height = 512;
    this.drawClockDial();

    this.dialTexture = new THREE.CanvasTexture(this.dialCanvas);
    const dialGeom = new THREE.CircleGeometry(1.15, 32);
    const dialMat = new THREE.MeshBasicMaterial({ map: this.dialTexture });
    const dialMesh = new THREE.Mesh(dialGeom, dialMat);
    dialMesh.position.set(0, 0, 0.301);
    this.clockGroup.add(dialMesh);

    // Center pin
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16),
      new THREE.MeshBasicMaterial({ color: 0x111111 })
    );
    pin.rotation.x = Math.PI / 2;
    pin.position.set(0, 0, 0.33);
    this.clockGroup.add(pin);

    // Hands
    // Hour Hand pointing almost at 7 (6:59:50) -> ~210 degrees
    const hourGeom = new THREE.BoxGeometry(0.08, 0.6, 0.02);
    hourGeom.translate(0, 0.25, 0);
    const handMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    this.hourHand = new THREE.Mesh(hourGeom, handMat);
    this.hourHand.position.set(0, 0, 0.31);
    // 7 o'clock angle
    this.hourHand.rotation.z = -(7 / 12) * Math.PI * 2;
    this.clockGroup.add(this.hourHand);

    // Minute Hand pointing almost at 12 (59 minutes 50 sec)
    const minGeom = new THREE.BoxGeometry(0.06, 0.9, 0.02);
    minGeom.translate(0, 0.4, 0);
    this.minuteHand = new THREE.Mesh(minGeom, handMat);
    this.minuteHand.position.set(0, 0, 0.32);
    this.minuteHand.rotation.z = -(59.9 / 60) * Math.PI * 2;
    this.clockGroup.add(this.minuteHand);

    // Second Hand (Long Bright Red)
    const secGeom = new THREE.BoxGeometry(0.025, 1.05, 0.015);
    secGeom.translate(0, 0.42, 0);
    const secMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    this.secondHand = new THREE.Mesh(secGeom, secMat);
    this.secondHand.position.set(0, 0, 0.33);
    this.clockGroup.add(this.secondHand);

    this.stageGroup.add(this.clockGroup);
    this.updateHands();
  }

  private drawClockDial() {
    const ctx = this.dialCanvas.getContext('2d')!;
    const w = this.dialCanvas.width;
    const h = this.dialCanvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = w / 2 - 20;

    // Face background
    ctx.fillStyle = '#fbfbfb';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Red Danger Sector: from 10 o'clock (50s) to 12 o'clock (60s)
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    // 50 seconds angle = (50/60)*2PI - PI/2
    const startAngle = (50 / 60) * Math.PI * 2 - Math.PI / 2;
    const endAngle = (60 / 60) * Math.PI * 2 - Math.PI / 2;
    ctx.arc(cx, cy, r - 5, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 30, 30, 0.28)';
    ctx.fill();

    // Red arc border
    ctx.beginPath();
    ctx.arc(cx, cy, r - 5, startAngle, endAngle);
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#ff1a1a';
    ctx.stroke();

    // Outer border ring
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Target text in center top
    ctx.fillStyle = '#ff1a1a';
    ctx.font = 'bold 28px Impact, Arial Black, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('鳴動 07:00:00', cx, cy - 80);

    // Hour marks & Numbers
    for (let i = 1; i <= 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const nx = cx + Math.cos(angle) * (r - 60);
      const ny = cy + Math.sin(angle) * (r - 60);

      ctx.font = 'bold 44px Impact, Arial Black, sans-serif';
      ctx.fillStyle = (i >= 10 || i === 12) ? '#d90429' : '#111111';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(i.toString(), nx, ny);

      // Tick marks
      const tx1 = cx + Math.cos(angle) * (r - 20);
      const ty1 = cy + Math.sin(angle) * (r - 20);
      const tx2 = cx + Math.cos(angle) * (r - 5);
      const ty2 = cy + Math.sin(angle) * (r - 5);
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.lineWidth = (i >= 10 || i === 12) ? 10 : 8;
      ctx.strokeStyle = (i >= 10 || i === 12) ? '#ff1a1a' : '#111111';
      ctx.stroke();
    }

    // Minor minute tick marks
    for (let m = 0; m < 60; m++) {
      if (m % 5 === 0) continue;
      const angle = (m / 60) * Math.PI * 2 - Math.PI / 2;
      const tx1 = cx + Math.cos(angle) * (r - 12);
      const ty1 = cy + Math.sin(angle) * (r - 12);
      const tx2 = cx + Math.cos(angle) * (r - 5);
      const ty2 = cy + Math.sin(angle) * (r - 5);
      ctx.beginPath();
      ctx.moveTo(tx1, ty1);
      ctx.lineTo(tx2, ty2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = (m >= 50) ? '#ff4444' : '#555555';
      ctx.stroke();
    }
  }

  start() {
    this.active = true;
  }

  private updateHands() {
    // Current virtual time: starts at 50 seconds, reaches 60.00 seconds (07:00:00)
    const currentSecond = 50.0 + this.virtualSeconds;
    // Rotation for second hand (0 to 60 corresponds to full 360 deg)
    const secAngle = -(currentSecond / 60.0) * Math.PI * 2;
    this.secondHand.rotation.z = secAngle;

    // Minute hand creeps towards 12
    const minRatio = (59.0 + currentSecond / 60.0) / 60.0;
    this.minuteHand.rotation.z = -minRatio * Math.PI * 2;
  }

  update(dt: number, input: InputManager): StageResult | null {
    if (!this.active) return null;

    if (!this.stopped && !this.alarmed) {
      const prevInt = Math.floor(this.virtualSeconds);
      // Advance virtual time (10 virtual seconds over ~4.5 real seconds)
      this.virtualSeconds += dt * this.timeRate;
      const newInt = Math.floor(this.virtualSeconds);

      // Play tick sound every virtual second — pitch escalates in danger zone
      if (newInt > prevInt) {
        const dangerLevel = this.virtualSeconds / this.maxVirtualSeconds;
        const tickPitch = dangerLevel > 0.8
          ? 1200 + (dangerLevel - 0.8) * 4000  // pitch rises sharply at 80%+
          : 1200;
        sound.playTick(tickPitch);
      }

      // Clock face wobbles as second hand enters the red zone (8.0s+ = 80%)
      if (this.virtualSeconds > 8.0) {
        const wobble = (this.virtualSeconds - 8.0) / 2.0;
        this.clockGroup.position.x = Math.sin(Date.now() * 0.025) * wobble * 0.06;
        this.clockGroup.rotation.z = Math.sin(Date.now() * 0.018) * wobble * 0.03;
      } else {
        this.clockGroup.position.x = 0;
        this.clockGroup.rotation.z = 0;
      }

      this.updateHands();

      // Check Button 0 (Enter) or any tap to stop!
      if (input.wasButton0Pressed() || input.wasLeverDownPressed() || input.wasLeverUpPressed()) {
        this.stopped = true;
        sound.playClick(1500);

        // Slam down top button
        this.topButton.position.y = 1.22;

        const remainingMs = this.maxVirtualSeconds - this.virtualSeconds;

        if (remainingMs > 0) {
          // Success! Stopped before 07:00:00
          // The closer remainingMs is to 0, the higher the score
          // E.g. If stopped at 9.92 (0.08s before 10), score ratio is 9.92 / 10 = 99.2%
          const scorePercent = Number(((this.virtualSeconds / this.maxVirtualSeconds) * 100).toFixed(1));

          if (scorePercent >= 40) {
            sound.playSuccessChime(scorePercent);
            return {
              completed: true,
              success: true,
              scorePercent,
              judgmentText: '成功',
            };
          } else {
            sound.playFailBuzzer();
            return {
              completed: true,
              success: false,
              scorePercent,
              judgmentText: '大惨事',
            };
          }
        }
      }

      // Check Alarmed condition: 07:00:00 reached!
      if (this.virtualSeconds >= this.maxVirtualSeconds) {
        this.alarmed = true;
        this.triggerFailureEffects();
        return {
          completed: true,
          success: false,
          scorePercent: 0,
          judgmentText: '大惨事',
        };
      }
    }

    // Animate ringing hammer if alarmed
    if (this.alarmed) {
      this.hammerAnim += dt * 50;
      this.hammerMesh.rotation.z = Math.sin(this.hammerAnim) * 0.45;
      this.clockGroup.position.x = (Math.random() - 0.5) * 0.08;
      this.clockGroup.position.y = 1.2 + (Math.random() - 0.5) * 0.08;
      sound.playBellRing();
    }

    return null;
  }

  triggerFailureEffects() {
    sound.playBellRing();
    sound.playFailBuzzer();
    this.effects.addTrauma(0.9);
    // Sparks around the bells
    this.effects.spawnSparks(new THREE.Vector3(-0.85, 2.4, 0), 10);
    this.effects.spawnSparks(new THREE.Vector3(0.85, 2.4, 0), 10);
  }

  getLimitValue(): number {
    return Math.min(100, Math.max(0, (this.virtualSeconds / this.maxVirtualSeconds) * 100));
  }

  getRemainingTime(): number {
    const realTimeLeft = Math.max(0, (this.maxVirtualSeconds - this.virtualSeconds) / this.timeRate);
    return realTimeLeft;
  }

  cleanup(scene: THREE.Scene) {
    this.dialTexture.dispose();
    scene.remove(this.stageGroup);
  }
}
