import { MenuNav } from '../../../shared/arcadeMenuNav';
import { KeyboardTracker, SCROLL_KEYS } from '../../../shared/keyboardTracker';
import { readGamepads } from '../../../shared/gamepadFrame';

export interface InputState {
  aimX: number;
  aimY: number;
  shootNormal: boolean;
  shootNormalJustPressed: boolean;
  shootExplosiveJustPressed: boolean;
  startJustPressed: boolean;
  hasAnyInput: boolean;
  left: boolean;
  right: boolean;
  /** メニュー移動(押した瞬間の積み上げ。上・左 = -1 / 下・右 = +1) */
  menuNav: number[];
}

export class ArcadeInput {
  public aimX: number = 0;
  public aimY: number = 0;

  // Keyboard
  private keyboard = new KeyboardTracker({
    preventDefaultKeys: SCROLL_KEYS,
    onKeyDown: (e) => {
      this.menuNav.pushKey(e);
      this.lastInputTime = performance.now();
    },
    onBlur: () => this.resetAll(),
  });
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

  // アケコン(十字キー・スティック)の照準。レバーは倒すか倒さないかなので、最高速のままだと細かく狙えない。
  // 低い速さで動き出して、倒し続けるほど速くなる(細かい狙いと、大きな移動の両立)
  private readonly PAD_SPEED_MAX = 1.0;   // 画面の幅(2.0)を、約2秒で横切る最高速
  private readonly PAD_SPEED_START = 0.35;  // 倒し始めの速さ(最高速に対する割合)
  private readonly PAD_RAMP_SEC = 0.5;      // 倒し始めから最高速になるまで
  private padHoldSec = 0;

  // Rapid fire timer for continuous barrage
  private rapidFireTimer: number = 0;
  readonly RAPID_INTERVAL = 0.14; // ~7 shots per second when held

  private menuNav = new MenuNav();

  public lastInputTime: number = performance.now();

  constructor() {
    this.setupMouse();
    this.setupTouch();
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
    let padMoveX = 0; // アケコン・ゲームパッドの分だけ(キーボードより低い感度で動かす)
    let padMoveY = 0;
    let normalPressed = false;
    let explosivePressed = false;
    let startPressed = false;
    let hasAnyInput = false;
    let padNavX = 0;
    let padNavY = 0;

    // 1. Keyboard Aim
    const isW = this.keyboard.isDown('KeyW') || this.keyboard.isDown('ArrowUp');
    const isS = this.keyboard.isDown('KeyS') || this.keyboard.isDown('ArrowDown');
    const isA = this.keyboard.isDown('KeyA') || this.keyboard.isDown('ArrowLeft');
    const isD = this.keyboard.isDown('KeyD') || this.keyboard.isDown('ArrowRight');

    if (isW) { rawMoveY += 1.0; hasAnyInput = true; }
    if (isS) { rawMoveY -= 1.0; hasAnyInput = true; }
    if (isA) { rawMoveX -= 1.0; hasAnyInput = true; }
    if (isD) { rawMoveX += 1.0; hasAnyInput = true; }

    // Normal fire: Space, Z, Enter
    const isKeyNormal = this.keyboard.isDown('Space') || this.keyboard.isDown('KeyZ') || this.keyboard.isDown('Enter');
    if (isKeyNormal) {
      normalPressed = true;
      startPressed = true;
      hasAnyInput = true;
    }

    // Explosive fire: X, E, Shift, F
    const isKeyExplosive =
      this.keyboard.isDown('KeyX') || this.keyboard.isDown('KeyE') || this.keyboard.isDown('ShiftLeft') || this.keyboard.isDown('ShiftRight') || this.keyboard.isDown('KeyF');
    if (isKeyExplosive) {
      explosivePressed = true;
      hasAnyInput = true;
    }

    // 2. Gamepad API
    const gamepads = readGamepads();
    for (let i = 0; i < gamepads.length; i++) {
      const pad = gamepads[i];
      if (!pad) continue;

      const ax0 = pad.axes[0] || 0;
      const ax1 = pad.axes[1] || 0;
      const DEADZONE = 0.18;
      if (Math.abs(ax0) > DEADZONE) padNavX = ax0;
      if (Math.abs(ax1) > DEADZONE) padNavY = ax1;

      if (Math.abs(ax0) > DEADZONE) {
        padMoveX += (ax0 - Math.sign(ax0) * DEADZONE) / (1.0 - DEADZONE);
        hasAnyInput = true;
      }
      if (Math.abs(ax1) > DEADZONE) {
        padMoveY -= (ax1 - Math.sign(ax1) * DEADZONE) / (1.0 - DEADZONE);
        hasAnyInput = true;
      }

      // D-Pad
      if (pad.buttons[12]?.pressed) { padMoveY += 1.0; hasAnyInput = true; }
      if (pad.buttons[13]?.pressed) { padMoveY -= 1.0; hasAnyInput = true; }
      if (pad.buttons[14]?.pressed) { padMoveX -= 1.0; hasAnyInput = true; }
      if (pad.buttons[15]?.pressed) { padMoveX += 1.0; hasAnyInput = true; }
      if (pad.buttons[12]?.pressed) padNavY = -1;
      if (pad.buttons[13]?.pressed) padNavY = 1;
      if (pad.buttons[14]?.pressed) padNavX = -1;
      if (pad.buttons[15]?.pressed) padNavX = 1;

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

    this.menuNav.updatePad(padNavX, padNavY);

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

    // アケコンの倒し続けた時間(離したら最初から)
    padMoveX = Math.max(-1, Math.min(1, padMoveX));
    padMoveY = Math.max(-1, Math.min(1, padMoveY));
    const padActive = Math.abs(padMoveX) > 0.01 || Math.abs(padMoveY) > 0.01;
    this.padHoldSec = padActive ? this.padHoldSec + dt : 0;
    const padRamp = this.PAD_SPEED_START + (1 - this.PAD_SPEED_START) * Math.min(1, this.padHoldSec / this.PAD_RAMP_SEC);
    const padSpeed = this.PAD_SPEED_MAX * padRamp;

    // Apply movement
    if (Math.abs(rawMoveX) > 0.01 || Math.abs(rawMoveY) > 0.01 || padActive) {
      const speed = 1.6;
      this.aimX += (rawMoveX * speed + padMoveX * padSpeed) * dt;
      this.aimY += (rawMoveY * speed + padMoveY * padSpeed) * dt;
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
      left: rawMoveX + padMoveX < -0.3,
      right: rawMoveX + padMoveX > 0.3,
      menuNav: this.menuNav.take(),
    };
  }

  public setAim(x: number, y: number) {
    this.aimX = x;
    this.aimY = y;
  }

  public resetAll() {
    this.keyboard.down.clear();
    this.menuNav.clear();
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
    this.padHoldSec = 0;
  }
}
