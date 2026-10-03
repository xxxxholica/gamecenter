// 全ゲーム共通: 「無操作で自動実行される」ボタンのカウントダウン表示と、リザルトの自動タイトル復帰。
// 自動で何が起きるかをボタン自身に出す(例: 「タイトルに戻る(30秒)」)。

/** ボタン末尾に「(30秒)」のような括弧付きの残り時間を出す。text が空なら消す。ボタン本来の文言は変えない。 */
export function setButtonSuffix(button: HTMLElement | null, text: string): void {
  if (!button) return;
  let el = button.querySelector<HTMLElement>(':scope > .aa-suffix');
  if (!text) {
    el?.remove();
    return;
  }
  if (el && el.textContent === text) return;
  if (!el) {
    el = document.createElement('span');
    el.className = 'aa-suffix';
    el.style.marginLeft = '0.3em';
    button.appendChild(el);
  }
  el.textContent = text;
}

export function formatSeconds(sec: number): string {
  return `(${Math.max(0, Math.ceil(sec))}秒)`;
}

function isShown(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return false;
  const cs = getComputedStyle(el);
  return cs.display !== 'none' && cs.visibility !== 'hidden';
}

/** ゲームパッドのボタンやスティックが動いているか。 */
function padActive(): boolean {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of pads) {
    if (!pad) continue;
    for (const b of pad.buttons) if (b.pressed) return true;
    for (const v of pad.axes) if (Math.abs(v) > 0.4) return true;
  }
  return false;
}

/**
 * リザルト画面の「タイトルに戻る」ボタンに、無操作で自動的に押される残り時間を出す。
 * 画面に出ている間だけ数え、キー・マウス・アケコンの操作があれば数え直す。名前登録の画面が出ている間は止める。
 * 時間が来たらそのボタンを click() する(通常の操作と同じ経路でタイトルへ戻る)。
 */
export function watchResultAutoReturn(titleButtonIds: string[], seconds = 30): void {
  let last = performance.now();
  const touch = () => {
    last = performance.now();
  };
  for (const ev of ['keydown', 'pointerdown', 'pointermove', 'wheel', 'touchstart']) {
    window.addEventListener(ev, touch, { passive: true });
  }

  window.setInterval(() => {
    const buttons = titleButtonIds.map((id) => document.getElementById(id));
    const shown = buttons.find((el): el is HTMLElement => !!el && isShown(el)) ?? null;
    // 画面に出ていないボタンに残った表示は消す
    for (const el of buttons) if (el && el !== shown) setButtonSuffix(el, '');
    if (!shown) return;
    if (document.querySelector('.ane-overlay') || padActive()) touch();

    const remain = seconds - (performance.now() - last) / 1000;
    if (remain <= 0) {
      setButtonSuffix(shown, '');
      shown.click();
      touch(); // 遷移先で数え直す
    } else {
      setButtonSuffix(shown, formatSeconds(remain));
    }
  }, 250);
}
