/* ===================================================
   chat.js — Tarot 52 chat scaffold
   Builds the eventual LLM payload and renders a mock
   response until a model endpoint is wired in.
   =================================================== */

const SESSION_MODE_KEY = 'tarot52.activeModeCount';
const SESSION_COLLAPSED_KEY = 'tarot52.sidebarCollapsed';
const ASTROLOGY_PROFILE_KEY = 'tarot52.astrologyProfile';
const ZODIAC_SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
];

function readSessionInt(key) {
  try {
    const value = parseInt(sessionStorage.getItem(key) || '', 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function readSessionBool(key) {
  try {
    const value = sessionStorage.getItem(key);
    if (value === 'true') return true;
    if (value === 'false') return false;
    return null;
  } catch {
    return null;
  }
}

function writeSessionValue(key, value) {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // Ignore private browsing / storage-denied cases; the app still works.
  }
}

function normalizeAstrologyProfile(profile = {}) {
  const normalized = {};
  ['sun', 'moon', 'rising'].forEach((key) => {
    const value = typeof profile[key] === 'string' ? profile[key] : '';
    if (ZODIAC_SIGNS.includes(value)) normalized[key] = value;
  });
  return normalized;
}

function hasAstrologyProfile(profile) {
  return Boolean(profile && Object.keys(profile).length);
}

function readAstrologyProfile() {
  try {
    const raw = localStorage.getItem(ASTROLOGY_PROFILE_KEY);
    if (!raw) return {};
    return normalizeAstrologyProfile(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeAstrologyProfile(profile) {
  const normalized = normalizeAstrologyProfile(profile);
  try {
    if (hasAstrologyProfile(normalized)) {
      localStorage.setItem(ASTROLOGY_PROFILE_KEY, JSON.stringify(normalized));
    } else {
      localStorage.removeItem(ASTROLOGY_PROFILE_KEY);
    }
  } catch {
    // Ignore storage-denied cases; the in-memory profile still works.
  }
  return normalized;
}

function clearAstrologyProfile() {
  try {
    localStorage.removeItem(ASTROLOGY_PROFILE_KEY);
  } catch {
    // Ignore storage-denied cases.
  }
  return {};
}

async function loadLoreIndex() {
  const res = await fetch('lore.json');
  if (!res.ok) throw new Error(`Failed to load lore.json: ${res.status}`);
  const lore = await res.json();
  const cards = new Map();
  lore.cards.forEach((card) => cards.set(card.poker, card));
  return cards;
}

async function loadKnowledgeBase() {
  const manifestRes = await fetch('knowledge/manifest.json');
  if (!manifestRes.ok) throw new Error(`Failed to load knowledge manifest: ${manifestRes.status}`);

  const manifest = await manifestRes.json();
  const documents = Array.isArray(manifest.documents) ? manifest.documents : [];
  const loaded = await Promise.all(documents.map(async (doc) => {
    const path = doc.path || '';
    if (!path || path.includes('..')) return null;

    const docRes = await fetch(`knowledge/${path}`);
    if (!docRes.ok) throw new Error(`Failed to load knowledge/${path}: ${docRes.status}`);

    return {
      title: doc.title || path,
      path: `knowledge/${path}`,
      content: await docRes.text(),
    };
  }));

  return loaded.filter(Boolean);
}

async function loadZodiacKnowledge() {
  const res = await fetch('knowledge/zodiac.json');
  if (!res.ok) throw new Error(`Failed to load zodiac.json: ${res.status}`);
  const data = await res.json();
  return {
    signs: data && typeof data.signs === 'object' ? data.signs : {},
    elements: data && typeof data.elements === 'object' ? data.elements : {},
  };
}

function buildAstrologyContext(profile, zodiacKnowledge) {
  if (!hasAstrologyProfile(profile) || !zodiacKnowledge) return null;

  const placements = {};
  ['sun', 'moon', 'rising'].forEach((slot) => {
    const sign = profile[slot];
    const signData = sign && zodiacKnowledge.signs?.[sign];
    if (!signData) return;

    const element = signData.element || '';
    const elementData = element ? zodiacKnowledge.elements?.[element] : null;
    placements[slot] = {
      sign,
      element,
      meaning: signData[slot] || '',
      elementContext: elementData ? {
        traits: Array.isArray(elementData.traits) ? elementData.traits.slice() : [],
        relationships: elementData.relationships || '',
        values: Array.isArray(elementData.values) ? elementData.values.slice() : [],
        selfCare: elementData.self_care || '',
      } : null,
    };
  });

  return Object.keys(placements).length ? { placements } : null;
}

function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (match ? match[1] : text).trim();
}

// Clean markdown syntax while preserving intentional paragraph breaks and rhythm.
// The system prompt now licenses varied response shapes (single sentence to
// paragraphs to structured lists), so we preserve breaks that serve the prose.
function stripMarkdown(text) {
  if (!text) return '';
  return text
    // Strip ATX headers: leading #, ##, ### ...
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    // Strip horizontal rules: ---, ***, ___
    .replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, '')
    // Strip bullet markers at line start: -, *, + followed by space
    // Preserve the content after the marker; bullets will collapse naturally
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    // Strip ordered list markers: 1. 2. ... but preserve the line break
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    // Strip bold/italic markers: **foo**, __foo__, *foo*, _foo_
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
    // Strip inline code backticks (keep content)
    .replace(/`([^`]+)`/g, '$1')
    // Preserve intentional paragraph breaks (double newlines become \n\n)
    // but collapse accidental ones (single newlines become spaces within paragraphs)
    .replace(/[ \t]*\n[ \t]*\n[ \t]*/g, '\n\n') // normalize double newlines
    .replace(/[ \t]*\n[ \t]*/g, ' ') // collapse single newlines to space
    .replace(/[ \t]{2,}/g, ' ') // collapse multiple spaces
    .trim();
}

const COPY_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="8" y="8" width="10" height="10" rx="2"></rect>
    <path d="M6 16H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
`;

const CHECK_ICON = `
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="m5 12 4 4L19 6"></path>
  </svg>
`;

function fallbackCopyText(text) {
  const activeElement = document.activeElement;
  const scratch = document.createElement('textarea');
  scratch.value = text;
  scratch.setAttribute('readonly', '');
  scratch.style.position = 'fixed';
  scratch.style.top = '-1000px';
  scratch.style.left = '-1000px';
  scratch.style.opacity = '0';
  document.body.appendChild(scratch);
  scratch.focus();
  scratch.select();
  scratch.setSelectionRange(0, scratch.value.length);

  try {
    return document.execCommand('copy');
  } finally {
    scratch.remove();
    if (activeElement && typeof activeElement.focus === 'function') {
      activeElement.focus();
    }
  }
}

async function copyText(text) {
  const value = String(text || '');
  if (!value.trim()) return false;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (err) {
      console.warn('[chat] navigator.clipboard failed; trying fallback copy', err);
    }
  }

  try {
    const copied = fallbackCopyText(value);
    if (!copied) console.warn('[chat] fallback copy command was not accepted');
    return copied;
  } catch (err) {
    console.warn('[chat] copy failed', err);
    return false;
  }
}

function setCopyButtonState(button, state, label, title) {
  clearTimeout(button._copyResetTimer);
  button.classList.toggle('is-copied', state === 'copied');
  button.classList.toggle('is-error', state === 'error');

  if (state === 'copied') {
    button.innerHTML = CHECK_ICON;
    button.setAttribute('aria-label', 'Copied!');
    button.setAttribute('title', 'Copied!');
  } else if (state === 'error') {
    button.innerHTML = COPY_ICON;
    button.setAttribute('aria-label', 'Copy failed');
    button.setAttribute('title', 'Copy failed');
  } else {
    button.innerHTML = COPY_ICON;
    button.setAttribute('aria-label', label);
    button.setAttribute('title', title);
  }

  if (state !== 'idle') {
    button._copyResetTimer = setTimeout(() => {
      setCopyButtonState(button, 'idle', label, title);
    }, 1500);
  }
}

function createCopyButton({ label, title, getText }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'chat-copy-btn';
  setCopyButtonState(button, 'idle', label, title);
  button.addEventListener('click', async () => {
    const copied = await copyText(getText());
    setCopyButtonState(button, copied ? 'copied' : 'error', label, title);
  });
  return button;
}

function copyableBubbleText(bubble) {
  const textEl = bubble.querySelector('.chat-bubble-text');
  return (textEl || bubble).textContent.trim();
}

function getLastDebugPayload() {
  const payload = window.Tarot52LastLLMPayload;
  if (!payload) {
    console.warn('[Tarot52Debug] No LLM payload yet. Send a reading request first.');
    return null;
  }
  return payload;
}

function logDebugCheck(label, passed, details = '') {
  const message = `[Tarot52Debug] ${passed ? 'PASS' : 'FAIL'}: ${label}${details ? ` (${details})` : ''}`;
  const logger = passed ? console.log : console.warn;
  logger(message);
  return { label, passed, details };
}

window.Tarot52Debug = {
  dumpLastPayload() {
    const payload = getLastDebugPayload();
    if (!payload) return null;

    console.log('[Tarot52Debug] Last LLM payload:');
    console.log(JSON.stringify(payload, null, 2));
    return payload;
  },

  async echoLastPayload() {
    const payload = getLastDebugPayload();
    if (!payload) return null;

    const response = await fetch('/api/chat?debug=1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.warn('[Tarot52Debug] Debug echo request failed:', response.status, data);
      return data;
    }

    console.log('[Tarot52Debug] Backend debug echo:');
    console.log(data);
    return data;
  },

  async diff() {
    const payload = getLastDebugPayload();
    if (!payload) return null;

    const echo = await window.Tarot52Debug.echoLastPayload();
    if (!echo || echo.debug !== true) {
      console.warn('[Tarot52Debug] No debug echo payload returned.');
      return null;
    }

    const input = String(echo.input || '');
    const cards = Array.isArray(payload.cards) ? payload.cards : [];
    const knowledgeBase = Array.isArray(payload.knowledgeBase) ? payload.knowledgeBase : [];
    const missingCardNames = cards
      .map((card) => card.name)
      .filter((name) => name && !input.includes(name));
    const missingPositionNames = cards
      .map((card) => card.positionName)
      .filter((name) => name && !input.includes(name));
    const missingKnowledgeTitles = knowledgeBase
      .map((doc) => doc.title || doc.path)
      .filter((title) => title && !input.includes(title));
    const astrologyProfile = payload.astrologyProfile || {};
    const missingAstrologySigns = Object.entries(astrologyProfile)
      .map(([slot, sign]) => `${slot}: ${sign}`)
      .filter((line) => !input.includes(line));
    const astrologyContext = payload.astrologyContext?.placements || {};
    const missingAstrologyContext = Object.entries(astrologyContext)
      .flatMap(([slot, placement]) => [
        placement.element ? `${slot} element: ${placement.element}` : '',
        placement.meaning || '',
      ])
      .filter((value) => value && !input.includes(value));

    const checks = [
      logDebugCheck('instructions match payload.systemPrompt', echo.instructions === (payload.systemPrompt || '')),
      logDebugCheck('input contains userPrompt', !payload.userPrompt || input.includes(payload.userPrompt)),
      logDebugCheck(
        'input contains every card.name',
        missingCardNames.length === 0,
        missingCardNames.length ? `missing: ${missingCardNames.join(', ')}` : ''
      ),
      logDebugCheck(
        'input contains every card.positionName',
        missingPositionNames.length === 0,
        missingPositionNames.length ? `missing: ${missingPositionNames.join(', ')}` : ''
      ),
      logDebugCheck(
        'input contains every knowledge doc title',
        missingKnowledgeTitles.length === 0,
        missingKnowledgeTitles.length ? `missing: ${missingKnowledgeTitles.join(', ')}` : ''
      ),
      logDebugCheck(
        'input contains astrology profile when present',
        !hasAstrologyProfile(astrologyProfile) || missingAstrologySigns.length === 0,
        missingAstrologySigns.length ? `missing: ${missingAstrologySigns.join(', ')}` : ''
      ),
      logDebugCheck(
        'input contains aligned zodiac context when present',
        !hasAstrologyProfile(astrologyProfile) || !payload.astrologyContext || missingAstrologyContext.length === 0,
        missingAstrologyContext.length ? `missing: ${missingAstrologyContext.join(', ')}` : ''
      ),
    ];

    return { echo, checks };
  },
};

function getFallbackMode() {
  if (window.getTarot52ReadingMode) return window.getTarot52ReadingMode(1);
  return {
    count: 1,
    label: 'General Insight',
    intro: 'A single card gives the whole inquiry one symbolic lens.',
    positions: [{ name: 'Lens', prompt: 'Read this card as the overarching context.' }],
    systemPrompt: 'Read the selected card as the central symbolic lens for the inquiry.',
  };
}

const FOLLOW_UP_SYSTEM_PROMPT = [
  'Conversation phase: follow-up. The initial reading has already been delivered to the querent.',
  'This instruction supersedes the mode-specific "How to construct the reading" opening instructions for this turn.',
  'Answer the querent\'s latest follow-up directly as a continuation of the existing conversation.',
  'Do not begin by re-announcing the drawn card, restating the spread, restating position mappings, or repeating the card\'s one-word term as if this were a new reading.',
  'Use the original card draw as shared context. Refer to a card, position, or term only when it genuinely helps answer the follow-up.',
  'Match response length to the question — a short clarifying follow-up may need one sentence; a deeper question may need more. Let the content decide.',
  'If the querent asks for a recap, alternative interpretation, or a closer look at a specific card, then revisit only the requested part instead of replaying the whole opening reading.',
].join(' ');

function buildSystemPromptForPhase(mode, phase) {
  if (phase !== 'followup') return mode.systemPrompt;
  return `${mode.systemPrompt}\n\n${FOLLOW_UP_SYSTEM_PROMPT}`;
}

function syncPaneToggleButtons(collapsed) {
  document.querySelectorAll('[data-pane-toggle]').forEach((toggleBtn) => {
    toggleBtn.setAttribute('aria-pressed', String(collapsed));
    toggleBtn.setAttribute('aria-label', collapsed ? 'Show the spread' : 'Hide the spread and focus the chat');
    toggleBtn.setAttribute('title', collapsed ? 'Show spread' : 'Hide spread');
    const label = toggleBtn.querySelector('.chat-collapse-label, .visually-hidden');
    if (label) label.textContent = collapsed ? 'Show spread' : 'Hide spread';
  });
}

function applyCollapsedState(collapsed, persist = true) {
  const layout = document.getElementById('layout');
  if (layout) layout.classList.toggle('chat-fullscreen', collapsed);
  syncPaneToggleButtons(collapsed);
  if (persist) writeSessionValue(SESSION_COLLAPSED_KEY, Boolean(collapsed));
}

function bootChat(rootEl) {
  const thread     = rootEl.querySelector('#chatThread');
  const composer   = rootEl.querySelector('#chatComposer');
  const input      = rootEl.querySelector('#chatInput');
  let composerActions = rootEl.querySelector('#chatComposerActions');

  if (!thread || !composer || !input) {
    console.warn('[chat] missing expected elements in root');
    return;
  }

  if (!composerActions) {
    composerActions = document.createElement('div');
    composerActions.className = 'chat-composer-actions';
    composerActions.id = 'chatComposerActions';
    composer.insertAdjacentElement('afterend', composerActions);
  }

  const storedModeCount = readSessionInt(SESSION_MODE_KEY);
  const savedModeCount = window.Tarot52ReadingModes?.[storedModeCount] ? storedModeCount : null;
  const savedCollapsed = readSessionBool(SESSION_COLLAPSED_KEY);
  const hasSavedSession = savedModeCount !== null;

  // First visits start collapsed (chat-fullscreen). Returning from lore restores
  // the last pane state, so an open spread stays open instead of showing welcome.
  // Defer to next frame so the sidebar gets a chance to lay out its cards at
  // their real size first — collapsing immediately while it's still visibility:hidden
  // can leave the grid with 0-height cells on mobile.
  requestAnimationFrame(() => applyCollapsedState(
    hasSavedSession && savedCollapsed !== null ? savedCollapsed : true,
    false
  ));
  document.querySelectorAll('[data-pane-toggle]').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', () => {
      const layout = document.getElementById('layout');
      const next = !(layout && layout.classList.contains('chat-fullscreen'));
      applyCollapsedState(next);
    });
  });

  const state = {
    mode: savedModeCount && window.getTarot52ReadingMode
      ? window.getTarot52ReadingMode(savedModeCount)
      : getFallbackMode(),
    inquiry: '',
    cards: [],
    readingComplete: false,
    loreIndex: null,
    loreError: null,
    knowledgeBase: [],
    knowledgeError: null,
    initialReading: '',
    followUps: [],
    astrologyProfile: readAstrologyProfile(),
    zodiacKnowledge: null,
    zodiacError: null,
  };

  loadLoreIndex()
    .then((index) => { state.loreIndex = index; })
    .catch((err) => {
      state.loreError = err;
      console.warn('[chat] lore descriptions unavailable', err);
    });

  loadKnowledgeBase()
    .then((documents) => { state.knowledgeBase = documents; })
    .catch((err) => {
      state.knowledgeError = err;
      console.warn('[chat] knowledge base unavailable', err);
    });

  loadZodiacKnowledge()
    .then((zodiac) => { state.zodiacKnowledge = zodiac; })
    .catch((err) => {
      state.zodiacError = err;
      console.warn('[chat] zodiac knowledge unavailable', err);
    });

  // Auto-grow textarea up to a cap.
  const MAX_ROWS_PX = 200;
  const composerCopyButton = createCopyButton({
    label: 'Copy input',
    title: 'Copy input',
    getText: () => input.value,
  });
  composerCopyButton.classList.add('chat-composer-copy');
  composerActions.appendChild(composerCopyButton);

  const syncComposerCopyButton = () => {
    const hasText = input.value.trim().length > 0;
    composerActions.hidden = !hasText;
    composerCopyButton.hidden = !hasText;
    composerCopyButton.disabled = !hasText;
  };

  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, MAX_ROWS_PX) + 'px';
    syncComposerCopyButton();
  };
  input.addEventListener('input', autoGrow);

  const setPlaceholder = () => {
    input.placeholder = state.readingComplete
      ? 'Ask a follow-up...'
      : `Ask your ${state.mode.count}-card question...`;
  };

  const appendMessage = (role, text, tone = '', extras = null) => {
    // Drop the empty-state on first message.
    const empty = thread.querySelector('.chat-empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = `chat-msg chat-msg-${role}`;
    if (tone) row.classList.add(`chat-msg-${tone}`);
    const body = document.createElement('div');
    body.className = 'chat-msg-body';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (extras && extras.leading) {
      bubble.classList.add('chat-bubble-with-card');
      bubble.appendChild(extras.leading);
      const textNode = document.createElement('span');
      textNode.className = 'chat-bubble-text';
      textNode.textContent = text;
      bubble.appendChild(textNode);
    } else {
      bubble.textContent = text;
    }
    body.appendChild(bubble);

    if (tone !== 'meta') {
      const actions = document.createElement('div');
      actions.className = 'chat-msg-actions';
      actions.appendChild(createCopyButton({
        label: 'Copy message',
        title: 'Copy message',
        getText: () => copyableBubbleText(bubble),
      }));
      body.appendChild(actions);
    }

    row.appendChild(body);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return row;
  };

  const buildMiniCard = (card) => {
    const el = document.createElement('span');
    el.className = `chat-card-mini ${card.colorClass}`;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = `
      <span class="chat-card-mini-corner tl">
        <span class="chat-card-mini-rank">${card.rank}</span>
        <span class="chat-card-mini-suit">${card.symbol}</span>
      </span>
      <span class="chat-card-mini-center">${card.symbol}</span>
      <span class="chat-card-mini-corner br">
        <span class="chat-card-mini-rank">${card.rank}</span>
        <span class="chat-card-mini-suit">${card.symbol}</span>
      </span>
    `;
    return el;
  };

  const describeMode = (prefix) => {
    const mode = state.mode;
    const positions = mode.positions.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    appendMessage(
      'assistant',
      `${prefix} ${mode.count}-card ${mode.label} mode.\n\n${mode.intro}\n\n${positions}\n\nMeditate on your question, then type it below. Once you send it, the spread will open so you can draw ${mode.count === 1 ? 'your card' : `${mode.count} cards`}.`
    );
  };

  const resetForMode = (mode, reason) => {
    state.mode = mode || getFallbackMode();
    state.inquiry = '';
    state.cards = [];
    state.readingComplete = false;
    state.initialReading = '';
    state.followUps = [];
    setPlaceholder();

    if (reason === 'initial') {
      appendMessage('assistant', 'Welcome to Tarot Chat.');
      describeMode('You chose');
      return;
    }
    if (reason === 'newspread') {
      describeMode('New spread ready. You are in');
      return;
    }
    describeMode("You've chosen");
  };

  const enrichCards = (cards) => {
    return cards.map((card) => {
      const loreCard = state.loreIndex && state.loreIndex.get(card.name);
      return {
        ...card,
        tarot: loreCard?.tarot || card.tarot,
        description: loreCard?.description || '',
      };
    });
  };

  const createLLMPayload = (phase = 'initial') => {
    const cards = enrichCards(state.cards);
    const payload = {
      phase,
      systemPrompt: buildSystemPromptForPhase(state.mode, phase),
      mode: {
        count: state.mode.count,
        label: state.mode.label,
        positions: state.mode.positions,
      },
      userPrompt: state.inquiry,
      cards,
      knowledgeBase: state.knowledgeBase.slice(),
      initialReading: phase === 'followup' ? state.initialReading : '',
      followUps: state.followUps.slice(),
    };
    if (hasAstrologyProfile(state.astrologyProfile)) {
      payload.astrologyProfile = { ...state.astrologyProfile };
      const astrologyContext = buildAstrologyContext(state.astrologyProfile, state.zodiacKnowledge);
      if (astrologyContext) payload.astrologyContext = astrologyContext;
    }
    return payload;
  };

  const renderMockReading = (payload) => {
    // Conversational prose fallback for when the live API is unreachable.
    // Voice mirrors the system prompts so the UX stays consistent offline.
    // Celtic Cross gets its own scaffold so the structure is recognizable.
    if (payload.mode?.count === 10 && payload.cards.length === 10) {
      return renderMockCelticCross(payload);
    }

    const statements = [];
    const modeLabel = payload.mode?.label || 'reading';
    statements.push(`On "${payload.userPrompt}", the ${modeLabel.toLowerCase()} points here:`);

    payload.cards.forEach((card) => {
      const loreLine = firstSentence(card.description);
      const opener = payload.cards.length > 1
        ? `${card.positionName}: ${card.name} - ${card.term.toLowerCase()}.`
        : `${card.name} - ${card.term.toLowerCase()}.`;
      statements.push(loreLine ? `${opener} ${loreLine}` : opener);
    });

    statements.push('Local placeholder: with the API reachable, this would get sharper and more specific instead of expanding into a full canned read.');
    return statements.join(' ');
  };

  // Celtic Cross-shaped mock: orientation -> heart -> larger cross -> Staff
  // -> one relational dynamic -> synthesis, so the flow is testable offline.
  const renderMockCelticCross = (payload) => {
    const [present, challenge, past, future, above, below, advice, external, hopesFears, outcome] = payload.cards;
    const cardLabel = (c) => `${c.name} - ${c.term.toLowerCase()}`;
    const lore = (c) => firstSentence(c.description) || '';

    const statements = [];

    statements.push(`On "${payload.userPrompt}", the Celtic Cross reads less like a list and more like this: ${cardLabel(present)} at the center, crossed by ${cardLabel(challenge)} - the live matter and the pressure on it. ${lore(present)} ${lore(challenge)}`.trim());

    statements.push(`The wider shape runs from ${cardLabel(past)} into ${cardLabel(future)}, with ${cardLabel(below)} underneath and ${cardLabel(above)} above; outside pressure shows as ${cardLabel(external)}, while ${cardLabel(hopesFears)} tangles hope with fear.`);

    statements.push(`The most useful lever is ${cardLabel(advice)} against a current outcome of ${cardLabel(outcome)}: not destiny, just the line things keep taking unless your posture changes. Local placeholder, compressed on purpose.`);

    return statements.join(' ');
  };

  const requestChatCompletion = async (payload) => {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Chat endpoint failed with ${res.status}`);
    }
    return data.text || '';
  };

  const answerCompletedReading = async () => {
    const payload = createLLMPayload('initial');
    window.Tarot52LastLLMPayload = payload;
    const pending = appendMessage('assistant', 'Reading the spread...', 'meta');
    try {
      const text = await requestChatCompletion(payload);
      pending.remove();
      const reading = stripMarkdown(text) || renderMockReading(payload);
      state.initialReading = reading;
      appendMessage('assistant', reading);
    } catch (err) {
      pending.remove();
      const reading = renderMockReading(payload);
      state.initialReading = reading;
      appendMessage('assistant', reading);
      appendMessage(
        'assistant',
        `Live AI is not available yet, so I used the local mock reading. ${err.message}`,
        'meta'
      );
      if (state.loreError) {
        appendMessage('assistant', 'Note: lore.json could not be loaded, so this mock used only the card headline data.', 'meta');
      }
    }
    // Reading is complete — collapse the spread so the user focuses on the response.
    applyCollapsedState(true);
  };

  const answerFollowUp = async (text) => {
    state.followUps.push({ role: 'user', content: text });
    const payload = createLLMPayload('followup');
    window.Tarot52LastLLMPayload = payload;
    const pending = appendMessage('assistant', 'Reading your follow-up...', 'meta');
    try {
      const reply = await requestChatCompletion(payload);
      pending.remove();
      const cleanReply = stripMarkdown(reply);
      appendMessage('assistant', cleanReply);
      state.followUps.push({ role: 'assistant', content: cleanReply });
    } catch (err) {
      pending.remove();
      const cardTerms = state.cards.map((card) => `${card.positionName}: ${card.term}`).join('; ');
      const fallbackReply = `Mock follow-up noted. I would keep reading through ${cardTerms}. With the LLM connected, this is where the answer would get more specific to your added context while staying inside the ${state.mode.label} frame.`;
      appendMessage('assistant', fallbackReply);
      state.followUps.push({ role: 'assistant', content: fallbackReply });
      appendMessage('assistant', `Live AI is not available yet. ${err.message}`, 'meta');
    }
  };

  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    appendMessage('user', text);
    input.value = '';
    autoGrow();

    if (state.readingComplete) {
      await answerFollowUp(text);
      return;
    }

    if (!state.inquiry) {
      state.inquiry = text;
      window.dispatchEvent(new CustomEvent('tarot52:inquiryready', {
        detail: {
          inquiry: state.inquiry,
          mode: state.mode,
        },
      }));
      appendMessage(
        'assistant',
        `Opening the spread. Select ${state.mode.count === 1 ? '1 card' : `${state.mode.count} cards`} and I will read them in draw order for ${state.mode.label}.`
      );
      // Auto-expand the spread sidebar so the user can immediately pick cards.
      applyCollapsedState(false);
      return;
    }

    state.inquiry = `${state.inquiry}\n${text}`;
    appendMessage('assistant', `Added that to your inquiry. Keep drawing when you are ready.`);
  };

  composer.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });

  // Enter to send, Shift+Enter for newline.
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  // ---- Mode-selection modal (welcome + new chat) -----------------------
  // One modal serves two purposes:
  //   'welcome' - mandatory mode pick on first load. No cancel/escape/backdrop dismiss.
  //   'new'     - mid-session reset. Dismissible.
  const newBtn        = rootEl.querySelector('#chatNewBtn');
  const modalBackdrop = rootEl.querySelector('#newChatModalBackdrop');
  const modalTitle    = rootEl.querySelector('#newChatModalTitle');
  const modalDesc     = rootEl.querySelector('#newChatModalDesc');
  const modalSelect   = rootEl.querySelector('#newChatModeSelect');
  const modalStart    = rootEl.querySelector('#newChatStartBtn');
  const profileBtn    = rootEl.querySelector('#chatProfileBtn');
  const profileBackdrop = rootEl.querySelector('#profileModalBackdrop');
  const profileSun    = rootEl.querySelector('#profileSunSelect');
  const profileMoon   = rootEl.querySelector('#profileMoonSelect');
  const profileRising = rootEl.querySelector('#profileRisingSelect');
  const profileSave   = rootEl.querySelector('#profileSaveBtn');
  const profileClear  = rootEl.querySelector('#profileClearBtn');

  let modalPurpose = null; // 'welcome' | 'new' | null

  const populateModeOptions = () => {
    if (!modalSelect) return;
    const modes = window.Tarot52ReadingModes || {};
    modalSelect.innerHTML = '';
    Object.values(modes).forEach((mode) => {
      const opt = document.createElement('option');
      opt.value = String(mode.count);
      opt.textContent = `${mode.count} - ${mode.label}`;
      modalSelect.appendChild(opt);
    });
  };
  populateModeOptions();

  const populateSignSelect = (select) => {
    if (!select) return;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = '— not set —';
    select.appendChild(empty);
    ZODIAC_SIGNS.forEach((sign) => {
      const opt = document.createElement('option');
      opt.value = sign;
      opt.textContent = sign;
      select.appendChild(opt);
    });
  };

  const populateProfileOptions = () => {
    [profileSun, profileMoon, profileRising].forEach(populateSignSelect);
  };
  populateProfileOptions();

  const syncProfileButton = () => {
    if (!profileBtn) return;
    const isSet = hasAstrologyProfile(state.astrologyProfile);
    profileBtn.classList.toggle('has-profile', isSet);
    profileBtn.setAttribute('aria-label', isSet ? 'Birth chart profile set' : 'Birth chart profile');
    profileBtn.setAttribute('title', isSet ? 'Birth chart profile set' : 'Birth chart profile');
  };

  const syncProfileSelects = () => {
    const profile = state.astrologyProfile || {};
    if (profileSun) profileSun.value = profile.sun || '';
    if (profileMoon) profileMoon.value = profile.moon || '';
    if (profileRising) profileRising.value = profile.rising || '';
  };

  const configureModalFor = (purpose) => {
    if (!modalTitle || !modalDesc || !modalStart) return;
    if (purpose === 'welcome') {
      modalTitle.textContent = 'Welcome to Tarot 52';
      modalDesc.textContent = 'Choose a reading mode to begin. Each mode shapes how the cards will be interpreted against your question.';
      modalStart.textContent = 'Begin';
    } else {
      modalTitle.textContent = 'Start a new chat?';
      modalDesc.textContent = 'Choose the mode for the next reading. Starting will clear the current thread and shuffle a new deck.';
      modalStart.textContent = 'Start';
    }
  };

  let lastFocusedBeforeModal = null;
  const openModal = (purpose = 'new') => {
    if (!modalBackdrop) return;
    modalPurpose = purpose;
    configureModalFor(purpose);
    populateModeOptions(); // refresh in case modes are added at runtime
    // Default the dropdown to the currently active mode (or Mode 1 on welcome).
    if (modalSelect) {
      modalSelect.value = String(state.mode?.count || 1);
    }
    lastFocusedBeforeModal = document.activeElement;
    modalBackdrop.hidden = false;
    requestAnimationFrame(() => {
      modalBackdrop.classList.add('is-open');
      if (modalSelect) modalSelect.focus();
    });
  };
  const closeModal = () => {
    if (!modalBackdrop) return;
    modalBackdrop.classList.remove('is-open');
    modalBackdrop.hidden = true;
    modalPurpose = null;
    if (lastFocusedBeforeModal && typeof lastFocusedBeforeModal.focus === 'function') {
      lastFocusedBeforeModal.focus();
    }
  };

  let lastFocusedBeforeProfile = null;
  const openProfileModal = () => {
    if (!profileBackdrop) return;
    populateProfileOptions();
    syncProfileSelects();
    lastFocusedBeforeProfile = document.activeElement;
    profileBackdrop.hidden = false;
    requestAnimationFrame(() => {
      profileBackdrop.classList.add('is-open');
      if (profileSun) profileSun.focus();
    });
  };

  const closeProfileModal = () => {
    if (!profileBackdrop) return;
    profileBackdrop.classList.remove('is-open');
    profileBackdrop.hidden = true;
    if (lastFocusedBeforeProfile && typeof lastFocusedBeforeProfile.focus === 'function') {
      lastFocusedBeforeProfile.focus();
    }
  };

  const resetChatThread = () => {
    thread.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.innerHTML = '<p>This is where your reading will appear.</p><p class="chat-empty-hint">Type a question below to begin.</p>';
    thread.appendChild(empty);
    state.inquiry = '';
    state.cards = [];
    state.readingComplete = false;
    state.initialReading = '';
    state.followUps = [];
    input.value = '';
    autoGrow();
  };

  if (newBtn) newBtn.addEventListener('click', () => openModal('new'));
  if (profileBtn) profileBtn.addEventListener('click', openProfileModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      // Welcome modal cannot be dismissed by clicking the backdrop.
      if (e.target === modalBackdrop && modalPurpose === 'new') closeModal();
    });
  }
  if (profileBackdrop) {
    profileBackdrop.addEventListener('click', (e) => {
      if (e.target === profileBackdrop) closeProfileModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    // Welcome modal cannot be dismissed with Escape.
    if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden && modalPurpose === 'new') {
      closeModal();
    }
    if (e.key === 'Escape' && profileBackdrop && !profileBackdrop.hidden) {
      closeProfileModal();
    }
  });
  if (modalStart) {
    modalStart.addEventListener('click', () => {
      const count = parseInt(modalSelect?.value || '1', 10);
      const wasWelcome = modalPurpose === 'welcome';
      closeModal();
      resetChatThread();
      writeSessionValue(SESSION_MODE_KEY, count);
      // Always collapse chat back to fullscreen so the user starts focused on the chat.
      applyCollapsedState(true);
      // Welcome: trigger the same greeting as the original 'initial' boot.
      // New chat mid-session: post the 'New spread ready' message.
      window.dispatchEvent(new CustomEvent('tarot52:newsession', {
        detail: { count, reason: wasWelcome ? 'initial' : 'newspread' },
      }));
    });
  }
  if (profileSave) {
    profileSave.addEventListener('click', () => {
      state.astrologyProfile = writeAstrologyProfile({
        sun: profileSun?.value || null,
        moon: profileMoon?.value || null,
        rising: profileRising?.value || null,
      });
      syncProfileButton();
      closeProfileModal();
    });
  }
  if (profileClear) {
    profileClear.addEventListener('click', () => {
      state.astrologyProfile = clearAstrologyProfile();
      syncProfileSelects();
      syncProfileButton();
      closeProfileModal();
    });
  }

  window.addEventListener('tarot52:modechange', (e) => {
    const detail = e.detail || {};
    if (detail.reason === 'restore') {
      state.mode = detail.mode || getFallbackMode();
      setPlaceholder();
      return;
    }

    resetForMode(detail.mode, detail.reason);
  });

  // Open the welcome modal only for a fresh tab/session. Returning from lore
  // restores the selected mode and pane state without interrupting the user.
  requestAnimationFrame(() => {
    if (hasSavedSession) {
      window.dispatchEvent(new CustomEvent('tarot52:newsession', {
        detail: { count: savedModeCount, reason: 'restore' },
      }));
      return;
    }
    openModal('welcome');
  });

  window.addEventListener('tarot52:drawblocked', () => {
    if (!state.inquiry) {
      appendMessage('assistant', 'Begin by typing the question you want the cards to answer. Then the spread will unlock.');
    }
  });

  window.addEventListener('tarot52:carddrawn', (e) => {
    state.cards = e.detail.cards || [];
    const { card, remaining } = e.detail;
    const positionLabel = state.mode.count === 1 ? '' : `${card.positionName}: `;
    appendMessage(
      'assistant',
      `${positionLabel}${card.name} - ${card.term}.${remaining ? ` ${remaining} to draw.` : ''}`,
      'meta',
      { leading: buildMiniCard(card) }
    );
  });

  window.addEventListener('tarot52:readingcomplete', (e) => {
    state.cards = e.detail.cards || [];
    state.readingComplete = true;
    setPlaceholder();
    answerCompletedReading();
  });

  setPlaceholder();
  syncComposerCopyButton();
  syncProfileButton();
}

window.bootChat = bootChat;

window.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('.chat-root');
  if (root && !root.dataset.booted) {
    root.dataset.booted = '1';
    bootChat(root);
  }
});
