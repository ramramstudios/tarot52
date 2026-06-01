/* ===================================================
   lore.js — Tarot 52 lore page
   Renders a table mapping the 52 poker cards to their
   Rider-Waite Smith tarot counterparts.
   =================================================== */

const SUIT_SYMBOLS = { Clubs: '♣', Hearts: '♥', Spades: '♠', Diamonds: '♦' };
const SUIT_COLOR_CLASS = { Hearts: 'suit-red', Diamonds: 'suit-red', Clubs: 'suit-black', Spades: 'suit-black' };
const CARD_DISPLAY_RANKS = { Ace: 'A', Jack: 'J', Queen: 'Q', King: 'K' };

function parsePoker(poker) {
  // "3 of Hearts" / "Ace of Spades" / "Jack of Clubs"
  const m = poker.match(/^(.+?) of (Clubs|Hearts|Spades|Diamonds)$/);
  if (!m) return { rank: poker, suit: '' };
  return { rank: m[1], suit: m[2] };
}

function getCardDisplayRank(rank) {
  return CARD_DISPLAY_RANKS[rank] || rank;
}

async function loadLore() {
  const res = await fetch('lore.json');
  if (!res.ok) throw new Error(`Failed to load lore.json: ${res.status}`);
  return res.json();
}

function buildRow(card) {
  const { rank, suit } = parsePoker(card.poker);
  const displayRank = getCardDisplayRank(rank);
  const symbol = SUIT_SYMBOLS[suit] || '';
  const colorCls = SUIT_COLOR_CLASS[suit] || '';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td class="col-card">
      <span class="poker-rank">${displayRank}</span>
      <span class="poker-suit ${colorCls}">${symbol}</span>
    </td>
    <td class="col-term">${card.term}</td>
    <td class="col-tarot">${card.tarot}</td>
    <td class="col-desc">${card.description}</td>
  `;
  return tr;
}

function buildSection(suitName, cards, suitMeta = {}) {
  const wrap = document.createElement('section');
  wrap.className = 'lore-section';
  const symbol = suitMeta.symbol || SUIT_SYMBOLS[suitName];
  const colorCls = SUIT_COLOR_CLASS[suitName];
  const tarotSuit = suitMeta.tarot || '';
  const element = suitMeta.element ? suitMeta.element.toLowerCase() : '';
  const suitLabel = tarotSuit && element
    ? `${suitName} ↔ ${tarotSuit} (${element})`
    : suitName;
  wrap.innerHTML = `
    <h2 class="lore-section-title">
      <span class="lore-suit-symbol ${colorCls}">${symbol}</span>
      <span>${suitLabel}</span>
    </h2>
    <table class="lore-table">
      <thead>
        <tr>
          <th class="col-card">Card</th>
          <th class="col-term">Term</th>
          <th class="col-tarot">Rider-Waite Tarot</th>
          <th class="col-desc">Description</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;
  const tbody = wrap.querySelector('tbody');
  cards.forEach(c => tbody.appendChild(buildRow(c)));
  return wrap;
}

function renderError(err) {
  const main = document.getElementById('app');
  main.innerHTML = `
    <section class="page">
      <header class="page-header">
        <h1>Lore</h1>
      </header>
      <p style="color: var(--text-muted); text-align: center;">Couldn't load lore: ${err.message}</p>
    </section>
  `;
}

function initBackToSpread(page) {
  const backLink = page.querySelector('#backToSpread');
  if (!backLink) return;

  backLink.addEventListener('click', (e) => {
    let referrerUrl;
    try {
      referrerUrl = document.referrer ? new URL(document.referrer) : null;
    } catch {
      referrerUrl = null;
    }

    const cameFromSpread = referrerUrl
      && referrerUrl.origin === window.location.origin
      && /(?:^|\/)(?:index\.html)?$/.test(referrerUrl.pathname);

    if (cameFromSpread && window.history.length > 1) {
      e.preventDefault();
      window.history.back();
    }
  });
}

async function render() {
  let lore;
  try {
    lore = await loadLore();
  } catch (err) {
    renderError(err);
    return;
  }

  const grouped = { Clubs: [], Hearts: [], Spades: [], Diamonds: [] };
  lore.cards.forEach(c => {
    const { suit } = parsePoker(c.poker);
    if (grouped[suit]) grouped[suit].push(c);
  });

  const page = document.createElement('section');
  page.className = 'page page-lore';
  page.innerHTML = `
    <nav class="page-nav">
      <a class="nav-link" href="index.html" id="backToSpread">← Back to spread</a>
    </nav>
    <header class="page-header">
      <h1>Lore</h1>
      <p class="page-subtitle">How the 52 poker cards map to the Rider-Waite Smith Tarot.</p>
    </header>
    <div class="lore-intro">
      <p>${lore._about}</p>
    </div>
    <div class="lore-suits-grid" id="loreBody"></div>
  `;

  const body = page.querySelector('#loreBody');
  ['Clubs', 'Hearts', 'Spades', 'Diamonds'].forEach(suit => {
    body.appendChild(buildSection(suit, grouped[suit], lore.suits?.[suit]));
  });

  const main = document.getElementById('app');
  main.innerHTML = '';
  main.appendChild(page);
  initBackToSpread(page);
}

window.addEventListener('DOMContentLoaded', render);
