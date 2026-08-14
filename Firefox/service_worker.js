(() => {
  "use strict";

  const api = globalThis.browser || globalThis.chrome;

  const HLTB_BASE = "https://howlongtobeat.com";
  const HLTB_INIT = `${HLTB_BASE}/api/bleed/init`;
  const HLTB_API = `${HLTB_BASE}/api/bleed`;
  const REQUEST_TIMEOUT_MS = 12000;
  const MAX_RETRIES = 2;

  function normalizeForSearch(raw) {
    if (!raw) return "";
    return raw
      .replace(/[\u2122\u00AE\u00A9]/g, "")
      .replace(/[:;!\?\.\-,\/\\'"„"«»–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function numericId(val) {
    const n = Number(val);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  async function fetchInit() {
    const t = Date.now();
    try {
      const resp = await fetch(`${HLTB_INIT}?t=${t}`, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "application/json" },
        referrer: "https://howlongtobeat.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!resp.ok) {
        const code = resp.status === 403 ? "init_403" : "init_" + resp.status;
        throw Object.assign(new Error(`HLTB init ${resp.status}`), { errorCode: code });
      }
      const json = await resp.json();
      const hasToken = typeof json?.token === "string";
      const hasHpKey = typeof json?.hpKey === "string";
      const hasHpVal = typeof json?.hpVal === "string";
      if (!hasToken || !hasHpKey || !hasHpVal) {
        throw Object.assign(new Error("HLTB init returned invalid payload"), {
          errorCode: "parse_error",
        });
      }
      return json;
    } catch (e) {
      if (e.errorCode) throw e;
      throw Object.assign(new Error("HLTB init transport error: " + e.message), {
        errorCode: "transport_error",
      });
    }
  }

  function buildSearchBody(gameName, initData) {
    const tokens = normalizeForSearch(gameName).split(/\s+/).filter(Boolean);
    const body = {
      searchType: "games",
      searchTerms: tokens,
      searchPage: 1,
      size: 20,
      searchOptions: {
        games: {
          userId: 0,
          platform: "",
          sortCategory: "popular",
          rangeCategory: "main",
          rangeTime: { min: 0, max: 0 },
          rangeYear: { min: "", max: "" },
          gameplay: { perspective: "", flow: "", genre: "", difficulty: "" },
          modifier: "",
        },
        users: { sortCategory: "postcount" },
        lists: { sortCategory: "follows" },
      },
      filter: "",
      sort: 0,
      randomizer: 0,
      useCache: true,
    };
    if (initData && initData.hpKey && initData.hpVal) {
      body[initData.hpKey] = initData.hpVal;
    }
    return body;
  }

  async function spphSearch(gameName) {
    let lastError = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const init = await fetchInit();
        const body = buildSearchBody(gameName, init);

        const resp = await fetch(HLTB_API, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "X-Auth-Token": init.token,
            "X-Hp-Key": init.hpKey,
            "X-Hp-Val": init.hpVal,
          },
          referrer: "https://howlongtobeat.com/",
          referrerPolicy: "strict-origin-when-cross-origin",
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (!resp.ok) {
          const code = resp.status === 403 ? "search_403" : "search_" + resp.status;
          lastError = Object.assign(
            new Error(`HLTB search ${resp.status}`),
            { errorCode: code }
          );
          if (resp.status === 403) { _directBlocked = true; break; }
          if (attempt < MAX_RETRIES) {
            const delay = 400 * (attempt + 1);
            await new Promise((r) => setTimeout(r, delay));
          }
          continue;
        }

        const data = await resp.json();
        _directBlocked = false;
        return { ok: true, data };
      } catch (err) {
        lastError = err;
        if (err.errorCode === "init_403" || err.errorCode === "search_403") { _directBlocked = true; break; }
        if (attempt < MAX_RETRIES) {
          const delay = 400 * (attempt + 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    const errorCode = lastError && lastError.errorCode
      ? lastError.errorCode
      : "transport_error";
    return {
      ok: false,
      notFound: false,
      error: lastError
        ? String(lastError.message || lastError)
        : "Unknown error",
      errorCode,
    };
  }

  const BRIDGE_TAB_URL = "https://howlongtobeat.com/";
  const BRIDGE_TAB_QUERY = "https://howlongtobeat.com/*";
  const BRIDGE_SEND_MAX_ATTEMPTS = 20;
  const BRIDGE_SEND_BACKOFF_MS = 1000;
  const BRIDGE_SEND_TOTAL_TIMEOUT_MS = 20000;
  const BRIDGE_IDLE_TIMEOUT_MS = 60000;
  const BRIDGE_FALLBACK_CODES = new Set(["init_403", "search_403", "parse_error", "transport_error"]);

  let _bridgeTabId = null;
  let _bridgeOwnTab = false;
  let _bridgeLastUsed = 0;
  let _bridgeIdleTimer = null;
  let _directBlocked = false;

  const _steamTabIds = new Set();

  async function isSteamTabAlive(tabId) {
    try {
      const tab = await api.tabs.get(tabId);
      if (!tab || !tab.url) {
        _steamTabIds.delete(tabId);
        return false;
      }
      const u = new URL(tab.url);
      const alive =
        u.protocol === "https:" &&
        (u.hostname === "store.steampowered.com" || u.hostname === "steampowered.com");
      if (!alive) _steamTabIds.delete(tabId);
      return alive;
    } catch {
      _steamTabIds.delete(tabId);
      return false;
    }
  }

  function cleanupBridge() {
    if (_bridgeTabId && _bridgeOwnTab) {
      const bid = _bridgeTabId;
      try {
        api.tabs.remove(bid);
      } catch {}
    }
    resetBridgeTab("no_steam_tabs");
  }

  function resetBridgeTab(reason) {
    _bridgeTabId = null;
    _bridgeOwnTab = false;
    if (_bridgeIdleTimer) {
      clearTimeout(_bridgeIdleTimer);
      _bridgeIdleTimer = null;
    }
  }

  function scheduleBridgeIdle() {
    if (_bridgeIdleTimer) clearTimeout(_bridgeIdleTimer);
    _bridgeIdleTimer = setTimeout(async () => {
      if (_bridgeTabId && Date.now() - _bridgeLastUsed >= BRIDGE_IDLE_TIMEOUT_MS) {
        if (_bridgeOwnTab) {
          const tabId = _bridgeTabId;
          try {
            await api.tabs.remove(tabId);
          } catch {
          }
        }
        resetBridgeTab("idle_timeout");
      }
    }, BRIDGE_IDLE_TIMEOUT_MS + 1000);
  }

  api.tabs.onRemoved.addListener((tabId) => {
    _steamTabIds.delete(tabId);
    if (tabId === _bridgeTabId) {
      resetBridgeTab("tab_closed");
    }
    if (_steamTabIds.size === 0) {
      cleanupBridge();
    }
  });

  async function ensureBridgeTab() {
    if (_bridgeTabId) {
      try {
        const tab = await api.tabs.get(_bridgeTabId);
        if (tab && tab.id) {
          return _bridgeTabId;
        }
      } catch {
        resetBridgeTab("tab_gone");
      }
    }

    try {
      const existing = await api.tabs.query({ url: BRIDGE_TAB_QUERY });
      if (existing.length > 0) {
        const found = existing[0];
        _bridgeTabId = found.id;
        _bridgeOwnTab = false;
        _bridgeLastUsed = Date.now();
        scheduleBridgeIdle();
        return _bridgeTabId;
      }
    } catch {
    }

    try {
      const tab = await api.tabs.create({
        url: BRIDGE_TAB_URL,
        active: false,
      });
      _bridgeTabId = tab.id;
      _bridgeOwnTab = true;
      _bridgeLastUsed = Date.now();
      scheduleBridgeIdle();
      return _bridgeTabId;
    } catch {
      return null;
    }
  }

  async function searchViaTopLevelBridge(gameName) {
    const t0 = Date.now();
    const bridgeReqId = "swb_" + Math.random().toString(36).slice(2, 8);

    const tabId = await ensureBridgeTab();
    if (!tabId) {
      return { ok: false, errorCode: "transport_error", error: "Bridge tab unavailable" };
    }

    const request = {
      type: "spphPageBridgeRequest",
      gameName,
      requestId: bridgeReqId,
    };

    for (let attempt = 1; attempt <= BRIDGE_SEND_MAX_ATTEMPTS; attempt++) {
      const elapsed = Date.now() - t0;
      if (elapsed > BRIDGE_SEND_TOTAL_TIMEOUT_MS) {
        break;
      }

      try {
        const response = await api.tabs.sendMessage(tabId, request);
        _bridgeLastUsed = Date.now();
        scheduleBridgeIdle();

        if (response && response.ok) {
          return response;
        }
        return response || { ok: false, errorCode: "transport_error", error: "Empty bridge response" };
      } catch {
        if (attempt < BRIDGE_SEND_MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, BRIDGE_SEND_BACKOFF_MS));
        }
      }
    }

    return { ok: false, errorCode: "transport_error", error: "Bridge attempts exhausted" };
  }

  async function searchWithFallback(gameName, steamTabId) {
    if (!_directBlocked) {
      const direct = await spphSearch(gameName);
      if (direct.ok) {
        return direct;
      }

      if (BRIDGE_FALLBACK_CODES.has(direct.errorCode)) {
        if (!(await isSteamTabAlive(steamTabId))) {
          return { ok: false, errorCode: "steam_not_open" };
        }
        const bridgeResult = await searchViaTopLevelBridge(gameName);
        return bridgeResult;
      }

      return direct;
    }

    if (!(await isSteamTabAlive(steamTabId))) {
      return { ok: false, errorCode: "steam_not_open" };
    }
    return searchViaTopLevelBridge(gameName);
  }

  function parseNextData(html) {
    const re = /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>/i;
    const m = html.match(re);
    if (!m) return null;
    const jsonStart = m.index + m[0].length;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    if (jsonEnd === -1) return null;
    try {
      return JSON.parse(html.substring(jsonStart, jsonEnd));
    } catch {
      return null;
    }
  }

  function findGameObject(obj, depth) {
    if (depth == null) depth = 0;
    if (depth > 12 || obj == null || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findGameObject(item, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (obj.game_id != null) return obj;
    for (const key of Object.keys(obj)) {
      const found = findGameObject(obj[key], depth + 1);
      if (found) return found;
    }
    return null;
  }

  async function fetchSPPHPage(gameId) {
    const url = `${HLTB_BASE}/game/${gameId}`;
    try {
      const resp = await fetch(url, {
        method: "GET",
        credentials: "include",
        headers: { Accept: "text/html" },
        referrer: "https://howlongtobeat.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!resp.ok) {
        return null;
      }
      const html = await resp.text();
      const nextData = parseNextData(html);
      if (!nextData) {
        return null;
      }
      try {
        const game0 = nextData?.props?.pageProps?.game?.data?.game?.[0];
        if (game0 && game0.game_id) {
          return game0;
        }
      } catch {}
      const found = findGameObject(nextData);
      return found;
    } catch {
      return null;
    }
  }

  function matchesSteamApp(game, appId) {
    const target = numericId(appId);
    if (!target) return false;
    return (
      numericId(game.profile_steam) === target ||
      numericId(game.profile_steam_alt) === target
    );
  }

  function pickBestByAppId(results, appId) {
    for (const r of results) {
      if (matchesSteamApp(r, appId)) return r;
    }
    return null;
  }

  async function fetchSteamEnglishName(appId) {
    const target = numericId(appId);
    if (!target) return null;
    try {
      const resp = await fetch(
        `https://store.steampowered.com/api/appdetails?appids=${target}&l=english`,
        {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
      if (!resp.ok) return null;
      const json = await resp.json();
      const appData = json?.[String(target)];
      if (appData && appData.success && appData.data) {
        return appData.data.name || null;
      }
      return null;
    } catch {
      return null;
    }
  }

  api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;

    const isSPPHMsg = msg.type === "spphSearch" || msg.type === "spphBySteamApp";
    if (isSPPHMsg) {
      if (!sender.tab || !sender.tab.id || !sender.tab.url) return false;
      let ok = false;
      try {
        const u = new URL(sender.tab.url);
        ok =
          u.protocol === "https:" &&
          (u.hostname === "store.steampowered.com" || u.hostname === "steampowered.com");
      } catch {}
      if (!ok) return false;
      _steamTabIds.add(sender.tab.id);
    }

    if (msg.type === "spphSearch" && msg.gameName) {
      handleSearch(msg.gameName, msg.steamAppId || null, sender.tab.id).then(sendResponse);
      return true;
    }

    if (msg.type === "spphBySteamApp" && msg.steamAppId) {
      handleBySteamApp(msg.steamAppId, msg.gameName || null, sender.tab.id).then(sendResponse);
      return true;
    }

    return false;
  });

  async function handleSearch(gameName, steamAppId, steamTabId) {
    if (!(await isSteamTabAlive(steamTabId))) {
      return { ok: false, errorCode: "steam_not_open" };
    }

    const result = await searchWithFallback(gameName, steamTabId);
    if (!result.ok) {
      return result;
    }

    const results = extractResults(result.data);

    if (!results.length) {
      if (steamAppId) {
        const enName = await fetchSteamEnglishName(steamAppId);
        if (enName && normalizeForSearch(enName) !== normalizeForSearch(gameName)) {
          const retry = await searchWithFallback(enName, steamTabId);
          if (retry.ok) {
            const retryResults = extractResults(retry.data);
            if (retryResults.length) {
              const byApp = pickBestByAppId(retryResults, steamAppId);
              if (byApp) return { ok: true, data: byApp };
              return { ok: true, data: retryResults };
            }
          }
        }
      }
      return { ok: true, data: null, errorCode: "empty_results" };
    }

    if (steamAppId) {
      const byApp = pickBestByAppId(results, steamAppId);
      if (byApp) {
        return { ok: true, data: byApp };
      }
      const enName = await fetchSteamEnglishName(steamAppId);
      if (enName && normalizeForSearch(enName) !== normalizeForSearch(gameName)) {
        const retry = await searchWithFallback(enName, steamTabId);
        if (retry.ok) {
          const retryResults = extractResults(retry.data);
          if (retryResults.length) {
            const byAppRetry = pickBestByAppId(retryResults, steamAppId);
            if (byAppRetry) return { ok: true, data: byAppRetry };
          }
        }
      }
    }

    return { ok: true, data: results };
  }

  async function handleBySteamApp(steamAppId, gameName, steamTabId) {
    if (!gameName) {
      return { ok: true, data: null, errorCode: "not_found_by_steam_app" };
    }

    if (!(await isSteamTabAlive(steamTabId))) {
      return { ok: false, errorCode: "steam_not_open" };
    }

    const searchResult = await searchWithFallback(gameName, steamTabId);
    if (!searchResult.ok) {
      return {
        ok: false,
        error: searchResult.error,
        errorCode: searchResult.errorCode || "transport_error",
      };
    }

    const results = extractResults(searchResult.data);

    if (!results.length) {
      const enName = await fetchSteamEnglishName(steamAppId);
      if (enName && normalizeForSearch(enName) !== normalizeForSearch(gameName)) {
        const retry = await searchWithFallback(enName, steamTabId);
        if (retry.ok) {
          const retryResults = extractResults(retry.data);
          if (retryResults.length) {
            const byApp = pickBestByAppId(retryResults, steamAppId);
            if (byApp) return { ok: true, data: byApp };
            for (const r of retryResults) {
              const gid = numericId(r.game_id);
              if (!gid) continue;
              const pageData = await fetchSPPHPage(gid);
              if (pageData && matchesSteamApp(pageData, steamAppId)) {
                return { ok: true, data: pageData };
              }
            }
          }
        }
      }
      return { ok: true, data: null, errorCode: "not_found_by_steam_app" };
    }

    const byApp = pickBestByAppId(results, steamAppId);
    if (byApp) {
      return { ok: true, data: byApp };
    }

    const enName = await fetchSteamEnglishName(steamAppId);
    if (enName && normalizeForSearch(enName) !== normalizeForSearch(gameName)) {
      const retry = await searchWithFallback(enName, steamTabId);
      if (retry.ok) {
        const retryResults = extractResults(retry.data);
        if (retryResults.length) {
          const byAppRetry = pickBestByAppId(retryResults, steamAppId);
          if (byAppRetry) return { ok: true, data: byAppRetry };
        }
      }
    }

    for (const r of results) {
      const gid = numericId(r.game_id);
      if (!gid) continue;
      const pageData = await fetchSPPHPage(gid);
      if (pageData && matchesSteamApp(pageData, steamAppId)) {
        return { ok: true, data: pageData };
      }
    }

    return { ok: true, data: null, errorCode: "not_found_by_steam_app" };
  }

  function extractResults(json) {
    if (!json || typeof json !== "object") return [];
    if ((json.error || json.message) && !json.data) return [];

    if (Array.isArray(json)) return json;
    if (Array.isArray(json.results)) return json.results;
    if (Array.isArray(json.games)) return json.games;

    const d = json.data;
    if (d == null) return [];

    if (Array.isArray(d)) return d;

    if (d.game) {
      if (Array.isArray(d.game)) return d.game;
      if (typeof d.game === "object") return [d.game];
    }

    if (Array.isArray(d.results)) return d.results;
    if (Array.isArray(d.games)) return d.games;

    if (typeof d === "object" && (d.game_name || d.comp_name)) return [d];

    return [];
  }
})();
