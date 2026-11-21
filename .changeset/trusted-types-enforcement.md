---
"localmind": minor
---

Enforce Trusted Types. Every HTML sink now goes through one sanitizing policy, so a raw string can no longer reach `innerHTML`, and the service worker URL is minted by that same policy. Browsers without Trusted Types take the identical sanitizing path.
