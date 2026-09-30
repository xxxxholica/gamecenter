import { games } from './games';
import { createArcadeInput } from './arcadeInput';
import { mountArcadeGuide } from '../../shared/arcadeGuide';

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

// ===== 全ゲーム一覧 =====
const list = document.querySelector<HTMLDivElement>('#game-list')!;

games.forEach((game) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--accent', game.accent);
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
    </div>
  `;
  card.querySelector('.card-link')!.addEventListener('click', () => rememberLastGame(game.slug));
  list.appendChild(card);
});

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

function launchSelected() {
  const game = games[current];
  rememberLastGame(game.slug);
  window.location.href = `games/${game.slug}/`;
}

createArcadeInput({
  onActivate() {
    setPadMode(true);
  },
  onMove: moveSelection,
  onConfirmDown() {
    setPadMode(true);
    setPressed(true);
  },
  onConfirmUp: launchSelected,
});
