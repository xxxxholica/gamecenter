// ===========================================================
//  入力（キーボード + Gamepad API / アーケードコントローラー）
// ===========================================================
import type { ControlState } from './game/player.ts';

export interface FrameInput extends ControlState {
  start: boolean; // 決定 / スタート（押した瞬間）
  anyPressed: boolean;
  /** ゲームパッド（レバー・十字キー）だけの方向。メニューの選択移動に使う（キーボードは keydown 側で拾う） */
  padDx: number;
  padDy: number;
}

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const ACTION = ['Space', 'KeyJ', 'KeyZ', 'KeyK', 'KeyX'];
const START = ['Enter', 'NumpadEnter'];

export class Input {
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private prevPad = { action: false, start: false };
  /** 横入力の優先（後から押した方） */
  private lastHorizontal = 0;

  constructor() {
    window.addEventListener('keydown', (e) => {
      if ([...LEFT, ...RIGHT, ...UP, ...DOWN, ...ACTION].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
      if (LEFT.includes(e.code)) this.lastHorizontal = -1;
      if (RIGHT.includes(e.code)) this.lastHorizontal = 1;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private any(codes: string[]) {
    return codes.some((c) => this.keys.has(c));
  }
  private hit(codes: string[]) {
    return codes.some((c) => this.pressed.has(c));
  }

  poll(): FrameInput {
    const l = this.any(LEFT);
    const r = this.any(RIGHT);
    let dx = l && r ? this.lastHorizontal : l ? -1 : r ? 1 : 0;
    let dy = this.any(UP) ? 1 : this.any(DOWN) ? -1 : 0;
    let dig = this.any(ACTION);
    let digPressed = this.hit(ACTION);
    let start = this.hit(START) || this.hit(ACTION);
    let anyPressed = this.pressed.size > 0;

    // ---- ゲームパッド / アケコン ----
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let padAction = false, padStart = false;
    let padDx = 0, padDy = 0;
    for (const p of pads) {
      if (!p) continue;
      const b = (i: number) => !!p.buttons[i]?.pressed;
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (b(14) || ax < -0.5) { dx = -1; padDx = -1; }
      if (b(15) || ax > 0.5) { dx = 1; padDx = 1; }
      if (b(12) || ay < -0.5) { dy = 1; padDy = 1; }
      if (b(13) || ay > 0.5) { dy = -1; padDy = -1; }
      if (b(0) || b(1) || b(2) || b(3) || b(5) || b(7)) padAction = true;
      if (b(9)) padStart = true;
    }
    if (padAction) {
      dig = true;
      if (!this.prevPad.action) { digPressed = true; start = true; anyPressed = true; }
    }
    if (padStart && !this.prevPad.start) { start = true; anyPressed = true; }

    // SELECT(button 8) 長押しでホームへ戻る処理は共通の installHomeReturn()（main.ts）が担当
    this.prevPad = { action: padAction, start: padStart };
    this.pressed.clear();
    return { dx, dy, dig, digPressed, start, anyPressed, padDx, padDy };
  }
}
