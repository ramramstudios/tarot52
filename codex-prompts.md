# Codex Prompts for Tarot 52

Three self-contained task prompts to hand to Codex. Each one is briefed cold — assume the agent has not seen prior conversation. File paths and line references are accurate as of the current main branch.

---

## Prompt 1: Copy button on chat messages

### Context

Tarot 52 is a static single-page divination app. Live as `index.html` (spread + chat split-pane) and `chat.html` (chat scaffold injected into the chat pane). The chat is built from vanilla JS in `chat.js`. Bubbles are rendered by `appendMessage(role, text, tone, extras)` at `chat.js:224`. Each message becomes:

```
<div class="chat-msg chat-msg-{role} [chat-msg-{tone}]">
  <div class="chat-bubble [chat-bubble-with-card]">
    {text or [card + text-span]}
  </div>
</div>
```

There are three message roles:
- **`user`** — the querent's input (right-aligned, purple). The user typed it, but they may want to copy it back (e.g. to paste their question elsewhere).
- **`assistant`** — model output (left-aligned, dark surface, border). This is the reading text the user most often wants to copy.
- Meta messages (assistant with `tone: 'meta'`) — system notifications like "Reading the spread…" or card-flip notifications. These should NOT get a copy button.

Card-flip meta messages also embed a stylized mini poker card via `buildMiniCard(card)` at `chat.js:247` (CSS classes `.chat-bubble-with-card`, `.chat-card-mini`). The composer (input textarea + send button) lives in `chat.html` as `<form class="chat-composer" id="chatComposer">` with `<textarea id="chatInput">` and `<button id="chatSend">`.

CSS lives in `app.css`. Chat bubble styles start at line 396. The composer is styled at line 477.

Color tokens used elsewhere in the app: `var(--text)`, `var(--text-muted)`, `var(--text-dim)`, `var(--border)`, `var(--surface-2)`, `var(--purple)`, `var(--purple-glow)`, with an existing focus ring `var(--focus-ring)`.

### Task

Add a copy button to:

1. **Every non-meta chat bubble** (`chat-msg-user` and `chat-msg-assistant` that don't carry `chat-msg-meta`). The button should appear in the bottom-left of each bubble row (outside the bubble itself, just under it on the left edge) and copy the bubble's plain text to the clipboard. Don't add it to meta messages.

2. **The composer input area.** A copy button at the bottom-left, below the composer, that copies whatever is currently in the textarea (`#chatInput`). If the textarea is empty, the button can be hidden or disabled.

### Requirements

- Use a generic copy icon (e.g. inline SVG of the standard clipboard/copy glyph — two overlapping rectangles). Do not use emoji. Do not pull in an icon library; inline SVG is preferred for consistency with the existing `↑` send button styling.
- On click, copy the text via `navigator.clipboard.writeText(...)`. On success, briefly swap the icon for a checkmark (or change tooltip to "Copied!") for ~1.5 seconds, then revert. On failure (older browsers, denied permission), fall back to a hidden `<textarea>` + `document.execCommand('copy')` shim, or at minimum log a warning and surface a non-blocking error.
- The button should be small (≈20–24px square), subtle (muted color, no fill), and only visible enough to be discovered without competing with the message content. A hover state with slightly brighter color is appropriate.
- Add `aria-label="Copy message"` (or "Copy input" for the composer one) and a `title` attribute for tooltip.
- Make sure the button is keyboard-accessible (Tab focus, Enter/Space to activate) and has a focus ring consistent with the app (`box-shadow: var(--focus-ring)` on `:focus-visible`).
- When copying an assistant message, copy ONLY the response text. For card-flip meta bubbles (which you're skipping anyway), this is moot, but be aware the bubble structure may contain a leading mini-card span — extract `.chat-bubble-text` if it exists, else use `.chat-bubble`'s `textContent`.
- The copy button on a chat bubble should be positioned to NOT overlap or push around the existing bubble layout. Consider a flex column wrap on `.chat-msg`, with the bubble first and a small action row below it.

### Files to modify

- `chat.js` — Modify `appendMessage()` to append the button DOM after the bubble (when role !== meta). Wire up clipboard logic. Add an analogous button to the composer area on chat boot (`bootChat()`), keeping it in sync with the textarea's content (show/hide based on whether the input is empty — use the existing `input.addEventListener('input', autoGrow)` as a hook).
- `app.css` — Add styles for `.chat-copy-btn` and its hover/focus/active states. Adjust `.chat-msg` to support the new layout if needed (e.g. switch to `flex-direction: column` and align actions to the message's anchor side — `flex-start` for assistant, `flex-end` for user).
- `chat.html` — Optionally add a wrapper element for the composer copy button if it's cleaner than injecting from JS. Either approach is fine; mention which you chose.

### Out of scope

- Don't change anything about how messages are appended or stored.
- Don't add a "copy reading as JSON" or any other variant — just plain text copy of the visible bubble content.
- Don't restyle existing chat bubble colors, dimensions, or layout beyond what's needed to accommodate the new button row.

### Verification

Test by:
1. Sending a message in the chat. Confirm a copy button appears under your user bubble (right-edge, since user bubbles are right-aligned) and under the assistant's reply (left-edge).
2. Click the copy button on the assistant message. Paste into a text editor — should be the clean reading text.
3. Type into the composer. Confirm the composer copy button appears (or becomes enabled). Click it, paste — should be the textarea contents.
4. Confirm meta messages (the "Reading the spread…" placeholder, card-flip messages with mini-cards) do NOT have copy buttons.
5. Tab through the chat with the keyboard — copy buttons should be focusable and triggerable with Enter or Space.

---

## Prompt 2: Verify the chat payload is reaching the model intact

### Context

Tarot 52 sends a structured JSON payload from the browser to a Vercel serverless function at `/api/chat` (file: `api/chat.js`). The frontend builds the payload in `chat.js` via `createLLMPayload(phase)` at `chat.js:306`. The shape sent to the API is:

```js
{
  phase: 'initial' | 'followup',
  systemPrompt: string,                    // composed of SHARED_PREAMBLE + mode briefing + STYLE_GUIDE
  mode: {
    count: number,                         // 1, 2, 3, or 10
    label: string,                         // e.g. "General Insight", "Past / Present / Future"
    positions: [                           // mode.positions metadata
      { name: string, prompt: string },
      ...
    ],
  },
  userPrompt: string,                      // the querent's inquiry text
  cards: [
    {
      rank, suit, symbol, colorClass,
      name,                                // e.g. "Ace of Clubs"
      term,                                // e.g. "Inspiration"
      tarot,                               // e.g. "Ace of Wands" (RWS equivalent)
      positionIndex,
      positionName,                        // e.g. "Past"
      positionPrompt,                      // per-position interpretation guidance
      description,                         // enriched from lore.json (RWS card description)
    },
    ...
  ],
  knowledgeBase: [
    { title, path, content },              // each markdown doc from knowledge/manifest.json
    ...
  ],
  initialReading: string,                  // present on follow-up phases
  followUps: [
    { role: 'user' | 'assistant', content: string },
    ...
  ],
}
```

The backend (`api/chat.js`) receives the payload, calls `buildInput(payload)` at `api/chat.js:46` to construct a single string `input` for the OpenAI Responses API, and uses `payload.systemPrompt` as `instructions`. The OpenAI call is:

```js
fetch('https://api.openai.com/v1/responses', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: process.env.OPENAI_MODEL || 'gpt-5-mini',
    instructions,
    input: buildInput(payload),
  }),
});
```

The frontend logs the last payload to `window.Tarot52LastLLMPayload` (see `chat.js:381` and `chat.js:410`) for debugging in the browser console.

### Concern

We're not 100% confident that the model is actually receiving and processing the full structured payload. Symptoms might include: replies that ignore the `positionName` context, knowledge base content not influencing the read, follow-ups treating the original draw as if it weren't visible, etc. We want **observability** to confirm what the model sees, end to end.

### Task

Build a verification path with both an automated check and an observability surface, in this order:

1. **Server-side logging.** In `api/chat.js`:
   - Before the OpenAI fetch, log (via `console.log` — Vercel captures these in function logs) a structured summary of the outgoing request: `phase`, `model`, `mode.label`, `cards.length`, `cards.map(c => c.name + '/' + c.positionName)`, `knowledgeBase.map(d => d.title)`, `userPrompt.length`, `instructions.length`, and `input.length`. Use a clear log prefix like `[tarot52:request]` so it's greppable.
   - After the OpenAI response (success path), log `[tarot52:response]` with `model`, `responseId`, `data.usage` if available, and `text.length`. On failure, log `[tarot52:error]` with status code and error message.
   - Do NOT log the full instructions text, the full input text, or the API key. Lengths and counts are sufficient and avoid accidentally leaking knowledge base content or system prompts.

2. **Debug echo mode.** Add a query string trigger that returns the constructed prompt instead of calling OpenAI:
   - If the request URL has `?debug=1`, OR if the request body includes `"_debug": true` at the top level, OR if `process.env.TAROT52_DEBUG === '1'`, skip the OpenAI call entirely and return a JSON response of shape:
     ```js
     {
       debug: true,
       model: <model that would have been used>,
       instructions: <full systemPrompt sent>,
       input: <full buildInput(payload) output>,
       payloadSummary: { phase, mode: payload.mode, cardCount, knowledgeDocCount, followUpCount },
     }
     ```
   - This lets the user (or a test script) hit the endpoint and inspect EXACTLY what the model would have received.

3. **Frontend debug helper.** Add a globally exposed helper `window.Tarot52Debug` with these methods:
   - `Tarot52Debug.dumpLastPayload()` — pretty-prints `window.Tarot52LastLLMPayload` to the console.
   - `Tarot52Debug.echoLastPayload()` — sends the last payload to `/api/chat?debug=1` and console-logs the response (the actual instructions + input strings). This is the round-trip verification: it confirms what the frontend SENT and what the backend ASSEMBLED.
   - `Tarot52Debug.diff()` — runs `echoLastPayload()`, then compares: (a) does `instructions` in the response match `payload.systemPrompt` verbatim? (b) does `input` contain `payload.userPrompt`? (c) does `input` contain each `card.name`, each `card.positionName`, and each knowledge doc title? Logs PASS/FAIL for each check.

4. **README documentation.** Add a short section to `README.md` (under "OpenAI API setup" or after it) titled "Debugging the model payload" with three lines:
   - How to use `Tarot52Debug.diff()` in the browser console.
   - How to hit `/api/chat?debug=1` directly with curl.
   - Where the Vercel logs surface (mention `vercel logs` or the Vercel dashboard).

### Requirements

- Do not change the existing payload shape. This is purely additive observability.
- The debug echo must NOT call OpenAI (it would waste API spend). It only reconstructs what would have been sent.
- The debug echo path should still go through CORS handling (use the existing `jsonResponse` helper).
- The `Tarot52Debug` helper should be a no-op (with a console warning) if `window.Tarot52LastLLMPayload` is empty — e.g. the user hasn't sent a message yet.
- Keep the logging compact in production; do not log per-message-token detail. The goal is "did the cards and knowledge get through," not "what every word was."

### Out of scope

- Don't add a UI debug panel. Browser console + Vercel logs are sufficient.
- Don't add automated tests / a test framework. The task is observability, not a test suite.
- Don't change which model is called or how the OpenAI Responses API is invoked.

### Verification

1. Open the app, send a message, complete a reading.
2. In the browser console, run `Tarot52Debug.diff()`. Expect PASS for all three checks.
3. From a terminal, run something like:
   ```bash
   curl -X POST 'https://your-deployment.vercel.app/api/chat?debug=1' \
     -H 'Content-Type: application/json' \
     -d "$(node -e 'console.log(JSON.stringify(...))')"
   ```
   (Or just paste the last payload from `window.Tarot52LastLLMPayload` after stringifying.)
   Confirm the response contains the full `instructions` and `input` strings.
4. Check Vercel logs (`vercel logs <deployment-url>`) and confirm `[tarot52:request]` and `[tarot52:response]` entries appear with the expected card counts and knowledge doc counts.

---

## Prompt 3: Astrology birth chart input (sun / moon / rising) blended into readings

### Context

Tarot 52 is a tarot reading app that runs a chat-first session for each reading. The current flow:

1. User opens the app, picks a reading mode (1, 2, 3, or 10 cards).
2. Types their question.
3. Draws the cards by clicking them in the spread sidebar.
4. The frontend assembles a payload (see `createLLMPayload` at `chat.js:306`) and sends it to `/api/chat`, which forwards to OpenAI.
5. The model reads using the system prompt, the question, the cards, and a knowledge base of markdown docs in `knowledge/`.

The system prompts live in `app.js`:
- `SHARED_PREAMBLE` at `app.js:59` — identity and posture rules applied to every mode.
- Mode-specific briefings at `app.js:84` onward (`READING_MODES[1]`, `[2]`, `[3]`, `[10]`).
- `STYLE_GUIDE` at `app.js:70` — voice and formatting rules.

The chat UI has a "New" button (top right of the chat header — `#chatNewBtn` in `chat.html`) that opens a modal (`#newChatModalBackdrop`) for choosing a reading mode before starting a fresh session. Persistence uses `sessionStorage` with the key `'tarot52.activeModeCount'`; see `SESSION_MODE_KEY` at `chat.js:7` for the pattern.

### Task

Add an optional astrology profile (sun, moon, rising signs) that the querent can set once and which gets blended into every reading.

### Feature requirements

**1. Capture the user's signs.**

Add a small "Profile" / "Birth chart" UI surface. Recommended approach:
- Add a settings/gear button to the chat header (`chat.html`), styled like the existing `#chatNewBtn`. Use a gear or person SVG icon.
- Clicking it opens a modal (reuse the modal-backdrop / modal pattern from `#newChatModalBackdrop` for visual consistency).
- The modal contains:
  - A short explainer: "Optionally add your sun, moon, and rising signs. They'll inform every reading in this session." (or similar — match the app's grounded, non-mystical tone).
  - Three `<select>` inputs labelled "Sun", "Moon", "Rising". Each select has 13 options: a default `"— not set —"` and the 12 zodiac signs (Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces).
  - Save and Clear buttons.
- "Save" persists the signs to `localStorage` (not `sessionStorage` — these are a stable personal trait, not a per-session pick) under the key `'tarot52.astrologyProfile'` as JSON `{ sun, moon, rising }`. Use `null` for unset slots.
- "Clear" removes the saved value.

**2. Surface whether a profile is set.**

When a profile has any sign set, indicate it subtly:
- Change the settings button to show a small dot or accent color so the user knows their info is loaded.
- On opening the modal, pre-populate the selects with the saved values.

**3. Blend into payloads.**

In `chat.js`, when `createLLMPayload()` builds the payload, include an `astrologyProfile` field on the payload (only when at least one sign is set — omit the field entirely if all three are null). Shape:
```js
astrologyProfile: { sun: 'Leo', moon: 'Scorpio', rising: 'Aquarius' }
```

In `api/chat.js`, modify `buildInput(payload)` to append a clearly-labelled section when `astrologyProfile` is present. Place it AFTER the cards block and BEFORE the knowledge base, with a label that signals to the model it's optional context (something like `"Querent's birth chart (use as additional interpretive context, not as the primary lens):"`).

**4. System prompt awareness.**

Add a sentence to `SHARED_PREAMBLE` in `app.js` that tells the model how to handle astrology context:
- The model should weave astrology context in *when relevant* (e.g. a fire-sign sun querent drawing many Clubs/Wands — comment on the resonance), but it must NEVER predict based on astrology, push astrology onto a question that didn't ask for it, or default to astrology-heavy framing when only one or two signs are set.
- The cards remain the primary frame. Astrology is supporting color, not the lens.
- If the querent has no astrology profile set, do not mention it at all — no "I notice you haven't told me your signs" prompts.

### Files to modify

- `chat.html` — Add the settings button to `<header class="chat-header">` and the modal markup (mirror the structure of `#newChatModalBackdrop`).
- `app.css` — Styles for the new button (use the existing `.chat-new-btn` pattern as a starting point) and the modal's three selects laid out in a row or stack.
- `chat.js`:
  - Add a constant for the localStorage key.
  - Add load/save/clear helpers (mirror the pattern of `readSessionInt` / `writeSessionValue` at `chat.js:10–35`).
  - Wire up the new modal (open/close, populate selects, save button persists, clear button wipes).
  - Update `state` to carry the current profile.
  - Update `createLLMPayload()` to attach `astrologyProfile` when present.
  - Update the settings button's visual state when a profile is set.
- `api/chat.js` — Update `buildInput()` to emit the astrology section.
- `app.js` — Add one sentence to `SHARED_PREAMBLE` (line 59 area) about how to use astrology context.

### Requirements

- **Optional all the way through.** No reading should fail or feel incomplete because astrology isn't set.
- **Stable across sessions.** Astrology is a person trait, not a session pick — use `localStorage`. The "New" reading button must NOT clear the astrology profile.
- **Independent of mode.** All four reading modes (1, 2, 3, 10-card) should get the same astrology context. The blending instruction goes in `SHARED_PREAMBLE`, not in per-mode briefings.
- **Partial profiles are valid.** A querent might know only their sun sign. Send what's set; omit unset slots from the JSON object entirely.
- **Tone consistency.** The UI copy must match the app's grounded, anti-mystical voice. No "✨ unlock cosmic insights ✨" — just "Add your signs to inform readings."
- **Accessibility.** The settings button needs `aria-label`, the modal needs `role="dialog"` + `aria-modal="true"`, selects need `<label>` elements. Mirror what's already in place for the New Chat modal.

### Out of scope

- Don't add a birth date / birth time / birth location picker. Just the three signs.
- Don't add houses, aspects, transits, retrograde flags, or any other astrological depth. Sun / Moon / Rising only.
- Don't compute the chart from a date — the user enters the signs directly.
- Don't add a "what are my signs?" lookup or tutorial. If they don't know, they leave it unset.
- Don't display the loaded profile in the chat thread itself (no "Reading for a Leo sun…" header). It's invisible to the user but visible to the model.

### Verification

1. Open the app, click the new settings/profile button in the chat header. Modal opens.
2. Set sun = Leo, leave moon and rising unset. Save. Modal closes. Reopen — Leo persists in the dropdown.
3. Close and reopen the browser tab — the profile is still there (localStorage).
4. Start a reading. In the console, run `Tarot52LastLLMPayload.astrologyProfile` and confirm `{ sun: 'Leo' }` is present (no moon/rising keys).
5. Hit `/api/chat?debug=1` (if Prompt 2 is implemented) or temporarily log `buildInput()` output in `api/chat.js` — confirm the astrology section appears between cards and knowledge base.
6. Clear the profile via the modal. Start another reading. Confirm `astrologyProfile` is absent from the payload entirely.
7. Click "New" to start a fresh reading session — the astrology profile should remain set (this is the test that distinguishes localStorage from sessionStorage).
