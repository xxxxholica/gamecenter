// ハブ用のアケコン(Gamepad API 標準マッピング) + キーボード入力。
// アーケード筐体のキーボードエンコーダ(レバー→矢印キー、ボタン→Enter等)でもそのまま操作できるよう両対応にしている。

// 決定に使うボタン: 攻撃ボタン(0〜7)と START(9)。SELECT(8) はゲーム中の「長押しでホームへ戻る」専用なので含めない。
const CONFIRM_BUTTONS = [0, 1, 2, 3, 4, 5, 6, 7, 9];
const AXIS_THRESHOLD = 0.5;
const REPEAT_DELAY_MS = 400;
const REPEAT_INTERVAL_MS = 150;

export interface ArcadeInputHandlers {
  // アケコンが初めて認識された(ブラウザはボタン/レバー操作があるまでゲームパッドを公開しない)
  onActivate(): void;
  onMove(dx: number, dy: number): void;
  // 決定ボタンを押した瞬間(押下演出用)
  onConfirmDown(): void;
  // 決定ボタンを離した瞬間。ボタンを押したまま遷移すると、遷移先のゲームがその押下を拾って
  // タイトルを即スキップしてしまうため、実際の決定は離したときに行う。
  onConfirmUp(): void;
}

interface Direction {
  dx: number;
  dy: number;
}

function readDirection(pad: Gamepad): Direction {
  let dx = 0;
  let dy = 0;
  const ax = pad.axes[0] ?? 0;
  const ay = pad.axes[1] ?? 0;
  if (pad.buttons[14]?.pressed || ax < -AXIS_THRESHOLD) dx = -1;
  if (pad.buttons[15]?.pressed || ax > AXIS_THRESHOLD) dx = 1;
  if (pad.buttons[12]?.pressed || ay < -AXIS_THRESHOLD) dy = -1;
  if (pad.buttons[13]?.pressed || ay > AXIS_THRESHOLD) dy = 1;
  // 斜め入力は横を優先する(カルーセルの左右送りが主操作のため)
  if (dx !== 0) dy = 0;
  return { dx, dy };
}

function isConfirmHeld(pad: Gamepad): boolean {
  return CONFIRM_BUTTONS.some((i) => pad.buttons[i]?.pressed);
}

export function createArcadeInput(handlers: ArcadeInputHandlers): void {
  // 前のページ(ゲーム)から押しっぱなしのボタン・レバーを新しい操作と誤認しないよう、
  // パッドを初めて認識したフレームの状態は「押されたまま」として扱い、一度離すまで無視する。
  const seenPads = new Set<number>();
  let prevDir: Direction = { dx: 0, dy: 0 };
  let nextRepeatAt = 0;
  let confirmHeld = false;
  let confirmArmed = false;
  let keyConfirmArmed = false;

  // bfcache から戻ったときは前回の押下状態を引き継がない
  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    seenPads.clear();
    confirmArmed = false;
    keyConfirmArmed = false;
  });

  const poll = (now: number) => {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let dir: Direction = { dx: 0, dy: 0 };
    let held = false;
    let newlySeen = false;

    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      if (!seenPads.has(pad.index)) {
        seenPads.add(pad.index);
        newlySeen = true;
      }
      const d = readDirection(pad);
      if (dir.dx === 0 && dir.dy === 0) dir = d;
      if (isConfirmHeld(pad)) held = true;
    }

    if (newlySeen) {
      handlers.onActivate();
      prevDir = dir;
      confirmHeld = held;
      nextRepeatAt = Infinity;
      requestAnimationFrame(poll);
      return;
    }

    const neutral = dir.dx === 0 && dir.dy === 0;
    const changed = dir.dx !== prevDir.dx || dir.dy !== prevDir.dy;
    if (!neutral && changed) {
      handlers.onMove(dir.dx, dir.dy);
      nextRepeatAt = now + REPEAT_DELAY_MS;
    } else if (!neutral && now >= nextRepeatAt) {
      handlers.onMove(dir.dx, dir.dy);
      nextRepeatAt = now + REPEAT_INTERVAL_MS;
    }
    prevDir = dir;

    if (held && !confirmHeld) {
      confirmArmed = true;
      handlers.onConfirmDown();
    } else if (!held && confirmHeld && confirmArmed) {
      confirmArmed = false;
      handlers.onConfirmUp();
    }
    confirmHeld = held;

    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);

  // ===== キーボード(キーボードエンコーダ経由のアケコンを含む) =====
  const KEY_DIRECTIONS: Record<string, Direction> = {
    ArrowLeft: { dx: -1, dy: 0 },
    ArrowRight: { dx: 1, dy: 0 },
    ArrowUp: { dx: 0, dy: -1 },
    ArrowDown: { dx: 0, dy: 1 },
  };
  const CONFIRM_KEYS = ['Enter', 'Space'];

  // リンクやボタンにフォーカスがあるときの Enter/Space はブラウザ標準の動作に任せる
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && target.closest('a, button') !== null;

  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const dir = KEY_DIRECTIONS[e.key];
    if (dir) {
      e.preventDefault();
      handlers.onMove(dir.dx, dir.dy);
      return;
    }
    if (CONFIRM_KEYS.includes(e.code) && !isInteractiveTarget(e.target)) {
      e.preventDefault();
      if (!e.repeat) {
        keyConfirmArmed = true;
        handlers.onConfirmDown();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (CONFIRM_KEYS.includes(e.code) && keyConfirmArmed) {
      keyConfirmArmed = false;
      handlers.onConfirmUp();
    }
  });
}
