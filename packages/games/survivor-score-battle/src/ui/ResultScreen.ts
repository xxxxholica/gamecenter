import { ContenderState, InputState } from '../types';
import { Player } from '../entities/Player';
import { SoundManager } from '../audio/SoundManager';
import { watchResultAutoReturn } from '../../../../shared/arcadeAutoAction';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../../shared/arcadeResultMenu';
import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import { checkHighScore, saveLeaderboardScore } from '../../../../shared/arcadeLeaderboard';
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
  private buttons: HTMLButtonElement[] = [];

  private focus = 0;
  private armTime = 0;
  private pending: ResultAction | null = null;
  // ハイスコアの名前登録が開いている間は、リザルトの操作を受け付けない
  private nameEntryOpen = false;

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
    this.buttons = ['btn-restart', 'btn-result-title', 'btn-result-exit'].map(
      (id) => this.root.querySelector<HTMLButtonElement>('#' + id)!
    );

    this.buttons.forEach((btn, i) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (performance.now() < this.armTime) return;
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
  }

  public show(player: Player, _standings: ContenderState[], gameTime: number) {
    // 優勝のときは見出し(VICTORY)が1位の答えなので、順位は別に出さない
    const isWinner = player.rank === 1;
    this.root.classList.toggle('rs-winner', isWinner);
    this.elStatus.textContent = isWinner ? 'VICTORY' : 'ゲームオーバー';
    this.elRank.textContent = isWinner ? '' : `${player.rank}位`;

    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    this.elSub.textContent = `生存時間  ${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    this.root.style.display = 'flex';

    // 見出し、順位、スコア、メニューの順に段階的に見せる(CSSのアニメーションを頭から再生し直す)
    this.root.classList.remove('rs-play');
    void this.root.offsetWidth;
    this.root.classList.add('rs-play');
    countUpText(this.elScore, player.score.toLocaleString(), { delayMs: 900, durationMs: 1300 });

    this.focus = 0;
    this.pending = null;
    this.armTime = performance.now() + 2400;
    this.applyFocus();

    // 上位3位に入ったら、スコアを見せたあとに名前登録を出して共通ランキングへ保存する
    const score = player.score;
    const check = checkHighScore(SLUG, score);
    if (check.isRankIn) {
      this.nameEntryOpen = true;
      mountNameEntryModal({
        title: 'スコア記録',
        scoreDisplay: `${score.toLocaleString()} pts`,
        rankDisplay: `第${check.rank}位`,
        themeClass: 'theme-skyway',
        delayMs: NAME_ENTRY_AFTER_RESULT_MS,
        onComplete: (name) => {
          saveLeaderboardScore(SLUG, score, name);
          this.nameEntryOpen = false;
          this.armTime = performance.now() + 800;
        },
      });
    }
  }

  public hide() {
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
      else if (input.cancel) action = 'EXIT';
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
        padding: 16px 0;
        box-sizing: border-box;
        background: #02040a;
        font-family: Impact, 'Arial Black', 'Hiragino Kaku Gothic ProN', sans-serif;
        color: #fff;
      }
      #result-overlay .rs-status {
        font-size: clamp(26px, 5vh, 44px);
        letter-spacing: 4px;
        text-shadow: 3px 3px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000;
      }
      #result-overlay .rs-rank {
        font-size: clamp(72px, 20vh, 190px);
        line-height: 1;
        color: #fff;
        text-shadow: 4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 40px rgba(0, 229, 255, 0.45);
      }
      #result-overlay .rs-score-block { margin: clamp(10px, 3vh, 30px) 0 clamp(4px, 1vh, 10px); text-align: center; }
      #result-overlay .rs-score-label { font-size: clamp(12px, 2vh, 18px); letter-spacing: 6px; color: #8899aa; }
      #result-overlay .rs-score-val {
        font-size: clamp(36px, min(7vw, 9vh), 76px);
        letter-spacing: 3px;
        text-shadow: 3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000;
      }
      #result-overlay .rs-sub {
        font-size: clamp(13px, 2.2vh, 20px);
        color: #8899aa;
        letter-spacing: 2px;
        margin-bottom: clamp(16px, 4vh, 44px);
      }
      /* 優勝は見出しを主役にする */
      #result-overlay.rs-winner .rs-status {
        font-size: clamp(40px, 9vh, 80px);
        line-height: 1;
        color: #ffe600 !important;
        text-shadow: 4px 4px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 50px rgba(255, 230, 0, 0.5);
      }
      #result-overlay.rs-winner .rs-rank { display: none; }
      /* 見出し → 順位 → スコア → 補足 → メニューの順に現れる */
      #result-overlay .rs-status, #result-overlay .rs-rank, #result-overlay .rs-score-block,
      #result-overlay .rs-sub, #result-overlay .rs-menu { opacity: 0; }
      #result-overlay.rs-play .rs-status { animation: rs-in 0.4s ease-out 0s forwards; }
      #result-overlay.rs-play .rs-rank { animation: rs-pop 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) 0.4s forwards; }
      #result-overlay.rs-play .rs-score-block { animation: rs-in 0.4s ease-out 0.8s forwards; }
      #result-overlay.rs-play .rs-sub { animation: rs-in 0.4s ease-out 2.0s forwards; }
      #result-overlay.rs-play .rs-menu { animation: rs-in 0.4s ease-out 2.0s forwards; }
      @keyframes rs-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
      @keyframes rs-pop { from { opacity: 0; transform: scale(1.8); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        #result-overlay .rs-status, #result-overlay .rs-rank, #result-overlay .rs-score-block,
        #result-overlay .rs-sub, #result-overlay .rs-menu { opacity: 1 !important; animation: none !important; }
      }
      #result-overlay .rs-menu button { font-family: inherit; }
    `;
    document.head.appendChild(style);
  }
}
