// リザルト画面のスコアを 0 から本来の値まで数え上げて見せる共通演出。
// "01:23.456" や "12,300 pts" のように、数字以外を含む表示でも、書式を保ったまま数字部分だけを動かす。

/** 数字部分だけを、0 から本来の値まで ratio(0〜1) で数え上げた文字列にする。 */
export function scoreAtRatio(text: string, ratio: number): string {
  return text.replace(/\d[\d,]*(?:\.\d+)?/g, (tok) => {
    const hasComma = tok.includes(',');
    const raw = tok.replace(/,/g, '');
    const dot = raw.indexOf('.');
    const decimals = dot >= 0 ? raw.length - dot - 1 : 0;
    const intLen = dot >= 0 ? dot : raw.length;
    const out = (Number(raw) * ratio).toFixed(decimals);
    const [i, d] = out.split('.');
    const frac = d !== undefined ? '.' + d : '';
    if (hasComma) return Number(i).toLocaleString('en-US') + frac;
    if (raw.startsWith('0') && intLen > 1) return i.padStart(intLen, '0') + frac;
    return i + frac;
  });
}

export interface CountUpOptions {
  /** 数え上げを始めるまでの待ち(ms) */
  delayMs?: number;
  /** 数え上げにかける時間(ms) */
  durationMs?: number;
}

/**
 * el の表示を finalText まで数え上げる。止まる直前ほどゆっくりになり、止まった瞬間に一度弾む。
 * 返す関数で途中でも止められる(止めると最終値を出す)。
 */
export function countUpText(el: HTMLElement, finalText: string, options: CountUpOptions = {}): () => void {
  const delay = options.delayMs ?? 150;
  const duration = options.durationMs ?? 1300;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (reduced) {
    el.textContent = finalText;
    return () => {};
  }

  el.textContent = scoreAtRatio(finalText, 0);
  let raf = 0;
  let stopped = false;
  const t0 = performance.now();
  const finish = () => {
    el.textContent = finalText;
    el.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.4 }, { transform: 'scale(1)' }],
      { duration: 350, easing: 'ease-out' },
    );
  };
  const tick = (now: number) => {
    if (stopped) return;
    const ratio = Math.min(1, Math.max(0, (now - t0 - delay) / duration));
    if (ratio >= 1) return finish();
    el.textContent = scoreAtRatio(finalText, 1 - Math.pow(1 - ratio, 3));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    el.textContent = finalText;
  };
}
