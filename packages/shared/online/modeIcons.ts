/**
 * モード選択(ModeSelect)の特徴の行(points)に付けるアイコン。midnight-skyway の ui/icons.ts と同じ描き方で、
 * 色は currentColor(各ゲームの強調色になる)、黒い縁取りで背景に埋もれない。
 */

/** 優勝杯: 勝ち抜き戦 */
export const TROPHY_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M6 2.5H18V4.2H21.4V7.4C21.4 10 19.5 12 17 12.3C16.2 14.3 14.6 15.6 13.2 16V18.6H16.6V21.5H7.4V18.6H10.8V16C9.4 15.6 7.8 14.3 7 12.3C4.5 12 2.6 10 2.6 7.4V4.2H6V2.5ZM6 6.4H4.6V7.4C4.6 8.7 5.4 9.8 6.5 10.2C6.2 9 6 7.7 6 6.4ZM18 6.4C18 7.7 17.8 9 17.5 10.2C18.6 9.8 19.4 8.7 19.4 7.4V6.4H18Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '</svg>';

/** 人: 2人で対戦 */
export const PEOPLE_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 2.2C14.7 2.2 16.6 4.3 16.6 6.9C16.6 9.5 14.7 11.6 12 11.6C9.3 11.6 7.4 9.5 7.4 6.9C7.4 4.3 9.3 2.2 12 2.2ZM3 21.8C3 16.6 6.8 13.2 12 13.2C17.2 13.2 21 16.6 21 21.8H3Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '</svg>';

/** 握りこぶし: 張り手・頭突き・つかみなどの技で戦う */
export const FIST_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M5.5 8.2C5.5 6.9 6.5 6 7.7 6C8.2 6 8.6 6.1 9 6.4C9.3 5.4 10.2 4.7 11.3 4.7C12.1 4.7 12.8 5.1 13.2 5.7C13.6 5.2 14.3 4.9 15 4.9C16.3 4.9 17.3 5.9 17.3 7.2V7.6C17.6 7.5 17.9 7.4 18.2 7.4C19.4 7.4 20.4 8.4 20.4 9.6V13.8C20.4 17.9 17.3 21 13.3 21H11.6C8.2 21 5.5 18.3 5.5 14.9V8.2Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '<path d="M9 6.6V10.6M13.2 5.9V10.4M17.3 7.6V10.6" fill="none" stroke="#05070c" stroke-width="1.8" stroke-linecap="round"/>' +
  '</svg>';

/** 輪(土俵): 最後まで残る */
export const RING_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 2.6C17.2 2.6 21.4 6.8 21.4 12C21.4 17.2 17.2 21.4 12 21.4C6.8 21.4 2.6 17.2 2.6 12C2.6 6.8 6.8 2.6 12 2.6Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '<circle cx="12" cy="12" r="5.6" fill="#05070c"/>' +
  '<circle cx="12" cy="12" r="2" fill="currentColor"/>' +
  '</svg>';

/** 積んだブロック: 高く積む */
export const BLOCKS_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M3 15.2H21V21.5H3V15.2ZM5.5 8.6H18.5V14.9H5.5V8.6ZM8 2.5H16V8.3H8V2.5Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '</svg>';

/** 落ちるブロック: 落とすと負け */
export const DROP_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M7.4 2.5H16.6V10.2H7.4V2.5ZM12 21.8L6.2 14.6H9.8V11.8H14.2V14.6H17.8L12 21.8Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '</svg>';

/** 鉛筆: 出題される問題 */
export const PENCIL_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M16.4 2.6L21.4 7.6L8.6 20.4L2.8 21.2L3.6 15.4L16.4 2.6Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '<path d="M13.8 5.2L18.8 10.2" fill="none" stroke="#05070c" stroke-width="1.8"/>' +
  '</svg>';

/** 角帽: 卒業(必要な単位) */
export const CAP_SOLID_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M12 3L23 8.4L12 13.8L1 8.4L12 3ZM5.6 11.6L12 14.8L18.4 11.6V16.6C18.4 18.6 15.5 20.4 12 20.4C8.5 20.4 5.6 18.6 5.6 16.6V11.6Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '<path d="M21 9.4V15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
  '</svg>';
