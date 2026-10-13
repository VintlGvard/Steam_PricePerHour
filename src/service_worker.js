(() => {
  "use strict";

  const API_BASE = process.env.SPH_API_BASE;
  const API_KEY = process.env.SPH_API_KEY;
  const REQUEST_TIMEOUT_MS = 12000;
  const RATE_LIMIT_WINDOW_MS = 1000;
  const RATE_LIMIT_MAX_REQUESTS = 48;
  const RATE_LIMIT_RETRY_MAX = 3;
  const RATE_LIMIT_RETRY_BASE_MS = 500;
  const MEMORY_CACHE_TTL_MS = 5 * 60 * 1000;
  const EPOCH_MARKER = "spph_cache_epoch";
  const MAX_BATCH_SIZE = 100;

  let currentEpoch = 0;

  const memoryCache = new Map();
  const inflight = new Map();
  const requestTimestamps = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[EPOCH_MARKER]) {
      currentEpoch++;
      memoryCache.clear();
      inflight.clear();
    }
  });

  function isPositiveInt(id) {
    const n = Number(id);
    return Number.isSafeInteger(n) && n > 0;
  }

  function validatePlaytimeResponse(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.title !== "string") return false;
    if (
      typeof data.comp_main !== "number" ||
      !Number.isFinite(data.comp_main) ||
      data.comp_main < 0
    ) {
      return false;
    }
    if (
      typeof data.comp_plus !== "number" ||
      !Number.isFinite(data.comp_plus) ||
      data.comp_plus < 0
    ) {
      return false;
    }
    if (typeof data.comp_100 !== "number" || !Number.isFinite(data.comp_100) || data.comp_100 < 0) {
      return false;
    }
    return true;
  }

  function validateBatchGame(g) {
    if (!g || typeof g !== "object") return false;
    const appId = g.appId ?? g.appid ?? g.id;
    if (!isPositiveInt(appId)) return false;
    if (typeof g.title !== "string") return false;
    if (typeof g.comp_main !== "number" || !Number.isFinite(g.comp_main) || g.comp_main < 0) {
      return false;
    }
    if (typeof g.comp_plus !== "number" || !Number.isFinite(g.comp_plus) || g.comp_plus < 0) {
      return false;
    }
    if (typeof g.comp_100 !== "number" || !Number.isFinite(g.comp_100) || g.comp_100 < 0) {
      return false;
    }
    return true;
  }

  async function acquireRateLimit() {
    const now = Date.now();
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] >= RATE_LIMIT_WINDOW_MS) {
      requestTimestamps.shift();
    }
    if (requestTimestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
      const waitTime = RATE_LIMIT_WINDOW_MS - (now - requestTimestamps[0]);
      await sleep(Math.max(0, waitTime));
      return acquireRateLimit();
    }
    requestTimestamps.push(now);
  }

  function getMemory(appId) {
    const entry = memoryCache.get(appId);
    if (!entry) return null;
    if (Date.now() - entry.ts > MEMORY_CACHE_TTL_MS) {
      memoryCache.delete(appId);
      return null;
    }
    return { ok: true, data: entry.data };
  }

  function setMemory(appId, data) {
    memoryCache.set(appId, { data, ts: Date.now() });
  }

  async function fetchOne(steamAppId, epoch) {
    if (!isPositiveInt(steamAppId)) return { ok: false, errorCode: "invalid_id" };
    steamAppId = Number(steamAppId);
    if (epoch !== currentEpoch) return null;

    const cached = getMemory(steamAppId);
    if (cached) return cached;

    const dedupKey = `s_${steamAppId}`;
    const existing = inflight.get(dedupKey);
    if (existing) return existing;

    if (!API_KEY) {
      return { ok: false, errorCode: "auth_missing", error: "API key missing" };
    }

    const url = `${API_BASE}/api/games/playtime/steam/${steamAppId}`;
    let result;

    const reqPromise = (async () => {
      let resp;
      for (let attempt = 1; attempt <= RATE_LIMIT_RETRY_MAX; attempt++) {
        if (epoch !== currentEpoch) return null;
        await acquireRateLimit();
        if (epoch !== currentEpoch) return null;

        try {
          resp = await fetch(url, {
            method: "GET",
            headers: { "X-API-Key": API_KEY, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (e) {
          if (e.name === "TimeoutError" || e.name === "AbortError") {
            return { ok: false, errorCode: "timeout", error: "Request timeout" };
          }
          return { ok: false, errorCode: "network_error", error: e.message || "Network error" };
        }

        if (resp.status !== 429 || attempt === RATE_LIMIT_RETRY_MAX) break;
        await sleep(RATE_LIMIT_RETRY_BASE_MS * attempt);
      }

      if (resp.status === 404) return { ok: false, errorCode: "not_found" };
      if (resp.status === 401) {
        return { ok: false, errorCode: "auth_missing", error: "API key missing" };
      }
      if (resp.status === 403) {
        return { ok: false, errorCode: "auth_invalid", error: "API key invalid" };
      }
      if (resp.status === 429) {
        return { ok: false, errorCode: "rate_limited", error: "Rate limit exceeded" };
      }
      if (!resp.ok) {
        return { ok: false, errorCode: "http_" + resp.status, error: "HTTP " + resp.status };
      }

      let data;
      try {
        data = await resp.json();
      } catch {
        return { ok: false, errorCode: "invalid_response" };
      }
      if (!validatePlaytimeResponse(data)) return { ok: false, errorCode: "invalid_response" };

      return { ok: true, data };
    })();

    inflight.set(dedupKey, reqPromise);
    try {
      result = await reqPromise;
    } finally {
      if (inflight.get(dedupKey) === reqPromise) {
        inflight.delete(dedupKey);
      }
    }

    if (result && result.ok && epoch === currentEpoch) {
      setMemory(steamAppId, result.data);
    }
    return epoch === currentEpoch ? result : { ok: false, errorCode: "stale_epoch" };
  }

  async function fetchBatch(steamAppIds, epoch) {
    if (epoch !== currentEpoch) return null;
    if (!Array.isArray(steamAppIds) || steamAppIds.length === 0) {
      return { ok: true, data: [] };
    }

    if (!steamAppIds.every(isPositiveInt)) return { ok: false, errorCode: "invalid_ids" };
    const ids = [...new Set(steamAppIds.map(Number))];

    const results = [];
    for (let i = 0; i < ids.length; i += MAX_BATCH_SIZE) {
      if (epoch !== currentEpoch) return null;
      const chunk = ids.slice(i, i + MAX_BATCH_SIZE);
      const chunkResult = await fetchBatchChunk(chunk, epoch);
      if (!chunkResult) return null;
      if (chunkResult.ok) {
        results.push(...chunkResult.data);
      } else {
        return chunkResult;
      }
    }
    return { ok: true, data: results };
  }

  async function fetchBatchChunk(ids, epoch) {
    if (!API_KEY) return { ok: false, errorCode: "auth_missing", error: "API key missing" };

    const dedupKey = "b_" + ids.slice().sort().join(",");
    const existing = inflight.get(dedupKey);
    if (existing) return existing;

    const url = `${API_BASE}/api/games/batch?steam_ids=${ids.join(",")}`;
    let result;

    const reqPromise = (async () => {
      let resp;
      for (let attempt = 1; attempt <= RATE_LIMIT_RETRY_MAX; attempt++) {
        if (epoch !== currentEpoch) return null;
        await acquireRateLimit();
        if (epoch !== currentEpoch) return null;

        try {
          resp = await fetch(url, {
            method: "GET",
            headers: { "X-API-Key": API_KEY, Accept: "application/json" },
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
        } catch (e) {
          if (e.name === "TimeoutError" || e.name === "AbortError") {
            return { ok: false, errorCode: "timeout", error: "Request timeout" };
          }
          return { ok: false, errorCode: "network_error", error: e.message || "Network error" };
        }

        if (resp.status !== 429 || attempt === RATE_LIMIT_RETRY_MAX) break;
        await sleep(RATE_LIMIT_RETRY_BASE_MS * attempt);
      }

      if (resp.status === 401) {
        return { ok: false, errorCode: "auth_missing", error: "API key missing" };
      }
      if (resp.status === 403) {
        return { ok: false, errorCode: "auth_invalid", error: "API key invalid" };
      }
      if (resp.status === 429) {
        return { ok: false, errorCode: "rate_limited", error: "Rate limit exceeded" };
      }
      if (!resp.ok) {
        return { ok: false, errorCode: "http_" + resp.status, error: "HTTP " + resp.status };
      }

      let data;
      try {
        data = await resp.json();
      } catch {
        return { ok: false, errorCode: "invalid_response" };
      }

      if (!data || !Array.isArray(data.games)) return { ok: false, errorCode: "invalid_response" };

      const games = data.games.filter(validateBatchGame).map((g) => ({
        appId: g.appId ?? g.appid ?? g.id,
        title: g.title,
        comp_main: g.comp_main,
        comp_plus: g.comp_plus,
        comp_100: g.comp_100,
      }));

      return { ok: true, data: games };
    })();

    inflight.set(dedupKey, reqPromise);
    try {
      result = await reqPromise;
    } finally {
      if (inflight.get(dedupKey) === reqPromise) {
        inflight.delete(dedupKey);
      }
    }
    return epoch === currentEpoch ? result : { ok: false, errorCode: "stale_epoch" };
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

      fetchOne(msg.steamAppId, currentEpoch).then((result) => {
        sendResponse(result || { ok: false, errorCode: "stale_epoch" });
      });
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

      fetchBatch(msg.steamAppIds, currentEpoch).then((result) => {
        sendResponse(result || { ok: false, errorCode: "stale_epoch" });
      });
      return true;
    }

    return false;
  });
})();
