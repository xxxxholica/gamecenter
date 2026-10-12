import { MenuNav } from '../../../../shared/arcadeMenuNav';
import { KeyboardTracker, SCROLL_KEYS } from '../../../../shared/keyboardTracker';
import { readGamepads } from '../../../../shared/gamepadFrame';

export interface InputState {
  left: boolean;
  right: boolean;
  down: boolean;
  jump: boolean;
  jumpPressed: boolean;
  jumpReleased: boolean;
  spinPressed: boolean;
  startPressed: boolean;
  /** メニュー確定: Enter / Space / アケコンA (W・矢印上のジャンプでは確定しない) */
  confirmPressed: boolean;
  /** メニュー移動(押した瞬間。上・左 = -1 / 下・右 = +1) */
  menuNav: number[];
  anyActionPressed: boolean;
  lastInputTime: number;
}

export class InputManager {
  private menuNav = new MenuNav();
  private keyboard = new KeyboardTracker({
    trackEdges: true,
    trackReleased: true,
    // Prevent scrolling with arrow keys / space
    preventDefaultKeys: SCROLL_KEYS,
    onKeyDown: (e) => {
      this.menuNav.pushKey(e);
      if (!this.keysHeld.has(e.code)) this.lastInputTime = performance.now();
    },
    onKeyUp: () => {
      this.lastInputTime = performance.now();
    },
    onBlur: () => this.menuNav.clear(),
  });
  private keysHeld = this.keyboard.down;
  private keysJustPressed = this.keyboard.pressed;
  private keysJustReleased = this.keyboard.released;

  private prevGamepadButtons: boolean[] = [];
  private lastInputTime: number = performance.now();

  constructor() {
    window.addEventListener('pointerdown', () => {
      this.lastInputTime = performance.now();
    });
  }

  public resetIdleTimer(): void {
    this.lastInputTime = performance.now();
  }

  public getIdleDurationSeconds(): number {
    return (performance.now() - this.lastInputTime) / 1000;
  }

  public update(): InputState {
    // 1. Keyboard inputs
    const kLeft = this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft');
    const kRight = this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight');
    const kDown = this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown');
    
    const kJump = this.keysHeld.has('Space') || this.keysHeld.has('KeyZ') || this.keysHeld.has('KeyJ') || this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp');
    const kJumpPressed = this.keysJustPressed.has('Space') || this.keysJustPressed.has('KeyZ') || this.keysJustPressed.has('KeyJ') || this.keysJustPressed.has('KeyW') || this.keysJustPressed.has('ArrowUp');
    const kJumpReleased = this.keysJustReleased.has('Space') || this.keysJustReleased.has('KeyZ') || this.keysJustReleased.has('KeyJ') || this.keysJustReleased.has('KeyW') || this.keysJustReleased.has('ArrowUp');

    const kSpinPressed = this.keysJustPressed.has('ShiftLeft') || this.keysJustPressed.has('ShiftRight') || 
                         this.keysJustPressed.has('KeyX') || this.keysJustPressed.has('KeyK');
    
    const kStartPressed = this.keysJustPressed.has('Enter') || this.keysJustPressed.has('Space') || this.keysJustPressed.has('KeyW');

    // 2. Gamepad API
    let gLeft = false;
    let gRight = false;
    let gDown = false;
    let gJump = false;
    let gJumpPressed = false;
    let gJumpReleased = false;
    let gSpinPressed = false;
    let gStartPressed = false;
    let gAnyPressed = false;
    let padNavX = 0;
    let padNavY = 0;

    const gamepads = readGamepads();
    const gp = gamepads.find((g) => g !== null && g.connected);

    if (gp) {
      // Axes
      const ax0 = gp.axes[0] ?? 0;
      const ax1 = gp.axes[1] ?? 0;
      if (ax0 < -0.3) gLeft = true;
      if (ax0 > 0.3) gRight = true;
      if (ax1 > 0.4) gDown = true;
      padNavX = ax0;
      padNavY = ax1;

      // Buttons (D-Pad & Face buttons)
      const bJump = gp.buttons[0]?.pressed || false; // Button 0 (A/Cross)
      const bSpin = gp.buttons[1]?.pressed || gp.buttons[2]?.pressed || false; // Button 1 (B/Circle) / Button 2 (X/Square)
      const bStart = gp.buttons[9]?.pressed || false; // Start / Menu button

      // D-Pad buttons
      if (gp.buttons[14]?.pressed) gLeft = true;
      if (gp.buttons[15]?.pressed) gRight = true;
      if (gp.buttons[13]?.pressed) gDown = true;
      if (gp.buttons[12]?.pressed) padNavY = -1;
      if (gp.buttons[13]?.pressed) padNavY = 1;
      if (gp.buttons[14]?.pressed) padNavX = -1;
      if (gp.buttons[15]?.pressed) padNavX = 1;

      const prevJump = this.prevGamepadButtons[0] || false;
      const prevSpin = this.prevGamepadButtons[1] || false;
      const prevStart = this.prevGamepadButtons[9] || false;

      gJump = bJump;
      if (bJump && !prevJump) gJumpPressed = true;
      if (!bJump && prevJump) gJumpReleased = true;
      if (bSpin && !prevSpin) gSpinPressed = true;
      if (bStart && !prevStart) gStartPressed = true;

      // Any gamepad button pressed
      for (let i = 0; i < gp.buttons.length; i++) {
        if (gp.buttons[i]?.pressed) {
          gAnyPressed = true;
          if (!this.prevGamepadButtons[i]) {
            this.lastInputTime = performance.now();
          }
        }
      }
      if (Math.abs(ax0) > 0.4 || Math.abs(ax1) > 0.4) {
        this.lastInputTime = performance.now();
      }

      // Store current button states
      this.prevGamepadButtons = gp.buttons.map((b) => b.pressed);
    }

    this.menuNav.updatePad(padNavX, padNavY);

    const anyKey = this.keysJustPressed.size > 0;
    const anyAction = anyKey || gAnyPressed || gJumpPressed || gSpinPressed || gStartPressed;
    if (anyAction) {
      this.lastInputTime = performance.now();
    }

    const state: InputState = {
      left: kLeft || gLeft,
      right: kRight || gRight,
      down: kDown || gDown,
      jump: kJump || gJump,
      jumpPressed: kJumpPressed || gJumpPressed,
      jumpReleased: kJumpReleased || gJumpReleased,
      spinPressed: kSpinPressed || gSpinPressed,
      startPressed: kStartPressed,
      confirmPressed: this.keysJustPressed.has('Enter') || this.keysJustPressed.has('Space') || gJumpPressed,
      menuNav: this.menuNav.take(),
      anyActionPressed: anyAction,
      lastInputTime: this.lastInputTime
    };

    // Clear frame-specific sets
    this.keysJustPressed.clear();
    this.keysJustReleased.clear();

    return state;
  }
}
