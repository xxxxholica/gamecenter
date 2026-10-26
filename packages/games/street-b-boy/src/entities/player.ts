import * as THREE from 'three';
import { InputState } from '../engine/input';
import { TextureGenerator } from '../world/textures';

export interface BoundingBox2D {
  x: number;
  y: number;
  w: number;
  h: number;
}

export class Player {
  public mesh: THREE.Group;
  public isGrinding: boolean = false;

  // Hierarchical Body Parts for Animation
  private hipGroup: THREE.Group;
  private torso: THREE.Mesh;
  private headGroup: THREE.Group;
  private headMesh: THREE.Mesh;
  private hatMesh: THREE.Mesh;
  private hatRimMesh: THREE.Mesh;
  private leftArm: THREE.Group;
  private rightArm: THREE.Group;
  private leftLeg: THREE.Group;
  private rightLeg: THREE.Group;
  private originalMaterials: THREE.Material[] = [];

  // Physics State
  public x: number = 0;
  public y: number = 0;
  public prevX: number = 0;
  public prevY: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public isGrounded: boolean = false;
  public isFacingRight: boolean = true;
  public isCrouching: boolean = false;

  // Dimensions
  public readonly width: number = 0.8;
  public height: number = 1.7;

  // Jump Parameters
  private coyoteTimer: number = 0;
  private jumpBufferTimer: number = 0;
  private readonly gravity: number = 30;
  private readonly jumpForce: number = 15.5;
  private readonly moveSpeed: number = 9.8;
  private readonly accel: number = 46;
  private readonly friction: number = 30;

  // Actions & States
  public isSpinning: boolean = false;
  public spinTimer: number = 0;
  public spinCooldown: number = 0;
  public isInvincible: boolean = false;
  public invincibilityTimer: number = 0;
  public isDead: boolean = false;
  public isVictory: boolean = false;
  public deathTimer: number = 0;
  public spawnShieldTimer: number = 0;
  /** 落下速度の上限(m/s)。縦穴の中では小さくして、ゆっくり舞い降りる */
  public fallSpeedLimit: number = 24;

  // Animation Timer
  private animTimer: number = 0;

  constructor() {
    this.mesh = new THREE.Group();
    this.mesh.castShadow = true;

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0a97c, roughness: 0.5 }); // Warm skin tone
    const hatMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, roughness: 0.6 }); // VIVID RED BEANIE
    const hatRimMat = new THREE.MeshStandardMaterial({ color: 0xcc1111, roughness: 0.7 });
    const hoodieMat = new THREE.MeshStandardMaterial({ color: 0x182030, roughness: 0.8 }); // Dark baggy hoodie
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x2e3540, roughness: 0.8 }); // Baggy street pants
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }); // White sneakers
    const headphoneMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.2, metalness: 0.5 }); // Neon cyan headphones

    // 1. Hips (Center of root transformation)
    this.hipGroup = new THREE.Group();
    this.mesh.add(this.hipGroup);

    // 2. Torso (Baggy Hoodie)
    const torsoGeo = new THREE.BoxGeometry(0.72, 0.7, 0.48);
    this.torso = new THREE.Mesh(torsoGeo, hoodieMat);
    this.torso.position.y = 0.85;
    this.hipGroup.add(this.torso);

    // Hoodie pocket front
    const pocketGeo = new THREE.BoxGeometry(0.5, 0.22, 0.08);
    const pocket = new THREE.Mesh(pocketGeo, hoodieMat);
    pocket.position.set(0, -0.15, 0.22);
    this.torso.add(pocket);

    // Hoodie back graffiti logo
    const backLogoGeo = new THREE.PlaneGeometry(0.52, 0.52);
    const backLogoMat = new THREE.MeshStandardMaterial({
      map: TextureGenerator.getHoodieBackTexture(),
      roughness: 0.75
    });
    const backLogo = new THREE.Mesh(backLogoGeo, backLogoMat);
    backLogo.rotation.y = Math.PI;
    backLogo.position.set(0, 0, -0.245);
    this.torso.add(backLogo);

    // 3D Hood folded behind neck
    const hoodFoldGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.16, 12);
    const hoodFold = new THREE.Mesh(hoodFoldGeo, hoodieMat);
    hoodFold.rotation.x = 0.55;
    hoodFold.position.set(0, 0.35, -0.2);
    this.torso.add(hoodFold);

    // 3. Head & Vivid Red Knit Hat (Beanie)
    this.headGroup = new THREE.Group();
    this.headGroup.position.set(0, 1.35, 0);
    this.hipGroup.add(this.headGroup);

    // Skin Head
    const headGeo = new THREE.SphereGeometry(0.26, 16, 16);
    this.headMesh = new THREE.Mesh(headGeo, skinMat);
    this.headGroup.add(this.headMesh);

    // Red Knit Hat (Beanie main body)
    const hatGeo = new THREE.CylinderGeometry(0.24, 0.29, 0.32, 16);
    this.hatMesh = new THREE.Mesh(hatGeo, hatMat);
    this.hatMesh.position.set(0, 0.16, -0.04);
    this.hatMesh.rotation.x = -0.15; // Slouchy street tilt
    this.headGroup.add(this.hatMesh);

    // Red Knit Hat Cuff / Rim
    const hatRimGeo = new THREE.TorusGeometry(0.28, 0.06, 8, 24);
    this.hatRimMesh = new THREE.Mesh(hatRimGeo, hatRimMat);
    this.hatRimMesh.rotation.x = Math.PI / 2 - 0.15;
    this.hatRimMesh.position.set(0, 0.06, -0.02);
    this.headGroup.add(this.hatRimMesh);

    // Headphones around neck
    const hpRingGeo = new THREE.TorusGeometry(0.28, 0.04, 8, 20);
    const hpRing = new THREE.Mesh(hpRingGeo, hoodieMat);
    hpRing.rotation.x = Math.PI / 2;
    hpRing.position.set(0, -0.15, 0);
    this.headGroup.add(hpRing);

    const hpEarGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 16);
    const leftEar = new THREE.Mesh(hpEarGeo, headphoneMat);
    leftEar.rotation.z = Math.PI / 2;
    leftEar.position.set(-0.28, -0.14, 0);
    this.headGroup.add(leftEar);
    const rightEar = new THREE.Mesh(hpEarGeo, headphoneMat);
    rightEar.rotation.z = Math.PI / 2;
    rightEar.position.set(0.28, -0.14, 0);
    this.headGroup.add(rightEar);

    // 4. Arms
    // Left Arm
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.44, 1.15, 0);
    const sleeveGeo = new THREE.BoxGeometry(0.2, 0.5, 0.22);
    const leftSleeve = new THREE.Mesh(sleeveGeo, hoodieMat);
    leftSleeve.position.y = -0.22;
    const handGeo = new THREE.SphereGeometry(0.09, 8, 8);
    const leftHand = new THREE.Mesh(handGeo, skinMat);
    leftHand.position.y = -0.48;
    this.leftArm.add(leftSleeve, leftHand);
    this.hipGroup.add(this.leftArm);

    // Right Arm
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.44, 1.15, 0);
    const rightSleeve = new THREE.Mesh(sleeveGeo, hoodieMat);
    rightSleeve.position.y = -0.22;
    const rightHand = new THREE.Mesh(handGeo, skinMat);
    rightHand.position.y = -0.48;
    this.rightArm.add(rightSleeve, rightHand);
    this.hipGroup.add(this.rightArm);

    // 5. Legs & Baggy Pants + White Sneakers
    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.2, 0.6, 0);
    const legGeo = new THREE.BoxGeometry(0.26, 0.45, 0.3);
    const leftPant = new THREE.Mesh(legGeo, pantsMat);
    leftPant.position.y = -0.2;
    // Sneaker Materials
    const gumSoleMat = new THREE.MeshStandardMaterial({ color: 0xb57833, roughness: 0.6 }); // Classic gum sole
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff }); // Neon cyan accent stripe

    // Sneaker Left
    const shoeGeo = new THREE.BoxGeometry(0.24, 0.18, 0.4);
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.42, 0.06);

    const soleGeo = new THREE.BoxGeometry(0.26, 0.08, 0.42);
    const leftSole = new THREE.Mesh(soleGeo, gumSoleMat);
    leftSole.position.set(0, -0.5, 0.06);

    const stripeGeo = new THREE.BoxGeometry(0.25, 0.04, 0.22);
    const leftStripe = new THREE.Mesh(stripeGeo, stripeMat);
    leftStripe.position.set(0, -0.42, 0.06);

    this.leftLeg.add(leftPant, leftShoe, leftSole, leftStripe);
    this.hipGroup.add(this.leftLeg);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.2, 0.6, 0);
    const rightPant = new THREE.Mesh(legGeo, pantsMat);
    rightPant.position.y = -0.2;

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.42, 0.06);

    const rightSole = new THREE.Mesh(soleGeo, gumSoleMat);
    rightSole.position.set(0, -0.5, 0.06);

    const rightStripe = new THREE.Mesh(stripeGeo, stripeMat);
    rightStripe.position.set(0, -0.42, 0.06);

    this.rightLeg.add(rightPant, rightShoe, rightSole, rightStripe);
    this.hipGroup.add(this.rightLeg);

    // Cache original materials for invincibility flash / glow
    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        this.originalMaterials.push((child as THREE.Mesh).material as THREE.Material);
      }
    });

    this.reset(0, 1);
  }

  public reset(x: number, y: number, giveShield: boolean = false): void {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.vx = 0;
    this.vy = 0;
    this.isGrounded = y === 0;
    this.isFacingRight = true;
    this.isCrouching = false;
    this.isSpinning = false;
    this.spinTimer = 0;
    this.spinCooldown = 0;
    this.isInvincible = false;
    this.invincibilityTimer = 0;
    this.isDead = false;
    this.isVictory = false;
    this.deathTimer = 0;
    this.animTimer = 0;
    this.spawnShieldTimer = giveShield ? 2.2 : 0;
    this.height = 1.7;
    this.mesh.visible = true;
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.position.set(x, y, 0);
    this.hipGroup.rotation.order = 'XYZ';
    this.hipGroup.position.set(0, 0, 0);
    this.hipGroup.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftLeg.rotation.set(0, 0, 0);
    this.rightLeg.rotation.set(0, 0, 0);
    this.headGroup.position.set(0, 1.35, 0);
    this.headGroup.rotation.set(0, 0, 0);
    this.demoPose = {};
    this.demoYaw = 0;
    this.demoSpinRate = 0;
    this.animatePlayer(0);
  }

  public triggerSpin(): boolean {
    if (this.isSpinning || this.spinCooldown > 0 || this.isDead || this.isVictory) return false;
    this.isSpinning = true;
    this.spinTimer = 0.38; // Spin attack duration
    this.spinCooldown = 0.85; // Total cooldown(連打で敵を片づけ続けられないよう、スピンの持続0.38秒より十分長くする)
    return true;
  }

  public triggerInvincibility(duration: number = 4): void {
    this.isInvincible = true;
    this.invincibilityTimer = duration;
  }

  public getAABB(): BoundingBox2D {
    const currentH = this.isCrouching ? 0.95 : this.height;
    return {
      x: this.x - this.width / 2,
      y: this.y,
      w: this.width,
      h: currentH
    };
  }

  public getAttackAABB(): BoundingBox2D | null {
    if (!this.isSpinning && !this.isInvincible) return null;
    const extra = this.isSpinning ? 0.6 : 0.2;
    return {
      x: this.x - (this.width / 2 + extra),
      y: this.y,
      w: this.width + extra * 2,
      h: this.height + 0.2
    };
  }

  public update(dt: number, input: InputState): { spawnedSmoke: boolean; jumped: boolean } {
    let spawnedSmoke = false;
    let jumped = false;

    this.animTimer += dt;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= this.gravity * 0.9 * dt;
      this.y += this.vy * dt;
      this.mesh.position.set(this.x, this.y, 0);
      this.mesh.rotation.z += 8 * dt;
      return { spawnedSmoke, jumped };
    }

    if (this.isVictory) {
      // One-hand freeze pose on top of turntable
      this.hipGroup.rotation.set(0, 0, -Math.PI * 0.7);
      this.hipGroup.position.set(0.1, 0.4, 0);
      this.leftArm.rotation.z = Math.PI * 0.45;
      this.rightArm.rotation.z = -Math.PI * 0.7;
      this.leftLeg.rotation.z = -Math.PI * 0.35;
      this.rightLeg.rotation.z = Math.PI * 0.5;
      this.mesh.position.set(this.x, this.y, 0);
      return { spawnedSmoke, jumped };
    }

    // Cooldowns
    if (this.spinCooldown > 0) this.spinCooldown -= dt;
    if (this.spinTimer > 0) {
      this.spinTimer -= dt;
      if (this.spinTimer <= 0) this.isSpinning = false;
    }

    // Invincibility timer
    if (this.isInvincible) {
      this.invincibilityTimer -= dt;
      if (this.invincibilityTimer <= 0) {
        this.isInvincible = false;
      }
    }

    // Spawn Shield Protection Timer (Blinks mesh to show invulnerability)
    if (this.spawnShieldTimer > 0) {
      this.spawnShieldTimer -= dt;
      this.mesh.visible = Math.floor(this.animTimer * 20) % 2 === 0;
      if (this.spawnShieldTimer <= 0) {
        this.mesh.visible = true;
      }
    } else if (!this.isDead) {
      this.mesh.visible = true;
    }

    // Movement multipliers (faster when invincible!)
    const currentSpeed = this.isInvincible ? this.moveSpeed * 1.35 : this.moveSpeed;

    // Crouch / Sliding
    if (input.down && this.isGrounded && !this.isSpinning) {
      this.isCrouching = true;
    } else {
      this.isCrouching = false;
    }

    // Left / Right movement
    let targetVx = 0;
    if (!this.isCrouching) {
      if (input.left) {
        targetVx = -currentSpeed;
        this.isFacingRight = false;
      } else if (input.right) {
        targetVx = currentSpeed;
        this.isFacingRight = true;
      }
    } else {
      // Sliding deceleration
      targetVx = this.vx * 0.96;
    }

    // Acceleration & Friction
    if (targetVx !== 0) {
      this.vx = THREE.MathUtils.damp(this.vx, targetVx, this.accel, dt);
    } else {
      this.vx = THREE.MathUtils.damp(this.vx, 0, this.friction, dt);
    }

    // Smoke check: high speed or turning
    if (this.isGrounded && Math.abs(this.vx) > currentSpeed * 0.8) {
      spawnedSmoke = Math.random() < 0.35;
    }

    // Coyote time & Jump buffer
    if (this.isGrounded) {
      this.coyoteTimer = 0.12;
    } else {
      this.coyoteTimer -= dt;
    }

    if (input.jumpPressed) {
      this.jumpBufferTimer = 0.12;
    } else {
      this.jumpBufferTimer -= dt;
    }

    // Execute Jump
    if (this.jumpBufferTimer > 0 && this.coyoteTimer > 0) {
      this.vy = this.jumpForce;
      this.isGrounded = false;
      this.coyoteTimer = 0;
      this.jumpBufferTimer = 0;
      jumped = true;
    }

    // Variable jump height: release jump button cuts upward velocity
    if (input.jumpReleased && this.vy > 4) {
      this.vy *= 0.45;
    }

    // Gravity
    this.vy -= this.gravity * dt;
    if (this.vy < -this.fallSpeedLimit) this.vy = -this.fallSpeedLimit; // Terminal fall velocity

    // Update position
    this.prevX = this.x;
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Update Mesh position and orientation: turn to a side profile while actually
    // travelling so the character reads as facing where it's going; settle back to
    // facing the camera once stopped.
    this.mesh.position.set(this.x, this.y, 0);
    const isMoving = Math.abs(this.vx) > 0.3;
    this.mesh.rotation.y = isMoving ? (this.isFacingRight ? Math.PI / 2 : -Math.PI / 2) : 0;

    // Handle Animations
    this.animatePlayer(dt);

    return { spawnedSmoke, jumped };
  }

  public bounceOnEnemy(): void {
    this.vy = this.jumpForce * 0.95;
    this.isGrounded = false;
  }

  private animatePlayer(dt: number): void {
    // 1. Breakdance Spin Attack (Windmill / Air Kick Spin)
    if (this.isSpinning) {
      const spinSpeed = 26; // High speed revolution
      this.hipGroup.rotation.y += spinSpeed * dt;
      if (this.isGrounded) {
        // Ground windmill tilt
        this.hipGroup.rotation.z = Math.sin(this.animTimer * 20) * 0.4;
        this.leftLeg.rotation.z = 1.2;
        this.rightLeg.rotation.z = -1.2;
        this.leftArm.rotation.z = 1.5;
        this.rightArm.rotation.z = -1.5;
      } else {
        // Air helicopter kick spin
        this.hipGroup.rotation.z = 0.2;
        this.leftLeg.rotation.x = 1.4;
        this.rightLeg.rotation.x = -1.4;
        this.leftArm.rotation.x = -1.2;
        this.rightArm.rotation.x = 1.2;
      }
      return;
    }

    // Reset rotation from spin
    this.hipGroup.rotation.y = 0;
    this.hipGroup.rotation.z = 0;

    // 2. Grinding Rail Pose
    if (this.isGrinding) {
      this.hipGroup.position.y = -0.15;
      this.torso.rotation.x = 0.35;
      this.headGroup.rotation.x = -0.2;
      this.leftArm.rotation.z = 1.2; // Arms out for balance
      this.rightArm.rotation.z = -1.2;
      this.leftLeg.rotation.x = 0.4;
      this.rightLeg.rotation.x = -0.6;
      return;
    }

    // 3. Sliding / Crouching
    if (this.isCrouching) {
      this.hipGroup.position.y = -0.35;
      this.headGroup.position.y = 1.05;
      this.headGroup.rotation.x = 0.3;
      this.torso.rotation.x = 0.5;
      this.leftLeg.rotation.x = -1.2;
      this.rightLeg.rotation.x = -1.1;
      this.leftArm.rotation.x = 0.8;
      this.rightArm.rotation.x = 0.8;
      return;
    } else {
      this.hipGroup.position.y = 0;
      this.torso.rotation.x = 0;
      this.headGroup.rotation.x = 0;
    }

    // 3. Air (Jump / Fall)
    if (!this.isGrounded) {
      if (this.vy > 0) {
        // Jumping up
        this.leftLeg.rotation.x = -0.6;
        this.rightLeg.rotation.x = 0.4;
        this.leftArm.rotation.x = 2.2; // Hands up in the air
        this.rightArm.rotation.x = 2.4;
        this.headGroup.rotation.x = -0.3;
      } else {
        // Falling down
        this.leftLeg.rotation.x = 0.3;
        this.rightLeg.rotation.x = 0.3;
        this.leftArm.rotation.x = 0.8;
        this.rightArm.rotation.x = 0.8;
        this.headGroup.rotation.x = 0.2;
      }
      return;
    }

    // 4. Running
    const speedRatio = Math.abs(this.vx) / this.moveSpeed;
    if (speedRatio > 0.1) {
      const runCycle = this.animTimer * 14 * speedRatio;
      this.leftLeg.rotation.x = Math.sin(runCycle) * 0.9;
      this.rightLeg.rotation.x = -Math.sin(runCycle) * 0.9;
      this.leftArm.rotation.x = -Math.sin(runCycle) * 1.1;
      this.rightArm.rotation.x = Math.sin(runCycle) * 1.1;

      // Torso forward lean and rhythmic bounce
      this.hipGroup.position.y = Math.abs(Math.sin(runCycle)) * 0.12;
      this.torso.rotation.z = Math.sin(runCycle * 0.5) * 0.08;
      this.headGroup.position.y = 1.35 + Math.abs(Math.sin(runCycle)) * 0.05;
      return;
    }

    // 5. Idle Rhythm Groove (Classic B-Boy Step & Head Bob)
    const groove = Math.sin(this.animTimer * 6.5);
    this.hipGroup.position.y = Math.max(0, groove * 0.08);
    this.headGroup.position.y = 1.35 + groove * 0.05;
    this.headGroup.rotation.x = groove * 0.15; // Head nodding to the beat
    this.leftArm.rotation.x = 0.2 + groove * 0.2;
    this.rightArm.rotation.x = 0.2 - groove * 0.2;
    this.leftLeg.rotation.x = 0;
    this.rightLeg.rotation.x = 0;
    this.torso.rotation.z = groove * 0.04;
  }

  /**
   * タイトル画面用: ブレイクダンスのルーティン
   * Toprock -> 6-Step (Downrock) -> Windmill -> Freeze
   *
   * - 回転の軸は足元ではなく骨盤(DEMO_PIVOT)。体が床にめり込んだり浮いたりしない
   * - 毎フレーム全身のバウンディングボックスから床に接地させる
   * - ポーズは指数スムージングで補間し、フェーズ切替でも瞬間移動しない
   */
  private demoPose: Record<string, number> = {};
  private demoYaw: number = 0;
  private demoSpinRate: number = 0;
  private static readonly DEMO_PIVOT = new THREE.Vector3(0, 0.6, 0);
  private static readonly DEMO_FLOOR = 0; // 靴底が地面(mesh原点)に接する高さ
  private static readonly DEMO_CYCLE = 8.4;

  public animateBreakdanceDemo(dt: number, totalTime: number): void {
    const t = totalTime % Player.DEMO_CYCLE;
    const osc: Record<string, number> = {};
    let target: Record<string, number>;
    let spinTarget = 0;
    let yawTarget = 0;
    let spinning = false;

    if (t < 2.2) {
      // Toprock: 立ち姿でリズムステップ
      const c = t * 7.0;
      const s = Math.sin(c);
      target = {
        rx: 0.05, rz: 0, tx: 0.1, tz: 0,
        lax: 0.2, laz: 0.5, rax: 0.2, raz: -0.5,
        llx: 0, llz: 0.12, rlx: 0, rlz: -0.12,
        hx: 0, hz: 0, dy: 0,
      };
      osc.rz = s * 0.08;
      osc.tz = -s * 0.12;
      osc.lax = s * 0.9;
      osc.rax = -s * 0.9;
      osc.laz = Math.cos(c) * 0.3;
      osc.raz = -Math.cos(c) * 0.3;
      osc.llx = s * 0.6;
      osc.rlx = -s * 0.6;
      osc.hx = Math.sin(c * 2) * 0.12;
      osc.dy = -0.05 + Math.abs(s) * 0.05;
      yawTarget = s * 0.25;
    } else if (t < 4.3) {
      // 6-Step: 両手を床につき足を回す
      const c = (t - 2.2) * 6.0;
      const s = Math.sin(c);
      target = {
        rx: 0.9, rz: 0, tx: 0.2, tz: 0,
        lax: -0.9, laz: 0.3, rax: -0.9, raz: -0.3,
        llx: -0.9, llz: 0.5, rlx: -0.9, rlz: -0.5,
        hx: -0.7, hz: 0, dy: 0,
      };
      osc.llx = s * 0.6;
      osc.rlx = -s * 0.6;
      osc.llz = Math.cos(c) * 0.2;
      osc.rlz = Math.cos(c) * 0.2;
      osc.rz = s * 0.1;
      yawTarget = Math.sin(c * 0.5) * 0.5;
    } else if (t < 6.1) {
      // Windmill: 背中で回る高速スピン
      spinning = true;
      spinTarget = 10;
      target = {
        rx: -1.45, rz: 0, tx: 0.1, tz: 0,
        lax: 0.3, laz: 0.9, rax: 0.3, raz: -0.9,
        llx: -0.1, llz: 1.0, rlx: -0.1, rlz: -1.0,
        hx: 0.5, hz: 0, dy: 0,
      };
      osc.rx = Math.sin(this.demoYaw * 2) * 0.08;
      osc.llx = Math.sin(this.demoYaw) * 0.25;
      osc.rlx = -Math.sin(this.demoYaw) * 0.25;
    } else {
      // Freeze: 片手で支えて静止、足はクロス
      const s = Math.sin(t * 5);
      target = {
        rx: 0.9, rz: -0.5, tx: 0.2, tz: 0.1,
        lax: -0.9, laz: 0.25, rax: 2.8, raz: -0.5,
        llx: -2.0, llz: 0.5, rlx: -1.4, rlz: -0.6,
        hx: -0.5, hz: 0.2, dy: 0,
      };
      yawTarget = 0.4;
      osc.rz = s * 0.02;
    }

    // ポーズをスムージング（初回フレームは初期ポーズを即座に適用し、フェーズ切替では瞬間移動しない）
    const p = this.demoPose;
    const isFirstPose = Object.keys(p).length === 0;
    const k = isFirstPose ? 1 : 1 - Math.exp(-dt * 12);
    for (const key in target) {
      p[key] = p[key] ?? target[key];
      p[key] += (target[key] - p[key]) * k;
    }
    const v = (key: string): number => p[key] + (osc[key] ?? 0);

    // 回転速度もなめらかに加減速
    this.demoSpinRate += (spinTarget - this.demoSpinRate) * (1 - Math.exp(-dt * 5));
    this.demoYaw += this.demoSpinRate * dt;
    if (!spinning) {
      // 回転が落ち着いたら目標の向きへ（最短方向で補間）
      const settle = 1 - Math.min(1, Math.abs(this.demoSpinRate) / 3);
      let diff = (yawTarget - this.demoYaw) % (Math.PI * 2);
      if (diff > Math.PI) diff -= Math.PI * 2;
      if (diff < -Math.PI) diff += Math.PI * 2;
      this.demoYaw += diff * k * settle;
    }

    this.hipGroup.rotation.order = 'YXZ';
    this.hipGroup.rotation.set(v('rx'), this.demoYaw, v('rz'));
    this.torso.rotation.set(v('tx'), 0, v('tz'));
    this.leftArm.rotation.set(v('lax'), 0, v('laz'));
    this.rightArm.rotation.set(v('rax'), 0, v('raz'));
    this.leftLeg.rotation.set(v('llx'), 0, v('llz'));
    this.rightLeg.rotation.set(v('rlx'), 0, v('rlz'));
    this.headGroup.position.set(0, 1.35, 0);
    this.headGroup.rotation.set(v('hx'), 0, v('hz'));
    this.mesh.rotation.y = 0;

    // 骨盤を軸に回転させる: position = pivot - R * pivot
    const pivot = Player.DEMO_PIVOT;
    const offset = pivot.clone().sub(pivot.clone().applyEuler(this.hipGroup.rotation));
    this.hipGroup.position.set(offset.x, offset.y, offset.z);

    // 全身が床(DEMO_FLOOR)にちょうど接するよう高さを補正
    this.mesh.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.mesh, true);
    const lowest = box.min.y - this.mesh.position.y;
    this.hipGroup.position.y += Player.DEMO_FLOOR - lowest + (osc.dy ?? 0);
  }

  public animateGoldGlow(time: number): void {
    if (!this.isInvincible) return;
    const flash = Math.sin(time * 24) > 0;
    const goldColor = flash ? 0xffea00 : 0xffffff;

    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material;
        if (mat && 'emissive' in mat) {
          (mat as THREE.MeshStandardMaterial).emissive.setHex(goldColor);
          (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0.8;
        }
      }
    });
  }

  public resetMaterials(): void {
    this.mesh.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mat = (child as THREE.Mesh).material;
        if (mat && 'emissive' in mat) {
          (mat as THREE.MeshStandardMaterial).emissive.setHex(0x000000);
          (mat as THREE.MeshStandardMaterial).emissiveIntensity = 0;
        }
      }
    });
  }
}
