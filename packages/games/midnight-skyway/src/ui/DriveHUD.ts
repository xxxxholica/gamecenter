import { countUpText } from '../../../../shared/arcadeScoreCountUp';
import { setupResultMenu, applyResultMenuFocus } from '../../../../shared/arcadeResultMenu';
import { returnToHub } from '../../../../shared/homeReturn';
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

const MAP_SIZE = 270;

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
  private gearEl: HTMLElement | null = null;
  private tachoFillEl: HTMLElement | null = null;
  private needleGrpEl: SVGElement | null = null;
  private speedArcEl: SVGPathElement | null = null;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;
  private attributionEl!: HTMLElement;

  // Time Attack DOM
  private timerEl!: HTMLElement;
  private bestTimeEl: HTMLElement | null = null;
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
  private raceTopEl: HTMLElement | null = null;
  private remainingEl: HTMLElement | null = null;
  private remainingNumEl: HTMLElement | null = null;
  private gateBonusEl: HTMLElement | null = null;
  private ghostGapEl: HTMLElement | null = null;
  private altitudeEl!: HTMLElement;
  private altitudeNumEl!: HTMLElement;
  private driftEl!: HTMLElement;
  private driftTagEl: HTMLElement | null = null;
  private driftChainEl!: HTMLElement;
  private boostFillEl!: HTMLElement;
  private gateTimeout: number | null = null;

  // Pause Modal DOM
  private pauseModalEl!: HTMLElement;
  private isPauseOpen: boolean = false;

  // Combat HUD DOM
  private hpBlocksEl: HTMLElement | null = null;

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

      <!-- Drift / Boost HUD widgets -->
      <div class="hud-drift" id="hud-drift" style="display: none;">
        <div class="hud-drift-line"><span class="hud-drift-tag" id="hud-drift-tag">DRIFT</span><span class="hud-drift-chain" id="hud-drift-chain"></span></div>
        <div class="hud-boost-bar"><div class="hud-boost-fill" id="hud-boost-fill"></div></div>
      </div>

      <!-- Top Left: Transparent Minimap -->
      <div class="hud-minimap-arcade">
        <canvas id="minimap-canvas" width="${MAP_SIZE}" height="${MAP_SIZE}"></canvas>
      </div>

      <!-- Under the minimap: height above the start line (climbing courses) -->
        <div class="hud-altitude" id="hud-altitude" style="display: none; top: ${18 + MAP_SIZE + 8}px;"><span class="hud-altitude-tag">HEIGHT</span> <span id="hud-altitude-num">0</span><span class="hud-altitude-unit"> m</span></div>

      <!-- Top Center: Pure Digital Lap Timer (where TIME LEFT originally was, no LAP or BEST label) -->
      <div class="hud-timer-arcade" id="hud-timer-arcade">
        <span class="hud-time-main" id="hud-timer">00:00.000</span>
      </div>

      <!-- Top Right: Course / Open Data Credit Notation (Plain White Text) -->
      <div id="hud-attribution" class="hud-attribution-plain" style="display: none;"></div>

      <!-- Bottom Right: Floating Speedometer (1/4 Circle dial, no gear, frameless) -->
      <div class="hud-speedo-arcade" id="hud-speedo-cluster">
        <div class="hybrid-meter-container">
          <svg class="meter-dial-svg" viewBox="0 0 210 210" aria-hidden="true">
            <defs>
              <filter id="needle-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>

            <!-- Background Dial Ring & Ticks Track (1/4 Circle 90° Arc: R=165, from (30, 195) to (195, 30)) -->
            <path d="M 30 195 A 165 165 0 0 1 195 30" fill="none" stroke="rgba(255, 255, 255, 0.16)" stroke-width="14" stroke-linecap="round" />
            <!-- High speed warning zone arc (140 to 200 km/h: from (120.1, 48) to (195, 30)) -->
            <path d="M 120.1 48 A 165 165 0 0 1 195 30" fill="none" stroke="rgba(255, 0, 85, 0.45)" stroke-width="14" stroke-linecap="round" />
            <!-- Active glowing speed arc fill (259.2px stroke length) -->
            <path id="hud-speed-arc" d="M 30 195 A 165 165 0 0 1 195 30" fill="none" stroke="#00f0ff" stroke-width="14" stroke-linecap="round" stroke-dasharray="259.2" stroke-dashoffset="259.2" style="transition: stroke-dashoffset 0.05s linear;" />

            <!-- Major speed ticks & numbers (0, 40, 80, 120, 160, 200) cutting through arc -->
            <line x1="19" y1="195" x2="41" y2="195" stroke="#00f0ff" stroke-width="2.8" />
            <text x="57" y="191" fill="#8ba0c0" font-size="11" font-weight="900" font-family="ui-monospace, monospace" text-anchor="middle">0</text>

            <line x1="27.6" y1="140.6" x2="48.5" y2="147.4" stroke="#00f0ff" stroke-width="2.8" />
            <text x="65.6" y="153.0" fill="#8ba0c0" font-size="11" font-weight="900" font-family="ui-monospace, monospace" text-anchor="middle">40</text>

            <line x1="52.6" y1="91.5" x2="70.4" y2="104.5" stroke="#00f0ff" stroke-width="2.8" />
            <text x="85.0" y="115.1" fill="#8ba0c0" font-size="11" font-weight="900" font-family="ui-monospace, monospace" text-anchor="middle">80</text>

            <line x1="91.5" y1="52.6" x2="104.5" y2="70.4" stroke="#00f0ff" stroke-width="2.8" />
            <text x="115.1" y="85.0" fill="#8ba0c0" font-size="11" font-weight="900" font-family="ui-monospace, monospace" text-anchor="middle">120</text>

            <line x1="140.6" y1="27.6" x2="147.4" y2="48.5" stroke="#ff0055" stroke-width="2.8" />
            <text x="153.0" y="65.6" fill="#ff0055" font-size="11" font-weight="900" font-family="ui-monospace, monospace" text-anchor="middle">160</text>

            <line x1="195" y1="19" x2="195" y2="41" stroke="#ff0055" stroke-width="2.8" />
            <text x="195" y="57" fill="#ff0055" font-size="11" font-weight="900" font-family="ui-monospace, monospace" text-anchor="middle">200</text>

            <!-- Minor ticks (20, 60, 100, 140, 180) -->
            <line x1="25.1" y1="168.1" x2="38.9" y2="170.3" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" />
            <line x1="41.7" y1="116.9" x2="54.2" y2="123.3" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" />
            <line x1="73.4" y1="73.4" x2="83.3" y2="83.3" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" />
            <line x1="116.9" y1="41.7" x2="123.3" y2="54.2" stroke="#ff0055" stroke-width="1.8" />
            <line x1="168.1" y1="25.1" x2="170.3" y2="38.9" stroke="#ff0055" stroke-width="1.8" />

            <!-- Analog Speedometer Needle (Rotates 0° at 0 km/h to +90° at 200 km/h) -->
            <g id="hud-meter-needle-grp" transform="rotate(0 195 195)" style="transition: transform 0.05s linear;" filter="url(#needle-glow)">
              <polygon points="195,200 195,190 22,193.5 22,196.5" fill="#ff2a4b" />
              <line x1="195" y1="195" x2="20" y2="195" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" />
              <circle cx="195" cy="195" r="8" fill="#080e18" stroke="#00f0ff" stroke-width="2" />
              <circle cx="195" cy="195" r="3" fill="#00f0ff" />
            </g>
          </svg>

          <!-- Compact Digital Readout (No gear display) -->
          <div class="speedo-digital-quarter">
            <span class="speedo-num" id="hud-speed">0</span>
            <span class="speedo-unit">km/h</span>
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
    this.gearEl = document.getElementById('hud-gear');
    this.tachoFillEl = document.getElementById('hud-tacho-fill');
    this.canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    this.attributionEl = document.getElementById('hud-attribution')!;

    // Time Attack elements
    this.timerEl = document.getElementById('hud-timer')!;
    this.bestTimeEl = document.getElementById('hud-best-time');
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
    this.raceTopEl = document.getElementById('hud-race-top');
    this.remainingEl = document.getElementById('hud-remaining');
    this.remainingNumEl = document.getElementById('hud-remaining-num');
    this.gateBonusEl = document.getElementById('hud-gate-bonus');
    this.ghostGapEl = document.getElementById('hud-ghost-gap');
    this.altitudeEl = document.getElementById('hud-altitude')!;
    this.altitudeNumEl = document.getElementById('hud-altitude-num')!;
    this.driftEl = document.getElementById('hud-drift')!;
    this.driftTagEl = document.getElementById('hud-drift-tag');
    this.driftChainEl = document.getElementById('hud-drift-chain')!;
    this.boostFillEl = document.getElementById('hud-boost-fill')!;

    // Pause elements
    this.pauseModalEl = document.getElementById('hud-pause-modal')!;

    // Combat elements
    this.hpBlocksEl = document.getElementById('hud-hp-blocks');
    this.needleGrpEl = document.getElementById('hud-meter-needle-grp') as unknown as SVGElement | null;
    this.speedArcEl = document.getElementById('hud-speed-arc') as unknown as SVGPathElement | null;

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
      returnToHub();
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
    if (this.gearEl) setText(this.gearEl, gear);

    // 1/4 circle needle rotation (0° at 0 km/h to +90° at 200 km/h around (195, 195))
    const clampedSpeed = Math.max(0, Math.min(220, speedKmH));
    const needleAngle = (clampedSpeed / 200) * 90;
    if (this.needleGrpEl) {
      this.needleGrpEl.setAttribute('transform', `rotate(${needleAngle.toFixed(1)} 195 195)`);
    }

    // 1/4 circle progressive arc fill (259.2px total stroke length for R=165 90° arc)
    if (this.speedArcEl) {
      const arcFraction = Math.max(0, Math.min(1, clampedSpeed / 200));
      const dashOffset = 259.2 * (1 - arcFraction);
      this.speedArcEl.style.strokeDashoffset = `${dashOffset.toFixed(1)}`;
    }

    // Tachometer gauge bar (if present)
    const revPct = rpm > 0 ? Math.min(100, (rpm / 7500) * 100) : Math.min(100, (speedKmH / 150) * 100);
    if (this.tachoFillEl) {
      setWidth(this.tachoFillEl, `${revPct}%`);
      const level = revPct > 85 || speedKmH >= 120 ? 2 : revPct >= 45 || speedKmH >= 70 ? 1 : 0;
      this.tachoFillEl.classList.toggle('redline', level === 2);
    }

    // Synchronize meter needle & arc color with speed level
    const level = revPct > 85 || speedKmH >= 120 ? 2 : revPct >= 45 || speedKmH >= 70 ? 1 : 0;
    if (this.speedArcEl) {
      this.speedArcEl.style.stroke = level === 2 ? '#ff0055' : level === 1 ? '#ffcc00' : '#00f0ff';
    }
    if (level === this.speedLevel) return;
    this.speedLevel = level;
    const [color, glow] = SPEED_COLORS[level];
    this.speedEl.style.color = color;
    this.speedEl.style.textShadow = `0 0 20px ${glow}`;
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
    if (this.raceTopEl) this.raceTopEl.style.display = on ? 'flex' : 'none';
    this.driftEl.style.display = on ? 'flex' : 'none';
    if (this.ghostGapEl) this.ghostGapEl.textContent = '';
    if (this.gateBonusEl) this.gateBonusEl.style.display = 'none';
    this.updateDrift(0, 0, 0, 0, 1);
  }

  /** Height above the start line (courses that climb). */
  public updateAltitude(metres: number): void {
    setText(this.altitudeNumEl, String(Math.max(0, Math.round(metres))));
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
      setWidth(this.boostFillEl, '100%');
      this.driftEl.classList.add('boosting');
    } else if (chain > 0) {
      // 貯めている時: 数字のみ、ゲージも溜まっていく
      if (this.driftTagEl) {
        this.driftTagEl.style.display = 'none';
        this.driftTagEl.classList.remove('ready');
      }
      setText(this.driftChainEl, `+${Math.round(chain)}`);
      const chargePct = Math.round(Math.min(1, chainTime / 3.6) * 100);
      setWidth(this.boostFillEl, `${chargePct}%`);
      this.driftEl.classList.remove('boosting');
    } else if (boostLeft > 0) {
      // ブースト中: BOOST
      if (this.driftTagEl) {
        this.driftTagEl.textContent = 'BOOST';
        this.driftTagEl.style.display = 'inline-block';
        this.driftTagEl.classList.remove('ready');
      }
      setText(this.driftChainEl, '');
      setWidth(this.boostFillEl, `${Math.round(Math.min(1, boostLeft / Math.max(0.1, boostMax)) * 100)}%`);
      this.driftEl.classList.add('boosting');
    } else {
      // 何もしていない時: DRIFTのみ、ゲージ0%
      if (this.driftTagEl) {
        this.driftTagEl.textContent = 'DRIFT';
        this.driftTagEl.style.display = 'inline-block';
        this.driftTagEl.classList.remove('ready');
      }
      setText(this.driftChainEl, '');
      setWidth(this.boostFillEl, '0%');
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
      else if (modal === this.resultModalEl) returnToHub();
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
      } else if (modal === this.resultModalEl && e.code === 'Escape') {  // Backspace は長押しでホームへ(共通)
        e.preventDefault();
        returnToHub();
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

  public updateCombatStatus(hp: number, maxHp: number, _lockOn?: any): void {
    if (!this.hpBlocksEl) return;

    // Update HP Shield blocks
    let html = '';
    for (let i = 0; i < maxHp; i++) {
      const isFull = i < hp;
      html += `<span class="hp-block ${isFull ? 'full' : 'empty'}"></span>`;
    }
    this.hpBlocksEl.innerHTML = html;
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
