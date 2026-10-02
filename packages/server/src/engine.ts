// ゲーム非依存の対戦の場(ルーム)の進行。ゲームごとの違い(希望・開始内容・実行中のやりとり・結果)は GameModule が担う。
//
// 進行: 参加(lobby) → 2人目が入ると30秒で自動開始 → ロード同期(loading) → 実行(racing) → 結果 → 全員外れて空に戻る。
// 満員(maxPlayers)・実行中は参加できない。ホストはいない。キックは管理側から。
import { log } from './log.ts';

/** 通信メッセージ(JSON)。`t` が種類。ゲームごとの型は shared 側で定義し、ここでは緩く扱う。 */
export type Msg = { t: string; [k: string]: unknown };

export interface Peer {
  id: number;
  send(msg: Msg): void;
  /** 接続を閉じる(キック・閉鎖) */
  close(code: number): void;
}

export interface Member {
  peer: Peer;
  /** 参加順の空き番号で自動採番(PLAYER 1〜) */
  name: string;
  loaded: boolean;
  /** ゲーム固有のデータ(GameModule が自由に使う) */
  data: any;
}

/** 管理画面に出すゲーム固有の設定項目(選択肢の中から選ぶ)。 */
export interface ConfigField {
  key: string;
  label: string;
  options: { value: string; label: string }[];
}

export type RoomPhase = 'lobby' | 'loading' | 'racing';

export interface GameModule {
  readonly id: string;
  readonly maxPlayers: number;
  /** 実行(racing)の最大時間。誰も終わらせなくても、この時間で強制終了して空に戻す */
  readonly maxPlayMs: number;
  readonly config: ConfigField[];
  /** 参加者に割り当てる名前の候補リスト。未指定なら PLAYER 1〜4 */
  readonly playerNames?: string[];
  attach(room: Room): void;
  getConfig(): Record<string, string>;
  /** 主催者の設定を反映する(不正な値は無視する) */
  setConfig(cfg: Record<string, string>): void;
  /** 次のレースの確定値(ランダムを引いた結果など)。管理画面の表示用 */
  resolved(): Record<string, string>;
  onJoin(m: Member): void;
  onLeave(m: Member): void;
  /** 参加者を全員外して空に戻った */
  onReset(): void;
  /** 待機表示に出す参加者ごとの情報(名前以外) */
  playerInfo(m: Member): object;
  /** 待機表示に出す全体の情報 */
  roomExtra(): object;
  /** 待機中の希望。エラーコード(クライアントへ error として返す)か null */
  onPref(m: Member, msg: Msg): string | null;
  /** 開始の確定(未選択の自動決定など)。全員へ送る start メッセージを返す */
  prepareStart(): Msg;
  /** 全員のロードが揃った(または待ち切れた)。全員へ送る go メッセージを返す */
  onGo(): Msg;
  /** 実行中のメッセージ(state/finish など)。不正な値は黙って捨てる */
  onPlayMessage(m: Member, msg: Msg): void;
  /** 実行が完了した(全員ゴールなど)か。メッセージ処理・退出のたびに確認される */
  isDone(): boolean;
  /** 最終の結果メッセージ */
  buildResults(): Msg;
}

/** 自動開始までの時間(テスト用に環境変数で短縮できる)。 */
const AUTO_START_MS = (Number(process.env.ONLINE_AUTO_START_SEC) || 30) * 1000;
/** ロードが終わらない参加者を待つ上限。超えたら待たずに始める。 */
const LOAD_WAIT_MS = 30000;

export class Room {
  readonly game: GameModule;
  phase: RoomPhase = 'lobby';
  countdownEnd: number | null = null;
  readonly members = new Map<number, Member>();
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private countdownTimer: ReturnType<typeof setTimeout> | null = null;
  private maxPlayTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(game: GameModule) {
    this.game = game;
    game.attach(this);
  }

  get size(): number {
    return this.members.size;
  }

  join(peer: Peer): 'ok' | 'full' | 'racing' {
    if (this.members.has(peer.id)) return 'ok';
    if (this.phase !== 'lobby') return 'racing';
    if (this.members.size >= this.game.maxPlayers) return 'full';
    const taken = new Set([...this.members.values()].map((m) => m.name));
    let name: string | undefined;
    const pool = this.game.playerNames;
    if (pool && pool.length > 0) {
      name = pool.find((candidate) => !taken.has(candidate));
      if (!name) {
        let n = 1;
        while (taken.has(`${pool[0]} ${n}`)) n++;
        name = `${pool[0]} ${n}`;
      }
    }
    if (!name) {
      let n = 1;
      while (taken.has(`PLAYER ${n}`)) n++;
      name = `PLAYER ${n}`;
    }
    const m: Member = { peer, name, loaded: false, data: null };
    this.members.set(peer.id, m);
    this.game.onJoin(m);
    log(`${this.game.id} join id=${peer.id} name=${m.name} players=${this.members.size}`);
    if (this.members.size >= 2 && !this.countdownTimer) {
      this.countdownEnd = Date.now() + AUTO_START_MS;
      this.countdownTimer = setTimeout(() => this.begin(), AUTO_START_MS);
    }
    this.broadcastRoom();
    return 'ok';
  }

  leave(id: number): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    this.members.delete(id);
    log(`${this.game.id} leave id=${id} players=${this.members.size}`);
    this.game.onLeave(m);
    if (this.members.size === 0) {
      this.reset();
      return true;
    }
    if (this.phase === 'lobby' && this.members.size < 2) this.stopCountdown();
    if (this.phase === 'loading') this.maybeGo();
    if (this.phase === 'racing' && this.game.isDone()) {
      this.end();
      return true;
    }
    this.broadcastRoom();
    return true;
  }

  /** 管理側からの追い出し。 */
  kick(id: number): boolean {
    const m = this.members.get(id);
    if (!m) return false;
    log(`${this.game.id} kick id=${id}`);
    m.peer.close(4003);                                      // 閉じると leave される
    this.leave(id);
    return true;
  }

  setLoaded(id: number): void {
    const m = this.members.get(id);
    if (!m || this.phase !== 'loading') return;
    m.loaded = true;
    this.maybeGo();
  }

  /** 待機中の希望(pref)。 */
  handlePref(id: number, msg: Msg): void {
    const m = this.members.get(id);
    if (!m || this.phase !== 'lobby') return;
    const err = this.game.onPref(m, msg);
    if (err) m.peer.send({ t: 'error', code: err });
  }

  /** 実行中のメッセージ。 */
  handlePlay(id: number, msg: Msg): void {
    const m = this.members.get(id);
    if (!m || this.phase !== 'racing') return;
    this.game.onPlayMessage(m, msg);
    if (this.phase === 'racing' && this.game.isDone()) this.end();
  }

  private stopCountdown(): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownTimer = null;
    this.countdownEnd = null;
  }

  private begin(): void {
    if (this.phase !== 'lobby') return;
    this.stopCountdown();
    const start = this.game.prepareStart();
    this.phase = 'loading';
    for (const m of this.members.values()) m.loaded = false;
    log(`${this.game.id} start players=${this.members.size}`);
    this.broadcast(start);
    this.broadcastRoom();
    this.loadTimer = setTimeout(() => this.go(), LOAD_WAIT_MS);
  }

  private maybeGo(): void {
    if ([...this.members.values()].every((m) => m.loaded)) this.go();
  }

  private go(): void {
    if (this.phase !== 'loading') return;
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.loadTimer = null;
    this.phase = 'racing';
    log(`${this.game.id} go players=${this.members.size}`);
    const go = this.game.onGo();
    this.maxPlayTimer = setTimeout(() => this.end(), this.game.maxPlayMs);
    this.broadcast(go);
    this.broadcastRoom();
  }

  /** 結果を送り、参加者を全員外して空に戻す。ゲームモジュールからも呼べる(時間切れなど)。 */
  end(): void {
    if (this.phase !== 'racing') return;
    log(`${this.game.id} end`);
    this.broadcast(this.game.buildResults());
    this.broadcast({ t: 'left' });
    this.reset();
  }

  broadcastRoom(): void {
    const players = [...this.members].map(([id, m]) => ({ id, name: m.name, ...this.game.playerInfo(m) }));
    const extra = this.game.roomExtra();
    for (const [id, m] of this.members) {
      m.peer.send({ t: 'room', you: id, phase: this.phase, players, countdownEnd: this.countdownEnd, ...extra });
    }
  }

  broadcast(msg: Msg): void {
    for (const m of this.members.values()) m.peer.send(msg);
  }

  /** 参加者を全員外して、参加受付中の空の状態に戻す。 */
  reset(): void {
    this.stopCountdown();
    if (this.loadTimer) clearTimeout(this.loadTimer);
    if (this.maxPlayTimer) clearTimeout(this.maxPlayTimer);
    this.loadTimer = this.maxPlayTimer = null;
    this.members.clear();
    this.phase = 'lobby';
    this.game.onReset();
  }
}
