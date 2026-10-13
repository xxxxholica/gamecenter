import { buttonIconHtml } from '../../../../shared/arcadeGuide';

/** 選択画面のボタンの中身: 押すボタン/キーのガイド(結果・ポーズ画面と同じ小さなアイコン) + 文言。文言は .btn-label だけを書き換える。 */
export const btnHtml = (label: string, indices: number[], keyLabel: string): string =>
  `<span class="btn-guide">${buttonIconHtml(indices, keyLabel)}</span><span class="btn-label">${label}</span>`;

export const setBtnLabel = (btn: HTMLElement | null, label: string): void => {
  const el = btn?.querySelector('.btn-label');
  if (el) el.textContent = label;
  else if (btn) btn.textContent = label;
};
