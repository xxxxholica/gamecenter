// Gamepad API + Keyboard Input System

export class InputManager {
  // Current states
  private keys: Record<string, boolean> = {};

  private btn0 = false;
  private prevBtn0 = false;
  private btn1 = false;
  private prevBtn1 = false;

  private leverX = 0; // -1 to 1
  private leverY = 0; // -1 (up) to 1 (down)
  private smoothTiltY = 0; // for keyboard analog ramp (0 to 1 forward)

  private gamepadConnected = false;

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Prevent browser default scroll for game controls
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

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

    // Reset default
    let kbUp = this.keys['KeyW'] || this.keys['ArrowUp'] || false;
    let kbDown = this.keys['KeyS'] || this.keys['ArrowDown'] || false;
    let kbLeft = this.keys['KeyA'] || this.keys['ArrowLeft'] || false;
    let kbRight = this.keys['KeyD'] || this.keys['ArrowRight'] || false;
    let kbBtn0 = this.keys['Enter'] || this.keys['Space'] || this.keys['KeyZ'] || this.keys['KeyJ'] || false;
    let kbBtn1 = this.keys['KeyX'] || this.keys['KeyK'] || false;

    // Smooth keyboard ramp for tilt mechanics (W, Up or Enter/Button0)
    if (kbUp || kbBtn0) {
      this.smoothTiltY = Math.min(1.0, this.smoothTiltY + dt * 2.5);
    } else {
      this.smoothTiltY = Math.max(0.0, this.smoothTiltY - dt * 3.5);
    }

    let gpBtn0 = false;
    let gpBtn1 = false;
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

    if (Math.abs(gpAxisX) > 0.15) {
      this.leverX = gpAxisX;
    } else {
      this.leverX = kbRight ? 1 : kbLeft ? -1 : 0;
    }

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

  // Lever forward / Up (Cable push, Yakisoba tilt)
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

  // Any key/button pressed (for Title start or Result retry)
  anyPressed(): boolean {
    return this.wasButton0Pressed() || this.wasButton1Pressed() || this.keys['Enter'] === true || this.keys['Space'] === true;
  }

  getLeverX(): number {
    return this.leverX;
  }

  isGamepadConnected(): boolean {
    return this.gamepadConnected;
  }
}
