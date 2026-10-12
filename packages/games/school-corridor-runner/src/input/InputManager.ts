import { GameInputState } from '../types';
import { MenuNav } from '../../../../shared/arcadeMenuNav';
import { KeyboardTracker } from '../../../../shared/keyboardTracker';
import { readGamepads } from '../../../../shared/gamepadFrame';

export class InputManager {
  private lastInputTime: number = Date.now();

  // キーボード状態
  private menuNav = new MenuNav();
  private keyboard = new KeyboardTracker({
    trackEdges: true,
    // スペースキーや矢印キー、Enterキーでのスクロール・既定動作防止
    preventDefaultKeys: ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyS', 'KeyA', 'KeyD'],
    onKeyDown: (e) => {
      this.lastInputTime = Date.now();
      this.menuNav.pushKey(e);
    },
    // 押下中のキーを全て離した扱いにする(次の keydown / repeat が新規押下として届く)
    onBlur: () => this.menuNav.clear(),
  });
  private keysDown: Set<string> = this.keyboard.down;
  private keysPressedThisFrame: Set<string> = this.keyboard.pressed;

  // ゲームパッド軸の前回状態（エッジ検出用）
  private lastAxis0: number = 0;
  private lastAxis1: number = 0;
  private lastButtons: boolean[] = [];

  // 投擲攻撃のクールダウンタイマー（手裏剣 / 辞書ボム共通）
  private attackCooldown: number = 0;
  private readonly ATTACK_INTERVAL: number = 0.16; // 秒

  /**
   * 毎フレームの更新処理。入力状態をパースして返す。
   * dt: 前フレームからの経過秒数
   */
  public update(dt: number): GameInputState {
    this.attackCooldown -= dt;

    const input: GameInputState = {
      laneLeft: false,
      laneRight: false,
      jump: false,
      slide: false,
      attack: false,
      shootShuriken: false,
      throwBomb: false,
      startOrRetry: false,
      anyKey: false,
      menuNav: [],
    };

    // 1. キーボード判定
    // レーン移動（ワンショット）
    if (
      this.keysPressedThisFrame.has('KeyA') ||
      this.keysPressedThisFrame.has('ArrowLeft')
    ) {
      input.laneLeft = true;
    }
    if (
      this.keysPressedThisFrame.has('KeyD') ||
      this.keysPressedThisFrame.has('ArrowRight')
    ) {
      input.laneRight = true;
    }

    // ジャンプ（ワンショット: W または 矢印上）
    if (
      this.keysPressedThisFrame.has('KeyW') ||
      this.keysPressedThisFrame.has('ArrowUp')
    ) {
      input.jump = true;
    }

    // スライディング（押下中ホールド: S または 矢印下）
    if (
      this.keysDown.has('KeyS') ||
      this.keysDown.has('ArrowDown')
    ) {
      input.slide = true;
    }

    // 統合投擲攻撃（Enterキーメイン、および互換キー Space / J / K / Z / X）
    const isAttackJustPressed =
      this.keysPressedThisFrame.has('Enter') ||
      this.keysPressedThisFrame.has('Space') ||
      this.keysPressedThisFrame.has('KeyJ') ||
      this.keysPressedThisFrame.has('KeyK') ||
      this.keysPressedThisFrame.has('KeyZ') ||
      this.keysPressedThisFrame.has('KeyX');

    const isAttackHolding =
      this.keysDown.has('Enter') ||
      this.keysDown.has('Space') ||
      this.keysDown.has('KeyJ') ||
      this.keysDown.has('KeyK') ||
      this.keysDown.has('KeyZ') ||
      this.keysDown.has('KeyX');

    if (isAttackJustPressed || (isAttackHolding && this.attackCooldown <= 0)) {
      input.attack = true;
      input.shootShuriken = true;
      input.throwBomb = true;
      this.attackCooldown = this.ATTACK_INTERVAL;
    }

    // スタート / リトライ / 確定
    if (
      this.keysPressedThisFrame.has('Enter') ||
      this.keysPressedThisFrame.has('Space') ||
      this.keysPressedThisFrame.has('KeyR')
    ) {
      input.startOrRetry = true;
    }

    if (this.keysPressedThisFrame.has('Backspace')) {
      input.cancel = true;
    }

    if (this.keysPressedThisFrame.size > 0) {
      input.anyKey = true;
      this.lastInputTime = Date.now();
    }

    // 2. HTML5 Gamepad API 優先判定（接続されていればオーバーライド/合成）
    const gamepads = readGamepads();
    let activePad: Gamepad | null = null;
    for (let i = 0; i < gamepads.length; i++) {
      if (gamepads[i]) {
        activePad = gamepads[i];
        break;
      }
    }

    let padNavX = 0;
    let padNavY = 0;
    if (activePad) {
      const axes = activePad.axes;
      const buttons = activePad.buttons;

      const threshold = 0.5;
      const axis0 = axes[0] ?? 0;
      const axis1 = axes[1] ?? 0;
      padNavX = axis0;
      padNavY = axis1;

      // 十字キー
      const dpadUp = buttons[12]?.pressed ?? false;
      const dpadDown = buttons[13]?.pressed ?? false;
      const dpadLeft = buttons[14]?.pressed ?? false;
      const dpadRight = buttons[15]?.pressed ?? false;
      if (dpadUp) padNavY = -1;
      if (dpadDown) padNavY = 1;
      if (dpadLeft) padNavX = -1;
      if (dpadRight) padNavX = 1;

      // 軸0 (左右レバー) エッジ検出
      const justMovedLeft =
        (axis0 < -threshold && this.lastAxis0 >= -threshold) ||
        (dpadLeft && !(this.lastButtons[14] ?? false));
      if (justMovedLeft) {
        input.laneLeft = true;
        input.anyKey = true;
        this.lastInputTime = Date.now();
      }

      const justMovedRight =
        (axis0 > threshold && this.lastAxis0 <= threshold) ||
        (dpadRight && !(this.lastButtons[15] ?? false));
      if (justMovedRight) {
        input.laneRight = true;
        input.anyKey = true;
        this.lastInputTime = Date.now();
      }

      this.lastAxis0 = axis0;

      // 軸1 (レバー上) または 十字キー上: ジャンプ（ワンショット判定）
      const isUp = axis1 < -threshold || dpadUp;
      const wasUp = this.lastAxis1 < -threshold || (this.lastButtons[12] ?? false);
      if (isUp && !wasUp) {
        input.jump = true;
        input.anyKey = true;
        this.lastInputTime = Date.now();
      }

      // 軸1 (レバー下) または 十字キー下: スライディング（ホールド判定）
      if (axis1 > threshold || dpadDown) {
        input.slide = true;
        this.lastInputTime = Date.now();
      }

      this.lastAxis1 = axis1;

      // ボタン0, 1, 2, 3 (アケコン ボタン1〜4): 統合投擲攻撃（手裏剣・辞書ボムランダム）
      const btn0Pressed = buttons[0]?.pressed ?? false;
      const btn1Pressed = buttons[1]?.pressed ?? false;
      const btn2Pressed = buttons[2]?.pressed ?? false;
      const btn3Pressed = buttons[3]?.pressed ?? false;
      const isAttackPadDown = btn0Pressed || btn1Pressed || btn2Pressed || btn3Pressed;
      const wasAttackPadDown =
        (this.lastButtons[0] ?? false) ||
        (this.lastButtons[1] ?? false) ||
        (this.lastButtons[2] ?? false) ||
        (this.lastButtons[3] ?? false);

      const isAttackPadJustPressed = isAttackPadDown && !wasAttackPadDown;

      if (isAttackPadJustPressed || (isAttackPadDown && this.attackCooldown <= 0)) {
        input.attack = true;
        input.shootShuriken = true;
        input.throwBomb = true;
        input.anyKey = true;
        this.attackCooldown = this.ATTACK_INTERVAL;
        this.lastInputTime = Date.now();
      }

      // 確定: ボタン0 (アケコン Aボタン) の新規押下
      const wasBtn0 = this.lastButtons[0] ?? false;
      if (btn0Pressed && !wasBtn0) {
        input.startOrRetry = true;
        input.anyKey = true;
        this.lastInputTime = Date.now();
      }

      // 戻る / キャンセル: ボタン1 (アケコン Bボタン) の新規押下
      const wasBtn1 = this.lastButtons[1] ?? false;
      if (btn1Pressed && !wasBtn1) {
        input.cancel = true;
        input.anyKey = true;
        this.lastInputTime = Date.now();
      }

      this.lastButtons = buttons.map(b => b.pressed);
    }

    this.menuNav.updatePad(padNavX, padNavY);
    input.menuNav = this.menuNav.take();

    // 今フレームの押下フラグをクリア
    this.keysPressedThisFrame.clear();

    return input;
  }

  /**
   * 最後の入力から経過した時間（秒）を取得
   */
  public getIdleTimeSeconds(): number {
    return (Date.now() - this.lastInputTime) / 1000;
  }

  /**
   * 入力タイムスタンプを強制リセット
   */
  public resetIdleTimer(): void {
    this.lastInputTime = Date.now();
  }

  public destroy(): void {
    this.keyboard.dispose();
  }
}
