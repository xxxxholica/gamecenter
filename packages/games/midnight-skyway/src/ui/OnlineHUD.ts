import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import type { FinishEntry } from '../../../../shared/netProtocol';
import type { StandingRow } from '../net/OnlineRace';

const css = `
.ohud { position: absolute; inset: 0; pointer-events: none; z-index: 60; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; color: #fff; display: none; }
.ohud-stand { position: absolute; top: 40px; right: 28px; display: flex; align-items: baseline; gap: 4px; font-family: Impact, 'Arial Black', system-ui, sans-serif; font-style: italic; line-height: .88; color: #fff;
  text-shadow: 0 4px 0 rgba(0,0,0,.7), 0 0 18px rgba(0,0,0,.95), 0 0 32px rgba(0,229,255,.5); transform-origin: top right; }
.ohud-stand .num { font-size: clamp(84px, 10vw, 132px); letter-spacing: -2px; }
.ohud-stand .suf { font-size: clamp(38px, 4.5vw, 60px); margin-left: 2px; }
.ohud-stand.p1 { color: #ffd54a; text-shadow: 0 4px 0 rgba(0,0,0,.7), 0 0 18px rgba(0,0,0,.95), 0 0 36px rgba(255,213,74,.65); }
.ohud-stand.p2 { color: #eaf0f8; text-shadow: 0 4px 0 rgba(0,0,0,.7), 0 0 18px rgba(0,0,0,.95), 0 0 36px rgba(234,240,248,.55); }
.ohud-stand.p3 { color: #ff9d5c; text-shadow: 0 4px 0 rgba(0,0,0,.7), 0 0 18px rgba(0,0,0,.95), 0 0 36px rgba(255,157,92,.55); }
.ohud-stand.p4 { color: #a0b4d4; text-shadow: 0 4px 0 rgba(0,0,0,.7), 0 0 18px rgba(0,0,0,.95), 0 0 36px rgba(160,180,212,.45); }
@keyframes standPop { 0% { transform: scale(1.22); } 100% { transform: scale(1); } }
.ohud-stand.pop { animation: standPop .25s ease-out; }
.ohud-row { display: flex; align-items: center; gap: 8px; padding: 3px 2px; font-size: .95rem; font-weight: 700; text-shadow: 0 1px 3px #000; }
.ohud-row.me { color: #00f0ff; }
.ohud-rank { width: 1.2em; text-align: right; color: #ffd54a; }
.ohud-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid #fff; flex: none; }
.ohud-name { flex: 1; max-width: 14em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ohud-time { font-variant-numeric: tabular-nums; font-size: .85rem; color: #cfd8e6; }
.ohud-toasts { position: absolute; top: 18%; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ohud-toast { padding: 8px 18px; border-radius: 999px; background: rgba(4,8,18,.8); border: 1px solid #00e5ff; font-weight: 700; animation: ohudIn .2s ease-out; }
@keyframes ohudIn { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
.ohud-wait { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -50%); padding: 16px 30px; border-radius: 12px; background: rgba(4,8,18,.82); border: 1px solid #00e5ff; font-size: 1.2rem; font-weight: 700; display: none; }
.ohud-result { display: none; }
.ohud-result .hud-arcade-modal-box { box-sizing: border-box; max-height: 94vh; overflow-y: auto; }
.ohud-result .stat-line.me { color: #00f0ff; font-weight: 900; }
.ohud-result .stat-line { display: flex; align-items: center; justify-content: space-between; font-size: 14px; padding: 4px 0; }
.ohud-result .online-res-left { display: flex; align-items: center; gap: 8px; }
.ohud-result .online-res-rk { font-family: Impact, 'Arial Black', sans-serif; font-style: italic; font-size: 17px; color: #ffd54a; width: 1.8em; }
.ohud-result .online-res-dot { width: 11px; height: 11px; border-radius: 50%; border: 2px solid #fff; flex: none; }
.ohud-result .online-res-name { max-width: 14em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ohud-result .online-res-time { font-variant-numeric: tabular-nums; font-family: Impact, 'Arial Black', sans-serif; letter-spacing: 1px; }
.ohud-note { text-align: center; font-size: .85rem; color: #9fb0cc; margin: 10px 0 4px; font-variant-numeric: tabular-nums; }
`;

const fmt = (ms: number): string => {
  const t = Math.floor(ms);
  return `${String(Math.floor(t / 60000)).padStart(2, '0')}:${String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${String(t % 1000).padStart(3, '0')}`;
};

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

const esc = (str: string): string => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** オンライン対戦中の表示: 順位表・通知・待機表示・最終結果。 */
export class OnlineHUD {
  public onLeave: () => void = () => {};
  private readonly root: HTMLElement;
  private readonly stand: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly wait: HTMLElement;
  private readonly result: HTMLElement;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private currentPlace = 0;

  constructor(parent: HTMLElement) {
    if (!document.getElementById('ohud-style')) {
      const st = document.createElement('style');
      st.id = 'ohud-style';
      st.textContent = css;
      document.head.append(st);
    }
    this.root = document.createElement('div');
    this.root.className = 'ohud';
    this.stand = document.createElement('div');
    this.stand.className = 'ohud-stand';
    this.toasts = document.createElement('div');
    this.toasts.className = 'ohud-toasts';
    this.wait = document.createElement('div');
    this.wait.className = 'ohud-wait';
    this.result = document.createElement('div');
    this.result.className = 'ohud-result hud-result-modal hud-result-side';
    this.result.style.display = 'none';
    this.root.append(this.stand, this.toasts, this.wait, this.result);
    parent.append(this.root);
  }

  public show(): void {
    this.root.style.display = 'block';
  }

  public hide(): void {
    this.root.style.display = 'none';
    this.stand.replaceChildren();
    this.toasts.replaceChildren();
    this.showWaiting(null);
    this.hideResults();
    this.currentPlace = 0;
  }


  /** 自分の順位だけを大きく出す(1st / 2nd / 3rd / 4th)。枠で囲まない。 */
  public setStandings(rows: StandingRow[]): void {
    const i = rows.findIndex((r) => r.me);
    if (i < 0) return;
    const place = i + 1;
    const changed = this.currentPlace !== 0 && this.currentPlace !== place;
    this.currentPlace = place;
    const num = Object.assign(document.createElement('span'), { className: 'num', textContent: String(place) });
    const suf = Object.assign(document.createElement('span'), { className: 'suf', textContent: ['st', 'nd', 'rd', 'th'][i] ?? 'th' });
    this.stand.className = `ohud-stand p${Math.min(place, 4)}` + (changed ? ' pop' : '');
    this.stand.replaceChildren(num, suf);
  }

  public toast(text: string): void {
    this.root.style.display = 'block';
    const t = Object.assign(document.createElement('div'), { className: 'ohud-toast', textContent: text });
    this.toasts.append(t);
    setTimeout(() => {
      t.remove();
      if (!this.toasts.hasChildNodes() && !this.stand.hasChildNodes() && this.wait.style.display === 'none' && this.result.style.display === 'none') {
        this.root.style.display = 'none';
      }
    }, 3500);
  }

  public showWaiting(text: string | null): void {
    this.wait.style.display = text ? 'block' : 'none';
    if (text) this.wait.textContent = text;
  }

  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  private countdownTimer: ReturnType<typeof setInterval> | null = null;

  /** 自分のゴール後に出す結果。他の人がゴールするたびに更新される。done=全員ゴール(または打ち切り)。endsInMs=終了までの残り時間。 */
  public showResults(entries: FinishEntry[], you: number, done: boolean, colors: Map<number, number>, endsInMs?: number): void {
    const myEntry = entries.find((e) => e.id === you);
    const myRankIdx = entries.findIndex((e) => e.id === you);
    const myPlace = myRankIdx >= 0 ? myRankIdx + 1 : 1;

    let titleText = 'ゴール';
    if (done) {
      if (myEntry && myEntry.timeMs === null) titleText = 'タイムアップ';
      else titleText = myPlace === 1 ? '優勝' : `${myPlace}位`;
    }
    const myTime = myEntry?.timeMs !== null && myEntry?.timeMs !== undefined ? fmt(myEntry.timeMs) : '記録なし';

    const tableRows = entries.map((e, i) => {
      const isMe = e.id === you;
      const rankStr = e.timeMs !== null ? (['1st', '2nd', '3rd', '4th'][i] ?? `${i + 1}th`) : '-';
      const timeStr = e.timeMs !== null ? fmt(e.timeMs) : (done ? '記録なし' : '走行中');
      return `
        <div class="stat-line ${isMe ? 'me' : ''}">
          <span class="online-res-left">
            <span class="online-res-rk">${rankStr}</span>
            <span class="online-res-dot" style="background: ${hex(colors.get(e.id) ?? 0xffffff)};"></span>
            <span class="online-res-name">${esc(e.name)}${isMe ? '（あなた）' : ''}</span>
          </span>
          <span class="val online-res-time">${timeStr}</span>
        </div>
      `;
    }).join('');

    this.result.innerHTML = `
      <div class="hud-arcade-modal-box">
        <div class="arcade-modal-title gold">${titleText}</div>
        <div class="hud-result-time-big">${myTime}</div>
        <div class="hud-result-stats-table">${tableRows}</div>
        ${done ? '' : '<div class="ohud-note ohud-countdown"></div>'}
        <div class="hud-arcade-result-buttons">
          <button class="arcade-btn-primary pad-focus" id="online-result-leave-btn">タイトルへ戻る</button>
        </div>
      </div>
    `;

    // 終了までのカウントダウン(最初のゴールから30秒)
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    const cd = this.result.querySelector<HTMLElement>('.ohud-countdown');
    if (cd) {
      const until = performance.now() + (endsInMs ?? 0);
      const tick = (): void => {
        cd.textContent = endsInMs === undefined ? '他のプレイヤーを待っています' : `終了まで ${Math.max(0, Math.ceil((until - performance.now()) / 1000))}秒`;
      };
      tick();
      if (endsInMs !== undefined) this.countdownTimer = setInterval(tick, 250);
    }

    const btn = this.result.querySelector('#online-result-leave-btn');
    if (btn) {
      btn.addEventListener('click', () => this.onLeave());
    }

    const wasOpen = this.result.style.display === 'flex';
    this.result.style.display = 'flex';
    this.stand.style.display = 'none';

    if (!wasOpen) {
      this.stopPad = startPadLoop(this.padEdge, (p) => {
        if (p.any(0, 1, 9)) this.onLeave();
      });
      if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = (e) => {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') this.onLeave();
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  public hideResults(): void {
    if (this.countdownTimer) clearInterval(this.countdownTimer);
    this.countdownTimer = null;
    this.result.style.display = 'none';
    this.stand.style.display = '';
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }

  public isResultOpen(): boolean {
    return this.result.style.display === 'flex';
  }
}
