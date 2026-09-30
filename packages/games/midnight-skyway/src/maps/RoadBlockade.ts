import * as THREE from 'three';

export interface BlockadeSpec {
  /** Position at the center of the road to block */
  position: THREE.Vector3;
  /** Direction the road is heading (forward vector) */
  direction: THREE.Vector3;
  /** Road width to span */
  width: number;
  /** Arrow guidance direction: 'left' | 'right' */
  arrowDir: 'left' | 'right';
  /** Text on sign: e.g. "通行止" */
  text?: string;
}

export interface CollisionResult {
  hit: boolean;
  pushX: number;
  pushZ: number;
  impact: number;
}

/**
 * Wangan Midnight MAXIMUM TUNE style route blockade:
 * - High-intensity flashing LED chevron arrow boards (<<< or >>>)
 * - Yellow & black diagonal hazard-striped barricades with "通行止 / STOP"
 * - Cushion drums (orange with reflective white stripes)
 * - Heavy physical collision barrier to enforce the mandatory route
 */
export class RoadBlockade {
  public readonly group = new THREE.Group();
  private animatedMaterials: { mat: THREE.MeshBasicMaterial; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; arrowDir: 'left' | 'right'; step: number; timer: number }[] = [];
  private colliders: {
    cx: number;
    cz: number;
    nx: number;
    nz: number;
    halfWidth: number;
    halfDepth: number;
  }[] = [];

  constructor() {
    this.group.name = 'road_blockades';
  }

  /**
   * Adds a Wangan-style blockade across a road branch.
   */
  public addBlockade(spec: BlockadeSpec): void {
    const { position, direction, width, arrowDir, text = '通行止' } = spec;
    const forward = direction.clone().normalize();
    const yaw = Math.atan2(forward.x, forward.z);

    const blockadeGroup = new THREE.Group();
    blockadeGroup.position.copy(position);
    blockadeGroup.rotation.y = yaw;

    // 1. Hazard Stripe Barricades (Multiple across road width)
    const barrierWidth = 2.4;
    const count = Math.ceil(width / barrierWidth);
    const spacing = width / count;

    const barrierTex = this.createHazardBarricadeTexture(text);
    const barrierMat = new THREE.MeshStandardMaterial({
      map: barrierTex,
      roughness: 0.6,
      metalness: 0.1,
      side: THREE.DoubleSide,
    });

    const postMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 });
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    for (let i = 0; i < count; i++) {
      const offsetX = (i - (count - 1) / 2) * spacing;

      // Board
      const boardGeo = new THREE.BoxGeometry(barrierWidth * 0.95, 0.8, 0.06);
      const board = new THREE.Mesh(boardGeo, barrierMat);
      board.position.set(offsetX, 0.65, 0);
      board.castShadow = true;
      blockadeGroup.add(board);

      // Support legs (A-frame)
      const legGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.2);
      const legL1 = new THREE.Mesh(legGeo, postMat);
      legL1.position.set(offsetX - barrierWidth * 0.42, 0.55, -0.2);
      legL1.rotation.x = 0.25;
      blockadeGroup.add(legL1);

      const legL2 = new THREE.Mesh(legGeo, postMat);
      legL2.position.set(offsetX - barrierWidth * 0.42, 0.55, 0.2);
      legL2.rotation.x = -0.25;
      blockadeGroup.add(legL2);

      const legR1 = new THREE.Mesh(legGeo, postMat);
      legR1.position.set(offsetX + barrierWidth * 0.42, 0.55, -0.2);
      legR1.rotation.x = 0.25;
      blockadeGroup.add(legR1);

      const legR2 = new THREE.Mesh(legGeo, postMat);
      legR2.position.set(offsetX + barrierWidth * 0.42, 0.55, 0.2);
      legR2.rotation.x = -0.25;
      blockadeGroup.add(legR2);

      // Flashing top hazard light
      const lampGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.16, 12);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(offsetX, 1.15, 0);
      blockadeGroup.add(lamp);
    }

    // 2. High-intensity LED Chevron Arrow Boards (Large overhead / standing sign)
    const ledCount = Math.max(1, Math.floor(width / 4.0));
    for (let k = 0; k < ledCount; k++) {
      const ledX = (k - (ledCount - 1) / 2) * 3.6;
      const { mesh, anim } = this.createLEDArrowBoard(arrowDir);
      mesh.position.set(ledX, 1.8, 0);
      blockadeGroup.add(mesh);
      this.animatedMaterials.push(anim);
    }

    // 3. Cushion Drums (Impact Barrels) placed staggered in front of barricade
    const drumCount = Math.ceil(width / 1.5) + 1;
    const drumMat = new THREE.MeshStandardMaterial({
      map: this.createCushionDrumTexture(),
      roughness: 0.5,
      metalness: 0.1,
    });
    const drumCapMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const drumGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.95, 20);
    const drumCapGeo = new THREE.CylinderGeometry(0.39, 0.39, 0.06, 20);

    for (let i = 0; i < drumCount; i++) {
      const offsetX = (i - (drumCount - 1) / 2) * 1.4;
      // Stagger slightly forward/backward (-1.2m to -1.8m in front of barricade)
      const offsetZ = -1.3 - (i % 2) * 0.5;

      const drum = new THREE.Mesh(drumGeo, drumMat);
      drum.position.set(offsetX, 0.48, offsetZ);
      drum.castShadow = true;

      const cap = new THREE.Mesh(drumCapGeo, drumCapMat);
      cap.position.set(0, 0.48, 0);
      drum.add(cap);

      blockadeGroup.add(drum);
    }

    // 4. Large Overhead Gantry with "通行止 / CLOSED" warning (Wangan Midnight style)
    const gantry = this.createWarningGantry(width, arrowDir);
    blockadeGroup.add(gantry);

    this.group.add(blockadeGroup);

    // Register 2D collider for physics
    this.colliders.push({
      cx: position.x,
      cz: position.z,
      nx: forward.x,
      nz: forward.z,
      halfWidth: width * 0.48,
      halfDepth: 1.2,
    });
  }

  /**
   * Builds the yellow & black hazard striped board texture with warning text.
   */
  private createHazardBarricadeTexture(text: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;

    // Yellow background
    ctx.fillStyle = '#ffcc00';
    ctx.fillRect(0, 0, 512, 160);

    // 45-degree Black stripes
    ctx.fillStyle = '#111111';
    const stripeW = 48;
    for (let x = -160; x < 512 + 160; x += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + stripeW, 0);
      ctx.lineTo(x + stripeW - 160, 160);
      ctx.lineTo(x - 160, 160);
      ctx.closePath();
      ctx.fill();
    }

    // White center badge with bold red text
    const badgeW = 240;
    const badgeH = 80;
    const bx = (512 - badgeW) / 2;
    const by = (160 - badgeH) / 2;

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d63031';
    ctx.lineWidth = 6;
    ctx.fillRect(bx, by, badgeW, badgeH);
    ctx.strokeRect(bx, by, badgeW, badgeH);

    ctx.fillStyle = '#d63031';
    ctx.font = '900 46px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 80);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Builds the cushion drum texture (orange cylinder with two reflective white bands).
   */
  private createCushionDrumTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    // Vibrant highway safety orange
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(0, 0, 256, 256);

    // Two reflective white stripes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 60, 256, 45);
    ctx.fillRect(0, 150, 256, 45);

    // Subtle shading / dirt
    ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.fillRect(0, 0, 256, 15);
    ctx.fillRect(0, 240, 256, 16);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /**
   * Builds a flashing LED chevron sign mesh & animation hook.
   */
  private createLEDArrowBoard(arrowDir: 'left' | 'right'): {
    mesh: THREE.Group;
    anim: { mat: THREE.MeshBasicMaterial; canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; arrowDir: 'left' | 'right'; step: number; timer: number };
  } {
    const root = new THREE.Group();

    // Box frame
    const boxGeo = new THREE.BoxGeometry(2.2, 0.9, 0.15);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x181818, metalness: 0.6, roughness: 0.5 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.castShadow = true;
    root.add(box);

    // Screen canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 104;
    const ctx = canvas.getContext('2d')!;

    const screenTex = new THREE.CanvasTexture(canvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });

    const screenGeo = new THREE.PlaneGeometry(2.1, 0.82);
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.z = 0.08;
    root.add(screen);

    // Support poles
    const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.4);
    const poleL = new THREE.Mesh(poleGeo, boxMat);
    poleL.position.set(-0.8, -0.8, 0);
    const poleR = new THREE.Mesh(poleGeo, boxMat);
    poleR.position.set(0.8, -0.8, 0);
    root.add(poleL);
    root.add(poleR);

    // Yellow warning flasher on top
    const flasherGeo = new THREE.SphereGeometry(0.1, 16, 12);
    const flasherMat = new THREE.MeshBasicMaterial({ color: 0xffbb00 });
    const flasherL = new THREE.Mesh(flasherGeo, flasherMat);
    flasherL.position.set(-0.8, 0.55, 0);
    const flasherR = new THREE.Mesh(flasherGeo, flasherMat);
    flasherR.position.set(0.8, 0.55, 0);
    root.add(flasherL);
    root.add(flasherR);

    // Initial render
    this.renderLEDScreen(ctx, arrowDir, 0);
    screenTex.needsUpdate = true;

    return {
      mesh: root,
      anim: { mat: screenMat, canvas, ctx, arrowDir, step: 0, timer: 0 },
    };
  }

  /**
   * Draws animated flashing LED arrows on the canvas.
   */
  private renderLEDScreen(ctx: CanvasRenderingContext2D, dir: 'left' | 'right', step: number): void {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 256, 104);

    // Draw LED matrix dots pattern (<<< or >>>)
    const count = 4;
    const startX = dir === 'right' ? 30 : 256 - 30;
    const dx = dir === 'right' ? 52 : -52;

    for (let i = 0; i < count; i++) {
      const active = (step % (count + 1)) === i || (step % (count + 1) === count);
      const color = active ? '#ff2200' : '#440a00';
      const glow = active ? '#ffbb00' : '#220000';

      const cx = startX + i * dx;
      const cy = 52;

      ctx.save();
      ctx.fillStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur = active ? 12 : 0;

      // Draw Chevron
      ctx.beginPath();
      if (dir === 'right') {
        ctx.moveTo(cx - 16, cy - 32);
        ctx.lineTo(cx + 14, cy);
        ctx.lineTo(cx - 16, cy + 32);
        ctx.lineTo(cx - 6, cy + 32);
        ctx.lineTo(cx + 24, cy);
        ctx.lineTo(cx - 6, cy - 32);
      } else {
        ctx.moveTo(cx + 16, cy - 32);
        ctx.lineTo(cx - 14, cy);
        ctx.lineTo(cx + 16, cy + 32);
        ctx.lineTo(cx + 6, cy + 32);
        ctx.lineTo(cx - 24, cy);
        ctx.lineTo(cx + 6, cy - 32);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  /**
   * Overhead banner gantry spanning the block.
   */
  private createWarningGantry(width: number, arrowDir: 'left' | 'right'): THREE.Group {
    const gantry = new THREE.Group();

    // Top truss crossbar
    const spanGeo = new THREE.BoxGeometry(width + 0.6, 0.45, 0.45);
    const trussMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.7, roughness: 0.4 });
    const crossbar = new THREE.Mesh(spanGeo, trussMat);
    crossbar.position.set(0, 3.8, 0);
    gantry.add(crossbar);

    // Side pillars
    const pillarGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.2);
    const pL = new THREE.Mesh(pillarGeo, trussMat);
    pL.position.set(-(width * 0.5 + 0.2), 2.1, 0);
    const pR = new THREE.Mesh(pillarGeo, trussMat);
    pR.position.set(width * 0.5 + 0.2, 2.1, 0);
    gantry.add(pL);
    gantry.add(pR);

    // Large suspended sign: "進入禁止 NO ENTRY"
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sctx = signCanvas.getContext('2d')!;

    // Red background with white border
    sctx.fillStyle = '#c0392b';
    sctx.fillRect(0, 0, 512, 128);
    sctx.strokeStyle = '#ffffff';
    sctx.lineWidth = 8;
    sctx.strokeRect(6, 6, 500, 116);

    sctx.fillStyle = '#ffffff';
    sctx.font = '900 48px "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    const arrowSymbol = arrowDir === 'left' ? '◀◀ ' : ' ▶▶';
    sctx.fillText(arrowDir === 'left' ? `${arrowSymbol}この先 通行止` : `この先 通行止${arrowSymbol}`, 256, 48);

    sctx.font = '700 24px "Helvetica Neue", Arial, sans-serif';
    sctx.fillText('ROAD CLOSED / DETOUR', 256, 92);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMat = new THREE.MeshStandardMaterial({ map: signTex, roughness: 0.4 });
    const signGeo = new THREE.PlaneGeometry(width * 0.75, 1.2);
    const signMesh = new THREE.Mesh(signGeo, signMat);
    signMesh.position.set(0, 3.6, 0.25);
    gantry.add(signMesh);

    return gantry;
  }

  /**
   * Updates LED animation frames.
   */
  public update(dt: number): void {
    for (const anim of this.animatedMaterials) {
      anim.timer += dt;
      if (anim.timer >= 0.18) {
        anim.timer = 0;
        anim.step = (anim.step + 1) % 6;
        this.renderLEDScreen(anim.ctx, anim.arrowDir, anim.step);
        if (anim.mat.map) anim.mat.map.needsUpdate = true;
      }
    }
  }

  /**
   * Checks collision with all active blockades.
   * If colliding, pushes the car back along the road normal and reports impact.
   */
  public checkCarCollision(carPos: THREE.Vector3, carRadius: number = 1.3): CollisionResult {
    let result: CollisionResult = { hit: false, pushX: 0, pushZ: 0, impact: 0 };

    for (const col of this.colliders) {
      // Relative offset from blockade center
      const dx = carPos.x - col.cx;
      const dz = carPos.z - col.cz;

      // Project onto blockade's local coordinates (forward normal and right tangent)
      // Normal = (nx, nz), Tangent = (-nz, nx)
      const distNormal = dx * col.nx + dz * col.nz;
      const distTangent = dx * (-col.nz) + dz * col.nx;

      // Check if inside collision box (including cushion drums)
      const buffer = carRadius;
      if (
        Math.abs(distTangent) < col.halfWidth + buffer &&
        distNormal >= -1.4 - buffer &&
        distNormal <= col.halfDepth + buffer
      ) {
        // Collided! Calculate push out vector along the normal (towards the oncoming car)
        const pushDistance = (col.halfDepth + buffer) - distNormal;
        if (pushDistance > 0) {
          result.hit = true;
          // Push backward along oncoming direction
          result.pushX += -col.nx * (pushDistance + 0.1);
          result.pushZ += -col.nz * (pushDistance + 0.1);
          result.impact = Math.max(result.impact, Math.min(1.0, pushDistance / 1.5));
        }
      }
    }

    return result;
  }
}
