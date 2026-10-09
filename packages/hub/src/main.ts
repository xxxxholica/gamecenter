import { games, GameEntry } from './games';
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

// モバイル端末（スマホ・タブレット）アクセス制限の適用
initHubMobileBlock();

// ゲームのiframeの中に読み込まれたハブは、親にゲームを閉じさせるだけで何もしない
if (isFramedHub) {
  initFramedHub();
} else {
  listenGameFrameMessages();
  mountFullscreenKey();

  mountArcadeGuide({
    moveLabel: '選ぶ',
    buttons: [{ indices: [9], label: '決定' }],
  });
}


// ===== ランキングHTML生成 =====
/** クリアした記録は、名前のすぐ右に ★ を付けて表示する */
function renderRowsHtml(entries: LeaderboardEntry[]): string {
  const top5 = entries.slice(0, 5);
  const posLabels = ['1ST', '2ND', '3RD', '4TH', '5TH'];
  const posClasses = ['gold', 'silver', 'bronze', 'fourth', 'fifth'];

  return top5
    .map((e, idx) => {
      const isEmpty = e.name === '記録なし';
      const safeName = escapeHtml(e.name);
      const safeScore = escapeHtml(e.formattedScore);
      return `
        <div class="ranking-row">
          <span class="rank-pos ${posClasses[idx] ?? ''}">${posLabels[idx] ?? `${idx + 1}TH`}</span>
          <span class="rank-name ${isEmpty ? 'is-empty' : ''}">${safeName}${e.cleared ? '<span class="rank-clear-mark">★</span>' : ''}</span>
          <span class="rank-score ${isEmpty ? 'is-empty' : ''}">${safeScore}</span>
        </div>
      `;
    })
    .join('');
}

let boards: Record<string, LeaderboardEntry[]> = {};

function entriesFor(slug: string, variantId?: string): LeaderboardEntry[] {
  return padEmptyEntries(GAME_LEADERBOARD_DEFS[slug], boards[getLeaderboardKey(slug, variantId)] ?? [], 5);
}

// ===== セクション要素 =====
const secOnline = document.querySelector<HTMLElement>('#section-online')!;
const gridOnline = document.querySelector<HTMLDivElement>('#grid-online')!;
const secRanking = document.querySelector<HTMLElement>('#section-ranking')!;
const gridRanking = document.querySelector<HTMLDivElement>('#grid-ranking')!;
const secOther = document.querySelector<HTMLElement>('#section-other')!;
const gridOther = document.querySelector<HTMLDivElement>('#grid-other')!;

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
  card.style.setProperty('--accent', game.accent);

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

  // オンライン開催中のバッジ (黒ボックス白文字: 試合進行中なら「対戦中」、待機・ロビーなら「募集中」)
  let onlineBadgeHtml = '';
  if (onlineStatus && onlineStatus.open) {
    const isPlaying = onlineStatus.phase === 'racing' || onlineStatus.players >= onlineStatus.max;
    const badgeText = isPlaying ? '対戦中' : `対戦相手を募集中(${onlineStatus.players}/${onlineStatus.max})`;
    onlineBadgeHtml = `
      <div class="card-online-badge">${badgeText}</div>
    `;
  }




  card.innerHTML = `
    <a class="card-link" href="games/${game.slug}/" aria-label="${game.title}を開く"></a>
    <div class="card-thumb-wrap">
      ${onlineBadgeHtml}
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

// 取得したランキングで、全カードの表示を更新する
async function refreshBoards() {
  boards = await loadAllLeaderboards();
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

    // 1. オンライン開催中のゲーム
    const onlineGames = games.filter((g) => statuses[g.slug]?.open === true);
    const onlineSlugs = new Set(onlineGames.map((g) => g.slug));

    // 2. ランキング対応ゲーム（オンライン開催中以外で hasScore: true）
    const rankingGames = games.filter(
      (g) => !onlineSlugs.has(g.slug) && GAME_LEADERBOARD_DEFS[g.slug]?.hasScore
    );
    const rankingSlugs = new Set(rankingGames.map((g) => g.slug));

    // 3. その他ゲーム（上記以外）
    const otherGames = games.filter(
      (g) => !onlineSlugs.has(g.slug) && !rankingSlugs.has(g.slug)
    );

    // 再描画前の選択中ゲームのslugを保持（再描画後に選択位置を確実に復元するため）
    const prevSelectedSlug = cards[current]?.dataset.slug;

    // グリッドとローテーターを初期化
    gridOnline.innerHTML = '';
    gridRanking.innerHTML = '';
    gridOther.innerHTML = '';
    rotators.length = 0;

    // オンライン対戦対応セクション（開催中ゲームがある時のみ表示）
    if (onlineGames.length > 0) {
      secOnline.style.display = '';
      onlineGames.forEach((g) => gridOnline.appendChild(createCard(g, statuses[g.slug])));
    } else {
      secOnline.style.display = 'none';
    }

    // ランキング対応セクション
    secRanking.style.display = rankingGames.length > 0 ? '' : 'none';
    rankingGames.forEach((g) => gridRanking.appendChild(createCard(g)));

    // その他セクション
    secOther.style.display = otherGames.length > 0 ? '' : 'none';
    otherGames.forEach((g) => gridOther.appendChild(createCard(g)));


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
  // 最上段(最初の行)のカードの場合はページ最上部までスクロールして「オンライン対戦対応」見出しを完全に見せる
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
      void renderSections(targetSlug, true);
    });
  } else {
    window.location.href = url;
  }
}

// ゲームをiframeで開いている間はハブ側入力を抑制
if (!isFramedHub) {
  createArcadeInput({
    onActivate() {
      if (!isGameFrameOpen()) setPadMode(true);
    },
    onMove(dx, dy) {
      if (!isGameFrameOpen()) moveSelection(dx, dy);
    },
    onConfirmDown() {
      if (isGameFrameOpen()) return;
      setPadMode(true);
      setPressed(true);
    },
    onConfirmUp() {
      if (!isGameFrameOpen()) launchSelected();
    },
  });
}

// オンライン開催状況の定期差分更新 (セクション構成が変わらない限りDOMを再生成せず、バッジの文字のみ更新)
// ユーザーのスクロール位置を絶対に勝手に戻さない
async function updateOnlineStatuses() {
  try {
    const statuses = await fetchAllOnlineStatuses();
    const onlineGames = games.filter((g) => statuses[g.slug]?.open === true);
    const newOnlineSlugs = new Set(onlineGames.map((g) => g.slug));

    const currentOnlineCards = Array.from(gridOnline.querySelectorAll<HTMLDivElement>('.card'));
    const currentOnlineSlugs = new Set(currentOnlineCards.map((c) => c.dataset.slug));

    const changed =
      newOnlineSlugs.size !== currentOnlineSlugs.size ||
      [...newOnlineSlugs].some((s) => !currentOnlineSlugs.has(s));

    if (changed) {
      // 開催状態が変わった場合のみ再描画 (自動スクロールは一切しない)
      await renderSections(null, false);
    } else {
      // 構成が変わらない通常時は、バッジのテキストだけをインプレース更新
      currentOnlineCards.forEach((card) => {
        const slug = card.dataset.slug;
        if (!slug) return;
        const status = statuses[slug];
        const badge = card.querySelector<HTMLElement>('.card-online-badge');
        if (badge && status) {
          const isPlaying = status.phase === 'racing' || status.players >= status.max;
          badge.textContent = isPlaying ? '対戦中' : `対戦相手を募集中(${status.players}/${status.max})`;
        }
      });
    }
  } catch {
    // 通信エラー時は無視
  }
}

if (!isFramedHub) {
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

  // ウィンドウフォーカス復帰時にも即座にステータスをチェック
  window.addEventListener('focus', () => {
    if (!isGameFrameOpen()) {
      void updateOnlineStatuses();
    }
  });
}
