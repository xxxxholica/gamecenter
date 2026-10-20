import { ContenderState, InputState } from '../types';
import { Player } from '../entities/Player';
import { SoundManager } from '../audio/SoundManager';
import { watchResultAutoReturn } from '../../../../shared/arcadeAutoAction';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../../shared/arcadeResultMenu';
import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import {
  GAME_LEADERBOARD_DEFS,
  saveLeaderboardScore,
  loadLeaderboardAndCheck,
  padEmptyEntries,
  escapeHtml,
  type LeaderboardEntry,
} from '../../../../shared/arcadeLeaderboard';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../../shared/arcadeNameEntryModal';

const SLUG = 'survivor-score-battle';

export type ResultAction = 'PLAY_AGAIN' | 'TITLE' | 'EXIT';

const ACTIONS: ResultAction[] = ['PLAY_AGAIN', 'TITLE', 'EXIT'];
const MENU_COLORS = ['#ffe600', '#39ff88', '#00f0ff'];

// リザルトはDOMで組む(他のゲームと同じ作り)。canvasはその背面でゲーム画面を描き続ける。
export class ResultScreen {
  private root: HTMLDivElement;
  private elStatus: HTMLElement;
  private elScore: HTMLElement;
  private elRank: HTMLElement;
  private elSub: HTMLElement;
  private elLeaderboardList: HTMLElement;
  private elLeaderboardFooter: HTMLElement;
  private buttons: HTMLButtonElement[] = [];

  private focus = 0;
  private armTime = 0;
  private pending: ResultAction | null = null;
  // ハイスコアの名前登録が開いている間は、リザルトの操作を受け付けない
  private nameEntryOpen = false;
  /** show() の呼び出しごとに増やす。サーバーの応答を待つ間に画面が閉じられた・出し直された場合の判定用 */
  private showSeq = 0;

  constructor() {
    this.injectStyle();
    this.root = document.createElement('div');
    this.root.id = 'result-overlay';
    this.root.innerHTML = `
      <div class="rs-status" id="result-status"></div>
      <div class="rs-rank" id="result-rank"></div>
      <div class="rs-score-block">
        <div class="rs-score-label">スコア</div>
        <div class="rs-score-val" id="result-total-score">0</div>
      </div>
      <div class="rs-sub" id="result-sub"></div>

      <!-- ランキング(上位3名) -->
      <div class="rs-leaderboard-panel" id="result-leaderboard-panel">
        <div class="rs-panel-header">
          <span class="rs-panel-title">ランキング</span>
        </div>
        <div class="rs-leaderboard-list" id="result-leaderboard-list"></div>
        <div class="rs-lb-footer" id="result-lb-footer"></div>
      </div>

      <div id="result-menu" class="rs-menu">
        <button id="btn-restart" type="button">もう一度遊ぶ</button>
        <button id="btn-result-title" type="button">タイトルへ</button>
        <button id="btn-result-exit" type="button">ゲームを終了</button>
      </div>
    `;
    this.root.style.display = 'none';
    document.body.appendChild(this.root);

    this.elStatus = this.root.querySelector('#result-status')!;
    this.elScore = this.root.querySelector('#result-total-score')!;
    this.elRank = this.root.querySelector('#result-rank')!;
    this.elSub = this.root.querySelector('#result-sub')!;
    this.elLeaderboardList = this.root.querySelector('#result-leaderboard-list')!;
    this.elLeaderboardFooter = this.root.querySelector('#result-lb-footer')!;
    this.buttons = ['btn-restart', 'btn-result-title', 'btn-result-exit'].map(
      (id) => this.root.querySelector<HTMLButtonElement>('#' + id)!
    );

    this.buttons.forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 順位の確認中・名前登録中は受け付けない。ここで pending に積むと、登録が終わった瞬間に実行されてしまう
        if (this.nameEntryOpen || performance.now() < this.armTime) return;
        this.pending = ACTIONS[i];
      });
      btn.addEventListener('mouseenter', () => {
        this.focus = i;
        this.applyFocus();
      });
      btn.addEventListener('focus', () => btn.blur());
    });

    // 無操作が続いたら自動でタイトルへ戻る(残り秒数はボタンに出る)
    watchResultAutoReturn(['btn-result-title']);

    this.warmUp();
  }

  /**
   * 読み込み中に、見えないまま一度レイアウトしておく。
   * 計測(Windows, Chrome): 表示を切り替えた瞬間の文字の組み立て(日本語の文字を Impact から代わりのフォントに回す)に 46ms かかり、
   * ゲームオーバーのたびに 50ms のフレームが出ていた。一度組んでおけば、フォントの準備が済んでいて軽い。
   */
  private warmUp() {
    this.elStatus.textContent = 'ゲームオーバー';
    this.elRank.textContent = '1位';
    this.elSub.textContent = '生存時間 00:00　撃破 0体　最大コンボ 0';
    this.applyFocus();
    this.root.style.visibility = 'hidden';
    this.root.style.display = 'flex';
    // ランキングの行(記録あり・記録なし)と、下の案内の 2 通り(3位までの差・ハイスコア更新)を、すべて組む
    const filled = [1, 2, 3].map((rank) => ({ rank, name: 'アイウエオ', score: 9000 - rank * 1000, formattedScore: '', date: '' }));
    const empty = padEmptyEntries(GAME_LEADERBOARD_DEFS[SLUG], [], 3);
    for (const [list, rankIn] of [[filled, false], [empty, true]] as const) {
      this.renderLeaderboard({ score: 0 } as Player, list, undefined, rankIn, false);
      void this.root.offsetWidth;
    }
    this.root.style.display = 'none';
    this.root.style.visibility = '';
  }

  public show(player: Player, _standings: ContenderState[], gameTime: number) {
    // 優勝のときは見出し(FINISH)が1位の答えなので、順位は別に出さない
    const isWinner = player.rank === 1;
    this.root.classList.toggle('rs-winner', isWinner);
    this.elStatus.textContent = isWinner ? 'FINISH' : 'ゲームオーバー';
    this.elRank.textContent = isWinner ? '' : `${player.rank}位`;

    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    const time = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    this.elSub.textContent = `生存時間 ${time}　撃破 ${player.kills}体　最大コンボ ${player.maxCombo}`;

    const score = player.score;
    const seq = ++this.showSeq;

    // ランキング表は、サーバーから取得するまで「記録なし」の枠で出しておく。
    // 順位の確認が終わるまでは、メニューの操作と名前登録の判断を保留する。
    this.nameEntryOpen = true;
    this.renderLeaderboard(player, padEmptyEntries(GAME_LEADERBOARD_DEFS[SLUG], [], 3), undefined, false, false);

    this.root.style.display = 'flex';

    // 見出し、順位、スコア、ランキング、メニューの順に段階的に見せる(CSSのアニメーションを頭から再生し直す)
    this.root.classList.remove('rs-play');
    void this.root.offsetWidth;
    this.root.classList.add('rs-play');
    countUpText(this.elScore, player.score.toLocaleString(), { delayMs: 900, durationMs: 1300 });

    this.focus = 0;
    this.pending = null;
    this.armTime = performance.now() + 2400;
    this.applyFocus();

    void loadLeaderboardAndCheck(SLUG, score, undefined, 3).then(({ list, ...check }) => {
      if (seq !== this.showSeq) return;   // 取得中に画面が閉じられた・出し直された
      this.renderLeaderboard(player, list, undefined, check.isRankIn, false);
      // 上位3位に入ったら、スコアを見せたあとに名前登録を出して共通ランキングへ保存する
      if (!check.isRankIn) {
        this.nameEntryOpen = false;
        return;
      }
      mountNameEntryModal({
        title: 'スコア記録',
        scoreDisplay: `${score.toLocaleString()}点`,
        rankDisplay: `第${check.rank}位`,
        themeClass: 'theme-skyway',
        delayMs: NAME_ENTRY_AFTER_RESULT_MS,
        onComplete: async (name) => {
          // 保存直後のランキングを再描画し、登録された順位を光らせる(保存に失敗したら強調なしで元の表を出す)
          const res = await saveLeaderboardScore(SLUG, score, name, undefined, `撃破${player.kills}体`);
          if (seq === this.showSeq) {
            this.renderLeaderboard(player, res.rank > 0 ? res.list : list, res.rank > 0 ? res.rank : undefined, false, res.rank > 0);
          }
          this.nameEntryOpen = false;
          this.armTime = performance.now() + 800;
        },
      });
    });
  }

  /** 殿堂入りハイスコアランキングの描画 */
  private renderLeaderboard(player: Player, list: LeaderboardEntry[], highlightRank?: number, checkRankIn?: boolean, isRegistered?: boolean) {
    // 順位は文字と色(金・銀・銅)で示す
    const rankColors = ['#ffd700', '#d0e0f0', '#cd7f32'];

    this.elLeaderboardList.innerHTML = list
      .map((entry, idx) => {
        const isHighlight = highlightRank === entry.rank;
        const isEmpty = entry.name === '記録なし';
        const medal = `${entry.rank}位`;
        const color = rankColors[idx] || '#8899aa';

        return `
          <div class="rs-lb-row ${isHighlight ? 'is-highlight' : ''} ${isEmpty ? 'is-empty' : ''}">
            <div class="rs-lb-col-rank" style="color: ${color}">${medal}</div>
            <div class="rs-lb-col-name">${escapeHtml(entry.name)}</div>
            <div class="rs-lb-col-score">${isEmpty ? '---' : `${Math.floor(entry.score).toLocaleString()}点`}</div>
          </div>
        `;
      })
      .join('');

    // フッター情報表示
    if (isRegistered) {
      // 登録後は、ランキングの行の強調(黄色の枠)だけで伝える
      this.elLeaderboardFooter.innerHTML = '';
    } else if (checkRankIn) {
      this.elLeaderboardFooter.innerHTML = `
        <div class="rs-lb-msg is-rankin">
          <span>ハイスコア更新　まもなく名前登録</span>
        </div>
      `;
    } else {
      const thirdScore = list[2]?.score || 0;
      const diff = thirdScore > 0 ? Math.max(0, thirdScore - player.score + 1) : 0;
      this.elLeaderboardFooter.innerHTML = `
        <div class="rs-lb-msg is-normal">
          <span>今回のスコア <strong>${player.score.toLocaleString()}点</strong></span>
          ${diff > 0 ? `<span class="rs-lb-diff-hint">3位まであと <strong>${diff.toLocaleString()}点</strong></span>` : ''}
        </div>
      `;
    }
  }

  public hide() {
    this.showSeq++;
    this.root.style.display = 'none';
  }

  private applyFocus() {
    const items: ResultMenuItem[] = this.buttons.map((button, i) => ({ button, color: MENU_COLORS[i] }));
    setupResultMenu(this.root.querySelector('#result-menu'), items);
    applyResultMenuFocus(items, this.focus);
  }

  public update(input: InputState, soundManager: SoundManager): ResultAction | null {
    if (this.nameEntryOpen) return null;
    const n = ACTIONS.length;
    const dir = input.upTap || input.leftTap ? -1 : input.downTap || input.rightTap ? 1 : 0;
    if (dir !== 0) {
      this.focus = (this.focus + dir + n) % n;
      this.applyFocus();
      soundManager.sfx.playMenuSelect();
    }

    let action: ResultAction | null = this.pending;
    this.pending = null;
    if (!action && performance.now() >= this.armTime) {
      if (input.confirm) action = ACTIONS[this.focus];
      else if (input.cancel) action = 'TITLE';
    }

    if (action) {
      soundManager.sfx.playMenuConfirm();
      this.hide();
    }
    return action;
  }

  private injectStyle() {
    if (document.getElementById('result-overlay-style')) return;
    const style = document.createElement('style');
    style.id = 'result-overlay-style';
    style.textContent = `
      #result-overlay {
        position: fixed;
        inset: 0;
        z-index: 25;
        flex-direction: column;
        align-items: center;
        justify-content: safe center;
        overflow-y: auto;
        padding: 18px 12px;
        box-sizing: border-box;
        background: radial-gradient(circle at center, #071220 0%, #02040a 100%);
        font-family: 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif;
        font-weight: 900;
        color: #fff;
      }
      #result-overlay .rs-status {
        font-size: clamp(24px, 4.5vh, 42px);
        letter-spacing: 4px;
        text-shadow: 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000;
      }
      #result-overlay .rs-rank {
        font-size: clamp(60px, 14vh, 140px);
        line-height: 1;
        color: #fff;
        text-shadow: 4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 35px rgba(0, 229, 255, 0.45);
      }
      #result-overlay .rs-score-block { margin: clamp(6px, 1.8vh, 16px) 0 clamp(2px, 0.8vh, 6px); text-align: center; }
      #result-overlay .rs-score-label { font-size: clamp(12px, 1.8vh, 16px); letter-spacing: 6px; color: #8899aa; }
      #result-overlay .rs-score-val {
        font-size: clamp(34px, min(7vw, 8vh), 68px);
        letter-spacing: 3px;
        color: #00f0ff;
        text-shadow: 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 20px rgba(0, 240, 255, 0.5);
      }
      #result-overlay .rs-sub {
        font-size: clamp(12px, 1.8vh, 16px);
        color: #a0b2c6;
        letter-spacing: 1.5px;
        margin-bottom: clamp(10px, 2vh, 18px);
        text-align: center;
      }
      /* 優勝は見出しを主役にする */
      #result-overlay.rs-winner .rs-status {
        font-size: clamp(36px, 8vh, 72px);
        line-height: 1;
        color: #ffe600 !important;
        text-shadow: 4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 40px rgba(255, 230, 0, 0.5);
      }
      #result-overlay.rs-winner .rs-rank { display: none; }

      /* 殿堂入りハイスコアランキング パネル (中央配置) */
      /* ランキング: 下のボタンと同じ幅・角張った枠にそろえる */
      .rs-leaderboard-panel {
        width: min(84vw, 340px);
        margin: clamp(4px, 1vh, 12px) auto clamp(12px, 2.2vh, 20px);
        background: #1a1e27;
        border: 2px solid #6b7385;
        border-radius: 0;
        padding: clamp(8px, 1.4vh, 12px) clamp(10px, 3vw, 16px);
        box-sizing: border-box;
      }
      .rs-panel-header {
        border-bottom: 1px solid #6b7385;
        padding-bottom: 6px;
        margin-bottom: 8px;
      }
      .rs-panel-title {
        font-size: clamp(13px, 1.7vh, 16px);
        letter-spacing: 4px;
        color: #c3c9d6;
      }
      .rs-leaderboard-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .rs-lb-row {
        position: relative;
        display: grid;
        grid-template-columns: 3em 1fr auto;
        gap: 8px;
        align-items: center;
        padding: 6px 8px;
        background: rgba(255, 255, 255, 0.04);
        border: 2px solid transparent;
        border-radius: 0;
        font-size: clamp(13px, 1.7vh, 16px);
        letter-spacing: 1px;
      }
      .rs-lb-row.is-highlight {
        background: rgba(255, 230, 0, 0.14);
        border-color: #ffe600;
      }
      .rs-lb-row.is-empty {
        opacity: 0.5;
      }
      .rs-lb-col-rank {
        font-weight: 900;
        white-space: nowrap;
      }
      .rs-lb-col-name {
        font-weight: 800;
        color: #ffffff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .rs-lb-col-score {
        font-weight: 900;
        color: #ffe600;
        text-align: right;
        white-space: nowrap;
      }

      /* ランキングフッター情報 */
      .rs-lb-footer:empty {
        display: none;
      }
      .rs-lb-footer {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #6b7385;
        font-size: clamp(11px, 1.4vh, 13px);
        letter-spacing: 1px;
        text-align: center;
      }
      .rs-lb-msg.is-rankin {
        color: #ffe600;
        animation: rsRankinPulse 1s infinite alternate;
      }
      @keyframes rsRankinPulse {
        from { opacity: 0.8; }
        to { opacity: 1; text-shadow: 0 0 10px #ffe600; }
      }
      .rs-lb-msg.is-normal {
        color: #a0a8b8;
      }
      .rs-lb-msg.is-normal span {
        display: block;
        line-height: 1.6;
      }
      .rs-lb-diff-hint {
        color: #ffb347;
      }

      /* 見出し → 順位 → スコア → ランキング → 補足 → メニューの順に現れる */
      #result-overlay .rs-status, #result-overlay .rs-rank, #result-overlay .rs-score-block,
      #result-overlay .rs-sub, #result-overlay .rs-leaderboard-panel, #result-overlay .rs-menu { opacity: 0; }
      #result-overlay.rs-play .rs-status { animation: rs-in 0.4s ease-out 0s forwards; }
      #result-overlay.rs-play .rs-rank { animation: rs-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) 0.4s forwards; }
      #result-overlay.rs-play .rs-score-block { animation: rs-in 0.4s ease-out 0.8s forwards; }
      #result-overlay.rs-play .rs-leaderboard-panel { animation: rs-in 0.5s ease-out 1.2s forwards; }
      #result-overlay.rs-play .rs-sub { animation: rs-in 0.4s ease-out 1.8s forwards; }
      #result-overlay.rs-play .rs-menu { animation: rs-in 0.4s ease-out 1.8s forwards; }
      @keyframes rs-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      @keyframes rs-pop { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        #result-overlay .rs-status, #result-overlay .rs-rank, #result-overlay .rs-score-block,
        #result-overlay .rs-sub, #result-overlay .rs-leaderboard-panel, #result-overlay .rs-menu { opacity: 1 !important; animation: none !important; }
      }
      #result-overlay .rs-menu button { font-family: inherit; }
    `;
    document.head.appendChild(style);
  }
}
