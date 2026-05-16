/* ===================================================
   app.js — Tarot 52 (single page app)
   =================================================== */

/* -----------------------------------------------
   Tarot data & helpers
----------------------------------------------- */
const RANKS = ['Ace','2','3','4','5','6','7','8','9','10','Jack','Queen','King'];
const SUITS = [
  { name: 'Clubs',    symbol: '♣', cls: 'suit-black' },
  { name: 'Hearts',   symbol: '♥', cls: 'suit-red'   },
  { name: 'Spades',   symbol: '♠', cls: 'suit-black' },
  { name: 'Diamonds', symbol: '♦', cls: 'suit-red'   },
];
const MEANINGS = [
  ['Inspiration',  'Emotion',       'Lucidity',     'Opportunity' ],
  ['Decision',     'Unity',         'Impasse',       'Juggling'    ],
  ['Progress',     'Collaboration', 'Heartbreak',    'Teamwork'    ],
  ['Celebration',  'Apathy',        'Rest',          'Conservation'],
  ['Struggle',     'Regret',        'Conflict',      'Poverty'     ],
  ['Success',      'Nostalgia',     'Transition',    'Generosity'  ],
  ['Challenge',    'Options',       'Betrayal',      'Planning'    ],
  ['Movement',     'Abandonment',   'Captive',       'Practice'    ],
  ['Resilience',   'Contentment',   'Anxiety',       'Sufficiency' ],
  ['Burden',       'Bliss',         'Defeat',        'Prosperity'  ],
  ['Enthusiasm',   'Creativity',    'Curiosity',     'Manifestation'],
  ['Courage',      'Compassion',    'Independence',  'Practicality'],
  ['Leadership',   'Balance',       'Intellect',     'Stability'   ],
];

function secureRandom(max) {
  const buf = new Uint32Array(1);
  window.crypto.getRandomValues(buf);
  return buf[0] % max;
}

/** Fisher-Yates shuffle using crypto RNG */
function shuffleDeck() {
  const deck = [];
  for (let r = 0; r < RANKS.length; r++) {
    for (let s = 0; s < SUITS.length; s++) {
      deck.push({ r, s });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = secureRandom(i + 1);
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Build a single 3-D card element */
function buildCard3D(rankIdx, suitIdx) {
  const rank = RANKS[rankIdx];
  const suit = SUITS[suitIdx];
  const meaning = MEANINGS[rankIdx][suitIdx];

  const wrapper = document.createElement('div');
  wrapper.className = 'card-3d';
  wrapper.setAttribute('role', 'button');
  wrapper.setAttribute('tabindex', '0');
  wrapper.setAttribute('aria-label', `Draw card`);
  wrapper.dataset.rank    = rankIdx;
  wrapper.dataset.suit    = suitIdx;
  wrapper.dataset.meaning = meaning;

  wrapper.innerHTML = `
    <div class="card-inner">
      <div class="card-face card-back-face">
        <div class="card-ornament">✦</div>
      </div>
      <div class="card-face card-front-face ${suit.cls}">
        <div class="card-corner tl">
          <span class="rank-label">${rank}</span>
          <span class="suit-label">${suit.symbol}</span>
        </div>
        <div class="card-center-suit">${suit.symbol}</div>
        <div class="card-corner br" aria-hidden="true">
          <span class="rank-label">${rank}</span>
          <span class="suit-label">${suit.symbol}</span>
        </div>
      </div>
    </div>
  `;
  return wrapper;
}

/** Wire the full 52-card spread interaction, allowing up to `limit` flips */
function initTarotSpread(spreadEl, readingEl, limit) {
  const hand = shuffleDeck();
  const flipped = [];

  spreadEl.innerHTML = '';

  const renderReading = () => {
    if (flipped.length === 0) {
      const noun = limit === 1 ? 'a card' : `${limit} cards`;
      readingEl.innerHTML = `<p class="reading-prompt">Choose ${noun} from the spread above.</p>`;
      return;
    }
    const rows = flipped.map(({ r, s }) => {
      const suit = SUITS[s];
      return `
        <div class="reading-row ${suit.cls}">
          <span class="reading-suit-icon">${suit.symbol}</span>
          <span class="reading-card-name">${RANKS[r]} of ${suit.name}</span>
          <span class="reading-meaning">${MEANINGS[r][s]}</span>
        </div>
      `;
    }).join('');
    const heading = flipped.length < limit
      ? `<p class="reading-prompt">${flipped.length} of ${limit} drawn.</p>`
      : '';
    readingEl.innerHTML = heading + `<div class="reading-list">${rows}</div>`;
  };

  hand.forEach(({ r, s }) => {
    const card = buildCard3D(r, s);

    const flip = () => {
      if (card.classList.contains('flipped')) return;
      if (flipped.length >= limit) return;

      card.classList.add('flipped', 'selected');
      card.setAttribute('aria-label', `${RANKS[r]} of ${SUITS[s].name}`);
      flipped.push({ r, s });

      if (flipped.length >= limit) {
        spreadEl.querySelectorAll('.card-3d:not(.flipped)').forEach(c => c.classList.add('dimmed'));
      }

      renderReading();
    };

    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    spreadEl.appendChild(card);
  });

  renderReading();
}

/** Fibonacci numbers in [1, 51] */
function fibUpTo(max) {
  const out = [];
  let a = 1, b = 2;
  out.push(a);
  while (b <= max) {
    out.push(b);
    [a, b] = [b, a + b];
  }
  return out;
}

/* -----------------------------------------------
   Boot — wire up controls inside an already-rendered
   sidebar-spread root (markup lives in
   sidebar-spread.html and is injected by index.html).
----------------------------------------------- */
function bootSidebarSpread(rootEl) {
  const spreadEl   = rootEl.querySelector('#tarotSpread');
  const readingEl  = rootEl.querySelector('#tarotReading');
  const drawCount  = rootEl.querySelector('#drawCount');
  const newBtn     = rootEl.querySelector('#newReadingBtn');

  if (!spreadEl || !readingEl || !drawCount || !newBtn) {
    console.warn('[sidebar-spread] missing expected elements in root');
    return;
  }

  // Populate Fibonacci draw-count options if not already present.
  if (drawCount.options.length === 0) {
    fibUpTo(51).forEach(n => {
      const opt = document.createElement('option');
      opt.value = String(n);
      opt.textContent = String(n);
      drawCount.appendChild(opt);
    });
  }

  const start = () => initTarotSpread(spreadEl, readingEl, parseInt(drawCount.value, 10));

  start();
  drawCount.addEventListener('change', start);
  newBtn.addEventListener('click', start);
}

// Expose for the index.html bootstrap to call after injection.
window.bootSidebarSpread = bootSidebarSpread;

// Standalone mode: if sidebar-spread.html is opened directly,
// markup will already be in the DOM at load time.
window.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('.sidebar-spread-root');
  if (root && !root.dataset.booted) {
    root.dataset.booted = '1';
    bootSidebarSpread(root);
  }
});
