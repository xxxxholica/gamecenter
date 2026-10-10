import type { ClientMsg, ServerMsg } from '../../../../shared/towerProtocol';
import { ATTACK_EVERY, MAX_PLAYERS } from '../../../../shared/towerProtocol';
import { LobbyConnection } from '../../../../shared/online/LobbyConnection';
import { ButtonCardNav, el } from '../../../../shared/online/buttonCardNav';
import { PLAYER_COLORS, type TowerNet } from './net';

type RoomMsg = Extract<ServerMsg, { t: 'room' }>;

export interface WaitDeps {
  /** 退出して戻る(モード選択へ)。 */
  onBack: () => void;
  /** 接続エラー・閉鎖・満員などで入れない時: 案内を出してタイトルへ戻る。 */
  onErrorToTitle: (message: string) => void;
}

// midnight-skyway・剛体大相撲の待機画面と同じ見た目(色だけこのゲームの黄色)。
const css = `
.lobby { position: fixed; inset: 0; display: none; z-index: 9985; pointer-events: none; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; color: #fff; }
.lobby-card { position: absolute; left: 50%; transform: translateX(-50%); pointer-events: auto; width: min(520px, 94vw); box-sizing: border-box; padding: 16px 20px; border: 1px solid #ffd166; border-radius: 14px;
  background: rgba(6, 12, 24, .9); box-shadow: 0 0 30px rgba(255, 209, 102, .25); display: flex; flex-direction: column; gap: 10px; }
.lobby-card.wait { bottom: 5%; }
.lobby-card h2 { margin: 0; font-size: .95rem; letter-spacing: .16em; color: #ffd166; text-align: center; }
.lobby-card p { margin: 0; color: #cfd8e6; font-size: .88rem; line-height: 1.6; text-align: center; white-space: pre-line; }
.lobby-card .lb-count { text-align: center; font-size: 2.2rem; font-weight: 900; letter-spacing: .06em; color: #ffd54a; text-shadow: 0 0 18px rgba(255, 213, 74, .4); }
.lobby-card .lb-sub { font-size: .72rem; color: #8fa3c2; letter-spacing: .08em; }
.lobby-card .lb-players { display: flex; flex-direction: column; gap: 5px; }
.lobby-card .lb-player { display: flex; align-items: center; gap: 8px; padding: .4em .6em; border-radius: 8px; background: #0c1626; border: 1px solid #22304a; font-size: .85rem; }
.lobby-card .lb-player.me { border-color: #ffd166; }
.lobby-card .lb-player.empty { color: #7f90ad; }
.lobby-card .lb-dot { width: 13px; height: 13px; border-radius: 50%; border: 2px solid #fff; flex: none; background: #555; }
.lobby-card .lb-dot.none { border-style: dashed; background: transparent; }
.lobby-card .lb-name { flex: 1; font-weight: 700; white-space: nowrap; }
.lobby-card .lb-meta { font-size: .72rem; color: #9fb0cc; text-align: right; line-height: 1.3; white-space: pre-line; }
.lobby-card .lb-row { display: flex; gap: 10px; }
.lobby-card .lb-row > * { flex: 1; }
.lobby-card button { font: inherit; font-weight: 700; font-size: .92rem; padding: .6em 1em; border-radius: 9px; border: 1px solid #3a4a66; background: #14213a; color: #fff; cursor: pointer; }
.lobby-card button.pad-focus, .lobby-card button:focus-visible { outline: 3px solid #ffd54a; outline-offset: 2px; }
`;

/**
 * オンライン対戦の待機画面。接続・自動参加は LobbyConnection(共通部品)。
 * 参加者(4人まで)と、開始までの残り(2人目が入ると自動で始まる / 自分だけの間は「待機中」)を出し、退出できる。
 * 参加順がそのまま番号と色(相手のタワーの表示・結果で同じ色)になる。
 * 入れない時(閉鎖・満員・対戦中・切断)は、リトライを尋ねずにタイトルへ戻して案内する。
 */
export class WaitScreen {
  private readonly conn: LobbyConnection<RoomMsg, ServerMsg, ClientMsg>;
  private readonly deps: WaitDeps;
  private readonly root: HTMLElement;
  private card: HTMLElement | null = null;
  private countEl: HTMLElement | null = null;
  private visible = false;
  private ticker: number | null = null;
  private readonly nav = new ButtonCardNav({
    getCard: () => this.card,
    isActive: () => this.visible,
    onBack: () => this.deps.onBack(),
  });

  constructor(client: TowerNet, deps: WaitDeps) {
    this.deps = deps;
    if (!document.getElementById('lobby-style')) document.head.append(el('style', { id: 'lobby-style', textContent: css }));
    this.root = el('div', { cls: 'lobby' });
    document.body.append(this.root);
    this.conn = new LobbyConnection<RoomMsg, ServerMsg, ClientMsg>(client, {
      onChange: () => this.render(),
      onProblem: () => {},                                   // render が案内を出して画面を閉じる
    });
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
      this.deps.onErrorToTitle(msg);
      return;
    }
    if (c.view === 'blocked') {                                // 満員・対戦中: 空くのを待たず、案内してタイトルへ
      const msg = c.message || '参加できません';
      this.hide();
      this.deps.onErrorToTitle(msg);
      return;
    }

    const card = el('div', { cls: 'lobby-card wait' }, el('h2', { textContent: '1on1 対戦' }));
    this.countEl = el('div', { cls: 'lb-count', textContent: c.label() });
    card.append(this.countEl);
    const room = c.room;
    if (c.view === 'room' && room) {
      const list = el('div', { cls: 'lb-players' });
      room.players.forEach((pl, i) => {
        const dot = el('span', { cls: 'lb-dot' });
        dot.style.background = PLAYER_COLORS[i % PLAYER_COLORS.length];
        list.append(el('div', { cls: pl.id === room.you ? 'lb-player me' : 'lb-player' },
          dot,
          el('span', { cls: 'lb-name', textContent: pl.id === room.you ? `${pl.name}（あなた）` : pl.name }),
          el('span', { cls: 'lb-meta', textContent: `${i + 1}P` })));
      });
      for (let i = room.players.length; i < MAX_PLAYERS; i++) {
        list.append(el('div', { cls: 'lb-player empty' }, el('span', { cls: 'lb-dot none' }), el('span', { cls: 'lb-name', textContent: '対戦相手を待っています…' }), el('span', { cls: 'lb-meta', textContent: '\u00a0' })));
      }
      card.append(el('div', { cls: 'lb-sub', textContent: `参加者 ${room.players.length} / ${MAX_PLAYERS}` }), list);
      card.append(el('p', { textContent: `1対1で同時に積み、先にブロックを3個落とした方の負け。ブロックを${ATTACK_EVERY}個置くごとに、相手へおじゃまが飛びます。` }));
    }
    const leave = el('button', { textContent: '退出' });
    leave.onclick = () => this.deps.onBack();
    card.append(el('div', { cls: 'lb-row' }, leave));
    this.card = card;
    this.root.append(card);
    this.nav.apply();
  }
}
