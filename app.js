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

const TAROT_SUIT_NAMES = {
  Clubs: 'Wands',
  Hearts: 'Cups',
  Spades: 'Swords',
  Diamonds: 'Pentacles',
};
const TAROT_RANK_NAMES = {
  Ace: 'Ace',
  Jack: 'Page',
  Queen: 'Queen',
  King: 'King',
};

const READING_MODES = {
  1: {
    count: 1,
    label: 'General Insight',
    shortLabel: '1-card lens',
    intro: 'A single card gives the whole inquiry one symbolic lens.',
    positions: [
      {
        name: 'Lens',
        prompt: 'Read this card as the overarching context, mood, or symbolic pressure shaping the inquiry.',
      },
    ],
    systemPrompt: [
      'You are Tarot 52, a reflective tarot-reading assistant.',
      'The querent selected a one-card General Insight reading.',
      'Use the selected card as the central lens for the inquiry.',
      'Do not predict fixed outcomes. Offer grounded, symbolic perspective that helps the querent think.',
    ].join(' '),
  },
  2: {
    count: 2,
    label: 'Crossroads',
    shortLabel: '2-card choice',
    intro: 'Two cards frame a binary choice, contrast, or fork in the road.',
    positions: [
      {
        name: 'Path A',
        prompt: 'Read this card as the energy, cost, invitation, or likely lesson of the first option.',
      },
      {
        name: 'Path B',
        prompt: 'Read this card as the energy, cost, invitation, or likely lesson of the second option.',
      },
    ],
    systemPrompt: [
      'You are Tarot 52, a reflective tarot-reading assistant.',
      'The querent selected a two-card Crossroads reading.',
      'Interpret card one as Path A and card two as Path B. If the querent named two options, map them in the order they were named.',
      'Compare the paths without declaring one absolutely correct. Help the querent notice tradeoffs, fears, desires, and practical next questions.',
    ].join(' '),
  },
  3: {
    count: 3,
    label: 'Past / Present / Future',
    shortLabel: '3-card timeline',
    intro: 'Three cards place the inquiry along a past, present, and future timeline.',
    positions: [
      {
        name: 'Past',
        prompt: 'Read this card as the background pattern, previous influence, or memory still shaping the inquiry.',
      },
      {
        name: 'Present',
        prompt: 'Read this card as the current pressure, choice, opportunity, or emotional weather.',
      },
      {
        name: 'Future',
        prompt: 'Read this card as the direction the pattern could grow toward if met consciously.',
      },
    ],
    systemPrompt: [
      'You are Tarot 52, a reflective tarot-reading assistant.',
      'The querent selected a Past / Present / Future reading.',
      'Interpret card one as Past, card two as Present, and card three as Future.',
      'Treat the future as an emerging tendency rather than a prediction. Connect the cards to the querent inquiry in plain, useful language.',
    ].join(' '),
  },
};

function getReadingMode(count) {
  return READING_MODES[count] || READING_MODES[1];
}

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

function getCardPayload(rankIdx, suitIdx, positionIndex = 0, mode = getReadingMode(1)) {
  const rank = RANKS[rankIdx];
  const suit = SUITS[suitIdx];
  const tarotRank = TAROT_RANK_NAMES[rank] || rank;
  const position = mode.positions[positionIndex] || {
    name: `Card ${positionIndex + 1}`,
    prompt: 'Read this card in the order it was drawn.',
  };

  return {
    rank,
    suit: suit.name,
    symbol: suit.symbol,
    colorClass: suit.cls,
    name: `${rank} of ${suit.name}`,
    term: MEANINGS[rankIdx][suitIdx],
    tarot: `${tarotRank} of ${TAROT_SUIT_NAMES[suit.name]}`,
    positionIndex,
    positionName: position.name,
    positionPrompt: position.prompt,
  };
}

function dispatchTarotEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(`tarot52:${name}`, { detail }));
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
function initTarotSpread(spreadEl, readingEl, mode) {
  const hand = shuffleDeck();
  const flipped = [];
  const limit = mode.count;
  let inquiryReady = false;

  spreadEl.innerHTML = '';
  spreadEl.classList.add('tarot-spread-locked');

  const renderReading = () => {
    if (flipped.length === 0) {
      readingEl.innerHTML = inquiryReady
        ? `<p class="reading-prompt">Choose ${limit === 1 ? 'a card' : `${limit} cards`} for your ${mode.label} reading.</p>`
        : `<p class="reading-prompt">Type your inquiry in the chat before drawing cards.</p>`;
      return;
    }
    const rows = flipped.map((card) => {
      return `
        <div class="reading-row ${card.colorClass}">
          <span class="reading-suit-icon">${card.symbol}</span>
          <span class="reading-position">${card.positionName}</span>
          <span class="reading-card-name">${card.name}</span>
          <span class="reading-meaning">${card.term}</span>
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
      if (!inquiryReady) {
        dispatchTarotEvent('drawblocked', { mode });
        return;
      }
      if (card.classList.contains('flipped')) return;
      if (flipped.length >= limit) return;

      card.classList.add('flipped', 'selected');
      card.setAttribute('aria-label', `${RANKS[r]} of ${SUITS[s].name}`);
      const payload = getCardPayload(r, s, flipped.length, mode);
      flipped.push(payload);
      dispatchTarotEvent('carddrawn', {
        card: payload,
        cards: flipped.slice(),
        mode,
        remaining: Math.max(0, limit - flipped.length),
      });

      if (flipped.length >= limit) {
        spreadEl.querySelectorAll('.card-3d:not(.flipped)').forEach(c => c.classList.add('dimmed'));
        dispatchTarotEvent('readingcomplete', {
          mode,
          cards: flipped.slice(),
        });
      }

      renderReading();
    };

    card.addEventListener('click', flip);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    spreadEl.appendChild(card);
  });

  renderReading();

  return {
    setInquiryReady(isReady) {
      inquiryReady = Boolean(isReady);
      spreadEl.classList.toggle('tarot-spread-locked', !inquiryReady);
      renderReading();
    },
  };
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

  let spreadSession = null;

  // Populate available reading-mode options if not already present.
  if (drawCount.options.length === 0) {
    Object.values(READING_MODES).forEach((mode) => {
      const opt = document.createElement('option');
      opt.value = String(mode.count);
      opt.textContent = `${mode.count} - ${mode.label}`;
      drawCount.appendChild(opt);
    });
  }

  const start = (reason = 'reset') => {
    const mode = getReadingMode(parseInt(drawCount.value, 10));
    spreadSession = initTarotSpread(spreadEl, readingEl, mode);
    dispatchTarotEvent('modechange', { mode, reason });
  };

  window.addEventListener('tarot52:inquiryready', () => {
    if (spreadSession) spreadSession.setInquiryReady(true);
  });

  start('initial');
  drawCount.addEventListener('change', () => start('modechange'));
  newBtn.addEventListener('click', () => start('newspread'));
}

// Expose for the index.html bootstrap to call after injection.
window.bootSidebarSpread = bootSidebarSpread;
window.Tarot52ReadingModes = READING_MODES;
window.getTarot52ReadingMode = getReadingMode;
window.getTarot52CardPayload = getCardPayload;

// Standalone mode: if sidebar-spread.html is opened directly,
// markup will already be in the DOM at load time.
window.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('.sidebar-spread-root');
  if (root && !root.dataset.booted) {
    root.dataset.booted = '1';
    bootSidebarSpread(root);
  }
});
