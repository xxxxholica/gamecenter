import { setText, setWidth } from '../../../../shared/hudDom';
import { uiLayerHtml } from './uiTemplate';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../../shared/arcadeResultMenu';
export type GameMode = 'pve' | 'pvp';

/** 多人数の上部バーの1人分 */
export interface MultiPlayer {
  name: string;
  /** 色(CSS) */
  css: string;
  /** 角印の文字(1P〜4P) */
  label: string;
  me: boolean;
}

/** 結果の順位表の1行 */
export interface ResultRow {
  name: string;
  css: string;
  wins: number;
  me: boolean;
}

/** 吹き飛び蓄積率の段階ごとの [文字色, 文字影] */
const DAMAGE_LEVELS: ReadonlyArray<readonly [string, string]> = [
  ['#f6efdc', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e8c15a', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e08a3c', '0 0 4px #000, 2px 2px 4px #000'],
  ['#e0343a', '0 0 4px #000, 0 0 16px #b8272d, 2px 2px 4px #000'],
];

export class UIManager {
  private readonly damageLevels = new WeakMap<HTMLElement, number>();
  private readonly lastWins: [number, number] = [-1, -1];
  private multiCards: { card: HTMLElement; percent: HTMLElement; stars: HTMLElement }[] = [];
  private multiLast: { wins: number; out: boolean }[] = [];
  private p1BuchiFillEl!: HTMLElement;
  // バトルHUD要素
  private battleHudEl!: HTMLElement;
  private p1PercentEl!: HTMLElement;
  private p2PercentEl!: HTMLElement;
  private p2NameEl!: HTMLElement;
  private kumiteCountEl!: HTMLElement;
  private p1WinsEl!: HTMLElement;
  private p2WinsEl!: HTMLElement;
  private p1ChargeBar!: HTMLElement;
  private p1BuchiCdEl!: HTMLElement;
  private p1GrabCdEl!: HTMLElement;
  private p1GrabFillEl!: HTMLElement;
  private p1HariteBox!: HTMLElement;
  private p1HariteBar!: HTMLElement;
  private bannerEl!: HTMLElement;
  private bannerSubEl!: HTMLElement;

  // タイトル画面要素
  public currentMode: GameMode = 'pve';

  // 指南画面要素
  private howToPlayModalEl!: HTMLElement;

  // リザルト画面要素
  private resultModalEl!: HTMLElement;
  private resultWinnerTitleEl!: HTMLElement;
  private resultBtns: HTMLElement[] = [];
  public selectedResultIndex: number = 0;
  private rematchEnabled = true;

  // バナータイマー
  private bannerTimer: any = null;

  // コールバック
  public onExit: (() => void) | null = null;
  public onHowToPlayClosed: (() => void) | null = null;
  public onRematch: (() => void) | null = null;
  public onReturnTitle: (() => void) | null = null;

  constructor() {
    this.createUIElements();
  }

  private createUIElements() {
    const root = document.createElement('div');
    root.id = 'game-ui-layer';
    root.innerHTML = uiLayerHtml();

    document.body.appendChild(root);

    // タイトル要素
    this.howToPlayModalEl = document.getElementById('how-to-play-modal')!;

    // バトルHUD要素
    this.battleHudEl = document.getElementById('battle-hud')!;
    this.p1PercentEl = document.getElementById('p1-knockback')!;
    this.p2PercentEl = document.getElementById('p2-knockback')!;
    this.p2NameEl = document.getElementById('p2-fighter-name')!;
    this.kumiteCountEl = document.getElementById('kumite-count')!;
    this.p1WinsEl = document.getElementById('p1-stars')!;
    this.p2WinsEl = document.getElementById('p2-stars')!;
    this.battleHudEl.classList.toggle('kumite', this.currentMode === 'pve');
    this.p1ChargeBar = document.getElementById('p1-charge-bar')!;
    this.p1HariteBox = document.getElementById('p1-harite-box')!;
    this.p1HariteBar = document.getElementById('p1-harite-bar')!;
    this.p1GrabCdEl = document.getElementById('p1-grab-cd')!;
    this.p1GrabFillEl = document.getElementById('p1-grab-fill')!;
    this.p1BuchiCdEl = document.getElementById('p1-buchi-cd')!;
    this.p1BuchiFillEl = document.getElementById('p1-buchi-fill')!;
    this.bannerEl = document.getElementById('center-announcement')!;
    this.bannerSubEl = document.getElementById('banner-sub')!;

    // リザルト画面要素
    this.resultModalEl = document.getElementById('match-result-modal')!;
    this.resultWinnerTitleEl = document.getElementById('result-winner-title')!;
    this.resultBtns = [
      document.getElementById('result-btn-rematch')!,
      document.getElementById('result-btn-title')!,
      document.getElementById('result-btn-exit')!,
    ];

    document.getElementById('guide-close-btn')!.addEventListener('click', () => {
      this.closeHowToPlay();
    });

    this.setupResultControls();
  }

  private setupResultControls() {
    this.resultBtns.forEach((btn, index) => {
      btn.addEventListener('click', () => {
        this.selectResultIndex(index);
        this.confirmCurrentResultSelection();
      });
    });
  }

  /** 再挑戦 / タイトルに戻る / ゲームを終了 (全ゲーム共通の縦並びメニュー)。再挑戦を隠している間は、その項目を除く。 */
  private resultMenuItems(): ResultMenuItem[] {
    const colors = ['#ffe600', '#39ff88', '#00f0ff'];
    return this.resultBtns
      .map((button, i) => ({ button, color: colors[i] }))
      .filter((_, i) => this.rematchEnabled || i !== 0);
  }

  /** オンライン対戦では再挑戦できない(場は試合ごとに空に戻る)ので、再挑戦のボタンを隠す。 */
  public setRematchEnabled(enabled: boolean) {
    this.rematchEnabled = enabled;
    this.resultBtns[0].style.display = enabled ? '' : 'none';
  }

  public selectResultIndex(index: number) {
    let i = (index + this.resultBtns.length) % this.resultBtns.length;
    if (!this.rematchEnabled && i === 0) i = 1;
    this.selectedResultIndex = i;
    const items = this.resultMenuItems();
    setupResultMenu(document.getElementById('result-menu'), items);
    applyResultMenuFocus(items, i - (this.rematchEnabled ? 0 : 1));
  }

  /** dir: -1 = 上/左, +1 = 下/右 */
  public moveResultSelection(dir: number) {
    const n = this.resultBtns.length;
    let next = (this.selectedResultIndex + dir + n) % n;
    if (!this.rematchEnabled && next === 0) next = (next + dir + n) % n;
    this.selectResultIndex(next);
  }

  public confirmCurrentResultSelection() {
    if (this.selectedResultIndex === 0) this.onRematch?.();
    else if (this.selectedResultIndex === 1) this.onReturnTitle?.();
    else this.onExit?.();
  }

  /** 結果: 「勝利/敗北」の見出しと、得点の多い順の順位表(オンライン対戦用)。me=自分の行。 */
  public showVictory(won: boolean, rows: ResultRow[]) {
    this.resultWinnerTitleEl.textContent = won ? '勝利' : '敗北';
    this.resultWinnerTitleEl.classList.toggle('win', won);
    this.resultWinnerTitleEl.classList.toggle('lose', !won);
    const sub = document.getElementById('result-subtitle');
    if (sub) sub.textContent = '';
    const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => b.r.wins - a.r.wins || a.i - b.i);
    const box = document.getElementById('result-list')!;
    box.replaceChildren(
      ...sorted.map(({ r }, k) => {
        const row = document.createElement('div');
        row.className = 'result-row';
        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = `${k + 1}`;
        const name = document.createElement('span');
        name.className = 'rname';
        name.style.color = r.css;
        name.append(r.name);
        if (r.me) {
          const me = document.createElement('span');
          me.className = 'rme';
          me.textContent = 'あなた';
          name.append(me);
        }
        const stars = document.createElement('span');
        stars.className = 'rstars';
        stars.textContent = '★'.repeat(r.wins) + '☆'.repeat(Math.max(0, 2 - r.wins));
        row.append(rank, name, stars);
        return row;
      })
    );
    this.selectResultIndex(0);
    this.resultModalEl.classList.add('show');
  }

  /** CPU百人組手モードの結果画面（大見出しの撃破数＋サブ1行のみ、順位表枠や星★は出さない） */
  public showKumiteVictory(cleared: boolean, defeatedCount: number, lastEnemyName: string) {
    this.resultWinnerTitleEl.textContent = cleared ? '百人抜き達成' : `${defeatedCount}体撃破`;
    this.resultWinnerTitleEl.classList.toggle('win', cleared);
    this.resultWinnerTitleEl.classList.toggle('lose', !cleared);

    const sub = document.getElementById('result-subtitle');
    if (sub) {
      sub.textContent = cleared ? '全百体完全制覇' : lastEnemyName ? `${lastEnemyName} に敗北` : '';
    }

    const box = document.getElementById('result-list')!;
    box.replaceChildren();

    this.selectResultIndex(0);
    this.resultModalEl.classList.add('show');
  }

  public hideVictoryModal() {
    this.resultModalEl.classList.remove('show');
  }

  public isVictoryModalOpen(): boolean {
    return this.resultModalEl.classList.contains('show');
  }

  /**
   * 多人数(オンライン)の上部バーに切り替える(null で1対1の表示に戻す)。
   * 1対1用のカードは隠し、自分の技の箱(左下)だけを残す。
   */
  public setMultiLayout(players: MultiPlayer[] | null) {
    this.battleHudEl.classList.toggle('multi', players !== null);
    this.multiCards = [];
    const row = document.getElementById('multi-row')!;
    row.replaceChildren();
    if (!players) return;
    this.multiLast = players.map(() => ({ wins: -1, out: false }));
    for (const p of players) {
      const card = document.createElement('div');
      card.className = `mcard${p.me ? ' me' : ''}`;
      card.style.setProperty('--mc', p.css);
      card.innerHTML = `
        <div class="fighter-header">
          <span class="player-badge"></span>
          <span class="fighter-name"></span>
        </div>
        <div class="knockback-wrap"><div class="damage-number-box"><span class="knockback-value">0</span><span class="knockback-unit">%</span></div></div>
        <div class="stars-container"></div>`;
      card.querySelector('.player-badge')!.textContent = p.label;
      card.querySelector('.fighter-name')!.textContent = p.name;
      row.append(card);
      this.multiCards.push({
        card,
        percent: card.querySelector<HTMLElement>('.knockback-value')!,
        stars: card.querySelector<HTMLElement>('.stars-container')!,
      });
    }
  }

  /** 多人数の上部バーの更新(ダメージ%・得点・脱落)。 */
  public updateMulti(rows: { damage: number; wins: number; out: boolean }[]) {
    rows.forEach((r, i) => {
      const c = this.multiCards[i];
      if (!c) return;
      this.updateDamageStyle(c.percent, r.damage);
      const last = this.multiLast[i];
      if (r.wins !== last.wins) {
        last.wins = r.wins;
        c.stars.innerHTML = this.renderWinMarks(r.wins);
      }
      if (r.out !== last.out) {
        last.out = r.out;
        c.card.classList.toggle('out', r.out);
      }
    });
  }

  /** 対戦モードに合わせて西方(2P/CPU)の表示を切り替える */
  public setMode(mode: GameMode) {
    this.currentMode = mode;
    this.lastWins[0] = -1;
    this.lastWins[1] = -1;
    this.battleHudEl.classList.toggle('kumite', mode === 'pve');
    this.documentP2Label(mode === 'pvp' ? '2P' : '一番');
    if (mode === 'pvp') {
      setText(this.p2NameEl, '西方 紅炎山');
    }
  }

  public documentP2Label(text: string) {
    const badge = document.getElementById('p2-badge-tag');
    if (badge) badge.textContent = text;
  }

  public updateEnemyHeader(name: string, badgeLabel: string) {
    setText(this.p2NameEl, name);
    this.documentP2Label(badgeLabel);
  }

  public closeHowToPlay() {
    if (!this.isHowToPlayOpen()) return;
    this.howToPlayModalEl.classList.remove('show');
    this.onHowToPlayClosed?.();
  }

  public isHowToPlayOpen(): boolean {
    return this.howToPlayModalEl.classList.contains('show');
  }

  /** タイトル・モード選択中はバトルHUDを隠す(タイトル画面そのものは共通の ArcadeTitleScreen が出す) */
  public showTitleScreen() {
    this.battleHudEl.classList.remove('active');
    this.howToPlayModalEl.classList.remove('show');
  }

  public hideTitleScreen() {
    this.battleHudEl.classList.add('active');
  }

  public updateStats(
    p1Percent: number,
    p2Percent: number,
    p1Wins: number,
    p2Wins: number,
    p1Charge: number,
    p1BuchiCdRatio: number,
    p1GrabCdRatio: number,
    p1HariteGauge: number,
  ) {
    // 吹き飛び蓄積率（パーセント数値 ＆ ゲージ ＆ ダイナミックグロー）
    this.updateDamageStyle(this.p1PercentEl, p1Percent);
    this.updateDamageStyle(this.p2PercentEl, p2Percent);

    // 白星・黒星マーク、または百人組手の残り体数（勝ち数が変わったときだけ描き直す）
    if (p1Wins !== this.lastWins[0]) {
      this.lastWins[0] = p1Wins;
      if (this.currentMode === 'pve') {
        setText(this.kumiteCountEl, Math.max(0, 100 - p1Wins).toString());
      } else {
        this.p1WinsEl.innerHTML = this.renderWinMarks(p1Wins);
      }
    }
    if (this.currentMode !== 'pve' && p2Wins !== this.lastWins[1]) {
      this.lastWins[1] = p2Wins;
      this.p2WinsEl.innerHTML = this.renderWinMarks(p2Wins);
    }

    // チャージバー（ぶちかましタメ）
    setWidth(this.p1ChargeBar, `${Math.min(100, p1Charge * 100)}%`);

    // ぶちかましのクールタイム表示
    this.updateSkillBox(this.p1BuchiCdEl, this.p1BuchiFillEl, p1BuchiCdRatio);

    // 張り手ゲージ(当て続けると赤が溜まる。満タンの間は枠が脈打つ)
    setWidth(this.p1HariteBar, `${Math.min(100, p1HariteGauge * 100)}%`);
    this.p1HariteBox.classList.toggle('gauge-full', p1HariteGauge >= 1);

    // つかみのクールタイム表示
    this.updateSkillBox(this.p1GrabCdEl, this.p1GrabFillEl, p1GrabCdRatio);
  }

  /**
   * 吹き飛び蓄積率のスタイリング（スマブラ風ダイナミックカラー＆グロー）
   */
  private updateDamageStyle(el: HTMLElement, percent: number) {
    setText(el, Math.floor(percent).toString());

    // バーは使わず、蓄積率の数字そのものの色で危険度を表す
    const level = percent < 35 ? 0 : percent < 70 ? 1 : percent < 110 ? 2 : 3;
    if (this.damageLevels.get(el) === level) return;
    this.damageLevels.set(el, level);
    const [color, shadow] = DAMAGE_LEVELS[level];
    const box = el.parentElement!;
    box.style.color = color;
    box.style.textShadow = shadow;
    box.classList.toggle('danger', level === 3);
  }

  private updateSkillBox(boxEl: HTMLElement, fillEl: HTMLElement, remainingRatio: number) {
    const ready = remainingRatio <= 0.02;
    boxEl.classList.toggle('ready', ready);
    boxEl.classList.toggle('cooling', !ready);
    setWidth(fillEl, `${Math.round((1 - Math.min(1, Math.max(0, remainingRatio))) * 100)}%`);
  }

  /** 対戦中の星取り: 勝ちは白い丸、まだの取組は薄い輪 */
  private renderWinMarks(wins: number): string {
    let s = '';
    for (let i = 0; i < 2; i++) {
      s += i < wins ? '<span class="mark-win">●</span>' : '<span class="mark-pending">○</span>';
    }
    return s;
  }

  public showBanner(mainText: string, subText: string, durationMs: number = 1800) {
    if (this.bannerTimer) {
      clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }

    const main = document.getElementById('banner-main')!;
    main.textContent = mainText;
    this.bannerSubEl.textContent = subText;

    // アニメーション再トリガー（一旦showを消してreflow後に付与）
    this.bannerEl.classList.remove('show');
    void this.bannerEl.offsetWidth; // force DOM reflow
    this.bannerEl.classList.add('show');

    if (durationMs > 0) {
      this.bannerTimer = setTimeout(() => {
        this.bannerEl.classList.remove('show');
        this.bannerTimer = null;
      }, durationMs);
    }
  }

}
