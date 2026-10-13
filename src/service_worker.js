(() => {
  "use strict";

  const API_BASE = process.env.SPH_API_BASE;
  const API_KEY = process.env.SPH_API_KEY;
  const REQUEST_TIMEOUT_MS = 12000;

  const RATE_LIMIT_WINDOW_MS = 1000;
  const RATE_LIMIT_MAX_REQUESTS = 48;

  const RATE_LIMIT_RETRY_MAX_ATTEMPTS = 3;
  const RATE_LIMIT_RETRY_BASE_MS = 500;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
  const memoryCache = new Map();

  const requestTimestamps = [];

  async function acquireRateLimit() {
    const now = Date.now();
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      const oldestRequest = requestTimestamps[0];
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - oldestRequest);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return acquireRateLimit();
    }

    requestTimestamps.push(now);
  }

  function validatePlaytimeResponse(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.title !== "string") return false;
    if (typeof data.comp_main !== "number") return false;
    if (typeof data.comp_plus !== "number") return false;
    if (typeof data.comp_100 !== "number") return false;
    if (data.comp_main < 0 || data.comp_plus < 0 || data.comp_100 < 0) return false;
    return true;
  }

  function getFromMemoryCache(appId) {
    const entry = memoryCache.get(appId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > MEMORY_CACHE_TTL_MS) {
      memoryCache.delete(appId);
      return null;
    }
    return entry.data;
  }

  function setToMemoryCache(appId, data) {
    memoryCache.set(appId, { data, timestamp: Date.now() });
  }

  async function fetchPlaytime(steamAppId) {
    if (!API_KEY) {
      console.warn("[SPPH] API key is not configured (SPH_API_KEY is empty), skipping request");
      return { ok: false, errorCode: "auth_missing", error: "API key missing" };
    }

    const cached = getFromMemoryCache(steamAppId);
    if (cached) {
      return { ok: true, data: cached };
    }

    const url = `${API_BASE}/api/games/playtime/steam/${steamAppId}`;

    await acquireRateLimit();

    try {
      let resp;
      for (let attempt = 1; attempt <= RATE_LIMIT_RETRY_MAX_ATTEMPTS; attempt++) {
        resp = await fetch(url, {
          method: "GET",
          headers: {
            "X-API-Key": API_KEY,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });

        if (resp.status !== 429 || attempt === RATE_LIMIT_RETRY_MAX_ATTEMPTS) break;
        console.warn(
          "[SPPH] Rate limited (429), retrying in",
          RATE_LIMIT_RETRY_BASE_MS * attempt,
          "ms (attempt",
          attempt,
          ")",
        );
        await sleep(RATE_LIMIT_RETRY_BASE_MS * attempt);
      }

      if (resp.status === 404) {
        return { ok: false, errorCode: "not_found" };
      }

      if (resp.status === 401) {
        console.error("[SPPH] Auth missing (401)");
        return { ok: false, errorCode: "auth_missing", error: "API key missing" };
      }

      if (resp.status === 403) {
        console.error("[SPPH] Auth invalid (403)");
        return { ok: false, errorCode: "auth_invalid", error: "API key invalid" };
      }

      if (resp.status === 429) {
        console.error("[SPPH] Rate limited (429)");
        return { ok: false, errorCode: "rate_limited", error: "Rate limit exceeded" };
      }

      if (!resp.ok) {
        console.error("[SPPH] HTTP error:", resp.status);
        return { ok: false, errorCode: "http_" + resp.status, error: `HTTP ${resp.status}` };
      }

      const data = await resp.json();

      if (!validatePlaytimeResponse(data)) {
        console.error("[SPPH] Invalid response structure:", data);
        return {
          ok: false,
          errorCode: "invalid_response",
          error: "Invalid API response structure",
        };
      }

      setToMemoryCache(steamAppId, data);

      return { ok: true, data };
    } catch (err) {
      console.error("[SPPH] Fetch error:", err);
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        return { ok: false, errorCode: "timeout", error: "Request timeout" };
      }
      return { ok: false, errorCode: "network_error", error: err.message || "Network error" };
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return false;

    if (msg.type === "spphBySteamApp" && msg.steamAppId) {
      if (!sender.tab || !sender.tab.id || !sender.tab.url) return false;

      let isSteamTab = false;
      try {
        const u = new URL(sender.tab.url);
        isSteamTab =
          u.protocol === "https:" &&
          (u.hostname === "store.steampowered.com" || u.hostname === "steampowered.com");
      } catch {}

      if (!isSteamTab) return false;

      fetchPlaytime(msg.steamAppId).then(sendResponse);
      return true;
    }

    if (msg.type === "spphBatchRequest" && Array.isArray(msg.steamAppIds)) {
      if (!sender.tab || !sender.tab.id || !sender.tab.url) return false;

      let isSteamTab = false;
      try {
        const u = new URL(sender.tab.url);
        isSteamTab =
          u.protocol === "https:" &&
          (u.hostname === "store.steampowered.com" || u.hostname === "steampowered.com");
      } catch {}

      if (!isSteamTab) return false;

      Promise.all(msg.steamAppIds.map((id) => fetchPlaytime(id))).then(sendResponse);
      return true;
    }

    return false;
  });
})();
