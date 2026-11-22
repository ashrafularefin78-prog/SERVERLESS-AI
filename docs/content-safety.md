# Content safety

LocalMind runs models it did not train on a device it does not control, for a user
whose judgement it cannot replace. This page states exactly where the app draws the
line, why it does not ship a content filter, and what it does instead.

## What is in the catalogue

169 WebLLM models, from 0.5B to 9B, plus 529 community GGUF entries (37 featured by
hand, 492 generated from Hugging Face on a schedule) - 698 catalogue entries in
total. 504 of the GGUF entries are flagged `uncensored`: abliterated builds whose
refusal behaviour was removed, labelled as such by their publishers and by their
file names. They are filterable with the
"uncensored" search term, carry an `uncensored` chip in the picker, and every one of
them is opt-in: the default experience is the built-in rule assistant, which never
downloads anything.

## What the app does, today

- **A persistent warning while an uncensored model is selected.** Not a dismissible
  toast: the model panel shows a bordered note saying the model will not decline
  harmful requests, and that its output is the model's, not the app's.
- **A licence gate before the weights load.** Model licences are curated for 38 of
  the 169 WebLLM entries; everything else is `unknown` and requires an explicit
  acceptance with a link to the model card. Community GGUF builds land in that
  category, so the warning above is not the only step.
- **No hidden second download.** A classifier would be a second model, hundreds of
  megabytes, for a user who may have chosen this app precisely because it downloads
  one thing they picked.
- **The rule assistant refuses.** The built-in engine is not the neural one: it has
  local guardrails that decline prompt-injection and jailbreak framings
  (`src/guardrails.ts`), refuse to roleplay as an "unrestricted" persona, and warn
  before a message that looks like personal data. It answers a fraction of what a
  model can, and never pretends otherwise.
- **Nothing is uploaded, so nothing is logged server-side.** There is no account, no
  moderation endpoint, and no report button that sends your text anywhere. The
  trade-off runs both ways: the app cannot report abuse, and cannot be compelled to
  hand it over.

## Why there is no content classifier

The suggestion is reasonable - a tiny on-device BERT that scores a reply before it
is shown. It was considered and declined for three reasons that are worth writing
down, because "we didn't get to it" and "we decided not to" are different answers.

1. **It would have to be a second model download.** A usable text classifier is
   100-700 MB. The app's promise is one download, from a source the user chose. A
   silent second fetch, or a "safety model" step in onboarding, makes a privacy tool
   heavier for everybody to serve a case the user did not ask for.
2. **It cannot be verified here.** This repository's model comparison and evaluation
   harness needs WebGPU hardware that the maintainer does not have. Shipping a
   classifier would mean shipping a behavioural claim - "harmful output is filtered" -
   that no test in this repository can back up. A classifier with a bad false-negative
   rate is worse than a warning, because it moves responsibility off the user without
   doing the work.
3. **It narrows a guarantee the app is selling.** "The model is the model you chose,
   running on your device" is checkable. "The app will protect you from it" is not,
   especially for abliterated models whose whole point is to comply.

What an organisation that needs a filter can do without forking: put LocalMind behind
an extension or proxy that inspects the rendered transcript, or run a moderated model
in a stack it controls. The app deliberately offers no hook for that inside the tab,
because a hook that can read replies can read prompts.

## What the user can do

- Stay on the built-in assistant, or pick a model from a publisher with its own
  safety training. The picker shows the family, size, and licence before download.
- Search "uncensored" to see which models are in that group, and avoid them.
- Delete weights at any time: Settings → **Model storage** lists every download on
  the device with its size, or **Delete download** removes the selected one.
- Arm the offline mode kill switch, which makes the service worker refuse every
  cross-origin request. That does not make output safer, but it does mean nothing
  can leave the tab while it is on.

## Known gaps

- **No output filtering at all.** If a model produces harmful text, the app renders
  it. The warning is the whole mitigation.
- **No age gate.** The app has no accounts and no age verification, so it cannot
  enforce one; it is not marketed to children.
- **No report flow.** There is nowhere to report a bad reply to, and no telemetry to
  notice it happening.
- **The 131 unverified licences are shown as "unknown", not as safe.** Most models in
  the catalogue have no curated licence entry, and the picker says so rather than
  guessing from a name.
