import type { ClientMsg, PlayerInfo, ServerMsg } from '../../../../shared/netProtocol';
import { MAX_PLAYERS } from '../../../../shared/netProtocol';
import type { SkywayNet } from '../net/skywayNet';
import { LobbyConnection } from '../../../../shared/online/LobbyConnection';
import { ButtonCardNav, el } from '../../../../shared/online/buttonCardNav';
import { STAGES } from './stages';

type RoomMsg = Extract<ServerMsg, { t: 'room' }>;

export interface LobbyDeps {
  /** 退出して戻る(モード選択へ)。 */
  onBack: () => void;
  /** 待機画面からコース希望の画面へ戻る。 */
  onBackToCourse: () => void;
  /** 選ぼうとした色が他の人に取られていた(選択を戻す/次の色へ進める)。 */
  onColorTaken: () => void;
  /**
   * 接続できない・閉鎖・満員などで参加できなくなった。案内のカードはコントローラーで操作できる待機画面に出すため、
   * マシン選択/コース希望の画面にいる時は、main が待機画面へ移す。
   */
  onProblem: () => void;
  /** 接続エラー発生時にタイトルへ戻る。 */
  onErrorToTitle?: (message: string) => void;
}

const CAR_NAMES: Record<string, string> = {
  trail_j: 'TRAIL J',
  cross_j: 'CROSS J',
  combat_sedan: 'COMBAT SEDAN',
  missile_truck_j: 'TRUCK J MLRS',
};

const css = `
.lobby { position: absolute; inset: 0; display: none; z-index: 60; pointer-events: none; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; color: #fff; }
.lobby-card { position: absolute; left: 50%; transform: translateX(-50%); pointer-events: auto; width: min(520px, 94vw); box-sizing: border-box; padding: 16px 20px; border: 1px solid #00e5ff; border-radius: 14px;
  background: rgba(6, 12, 24, .9); box-shadow: 0 0 30px rgba(0, 229, 255, .25); display: flex; flex-direction: column; gap: 10px; }
.lobby-card.wait { bottom: 5%; }
.lobby-card.alert { top: 38%; width: min(380px, 92vw); }
.lobby-card h2 { margin: 0; font-size: .95rem; letter-spacing: .16em; color: #00e5ff; text-align: center; }
.lobby-card p { margin: 0; color: #cfd8e6; font-size: .88rem; line-height: 1.6; text-align: center; white-space: pre-line; }
.lobby-card .lb-count { text-align: center; font-size: 2.2rem; font-weight: 900; letter-spacing: .06em; color: #ffd54a; text-shadow: 0 0 18px rgba(255, 213, 74, .4); }
.lobby-card .lb-sub { font-size: .72rem; color: #8fa3c2; letter-spacing: .08em; }
.lobby-card .lb-players { display: flex; flex-direction: column; gap: 5px; }
.lobby-card .lb-player { display: flex; align-items: center; gap: 8px; padding: .4em .6em; border-radius: 8px; background: #0c1626; border: 1px solid #22304a; font-size: .85rem; }
.lobby-card .lb-player.me { border-color: #00e5ff; }
.lobby-card .lb-player.empty { color: #7f90ad; }
.lobby-card .lb-dot { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #fff; flex: none; background: #555; }
.lobby-card .lb-dot.none { border-style: dashed; background: transparent; }
.lobby-card .lb-name { flex: 1; font-weight: 700; white-space: nowrap; }
.lobby-card .lb-meta { font-size: .72rem; color: #9fb0cc; text-align: right; line-height: 1.3; white-space: pre-line; }
.lobby-card .lb-row { display: flex; gap: 10px; }
.lobby-card .lb-row > * { flex: 1; }
.lobby-card button { font: inherit; font-weight: 700; font-size: .92rem; padding: .6em 1em; border-radius: 9px; border: 1px solid #3a4a66; background: #14213a; color: #fff; cursor: pointer; }
.lobby-card button.primary { background: linear-gradient(135deg, #00b8d4, #0091ea); border-color: #00e5ff; }
.lobby-card button.pad-focus, .lobby-card button:focus-visible { outline: 3px solid #ffd54a; outline-offset: 2px; }
`;

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');

/**
 * オンライン対戦の接続・参加と、待機画面。
 *  - 開いたら接続して自動で参加する(名前はサーバーが走り屋の二つ名からランダムに付ける)。2人目が入ると30秒で自動開始。
 *  - マシン選択・コース希望の間は何も表示しない(選んでいる間に開始時間が来ても、そのまま始まる)。
 *    接続できない・閉鎖・満員などの時だけ、どの画面でも中央にカードを出す。
 *  - コース希望まで進んだあとの待機画面(setWaitingVisible(true))で、参加者・開始までの残り(あと◯秒 / 待機中)を出す。
 *    待機画面はコントローラーとキーボードで操作できる: レバー/矢印でボタンを選び、A/START/Enter で決定、B/Esc で戻る(参加できない時の案内カードも同じ)。
 */
export class LobbyScreen {
  /** 接続・参加・参加できない状態(共通部品)。このクラスは skyway の画面と操作を受け持つ。 */
  private readonly conn: LobbyConnection<RoomMsg, ServerMsg, ClientMsg>;
  private readonly container: HTMLElement;
  private readonly deps: LobbyDeps;
  private visible = false;
  private waiting = false;
  private ticker: number | null = null;
  private card: HTMLElement | null = null;
  private readonly nav = new ButtonCardNav({
    getCard: () => this.card,
    isActive: () => this.visible && this.waiting,
    onBack: () => this.back(),
  });
  private countEl: HTMLElement | null = null;

  constructor(container: HTMLElement, client: SkywayNet, deps: LobbyDeps) {
    this.container = container;
    this.deps = deps;
    this.conn = new LobbyConnection<RoomMsg, ServerMsg, ClientMsg>(client, {
      onChange: () => this.render(),
      onProblem: () => this.deps.onProblem(),
      onError: (code) => {
        if (code !== 'color_taken') return false;
        this.deps.onColorTaken();
        return true;
      },
    });
    if (!document.getElementById('lobby-style')) document.head.append(el('style', { id: 'lobby-style', textContent: css }));
    container.classList.add('lobby');
  }

  public get room(): RoomMsg | null {
    return this.conn.room;
  }

  /** 自分のコースの希望(null=希望なし) */
  public get myCourse(): string | null {
    const r = this.conn.room;
    return r?.players.find((p) => p.id === r.you)?.course ?? null;
  }

  /** 他の参加者が使っているマシンの色(body)。 */
  public othersBodies(): Set<number> {
    const r = this.conn.room;
    const set = new Set<number>();
    if (r) for (const p of r.players) if (p.id !== r.you && p.car) set.add(p.car.body);
    return set;
  }

  /** サーバーからの room 通知(非表示中も main から受け取る)。null=ルームを出た。 */
  public setRoom(m: RoomMsg | null): void {
    this.conn.setRoom(m);
  }

  /** 待機画面(参加者・開始までの残り)を出す/隠す。マシン選択・コース希望の間は隠す。 */
  public setWaitingVisible(on: boolean): void {
    this.waiting = on;
    this.nav.stop();
    if (on && this.visible) this.nav.start();
    this.render();
  }

  public show(): void {
    if (this.visible) {                                     // マシン選択・コース希望・待機の間の行き来では、接続し直さない
      this.render();
      return;
    }
    this.visible = true;
    this.container.style.display = 'block';
    this.ticker = window.setInterval(() => this.tickCountdown(), 250);
    if (this.waiting) this.nav.start();
    this.conn.start();
  }

  public hide(): void {
    this.visible = false;
    this.waiting = false;
    this.container.style.display = 'none';
    this.conn.stop();
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    this.nav.stop();
    this.card?.remove();
    this.card = null;
    this.countEl = null;
  }

  /** B・Esc: 通常はコース希望へ戻る。参加できない案内が出ている時は、退出する。 */
  private back(): void {
    if (this.conn.hasProblem) this.deps.onBack();
    else this.deps.onBackToCourse();
  }

  private tickCountdown(): void {
    if (this.countEl) this.countEl.textContent = this.conn.label();
  }

  private playerRow(pl: PlayerInfo, you: number): HTMLElement {
    const dot = el('span', { cls: pl.car ? 'lb-dot' : 'lb-dot none' });
    if (pl.car) dot.style.background = hex(pl.car.body);
    const stage = pl.course ? STAGES.find((s) => s.id === pl.course) : null;
    return el('div', { cls: pl.id === you ? 'lb-player me' : 'lb-player' },
      dot,
      el('span', { cls: 'lb-name', textContent: pl.id === you ? `${pl.name}（あなた）` : pl.name }),
      el('span', { cls: 'lb-meta', textContent: `${pl.car ? CAR_NAMES[pl.car.type] ?? pl.car.type : 'マシン未選択'}\n${stage ? stage.title : 'コース未選択'}` }),
    );
  }

  private render(): void {
    if (!this.visible) return;
    this.card?.remove();
    this.card = null;
    this.countEl = null;
    const room = this.conn.room;
    const c = this.conn;

    if (c.hasProblem) {
      const msg = c.view === 'closed'
        ? '現在、オンライン対戦は開催していません'
        : (c.message || '接続エラーが発生しました');
      this.hide();
      if (this.deps.onErrorToTitle) {
        this.deps.onErrorToTitle(msg);
      } else {
        this.deps.onBack();
      }
      return;
    }

    if (!this.waiting) return;                              // マシン選択・コース希望の間は何も出さない

    // 待機画面
    const card = el('div', { cls: 'lobby-card wait' }, el('h2', { textContent: 'オンライン対戦' }));
    this.countEl = el('div', { cls: 'lb-count', textContent: c.label() });
    card.append(this.countEl);
    if (c.view === 'room' && room) {
      const list = el('div', { cls: 'lb-players' });
      for (const pl of room.players) list.append(this.playerRow(pl, room.you));
      for (let i = room.players.length; i < MAX_PLAYERS; i++) {
        // 空いている枠。参加済みの行と同じ高さになるよう、見えない2行ぶんの文字を入れる(行の高さは右側の2行表示で決まる)
        list.append(el('div', { cls: 'lb-player empty' }, el('span', { cls: 'lb-dot none' }), el('span', { cls: 'lb-name', textContent: '対戦相手を待っています…' }), el('span', { cls: 'lb-meta', textContent: '\u00a0\n\u00a0' })));
      }
      card.append(el('div', { cls: 'lb-sub', textContent: `参加者 ${room.players.length} / ${MAX_PLAYERS}` }), list);
      if (room.mapMode !== 'random') {
        const st = STAGES.find((s) => s.id === room.mapMode);
        card.append(el('p', { textContent: `コース: ${st?.title ?? room.mapMode}` }));
      }
    }
    const toCourse = el('button', { textContent: 'コース希望へ戻る' });
    toCourse.onclick = () => this.deps.onBackToCourse();
    const leave = el('button', { textContent: '退出' });
    leave.onclick = () => this.deps.onBack();
    card.append(el('div', { cls: 'lb-row' }, toCourse, leave));
    this.card = card;
    this.container.append(card);
    this.nav.apply();
  }
}
