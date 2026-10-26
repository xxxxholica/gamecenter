import { games, GameEntry, GROUPS, GroupDef } from './games';
import { createArcadeInput } from './arcadeInput';
import { mountArcadeGuide } from '../../shared/arcadeGuide';
import { mountFullscreenKey } from '../../shared/fullscreenKey';
import {
  initFramedHub,
  isFramedHub,
  isGameFrameOpen,
  listenGameFrameMessages,
  openGameFrame,
  shouldOpenInFrame,
} from './gameFrame';
import {
  GAME_LEADERBOARD_DEFS,
  getLeaderboardKey,
  loadAllLeaderboards,
  padEmptyEntries,
  LeaderboardEntry,
  escapeHtml,
} from '../../shared/arcadeLeaderboard';
import { fetchAllOnlineStatuses } from '../../shared/online/onlineStatus';
import type { PublicStatus } from '../../shared/online/core';
import { initHubMobileBlock, isMobileDevice } from '../../shared/mobileBlock';
import { initSessionTracking } from '../../shared/arcadeAnalytics';
import { applyBenchFlagFromUrl } from '../../shared/arcadeBenchCore';
import { stripDevParamsOnProduction } from '../../shared/devParams';
import { mountGpuFooter } from './gpuFooter';

// ハブを ?bench=1 で開いたら、その後に開く全ゲームでベンチマーク計測を有効にする(?bench=0 で解除)。本番のドメインでは効かない
stripDevParamsOnProduction();
applyBenchFlagFromUrl();

// モバイル端末（スマホ・タブレット）アクセス制限の適用
const isMobileBlocked = initHubMobileBlock();

// ゲームのiframeの中に読み込まれたハブは、親にゲームを閉じさせるだけで何もしない
if (isFramedHub) {
  initFramedHub();
} else if (!isMobileBlocked) {
  initSessionTracking();
  listenGameFrameMessages();
  mountFullscreenKey();

  mountArcadeGuide({
    moveLabel: '選ぶ',
    buttons: [{ indices: [9], label: '決定' }],
  });
  mountGpuFooter();
}


/** オンラインの状態: closed=開催されていない / open=開催中 / waiting=開催中で、誰かが待機中 */
function onlineState(status?: PublicStatus | null): 'closed' | 'open' | 'waiting' {
  if (!status || !status.open) return 'closed';
  const waiting = status.phase === 'lobby' && status.players >= 1 && status.players < status.max;
  return waiting ? 'waiting' : 'open';
}

// ===== ランキングHTML生成 =====
const CLEAR_STAR_DESC = 'クリアスター';
const PINK_DIAMOND_STAR_DESC = '完全制覇スター';

/** クリアした記録は、名前のすぐ右に ★ (ノーデス＋無敵アイテム未使用なら完全制覇スター) を付けて表示する */
function renderRowsHtml(entries: LeaderboardEntry[]): string {
  const top5 = entries.slice(0, 5);
  const posLabels = ['1ST', '2ND', '3RD', '4TH', '5TH'];
  const posClasses = ['gold', 'silver', 'bronze', 'fourth', 'fifth'];

  return top5
    .map((e, idx) => {
      const isEmpty = e.name === '記録なし';
      const safeName = escapeHtml(e.name);
      const safeScore = escapeHtml(e.formattedScore);
      const clearMarkHtml = e.perfect
        ? `<span class="rank-clear-mark is-pink-diamond" data-tooltip="${PINK_DIAMOND_STAR_DESC}" aria-label="${PINK_DIAMOND_STAR_DESC}">★</span>`
        : e.cleared
          ? `<span class="rank-clear-mark" data-tooltip="${CLEAR_STAR_DESC}" aria-label="${CLEAR_STAR_DESC}">★</span>`
          : '';
      return `
        <div class="ranking-row">
          <span class="rank-pos ${posClasses[idx] ?? ''}">${posLabels[idx] ?? `${idx + 1}TH`}</span>
          <span class="rank-name ${isEmpty ? 'is-empty' : ''}">${safeName}${clearMarkHtml}</span>
          <span class="rank-score ${isEmpty ? 'is-empty' : ''}">${safeScore}</span>
        </div>
      `;
    })
    .join('');
}

// クリアスターのホバー説明ツールチップ
const starTooltip = document.createElement('div');
starTooltip.className = 'rank-star-tooltip';
document.body.appendChild(starTooltip);

document.addEventListener('mouseover', (e) => {
  const mark = (e.target as Element | null)?.closest?.('.rank-clear-mark') as HTMLElement | null;
  if (!mark) return;
  const text = mark.dataset.tooltip || mark.getAttribute('title') || '';
  if (!text) return;
  const rect = mark.getBoundingClientRect();
  starTooltip.textContent = text;
  starTooltip.style.left = `${rect.left + rect.width / 2}px`;
  starTooltip.style.top = `${rect.top - 6}px`;
  starTooltip.classList.add('visible');
});

document.addEventListener('mouseout', (e) => {
  const mark = (e.target as Element | null)?.closest?.('.rank-clear-mark');
  if (mark) starTooltip.classList.remove('visible');
});

window.addEventListener('scroll', () => {
  starTooltip.classList.remove('visible');
}, { passive: true });

document.addEventListener('click', (e) => {
  const mark = (e.target as Element | null)?.closest?.('.rank-clear-mark');
  if (!mark) return;
  const link = mark.closest('.card')?.querySelector<HTMLAnchorElement>('.card-link');
  link?.click();
});

let boards: Record<string, LeaderboardEntry[]> = {};

function entriesFor(slug: string, variantId?: string): LeaderboardEntry[] {
  return padEmptyEntries(GAME_LEADERBOARD_DEFS[slug], boards[getLeaderboardKey(slug, variantId)] ?? [], 5);
}

// ===== グループ(遊び方のスタイル)の並び =====
const hubContainer = document.querySelector<HTMLElement>('#hub-container')!;
/** グループの入れ替えの時に、画面を上から下へ走る光の帯 */
const hubSweep = document.createElement('div');
hubSweep.className = 'hub-sweep';
document.body.appendChild(hubSweep);

/**
 * 何も操作しないまま、この時間がたつと、画面の一番上へ戻して、グループを1つ上げる(下のグループが上へ上がり、一番上は一番下へ回る)。
 * 操作(マウス・スクロール・キー・タッチ・アケコン)があれば、数え直す。開いた時は GROUPS の固定の順番。
 */
const GROUP_ROTATE_IDLE_MS = 30_000;
/** 最後に操作があった(または、前回入れ替えた)時刻 */
let lastActivityAt = Date.now();
function markActive(): void {
  lastActivityAt = Date.now();
}
/** グループを上げた回数(GROUPS の数で一周する) */
let rotationIndex = 0;
/** 上げた回数 n に応じた、グループの並び(先頭の n 個が、末尾へ回る) */
function groupOrderFor(n: number): GroupDef[] {
  return [...GROUPS.slice(n), ...GROUPS.slice(0, n)];
}

// コース/難易度バリアントを持つカードのローテーション管理
interface VariantRotator {
  slug: string;
  variantIndex: number;
  tagEl: HTMLElement;
  rowsEl: HTMLElement;
}
const rotators: VariantRotator[] = [];

// 全カード一覧（DOM順）
let cards: HTMLDivElement[] = [];

function createCard(game: GameEntry, onlineStatus?: PublicStatus | null): HTMLDivElement {
  const card = document.createElement('div');
  card.className = 'card';
  card.dataset.slug = game.slug;

  const def = GAME_LEADERBOARD_DEFS[game.slug];
  let rankingHtml = '';

  if (def && def.hasScore) {
    const hasVariants = def.variants && def.variants.length > 0;
    const initialVariant = hasVariants ? def.variants![0] : undefined;
    const entries = entriesFor(game.slug, initialVariant?.id);
    const variantTagHtml = hasVariants
      ? `<span class="ranking-variant-tag" id="tag-${game.slug}">${initialVariant!.label}</span>`
      : '';

    rankingHtml = `
      <div class="card-ranking-container" data-slug="${game.slug}">
        <div class="ranking-header">
          <span class="ranking-title">ランキング</span>
          ${variantTagHtml}
        </div>
        <div class="ranking-rows" id="rows-${game.slug}">
          ${renderRowsHtml(entries)}
        </div>
      </div>
    `;
  } else {
    // ランキングなし: 枠はそのままで中央に「ランキングは利用不可」と表示
    rankingHtml = `
      <div class="card-ranking-container is-disabled" data-slug="${game.slug}">
        <span class="ranking-unavailable">ランキングは利用不可</span>
      </div>
    `;
  }

  // オンライン対戦に対応したゲームの印(いつも出す。開催中は点灯、誰かが待機中なら点が点滅)
  const onlineBadgeHtml = game.online
    ? `<div class="card-online-pill" data-state="${onlineState(onlineStatus)}">オンライン対戦</div>`
    : '';
  // スターシステムに対応したゲームの印(オンラインがあればその右隣に出す)
  const starBadgeHtml = game.star
    ? `<div class="card-star-pill">完全制覇に挑戦</div>`
    : '';
  const badgesHtml = onlineBadgeHtml || starBadgeHtml
    ? `<div class="card-badges">${onlineBadgeHtml}${starBadgeHtml}</div>`
    : '';

  card.innerHTML = `
    <a class="card-link" href="games/${game.slug}/" aria-label="${game.title}を開く"></a>
    <div class="card-thumb-wrap">
      ${badgesHtml}
      <img class="card-thumb" src="${game.thumbnail}" alt="${game.title}のスクリーンショット" loading="lazy" />
      <video class="card-preview" src="previews/${game.slug}.webm" loop muted playsinline preload="none"></video>
    </div>
    <div class="card-body">
      ${
        game.logo
          ? `<div class="card-logo-wrap"><img class="card-logo" src="${game.logo}" alt="${game.title}" loading="lazy" /></div>`
          : `<div class="card-title-en">${game.englishTitle}</div>
             <h2>${game.title}</h2>`
      }
      <a class="card-dev" href="${game.developer.url}" target="_blank" rel="noopener noreferrer">
        <img class="card-dev-avatar" src="${game.developer.avatar}" alt="" loading="lazy" />
        <span class="card-dev-name">@${game.developer.name}</span>
      </a>
      <p class="card-desc">${game.description}</p>
      ${rankingHtml}
    </div>
  `;

  const previewVideo = card.querySelector<HTMLVideoElement>('.card-preview');
  if (previewVideo) {
    card.addEventListener('mouseenter', () => {
      if (!document.body.classList.contains('pad-mode')) {
        previewVideo.currentTime = 0;
        previewVideo.play().catch(() => {});
      }
    });
    card.addEventListener('mouseleave', () => {
      previewVideo.pause();
      previewVideo.currentTime = 0;
    });
  }

  card.querySelector('.card-link')!.addEventListener('click', (e) => {
    if (shouldOpenInFrame()) {
      e.preventDefault();
      launchSelected(game.slug);
    }
  });

  // バリアント切り替え対象ならローテーターに登録
  if (def && def.variants && def.variants.length > 1) {
    const tagEl = card.querySelector<HTMLElement>(`#tag-${game.slug}`);
    const rowsEl = card.querySelector<HTMLElement>(`#rows-${game.slug}`);
    if (tagEl && rowsEl) {
      rotators.push({
        slug: game.slug,
        variantIndex: 0,
        tagEl,
        rowsEl,
      });
    }
  }

  return card;
}

/** 高難易度セクションの空き枠(4枠目)に出す、クリアスター＆完全制覇ピンクスターの解説 */
function createStarGuideCard(): HTMLDivElement {
  const iconFlag = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
  const iconTrophy = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>`;
  const iconHeart = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>`;
  const iconNoMiss = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="m12 6-2 4 4-1-2 4"/></svg>`;
  const iconShield = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`;
  const iconNoShield = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9.5 9.5 5 5"/><path d="m14.5 9.5-5 5"/></svg>`;

  const box = document.createElement('div');
  box.className = 'star-guide-card';
  box.innerHTML = `
    <div class="star-guide-block">
      <div class="star-guide-head">
        <span class="star-guide-icon">★</span>
        <span class="star-guide-label"><span class="star-guide-label-name">クリアスター</span><span class="star-guide-label-sub">の解放条件</span></span>
      </div>
      <div class="star-guide-checklist">
        <div class="star-guide-check-item"><span class="star-guide-check-mark">${iconFlag}</span><span>最終ステージを突破</span></div>
        <div class="star-guide-check-item"><span class="star-guide-check-mark">${iconTrophy}</span><span>TOP5にランクイン</span></div>
        <div class="star-guide-check-item is-unchecked"><span class="star-guide-check-mark is-empty">${iconHeart}</span><span>ミスはOK</span></div>
        <div class="star-guide-check-item is-unchecked"><span class="star-guide-check-mark is-empty">${iconShield}</span><span>無敵アイテム使用はOK</span></div>
      </div>
    </div>
    <div class="star-guide-block is-pink">
      <div class="star-guide-head">
        <span class="star-guide-icon is-pink">★</span>
        <span class="star-guide-label"><span class="star-guide-label-name is-pink">完全制覇スター</span><span class="star-guide-label-sub">の解放条件</span></span>
      </div>
      <div class="star-guide-checklist">
        <div class="star-guide-check-item"><span class="star-guide-check-mark is-pink">${iconFlag}</span><span>最終ステージを突破</span></div>
        <div class="star-guide-check-item"><span class="star-guide-check-mark is-pink">${iconTrophy}</span><span>TOP5にランクイン</span></div>
        <div class="star-guide-check-item"><span class="star-guide-check-mark is-pink">${iconNoMiss}</span><span>ミスは許されない</span></div>
        <div class="star-guide-check-item"><span class="star-guide-check-mark is-pink">${iconNoShield}</span><span>無敵アイテムは使えない</span></div>
      </div>
    </div>
    <p class="star-guide-note">
      ※ <span class="card-star-pill is-inline">完全制覇に挑戦</span> の表示があるゲームが対応
    </p>
  `;
  return box;
}

// 取得したランキングで、全カードの表示を更新する
async function refreshBoards() {
  const next = await loadAllLeaderboards();
  // 通信に失敗した時は空で返ってくる。表示中のランキングを、空で消さない
  if (Object.keys(next).length === 0 && Object.keys(boards).length > 0) return;
  boards = next;
  for (const game of games) {
    const def = GAME_LEADERBOARD_DEFS[game.slug];
    if (!def || !def.hasScore) continue;
    const rowsEl = document.getElementById(`rows-${game.slug}`);
    if (!rowsEl) continue;
    const rotator = rotators.find((r) => r.slug === game.slug);
    const variant = def.variants?.[rotator?.variantIndex ?? 0];
    rowsEl.innerHTML = renderRowsHtml(entriesFor(game.slug, variant?.id));
  }
}

// ===== セクション描画 =====
let isRendering = false;
async function renderSections(targetSlug?: string | null, shouldScroll = false) {
  if (isRendering) return;
  isRendering = true;

  try {
    const statuses = await fetchAllOnlineStatuses();

    // 再描画前の選択中ゲームのslugを保持（再描画後に選択位置を確実に復元するため）
    const prevSelectedSlug = cards[current]?.dataset.slug;

    // ローテーターを初期化して、グループごとの見出しとカードを作り直す
    rotators.length = 0;
    hubContainer.innerHTML = '';
    groupOrderFor(rotationIndex).forEach((group) => {
      const groupGames = games.filter((g) => g.group === group.id);
      if (groupGames.length === 0) return;
      const section = document.createElement('section');
      section.className = 'game-section';
      section.id = `section-${group.id}`;
      section.dataset.group = group.id;
      section.innerHTML = `
        <div class="section-header">
          <h2 class="section-title">${group.title}</h2>
          <span class="section-note">${group.note}</span>
        </div>
        <div class="game-grid"></div>
      `;
      const grid = section.querySelector<HTMLDivElement>('.game-grid')!;
      groupGames.forEach((g) => grid.appendChild(createCard(g, statuses[g.slug])));
      if (group.id === 'hard') {
        grid.appendChild(createStarGuideCard());
      }
      hubContainer.appendChild(section);
    });

    cards = Array.from(document.querySelectorAll<HTMLDivElement>('.card'));
    await refreshBoards();

    // 選択位置の復元 (明示的な targetSlug または既存選択を維持。初回・リロード時は先頭カード)
    const preferredSlug = targetSlug ?? prevSelectedSlug;
    let preferredIndex = preferredSlug ? cards.findIndex((c) => c.dataset.slug === preferredSlug) : 0;
    if (preferredIndex < 0) preferredIndex = 0;
    goTo(preferredIndex);
    if (shouldScroll) {
      scrollCardIntoView(preferredIndex);
    }
  } finally {
    isRendering = false;
  }
}

// ===== 時間経過でコース/難易度ランキングをローテーション切替 =====
const ROTATION_INTERVAL_MS = 4000;
let rotationTimer: number | null = null;

function rotateVariants() {
  // ゲームを開いている間は、見えないカードを書き換えない(ゲームと同じスレッドで、スタイル計算・再描画が走るのを避ける)
  if (isGameFrameOpen()) return;
  rotators.forEach((rotator) => {
    const def = GAME_LEADERBOARD_DEFS[rotator.slug];
    if (!def || !def.variants || def.variants.length <= 1) return;

    rotator.rowsEl.classList.add('fading');
    rotator.tagEl.style.opacity = '0';

    setTimeout(() => {
      rotator.variantIndex = (rotator.variantIndex + 1) % def.variants!.length;
      const curVariant = def.variants![rotator.variantIndex];
      const entries = entriesFor(rotator.slug, curVariant.id);

      rotator.tagEl.textContent = curVariant.label;
      rotator.rowsEl.innerHTML = renderRowsHtml(entries);

      rotator.rowsEl.classList.remove('fading');
      rotator.tagEl.style.opacity = '1';
    }, 220);
  });
}

function startRotation() {
  if (rotationTimer === null && rotators.length > 0) {
    rotationTimer = window.setInterval(rotateVariants, ROTATION_INTERVAL_MS);
  }
}

function stopRotation() {
  if (rotationTimer !== null) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

// ===== 選択状態管理 =====
let current = 0;

function setPressed(pressed: boolean) {
  cards[current]?.classList.toggle('pressed', pressed);
}

function scrollCardIntoView(index: number) {
  const card = cards[index];
  if (!card) return;
  // 最上段(最初の行)のカードの場合はページ最上部までスクロールして、一番上のグループの見出しを完全に見せる
  const firstCardTop = cards[0]?.offsetTop ?? 0;
  if (card.offsetTop <= firstCardTop + 15) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function goTo(index: number) {

  if (cards.length === 0) return;
  const pressed = cards[current]?.classList.contains('pressed') ?? false;
  setPressed(false);
  const prev = current;
  current = (index + cards.length) % cards.length;
  setPressed(pressed);
  cards.forEach((card, i) => card.classList.toggle('selected', i === current));

  if (document.body.classList.contains('pad-mode')) {
    const prevVid = cards[prev]?.querySelector<HTMLVideoElement>('.card-preview');
    if (prevVid) {
      prevVid.pause();
      prevVid.currentTime = 0;
    }
    const curVid = cards[current]?.querySelector<HTMLVideoElement>('.card-preview');
    if (curVid) {
      curVid.currentTime = 0;
      curVid.play().catch(() => {});
    }
  }
}

// ===== アケコン / キーボード操作 =====
function setPadMode(on: boolean) {
  const wasPadMode = document.body.classList.contains('pad-mode');
  document.body.classList.toggle('pad-mode', on);
  if (wasPadMode !== on) {
    const curVid = cards[current]?.querySelector<HTMLVideoElement>('.card-preview');
    if (curVid) {
      if (on) {
        curVid.currentTime = 0;
        curVid.play().catch(() => {});
      } else {
        curVid.pause();
        curVid.currentTime = 0;
      }
    }
  }
}

window.addEventListener('mousemove', (e) => {
  if (e.movementX !== 0 || e.movementY !== 0) setPadMode(false);
});

// セクション分割後も自然に移動できる幾何ナビゲーション
function moveSelection(dx: number, dy: number) {
  if (cards.length === 0) return;
  setPadMode(true);

  if (dx !== 0) {
    goTo(current + dx);
  } else if (dy !== 0) {
    const curCard = cards[current];
    if (!curCard) return;
    const curRect = curCard.getBoundingClientRect();
    const curCenterX = curRect.left + curRect.width / 2;

    if (dy > 0) {
      // 下へ移動: 現在のカードの下端より下にあるカード群
      const belowCards = cards
        .map((c, i) => ({ card: c, index: i, rect: c.getBoundingClientRect() }))
        .filter((item) => item.rect.top > curRect.top + 20);

      if (belowCards.length > 0) {
        const minTop = Math.min(...belowCards.map((b) => b.rect.top));
        const nextRowCards = belowCards.filter((b) => Math.abs(b.rect.top - minTop) < 35);
        nextRowCards.sort((a, b) => {
          const distA = Math.abs(a.rect.left + a.rect.width / 2 - curCenterX);
          const distB = Math.abs(b.rect.left + b.rect.width / 2 - curCenterX);
          return distA - distB;
        });
        goTo(nextRowCards[0].index);
      }
    } else {
      // 上へ移動: 現在のカードの上端より上にあるカード群
      const aboveCards = cards
        .map((c, i) => ({ card: c, index: i, rect: c.getBoundingClientRect() }))
        .filter((item) => item.rect.bottom < curRect.bottom - 20);

      if (aboveCards.length > 0) {
        const maxTop = Math.max(...aboveCards.map((a) => a.rect.top));
        const prevRowCards = aboveCards.filter((a) => Math.abs(a.rect.top - maxTop) < 35);
        prevRowCards.sort((a, b) => {
          const distA = Math.abs(a.rect.left + a.rect.width / 2 - curCenterX);
          const distB = Math.abs(b.rect.left + b.rect.width / 2 - curCenterX);
          return distA - distB;
        });
        goTo(prevRowCards[0].index);
      }
    }
  }

  scrollCardIntoView(current);
}


window.addEventListener('pageshow', (e) => {
  if (e.persisted) {
    setPressed(false);
    void renderSections();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopRotation();
  } else {
    startRotation();
    markActive();
    void renderSections();
  }
});

function launchSelected(slug?: string) {
  if (isMobileDevice()) {
    return;
  }
  const targetSlug = slug ?? cards[current]?.dataset.slug;
  if (!targetSlug) return;
  const url = `games/${targetSlug}/`;
  if (shouldOpenInFrame()) {
    openGameFrame(url, () => {
      setPressed(false);
      markActive(); // ゲームから戻った時から、30秒を数える
      return renderSections(targetSlug, true);
    }, targetSlug);
  } else {
    window.location.href = url;
  }
}

// ゲームをiframeで開いている間はハブ側入力を抑制
if (!isFramedHub && !isMobileBlocked) {
  createArcadeInput({
    onActivate() {
      markActive();
      if (!isGameFrameOpen()) setPadMode(true);
    },
    onMove(dx, dy) {
      markActive();
      if (!isGameFrameOpen()) moveSelection(dx, dy);
    },
    onConfirmDown() {
      markActive();
      if (isGameFrameOpen()) return;
      setPadMode(true);
      setPressed(true);
    },
    onConfirmUp() {
      if (!isGameFrameOpen()) launchSelected();
    },
  }, isGameFrameOpen);
}

// 30秒ごとに、下のグループを1つ上げる(一番上のグループは、一番下へ回る)。
// 作り直さずに、セクションの並びだけを入れ替える(動画も選択も保ったまま)。ゲームを開いている間と、タブが隠れている間は、戻った時に追いつく。
let isRotating = false;
/** 操作がないまま一定時間たったら、画面の一番上へ戻して、グループを入れ替える */
function rotateGroupsIfIdle() {
  if (isRotating || cards.length === 0 || document.hidden || isGameFrameOpen()) return;
  if (Date.now() - lastActivityAt < GROUP_ROTATE_IDLE_MS) return;
  markActive(); // 次は、入れ替えてから、また30秒後
  rotateGroups();
}

function rotateGroups() {
  // 動きを減らす設定の環境では、アニメーションなしで入れ替える
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyRotation();
    return;
  }

  // 画面全体を、一度上へ消して → 一番上へ戻して並びを入れ替え → 下から入ってくる(リフレッシュする動き)。同時に、背景色の帯が画面を走る
  isRotating = true;
  hubSweep.classList.remove('run');
  void hubSweep.offsetWidth; // アニメーションを最初からやり直す
  hubSweep.classList.add('run');
  hubContainer.classList.add('refresh-out');
  window.setTimeout(() => {
    applyRotation();
    hubContainer.classList.add('refresh-in'); // 下に置いた状態を、動きなしで作ってから
    void hubContainer.offsetWidth;
    hubContainer.classList.remove('refresh-out', 'refresh-in'); // 元の位置へ戻る動き
    window.setTimeout(() => { isRotating = false; }, 400);
  }, 380);
}

function applyRotation() {
  rotationIndex = (rotationIndex + 1) % GROUPS.length;
  const sections = new Map(
    Array.from(hubContainer.querySelectorAll<HTMLElement>('.game-section')).map((el) => [el.dataset.group as string, el]),
  );
  groupOrderFor(rotationIndex).forEach((g) => {
    const el = sections.get(g.id);
    if (el) hubContainer.appendChild(el);
  });

  // 画面の一番上へ戻して、選択も、新しい一番上のグループの先頭のカードに移す
  cards = Array.from(document.querySelectorAll<HTMLDivElement>('.card'));
  window.scrollTo(0, 0);
  goTo(0);
  void refreshBoards();
}

// オンライン開催状況の定期更新: 印の状態(点灯・点滅)だけを書き換える。セクションは作り直さないので、並びもスクロール位置も動かない
async function updateOnlineStatuses() {
  try {
    const statuses = await fetchAllOnlineStatuses();
    document.querySelectorAll<HTMLDivElement>('.card').forEach((card) => {
      const slug = card.dataset.slug;
      const pill = card.querySelector<HTMLElement>('.card-online-pill');
      if (slug && pill) pill.dataset.state = onlineState(statuses[slug]);
    });
  } catch {
    // 通信エラー時は無視
  }
}

if (!isFramedHub && !isMobileBlocked) {
  // ブラウザのリロード時スクロール復元を抑止し、常にページの最上部から表示
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  // 初回描画とローテーション開始（リロード・初期表示時は常に最上部・先頭カードから表示）
  void renderSections(null, false).then(() => {
    window.scrollTo(0, 0);
    startRotation();
  });

  // オンライン開催状況の定期ポーリング (5秒毎)
  // 定期更新時はインプレース更新を行い、メニュー上部への自動スクロールを根絶
  setInterval(() => {
    if (!document.hidden && !isGameFrameOpen()) {
      void updateOnlineStatuses();
    }
  }, 5000);

  // 操作がないまま30秒たったかを、1秒ごとに見る
  setInterval(rotateGroupsIfIdle, 1000);

  // プレイヤーの操作があれば、入れ替えまでの30秒を数え直す
  for (const type of ['mousedown', 'wheel', 'keydown', 'touchstart', 'touchmove', 'pointerdown']) {
    window.addEventListener(type, markActive, { passive: true });
  }
  window.addEventListener('mousemove', (e) => {
    if (e.movementX !== 0 || e.movementY !== 0) markActive();
  }, { passive: true });

  // ウィンドウフォーカス復帰時にも即座にステータスをチェック
  window.addEventListener('focus', () => {
    if (!isGameFrameOpen()) {
      void updateOnlineStatuses();
      void refreshBoards();
    }
    markActive(); // ウィンドウに戻ってきたことも、操作として数える
  });
}
