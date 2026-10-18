import type { BaseRoom } from './core';
import { LobbyConnection } from './LobbyConnection';
import type { NetClient } from './NetClient';
import { ButtonCardNav, el } from './buttonCardNav';
import { reportPhase } from '../arcadeAnalytics';

/** 待機画面に出す枠の数(どのゲームでも4人分にそろえる。ゲームの定員を超える枠はダミー) */
const SLOTS = 4;

export interface WaitScreenOptions {
  /** ゲームの定員 */
  maxPlayers: number;
  /** カードの枠・見出し・自分の行の色 */
  accent: string;
  /** カードの光(box-shadow の色) */
  accentGlow: string;
  /** 残り表示とフォーカス枠の色 */
  highlight: string;
  /** 残り表示の光(text-shadow の色) */
  highlightGlow: string;
  /** i 番目(参加順)の参加者の色 */
  playerColor: (i: number) => string;
  /** i 番目の参加者の右側の表示(改行で複数行にできる)。既定は「1P」など */
  playerMeta?: (i: number) => string;
  /** 退出して戻る(モード選択へ)。 */
  onBack: () => void;
  /** 接続エラー・閉鎖・満員などで入れない時: 案内を出してタイトルへ戻る。 */
  onErrorToTitle: (message: string) => void;
}

// midnight-skyway の待機画面(LobbyScreen)と同じ見た目。色はゲームごとに --lb-* で変える。
const css = `
.lobby { position: fixed; inset: 0; display: none; z-index: 9985; pointer-events: none; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; color: #fff; }
.lobby-card { position: absolute; left: 50%; transform: translateX(-50%); pointer-events: auto; width: min(520px, 94vw); box-sizing: border-box; padding: 16px 20px; border: 1px solid var(--lb-accent); border-radius: 14px;
  background: rgba(6, 12, 24, .9); box-shadow: 0 0 30px var(--lb-accent-glow); display: flex; flex-direction: column; gap: 10px; }
.lobby-card.wait { bottom: 5%; }
.lobby-card h2 { margin: 0; font-size: .95rem; letter-spacing: .16em; color: var(--lb-accent); text-align: center; }
.lobby-card p { margin: 0; color: #cfd8e6; font-size: .88rem; line-height: 1.6; text-align: center; white-space: pre-line; }
.lobby-card .lb-count { text-align: center; font-size: 2.2rem; font-weight: 900; letter-spacing: .06em; color: var(--lb-highlight); text-shadow: 0 0 18px var(--lb-highlight-glow); }
.lobby-card .lb-sub { font-size: .72rem; color: #8fa3c2; letter-spacing: .08em; }
.lobby-card .lb-players { display: flex; flex-direction: column; gap: 5px; }
.lobby-card .lb-player { display: flex; align-items: center; gap: 8px; padding: .4em .6em; border-radius: 8px; background: #0c1626; border: 1px solid #22304a; font-size: .85rem; }
.lobby-card .lb-player.me { border-color: var(--lb-accent); }
.lobby-card .lb-player.empty { color: #7f90ad; }
.lobby-card .lb-player.dummy { opacity: .35; }
.lobby-card .lb-player.dummy .lb-dot { visibility: hidden; }
.lobby-card .lb-dot { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #fff; flex: none; background: #555; }
.lobby-card .lb-dot.none { border-style: dashed; background: transparent; }
.lobby-card .lb-name { flex: 1; font-weight: 700; white-space: nowrap; }
.lobby-card .lb-meta { font-size: .72rem; color: #9fb0cc; text-align: right; line-height: 1.3; white-space: pre-line; }
.lobby-card .lb-row { display: flex; gap: 10px; }
.lobby-card .lb-row > * { flex: 1; }
.lobby-card button { font: inherit; font-weight: 700; font-size: .92rem; padding: .6em 1em; border-radius: 9px; border: 1px solid #3a4a66; background: #14213a; color: #fff; cursor: pointer; }
.lobby-card button.pad-focus, .lobby-card button:focus-visible { outline: 3px solid var(--lb-highlight); outline-offset: 2px; }
`;

type RoomOf<S> = Extract<S, { t: 'room' }> & BaseRoom;

/**
 * オンライン対戦の待機画面(sumo-smash-3d・tower-stack 共通)。接続・自動参加は LobbyConnection(共通部品)。
 * 参加者(4人枠)と、開始までの残り(2人目が入ると自動で始まる / 自分だけの間は「待機中」)を出し、退出できる。
 * 参加順がそのまま番号と色になる。
 * 入れない時(閉鎖・満員・対戦中・切断)は、リトライを尋ねずにタイトルへ戻して案内する。
 */
export class WaitScreen<S extends { t: string }, C extends { t: string }> {
  private readonly conn: LobbyConnection<RoomOf<S>, S, C>;
  private readonly opts: WaitScreenOptions;
  private readonly root: HTMLElement;
  private card: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private visible = false;
  private ticker: number | null = null;
  private readonly nav = new ButtonCardNav({
    getCard: () => this.card,
    isActive: () => this.visible,
    onBack: () => this.opts.onBack(),
  });

  constructor(client: NetClient<S, C>, opts: WaitScreenOptions) {
    this.opts = opts;
    if (!document.getElementById('lobby-style')) document.head.append(el('style', { id: 'lobby-style', textContent: css }));
    this.root = el('div', { cls: 'lobby' });
    this.root.style.setProperty('--lb-accent', opts.accent);
    this.root.style.setProperty('--lb-accent-glow', opts.accentGlow);
    this.root.style.setProperty('--lb-highlight', opts.highlight);
    this.root.style.setProperty('--lb-highlight-glow', opts.highlightGlow);
    document.body.append(this.root);
    this.conn = new LobbyConnection<RoomOf<S>, S, C>(client, {
      onChange: () => this.render(),
      onProblem: () => {},                                   // render が案内を出して画面を閉じる
    });
  }

  /** サーバーからの room 通知(待機画面を開いている間だけ取り込む)。null=ルームを出た。 */
  public setRoom(m: Extract<S, { t: 'room' }> | null): void {
    // 対戦中や終了後に届く room は取り込まない(残すと、次に待機画面を開いた時に「参加済み」と見なして join を送らず、接続中のまま止まる)
    if (!this.visible) return;
    this.conn.setRoom(m as RoomOf<S> | null);
  }

  public show(): void {
    reportPhase('lobby');
    if (this.visible) {
      this.render();
      return;
    }
    this.visible = true;
    this.root.style.display = 'block';
    this.ticker = window.setInterval(() => {
      if (this.countEl) this.countEl.textContent = this.conn.label();
    }, 250);
    this.nav.start();
    this.conn.start();
  }

  public hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.conn.stop();
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    this.nav.stop();
    this.card?.remove();
    this.card = null;
    this.countEl = null;
  }

  private render(): void {
    if (!this.visible) return;
    this.card?.remove();
    this.card = null;
    this.countEl = null;
    const c = this.conn;

    if (c.hasProblem) {
      const msg = c.view === 'closed' ? '現在、オンライン対戦は開催していません' : c.message || '接続エラーが発生しました';
      this.hide();
      this.opts.onErrorToTitle(msg);
      return;
    }
    if (c.view === 'blocked') {                                // 満員・対戦中: 空くのを待たず、案内してタイトルへ
      const msg = c.message || '参加できません';
      this.hide();
      this.opts.onErrorToTitle(msg);
      return;
    }

    const { maxPlayers, playerColor, playerMeta = (i: number) => `${i + 1}P` } = this.opts;
    // 空き枠の右側にも、参加済みの行と同じ行数の見えない文字を入れる(行の高さは右側の表示で決まる)
    const blankMeta = playerMeta(0).split('\n').map(() => ' ').join('\n');
    const card = el('div', { cls: 'lobby-card wait' }, el('h2', { textContent: 'オンライン対戦' }));
    this.countEl = el('div', { cls: 'lb-count', textContent: c.label() });
    card.append(this.countEl);
    const room = c.room;
    const list = el('div', { cls: 'lb-players' });
    const joined = c.view === 'room' && room ? room.players : [];
    for (let i = 0; i < SLOTS; i++) {
      if (i < joined.length) {
        const pl = joined[i];
        const me = pl.id === room!.you;
        const dot = el('span', { cls: 'lb-dot' });
        dot.style.background = playerColor(i);
        list.append(el('div', { cls: me ? 'lb-player me' : 'lb-player' },
          dot,
          el('span', { cls: 'lb-name', textContent: me ? `${pl.name}（あなた）` : pl.name }),
          el('span', { cls: 'lb-meta', textContent: playerMeta(i) })));
      } else if (i < maxPlayers) {
        list.append(el('div', { cls: 'lb-player empty' }, el('span', { cls: 'lb-dot none' }), el('span', { cls: 'lb-name', textContent: '対戦相手を待っています…' }), el('span', { cls: 'lb-meta', textContent: blankMeta })));
      } else {
        // 4人枠のうち、このゲームでは使わない枠(見た目をそろえるためのダミー)
        list.append(el('div', { cls: 'lb-player empty dummy' }, el('span', { cls: 'lb-dot none' }), el('span', { cls: 'lb-name', textContent: ' ' }), el('span', { cls: 'lb-meta', textContent: blankMeta })));
      }
    }
    card.append(el('div', { cls: 'lb-sub', textContent: `参加者 ${joined.length} / ${maxPlayers}` }), list);
    const leave = el('button', { textContent: '退出' });
    leave.onclick = () => this.opts.onBack();
    card.append(el('div', { cls: 'lb-row' }, leave));
    this.card = card;
    this.root.append(card);
    this.nav.apply();
  }
}
