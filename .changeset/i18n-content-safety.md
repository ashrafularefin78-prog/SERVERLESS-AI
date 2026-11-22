---
"localmind": minor
---

Spanish and German interface, a stated content-safety position, and a community page

The interface was English-only while the app offered coding help for 66 languages.
Navigation, controls, headings, dialog titles, buttons, placeholders, and
`aria-label`s now follow the browser in **English, Spanish, or German**, and can be
pinned in Settings. English stays in the markup and is its own key, so a missing
translation renders English rather than a blank button, and a locale the app does
not ship falls back instead of showing a half-translated mix. Locales are separate
chunks: a reader who stays on English downloads nothing extra.

`docs/content-safety.md` states what the app does and does not filter for the 504
uncensored community models it lists - and why it does not ship a classifier. An
uncensored model now keeps a bordered warning in Settings for as long as it is
selected, instead of only a chip in the picker.

The README gains a Community section covering Discussions (now enabled), the Code of
Conduct, CODEOWNERS routing, and the protected branch.
