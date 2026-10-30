// ===========================================================
//  FALL DOWN — 無限降下型サバイバル・掘削アクションパズル
// ===========================================================
import '../../../shared/arcadeReplayBoot';   // 最初に読み込む: 操作の記録・再生の差し替え(ゲームのコードより先に)
import * as THREE from 'three';
import { Game, GOAL_DEPTH, MAX_AIR, START_LIVES, type ClearBonus } from './game/game.ts';
import { View, BLOCK_COLORS, STRATA, strataProgress } from './render/view.ts';
import { difficulty, W, DIFFICULTY_STEPS } from './game/world.ts';
import { BENCH_SEED, createBenchBot, fallDownBenchTargets } from './bench.ts';
import { Input, type FrameInput } from './input.ts';
import { Sound } from './audio.ts';
import { installHomeReturn, returnToHub } from '../../../shared/homeReturn';
import { ArcadePause } from '../../../shared/arcadePause';
import { mountArcadeGuide } from '../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../shared/arcadeTitleScreen';
import { startArcadeTutorial, type ArcadeTutorialHandle } from '../../../shared/arcadeTutorial';
import { setupResultMenu, applyResultMenuFocus, type ResultMenuItem } from '../../../shared/arcadeResultMenu';
import { MenuNav } from '../../../shared/arcadeMenuNav';
import { watchResultAutoReturn } from '../../../shared/arcadeAutoAction';
import { countUpText } from '../../../shared/arcadeScoreCountUp';
import { loadLeaderboardAndCheck, saveLeaderboardScore, type LeaderboardEntry } from '../../../shared/arcadeLeaderboard';
import { renderRankingList } from '../../../shared/arcadeRankingList';
import { mountNameEntryModal, NAME_ENTRY_AFTER_RESULT_MS } from '../../../shared/arcadeNameEntryModal';
import { benchDone, benchMark, benchParam, benchReady, declareBenchTargets } from '../../../shared/arcadeBenchTargets';
import { waitFramesSettled } from '../../../shared/shaderCompile';
import { reportDeathPoint, reportDeepAnalytics, reportPhase, reportRoundStart } from '../../../shared/arcadeAnalytics';

installHomeReturn();
watchResultAutoReturn(['result-btn-title']);

/** 検証用: 無敵・全ブロック破壊・掘りの高速化・記録を残さない。URLに ?debug を付けたときだけ有効(開発サーバーでも同じ)。?d=250 でその深さから始める */
const PREVIEW = new URLSearchParams(location.search).has('preview');
const DEBUG = new URLSearchParams(location.search).has('debug') || PREVIEW;
/** ベンチマーク(?bench=1&scene=…)。無敵・酸素なしで自動で掘り進む。掘る速さ・壊れ方は本番のまま。記録は残さない */
const BENCH_SCENE = benchParam('scene');
const BENCH = BENCH_SCENE !== null;
const benchBot = createBenchBot(W);

// 検証モード中は、効いていることを忘れないよう、画面の隅に小さく表示する(撮影用の ?preview では出さない)
if (DEBUG && !PREVIEW) {
  const badge = document.createElement('div');
  badge.className = 'debug-badge';
  badge.textContent = 'DEBUG';
  document.body.append(badge);
}

const SLUG = 'falldown'; // 共通ランキングでの名前 (packages/shared/arcadeLeaderboardCore.ts に定義)
const ACCENT = '#ff8a3d';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const game = new Game();
const view = new View($('app'));
const input = new Input();
const sound = new Sound();

const ui = {
  hud: $('hud'),
  depth: $('depth'),
  depthTag: $('depthTag'),
  areaNow: $('areaNow'),
  areaRemain: $('areaRemain'),
  lives: $('lives'),
  airFill: $('airFill'),
  score: $('score'),
  popups: $('popups'),
  banner: $('banner'),
  vignette: $('vignette'),
  flash: $('flash'),
  resultModal: $('result-modal'),
  resultBadge: $('result-badge'),
  resultScore: $('result-score'),
  resultStats: $('result-stats'),
  resultRecord: $('result-record'),
  resultRanking: $('result-ranking'),
};

// ---------------- ハイスコア（localStorage は失敗しても動くように） ----------------
const STORE_KEY = 'falldown.best';
interface Best {
  score: number;
  depth: number;
  /** ベストクリアタイム（秒）。未クリアは 0 */
  time: number;
}
function loadBest(): Best {
  try {
    const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (v && typeof v.score === 'number') return { score: v.score, depth: v.depth || 0, time: v.time || 0 };
  } catch {
    /* ignore */
  }
  return { score: 0, depth: 0, time: 0 };
}
function saveBest(b: Best) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(b));
  } catch {
    /* ignore */
  }
}
function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
let best = loadBest();

/** ゲーム終了時（ゲームオーバー / クリア）に記録を更新。自己ベスト更新なら true */
function recordResult(cleared: boolean) {
  if (DEBUG || BENCH) return false;
  const isNew = game.score > best.score;
  best = {
    score: Math.max(best.score, game.score),
    depth: Math.max(best.depth, game.maxDepth),
    time: cleared ? (best.time > 0 ? Math.min(best.time, game.time) : game.time) : best.time,
  };
  saveBest(best);
  return isNew;
}

// ---------------- 画面左下の共通ボタンガイド（場面ごとに差し替える） ----------------
const guideTitle = () => mountArcadeGuide({ buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }], showHomeHint: true, backLabel: 'ホームへ戻る' });
const guidePlay = () => mountArcadeGuide({
  moveLabel: '移動',
  buttons: [{ indices: [0, 1, 2, 3, 5, 7], label: '掘る', keyLabel: 'Space / J' }],
  showHomeHint: true,
  backLabel: 'ポーズ',
});
const guideMenu = () => mountArcadeGuide({
  moveLabel: '選択',
  buttons: [
    { indices: [0], label: '決定' },
    { indices: [1], label: 'タイトルへ' },
  ],
  showHomeHint: true,
  backLabel: 'タイトルへ',
});

// ---------------- 状態 ----------------
let paused = false;
let inTutorial = false;
let tutorialLastStep = -1;
let tutorialMoveDist = 0;
let tutorialActionDone = false;
let tutorialActionDelay = 0;
let tutorialLastX = 4;
let tutorialStepPrepared = -1;
let tutorialHandle: ArcadeTutorialHandle | null = null;
let warnTimer = 0;
let rumbleTimer = 0;
let lastLives = START_LIVES;
let airHalfWarned = false;
let lastClankPopup = 0;

// ---------------- タイトル (全ゲーム共通の画面) ----------------
const titleScreen = new ArcadeTitleScreen({
  slug: SLUG,
  accentColor: ACCENT,
  tagline: '地下500mの黄金郷へ掘り進め！',
  onStart: () => startGame(),
});

function showTitle() {
  tutorialHandle?.cancel();
  tutorialHandle = null;
  inTutorial = false;
  closeResult();
  fxQueue.length = 0;
  hitstop = 0;
  slowmo = 0;
  sound.stopBgm();
  game.toTitle();
  view.clearLabels();
  view.snapCamera(game);
  ui.hud.classList.add('hidden');
  ui.depthTag.classList.add('hidden');
  ui.vignette.classList.remove('on');
  ui.banner.classList.remove('show');
  titleScreen.show();
  guideTitle();
}

function startGame() {
  sound.unlock();
  tutorialHandle?.cancel();
  tutorialHandle = null;
  inTutorial = false;
  tutorialLastStep = -1;
  tutorialMoveDist = 0;
  tutorialActionDone = false;
  tutorialActionDelay = 0;
  tutorialStepPrepared = -1;
  closeResult();
  fxQueue.length = 0;
  hitstop = 0;
  slowmo = 0;
  ui.popups.innerHTML = '';
  titleScreen.hide();
  game.start(BENCH ? BENCH_SEED : undefined);
  if (!PREVIEW) reportRoundStart();
  if (BENCH) {
    game.debug = true;
    const d = Number(benchParam('depth')) || 0;
    if (d > 0) {
      game.player.reset(4, 1 - d);
      game.maxDepth = d;
      game.layer = difficulty(d).layer;
    }
  } else if (PREVIEW) {
    game.debug = true;
    const d = Number(new URLSearchParams(location.search).get('d')) || 30;
    if (d > 0) {
      game.player.reset(4, 1 - d);
      game.maxDepth = d;
      game.layer = difficulty(d).layer;
    }
  } else if (DEBUG) {
    game.debug = true;
    game.world.breakAll = true;
    game.player.fastDig = true;
    const d = Number(new URLSearchParams(location.search).get('d')) || 0;
    if (d > 0) {
      game.player.reset(4, 1 - d);
      game.maxDepth = d;
    }
  }
  view.clearLabels();
  view.snapCamera(game);
  if (PREVIEW) {
    ui.hud.classList.add('hidden');
    ui.depthTag.style.display = 'none';
    ui.banner.style.display = 'none';
    ui.popups.style.display = 'none';
    const guide = document.getElementById('agc-guide');
    if (guide) guide.style.display = 'none';
  } else {
    guidePlay();
    beginTutorial();
  }
  sound.tempo = 112;
  sound.start();
  sound.startBgm();
  lastLives = -1;
}

function prepareTutorialStep(stepIdx: number) {
  const p = game.player;
  const w = game.world;
  const col = p.col;
  const row = p.row;
  if (stepIdx === 0 || stepIdx === 2) {
    // 最初から上3段(y = 0, -1, -2)を1つの色で統一し、その下(y = -3)に破壊不能の黒曜石を配置する
    for (let x = 0; x < W; x++) {
      w.place('color', 0, x, 0, 1);
      w.place('color', 0, x, -1, 1);
      w.place('color', 0, x, -2, 1);
      w.place('bedrock', 0, x, -3, 1);
      w.place('color', (x + 1) % 4, x, -4, 1);
      w.place('hard', 0, x, -5, 3);
    }
    w.recompute();
  } else if (stepIdx === 3) {
    // 上3段を掘り抜いて着地した足元(row - 1)が黒曜石になっていることを保証する
    for (let x = 0; x < W; x++) {
      w.place('bedrock', 0, x, row - 1, 1);
      w.place('color', (x + 1) % 4, x, row - 2, 1);
      w.place('hard', 0, x, row - 3, 3);
    }
    w.recompute();
  } else if (stepIdx === 4) {
    // 破壊不能のデモが終了したら、足元の黒曜石の段を爆弾ブロックに変えて周囲ごと爆破させる
    for (let x = 0; x < W; x++) {
      w.place('bomb', 0, x, row - 1, 1);
      w.place('color', (x + 1) % 4, x, row - 2, 1);
      w.place('hard', 0, x, row - 3, 3);
    }
    w.recompute();
  } else if (stepIdx === 5) {
    // すぐ隣に酸素カプセル(air)を置いて満タン回復を体験させる（HUDはチュートリアル完了まで非表示のまま）
    game.air = 45;
    for (let x = 0; x < W; x++) {
      if (!w.isSolid(x, row - 1)) w.place('hard', 0, x, row - 1, 3);
      if (x !== col) w.place('air', 0, x, row, 1);
    }
  }
}

function beginTutorial() {
  ui.hud.classList.add('hidden');
  ui.depthTag.classList.add('hidden');
  ui.banner.classList.remove('show');
  inTutorial = true;
  tutorialLastStep = -1;
  tutorialMoveDist = 0;
  tutorialActionDone = false;
  tutorialActionDelay = 0;
  tutorialLastX = game.player.x;
  tutorialHandle?.cancel();
  prepareTutorialStep(0);
  tutorialStepPrepared = 0;

  const handle = startArcadeTutorial({
    accentColor: ACCENT,
    steps: [
      { indices: [15], keyLabel: 'D', label: '右に動く' },
      { indices: [14], keyLabel: 'A', label: '左に動く' },
      { indices: [0], keyLabel: 'Space', label: '同色ブロックを掘る' },
      { indices: [0], keyLabel: 'Space', label: '紫の岩を叩く' },
      { indices: [0], keyLabel: 'Space', label: '爆弾ブロックを爆破する' },
      { indices: [14, 15], keyLabel: 'A / D', label: '酸素カプセルを拾う' },
    ],
    onComplete: () => {
      inTutorial = false;
      tutorialHandle = null;
      tutorialLastStep = -1;
      tutorialMoveDist = 0;
      tutorialActionDone = false;
      tutorialActionDelay = 0;
      tutorialStepPrepared = -1;
      if (!BENCH && !PREVIEW) {
        // チュートリアル中に掘った地形や酸素量を、完了・スキップ問わず初期状態にリセットして本番開始
        fxQueue.length = 0;
        hitstop = 0;
        slowmo = 0;
        ui.popups.innerHTML = '';
        game.start();
        if (DEBUG) {
          game.debug = true;
          game.world.breakAll = true;
          game.player.fastDig = true;
          const d = Number(new URLSearchParams(location.search).get('d')) || 0;
          if (d > 0) {
            game.player.reset(4, 1 - d);
            game.maxDepth = d;
          }
        }
        view.clearLabels();
        view.snapCamera(game);
      }
      ui.hud.classList.remove('hidden');
      showBanner('スタート', 'normal', 'start');
      lastLives = -1;
    },
  });
  if (inTutorial) {
    tutorialHandle = handle;
  }
}

/** バナーの見出しの前に付けるアイコン(currentColorで塗る) */
const BANNER_ICONS = {
  start: '<path d="M6 3l15 9-15 9z"/>',
  layer: '<path d="M4 4l8 8 8-8M4 12l8 8 8-8" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>',
  air: '<rect x="9" y="1" width="6" height="4" rx="1.5"/><rect x="5" y="4" width="14" height="19" rx="6.5"/>',
  crush: '<rect x="3" y="3" width="18" height="6" rx="2"/><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M12 11v10M12 15l-3 2" fill="none" stroke="#0b0b12" stroke-width="2"/>',
} as const;

function showBanner(big: string, tone: 'normal' | 'warn' | 'bad' = 'normal', icon?: keyof typeof BANNER_ICONS, sub?: string) {
  ui.banner.classList.toggle('warn', tone === 'warn');
  ui.banner.classList.toggle('bad', tone === 'bad');
  const svg = icon ? `<svg class="banner-icon" viewBox="0 0 24 24" fill="currentColor">${BANNER_ICONS[icon]}</svg>` : '';
  ui.banner.innerHTML = `<div class="big">${svg}${big}</div>` + (sub ? `<div class="sub">${sub}</div>` : '');
  // 下の行があるときは、読めるように長めに出す
  ui.banner.classList.toggle('long', !!sub);
  ui.banner.classList.remove('show');
  void ui.banner.offsetWidth;
  ui.banner.classList.add('show');
}

function flash(kind: 'white' | 'red' | 'fire' | 'fireBig' = 'white') {
  ui.flash.classList.toggle('red', kind === 'red');
  ui.flash.classList.toggle('fire', kind === 'fire' || kind === 'fireBig');
  ui.flash.classList.toggle('big', kind === 'fireBig');
  ui.flash.classList.remove('go');
  void ui.flash.offsetWidth;
  ui.flash.classList.add('go');
}

function popup(x: number, y: number, text: string, cls = '') {
  const s = view.toScreen(x, y);
  const el = document.createElement('div');
  el.className = 'popup ' + cls;
  el.textContent = text;
  el.style.left = `${s.x}px`;
  el.style.top = `${s.y}px`;
  ui.popups.appendChild(el);
  setTimeout(() => el.remove(), 950);
}

const tmpColor = new THREE.Color();
function blockColor(kind: string, color: number) {
  if (kind === 'hard') return tmpColor.setHex(0x8b8178);
  if (kind === 'air') return tmpColor.setHex(0x49f0ff);
  if (kind === 'life') return tmpColor.setHex(0xff3f6c);
  if (kind === 'bedrock') return tmpColor.setHex(0x3a2a5a);
  if (kind === 'bomb') return tmpColor.setHex(0xff7a1a);
  return tmpColor.setHex(BLOCK_COLORS[color] ?? 0xffffff);
}

// ---------------- 爆発の演出 ----------------
/** 時間差で起こす演出（連鎖する爆発・最期の花火） */
const fxQueue: { t: number; fn: () => void }[] = [];
/** 爆発の瞬間にゲームの進行をほぼ止めて、衝撃を強く見せる残り秒数 */
/** ハブのホバー動画用(?preview): タイトルを飛ばして、左右に振りながら掘り進む自動プレイ。無敵で、記録は残さない */
function previewInput(now: number): FrameInput {
  return { ...benchBot(game, now), start: false, cancel: false, anyPressed: false, padDx: 0, padDy: 0 };
}

let hitstop = 0;
/** ゴール到達の演出: スローモーションの残り時間(実時間・秒) */
let slowmo = 0;
const SLOWMO_SEC = 3;
const SLOWMO_SPEED = 0.22;
/** 現在の時間の流れる速さ。終わりぎわの 0.6 秒で、なめらかに元の速さへ戻す */
function timeScale() {
  if (slowmo <= 0) return 1;
  const ease = Math.min(slowmo / 0.6, 1);
  return SLOWMO_SPEED + (1 - SLOWMO_SPEED) * (1 - ease);
}

/** 1回の爆発の演出：火の玉と衝撃波、破片、火の粉、煙、画面の揺れ。scale が大きいほど派手 */
function blastFx(x: number, y: number, scale: number, back = false) {
  const wx = view.wx(x);
  const k = Math.sqrt(scale);
  view.explosion(wx, y, scale, back);
  view.particles.burst(wx, y, new THREE.Color(0xff8a2a), Math.round(26 * scale), 2.2 * k, back);
  view.particles.burst(wx, y, new THREE.Color(0xffd34d), Math.round(14 * scale), 3 * k, back);
  view.particles.sparkle(wx, y, new THREE.Color(0xfff0b0), Math.round(24 * scale), 3 * k, back);
  view.particles.embers(wx, y, new THREE.Color(0xff6a1a), Math.round(30 * scale), k, back);
  view.particles.smoke(wx, y, Math.round(8 * scale), 1 + scale * 0.4, back);
  view.shake(Math.min(0.5 + scale * 0.45, 2.2));
}

// ---------------- イベント処理（音・演出） ----------------
function handleEvents() {
  const p = game.player;
  for (const e of game.events) {
    switch (e.type) {
      case 'hit': {
        sound.dig(e.kind === 'hard');
        const b = game.world.get(e.x, e.y);
        if (b) view.pulse(b.id);
        view.particles.burst(view.wx(e.x), e.y, blockColor(e.kind, e.color), 4, 0.6);
        view.shake(0.06);
        break;
      }
      case 'break': {
        const near = Math.abs(e.y - p.y) < 14;
        if (near) sound.brk(e.cells.length);
        const col = blockColor(e.kind, e.color).clone();
        for (const c of e.cells) view.particles.burst(view.wx(c.x), c.y, col, e.cells.length > 8 ? 5 : 9);
        if (e.kind === 'color') for (const c of e.cells) view.particles.sparkle(view.wx(c.x), c.y, col, 4, 1.2);
        view.shake(Math.min(0.08 + e.cells.length * 0.02, 0.35));
        break;
      }
      case 'explode': {
        // 爆弾：火の玉・衝撃波・火の粉・煙と、大きな画面の揺れ。連鎖すると爆発が時間差で続く
        // プレイヤーが力尽きたとき(big)は、さらに特大で、そのあと小さな爆発が続けて起きる
        const big = e.big;
        benchMark(big ? 'explode-big' : 'explode');
        const near = big || Math.abs(e.centers[0].y - p.y) < 14;
        if (near) {
          if (big) sound.bigExplosion();
          else sound.explosion();
        }
        e.centers.forEach((c, i) => {
          if (i === 0) blastFx(c.x, c.y, big ? 2.6 : 1);
          else {
            fxQueue.push({
              t: i * 0.09,
              fn: () => {
                blastFx(c.x, c.y, 1);
                if (near) sound.explosion();
              },
            });
          }
        });
        for (const d of e.destroyed) {
          if (d.kind === 'bomb') continue;
          const col = blockColor(d.kind, d.color).clone();
          view.particles.burst(view.wx(d.x), d.y, col, big ? 14 : 12, big ? 2 : 1.5);
          if (d.kind === 'color') view.particles.sparkle(view.wx(d.x), d.y, col, 5, 1.4);
        }
        for (const c of e.chipped) {
          const b = game.world.get(c.x, c.y);
          if (b) view.pulse(b.id);
          view.particles.burst(view.wx(c.x), c.y, blockColor(c.kind, c.color), 5, 1);
        }
        view.shake(Math.min(1.1 + e.centers.length * 0.2, 2) + (big ? 0.6 : 0));
        flash(big ? 'fireBig' : 'fire');
        hitstop = big ? 0.4 : 0.12;
        if (big) {
          const c0 = e.centers[0];
          for (let i = 0; i < 7; i++) {
            fxQueue.push({
              t: 0.2 + i * 0.13,
              fn: () => {
                blastFx(c0.x + (Math.random() - 0.5) * 5, c0.y + (Math.random() - 0.5) * 4, 1.1 + Math.random() * 0.5);
                sound.explosion();
              },
            });
          }
        }
        break;
      }
      case 'pop': {
        sound.pop(e.chain);
        const col = blockColor('color', e.color).clone();
        for (const c of e.cells) {
          view.particles.burst(view.wx(c.x), c.y, col, 8, 1.2);
          view.particles.sparkle(view.wx(c.x), c.y, col, 6, 1.4);
        }
        view.shake(0.3);
        flash();
        break;
      }
      case 'land': {
        if (Math.abs(e.y - p.y) < 12) {
          sound.land(e.size);
          view.particles.dust(view.wx(e.x), e.y - 0.5, 4 + e.size, 0.5 + e.size * 0.1);
          view.shake(Math.min(0.08 + e.size * 0.03, 0.3));
        }
        break;
      }
      case 'clank': {
        // 黒曜石は壊せない：火花と金属音で跳ね返す
        sound.clank();
        const b = game.world.get(e.x, e.y);
        if (b) view.pulse(b.id);
        const px = game.player.x, py = game.player.y;
        const hx = view.wx((e.x + px) / 2), hy = (e.y + py) / 2;
        view.particles.sparkle(hx, hy, new THREE.Color(0xffc040), 8, 1.3);
        view.shake(0.12);
        if (performance.now() - lastClankPopup > 700) {
          lastClankPopup = performance.now();
          popup(e.x, e.y + 0.3, 'カキーン！ 壊せない', 'big');
        }
        break;
      }
      case 'life':
        sound.oneUp();
        view.particles.sparkle(view.wx(e.x), e.y, new THREE.Color(0xff5c8a), 26, 1.6);
        flash();
        break;
      case 'capsule':
        sound.capsule();
        view.particles.sparkle(view.wx(e.x), e.y, new THREE.Color(0x49f0ff), 22, 1.5);
        break;
      case 'crush':
        reportDeepAnalytics('life_lost', { cause: '潰された', depthM: game.maxDepth, livesLeft: game.lives, timeSec: Math.round(game.time) });
        reportDeathPoint('falldown', p.x, game.depth, '潰された');
        sound.crush();
        view.shake(0.8);
        flash('red');
        showBanner('潰された', 'bad', 'crush');
        break;
      case 'suffocate':
        sound.suffocate();
        flash('red');
        showBanner('酸素切れ', 'bad', 'air');
        reportDeepAnalytics('life_lost', { cause: '酸素切れ', depthM: game.maxDepth, livesLeft: game.lives, timeSec: Math.round(game.time) });
        reportDeathPoint('falldown', p.x, game.depth, '酸素切れ');
        break;
      case 'score': {
        if (e.label) popup(e.x, e.y, e.label, e.label.startsWith('AIR') ? 'air' : e.label.includes('UP') || e.label.includes('LIFE') ? 'life' : 'big');
        popup(e.x, e.y - (e.label ? 0.7 : 0), `+${e.amount}`);
        break;
      }
      case 'layer':
        reportPhase('playing', { layer: e.layer, strata: strataProgress(e.layer * 100).name });
        benchMark('layer');
        sound.layer();
        sound.tempo = Math.min(112 + e.layer * 8, 170);
        // 難しさも上がる地層では、'difficulty' の知らせ（下の行つき）を出すので、ここでは出さない
        if (!DIFFICULTY_STEPS.some((s) => s.depth === e.layer * 100)) showBanner(`${strataProgress(e.layer * 100).name}へ突入`, 'normal', 'layer');
        break;
      case 'difficulty':
        // 難しさが上がった：地層に入ったときの知らせ（200m・300m・400m）はその下の行に、450m は単独で出す
        if (e.depth % 100 === 0) {
          showBanner(`${strataProgress(e.depth).name}へ突入`, 'warn', 'layer', e.text);
        } else {
          sound.layer();
          showBanner(`残り${GOAL_DEPTH - e.depth}m`, 'warn', 'layer', e.text);
        }
        break;
      case 'landPlayer':
        if (e.impact > 6) {
          sound.playerLand();
          view.particles.dust(view.wx(p.x), p.y - 0.45, 5, 0.3);
        }
        break;
      case 'gameover': {
        sound.stopBgm();
        sound.gameOver();
        reportDeepAnalytics('progression_update', {
          result: 'gameover',
          deathReason: game.lastDeath === 'air' ? '酸素切れ' : '潰された',
          maxStage: `${game.maxDepth}m`,
          score: game.score,
          extraStats: { depthM: game.maxDepth, layer: game.layer, timeSec: Math.round(game.time) },
        });
        const isNew = recordResult(false);
        openResult(false, isNew, null);
        break;
      }
      case 'clear': {
        sound.stopBgm();
        sound.clear();
        const isNew = recordResult(true);
        const bonus = e.bonus;
        reportDeepAnalytics('progression_update', {
          result: 'clear',
          maxStage: `${GOAL_DEPTH}m`,
          score: game.score,
          extraStats: { timeSec: Math.round(game.time), livesLeft: game.lives, bonus },
        });
        view.shake(0.6);
        flash('fire');
        // 黄金郷に着いた瞬間、スローモーションで壊れていくブロックの中に、爆発が次々と起きる
        slowmo = SLOWMO_SEC;
        sound.bigExplosion();
        blastFx(p.x, p.y + 0.5, 2.2, true);
        for (let i = 0; i < 8; i++) {
          fxQueue.push({
            t: 0.1 + i * 0.22,
            fn: () => {
              blastFx(0.5 + Math.random() * 7, p.y + (Math.random() - 0.35) * 8, 0.8 + Math.random() * 0.6, true);
              sound.explosion();
            },
          });
        }
        // 金貨と宝石が降りそそぐ
        for (let i = 0; i < 8; i++) {
          const x = Math.random() * 8;
          const y = game.player.y + 1 + Math.random() * 3;
          view.particles.burst(view.wx(x), y, new THREE.Color(0xffc531), 10, 1.2);
          view.particles.sparkle(view.wx(x), y, i % 2 ? new THREE.Color(0xffe28a) : new THREE.Color(BLOCK_COLORS[i % 4]), 18, 2);
        }
        setTimeout(() => openResult(true, isNew, bonus), 4200);
        benchMark('clear');
        if (BENCH) setTimeout(() => benchDone('clear'), 6000); // 演出(スローモーションと連続爆発)が終わるまで測る
        break;
      }
    }
  }
  game.events.length = 0;
}

// ---------------- HUD ----------------
// 毎フレーム呼ばれるので、値が変わっていないときは DOM に書かない(書くだけでスタイルの再計算が走る)
const lastText = new WeakMap<HTMLElement, string>();
function setText(el: HTMLElement, text: string) {
  if (lastText.get(el) === text) return;
  lastText.set(el, text);
  el.textContent = text;
}
const lastStyle = new WeakMap<HTMLElement, Record<string, string>>();
function setStyle(el: HTMLElement, prop: 'width' | 'minWidth' | 'transform', value: string) {
  const m = lastStyle.get(el) ?? {};
  if (m[prop] === value) return;
  m[prop] = value;
  lastStyle.set(el, m);
  el.style[prop] = value;
}

function updateHud(dt: number) {
  if (game.phase === 'title' || inTutorial) return;
  // 目盛り板に重ねた表示ボックス: プレイヤーの深さに追従して、高さをデジタル表示する
  setText(ui.depth, String(game.depth));
  const tag = view.rulerTagPos(1 - game.player.y);
  ui.depthTag.classList.remove('hidden');
  // 画面が大きくても、ボックスは巻き尺よりひと回り広く(はみ出す)
  setStyle(ui.depthTag, 'minWidth', `${Math.round(view.rulerScreenWidth(1 - game.player.y) * 1.6)}px`);
  setStyle(ui.depthTag, 'transform', `translate(${tag.x.toFixed(1)}px, ${tag.y.toFixed(1)}px) translate(-50%, -50%)`);
  const area = strataProgress(game.depth);
  setText(ui.areaNow, area.name);
  setText(ui.areaRemain, String(area.remain));
  setText(ui.score, game.score.toLocaleString());
  const pct = Math.max(0, Math.ceil((game.air / MAX_AIR) * 100));
  setStyle(ui.airFill, 'width', `${(Math.round((game.air / MAX_AIR) * 400) / 4).toFixed(2)}%`);
  // 半分を切ったら、画面に知らせる(酸素を回復して半分より上に戻れば、また知らせる)
  if (pct > 50) airHalfWarned = false;
  else if (!airHalfWarned && game.phase === 'playing') {
    airHalfWarned = true;
    showBanner('酸素が減っている', 'warn', 'air');
  }
  const low = pct <= 25 && game.phase === 'playing';
  ui.airFill.classList.toggle('low', low);
  ui.vignette.classList.toggle('on', low);
  if (low && !paused) {
    warnTimer -= dt;
    if (warnTimer <= 0) {
      sound.warn();
      warnTimer = pct <= 10 ? 0.45 : 0.9;
    }
  }
  if (lastLives !== game.lives) {
    lastLives = game.lives;
    ui.lives.innerHTML = '';
    for (let i = 0; i < START_LIVES; i++) {
      const s = document.createElement('span');
      if (i >= game.lives) s.className = 'lost';
      ui.lives.appendChild(s);
    }
  }
}

/** 頭上で揺れているブロックがあれば警告音 */
function rumbleCheck(dt: number) {
  rumbleTimer -= dt;
  if (rumbleTimer > 0 || game.phase !== 'playing') return;
  const p = game.player;
  for (let y = Math.round(p.y) + 1; y <= Math.round(p.y) + 6; y++) {
    for (let x = p.col - 1; x <= p.col + 1; x++) {
      const b = game.world.get(x, y);
      if (b && b.shake >= 0) {
        sound.shake();
        rumbleTimer = 0.22;
        return;
      }
    }
  }
}

// ---------------- メニュー (リザルト・ポーズ共通の操作) ----------------
const menuNav = new MenuNav();
let resultOpen = false;
let nameEntryOpen = false; // 順位の確認中・名前入力中は、リザルトの操作を止める
let resultArmUntil = 0; // この時刻までは決定を受け付けない(直前の操作が決定として入らないように)
let resultFocus = 0;
let resultSeq = 0;
let stopCountUp: (() => void) | null = null;

window.addEventListener('keydown', (e) => {
  if (resultOpen && !nameEntryOpen && menuNav.pushKey(e)) e.preventDefault();
});

const resultItems: ResultMenuItem[] = [
  { button: $('result-btn-retry'), color: ACCENT },
  { button: $('result-btn-title'), color: '#7bdff2' },
  { button: $('result-btn-exit'), color: '#ff8fa3' },
];
setupResultMenu($('result-menu'), resultItems);
const resultActions = [() => startGame(), () => showTitle(), () => returnToHub()];
resultItems.forEach((it, i) => it.button?.addEventListener('click', () => {
  if (resultOpen && !nameEntryOpen) resultActions[i]();
}));

/** レバー・十字キーでの選択移動(キーボードは keydown 側で拾う)。移動後のフォーカスを返す */
function stepMenu(items: ResultMenuItem[], focus: number, inp: FrameInput): number {
  menuNav.updatePad(inp.padDx, -inp.padDy);
  for (const dir of menuNav.take()) {
    focus = (focus + dir + items.length) % items.length;
    applyResultMenuFocus(items, focus);
    sound.menuMove();
  }
  return focus;
}

/** ポーズ(Backspace / アケコンの SELECT)。他のゲームと共通の画面で、再開・やり直す・ゲームを終了を選べる */
new ArcadePause({
  accent: ACCENT,
  isPlaying: () => game.phase === 'playing' && !resultOpen,
  onOpen: () => {
    paused = true;
    tutorialHandle?.pause();
    sound.stopBgm();
  },
  onClose: () => {
    paused = false;
    tutorialHandle?.resume();
    sound.startBgm();
  },
  onRestart: () => {
    tutorialHandle?.cancel();
    tutorialHandle = null;
    inTutorial = false;
    startGame();
  },
});

// ---------------- リザルト (共通メニュー + 共通ランキング) ----------------
function openResult(cleared: boolean, _isNew: boolean, bonus: ClearBonus | null) {
  resultOpen = true;
  resultFocus = 0;
  resultArmUntil = performance.now() + 600;
  menuNav.clear();
  applyResultMenuFocus(resultItems, resultFocus);

  // 見出しは、結果の理由1つだけ(英語の「GAME OVER」などは出さない)
  ui.resultBadge.textContent = cleared ? '黄金郷にたどり着いた' : game.lastDeath === 'air' ? '酸素が切れた' : 'ブロックに潰された';
  // 項目の名前と値を、2列に並べる(値の書き出しがそろう)
  const rows: [string, string][] = cleared
    ? [['タイム', fmtTime(game.time)], ...(bonus ? [['ボーナス', `+${bonus.total.toLocaleString()}`] as [string, string]] : [])]
    : [['到達', `${game.maxDepth}m`]];
  ui.resultStats.replaceChildren(
    ...rows.flatMap(([name, value]) => {
      const k = document.createElement('span');
      k.textContent = name;
      const v = document.createElement('b');
      v.textContent = value;
      return [k, v];
    }),
  );

  ui.resultRecord.textContent = '';
  ui.resultRecord.classList.remove('new');
  ui.resultModal.classList.add('show');
  stopCountUp = countUpText(ui.resultScore, game.score.toLocaleString());
  guideMenu();
  showRanking(cleared);
}

function closeResult() {
  resultOpen = false;
  resultSeq++;
  nameEntryOpen = false;
  stopCountUp?.();
  stopCountUp = null;
  ui.resultModal.classList.remove('show');
}

function renderRanking(list: LeaderboardEntry[] | null, highlightRank?: number) {
  renderRankingList(ui.resultRanking, list, highlightRank);
}

/** 共通ランキング(上位3位)を出す。上位に入ったら名前を登録する */
function showRanking(cleared: boolean) {
  if (BENCH) return; // ベンチでは、サーバーに問い合わせない
  if (DEBUG) {
    // 検証中は、順位の表示だけ(読み取りのみ)。名前の入力と記録の保存はしない
    const seq = ++resultSeq;
    renderRanking(null);
    void loadLeaderboardAndCheck(SLUG, game.score, undefined, 3).then(({ list }) => {
      if (seq === resultSeq) renderRanking(list);
    });
    return;
  }
  const seq = ++resultSeq;
  const score = game.score;
  const extra = cleared ? `クリア ${fmtTime(game.time)}` : `到達 ${game.maxDepth}m`;
  renderRanking(null);
  nameEntryOpen = true; // 順位の確認が終わるまで操作を止める
  void loadLeaderboardAndCheck(SLUG, score, undefined, 3).then(({ list, isRankIn, rank }) => {
    if (seq !== resultSeq) return; // 取得中に画面が閉じられた
    renderRanking(list);
    if (!isRankIn) {
      nameEntryOpen = false;
      return;
    }
    mountNameEntryModal({
      title: '掘削記録',
      scoreDisplay: `${score.toLocaleString()} pts`,
      rankDisplay: `第${rank}位`,
      themeClass: 'theme-street',
      delayMs: NAME_ENTRY_AFTER_RESULT_MS,
      onComplete: async (name) => {
        menuNav.clear();
        const perfect = cleared && game.deaths === 0;
        const res = await saveLeaderboardScore(SLUG, score, name, undefined, extra, { cleared, perfect });
        if (seq === resultSeq && res.rank > 0) renderRanking(res.list, res.rank);
        return res;
      },
      onClosed: () => {
        if (seq !== resultSeq) return;
        nameEntryOpen = false;
        resultArmUntil = performance.now() + 800; // 名前の決定がメニューの決定として入らないようにする
      },
    });
  });
}

function updateResult(inp: FrameInput, now: number) {
  if (nameEntryOpen || now < resultArmUntil) {
    menuNav.clear();
    return;
  }
  resultFocus = stepMenu(resultItems, resultFocus, inp);
  if (inp.start) {
    sound.menuSelect();
    resultActions[resultFocus]();
  } else if (inp.cancel) {
    sound.menuSelect();
    showTitle();
  }
}

// ---------------- メインループ ----------------
let last = performance.now();
function frame(now: number) {
  // 前のフレームより前の時刻が来たときは、0 として扱う。
  // 計測(Windows, Firefox): 読み込みでメインスレッドが 2.6 秒ふさがると、最初のフレームの時刻が、読み込む前(last より 2.57 秒前)の時刻で来る。
  // そのままでは dt がマイナスになり、カメラの追従(1 - exp(-dt * 5))が外れて、カメラが地下 36 万マスへ飛び、そこまで地形を作ろうとして止まっていた
  const rawDt = Math.min(Math.max(0, (now - last) / 1000), 0.05);
  last = now;
  const inp: FrameInput = PREVIEW
    ? previewInput(now)
    : BENCH && game.phase !== 'title'
      ? { ...benchBot(game, now), start: false, cancel: false, anyPressed: false, padDx: 0, padDy: 0 }
      : input.poll();
  // スローモーション中は、ゲームも演出も、遅い時間で進める(入力と音は実時間のまま)
  const dt = rawDt * timeScale();
  slowmo = Math.max(0, slowmo - rawDt);
  if (inp.anyPressed) sound.unlock();

  if (game.phase === 'gameover' || game.phase === 'clear') {
    if (resultOpen) updateResult(inp, now);
  }

  // 時間差の演出を進める
  for (let i = fxQueue.length - 1; i >= 0; i--) {
    fxQueue[i].t -= dt;
    if (fxQueue[i].t <= 0) fxQueue.splice(i, 1)[0].fn();
  }
  // 爆発の瞬間は、ゲームの進行だけをほぼ止める（揺れや光はそのまま動く）
  const gameDt = hitstop > 0 ? dt * 0.1 : dt;
  hitstop = Math.max(0, hitstop - dt);

  if (!paused) {
    if (inTutorial) {
      const started = tutorialHandle?.isStarted() ?? false;
      const stepIdx = tutorialHandle?.currentStepIndex() ?? -1;
      const stepReady = tutorialHandle?.isStepReady() ?? false;
      if (stepIdx !== tutorialLastStep) {
        tutorialLastStep = stepIdx;
        tutorialMoveDist = 0;
        tutorialActionDone = false;
        tutorialActionDelay = 0;
      } else if (!stepReady) {
        tutorialMoveDist = 0;
      }
      if (started && stepIdx !== tutorialStepPrepared) {
        tutorialStepPrepared = stepIdx;
        prepareTutorialStep(stepIdx);
      }
      const allowDig = started && stepReady && !tutorialActionDone && (stepIdx === 2 || stepIdx === 3 || stepIdx === 4);
      const activeInp: FrameInput = !started
        ? { ...inp, dx: 0, dy: 0, dig: false, digPressed: false }
        : allowDig && inp.digPressed
          ? { ...inp, dx: 0, dy: -1, dig: true, digPressed: true }
          : { ...inp, dy: allowDig && inp.dx === 0 ? -1 : inp.dy, dig: false, digPressed: false };
      if (stepIdx < 5) {
        game.air = MAX_AIR;
      } else {
        game.air = Math.max(30, game.air);
      }
      game.invuln = 2.0;
      game.time = 0;
      game.update(gameDt, activeInp);
      const brokeBlock = game.events.some((e) => e.type === 'break');
      const clanked = game.events.some((e) => e.type === 'clank');
      const exploded = game.events.some((e) => e.type === 'explode');
      const gotCapsule = game.events.some((e) => e.type === 'capsule');
      const dx = game.player.x - tutorialLastX;
      tutorialLastX = game.player.x;
      if (stepReady) {
        if (stepIdx === 0) {
          if (activeInp.dx > 0) {
            tutorialMoveDist += Math.max(0, dx) + gameDt * 2.0;
            if (tutorialMoveDist >= 0.70) {
              tutorialMoveDist = 0;
              tutorialHandle?.advance(0);
            }
          }
        } else if (stepIdx === 1) {
          if (activeInp.dx < 0) {
            tutorialMoveDist += Math.max(0, -dx) + gameDt * 2.0;
            if (tutorialMoveDist >= 0.70) {
              tutorialMoveDist = 0;
              tutorialHandle?.advance(1);
            }
          }
        } else if (stepIdx === 2) {
          if (brokeBlock) tutorialActionDone = true;
          if (tutorialActionDone) {
            tutorialActionDelay += rawDt;
            if (tutorialActionDelay >= 0.45 && game.player.state === 'ground') {
              tutorialHandle?.advance(2);
            }
          }
        } else if (stepIdx === 3) {
          if (clanked) {
            tutorialActionDone = true;
          } else if (activeInp.digPressed && !tutorialActionDone) {
            prepareTutorialStep(3);
          }
          if (tutorialActionDone) {
            tutorialActionDelay += rawDt;
            if (tutorialActionDelay >= 0.42) tutorialHandle?.advance(3);
          }
        } else if (stepIdx === 4) {
          if (exploded) {
            tutorialActionDone = true;
          } else if (activeInp.digPressed && !tutorialActionDone) {
            prepareTutorialStep(4);
          }
          if (tutorialActionDone) {
            tutorialActionDelay += rawDt;
            if (tutorialActionDelay >= 0.50 && game.player.state === 'ground') {
              tutorialHandle?.advance(4);
            }
          }
        } else if (stepIdx === 5) {
          if (gotCapsule || game.air >= MAX_AIR - 1) tutorialActionDone = true;
          if (tutorialActionDone) {
            tutorialActionDelay += rawDt;
            if (tutorialActionDelay >= 0.40) tutorialHandle?.advance(5);
          }
        }
      }
      handleEvents();
    } else {
      game.update(gameDt, inp);
      handleEvents();
      rumbleCheck(dt);
    }
  }
  view.render(paused ? 0 : dt, game);
  updateHud(dt);
  sound.tick();
  requestAnimationFrame(frame);
}
declareBenchTargets(fallDownBenchTargets(STRATA, GOAL_DEPTH));
showTitle();
if (PREVIEW) startGame();
// 着いたと知らせるのは、ページの立ち上がりが済み、フレームが落ち着いてから(タイトル・プレイはすぐ始まる。計測を始める所だけ遅らせる)。
// 計測(Windows, Firefox): すぐに知らせると、最初の 0.3 秒に、ブラウザ側の待ちで 66〜100ms のフレームが 2〜5 回入っていた(そのあとは 60fps)
if (BENCH_SCENE === 'title') void waitFramesSettled().then(() => benchReady('title'));
else if (BENCH) {
  startGame();
  void waitFramesSettled().then(() => benchReady('play'));
}
requestAnimationFrame(frame);

// 動作確認用 (開発時のみ。本番のビルドには入らない)
if (import.meta.env.DEV) {
  (window as unknown as { __game: Game; __view: View }).__game = game;
  (window as unknown as { __game: Game; __view: View }).__view = view;
  (window as unknown as Record<string, unknown>).__fd = { game, view, renderer: view.renderer, scene: view.scene };
}
