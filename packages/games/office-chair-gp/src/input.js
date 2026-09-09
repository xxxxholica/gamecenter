// ============================================================================
// input.js - Gamepad API & Keyboard Input Manager
// ============================================================================

export class InputManager {
  constructor() {
    // Current input state
    this.steer = 0;        // -1.0 (Left) to +1.0 (Right)
    this.jet = false;      // 消火器ジェット (Button 0 / Space)
    this.brake = false;    // 足ブレーキ (Button 1 / Shift)
    this.throw = false;    // ボンベ投擲 (Button 2 / Enter)
    this.start = false;    // 開始 / 再挑戦 (Button 9 / Enter)

    // Edge triggers (just pressed this frame)
    this.startPressed = false;
    this.jetPressed = false;
    this.brakePressed = false;
    this.throwPressed = false;

    // Previous button states for edge detection
    this._prevStart = false;
    this._prevJet = false;
    this._prevBrake = false;
    this._prevThrow = false;

    // Raw keyboard tracking
    this.keys = {};

    this._initKeyboard();
  }

  _initKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      // Prevent browser default scrolling on Space / Arrows
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  update() {
    // 1. Keyboard readings
    let kbSteer = 0;
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) kbSteer -= 1.0;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) kbSteer += 1.0;

    const kbJet = !!(this.keys['Space'] || this.keys['KeyW'] || this.keys['ArrowUp']);
    const kbBrake = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight'] || this.keys['KeyS'] || this.keys['ArrowDown']);
    const kbThrow = !!(this.keys['Enter'] || this.keys['NumpadEnter'] || this.keys['KeyF']);
    const kbStart = !!(this.keys['Enter'] || this.keys['NumpadEnter'] || this.keys['KeyR'] || this.keys['Space']);

    // 2. Gamepad API readings
    let gpSteer = 0;
    let gpJet = false;
    let gpBrake = false;
    let gpThrow = false;
    let gpStart = false;

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0] || gamepads[1] || null;

    if (gp && gp.connected) {
      // Axes 0: Left Stick / D-Pad
      const rawAxis = gp.axes[0];
      if (Math.abs(rawAxis) > 0.15) {
        gpSteer = rawAxis;
      }
      // D-Pad buttons (standard gamepad mapping: 14=left, 15=right)
      if (gp.buttons[14]?.pressed) gpSteer = -1.0;
      if (gp.buttons[15]?.pressed) gpSteer = 1.0;

      // Button 0 (A / Cross): Jet
      if (gp.buttons[0]?.pressed) gpJet = true;
      // Button 1 (B / Circle): Brake
      if (gp.buttons[1]?.pressed) gpBrake = true;
      // Button 2 (X / Square) or Button 3 (Y / Triangle): Throw Bomb
      if (gp.buttons[2]?.pressed || gp.buttons[3]?.pressed) gpThrow = true;
      // Button 7 (RT) or Button 6 (LT) alternative
      if (gp.buttons[7]?.pressed) gpJet = true;
      if (gp.buttons[6]?.pressed) gpBrake = true;

      // Button 9 (Start) or Button 8 (Select)
      if (gp.buttons[9]?.pressed || gp.buttons[8]?.pressed) gpStart = true;
    }

    // Combine inputs
    this.steer = Math.max(-1.0, Math.min(1.0, kbSteer + gpSteer));
    this.jet = kbJet || gpJet;
    this.brake = kbBrake || gpBrake;
    this.throw = kbThrow || gpThrow;
    this.start = kbStart || gpStart;

    // Edge triggers
    this.startPressed = this.start && !this._prevStart;
    this.jetPressed = this.jet && !this._prevJet;
    this.brakePressed = this.brake && !this._prevBrake;
    this.throwPressed = this.throw && !this._prevThrow;

    this._prevStart = this.start;
    this._prevJet = this.jet;
    this._prevBrake = this.brake;
    this._prevThrow = this.throw;
  }
}
