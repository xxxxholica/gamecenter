// 毎フレーム呼ばれる HUD 更新向けの DOM 書き込みヘルパー。
// 値が変わっていないときは DOM に触れない(textContent の再代入は子ノードの作り直しになる)。

/** textContent を、前回と違うときだけ書き換える。 */
export function setText(el: Element | null | undefined, value: string): void {
  if (el && el.textContent !== value) el.textContent = value;
}

/** style.width を、前回と違うときだけ書き換える。 */
export function setWidth(el: HTMLElement | null | undefined, value: string): void {
  if (el && el.style.width !== value) el.style.width = value;
}

/** style.display を、現在値と違うときだけ書き換える。 */
export function setDisplay(el: HTMLElement | null | undefined, value: string): void {
  if (el && el.style.display !== value) el.style.display = value;
}
