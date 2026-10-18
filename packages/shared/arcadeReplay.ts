// 操作の記録と再生(決定的リプレイ)。映像ではなく「ゲームの外から入ってくるもの」だけを記録し、再生ではそれを同じ順番で入れ直して、
// ゲーム自身にもう一度同じように動いてもらう。
//
// ゲームの外から入ってくるもの(= 記録するもの):
//   - フレームの時刻(rAF)。performance.now()・Date.now() もフレームの時刻を返す(フレームの中では止まって見える)
//   - 乱数(Math.random)は種から作る。ラウンドの開始ごとに種から作り直す(タイトルのデモなどのずれを持ち込まない)
//   - キー入力・クリック・アケコンの状態(アケコンはフレームの頭で1回読み、そのフレームの間は同じ値を返す)
//   - タイマー(setTimeout / setInterval)が発火した順番
//   - サーバーからの応答(/api/・/online-status。ランキングなど)と、画面の表示・非表示
// 再生では本物の入力・タイマー・通信を止め、記録の順番どおりに入れ直す。ゲームが送るアナリティクス(場面・ラウンド・結果)を
// 照合点として記録しておき、再生で同じものが同じ順に出るかを確かめる(ずれたら、そこから先は記録と違う)。
//
// ゲームの最初の import で読み込む(arcadeReplayBoot.ts)。ゲームのコードより先に差し替えておく必要がある。
// ベンチマーク(?bench=1)・プレビュー(?preview)では何もしない。

import { isBenchEnabled } from './arcadeBenchCore.ts';

export type ReplayMode = 'off' | 'record' | 'replay';

export interface ReplayHeader {
  v: 1;
  id: string;
  game: string;
  seed: string;
  /** 記録を始めた時のフレーム時計(performance.now の値)と、その時の Date.now */
  t0: number;
  e0: number;
  w: number;
  h: number;
  dpr: number;
  ua: string;
  /** ハブの iframe の中で遊んだか(直接開いた時とは、アナリティクスのタイマーの作り方が違う) */
  framed: boolean;
  /** 記録を始めた時の localStorage / sessionStorage(ハイスコア・選んだ難易度などで、始まり方が変わるため) */
  ls: Record<string, string>;
  ss: Record<string, string>;
  /** 記録した時のゲームのコードの版(ビルドした本体のファイル名。中身が変わると名前のハッシュも変わる) */
  build?: string;
  /** 調べる用(localStorage の gc_replay_debug=1): タイマーを作った順番と、その関数の書き出しも記録し、再生で突き合わせる */
  debug?: boolean;
}

/** 記録の1件。数値はフレーム(前のフレームからの経過、1/100ms 単位)。配列は出来事 */
export type ReplayToken = number | (string | number | null)[];

export interface ReplayData {
  header: ReplayHeader;
  tokens: ReplayToken[];
}

/** 再生の状態(管理画面が見る) */
export interface ReplayStatus {
  frame: number;
  frames: number;
  /** 照合点が記録と違った(そこから先は記録どおりではない) */
  diverged: boolean;
  divergeNote?: string;
  done: boolean;
  checkpoints: number;
  /** 記録の開始からの秒 */
  sec: number;
  /** 見る所(seek)まで、画面を隠して早送りしている */
  seeking: boolean;
  /** 記録した時とゲームのコードの版が違う(途中で止まったり、ずれたりすることがある) */
  versionMismatch?: boolean;
}

const UPLOAD_PATH = '/api/replay/chunk';
const UPLOAD_EVERY_MS = 10_000;
const CHUNK_TOKENS = 2500;
/** これより長い・大きい記録は打ち切る(タイトルのまま何時間も置かれた時など) */
const MAX_RECORD_MS = 60 * 60 * 1000;
const MAX_RECORD_CHARS = 8_000_000;

// ---- 元の関数(差し替える前のもの) ----
const g = globalThis as typeof globalThis & { __gcReplay?: ReplayApi };
const realRaf = g.requestAnimationFrame?.bind(g);
const realCancelRaf = g.cancelAnimationFrame?.bind(g);
const realNowFn = typeof performance !== 'undefined' ? performance.now.bind(performance) : () => Date.now();
const realDateNow = Date.now;
const realSetTimeout = g.setTimeout?.bind(g);
const realClearTimeout = g.clearTimeout?.bind(g);
const realSetInterval = g.setInterval?.bind(g);
const realClearInterval = g.clearInterval?.bind(g);
const realFetch = g.fetch?.bind(g);
const realGetGamepads = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads.bind(navigator) : null;

const realRandom = Math.random;
// three.js の id の乱数(viteReplayPlugin.ts で差し替える)が使う、追わない乱数
(globalThis as { __gcUntrackedRandom?: () => number }).__gcUntrackedRandom = realRandom;
/**
 * 音のための乱数(記録・再生で追わない、本物の乱数)。音の鳴らし方は音声の時計や再生の状態で変わり、
 * 記録した時と再生とで乱数を引く回数が変わるので、ゲームの乱数とは分ける。音のコードの中だけで使う
 */
export function audioRandom(): number {
  return realRandom();
}

/**
 * 記録・再生で追わない乱数。ゲームの進み方に関係しない裏方の作業(読み込み演出・UI の震えなど)用。
 * 終わる時刻やフレーム数がネットワークや端末で変わるものを、ゲームの乱数列と同じ列に並べると、再生がずれるため。
 */
export function untrackedRandom(): number {
  return realRandom();
}

/**
 * 記録・再生で追わないタイマーとフレーム。ゲームの進み方に関係しない裏方の作業(読み込み・テクスチャの転送など)用。
 * 終わる時刻がネットワークや端末で変わるものを、ゲームのタイマーと同じ列に並べると、再生がずれるため。
 */
export function untrackedTimeout(fn: () => void, ms: number): number {
  return realSetTimeout ? (realSetTimeout(fn, ms) as unknown as number) : 0;
}
export function untrackedClearTimeout(id: number): void {
  realClearTimeout?.(id as unknown as ReturnType<typeof setTimeout>);
}
export function untrackedInterval(fn: () => void, ms: number): number {
  return realSetInterval ? (realSetInterval(fn, ms) as unknown as number) : 0;
}
export function untrackedFrame(cb: (now: number) => void): number {
  if (realRaf) return realRaf((t) => cb(t));
  return realSetTimeout ? (realSetTimeout(() => cb(realNowFn()), 16) as unknown as number) : 0;
}
export function untrackedCancelFrame(id: number): void {
  if (typeof realCancelRaf === 'function' && typeof realRaf === 'function') realCancelRaf(id); else untrackedClearTimeout(id);
}

/** 本当の時刻。フレームの中で処理を小分けにする(時間で区切る)ところは、こちらを使う(記録の時計はフレームの中で止まっているため) */
export function realNow(): number {
  return realNowFn();
}

interface ReplayApi {
  mode: ReplayMode;
  id: string;
}

let mode: ReplayMode = 'off';
let replayId = '';
/** 書き込みの鍵: 記録の続きを送れるのは、この鍵を持っているこのページだけ(サーバーは鍵のハッシュを持つ)。ランキングに載せる時にも添える */
let writeKey = '';
let header: ReplayHeader | null = null;

// ---- 乱数(sfc32) ----
function hashSeed(s: string): [number, number, number, number] {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
  for (let i = 0; i < s.length; i++) {
    const k = s.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(seed: [number, number, number, number]): () => number {
  let [a, b, c, d] = seed;
  return () => {
    a |= 0; b |= 0; c |= 0; d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

let rng: () => number = Math.random;
/** 乱数を引いた回数(1秒ごとの照合点。敵の出現や CPU の動きがずれると、ここがずれる) */
let rngCalls = 0;
function reseed(label: string): void {
  rng = sfc32(hashSeed(`${header?.seed ?? ''}:${label}`));
}

// ---- フレームの時計 ----
let clock = 0;
let frameNo = 0;

// ---- 記録 ----
let tokens: ReplayToken[] = [];
let sentChars = 0;
let uploadSeq = 0;
let truncated = false;
/** 再生できないものを使った(オンライン対戦など)。ランキングにリプレイを付けない */
let unreplayable = false;
/** 今のラウンドが始まった時のフレーム時計(ランキングのリプレイを、そのラウンドの頭から見るため) */
let roundStartClock = 0;
/** 記録の終わりを送った(ゲームから戻った・ページを離れた) */
let finalQueued = false;
const startedReal = realNowFn();

function push(t: ReplayToken): void {
  if (mode !== 'record' || truncated || finalQueued) return;   // 戻ったあと(iframe が閉じるまで)の分は残さない
  tokens.push(t);
}

// ---- 再生 ----
let data: ReplayData | null = null;
let cursor = 0;
let totalFrames = 0;
const status: ReplayStatus = { frame: 0, frames: 0, diverged: false, done: false, checkpoints: 0, sec: 0, seeking: false };
let speed = 1;
let slowAcc = 0;
/** ここ(記録の開始からの ms)までは、画面を隠して早送りする(ランキングのリプレイを、そのラウンドの頭から見る時など) */
let seekMs = 0;
/** 早送り中に、1本物のフレームで進める時間(ms)。画面を隠しているので、見せる速さに合わせなくてよい */
const SEEK_BUDGET_MS = 50;
/** seek の秒は 0.1 秒に丸めてあるので、この幅の中でラウンドが始まったら、そこで早送りをやめる */
const SEEK_ROUND_SLACK_MS = 150;
let seekCover: HTMLElement | null = null;
let paused = false;
/** 再生中にゲームが出した照合点(記録の照合点と順に突き合わせる) */
const produced: string[] = [];

function diverge(note: string): void {
  if (status.diverged) return;
  status.diverged = true;
  status.divergeNote = `${note} (フレーム ${frameNo})`;
  console.warn('[replay] diverged:', status.divergeNote);
}

// ---- rAF ----
type FrameCb = (t: number) => void;
let rafSeq = 0;
let rafQueue = new Map<number, FrameCb>();
let tickRequested = false;

function runFrame(): void {
  frameNo++;
  const cbs = rafQueue;
  rafQueue = new Map();
  for (const cb of cbs.values()) {
    try { cb(clock); } catch (e) { setTimeoutReal(() => { throw e; }, 0); }
  }
  if (frameNo % 60 === 0) replayCheckpoint('frame', [frameNo, rngCalls]);
}

function setTimeoutReal(fn: () => void, ms: number): void {
  realSetTimeout?.(fn, ms);
}

// ---- アケコン ----
interface PadState { id: string; mapping: string; pressed: number; values: number[] | null; axes: number[] }
const padStates: (PadState | null)[] = [null, null, null, null];
const padActuators: unknown[] = [null, null, null, null];
const stubActuator = { type: 'dual-rumble', playEffect: () => Promise.resolve('complete'), reset: () => Promise.resolve('complete') };

function round(v: number, d: number): number {
  const k = 10 ** d;
  return Math.round(v * k) / k;
}

/** 記録: フレームの頭で本物のアケコンを1回読み、変わっていたら記録する(変わっていなければ何も作らない) */
function pollRealPads(): void {
  if (!realGetGamepads) return;
  let pads: ArrayLike<Gamepad | null> = [];
  try { pads = realGetGamepads(); } catch { /* 読めない環境 */ }
  for (let i = 0; i < 4; i++) {
    const p = pads[i];
    if (!p || !p.connected) {
      if (padStates[i]) { padStates[i] = null; padVersion++; push(['p', i, null]); }
      continue;
    }
    padActuators[i] = (p as Gamepad & { vibrationActuator?: unknown }).vibrationActuator ?? null;
    const prev = padStates[i];
    let pressed = 0;
    let analog = false;
    const nb = p.buttons.length;
    for (let k = 0; k < nb; k++) {
      const b = p.buttons[k];
      if (b.pressed) pressed |= 1 << k;
      const v = b.value;
      if (v !== 0 && v !== 1) analog = true;
    }
    let same = !!prev && prev.id === p.id && prev.mapping === p.mapping && prev.pressed === pressed && prev.axes.length === p.axes.length
      && (prev.values !== null) === analog;
    if (same && analog) for (let k = 0; k < nb && same; k++) same = prev!.values![k] === round(p.buttons[k].value, 2);
    if (same) for (let k = 0; k < p.axes.length && same; k++) same = prev!.axes[k] === round(p.axes[k], 3);
    if (same) continue;
    const values = analog ? Array.from(p.buttons, (b) => round(b.value, 2)) : null;
    const axes = Array.from(p.axes, (a) => round(a, 3));
    padStates[i] = { id: p.id, mapping: p.mapping, pressed, values, axes };
    padVersion++;
    if (!prev || prev.id !== p.id || prev.mapping !== p.mapping) push(['P', i, p.id, p.mapping]);
    push(['p', i, pressed, values ? values.join(',') : null, axes.join(',')]);
  }
}

function applyPadToken(t: (string | number | null)[]): void {
  const i = Number(t[1]);
  padVersion++;
  if (t[0] === 'P') {
    padStates[i] = { id: String(t[2]), mapping: String(t[3]), pressed: 0, values: null, axes: [] };
    return;
  }
  if (t[2] === null) { padStates[i] = null; return; }
  const prev = padStates[i] ?? { id: 'replay', mapping: 'standard', pressed: 0, values: null, axes: [] };
  padStates[i] = {
    ...prev,
    pressed: Number(t[2]),
    values: typeof t[3] === 'string' ? t[3].split(',').map(Number) : null,
    axes: typeof t[4] === 'string' && t[4] ? t[4].split(',').map(Number) : [],
  };
}

/** 作った Gamepad の形は、状態が変わるまで使い回す(毎フレーム作り直すと、ごみが増えてカクつきの元になる) */
let padCache: (Gamepad | null)[] | null = null;
let padCacheVersion = -1;
/** アケコンの状態が変わるたびに増やす */
let padVersion = 0;
function syntheticPads(): (Gamepad | null)[] {
  if (padCache && padCacheVersion === padVersion) return padCache;
  padCacheVersion = padVersion;
  padCache = buildPads();
  return padCache;
}

function buildPads(): (Gamepad | null)[] {
  return padStates.map((st, i) => {
    if (!st) return null;
    const n = Math.max(st.values?.length ?? 0, 17);
    const buttons = Array.from({ length: n }, (_, k) => {
      const pressed = (st.pressed & (1 << k)) !== 0;
      const value = st.values ? st.values[k] ?? 0 : pressed ? 1 : 0;
      return { pressed, touched: pressed, value };
    });
    return {
      id: st.id, index: i, connected: true, mapping: st.mapping, timestamp: clock, axes: st.axes, buttons,
      vibrationActuator: mode === 'record' ? padActuators[i] ?? stubActuator : stubActuator, hapticActuators: [],
    } as unknown as Gamepad;
  });
}

// ---- タイマー ----
interface TimerEntry { fn: (...a: unknown[]) => void; args: unknown[]; interval: boolean; ms: number; real?: ReturnType<typeof setTimeout> }
let timerSeq = 0;
const timers = new Map<number, TimerEntry>();
/** 調べる用: 乱数を引いた場所(呼び出し元のファイル:行)。記録では 'q' として残し、再生では突き合わせる */
const producedRandom: string[] = [];
function debugRandomSite(): void {
  const stack = new Error().stack?.split('\n') ?? [];
  // [0]=Error [1]=debugRandomSite [2]=Math.random の差し替え [3]=呼び出し元
  const site = (stack[3] ?? '').trim().replace(/\?[^:)]*/, '').replace(/^at /, '').slice(-90);
  const tag = `${rngCalls}|${site}`;
  if (mode === 'record') push(['q', tag]);
  else producedRandom.push(tag);
}
/** 調べる用: 再生でタイマーを作った順番(記録の 'c' と突き合わせる) */
const producedTimers: string[] = [];
const producedFetches: string[] = [];
function timerTag(fn: unknown, ms: number | undefined, interval: boolean): string {
  let src = '';
  try { src = typeof fn === 'function' ? Function.prototype.toString.call(fn).replace(/\s+/g, ' ').slice(0, 80) : String(fn).slice(0, 40); } catch { /* ignore */ }
  return `${interval ? 'I' : 'T'}${ms ?? 0}:${src}`;
}

function fireTimer(id: number): void {
  const t = timers.get(id);
  if (!t) {
    if (mode === 'replay') diverge(`タイマー ${id} が記録にあるのに、再生では作られていない`);
    return;
  }
  if (!t.interval) timers.delete(id);
  push(['t', id]);
  try { t.fn(...t.args); } catch (e) { setTimeoutReal(() => { throw e; }, 0); }
}

// ---- 通信 ----
let fetchSeq = 0;
/** 応答を記録に残す時の1切れの大きさ(文字数。日本語でも小分けの上限に収まる長さ) */
const RESPONSE_PART = 12_000;
const pendingFetches = new Map<number, { resolve: (r: Response) => void; reject: (e: unknown) => void }>();

function shouldRecordFetch(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (url.origin !== location.origin) return false;
    if (url.pathname.startsWith('/api/analytics/') || url.pathname.startsWith('/api/replay/')) return false;
    return url.pathname.startsWith('/api/') || url.pathname === '/online-status';
  } catch {
    return false;
  }
}

function isTelemetry(input: RequestInfo | URL): boolean {
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    return url.pathname.startsWith('/api/analytics/') || url.pathname.startsWith('/api/replay/');
  } catch {
    return false;
  }
}

/**
 * 記録・再生で同じ形の応答。本物の Response の json()/text() は、中身を読み終えるまでに何段も非同期を挟み、
 * 再生では、その間に次の入力が先に入ってしまう。中身は手元にあるので、1段の Promise で返す(記録と再生で同じ深さになる)
 */
function makeResponse(status: number, ctype: string, text: string): Response {
  const r = new Response(text, { status, headers: { 'content-type': ctype || 'application/json' } });
  Object.defineProperty(r, 'text', { value: () => Promise.resolve(text) });
  Object.defineProperty(r, 'json', { value: () => Promise.resolve().then(() => JSON.parse(text)) });
  return r;
}

// ---- 入れ直し(再生) ----
const keyTarget = (): EventTarget => document.activeElement ?? document.body ?? window;
let docHidden = false;

function applyAction(t: (string | number | null)[]): void {
  switch (t[0]) {
    case 'k': {
      const ev = new KeyboardEvent(t[1] === 1 ? 'keydown' : 'keyup', {
        code: String(t[2]), key: String(t[3]), repeat: t[4] === 1, bubbles: true, cancelable: true,
        shiftKey: (Number(t[5]) & 1) !== 0, ctrlKey: (Number(t[5]) & 2) !== 0, altKey: (Number(t[5]) & 4) !== 0, metaKey: (Number(t[5]) & 8) !== 0,
      });
      keyTarget().dispatchEvent(ev);
      break;
    }
    case 'm': {
      const x = Number(t[2]) * innerWidth;
      const y = Number(t[3]) * innerHeight;
      const el = document.elementFromPoint(x, y) ?? document.body;
      const type = String(t[1]);
      const init = { clientX: x, clientY: y, button: Number(t[4]) || 0, bubbles: true, cancelable: true, composed: true };
      el.dispatchEvent(type === 'click' ? new MouseEvent('click', init) : new PointerEvent(type, { ...init, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
      break;
    }
    case 't': fireTimer(Number(t[1])); break;
    case 'hh': {
      // 分けて残した大きな応答: 続く 'hp' をつなぎ直す
      const n = Number(t[4]);
      let text = '';
      for (let i = 0; i < n && data && cursor < data.tokens.length; i++) {
        const part = data.tokens[cursor++];
        if (Array.isArray(part) && part[0] === 'hp') text += String(part[1] ?? '');
      }
      applyAction(['h', t[1], t[2], t[3], text]);
      break;
    }
    case 'h': {
      const p = pendingFetches.get(Number(t[1]));
      if (!p) { diverge(`通信 ${t[1]} の応答が記録にあるのに、再生では送られていない`); break; }
      pendingFetches.delete(Number(t[1]));
      if (Number(t[2]) < 0) p.reject(new TypeError('Failed to fetch (replay)'));
      else p.resolve(makeResponse(Number(t[2]), String(t[3] ?? ''), String(t[4] ?? '')));
      break;
    }
    case 'v': {
      docHidden = t[1] === 1;
      document.dispatchEvent(new Event('visibilitychange'));
      break;
    }
    case 'p': case 'P': applyPadToken(t); break;
    case 'b': {
      const w = barriers.get(Number(t[1]));
      if (!w) { diverge(`待ち ${t[2]} が記録にあるのに、再生では始まっていない`); break; }
      w.released = true;
      if (!w.settled) blockedOn = w;   // 本当に終わるまで、ここで止まる
      else maybeRelease(w);
      break;
    }
    case 'q': {
      const want = String(t[1]);
      const got = producedRandom.shift();
      if (got !== want && !status.diverged) diverge(`乱数を引いた場所が違う: 記録 ${want} / 再生 ${got ?? '(なし)'}`);
      break;
    }
    case 'F': {
      const want = String(t[1]);
      const got = producedFetches.shift();
      if (got !== want && !status.diverged) diverge(`通信の送り方が違う: 記録 ${want} / 再生 ${got ?? '(なし)'}`);
      break;
    }
    case 'c': {
      const want = String(t[1]);
      const got = producedTimers.shift();
      if (got !== want) diverge(`タイマーの作り方が違う: 記録 ${want} / 再生 ${got ?? '(なし)'}`);
      break;
    }
    case 'a': {
      const want = String(t[1]);
      const got = produced.shift();
      status.checkpoints++;
      if (got !== want) diverge(`照合点が違う: 記録 ${want.slice(0, 120)} / 再生 ${got?.slice(0, 120) ?? '(なし)'}`);
      break;
    }
    default: break;
  }
}

/** 次のフレームまでの出来事を入れ直し、フレームを1つ進める。出来事のあとは、ブラウザと同じく一度手を離す(Promise の続きを先に流す) */
let pumping = false;
// (再生の時だけ作る。読み込んだだけで MessageChannel を開くと、Node のテストが終わらなくなる)
let yieldChannel: MessageChannel | null = null;
let yieldResolve: (() => void) | null = null;
const yieldTask = (): Promise<void> => new Promise((resolve) => {
  if (!yieldChannel && typeof MessageChannel !== 'undefined') {
    yieldChannel = new MessageChannel();
    yieldChannel.port1.onmessage = () => { const r = yieldResolve; yieldResolve = null; r?.(); };
  }
  if (yieldChannel) { yieldResolve = resolve; yieldChannel.port2.postMessage(0); } else setTimeoutReal(resolve, 0);
});

async function pumpOneFrame(): Promise<boolean> {
  if (!data) return false;
  const list = data.tokens;
  while (cursor < list.length) {
    if (blockedOn) return true;   // 読み込みなどの待ちが本当に終わるまで、先へ進まない(次の本物のフレームで、もう一度見る)
    const t = list[cursor++];
    if (typeof t === 'number') {
      clock = round(clock + t / 100, 2);
      runFrame();
      status.frame = frameNo;
      status.sec = Math.round((clock - (header?.t0 ?? clock)) / 100) / 10;
      return true;
    }
    const kind = t[0];
    applyAction(t);
    if (kind === 'k' || kind === 'm' || kind === 't' || kind === 'h' || kind === 'hh' || kind === 'v' || kind === 'b') await yieldTask();
  }
  status.done = true;
  return false;
}

/** 早送り中は、ゲームの画面を覆って隠す(メニューなどが速回しで流れるのを見せない) */
function showSeekCover(): void {
  if (seekCover || !document.body) return;
  const el = document.createElement('div');
  el.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#000;color:#ccc;display:flex;align-items:center;justify-content:center;'
    + 'font:16px/1.5 system-ui,sans-serif;letter-spacing:.05em;pointer-events:none';
  el.textContent = 'ラウンドの頭まで進めています…';
  document.body.appendChild(el);
  seekCover = el;
}

function endSeek(): void {
  if (!status.seeking) return;
  status.seeking = false;
  seekCover?.remove();
  seekCover = null;
  setReplayMuted(false);
  postStatus();
}

async function replayTick(): Promise<void> {
  if (pumping) return;
  pumping = true;
  try {
    if (status.seeking) {
      // 早送り: 画面を隠したまま、時間で区切って進める。読み込みの待ち(replayBarrier)で進まない時は、次の本物のフレームを待つ
      showSeekCover();
      const until = realNowFn() + SEEK_BUDGET_MS;
      while (status.seeking && realNowFn() < until) {
        const before = frameNo;
        if (!(await pumpOneFrame()) || frameNo === before) break;
        // ラウンドが始まらないまま見る所を過ぎた(ラウンドの頭ではない所を見る時)
        if (header && clock - header.t0 >= seekMs + SEEK_ROUND_SLACK_MS) endSeek();
      }
      if (status.done) endSeek();
    } else if (!paused) {
      // 1未満の速さは、本物のフレームを何回かに1回だけ進める(Math.random は差し替え済みなので使わない)
      slowAcc += speed;
      const n = speed >= 1 ? Math.round(speed) : slowAcc >= 1 ? 1 : 0;
      if (slowAcc >= 1) slowAcc -= 1;
      for (let i = 0; i < n; i++) if (!(await pumpOneFrame())) break;
    }
  } finally {
    pumping = false;
  }
  postStatus();
  if (!status.done) realRaf?.(() => void replayTick());
}

/**
 * 再生を開いた親(管理画面)のオリジン。本番では、ゲームは管理画面とは別のオリジン(REPLAY_ORIGIN)で動く。
 * 親は CSP で管理画面に限っている。分からなければ自分のオリジン(同じオリジンで開いた時)
 */
function parentOrigin(): string {
  try {
    const anc = (location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
    if (anc && anc.length > 0) return anc[0];
    if (document.referrer) return new URL(document.referrer).origin;
  } catch { /* ignore */ }
  return location.origin;
}

function postStatus(): void {
  try { window.parent?.postMessage({ type: 'gamecenter:replay-status', status }, parentOrigin()); } catch { /* ignore */ }
}

// ---- 送信(記録) ----
const MAX_CHUNK_BYTES = 48_000;
const utf8 = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const byteLength = (text: string): number => (utf8 && text.length > MAX_CHUNK_BYTES / 4 ? utf8.encode(text).length : text.length * 3);

/** 記録を送る小分けにする(1つ 48KB まで。ページを離れる時の sendBeacon は 64KB までしか預けられないため)。最初の1つはヘッダーだけ */
function chunkBody(list: ReplayToken[], final: boolean): string[] {
  const out: string[] = [];
  if (uploadSeq === 0) out.push(JSON.stringify({ id: replayId, key: writeKey, game: header?.game, seq: uploadSeq++, header, tokens: [] }));
  const make = (part: ReplayToken[], last: boolean) => JSON.stringify({ id: replayId, key: writeKey, game: header?.game, seq: uploadSeq, tokens: part, ...(last ? { final: true } : {}) });
  const split = (part: ReplayToken[], last: boolean): void => {
    const body = make(part, last);
    if (byteLength(body) > MAX_CHUNK_BYTES && part.length > 1) {
      const mid = Math.floor(part.length / 2);
      split(part.slice(0, mid), false);
      split(part.slice(mid), last);
      return;
    }
    uploadSeq++;
    out.push(body);
  };
  split(list, final);
  return out;
}

/** 送る順番待ちの小分け(1つずつ送り、失敗したら少し待って送り直す) */
const outbox: string[] = [];
let sending = false;
const MAX_OUTBOX = 400;

async function drainOutbox(): Promise<void> {
  if (sending || !realFetch) return;
  sending = true;
  try {
    while (outbox.length > 0) {
      let ok = false;
      try {
        // keepalive は使わない(ブラウザ全体で同時に 64KB までしか送れず、超えた分は黙って捨てられる)
        const res = await realFetch(UPLOAD_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: outbox[0] });
        ok = res.ok || (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429);   // 内容が悪いものは送り直しても無駄
      } catch { /* 通信の失敗: あとで送り直す */ }
      if (!ok) {
        await new Promise((r) => setTimeoutReal(() => r(undefined), 3000));
        continue;
      }
      outbox.shift();
    }
  } finally {
    sending = false;
  }
}

/** 溜まった記録を送る。final: 記録の終わり。beacon: ページを離れる最中(残りを sendBeacon で送る) */
export function flushReplay(final = false, beacon = false): void {
  if (mode !== 'record' || !header || finalQueued) return;
  if (tokens.length === 0 && !final) return;
  const list = tokens;
  tokens = [];
  for (const body of chunkBody(list, final)) {
    sentChars += body.length;
    if (sentChars > MAX_RECORD_CHARS && !truncated) { truncated = true; }
    if (outbox.length < MAX_OUTBOX) outbox.push(body);
  }
  if (final) finalQueued = true;
  if (beacon && typeof navigator.sendBeacon === 'function') {
    // ページが閉じる: まだ送れていない分を、ブラウザに預けて送ってもらう(1回に預けられる量には上限がある)
    while (outbox.length > 0) {
      try { if (!navigator.sendBeacon(UPLOAD_PATH, new Blob([outbox[0]], { type: 'application/json' }))) break; } catch { break; }
      outbox.shift();
    }
    return;
  }
  void drainOutbox();
}

// ---- 非同期の待ち(読み込みなど)を、記録と再生で同じ所で終わらせる ----
let barrierSeq = 0;
interface BarrierWait { settled: boolean; ok: boolean; value: unknown; resolve?: (v: unknown) => void; reject?: (e: unknown) => void; released: boolean }
const barriers = new Map<number, BarrierWait>();
/** 再生が、記録のこの待ちの所まで来たのに、まだ本当には終わっていない */
let blockedOn: BarrierWait | null = null;

/**
 * 読み込みのように、終わる時刻が端末やネットワークで変わる待ち。記録では、終わった所を残す。
 * 再生では、本当に終わり、かつ記録のその所まで来たときに終える(早く終わっても、記録の所までは待たせる)。
 */
export function replayBarrier<T>(name: string, p: Promise<T>): Promise<T> {
  if (mode === 'off') return p;
  const idx = ++barrierSeq;
  if (mode === 'record') {
    return p.then(
      (v) => { push(['b', idx, name]); return v; },
      (e) => { push(['b', idx, name, 1]); throw e; },
    );
  }
  const w: BarrierWait = { settled: false, ok: true, value: undefined, released: false };
  barriers.set(idx, w);
  const out = new Promise<T>((resolve, reject) => { w.resolve = resolve as (v: unknown) => void; w.reject = reject; });
  p.then((v) => { w.settled = true; w.value = v; maybeRelease(w); }, (e) => { w.settled = true; w.ok = false; w.value = e; maybeRelease(w); });
  return out;
}

function maybeRelease(w: BarrierWait): void {
  if (!w.settled || !w.released) return;
  if (w.ok) w.resolve?.(w.value); else w.reject?.(w.value);
  if (blockedOn === w) blockedOn = null;
}

// ---- 公開 ----
export function getReplayMode(): ReplayMode { return mode; }
export function getReplayId(): string | undefined { return mode === 'record' ? replayId : undefined; }

/**
 * ランキングに付けるリプレイの参照: 記録の id と書き込みの鍵(サーバーが、この端末の記録かを確かめる)と、今のラウンドが始まった所(記録の開始からの秒)。
 * 再生できない記録(オンライン対戦など)・記録していない時は undefined。サーバーは、ランキングに載ったプレイのリプレイだけを残す
 */
export function getReplayRef(): { id: string; key: string; seek: number } | undefined {
  if (mode !== 'record' || unreplayable || truncated || !header) return undefined;
  return { id: replayId, key: writeKey, seek: Math.max(0, Math.round((roundStartClock - header.t0) / 100) / 10) };
}
export function getReplayStatus(): ReplayStatus { return status; }
/** 記録した時、ハブの iframe の中だったか(再生では、記録した時と同じ作り方をするため) */
export function replayWasFramed(): boolean | undefined { return mode === 'replay' ? header?.framed : undefined; }
export function setReplaySpeed(v: number): void { speed = Math.max(0.1, Math.min(8, v)); }
export function setReplayPaused(v: boolean): void { paused = v; }

/** ラウンドの開始(reportRoundStart から呼ばれる)。乱数を、種とラウンドの番号から作り直す */
export function replayRoundStart(roundNo: number): void {
  if (mode === 'off') return;
  reseed(`round:${roundNo}`);
  roundStartClock = clock;
  // 見る所(ラウンドの頭)に着いた: 秒の丸めの分ずれずに、ラウンドが始まった瞬間から見せる
  if (mode === 'replay' && status.seeking && header && clock - header.t0 >= seekMs - SEEK_ROUND_SLACK_MS) endSeek();
}

/** ゲームが送ったアナリティクス(照合点)。記録では残し、再生では記録と突き合わせる */
export function replayCheckpoint(type: string, payload: unknown): void {
  if (mode === 'off') return;
  let s: string;
  try { s = `${type}|${JSON.stringify(payload ?? null)}`; } catch { s = type; }
  if (mode === 'record') push(['a', s]);
  else produced.push(s);
}

/** 記録をやめて送り切る(オンライン対戦など、再生できないものを使い始めた時) */
export function markReplayUnreplayable(why: string): void {
  unreplayable = true;
  push(['x', why]);
}

// ---- 差し替え ----
function newId(): string {
  try { return crypto.randomUUID(); } catch { return `r-${realDateNow().toString(36)}-${Math.floor(realNowFn()).toString(36)}`; }
}

/** ゲームのコードの版: ビルドした本体のスクリプトのパス(Vite が中身のハッシュを名前に付ける) */
function currentBuild(): string | undefined {
  try {
    return document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src')?.slice(0, 200) ?? undefined;
  } catch {
    return undefined;
  }
}

/** 書き込みの鍵(推測されないよう、暗号の乱数で作る) */
function newKey(): string {
  try {
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${newId()}-${newId()}`;
  }
}

function installCommon(): void {
  Math.random = header?.debug
    ? () => { rngCalls++; debugRandomSite(); return rng(); }
    : () => { rngCalls++; return rng(); };
  performance.now = () => clock;
  Date.now = () => (header ? header.e0 + (clock - header.t0) : realDateNow());

  window.requestAnimationFrame = (cb: FrameRequestCallback): number => {
    const id = ++rafSeq;
    rafQueue.set(id, cb as FrameCb);
    if (mode === 'record' && !tickRequested) {
      tickRequested = true;
      realRaf!(recordTick);
    }
    return id;
  };
  window.cancelAnimationFrame = (id: number): void => { rafQueue.delete(id); };

  const makeTimer = (interval: boolean) => (fn: TimerHandler, ms?: number, ...args: unknown[]): number => {
    const id = ++timerSeq;
    const entry: TimerEntry = { fn: typeof fn === 'function' ? fn as (...a: unknown[]) => void : () => {}, args, interval, ms: ms ?? 0 };
    timers.set(id, entry);
    if (header?.debug) {
      const tag = `${id}|${timerTag(fn, ms, interval)}`;
      if (mode === 'record') push(['c', tag]);
      else producedTimers.push(tag);
    }
    if (mode === 'record') {
      entry.real = interval
        ? realSetInterval!(() => fireTimer(id), ms)
        : realSetTimeout!(() => fireTimer(id), ms);
    }
    return id;
  };
  const clear = (id?: number): void => {
    if (id === undefined) return;
    const t = timers.get(id);
    if (!t) return;
    timers.delete(id);
    if (t.real !== undefined) { if (t.interval) realClearInterval!(t.real); else realClearTimeout!(t.real); }
  };
  window.setTimeout = makeTimer(false) as unknown as typeof window.setTimeout;
  window.setInterval = makeTimer(true) as unknown as typeof window.setInterval;
  window.clearTimeout = clear as typeof window.clearTimeout;
  window.clearInterval = clear as typeof window.clearInterval;

  if (realGetGamepads) navigator.getGamepads = () => syntheticPads();

  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (mode === 'replay' && isTelemetry(input)) return Promise.resolve(new Response('{}', { status: 200 }));
    if (!shouldRecordFetch(input)) return realFetch!(input, init);
    const idx = ++fetchSeq;
    if (header?.debug) {
      const tag = `${idx}|${init?.method ?? 'GET'} ${typeof input === 'string' ? input : input instanceof URL ? input.href : input.url}`;
      if (mode === 'record') push(['F', tag]);
      else producedFetches.push(tag);
    }
    if (mode === 'replay') return new Promise((resolve, reject) => pendingFetches.set(idx, { resolve, reject }));
    return realFetch!(input, init).then(
      async (res) => {
        const text = await res.text();
        const ctype = res.headers.get('content-type') ?? '';
        if (text.length <= RESPONSE_PART) push(['h', idx, res.status, ctype, text]);
        else {
          // 大きな応答(ゴーストの軌跡など)は、小分けに収まるよう分けて残す。ゲームには全部を渡す
          const parts = Math.ceil(text.length / RESPONSE_PART);
          push(['hh', idx, res.status, ctype, parts]);
          for (let i = 0; i < parts; i++) push(['hp', text.slice(i * RESPONSE_PART, (i + 1) * RESPONSE_PART)]);
        }
        return makeResponse(res.status, ctype, text);
      },
      (e) => { push(['h', idx, -1]); throw e; },
    );
  };

  const NativeWs = window.WebSocket;
  if (NativeWs) {
    window.WebSocket = new Proxy(NativeWs, {
      construct(target, args) {
        markReplayUnreplayable('online');
        return new target(...(args as [string, (string | string[])?]));
      },
    });
  }
}

function recordTick(ts: number): void {
  tickRequested = false;
  if (realNowFn() - startedReal > MAX_RECORD_MS && !truncated) { truncated = true; push(['x', 'truncated']); }
  pollRealPads();
  const t = round(ts, 2);
  const delta = Math.max(0, Math.round((t - clock) * 100));
  clock = round(clock + delta / 100, 2);
  push(delta);
  runFrame();
  if (rafQueue.size > 0 && !tickRequested) {
    tickRequested = true;
    realRaf!(recordTick);
  }
}

/** 保存領域の中身(アナリティクスの送信待ち・認証系など、ゲームの動きに関係ないものは除く) */
const SENSITIVE_STORAGE_KEY_RE = /token|secret|auth|pass|admin|cookie/i;
function snapshotStorage(get: () => Storage): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const st = get();
    let total = 0;
    for (let i = 0; i < st.length; i++) {
      const k = st.key(i);
      if (!k || k.startsWith('gamecenter_analytics') || SENSITIVE_STORAGE_KEY_RE.test(k)) continue;
      const v = st.getItem(k) ?? '';
      if (v.length > 8_000 || (total += v.length) > 30_000) continue;   // (ヘッダーは1つの小分けに収める)
      out[k] = v;
    }
  } catch { /* 使えない環境 */ }
  return out;
}

/** 再生用の保存領域(記録した時の中身から始め、書き込みはこの中だけで済ませる) */
function memoryStorage(init: Record<string, string>): Storage {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => m.clear(),
  } as Storage;
}

function installRecord(game: string): void {
  replayId = newId();
  writeKey = newKey();
  clock = round(realNowFn(), 2);
  header = {
    v: 1, id: replayId, game, seed: newId(), t0: clock, e0: realDateNow(),
    w: innerWidth, h: innerHeight, dpr: devicePixelRatio || 1, ua: navigator.userAgent.slice(0, 200),
    framed: window.parent !== window, ls: snapshotStorage(() => localStorage), ss: snapshotStorage(() => sessionStorage), build: currentBuild(),
    debug: (() => { try { return localStorage.getItem('gc_replay_debug') === '1'; } catch { return false; } })(),
  };
  reseed('boot');
  installCommon();

  const mods = (e: KeyboardEvent) => (e.shiftKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.altKey ? 4 : 0) | (e.metaKey ? 8 : 0);
  const onKey = (e: KeyboardEvent) => { if (e.isTrusted) push(['k', e.type === 'keydown' ? 1 : 0, e.code, e.key, e.repeat ? 1 : 0, mods(e)]); };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  const onPointer = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    push(['m', e.type, round(e.clientX / Math.max(1, innerWidth), 4), round(e.clientY / Math.max(1, innerHeight), 4), e.button]);
  };
  for (const type of ['pointerdown', 'pointerup', 'click']) window.addEventListener(type, onPointer as EventListener, true);
  document.addEventListener('visibilitychange', () => push(['v', document.hidden ? 1 : 0]), true);

  realSetInterval!(() => flushReplay(false), UPLOAD_EVERY_MS);
  realSetInterval!(() => { if (tokens.length >= CHUNK_TOKENS) flushReplay(false); }, 1000);
  window.addEventListener('pagehide', () => flushReplay(true, true));
}

// ---- 早送り中の音を消す ----
// ゲームの音の時計(AudioContext.currentTime)は止めずに、スピーカーへ出る手前の音量だけを 0 にする(音の鳴らし方は、記録と同じまま)
const muteGains: GainNode[] = [];
const muteGainOf = new WeakMap<BaseAudioContext, GainNode>();
const mediaMuted = new Set<HTMLMediaElement>();
let replayMuted = false;
type AnyConnect = (this: AudioNode, ...args: unknown[]) => unknown;

function muteGainFor(dest: AudioDestinationNode, connect: AnyConnect): GainNode {
  let g = muteGainOf.get(dest.context);
  if (!g) {
    g = dest.context.createGain();
    g.gain.value = replayMuted ? 0 : 1;
    connect.call(g, dest);
    muteGainOf.set(dest.context, g);
    muteGains.push(g);
  }
  return g;
}

/** 再生: スピーカーへつなぐ音を、間に挟んだ音量(muteGains)を通すようにする。<audio> などは再生のたびに覚えておく */
function installReplayMute(): void {
  if (typeof AudioNode !== 'undefined' && typeof AudioDestinationNode !== 'undefined') {
    const proto = AudioNode.prototype as unknown as { connect: AnyConnect; disconnect: AnyConnect };
    const connect = proto.connect;
    const disconnect = proto.disconnect;
    proto.connect = function (this: AudioNode, ...args: unknown[]) {
      const dest = args[0];
      if (dest instanceof AudioDestinationNode) {
        connect.call(this, muteGainFor(dest, connect), ...args.slice(1));
        return dest;
      }
      return connect.apply(this, args);
    };
    proto.disconnect = function (this: AudioNode, ...args: unknown[]) {
      const dest = args[0];
      if (dest instanceof AudioDestinationNode) {
        const g = muteGainOf.get(dest.context);
        return g ? disconnect.call(this, g, ...args.slice(1)) : undefined;
      }
      return disconnect.apply(this, args);
    };
  }
  if (typeof HTMLMediaElement !== 'undefined') {
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      if (replayMuted && !this.muted) { this.muted = true; mediaMuted.add(this); }
      return play.call(this);
    };
  }
}

/**
 * 早送り中は、WebGL の描画命令を空振りさせる(画面は隠しているので描かなくてよい)。状態の設定・シェーダ・テクスチャの転送は、そのまま行う。
 * 毎フレームの描画が早送りの時間のほとんどを占める(midnight-skyway: タイトルに 30 秒いた記録で、ラウンドの頭まで約 22 秒)。
 * ゲームは描いた結果を読み返さない(読み返すのは 2D キャンバスで作るテクスチャだけ)ので、進み方は変わらない。
 */
function installSeekDrawSkip(): void {
  const names = ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements', 'blitFramebuffer'];
  for (const ctor of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!ctor) continue;
    const proto = ctor.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of names) {
      const draw = proto[name];
      if (typeof draw !== 'function') continue;
      proto[name] = function (this: unknown, ...args: unknown[]) {
        if (!status.seeking) return draw.apply(this, args);
        return undefined;
      };
    }
  }
}

function setReplayMuted(on: boolean): void {
  replayMuted = on;
  for (const g of muteGains) g.gain.value = on ? 0 : 1;
  if (!on) {
    for (const m of mediaMuted) m.muted = false;
    mediaMuted.clear();
  }
}

function installReplay(game: string, id: string): void {
  // 記録を同期で読み込む(ゲームのコードが乱数・時計を使い始める前に、種と時計が要るため)
  let loaded: ReplayData | null = null;
  try {
    // 管理画面が発行した札があれば、公開の API から読む(本番。ゲームは管理画面のログインを持たない)。
    // 札が無ければ管理画面の API から読む(管理画面と同じオリジンで開いた時・手元の確認の道具)
    const ticket = new URLSearchParams(location.search).get('ticket');
    const xhr = new XMLHttpRequest();
    xhr.open('GET', ticket
      ? `/api/replay/view?id=${encodeURIComponent(id)}&ticket=${encodeURIComponent(ticket)}`
      : `/admin/api/replay?id=${encodeURIComponent(id)}`, false);
    xhr.send();
    if (xhr.status === 200) loaded = JSON.parse(xhr.responseText) as ReplayData;
  } catch (e) {
    console.warn('[replay] load failed', e);
  }
  if (!loaded?.header) {
    mode = 'off';
    status.done = true;
    status.diverged = true;
    status.divergeNote = '記録を読み込めなかった';
    postStatus();
    return;
  }
  data = loaded;
  header = loaded.header;
  // 版の違う記録も再生は試す(見た目が少し違うだけのこともある)。管理画面に、ずれうることを出す
  if (header.build && header.build !== currentBuild()) status.versionMismatch = true;
  replayId = header.id;
  totalFrames = loaded.tokens.reduce<number>((n, t) => n + (typeof t === 'number' ? 1 : 0), 0);
  status.frames = totalFrames;
  clock = header.t0;
  reseed('boot');
  installCommon();
  installReplayMute();
  installSeekDrawSkip();
  const ls = memoryStorage(header.ls ?? {});
  const ss = memoryStorage(header.ss ?? {});
  Object.defineProperty(window, 'localStorage', { configurable: true, get: () => ls });
  Object.defineProperty(window, 'sessionStorage', { configurable: true, get: () => ss });
  // 再生ではサーバーへ何も送らない
  try { navigator.sendBeacon = () => true; } catch { /* ignore */ }

  // 本物の入力は止める(記録した入力だけを届ける)
  const block = (e: Event) => { if (e.isTrusted) { e.stopImmediatePropagation(); e.preventDefault(); } };
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'click', 'mousedown', 'mouseup', 'mousemove', 'wheel', 'touchstart']) window.addEventListener(type, block, true);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => docHidden });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (docHidden ? 'hidden' : 'visible') });

  // 親(管理画面)からの操作: 速さ・一時停止
  window.addEventListener('message', (e) => {
    if (e.origin !== parentOrigin() || e.source !== window.parent) return;
    const m = e.data as { type?: string; speed?: number; paused?: boolean } | null;
    if (m?.type !== 'gamecenter:replay-control') return;
    if (typeof m.speed === 'number') setReplaySpeed(m.speed);
    if (typeof m.paused === 'boolean') setReplayPaused(m.paused);
  });
  void game;
  const sp = Number(new URLSearchParams(location.search).get('speed'));
  if (sp > 0) setReplaySpeed(sp);
  const seek = Number(new URLSearchParams(location.search).get('seek'));
  if (seek > 0) {
    seekMs = seek * 1000;
    status.seeking = true;
    setReplayMuted(true);
  }
  (window as unknown as { __gcReplayStatus?: ReplayStatus }).__gcReplayStatus = status;
  realRaf?.(() => void replayTick());
}

/** ゲームの最初に1回呼ぶ(arcadeReplayBoot.ts) */
export function installReplayCapture(): void {
  if (typeof window === 'undefined' || g.__gcReplay) return;
  const params = new URLSearchParams(location.search);
  const game = /\/games\/([\w-]+)\/?/.exec(location.pathname)?.[1] ?? 'unknown';
  const replay = params.get('replay');
  if (replay) {
    mode = 'replay';
    installReplay(game, replay);
  } else if ((!isBenchEnabled() || params.get('rec') === '1') && !params.has('preview') && params.get('rec') !== '0') {   // ベンチでは、rec=1 のときだけ記録する(記録の重さを測るため)
    mode = 'record';
    installRecord(game);
  }
  g.__gcReplay = { mode, id: replayId };
}
