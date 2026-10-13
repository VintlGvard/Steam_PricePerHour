import { eventBus, EVENT_NAMES } from "./events.js";

const CACHE_PREFIX = "spph_cache_v4_app_";
const CACHE_NOTFOUND = "spph_nf_v4_app_";
const CACHE_PREFIX_LEGACY = "spph_cache_v3_";
const CACHE_NOTFOUND_LEGACY = "spph_nf_v3_";
const EPOCH_MARKER = "spph_cache_epoch";

const TTL_FOUND = 7 * 24 * 60 * 60 * 1000;
const TTL_NOTFOUND = 0;

class CacheManager {
  constructor() {
    this._memoryCache = new Map();
    this._memoryNfCache = new Set();
  }

  appIdCacheKey(appId) {
    return CACHE_PREFIX + appId;
  }

  appIdNfKey(appId) {
    return CACHE_NOTFOUND + appId;
  }

  async getCacheByAppId(appId) {
    appId = String(appId);
    const memory = this._memoryCache.get(appId);
    if (memory && Date.now() - memory.timestamp <= TTL_FOUND) return memory;
    this._memoryCache.delete(appId);

    const key = this.appIdCacheKey(appId);
    try {
      const data = await chrome.storage.local.get([key]);
      const entry = data[key];
      if (!entry || !entry.timestamp) return null;
      if (Date.now() - entry.timestamp > TTL_FOUND) return null;
      if (entry.main === null && entry.plus === null) return null;

      this._memoryCache.set(appId, entry);
      return entry;
    } catch {
      return null;
    }
  }

  async setCacheByAppId(appId, main, plus, completionist) {
    appId = String(appId);
    const key = this.appIdCacheKey(appId);
    const entry = { main, plus, completionist: completionist || 0, timestamp: Date.now() };

    this._memoryCache.set(appId, entry);

    try {
      await chrome.storage.local.set({ [key]: entry });
      eventBus.emit(EVENT_NAMES.CACHE_UPDATED, { appId, entry });
    } catch {}
  }

  async getNotFoundByAppId(appId) {
    appId = String(appId);
    if (this._memoryNfCache.has(appId)) {
      return true;
    }

    const key = this.appIdNfKey(appId);
    try {
      const data = await chrome.storage.local.get([key]);
      const entry = data[key];
      if (!entry || !entry.timestamp) return false;
      if (Date.now() - entry.timestamp < TTL_NOTFOUND) {
        this._memoryNfCache.add(appId);
        return true;
      }
    } catch {}
    return false;
  }

  async markNotFoundByAppId(appId) {
    this._memoryNfCache.add(String(appId));
  }

  nameCacheKey(name) {
    return CACHE_PREFIX_LEGACY + this.normalizeName(name);
  }

  nameNfKey(name) {
    return CACHE_NOTFOUND_LEGACY + this.normalizeName(name);
  }

  normalizeName(raw) {
    if (!raw) return "";
    return raw
      .replace(/[\u2122\u00AE\u00A9]/g, "")
      .replace(/[:;!?.\-,/\\'"„""–—]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  async getCacheByName(name) {
    const key = this.nameCacheKey(name);
    try {
      const data = await chrome.storage.local.get([key]);
      const entry = data[key];
      if (!entry || !entry.timestamp) return null;
      if (Date.now() - entry.timestamp > TTL_FOUND) return null;
      if (entry.main === null && entry.plus === null) return null;
      return entry;
    } catch {
      return null;
    }
  }

  async getNotFoundByName(name) {
    const key = this.nameNfKey(name);
    try {
      const data = await chrome.storage.local.get([key]);
      const entry = data[key];
      if (!entry || !entry.timestamp) return false;
      if (Date.now() - entry.timestamp < TTL_NOTFOUND) return true;
    } catch {}
    return false;
  }

  async getCachedHours(steamAppId, gameName) {
    if (steamAppId) {
      const nfApp = await this.getNotFoundByAppId(steamAppId);
      if (nfApp) return { cached: true, data: null };

      const cacheApp = await this.getCacheByAppId(steamAppId);
      if (cacheApp) return { cached: true, data: cacheApp };
    }

    if (gameName) {
      const nfName = await this.getNotFoundByName(gameName);
      if (nfName) return { cached: true, data: null };

      const cacheName = await this.getCacheByName(gameName);
      if (cacheName) return { cached: true, data: cacheName };
    }

    return { cached: false, data: null };
  }

  async clearAll() {
    try {
      const all = await chrome.storage.local.get(null);
      const keys = Object.keys(all).filter(
        (k) => k !== EPOCH_MARKER && (k.startsWith("spph_cache_") || k.startsWith("spph_nf_")),
      );
      await chrome.storage.local.set({ [EPOCH_MARKER]: Date.now() });
      if (keys.length > 0) {
        await chrome.storage.local.remove(keys);
      }
      this._memoryCache.clear();
      this._memoryNfCache.clear();
      return keys.length;
    } catch {
      return 0;
    }
  }

  resetEpoch() {
    this._memoryCache.clear();
    this._memoryNfCache.clear();
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes[EPOCH_MARKER]) cacheManager.resetEpoch();
  for (const key of Object.keys(changes)) {
    if (key.startsWith(CACHE_PREFIX)) {
      cacheManager._memoryCache.delete(key.slice(CACHE_PREFIX.length));
    }
    if (key.startsWith(CACHE_NOTFOUND)) {
      cacheManager._memoryNfCache.delete(key.slice(CACHE_NOTFOUND.length));
    }
  }
});

export const cacheManager = new CacheManager();
export { TTL_FOUND, TTL_NOTFOUND };
