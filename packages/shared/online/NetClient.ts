/// <reference types="vite/client" />
import type { CoreClientMsg, CoreServerMsg } from './core';

const HEARTBEAT_MS = 10000;
/** 時計合わせは RTT が最小だったサンプルを採用する。 */
const SYNC_SAMPLES = 8;

/** 接続先。VITE_ONLINE_WS で上書き可。開発時(vite)はローカルのサーバー、本番は同一ホストの /online-ws。 */
export function serverUrl(game: string): string {
  const env = import.meta.env.VITE_ONLINE_WS as string | undefined;
  if (env) return `${env}?game=${game}`;
  if (import.meta.env.DEV) return `ws://${location.hostname}:8787/online-ws?game=${game}`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/online-ws?game=${game}`;
}

/**
 * オンライン対戦サーバーとの接続(ゲーム共通)。S/C はそのゲーム固有のメッセージ型。
 * 自動再接続はしない(閉鎖中に勝手に接続し続けて負荷をかけないため)。切れたら呼び出し側がユーザー操作で connect() し直す。
 */
export class NetClient<S extends { t: string } = CoreServerMsg, C extends { t: string } = CoreClientMsg> {
  public open = false;           // サーバーが開放中か(最後に受け取った status)
  public connected = false;
  private readonly game: string;
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(m: never) => void>>();
  private closeHandlers = new Set<(code: number) => void>();
  private heartbeat: number | null = null;
  private bestRtt = Infinity;
  /** サーバー時刻 - ローカル時刻 (ms) */
  private offset = 0;

  /** game: サーバー側のゲームid(ハブの slug と同じ。例: 'midnight-skyway') */
  constructor(game: string) {
    this.game = game;
  }

  /** サーバー時刻(ms)。 */
  public serverNow(): number {
    return Date.now() + this.offset;
  }

  /** 接続が切れた時(コード付き)。戻り値で解除。 */
  public onClose(fn: (code: number) => void): () => void {
    this.closeHandlers.add(fn);
    return () => this.closeHandlers.delete(fn);
  }

  public on<T extends (S | CoreServerMsg)['t']>(t: T, fn: (msg: Extract<S | CoreServerMsg, { t: T }>) => void): () => void {
    let set = this.handlers.get(t);
    if (!set) this.handlers.set(t, (set = new Set()));
    set.add(fn as (m: never) => void);
    return () => set!.delete(fn as (m: never) => void);
  }

  public connect(): Promise<void> {
    this.close();
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(serverUrl(this.game));
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.connected = true;
        this.bestRtt = Infinity;
        this.ping();
        // 最初の数回は短い間隔で打って時計を合わせる
        for (let i = 1; i < SYNC_SAMPLES; i++) setTimeout(() => this.ping(), i * 150);
        this.heartbeat = window.setInterval(() => this.ping(), HEARTBEAT_MS);
        resolve();
      };
      ws.onerror = () => {
        if (!opened) reject(new Error('connect failed'));
      };
      ws.onclose = (ev) => {
        if (this.ws !== ws) return;
        this.cleanup();
        if (!opened) reject(new Error('closed'));
        this.closeHandlers.forEach((fn) => fn(ev.code));
      };
      ws.onmessage = (ev) => {
        let msg: S | CoreServerMsg;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        this.dispatch(msg);
      };
    });
  }

  private dispatch(msg: S | CoreServerMsg): void {
    const m = msg as CoreServerMsg;
    if (m.t === 'hello') {
      const rtt = Date.now() - m.c;
      if (rtt < this.bestRtt) {
        this.bestRtt = rtt;
        this.offset = m.now + rtt / 2 - Date.now();
      }
      this.open = m.open;
    } else if (m.t === 'status') {
      this.open = m.open;
    }
    this.handlers.get(msg.t)?.forEach((fn) => (fn as (x: S | CoreServerMsg) => void)(msg));
  }

  private ping(): void {
    this.send({ t: 'hello', c: Date.now() });
  }

  public send(msg: C | CoreClientMsg): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  public close(): void {
    const ws = this.ws;
    this.ws = null;
    this.cleanup();
    ws?.close();
  }

  private cleanup(): void {
    this.connected = false;
    if (this.heartbeat !== null) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }
}
