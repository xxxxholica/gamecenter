import * as THREE from 'three';
import { Stage, StageResult, StageBriefing } from '../types';
import { InputManager } from '../input';
import { EffectsManager } from '../effects';
import { sound } from '../audio';

export class Stage3Phone implements Stage {
  id = 2;
  numberText = 'STAGE 2';
  title = 'スマホ充電';
  mission = '残量0.000%ブラックアウト直前に挿入せよ！';
  instruction = 'レバー上でケーブルを挿す';
  briefing: StageBriefing = {
    headline: 'スマホに充電ケーブルを挿す',
    ok: '0%になる直前にケーブルを挿す',
    ng: '0%で電源が落ちる・早すぎ',
  };
  limitLabel = 'バッテリー消費';

  private scene!: THREE.Scene;
  private effects!: EffectsManager;
  private stageGroup = new THREE.Group();

  // Timing
  // 電池が尽きるまでの秒数。毎回 4.5〜5.5秒 の間で変わる
  private readonly totalTime = 4.5 + Math.random();
  private timeLeft = this.totalTime;
  private pluggedIn = false;
  private isDead = false;
  private active = false;

  // Meshes
  private phoneGroup = new THREE.Group();
  private screenTexture!: THREE.CanvasTexture;
  private screenCanvas!: HTMLCanvasElement;
  private screenCtx!: CanvasRenderingContext2D;
  private screenMat!: THREE.MeshBasicMaterial;

  private cableGroup = new THREE.Group();
  private cableTip!: THREE.Mesh;
  private cableZ = 2.4; // initial unplugged position
  private targetCableZ = 2.4;
  private readonly pluggedZ = 1.35;

  // Battery percent remaining at the exact moment the cable was plugged in
  private insertedPercent = 0;

  constructor(effects: EffectsManager) {
    this.effects = effects;
  }

  init(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    // Closer camera: angled to clearly focus on the phone screen countdown and the charging port
    this.effects.setCameraBase(
      new THREE.Vector3(0, 1.4, 2.9),
      new THREE.Vector3(0, 0.7, 0)
    );

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.85);
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(2, 6, 4);
    this.stageGroup.add(amb, dir);

    // Desk surface
    const deskGeom = new THREE.BoxGeometry(7, 0.5, 6);
    const deskMat = new THREE.MeshStandardMaterial({
      color: 0x22201e,
      roughness: 0.5,
    });
    const desk = new THREE.Mesh(deskGeom, deskMat);
    desk.position.set(0, -0.25, 0);
    this.stageGroup.add(desk);

    // Build Smartphone (sleek metallic body)
    this.phoneGroup = new THREE.Group();
    this.phoneGroup.position.set(0, 0.8, 0);
    this.phoneGroup.rotation.x = -Math.PI * 0.18; // tilted up toward camera

    // Phone body chassis
    const bodyGeom = new THREE.BoxGeometry(1.6, 2.8, 0.14);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x18181c,
      metalness: 0.9,
      roughness: 0.2,
    });
    const phoneBody = new THREE.Mesh(bodyGeom, bodyMat);
    this.phoneGroup.add(phoneBody);

    // Chrome chamfer bevel around phone rim
    const rimGeom = new THREE.BoxGeometry(1.64, 2.84, 0.02);
    const rimMat = new THREE.MeshStandardMaterial({
      color: 0x888899,
      metalness: 0.95,
      roughness: 0.1,
    });
    const rim = new THREE.Mesh(rimGeom, rimMat);
    rim.position.set(0, 0, 0.06);
    this.phoneGroup.add(rim);

    // USB-C Charging Port (recessed slot at bottom edge)
    const portGeom = new THREE.BoxGeometry(0.32, 0.08, 0.2);
    const portMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
    const port = new THREE.Mesh(portGeom, portMat);
    port.position.set(0, -1.41, 0);
    this.phoneGroup.add(port);

    // Yellow hazard outline around charging port for instant visibility
    const portGuideGeom = new THREE.RingGeometry(0.18, 0.22, 16);
    const portGuideMat = new THREE.MeshBasicMaterial({
      color: 0xffea00,
      side: THREE.DoubleSide,
    });
    const portGuide = new THREE.Mesh(portGuideGeom, portGuideMat);
    portGuide.rotation.x = Math.PI / 2;
    portGuide.position.set(0, -1.41, 0);
    this.phoneGroup.add(portGuide);

    // Screen Canvas Texture for real-time high-contrast display
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 512;
    this.screenCanvas.height = 900;
    this.screenCtx = this.screenCanvas.getContext('2d')!;

    this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTexture.generateMipmaps = true;

    this.screenMat = new THREE.MeshBasicMaterial({
      map: this.screenTexture,
      toneMapped: false,
    });
    const screenGeom = new THREE.PlaneGeometry(1.48, 2.65);
    const screenMesh = new THREE.Mesh(screenGeom, this.screenMat);
    screenMesh.position.set(0, 0, 0.085);
    this.phoneGroup.add(screenMesh);

    this.stageGroup.add(this.phoneGroup);

    // Build Charging Cable
    this.cableGroup = new THREE.Group();
    this.cableGroup.rotation.x = -Math.PI * 0.18; // match phone angle

    // Metallic USB-C Tip
    const tipGeom = new THREE.BoxGeometry(0.24, 0.05, 0.35);
    const tipMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.95,
      roughness: 0.1,
    });
    this.cableTip = new THREE.Mesh(tipGeom, tipMat);
    this.cableTip.position.set(0, -1.4, -0.15);
    this.cableGroup.add(this.cableTip);

    // Plastic plug head
    const headGeom = new THREE.BoxGeometry(0.32, 0.14, 0.6);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.1,
    });
    const headMesh = new THREE.Mesh(headGeom, headMat);
    headMesh.position.set(0, -1.4, 0.3);
    this.cableGroup.add(headMesh);

    // Cable cord
    const cordGeom = new THREE.CylinderGeometry(0.06, 0.06, 1.8, 16);
    const cordMat = new THREE.MeshStandardMaterial({ color: 0xdddddd });
    const cordMesh = new THREE.Mesh(cordGeom, cordMat);
    cordMesh.rotation.x = Math.PI / 2;
    cordMesh.position.set(0, -1.4, 1.4);
    this.cableGroup.add(cordMesh);

    this.stageGroup.add(this.cableGroup);
    this.updateCablePosition();
    this.drawScreen(1.0, false);
  }

  start() {
    this.active = true;
  }

  private updateCablePosition() {
    this.cableGroup.position.set(0, 0.8, this.cableZ);
  }

  private drawScreen(brightness: number, charging: boolean) {
    const ctx = this.screenCtx;
    const w = this.screenCanvas.width;
    const h = this.screenCanvas.height;

    // Background
    ctx.fillStyle = '#060608';
    ctx.fillRect(0, 0, w, h);

    if (brightness <= 0.01) {
      this.screenTexture.needsUpdate = true;
      return;
    }

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, brightness));

    // Wallpaper subtle glow
    const grad = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * 0.8);
    grad.addColorStop(0, charging ? '#004411' : '#330808');
    grad.addColorStop(1, '#050508');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const batteryRatio = Math.max(0, this.timeLeft / this.totalTime);
    const batteryPercent = batteryRatio * 1.0; // 1.000% down to 0.000%

    // Status bar at top
    ctx.font = 'bold 36px Impact, Arial Black, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('12:45', 40, 60);

    // Battery outline
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.strokeRect(w - 140, 32, 90, 32);
    ctx.fillRect(w - 48, 42, 6, 12); // battery knob

    if (charging) {
      // 100% Green charging bar
      ctx.fillStyle = '#00ff66';
      ctx.fillRect(w - 136, 36, 82, 24);
      ctx.font = 'bold 32px Impact, sans-serif';
      ctx.fillText('⚡', w - 185, 60);
    } else {
      // Red blinking bar
      const blink = Math.floor(Date.now() / 150) % 2 === 0;
      if (blink || batteryPercent > 0.05) {
        ctx.fillStyle = '#ff1a1a';
        ctx.fillRect(w - 136, 36, Math.max(4, 82 * batteryRatio), 24);
      }
      ctx.font = 'bold 22px Impact, sans-serif';
      ctx.fillStyle = '#ff1a1a';
      ctx.fillText(`${batteryPercent.toFixed(2)}%`, w - 215, 58);
    }

    // Huge center battery alert
    if (charging) {
      ctx.fillStyle = '#00ff66';
      ctx.font = 'bold 64px Impact, Arial Black, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('充電成功', w / 2, h / 2 - 60);

      // Show the exact battery % locked in at the moment of insertion
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px Impact, sans-serif';
      ctx.fillText('挿入時の残量', w / 2, h / 2 + 20);
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 76px Impact, Arial Black, sans-serif';
      ctx.fillText(`${this.insertedPercent.toFixed(3)}%`, w / 2, h / 2 + 100);
    } else {
      ctx.fillStyle = '#ff1a1a';
      ctx.font = 'bold 50px Impact, Arial Black, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('極限残量', w / 2, h / 2 - 90);

      // Giant countdown in percentage with 3 decimal places (e.g. 0.012%)
      const pctText = `${batteryPercent.toFixed(3)}%`;
      ctx.fillStyle = '#ffe600';
      ctx.font = 'bold 82px Impact, Arial Black, sans-serif';
      ctx.fillText(pctText, w / 2, h / 2 + 10);
    }

    ctx.restore();
    this.screenTexture.needsUpdate = true;
  }

  update(dt: number, input: InputManager): StageResult | null {
    if (!this.active) return null;

    if (!this.pluggedIn && !this.isDead) {
      this.timeLeft -= dt;

      // Screen brightness dims towards 0
      const brightness = Math.max(0, this.timeLeft / this.totalTime);
      this.drawScreen(brightness, false);

      // Escalating warning: phone trembles and screen re-draws get frantic
      if (this.timeLeft < 1.5) {
        // Critical — rapid staccato ticks + aggressive phone shake
        if (Math.floor(this.timeLeft * 6) !== Math.floor((this.timeLeft + dt) * 6)) {
          sound.playTick(550 + Math.random() * 200);
        }
        const shake = (1.5 - this.timeLeft) / 1.5;
        this.phoneGroup.position.x = (Math.random() - 0.5) * shake * 0.1;
        this.phoneGroup.position.y = 0.8 + (Math.random() - 0.5) * shake * 0.05;
      } else if (this.timeLeft < 3.0) {
        if (Math.floor(this.timeLeft * 3) !== Math.floor((this.timeLeft + dt) * 3)) {
          sound.playTick(380);
        }
        this.phoneGroup.position.x = Math.sin(Date.now() * 0.02) * 0.018;
      } else {
        this.phoneGroup.position.x = 0;
      }

      // Check lever forward or Enter (push cable)
      if (input.isLeverUp() || input.wasLeverUpPressed() || input.wasButton0Pressed()) {
        // Slam cable into port!
        this.targetCableZ = this.pluggedZ;
      }

      // Smooth fast cable motion
      if (this.cableZ > this.targetCableZ) {
        this.cableZ = Math.max(this.targetCableZ, this.cableZ - dt * 14.0);
        this.updateCablePosition();

        if (this.cableZ <= this.pluggedZ + 0.05) {
          // Plugged in! Lock in the exact battery % at this instant.
          this.pluggedIn = true;
          this.insertedPercent = Math.max(0, (this.timeLeft / this.totalTime) * 1.0);
          sound.playClick(1400);

          if (this.timeLeft > 0.02) {
            // Success! Plugged before blackout
            const scoreRatio = (this.totalTime - this.timeLeft) / this.totalTime;
            const scorePercent = Number((scoreRatio * 100).toFixed(1));

            this.drawScreen(1.0, true);
            this.effects.spawnSparks(new THREE.Vector3(0, -0.6, 1.2), 15);

            if (scorePercent >= 30) {
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
          } else {
            // Plugged AFTER blackout
            this.isDead = true;
            this.triggerFailureEffects();
            return {
              completed: true,
              success: false,
              scorePercent: 0,
              judgmentText: '大惨事',
            };
          }
        }
      }

      // Blackout check
      if (this.timeLeft <= 0) {
        this.isDead = true;
        this.drawScreen(0, false);
        this.triggerFailureEffects();
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
    this.effects.addTrauma(0.7);
    this.drawScreen(0, false);
  }

  getLimitValue(): number {
    const elapsed = this.totalTime - this.timeLeft;
    return Math.min(100, Math.max(0, (elapsed / this.totalTime) * 100));
  }

  getRemainingTime(): number {
    return Math.max(0, this.timeLeft);
  }

  getSubInfo(): string | null {
    if (this.pluggedIn) return `挿入時 ${this.insertedPercent.toFixed(3)}%`;
    const pct = Math.max(0, (this.timeLeft / this.totalTime) * 1.0);
    return `極限残量 ${pct.toFixed(3)}%`;
  }

  cleanup(scene: THREE.Scene) {
    this.screenTexture.dispose();
    scene.remove(this.stageGroup);
  }
}
