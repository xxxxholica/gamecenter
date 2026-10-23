import { realNow, replayBarrier, untrackedCancelFrame, untrackedFrame, untrackedRandom, untrackedTimeout } from '../../../../shared/arcadeReplay';

const STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [0, 240, 255]], [0.45, [255, 204, 0]], [0.8, [255, 0, 85]], [1, [255, 0, 85]],
];
/** メーターの値(0〜1)に応じた色(シアン → 黄 → 赤) */
function lerpStops(v: number): [number, number, number] {
  for (let i = 1; i < STOPS.length; i++) {
    const [v1, c1] = STOPS[i];
    if (v <= v1) {
      const [v0, c0] = STOPS[i - 1];
      const t = v1 === v0 ? 1 : (v - v0) / (v1 - v0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as [number, number, number];
    }
  }
  return [255, 0, 85];
}

export class StageLoadingScreen {
  private container: HTMLElement;
  private isVisible: boolean = false;
  private stageTitleEl!: HTMLElement;
  private progressFillEl!: HTMLElement;
  private creditEl!: HTMLElement;
  private wrapEl!: HTMLElement;
  private barEl!: HTMLElement;
  /** 実際の読み込み進行(0〜1)と、メーターに表示している値(0〜1。なめらかに追いかける) */
  private target = 0;
  private shown = 0;
  private raf = 0;
  private lastTick = 0;
  /** 表示値が変わるたびに呼ぶ(背景の揺れ・速度感を連動させる用) */
  public onLevel: ((level: number) => void) | null = null;
  /** 画面を閉じた時(表示中だった場合だけ)に呼ぶ。ロード中だけ鳴らすエンジン音を止める用 */
  public onHide: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="stage-loading-wrap" id="stage-loading-wrap">
        <h2 class="stage-loading-title" id="stage-loading-title">
          <span class="stage-name-block"></span>
        </h2>
        <div class="ld-speed">
          <div class="ld-meter">
            <div class="ld-bar" id="ld-bar">
              <div class="ld-track"></div>
              <div class="ld-glow"><div class="ld-fill" id="stage-loading-fill"></div></div>
            </div>
          </div>
        </div>
        <div class="stage-loading-credit" id="stage-loading-credit"></div>
      </div>
    `;

    this.stageTitleEl = this.container.querySelector('#stage-loading-title')!;
    this.progressFillEl = this.container.querySelector('#stage-loading-fill')!;
    this.creditEl = this.container.querySelector('#stage-loading-credit')!;
    this.wrapEl = this.container.querySelector('#stage-loading-wrap')!;
    this.barEl = this.container.querySelector('#ld-bar')!;
  }

  public show(courseName: string, attribution?: string): void {
    this.stageTitleEl.replaceChildren(Object.assign(document.createElement('span'), { className: 'stage-name-block', textContent: courseName }));
    this.creditEl.textContent = attribution || '';
    this.creditEl.style.display = attribution ? 'block' : 'none';
    this.target = 0;
    this.shown = 0;
    this.container.classList.remove('leaving');
    this.container.style.display = 'flex';
    this.isVisible = true;
    this.paint(0);
    // メーターは見た目と音だけに効くので、本当の時刻・追わないフレームで動かす(目標は読み込みの進み次第で、記録と再生とで変わるため)
    this.lastTick = realNow();
    untrackedCancelFrame(this.raf);
    this.raf = untrackedFrame(this.tick);
  }

  /** メーターの値(0〜1)を、数字・バー・色・揺れに反映する */
  private paint(v: number): void {
    this.progressFillEl.style.clipPath = `inset(0 ${((1 - v) * 100).toFixed(1)}% 0 0)`;
    this.barEl.style.setProperty('--sk', `${(-14 - v * 14).toFixed(1)}deg`);       // 速いほどバーが寝る
    // 色: シアン → 黄 → 赤(枠・光・数字がまとめて変わる)
    const [r, g, b] = lerpStops(v);
    const st = this.container.style;
    st.setProperty('--ld-rgb', `${r}, ${g}, ${b}`);
    st.setProperty('--ld-lv', v.toFixed(3));
    this.container.classList.toggle('redline', v >= 0.82);
    this.onLevel?.(v);
  }

  private tick = (now: number): void => {
    if (!this.isVisible) return;
    const dt = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    // 実際の進行に追いつくよう、なめらかに増やす(一気に飛ばない)
    const diff = this.target - this.shown;
    if (diff > 0) this.shown = Math.min(this.target, this.shown + Math.max(diff * dt * 4, dt * 0.18), this.shown + dt * 0.7);
    this.paint(this.shown);
    // 揺れ: 速くなるほど(特に赤くなってから)カードが震える
    if (!this.container.classList.contains('leaving')) {
      const k = Math.max(0, this.shown - 0.3) / 0.7;
      const amp = k * k * 6;
      this.wrapEl.style.transform = amp > 0.05 ? `translate(${((untrackedRandom() - 0.5) * amp).toFixed(2)}px, ${((untrackedRandom() - 0.5) * amp).toFixed(2)}px)` : '';
    } else {
      this.wrapEl.style.transform = '';
    }
    this.raf = untrackedFrame(this.tick);
  };

  public updateProgress(loaded: number, total: number): void {
    const pct = total > 0 ? Math.min(1, loaded / total) : 1;
    this.target = Math.max(this.target, pct);
  }

  /**
   * メーターを振り切るまで上げる(読み込みが速くても、最後までなめらかに)。このあと leave() でカードをしまう。
   * 2つに分けるのは、振り切るまでは読み込み画面として、戻る操作でレースを取り消せるようにするため(main.ts の cancelRaceLoading)。
   */
  public async fillMeter(): Promise<void> {
    this.target = 1;
    // 振り切るまで待つ(メーターは本当の時刻で動くので、操作のリプレイでは、記録と同じ所で振り切ったことにする)
    await replayBarrier('loading-meter', new Promise<void>((resolve) => {
      const t0 = realNow();
      const poll = (): void => {
        if (this.shown >= 0.995 || realNow() - t0 >= 3000) resolve();
        else untrackedTimeout(poll, 30);
      };
      poll();
    }));
  }

  /** 振り切ったメーターのカードをしまう。画面は閉じない(発進演出のあとで hide する)。 */
  public async leave(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 320));        // 振り切ったまま、ひと呼吸
    this.container.classList.add('leaving');
    await new Promise((resolve) => setTimeout(resolve, 220));
  }

  private fadeEl: HTMLElement | null = null;

  /** 画面全体を暗転させる(完全に暗くなったら resolve)。この間に、背後で場面を入れ替える。 */
  public async blackout(ms = 260): Promise<void> {
    this.fadeEl?.remove();
    const el = document.createElement('div');
    el.className = 'stage-fade';
    el.style.transition = `opacity ${ms}ms ease-in`;
    (this.container.parentElement ?? document.body).append(el);
    this.fadeEl = el;
    void el.offsetWidth;                                   // 初期状態(透明)を確定させてから、不透明へ
    el.style.opacity = '1';
    // 何かで明転されなかった時に、画面が暗いまま残らないようにする
    untrackedTimeout(() => { if (this.fadeEl === el) this.reveal(400); }, 10000);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  /** 暗転を解いて、走行シーンを見せる。入れ替えた直後の最初の描画を待ってから明るくする。 */
  public reveal(ms = 650): void {
    const el = this.fadeEl;
    if (!el) return;
    this.fadeEl = null;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = `opacity ${ms}ms ease-out`;
      el.style.opacity = '0';
      untrackedTimeout(() => el.remove(), ms + 80);
    }));
  }

  public hide(): void {
    const wasVisible = this.isVisible;
    this.container.style.display = 'none';
    this.isVisible = false;
    untrackedCancelFrame(this.raf);
    this.onLevel?.(0);
    if (wasVisible) this.onHide?.();
  }

  public isOpen(): boolean {
    return this.isVisible;
  }
}
