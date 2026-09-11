import { games } from './games';

const AUTO_ADVANCE_MS = 5000;

// ===== ピックアップ(全ゲームを順番に巡回するカルーセル) =====
const track = document.querySelector<HTMLDivElement>('#hero-track')!;
const dotsContainer = document.querySelector<HTMLDivElement>('#hero-dots')!;

games.forEach((game) => {
  const slide = document.createElement('div');
  slide.className = 'hero-slide';
  slide.style.setProperty('--accent', game.accent);
  slide.innerHTML = `
    <a class="hero-link" href="games/${game.slug}/" aria-label="${game.title}を開く"></a>
    <div class="hero-screen">
      <img class="hero-thumb" src="${game.demo}" alt="${game.title}のプレイ映像" loading="lazy" />
    </div>
    <div class="hero-info">
      <div class="hero-title-en">${game.englishTitle}</div>
      <h2 class="hero-title-ja">${game.title}</h2>
      <a class="hero-dev" href="${game.developer.url}" target="_blank" rel="noopener noreferrer">
        <img class="hero-dev-avatar" src="${game.developer.avatar}" alt="" loading="lazy" />
        <span class="hero-dev-name">@${game.developer.name}</span>
      </a>
      <p class="hero-desc">${game.description}</p>
    </div>
  `;
  track.appendChild(slide);

  const dot = document.createElement('button');
  dot.className = 'hero-dot';
  dot.type = 'button';
  dot.setAttribute('aria-label', game.title);
  dotsContainer.appendChild(dot);
});

const dots = Array.from(dotsContainer.querySelectorAll<HTMLButtonElement>('.hero-dot'));
let current = 0;
let timer: number;

function goTo(index: number) {
  current = (index + games.length) % games.length;
  track.style.transform = `translateX(-${current * 100}%)`;
  dots.forEach((dot, i) => dot.classList.toggle('active', i === current));
}

function restartAutoAdvance() {
  window.clearInterval(timer);
  timer = window.setInterval(() => goTo(current + 1), AUTO_ADVANCE_MS);
}

dots.forEach((dot, i) => {
  dot.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(i);
    restartAutoAdvance();
  });
});

goTo(0);
restartAutoAdvance();

// ===== 全ゲーム一覧 =====
const list = document.querySelector<HTMLDivElement>('#game-list')!;

games.forEach((game) => {
  const card = document.createElement('div');
  card.className = 'card';
  card.style.setProperty('--accent', game.accent);
  card.innerHTML = `
    <a class="card-link" href="games/${game.slug}/" aria-label="${game.title}を開く"></a>
    <img class="card-thumb" src="${game.demo}" alt="${game.title}のプレイ映像" loading="lazy" />
    <div class="card-body">
      <div class="card-title-en">${game.englishTitle}</div>
      <h2>${game.title}</h2>
      <a class="card-dev" href="${game.developer.url}" target="_blank" rel="noopener noreferrer">
        <img class="card-dev-avatar" src="${game.developer.avatar}" alt="" loading="lazy" />
        <span class="card-dev-name">@${game.developer.name}</span>
      </a>
      <p class="card-desc">${game.description}</p>
    </div>
  `;
  list.appendChild(card);
});
