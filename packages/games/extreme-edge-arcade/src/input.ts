// Gamepad API + Keyboard Input System
import { MenuNav } from '../../../shared/arcadeMenuNav';
import { KeyboardTracker, SCROLL_KEYS } from '../../../shared/keyboardTracker';

export class InputManager {
  // Current states
  private keyboard = new KeyboardTracker({
    preventDefaultKeys: SCROLL_KEYS,
    onKeyDown: (e) => this.menuNav.pushKey(e),
    onBlur: () => this.menuNav.clear(),
  });

  private btn0 = false;
  private prevBtn0 = false;
  private btn1 = false;
  private prevBtn1 = false;
  private confirm = false;
  private prevConfirm = false;
  private cancel = false;
  private prevCancel = false;

  private leverX = 0; // -1 to 1
  private leverY = 0; // -1 (up) to 1 (down)
  private smoothTiltY = 0; // for keyboard analog ramp (0 to 1 forward)

  private gamepadConnected = false;

  private menuNav = new MenuNav();
  private frameNav: number[] = [];

  constructor() {
    window.addEventListener('gamepadconnected', () => {
      this.gamepadConnected = true;
    });

    window.addEventListener('gamepaddisconnected', () => {
      this.gamepadConnected = false;
    });
  }

  update(dt: number) {
    // Save previous frame states
    this.prevBtn0 = this.btn0;
    this.prevBtn1 = this.btn1;
    this.prevConfirm = this.confirm;
    this.prevCancel = this.cancel;

    // Reset default
    let kbUp = this.keyboard.isDown('KeyW') || this.keyboard.isDown('ArrowUp') || false;
    let kbDown = this.keyboard.isDown('KeyS') || this.keyboard.isDown('ArrowDown') || false;
    let kbLeft = this.keyboard.isDown('KeyA') || this.keyboard.isDown('ArrowLeft') || false;
    let kbRight = this.keyboard.isDown('KeyD') || this.keyboard.isDown('ArrowRight') || false;
    let kbBtn0 = this.keyboard.isDown('Enter') || this.keyboard.isDown('Space') || this.keyboard.isDown('KeyZ') || this.keyboard.isDown('KeyJ') || false;
    let kbBtn1 = this.keyboard.isDown('KeyX') || this.keyboard.isDown('KeyK') || false;
    let kbConfirm = this.keyboard.isDown('Enter') || this.keyboard.isDown('Space') || false;
    let kbCancel = this.keyboard.isDown('Escape') || this.keyboard.isDown('Backspace') || false;

    // Smooth keyboard ramp for tilt mechanics (W, Up or Enter/Button0)
    if (kbUp || kbBtn0) {
      this.smoothTiltY = Math.min(1.0, this.smoothTiltY + dt * 2.5);
    } else {
      this.smoothTiltY = Math.max(0.0, this.smoothTiltY - dt * 3.5);
    }

    let gpBtn0 = false;
    let gpBtn1 = false;
    let gpConfirm = false;
    let gpCancel = false;
    let gpAxisX = 0;
    let gpAxisY = 0;

    // Poll Gamepad API
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < gamepads.length; i++) {
      const gp = gamepads[i];
      if (!gp || !gp.connected) continue;

      this.gamepadConnected = true;

      // Buttons (0: A/Cross, 1: B/Circle, 2: X/Square, 3: Y/Triangle)
      if (gp.buttons[0]?.pressed || gp.buttons[2]?.pressed) gpBtn0 = true;
      if (gp.buttons[1]?.pressed || gp.buttons[3]?.pressed) gpBtn1 = true;

      // Strict confirm (Button 0 = A) and cancel (Button 1 = B)
      if (gp.buttons[0]?.pressed) gpConfirm = true;
      if (gp.buttons[1]?.pressed) gpCancel = true;

      // D-Pad (12: up, 13: down, 14: left, 15: right)
      if (gp.buttons[12]?.pressed) gpAxisY = -1;
      if (gp.buttons[13]?.pressed) gpAxisY = 1;
      if (gp.buttons[14]?.pressed) gpAxisX = -1;
      if (gp.buttons[15]?.pressed) gpAxisX = 1;

      // Analog Stick (axis 0: X, axis 1: Y)
      if (Math.abs(gp.axes[0]) > 0.15) gpAxisX = gp.axes[0];
      if (Math.abs(gp.axes[1]) > 0.15) gpAxisY = gp.axes[1];
    }

    // Combine (Gamepad takes priority if active, else keyboard)
    this.btn0 = gpBtn0 || kbBtn0;
    this.btn1 = gpBtn1 || kbBtn1;
    this.confirm = gpConfirm || kbConfirm;
    this.cancel = gpCancel || kbCancel;

    if (Math.abs(gpAxisX) > 0.15) {
      this.leverX = gpAxisX;
    } else {
      this.leverX = kbRight ? 1 : kbLeft ? -1 : 0;
    }

    this.menuNav.updatePad(gpAxisX, gpAxisY);
    this.frameNav = this.menuNav.take();

    if (Math.abs(gpAxisY) > 0.15) {
      this.leverY = gpAxisY;
    } else {
      this.leverY = kbDown ? 1 : kbUp ? -1 : 0;
    }
  }

  // Button 0 (Pour, Stop Clock, etc.)
  isButton0(): boolean {
    return this.btn0;
  }

  wasButton0Pressed(): boolean {
    return this.btn0 && !this.prevBtn0;
  }

  wasButton0Released(): boolean {
    return !this.btn0 && this.prevBtn0;
  }

  // Button 1 (Microwave Cancel, etc.)
  isButton1(): boolean {
    return this.btn1;
  }

  wasButton1Pressed(): boolean {
    return this.btn1 && !this.prevBtn1;
  }

  // Lever forward / Up (Cable push)
  isLeverUp(): boolean {
    return this.leverY < -0.3;
  }

  wasLeverUpPressed(): boolean {
    return this.leverY < -0.4;
  }

  // Forward tilt amount (0.0 to 1.0)
  getForwardTilt(): number {
    if (this.leverY < -0.1) {
      return Math.min(1.0, Math.abs(this.leverY));
    }
    return this.smoothTiltY;
  }

  // Lever down (Toaster popup)
  isLeverDown(): boolean {
    return this.leverY > 0.3;
  }

  wasLeverDownPressed(): boolean {
    return this.leverY > 0.5;
  }

  // 確定ボタンが押された瞬間（アケコン: Aボタン, キーボード: Enter / Space）
  isConfirmJustPressed(): boolean {
    return this.confirm && !this.prevConfirm;
  }

  // キャンセルボタンが押された瞬間（アケコン: Bボタン, キーボード: Escape / Backspace）
  isCancelJustPressed(): boolean {
    return this.cancel && !this.prevCancel;
  }

  // タイトル/デモ復帰用: 確定ボタンが押された瞬間
  anyPressed(): boolean {
    return this.isConfirmJustPressed();
  }

  /** このフレームで起きたメニュー移動(上・左 = -1 / 下・右 = +1)。 */
  takeMenuNav(): number[] {
    return this.frameNav;
  }

  getLeverX(): number {
    return this.leverX;
  }

  isGamepadConnected(): boolean {
    return this.gamepadConnected;
  }
}
