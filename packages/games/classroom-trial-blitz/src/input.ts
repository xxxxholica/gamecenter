import { InputState } from './types';

// Gamepad API最優先・キーボードフォールバックの入力マネージャ
export class InputManager {
  private keys: Record<string, boolean> = {};
  private prevAction = false;
  private gamepadIndex: number | null = null;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.gamepadIndex = e.gamepad.index;
    });
    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      if (this.gamepadIndex === e.gamepad.index) this.gamepadIndex = null;
    });
  }

  public poll(): InputState {
    let moveX = 0;
    let moveY = 0;
    let action = false;
    let hasGamepad = false;

    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
    if (this.keys['KeyW'] || this.keys['ArrowUp']) moveY -= 1;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) moveY += 1;
    if (this.keys['Space'] || this.keys['KeyZ'] || this.keys['Enter']) action = true;

    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad: Gamepad | null = null;
    if (this.gamepadIndex !== null && pads[this.gamepadIndex]) {
      pad = pads[this.gamepadIndex];
    } else {
      for (const p of pads) {
        if (p) {
          pad = p;
          this.gamepadIndex = p.index;
          break;
        }
      }
    }

    if (pad && pad.connected) {
      hasGamepad = true;
      const dz = 0.15;
      const ax0 = pad.axes[0] ?? 0;
      const ax1 = pad.axes[1] ?? 0;
      if (Math.abs(ax0) > dz) moveX = ax0;
      if (Math.abs(ax1) > dz) moveY = ax1;
      if (pad.buttons[14]?.pressed) moveX = -1;
      if (pad.buttons[15]?.pressed) moveX = 1;
      if (pad.buttons[12]?.pressed) moveY = -1;
      if (pad.buttons[13]?.pressed) moveY = 1;
      if (pad.buttons[0]?.pressed) action = true;
    }

    moveX = Math.max(-1, Math.min(1, moveX));
    moveY = Math.max(-1, Math.min(1, moveY));

    const actionJustPressed = action && !this.prevAction;
    this.prevAction = action;

    return { moveX, moveY, actionPressed: action, actionJustPressed, hasGamepad };
  }
}
