// アケコン(Gamepad API 標準マッピング)の入力ヘルパー。
// レバー(十字キー12-15 / 左スティック)とボタンを読み取り、「今押された瞬間」だけを返すエッジ検出を提供する。

const STICK_THRESHOLD = 0.5;

export interface PadDirs {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface PadSnapshot extends PadDirs {
  buttons: boolean[];
}

const EMPTY: PadSnapshot = { up: false, down: false, left: false, right: false, buttons: [] };

/** 接続中の最初のゲームパッドの現在状態。未接続なら全て未押下。 */
export function readPad(): PadSnapshot {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    const b = pad.buttons;
    const a = pad.axes;
    return {
      up: !!b[12]?.pressed || (a[1] ?? 0) < -STICK_THRESHOLD,
      down: !!b[13]?.pressed || (a[1] ?? 0) > STICK_THRESHOLD,
      left: !!b[14]?.pressed || (a[0] ?? 0) < -STICK_THRESHOLD,
      right: !!b[15]?.pressed || (a[0] ?? 0) > STICK_THRESHOLD,
      buttons: b.map((btn) => btn.pressed),
    };
  }
  return EMPTY;
}

export interface PadPress extends PadDirs {
  /** 今回押された(前回は離れていた)ボタン番号 */
  buttons: Set<number>;
  /** 指定ボタンのいずれかが今押されたか */
  any: (...indices: number[]) => boolean;
}

/**
 * 前回のポーリングとの差分から「押された瞬間」を返す。
 * 画面遷移直後に、直前の画面で押していたボタンが決定として二重に入らないよう、
 * 画面を表示するたびに reset() で現在の押下状態を基準にすること。
 */
export class PadEdge {
  private prev: PadSnapshot = readPad();

  public reset(): void {
    this.prev = readPad();
  }

  public poll(): PadPress {
    const cur = readPad();
    const buttons = new Set<number>();
    cur.buttons.forEach((down, i) => {
      if (down && !this.prev.buttons[i]) buttons.add(i);
    });
    const press: PadPress = {
      up: cur.up && !this.prev.up,
      down: cur.down && !this.prev.down,
      left: cur.left && !this.prev.left,
      right: cur.right && !this.prev.right,
      buttons,
      any: (...indices) => indices.some((i) => buttons.has(i)),
    };
    this.prev = cur;
    return press;
  }
}

/** 表示中だけ毎フレーム onPress を呼ぶポーリングループ。返り値の関数で停止する。 */
export function startPadLoop(edge: PadEdge, onPress: (p: PadPress) => void): () => void {
  edge.reset();
  let id = 0;
  let stopped = false;
  const tick = () => {
    onPress(edge.poll());
    // onPress の中で stop された場合は再スケジュールしない
    if (!stopped) id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(id);
  };
}
