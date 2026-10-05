export interface PlayerInputState {
  moveX: number; // -1 to 1 (画面基準の左右)
  moveZ: number; // -1 to 1 (画面基準の奥/手前)
  isMoving: boolean;
  dashTriggered: boolean; // すり足（ダブルタップまたはダッシュ入力）
  buttonAPressed: boolean; // 張り手（押した瞬間）
  buttonA: boolean; // 張り手（長押し）
  buttonBPressed: boolean; // ぶちかまし（押した瞬間）
  buttonB: boolean; // ぶちかまし（長押し・タメ中）
  buttonBReleased: boolean; // ぶちかまし（離した瞬間・発動）
  buttonCPressed: boolean; // 四股（押した瞬間）
  buttonGrabPressed: boolean; // つかみ（押した瞬間）
  buttonGrab: boolean; // つかみ（長押し）
  guard: boolean; // ガード（長押し）
}

export class InputManager {
  private keysDown: Set<string> = new Set();
  private keysPressed: Set<string> = new Set();
  private keysReleased: Set<string> = new Set();

  // ダブルタップ（すり足）判定用
  private p1LastTapDir: { x: number; z: number; time: number } = { x: 0, z: 0, time: 0 };
  private p2LastTapDir: { x: number; z: number; time: number } = { x: 0, z: 0, time: 0 };
  private doubleTapThresholdMs: number = 280;
  private p1DashQueued: boolean = false;
  private p2DashQueued: boolean = false;

  // ゲームパッド レバーのダブルタップ判定用
  private p1PrevLeverDir: { x: number; z: number } = { x: 0, z: 0 };
  private p1LastLeverTapTime: number = 0;
  private p1LastLeverDir: { x: number; z: number } = { x: 0, z: 0 };

  private p2PrevLeverDir: { x: number; z: number } = { x: 0, z: 0 };
  private p2LastLeverTapTime: number = 0;
  private p2LastLeverDir: { x: number; z: number } = { x: 0, z: 0 };

  // ゲームパッド前フレーム状態
  private prevGamepadButtons: boolean[] = [];
  private prevP2GamepadButtons: boolean[] = [];

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.keysDown.has(e.code)) {
        this.keysPressed.add(e.code);
        this.check1PDoubleTap(e.code);
        this.check2PDoubleTap(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
      this.keysReleased.add(e.code);
    });
  }

  // 1P キーボード（WASD）ダブルタップ判定
  private check1PDoubleTap(code: string) {
    let dx = 0;
    let dz = 0;
    if (code === 'KeyW') dz = -1;
    if (code === 'KeyS') dz = 1;
    if (code === 'KeyA') dx = -1;
    if (code === 'KeyD') dx = 1;

    if (dx !== 0 || dz !== 0) {
      const now = performance.now();
      const dt = now - this.p1LastTapDir.time;
      if (
        dt < this.doubleTapThresholdMs &&
        dt > 40 &&
        this.p1LastTapDir.x === dx &&
        this.p1LastTapDir.z === dz
      ) {
        this.p1DashQueued = true;
      }
      this.p1LastTapDir = { x: dx, z: dz, time: now };
    }
  }

  // 2P キーボード（矢印キー）ダブルタップ判定
  private check2PDoubleTap(code: string) {
    let dx = 0;
    let dz = 0;
    if (code === 'ArrowUp') dz = -1;
    if (code === 'ArrowDown') dz = 1;
    if (code === 'ArrowLeft') dx = -1;
    if (code === 'ArrowRight') dx = 1;

    if (dx !== 0 || dz !== 0) {
      const now = performance.now();
      const dt = now - this.p2LastTapDir.time;
      if (
        dt < this.doubleTapThresholdMs &&
        dt > 40 &&
        this.p2LastTapDir.x === dx &&
        this.p2LastTapDir.z === dz
      ) {
        this.p2DashQueued = true;
      }
      this.p2LastTapDir = { x: dx, z: dz, time: now };
    }
  }

  /**
   * 毎フレーム開始時に呼び出して、単発キー入力バッファをクリア
   */
  public update() {
    this.keysPressed.clear();
    this.keysReleased.clear();
  }

  /**
   * プレイヤー1の入力状態を取得（キーボード または ゲームパッド0）
   */
  public getPlayer1Input(): PlayerInputState {
    let moveX = 0;
    let moveZ = 0;

    // 1P キーボード入力（WASD 専用）
    if (this.keysDown.has('KeyA')) moveX -= 1;
    if (this.keysDown.has('KeyD')) moveX += 1;
    if (this.keysDown.has('KeyW')) moveZ -= 1;
    if (this.keysDown.has('KeyS')) moveZ += 1;

    let dashTriggered = this.p1DashQueued;
    this.p1DashQueued = false;

    // ShiftLeftキーですり足ダッシュ
    if (this.keysDown.has('ShiftLeft')) {
      dashTriggered = true;
    }

    let buttonA = this.keysDown.has('KeyJ');
    let buttonAPressed = this.keysPressed.has('KeyJ');

    let buttonB = this.keysDown.has('KeyK');
    let buttonBPressed = this.keysPressed.has('KeyK');
    let buttonBReleased = this.keysReleased.has('KeyK');

    let buttonCPressed = this.keysPressed.has('KeyL');

    // つかみ（KeyE または KeyU）
    let buttonGrab = this.keysDown.has('KeyE') || this.keysDown.has('KeyU');
    let buttonGrabPressed = this.keysPressed.has('KeyE') || this.keysPressed.has('KeyU');

    // ガード（KeyI または Space）
    let guard = this.keysDown.has('KeyI') || this.keysDown.has('Space');

    // ゲームパッド（アケコン含む）のチェック（1台目のアクティブなゲームパッド）
    const activePads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : [])
      .filter((p): p is Gamepad => !!p && p.connected);
    const pad = activePads[0];
    if (pad) {
      // スティック入力（デッドゾーン0.2）
      const deadZone = 0.2;
      let padX = pad.axes[0] || 0;
      let padZ = pad.axes[1] || 0;

      // D-Pad / レバー対応 (ボタン12:上, 13:下, 14:左, 15:右)
      if (pad.buttons[14]?.pressed) padX = -1;
      if (pad.buttons[15]?.pressed) padX = 1;
      if (pad.buttons[12]?.pressed) padZ = -1;
      if (pad.buttons[13]?.pressed) padZ = 1;

      if (Math.abs(padX) > deadZone) moveX = padX;
      if (Math.abs(padZ) > deadZone) moveZ = padZ;

      // レバーのダブルタップ判定（同方向に素早く2回倒してすり足ダッシュ）
      let leverDx = 0;
      let leverDz = 0;
      if (padX > 0.45) leverDx = 1;
      else if (padX < -0.45) leverDx = -1;
      if (padZ > 0.45) leverDz = 1;
      else if (padZ < -0.45) leverDz = -1;

      if (leverDx !== 0 || leverDz !== 0) {
        if (this.p1PrevLeverDir.x === 0 && this.p1PrevLeverDir.z === 0) {
          const now = performance.now();
          const dt = now - this.p1LastLeverTapTime;
          if (
            dt < this.doubleTapThresholdMs &&
            dt > 40 &&
            this.p1LastLeverDir.x === leverDx &&
            this.p1LastLeverDir.z === leverDz
          ) {
            dashTriggered = true;
          }
          this.p1LastLeverDir = { x: leverDx, z: leverDz };
          this.p1LastLeverTapTime = now;
        }
      }
      this.p1PrevLeverDir = { x: leverDx, z: leverDz };

      // ボタン0 (A / 張り手・つかみ打撃)
      const b0 = !!pad.buttons[0]?.pressed;
      if (b0 && !this.prevGamepadButtons[0]) buttonAPressed = true;
      if (b0) buttonA = true;

      // ボタン1 (B / ぶちかまし・上手投げ)
      const b1 = !!pad.buttons[1]?.pressed;
      if (b1 && !this.prevGamepadButtons[1]) buttonBPressed = true;
      if (!b1 && this.prevGamepadButtons[1]) buttonBReleased = true;
      if (b1) buttonB = true;

      // ボタン2 (CまたはX / 四股)
      const b2 = !!pad.buttons[2]?.pressed;
      if (b2 && !this.prevGamepadButtons[2]) buttonCPressed = true;

      // ボタン3 (Y / つかみ) または ボタン4 (L1 / つかみ)
      const b3 = !!pad.buttons[3]?.pressed || !!pad.buttons[4]?.pressed;
      if (b3 && !this.prevGamepadButtons[3]) buttonGrabPressed = true;
      if (b3) buttonGrab = true;

      // ガード: ボタン6 (LT/L2), ボタン7 (RT/R2), または (A+B / B+C 同時押し)
      if (
        pad.buttons[6]?.pressed ||
        pad.buttons[7]?.pressed ||
        (pad.buttons[0]?.pressed && pad.buttons[1]?.pressed) ||
        (pad.buttons[2]?.pressed && pad.buttons[1]?.pressed)
      ) {
        guard = true;
      }

      // ボタン5 (RB/R1) でダッシュ（ホールド対応）
      if (pad.buttons[5]?.pressed) {
        dashTriggered = true;
      }

      // ゲームパッド状態を記録
      this.prevGamepadButtons[0] = b0;
      this.prevGamepadButtons[1] = b1;
      this.prevGamepadButtons[2] = b2;
      this.prevGamepadButtons[3] = b3;
    }

    // 8方向の正規化
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    return {
      moveX,
      moveZ,
      isMoving: len > 0.1,
      dashTriggered,
      buttonAPressed,
      buttonA,
      buttonBPressed,
      buttonB,
      buttonBReleased,
      buttonCPressed,
      buttonGrabPressed,
      buttonGrab,
      guard,
    };
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

  /**
   * プレイヤー2の入力取得（2P対戦用: 2つ目のゲームパッドまたはキーボード矢印キー）
   */
  public getPlayer2Input(): PlayerInputState {
    let moveX = 0;
    let moveZ = 0;

    // 2P キーボード入力（矢印キー専用移動）
    if (this.keysDown.has('ArrowLeft')) moveX -= 1;
    if (this.keysDown.has('ArrowRight')) moveX += 1;
    if (this.keysDown.has('ArrowUp')) moveZ -= 1;
    if (this.keysDown.has('ArrowDown')) moveZ += 1;

    let dashTriggered = this.p2DashQueued;
    this.p2DashQueued = false;

    // ShiftRight または Enterキーでダッシュ
    if (this.keysDown.has('ShiftRight') || this.keysDown.has('Enter') || this.keysDown.has('NumpadEnter')) {
      dashTriggered = true;
    }

    // 2P アクションキー（1PのWASD+JKLと絶対に重複しないキー）
    // 張り手: テンキー1 または Bキー または カンマ(,)
    let buttonA = this.keysDown.has('Numpad1') || this.keysDown.has('KeyB') || this.keysDown.has('Comma');
    let buttonAPressed = this.keysPressed.has('Numpad1') || this.keysPressed.has('KeyB') || this.keysPressed.has('Comma');

    // ぶちかまし: テンキー2 または Nキー または ピリオド(.)
    let buttonB = this.keysDown.has('Numpad2') || this.keysDown.has('KeyN') || this.keysDown.has('Period');
    let buttonBPressed = this.keysPressed.has('Numpad2') || this.keysPressed.has('KeyN') || this.keysPressed.has('Period');
    let buttonBReleased = this.keysReleased.has('Numpad2') || this.keysReleased.has('KeyN') || this.keysReleased.has('Period');

    // 四股: テンキー3 または Mキー または スラッシュ(/)
    let buttonCPressed = this.keysPressed.has('Numpad3') || this.keysPressed.has('KeyM') || this.keysPressed.has('Slash');

    // つかみ: テンキー4 または Oキー または セミコロン(;)
    let buttonGrab = this.keysDown.has('Numpad4') || this.keysDown.has('KeyO') || this.keysDown.has('Semicolon');
    let buttonGrabPressed = this.keysPressed.has('Numpad4') || this.keysPressed.has('KeyO') || this.keysPressed.has('Semicolon');

    // ガード: テンキー0 または Pキー または クォート(') / バックスラッシュ(\)
    let guard =
      this.keysDown.has('Numpad0') ||
      this.keysDown.has('KeyP') ||
      this.keysDown.has('Quote') ||
      this.keysDown.has('Backslash');

    // 2つ目のアクティブなゲームパッドが存在する場合のみ2Pに割り当て（1台のアケコンで2人同時に動かないよう徹底分離）
    const activePads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : [])
      .filter((p): p is Gamepad => !!p && p.connected);

    // 2台以上接続されている場合のみ、2台目（activePads[1]）を2Pコントローラーとして使用
    const pad = activePads.length >= 2 ? activePads[1] : null;
    if (pad) {
      const deadZone = 0.2;
      let padX = pad.axes[0] || 0;
      let padZ = pad.axes[1] || 0;
      if (pad.buttons[14]?.pressed) padX = -1;
      if (pad.buttons[15]?.pressed) padX = 1;
      if (pad.buttons[12]?.pressed) padZ = -1;
      if (pad.buttons[13]?.pressed) padZ = 1;

      if (Math.abs(padX) > deadZone) moveX = padX;
      if (Math.abs(padZ) > deadZone) moveZ = padZ;

      // 2P レバーのダブルタップ判定
      let leverDx = 0;
      let leverDz = 0;
      if (padX > 0.45) leverDx = 1;
      else if (padX < -0.45) leverDx = -1;
      if (padZ > 0.45) leverDz = 1;
      else if (padZ < -0.45) leverDz = -1;

      if (leverDx !== 0 || leverDz !== 0) {
        if (this.p2PrevLeverDir.x === 0 && this.p2PrevLeverDir.z === 0) {
          const now = performance.now();
          const dt = now - this.p2LastLeverTapTime;
          if (
            dt < this.doubleTapThresholdMs &&
            dt > 40 &&
            this.p2LastLeverDir.x === leverDx &&
            this.p2LastLeverDir.z === leverDz
          ) {
            dashTriggered = true;
          }
          this.p2LastLeverDir = { x: leverDx, z: leverDz };
          this.p2LastLeverTapTime = now;
        }
      }
      this.p2PrevLeverDir = { x: leverDx, z: leverDz };

      // 2P ゲームパッドボタン判定（個別履歴管理）
      const b0 = !!pad.buttons[0]?.pressed;
      if (b0 && !this.prevP2GamepadButtons[0]) buttonAPressed = true;
      if (b0) buttonA = true;

      const b1 = !!pad.buttons[1]?.pressed;
      if (b1 && !this.prevP2GamepadButtons[1]) buttonBPressed = true;
      if (!b1 && this.prevP2GamepadButtons[1]) buttonBReleased = true;
      if (b1) buttonB = true;

      const b2 = !!pad.buttons[2]?.pressed;
      if (b2 && !this.prevP2GamepadButtons[2]) buttonCPressed = true;

      const b3 = !!pad.buttons[3]?.pressed || !!pad.buttons[4]?.pressed;
      if (b3 && !this.prevP2GamepadButtons[3]) buttonGrabPressed = true;
      if (b3) buttonGrab = true;

      // ガード: ボタン6 (LT/L2), ボタン7 (RT/R2), または (A+B / B+C 同時押し)
      if (
        pad.buttons[6]?.pressed ||
        pad.buttons[7]?.pressed ||
        (pad.buttons[0]?.pressed && pad.buttons[1]?.pressed) ||
        (pad.buttons[2]?.pressed && pad.buttons[1]?.pressed)
      ) {
        guard = true;
      }
      if (pad.buttons[5]?.pressed) dashTriggered = true;

      this.prevP2GamepadButtons[0] = b0;
      this.prevP2GamepadButtons[1] = b1;
      this.prevP2GamepadButtons[2] = b2;
      this.prevP2GamepadButtons[3] = b3;
    }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX /= len;
      moveZ /= len;
    }

    return {
      moveX,
      moveZ,
      isMoving: len > 0.1,
      dashTriggered,
      buttonAPressed,
      buttonA,
      buttonBPressed,
      buttonB,
      buttonBReleased,
      buttonCPressed,
      buttonGrabPressed,
      buttonGrab,
      guard,
    };
  }
}

