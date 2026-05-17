/* ===================================================
   chat.js — Tarot 52 chat scaffold
   Builds the eventual LLM payload and renders a mock
   response until a model endpoint is wired in.
   =================================================== */

const SESSION_MODE_KEY = 'tarot52.activeModeCount';
const SESSION_COLLAPSED_KEY = 'tarot52.sidebarCollapsed';

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

async function loadLoreIndex() {
  const res = await fetch('lore.json');
  if (!res.ok) throw new Error(`Failed to load lore.json: ${res.status}`);
  const lore = await res.json();
  const cards = new Map();
  lore.cards.forEach((card) => cards.set(card.poker, card));
  return cards;
}

function firstSentence(text) {
  if (!text) return '';
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return (match ? match[1] : text).trim();
}

// Belt-and-suspenders prose enforcement. The system prompt asks the model not
// to use markdown structure, but if it slips one in, we strip it here so the
// chat stays conversational regardless of the model.
function stripMarkdown(text) {
  if (!text) return '';
  return text
    // Strip ATX headers: leading #, ##, ### ...
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    // Strip horizontal rules: ---, ***, ___
    .replace(/^[ \t]*([-*_])\1{2,}[ \t]*$/gm, '')
    // Strip bullet markers at line start: -, *, + followed by space
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    // Strip ordered list markers: 1. 2. ...
    .replace(/^[ \t]*\d+\.[ \t]+/gm, '')
    // Strip bold/italic markers: **foo**, __foo__, *foo*, _foo_
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(?<!\w)\*([^*\n]+)\*(?!\w)/g, '$1')
    .replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '$1')
    // Strip inline code backticks (keep content)
    .replace(/`([^`]+)`/g, '$1')
    // Collapse 3+ newlines down to 2 (single blank line between paragraphs)
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

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

  if (!thread || !composer || !input) {
    console.warn('[chat] missing expected elements in root');
    return;
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
    followUps: [],
  };

  loadLoreIndex()
    .then((index) => { state.loreIndex = index; })
    .catch((err) => {
      state.loreError = err;
      console.warn('[chat] lore descriptions unavailable', err);
    });

  // Auto-grow textarea up to a cap.
  const MAX_ROWS_PX = 200;
  const autoGrow = () => {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, MAX_ROWS_PX) + 'px';
  };
  input.addEventListener('input', autoGrow);

  const setPlaceholder = () => {
    input.placeholder = state.readingComplete
      ? 'Ask a follow-up...'
      : `Ask your ${state.mode.count}-card question...`;
  };

  const appendMessage = (role, text, tone = '') => {
    // Drop the empty-state on first message.
    const empty = thread.querySelector('.chat-empty');
    if (empty) empty.remove();

    const row = document.createElement('div');
    row.className = `chat-msg chat-msg-${role}`;
    if (tone) row.classList.add(`chat-msg-${tone}`);
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = text;
    row.appendChild(bubble);
    thread.appendChild(row);
    thread.scrollTop = thread.scrollHeight;
    return row;
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

  const createLLMPayload = () => {
    const cards = enrichCards(state.cards);
    return {
      systemPrompt: state.mode.systemPrompt,
      mode: {
        count: state.mode.count,
        label: state.mode.label,
        positions: state.mode.positions,
      },
      userPrompt: state.inquiry,
      cards,
      followUps: state.followUps.slice(),
    };
  };

  const renderMockReading = (payload) => {
    // Conversational prose fallback for when the live API is unreachable.
    // Voice mirrors the system prompts so the UX stays consistent offline.
    // Celtic Cross gets its own scaffold so the structure is recognizable.
    if (payload.mode?.count === 10 && payload.cards.length === 10) {
      return renderMockCelticCross(payload);
    }

    const paragraphs = [];
    const modeLabel = payload.mode?.label || 'reading';
    paragraphs.push(`On your question — "${payload.userPrompt}" — here is a ${modeLabel.toLowerCase()} take.`);

    payload.cards.forEach((card) => {
      const loreLine = firstSentence(card.description);
      const opener = payload.cards.length > 1
        ? `For ${card.positionName.toLowerCase()}, you drew the ${card.name}, the ${card.tarot} in the Rider-Waite deck. The headline is ${card.term.toLowerCase()}.`
        : `You drew the ${card.name}, the ${card.tarot} in the Rider-Waite deck. The headline is ${card.term.toLowerCase()}.`;
      paragraphs.push(loreLine ? `${opener} ${loreLine}` : opener);
    });

    paragraphs.push('This is a local placeholder while the live model is unavailable. With the API reachable, the reading would weave these images more closely against the specifics of your question and the structure of the mode you chose.');
    return paragraphs.join('\n\n');
  };

  // Celtic Cross-shaped mock: orientation -> heart -> larger cross -> Staff
  // -> one relational dynamic -> synthesis, so the flow is testable offline.
  const renderMockCelticCross = (payload) => {
    const [present, challenge, past, future, above, below, advice, external, hopesFears, outcome] = payload.cards;
    const cardLabel = (c) => `the ${c.name} (${c.tarot}) — ${c.term.toLowerCase()}`;
    const lore = (c) => firstSentence(c.description) || '';

    const paragraphs = [];

    paragraphs.push(`On your question — "${payload.userPrompt}" — here is a Celtic Cross. Ten cards in two sections: the Circle/Cross is your inner and outer state, and the Staff is how you sit inside the wider context. Read this as a story, not a list.`);

    paragraphs.push(`At the heart sit two cards together. The Present is ${cardLabel(present)}. Pressing across it is the Challenge, ${cardLabel(challenge)} — the friction you are actually contending with, even if it does not look like friction at first. ${lore(present)} ${lore(challenge)}`.trim());

    paragraphs.push(`Around that heart, the larger cross runs along two crossing axes. On the time axis, the Past, ${cardLabel(past)}, is the ground the Present stands on, and the Future, ${cardLabel(future)}, is the near-term step you are about to navigate. On the consciousness axis, Above, ${cardLabel(above)}, is what you are consciously working toward, and Below, ${cardLabel(below)}, is the subconscious current under it all.`);

    paragraphs.push(`The Staff brings in the outer world. Advice arrives as ${cardLabel(advice)}, a posture worth trying. External Influences show up as ${cardLabel(external)}, the people or energies acting on the situation from outside your control. Hopes and Fears wear the face of ${cardLabel(hopesFears)} — and as often happens, what is hoped for and what is feared are tangled together. The Outcome card, ${cardLabel(outcome)}, points to where the situation is currently leaning if nothing changes.`);

    paragraphs.push(`One dynamic worth lifting up here is Above and Below — ${above.term.toLowerCase()} aimed for, ${below.term.toLowerCase()} running underneath. Notice whether the conscious goal and the subconscious driver are pulling the same direction or quietly fighting each other; that gap is often where the real friction lives.`);

    paragraphs.push(`Brought back to your question: the heart is ${present.term.toLowerCase()} crossed by ${challenge.term.toLowerCase()}, the trajectory is ${outcome.term.toLowerCase()}, and the lever in your hands is the Advice card, ${advice.term.toLowerCase()}. This is a local placeholder while the live model is unavailable — with the API reachable, the reading would name the specific pairings that make this particular draw spark, rather than the generic one shown here.`);

    return paragraphs.join('\n\n');
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
    const payload = createLLMPayload();
    window.Tarot52LastLLMPayload = payload;
    const pending = appendMessage('assistant', 'Reading the spread...', 'meta');
    try {
      const text = await requestChatCompletion(payload);
      pending.remove();
      appendMessage('assistant', stripMarkdown(text) || renderMockReading(payload));
    } catch (err) {
      pending.remove();
      appendMessage('assistant', renderMockReading(payload));
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
    const payload = createLLMPayload();
    window.Tarot52LastLLMPayload = payload;
    const pending = appendMessage('assistant', 'Reading your follow-up...', 'meta');
    try {
      const reply = await requestChatCompletion(payload);
      pending.remove();
      appendMessage('assistant', stripMarkdown(reply));
    } catch (err) {
      pending.remove();
      const cardTerms = state.cards.map((card) => `${card.positionName}: ${card.term}`).join('; ');
      appendMessage(
        'assistant',
        `Mock follow-up noted. I would keep reading through ${cardTerms}. With the LLM connected, this is where the answer would get more specific to your added context while staying inside the ${state.mode.label} frame.`
      );
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

  const resetChatThread = () => {
    thread.innerHTML = '';
    const empty = document.createElement('div');
    empty.className = 'chat-empty';
    empty.innerHTML = '<p>This is where your reading will appear.</p><p class="chat-empty-hint">Type a question below to begin.</p>';
    thread.appendChild(empty);
    state.inquiry = '';
    state.cards = [];
    state.readingComplete = false;
    state.followUps = [];
    input.value = '';
    autoGrow();
  };

  if (newBtn) newBtn.addEventListener('click', () => openModal('new'));
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      // Welcome modal cannot be dismissed by clicking the backdrop.
      if (e.target === modalBackdrop && modalPurpose === 'new') closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    // Welcome modal cannot be dismissed with Escape.
    if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden && modalPurpose === 'new') {
      closeModal();
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
    appendMessage('assistant', `${card.positionName}: ${card.name} - ${card.term}.${remaining ? ` ${remaining} to draw.` : ''}`, 'meta');
  });

  window.addEventListener('tarot52:readingcomplete', (e) => {
    state.cards = e.detail.cards || [];
    state.readingComplete = true;
    setPlaceholder();
    answerCompletedReading();
  });

  setPlaceholder();
}

window.bootChat = bootChat;

window.addEventListener('DOMContentLoaded', () => {
  const root = document.querySelector('.chat-root');
  if (root && !root.dataset.booted) {
    root.dataset.booted = '1';
    bootChat(root);
  }
});
