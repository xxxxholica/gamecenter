import { KeyboardTracker } from '../../../../shared/keyboardTracker';
import { readGamepads } from '../../../../shared/gamepadFrame';

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
  strike: ['Space'],
  grab: ['KeyK'],
};

// ゲームパッド: 打撃は A / X、つかみは B / Y
const PAD_STRIKE = [0, 2];
const PAD_GRAB = [1, 3];

export class InputManager {
  private keyboard = new KeyboardTracker({ trackEdges: true, trackReleased: true });
  private keysDown: Set<string> = this.keyboard.down;
  private keysPressed: Set<string> = this.keyboard.pressed;
  private keysReleased: Set<string> = this.keyboard.released;

  // ゲームパッド前フレーム状態(プレイヤーごと)
  private prevPad: [{ strike: boolean; grab: boolean }, { strike: boolean; grab: boolean }] = [
    { strike: false, grab: false },
    { strike: false, grab: false },
  ];

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
    return Array.from(readGamepads()).filter(
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
   * ゲームパッドが接続されているか確認
   */
  public isGamepadConnected(): boolean {
    const gamepads = readGamepads();
    return !!gamepads[0];
  }

  /** このフレームに押されたキーか(押した瞬間だけ true) */
  public isKeyTriggered(...codes: string[]): boolean {
    return codes.some((c) => this.keysPressed.has(c));
  }

}
