export interface PlayerInputState {
  moveX: number; // -1 to 1 (画面基準の左右)
  moveZ: number; // -1 to 1 (画面基準の奥/手前)
  isMoving: boolean;
  strikePressed: boolean; // 打撃（押した瞬間）。ちょん押しで張り手
  strike: boolean; // 打撃（押している間）
  strikeReleased: boolean; // 打撃（離した瞬間）。長押しならぶちかまし発動
  grabPressed: boolean; // つかみ（押した瞬間）
}

/** 1人分のキー割り当て */
interface KeyBinding {
  left: string;
  right: string;
  up: string;
  down: string;
  strike: string[];
  grab: string[];
}

const P1_KEYS: KeyBinding = {
  left: 'KeyA',
  right: 'KeyD',
  up: 'KeyW',
  down: 'KeyS',
  strike: ['KeyJ', 'Space'],
  grab: ['KeyK', 'KeyE', 'KeyU'],
};

const P2_KEYS: KeyBinding = {
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  strike: ['Numpad1', 'KeyB', 'Comma'],
  grab: ['Numpad2', 'KeyN', 'Period'],
};

// ゲームパッド: 打撃は A / X、つかみは B / Y
const PAD_STRIKE = [0, 2];
const PAD_GRAB = [1, 3];

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private keysReleased: Set<string> = new Set();

  // ゲームパッド前フレーム状態(プレイヤーごと)
  private prevPad: [{ strike: boolean; grab: boolean }, { strike: boolean; grab: boolean }] = [
    { strike: false, grab: false },
    { strike: false, grab: false },
  ];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    });
  }

  /**
   * 毎フレーム末尾で呼び出して、単発キー入力バッファをクリア
   */
  public update() {
    this.keysPressed.clear();
    this.keysReleased.clear();
  }

  private anyDown(codes: string[]): boolean {
    return codes.some((c) => this.keysDown.has(c));
  }
  private anyPressed(codes: string[]): boolean {
    return codes.some((c) => this.keysPressed.has(c));
  }
  private anyReleased(codes: string[]): boolean {
    return codes.some((c) => this.keysReleased.has(c));
  }

  private readPlayer(keys: KeyBinding, pad: Gamepad | null, slot: 0 | 1): PlayerInputState {
    let moveX = 0;
    let moveZ = 0;
    if (this.keysDown.has(keys.left)) moveX -= 1;
    if (this.keysDown.has(keys.right)) moveX += 1;
    if (this.keysDown.has(keys.up)) moveZ -= 1;
    if (this.keysDown.has(keys.down)) moveZ += 1;

    let strike = this.anyDown(keys.strike);
    let strikePressed = this.anyPressed(keys.strike);
    let strikeReleased = this.anyReleased(keys.strike);
    let grabPressed = this.anyPressed(keys.grab);

    if (pad) {
      // スティック入力（デッドゾーン0.2）と十字キー(12:上 13:下 14:左 15:右)
      const deadZone = 0.2;
      let padX = pad.axes[0] || 0;
      let padZ = pad.axes[1] || 0;
      if (pad.buttons[14]?.pressed) padX = -1;
      if (pad.buttons[15]?.pressed) padX = 1;
      if (pad.buttons[12]?.pressed) padZ = -1;
      if (pad.buttons[13]?.pressed) padZ = 1;
      if (Math.abs(padX) > deadZone) moveX = padX;
      if (Math.abs(padZ) > deadZone) moveZ = padZ;

      const padStrike = PAD_STRIKE.some((i) => !!pad.buttons[i]?.pressed);
      const padGrab = PAD_GRAB.some((i) => !!pad.buttons[i]?.pressed);
      const prev = this.prevPad[slot];
      if (padStrike && !prev.strike) strikePressed = true;
      if (!padStrike && prev.strike) strikeReleased = true;
      if (padStrike) strike = true;
      if (padGrab && !prev.grab) grabPressed = true;
      prev.strike = padStrike;
      prev.grab = padGrab;
    }

    // 8方向の正規化
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    return { moveX, moveZ, isMoving: len > 0.1, strikePressed, strike, strikeReleased, grabPressed };
  }

  private activePads(): Gamepad[] {
    return (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter(
      (p): p is Gamepad => !!p && p.connected
    );
  }

  /**
   * プレイヤー1の入力状態を取得（キーボード または ゲームパッド0）
   */
  public getPlayer1Input(): PlayerInputState {
    return this.readPlayer(P1_KEYS, this.activePads()[0] ?? null, 0);
  }

  /**
   * プレイヤー2の入力取得（キーボード矢印キー、または2台目のゲームパッド）
   */
  public getPlayer2Input(): PlayerInputState {
    const pads = this.activePads();
    return this.readPlayer(P2_KEYS, pads.length >= 2 ? pads[1] : null, 1);
  }

  /**
   * ゲームパッドが接続されているか確認
   */
  public isGamepadConnected(): boolean {
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    return !!gamepads[0];
  }

  /**
   * スタートボタン（タイトル画面での決定・開始）
   */
  public isStartTriggered(): boolean {
    if (
      this.keysPressed.has('Enter') ||
      this.keysPressed.has('Space') ||
      this.keysPressed.has('KeyJ') ||
      this.keysPressed.has('KeyZ')
    ) {
      return true;
    }

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = gamepads[0];
    if (pad) {
      // START(9), A(0), または XBOX START
      if (pad.buttons[9]?.pressed || pad.buttons[0]?.pressed) {
        return true;
      }
    }
    return false;
  }

  /** このフレームに押されたキーか(押した瞬間だけ true) */
  public isKeyTriggered(...codes: string[]): boolean {
    return codes.some((c) => this.keysPressed.has(c));
  }

  /**
   * バックボタン（タイトルに戻る / ESC）
   */
  public isBackTriggered(): boolean {
    if (this.keysPressed.has('Escape')) return true;

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = gamepads[0];
    if (pad) {
      // SELECT(8)
      if (pad.buttons[8]?.pressed) {
        return true;
      }
    }
    return false;
  }
}
