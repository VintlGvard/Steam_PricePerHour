<div align="center">

<img src="icons/icon-128.png" alt="Steam PricePerHour" width="96" height="96" />

# Steam PricePerHour

**Smart value insights for Steam: shows a price/hour ratio badge on every game you're considering.**

[![Version](https://img.shields.io/badge/version-1.5.0-blue.svg)](https://github.com/VintlGvard/Steam_PricePerHour)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4.svg)](#-install)
[![Firefox](https://img.shields.io/badge/Firefox-MV2-FF7139.svg)](#-install)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/VintlGvard/Steam_PricePerHour/pulls)

Install: [Chrome Web Store](https://chromewebstore.google.com/detail/steam-priceperhour/pkpenhdpcdkmhelhlbbdddedipkmngco) · [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/steam-priceperhour/)

No accounts. No telemetry. Just open Steam and see whether that game is actually worth the money.

[Features](#-features) • [Install](#-install) • [Settings](#-settings) • [How It Works](#-how-it-works) • [Project Structure](#-project-structure) • [Privacy](#-privacy--security) • [Limitations](#-limitations) • [Development](#-development) • [Contributing](#-contributing) • [License](#-license)

</div>

---

## 💡 Why?

Steam tells you what a game costs, but not what it's worth. The sticker price alone is a poor basis for comparison, since value depends on how many hours of playtime that money buys. This extension adds a **price/hour ratio badge** directly to Steam's own pages, powered by playtime data from the SPPH API, so you can evaluate any game's value at a glance without leaving the store.

## ✨ Features

|                          |                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 🔍 **Search results**    | Ratio badges on every row in Steam search results                                                                                               |
| 🏠 **Home & storefront** | Coverage for home spotlight capsules and sale capsules on the storefront                                                                        |
| 🏷️ **Sales**             | Badges on discounted capsules so you can tell a real deal from a fake one                                                                       |
| 🧩 **Bundles**           | Bundle pricing aggregated from bundled items, including dedicated `/bundle/N` pages                                                             |
| 🎮 **Game pages**        | Main-store badge on individual game pages (`/app/N`)                                                                                            |
| 📦 **DLC rows**          | Separate badges on DLC purchase rows                                                                                                            |
| 💹 **Price/hour ratio**  | Calculated as price ÷ playtime for the selected value mode                                                                                      |
| 💱 **Currency parsing**  | Detects common currency symbols and ISO codes directly from the page; falls back to the raw `¤` placeholder when a currency can't be identified |
| 🕘 **Value modes**       | Main story / Story + Extras / Full completion — switch which playtime drives the badge                                                          |
| ⏳ **Cache TTL**         | Found entries cached for 7 days; "not found" results are memory-only (not persisted) and a page reload always retries the API; one-click **Clear cache** in the popup                                       |
| 🌐 **EN/RU UI**          | Popup is fully localized in English and Russian                                                                                                 |
| 💾 **Auto-save**         | Every setting is saved to `storage.local` immediately and applies to already-open Steam tabs                                                    |

## 🚀 Install

### Chrome / Chromium

**Option A — from the Chrome Web Store (recommended):**

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/steam-priceperhour/pkpenhdpcdkmhelhlbbdddedipkmngco)
2. The extension icon appears in the toolbar — pin it and open a Steam page

**Option B — packaged:**

1. Get the release artifacts (they appear in `releases/` after `npm run release`)
2. Open `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **Load unpacked** and select the `releases/chrome-unpacked/` folder
5. The extension icon appears in the toolbar — pin it and open a Steam page

**Option B — from source:** run `npm run build` and load the `dist/chrome/` folder the same way.

The `releases/steam-priceperhour-chrome.zip` is also suitable for direct upload to the Chrome Web Store dashboard (manifest at ZIP root).

### Firefox

**Option A — from Firefox Add-ons (recommended):**

1. Install from [Firefox Add-ons (AMO)](https://addons.mozilla.org/en-US/firefox/addon/steam-priceperhour/)
2. The extension icon appears in the toolbar — pin it and open a Steam page

**Option B — packaged (temporary load):**

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `releases/steam-priceperhour-firefox.xpi`

> ⚠️ Temporary add-ons are removed when Firefox restarts. Reinstall after each restart.

**Option C — unpacked folder:**

1. In `about:config`, set `xpinstall.signatures.required` to `false` (required only for unpacked/unsigned installs)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** and select the `releases/firefox-unpacked/manifest.json` file (or `dist/firefox/manifest.json` after a local build)

## ⚙️ Settings

All settings live in the popup and are saved automatically as you change them.

| Setting              | Description                                                                                                                              |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Value mode**       | Which playtime figure drives the ratio: **Story** (main), **Story + Extras**, or **Full completion**                                     |
| **Acceptable price** | Your "reasonable" price-per-hour threshold (default `0.5`). The scale's center band is your acceptable ±20% target range; lower is better |
| **Language**         | Popup UI language — English or Russian                                                                                                   |
| **Clear cache**      | One click wipes all cached playtime entries (`spph_cache_*`, `spph_nf_*` keys)                                                           |

## 🛠 How It Works

1. The **content script** runs on `store.steampowered.com/*` and `steampowered.com/*` and detects game cards: search rows, sale capsules, home spotlight, bundle wrappers, app pages and DLC rows.
2. For each game it reads the title and the displayed price (parsing currency symbols/ISO codes, discount final price, DLC price, or full bundle price).
3. The **service worker** fetches playtime data from the SPPH API (`spph.vintlgvard.com`) using the game's Steam AppID.
4. Playtime results are cached in `storage.local`; the badge shows `price ÷ hours` for the active value mode.
5. The **service worker** coordinates storage, tab messages and cache logic between the popup and the content scripts.

**Retries & backoff** — if the SPPH API responds with HTTP 429 (`rate_limited`), requests are retried up to 3 times with a linear backoff (500 ms × attempt number) in the service worker; the content script applies its own retry logic of up to 3 attempts with a 1500 ms delay.

```
┌───────────────┐   messages    ┌──────────────────┐   storage    ┌──────────────┐
│  content.js   │ ────────────▶ │  service_worker  │ ───────────▶ │ storage.local│
│ (Steam pages) │               └──────────────────┘              │  (cache+cfg) │
└──────┬────────┘                      ▲                          └──────────────┘
       │  playtime lookup               │ popup settings
       ▼                                │
┌───────────────┐              ┌───────────────┐
│   SPPH API    │              │   popup.js    │
│ (spph.vintl-  │              │ (toolbar popup│
│  gvard.com)   │              │   EN/RU, TTL) │
└───────────────┘              └───────────────┘
```

## 📂 Project Structure

```
Steam_PricePerHour/
├── src/                          # Shared source code (single codebase)
│   ├── content.js                # Badge engine for all Steam page types
│   ├── service_worker.js         # Background: API requests, storage, cache
│   ├── popup.html / popup.js / popup.css
│   ├── styles.css                # Badge + tooltip styles injected into Steam pages
│   ├── modules/                   # Shared modules: api, badge, cache, events, index, observer, parser, settings, utils
│   └── manifests/
│       ├── chrome.json           # Manifest V3 for Chrome/Chromium
│       └── firefox.json          # Manifest V2 for Firefox
├── icons/                        # Extension icons (shared)
├── dist/                         # Build output (generated)
│   ├── chrome/                   # Ready-to-load Chrome extension
│   └── firefox/                  # Ready-to-load Firefox extension
├── releases/                     # Release artifacts (gitignored): chrome-unpacked/, firefox-unpacked/, ZIP + XPI
├── webpack.chrome.js             # Webpack config for Chrome build
├── webpack.firefox.js            # Webpack config for Firefox build
├── .env                          # API keys (gitignored, not in repo)
├── .env.example                  # API keys template
├── package.json                  # Dependencies and build scripts
└── README.md
```

Both builds share the same source code — only the manifest differs (MV3 vs MV2). The build system automatically generates browser-specific bundles.

## 🔒 Privacy & Security

- **Local storage only** — settings and cached playtime data live in `chrome.storage.local` (browser-only, no sync, no cloud).
- **Two request domains only** — the extension talks to `store.steampowered.com` (to read page data it already needs) and `spph.vintlgvard.com` (playtime API). Nothing else, ever.
- **No backend, no analytics, no tracking** — there is no telemetry, no third-party CDNs, no external beacons. Permission scope is limited to `storage` plus the two domains above.

## ⚠️ Limitations

- **Steam DOM changes** — badges depend on Steam's markup (CSS selectors like `.search_result_row`, `.sale_capsule_target`, `.game_area_dlc_row`, `[data-ds-bundle-data]`). If Valve ships a redesign, some selectors may silently break until the extension is updated.
- **API availability** — a game without an entry in the SPPH database shows no ratio; the "not found" result is suppressed in memory only, so a page reload always retries the API.
- **Bundle items without titles** — some bundle payloads (from `data-ds-bundle-data`) list items without readable titles; those items are skipped, so the bundle aggregate may cover only part of the bundle.
- **Cache freshness** — playtime data is cached for up to 7 days and only refreshed when the badge is rendered for a cached game or cache is cleared manually.

## 🔧 Development

### Prerequisites

- Node.js >= 18.0.0
- npm

### Setup

```bash
npm install
cp .env.example .env
# Edit .env and add your API keys
```

### Build

```bash
npm run build          # Build both Chrome and Firefox extensions
npm run build:chrome   # Build Chrome extension only
npm run build:firefox  # Build Firefox extension only
npm run release        # Build and package for distribution (creates ZIP/XPI)
```

Build output is in `dist/chrome/` and `dist/firefox/`. The `postbuild` step copies each bundle to `releases/chrome-unpacked/` and `releases/firefox-unpacked/`. `npm run release` additionally packages them as `releases/steam-priceperhour-chrome.zip` and `releases/steam-priceperhour-firefox.xpi`.

### Version Management

```bash
npm run version        # Auto-detect version bump based on changes
npm run version:major  # Force major version bump (breaking changes)
npm run version:minor  # Force minor version bump (new features)
npm run version:patch  # Force patch version bump (bug fixes)
```

The version script analyzes git commits since the last tag and suggests version bumps:

- **Major**: Breaking changes or `!:` in commit messages
- **Minor**: New features (`feat:`) or >10 files changed
- **Patch**: Bug fixes (`fix:`) or any commits

Updates version in `package.json` and both manifest files. Optionally creates git tags.

### Development mode (watch)

```bash
npm run dev:chrome     # Watch mode for Chrome
npm run dev:firefox    # Watch mode for Firefox
```

### Code quality

```bash
npm run lint           # Check code with ESLint
npm run lint:fix       # Auto-fix ESLint issues
npm run format         # Format code with Prettier
npm run format:check   # Check formatting
```

### Testing

Load the built extension as an unpacked extension:

- **Chrome**: Load the `releases/chrome-unpacked/` folder (or `dist/chrome/` after a local build)
- **Firefox**: Load `releases/firefox-unpacked/manifest.json` (or `dist/firefox/manifest.json`)

Then test on `store.steampowered.com`.

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m "Add amazing feature"`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Found a bug or have an idea? [Open an issue](https://github.com/VintlGvard/Steam_PricePerHour/issues).

All changes should be made in the `src/` directory. The build system automatically generates browser-specific bundles.

## 📄 License

Released under the [MIT License](LICENSE).

---

<div align="center">

**If this extension saves you money, consider giving it a ⭐**

Made for people who like good deals

</div>
