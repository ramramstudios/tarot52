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

const COLLAPSE_LS_KEY = 'tarot52.chatFullscreen';

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

  // Restore + wire the collapse toggle.
  const saved = localStorage.getItem(COLLAPSE_LS_KEY) === '1';
  applyCollapsedState(saved);
  document.querySelectorAll('[data-pane-toggle]').forEach((toggleBtn) => {
    toggleBtn.addEventListener('click', () => {
      const layout = document.getElementById('layout');
      const next = !(layout && layout.classList.contains('chat-fullscreen'));
      applyCollapsedState(next);
      localStorage.setItem(COLLAPSE_LS_KEY, next ? '1' : '0');
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
      `${prefix} ${mode.count}-card ${mode.label} mode.\n\n${mode.intro}\n\n${positions}\n\nMeditate on your inquiry, type it below, then draw ${mode.count === 1 ? 'your card' : `${mode.count} cards`}.`
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
        `Now select ${state.mode.count === 1 ? '1 card' : `${state.mode.count} cards`} from the spread. I will read them in draw order for ${state.mode.label}.`
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
