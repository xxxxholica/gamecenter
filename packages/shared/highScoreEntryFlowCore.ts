// 「順位の確認 → 名前入力 → 登録」の流れの制御だけを切り出したもの(DOM・通信は外から渡す)。
// 止めを外すのが1回だけであること、確認中に取り消されたら名前入力を出さないこと、を保つ。arcadeNameEntryModal.ts の runHighScoreEntryFlow が使う。
import type { SaveLeaderboardResult } from './arcadeLeaderboardResult.ts';

export interface EntryFlowDeps {
  /** 上位に入るかの確認(サーバーへの問い合わせ。失敗は「入らない」として返す) */
  check: () => Promise<{ isRankIn: boolean; rank: number }>;
  /** 操作を止めるシールドを出す。返す関数で外す */
  showShield: () => () => void;
  /** 名前入力を(予約して)出す。返す関数で、予約の取り消し・閉じる */
  mountModal: (opts: { rank: number; onComplete: (name: string) => Promise<SaveLeaderboardResult>; onClosed: () => void }) => () => void;
}

export interface EntryFlowCallbacks {
  /** 順位の確認中と名前入力中は true、それ以外は false */
  setBlocked: (blocked: boolean) => void;
  /** 名前が決まったとき(登録はここで行う。Promise を返すと完了まで止めを維持する) */
  onName: (name: string) => Promise<SaveLeaderboardResult>;
  /** 名前入力が閉じたあと(止めを外した後) */
  onClosed?: () => void;
  /** 順位の確認が終わったとき(上位に入れば順位、入らない・失敗なら null)。結果画面に順位を出す用 */
  onRank?: (rank: number | null) => void;
}

/** 流れを始める。返す関数で取り消せる(結果画面を離れるとき用。予約した名前入力を出さず、止めとシールドを外す) */
export function runEntryFlow(deps: EntryFlowDeps, cb: EntryFlowCallbacks): () => void {
  let released = false;
  let removeShield: (() => void) | null = deps.showShield();
  let cancelModal: (() => void) | null = null;

  /** 止めを外す(1回だけ)。外したのがこの呼び出しなら true */
  const release = (): boolean => {
    if (released) return false;
    released = true;
    removeShield?.();
    removeShield = null;
    cb.setBlocked(false);
    return true;
  };

  cb.setBlocked(true);
  void deps.check().then((check) => {
    if (released) return; // 確認中に取り消された
    cb.onRank?.(check.isRankIn ? check.rank : null);
    if (!check.isRankIn) {
      release();
      return;
    }
    cancelModal = deps.mountModal({
      rank: check.rank,
      onComplete: cb.onName,
      onClosed: () => { if (release()) cb.onClosed?.(); },
    });
  });

  return () => {
    if (released) return;
    release();
    cancelModal?.();
  };
}
