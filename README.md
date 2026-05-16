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

## Notes

Will need a system prompt that handles any question and knows how to filter it through the meaning of the cards to have the question influcenced in a way worth reading. Should probably make the prompt be submitted BEFORE the card draw. Also, maybe the different card fibonnacci selection (1, 2, 3, 5, 8...) indicates a certain type of system prompt, e.g. '3' gives a past/present/future style reading; or a '32' gives a very in depth detailed meaning with the order of the cards drawn affects different aspects of the response.

The flow has to be where the chatbot welcomes the user with "Welcome to Tarot Chat", I see you have selected a {3} card draw, this is a past present and future draw, so the guidance you seek will be filtered through what the tarot has to tell you the form of the past, present, and future timeline as it pertains to the inquiry you submit, and insight the tarot gives.

The {x} number of cards will need to be defined for the diferent scenarios. The idea is similar to that of the celtic cross or other more complex readings where each card and its placement (selection order) define the aspect of the insight given. At the moment I only have self-defined the 1 and 3-card draw; 1 is a simple overarching context lens through which the querant's querites get guided through.

Workflow order will be:
1) chatbot give a standard first greeting, like: "welcome to tarot 52", please select a mode (fibonacci number)
2) user selects {x} which loads a particular system prompt
3) chatbot says, "ah! you've chosen {y} mode (e.g. past, present, future). Meditate on your inquiry before typing, then submit."
3) chatbot says, "Now select {x} cards."
4) User flips over {x} card(s); the order is important and will correspond to the system prompt, or example on a 3-card draw the order maps to the meaning of the card. 1st card drawn is past, 2nd is present, 3rd is future.
5) the selected card(s) are flipped immediately as the user clicks them. As each is flipped the display container which already exists now, is populated with each card and meaning as is currently implemented. Once the last card is flipped, this triggers the chatbot to respond with the initial response give then context of the system promp+the user's initial query (use prompt)+the context of the chosen cards as the lens filter corresponding to the query and mode we're in.

Example:
User enters prompt: "tell me about my love life"
User flips the 3rd card, [let's say they got Ace of Spades, 3 of Spades, and 4 of Spades]
Once the 4 of Spades is flipped the response is sent to the LLM with the payload which includes system prompt ["this reponse should be in the form of past(card 1), present(card 2), future(card 3)"; view the entire query through the lens of these three cards to generate the meaning of the cards as they would be associated to the lifetime of someone and how the three time periods would cast insight with the variable cards inserted into their functionality]
so the payload includes the system prompt (mode), user prompt (user's inquiry), and the cards selected (which defines the reponse content); the response should be fairly generic but build as the user provides more information which will inform the thread context and get more specific with its insight.

So we need to build system prompts system prompts, and we'll start with the drop down choices (modes) for 1, 2, 3; 1 is general insight, 2, is crossroads (like an A vs B binary option choice the user can make), and 3 is past/present/future as discussed.