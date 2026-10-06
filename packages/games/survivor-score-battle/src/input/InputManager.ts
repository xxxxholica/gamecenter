import { InputState } from '../types';

export class InputManager {
  private static instance: InputManager | null = null;

  private keysDown: Set<string> = new Set();
  private prevKeysDown: Set<string> = new Set();

  private prevGamepadButtons: boolean[] = [];
  private gamepadIndex: number | null = null;
  private gamepadName: string = '';

  // Tap states (single-frame triggers)
  private confirmTriggered: boolean = false;
  private cancelTriggered: boolean = false;
  private specialTriggered: boolean = false;
  private pauseTriggered: boolean = false;
  private leftTapTriggered: boolean = false;
  private rightTapTriggered: boolean = false;
  private upTapTriggered: boolean = false;
  private downTapTriggered: boolean = false;

  private prevMoveX: number = 0;
  private prevMoveY: number = 0;

  private constructor() {
    this.setupEventListeners();
  }

  public static getInstance(): InputManager {
    if (!InputManager.instance) {
      InputManager.instance = new InputManager();
    }
    return InputManager.instance;
  }

  private setupEventListeners() {
    window.addEventListener('keydown', (e) => {
      // Prevent browser scroll and shortcuts for game controls
      if (
        ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)
      ) {
        e.preventDefault();
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      console.log('Gamepad connected:', e.gamepad.id);
      this.gamepadIndex = e.gamepad.index;
      this.gamepadName = e.gamepad.id;
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      console.log('Gamepad disconnected:', e.gamepad.id);
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        this.gamepadName = '';
      }
    });
  }

  /**
   * Called once per frame in the main game loop
   */
  public update(): InputState {
    let moveX = 0;
    let moveY = 0;
    let confirm = false;
    let cancel = false;
    let special = false;
    let pause = false;

    const rawButtons: boolean[] = [];
    const rawAxes: number[] = [];
    let gamepadConnected = false;

    // 1. Poll Gamepad
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let activePad: Gamepad | null = null;

    if (this.gamepadIndex !== null && gamepads[this.gamepadIndex]) {
      activePad = gamepads[this.gamepadIndex];
    } else {
      // Auto find first connected pad
      for (const pad of gamepads) {
        if (pad && pad.connected) {
          activePad = pad;
          this.gamepadIndex = pad.index;
          this.gamepadName = pad.id;
          break;
        }
      }
    }

    if (activePad) {
      gamepadConnected = true;
      // Record raw buttons
      for (let i = 0; i < activePad.buttons.length; i++) {
        const btn = activePad.buttons[i];
        rawButtons[i] = typeof btn === 'object' ? btn.pressed : btn > 0.5;
      }
      // Record raw axes
      for (let i = 0; i < activePad.axes.length; i++) {
        rawAxes[i] = activePad.axes[i];
      }

      // Stick X/Y (Axis 0 and 1)
      const deadzone = 0.2;
      let stickX = activePad.axes[0] || 0;
      let stickY = activePad.axes[1] || 0;

      if (Math.abs(stickX) < deadzone) stickX = 0;
      if (Math.abs(stickY) < deadzone) stickY = 0;

      // D-Pad / HAT buttons (HORI stick often maps to buttons 12-15 or axes)
      let dpadX = 0;
      let dpadY = 0;
      if (rawButtons[14]) dpadX -= 1; // Left
      if (rawButtons[15]) dpadX += 1; // Right
      if (rawButtons[12]) dpadY -= 1; // Up
      if (rawButtons[13]) dpadY += 1; // Down

      moveX = stickX !== 0 ? stickX : dpadX;
      moveY = stickY !== 0 ? stickY : dpadY;

      // Buttons (Arcade buttons)
      // A (0), B (1), X (2), Y (3), LB (4), RB (5), LT (6), RT (7), Back (8), Start (9)
      const btnConfirm = rawButtons[0] || rawButtons[2]; // A or X
      const btnCancel = rawButtons[1];                   // B
      const btnSpecial = rawButtons[3] || rawButtons[5] || rawButtons[7] || rawButtons[4]; // Y, RB, RT, LB
      const btnPause = rawButtons[9] || rawButtons[8];   // Start or Back

      if (btnConfirm) confirm = true;
      if (btnCancel) cancel = true;
      if (btnSpecial) special = true;
      if (btnPause) pause = true;
    }

    // 2. Keyboard Fallback & Combination
    if (this.keysDown.has('KeyA') || this.keysDown.has('ArrowLeft')) moveX -= 1;
    if (this.keysDown.has('KeyD') || this.keysDown.has('ArrowRight')) moveX += 1;
    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) moveY -= 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) moveY += 1;

    // Normalize diagonal movement vector
    const mag = Math.hypot(moveX, moveY);
    if (mag > 1) {
      moveX /= mag;
      moveY /= mag;
    }

    if (
      this.keysDown.has('Space') ||
      this.keysDown.has('Enter') ||
      this.keysDown.has('KeyZ')
    ) {
      confirm = true;
    }

    if (this.keysDown.has('Escape') || this.keysDown.has('KeyX')) {
      cancel = true;
    }

    if (
      this.keysDown.has('ShiftLeft') ||
      this.keysDown.has('ShiftRight') ||
      this.keysDown.has('KeyK') ||
      this.keysDown.has('KeyJ') ||
      this.keysDown.has('KeyC') ||
      this.keysDown.has('Space')
    ) {
      special = true;
    }

    if (this.keysDown.has('KeyP') || this.keysDown.has('Escape')) {
      pause = true;
    }

    // 3. Single-frame Edge Detection (Tap triggers for menus)
    const prevConfirm = this.isActionPressed('confirm');
    const prevCancel = this.isActionPressed('cancel');
    const prevSpecial = this.isActionPressed('special');
    const prevPause = this.isActionPressed('pause');

    this.confirmTriggered = confirm && !prevConfirm;
    this.cancelTriggered = cancel && !prevCancel;
    this.specialTriggered = special && !prevSpecial;
    this.pauseTriggered = pause && !prevPause;

    this.leftTapTriggered = moveX < -0.5 && this.prevMoveX >= -0.5;
    this.rightTapTriggered = moveX > 0.5 && this.prevMoveX <= 0.5;
    this.upTapTriggered = moveY < -0.5 && this.prevMoveY >= -0.5;
    this.downTapTriggered = moveY > 0.5 && this.prevMoveY <= 0.5;

    this.prevMoveX = moveX;
    this.prevMoveY = moveY;
    this.prevGamepadButtons = [...rawButtons];
    this.prevKeysDown = new Set(this.keysDown);

    return {
      moveX,
      moveY,
      confirm: this.confirmTriggered,
      cancel: this.cancelTriggered,
      special: this.specialTriggered,
      pause: this.pauseTriggered,
      leftTap: this.leftTapTriggered,
      rightTap: this.rightTapTriggered,
      upTap: this.upTapTriggered,
      downTap: this.downTapTriggered,
      gamepadConnected,
      gamepadId: this.gamepadName || 'HORI Fighting Stick Mini',
      rawButtons,
      rawAxes,
    };
  }

  private isActionPressed(action: 'confirm' | 'cancel' | 'special' | 'pause'): boolean {
    if (action === 'confirm') {
      return (
        this.prevKeysDown.has('Space') ||
        this.prevKeysDown.has('Enter') ||
        this.prevKeysDown.has('KeyZ') ||
        !!this.prevGamepadButtons[0] ||
        !!this.prevGamepadButtons[2]
      );
    }
    if (action === 'cancel') {
      return (
        this.prevKeysDown.has('Escape') ||
        this.prevKeysDown.has('KeyX') ||
        !!this.prevGamepadButtons[1]
      );
    }
    if (action === 'special') {
      return (
        this.prevKeysDown.has('ShiftLeft') ||
        this.prevKeysDown.has('ShiftRight') ||
        this.prevKeysDown.has('KeyK') ||
        this.prevKeysDown.has('KeyJ') ||
        this.prevKeysDown.has('KeyC') ||
        this.prevKeysDown.has('Space') ||
        !!this.prevGamepadButtons[3] ||
        !!this.prevGamepadButtons[5] ||
        !!this.prevGamepadButtons[7] ||
        !!this.prevGamepadButtons[4]
      );
    }
    if (action === 'pause') {
      return (
        this.prevKeysDown.has('KeyP') ||
        this.prevKeysDown.has('Escape') ||
        !!this.prevGamepadButtons[9] ||
        !!this.prevGamepadButtons[8]
      );
    }
    return false;
  }
}
