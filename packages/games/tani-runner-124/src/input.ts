// ============================================================
// HTML5 Gamepad API & Keyboard/Touch Input Manager
// Arcade Stick (Sanwa/Seimitsu) priority with full keyboard fallback
// ============================================================

import { KeyboardTracker, SCROLL_KEYS } from '../../../shared/keyboardTracker';
import { readGamepads } from '../../../shared/gamepadFrame';

export interface InputState {
  moveX: number;           // -1 (left) to +1 (right)
  narrowFormation: boolean;// true when stick DOWN or 'S'/DownKey
  actionPressed: boolean;  // Button 0 / Enter (held)
  actionJustPressed: boolean;// Button 0 just pressed this frame
  lastConnectedPadName: string;
  hasGamepad: boolean;
}

export class InputManager {
  private keyboard = new KeyboardTracker({ preventDefaultKeys: SCROLL_KEYS }); // Prevent browser scroll with arrows/space
  private prevAction: boolean = false;
  private gamepadIndex: number | null = null;
  private gamepadName: string = '';

  // Touch / Mouse drag support
  private pointerDown: boolean = false;
  private pointerStartX: number = 0;
  private pointerCurrentX: number = 0;
  private pointerCurrentY: number = 0;
  private pointerStartY: number = 0;

  constructor() {
    this.setupGamepadEvents();
    this.setupPointerEvents();
  }

  private setupGamepadEvents(): void {
    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      this.gamepadIndex = e.gamepad.index;
      this.gamepadName = e.gamepad.id;
      console.log(`[GAMEPAD CONNECTED] ${e.gamepad.id} at index ${e.gamepad.index}`);
      this.updateHudPadStatus();
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      if (this.gamepadIndex === e.gamepad.index) {
        this.gamepadIndex = null;
        this.gamepadName = '';
        console.log(`[GAMEPAD DISCONNECTED] index ${e.gamepad.index}`);
        this.updateHudPadStatus();
      }
    });
  }

  private setupPointerEvents(): void {
    window.addEventListener('pointerdown', (e) => {
      this.pointerDown = true;
      this.pointerStartX = e.clientX;
      this.pointerStartY = e.clientY;
      this.pointerCurrentX = e.clientX;
      this.pointerCurrentY = e.clientY;
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.pointerDown) return;
      this.pointerCurrentX = e.clientX;
      this.pointerCurrentY = e.clientY;
    });

    window.addEventListener('pointerup', () => {
      this.pointerDown = false;
    });

    window.addEventListener('pointercancel', () => {
      this.pointerDown = false;
    });
  }

  private updateHudPadStatus(): void {
    const padStatusElem = document.getElementById('gamepad-status');
    if (!padStatusElem) return;
    if (this.gamepadIndex !== null) {
      // Shorten gamepad name for arcade display
      const cleanName = this.gamepadName.length > 24 ? this.gamepadName.substring(0, 22) + '..' : this.gamepadName;
      padStatusElem.textContent = `PAD: [ON] ${cleanName}`;
      padStatusElem.style.color = '#00ff66';
    } else {
      padStatusElem.textContent = 'PAD: 未検出 (キーボード操作)';
      padStatusElem.style.color = '#aaaaaa';
    }
  }

  public poll(): InputState {
    let moveX = 0;
    let narrow = false;
    let action = false;

    // 1. Keyboard Polling
    // Left / Right
    if (this.keyboard.isDown('KeyA') || this.keyboard.isDown('ArrowLeft')) moveX -= 1;
    if (this.keyboard.isDown('KeyD') || this.keyboard.isDown('ArrowRight')) moveX += 1;

    // Down (Narrow Formation)
    if (this.keyboard.isDown('KeyS') || this.keyboard.isDown('ArrowDown')) narrow = true;

    // Action (Enter)
    if (this.keyboard.isDown('Enter')) action = true;

    // 2. Gamepad API Polling
    let hasPad = false;
    {
      const pads = readGamepads();
      let pad: Gamepad | null = null;

      if (this.gamepadIndex !== null && pads[this.gamepadIndex]) {
        pad = pads[this.gamepadIndex];
      } else {
        // Fallback: search first connected pad
        for (let i = 0; i < pads.length; i++) {
          const current = pads[i];
          if (current) {
            pad = current;
            this.gamepadIndex = i;
            this.gamepadName = current.id;
            break;
          }
        }
      }

      if (pad && pad.connected) {
        hasPad = true;

        // Stick X (axes[0])
        const stickX = pad.axes[0] ?? 0;
        const deadzone = 0.15;
        if (Math.abs(stickX) > deadzone) {
          moveX = stickX;
        }

        // Stick Y (axes[1]) - Down (> 0.5)
        const stickY = pad.axes[1] ?? 0;
        if (stickY > 0.5) {
          narrow = true;
        }

        // D-pad support (standard gamepad mapping: 14=left, 15=right, 13=down)
        if (pad.buttons[14]?.pressed) moveX = -1;
        if (pad.buttons[15]?.pressed) moveX = 1;
        if (pad.buttons[13]?.pressed) narrow = true;

        // Button 0 (Arcade A button, Cross on PS, A on Xbox)
        if (pad.buttons[0]?.pressed || pad.buttons[1]?.pressed || pad.buttons[7]?.pressed) {
          action = true;
        }
      }
    }

    // 3. Pointer / Mouse fallback when held
    if (this.pointerDown) {
      const dx = (this.pointerCurrentX - this.pointerStartX) / (window.innerWidth * 0.25);
      const clampedDx = Math.max(-1, Math.min(1, dx));
      if (Math.abs(clampedDx) > 0.1) {
        moveX = clampedDx;
      }
      const dy = this.pointerCurrentY - this.pointerStartY;
      if (dy > 60) {
        narrow = true;
      }
    }

    // Clamp moveX to [-1, 1]
    moveX = Math.max(-1, Math.min(1, moveX));

    // Just pressed logic for action button
    const actionJustPressed = action && !this.prevAction;
    this.prevAction = action;

    return {
      moveX,
      narrowFormation: narrow,
      actionPressed: action,
      actionJustPressed,
      lastConnectedPadName: this.gamepadName,
      hasGamepad: hasPad
    };
  }

  // Haptic Rumble for gamepads
  public rumble(durationMs: number = 100, strong: number = 0.5, weak: number = 0.5): void {
    if (this.gamepadIndex === null) return;
    const pads = readGamepads();
    const pad = pads[this.gamepadIndex];
    if (pad && pad.vibrationActuator && typeof (pad.vibrationActuator as any).playEffect === 'function') {
      (pad.vibrationActuator as any).playEffect('dual-rumble', {
        startDelay: 0,
        duration: durationMs,
        weakMagnitude: weak,
        strongMagnitude: strong
      }).catch(() => {});
    }
  }
}

export const inputManager = new InputManager();
