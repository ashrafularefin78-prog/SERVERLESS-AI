# Codespaces / dev container

`devcontainer.json` gives you a ready workspace with Node 22, Chromium for the
browser tests, and the editor extensions this project uses, so there is nothing
to install locally.

## Open it

- **GitHub Codespaces** — the repo page's **Code** button, then **Codespaces → Create codespace on main**.
- **VS Code** — install the _Dev Containers_ extension, then **Dev Containers: Clone Repository in Container Volume…**
- **GitHub CLI** — `gh codespace create -r <owner>/<repo>`.

The first build runs `npm ci` and downloads Chromium. After that:

```bash
npm run dev            # http://localhost:5173
npm test               # unit and eval tests
npm run test:e2e:preview  # build, serve, and run the Playwright suite
```

## GPU-free notes

On-device inference needs WebGPU, which a Codespace does not provide. Everything
else works: the rule engine, retrieval, encryption, storage, and the whole test
suite. The browser tests stub the device profile and block model downloads, so
they pass without a GPU. To try a real model, run the dev server on a machine
with WebGPU (`npm run dev -- --host`) and open it there.
