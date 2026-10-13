import { eventBus, EVENT_NAMES } from "./events.js";

const API_BASE = process.env.SPH_API_BASE;
const API_KEY = process.env.SPH_API_KEY;
const REQUEST_TIMEOUT_MS = 12000;

const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_REQUESTS = 48;

const RATE_LIMIT_RETRY_MAX_ATTEMPTS = 3;
const RATE_LIMIT_RETRY_BASE_MS = 500;

class RateLimiter {
  constructor(maxRequests, windowMs) {
    this._maxRequests = maxRequests;
    this._windowMs = windowMs;
    this._requests = [];
  }

  async acquire() {
    const now = Date.now();
    this._requests = this._requests.filter((t) => now - t < this._windowMs);

    if (this._requests.length >= this._maxRequests) {
      const oldestRequest = this._requests[0];
      const waitTime = this._windowMs - (now - oldestRequest);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
      return this.acquire();
    }

    this._requests.push(now);
  }
}

const rateLimiter = new RateLimiter(RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function validatePlaytimeResponse(data) {
  if (!data || typeof data !== "object") return false;

  const requiredFields = ["title", "comp_main", "comp_plus", "comp_100"];
  for (const field of requiredFields) {
    if (!(field in data)) return false;
  }

  if (typeof data.title !== "string") return false;
  if (typeof data.comp_main !== "number") return false;
  if (typeof data.comp_plus !== "number") return false;
  if (typeof data.comp_100 !== "number") return false;

  if (data.comp_main < 0 || data.comp_plus < 0 || data.comp_100 < 0) return false;

  return true;
}

function validateBatchResponse(data) {
  if (!data || typeof data !== "object") return false;
  if (!Array.isArray(data.games)) return false;

  for (const game of data.games) {
    if (!validatePlaytimeResponse(game)) return false;
  }

  return true;
}

export async function fetchPlaytime(steamAppId) {
  if (!API_KEY) {
    eventBus.emit(EVENT_NAMES.API_RESPONSE, { type: "single", steamAppId, status: "auth_missing" });
    return { ok: false, errorCode: "auth_missing", error: "API key missing" };
  }

  eventBus.emit(EVENT_NAMES.API_REQUEST, { type: "single", steamAppId });

  await rateLimiter.acquire();

  const url = `${API_BASE}/api/games/playtime/steam/${steamAppId}`;

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
      await sleep(RATE_LIMIT_RETRY_BASE_MS * attempt);
    }

    if (resp.status === 404) {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, { type: "single", steamAppId, status: "not_found" });
      return { ok: false, errorCode: "not_found" };
    }

    if (resp.status === 401) {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, {
        type: "single",
        steamAppId,
        status: "auth_missing",
      });
      return { ok: false, errorCode: "auth_missing", error: "API key missing" };
    }

    if (resp.status === 403) {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, {
        type: "single",
        steamAppId,
        status: "auth_invalid",
      });
      return { ok: false, errorCode: "auth_invalid", error: "API key invalid" };
    }

    if (resp.status === 429) {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, {
        type: "single",
        steamAppId,
        status: "rate_limited",
      });
      return { ok: false, errorCode: "rate_limited", error: "Rate limit exceeded" };
    }

    if (!resp.ok) {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, {
        type: "single",
        steamAppId,
        status: "http_error",
        code: resp.status,
      });
      return { ok: false, errorCode: "http_" + resp.status, error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();

    if (!validatePlaytimeResponse(data)) {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, {
        type: "single",
        steamAppId,
        status: "invalid_response",
      });
      return { ok: false, errorCode: "invalid_response", error: "Invalid API response structure" };
    }

    eventBus.emit(EVENT_NAMES.API_RESPONSE, { type: "single", steamAppId, status: "success" });
    return { ok: true, data };
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      eventBus.emit(EVENT_NAMES.API_RESPONSE, { type: "single", steamAppId, status: "timeout" });
      return { ok: false, errorCode: "timeout", error: "Request timeout" };
    }
    eventBus.emit(EVENT_NAMES.API_RESPONSE, {
      type: "single",
      steamAppId,
      status: "network_error",
    });
    return { ok: false, errorCode: "network_error", error: err.message || "Network error" };
  }
}

export async function fetchPlaytimeBatch(steamAppIds) {
  if (!steamAppIds || steamAppIds.length === 0) {
    return { ok: true, data: [] };
  }

  const ids = steamAppIds.slice(0, 100);

  if (!API_KEY) {
    eventBus.emit(EVENT_NAMES.API_RESPONSE, {
      type: "batch",
      count: ids.length,
      status: "auth_missing",
    });
    return { ok: false, errorCode: "auth_missing", error: "API key missing" };
  }

  eventBus.emit(EVENT_NAMES.API_REQUEST, { type: "batch", count: ids.length });

  await rateLimiter.acquire();

  const url = `${API_BASE}/api/games/batch?steam_ids=${ids.join(",")}`;

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
      return { ok: false, errorCode: "http_" + resp.status, error: `HTTP ${resp.status}` };
    }

    const data = await resp.json();

    if (!validateBatchResponse(data)) {
      return { ok: false, errorCode: "invalid_response", error: "Invalid API response structure" };
    }

    eventBus.emit(EVENT_NAMES.API_RESPONSE, {
      type: "batch",
      count: ids.length,
      status: "success",
    });
    return { ok: true, data: data.games };
  } catch (err) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return { ok: false, errorCode: "timeout", error: "Request timeout" };
    }
    return { ok: false, errorCode: "network_error", error: err.message || "Network error" };
  }
}

export { validatePlaytimeResponse, validateBatchResponse };
