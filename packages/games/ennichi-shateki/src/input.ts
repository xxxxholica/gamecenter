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
  cancelJustPressed: boolean;
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
    trackEdges: true,
    onKeyDown: (e) => {
      this.menuNav.pushKey(e);
      this.lastInputTime = performance.now();
    },
    onBlur: () => this.resetAll(),
  });
  private prevNormalKey: boolean = false;
  private prevExplosiveKey: boolean = false;
  private prevStartKey: boolean = false;
  private prevCancelKey: boolean = false;

  // Gamepad
  private prevPadNormal: boolean = false;
  private prevPadExplosive: boolean = false;
  private prevPadStart: boolean = false;

  // Mouse
  private mouseLeftPressed: boolean = false;
  private mouseRightPressed: boolean = false;
  private mouseLeftJustPressed: boolean = false;
  private mouseRightJustPressed: boolean = false;
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
    this.setupFullscreenReset();
  }

  private setupFullscreenReset() {
    const onFullscreenChange = () => this.resetAll();
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    try {
      if (window.parent && window.parent !== window && window.parent.document) {
        window.parent.document.addEventListener('fullscreenchange', onFullscreenChange);
        window.parent.document.addEventListener('webkitfullscreenchange', onFullscreenChange);
      }
    } catch {
      /* クロスオリジンの場合は無視 */
    }
  }

  private setupMouse() {
    window.addEventListener('mousemove', (e) => {
      if (e.isTrusted && e.buttons === 0) {
        this.mouseLeftPressed = false;
        this.mouseRightPressed = false;
      }
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
        this.mouseLeftJustPressed = true;
      } else if (e.button === 2) {
        this.mouseRightPressed = true;
        this.mouseRightJustPressed = true;
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
    let padNormalPressed = false;
    let padExplosivePressed = false;
    let padStartPressed = false;
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
    const keyNormalJustPressed =
      this.keyboard.pressed.has('Space') || this.keyboard.pressed.has('KeyZ') || this.keyboard.pressed.has('Enter');
    if (isKeyNormal || keyNormalJustPressed) {
      normalPressed = true;
      startPressed = true;
      hasAnyInput = true;
    }

    // Explosive fire: X, E, Shift (KeyF is reserved for fullscreen toggle)
    const isKeyExplosive =
      this.keyboard.isDown('KeyX') || this.keyboard.isDown('KeyE') || this.keyboard.isDown('ShiftLeft') || this.keyboard.isDown('ShiftRight');
    const keyExplosiveJustPressed =
      this.keyboard.pressed.has('KeyX') || this.keyboard.pressed.has('KeyE') || this.keyboard.pressed.has('ShiftLeft') || this.keyboard.pressed.has('ShiftRight');
    if (isKeyExplosive || keyExplosiveJustPressed) {
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
        padNormalPressed = true;
        padStartPressed = true;
        hasAnyInput = true;
      }

      // Button 1 (B/Circle), Button 2 (X/Square), Button 7 (RT): Explosive Shoot
      if (pad.buttons[1]?.pressed || pad.buttons[2]?.pressed || pad.buttons[7]?.pressed) {
        explosivePressed = true;
        padExplosivePressed = true;
        hasAnyInput = true;
      }

      for (let b = 0; b < pad.buttons.length; b++) {
        if (pad.buttons[b]?.pressed) hasAnyInput = true;
      }
    }

    this.menuNav.updatePad(padNavX, padNavY);

    // 3. Mouse / Touch
    if (this.mouseLeftPressed || this.mouseLeftJustPressed || this.touchJustTapped) {
      normalPressed = true;
      startPressed = true;
      hasAnyInput = true;
    }
    if (this.mouseRightPressed || this.mouseRightJustPressed) {
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

    // Edge triggers (keyboard, gamepad, and mouse tracked independently so one never blocks another)
    const normalInitialPress =
      keyNormalJustPressed ||
      (isKeyNormal && !this.prevNormalKey) ||
      (padNormalPressed && !this.prevPadNormal) ||
      this.mouseLeftJustPressed ||
      (this.mouseLeftPressed && !this.prevMouseLeft) ||
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
      keyExplosiveJustPressed ||
      (isKeyExplosive && !this.prevExplosiveKey) ||
      (padExplosivePressed && !this.prevPadExplosive) ||
      this.mouseRightJustPressed ||
      (this.mouseRightPressed && !this.prevMouseRight);

    const startJustPressed =
      keyNormalJustPressed ||
      (isKeyNormal && !this.prevStartKey) ||
      (padStartPressed && !this.prevPadStart) ||
      this.mouseLeftJustPressed ||
      (this.mouseLeftPressed && !this.prevMouseLeft) ||
      this.touchJustTapped;
    const isKeyCancel = this.keyboard.isDown('Backspace');
    const cancelJustPressed = this.keyboard.pressed.has('Backspace') || (isKeyCancel && !this.prevCancelKey);

    this.prevNormalKey = isKeyNormal;
    this.prevExplosiveKey = isKeyExplosive;
    this.prevStartKey = isKeyNormal;
    this.prevCancelKey = isKeyCancel;
    this.prevPadNormal = padNormalPressed;
    this.prevPadExplosive = padExplosivePressed;
    this.prevPadStart = padStartPressed;
    this.prevMouseLeft = this.mouseLeftPressed;
    this.prevMouseRight = this.mouseRightPressed;
    this.mouseLeftJustPressed = false;
    this.mouseRightJustPressed = false;
    this.touchJustTapped = false;
    this.keyboard.endFrame();

    return {
      aimX: this.aimX,
      aimY: this.aimY,
      shootNormal: normalPressed,
      shootNormalJustPressed,
      shootExplosiveJustPressed,
      startJustPressed,
      cancelJustPressed,
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
    this.keyboard.endFrame();
    this.menuNav.clear();
    this.mouseLeftPressed = false;
    this.mouseRightPressed = false;
    this.mouseLeftJustPressed = false;
    this.mouseRightJustPressed = false;
    this.touchJustTapped = false;
    this.prevNormalKey = false;
    this.prevExplosiveKey = false;
    this.prevStartKey = false;
    this.prevCancelKey = false;
    this.prevPadNormal = false;
    this.prevPadExplosive = false;
    this.prevPadStart = false;
    this.prevMouseLeft = false;
    this.prevMouseRight = false;
    this.rapidFireTimer = 0;
    this.padHoldSec = 0;
  }
}
