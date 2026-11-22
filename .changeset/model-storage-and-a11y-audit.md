---
"localmind": minor
---

Every model download in one list, and a stricter accessibility audit

Settings now has a Model storage section: each catalogue model whose weights are
actually on this device, with its real size, whether it sits in OPFS or cache
storage, and a delete button that works on that model rather than only on the one
you have selected. Sizes come from the files themselves, not from an estimate, and
a model that appears in both stores is counted once. The same panel reports what
the site is using against its quota and adds the WebGPU adapter limits that decide
whether a model can fit.

The axe audit now also runs with the mobile drawer open, and it immediately failed:
the scroll-to-bottom cue was 23 px tall and the Thinking-effort select was a
text-sized touch target. Both now meet the 24x24 minimum, and the drawer is clean.
