import { games } from './games';
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

// ゲームのiframeの中に読み込まれたハブは、親にゲームを閉じさせるだけで何もしない
if (isFramedHub) initFramedHub();
listenGameFrameMessages();
mountFullscreenKey();

mountArcadeGuide({
  moveLabel: '選ぶ',
  // 決定は攻撃ボタン(0〜7)とSTART(9)のどれでもよいが、アイコンにはSTARTを代表として出す
  buttons: [{ indices: [9], label: '決定' }],
});

// ゲームから戻ったときに直前に遊んだゲームを選択状態で復元するためのキー
const LAST_GAME_KEY = 'gamecenter:lastGame';

function readLastGame(): string | null {
  try {
    return sessionStorage.getItem(LAST_GAME_KEY);
  } catch {
    return null;
  }
}

function rememberLastGame(slug: string) {
  try {
    sessionStorage.setItem(LAST_GAME_KEY, slug);
  } catch {
    // 保存できなくても選択位置が復元されないだけなので無視する
  }
}

// ===== ランキングHTML生成 =====
/** クリアした記録は、名前のすぐ右に ★ を付けて表示する */
function renderRowsHtml(entries: LeaderboardEntry[]): string {
  const top3 = entries.slice(0, 3);
  const posLabels = ['1ST', '2ND', '3RD'];
  const posClasses = ['gold', 'silver', 'bronze'];

  return top3
    .map((e, idx) => {
      const isEmpty = e.name === '記録なし';
      const safeName = escapeHtml(e.name);
      const safeScore = escapeHtml(e.formattedScore);
      return `
        <div class="ranking-row">
          <span class="rank-pos ${posClasses[idx] ?? ''}">${posLabels[idx] ?? `${idx + 1}TH`}</span>
          <span class="rank-name ${isEmpty ? 'is-empty' : ''}">${safeName}${e.cleared ? '<span class="rank-clear-mark">★</span>' : ''}${e.dev ? '<span class="rank-dev-mark">♛</span>' : ''}</span>
          <span class="rank-score ${isEmpty ? 'is-empty' : ''}">${safeScore}</span>
        </div>
      `;
    })
    .join('');
}

// ランキングはサーバーから取得する。取得するまで・失敗したときは「記録なし」の枠で表示する
let boards: Record<string, LeaderboardEntry[]> = {};

function entriesFor(slug: string, variantId?: string): LeaderboardEntry[] {
  return padEmptyEntries(GAME_LEADERBOARD_DEFS[slug], boards[getLeaderboardKey(slug, variantId)] ?? [], 3);
}

// ===== 全ゲーム一覧 =====
const list = document.querySelector<HTMLDivElement>('#game-list')!;

// コース/難易度バリアントを持つカードのローテーション管理
interface VariantRotator {
  slug: string;
  variantIndex: number;
  tagEl: HTMLElement;
  rowsEl: HTMLElement;
}
const rotators: VariantRotator[] = [];

games.forEach((game) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--accent', game.accent);

  const def = GAME_LEADERBOARD_DEFS[game.slug];
  let rankingHtml = '';

  if (def && def.hasScore) {
    const hasVariants = def.variants && def.variants.length > 0;
    const initialVariant = hasVariants ? def.variants![0] : undefined;
    const entries = entriesFor(game.slug, initialVariant?.id);
    // 見出しの右の小さなタグは、バリエーション(コース/難易度)の名前
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
    // スコアリングなし(対戦専用): ランキングボードを表示しつつグレーアウト
    const entries = entriesFor(game.slug);
    rankingHtml = `
      <div class="card-ranking-container is-disabled" data-slug="${game.slug}">
        <div class="ranking-header">
          <span class="ranking-title">ランキング</span>
        </div>
        <div class="ranking-rows" id="rows-${game.slug}">
          ${renderRowsHtml(entries)}
        </div>
      </div>
    `;
  }

  card.innerHTML = `
    <a class="card-link" href="games/${game.slug}/" aria-label="${game.title}を開く"></a>
    <img class="card-thumb" src="${game.thumbnail}" alt="${game.title}のスクリーンショット" loading="lazy" />
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
  card.querySelector('.card-link')!.addEventListener('click', (e) => {
    rememberLastGame(game.slug);
    // 全画面中はページ移動で解除されないよう、iframeで開く
    if (shouldOpenInFrame()) {
      e.preventDefault();
      launchSelected(game.slug);
    }
  });
  list.appendChild(card);

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
});

// 取得したランキングで、全カードの表示を更新する(バリアントのあるカードは、いま出しているバリアントの分)
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
void refreshBoards();

// ===== 時間経過でコース/難易度ランキングをローテーション切替 (4秒間隔) =====
const ROTATION_INTERVAL_MS = 4000;
let rotationTimer: number | null = null;

function rotateVariants() {
  rotators.forEach((rotator) => {
    const def = GAME_LEADERBOARD_DEFS[rotator.slug];
    if (!def || !def.variants || def.variants.length <= 1) return;

    // フェードアウト
    rotator.rowsEl.classList.add('fading');
    rotator.tagEl.style.opacity = '0';

    setTimeout(() => {
      rotator.variantIndex = (rotator.variantIndex + 1) % def.variants!.length;
      const curVariant = def.variants![rotator.variantIndex];
      const entries = entriesFor(rotator.slug, curVariant.id);

      rotator.tagEl.textContent = curVariant.label;
      rotator.rowsEl.innerHTML = renderRowsHtml(entries);

      // フェードイン
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

// 画面がアクティブな時だけタイマーを動かす
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopRotation();
  else {
    startRotation();
    void refreshBoards();   // ゲームで記録した後に戻ってきたときのため
  }
});
// 戻るボタン(bfcache)で復元されたときも最新にする
window.addEventListener('pageshow', (e) => {
  if (e.persisted) void refreshBoards();
});
startRotation();

const cards = Array.from(list.querySelectorAll<HTMLDivElement>('.card'));

// ===== 選択状態 =====
let current = 0;

function setPressed(pressed: boolean) {
  cards[current]?.classList.toggle('pressed', pressed);
}

function goTo(index: number) {
  // 決定ボタンを押したままレバーを動かしたときは、押下演出も新しい選択先へ移す
  const pressed = cards[current]?.classList.contains('pressed') ?? false;
  setPressed(false);
  current = (index + games.length) % games.length;
  setPressed(pressed);
  cards.forEach((card, i) => card.classList.toggle('selected', i === current));
}

const lastIndex = games.findIndex((game) => game.slug === readLastGame());
goTo(lastIndex >= 0 ? lastIndex : 0);
if (lastIndex > 0) {
  cards[current]?.scrollIntoView({ block: 'nearest' });
}

// ===== アケコン / キーボード操作 =====
// マウスを動かすと通常表示に戻す。アケコン/キー操作中はカーソルとhover表現を消して選択枠を出す。
function setPadMode(on: boolean) {
  document.body.classList.toggle('pad-mode', on);
}

window.addEventListener('mousemove', (e) => {
  // 一部ブラウザはカーソル表示切替やスクロール時にも移動量0のmousemoveを送るため、実際に動いたときだけ解除する
  if (e.movementX !== 0 || e.movementY !== 0) setPadMode(false);
});

// 一覧は画面幅で列数が変わるため、上下移動の幅は実際のレイアウトから数える
function gridColumns(): number {
  const top = cards[0]?.offsetTop;
  const cols = cards.filter((card) => card.offsetTop === top).length;
  return Math.max(1, cols);
}

function moveSelection(dx: number, dy: number) {
  setPadMode(true);
  if (dx !== 0) {
    goTo(current + dx);
  } else if (dy !== 0) {
    const next = current + dy * gridColumns();
    // 縦方向は折り返さず端で止める
    if (next >= 0 && next < games.length) goTo(next);
  }
  cards[current].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// ブラウザの「戻る」で bfcache から復元されたときに押下演出が残らないようにする
window.addEventListener('pageshow', (e) => {
  if (e.persisted) setPressed(false);
});

function launchSelected(slug = games[current].slug) {
  rememberLastGame(slug);
  const url = `games/${slug}/`;
  if (shouldOpenInFrame()) {
    openGameFrame(url, () => {
      setPressed(false);
      void refreshBoards();   // ゲームで記録した分を反映する
    });
  } else {
    window.location.href = url;
  }
}

// ゲームをiframeで開いている間は、ゲーム側の操作(アケコン・キー)にハブが反応しないようにする
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
