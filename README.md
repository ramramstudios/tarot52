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

1. The 52-card deck is shuffled (Fisher-Yates, crypto RNG) and laid out in a 4 × 13 grid.
2. A dropdown in the top-right lets you choose how many cards to draw — values are Fibonacci numbers ≤ 51: `1, 2, 3, 5, 8, 13, 21, 34`.
3. Click cards to flip them, up to your chosen draw limit. The reading panel below the spread lists each flipped card with its suit, name, and term.

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
| `lore.json`       | The 52-card mapping data (terms + RWS descriptions)  |
| `tarot52.png`     | App icon / logo asset                                |

## Running locally

It's a static site — any HTTP server works:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Attribution

Card descriptions in `lore.json` are condensed from Arthur Edward Waite, *The Pictorial Key to the Tarot* (William Rider & Son, 1910), now in the public domain. Sourced via [rider-waite.com](https://rider-waite.com/symbolism/).
