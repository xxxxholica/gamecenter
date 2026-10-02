// 1ゲーム分の「場」と、その開放/閉鎖の状態。開放は既定で閉鎖。minutes を指定すると、その時間後に自動で閉鎖する(閉め忘れ防止)。
import { Room, type ConfigField, type GameModule, type Peer } from './engine.ts';
import { log } from './log.ts';

export interface OpenOptions {
  /** この時間(分)後に自動で閉鎖する。省略=手動で閉鎖するまで。 */
  minutes?: number;
  /** ゲーム固有の設定(管理画面の設定項目の値)。不正な値はゲーム側が無視する。 */
  config?: Record<string, string>;
}

export interface GameStatus {
  id: string;
  open: boolean;
  /** いまルームにいる人数 */
  players: number;
  max: number;
  phase: string;
  /** この場に接続している数(参加していない接続を含む) */
  clients: number;
  closesAt: number | null;
  /** 主催者の設定(固定値または 'random') */
  config: Record<string, string>;
  /** 次のレースの確定値(ランダムを引いた結果) */
  resolved: Record<string, string>;
  schema: ConfigField[];
  members: { id: number; name: string }[];
}

export class GameHost {
  readonly game: GameModule;
  readonly room: Room;
  open = false;
  closesAt: number | null = null;
  readonly clients = new Set<Peer>();
  private autoCloseTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(game: GameModule) {
    this.game = game;
    this.room = new Room(game);
  }

  get id(): string {
    return this.game.id;
  }

  /** 開放/閉鎖を切り替える。閉鎖すると参加者を全員切断する。 */
  setOpen(next: boolean, opts: OpenOptions = {}): void {
    if (this.autoCloseTimer) clearTimeout(this.autoCloseTimer);
    this.autoCloseTimer = null;
    this.closesAt = null;
    if (next) {
      if (opts.config) this.game.setConfig(opts.config);
      if (opts.minutes && opts.minutes > 0) {
        this.closesAt = Date.now() + opts.minutes * 60_000;
        this.autoCloseTimer = setTimeout(() => this.setOpen(false), opts.minutes * 60_000);
      }
    }
    if (this.open !== next) {
      this.open = next;
      log(`${this.id} ${next ? 'OPEN' : 'CLOSED'}`);
      if (!next) {
        this.room.reset();
        for (const c of [...this.clients]) {
          c.send({ t: 'status', open: false });
          c.close(4001);
        }
      }
    }
  }

  /** 参加者を追い出す(接続も閉じる)。 */
  kick(id: number): boolean {
    return this.room.kick(id);
  }

  status(): GameStatus {
    return {
      id: this.id,
      open: this.open,
      players: this.room.size,
      max: this.game.maxPlayers,
      phase: this.room.phase,
      clients: this.clients.size,
      closesAt: this.closesAt,
      config: this.game.getConfig(),
      resolved: this.game.resolved(),
      schema: this.game.config,
      members: [...this.room.members].map(([id, m]) => ({ id, name: m.name })),
    };
  }
}
