import type { BaseRoom } from './core';
import type { NetClient } from './NetClient';

export type LobbyView = 'connecting' | 'closed' | 'lost' | 'blocked' | 'room';

export interface LobbyHooks {
  /** 状態(view / message / room)が変わった。画面を描き直す。 */
  onChange: () => void;
  /** 参加できなくなった(閉鎖・切断・満員・レース中)。案内を操作できる画面へ移すのに使う。 */
  onProblem: () => void;
  /** 共通以外のエラー(例: skyway の color_taken)。処理したら true。 */
  onError?: (code: string) => boolean;
}

const ERRORS: Record<string, string> = {
  full: '満員です。空くまでお待ちください',
  racing: 'レース中です。終わったあとに参加できます',
};

/**
 * オンライン対戦の接続と参加(ゲーム共通): 開いたら接続して自動で参加し、閉鎖・切断・満員・レース中の状態を持つ。
 * 満員・レース中で入れない間は、数秒おきに自動で参加を試す(空いたらそのまま入れる)。
 * 画面(ゲームごとに違う)は、この状態を見て描く。
 */
export class LobbyConnection<R extends BaseRoom, S extends { t: string }, C extends { t: string }> {
  public view: LobbyView = 'connecting';
  public message = '';
  public room: R | null = null;
  private active = false;
  private offs: (() => void)[] = [];
  private pollTimer: number | null = null;
  private readonly client: NetClient<S, C>;
  private readonly hooks: LobbyHooks;

  constructor(client: NetClient<S, C>, hooks: LobbyHooks) {
    this.client = client;
    this.hooks = hooks;
  }

  public get hasProblem(): boolean {
    return this.view === 'closed' || this.view === 'lost' || this.view === 'blocked';
  }

  /** サーバーからの room 通知(非アクティブ中も受け取る)。null=ルームを出た。 */
  public setRoom(m: R | null): void {
    this.room = m;
    if (m) {
      this.message = '';
      this.view = 'room';
    } else if (this.view === 'room') {
      this.view = this.client.connected && this.client.open ? 'connecting' : 'closed';
    }
    this.hooks.onChange();
  }

  /** 開始: 接続済みなら参加し、そうでなければ接続する。すでに開始済みなら再描画だけ。 */
  public start(): void {
    if (this.active) {
      this.hooks.onChange();
      return;
    }
    this.active = true;
    const on = this.client.on.bind(this.client) as (t: string, fn: (m: any) => void) => () => void;
    this.offs.push(
      on('status', (m: { open: boolean }) => {
        if (!m.open) {
          this.view = 'closed';
          this.hooks.onChange();
          this.hooks.onProblem();
        } else if (!this.room) {
          this.join();
        }
      }),
      on('error', (m: { code: string }) => {
        if (this.hooks.onError?.(m.code)) return;
        if (ERRORS[m.code]) {
          this.message = ERRORS[m.code];
          this.view = 'blocked';
          this.hooks.onChange();
          this.hooks.onProblem();
          this.startPoll();
        }
      }),
    );
    this.offs.push(
      this.client.onClose((code) => {
        this.room = null;
        this.view = code === 4001 ? 'closed' : 'lost';
        this.message = code === 4001 ? '' : code === 4003 ? '管理者によって退出させられました' : '接続が切れました';
        if (this.active) {
          this.hooks.onChange();
          this.hooks.onProblem();
        }
      }),
    );
    if (this.client.connected) {
      if (!this.client.open) this.view = 'closed';
      else if (!this.room) this.join();
      this.hooks.onChange();
      if (this.view === 'closed') this.hooks.onProblem();
    } else {
      void this.connect();
    }
  }

  public stop(): void {
    this.active = false;
    this.offs.forEach((f) => f());
    this.offs = [];
    this.stopPoll();
  }

  /** 参加できない案内の「再試行」: 閉鎖・切断なら接続し直し、満員・レース中ならもう一度参加する。 */
  public retry(): void {
    if (this.view === 'blocked') this.join();
    else void this.connect();
  }

  public async connect(): Promise<void> {
    this.view = 'connecting';
    this.message = '';
    this.hooks.onChange();
    try {
      await this.client.connect();                          // 接続できたらサーバーが status を送り、開放中なら join する
    } catch {
      this.view = 'lost';
      this.message = 'サーバーに接続できませんでした';
      this.hooks.onChange();
      this.hooks.onProblem();
    }
  }

  public join(): void {
    this.view = 'connecting';
    this.client.send({ t: 'join' } as C);
    this.hooks.onChange();
  }

  private startPoll(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = window.setInterval(() => {
      if (this.active && this.view === 'blocked') this.client.send({ t: 'join' } as C);
      else this.stopPoll();
    }, 4000);
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** 開始までの表示: 「あと5秒」/「待機中」(自分だけ・誰もいない時)など。 */
  public label(): string {
    if (this.view === 'connecting') return '接続中…';
    const r = this.room;
    if (this.view !== 'room' || !r) return '参加できません';
    if (r.phase !== 'lobby') return 'まもなくスタート';
    if (r.players.length < 2 || r.countdownEnd === null) return '待機中';
    return `${Math.max(0, Math.ceil((r.countdownEnd - this.client.serverNow()) / 1000))}秒`;
  }
}
