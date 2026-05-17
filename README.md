# Tarot 52

A divination tool built on the standard 52-card poker deck, with each card mapped to a card from the Rider-Waite Smith (RWS) Tarot Minor Arcana.

Live as a static single-page app: [`index.html`](index.html) (the spread) and [`lore.html`](lore.html) (the full mapping).

## The mapping

Standard tarot has 78 cards. A poker deck has 52. Tarot 52 keeps only what fits:

- **Major Arcana (22 cards)** — *dropped.* The Fool, Magician, Death, The Tower, etc. have no poker counterpart.
- **Minor Arcana suits (4 × 14 = 56 cards)** — kept, but each suit drops one court card (see below) to get to 13 ranks per suit.

### Suits

| Tarot       | Poker    | Element |
|-------------|----------|---------|
| Wands       | Clubs    | Fire    |
| Cups        | Hearts   | Water   |
| Swords      | Spades   | Air     |
| Pentacles   | Diamonds | Earth   |

The pairing follows visual and elemental tradition: clubs ≈ wand shape, hearts ≈ cup, spades ≈ sword blade, diamonds ≈ coin/pentacle.

### Court cards

Tarot court cards run Page → Knight → Queen → King. Poker has Jack → Queen → King. We drop the **Knight** and align:

| Poker | Tarot |
|-------|-------|
| Jack  | Page  |
| Queen | Queen |
| King  | King  |

### Per-card distillation

Each of the 52 cards has a single-word "term" (e.g. `3 of Hearts → Collaboration`, derived from the *Three of Cups*'s themes of pledging, joy, fulfillment). The terms are deliberately short so they can stand alone in a reading or feed downstream tooling. The full RWS description for each card lives in [`lore.json`](lore.json), sourced from Arthur Edward Waite's *Pictorial Key to the Tarot* (1910, public domain).

See the [Lore page](lore.html) for the full table.

## How the app works today

The app boots in **chat-first** mode: the chat takes the full viewport, and the spread is hidden behind a collapse toggle (☰) in the chat header. The assistant greets you, declares the active reading mode, and tells you when to open the spread.

- The 52-card deck is shuffled (Fisher-Yates, crypto RNG) and laid out in a 4 × 13 grid in the spread sidebar.
- The reading mode is **locked once a session starts**. To change modes or start over, use the **"New"** button in the chat header: it opens a confirmation modal with a mode dropdown and a Start button. Starting wipes the chat thread, reshuffles the deck, and applies the new mode.
- Inside the spread, clicking cards flips them up to the active mode's card limit. The reading panel below the spread lists each flipped card with its suit, name, and term, and each flip is mirrored as a meta message in the chat.

## Planned UX: LLM-assisted divination

The longer-term goal is to turn the random card draw into the input for an LLM chat interface. The flow:

1. **Ask a question.** You type something open-ended into a chat box — a decision you're weighing, a situation you want perspective on, an open creative prompt.
2. **Draw cards.** You pick a draw count (or the model picks one based on the question shape — single card for a quick read, three cards for past/present/future, five for a fuller spread).
3. **Interpret in context.** The model receives your question along with the cards' terms, names, and full RWS descriptions, and offers a reading that connects the symbols to what you asked.
4. **Follow up.** Ongoing conversation in the same context — clarifying questions, alternative readings, drawing additional cards mid-conversation.

The aim is **not** prediction. It's the same thing a tarot deck has always offered: a structured, symbolic prompt that gives you something to think against. The randomness breaks rumination patterns; the symbolism gives the LLM a non-trivial frame to riff on; the chat surface keeps it conversational rather than oracular.

The [`lore.json`](lore.json) data is structured to feed that prompt directly — `term` for headline framing, `tarot` for the symbolic anchor, `description` for the rich material the model can draw on.

## Files

| File              | Purpose                                              |
|-------------------|------------------------------------------------------|
| `index.html`      | The spread page entry point                          |
| `lore.html`       | The mapping/reference page entry point               |
| `app.js`          | Spread page logic (shuffle, flip, draw limits, UI)   |
| `lore.js`         | Lore page renderer (loads `lore.json`)               |
| `app.css`         | All styles, shared across both pages                 |
| `api/chat.js`     | Vercel API endpoint that calls OpenAI                |
| `lore.json`       | The 52-card mapping data (terms + RWS descriptions)  |
| `tarot52.png`     | App icon / logo asset                                |

## Running locally

It's a static site — any HTTP server works:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

The static server does not run the Vercel API function, so local readings fall back to the mock response unless you run the project through Vercel's local dev server.

## OpenAI API setup

The chat calls the Vercel serverless endpoint at `/api/chat`. That endpoint uses the OpenAI Responses API and reads secrets from Vercel environment variables.

Required in Vercel:

```txt
OPENAI_API_KEY=your OpenAI platform API key
```

Optional:

```txt
OPENAI_MODEL=gpt-5-mini
ALLOWED_ORIGINS=https://your-domain.example,https://ramramstudios.github.io
```

If `/api/chat` is unavailable or the key is missing, the frontend keeps working and renders the local mock reading instead.

## Attribution

Card descriptions in `lore.json` are condensed from Arthur Edward Waite, *The Pictorial Key to the Tarot* (William Rider & Son, 1910), now in the public domain. Sourced via [rider-waite.com](https://rider-waite.com/symbolism/).

## Workflow

The current implementation is a single-thread, mode-scoped reading flow. The chat is primary; the spread is secondary and stays hidden until cards are needed. Mode (and therefore the system prompt) is fixed for the duration of a thread — starting a new thread is the only way to change it.

### Reading modes

Three modes are defined in `app.js`. Each carries its own system prompt and a list of positional roles for its cards:

| Cards | Label                    | Positions (in draw order)             |
|-------|--------------------------|---------------------------------------|
| 1     | General Insight          | Lens                                  |
| 2     | Crossroads               | Path A, Path B                        |
| 3     | Past / Present / Future  | Past, Present, Future                 |

More modes (5, 8, …) can be added to `READING_MODES` in `app.js`. The Fibonacci-only draw counts (1, 2, 3, 5, 8, 13, 21, 34) are a soft convention rather than a hard rule.

### Session flow

1. **Boot.** The page loads in chat-fullscreen. The assistant says "Welcome to Tarot Chat" and announces the active mode ("I see you have selected 1-card General Insight mode…"). It lists the position roles for that mode and tells the user to open the spread (☰) when ready.
2. **Inquiry.** The user types their question in the chat. The chat acknowledges and re-prompts the user to open the spread and pick the right number of cards.
3. **Draw.** The user clicks the ☰ in the chat header to show the spread, then flips cards one at a time. Each flip emits a meta message into the chat (`Past: 3 of Hearts - Collaboration`). The spread enforces the mode's card limit.
4. **Reading.** When the last required card flips, the chat sends a payload (system prompt + inquiry + cards with positions, terms, and full RWS descriptions from `lore.json`) to `/api/chat` and renders the response. If the API is unavailable, it falls back to the mock response.
5. **Follow-up.** The user can keep chatting in the same thread. Follow-up messages are appended to `state.followUps` and sent with a follow-up phase prompt, the original card payload, and the already delivered opening reading. Follow-up turns answer the latest message directly instead of replaying the initial card announcement.
6. **New thread.** Clicking the **"New"** button in the chat header opens a confirmation modal with a mode dropdown. Selecting a mode and clicking "Start" clears the chat, reshuffles the deck into the new mode, and returns the user to chat-fullscreen. There is no way to change mode mid-thread.

### Example payload (3-card reading)

User inquiry: *"Tell me about my love life."*

Cards drawn in order: `Ace of Spades`, `3 of Spades`, `4 of Spades`.

Payload sent to the LLM:

```json
{
  "phase": "initial",
  "systemPrompt": "You are Tarot 52, a reflective tarot-reading assistant. The querent selected a Past / Present / Future reading. Interpret card one as Past, card two as Present, and card three as Future…",
  "mode": {
    "count": 3,
    "label": "Past / Present / Future",
    "positions": [
      { "name": "Past",    "prompt": "Read this card as the background pattern…" },
      { "name": "Present", "prompt": "Read this card as the current pressure…" },
      { "name": "Future",  "prompt": "Read this card as the direction the pattern could grow toward…" }
    ]
  },
  "userPrompt": "Tell me about my love life.",
  "cards": [
    { "name": "Ace of Spades", "term": "Lucidity",  "positionName": "Past",    "tarot": "Ace of Swords", "description": "..." },
    { "name": "3 of Spades",   "term": "Heartbreak","positionName": "Present", "tarot": "Three of Swords", "description": "..." },
    { "name": "4 of Spades",   "term": "Rest",      "positionName": "Future",  "tarot": "Four of Swords", "description": "..." }
  ],
  "initialReading": "",
  "followUps": []
}
```

The payload structure is stable; only the model call needs to be filled in.
