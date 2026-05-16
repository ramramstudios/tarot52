/* ===================================================
   chat.js — Tarot 52 chat scaffold
   Builds the eventual LLM payload and renders a mock
   response until a model endpoint is wired in.
   =================================================== */

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

function applyCollapsedState(collapsed) {
  const layout = document.getElementById('layout');
  if (layout) layout.classList.toggle('chat-fullscreen', collapsed);
  syncPaneToggleButtons(collapsed);
}

function bootChat(rootEl) {
  const thread     = rootEl.querySelector('#chatThread');
  const composer   = rootEl.querySelector('#chatComposer');
  const input      = rootEl.querySelector('#chatInput');

  if (!thread || !composer || !input) {
    console.warn('[chat] missing expected elements in root');
    return;
  }

  // Always start collapsed (chat-fullscreen). The user opens the spread on demand
  // when the assistant prompts them to pick cards.
  // Defer to next frame so the sidebar gets a chance to lay out its cards at
  // their real size first — collapsing immediately while it's still visibility:hidden
  // can leave the grid with 0-height cells on mobile.
  requestAnimationFrame(() => applyCollapsedState(true));
  document.querySelectorAll('[data-pane-toggle]').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', () => {
      const layout = document.getElementById('layout');
      const next = !(layout && layout.classList.contains('chat-fullscreen'));
      applyCollapsedState(next);
    });
  });

  const state = {
    mode: getFallbackMode(),
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
  };

  const describeMode = (prefix) => {
    const mode = state.mode;
    const positions = mode.positions.map((p, i) => `${i + 1}. ${p.name}`).join('\n');
    appendMessage(
      'assistant',
      `${prefix} ${mode.count}-card ${mode.label} mode.\n\n${mode.intro}\n\n${positions}\n\nMeditate on your inquiry, type it below, then open the spread (the ☰ icon, top-left) and draw ${mode.count === 1 ? 'your card' : `${mode.count} cards`}.`
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
      describeMode('I see you have selected');
      return;
    }
    if (reason === 'newspread') {
      describeMode('New spread ready. You are in');
      return;
    }
    describeMode("Ah, you've chosen");
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
    const lines = [
      `Here is a scaffolded ${payload.mode.label} reading for: "${payload.userPrompt}"`,
      '',
    ];

    payload.cards.forEach((card) => {
      const loreLine = firstSentence(card.description);
      lines.push(`${card.positionName}: ${card.name} (${card.tarot})`);
      lines.push(`Frame: ${card.term}. ${card.positionPrompt}`);
      if (loreLine) lines.push(`Symbolic material: ${loreLine}`);
      lines.push('');
    });

    lines.push('Mock synthesis: let the cards interrupt the obvious answer. Notice where the terms above feel alive, resistant, or strangely specific. A future LLM response will use this same payload, plus the full thread context, to get more precise as you add detail.');
    return lines.join('\n');
  };

  const answerCompletedReading = () => {
    const payload = createLLMPayload();
    window.Tarot52LastLLMPayload = payload;
    appendMessage('assistant', renderMockReading(payload));
    if (state.loreError) {
      appendMessage('assistant', 'Note: lore.json could not be loaded, so this mock used only the card headline data.', 'meta');
    }
  };

  const answerFollowUp = (text) => {
    state.followUps.push({ role: 'user', content: text });
    const cardTerms = state.cards.map((card) => `${card.positionName}: ${card.term}`).join('; ');
    appendMessage(
      'assistant',
      `Mock follow-up noted. I would keep reading through ${cardTerms}. With the LLM connected, this is where the answer would get more specific to your added context while staying inside the ${state.mode.label} frame.`
    );
  };

  const submit = () => {
    const text = input.value.trim();
    if (!text) return;
    appendMessage('user', text);
    input.value = '';
    autoGrow();

    if (state.readingComplete) {
      answerFollowUp(text);
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
        `Now open the spread (☰ top-left) and select ${state.mode.count === 1 ? '1 card' : `${state.mode.count} cards`}. I will read them in draw order for ${state.mode.label}.`
      );
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

  // ---- "New chat" modal ------------------------------------------------
  const newBtn       = rootEl.querySelector('#chatNewBtn');
  const modalBackdrop = rootEl.querySelector('#newChatModalBackdrop');
  const modalSelect   = rootEl.querySelector('#newChatModeSelect');
  const modalCancel   = rootEl.querySelector('#newChatCancelBtn');
  const modalStart    = rootEl.querySelector('#newChatStartBtn');

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

  let lastFocusedBeforeModal = null;
  const openModal = () => {
    if (!modalBackdrop) return;
    populateModeOptions(); // refresh in case modes are added at runtime
    // Default the dropdown to the currently active mode.
    if (modalSelect && state.mode) {
      modalSelect.value = String(state.mode.count);
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

  if (newBtn) newBtn.addEventListener('click', openModal);
  if (modalCancel) modalCancel.addEventListener('click', closeModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalBackdrop && !modalBackdrop.hidden) closeModal();
  });
  if (modalStart) {
    modalStart.addEventListener('click', () => {
      const count = parseInt(modalSelect?.value || '1', 10);
      closeModal();
      resetChatThread();
      // Always collapse chat back to fullscreen so the user starts focused on the chat.
      applyCollapsedState(true);
      // Tell the spread to reshuffle into the new mode. It will fire a
      // modechange event back, which our existing listener turns into the
      // greeting + describeMode message.
      window.dispatchEvent(new CustomEvent('tarot52:newsession', {
        detail: { count, reason: 'newspread' },
      }));
    });
  }

  window.addEventListener('tarot52:modechange', (e) => {
    resetForMode(e.detail.mode, e.detail.reason);
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
    // TODO: Replace this mock response with the actual LLM call using createLLMPayload().
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
