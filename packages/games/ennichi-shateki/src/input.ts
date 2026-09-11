export interface InputState {
  aimX: number;
  aimY: number;
  shootNormal: boolean;
  shootNormalJustPressed: boolean;
  shootExplosiveJustPressed: boolean;
  startJustPressed: boolean;
  hasAnyInput: boolean;
}

export class ArcadeInput {
  public aimX: number = 0;
  public aimY: number = 0;

  // Keyboard
  private keys: Record<string, boolean> = {};
  private prevNormalKey: boolean = false;
  private prevExplosiveKey: boolean = false;
  private prevStartKey: boolean = false;

  // Gamepad
  private prevPadNormal: boolean = false;
  private prevPadExplosive: boolean = false;
  private prevPadStart: boolean = false;

  // Mouse
  private mouseLeftPressed: boolean = false;
  private mouseRightPressed: boolean = false;
  private prevMouseLeft: boolean = false;
  private prevMouseRight: boolean = false;

  // Touch
  private touchJustTapped: boolean = false;

  // Rapid fire timer for continuous barrage
  private rapidFireTimer: number = 0;
  readonly RAPID_INTERVAL = 0.14; // ~7 shots per second when held

  public lastInputTime: number = performance.now();

  constructor() {
    this.setupKeyboard();
    this.setupMouse();
    this.setupTouch();

    window.addEventListener('blur', () => {
      this.resetAll();
    });
  }

  private setupKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.lastInputTime = performance.now();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  private setupMouse() {
    window.addEventListener('mousemove', (e) => {
      this.aimX = (e.clientX / window.innerWidth) * 2 - 1;
      this.aimY = -(e.clientY / window.innerHeight) * 2 + 1;
      this.aimX = Math.max(-0.95, Math.min(0.95, this.aimX));
      this.aimY = Math.max(-0.95, Math.min(0.95, this.aimY));
      this.lastInputTime = performance.now();
    });

    window.addEventListener('mousedown', (e) => {
      this.lastInputTime = performance.now();
      if (e.button === 0) {
        this.mouseLeftPressed = true;
      } else if (e.button === 2) {
        this.mouseRightPressed = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouseLeftPressed = false;
      } else if (e.button === 2) {
        this.mouseRightPressed = false;
      }
    });

    // Disable default browser context menu on right-click so right-click is 100% responsive explosive shot
    window.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }

  private setupTouch() {
    window.addEventListener(
      'touchmove',
      (e) => {
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          this.aimX = (touch.clientX / window.innerWidth) * 2 - 1;
          this.aimY = -(touch.clientY / window.innerHeight) * 2 + 1;
          this.lastInputTime = performance.now();
        }
      },
      { passive: true }
    );

    window.addEventListener(
      'touchstart',
      (e) => {
        if (e.touches.length > 0) {
          const touch = e.touches[0];
          this.aimX = (touch.clientX / window.innerWidth) * 2 - 1;
          this.aimY = -(touch.clientY / window.innerHeight) * 2 + 1;
          this.touchJustTapped = true;
          this.lastInputTime = performance.now();
        }
      },
      { passive: true }
    );
  }

  public update(dt: number): InputState {
    let rawMoveX = 0;
    let rawMoveY = 0;
    let normalPressed = false;
    let explosivePressed = false;
    let startPressed = false;
    let hasAnyInput = false;

    // 1. Keyboard Aim
    const isW = this.keys['KeyW'] || this.keys['ArrowUp'];
    const isS = this.keys['KeyS'] || this.keys['ArrowDown'];
    const isA = this.keys['KeyA'] || this.keys['ArrowLeft'];
    const isD = this.keys['KeyD'] || this.keys['ArrowRight'];

    if (isW) { rawMoveY += 1.0; hasAnyInput = true; }
    if (isS) { rawMoveY -= 1.0; hasAnyInput = true; }
    if (isA) { rawMoveX -= 1.0; hasAnyInput = true; }
    if (isD) { rawMoveX += 1.0; hasAnyInput = true; }

    // Normal fire: Space, Z, Enter
    const isKeyNormal = this.keys['Space'] || this.keys['KeyZ'] || this.keys['Enter'];
    if (isKeyNormal) {
      normalPressed = true;
      startPressed = true;
      hasAnyInput = true;
    }

    // Explosive fire: X, E, Shift, F
    const isKeyExplosive =
      this.keys['KeyX'] || this.keys['KeyE'] || this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyF'];
    if (isKeyExplosive) {
      explosivePressed = true;
      hasAnyInput = true;
    }

    // 2. Gamepad API
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (!pad) continue;

      const ax0 = pad.axes[0] || 0;
      const ax1 = pad.axes[1] || 0;
      const DEADZONE = 0.18;

      if (Math.abs(ax0) > DEADZONE) {
        rawMoveX += (ax0 - Math.sign(ax0) * DEADZONE) / (1.0 - DEADZONE);
        hasAnyInput = true;
      }
      if (Math.abs(ax1) > DEADZONE) {
        rawMoveY -= (ax1 - Math.sign(ax1) * DEADZONE) / (1.0 - DEADZONE);
        hasAnyInput = true;
      }

      // D-Pad
      if (pad.buttons[12]?.pressed) { rawMoveY += 1.0; hasAnyInput = true; }
      if (pad.buttons[13]?.pressed) { rawMoveY -= 1.0; hasAnyInput = true; }
      if (pad.buttons[14]?.pressed) { rawMoveX -= 1.0; hasAnyInput = true; }
      if (pad.buttons[15]?.pressed) { rawMoveX += 1.0; hasAnyInput = true; }

      // Button 0 (A/Cross): Normal Shoot & Start
      if (pad.buttons[0]?.pressed) {
        normalPressed = true;
        startPressed = true;
        hasAnyInput = true;
      }

      // Button 1 (B/Circle), Button 2 (X/Square), Button 7 (RT): Explosive Shoot
      if (pad.buttons[1]?.pressed || pad.buttons[2]?.pressed || pad.buttons[7]?.pressed) {
        explosivePressed = true;
        hasAnyInput = true;
      }

      for (let b = 0; b < pad.buttons.length; b++) {
        if (pad.buttons[b]?.pressed) hasAnyInput = true;
      }
    }

    // 3. Mouse / Touch
    if (this.mouseLeftPressed || this.touchJustTapped) {
      normalPressed = true;
      startPressed = true;
      hasAnyInput = true;
    }
    if (this.mouseRightPressed) {
      explosivePressed = true;
      hasAnyInput = true;
    }

    if (hasAnyInput) {
      this.lastInputTime = performance.now();
    }

    // Apply movement
    if (Math.abs(rawMoveX) > 0.01 || Math.abs(rawMoveY) > 0.01) {
      const speed = 1.6;
      this.aimX += rawMoveX * speed * dt;
      this.aimY += rawMoveY * speed * dt;
      this.aimX = Math.max(-0.95, Math.min(0.95, this.aimX));
      this.aimY = Math.max(-0.95, Math.min(0.95, this.aimY));
    }

    // Edge triggers
    const normalInitialPress =
      (isKeyNormal && !this.prevNormalKey) ||
      (normalPressed && !this.prevPadNormal && !this.prevMouseLeft) ||
      this.touchJustTapped;

    // Rapid fire auto-repeat when held
    let shootNormalJustPressed = false;
    if (normalPressed) {
      if (normalInitialPress) {
        shootNormalJustPressed = true;
        this.rapidFireTimer = 0;
      } else {
        this.rapidFireTimer += dt;
        if (this.rapidFireTimer >= this.RAPID_INTERVAL) {
          shootNormalJustPressed = true;
          this.rapidFireTimer = 0;
        }
      }
    } else {
      this.rapidFireTimer = 0;
    }

    const shootExplosiveJustPressed =
      (isKeyExplosive && !this.prevExplosiveKey) ||
      (explosivePressed && !this.prevPadExplosive && !this.prevMouseRight);

    const startJustPressed =
      (isKeyNormal && !this.prevStartKey) ||
      (startPressed && !this.prevPadStart && !this.prevMouseLeft) ||
      this.touchJustTapped;

    this.prevNormalKey = isKeyNormal;
    this.prevExplosiveKey = isKeyExplosive;
    this.prevStartKey = isKeyNormal;
    this.prevPadNormal = normalPressed;
    this.prevPadExplosive = explosivePressed;
    this.prevPadStart = startPressed;
    this.prevMouseLeft = this.mouseLeftPressed;
    this.prevMouseRight = this.mouseRightPressed;
    this.touchJustTapped = false;

    return {
      aimX: this.aimX,
      aimY: this.aimY,
      shootNormal: normalPressed,
      shootNormalJustPressed,
      shootExplosiveJustPressed,
      startJustPressed,
      hasAnyInput,
    };
  }

  public setAim(x: number, y: number) {
    this.aimX = x;
    this.aimY = y;
  }

  public resetAll() {
    this.keys = {};
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
    this.touchJustTapped = false;
    this.prevNormalKey = false;
    this.prevExplosiveKey = false;
    this.prevStartKey = false;
    this.prevPadNormal = false;
    this.prevPadExplosive = false;
    this.prevPadStart = false;
    this.prevMouseLeft = false;
    this.prevMouseRight = false;
    this.rapidFireTimer = 0;
  }
}
