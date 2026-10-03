import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import type { ClientMsg, Mode, RoomMsg, ServerMsg } from '../../../../shared/ennichiProtocol';
import { MAX_PLAYERS, MODES, MODE_LABELS } from '../../../../shared/ennichiProtocol';
import { LobbyConnection } from '../../../../shared/online/LobbyConnection';
import { WishSelect } from '../../../../shared/online/WishSelect';
import type { ModeItem } from '../../../../shared/online/ModeSelect';
import { COOP_ART, VERSUS_ART } from './modeArt';
import type { EnnichiNet } from './net';

export interface WaitDeps {
  /** 退出して戻る(モード選択へ)。 */
  onBack: () => void;
  /** 接続エラー発生時にタイトルへ戻る。 */
  onErrorToTitle?: (message: string) => void;
}

const css = `
.ewait { position: fixed; inset: 0; z-index: 9985; display: none; pointer-events: none; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; color: #fff; }
.ewait-card { position: absolute; left: 50%; bottom: 5%; transform: translateX(-50%); pointer-events: auto; width: min(540px, 94vw); box-sizing: border-box; padding: 16px 20px;
  border: 1px solid #ffd54a; border-radius: 14px; background: rgba(12, 14, 22, .92); box-shadow: 0 0 30px rgba(255, 213, 74, .25); display: flex; flex-direction: column; gap: 10px; }
.ewait-card.alert { bottom: auto; top: 38%; width: min(380px, 92vw); }
.ewait h2 { margin: 0; font-size: .95rem; letter-spacing: .16em; color: #ffd54a; text-align: center; }
.ewait p { margin: 0; color: #e2e8f0; font-size: .88rem; line-height: 1.6; text-align: center; white-space: pre-line; }
.ewait .count { text-align: center; font-size: 2.2rem; font-weight: 900; letter-spacing: .06em; color: #ffd54a; text-shadow: 0 0 18px rgba(255, 213, 74, .4); }
.ewait .sub { font-size: .72rem; color: #8fa3c2; letter-spacing: .08em; }
.ewait .players { display: flex; flex-direction: column; gap: 5px; }
.ewait .player { display: flex; align-items: center; gap: 8px; padding: .4em .6em; border-radius: 8px; background: #0c1626; border: 1px solid #22304a; font-size: .85rem; }
.ewait .player.me { border-color: #ffd54a; }
.ewait .player .name { flex: 1; font-weight: 700; }
.ewait .player .wish { font-size: .75rem; color: #a8b8d0; }
.ewait .row { display: flex; gap: 10px; }
.ewait .row > * { flex: 1; }
.ewait button { font: inherit; font-weight: 700; font-size: .92rem; padding: .6em 1em; border-radius: 9px; border: 1px solid #3a4a66; background: #14213a; color: #fff; cursor: pointer; }
.ewait button.sel { border-color: #ffd54a; background: #2a2410; }
.ewait button.primary { background: linear-gradient(135deg, #ffd54a, #ff8c00); border-color: #ffe082; color: #05070c; }
.ewait button.pad-focus, .ewait button:focus-visible { outline: 3px solid #ffd54a; outline-offset: 2px; }
`;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { cls?: string } = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const { cls, ...rest } = props;
  const e = Object.assign(document.createElement(tag), rest);
  if (cls) e.className = cls;
  for (const c of children) e.append(c);
  return e;
}

/**
 * えんにち射的 オンライン対戦の待機。接続・自動参加は LobbyConnection(共通部品)。
 *  1) ゲームモードの希望の画面(midnight-skyway のコース選択と同じカード): 対戦 / 協力 を選ぶと、その場で希望として送られる。
 *     決定ボタンの位置に「あと◯秒 / 待機中」が出る。決定で2)へ。
 *  2) 待機画面: 参加者と「あと◯秒 / 待機中」。希望に戻る / 退出。
 * 2人目が入ると30秒で自動開始(どちらの画面にいても始まる)。参加できない時の案内は、どちらの画面でも中央に出る。
 * レバー/矢印・A/START/Enter・B/Esc で操作できる。
 */
export class WaitScreen {
  private readonly conn: LobbyConnection<RoomMsg, ServerMsg, ClientMsg>;
  private readonly client: EnnichiNet;
  private readonly deps: WaitDeps;
  private readonly root: HTMLElement;
  private card: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private visible = false;
  /** wish=モードの希望(カード) / wait=待機画面 */
  private view: 'wish' | 'wait' = 'wish';
  private readonly wish: WishSelect;
  private ticker: number | null = null;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private padFocus = 0;

  constructor(client: EnnichiNet, deps: WaitDeps) {
    this.client = client;
    this.deps = deps;
    if (!document.getElementById('ewait-style')) document.head.append(el('style', { id: 'ewait-style', textContent: css }));
    this.root = el('div', { cls: 'ewait' });
    document.body.append(this.root);
    this.wish = new WishSelect(
      { title: 'ゲームモード希望', backLabel: '退出', accent: '#ffd54a', accentEnd: '#ff8c00' },
      {
        onWish: (id) => this.client.send({ t: 'pref', mode: id as Mode | null }),
        onConfirm: () => {
          this.view = 'wait';
          this.padFocus = 0;
          this.render();
        },
        onBack: () => this.back(),
      },
    );
    this.conn = new LobbyConnection<RoomMsg, ServerMsg, ClientMsg>(client, {
      onChange: () => this.render(),
      onProblem: () => {},                                   // この画面が案内を出すので、移動は不要
    });
  }

  public get room(): RoomMsg | null {
    return this.conn.room;
  }

  /** サーバーからの room 通知(非表示中も受け取る)。null=ルームを出た。 */
  public setRoom(m: RoomMsg | null): void {
    this.conn.setRoom(m);
  }

  public show(): void {
    if (this.visible) {
      this.render();
      return;
    }
    this.visible = true;
    this.root.style.display = 'block';
    this.view = 'wish';
    this.ticker = window.setInterval(() => {
      const label = this.conn.label();
      if (this.countEl) this.countEl.textContent = label;
      this.wish.setLabel(label);                               // 希望の画面の決定ボタンの位置にも出す
    }, 250);
    this.startInput();
    this.conn.start();
  }

  public hide(): void {
    this.visible = false;
    this.root.style.display = 'none';
    this.conn.stop();
    this.wish.hide();
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    this.stopInput();
    this.card?.remove();
    this.card = null;
    this.countEl = null;
  }

  /** この画面が操作を受け持つのは、待機画面と、参加できない案内の時だけ(希望の画面は WishSelect が受け持つ)。 */
  private ownsInput(): boolean {
    return this.view === 'wait' || this.conn.hasProblem;
  }

  private back(): void {
    this.deps.onBack();
  }

  /** 希望の画面に出すカード(票数と自分の希望を反映)。 */
  private wishItems(room: RoomMsg | null): ModeItem[] {
    const votes = room?.votes ?? {};
    const info: Record<Mode, { badge: string; art: string; desc: string }> = {
      versus: { badge: 'VERSUS', art: VERSUS_ART, desc: '同時に撃ち合って、一番得点が高い人が勝ち。共有のUFOは早い者勝ち。' },
      coop: { badge: 'CO-OP', art: COOP_ART, desc: '点数を合算して、みんなでチームのランクを目指す。巨大UFOは全員の命中で倒す。' },
    };
    return MODES.map((m) => ({ id: m, badge: info[m].badge, art: info[m].art, title: MODE_LABELS[m], sub: `希望 ${votes[m] ?? 0}人`, desc: info[m].desc }));
  }

  private buttons(): HTMLButtonElement[] {
    const b = this.card ? [...this.card.querySelectorAll<HTMLButtonElement>('button')] : [];
    b.forEach((x) => { x.tabIndex = -1; });
    return b;
  }

  private applyFocus(): void {
    const b = this.buttons();
    if (b.length === 0) return;
    this.padFocus = Math.min(Math.max(0, this.padFocus), b.length - 1);
    b.forEach((x, i) => x.classList.toggle('pad-focus', i === this.padFocus));
  }

  private startInput(): void {
    this.padFocus = 0;
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (!this.visible || !this.ownsInput()) return;
      const b = this.buttons();
      if (b.length === 0) return;
      if (p.left || p.up) { this.padFocus = (this.padFocus - 1 + b.length) % b.length; this.applyFocus(); }
      else if (p.right || p.down) { this.padFocus = (this.padFocus + 1) % b.length; this.applyFocus(); }
      else if (p.any(0)) b[this.padFocus]?.click();
      else if (p.any(1)) this.back();
    });
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.visible || !this.ownsInput()) return;
      const b = this.buttons();
      const move = (d: number) => {
        e.preventDefault();
        if (b.length === 0) return;
        this.padFocus = (this.padFocus + d + b.length) % b.length;
        this.applyFocus();
      };
      if (e.code === 'ArrowLeft' || e.code === 'ArrowUp' || e.code === 'KeyA' || e.code === 'KeyW') move(-1);
      else if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'KeyD' || e.code === 'KeyS') move(1);
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyZ') {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        b[this.padFocus]?.click();
      } else if (e.code === 'Escape' || e.code === 'Backspace') {
        e.preventDefault();
        this.back();
      }
    };
    window.addEventListener('keydown', this.keyHandler);
  }

  private stopInput(): void {
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = null;
  }

  private render(): void {
    if (!this.visible) return;
    this.card?.remove();
    this.card = null;
    this.countEl = null;
    const c = this.conn;
    const room = c.room;

    if (c.hasProblem) {
      this.wish.hide();
      const msg = c.view === 'closed'
        ? '現在、オンライン対戦は開催していません'
        : (c.message || '接続エラーが発生しました');
      this.hide();
      if (this.deps.onErrorToTitle) {
        this.deps.onErrorToTitle(msg);
      } else {
        this.back();
      }
      return;
    }

    if (this.view === 'wish') {
      // モードの希望(カード)。主催者がモードを固定している時は、固定のモードだけが選ばれた状態で、変えられない
      const mine = room?.players.find((p) => p.id === room.you)?.mode ?? null;
      const fixed = room && room.modeSetting !== 'random' ? room.modeSetting : null;
      this.wish.update(this.wishItems(room), fixed ?? mine, fixed !== null);
      this.wish.show();
      return;
    }
    this.wish.hide();

    const card = el('div', { cls: 'ewait-card' }, el('h2', { textContent: 'オンライン対戦' }));
    this.countEl = el('div', { cls: 'count', textContent: c.label() });
    card.append(this.countEl);
    if (c.view === 'room' && room) {
      const list = el('div', { cls: 'players' });
      for (const pl of room.players) {
        list.append(el('div', { cls: pl.id === room.you ? 'player me' : 'player' },
          el('span', { cls: 'name', textContent: pl.id === room.you ? `${pl.name}（あなた）` : pl.name }),
          el('span', { cls: 'wish', textContent: pl.mode ? `${MODE_LABELS[pl.mode]}を希望` : '希望なし' })));
      }
      card.append(el('div', {}, el('div', { cls: 'sub', textContent: `参加者 ${room.players.length} / ${MAX_PLAYERS}` }), list));

      if (room.modeSetting !== 'random') {
        card.append(el('p', { textContent: `ゲームモード: ${MODE_LABELS[room.modeSetting as Mode] ?? room.modeSetting}` }));
      }
    }
    const toWish = el('button', { textContent: 'モード希望へ戻る' });
    toWish.onclick = () => {
      this.view = 'wish';
      this.render();
    };
    const leave = el('button', { textContent: '退出' });
    leave.onclick = () => this.back();
    card.append(el('div', { cls: 'row' }, toWish, leave));
    this.card = card;
    this.root.append(card);
    this.applyFocus();
  }
}
