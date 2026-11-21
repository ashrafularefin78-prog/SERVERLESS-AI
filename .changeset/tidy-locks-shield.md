---
"localmind": minor
---

Add an offline kill switch: while it is on, the service worker refuses every cross-origin request, whatever its method, and the sidebar shows a badge. The state survives a reload, model and embedding downloads explain why they are blocked, and the app keeps working from cached assets.
