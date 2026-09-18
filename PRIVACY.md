# Privacy Policy

**Extension:** Steam PricePerHour
**Effective date:** September 7, 2026

## Scope

This policy applies to the Steam PricePerHour browser extension for Chromium-based browsers and Firefox. It describes how the extension handles data when installed and in use.

## Data Handling

Steam PricePerHour does not collect, store, sell, or share personal data. It does not use analytics, advertising, tracking, or fingerprinting.

The extension does use a developer-operated backend: the **SPPH API** at `https://spph.vintlgvard.com`. This is a plain data API that serves game playtime statistics; it does not perform analytics on requests, and no user profiles, identifiers, or behavior histories are collected or stored by the developer.

## Local Storage and Cache

All settings and cached data are stored exclusively in the browser's `storage.local` area, on the user's device, including cache entries keyed as `spph_cache_*` (game titles, cached playtime hours), `spph_nf_*` ("not found" markers, memory-only) and user settings (display mode, language, price threshold). Nothing else is transmitted or stored.

## Requests to Steam and SPPH API

To provide price-per-hour information, the extension sends requests to two services:

- **Steam** (`store.steampowered.com`) — to obtain game price information.
- **SPPH API** (`spph.vintlgvard.com`) — to obtain playtime information. Requests are sent from the user's browser directly to this developer-operated API with the header `X-API-Key` (a build-time static access key) and include only the Steam AppID of the game being viewed (e.g. `/api/games/playtime/steam/{appid}`).

These requests are required for the extension's core functionality. Only the Steam AppID is sent to the SPPH API; no personal data, browsing history, Steam credentials, or account information is transmitted.

## Data Retention and Control

Cached entries expire automatically: results obtained from the SPPH API are retained for up to seven days, while "not found" results are not persisted (memory-only for the current session) — a page reload always retries the API. Expired entries are re-fetched when needed, and rate-limited (HTTP 429) requests are retried up to three times with a linear backoff.

Users can control the data stored by the extension:

- All cached data can be cleared at any time using the "Clear cache" button in the popup.
- Because all data is stored in `storage.local`, uninstalling the extension removes its stored data.

## No Sharing or Sale

The extension does not sell, share, or otherwise disclose personal data to third parties. The only external communications are the requests to Steam and SPPH API described above, which are required for the extension's functionality.

## Changes to This Policy

If this policy changes, this page will be updated and the effective date shown above will be revised accordingly.

## Contact and Repository

For questions, issues, or source code, see the repository:

<https://github.com/VintlGvard/Steam_PricePerHour>
