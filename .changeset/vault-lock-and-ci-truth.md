---
"localmind": patch
---

Close the auto-lock plaintext leak, and make CI tell the truth

The vault now finishes or cancels the streaming reply and writes one last
encrypted save before the key is dropped, and a tab-hide locks after a 60 second
grace period instead of instantly. Storage fails closed: with a vault present and
no key, a conversation save throws instead of writing readable messages, and
migrating a vault re-encrypts leftover plaintext rows rather than blocking the
unlock.

CI's OSV job now grants the `actions: read` permission its reusable workflow
declares, which was failing every run at startup. Workflows are pinned to commit
SHAs with version comments and checked by `npm run check:workflows`.

Also in this release: `npm run test:coverage` measures the real tree again after
two memory test files collided, the model-upgrade action is offered at the end of
the rule chain instead of only for listed topics, capable devices get a GPU
recommendation instead of silence, the reasoning-tag filter applies to every
model and explains an empty reply, the service worker keeps content-hashed assets
across updates, `npm run models:licenses` reads the same curated table as the app,
and Firefox runs the browser suite green.
