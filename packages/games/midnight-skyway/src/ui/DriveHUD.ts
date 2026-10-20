import { MINIMAP_SIZE, tracePolylineNear } from './minimapTrace';
import { speedGaugeSvg, boostArcSvg, angleOf, SPEED_MAX, SPEED_RED, SPEED_WARN, SEG_COUNT } from './dials';
import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import { setupResultMenu, applyResultMenuFocus } from '../../../../shared/arcadeResultMenu';
import { returnToHub } from '../../../../shared/homeReturn';
import * as THREE from 'three';
import { setText, setDisplay } from '../../../../shared/hudDom';
import { MapBase } from '../maps/MapBase';
import { CameraMode } from '../core/CarController';
import { PadEdge, startPadLoop, type PadPress } from '../../../../shared/arcadePad';
import type { TimeAttackResult, SectorInfo } from '../core/TimeAttackManager';

export interface DriveHUDEvents {
  onReturnToTitle: () => void;
  onChangeMap: () => void;
  onChangeCar: () => void;
  onRetry: () => void;
  onChangeCamera: (mode: CameraMode) => void;
  onSelectMap?: (mapId: string) => void;
  /** The pause menu opened / closed: the game freezes while it is open. */
  onPauseChange?: (paused: boolean) => void;
}

const MAP_SIZE = MINIMAP_SIZE;
/** ミニマップの拡大率(1m あたりのピクセル数)と、自車を置く縦の位置(0 = 上端、1 = 下端)。進行方向が上、前方が広く見える */
const MINIMAP_ZOOM = 1.1;
const MINIMAP_CAR_Y = 0.7;
/**
 * Drive HUD (Ultra-Clean Arcade Style):
 * - Streamlined to 2 essential non-intrusive zones:
 *   1. Top Left: Enlarged Transparent Minimap (Course, Blockades, Traffic)
 *   2. Bottom Right: High-tech Supercar Instrument Cluster (Lap Time, Best Time, Speed, Gear, Tachometer)
 * - Zero on-screen buttons during driving (Pause is Backspace, Cam is C, Retry is R)
 * - Transparent minimap with crisp vector drop shadows
 * - Fully localized to authentic Japanese Arcade presentation
 */
/** [文字色, 文字グロー, 枠グロー] — 速度/回転の段階(通常/警戒/レッドゾーン)ごと */
const SPEED_COLORS: ReadonlyArray<readonly [string, string, string]> = [
  ['#8ec9dc', 'rgba(142, 201, 220, 0.7)', 'rgba(142, 201, 220, 0.25)'],
  ['#e2b05e', 'rgba(226, 176, 94, 0.8)', 'rgba(226, 176, 94, 0.35)'],
  ['#d8605f', 'rgba(216, 96, 95, 0.85)', 'rgba(216, 96, 95, 0.45)'],
];

export class DriveHUD {
  private container: HTMLElement;
  private accent = '#8ec9dc';
  private accentRgb = '142, 201, 220';
  private numberLevel = 0;
  private events: DriveHUDEvents;
  public isNameEntryOpen = false;

  // DOM elements
  private speedEl!: HTMLElement;
  private bandEl!: HTMLElement;
  private edgeEl: HTMLElement | null = null;
  private segs: SVGElement[] = [];      // 速度メーターの目盛り(左から)
  private needleEl!: SVGElement;
  private litCount = 0;
  private peakSeg = -1;
  private peakSpeed = 0;
  private peakAt = 0;
  private fxKey = '';
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private attributionEl!: HTMLElement;

  // Time Attack DOM
  private timerEl!: HTMLElement;
  private bestTimeEl: HTMLElement | null = null;
  private sectorRows: { row: HTMLElement; time: HTMLElement; delta: HTMLElement }[] = [];
  private countdownEl!: HTMLElement;
  private resultModalEl!: HTMLElement;
  private resTotalTimeEl!: HTMLElement;
  private resTopSpeedEl!: HTMLElement;
  private resCarNameEl!: HTMLElement;
  private resSec1El!: HTMLElement;
  private resSec2El!: HTMLElement;
  private resSec3El!: HTMLElement;
  private resTitleEl!: HTMLElement;
  private resProgressLineEl!: HTMLElement;
  private resProgressEl!: HTMLElement;
  private resDriftLineEl!: HTMLElement;
  private resDriftEl!: HTMLElement;

  // Competitive race widgets
  private raceTopEl: HTMLElement | null = null;
  private remainingEl: HTMLElement | null = null;
  private remainingNumEl: HTMLElement | null = null;
  private gateBonusEl: HTMLElement | null = null;
  private ghostGapEl: HTMLElement | null = null;
  private driftEl!: HTMLElement;
  private driftTagEl: HTMLElement | null = null;
  private driftChainEl!: HTMLElement;
  private boostFillEl!: SVGElement;
  private gateTimeout: number | null = null;

  // Pause Modal DOM
  private pauseModalEl!: HTMLElement;
  private isPauseOpen: boolean = false;


  // Arcade pad menu navigation (pause / result modals)
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;
  private padFocus = 0;
  private modalArmTime = 0;

  private minimapPoints: THREE.Vector2[] = [];
  private extraRoutes: { points: THREE.Vector2[]; drivable: boolean }[] = [];
  private blockadePoints: THREE.Vector2[] = [];
  /** オンライン対戦: ミニマップに出す他プレイヤー。 */
  private remoteMarkers: { x: number; z: number; color: number }[] = [];

  constructor(container: HTMLElement, events: DriveHUDEvents) {
    this.container = container;
    this.events = events;
    this.createDOM();
    window.addEventListener('keydown', (e) => this.handleMenuKey(e));
  }

  private createDOM(): void {
    this.container.innerHTML = `
      <!-- Top Left: Transparent Minimap -->
      <div class="hud-minimap-arcade">
        <canvas id="minimap-canvas" width="${MAP_SIZE}" height="${MAP_SIZE}"></canvas>
      </div>

      <!-- Under the minimap: Lap Timer -->
      <div class="hud-timer-arcade" id="hud-timer-arcade">
        <div class="hud-timer-row">
          <svg class="hud-timer-icon" viewBox="0 0 32 32" aria-hidden="true">
            <rect x="12.5" y="1.5" width="7" height="3.5" rx="1" fill="currentColor" />
            <line x1="16" y1="5" x2="16" y2="8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <line x1="24.2" y1="8.6" x2="26.4" y2="6.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
            <circle cx="16" cy="18.5" r="11" fill="none" stroke="currentColor" stroke-width="2.6" />
            <line x1="16" y1="18.5" x2="21" y2="12.8" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
            <circle cx="16" cy="18.5" r="1.9" fill="currentColor" />
          </svg>
          <span class="hud-time-main" id="hud-timer">00:00.000</span>
        </div>
        <div class="hud-sectors" id="hud-sectors">
          <div class="sec-row active"><span class="sec-name">S1</span><span class="sec-time">--.--</span><span class="sec-delta"></span></div>
          <div class="sec-row"><span class="sec-name">S2</span><span class="sec-time">--.--</span><span class="sec-delta"></span></div>
          <div class="sec-row"><span class="sec-name">S3</span><span class="sec-time">--.--</span><span class="sec-delta"></span></div>
        </div>
      </div>

      <!-- Top Right: Course / Open Data Credit Notation (Plain White Text) -->
      <div id="hud-attribution" class="hud-attribution-plain" style="display: none;"></div>

      <!-- 画面の縁: 速度・ブーストに合わせて光る -->
      <div class="hud-edge" id="hud-edge"></div>

      <!-- Bottom: 1/4 円の速度メーター(隅に速度の数字)。ドリフト・ブーストは外側の弧 -->
      <div class="hud-band" id="hud-band">
        <div class="speed-gauge">
          ${speedGaugeSvg()}
          <!-- Drift / Boost: 競争コースだけ。速度メーターの外側に弧を被せる -->
          <div class="hud-drift" id="hud-drift" style="display: none;">${boostArcSvg()}</div>
          <div class="sg-readout">
            <div class="hud-drift-line"><span class="hud-drift-tag" id="hud-drift-tag"></span><span class="hud-drift-chain" id="hud-drift-chain"></span></div>
            <span class="speedo-num" id="hud-speed">0</span>
            <span class="sg-unit">km/h</span>
          </div>
        </div>
      </div>

      <!-- Countdown Overlay -->
      <div id="hud-countdown" class="hud-countdown" style="display: none;">3</div>

      <!-- In-game Pause Modal -->
      <div id="hud-pause-modal" class="hud-result-modal" style="display: none;">
        <div class="hud-arcade-modal-box">
          <div class="arcade-modal-title">ポーズ</div>
          <div class="arcade-modal-buttons">
            <button id="pause-btn-resume">再開</button>
            <button id="pause-btn-retry">やり直す</button>
            <button id="pause-btn-map">コース変更</button>
            <button id="pause-btn-car">マシン変更</button>
            <button id="pause-btn-title">ゲームを終了</button>
          </div>
        </div>
      </div>

      <!-- Time Attack Result Modal -->
      <div id="hud-result-modal" class="hud-result-modal hud-result-side" style="display: none;">
        <div class="hud-arcade-modal-box">
          <div class="arcade-modal-title gold" id="res-title">ゴール！</div>
          <div class="hud-result-time-big" id="res-total-time">00:00.000</div>
          
          <div class="hud-result-stats-table">
            <div class="stat-line"><span>使用マシン</span> <span class="val" id="res-car-name">--</span></div>
            <div class="stat-line"><span>最高速度</span> <span class="val" id="res-top-speed">0 km/h</span></div>
            <div class="stat-line" id="res-progress-line" style="display: none;"><span>到達地点</span> <span class="val" id="res-progress">--</span></div>
            <div class="stat-line" id="res-drift-line" style="display: none;"><span>ドリフトポイント</span> <span class="val" id="res-drift">0</span></div>
            <div class="stat-line"><span>区間 1</span> <span class="val" id="res-sec-1">--</span></div>
            <div class="stat-line"><span>区間 2</span> <span class="val" id="res-sec-2">--</span></div>
            <div class="stat-line"><span>区間 3</span> <span class="val" id="res-sec-3">--</span></div>
          </div>

          <div class="hud-arcade-result-buttons">
            <button id="res-btn-retry">再挑戦</button>
            <button id="res-btn-title">タイトルに戻る</button>
            <button id="res-btn-exit">ゲームを終了</button>
          </div>
        </div>
      </div>
    `;

    // Cache elements
    this.speedEl = document.getElementById('hud-speed')!;
    this.bandEl = document.getElementById('hud-band')!;
    this.edgeEl = document.getElementById('hud-edge');
    this.needleEl = document.getElementById('sg-needle') as unknown as SVGElement;
    this.segs = Array.from(document.querySelectorAll<SVGElement>('#sg-segs .sg-seg'));
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.attributionEl = document.getElementById('hud-attribution')!;

    // Time Attack elements
    this.timerEl = document.getElementById('hud-timer')!;
    this.bestTimeEl = document.getElementById('hud-best-time');
    this.sectorRows = Array.from(document.querySelectorAll<HTMLElement>('#hud-sectors .sec-row')).map((row) => ({
      row,
      time: row.querySelector<HTMLElement>('.sec-time')!,
      delta: row.querySelector<HTMLElement>('.sec-delta')!,
    }));
    this.countdownEl = document.getElementById('hud-countdown')!;
    this.resultModalEl = document.getElementById('hud-result-modal')!;
    this.resTotalTimeEl = document.getElementById('res-total-time')!;
    this.resTopSpeedEl = document.getElementById('res-top-speed')!;
    this.resCarNameEl = document.getElementById('res-car-name')!;
    this.resSec1El = document.getElementById('res-sec-1')!;
    this.resSec2El = document.getElementById('res-sec-2')!;
    this.resSec3El = document.getElementById('res-sec-3')!;
    this.resTitleEl = document.getElementById('res-title')!;
    this.resProgressLineEl = document.getElementById('res-progress-line')!;
    this.resProgressEl = document.getElementById('res-progress')!;
    this.resDriftLineEl = document.getElementById('res-drift-line')!;
    this.resDriftEl = document.getElementById('res-drift')!;
    this.raceTopEl = document.getElementById('hud-race-top');
    this.remainingEl = document.getElementById('hud-remaining');
    this.remainingNumEl = document.getElementById('hud-remaining-num');
    this.gateBonusEl = document.getElementById('hud-gate-bonus');
    this.ghostGapEl = document.getElementById('hud-ghost-gap');
    this.driftEl = document.getElementById('hud-drift')!;
    this.driftTagEl = document.getElementById('hud-drift-tag');
    this.driftChainEl = document.getElementById('hud-drift-chain')!;
    this.boostFillEl = document.getElementById('hud-boost-fill') as unknown as SVGElement;

    // Pause elements
    this.pauseModalEl = document.getElementById('hud-pause-modal')!;

    // Pause modal buttons
    document.getElementById('pause-btn-resume')?.addEventListener('click', () => this.hidePauseModal());
    document.getElementById('pause-btn-retry')?.addEventListener('click', () => {
      this.hidePauseModal();
      this.events.onRetry();
    });
    document.getElementById('pause-btn-map')?.addEventListener('click', () => {
      this.hidePauseModal();
      this.events.onChangeMap();
    });
    document.getElementById('pause-btn-car')?.addEventListener('click', () => {
      this.hidePauseModal();
      this.events.onChangeCar();
    });
    document.getElementById('pause-btn-title')?.addEventListener('click', () => {
      this.hidePauseModal();
      returnToHub(); // 他のゲームのポーズと同じく、「ゲームを終了」はホームへ戻る
    });

    // Result modal buttons
    // 順位の確認中・名前登録中、結果表示の直後は受け付けない(キー・パッドと同じ。登録が出る前に次のレースが始まってしまう)
    const resultClickBlocked = (): boolean => this.isNameEntryOpen || performance.now() < this.modalArmTime;
    document.getElementById('res-btn-exit')?.addEventListener('click', () => {
      if (resultClickBlocked()) return;
      returnToHub();
    });
    document.getElementById('res-btn-retry')?.addEventListener('click', () => {
      if (resultClickBlocked()) return;
      this.hideResultModal();
      this.events.onRetry();
    });
    document.getElementById('res-btn-title')?.addEventListener('click', () => {
      if (resultClickBlocked()) return;
      this.hideResultModal();
      this.events.onReturnToTitle();
    });

    // モーダルボタンのマウスホバーとパッドフォーカスを同期
    const bindHoverFocus = (modal: HTMLElement) => {
      const btns = modal.querySelectorAll<HTMLButtonElement>('button');
      btns.forEach((btn) => {
        btn.addEventListener('mouseenter', () => {
          const visible = this.menuButtons(modal);
          const idx = visible.indexOf(btn);
          if (idx !== -1) {
            this.setPadFocus(idx);
          }
        });
      });
    };
    bindHoverFocus(this.pauseModalEl);
    bindHoverFocus(this.resultModalEl);
  }

  public setMap(map: MapBase): void {
    const attr = map.metadata?.attribution;
    if (attr) {
      this.attributionEl.textContent = attr;
      this.attributionEl.style.display = 'block';
    } else {
      this.attributionEl.style.display = 'none';
    }

    this.minimapPoints = [];
    this.extraRoutes = map.overviewRoutes;
    this.blockadePoints = map.blockadePositions;

    if (!map.roadSpline) return;
    // 拡大して見せるので、折れ線が角ばらないよう細かく取る
    for (const p of map.roadSpline.getPoints(800)) {
      this.minimapPoints.push(new THREE.Vector2(p.x, p.z));
    }
  }

  /**
   * 速度メーター: 速度に合わせて目盛りを左から点灯し、隅にデジタルの数字を出し、針も回す。
   * 120km/h から黄、レッドゾーン(160km/h〜)で赤になり、赤の目盛りは点滅する。最高速の目盛りは3秒間白く残る。
   */
  public updateTelemetry(speedKmH: number, _rpm: number, _gear: string): void {
    setText(this.speedEl, String(speedKmH));
    const lit = Math.max(0, Math.min(SEG_COUNT, Math.round((speedKmH / SPEED_MAX) * SEG_COUNT)));
    if (lit !== this.litCount) {
      const [from, to] = lit > this.litCount ? [this.litCount, lit] : [lit, this.litCount];
      for (let i = from; i < to; i++) this.segs[i]?.classList.toggle('on', lit > this.litCount);
      this.litCount = lit;
    }
    this.needleEl.setAttribute('transform', `rotate(${angleOf(speedKmH).toFixed(1)} 196 196)`);
    const fast = Math.max(0, Math.min(1, speedKmH / 160));
    this.speedEl.style.transform = `scale(${(1 + fast * 0.08).toFixed(3)})`;

    // 最高速の印: 3秒間ためて、ゆっくり戻る
    const now = performance.now();
    if (speedKmH >= this.peakSpeed || now - this.peakAt > 3000) {
      if (speedKmH >= this.peakSpeed) this.peakAt = now;
      this.peakSpeed = Math.max(speedKmH, this.peakSpeed - 1.5);
    }
    const peak = this.peakSpeed - speedKmH > 6 ? Math.min(SEG_COUNT - 1, Math.round((this.peakSpeed / SPEED_MAX) * SEG_COUNT) - 1) : -1;
    if (peak !== this.peakSeg) {
      if (this.peakSeg >= 0) this.segs[this.peakSeg]?.classList.remove('peak');
      if (peak >= 0) this.segs[peak]?.classList.add('peak');
      this.peakSeg = peak;
    }

    this.bandEl.classList.toggle('redline', speedKmH >= SPEED_RED);
    this.updateNumberColor(speedKmH >= SPEED_RED ? 2 : speedKmH >= SPEED_WARN ? 1 : 0);
  }

  /**
   * 走行中の HUD の主色(選んだ車の色)。CSS の --hud-accent / --hud-accent-rgb を書き換え、
   * 速度の数字(通常時)とミニマップの自車も、この色にする。警戒(黄)・レッド(赤)は意味のある色なので変えない。
   */
  public setAccent(hex: string): void {
    const n = parseInt(hex.slice(1), 16);
    this.accent = hex;
    this.accentRgb = `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
    const st = this.container.style;
    st.setProperty('--hud-accent', this.accent);
    st.setProperty('--hud-accent-rgb', this.accentRgb);
    this.updateNumberColor(this.numberLevel);
  }

  /** 数字の色(通常 / 警戒 / レッドゾーン) */
  private updateNumberColor(level: number): void {
    this.numberLevel = level;
    const [color, glow] = level === 0 ? [this.accent, `rgba(${this.accentRgb}, 0.7)`] : SPEED_COLORS[level];
    this.speedEl.style.color = color;
    this.speedEl.style.textShadow = `0 0 16px ${glow}, 0 2px 8px rgba(0, 0, 0, 0.9)`;
  }

  /**
   * 速度(0〜1)・ブースト(0〜1)・スリップストリーム(0〜1)を伝える: 画面の縁が光り、バンドがブースト表示になる。
   */
  public setFx(speed: number, boost: number, slipstream: number): void {
    const key = `${speed.toFixed(2)}|${boost.toFixed(2)}|${slipstream.toFixed(2)}`;
    if (key === this.fxKey) return;
    this.fxKey = key;
    const st = this.container.style;
    st.setProperty('--fx-speed', speed.toFixed(2));
    st.setProperty('--fx-boost', boost.toFixed(2));
    st.setProperty('--fx-slip', slipstream.toFixed(2));
    this.edgeEl?.classList.toggle('on', speed > 0.05 || boost > 0.02 || slipstream > 0.02);
    this.bandEl.classList.toggle('boosting', boost > 0.3);
  }

  // ==========================================
  // Time Attack UI Methods
  // ==========================================

  public updateTimer(formatted: string): void {
    setText(this.timerEl, formatted);
  }

  public updateBestTime(formatted: string | null): void {
    if (this.bestTimeEl) this.bestTimeEl.textContent = formatted ?? '--:--.---';
  }

  public showCountdown(step: number | 'GO'): void {
    this.countdownEl.textContent = String(step);
    this.countdownEl.style.display = 'block';

    this.countdownEl.style.animation = 'none';
    void this.countdownEl.offsetWidth;
    this.countdownEl.style.animation = '';

    if (step === 'GO') {
      this.countdownEl.classList.add('go');
      window.setTimeout(() => {
        this.hideCountdown();
      }, 900);
    } else {
      this.countdownEl.classList.remove('go');
    }
  }

  public hideCountdown(): void {
    this.countdownEl.style.display = 'none';
  }

  // ---- 区間タイム(タイマーの下に常時表示): 通過した区間は確定タイムと基準との差、今の区間は経過時間 ----

  private static fmtSec(ms: number): string {
    return (ms / 1000).toFixed(2);
  }

  /** レースの開始前: すべて未通過に戻し、最初の区間を「今の区間」にする。 */
  public resetSectors(): void {
    this.sectorRows.forEach((r, i) => {
      r.time.textContent = '--.--';
      r.delta.textContent = '';
      r.row.className = 'sec-row' + (i === 0 ? ' active' : '');
    });
  }

  /** 今の区間の経過時間(毎フレーム) */
  public updateSectorLive(ms: number): void {
    const r = this.sectorRows.find((x) => x.row.classList.contains('active'));
    if (r && ms > 0) setText(r.time, DriveHUD.fmtSec(ms));
  }

  /** 区間を通過した: 確定タイムと、基準(ゴースト・自己ベスト)との差を出し、次の区間を「今の区間」にする。 */
  public setSector(sector: SectorInfo): void {
    const i = sector.index - 1;
    const r = this.sectorRows[i];
    if (!r) return;
    this.fillSector(r, sector);
    r.row.classList.add('flash');
    window.setTimeout(() => r.row.classList.remove('flash'), 900);
    this.sectorRows.forEach((x, k) => { if (k === i + 1) x.row.classList.add('active'); });
  }

  /** ゴール: すべての区間のタイムを確定させる(最後の区間は、ここで初めて分かる)。 */
  public finishSectors(sectors: SectorInfo[]): void {
    sectors.forEach((s) => {
      const r = this.sectorRows[s.index - 1];
      if (r) this.fillSector(r, s);
    });
  }

  private fillSector(r: { row: HTMLElement; time: HTMLElement; delta: HTMLElement }, sector: SectorInfo): void {
    r.time.textContent = DriveHUD.fmtSec(sector.timeMs);
    const hasRef = sector.deltaMs !== 0;
    r.delta.textContent = hasRef ? `${sector.deltaMs < 0 ? '-' : '+'}${DriveHUD.fmtSec(Math.abs(sector.deltaMs))}` : '';
    r.row.className = 'sec-row done' + (hasRef ? (sector.deltaMs < 0 ? ' fast' : ' slow') : '');
  }

  /** Shows / hides the widgets of competitive courses (time limit, ghost gap, drift score and boost meter). */
  public setRaceMode(on: boolean): void {
    if (this.raceTopEl) this.raceTopEl.style.display = on ? 'flex' : 'none';
    this.driftEl.style.display = on ? 'flex' : 'none';
    if (this.ghostGapEl) this.ghostGapEl.textContent = '';
    if (this.gateBonusEl) this.gateBonusEl.style.display = 'none';
    this.updateDrift(0, 0, 0, 0, 1);
  }

  /** `ms` null hides the time-limit readout (no rules on this course). */
  public updateRemaining(ms: number | null): void {
    if (!this.remainingEl) return;
    setDisplay(this.remainingEl, ms === null ? 'none' : 'flex');
    if (ms === null || !this.remainingNumEl) return;
    setText(this.remainingNumEl, (ms / 1000).toFixed(1));
    this.remainingEl.classList.toggle('low', ms < 10000);
  }

  public showGateBonus(bonusMs: number): void {
    if (!this.gateBonusEl) return;
    if (this.gateTimeout) clearTimeout(this.gateTimeout);
    this.gateBonusEl.textContent = `CHECKPOINT  +${(bonusMs / 1000).toFixed(1)}s`;
    this.gateBonusEl.style.display = 'block';
    this.gateBonusEl.style.animation = 'none';
    void this.gateBonusEl.offsetWidth;
    this.gateBonusEl.style.animation = '';
    this.gateTimeout = window.setTimeout(() => { if (this.gateBonusEl) this.gateBonusEl.style.display = 'none'; }, 2200);
  }

  /** gapMs: race time minus the rival's time at the same spot (negative = ahead). null = unknown. */
  public updateGhostGap(gapMs: number | null, label: string): void {
    if (!this.ghostGapEl) return;
    if (gapMs === null) { setText(this.ghostGapEl, ''); return; }
    const ahead = gapMs <= 0;
    setText(this.ghostGapEl, `${label}  ${ahead ? '-' : '+'}${(Math.abs(gapMs) / 1000).toFixed(2)}s`);
    const cls = 'hud-ghost-gap ' + (ahead ? 'ahead' : 'behind');
    if (this.ghostGapEl.className !== cls) this.ghostGapEl.className = cls;
  }

  /** 外側の弧の長さ(0〜100%) */
  private setBoostArc(pct: number): void {
    this.boostFillEl.setAttribute('stroke-dasharray', `${pct} 100`);
  }

  public updateDrift(_score: number, chain: number, chainTime: number, boostLeft: number, boostMax: number): void {
    const isMax = chainTime >= 3.6 || boostLeft >= 4.4;

    if (isMax) {
      // 溜まった時: READYのみ、ゲージ100%
      if (this.driftTagEl) {
        this.driftTagEl.textContent = 'READY';
        this.driftTagEl.style.display = 'inline-block';
        this.driftTagEl.classList.add('ready');
      }
      setText(this.driftChainEl, '');
      this.setBoostArc(100);
      this.driftEl.classList.add('boosting');
    } else if (chain > 0) {
      // 貯めている時: 数字のみ、ゲージも溜まっていく
      if (this.driftTagEl) {
        this.driftTagEl.style.display = 'none';
        this.driftTagEl.classList.remove('ready');
      }
      setText(this.driftChainEl, `+${Math.round(chain)}`);
      const chargePct = Math.round(Math.min(1, chainTime / 3.6) * 100);
      this.setBoostArc(chargePct);
      this.driftEl.classList.remove('boosting');
    } else if (boostLeft > 0) {
      // ブースト中: 文字なし、ゲージが減っていく
      if (this.driftTagEl) {
        this.driftTagEl.style.display = 'none';          // 「BOOST」の文字は出さない
        this.driftTagEl.classList.remove('ready');
      }
      setText(this.driftChainEl, '');
      this.setBoostArc(Math.round(Math.min(1, boostLeft / Math.max(0.1, boostMax)) * 100));
      this.driftEl.classList.add('boosting');
    } else {
      // 何もしていない時: 文字なし、ゲージ0%
      if (this.driftTagEl) {
        this.driftTagEl.style.display = 'none';          // 「DRIFT」の文字は出さない
        this.driftTagEl.classList.remove('ready');
      }
      setText(this.driftChainEl, '');
      this.setBoostArc(0);
      this.driftEl.classList.remove('boosting');
    }
  }

  public showResultModal(result: TimeAttackResult): void {
    this.resTitleEl.textContent = result.timedOut ? 'タイムアップ！' : 'ゴール！';
    this.resTitleEl.classList.toggle('gold', !result.timedOut);
    this.resProgressLineEl.style.display = result.timedOut ? 'flex' : 'none';
    this.resProgressEl.textContent = `${Math.round((result.progress ?? 0) * 100)} %`;
    this.resDriftLineEl.style.display = result.driftScore === undefined ? 'none' : 'flex';
    this.resDriftEl.textContent = String(result.driftScore ?? 0);
    countUpText(this.resTotalTimeEl, result.formattedTime);
    this.resTopSpeedEl.textContent = `${result.topSpeedKmH} km/h`;
    this.resCarNameEl.textContent = result.carName;

    const fmtSec = (ms?: number) => (ms !== undefined ? `${(ms / 1000).toFixed(3)}s` : '--');
    this.resSec1El.textContent = fmtSec(result.sectors[0]?.timeMs);
    this.resSec2El.textContent = fmtSec(result.sectors[1]?.timeMs);
    this.resSec3El.textContent = fmtSec(result.sectors[2]?.timeMs);

    this.resultModalEl.style.display = 'flex';
    this.container.classList.add('result-open');    // the result sits beside the car (winning run): clear the other widgets
    this.modalArmTime = performance.now() + 600; // 走行中の連打で誤決定しない
    this.syncPadMenu(0); // 再挑戦がデフォルト
  }

  /** 名前登録が閉じた直後は、決定ボタンの押下がメニューの決定として入らないよう、しばらく受け付けない */
  public armResultModal(ms = 800): void {
    this.modalArmTime = performance.now() + ms;
  }

  public hideResultModal(): void {
    this.resultModalEl.style.display = 'none';
    this.container.classList.remove('result-open');
    this.syncPadMenu();
  }

  public isResultModalOpen(): boolean {
    return this.resultModalEl.style.display === 'flex';
  }

  // ==========================================
  // Pause Modal
  // ==========================================

  public togglePause(open?: boolean): void {
    const shouldOpen = open !== undefined ? open : !this.isPauseOpen;
    if (shouldOpen) {
      this.showPauseModal();
    } else {
      this.hidePauseModal();
    }
  }

  public showPauseModal(): void {
    this.isPauseOpen = true;
    this.pauseModalEl.style.display = 'flex';
    this.syncPadMenu(0);
    this.events.onPauseChange?.(true);
  }

  public hidePauseModal(): void {
    this.isPauseOpen = false;
    this.pauseModalEl.style.display = 'none';
    this.syncPadMenu();
    this.events.onPauseChange?.(false);
  }

  /** True while the pause or result menu is up (the arcade pad then drives the menu instead of the car). */
  public isMenuOpen(): boolean {
    return this.isPauseOpen || this.isResultModalOpen();
  }

  private openModal(): HTMLElement | null {
    if (this.isResultModalOpen()) return this.resultModalEl;
    if (this.isPauseOpen) return this.pauseModalEl;
    return null;
  }

  /** 表示中のボタンだけ(オンライン対戦では一部を隠す)。 */
  private menuButtons(modal: HTMLElement): HTMLButtonElement[] {
    return [...modal.querySelectorAll<HTMLButtonElement>('button')].filter((b) => b.style.display !== 'none');
  }

  private setPadFocus(index: number): void {
    const modal = this.openModal();
    if (!modal) return;
    const buttons = this.menuButtons(modal);
    this.padFocus = (index + buttons.length) % buttons.length;
    buttons.forEach((b, i) => b.classList.toggle('pad-focus', i === this.padFocus));
    // 選択中のボタンだけ色とAボタンのガイドを出し、それ以外はグレーにする
    const colors = modal === this.resultModalEl ? ['#e2b05e', '#8fd3a6', this.accent] : [this.accent];
    const items = buttons.map((button, i) => ({ button, color: modal === this.resultModalEl ? (colors[i] ?? colors[0]) : colors[0] }));
    setupResultMenu(buttons[0]?.parentElement ?? null, items);
    applyResultMenuFocus(items, this.padFocus);
  }

  /** Starts/stops the pad loop to match whether a menu is open; a newly opened menu focuses its first button. */
  private syncPadMenu(initialFocus = 0): void {
    const open = this.openModal() !== null;
    if (open && !this.stopPad) {
      this.stopPad = startPadLoop(this.padEdge, (p) => this.handleMenuPad(p));
      this.setPadFocus(initialFocus);
    } else if (open && this.stopPad) {
      this.setPadFocus(initialFocus);
    } else if (!open && this.stopPad) {
      this.stopPad();
      this.stopPad = null;
      document.querySelectorAll('.pad-focus').forEach((el) => el.classList.remove('pad-focus'));
    }
  }

  // Lever: move focus / A: confirm / B: resume (pause) or exit (result)
  private handleMenuPad(p: PadPress): void {
    if (this.isNameEntryOpen) return;
    const modal = this.openModal();
    if (!modal) return;
    if (p.up || p.left) this.setPadFocus(this.padFocus - 1);
    else if (p.down || p.right) this.setPadFocus(this.padFocus + 1);
    else if (performance.now() < this.modalArmTime) return;
    else if (p.any(0)) this.menuButtons(modal)[this.padFocus]?.click();
    else if (p.any(1)) {
      if (modal === this.pauseModalEl) this.hidePauseModal();
      else if (modal === this.resultModalEl) returnToHub();
    }
  }

  // Keyboard: move focus (WASD) / confirm (Enter) / cancel (Backspace)
  private handleMenuKey(e: KeyboardEvent): void {
    if (!this.isMenuOpen() || this.isNameEntryOpen) return;
    const modal = this.openModal();
    if (!modal) return;

    if (e.code === 'KeyW' || e.code === 'KeyA') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.setPadFocus(this.padFocus - 1);
    } else if (e.code === 'KeyS' || e.code === 'KeyD') {
      e.preventDefault();
      e.stopImmediatePropagation();
      this.setPadFocus(this.padFocus + 1);
    } else if (performance.now() < this.modalArmTime) {
      e.preventDefault();
      e.stopImmediatePropagation();
    } else if (e.code === 'Enter') {
      e.preventDefault();
      e.stopImmediatePropagation();
      const buttons = this.menuButtons(modal);
      buttons[this.padFocus]?.click();
    } else if (e.code === 'Backspace') {
      if (modal === this.pauseModalEl) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.hidePauseModal();
      } else if (modal === this.resultModalEl) {  // 結果画面の Backspace は、タイトルへ戻る
        e.preventDefault();
        e.stopImmediatePropagation();
        document.getElementById('res-btn-title')?.click();
      }
    }
  }

  // ==========================================
  // Minimap Rendering (Transparent Vector Overlay)
  // ==========================================

  public setRemoteMarkers(markers: { x: number; z: number; color: number }[]): void {
    this.remoteMarkers = markers;
  }

  /** オンライン対戦中は、リトライ・コース変更・車変更をポーズメニューから外し、「タイトルへ」を退出にする。 */
  public setOnlineMode(on: boolean): void {
    for (const id of ['pause-btn-retry', 'pause-btn-map', 'pause-btn-car', 'res-btn-retry']) {
      const el = document.getElementById(id);
      if (el) el.style.display = on ? 'none' : '';
    }
    for (const id of ['pause-btn-title', 'res-btn-title']) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.dataset.label ??= el.textContent ?? '';
      el.textContent = on ? 'ロビーへ戻る' : el.dataset.label;
    }
    if (!on) this.remoteMarkers = [];
  }

  public updateCarPosition(
    carPos: THREE.Vector3,
    carRotY: number,
    forwardCars: THREE.Vector2[] = []
  ): void {
    this.drawMinimap(carPos, carRotY, forwardCars);
  }

  private drawMinimap(carPos: THREE.Vector3, carRotY: number, forwardCars: THREE.Vector2[]): void {
    const ctx = this.ctx, w = MAP_SIZE, h = MAP_SIZE;
    ctx.clearRect(0, 0, w, h);
    if (this.minimapPoints.length === 0) return;

    // 自車を中心にして、進行方向が上になるように地図を回す(拡大して、いまの周りだけを見せる)
    const scale = MINIMAP_ZOOM;
    const toCanvas = (x: number, z: number): [number, number] => [
      (x - carPos.x) * scale,
      (z - carPos.z) * scale,
    ];
    ctx.save();
    ctx.translate(w / 2, h * MINIMAP_CAR_Y);
    ctx.rotate(carRotY - Math.PI);

    // 1. Blocked / non-drivable side routes (subtle drop shadow for transparent visibility)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    for (const r of this.extraRoutes) {
      ctx.beginPath();
      tracePolylineNear(ctx, r.points, false, toCanvas);
      ctx.strokeStyle = r.drivable ? '#88ccff' : '#444455';
      ctx.lineWidth = r.drivable ? 2.8 : 1.8;
      ctx.stroke();
    }
    ctx.restore();

    // 2. Main course drivable loop
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    tracePolylineNear(ctx, this.minimapPoints, true, toCanvas);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.restore();

    // 3. Start / Finish Line (Gold box with outline)
    const [sx, sy] = toCanvas(this.minimapPoints[0].x, this.minimapPoints[0].y);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#e2b05e';
    ctx.fillRect(sx - 4.5, sy - 4.5, 9, 9);
    ctx.restore();

    // 4. Blockade Icons (Red X)
    for (const bp of this.blockadePoints) {
      const [bx, by] = toCanvas(bp.x, bp.y);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
      ctx.shadowBlur = 5;
      ctx.strokeStyle = '#ff2244';
      ctx.lineWidth = 2.8;
      ctx.beginPath();
      ctx.moveTo(bx - 4.5, by - 4.5);
      ctx.lineTo(bx + 4.5, by + 4.5);
      ctx.moveTo(bx + 4.5, by - 4.5);
      ctx.lineTo(bx - 4.5, by + 4.5);
      ctx.stroke();
      ctx.restore();
    }

    // 5. Forward Traffic Obstacle Cars (Yellow dots with shadow)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#e2b05e';
    for (const fc of forwardCars) {
      const [fx, fy] = toCanvas(fc.x, fc.y);
      ctx.beginPath();
      ctx.arc(fx, fy, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // 5b. Other players (online): coloured dots with a white ring
    for (const m of this.remoteMarkers) {
      const [mx, my] = toCanvas(m.x, m.z);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#' + m.color.toString(16).padStart(6, '0');
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(mx, my, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();

    // 6. Player Car (Glowing Cyan Arrow): いつも画面の同じ場所で、上(進行方向)を向く
    ctx.save();
    ctx.translate(w / 2, h * MINIMAP_CAR_Y);
    ctx.fillStyle = this.accent;
    ctx.shadowColor = this.accent;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-6, 7);
    ctx.lineTo(6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  public show(): void {
    this.container.style.display = 'block';
    this.hideResultModal();
    this.hidePauseModal();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.hideResultModal();
    this.hidePauseModal();
    this.hideCountdown();
  }
}
