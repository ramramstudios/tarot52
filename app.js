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

/** Wire the 5-card spread interaction */
function initTarotSpread(spreadEl, readingEl) {
  const deck = shuffleDeck();
  const hand = deck.slice(0, 5);
  const ROTATE = [-6, -3, 0, 3, 6];

  spreadEl.innerHTML = '';

  hand.forEach(({ r, s }, i) => {
    const card = buildCard3D(r, s);
    card.style.transform = `rotate(${ROTATE[i]}deg)`;
    card.style.setProperty('--rot', `${ROTATE[i]}deg`);

    const flip = () => {
      if (card.classList.contains('flipped')) return;
      const isAnyFlipped = spreadEl.querySelector('.flipped');
      if (isAnyFlipped) return;

      card.classList.add('flipped', 'selected');
      card.style.transform = 'translateY(-8px) scale(1.08)';
      card.setAttribute('aria-label', `${RANKS[r]} of ${SUITS[s].name}`);

      spreadEl.querySelectorAll('.card-3d').forEach(c => {
        if (c !== card) c.classList.add('dimmed');
      });

      const suit = SUITS[s];
      const meaning = MEANINGS[r][s];
      readingEl.innerHTML = `
        <div class="reading-suit-icon">${suit.symbol}</div>
        <div class="reading-card-name">${RANKS[r]} of ${suit.name}</div>
        <div class="reading-meaning">${meaning}</div>
      `;
    };

    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    spreadEl.appendChild(card);
  });

  readingEl.innerHTML = `<p class="reading-prompt">Choose a card from the spread above.</p>`;
}

/* -----------------------------------------------
   Page render
----------------------------------------------- */
function renderTarot() {
  const el = document.createElement('section');
  el.className = 'page page-tarot';
  el.innerHTML = `
    <header class="page-header">
      <h1>Tarot 52</h1>
      <p class="page-subtitle">Choose a card — let the deck decide.</p>
    </header>

    <div class="tarot-spread" id="tarotSpread"></div>

    <div class="tarot-reading" id="tarotReading">
      <p class="reading-prompt">Choose a card from the spread above.</p>
    </div>

    <div class="tarot-controls">
      <button class="btn-primary" id="newReadingBtn">New Spread</button>
    </div>

    <img class="tarot-image" src="tarot52.png" alt="Tarot 52" loading="lazy" />
  `;

  const spreadEl  = el.querySelector('#tarotSpread');
  const readingEl = el.querySelector('#tarotReading');

  initTarotSpread(spreadEl, readingEl);

  el.querySelector('#newReadingBtn').addEventListener('click', () => {
    initTarotSpread(spreadEl, readingEl);
  });

  return el;
}

/* -----------------------------------------------
   Bootstrap
----------------------------------------------- */
window.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  app.appendChild(renderTarot());
});
