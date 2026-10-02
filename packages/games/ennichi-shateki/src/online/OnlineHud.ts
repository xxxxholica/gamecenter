import { PadEdge, startPadLoop } from '../../../../shared/arcadePad';
import type { EntryResult, Mode } from '../../../../shared/ennichiProtocol';
import { MODE_LABELS } from '../../../../shared/ennichiProtocol';
import { getPrizeSvg, getPrizeShortName } from '../prize_icons';
import { ordinal, teamRank } from './snapshot';

const css = `
.ohud { position: fixed; inset: 0; z-index: 70; pointer-events: none; display: none; font-family: system-ui, 'Hiragino Kaku Gothic ProN', sans-serif; color: #fff; }
.ohud-board { position: absolute; left: 18px; top: 118px; display: flex; flex-direction: column; gap: 2px; text-shadow: 0 2px 4px #000, 0 0 10px #000; font-weight: 800; }
.ohud-row { display: flex; align-items: baseline; gap: 10px; font-size: 1.05rem; }
.ohud-row .rk { width: 2.4em; color: #ffd54a; font-style: italic; font-family: Impact, 'Arial Black', sans-serif; }
.ohud-row .nm { min-width: 6.5em; }
.ohud-row .sc { font-variant-numeric: tabular-nums; color: #cfd8e6; }
.ohud-row.me { color: #ffd54a; }
.ohud-row.me .sc { color: #ffd54a; }
.ohud-team { position: absolute; top: 14px; left: 50%; transform: translateX(-50%); text-align: center; text-shadow: 0 2px 4px #000, 0 0 12px #000; display: none; }
.ohud-team .lb { font-size: .75rem; letter-spacing: .3em; color: #8fe3c0; }
.ohud-team .tv { font: italic 900 2.2rem Impact, 'Arial Black', sans-serif; }
.ohud-team .rk { font: italic 900 1.3rem Impact, 'Arial Black', sans-serif; color: #ffd54a; margin-left: .5em; }
.ohud-ufo { position: absolute; top: 96px; left: 50%; transform: translateX(-50%); width: min(380px, 70vw); text-align: center; display: none; text-shadow: 0 2px 4px #000; }
.ohud-ufo .bar { height: 12px; border-radius: 6px; background: rgba(0,0,0,.55); overflow: hidden; border: 1px solid rgba(255,255,255,.5); }
.ohud-ufo .fill { height: 100%; background: linear-gradient(90deg, #ff4d4f, #ffd54a); width: 100%; transition: width .15s; }
.ohud-count { position: absolute; left: 50%; top: 36%; transform: translate(-50%, -50%); font: italic 900 9rem Impact, 'Arial Black', sans-serif; color: #ffd54a; text-shadow: 0 6px 0 rgba(0,0,0,.5), 0 0 40px rgba(255,140,0,.7); display: none; }
.ohud-toasts { position: absolute; top: 24%; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 6px; }
.ohud-toast { padding: 8px 18px; border-radius: 999px; background: rgba(4,8,18,.8); border: 1px solid #ff8c00; font-weight: 700; }
.ohud-result { position: absolute; left: 5vw; top: 50%; transform: translateY(-50%); display: none; pointer-events: auto; max-height: 94vh; overflow-y: auto; }
@media (max-width: 860px) { .ohud-result { left: 50%; transform: translate(-50%, -50%); } }
.ohud-online-list { width: 100%; background: #14161a; border: 1px solid #2d3139; border-radius: 4px; padding: 8px 10px; margin-bottom: 12px; box-sizing: border-box; }
.ohud-online-header { font-size: 12px; font-weight: 900; color: #ffcc00; letter-spacing: 2px; margin-bottom: 6px; text-align: center; border-bottom: 1px dashed #333a45; padding-bottom: 4px; }
.ohud-online-rows { display: flex; flex-direction: column; gap: 4px; }
.ohud-online-row { display: flex; align-items: baseline; gap: 8px; padding: 4px 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.04); font-size: 0.9rem; }
.ohud-online-row.me { background: rgba(255, 204, 0, 0.16); border: 1px solid rgba(255, 204, 0, 0.35); color: #ffd54a; font-weight: 700; }
.ohud-online-rk { width: 2.2em; font-family: Impact, 'Arial Black', sans-serif; font-style: italic; color: #ffd54a; font-size: 1.1rem; }
.ohud-online-nm { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ohud-online-sc { font-variant-numeric: tabular-nums; font-weight: 800; }
.ohud-score-sublabel { font-size: 12px; color: #a8b8d0; letter-spacing: 1px; margin-top: -6px; margin-bottom: 10px; text-align: center; }
`;

export interface BoardRow {
  id: number;
  name: string;
  score: number;
  me: boolean;
}

const esc = (str: string): string => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** オンライン対戦中の表示: 得点の順位(枠なし)・チーム合計(協力)・巨大UFOのHP・カウントダウン・通知・最終結果。名前は textContent だけで描画する。 */
export class OnlineHud {
  private readonly root = document.createElement('div');
  private readonly board = document.createElement('div');
  private readonly team = document.createElement('div');
  private readonly ufo = document.createElement('div');
  private readonly ufoFill = document.createElement('div');
  private readonly ufoLabel = document.createElement('div');
  private readonly count = document.createElement('div');
  private readonly toasts = document.createElement('div');
  private readonly result = document.createElement('div');
  public onLeave: () => void = () => {};

  constructor() {
    if (!document.getElementById('ohud-style')) {
      const st = document.createElement('style');
      st.id = 'ohud-style';
      st.textContent = css;
      document.head.append(st);
    }
    this.root.className = 'ohud';
    this.board.className = 'ohud-board';
    this.team.className = 'ohud-team';
    this.ufo.className = 'ohud-ufo';
    const bar = Object.assign(document.createElement('div'), { className: 'bar' });
    this.ufoFill.className = 'fill';
    bar.append(this.ufoFill);
    this.ufo.append(this.ufoLabel, bar);
    this.count.className = 'ohud-count';
    this.toasts.className = 'ohud-toasts';
    this.result.className = 'ohud-result';
    this.root.append(this.board, this.team, this.ufo, this.count, this.toasts, this.result);
    document.body.append(this.root);
  }

  public show(): void {
    this.root.style.display = 'block';
  }

  public hide(): void {
    this.root.style.display = 'none';
    this.board.replaceChildren();
    this.team.style.display = 'none';
    this.ufo.style.display = 'none';
    this.count.style.display = 'none';
    this.toasts.replaceChildren();
    this.result.style.display = 'none';
  }

  /** 得点の順位(上から1st)。自分は強調。 */
  public setBoard(rows: BoardRow[]): void {
    const sorted = [...rows].sort((a, b) => b.score - a.score);
    this.board.replaceChildren(
      ...sorted.map((r, i) => {
        const row = Object.assign(document.createElement('div'), { className: 'ohud-row' + (r.me ? ' me' : '') });
        row.append(
          Object.assign(document.createElement('span'), { className: 'rk', textContent: ordinal(i + 1) }),
          Object.assign(document.createElement('span'), { className: 'nm', textContent: r.name }),
          Object.assign(document.createElement('span'), { className: 'sc', textContent: `${r.score}g` }),
        );
        return row;
      }),
    );
  }

  /** 協力: チーム合計とランク(null で非表示)。 */
  public setTeam(score: number | null, players: number): void {
    if (score === null) {
      this.team.style.display = 'none';
      return;
    }
    this.team.style.display = 'block';
    this.team.replaceChildren(
      Object.assign(document.createElement('div'), { className: 'lb', textContent: 'TEAM' }),
      Object.assign(document.createElement('span'), { className: 'tv', textContent: `${score}g` }),
      Object.assign(document.createElement('span'), { className: 'rk', textContent: teamRank(score, players) }),
    );
  }

  /** 協力の巨大UFOのHP(null で非表示)。 */
  public setUfoHp(hp: number | null, max: number): void {
    if (hp === null) {
      this.ufo.style.display = 'none';
      return;
    }
    this.ufo.style.display = 'block';
    this.ufoLabel.textContent = `巨大UFO  ${hp} / ${max}`;
    this.ufoFill.style.width = `${Math.max(0, (hp / max) * 100)}%`;
  }

  public setCountdown(text: string | null): void {
    this.count.style.display = text ? 'block' : 'none';
    if (text) this.count.textContent = text;
  }

  public toast(text: string): void {
    const t = Object.assign(document.createElement('div'), { className: 'ohud-toast', textContent: text });
    this.toasts.append(t);
    setTimeout(() => t.remove(), 3200);
  }

  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;

  /** 最終結果(オフラインのリザルトカードを改変したデザイン)。 */
  public showResults(mode: Mode, entries: EntryResult[], teamScore: number, you: number): void {
    const myEntry = entries.find((e) => e.id === you);
    const myScore = myEntry ? myEntry.score : 0;
    const myRankIdx = entries.findIndex((e) => e.id === you);
    const myRank = myRankIdx >= 0 ? myRankIdx + 1 : 1;
    const isWinner = mode === 'versus' && myRank === 1;

    // 称号判定(オフラインと同様)
    let rankTitle = '見習い';
    let rankColor = '#ffffff';
    if (myScore >= 8000) {
      rankTitle = '伝説の射手';
      rankColor = '#ffd700';
    } else if (myScore >= 5000) {
      rankTitle = '特級名人';
      rankColor = '#ffd700';
    } else if (myScore >= 3000) {
      rankTitle = '凄腕射手';
      rankColor = '#ffffff';
    } else if (myScore >= 1500) {
      rankTitle = '一人前';
      rankColor = '#ffffff';
    }

    // 獲得景品一覧(自分の分)
    const myDefeated = myEntry?.defeated ?? {};
    let totalDefeatedCount = 0;
    let breakdownHtml = '';
    const defKeys = Object.keys(myDefeated);
    for (const k of defKeys) {
      const count = myDefeated[k];
      if (count > 0) {
        totalDefeatedCount += count;
        const shortName = getPrizeShortName(k, k);
        const svg = getPrizeSvg(k);
        breakdownHtml += `
          <div class="bd-card" title="${shortName}">
            <div class="bd-pic">${svg}</div>
            <div class="bd-count-tag">×${count}</div>
            <div class="bd-label">${shortName}</div>
          </div>
        `;
      }
    }
    if (!breakdownHtml) {
      breakdownHtml = `
        <div class="bd-card bd-card-empty" title="参加賞：ラムネ">
          <div class="bd-pic">${getPrizeSvg('ramune')}</div>
          <div class="bd-count-tag">×1</div>
          <div class="bd-label">参加賞ラムネ</div>
        </div>
      `;
    }

    // 参加者順位・成績テーブル
    const onlineListHtml = `
      <div class="ohud-online-list">
        <div class="ohud-online-header">${mode === 'versus' ? '参加者 最終順位' : 'チームメンバー 貢献度'}</div>
        <div class="ohud-online-rows">
          ${entries.map((e, idx) => `
            <div class="ohud-online-row ${e.id === you ? 'me' : ''}">
              <span class="ohud-online-rk">${mode === 'versus' ? ordinal(idx + 1) : `${idx + 1}`}</span>
              <span class="ohud-online-nm">${esc(e.name)}${e.id === you ? '（あなた）' : ''}</span>
              <span class="ohud-online-sc">${e.score.toLocaleString()}g</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // バッジ
    const badgeHtml = mode === 'versus'
      ? `<span class="new-record-badge" style="${isWinner ? '' : 'background:#4a6984;color:#fff;'}">${isWinner ? '★ 1位 優勝 ★' : `${myRank}位`}</span>`
      : `<span class="new-record-badge">RANK ${teamRank(teamScore, entries.length)}</span>`;

    // メインスコア表示
    const scoreVal = mode === 'versus' ? myScore : teamScore;
    const subLabel = mode === 'versus'
      ? 'あなたの獲得総重量'
      : `チーム獲得総重量（あなたの貢献: ${myScore.toLocaleString()}g）`;

    // 統計行(stats-row)
    const statsRowHtml = mode === 'versus'
      ? `
        <div class="stat-item">
          <span class="stat-label">称号</span>
          <span class="stat-val" style="color: ${rankColor}">${rankTitle}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">撃墜景品</span>
          <span class="stat-val">${totalDefeatedCount}<span class="stat-unit">個</span></span>
        </div>
      `
      : `
        <div class="stat-item">
          <span class="stat-label">チーム評価</span>
          <span class="stat-val" style="color: #ffd700">RANK ${teamRank(teamScore, entries.length)}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-label">撃墜景品</span>
          <span class="stat-val">${totalDefeatedCount}<span class="stat-unit">個</span></span>
        </div>
      `;

    this.result.className = 'ohud-result results-card';
    this.result.innerHTML = `
      <div class="results-header">
        <span class="results-title">${MODE_LABELS[mode]} 結果</span>
        ${badgeHtml}
      </div>

      <div class="results-score-block">
        <span class="results-score-num">${scoreVal.toLocaleString()}</span>
        <span class="results-score-unit">g</span>
      </div>
      <div class="ohud-score-sublabel">${subLabel}</div>

      <div class="results-stats-row">
        ${statsRowHtml}
      </div>

      ${onlineListHtml}

      <div class="results-breakdown-box">
        <div class="breakdown-header">あなたの獲得景品</div>
        <div class="breakdown-grid">${breakdownHtml}</div>
      </div>

      <div class="results-action-block">
        <div class="retry-btn blink" id="ohud-leave-btn">タイトルへ戻る</div>
        <div class="retry-hint">画面タップまたはボタンでトップへ</div>
      </div>
    `;

    const leaveBtn = this.result.querySelector('#ohud-leave-btn');
    if (leaveBtn) {
      leaveBtn.addEventListener('click', () => this.onLeave());
    }
    this.result.onclick = (e) => {
      if ((e.target as HTMLElement).closest('#ohud-leave-btn') || e.target === this.result) {
        this.onLeave();
      }
    };

    this.stopPad?.();
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (p.any(0, 1, 9)) this.onLeave();
    });

    if (this.keyHandler) window.removeEventListener('keydown', this.keyHandler);
    this.keyHandler = (e) => {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'Escape') this.onLeave();
    };
    window.addEventListener('keydown', this.keyHandler);

    this.result.style.display = 'flex';
    this.board.style.display = 'none';
    this.team.style.display = 'none';
  }

  public hideResults(): void {
    this.result.style.display = 'none';
    this.board.style.display = '';
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
