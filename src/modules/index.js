export { eventBus, EVENT_NAMES } from "./events.js";
export { settingsManager, DEFAULTS, VALID_MODES, VALID_LANGUAGES } from "./settings.js";
export { cacheManager, TTL_FOUND, TTL_NOTFOUND } from "./cache.js";
export {
  secondsToHours,
  fmtH,
  clamp,
  normalizeName,
  numericId,
  debounce,
  throttle,
  isSteamUrl,
  extractAppIdFromUrl,
  isAppPage,
  isBundlePage,
} from "./utils.js";
export {
  parsePriceText,
  extractPrice,
  extractBundlePrice,
  extractSteamAppId,
  extractTitle,
  findPriceAnchor,
  extractAppPageAppId,
  extractAppPageTitle,
  SELECTORS,
  CURRENCY_TOKENS,
  CURRENCY_CODES,
} from "./parser.js";
export {
  createBadge,
  createPlaceholderBadge,
  createErrorBadge,
  insertBadgeInPurchaseArea,
  getBadgeMeta,
  setBadgeMeta,
} from "./badge.js";
export { domObserver, OBSERVER_DEBOUNCE_MS, OBSERVER_THROTTLE_MS } from "./observer.js";
export {
  fetchPlaytime,
  fetchPlaytimeBatch,
  validatePlaytimeResponse,
  validateBatchResponse,
} from "./api.js";
