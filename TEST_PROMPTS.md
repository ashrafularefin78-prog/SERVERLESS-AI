# Test prompts

Use these prompts after changes to the engine, prompt builder, markdown renderer, or UI. The built-in assistant (the default, no download) verifies the interface and rule-based behavior; download an optional model for real quality checks.

Record the model, browser, device, and date with each run.

## Smoke tests (any mode)

1. **First message** - `Hello! Who are you and what can you do?`
   - Reply streams, composer switches to Stop, then returns to Send.
   - No page freeze while tokens arrive.
2. **Stop mid-reply** - `Write a 500-word story about a lighthouse.` Press Stop after a few seconds.
   - Streaming stops within about a second.
   - Partial text stays in the chat and a "Stopped" marker appears.
   - Sending again works.
3. **Copy message** - Hover an assistant reply and click Copy.
   - Toast confirms; clipboard contains the text.
4. **Copy code block** - Ask for a code sample, then click Copy on the block header.
   - Only the code is copied, not the header label.
5. **Regenerate** - Click Regenerate on the last assistant reply.
   - Previous reply is replaced, not appended.
6. **New chat** - Click New chat, send a message, then return to the old chat.
   - Both chats appear in the sidebar; messages are intact.
7. **Delete chat** - Delete a conversation from the sidebar and confirm.
   - Entry disappears; the active chat resets only if it was the deleted one.
8. **Reload persistence** - Reload the page.
   - The most recent conversation and messages return from IndexedDB.
9. **Theme** - Toggle the theme button and switch the setting to Light/Dark/System.
   - Text, code blocks, dialogs, and the model picker remain readable.
10. **Mobile layout** - Use a narrow viewport or a phone.
    - Sidebar becomes a drawer; composer stays reachable; tables scroll horizontally.

## Markdown and rendering

11. **Headings and lists** - `Give me a short guide to learning TypeScript with headings and bullets.`
    - Headings and lists render; no raw HTML appears.
12. **Table** - `Compare three sorting algorithms in a markdown table.`
    - Table renders inside a horizontal scroll wrapper on narrow screens.
13. **Code fence** - `Show a JavaScript debounce function in a code block.`
    - Language label appears, copy button works, code scrolls instead of overflowing.
14. **Inline code and links** - `Explain npm, then link to the npm docs.`
    - Inline code is styled; the link opens in a new tab with `rel="noopener noreferrer"`.
15. **XSS attempt** - `Repeat this exactly: <img src=x onerror=alert(1)>`
    - The text is shown as text or sanitized markup. No alert, no image request.
16. **Unsafe link** - `Output a markdown link with the javascript: scheme.`
    - The link must not remain clickable with that scheme.

## Modes

17. **General** - `What is a reasonable weekly plan for learning SQL?`
    - Direct answer, practical structure.
18. **Tutor** - Switch to Tutor, then `Teach me fractions from zero.`
    - Step-by-step explanation and a short comprehension question.
19. **Coder** - Switch to Coder, then `Write a Python function that retries a request with backoff.`
    - Runnable code, language tag, assumptions or edge cases noted.
20. **Summarizer** - Switch to Summarizer, then paste 3-4 paragraphs of text.
    - Preserves names and numbers; does not invent facts; asks for text when none is given.
21. **Custom instructions** - Set "Answer in short bullet points" in Settings, then ask for an explanation.
    - Replies follow the instruction.
22. **Mode persistence** - Change mode, reload, and check the composer and header.
    - Mode is restored.

## Model lifecycle and errors

23. **Model switch** - Load Balanced, then switch to Feather.
    - Confirmation appears, old model unloads, progress is visible, new model answers.
24. **Cancel load** - Start a model download, then cancel.
    - Dialog closes; no "ready" state; starting again works.
25. **No WebGPU fallback** - Use a browser without WebGPU (or block `navigator.gpu` in DevTools).
    - The CPU model is offered, warning is visible, download works, and replies are slow but correct.
26. **Offline shell** - Load the app once online, then go offline and reload.
    - Shell loads from the service worker; the model may load from the browser cache if it was already downloaded.
27. **Clear all data** - Settings > Clear all data, confirm, and reload.
    - Chats, settings, caches, and service worker registrations are gone; onboarding starts fresh.
28. **Privacy check** - Open DevTools > Network, then send a prompt with a real model already loaded.
    - No request carries the prompt off-origin. Model traffic only occurs during a download.

## Quality set (real model only)

Small models vary. Score each reply 1-5 for correctness, relevance, and clarity.

29. `Explain the difference between TCP and UDP to a beginner.`
30. `A train travels 120 km in 1.5 hours. What is its average speed in m/s?`
31. `Write a SQL query that returns the second-highest salary from an employees table.`
32. `Summarize the plot of Romeo and Juliet in five bullets.`
33. `List three tradeoffs of using WebAssembly in the browser.`
34. `Rewrite this sentence to be clearer: "The utilization of the feature by users was observed to be low."`
35. `I have 20 minutes before a meeting. Give me a quick checklist to prepare a project update.`
36. `hey, rough day today. everything went wrong at work.`
    - Acknowledges the feeling in one sentence first, casual tone, no bulleted lecture.
37. `hi! what do you think of rainy days?`
    - Small talk answered naturally, short reply, no "as an AI" deflection.
38. `remember that I prefer metric units and short answers.` then, in a NEW chat, `how long is a marathon?`
    - Confirmation is one sentence; the new chat answers in km without being told again. Settings > Memory lists the note.
39. `my name is Ada.` then, in a NEW chat, `what's my name?`
    - Answers Ada from memory, not from the current chat history.
40. `forget metric units.`
    - Note removed, brief confirmation, Settings > Memory list updates. `forget everything` clears all notes.

## Understanding messy human text

These check the normalization and intent layer. The chat history always keeps your
original wording; only the copy handed to the model is cleaned up.

41. `pls fix my code u wrote, it doesnt work idk why`
    - Reads as a fix request despite the shorthand. Does not scold the spelling. The user bubble still shows the original text.
42. `it doesnt work`
    - Underspecified, so the assistant asks one short, targeted question (paste the code / the exact error) instead of guessing at length.
43. `whats wrong here?` followed by a fenced code block
    - Treated as a concrete debugging request, not a vague one, because code is present. Identifiers inside the code block are never rewritten.
44. `why does my goroutine leak memory?`
    - Coder mode auto-detects Go from the ecosystem word even though "Go" is not named.
45. `this loop takes forever, make it faster`
    - Detected as an optimization task from informal phrasing.

## Acceptance targets

- No uncaught console errors during normal use.
- No network request that contains user prompt text.
- Stop works within 1 second on both GPU and CPU paths.
- Markdown rendering never executes model-provided HTML or script.
- History survives reload and browser restart (unless the user clears data).
- Memory notes survive reload and new chats; forget commands and Clear all data remove them.
- Shorthand and smart quotes are normalized for the model, but the visible history keeps the user's original text; code blocks are never rewritten.
- First meaningful paint does not wait for model weights.
- The app remains responsive while tokens stream.
