import { MINIMAP_SIZE, tracePolylineNear } from './minimapTrace';
import { speedGaugeSvg, angleOf, SPEED_MAX, SPEED_RED, SPEED_WARN, SEG_COUNT } from './dials';
import { STAGES } from './stages';
import { TIMER_SOLID_SVG } from './icons';
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

const TROPHY_SOLID_SVG =
  '<svg class="ri-ico ri-trophy" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M5 2.5H19V5.2H22.2V9.5C22.2 12.3 20.4 14.3 17.8 14.8C16.7 16.5 15 17.7 13.3 18.1V19.8H17.5V22.2H6.5V19.8H10.7V18.1C9 17.7 7.3 16.5 6.2 14.8C3.6 14.3 1.8 12.3 1.8 9.5V5.2H5V2.5Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '<path d="M3.7 7.2H5.3V11.8C4.3 11.4 3.7 10.5 3.7 9.4V7.2ZM20.3 7.2H18.7V11.8C19.7 11.4 20.3 10.5 20.3 9.4V7.2Z" fill="#05070c"/>' +
  '</svg>';
const TROPHY_EMPTY_SVG =
  '<svg class="ri-ico ri-trophy-empty" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M5.5 3H18.5V6H21.5V9.5C21.5 11.9 19.9 13.7 17.6 14.2C16.6 15.8 15 17 13 17.4V19.8H16.8V21.5H7.2V19.8H11V17.4C9 17 7.4 15.8 6.4 14.2C4.1 13.7 2.5 11.9 2.5 9.5V6H5.5V3Z" fill="rgba(5,9,20,0.72)" stroke="rgba(0,0,0,0.9)" stroke-width="4.2" stroke-linejoin="round"/>' +
  '<path d="M5.5 3H18.5V6H21.5V9.5C21.5 11.9 19.9 13.7 17.6 14.2C16.6 15.8 15 17 13 17.4V19.8H16.8V21.5H7.2V19.8H11V17.4C9 17 7.4 15.8 6.4 14.2C4.1 13.7 2.5 11.9 2.5 9.5V6H5.5V3Z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3.2 2.4" stroke-linejoin="round"/>' +
  '</svg>';
const TIMER_EMPTY_SVG =
  '<svg class="ri-ico ri-timer-empty" viewBox="0 0 24 24" aria-hidden="true">' +
  '<circle cx="12" cy="13.6" r="8.2" fill="rgba(5,9,20,0.72)" stroke="rgba(0,0,0,0.9)" stroke-width="4.2"/>' +
  '<circle cx="12" cy="13.6" r="8.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-dasharray="3.2 2.4"/>' +
  '<path d="M9.2 2H14.8M12 9.5V13.6L14.8 15.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
  '</svg>';
const FLAG_SVG =
  '<svg class="ri-ico" viewBox="0 0 20 22" aria-hidden="true">' +
  '<path d="M3 2H5.5V4H17.5L14.5 9L17.5 14H5.5V20H3V2Z" fill="currentColor" stroke="rgba(0,0,0,0.92)" stroke-width="2.6" stroke-linejoin="round" paint-order="stroke fill"/>' +
  '</svg>';

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
  private resSecEls: HTMLElement[] = [];
  private resSectorsEl!: HTMLElement;
  private resSubEl!: HTMLElement;
  private resRankEl!: HTMLElement;
  private resProgressEl!: HTMLElement;
  private resTitleEl!: HTMLElement;
  private resStageEl!: HTMLElement;
  private resTagEl!: HTMLElement;
  private courseName = '';
  private stopCountUp: (() => void) | null = null;
  // ゴールの瞬間に画面の中央へ打ち込むタイム
  private finishStampEl!: HTMLElement;
  private fsTimeEl!: HTMLElement;
  private fsTagEl!: HTMLElement;

  // Competitive race widgets
  private raceTopEl: HTMLElement | null = null;
  private remainingEl: HTMLElement | null = null;
  private remainingNumEl: HTMLElement | null = null;
  private gateBonusEl: HTMLElement | null = null;
  private ghostGapEl: HTMLElement | null = null;
  private driftEl!: HTMLElement;
  private driftFillEl!: HTMLElement;
  /** バーの状態(idle=隠れている / charge=溜めている / ready=満タン / boost=ブースト中)と、塗りの長さ(%)。変わった時だけ書き換える */
  private driftState: 'idle' | 'charge' | 'ready' | 'boost' = 'idle';
  private driftPct = -1;
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
  private minimapRoadWidth = 12;
  private extraRoutes: { points: THREE.Vector2[]; drivable: boolean }[] = [];
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

      <!-- Drift / Boost: 競争コースだけ。画面の中央下に、ドリフトした時だけ出るバー(車の色の波模様で溜まる) -->
      <div class="hud-drift-bar" id="hud-drift" style="display: none;">
        <div class="hdb-track"><div class="hdb-fill" id="hud-drift-fill"></div></div>
      </div>

      <!-- Bottom: 1/4 円の速度メーター(隅に速度の数字) -->
      <div class="hud-band" id="hud-band">
        <div class="speed-gauge">
          ${speedGaugeSvg()}
          <div class="sg-readout">
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

      <!-- ゴールの瞬間: 画面の中央に打ち込むタイム(リザルトが出ると、そのタイムの欄へ縮んで収まる) -->
      <div id="hud-finish-stamp" class="hud-finish-stamp" aria-hidden="true">
        <div class="fs-label">FINISH</div>
        <div class="fs-time" id="fs-time">00:00.000</div>
        <div class="fs-tag" id="fs-tag"></div>
      </div>

      <!-- Time Attack Result Modal: 1行目=コース名 / 2行目=タイム(車の主色) / 3行目=順位・ベスト差・区間1〜3 / 4行目=ボタン -->
      <div id="hud-result-modal" class="hud-result-modal hud-result-side res-variant-3" style="display: none;">
        <div class="hud-arcade-modal-box">
          <div class="res-kicker" id="res-title">
            <span class="rk-stage" id="res-stage"></span>
            <span class="rk-tag" id="res-tag" style="display: none;"></span>
          </div>
          <div class="hud-result-time-big" id="res-total-time">00:00.000</div>

          <div class="res-row3" id="res-row3">
            <div class="res-badges">
              <div class="res-rank" id="res-rank" style="display: none;"></div>
              <div class="res-sub" id="res-sub"></div>
            </div>
            <div class="res-progress" id="res-progress" style="display: none;"></div>
            <div class="res-sectors" id="res-sectors">
              <div class="rs-box"><span class="rs-head">1</span><span class="rs-val" id="res-sec-1">--</span></div>
              <div class="rs-box"><span class="rs-head">2</span><span class="rs-val" id="res-sec-2">--</span></div>
              <div class="rs-box"><span class="rs-head">3</span><span class="rs-val" id="res-sec-3">--</span></div>
            </div>
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
    this.resSecEls = [1, 2, 3].map((k) => document.getElementById(`res-sec-${k}`)!);
    this.resSectorsEl = document.getElementById('res-sectors')!;
    this.resSubEl = document.getElementById('res-sub')!;
    this.resRankEl = document.getElementById('res-rank')!;
    this.resProgressEl = document.getElementById('res-progress')!;
    this.resTitleEl = document.getElementById('res-title')!;
    this.resStageEl = document.getElementById('res-stage')!;
    this.resTagEl = document.getElementById('res-tag')!;
    this.finishStampEl = document.getElementById('hud-finish-stamp')!;
    this.fsTimeEl = document.getElementById('fs-time')!;
    this.fsTagEl = document.getElementById('fs-tag')!;
    this.raceTopEl = document.getElementById('hud-race-top');
    this.remainingEl = document.getElementById('hud-remaining');
    this.remainingNumEl = document.getElementById('hud-remaining-num');
    this.gateBonusEl = document.getElementById('hud-gate-bonus');
    this.ghostGapEl = document.getElementById('hud-ghost-gap');
    this.driftEl = document.getElementById('hud-drift')!;
    this.driftFillEl = document.getElementById('hud-drift-fill')!;

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

    // ゴール時・ポーズ時に初めて DOM と <style> を差し込むとレイアウト再計算のスパイクになるため、起動時に組み立てておく
    for (const modal of [this.pauseModalEl, this.resultModalEl]) {
      const buttons = this.menuButtons(modal);
      const colors = modal === this.resultModalEl ? ['#e2b05e', '#8fd3a6', this.accent] : [this.accent];
      const items = buttons.map((button, i) => ({ button, color: modal === this.resultModalEl ? (colors[i] ?? colors[0]) : colors[0] }));
      setupResultMenu(buttons[0]?.parentElement ?? null, items);
    }
    this.setAccent(this.accent);
  }

  public setMap(map: MapBase): void {
    const st = STAGES.find((s) => s.id === map.metadata?.id);
    this.courseName = st?.title ?? map.metadata?.name ?? '';
    const attr = map.metadata?.attribution;
    if (attr) {
      this.attributionEl.textContent = attr;
      this.attributionEl.style.display = 'block';
    } else {
      this.attributionEl.style.display = 'none';
    }

    this.minimapPoints = [];
    this.minimapRoadWidth = map.getRoadWidth() ?? 12;
    this.extraRoutes = map.overviewRoutes;

    const route = map.getRoutePoints();
    if (route && route.length > 0) {
      // 実際の走行レーン・壁判定と同じ中心線を使い、カーブで道幅がずれないようにする(約4m間隔)
      for (let i = 0; i < route.length; i += 2) {
        this.minimapPoints.push(new THREE.Vector2(route[i].x, route[i].z));
      }
      return;
    }
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
   * 走行中の HUD の主色(選んだ車の色)。CSS の --hud-accent / --hud-accent-rgb と、
   * リザルトのタイム文字の中を流れる波模様(--hud-wave-bg)を書き換える。
   */
  public setAccent(hex: string): void {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    this.accent = hex;
    this.accentRgb = `${r}, ${g}, ${b}`;
    // HUD用のパステル寄りの色(r,g,b)から色相(H)を取り出し、彩度100%・深みのある高コントラストな3層波カラーに変換する
    const rf = r / 255, gf = g / 255, bf = b / 255;
    const max = Math.max(rf, gf, bf), min = Math.min(rf, gf, bf);
    let h = 0;
    if (max !== min) {
      const d = max - min;
      if (max === rf) h = ((gf - bf) / d + (gf < bf ? 6 : 0)) * 60;
      else if (max === gf) h = ((bf - rf) / d + 2) * 60;
      else h = ((rf - gf) / d + 4) * 60;
    }
    // 紅蓮(h≈17°)は鮮やかな深紅(8°)へ寄せ、暖色は深い琥珀・真紅へ、寒色は深いコバルト・群青へ色相を深める
    const hBase = h < 28 ? 8 : h;
    const shift = hBase < 80 ? -10 : 14;
    const hsl = (deg: number, s: number, l: number): string => `hsl(${((deg % 360) + 360) % 360}, ${s}%, ${l}%)`;
    const cCrest = hsl(hBase - shift * 0.4, 100, 68);
    const cTop = hsl(hBase, 98, 49);
    const cMain = hsl(hBase + shift, 98, 39);
    const cRich = hsl(hBase + shift * 1.8, 96, 27);
    const cDeep = hsl(hBase + shift * 2.3, 95, 15);
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" preserveAspectRatio="none">` +
      `<defs>` +
      `<linearGradient id="g0" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${cTop}"/>` +
      `<stop offset="100%" stop-color="${cMain}"/>` +
      `</linearGradient>` +
      `<linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${cMain}"/>` +
      `<stop offset="100%" stop-color="${cRich}"/>` +
      `</linearGradient>` +
      `<linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="${cRich}"/>` +
      `<stop offset="100%" stop-color="${cDeep}"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="200" height="120" fill="url(#g0)"/>` +
      `<path d="M0,44 C32,10 68,78 100,44 C132,10 168,78 200,44 L200,120 L0,120 Z" fill="url(#g1)"/>` +
      `<path d="M0,44 C32,10 68,78 100,44 C132,10 168,78 200,44" fill="none" stroke="${cCrest}" stroke-width="6"/>` +
      `<path d="M0,78 C32,110 68,46 100,78 C132,110 168,46 200,78 L200,120 L0,120 Z" fill="url(#g2)"/>` +
      `<path d="M0,78 C32,110 68,46 100,78 C132,110 168,46 200,78" fill="none" stroke="${cTop}" stroke-width="4.5" stroke-opacity="0.9"/>` +
      `</svg>`;
    const st = this.container.style;
    st.setProperty('--hud-accent', this.accent);
    st.setProperty('--hud-accent-rgb', this.accentRgb);
    st.setProperty('--hud-wave-bg', `url("data:image/svg+xml,${encodeURIComponent(svg)}")`);
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
   * 速度(0〜1)・ブースト(0〜1)を伝える: 画面の縁が光り、バンドがブースト表示になる。
   */
  public setFx(speed: number, boost: number): void {
    const edgeAlpha = Math.min(1, speed * 0.35 + boost * 0.9);
    const qAlpha = Math.round(edgeAlpha * 20) / 20;
    const boosting = boost > 0.3;
    const key = `${qAlpha.toFixed(2)}|${boosting ? 1 : 0}`;
    if (key === this.fxKey) return;
    this.fxKey = key;
    if (this.edgeEl) {
      this.edgeEl.style.opacity = qAlpha > 0.02 ? qAlpha.toFixed(2) : '0';
    }
    this.bandEl.classList.toggle('boosting', boosting);
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

  private countdownTimerId = 0;

  public showCountdown(step: number | 'GO'): void {
    window.clearTimeout(this.countdownTimerId);
    this.countdownEl.textContent = String(step);
    this.countdownEl.style.display = 'block';

    this.countdownEl.style.animation = 'none';
    void this.countdownEl.offsetWidth;
    this.countdownEl.style.animation = '';

    if (step === 'GO') {
      this.countdownEl.classList.add('go');
      this.countdownTimerId = window.setTimeout(() => {
        this.hideCountdown();
      }, 900);
    } else {
      this.countdownEl.classList.remove('go');
    }
  }

  public hideCountdown(): void {
    window.clearTimeout(this.countdownTimerId);
    this.countdownEl.style.display = 'none';
    this.countdownEl.classList.remove('go');
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

  /** 区間を通過した: 確定タイムと、基準(ゴースト・ベストタイム)との差を出し、次の区間を「今の区間」にする。 */
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
    const hasRef = sector.hasRef ?? sector.deltaMs !== 0;
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

  /**
   * ドリフト / ブーストのバー(文字は出さない)。ドリフトを始めると出て(打ち込まれるように)、溜まるほど車の色の波模様が伸び、
   * 満タンで明滅する。ブースト中は減っていき、使い切ると消える。
   */
  public updateDrift(_score: number, chain: number, chainTime: number, boostLeft: number, boostMax: number): void {
    const isMax = chainTime >= 3.6 || boostLeft >= 4.4;
    let state: 'idle' | 'charge' | 'ready' | 'boost';
    let pct: number;
    if (isMax) {
      state = 'ready';
      pct = 100;
    } else if (chain > 0) {
      state = 'charge';
      pct = Math.round(Math.min(1, chainTime / 3.6) * 100);
    } else if (boostLeft > 0) {
      state = 'boost';
      pct = Math.round(Math.min(1, boostLeft / Math.max(0.1, boostMax)) * 100);
    } else {
      state = 'idle';
      pct = 0;
    }
    if (pct !== this.driftPct) {
      this.driftPct = pct;
      this.driftFillEl.style.setProperty('--p', `${pct}%`);
    }
    if (state === this.driftState) return;
    const el = this.driftEl;
    if (this.driftState === 'idle' && state !== 'idle') {
      el.classList.remove('pop');                    // 出るたびに、打ち込みのアニメーションをやり直す
      void el.offsetWidth;
      el.classList.add('pop');
    }
    el.classList.toggle('show', state !== 'idle');
    el.classList.toggle('ready', state === 'ready');
    el.classList.toggle('boosting', state === 'boost' || state === 'ready');
    this.driftState = state;
  }

  /**
   * リザルトを出す: タイム(太い字で、打ち込まれて光が流れる)・ベストタイムとの差・(上位なら)順位・区間ごとのライバルとの差。
   * 見出しはタイムアップのときだけ出し、区間の代わりに到達地点を出す。
   */
  public showResultModal(result: TimeAttackResult): void {
    const timedOut = !!result.timedOut;
    const isRecord = !timedOut && result.isNewRecord && result.prevBestMs !== undefined;
    this.resultModalEl.classList.toggle('is-record', isRecord);
    this.resultModalEl.classList.toggle('is-timeout', timedOut);
    this.resTitleEl.style.display = 'flex';
    this.resStageEl.textContent = this.courseName;
    this.resStageEl.style.display = this.courseName ? '' : 'none';
    // FINISH などのラベルは出さず、タイムアップのときだけ見出し横に添える
    this.resTagEl.textContent = timedOut ? 'タイムアップ' : '';
    this.resTagEl.style.display = timedOut ? 'inline-block' : 'none';
    this.resTagEl.className = 'rk-tag' + (timedOut ? ' timeout' : '');
    const timeEl = this.resTotalTimeEl;
    timeEl.classList.toggle('record', isRecord);
    timeEl.classList.add('stamp');
    this.stopCountUp?.();
    this.stopCountUp = countUpText(timeEl, result.formattedTime);

    // ベストタイムとの差: 太い時計アイコン + 差分の秒数(初回完走で記録がない時は点線アイコン + ---)
    if (timedOut) {
      this.resSubEl.innerHTML = '';
      this.resSubEl.className = 'res-sub';
      this.resRankEl.style.display = 'none';
    } else {
      if (result.prevBestMs !== undefined) {
        const diff = (result.totalTimeMs - result.prevBestMs) / 1000;
        const sign = result.isNewRecord ? '−' : '+';
        const val = `${sign}${Math.abs(diff).toFixed(3)}`;
        this.resSubEl.innerHTML = `${TIMER_SOLID_SVG}<span class="ri-txt">${val}</span>`;
        this.resSubEl.className = `res-sub ${result.isNewRecord ? 'record' : 'slow'}`;
      } else {
        this.resSubEl.innerHTML = `${TIMER_EMPTY_SVG}<span class="ri-txt">---</span>`;
        this.resSubEl.className = 'res-sub empty';
      }
      // 順位が確定するまでは点線の空トロフィー + --位 を出しておく(圏外のままでも空スロットであることが分かる)
      this.resRankEl.innerHTML = `${TROPHY_EMPTY_SVG}<span class="ri-txt">--位</span>`;
      this.resRankEl.className = 'res-rank rank-none';
      this.resRankEl.style.display = 'inline-flex';
    }

    this.resProgressEl.style.display = timedOut ? 'inline-flex' : 'none';
    if (timedOut) {
      this.resProgressEl.innerHTML = `${FLAG_SVG}<span class="ri-txt">${Math.round((result.progress ?? 0) * 100)}%</span>`;
    }

    // 区間: ライバルとの差(速ければ緑、遅ければ赤)。番号チップ(1/2/3) + 数値のみ
    this.resSectorsEl.style.display = timedOut ? 'none' : '';
    this.resSecEls.forEach((el, i) => {
      const sec = result.sectors[i];
      const ref = !!sec && (sec.hasRef ?? sec.deltaMs !== 0);
      el.textContent = !sec ? '--' : ref ? `${sec.deltaMs < 0 ? '−' : '+'}${DriveHUD.fmtSec(Math.abs(sec.deltaMs))}` : DriveHUD.fmtSec(sec.timeMs);
      el.parentElement!.className = 'rs-box' + (ref ? (sec.deltaMs < 0 ? ' fast' : ' slow') : '');
    });

    this.resultModalEl.style.display = 'flex';
    this.container.classList.add('result-open');    // the result sits beside the car (winning run): clear the other widgets
    this.modalArmTime = performance.now() + 600; // 走行中の連打で誤決定しない
    this.syncPadMenu(0); // 再挑戦がデフォルト
  }

  /** ランキングの順位が分かった(1位=金、2位=銀、3位=銅、4位〜=水色のトロフィー。null=圏外は点線トロフィー) */
  public setResultRank(rank: number | null): void {
    if (rank === null) {
      this.resRankEl.innerHTML = `${TROPHY_EMPTY_SVG}<span class="ri-txt">--位</span>`;
      this.resRankEl.className = 'res-rank rank-none';
      this.resRankEl.style.display = 'inline-flex';
      return;
    }
    const tier = rank === 1 ? 'rank-1 top' : rank === 2 ? 'rank-2' : rank === 3 ? 'rank-3' : 'rank-other';
    this.resRankEl.innerHTML = `${TROPHY_SOLID_SVG}<span class="ri-txt">${rank}位</span>`;
    this.resRankEl.className = `res-rank ${tier}`;
    this.resRankEl.style.display = 'inline-flex';
    this.resRankEl.classList.remove('pop');
    void this.resRankEl.offsetWidth;
    this.resRankEl.classList.add('pop');
  }

  /**
   * オンライン対戦のゴール: 画面の中央に自分のタイムを打ち込み、しばらくして消す(結果はサーバーの順位表で出る)。
   * tag は「NEW RECORD」など(無ければ null)
   */
  public showFinishStamp(time: string, tag: string | null): void {
    this.fsTimeEl.getAnimations().forEach((a) => a.cancel());
    this.fsTimeEl.textContent = time;
    this.fsTagEl.textContent = tag ?? '';
    const el = this.finishStampEl;
    el.className = 'hud-finish-stamp';
    void el.offsetWidth;                                // アニメーションを最初から
    el.classList.add('on', 'auto-out');
    el.classList.toggle('record', !!tag);
  }

  /** ゴールのスローモーションの間: 走行中の表示(速度計・ミニマップ)を消して、映像だけを見せる */
  public setFinishing(on: boolean): void {
    this.container.classList.toggle('finishing', on);
  }

  public setGameplayHUDVisible(visible: boolean): void {
    const d = visible ? '' : 'none';
    for (const sel of ['.hud-minimap-arcade', '#hud-timer-arcade', '#hud-band', '#hud-drift']) {
      const el = this.container.querySelector<HTMLElement>(sel);
      if (el) el.style.display = d;
    }
  }

  public hideFinishStamp(): void {
    this.fsTimeEl.getAnimations().forEach((a) => a.cancel());
    this.finishStampEl.className = 'hud-finish-stamp';
    this.container.classList.remove('finishing');
  }

  /** 名前登録が閉じた直後は、決定ボタンの押下がメニューの決定として入らないよう、しばらく受け付けない */
  public armResultModal(ms = 800): void {
    this.modalArmTime = performance.now() + ms;
  }

  public hideResultModal(): void {
    this.stopCountUp?.();
    this.stopCountUp = null;
    this.resTotalTimeEl.classList.remove('stamp');
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
    carRotY: number
  ): void {
    this.drawMinimap(carPos, carRotY);
  }

  private drawMinimap(carPos: THREE.Vector3, carRotY: number): void {
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

    // 2. Main course drivable loop (実際の道幅 + 自車アイコンの半径ぶんで描き、壁際を走っても道からはみ出さないようにする)
    const roadWidthPx = this.minimapRoadWidth * scale + 10;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    tracePolylineNear(ctx, this.minimapPoints, true, toCanvas);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.lineWidth = roadWidthPx + 3.2;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(18, 28, 48, 0.88)';
    ctx.lineWidth = roadWidthPx;
    ctx.stroke();
    ctx.restore();

    // 3. Start / Finish Line (道幅いっぱいに横断するゴールドのライン)
    const [sx, sy] = toCanvas(this.minimapPoints[0].x, this.minimapPoints[0].y);
    const p1 = this.minimapPoints[1] ?? this.minimapPoints[0];
    const [s1x, s1y] = toCanvas(p1.x, p1.y);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(s1y - sy, s1x - sx));
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#e2b05e';
    ctx.fillRect(-2.5, -roadWidthPx / 2, 5, roadWidthPx);
    ctx.restore();

    // 4. Other players (online): coloured dots with a white ring
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

    // 5. Player Car (Glowing Cyan Arrow): いつも画面の同じ場所で、上(進行方向)を向く
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
