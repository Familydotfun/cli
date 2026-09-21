# @familydotfun/cli

The Family developer CLI: scaffold, run, build, and ship apps and modules that
run inside Family via the `@familydotfun/sdk` iframe bridge.

## Install

```sh
# from the repo (recommended until npm publish)
npm install -g github:Familydotfun/cli

# or from a local checkout of the repo
npm i -g ./packages/cli

# or without installing
npx -p github:Familydotfun/cli family help
```

Requires Node.js >= 18. The only dependency is [esbuild](https://esbuild.github.io/).
The CLI lives in the SDK repo: https://github.com/Familydotfun/sdk (`packages/cli`).

## Quickstart

```sh
family init app my-app      # scaffold family.manifest.json, package.json, src/
cd my-app
npm install                 # pulls @familydotfun/sdk (github) + esbuild + typescript
family dev                  # mock host → http://localhost:4729
family build                # → dist/index.html (self-contained, host anywhere)
```

## Commands

| Command | What it does |
| --- | --- |
| `family init app <name>` | Scaffold a Family app (user-mode iframe app). Refuses to overwrite an existing directory. |
| `family init module <name>` | Scaffold a Family module (family-surface module) with `surfaces: ["house"]`. |
| `family dev [--port N] [--app <url-or-dir>]` | Serve the mock Family host at `/` with your app in an iframe. Default port 4729. Serves the current project under `/app/*` — the entry's TypeScript is bundled with esbuild per request (bare imports like `@familydotfun/sdk` fully resolved) and the served html points at the bundle — or loads an external URL with `--app https://…`. |
| `family build` | Bundle the module entry from the html's `<script type="module">` tag (or `family.config.json` → `app`) and inline it into a single self-contained `dist/index.html`. |
| `family publish` | Print how publishing works — via the Family developer UI, no CLI upload. |
| `family deploy` | Print how hosting works — `dist/` on any static https host, URL into `manifest.entryUrl`. |
| `family help` | Show help. |

## What `family dev` gives you

The mock host at `/` is a self-contained page (no dependencies) with a control
bar above the app iframe:

- **Wallet** — editable fake wallet address (default `0xDeviCe0000000000000000000000000000babe`).
- **App ID** — editable app id, returned by `getContext`.
- **Scopes** — checkboxes for `user:identity`, `user:balance`, `payments:charge`,
  `storage:upload`, `store:read`, `store:write`; checked = granted. `getPermissions`
  returns exactly the checked scopes.
- **Balance** — a fake balance readout (display only).
- **Reset store** — clears the in-memory KV store.
- **Ask before charging** — toggle for the charge sheet. In ask mode every
  `payments.charge` shows a `window.confirm` with the split breakdown; off =
  charges auto-confirm. The bar also shows the last charge.
- **Store inspector** — collapsible `<details>` listing every stored key/value
  (values are JSON), live-updated on `store.set` / `store.delete` / reset.

The bridge speaks the real `family-sdk` postMessage protocol and only accepts
messages whose `event.source` is the app iframe:

| Method | Mock host behavior |
| --- | --- |
| `init` | `{ ok: true, hostVersion: "dev-1.0.0", supported: true, launchToken: "dev." + random }` |
| `getContext` | `{ mode: "user", wallet, appId }` from the bar inputs |
| `getPermissions` | Granted (checked) scopes |
| `identity.getMe` | `{ wallet, name: "dev.any", avatarUrl: null, role: "holder", balance: "0" }` |
| `store.get/set/delete/list` | In-memory `Map`, mirrored in the store inspector |
| `payments.charge` | Ask-mode confirm with split: platform 10%, family `max(shareBps, 500)` of the remaining 90%, rest to the developer. `shareBps` comes from the app URL's `?share=` query param (default 1000). Resolves `{ ok, chargeId: "dev_…", txHash, split }` or `{ ok: false, error }` when declined. |
| `storage.upload` | `{ ok: true, url: URL.createObjectURL(file), cid: "dev-cid" }` |
| `ui.toast` | Shows a toast in the bar |
| `ui.modal` | `window.confirm` with the modal title + body |
| anything else | Rejects with `unknown method: <name>` |

## How the mock host maps to production

| Mock host (`family dev`) | Production Family host |
| --- | --- |
| Wallet text input | User's connected wallet |
| App ID text input | Installed app id |
| Scope checkboxes | Permissions granted at install time (family head / user approval) |
| `launchToken: "dev.<random>"` | Short-lived JWT minted by the platform during `init` |
| In-memory `Map` + JSON inspector | Module-scoped KV storage persisted by the platform |
| `window.confirm` charge sheet | Native charge sheet; one signed on-chain transfer, backend writes the ledger split |
| `?share=` query param, default 1000, min 500 | `shareBps` from `family.manifest.json`, platform minimum applies |
| `URL.createObjectURL` + `cid: "dev-cid"` | Platform IPFS pipeline returns a real CID + gateway URL |
| Bar toast | Native Family toast UI |
| `window.confirm` modal | Native Family modal |
| `identity.getMe` → `dev.any`, balance `"0"` | Real ANS name, role, and token balance |
| `event.source` check on the iframe | Same protocol check against the registered app frame |
| `unknown method` error | Same protocol error |

## Publishing and hosting

There is no CLI upload. Publishing goes through the Family developer UI:
create the app, paste your manifest, the family head approves the requested
permissions, and the app goes live.

The bundle is a single self-contained `dist/index.html` (JS inlined), so it
can be hosted on any static https server. Put the hosted URL in
`family.manifest.json → entryUrl` before submitting.

## Repo layout

```
packages/cli
├── bin/family.mjs         # arg router (plain node, no deps)
└── src/commands/
    ├── init.mjs           # scaffold app/module
    ├── dev.mjs            # mock host + /app static server
    ├── build.mjs          # esbuild → self-contained dist/index.html
    ├── publish.mjs        # publishing guidance
    └── deploy.mjs         # hosting guidance
```
