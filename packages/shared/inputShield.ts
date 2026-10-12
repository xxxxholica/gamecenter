// 画面全体を覆う、見えない「入力シールド」。ランキングの順位確認中・名前登録の待ち時間に、結果画面のボタンへマウスが届かないようにする。
// キーボード・パッドは各ゲームが「登録待ち」のフラグで止めているが、マウスのクリックはゲームごとに止め方がまちまちで、
// 止めていないゲームでは、登録が出る前に「もう一度」を押せて、次のゲームが始まってしまう。ここで共通に塞ぐ。
// 名前登録のモーダル(.ane-overlay, z-index 99999)は、このシールドより上に出るので、モーダルは操作できる。

/** シールドの z-index。名前登録のモーダル(99999)のすぐ下 */
const SHIELD_Z_INDEX = 99998;
/** シールドを塞ぐ(止める)マウス・タッチの操作 */
const BLOCKED_EVENTS = ['click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'contextmenu'];

export const INPUT_SHIELD_CLASS = 'ane-shield';

/**
 * シールドを出す。返す関数で外す(何度呼んでも安全)。
 * シールドの上へのクリックは、下のボタンに届かないだけでなく、window へ伝わるクリック処理(画面全体のクリックで開始など)にも渡さない。
 */
export function showInputShield(): () => void {
  const shield = document.createElement('div');
  shield.className = INPUT_SHIELD_CLASS;
  shield.style.cssText = `position:fixed;inset:0;z-index:${SHIELD_Z_INDEX};background:transparent;cursor:default;touch-action:none;`;
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  for (const type of BLOCKED_EVENTS) shield.addEventListener(type, swallow);
  document.body.appendChild(shield);
  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    shield.remove();
  };
}
