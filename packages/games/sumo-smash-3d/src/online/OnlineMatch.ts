import type { FighterSnap, FxEvent, InputTuple, ServerMsg } from '../../../../shared/sumoProtocol';
import type { SumoNet } from './net';
import { InputSender, SnapBuffer, lerpFighter } from './snapshot';

export type ResultsMsg = Extract<ServerMsg, { t: 'results' }>;

export interface MatchHandlers {
  /** 試合の結果が届いた(最後の1人になった・二本先取) */
  onResults(res: ResultsMsg): void;
  /** 接続が切れた */
  onDisconnect(): void;
}

/** 描画に使う、補間済みの状態 */
export interface MatchView {
  /** ラウンド進行(ROUND_NAMES の添字) */
  rs: number;
  /** 力士ごとの得点 */
  w: number[];
  f: FighterSnap[];
  /** 位置が瞬間移動した(リセット)ので、画面は置き直す。変わったかを見る */
  rc: number;
}

/**
 * 対戦中のネットワーク側。物理・当たり判定・ラウンド進行は、すべてサーバーが持つ。
 * 自分の操作をまとめて送り(InputSender)、サーバーから約20Hzで届く全力士の状態を溜めて、遅らせて補間して返す(SnapBuffer)。
 */
export class OnlineMatch {
  /** 自分の力士の番号(start の players の並びでの位置) */
  public readonly slot: number;
  /** 参加者の数 */
  public readonly count: number;
  public disconnected = false;

  private readonly net: SumoNet;
  private readonly offs: (() => void)[] = [];
  private readonly buffer = new SnapBuffer();
  private readonly sender = new InputSender();
  private finished = false;

  constructor(net: SumoNet, slot: number, count: number, handlers: MatchHandlers) {
    this.net = net;
    this.slot = slot;
    this.count = count;
    this.offs.push(
      net.on('snap', (m) => this.buffer.push(m, Date.now())),
      net.on('results', (m) => {
        this.finished = true;
        handlers.onResults(m);
      }),
      net.onClose(() => {
        this.disconnected = true;
        handlers.onDisconnect();
      }),
    );
  }

  /** 毎フレームの操作を渡す。送るべき時だけ送る(moveX/Z はワールド座標)。 */
  public sendInput(nowMs: number, moveX: number, moveZ: number, isMoving: boolean, strikePressed: boolean, strike: boolean, strikeReleased: boolean, grabPressed: boolean): void {
    if (this.disconnected || this.finished) return;
    const i: InputTuple | null = this.sender.update(nowMs, moveX, moveZ, isMoving, strikePressed, strike, strikeReleased, grabPressed);
    if (i) this.net.send({ t: 'input', i });
  }

  /** 描画時刻の状態(補間済み)。まだ何も届いていなければ null。 */
  public view(nowMs: number): MatchView | null {
    const s = this.buffer.sample(nowMs);
    if (!s) return null;
    const { a, b, t } = s;
    return {
      rs: a.rs,
      w: a.w,
      rc: a.rc,
      f: a.f.map((f, i) => lerpFighter(f, b?.f[i] ?? null, t)),
    };
  }

  /** 描画時刻に達した演出を取り出す。 */
  public drainEvents(nowMs: number): FxEvent[] {
    return this.buffer.drainEvents(nowMs);
  }

  public dispose(): void {
    this.offs.forEach((f) => f());
    this.offs.length = 0;
    this.buffer.clear();
    this.sender.reset();
  }
}
