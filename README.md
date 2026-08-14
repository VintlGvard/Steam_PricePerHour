<div align="center">

<img src="Chrome/image.png" alt="Steam PricePerHour" width="96" height="96" />

# Steam PricePerHour

**Smart value insights for Steam: shows a price/hour ratio badge on every game you're considering.**

[![Version](https://img.shields.io/badge/version-1.3.2-blue.svg)](https://github.com/VintlGvard/Steam_PricePerHour)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-4285F4.svg)](#-install)
[![Firefox](https://img.shields.io/badge/Firefox-MV2-FF7139.svg)](#-install)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/VintlGvard/Steam_PricePerHour/pulls)

No accounts. No backend. No telemetry. Just open Steam and see whether that game is actually worth the money.

[Features](#-features) • [Install](#-install) • [Settings](#-settings) • [How It Works](#-how-it-works) • [Project Structure](#-project-structure) • [Privacy](#-privacy--security) • [Limitations](#-limitations) • [Development](#-development) • [Contributing](#-contributing) • [License](#-license)

</div>

---

## 💡 Why?

Steam tells you what a game costs, but not what it's worth. The sticker price alone is a poor basis for comparison, since value depends on how many hours of playtime that money buys. This extension adds a **price/hour ratio badge** directly to Steam's own pages, powered by playtime data from [HowLongToBeat](https://howlongtobeat.com), so you can evaluate any game's value at a glance without leaving the store.

## ✨ Features

| | |
|---|---|
| 🔍 **Search results** | Ratio badges on every row in Steam search results |
| 🏠 **Home & storefront** | Coverage for home spotlight capsules and sale capsules on the storefront |
| 🏷️ **Sales** | Badges on discounted capsules so you can tell a real deal from a fake one |
| 🧩 **Bundles** | Bundle pricing aggregated from bundled items, including dedicated `/bundle/N` pages |
| 🎮 **Game pages** | Main-store badge on individual game pages (`/app/N`) |
| 📦 **DLC rows** | Separate badges on DLC purchase rows |
| 💹 **Price/hour ratio** | Calculated as price ÷ playtime for the selected value mode |
| 💱 **Currency parsing** | Detects common currency symbols and ISO codes directly from the page; falls back to the raw `¤` placeholder when a currency can't be identified |
| 🕘 **Value modes** | Main story / Story + Extras / Full completion — switch which playtime drives the badge |
| 💾 **Cache-only mode** | Toggle off the network and use only previously cached playtime data |
| ⏳ **Cache TTL** | Found entries cached for 7 days, "not found" results for 48 hours; one-click **Clear cache** in the popup |
| 🌐 **EN/RU UI** | Popup is fully localized in English and Russian |
| 💾 **Auto-save** | Every setting is saved to `storage.local` immediately and applies to already-open Steam tabs |

## 🚀 Install

### Chrome / Chromium

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked** and select the `Chrome/` folder from this repository
4. The extension icon appears in the toolbar — pin it and open a Steam page

### Firefox

**Option A — packaged (recommended):**

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `releases/steam-priceperhour-firefox.xpi`

> ⚠️ Temporary add-ons are removed when Firefox restarts. Reinstall after each restart.

**Option B — unpacked folder:**

1. In `about:config`, set `xpinstall.signatures.required` to `false` (required only for unpacked/unsigned installs)
2. Open `about:debugging#/runtime/this-firefox`
3. Click **Load Temporary Add-on…** and select the `Firefox/manifest.json` file

## ⚙️ Settings

All settings live in the popup and are saved automatically as you change them.

| Setting | Description |
|---|---|
| **Calculation toggle** | **On** — full mode: cache + live data updates. **Off** — *cache only*: network requests are disabled, badges use previously cached playtime data |
| **Value mode** | Which playtime figure drives the ratio: **Story** (main), **Story + Extras**, or **Full completion** |
| **Acceptable price** | Your "reasonable" price-per-hour threshold (default `20`). The scale's center band is your acceptable ±20% target range; lower is better |
| **Language** | Popup UI language — English or Russian |
| **Clear cache** | One click wipes all cached playtime entries (`spph_cache_*`, `spph_nf_*` keys) |

## 🛠 How It Works

1. The **content script** runs on `store.steampowered.com/*` and `steampowered.com/*` and detects game cards: search rows, sale capsules, home spotlight, bundle wrappers, app pages and DLC rows.
2. For each game it reads the title and the displayed price (parsing currency symbols/ISO codes, discount final price, DLC price, or full bundle price).
3. A **bridge script** (`spph_bridge.js`, running on `howlongtobeat.com/*`) answers playtime lookups against HLTB's JSON API (`/api/bleed/init` + `/api/bleed`) from within an authorized HLTB tab context.
4. Playtime results are cached in `storage.local`; the badge shows `price ÷ hours` for the active value mode.
5. The **service worker** coordinates storage, tab messages and cache logic between the popup and the content scripts.

```
┌───────────────┐   messages    ┌──────────────────┐   storage    ┌──────────────┐
│  content.js   │ ────────────▶ │  service_worker  │ ───────────▶ │ storage.local│
│ (Steam pages) │               └──────────────────┘              │  (cache+cfg) │
└──────┬────────┘                      ▲                          └──────────────┘
       │  playtime lookup               │ popup settings
       ▼                                │
┌───────────────┐              ┌───────────────┐
│ spph_bridge.js│              │   popup.js    │
│  (HLTB page)  │              │ (toolbar popup│
└───────────────┘              │   EN/RU, TTL) │
                               └───────────────┘
```

## 📂 Project Structure

```
Steam_PricePerHour/
├── Chrome/                       # Chromium build (Manifest V3)
│   ├── manifest.json             # MV3 manifest: permissions, content scripts, worker
│   ├── content.js                # badge engine for all Steam page types
│   ├── service_worker.js         # MV3 background: storage, tab coordination, cache
│   ├── popup.html / popup.js / popup.css
│   ├── styles.css                # badge + tooltip styles injected into Steam pages
│   ├── spph_bridge.js            # HLTB API bridge (injected on howlongtobeat.com)
│   └── image.png                 # extension icon / README logo
├── Firefox/                      # Firefox build (Manifest V2, same codebase)
│   └── …                         # mirrored files with an MV2 manifest
├── releases/
│   └── steam-priceperhour-firefox.xpi   # packaged Firefox add-on
└── README.md
```

Both builds share the same logic — only the manifest and small MV2/MV3 compatibility shims differ.

## 🔒 Privacy & Security

- **Local storage only** — settings and cached playtime data live in `chrome.storage.local` (browser-only, no sync, no cloud).
- **Two request domains only** — the extension talks to `store.steampowered.com` (to read page data it already needs) and `howlongtobeat.com` (playtime search API). Nothing else, ever.
- **No backend, no analytics, no tracking** — there is no telemetry, no third-party CDNs, no external beacons. Permission scope is limited to `storage` and `tabs` plus the two domains above.
- **Cache-only mode** — turn the toggle off and the extension makes zero network requests.

## ⚠️ Limitations

- **Steam DOM changes** — badges depend on Steam's markup (CSS selectors like `.search_result_row`, `.sale_capsule_target`, `.game_area_dlc_row`, `[data-ds-bundle-data]`). If Valve ships a redesign, some selectors may silently break until the extension is updated.
- **HowLongToBeat availability** — a game without an HLTB entry shows no ratio; the "not found" result is cached for 48 hours so the store keeps working without repeat requests.
- **Bundle items without titles** — some bundle payloads (from `data-ds-bundle-data`) list items without readable titles; those items are skipped, so the bundle aggregate may cover only part of the bundle.
- **Cache freshness** — playtime data is cached for up to 7 days and only refreshed when the badge is rendered for a cached game or cache is cleared manually.

## 🔧 Development

The extension is plain JavaScript with no build step and no `package.json` — there are **no npm scripts**.

Available validation (requires Node.js):

```bash
node --check Chrome/content.js
node --check Chrome/service_worker.js
node --check Chrome/popup.js
node --check Chrome/spph_bridge.js
```

The same checks apply to the mirrored files under `Firefox/`. Then load the folder as an unpacked extension (see [Install](#-install)) and test on `store.steampowered.com`.

## 🤝 Contributing

Contributions are welcome!

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m "Add amazing feature"`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

Found a bug or have an idea? [Open an issue](https://github.com/VintlGvard/Steam_PricePerHour/issues).

Please keep changes in both `Chrome/` and `Firefox/` builds in sync when you touch shared logic.

## 📄 License

No license has been added to this project yet — all rights reserved by default. If you plan to use or redistribute the code, please open an issue or reach out to the author.

## 🙏 Acknowledgments

- [HowLongToBeat](https://howlongtobeat.com) — the playtime data that makes the price/hour ratio possible

---

<div align="center">

**If this extension saves you money, consider giving it a ⭐**

Made for people who like good deals

</div>
