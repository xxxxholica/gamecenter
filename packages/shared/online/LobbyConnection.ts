import type { BaseRoom } from './core';
import type { NetClient } from './NetClient';
import { fetchOnlineStatus } from './onlineStatus';

export type LobbyView = 'connecting' | 'closed' | 'lost' | 'blocked' | 'room';

export interface LobbyHooks {
  /** 状態(view / message / room)が変わった。画面を描き直す。 */
  onChange: () => void;
  /** 参加できなくなった(閉鎖・切断)。案内を操作できる画面へ移すのに使う。 */
  onProblem?: () => void;
  /** 共通以外のエラー(例: skyway の color_taken)。処理したら true。 */
  onError?: (code: string) => boolean;
}

const ERRORS: Record<string, string> = {
  full: '満員です。空くまでお待ちください',
  racing: 'レース中です。終わったあとに参加できます',
};

const POLL_INTERVAL_MS = 3000;

/**
 * オンライン対戦の接続と参加(ゲーム共通): 開いたら開催状況を確認し、空きがあれば接続して自動で参加する。
 * 満員・対戦中で入れない間は WebSocket を繋がずに「待機中」とし、数秒おきに公開ステータスを確認して空きが出たら接続・参加する。
 * 画面(ゲームごとに違う)は、この状態を見て描く。
 */
export class LobbyConnection<R extends BaseRoom, S extends { t: string }, C extends { t: string }> {
  public view: LobbyView = 'connecting';
  public message = '';
  public room: R | null = null;
  private active = false;
  private generation = 0;
  private offs: (() => void)[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private readonly client: NetClient<S, C>;
  private readonly hooks: LobbyHooks;

  constructor(client: NetClient<S, C>, hooks: LobbyHooks) {
    this.client = client;
    this.hooks = hooks;
  }

  public get hasProblem(): boolean {
    return this.view === 'closed' || this.view === 'lost';
  }

  /** 参加できなくなった時の案内メッセージ */
  public get problemMessage(): string {
    return this.view === 'closed' ? '現在、オンライン対戦は開催していません' : this.message || '接続エラーが発生しました';
  }

  /** サーバーからの room 通知(非アクティブ中も受け取る)。null=ルームを出た。 */
  public setRoom(m: R | null): void {
    this.room = m;
    if (m) {
      this.stopPoll();
      this.message = '';
      this.view = 'room';
    } else if (this.view === 'room') {
      this.view = this.client.connected && this.client.open ? 'connecting' : 'closed';
    }
    this.hooks.onChange();
  }

  /** 開始: 接続済みなら参加し、そうでなければ開催状況を確認して接続する。すでに開始済みなら再描画だけ。 */
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
          this.stopPoll();
          this.view = 'closed';
          this.hooks.onChange();
          this.hooks.onProblem?.();
        } else if (!this.room) {
          this.join();
        }
      }),
      on('error', (m: { code: string }) => {
        if (this.hooks.onError?.(m.code)) return;
        if (ERRORS[m.code]) {
          this.enterStandby(ERRORS[m.code]);
        }
      }),
    );
    this.offs.push(
      this.client.onClose((code) => {
        this.room = null;
        this.view = code === 4001 ? 'closed' : 'lost';
        this.message = code === 4001 ? '' : code === 4003 ? '管理者によって退出させられました' : '接続が切れました';
        if (this.active) {
          this.stopPoll();
          this.hooks.onChange();
          this.hooks.onProblem?.();
        }
      }),
    );
    if (this.client.connected) {
      if (!this.client.open) this.view = 'closed';
      else if (!this.room) this.join();
      this.hooks.onChange();
      if (this.view === 'closed') this.hooks.onProblem?.();
    } else {
      void this.connect();
    }
  }

  public stop(): void {
    this.active = false;
    this.generation++;
    this.offs.forEach((f) => f());
    this.offs = [];
    this.stopPoll();
    // 前の参加の room を残さない(残すと、次に start() した時に「参加済み」と見なして join を送らず、接続中のまま止まる)
    this.room = null;
    this.view = 'connecting';
  }

  public async connect(): Promise<void> {
    const gen = ++this.generation;
    this.stopPoll();
    this.view = 'connecting';
    this.message = '';
    this.hooks.onChange();
    const status = await fetchOnlineStatus(this.client.game);
    if (!this.active || this.generation !== gen) return;
    if (!status) {
      this.view = 'closed';
      this.hooks.onChange();
      this.hooks.onProblem?.();
      return;
    }
    if (status.phase !== 'lobby' || status.players >= status.max) {
      this.enterStandby(status.phase !== 'lobby' ? ERRORS.racing : ERRORS.full);
      return;
    }
    await this.connectSocket(gen);
  }

  private async connectSocket(gen: number): Promise<void> {
    if (this.view !== 'blocked') {
      this.view = 'connecting';
      this.message = '';
      this.hooks.onChange();
    }
    try {
      await this.client.connect();                          // 接続できたらサーバーが status を送り、開放中なら join する
    } catch {
      if (!this.active || this.generation !== gen) return;
      this.view = 'lost';
      this.message = 'サーバーに接続できませんでした';
      this.hooks.onChange();
      this.hooks.onProblem?.();
    }
  }

  /** 満員・対戦中は WebSocket を切断したまま「待機中」とし、空きが出るのを待つ。 */
  private enterStandby(message: string): void {
    this.client.close();
    this.room = null;
    this.message = message;
    this.view = 'blocked';
    this.hooks.onChange();
    this.startPoll();
  }

  public join(): void {
    if (this.view !== 'blocked') this.view = 'connecting';
    this.client.send({ t: 'join' } as C);
    this.hooks.onChange();
  }

  private startPoll(): void {
    if (this.pollTimer !== null) return;
    const gen = this.generation;
    let polling = false;
    this.pollTimer = setInterval(async () => {
      if (!this.active || this.view !== 'blocked' || this.generation !== gen) {
        this.stopPoll();
        return;
      }
      if (polling) return;
      polling = true;
      try {
        const status = await fetchOnlineStatus(this.client.game);
        if (!this.active || this.view !== 'blocked' || this.generation !== gen) return;
        if (!status) {
          this.stopPoll();
          this.view = 'closed';
          this.message = '';
          this.hooks.onChange();
          this.hooks.onProblem?.();
          return;
        }
        if (status.phase === 'lobby' && status.players < status.max) {
          this.stopPoll();
          void this.connectSocket(gen);
        }
      } finally {
        polling = false;
      }
    }, POLL_INTERVAL_MS);
  }

  private stopPoll(): void {
    if (this.pollTimer !== null) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  /** 開始までの表示: 「あと5秒」/「待機中」(自分だけ・誰もいない時・満員や対戦中で空き待ちの時)など。 */
  public label(): string {
    if (this.view === 'connecting') return '接続中…';
    if (this.view === 'blocked') return '待機中';
    const r = this.room;
    if (this.view !== 'room' || !r) return '参加できません';
    if (r.phase !== 'lobby') return 'まもなくスタート';
    if (r.players.length < 2 || r.countdownEnd === null) return '待機中';
    return `${Math.max(0, Math.ceil((r.countdownEnd - this.client.serverNow()) / 1000))}秒`;
  }
}
