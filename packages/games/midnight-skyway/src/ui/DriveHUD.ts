import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import { setupResultMenu, applyResultMenuFocus } from '../../../../shared/arcadeResultMenu';
import * as THREE from 'three';
import { setText, setWidth, setDisplay } from '../../../../shared/hudDom';
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

const MAP_SIZE = 210;

/**
 * Drive HUD (Ultra-Clean Arcade Style):
 * - Streamlined to 2 essential non-intrusive zones:
 *   1. Top Left: Enlarged Transparent Minimap (Course, Blockades, Traffic)
 *   2. Bottom Right: High-tech Supercar Instrument Cluster (Lap Time, Best Time, Speed, Gear, Tachometer)
 * - Zero on-screen buttons during driving (Pause is ESC, Cam is C, Retry is R)
 * - Transparent minimap with crisp vector drop shadows
 * - Fully localized to authentic Japanese Arcade presentation
 */
/** [文字色, 文字グロー, 枠グロー] — 速度/回転の段階(通常/警戒/レッドゾーン)ごと */
const SPEED_COLORS: ReadonlyArray<readonly [string, string, string]> = [
  ['#00f0ff', 'rgba(0, 240, 255, 0.7)', 'rgba(0, 240, 255, 0.25)'],
  ['#ffcc00', 'rgba(255, 204, 0, 0.8)', 'rgba(255, 204, 0, 0.35)'],
  ['#ff0055', 'rgba(255, 0, 85, 0.85)', 'rgba(255, 0, 85, 0.45)'],
];

export class DriveHUD {
  private container: HTMLElement;
  private events: DriveHUDEvents;
  public isNameEntryOpen = false;

  // DOM elements
  private speedLevel = -1;
  private speedEl!: HTMLElement;
  private gearEl!: HTMLElement;
  private tachoFillEl!: HTMLElement;
  private speedoClusterEl!: HTMLElement;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private attributionEl!: HTMLElement;

  // Time Attack DOM
  private timerEl!: HTMLElement;
  private bestTimeEl!: HTMLElement;
  private sectorBannerEl!: HTMLElement;
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
  private raceTopEl!: HTMLElement;
  private remainingEl!: HTMLElement;
  private remainingNumEl!: HTMLElement;
  private gateBonusEl!: HTMLElement;
  private ghostGapEl!: HTMLElement;
  private altitudeEl!: HTMLElement;
  private altitudeNumEl!: HTMLElement;
  private driftEl!: HTMLElement;
  private driftScoreEl!: HTMLElement;
  private driftChainEl!: HTMLElement;
  private boostFillEl!: HTMLElement;
  private driftPopupEl!: HTMLElement;
  private gateTimeout: number | null = null;
  private popupTimeout: number | null = null;

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
  private bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };
  private sectorBannerTimeout: number | null = null;
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
      <!-- Sector Banner Anchor (above bottom-right telemetry cluster) -->
      <div class="hud-sector-banner-anchor">
        <div class="hud-sector-banner" id="hud-sector-banner" style="display: none;"></div>
      </div>

      <!-- Competitive race widgets (time limit, ghost gap, drift / boost); hidden on plain time-attack courses -->
      <div class="hud-race-top" id="hud-race-top" style="display: none;">
        <div class="hud-remaining" id="hud-remaining">
          <span class="hud-remaining-tag">TIME LEFT</span>
          <span class="hud-remaining-num" id="hud-remaining-num">--.-</span>
        </div>
        <div class="hud-gate-bonus" id="hud-gate-bonus" style="display: none;"></div>
        <div class="hud-ghost-gap" id="hud-ghost-gap"></div>
        <div class="hud-altitude" id="hud-altitude" style="display: none;"><span class="hud-altitude-tag">HEIGHT</span> <span id="hud-altitude-num">0</span><span class="hud-altitude-unit"> m</span></div>
      </div>
      <div class="hud-drift" id="hud-drift" style="display: none;">
        <div class="hud-drift-line"><span class="hud-drift-tag">DRIFT</span> <span class="hud-drift-score" id="hud-drift-score">0</span><span class="hud-drift-chain" id="hud-drift-chain"></span></div>
        <div class="hud-boost-bar"><div class="hud-boost-fill" id="hud-boost-fill"></div></div>
        <div class="hud-drift-popup" id="hud-drift-popup" style="display: none;"></div>
      </div>

      <!-- Top Left: Transparent Minimap -->
      <div class="hud-minimap-arcade">
        <canvas id="minimap-canvas" width="${MAP_SIZE}" height="${MAP_SIZE}"></canvas>
      </div>

      <!-- Top Right: Course / Open Data Credit Notation (Plain White Text) -->
      <div id="hud-attribution" class="hud-attribution-plain" style="display: none;"></div>

      <!-- Bottom Right: Unified Racing Instrument Cluster (Time, Speed, Gear, Tachometer) -->
      <div class="hud-speedo-arcade" id="hud-speedo-cluster">
        <!-- Top: Lap Time & Target Best Time -->
        <div class="cluster-time-row">
          <div class="time-block">
            <span class="time-tag">LAP</span>
            <span class="hud-time-main" id="hud-timer">00:00.000</span>
          </div>
          <div class="best-time-block">
            <span class="best-tag">BEST</span>
            <span class="hud-best-time-arcade" id="hud-best-time">--:--.---</span>
          </div>
        </div>

        <!-- Middle: Speed & Gear -->
        <div class="speedo-header-row">
          <div class="speedo-primary">
            <span class="speedo-num" id="hud-speed">0</span>
            <span class="speedo-unit">km/h</span>
          </div>
          <div class="speedo-gear-box">
            <span class="gear-tag" id="hud-gear-tag">GEAR</span>
            <span class="speedo-gear" id="hud-gear">P</span>
          </div>
        </div>

        <!-- Bottom: Tachometer Bar & Speed Scale -->
        <div class="speedo-tacho-wrap">
          <div class="speedo-tacho">
            <div class="tacho-fill" id="hud-tacho-fill"></div>
          </div>
        </div>
      </div>

      <!-- Center Loading Indicator -->
      <div class="panel hud-center" id="hud-loading" style="display: none"></div>

      <!-- Countdown Overlay -->
      <div id="hud-countdown" class="hud-countdown" style="display: none;">3</div>

      <!-- In-game Pause Modal -->
      <div id="hud-pause-modal" class="hud-result-modal" style="display: none;">
        <div class="hud-arcade-modal-box">
          <div class="arcade-modal-title">一時停止</div>
          <div class="arcade-modal-buttons">
            <button id="pause-btn-resume">再開</button>
            <button id="pause-btn-retry">リトライ</button>
            <button id="pause-btn-map">コース変更</button>
            <button id="pause-btn-car">マシン変更</button>
            <button id="pause-btn-title">タイトルへ戻る</button>
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
    this.gearEl = document.getElementById('hud-gear')!;
    this.tachoFillEl = document.getElementById('hud-tacho-fill')!;
    this.speedoClusterEl = document.getElementById('hud-speedo-cluster')!;
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.attributionEl = document.getElementById('hud-attribution')!;

    // Time Attack elements
    this.timerEl = document.getElementById('hud-timer')!;
    this.bestTimeEl = document.getElementById('hud-best-time')!;
    this.sectorBannerEl = document.getElementById('hud-sector-banner')!;
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
    this.raceTopEl = document.getElementById('hud-race-top')!;
    this.remainingEl = document.getElementById('hud-remaining')!;
    this.remainingNumEl = document.getElementById('hud-remaining-num')!;
    this.gateBonusEl = document.getElementById('hud-gate-bonus')!;
    this.ghostGapEl = document.getElementById('hud-ghost-gap')!;
    this.altitudeEl = document.getElementById('hud-altitude')!;
    this.altitudeNumEl = document.getElementById('hud-altitude-num')!;
    this.driftEl = document.getElementById('hud-drift')!;
    this.driftScoreEl = document.getElementById('hud-drift-score')!;
    this.driftChainEl = document.getElementById('hud-drift-chain')!;
    this.boostFillEl = document.getElementById('hud-boost-fill')!;
    this.driftPopupEl = document.getElementById('hud-drift-popup')!;

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
      this.events.onReturnToTitle();
    });

    // Result modal buttons
    document.getElementById('res-btn-exit')?.addEventListener('click', () => {
      window.location.href = '../../';
    });
    document.getElementById('res-btn-retry')?.addEventListener('click', () => {
      this.hideResultModal();
      this.events.onRetry();
    });
    document.getElementById('res-btn-title')?.addEventListener('click', () => {
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

  public updateCamBtnState(_mode: CameraMode): void {
    // Buttons removed from HUD to reduce visual clutter; key C still functions
  }

  public setLoading(loaded: number, total: number): void {
    const box = document.getElementById('hud-loading')!;
    const done = total > 0 && loaded >= total;
    box.style.display = done ? 'none' : 'block';
    box.textContent = `読み込み中 ${loaded}/${total}`;
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
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of map.roadSpline.getPoints(150)) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
      this.minimapPoints.push(new THREE.Vector2(p.x, p.z));
    }
    for (const r of this.extraRoutes) for (const p of r.points) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.y); maxZ = Math.max(maxZ, p.y);
    }
    const margin = 25;
    this.bounds = { minX: minX - margin, maxX: maxX + margin, minZ: minZ - margin, maxZ: maxZ + margin };
  }

  public updateTelemetry(speedKmH: number, rpm: number, gear: string): void {
    setText(this.speedEl, String(speedKmH));
    setText(this.gearEl, gear);

    // Tachometer gauge bar
    const revPct = rpm > 0 ? Math.min(100, (rpm / 7500) * 100) : Math.min(100, (speedKmH / 150) * 100);
    setWidth(this.tachoFillEl, `${revPct}%`);

    // Synchronize cluster color with speed / tachometer gauge
    const level = revPct > 85 || speedKmH >= 120 ? 2 : revPct >= 45 || speedKmH >= 70 ? 1 : 0;
    this.tachoFillEl.classList.toggle('redline', level === 2);
    if (level === this.speedLevel) return;
    this.speedLevel = level;
    const [color, glow, boxGlow] = SPEED_COLORS[level];
    this.speedEl.style.color = color;
    this.speedEl.style.textShadow = `0 0 20px ${glow}`;
    if (this.speedoClusterEl) {
      this.speedoClusterEl.style.borderRightColor = color;
      this.speedoClusterEl.style.borderTopColor = glow;
      this.speedoClusterEl.style.boxShadow = `0 10px 30px rgba(0, 0, 0, 0.85), 0 0 25px ${boxGlow}`;
    }
  }

  // ==========================================
  // Time Attack UI Methods
  // ==========================================

  public updateTimer(formatted: string): void {
    setText(this.timerEl, formatted);
  }

  public updateBestTime(formatted: string | null): void {
    this.bestTimeEl.textContent = formatted ?? '--:--.---';
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

  public showSectorBanner(sector: SectorInfo): void {
    if (this.sectorBannerTimeout) {
      clearTimeout(this.sectorBannerTimeout);
    }
    const deltaSec = (sector.deltaMs / 1000).toFixed(2);
    const sign = sector.deltaMs <= 0 ? '-' : '+';
    const text = `区間 ${sector.index}: ${(sector.timeMs / 1000).toFixed(2)}s (${sign}${Math.abs(Number(deltaSec))}s)`;

    this.sectorBannerEl.textContent = text;
    this.sectorBannerEl.className = 'hud-sector-banner ' + (sector.deltaMs <= 0 ? 'sector-fast' : 'sector-slow');
    this.sectorBannerEl.style.display = 'inline-block';

    this.sectorBannerTimeout = window.setTimeout(() => {
      this.sectorBannerEl.style.display = 'none';
    }, 3000);
  }

  /** Shows / hides the widgets of competitive courses (time limit, ghost gap, drift score and boost meter). */
  public setRaceMode(on: boolean, showAltitude = false): void {
    this.altitudeEl.style.display = on && showAltitude ? 'block' : 'none';
    this.raceTopEl.style.display = on ? 'flex' : 'none';
    this.driftEl.style.display = on ? 'flex' : 'none';
    this.ghostGapEl.textContent = '';
    this.gateBonusEl.style.display = 'none';
    this.driftPopupEl.style.display = 'none';
    this.updateDrift(0, 0, 0, 0, 1);
  }

  /** Height above the start line (courses that climb). */
  public updateAltitude(metres: number): void {
    setText(this.altitudeNumEl, String(Math.max(0, Math.round(metres))));
  }

  /** `ms` null hides the time-limit readout (no rules on this course). */
  public updateRemaining(ms: number | null): void {
    setDisplay(this.remainingEl, ms === null ? 'none' : 'flex');
    if (ms === null) return;
    setText(this.remainingNumEl, (ms / 1000).toFixed(1));
    this.remainingEl.classList.toggle('low', ms < 10000);
  }

  public showGateBonus(bonusMs: number): void {
    if (this.gateTimeout) clearTimeout(this.gateTimeout);
    this.gateBonusEl.textContent = `CHECKPOINT  +${(bonusMs / 1000).toFixed(1)}s`;
    this.gateBonusEl.style.display = 'block';
    this.gateBonusEl.style.animation = 'none';
    void this.gateBonusEl.offsetWidth;
    this.gateBonusEl.style.animation = '';
    this.gateTimeout = window.setTimeout(() => { this.gateBonusEl.style.display = 'none'; }, 2200);
  }

  /** gapMs: race time minus the rival's time at the same spot (negative = ahead). null = unknown. */
  public updateGhostGap(gapMs: number | null, label: string): void {
    if (gapMs === null) { setText(this.ghostGapEl, ''); return; }
    const ahead = gapMs <= 0;
    setText(this.ghostGapEl, `${label}  ${ahead ? '-' : '+'}${(Math.abs(gapMs) / 1000).toFixed(2)}s`);
    const cls = 'hud-ghost-gap ' + (ahead ? 'ahead' : 'behind');
    if (this.ghostGapEl.className !== cls) this.ghostGapEl.className = cls;
  }

  public updateDrift(score: number, chain: number, chainTime: number, boostLeft: number, boostMax: number): void {
    setText(this.driftScoreEl, String(score));
    const combo = 1 + Math.min(2, chainTime * 0.5);
    setText(this.driftChainEl, chain > 0 ? `  +${Math.round(chain)}  x${combo.toFixed(1)}` : '');
    setWidth(this.boostFillEl, `${Math.round(Math.min(1, boostLeft / Math.max(0.1, boostMax)) * 100)}%`);
    this.driftEl.classList.toggle('boosting', boostLeft > 0);
  }

  public showDriftBanked(points: number, boostSec: number): void {
    if (this.popupTimeout) clearTimeout(this.popupTimeout);
    this.driftPopupEl.textContent = `DRIFT +${points}  BOOST ${boostSec.toFixed(1)}s`;
    this.driftPopupEl.style.display = 'block';
    this.driftPopupEl.style.animation = 'none';
    void this.driftPopupEl.offsetWidth;
    this.driftPopupEl.style.animation = '';
    this.popupTimeout = window.setTimeout(() => { this.driftPopupEl.style.display = 'none'; }, 1600);
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
    const colors = modal === this.resultModalEl ? ['#ffea00', '#39ff88', '#00f0ff'] : ['#00f0ff'];
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
      else if (modal === this.resultModalEl) window.location.href = '../../';
    }
  }

  // Keyboard: move focus (WASD / Arrows) / confirm (Enter / Space) / cancel (Escape / Backspace)
  private handleMenuKey(e: KeyboardEvent): void {
    if (!this.isMenuOpen() || this.isNameEntryOpen) return;
    const modal = this.openModal();
    if (!modal) return;

    if (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'ArrowLeft' || e.code === 'KeyA') {
      e.preventDefault();
      this.setPadFocus(this.padFocus - 1);
    } else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ArrowRight' || e.code === 'KeyD') {
      e.preventDefault();
      this.setPadFocus(this.padFocus + 1);
    } else if (performance.now() < this.modalArmTime) {
      e.preventDefault();
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      const buttons = this.menuButtons(modal);
      buttons[this.padFocus]?.click();
    } else if (e.code === 'Escape' || e.code === 'Backspace') {
      if (modal === this.pauseModalEl) {
        e.preventDefault();
        this.hidePauseModal();
      } else if (modal === this.resultModalEl) {
        e.preventDefault();
        window.location.href = '../../';
      }
    }
  }

  public isPauseModalOpen(): boolean {
    return this.isPauseOpen;
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

    const b = this.bounds;
    const scale = Math.min((w - 20) / Math.max(1, b.maxX - b.minX), (h - 20) / Math.max(1, b.maxZ - b.minZ));
    const toCanvas = (x: number, z: number): [number, number] => [
      (x - (b.minX + b.maxX) / 2) * scale + w / 2,
      (z - (b.minZ + b.maxZ) / 2) * scale + h / 2,
    ];

    // 1. Blocked / non-drivable side routes (subtle drop shadow for transparent visibility)
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 5;
    for (const r of this.extraRoutes) {
      ctx.beginPath();
      r.points.forEach((p, i) => {
        const [cx, cy] = toCanvas(p.x, p.y);
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      });
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
    this.minimapPoints.forEach((p, i) => {
      const [cx, cy] = toCanvas(p.x, p.y);
      if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
    });
    ctx.closePath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.6;
    ctx.stroke();
    ctx.restore();

    // 3. Start / Finish Line (Gold box with outline)
    const [sx, sy] = toCanvas(this.minimapPoints[0].x, this.minimapPoints[0].y);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#ffcc00';
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
    ctx.fillStyle = '#ffea00';
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

    // 6. Player Car (Glowing Cyan Arrow)
    const [px, py] = toCanvas(carPos.x, carPos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-carRotY);
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-6, -7);
    ctx.lineTo(6, -7);
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
