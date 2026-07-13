# Nexus Game Hub

Aggregated game-deals PWA: live price drops, 100%-free-to-keep games, and free-to-play
staples across PC, Xbox, PlayStation, and Switch. Installable, works offline.

## Stack & shape

- **No framework, no build step for the app.** Vanilla JS + HTML + CSS, served static.
  The only build is Tailwind compiling `src/input.css` -> `styles.css` (`npm run build:css`).
- All user state (favorites, library, manual deals, cached metadata) lives in
  **localStorage** — there is no database and no user auth. Storage keys are in the
  `STORAGE` object near the top of `app.js` (bump the version suffix to invalidate).
- **`app.js`** (~3,100 lines, single file) is the whole engine: static config, data
  pipelines, rendering, filters, persistence, Steam integration. Section banners
  (`/* --- N. TITLE --- */`) divide it; skim those to navigate.
- **`index.html`** is the shell (loads `styles.css` + `app.js`), **`sw.js`** is the
  service worker, `manifest.json` is the PWA manifest.

## Deployment — READ THIS

- **Host: Cloudflare Pages.** Deploys are **git-connected to the `main` branch**:
  every push to `main` triggers an automatic build + deploy. There is no manual deploy
  step and no CLI needed — just commit and push to `main`.
- **The Cloudflare project lives on a COLLABORATOR's account**, not the repo owner's.
  The GitHub repo is `github.com/davidgrgic89/nexus-game-hub` (a personal account we
  only have collaborator access to). Because you can't install the Cloudflare Pages
  GitHub App on someone else's personal account, the Pages project was connected from
  **davidgrgic89's own Cloudflare account**. Practical consequences:
  - We can't reach the Cloudflare dashboard for this project (different account).
  - To force a redeploy (e.g. after changing a secret), **push a commit** (an empty
    `git commit --allow-empty` works) — that's the only lever we control.
- **Build settings** (already configured in his dashboard): Framework preset **None**,
  Build command `npm run build:css`, Build output directory `/` (repo root). The
  committed `styles.css` also ships as-is, so a CSS build hiccup never blocks a deploy.
- Live URL: **https://nexus-game-hub.pages.dev/**
- `APP_BUILD` in `app.js` is a visible build marker (shown in the footer). Bump it on
  any user-facing change so it's obvious which deploy is live — and it's the fastest way
  to confirm a deploy landed (`curl` the live `app.js` and grep `APP_BUILD`).

## Backend: the one serverless function

`functions/api/steam.js` is a **Cloudflare Pages Function** (route `/api/steam`) — the
only server-side code. Steam's endpoints send no CORS headers, so the browser can't call
them directly; this function fetches Steam server-side and returns the body. It:

- **allow-lists** hosts (`store.steampowered.com`, `steamcommunity.com`,
  `api.steampowered.com`) so it can't be an open proxy;
- **injects the `STEAM_API_KEY` secret** server-side for `IPlayerService`/`ISteamUser`
  calls (the key never reaches the browser); returns `501 steam_api_key_missing` if the
  secret isn't set.

**`STEAM_API_KEY` is a Cloudflare Pages secret** (Settings -> Variables and Secrets, on
davidgrgic89's account). Cloudflare binds secrets **at deploy time**, so after changing
it you must **redeploy** (push a commit) for it to take effect.

The client also keeps a fallback chain of public CORS proxies (`CORS_PROXIES` in
`app.js`) — our function is index 0 and always tried first; keyed calls
(GetOwnedGames) use index 0 **only**, since public proxies can't inject the key.

## How Steam data works (three layers)

1. **Proxy** (`/api/steam`) — the plumbing above.
2. **Per-game metadata** — opening a game's detail modal resolves a Steam appID
   (`resolveSteamAppId`) and pulls appdetails (screenshots, trailers, description) via
   `fetchSteamMeta`, cached per title in localStorage. Trailers are the hero of the
   detail view.
3. **Library import** (`importSteamLibrary`) — resolves your profile keylessly (the
   profile summary XML still works anonymously), then pulls owned games via the official
   **`IPlayerService/GetOwnedGames`** Web API through our function.

### GOTCHA: Steam login-gates the public games page
Steam now **302-redirects `steamcommunity.com/.../games/` to `/login/` for any
logged-out request** (confirmed even on public profiles). The old keyless
`rgGames`/XML scrape is **permanently dead** — do not try to bring it back. Library
sync only works via `GetOwnedGames` + the server-side key. An empty `games` array from
that API genuinely means the target's "Game details" privacy is not Public (a setting
separate from profile visibility).

External data sources: CheapShark (deals + appID lookup), Steam (metadata + library),
Wikimedia/`COVER_ATLAS` (console box art), RAWG (optional, only if `RAWG_API_KEY` set —
blank by default).

## Local development

- `node .claude/static-server.js` serves the repo at `http://localhost:5177`
  (or use the `nexus` launch config / the /run skill). It's a dumb static file server.
- **It does NOT run the `/api/steam` function.** Locally that route 404s, so Steam
  calls fall through to the flaky public proxies, and **library sync (which needs the
  keyed function) won't work locally at all**. Verify Steam features against the live
  Cloudflare deploy, not localhost.

## Conventions

- **No em dashes** in generated text/UI copy (user-wide rule).
- Match the existing terse, heavily-commented style in `app.js`.
- Bump `APP_BUILD` on user-facing changes. Bump the `STORAGE.*` version suffix when a
  cached-data shape changes. Bump `CACHE` in `sw.js` only if the shell asset *list*
  changes (the SW is network-first for same-origin, so content updates ship without it).
